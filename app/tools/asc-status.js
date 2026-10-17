// Revisa en App Store Connect el estado de un build de Fireworks (usa la clave Admin de ~/.appstoreconnect).
// Uso: node tools/asc-status.js <número de build> [minutos máximos de espera]
// Sale con 0 si Apple lo procesó bien y está en TestFlight, 1 si falló o no apareció.
const crypto = require("crypto"), fs = require("fs"), https = require("https");
const env = Object.fromEntries(fs.readFileSync(process.env.HOME + "/.appstoreconnect/cubeswipe.env", "utf8").split("\n").filter((l) => /^ASC_/.test(l)).map((l) => { const [k, ...v] = l.split("="); return [k, v.join("=").replace(/"/g, "").replace("$HOME", process.env.HOME)]; }));
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "ES256", kid: env.ASC_KEY_ID, typ: "JWT" }), body = b64({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: fs.readFileSync(env.ASC_KEY_PATH), dsaEncoding: "ieee-p1363" }).toString("base64url");
const token = head + "." + body + "." + sig;
const get = (path) => new Promise((res, rej) => https.get({ host: "api.appstoreconnect.apple.com", path, headers: { Authorization: "Bearer " + token } }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d))); }).on("error", rej));
const want = process.argv[2], maxMin = +(process.argv[3] || 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const apps = await get("/v1/apps?filter[bundleId]=com.blubergames.fireworks");
  const appId = apps.data[0].id;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMin * 60000) {
    const r = await get(`/v1/builds?filter[app]=${appId}&filter[version]=${want}&include=preReleaseVersion`);
    const b = (r.data || [])[0];
    if (b) {
      const st = b.attributes.processingState;
      const v = ((r.included || []).find((x) => x.type === "preReleaseVersions") || { attributes: {} }).attributes.version;
      console.log(`Build ${v} (${want}): ${st}`);
      if (st === "VALID") { console.log("Listo en TestFlight."); process.exit(0); }
      if (st === "INVALID" || st === "FAILED") { console.log("Apple rechazó el build. Revisa el correo de App Store Connect (por ejemplo, versión ya aprobada: sube con ./release.sh <versión nueva>)."); process.exit(1); }
    } else console.log(`Build ${want}: Apple todavía no lo muestra...`);
    await sleep(30000);
  }
  console.log("No apareció a tiempo. Si la versión ya fue aprobada, Apple lo rechaza en silencio: usa ./release.sh <versión nueva>.");
  process.exit(1);
})();
