"use strict";
/* audio.js: todo el sonido es procedural (Web Audio API), sin archivos.
   Realista pero ASMR: cálido y nunca agudo. Las explosiones son todas de ruido (sin tonos que caen, que suenan a
   burbuja): estallido seco + BOOM de ruido rosa que se cierra + retumbo café que rueda + un grave de peso,
   con reverb oscura y eco de montaña. Crackles estéreo y chispas que se apagan.
   Efectos y música tienen volumen independiente. */

const Sound = (() => {
  let ac = null, master, comp, sfxBus, musicBus, revIn, echoIn, noise = null, pink = null, brown = null, crackles = [], fizz = null;
  let lastPerf = 0, lastTime = 0, unlocked = false, recent = [];
  let musicTimer = 0, musicOn = false, windNode = null;

  const now = () => ac.currentTime;

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC({ latencyHint: "interactive" });

    // Compresor suave (sin "bombeo" cuando hay muchas explosiones) y un paso bajo de calidez al final
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.012; comp.release.value = 0.45;
    const warm = ac.createBiquadFilter(); warm.type = "lowpass"; warm.frequency.value = 6500; warm.Q.value = 0.5;
    master = ac.createGain(); master.gain.value = 0.9;
    master.connect(warm); warm.connect(comp); comp.connect(ac.destination);

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
    pink = pinkNoise(3);
    brown = brownNoise(3);
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
  // Ruido rosa (filtro de Paul Kellet): mismo "aire" que el blanco pero con los agudos bajados, mucho más cálido
  function pinkNoise(sec) {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = b0 + b1 + b2 + w * 0.1848;
    }
    return loopable(normalize(d, 0.45));
  }
  // Ruido café: todavía más grave y afelpado (para el aire del cohete)
  function brownNoise(sec) {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last; }
    return loopable(normalize(d, 0.45));
  }
  function normalize(d, rms) {
    let mean = 0; for (let i = 0; i < d.length; i++) mean += d[i]; mean /= d.length;
    let sq = 0; for (let i = 0; i < d.length; i++) { d[i] -= mean; sq += d[i] * d[i]; }
    const k = rms / Math.sqrt(sq / d.length || 1);
    for (let i = 0; i < d.length; i++) d[i] *= k;
    return d;
  }
  // Funde el final con el principio: al repetirse en bucle no se oye el "clic" de la unión
  function loopable(d) {
    const n = d.length, x = Math.min(4096, n >> 3);
    for (let i = 0; i < x; i++) { const a = i / x; d[i] = d[i] * a + d[n - x + i] * (1 - a); }
    const out = ac.createBuffer(1, n - x, ac.sampleRate); out.getChannelData(0).set(d.subarray(0, n - x));
    return out;
  }
  function impulse(sec) {
    const sr = ac.sampleRate, n = Math.floor(sr * sec), b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lpv = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        // Oscura desde el principio y cada vez más: el eco lejano es grave y suave
        const k = 0.3 - 0.24 * Math.min(1, t / sec);
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
  function noiseSrc(loop = true, buf = pink) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = loop;
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
    // un "fup" suave de mecha: soplo rosa con paso bajo + golpecito grave
    const n = noiseSrc(false), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = "lowpass"; bp.frequency.value = rand(700, 900); bp.Q.value = 0.6;
    env(g, t, 0.012, 0.13, 0.12);
    n.connect(bp); bp.connect(g); g.connect(out);
    n.start(t, rand(0, 2), 0.2);
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(85, t + 0.08);
    env(og, t, 0.006, 0.2, 0.1);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.2);
  }

  // Ascenso: cada subida es distinta. Cuatro "personalidades" que nunca se repiten dos veces seguidas, tono y curva
  // al azar, turbulencia irregular (el volumen y el filtro los mueve un ruido café lento), el chisporroteo de la mecha
  // al despegar, y distancia real: al subir baja el volumen, se pierden los agudos y crece la reverb.
  // Los silbidos bajan un poquito de tono al final (Doppler). Cargado: más largo y con más cuerpo; cadena: ligero.
  const MOODS = [
    { src: "brown", type: "bandpass", f0: 520, k: 1.8, q: 0.6, lvl: 0.85, fuse: 0.6 }, // suave
    { src: "pink", type: "bandpass", f0: 700, k: 1.6, q: 0.9, lvl: 0.68, fuse: 0.45 }, // aireado
    { src: "brown", type: "lowpass", f0: 520, k: 1.9, q: 0.5, lvl: 0.65, fuse: 0.35 }, // afelpado
    { src: "brown", type: "bandpass", f0: 560, k: 1.6, q: 0.7, lvl: 0.8, fuse: 1.5 },  // chisporroteante
  ];
  let lastMood = -1;
  function rise(dur, pan0, pan1, style, o2 = {}) {
    if (!ok()) return null;
    const t = now() + 0.01, end = t + dur, nodes = [];
    let mi = randi(0, MOODS.length - 1);
    if (mi === lastMood) mi = (mi + randi(1, MOODS.length - 1)) % MOODS.length;
    lastMood = mi;
    const M = MOODS[mi], big = (o2.power || 1) > 1.4, chain = !!o2.chain;
    const lvl = style.air * M.lvl * (big ? 1.3 : 1) * (chain ? 0.55 : 1) * rand(0.85, 1.15);
    // salida: paneo que sigue al cohete, paso bajo que se cierra (se aleja) y reverb que crece
    const out = panner(pan0 * 0.8);
    if (out.pan) { out.pan.setValueAtTime(clamp(pan0 * 0.8, -1, 1), t); out.pan.linearRampToValueAtTime(clamp(pan1 * 0.8, -1, 1), end); }
    const far = ac.createBiquadFilter(); far.type = "lowpass"; far.Q.value = 0.5;
    far.frequency.setValueAtTime(3200, t); far.frequency.exponentialRampToValueAtTime(1100, end);
    far.connect(out); out.connect(sfxBus);
    const wet = ac.createGain(); wet.gain.setValueAtTime(0.08, t); wet.gain.linearRampToValueAtTime(0.5, end); out.connect(wet); wet.connect(revIn);
    // turbulencia
    const turb = ac.createGain(); turb.gain.value = 1; turb.connect(far);
    const tm = noiseSrc(true, brown), tg = ac.createGain();
    tm.playbackRate.value = rand(0.04, 0.07); tg.gain.value = 0.35;
    tm.connect(tg); tg.connect(turb.gain); tm.start(t, rand(0, 2)); nodes.push(tm);
    // aire
    const n = noiseSrc(true, M.src === "pink" ? pink : brown); n.start(t, rand(0, 2)); nodes.push(n);
    const f = ac.createBiquadFilter(); f.type = M.type; f.Q.value = M.q;
    const f0 = M.f0 * rand(0.85, 1.15) * (big ? 0.85 : 1), top = t + dur * rand(0.35, 0.6);
    f.frequency.setValueAtTime(f0, t); f.frequency.linearRampToValueAtTime(f0 * M.k, top); f.frequency.linearRampToValueAtTime(f0 * M.k * 0.9, end);
    const fm = ac.createGain(); fm.gain.value = f0 * 0.25; tm.connect(fm); fm.connect(f.frequency);
    const ga = ac.createGain(), atk = chain ? 0.05 : rand(0.08, 0.16);
    ga.gain.setValueAtTime(0.0001, t); ga.gain.exponentialRampToValueAtTime(lvl, t + atk);
    ga.gain.setValueAtTime(lvl, t + atk + dur * 0.15);
    ga.gain.exponentialRampToValueAtTime(lvl * 0.4, end - 0.05); ga.gain.exponentialRampToValueAtTime(0.0001, end + 0.03);
    n.connect(f); f.connect(ga); ga.connect(turb);
    // chisporroteo de la mecha: el crackling de siempre, más lento y oscuro; fuerte al despegar y se apaga al subir
    if (!chain && crackles.length) {
      const sp = ac.createBufferSource(); sp.buffer = pick(crackles); sp.playbackRate.value = rand(0.5, 0.7);
      const sl = ac.createBiquadFilter(); sl.type = "lowpass"; sl.frequency.value = 2200;
      const sg = ac.createGain(), fv = 0.05 * M.fuse * (big ? 1.3 : 1);
      sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(fv, t + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur * 0.6, 0.9));
      sp.connect(sl); sl.connect(sg); sg.connect(turb); sp.start(t, rand(0, 0.3)); nodes.push(sp);
    }
    // silbido (según el tipo): tonal, estable, y baja un poquito de tono al final
    if (style.whistle > 0) {
      const w = noiseSrc(true, pink); w.start(t, rand(0, 2)); nodes.push(w);
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 16;
      const w0 = style.f0 * 0.85 * rand(0.92, 1.08), w1 = style.f1 * 0.85 * rand(0.92, 1.08);
      bp.frequency.setValueAtTime(w0, t); bp.frequency.exponentialRampToValueAtTime(w1, end - dur * 0.25);
      bp.frequency.exponentialRampToValueAtTime(w1 * 0.93, end);
      if (style.wobble) {
        const lfo = ac.createOscillator(), lg = ac.createGain();
        lfo.frequency.value = rand(6, 8); lg.gain.value = 40; lfo.connect(lg); lg.connect(bp.frequency); lfo.start(t); nodes.push(lfo);
      }
      const wv = style.whistle * 1.1 * (chain ? 0.6 : 1), gw = ac.createGain();
      gw.gain.setValueAtTime(0.0001, t); gw.gain.exponentialRampToValueAtTime(wv, t + 0.35);
      gw.gain.setValueAtTime(wv, end - 0.15); gw.gain.exponentialRampToValueAtTime(0.0001, end + 0.02);
      w.connect(bp); bp.connect(gw); gw.connect(far);
      // silbido con tono (el de espiral): una nota suave que sube, más el aire de arriba
      if (style.tone) {
        const o = ac.createOscillator(), og = ac.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(w0, t); o.frequency.exponentialRampToValueAtTime(w1, end - dur * 0.25);
        o.frequency.exponentialRampToValueAtTime(w1 * 0.93, end);
        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(wv * 0.24, t + 0.4);
        og.gain.setValueAtTime(wv * 0.24, end - 0.18); og.gain.exponentialRampToValueAtTime(0.0001, end + 0.02);
        o.connect(og); og.connect(far); o.start(t); nodes.push(o);
        // al ritmo del giro: el tono se mece un poquito (Doppler) y el sonido va de un lado a otro
        if (o2.spin > 0) {
          const lfo = ac.createOscillator(), dep = ac.createGain(), dep2 = ac.createGain();
          lfo.frequency.value = o2.spin;
          dep.gain.value = w0 * 0.025; lfo.connect(dep); dep.connect(o.frequency); dep.connect(bp.frequency);
          if (out.pan) { dep2.gain.value = 0.18; lfo.connect(dep2); dep2.connect(out.pan); }
          lfo.start(t); nodes.push(lfo);
        }
      }
    }
    nodes.forEach((x) => x.stop(end + 0.1));
    return { stop() { try { nodes.forEach((x) => x.stop()); } catch (e) {} } };
  }

  // Explosión realista y ASMR, toda de ruido (los tonos que caen suenan a burbuja o a tambor):
  // 1) estallido: el "¡pa!" seco del inicio, de banda ancha pero sin agudos ásperos
  // 2) BOOM: ruido rosa con un filtro que se cierra rápido (de brillante a sordo), como el aire empujado
  // 3) retumbo: grave café que rueda unos segundos con un vaivén irregular (los ecos en las montañas)
  // 4) peso: un grave casi sin cambio de tono, para audífonos y bocinas buenas
  function boom(power, pan, kind = {}) {
    if (!ok()) return;
    const t = now() + 0.008, c = crowd();
    const size = clamp(power, 0.4, 3);
    const vol = (0.5 + 0.28 * size) * c * (kind.gain || 1);
    const crack = kind.crack === undefined ? 1 : kind.crack, body = kind.body || 1500;
    const out = panner(pan * 0.7);
    out.connect(sfxBus);
    const sendR = ac.createGain(); sendR.gain.value = 0.6 + 0.12 * size; out.connect(sendR); sendR.connect(revIn);
    const sendE = ac.createGain(); sendE.gain.value = 0.4 + 0.15 * size; out.connect(sendE); sendE.connect(echoIn);
    // 1) estallido
    if (crack > 0) {
      const n = noiseSrc(false, noise), lp = ac.createBiquadFilter(), hp = ac.createBiquadFilter(), g = ac.createGain();
      lp.type = "lowpass"; lp.frequency.value = 2400 + 300 * crack; lp.Q.value = 0.5;
      hp.type = "highpass"; hp.frequency.value = 180;
      env(g, t, 0.0015, 0.42 * vol * crack, 0.07);
      n.connect(lp); lp.connect(hp); hp.connect(g); g.connect(out); n.start(t, rand(0, 1.5), 0.15);
    }
    // 2) BOOM
    const n = noiseSrc(false), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = "lowpass"; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(body * (0.8 + 0.1 * size), t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.12);
    lp.frequency.exponentialRampToValueAtTime(90, t + 0.9 + 0.3 * size);
    env(g, t, 0.004, 0.95 * vol, 0.8 + 0.35 * size);
    n.connect(lp); lp.connect(g); g.connect(out); n.start(t, rand(0, 1), 1.6 + 0.5 * size);
    // 3) retumbo que rueda: su volumen lo mueve un ruido café muy lento (irregular, no un trémolo)
    const r = noiseSrc(false, brown), rl = ac.createBiquadFilter(), rg = ac.createGain(), roll = ac.createGain();
    rl.type = "lowpass"; rl.frequency.value = 300 + 40 * size; rl.Q.value = 0.6;
    const rEnd = 2.2 + 0.7 * size;
    rg.gain.setValueAtTime(0.0001, t); rg.gain.exponentialRampToValueAtTime(0.55 * vol, t + 0.09);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + rEnd);
    const mod = noiseSrc(true, brown), mg = ac.createGain();
    mod.playbackRate.value = 0.03; mg.gain.value = 0.6; roll.gain.value = 1;
    mod.connect(mg); mg.connect(roll.gain);
    r.connect(rl); rl.connect(rg); rg.connect(roll); roll.connect(out);
    r.start(t, rand(0, 1), rEnd + 0.1); mod.start(t, rand(0, 2)); mod.stop(t + rEnd + 0.1);
    // 4) peso
    const o = ac.createOscillator(), og = ac.createGain();
    const f0 = (kind.low || 92) * 0.75 / Math.pow(size, 0.15);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.4);
    env(og, t, 0.008, 0.6 * vol, 0.6 + 0.2 * size);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 1 + 0.2 * size);
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
    const s = ac.createBufferSource(); s.buffer = brown; s.loop = true;  // sin clic en la unión del bucle
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
    // La sesión de audio se pide antes de crear el AudioContext (en la app: "ambient" desde el primer sonido)
    if (!ac) { setSession(); build(); if (!ac) return; }
    const p = performance.now(), ct = ac.currentTime;
    if (ac.state === "running" && lastPerf && p - lastPerf > 800 && ct - lastTime < 0.02) {
      // Se quedó colgado tras una interrupción (llamada, Siri…): se arma uno nuevo
      try { ac.close(); } catch (e) {}
      ac = null; musicOn = false; clearTimeout(musicTimer); windNode = null;
      setSession(); build();
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
