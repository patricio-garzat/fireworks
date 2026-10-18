"use strict";
/* special.js: Fechas especiales con cuenta regresiva en vivo.
   - Seis fechas (hora local): Año Nuevo, Año Nuevo Lunar, Independencia de México (El Grito, 15 sep a las 23:00),
     4 de julio, Diwali y Navidad (medianoche del 24). Las que cambian de día cada año van en tablas.
   - En el Inicio: la semana antes, un aviso discreto ("Diwali en 6 días"); el mismo día, la cuenta regresiva en vivo.
     Al tocarlo se entra al modo de cuenta regresiva: números grandes y delgados en el cielo, fuegos del tema de vez en
     cuando y la persona puede lanzar los suyos. El último minuto se calma; los últimos 10 s, dígitos grandes con un
     "tic" suave y vibración ligera. En cero: un show especial con los colores de la fecha y el saludo escrito con fuegos.
   - Ajustes → Fechas especiales: la lista con sus fechas y "Ver demo" (una cuenta de 15 s para verlo hoy).
   - TextShape: convierte un texto en puntos (el contorno de las letras) para escribirlo en el cielo. */

const TextShape = (() => {
  const cache = new Map();
  // Puntos del contorno de un texto (una o más líneas), normalizados: x de -1 a 1, y proporcional (centrado)
  function points(text) {
    if (cache.has(text)) return cache.get(text);
    const lines = text.split("\n"), F = 120, lh = F * 1.05;
    const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
    const font = `800 ${F}px -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`;
    g.font = font;
    const W = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + 20, H = Math.ceil(lh * lines.length) + 20;
    c.width = W; c.height = H;
    g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    g.strokeStyle = "#fff"; g.lineWidth = 3; g.lineJoin = "round";
    lines.forEach((l, i) => g.strokeText(l, W / 2, 10 + lh * (i + 0.5)));
    const d = g.getImageData(0, 0, W, H).data, pts = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 128) pts.push([x, y, Math.min(lines.length - 1, Math.floor((y - 10) / lh))]);
    const s = 2 / W, out = pts.map(([x, y, li]) => [(x - W / 2) * s, (y - H / 2) * s, li]);
    cache.set(text, out);
    return out;
  }
  // n puntos repartidos por todo el contorno
  function sample(text, n) {
    const all = points(text);
    if (all.length <= n) return all;
    const out = [], step = all.length / n;
    for (let i = 0; i < n; i++) out.push(all[Math.floor(i * step + Math.random() * step * 0.6)]);
    return out;
  }
  return { sample };
})();

const Special = (() => {
  const LUNAR = { 2027: [1, 6], 2028: [0, 26], 2029: [1, 13], 2030: [1, 3], 2031: [0, 23], 2032: [1, 11] };   // [mes (0-11), día]
  const DIWALI = { 2026: [10, 8], 2027: [9, 29], 2028: [9, 17], 2029: [10, 5], 2030: [9, 26], 2031: [10, 14], 2032: [10, 2] };
  const EVENTS = [
    { id: "newyear", name: ["New Year", "Año Nuevo"], at: (y) => new Date(y, 0, 1, 0, 0, 0), greet: (y) => [String(y), String(y)], hello: ["Happy New Year", "Feliz Año Nuevo"],
      colors: [C.gold, C.warm, C.silver, C.white, C.pearl], metal: C.gold },
    { id: "lunar", name: ["Lunar New Year", "Año Nuevo Lunar"], at: (y) => (LUNAR[y] ? new Date(y, LUNAR[y][0], LUNAR[y][1], 0, 0, 0) : null), greet: () => ["新年快乐", "新年快乐"], hello: ["Happy Lunar New Year", "Feliz Año Nuevo Lunar"],
      colors: [C.red, C.gold, C.amber, C.coral], metal: C.gold },
    { id: "mexico", name: ["Mexican Independence", "Independencia de México"], at: (y) => new Date(y, 8, 15, 23, 0, 0), greet: () => ["¡VIVA\nMÉXICO!", "¡VIVA\nMÉXICO!"], hello: ["¡Viva México!", "¡Viva México!"],
      colors: [C.green, C.white, C.red], metal: C.silver },
    { id: "july4", name: ["Independence Day", "4 de julio"], at: (y) => new Date(y, 6, 4, 21, 30, 0), greet: () => ["JULY 4TH", "4 DE JULIO"], hello: ["Happy 4th of July", "Feliz 4 de julio"],
      colors: [C.red, C.white, C.blue], metal: C.silver },
    { id: "diwali", name: ["Diwali", "Diwali"], at: (y) => (DIWALI[y] ? new Date(y, DIWALI[y][0], DIWALI[y][1], 20, 0, 0) : null), greet: () => ["DIWALI", "DIWALI"], hello: ["Happy Diwali", "Feliz Diwali"],
      colors: [C.gold, C.amber, C.magenta, C.orange, C.warm], metal: C.gold },
    { id: "xmas", name: ["Christmas", "Navidad"], at: (y) => new Date(y, 11, 25, 0, 0, 0), greet: () => ["MERRY\nCHRISTMAS", "FELIZ\nNAVIDAD"], hello: ["Merry Christmas", "Feliz Navidad"],
      colors: [C.red, C.green, C.gold, C.white], metal: C.gold },
  ];
  const AFTER = 2 * 3600e3;   // después de la hora, el saludo se queda 2 horas

  let demo = null;            // { ev, at } durante la vista previa
  let active = null;          // { ev, at, state: "wait" | "show" | "after", nextAuto, lastSec }
  const el = (id) => document.getElementById(id);

  // La próxima fecha (o la que acaba de pasar hace menos de 2 h)
  function upcoming(now = Date.now()) {
    if (demo) return demo;
    let best = null;
    const y = new Date(now).getFullYear();
    for (const ev of EVENTS) for (const yy of [y, y + 1]) {
      const d = ev.at(yy);
      if (!d) continue;
      const at = d.getTime();
      if (at + AFTER < now) continue;
      if (!best || at < best.at) best = { ev, at, year: yy };
      break;
    }
    return best;
  }
  const pal = (ev) => ({ colors: ev.colors, metal: ev.metal, heart: ev.colors[0] });
  const two = (n) => String(n).padStart(2, "0");
  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${two(h)}:${two(m)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`;
  }

  /* ---------- Aviso en el Inicio ---------- */
  function pill() {
    const b = el("special"), u = upcoming(), now = Date.now();
    if (!u) { b.hidden = true; return; }
    const left = u.at - now, days = Math.ceil((new Date(u.at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
    let text = "";
    if (left <= 0) text = u.ev.hello[LANG];
    else if (left < 24 * 3600e3) text = `${u.ev.name[LANG]} · ${clock(left)}`;
    else if (days <= 7) text = LANG ? `${u.ev.name[1]} en ${days} ${days === 1 ? "día" : "días"}` : `${u.ev.name[0]} in ${days} ${days === 1 ? "day" : "days"}`;
    b.hidden = !text;
    b.querySelector("span").textContent = text;
    b.classList.toggle("live", left < 24 * 3600e3);
  }

  /* ---------- Modo cuenta regresiva ---------- */
  function start() {
    const u = upcoming();
    if (!u) return;
    if (u.at - Date.now() > 24 * 3600e3) return;   // antes del día solo se avisa
    active = { ev: u.ev, at: u.at, year: u.year, state: u.at <= Date.now() ? "after" : "wait", nextAuto: 1.2, lastSec: -1 };
    UI.enter("special");
    el("countdown").hidden = false;
    el("cd-name").textContent = u.ev.name[LANG];
    if (active.state === "after") celebrate();
    render();
  }
  function stop() {
    active = null; demo = null;
    el("countdown").hidden = true;
    el("countdown").classList.remove("final", "done");
  }
  function render() {
    if (!active) return;
    const left = active.at - Date.now(), box = el("countdown");
    if (active.state === "wait") {
      const sec = Math.ceil(left / 1000), final = sec <= 10;
      box.classList.toggle("final", final);
      el("cd-time").textContent = final ? String(Math.max(sec, 0)) : clock(left);
      el("cd-sub").textContent = "";
      if (final && sec !== active.lastSec && sec > 0) {
        active.lastSec = sec;
        // cada segundo: el número entra de nuevo, un "tic" suave y vibración ligera
        const t = el("cd-time"); t.classList.remove("tick"); void t.offsetWidth; t.classList.add("tick");
        Sound.tap(); Haptics.tap();
      }
    } else {
      box.classList.remove("final"); box.classList.add("done");
      el("cd-time").textContent = active.ev.hello[LANG];
      el("cd-sub").textContent = "";
    }
  }

  // El show de la fecha: un arranque con los colores del tema, el saludo escrito con fuegos y un cierre dorado
  function celebrate() {
    const ev = active.ev, p = pal(ev), y = active.year;
    const words = ev.greet(y)[LANG];
    const L = (at, x, yy, type, power, extra = {}) => Timers.after(at, () => { if (active && active.ev === ev) Game.launch(VW * x, VH * yy, type, power, { auto: true, pal: p, ...extra }); });
    // 1. arranque: una fila de fuegos del tema, abajo
    for (let i = 0; i < 8; i++) L(0.1 + i * 0.12, 0.1 + 0.8 * (i / 7), rand(0.4, 0.5), pick(["classic", "chrysanthemum", "dahlia", "ring"]), 0.75);
    // 2. el saludo escrito con fuegos, arriba y con el cielo libre para que se lea
    L(1.4, 0.5, 0.24, "word", 1.4, { text: words });
    // 3. cuando ya se leyó: sauces a los lados, un crescendo con todo, y el gran cierre dorado
    L(4.4, 0.18, 0.4, "willow", 1.2); L(4.55, 0.82, 0.4, "willow", 1.2);
    for (let i = 0; i < 10; i++) L(6 + i * 0.35, rand(0.12, 0.88), rand(0.18, 0.42), pick(["crackle", "strobe", "palm", "saturn", "flowers", "curtain"]), rand(0.8, 1.1));
    L(10.2, 0.5, 0.26, "grand", 2.4); L(10.3, 0.18, 0.34, "willow", 1.5); L(10.4, 0.82, 0.34, "willow", 1.5);
    // 4. el saludo otra vez, cuando el cielo ya se calmó
    L(14.5, 0.5, 0.26, "word", 1.3, { text: words });
    Timers.after(2.7, () => Haptics.success());
  }

  // Se llama cada cuadro desde Main
  let acc = 0;
  function update(dt) {
    acc += dt;
    if (acc >= 0.25) {
      acc = 0;
      if (Game.mode === "home") pill();
      render();
    }
    if (!active) return;
    if (Game.mode !== "special") { stop(); return; }
    const left = active.at - Date.now();
    if (active.state === "wait") {
      if (left <= 0) { active.state = "show"; render(); celebrate(); Timers.after(19, () => { if (active) active.state = "after"; }); return; }
      // mientras se espera, fuegos del tema de vez en cuando (en el último minuto se calman: suspenso)
      if (left > 60e3) {
        active.nextAuto -= dt;
        if (active.nextAuto <= 0) {
          active.nextAuto = rand(4.5, 8);
          Game.launch(VW * rand(0.15, 0.85), VH * rand(0.2, 0.42), pick(["classic", "chrysanthemum", "ring", "willow", "palm", "ghost"]), rand(0.75, 1.05), { auto: true, pal: pal(active.ev) });
        }
      }
    } else if (active.state === "after") {
      active.nextAuto -= dt;
      if (active.nextAuto <= 0) {
        active.nextAuto = rand(5, 9);
        Game.launch(VW * rand(0.15, 0.85), VH * rand(0.2, 0.42), pick(["classic", "willow", "dahlia", "flowers", "lanterns"]), rand(0.8, 1.1), { auto: true, pal: pal(active.ev) });
      }
    }
  }

  // Vista previa: una cuenta de 15 s para ver hoy cómo será
  function preview(id) {
    const ev = EVENTS.find((e) => e.id === id) || EVENTS[0];
    demo = { ev, at: Date.now() + 15000, year: new Date().getFullYear() + (ev.id === "newyear" ? 1 : 0) };
    start();
  }
  // La lista para Ajustes: cada fecha con su próximo día
  function list() {
    const now = Date.now(), y = new Date(now).getFullYear();
    return EVENTS.map((ev) => {
      let d = ev.at(y);
      if (!d || d.getTime() + AFTER < now) d = ev.at(y + 1);
      return { id: ev.id, name: ev.name[LANG], at: d ? d.getTime() : Infinity, date: d ? d.toLocaleDateString(LANG ? "es" : "en", { day: "numeric", month: "long" }) : "" };
    }).sort((a, b) => a.at - b.at);   // la más cercana primero
  }

  function init() {
    el("special").addEventListener("click", () => { Sound.tap(); Haptics.tap(); start(); });
    pill();
  }

  return { init, update, preview, list, stop, get active() { return !!active; }, pal };
})();
