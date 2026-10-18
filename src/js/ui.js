"use strict";
/* ui.js: Inicio, HUD, selector, Colección, Ajustes, Récords, Cómo jugar, avisos y Show Creator. */

const UI = (() => {
  const body = document.body;
  let idleT = 0, sheet = null, colTab = "fw", toastQ = [], toastBusy = false;
  const thumbs = {};
  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l1.9 6.2 6.3 1.9-6.3 2-1.9 6.3-1.9-6.3-6.3-2 6.3-1.9z" fill="currentColor"/></svg>';
  const PHOTO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.6"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l4.6-4.4 3.4 3 3-2.6L20 17"/></svg>';
  const LOCK = '<svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
  const HOW_ICONS = {
    tap: '<circle cx="12" cy="9" r="3.2"/><path d="M12 15.5v5M7.5 4.8A6.5 6.5 0 0 1 16.5 4.8"/>',
    hold: '<circle cx="12" cy="12" r="7.5" stroke-dasharray="2 2.6"/><path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
    swipe: '<path d="M4 17c3-1 4-7 8-7s4 4 8-3"/><circle cx="4" cy="17" r="1.3" fill="currentColor"/><circle cx="12" cy="10" r="1.3" fill="currentColor"/><circle cx="20" cy="7" r="1.3" fill="currentColor"/>',
    multi: '<circle cx="8" cy="10" r="2.8"/><circle cx="16" cy="13" r="2.8"/><path d="M8 13.8V19M16 16.8V20"/>',
    combo: '<path d="M5 18l4-5 3 3 7-9"/><path d="M15 7h4v4"/>',
    finale: '<path d="M12 3v3M5.5 6.5l2 2M18.5 6.5l-2 2"/><path d="M3.5 20.5c2.5-4 5.4-6 8.5-6s6 2 8.5 6"/><circle cx="12" cy="11" r="1.3" fill="currentColor"/>',
  };
  const svg = (inner, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ico = (k) => (ICON[k] ? iconSVG(k) : HOW_ICONS[k] ? svg(HOW_ICONS[k]) : SPARK);

  /* ---------- Arranque ---------- */
  function init() {
    $("#title").innerHTML = "FIREWORKS".split("").map((c, i) => `<span style="transition-delay:${i * 70}ms">${c}</span>`).join("");
    $$("#home .mode").forEach((b) => b.addEventListener("click", () => { press(); enter(b.dataset.mode); }));
    $$("#home [data-open]").forEach((b) => b.addEventListener("click", () => { press(); open(b.dataset.open); }));
    $("#b-col").addEventListener("click", () => { press(); open("collection"); });
    $("#b-set").addEventListener("click", () => { press(); open("settings"); });
    $("#b-home").addEventListener("click", () => { press(); goHome(); });
    $("#sparks").addEventListener("click", () => { press(); colTab = "fw"; open("collection"); });
    $("#pick-btn").addEventListener("click", () => { press(); togglePicker(); });
    $("#pick-draw").addEventListener("click", () => { press(); togglePicker(false); Doodle.show(() => buildPicker()); });
    document.addEventListener("pointerdown", (e) => { if (pickOpen && !e.target.closest("#picker")) togglePicker(false); }, true);
    document.addEventListener("keydown", (e) => { if (pickOpen && e.key === "Escape") togglePicker(false); });
    $("#finale").addEventListener("click", () => { if (Game.startFinale()) { Haptics.success(); finaleBar(); } });
    $("#scrim").addEventListener("click", close);
    $$(".sheet").forEach(sheetDrag);
    $$("[data-close]").forEach((b) => b.addEventListener("click", () => { press(); close(); }));
    $$(".tabs button").forEach((b) => b.addEventListener("click", () => { press(); colTab = b.dataset.tab; renderCollection(); }));
    // Show Creator
    $("#s-rec").addEventListener("click", () => { press(); Game.recording ? Game.stopRec() : Game.startRec(); });
    $("#s-play").addEventListener("click", () => { press(); Game.playing ? Game.stopShow() : Game.playShow(); });
    $("#s-clear").addEventListener("click", () => { press(); Save.shows[Save.showSlot] = null; persist(); showState(); });
    // Ajustes
    const sfx = $("#set-sfx"), mus = $("#set-music");
    const fill = (el) => el.style.setProperty("--v", `${el.value * 100}%`);
    sfx.value = Settings.sfx; mus.value = Settings.music; fill(sfx); fill(mus);
    sfx.addEventListener("input", () => { Settings.sfx = +sfx.value; fill(sfx); Sound.applyVolumes(); persist(); });
    sfx.addEventListener("change", () => Sound.boom(0.6, 0));
    mus.addEventListener("input", () => { Settings.music = +mus.value; fill(mus); Sound.applyVolumes(); persist(); });
    $("#set-vib").addEventListener("click", () => { Settings.haptics = !Settings.haptics; syncSettings(); persist(); Haptics.tap(); });
    $$("#set-q button").forEach((b) => b.addEventListener("click", () => { press(); Settings.quality = b.dataset.v; Main.applyQuality(); syncSettings(); persist(); }));
    $$("#set-lang button").forEach((b) => b.addEventListener("click", () => { press(); Settings.lang = LANG = +b.dataset.v; persist(); refreshTexts(); }));
    $("#set-reset").addEventListener("click", () => { press(); $("#confirm").hidden = false; });
    $("#c-no").addEventListener("click", () => { press(); $("#confirm").hidden = true; });
    $("#c-yes").addEventListener("click", () => {
      press(); $("#confirm").hidden = true;
      eraseProgress(); Goals.ensure(); Scene.apply(Save.selected.scene); R.clearTrails();
      refreshAll(); close();
    });
    $("#ver").textContent = window.APP_VERSION || "1.0.0";
    // Cualquier toque en la interfaz cuenta como actividad (y despierta el audio)
    document.addEventListener("pointerdown", () => { Sound.wake(); activity(); }, true);
    refreshTexts();
  }
  function press() { Sound.tap(); Haptics.tap(); }

  function refreshTexts() {
    applyI18n();
    buildPicker();
    syncSettings();
    showState();
    if (sheet === "collection") renderCollection();
    if (sheet === "records") renderRecords();
    if (sheet === "howto") renderHowto();
  }
  function refreshAll() { sparks(); finaleBar(); refreshTexts(); }

  /* ---------- Inicio y modos ---------- */
  function showHome(introMode) {
    $("#home").classList.remove("hide");
    $("#home").classList.toggle("intro", !!introMode);
    $("#hud").classList.add("off");
    Input.enabled = false;
    sparks();
  }
  function revealTitle() { $("#title").classList.add("in"); }
  function revealMenu() { $("#home").classList.remove("intro"); }
  function goHome() {
    if (pickOpen) togglePicker(false);
    close();
    Game.setMode("home");
    showHome(false);
    body.classList.remove("idle");
  }
  function enter(mode) {
    Game.setMode(mode);
    $("#home").classList.add("hide");
    $("#hud").classList.remove("off");
    const zen = mode === "zen", show = mode === "show";
    $("#sparks").hidden = zen || show;
    $("#finale").hidden = zen || show;
    $("#combo").hidden = zen || show;
    $("#b-col").hidden = false;
    $("#mode-chip").hidden = !zen;
    $("#showbar").hidden = !show;
    Input.enabled = true;
    idleT = 0;
    finaleBar(); sparks(); buildPicker(); showState();
  }

  /* ---------- Inactividad: la interfaz se desvanece para dejar el cielo limpio ---------- */
  function activity() { idleT = 0; if (body.classList.contains("idle")) body.classList.remove("idle"); }
  function tick(dt) {
    idleT += dt;
    const playing = Game.mode !== "home" && !sheet;
    if (playing && !pickOpen && idleT > (Game.finale ? 1.2 : 5) && !Game.recording && !body.classList.contains("idle")) body.classList.add("idle");
    if (Game.recording) {
      const r = Game.recording;
      $("#show-status").textContent = `${t("recording")} · ${(Timers.time - r.t0).toFixed(1)} s · ${r.events.length} ${t("launches")}`;
      if (Timers.time - r.t0 > 60) Game.stopRec();
    }
  }

  /* ---------- Selector ---------- */
  // Selector de cohete: el botón muestra el elegido; la cuadrícula se abre encima y se cierra al elegir o al tocar fuera
  let pickOpen = false;
  function buildPicker() {
    const owned = TYPE_ORDER.filter((k) => Save.unlocked.types.includes(k));
    const items = owned.length > 1 ? ["mix", ...owned] : owned;
    if (!items.includes(Save.selected.type)) Save.selected.type = owned[0];
    const cur = Save.selected.type, name = (k) => (k === "mix" ? t("mix") : TYPES[k].name[LANG]);
    const btn = $("#pick-btn");
    btn.querySelector(".ci").innerHTML = iconSVG(cur);
    btn.querySelector(".nm").textContent = name(cur);
    $("#picker").classList.toggle("solo", items.length < 2);
    const grid = $("#pick-pop .pick-grid");
    grid.innerHTML = items.map((k) => `<button class="pick-it${k === cur ? " on" : ""}" data-k="${k}" type="button" role="menuitemradio" aria-checked="${k === cur}">${iconSVG(k)}<span>${name(k)}</span></button>`).join("");
    $("#pick-draw").hidden = !owned.includes("doodle");
    grid.querySelectorAll(".pick-it").forEach((b) => b.addEventListener("click", () => {
      Save.selected.type = b.dataset.k; persist();
      Sound.tap(); Haptics.tap();
      buildPicker(); togglePicker(false);
    }));
  }
  function togglePicker(open) {
    if ($("#picker").classList.contains("solo")) open = false;
    pickOpen = open === undefined ? !pickOpen : open;
    $("#picker").classList.toggle("open", pickOpen);
    $("#pick-pop").hidden = !pickOpen;
    $("#pick-btn").setAttribute("aria-expanded", String(pickOpen));
    if (pickOpen) {
      Input.enabled = false;
      const on = $("#pick-pop .pick-it.on");
      if (on) on.scrollIntoView({ block: "nearest" });
    } else setTimeout(() => { if (!pickOpen && !sheet) Input.enabled = Game.mode !== "home"; }, 0); // el toque que cerró no lanza un cohete
  }


  /* ---------- HUD ---------- */
  let shown = -1;
  function sparks() {
    const v = Math.floor(Save.sparks);
    if (v === shown) return;
    const s = fmt(v);
    $("#sparks-n").textContent = s; $("#home-sparks-n").textContent = s;
    $$(".js-sparks").forEach((n) => (n.textContent = s));
    if (shown >= 0 && v > shown) { const p = $("#sparks"); p.classList.remove("bump"); void p.offsetWidth; p.classList.add("bump"); }
    shown = v;
    if (sheet === "collection" && colTab !== "goals") renderCollection();
  }
  let flN = 0;
  function floater(x, y, n) {
    if (flN > 10) return;
    const el = document.createElement("span");
    el.className = "fl"; el.textContent = `+${Math.round(n)}`;
    el.style.left = `${x}px`; el.style.top = `${y - 12 * U}px`;
    $("#floaters").appendChild(el); flN++;
    setTimeout(() => { el.remove(); flN--; }, 1350);
  }
  function combo(n, mult) {
    const c = $("#combo");
    if (n >= 3) {
      $("#combo-n").textContent = n;
      $("#combo-x").textContent = `×${mult % 1 ? mult.toFixed(1) : mult}`;
      c.classList.add("on");
    } else c.classList.remove("on");
  }
  function comboStep() { const c = $("#combo"); c.classList.remove("step"); void c.offsetWidth; c.classList.add("step"); }
  function finaleBar() {
    const f = $("#finale"), ready = Save.finale >= 1 && Game.mode === "free" && !Game.finale;
    $("#finale-fill").style.width = `${Math.round(Save.finale * 100)}%`;
    f.classList.toggle("ready", ready);
    f.disabled = !ready;
    f.querySelector(".lbl").textContent = t("grandFinale");
  }
  function finaleReady() { finaleBar(); toast(t("finaleReady"), t("finaleTap"), "finale"); }
  function finaleState(on) { $("#finale").classList.toggle("running", on); $("#picker").style.opacity = on ? "0.35" : ""; finaleBar(); }

  /* ---------- Avisos ---------- */
  // Avisos sutiles: uno a la vez, sin repetir. Durante la Gran Final (y mientras se graba o se reproduce un show)
  // esperan su turno para no tapar el espectáculo; salen cuando termina.
  const quiet = () => Game.finale || Game.playing || !!Game.recording;
  function toast(title, sub, icon) {
    if (toastQ.some((q) => q.title === title && q.sub === sub)) return;
    toastQ.push({ title, sub, icon });
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    if (!toastQ.length) { toastBusy = false; return; }
    toastBusy = true;
    if (quiet()) { setTimeout(nextToast, 600); return; }
    const it = toastQ.shift();
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="ti">${ico(it.icon)}</span><b></b>${it.sub ? '<span class="sep">·</span><span class="ts"></span>' : ""}`;
    el.querySelector("b").textContent = it.title;
    if (it.sub) el.querySelector(".ts").textContent = it.sub;
    $("#toasts").appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
    const show = toastQ.length ? 1800 : 2400;   // si hay más esperando, cada uno dura menos
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => { el.remove(); nextToast(); }, 750); }, show);
  }


  /* ---------- Hojas ---------- */
  // Cerrar una ventanilla deslizando hacia abajo, como en iOS: desde la cabecera siempre, y desde el contenido
  // cuando ya está hasta arriba (si no, el dedo hace scroll normal). Si se suelta antes de un tercio y sin impulso, regresa.
  function sheetDrag(el) {
    const scrim = $("#scrim");
    let x0 = 0, y0 = 0, dy = 0, lastY = 0, lastT = 0, vel = 0, on = false, cand = false, body = null;
    const start = (x, y, target) => {
      body = target.closest(".sheet-body");
      cand = !!sheet && !target.closest('input[type="range"]') && (!body || body.scrollTop <= 0);
      x0 = x; y0 = lastY = y; lastT = performance.now(); dy = 0; vel = 0; on = false;
    };
    const move = (x, y, e) => {
      if (!cand) return;
      if (!on) {
        const d = y - y0;
        if (d > 8 && d > Math.abs(x - x0) * 1.2 && (!body || body.scrollTop <= 0)) {
          on = true; y0 = y; el.style.transition = "none"; scrim.style.transition = "none";
        } else if (d < -4 || Math.abs(x - x0) > 12) { cand = false; return; } else return;
      }
      if (e && e.cancelable) e.preventDefault();
      dy = Math.max(0, y - y0);
      el.style.transform = `translate(-50%, ${dy}px)`;
      scrim.style.opacity = String(1 - Math.min(1, dy / (el.offsetHeight || 1)) * 0.9);
      const now = performance.now();
      vel = (y - lastY) / Math.max(1, now - lastT); lastY = y; lastT = now;
    };
    const end = () => {
      const was = on;
      on = cand = false;
      if (!was) return;
      const shut = dy > Math.min(140, el.offsetHeight * 0.33) || vel > 0.6;
      el.style.transition = ""; el.style.transform = ""; scrim.style.transition = "";
      if (shut) {
        Haptics.tap();
        scrim.style.opacity = "0";
        close();
        setTimeout(() => { scrim.style.opacity = ""; }, 450);
      } else scrim.style.opacity = "";
    };
    el.addEventListener("touchstart", (e) => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY, e.target); else cand = on = false; }, { passive: true });
    el.addEventListener("touchmove", (e) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    // con ratón (la versión web en computadora)
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      start(e.clientX, e.clientY, e.target);
      const mm = (ev) => move(ev.clientX, ev.clientY, ev);
      const up = () => { end(); window.removeEventListener("pointermove", mm); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", mm); window.addEventListener("pointerup", up);
    });
  }
  function open(name) {
    if (pickOpen) togglePicker(false);
    close(true);
    sheet = name;
    if (name === "collection") renderCollection();
    if (name === "records") renderRecords();
    if (name === "howto") renderHowto();
    if (name === "settings") syncSettings();
    $("#scrim").classList.add("on");
    $(`#sheet-${name}`).classList.add("open");
    body.classList.remove("idle");
    Input.enabled = false;
  }
  function close(quiet) {
    if (!sheet) return;
    $(`#sheet-${sheet}`).classList.remove("open");
    sheet = null;
    if (quiet !== true) $("#scrim").classList.remove("on");
    Input.enabled = Game.mode !== "home";
    idleT = 0;
  }

  function renderCollection() {
    $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === colTab));
    const el = $("#col-body"), S = Save.sparks;
    const buyBtn = (cost) => `<button class="card-btn buy" data-buy ${S < cost ? "disabled" : ""} type="button">${SPARK}${fmt(cost)}</button>`;
    if (colTab === "fw") {
      el.innerHTML = `<div class="grid">${TYPE_ORDER.map((k) => {
        const T = TYPES[k], own = Save.unlocked.types.includes(k), sel = Save.selected.type === k, n = Save.stats.byType[k] || 0;
        return `<div class="card${own ? "" : " locked"}${sel ? " sel" : ""}" data-k="${k}">
          ${own ? "" : LOCK}<span class="ci">${iconSVG(k)}</span><h4>${T.name[LANG]}</h4><p>${T.desc[LANG]}</p>
          ${own ? `<span class="meta">${t("launched")} ${fmt(n)}</span>${k === "doodle"
            ? `<div class="card-row"><button class="card-btn${sel ? " on" : ""}" data-use type="button">${sel ? t("selected") : t("use")}</button><button class="card-btn" data-draw type="button">${t("ddDraw")}</button></div>`
            : `<button class="card-btn${sel ? " on" : ""}" data-use type="button">${sel ? t("selected") : t("use")}</button>`}` : buyBtn(T.cost)}
        </div>`;
      }).join("")}</div>`;
      el.querySelectorAll(".card").forEach((c) => {
        const k = c.dataset.k;
        c.querySelector("[data-use]")?.addEventListener("click", () => { press(); Save.selected.type = k; persist(); buildPicker(); renderCollection(); });
        c.querySelector("[data-buy]")?.addEventListener("click", () => buy("types", k, TYPES[k].cost, TYPES[k].name[LANG], k, () => {
          Save.selected.type = k; buildPicker();
          if (k === "doodle") setTimeout(() => Doodle.show(() => { buildPicker(); renderCollection(); }), 500);  // recién comprado: a dibujar
        }));
        c.querySelector("[data-draw]")?.addEventListener("click", () => { press(); Doodle.show(() => { buildPicker(); renderCollection(); }); });
      });
    } else if (colTab === "pal") {
      el.innerHTML = `<div class="grid">${PALETTE_ORDER.map((k) => {
        const p = PALETTES[k], own = Save.unlocked.palettes.includes(k), sel = Save.selected.palette === k;
        const sw = p.colors.map((c) => { const css = `rgb(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(",")})`; return `<i style="background:${css};color:${css}"></i>`; }).join("");
        return `<div class="card${own ? "" : " locked"}${sel ? " sel" : ""}" data-k="${k}">${own ? "" : LOCK}<h4>${p.name[LANG]}</h4><div class="swatches">${sw}</div><p></p>
          ${own ? `<button class="card-btn${sel ? " on" : ""}" data-use type="button">${sel ? t("selected") : t("use")}</button>` : buyBtn(p.cost)}</div>`;
      }).join("")}</div>`;
      el.querySelectorAll(".card").forEach((c) => {
        const k = c.dataset.k;
        c.querySelector("[data-use]")?.addEventListener("click", () => { press(); Save.selected.palette = k; persist(); renderCollection(); });
        c.querySelector("[data-buy]")?.addEventListener("click", () => buy("palettes", k, PALETTES[k].cost, PALETTES[k].name[LANG], "classic", () => { Save.selected.palette = k; }));
      });
    } else if (colTab === "scn") {
      // "Tu foto" va primero: siempre disponible, gratis
      const ph = Photo.ready, phSel = ph && Save.selected.scene === "photo";
      const photoCard = `<div class="card scene photo${phSel ? " sel" : ""}" data-photo>
          <div class="thumb${ph ? "" : " empty"}"${ph ? ` style="background-image:url(${Photo.thumb()})"` : ""}>${ph ? "" : PHOTO_ICON}</div>
          <h4>${t("phTitle")}</h4>
          ${ph ? `<div class="card-row"><button class="card-btn${phSel ? " on" : ""}" data-use type="button">${phSel ? t("selected") : t("use")}</button><button class="card-btn" data-edit type="button">${t("phEdit")}</button></div>`
               : `<button class="card-btn buy" data-choose type="button">${t("phChoose")}</button>`}
        </div>`;
      el.innerHTML = `<div class="grid">${photoCard}${SCENE_ORDER.map((k) => {
        const s = SCENES[k], own = Save.unlocked.scenes.includes(k), sel = Save.selected.scene === k;
        if (!thumbs[k]) thumbs[k] = Scene.thumb(k, 320, 200);
        return `<div class="card scene${own ? "" : " locked"}${sel ? " sel" : ""}" data-k="${k}"><div class="thumb" style="background-image:url(${thumbs[k]})"></div><h4>${s.name[LANG]}</h4>
          ${own ? `<button class="card-btn${sel ? " on" : ""}" data-use type="button">${sel ? t("selected") : t("use")}</button>` : buyBtn(s.cost)}</div>`;
      }).join("")}</div>`;
      el.querySelectorAll(".card[data-k]").forEach((c) => {
        const k = c.dataset.k;
        const pickScene = () => { Save.selected.scene = k; persist(); Scene.apply(k); R.clearTrails(); };
        c.querySelector("[data-use]")?.addEventListener("click", () => { press(); pickScene(); renderCollection(); });
        c.querySelector("[data-buy]")?.addEventListener("click", () => buy("scenes", k, SCENES[k].cost, SCENES[k].name[LANG], "willow", pickScene));
      });
      const pc = el.querySelector("[data-photo]");
      pc.querySelector("[data-choose]")?.addEventListener("click", () => { press(); Photo.choose(); });
      pc.querySelector("[data-edit]")?.addEventListener("click", () => { press(); Photo.edit(); });
      pc.querySelector("[data-use]")?.addEventListener("click", () => { press(); Save.selected.scene = "photo"; persist(); Scene.apply("photo"); R.clearTrails(); renderCollection(); });
    } else renderGoals();
  }
  function renderGoals() {
    Goals.ensure();
    const el = $("#col-body");
    el.innerHTML = Save.goals.map((g) => `<div class="goal${g.done ? " done" : ""}"><span class="ci">${ico(Goals.icon(g))}</span>
      <span class="gt"><b>${Goals.text(g)}</b><span class="bar"><i style="width:${Math.round((g.p / g.n) * 100)}%"></i></span><span class="pc">${fmt(g.p)} / ${fmt(g.n)}</span></span>
      <span class="rw">${SPARK}${g.reward}</span></div>`).join("") +
      `<p class="note">${LANG ? "Al cumplir uno, aparece otro nuevo. Los retos solo cuentan en Juego libre." : "Finish one and a new one appears. Goals count in Free Play."}</p>`;
  }
  function goals() { if (sheet === "collection" && colTab === "goals") renderGoals(); }

  function buy(kind, k, cost, name, icon, after) {
    if (!Game.spend(cost)) return;
    Save.unlocked[kind].push(k);
    after && after();
    persist(true);
    toast(t("unlocked"), name, icon);
    Sound.melody([57, 62, 66, 69, 74], 0.1, 0.28);
    Haptics.success();
    renderCollection();
  }

  function renderRecords() {
    const s = Save.stats;
    const fav = Object.entries(s.byType).sort((a, b) => b[1] - a[1])[0];
    const st = (v, k) => `<div class="stat"><b>${v}</b><span>${t(k)}</span></div>`;
    $("#rec-body").innerHTML = `<div class="stats">
      ${fav ? `<div class="stat wide"><span class="ci">${iconSVG(fav[0])}</span><span><b>${TYPES[fav[0]].name[LANG]}</b><span>${t("rFavorite")}</span></span></div>` : ""}
      ${st(fmt(s.launches), "rLaunches")}${st(fmt(s.bestCombo), "rBestCombo")}
      ${st(fmt(s.finales), "rFinales")}${st(fmt(s.earned), "rSparks")}
      ${st(`${Save.discovered.length}/${TYPE_ORDER.length}`, "rDiscovered")}${st(fmt(s.goals), "rGoals")}
      ${st(fmt(s.charged), "rCharged")}
    </div>`;
  }
  function renderHowto() {
    const it = [["tap", "hTap", "hTapD"], ["hold", "hHold", "hHoldD"], ["swipe", "hSwipe", "hSwipeD"], ["multi", "hMulti", "hMultiD"], ["combo", "hCombo", "hComboD"], ["finale", "hFinale", "hFinaleD"]];
    $("#how-body").innerHTML = it.map(([i, a, b]) => `<div class="how"><span class="ci">${svg(HOW_ICONS[i])}</span><span><b>${t(a)}</b><p>${t(b)}</p></span></div>`).join("");
  }
  function syncSettings() {
    const v = $("#set-vib"), na = !Haptics.available();
    v.hidden = na; $("#vib-na").hidden = !na;
    v.setAttribute("aria-checked", String(!!Settings.haptics));
    $$("#set-q button").forEach((b) => b.classList.toggle("on", b.dataset.v === Settings.quality));
    $$("#set-lang button").forEach((b) => b.classList.toggle("on", +b.dataset.v === LANG));
  }

  /* ---------- Show Creator ---------- */
  function showState() {
    if (Game.mode !== "show") return;
    const slots = $("#slots");
    slots.innerHTML = [0, 1, 2].map((i) => {
      const s = Save.shows[i];
      return `<button class="slot${Save.showSlot === i ? " on" : ""}" data-i="${i}" type="button">${t("slot")} ${i + 1}${s ? ` <small>${s.events.length}</small>` : ""}</button>`;
    }).join("");
    slots.querySelectorAll(".slot").forEach((b) => b.addEventListener("click", () => {
      press(); if (Game.recording) Game.stopRec(); if (Game.playing) Game.stopShow();
      Save.showSlot = +b.dataset.i; persist(); showState();
    }));
    const cur = Save.shows[Save.showSlot], rec = !!Game.recording, play = Game.playing;
    const rb = $("#s-rec"), pb = $("#s-play");
    rb.classList.toggle("on", rec);
    rb.querySelector("span").textContent = rec ? t("stop") : t("record");
    rb.querySelector("svg").innerHTML = rec ? '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>' : '<circle cx="12" cy="12" r="5.5" fill="currentColor"/>';
    pb.disabled = !cur || rec;
    pb.querySelector("span").textContent = play ? t("stop") : t("playShow");
    pb.querySelector("svg").innerHTML = play ? '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>' : '<path d="M8.5 6.5v11l9-5.5z" fill="currentColor"/>';
    $("#s-clear").disabled = !cur || rec || play;
    $("#show-status").textContent = rec ? `${t("recording")}…` : cur ? `${t("slot")} ${Save.showSlot + 1} · ${cur.events.length} ${t("launches")} · ${Math.round(cur.dur)} s` : t("showHint");
  }

  // Al terminar el editor de "Tu foto": cerrar la Colección para ver el cielo nuevo
  function photoSaved() { close(); toast(t("phReady"), "", "classic"); }

  return {
    photoSaved,
    init, showHome, revealTitle, revealMenu, enter, goHome, activity, tick,
    sparks, floater, combo, comboStep, finaleBar, finaleReady, finaleState, toast, goals, showState,
    get sheet() { return sheet; },
  };
})();
