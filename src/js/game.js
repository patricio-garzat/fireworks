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
    const T = TYPES[type], spiral = T.flight === "spiral";
    const dur = (0.85 + 0.55 * dist) * (opts.chain ? 0.8 : 1) * (power > 1.4 ? 1.1 : 1) * (spiral ? 1.05 : 1);
    // espiral cerrada y rápida: muchas vueltas chiquitas
    const turns = spiral ? rand(8.5, 10.5) * (opts.chain ? 0.6 : 1) : 0;
    // Cada cohete trae su propia cola, como los de verdad: chispas doradas, brillos plateados, crepitante o casi invisible
    const tr = Math.random(), tail = spiral ? "spiral" : opts.chain ? "gold" : tr < 0.5 ? "gold" : tr < 0.7 ? "glitter" : tr < 0.85 ? "crackle" : "dim";
    const r = {
      x0, y0: ly, tx, ty, x: x0, y: ly, t: 0, dur, type, power, opts, acc: 0, smoke: 0, seed: rand(100), tail, pop: 0,
      arc: spiral ? 0 : rand(-1, 1) * 12 * U * (opts.chain ? 0.3 : 1),
      turns, sph: rand(TAU), sdir: chance(0.5) ? 1 : -1, srad: (opts.chain ? 5 : 8 + 2 * power) * U, z: 0,
      pal: opts.pal || palette(), whistle: Sound.rise(dur, panOf(x0), panOf(tx), T.rise, { power, chain: !!opts.chain, spin: turns / dur }),
    };
    rockets.push(r);
    // Ignición: un destello pequeño abajo
    const iy = Math.min(ly, VH - 2);
    for (let k = 0; k < 10; k++) {
      const i = P.add(x0 + rand(-3, 3), iy, rand(-45, 45) * U, -rand(50, 170) * U, rand(0.18, 0.45), rand(1.4, 2) * U, 1.2, 0.85, 0.5);
      if (i >= 0) { P.kind[i] = K_SPARK; P.drag[i] = 4; P.grav[i] = 120 * U; }
    }
    Lights.add(x0, iy, C.gold, 0.35, 90 * U, 9);
    // el humo del disparo, que se queda flotando abajo
    if (!opts.chain) for (let k = 0; k < 3; k++) Smoke.add(x0 + rand(-5, 5) * U, iy - rand(2, 8) * U, rand(-9, 9) * U, -rand(5, 14) * U, rand(2.6, 4), 7 * U, 22 * U, 0.08, 0.5, 0.35, 0.18);
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
      // subida balística (frena al llegar arriba), con un arco suave y un temblor que se calma
      r.x = lerp(r.x0, r.tx, u) + Math.sin(Math.PI * t) * r.arc + Math.sin(t * 17 + r.seed) * 1.3 * U * (1 - t);
      // espiral (sacacorchos): gira a ritmo constante; z dice si la cabeza viene hacia ti (+1) o va por detrás (-1)
      if (r.turns) {
        const a = r.sph + r.sdir * TAU * r.turns * t, rad = r.srad * (0.7 + 0.45 * t) * (1 - 0.3 * t * t);
        r.x += Math.sin(a) * rad;
        r.z = Math.cos(a);
      }
      r.y = lerp(r.y0, r.ty, u);
      const vx = (r.x - px) / Math.max(dt, 1e-3), vy = (r.y - py) / Math.max(dt, 1e-3);
      // Estela según su cola
      const rate = { gold: 1, glitter: 0.55, crackle: 0.75, dim: 0.3, spiral: 1.5 }[r.tail];
      r.acc += dt * (95 + 40 * r.power) * rate * (1 - 0.6 * t) * (Q.level === 0 ? 0.6 : 1);
      while (r.acc >= 1) {
        r.acc -= 1;
        const f = Math.random(), ex = lerp(px, r.x, f) + rand(-1, 1), ey = lerp(py, r.y, f);
        if (r.tail === "spiral") {
          // el rastro de la espiral: chispas que se quedan flotando un momento (más tenues cuando la cabeza va por detrás)
          const k = 0.22 + 0.78 * Math.pow((r.z + 1) / 2, 1.3), silver = Math.random() < 0.35;
          const i = P.add(ex, ey, -vx * 0.04 + rand(-5, 5) * U, -vy * 0.04 + rand(-3, 6) * U, rand(0.8, 1.4), rand(1.3, 1.9) * U * (0.85 + 0.3 * k),
            (silver ? 0.95 : EMBER_C[0]) * k, (silver ? 0.95 : EMBER_C[1]) * k, (silver ? 1.0 : EMBER_C[2]) * k);
          if (i >= 0) { P.kind[i] = K_EMBER; P.drag[i] = 4.5; P.grav[i] = 14 * U; }
        } else if (r.tail === "glitter") {
          const i = P.add(ex, ey, -vx * 0.06 + rand(-10, 10) * U, -vy * 0.06 + rand(-4, 10) * U, rand(0.5, 0.95), rand(1.3, 1.8) * U, 0.95, 0.95, 1.0);
          if (i >= 0) { P.kind[i] = K_GLITTER; P.drag[i] = 3; P.grav[i] = 38 * U; }
        } else {
          const dim = r.tail === "dim" ? 0.55 : 1;
          const i = P.add(ex, ey, -vx * 0.1 + rand(-14, 14) * U, -vy * 0.1 + rand(-8, 12) * U,
            rand(0.3, 0.75) * dim, rand(1.2, 1.9) * U * dim, EMBER_C[0] * dim, EMBER_C[1] * dim, EMBER_C[2] * dim);
          if (i >= 0) { P.kind[i] = K_EMBER; P.drag[i] = 3.5; P.grav[i] = 50 * U; }
        }
      }
      // cola crepitante: de vez en cuando una chispita que revienta
      if (r.tail === "crackle") {
        r.pop += dt * 9 * (1 - 0.5 * t);
        while (r.pop >= 1) {
          r.pop -= 1;
          const i = P.add(r.x + rand(-2, 2), r.y, rand(-12, 12) * U, rand(4, 20) * U, rand(0.15, 0.4), 1.4 * U, 1.1, 0.9, 0.6);
          if (i >= 0) { P.drag[i] = 3; P.grav[i] = 40 * U; P.flags[i] = F_CRACKLE; }
        }
      }
      r.smoke += dt;
      if (r.smoke > 0.07) { r.smoke = 0; Smoke.add(r.x, r.y, rand(-3, 3) * U, rand(-2, 2) * U, rand(2.2, 3.4), 5 * U, 9 * U, 0.05, 0.5, 0.35, 0.18); }
      // la cabeza del cohete titila (la pólvora no quema parejo)
      const fl = 0.8 + 0.25 * Math.sin(Timers.time * 41 + r.seed) * Math.sin(Timers.time * 23 + r.seed * 3) + rand(0, 0.12);
      const dz = r.turns ? 0.75 + 0.35 * r.z : 1;  // en la espiral: más grande y brillante cuando viene hacia ti
      const hs = 3.2 * U * Math.pow(r.power, 0.3) * (r.tail === "dim" ? 0.75 : 1) * (0.9 + 0.2 * fl) * dz;
      P.extra(r.x, r.y, vx * 0.02, vy * 0.02, hs, 1.5 * fl * dz, 1.15 * fl * dz, 0.8 * fl * dz, 1);
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
    const o = { power: r.power, pal: r.pal, flair: 0, colors: r.opts.colors, chain: !!r.opts.chain, pan };
    if (scoring() && !r.opts.auto && !r.opts.finale && !r.opts.replay) o.flair = onBurst(r);
    const res = T.burst(r.tx, r.ty, o, pan);
    flash(r.tx, r.ty, res.light, r.power);
    Lights.add(r.tx, r.ty, res.light, 1.0 * Math.pow(r.power, 0.6), res.R * 2.4, 3.0);
    Lights.flash(res.light, 0.05 * r.power);
    Smoke.burst(r.tx, r.ty, res.R * 0.75, res.light, r.power);
    // el sonido llega un instante después del destello: más tarde mientras más alto (y lejos) explota
    const far = clamp((Scene.launchY - r.ty) / VH, 0, 1);
    Timers.after(0.03 + 0.11 * far, () => T.sound(r.power, pan));
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

  /* ---------- Gran Final ----------
     Cada final se arma al azar con piezas: una apertura, dos movimientos, un clímax y un cierre, con un tema de color.
     Nunca repite la apertura ni el cierre de la anterior: siempre es una sorpresa. Cada pieza agenda sus cohetes
     desde el segundo t con L(segundo, x, y, tipo, potencia) (x, y en fracción de pantalla) y regresa cuánto dura. */
  const ALL_TYPES = ["crackle", "comet", "spiral", "classic", "ring", "palm", "strobe", "crossette", "saturn", "chrysanthemum", "dahlia", "horsetail", "swarm", "whirl"];
  const FIN = {
    open: {
      // pares simétricos
      pairs(L, t) {
        const [a, b] = pick([["classic", "ring"], ["palm", "ring"], ["chrysanthemum", "dahlia"], ["saturn", "classic"]]);
        for (let i = 0; i < 6; i++) { const y = rand(0.24, 0.4), ty = i % 2 ? b : a; L(t + 0.3 + i * 0.75, 0.26, y, ty, 0.85); L(t + 0.36 + i * 0.75, 0.74, y, ty, 0.85); }
        return 5;
      },
      // escalera: de izquierda a derecha subiendo, y de regreso
      stairs(L, t) {
        const ty = pick(["classic", "chrysanthemum", "ring", "strobe"]), back = ty === "ring" ? "classic" : "ring";
        for (let i = 0; i < 7; i++) L(t + 0.3 + i * 0.32, 0.12 + i * 0.127, 0.44 - i * 0.035, ty, 0.75);
        for (let i = 0; i < 7; i++) L(t + 2.9 + i * 0.32, 0.88 - i * 0.127, 0.44 - i * 0.035, back, 0.75);
        return 5.4;
      },
      // protagonista: pocas carcasas grandes, lentas y majestuosas
      hero(L, t) {
        const ty = pick(["dahlia", "saturn", "chrysanthemum"]);
        L(t + 0.4, 0.5, 0.3, ty, 1.5); L(t + 2.0, 0.28, 0.34, ty, 1.1); L(t + 2.1, 0.72, 0.34, ty, 1.1);
        L(t + 3.8, 0.5, 0.24, pick(["star", "heart"]), 1.4);
        return 5.6;
      },
      // obertura de silbidos en espiral
      whistles(L, t) {
        for (let i = 0; i < 5; i++) L(t + 0.3 + i * 0.55, 0.2 + 0.15 * i, rand(0.26, 0.36), "whirl", 0.9);
        L(t + 3.6, 0.5, 0.26, "willow", 1.3);
        return 5.4;
      },
    },
    mid: {
      fans(L, t) {
        const pair = pick([["willow", "double"], ["palm", "crackle"], ["horsetail", "chrysanthemum"]]);
        for (let v = 0; v < 4; v++) for (let j = 0; j < 5; j++) L(t + v * 0.95 + j * 0.07, 0.14 + 0.18 * j, 0.3 + 0.07 * Math.abs(j - 2), pair[v % 2], 0.66);
        return 4.2;
      },
      // olas que cruzan el cielo, ida y vuelta
      waves(L, t) {
        for (let w = 0; w < 2; w++) for (let k = 0; k < 12; k++) {
          const x = w % 2 ? 0.92 - k * 0.075 : 0.08 + k * 0.075;
          L(t + w * 1.9 + k * 0.13, x, 0.32 + Math.sin(k * 0.75) * 0.1, w ? "strobe" : "classic", 0.55);
        }
        return 4.3;
      },
      // cascadas en espejo que se juntan al centro
      mirror(L, t) {
        const ty = pick(["willow", "horsetail", "palm"]);
        for (let k = 0; k < 4; k++) { L(t + k * 0.6, 0.1 + k * 0.1, 0.3 + 0.03 * k, ty, 0.9); L(t + k * 0.6 + 0.04, 0.9 - k * 0.1, 0.3 + 0.03 * k, ty, 0.9); }
        L(t + 2.6, 0.5, 0.28, "whirl", 1.1);
        return 4.4;
      },
      // desfile de formas
      shapes(L, t) {
        const sh = ["heart", "star", "saturn", "ring", "star", "heart"].sort(() => Math.random() - 0.5);
        for (let k = 0; k < 6; k++) L(t + k * 0.6, 0.2 + (k % 3) * 0.3, k < 3 ? 0.28 : 0.4, sh[k], 0.9);
        return 4.4;
      },
      // fuego cruzado: crucetas y estrobos en X
      crossfire(L, t) {
        for (let k = 0; k < 8; k++) { const f = k / 7; L(t + k * 0.22, 0.1 + 0.8 * f, 0.22 + 0.22 * f, "crossette", 0.7); L(t + k * 0.22 + 0.11, 0.9 - 0.8 * f, 0.22 + 0.22 * f, "strobe", 0.6); }
        return 3.2;
      },
      // cometas y palmeras desde los lados
      comets(L, t) {
        for (let k = 0; k < 6; k++) L(t + k * 0.35, k % 2 ? 0.85 : 0.15, rand(0.24, 0.38), k % 2 ? "comet" : "palm", 0.85);
        L(t + 2.3, 0.5, 0.3, "swarm", 1);
        return 4;
      },
      // baile de espirales
      spirals(L, t) {
        for (let k = 0; k < 6; k++) L(t + k * 0.4, rand(0.15, 0.85), rand(0.22, 0.4), k % 2 ? "spiral" : "whirl", 0.85);
        return 3.6;
      },
    },
    climax: {
      // crescendo que se acelera, con todas las formas
      crescendo(L, t) {
        let at = t;
        for (let k = 0; k < 26; k++) { L(at, rand(0.12, 0.88), rand(0.16, 0.46), pick(ALL_TYPES), rand(0.7, 1.1)); at += lerp(0.32, 0.1, k / 25); }
        L(at + 0.3, 0.5, 0.3, pick(["heart", "star", "triple"]), 1.3);
        return at - t + 1.6;
      },
      wall(L, t) {
        for (let k = 0; k < 32; k++) L(t + k * 0.09, 0.1 + 0.8 * ((k * 0.381) % 1), rand(0.2, 0.44), pick(["classic", "crackle", "ring"]), 0.55);
        return 4.2;
      },
      // muro doble: una fila arriba y otra abajo, en sentidos contrarios
      doubleWall(L, t) {
        for (let k = 0; k < 18; k++) { L(t + k * 0.13, 0.08 + (0.84 * k) / 17, 0.22, "crackle", 0.5); L(t + k * 0.13 + 0.06, 0.92 - (0.84 * k) / 17, 0.42, "classic", 0.5); }
        return 3.8;
      },
      // pirámide que crece hacia abajo
      pyramid(L, t) {
        const rows = [[0.5], [0.38, 0.62], [0.26, 0.5, 0.74], [0.14, 0.38, 0.62, 0.86]];
        rows.forEach((r, i) => r.forEach((x, j) => L(t + i * 0.55 + j * 0.05, x, 0.2 + i * 0.07, pick(["dahlia", "chrysanthemum", "classic"]), 0.8)));
        return 3.6;
      },
    },
    close: {
      grand(L, t) { L(t, 0.5, 0.26, "grand", 2.4); L(t + 0.06, 0.2, 0.34, "willow", 1.5); L(t + 0.12, 0.8, 0.34, "willow", 1.5); return 0.12; },
      // tres grandes, una tras otra
      triple(L, t) { L(t, 0.25, 0.3, "grand", 1.7); L(t + 0.5, 0.75, 0.3, "grand", 1.7); L(t + 1.1, 0.5, 0.24, "grand", 2.4); return 1.1; },
      // cortina dorada de lado a lado y la grande al final
      curtain(L, t) { for (let k = 0; k < 9; k++) L(t + k * 0.04, 0.06 + (0.88 * k) / 8, 0.3 + 0.04 * Math.sin(k), k % 2 ? "willow" : "whirl", 1.1); L(t + 0.9, 0.5, 0.24, "grand", 2.2); return 0.9; },
      hearts(L, t) { L(t, 0.5, 0.26, "grand", 2.3); L(t + 0.35, 0.22, 0.38, "heart", 1.1); L(t + 0.45, 0.78, 0.38, "heart", 1.1); return 0.45; },
      // un silencio más largo… y una sola, enorme
      hush(L, t) { L(t + 0.9, 0.5, 0.25, "grand", 2.8); return 0.9; },
    },
  };
  const THEMES = [
    () => ({ colors: [...new Set([...PALETTES.classic.colors, ...palette().colors])], metal: C.gold, heart: palette().heart }), // todos los colores
    () => { const p = palette(); return { colors: [...p.colors], metal: p.metal, heart: p.heart }; },                     // la paleta elegida
    () => ({ colors: [C.gold, C.warm, C.amber, C.copper], metal: C.gold, heart: C.coral }),                                 // todo oro
    () => { const p = PALETTES[pick(PALETTE_ORDER)]; return { colors: [...p.colors], metal: p.metal, heart: p.heart }; }, // una paleta al azar
  ];
  function startFinale() {
    if (mode !== "free" || finale || Save.finale < 1) return false;
    Save.finale = 0;
    const ev = [], L = (at, x, y, type, power = 1) => ev.push({ at, x: x * VW, y: y * VH, type, power });
    const last = Save.lastFinale || {};
    const other = (obj, not) => pick(Object.keys(obj).filter((k) => k !== not));
    const o = other(FIN.open, last.o), c = other(FIN.close, last.c), cl = pick(Object.keys(FIN.climax));
    const mids = Object.keys(FIN.mid).sort(() => Math.random() - 0.5).slice(0, 2);
    Save.lastFinale = { o, c };
    persist();
    let t = FIN.open[o](L, 0);
    for (const m of mids) t += FIN.mid[m](L, t) + 0.3;
    t += FIN.climax[cl](L, t);
    t += rand(0.9, 1.6);                       // un respiro antes del cierre
    t += FIN.close[c](L, t);
    const pal = pick(THEMES)();
    finale = { t: 0, ev: ev.sort((a, b) => a.at - b.at), i: 0, pal, end: t + 7.5, plan: [o, ...mids, cl, c] };
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
