// Capturas para la App Store de Fireworks, hechas con el juego REAL (../../index.html) en Chrome sin ventana.
// Tamaños: iPhone 6.9" (1290×2796) y 6.3" (1206×2622), en inglés y español → store/appstore-6.9/{en,es}/ y appstore-6.3/{en,es}/.
// Cada captura: arma la escena (escenario, fuegos, Taller…), detiene el juego y avanza la simulación cuadro por cuadro
// hasta el momento bonito (siempre igual: Math.random con semilla), le pone el texto arriba y toma la foto.
// Uso: cd app && node store/make-shots.mjs   (antes: npm run build o python3 ../tools/build.py, para que index.html esté al día)
import { spawn } from "node:child_process";
import WebSocket from "ws";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = "file://" + path.resolve(HERE, "..", "..", "index.html");
const SIZES = { "appstore-6.9": [430, 932], "appstore-6.3": [402, 874] };   // ×3 = 1290×2796 y 1206×2622
const ONLY = process.env.ONLY;   // pruebas: ONLY=1 (una captura) o ONLY=1:en:appstore-6.9

const SHOTS = [
  { id: "1-paint", en: ["Paint the night sky", "Tap anywhere and watch it bloom."], es: ["Pinta el cielo de noche", "Toca donde quieras y míralo florecer."] },
  { id: "2-kinds", en: ["27 kinds of fireworks", "Willows, hearts, jellyfish and more."], es: ["27 tipos de fuegos", "Sauces, corazones, medusas y más."] },
  { id: "3-workshop", en: ["Design your own", "Shape, colors, ending, tail and whistle."], es: ["Diseña los tuyos", "Forma, colores, final, cola y silbido."] },
  { id: "4-draw", en: ["Draw it. Launch it.", "Your own drawing, written in light."], es: ["Dibújalo y lánzalo", "Tu propio dibujo, escrito con luz."] },
  { id: "5-finale", en: ["Grand finales", "Fill the bar and the whole sky erupts."], es: ["Grandes finales", "Llena la barra y todo el cielo estalla."] },
  { id: "6-scenes", en: ["Calm, living scenes", "Lakes, cities, snow, and tonight's moon."], es: ["Escenarios con vida", "Lagos, ciudades, nieve y la luna de hoy."] },
];

// Lo que corre dentro del juego para cada captura (VW/VH: tamaño en px CSS; U: escala del juego)
const SETUP = {
  "1-paint": `Scene.apply("lake"); R.clearTrails();
    L(0.5*VW, 0.33*VH, "willow", 1.5); L(0.22*VW, 0.42*VH, "chrysanthemum", 1.0, 0.25); L(0.78*VW, 0.39*VH, "dahlia", 1.0, 0.45);
    L(0.3*VW, 0.27*VH, "ring", 0.8, 0.7); L(0.73*VW, 0.26*VH, "palm", 0.9, 0.8); run(2.35);`,
  "2-kinds": `Scene.apply("desert"); R.clearTrails();
    L(0.27*VW, 0.3*VH, "heart", 0.85, 0.1); L(0.74*VW, 0.29*VH, "star", 0.85, 0.2); L(0.5*VW, 0.5*VH, "jelly", 0.95, 0.0);
    L(0.2*VW, 0.56*VH, "saturn", 0.6, 0.35); L(0.8*VW, 0.56*VH, "flowers", 0.6, 0.4); run(2.15);`,
  "3-workshop": `Scene.apply("alpine"); R.clearTrails();
    Save.customs = [{ id: "cdemo", name: T("Golden Wave", "Ola dorada"), shape: "dahlia", c1: "rosegold", c2: "ice", end: "glitter", tail: "glitter", whistle: true, size: "l" },
      { id: "cdemo2", name: T("Midnight", "Medianoche"), shape: "heart", c1: "violet", c2: "pink", end: "crackle", tail: "gold", whistle: false, size: "m" }];
    Workshop.register(); UI.refreshPicker(); document.getElementById("pick-btn").click(); await W(100); document.getElementById("pick-ws").click(); await W(650);
    document.querySelector("#ws-body .ws-item").click(); await W(150);
    document.querySelector('.ws-tabs [data-tab="color"]').click(); await W(150);
    P.clear(); R.clearTrails(); L(0.5*VW, 0.3*VH, "cdemo", 1.15); run(1.55); await W(300);`,
  "4-draw": `Scene.apply("bridge"); R.clearTrails();
    const heart = []; for (let i = 0; i <= 40; i++) { const th = i / 40 * Math.PI * 2; heart.push([16 * Math.sin(th) ** 3 / 17, -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th)) / 17]); }
    const smile = [], ring = []; for (let i = 0; i <= 36; i++) { const a = i / 36 * Math.PI * 2; ring.push([Math.cos(a) * 0.95, Math.sin(a) * 0.95]); }
    for (let i = 0; i <= 14; i++) { const a = 0.2 * Math.PI + i / 14 * 0.6 * Math.PI; smile.push([Math.cos(a) * 0.55, Math.sin(a) * 0.55 + 0.05]); }
    const star = [[0,-1],[0.59,0.81],[-0.95,-0.31],[0.95,-0.31],[-0.59,0.81],[0,-1]];
    Save.customs = [{ id: "dh", name: "h", shape: "doodle", doodle: [heart], c1: "pink", c2: "rosegold", end: "glitter", tail: "gold", whistle: true, size: "l" },
      { id: "ds", name: "s", shape: "doodle", doodle: [star], c1: "gold", c2: "yellow", end: "none", tail: "glitter", whistle: false, size: "m" },
      { id: "dm", name: "m", shape: "doodle", doodle: [ring, [[-0.33,-0.32],[-0.33,-0.2]], [[0.33,-0.32],[0.33,-0.2]], smile], c1: "cyan", c2: "ice", end: "none", tail: "gold", whistle: false, size: "s" }];
    Workshop.register();
    L(0.5*VW, 0.32*VH, "dh", 1.3); L(0.24*VW, 0.5*VH, "ds", 1.0, 0.2); L(0.77*VW, 0.5*VH, "dm", 1.0, 0.35); run(2.2);`,
  "5-finale": `Scene.apply("city"); R.clearTrails();
    const ts = ["chrysanthemum", "palm", "crackle", "dahlia", "ring", "willow", "strobe", "ghost", "classic", "crossette"];
    for (let i = 0; i < 16; i++) L((0.1 + ((i * 0.381) % 1) * 0.8) * VW, (0.24 + ((i * 0.618) % 1) * 0.28) * VH, ts[i % ts.length], 0.95, i * 0.11);
    L(0.5*VW, 0.3*VH, "grand", 1.6, 0.4); run(3.0);`,
  "6-scenes": `Scene.apply("snow"); R.clearTrails();
    L(0.5*VW, 0.3*VH, "willow", 1.4); L(0.26*VW, 0.38*VH, "ring", 0.85, 0.3); L(0.75*VW, 0.36*VH, "chrysanthemum", 0.9, 0.5); run(2.3);`,
};

const PAGE_JS = (shot, lang) => `(async () => {
  const W = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = (en, es) => (${lang === "es"} ? es : en);
  const q = [];
  const L = (x, y, type, power, at = 0) => q.push({ x, y, type, power, at });
  // avanza la simulación s segundos a 60 cuadros, lanzando cada fuego en su momento
  const run = (s) => { let t = 0; q.sort((a, b) => a.at - b.at); while (t < s) { while (q.length && q[0].at <= t) { const f = q.shift(); Game.launch(f.x, f.y, f.type, f.power, { auto: true }); } Main.step(1 / 60); t += 1 / 60; } };
  const hide = (sels) => sels.forEach((s) => document.querySelectorAll(s).forEach((e) => (e.style.visibility = "hidden")));
  const show = (sels) => sels.forEach((s) => document.querySelectorAll(s).forEach((e) => (e.style.visibility = "")));
  UI.enter("zen"); await W(300);
  Main.stop();
  Q.auto = false; Q.level = 2; P.cap = 16000; R.resize(VW, VH, 3);
  hide(["#hud", "#picker", "#toasts", "#countdown", "#home"]);
  P.clear(); R.clearTrails();
  ${SETUP[shot.id]}
  Main.step(1 / 60);
  // el texto de arriba, sobre una sombra suave
  const cap = document.createElement("div");
  cap.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:300;padding:calc(env(safe-area-inset-top) + 74px) 26px 70px;text-align:center;pointer-events:none;" +
    "background:linear-gradient(180deg,rgba(2,4,12,.82) 0%,rgba(2,4,12,.55) 55%,rgba(2,4,12,0) 100%);font-family:-apple-system,'SF Pro Display','Helvetica Neue',sans-serif";
  cap.innerHTML = '<div style="font-weight:600;font-size:' + (VW < 420 ? 35 : 37) + 'px;line-height:1.08;letter-spacing:-0.01em;color:#F7F3EA;text-shadow:0 0 22px rgba(255,214,160,.25)">' + ${JSON.stringify("")} + '</div>' +
    '<div style="margin-top:12px;font-weight:400;font-size:18px;line-height:1.3;color:rgba(237,239,247,.78)"></div>';
  cap.children[0].textContent = ${JSON.stringify(lang)} === "es" ? ${JSON.stringify(shot.es[0])} : ${JSON.stringify(shot.en[0])};
  cap.children[1].textContent = ${JSON.stringify(lang)} === "es" ? ${JSON.stringify(shot.es[1])} : ${JSON.stringify(shot.en[1])};
  document.body.appendChild(cap);
  // el título siempre en una línea: se achica hasta que cabe
  const tt = cap.children[0]; tt.style.whiteSpace = "nowrap"; tt.style.display = "inline-block";
  let fs = parseFloat(tt.style.fontSize);
  while (tt.getBoundingClientRect().width > VW - 44 && fs > 24) { fs -= 1; tt.style.fontSize = fs + "px"; }
  await W(250);
  return true;
})()`;

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9520;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fw-shots-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--mute-audio", "--hide-scrollbars",
  "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch (e) {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver;
for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch (e) { await sleep(250); } }

async function capture(shot, lang, dir, [w, h]) {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 1 << 28 });
  await new Promise((r) => ws.once("open", r));
  let id = 0; const pend = new Map(), errs = [];
  ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 3, mobile: true });
  const save = { sparks: 12000, unlocked: { types: ["classic", "willow", "ring", "double", "crackle", "palm", "whirl", "spiral", "chrysanthemum", "fish", "strobe", "dahlia", "ghost", "comet", "flowers", "crossette", "horsetail", "doodle", "fireflies", "heart", "lanterns", "swarm", "saturn", "jelly", "triple", "curtain", "star"], palettes: ["classic"], scenes: ["alpine", "lake", "city", "bay", "snow", "bridge"] }, selected: { type: "mix", palette: "classic", scene: "lake" }, doodleMoved: true, customs: [] };
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { let s = 20261018; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    localStorage.setItem("fireworks-save-v1", ${JSON.stringify(JSON.stringify(save))}); localStorage.setItem("fireworks-settings-v1", ${JSON.stringify(JSON.stringify({ sfx: 0, music: 0, haptics: false, realMoon: true, quality: "high", lang: lang === "es" ? 1 : 0 }))}); })();` });
  await send("Page.navigate", { url: GAME });
  await sleep(9500);   // las dos intros
  const r = await send("Runtime.evaluate", { expression: PAGE_JS(shot, lang), awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) errs.push(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  const shotRes = await send("Page.captureScreenshot", { format: "png" });
  const out = path.join(HERE, dir, lang, `${shot.id}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shotRes.result.data, "base64"));
  ws.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`);
  console.log(path.relative(HERE, out), errs.length ? "ERRORES: " + errs.join(" | ") : "ok");
}

const jobs = [];
for (const [dir, size] of Object.entries(SIZES)) for (const lang of ["en", "es"]) for (const [i, shot] of SHOTS.entries()) {
  if (ONLY) { const [n, l, d] = ONLY.split(":"); if (+n !== i + 1 || (l && l !== lang) || (d && d !== dir)) continue; }
  jobs.push(() => capture(shot, lang, dir, size));
}
// de 4 en 4
for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map((j) => j()));
process.exit(0);
