"use strict";
/* scenes.js: los escenarios. Cada uno se pinta una vez (al cambiar de tamaño) en dos lienzos:
   - color: cielo, vía láctea, montañas/edificios/agua
   - máscara: R = tierra (0 cielo … 1 lo más cercano), G = agua. El shader la usa para las estrellas y la luz. */

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SCENES = {
  // "Tu foto": la pinta photo.js; el horizonte y el agua los define la persona en el editor
  photo: {
    cost: 0, name: ["Your Photo", "Tu foto"], photo: true,
    sky: ["#03060f", "#071027", "#0f1d3e", "#1d2f55"], launch: 0.82, water: 0,
    mist: 0, cloud: 0, life: {},
  },
  alpine: {
    cost: 0, name: ["Alpine Night", "Noche alpina"],
    sky: ["#03060f", "#071027", "#0f1d3e", "#1d2f55"], launch: 1.02, water: 0,
    mist: 1, cloud: 0.5, life: { birds: "geese", birdY: [0.42, 0.58] },
  },
  lake: {
    cost: 1000, name: ["Still Lake", "Lago en calma"],
    sky: ["#02050d", "#061229", "#0c2142", "#18375a"], launch: 0.735, water: 0.735,
    mist: 0.9, cloud: 0.45, life: { birds: "geese", birdY: [0.42, 0.6] },
  },
  city: {
    cost: 2000, name: ["City Lights", "Luces de la ciudad"],
    sky: ["#04050f", "#0b0e26", "#1a1838", "#3a2a40"], launch: 1.02, water: 0,
    mist: 0.3, cloud: 0.35, life: {},
  },
  desert: {
    cost: 1500, name: ["Desert Dunes", "Dunas del desierto"],
    sky: ["#05040e", "#100c27", "#25193b", "#4a2d46"], launch: 1.02, water: 0,
    mist: 0.22, cloud: 0.2, life: { birds: "hawk", birdY: [0.36, 0.55] },
  },
  bay: {
    cost: 2600, name: ["Moonlit Bay", "Bahía de luna"],
    sky: ["#02040c", "#07112a", "#11244b", "#2b4068"], launch: 0.74, water: 0.74,
    mist: 0.55, cloud: 0.4, life: { birds: "gull", birdY: [0.42, 0.62] },
  },
  snow: {
    cost: 3200, name: ["Snowy Village", "Pueblo nevado"],
    sky: ["#03050d", "#0a1428", "#16264a", "#2c3f62"], launch: 1.02, water: 0,
    mist: 0.6, cloud: 0.6, life: { snow: true },
  },
  country: {
    cost: 1200, name: ["Countryside", "Campo"],
    sky: ["#03060e", "#0a1328", "#152446", "#26385a"], launch: 1.02, water: 0,
    mist: 0.8, cloud: 0.5, life: { birds: "geese", birdY: [0.45, 0.65] },
  },
  canyon: {
    cost: 2300, name: ["Red Canyon", "Cañón rojo"],
    sky: ["#04040d", "#0e0c25", "#211837", "#43293d"], launch: 1.02, water: 0,
    mist: 0.45, cloud: 0.3, life: { birds: "hawk", birdY: [0.34, 0.5] },
  },
  beach: {
    cost: 2900, name: ["Tropical Beach", "Playa tropical"],
    sky: ["#02050d", "#071330", "#0f2650", "#1f4166"], launch: 0.77, water: 0.77,
    mist: 0.35, cloud: 0.45, life: { birds: "gull", birdY: [0.45, 0.65] },
  },
  bridge: {
    cost: 3600, name: ["River Bridge", "Puente del río"],
    sky: ["#04050f", "#0b0f28", "#191b3c", "#352c48"], launch: 0.8, water: 0.8,
    mist: 0.45, cloud: 0.4, life: { birds: "gull", birdY: [0.45, 0.66] },
  },
};
const SCENE_ORDER = ["alpine", "lake", "country", "desert", "city", "canyon", "bay", "beach", "snow", "bridge"];

const Scene = (() => {
  let id = "alpine";
  // Lo que cada escenario deja para la capa de vida (ambient.js): luces que parpadean y el faro (en fracción de pantalla)
  let lights = { blink: [], beam: null, moon: null, wins: [], deck: null }, pw = 1, ph = 1;
  const blink = (x, y, period = 1.6) => lights.blink.push({ x: x / pw, y: y / ph, period, ph: rand(TAU) });

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
  /* Relieve: la luna (arriba a la derecha) ilumina las laderas que miran hacia ella y deja en sombra las otras;
     surcos que bajan desde la cresta y un borde de luz fino en la cresta. Todo recortado a la forma de la montaña. */
  function relief(g, pts, base, s, rng, o = {}) {
    const lit = o.lit || "160,185,235", amt = o.amt === undefined ? 1 : o.amt;
    const top = Math.min(...pts.map((p) => p[1])), span = base - top;
    g.save();
    g.beginPath(); g.moveTo(0, base + 2); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(pts[pts.length - 1][0], base + 2); g.closePath(); g.clip();
    // laderas: cada tramo baja una banda de luz (mira a la luna) o de sombra (le da la espalda).
    // La pendiente se promedia con los vecinos para que la luz siga a la ladera y no forme rayas.
    const sl = pts.map((_, i) => {
      const a = pts[Math.max(0, i - 3)], b = pts[Math.min(pts.length - 1, i + 4)];
      return (b[1] - a[1]) / ((b[0] - a[0]) || 1);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], slope = sl[i];
      const k = clamp(Math.abs(slope) * 1.4, 0, 1) * amt;
      if (k < 0.05) continue;
      const yt = Math.min(y0, y1), D = Math.min(span * 0.6, 26 * s + Math.abs(slope) * 30 * s);
      const gr = g.createLinearGradient(0, yt, 0, yt + D);
      if (slope > 0) { gr.addColorStop(0, `rgba(${lit},${(0.1 * k).toFixed(3)})`); gr.addColorStop(1, `rgba(${lit},0)`); }
      else { gr.addColorStop(0, `rgba(0,0,0,${(0.14 * k).toFixed(3)})`); gr.addColorStop(1, "rgba(0,0,0,0)"); }
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1 + 0.5, y1 + D); g.lineTo(x0 - 0.5, y0 + D); g.closePath(); g.fill();
    }
    // surcos: líneas que bajan desde la cresta, con un zigzag suave
    const n = Math.round(pts.length * 0.35 * amt);
    g.lineWidth = Math.max(1, 0.9 * s); g.lineCap = "round";
    for (let k = 0; k < n; k++) {
      let [x, y] = pts[Math.floor(rng() * pts.length)];
      const len = (10 + rng() * 30) * s;
      g.strokeStyle = `rgba(0,0,0,${(0.04 + rng() * 0.06).toFixed(3)})`;
      g.beginPath(); g.moveTo(x, y);
      for (let d = 0; d < len; d += 5 * s) { x += (rng() - 0.5) * 4 * s; y += 5 * s; g.lineTo(x, y); }
      g.stroke();
    }
    // borde de luz en la cresta (más fuerte donde mira a la luna)
    g.lineWidth = 1.1 * s;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], f = clamp(((y1 - y0) / ((x1 - x0) || 1)) * 2 + 0.3, 0, 1);
      g.strokeStyle = `rgba(${lit},${(0.04 + 0.2 * f * amt).toFixed(3)})`;
      g.beginPath(); g.moveTo(x0, y0 + 0.7 * s); g.lineTo(x1, y1 + 0.7 * s); g.stroke();
    }
    g.restore();
  }
  // Nieve solo en las cumbres más altas, con una orilla irregular pero suave (más abajo en las laderas que miran a la luna)
  function snowcaps(g, pts, base, rng, level = 0.45, alpha = 0.4) {
    const ys = pts.map((p) => p[1]), top = Math.min(...ys), low = Math.max(...ys), lim = top + (low - top) * level;
    // la línea de nieve es casi horizontal (depende de la altura), con una ondulación suave
    const p1 = rng() * 10, p2 = rng() * 10, r = low - top;
    const line = pts.map(([x, y], i) => {
      const a = pts[Math.max(0, i - 4)], b = pts[Math.min(pts.length - 1, i + 4)], face = (b[1] - a[1]) > 0 ? 0.05 : -0.03;
      return [x, Math.max(y, lim + r * (0.07 * Math.sin(i * 0.33 + p1) + 0.04 * Math.sin(i * 0.95 + p2) + face))];
    });
    const gr = g.createLinearGradient(0, top, 0, lim + (base - top) * 0.1);
    gr.addColorStop(0, `rgba(215,228,250,${alpha})`); gr.addColorStop(1, `rgba(200,215,245,${(alpha * 0.25).toFixed(3)})`);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    pts.forEach(([x, y]) => g.lineTo(x, y));
    for (let i = line.length - 1; i >= 0; i--) g.lineTo(line[i][0], line[i][1]);
    g.closePath(); g.fill();
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
    fillRidge(g, m, far, h, "#0f1a33", 0.35); snowcaps(g, far, h, rng, 0.5, 0.22); relief(g, far, h, s, rng, { amt: 0.6 });
    haze(g, h * 0.8, h * 0.08, w, "40,60,110", 0.18);
    const mid = ridge(rng, w, n, h * 0.8, h * 0.06, 0.52);
    fillRidge(g, m, mid, h, "#0a1226", 0.6); snowcaps(g, mid, h, rng, 0.32, 0.12); relief(g, mid, h, s, rng, { amt: 0.7 });
    haze(g, h * 0.88, h * 0.06, w, "30,45,85", 0.2);
    const near = ridge(rng, w, 64, h * 0.9, h * 0.035, 0.5);
    fillRidge(g, m, near, h, "#04070f", 1); relief(g, near, h, s, rng, { amt: 0.45 });
    pines(g, m, rng, near, s, "#04070f", Math.round(w / s / 9));
  }

  function paintLake(g, m, w, h, s, rng) {
    const S = SCENES.lake, wy = h * S.water;
    sky(g, w, wy + 2, S.sky);
    milkyWay(g, w, wy, rng, s);
    const far = ridge(rng, w, 128, wy - h * 0.07, h * 0.06, 0.55);
    haze(g, wy - h * 0.05, h * 0.1, w, "70,100,150", 0.14);
    fillRidge(g, m, far, wy, "#0d1830", 0.4); snowcaps(g, far, wy, rng, 0.45, 0.18); relief(g, far, wy, s, rng, { amt: 0.6 });
    const mid = ridge(rng, w, 128, wy - h * 0.02, h * 0.025, 0.5);
    fillRidge(g, m, mid, wy, "#070d1d", 0.75); relief(g, mid, wy, s, rng, { amt: 0.6 });
    pines(g, m, rng, mid.map(([x, y]) => [x, Math.min(y, wy)]), s * 0.55, "#070d1d", Math.round(w / s / 5));
    // agua: degradado y el reflejo de las montañas, más oscuro y movido
    const wg = g.createLinearGradient(0, wy, 0, h);
    wg.addColorStop(0, "#0a1830"); wg.addColorStop(0.25, "#060f22"); wg.addColorStop(1, "#02050c");
    g.fillStyle = wg; g.fillRect(0, wy, w, h - wy);
    m.fillStyle = "rgb(0,255,0)"; m.fillRect(0, wy, w, h - wy);
    // (los reflejos ya no se pintan: el shader refleja de verdad lo que hay arriba, con olas)
    // la orilla: una línea de luz muy tenue
    g.fillStyle = "rgba(120,150,200,0.12)"; g.fillRect(0, wy - 0.5 * s, w, 1 * s);
    // lucecitas cálidas de cabañas a lo lejos (el agua las refleja sola)
    for (let i = 0; i < 5; i++) {
      const x = w * (0.08 + rng() * 0.84), y = wy - (1.5 + rng() * 4) * s;
      g.fillStyle = "rgba(255,196,120,0.75)"; g.fillRect(x, y, 1.6 * s, 1.6 * s);
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
    for (const [li, L] of layers.entries()) {
      let x = -rng() * 20 * s;
      while (x < w) {
        const bw = (L.wmin + rng() * (L.wmax - L.wmin)) * s, bh = h * (L.hmin + rng() * (L.hmax - L.hmin));
        const top = h * L.base - bh, mk = `rgb(${Math.round(L.mask * 255)},0,0)`;
        // remate de la azotea: tanque de agua, corona escalonada, aguja o cajas de aire acondicionado
        const r = rng(), roof = r < 0.12 ? "tank" : r < 0.22 ? "crown" : r < 0.3 ? "spire" : r < 0.42 ? "boxes" : "";
        for (const ctx of [g, m]) {
          ctx.fillStyle = ctx === g ? L.col : mk;
          ctx.fillRect(x, top, bw + 1, h - top);
          if (roof === "tank") { ctx.fillRect(x + bw * 0.62, top - 7 * s, 6 * s, 5 * s); ctx.fillRect(x + bw * 0.62 + 0.5 * s, top - 2 * s, 1 * s, 2 * s); ctx.fillRect(x + bw * 0.62 + 4.5 * s, top - 2 * s, 1 * s, 2 * s); }
          if (roof === "crown") { ctx.fillRect(x + bw * 0.12, top - bh * 0.06, bw * 0.76, bh * 0.06 + 1); ctx.fillRect(x + bw * 0.28, top - bh * 0.11, bw * 0.44, bh * 0.05 + 1); }
          if (roof === "spire") { ctx.beginPath(); ctx.moveTo(x + bw * 0.42, top); ctx.lineTo(x + bw * 0.5, top - bh * 0.28); ctx.lineTo(x + bw * 0.58, top); ctx.closePath(); ctx.fill(); }
          if (roof === "boxes") for (let k = 0; k < 3; k++) ctx.fillRect(x + bw * (0.15 + 0.25 * k), top - 3 * s, 4 * s, 3 * s);
        }
        if (roof === "spire" && L.mask > 0.5) blink(x + bw * 0.5, top - bh * 0.28, rand(1.4, 2.2));
        // canto iluminado por la luna (derecha) y sombra suave (izquierda)
        g.fillStyle = `rgba(150,170,220,${(0.05 + 0.03 * li).toFixed(3)})`; g.fillRect(x + bw - 1.2 * s, top, 1.2 * s, h * L.base - top);
        g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(x, top, 1.5 * s, h * L.base - top);
        // ventanas por pisos: algunos pisos encendidos casi completos, otros apagados; unas cuantas se prenden y apagan solas
        const cw = 4 * s, ch = 5 * s;
        for (let yy = top + 4 * s; yy < h * L.base - 3 * s; yy += ch + 3 * s) {
          const floorOn = rng() < L.win * 0.55, warm = rng() < 0.82;
          for (let xx = x + 3 * s; xx < x + bw - cw; xx += cw + 3 * s) {
            const on = floorOn ? rng() < 0.7 : rng() < L.win * 0.12;
            if (on) {
              g.fillStyle = warm ? `rgba(255,200,130,${(0.2 + rng() * 0.35).toFixed(2)})` : `rgba(180,210,255,${(0.16 + rng() * 0.25).toFixed(2)})`;
              g.fillRect(xx, yy, cw * 0.7, ch * 0.7);
            } else if (li > 0 && rng() < 0.05 && lights.wins.length < 26) {
              lights.wins.push({ x: xx / pw, y: yy / ph, w: (cw * 0.7) / pw, h: (ch * 0.7) / ph });
            }
          }
        }
        x += bw + rng() * 4 * s;
      }
      // luz de la calle entre los edificios, al pie de cada fila
      const st = g.createLinearGradient(0, h * L.base - h * 0.02, 0, h * L.base);
      st.addColorStop(0, "rgba(255,170,100,0)"); st.addColorStop(1, `rgba(255,170,100,${(0.05 + 0.03 * li).toFixed(3)})`);
      g.fillStyle = st; g.fillRect(0, h * L.base - h * 0.02, w, h * 0.02);
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
    fillRidge(g, m, mesa, h, "#1b1530", 0.3); relief(g, mesa, h, s, rng, { amt: 0.8, lit: "225,175,190" });
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
    lights.moon = { x: mx / pw, y: my / ph };
    const halo = g.createRadialGradient(mx, my, 0, mx, my, mr * 9);
    halo.addColorStop(0, "rgba(215,228,255,0.16)"); halo.addColorStop(1, "rgba(215,228,255,0)");
    g.fillStyle = halo; g.fillRect(mx - mr * 9, my - mr * 9, mr * 18, mr * 18);
    g.fillStyle = "rgba(236,240,252,0.92)"; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.fillStyle = "rgba(170,180,205,0.25)";
    for (const [ox, oy, rr] of [[-0.3, -0.2, 0.32], [0.25, 0.1, 0.25], [-0.05, 0.35, 0.18]]) { g.beginPath(); g.arc(mx + ox * mr, my + oy * mr, rr * mr, 0, TAU); g.fill(); }
    // colinas al otro lado de la bahía
    const far = ridge(rng, w, 64, wy - h * 0.022, h * 0.018, 0.5);
    haze(g, wy - h * 0.01, h * 0.06, w, "80,110,160", 0.12);
    fillRidge(g, m, far, wy, "#0c1630", 0.35); relief(g, far, wy, s, rng, { amt: 0.5 });
    // acantilado a la izquierda
    const cw = w * 0.42, cliff = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      cliff.push([t * cw, wy - h * (0.15 * (1 - smooth(0.5, 1, t)) + 0.012) + (rng() - 0.5) * h * 0.006 * (1 - t)]);
    }
    cliff.push([cw + 6 * s, wy + 1]);
    fillRidge(g, m, cliff, wy, "#060b18", 1); relief(g, cliff, wy, s, rng, { amt: 0.9 });
    // faro en la orilla del acantilado, con su luz cálida y un haz muy suave
    const [lx, ly0] = cliff[14], ly = ly0 + 1 * s, th = 26 * s;
    for (const ctx of [g, m]) {
      ctx.fillStyle = ctx === g ? "#1c2438" : "rgb(255,0,0)";
      ctx.beginPath(); ctx.moveTo(lx - 3.4 * s, ly); ctx.lineTo(lx - 2.2 * s, ly - th); ctx.lineTo(lx + 2.2 * s, ly - th); ctx.lineTo(lx + 3.4 * s, ly); ctx.closePath(); ctx.fill();
      ctx.fillRect(lx - 3 * s, ly - th - 4.5 * s, 6 * s, 1.4 * s);
    }
    g.fillStyle = "rgba(44,54,78,0.9)"; g.fillRect(lx - 2.6 * s, ly - th * 0.55, 5.2 * s, 2.4 * s);
    const ly2 = ly - th - 2.4 * s;
    lights.beam = { x: lx / pw, y: ly2 / ph };   // el haz gira en ambient.js
    const lamp = g.createRadialGradient(lx, ly2, 0, lx, ly2, 26 * s);
    lamp.addColorStop(0, "rgba(255,226,165,0.55)"); lamp.addColorStop(1, "rgba(255,226,165,0)");
    g.fillStyle = lamp; g.fillRect(lx - 26 * s, ly2 - 26 * s, 52 * s, 52 * s);
    g.fillStyle = "rgba(255,236,190,0.95)"; g.fillRect(lx - 1.6 * s, ly2 - 1.2 * s, 3.2 * s, 2.4 * s);
    // el mar
    const wg = g.createLinearGradient(0, wy, 0, h);
    wg.addColorStop(0, "#0b1a34"); wg.addColorStop(0.3, "#061024"); wg.addColorStop(1, "#02050c");
    g.fillStyle = wg; g.fillRect(0, wy, w, h - wy);
    m.fillStyle = "rgb(0,255,0)"; m.fillRect(0, wy, w, h - wy);
    // (los reflejos ya no se pintan: el shader refleja de verdad lo que hay arriba, con olas)
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
    fillRidge(g, m, far, h, "#26365a", 0.3); snowcaps(g, far, h, rng, 0.75, 0.3); relief(g, far, h, s, rng, { amt: 0.6, lit: "200,215,245" });
    haze(g, h * 0.78, h * 0.08, w, "70,100,150", 0.16);
    const mid = ridge(rng, w, 96, h * 0.8, h * 0.04, 0.5);
    fillRidge(g, m, mid, h, "#1a2742", 0.6); snowcaps(g, mid, h, rng, 0.6, 0.18); relief(g, mid, h, s, rng, { amt: 0.5, lit: "200,215,245" });
    pines(g, m, rng, mid, s * 0.7, "#0d1528", Math.round(w / s / 8));
    haze(g, h * 0.88, h * 0.05, w, "60,85,130", 0.14);
    const near = ridge(rng, w, 64, h * 0.905, h * 0.018, 0.45);
    fillRidge(g, m, near, h, "#16223a", 1); snowcap(g, near, h, h * 0.04, 0.22); crest(g, near, s, "rgba(210,225,250,0.16)");
    houses(g, m, rng, near, s, Math.max(4, Math.round(w / s / 70)));
    pines(g, m, rng, near, s * 0.9, "#070c18", Math.round(w / s / 30));
  }

  // Árbol de copa redonda (silueta hecha de círculos)
  function roundTree(g, m, x, y, s, size, color) {
    for (const ctx of [g, m]) {
      ctx.fillStyle = ctx === g ? color : "rgb(255,0,0)";
      ctx.fillRect(x - 1.6 * s, y - size * 1.1, 3.2 * s, size * 1.1 + 2 * s);
      ctx.beginPath();
      for (const [dx, dy, r] of [[0, -1.55, 0.62], [-0.5, -1.25, 0.5], [0.5, -1.25, 0.5], [-0.25, -1.85, 0.45], [0.3, -1.8, 0.45]]) {
        ctx.moveTo(x + dx * size + r * size, y + dy * size); ctx.arc(x + dx * size, y + dy * size, r * size, 0, TAU);
      }
      ctx.fill();
    }
  }
  function paintCountry(g, m, w, h, s, rng) {
    const S = SCENES.country;
    sky(g, w, h, S.sky);
    milkyWay(g, w, h, rng, s);
    const far = dunes(rng, w, 96, h * 0.79, h * 0.025);
    haze(g, h * 0.8, h * 0.08, w, "60,90,140", 0.16);
    fillRidge(g, m, far, h, "#101b30", 0.4); relief(g, far, h, s, rng, { amt: 0.35 });
    // hileras de árboles lejanos
    for (let i = 0; i < Math.round(w / s / 14); i++) {
      const [x, y] = far[Math.floor(rng() * far.length)];
      for (const ctx of [g, m]) { ctx.fillStyle = ctx === g ? "#0c1527" : "rgb(102,0,0)"; ctx.beginPath(); ctx.arc(x, y + 1 * s, (3 + rng() * 4) * s, 0, TAU); ctx.fill(); }
    }
    const mid = dunes(rng, w, 96, h * 0.875, h * 0.03);
    haze(g, h * 0.86, h * 0.06, w, "50,75,120", 0.14);
    fillRidge(g, m, mid, h, "#0a1222", 0.7); relief(g, mid, h, s, rng, { amt: 0.3 });
    // granero con una ventana cálida
    const [bx, by] = mid[Math.floor(mid.length * (0.22 + rng() * 0.12))], bw = 30 * s, bh = 18 * s;
    for (const ctx of [g, m]) {
      ctx.fillStyle = ctx === g ? "#070d1a" : "rgb(178,0,0)";
      ctx.fillRect(bx - bw / 2, by - bh + 3 * s, bw, bh);
      ctx.beginPath(); ctx.moveTo(bx - bw / 2 - 2 * s, by - bh + 3.5 * s); ctx.lineTo(bx - bw * 0.25, by - bh - 7 * s); ctx.lineTo(bx + bw * 0.25, by - bh - 7 * s); ctx.lineTo(bx + bw / 2 + 2 * s, by - bh + 3.5 * s); ctx.closePath(); ctx.fill();
    }
    const wg = g.createRadialGradient(bx + 6 * s, by - bh * 0.45, 0, bx + 6 * s, by - bh * 0.45, 14 * s);
    wg.addColorStop(0, "rgba(255,190,110,0.25)"); wg.addColorStop(1, "rgba(255,190,110,0)");
    g.fillStyle = wg; g.fillRect(bx - 10 * s, by - bh - 10 * s, 32 * s, 30 * s);
    g.fillStyle = "rgba(255,200,125,0.85)"; g.fillRect(bx + 4 * s, by - bh * 0.6, 4 * s, 4 * s);
    const near = dunes(rng, w, 64, h * 0.95, h * 0.02);
    fillRidge(g, m, near, h, "#04070f", 1);
    // cerca de madera
    g.strokeStyle = "#04070f"; m.strokeStyle = "rgb(255,0,0)";
    for (const ctx of [g, m]) {
      ctx.lineWidth = 1.4 * s; ctx.beginPath();
      for (let i = 0; i < near.length - 1; i += 2) { const [x, y] = near[i]; ctx.moveTo(x, y + 2 * s); ctx.lineTo(x, y - 9 * s); }
      for (const off of [6, 2]) { ctx.moveTo(0, near[0][1] - off * s); near.forEach(([x, y]) => ctx.lineTo(x, y - off * s)); }
      ctx.stroke();
    }
    roundTree(g, m, near[Math.floor(near.length * 0.78)][0], near[Math.floor(near.length * 0.78)][1], s, 26 * s, "#03060d");
  }

  function paintCanyon(g, m, w, h, s, rng) {
    const S = SCENES.canyon, base = h * 0.81;
    sky(g, w, h, S.sky);
    milkyWay(g, w, h, rng, s);
    // "buttes" lejanas: mesas de cima plana con laderas inclinadas
    haze(g, base, h * 0.1, w, "150,85,105", 0.12);
    const far = [[0, base]];
    let x = -rng() * 20 * s;
    while (x < w) {
      const top = h * (0.705 + rng() * 0.06), bw = (26 + rng() * 60) * s, sl = (8 + rng() * 12) * s, gap = (30 + rng() * 80) * s;
      far.push([x, base], [x + sl, top], [x + sl + bw, top + (rng() - 0.5) * 2 * s], [x + 2 * sl + bw, base]);
      x += 2 * sl + bw + gap;
    }
    far.push([w, base]);
    fillRidge(g, m, far, h, "#24152c", 0.3);
    // el fondo del cañón, más cerca y oscuro
    const mid = dunes(rng, w, 64, h * 0.855, h * 0.012);
    fillRidge(g, m, mid, h, "#0f0812", 0.6);
    // paredes del cañón a los lados: cornisas escalonadas (acantilado + repisa), cada vez más anchas hacia abajo
    for (const left of [true, false]) {
      const y0 = h * (0.57 + rng() * 0.04), pts = [], steps = 5, n = 70, ph = rng() * 10;
      for (let i = 0; i <= n; i++) {
        const t = i / n, y = lerp(y0, h, t), st = Math.floor(t * steps), ft = t * steps - st;
        const ledge = (st + smooth(0.55, 0.9, ft)) / steps;
        const inner = w * (0.07 + 0.27 * ledge + 0.015 * Math.sin(ph + st * 2.3)) + (rng() - 0.5) * 3 * s;
        pts.push([left ? inner : w - inner, y]);
      }
      const path = (ctx) => { ctx.beginPath(); ctx.moveTo(left ? 0 : w, y0); pts.forEach(([px, py]) => ctx.lineTo(px, py)); ctx.lineTo(left ? 0 : w, h + 2); ctx.closePath(); };
      path(g);
      const gr = g.createLinearGradient(0, y0, 0, h);
      gr.addColorStop(0, "#3b1d2b"); gr.addColorStop(0.5, "#1d0f1a"); gr.addColorStop(1, "#08040a");
      g.fillStyle = gr; g.fill();
      path(m); m.fillStyle = "rgb(230,0,0)"; m.fill();
      // vetas de roca y la luz tenue en el borde de cada repisa
      g.save(); path(g); g.clip();
      for (let i = 0; i < 26; i++) { const y = y0 + (h - y0) * rng(); g.fillStyle = `rgba(${rng() < 0.5 ? "200,120,120" : "30,12,28"},${(0.04 + rng() * 0.05).toFixed(3)})`; g.fillRect(0, y, w, (0.8 + rng() * 2.4) * s); }
      g.restore();
      g.strokeStyle = "rgba(230,150,140,0.12)"; g.lineWidth = 1.2 * s; g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      g.fillStyle = "rgba(230,150,140,0.1)"; g.fillRect(left ? 0 : pts[0][0], y0, Math.abs(pts[0][0] - (left ? 0 : w)), 1.2 * s);
    }
    const floor = dunes(rng, w, 64, h * 0.965, h * 0.01);
    fillRidge(g, m, floor, h, "#07040a", 1);
  }

  // Palmera (silueta): tronco curvo con anillos y hojas que se arquean y caen, cada una con sus hojitas
  function palmTree(g, m, x, y, s, hgt, lean, color) {
    const tx = x + lean * hgt * 0.35, ty = y - hgt;
    for (const ctx of [g, m]) {
      ctx.strokeStyle = ctx === g ? color : "rgb(255,0,0)"; ctx.fillStyle = ctx.strokeStyle; ctx.lineCap = "round"; ctx.lineJoin = "round";
      // tronco: más grueso abajo
      for (let i = 0; i < 12; i++) {
        const t0 = i / 12, t1 = (i + 1) / 12, q = (t) => [lerp(x, tx, t) + Math.sin(t * Math.PI) * lean * hgt * 0.08, lerp(y + 3 * s, ty, t)];
        const [x0, y0] = q(t0), [x1, y1] = q(t1);
        ctx.lineWidth = (5.2 - 2.4 * t0) * s; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      // hojas
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + lean * 0.25 + ((k / (n - 1)) - 0.5) * 3.3, L = hgt * (0.42 + 0.08 * Math.cos(k * 2.1));
        const ex = tx + Math.cos(a) * L, ey = ty + Math.abs(Math.cos(a)) * L * 0.35 + L * 0.12 + Math.sin(a) * L * 0.25;
        const cx = tx + Math.cos(a) * L * 0.5, cy = ty + Math.sin(a) * L * 0.55 - L * 0.12;
        const pt = (t) => [(1 - t) * (1 - t) * tx + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) * (1 - t) * ty + 2 * (1 - t) * t * cy + t * t * ey];
        ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(tx, ty);
        for (let t = 0.05; t <= 1.001; t += 0.05) { const [px, py] = pt(t); ctx.lineTo(px, py); }
        ctx.stroke();
        ctx.lineWidth = 1.1 * s; ctx.beginPath();
        for (let t = 0.12; t < 0.98; t += 0.07) {
          const [px, py] = pt(t), [qx, qy] = pt(t + 0.02), dx = qx - px, dy = qy - py, dl = Math.hypot(dx, dy) || 1;
          const nx = -dy / dl, ny = dx / dl, ll = (8 - 5 * t) * s * (hgt / (180 * s));
          for (const side of [1, -1]) { ctx.moveTo(px, py); ctx.lineTo(px + (nx * side * 0.8 + dx / dl * 0.4) * ll, py + (ny * side * 0.8 + 0.7) * ll); }
        }
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(tx, ty + 1.5 * s, 2.6 * s, 0, TAU); ctx.fill();
    }
  }
  function paintBeach(g, m, w, h, s, rng) {
    const S = SCENES.beach, wy = h * S.water, sand = h * 0.9;
    sky(g, w, wy + 2, S.sky);
    milkyWay(g, w, wy, rng, s);
    // luna creciente baja, con su halo (su camino de luz lo pinta el agua)
    const mx = w * 0.3, my = h * 0.27, mr = 9 * s;
    lights.moon = { x: mx / pw, y: my / ph };
    // la "mordida" de la luna creciente toma el color real del cielo en ese punto (antes de pintar la luna y su halo)
    const bx = mx + mr * 0.45, by = my - mr * 0.2, sp = g.getImageData(Math.round(bx + mr * 1.6), Math.round(by), 1, 1).data;
    g.fillStyle = "rgba(236,240,252,0.92)"; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.fillStyle = `rgb(${sp[0]},${sp[1]},${sp[2]})`; g.beginPath(); g.arc(bx, by, mr * 0.9, 0, TAU); g.fill();
    const halo = g.createRadialGradient(mx, my, 0, mx, my, mr * 8);
    halo.addColorStop(0, "rgba(215,228,255,0.14)"); halo.addColorStop(1, "rgba(215,228,255,0)");
    g.fillStyle = halo; g.fillRect(mx - mr * 8, my - mr * 8, mr * 16, mr * 16);
    // isla lejana
    const isle = ridge(rng, w * 0.4, 32, wy - h * 0.012, h * 0.012, 0.5).map(([x, y]) => [x + w * 0.55, Math.min(y, wy)]);
    for (const ctx of [g, m]) { ctx.beginPath(); ctx.moveTo(w * 0.55, wy); isle.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(w * 0.95, wy); ctx.closePath(); ctx.fillStyle = ctx === g ? "#0b1530" : "rgb(90,0,0)"; ctx.fill(); }
    // el mar
    const wg = g.createLinearGradient(0, wy, 0, sand);
    wg.addColorStop(0, "#0d2142"); wg.addColorStop(1, "#04101f");
    g.fillStyle = wg; g.fillRect(0, wy, w, sand - wy);
    m.fillStyle = "rgb(0,255,0)"; m.fillRect(0, wy, w, sand - wy);
    // la orilla: espuma suave y arena
    const shore = dunes(rng, w, 64, sand, h * 0.006);
    for (const ctx of [g, m]) {
      ctx.beginPath(); ctx.moveTo(0, h + 2); shore.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(w, h + 2); ctx.closePath();
      if (ctx === g) { const sg = ctx.createLinearGradient(0, sand, 0, h); sg.addColorStop(0, "#1a1d2e"); sg.addColorStop(1, "#090a12"); ctx.fillStyle = sg; } else ctx.fillStyle = "rgb(255,0,0)";
      ctx.fill();
    }
    crest(g, shore.map(([x, y]) => [x, y - 1.5 * s]), s, "rgba(200,220,255,0.18)");
    palmTree(g, m, w * 0.08, h * 0.97, s, h * 0.3, 0.7, "#03050b");
    palmTree(g, m, w * 0.2, h * 0.99, s, h * 0.22, 0.4, "#03050b");
    palmTree(g, m, w * 0.92, h * 0.98, s, h * 0.26, -0.8, "#03050b");
  }

  function paintBridge(g, m, w, h, s, rng) {
    const S = SCENES.bridge, wy = h * S.water;
    sky(g, w, wy + 2, S.sky);
    milkyWay(g, w, wy * 0.8, rng, s);
    const gl = g.createLinearGradient(0, wy - h * 0.12, 0, wy);
    gl.addColorStop(0, "rgba(255,150,90,0)"); gl.addColorStop(1, "rgba(255,150,90,0.1)");
    g.fillStyle = gl; g.fillRect(0, wy - h * 0.12, w, h * 0.12);
    // ciudad baja al fondo
    let x = 0;
    while (x < w) {
      const bw = (10 + rng() * 26) * s, bh = h * (0.01 + rng() * 0.045);
      for (const ctx of [g, m]) { ctx.fillStyle = ctx === g ? "#0d1024" : "rgb(90,0,0)"; ctx.fillRect(x, wy - bh, bw + 1, bh); }
      for (let k = 0; k < bh / (5 * s); k++) if (rng() < 0.4) { g.fillStyle = `rgba(255,205,140,${(0.2 + rng() * 0.3).toFixed(2)})`; g.fillRect(x + rng() * (bw - 3 * s), wy - bh + k * 5 * s + 2 * s, 2 * s, 2 * s); }
      x += bw + rng() * 3 * s;
    }
    // el puente colgante: dos torres, cables y la calzada con su fila de luces
    const deck = wy - h * 0.035, t1 = w * 0.18, t2 = w * 0.82, top = wy - h * 0.2;
    for (const ctx of [g, m]) {
      ctx.fillStyle = ctx === g ? "#05070f" : "rgb(255,0,0)"; ctx.strokeStyle = ctx.fillStyle;
      for (const tx of [t1, t2]) { ctx.fillRect(tx - 3 * s, top, 6 * s, wy - top); ctx.fillRect(tx - 5 * s, top + (deck - top) * 0.35, 10 * s, 2 * s); }
      ctx.fillRect(0, deck, w, 3.2 * s);
      ctx.lineWidth = 1.2 * s; ctx.beginPath();
      ctx.moveTo(-w * 0.1, deck - 2 * s); ctx.quadraticCurveTo((-w * 0.1 + t1) / 2, top + (deck - top) * 0.55, t1, top);
      ctx.moveTo(t1, top); ctx.quadraticCurveTo(w / 2, deck + (deck - top) * 0.65, t2, top);
      ctx.moveTo(t2, top); ctx.quadraticCurveTo((t2 + w * 1.1) / 2, top + (deck - top) * 0.55, w * 1.1, deck - 2 * s);
      ctx.stroke();
      ctx.lineWidth = 0.6 * s; ctx.beginPath();
      for (let i = 1; i < 30; i++) {
        const xx = t1 + (t2 - t1) * (i / 30), f = (xx - t1) / (t2 - t1), cy = (1 - f) * (1 - f) * top + 2 * (1 - f) * f * (deck + (deck - top) * 0.65) + f * f * top;
        ctx.moveTo(xx, cy); ctx.lineTo(xx, deck);
      }
      ctx.stroke();
    }
    for (let i = 0; i <= 40; i++) { const lx = (i / 40) * w; g.fillStyle = "rgba(255,215,150,0.85)"; g.fillRect(lx - 0.8 * s, deck - 1.4 * s, 1.6 * s, 1.6 * s); }
    lights.deck = { y: (deck + 1.6 * s) / ph, water: wy / ph };   // por aquí pasan los autos (ambient.js)
    for (const tx of [t1, t2]) { g.fillStyle = "rgba(255,90,80,0.9)"; g.fillRect(tx - 1 * s, top - 2 * s, 2 * s, 2 * s); blink(tx, top - 1 * s, 1.8); }
    // el río: reflejo del puente y de sus luces, movido
    const wg = g.createLinearGradient(0, wy, 0, h);
    wg.addColorStop(0, "#0b1530"); wg.addColorStop(1, "#02040b");
    g.fillStyle = wg; g.fillRect(0, wy, w, h - wy);
    m.fillStyle = "rgb(0,255,0)"; m.fillRect(0, wy, w, h - wy);
    // (los reflejos ya no se pintan: el shader refleja de verdad lo que hay arriba, con olas)
  }

  const PAINT = { alpine: paintAlpine, lake: paintLake, city: paintCity, desert: paintDesert, bay: paintBay, snow: paintSnow, country: paintCountry, canyon: paintCanyon, beach: paintBeach, bridge: paintBridge };

  function paint(sceneId, w, h, s, cColor, cMask) {
    lights = { blink: [], beam: null, moon: null, wins: [], deck: null }; pw = w; ph = h;
    cColor.width = cMask.width = w; cColor.height = cMask.height = h;
    const g = cColor.getContext("2d"), m = cMask.getContext("2d");
    m.fillStyle = "#000"; m.fillRect(0, 0, w, h);
    if (sceneId === "photo") {
      if (Photo.ready) {
        const c = Photo.cfg, S = SCENES.photo;
        S.launch = c.horizon; S.water = c.water ? c.horizon : 0;
        Photo.paint(g, m, w, h);
        return;
      }
      sceneId = "alpine";
    }
    const seed = { alpine: 7, lake: 21, city: 33, desert: 45, bay: 58, snow: 64, country: 71, canyon: 83, beach: 92, bridge: 105 }[sceneId] || 7;
    PAINT[sceneId](g, m, w, h, s, mulberry(seed * 977 + 13));
  }

  const cColor = document.createElement("canvas"), cMask = document.createElement("canvas");
  function apply(sceneId) {
    id = SCENES[sceneId] && (sceneId !== "photo" || Photo.ready) ? sceneId : "alpine";
    const sc = R.scale, w = Math.round(VW * sc), h = Math.round(VH * sc);
    paint(id, w, h, sc * Math.max(0.85, U), cColor, cMask);
    const S = SCENES[id];
    R.setBackground(cColor, cMask, S.water ? VH * S.water : -1, 1, S.mist || 0, S.cloud || 0);
    Ambient.setScene({ ...(S.life || {}), ...lights });
    R.setMoon(lights.moon ? [lights.moon.x * VW, lights.moon.y * VH] : null);
    // en "Tu foto" las chispas se apagan al llegar al horizonte (caen detrás de la tierra)
    KILL_Y = S.water ? VH * S.water : S.photo ? VH * S.launch : VH + 30;
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
