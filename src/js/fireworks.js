"use strict";
/* fireworks.js: paletas de color y las recetas de cada fuego artificial.
   Cada receta crea partículas con física propia y regresa el color de su luz. */

// Colores de emisión, inspirados en la química real (estroncio, bario, cobre, sodio, titanio…)
const C = {
  red: [1.0, 0.2, 0.14], green: [0.3, 1.0, 0.42], blue: [0.28, 0.48, 1.0], gold: [1.0, 0.68, 0.26], silver: [0.9, 0.93, 1.0],
  purple: [0.7, 0.36, 1.0], orange: [1.0, 0.46, 0.12], cyan: [0.28, 0.9, 1.0], pink: [1.0, 0.4, 0.66], amber: [1.0, 0.56, 0.16],
  warm: [1.0, 0.86, 0.66], copper: [0.95, 0.42, 0.22], teal: [0.18, 0.95, 0.72], violet: [0.6, 0.4, 1.0], ice: [0.58, 0.8, 1.0],
  white: [1, 1, 1], coral: [1.0, 0.48, 0.38], lilac: [0.84, 0.58, 1.0], rosegold: [1.0, 0.66, 0.52], magenta: [0.95, 0.28, 0.82],
  mint: [0.45, 1.0, 0.68], lime: [0.72, 1.0, 0.32], yellow: [1.0, 0.86, 0.3], pearl: [1.0, 0.95, 0.88],
};

const PALETTES = {
  classic: { cost: 0, name: ["Classic", "Clásica"], colors: [C.red, C.green, C.blue, C.gold, C.silver, C.purple, C.orange, C.cyan], metal: C.gold, heart: C.pink },
  ember: { cost: 250, name: ["Ember", "Brasa"], colors: [C.gold, C.amber, C.orange, C.warm, C.copper], metal: C.gold, heart: C.coral },
  aurora: { cost: 600, name: ["Aurora", "Aurora"], colors: [C.teal, C.green, C.violet, C.ice, C.cyan], metal: C.silver, heart: C.violet },
  glacier: { cost: 900, name: ["Glacier", "Glaciar"], colors: [C.ice, C.white, C.silver, C.cyan, C.blue], metal: C.silver, heart: C.ice },
  rose: { cost: 1100, name: ["Rose", "Rosa"], colors: [C.pink, C.coral, C.lilac, C.white, C.rosegold], metal: C.gold, heart: C.pink },
  royal: { cost: 1500, name: ["Royal", "Real"], colors: [C.purple, C.gold, C.blue, C.magenta], metal: C.gold, heart: C.magenta },
  sunset: { cost: 350, name: ["Sunset", "Atardecer"], colors: [C.orange, C.coral, C.pink, C.magenta, C.amber], metal: C.gold, heart: C.coral },
  jade: { cost: 750, name: ["Jade", "Jade"], colors: [C.teal, C.mint, C.green, C.gold, C.cyan], metal: C.gold, heart: C.mint },
  citrus: { cost: 1300, name: ["Citrus", "Cítricos"], colors: [C.lime, C.yellow, C.orange, C.gold, C.mint], metal: C.gold, heart: C.yellow },
  moonlight: { cost: 1800, name: ["Moonlight", "Luz de luna"], colors: [C.white, C.silver, C.ice, C.pearl, C.lilac], metal: C.silver, heart: C.pearl },
};
const PALETTE_ORDER = ["classic", "ember", "sunset", "aurora", "jade", "glacier", "rose", "citrus", "royal", "moonlight"];

/* ---------- Ayudantes de receta ---------- */
// Una estrella: la unidad básica de una explosión
function star(x, y, vx, vy, life, sz, c, o = {}) {
  const i = P.add(x, y, vx, vy, life, sz, c[0], c[1], c[2]);
  if (i < 0) return -1;
  P.drag[i] = o.drag ?? 2.0;
  P.grav[i] = (o.grav ?? 55) * U;
  P.heat[i] = o.heat ?? 0.9;
  if (o.bright) P.bright[i] = o.bright;
  if (o.trail) P.setTrail(i, o.trail, ...(o.trailC || c), o.trailLife ?? 0.7, o.trailGrav ?? 26);
  let f = o.flags || 0;
  if (o.to) { P.r2[i] = o.to[0]; P.g2[i] = o.to[1]; P.b2[i] = o.to[2]; P.tchg[i] = o.at ?? 0.5; f |= F_SHIFT; }
  if (o.spin) P.spin[i] = o.spin;
  if (o.split) { f |= F_SPLIT; P.ev[i] = o.split; }
  P.flags[i] = f;
  return i;
}
function flash(x, y, c, power) {
  const i = P.add(x, y, 0, 0, 0.4, 30 * U * Math.sqrt(power), c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5);
  if (i >= 0) { P.kind[i] = K_FLASH; P.drag[i] = 0; P.grav[i] = 0; P.flags[i] = F_NOWIND; P.bright[i] = 0.85; }
}
function glitterCrown(x, y, R, n, c = C.silver) {
  for (let k = 0; k < n; k++) {
    const d = sphereDir(), s = R * rand(0.8, 1.15) * 1.6;
    const i = P.add(x, y, d.x * s, d.y * s, rand(2.2, 3.2), rand(1.3, 1.9) * U, c[0], c[1], c[2]);
    if (i < 0) return;
    P.kind[i] = K_GLITTER; P.drag[i] = 1.6; P.grav[i] = 34 * U;
  }
}
function count(base, o) { return Math.max(8, Math.round(base * (0.72 + 0.28 * o.power) * P.room() * (Q.level === 0 ? 0.65 : 1))); }
function radius(o) { return 136 * U * Math.pow(o.power, 0.55); }
function two(pal) { const a = pick(pal.colors); let b = pick(pal.colors), k = 0; while (b === a && k++ < 6) b = pick(pal.colors); return [a, b]; }
function avg(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }

/* Variantes: la misma forma puede terminar distinto cada vez, como en los fuegos de verdad.
   - nada (la estrella se apaga con su parpadeo)
   - crepitante: cada estrella termina en un puñito de chispas que truenan
   - divididas: cada estrella se parte en dos o tres al final
   - cambio de color: a medio camino pasan al segundo color
   - brocado: dejan una estela dorada y larga
   Regresa opciones para star() y el sonido extra que corresponde. */
function variant(o, a, b, life) {
  const r = Math.random();
  if (o.chain) return { opt: {}, sound() {} };
  if (r < 0.34) return { opt: {}, sound() {} };
  if (r < 0.52) return { opt: { flags: F_CRACKLE }, sound(pan) { Sound.crackle(0.9, pan, life * 0.95); } };
  if (r < 0.66) return { opt: { split: life * rand(0.78, 0.86) }, sound(pan) { Sound.crackle(0.4, pan, life * 0.8); } };
  if (r < 0.84) return { opt: { to: b, at: rand(0.4, 0.55) }, sound() {} };
  return { opt: { trail: 14, trailC: C.gold, trailLife: 1.1, trailGrav: 12 }, sound(pan) { Sound.sizzle(2.2, pan, 0.45, 0.4); } };
}
const mergeOpt = (base, v) => { const o = { ...base, ...v }; if (base.flags || v.flags) o.flags = (base.flags || 0) | (v.flags || 0); return o; };

// Extras de los combos: corona de brillos, estrellas que cambian de color, halo de chispas
function flair(x, y, R, o, c) {
  if (o.flair >= 1) glitterCrown(x, y, R * 0.55, Math.round(26 * P.room()));
  if (o.flair >= 3) {
    const m = 46;
    for (let k = 0; k < m; k++) {
      const a = (k / m) * TAU, s = R * 2.6;
      const i = P.add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 0.7), 1.6 * U, 1.1, 1.0, 0.9);
      if (i < 0) break;
      P.kind[i] = K_SPARK; P.drag[i] = 3.4; P.grav[i] = 20 * U;
    }
  }
}

/* ---------- Las recetas ---------- */
const TYPES = {
  // Esfera clásica (peonía) con pistilo de otro color
  classic: {
    cost: 0, name: ["Classic Burst", "Clásico"], desc: ["A full sphere of color.", "Una esfera completa de color."],
    rise: { air: 0.05, whistle: 0 },
    burst(x, y, o) {
      const [a, b] = o.colors || two(o.pal), R = radius(o), n = count(130, o), drag = 2.1;
      const v = variant(o, a, b, 1.8), shift = o.flair >= 2;
      for (let k = 0; k < n; k++) {
        const d = sphereDir(), s = R * drag * rand(0.94, 1.04);
        star(x, y, d.x * s, d.y * s, rand(1.5, 2.1), rand(2.6, 3.4) * U, a, mergeOpt({ drag, trail: 5, trailC: avg(a, C.gold), trailLife: 0.5, to: shift ? b : null, at: rand(0.45, 0.55), flags: F_FLICKER }, v.opt));
      }
      v.sound(o.pan);
      const m = count(36, o);
      for (let k = 0; k < m; k++) {
        const d = sphereDir(), s = R * drag * 0.42 * rand(0.9, 1.05);
        star(x, y, d.x * s, d.y * s, rand(1.0, 1.4), 2.4 * U, b, { drag });
      }
      flair(x, y, R, o, a);
      return { light: avg(a, b), R };
    },
    sound(p, pan) { Sound.boom(p, pan); Sound.sizzle(1.5, pan, 0.35, 0.9); },
  },

  // Sauce dorado: estrellas pesadas que dejan cascadas de chispas colgando
  willow: {
    cost: 0, name: ["Golden Willow", "Sauce dorado"], desc: ["A slow golden cascade.", "Una cascada dorada y lenta."],
    rise: { air: 0.035, whistle: 0.05, f0: 760, f1: 1250 },
    burst(x, y, o) {
      const c = o.pal.metal, R = radius(o) * 0.95, n = count(84, o), drag = 2.7;
      for (let k = 0; k < n; k++) {
        const d = sphereDir(), s = R * drag * rand(0.9, 1.05);
        star(x, y, d.x * s, d.y * s - 10 * U, rand(3.4, 4.4), rand(2.2, 2.8) * U, [c[0] * 0.8, c[1] * 0.7, c[2] * 0.6],
          { drag, grav: 95, heat: 1, trail: 42 * (Q.level === 0 ? 0.55 : 1), trailC: c, trailLife: 2.1, trailGrav: 7, flags: F_FLICKER });
      }
      flair(x, y, R, o, c);
      return { light: c, R };
    },
    sound(p, pan) { Sound.boom(p, pan, { low: 80, body: 1100, crack: 0.6, gain: 0.9 }); Sound.sizzle(4.0, pan, 0.75, 0.2); },
  },

  // Anillo: un círculo nítido, inclinado en 3D al azar
  ring: {
    cost: 0, name: ["Ring", "Anillo"], desc: ["A crisp, perfect circle.", "Un círculo nítido y perfecto."],
    rise: { air: 0.05, whistle: 0 },
    burst(x, y, o) {
      const [a, b] = o.colors || two(o.pal), R = radius(o) * 1.05, drag = 2.0;
      const tilt = rand(0, 1.1), roll = rand(TAU), cr = Math.cos(roll), sr = Math.sin(roll), ct = Math.cos(tilt);
      const n = count(76, o), vr = variant(o, a, b, 1.8);
      for (let k = 0; k < n; k++) {
        const th = (k / n) * TAU, lx = Math.cos(th), ly = Math.sin(th) * ct;
        const dx = lx * cr - ly * sr, dy = lx * sr + ly * cr, s = R * drag * rand(0.985, 1.015);
        star(x, y, dx * s, dy * s, rand(1.7, 1.9), 3.0 * U, a, mergeOpt({ drag, grav: 40, trail: 3, trailLife: 0.4, to: o.flair >= 2 ? b : null }, vr.opt));
      }
      vr.sound(o.pan);
      // centro: un anillito interior del otro color
      const m = count(30, o);
      for (let k = 0; k < m; k++) {
        const th = (k / m) * TAU, lx = Math.cos(th), ly = Math.sin(th) * ct;
        const dx = lx * cr - ly * sr, dy = lx * sr + ly * cr, s = R * drag * 0.38;
        star(x, y, dx * s, dy * s, 1.3, 2.4 * U, b, { drag, grav: 40 });
      }
      flair(x, y, R, o, a);
      return { light: avg(a, b), R };
    },
    sound(p, pan) { Sound.boom(p, pan, { body: 1700, crack: 1.1 }); Sound.sizzle(1.2, pan, 0.25, 1.0); },
  },

  // Crisantemo: como la peonía, pero cada estrella deja una estela fina y larga: un "pompón" que florece
  chrysanthemum: {
    cost: 550, name: ["Chrysanthemum", "Crisantemo"], desc: ["Fine trails that bloom like a flower.", "Estelas finas que florecen."],
    rise: { air: 0.05, whistle: 0 },
    burst(x, y, o) {
      const [a, b] = o.colors || two(o.pal), R = radius(o), n = count(110, o), drag = 2.2, v = variant(o, a, b, 1.9);
      for (let k = 0; k < n; k++) {
        const d = sphereDir(), s = R * drag * rand(0.95, 1.04);
        star(x, y, d.x * s, d.y * s, rand(1.7, 2.1), 2.4 * U, a, mergeOpt({ drag, grav: 45, heat: 1, trail: 26 * (Q.level === 0 ? 0.6 : 1), trailC: avg(a, C.warm), trailLife: 0.75, trailGrav: 20, to: o.flair >= 2 ? b : null, at: 0.6 }, v.opt));
      }
      v.sound(o.pan);
      flair(x, y, R, o, a);
      return { light: a, R };
    },
    sound(p, pan) { Sound.boom(p, pan, { body: 1450 }); Sound.sizzle(1.9, pan, 0.4, 0.5); },
  },

  // Dalia: pocas estrellas grandes y muy brillantes, sin estela: pétalos gruesos
  dahlia: {
    cost: 700, name: ["Dahlia", "Dalia"], desc: ["Big, bold petals of light.", "Pétalos de luz grandes."],
    rise: { air: 0.055, whistle: 0 },
    burst(x, y, o) {
      const [a, b] = o.colors || two(o.pal), R = radius(o) * 1.08, m = Math.round(34 + 8 * o.power), drag = 1.9;
      for (let k = 0; k < m; k++) {
        const d = sphereDir(), s = R * drag * rand(0.92, 1.05);
        star(x, y, d.x * s, d.y * s, rand(1.9, 2.3), rand(4.6, 5.4) * U, k % 3 ? a : b, { drag, grav: 50, heat: 1.1, bright: 1.25, flags: F_FLICKER });
      }
      flair(x, y, R, o, a);
      return { light: avg(a, b), R };
    },
    sound(p, pan) { Sound.boom(p * 1.1, pan, { low: 84, body: 1300, crack: 1.1 }); },
  },

  // Cola de caballo: las estrellas salen hacia arriba y caen todas juntas, como una cascada que se abre
  horsetail: {
    cost: 1000, name: ["Horsetail", "Cola de caballo"], desc: ["A cascade that pours down.", "Una cascada que se derrama."],
    rise: { air: 0.06, whistle: 0 },
    burst(x, y, o) {
      const c = chance(0.6) ? o.pal.metal : pick(o.pal.colors), R = radius(o) * 0.7, n = count(70, o);
      for (let k = 0; k < n; k++) {
        const th = -Math.PI / 2 + rand(-0.9, 0.9), s = R * rand(1.2, 2.2);
        star(x, y, Math.cos(th) * s, Math.sin(th) * s, rand(2.6, 3.4), 2.2 * U, c,
          { drag: 1.3, grav: 140, heat: 1, trail: 30 * (Q.level === 0 ? 0.6 : 1), trailC: c, trailLife: 1.2, trailGrav: 30, flags: F_FLICKER });
      }
      flair(x, y, R, o, c);
      return { light: c, R: R * 1.3 };
    },
    sound(p, pan) { Sound.boom(p, pan, { low: 80, body: 1150, crack: 0.7 }); Sound.sizzle(3.2, pan, 0.6, 0.3); },
  },

  // Enjambre: chispas que giran cada una a su ritmo, como abejas que se dispersan zumbando
  swarm: {
    cost: 1300, name: ["Swarm", "Enjambre"], desc: ["Sparks that whirl in every direction.", "Chispas que giran hacia todos lados."],
    rise: { air: 0.05, whistle: 0.035, f0: 780, f1: 1200, wobble: true },
    burst(x, y, o) {
      const [a, b] = o.colors || two(o.pal), R = radius(o) * 0.75, m = Math.round(26 + 8 * o.power);
      for (let k = 0; k < m; k++) {
        const d = sphereDir(), s = R * 1.9 * rand(0.6, 1.1);
        star(x, y, d.x * s, d.y * s, rand(1.4, 2.0), 2.2 * U, k % 2 ? a : C.silver,
          { drag: 1.6, grav: 25, heat: 1, spin: (chance(0.5) ? 1 : -1) * rand(4, 8), trail: 22, trailC: k % 2 ? avg(a, C.gold) : C.silver, trailLife: 0.45, trailGrav: 8 });
      }
      flair(x, y, R, o, a);
      return { light: avg(a, C.silver), R };
    },
    sound(p, pan) { Sound.boom(p * 0.8, pan, { crack: 0.6 }); Sound.sizzle(2.0, pan, 0.6, 0.15); Sound.crackle(0.6, pan, 0.5); },
  },

  // Triple: tres estallidos seguidos, cada uno más grande y de otro color
  triple: {
    cost: 1550, name: ["Triple Break", "Triple"], desc: ["Three bursts, each one bigger.", "Tres estallidos, cada vez más grandes."],
    rise: { air: 0.06, whistle: 0.04, f0: 760, f1: 1220 },
    burst(x, y, o, pan) {
      const cols = [pick(o.pal.colors), pick(o.pal.colors), o.pal.metal], R = radius(o);
      const one = (i) => {
        const c = cols[i], f = [0.5, 0.8, 1.1][i], n = count([50, 80, 110][i], o), yy = y - i * 8 * U;
        for (let k = 0; k < n; k++) {
          const d = sphereDir(), s = R * f * 2.1 * rand(0.94, 1.04);
          star(x, yy, d.x * s, d.y * s, rand(1.0, 1.4) + i * 0.4, (2.4 + i * 0.3) * U, c, { drag: 2.1, trail: 4 + i * 4, trailC: avg(c, C.gold), trailLife: 0.5, flags: F_FLICKER });
        }
        if (i > 0) {
          flash(x, yy, c, o.power * (0.6 + i * 0.2));
          Lights.add(x, yy, c, 0.8 * Math.pow(o.power, 0.6), 220 * U, 3.4);
          Sound.boom(o.power * (0.7 + i * 0.25), pan, { crack: 0.9 });
          Haptics.burst(o.power * (0.6 + i * 0.25));
        }
      };
      one(0);
      Timers.after(0.38, () => one(1));
      Timers.after(0.82, () => { one(2); Sound.sizzle(1.6, pan, 0.4, 0.6); });
      return { light: cols[0], R: R * 0.6 };
    },
    sound(p, pan) { Sound.boom(p * 0.6, pan, { low: 100 }); },
  },

  // Doble: una explosión y, medio segundo después, otra más grande de otro color
  double: {
    cost: 150, name: ["Double Burst", "Doble"], desc: ["Two bursts, one after the other.", "Dos explosiones, una tras otra."],
    rise: { air: 0.05, whistle: 0.035, f0: 820, f1: 1300 },
    burst(x, y, o, pan) {
      const [a, b] = o.colors || two(o.pal), R = radius(o), drag = 2.2;
      const n1 = count(70, o);
      for (let k = 0; k < n1; k++) {
        const d = sphereDir(), s = R * 0.6 * drag * rand(0.93, 1.04);
        star(x, y, d.x * s, d.y * s, rand(0.9, 1.2), 2.6 * U, a, { drag, flags: F_FLICKER });
      }
      Timers.after(0.48, () => {
        const n2 = count(110, o), y2 = y - 6 * U;
        for (let k = 0; k < n2; k++) {
          const d = sphereDir(), s = R * 1.15 * drag * rand(0.95, 1.04);
          star(x, y2, d.x * s, d.y * s, rand(1.6, 2.2), 3.0 * U, b, { drag, trail: 6, trailC: avg(b, C.gold), trailLife: 0.5, flags: F_FLICKER, to: o.flair >= 2 ? a : null, at: 0.6 });
        }
        flash(x, y2, b, o.power * 0.8);
        Lights.add(x, y2, b, 0.9 * Math.pow(o.power, 0.6), 260 * U, 3.4);
        Sound.boom(o.power * 1.1, pan, { crack: 1.2 });
        Sound.sizzle(1.6, pan, 0.35, 0.8);
        Haptics.burst(o.power);
        flair(x, y2, R * 1.1, o, b);
      });
      return { light: a, R };
    },
    sound(p, pan) { Sound.boom(p * 0.75, pan, { low: 100 }); },
  },

  // Crepitante: estrellas doradas que terminan en cientos de chispitas que truenan
  crackle: {
    cost: 300, name: ["Crackling", "Crepitante"], desc: ["Hundreds of crackling sparks.", "Cientos de chispitas que truenan."],
    rise: { air: 0.06, whistle: 0 },
    burst(x, y, o) {
      const c = o.pal.metal, R = radius(o) * 0.85, n = count(78, o), drag = 2.3;
      for (let k = 0; k < n; k++) {
        const d = sphereDir(), s = R * drag * rand(0.85, 1.05);
        star(x, y, d.x * s, d.y * s, rand(0.85, 1.3), 2.3 * U, [c[0], c[1] * 0.95, c[2] * 0.85], { drag, heat: 1, trail: 12, trailC: c, trailLife: 0.45, flags: F_CRACKLE });
      }
      flair(x, y, R, o, c);
      return { light: C.warm, R };
    },
    sound(p, pan) { Sound.boom(p, pan, { crack: 0.8 }); Sound.crackle(1.2 + p * 0.4, pan, 0.78); },
  },

  // Palmera: pocas hojas gruesas y doradas que salen en abanico hacia arriba y se curvan al caer
  palm: {
    cost: 400, name: ["Palm", "Palmera"], desc: ["Thick golden fronds that arc and fall.", "Hojas doradas que se arquean y caen."],
    rise: { air: 0.07, whistle: 0 },
    burst(x, y, o) {
      const c = chance(0.6) ? o.pal.metal : pick(o.pal.colors), R = radius(o) * 1.05, m = Math.round(7 + 2 * o.power), drag = 1.5;
      const rot = rand(-0.2, 0.2);
      for (let k = 0; k < m; k++) {
        const th = -Math.PI / 2 + rot + ((k + 0.5) / m - 0.5) * 4.6 + rand(-0.08, 0.08), s = R * drag * rand(0.85, 1.05);
        star(x, y, Math.cos(th) * s, Math.sin(th) * s - 25 * U, rand(1.6, 2.1), 4.2 * U, [c[0] * 1.1, c[1] * 1.05, c[2]],
          { drag, grav: 110, heat: 1, trail: 70 * (Q.level === 0 ? 0.6 : 1), trailC: c, trailLife: 1.3, trailGrav: 18 });
      }
      glitterCrown(x, y, R * 0.3, Math.round(24 * P.room()), C.warm);
      flair(x, y, R, o, c);
      return { light: c, R };
    },
    sound(p, pan) { Sound.boom(p, pan, { low: 82, body: 1250, crack: 0.9 }); Sound.sizzle(2.4, pan, 0.6, 0.25); },
  },

  // Estrobo: un estallido corto de color y una nube de destellos que parpadean mientras caen despacio
  strobe: {
    cost: 650, name: ["Strobe", "Estrobo"], desc: ["A cloud of blinking flashes.", "Una nube de destellos que parpadean."],
    rise: { air: 0.05, whistle: 0 },
    burst(x, y, o) {
      const [a] = o.colors || two(o.pal), R = radius(o) * 0.9, n = count(60, o), drag = 2.2;
      for (let k = 0; k < n; k++) {
        const d = sphereDir(), s = R * drag * rand(0.9, 1.04);
        star(x, y, d.x * s, d.y * s, rand(0.6, 0.85), 2.6 * U, a, { drag, trail: 4, trailLife: 0.35 });
      }
      const g = o.pal.metal === C.silver || chance(0.5) ? C.silver : C.warm;
      const m = Math.round(150 * P.room() * (Q.level === 0 ? 0.6 : 1));
      for (let k = 0; k < m; k++) {
        const d = sphereDir(), s = R * drag * rand(0.55, 1.0);
        const i = P.add(x, y, d.x * s, d.y * s, rand(2.4, 3.4), rand(1.6, 2.2) * U, g[0], g[1], g[2]);
        if (i < 0) break;
        P.kind[i] = K_GLITTER; P.drag[i] = drag * 1.05; P.grav[i] = 22 * U;
      }
      flair(x, y, R, o, a);
      return { light: avg(a, g), R };
    },
    sound(p, pan) { Sound.boom(p, pan, { crack: 0.7 }); Sound.sizzle(2.8, pan, 0.55, 0.4); },
  },

  // Silbido en espiral: sube como sacacorchos, cerrado y rápido, silbando bajito. Al abrirse es un sauce dorado
  // denso cuyas puntas, al ir cayendo, se vuelven brillitos que titilan (lluvia de oro que brilla al final).
  whirl: {
    cost: 450, name: ["Whistling Spiral", "Silbido en espiral"], desc: ["Spins up whistling, then a glittering golden willow.", "Sube girando y silbando; cae como sauce que brilla."],
    flight: "spiral",
    rise: { air: 0.03, whistle: 0.024, f0: 900, f1: 1380, tone: true },
    burst(x, y, o, pan) {
      const c = o.pal.metal, R = radius(o) * 0.95, drag = 2.6, g = 88 * U, T0 = rand(1.5, 1.8);
      const gl = c === C.silver ? C.silver : C.warm, sparkle = [];
      const layer = (n, f, life, size) => {
        for (let k = 0; k < n; k++) {
          const d = sphereDir(), s = R * drag * f * rand(0.9, 1.05), vx = d.x * s, vy = d.y * s - 10 * U;
          star(x, y, vx, vy, life * rand(0.9, 1.1), size * U, [c[0] * 0.85, c[1] * 0.75, c[2] * 0.62],
            { drag, grav: 88, heat: 1, trail: 50 * (Q.level === 0 ? 0.55 : 1), trailC: c, trailLife: 2.4, trailGrav: 6, flags: F_FLICKER });
          if (k % 2 === 0) sparkle.push([vx, vy]);
        }
      };
      layer(count(84, o), 1, 4.2, 2.6);
      layer(count(36, o), 0.6, 3.6, 2.2);
      // donde va cada punta al cabo de T0 (misma física que star: frenado + gravedad), ahí nacen los brillitos
      Timers.after(T0, () => {
        const e = Math.exp(-drag * T0), vt = g / drag;
        for (const [vx, vy] of sparkle) {
          const px = x + (vx / drag) * (1 - e), py = y + ((vy - vt) / drag) * (1 - e) + vt * T0;
          const i = P.add(px, py, vx * e, vt + (vy - vt) * e, rand(1.4, 2.2), rand(1.5, 2.1) * U, gl[0], gl[1], gl[2]);
          if (i < 0) break;
          P.kind[i] = K_GLITTER; P.drag[i] = drag; P.grav[i] = g;
        }
        Sound.crackle(0.45, pan, 0);
      });
      glitterCrown(x, y, R * 0.3, Math.round(20 * P.room()), gl);
      flair(x, y, R, o, c);
      return { light: c, R };
    },
    sound(p, pan) { Sound.boom(p, pan, { low: 78, body: 1100, crack: 0.5, gain: 0.95 }); Sound.sizzle(4.6, pan, 0.8, 0.2); },
  },

  // Espiral: brazos que giran mientras se abren
  spiral: {
    cost: 500, name: ["Spiral", "Espiral"], desc: ["Stars that swirl as they open.", "Estrellas que giran al abrirse."],
    rise: { air: 0.04, whistle: 0.05, f0: 700, f1: 1150, wobble: true },
    burst(x, y, o) {
      const [a, b] = o.colors || two(o.pal), R = radius(o) * 0.85, arms = 6, per = Math.round(count(16, o)), drag = 1.9;
      const dirSpin = chance(0.5) ? 1 : -1, rot0 = rand(TAU);
      for (let arm = 0; arm < arms; arm++) {
        const c = arm % 2 ? a : b;
        for (let k = 0; k < per; k++) {
          const f = (k + 1) / per, th = rot0 + (arm / arms) * TAU - f * 1.7 * dirSpin, s = R * drag * (0.2 + 0.9 * f);
          star(x, y, Math.cos(th) * s, Math.sin(th) * s, rand(1.6, 2.0), (2.2 + f) * U, c,
            { drag, grav: 30, spin: dirSpin * 2.2, trail: 10, trailC: avg(c, C.gold), trailLife: 0.7 });
        }
      }
      flair(x, y, R, o, a);
      return { light: avg(a, b), R };
    },
    sound(p, pan) { Sound.boom(p, pan, { body: 1300 }); Sound.sizzle(2.0, pan, 0.5, 0.3); },
  },

  // Cometa: pocas estrellas grandes con estelas largas y brillantes que se dividen al final
  comet: {
    cost: 800, name: ["Comet", "Cometa"], desc: ["Long, brilliant tails.", "Estelas largas y brillantes."],
    rise: { air: 0.08, whistle: 0 },
    burst(x, y, o) {
      const c = chance(0.5) ? o.pal.metal : pick(o.pal.colors), R = radius(o) * 1.25, m = Math.round(9 + 3 * o.power), drag = 1.25;
      const rot = rand(TAU);
      for (let k = 0; k < m; k++) {
        const th = rot + (k / m) * TAU + rand(-0.12, 0.12), s = R * drag * rand(0.9, 1.1);
        star(x, y, Math.cos(th) * s, Math.sin(th) * s * 0.9 - 20 * U, rand(1.8, 2.3), 4.6 * U, [c[0] * 1.2, c[1] * 1.2, c[2] * 1.2],
          { drag, grav: 70, heat: 1, trail: 60 * (Q.level === 0 ? 0.6 : 1), trailC: C.gold, trailLife: 0.9, split: rand(1.4, 1.7) });
      }
      flair(x, y, R, o, c);
      return { light: c, R };
    },
    sound(p, pan) { Sound.boom(p, pan, { low: 84, body: 1200 }); Sound.crackle(0.5, pan, 0.5); Sound.sizzle(2.3, pan, 0.6, 0.15); },
  },

  // Cruceta: estrellas que viajan y de pronto se parten en cruz, con un "crack" cada una
  crossette: {
    cost: 950, name: ["Crossette", "Cruceta"], desc: ["Stars that split into crosses.", "Estrellas que se parten en cruz."],
    rise: { air: 0.06, whistle: 0 },
    burst(x, y, o, pan) {
      const [a, b] = o.colors || two(o.pal), R = radius(o) * 0.8, m = Math.round(10 + 3 * o.power), drag = 1.8, g = 50 * U;
      const T0 = rand(0.5, 0.62), rot = rand(TAU), pts = [];
      for (let k = 0; k < m; k++) {
        const th = rot + (k / m) * TAU + rand(-0.15, 0.15), s = R * drag * rand(0.9, 1.05), vx = Math.cos(th) * s, vy = Math.sin(th) * s;
        star(x, y, vx, vy, T0, 3.4 * U, a, { drag, grav: 50, trail: 14, trailC: avg(a, C.gold), trailLife: 0.45 });
        // dónde estará al partirse (la misma física: frenado + gravedad)
        const e = Math.exp(-drag * T0);
        pts.push([x + (vx / drag) * (1 - e), y + ((vy - g / drag) / drag) * (1 - e) + (g * T0) / drag, Math.atan2(vy, vx)]);
      }
      Timers.after(T0, () => {
        const s2 = 95 * U * Math.pow(o.power, 0.4);
        for (const [px, py, ang] of pts) {
          for (let q = 0; q < 4; q++) {
            const th = ang + Math.PI / 4 + (q * Math.PI) / 2;
            star(px, py, Math.cos(th) * s2, Math.sin(th) * s2, rand(0.7, 0.95), 2.4 * U, b,
              { drag: 2.2, grav: 45, trail: 6, trailC: avg(b, C.gold), trailLife: 0.35, flags: F_FLICKER });
          }
        }
        Sound.crackle(0.6, pan, 0);
      });
      flair(x, y, R, o, a);
      return { light: avg(a, b), R };
    },
    sound(p, pan) { Sound.boom(p, pan, { body: 1400, crack: 1 }); },
  },

  // Corazón: las estrellas salen con la forma, y como todas frenan igual, la forma se conserva
  heart: {
    cost: 1200, name: ["Heart", "Corazón"], desc: ["A burst shaped like a heart.", "Una explosión con forma de corazón."],
    rise: { air: 0.035, whistle: 0.045, f0: 720, f1: 1100 },
    burst(x, y, o) {
      const c = o.pal.heart, R = radius(o) * 0.068, n = count(96, o), drag = 2.0;
      const tilt = rand(-0.2, 0.2), ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let k = 0; k < n; k++) {
        const th = (k / n) * TAU;
        const hx = 16 * Math.pow(Math.sin(th), 3), hy = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th));
        const dx = hx * ct - hy * st, dy = hx * st + hy * ct - 2.6;
        star(x, y, dx * R * drag, dy * R * drag, rand(1.9, 2.2), 2.9 * U, c, { drag, grav: 18, trail: 3, trailLife: 0.5, to: o.flair >= 2 ? C.white : null, at: 0.7 });
      }
      // un corazón de brillos dentro
      const m = count(30, o);
      for (let k = 0; k < m; k++) {
        const th = (k / m) * TAU, hx = 16 * Math.pow(Math.sin(th), 3), hy = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th));
        const i = P.add(x, y, (hx * ct - hy * st) * R * drag * 0.5, (hx * st + hy * ct - 2.6) * R * drag * 0.5, rand(1.8, 2.3), 1.6 * U, 1, 0.9, 0.95);
        if (i >= 0) { P.kind[i] = K_GLITTER; P.drag[i] = drag; P.grav[i] = 18 * U; }
      }
      flair(x, y, R * 16, o, c);
      return { light: c, R: R * 16 };
    },
    sound(p, pan) { Sound.boom(p, pan, { low: 86, body: 1200, crack: 0.5 }); Sound.sizzle(1.8, pan, 0.4, 0.7); },
  },

  // Saturno: un planeta compacto con su anillo ancho e inclinado, de otro color
  saturn: {
    cost: 1400, name: ["Saturn", "Saturno"], desc: ["A planet with its ring.", "Un planeta con su anillo."],
    rise: { air: 0.05, whistle: 0.04, f0: 740, f1: 1180 },
    burst(x, y, o) {
      const [a, b] = o.colors || two(o.pal), R = radius(o), drag = 2.1;
      const n = count(90, o);
      for (let k = 0; k < n; k++) {
        const d = sphereDir(), s = R * drag * 0.5 * rand(0.95, 1.03);
        star(x, y, d.x * s, d.y * s, rand(1.5, 1.9), 2.6 * U, a, { drag, grav: 35, trail: 3, trailLife: 0.4, flags: F_FLICKER });
      }
      const tilt = rand(1.0, 1.25), roll = rand(-0.45, 0.45), cr = Math.cos(roll), sr = Math.sin(roll), ct = Math.cos(tilt);
      const m = count(90, o);
      for (let k = 0; k < m; k++) {
        const th = (k / m) * TAU, lx = Math.cos(th), ly = Math.sin(th) * ct;
        const dx = lx * cr - ly * sr, dy = lx * sr + ly * cr, s = R * drag * 1.1 * rand(0.985, 1.015);
        star(x, y, dx * s, dy * s, rand(1.7, 2.0), 2.4 * U, b, { drag, grav: 35, trail: 4, trailC: avg(b, C.gold), trailLife: 0.45, to: o.flair >= 2 ? C.white : null, at: 0.7 });
      }
      flair(x, y, R, o, a);
      return { light: avg(a, b), R: R * 1.1 };
    },
    sound(p, pan) { Sound.boom(p, pan, { body: 1450, crack: 1 }); Sound.sizzle(1.6, pan, 0.35, 0.8); },
  },

  // Estrella: cinco picos, con una estrellita de brillos dentro (como el corazón, la forma se conserva al frenar)
  star: {
    cost: 1700, name: ["Star", "Estrella"], desc: ["A five-pointed star.", "Una estrella de cinco picos."],
    rise: { air: 0.04, whistle: 0.045, f0: 700, f1: 1120 },
    burst(x, y, o) {
      const [a, b] = o.colors || two(o.pal), R = radius(o) * 1.05, n = count(110, o), drag = 2.0;
      const rot = -Math.PI / 2 + rand(-0.25, 0.25);
      const at = (u) => {
        const i = Math.floor(u) % 10, f = u - Math.floor(u), j = (i + 1) % 10;
        const ri = i % 2 ? 0.42 : 1, rj = j % 2 ? 0.42 : 1, ai = rot + (i * Math.PI) / 5, aj = rot + (j * Math.PI) / 5;
        return [lerp(Math.cos(ai) * ri, Math.cos(aj) * rj, f), lerp(Math.sin(ai) * ri, Math.sin(aj) * rj, f)];
      };
      for (let k = 0; k < n; k++) {
        const [dx, dy] = at((k / n) * 10);
        star(x, y, dx * R * drag, dy * R * drag, rand(1.9, 2.2), 2.8 * U, a, { drag, grav: 18, trail: 3, trailLife: 0.5, to: o.flair >= 2 ? C.white : null, at: 0.7 });
      }
      const m = count(36, o);
      for (let k = 0; k < m; k++) {
        const [dx, dy] = at((k / m) * 10);
        const i = P.add(x, y, dx * R * drag * 0.45, dy * R * drag * 0.45, rand(1.8, 2.3), 1.6 * U, b[0] * 0.5 + 0.5, b[1] * 0.5 + 0.5, b[2] * 0.5 + 0.5);
        if (i >= 0) { P.kind[i] = K_GLITTER; P.drag[i] = drag; P.grav[i] = 18 * U; }
      }
      flair(x, y, R, o, a);
      return { light: a, R };
    },
    sound(p, pan) { Sound.boom(p, pan, { low: 86, body: 1250, crack: 0.6 }); Sound.sizzle(1.8, pan, 0.4, 0.7); },
  },

  // El gran cierre de la Gran Final (no se elige: es la recompensa)
  grand: {
    cost: -1, name: ["Grand Shell", "Gran carcasa"], desc: ["", ""],
    rise: { air: 0.09, whistle: 0.06, f0: 600, f1: 1000 },
    burst(x, y, o) {
      const g = o.pal.metal, R = radius(o);
      for (let k = 0, n = count(150, o); k < n; k++) {
        const d = sphereDir(), s = R * 2.6 * rand(0.92, 1.05);
        star(x, y, d.x * s, d.y * s, rand(4.2, 5.4), 2.6 * U, [g[0] * 0.8, g[1] * 0.7, g[2] * 0.6], { drag: 2.6, grav: 80, heat: 0.8, trail: 30, trailC: g, trailLife: 2.4, trailGrav: 7, flags: F_FLICKER });
      }
      Timers.after(0.25, () => {
        for (let k = 0, n = count(120, o); k < n; k++) {
          const d = sphereDir(), s = R * 0.55 * 2.2 * rand(0.9, 1.05), c = pick(o.pal.colors);
          star(x, y, d.x * s, d.y * s, rand(1.6, 2.2), 3 * U, c, { drag: 2.2, to: C.white, at: 0.6 });
        }
        glitterCrown(x, y, R * 0.9, Math.round(110 * P.room()), C.silver);
      });
      Timers.after(0.9, () => {
        for (let k = 0, n = count(90, o); k < n; k++) {
          const d = sphereDir(), s = R * 0.9 * 2.3 * rand(0.85, 1.05);
          star(x, y, d.x * s, d.y * s, rand(0.9, 1.3), 2.2 * U, C.warm, { drag: 2.3, heat: 1, flags: F_CRACKLE });
        }
        Sound.crackle(2.2, 0, 0.7);
      });
      return { light: g, R: R * 1.3 };
    },
    sound(p, pan) { Sound.boom(3, pan, { low: 70, body: 1000, gain: 1.15 }); Sound.boom(1.5, -0.4, { crack: 0 }); Sound.sizzle(5.5, pan, 1, 0.3); },
  },
};
const TYPE_ORDER = ["classic", "willow", "ring", "double", "crackle", "palm", "whirl", "spiral", "chrysanthemum", "strobe", "dahlia", "comet", "crossette", "horsetail", "heart", "swarm", "saturn", "triple", "star"];

// Íconos de línea (SVG, sin emojis), uno por tipo
const ICON = {
  mix: '<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/><path d="M12 9.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" fill="currentColor"/><circle cx="6" cy="6" r=".9" fill="currentColor"/><circle cx="18" cy="18" r=".9" fill="currentColor"/>',
  classic: '<circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  willow: '<circle cx="12" cy="6" r="1.4" fill="currentColor"/><path d="M12 7.5c-3 1-6 4-6.5 11M12 7.5c3 1 6 4 6.5 11M12 7.5c-1.4 2-2.6 6-2.6 12M12 7.5c1.4 2 2.6 6 2.6 12"/>',
  ring: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/>',
  double: '<circle cx="9.5" cy="10" r="5"/><circle cx="14.5" cy="14" r="5.5" stroke-dasharray="1.6 2.2"/>',
  crackle: '<path d="M6 6l2 2M8 6L6 8M16 5l2 2M18 5l-2 2M11 11l2 2M13 11l-2 2M5 16l2 2M7 16l-2 2M16 15.5l2 2M18 15.5l-2 2"/>',
  spiral: '<path d="M12 12c0-1.2 1.6-1.6 2.4-.6 1.2 1.4.2 3.6-1.8 3.8-2.6.3-4.4-2.2-3.8-4.6.8-3.2 4.6-4.4 7.4-2.8 3.4 2 3.6 6.6 1 9.4"/>',
  comet: '<circle cx="17" cy="7" r="2.2" fill="currentColor"/><path d="M15.2 8.8C11 13 7 15.5 3.5 16.5M14.4 7.6C10.5 9.4 7 10.2 4 10.4M16 10.4c-2 4-4 7-6.5 9"/>',
  heart: '<path d="M12 19.5s-7.5-4.4-7.5-9.6A4 4 0 0 1 12 7.8a4 4 0 0 1 7.5 2.1c0 5.2-7.5 9.6-7.5 9.6z"/>',
  palm: '<path d="M12 21v-9"/><path d="M12 12c-2-3.5-5-4.5-8-4M12 12c2-3.5 5-4.5 8-4M12 12c-.8-3.6-.4-6 0-8M12 12c-3-1.5-6-1-8 1.6M12 12c3-1.5 6-1 8 1.6"/>',
  strobe: '<circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="7" cy="7.5" r="1" fill="currentColor"/><circle cx="17" cy="7" r="1" fill="currentColor"/><circle cx="6.5" cy="16" r="1" fill="currentColor"/><circle cx="17.5" cy="16.5" r="1" fill="currentColor"/><path d="M12 4v1.6M12 18.4V20M4 12h1.6M18.4 12H20"/>',
  crossette: '<circle cx="12" cy="12" r="1.3" fill="currentColor"/><path d="M12 10V7M12 14v3M10 12H7M14 12h3"/><path d="M10.6 3.6l2.8 2.8M13.4 3.6l-2.8 2.8M10.6 17.6l2.8 2.8M13.4 17.6l-2.8 2.8M3.6 10.6l2.8 2.8M6.4 10.6l-2.8 2.8M17.6 10.6l2.8 2.8M20.4 10.6l-2.8 2.8"/>',
  saturn: '<circle cx="12" cy="12" r="4.2"/><ellipse cx="12" cy="12" rx="9.5" ry="3" transform="rotate(-18 12 12)"/>',
  star: '<path d="M12 3.8l2.4 5.1 5.5.6-4.1 3.8 1.1 5.5L12 16l-4.9 2.8 1.1-5.5-4.1-3.8 5.5-.6z"/>',
  whirl: '<path d="M12 21c-2.4-1.2-2.4-2.8 0-4s2.4-2.8 0-4-2.4-2.8 0-4 2.4-2.8 0-4"/><circle cx="12" cy="3.6" r="1.5" fill="currentColor"/><path d="M16.5 6.5c.9.6 1.4 1.4 1.4 2.2M18.8 4.8c1.4.9 2.2 2.2 2.2 3.6" opacity=".7"/>',
  chrysanthemum: '<circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 9.5V3.5M12 14.5v6M9.5 12h-6M14.5 12h6M10.2 10.2L6 6M13.8 13.8L18 18M13.8 10.2L18 6M10.2 13.8L6 18" stroke-dasharray="1.2 1.6"/>',
  dahlia: '<circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="19" r="1.9"/><circle cx="5" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/><circle cx="7" cy="7" r="1.5"/><circle cx="17" cy="17" r="1.5"/><circle cx="17" cy="7" r="1.5"/><circle cx="7" cy="17" r="1.5"/>',
  horsetail: '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><path d="M12 6.5c-1.5 2-2.5 6-2.5 13M12 6.5c1.5 2 2.5 6 2.5 13M12 6.5c-3 1.5-5.5 5-6.5 11M12 6.5c3 1.5 5.5 5 6.5 11"/>',
  swarm: '<path d="M6 7c1.5-1.5 3.5-.5 3 1.2-.4 1.5-2.6 1.4-2.4-.2M15.5 5.5c1.6-.8 3.2.6 2.4 2-.8 1.3-2.7.6-2.2-.8M13 14c1.7-.6 3 1 2 2.3-1 1.2-2.9.2-2.3-1.2M5.5 15.5c1.3-1.2 3.3-.2 2.8 1.4-.5 1.4-2.6 1.2-2.4-.3"/><circle cx="11.5" cy="10.5" r="1" fill="currentColor"/>',
  triple: '<circle cx="7" cy="15" r="2.6"/><circle cx="12" cy="10" r="3.6"/><circle cx="17" cy="6" r="2.2" stroke-dasharray="1.4 1.6"/>',
};
const iconSVG = (k, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.classic}</svg>`;
