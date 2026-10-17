"use strict";
/* photo.js: el escenario "Tu foto". La persona elige una foto de su carrete y la acomoda en el editor
   (pellizco para zoom, arrastrar para mover, línea del horizonte, cuánta noche y si abajo hay tierra o agua).
   El juego la vuelve de noche y la mete al cielo:
   - Debajo del horizonte es tierra (o agua): de ahí salen los cohetes y ahí caen y se apagan las chispas.
   - Arriba, lo liso es cielo (lleva estrellas y se funde con un cielo nocturno); lo que tiene detalle o es más
     oscuro que el cielo (árboles, edificios, montañas) cuenta como tierra: sin estrellas y con la luz de las explosiones.
   La foto (reducida) y cómo se acomodó se guardan en IndexedDB. Nunca sale del teléfono. */

const Photo = (() => {
  const MAX_SIDE = 2400;
  const FRESH = { z: 1, cx: 0.5, cy: 0.5, horizon: 0.82, night: 0.9, water: false };
  let img = null, cfg = null, version = 0, thumbURL = "", thumbV = -1;

  /* ---------- Guardado (IndexedDB) ---------- */
  function db() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open("fireworks-photo", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("kv", mode), rq = fn(tx.objectStore("kv"));
      tx.oncomplete = () => res(rq && rq.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  async function load() {
    try {
      const rec = await idb("readonly", (st) => st.get("scene"));
      if (!rec || !rec.blob) return false;
      img = await decode(rec.blob);
      cfg = { ...FRESH, ...rec.cfg };
      version++;
      return true;
    } catch (e) { return false; }
  }
  function store(blob, c) { return idb("readwrite", (st) => st.put({ blob, cfg: c }, "scene")).catch(() => {}); }

  // Decodifica y reduce (las fotos del iPhone son enormes). Safari ya respeta la orientación de la foto.
  async function decode(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
      g.drawImage(im, 0, 0, c.width, c.height);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }
  const toBlob = (c) => new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));

  /* ---------- Acomodo: escala y esquina de la foto en un marco de w×h ---------- */
  function place(src, c, w, h) {
    const smin = Math.max(w / src.width, h / src.height), s = smin * c.z;
    const ox = clamp(w / 2 - c.cx * src.width * s, w - src.width * s, 0);
    const oy = clamp(h / 2 - c.cy * src.height * s, h - src.height * s, 0);
    return { s, ox, oy };
  }
  function draw(g, src, c, w, h) {
    const p = place(src, c, w, h);
    g.fillStyle = "#04060f"; g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = "high";
    g.drawImage(src, p.ox, p.oy, src.width * p.s, src.height * p.s);
  }

  /* ---------- De día a noche + máscara ---------- */
  const SKY = [[0, [3, 6, 15]], [0.35, [7, 16, 39]], [0.68, [15, 29, 62]], [1, [29, 47, 85]]];
  function skyAt(t) {
    for (let i = 1; i < SKY.length; i++) {
      if (t <= SKY[i][0]) {
        const [a, ca] = SKY[i - 1], [b, cb] = SKY[i], f = (t - a) / (b - a);
        return [lerp(ca[0], cb[0], f) / 255, lerp(ca[1], cb[1], f) / 255, lerp(ca[2], cb[2], f) / 255];
      }
    }
    return SKY[SKY.length - 1][1].map((v) => v / 255);
  }
  // Qué tanto es "tierra" cada zona de arriba del horizonte (0 = cielo liso, 1 = árbol, edificio, montaña…)
  function landMap(g, w, h, hy) {
    const sw = Math.max(16, Math.round(w / 6)), sh = Math.max(16, Math.round(h / 6));
    const sc = document.createElement("canvas"); sc.width = sw; sc.height = sh;
    const sg = sc.getContext("2d"); sg.drawImage(g.canvas, 0, 0, sw, sh);
    const sd = sg.getImageData(0, 0, sw, sh).data, n = sw * sh, lum = new Float32Array(n), blue = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = sd[i * 4], g2 = sd[i * 4 + 1], b = sd[i * 4 + 2];
      lum[i] = (0.299 * r + 0.587 * g2 + 0.114 * b) / 255;
      blue[i] = b / (r + g2 + b + 1);
    }
    // cómo es el cielo: la mediana (brillo y qué tan azul) de la franja de arriba
    const top = [], topB = [], hs = Math.max(2, Math.round((hy / h) * sh * 0.25));
    for (let y = 0; y < hs; y++) for (let x = 0; x < sw; x++) { top.push(lum[y * sw + x]); topB.push(blue[y * sw + x]); }
    top.sort((a, b) => a - b); topB.sort((a, b) => a - b);
    const skyL = top[top.length >> 1] || 0.5, skyB = topB[topB.length >> 1] || 0.4;
    let land = new Float32Array(n);
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const i = y * sw + x, gx = lum[i + 1] - lum[i - 1], gy = lum[i + sw] - lum[i - sw];
        const detail = smooth(0.035, 0.1, Math.hypot(gx, gy));
        const darker = smooth(0.18, 0.38, skyL - lum[i]);
        // de otro color que el cielo (pasto, tierra, árboles): menos azul, y no es una nube muy clara
        const tint = smooth(0.06, 0.13, skyB - blue[i]) * (1 - smooth(0.75, 0.9, lum[i]));
        land[i] = Math.max(detail, darker, tint);
      }
    }
    // suavizar dos veces (caja 3×3) para que no queden bordes duros
    for (let pass = 0; pass < 2; pass++) {
      const out = new Float32Array(n);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        let s = 0, k = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < sw && yy < sh) { s += land[yy * sw + xx]; k++; }
        }
        out[y * sw + x] = s / k;
      }
      land = out;
    }
    // lectura bilineal: bordes suaves, sin escalones
    return (x, y) => {
      const fx = clamp((x * sw) / w - 0.5, 0, sw - 1.001), fy = clamp((y * sh) / h - 0.5, 0, sh - 1.001);
      const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, i = y0 * sw + x0;
      return lerp(lerp(land[i], land[i + 1], ax), lerp(land[i + sw], land[i + sw + 1], ax), ay);
    };
  }
  // Dónde está el horizonte en una foto recién elegida: la primera franja (de arriba hacia abajo) que ya es casi toda tierra
  function autoHorizon(src, c) {
    const w = 120, h = Math.round(120 * (VH / VW)), cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    draw(g, src, c, w, h);
    const at = landMap(g, w, h, h), rows = [];
    for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x += 2) s += at(x, y); rows.push(s / (w / 2)); }
    const run = Math.max(3, Math.round(h * 0.06));
    for (let y = Math.round(h * 0.4); y < h - run; y++) {
      let ok = true;
      for (let k = 0; k < run && ok; k++) ok = rows[y + k] > 0.6;
      if (ok) return clamp(y / h, 0.5, 0.92);
    }
    return 0.8;
  }
  // g ya trae la foto acomodada; la vuelve de noche en su lugar. Si viene m, escribe ahí la máscara.
  function grade(g, m, w, h, c) {
    const id = g.getImageData(0, 0, w, h), d = id.data;
    const hy = h * c.horizon, k = 1 - (1 - c.night) * (1 - c.night), soft = Math.max(2, h * 0.004);
    const landAt = landMap(g, w, h, hy);
    const md = m ? m.createImageData(w, h) : null, mm = md && md.data;
    for (let y = 0; y < h; y++) {
      const below = smooth(hy - soft, hy + soft, y), sk = skyAt(Math.min(1, y / Math.max(1, hy)));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, L = 0.299 * r + 0.587 * gg + 0.114 * b;
        const up = below < 1 ? landAt(x, y) : 1, land = Math.max(below, up), skyness = (1 - land) * (1 - below);
        // noche: oscura, fría y poco saturada (como la ve el ojo con luna)
        let nr = lerp(r, L * 0.62, 0.6) * 0.24, ng = lerp(gg, L * 0.74, 0.6) * 0.24, nb = lerp(b, L, 0.6) * 0.27;
        // el cielo liso se funde con un cielo nocturno de verdad
        const f = 0.85 * skyness;
        nr = lerp(nr, sk[0], f); ng = lerp(ng, sk[1], f); nb = lerp(nb, sk[2], f);
        d[i] = lerp(r, nr, k) * 255; d[i + 1] = lerp(gg, ng, k) * 255; d[i + 2] = lerp(b, nb, k) * 255;
        if (mm) {
          if (c.water) { mm[i] = up * (1 - below) * 255; mm[i + 1] = below * 255; }
          else { mm[i] = land * 255; mm[i + 1] = 0; }
          mm[i + 2] = 0; mm[i + 3] = 255;
        }
      }
    }
    g.putImageData(id, 0, 0);
    if (m) m.putImageData(md, 0, 0);
  }

  // Para scenes.js: pinta el escenario completo
  function paint(g, m, w, h) {
    draw(g, img, cfg, w, h);
    grade(g, m, w, h, cfg);
  }
  // Miniatura para la Colección (vertical: la tarjeta la recorta)
  function thumb() {
    if (!img) return "";
    if (thumbV === version) return thumbURL;
    const w = 180, h = Math.round(180 * (VH / VW)), c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    paint(g, null, w, h);
    thumbURL = c.toDataURL("image/jpeg", 0.8); thumbV = version;
    return thumbURL;
  }

  /* ---------- Editor ---------- */
  const ed = { open: false, src: null, blob: null, c: null, ptrs: new Map(), g0: null, dirty: false, raf: 0, busyT: 0 };
  const el = (id) => document.getElementById(id);

  function choose() {
    const f = el("ph-file");
    f.value = "";
    f.click();
  }
  async function picked(file) {
    if (!file) return;
    try {
      const src = await decode(file);
      ed.src = src; ed.blob = null; ed.c = { ...FRESH, night: ed.c ? ed.c.night : FRESH.night };
      ed.c.horizon = autoHorizon(src, ed.c);
      if (ed.open) syncControls();
      if (!ed.open) show();
      redraw();
    } catch (e) {}
  }
  function edit() {
    if (!img) { choose(); return; }
    ed.src = img; ed.blob = "same"; ed.c = { ...cfg };
    show();
  }
  function show() {
    ed.open = true;
    el("photo-ed").hidden = false;
    syncControls();
    Main.stop();
    Input.enabled = false;
    sizeCanvas();
    redraw();
  }
  function hide() {
    ed.open = false;
    el("photo-ed").hidden = true;
    ed.ptrs.clear();
    Main.run();
  }
  async function done() {
    if (!ed.src) { hide(); return; }
    tick();
    const c = { ...ed.c };
    if (ed.blob !== "same") {
      const blob = await toBlob(ed.src);
      if (blob) await store(blob, c);
      img = ed.src;
    } else {
      const rec = await idb("readonly", (st) => st.get("scene")).catch(() => null);
      if (rec && rec.blob) await store(rec.blob, c);
    }
    cfg = c; version++;
    hide();
    Save.selected.scene = "photo"; persist();
    Scene.apply("photo"); R.clearTrails();
    UI.photoSaved();
  }
  function tick() { Sound.tap(); Haptics.tap(); }

  function syncControls() {
    const n = el("ph-night");
    n.value = Math.round(ed.c.night * 100);
    n.style.setProperty("--v", n.value + "%");
    el("ph-ground").querySelectorAll("button").forEach((b) => b.classList.toggle("on", (b.dataset.v === "1") === !!ed.c.water));
    placeHorizon();
  }
  function placeHorizon() { el("ph-hz").style.transform = `translateY(${ed.c.horizon * VH}px)`; }

  function sizeCanvas() {
    const cv = el("ph-cv"), k = Math.min(window.devicePixelRatio || 1, 1.5);
    cv.width = Math.round(VW * k); cv.height = Math.round(VH * k);
  }
  function redraw() { ed.dirty = true; if (!ed.raf) ed.raf = requestAnimationFrame(render); }
  function render() {
    ed.raf = 0;
    if (!ed.open || !ed.dirty || !ed.src) return;
    ed.dirty = false;
    const cv = el("ph-cv"), g = cv.getContext("2d", { willReadFrequently: true });
    draw(g, ed.src, ed.c, cv.width, cv.height);
    grade(g, null, cv.width, cv.height, ed.c);
  }
  // Mientras se mueve algo, los controles se apartan para ver la foto completa
  function busy(on) {
    clearTimeout(ed.busyT);
    if (on) el("photo-ed").classList.add("busy");
    else ed.busyT = setTimeout(() => el("photo-ed").classList.remove("busy"), 350);
  }

  /* Gestos: un dedo mueve, dos dedos hacen zoom (alrededor del punto medio) y mueven */
  function gestureStart() {
    const pts = [...ed.ptrs.values()];
    const s = ed.src, p = place(s, ed.c, VW, VH);
    const mid = pts.length > 1 ? [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2] : [pts[0].x, pts[0].y];
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    // el punto de la foto que está bajo los dedos (en coordenadas de la foto)
    ed.g0 = { mid, dist, z: ed.c.z, ix: (mid[0] - p.ox) / p.s, iy: (mid[1] - p.oy) / p.s };
  }
  function gestureMove() {
    const pts = [...ed.ptrs.values()], g0 = ed.g0, s = ed.src;
    if (!g0) return;
    const mid = pts.length > 1 ? [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2] : [pts[0].x, pts[0].y];
    if (pts.length > 1 && g0.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      ed.c.z = clamp(g0.z * (dist / g0.dist), 1, 6);
    }
    // que el mismo punto de la foto siga bajo los dedos
    const smin = Math.max(VW / s.width, VH / s.height), sc = smin * ed.c.z;
    const ox = mid[0] - g0.ix * sc, oy = mid[1] - g0.iy * sc;
    ed.c.cx = clamp((VW / 2 - ox) / (s.width * sc), 0, 1);
    ed.c.cy = clamp((VH / 2 - oy) / (s.height * sc), 0, 1);
    // guardar el centro ya ajustado a los bordes (la foto siempre cubre la pantalla)
    const p = place(s, ed.c, VW, VH);
    ed.c.cx = (VW / 2 - p.ox) / (s.width * p.s); ed.c.cy = (VH / 2 - p.oy) / (s.height * p.s);
    redraw();
  }

  function init() {
    const root = el("photo-ed"), cv = el("ph-cv"), hz = el("ph-hz");
    el("ph-file").addEventListener("change", (e) => picked(e.target.files && e.target.files[0]));
    el("ph-cancel").addEventListener("click", () => { tick(); hide(); });
    el("ph-save").addEventListener("click", () => done());
    el("ph-change").addEventListener("click", () => { tick(); choose(); });
    el("ph-night").addEventListener("input", (e) => {
      ed.c.night = e.target.value / 100; e.target.style.setProperty("--v", e.target.value + "%"); redraw();
    });
    el("ph-ground").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      tick(); ed.c.water = b.dataset.v === "1"; syncControls(); redraw();
    }));
    cv.addEventListener("pointerdown", (e) => {
      if (!ed.src) return;
      cv.setPointerCapture(e.pointerId);
      ed.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gestureStart(); busy(true);
    });
    cv.addEventListener("pointermove", (e) => {
      if (!ed.ptrs.has(e.pointerId)) return;
      ed.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gestureMove();
    });
    const up = (e) => {
      if (!ed.ptrs.delete(e.pointerId)) return;
      if (ed.ptrs.size) gestureStart(); else { ed.g0 = null; busy(false); }
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    // la línea del horizonte se arrastra
    let hzId = null;
    hz.addEventListener("pointerdown", (e) => { hzId = e.pointerId; hz.setPointerCapture(e.pointerId); hz.classList.add("drag"); busy(true); Haptics.tap(); });
    hz.addEventListener("pointermove", (e) => {
      if (e.pointerId !== hzId) return;
      ed.c.horizon = clamp(e.clientY / VH, 0.45, 0.97); placeHorizon(); redraw();
    });
    const hzUp = (e) => { if (e.pointerId !== hzId) return; hzId = null; hz.classList.remove("drag"); busy(false); };
    hz.addEventListener("pointerup", hzUp); hz.addEventListener("pointercancel", hzUp);
    root.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("resize", () => { if (ed.open) { sizeCanvas(); placeHorizon(); redraw(); } });
  }

  return {
    init, load, paint, thumb, choose, edit,
    get ready() { return !!img && !!cfg; },
    get cfg() { return cfg; },
  };
})();
