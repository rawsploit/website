/* ============================================================
   Product catalog (Marketing and admins).
   What customers see on the products page: photo, the group a
   product is shown under, a short description, its position and
   whether it's shown at all. Packs and prices are read-only here:
   they come from Company setup.
   ============================================================ */
(function () {
  "use strict";
  var esc = Suite.esc;
  var MAX_SIDE = 1000;          // photos are shrunk to this many pixels on the long side

  var demo = [
    { name: "Floor Cleaner", plant: "Detergent Plant", category: "Cleaning", ownCategory: "Cleaning", description: "Pine fresh, for tiles and marble.", image: "", hidden: false, sort: 0, packs: [["1 L", 120], ["5 L", 520]] },
    { name: "Dish Wash Liquid", plant: "Detergent Plant", category: "Detergent Plant", ownCategory: "", description: "", image: "", hidden: false, sort: 0, packs: [["500 ml", 85], ["2 L", 299]] },
    { name: "Hand Wash", plant: "Soap Plant", category: "Soap Plant", ownCategory: "", description: "", image: "", hidden: true, sort: 0, packs: [["200 ml", 60]] }
  ];

  function call(action, payload) {
    var s = Suite.getSession();
    if (Suite.isDemo()) return Promise.resolve(demoCall(action, payload || {}));
    return Suite.api(action, Object.assign({ token: s.token }, payload || {})).then(function (res) {
      if (!res.ok) throw new Error(res.message || "That didn't work. Try again.");
      return res;
    });
  }
  function demoCall(action, p) {
    var find = function (n) { return demo.filter(function (x) { return x.name === n; })[0]; };
    if (action === "saveCatalogInfo") {
      var d = find(p.product.name);
      d.ownCategory = p.product.category; d.category = p.product.category || d.plant;
      d.description = p.product.description; d.hidden = !!p.product.hidden; d.sort = Number(p.product.sort) || 0;
    } else if (action === "uploadCatalogImage") {
      find(p.productName).image = p.dataUrl;
    } else if (action === "removeCatalogImage") {
      find(p.productName).image = "";
    }
    return { ok: true, products: demo.slice().sort(function (a, b) { return (a.sort || 9999) - (b.sort || 9999); }), handPicked: false };
  }

  var rupee = function (n) { return "₹ " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }); };

  function render(root) {
    root.innerHTML = '<div class="view"><p>Loading products…</p></div>';
    call("catalogAdmin").then(function (res) { draw(root, res); })
      .catch(function (e) { root.innerHTML = '<div class="view"><p class="form-error">' + esc(e.message) + "</p></div>"; });
  }

  function draw(root, res) {
    var list = res.products || [];
    var groups = list.map(function (p) { return p.category; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    var shown = list.filter(function (p) { return !p.hidden; }).length;

    var head = '<div class="row-head" style="flex-wrap:wrap;gap:12px"><div><h3>What customers see</h3>' +
      '<p class="muted" style="margin:4px 0 0">' + shown + " of " + list.length + " products shown. Packs and prices come from Company setup; change them there.</p></div>" +
      '<a class="btn btn-line btn-small" target="_blank" rel="noopener" href="' + esc(Suite.link("catalog.html", { preview: "1" })) + '">Preview as a customer</a></div>';
    var warn = res.handPicked
      ? '<p class="demo-hint" style="margin:0 0 16px">Packs and prices customers see come from the core\'s hand-filled <b>Catalog</b> tab. Photos, groups, descriptions, positions and hiding set here still apply.</p>' : "";
    var empty = !list.length ? '<p class="muted">No finished goods yet. Add FG products in Company setup and they appear here.</p>' : "";

    root.innerHTML = '<div class="view">' + (Suite.isDemo() ? '<p class="demo-hint" style="margin:0 0 18px">Demo company: you can try this screen, but nothing is saved.</p>' : "") +
      head + warn + empty + '<datalist id="catGroups">' + groups.map(function (g) { return '<option value="' + esc(g) + '">'; }).join("") + "</datalist>" +
      '<div class="cat-admin">' + list.map(card).join("") + "</div></div>";

    root.querySelectorAll(".ca-card").forEach(function (el) { wire(root, el, list); });
  }

  function card(p, i) {
    var pic = p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<span>' + esc(p.name.charAt(0)) + "</span>";
    return '<form class="ca-card' + (p.hidden ? " is-hidden" : "") + '" data-i="' + i + '" novalidate>' +
      '<div class="ca-pic">' + pic + "</div>" +
      '<div class="ca-photo-actions">' +
        '<label class="btn btn-line btn-small">' + (p.image ? "Change photo" : "Add photo") + '<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>' +
        (p.image ? '<button class="btn btn-line btn-small" type="button" data-rm>Remove</button>' : "") +
      "</div>" +
      '<div class="ca-body">' +
        "<h3>" + esc(p.name) + "</h3>" +
        '<p class="muted ca-packs">' + p.packs.map(function (k) { return esc(k[0]) + " " + rupee(k[1]); }).join(" · ") + "</p>" +
        '<label class="field"><span>Shown under</span><input name="category" maxlength="40" list="catGroups" value="' + esc(p.ownCategory || "") + '" placeholder="' + esc(p.plant || "Products") + '"></label>' +
        '<label class="field"><span>Short description</span><textarea name="description" maxlength="300" rows="2" placeholder="One line customers see under the name">' + esc(p.description || "") + "</textarea></label>" +
        '<div class="ca-row">' +
          '<label class="field" style="max-width:110px"><span>Position</span><input name="sort" type="number" min="0" step="1" value="' + (p.sort || "") + '" placeholder="Auto"></label>' +
          '<label class="ca-check"><input type="checkbox" name="show"' + (p.hidden ? "" : " checked") + "> Show to customers</label>" +
        "</div>" +
        '<p class="form-error" role="alert"></p>' +
        '<div class="row-actions"><button class="btn btn-ink btn-small" type="submit" disabled>Save</button><span class="muted ca-msg" role="status"></span></div>' +
      "</div></form>";
  }

  function wire(root, el, list) {
    var p = list[Number(el.dataset.i)];
    var save = el.querySelector("[type=submit]");
    var msg = el.querySelector(".ca-msg");
    var errBox = el.querySelector(".form-error");
    el.addEventListener("input", function () { save.disabled = false; msg.textContent = ""; });
    el.addEventListener("change", function (e) { if (e.target.type !== "file") { save.disabled = false; msg.textContent = ""; } });

    el.onsubmit = function (e) {
      e.preventDefault();
      errBox.textContent = ""; save.disabled = true; msg.textContent = "Saving…";
      call("saveCatalogInfo", { product: {
        name: p.name, category: el.category.value.trim(), description: el.description.value.trim(),
        sort: el.sort.value, hidden: !el.show.checked } })
        .then(function (res) { draw(root, res); flash(root, p.name, "Saved."); })
        .catch(function (e2) { errBox.textContent = e2.message; save.disabled = false; msg.textContent = ""; });
    };

    var file = el.querySelector("input[type=file]");
    file.onchange = function () {
      var f = file.files && file.files[0];
      if (!f) return;
      errBox.textContent = ""; msg.textContent = "Uploading photo…";
      shrink(f).then(function (dataUrl) {
        return call("uploadCatalogImage", { productName: p.name, dataUrl: dataUrl });
      }).then(function (res) { draw(root, res); flash(root, p.name, "Photo saved."); })
        .catch(function (e2) { errBox.textContent = e2.message || "The photo didn't upload."; msg.textContent = ""; file.value = ""; });
    };
    var rm = el.querySelector("[data-rm]");
    if (rm) rm.onclick = function () {
      msg.textContent = "Removing…";
      call("removeCatalogImage", { productName: p.name })
        .then(function (res) { draw(root, res); flash(root, p.name, "Photo removed."); })
        .catch(function (e2) { errBox.textContent = e2.message; msg.textContent = ""; });
    };
  }

  function flash(root, name, text) {
    root.querySelectorAll(".ca-card").forEach(function (el) {
      if (el.querySelector("h3").textContent === name) el.querySelector(".ca-msg").textContent = text;
    });
  }

  /* Shrink a photo in the browser before sending it (JPEG, long side MAX_SIDE). */
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { reject(new Error("Choose a JPG, PNG or WebP photo.")); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);    // transparent PNGs get a white background
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("That file couldn't be read as a photo.")); };
      img.src = url;
    });
  }

  window.CatalogAdmin = { render: render };
})();
