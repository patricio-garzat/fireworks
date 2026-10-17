"use strict";
/* game.js: cohetes, explosiones, Sparks, combos, Gran Final, retos, Show Creator y el cielo de fondo del Inicio. */

const COMBO_WINDOW = 1.5;           // segundos entre explosiones para seguir el combo
const COMBO_STEPS = [5, 10, 20, 35, 50, 75, 100];
const FULL_POWER = 2.1;

const Game = (() => {
  let mode = "home";                 // home | free | zen | show
  const rockets = [];
  let combo = 0, lastBurst = -99, bestThis = 0;
  let finale = null, rec = null, playing = null;
  let ambientIn = 1.2;

  const scoring = () => mode === "free";
  const palette = () => PALETTES[Save.selected.palette] || PALETTES.classic;
  const owned = () => TYPE_ORDER.filter((k) => Save.unlocked.types.includes(k));
  function chooseType() {
    const s = Save.selected.type;
    if (s !== "mix" && Save.unlocked.types.includes(s)) return s;
    return pick(owned());
  }
  const multFor = (c) => (c >= 35 ? 3 : c >= 20 ? 2.5 : c >= 10 ? 2 : c >= 5 ? 1.5 : 1);
  const flairFor = (c) => (c >= 20 ? 3 : c >= 10 ? 2 : c >= 5 ? 1 : 0);
  const panOf = (x) => clamp((x / VW) * 2 - 1, -1, 1);

  /* ---------- Lanzar ---------- */
  function launch(tx, ty, type, power = 1, opts = {}) {
    type = type || chooseType();
    const ly = Scene.launchY;
    ty = clamp(ty, VH * 0.06, ly - 70 * U);
    tx = clamp(tx, 12, VW - 12);
    const x0 = clamp(tx + rand(-0.07, 0.07) * VW + (VW / 2 - tx) * 0.12, 16, VW - 16);
    const dist = (ly - ty) / VH;
    const dur = (0.85 + 0.55 * dist) * (opts.chain ? 0.8 : 1) * (power > 1.4 ? 1.1 : 1);
    const T = TYPES[type];
    const r = {
      x0, y0: ly, tx, ty, x: x0, y: ly, t: 0, dur, type, power, opts, acc: 0, smoke: 0, seed: rand(100),
      pal: opts.pal || palette(), whistle: Sound.rise(dur, panOf(x0), panOf(tx), T.rise),
    };
    rockets.push(r);
    // Ignición: un destello pequeño abajo
    const iy = Math.min(ly, VH - 2);
    for (let k = 0; k < 10; k++) {
      const i = P.add(x0 + rand(-3, 3), iy, rand(-45, 45) * U, -rand(50, 170) * U, rand(0.18, 0.45), rand(1.4, 2) * U, 1.2, 0.85, 0.5);
      if (i >= 0) { P.kind[i] = K_SPARK; P.drag[i] = 4; P.grav[i] = 120 * U; }
    }
    Lights.add(x0, iy, C.gold, 0.35, 90 * U, 9);
    Sound.ignite(panOf(x0));
    if (!opts.auto && !opts.finale && !opts.replay && mode !== "home") {
      Save.stats.launches++;
      if (power >= FULL_POWER - 0.05) { Save.stats.charged++; Goals.event("charged"); }
      if (rec && rec.events.length < 160) rec.events.push({ t: +(Timers.time - rec.t0).toFixed(3), x: +(tx / VW).toFixed(4), y: +(ty / VH).toFixed(4), type, power: +power.toFixed(2) });
    }
    return r;
  }

  // Cadena: un deslizamiento deja una fila de explosiones que siguen el camino
  function chain(points) {
    if (points.length < 2) return;
    let len = 0;
    for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    const n = clamp(Math.round(len / (74 * U)), 3, 8);
    const type = chooseType(), colors = two(palette());
    const pts = resample(points, n);
    pts.forEach(([x, y], i) => Timers.after(i * 0.085, () => launch(x, y, type, 0.42, { chain: true, colors: i % 2 ? [colors[1], colors[0]] : colors })));
    if (scoring()) { Save.stats.chains++; Goals.event("chain"); }
  }
  function resample(pts, n) {
    const segs = [0];
    for (let i = 1; i < pts.length; i++) segs.push(segs[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = segs[segs.length - 1], out = [];
    for (let k = 0; k < n; k++) {
      const d = (k / (n - 1)) * total;
      let i = 1; while (i < segs.length - 1 && segs[i] < d) i++;
      const f = (d - segs[i - 1]) / Math.max(1e-6, segs[i] - segs[i - 1]);
      out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]);
    }
    return out;
  }

  /* ---------- Simulación ---------- */
  const EMBER_C = [1.0, 0.6, 0.24];
  function update(dt) {
    for (let k = rockets.length - 1; k >= 0; k--) {
      const r = rockets[k];
      const px = r.x, py = r.y;
      r.t += dt / r.dur;
      const t = Math.min(1, r.t), u = 1 - (1 - t) * (1 - t);
      r.x = lerp(r.x0, r.tx, u) + Math.sin(t * 17 + r.seed) * 1.3 * U * (1 - t);
      r.y = lerp(r.y0, r.ty, u);
      const vx = (r.x - px) / Math.max(dt, 1e-3), vy = (r.y - py) / Math.max(dt, 1e-3);
      // Estela: chispitas doradas que caen y se apagan
      r.acc += dt * (95 + 40 * r.power) * (1 - 0.6 * t) * (Q.level === 0 ? 0.6 : 1);
      while (r.acc >= 1) {
        r.acc -= 1;
        const f = Math.random();
        const i = P.add(lerp(px, r.x, f) + rand(-1, 1), lerp(py, r.y, f), -vx * 0.1 + rand(-14, 14) * U, -vy * 0.1 + rand(-8, 12) * U,
          rand(0.3, 0.75), rand(1.2, 1.9) * U, EMBER_C[0], EMBER_C[1], EMBER_C[2]);
        if (i >= 0) { P.kind[i] = K_EMBER; P.drag[i] = 3.5; P.grav[i] = 50 * U; }
      }
      r.smoke += dt;
      if (r.smoke > 0.07) { r.smoke = 0; Smoke.add(r.x, r.y, rand(-3, 3) * U, rand(-2, 2) * U, rand(2.2, 3.4), 5 * U, 9 * U, 0.05, 0.5, 0.35, 0.18); }
      const hs = 3.2 * U * Math.pow(r.power, 0.3);
      P.extra(r.x, r.y, vx * 0.02, vy * 0.02, hs, 1.5, 1.15, 0.8, 1);
      if (r.t >= 1) { rockets.splice(k, 1); explode(r); }
    }
    // combo: se termina en silencio, sin castigo
    if (combo > 0 && Timers.time - lastBurst > COMBO_WINDOW) { combo = 0; UI.combo(0, 1); }
    if (mode === "home") {
      ambientIn -= dt;
      if (ambientIn <= 0 && rockets.length < 3) {
        ambientIn = rand(1.5, 3.2);
        launch(VW * rand(0.15, 0.85), VH * rand(0.12, 0.42), pick(TYPE_ORDER.slice(0, 6)), rand(0.75, 1.05), { auto: true });
      }
    }
    if (finale) updateFinale(dt);
    if (playing && Timers.time > playing.end) { playing = null; UI.showState(); }
  }

  function explode(r) {
    const T = TYPES[r.type], pan = panOf(r.tx);
    const o = { power: r.power, pal: r.pal, flair: 0, colors: r.opts.colors };
    if (scoring() && !r.opts.auto && !r.opts.finale && !r.opts.replay) o.flair = onBurst(r);
    const res = T.burst(r.tx, r.ty, o, pan);
    flash(r.tx, r.ty, res.light, r.power);
    Lights.add(r.tx, r.ty, res.light, 1.0 * Math.pow(r.power, 0.6), res.R * 2.4, 3.0);
    Lights.flash(res.light, 0.05 * r.power);
    Smoke.burst(r.tx, r.ty, res.R * 0.75, res.light, r.power);
    T.sound(r.power, pan);
    Haptics.burst(r.power);
    if (r.opts.onBurst) r.opts.onBurst(r);
  }

  /* ---------- Sparks, combos, descubrimientos ---------- */
  function onBurst(r) {
    const now = Timers.time;
    const before = combo;
    combo = now - lastBurst <= COMBO_WINDOW ? combo + 1 : 1;
    lastBurst = now;
    const mult = multFor(combo);
    const base = r.opts.chain ? 1 : r.power >= FULL_POWER - 0.05 ? 3 : r.power > 1.25 ? 2 : 1;
    let gain = base * mult;
    const step = COMBO_STEPS.indexOf(combo);
    if (step >= 0) {
      gain += combo;
      Lights.flash(pick(r.pal.colors), 0.22);
      Sound.mallet(440 * Math.pow(2, ([0, 2, 4, 7, 9, 12, 14][step] - 7) / 12), 0.05, 0.22, panOf(r.tx));
      UI.comboStep(combo, multFor(combo));
    }
    addSparks(gain, r.tx, r.ty);
    if (combo > Save.stats.bestCombo) Save.stats.bestCombo = combo;
    if (combo > bestThis) bestThis = combo;
    Goals.event("combo", combo);
    Save.stats.bursts++;
    Save.stats.byType[r.type] = (Save.stats.byType[r.type] || 0) + 1;
    Goals.event("burst", r.type);
    if (!Save.discovered.includes(r.type) && TYPE_ORDER.includes(r.type)) {
      Save.discovered.push(r.type);
      Timers.after(0.6, () => {
        addSparks(25);
        UI.toast(t("newFirework"), TYPES[r.type].name[LANG] + "  +25", r.type);
        Sound.melody([62, 66, 69], 0.11, 0.26);
        Haptics.success();
      });
    }
    const was = Save.finale;
    Save.finale = Math.min(1, Save.finale + (1 / 55) * (r.power > 1.3 ? 1.6 : 1) * (r.opts.chain ? 0.6 : 1));
    if (was < 1 && Save.finale >= 1) { UI.finaleReady(); Sound.melody([57, 62], 0.14, 0.2); }
    UI.combo(combo, mult);
    UI.finaleBar();
    persist();
    return flairFor(before + 1);
  }
  function addSparks(n, x, y) {
    Save.sparks += n; Save.stats.earned += n;
    UI.sparks();
    if (x !== undefined) UI.floater(x, y, n);
    persist();
  }
  function spend(n) {
    if (Save.sparks < n) return false;
    Save.sparks -= n; UI.sparks(); persist(); return true;
  }

  /* ---------- Gran Final ---------- */
  function startFinale() {
    if (mode !== "free" || finale || Save.finale < 1) return false;
    Save.finale = 0; persist();
    const pal = { colors: [...new Set([...PALETTES.classic.colors, ...palette().colors])], metal: C.gold, heart: palette().heart };
    const ev = [], L = (at, x, y, type, power = 1) => ev.push({ at, x: x * VW, y: y * VH, type, power });
    // 1. Apertura: pares simétricos
    for (let i = 0; i < 6; i++) { const y = rand(0.24, 0.4), ty = i % 2 ? "ring" : "classic"; L(0.3 + i * 0.75, 0.26, y, ty, 0.85); L(0.36 + i * 0.75, 0.74, y, ty, 0.85); }
    // 2. Abanicos de cinco
    for (let v = 0; v < 5; v++) for (let j = 0; j < 5; j++) L(5.4 + v * 0.95 + j * 0.07, 0.14 + 0.18 * j, 0.3 + 0.07 * Math.abs(j - 2), v % 2 ? "willow" : "double", 0.66);
    // 3. Crescendo: todas las formas y colores
    for (let k = 0; k < 26; k++) L(10.3 + k * 0.21, rand(0.12, 0.88), rand(0.16, 0.46), pick(["crackle", "comet", "spiral", "classic", "ring"]), rand(0.7, 1.1));
    L(13.2, 0.5, 0.3, "heart", 1.3);
    // 4. Muro: ráfaga rápida de explosiones pequeñas
    for (let k = 0; k < 30; k++) L(16 + k * 0.1, 0.1 + 0.8 * ((k * 0.381) % 1), rand(0.2, 0.44), pick(["classic", "crackle", "ring"]), 0.55);
    // 5. Un respiro… y el gran cierre
    L(19.9, 0.5, 0.26, "grand", 2.4); L(19.96, 0.2, 0.34, "willow", 1.5); L(20.02, 0.8, 0.34, "willow", 1.5);
    finale = { t: 0, ev: ev.sort((a, b) => a.at - b.at), i: 0, pal, end: 27.5 };
    combo = 0; UI.combo(0, 1);
    UI.finaleState(true);
    Sound.melody([50, 57, 62], 0.2, 0.22);
    Goals.event("finale");
    return true;
  }
  function updateFinale(dt) {
    const f = finale;
    f.t += dt;
    while (f.i < f.ev.length && f.ev[f.i].at <= f.t) {
      const e = f.ev[f.i++];
      const r = launch(e.x, e.y, e.type, e.power, { finale: true, pal: f.pal });
      if (e.type === "grand") r.opts.onBurst = () => { Lights.flash([1, 0.85, 0.6], 1.3); Haptics.burst(3); };
    }
    if (f.t >= f.end) {
      finale = null;
      Save.stats.finales++;
      const reward = Math.min(300, 150 + 25 * (Save.stats.finales - 1));
      addSparks(reward);
      UI.finaleState(false);
      UI.toast(t("finaleDone"), `${t("grandFinale")}  +${reward}`, "finale");
      Sound.melody([50, 57, 62, 66, 69], 0.16, 0.28);
      Haptics.success();
    }
  }

  /* ---------- Show Creator ---------- */
  function startRec() { stopShow(); rec = { t0: Timers.time, events: [] }; UI.showState(); }
  function stopRec() {
    if (!rec) return;
    const r = rec; rec = null;
    if (r.events.length) {
      Save.shows[Save.showSlot] = { events: r.events, dur: +(Timers.time - r.t0).toFixed(2) };
      persist(true);
      UI.toast(t("showSaved"), `${t("slot")} ${Save.showSlot + 1} · ${r.events.length} ${t("launches")}`, "show");
    }
    UI.showState();
  }
  function playShow() {
    const s = Save.shows[Save.showSlot];
    if (!s) return;
    stopRec(); stopShow();
    s.events.forEach((e) => Timers.after(e.t + 0.3, () => launch(e.x * VW, e.y * VH, e.type, e.power, { replay: true }), "show"));
    playing = { end: Timers.time + s.dur + 3 };
    UI.showState();
  }
  function stopShow() { Timers.cancel("show"); playing = null; UI.showState(); }

  /* ---------- Modo ---------- */
  function setMode(m) {
    if (rec) stopRec();
    if (playing) stopShow();
    if (finale && m !== "free") { finale = null; UI.finaleState(false); }
    mode = m; combo = 0; bestThis = 0;
    ambientIn = 0.6;
    UI.combo(0, 1);
  }

  // Intro: un cohete en el centro; al explotar aparece el título
  function intro(onBurst) {
    launch(VW / 2, VH * 0.33, "willow", 1.25, { auto: true, onBurst, pal: PALETTES.classic });
    Timers.after(1.55, () => {
      launch(VW * 0.24, VH * 0.24, "ring", 0.7, { auto: true, colors: [C.silver, C.gold] });
      launch(VW * 0.76, VH * 0.25, "ring", 0.7, { auto: true, colors: [C.silver, C.gold] });
    });
  }

  // Al tocar: respuesta inmediata en el dedo (un brillito suave)
  function touchFX(x, y) {
    const i = P.add(x, y, 0, 0, 0.35, 12 * U, 0.5, 0.42, 0.32);
    if (i >= 0) { P.kind[i] = K_FLASH; P.drag[i] = 0; P.grav[i] = 0; P.flags[i] = F_NOWIND; }
    for (let k = 0; k < 6; k++) {
      const a = rand(TAU), s = rand(18, 40) * U;
      const j = P.add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.55), 1.3 * U, 0.9, 0.75, 0.5);
      if (j >= 0) { P.kind[j] = K_DUST; P.drag[j] = 4; P.grav[j] = 10 * U; }
    }
  }
  // Mientras se carga: chispitas que convergen hacia el dedo
  function chargeFX(x, y, c, dt) {
    const pal = palette(), col = pal.colors[0];
    let n = dt * (30 + 90 * c);
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n--;
      const a = rand(TAU), d = (34 + 30 * c) * U, life = rand(0.3, 0.45);
      const j = P.add(x + Math.cos(a) * d, y + Math.sin(a) * d, -Math.cos(a) * d / life * 1.35, -Math.sin(a) * d / life * 1.35, life, (1.1 + c) * U,
        lerp(1, col[0], 0.5), lerp(0.9, col[1], 0.5), lerp(0.7, col[2], 0.5));
      if (j >= 0) { P.kind[j] = K_DUST; P.drag[j] = 2.5; P.grav[j] = 0; P.flags[j] = F_NOWIND; }
    }
  }

  return {
    launch, chain, update, startFinale, spend, addSparks, setMode, intro, touchFX, chargeFX, chooseType,
    startRec, stopRec, playShow, stopShow,
    get mode() { return mode; }, get combo() { return combo; }, get finale() { return !!finale; },
    get recording() { return rec; }, get playing() { return !!playing; }, get rockets() { return rockets.length; },
  };
})();

/* ---------- Retos: pequeños, variados y sin presión ---------- */
const Goals = (() => {
  const KINDS = {
    type: {
      make() { const ty = pick(TYPE_ORDER.filter((k) => Save.unlocked.types.includes(k))), n = randi(4, 8); return { ty, n, reward: 40 + n * 5 }; },
      text: (g) => (LANG ? `Lanza ${g.n} ${TYPES[g.ty].name[1]}` : `Launch ${g.n} ${TYPES[g.ty].name[0]}`),
      on: (g, ev, v) => ev === "burst" && v === g.ty && 1,
      icon: (g) => g.ty,
    },
    combo: {
      make() { const n = pick([8, 12, 16, 24]); return { n, reward: 40 + n * 3 }; },
      text: (g) => (LANG ? `Llega a un combo de ${g.n}` : `Reach a ${g.n} combo`),
      on: (g, ev, v) => ev === "combo" && { set: v },
      icon: () => "classic",
    },
    charged: {
      make() { const n = randi(2, 4); return { n, reward: 45 + n * 10 }; },
      text: (g) => (LANG ? `Lanza ${g.n} cohetes a toda potencia` : `Launch ${g.n} full-power rockets`),
      on: (g, ev) => ev === "charged" && 1,
      icon: () => "ring",
    },
    chain: {
      make() { const n = randi(2, 4); return { n, reward: 40 + n * 10 }; },
      text: (g) => (LANG ? `Desliza ${g.n} cadenas en el cielo` : `Swipe ${g.n} chains across the sky`),
      on: (g, ev) => ev === "chain" && 1,
      icon: () => "comet",
    },
    bursts: {
      make() { const n = pick([30, 50, 80]); return { n, reward: 30 + n }; },
      text: (g) => (LANG ? `Ilumina el cielo ${g.n} veces` : `Light up the sky ${g.n} times`),
      on: (g, ev) => ev === "burst" && 1,
      icon: () => "willow",
    },
    finale: {
      make() { return { n: 1, reward: 90 }; },
      text: () => (LANG ? "Lanza una Gran Final" : "Start a Grand Finale"),
      on: (g, ev) => ev === "finale" && 1,
      icon: () => "double",
    },
  };
  function make(exclude) {
    const kinds = Object.keys(KINDS).filter((k) => !exclude.includes(k));
    const k = pick(kinds);
    return { k, p: 0, ...KINDS[k].make() };
  }
  function ensure() {
    if (!Array.isArray(Save.goals) || Save.goals.length !== 3 || Save.goals.some((g) => !g || !KINDS[g.k])) {
      Save.goals = [];
      for (let i = 0; i < 3; i++) Save.goals.push(make(Save.goals.map((g) => g.k)));
    }
  }
  function event(ev, v) {
    if (Game.mode !== "free") return;
    ensure();
    Save.goals.forEach((g, i) => {
      if (g.done) return;
      const r = KINDS[g.k].on(g, ev, v);
      if (!r) return;
      if (r.set !== undefined) g.p = Math.max(g.p, r.set); else g.p += r;
      if (g.p >= g.n) {
        g.p = g.n; g.done = true;
        Save.stats.goals++;
        Timers.after(0.9, () => {
          Game.addSparks(g.reward);
          UI.toast(t("goalDone"), `${KINDS[g.k].text(g)}  +${g.reward}`, KINDS[g.k].icon(g));
          Sound.melody([57, 62, 66, 69], 0.11, 0.26);
          Haptics.success();
        });
        Timers.after(2.2, () => { Save.goals[i] = make(Save.goals.map((x) => x.k)); persist(); UI.goals(); });
      }
    });
    UI.goals();
  }
  return { ensure, event, text: (g) => KINDS[g.k].text(g), icon: (g) => KINDS[g.k].icon(g) };
})();
