"use strict";
/* scenes.js: los escenarios. Cada uno se pinta una vez (al cambiar de tamaño) en dos lienzos:
   - color: cielo, vía láctea, montañas/edificios/agua
   - máscara: R = tierra (0 cielo … 1 lo más cercano), G = agua. El shader la usa para las estrellas y la luz. */

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SCENES = {
  alpine: {
    cost: 0, name: ["Alpine Night", "Noche alpina"],
    sky: ["#03060f", "#071027", "#0f1d3e", "#1d2f55"], launch: 1.02, water: 0,
  },
  lake: {
    cost: 1000, name: ["Still Lake", "Lago en calma"],
    sky: ["#02050d", "#061229", "#0c2142", "#18375a"], launch: 0.735, water: 0.735,
  },
  city: {
    cost: 2000, name: ["City Lights", "Luces de la ciudad"],
    sky: ["#04050f", "#0b0e26", "#1a1838", "#3a2a40"], launch: 1.02, water: 0,
  },
  desert: {
    cost: 1500, name: ["Desert Dunes", "Dunas del desierto"],
    sky: ["#05040e", "#100c27", "#25193b", "#4a2d46"], launch: 1.02, water: 0,
  },
  bay: {
    cost: 2600, name: ["Moonlit Bay", "Bahía de luna"],
    sky: ["#02040c", "#07112a", "#11244b", "#2b4068"], launch: 0.74, water: 0.74,
  },
  snow: {
    cost: 3200, name: ["Snowy Village", "Pueblo nevado"],
    sky: ["#03050d", "#0a1428", "#16264a", "#2c3f62"], launch: 1.02, water: 0,
  },
};
const SCENE_ORDER = ["alpine", "lake", "desert", "city", "bay", "snow"];

const Scene = (() => {
  let id = "alpine";

  // Línea de cresta con desplazamiento de punto medio (montañas creíbles, siempre las mismas por la semilla)
  function ridge(rng, w, n, base, amp, rough) {
    const pts = new Array(n + 1).fill(0);
    let step = n, a = amp;
    pts[0] = rng() * amp - amp / 2; pts[n] = rng() * amp - amp / 2;
    while (step > 1) {
      const half = step >> 1;
      for (let i = half; i < n; i += step) pts[i] = (pts[i - half] + pts[i + half]) / 2 + (rng() * 2 - 1) * a;
      a *= rough; step = half;
    }
    return pts.map((v, i) => [(i / n) * w, base + v]);
  }
  function fillRidge(g, m, pts, h, color, maskV) {
    for (const ctx of [g, m]) {
      ctx.beginPath(); ctx.moveTo(0, h + 2);
      pts.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(pts[pts.length - 1][0], h + 2); ctx.closePath();
      if (ctx === g) {
        const top = Math.min(...pts.map((p) => p[1])), gr = ctx.createLinearGradient(0, top, 0, top + (h - top) * 0.6);
        gr.addColorStop(0, shade(color, 1.18)); gr.addColorStop(1, shade(color, 0.82));
        ctx.fillStyle = gr;
      } else ctx.fillStyle = `rgb(${Math.round(maskV * 255)},0,0)`;
      ctx.fill();
    }
  }
  // Aclara u oscurece un color hex
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.min(255, v * k)));
    return `rgb(${c.join(",")})`;
  }
  // Bruma: sube desde la cresta y sigue hacia abajo (si la montaña baja, no se ve un corte)
  function haze(g, y, h, w, color, alpha) {
    const H = g.canvas.height, gr = g.createLinearGradient(0, y - h, 0, y);
    gr.addColorStop(0, `rgba(${color},0)`); gr.addColorStop(1, `rgba(${color},${alpha})`);
    g.fillStyle = gr; g.fillRect(0, y - h, w, H - (y - h));
  }
  function sky(g, w, h, cols) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, cols[0]); gr.addColorStop(0.35, cols[1]); gr.addColorStop(0.68, cols[2]); gr.addColorStop(0.9, cols[3]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  // Vía láctea: una banda diagonal de polvo de estrellas muy tenue
  function milkyWay(g, w, h, rng, s) {
    g.save();
    g.translate(w * 0.5, h * 0.3); g.rotate(-0.55);
    const L = Math.hypot(w, h);
    for (let i = 0; i < 9; i++) {
      const x = (rng() - 0.5) * L, y = (rng() - 0.5) * 40 * s, r = rand(60, 140) * s;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = rng() < 0.5 ? "120,140,200" : "150,130,190";
      gr.addColorStop(0, `rgba(${c},0.05)`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    const dust = Math.round(L * 3.2);
    for (let i = 0; i < dust; i++) {
      const x = (rng() - 0.5) * L, y = gauss() * 70 * s;
      g.fillStyle = `rgba(210,220,255,${(0.04 + rng() * 0.12).toFixed(3)})`;
      g.fillRect(x, y, s * (0.5 + rng()), s * (0.5 + rng()));
    }
    // una veta oscura en medio, como la de verdad
    g.globalCompositeOperation = "multiply";
    for (let i = 0; i < 6; i++) {
      const x = (rng() - 0.5) * L * 0.8, y = gauss() * 12 * s, r = rand(30, 70) * s;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(120,120,140,0.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    g.restore();
  }
  function pines(g, m, rng, pts, s, color, count) {
    for (let k = 0; k < count; k++) {
      const i = Math.floor(rng() * (pts.length - 1)), [x, y] = pts[i];
      const th = (10 + rng() * 22) * s, tw = th * (0.32 + rng() * 0.1);
      for (const ctx of [g, m]) {
        ctx.fillStyle = ctx === g ? color : "rgb(255,0,0)";
        ctx.beginPath();
        const tiers = 4;
        for (let t = 0; t < tiers; t++) {
          const ty = y + 4 * s - (th * t) / tiers, ww = tw * (1 - t / (tiers + 1));
          ctx.moveTo(x - ww, ty); ctx.lineTo(x, ty - th / tiers * 1.7); ctx.lineTo(x + ww, ty);
        }
        ctx.fill();
        ctx.fillRect(x - 0.8 * s, y - 2 * s, 1.6 * s, 6 * s);
      }
    }
  }

  function paintAlpine(g, m, w, h, s, rng) {
    const S = SCENES.alpine;
    sky(g, w, h, S.sky);
    milkyWay(g, w, h, rng, s);
    const n = 128;
    const far = ridge(rng, w, n, h * 0.7, h * 0.09, 0.55);
    haze(g, h * 0.72, h * 0.12, w, "60,90,150", 0.16);
    fillRidge(g, m, far, h, "#0f1a33", 0.35);
    haze(g, h * 0.8, h * 0.08, w, "40,60,110", 0.18);
    const mid = ridge(rng, w, n, h * 0.8, h * 0.06, 0.52);
    fillRidge(g, m, mid, h, "#0a1226", 0.6);
    haze(g, h * 0.88, h * 0.06, w, "30,45,85", 0.2);
    const near = ridge(rng, w, 64, h * 0.9, h * 0.035, 0.5);
    fillRidge(g, m, near, h, "#04070f", 1);
    pines(g, m, rng, near, s, "#04070f", Math.round(w / s / 9));
  }

  function paintLake(g, m, w, h, s, rng) {
    const S = SCENES.lake, wy = h * S.water;
    sky(g, w, wy + 2, S.sky);
    milkyWay(g, w, wy, rng, s);
    const far = ridge(rng, w, 128, wy - h * 0.07, h * 0.06, 0.55);
    haze(g, wy - h * 0.05, h * 0.1, w, "70,100,150", 0.14);
    fillRidge(g, m, far, wy, "#0d1830", 0.4);
    const mid = ridge(rng, w, 128, wy - h * 0.02, h * 0.025, 0.5);
    fillRidge(g, m, mid, wy, "#070d1d", 0.75);
    pines(g, m, rng, mid.map(([x, y]) => [x, Math.min(y, wy)]), s * 0.55, "#070d1d", Math.round(w / s / 5));
    // agua: degradado y el reflejo de las montañas, más oscuro y movido
    const wg = g.createLinearGradient(0, wy, 0, h);
    wg.addColorStop(0, "#0a1830"); wg.addColorStop(0.25, "#060f22"); wg.addColorStop(1, "#02050c");
    g.fillStyle = wg; g.fillRect(0, wy, w, h - wy);
    m.fillStyle = "rgb(0,255,0)"; m.fillRect(0, wy, w, h - wy);
    g.save();
    g.beginPath(); g.rect(0, wy, w, h - wy); g.clip();
    g.globalAlpha = 0.55;
    for (const [pts, col] of [[far, "#0b1529"], [mid, "#050a17"]]) {
      g.beginPath(); g.moveTo(0, wy);
      pts.forEach(([x, y]) => g.lineTo(x, wy + (wy - y) * 0.9));
      g.lineTo(w, wy); g.closePath(); g.fillStyle = col; g.fill();
    }
    g.globalAlpha = 1;
    // rayitas horizontales del agua
    for (let i = 0; i < 260; i++) {
      const y = wy + Math.pow(rng(), 1.6) * (h - wy), x = rng() * w, l = (8 + rng() * 40) * s * (0.4 + (y - wy) / (h - wy));
      g.fillStyle = `rgba(140,170,220,${(0.02 + rng() * 0.04).toFixed(3)})`;
      g.fillRect(x, y, l, Math.max(1, 0.6 * s));
    }
    g.restore();
    // la orilla: una línea de luz muy tenue
    g.fillStyle = "rgba(120,150,200,0.12)"; g.fillRect(0, wy - 0.5 * s, w, 1 * s);
    // lucecitas cálidas de cabañas a lo lejos (y su reflejo)
    for (let i = 0; i < 5; i++) {
      const x = w * (0.08 + rng() * 0.84), y = wy - (1.5 + rng() * 4) * s;
      g.fillStyle = "rgba(255,196,120,0.75)"; g.fillRect(x, y, 1.6 * s, 1.6 * s);
      const rg = g.createLinearGradient(0, wy, 0, wy + 22 * s);
      rg.addColorStop(0, "rgba(255,190,110,0.22)"); rg.addColorStop(1, "rgba(255,190,110,0)");
      g.fillStyle = rg; g.fillRect(x - 0.3 * s, wy + 1, 2.2 * s, 22 * s);
    }
  }

  function paintCity(g, m, w, h, s, rng) {
    const S = SCENES.city;
    sky(g, w, h, S.sky);
    milkyWay(g, w, h * 0.7, rng, s);
    // resplandor cálido de la ciudad en el horizonte
    const gl = g.createLinearGradient(0, h * 0.6, 0, h * 0.86);
    gl.addColorStop(0, "rgba(255,150,90,0)"); gl.addColorStop(1, "rgba(255,150,90,0.12)");
    g.fillStyle = gl; g.fillRect(0, h * 0.6, w, h * 0.3);
    const layers = [
      { base: 0.84, hmin: 0.03, hmax: 0.1, wmin: 18, wmax: 40, col: "#141832", mask: 0.4, win: 0.18 },
      { base: 0.9, hmin: 0.03, hmax: 0.12, wmin: 22, wmax: 54, col: "#080a18", mask: 0.7, win: 0.32 },
      { base: 0.975, hmin: 0.02, hmax: 0.065, wmin: 30, wmax: 70, col: "#030409", mask: 1, win: 0.5 },
    ];
    for (const L of layers) {
      let x = -rng() * 20 * s;
      while (x < w) {
        const bw = (L.wmin + rng() * (L.wmax - L.wmin)) * s, bh = h * (L.hmin + rng() * (L.hmax - L.hmin));
        const top = h * L.base - bh;
        for (const ctx of [g, m]) {
          ctx.fillStyle = ctx === g ? L.col : `rgb(${Math.round(L.mask * 255)},0,0)`;
          ctx.fillRect(x, top, bw + 1, h - top);
          if (rng() < 0.18) ctx.fillRect(x + bw * 0.45, top - bh * 0.18, Math.max(1, 1.2 * s), bh * 0.18); // antena
        }
        // ventanas: pocas encendidas, cálidas y tenues
        const cw = 4 * s, ch = 5 * s;
        for (let yy = top + 4 * s; yy < h * L.base - 3 * s; yy += ch + 3 * s) {
          for (let xx = x + 3 * s; xx < x + bw - cw; xx += cw + 3 * s) {
            if (rng() < L.win * 0.35) {
              g.fillStyle = rng() < 0.8 ? `rgba(255,200,130,${(0.18 + rng() * 0.35).toFixed(2)})` : `rgba(180,210,255,${(0.15 + rng() * 0.25).toFixed(2)})`;
              g.fillRect(xx, yy, cw * 0.7, ch * 0.7);
            }
          }
        }
        x += bw + rng() * 4 * s;
      }
      haze(g, h * L.base, h * 0.05, w, "70,60,100", 0.1);
    }
  }

  // Dunas: suma de ondas suaves (curvas largas, nada de picos)
  function dunes(rng, w, n, base, amp) {
    const p1 = rng() * TAU, p2 = rng() * TAU, p3 = rng() * TAU;
    const f1 = ((1.1 + rng()) * TAU) / w, f2 = ((2.6 + rng() * 1.5) * TAU) / w, f3 = ((6 + rng() * 3) * TAU) / w;
    return Array.from({ length: n + 1 }, (_, i) => {
      const x = (i / n) * w;
      return [x, base - amp * (0.6 * Math.sin(x * f1 + p1) + 0.3 * Math.sin(x * f2 + p2) + 0.1 * Math.sin(x * f3 + p3))];
    });
  }
  // Una línea de luz muy tenue sobre una cresta (la luna rozando la arena o la nieve)
  function crest(g, pts, s, col) {
    g.strokeStyle = col; g.lineWidth = 1.2 * s; g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y + 0.6 * s) : g.moveTo(x, y + 0.6 * s)));
    g.stroke();
  }
  // Nieve en las cumbres: un degradado claro recortado a la forma de la montaña
  function snowcap(g, pts, base, depth, alpha) {
    const top = Math.min(...pts.map((p) => p[1]));
    g.save();
    g.beginPath(); g.moveTo(0, base + 2); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(pts[pts.length - 1][0], base + 2); g.closePath(); g.clip();
    const gr = g.createLinearGradient(0, top, 0, top + depth);
    gr.addColorStop(0, `rgba(200,215,240,${alpha})`); gr.addColorStop(1, "rgba(200,215,240,0)");
    g.fillStyle = gr; g.fillRect(0, top, g.canvas.width, depth);
    g.restore();
  }
  function cacti(g, m, rng, pts, s, color, count) {
    for (let k = 0; k < count; k++) {
      const [x, y] = pts[Math.floor((0.08 + 0.84 * rng()) * (pts.length - 1))];
      const hgt = (16 + rng() * 14) * s, side = rng() < 0.5 ? -1 : 1;
      for (const ctx of [g, m]) {
        ctx.strokeStyle = ctx === g ? color : "rgb(255,0,0)"; ctx.lineWidth = 3.4 * s; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(x, y + 3 * s); ctx.lineTo(x, y - hgt);
        ctx.moveTo(x, y - hgt * 0.42); ctx.lineTo(x + side * 6 * s, y - hgt * 0.42); ctx.lineTo(x + side * 6 * s, y - hgt * 0.72);
        if (rng() < 0.7) { ctx.moveTo(x, y - hgt * 0.6); ctx.lineTo(x - side * 5 * s, y - hgt * 0.6); ctx.lineTo(x - side * 5 * s, y - hgt * 0.84); }
        ctx.stroke();
      }
    }
  }

  function paintDesert(g, m, w, h, s, rng) {
    const S = SCENES.desert;
    sky(g, w, h, S.sky);
    milkyWay(g, w, h, rng, s);
    // mesetas lejanas: crestas con la cima aplanada
    const mesa = ridge(rng, w, 64, h * 0.775, h * 0.11, 0.42).map(([x, y]) => [x, Math.max(y, h * 0.715)]);
    haze(g, h * 0.76, h * 0.1, w, "130,80,120", 0.12);
    fillRidge(g, m, mesa, h, "#1b1530", 0.3);
    haze(g, h * 0.8, h * 0.07, w, "100,60,100", 0.12);
    const d1 = dunes(rng, w, 120, h * 0.81, h * 0.03);
    fillRidge(g, m, d1, h, "#141024", 0.55); crest(g, d1, s, "rgba(210,175,210,0.10)");
    const d2 = dunes(rng, w, 120, h * 0.885, h * 0.035);
    fillRidge(g, m, d2, h, "#0b0816", 0.8); crest(g, d2, s, "rgba(220,180,200,0.08)");
    const d3 = dunes(rng, w, 120, h * 0.955, h * 0.028);
    fillRidge(g, m, d3, h, "#05040b", 1);
    cacti(g, m, rng, d3, s, "#05040b", 3);
  }

  function paintBay(g, m, w, h, s, rng) {
    const S = SCENES.bay, wy = h * S.water;
    sky(g, w, wy + 2, S.sky);
    milkyWay(g, w, wy, rng, s);
    // luna llena baja, con su halo
    const mx = w * 0.78, my = h * 0.2, mr = 11 * s;
    const halo = g.createRadialGradient(mx, my, 0, mx, my, mr * 9);
    halo.addColorStop(0, "rgba(215,228,255,0.16)"); halo.addColorStop(1, "rgba(215,228,255,0)");
    g.fillStyle = halo; g.fillRect(mx - mr * 9, my - mr * 9, mr * 18, mr * 18);
    g.fillStyle = "rgba(236,240,252,0.92)"; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.fillStyle = "rgba(170,180,205,0.25)";
    for (const [ox, oy, rr] of [[-0.3, -0.2, 0.32], [0.25, 0.1, 0.25], [-0.05, 0.35, 0.18]]) { g.beginPath(); g.arc(mx + ox * mr, my + oy * mr, rr * mr, 0, TAU); g.fill(); }
    // colinas al otro lado de la bahía
    const far = ridge(rng, w, 64, wy - h * 0.022, h * 0.018, 0.5);
    haze(g, wy - h * 0.01, h * 0.06, w, "80,110,160", 0.12);
    fillRidge(g, m, far, wy, "#0c1630", 0.35);
    // acantilado a la izquierda
    const cw = w * 0.42, cliff = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      cliff.push([t * cw, wy - h * (0.15 * (1 - smooth(0.5, 1, t)) + 0.012) + (rng() - 0.5) * h * 0.006 * (1 - t)]);
    }
    cliff.push([cw + 6 * s, wy + 1]);
    fillRidge(g, m, cliff, wy, "#060b18", 1);
    // faro en la orilla del acantilado, con su luz cálida y un haz muy suave
    const [lx, ly0] = cliff[14], ly = ly0 + 1 * s, th = 26 * s;
    for (const ctx of [g, m]) {
      ctx.fillStyle = ctx === g ? "#1c2438" : "rgb(255,0,0)";
      ctx.beginPath(); ctx.moveTo(lx - 3.4 * s, ly); ctx.lineTo(lx - 2.2 * s, ly - th); ctx.lineTo(lx + 2.2 * s, ly - th); ctx.lineTo(lx + 3.4 * s, ly); ctx.closePath(); ctx.fill();
      ctx.fillRect(lx - 3 * s, ly - th - 4.5 * s, 6 * s, 1.4 * s);
    }
    g.fillStyle = "rgba(44,54,78,0.9)"; g.fillRect(lx - 2.6 * s, ly - th * 0.55, 5.2 * s, 2.4 * s);
    const ly2 = ly - th - 2.4 * s;
    const beam = g.createLinearGradient(lx, 0, lx + w * 0.5, 0);
    beam.addColorStop(0, "rgba(255,225,160,0.10)"); beam.addColorStop(1, "rgba(255,225,160,0)");
    g.fillStyle = beam; g.beginPath(); g.moveTo(lx, ly2); g.lineTo(lx + w * 0.5, ly2 - h * 0.05); g.lineTo(lx + w * 0.5, ly2 + h * 0.03); g.closePath(); g.fill();
    const lamp = g.createRadialGradient(lx, ly2, 0, lx, ly2, 26 * s);
    lamp.addColorStop(0, "rgba(255,226,165,0.55)"); lamp.addColorStop(1, "rgba(255,226,165,0)");
    g.fillStyle = lamp; g.fillRect(lx - 26 * s, ly2 - 26 * s, 52 * s, 52 * s);
    g.fillStyle = "rgba(255,236,190,0.95)"; g.fillRect(lx - 1.6 * s, ly2 - 1.2 * s, 3.2 * s, 2.4 * s);
    // el mar
    const wg = g.createLinearGradient(0, wy, 0, h);
    wg.addColorStop(0, "#0b1a34"); wg.addColorStop(0.3, "#061024"); wg.addColorStop(1, "#02050c");
    g.fillStyle = wg; g.fillRect(0, wy, w, h - wy);
    m.fillStyle = "rgb(0,255,0)"; m.fillRect(0, wy, w, h - wy);
    g.save();
    g.beginPath(); g.rect(0, wy, w, h - wy); g.clip();
    g.globalAlpha = 0.6;
    for (const [pts, col] of [[far, "#0a1429"], [cliff, "#03070f"]]) {
      g.beginPath(); g.moveTo(0, wy);
      pts.forEach(([x, y]) => g.lineTo(x, wy + (wy - y) * 0.9));
      g.lineTo(pts[pts.length - 1][0], wy); g.closePath(); g.fillStyle = col; g.fill();
    }
    g.globalAlpha = 1;
    // el camino de la luna sobre el agua: rayitas que se abren hacia abajo
    for (let i = 0; i < 160; i++) {
      const f = Math.pow(rng(), 0.8), y = wy + 2 * s + f * (h - wy) * 0.9, spread = (6 + f * 60) * s;
      const x = mx + gauss() * spread, l = (4 + rng() * 18) * s * (0.5 + f);
      g.fillStyle = `rgba(220,230,255,${(0.05 + rng() * 0.14 * (1 - f * 0.6)).toFixed(3)})`;
      g.fillRect(x - l / 2, y, l, Math.max(1, 0.7 * s));
    }
    // y el del faro, cálido y corto
    for (let i = 0; i < 26; i++) {
      const f = rng(), y = wy + 2 * s + f * h * 0.08, l = (3 + rng() * 9) * s;
      g.fillStyle = `rgba(255,215,150,${(0.05 + rng() * 0.12 * (1 - f)).toFixed(3)})`;
      g.fillRect(lx + gauss() * 4 * s - l / 2, y, l, Math.max(1, 0.6 * s));
    }
    for (let i = 0; i < 200; i++) {
      const y = wy + Math.pow(rng(), 1.6) * (h - wy), x = rng() * w, l = (8 + rng() * 40) * s * (0.4 + (y - wy) / (h - wy));
      g.fillStyle = `rgba(140,170,220,${(0.02 + rng() * 0.035).toFixed(3)})`;
      g.fillRect(x, y, l, Math.max(1, 0.6 * s));
    }
    g.restore();
    g.fillStyle = "rgba(120,150,200,0.12)"; g.fillRect(cw, wy - 0.5 * s, w - cw, 1 * s);
  }

  function houses(g, m, rng, pts, s, count) {
    const used = [];
    for (let k = 0; k < count; k++) {
      let i = 0, tries = 0;
      do { i = Math.floor((0.06 + 0.88 * rng()) * (pts.length - 1)); } while (used.some((u) => Math.abs(u - i) < 4) && ++tries < 12);
      used.push(i);
      const [x, y] = pts[i], bw = (13 + rng() * 9) * s, bh = (8 + rng() * 5) * s, rh = bw * 0.42, top = y - bh + 2 * s;
      for (const ctx of [g, m]) {
        ctx.fillStyle = ctx === g ? "#0a1020" : "rgb(255,0,0)";
        ctx.fillRect(x - bw / 2, top, bw, bh + 4 * s);
        ctx.beginPath(); ctx.moveTo(x - bw / 2 - 2 * s, top + 0.5 * s); ctx.lineTo(x, top - rh); ctx.lineTo(x + bw / 2 + 2 * s, top + 0.5 * s); ctx.closePath(); ctx.fill();
        ctx.fillRect(x + bw * 0.18, top - rh * 0.95, 2.4 * s, rh * 0.6);
      }
      // nieve en el techo
      g.strokeStyle = "rgba(205,220,245,0.55)"; g.lineWidth = 1.6 * s; g.lineCap = "round";
      g.beginPath(); g.moveTo(x - bw / 2 - 2 * s, top); g.lineTo(x, top - rh - 0.6 * s); g.lineTo(x + bw / 2 + 2 * s, top); g.stroke();
      // ventanas cálidas con un poquito de resplandor
      const nw = rng() < 0.5 ? 1 : 2;
      for (let j = 0; j < nw; j++) {
        const wx = x - bw / 2 + bw * (nw === 1 ? 0.5 : 0.3 + 0.4 * j) - 1.6 * s, wy = top + bh * 0.3;
        const gl = g.createRadialGradient(wx + 1.6 * s, wy + 1.6 * s, 0, wx + 1.6 * s, wy + 1.6 * s, 9 * s);
        gl.addColorStop(0, "rgba(255,190,110,0.22)"); gl.addColorStop(1, "rgba(255,190,110,0)");
        g.fillStyle = gl; g.fillRect(wx - 8 * s, wy - 8 * s, 19 * s, 19 * s);
        g.fillStyle = "rgba(255,200,125,0.85)"; g.fillRect(wx, wy, 3.2 * s, 3.2 * s);
      }
    }
  }

  function paintSnow(g, m, w, h, s, rng) {
    const S = SCENES.snow;
    sky(g, w, h, S.sky);
    milkyWay(g, w, h, rng, s);
    const far = ridge(rng, w, 128, h * 0.69, h * 0.1, 0.55);
    haze(g, h * 0.7, h * 0.12, w, "90,120,170", 0.14);
    fillRidge(g, m, far, h, "#26365a", 0.3); snowcap(g, far, h, h * 0.06, 0.28);
    haze(g, h * 0.78, h * 0.08, w, "70,100,150", 0.16);
    const mid = ridge(rng, w, 96, h * 0.8, h * 0.04, 0.5);
    fillRidge(g, m, mid, h, "#1a2742", 0.6); snowcap(g, mid, h, h * 0.035, 0.2);
    pines(g, m, rng, mid, s * 0.7, "#0d1528", Math.round(w / s / 8));
    haze(g, h * 0.88, h * 0.05, w, "60,85,130", 0.14);
    const near = ridge(rng, w, 64, h * 0.905, h * 0.018, 0.45);
    fillRidge(g, m, near, h, "#16223a", 1); snowcap(g, near, h, h * 0.04, 0.22); crest(g, near, s, "rgba(210,225,250,0.16)");
    houses(g, m, rng, near, s, Math.max(4, Math.round(w / s / 70)));
    pines(g, m, rng, near, s * 0.9, "#070c18", Math.round(w / s / 30));
  }

  const PAINT = { alpine: paintAlpine, lake: paintLake, city: paintCity, desert: paintDesert, bay: paintBay, snow: paintSnow };

  function paint(sceneId, w, h, s, cColor, cMask) {
    cColor.width = cMask.width = w; cColor.height = cMask.height = h;
    const g = cColor.getContext("2d"), m = cMask.getContext("2d");
    m.fillStyle = "#000"; m.fillRect(0, 0, w, h);
    const seed = { alpine: 7, lake: 21, city: 33, desert: 45, bay: 58, snow: 64 }[sceneId] || 7;
    PAINT[sceneId](g, m, w, h, s, mulberry(seed * 977 + 13));
  }

  const cColor = document.createElement("canvas"), cMask = document.createElement("canvas");
  function apply(sceneId) {
    id = SCENES[sceneId] ? sceneId : "alpine";
    const sc = R.scale, w = Math.round(VW * sc), h = Math.round(VH * sc);
    paint(id, w, h, sc * Math.max(0.85, U), cColor, cMask);
    const S = SCENES[id];
    R.setBackground(cColor, cMask, S.water ? VH * S.water : -1, 1);
    KILL_Y = S.water ? VH * S.water : VH + 30;
  }
  // Miniatura para la Colección
  function thumb(sceneId, w, h) {
    const a = document.createElement("canvas"), b = document.createElement("canvas");
    paint(sceneId, w, h, 0.6, a, b);
    const g = a.getContext("2d"), rng = mulberry(5);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(230,236,255,${(0.2 + rng() * 0.6).toFixed(2)})`; const y = rng() * h * 0.6; g.fillRect(rng() * w, y, 1, 1); }
    return a.toDataURL("image/png");
  }

  return {
    apply, thumb,
    get id() { return id; },
    get launchY() { return VH * SCENES[id].launch; },
  };
})();
