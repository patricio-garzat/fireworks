"use strict";
/* input.js: gestos táctiles (multitouch con Pointer Events).
   - Tap: lanza al soltar (la respuesta visual en el dedo es inmediata al tocar).
   - Mantener: carga un cohete más potente (anillo sutil y chispas que convergen).
   - Deslizar: una cadena de explosiones que sigue el camino.
   Cada dedo es independiente; los toques rápidos nunca se bloquean. */

const Input = (() => {
  const HOLD = 0.22, CHARGE = 1.15, SWIPE = 16;
  const ptrs = new Map();
  let ov, og, odpr = 1, dirty = false, enabled = false;

  function init(surface, overlay) {
    ov = overlay; og = ov.getContext("2d");
    surface.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    // nada de zoom, menús ni selección
    ["gesturestart", "gesturechange", "dblclick", "contextmenu"].forEach((e) => document.addEventListener(e, (ev) => ev.preventDefault(), { passive: false }));
  }
  function resize() {
    odpr = Math.min(window.devicePixelRatio || 1, 2);
    ov.width = Math.round(VW * odpr); ov.height = Math.round(VH * odpr);
    dirty = true;
  }

  function down(e) {
    Sound.wake();
    UI.activity();
    if (!enabled) return;
    e.preventDefault();
    const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: 0, mode: "pending", path: [[e.clientX, e.clientY]], ticked: 0 };
    ptrs.set(e.pointerId, p);
    Game.touchFX(p.x, p.y);
  }
  function move(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (p.mode === "pending" && Math.hypot(p.x - p.x0, p.y - p.y0) > SWIPE) p.mode = "swipe";
    if (p.mode === "swipe") {
      const l = p.path[p.path.length - 1];
      if (Math.hypot(p.x - l[0], p.y - l[1]) > 8) { p.path.push([p.x, p.y]); if (p.path.length > 200) p.path.shift(); }
    }
  }
  function up(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    dirty = true;
    if (p.mode === "swipe" && p.path.length >= 3) { Game.chain(p.path); Haptics.tap(); return; }
    if (p.mode === "charge") {
      const c = chargeOf(p);
      Game.launch(p.x, p.y, null, 1 + c * (FULL_POWER - 1));
      Haptics.tap();
      return;
    }
    Game.launch(p.x0, p.y0, null, 1);
    Haptics.tap();
  }
  function cancel(e) { ptrs.delete(e.pointerId); dirty = true; }

  const chargeOf = (p) => clamp((p.t - HOLD) / CHARGE, 0, 1);

  function update(dt) {
    for (const p of ptrs.values()) {
      p.t += dt;
      if (p.mode === "pending" && p.t >= HOLD) p.mode = "charge";
      if (p.mode === "charge") {
        const c = chargeOf(p);
        Game.chargeFX(p.x, p.y, c, dt);
        if (c >= 0.5 && p.ticked < 1) { p.ticked = 1; Haptics.tick(); }
        if (c >= 1 && p.ticked < 2) { p.ticked = 2; Haptics.burst(1); }
      }
    }
    draw();
  }

  // Capa 2D encima del cielo: el anillo de carga y la guía del deslizamiento
  function draw() {
    if (!ptrs.size && !dirty) return;
    dirty = false;
    og.setTransform(odpr, 0, 0, odpr, 0, 0);
    og.clearRect(0, 0, VW, VH);
    for (const p of ptrs.values()) {
      if (p.mode === "charge") {
        const c = chargeOf(p), r = (26 + 6 * c) * U, e = easeOutCubic(Math.min(1, (p.t - HOLD) / 0.25));
        og.lineCap = "round";
        og.strokeStyle = `rgba(255,255,255,${0.1 * e})`; og.lineWidth = 1.5;
        og.beginPath(); og.arc(p.x, p.y, r, 0, TAU); og.stroke();
        og.strokeStyle = c >= 1 ? `rgba(255,222,160,${0.85 * e})` : `rgba(255,236,200,${0.6 * e})`;
        og.lineWidth = 2;
        og.beginPath(); og.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * c); og.stroke();
        if (c >= 1) {
          const pulse = 0.5 + 0.5 * Math.sin(p.t * 6);
          og.strokeStyle = `rgba(255,222,160,${0.18 * pulse})`; og.lineWidth = 6;
          og.beginPath(); og.arc(p.x, p.y, r, 0, TAU); og.stroke();
        }
      } else if (p.mode === "swipe" && p.path.length > 1) {
        og.lineCap = "round"; og.lineJoin = "round";
        const pts = p.path, n = pts.length;
        for (let i = 1; i < n; i++) {
          const a = i / n;
          og.strokeStyle = `rgba(255,230,190,${(0.05 + 0.4 * a * a).toFixed(3)})`;
          og.lineWidth = 1 + 1.5 * a;
          og.beginPath(); og.moveTo(pts[i - 1][0], pts[i - 1][1]); og.lineTo(pts[i][0], pts[i][1]); og.stroke();
        }
      }
    }
    if (ptrs.size) dirty = true;
  }

  return {
    init, resize, update,
    set enabled(v) { enabled = v; if (!v) { ptrs.clear(); dirty = true; } },
    get enabled() { return enabled; },
    get active() { return ptrs.size; },
  };
})();
