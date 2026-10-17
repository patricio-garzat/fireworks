"use strict";
/* store.js: progreso y ajustes en localStorage (siempre con try/catch: en modo privado puede fallar) */

const SAVE_KEY = "fireworks-save-v1";
const SETTINGS_KEY = "fireworks-settings-v1";

function freshSave() {
  return {
    sparks: 0,
    unlocked: { types: ["classic", "willow", "ring"], palettes: ["classic"], scenes: ["alpine"] },
    selected: { type: "classic", palette: "classic", scene: "alpine" },
    discovered: [],
    stats: { launches: 0, bursts: 0, bestCombo: 0, finales: 0, earned: 0, charged: 0, chains: 0, goals: 0, byType: {} },
    finale: 0,
    goals: null,
    shows: [null, null, null],
    showSlot: 0,
  };
}

function freshSettings() {
  return { sfx: 0.85, music: 0.5, haptics: true, quality: "auto", lang: (navigator.language || "en").toLowerCase().startsWith("es") ? 1 : 0 };
}

function loadJSON(key, fresh) {
  const base = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (raw && typeof raw === "object") return deepMerge(base, raw);
  } catch (e) {}
  return base;
}

function deepMerge(base, over) {
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}

const Save = loadJSON(SAVE_KEY, freshSave);
const Settings = loadJSON(SETTINGS_KEY, freshSettings);
LANG = Settings.lang | 0;

let _saveTimer = 0;
function persist(now) {
  clearTimeout(_saveTimer);
  const write = () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(Save)); } catch (e) {}
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(Settings)); } catch (e) {}
  };
  if (now) write(); else _saveTimer = setTimeout(write, 600);
}
window.addEventListener("pagehide", () => persist(true));

function eraseProgress() {
  const f = freshSave();
  for (const k of Object.keys(Save)) delete Save[k];
  Object.assign(Save, f);
  persist(true);
}
