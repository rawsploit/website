/* =====================================================================
   QR codes (assets/qr.js)
   A small QR code maker following ISO/IEC 18004: byte mode, error
   correction M, versions 1 to 20 chosen automatically. Works offline,
   no outside service. Used for UPI payment QR codes on bills.

   QR.matrix(text)        -> array of rows of true (dark) / false
   QR.svg(text, px)       -> SVG markup (with the 4-module quiet zone)
   QR.upiLink(o)          -> "upi://pay?pa=...&pn=...&am=...&cu=INR&tn=..."
   QR.raster(text, scale) -> { width, height, bytes } 1-bit image rows for printers

   Designed by rawsploit@gmail.com
===================================================================== */
(function () {
  "use strict";

  // error correction level M: codewords per block, and number of blocks, for versions 1..20
  var ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  var NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  var FORMAT_M = 0; // format bits for level M

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { var na = Math.floor(ver / 7) + 2; r -= (25 * na - 10) * na - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(ver) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver]; }

  /* ---------- Reed-Solomon over GF(256), polynomial 0x11D ---------- */
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function rsDivisor(deg) {
    var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (var i2 = 0; i2 < deg; i2++) {
      for (var j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gfMul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function (c, i) { r[i] ^= gfMul(c, f); });
    });
    return r;
  }

  function utf8(text) {
    var out = [], s = unescape(encodeURIComponent(text));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function encode(text) {
    var bytes = utf8(text), ver;
    for (ver = 1; ver <= 20; ver++) {
      var cap = dataCodewords(ver) * 8, countBits = ver <= 9 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 <= cap) break;
    }
    if (ver > 20) throw new Error("Too much text for a QR code.");
    var bits = [];
    function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
    put(4, 4); put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    var capBits = dataCodewords(ver) * 8;
    put(0, Math.min(4, capBits - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; data.push(v); }

    // split into blocks, add error correction, interleave
    var nb = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen), blocks = [], at = 0;
    for (var b = 0; b < nb; b++) {
      var len = shortLen - eccLen + (b < nShort ? 0 : 1), dat = data.slice(at, at + len); at += len;
      var ecc = rsRemainder(dat, div);
      if (b < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var all = [];
    for (var ci = 0; ci < blocks[0].length; ci++)
      for (var bj = 0; bj < blocks.length; bj++)
        if (ci !== shortLen - eccLen || bj >= nShort) all.push(blocks[bj][ci]);
    return { ver: ver, codewords: all };
  }

  function build(text) {
    var e = encode(text), ver = e.ver, size = ver * 4 + 17;
    var m = [], fn = [];
    for (var y = 0; y < size; y++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function set(x, y2, dark) { m[y2][x] = dark; fn[y2][x] = true; }

    for (var i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

    // alignment patterns
    var pos = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      pos = [6];
      for (var p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
    }
    pos.forEach(function (ay, ii) {
      pos.forEach(function (ax, jj) {
        if ((ii === 0 && jj === 0) || (ii === 0 && jj === pos.length - 1) || (ii === pos.length - 1 && jj === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });

    function formatBits(mask) {
      var data = (FORMAT_M << 3) | mask, rem = data;
      for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = ((data << 10) | rem) ^ 0x5412;
      function bit(n) { return ((bits >>> n) & 1) !== 0; }
      for (var q = 0; q <= 5; q++) set(8, q, bit(q));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (var q2 = 9; q2 < 15; q2++) set(14 - q2, 8, bit(q2));
      for (var q3 = 0; q3 < 8; q3++) set(size - 1 - q3, 8, bit(q3));
      for (var q4 = 8; q4 < 15; q4++) set(8, size - 15 + q4, bit(q4));
      set(8, size - 8, true);
    }
    formatBits(0); // reserve the area

    if (ver >= 7) {
      var rem = ver;
      for (var k = 0; k < 12; k++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem;
      for (var t = 0; t < 18; t++) {
        var on = ((vb >>> t) & 1) !== 0, a = size - 11 + t % 3, bb = Math.floor(t / 3);
        set(a, bb, on); set(bb, a, on);
      }
    }

    // data in the zigzag
    var idx = 0, cw = e.codewords;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
        var x = right - j, up = ((right + 1) & 2) === 0, yy = up ? size - 1 - vert : vert;
        if (!fn[yy][x] && idx < cw.length * 8) { m[yy][x] = ((cw[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0; idx++; }
      }
    }

    var MASKS = [
      function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; },
      function (x) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
    ];
    function applyMask(k) {
      for (var y3 = 0; y3 < size; y3++) for (var x3 = 0; x3 < size; x3++) if (!fn[y3][x3] && MASKS[k](x3, y3)) m[y3][x3] = !m[y3][x3];
    }
    function penalty() {
      var score = 0, dark = 0;
      for (var a2 = 0; a2 < size; a2++) {
        var runR = 1, runC = 1;
        for (var b2 = 0; b2 < size; b2++) {
          if (m[a2][b2]) dark++;
          if (b2 > 0) {
            if (m[a2][b2] === m[a2][b2 - 1]) { runR++; if (runR === 5) score += 3; else if (runR > 5) score++; } else runR = 1;
            if (m[b2][a2] === m[b2 - 1][a2]) { runC++; if (runC === 5) score += 3; else if (runC > 5) score++; } else runC = 1;
          }
          if (a2 > 0 && b2 > 0 && m[a2][b2] === m[a2 - 1][b2] && m[a2][b2] === m[a2][b2 - 1] && m[a2][b2] === m[a2 - 1][b2 - 1]) score += 3;
        }
      }
      score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return score;
    }
    var best = 0, bestScore = Infinity;
    for (var k2 = 0; k2 < 8; k2++) {
      applyMask(k2); formatBits(k2);
      var sc = penalty();
      if (sc < bestScore) { bestScore = sc; best = k2; }
      applyMask(k2);
    }
    applyMask(best); formatBits(best);
    return m;
  }

  function svg(text, px) {
    var m = build(text), n = m.length, q = 4, total = n + q * 2, d = "";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) d += "M" + (x + q) + " " + (y + q) + "h1v1h-1z";
    px = px || 200;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + " " + total + '" width="' + px + '" height="' + px +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  /* 1-bit image for receipt printers: each row is ceil(width/8) bytes, dark = 1 */
  function raster(text, scale) {
    var m = build(text), n = m.length, q = 2, w = (n + q * 2) * scale, h = w, rowBytes = Math.ceil(w / 8), out = new Uint8Array(rowBytes * h);
    for (var y = 0; y < h; y++) {
      var my = Math.floor(y / scale) - q;
      for (var x = 0; x < w; x++) {
        var mx = Math.floor(x / scale) - q;
        if (my >= 0 && my < n && mx >= 0 && mx < n && m[my][mx]) out[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return { width: w, height: h, rowBytes: rowBytes, bytes: out };
  }

  /* UPI payment link (NPCI deep-link format). o: { upi, name, amount, note } */
  function upiLink(o) {
    var enc = function (v) { return encodeURIComponent(String(v)).replace(/[!'()*]/g, function (c) { return "%" + c.charCodeAt(0).toString(16).toUpperCase(); }); };
    var s = "upi://pay?pa=" + enc(o.upi).replace(/%40/g, "@") + "&pn=" + enc(String(o.name || "").slice(0, 50));
    if (o.amount && Number(o.amount) > 0) s += "&am=" + Number(o.amount).toFixed(2);
    s += "&cu=INR";
    if (o.note) s += "&tn=" + enc(String(o.note).slice(0, 50));
    return s;
  }

  window.QR = { matrix: build, svg: svg, raster: raster, upiLink: upiLink };
})();
