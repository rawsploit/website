/* ============================================================
   Billing (Field Sales): bill shops from the phone, with or
   without signal. Everything is saved on the phone first and
   sent to the office when there is signal. Each entry carries
   its own id, so sending twice never counts twice.
   The sums here match the server exactly (Core Sales.js).
   Designed by rawsploit@gmail.com
   ============================================================ */
(function () {
  "use strict";
  var esc = Suite.esc;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "billing:" + Suite.clientId();
  var FIELD_ROLES = ["sales", "admin"];
  var st;

  /* ---------- stored state ---------- */
  function load() {
    try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { st = null; }
    st = st || {};
    st.entries = st.entries || [];
    st.seq = st.seq || {};
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); }
    catch (e) { flash("This phone's storage is full. Send your bills, then clear old ones from Day summary.", "err"); }
  }

  /* ---------- helpers ---------- */
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function money(n) { return "₹ " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function today() {
    var d = new Date(), p = function (n) { return ("0" + n).slice(-2); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "x" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function gstState(g) { var m = /^(\d{2})/.exec(String(g || "")); return m ? m[1] : ""; }
  function niceDate(ymd) { var p = String(ymd).split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : ymd; }
  function nowTime() { return new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); }

  /* Same as salesLineCalc_ on the server. */
  function lineCalc(rate, qty, gst, inclusive, inter) {
    rate = Number(rate) || 0; qty = Number(qty) || 0; gst = Number(gst) || 0;
    var gross = rate * qty;
    var taxable = r2(inclusive ? gross / (1 + gst / 100) : gross);
    var half = r2(taxable * gst / 200), igst = r2(taxable * gst / 100);
    return { taxable: taxable, cgst: inter ? 0 : half, sgst: inter ? 0 : half, igst: inter ? igst : 0, total: r2(taxable + (inter ? igst : half * 2)) };
  }
  function billTotals(shop, lines) {
    var inter = !!(gstState(shop.gstin) && gstState(st.boot.company.gstin) && gstState(shop.gstin) !== gstState(st.boot.company.gstin));
    var t = { taxable: 0, cgst: 0, sgst: 0, igst: 0, sum: 0, inter: inter };
    lines.forEach(function (l) {
      var m = lineCalc(l.rate, l.qty, l.gst, st.boot.inclusive, inter);
      l.taxable = m.taxable; l.cgst = m.cgst; l.sgst = m.sgst; l.igst = m.igst; l.total = m.total;
      t.taxable += m.taxable; t.cgst += m.cgst; t.sgst += m.sgst; t.igst += m.igst; t.sum += m.total;
    });
    t.sum = r2(t.sum); t.total = Math.round(t.sum); t.round = r2(t.total - t.sum);
    t.taxable = r2(t.taxable); t.cgst = r2(t.cgst); t.sgst = r2(t.sgst); t.igst = r2(t.igst);
    return t;
  }

  function shopById(id) { return (st.boot.shops || []).filter(function (s) { return s.shop_id === id; })[0]; }
  function productBySku(sku) { return (st.boot.products || []).filter(function (p) { return p.sku === sku; })[0]; }
  function todays() { return st.entries.filter(function (e) { return e.date === st.day.date; }); }
  function pending() { return st.entries.filter(function (e) { return e.state !== "sent"; }); }

  /* Next number in a series, never below what the office already has. */
  function nextNo(kind, route, date) {
    var pre = kind === "RETURN" ? "RT/" : kind === "COLLECTION" ? "RC/" : "";
    var series = pre + route + "/" + st.boot.userCode + "/" + String(date).slice(2, 4);
    var n = Math.max(st.seq[series] || 0, (st.boot.lastSeq || {})[series] || 0) + 1;
    st.seq[series] = n;
    return series + "/" + ("0000" + n).slice(-5);
  }

  /* ---------- who is billing ---------- */
  function identify() {
    var s = Suite.getSession();
    if (s && s.kind === "staff") {
      if (FIELD_ROLES.indexOf(s.role) === -1) { stop("Billing is for sales staff. Your team uses the Sales Desk instead."); return false; }
      if (st.who && st.who.user !== s.user) {           // a different person on this phone
        if (pending().length) { stop(st.who.name + " still has " + pending().length + " unsent entr" + (pending().length === 1 ? "y" : "ies") + " on this phone. Sign in as " + st.who.name + " and send them first."); return false; }
        st = { entries: [], seq: {} };
      }
      st.who = { user: s.user, name: s.name, role: s.role, token: s.token, expires: s.expires || 0 };
      save();
      return true;
    }
    if (st.who) return true;                             // offline: carry on as the last person, send later
    location.replace(Suite.link("login.html", { next: "m=billing" }));
    return false;
  }
  function tokenOk() { return st.who && st.who.token && (!st.who.expires || Date.now() < st.who.expires - 60000); }

  function stop(text) {
    $("main").innerHTML = '<div class="card"><h2>Billing</h2><p>' + esc(text) + '</p><p><a class="btn btn-line" href="' + esc(Suite.link("portal.html")) + '">Back to the portal</a></p></div>';
    $("syncBtn").hidden = true;
  }

  /* ---------- talking to the office ---------- */
  function call(action, payload) {
    if (Suite.isDemo()) return Promise.resolve(demo(action, payload || {}));
    return Suite.api(action, Object.assign({ token: st.who.token }, payload || {})).then(function (res) {
      if (!res.ok) {
        var e = new Error(res.message || "That didn't work.");
        if (/session has ended|sign in again/i.test(res.message || "")) e.session = true;
        throw e;
      }
      return res;
    });
  }

  var syncing = false;
  function sync(manual) {
    var list = pending().filter(function (e) { return e.state !== "err" || manual; });
    status();
    if (syncing || !list.length) return Promise.resolve();
    if (!navigator.onLine) { if (manual) flash("No signal right now. Your bills are safe on the phone and will go when signal returns.", "warn"); return Promise.resolve(); }
    if (!tokenOk() && !Suite.isDemo()) { st.needLogin = true; save(); status(); if (manual) askLogin(); return Promise.resolve(); }
    syncing = true; status();
    var batch = list.slice(0, 150);
    var bills = batch.filter(function (e) { return e.kind !== "SKIP"; }).map(function (e) {
      return { uuid: e.uuid, bill_no: e.bill_no, kind: e.kind, bill_date: e.date, created_at: e.created_at, shop_id: e.shop_id,
               shop_name: e.shop_name, pay_mode: e.pay_mode, paid: e.paid, note: e.note,
               lines: (e.lines || []).map(function (l) { return { sku: l.sku, qty: l.qty, free_qty: l.free_qty, rate: l.rate, gst: l.gst }; }) };
    });
    var skips = batch.filter(function (e) { return e.kind === "SKIP"; }).map(function (e) {
      return { uuid: e.uuid, skip_date: e.date, created_at: e.created_at, shop_id: e.shop_id, reason: e.reason };
    });
    return call("salesSync", { bills: bills, skips: skips }).then(function (res) {
      var acc = {}; (res.accepted || []).forEach(function (u) { acc[u] = true; });
      var bad = {}; (res.failed || []).forEach(function (f) { bad[f.uuid] = f.message; });
      st.entries.forEach(function (e) {
        if (acc[e.uuid]) { e.state = "sent"; delete e.err; }
        else if (bad[e.uuid]) { e.state = "err"; e.err = bad[e.uuid]; }
        if (res.renumbered && res.renumbered[e.uuid]) e.bill_no = res.renumbered[e.uuid];
      });
      st.needLogin = false; st.lastSync = Date.now();
      save();
      if (manual) flash(res.failed && res.failed.length ? res.failed.length + " entr" + (res.failed.length === 1 ? "y" : "ies") + " couldn't be saved. Open Day summary to see why." : "All sent to the office.", res.failed && res.failed.length ? "err" : "ok");
    }).catch(function (e) {
      if (e.session) { st.needLogin = true; save(); if (manual) askLogin(); }
      else if (manual) flash((e.message || "Couldn't reach the office.") + " Your bills are safe on the phone.", "warn");
    }).then(function () { syncing = false; status(); refreshIfList(); });
  }

  function askLogin() {
    flash('Your sign-in has ended, so bills can\'t be sent yet. They\'re safe on the phone. <a href="' + esc(Suite.link("login.html", { next: "m=billing" })) + '">Sign in again</a> when you have signal.', "warn", true);
  }

  function status() {
    var b = $("syncBtn"), n = pending().length, errs = st.entries.filter(function (e) { return e.state === "err"; }).length;
    b.className = "sync";
    if (syncing) { b.textContent = "Sending…"; return; }
    if (errs) { b.className = "sync off"; b.textContent = errs + " need attention"; return; }
    if (!n) { b.className = "sync ok"; b.textContent = "All sent"; return; }
    b.className = navigator.onLine ? "sync wait" : "sync off";
    b.textContent = n + " waiting" + (navigator.onLine ? "" : " · offline") + (st.needLogin ? " · sign in" : "");
  }
  $("syncBtn").onclick = function () { sync(true); };
  window.addEventListener("online", function () { sync(false); });
  window.addEventListener("offline", status);
  setInterval(function () { sync(false); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) sync(false); });

  /* ---------- screens ---------- */
  var stack = [];
  function show(fn, args, push) {
    if (push !== false) stack.push([fn, args]);
    $("backBtn").hidden = stack.length <= 1;
    $("bar").hidden = true; $("barIn").innerHTML = "";
    window.scrollTo(0, 0);
    fn.apply(null, args || []);
    status();
  }
  function back() {
    if (stack.length > 1) { stack.pop(); var top = stack[stack.length - 1]; show(top[0], top[1], false); }
  }
  function home() { stack = []; show(viewShops); }
  $("backBtn").onclick = back;
  function refreshIfList() { var top = stack[stack.length - 1]; if (top && (top[0] === viewShops || top[0] === viewDay || top[0] === viewReceipt || top[0] === viewShop)) show(top[0], top[1], false); }

  var flashMsg = null;
  function flash(text, kind, html) { flashMsg = { text: text, kind: kind || "ok", html: !!html }; var box = $("flash"); if (box) paintFlash(box); }
  function paintFlash(box) {
    if (!flashMsg) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="msg ' + flashMsg.kind + '">' + (flashMsg.html ? flashMsg.text : esc(flashMsg.text)) + "</div>";
    flashMsg = null;
  }
  function header(title, sub) { $("title").innerHTML = esc(title) + '<small id="subtitle">' + esc(sub || "") + "</small>"; }

  /* Start of day: choose the route and download the list (needs signal once). */
  function viewStart() {
    header("Start billing", st.who.name);
    var routes = (st.boot && st.boot.routes) || [];
    var have = !!st.boot;
    $("main").innerHTML = '<div id="flash"></div><div class="card"><h2>Good ' + (new Date().getHours() < 12 ? "morning" : "day") + ", " + esc(st.who.name.split(" ")[0]) + "</h2>" +
      '<p class="muted">Download today\'s shops and prices while you have signal. After that, billing works even without signal.</p>' +
      (routes.length ? '<label class="field"><span>Your route today</span><select id="route">' + routes.map(function (r) {
        return '<option value="' + esc(r.route_id) + '"' + (st.day && st.day.route === r.route_id ? " selected" : "") + ">" + esc(r.route_id + " – " + r.name) + "</option>";
      }).join("") + "</select></label>" : "") +
      '<div class="stack"><button class="btn btn-ink" id="dl" type="button">' + (have ? "Download fresh list" : "Download today's list") + "</button>" +
      (have && routes.length ? '<button class="btn btn-line" id="useSaved" type="button">Use the list on this phone (from ' + esc(new Date(st.bootAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) + ")</button>" : "") +
      "</div></div>";
    paintFlash($("flash"));
    $("dl").onclick = function () {
      var btn = this; btn.disabled = true; btn.textContent = "Downloading…";
      if (!navigator.onLine && !Suite.isDemo()) { flash("No signal. Find signal once to download the list.", "warn"); btn.disabled = false; btn.textContent = "Try again"; return; }
      call("salesBootstrap", {}).then(function (res) {
        st.boot = res; st.bootAt = Date.now();
        save();
        if (!res.routes.length) { flash("No routes are set up yet. Ask the office to add routes in Company setup.", "err"); show(viewStart, [], false); return; }
        if (!res.products.length) { flash("No finished products with prices yet. Ask the office to add them in Company setup.", "err"); show(viewStart, [], false); return; }
        show(viewStart, [], false);
        flash("List downloaded: " + res.shops.length + " shops, " + res.products.length + " products. Choose your route and start.", "ok");
        paintFlash($("flash"));
        var b2 = $("useSaved"); if (b2) b2.textContent = "Start billing";
      }).catch(function (e) {
        if (e.session) askLogin(); else flash(e.message || "Couldn't download. Try again.", "err");
        show(viewStart, [], false);
      });
    };
    var use = $("useSaved");
    if (use) use.onclick = function () {
      var route = $("route").value;
      if (!st.day || st.day.date !== today() || st.day.route !== route) {
        // a new day: keep anything unsent, drop what the office already has from earlier days
        st.entries = st.entries.filter(function (e) { return e.state !== "sent" || e.date === today(); });
        st.day = { date: today(), route: route };
      }
      save();
      home();
    };
  }

  /* The day's shop list for the route. */
  function viewShops() {
    if (!st.boot || !st.day || st.day.date !== today()) { stack = []; show(viewStart); return; }
    header("Billing · " + st.day.route, st.who.name + " · " + niceDate(st.day.date));
    var shops = st.boot.shops.filter(function (s) { return s.route_id === st.day.route; });
    var t = dayTotals();
    $("main").innerHTML = '<div id="flash"></div>' +
      '<div class="sum"><div><b>' + t.bills + '</b><span>Bills</span></div><div><b>' + money(t.sales) + '</b><span>Sales</span></div><div><b>' + money(t.cash) + "</b><span>Cash in hand</span></div></div>" +
      '<input class="search" id="q" type="search" placeholder="Search shop" aria-label="Search shop">' +
      '<div id="shops"></div>' +
      '<p class="muted" style="text-align:center;margin-top:16px">' + shops.length + " shops on " + esc(st.day.route) + '. <button class="link-btn" id="changeRoute" type="button">Change route</button></p>' +
      fieldSalesLink();
    paintFlash($("flash"));
    function paint() {
      var q = $("q").value.trim().toLowerCase();
      var list = shops.filter(function (s) { return !q || (s.name + " " + s.address).toLowerCase().indexOf(q) !== -1; });
      $("shops").innerHTML = list.length ? list.map(function (s) {
        var es = todays().filter(function (e) { return e.shop_id === s.shop_id; });
        var billed = es.filter(function (e) { return e.kind === "BILL"; }), skipped = es.some(function (e) { return e.kind === "SKIP"; });
        var waiting = es.some(function (e) { return e.state !== "sent"; }), err = es.some(function (e) { return e.state === "err"; });
        var tag = err ? '<span class="tag err">Check</span>'
          : billed.length ? '<span class="tag ' + (waiting ? "wait" : "billed") + '">' + money(billed.reduce(function (n, e) { return n + e.total; }, 0)) + "</span>"
          : skipped ? '<span class="tag skipped">Skipped</span>' : "";
        return '<button class="shop" type="button" data-shop="' + esc(s.shop_id) + '"><span class="nm"><b>' + esc(s.name) + "</b><span>" +
          esc(s.address || s.phone || "") + "</span></span>" + tag + "</button>";
      }).join("") : '<p class="muted">' + (shops.length ? "No shop matches that search." : "No shops on this route yet. Ask the office to add them in Sales Desk → Shops.") + "</p>";
    }
    paint();
    $("q").oninput = paint;
    $("shops").onclick = function (e) { var b = e.target.closest("[data-shop]"); if (b) show(viewShop, [b.dataset.shop]); };
    $("changeRoute").onclick = function () { stack = []; show(viewStart); };
    $("bar").hidden = false;
    $("barIn").innerHTML = '<div class="tot"><b>' + money(t.collected) + '</b><span>Collected today</span></div><button class="btn btn-line" id="daySum" type="button">Day summary</button>';
    $("daySum").onclick = function () { show(viewDay); };
  }

  function viewShop(id) {
    var s = shopById(id);
    if (!s) { home(); return; }
    header(s.name, s.address || st.day.route);
    var es = todays().filter(function (e) { return e.shop_id === id; });
    $("main").innerHTML = '<div id="flash"></div><div class="card"><h2>' + esc(s.name) + '</h2><p class="muted" style="margin:0">' +
      [s.address, s.phone, s.gstin ? "GSTIN " + s.gstin : "", s.credit ? "Credit allowed" : "Cash only"].filter(Boolean).map(esc).join(" · ") + "</p></div>" +
      '<div class="acts"><button class="main" type="button" data-act="BILL">New bill</button><button type="button" data-act="RETURN">Return</button>' +
      '<button type="button" data-act="COLLECTION">Collection</button><button type="button" data-act="SKIP" style="grid-column:1/-1">Not billed today (skip)</button></div>' +
      (es.length ? '<div class="card" style="margin-top:12px"><h2 style="font-size:16px">Today at this shop</h2>' + es.map(entryLine).join("") + "</div>" : "");
    paintFlash($("flash"));
    $("main").querySelector(".acts").onclick = function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var k = b.dataset.act;
      if (k === "BILL" || k === "RETURN") show(viewBill, [id, k]);
      else if (k === "COLLECTION") show(viewCollection, [id]);
      else show(viewSkip, [id]);
    };
    bindEntryLines();
  }

  function entryLine(e) {
    var label = e.kind === "SKIP" ? "Skipped: " + e.reason : (e.kind === "RETURN" ? "Return " : e.kind === "COLLECTION" ? "Collection " : "Bill ") + e.bill_no;
    var stt = e.state === "sent" ? '<span class="tag billed">Sent</span>' : e.state === "err" ? '<span class="tag err">Not saved</span>' : '<span class="tag wait">Waiting</span>';
    return '<div class="list-line"><span>' + (e.kind !== "SKIP" ? '<button class="link-btn" type="button" data-open="' + esc(e.uuid) + '">' + esc(label) + "</button>" : esc(label)) +
      '<br><small class="muted">' + esc(e.time || "") + (e.err ? " · " + esc(e.err) : "") + "</small></span><span style=\"text-align:right\">" +
      (e.kind !== "SKIP" ? "<b>" + money(e.total) + "</b><br>" : "") + stt + "</span></div>";
  }
  function bindEntryLines() {
    $("main").querySelectorAll("[data-open]").forEach(function (b) {
      b.onclick = function () { show(viewReceipt, [b.dataset.open]); };
    });
  }

  /* New bill or return. */
  function viewBill(id, kind) {
    var s = shopById(id);
    var isRet = kind === "RETURN";
    header(isRet ? "Return · " + s.name : "Bill · " + s.name, isRet ? "Items taken back" : "Tap + to add items");
    var cart = {};          // sku -> { qty, free }
    var modes = st.boot.payModes[kind].filter(function (m) { return m !== "Credit" || s.credit; });
    var pay = modes[0];
    $("main").innerHTML = '<div id="flash"></div><input class="search" id="q" type="search" placeholder="Search item" aria-label="Search item"><div class="card" id="items" style="padding-top:4px;padding-bottom:4px"></div>' +
      '<div class="card"><h2 style="font-size:16px">' + (isRet ? "Refund" : "Payment") + '</h2><div class="chips" id="pay">' +
      modes.map(function (m) { return '<button type="button" data-m="' + esc(m) + '" aria-pressed="' + (m === pay) + '">' + esc(m) + "</button>"; }).join("") + "</div>" +
      '<label class="field" id="paidBox" hidden><span>Paid now (rest on credit)</span><input id="paid" type="number" inputmode="decimal" min="0" step="0.01" value="0"></label>' +
      '<label class="field" style="margin-bottom:0"><span>Note (optional)</span><input id="note" maxlength="300" placeholder="' + (isRet ? "Reason: damaged, expired…" : "Anything the office should know") + '"></label></div>';
    paintFlash($("flash"));
    function paintItems() {
      var q = $("q").value.trim().toLowerCase();
      var list = st.boot.products.filter(function (p) { return !q || (p.name + " " + p.pack + " " + p.sku).toLowerCase().indexOf(q) !== -1; });
      list.sort(function (a, b) { return (cart[b.sku] ? 1 : 0) - (cart[a.sku] ? 1 : 0); });
      $("items").innerHTML = list.length ? list.map(function (p) {
        var c = cart[p.sku] || { qty: 0, free: 0 };
        return '<div class="item"><div class="nm"><b>' + esc(p.name) + "</b><span>" + esc(p.pack) + " · " + money(p.price) + "</span>" +
          (c.qty && !isRet ? '<label class="free">Free <input type="number" inputmode="numeric" min="0" data-free="' + esc(p.sku) + '" value="' + (c.free || 0) + '"></label>' : "") +
          '</div><span class="qstep"><button type="button" data-dec="' + esc(p.sku) + '" aria-label="One less">−</button><input type="number" inputmode="numeric" min="0" data-qty="' +
          esc(p.sku) + '" value="' + (c.qty || 0) + '" aria-label="Quantity"><button type="button" data-inc="' + esc(p.sku) + '" aria-label="One more">+</button></span></div>';
      }).join("") : '<p class="muted" style="padding:10px 0">No item matches.</p>';
    }
    function lines() {
      return Object.keys(cart).filter(function (k) { return cart[k].qty > 0 || cart[k].free > 0; }).map(function (k) {
        var p = productBySku(k);
        return { sku: k, product: p.name, pack: p.pack, hsn: p.hsn, qty: cart[k].qty, free_qty: isRet ? 0 : (cart[k].free || 0), rate: p.price, gst: p.gst };
      });
    }
    function paintBar() {
      var ls = lines(), t = billTotals(s, ls);
      var n = ls.reduce(function (a, l) { return a + l.qty; }, 0);
      $("bar").hidden = false;
      $("barIn").innerHTML = '<div class="tot"><b>' + money(t.total) + "</b><span>" + n + " item" + (n === 1 ? "" : "s") + " · tax " + money(r2(t.cgst + t.sgst + t.igst)) +
        '</span></div><button class="btn btn-ink" id="saveBill" type="button"' + (ls.length ? "" : " disabled") + ">Save " + (isRet ? "return" : "bill") + "</button>";
      $("saveBill").onclick = saveIt;
    }
    function setQty(sku, q) {
      q = Math.max(0, Math.min(100000, Math.floor(Number(q) || 0)));
      if (!cart[sku]) cart[sku] = { qty: 0, free: 0 };
      cart[sku].qty = q;
      if (!q && !cart[sku].free) delete cart[sku];
    }
    $("items").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var sku = b.dataset.inc || b.dataset.dec; if (!sku) return;
      setQty(sku, ((cart[sku] && cart[sku].qty) || 0) + (b.dataset.inc ? 1 : -1));
      paintItems(); paintBar();
    };
    $("items").onchange = function (e) {
      var i = e.target;
      if (i.dataset.qty) setQty(i.dataset.qty, i.value);
      if (i.dataset.free && cart[i.dataset.free]) cart[i.dataset.free].free = Math.max(0, Math.min(100000, Math.floor(Number(i.value) || 0)));
      paintItems(); paintBar();
    };
    $("q").oninput = paintItems;
    $("pay").onclick = function (e) {
      var b = e.target.closest("[data-m]"); if (!b) return;
      pay = b.dataset.m;
      $("pay").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      $("paidBox").hidden = pay !== "Credit";
    };
    function saveIt() {
      var ls = lines();
      if (!ls.length) return;
      var t = billTotals(s, ls);
      var paid = kind === "BILL" ? (pay === "Credit" ? Math.min(Math.max(Number($("paid").value) || 0, 0), t.total) : t.total) : (pay === "Cash refund" ? t.total : 0);
      var e = {
        uuid: uuid(), kind: kind, bill_no: nextNo(kind, s.route_id, st.day.date), date: st.day.date, time: nowTime(), created_at: new Date().toISOString(),
        shop_id: s.shop_id, shop_name: s.name, shop_gstin: s.gstin, shop_phone: s.phone, route_id: s.route_id, pay_mode: pay, paid: r2(paid),
        note: $("note").value.trim().slice(0, 300), lines: ls, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, round_off: t.round, total: t.total,
        state: "wait"
      };
      st.entries.push(e);
      save();
      stack.pop();                                    // back goes to the shop, not the editor
      show(viewReceipt, [e.uuid]);
      sync(false);
    }
    paintItems(); paintBar();
  }

  function viewCollection(id) {
    var s = shopById(id);
    header("Collection · " + s.name, "Money received against earlier bills");
    var modes = st.boot.payModes.COLLECTION, pay = modes[0];
    $("main").innerHTML = '<div id="flash"></div><div class="card"><label class="field"><span>Amount received</span><input id="amt" type="number" inputmode="decimal" min="1" step="0.01" placeholder="0"></label>' +
      '<div class="chips" id="pay">' + modes.map(function (m) { return '<button type="button" data-m="' + esc(m) + '" aria-pressed="' + (m === pay) + '">' + esc(m) + "</button>"; }).join("") + "</div>" +
      '<label class="field"><span>Note (optional)</span><input id="note" maxlength="300" placeholder="Cheque number, which bill…"></label>' +
      '<button class="btn btn-ink" id="saveCol" type="button" style="width:100%;padding:14px">Save collection</button></div>';
    paintFlash($("flash"));
    $("pay").onclick = function (e) {
      var b = e.target.closest("[data-m]"); if (!b) return;
      pay = b.dataset.m; $("pay").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
    };
    $("saveCol").onclick = function () {
      var amt = r2($("amt").value);
      if (!(amt > 0)) { flash("Enter the amount received.", "err"); paintFlash($("flash")); return; }
      var e = { uuid: uuid(), kind: "COLLECTION", bill_no: nextNo("COLLECTION", s.route_id, st.day.date), date: st.day.date, time: nowTime(),
                created_at: new Date().toISOString(), shop_id: s.shop_id, shop_name: s.name, shop_phone: s.phone, route_id: s.route_id,
                pay_mode: pay, paid: amt, total: amt, note: $("note").value.trim().slice(0, 300), lines: [], state: "wait" };
      st.entries.push(e); save();
      stack.pop(); show(viewReceipt, [e.uuid]); sync(false);
    };
  }

  function viewSkip(id) {
    var s = shopById(id);
    header("Skip · " + s.name, "Visited, not billed");
    var reason = "";
    $("main").innerHTML = '<div id="flash"></div><div class="card"><h2 style="font-size:16px">Why wasn\'t this shop billed?</h2><div class="chips" id="rs">' +
      st.boot.skipReasons.map(function (r) { return '<button type="button" data-r="' + esc(r) + '" aria-pressed="false">' + esc(r) + "</button>"; }).join("") +
      '</div><button class="btn btn-ink" id="saveSkip" type="button" style="width:100%;padding:14px" disabled>Save</button></div>';
    paintFlash($("flash"));
    $("rs").onclick = function (e) {
      var b = e.target.closest("[data-r]"); if (!b) return;
      reason = b.dataset.r; $("rs").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      $("saveSkip").disabled = false;
    };
    $("saveSkip").onclick = function () {
      st.entries.push({ uuid: uuid(), kind: "SKIP", date: st.day.date, time: nowTime(), created_at: new Date().toISOString(),
                        shop_id: s.shop_id, shop_name: s.name, route_id: s.route_id, reason: reason, state: "wait" });
      save(); flash(s.name + " marked as skipped (" + reason + ").", "ok");
      home(); sync(false);
    };
  }

  /* ---------- receipt: print, WhatsApp, share ---------- */
  /* ---------- printer (kept per phone, not per company) ---------- */
  var PKEY = "billing:printer";
  var pr = (function () { try { return JSON.parse(localStorage.getItem(PKEY) || "null"); } catch (e) { return null; } })() ||
    { width: 80, method: navigator.bluetooth ? "bt" : "system" };
  function savePrinter() { try { localStorage.setItem(PKEY, JSON.stringify(pr)); } catch (e) {} }
  var W = pr.width === 58 ? 32 : 48;   // characters across the receipt: 58 mm = 32, 80 mm = 48
  function cols() {                    // item / qty / rate / amount column widths
    return W === 32 ? [14, 5, 6, 7] : [22, 6, 9, 11];
  }
  function padR(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + new Array(n - s.length + 1).join(" "); }
  function padL(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : new Array(n - s.length + 1).join(" ") + s; }
  function centre(s) { s = String(s).slice(0, W); var p = Math.floor((W - s.length) / 2); return new Array(p + 1).join(" ") + s; }
  function num(n) { return Number(n || 0).toFixed(2); }
  function rule(ch) { return new Array(W + 1).join(ch || "-"); }

  /* prices include GST: the shop sees qty x price on each line (the tax split's paise go to round off) */
  function lineAmt(l) { return st.boot && st.boot.inclusive !== false ? r2(l.qty * l.rate) : l.total; }
  function receiptText(e) {
    var c = st.boot.company, out = [];
    out.push(centre(c.name || ""));
    if (c.address) out.push(centre(c.address));
    if (c.gstin) out.push(centre("GSTIN " + c.gstin));
    if (c.phone) out.push(centre("Ph " + c.phone));
    out.push(rule("="));
    out.push(centre(e.kind === "RETURN" ? "SALES RETURN" : e.kind === "COLLECTION" ? "RECEIPT" : "BILL"));
    out.push(padR("No: " + e.bill_no, W));
    out.push(padR("Date: " + niceDate(e.date) + " " + (e.time || ""), W));
    out.push(padR("To: " + e.shop_name, W));
    if (e.shop_gstin) out.push(padR("GSTIN: " + e.shop_gstin, W));
    out.push(rule());
    if (e.kind !== "COLLECTION") {
      var c4 = cols(), L = W - 12;
      out.push(padR("Item", c4[0]) + padL("Qty", c4[1]) + padL("Rate", c4[2]) + padL("Amt", c4[3]));
      out.push(rule());
      e.lines.forEach(function (l) {
        var nm = l.product + " " + l.pack;
        out.push(nm.slice(0, W));
        out.push(padR(l.free_qty ? "  +" + l.free_qty + " free" : "", c4[0]) + padL(l.qty, c4[1]) + padL(Number(l.rate).toFixed(W === 32 ? 0 : 2), c4[2]) + padL(num(lineAmt(l)), c4[3]));
      });
      out.push(rule());
      out.push(padR("Taxable", L) + padL(num(e.taxable), 12));
      if (e.igst) out.push(padR("IGST", L) + padL(num(e.igst), 12));
      else { out.push(padR("CGST", L) + padL(num(e.cgst), 12)); out.push(padR("SGST", L) + padL(num(e.sgst), 12)); }
      if (e.round_off) out.push(padR("Round off", L) + padL(num(e.round_off), 12));
    }
    out.push(rule("="));
    out.push(padR("TOTAL", W - 16) + padL("Rs " + num(e.total), 16));
    if (e.kind === "BILL") {
      out.push(padR("Paid (" + e.pay_mode + ")", W - 12) + padL(num(e.paid), 12));
      if (e.total - e.paid > 0.005) out.push(padR("Balance (credit)", W - 12) + padL(num(e.total - e.paid), 12));
    } else out.push(padR(e.pay_mode, W));
    if (e.note) out.push("Note: " + e.note);
    out.push(rule());
    if (e.kind === "BILL" && c.upi) out.push(centre("Pay by UPI: " + c.upi));
    out.push(centre("Thank you"));
    out.push(centre("Sold by " + st.who.name));
    return out.join("\n");
  }

  function whatsappText(e) {
    var c = st.boot.company;
    var lines = ["*" + (c.name || "") + "*", (e.kind === "RETURN" ? "Sales return" : e.kind === "COLLECTION" ? "Payment receipt" : "Bill") + " " + e.bill_no + " · " + niceDate(e.date), "To: " + e.shop_name, ""];
    (e.lines || []).forEach(function (l) {
      lines.push("• " + l.product + " " + l.pack + " × " + l.qty + (l.free_qty ? " (+" + l.free_qty + " free)" : "") + " = ₹" + num(l.total));
    });
    if (e.lines && e.lines.length) {
      lines.push("");
      lines.push("Taxable ₹" + num(e.taxable) + (e.igst ? " · IGST ₹" + num(e.igst) : " · CGST ₹" + num(e.cgst) + " · SGST ₹" + num(e.sgst)));
    }
    lines.push("*Total ₹" + num(e.total) + "*" + (e.kind === "BILL" ? " · Paid ₹" + num(e.paid) + " (" + e.pay_mode + ")" : " · " + e.pay_mode));
    if (e.kind === "BILL" && e.total - e.paid > 0.005) lines.push("Balance ₹" + num(e.total - e.paid));
    if (e.kind === "BILL" && c.upi) lines.push("Pay by UPI: " + c.upi);
    lines.push("", "Thank you! – " + st.who.name);
    return lines.join("\n");
  }

  function waNumber(p) {
    var d = String(p || "").replace(/\D/g, "");
    if (d.length === 10) return "91" + d;
    if (d.length === 11 && d.charAt(0) === "0") return "91" + d.slice(1);
    return d.length >= 11 ? d : "";
  }

  function viewReceipt(id) {
    var e = st.entries.filter(function (x) { return x.uuid === id; })[0];
    if (!e) { home(); return; }
    header(e.kind === "RETURN" ? "Return saved" : e.kind === "COLLECTION" ? "Collection saved" : "Bill saved", e.bill_no);
    var text = receiptText(e);
    $("main").innerHTML = '<div id="flash"></div>' +
      (e.state === "sent" ? '<div class="msg ok">Sent to the office.</div>' : e.state === "err" ? '<div class="msg err">Not saved at the office: ' + esc(e.err || "") + "</div>" : '<div class="msg warn">Saved on the phone. It goes to the office automatically when there\'s signal.</div>') +
      printTip() +
      '<pre class="receipt" id="rcpt"></pre>' +
      '<div class="stack"><button class="btn btn-ink" id="wa" type="button">Send on WhatsApp</button>' +
      '<button class="btn btn-line" id="pr" type="button">Print</button>' +
      '<p class="muted" style="margin:-4px 0 4px;font-size:13px">' + esc(printerLine()) + ' · <a href="#" id="prSet">Printer settings</a></p>' +
      (navigator.share ? '<button class="btn btn-line" id="sh" type="button">Share</button>' : "") +
      '<button class="btn btn-line" id="done" type="button">Done – back to shops</button></div>';
    $("rcpt").textContent = text;
    // show the slip as it prints: one line per printed line, small enough to fit the phone
    $("rcpt").style.cssText = "white-space:pre;overflow-x:auto;font-size:" + (W === 48 ? "min(11px, 2.6vw)" : "min(13px, 3.8vw)");
    paintFlash($("flash"));
    $("wa").onclick = function () {
      var n = waNumber(e.shop_phone || (shopById(e.shop_id) || {}).phone);
      window.open("https://wa.me/" + n + "?text=" + encodeURIComponent(whatsappText(e)), "_blank");
    };
    $("pr").onclick = function () { printText(text, $("pr")); };
    $("prSet").onclick = function (ev) { ev.preventDefault(); show(viewPrinter, null, true); };
    if ($("sh")) $("sh").onclick = function () { navigator.share({ title: e.bill_no, text: whatsappText(e) }).catch(function () {}); };
    $("done").onclick = home;
  }

  /* ---------- printing ----------
     Three ways, chosen per phone in Printer settings:
     bt     = straight to a Bluetooth printer from Chrome (no extra app)
     rawbt  = through the free RawBT app (any Bluetooth printer, Android)
     system = the phone's own print dialog
     Bluetooth and RawBT send standard receipt-printer commands (ESC/POS). */
  /* first-time help on the bill screen; disappears once a print has worked on this phone */
  function printTip() {
    if (pr.printed) return "";
    var steps = pr.method === "rawbt"
      ? ["Install the free <b>RawBT</b> app from the Play Store.", "Open RawBT once and pair your printer (PIN <b>0000</b>).", "Come back here and tap <b>Print</b>."]
      : pr.method === "bt" && navigator.bluetooth
      ? ["Switch the printer <b>on</b>.", "Turn on the phone's <b>Bluetooth</b> and <b>Location</b>.", "Tap <b>Print</b>, then pick your printer from the list (for example <b>Printer_F160</b>).", "Next time it prints straight away."]
      : ["Tap <b>Print</b> and choose your printer in the phone's print screen."];
    return '<div class="msg warn" id="prTip" style="text-align:left"><b>First time printing on this phone?</b><ol style="margin:6px 0 0 18px;padding:0">' +
      steps.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ol></div>";
  }
  function printedOk() { if (!pr.printed) { pr.printed = true; savePrinter(); var t = $("prTip"); if (t) t.remove(); } }
  function printerLine() {
    return (pr.width === 58 ? "58 mm" : "80 mm") + " · " +
      (pr.method === "bt" ? "Bluetooth" + (pr.name ? " (" + pr.name + ")" : "") : pr.method === "rawbt" ? "RawBT app" : "Phone print dialog");
  }
  function escpos(text) {
    var lines = text.split("\n"), bytes = [0x1B, 0x40];           // reset
    function add(str) { for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); bytes.push(c < 128 ? c : 63); } }
    lines.forEach(function (ln, i) {
      if (i === 0) { bytes.push(0x1B, 0x45, 1, 0x1D, 0x21, 0x01); add(ln); bytes.push(0x0A, 0x1D, 0x21, 0x00, 0x1B, 0x45, 0); return; }  // company name bold, tall
      var big = /^\s*(BILL|SALES RETURN|RECEIPT)\s*$/.test(ln) || /^TOTAL/.test(ln);
      if (big) bytes.push(0x1B, 0x45, 1);
      add(ln); bytes.push(0x0A);
      if (big) bytes.push(0x1B, 0x45, 0);
    });
    bytes.push(0x1B, 0x64, 4);                                    // feed 4 lines to tear off
    return new Uint8Array(bytes);
  }
  function systemPrint(text) {
    var a = $("printArea");
    a.textContent = text; a.style.width = pr.width + "mm"; a.style.fontSize = pr.width === 58 ? "10.5px" : "12px";
    document.getElementById("pageSize").textContent = "@media print { @page { size: " + pr.width + "mm auto; margin: 2mm; } }";
    a.hidden = false; window.print(); setTimeout(function () { a.hidden = true; }, 500);
  }
  function rawbtPrint(text) {
    var b = escpos(text), bin = "";
    for (var i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    location.href = "intent:base64," + btoa(bin) + "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;";
  }
  /* Bluetooth printers expose a "serial" service; makers use different ids, so ask for the common ones
     and write to the first characteristic that accepts data. */
  var BT_SERVICES = [0xfff0, 0xff00, 0xffe0, 0x18f0, 0xae30, 0xfee7,
    "49535343-fe7d-4ae5-8fa9-9fafd205e455", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "0000ff12-0000-1000-8000-00805f9b34fb"];
  var bt = { device: null, ch: null };
  function btFindChar(server) {
    return server.getPrimaryServices().then(function (svcs) {
      var i = 0;
      function next() {
        if (i >= svcs.length) throw new Error("This printer didn't offer a way to send data.");
        return svcs[i++].getCharacteristics().then(function (chs) {
          for (var k = 0; k < chs.length; k++) if (chs[k].properties.write || chs[k].properties.writeWithoutResponse) return chs[k];
          return next();
        }, next);
      }
      return next();
    });
  }
  function btConnect(pick) {
    if (bt.ch && bt.device && bt.device.gatt.connected) return Promise.resolve(bt.ch);
    var getDev = bt.device && !pick ? Promise.resolve(bt.device) :
      navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
    return getDev.then(function (d) {
      bt.device = d; pr.name = d.name || "printer"; savePrinter();
      return d.gatt.connect();
    }).then(btFindChar).then(function (ch) { bt.ch = ch; return ch; });
  }
  function btWrite(ch, data) {
    var size = 100, pos = 0, safe = !!ch.properties.write;
    function step() {
      if (pos >= data.length) return Promise.resolve();
      var part = data.slice(pos, pos + size); pos += size;
      var w = safe && ch.writeValueWithResponse ? ch.writeValueWithResponse(part) :
        ch.writeValueWithoutResponse ? ch.writeValueWithoutResponse(part) : ch.writeValue(part);
      return w.then(function () { return safe ? null : new Promise(function (r) { setTimeout(r, 25); }); }).then(step);
    }
    return step().catch(function (err) {
      if (size > 20) { size = 20; pos = 0; return step(); }    // some printers only take small pieces
      throw err;
    });
  }
  function printText(text, btn) {
    if (pr.method === "rawbt") { rawbtPrint(text); printedOk(); return; }
    if (pr.method !== "bt" || !navigator.bluetooth) { systemPrint(text); printedOk(); return; }
    var label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Printing…"; }
    btConnect(false).then(function (ch) { return btWrite(ch, escpos(text)); })
      .then(function () { printedOk(); if (btn) btn.textContent = "Printed ✓"; setTimeout(function () { if (btn) { btn.textContent = label; btn.disabled = false; } }, 1500); })
      .catch(function (err) {
        bt.ch = null;
        if (btn) { btn.textContent = label; btn.disabled = false; }
        if (err && err.name === "NotFoundError") return;           // closed the printer list
        flash("Couldn't print. Check: 1) the printer is on and close by, 2) the phone's Bluetooth and Location are on, 3) the printer isn't connected to another phone. Then tap Print again. " +
          "Still not working? Open Printer settings and choose \u201cRawBT app\u201d.", "err");
        paintFlash($("flash"));
      });
  }
  function viewPrinter() {
    header("Printer settings", printerLine());
    var hasBt = !!navigator.bluetooth;
    function opt(name, val, label, note, on) {
      return '<label class="list-line" style="display:flex;gap:10px;align-items:flex-start;justify-content:flex-start;text-align:left;cursor:pointer"><input type="radio" name="' + name + '" value="' + val + '"' + (on ? " checked" : "") +
        ' style="margin-top:4px"><span><b>' + label + "</b>" + (note ? '<br><small class="muted">' + note + "</small>" : "") + "</span></label>";
    }
    $("main").innerHTML = '<div id="flash"></div>' +
      '<div class="msg ok" style="text-align:left">Set this once on each phone. Then every bill has a <b>Print</b> button that prints straight away. Use <b>Print a test slip</b> to check.</div>' +
      '<div class="card"><h2 style="font-size:16px">Paper width</h2>' +
      opt("w", 80, "80 mm (3 inch)", "Most van printers", pr.width !== 58) + opt("w", 58, "58 mm (2 inch)", "Small pocket printers", pr.width === 58) + "</div>" +
      '<div class="card"><h2 style="font-size:16px">How to print</h2>' +
      (hasBt ? opt("m", "bt", "Bluetooth printer, direct", "No extra app. The first time, pick your printer from the list (for example Printer_F160)." +
        (pr.name ? " Last used: " + esc(pr.name) + "." : ""), pr.method === "bt") : "") +
      opt("m", "rawbt", "RawBT app", "Works with almost any Bluetooth printer. Install \u201cRawBT\u201d from the Play Store and pair the printer in it once.", pr.method === "rawbt") +
      opt("m", "system", "Phone print dialog", "Uses the phone's own printing.", pr.method === "system" || (!hasBt && pr.method === "bt")) + "</div>" +
      '<div class="stack"><button class="btn btn-ink" id="pSave" type="button">Save</button>' +
      '<button class="btn btn-line" id="pTest" type="button">Print a test slip</button>' +
      (hasBt ? '<button class="btn btn-line" id="pPick" type="button">Choose a different Bluetooth printer</button>' : "") + "</div>";
    paintFlash($("flash"));
    function read() {
      var w = document.querySelector('input[name="w"]:checked'), m = document.querySelector('input[name="m"]:checked');
      pr.width = w && w.value === "58" ? 58 : 80; pr.method = m ? m.value : "system";
      W = pr.width === 58 ? 32 : 48; savePrinter();
    }
    $("pSave").onclick = function () { read(); flash("Printer settings saved: " + printerLine() + ".", "ok"); back(); };
    $("pTest").onclick = function () {
      read();
      var t = [centre((st.boot && st.boot.company && st.boot.company.name) || "Test print"), rule("="), centre("TEST SLIP"),
        padR("Paper: " + pr.width + " mm", W), padR("Printer: " + printerLine(), W), rule(), "1234567890".repeat(5).slice(0, W), rule(), centre("Printing works")].join("\n");
      printText(t, $("pTest"));
    };
    if ($("pPick")) $("pPick").onclick = function () {
      read(); pr.method = "bt"; savePrinter();
      btConnect(true).then(function () { flash("Printer connected: " + pr.name + ".", "ok"); show(viewPrinter); })
        .catch(function (err) { if (!err || err.name !== "NotFoundError") { flash("Couldn't connect: " + ((err && err.message) || "") + ".", "err"); paintFlash($("flash")); } });
    };
  }

  /* Start Day / End Day live in Field Sales (needs signal). */
  function fieldSalesLink() {
    if (!(Suite.client().modules || {}).fieldsales && !Suite.isDemo()) return "";
    return '<a class="btn btn-line" style="display:block;text-align:center;margin:12px 0" href="' + esc(Suite.link("portal.html", { m: "fieldsales" })) + '">Start Day / End Day (Field Sales)</a>';
  }

  /* ---------- day summary ---------- */
  function dayTotals() {
    var t = { bills: 0, sales: 0, returns: 0, cash: 0, upi: 0, cheque: 0, credit: 0, collections: 0, collected: 0, skips: 0 };
    todays().forEach(function (e) {
      if (e.kind === "BILL") {
        t.bills++; t.sales += e.total;
        if (e.pay_mode === "UPI") t.upi += e.paid; else if (e.pay_mode === "Cheque") t.cheque += e.paid; else t.cash += e.paid;
        t.credit += e.total - e.paid;
      } else if (e.kind === "RETURN") { t.returns += e.total; if (e.pay_mode === "Cash refund") t.cash -= e.total; }
      else if (e.kind === "COLLECTION") { t.collections += e.total; if (e.pay_mode === "Cash") t.cash += e.total; else if (e.pay_mode === "UPI") t.upi += e.total; else t.cheque += e.total; }
      else if (e.kind === "SKIP") t.skips++;
    });
    Object.keys(t).forEach(function (k) { t[k] = r2(t[k]); });
    t.collected = r2(t.cash + t.upi + t.cheque);
    return t;
  }

  function viewDay() {
    header("Day summary", st.who.name + " · " + st.day.route + " · " + niceDate(st.day.date));
    var t = dayTotals(), es = todays().slice().reverse();
    var older = st.entries.filter(function (e) { return e.date !== st.day.date && e.state !== "sent"; });
    $("main").innerHTML = '<div id="flash"></div><div class="card">' +
      [["Bills", t.bills], ["Sales", money(t.sales)], ["Returns", money(t.returns)], ["Cash in hand", money(t.cash)], ["UPI", money(t.upi)],
       ["Cheque", money(t.cheque)], ["Given on credit", money(t.credit)], ["Collections (old dues)", money(t.collections)], ["Shops skipped", t.skips]]
        .map(function (r) { return '<div class="list-line"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>"; }).join("") + "</div>" +
      (older.length ? '<div class="msg warn">' + older.length + " entr" + (older.length === 1 ? "y" : "ies") + " from earlier days still waiting to be sent.</div>" : "") +
      '<div class="card"><h2 style="font-size:16px">Entries</h2>' + (es.length ? es.map(entryLine).join("") : '<p class="muted">Nothing yet today.</p>') + "</div>" +
      fieldSalesLink() +
      '<div class="stack"><button class="btn btn-ink" id="sendNow" type="button">Send now</button>' +
      '<button class="btn btn-line" id="fresh" type="button">Download fresh shop and price list</button>' +
      '<button class="btn btn-line" id="printerSet" type="button">Printer settings (' + esc(printerLine()) + ')</button>' +
      '<button class="danger-btn" id="out" type="button">Sign out of billing on this phone</button></div>';
    paintFlash($("flash"));
    bindEntryLines();
    $("sendNow").onclick = function () { sync(true); };
    $("fresh").onclick = function () { stack = []; show(viewStart); };
    $("printerSet").onclick = function () { show(viewPrinter, null, true); };
    $("out").onclick = function () {
      if (pending().length) { flash("Send your " + pending().length + " waiting entr" + (pending().length === 1 ? "y" : "ies") + " first. Signing out would lose them.", "err"); paintFlash($("flash")); return; }
      if (!confirm("Sign out of billing on this phone?")) return;
      try { localStorage.removeItem(KEY); } catch (e) {}
      Suite.clearSession();
      location.replace(Suite.link("index.html"));
    };
  }

  /* ---------- demo company: no server, same screens ---------- */
  function demo(action, p) {
    if (action === "salesBootstrap") {
      return { ok: true, inclusive: true, userCode: "DEMO", lastSeq: {}, serverDate: today(),
        company: { name: Suite.client().name, address: "Industrial Estate, Kochi", gstin: "32ABCDE1234F1Z5", phone: "0484 000000", upi: "demo@upi" },
        routes: [{ route_id: "R1", name: "North route" }, { route_id: "R2", name: "South route" }],
        shops: [
          { shop_id: "S0001", name: "City Supermarket", route_id: "R1", address: "Market Road", phone: "9800000001", gstin: "32AAAAA1111A1Z1", credit: true },
          { shop_id: "S0002", name: "Corner Store", route_id: "R1", address: "Bus Stand", phone: "9800000002", gstin: "", credit: false },
          { shop_id: "S0003", name: "Fresh Mart", route_id: "R1", address: "Temple Road", phone: "", gstin: "", credit: true },
          { shop_id: "S0004", name: "Lakeside Traders", route_id: "R2", address: "Lake View", phone: "9800000004", gstin: "", credit: true }],
        products: [
          { sku: "FC1", name: "Floor Cleaner", pack: "1 L", price: 120, hsn: "34022090", gst: 18 },
          { sku: "FC5", name: "Floor Cleaner", pack: "5 L", price: 520, hsn: "34022090", gst: 18 },
          { sku: "DW5", name: "Dish Wash Liquid", pack: "500 ml", price: 85, hsn: "34022090", gst: 18 },
          { sku: "HW2", name: "Hand Wash", pack: "200 ml", price: 60, hsn: "34013090", gst: 18 },
          { sku: "LD1", name: "Laundry Detergent", pack: "1 kg", price: 140, hsn: "34022010", gst: 18 }],
        payModes: { BILL: ["Cash", "UPI", "Credit", "Cheque"], RETURN: ["Cash refund", "Credit note"], COLLECTION: ["Cash", "UPI", "Cheque"] },
        skipReasons: ["Shop closed", "No order", "Owner not available", "Has enough stock", "Payment pending", "Other"] };
    }
    if (action === "salesSync") return { ok: true, accepted: (p.bills || []).concat(p.skips || []).map(function (x) { return x.uuid; }), failed: [], renumbered: {} };
    return { ok: false, message: "Not available in the demo." };
  }

  /* ---------- start ---------- */
  load();
  if (!identify()) return;
  if (st.boot && st.day && st.day.date === today()) home(); else show(viewStart);
  sync(false);
})();
