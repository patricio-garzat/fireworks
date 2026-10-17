"use strict";
/* audio.js: todo el sonido es procedural (Web Audio API), sin archivos.
   Estilo ASMR: cálido, nunca agudo. Explosiones profundas pero suaves, con eco de montaña,
   crackles estéreo y chispas que se apagan. Efectos y música tienen volumen independiente. */

const Sound = (() => {
  let ac = null, master, comp, sfxBus, musicBus, revIn, echoIn, noise = null, crackles = [], fizz = null;
  let lastPerf = 0, lastTime = 0, unlocked = false, recent = [];
  let musicTimer = 0, musicOn = false, windNode = null;

  const now = () => ac.currentTime;

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC({ latencyHint: "interactive" });

    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.35;
    master = ac.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(ac.destination);

    sfxBus = ac.createGain(); sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.connect(master);

    // Reverb de "noche abierta": cola larga y oscura
    const conv = ac.createConvolver(); conv.buffer = impulse(3.4);
    revIn = ac.createGain(); revIn.gain.value = 0.55;
    const revOut = ac.createGain(); revOut.gain.value = 0.8;
    revIn.connect(conv); conv.connect(revOut); revOut.connect(sfxBus);

    // Eco de las montañas: un retardo con retroalimentación que se oscurece en cada vuelta
    const dl = ac.createDelay(1.5); dl.delayTime.value = 0.42;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 820;
    echoIn = ac.createGain(); echoIn.gain.value = 0.5;
    echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(sfxBus);
    const echoRev = ac.createGain(); echoRev.gain.value = 0.3; lp.connect(echoRev); echoRev.connect(revIn);

    noise = whiteNoise(2);
    crackles = [0, 1, 2].map((i) => crackleBuffer(1.7, 150 + i * 30));
    fizz = fizzBuffer(3.2);
    applyVolumes();
    if (Settings.music > 0.001) startMusic();
  }

  /* ---------- Buffers procedurales ---------- */
  function whiteNoise(sec) {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function impulse(sec) {
    const sr = ac.sampleRate, n = Math.floor(sr * sec), b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lpv = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        // Se va oscureciendo con el tiempo: el eco lejano es grave y suave
        const k = 0.55 - 0.45 * Math.min(1, t / sec);
        lpv += (Math.random() * 2 - 1 - lpv) * k;
        const env = Math.pow(1 - t / sec, 2.2) * (t < 0.012 ? t / 0.012 : 1);
        d[i] = lpv * env * 0.6;
      }
    }
    return b;
  }
  // Crackle: cientos de chasquidos diminutos repartidos en estéreo, densos al principio
  function crackleBuffer(sec, count) {
    const sr = ac.sampleRate, n = Math.floor(sr * sec), b = ac.createBuffer(2, n, sr);
    const L = b.getChannelData(0), R = b.getChannelData(1);
    for (let k = 0; k < count; k++) {
      const at = Math.floor(Math.pow(Math.random(), 1.6) * (n - 600));
      const len = 30 + Math.floor(Math.random() * 160), amp = 0.25 + Math.random() * 0.75, pan = Math.random();
      const decay = 3 + Math.random() * 5;
      for (let i = 0; i < len; i++) {
        const v = (Math.random() * 2 - 1) * amp * Math.exp(-decay * i / len);
        L[at + i] += v * (1 - pan * 0.8); R[at + i] += v * (0.2 + pan * 0.8);
      }
    }
    soften(L, 0.45); soften(R, 0.45);
    return b;
  }
  // Fizz: chisporroteo muy fino y denso (chispas que se apagan, el sauce dorado)
  function fizzBuffer(sec) {
    const sr = ac.sampleRate, n = Math.floor(sr * sec), b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let flick = 0;
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.004) flick = 0.4 + Math.random() * 0.6;
        flick *= 0.9985;
        d[i] = (Math.random() * 2 - 1) * (0.12 + flick) * 0.5;
      }
      soften(d, 0.55);
    }
    return b;
  }
  // Paso bajo de un polo + quitar graves: nada áspero
  function soften(d, k) {
    let lpv = 0, hp = 0;
    for (let i = 0; i < d.length; i++) { lpv += (d[i] - lpv) * k; hp += (lpv - hp) * 0.02; d[i] = lpv - hp; }
  }

  /* ---------- Utilidades de nodos ---------- */
  function panner(p) {
    if (ac.createStereoPanner) { const s = ac.createStereoPanner(); s.pan.value = clamp(p, -1, 1); return s; }
    return ac.createGain();
  }
  function noiseSrc(loop = true) {
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = loop;
    return s;
  }
  function env(g, t, a, peak, d, floor = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(floor, t + a + d);
  }
  // Muchas explosiones juntas: cada una suena un poco más suave (no se satura)
  function crowd() {
    const t = performance.now();
    recent = recent.filter((x) => t - x < 220); recent.push(t);
    return 1 / Math.sqrt(recent.length);
  }
  const ok = () => ac && ac.state === "running" && Settings.sfx > 0.001;

  /* ---------- Sonidos del juego ---------- */
  function ignite(pan) {
    if (!ok()) return;
    const t = now() + 0.005;
    const out = panner(pan * 0.8); out.connect(sfxBus);
    const n = noiseSrc(false), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = "bandpass"; bp.frequency.value = rand(700, 1000); bp.Q.value = 1.1;
    env(g, t, 0.006, 0.16, 0.11);
    n.connect(bp); bp.connect(g); g.connect(out);
    n.start(t, rand(0, 1.5), 0.2);
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    env(og, t, 0.004, 0.22, 0.1);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.2);
  }

  // Ascenso: un "fsss" de aire y, según el tipo, un silbido suave (ruido con filtro estrecho: aireado, no agudo)
  function rise(dur, pan0, pan1, style) {
    if (!ok()) return null;
    const t = now() + 0.01, end = t + dur;
    const out = panner(pan0 * 0.8); out.connect(sfxBus);
    if (out.pan) { out.pan.setValueAtTime(clamp(pan0 * 0.8, -1, 1), t); out.pan.linearRampToValueAtTime(clamp(pan1 * 0.8, -1, 1), end); }
    const nodes = [];
    const n = noiseSrc(); n.start(t, rand(0, 1.8)); nodes.push(n);
    // aire
    const lp = ac.createBiquadFilter(); lp.type = "bandpass"; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(1700, end);
    const ga = ac.createGain();
    ga.gain.setValueAtTime(0.0001, t); ga.gain.exponentialRampToValueAtTime(style.air, t + 0.12);
    ga.gain.setValueAtTime(style.air, end - 0.12); ga.gain.exponentialRampToValueAtTime(0.0001, end);
    n.connect(lp); lp.connect(ga); ga.connect(out);
    // silbido
    if (style.whistle > 0) {
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 11;
      bp.frequency.setValueAtTime(style.f0, t); bp.frequency.exponentialRampToValueAtTime(style.f1, end);
      if (style.wobble) {
        const lfo = ac.createOscillator(), lg = ac.createGain();
        lfo.frequency.value = 7; lg.gain.value = 40; lfo.connect(lg); lg.connect(bp.frequency); lfo.start(t); lfo.stop(end + 0.05); nodes.push(lfo);
      }
      const gw = ac.createGain();
      gw.gain.setValueAtTime(0.0001, t); gw.gain.exponentialRampToValueAtTime(style.whistle, t + 0.25);
      gw.gain.setValueAtTime(style.whistle, end - 0.1); gw.gain.exponentialRampToValueAtTime(0.0001, end + 0.02);
      n.connect(bp); bp.connect(gw); gw.connect(out);
    }
    nodes.forEach((x) => x.stop(end + 0.1));
    return { stop() { try { nodes.forEach((x) => x.stop()); } catch (e) {} } };
  }

  // Explosión: golpe grave + cuerpo de ruido que se cierra + un "crack" suave, con reverb y eco
  function boom(power, pan, kind = {}) {
    if (!ok()) return;
    const t = now() + 0.008, c = crowd();
    const size = clamp(power, 0.4, 3);
    const vol = (0.5 + 0.28 * size) * c * (kind.gain || 1);
    const out = panner(pan * 0.7);
    out.connect(sfxBus);
    const sendR = ac.createGain(); sendR.gain.value = 0.55 + 0.1 * size; out.connect(sendR); sendR.connect(revIn);
    const sendE = ac.createGain(); sendE.gain.value = 0.4 + 0.15 * size; out.connect(sendE); sendE.connect(echoIn);
    // golpe
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = "sine";
    const f0 = (kind.low || 92) / Math.pow(size, 0.18);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + 0.55);
    env(og, t, 0.008, 0.85 * vol, 1.0 + 0.3 * size);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 1.6 + 0.3 * size);
    // cuerpo (lo que se oye en las bocinas del celular)
    const n = noiseSrc(false), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = "lowpass"; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime((kind.body || 1500) * (0.9 + 0.1 * size), t); lp.frequency.exponentialRampToValueAtTime(180, t + 1.1 + 0.3 * size);
    env(g, t, 0.012, 0.75 * vol, 1.5 + 0.5 * size);
    n.connect(lp); lp.connect(g); g.connect(out); n.start(t, rand(0, 0.5), 2.4 + size);
    // crack inicial, suave
    if (kind.crack !== 0) {
      const n2 = noiseSrc(false), bp = ac.createBiquadFilter(), g2 = ac.createGain();
      bp.type = "bandpass"; bp.frequency.value = rand(1300, 1900); bp.Q.value = 0.8;
      env(g2, t, 0.003, 0.22 * vol * (kind.crack || 1), 0.09);
      n2.connect(bp); bp.connect(g2); g2.connect(out); n2.start(t, rand(0, 1.5), 0.2);
    }
  }

  // Crackles: varias capas del buffer de chasquidos, cada una con su paneo
  function crackle(amount, pan, delay = 0) {
    if (!ok()) return;
    const layers = clamp(Math.round(amount * 2), 1, 3), c = crowd();
    for (let i = 0; i < layers; i++) {
      const t = now() + delay + i * rand(0.05, 0.15);
      const s = ac.createBufferSource(); s.buffer = pick(crackles); s.playbackRate.value = rand(0.82, 1.12);
      const g = ac.createGain(); g.gain.value = (0.3 + 0.12 * amount) * c;
      const p = panner(clamp(pan * 0.7 + rand(-0.35, 0.35), -1, 1));
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200;
      s.connect(lp); lp.connect(g); g.connect(p); p.connect(sfxBus);
      const r = ac.createGain(); r.gain.value = 0.25; g.connect(r); r.connect(revIn);
      s.start(t);
    }
  }

  // Chispas que se apagan: siseo finísimo que se desvanece
  function sizzle(dur, pan, vol = 1, delay = 0) {
    if (!ok()) return;
    const t = now() + delay, s = ac.createBufferSource(); s.buffer = fizz; s.loop = true;
    s.playbackRate.value = rand(0.85, 1.05);
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = rand(2200, 3200); bp.Q.value = 0.6;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = panner(pan * 0.7);
    s.connect(bp); bp.connect(g); g.connect(p); p.connect(sfxBus);
    const r = ac.createGain(); r.gain.value = 0.3; g.connect(r); r.connect(revIn);
    s.start(t, rand(0, 2)); s.stop(t + dur + 0.05);
  }

  // Marimba de madera, tonos medios-graves: solo para premios
  function mallet(freq, when = 0, vol = 0.32, pan = 0) {
    if (!ac || ac.state !== "running" || Settings.sfx < 0.001) return;
    const t = now() + 0.01 + when;
    const out = panner(pan); out.connect(sfxBus);
    const r = ac.createGain(); r.gain.value = 0.45; out.connect(r); r.connect(revIn);
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; lp.connect(out);
    [[1, 1, 1.1], [3.98, 0.22, 0.18], [9.9, 0.05, 0.06]].forEach(([m, a, d]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = freq * m; env(g, t, 0.003, vol * a, d);
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + d + 0.1);
    });
    const n = noiseSrc(false), nb = ac.createBiquadFilter(), ng = ac.createGain();
    nb.type = "lowpass"; nb.frequency.value = 900; env(ng, t, 0.002, vol * 0.25, 0.03);
    n.connect(nb); nb.connect(ng); ng.connect(lp); n.start(t, rand(0, 1), 0.06);
  }
  const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function melody(notes, gap = 0.12, vol = 0.3) { notes.forEach((m, i) => mallet(NOTE(m), i * gap, vol * (1 - i * 0.05), (i - notes.length / 2) * 0.12)); }

  function tap() {
    if (!ac || ac.state !== "running" || Settings.sfx < 0.001) return;
    const t = now() + 0.005, o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1200;
    o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.05);
    env(g, t, 0.003, 0.09, 0.07);
    o.connect(lp); lp.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.12);
  }

  /* ---------- Música ambiental: acordes lentos y notas sueltas como estrellas ---------- */
  const CHORDS = [[50, 57, 64, 66], [47, 54, 62, 66], [43, 55, 59, 66], [45, 52, 57, 64], [50, 57, 62, 69], [43, 50, 59, 64]];
  const PENTA = [62, 64, 66, 69, 71, 74, 76];
  let chordIx = 0;
  function startMusic() {
    if (!ac || musicOn) return;
    musicOn = true;
    // aire de noche: ruido café muy bajo con un vaivén lento
    const len = ac.sampleRate * 4, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
    const g = ac.createGain(); g.gain.value = 0.05;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.025;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    s.connect(lp); lp.connect(g); g.connect(musicBus); s.start();
    windNode = { s, lfo };
    const loop = () => {
      if (!musicOn) return;
      playChord(CHORDS[chordIx++ % CHORDS.length]);
      if (chance(0.8)) for (let i = 0, k = randi(1, 3); i < k; i++) twinkle(rand(1.5, 8));
      musicTimer = setTimeout(loop, 8000);
    };
    loop();
  }
  function stopMusic() {
    musicOn = false; clearTimeout(musicTimer);
    if (windNode) { try { windNode.s.stop(); windNode.lfo.stop(); } catch (e) {} windNode = null; }
  }
  function playChord(notes) {
    if (!ac || ac.state !== "running") return;
    const t = now() + 0.05;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1000; lp.Q.value = 0.3;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11, t + 3.2);
    g.gain.setValueAtTime(0.11, t + 6); g.gain.exponentialRampToValueAtTime(0.0001, t + 11.5);
    lp.connect(g); g.connect(musicBus);
    const r = ac.createGain(); r.gain.value = 0.35; g.connect(r); r.connect(revIn);
    notes.forEach((m, i) => {
      [-4, 4].forEach((cents, j) => {
        const o = ac.createOscillator(); o.type = j ? "sine" : "triangle";
        o.frequency.value = NOTE(m); o.detune.value = cents + rand(-2, 2);
        const og = ac.createGain(); og.gain.value = (i === 0 ? 0.5 : 0.32) * (j ? 1 : 0.6);
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + 12);
      });
    });
  }
  function twinkle(delay) {
    if (!ac || ac.state !== "running") return;
    const t = now() + delay, f = NOTE(pick(PENTA));
    const o = ac.createOscillator(), g = ac.createGain(), p = panner(rand(-0.6, 0.6));
    o.frequency.value = f; env(g, t, 0.01, 0.035, 2.4);
    o.connect(g); g.connect(p); p.connect(musicBus);
    const r = ac.createGain(); r.gain.value = 0.8; g.connect(r); r.connect(revIn);
    o.start(t); o.stop(t + 2.6);
  }

  function applyVolumes() {
    if (!ac) return;
    const t = now();
    sfxBus.gain.setTargetAtTime(Settings.sfx, t, 0.05);
    musicBus.gain.setTargetAtTime(Settings.music * 0.55, t, 0.2);
    if (Settings.music > 0.001 && !musicOn) startMusic();
    if (Settings.music <= 0.001 && musicOn) stopMusic();
  }

  /* ---------- Desbloqueo, sesión de audio y AudioContext "zombi" ---------- */
  let silentEl = null;
  function setSession() {
    // App de iOS: "ambient" (decisión del estudio: no aparece en la Dynamic Island y respeta el modo silencio).
    // Web: "playback", para que suene aunque el iPhone esté en silencio.
    try { if (navigator.audioSession) navigator.audioSession.type = isNative() ? "ambient" : "playback"; } catch (e) {}
    if (!isNative() && !navigator.audioSession && !silentEl) {
      // Safari viejito: un audio mudo al primer toque hace lo mismo
      const sr = 8000, n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
      silentEl = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
      silentEl.setAttribute("playsinline", ""); silentEl.loop = true; silentEl.volume = 0.01;
      silentEl.play().catch(() => {});
    }
  }
  function wake() {
    if (!ac) { build(); if (!ac) return; setSession(); }
    const p = performance.now(), ct = ac.currentTime;
    if (ac.state === "running" && lastPerf && p - lastPerf > 800 && ct - lastTime < 0.02) {
      // Se quedó colgado tras una interrupción (llamada, Siri…): se arma uno nuevo
      try { ac.close(); } catch (e) {}
      ac = null; musicOn = false; clearTimeout(musicTimer); windNode = null;
      build(); setSession();
    } else if (ac.state !== "running") {
      ac.resume().catch(() => {});
    }
    lastPerf = p; lastTime = ac.currentTime;
    if (!unlocked) { unlocked = true; setSession(); }
  }
  function suspend() { if (ac && ac.state === "running") ac.suspend().catch(() => {}); }
  function resume() { if (ac && unlocked) ac.resume().catch(() => {}); }

  return {
    wake, suspend, resume, applyVolumes,
    ignite, rise, boom, crackle, sizzle, mallet, melody, tap,
    get ready() { return !!ac && ac.state === "running"; },
  };
})();
