/* ============================================================
   Tally Books (companies that keep their accounts in Tally).
   What CentraPlant Tally Link brings in (Day Book, Ledgers,
   Stock Summary: read-only), and "To Tally": the accountant's
   batch of what goes into Tally (new shop ledgers for now).
   The link only ever creates; it never deletes or alters.
   Tally writes debits as minus amounts; this screen shows
   them as Dr and Cr.
   ============================================================ */
(function () {
  "use strict";
  var esc = Suite.esc;
  var D = null, OB = [], SETUP = null, BILLS = null, tab = "", filt = { q: "", type: "", ledger: "" }, open = {};

  /* ---------- data ---------- */
  function demoData() {
    var v = function (date, type, number, party, amount, lines, narration) { return { date: date, type: type, number: number, party: party, amount: amount, lines: lines, narration: narration || "" }; };
    return {
      ok: true,
      status: { lastSync: new Date(Date.now() - 6 * 60000).toISOString(), tallyCompany: Suite.client().name, counts: { ledgers: 9, items: 3, vouchers: 9 } },
      ledgers: [
        { name: "Capital A/c", group: "Capital Account", opening: 119000, closing: 119000 },
        { name: "SBI Current A/c", group: "Bank Accounts", opening: -100000, closing: -105100 },
        { name: "Cash", group: "Cash-in-Hand", opening: 0, closing: 0 },
        { name: "Sales A/c", group: "Sales Accounts", opening: 0, closing: 6100 },
        { name: "Fresh Mart", group: "Sundry Debtors", opening: 0, closing: 0 },
        { name: "Green Valley Stores", group: "Sundry Debtors", opening: 0, closing: 0 },
        { name: "City Supermarket", group: "Sundry Debtors", opening: 0, closing: 0 },
        { name: "Bad Debts", group: "Indirect Expenses", opening: 0, closing: -1000 },
        { name: "Profit & Loss A/c", group: "", opening: 0, closing: 0 }
      ],
      items: [
        { name: "Hand Wash 500ml", group: "Cleaning Products", unit: "Nos", qty: 75, value: 4500 },
        { name: "Floor Cleaner 1L", group: "Cleaning Products", unit: "Nos", qty: 90, value: 8100 },
        { name: "Sanitizer 200ml", group: "Cleaning Products", unit: "Nos", qty: 70, value: 2800 }
      ],
      vouchers: [
        v("2026-11-02", "Journal", "1", "Fresh Mart", 1000, [{ l: "Bad Debts", a: -1000 }, { l: "Fresh Mart", a: 1000 }], "Balance of bill 1 written off"),
        v("2026-11-02", "Credit Note", "1", "Fresh Mart", 500, [{ l: "Fresh Mart", a: 500 }, { l: "Sales A/c", a: -500 }], "Excess delivery returned against bill 1"),
        v("2026-11-02", "Contra", "1", "", 3600, [{ l: "SBI Current A/c", a: -3600 }, { l: "Cash", a: 3600 }], "Cash collected 2-Nov deposited"),
        v("2026-11-02", "Receipt", "3", "City Supermarket", 2100, [{ l: "Cash", a: -2100 }, { l: "City Supermarket", a: 2100 }]),
        v("2026-11-02", "Receipt", "2", "Green Valley Stores", 1500, [{ l: "SBI Current A/c", a: -1500 }, { l: "Green Valley Stores", a: 1500 }]),
        v("2026-11-02", "Receipt", "1", "Fresh Mart", 1500, [{ l: "Cash", a: -1500 }, { l: "Fresh Mart", a: 1500 }]),
        v("2026-11-01", "Sales", "3", "City Supermarket", 2100, [{ l: "City Supermarket", a: -2100 }, { l: "Sales A/c", a: 2100 }]),
        v("2026-11-01", "Sales", "2", "Fresh Mart", 3000, [{ l: "Fresh Mart", a: -3000 }, { l: "Sales A/c", a: 3000 }]),
        v("2026-11-01", "Sales", "1", "Green Valley Stores", 1500, [{ l: "Green Valley Stores", a: -1500 }, { l: "Sales A/c", a: 1500 }])
      ]
    };
  }
  function load() {
    if (Suite.isDemo()) { OB = demoOutbox(); return Promise.resolve(demoData()); }
    var s = Suite.getSession();
    // one request for the whole screen; a busy server gets one quiet retry
    var once = function () { return Suite.api("tallyBooksAll", { token: s.token }); };
    // an older Core without tallyBooksAll: ask for the parts one after another (never all at once)
    var oldCore = function () {
      var out = { ok: true }, soft = function (a) { return Suite.api(a, { token: s.token }).catch(function () { return { ok: false }; }); };
      return Suite.api("tallyBooks", { token: s.token }).then(function (b) {
        if (!b.ok) return b;
        out.books = b;
        return soft("tallyOutbox").then(function (x) { out.outbox = x; return soft("tallySetup"); })
          .then(function (x) { out.setup = x; return soft("tallyBills"); })
          .then(function (x) { out.bills = x; return out; });
      });
    };
    return once().then(function (r) {
      if (r && !r.ok && r.message === "Unknown action.") return oldCore();
      return r && r.busy ? new Promise(function (ok) { setTimeout(ok, 2500); }).then(once) : r;
    }).then(function (r) {
      if (!r.ok) throw new Error(r.message || "Couldn't open Tally Books.");
      var part = function (x) { return x && x.ok ? x : null; };
      OB = part(r.outbox) ? r.outbox.items || [] : [];
      SETUP = part(r.setup);
      BILLS = part(r.bills);
      return r.books;
    });
  }
  function demoOutbox() {
    var k = "suite.demoTallyBatch", list = null;
    try { list = JSON.parse(sessionStorage.getItem(k) || "null"); } catch (e) {}
    if (!list) {
      var t = new Date(Date.now() - 50 * 60000).toISOString();
      list = [
        { id: "D1", kind: "ledger", ref: "S0101", name: "Sri Ganesh Stores", status: "pending", created: t, created_by: "anu (Billing)", result: "", details: { group: "Sundry Debtors", gstin: "", state: "Kerala", address: "Near Bus Stand", phone: "9800001111" } },
        { id: "D2", kind: "ledger", ref: "S0102", name: "Fresh Mart Junction", status: "pending", created: t, created_by: "ravi (Field Sales)", result: "Check: same GSTIN as \u201cFresh Mart\u201d (S0003, route R1). Fine if it's a branch of the same business.", details: { group: "Sundry Debtors", gstin: "32AAAAA1111A1Z1", state: "Kerala", address: "Junction", phone: "" } }
      ];
      try { sessionStorage.setItem(k, JSON.stringify(list)); } catch (e) {}
    }
    return list;
  }
  function obCall(action, payload) {
    if (Suite.isDemo()) {
      OB.forEach(function (x) {
        if ((payload.ids || [payload.id]).indexOf(x.id) === -1) return;
        if (action === "tallyApprove") { x.status = payload.what === "reject" ? "cancelled" : "approved"; x.result = payload.what === "reject" ? "Rejected: " + payload.reason : ""; }
        if (action === "tallyOutboxAction") x.status = payload.what === "cancel" ? "cancelled" : "approved";
      });
      try { sessionStorage.setItem("suite.demoTallyBatch", JSON.stringify(OB)); } catch (e) {}
      return Promise.resolve({ ok: true, done: (payload.ids || [1]).length, queued: [], skipped: [] });
    }
    var send = function () { return Suite.api(action, Object.assign({ token: Suite.getSession().token }, payload)); };
    return send().then(function (r) {
      return r && r.busy ? new Promise(function (ok) { setTimeout(ok, 2500); }).then(send) : r;
    }).then(function (r) {
      if (!r.ok) throw new Error(r.message || "That didn't work.");
      return r;
    });
  }
  function canAct() { var s = Suite.getSession(); return !!s && (s.role === "admin" || s.role === "accounts"); }
  function pendingCount() {
    return OB.filter(function (x) { return x.status === "pending"; }).length +
      (BILLS ? BILLS.bills.length : 0);
  }
  function kindLabel(x) { return x.kind === "sales" ? "Sales bill: " : x.kind === "cnote" ? "Credit note (shop returns): " : x.kind === "item" ? "New stock item: " : "New ledger: "; }

  /* ---------- formatting ---------- */
  function inr(n) { return Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function drcr(n) { return n === 0 ? "–" : inr(n) + (n < 0 ? " Dr" : " Cr"); }
  function money(n) { return "\u20b9" + inr(Number(n) || 0); }
  function disp(ymd) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "")); return m ? m[3] + "-" + m[2] + "-" + m[1] : String(ymd || ""); }
  function day(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return esc(iso);
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  }
  function ago(iso) {
    if (!iso) return "never";
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  /* ---------- screen ---------- */
  function render(root, startTab) {
    if (/^(totally|daybook|ledgers|stock)$/.test(startTab || "")) tab = startTab;
    root.innerHTML = '<div class="view"><p>Loading from Tally…</p></div>';
    load().then(function (r) { D = r; if (!tab) tab = pendingCount() ? "totally" : "daybook"; draw(root); })
      .catch(function (e) { root.innerHTML = '<div class="view"><p class="form-error">' + esc(e.message) + "</p></div>"; });
  }

  function head() {
    var st = D.status || {};
    var stale = st.lastSync && Date.now() - new Date(st.lastSync).getTime() > 60 * 60000;
    return '<div class="tb-head"><div><b>From Tally</b> · ' + esc(st.tallyCompany || "") +
      ' <span class="muted">· last synced ' + esc(ago(st.lastSync)) + "</span>" +
      (stale ? ' <span class="status soon">Not updated for over an hour: is Tally open on the Tally PC?</span>' : "") +
      (Suite.isDemo() ? ' <span class="status custom">Demo data</span>' : "") + "</div>" +
      '<button class="btn btn-line btn-small" type="button" id="tbReload">Refresh</button></div>' +
      '<div class="switch tb-switch">' +
      [["totally", "To Tally" + (pendingCount() ? " (" + pendingCount() + ")" : "")], ["daybook", "Day Book"], ["ledgers", "Ledgers"], ["stock", "Stock Summary"]].map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + "</button>";
      }).join("") + "</div>";
  }

  function dayBook() {
    var types = D.vouchers.map(function (v) { return v.type; }).filter(function (t, i, a) { return t && a.indexOf(t) === i; });
    var q = filt.q.toLowerCase();
    var list = D.vouchers.filter(function (v) {
      if (filt.type && v.type !== filt.type) return false;
      if (filt.ledger && !v.lines.some(function (e) { return e.l === filt.ledger; }) && v.party !== filt.ledger) return false;
      if (q && (v.party + " " + v.number + " " + v.narration + " " + v.lines.map(function (e) { return e.l; }).join(" ")).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var byType = {};
    list.forEach(function (v) { byType[v.type] = (byType[v.type] || 0) + v.amount; });
    var html = '<div class="tb-filters"><input type="search" id="tbQ" placeholder="Search party, ledger, number or narration" value="' + esc(filt.q) + '">' +
      '<select id="tbType"><option value="">All voucher types</option>' + types.map(function (t) {
        return '<option' + (filt.type === t ? " selected" : "") + ">" + esc(t) + "</option>";
      }).join("") + "</select>" +
      (filt.ledger ? '<span class="tb-chip">Ledger: ' + esc(filt.ledger) + ' <button type="button" id="tbClearLedger" aria-label="Show all ledgers">×</button></span>' : "") + "</div>";
    html += '<div class="tb-totals">' + Object.keys(byType).map(function (t) {
      return "<span><b>" + esc(t) + "</b> ₹" + inr(byType[t]) + "</span>";
    }).join("") + "</div>";
    if (!list.length) return html + '<p class="muted">' + (D.vouchers.length ? "Nothing matches." : "No vouchers from Tally yet. Vouchers from the last 45 days come in with each sync.") + "</p>";
    html += '<div class="tbl-wrap"><table class="tbl tb-table"><thead><tr><th>Date</th><th>Particulars</th><th>Type</th><th>No.</th><th class="num">Amount (₹)</th></tr></thead><tbody>';
    list.forEach(function (v, i) {
      var key = v.date + "|" + v.type + "|" + v.number + "|" + i;
      var particulars = v.party || (v.lines[0] ? v.lines[0].l : "");
      html += '<tr class="tb-row" data-open="' + esc(key) + '"><td>' + day(v.date) + "</td><td>" + esc(particulars) +
        (v.narration ? '<br><small class="muted">' + esc(v.narration) + "</small>" : "") + "</td><td>" + esc(v.type) + "</td><td>" + esc(v.number) +
        '</td><td class="num">' + inr(v.amount) + "</td></tr>";
      if (open[key]) {
        html += '<tr class="tb-lines"><td></td><td colspan="4"><table><tbody>' + v.lines.map(function (e) {
          return "<tr><td>" + esc(e.l) + '</td><td class="num">' + (e.a < 0 ? inr(e.a) + " Dr" : "") + '</td><td class="num">' + (e.a > 0 ? inr(e.a) + " Cr" : "") + "</td></tr>";
        }).join("") + "</tbody></table></td></tr>";
      }
    });
    return html + "</tbody></table></div>";
  }

  function ledgersView() {
    var q = filt.q.toLowerCase();
    var groups = {};
    D.ledgers.forEach(function (l) {
      if (q && (l.name + " " + (l.group === "Primary" ? "Profit & Loss" : l.group)).toLowerCase().indexOf(q) === -1) return;
      // Tally keeps only the Profit & Loss ledger under "Primary" (no parent group)
      var g = (!l.group || l.group === "Primary") ? "Profit & Loss" : l.group;
      (groups[g] = groups[g] || []).push(l);
    });
    var names = Object.keys(groups).sort();
    var html = '<div class="tb-filters"><input type="search" id="tbQ" placeholder="Search ledger or group" value="' + esc(filt.q) + '"></div>';
    if (!names.length) return html + '<p class="muted">' + (D.ledgers.length ? "Nothing matches." : "No ledgers from Tally yet.") + "</p>";
    html += '<div class="tbl-wrap"><table class="tbl tb-table"><thead><tr><th>Ledger</th><th class="num">Opening (₹)</th><th class="num">Closing (₹)</th></tr></thead><tbody>';
    names.forEach(function (g) {
      var sum = groups[g].reduce(function (t, l) { return t + l.closing; }, 0);
      html += '<tr class="tb-group"><td>' + esc(g) + '</td><td></td><td class="num">' + drcr(sum) + "</td></tr>";
      groups[g].sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (l) {
        html += '<tr class="tb-row" data-ledger="' + esc(l.name) + '" title="Show this ledger\'s vouchers"><td style="padding-left:22px">' + esc(l.name) + '</td><td class="num">' + drcr(l.opening) +
          '</td><td class="num">' + drcr(l.closing) + "</td></tr>";
      });
    });
    return html + "</tbody></table></div><p class=\"muted\" style=\"margin-top:8px\">Click a ledger to see its vouchers in the Day Book.</p>";
  }

  function stockView() {
    var total = D.items.reduce(function (t, i) { return t + i.value; }, 0);
    if (!D.items.length) return '<p class="muted">No stock items from Tally yet.</p>';
    return '<div class="tbl-wrap"><table class="tbl tb-table"><thead><tr><th>Item</th><th>Group</th><th class="num">Closing quantity</th><th class="num">Value (₹)</th></tr></thead><tbody>' +
      D.items.slice().sort(function (a, b) { return a.name < b.name ? -1 : 1; }).map(function (i) {
        return "<tr><td>" + esc(i.name) + "</td><td>" + esc(i.group) + '</td><td class="num">' + i.qty.toLocaleString("en-IN") + " " + esc(i.unit) +
          '</td><td class="num">' + inr(i.value) + "</td></tr>";
      }).join("") + '<tr class="tb-group"><td>Total</td><td></td><td></td><td class="num">' + inr(total) + "</td></tr></tbody></table></div>";
  }


  /* ---------- To Tally: the accountant's batch ---------- */
  var OB_STATUS = { pending: "Awaiting your approval", approved: "Approved · waiting for the Tally Link", sending: "Being sent", posted: "Created in Tally",
                    exists: "Already in Tally", failed: "Failed", cancelled: "Cancelled / rejected" };
  function toTallyView() {
    var act = canAct();
    var pend = OB.filter(function (x) { return x.status === "pending"; });
    var queued = OB.filter(function (x) { return x.status === "approved" || x.status === "sending"; });
    var failed = OB.filter(function (x) { return x.status === "failed"; });
    var done = OB.filter(function (x) { return /^(posted|exists|cancelled)$/.test(x.status); }).slice(0, 30);
    var when = function (iso) { return iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""; };
    var detail = function (x) {
      var d = x.details || {};
      return [d.group, d.gstin ? "GSTIN " + d.gstin : "No GSTIN", d.state, d.phone, d.address].filter(Boolean).map(esc).join(" · ");
    };
    var html = '<p class="muted" style="margin:4px 0 14px">What CentraPlant will put into Tally. Nothing goes in until it\'s approved here, ' +
      "and the Tally Link only <b>creates</b> new entries: it never deletes or changes anything already in Tally. Ledgers go in before anything that needs them.</p>";
    html += "<h3 style=\"margin:0 0 8px\">Waiting for approval" + (pend.length ? " (" + pend.length + ")" : "") + "</h3>";
    if (!pend.length) html += '<p class="muted">Nothing waiting. New shops added by salesmen (Billing or Field Sales) appear here.</p>';
    else {
      html += '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + (act ? '<th><input type="checkbox" id="obAll" checked aria-label="Tick all"></th>' : "") +
        "<th>What</th><th>Details</th><th>Added by</th></tr></thead><tbody>" +
        pend.map(function (x) {
          return "<tr>" + (act ? '<td><input type="checkbox" data-ob="' + esc(x.id) + '" checked></td>' : "") +
            "<td><b>New ledger:</b> " + esc(x.name) + (x.result ? '<br><span class="status soon" style="white-space:normal;display:inline-block;margin-top:4px">' + esc(x.result.replace(/^Check:\s*/, "Check: ")) + "</span>" : "") +
            "</td><td><small>" + detail(x) + "</small></td><td><small>" + (x.created_by === "auto" ? "Needed by a bill (shop not in Tally)" : esc(x.created_by)) + "<br>" + esc(when(x.created)) + "</small></td></tr>";
        }).join("") + "</tbody></table></div>" +
        (act ? '<p class="form-error" id="obErr"></p><div class="row-btns"><button class="btn btn-ink btn-small" type="button" id="obApprove">Approve ticked</button>' +
               '<button class="btn btn-line btn-small" type="button" id="obReject">Reject ticked…</button></div>' : "");
    }
    var setupFirst = BILLS && BILLS.bills.some(function (b) { return b.problems.length; });
    if (setupFirst) html += setupHtml(act);
    html += billsHtml(act);
    if (queued.length) {
      var held = queued.filter(function (x) { return /^Waiting for/.test(x.result || ""); });
      html += '<p class="demo-hint" style="margin:16px 0 0">' + queued.length + " approved, waiting for the Tally Link (it runs every 15 minutes while Tally is open)." +
        (held.length ? " " + held.length + " of them can't go yet: " + held.slice(0, 3).map(function (x) { return esc(x.name) + " (" + esc(x.result.replace(/^Waiting for /, "needs ")) + ")"; }).join("; ") + (held.length > 3 ? "…" : "") : "") + "</p>";
    }
    if (!setupFirst) html += setupHtml(act);
    if (failed.length) {
      html += '<h3 style="margin:20px 0 8px">Didn\'t go into Tally (' + failed.length + ")</h3>" + '<div class="tbl-wrap"><table class="tbl"><tbody>' +
        failed.map(function (x) {
          return "<tr><td><b>" + kindLabel(x) + "</b>" + esc(x.name) + "<br><small>" + esc(x.result) + "</small></td><td>" +
            (act ? '<button class="btn btn-line btn-small" type="button" data-retry="' + esc(x.id) + '">Try again</button> <button class="btn btn-line btn-small" type="button" data-cancel="' + esc(x.id) + '">Cancel</button>' : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    if (done.length) {
      html += '<details style="margin-top:20px"><summary style="cursor:pointer"><b>Done lately</b> <span class="muted">(' + done.length + ")</span></summary>" +
        '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><tbody>' + done.map(function (x) {
          return "<tr><td>" + kindLabel(x) + esc(x.name) + "</td><td>" + esc(OB_STATUS[x.status] || x.status) + "</td><td><small>" + esc(x.result) + "</small></td><td><small>" + esc(when(x.done || x.created)) + "</small></td></tr>";
        }).join("") + "</tbody></table></div></details>";
    }
    return html;
  }

  /* ---------- sales bills not yet in Tally ---------- */
  function billsHtml(act) {
    if (!BILLS) return "";
    var list = BILLS.bills;
    var html = '<h3 style="margin:22px 0 8px">Sales bills not in Tally' + (list.length ? " (" + list.length + ")" : "") + '</h3>';
    if (!list.length) return html + '<p class="muted">Every bill since ' + esc(disp(BILLS.from)) + ' is in Tally or on its way.</p>';
    var auto = BILLS.auto || {};
    var manual = function (b) { return b.goes !== "auto"; };
    var ready = list.filter(function (b) { return !b.problems.length && manual(b); }).length;
    var vt = esc((SETUP && SETUP.settings.vtype) || "Sales");
    html += '<p class="muted" style="margin:0 0 8px">' + (auto.on
      ? "Bills dated from <b>" + esc(disp(auto.from)) + "</b> go into Tally <b>automatically</b> as " + vt + " vouchers on the next Tally Link run. " +
        "Only a <b>new shop</b> needs your approval; its bills follow once you approve it. Check the money side in Trade Recon."
      : "Approved bills go in as <b>" + vt + "</b> vouchers with their items and GST. A bill whose shop, items or ledgers aren't in Tally yet waits and goes in right after them.") + "</p>";
    html += '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + (act && ready ? '<th><input type="checkbox" id="blAll" checked aria-label="Tick all"></th>' : act ? "<th></th>" : "") +
      '<th>Date</th><th>Bill</th><th>Shop</th><th>By</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>' +
      list.map(function (b) {
        var bad = b.problems.length;
        var st = bad ? '<span class="status" style="background:#FDECEA;color:#9B1C1C">Fix setup first</span><br><small>' + esc(b.problems.join("; ")) + "</small>"
          : b.waiting.length ? '<span class="status soon">Will wait for</span><br><small>' + esc(b.waiting.join(", ")) + "</small>"
          : manual(b) ? '<span class="status live">Ready</span>' + (auto.on ? '<br><small>Before the automatic start date: approve it by hand</small>' : "")
          : '<span class="status live">Goes automatically</span>';
        return "<tr>" + (act ? "<td>" + (manual(b) ? '<input type="checkbox" data-bill="' + esc(b.uuid) + '"' + (bad ? " disabled" : " checked") + ">" : "") + "</td>" : "") +
          "<td>" + esc(disp(b.date)) + "</td><td>" + esc(b.bill_no) + "</td><td>" + esc(b.shop) + "</td><td>" + esc(b.by) +
          '</td><td class="num">' + money(b.total) + "</td><td>" + st + "</td></tr>";
      }).join("") + "</tbody></table></div>" + (BILLS.more ? '<p class="muted">…and ' + BILLS.more + " more.</p>" : "") +
      (act && list.some(manual) ? '<p class="form-error" id="blErr"></p><div class="row-btns"><button class="btn btn-ink btn-small" type="button" id="blApprove">Approve ticked bills</button></div>' : "");
    return html;
  }

  /* ---------- setup: ledgers and product ↔ Tally item ---------- */
  function setupHtml(act) {
    if (!SETUP) return "";
    var S = SETUP.settings, A = SETUP.auto || {}, missingItems = SETUP.products.filter(function (p) { return !p.tally; });
    var needsLedgers = !S.sales || !S.cgst || !S.sgst || !S.round;
    var open = needsLedgers || missingItems.length;
    var opt = function (cur, list, blank) {
      return '<option value="">' + (blank || "(choose)") + "</option>" + list.map(function (n) { return '<option' + (n === cur ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("");
    };
    var ledNames = SETUP.ledgers.map(function (l) { return l.name; });
    var stdMissing = SETUP.std.filter(function (x) { return !x.exists && !x.coming; });
    var row = function (key, label) {
      return '<label class="field" style="margin:0"><span>' + label + (SETUP.guessed[key] ? ' <small class="muted">(suggested)</small>' : "") + '</span><select data-led="' + key + '"' + (act ? "" : " disabled") + ">" + opt(S[key], ledNames) + "</select></label>";
    };
    var html = '<details class="panel" style="margin:22px 0 0"' + (open ? " open" : "") + '><summary style="cursor:pointer"><b>Tally setup for bills</b> <span class="muted">· ' +
      (open ? (needsLedgers ? "ledgers to choose" : "") + (needsLedgers && missingItems.length ? ", " : "") + (missingItems.length ? missingItems.length + " product" + (missingItems.length === 1 ? "" : "s") + " to match" : "") : "all set") +
      "</span></summary>" +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:12px 0">' +
      row("sales", "Sales ledger") + row("cgst", "CGST ledger") + row("sgst", "SGST ledger") + row("igst", "IGST ledger (other states)") + row("round", "Round off ledger") +
      '<label class="field" style="margin:0"><span>Voucher type</span><input data-led="vtype" value="' + esc(S.vtype || "Sales") + '"' + (act ? "" : " disabled") + "></label>" +
      '<label class="field" style="margin:0"><span>Shop returns voucher type</span><input data-led="vtypeCn" value="' + esc(S.vtypeCn || "Credit Note") + '"' + (act ? "" : " disabled") + "></label></div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin:0 0 12px">' +
        '<label><input type="checkbox" id="suAuto"' + (A.on ? " checked" : "") + (act ? "" : " disabled") + "> Send bills to Tally <b>automatically</b> (only new shops need approval)</label>" +
        '<label class="muted">from <input type="date" id="suFrom" value="' + esc(A.from || "") + '"' + (act ? "" : " disabled") + "></label>" +
        '<small class="muted">Bills dated before this need approving by hand, so bills already typed into Tally aren\'t sent twice.</small></div>' +
      (act && stdMissing.length ? '<p style="margin:0 0 12px"><button class="btn btn-line btn-small" type="button" id="suStd">Create ' + stdMissing.map(function (x) { return esc(x.name); }).join(", ") +
        ' in Tally</button> <small class="muted">GST ledgers under Duties &amp; Taxes, round off under Indirect Expenses</small></p>' : "") +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Pack</th><th>Tally stock item</th>' + (act ? "<th>Create in Tally</th>" : "") + "</tr></thead><tbody>" +
      SETUP.products.map(function (p) {
        var items = SETUP.items.map(function (i) { return i.name; });
        if (p.tally && items.indexOf(p.tally) === -1) items.push(p.tally);
        return "<tr><td>" + esc(p.name) + (p.notInList ? ' <small class="muted">(on recent bills, not in the product list)</small>' : "") + "</td><td>" + esc(p.pack || p.uom) + '</td><td><select data-item="' + esc(p.sku) + '"' + (act ? "" : " disabled") + ">" + opt(p.tally, items, "(not matched)") + "</select>" +
          (p.how && p.how !== "matched" ? ' <small class="muted">' + esc(p.how) + "</small>" : "") + "</td>" +
          (act ? "<td>" + (p.tally ? "" : '<label><input type="checkbox" data-mk="' + esc(p.sku) + '"> as “' + esc(p.tallyName || p.name) + "” (Nos)</label>") + "</td>" : "") + "</tr>";
      }).join("") + "</tbody></table></div>" +
      (act ? '<p class="form-error" id="suErr"></p><div class="row-btns"><button class="btn btn-ink btn-small" type="button" id="suSave">Save setup</button>' +
             (missingItems.length ? '<button class="btn btn-line btn-small" type="button" id="suMake">Create ticked items in Tally</button>' : "") + "</div>" : "") +
      "</details>";
    return html;
  }

  function bindBillsSetup(root) {
    var all = root.querySelector("#blAll");
    if (all) all.onchange = function () { var on = this.checked; root.querySelectorAll("[data-bill]:not(:disabled)").forEach(function (c) { c.checked = on; }); };
    var ap = root.querySelector("#blApprove");
    if (ap) ap.onclick = function () {
      var ids = []; root.querySelectorAll("[data-bill]:checked").forEach(function (c) { ids.push(c.dataset.bill); });
      var err = root.querySelector("#blErr");
      if (!ids.length) { err.textContent = "Tick at least one bill."; return; }
      ap.disabled = true; err.textContent = "";
      obCall("tallySendBills", { uuids: ids }).then(function (r) {
        if (r.skipped && r.skipped.length) window.alert("Not sent:\n" + r.skipped.join("\n"));
        render(root, "totally");
      }).catch(function (e) { err.textContent = e.message; ap.disabled = false; });
    };
    var err2 = root.querySelector("#suErr");
    var save = root.querySelector("#suSave");
    if (save) save.onclick = function () {
      var settings = {}, items = {};
      root.querySelectorAll("[data-led]").forEach(function (el) { settings[el.dataset.led] = el.value; });
      root.querySelectorAll("[data-item]").forEach(function (el) { items[el.dataset.item] = el.value; });
      save.disabled = true; err2.textContent = "";
      var au = root.querySelector("#suAuto"), fr = root.querySelector("#suFrom");
      var auto = au ? { on: au.checked, from: fr ? fr.value : "" } : undefined;
      obCall("tallySaveSetup", { settings: settings, items: items, auto: auto }).then(function () { render(root, "totally"); })
        .catch(function (e) { err2.textContent = e.message; save.disabled = false; });
    };
    var make = root.querySelector("#suMake");
    if (make) make.onclick = function () {
      var skus = []; root.querySelectorAll("[data-mk]:checked").forEach(function (c) { skus.push(c.dataset.mk); });
      if (!skus.length) { err2.textContent = "Tick the products to create in Tally."; return; }
      make.disabled = true; err2.textContent = "";
      obCall("tallyCreateMasters", { skus: skus }).then(function () { render(root, "totally"); })
        .catch(function (e) { err2.textContent = e.message; make.disabled = false; });
    };
    var std = root.querySelector("#suStd");
    if (std) std.onclick = function () {
      std.disabled = true;
      obCall("tallyCreateMasters", { standardLedgers: true }).then(function () { render(root, "totally"); })
        .catch(function (e) { err2.textContent = e.message; std.disabled = false; });
    };
  }

  function bindToTally(root) {
    bindBillsSetup(root);
    var all = root.querySelector("#obAll");
    if (all) all.onchange = function () { var on = this.checked; root.querySelectorAll("[data-ob]").forEach(function (c) { c.checked = on; }); };
    var picked = function () { var ids = []; root.querySelectorAll("[data-ob]:checked").forEach(function (c) { ids.push(c.dataset.ob); }); return ids; };
    var err = root.querySelector("#obErr");
    var go = function (payload, btn) {
      if (!payload.ids.length) { err.textContent = "Tick at least one."; return; }
      btn.disabled = true; err.textContent = "";
      obCall("tallyApprove", payload).then(function () { render(root, "totally"); }).catch(function (e) { err.textContent = e.message; btn.disabled = false; });
    };
    var ap = root.querySelector("#obApprove");
    if (ap) ap.onclick = function () { go({ ids: picked() }, ap); };
    var rj = root.querySelector("#obReject");
    if (rj) rj.onclick = function () {
      var ids = picked(); if (!ids.length) { err.textContent = "Tick at least one."; return; }
      var why = window.prompt("Why are you rejecting " + (ids.length === 1 ? "this" : "these " + ids.length) + "? (the salesman and office will see this, e.g. \"same as Fresh Mart\")");
      if (!why || !why.trim()) return;
      go({ ids: ids, what: "reject", reason: why.trim() }, rj);
    };
    root.querySelectorAll("[data-retry],[data-cancel]").forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        obCall("tallyOutboxAction", { id: b.dataset.retry || b.dataset.cancel, what: b.dataset.retry ? "retry" : "cancel" })
          .then(function () { render(root, "totally"); }).catch(function (e) { b.disabled = false; window.alert(e.message); });
      };
    });
  }

  function draw(root) {
    var body = tab === "totally" ? toTallyView() : tab === "ledgers" ? ledgersView() : tab === "stock" ? stockView() : dayBook();
    root.innerHTML = '<div class="view tb">' + head() + '<div class="tb-body">' + body + "</div></div>";
    root.querySelector("#tbReload").onclick = function () { render(root, tab); };
    if (tab === "totally") bindToTally(root);
    root.querySelectorAll("[data-tab]").forEach(function (b) {
      b.onclick = function () { tab = b.dataset.tab; filt.q = ""; draw(root); };
    });
    var qIn = root.querySelector("#tbQ");
    if (qIn) qIn.oninput = function () {
      filt.q = qIn.value; var pos = qIn.selectionStart; draw(root);
      var n = root.querySelector("#tbQ"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {}
    };
    var tSel = root.querySelector("#tbType");
    if (tSel) tSel.onchange = function () { filt.type = tSel.value; draw(root); };
    var clr = root.querySelector("#tbClearLedger");
    if (clr) clr.onclick = function () { filt.ledger = ""; draw(root); };
    root.querySelectorAll("[data-open]").forEach(function (r) {
      r.onclick = function () { open[r.dataset.open] = !open[r.dataset.open]; draw(root); };
    });
    root.querySelectorAll("[data-ledger]").forEach(function (r) {
      r.onclick = function () { filt.ledger = r.dataset.ledger; filt.q = ""; filt.type = ""; tab = "daybook"; draw(root); };
    });
  }

  window.TallyBooks = { render: render };
})();
