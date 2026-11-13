/* ============================================================
   Storefront designer (Marketing and admins).
   The company's public shop page: four banner spaces laid out
   like a shop window, the words, the colour and which sections
   show. Save a draft, preview it, then publish. Until it is
   published, the company's address opens the sign-in page.
   ============================================================ */
(function () {
  "use strict";
  var esc = Suite.esc;
  var MAX_SIDE = 1800;            // banners are shrunk to this many pixels on the long side

  var SLOTS = [
    { id: "hero",  name: "Main banner",   size: "1600 × 640 (wide)",   tip: "The first thing visitors see. A wide picture with your main offer or range." },
    { id: "tile1", name: "Small banner 1", size: "800 × 450",          tip: "Under the main banner, on the left. Good for one product group." },
    { id: "tile2", name: "Small banner 2", size: "800 × 450",          tip: "Under the main banner, on the right." },
    { id: "side",  name: "Tall banner",    size: "800 × 1100 (tall)",  tip: "Down the right-hand side. A poster-style picture works well here." }
  ];

  /* ---------- talking to the core (or the demo, in this tab only) ---------- */
  function blank() {
    var b = {};
    SLOTS.forEach(function (s) { b[s.id] = { image: "", alt: "", fit: "cover", tap: "" }; });
    return { headline: "", tagline: "", blurb: "", accent: "", points: [], showSearch: true, showCategories: true, showProducts: true, banners: b };
  }
  var demo = null;
  function demoState() {
    if (!demo) {
      var saved = null;
      try { saved = JSON.parse(sessionStorage.getItem("suite.sfDemoState") || "null"); } catch (e) {}
      demo = saved || { draft: blank(), live: null, on: false };
    }
    return demo;
  }
  function demoKeep() {
    try {
      sessionStorage.setItem("suite.sfDemoState", JSON.stringify(demo));
      sessionStorage.setItem("suite.sfDemo", JSON.stringify(demo.draft));
    } catch (e) { /* pictures too large for this tab's storage: the preview shows the words only */ }
  }
  function demoView() {
    var d = demoState();
    return { ok: true, draft: d.draft, on: d.on, published: d.published || "", neverPublished: !d.live,
             changed: !!d.live && JSON.stringify(d.live) !== JSON.stringify(d.draft), categories: ["Cleaning", "Laundry", "Personal care"] };
  }
  function demoCall(action, p) {
    var d = demoState();
    if (action === "saveStorefront") {
      var keep = d.draft.banners;
      d.draft = JSON.parse(JSON.stringify(p.page));
      SLOTS.forEach(function (s) { d.draft.banners[s.id].image = keep[s.id].image; });
    } else if (action === "uploadStorefrontImage") d.draft.banners[p.slot].image = p.dataUrl;
    else if (action === "removeStorefrontImage") d.draft.banners[p.slot].image = "";
    else if (action === "publishStorefront") { d.live = JSON.parse(JSON.stringify(d.draft)); d.on = true; d.published = new Date().toISOString(); }
    else if (action === "unpublishStorefront") d.on = false;
    demoKeep();
    return demoView();
  }
  function call(action, payload) {
    var s = Suite.getSession();
    if (Suite.isDemo()) return Promise.resolve(demoCall(action, payload || {}));
    return Suite.api(action, Object.assign({ token: s.token }, payload || {})).then(function (res) {
      if (!res.ok) throw new Error(res.message || "That didn't work. Try again.");
      return res;
    });
  }

  /* ---------- screen ---------- */
  var state = null, picked = "hero", dirty = false;

  function render(root) {
    root.innerHTML = '<div class="view"><p>Loading your storefront…</p></div>';
    call("storefrontAdmin").then(function (res) { state = res; dirty = false; draw(root); })
      .catch(function (e) { root.innerHTML = '<div class="view"><p class="form-error">' + esc(e.message) + "</p></div>"; });
  }

  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }

  function statusHtml() {
    var pill = state.on ? '<span class="status live">Live</span>' : state.neverPublished ? '<span class="status soon">Not published yet</span>' : '<span class="status soon">Offline</span>';
    var note = state.on
      ? (state.changed || dirty ? "You have changes visitors can't see yet. Publish to put them live." : "Visitors see this page at your company's address. Published " + esc(when(state.published)) + ".")
      : state.neverPublished ? "Design the page, preview it, then publish. Until then, your company's address opens the sign-in page."
      : "The page is offline: your company's address opens the sign-in page. Your design is kept.";
    var pub = state.on ? (state.changed || dirty ? "Publish changes" : "Published") : "Publish";
    return '<div class="panel sfa-status"><div class="sfa-status-row"><div><h3 style="margin:0 0 6px">Your storefront ' + pill + "</h3>" +
      '<p class="muted" style="margin:0">' + note + "</p></div>" +
      '<div class="sfa-btns"><button class="btn btn-line" type="button" id="sfPreview">Preview</button>' +
      '<button class="btn btn-ink" type="button" id="sfPublish"' + (state.on && !state.changed && !dirty ? " disabled" : "") + ">" + pub + "</button>" +
      (state.on ? '<button class="btn btn-line btn-danger" type="button" id="sfOffline">Take offline</button>' : "") + "</div></div>" +
      '<p class="muted sfa-msg" id="sfMsg" role="status"></p><p class="form-error" id="sfErr" role="alert"></p></div>';
  }

  function mapHtml() {
    var b = state.draft.banners;
    var cell = function (s) {
      var img = b[s.id].image;
      return '<button type="button" class="sfa-cell sl-' + s.id + (picked === s.id ? " on" : "") + '" data-slot="' + s.id + '" aria-pressed="' + (picked === s.id) + '">' +
        (img ? '<img src="' + esc(img) + '" alt="" style="object-fit:' + (b[s.id].fit === "contain" ? "contain" : "cover") + '">' : "") +
        "<span>" + esc(s.name) + (img ? "" : "<small>Empty</small>") + "</span></button>";
    };
    return '<div class="sfa-map">' + SLOTS.map(cell).join("") + "</div>";
  }

  function slotEditorHtml() {
    var s = SLOTS.filter(function (x) { return x.id === picked; })[0];
    var slot = state.draft.banners[s.id];
    var cats = state.categories || [];
    var tapOpts = [["", "Nothing"], ["signin", "Open customer sign-in"], ["products", "Scroll to the products"]]
      .concat(cats.map(function (c) { return ["cat:" + c, "Show " + c]; }));
    var empty = s.id === "hero"
      ? "No picture: visitors see your headline and tagline on a coloured banner instead."
      : "No picture: this space is left out and the others close up.";
    return '<div class="sfa-slot"><div class="sfa-slot-pic sl-' + s.id + '">' + (slot.image ? '<img src="' + esc(slot.image) + '" alt="" style="object-fit:' + (slot.fit === "contain" ? "contain" : "cover") + '">' : '<p class="muted">' + empty + "</p>") + "</div>" +
      '<div class="sfa-slot-body"><h3 style="margin:0 0 4px">' + esc(s.name) + '</h3><p class="muted" style="margin:0 0 12px">' + esc(s.tip) + " Best size: " + esc(s.size) + " pixels.</p>" +
      '<div class="row-actions" style="margin:0 0 14px"><label class="btn btn-line btn-small">' + (slot.image ? "Change picture" : "Upload picture") +
      '<input type="file" id="sfFile" accept="image/jpeg,image/png,image/webp" hidden></label>' +
      (slot.image ? '<button class="btn btn-line btn-small" type="button" id="sfRemove">Remove</button>' : "") + "</div>" +
      '<label class="field"><span>Picture fit</span><select data-b="fit"><option value="cover"' + (slot.fit !== "contain" ? " selected" : "") + ">Fill the space (edges may be cut)</option>" +
      '<option value="contain"' + (slot.fit === "contain" ? " selected" : "") + ">Show the whole picture</option></select></label>" +
      '<label class="field"><span>When someone taps it</span><select data-b="tap">' + tapOpts.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (slot.tap === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>";
      }).join("") + "</select></label>" +
      '<label class="field"><span>Describe the picture (for people using screen readers)</span><input data-b="alt" maxlength="120" value="' + esc(slot.alt) + '" placeholder="e.g. Our soaps and detergents"></label>' +
      "</div></div>";
  }

  function wordsHtml() {
    var d = state.draft, pts = d.points.concat(["", "", "", ""]).slice(0, 4);
    var acc = /^#[0-9A-Fa-f]{6}$/.test(d.accent) ? d.accent : "";
    return '<div class="panel"><h3>Words and colour</h3><div class="form-grid">' +
      '<label class="field"><span>Headline</span><input data-w="headline" maxlength="80" value="' + esc(d.headline) + '" placeholder="e.g. Everyday hygiene made simple"></label>' +
      '<label class="field"><span>Tagline</span><input data-w="tagline" maxlength="140" value="' + esc(d.tagline) + '" placeholder="One line about what you make"></label></div>' +
      '<label class="field"><span>A few lines about you (optional)</span><textarea data-w="blurb" maxlength="400" rows="2" class="sfa-ta" placeholder="Shown under the banners">' + esc(d.blurb) + "</textarea></label>" +
      '<div class="field"><span>Short points shown with a tick (up to 4)</span><div class="sfa-points">' + pts.map(function (p, i) {
        return '<input data-p="' + i + '" maxlength="40" value="' + esc(p) + '" placeholder="' + ["e.g. Effective cleaning", "e.g. Gentle care", "e.g. Made in India", ""][i] + '">';
      }).join("") + "</div></div>" +
      '<div class="field"><span>Page colour</span><div class="sfa-colour"><input type="color" id="sfAccent" value="' + esc(acc || "#0E5E63") + '">' +
      '<label class="ca-check"><input type="checkbox" id="sfAccentOn"' + (acc ? " checked" : "") + "> Use my own colour</label>" +
      '<span class="muted">' + (acc ? "" : "Using the portal colour.") + "</span></div></div></div>";
  }

  function sectionsHtml() {
    var d = state.draft;
    var box = function (k, label) { return '<label class="ca-check"><input type="checkbox" data-s="' + k + '"' + (d[k] !== false ? " checked" : "") + "> " + label + "</label>"; };
    return '<div class="panel"><h3>What the page shows</h3><div class="sfa-checks">' +
      box("showSearch", "Product search at the top") + box("showCategories", "Product groups as buttons") + box("showProducts", "Product list with photos") + "</div>" +
      '<p class="muted" style="margin:10px 0 0">Products, photos and groups come from the Product catalog. Visitors never see prices: they sign in as customers for those.</p></div>';
  }

  function draw(root) {
    root.innerHTML = '<div class="view sfa">' + (Suite.isDemo() ? '<p class="demo-hint" style="margin:0 0 18px">Demo company: try it out. Changes stay in this browser tab only.</p>' : "") +
      statusHtml() +
      '<div class="panel"><div class="row-head" style="margin-bottom:12px"><h3 style="margin:0">Banners</h3><span class="muted">Tap a space to change it</span></div>' +
      '<div class="sfa-banners">' + mapHtml() + slotEditorHtml() + "</div></div>" +
      wordsHtml() + sectionsHtml() +
      '<div class="sfa-savebar"><button class="btn btn-ink" type="button" id="sfSave"' + (dirty ? "" : " disabled") + ">Save changes</button>" +
      '<span class="muted" id="sfSaveMsg" role="status">' + (dirty ? "Unsaved changes" : "") + "</span></div></div>";
    wire(root);
  }

  /* reads the form back into state.draft */
  function collect(root) {
    var d = state.draft;
    root.querySelectorAll("[data-w]").forEach(function (el) { d[el.dataset.w] = el.value.trim(); });
    d.points = Array.prototype.map.call(root.querySelectorAll("[data-p]"), function (el) { return el.value.trim(); }).filter(String);
    root.querySelectorAll("[data-s]").forEach(function (el) { d[el.dataset.s] = el.checked; });
    d.accent = root.querySelector("#sfAccentOn").checked ? root.querySelector("#sfAccent").value.toUpperCase() : "";
    var slot = d.banners[picked];
    root.querySelectorAll("[data-b]").forEach(function (el) { slot[el.dataset.b] = el.value.trim(); });
  }

  function markDirty(root) {
    if (!dirty) {
      dirty = true;
      root.querySelector("#sfSave").disabled = false;
      var pub = root.querySelector("#sfPublish");
      if (pub && state.on) { pub.disabled = false; pub.textContent = "Publish changes"; }
    }
    root.querySelector("#sfSaveMsg").textContent = "Unsaved changes";
  }

  function busy(root, text) {
    root.querySelector("#sfErr").textContent = "";
    root.querySelector("#sfMsg").textContent = text || "";
    root.querySelectorAll(".sfa button, .sfa input[type=file]").forEach(function (b) { b.disabled = !!text; });
  }
  function fail(root, e) {
    busy(root, "");
    root.querySelector("#sfErr").textContent = (e && e.message) || "That didn't work. Try again.";
    root.querySelector("#sfSave").disabled = !dirty;
  }
  function done(root, res, text) {
    state = res; dirty = false; draw(root);
    root.querySelector("#sfMsg").textContent = text || "";
  }
  /* saves the form first when it has changes, so an upload or publish never loses typing */
  function saveFirst(root) {
    if (!dirty) return Promise.resolve(state);
    collect(root);
    return call("saveStorefront", { page: state.draft }).then(function (res) { state = res; dirty = false; return res; });
  }

  function wire(root) {
    var form = root.querySelector(".sfa");
    form.addEventListener("input", function (e) { if (e.target.type !== "file") markDirty(root); });
    form.addEventListener("change", function (e) { if (e.target.type !== "file") markDirty(root); });

    root.querySelectorAll("[data-slot]").forEach(function (b) {
      b.onclick = function () { collect(root); picked = b.dataset.slot; var keep = dirty; draw(root); if (keep) markDirty(root); };
    });

    root.querySelector("#sfSave").onclick = function () {
      busy(root, "Saving…");
      collect(root);
      call("saveStorefront", { page: state.draft }).then(function (res) { done(root, res, "Saved. Preview it, then publish when you're happy."); })
        .catch(function (e) { fail(root, e); });
    };

    var file = root.querySelector("#sfFile");
    file.onchange = function () {
      var f = file.files && file.files[0];
      if (!f) return;
      busy(root, "Uploading picture…");
      saveFirst(root).then(function () { return shrink(f); })
        .then(function (dataUrl) { return call("uploadStorefrontImage", { slot: picked, dataUrl: dataUrl }); })
        .then(function (res) { done(root, res, "Picture saved to your draft."); })
        .catch(function (e) { file.value = ""; fail(root, e); });
    };
    var rm = root.querySelector("#sfRemove");
    if (rm) rm.onclick = function () {
      busy(root, "Removing…");
      saveFirst(root).then(function () { return call("removeStorefrontImage", { slot: picked }); })
        .then(function (res) { done(root, res, "Picture removed from your draft."); })
        .catch(function (e) { fail(root, e); });
    };

    root.querySelector("#sfPreview").onclick = function () {
      var win = window.open("about:blank", "_blank");
      busy(root, dirty ? "Saving…" : "");
      saveFirst(root).then(function (res) {
        if (res !== state) state = res;
        done(root, state, "");
        var url = Suite.link("store.html", { preview: "1" });
        if (win) win.location.href = url; else location.href = url;
      }).catch(function (e) { if (win) win.close(); fail(root, e); });
    };

    root.querySelector("#sfPublish").onclick = function () {
      busy(root, "Publishing…");
      saveFirst(root).then(function () { return call("publishStorefront"); })
        .then(function (res) { done(root, res, "Published. Visitors now see this page at your company's address."); })
        .catch(function (e) { fail(root, e); });
    };

    var off = root.querySelector("#sfOffline");
    if (off) off.onclick = function () {
      if (!off.dataset.sure) { off.dataset.sure = "1"; off.textContent = "Yes, take it offline"; root.querySelector("#sfMsg").textContent = "Your company's address will open the sign-in page again. The design is kept."; return; }
      busy(root, "Taking offline…");
      call("unpublishStorefront").then(function (res) { done(root, res, "The storefront is offline."); })
        .catch(function (e) { fail(root, e); });
    };

    var accOn = root.querySelector("#sfAccentOn"), acc = root.querySelector("#sfAccent");
    acc.addEventListener("input", function () { accOn.checked = true; });
  }

  /* Shrink a banner in the browser before sending it (JPEG, long side MAX_SIDE). */
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { reject(new Error("Choose a JPG, PNG or WebP picture.")); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("That file couldn't be read as a picture.")); };
      img.src = url;
    });
  }

  window.StorefrontAdmin = { render: render };
})();
