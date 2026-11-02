// MAGNUM OPUS engine: timeline, scene shaders, bloom + post, 2D overlay, live playback
// and a deterministic capture API for rendering the MP4.
//
// Everything on screen is a pure function of the time t (seconds, 0..30). Scenes are
// fragment shaders registered with MO.scene(); the typography layer is a 2D canvas
// drawn by functions registered with MO.overlay(). See scenes/*.js and overlay.js.
(() => {
  'use strict';
  const S = window.SCORE;
  const BEAT = 60 / S.bpm, BAR = BEAT * S.beatsPerBar, STEP = BEAT / S.stepsPerBeat, DUR = S.duration;
  const params = new URLSearchParams(location.search);

  const MO = window.MO = {
    S, BEAT, BAR, STEP, DUR, params,
    scenes: [], overlays: [], pending: [],
    reduced: false,      // less flashing / motion
    quality: 1,          // scene render scale (live mode adapts it)
    t: 0,
    capture: params.has('capture'),
  };

  // ---------------------------------------------------------------- timeline helpers
  MO.beatTime = (b) => b * BEAT;
  MO.barTime = (bar, beat = 0, step = 0) => bar * BAR + beat * BEAT + step * STEP;
  MO.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  MO.mix = (a, b, k) => a + (b - a) * k;
  MO.remap = (x, a, b) => MO.clamp((x - a) / (b - a));
  MO.smooth = (x) => { x = MO.clamp(x); return x * x * (3 - 2 * x); };
  MO.easeOut = (x) => { x = MO.clamp(x); return 1 - Math.pow(1 - x, 3); };
  MO.easeIn = (x) => { x = MO.clamp(x); return x * x * x; };
  MO.easeInOut = (x) => { x = MO.clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  // keyframes: [[t0, v0], [t1, v1], ...] with values numbers or arrays; ease optional per call
  MO.keys = (k, t, ease = MO.smooth) => {
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (t < k[i][0]) {
        const a = k[i - 1], b = k[i], u = ease((t - a[0]) / (b[0] - a[0]));
        return Array.isArray(a[1]) ? a[1].map((v, j) => v + (b[1][j] - v) * u) : a[1] + (b[1] - a[1]) * u;
      }
    }
    return k[k.length - 1][1];
  };
  MO.scene = (def) => { MO.scenes.push(def); };
  MO.overlay = (fn) => { MO.overlays.push(fn); };
  MO.waitFor = (p) => { MO.pending.push(p); };
  MO.section = (t) => S.sections.find((s) => t >= s.bars[0] * BAR && t < s.bars[1] * BAR) || S.sections[S.sections.length - 1];

  // ---------------------------------------------------------------- score events
  function parse(rows, vel = 0.8) {
    const out = [];
    rows.forEach((row, bar) => {
      for (let s = 0; s < 16; s++) {
        const c = row[s];
        if (c === 'x' || c === 'X') out.push({ t: MO.barTime(bar, 0, s), v: c === 'X' ? 1 : vel });
        else if (c === 'r') { out.push({ t: MO.barTime(bar, 0, s), v: 0.7 }); out.push({ t: MO.barTime(bar, 0, s + 0.5), v: 0.7 }); }
      }
    });
    return out;
  }
  MO.events = {};
  for (const k in S.drums) MO.events[k] = parse(S.drums[k]);
  MO.events.hits = S.hits.map((h) => ({ t: h.beat * BEAT, v: 1, type: h.type })).sort((a, b) => a.t - b.t);
  MO.events.chakras = S.chakras.map((c, i) => ({ t: c.beat * BEAT, v: 1, i }));
  // last event at or before t (binary search); returns {e, i} or null
  MO.last = (name, t) => {
    const ev = MO.events[name]; let lo = 0, hi = ev.length - 1, best = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (ev[m].t <= t + 1e-6) { best = m; lo = m + 1; } else hi = m - 1; }
    return best < 0 ? null : { e: ev[best], i: best };
  };
  // decaying envelope: velocity * exp(-(t - hit) / decay)
  MO.env = (name, t, decay) => { const l = MO.last(name, t); return l ? l.e.v * Math.exp(-(t - l.e.t) / decay) : 0; };
  MO.count = (name, t) => { const l = MO.last(name, t); return l ? l.i + 1 : 0; };
  MO.energy = (t) => { const b = t / BAR, i = Math.min(S.energy.length - 1, Math.floor(b)), j = Math.min(S.energy.length - 1, i + 1); return MO.mix(S.energy[i], S.energy[j], MO.smooth(b - i)); };
  MO.chordIndex = (t) => Math.min(S.chords.length - 1, Math.floor(t / BAR));
  // words of the rap / hook with absolute times: [{text, t, line, lineIndex}]
  MO.words = (part) => S.vocals[part].flatMap((line, li) => line.words.map(([w, step]) => ({ text: w, t: MO.barTime(line.bar, 0, step), line, li })));

  MO.globals = (t) => ({
    uTime: t,
    uBeat: t / BEAT,
    uBar: t / BAR,
    uKick: MO.env('kick', t, 0.12),
    uClap: MO.env('clap', t, 0.16),
    uHat: MO.env('closedHat', t, 0.05),
    uOpenHat: MO.env('openHat', t, 0.11),
    uRoll: MO.env('roll', t, 0.07),
    uCrash: MO.env('hits', t, 0.7),
    uKickN: MO.count('kick', t),
    uClapN: MO.count('clap', t),
    uEnergy: MO.energy(t),
    uChord: MO.chordIndex(t),
    uReduced: MO.reduced ? 1 : 0,
  });

  // post effects from SCORE.fx, plus a gentle kick pump in the high-energy sections
  function fxAt(t) {
    let flash = 0, flashColor = [1, 1, 1], impact = 0, impactPol = 1, shake = 0;
    for (const f of S.fx) {
      const t0 = f.beat * BEAT; if (t < t0) continue;
      const dt = t - t0;
      if (f.type === 'flash') { const a = f.amount * Math.exp(-dt / f.decay); if (a > flash) { flash = a; flashColor = f.color; } }
      else if (f.type === 'impact') { if (dt < f.duration) { impact = 1; impactPol = f.polarity || 1; } }
      else if (f.type === 'shake') shake += f.amount * Math.exp(-dt / f.decay);
    }
    const e = MO.energy(t);
    const pump = e > 0.6 ? MO.env('kick', t, 0.1) * (e - 0.6) * 0.03 : 0;
    if (MO.reduced) { flash *= 0.25; impact = 0; shake *= 0.3; }
    // chromatic aberration follows the shake but is capped so a hit never smears the frame
    return { flash, flashColor, impact, impactPol, shake, zoom: MO.reduced ? pump * 0.3 : pump, ca: 0.5 + Math.min(2.0, 6 * shake * 30) };
  }
  MO.fxAt = fxAt;

  // ---------------------------------------------------------------- WebGL plumbing
  let gl, canvas, hdr = false, quad, W = 1280, H = 720;
  let sceneT = null, bloomLv = [], overlayCanvas, overlayCtx, overlayTex;
  let vsShader = null;
  let ready = false;       // programs and targets exist for the current context
  let warming = false;     // init's pre-warm may render before the engine is ready for the page
  let stale = false;       // GL objects belong to a context that was lost (drop them, don't delete them)
  let initGen = 0;         // a newer MO.init call supersedes an older one still in flight
  const progs = {};
  MO.ready = false;
  MO.contextLost = false;
  const overlayErrors = new Set();
  MO.noOverlay = params.has('nooverlay');
  const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS_DOWN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uHalf; uniform float uPrefilter, uThreshold, uKnee;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv - uHalf).rgb + texture(uSrc, vUv + uHalf).rgb;
  c += texture(uSrc, vUv + vec2(uHalf.x, -uHalf.y)).rgb + texture(uSrc, vUv - vec2(uHalf.x, -uHalf.y)).rgb;
  c /= 8.0;
  if (uPrefilter > 0.5) {
    c = min(c, vec3(60.0));
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee); rq = rq * rq / (4.0 * uKnee + 1e-4);
    c *= max(rq, br - uThreshold) / max(br, 1e-4);
  }
  o = vec4(c, 1.0);
}`;
  const FS_UP = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uHalf;
void main() {
  vec2 h = uHalf;
  vec3 c = texture(uSrc, vUv + vec2(-2.0 * h.x, 0.0)).rgb + texture(uSrc, vUv + vec2(2.0 * h.x, 0.0)).rgb
         + texture(uSrc, vUv + vec2(0.0, -2.0 * h.y)).rgb + texture(uSrc, vUv + vec2(0.0, 2.0 * h.y)).rgb
         + 2.0 * (texture(uSrc, vUv + vec2(-h.x, h.y)).rgb + texture(uSrc, vUv + vec2(h.x, h.y)).rgb
         + texture(uSrc, vUv + vec2(h.x, -h.y)).rgb + texture(uSrc, vUv + vec2(-h.x, -h.y)).rgb);
  o = vec4(c / 12.0, 1.0);
}`;
  const FS_POST = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom, uOverlay;
uniform vec2 uRes, uShakeOff; uniform vec3 uFlashColor;
uniform float uTime, uBloomStrength, uExposure, uFlash, uImpact, uImpactPol, uCA, uGrain, uVignette, uHasOverlay, uZoom;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 uv = (vUv - 0.5) * (1.0 - uZoom) + 0.5 + uShakeOff;
  vec2 dc = uv - 0.5;
  vec2 off = dc * uCA * 0.012 * dot(dc, dc);
  vec3 col = vec3(texture(uScene, uv + off).r, texture(uScene, uv).g, texture(uScene, uv - off).b);
  col += texture(uBloom, uv).rgb * uBloomStrength;
  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));
  // the flash washes the picture but not the typography, so subtitles stay readable through it
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
  vec4 ov = texture(uOverlay, vUv) * uHasOverlay;
  col = col * (1.0 - ov.a) + ov.rgb;
  if (uImpact > 0.0) {
    // anime impact frame: two-tone luminance key; polarity -1 keeps light lines on black
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    float k = smoothstep(0.32, 0.42, l);
    if (uImpactPol < 0.0) k = 1.0 - k;
    vec3 imp = mix(vec3(1.0, 0.96, 0.90), vec3(0.05, 0.0, 0.02), k);
    col = mix(col, imp, uImpact);
  }
  col *= 1.0 - uVignette * dot(dc, dc) * 1.5;
  col += (h21(gl_FragCoord.xy + fract(uTime * 7.13) * 413.0) - 0.5) * uGrain;
  o = vec4(col, 1.0);
}`;

  const ERROR_FS = `
void main() {
  vec2 p = gl_FragCoord.xy / uRes.y * 12.0;
  float c = mod(floor(p.x) + floor(p.y), 2.0);
  fragColor = vec4(mix(vec3(0.6, 0.0, 0.5), vec3(0.1, 0.0, 0.1), c), 1.0);
}`;
  // Programs are built in two phases. startProgram() only issues compile + link, without asking
  // for any status, so the driver can work on every program at once (in parallel where
  // KHR_parallel_shader_compile exists) while the page keeps painting. finishProgram() then
  // reads the result, which blocks only if that program is not done yet.
  const lostError = () => Object.assign(new Error('The WebGL context was lost'), { contextLost: true });
  function shaderLog(s, name, lineOffset) {
    const log = gl.getShaderInfoLog(s) || '';
    return `[shader ${name}] ` + log.replace(/ERROR: 0:(\d+)/g, (m, n) => `ERROR: ${name} line ${Number(n) - lineOffset}`);
  }
  function startProgram(fsSrc, name, lineOffset = 0) {
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    const p = gl.createProgram();
    gl.attachShader(p, vsShader); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    return { p, fs, name, lineOffset };
  }
  function finishProgram(job) {
    const { p, fs, name, lineOffset } = job;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (gl.isContextLost()) throw lostError();
      let msg;
      if (!gl.getShaderParameter(vsShader, gl.COMPILE_STATUS)) msg = shaderLog(vsShader, name + ' (vs)', 0);
      else if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) msg = shaderLog(fs, name, lineOffset);
      else msg = `[link ${name}] ${gl.getProgramInfoLog(p)}`;
      gl.deleteProgram(p); gl.deleteShader(fs);
      throw new Error(msg);
    }
    gl.deleteShader(fs);   // flagged only; freed with the program
    return programInfo(p, name);
  }
  function program(fsSrc, name, lineOffset = 0) { return finishProgram(startProgram(fsSrc, name, lineOffset)); }
  function programInfo(p, name) {
    const info = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const u = gl.getActiveUniform(p, i);
      const base = u.name.replace(/\[0\]$/, '');
      info[base] = { loc: gl.getUniformLocation(p, u.name), type: u.type, size: u.size };
    }
    return { p, u: info, name };
  }
  function setUniforms(pr, vals) {
    for (const k in vals) {
      const u = pr.u[k]; if (!u) continue;
      const v = vals[k];
      switch (u.type) {
        case gl.FLOAT: u.size > 1 ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
        case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: u.size > 1 ? gl.uniform1iv(u.loc, v) : gl.uniform1i(u.loc, v); break;
        case gl.FLOAT_MAT2: gl.uniformMatrix2fv(u.loc, false, v); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
        default: break;
      }
    }
  }
  function target(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok && hdr) { hdr = false; gl.deleteTexture(tex); gl.deleteFramebuffer(fb); return target(w, h); }
    return { tex, fb, w, h };
  }
  function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }

  function buildTargets() {
    const sw = Math.max(64, Math.round(W * MO.quality)), sh = Math.max(36, Math.round(H * MO.quality));
    if (sceneT && sceneT.w === sw && sceneT.h === sh) return;
    freeTarget(sceneT); bloomLv.forEach(freeTarget); bloomLv = [];
    sceneT = target(sw, sh);
    let w = sw, h = sh;
    for (let i = 0; i < 6; i++) { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); bloomLv.push(target(w, h)); }
  }

  function draw() { gl.drawArrays(gl.TRIANGLES, 0, 3); }

  // ---------------------------------------------------------------- init
  // Yield to the browser so it can paint (status text, progress) between steps. The timeout
  // keeps init moving in a background tab, where requestAnimationFrame does not run.
  const nextFrame = () => new Promise((res) => {
    let done = false; const go = () => { if (!done) { done = true; res(); } };
    requestAnimationFrame(go); setTimeout(go, 50);
  });

  // Forget every GL object. After a context loss they are already gone, so only drop them.
  function releaseGL() {
    const del = gl && !stale && !gl.isContextLost();
    if (del) {
      for (const k in progs) if (progs[k]) gl.deleteProgram(progs[k].p);
      for (const sc of MO.scenes) if (sc.prog) gl.deleteProgram(sc.prog.p);
      freeTarget(sceneT); bloomLv.forEach(freeTarget);
      if (overlayTex) gl.deleteTexture(overlayTex);
      if (quad) gl.deleteBuffer(quad);
      if (vsShader) gl.deleteShader(vsShader);
    }
    for (const k in progs) delete progs[k];
    for (const sc of MO.scenes) sc.prog = null;
    sceneT = null; bloomLv = []; overlayTex = null; quad = null; vsShader = null;
    stale = false;
  }

  // MO.init is re-entrant: calling it again (for example after the WebGL context was lost and
  // restored) rebuilds every program and target on the canvas's current context.
  // opts: { canvas, width, height, preserve, onProgress(done, total), warmAt (seconds), warm (false skips the pre-warm) }
  MO.init = async function init(opts) {
    const gen = ++initGen;
    const check = () => {
      if (gen !== initGen) throw new Error('MO.init was superseded by a newer call');
      if (gl.isContextLost()) throw lostError();
    };
    ready = false; MO.ready = false;
    if (canvas && canvas !== opts.canvas) stale = true;   // a different canvas: never touch the old objects
    canvas = opts.canvas;
    W = opts.width; H = opts.height;
    canvas.width = W; canvas.height = H;
    if (!canvas.__moLossHooks) {
      canvas.__moLossHooks = true;
      // preventDefault lets the browser restore the context; the page decides what to show meanwhile
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ready = false; MO.ready = false; stale = true; MO.contextLost = true; });
      canvas.addEventListener('webglcontextrestored', () => { MO.contextLost = false; });
    }
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    if (gl.isContextLost()) throw lostError();
    MO.gl = gl;
    MO.contextLost = false;
    releaseGL();
    hdr = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    const parallel = gl.getExtension('KHR_parallel_shader_compile');
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // the overlay canvas survives a context loss; only its texture is per context
    if (!overlayCanvas) { overlayCanvas = document.createElement('canvas'); overlayCtx = overlayCanvas.getContext('2d'); }
    if (overlayCanvas.width !== W || overlayCanvas.height !== H) { overlayCanvas.width = W; overlayCanvas.height = H; }
    overlayTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, overlayTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

    // a section without a registered scene gets a visible placeholder
    for (const sec of S.sections) {
      if (!MO.scenes.some((sc) => (sc.section || sc.id) === sec.id)) MO.scenes.push({ id: sec.id + '-missing', section: sec.id, fs: ERROR_FS });
    }
    for (const sc of MO.scenes) {
      const sec = S.sections.find((s) => s.id === sc.section || s.id === sc.id);
      sc.from = sc.from ?? (sec ? sec.bars[0] * BAR : 0);
      sc.to = sc.to ?? (sec ? sec.bars[1] * BAR : DUR);
    }
    MO.scenes.sort((a, b) => a.from - b.from);

    // phase 1: issue every compile and link without querying anything
    const prefix = window.MO_HEADER + window.MO_LIB + '\n#line 1\n';
    const prefixLines = 0; // #line 1 resets numbering to the scene's own source
    vsShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsShader, VS); gl.compileShader(vsShader);
    const jobs = [
      { key: 'down', job: startProgram(FS_DOWN, 'bloom-down') },
      { key: 'up', job: startProgram(FS_UP, 'bloom-up') },
      { key: 'post', job: startProgram(FS_POST, 'post') },
      ...MO.scenes.map((sc) => ({ sc, job: startProgram(prefix + sc.fs, 'scene ' + sc.id, prefixLines) })),
    ];
    // capture renders offline (no hitch to avoid, and a few stills would pay for every scene): no warm-up
    const warm = !MO.capture && opts.warm !== false;
    const total = jobs.length + (warm ? MO.scenes.length + 1 : 0);
    const report = (n) => { try { opts.onProgress && opts.onProgress(n, total); } catch (e) { /* UI only */ } };
    report(0);
    await nextFrame(); check();

    // phase 2: wait for completion without blocking where the driver can tell us, then read results
    if (parallel) {
      for (;;) {
        const done = jobs.filter((j) => gl.getProgramParameter(j.job.p, parallel.COMPLETION_STATUS_KHR)).length;
        report(done);
        if (done === jobs.length) break;
        await nextFrame(); check();
      }
    }
    let slice = performance.now();
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      if (j.key) progs[j.key] = finishProgram(j.job);   // engine programs must work
      else {
        const sc = j.sc;
        try { sc.prog = finishProgram(j.job); }
        catch (e) {
          if (e.contextLost) throw e;
          // one broken scene must not take the whole piece down: log it and draw a warning pattern
          console.error(String(e.message || e));
          sc.error = String(e.message || e);
          sc.prog = program(prefix + ERROR_FS, 'scene ' + sc.id + ' (error)', prefixLines);
          sc.uniforms = null;
        }
      }
      report(i + 1);
      // without the extension each status read can block; give the page a frame every ~40 ms
      if (performance.now() - slice > 40) { await nextFrame(); check(); slice = performance.now(); }
    }

    buildTargets();
    if (warm) {
      // Pre-warm: draw every scene once into the smallest bloom target (same format and blend
      // state as the scene pass), then one real frame for the bloom and post passes, and wait for
      // the GPU each time. Drivers that finish compiling on first use (ANGLE on Metal/D3D,
      // SwiftShader) then do it here, under "Compiling shaders…", instead of at a shot cut.
      const waitGPU = async () => {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        if (!sync) return;
        try {
          // a sync object's status only updates between tasks: poll without blocking the page
          while (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) { await new Promise((r) => setTimeout(r, 8)); check(); }
        } finally { gl.deleteSync(sync); }
      };
      let n = jobs.length;
      warming = true;
      try {
        for (const sc of MO.scenes) {
          buildTargets();   // picks up a resize that arrived meanwhile
          const tiny = bloomLv[bloomLv.length - 1];
          gl.bindFramebuffer(gl.FRAMEBUFFER, tiny.fb); gl.viewport(0, 0, tiny.w, tiny.h);
          gl.disable(gl.BLEND);
          gl.useProgram(sc.prog.p);
          const t = Math.min(DUR - 1e-3, sc.from + 0.05);
          const u = MO.globals(t);
          u.uRes = [tiny.w, tiny.h]; u.uLocal = t - sc.from; u.uDur = sc.to - sc.from;
          setUniforms(sc.prog, u);
          if (sc.uniforms) { try { setUniforms(sc.prog, sc.uniforms(t, t - sc.from, MO) || {}); } catch (e) { /* reported on first real render */ } }
          draw();
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          await waitGPU(); check(); report(++n);
        }
        MO.render(MO.clamp(+opts.warmAt || 0, 0, DUR - 1e-3));   // the frame the page is about to show
        await waitGPU(); check(); report(++n);
      } finally { warming = false; }
    }

    await Promise.all(MO.pending);
    check();
    MO.hdr = hdr;
    ready = true; MO.ready = true;
    return MO;
  };

  // Safe to call at any time: before init (or while it runs) it only records the size.
  MO.resize = function resize(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    if (canvas) { canvas.width = W; canvas.height = H; }
    if (overlayCanvas) { overlayCanvas.width = W; overlayCanvas.height = H; }
    if (!ready) return;
    sceneT && freeTarget(sceneT); sceneT = null; buildTargets();
  };
  MO.setQuality = function setQuality(q) { MO.quality = MO.clamp(q, 0.3, 1); if (ready) buildTargets(); };
  MO.size = () => ({ W, H, sw: sceneT ? sceneT.w : 0, sh: sceneT ? sceneT.h : 0, hdr });

  MO.sceneAt = (t) => {
    let pick = MO.scenes[0];
    for (const sc of MO.scenes) if (t >= sc.from && t < sc.to) pick = sc;
    if (t >= DUR) pick = MO.scenes[MO.scenes.length - 1];
    return pick;
  };

  // ---------------------------------------------------------------- render one frame
  MO.render = function render(t) {
    MO.t = t;
    if (!(ready || warming) || gl.isContextLost()) return null;   // nothing to draw with until (re)init
    buildTargets();
    const sc = MO.sceneAt(t);
    const local = t - sc.from;
    gl.disable(gl.BLEND);

    // 1. scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fb);
    gl.viewport(0, 0, sceneT.w, sceneT.h);
    gl.useProgram(sc.prog.p);
    const u = MO.globals(t);
    u.uRes = [sceneT.w, sceneT.h]; u.uLocal = local; u.uDur = sc.to - sc.from;
    setUniforms(sc.prog, u);
    if (sc.uniforms) {
      try { setUniforms(sc.prog, sc.uniforms(t, local, MO) || {}); }
      catch (e) { const m = String(e && e.stack || e); if (!overlayErrors.has(m)) { overlayErrors.add(m); console.error(`[scene ${sc.id} uniforms] ` + m); } }
    }
    draw();

    // 2. bloom: prefilter + dual-filter down, then up with additive blend
    let src = sceneT;
    gl.useProgram(progs.down.p);
    for (let i = 0; i < bloomLv.length; i++) {
      const dst = bloomLv[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
      setUniforms(progs.down, { uSrc: 0, uHalf: [0.5 / src.w, 0.5 / src.h], uPrefilter: i === 0 ? 1 : 0, uThreshold: typeof sc.bloomThreshold === 'function' ? sc.bloomThreshold(t, local, MO) : (sc.bloomThreshold ?? 0.85), uKnee: 0.5 });
      draw(); src = dst;
    }
    gl.useProgram(progs.up.p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = bloomLv.length - 1; i > 0; i--) {
      const s = bloomLv[i], d = bloomLv[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb); gl.viewport(0, 0, d.w, d.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex);
      setUniforms(progs.up, { uSrc: 0, uHalf: [0.5 / s.w, 0.5 / s.h] });
      draw();
    }
    gl.disable(gl.BLEND);

    // 3. overlay (2D canvas)
    overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    overlayCtx.clearRect(0, 0, W, H);
    let drew = false;
    if (!MO.noOverlay) for (const fn of MO.overlays) {
      overlayCtx.save();
      try { if (fn(overlayCtx, t, W, H, MO)) drew = true; }
      catch (e) { const m = String(e && e.stack || e); if (!overlayErrors.has(m)) { overlayErrors.add(m); console.error('[overlay] ' + m); } }
      overlayCtx.restore();
    }
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, overlayTex);
    if (drew) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlayCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }

    // 4. post to screen
    const fx = fxAt(t);
    const pp = (v, d) => (typeof v === 'function' ? v(t, local, MO) : (v ?? d));
    const sh = fx.shake;
    // 5-8 Hz components: well below the 15 Hz Nyquist limit of a 30 fps video, so the shake reads the same in the MP4 and live
    const shakeOff = [sh * (Math.sin(t * 38.3) + Math.sin(t * 52.9 + 1.3)) * 0.5, sh * (Math.sin(t * 45.6 + 2.1) + Math.sin(t * 31.4)) * 0.5 * (16 / 9)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(progs.post.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomLv[0].tex);
    setUniforms(progs.post, {
      uScene: 0, uBloom: 1, uOverlay: 2, uRes: [W, H], uTime: t,
      uBloomStrength: pp(sc.bloom, 0.6), uExposure: pp(sc.exposure, 1.0),
      uFlash: fx.flash, uFlashColor: fx.flashColor, uImpact: fx.impact, uImpactPol: fx.impactPol, uCA: fx.ca + pp(sc.ca, 0),
      uGrain: MO.grain ?? 0.025, uVignette: pp(sc.vignette, 0.35), uHasOverlay: drew ? 1 : 0,
      uShakeOff: shakeOff, uZoom: fx.zoom,
    });
    draw();
    return sc.id;
  };

  // ---------------------------------------------------------------- capture API (tools/render-video.cjs)
  if (MO.capture) {
    window.__capture = {
      ready: null,
      frame(t) {
        // gl.finish() does not block on ANGLE/SwiftShader; a 1-pixel readback forces the frame to complete.
        const t0 = performance.now(); const id = MO.render(t);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        return { id, ms: performance.now() - t0 };
      },
      rgba() {
        const px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let s = ''; const CH = 0x8000;
        for (let i = 0; i < px.length; i += CH) s += String.fromCharCode.apply(null, px.subarray(i, i + CH));
        return btoa(s);
      },
      png() { return canvas.toDataURL('image/png'); },
      jpeg(q = 0.92) { return canvas.toDataURL('image/jpeg', q); },
      size() { return { W, H, hdr, scenes: MO.scenes.map((s) => [s.id, +s.from.toFixed(3), +s.to.toFixed(3)]) }; },
    };
  }
})();
