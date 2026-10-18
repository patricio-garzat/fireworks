// Llena la ficha de Fireworks en App Store Connect por la API (clave Admin de ~/.appstoreconnect/cubeswipe.env):
// versión, textos en inglés y español, capturas (store/appstore-6.9 y 6.3), categoría, clasificación 4+, gratis,
// disponible en todos los países, derechos de contenido y notas para App Review. Si se corre otra vez, actualiza.
// Lo que Apple no deja por la API (App Privacy, tu contacto para App Review y mandar a revisión) se hace en la web.
// Uso: node tools/asc-listing.js [solo]   solo: meta | shots | price | build <número>
const crypto = require("crypto"), fs = require("fs"), https = require("https"), path = require("path");
const env = Object.fromEntries(fs.readFileSync(process.env.HOME + "/.appstoreconnect/cubeswipe.env", "utf8").split("\n").filter((l) => /^ASC_/.test(l)).map((l) => { const [k, ...v] = l.split("="); return [k, v.join("=").replace(/"/g, "").replace("$HOME", process.env.HOME)]; }));
function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url"), now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "ES256", kid: env.ASC_KEY_ID, typ: "JWT" }), b = b64({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: "appstoreconnect-v1" });
  return h + "." + b + "." + crypto.sign("sha256", Buffer.from(h + "." + b), { key: fs.readFileSync(env.ASC_KEY_PATH), dsaEncoding: "ieee-p1363" }).toString("base64url");
}
function api(method, p, body) {
  return new Promise((res, rej) => {
    const req = https.request({ host: "api.appstoreconnect.apple.com", path: p, method, headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" } }, (r) => {
      let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => {
        const j = d ? JSON.parse(d) : {};
        if (r.statusCode >= 300) return rej(new Error(`${method} ${p} → ${r.statusCode}: ${(j.errors || []).map((e) => e.detail || e.title).join(" | ")}`));
        res(j);
      });
    });
    req.on("error", rej);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
function put(url, headers, buf) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = https.request({ host: u.host, path: u.pathname + u.search, method: "PUT", headers: { ...headers, "Content-Length": buf.length } }, (r) => { r.resume(); r.on("end", () => (r.statusCode < 300 ? res() : rej(new Error("upload " + r.statusCode)))); });
    req.on("error", rej); req.write(buf); req.end();
  });
}
const BUNDLE = "com.blubergames.fireworks", STORE = path.join(__dirname, "..", "store");
const URLS = { supportUrl: "https://blubergames.com/support/", marketingUrl: "https://blubergames.com" };
const PRIVACY = "https://blubergames.com/privacy/";

// Los textos salen de APP_STORE.md (una sola fuente)
function texts() {
  const md = fs.readFileSync(path.join(__dirname, "..", "APP_STORE.md"), "utf8");
  const part = (title) => md.slice(md.indexOf("### " + title), md.indexOf("###", md.indexOf("### " + title) + 4));
  const pick = (s, k) => (s.match(new RegExp("\\*\\*" + k + ":\\*\\* (.+)")) || [])[1].replace(/^`|`$/g, "").trim();
  const desc = (s) => s.match(/```\n([\s\S]*?)\n```/)[1];
  return Object.fromEntries([["en-US", "English (U.S.)", "en"], ["es-MX", "Spanish (Mexico)", "es"]].map(([loc, title, dir]) => {
    const s = part(title);
    return [loc, { dir, name: pick(s, "Name"), subtitle: pick(s, "Subtitle"), promotionalText: pick(s, "Promotional Text"), keywords: pick(s, "Keywords"), description: desc(s) }];
  }));
}

(async () => {
  const only = process.argv[2];
  const app = (await api("GET", `/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0];
  if (!app) throw new Error("Primero crea la app en App Store Connect");
  const ver = (await api("GET", `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS`)).data.find((v) => /PREPARE|REJECTED|DEVELOPER/.test(v.attributes.appStoreState));
  const info = (await api("GET", `/v1/apps/${app.id}/appInfos`)).data.find((v) => /PREPARE|REJECTED|DEVELOPER/.test(v.attributes.appStoreState || v.attributes.state || "PREPARE"));
  const T = texts();
  console.log(`App ${app.id} · versión ${ver.attributes.versionString} (${ver.id})`);

  if (!only || only === "meta") {
    const pbx = fs.readFileSync(path.join(__dirname, "..", "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    const versionString = pbx.match(/MARKETING_VERSION = ([0-9.]+);/)[1];
    await api("PATCH", `/v1/appStoreVersions/${ver.id}`, { data: { type: "appStoreVersions", id: ver.id, attributes: { versionString, copyright: "2026 BluBer Games", releaseType: "MANUAL" } } });
    console.log("versión", versionString, "· copyright · lanzamiento manual");
    await api("PATCH", `/v1/apps/${app.id}`, { data: { type: "apps", id: app.id, attributes: { contentRightsDeclaration: "DOES_NOT_USE_THIRD_PARTY_CONTENT" } } });
    // categoría
    await api("PATCH", `/v1/appInfos/${info.id}`, { data: { type: "appInfos", id: info.id, relationships: {
      primaryCategory: { data: { type: "appCategories", id: "GAMES" } },
      primarySubcategoryOne: { data: { type: "appCategories", id: "GAMES_CASUAL" } },
      primarySubcategoryTwo: { data: { type: "appCategories", id: "GAMES_SIMULATION" } },
      secondaryCategory: { data: { type: "appCategories", id: "ENTERTAINMENT" } } } } });
    console.log("categoría: Games → Casual, Simulation · Entertainment");
    // nombre, subtítulo y privacidad por idioma
    const infoLocs = (await api("GET", `/v1/appInfos/${info.id}/appInfoLocalizations`)).data;
    for (const [loc, t] of Object.entries(T)) {
      const attrs = { name: t.name, subtitle: t.subtitle, privacyPolicyUrl: PRIVACY };
      const ex = infoLocs.find((l) => l.attributes.locale === loc);
      if (ex) await api("PATCH", `/v1/appInfoLocalizations/${ex.id}`, { data: { type: "appInfoLocalizations", id: ex.id, attributes: attrs } });
      else await api("POST", `/v1/appInfoLocalizations`, { data: { type: "appInfoLocalizations", attributes: { locale: loc, ...attrs }, relationships: { appInfo: { data: { type: "appInfos", id: info.id } } } } });
      console.log(loc, "nombre y subtítulo:", t.name, "·", t.subtitle);
    }
    // descripción, palabras clave, texto promocional y URLs por idioma
    const verLocs = (await api("GET", `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`)).data;
    for (const [loc, t] of Object.entries(T)) {
      const attrs = { description: t.description, keywords: t.keywords, promotionalText: t.promotionalText, ...URLS };
      const ex = verLocs.find((l) => l.attributes.locale === loc);
      if (ex) await api("PATCH", `/v1/appStoreVersionLocalizations/${ex.id}`, { data: { type: "appStoreVersionLocalizations", id: ex.id, attributes: attrs } });
      else await api("POST", `/v1/appStoreVersionLocalizations`, { data: { type: "appStoreVersionLocalizations", attributes: { locale: loc, ...attrs }, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: ver.id } } } } });
      console.log(loc, "descripción, palabras clave y texto promocional");
    }
    // clasificación por edad: todo "None" / No → 4+
    const age = await api("GET", `/v1/appInfos/${info.id}/ageRatingDeclaration`);
    const none = ["alcoholTobaccoOrDrugUseOrReferences", "contests", "gamblingSimulated", "gunsOrOtherWeapons", "horrorOrFearThemes", "matureOrSuggestiveThemes", "medicalOrTreatmentInformation", "profanityOrCrudeHumor", "sexualContentGraphicAndNudity", "sexualContentOrNudity", "violenceCartoonOrFantasy", "violenceRealistic", "violenceRealisticProlongedGraphicOrSadistic"];
    const no = ["gambling", "socialMedia", "unrestrictedWebAccess", "lootBox", "messagingAndChat", "parentalControls", "ageAssurance", "userGeneratedContent", "advertising", "healthOrWellnessTopics"];
    const attrs = {};
    for (const k of none) if (k in age.data.attributes) attrs[k] = "NONE";
    for (const k of no) if (k in age.data.attributes) attrs[k] = false;
    await api("PATCH", `/v1/ageRatingDeclarations/${age.data.id}`, { data: { type: "ageRatingDeclarations", id: age.data.id, attributes: attrs } });
    console.log("edad: todo None/No (4+)");
    // notas para App Review (tu nombre, teléfono y correo se ponen en la web)
    const notes = fs.readFileSync(path.join(__dirname, "..", "APP_STORE.md"), "utf8").match(/\*\*Notas para App Review:\*\* `([^`]+)`/)[1];
    let rd = null;
    try { rd = (await api("GET", `/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`)).data; } catch (e) {}
    if (rd) await api("PATCH", `/v1/appStoreReviewDetails/${rd.id}`, { data: { type: "appStoreReviewDetails", id: rd.id, attributes: { notes, demoAccountRequired: false } } });
    else await api("POST", `/v1/appStoreReviewDetails`, { data: { type: "appStoreReviewDetails", attributes: { notes, demoAccountRequired: false }, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: ver.id } } } } });
    console.log("notas para App Review");
  }

  if (!only || only === "price") {
    // gratis
    const pts = await api("GET", `/v1/apps/${app.id}/appPricePoints?filter[territory]=USA&limit=200`);
    const free = pts.data.find((p) => +p.attributes.customerPrice === 0);
    await api("POST", `/v1/appPriceSchedules`, { data: { type: "appPriceSchedules", relationships: {
      app: { data: { type: "apps", id: app.id } }, baseTerritory: { data: { type: "territories", id: "USA" } },
      manualPrices: { data: [{ type: "appPrices", id: "${p0}" }] } } },
      included: [{ type: "appPrices", id: "${p0}", attributes: { startDate: null }, relationships: { appPricePoint: { data: { type: "appPricePoints", id: free.id } } } }] });
    console.log("precio: gratis");
    // todos los países
    let terr = [], next = `/v1/territories?limit=200`;
    while (next) { const r = await api("GET", next); terr = terr.concat(r.data.map((t) => t.id)); next = r.links.next ? r.links.next.replace("https://api.appstoreconnect.apple.com", "") : null; }
    try {
      await api("POST", `/v2/appAvailabilities`, { data: { type: "appAvailabilities", attributes: { availableInNewTerritories: true }, relationships: {
        app: { data: { type: "apps", id: app.id } }, territoryAvailabilities: { data: terr.map((t) => ({ type: "territoryAvailabilities", id: "${" + t + "}" })) } } },
        included: terr.map((t) => ({ type: "territoryAvailabilities", id: "${" + t + "}", attributes: { available: true }, relationships: { territory: { data: { type: "territories", id: t } } } })) });
      console.log("disponible en", terr.length, "países");
    } catch (e) { console.log("disponibilidad:", e.message); }
  }

  if (!only || only === "shots") {
    const SETS = [["appstore-6.9", "APP_IPHONE_67"], ["appstore-6.3", "APP_IPHONE_61"]];
    const verLocs = (await api("GET", `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`)).data;
    for (const [loc, t] of Object.entries(T)) {
      const vl = verLocs.find((l) => l.attributes.locale === loc);
      const sets = (await api("GET", `/v1/appStoreVersionLocalizations/${vl.id}/appScreenshotSets`)).data;
      for (const [dir, type] of SETS) {
        let set = sets.find((s) => s.attributes.screenshotDisplayType === type);
        if (set) { // se reemplazan las que había
          const old = (await api("GET", `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
          for (const o of old) await api("DELETE", `/v1/appScreenshots/${o.id}`);
        } else set = (await api("POST", `/v1/appScreenshotSets`, { data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: type }, relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: vl.id } } } } })).data;
        const files = fs.readdirSync(path.join(STORE, dir, t.dir)).filter((f) => f.endsWith(".png")).sort();
        for (const f of files) {
          const buf = fs.readFileSync(path.join(STORE, dir, t.dir, f));
          const sc = (await api("POST", `/v1/appScreenshots`, { data: { type: "appScreenshots", attributes: { fileName: f, fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: set.id } } } } })).data;
          for (const op of sc.attributes.uploadOperations) await put(op.url, Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])), buf.subarray(op.offset, op.offset + op.length));
          await api("PATCH", `/v1/appScreenshots/${sc.id}`, { data: { type: "appScreenshots", id: sc.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash("md5").update(buf).digest("hex") } } });
        }
        console.log(loc, type, files.length, "capturas");
      }
    }
  }

  if (only === "build") {
    const n = process.argv[3];
    const b = (await api("GET", `/v1/builds?filter[app]=${app.id}&filter[version]=${n}`)).data[0];
    if (!b) throw new Error("No encuentro el build " + n);
    await api("PATCH", `/v1/appStoreVersions/${ver.id}/relationships/build`, { data: { type: "builds", id: b.id } });
    console.log("build", n, "elegido para la versión", ver.attributes.versionString);
  }
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
