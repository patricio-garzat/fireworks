"use strict";
/* main.js: arranque, tamaño, calidad automática, bucle principal y las intros (BluBer y Fireworks). */

const Main = (() => {
  const cv = $("#gl"), ov = $("#ov");
  let last = 0, raf = 0, time = 0, started = false;
  let qAvg = 1 / 60, qT = 0, qGood = 0;

  const dprFor = (l) => { const d = window.devicePixelRatio || 1; return l === 2 ? Math.min(d, 2) : l === 1 ? Math.min(d, 1.5) : Math.min(d, 1); };
  const capFor = (l) => [6000, 10000, 16000][l];

  function resize() {
    VW = Math.max(1, window.innerWidth); VH = Math.max(1, window.innerHeight);
    U = clamp(Math.min(VW, VH * 0.62) / 390, 0.75, 2.4);
    R.resize(VW, VH, dprFor(Q.level));
    Input.resize();
    Scene.apply(Save.selected.scene);
  }
  function applyQuality() {
    const s = Settings.quality;
    Q.auto = s === "auto";
    if (!Q.auto) Q.level = s === "high" ? 2 : s === "med" ? 1 : 0;
    P.cap = capFor(Q.level);
    qT = 0; qGood = 0;
    resize();
  }
  // Calidad automática: si el promedio baja de ~46 fps, un paso abajo; si va sobrado mucho tiempo, uno arriba
  function autoQuality(dt) {
    if (!Q.auto) return;
    qAvg = qAvg * 0.96 + dt * 0.04;
    qT += dt;
    if (qT < 4) return;
    if (qAvg > 1 / 46 && Q.level > 0) { Q.level--; P.cap = capFor(Q.level); resize(); qT = 0; qGood = 0; return; }
    if (qAvg < 1 / 58) { qGood += dt; if (qGood > 30 && Q.level < 2) { Q.level++; P.cap = capFor(Q.level); resize(); qT = 0; qGood = 0; } }
    else qGood = 0;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) return;
    step(Math.min(dt, 1 / 24));
  }
  function step(dt) {
    time += dt;
    Timers.update(dt);
    Input.update(dt);
    Game.update(dt);
    P.update(dt);
    Smoke.update(dt);
    Lights.update(dt);
    R.render(dt, time);
    UI.tick(dt);
    autoQuality(dt);
  }
  function run() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  function start() {
    if (started) return;
    started = true;
    if (!R.init(cv)) { $("#nogl").hidden = false; $("#home").hidden = true; return; }
    UI.init();
    Photo.init();
    // "Tu foto" vive en IndexedDB: se carga sin bloquear el arranque y, si es el escenario elegido, se pinta
    Photo.load().then((ok) => { if (ok && Save.selected.scene === "photo") { Scene.apply("photo"); R.clearTrails(); } });
    Input.init($("#surface"), ov);
    Goals.ensure();
    Game.setMode("intro");
    applyQuality();
    UI.showHome(true);
    run();
    if (isNative()) Sound.wake();
    playStudio($("#studio"), gameIntro);

    let rt = 0;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { stop(); Sound.suspend(); persist(true); }
      else { run(); Sound.resume(); }
    });
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); R.lose(); });
    cv.addEventListener("webglcontextrestored", () => { if (R.init(cv)) resize(); });
  }

  // Intro de Fireworks: un cohete sube al centro y, al abrirse, aparece el título
  function gameIntro() {
    Game.intro(() => UI.revealTitle());
    setTimeout(() => { UI.revealMenu(); Game.setMode("home"); }, 3600);
  }

  return { start, applyQuality, resize, run, stop, step };
})();

/* ---------- Intro del estudio (copiada de Cube Swipe / SMUSH!): el oso aparece, "BluBer" sube letra por letra,
   "GAMES" se abre, brillo y parpadeo. 4 s sobre blanco, no se puede saltar. Suena con sonidos del juego:
   un estallido lejano y suave cuando aparece el oso y el chisporroteo de las chispas con el brillo. ---------- */
function nativeBar(dark) {
  try { const sb = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.StatusBar; if (sb) sb.setStyle({ style: dark ? "DARK" : "LIGHT" }); } catch (e) {}
}
function playStudio(el, next) {
  const q = (id) => document.getElementById(id);
  const easeOutC = "cubic-bezier(.16,1,.3,1)", inOut = "cubic-bezier(.65,0,.35,1)";
  const tl = (node, frames, delay, duration, easing = easeOutC, fill = "both") => {
    node.style.transformBox = "fill-box";
    return node.animate(frames, { delay, duration, easing, fill });
  };
  const setBarColor = (col) => {
    const root = document.documentElement, c = col || "#04060F";
    root.style.backgroundColor = c;
    document.body.style.backgroundColor = col;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", c));
  };
  const finish = () => {
    document.documentElement.classList.remove("studio-paper");
    document.querySelectorAll(".fixed-off").forEach((n) => n.classList.remove("fixed-off"));
    setBarColor("");
    nativeBar(true);
    next();
    const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    out.onfinish = () => el.remove();
  };
  let begun = false;
  const begin = () => {
    if (begun) return;
    begun = true;
    el.classList.add("paper");
    nativeBar(false);
    if (isNative()) { setTimeout(run, 200); return; }
    document.documentElement.classList.add("studio-paper");
    document.querySelectorAll("body *").forEach((n) => { if (n !== el && !el.contains(n) && getComputedStyle(n).position === "fixed") n.classList.add("fixed-off"); });
    setBarColor("#FFFFFF");
    setTimeout(run, 450);
  };
  if (document.readyState === "complete") setTimeout(begin, 250);
  else window.addEventListener("load", () => setTimeout(begin, 250), { once: true });
  setTimeout(begin, 2500);
  function run() {
    if (!el.isConnected) return;
    setTimeout(() => Sound.boom(0.45, 0, { crack: 0, gain: 0.5, low: 78, body: 900 }), 250);
    setTimeout(() => Sound.sizzle(1.6, 0, 0.55), 2750);
    if (reduceMotion || !el.animate) { el.classList.add("go"); setTimeout(finish, 1600); return; }
    const ws = q("bb-word-shape");
    el.querySelectorAll("#bb-word path").forEach((l) => ws.appendChild(l.cloneNode()));
    const all = q("bb-all"); all.style.transformOrigin = "center";
    tl(all, [{ transform: "scale(0.955)" }, { transform: "scale(1)" }], 0, 4000, "cubic-bezier(.22,.6,.2,1)");
    const bear = q("bb-bear"); bear.style.transformOrigin = "50% 100%";
    tl(bear, [{ transform: "translateY(19px) scale(0.965)", opacity: 0 }, { transform: "none", opacity: 1 }], 250, 1000, "cubic-bezier(.25,.1,.25,1)");
    el.querySelectorAll("#bb-word path").forEach((l, i) => tl(l, [{ transform: "translateY(340px)" }, { transform: "translateY(0)" }], 1200 + i * 70, 760));
    const gm = [...el.querySelectorAll("#bb-games path")], boxes = gm.map((g) => g.getBBox());
    const cx = (boxes[0].x + boxes[4].x + boxes[4].width) / 2;
    gm.forEach((g, i) => {
      const dx = (cx - (boxes[i].x + boxes[i].width / 2)) * 0.75;
      tl(g, [{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], 1950 + Math.abs(i - 2) * 70, 800);
    });
    tl(q("bb-sweep"), [{ transform: "translateX(0) skewX(-18deg)" }, { transform: "translateX(2230px) skewX(-18deg)" }], 2800, 900, inOut);
    tl(bear, [{ transform: "rotate(0deg)" }, { transform: "rotate(-2.6deg)", offset: 0.45 }, { transform: "rotate(-2.6deg)", offset: 0.65 }, { transform: "rotate(0deg)" }], 2700, 1000, inOut, "none");
    const eye = q("bb-eye"); eye.style.transformOrigin = "center";
    tl(eye, [{ transform: "scaleY(1)" }, { transform: "scaleY(0.12)", offset: 0.5 }, { transform: "scaleY(1)" }], 3250, 200, "ease-in-out", "none");
    el.classList.add("go");
    setTimeout(finish, 4000);
  }
}

Main.start();
