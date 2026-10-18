"use strict";
/* doodle.js: el cohete "Tu dibujo". La persona dibuja una forma con el dedo (uno o varios trazos) y la explosión la
   reproduce en el cielo: cada estrella sale con una velocidad proporcional a un punto del dibujo y, como todas frenan
   igual, la forma se conserva (igual que el corazón y la estrella).
   - El dibujo se guarda normalizado (centrado, de -1 a 1, y hacia abajo) en Save.doodle, remuestreado y ligero.
   - Mientras no haya dibujo, explota como una carita feliz.
   - sample(n) reparte n puntos a lo largo de todos los trazos según su largo (cada trazo alterna color). */

const Doodle = (() => {
  // Carita feliz: el dibujo de fábrica
  const DEFAULT = (() => {
    const ring = [], smile = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU; ring.push([Math.cos(a) * 0.95, Math.sin(a) * 0.95]); }
    for (let i = 0; i <= 16; i++) { const a = 0.2 * Math.PI + (i / 16) * 0.6 * Math.PI; smile.push([Math.cos(a) * 0.55, Math.sin(a) * 0.55 + 0.05]); }
    return [ring, [[-0.33, -0.32], [-0.33, -0.2]], [[0.33, -0.32], [0.33, -0.2]], smile];
  })();
  const get = () => (Array.isArray(Save.doodle) && Save.doodle.length ? Save.doodle : DEFAULT);

  const segLen = (st) => { let L = 0; for (let i = 1; i < st.length; i++) L += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]); return L; };

  // n puntos repartidos a lo largo de todos los trazos (un punto suelto cuenta como un trazo cortito)
  function sample(n) {
    const strokes = get(), lens = strokes.map((st) => Math.max(0.08, segLen(st))), total = lens.reduce((a, b) => a + b, 0);
    const out = [];
    strokes.forEach((st, si) => {
      const k = Math.max(st.length > 1 ? 3 : 2, Math.round((n * lens[si]) / total));
      if (st.length < 2) { for (let j = 0; j < k; j++) out.push([st[0][0] + rand(-0.02, 0.02), st[0][1] + rand(-0.02, 0.02), si]); return; }
      const L = segLen(st);
      let seg = 1, acc = 0;
      for (let j = 0; j < k; j++) {
        const d = (j / (k - 1)) * L;
        while (seg < st.length - 1 && acc + Math.hypot(st[seg][0] - st[seg - 1][0], st[seg][1] - st[seg - 1][1]) < d) {
          acc += Math.hypot(st[seg][0] - st[seg - 1][0], st[seg][1] - st[seg - 1][1]); seg++;
        }
        const a = st[seg - 1], b = st[seg], sl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, f = clamp((d - acc) / sl, 0, 1);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, si]);
      }
    });
    return out;
  }

  /* ---------- Pantalla para dibujar ---------- */
  let strokes = [], cur = null, cv, g, size = 300, dpr = 1, open = false, onClose = null;
  const el = (id) => document.getElementById(id);

  function init() {
    cv = el("dd-cv"); g = cv.getContext("2d");
    cv.addEventListener("pointerdown", (e) => {
      if (strokes.length >= 14) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      cur = [pos(e)]; strokes.push(cur); draw(); Haptics.tap();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!cur) return;
      const p = pos(e), q = cur[cur.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 2.5) { cur.push(p); draw(); }
    });
    const up = () => { cur = null; };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    el("dd-undo").addEventListener("click", () => { tick(); strokes.pop(); draw(); });
    el("dd-clear").addEventListener("click", () => { tick(); strokes = []; draw(); });
    el("dd-cancel").addEventListener("click", () => { tick(); close(false); });
    el("dd-save").addEventListener("click", () => { tick(); close(true); });
    el("doodle").addEventListener("contextmenu", (e) => e.preventDefault());
  }
  const tick = () => { Sound.tap(); Haptics.tap(); };
  function pos(e) { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * size, ((e.clientY - r.top) / r.height) * size]; }

  function show(after) {
    onClose = after || null;
    open = true;
    el("doodle").hidden = false;
    size = Math.round(Math.min(VW - 64, 330));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = cv.style.height = size + "px";
    cv.width = cv.height = Math.round(size * dpr);
    // el dibujo guardado aparece para seguir editándolo
    strokes = Array.isArray(Save.doodle) ? Save.doodle.map((st) => st.map(([x, y]) => [(x * 0.42 + 0.5) * size, (y * 0.42 + 0.5) * size])) : [];
    Input.enabled = false;
    draw();
  }
  function close(save) {
    if (save && strokes.some((st) => st.length)) {
      Save.doodle = normalize(strokes);
      Save.selected.type = "doodle";
      persist();
    }
    open = false; cur = null;
    el("doodle").hidden = true;
    Input.enabled = Game.mode !== "home" && !UI.sheet;
    if (onClose) onClose(save);
  }

  // Centra, escala a [-1, 1] (conservando la proporción) y remuestrea cada trazo a pasos parejos
  function normalize(src) {
    const all = src.flat();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of all) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, half = Math.max(x1 - x0, y1 - y0) / 2 || 1;
    const norm = src.filter((st) => st.length).map((st) => st.map(([x, y]) => [(x - cx) / half, (y - cy) / half]));
    const total = norm.reduce((a, st) => a + segLen(st), 0), step = Math.max(0.035, total / 420);
    return norm.map((st) => {
      if (st.length < 2) return [st[0].map((v) => +v.toFixed(3))];
      const out = [st[0]];
      let acc = 0;
      for (let i = 1; i < st.length; i++) {
        acc += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
        if (acc >= step || i === st.length - 1) { out.push(st[i]); acc = 0; }
      }
      return out.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
    });
  }

  // El dibujo se ve como luz dorada sobre el cielo de noche
  function draw() {
    if (!open) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    g.fillStyle = "rgba(255,255,255,0.07)";
    for (let y = 12; y < size; y += 22) for (let x = 12; x < size; x += 22) g.fillRect(x, y, 1.2, 1.2);
    g.lineCap = "round"; g.lineJoin = "round";
    strokes.forEach((st, i) => {
      const col = i % 2 ? "255,214,150" : "255,236,200";
      g.shadowColor = `rgba(${col},0.9)`; g.shadowBlur = 12;
      g.strokeStyle = `rgba(${col},0.95)`; g.lineWidth = 3.2;
      g.beginPath();
      st.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (st.length === 1) g.lineTo(st[0][0] + 0.1, st[0][1]);
      g.stroke();
    });
    g.shadowBlur = 0;
    el("dd-empty").hidden = strokes.length > 0;
  }

  return { init, sample, show, get ready() { return Array.isArray(Save.doodle) && Save.doodle.length > 0; } };
})();
