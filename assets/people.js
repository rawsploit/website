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
    if (action === "listUsers") return { ok: true, users: demo.users, roles: ["admin", "factory", "sales", "accounts"] };
    if (action === "listCustomers") return { ok: true, customers: demo.customers };
    if (action === "saveUser") {
      var u = Object.assign({ status: "active", locked: false, lastLogin: "" }, p.user); delete u.password;
      demo.users = demo.users.filter(function (x) { return x.username !== u.username; }).concat([u]);
      return { ok: true };
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
    call("listUsers").then(function (res) {
      var rows = res.users.map(function (u) {
        var state = u.status !== "active" ? '<span class="status soon">Off</span>' : u.locked ? '<span class="status soon">Locked</span>' : '<span class="status live">Active</span>';
        return "<tr><td><b>" + esc(u.name) + "</b><br><span class=\"muted\">" + esc(u.username) + "</span></td><td>" + esc(Suite.teamName(u.role)) +
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

  function userForm(body, u) {
    var isNew = !u; u = u || { username: "", name: "", role: "factory", status: "active" };
    var box = body.querySelector("#userForm");
    box.innerHTML = '<form class="panel" novalidate><h3>' + (isNew ? "Add a person" : "Edit " + esc(u.name)) + "</h3>" +
      '<div class="form-grid">' +
      '<label class="field"><span>Name</span><input name="name" value="' + esc(u.name) + '" required></label>' +
      '<label class="field"><span>Username</span><input name="username" value="' + esc(u.username) + '"' + (isNew ? "" : " readonly") + ' required></label>' +
      '<label class="field"><span>Team</span><select name="role">' + teamOptions(u.role) + "</select></label>" +
      '<label class="field"><span>Sign-in</span><select name="status"><option value="active"' + (u.status === "active" ? " selected" : "") + '>On</option><option value="off"' + (u.status !== "active" ? " selected" : "") + ">Off</option></select></label>" +
      '<label class="field"><span>' + (isNew ? "Starting password" : "New password (leave blank to keep)") + '</span><input name="password" type="password" autocomplete="new-password"></label>' +
      "</div>" + (u.locked ? '<p class="muted">This sign-in is locked after too many wrong passwords. Setting a new password unlocks it.</p>' : "") +
      '<p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="submit">' + (isNew ? "Add person" : "Save changes") +
      '</button><button class="btn btn-line" type="button" data-cancel>Cancel</button></div></form>';
    var f = box.querySelector("form");
    f.querySelector("[data-cancel]").onclick = function () { box.innerHTML = ""; };
    f.onsubmit = function (e) {
      e.preventDefault();
      var d = { name: f.name.value.trim(), username: f.username.value.trim().toLowerCase(), role: f.role.value, status: f.status.value, password: f.password.value };
      var err = !d.name ? "Enter the person's name." : !d.username ? "Choose a username." : isNew && d.password.length < 8 ? "Give them a starting password of at least 8 characters." : "";
      if (err) { f.querySelector(".form-error").textContent = err; return; }
      f.querySelector("[type=submit]").disabled = true;
      call("saveUser", { user: d }).then(function () { staff(body); })
        .catch(function (e2) { f.querySelector(".form-error").textContent = e2.message; f.querySelector("[type=submit]").disabled = false; });
    };
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
      body.innerHTML = '<div class="row-head"><h3>Customer sign-ins</h3><button class="btn btn-ink btn-small" type="button" id="addCust">Add a customer</button></div>' +
        '<p class="muted" style="margin-bottom:12px">Customers see your products and prices. They can\'t see anything else.</p>' +
        table(["Customer", "Phone", "State", "Last sign-in", ""], rows) + '<div id="custForm"></div>';
      body.querySelector("#addCust").onclick = function () { custForm(body, null); };
      body.querySelectorAll("[data-edit]").forEach(function (b) {
        b.onclick = function () { custForm(body, res.customers.filter(function (c) { return c.code === b.dataset.edit; })[0]); };
      });
    }).catch(function (e) { body.innerHTML = '<p class="form-error">' + esc(e.message) + "</p>"; });
  }

  function custForm(body, c) {
    var isNew = !c; c = c || { code: "", name: "", phone: "", status: "active" };
    var box = body.querySelector("#custForm");
    box.innerHTML = '<form class="panel" novalidate><h3>' + (isNew ? "Add a customer" : "Edit " + esc(c.name)) + "</h3><div class=\"form-grid\">" +
      '<label class="field"><span>Shop or company name</span><input name="name" value="' + esc(c.name) + '" required></label>' +
      '<label class="field"><span>Customer code</span><input name="code" value="' + esc(c.code) + '"' + (isNew ? "" : " readonly") + ' required></label>' +
      '<label class="field"><span>Phone</span><input name="phone" type="tel" value="' + esc(c.phone) + '"></label>' +
      '<label class="field"><span>Sign-in</span><select name="status"><option value="active"' + (c.status === "active" ? " selected" : "") + '>On</option><option value="off"' + (c.status !== "active" ? " selected" : "") + ">Off</option></select></label>" +
      '<label class="field"><span>' + (isNew ? "Starting password" : "New password (leave blank to keep)") + '</span><input name="password" type="password" autocomplete="new-password"></label>' +
      '</div><p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="submit">' + (isNew ? "Add customer" : "Save changes") +
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
    f.name.focus();
  }

  function company(body) {
    var cl = Suite.client();
    body.innerHTML = '<form class="panel" novalidate style="max-width:560px"><h3>Company</h3>' +
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

  window.People = { renderPeople: renderPeople, renderPassword: renderPassword };
})();
