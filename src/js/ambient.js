"use strict";
/* ambient.js: vida sutil en el escenario, en su propia capa 2D encima del cielo.
   - Pájaros que cruzan despacio a lo lejos, de vez en cuando: parvada en V, gaviotas que planean o un halcón.
     Siluetas chicas en la parte baja del cielo (donde es más clara), con un borde tenue de luz de luna.
   - Luces rojas de antenas y torres que parpadean, y el haz del faro que gira.
   - Alguna estrella fugaz, y nieve que cae en el pueblo nevado.
   - Ventanas de la ciudad que se prenden y se apagan con el tiempo, y autos que cruzan el puente (con su reflejo).
   Nada interrumpe: son chicos, lentos y poco frecuentes. Con "reducir movimiento" no hay pájaros, estrellas fugaces
   ni nieve; las luces siguen, más tranquilas. Cada escenario dice qué lleva en scenes.js (Scene.apply → setScene). */

const Ambient = (() => {
  let cv, g, dpr = 1, sc = {};
  let flocks = [], meteors = [], flakes = [], cars = [], wins = [], nextBird = 0, nextMeteor = 0, nextCar = [0, 0], nextWin = 0, t = 0, drew = false;

  function init(canvas) { cv = canvas; g = cv.getContext("2d"); }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
    drew = true;
    if (sc.snow) makeSnow();
  }
  function setScene(data) {
    sc = data || {};
    flocks = []; meteors = []; flakes = []; cars = [];
    nextBird = rand(10, 22); nextMeteor = rand(18, 40); nextCar = [rand(0, 1.5), rand(0.5, 2.5)]; nextWin = rand(1, 3);
    wins = (sc.wins || []).map((w) => ({ ...w, a: 0, on: chance(0.3), warm: chance(0.85) }));
    if (sc.deck) for (let k = 0; k < 4; k++) cars.push(newCar(k % 2, rand(VW)));
    if (sc.snow) makeSnow();
    drew = true;
  }

  /* ---------- Pájaros ---------- */
  function spawnBirds() {
    const kind = sc.birds, dir = chance(0.5) ? 1 : -1;
    const [y0, y1] = sc.birdY || [0.4, 0.58];
    const speed = (kind === "gull" ? rand(26, 36) : kind === "hawk" ? rand(20, 28) : rand(30, 42)) * U;
    const n = kind === "geese" ? randi(5, 9) : kind === "gull" ? randi(1, 3) : 1;
    const size = (kind === "geese" ? rand(4, 5.5) : kind === "gull" ? rand(6, 8) : rand(7, 9)) * U;
    const birds = [];
    for (let i = 0; i < n; i++) {
      // en V: el líder adelante y los demás atrás, alternando de lado
      const rank = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      const off = kind === "geese" ? [-rank * 13 * U * dir, side * rank * 7 * U] : [-i * rand(28, 48) * U * dir, rand(-16, 16) * U];
      birds.push({ dx: off[0], dy: off[1], ph: rand(TAU), rate: kind === "geese" ? rand(4.2, 5) : rand(2.3, 3) });
    }
    flocks.push({ kind, x: dir > 0 ? -70 * U : VW + 70 * U, y: VH * rand(y0, y1), dir, speed, size, birds, bob: rand(TAU) });
  }
  // Silueta: dos alas en "M" suave. flap va de -1 (abajo) a 1 (arriba)
  function wing(x, y, s, flap) {
    const up = -flap * s * 0.55;
    g.moveTo(x - s, y + up);
    g.quadraticCurveTo(x - s * 0.45, y + up * 0.2 - s * 0.18, x, y + s * 0.12);
    g.quadraticCurveTo(x + s * 0.45, y + up * 0.2 - s * 0.18, x + s, y + up);
  }
  function drawFlock(f) {
    const pts = f.birds.map((b) => {
      // las gaviotas y el halcón planean un rato con las alas quietas y luego aletean
      const glide = f.kind !== "geese" && Math.sin(t * 0.55 + b.ph) > -0.2;
      const flap = glide ? 0.18 + 0.06 * Math.sin(t * 1.3 + b.ph) : Math.sin(t * b.rate * TAU * 0.5 + b.ph);
      return [f.x + b.dx, f.y + b.dy + Math.sin(t * 0.7 + f.bob + b.ph * 0.3) * 3 * U, flap];
    });
    g.lineCap = "round"; g.lineJoin = "round";
    // borde de luz de luna (muy tenue) y la silueta encima
    g.lineWidth = Math.max(1, f.size * 0.3);
    g.strokeStyle = "rgba(150,170,215,0.10)";
    g.beginPath(); pts.forEach(([x, y, fl]) => wing(x, y - 0.6, f.size, fl)); g.stroke();
    g.lineWidth = Math.max(1, f.size * 0.22);
    g.strokeStyle = "rgba(5,8,18,0.88)";
    g.beginPath(); pts.forEach(([x, y, fl]) => wing(x, y, f.size, fl)); g.stroke();
  }

  /* ---------- Estrella fugaz ---------- */
  function newMeteor() {
    const dir = chance(0.5) ? 1 : -1, ang = rand(0.3, 0.65), sp = rand(380, 520) * U;
    return { x: VW * rand(0.15, 0.85), y: VH * rand(0.04, 0.28), vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp, len: rand(60, 110) * U, life: rand(0.5, 0.8), t: 0 };
  }
  function drawMeteor(m) {
    const k = Math.sin((Math.PI * m.t) / m.life), hx = m.x + m.vx * m.t, hy = m.y + m.vy * m.t;
    const n = Math.hypot(m.vx, m.vy), tx = hx - (m.vx / n) * m.len, ty = hy - (m.vy / n) * m.len;
    const gr = g.createLinearGradient(tx, ty, hx, hy);
    gr.addColorStop(0, "rgba(200,215,255,0)"); gr.addColorStop(1, `rgba(225,232,255,${(0.75 * k).toFixed(3)})`);
    g.strokeStyle = gr; g.lineWidth = 1.3 * U; g.lineCap = "round";
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
  }

  /* ---------- Nieve ---------- */
  function makeSnow() {
    const n = Math.round(70 * (Q.level === 0 ? 0.5 : 1));
    flakes = Array.from({ length: n }, () => ({ x: rand(VW), y: rand(VH), r: rand(0.6, 1.7) * U, vy: rand(10, 26) * U, ph: rand(TAU), a: rand(0.35, 0.8) }));
  }

  /* ---------- Autos en el puente: faros (vienen hacia la derecha) y calaveras rojas (van a la izquierda) ---------- */
  function newCar(lane, x) {
    const dir = lane ? -1 : 1;
    return { lane, dir, x: x === undefined ? (dir > 0 ? -10 : VW + 10) : x, v: rand(26, 40) * U * dir };
  }
  function drawCars() {
    const D = sc.deck, y0 = D.y * VH, wy = D.water * VH;
    for (const c of cars) {
      const y = y0 + (c.lane ? -0.9 : 0.4) * U, warm = c.lane === 0;
      const col = warm ? "255,240,210" : "255,70,60", gap = 1.3 * U;
      // las dos luces, con un brillo suave
      for (const o of [-gap / 2, gap / 2]) {
        const x = c.x + o, gr = g.createRadialGradient(x, y, 0, x, y, 3.2 * U);
        gr.addColorStop(0, `rgba(${col},${warm ? 0.85 : 0.75})`); gr.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gr; g.fillRect(x - 3.2 * U, y - 3.2 * U, 6.4 * U, 6.4 * U);
      }
      // su reflejo en el río: una raya vertical que tiembla
      const ry = 2 * wy - y, len = 14 * U, wob = Math.sin(t * 3 + c.x * 0.1) * 1.2 * U;
      const rg = g.createLinearGradient(0, ry - len * 0.2, 0, ry + len);
      rg.addColorStop(0, `rgba(${col},0.22)`); rg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = rg; g.fillRect(c.x - 1.2 * U + wob, ry - len * 0.2, 2.4 * U, len * 1.2);
    }
  }
  /* ---------- Ventanas que se prenden y se apagan ---------- */
  function drawWins(dt) {
    for (const w of wins) {
      w.a += ((w.on ? 1 : 0) - w.a) * Math.min(1, dt * 2.2);
      if (w.a < 0.02) continue;
      g.fillStyle = w.warm ? `rgba(255,200,130,${(0.5 * w.a).toFixed(3)})` : `rgba(185,210,255,${(0.42 * w.a).toFixed(3)})`;
      g.fillRect(w.x * VW, w.y * VH, w.w * VW, w.h * VH);
    }
  }

  /* ---------- Luces: parpadeo rojo y faro ---------- */
  function drawLights() {
    for (const b of sc.blink || []) {
      const x = b.x * VW, y = b.y * VH, v = Math.pow(Math.max(0, Math.sin((t * TAU) / b.period + b.ph)), reduceMotion ? 2 : 6);
      if (v < 0.01) continue;
      const r = 7 * U, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,90,80,${(0.85 * v).toFixed(3)})`); gr.addColorStop(0.25, `rgba(255,70,60,${(0.35 * v).toFixed(3)})`); gr.addColorStop(1, "rgba(255,60,50,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const L = sc.beam;
    if (L) {
      // el haz gira: se ve largo cuando apunta de lado y la lámpara destella cuando apunta hacia ti
      const th = (t * TAU) / 8, side = Math.cos(th), front = Math.max(0, Math.sin(th));
      const x = L.x * VW, y = L.y * VH, len = VW * 0.55 * Math.abs(side), a = 0.13 * Math.abs(side);
      if (len > 4) {
        const ex = x + Math.sign(side) * len, gr = g.createLinearGradient(x, y, ex, y);
        gr.addColorStop(0, `rgba(255,228,170,${a.toFixed(3)})`); gr.addColorStop(1, "rgba(255,228,170,0)");
        g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, y - len * 0.09); g.lineTo(ex, y + len * 0.06); g.closePath(); g.fill();
      }
      const f = Math.pow(front, 10), r = (8 + 30 * f) * U, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,236,190,${(0.35 + 0.55 * f).toFixed(3)})`); gr.addColorStop(1, "rgba(255,236,190,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  function update(dt) {
    t += dt;
    const calm = reduceMotion;
    if (sc.birds && !calm) {
      nextBird -= dt;
      if (nextBird <= 0 && !flocks.length) { spawnBirds(); nextBird = rand(35, 75); }
    }
    if (sc.meteors !== false && !calm) {
      nextMeteor -= dt;
      if (nextMeteor <= 0) { meteors.push(newMeteor()); nextMeteor = rand(45, 110); }
    }
    for (const f of flocks) f.x += f.dir * f.speed * dt;
    flocks = flocks.filter((f) => (f.dir > 0 ? f.x < VW + 260 * U : f.x > -260 * U));
    for (const m of meteors) m.t += dt;
    meteors = meteors.filter((m) => m.t < m.life);
    if (sc.deck) {
      for (let lane = 0; lane < 2; lane++) { nextCar[lane] -= dt; if (nextCar[lane] <= 0) { cars.push(newCar(lane)); nextCar[lane] = rand(1.4, 4.2); } }
      for (const c of cars) c.x += c.v * dt;
      cars = cars.filter((c) => c.x > -20 && c.x < VW + 20);
    }
    if (wins.length) {
      nextWin -= dt;
      if (nextWin <= 0) { const w = pick(wins); w.on = !w.on; nextWin = rand(2.5, 7); }
    }
    lastDt = dt;
    if (sc.snow && !calm) for (const s of flakes) {
      s.y += s.vy * dt; s.x += Math.sin(t * 0.8 + s.ph) * 6 * U * dt + WIND * 0.4 * dt;
      if (s.y > VH + 4) { s.y = -4; s.x = rand(VW); }
      if (s.x > VW + 4) s.x = -4; else if (s.x < -4) s.x = VW + 4;
    }
    draw();
  }

  let lastDt = 0;
  function draw() {
    const busy = flocks.length || meteors.length || (sc.blink && sc.blink.length) || sc.beam || (sc.snow && !reduceMotion) || sc.deck || wins.length;
    if (!busy && !drew) return;
    drew = !!busy;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, VW, VH);
    if (!busy) return;
    if (sc.snow && !reduceMotion) {
      g.fillStyle = "rgba(225,235,255,1)";
      for (const s of flakes) { g.globalAlpha = s.a; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    }
    drawWins(lastDt);
    for (const f of flocks) drawFlock(f);
    g.globalCompositeOperation = "lighter";
    if (sc.deck) drawCars();
    for (const m of meteors) drawMeteor(m);
    drawLights();
    g.globalCompositeOperation = "source-over";
  }

  return { init, resize, setScene, update };
})();
