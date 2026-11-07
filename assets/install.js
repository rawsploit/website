/* ============================================================
   Install as an app: Android gets an Install button; iPhone and
   iPad (Safari) get a one-line "Share, then Add to Home Screen" hint.
   Shows nothing when already running as an installed app.
   ============================================================ */
(function () {
  "use strict";
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  var installed = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (installed) return;

  var dismissed = false;
  try { dismissed = localStorage.getItem("suite.installDismissed") === "1"; } catch (e) {}
  if (dismissed) return;

  var ua = navigator.userAgent;
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  function bar(html) {
    var el = document.createElement("div");
    el.className = "install-bar";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Install the app");
    el.innerHTML = html + '<button type="button" class="install-close" aria-label="Not now">×</button>';
    el.querySelector(".install-close").onclick = function () {
      el.remove();
      try { localStorage.setItem("suite.installDismissed", "1"); } catch (e) {}
    };
    document.body.appendChild(el);
    return el;
  }

  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    var el = bar('<span>Install ' + Suite.esc(window.SITE.name) + ' on this device</span><button type="button" class="btn btn-ink btn-small install-go">Install</button>');
    el.querySelector(".install-go").onclick = function () {
      deferred.prompt();
      deferred.userChoice.finally(function () { el.remove(); deferred = null; });
    };
  });

  if (isIOS) {
    document.addEventListener("DOMContentLoaded", function () {
      bar(isSafari
        ? '<span>Install the app: tap <b>Share</b> <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" style="vertical-align:-2px"><path d="M7 1v9M3.5 4.5 7 1l3.5 3.5M2 8v6.5h10V8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> then <b>Add to Home Screen</b>.</span>'
        : "<span>To install the app on iPhone, open this page in <b>Safari</b>.</span>");
    });
  }
})();
