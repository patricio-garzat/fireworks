"use strict";
/* fx.js: motor de partículas (pool fijo con arreglos tipados), humo, luces y temporizadores.
   Las partículas viven empacadas en [0, n): al morir, la última ocupa su lugar (sin basura para el GC). */

let U = 1;              // escala del mundo (1 = iPhone de 390 px de ancho)
let VW = 390, VH = 844; // tamaño de la vista en px CSS
let KILL_Y = 900;       // debajo de esto las partículas se apagan (suelo o superficie del lago)
let WIND = 6;           // brisa: deriva horizontal suave (px/s²)

// Tipos de partícula
const K_STAR = 0, K_EMBER = 1, K_SPARK = 2, K_GLITTER = 3, K_FLASH = 4, K_DUST = 5, K_FLY = 6;
// Banderas
// F_WIGGLE: la dirección se mece (peces en zigzag, linternas que se balancean, tentáculos que ondulan)
// F_GLITTRAIL: su estela es de brillitos plateados que titilan (no de brasas que se enfrían)
const F_CRACKLE = 1, F_FLICKER = 2, F_STROBE = 4, F_SPLIT = 8, F_SHIFT = 16, F_NOWIND = 32, F_WIGGLE = 64, F_GLITTRAIL = 128;

const P = (() => {
  const MAX = 20000;
  const F = () => new Float32Array(MAX);
  const x = F(), y = F(), vx = F(), vy = F(), age = F(), life = F(), drag = F(), grav = F(), size = F();
  const r = F(), g = F(), b = F(), r2 = F(), g2 = F(), b2 = F(), tchg = F(), heat = F(), bright = F();
  const spin = F(), emit = F(), acc = F(), seed = F(), er = F(), eg = F(), eb = F(), elife = F(), ev = F(), egrav = F();
  const wig = F(), wf = F();   // vaivén: amplitud (rad/s) y frecuencia (rad/s)
  const kind = new Uint8Array(MAX), flags = new Uint8Array(MAX);
  const ALL = [x, y, vx, vy, age, life, drag, grav, size, r, g, b, r2, g2, b2, tchg, heat, bright, spin, emit, acc, seed, er, eg, eb, elife, ev, egrav, wig, wf, kind, flags];
  let n = 0, cap = 14000;

  // Instancias extra (cabezas de cohete, brillos del toque): se dibujan solo este cuadro
  const XMAX = 1024, xd = new Float32Array(XMAX * 9);
  let xn = 0;

  function add(px, py, pvx, pvy, plife, psize, cr, cg, cb) {
    if (n >= cap) return -1;
    const i = n++;
    x[i] = px; y[i] = py; vx[i] = pvx; vy[i] = pvy; age[i] = 0; life[i] = plife; size[i] = psize;
    r[i] = r2[i] = cr; g[i] = g2[i] = cg; b[i] = b2[i] = cb;
    drag[i] = 2; grav[i] = 55 * U; tchg[i] = 2; heat[i] = 0; bright[i] = 1; spin[i] = 0;
    emit[i] = 0; acc[i] = 0; seed[i] = Math.random(); kind[i] = K_STAR; flags[i] = 0; ev[i] = 0; wig[i] = 0;
    return i;
  }
  function kill(i) {
    n--;
    if (i !== n) for (let k = 0; k < ALL.length; k++) { const a = ALL[k]; a[i] = a[n]; }
  }
  // Fracción libre del pool: las recetas reducen su cantidad cuando el cielo ya está lleno
  // (con el reemplazo de abajo el total nunca pasa del tope, así que ya no hace falta bajar tanto: mínimo 60%)
  const room = (floor = 0.6) => clamp((cap - n) / cap * 1.5, floor, 1);

  /* Ninguna explosión se queda sin verse: si el pool está lleno (por ejemplo, de las estelas de dos sauces),
     una estrella nueva reemplaza a la partícula prescindible más avanzada en su vida (estela, chispa, brillo, polvo).
     Busca desde donde se quedó, en tramos cortos, para no recorrer todo el pool. */
  let scan = 0;
  function evict() {
    if (!n) return false;
    let best = -1, bestT = 0.2;
    for (let k = 0, lim = Math.min(n, 600); k < lim; k++) {
      scan = (scan + 1) % n;
      const kd = kind[scan];
      if (kd === K_STAR || kd === K_FLASH) continue;
      const t = age[scan] / life[scan];
      if (t > bestT) { best = scan; bestT = t; if (t > 0.6) break; }
    }
    if (best < 0) return false;
    kill(best);
    return true;
  }
  // add() que se asegura un lugar (para las estrellas de una explosión)
  function addSure(px, py, pvx, pvy, plife, psize, cr, cg, cb) {
    const i = add(px, py, pvx, pvy, plife, psize, cr, cg, cb);
    return i >= 0 || !evict() ? i : add(px, py, pvx, pvy, plife, psize, cr, cg, cb);
  }

  function setTrail(i, rate, cr, cg, cb, lifeSec, gEmb = 26) { emit[i] = rate; er[i] = cr; eg[i] = cg; eb[i] = cb; elife[i] = lifeSec; egrav[i] = gEmb * U; }

  // Chispa de estela: sale de la estrella casi quieta y cuelga en el aire
  function spawnEmber(i, fade) {
    const j = add(x[i] + rand(-0.6, 0.6), y[i] + rand(-0.6, 0.6), vx[i] * 0.06 + rand(-5, 5) * U, vy[i] * 0.06 + rand(-3, 7) * U,
      elife[i] * rand(0.7, 1.2), size[i] * rand(0.38, 0.58), er[i] * fade, eg[i] * fade, eb[i] * fade);
    if (j < 0) return;
    kind[j] = flags[i] & F_GLITTRAIL ? K_GLITTER : K_EMBER; drag[j] = 3.4; grav[j] = egrav[i]; seed[j] = Math.random();
  }

  // Microexplosión al final de una estrella crepitante
  function crackleBurst(i) {
    const m = 7 + ((Math.random() * 7) | 0), sp = rand(45, 85) * U;
    for (let k = 0; k < m; k++) {
      const a = rand(TAU), s = sp * rand(0.2, 1.1);
      const j = add(x[i] + rand(-2, 2), y[i] + rand(-2, 2), vx[i] * 0.15 + Math.cos(a) * s, vy[i] * 0.15 + Math.sin(a) * s, rand(0.05, 0.22), rand(0.8, 1.3) * U, 1.2, 1.02, 0.78);
      if (j < 0) return;
      kind[j] = K_SPARK; drag[j] = 7; grav[j] = 30 * U; heat[j] = 1;
    }
  }
  // Una estrella que se divide en dos o tres
  function split(i) {
    const m = 2 + (Math.random() < 0.4 ? 1 : 0), sp = Math.hypot(vx[i], vy[i]) * 0.5 + 25 * U;
    for (let k = 0; k < m; k++) {
      const a = Math.atan2(vy[i], vx[i]) + (k - (m - 1) / 2) * 0.7 + rand(-0.2, 0.2);
      const j = add(x[i], y[i], Math.cos(a) * sp, Math.sin(a) * sp, rand(0.7, 1.1), size[i] * 0.8, r2[i], g2[i], b2[i]);  // dentro de update(): sin desalojar (no mover índices a media vuelta)
      if (j < 0) return;
      drag[j] = 2.4; grav[j] = grav[i]; flags[j] = F_FLICKER; heat[j] = 0.6;
      if (emit[i] > 0) setTrail(j, emit[i] * 0.6, er[i], eg[i], eb[i], elife[i] * 0.8, egrav[i] / U);
    }
  }

  function update(dt) {
    const wind = WIND * dt, fill = n / cap, emitK = fill < 0.6 ? 1 : fill > 0.9 ? 0 : 1 - (fill - 0.6) / 0.3;
    for (let i = 0; i < n;) {
      const a = age[i] + dt;
      if (a >= life[i]) {
        const f = flags[i];
        if (f & F_CRACKLE) crackleBurst(i);
        kill(i);
        continue;
      }
      age[i] = a;
      const k = 1 / (1 + drag[i] * dt);
      let ux = vx[i] * k, uy = vy[i] * k + grav[i] * dt;
      if (spin[i] !== 0) {
        const s = spin[i] * dt, c = Math.cos(s), sn = Math.sin(s), tx = ux * c - uy * sn;
        uy = ux * sn + uy * c; ux = tx;
      }
      if (flags[i] & F_WIGGLE) {
        const s = wig[i] * Math.sin(a * wf[i] + seed[i] * 50) * dt, c = Math.cos(s), sn = Math.sin(s), tx = ux * c - uy * sn;
        uy = ux * sn + uy * c; ux = tx;
      }
      // luciérnagas: flotan dando vueltas suaves, sin caer
      if (kind[i] === K_FLY) {
        ux += Math.sin(a * 0.9 + seed[i] * 40) * 16 * U * dt;
        uy += Math.cos(a * 0.7 + seed[i] * 25) * 12 * U * dt;
      }
      if (!(flags[i] & F_NOWIND)) ux += wind * (kind[i] === K_EMBER ? 1.6 : 1);
      vx[i] = ux; vy[i] = uy;
      x[i] += ux * dt; y[i] += uy * dt;
      if (y[i] > KILL_Y) { kill(i); continue; }
      if (emit[i] > 0) {
        const t = a / life[i];
        if (t < 0.92) {
          acc[i] += emit[i] * dt * (t > 0.7 ? 1 - (t - 0.7) / 0.22 : 1) * emitK;
          while (acc[i] >= 1) { acc[i] -= 1; spawnEmber(i, 1 - t * 0.5); }
        }
      }
      if ((flags[i] & F_SPLIT) && a > ev[i]) { split(i); kill(i); continue; }
      i++;
    }
  }

  // Llena el búfer de instancias: x, y, sx, sy (media estela), radio, r, g, b, calor
  function write(out, scale, time) {
    let o = 0;
    const lim = Math.min(n, (out.length / 9) | 0);
    for (let i = 0; i < lim; i++) {
      const t = age[i] / life[i], kd = kind[i];
      let br = bright[i], sz = size[i], ht = 0, cr = r[i], cg = g[i], cb = b[i], ex = 0.018;
      if (kd === K_STAR) {
        // Encendido rápido, meseta y apagado suave al final
        br *= t < 0.72 ? 1 : 1 - smoothF((t - 0.72) / 0.28);
        if (age[i] < 0.06) br *= 1 + (0.06 - age[i]) * 22;
        ht = heat[i] * Math.exp(-age[i] * 7);
        sz *= 1 - 0.38 * t;
        if (flags[i] & F_SHIFT) {
          const m = smoothF((t - tchg[i] + 0.06) / 0.12);
          cr += (r2[i] - cr) * m; cg += (g2[i] - cg) * m; cb += (b2[i] - cb) * m;
        }
        if ((flags[i] & F_FLICKER) && t > 0.55) br *= 0.55 + 0.45 * Math.sin(age[i] * 46 + seed[i] * 60);
        ex = 0.022;
      } else if (kd === K_EMBER) {
        const f = 1 - t;
        br *= Math.pow(f, 0.9) * (0.78 + 0.22 * Math.sin(age[i] * 31 + seed[i] * 40)) * 1.15;
        // se enfría: hacia ámbar profundo
        cg *= 0.55 + 0.45 * f; cb *= 0.35 + 0.65 * f;
        sz *= 0.6 + 0.4 * f; ex = 0.012;
      } else if (kd === K_SPARK) {
        br *= (1 - t) * (0.6 + 0.4 * Math.sin(age[i] * 90 + seed[i] * 30)); ht = 1; ex = 0.005;
      } else if (kd === K_GLITTER) {
        const ph = (age[i] * 7.5 + seed[i] * 13) % 1;
        br *= (ph < 0.32 ? 1.25 : 0.06) * (t < 0.8 ? 1 : (1 - t) / 0.2);
        ht = 0.7; ex = 0.01;
      } else if (kd === K_FLASH) {
        br *= Math.exp(-age[i] * 13) * (age[i] < 0.025 ? age[i] / 0.025 : 1);
        ht = 0.6; ex = 0;
      } else if (kd === K_DUST) {
        br *= Math.sin(Math.PI * t); ex = 0;
      } else if (kd === K_FLY) {
        // parpadeo lento de luciérnaga: se enciende, brilla un momento y se apaga
        const per = 1.3 + seed[i] * 1.4, pulse = Math.pow(Math.max(0, Math.sin((age[i] * TAU) / per + seed[i] * TAU)), 3);
        br *= (0.14 + 1.1 * pulse) * (t < 0.08 ? t / 0.08 : t > 0.85 ? (1 - t) / 0.15 : 1);
        ht = 0.35 * pulse; ex = 0.004;
      }
      if (br <= 0.004) continue;
      out[o++] = x[i] * scale; out[o++] = y[i] * scale;
      out[o++] = vx[i] * ex * scale; out[o++] = vy[i] * ex * scale;
      out[o++] = sz * scale; out[o++] = cr * br; out[o++] = cg * br; out[o++] = cb * br; out[o++] = ht;
    }
    for (let k = 0; k < xn * 9 && o < out.length; k += 9) {
      out[o++] = xd[k] * scale; out[o++] = xd[k + 1] * scale; out[o++] = xd[k + 2] * scale; out[o++] = xd[k + 3] * scale;
      out[o++] = xd[k + 4] * scale; out[o++] = xd[k + 5]; out[o++] = xd[k + 6]; out[o++] = xd[k + 7]; out[o++] = xd[k + 8];
    }
    xn = 0;
    return o / 9;
  }
  function extra(px, py, sx, sy, sz, cr, cg, cb, ht) {
    if (xn >= XMAX) return;
    const k = xn++ * 9;
    xd[k] = px; xd[k + 1] = py; xd[k + 2] = sx; xd[k + 3] = sy; xd[k + 4] = sz; xd[k + 5] = cr; xd[k + 6] = cg; xd[k + 7] = cb; xd[k + 8] = ht;
  }
  function clear() { n = 0; xn = 0; }

  return {
    add, addSure, evict, room, setTrail, update, write, extra, clear,
    x, y, vx, vy, drag, grav, size, life, r2, g2, b2, tchg, heat, bright, spin, kind, flags, ev, seed, wig, wf,
    get n() { return n; },
    get cap() { return cap; }, set cap(v) { cap = Math.min(MAX, v); },
    MAX,
  };
})();
function smoothF(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

/* ---------- Humo: nubecitas grandes, muy tenues, iluminadas por las explosiones ---------- */
const Smoke = (() => {
  const MAX = 420, S = 12;
  const d = new Float32Array(MAX * S); // x y vx vy age life size grow rot vr alpha variant
  const tint = new Float32Array(MAX * 3);
  let n = 0;
  function add(px, py, pvx, pvy, plife, psize, grow, alpha, tr, tg, tb) {
    if (n >= MAX) return;
    const k = n * S;
    d[k] = px; d[k + 1] = py; d[k + 2] = pvx; d[k + 3] = pvy; d[k + 4] = 0; d[k + 5] = plife; d[k + 6] = psize; d[k + 7] = grow;
    d[k + 8] = rand(TAU); d[k + 9] = rand(-0.25, 0.25); d[k + 10] = alpha; d[k + 11] = (Math.random() * 4) | 0;
    tint[n * 3] = tr; tint[n * 3 + 1] = tg; tint[n * 3 + 2] = tb;
    n++;
  }
  function burst(px, py, radius, c, power) {
    const m = Math.round((7 + 5 * power) * (Q.level >= 1 ? 1 : 0.6));
    for (let i = 0; i < m; i++) {
      const a = rand(TAU), rr = radius * Math.sqrt(Math.random()) * 0.8;
      add(px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.8, Math.cos(a) * 6 * U, Math.sin(a) * 4 * U - 3 * U,
        rand(5, 9), radius * rand(0.35, 0.6), radius * rand(0.05, 0.1), rand(0.05, 0.1) * Math.min(1.4, power), c[0], c[1], c[2]);
    }
  }
  function update(dt) {
    for (let i = 0; i < n;) {
      const k = i * S;
      d[k + 4] += dt;
      if (d[k + 4] >= d[k + 5]) {
        n--;
        if (i !== n) { d.copyWithin(k, n * S, n * S + S); tint.copyWithin(i * 3, n * 3, n * 3 + 3); }
        continue;
      }
      const f = 1 / (1 + 0.5 * dt);
      d[k + 2] = d[k + 2] * f + WIND * 0.35 * dt; d[k + 3] = d[k + 3] * f - 1.5 * U * dt;
      d[k] += d[k + 2] * dt; d[k + 1] += d[k + 3] * dt;
      d[k + 6] += d[k + 7] * dt; d[k + 8] += d[k + 9] * dt;
      i++;
    }
  }
  // x y size rot | r g b a | variant
  function write(out, scale) {
    let o = 0;
    for (let i = 0; i < n; i++) {
      const k = i * S, t = d[k + 4] / d[k + 5];
      let a = d[k + 10] * Math.min(1, t * 6) * (1 - t) * (1 - t);
      if (a < 0.002) continue;
      const px = d[k], py = d[k + 1];
      // Luz: la de su explosión (se apaga rápido) más la de las explosiones cercanas
      let lr = 0, lg = 0, lb = 0;
      const own = Math.exp(-d[k + 4] * 2.2) * 0.9;
      lr += tint[i * 3] * own; lg += tint[i * 3 + 1] * own; lb += tint[i * 3 + 2] * own;
      for (const L of Lights.list) {
        const dx = px - L.x, dy = py - L.y, f = L.i / (1 + (dx * dx + dy * dy) / (L.rad * L.rad) * 2);
        lr += L.r * f; lg += L.g * f; lb += L.b * f;
      }
      out[o++] = px * scale; out[o++] = py * scale; out[o++] = d[k + 6] * scale; out[o++] = d[k + 8];
      out[o++] = 0.10 + lr * 0.55; out[o++] = 0.115 + lg * 0.55; out[o++] = 0.15 + lb * 0.55; out[o++] = a;
      out[o++] = d[k + 11];
    }
    return o / 9;
  }
  return { add, burst, update, write, clear() { n = 0; }, get n() { return n; } };
})();

/* ---------- Luces: cada explosión ilumina el cielo, el humo y el paisaje ---------- */
const Lights = (() => {
  const list = [];
  let flash = [0, 0, 0];
  return {
    list,
    add(x, y, c, i, rad, decay = 3.2) { list.push({ x, y, r: c[0], g: c[1], b: c[2], i, rad, decay }); if (list.length > 24) list.shift(); },
    flash(c, i) { const k = reduceMotion ? 0.45 : 1; flash[0] += c[0] * i * k; flash[1] += c[1] * i * k; flash[2] += c[2] * i * k; },
    get sky() { return flash; },
    update(dt) {
      for (let k = list.length - 1; k >= 0; k--) { const L = list[k]; L.i *= Math.exp(-L.decay * dt); if (L.i < 0.01) list.splice(k, 1); }
      const f = Math.exp(-2.6 * dt); flash[0] *= f; flash[1] *= f; flash[2] *= f;
    },
    // Las 8 más intensas, para el shader
    top(out4, out3, scale) {
      const s = list.slice().sort((a, b) => b.i * b.rad - a.i * a.rad);
      for (let k = 0; k < 8; k++) {
        const L = s[k];
        if (L) { out4[k * 4] = L.x * scale; out4[k * 4 + 1] = L.y * scale; out4[k * 4 + 2] = L.rad * scale; out4[k * 4 + 3] = L.i; out3[k * 3] = L.r; out3[k * 3 + 1] = L.g; out3[k * 3 + 2] = L.b; }
        else { out4[k * 4 + 3] = 0; }
      }
    },
    clear() { list.length = 0; flash = [0, 0, 0]; },
  };
})();

/* ---------- Temporizadores en tiempo de juego (se pausan con la pestaña oculta) ---------- */
const Timers = (() => {
  let list = [], time = 0;
  return {
    after(sec, fn, tag) { list.push({ at: time + sec, fn, tag }); },
    update(dt) {
      time += dt;
      if (!list.length) return;
      const due = list.filter((e) => e.at <= time);
      if (!due.length) return;
      list = list.filter((e) => e.at > time);
      due.sort((a, b) => a.at - b.at).forEach((e) => e.fn());
    },
    cancel(tag) { list = list.filter((e) => e.tag !== tag); },
    get time() { return time; },
  };
})();
