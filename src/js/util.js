"use strict";
/* =====================================================================
   FIREWORKS · BluBer Games
   util.js: matemáticas, azar y utilidades compartidas
   ===================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const chance = (p) => Math.random() < p;
// Normal aproximada (suma de 3): da variación natural sin colas extremas
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const isNative = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
let reduceMotion = motionQuery.matches;
motionQuery.addEventListener && motionQuery.addEventListener("change", (e) => { reduceMotion = e.matches; });

// Dirección uniforme en una esfera, proyectada a la pantalla (x, y) más su profundidad z.
// Las explosiones reales son esferas: vistas de frente, el centro se ve más denso que la orilla.
const _dir = { x: 0, y: 0, z: 0 };
function sphereDir() {
  const z = rand(-1, 1), a = rand(TAU), r = Math.sqrt(1 - z * z);
  _dir.x = Math.cos(a) * r; _dir.y = Math.sin(a) * r; _dir.z = z;
  return _dir;
}

// Colores de emisión (lineales, pueden pasar de 1: el render es HDR)
function mixColor(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

function fmt(n) { return Math.floor(n).toLocaleString("en-US"); }
