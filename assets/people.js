/* ============================================================
   People and setup (admins) + My password (everyone).
   Talks to the client core; in demo mode works on sample data
   in memory so the screens can be tried without saving anything.
   ============================================================ */
(function () {
  "use strict";
  var esc = Suite.esc;

  var demo = {
    users: [
      { username: "admin", name: "Anita (Manager)", role: "admin", status: "active", locked: false, lastLogin: "" },
      { username: "factory", name: "Ravi (Stores)", role: "factory", status: "active", locked: false, lastLogin: "" },
      { username: "sales", name: "Joseph (Sales)", role: "sales", status: "active", locked: false, lastLogin: "" },
      { username: "accounts", name: "Meera (Accounts)", role: "accounts", status: "active", locked: false, lastLogin: "" }
    ],
    customers: [{ code: "C1001", name: "City Supermarket", phone: "", status: "active", lastLogin: "" }]
  };

  function call(action, payload) {
    var s = Suite.getSession();
    if (Suite.isDemo()) return Promise.resolve(demoCall(action, payload || {}));
    return Suite.api(action, Object.assign({ token: s.token }, payload || {})).then(function (res) {
      if (!res.ok) throw new Error(res.message || "That didn't work. Try again.");
      return res;
    });
  }
  function demoCall(action, p) {
    if (action === "listUsers") return { ok: true, users: demo.users, roles: ["admin", "factory", "sales", "accounts", "hr", "marketing"] };
    if (action === "listCustomers") return { ok: true, customers: demo.customers };
    if (action === "profile") return { ok: true, plants: [{ plant_id: "P1", name: "Soap Plant", active: true }, { plant_id: "P2", name: "Detergent Plant", active: true }] };
    if (action === "saveUser") {
      var u = Object.assign({ status: "active", locked: false, lastLogin: "" }, p.user); delete u.password;
      demo.users = demo.users.filter(function (x) { return x.username !== u.username; }).concat([u]);
      return { ok: true };
    }
    if (action === "resetPassword") return { ok: true, password: "Kala-1234-demo" };
    if (action === "deleteUser") { demo.users = demo.users.filter(function (x) { return x.username !== p.username; }); return { ok: true }; }
    if (action === "deleteCustomer") { demo.customers = demo.customers.filter(function (x) { return x.code !== p.code; }); return { ok: true }; }
    if (action === "saveCustomers") {
      var np = [], added = 0, upd = 0;
      p.customers.forEach(function (c) {
        var code = String(c.code).toUpperCase(), had = demo.customers.some(function (x) { return x.code === code; });
        if (had) upd++; else { added++; if (!c.password) np.push({ code: code, name: c.name, password: "Kala-1234-demo" }); }
        demo.customers = demo.customers.filter(function (x) { return x.code !== code; })
          .concat([{ code: code, name: c.name, phone: c.phone || "", status: /^(no|off)$/i.test(c.active || "") ? "off" : "active", lastLogin: "" }]);
      });
      return { ok: true, added: added, updated: upd, newPasswords: np };
    }
    if (action === "saveCustomer") {
      var c = Object.assign({ status: "active", lastLogin: "" }, p.customer); delete c.password; c.code = c.code.toUpperCase();
      demo.customers = demo.customers.filter(function (x) { return x.code !== c.code; }).concat([c]);
      return { ok: true };
    }
    return { ok: true };
  }

  function teamOptions(sel) {
    return window.TEAMS.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === sel ? " selected" : "") + ">" + esc(t.name) + "</option>";
    }).join("");
  }
  function when(iso) { return iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"; }
  function demoNote() { return Suite.isDemo() ? '<p class="demo-hint" style="margin:0 0 18px">Demo company: you can try these screens, but nothing is saved.</p>' : ""; }

  /* ---------------- People and setup ---------------- */
  function renderPeople(root) {
    root.innerHTML = '<div class="view">' + demoNote() +
      '<div class="switch" role="group" aria-label="Section" style="max-width:420px;grid-template-columns:1fr 1fr 1fr">' +
      '<button type="button" data-tab="staff" aria-pressed="true">Staff</button>' +
      '<button type="button" data-tab="customers" aria-pressed="false">Customers</button>' +
      '<button type="button" data-tab="company" aria-pressed="false">Company</button></div>' +
      '<div id="peopleBody"></div></div>';
    var body = root.querySelector("#peopleBody");
    root.querySelectorAll("[data-tab]").forEach(function (b) {
      b.onclick = function () {
        root.querySelectorAll("[data-tab]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
        show(b.dataset.tab);
      };
    });
    function show(tab) {
      if (tab === "staff") staff(body);
      else if (tab === "customers") customers(body);
      else company(body);
    }
    show("staff");
  }

  function table(head, rows) {
    return '<div style="overflow-x:auto"><table class="tbl"><thead><tr>' + head.map(function (h) { return "<th>" + h + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
  }

  function staff(body) {
    body.innerHTML = "<p>Loading…</p>";
    var plantsReq = call("profile").then(function (p) { return (p.plants || []).filter(function (x) { return x.active; }); }).catch(function () { return []; });
    Promise.all([call("listUsers"), plantsReq]).then(function (both) {
      var res = both[0]; PLANTS = both[1];
      var rows = res.users.map(function (u) {
        var state = u.status !== "active" ? '<span class="status soon">Off</span>' : u.locked ? '<span class="status soon">Locked</span>' : '<span class="status live">Active</span>';
        return "<tr><td><b>" + esc(u.name) + "</b><br><span class=\"muted\">" + esc(u.username) + (u.empCode ? " · " + esc(u.empCode) : "") + "</span></td><td>" + esc(Suite.teamName(u.role)) +
          (u.role === "factory" && PLANTS.length > 1 ? '<br><span class="muted">' + esc(plantLabel(u.plants)) + "</span>" : "") +
          "</td><td>" + state + "</td><td>" + when(u.lastLogin) + '</td><td><button class="btn btn-line btn-small" type="button" data-edit="' + esc(u.username) + '">Edit</button></td></tr>';
      });
      body.innerHTML = '<div class="row-head"><h3>Staff sign-ins</h3><button class="btn btn-ink btn-small" type="button" id="addUser">Add a person</button></div>' +
        table(["Person", "Team", "State", "Last sign-in", ""], rows) + '<div id="userForm"></div>';
      body.querySelector("#addUser").onclick = function () { userForm(body, null); };
      body.querySelectorAll("[data-edit]").forEach(function (b) {
        b.onclick = function () { userForm(body, res.users.filter(function (u) { return u.username === b.dataset.edit; })[0]); };
      });
    }).catch(function (e) { body.innerHTML = '<p class="form-error">' + esc(e.message) + "</p>"; });
  }


  /* Forgotten password: makes a one-time password to pass on; they choose their own when they sign in with it. */
  function resetButton(f, kind, id, name) {
    var row = f.querySelector(".row-actions");
    var b = document.createElement("button"); b.type = "button"; b.className = "btn btn-line"; b.textContent = "Reset password";
    b.onclick = function () {
      b.disabled = true; b.textContent = "Resetting…";
      call("resetPassword", { kind: kind, id: id }).then(function (r) {
        b.textContent = "Reset password"; b.disabled = false;
        f.querySelector("#pwReset").innerHTML = '<div class="pw-box">One-time password for <b>' + esc(name) + '</b>: <code style="font-size:16px">' + esc(r.password) +
          "</code><br>Share it with them privately (for example on WhatsApp). When they sign in with it, they will choose their own. It is shown only now.</div>";
      }).catch(function (e) { b.disabled = false; b.textContent = "Reset password"; f.querySelector(".form-error").textContent = e.message; });
    };
    row.appendChild(b);
  }

  /* Two-step remove: the first click asks, the second removes. */
  function removeButton(f, label, warn, run) {
    var row = f.querySelector(".row-actions");
    var b = document.createElement("button"); b.type = "button"; b.className = "btn btn-line btn-danger"; b.textContent = label;
    b.style.marginLeft = "auto";
    var note = document.createElement("p"); note.className = "muted"; note.style.margin = "10px 0 0"; note.hidden = true; note.textContent = warn;
    b.onclick = function () {
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Yes, remove"; note.hidden = false; return; }
      b.disabled = true; b.textContent = "Removing…";
      run().catch(function (e) { f.querySelector(".form-error").textContent = e.message; b.disabled = false; b.textContent = label; delete b.dataset.sure; });
    };
    row.appendChild(b); row.parentNode.insertBefore(note, row.nextSibling);
  }

  var PLANTS = [];
  function plantLabel(ids) {
    ids = ids || [];
    var names = PLANTS.filter(function (p) { return ids.indexOf(p.plant_id) > -1; }).map(function (p) { return p.name; });
    return names.length ? names.join(", ") : "All plants";
  }
  /* Factory team only: which plants this person works in. None ticked = every plant. */
  function plantPicker(u) {
    if (PLANTS.length < 2) return "";
    var mine = u.plants || [];
    return '<fieldset class="field" id="plantBox" style="border:0;padding:0;margin:0 0 12px"><span>Plants they work in</span>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:6px">' +
      PLANTS.map(function (p) {
        return '<label style="display:flex;align-items:center;gap:6px;font-weight:400;white-space:nowrap"><input type="checkbox" style="width:auto;margin:0" name="plant" value="' + esc(p.plant_id) + '"' +
          (mine.indexOf(p.plant_id) > -1 ? " checked" : "") + "> " + esc(p.name) + "</label>";
      }).join("") + '</div><p class="muted" style="margin:6px 0 0">They will see only these plants in StockBook. Leave all unticked to let them see every plant. Admins always see every plant.</p></fieldset>';
  }

  function userForm(body, u) {
    var isNew = !u; u = u || { username: "", name: "", role: "factory", status: "active" };
    var box = body.querySelector("#userForm");
    box.innerHTML = '<form class="panel" novalidate><h3>' + (isNew ? "Add a person" : "Edit " + esc(u.name)) + "</h3>" +
      '<div class="form-grid">' +
      '<label class="field"><span>Name</span><input name="name" value="' + esc(u.name) + '" required></label>' +
      '<label class="field"><span>Username</span><input name="username" value="' + esc(u.username) + '"' + (isNew ? "" : " readonly") + ' required></label>' +
      '<label class="field"><span>Team</span><select name="role">' + teamOptions(u.role) + "</select></label>" +
      '<label class="field"><span>Sign-in</span><select name="status"><option value="active"' + (u.status === "active" ? " selected" : "") + '>On</option><option value="off"' + (u.status !== "active" ? " selected" : "") + ">Off</option></select></label>" +
      (isNew ? '<label class="field"><span>Starting password</span><input name="password" type="password" autocomplete="new-password"></label>' : '<input name="password" type="hidden" value="">') +
      '<label class="field"><span>Employee code (optional)</span><input name="empCode" value="' + esc(u.empCode || "") + '" maxlength="20" placeholder="e.g. HG-014"></label>' +
      '<label class="field"><span>Email (optional)</span><input name="email" type="email" value="' + esc(u.email || "") + '" maxlength="120"></label>' +
      '<label class="field"><span>Phone (optional)</span><input name="phone" type="tel" value="' + esc(u.phone || "") + '" maxlength="20"></label>' +
      "</div>" + plantPicker(u) + (isNew ? '<p class="muted">Give them this password. When they first sign in, they will be asked to choose their own. They will also appear in Payroll for HR to add their salary.</p>' : "") +
      '<div id="pwReset"></div>' + (u.locked ? '<p class="muted">This sign-in is locked after too many wrong passwords. Setting a new password unlocks it.</p>' : "") +
      '<p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="submit">' + (isNew ? "Add person" : "Save changes") +
      '</button><button class="btn btn-line" type="button" data-cancel>Cancel</button></div></form>';
    var f = box.querySelector("form");
    f.querySelector("[data-cancel]").onclick = function () { box.innerHTML = ""; };
    var pbox = f.querySelector("#plantBox");
    function showPlants() { if (pbox) pbox.hidden = f.role.value !== "factory"; }
    f.role.addEventListener("change", showPlants); showPlants();
    function d_plants() {
      if (!pbox || f.role.value !== "factory") return [];
      return Array.prototype.slice.call(f.querySelectorAll("input[name=plant]:checked")).map(function (x) { return x.value; });
    }
    f.onsubmit = function (e) {
      e.preventDefault();
      var d = { name: f.name.value.trim(), username: f.username.value.trim().toLowerCase(), role: f.role.value, status: f.status.value, password: f.password.value,
                empCode: f.empCode.value.trim().toUpperCase(), email: f.email.value.trim(), phone: f.phone.value.trim(),
                plants: d_plants() };
      var err = !d.name ? "Enter the person's name." : !d.username ? "Choose a username." : isNew && d.password.length < 8 ? "Give them a starting password of at least 8 characters." : "";
      if (err) { f.querySelector(".form-error").textContent = err; return; }
      f.querySelector("[type=submit]").disabled = true;
      call("saveUser", { user: d }).then(function () { staff(body); })
        .catch(function (e2) { f.querySelector(".form-error").textContent = e2.message; f.querySelector("[type=submit]").disabled = false; });
    };
    var me = Suite.getSession();
    if (!isNew && (!me || me.user !== u.username)) resetButton(f, "staff", u.username, u.name);
    if (!isNew && (!me || me.user !== u.username)) {
      removeButton(f, "Remove person", "Use this when someone leaves. Their sign-in is removed and they are signed out straight away. Bills, entries and reports keep their name. " +
        "If they might come back, set Sign-in to Off instead.", function () {
        return call("deleteUser", { username: u.username }).then(function () { staff(body); });
      });
    }
    f.name.focus();
  }

  function customers(body) {
    body.innerHTML = "<p>Loading…</p>";
    call("listCustomers").then(function (res) {
      var rows = res.customers.map(function (c) {
        return "<tr><td><b>" + esc(c.name) + "</b><br><span class=\"muted\">" + esc(c.code) + "</span></td><td>" + esc(c.phone || "") +
          "</td><td>" + (c.status === "active" ? '<span class="status live">Active</span>' : '<span class="status soon">Off</span>') + "</td><td>" + when(c.lastLogin) +
          '</td><td><button class="btn btn-line btn-small" type="button" data-edit="' + esc(c.code) + '">Edit</button></td></tr>';
      });
      body.innerHTML = '<div class="row-head"><h3>Customer sign-ins</h3><span class="row-actions" style="margin:0">' +
        '<button class="btn btn-line btn-small" type="button" id="custTpl">Download template</button>' +
        '<label class="btn btn-line btn-small" style="cursor:pointer">Upload a list<input type="file" id="custFile" accept=".xlsx,.xls,.csv" hidden></label>' +
        '<button class="btn btn-ink btn-small" type="button" id="addCust">Add a customer</button></span></div>' +
        '<p class="muted" style="margin-bottom:12px">Customers see your products and prices. They can\'t see anything else. ' +
        "Many customers at once? Download the template, fill one row per customer and upload it. Leave the password empty and we'll make one for each new customer.</p>" +
        '<div id="custUpload"></div>' +
        table(["Customer", "Phone", "State", "Last sign-in", ""], rows) + '<div id="custForm"></div>';
      body.querySelector("#addCust").onclick = function () { custForm(body, null); };
      body.querySelector("#custTpl").onclick = function () {
        Xlsx.download("customer-signins-template.xlsx", [{ name: "Customers", columns: ["code", "name", "phone", "active", "password"], types: ["text", "text", "text", "text", "text"],
          rows: [["C1002", "Example Stores", "9000000000", "yes", ""]] }]);
      };
      body.querySelector("#custFile").onchange = function (ev) { var f = ev.target.files[0]; ev.target.value = ""; if (f) uploadCustomers(body, f); };
      body.querySelectorAll("[data-edit]").forEach(function (b) {
        b.onclick = function () { custForm(body, res.customers.filter(function (c) { return c.code === b.dataset.edit; })[0]); };
      });
    }).catch(function (e) { body.innerHTML = '<p class="form-error">' + esc(e.message) + "</p>"; });
  }

  /* ---------- bulk upload of customer sign-ins ---------- */
  var XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  var CUST_ALIASES = { code: ["code", "customer code", "customer_code", "id"], name: ["name", "customer", "shop", "shop name", "customer name"],
    phone: ["phone", "mobile", "phone number"], active: ["active", "sign-in", "status"], password: ["password", "starting password"] };
  function parseCsv(text) {
    var rows = [], row = [], cur = "", q = false; text = text.replace(/^\uFEFF/, "");
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function readTable(file) {
    var isCsv = /\.csv$/i.test(file.name);
    var aoaP = isCsv ? file.text().then(parseCsv) : new Promise(function (res, rej) {
      if (window.XLSX) return res();
      var sc = document.createElement("script"); sc.src = XLSX_URL; sc.onload = res;
      sc.onerror = function () { rej(new Error("Couldn't load the Excel reader. Check the internet connection, or upload a CSV file.")); };
      document.head.appendChild(sc);
    }).then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = XLSX.read(buf, { type: "array" });
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    });
    return aoaP.then(function (aoa) {
      while (aoa.length && aoa[0].every(function (c) { return String(c).trim() === ""; })) aoa.shift();
      if (aoa.length < 2) throw new Error("The file has no rows under the header.");
      var head = aoa[0].map(function (h) { return String(h).trim().toLowerCase(); }), map = {};
      Object.keys(CUST_ALIASES).forEach(function (k) { var at = head.findIndex(function (h) { return CUST_ALIASES[k].indexOf(h) >= 0; }); if (at >= 0) map[k] = at; });
      if (map.code === undefined || map.name === undefined) throw new Error("The file needs a \u201ccode\u201d and a \u201cname\u201d column. Download the template to see the layout.");
      return aoa.slice(1).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); }).map(function (r) {
        var o = {}; Object.keys(map).forEach(function (k) { o[k] = String(r[map[k]] === undefined ? "" : r[map[k]]).trim(); }); return o;
      });
    });
  }
  function uploadCustomers(body, file) {
    var box = body.querySelector("#custUpload");
    box.innerHTML = '<p class="muted">Reading ' + esc(file.name) + "…</p>";
    readTable(file).then(function (list) {
      box.innerHTML = '<p class="muted">Saving ' + list.length + " customers…</p>";
      return call("saveCustomers", { customers: list });
    }).then(function (res) {
      var msg = '<div class="panel"><h3>Upload done</h3><p>' + res.added + " new, " + res.updated + " updated.</p>";
      if (res.newPasswords && res.newPasswords.length) {
        msg += '<p><b>Starting passwords for the new customers.</b> They are shown only now, so download the list and share each one privately (for example on WhatsApp).</p>' +
          table(["Customer code", "Name", "Starting password"], res.newPasswords.map(function (p) {
            return "<tr><td>" + esc(p.code) + "</td><td>" + esc(p.name) + '</td><td><code>' + esc(p.password) + "</code></td></tr>";
          })) + '<div class="row-actions"><button class="btn btn-ink btn-small" type="button" id="pwDl">Download passwords (Excel)</button></div>';
      }
      box.innerHTML = msg + "</div>";
      var dl = box.querySelector("#pwDl");
      if (dl) dl.onclick = function () {
        Xlsx.download("customer-starting-passwords.xlsx", [{ name: "Passwords", columns: ["Customer code", "Name", "Starting password"], types: ["text", "text", "text"],
          rows: res.newPasswords.map(function (p) { return [p.code, p.name, p.password]; }) }]);
      };
      return call("listCustomers").then(function (r2) {
        // refresh the table under the result, keeping the result box
        var keep = box.innerHTML; customers(body);
        setTimeout(function () { var b2 = body.querySelector("#custUpload"); if (b2) { b2.innerHTML = keep; var d2 = b2.querySelector("#pwDl"); if (d2 && dl) d2.onclick = dl.onclick; } }, 400);
      });
    }).catch(function (e) { box.innerHTML = '<div class="panel"><p class="form-error">' + esc(e.message) + "</p></div>"; });
  }

  function custForm(body, c) {
    var isNew = !c; c = c || { code: "", name: "", phone: "", status: "active" };
    var box = body.querySelector("#custForm");
    box.innerHTML = '<form class="panel" novalidate><h3>' + (isNew ? "Add a customer" : "Edit " + esc(c.name)) + "</h3><div class=\"form-grid\">" +
      '<label class="field"><span>Shop or company name</span><input name="name" value="' + esc(c.name) + '" required></label>' +
      '<label class="field"><span>Customer code</span><input name="code" value="' + esc(c.code) + '"' + (isNew ? "" : " readonly") + ' required></label>' +
      '<label class="field"><span>Phone</span><input name="phone" type="tel" value="' + esc(c.phone) + '"></label>' +
      '<label class="field"><span>Sign-in</span><select name="status"><option value="active"' + (c.status === "active" ? " selected" : "") + '>On</option><option value="off"' + (c.status !== "active" ? " selected" : "") + ">Off</option></select></label>" +
      (isNew ? '<label class="field"><span>Starting password</span><input name="password" type="password" autocomplete="new-password"></label>' : '<input name="password" type="hidden" value="">') +
      "</div>" + (isNew ? '<p class="muted">Give them this password. When they first sign in, they will be asked to choose their own.</p>' : "") +
      '<div id="pwReset"></div><p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="submit">' + (isNew ? "Add customer" : "Save changes") +
      '</button><button class="btn btn-line" type="button" data-cancel>Cancel</button></div></form>';
    var f = box.querySelector("form");
    f.querySelector("[data-cancel]").onclick = function () { box.innerHTML = ""; };
    f.onsubmit = function (e) {
      e.preventDefault();
      var d = { name: f.name.value.trim(), code: f.code.value.trim(), phone: f.phone.value.trim(), status: f.status.value, password: f.password.value };
      var err = !d.name ? "Enter the customer's name." : !d.code ? "Give them a customer code, like C1002." : isNew && d.password.length < 8 ? "Give them a starting password of at least 8 characters." : "";
      if (err) { f.querySelector(".form-error").textContent = err; return; }
      f.querySelector("[type=submit]").disabled = true;
      call("saveCustomer", { customer: d }).then(function () { customers(body); })
        .catch(function (e2) { f.querySelector(".form-error").textContent = e2.message; f.querySelector("[type=submit]").disabled = false; });
    };
    if (!isNew) resetButton(f, "customer", c.code, c.name);
    if (!isNew) {
      removeButton(f, "Remove customer", "Their sign-in is removed and they are signed out straight away. Their past orders stay.", function () {
        return call("deleteCustomer", { code: c.code }).then(function () { customers(body); });
      });
    }
    f.name.focus();
  }

  function company(body) {
    var cl = Suite.client();
    body.innerHTML = '<p class="demo-hint" style="max-width:560px;margin-top:0">Plants, sales routes, distributors and products are in <a href="' + Suite.link("portal.html", { m: "company" }) + '">Company setup</a>.</p>' +
      '<form class="panel" novalidate style="max-width:560px"><h3>Company</h3>' +
      '<label class="field"><span>Company name</span><input name="company" value="' + esc(cl.name) + '" required></label>' +
      '<label class="field"><span>Logo link</span><input name="logo" type="url" value="' + esc(cl.logo || "") + '" placeholder="https://…"></label>' +
      '<p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="submit">Save company</button></div></form>' +
      '<div class="panel" style="max-width:560px"><h3>Sign everyone out</h3><p class="muted" style="margin:6px 0 14px">Use this if a phone or laptop with a signed-in session is lost. Everyone, including you, has to sign in again.</p>' +
      '<button class="btn btn-line" type="button" id="outAll">Sign everyone out</button><p class="muted" id="outMsg" role="status" style="margin-top:10px"></p></div>';
    var f = body.querySelector("form");
    f.onsubmit = function (e) {
      e.preventDefault();
      if (!f.company.value.trim()) { f.querySelector(".form-error").textContent = "Enter your company name."; return; }
      call("saveSettings", { company: f.company.value.trim(), logo: f.logo.value.trim() })
        .then(function () { f.querySelector(".form-error").textContent = ""; f.querySelector("[type=submit]").textContent = "Saved"; })
        .catch(function (e2) { f.querySelector(".form-error").textContent = e2.message; });
    };
    var out = body.querySelector("#outAll");
    out.onclick = function () {
      if (out.dataset.sure !== "yes") { out.dataset.sure = "yes"; out.textContent = "Yes, sign everyone out"; return; }
      call("signOutEveryone").then(function () {
        Suite.clearSession();
        body.querySelector("#outMsg").textContent = "Everyone has been signed out.";
        setTimeout(function () { location.replace(Suite.link("login.html")); }, 1200);
      }).catch(function (e2) { body.querySelector("#outMsg").textContent = e2.message; });
    };
  }

  /* ---------------- My password ---------------- */
  function renderPassword(root) {
    root.innerHTML = '<div class="view">' + demoNote() + '<form class="panel" novalidate style="max-width:460px"><h3>Change your password</h3>' +
      '<label class="field"><span>Current password</span><input name="old" type="password" autocomplete="current-password"></label>' +
      '<label class="field"><span>New password (at least 8 characters)</span><input name="nw" type="password" autocomplete="new-password"></label>' +
      '<label class="field"><span>Type the new password again</span><input name="again" type="password" autocomplete="new-password"></label>' +
      '<p class="form-error" role="alert"></p><button class="btn btn-ink" type="submit">Change password</button></form></div>';
    var f = root.querySelector("form");
    f.onsubmit = function (e) {
      e.preventDefault();
      var err = !f.old.value ? "Enter your current password." : f.nw.value.length < 8 ? "Use at least 8 characters." : f.nw.value !== f.again.value ? "The two new passwords don't match." : "";
      var msg = f.querySelector(".form-error");
      if (err) { msg.textContent = err; return; }
      call("changePassword", { oldPassword: f.old.value, newPassword: f.nw.value })
        .then(function () { f.reset(); msg.style.color = "var(--stamp)"; msg.textContent = "Password changed."; })
        .catch(function (e2) { msg.style.color = ""; msg.textContent = e2.message; });
    };
  }

  /* Marketing's own page: just the customer sign-ins. */
  function renderCustomers(root) {
    root.innerHTML = '<div class="view">' + demoNote() + '<div id="peopleBody"></div></div>';
    customers(root.querySelector("#peopleBody"));
  }

  window.People = { renderPeople: renderPeople, renderPassword: renderPassword, renderCustomers: renderCustomers };
})();
