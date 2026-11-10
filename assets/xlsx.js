/* ============================================================
   Tiny Excel (.xlsx) writer, no libraries.
   Kalavara report standard: header on row 1 (bold, frozen, with
   filters), one complete record per row, real dates and numbers,
   no merged cells, no total rows inside the data. Report details
   and totals go on a separate "About" sheet.
   Designed by rawsploit@gmail.com
   ============================================================ */
(function () {
  "use strict";

  /* ---------- zip (stored, no compression) ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {                       // files: [{name, data: Uint8Array}]
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var u16 = function (v) { return [v & 255, (v >>> 8) & 255]; };
    var u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size), u16(name.length), u16(0));
      parts.push(new Uint8Array(local), name, f.data);
      central.push([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)), name);
      offset += local.length + name.length + size;
    });
    var cdStart = offset, cdSize = 0;
    central.forEach(function (c) { var b = c instanceof Uint8Array ? c : new Uint8Array(c); parts.push(b); cdSize += b.length; });
    parts.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(cdStart), u16(0))));
    return new Blob(parts, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* ---------- xml helpers ---------- */
  function x(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function colName(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function serial(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ""));
    if (!m) return null;
    return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5;
  }

  /* style ids (see styles below): 0 text, 1 header, 2 date, 3 money, 4 number, 5 about label */
  var STYLE = { text: 0, header: 1, date: 2, money: 3, number: 4, label: 5 };

  function cell(ref, v, type) {
    if (v === null || v === undefined || v === "") return "";
    if (type === "date") { var d = serial(v); if (d !== null) return '<c r="' + ref + '" s="2"><v>' + d + "</v></c>"; }
    if ((type === "money" || type === "number") && typeof v === "number" && isFinite(v)) {
      return '<c r="' + ref + '" s="' + (type === "money" ? 3 : 4) + '"><v>' + v + "</v></c>";
    }
    if (typeof v === "number" && isFinite(v) && !type) return '<c r="' + ref + '" s="4"><v>' + v + "</v></c>";
    return '<c r="' + ref + '" t="inlineStr"' + (type === "header" ? ' s="1"' : type === "label" ? ' s="5"' : "") + "><is><t xml:space=\"preserve\">" + x(v) + "</t></is></c>";
  }

  function sheetXml(sh) {
    var cols = sh.columns || [], types = sh.types || [], rows = sh.rows || [];
    var widths = cols.map(function (c, i) {
      var w = String(c).length;
      for (var r = 0; r < Math.min(rows.length, 300); r++) {
        var v = rows[r][i], len = types[i] === "date" ? 10 : types[i] === "money" && typeof v === "number" ? v.toFixed(2).length + 3 : String(v === null || v === undefined ? "" : v).length;
        if (len > w) w = len;
      }
      return Math.min(Math.max(w + 2, 8), 60);
    });
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];
    if (sh.header !== false && cols.length) {
      out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
    }
    if (widths.length) out.push("<cols>" + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + "</cols>");
    out.push("<sheetData>");
    var rn = 0;
    if (sh.header !== false && cols.length) {
      rn++;
      out.push('<row r="1">' + cols.map(function (c, i) { return cell(colName(i) + "1", c, "header"); }).join("") + "</row>");
    }
    rows.forEach(function (row) {
      rn++;
      out.push('<row r="' + rn + '">' + row.map(function (v, i) {
        var t = sh.header === false ? (i === 0 ? "label" : (typeof v === "number" ? "money" : null)) : types[i];
        return cell(colName(i) + rn, v, t);
      }).join("") + "</row>");
    });
    out.push("</sheetData>");
    if (sh.header !== false && cols.length && rows.length) out.push('<autoFilter ref="A1:' + colName(cols.length - 1) + (rows.length + 1) + '"/>');
    out.push("</worksheet>");
    return out.join("");
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd-mm-yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F1F0"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF0F5E63"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    "</cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>";

  /* sheets: [{ name, columns, types, rows }] ; a sheet with header:false is a two-column label/value list */
  function build(sheets) {
    var enc = new TextEncoder(), files = [];
    var names = sheets.map(function (s, i) { return String(s.name || "Sheet" + (i + 1)).replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31); });
    files.push({ name: "[Content_Types].xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") +
      "</Types>") });
    files.push({ name: "_rels/.rels", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') });
    files.push({ name: "xl/workbook.xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map(function (n, i) { return '<sheet name="' + x(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") +
      "</sheets>" + sheets.map(function (s, i) {
        return s.header !== false && s.columns && s.columns.length && s.rows && s.rows.length
          ? '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + x(names[i]) + "'!$A$1:$" + colName(s.columns.length - 1) + "$" + (s.rows.length + 1) + "</definedName></definedNames>" : "";
      }).filter(Boolean).slice(0, 1).join("") + "</workbook>") });
    files.push({ name: "xl/_rels/workbook.xml.rels", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') });
    files.push({ name: "xl/styles.xml", data: enc.encode(STYLES) });
    sheets.forEach(function (s, i) { files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: enc.encode(sheetXml(s)) }); });
    return zip(files);
  }

  function download(filename, sheets) {
    var blob = build(sheets);
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = /\.xlsx$/i.test(filename) ? filename : filename + ".xlsx";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  window.Xlsx = { build: build, download: download };
})();
