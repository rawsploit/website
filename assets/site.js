/* ============================================================
   Shared site logic: client lookup, sign-in, session, branding.
   ============================================================ */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);

  /* ---------- client ---------- */
  function clientId() {
    var id = (params.get("c") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!window.CLIENTS[id]) {
      try { id = localStorage.getItem("suite.client") || ""; } catch (e) { id = ""; }
    }
    id = window.CLIENTS[id] ? id : "demo";
    try { localStorage.setItem("suite.client", id); } catch (e) {}
    return id;
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
    accounts: { password: "accounts", role: "accounts", name: "Meera (Accounts)" },
    hr:       { password: "hr",       role: "hr",       name: "Hari (HR)" },
    marketing: { password: "marketing", role: "marketing", name: "Maya (Marketing)" },
    viewer:   { password: "viewer",   role: "viewer",   name: "Owner (Viewer)" }
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
        // a starting or reset password: they set their own before going in (the session is kept only after that)
        if (res.mustChange) return { mustChange: true, session: s, oldPassword: password };
        setSession(s);
        return s;
      });
  }

  /* ---------- roles ---------- */
  /* Modules that have a look-only mode for the Viewer team. */
  var VIEW_ONLY_MODULES = ["collections", "nexus", "cashrecon", "books", "pnl", "payroll", "mis"];
  function modulesFor(role) {
    return window.MODULES.filter(function (m) {
      if (role === "viewer") return VIEW_ONLY_MODULES.indexOf(m.id) !== -1;
      return role === "admin" || m.teams.indexOf(role) !== -1;
    });
  }
  function teamName(role) {
    var t = window.TEAMS.filter(function (x) { return x.id === role; })[0];
    return t ? t.name : role;
  }

  /* ---------- branding ---------- */
  function brand() {
    /* login backdrop colour per client: "teal" (default) or "blue" */
    var theme = ["teal", "blue", "maroon"].indexOf(client().theme) >= 0 ? client().theme : "teal";
    document.body.classList.remove("theme-teal", "theme-blue", "theme-maroon");
    document.body.classList.add("theme-" + theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", { teal: "#0E5E63", blue: "#1D4FA8", maroon: "#7A1F2E" }[theme]);
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

  /* ---------- brand kit (Admin → Company setup → Brand) ----------
     Logo, colour and background pattern. Kept in this browser so pages draw at once,
     then refreshed from the core. The demo keeps it in this tab only (Reset demo clears it). */
  var BRAND_KEY = "suite.brand.";
  function brandCached() {
    try {
      var raw = isDemo() ? sessionStorage.getItem("suite.demoBrand") : localStorage.getItem(BRAND_KEY + clientId());
      return JSON.parse(raw || "null") || {};
    } catch (e) { return {}; }
  }
  function brandKeep(b) {
    try {
      var raw = JSON.stringify({ logo: b.logo || "", accent: b.accent || "", pattern: b.pattern || "" });
      if (isDemo()) sessionStorage.setItem("suite.demoBrand", raw); else localStorage.setItem(BRAND_KEY + clientId(), raw);
    } catch (e) { /* storage full or blocked: the page still shows it now */ }
  }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mixHex(rgb, to, t) {
    return "#" + rgb.map(function (v, i) { var x = Math.round(v + (to[i] - v) * t); return ("0" + x.toString(16)).slice(-2); }).join("");
  }
  /* colours made from one picked colour: deep (darker), mid (lighter), soft (pale), ink (text on it) */
  function brandColours(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return null;
    var c = hexRgb(hex), lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    return { acc: hex, deep: mixHex(c, [0, 0, 0], 0.35), mid: mixHex(c, [255, 255, 255], 0.18), soft: mixHex(c, [255, 255, 255], 0.9),
             ink: lum > 0.62 ? "#1B1E2B" : "#FFFFFF" };
  }
  function applyBrand(b) {
    b = b || {};
    var root = document.documentElement.style, body = document.body;
    var col = brandColours(b.accent);
    if (body) {
      body.classList.toggle("branded", !!col);
      body.classList.toggle("has-pattern", !!b.pattern);
    }
    if (col) {
      root.setProperty("--b-acc", col.acc); root.setProperty("--b-deep", col.deep); root.setProperty("--b-mid", col.mid);
      root.setProperty("--b-soft", col.soft); root.setProperty("--b-ink", col.ink);
    }
    root.setProperty("--b-pattern", b.pattern ? 'url("' + String(b.pattern).replace(/["\\()]/g, "") + '")' : "none");
    document.querySelectorAll("img[data-client-logo]").forEach(function (img) {
      if (b.logo) { img.src = b.logo; img.alt = client().name; img.hidden = false; } else { img.hidden = true; img.removeAttribute("src"); }
    });
  }
  /* draws the kept brand at once, then fetches the latest (real companies) */
  function loadBrand() {
    var b = brandCached();
    applyBrand(b);
    if (isDemo() || !client().api) return Promise.resolve(b);
    return api("status", {}).then(function (r) {
      if (r && r.ok && r.brand) { brandKeep(r.brand); applyBrand(r.brand); return r.brand; }
      return b;
    }).catch(function () { return b; });
  }
  /* Demo company: forget every picture, colour and word anyone added in this tab. */
  function resetDemo() {
    ["suite.demoBrand", "suite.sfDemo", "suite.sfDemoState"].forEach(function (k) { try { sessionStorage.removeItem(k); } catch (e) {} });
    applyBrand({});
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Kalavara's own contact buttons (WhatsApp, call, email), put together in the browser only */
  function contactInfo() {
    var C = window.CONTACT || {};
    var digits = (C.phone || []).join("");
    return { digits: digits, shown: C.phone ? "+" + C.phone.join(" ") : "",
             email: C.mail ? C.mail[0] + String.fromCharCode(64) + C.mail.slice(1).join(".") : "" };
  }
  function contactHtml(withEmail) {
    var c = contactInfo(), h = "";
    if (c.digits) h += '<a class="btn btn-ink btn-small" target="_blank" rel="noopener" href="https://wa.me/' + c.digits +
      "?text=" + encodeURIComponent("Hello, I'd like to know more about Kalavara.") + '">WhatsApp us</a>' +
      '<a class="btn btn-line btn-small" href="tel:+' + c.digits + '">Call ' + esc(c.shown) + "</a>";
    h = '<span class="contact-btns">' + h + "</span>";
    if (withEmail !== false && c.email) h += '<span>Email: <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a></span>";
    return h;
  }

  window.Suite = {
    params: params, clientId: clientId, client: client, isDemo: isDemo, link: link,
    brandCached: brandCached, brandKeep: brandKeep, brandColours: brandColours, applyBrand: applyBrand, loadBrand: loadBrand, resetDemo: resetDemo,
    getSession: getSession, clearSession: clearSession, signIn: signIn, api: api, setSession: setSession,
    modulesFor: modulesFor, teamName: teamName, brand: brand, esc: esc,
    contactInfo: contactInfo, contactHtml: contactHtml
  };
  document.addEventListener("DOMContentLoaded", brand);
})();
