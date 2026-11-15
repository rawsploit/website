/* ============================================================
   Tally Books (companies that keep their accounts in Tally).
   Read-only view of what Kalavara Tally Link brings in:
   Day Book, Ledgers and Stock Summary. Nothing here changes
   Tally. Tally writes debits as minus amounts; this screen
   shows them as Dr and Cr.
   ============================================================ */
(function () {
  "use strict";
  var esc = Suite.esc;
  var D = null, tab = "daybook", filt = { q: "", type: "", ledger: "" }, open = {};

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
    if (Suite.isDemo()) return Promise.resolve(demoData());
    var s = Suite.getSession();
    return Suite.api("tallyBooks", { token: s.token }).then(function (r) {
      if (!r.ok) throw new Error(r.message || "Couldn't open Tally Books.");
      return r;
    });
  }

  /* ---------- formatting ---------- */
  function inr(n) { return Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function drcr(n) { return n === 0 ? "–" : inr(n) + (n < 0 ? " Dr" : " Cr"); }
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
    if (/^(daybook|ledgers|stock)$/.test(startTab || "")) tab = startTab;
    root.innerHTML = '<div class="view"><p>Loading from Tally…</p></div>';
    load().then(function (r) { D = r; draw(root); })
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
      [["daybook", "Day Book"], ["ledgers", "Ledgers"], ["stock", "Stock Summary"]].map(function (t) {
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
      if (q && (l.name + " " + l.group).toLowerCase().indexOf(q) === -1) return;
      (groups[l.group || "Others"] = groups[l.group || "Others"] || []).push(l);
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

  function draw(root) {
    var body = tab === "ledgers" ? ledgersView() : tab === "stock" ? stockView() : dayBook();
    root.innerHTML = '<div class="view tb">' + head() + '<div class="tb-body">' + body + "</div></div>";
    root.querySelector("#tbReload").onclick = function () { render(root); };
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
