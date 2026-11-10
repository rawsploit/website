/* ============================================================
   Sales Desk (office): today's bills live, formal tax invoices,
   cancelling, the shop list and Excel reports.
   Bills come from Field Sales → Billing on the sales staff's phones.
   Designed by rawsploit@gmail.com
   ============================================================ */
(function () {
  "use strict";
  var esc = Suite.esc;
  var TABS = [["today", "Today"], ["bills", "Bills"], ["shops", "Shops"], ["reports", "Reports"]];
  var REPORTS = [["bills", "Customer bills"], ["items", "Item sales"], ["receipts", "Sales and receipts"], ["dsr", "Daily sales summary (DSR)"],
                 ["returns", "Sales returns"], ["collections", "Collections"], ["skips", "Skipped shops"]];
  var routesCache = null;

  function call(action, payload) {
    if (Suite.isDemo()) return Promise.resolve(demo(action, payload || {}));
    return Suite.api(action, Object.assign({ token: Suite.getSession().token }, payload || {})).then(function (res) {
      if (!res.ok) throw new Error(res.message || "That didn't work. Try again.");
      return res;
    });
  }
  function money(n) { return "₹ " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
  function today() { var d = new Date(), p = function (n) { return ("0" + n).slice(-2); }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function daysAgo(n) { var d = new Date(Date.now() - n * 864e5), p = function (x) { return ("0" + x).slice(-2); }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function niceDate(ymd) { var p = String(ymd).split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : ymd; }
  function time(iso) { return iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : ""; }
  function kindLabel(k) { return k === "RETURN" ? "Return" : k === "COLLECTION" ? "Collection" : "Bill"; }

  function routesOpts(sel) {
    return '<option value="">All routes</option>' + (routesCache || []).map(function (r) {
      return '<option value="' + esc(r.route_id) + '"' + (sel === r.route_id ? " selected" : "") + ">" + esc(r.route_id + " – " + r.name) + "</option>";
    }).join("");
  }
  function ensureRoutes() {
    if (routesCache) return Promise.resolve();
    return call("listShops").then(function (r) { routesCache = r.routes || []; }).catch(function () { routesCache = []; });
  }

  function render(root, tab) {
    tab = TABS.some(function (t) { return t[0] === tab; }) ? tab : "today";
    root.innerHTML = '<div class="view">' + (Suite.isDemo() ? '<p class="demo-hint" style="margin:0 0 16px">Demo company: sample bills, nothing is saved.</p>' : "") +
      '<div class="switch" role="group" aria-label="Section" style="max-width:520px;grid-template-columns:repeat(4,1fr)">' + TABS.map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '" aria-pressed="' + (t[0] === tab) + '">' + t[1] + "</button>";
      }).join("") + '</div><div id="sdBody" style="margin-top:18px"><p>Loading…</p></div></div>';
    root.querySelector(".switch").onclick = function (e) { var b = e.target.closest("[data-tab]"); if (b) render(root, b.dataset.tab); };
    var body = root.querySelector("#sdBody");
    ensureRoutes().then(function () { ({ today: tabToday, bills: tabBills, shops: tabShops, reports: tabReports })[tab](body); });
  }

  function errBox(body, e) { body.innerHTML = '<p class="form-error">' + esc(e.message || String(e)) + "</p>"; }

  /* ---------- live list of one day ---------- */
  function tabToday(body, date, route) {
    date = date || today();
    body.innerHTML = '<div class="sd-tools"><label class="field"><span>Day</span><input type="date" id="sdDate" value="' + esc(date) + '" max="' + today() + '"></label>' +
      '<label class="field"><span>Route</span><select id="sdRoute">' + routesOpts(route) + '</select></label>' +
      '<button class="btn btn-line btn-small" id="sdRefresh" type="button">Refresh</button></div><div id="sdLive"><p>Loading…</p></div>';
    var reload = function () { tabToday(body, body.querySelector("#sdDate").value || today(), body.querySelector("#sdRoute").value); };
    body.querySelector("#sdDate").onchange = reload; body.querySelector("#sdRoute").onchange = reload; body.querySelector("#sdRefresh").onclick = reload;
    call("salesLive", { date: date, route: route || "" }).then(function (r) {
      var s = r.summary;
      var tiles = [["Bills", s.bills], ["Sales", money(s.sales)], ["Collected", money(s.collected)], ["On credit", money(s.credit)],
                   ["Returns", money(s.returns)], ["Shops billed", s.shopsBilled], ["Shops skipped", s.shopsSkipped], ["Salespeople", s.salespeople]];
      body.querySelector("#sdLive").innerHTML = '<div class="sd-tiles">' + tiles.map(function (t) { return '<div><b>' + t[1] + "</b><span>" + t[0] + "</span></div>"; }).join("") + "</div>" +
        (r.bills.length ? billTable(r.bills, true) : '<div class="empty"><h3>No bills yet for ' + esc(niceDate(r.date)) + "</h3><p>Bills appear here as sales staff send them from Field Sales → Billing.</p></div>") +
        (r.skips.length ? '<h3 style="margin:22px 0 8px">Skipped shops</h3><table class="tbl"><thead><tr><th>Shop</th><th>Route</th><th>Salesperson</th><th>Reason</th><th>Time</th></tr></thead><tbody>' +
          r.skips.map(function (k) { return "<tr><td>" + esc(k.shop_name) + "</td><td>" + esc(k.route_id) + "</td><td>" + esc(k.user_name) + "</td><td>" + esc(k.reason) + "</td><td>" + esc(time(k.created_at)) + "</td></tr>"; }).join("") +
          "</tbody></table>" : "");
      bindBillTable(body, reload);
    }).catch(function (e) { errBox(body.querySelector("#sdLive"), e); });
  }

  function billTable(bills, showTime) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No</th><th>' + (showTime ? "Time" : "Date") + '</th><th>Type</th><th>Shop</th><th>Route</th><th>Salesperson</th><th>Payment</th><th class="num">Total</th><th class="num">Paid</th><th></th></tr></thead><tbody>' +
      bills.map(function (b) {
        var cancelled = b.status === "Cancelled";
        return '<tr class="' + (cancelled ? "is-cancelled" : "") + '"><td>' + esc(b.bill_no) + "</td><td>" + esc(showTime ? time(b.created_at || b.synced_at) : niceDate(b.bill_date)) + "</td><td>" + kindLabel(b.kind) +
          (cancelled ? ' <span class="pill-x">Cancelled</span>' : "") + "</td><td>" + esc(b.shop_name) + "</td><td>" + esc(b.route_id) + "</td><td>" + esc(b.user_name) + "</td><td>" + esc(b.pay_mode) +
          '</td><td class="num">' + money(b.total) + '</td><td class="num">' + money(b.paid) + '</td><td class="row-btns">' +
          '<a class="btn btn-line btn-small" target="_blank" rel="noopener" href="' + esc(Suite.link("invoice.html", { no: b.bill_no })) + '">' + (b.kind === "BILL" ? "Invoice" : "View") + "</a>" +
          (cancelled ? "" : ' <button class="btn btn-line btn-small" type="button" data-cancel="' + esc(b.bill_no) + '">Cancel</button>') + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function bindBillTable(body, reload) {
    body.querySelectorAll("[data-cancel]").forEach(function (b) {
      b.onclick = function () {
        var no = b.dataset.cancel;
        var reason = prompt("Cancel " + no + "?\nType the reason (the salesperson and reports will show it):");
        if (reason === null) return;
        if (!reason.trim()) { alert("A reason is needed to cancel."); return; }
        b.disabled = true; b.textContent = "Cancelling…";
        call("salesCancel", { bill_no: no, reason: reason.trim() }).then(reload).catch(function (e) { alert(e.message); b.disabled = false; b.textContent = "Cancel"; });
      };
    });
  }

  /* ---------- search bills over a range ---------- */
  function tabBills(body) {
    body.innerHTML = '<form class="sd-tools" id="sdF"><label class="field"><span>From</span><input type="date" name="from" value="' + daysAgo(6) + '"></label>' +
      '<label class="field"><span>To</span><input type="date" name="to" value="' + today() + '"></label>' +
      '<label class="field"><span>Route</span><select name="route">' + routesOpts("") + '</select></label>' +
      '<label class="field"><span>Type</span><select name="kind"><option value="">All</option><option value="BILL">Bills</option><option value="RETURN">Returns</option><option value="COLLECTION">Collections</option></select></label>' +
      '<label class="field"><span>Bill no or shop</span><input name="q" placeholder="Search"></label>' +
      '<button class="btn btn-ink btn-small" type="submit">Search</button></form><div id="sdList"></div>';
    var f = body.querySelector("#sdF");
    var run = function () {
      var list = body.querySelector("#sdList");
      list.innerHTML = "<p>Searching…</p>";
      call("salesBills", { from: f.from.value, to: f.to.value, route: f.route.value, kind: f.kind.value, q: f.q.value.trim() }).then(function (r) {
        list.innerHTML = r.bills.length ? (r.more ? '<p class="muted">Showing the latest 500. Narrow the dates to see the rest.</p>' : "") + billTable(r.bills, false)
          : '<p class="muted">No bills match.</p>';
        bindBillTable(list, run);
      }).catch(function (e) { errBox(list, e); });
    };
    f.onsubmit = function (e) { e.preventDefault(); run(); };
    run();
  }

  /* ---------- shops ---------- */
  function tabShops(body) {
    body.innerHTML = "<p>Loading shops…</p>";
    call("listShops").then(function (r) {
      routesCache = r.routes || routesCache;
      var shops = r.shops || [];
      body.innerHTML = '<div class="row-head" style="flex-wrap:wrap;gap:10px"><div><h3>Shops</h3><p class="muted" style="margin:4px 0 0">' + shops.length +
        ' shops. Sales staff see the shops on their route in Billing.</p></div><div class="row-btns"><button class="btn btn-ink btn-small" id="shAdd" type="button">Add a shop</button>' +
        '<label class="btn btn-line btn-small" style="cursor:pointer">Upload a list (CSV)<input type="file" id="shFile" accept=".csv,text/csv" hidden></label>' +
        '<button class="btn btn-line btn-small" id="shTpl" type="button">Download template</button></div></div>' +
        '<div id="shMsg"></div><div id="shForm"></div>' +
        '<label class="field" style="max-width:320px;margin-top:12px"><span>Filter</span><input id="shQ" placeholder="Shop name or route"></label>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Shop</th><th>Route</th><th>Phone (WhatsApp)</th><th>GSTIN</th><th>Type</th><th>Credit</th><th>Active</th><th></th></tr></thead><tbody id="shRows"></tbody></table></div>';
      var paint = function () {
        var q = body.querySelector("#shQ").value.trim().toLowerCase();
        body.querySelector("#shRows").innerHTML = shops.filter(function (s) { return !q || (s.name + " " + s.route_id).toLowerCase().indexOf(q) !== -1; }).map(function (s, i) {
          return "<tr" + (s.active ? "" : ' class="is-cancelled"') + "><td>" + esc(s.shop_id) + "</td><td>" + esc(s.name) + "<br><small class=\"muted\">" + esc(s.address) + "</small></td><td>" + esc(s.route_id) +
            "</td><td>" + esc(s.phone) + "</td><td>" + esc(s.gstin) + "</td><td>" + esc(s.type) + "</td><td>" + (s.credit ? "Yes" : "No") + "</td><td>" + (s.active ? "Yes" : "No") +
            '</td><td><button class="btn btn-line btn-small" type="button" data-edit="' + esc(s.shop_id) + '">Edit</button></td></tr>';
        }).join("") || '<tr><td colspan="9" class="muted">No shops yet. Add them one by one, or upload a list.</td></tr>';
      };
      paint();
      body.querySelector("#shQ").oninput = paint;
      body.querySelector("#shAdd").onclick = function () { shopForm(body, null, function () { tabShops(body); }); };
      body.querySelector("#shRows").onclick = function (e) {
        var b = e.target.closest("[data-edit]"); if (!b) return;
        shopForm(body, shops.filter(function (s) { return s.shop_id === b.dataset.edit; })[0], function () { tabShops(body); });
      };
      body.querySelector("#shTpl").onclick = function () {
        download("shops-template.csv", [["name", "route_id", "address", "phone", "gstin", "type", "credit", "active"],
          ["Example Stores", (routesCache[0] || {}).route_id || "R1", "Main Road", "9800000000", "", "A", "yes", "yes"]]);
      };
      body.querySelector("#shFile").onchange = function () {
        var file = this.files && this.files[0]; if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var rows = parseCsv(String(reader.result || ""));
          var head = (rows.shift() || []).map(function (h) { return String(h).trim().toLowerCase().replace(/\s+/g, "_"); });
          var list = rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); }).map(function (r) {
            var o = {}; head.forEach(function (h, i) { o[h] = r[i] === undefined ? "" : String(r[i]).trim(); }); return o;
          });
          var msg = body.querySelector("#shMsg");
          if (!list.length) { msg.innerHTML = '<p class="form-error">That file has no rows under the header.</p>'; return; }
          msg.innerHTML = "<p>Uploading " + list.length + " shops…</p>";
          call("saveShops", { shops: list }).then(function (res) {
            tabShops(body);
            setTimeout(function () { var m = body.querySelector("#shMsg"); if (m) m.innerHTML = '<p class="demo-hint">' + res.added + " added, " + res.updated + " updated.</p>"; }, 50);
          }).catch(function (e) { msg.innerHTML = '<p class="form-error">' + esc(e.message) + "</p>"; });
        };
        reader.readAsText(file);
      };
    }).catch(function (e) { errBox(body, e); });
  }

  function shopForm(body, s, done) {
    s = s || { name: "", route_id: (routesCache[0] || {}).route_id || "", address: "", phone: "", gstin: "", type: "", credit: true, active: true };
    var box = body.querySelector("#shForm");
    box.innerHTML = '<form class="panel" style="max-width:720px;margin:12px 0" novalidate><h3>' + (s.shop_id ? "Edit " + esc(s.name) : "Add a shop") + "</h3>" +
      '<div class="form-grid"><label class="field"><span>Shop name</span><input name="name" maxlength="120" value="' + esc(s.name) + '" required></label>' +
      '<label class="field"><span>Route</span><select name="route_id">' + (routesCache || []).map(function (r) {
        return '<option value="' + esc(r.route_id) + '"' + (r.route_id === s.route_id ? " selected" : "") + ">" + esc(r.route_id + " – " + r.name) + "</option>";
      }).join("") + "</select></label>" +
      '<label class="field"><span>Address</span><input name="address" maxlength="200" value="' + esc(s.address) + '"></label>' +
      '<label class="field"><span>Phone (WhatsApp)</span><input name="phone" inputmode="tel" value="' + esc(s.phone) + '"></label>' +
      '<label class="field"><span>GSTIN (if registered)</span><input name="gstin" maxlength="15" value="' + esc(s.gstin) + '"></label>' +
      '<label class="field"><span>Shop type</span><input name="type" maxlength="20" value="' + esc(s.type) + '" placeholder="e.g. A, B, Supermarket"></label></div>' +
      '<label class="ca-check" style="margin:4px 0 8px"><input type="checkbox" name="credit"' + (s.credit ? " checked" : "") + "> Credit allowed</label>" +
      '<label class="ca-check" style="margin:0 0 12px"><input type="checkbox" name="active"' + (s.active ? " checked" : "") + "> Active (shows in Billing)</label>" +
      '<p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="submit">Save</button><button class="btn btn-line" type="button" data-x>Close</button></div></form>';
    var f = box.querySelector("form");
    f.querySelector("[data-x]").onclick = function () { box.innerHTML = ""; };
    f.onsubmit = function (e) {
      e.preventDefault();
      var data = { shop_id: s.shop_id || "", name: f.name.value.trim(), route_id: f.route_id.value, address: f.address.value.trim(), phone: f.phone.value.trim(),
                   gstin: f.gstin.value.trim(), type: f.type.value.trim(), credit: f.credit.checked, active: f.active.checked };
      if (!data.name) { f.querySelector(".form-error").textContent = "Enter the shop name."; return; }
      call("saveShops", { shops: [data] }).then(done).catch(function (e2) { f.querySelector(".form-error").textContent = e2.message; });
    };
    f.name.focus();
  }

  /* ---------- reports ---------- */
  function tabReports(body) {
    body.innerHTML = '<form class="sd-tools" id="rpF"><label class="field"><span>Report</span><select name="type">' + REPORTS.map(function (r) { return '<option value="' + r[0] + '">' + r[1] + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>From</span><input type="date" name="from" value="' + today().slice(0, 8) + '01"></label>' +
      '<label class="field"><span>To</span><input type="date" name="to" value="' + today() + '"></label>' +
      '<label class="field"><span>Route</span><select name="route">' + routesOpts("") + "</select></label>" +
      '<button class="btn btn-ink btn-small" type="submit">Show</button></form><div id="rpOut"></div>';
    var f = body.querySelector("#rpF");
    f.onsubmit = function (e) {
      e.preventDefault();
      var out = body.querySelector("#rpOut");
      out.innerHTML = "<p>Working…</p>";
      call("salesReport", { type: f.type.value, from: f.from.value, to: f.to.value, route: f.route.value }).then(function (r) {
        var fname = r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "_" + f.from.value + "_to_" + f.to.value + ".csv";
        out.innerHTML = '<div class="row-head"><p class="muted" style="margin:0">' + r.rows.length + " row" + (r.rows.length === 1 ? "" : "s") +
          (r.rows.length > 100 ? " (first 100 shown)" : "") + '</p><button class="btn btn-ink btn-small" type="button" id="rpDl"' + (r.rows.length ? "" : " disabled") + ">Download for Excel</button></div>" +
          '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + r.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          (r.rows.slice(0, 100).map(function (row) { return "<tr>" + row.map(function (v) { return "<td" + (typeof v === "number" ? ' class="num"' : "") + ">" + esc(v) + "</td>"; }).join("") + "</tr>"; }).join("") ||
           '<tr><td colspan="' + r.columns.length + '" class="muted">Nothing in this period.</td></tr>') + "</tbody></table></div>";
        var dl = out.querySelector("#rpDl");
        if (dl) dl.onclick = function () { download(fname, [r.columns].concat(r.rows)); };
      }).catch(function (e2) { errBox(out, e2); });
    };
  }

  /* ---------- files ---------- */
  function download(name, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (v) {
        var s = v === null || v === undefined ? "" : String(v);
        if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s;            // never let a cell run as a formula
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\r\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false;
    text = text.replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
    return rows;
  }

  /* ---------- demo company ---------- */
  var demoShops = [
    { shop_id: "S0001", name: "City Supermarket", route_id: "R1", address: "Market Road", phone: "9800000001", gstin: "32AAAAA1111A1Z1", type: "A", credit: true, active: true },
    { shop_id: "S0002", name: "Corner Store", route_id: "R1", address: "Bus Stand", phone: "9800000002", gstin: "", type: "B", credit: false, active: true },
    { shop_id: "S0004", name: "Lakeside Traders", route_id: "R2", address: "Lake View", phone: "9800000004", gstin: "", type: "B", credit: true, active: true }];
  var demoBills = [
    { bill_no: "R1/JOSE/26/00012", kind: "BILL", bill_date: today(), created_at: new Date(Date.now() - 36e5).toISOString(), shop_name: "City Supermarket", route_id: "R1", user_name: "Joseph (Sales)", pay_mode: "Cash", total: 1424, paid: 1424, status: "Active" },
    { bill_no: "R1/JOSE/26/00013", kind: "BILL", bill_date: today(), created_at: new Date(Date.now() - 18e5).toISOString(), shop_name: "Corner Store", route_id: "R1", user_name: "Joseph (Sales)", pay_mode: "UPI", total: 520, paid: 520, status: "Active" },
    { bill_no: "R2/DEMO/26/00004", kind: "BILL", bill_date: today(), created_at: new Date(Date.now() - 9e5).toISOString(), shop_name: "Lakeside Traders", route_id: "R2", user_name: "Asha (Sales)", pay_mode: "Credit", total: 2280, paid: 500, status: "Active" },
    { bill_no: "RT/R1/JOSE/26/00002", kind: "RETURN", bill_date: today(), created_at: new Date(Date.now() - 6e5).toISOString(), shop_name: "Corner Store", route_id: "R1", user_name: "Joseph (Sales)", pay_mode: "Cash refund", total: 85, paid: 85, status: "Active" }];
  function demo(action, p) {
    if (action === "listShops") return { ok: true, shops: demoShops, routes: [{ route_id: "R1", name: "North route" }, { route_id: "R2", name: "South route" }] };
    if (action === "salesLive") return { ok: true, date: p.date, bills: demoBills, skips: [{ shop_name: "Fresh Mart", route_id: "R1", user_name: "Joseph (Sales)", reason: "Shop closed", created_at: new Date().toISOString() }],
      summary: { bills: 3, sales: 4224, collected: 2359, credit: 1780, returns: 85, shopsBilled: 3, shopsSkipped: 1, salespeople: 2, routes: 2, cancelled: 0 } };
    if (action === "salesBills") return { ok: true, bills: demoBills, more: false };
    if (action === "salesReport") return { ok: true, name: "Customer bills", columns: ["Bill no", "Date", "Route", "Shop", "Total"], rows: demoBills.map(function (b) { return [b.bill_no, b.bill_date, b.route_id, b.shop_name, b.total]; }) };
    if (action === "saveShops") return { ok: true, added: 0, updated: 1, shops: demoShops };
    return { ok: false, message: "Not available in the demo company." };
  }

  window.SalesDesk = { render: render };
})();
