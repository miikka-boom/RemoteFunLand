// You Are Slime: drawing.
// The street is Canvas 2D. Goo is drawn as metaballs: every slime particle splats a soft
// kernel into one channel of a half-resolution WebGL framebuffer (R = player, G = pink,
// B = blue, A = loose food goo), then a full-screen pass thresholds the field, shades it
// from its gradient (rim, gloss, glow) and the result is copied onto the 2D canvas.
'use strict';

const COLORS = [
  [0.16, 1.0, 0.42],   // P1 green
  [1.0, 0.36, 0.45],   // P2 pink
  [0.22, 0.58, 1.0],   // P3 blue
  [1.0, 0.80, 0.22],   // food goo
];
const CSS_COL = ['#2bff6b', '#ff5c73', '#3894ff', '#ffcc38'];
const RF = 3.0 * R;    // metaball kernel radius

const View = {
  cv: null, ctx: null, W: 0, H: 0, dpr: 1,
  camX: 0, camY: 0, z: 1, zT: 1, shake: 0,
  gl: null, rx: new Float64Array(MAXP), ry: new Float64Array(MAXP),
  fx: [], layers: [], tiles: {},
};

// ---------- WebGL metaballs
const FIELD_VS = `
attribute vec2 aPos; attribute vec2 aCorner; attribute vec4 aMask;
uniform vec2 uCam; uniform float uZ; uniform vec2 uRes; uniform float uRad;
varying vec2 vC; varying vec4 vM;
void main(){
  vC = aCorner; vM = aMask;
  vec2 p = (aPos - uCam) * uZ + aCorner * uRad * uZ;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;
const FIELD_FS = `
precision mediump float;
varying vec2 vC; varying vec4 vM;
void main(){
  float d = dot(vC, vC);
  if (d >= 1.0) discard;
  float w = 1.0 - d; w = w * w * w;
  gl_FragColor = vM * w * 0.5;
}`;
const COMP_VS = `
attribute vec2 aP; varying vec2 vUv;
void main(){ vUv = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;
const COMP_FS = `
precision mediump float;
uniform sampler2D uF; uniform vec2 uPx; uniform vec2 uOff;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
varying vec2 vUv;
const float T = 0.3;
float hgt(vec2 uv, vec4 s){ return smoothstep(T - 0.02, T + 0.34, dot(texture2D(uF, uv), s)); }
void main(){
  vec4 f = texture2D(uF, vUv);
  float m = max(max(f.r, f.g), max(f.b, f.a));
  if (m < 0.03) { gl_FragColor = vec4(0.0); return; }
  vec4 sel = step(vec4(m - 0.0001), f);
  sel /= max(dot(sel, vec4(1.0)), 1.0);
  vec3 base = uC0 * sel.r + uC1 * sel.g + uC2 * sel.b + uC3 * sel.a;
  // edge coverage from the 1-pixel gradient
  float l = dot(texture2D(uF, vUv - vec2(uPx.x, 0.0)), sel);
  float r = dot(texture2D(uF, vUv + vec2(uPx.x, 0.0)), sel);
  float up = dot(texture2D(uF, vUv + vec2(0.0, uPx.y)), sel);
  float dn = dot(texture2D(uF, vUv - vec2(0.0, uPx.y)), sel);
  float gm = length(vec2(r - l, dn - up) * 0.5);
  float a = clamp((m - T) / max(gm, 0.0005) + 0.5, 0.0, 1.0);
  // surface normal from a wider sample of the height, so the rim is a soft dome
  float hl = hgt(vUv - vec2(uOff.x, 0.0), sel), hr = hgt(vUv + vec2(uOff.x, 0.0), sel);
  float hu = hgt(vUv + vec2(0.0, uOff.y), sel), hd = hgt(vUv - vec2(0.0, uOff.y), sel);
  vec2 g = vec2(hr - hl, hd - hu);                 // screen y down
  vec3 n = normalize(vec3(-g * 1.6, 1.0));
  vec3 L = normalize(vec3(-0.5, -0.8, 0.7));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 18.0);
  float h = hgt(vUv, sel);
  vec3 col = base * (0.5 + 0.55 * diff);
  col = mix(base * 0.42, col, 0.35 + 0.65 * h);   // darker, translucent-looking rim
  col += base * 0.22 * h;
  col += vec3(1.0) * spec * 0.8 * smoothstep(0.0, 0.3, h);
  float glow = smoothstep(0.03, T, m) * (1.0 - a) * 0.3;
  gl_FragColor = vec4(col * a + base * glow, a + glow * 0.35);
}`;

function initGL() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = (vs, fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  try {
    const G1 = { c, gl, field: prog(FIELD_VS, FIELD_FS), comp: prog(COMP_VS, COMP_FS) };
    G1.vb = gl.createBuffer();
    G1.data = new Float32Array(MAXP * 6 * 8);
    G1.tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, G1.tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    G1.tex = gl.createTexture();
    G1.fb = gl.createFramebuffer();
    G1.fw = G1.fh = 0;
    const loc = (p, n) => gl.getUniformLocation(p, n);
    G1.u = {
      cam: loc(G1.field, 'uCam'), z: loc(G1.field, 'uZ'), res: loc(G1.field, 'uRes'), rad: loc(G1.field, 'uRad'),
      f: loc(G1.comp, 'uF'), px: loc(G1.comp, 'uPx'), off: loc(G1.comp, 'uOff'),
      c: [0, 1, 2, 3].map(k => loc(G1.comp, 'uC' + k)),
    };
    G1.a = {
      pos: gl.getAttribLocation(G1.field, 'aPos'), corner: gl.getAttribLocation(G1.field, 'aCorner'),
      mask: gl.getAttribLocation(G1.field, 'aMask'), p: gl.getAttribLocation(G1.comp, 'aP'),
    };
    return G1;
  } catch (e) {
    console.warn('WebGL slime disabled:', e.message);
    return null;
  }
}

function sizeGL(G1, w, h) {
  const gl = G1.gl;
  if (G1.c.width !== w || G1.c.height !== h) { G1.c.width = w; G1.c.height = h; }
  const fw = Math.max(1, Math.round(w * 0.5)), fh = Math.max(1, Math.round(h * 0.5));
  if (fw === G1.fw && fh === G1.fh) return;
  G1.fw = fw; G1.fh = fh;
  gl.bindTexture(gl.TEXTURE_2D, G1.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, G1.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G1.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

const CORNERS = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
function renderGoo() {
  const G1 = View.gl, gl = G1.gl, W = View.cv.width, Hh = View.cv.height;
  sizeGL(G1, W, Hh);
  const d = G1.data, rx = View.rx, ry = View.ry;
  const x0 = View.camX - RF, y0 = View.camY - RF;
  const x1 = View.camX + View.W / View.z + RF, y1 = View.camY + View.H / View.z + RF;
  let o = 0, nv = 0;
  for (let i = 0; i < pTop; i++) {
    if (!alive[i] || pch[i] < 0) continue;
    const x = rx[i], y = ry[i];
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const ch = pch[i];
    for (let k = 0; k < 6; k++) {
      d[o++] = x; d[o++] = y; d[o++] = CORNERS[k * 2]; d[o++] = CORNERS[k * 2 + 1];
      d[o++] = ch === 0 ? 1 : 0; d[o++] = ch === 1 ? 1 : 0; d[o++] = ch === 2 ? 1 : 0; d[o++] = ch === 3 ? 1 : 0;
    }
    nv += 6;
  }
  // field pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, G1.fb);
  gl.viewport(0, 0, G1.fw, G1.fh);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  if (nv) {
    gl.useProgram(G1.field);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, G1.vb);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, o), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(G1.a.pos); gl.vertexAttribPointer(G1.a.pos, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(G1.a.corner); gl.vertexAttribPointer(G1.a.corner, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(G1.a.mask); gl.vertexAttribPointer(G1.a.mask, 4, gl.FLOAT, false, 32, 16);
    const fz = View.z * View.dpr * (G1.fw / W);
    gl.uniform2f(G1.u.cam, View.camX, View.camY);
    gl.uniform1f(G1.u.z, fz);
    gl.uniform2f(G1.u.res, G1.fw, G1.fh);
    gl.uniform1f(G1.u.rad, RF);
    gl.drawArrays(gl.TRIANGLES, 0, nv);
    gl.disableVertexAttribArray(G1.a.corner); gl.disableVertexAttribArray(G1.a.mask);
  }
  // composite pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, Hh);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(G1.comp);
  gl.bindBuffer(gl.ARRAY_BUFFER, G1.tri);
  gl.enableVertexAttribArray(G1.a.p); gl.vertexAttribPointer(G1.a.p, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G1.tex);
  gl.uniform1i(G1.u.f, 0);
  gl.uniform2f(G1.u.px, 1 / W, 1 / Hh);
  const op = 0.9 * R * View.z * View.dpr;
  gl.uniform2f(G1.u.off, op / W, op / Hh);
  for (let k = 0; k < 4; k++) gl.uniform3fv(G1.u.c[k], COLORS[k]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  View.ctx.setTransform(1, 0, 0, 1, 0, 0);
  View.ctx.drawImage(G1.c, 0, 0);
}

function renderGooFallback() {
  const ctx = View.ctx;
  for (let i = 0; i < pTop; i++) {
    if (!alive[i] || pch[i] < 0) continue;
    ctx.fillStyle = CSS_COL[pch[i]];
    ctx.beginPath(); ctx.arc(View.rx[i], View.ry[i], R * 1.3, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- background
function rng(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }

function makeTile(base, seam, hi, seed) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 80;
  const g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 160, 80);
  for (let k = 0; k < 90; k++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    g.fillRect(r() * 160, r() * 80, 2 + r() * 6, 2 + r() * 4);
  }
  g.fillStyle = seam;
  g.fillRect(0, 0, 160, 3); g.fillRect(0, 40, 160, 3); g.fillRect(0, 0, 3, 40); g.fillRect(80, 40, 3, 40);
  g.fillStyle = hi; g.fillRect(0, 3, 160, 2); g.fillRect(0, 43, 160, 2); g.fillRect(3, 3, 2, 37); g.fillRect(83, 43, 2, 37);
  const p = View.ctx.createPattern(c, 'repeat');
  if (p.setTransform) p.setTransform(new DOMMatrix().scale(0.5));
  return p;
}

function initView(canvas) {
  View.cv = canvas;
  View.ctx = canvas.getContext('2d');
  View.gl = initGL();
  View.tiles.stone = makeTile('#353d52', '#232838', 'rgba(255,255,255,0.05)', 3);
  View.tiles.earth = makeTile('#1d2231', '#151926', 'rgba(255,255,255,0.025)', 5);
  View.tiles.sewer = makeTile('#161c2a', '#10141f', 'rgba(255,255,255,0.03)', 7);
  View.tiles.wall = makeTile('#262e44', '#1e2537', 'rgba(255,255,255,0.03)', 11);
  // two parallax layers of buildings with lit windows
  const r = rng(42);
  const specs = [
    { p: 0.25, col: '#111a33', win: 'rgba(242,170,72,0.30)', base: 900, hMin: 260, hMax: 640, lit: 0.12 },
    { p: 0.5, col: '#18213d', win: 'rgba(255,186,88,0.62)', base: 900, hMin: 200, hMax: 520, lit: 0.2 },
  ];
  View.layers = specs.map(s => {
    const items = [];
    for (let x = -600; x < WORLD_W * s.p + 2400;) {
      const w = 110 + r() * 170, h = s.hMin + r() * (s.hMax - s.hMin);
      const wins = [];
      for (let wy = s.base - h + 30; wy < s.base - 40; wy += 46) {
        for (let wx = x + 18; wx < x + w - 26; wx += 34) if (r() < s.lit) wins.push(wx, wy);
      }
      items.push({ x, w, h, wins, roof: r() });
      x += w + 6 + r() * 30;
    }
    return { ...s, items };
  });
}

function resizeView() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, Hh = window.innerHeight;
  View.W = W; View.H = Hh; View.dpr = dpr;
  View.cv.width = Math.round(W * dpr); View.cv.height = Math.round(Hh * dpr);
}

function targetZoom() {
  const p = Sim.player, rb = slimeRadius(p ? p.ids.length : 40);
  const vh = 560 + 1.6 * rb, vw = 560 + 1.8 * rb;
  return Math.min(View.H / vh, View.W / vw);
}

function updateCamera(snap) {
  const p = Sim.player;
  View.zT = targetZoom();
  View.z = snap ? View.zT : View.z + (View.zT - View.z) * 0.06;
  const vwU = View.W / View.z, vhU = View.H / View.z;
  let cx = 0, cy = 0;
  const ids = p.ids, rx = View.rx, ry = View.ry;
  for (const i of ids) { cx += rx[i]; cy += ry[i]; }
  cx /= ids.length || 1; cy /= ids.length || 1;
  let tx = cx + clamp(p.avx * 0.25, -160, 160) - vwU / 2;
  let ty = cy - 30 - vhU / 2;
  const minY = -260, maxY = 1290 - vhU;
  tx = vwU >= WORLD_W ? (WORLD_W - vwU) / 2 : clamp(tx, 0, WORLD_W - vwU);
  ty = maxY < minY ? (minY + maxY) / 2 : clamp(ty, minY, maxY);
  if (snap) { View.camX = tx; View.camY = ty; }
  else { View.camX += (tx - View.camX) * 0.12; View.camY += (ty - View.camY) * 0.12; }
}

function worldXform(p = 1, dx = 0, dy = 0) {
  const k = View.z * View.dpr;
  let sx = 0, sy = 0;
  if (View.shake > 0) { sx = (Math.random() - 0.5) * View.shake; sy = (Math.random() - 0.5) * View.shake; }
  View.ctx.setTransform(k, 0, 0, k, (-View.camX * p + dx + sx) * k, (-View.camY * p + dy + sy) * k);
}

function drawSky() {
  const ctx = View.ctx, W = View.cv.width, Hh = View.cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, Hh);
  g.addColorStop(0, '#081129'); g.addColorStop(0.7, '#17224a'); g.addColorStop(1, '#1d2a52');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
  // moon
  worldXform(0.08);
  const mg = ctx.createRadialGradient(560, 120, 10, 560, 120, 140);
  mg.addColorStop(0, 'rgba(255,240,210,0.9)'); mg.addColorStop(0.18, 'rgba(255,236,200,0.8)');
  mg.addColorStop(0.2, 'rgba(255,220,170,0.12)'); mg.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = mg; ctx.fillRect(420, -20, 280, 280);
  for (const L of View.layers) {
    worldXform(L.p, 0, (1 - L.p) * 120);
    ctx.fillStyle = L.col;
    for (const b of L.items) {
      ctx.fillRect(b.x, L.base - b.h, b.w, b.h + 600);
      if (b.roof > 0.7) ctx.fillRect(b.x + b.w * 0.3, L.base - b.h - 30, b.w * 0.25, 30);
      if (b.roof < 0.15) ctx.fillRect(b.x + b.w * 0.6, L.base - b.h - 70, 4, 70);
    }
    ctx.fillStyle = L.win;
    for (const b of L.items) for (let k = 0; k < b.wins.length; k += 2) ctx.fillRect(b.wins[k], b.wins[k + 1], 14, 22);
  }
}

function stoneRect(x0, y0, x1, y1, tile = 'stone', lip = true) {
  const ctx = View.ctx;
  ctx.fillStyle = View.tiles[tile]; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (lip) {
    ctx.fillStyle = '#5b6683'; ctx.fillRect(x0, y0, x1 - x0, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x0, y1 - 5, x1 - x0, 5);
  }
}

function drawBackdrop(t) {
  const ctx = View.ctx;
  worldXform();
  // building behind the loading dock
  stoneRect(2240, 300, 3200, 900, 'wall', false);
  ctx.fillStyle = '#1f2638'; ctx.fillRect(2240, 300, 960, 18);
  ctx.fillStyle = '#1a2031'; ctx.fillRect(2420, 470, 340, 250);
  ctx.fillStyle = '#2b3349';
  for (let y = 478; y < 720; y += 16) ctx.fillRect(2426, y, 328, 9);
  ctx.fillStyle = '#3a4560'; ctx.fillRect(2410, 460, 360, 12);
  // wall pipes
  ctx.fillStyle = '#2f384f'; ctx.fillRect(2920, 300, 16, 600); ctx.fillRect(2826, 588, 110, 14);
  ctx.fillRect(2818, 588, 16, 36);
  ctx.fillStyle = '#ffcc38'; ctx.fillRect(2820, 620, 12, 4);
  // fuse box
  ctx.fillStyle = '#39435c'; ctx.fillRect(2985, 540, 46, 60); ctx.fillStyle = '#1b2130'; ctx.fillRect(2995, 552, 26, 18);
  // left building behind the overpass
  stoneRect(0, 160, 120, 900, 'wall', false);
  // overpass pillars and railing
  ctx.fillStyle = '#283046';
  ctx.fillRect(472, 632, 30, 268);
  ctx.fillStyle = '#2f384f';
  ctx.fillRect(140, 556, 720, 6);
  for (let x = 150; x < 860; x += 70) ctx.fillRect(x, 556, 5, 44);
  // overhead goo pipe
  ctx.fillStyle = '#2f384f'; ctx.fillRect(140, 450, 180, 14); ctx.fillRect(292, 450, 16, 22);
  ctx.fillStyle = '#ffcc38'; ctx.fillRect(294, 468, 12, 4);
  // chain-link fence
  ctx.strokeStyle = 'rgba(120,135,165,0.22)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 880; x < 2240; x += 22) { ctx.moveTo(x, 760); ctx.lineTo(x + 140, 900); ctx.moveTo(x + 140, 760); ctx.lineTo(x, 900); }
  ctx.stroke();
  ctx.fillStyle = '#2a3247';
  for (let x = 900; x <= 2240; x += 170) ctx.fillRect(x, 740, 7, 160);
  ctx.fillRect(880, 748, 1360, 5);
  // stacked background crates
  ctx.fillStyle = '#3a2c25';
  ctx.fillRect(1010, 790, 80, 110); ctx.fillRect(1100, 830, 70, 70); ctx.fillRect(1500, 800, 90, 100);
  ctx.strokeStyle = '#2a201b'; ctx.lineWidth = 4;
  ctx.strokeRect(1012, 792, 76, 106); ctx.strokeRect(1102, 832, 66, 66); ctx.strokeRect(1502, 802, 86, 96);
  // ladder up the dock
  ctx.fillStyle = '#4b566f';
  ctx.fillRect(2262, 700, 6, 200); ctx.fillRect(2290, 700, 6, 200);
  for (let y = 712; y < 900; y += 24) ctx.fillRect(2262, y, 34, 5);
  // press frame
  ctx.fillStyle = '#2b3346';
  ctx.fillRect(1928, 520, 20, 380); ctx.fillRect(2112, 520, 20, 380); ctx.fillRect(1918, 510, 224, 30);
  ctx.fillStyle = '#e6b73c';
  for (let y = 560; y < 890; y += 40) { ctx.fillRect(1930, y, 16, 18); ctx.fillRect(2114, y, 16, 18); }
  // sewer back wall
  stoneRect(560, 980, 3100, 1240, 'sewer', false);
  ctx.fillStyle = '#0d111b'; ctx.fillRect(560, 980, 2540, 16);
  ctx.fillStyle = '#232b3d';
  ctx.fillRect(900, 1020, 1900, 12); ctx.fillRect(1240, 1032, 12, 60); ctx.fillRect(2400, 1032, 12, 60);
  // sewer goo pipe
  ctx.fillStyle = '#2f384f'; ctx.fillRect(1712, 980, 16, 22);
  ctx.fillStyle = '#ffcc38'; ctx.fillRect(1714, 998, 12, 4);
  // outlet grates at both ends of the channel
  ctx.fillStyle = '#0a0d15'; ctx.fillRect(840, 1060, 70, 100); ctx.fillRect(2770, 1060, 70, 100);
  ctx.fillStyle = '#3a445c';
  for (let x = 846; x < 910; x += 14) ctx.fillRect(x, 1060, 5, 100);
  for (let x = 2776; x < 2840; x += 14) ctx.fillRect(x, 1060, 5, 100);
  // sewer lights
  for (const x of [1000, 1500, 2050, 2600]) {
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - 24, 996, 48, 6);
  }
}

function drawLights(t) {
  const ctx = View.ctx;
  worldXform();
  ctx.globalCompositeOperation = 'lighter';
  const cone = (x, y, len, spr, a) => {
    const g = ctx.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, `rgba(255,196,110,${a})`); g.addColorStop(1, 'rgba(255,196,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y); ctx.lineTo(x + spr, y + len); ctx.lineTo(x - spr, y + len); ctx.closePath(); ctx.fill();
    const rg = ctx.createRadialGradient(x, y + len, 4, x, y + len, spr * 1.1);
    rg.addColorStop(0, `rgba(255,190,100,${a * 0.7})`); rg.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = rg; ctx.fillRect(x - spr * 1.1, y + len - 30, spr * 2.2, 60);
    const bg = ctx.createRadialGradient(x, y, 1, x, y, 40);
    bg.addColorStop(0, 'rgba(255,230,170,0.9)'); bg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = bg; ctx.fillRect(x - 40, y - 40, 80, 80);
  };
  cone(560, 476, 124, 110, 0.16);
  cone(1640, 640, 260, 160, 0.13);
  cone(2600, 446, 274, 170, 0.15);
  for (const x of [1000, 1500, 2050, 2600]) cone(x, 1002, 170, 120, 0.07);
  ctx.globalCompositeOperation = 'source-over';
}

function drawLampPosts() {
  const ctx = View.ctx;
  worldXform();
  ctx.fillStyle = '#20273a';
  // overpass lamp
  ctx.fillRect(536, 470, 8, 130); ctx.fillRect(536, 462, 34, 7);
  ctx.fillStyle = '#ffe0a0'; ctx.fillRect(550, 469, 20, 6);
  // street lamp
  ctx.fillStyle = '#20273a';
  ctx.fillRect(1612, 630, 9, 270); ctx.fillRect(1612, 624, 40, 8);
  ctx.fillStyle = '#ffe0a0'; ctx.fillRect(1626, 632, 26, 6);
  // wall lamp on the dock building
  ctx.fillStyle = '#20273a'; ctx.fillRect(2586, 424, 28, 22);
  ctx.fillStyle = '#ffe0a0'; ctx.fillRect(2590, 444, 20, 5);
}

function drawStatics(t) {
  const ctx = View.ctx;
  worldXform();
  for (const s of Sim.statics) {
    switch (s.draw) {
      case 'stone': stoneRect(s.x0, s.y0, s.x1, s.y1); break;
      case 'deck':
        stoneRect(s.x0, s.y0, s.x1, s.y1);
        ctx.fillStyle = '#242b3d'; ctx.fillRect(s.x0, s.y1, s.x1 - s.x0, 8);
        break;
      case 'column': stoneRect(s.x0, s.y0, s.x1, s.y1, 'stone', false); break;
      case 'earth': stoneRect(s.x0, s.y0, s.x1, s.y1, 'earth', false); break;
      case 'sewerfloor': stoneRect(s.x0, s.y0, s.x1, s.y1, 'earth', true); break;
      case 'dock':
        stoneRect(s.x0, s.y0, s.x1, s.y1);
        for (let x = s.x0; x < s.x1; x += 28) {
          ctx.fillStyle = ((x - s.x0) / 28) % 2 ? '#1b1f27' : '#e2b23a';
          ctx.fillRect(x, s.y0 + 4, 28, 9);
        }
        ctx.fillStyle = '#1f2533'; ctx.fillRect(s.x0 + 30, s.y0 + 60, 70, 80); ctx.fillRect(s.x1 - 110, s.y0 + 60, 70, 80);
        break;
      case 'grate':
        ctx.fillStyle = '#56627c'; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
        ctx.fillStyle = '#93a0bc'; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(s.x1 - 3, s.y0 + 3, 3, s.y1 - s.y0 - 3);
        break;
      case 'pad': {
        const w = s.x1 - s.x0;
        ctx.fillStyle = '#20263a'; ctx.fillRect(s.x0 - 4, s.y1 - 4, w + 8, 4);
        ctx.strokeStyle = '#9aa7c2'; ctx.lineWidth = 2.5; ctx.beginPath();
        for (let k = 0; k <= 6; k++) { const x = s.x0 + 6 + (w - 12) * k / 6; ctx.lineTo(x, k % 2 ? s.y1 - 4 : s.y0 + 4); }
        ctx.stroke();
        ctx.fillStyle = '#ff5c73'; ctx.fillRect(s.x0, s.y0 - 3, w, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(s.x0 + 4, s.y0 - 3, w - 8, 2);
        break;
      }
      case 'duct':
        ctx.fillStyle = '#56627c'; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
        ctx.fillStyle = '#6f7d99'; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, 6);
        ctx.fillStyle = '#434d64';
        for (let x = s.x0 + 30; x < s.x1; x += 44) ctx.fillRect(x, s.y0, 6, s.y1 - s.y0);
        ctx.fillStyle = '#2b3346'; ctx.fillRect(s.x0 + 20, 520, 10, s.y0 - 520); ctx.fillRect(s.x1 - 30, 520, 10, s.y0 - 520);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(s.x0, s.y1 - 6, s.x1 - s.x0, 6);
        break;
      case 'ramp': {
        ctx.save();
        ctx.translate(s.ax, s.ay); ctx.rotate(Math.atan2(s.by - s.ay, s.bx - s.ax));
        const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
        ctx.fillStyle = View.tiles.stone; ctx.fillRect(0, -s.th, len, s.th * 2 + 6);
        ctx.fillStyle = '#5b6683'; ctx.fillRect(0, -s.th, len, 4);
        ctx.restore();
        break;
      }
      case 'press': {
        const cx = (s.x0 + s.x1) / 2;
        ctx.fillStyle = '#8b94a8'; ctx.fillRect(cx - 14, 530, 28, s.y0 - 530);
        ctx.fillStyle = '#c9cfdc'; ctx.fillRect(cx - 14, 530, 6, s.y0 - 530);
        ctx.fillStyle = '#3c4660'; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
        ctx.fillStyle = '#5c6984'; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, 6);
        for (let x = s.x0; x < s.x1; x += 20) {
          ctx.fillStyle = ((x - s.x0) / 20) % 2 ? '#1b1f27' : '#e2b23a';
          ctx.fillRect(x, s.y1 - 12, 20, 12);
        }
        break;
      }
    }
  }
  // grate frame and the cut edges of the openings in the street slab
  ctx.fillStyle = '#0b0f18';
  ctx.fillRect(1500, 916, 180, 64);
  ctx.fillStyle = '#3b455e'; ctx.fillRect(1496, 896, 6, 22); ctx.fillRect(1678, 896, 6, 22);
  drawTruck(); drawDumpster(); drawWheel();
}

function drawTruck() {
  const ctx = View.ctx;
  ctx.fillStyle = '#8f96a6'; ctx.fillRect(160, 800, 285, 76);
  ctx.fillStyle = '#a8afbe'; ctx.fillRect(330, 758, 100, 46);
  ctx.fillStyle = '#4c5873'; ctx.fillRect(342, 766, 38, 30); ctx.fillRect(386, 766, 36, 30);
  ctx.fillStyle = '#727a8c'; ctx.fillRect(160, 800, 170, 6); ctx.fillRect(165, 830, 160, 3);
  ctx.fillStyle = '#ffe3a0'; ctx.fillRect(432, 812, 13, 12);
  ctx.fillStyle = '#5e6576'; ctx.fillRect(160, 862, 285, 14);
  for (const x of [212, 392]) {
    ctx.fillStyle = '#151922'; ctx.beginPath(); ctx.arc(x, 874, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a6172'; ctx.beginPath(); ctx.arc(x, 874, 11, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(445, 818, 2, 445, 818, 90);
  g.addColorStop(0, 'rgba(255,220,150,0.5)'); g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g; ctx.fillRect(445, 728, 120, 180);
  ctx.globalCompositeOperation = 'source-over';
}

function drawDumpster() {
  const ctx = View.ctx;
  ctx.fillStyle = '#3c4a52'; ctx.fillRect(3060, 826, 130, 74);
  ctx.fillStyle = '#4f5f69'; ctx.fillRect(3054, 820, 142, 10);
  ctx.fillStyle = '#2c373e'; for (let x = 3075; x < 3190; x += 26) ctx.fillRect(x, 838, 6, 56);
}

function drawWheel() {
  const ctx = View.ctx, w = Sim.wheel;
  ctx.strokeStyle = '#2a2f3c'; ctx.lineWidth = 14; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(w.cx, w.cy, w.len * 0.62, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#7b6047'; ctx.lineWidth = 14;
  ctx.beginPath();
  for (const s of w.blades) { ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); }
  ctx.stroke();
  ctx.strokeStyle = '#a07c5b'; ctx.lineWidth = 4;
  ctx.beginPath();
  for (const s of w.blades) { ctx.moveTo(s.ax, s.ay - 3); ctx.lineTo(s.bx, s.by - 3); }
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#596379'; ctx.beginPath(); ctx.arc(w.cx, w.cy, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2f3c'; ctx.beginPath(); ctx.arc(w.cx, w.cy, 6, 0, Math.PI * 2); ctx.fill();
}

function drawRigids() {
  const ctx = View.ctx, rx = View.rx, ry = View.ry;
  worldXform();
  for (const b of Sim.bodies) {
    if (b.kind !== 'rigid') continue;
    let cx = 0, cy = 0;
    for (const i of b.ids) { cx += rx[i]; cy += ry[i]; }
    cx /= b.ids.length; cy /= b.ids.length;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(b.s, b.c));
    if (b.shape === 'crate') {
      const w = b.w, h = b.h;
      ctx.fillStyle = '#7a5434'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = '#4a321f'; ctx.lineWidth = 5; ctx.strokeRect(-w / 2 + 2.5, -h / 2 + 2.5, w - 5, h - 5);
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-w / 2 + 4, -h / 2 + 4); ctx.lineTo(w / 2 - 4, h / 2 - 4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,170,0.12)'; ctx.fillRect(-w / 2, -h / 2, w, 4);
    } else {
      const r = b.r;
      const cols = ['#ff5c73', '#f4f1e8', '#3894ff', '#f4f1e8', '#ffcc38', '#f4f1e8'];
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = cols[k];
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, k * Math.PI / 3, (k + 1) * Math.PI / 3); ctx.closePath(); ctx.fill();
      }
      ctx.rotate(-Math.atan2(b.s, b.c));
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 2, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,30,0.45)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawWater(t) {
  const ctx = View.ctx, w = WATER;
  worldXform();
  ctx.beginPath();
  ctx.moveTo(w.x0, w.y1);
  for (let x = w.x0; x <= w.x1; x += 20) ctx.lineTo(x, w.y + Math.sin(x * 0.03 + t * 2.2) * 2.5 + Math.sin(x * 0.011 - t * 1.3) * 2);
  ctx.lineTo(w.x1, w.y1); ctx.closePath();
  ctx.fillStyle = 'rgba(30,110,190,0.42)'; ctx.fill();
  ctx.strokeStyle = 'rgba(150,215,255,0.55)'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = w.x0; x <= w.x1; x += 20) ctx.lineTo(x, w.y + Math.sin(x * 0.03 + t * 2.2) * 2.5 + Math.sin(x * 0.011 - t * 1.3) * 2);
  ctx.stroke();
}

// eyes and player tags
function drawFaces(t) {
  const ctx = View.ctx, rx = View.rx, ry = View.ry;
  worldXform();
  for (const b of Sim.bodies) {
    if (b.kind !== 'slime' || !b.ids.length) continue;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, cx = 0, cy = 0;
    for (const i of b.ids) {
      const x = rx[i], y = ry[i];
      cx += x; cy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const n = b.ids.length; cx /= n; cy /= n;
    const rb = slimeRadius(n);
    const hw = (x1 - x0) / 2 + R, hh = (y1 - y0) / 2 + R;
    b.face += (b.faceT - b.face) * 0.12;
    const ex = cx + b.face * Math.min(hw * 0.5, rb * 0.55);
    const ey = cy - Math.min(hh * 0.18, rb * 0.3);
    b.ex += (ex - b.ex) * 0.5; b.ey += (ey - b.ey) * 0.5;
    // blink
    b.nextBlink -= 1 / 60;
    if (b.nextBlink <= 0) { b.blink = 0.14; b.nextBlink = 2 + Math.random() * 4; }
    b.blink = Math.max(0, b.blink - 1 / 60);
    const es = 3.5 + rb * 0.12;
    const squash = clamp(hh / hw, 0.45, 1.8);
    let eh = es * 1.3 * Math.sqrt(squash), ew = es * 0.62;
    if (b.inY > 0.5) eh *= 0.55;
    if (b.blink > 0) eh *= 0.12;
    const gap = es * 0.85;
    for (let k = 0; k < 2; k++) {
      const off = (k === 0 ? -1 : 1) * gap;
      const exk = b.ex + off * (0.8 + 0.2 * Math.abs(b.face));
      const scale = (k === 0) === (b.face < 0) ? 1.08 : 0.92;
      ctx.fillStyle = '#08130d';
      ctx.beginPath(); ctx.ellipse(exk, b.ey, ew * scale, eh * scale, 0, 0, Math.PI * 2); ctx.fill();
      if (b.blink <= 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.ellipse(exk - ew * 0.25, b.ey - eh * 0.45, ew * 0.32, eh * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    // tag
    const tx = cx, ty = y0 - R - 16;
    b.tagX = tx; b.tagY = ty;
  }
  // tags drawn at a fixed screen size
  ctx.setTransform(View.dpr, 0, 0, View.dpr, 0, 0);
  ctx.font = '800 13px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const b of Sim.bodies) {
    if (b.kind !== 'slime' || !b.ids.length) continue;
    const sx = (b.tagX - View.camX) * View.z, sy = (b.tagY - View.camY) * View.z;
    const col = CSS_COL[b.ch];
    ctx.fillStyle = col;
    ctx.fillText(b.name, sx, sy - 9);
    ctx.beginPath(); ctx.moveTo(sx - 6, sy - 5); ctx.lineTo(sx + 6, sy - 5); ctx.lineTo(sx, sy + 3); ctx.closePath(); ctx.fill();
  }
}

// cosmetic droplets for splashes and splats
function spawnFx(x, y, n, col, speed) {
  if (View.fx.length > 220) return;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = speed * (0.4 + Math.random() * 0.8);
    View.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, r: 2 + Math.random() * 3, col });
  }
}
function drawFx(dt) {
  const ctx = View.ctx;
  worldXform();
  const fx = View.fx;
  for (let k = fx.length - 1; k >= 0; k--) {
    const p = fx[k];
    p.life -= dt; p.vy += G * 0.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) { fx.splice(k, 1); continue; }
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawVignette() {
  const ctx = View.ctx, W = View.cv.width, Hh = View.cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.35, W / 2, Hh / 2, Math.max(W, Hh) * 0.75);
  g.addColorStop(0, 'rgba(4,6,16,0)'); g.addColorStop(1, 'rgba(4,6,16,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
}

function render(alpha, dt) {
  const rx = View.rx, ry = View.ry;
  for (let i = 0; i < pTop; i++) { rx[i] = lx[i] + (px[i] - lx[i]) * alpha; ry[i] = ly[i] + (py[i] - ly[i]) * alpha; }
  updateCamera(false);
  View.shake = Math.max(0, View.shake - dt * 30);
  const t = Sim.t;
  drawSky();
  drawBackdrop(t);
  drawLampPosts();
  drawStatics(t);
  drawRigids();
  if (View.gl) renderGoo(); else { worldXform(); renderGooFallback(); }
  drawFaces(t);
  drawWater(t);
  drawLights(t);
  drawFx(dt);
  drawVignette();
}
