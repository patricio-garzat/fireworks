"use strict";
/* renderer.js: WebGL (2 si hay, 1 si no) sin librerías.
   Cuadro a cuadro:
   1. Capa de partículas con persistencia (HDR si se puede): se atenúa y se le suman las partículas → estelas naturales.
   2. Bloom: se reduce a 1/4 y 1/8 y se desenfoca.
   3. Pantalla: cielo procedural (estrellas, luces de las explosiones sobre el cielo, montañas y agua),
      humo con mezcla alfa y, encima, partículas + bloom con tonemap (y su reflejo en el lago). */

const Q = { level: 2, auto: true, dpr: 2 };

const R = (() => {
  let gl = null, gl2 = false, inst = null, canvas = null, hdr = false;
  let RW = 1, RH = 1, scale = 1;
  let quad, ibuf, sbuf;
  const idata = new Float32Array(20000 * 9 + 1024 * 9), sdata = new Float32Array(420 * 9);
  let tPart, tHalf, tA, tB, tC, tD;
  let bgTex = null, maskTex = null, smokeTex = null, noiseTex = null;
  const prog = {};
  const L4 = new Float32Array(32), L3 = new Float32Array(24);
  let water = -1, starAmt = 1, mistAmt = 0, cloudAmt = 0, moon = [0, 0, 0], ok = false;

  /* ---------- Shaders ---------- */
  const VS_FULL = `attribute vec2 a_c; varying vec2 v_uv; void main(){ v_uv = a_c*0.5+0.5; gl_Position = vec4(a_c,0.0,1.0); }`;

  const FS_FILL = `precision mediump float; uniform vec4 u_c; void main(){ gl_FragColor = u_c; }`;

  const VS_PART = `
  attribute vec2 a_c; attribute vec4 a_p; attribute float a_s; attribute vec4 a_col;
  uniform vec2 u_res;
  varying vec2 v_uv; varying vec4 v_col; varying float v_len;
  void main(){
    vec2 s = a_p.zw; float len = length(s);
    vec2 dir = len > 0.0001 ? s/len : vec2(1.0,0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float L = len / a_s;
    vec2 local = vec2(a_c.x*(1.0+L), a_c.y);
    // la estela queda detrás de la partícula
    vec2 p = a_p.xy - s*0.85 + dir*local.x*a_s + nrm*local.y*a_s;
    v_uv = local; v_len = L; v_col = a_col;
    vec2 cl = p/u_res*2.0-1.0;
    gl_Position = vec4(cl.x, -cl.y, 0.0, 1.0);
  }`;
  const FS_PART = `
  precision mediump float;
  varying vec2 v_uv; varying vec4 v_col; varying float v_len;
  uniform float u_gain;
  void main(){
    float dx = max(abs(v_uv.x) - v_len, 0.0);
    float d2 = dx*dx + v_uv.y*v_uv.y;
    if (d2 >= 1.0) discard;
    float edge = 1.0 - d2; edge *= edge;
    float core = exp(-d2*16.0);
    float glow = exp(-d2*3.2)*edge;
    float e = u_gain / (1.0 + v_len*0.35);
    vec3 c = v_col.rgb*(glow*0.5 + core*1.1);
    float lum = max(v_col.r, max(v_col.g, v_col.b));
    c += vec3(core*v_col.a*lum*1.4);
    gl_FragColor = vec4(c*e, 0.0);
  }`;

  const VS_SMOKE = `
  attribute vec2 a_c; attribute vec4 a_p; attribute vec4 a_col; attribute float a_v;
  uniform vec2 u_res;
  varying vec2 v_uv; varying vec4 v_col;
  void main(){
    float c = cos(a_p.w), s = sin(a_p.w);
    vec2 o = vec2(a_c.x*c - a_c.y*s, a_c.x*s + a_c.y*c)*a_p.z;
    vec2 cl = (a_p.xy + o)/u_res*2.0-1.0;
    gl_Position = vec4(cl.x, -cl.y, 0.0, 1.0);
    vec2 cell = vec2(mod(a_v, 2.0), floor(a_v/2.0));
    v_uv = (a_c*0.5+0.5 + cell)*0.5;
    v_col = a_col;
  }`;
  const FS_SMOKE = `
  precision mediump float;
  uniform sampler2D u_t; varying vec2 v_uv; varying vec4 v_col;
  void main(){ float m = texture2D(u_t, v_uv).a * v_col.a; gl_FragColor = vec4(v_col.rgb*m, m); }`;

  const FS_BG = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_bg, u_mask, u_noise;
  uniform vec2 u_res; uniform float u_time, u_dpr, u_water, u_stars, u_mist, u_cloud; uniform vec3 u_moon;
  uniform vec4 u_L[8]; uniform vec3 u_LC[8]; uniform vec3 u_flash;
  float h21(vec2 p){ p = fract(p*vec2(233.34, 851.73)); p += dot(p, p+23.45); return fract(p.x*p.y); }
  float starLayer(vec2 px, float cell, float dens, float rmin, float rmax, float seed){
    vec2 q = px/cell; vec2 g = floor(q); vec2 f = q - g;
    float h = h21(g + seed);
    if (h > dens) return 0.0;
    vec2 sp = vec2(h21(g + seed + 1.7), h21(g + seed + 3.1))*0.7 + 0.15;
    float d = length((f - sp)*cell);
    float r = mix(rmin, rmax, h21(g + seed + 7.3))*u_dpr;
    float b = pow(h21(g + seed + 5.5), 2.5);
    float tw = 0.72 + 0.28*sin(u_time*(0.7 + 2.3*h21(g + seed + 9.1)) + h*61.0);
    return b*tw*smoothstep(r, r*0.15, d);
  }
  float stars(vec2 px){
    return starLayer(px, 5.0*u_dpr, 0.22, 0.45, 0.8, 0.0)*0.55 + starLayer(px, 17.0*u_dpr, 0.30, 0.7, 1.35, 11.0);
  }
  void main(){
    vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
    vec2 css = px/u_dpr, scr = u_res/u_dpr;
    vec3 col = texture2D(u_bg, uv).rgb;
    vec4 m = texture2D(u_mask, uv);
    float land = m.r, wat = m.g, sky = (1.0 - smoothstep(0.0, 0.05, land)) * (1.0 - wat);

    /* Agua: refleja de verdad lo que hay arriba (cielo, montañas, luces, la luna), movido por olas en perspectiva:
       chiquitas y apretadas en el horizonte, grandes cerca. Cerca del horizonte refleja casi todo (espejo);
       cerca de ti se ve más oscura. Las olas estiran los reflejos en columnas temblorosas. */
    float p = 0.0, glint = 0.0;
    vec2 wn = vec2(0.0);
    if (u_water > 0.0 && wat > 0.5) {
      float d = css.y - u_water/u_dpr, H = scr.y - u_water/u_dpr;
      p = clamp(d/H, 0.0, 1.0);
      // proyección sobre el plano del agua: X = x·k/d, profundidad = k·f/d (cerca: olas anchas y planas; lejos: un espejo liso)
      float zi = 1.0/(d + 4.0);
      vec2 w = vec2((css.x - scr.x*0.5)*9.0, 7200.0)*zi;
      vec2 n1 = texture2D(u_noise, w*vec2(0.044, 0.064) + vec2(u_time*0.010, u_time*0.034)).gb;
      vec2 n2 = texture2D(u_noise, w*vec2(0.076, 0.108) + vec2(-u_time*0.014, u_time*0.052)).gb;
      wn = (n1 + n2 - 1.0);
      float amp = 1.2 + 16.0*p;                                    // en px de pantalla
      vec2 ofs = vec2(wn.x*amp*0.35, wn.y*amp*2.2);                // las olas estiran los reflejos en vertical
      vec2 rp = vec2(css.x + ofs.x, u_water/u_dpr - d - 1.0 - abs(ofs.y)*0.6 + ofs.y*0.4);
      rp.y = min(rp.y, u_water/u_dpr - 1.0);
      vec3 refl = texture2D(u_bg, clamp(rp/scr, 0.001, 0.999)).rgb;
      // Fresnel: rasante (lejos) refleja casi todo; cada ola refleja más o menos según hacia dónde mira
      float fres = clamp(mix(0.92, 0.32, pow(p, 0.55)) + wn.y*0.22*smoothstep(0.0, 0.25, p), 0.08, 0.98);
      vec3 base = col * (0.75 + 0.25*p);
      col = mix(base, refl*vec3(0.82, 0.88, 0.98), fres);
      col *= 0.9 + 0.22*wn.y;                                      // crestas y valles
      // destellos en las crestas (dos ruidos mezclados: nada de filas ordenadas)
      float ga = texture2D(u_noise, w*vec2(0.17, 0.24) + vec2(u_time*0.02, -u_time*0.07)).r;
      float gb = texture2D(u_noise, w*vec2(0.31, 0.43) + vec2(-u_time*0.03, -u_time*0.11)).g;
      float gsp = ga*0.55 + gb*0.45;
      glint = smoothstep(0.66, 0.86, gsp) * (1.0 - p*0.6);
      col += vec3(0.7, 0.78, 0.95) * glint * 0.05;
      // el camino de la luna: destellos sobre las olas, angosto en el horizonte y más ancho cerca
      if (u_moon.z > 0.0) {
        float mw = 3.0 + 75.0*p, k = exp(-pow((css.x - u_moon.x)/mw, 2.0));
        col += vec3(0.86, 0.89, 0.97) * k * (smoothstep(0.5, 0.82, gsp)*0.55 + 0.05) * (0.45 + 0.55*(1.0 - p)) * u_moon.z;
      }
    }

    // Nubes tenues que avanzan muy despacio, tapan estrellas y se iluminan con los fuegos
    float cloud = 0.0;
    if (u_cloud > 0.0 && sky > 0.0) {
      vec2 cq = vec2(css.x/scr.x*1.3 + u_time*0.0035, css.y/scr.x*2.6 - u_time*0.0008);
      float c1 = texture2D(u_noise, cq).r, c2 = texture2D(u_noise, cq*2.3 + vec2(0.37, u_time*0.002)).r;
      cloud = smoothstep(0.5, 0.82, c1*0.72 + c2*0.28) * u_cloud * smoothstep(0.02, 0.22, uv.y) * sky;
    }

    float alt = smoothstep(0.92, 0.35, uv.y);
    col += vec3(0.86, 0.9, 1.0) * stars(px) * sky * mix(0.35, 1.0, alt) * u_stars * (1.0 - cloud*0.9);
    vec3 glow = vec3(0.0), wglow = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      vec4 L = u_L[i];
      if (L.w <= 0.0) continue;
      vec2 dd = px - L.xy;
      float r2 = dot(dd, dd)/(L.z*L.z);
      glow += u_LC[i] * L.w / (1.0 + r2*2.5);
      if (u_water > 0.0) {
        vec2 dm = vec2(dd.x*2.2, (px.y - (u_water + (u_water - L.y)/1.8))*0.8);
        wglow += u_LC[i] * L.w / (1.0 + dot(dm, dm)/(L.z*L.z)*3.0);
      }
    }
    col += glow * (sky*0.17 + land*0.3 + wat*0.05) + u_flash * (sky*0.10 + land*0.16 + wat*0.08);
    // las nubes: un poco más claras que el cielo, con la luz de las explosiones encima
    col = mix(col, vec3(0.09, 0.11, 0.17) + col*0.4, cloud*0.55) + (glow*0.55 + u_flash*0.35)*cloud;

    // Neblina que se desplaza entre cerros y valles; las explosiones la iluminan
    if (u_mist > 0.0) {
      float band = smoothstep(0.52, 0.76, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
      if (band > 0.0) {
        vec2 q = vec2(css.x/scr.x*0.9 + u_time*0.004, css.y/scr.x*3.2 - u_time*0.0012);
        float mist = smoothstep(0.42, 0.8, texture2D(u_noise, q).r) * band * u_mist;
        col = mix(col, vec3(0.13, 0.17, 0.26), mist*0.3) + (glow*0.22 + u_flash*0.12)*mist;
      }
    }
    if (wat > 0.0) {
      vec2 rs = vec2(px.x + wn.x*(1.0 + 8.0*p)*u_dpr, u_water - (px.y - u_water) + wn.y*(1.0 + 10.0*p)*u_dpr);
      col += vec3(0.8,0.86,1.0) * stars(rs) * 0.3 * (1.0 - p) * wat * u_stars;
      col += wglow * (0.16 + glint*2.5) * wat * (1.0 - p*0.6);
    }
    col += (h21(px + fract(u_time)*50.0) - 0.5)/255.0;
    gl_FragColor = vec4(col, 1.0);
  }`;

  const FS_DOWN = `
  precision mediump float; varying vec2 v_uv; uniform sampler2D u_t; uniform vec2 u_px;
  void main(){
    vec3 c = texture2D(u_t, v_uv + vec2(-u_px.x, -u_px.y)).rgb + texture2D(u_t, v_uv + vec2(u_px.x, -u_px.y)).rgb
           + texture2D(u_t, v_uv + vec2(-u_px.x, u_px.y)).rgb + texture2D(u_t, v_uv + vec2(u_px.x, u_px.y)).rgb;
    gl_FragColor = vec4(c*0.25, 1.0);
  }`;
  const FS_BLUR = `
  precision mediump float; varying vec2 v_uv; uniform sampler2D u_t; uniform vec2 u_dir;
  void main(){
    vec3 c = texture2D(u_t, v_uv).rgb*0.2270270;
    c += (texture2D(u_t, v_uv + u_dir*1.3846154).rgb + texture2D(u_t, v_uv - u_dir*1.3846154).rgb)*0.3162162;
    c += (texture2D(u_t, v_uv + u_dir*3.2307692).rgb + texture2D(u_t, v_uv - u_dir*3.2307692).rgb)*0.0702703;
    gl_FragColor = vec4(c, 1.0);
  }`;
  const FS_COMP = `
  precision highp float; varying vec2 v_uv;
  uniform sampler2D u_p, u_a, u_c, u_m; uniform float u_ba, u_bc, u_water, u_time, u_exp; uniform vec2 u_res;
  float h21(vec2 p){ p = fract(p*vec2(233.34, 851.73)); p += dot(p, p+23.45); return fract(p.x*p.y); }
  vec3 scene(vec2 uv){ return texture2D(u_p, uv).rgb + texture2D(u_a, uv).rgb*u_ba + texture2D(u_c, uv).rgb*u_bc; }
  void main(){
    vec3 c = scene(v_uv);
    if (u_water > 0.0) {
      float wy = 1.0 - u_water;
      if (v_uv.y < wy) {
        float depth = clamp((wy - v_uv.y)/wy, 0.0, 1.0);
        float ry = wy + (wy - v_uv.y)*1.8;
        float wob = sin(v_uv.y*260.0 + u_time*1.6)*0.0035*(0.3+depth) + sin(v_uv.y*90.0 - u_time*0.9)*0.002;
        vec2 ruv = vec2(v_uv.x + wob, ry);
        vec3 r = texture2D(u_a, ruv).rgb*0.9 + texture2D(u_c, ruv).rgb*0.7 + texture2D(u_p, ruv).rgb*0.35;
        // solo donde de verdad hay agua (en la playa, la arena no refleja)
        float wm = texture2D(u_m, vec2(v_uv.x, 1.0 - v_uv.y)).g;
        c = mix(c, r * vec3(0.62, 0.72, 0.9) * (1.0 - depth*0.75), wm);
      }
    }
    c = 1.0 - exp(-c*u_exp);
    c += (h21(gl_FragCoord.xy + fract(u_time)*31.0) - 0.5)/255.0;
    gl_FragColor = vec4(max(c, 0.0), 1.0);
  }`;

  function compile(vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + "\n" + src.slice(0, 200));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "a_c");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, a = {};
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) { const info = gl.getActiveUniform(p, i), nm = info.name.replace(/\[0\]$/, ""); u[nm] = gl.getUniformLocation(p, info.name); }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) { const info = gl.getActiveAttrib(p, i); a[info.name] = gl.getAttribLocation(p, info.name); }
    return { p, u, a };
  }

  /* ---------- Instancing (WebGL2 nativo o ANGLE_instanced_arrays) ---------- */
  const divisor = (loc, d) => (gl2 ? gl.vertexAttribDivisor(loc, d) : inst.vertexAttribDivisorANGLE(loc, d));
  const drawInst = (count) => (gl2 ? gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count) : inst.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, count));

  /* ---------- Objetivos de render ---------- */
  function target(w, h, useHdr) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (useHdr) {
      if (gl2) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.getExtension("OES_texture_half_float").HALF_FLOAT_OES, null);
    } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h, complete };
  }
  function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }

  function init(cv) {
    canvas = cv;
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" };
    gl = cv.getContext("webgl2", opts);
    gl2 = !!gl;
    if (!gl) {
      gl = cv.getContext("webgl", opts) || cv.getContext("experimental-webgl", opts);
      if (!gl) return false;
      inst = gl.getExtension("ANGLE_instanced_arrays");
      if (!inst) return false;
      hdr = !!(gl.getExtension("OES_texture_half_float") && gl.getExtension("EXT_color_buffer_half_float") && gl.getExtension("OES_texture_half_float_linear"));
    } else {
      hdr = !!gl.getExtension("EXT_color_buffer_float");
    }
    prog.fill = compile(VS_FULL, FS_FILL);
    prog.part = compile(VS_PART, FS_PART);
    prog.smoke = compile(VS_SMOKE, FS_SMOKE);
    prog.bg = compile(VS_FULL, FS_BG);
    prog.down = compile(VS_FULL, FS_DOWN);
    prog.blur = compile(VS_FULL, FS_BLUR);
    prog.comp = compile(VS_FULL, FS_COMP);

    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    ibuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, idata.byteLength, gl.DYNAMIC_DRAW);
    sbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sbuf); gl.bufferData(gl.ARRAY_BUFFER, sdata.byteLength, gl.DYNAMIC_DRAW);
    smokeTex = texFromCanvas(smokeAtlas());
    noiseTex = noiseTexture();
    ok = true;
    return true;
  }

  function texFromCanvas(c, tex) {
    tex = tex || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /* Ruido suave que se repite sin costuras (512×512), una sola vez al iniciar:
     R = nubes y neblina (grande), G y B = olas del agua (más fino). Con mipmaps, para que en el horizonte no titile. */
  function noiseTexture() {
    const N = 512, data = new Uint8Array(N * N * 4);
    const lattice = (period, seed) => {
      const v = new Float32Array(period * period);
      let x = seed * 9973 + 7;
      for (let i = 0; i < v.length; i++) { x = (x * 16807) % 2147483647; v[i] = x / 2147483647; }
      return v;
    };
    const fbm = (oct, base, seed) => {
      const out = new Float32Array(N * N);
      let amp = 0.5, tot = 0;
      for (let o = 0; o < oct; o++) {
        const per = base << o, lat = lattice(per, seed + o * 31), k = per / N;
        for (let y = 0; y < N; y++) {
          const fy = y * k, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), r0 = (y0 % per) * per, r1 = ((y0 + 1) % per) * per;
          for (let xx = 0; xx < N; xx++) {
            const fx = xx * k, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), c0 = x0 % per, c1 = (x0 + 1) % per;
            const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx, b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
            out[y * N + xx] += (a + (b - a) * sy) * amp;
          }
        }
        tot += amp; amp *= 0.5;
      }
      for (let i = 0; i < out.length; i++) out[i] /= tot;
      return out;
    };
    const r = fbm(5, 4, 1), g = fbm(4, 8, 2), b = fbm(4, 8, 3);
    for (let i = 0; i < N * N; i++) { data[i * 4] = r[i] * 255; data[i * 4 + 1] = g[i] * 255; data[i * 4 + 2] = b[i] * 255; data[i * 4 + 3] = 255; }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  }

  // Cuatro nubecitas de humo (ruido suave hecho con círculos difusos)
  function smokeAtlas() {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d");
    for (let v = 0; v < 4; v++) {
      const ox = (v % 2) * 128 + 64, oy = ((v / 2) | 0) * 128 + 64;
      for (let k = 0; k < 26; k++) {
        const a = rand(TAU), d = Math.pow(Math.random(), 0.8) * 30, rr = rand(14, 34);
        const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d;
        const gr = g.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, "rgba(255,255,255,0.16)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
      }
    }
    return c;
  }

  function resize(cssW, cssH, dpr) {
    if (!ok) return;
    scale = dpr;
    RW = Math.max(2, Math.round(cssW * dpr)); RH = Math.max(2, Math.round(cssH * dpr));
    canvas.width = RW; canvas.height = RH;
    [tPart, tHalf, tA, tB, tC, tD].forEach(freeTarget);
    tPart = target(RW, RH, hdr);
    if (hdr && !tPart.complete) { hdr = false; freeTarget(tPart); tPart = target(RW, RH, false); }
    const hw = Math.max(2, RW >> 1), hh = Math.max(2, RH >> 1);
    tHalf = target(hw, hh, hdr);
    tA = target(Math.max(2, RW >> 2), Math.max(2, RH >> 2), hdr); tB = target(tA.w, tA.h, hdr);
    tC = target(Math.max(2, RW >> 3), Math.max(2, RH >> 3), hdr); tD = target(tC.w, tC.h, hdr);
  }

  function setBackground(colorCanvas, maskCanvas, waterY, stars = 1, mist = 0, cloud = 0) {
    if (!ok) return;
    bgTex = texFromCanvas(colorCanvas, bgTex);
    maskTex = texFromCanvas(maskCanvas, maskTex);
    water = waterY;
    starAmt = stars;
    mistAmt = mist;
    cloudAmt = cloud;
  }
  // La luna del escenario (en px CSS), para su camino de luz sobre el agua
  function setMoon(m) { moon = m ? [m[0], m[1], 1] : [0, 0, 0]; }

  function bindQuad() {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    divisor(0, 0);
  }
  function full(p, tgt) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fb : null);
    gl.viewport(0, 0, tgt ? tgt.w : RW, tgt ? tgt.h : RH);
    gl.useProgram(p.p);
  }
  function tex(unit, t, loc) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, unit); }
  function pass(p, src, dst, setU) {
    full(p, dst);
    tex(0, src.tex, p.u.u_t);
    setU && setU(p);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function render(dt, time) {
    if (!ok || !bgTex) return;
    bindQuad();
    /* 1. Capa de partículas con persistencia */
    gl.enable(gl.BLEND);
    full(prog.fill, tPart);
    const tau = 0.04, decay = Math.exp(-dt / tau), d60 = Math.exp(-1 / 60 / tau);
    gl.blendColor(0, 0, 0, decay); gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA);
    gl.uniform4f(prog.fill.u.u_c, 0, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT); gl.blendFunc(gl.ONE, gl.ONE);
    const eps = hdr ? 0.0025 : 1.0 / 255;
    gl.uniform4f(prog.fill.u.u_c, eps, eps, eps, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.blendEquation(gl.FUNC_ADD);

    const count = P.write(idata, scale, time);
    if (count > 0) {
      gl.blendFunc(gl.ONE, gl.ONE);
      const p = prog.part;
      gl.useProgram(p.p);
      gl.uniform2f(p.u.u_res, RW, RH);
      gl.uniform1f(p.u.u_gain, ((1 - decay) / (1 - d60)) * (hdr ? 1 : 0.8));
      gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, idata.subarray(0, count * 9));
      const st = 36;
      gl.enableVertexAttribArray(p.a.a_p); gl.vertexAttribPointer(p.a.a_p, 4, gl.FLOAT, false, st, 0); divisor(p.a.a_p, 1);
      gl.enableVertexAttribArray(p.a.a_s); gl.vertexAttribPointer(p.a.a_s, 1, gl.FLOAT, false, st, 16); divisor(p.a.a_s, 1);
      gl.enableVertexAttribArray(p.a.a_col); gl.vertexAttribPointer(p.a.a_col, 4, gl.FLOAT, false, st, 20); divisor(p.a.a_col, 1);
      drawInst(count);
      divisor(p.a.a_p, 0); divisor(p.a.a_s, 0); divisor(p.a.a_col, 0);
      gl.disableVertexAttribArray(p.a.a_p); gl.disableVertexAttribArray(p.a.a_s); gl.disableVertexAttribArray(p.a.a_col);
      bindQuad();
    }
    gl.disable(gl.BLEND);

    /* 2. Bloom */
    pass(prog.down, tPart, tHalf, (p) => gl.uniform2f(p.u.u_px, 1 / RW, 1 / RH));
    pass(prog.down, tHalf, tA, (p) => gl.uniform2f(p.u.u_px, 1 / tHalf.w, 1 / tHalf.h));
    pass(prog.blur, tA, tB, (p) => gl.uniform2f(p.u.u_dir, 1 / tA.w, 0));
    pass(prog.blur, tB, tA, (p) => gl.uniform2f(p.u.u_dir, 0, 1 / tA.h));
    const wide = Q.level >= 1;
    if (wide) {
      pass(prog.down, tA, tC, (p) => gl.uniform2f(p.u.u_px, 1 / tA.w, 1 / tA.h));
      pass(prog.blur, tC, tD, (p) => gl.uniform2f(p.u.u_dir, 1 / tC.w, 0));
      pass(prog.blur, tD, tC, (p) => gl.uniform2f(p.u.u_dir, 0, 1 / tC.h));
    }

    /* 3. Pantalla: cielo */
    const b = prog.bg;
    full(b, null);
    tex(0, bgTex, b.u.u_bg); tex(1, maskTex, b.u.u_mask); tex(2, noiseTex, b.u.u_noise);
    gl.uniform2f(b.u.u_res, RW, RH);
    gl.uniform1f(b.u.u_time, time); gl.uniform1f(b.u.u_dpr, scale);
    gl.uniform1f(b.u.u_water, water > 0 ? water * scale : -1);
    gl.uniform1f(b.u.u_stars, starAmt); gl.uniform1f(b.u.u_mist, mistAmt); gl.uniform1f(b.u.u_cloud, cloudAmt); gl.uniform3f(b.u.u_moon, moon[0], moon[1], moon[2]);
    Lights.top(L4, L3, scale);
    gl.uniform4fv(b.u.u_L, L4); gl.uniform3fv(b.u.u_LC, L3);
    const fl = Lights.sky; gl.uniform3f(b.u.u_flash, fl[0], fl[1], fl[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* humo */
    const sc = Smoke.write(sdata, scale);
    gl.enable(gl.BLEND);
    if (sc > 0) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const s = prog.smoke;
      gl.useProgram(s.p);
      gl.uniform2f(s.u.u_res, RW, RH);
      tex(0, smokeTex, s.u.u_t);
      gl.bindBuffer(gl.ARRAY_BUFFER, sbuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sdata.subarray(0, sc * 9));
      const st = 36;
      gl.enableVertexAttribArray(s.a.a_p); gl.vertexAttribPointer(s.a.a_p, 4, gl.FLOAT, false, st, 0); divisor(s.a.a_p, 1);
      gl.enableVertexAttribArray(s.a.a_col); gl.vertexAttribPointer(s.a.a_col, 4, gl.FLOAT, false, st, 16); divisor(s.a.a_col, 1);
      gl.enableVertexAttribArray(s.a.a_v); gl.vertexAttribPointer(s.a.a_v, 1, gl.FLOAT, false, st, 32); divisor(s.a.a_v, 1);
      drawInst(sc);
      divisor(s.a.a_p, 0); divisor(s.a.a_col, 0); divisor(s.a.a_v, 0);
      gl.disableVertexAttribArray(s.a.a_p); gl.disableVertexAttribArray(s.a.a_col); gl.disableVertexAttribArray(s.a.a_v);
      bindQuad();
    }

    /* partículas + bloom, con tonemap, sumadas encima */
    gl.blendFunc(gl.ONE, gl.ONE);
    const c = prog.comp;
    full(c, null);
    tex(0, tPart.tex, c.u.u_p); tex(1, tA.tex, c.u.u_a); tex(2, (wide ? tC : tA).tex, c.u.u_c); tex(3, maskTex, c.u.u_m);
    gl.uniform1f(c.u.u_ba, 0.55); gl.uniform1f(c.u.u_bc, wide ? 0.6 : 0.3);
    gl.uniform1f(c.u.u_water, water > 0 ? water / (RH / scale) : -1);
    gl.uniform1f(c.u.u_time, time); gl.uniform1f(c.u.u_exp, 1.1);
    gl.uniform2f(c.u.u_res, RW, RH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
  }

  function clearTrails() {
    if (!ok || !tPart) return;
    [tPart, tHalf, tA, tB, tC, tD].forEach((t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return {
    init, resize, render, setBackground, setMoon, clearTrails,
    get ok() { return ok; }, get hdr() { return hdr; }, get gl2() { return gl2; },
    get scale() { return scale; }, get size() { return [RW, RH]; },
    lose() { ok = false; bgTex = maskTex = smokeTex = noiseTex = null; },
  };
})();
