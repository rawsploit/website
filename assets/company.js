/* ============================================================
   Company setup (admins): the one profile every module reads.
   1 Company  2 Plants (+ their places)  3 Sales routes & vans
   4 Distributors  5 Products (bulk upload from Excel / CSV)
   Talks to the client core. In demo mode it works on sample
   data in memory, with the same checks, so it can be tried.
   Designed by rawsploit@gmail.com
   ============================================================ */
(function () {
  "use strict";
  var esc = Suite.esc;
  var XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  var P = null;            // the profile as last loaded
  var step = "company";

  var STEPS = [
    { id: "company", name: "Company" },
    { id: "plants", name: "Plants" },
    { id: "routes", name: "Sales routes" },
    { id: "distributors", name: "Distributors" },
    { id: "products", name: "Products" }
  ];
  var STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
    "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
    "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
  var TYPES = ["STORE", "PRODUCTION", "PACKING", "HOLD", "OUTLET", "CONSUMPTION", "DISPATCH"];
  var CAT_NAMES = { RM: "Raw material", PM: "Packing material", SFG: "Semi-finished", FG: "Finished goods" };
  var TEMPLATE_COLS = ["sku", "name", "category", "plant", "uom", "pack", "price", "hsn", "gst", "active"];

  /* ---------------- talking to the core ---------------- */
  function call(action, payload) {
    if (Suite.isDemo()) {
      try { return Promise.resolve(Demo.call(action, payload || {})); }
      catch (e) { return Promise.reject(e); }
    }
    var s = Suite.getSession();
    return Suite.api(action, Object.assign({ token: s.token }, payload || {})).then(function (res) {
      if (!res.ok && !res.errors) throw new Error(res.message || "That didn't work. Try again.");
      return res;
    });
  }
  function keep(res) {
    if (res && res.plants) P = { company: res.company, plants: res.plants, locations: res.locations, routes: res.routes,
      distributors: res.distributors, products: res.products };
    return res;
  }

  /* ---------------- page ---------------- */
  function render(root) {
    root.innerHTML = '<div class="view">' + (Suite.isDemo() ? '<p class="demo-hint" style="margin:0 0 18px">Demo company: try every step; nothing is saved.</p>' : "") +
      '<p class="muted" style="margin:0 0 14px">Fill this in once. Every module reads it: plants and their places, routes and vans, distributors and products.</p>' +
      '<div class="wiz-steps" id="wizSteps"></div><div id="wizBody"><p class="muted">Loading…</p></div></div>';
    call("profile").then(keep).then(function () { paint(root); })
      .catch(function (e) { root.querySelector("#wizBody").innerHTML = '<p class="form-error">' + esc(e.message) + "</p>"; });
  }

  function done(id) {
    if (!P) return false;
    if (id === "company") return !!(P.company && P.company.name && P.company.state);
    if (id === "plants") return P.plants.some(function (p) { return p.active; });
    if (id === "routes") return P.routes.some(function (r) { return r.active; });
    if (id === "distributors") return P.distributors.length > 0;
    if (id === "products") return P.products.some(function (p) { return p.active; });
    return false;
  }

  function paint(root) {
    var bar = root.querySelector("#wizSteps");
    bar.innerHTML = STEPS.map(function (s, i) {
      return '<button type="button" class="wiz-step' + (s.id === step ? " on" : "") + (done(s.id) ? " done" : "") + '" data-step="' + s.id + '">' +
        '<b>' + (done(s.id) ? "✓" : (i + 1)) + "</b>" + esc(s.name) + "</button>";
    }).join("");
    bar.querySelectorAll("[data-step]").forEach(function (b) { b.onclick = function () { step = b.dataset.step; paint(root); }; });
    var body = root.querySelector("#wizBody");
    ({ company: stepCompany, plants: stepPlants, routes: stepRoutes, distributors: stepDistributors, products: stepProducts })[step](body, root);
  }
  function nextStep(root) {
    var i = STEPS.map(function (s) { return s.id; }).indexOf(step);
    if (i < STEPS.length - 1) step = STEPS[i + 1].id;
    paint(root);
    window.scrollTo(0, 0);
  }
  function flash(el, text) { el.textContent = text; el.classList.add("ok-msg"); }
  function opt(list, sel) { return list.map(function (v) { return '<option' + (v === sel ? " selected" : "") + ">" + esc(v) + "</option>"; }).join(""); }

  /* ---------------- 1. company ---------------- */
  function stepCompany(body, root) {
    var c = P.company || {};
    body.innerHTML = '<form class="panel" novalidate style="max-width:680px"><h3>1. Company details</h3>' +
      '<label class="field"><span>Company name</span><input name="name" value="' + esc(c.name || "") + '" required></label>' +
      '<label class="field"><span>Address</span><input name="address" value="' + esc(c.address || "") + '"></label>' +
      '<div class="form-grid">' +
      '<label class="field"><span>State</span><select name="state"><option value="">Choose…</option>' + opt(STATES, c.state) + "</select></label>" +
      '<label class="field"><span>Pincode</span><input name="pincode" value="' + esc(c.pincode || "") + '" inputmode="numeric"></label>' +
      '<label class="field"><span>GSTIN</span><input name="gstin" value="' + esc(c.gstin || "") + '" maxlength="15"></label>' +
      '<label class="field"><span>Phone</span><input name="phone" value="' + esc(c.phone || "") + '"></label>' +
      '<label class="field"><span>E-mail</span><input name="email" type="email" value="' + esc(c.email || "") + '"></label>' +
      '<label class="field"><span>Logo link (optional)</span><input name="logo" type="url" value="' + esc(c.logo || "") + '" placeholder="https://…"></label>' +
      "</div>" +
      '<p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="submit">Save and continue</button></div></form>';
    var f = body.querySelector("form");
    f.onsubmit = function (e) {
      e.preventDefault();
      var err = f.querySelector(".form-error");
      if (!f.name.value.trim()) { err.textContent = "Enter your company name."; return; }
      if (!f.state.value) { err.textContent = "Pick your state (it decides CGST + SGST or IGST on bills)."; return; }
      var data = {}; ["name", "address", "state", "pincode", "gstin", "phone", "email", "logo"].forEach(function (k) { data[k] = f[k].value.trim(); });
      call("saveCompanyProfile", { company: data }).then(function (r) { P.company = r.company; nextStep(root); })
        .catch(function (e2) { err.textContent = e2.message; });
    };
  }

  /* ---------------- 2. plants and their places ---------------- */
  function stepPlants(body, root) {
    var active = P.plants.filter(function (p) { return p.active; });
    body.innerHTML = '<div class="panel" style="max-width:760px"><h3>2. Plants</h3>' +
      '<label class="field" style="max-width:260px"><span>How many plants do you have?</span><input id="plN" type="number" min="1" max="20" value="' + Math.max(active.length, 1) + '"></label>' +
      '<table class="tbl" id="plTbl"><thead><tr><th>Plant name</th><th style="width:150px">Short code</th></tr></thead><tbody></tbody></table>' +
      '<p class="muted" style="margin-top:10px">The short code (2–4 letters, e.g. MNP) starts the ID of every place in that plant. Leave it blank and one is made from the name. It can\'t change later.</p>' +
      '<p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="button" id="plSave">Save plants</button></div></div>' +
      '<div id="plPlaces"></div>';
    var tbody = body.querySelector("#plTbl tbody");
    function rows(n) {
      var cur = Array.prototype.map.call(tbody.querySelectorAll("tr"), function (tr) {
        return { plant_id: tr.dataset.id || "", name: tr.querySelector(".nm").value, code: tr.querySelector(".cd").value };
      });
      if (!cur.length) cur = active.map(function (p) { return { plant_id: p.plant_id, name: p.name, code: p.code }; });
      while (cur.length < n) cur.push({ plant_id: "", name: "", code: "" });
      cur = cur.slice(0, n);
      tbody.innerHTML = cur.map(function (p, i) {
        return '<tr data-id="' + esc(p.plant_id) + '"><td><input class="cell nm" value="' + esc(p.name) + '" placeholder="e.g. ' + (i ? "Plant 2" : "Main Plant") + '"></td>' +
          '<td><input class="cell cd" value="' + esc(p.code) + '" maxlength="4"' + (p.plant_id ? " readonly" : "") + ' placeholder="auto"></td></tr>';
      }).join("");
    }
    rows(Math.max(active.length, 1));
    body.querySelector("#plN").oninput = function () { var n = Math.min(Math.max(parseInt(this.value, 10) || 1, 1), 20); rows(n); };
    body.querySelector("#plSave").onclick = function () {
      var err = body.querySelector(".form-error");
      var list = Array.prototype.map.call(tbody.querySelectorAll("tr"), function (tr) {
        return { plant_id: tr.dataset.id || "", name: tr.querySelector(".nm").value.trim(), code: tr.querySelector(".cd").value.trim() };
      });
      if (list.some(function (p) { return !p.name; })) { err.textContent = "Give every plant a name."; return; }
      call("savePlants", { plants: list }).then(keep).then(function () { err.textContent = ""; paint(root); })
        .catch(function (e) { err.textContent = e.message; });
    };
    places(body.querySelector("#plPlaces"), root);
  }

  function places(box, root) {
    var plants = P.plants.filter(function (p) { return p.active; });
    if (!plants.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<div class="panel"><h3>Places in each plant</h3><p class="muted" style="margin-bottom:12px">Every plant starts with the usual places. Rename them, switch off what you don\'t use, or add your own (an outlet, a canteen…). Vans are set up in the next step.</p>' +
      plants.map(function (p) {
        var list = P.locations.filter(function (l) { return l.plant_id === p.plant_id && l.type !== "VEHICLE"; });
        return '<h4 class="wiz-sub">' + esc(p.name) + ' <span class="muted">(' + esc(p.code) + ")</span></h4>" +
          '<table class="tbl wiz-places" data-plant="' + esc(p.plant_id) + '"><thead><tr><th>Place</th><th>Kind</th><th>Stock kept here</th><th style="width:70px">In use</th></tr></thead><tbody>' +
          list.map(placeRow).join("") + '</tbody></table><p style="margin:8px 0 18px"><button type="button" class="btn btn-line btn-small" data-add="' + esc(p.plant_id) + '">Add a place</button></p>';
      }).join("") +
      '<p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="button" id="lcSave">Save places and continue</button></div></div>';
    box.querySelectorAll("[data-add]").forEach(function (b) {
      b.onclick = function () {
        box.querySelector('table[data-plant="' + b.dataset.add + '"] tbody').insertAdjacentHTML("beforeend",
          placeRow({ location_id: "", name: "", type: "STORE", categories: "FG", active: true }));
      };
    });
    box.querySelector("#lcSave").onclick = function () {
      var err = box.querySelector(".form-error");
      var list = [];
      box.querySelectorAll("table[data-plant]").forEach(function (t) {
        t.querySelectorAll("tbody tr").forEach(function (tr) {
          var name = tr.querySelector(".nm").value.trim();
          if (!name && !tr.dataset.id) return;
          list.push({ location_id: tr.dataset.id || "", plant_id: t.dataset.plant, name: name, type: tr.querySelector(".tp").value,
            categories: tr.querySelector(".ct").value, active: tr.querySelector(".ac").checked });
        });
      });
      call("saveLocations", { locations: list }).then(keep).then(function () { nextStep(root); })
        .catch(function (e) { err.textContent = e.message; });
    };
  }
  function placeRow(l) {
    return '<tr data-id="' + esc(l.location_id) + '"><td><input class="cell nm" value="' + esc(l.name) + '" placeholder="Name of the place">' +
      (l.location_id ? '<small class="muted">' + esc(l.location_id) + "</small>" : "") + "</td>" +
      '<td><select class="cell tp">' + opt(TYPES, l.type) + "</select></td>" +
      '<td><input class="cell ct" value="' + esc(l.categories) + '" title="Any of RM, PM, SFG, FG, separated by commas"></td>' +
      '<td><input type="checkbox" class="ac"' + (l.active ? " checked" : "") + "></td></tr>";
  }

  /* ---------------- 3. sales routes and vans ---------------- */
  function stepRoutes(body, root) {
    var plants = P.plants.filter(function (p) { return p.active; });
    if (!plants.length) { body.innerHTML = '<div class="panel"><p>Add your plants first (step 2): each van loads from a plant.</p></div>'; return; }
    var active = P.routes.filter(function (r) { return r.active; });
    body.innerHTML = '<div class="panel"><h3>3. Sales routes and vans</h3>' +
      '<label class="field" style="max-width:300px"><span>How many sales routes?</span><input id="rtN" type="number" min="0" max="60" value="' + active.length + '"></label>' +
      '<table class="tbl" id="rtTbl"><thead><tr><th style="width:90px">Code</th><th>Route name</th><th>Van number</th><th>Salesperson</th><th>Loads from</th></tr></thead><tbody></tbody></table>' +
      '<p class="muted" style="margin-top:10px">Each route gets its own van in stock (VAN-R1, VAN-R2…). Route codes are what Collections and MIS group shops by.</p>' +
      '<p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="button" id="rtSave">Save routes and continue</button></div></div>';
    var tbody = body.querySelector("#rtTbl tbody");
    function rows(n) {
      var cur = Array.prototype.map.call(tbody.querySelectorAll("tr"), readRoute);
      if (!cur.length) cur = active.slice();
      while (cur.length < n) cur.push({ route_id: "R" + (cur.length + 1), name: "", van: "", salesperson: "", plant_id: plants[0].plant_id });
      cur = cur.slice(0, n);
      tbody.innerHTML = cur.map(function (r) {
        return '<tr><td><input class="cell id" value="' + esc(r.route_id) + '" maxlength="10"></td>' +
          '<td><input class="cell nm" value="' + esc(r.name) + '" placeholder="e.g. North Route"></td>' +
          '<td><input class="cell vn" value="' + esc(r.van) + '" placeholder="Vehicle number"></td>' +
          '<td><input class="cell sp" value="' + esc(r.salesperson) + '"></td>' +
          '<td><select class="cell pl">' + plants.map(function (p) { return '<option value="' + esc(p.plant_id) + '"' + (p.plant_id === r.plant_id ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</select></td></tr>";
      }).join("");
    }
    function readRoute(tr) {
      return { route_id: tr.querySelector(".id").value.trim(), name: tr.querySelector(".nm").value.trim(), van: tr.querySelector(".vn").value.trim(),
        salesperson: tr.querySelector(".sp").value.trim(), plant_id: tr.querySelector(".pl").value };
    }
    rows(active.length);
    body.querySelector("#rtN").oninput = function () { rows(Math.min(Math.max(parseInt(this.value, 10) || 0, 0), 60)); };
    body.querySelector("#rtSave").onclick = function () {
      var err = body.querySelector(".form-error");
      var list = Array.prototype.map.call(tbody.querySelectorAll("tr"), readRoute);
      call("saveRoutes", { routes: list }).then(keep).then(function () { nextStep(root); })
        .catch(function (e) { err.textContent = e.message; });
    };
  }

  /* ---------------- 4. distributors ---------------- */
  function stepDistributors(body, root) {
    body.innerHTML = '<div class="panel"><h3>4. Outside distributors</h3>' +
      '<p class="muted" style="margin-bottom:12px">Firms that buy from you in bulk and resell. Type them in, or upload a sheet with columns <b>name, area, phone, gstin, state</b>. Leave this empty if you don\'t sell through distributors.</p>' +
      '<table class="tbl" id="dsTbl"><thead><tr><th>Name</th><th>Area</th><th>Phone</th><th>GSTIN</th><th>State</th><th style="width:70px">In use</th></tr></thead><tbody></tbody></table>' +
      '<p style="margin:10px 0 16px" class="row-actions"><button type="button" class="btn btn-line btn-small" id="dsAdd">Add a row</button>' +
      '<label class="btn btn-line btn-small" style="cursor:pointer">Upload Excel / CSV<input type="file" id="dsFile" accept=".xlsx,.xls,.csv" hidden></label></p>' +
      '<div id="dsErr"></div><p class="form-error" role="alert"></p><div class="row-actions"><button class="btn btn-ink" type="button" id="dsSave">Save distributors and continue</button></div></div>';
    var tbody = body.querySelector("#dsTbl tbody");
    function addRow(d) {
      tbody.insertAdjacentHTML("beforeend", '<tr data-id="' + esc(d.dist_id || "") + '"><td><input class="cell nm" value="' + esc(d.name || "") + '"></td>' +
        '<td><input class="cell ar" value="' + esc(d.area || "") + '"></td><td><input class="cell ph" value="' + esc(d.phone || "") + '"></td>' +
        '<td><input class="cell gs" value="' + esc(d.gstin || "") + '" maxlength="15"></td>' +
        '<td><select class="cell st"><option value=""></option>' + opt(STATES, d.state) + "</select></td>" +
        '<td><input type="checkbox" class="ac"' + (d.active === false ? "" : " checked") + "></td></tr>");
    }
    P.distributors.forEach(addRow);
    if (!P.distributors.length) addRow({});
    body.querySelector("#dsAdd").onclick = function () { addRow({}); };
    body.querySelector("#dsFile").onchange = function () {
      var file = this.files[0]; if (!file) return;
      readSheet(file).then(function (rows) {
        rows.forEach(function (r) {
          var st = STATES.filter(function (s) { return s.toLowerCase() === String(r.state || "").trim().toLowerCase(); })[0] || "";
          addRow({ name: r.name, area: r.area, phone: r.phone, gstin: r.gstin, state: st });
        });
        body.querySelector(".form-error").textContent = rows.length + " row(s) added from the file. Check them, then save.";
      }).catch(function (e) { body.querySelector(".form-error").textContent = e.message; });
      this.value = "";
    };
    body.querySelector("#dsSave").onclick = function () {
      var err = body.querySelector(".form-error"), box = body.querySelector("#dsErr");
      var list = [];
      tbody.querySelectorAll("tr").forEach(function (tr) {
        var name = tr.querySelector(".nm").value.trim();
        if (!name && !tr.dataset.id) return;
        list.push({ dist_id: tr.dataset.id || "", name: name, area: tr.querySelector(".ar").value.trim(), phone: tr.querySelector(".ph").value.trim(),
          gstin: tr.querySelector(".gs").value.trim(), state: tr.querySelector(".st").value, active: tr.querySelector(".ac").checked });
      });
      call("saveDistributors", { distributors: list }).then(function (r) {
        if (r.errors) { box.innerHTML = errorList(r.errors, "Row"); err.textContent = "Nothing was saved. Fix the rows listed."; return; }
        keep(r); nextStep(root);
      }).catch(function (e) { err.textContent = e.message; });
    };
  }

  /* ---------------- 5. products (bulk upload) ---------------- */
  function stepProducts(body, root) {
    var plants = P.plants.filter(function (p) { return p.active; });
    body.innerHTML = '<div class="panel"><h3>5. Products</h3>' +
      '<p class="muted" style="margin-bottom:10px">Everything you buy, make or sell: raw materials (RM), packing materials (PM), semi-finished goods (SFG) and finished goods (FG). ' +
      'Download the template, fill one row per item (one row per pack size), and upload it. You can upload again any time to add items or change prices.</p>' +
      '<div class="row-actions" style="margin-bottom:14px"><button type="button" class="btn btn-line btn-small" id="pdTplX">Download Excel template</button>' +
      '<button type="button" class="btn btn-line btn-small" id="pdTplC">Download CSV template</button>' +
      '<label class="btn btn-ink btn-small" style="cursor:pointer">Upload filled file<input type="file" id="pdFile" accept=".xlsx,.xls,.csv" hidden></label></div>' +
      '<details class="wiz-help"><summary>How to fill the columns</summary><table class="tbl" style="margin-top:8px"><tbody>' +
      '<tr><td><b>sku</b></td><td>Your item code. Optional: leave blank and one is made (FG-0001…). Keep it the same when you upload again.</td></tr>' +
      '<tr><td><b>name</b></td><td>Item name, e.g. <i>Product A</i>.</td></tr>' +
      '<tr><td><b>category</b></td><td>RM, PM, SFG or FG (the words "Raw material", "Finished goods"… also work).</td></tr>' +
      '<tr><td><b>plant</b></td><td>Plant name or code: ' + plants.map(function (p) { return "<i>" + esc(p.name) + "</i> (" + esc(p.code) + ")"; }).join(", ") +
      '. Blank = used by every plant (normal for RM and PM).' + (plants.length > 1 ? " SFG and FG need a plant." : "") + "</td></tr>" +
      '<tr><td><b>uom</b></td><td>Unit: Kg, Ltr, Nos, Pkt, Btl…</td></tr>' +
      '<tr><td><b>pack</b></td><td>Pack size, e.g. 75 g, 1 kg. One row per pack size.</td></tr>' +
      '<tr><td><b>price</b></td><td>Selling price (FG) or buying price (RM, PM), in rupees.</td></tr>' +
      '<tr><td><b>hsn</b>, <b>gst</b></td><td>HSN code (4–8 digits) and GST % (e.g. 5 or 18).</td></tr>' +
      '<tr><td><b>active</b></td><td>Blank or yes = in use; no = switched off.</td></tr></tbody></table></details>' +
      '<div id="pdCheck"></div></div>' +
      '<div class="panel"><div class="row-head" style="margin-top:0"><h3 style="margin:0">Your products <span class="muted" id="pdCount"></span></h3>' +
      '<input id="pdFind" class="cell" placeholder="Search…" style="max-width:220px"></div>' +
      '<div class="switch wiz-cats" id="pdCats" style="max-width:520px;grid-template-columns:repeat(5,1fr)">' +
      ["All", "RM", "PM", "SFG", "FG"].map(function (c, i) { return '<button type="button" data-cat="' + c + '" aria-pressed="' + (i ? "false" : "true") + '">' + c + "</button>"; }).join("") +
      '</div><div id="pdList"></div></div>';
    body.querySelector("#pdTplX").onclick = function () { downloadTemplate("xlsx"); };
    body.querySelector("#pdTplC").onclick = function () { downloadTemplate("csv"); };
    body.querySelector("#pdFile").onchange = function () {
      var file = this.files[0]; this.value = ""; if (!file) return;
      var box = body.querySelector("#pdCheck");
      box.innerHTML = '<p class="muted">Reading ' + esc(file.name) + "…</p>";
      readSheet(file).then(function (rows) { review(box, rows, root); })
        .catch(function (e) { box.innerHTML = '<p class="form-error">' + esc(e.message) + "</p>"; });
    };
    var cat = "All";
    function list() {
      var q = body.querySelector("#pdFind").value.trim().toLowerCase();
      var plantName = {}; P.plants.forEach(function (p) { plantName[p.plant_id] = p.name; });
      var rows = P.products.filter(function (p) { return (cat === "All" || p.category === cat) && (!q || (p.name + " " + p.sku + " " + p.pack).toLowerCase().indexOf(q) >= 0); });
      body.querySelector("#pdCount").textContent = "(" + P.products.filter(function (p) { return p.active; }).length + " in use)";
      body.querySelector("#pdList").innerHTML = rows.length ? '<table class="tbl"><thead><tr><th>SKU</th><th>Name</th><th>Cat.</th><th>Plant</th><th>Unit</th><th>Pack</th><th style="text-align:right">Price</th><th>HSN</th><th style="text-align:right">GST</th></tr></thead><tbody>' +
        rows.slice(0, 300).map(function (p) {
          return '<tr' + (p.active ? "" : ' class="off"') + "><td>" + esc(p.sku) + "</td><td>" + esc(p.name) + (p.active ? "" : ' <span class="status soon">off</span>') + "</td><td>" + esc(p.category) + "</td><td>" +
            esc(plantName[p.plant_id] || "All plants") + "</td><td>" + esc(p.uom) + "</td><td>" + esc(p.pack) + '</td><td style="text-align:right">' + money(p.price) +
            "</td><td>" + esc(p.hsn) + '</td><td style="text-align:right">' + esc(p.gst) + "%</td></tr>";
        }).join("") + "</tbody></table>" + (rows.length > 300 ? '<p class="muted">Showing the first 300. Use search to narrow down.</p>' : "")
        : '<p class="muted">No products yet. Download the template, fill it and upload it.</p>';
    }
    body.querySelector("#pdFind").oninput = list;
    body.querySelectorAll("#pdCats [data-cat]").forEach(function (b) {
      b.onclick = function () {
        cat = b.dataset.cat;
        body.querySelectorAll("#pdCats [data-cat]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        list();
      };
    });
    list();
  }

  /* Check the file in the browser first, show it, then send it. */
  function review(box, rows, root) {
    var problems = checkProducts(rows, P.plants.filter(function (p) { return p.active; }));
    var counts = {};
    rows.forEach(function (r) { var c = catOf(r.category) || "?"; counts[c] = (counts[c] || 0) + 1; });
    box.innerHTML = '<div class="wiz-review"><p><b>' + rows.length + " row(s) read.</b> " +
      Object.keys(counts).map(function (k) { return (CAT_NAMES[k] || "Unrecognised") + ": " + counts[k]; }).join(" · ") + "</p>" +
      (problems.length ? '<p class="form-error" style="margin:8px 0">' + problems.length + " row(s) need fixing before anything can be saved:</p>" + errorList(problems, "Row") +
        '<p class="muted">Fix these in your file and upload it again.</p>'
        : '<p class="ok-msg" style="margin:6px 0">All rows look right.</p>' +
          '<label class="muted" style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="pdOff"> Switch off products that are not in this file</label>' +
          '<div class="row-actions"><button class="btn btn-ink" type="button" id="pdSave">Save ' + rows.length + " product(s)</button></div><p class=\"form-error\" role=\"alert\"></p>") +
      "</div>";
    var btn = box.querySelector("#pdSave");
    if (!btn) return;
    btn.onclick = function () {
      btn.disabled = true; btn.textContent = "Saving…";
      call("saveProducts", { products: rows, deactivateMissing: box.querySelector("#pdOff").checked }).then(function (r) {
        if (r.errors) {
          box.innerHTML = '<p class="form-error">Nothing was saved. ' + (r.errorCount || r.errors.length) + " row(s) need fixing:</p>" + errorList(r.errors, "Row");
          return;
        }
        keep(r);
        paint(root);
        var msg = document.querySelector("#pdCheck");
        if (msg) msg.innerHTML = '<p class="ok-msg">Saved: ' + r.added + " added, " + r.updated + " updated" + (r.deactivated ? ", " + r.deactivated + " switched off" : "") + ".</p>";
      }).catch(function (e) { btn.disabled = false; btn.textContent = "Save products"; box.querySelector(".form-error").textContent = e.message; });
    };
  }

  function errorList(errs, label) {
    return '<ul class="wiz-errs">' + errs.slice(0, 100).map(function (e) { return "<li><b>" + label + " " + e.row + ":</b> " + esc(e.message) + "</li>"; }).join("") +
      (errs.length > 100 ? "<li>…and " + (errs.length - 100) + " more</li>" : "") + "</ul>";
  }
  function money(n) { return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* ---------------- the same product checks as the core ---------------- */
  var CAT_WORDS = { "RM": "RM", "RAW": "RM", "RAW MATERIAL": "RM", "RAW MATERIALS": "RM", "PM": "PM", "PACKING": "PM", "PACKING MATERIAL": "PM",
    "PACKAGING": "PM", "PACKAGING MATERIAL": "PM", "SFG": "SFG", "SEMI": "SFG", "SEMI-FINISHED": "SFG", "SEMI FINISHED": "SFG",
    "SEMI-FINISHED GOODS": "SFG", "SEMI FINISHED GOODS": "SFG", "FG": "FG", "FINISHED": "FG", "FINISHED GOODS": "FG", "FINISHED GOOD": "FG" };
  function key(v) { return String(v === null || v === undefined ? "" : v).trim().toUpperCase().replace(/\s+/g, " "); }
  function catOf(v) { return CAT_WORDS[key(v)] || ""; }
  function num(v) { var s = String(v === null || v === undefined ? "" : v).replace(/[,₹\s]/g, ""); return s === "" ? NaN : Number(s); }
  function checkProducts(rows, plants) {
    var errs = [], seenSku = {}, seenNP = {};
    rows.forEach(function (r, i) {
      var line = i + 2, p = [];
      var name = String(r.name || "").trim();
      if (!name) p.push("name is missing");
      var cat = catOf(r.category);
      if (!cat) p.push("category must be RM, PM, SFG or FG (got \"" + String(r.category || "") + "\")");
      var pk = key(r.plant), plant = !pk || pk === "ALL" ? { plant_id: "" } :
        plants.filter(function (x) { return key(x.name) === pk || key(x.code) === pk || key(x.plant_id) === pk; })[0];
      if (!plant) p.push("plant \"" + String(r.plant) + "\" isn't one of your plants");
      else if ((cat === "FG" || cat === "SFG") && !plant.plant_id && plants.length > 1) p.push("finished and semi-finished goods need a plant");
      if (!String(r.uom || "").trim()) p.push("unit (uom) is missing");
      var price = num(r.price), gst = num(r.gst);
      if (String(r.price || "").trim() !== "" && (isNaN(price) || price < 0)) p.push("price must be a number");
      if (String(r.gst || "").trim() !== "" && (isNaN(gst) || gst < 0 || gst > 100)) p.push("GST must be a percentage like 5 or 18");
      var hsn = String(r.hsn || "").replace(/\s/g, "");
      if (hsn && !/^\d{4,8}$/.test(hsn)) p.push("HSN should be 4 to 8 digits");
      var sku = String(r.sku || "").trim().toUpperCase().replace(/\s+/g, "");
      if (sku && !/^[A-Z0-9._/-]{1,30}$/.test(sku)) p.push("SKU can use letters, numbers, - _ . /");
      var np = key(name) + "|" + key(r.pack);
      if (sku && seenSku[sku]) p.push("SKU " + sku + " also used on row " + seenSku[sku]);
      if (name && seenNP[np]) p.push("same name and pack as row " + seenNP[np]);
      if (p.length) { errs.push({ row: line, message: p.join("; ") }); return; }
      if (sku) seenSku[sku] = line;
      seenNP[np] = line;
    });
    return errs;
  }

  /* ---------------- files ---------------- */
  var ALIASES = {
    sku: ["sku", "code", "item code", "product code"], name: ["name", "item", "item name", "product", "product name", "particulars"],
    category: ["category", "cat", "type"], plant: ["plant", "plant name", "plant code"], uom: ["uom", "unit", "units"],
    pack: ["pack", "pack size", "size"], price: ["price", "rate", "mrp", "cost"], hsn: ["hsn", "hsn code"],
    gst: ["gst", "gst %", "gst%", "gst rate", "tax"], active: ["active", "in use", "status"],
    area: ["area", "city", "place"], phone: ["phone", "mobile", "contact"], gstin: ["gstin", "gst no", "gst number"], state: ["state"]
  };
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = XLSX_URL; s.onload = res;
      s.onerror = function () { rej(new Error("Couldn't load the Excel reader. Check the internet connection, or use a CSV file.")); };
      document.head.appendChild(s);
    });
  }
  /* Reads the first sheet; the first row is the header. Returns rows keyed by our column names. */
  function parseCsv(text) {
    var rows = [], row = [], cur = "", q = false;
    text = text.replace(/^\uFEFF/, "");
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); rows.push(row); row = []; cur = "";
      } else cur += ch;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function readSheet(file) {
    var isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    var getAoa = isCsv
      ? file.text().then(parseCsv)
      : loadXlsx().then(function () { return file.arrayBuffer(); }).then(function (buf) {
          var wb = XLSX.read(buf, { type: "array" });
          return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
        });
    return getAoa.then(function (aoa) {
      while (aoa.length && aoa[0].every(function (c) { return String(c).trim() === ""; })) aoa.shift();
      if (aoa.length < 2) throw new Error("The file has no rows under the header.");
      var head = aoa[0].map(function (h) { return String(h).trim().toLowerCase(); });
      var map = {};
      Object.keys(ALIASES).forEach(function (k) {
        var at = head.findIndex(function (h) { return ALIASES[k].indexOf(h) >= 0; });
        if (at >= 0) map[k] = at;
      });
      return aoa.slice(1).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); }).map(function (r) {
        var o = {};
        Object.keys(map).forEach(function (k) { o[k] = String(r[map[k]] === undefined ? "" : r[map[k]]).trim(); });
        return o;
      });
    });
  }
  function downloadTemplate(kind) {
    var plants = P.plants.filter(function (p) { return p.active; });
    var p1 = plants[0] ? plants[0].name : "Plant 1", p2 = plants[1] ? plants[1].name : p1;
    var rows = [TEMPLATE_COLS,
      ["", "Example raw material", "RM", "", "Kg", "", "50", "", "18", "yes"],
      ["", "Example packing material", "PM", "", "Nos", "", "1.50", "", "18", "yes"],
      ["", "Example semi-finished item", "SFG", p1, "Kg", "", "80", "", "", "yes"],
      ["", "Example product", "FG", p1, "Nos", "100 g", "40", "", "5", "yes"],
      ["", "Example product", "FG", p2, "Nos", "500 g", "150", "", "18", "yes"]];
    if (kind === "csv") {
      var text = rows.map(function (r) { return r.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
      save(new Blob([text], { type: "text/csv" }), "products-template.csv");
      return;
    }
    loadXlsx().then(function () {
      var wb = XLSX.utils.book_new();
      var ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [10, 28, 10, 18, 8, 10, 10, 10, 6, 8].map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, "Products");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Column", "What to put"],
        ["sku", "Your item code (optional; blank = made for you). Keep it the same when you upload again."],
        ["name", "Item name"], ["category", "RM, PM, SFG or FG"],
        ["plant", "One of: " + plants.map(function (p) { return p.name + " (" + p.code + ")"; }).join(", ") + ". Blank = all plants (RM/PM)."],
        ["uom", "Kg, Ltr, Nos, Pkt, Btl…"], ["pack", "Pack size, e.g. 75 g. One row per pack size."],
        ["price", "Rupees"], ["hsn", "4 to 8 digits"], ["gst", "Percent, e.g. 5 or 18"], ["active", "yes / no"],
        ["", "Delete the example rows before uploading."]]), "How to fill");
      XLSX.writeFile(wb, "products-template.xlsx");
    }).catch(function (e) { alert(e.message); });
  }
  function save(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- demo company (in memory, same rules) ---------------- */
  var Demo = (function () {
    var STD = [["RMS", "RM Store", "STORE", "RM"], ["PMS", "PM Store", "STORE", "PM"], ["PRD", "Production", "PRODUCTION", "RM,SFG"],
      ["PAK", "Packing", "PACKING", "SFG,PM,FG"], ["FGS", "FG Store", "STORE", "FG,SFG"], ["RTN", "Returns / Assessment Hold", "HOLD", "FG"],
      ["DMG", "Damaged / Expired Stock", "HOLD", "FG,SFG"]];
    var d = { company: { name: Suite.client().name, state: "Kerala", address: "", pincode: "", gstin: "", phone: "", email: "", logo: "" },
      plants: [], locations: [], routes: [], distributors: [], products: [] };
    function err(m) { throw new Error(m); }
    function out(extra) { return Object.assign({ ok: true }, JSON.parse(JSON.stringify(d)), extra || {}); }
    function call(action, p) {
      if (action === "profile") return out();
      if (action === "saveCompanyProfile") { d.company = Object.assign({}, d.company, p.company); return { ok: true, company: d.company }; }
      if (action === "savePlants") {
        var names = {};
        var keepIds = {};
        p.plants.forEach(function (x, i) {
          if (names[key(x.name)]) err("Two plants are called \"" + x.name + "\"."); names[key(x.name)] = 1;
          var row = d.plants.filter(function (y) { return y.plant_id === x.plant_id; })[0];
          if (!row) {
            var code = (x.code || x.name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "PLT").toUpperCase();
            while (d.plants.some(function (y) { return y.code === code; })) code = code.slice(0, 2) + Math.floor(Math.random() * 9 + 1);
            row = { plant_id: "P" + (d.plants.length + 1), code: code, sort: 0 };
            d.plants.push(row);
            STD.forEach(function (s, si) { d.locations.push({ location_id: code + "-" + s[0], name: s[1], plant_id: row.plant_id, type: s[2], categories: s[3], active: true, sort: d.plants.length * 100 + si, standard: s[0] }); });
          }
          row.name = x.name; row.active = true; row.sort = (i + 1) * 10; keepIds[row.plant_id] = 1;
        });
        d.plants.forEach(function (y) { if (!keepIds[y.plant_id]) y.active = false; });
        return out();
      }
      if (action === "saveLocations") {
        p.locations.forEach(function (l) {
          var row = d.locations.filter(function (y) { return y.location_id === l.location_id; })[0];
          if (!l.name) err("Every place needs a name.");
          if (!row) {
            var pl = d.plants.filter(function (y) { return y.plant_id === l.plant_id; })[0];
            row = { location_id: pl.code + "-X" + (d.locations.length + 1), plant_id: pl.plant_id, sort: 800 + d.locations.length, standard: "" };
            d.locations.push(row);
          }
          row.name = l.name; row.type = l.type; row.categories = String(l.categories).toUpperCase(); row.active = l.active !== false;
        });
        return out();
      }
      if (action === "saveRoutes") {
        var seen = {};
        p.routes.forEach(function (r) { var id = String(r.route_id).toUpperCase(); if (!id) err("Every route needs a code like R1."); if (seen[id]) err("Route " + id + " is listed twice."); seen[id] = 1; });
        d.routes.forEach(function (r) { if (!seen[r.route_id]) r.active = false; });
        p.routes.forEach(function (r, i) {
          var id = String(r.route_id).toUpperCase();
          var row = d.routes.filter(function (y) { return y.route_id === id; })[0];
          if (!row) { row = { route_id: id }; d.routes.push(row); }
          Object.assign(row, { name: r.name || "Route " + id, van: String(r.van || "").toUpperCase(), salesperson: r.salesperson, plant_id: r.plant_id, active: true, sort: (i + 1) * 10 });
        });
        d.routes.forEach(function (r, i) {
          var lid = "VAN-" + r.route_id, row = d.locations.filter(function (y) { return y.location_id === lid; })[0];
          if (!row) { row = { location_id: lid, type: "VEHICLE", categories: "FG", sort: 5000 + i, standard: "VAN" }; d.locations.push(row); }
          row.name = r.route_id + " - Delivery Van" + (r.van ? " (" + r.van + ")" : ""); row.plant_id = r.plant_id; row.active = r.active;
        });
        return out();
      }
      if (action === "saveDistributors") {
        var errs = [];
        p.distributors.forEach(function (x, i) { if (!x.name) errs.push({ row: i + 1, message: "Name is missing." }); });
        if (errs.length) return { ok: false, errors: errs };
        d.distributors = p.distributors.map(function (x, i) { return Object.assign({ dist_id: x.dist_id || "D" + ("00" + (i + 1)).slice(-3) }, x); });
        return out();
      }
      if (action === "saveProducts") {
        var pe = checkProducts(p.products, d.plants.filter(function (x) { return x.active; }));
        if (pe.length) return { ok: false, errors: pe, errorCount: pe.length };
        var added = 0, updated = 0, n = {};
        p.products.forEach(function (r) {
          var cat = catOf(r.category), pk = key(r.plant);
          var plant = d.plants.filter(function (x) { return key(x.name) === pk || key(x.code) === pk; })[0];
          var sku = String(r.sku || "").toUpperCase();
          var row = d.products.filter(function (y) { return (sku && y.sku === sku) || (key(y.name) === key(r.name) && key(y.pack) === key(r.pack)); })[0];
          if (!row) {
            n[cat] = (n[cat] || d.products.filter(function (y) { return y.category === cat; }).length) + 1;
            row = { sku: sku || cat + "-" + ("000" + n[cat]).slice(-4) }; d.products.push(row); added++;
          } else updated++;
          Object.assign(row, { name: r.name, category: cat, plant_id: plant ? plant.plant_id : "", uom: r.uom, pack: r.pack || "",
            price: num(r.price) || 0, hsn: r.hsn || "", gst: num(r.gst) || 0, active: key(r.active) !== "NO" });
        });
        return out({ added: added, updated: updated, deactivated: 0 });
      }
      return { ok: true };
    }
    return { call: call };
  })();

  window.Company = { render: render };
})();
