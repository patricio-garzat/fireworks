// ¿En qué va la revisión de Fireworks? Imprime el estado de la versión en App Store Connect y si ya se ve en la App Store.
// Uso: node tools/asc-review.js   → una línea JSON: { version, state, released, storeUrl }
//   state: WAITING_FOR_REVIEW, IN_REVIEW, PENDING_DEVELOPER_RELEASE, READY_FOR_SALE, REJECTED, METADATA_REJECTED…
//   released: true cuando la búsqueda pública de Apple (itunes lookup) ya encuentra la app
const crypto = require("crypto"), fs = require("fs"), https = require("https");
const APP_ID = "6824312124";
const env = Object.fromEntries(fs.readFileSync(process.env.HOME + "/.appstoreconnect/cubeswipe.env", "utf8").split("\n").filter((l) => /^ASC_/.test(l)).map((l) => { const [k, ...v] = l.split("="); return [k, v.join("=").replace(/"/g, "").replace("$HOME", process.env.HOME)]; }));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url"), now = Math.floor(Date.now() / 1000);
const h = b64({ alg: "ES256", kid: env.ASC_KEY_ID, typ: "JWT" }), b = b64({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
const token = h + "." + b + "." + crypto.sign("sha256", Buffer.from(h + "." + b), { key: fs.readFileSync(env.ASC_KEY_PATH), dsaEncoding: "ieee-p1363" }).toString("base64url");
const get = (host, path, auth) => new Promise((res, rej) => https.get({ host, path, headers: auth ? { Authorization: "Bearer " + token } : {} }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));
(async () => {
  const v = (await get("api.appstoreconnect.apple.com", `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS`, true)).data[0];
  const look = await get("itunes.apple.com", `/lookup?id=${APP_ID}&country=us`);
  console.log(JSON.stringify({ version: v.attributes.versionString, state: v.attributes.appStoreState, released: look.resultCount > 0, storeUrl: `https://apps.apple.com/app/id${APP_ID}` }));
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
