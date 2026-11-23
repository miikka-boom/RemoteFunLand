/* We Will Survive. Right? — the drawing kit.
   A camera that fits any aspect ratio, cached sprites, the night (sky, moon, trees, fog, rain,
   lightning) and silhouette puppets: you, your friend, zombies, a werewolf, a vampire, ghosts,
   bats, the Thing and the car. Everything is a function of time: no state between frames. */
(function () {
'use strict';
const S = WWS.score;
const G = (WWS.G = {});
const TAU = Math.PI * 2;
G.TAU = TAU;

/* ---------------- numbers ---------------- */
const clamp = (G.clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x));
const lerp = (G.lerp = (a, b, t) => a + (b - a) * t);
G.inv = (a, b, x) => clamp((x - a) / (b - a));
G.smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
G.easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
G.easeIn = (t) => Math.pow(clamp(t), 3);
G.easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
G.back = (t) => { t = clamp(t); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
G.T = (bar) => bar * S.BAR;
G.hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
G.rng = function (seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
// smooth 1-D value noise in [-1, 1]
G.noise = (x, seed = 0) => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(G.hash(i + seed * 57.3), G.hash(i + 1 + seed * 57.3), u) * 2 - 1;
};
G.fbm = (x, seed = 0) => G.noise(x, seed) * 0.6 + G.noise(x * 2.1, seed + 3) * 0.3 + G.noise(x * 4.3, seed + 7) * 0.1;
// a decaying pulse after each cue: sum of exp(-(t - c) / tau)
G.pulse = (t, cues, tau, max = 1) => { let s = 0; for (const c of cues) { const d = t - c; if (d >= 0 && d < tau * 8) s += Math.exp(-d / tau); } return Math.min(max, s); };
G.since = (t, cues) => { let best = Infinity; for (const c of cues) { const d = t - c; if (d >= 0 && d < best) best = d; } return best; };

/* ---------------- colors ---------------- */
G.hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
G.mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
G.rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
G.rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
G.INK = [4, 5, 9];

/* ---------------- camera ----------------
   A shot is framed as a 16:9 window `w` world units wide around (x, y). Wider screens see more
   sideways; narrower ones keep at least `wmin` of the width and see more sky and ground. */
G.view = function (W, H, cam) {
  const a = W / H, A = 16 / 9;
  let vw, vh;
  let lift = 0;
  if (a >= A) { vh = cam.w * 9 / 16; vw = vh * a; } else {
    vw = Math.max(cam.w * (cam.wmin || 0.56), cam.w * a / A); vh = vw / a;
    lift = (cam.lift === undefined ? 0.2 : cam.lift) * (vh - cam.w * 9 / 16);   // tall screens: show more sky than ground
  }
  return (G.cur = { W, H, a, s: W / vw, vw, vh, cx: cam.x + (cam.sx || 0), cy: cam.y - lift + (cam.sy || 0), rot: cam.rot || 0, portrait: a < 1 });
};
// set the transform for a layer with parallax p (1 = the action plane); returns its visible rect
G.layer = function (ctx, v, p = 1, py = p, scale = 1) {
  const cx = v.cx * p, cy = v.cy * py, s = v.s * scale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(v.W / 2, v.H / 2);
  if (v.rot) ctx.rotate(v.rot);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  const m = v.rot ? 0.15 : 0.03, hw = v.W / s / 2, hh = v.H / s / 2;
  return { x0: cx - hw * (1 + m * 2), x1: cx + hw * (1 + m * 2), y0: cy - hh * (1 + m * 2), y1: cy + hh * (1 + m * 2), s };
};
G.screen = (ctx) => ctx.setTransform(1, 0, 0, 1, 0, 0);
// camera shake from a list of impacts [time, strength]
G.shake = function (t, hits, reduce) {
  if (reduce) return { sx: 0, sy: 0, rot: 0 };
  let a = 0;
  for (const [c, k] of hits) { const d = t - c; if (d >= 0 && d < 1.2) a += k * Math.exp(-d / 0.18); }
  a = Math.min(a, 2.5);
  return { sx: G.noise(t * 31, 1) * a * 14, sy: G.noise(t * 29, 2) * a * 10, rot: G.noise(t * 23, 3) * a * 0.012 };
};
// keyframed camera: [[bar, x, y, w], ...] eased between keys
G.camPath = function (keys, bar, ease = G.easeInOut) {
  if (bar <= keys[0][0]) return { x: keys[0][1], y: keys[0][2], w: keys[0][3] };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (bar < b[0]) { const u = ease((bar - a[0]) / (b[0] - a[0])); return { x: lerp(a[1], b[1], u), y: lerp(a[2], b[2], u), w: lerp(a[3], b[3], u) }; }
  }
  const z = keys[keys.length - 1]; return { x: z[1], y: z[2], w: z[3] };
};

/* ---------------- sprites ---------------- */
const cache = new Map();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
G.canvas = canvas;
// a soft round glow, tinted
G.glowSprite = function (col, hard = 0) {
  const key = 'g' + col.join() + ':' + hard;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(128, 128), x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, G.rgba(col, 1)); gr.addColorStop(hard ? 0.35 : 0.12, G.rgba(col, hard ? 0.8 : 0.55)); gr.addColorStop(0.45, G.rgba(col, 0.16)); gr.addColorStop(1, G.rgba(col, 0));
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  cache.set(key, c); return c;
};
G.glow = function (ctx, x, y, r, col, a = 1, add = true, hard = 0) {
  if (a <= 0.003 || r <= 0) return;
  const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
  ctx.globalAlpha = Math.min(1, a); if (add) ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(G.glowSprite(col, hard), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = pa; ctx.globalCompositeOperation = pc;
};
// a soft fog blob (wide ellipse)
G.fogSprite = function (col) {
  const key = 'f' + col.join();
  if (cache.has(key)) return cache.get(key);
  const c = canvas(256, 128), x = c.getContext('2d');
  x.translate(128, 64); x.scale(2, 1);
  const gr = x.createRadialGradient(0, 0, 0, 0, 0, 64);
  gr.addColorStop(0, G.rgba(col, 0.55)); gr.addColorStop(0.5, G.rgba(col, 0.25)); gr.addColorStop(1, G.rgba(col, 0));
  x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 64, 0, TAU); x.fill();
  cache.set(key, c); return c;
};
// a horizontal band of drifting fog blobs between y0 and y1
G.fog = function (ctx, r, y0, y1, col, alpha, t, speed, seed, density = 1) {
  if (alpha <= 0.003) return;
  const spr = G.fogSprite(col), pa = ctx.globalAlpha;
  const bw = (y1 - y0) * 3.2, n = Math.ceil((r.x1 - r.x0) / bw * 2.2 * density) + 2;
  const off = t * speed, start = Math.floor((r.x0 - bw - off) / (bw / 2.2 / density));
  for (let i = start; i < start + n + 2; i++) {
    const h = G.hash(i * 3.1 + seed), x = i * (bw / 2.2 / density) + off + h * bw * 0.4;
    const y = lerp(y0, y1, G.hash(i * 7.7 + seed)), wv = bw * (0.7 + h * 0.8), hv = (y1 - y0) * (0.8 + G.hash(i + seed * 2) * 0.9);
    ctx.globalAlpha = alpha * (0.5 + 0.5 * G.hash(i * 1.3 + seed));
    ctx.drawImage(spr, x - wv / 2, y - hv / 2, wv, hv);
  }
  ctx.globalAlpha = pa;
};

/* ---------------- sky ---------------- */
// fill the layer rect with a vertical gradient: stops [[worldY, color], ...]
G.sky = function (ctx, r, stops) {
  const gr = ctx.createLinearGradient(0, stops[0][0], 0, stops[stops.length - 1][0]);
  const y0 = stops[0][0], y1 = stops[stops.length - 1][0];
  for (const [y, c] of stops) gr.addColorStop(clamp((y - y0) / (y1 - y0)), typeof c === 'string' ? c : G.rgb(c));
  ctx.fillStyle = gr; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
};
const STARS = (() => { const R = G.rng(1234), a = []; for (let i = 0; i < 700; i++) a.push([R() * 2 - 1, R(), 0.4 + R() * R() * 1.8, R() * TAU, 0.6 + R() * 2.5]); return a; })();
// stars over a dome: spread across [-span, span] x [top, bottom]
G.stars = function (ctx, r, t, top, bottom, alpha = 1, span = 4000, blot = null) {
  if (alpha <= 0.01) return;
  ctx.fillStyle = '#fff';
  const pa = ctx.globalAlpha;
  for (const [sx, sy, sz, ph, sp] of STARS) {
    const x = sx * span, y = lerp(top, bottom, sy * sy);
    if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
    if (blot && blot(x, y)) continue;
    const tw = 0.55 + 0.45 * Math.sin(t * sp + ph);
    ctx.globalAlpha = alpha * tw * (1 - sy * 0.6);
    ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = pa;
};
const CRATERS = [[-0.28, -0.22, 0.34, 0.2], [0.12, -0.34, 0.22, 0.16], [0.3, 0.05, 0.3, 0.14], [-0.1, 0.22, 0.26, 0.18], [-0.42, 0.18, 0.16, 0.12], [0.22, 0.4, 0.14, 0.1], [0.45, -0.25, 0.1, 0.1], [-0.05, -0.02, 0.12, 0.08]];
G.moon = function (ctx, x, y, r, col = [236, 232, 214], glowA = 1, haze = 0) {
  G.glow(ctx, x, y, r * 5.5, G.mixc(col, [70, 90, 160], 0.55), 0.28 * glowA);
  G.glow(ctx, x, y, r * 2.2, col, 0.22 * glowA);
  const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  gr.addColorStop(0, G.rgb(G.mixc(col, [255, 255, 255], 0.3))); gr.addColorStop(1, G.rgb(G.mixc(col, [120, 120, 130], 0.25)));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  // soft grey seas, then a dark limb
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  const sea = G.mixc(col, [70, 72, 92], 0.7);
  for (const [cx, cy, cr, ca] of CRATERS) {
    const g2 = ctx.createRadialGradient(x + cx * r, y + cy * r, 0, x + cx * r, y + cy * r, cr * r);
    g2.addColorStop(0, G.rgba(sea, ca)); g2.addColorStop(0.6, G.rgba(sea, ca * 0.7)); g2.addColorStop(1, G.rgba(sea, 0));
    ctx.fillStyle = g2; ctx.fillRect(x + (cx - cr) * r, y + (cy - cr) * r, cr * r * 2, cr * r * 2);
  }
  const limb = ctx.createRadialGradient(x, y, r * 0.75, x, y, r);
  limb.addColorStop(0, 'rgba(0,0,0,0)'); limb.addColorStop(1, 'rgba(40,40,60,0.22)');
  ctx.fillStyle = limb; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  if (haze > 0) { ctx.fillStyle = G.rgba([20, 26, 48], haze); ctx.beginPath(); ctx.arc(x, y, r + 1, 0, TAU); ctx.fill(); }
};
// soft dark clouds drifting across the layer
G.clouds = function (ctx, r, t, y0, y1, col, alpha, speed, seed, n = 7) {
  const spr = G.fogSprite(col), pa = ctx.globalAlpha, span = (r.x1 - r.x0) + 1600;
  for (let i = 0; i < n; i++) {
    const h = G.hash(i * 9.1 + seed), w = 500 + h * 900, hh = 90 + G.hash(i * 4.4 + seed) * 120;
    let x = ((G.hash(i * 2.3 + seed) * span + t * speed * (0.6 + h)) % span + span) % span + r.x0 - 800;
    const y = lerp(y0, y1, G.hash(i * 5.7 + seed));
    ctx.globalAlpha = alpha * (0.6 + 0.4 * h);
    ctx.drawImage(spr, x - w / 2, y - hh / 2, w, hh);
  }
  ctx.globalAlpha = pa;
};

/* ---------------- land ---------------- */
// fill from a ground profile y(x) down to the bottom of the layer
G.land = function (ctx, r, yFn, col, step = 24) {
  ctx.fillStyle = typeof col === 'string' ? col : G.rgb(col);
  ctx.beginPath(); ctx.moveTo(r.x0, r.y1 + 10);
  for (let x = r.x0; x <= r.x1 + step; x += step) ctx.lineTo(x, yFn(x));
  ctx.lineTo(r.x1 + step, r.y1 + 10); ctx.closePath(); ctx.fill();
};
G.hills = (seed, base, amp, freq) => (x) => base - amp * (0.55 + 0.45 * G.fbm(x * freq, seed));

// trees, cached as Path2D (unit height 1, base at 0)
const treeCache = new Map();
G.pine = function (seed) {
  const key = 'p' + seed; if (treeCache.has(key)) return treeCache.get(key);
  const R = G.rng(seed), p = new Path2D(), tiers = 6 + Math.floor(R() * 4);
  p.rect(-0.018, -0.15, 0.036, 0.16);
  for (let i = 0; i < tiers; i++) {
    const y = -0.1 - i * (0.85 / tiers), w = 0.2 * (1 - i / tiers) + 0.03 + R() * 0.03, h = 0.85 / tiers + 0.08;
    p.moveTo(-w, y); p.lineTo(-w * 0.35, y - h * 0.45); p.lineTo(-w * 0.55, y - h * 0.4); p.lineTo(0, y - h - 0.02);
    p.lineTo(w * 0.55, y - h * 0.4); p.lineTo(w * 0.35, y - h * 0.45); p.lineTo(w, y); p.closePath();
  }
  treeCache.set(key, p); return p;
};
// a bare, twisted tree: recursive tapered branches
G.bareTree = function (seed, spread = 1) {
  const key = 'b' + seed + ':' + spread; if (treeCache.has(key)) return treeCache.get(key);
  const R = G.rng(seed), p = new Path2D();
  const seg = (x, y, ang, len, wid, depth) => {
    const x2 = x + Math.sin(ang) * len, y2 = y - Math.cos(ang) * len, nx = Math.cos(ang), ny = Math.sin(ang), w2 = wid * 0.68;
    p.moveTo(x - nx * wid / 2, y - ny * wid / 2); p.lineTo(x2 - nx * w2 / 2, y2 - ny * w2 / 2);
    p.lineTo(x2 + nx * w2 / 2, y2 + ny * w2 / 2); p.lineTo(x + nx * wid / 2, y + ny * wid / 2); p.closePath();
    p.moveTo(x2 + w2 / 2, y2); p.arc(x2, y2, w2 / 2, 0, TAU);
    if (depth <= 0 || len < 0.02) return;
    const kids = depth > 3 ? 2 : 2 + (R() < 0.4 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const da = (k - (kids - 1) / 2) * (0.5 + R() * 0.35) * spread + (R() - 0.5) * 0.4;
      seg(x2, y2, ang + da, len * (0.66 + R() * 0.16), w2, depth - 1);
    }
  };
  seg(0, 0, (R() - 0.5) * 0.15, 0.34, 0.075, 6);
  treeCache.set(key, p); return p;
};
G.drawPath = function (ctx, path, x, y, s, col, flip = 1, rot = 0) {
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(s * flip, s);
  ctx.fillStyle = typeof col === 'string' ? col : G.rgb(col); ctx.fill(path); ctx.restore();
};
// a row of trees along a layer: deterministic placement per world cell
G.treeRow = function (ctx, r, yFn, kind, col, minH, maxH, gap, seed) {
  ctx.fillStyle = typeof col === 'string' ? col : G.rgb(col);
  const i0 = Math.floor((r.x0 - maxH) / gap), i1 = Math.ceil((r.x1 + maxH) / gap);
  for (let i = i0; i <= i1; i++) {
    const h = G.hash(i * 1.37 + seed); if (h < 0.12) continue;
    const x = i * gap + G.hash(i * 4.1 + seed) * gap * 0.8, size = lerp(minH, maxH, G.hash(i * 2.9 + seed));
    const path = kind === 'pine' ? G.pine(seed * 10 + (i & 7)) : G.bareTree(seed * 10 + (i & 7), 0.9 + G.hash(i) * 0.4);
    ctx.save(); ctx.translate(x, yFn(x) + 4); ctx.scale(size * (G.hash(i * 7.3) < 0.5 ? -1 : 1), size); ctx.fill(path); ctx.restore();
  }
};
// tombstones: [path, width, height] variants (unit: height of a typical stone ~ 1)
const STONES = (() => {
  const a = [];
  let p = new Path2D(); p.moveTo(-0.28, 0); p.lineTo(-0.28, -0.7); p.arc(0, -0.7, 0.28, Math.PI, 0); p.lineTo(0.28, 0); p.closePath(); a.push(p);
  p = new Path2D(); p.rect(-0.06, -1.15, 0.12, 1.15); p.rect(-0.32, -0.9, 0.64, 0.12); a.push(p);
  p = new Path2D(); p.moveTo(-0.3, 0); p.lineTo(-0.26, -0.62); p.lineTo(-0.12, -0.78); p.lineTo(0.12, -0.78); p.lineTo(0.26, -0.62); p.lineTo(0.3, 0); p.closePath(); a.push(p);
  p = new Path2D(); p.moveTo(-0.16, 0); p.lineTo(-0.11, -1.4); p.lineTo(0, -1.6); p.lineTo(0.11, -1.4); p.lineTo(0.16, 0); p.closePath(); p.rect(-0.24, -0.12, 0.48, 0.12); a.push(p);
  p = new Path2D(); p.moveTo(-0.3, 0); p.lineTo(-0.3, -0.5); p.quadraticCurveTo(-0.3, -0.85, 0.02, -0.82); p.lineTo(0.18, -0.6); p.lineTo(0.3, -0.62); p.lineTo(0.3, 0); p.closePath(); a.push(p);
  return a;
})();
G.stone = function (ctx, x, y, s, kind, tilt, col) { G.drawPath(ctx, STONES[kind % STONES.length], x, y, s, col, 1, tilt); };
G.grass = function (ctx, r, yFn, col, h, gap, seed, t = 0, wind = 0) {
  ctx.fillStyle = typeof col === 'string' ? col : G.rgb(col);
  ctx.beginPath();
  const i0 = Math.floor(r.x0 / gap), i1 = Math.ceil(r.x1 / gap);
  for (let i = i0; i <= i1; i++) {
    const x = i * gap + G.hash(i + seed) * gap, y = yFn(x) + 2, hh = h * (0.4 + G.hash(i * 3.3 + seed) * 0.9);
    const lean = (G.hash(i * 5.1 + seed) - 0.5) * hh * 0.6 + Math.sin(t * 2 + i) * wind * hh;
    ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x + lean * 0.3, y - hh * 0.6, x + lean, y - hh); ctx.quadraticCurveTo(x + lean * 0.3 + 1, y - hh * 0.5, x + 3, y);
  }
  ctx.fill();
};

/* ---------------- weather and light ---------------- */
G.rain = function (ctx, v, t, alpha, slant = 0.18, n = 260) {
  if (alpha <= 0.01) return;
  G.screen(ctx);
  ctx.strokeStyle = `rgba(170,190,230,${alpha})`; ctx.lineWidth = Math.max(1, v.W / 1200);
  ctx.beginPath();
  const L = v.H * 0.06;
  for (let i = 0; i < n; i++) {
    const sp = 1.3 + G.hash(i * 3.3) * 0.8, x0 = G.hash(i * 1.7) * (v.W + v.H * slant) - v.H * slant * 0.5;
    const y = ((G.hash(i * 9.1) + t * sp) % 1) * (v.H + L * 2) - L, x = x0 + (y / v.H) * v.H * slant;
    ctx.moveTo(x, y); ctx.lineTo(x - L * slant, y - L);
  }
  ctx.stroke();
};
G.bolt = function (ctx, x0, y0, x1, y1, seed, width, col, alpha) {
  const R = G.rng(seed), pts = [[x0, y0]];
  const n = 14;
  for (let i = 1; i < n; i++) { const u = i / n; pts.push([lerp(x0, x1, u) + (R() - 0.5) * 140 * (1 - u * 0.5), lerp(y0, y1, u) + (R() - 0.5) * 30]); }
  pts.push([x1, y1]);
  const draw = (w, a) => {
    ctx.strokeStyle = G.rgba(col, a); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke();
  };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  draw(width * 6, alpha * 0.15); draw(width * 2.2, alpha * 0.4); draw(width, alpha);
  // a branch
  const k = 4 + Math.floor(R() * 6), b = pts[k];
  ctx.strokeStyle = G.rgba(col, alpha * 0.7); ctx.lineWidth = width * 0.6; ctx.beginPath(); ctx.moveTo(b[0], b[1]);
  let bx = b[0], by = b[1];
  for (let i = 0; i < 5; i++) { bx += (R() - 0.3) * 90; by += 40 + R() * 50; ctx.lineTo(bx, by); }
  ctx.stroke();
};
// a cone of light from (x, y) at angle ang (radians, 0 = +x), length len, half-angle spread
G.beam = function (ctx, x, y, ang, len, spread, col, alpha) {
  if (alpha <= 0.005) return;
  const pc = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(x, y, 0, x, y, len);
  gr.addColorStop(0, G.rgba(col, alpha)); gr.addColorStop(0.25, G.rgba(col, alpha * 0.55)); gr.addColorStop(1, G.rgba(col, 0));
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.arc(x, y, len, ang - spread, ang + spread); ctx.closePath(); ctx.fill();
  // a brighter core
  const gr2 = ctx.createRadialGradient(x, y, 0, x, y, len * 0.7);
  gr2.addColorStop(0, G.rgba(col, alpha * 0.6)); gr2.addColorStop(1, G.rgba(col, 0));
  ctx.fillStyle = gr2; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len * 0.7, ang - spread * 0.45, ang + spread * 0.45); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = pc;
  G.glow(ctx, x, y, 22, col, alpha * 1.4);
};
// a muzzle flash: a star of light
G.muzzle = function (ctx, x, y, ang, k, seed) {
  if (k <= 0.01) return;
  G.glow(ctx, x, y, 260 * k, [255, 150, 60], 0.75 * k);
  G.glow(ctx, x, y, 70 * k, [255, 230, 170], 1.0 * k, true, 1);
  const pc = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,220,140,${0.9 * k})`;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(0, -7 * k); ctx.lineTo(95 * k * (0.8 + G.hash(seed) * 0.5), 0); ctx.lineTo(0, 7 * k); ctx.closePath(); ctx.fill();
  for (const a of [-0.5, 0.5]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, -3 * k); ctx.lineTo(40 * k, 0); ctx.lineTo(0, 3 * k); ctx.fill(); ctx.restore(); }
  ctx.restore();
  ctx.globalCompositeOperation = pc;
};
// sparks / debris: deterministic ballistic particles
G.sparks = function (ctx, x, y, dt, n, seed, opt) {
  if (dt < 0 || dt > (opt.life || 1)) return;
  const life = opt.life || 1, g = opt.g === undefined ? 900 : opt.g, sp = opt.speed || 400, col = opt.col || [255, 190, 90];
  const pc = ctx.globalCompositeOperation; if (opt.add !== false) ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = G.rgba(col, (opt.alpha || 1) * (1 - dt / life));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const h1 = G.hash(i * 3.1 + seed), h2 = G.hash(i * 7.3 + seed), a = (opt.dir || 0) + (h1 - 0.5) * (opt.spread || TAU), v = sp * (0.35 + h2 * 0.9);
    const px = x + Math.cos(a) * v * dt, py = y + Math.sin(a) * v * dt + 0.5 * g * dt * dt, sz = (opt.size || 3) * (0.5 + G.hash(i + seed) * 0.8);
    ctx.rect(px - sz / 2, py - sz / 2, sz, sz);
  }
  ctx.fill();
  ctx.globalCompositeOperation = pc;
};

/* ================================================================
   Puppets. Local coordinates: origin at the feet, +x forward, -y up;
   the body is 175 units tall at scale 1.
   ================================================================ */
const L = { thigh: 44, shin: 44, torso: 56, upper: 30, fore: 29 };
G.LIMB = L;
function ik(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 0.001;
  const maxd = l1 + l2 - 0.5;
  if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx) + bend * a;
  return [ax + Math.cos(base) * l1, ay + Math.sin(base) * l1, ax + dx, ay + dy];
}
G.ik = ik;
// walking feet: phase 0..1 per two steps; returns two feet [x, y] around the body
G.feet = function (phase, stride, lift, drag = 0) {
  const f = (p, k) => {
    p = ((p % 1) + 1) % 1;
    if (p < 0.5) return [stride * (0.5 - p * 2), 0];
    const u = (p - 0.5) * 2, e = u * u * (3 - 2 * u), l = lift * (k && drag ? 1 - drag : 1);
    return [stride * (-0.5 + e), -l * Math.sin(Math.PI * u)];
  };
  return [f(phase, 0), f(phase + 0.5, 1)];
};
// the standard poses
G.pose = {
  stand: (t, seed = 0) => ({ pel: 86 + Math.sin(t * 2.2 + seed) * 0.8, lean: 0.04, head: 0, feet: [[9, 0], [-7, 0]], hands: null }),
  walk: (phase, k = 1) => {
    const fe = G.feet(phase, 58 * k, 10 * k);
    const sw = Math.sin(phase * TAU) * 16 * k;
    return { pel: 86 - 2.5 * Math.cos(phase * TAU * 2) * k, lean: 0.06, head: 0.02, feet: fe, hands: [[3 - sw, -32], [3 + sw, -32]] };
  },
  run: (phase, k = 1) => {
    const fe = G.feet(phase, 92 * k, 30 * k);
    const sw = Math.sin(phase * TAU);
    return { pel: 80 - 6 * Math.cos(phase * TAU * 2), lean: 0.28, head: -0.12, feet: fe, hands: [[14 - sw * 26, -78 + Math.abs(sw) * 10], [14 + sw * 26, -78 + Math.abs(sw) * 10]] };
  },
  shamble: (phase, seed = 0) => {
    const fe = G.feet(phase, 40, 7, 0.85);
    return { pel: 82 - 3 * Math.abs(Math.sin(phase * TAU)), lean: 0.3 + 0.05 * Math.sin(phase * TAU + seed), head: 0.35 + 0.15 * Math.sin(phase * TAU * 0.5 + seed), feet: fe,
      hands: [[44 + 6 * Math.sin(phase * TAU + seed), -112 + 6 * Math.cos(phase * TAU)], [50 - 6 * Math.sin(phase * TAU), -118 + 5 * Math.sin(phase * TAU + 1)]] };
  },
};
/* Draw a human. P: { x, y, s, face, kind ('you'|'friend'|'zombie'), pel, lean, head, feet, hands,
   tilt (radians, about the feet), col, rim: [col, dx, dy], gun: {ang, pump} | null, light: ang | null,
   bat: ang | null, prop: fn(ctx, sh, hands) } */
G.human = function (ctx, P) {
  const rim = P.rim;
  if (rim && rim[0]) { ctx.save(); ctx.translate(rim[1], rim[2]); drawHuman(ctx, P, G.rgb(rim[0]), true); ctx.restore(); }
  return drawHuman(ctx, P, P.col ? (typeof P.col === 'string' ? P.col : G.rgb(P.col)) : G.rgb(G.INK), false);
};
function drawHuman(ctx, P, col, isRim) {
  const s = P.s || 1, face = P.face || 1;
  ctx.save();
  ctx.translate(P.x, P.y);
  if (P.tilt) ctx.rotate(P.tilt * face);
  ctx.scale(s * face, s);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pel = P.pel === undefined ? 86 : P.pel, lean = P.lean === undefined ? 0.05 : P.lean, kind = P.kind || 'you';
  const pv = [P.px || 0, -pel];
  const nk = [pv[0] + Math.sin(lean) * L.torso, pv[1] - Math.cos(lean) * L.torso];
  const hl = lean + (P.head || 0), hc = [nk[0] + Math.sin(hl) * 13, nk[1] - Math.cos(hl) * 13];
  const sh = [nk[0] - Math.sin(lean) * 6, nk[1] + Math.cos(lean) * 6];
  const feet = P.feet || [[9, 0], [-7, 0]];
  const legs = feet.map((f) => { const r = ik(pv[0], pv[1], f[0], f[1] - 8, L.thigh, L.shin, -1); return { k: [r[0], r[1]], a: [r[2], r[3]] }; });
  const handsT = P.hands || [[sh[0] + 2, sh[1] + 56], [sh[0] + 6, sh[1] + 55]];
  const arms = handsT.map((h) => { const r = ik(sh[0], sh[1], h[0], h[1], L.upper, L.fore, 1); return { e: [r[0], r[1]], h: [r[2], r[3]] }; });
  const seg = (a, b, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  const leg = (l) => { seg(pv, l.k, 15); seg(l.k, l.a, 11.5); seg(l.a, [l.a[0] + 12, l.a[1] + 5], 8); };
  const arm = (a) => { seg(sh, a.e, 10.5); seg(a.e, a.h, 8.5); ctx.beginPath(); ctx.arc(a.h[0], a.h[1], 5.2, 0, TAU); ctx.fill(); };
  // back arm and leg
  arm(arms[0]); leg(legs[0]);
  // torso
  seg(pv, sh, kind === 'zombie' ? 23 : 26);
  if (kind === 'friend') {   // backpack
    ctx.save(); ctx.translate(pv[0], pv[1]); ctx.rotate(lean);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-27, -50, 17, 38, 5) : ctx.rect(-27, -50, 17, 38); ctx.fill(); ctx.restore();
  }
  if (kind === 'zombie') {   // rags
    ctx.save(); ctx.translate(pv[0], pv[1]); ctx.rotate(lean);
    ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(-9, 12); ctx.lineTo(-4, 2); ctx.lineTo(1, 14); ctx.lineTo(5, 3); ctx.lineTo(10, 10); ctx.lineTo(12, -4); ctx.fill();
    ctx.restore();
  }
  // neck and head
  seg(sh, hc, 9);
  ctx.beginPath(); ctx.arc(hc[0], hc[1], kind === 'you' ? 12.5 : 11.5, 0, TAU); ctx.fill();
  if (kind === 'you') {   // hood
    ctx.beginPath(); ctx.moveTo(hc[0] - 12, hc[1] - 2); ctx.quadraticCurveTo(hc[0] - 15, hc[1] - 15, hc[0] - 3, hc[1] - 14); ctx.lineTo(hc[0] - 6, hc[1] + 6); ctx.fill();
  } else if (kind === 'friend') {   // cap and brim
    ctx.save(); ctx.translate(hc[0], hc[1]); ctx.rotate(hl);
    ctx.beginPath(); ctx.arc(0, -2, 12.2, Math.PI, TAU); ctx.fill();
    ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(21, -1.5); ctx.stroke();
    ctx.restore();
  } else if (kind === 'zombie') {   // hair, a slack jaw
    ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < 4; i++) { const a = -2.2 + i * 0.45; ctx.moveTo(hc[0] + Math.cos(a) * 10, hc[1] + Math.sin(a) * 10); ctx.lineTo(hc[0] + Math.cos(a) * 17 - 3, hc[1] + Math.sin(a) * 15 + 4); }
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hc[0] + 4, hc[1] + 6); ctx.lineTo(hc[0] + 12, hc[1] + 14); ctx.lineTo(hc[0] + 1, hc[1] + 11); ctx.fill();
  }
  // front leg and arm
  leg(legs[1]); arm(arms[1]);
  // props
  if (P.gun) drawGun(ctx, sh, P.gun);
  if (P.light !== undefined && P.light !== null) {
    const h = arms[1].h; ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(P.light); ctx.fillRect(-4, -3.5, 17, 7); ctx.fillRect(11, -5, 6, 10); ctx.restore();
  }
  if (P.bat !== undefined && P.bat !== null) {
    const h = arms[0].h; ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(P.bat);
    ctx.beginPath(); ctx.moveTo(-6, -2.5); ctx.lineTo(62, -5); ctx.lineTo(66, 0); ctx.lineTo(62, 5); ctx.lineTo(-6, 2.5); ctx.fill(); ctx.restore();
  }
  if (P.prop) P.prop(ctx, sh, arms.map((a) => a.h), isRim);
  ctx.restore();
  // world positions of useful points (for beams and flashes)
  const w = (p) => { const c = Math.cos((P.tilt || 0) * face), sn = Math.sin((P.tilt || 0) * face); const lx = p[0] * s * face, ly = p[1] * s; return [P.x + lx * c - ly * sn, P.y + lx * sn + ly * c]; };
  return { head: w(hc), hand: w(arms[1].h), hand0: w(arms[0].h), sh: w(sh), muzzle: P.gun ? w([sh[0] + Math.cos(P.gun.ang) * 96, sh[1] + Math.sin(P.gun.ang) * 96]) : null };
}
// the shotgun: stock at the shoulder, along angle ang (local; 0 = forward), pump offset 0..1
function drawGun(ctx, sh, gun) {
  ctx.save(); ctx.translate(sh[0] - 4, sh[1] + 4); ctx.rotate(gun.ang);
  ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(22, -3.5); ctx.lineTo(24, 4); ctx.lineTo(-10, 7); ctx.fill();   // stock
  ctx.fillRect(20, -4, 22, 7.5);       // receiver
  ctx.fillRect(40, -3.6, 60, 3.6);     // barrel
  ctx.fillRect(44 - (gun.pump || 0) * 12, 0, 22, 5.5);   // pump
  ctx.restore();
}
// hand targets for holding the shotgun (local), given the shoulder, angle and pump
G.gunHands = function (P, ang, pump = 0) {
  const lean = P.lean === undefined ? 0.05 : P.lean, pel = P.pel === undefined ? 86 : P.pel;
  const nk = [(P.px || 0) + Math.sin(lean) * L.torso, -pel - Math.cos(lean) * L.torso], sh = [nk[0] - Math.sin(lean) * 6, nk[1] + Math.cos(lean) * 6];
  const o = [sh[0] - 4, sh[1] + 4], c = Math.cos(ang), s = Math.sin(ang);
  const at = (d, off) => [o[0] + c * d - s * off, o[1] + s * d + c * off];
  return [at(24, 5), at(52 - pump * 12, 5)];
};
G.shoulder = function (P) {
  const lean = P.lean === undefined ? 0.05 : P.lean, pel = P.pel === undefined ? 86 : P.pel;
  const nk = [(P.px || 0) + Math.sin(lean) * L.torso, -pel - Math.cos(lean) * L.torso];
  return [nk[0] - Math.sin(lean) * 6, nk[1] + Math.cos(lean) * 6];
};

// a person seen from behind (standing or sitting), for the horde and the sunrise
G.backView = function (ctx, x, y, s, kind, o = {}) {
  if (o.rim) { const rc = o.rim; ctx.save(); ctx.translate(rc[1], rc[2]); G.backView(ctx, x, y, s, kind, Object.assign({}, o, { rim: null, col: rc[0] })); ctx.restore(); }
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = o.col ? G.rgb(o.col) : G.rgb(G.INK); ctx.strokeStyle = ctx.fillStyle; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const sway = o.sway || 0, sit = o.sit;
  if (!sit) {
    const lift = o.walk ? Math.sin(o.step || 0) : 0, l1 = Math.max(0, lift) * 16, l2 = Math.max(0, -lift) * 16;
    ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(-10, -86); ctx.lineTo(-13, -6 - l1); ctx.moveTo(10, -86); ctx.lineTo(13, -6 - l2); ctx.stroke();
  }
  const top = sit ? -64 : -144, base = sit ? 0 : -84;
  ctx.beginPath();   // torso (wider at the shoulders)
  ctx.moveTo(-17, base); ctx.lineTo(-24 + sway, top + 8); ctx.quadraticCurveTo(-22 + sway, top - 2, -10 + sway, top - 4);
  ctx.lineTo(10 + sway, top - 4); ctx.quadraticCurveTo(22 + sway, top - 2, 24 + sway, top + 8); ctx.lineTo(17, base); ctx.closePath(); ctx.fill();
  // arms
  ctx.lineWidth = 10;
  const ar = o.arms || [[-30, sit ? -10 : -86], [30, sit ? -10 : -86]];
  ctx.beginPath(); ctx.moveTo(-21 + sway, top + 6); ctx.lineTo(ar[0][0], ar[0][1]); ctx.moveTo(21 + sway, top + 6); ctx.lineTo(ar[1][0], ar[1][1]); ctx.stroke();
  // head
  const hx = sway * 1.4 + (o.turn || 0) * 5, hy = top - 18;
  ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(sway, top); ctx.lineTo(hx, hy + 8); ctx.stroke();
  ctx.beginPath(); ctx.arc(hx, hy, kind === 'you' ? 13 : 12, 0, TAU); ctx.fill();
  if (kind === 'friend') {
    ctx.beginPath(); ctx.arc(hx, hy - 2, 12.6, Math.PI, TAU); ctx.fill();
    if (o.turn) { ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(hx + o.turn * 8, hy - 4); ctx.lineTo(hx + o.turn * 21, hy - 1); ctx.stroke(); }
    if (!o.noPack) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-15 + sway, top + 10, 30, 40, 6) : ctx.rect(-15 + sway, top + 10, 30, 40); ctx.fill(); }
  } else {
    ctx.beginPath(); ctx.moveTo(hx - 13, hy + 4); ctx.quadraticCurveTo(hx, hy - 24, hx + 13, hy + 4); ctx.fill();
  }
  if (o.extra) o.extra(ctx);
  ctx.restore();
};

/* ---------------- the werewolf ----------------
   P: { x, y, s, face, mode: 'stand'|'leap'|'run'|'howl'|'crouch'|'fall', ph (cycle), eyes (0..1), col, rim } */
G.wolf = function (ctx, P) {
  if (P.rim && P.rim[0]) { ctx.save(); ctx.translate(P.rim[1], P.rim[2]); drawWolf(ctx, P, G.rgb(P.rim[0]), true); ctx.restore(); }
  return drawWolf(ctx, P, P.col ? G.rgb(P.col) : G.rgb(G.INK), false);
};
function drawWolf(ctx, P, col, isRim) {
  const s = P.s || 1, face = P.face || 1, mode = P.mode || 'stand', ph = P.ph || 0;
  ctx.save(); ctx.translate(P.x, P.y); if (P.tilt) ctx.rotate(P.tilt * face); ctx.scale(s * face, s);
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // skeleton per mode: hip, chest, head, and limbs as [from, to] chains
  let hip, chest, head, snout, legs, arms, tail, earUp = 1;
  const sw = Math.sin(ph * TAU), cw = Math.cos(ph * TAU);
  if (mode === 'stand' || mode === 'howl' || mode === 'crouch') {
    const c = mode === 'crouch' ? 1 : 0, hw = mode === 'howl' ? 1 : 0, br = Math.sin((P.t || 0) * 3) * 2;
    hip = [0, -150 + c * 45]; chest = [22 - c * 6, -265 + c * 70 + br];
    head = hw ? [30, -320] : [52 - c * 4, -290 + c * 70]; snout = hw ? [44, -372] : [92 - c * 6, -284 + c * 76];
    legs = [[hip, [-14, -82 + c * 30], [12, -30 + c * 10], [26, 0]], [hip, [10, -86 + c * 30], [34, -32 + c * 8], [50, 0]]];
    arms = hw ? [[[chest[0] - 6, chest[1] + 12], [-6, -200], [-22, -150]], [[chest[0] + 6, chest[1] + 12], [26, -196], [34, -148]]]
      : [[[chest[0] - 4, chest[1] + 12], [26 - c * 4, -180 + c * 60], [70 - c * 20, -128 + c * 80]], [[chest[0] + 8, chest[1] + 14], [52, -188 + c * 60], [100 - c * 16, -150 + c * 92]]];
    tail = [hip, [-46, -128 + c * 40], [-84, -96 + c * 50]];
  } else if (mode === 'leap' || mode === 'fall') {
    const f = mode === 'fall' ? 1 : 0;
    hip = [-44, -46]; chest = [52, -74]; head = [104, -96]; snout = [146, -86];
    legs = [[hip, [-92, -28], [-136, -14], [-172, -4]], [hip, [-84, -54], [-128, -46], [-164, -44]]];
    arms = [[[chest[0], chest[1] + 12], [106, -46 + f * 40], [156, -56 + f * 60]], [[chest[0] + 6, chest[1] + 8], [118, -72], [172, -92 + f * 50]]];
    tail = [hip, [-112, -84], [-170, -100 - f * 20]];
    earUp = f ? 0.4 : 0.8;
  } else {   // run (gallop, on all fours)
    hip = [-50, -100 - sw * 8]; chest = [50, -112 + sw * 8]; head = [100, -128 + sw * 6]; snout = [140, -118 + sw * 6];
    const fl = (k) => [Math.cos(ph * TAU + k) * 46, Math.max(0, Math.sin(ph * TAU + k)) * -40];
    const a1 = fl(0), a2 = fl(0.6), b1 = fl(Math.PI), b2 = fl(Math.PI + 0.6);
    legs = [[hip, [hip[0] - 20 + b1[0] * 0.5, -60], [hip[0] - 34 + b1[0], -20 + b1[1] * 0.5], [hip[0] - 30 + b1[0], b1[1]]], [hip, [hip[0] - 4 + b2[0] * 0.5, -58], [hip[0] - 18 + b2[0], -18 + b2[1] * 0.5], [hip[0] - 14 + b2[0], b2[1]]]];
    arms = [[[chest[0], chest[1] + 10], [chest[0] + 14 + a1[0] * 0.5, -56], [chest[0] + 20 + a1[0], a1[1]]], [[chest[0] + 6, chest[1] + 10], [chest[0] + 22 + a2[0] * 0.5, -54], [chest[0] + 28 + a2[0], a2[1]]]];
    tail = [hip, [hip[0] - 50, hip[1] - 10 + cw * 10], [hip[0] - 96, hip[1] + 4 + cw * 16]];
  }
  const line = (pts, w0, w1) => { for (let i = 0; i < pts.length - 1; i++) { ctx.lineWidth = lerp(w0, w1, i / Math.max(1, pts.length - 2)); ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke(); } };
  const claws = (p, dir) => { ctx.lineWidth = 3; ctx.beginPath(); for (let k = -1; k <= 1; k++) { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.cos(dir + k * 0.35) * 22, p[1] + Math.sin(dir + k * 0.35) * 22); } ctx.stroke(); };
  // tail (bushy)
  line(tail, 30, 16); ctx.beginPath(); ctx.ellipse(tail[2][0], tail[2][1], 22, 12, Math.atan2(tail[2][1] - tail[1][1], tail[2][0] - tail[1][0]), 0, TAU); ctx.fill();
  // back limbs
  line(legs[0], 30, 12); line(arms[0], 22, 12); claws(arms[0][2], Math.atan2(arms[0][2][1] - arms[0][1][1], arms[0][2][0] - arms[0][1][0]));
  // body: hip to chest, thick, with a hunch
  ctx.lineWidth = 66; ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.quadraticCurveTo((hip[0] + chest[0]) / 2 - 18, (hip[1] + chest[1]) / 2 - 26, chest[0], chest[1]); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(chest[0], chest[1] + 8, 56, 46, 0.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hip[0], hip[1] + 4, 40, 36, 0, 0, TAU); ctx.fill();
  // a shaggy mane over the shoulders and neck
  ctx.beginPath();
  const mx = chest[0] - 10, my = chest[1] - 30, ma = Math.atan2(head[1] - chest[1], head[0] - chest[0]);
  for (let i = 0; i < 9; i++) {
    const a = ma + Math.PI * 0.55 + i * 0.16, len = 26 + ((i * 37) % 11) * 2.4, bx = mx + Math.cos(a - Math.PI / 2) * (i * 6 - 20), by = my + Math.sin(a - Math.PI / 2) * (i * 6 - 20);
    ctx.moveTo(bx - 9, by + 6); ctx.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len); ctx.lineTo(bx + 9, by + 4);
  }
  ctx.fill();
  // neck, head, snout, ears
  ctx.lineWidth = 36; ctx.beginPath(); ctx.moveTo(chest[0], chest[1]); ctx.lineTo(head[0], head[1]); ctx.stroke();
  ctx.beginPath(); ctx.arc(head[0], head[1], 26, 0, TAU); ctx.fill();
  const sa = Math.atan2(snout[1] - head[1], snout[0] - head[0]);
  ctx.save(); ctx.translate(head[0], head[1]); ctx.rotate(sa);
  ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(52, -6); ctx.lineTo(58, 2); ctx.lineTo(50, 8);
  if (P.jaw) { ctx.lineTo(20, 10); ctx.lineTo(52, 26 + P.jaw * 10); ctx.lineTo(16, 24); } else ctx.lineTo(10, 20);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(-20 - 6 * earUp, -48 * earUp - 10); ctx.lineTo(0, -22); ctx.moveTo(2, -20); ctx.lineTo(4, -50 * earUp - 8); ctx.lineTo(16, -18); ctx.fill();
  ctx.restore();
  // front limbs
  line(legs[1], 32, 13); line(arms[1], 24, 13); claws(arms[1][2], Math.atan2(arms[1][2][1] - arms[1][1][1], arms[1][2][0] - arms[1][1][0]));
  ctx.restore();
  // eyes (world)
  const e = P.eyes || 0;
  const ex = P.x + (head[0] + Math.cos(sa) * 16) * s * face, ey = P.y + (head[1] + Math.sin(sa) * 16 - 8) * s;
  if (!isRim && e > 0.01) { G.glow(ctx, ex, ey, 22 * s, [255, 210, 60], e * 0.9); ctx.fillStyle = `rgba(255,236,150,${e})`; ctx.beginPath(); ctx.arc(ex, ey, 3.2 * s, 0, TAU); ctx.fill(); }
  return { head: [P.x + head[0] * s * face, P.y + head[1] * s], chest: [P.x + chest[0] * s * face, P.y + chest[1] * s], eye: [ex, ey] };
}

/* ---------------- the vampire (seen from the front) ----------------
   P: { x, y, s, open (cape spread 0..1), recoil (0..1), eyes, face (pale), hover } */
G.vampire = function (ctx, P) {
  const s = P.s || 1, op = clamp(P.open || 0, 0, 1.4), rc = P.recoil || 0;
  ctx.save(); ctx.translate(P.x, P.y + (P.hover || 0)); ctx.scale(s, s);
  const ink = G.rgb(G.INK);
  // arms raised and spread, the cape hanging from them like bat wings
  const wx = lerp(44, 158, op), wy = lerp(-120, -238, op) + rc * 70, ex = lerp(38, 104, op), ey = lerp(-150, -214, op) + rc * 40;
  const hx = lerp(44, 96, Math.min(1, op));
  const cape = () => {
    ctx.beginPath();
    ctx.moveTo(-24, -178); ctx.lineTo(-ex, ey); ctx.lineTo(-wx, wy);
    const ribs = 4;
    for (let i = 1; i <= ribs; i++) {   // scallops from the wrist down to the hem, each bowing inwards
      const u = i / ribs, x = lerp(-wx, -hx, u), y = lerp(wy, 6, u), pu = (i - 0.5) / ribs;
      ctx.quadraticCurveTo(lerp(-wx, -hx, pu) + 24 + op * 10, lerp(wy, 6, pu), x, y);
    }
    for (let i = 1; i <= 4; i++) { const x = lerp(-hx, hx, i / 4), px = lerp(-hx, hx, (i - 0.5) / 4); ctx.quadraticCurveTo(px, -10, x, 6); }
    for (let i = 1; i <= ribs; i++) {
      const u = i / ribs, x = lerp(hx, wx, u), y = lerp(6, wy, u), pu = (i - 0.5) / ribs;
      ctx.quadraticCurveTo(lerp(hx, wx, pu) - 24 - op * 10, lerp(6, wy, pu), x, y);
    }
    ctx.lineTo(ex, ey); ctx.lineTo(24, -178); ctx.closePath();
  };
  ctx.fillStyle = ink; cape(); ctx.fill();
  // the red lining shows inside the spread cape
  if (op > 0.15) {
    ctx.save(); ctx.translate(0, -70); ctx.scale(0.84, 0.86); ctx.translate(0, 70);
    const lg = ctx.createLinearGradient(0, -240, 0, 10);
    lg.addColorStop(0, `rgba(150,16,30,${Math.min(1, op)})`); lg.addColorStop(1, `rgba(70,6,14,${Math.min(1, op)})`);
    ctx.fillStyle = lg; cape(); ctx.fill(); ctx.restore();
  }
  // arms along the top edge of the cape
  ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(-24, -176); ctx.lineTo(-ex, ey); ctx.lineTo(-wx, wy); ctx.moveTo(24, -176); ctx.lineTo(ex, ey); ctx.lineTo(wx, wy); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath();
  for (const sd of [-1, 1]) for (let k = -1; k <= 1; k++) { ctx.moveTo(sd * wx, wy); ctx.lineTo(sd * (wx + 14), wy - 10 + k * 9); }
  ctx.stroke();
  // the body: a narrow black suit, a pale shirt front
  ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(-26, -180); ctx.lineTo(26, -180); ctx.lineTo(20, 6); ctx.lineTo(-20, 6); ctx.fill();
  ctx.fillStyle = 'rgba(205,210,204,0.85)'; ctx.beginPath(); ctx.moveTo(-9, -178); ctx.lineTo(9, -178); ctx.lineTo(0, -128); ctx.fill();
  // the high collar, the head
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.moveTo(-30, -170); ctx.lineTo(-46, -232); ctx.lineTo(-12, -184); ctx.lineTo(12, -184); ctx.lineTo(46, -232); ctx.lineTo(30, -170); ctx.fill();
  const hy = -198 + rc * 8;
  ctx.beginPath(); ctx.ellipse(0, hy, 15, 19, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(196,206,200,${0.92 * (P.face === undefined ? 1 : P.face)})`;
  ctx.beginPath(); ctx.moveTo(-11, hy - 6); ctx.lineTo(0, hy - 11); ctx.lineTo(11, hy - 6); ctx.quadraticCurveTo(12, hy + 14, 0, hy + 17); ctx.quadraticCurveTo(-12, hy + 14, -11, hy - 6); ctx.fill();
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.ellipse(-5, hy + 1, 3.6, 2.4, 0.25, 0, TAU); ctx.ellipse(5, hy + 1, 3.6, 2.4, -0.25, 0, TAU); ctx.fill();
  ctx.fillRect(-4, hy + 10, 8, 1.6);
  if (rc > 0) {   // the cape drawn across the face
    ctx.beginPath(); ctx.moveTo(-50, -140); ctx.quadraticCurveTo(-20, -240, 40, -200 + (1 - rc) * 30); ctx.lineTo(44, -170); ctx.quadraticCurveTo(0, -196, -36, -120); ctx.fill();
  }
  ctx.restore();
  const e = P.eyes === undefined ? 1 : P.eyes;
  if (e > 0.01 && rc < 0.6) for (const dx of [-5, 5]) {
    const ex2 = P.x + dx * s, ey2 = P.y + (P.hover || 0) + (hy + 1) * s;
    G.glow(ctx, ex2, ey2, 14 * s, [255, 40, 40], e); ctx.fillStyle = `rgba(255,90,80,${e})`; ctx.beginPath(); ctx.arc(ex2, ey2, 1.6 * s, 0, TAU); ctx.fill();
  }
};

/* ---------------- ghosts ---------------- */
G.ghost = function (ctx, x, y, s, t, alpha, seed, dir = 1) {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * dir, s);
  const pa = ctx.globalAlpha; ctx.globalAlpha = pa * alpha;
  const gr = ctx.createLinearGradient(0, -120, 0, 140);
  gr.addColorStop(0, 'rgba(225,235,255,0.85)'); gr.addColorStop(0.5, 'rgba(180,200,240,0.45)'); gr.addColorStop(1, 'rgba(150,170,220,0)');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.moveTo(-34, -60);
  ctx.quadraticCurveTo(-40, -130, 0, -132); ctx.quadraticCurveTo(40, -130, 34, -60);
  for (let i = 0; i <= 10; i++) { const u = i / 10, yy = -60 + u * 200, w = 34 * (1 - u * 0.85); ctx.lineTo(w + Math.sin(t * 2.4 + u * 5 + seed) * 18 * u - u * 50, yy); }
  for (let i = 10; i >= 0; i--) { const u = i / 10, yy = -60 + u * 200, w = 34 * (1 - u * 0.85); ctx.lineTo(-w + Math.sin(t * 2.4 + u * 5 + seed + 0.8) * 18 * u - u * 50, yy); }
  ctx.closePath(); ctx.fill();
  // arms like streamers
  ctx.strokeStyle = 'rgba(200,215,250,0.35)'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(26, -70); ctx.quadraticCurveTo(70, -60 + Math.sin(t * 2 + seed) * 20, 96, -30 + Math.sin(t * 1.7 + seed) * 30); ctx.stroke();
  // the face: hollow eyes and an open mouth
  ctx.fillStyle = 'rgba(10,14,30,0.85)';
  ctx.beginPath(); ctx.ellipse(-11, -100, 6, 9, 0.1, 0, TAU); ctx.ellipse(11, -100, 6, 9, -0.1, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -76, 6 + Math.sin(t * 3 + seed) * 2, 12, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = pa; ctx.restore();
  G.glow(ctx, x, y - 90 * s, 120 * s, [140, 170, 255], 0.25 * alpha);
};

/* ---------------- bats: a swarm drawn as one path ---------------- */
G.bats = function (ctx, list, t, col) {
  ctx.fillStyle = col ? (typeof col === 'string' ? col : G.rgb(col)) : G.rgb(G.INK);
  ctx.beginPath();
  for (const b of list) {
    const [x, y, s, ph] = b, f = Math.sin(t * 22 + ph), w = 16 * s, h = 9 * s * f;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - w * 0.5, y - h - 3 * s, x - w, y - h * 0.6);
    ctx.lineTo(x - w * 0.75, y - h * 0.2 + 2 * s); ctx.lineTo(x - w * 0.5, y + 1.5 * s - h * 0.2); ctx.lineTo(x - w * 0.25, y + 3 * s);
    ctx.lineTo(x, y + 4 * s);
    ctx.lineTo(x + w * 0.25, y + 3 * s); ctx.lineTo(x + w * 0.5, y + 1.5 * s - h * 0.2); ctx.lineTo(x + w * 0.75, y - h * 0.2 + 2 * s);
    ctx.lineTo(x + w, y - h * 0.6); ctx.quadraticCurveTo(x + w * 0.5, y - h - 3 * s, x, y);
    ctx.moveTo(x + 2.6 * s, y - 1 * s); ctx.arc(x, y - 1 * s, 2.6 * s, 0, TAU);
  }
  ctx.fill();
};

/* ---------------- birds: a flapping V each ---------------- */
G.birds = function (ctx, list, t, col, w = 2.2) {
  ctx.strokeStyle = typeof col === 'string' ? col : G.rgb(col); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const [x, y, s, ph] of list) {
    const f = Math.sin(t * 9 + ph) * 0.8, wx = 16 * s, wy = 7 * s * f;
    ctx.moveTo(x - wx, y - wy); ctx.quadraticCurveTo(x - wx * 0.45, y - wy - 4 * s, x, y); ctx.quadraticCurveTo(x + wx * 0.45, y - wy - 4 * s, x + wx, y - wy);
  }
  ctx.stroke();
};

/* ---------------- the car: an old station wagon, side view ----------------
   P: { x, y (ground), s, face, wheel (rotation), bounce, tilt, lights (0..1), heads: ['you','friend'] | null,
        dent (roof dent 0..1), tail (taillights), steam, col, rim, glass } */
G.car = function (ctx, P) {
  const s = P.s || 1, face = P.face || 1;
  ctx.save(); ctx.translate(P.x, P.y - (P.bounce || 0)); if (P.tilt) ctx.rotate(P.tilt * face); ctx.scale(s * face, s);
  const body = (col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-205, -30); ctx.lineTo(-208, -64); ctx.lineTo(-196, -72);
    ctx.lineTo(-180, -118 + (P.dent || 0) * 0); ctx.lineTo(40 - (P.dent || 0) * 0, -120); ctx.lineTo(60, -118);
    if (P.dent) { ctx.lineTo(-20, -120); }
    ctx.lineTo(98, -76); ctx.lineTo(196, -68); ctx.lineTo(208, -56); ctx.lineTo(210, -30); ctx.closePath(); ctx.fill();
  };
  if (P.rim && P.rim[0]) { ctx.save(); ctx.translate(P.rim[1] / s * face, P.rim[2] / s); body(G.rgb(P.rim[0])); ctx.restore(); }
  body(P.col ? G.rgb(P.col) : G.rgb(G.INK));
  // roof dent
  if (P.dent) { ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.ellipse(-60, -120, 42, 10 * P.dent, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  // windows
  const glass = P.glass || [40, 52, 80];
  ctx.fillStyle = G.rgba(glass, 0.85);
  ctx.beginPath(); ctx.moveTo(-170, -108); ctx.lineTo(-112, -110); ctx.lineTo(-112, -78); ctx.lineTo(-176, -78); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-104, -110); ctx.lineTo(-20, -112); ctx.lineTo(-20, -78); ctx.lineTo(-104, -78); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-12, -112); ctx.lineTo(48, -112); ctx.lineTo(84, -78); ctx.lineTo(-12, -78); ctx.closePath(); ctx.fill();
  // heads inside
  ctx.fillStyle = G.rgb(G.INK);
  if (P.heads) {
    const hp = P.headBob || 0;
    ctx.beginPath(); ctx.arc(-58, -90 + hp, 11, 0, TAU); ctx.fill(); ctx.fillRect(-66, -84 + hp, 16, 8);   // back-seat side: you (driver is on the far side in this view)
    ctx.beginPath(); ctx.arc(18, -92 - hp, 10.5, 0, TAU); ctx.fill(); ctx.fillRect(10, -86 - hp, 16, 8);
    ctx.fillRect(10, -103 - hp, 22, 4);   // the friend's cap brim
  }
  // wheels
  for (const wx of [-140, 130]) {
    ctx.fillStyle = G.rgb(G.INK); ctx.beginPath(); ctx.arc(wx, -22, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(70,74,86,1)'; ctx.beginPath(); ctx.arc(wx, -22, 12, 0, TAU); ctx.fill();
    if (P.hubcap === undefined || P.hubcap || wx < 0) {
      ctx.strokeStyle = G.rgb(G.INK); ctx.lineWidth = 3; ctx.beginPath();
      for (let k = 0; k < 4; k++) { const a = (P.wheel || 0) + k * Math.PI / 2; ctx.moveTo(wx, -22); ctx.lineTo(wx + Math.cos(a) * 12, -22 + Math.sin(a) * 12); }
      ctx.stroke();
    }
  }
  ctx.restore();
  // lights (world space)
  const wpt = (lx, ly) => { const c = Math.cos((P.tilt || 0) * face), sn = Math.sin((P.tilt || 0) * face); const X = lx * s * face, Y = ly * s; return [P.x + X * c - Y * sn, P.y - (P.bounce || 0) + X * sn + Y * c]; };
  const head = wpt(204, -54), tailL = wpt(-205, -58);
  if (P.lights > 0) G.glow(ctx, head[0], head[1], 40 * s, [255, 244, 210], P.lights);
  if (P.tail > 0) G.glow(ctx, tailL[0], tailL[1], 30 * s, [255, 40, 30], P.tail);
  return { head, tail: tailL, window: wpt(20, -95), roof: wpt(-60, -122) };
};

/* ---------------- the Thing: a mountain with eyes ---------------- */
G.thing = function (ctx, x, y, s, t, rise, eyes, opts = {}) {
  // rise: 0..1 how far out of the water; eyes: array of openness per eye
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const up = lerp(900, 0, rise);
  ctx.translate(0, up);
  const col = opts.col || [6, 8, 14];
  // tentacles behind
  const tent = (bx, len, ph, w, dir) => {
    ctx.beginPath();
    const pts = [];
    for (let i = 0; i <= 18; i++) { const u = i / 18, a = -Math.PI / 2 + dir * (0.25 + u * 0.9) + Math.sin(t * 0.9 + ph + u * 3) * 0.35 * u; pts.push([u, a]); }
    let px = bx, py = -40, left = [], right = [];
    for (const [u, a] of pts) {
      const ww = w * (1 - u * 0.92);
      left.push([px + Math.cos(a - Math.PI / 2) * ww, py + Math.sin(a - Math.PI / 2) * ww]);
      right.push([px + Math.cos(a + Math.PI / 2) * ww, py + Math.sin(a + Math.PI / 2) * ww]);
      px += Math.cos(a) * len / 18; py += Math.sin(a) * len / 18;
    }
    ctx.moveTo(left[0][0], left[0][1]); for (const p of left) ctx.lineTo(p[0], p[1]); for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath(); ctx.fill();
  };
  ctx.fillStyle = G.rgb(col);
  [[-760, 820, 0.3, 60, -1], [-520, 1000, 1.7, 70, -1], [560, 980, 2.9, 70, 1], [820, 760, 4.1, 55, 1], [-980, 600, 5.3, 44, -1], [1040, 620, 0.9, 44, 1]].forEach(([bx, len, ph, w, d]) => tent(bx, len, ph, w, d));
  // body: a hunched dome with spires
  ctx.beginPath(); ctx.moveTo(-1250, 60);
  ctx.bezierCurveTo(-1100, -300, -800, -620, -420, -720);
  ctx.lineTo(-360, -840); ctx.lineTo(-300, -740); ctx.lineTo(-160, -790); ctx.lineTo(-90, -980); ctx.lineTo(-20, -800);
  ctx.lineTo(80, -820); ctx.lineTo(150, -1010); ctx.lineTo(220, -790); ctx.lineTo(360, -730); ctx.lineTo(420, -830); ctx.lineTo(470, -700);
  ctx.bezierCurveTo(820, -600, 1120, -300, 1260, 60); ctx.closePath(); ctx.fill();
  // eyes
  const EYES = G.THING_EYES;
  for (let i = 0; i < EYES.length; i++) {
    const o = eyes[i] || 0; if (o <= 0.01) continue;
    const [ex, ey, er] = EYES[i], look = opts.look || 0;
    G.glow(ctx, ex, ey, er * 4, [255, 170, 40], 0.35 * o);
    ctx.save(); ctx.translate(ex, ey); ctx.scale(1, Math.max(0.04, o));
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, er);
    gr.addColorStop(0, 'rgb(255,236,150)'); gr.addColorStop(0.6, 'rgb(255,170,40)'); gr.addColorStop(1, 'rgb(150,60,10)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, er, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgb(10,6,4)'; ctx.beginPath(); ctx.ellipse(look * er * 0.3, 0, er * 0.16, er * 0.86, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
};
G.THING_EYES = [[-60, -560, 34], [120, -600, 26], [-260, -470, 22], [300, -480, 24], [-430, -360, 16], [440, -340, 18], [-160, -300, 14], [40, -380, 80]];

window.WWS.G = G;
})();
