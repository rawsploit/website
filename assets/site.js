/* ============================================================
   Shared site logic: client lookup, sign-in, session, branding.
   ============================================================ */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);

  /* ---------- client ---------- */
  function clientId() {
    var id = (params.get("c") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    return window.CLIENTS[id] ? id : "demo";
  }
  function client() { return window.CLIENTS[clientId()]; }
  function isDemo() { return !client().api; }
  function link(page, extra) {
    var q = new URLSearchParams(extra || {});
    q.set("c", clientId());
    return page + "?" + q.toString();
  }

  /* ---------- session (per browser tab) ---------- */
  var KEY = "suite.session";
  function getSession() {
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (!s || s.client !== clientId()) return null;
      if (s.expires && Date.now() > s.expires) { clearSession(); return null; }
      return s;
    } catch (e) { return null; }
  }
  function setSession(s) {
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: session lasts this page only */ }
    window.__session = s;
  }
  function clearSession() { try { sessionStorage.removeItem(KEY); } catch (e) {} window.__session = null; }

  /* ---------- backend call (client core Apps Script) ----------
     text/plain avoids a CORS preflight, which Apps Script can't answer. */
  function api(action, payload) {
    return fetch(client().api, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    }).then(function (r) {
      if (!r.ok) throw new Error("The server didn't respond (" + r.status + "). Try again in a minute.");
      return r.json();
    });
  }

  /* ---------- demo accounts (only when the client has no backend) ---------- */
  var DEMO_STAFF = {
    admin:    { password: "admin",    role: "admin",    name: "Anita (Manager)" },
    factory:  { password: "factory",  role: "factory",  name: "Ravi (Stores)" },
    sales:    { password: "sales",    role: "sales",    name: "Joseph (Sales)" },
    accounts: { password: "accounts", role: "accounts", name: "Meera (Accounts)" }
  };
  var DEMO_CUSTOMERS = { "C1001": { password: "shop", name: "City Supermarket" } };

  function signIn(kind, username, password) {
    username = String(username || "").trim();
    password = String(password || "");
    if (!username || !password) return Promise.reject(new Error("Enter your username and password."));

    if (isDemo()) {
      var table = kind === "customer" ? DEMO_CUSTOMERS : DEMO_STAFF;
      var key = kind === "customer" ? username.toUpperCase() : username.toLowerCase();
      var u = table[key];
      if (!u || u.password !== password) return Promise.reject(new Error("That username and password don't match."));
      var s = { client: clientId(), kind: kind, user: key, name: u.name, role: u.role || "customer",
                token: "demo", expires: Date.now() + 8 * 3600e3 };
      setSession(s);
      return Promise.resolve(s);
    }

    return api(kind === "customer" ? "customerLogin" : "login", { username: username, password: password })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.message) || "That username and password don't match.");
        var s = { client: clientId(), kind: kind, user: res.user, name: res.name, role: res.role,
                  token: res.token, expires: res.expires };
        setSession(s);
        return s;
      });
  }

  /* ---------- roles ---------- */
  function modulesFor(role) {
    return window.MODULES.filter(function (m) {
      return role === "admin" || m.teams.indexOf(role) !== -1;
    });
  }
  function teamName(role) {
    var t = window.TEAMS.filter(function (x) { return x.id === role; })[0];
    return t ? t.name : role;
  }

  /* ---------- branding ---------- */
  function brand() {
    document.querySelectorAll("[data-site-name]").forEach(function (el) { el.textContent = window.SITE.name; });
    document.querySelectorAll("[data-site-initial]").forEach(function (el) { el.textContent = window.SITE.name.charAt(0); });
    document.querySelectorAll("[data-client-name]").forEach(function (el) { el.textContent = client().name; });
    document.querySelectorAll("[data-credit]").forEach(function (el) {
      el.textContent = "© " + window.SITE.year + " " + window.SITE.name + ". " + window.SITE.credit;
    });
    document.querySelectorAll("a[data-page]").forEach(function (a) {
      a.href = link(a.getAttribute("data-page"), a.dataset.kind ? { as: a.dataset.kind } : null);
    });
    if (document.title.indexOf("{site}") !== -1) document.title = document.title.replace("{site}", window.SITE.name);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  window.Suite = {
    params: params, clientId: clientId, client: client, isDemo: isDemo, link: link,
    getSession: getSession, clearSession: clearSession, signIn: signIn, api: api,
    modulesFor: modulesFor, teamName: teamName, brand: brand, esc: esc
  };
  document.addEventListener("DOMContentLoaded", brand);
})();
