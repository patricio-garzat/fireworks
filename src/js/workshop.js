"use strict";
/* workshop.js: el Taller de fuegos. La persona diseña los suyos (hasta 6): forma (de las que ya desbloqueó),
   dos colores, el final (simple, crepitante, brillos, se divide o cambia de color), la cola (dorada, plateada,
   crepitante, tenue o en espiral), silbido y tamaño, con su nombre. "Probar" lo lanza en el cielo mientras se diseña.
   Cada creación se registra como un tipo más (TYPES["c…"]) y aparece en el selector, en "Mis fuegos".
   Se guardan en Save.customs.
   - "Tu dibujo" es una forma más (si ya se desbloqueó): cada diseño guarda su propio dibujo (spec.doodle) y lo combina
     con el final, la cola, el silbido, los colores y el tamaño. Solo se dibuja aquí (pedido del usuario, 18 oct 2026:
     antes había un botón aparte y confundía). El ícono del diseño es su dibujo. */

const Workshop = (() => {
  const MAX = 6;
  const SHAPES = ["classic", "ring", "willow", "palm", "chrysanthemum", "dahlia", "ghost", "spiral", "crossette", "horsetail", "strobe", "fish", "flowers", "heart", "star", "saturn", "jelly", "doodle"];
  const COLORS = ["red", "coral", "orange", "amber", "gold", "yellow", "lime", "green", "mint", "teal", "cyan", "ice", "blue", "violet", "purple", "magenta", "pink", "rosegold", "warm", "silver", "white"];
  const ENDS = ["none", "crackle", "glitter", "split", "shift"];
  const TAILS = ["gold", "glitter", "crackle", "dim", "spiral"];
  const SIZES = { s: 0.8, m: 1, l: 1.25 };
  const css = (c) => `rgb(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(",")})`;

  /* ---------- Del diseño a un tipo de fuego ---------- */
  // El final elegido se aplica a las estrellas que acaba de crear la forma (las nuevas quedan al final del pool)
  function applyEnd(n0, end, c2, pan) {
    let L = 0, k = 0;
    for (let i = n0; i < P.n; i++) {
      if (P.kind[i] !== K_STAR) continue;
      const life = P.life[i];
      L += life; k++;
      if (end === "crackle") P.flags[i] |= F_CRACKLE;
      else if (end === "split") { P.flags[i] |= F_SPLIT; P.ev[i] = life * 0.82; }
      else if (end === "shift") { P.r2[i] = c2[0]; P.g2[i] = c2[1]; P.b2[i] = c2[2]; P.tchg[i] = 0.5; P.flags[i] |= F_SHIFT; }
      else if (end === "glitter") { P.flags[i] |= F_GLITTRAIL; P.setTrail(i, 12, 0.95, 0.95, 1, 0.9, 18); }
    }
    const avgLife = k ? L / k : 1.8;
    if (end === "crackle") Sound.crackle(1.2, pan, avgLife * 0.95);
    else if (end === "split") Sound.crackle(0.45, pan, avgLife * 0.8);
    else if (end === "glitter") Sound.sizzle(2.4, pan, 0.55, 0.3);
  }
  function makeType(spec) {
    const base = TYPES[spec.shape] || TYPES.classic, c1 = C[spec.c1] || C.gold, c2 = C[spec.c2] || C.silver, size = SIZES[spec.size] || 1;
    const pal = { colors: [c1, c2], metal: c1, heart: c1 };
    return {
      custom: true, cost: -2, name: [spec.name, spec.name], desc: ["", ""], shape: spec.shape,
      flight: spec.tail === "spiral" ? "spiral" : undefined,
      tail: spec.tail === "spiral" ? undefined : spec.tail,
      rise: spec.whistle ? { air: 0.035, whistle: 0.04, f0: 760, f1: 1200, tone: spec.tail === "spiral" } : { air: 0.05, whistle: 0 },
      burst(x, y, o, pan) {
        const n0 = P.n;
        const res = base.burst(x, y, { ...o, power: o.power * size, colors: [c1, c2], pal, tip: spec.end, strokes: spec.doodle }, pan);
        applyEnd(n0, spec.end, c2, pan);
        return res;
      },
      sound(p, pan) { base.sound(p * size, pan); },
    };
  }
  const iconFor = (spec) => (spec.shape === "doodle" ? Doodle.icon(spec.doodle) : ICON[spec.shape] || ICON.classic);
  // Registra (o vuelve a registrar) todas las creaciones guardadas como tipos
  function register() {
    migrate();
    for (const k of Object.keys(TYPES)) if (TYPES[k].custom) { delete TYPES[k]; delete ICON[k]; }
    (Save.customs || []).forEach((spec) => { TYPES[spec.id] = makeType(spec); ICON[spec.id] = iconFor(spec); });
  }
  // Antes "Tu dibujo" era un solo dibujo (Save.doodle) que se elegía en el selector: la primera vez se vuelve un diseño
  function migrate() {
    if (Save.doodleMoved) return;
    Save.doodleMoved = true;
    if (Doodle.valid(Save.doodle) && (Save.customs || []).length < MAX) {
      const spec = { id: "c" + Date.now().toString(36), name: ["My drawing", "Mi dibujo"][LANG], shape: "doodle", doodle: Save.doodle,
        c1: "gold", c2: "warm", end: "none", tail: "gold", whistle: true, size: "m" };
      Save.customs = [...(Save.customs || []), spec];
      if (Save.selected.type === "doodle") Save.selected.type = spec.id;
    }
    persist();
  }
  const ids = () => (Save.customs || []).map((s) => s.id);
  const color = (k) => { const s = (Save.customs || []).find((x) => x.id === k); return s ? css(C[s.c1] || C.gold) : ""; };

  /* ---------- El panel del Taller ---------- */
  let edit = null;   // el diseño que se está editando (copia), o null en la lista
  const el = (id) => document.getElementById(id);

  function fresh() {
    const owned = SHAPES.filter((k) => Save.unlocked.types.includes(k));
    return { id: "", name: t("wsDefaultName"), shape: owned[0] || "classic", c1: "gold", c2: "silver", end: "none", tail: "gold", whistle: false, size: "m" };
  }
  function render() {
    const body = el("ws-body");
    if (!edit) {
      const list = Save.customs || [];
      body.innerHTML = `<p class="ws-hint">${t("wsHint")}</p><div class="grid">${list.map((s) => `
        <button class="card ws-item" data-id="${s.id}" type="button">
          <span class="ci" style="color:${css(C[s.c1] || C.gold)}">${iconSVG(s.id)}</span><h4></h4>
          <span class="swatches"><i style="background:${css(C[s.c1] || C.gold)}"></i><i style="background:${css(C[s.c2] || C.silver)}"></i></span>
        </button>`).join("")}
        ${list.length < MAX ? `<button class="card ws-new" type="button"><span class="ci">${PLUS}</span><h4>${t("wsNew")}</h4><p>${t("wsUpTo")}</p></button>` : ""}
      </div>`;
      body.querySelectorAll(".ws-item").forEach((b, i) => {
        b.querySelector("h4").textContent = list[i].name;
        b.addEventListener("click", () => { tap(); edit = { ...list[i] }; render(); });
      });
      body.querySelector(".ws-new")?.addEventListener("click", () => { tap(); edit = fresh(); render(); });
      return;
    }
    const e = edit, owned = (k) => Save.unlocked.types.includes(k);
    const seg = (key, opts, lbl) => `<div class="seg ws-seg" data-key="${key}">${opts.map((v) => `<button type="button" data-v="${v}" class="${e[key] === v ? "on" : ""}">${t(lbl + v)}</button>`).join("")}</div>`;
    const sw = (key) => `<div class="ws-sw" data-key="${key}">${COLORS.map((c) => `<button type="button" data-v="${c}" class="${e[key] === c ? "on" : ""}" style="--c:${css(C[c])}" aria-label="${c}"></button>`).join("")}</div>`;
    body.innerHTML = `
      <label class="ws-lbl">${t("wsName")}</label>
      <input id="ws-name" class="ws-name" type="text" maxlength="18" autocomplete="off" spellcheck="false">
      <label class="ws-lbl">${t("wsShape")}</label>
      <div class="ws-shapes">${SHAPES.map((k) => `<button type="button" data-v="${k}" class="${e.shape === k ? "on" : ""}" ${owned(k) ? "" : "disabled"}>${iconSVG(k)}<span>${TYPES[k].name[LANG]}</span></button>`).join("")}</div>
      ${e.shape === "doodle" ? `<div class="ws-draw"><button class="ws-dd" id="ws-dd" type="button" aria-label="${t("wsDraw")}"><canvas></canvas><span class="dd-empty"${Doodle.valid(e.doodle) ? " hidden" : ""}>${t("ddEmpty")}</span></button>
        <button class="sbtn" id="ws-draw" type="button">${PENCIL}<span>${t(Doodle.valid(e.doodle) ? "wsRedraw" : "wsDraw")}</span></button></div>` : ""}
      <label class="ws-lbl">${t("wsColor1")}</label>${sw("c1")}
      <label class="ws-lbl">${t("wsColor2")}</label>${sw("c2")}
      <label class="ws-lbl">${t("wsEnd")}</label>${seg("end", ENDS, "wsE_")}
      <label class="ws-lbl">${t("wsTail")}</label>${seg("tail", TAILS, "wsT_")}
      <div class="ws-row"><span>${t("wsWhistle")}</span><button id="ws-whistle" class="switch" type="button" role="switch" aria-checked="${e.whistle}"><i></i></button></div>
      <label class="ws-lbl">${t("wsSize")}</label>${seg("size", ["s", "m", "l"], "wsS_")}
      <div class="ws-actions">
        ${e.id ? `<button class="sbtn icon-only" id="ws-del" type="button" aria-label="${t("wsDelete")}">${TRASH}</button>` : ""}
        <button class="sbtn" id="ws-try" type="button">${SPARKLE}<span>${t("wsTry")}</span></button>
        <button class="ph-btn gold" id="ws-save" type="button">${t("wsSave")}</button>
      </div>`;
    const name = el("ws-name");
    name.value = e.name;
    name.addEventListener("input", () => { e.name = name.value; });
    body.querySelectorAll(".ws-shapes button").forEach((b) => b.addEventListener("click", () => {
      tap();
      const was = e.shape;
      e.shape = b.dataset.v;
      if ((was === "doodle") !== (e.shape === "doodle")) rerender(); else mark(b);
      if (e.shape === "doodle" && !Doodle.valid(e.doodle)) draw();   // la primera vez, directo a dibujar
      else tryIt();
    }));
    if (e.shape === "doodle") {
      preview(body.querySelector(".ws-dd canvas"), e.doodle);
      el("ws-dd").addEventListener("click", () => { tap(); draw(); });
      el("ws-draw").addEventListener("click", () => { tap(); draw(); });
    }
    body.querySelectorAll(".ws-sw").forEach((row) => row.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { tap(); e[row.dataset.key] = b.dataset.v; mark(b); })));
    body.querySelectorAll(".ws-seg").forEach((row) => row.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { tap(); e[row.dataset.key] = b.dataset.v; mark(b); })));
    el("ws-whistle").addEventListener("click", () => { tap(); e.whistle = !e.whistle; el("ws-whistle").setAttribute("aria-checked", String(e.whistle)); });
    el("ws-try").addEventListener("click", () => { tap(); tryIt(); });
    el("ws-save").addEventListener("click", () => { tap(); save(); });
    el("ws-del")?.addEventListener("click", () => { tap(); remove(); });
  }
  function mark(b) { b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); }
  // Volver a pintar el editor sin perder dónde iba el scroll
  function rerender() { const sc = el("ws-body").closest(".sheet-body") || el("ws-body"), top = sc.scrollTop; render(); sc.scrollTop = top; }
  // Dibujar (o editar el dibujo) del diseño; al terminar se ve en la vista previa y se prueba en el cielo
  function draw() {
    const e = edit;
    Doodle.edit(e.doodle, (strokes) => {
      if (edit !== e) return;
      if (strokes) e.doodle = strokes;
      rerender();
      if (Doodle.valid(e.doodle)) tryIt();
    });
  }
  // La vista previa del dibujo: luz dorada sobre noche, como la pantalla para dibujar
  function preview(cv, strokes) {
    if (!cv) return;
    const w = 120, h = 84, dpr = Math.min(window.devicePixelRatio || 1, 3), g = cv.getContext("2d");
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px";
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!Doodle.valid(strokes)) return;
    const s = h * 0.4;
    g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 2;
    strokes.forEach((st, i) => {
      const col = i % 2 ? "255,214,150" : "255,236,200";
      g.shadowColor = `rgba(${col},0.9)`; g.shadowBlur = 6; g.strokeStyle = `rgba(${col},0.95)`;
      g.beginPath();
      st.forEach(([x, y], j) => (j ? g.lineTo(w / 2 + x * s, h / 2 + y * s) : g.moveTo(w / 2 + x * s, h / 2 + y * s)));
      if (st.length === 1) g.lineTo(w / 2 + st[0][0] * s + 0.1, h / 2 + st[0][1] * s);
      g.stroke();
    });
  }
  // Desde la Colección ("Dibujar en el Taller") o al comprar "Tu dibujo": un diseño nuevo con esa forma, directo a dibujar
  function startDoodle() {
    if ((Save.customs || []).length >= MAX) { edit = null; render(); return; }
    edit = { ...fresh(), shape: "doodle", name: ["My drawing", "Mi dibujo"][LANG] };
    render();
    el("ws-back").hidden = false;
    draw();
  }
  const tap = () => { Sound.tap(); Haptics.tap(); };

  // Probar: se lanza arriba, donde se ve encima del panel
  function tryIt() {
    if (!edit) return;
    TYPES.c_try = makeType({ ...edit, name: edit.name || "" });
    ICON.c_try = iconFor(edit);
    Game.launch(VW * rand(0.4, 0.6), VH * 0.17, "c_try", 1.05, { auto: true });
  }
  function save() {
    const e = edit;
    e.name = (e.name || "").trim() || t("wsDefaultName");
    Save.customs = Save.customs || [];
    if (!e.id) { e.id = "c" + Date.now().toString(36); Save.customs.push(e); }
    else Save.customs = Save.customs.map((s) => (s.id === e.id ? e : s));
    Save.selected.type = e.id;
    persist();
    register();
    edit = null;
    render();
    UI.refreshPicker();
    Haptics.success();
  }
  function remove() {
    Save.customs = (Save.customs || []).filter((s) => s.id !== edit.id);
    if (Save.selected.type === edit.id) Save.selected.type = "mix";
    persist();
    register();
    edit = null;
    render();
    UI.refreshPicker();
  }
  // El botón de atrás del panel: de editar a la lista; de la lista, cierra
  function back() { if (edit) { edit = null; render(); return true; } return false; }

  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
  const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7"/></svg>';
  const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17c2-5 4-6 5.5-3s3 3.5 5-1 3.5-5.5 5.5-4"/><path d="M15.5 4.5l3 3M17 3l3 3-1.5 1.5-3-3z"/></svg>';
  const SPARKLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l1.9 6.2 6.3 1.9-6.3 2-1.9 6.3-1.9-6.3-6.3-2 6.3-1.9z" fill="currentColor"/></svg>';

  return { register, render, back, ids, color, startDoodle, open() { edit = null; render(); }, get editing() { return !!edit; } };
})();
