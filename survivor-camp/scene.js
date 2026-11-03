/* Survivor Camp scene: the side-on camp diorama on one canvas (SPEC 8.1, 8.2).
 *
 * World 1280 x 560 units. Horizon y 360, back row baseline y 400 (drawn at 0.9 scale, 12% darker), front row y 500,
 * fire at (640, 470). The camera fits the camp's x range for the current Camp Level into the free band between the
 * top bar and the bottom controls; a side sheet eases the camera so its building sits in the uncovered area.
 *
 * Draw order: sky, far skyline (parallax 0.3), ground, walls, back row, gate and truck, fire, front row, people, pile
 * and crate, then the light pass (a half-resolution darkness layer with destination-out holes, as in Two Thumbs
 * Left), a warm glow, embers, and last the badges that must always read: level plates, bubbles, timer pills, locks,
 * "+" plots. Hotspot rectangles (screen px, at least 44 x 44) come out of the same geometry, so the UI's <button>s
 * always sit on what is drawn.
 *
 * API (SC.Scene): init(canvas), setLayout({W, H, top, bottom, safeL, safeR}), setReduced(bool), setParticles(0..2),
 *   draw(state, view, now), hotspots() -> [{key, kind, id, x, y, w, h, z}], anchor(key) -> {x, y},
 *   focus({id, side: 'left'|'right'|'bottom', w} | null), fx: { spring(id), arc(id), spin(id, {progress, clock}),
 *   flare(), ghost(key) }, toScreen(wx, wy), camera(), lightRadius(), dawn().
 * Reduced motion (SPEC 8.9): camera moves become a 200 ms cross-fade cut, the light and the dawn step change at once,
 * the build spring becomes a 250 ms brightness flash, sway is 0.3x, embers 2/s, no bobbing, no plate flip.
 */
(function (root, f) {
  const api = f(root.SC || {});
  if (typeof module === 'object' && module.exports) module.exports = api; else (root.SC = root.SC || {}).Scene = api;
})(typeof self !== 'undefined' ? self : this, function (SC) {
  'use strict';
  const DATA = SC.DATA;
  const TAU = Math.PI * 2;
  const HORIZON = 360, BAND_TOP = 200, BAND_H = 300, FIRE = { x: 640, y: 470 };
  const ROW = { back: { y: 400, k: 0.9, dark: true }, front: { y: 500, k: 1 }, mid: { y: 500, k: 1 } };
  const PLOTS = {
    radio: { row: 'back', x: 250, w: 70, h: 230 },
    bunkhouse: { row: 'back', x: 450, w: 130, h: 120 },
    storehouse: { row: 'back', x: 830, w: 120, h: 110 },
    infirmary: { row: 'back', x: 1000, w: 120, h: 110 },
    workbench: { row: 'front', x: 330, w: 120, h: 100 },
    salvage: { row: 'front', x: 490, w: 140, h: 110 },
    campfire: { row: 'mid', x: 640, w: 90, h: 70 },
    garden: { row: 'front', x: 790, w: 140, h: 80 },
    generator: { row: 'front', x: 1120, w: 100, h: 120 },
  };
  const BACK_ORDER = ['radio', 'bunkhouse', 'storehouse', 'infirmary'];
  const FRONT_ORDER = ['workbench', 'salvage', 'garden', 'generator'];
  // Bubble anchors (world, the bubble's lower tip): first choice and fallbacks. Kept off other buildings' centres.
  const BUBBLE_AT = {
    salvage: [[522, 386], [470, 380], [560, 420]],
    garden: [[760, 414], [820, 414], [740, 440]],
    infirmary: [[1000, 296], [1040, 300], [960, 300]],
    generator: [[1120, 374], [1080, 380], [1160, 380]],
    radio: [[250, 190], [292, 250], [208, 250]],
  };
  const PAL = {
    wood: '#7a5634', woodDark: '#4e3622', woodLight: '#9a7148', metal: '#5d6873', metalDark: '#363e48', metalLight: '#8a96a2',
    rust: '#94452a', rustDark: '#62301e', canvas: '#8a7f68', canvasDark: '#655c4b', tarp: '#41657a', white: '#ddd6c6',
    whiteDark: '#b5ad9c', red: '#c3272b', leaf: '#62a447', leafDark: '#3f7230', soil: '#3b2b1f', stone: '#716960',
    stoneDark: '#4b453f', tyre: '#1c1d20', wire: '#2a2f36', glass: 'rgba(170,215,230,.22)', ink: '#15120d',
    car: '#5b6d5e', carDark: '#3c4a3f', sand: '#8c7b58',
  };
  const JACKETS = ['#b5532c', '#3f6f8f', '#7a8a3a', '#8f3f5c', '#c08a2e', '#4f7f6a', '#6a5a9a', '#9a6a3a', '#3a7a9a', '#a04a3a', '#5a8a5a', '#8a5a7a'];

  let cv = null, ctx = null, lc = null, lctx = null, starCv = null, glowSpr = null;
  let W = 568, H = 320, DPR = 1, reduced = false, particles = 1;
  const LAY = { top: 44, bottom: 64, safeL: 0, safeR: 0, padL: 8, padR: 8, playW: 112, blW: 240 };
  const cam = { s: 0.68, ox: 0, oy: 0 };
  let tween = null, camKey = '', snapNext = true, lastCL = 0, focusReq = null;
  const light = { r: 70, from: 70, to: 70, t0: 0, dur: 1200 };
  const fx = { spring: {}, arc: {}, fall: {}, spin: {}, plate: {}, appear: {}, flare: 0, ghosts: [] };
  const dawnT = { v: null, from: 0, to: 0, t0: 0 };
  let cutCv = null, cutAt = 0;                        // reduced motion: the last frame, faded out over 200 ms after a camera cut
  let embers = [], emberAcc = 0, lastNow = 0, flick = 1, flickT = 0, flickTo = 1, appearCL = 0;
  let hot = [], bubblePos = {}, anchors = {}, icons = {}, skyline = null;
  let mode = 0;                                       // 0 normal, 1 back row (12% darker), 2 silhouette
  const shadeMemo = {};
  let lamps = [];                                     // light holes collected while drawing (world units)
  let cur = { x: 0, y: 0, k: 1 };                     // current plot origin, for lamps

  // ------------------------------------------------------------------ helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return 'rgb(' + A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',') + ')'; }
  function C(n) {
    if (mode === 2) return '#0d1016';
    const c = PAL[n] || n;
    if (mode !== 1 || c[0] !== '#') return c;
    return shadeMemo[c] || (shadeMemo[c] = 'rgb(' + hexRgb(c).map((v) => Math.round(v * 0.88)).join(',') + ')');
  }
  function rng(seed) { let a = seed | 0; return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function box(x, y, w, h, c) { ctx.fillStyle = C(c); ctx.fillRect(x, y, w, h); }
  function poly(pts, c) { ctx.fillStyle = C(c); ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); }
  function seg(x1, y1, x2, y2, c, w) { ctx.strokeStyle = C(c); ctx.lineWidth = w || 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function circ(x, y, r, c) { ctx.fillStyle = C(c); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function ell(x, y, rx, ry, c) { ctx.fillStyle = C(c); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  function rrect(c2, x, y, w, h, r) { c2.beginPath(); if (c2.roundRect) c2.roundRect(x, y, w, h, r); else { c2.moveTo(x + r, y); c2.arcTo(x + w, y, x + w, y + h, r); c2.arcTo(x + w, y + h, x, y + h, r); c2.arcTo(x, y + h, x, y, r); c2.arcTo(x, y, x + w, y, r); c2.closePath(); } }
  function lamp(lx, ly, r, a) { lamps.push({ x: cur.x + lx * cur.k, y: cur.y + ly * cur.k, r: r, a: a == null ? 0.85 : a }); }
  function icon(name, x, y, size, color) {
    const p = icons[name]; if (!p) return;
    ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / p.vb, size / p.vb); ctx.fillStyle = color; ctx.fill(p.path, 'evenodd'); ctx.restore();
  }
  function loadIcons() {
    if (typeof document === 'undefined' || typeof Path2D === 'undefined') return;
    for (const sym of document.querySelectorAll('symbol[id^="i-"]')) {
      const d = Array.from(sym.querySelectorAll('path')).map((p) => p.getAttribute('d')).join(' ');
      const vb = (sym.getAttribute('viewBox') || '0 0 24 24').split(/\s+/).map(Number);
      try { icons[sym.id.slice(2)] = { path: new Path2D(d), vb: vb[2], vh: vb[3] }; } catch (e) { /* keep going without this icon */ }
    }
  }

  // ------------------------------------------------------------------ setup and camera
  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    lc = document.createElement('canvas'); lctx = lc.getContext('2d');
    glowSpr = document.createElement('canvas'); glowSpr.width = glowSpr.height = 128;
    const g = glowSpr.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,.92)'); gr.addColorStop(0.78, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    loadIcons();
    const R = rng(77); skyline = [];
    for (let x = -1500; x < 2800;) {
      const w = 40 + R() * 90, h = 50 + R() * 170, win = [];
      for (let i = 0; i < 6; i++) if (R() < 0.18) win.push([R() * (w - 8) + 4, R() * (h - 14) + 8]);
      skyline.push({ x, w, h, win, ant: R() < 0.2 });
      x += w + R() * 30 - 6;
    }
  }
  function setLayout(o) {
    W = Math.max(1, o.W); H = Math.max(1, o.H);
    Object.assign(LAY, { top: o.top, bottom: o.bottom, safeL: o.safeL || 0, safeR: o.safeR || 0, padL: o.padL || 8, padR: o.padR || 8, playW: o.playW || 112, blW: o.blW || 240 });
    DPR = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (!cv) return;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    lc.width = Math.max(1, Math.round(W * DPR / 2)); lc.height = Math.max(1, Math.round(H * DPR / 2));
    starCv = null; snapNext = true; bgKey = '';
  }
  function setReduced(v) { reduced = !!v; }
  function setParticles(v) { particles = Math.max(0, Math.min(2, +v || 0)); }
  function focus(f) { focusReq = f && f.id ? { id: f.id, side: f.side, w: f.w || 0 } : null; }

  function fitFor(range, cl) {
    const campW = range[1] - range[0], cx = (range[0] + range[1]) / 2;
    const safeW = W - LAY.safeL - LAY.safeR;
    const bandH = H - LAY.top - LAY.bottom - 8;
    const s = Math.max(0.15, Math.min(safeW / campW, bandH / BAND_H, 1.6));
    const midY = (LAY.top + (H - LAY.bottom)) / 2;
    let ox = LAY.safeL + safeW / 2 - cx * s;
    const oy = midY - (BAND_TOP + BAND_H / 2) * s;
    if (focusReq && PLOTS[focusReq.id] && focusReq.side !== 'bottom') {
      const bx = PLOTS[focusReq.id].x;
      const a = focusReq.side === 'right' ? LAY.safeL : LAY.safeL + focusReq.w + 8;
      const b = focusReq.side === 'right' ? W - LAY.safeR - focusReq.w - 8 : W - LAY.safeR;
      const sx = bx * s + ox;
      ox += (a + b) / 2 - sx;
    }
    return { s, ox, oy, cl };
  }
  function updateCamera(view, now) {
    const t = fitFor(view.campRange, view.cl);
    const key = [t.s.toFixed(4), t.ox.toFixed(1), t.oy.toFixed(1)].join(',');
    if (snapNext || !lastCL) { Object.assign(cam, t); tween = null; snapNext = false; camKey = key; lastCL = view.cl; return; }
    if (key !== camKey) {
      const dur = view.cl !== lastCL ? 1200 : 300;
      if (reduced) {                                  // a 200 ms cross-fade cut to the final framing
        if (cv && cv.width) { if (!cutCv) cutCv = document.createElement('canvas'); cutCv.width = cv.width; cutCv.height = cv.height; cutCv.getContext('2d').drawImage(cv, 0, 0); cutAt = now; }
        Object.assign(cam, t); tween = null;
      } else tween = { a: { s: cam.s, ox: cam.ox, oy: cam.oy }, b: t, t0: now, dur };
      camKey = key; lastCL = view.cl;
    }
    if (tween) {
      const k = clamp((now - tween.t0) / tween.dur, 0, 1), e = ease(k);
      cam.s = lerp(tween.a.s, tween.b.s, e); cam.ox = lerp(tween.a.ox, tween.b.ox, e); cam.oy = lerp(tween.a.oy, tween.b.oy, e);
      if (k >= 1) tween = null;
    }
  }
  const toScreen = (wx, wy) => ({ x: wx * cam.s + cam.ox, y: wy * cam.s + cam.oy });

  // ------------------------------------------------------------------ geometry and hotspots
  function plotRect(id) {
    const p = PLOTS[id], r = ROW[p.row], w = p.w * r.k, h = p.h * r.k;
    return { x: p.x - w / 2, y: r.y - h, w, h, cx: p.x, base: r.y, k: r.k };
  }
  const visible = (id, range) => PLOTS[id].x >= range[0] - 5 && PLOTS[id].x <= range[1] + 5;
  function inflate(r, z) {
    const sx = r.x * cam.s + cam.ox, sy = r.y * cam.s + cam.oy, sw = r.w * cam.s, sh = r.h * cam.s;
    const w = Math.max(44, sw), h = Math.max(44, sh);
    return { x: sx + sw / 2 - w / 2, y: sy + sh / 2 - h / 2, w, h, z };
  }
  function pileAt() { return { x: 548, y: 474, w: 48, h: 28 }; }
  function crateAt() { return { x: 694, y: 498, w: 40, h: 30 }; }
  function gateX(range) { return range[1] - 20; }
  function truckAt(range) { const gx = gateX(range); return { x: gx - 30 - 8 - 70, y: 500, w: 70, h: 40 }; }
  function computeHot(view, state) {
    const range = view.campRange, out = [], centres = [];
    for (const id of BACK_ORDER.concat(['campfire'], FRONT_ORDER)) {
      if (!visible(id, range)) continue;
      const r = inflate(plotRect(id), PLOTS[id].row === 'back' ? 2 : 3);
      if (!focusReq && !tween) { r.x = clamp(r.x, LAY.safeL, W - LAY.safeR - r.w); r.y = clamp(r.y, 0, H - r.h); }
      else if (r.x < LAY.safeL || r.x + r.w > W - LAY.safeR) continue;    // pushed under a notch by a sheet: reachable again when it closes
      out.push(Object.assign({ key: id, kind: 'building', id }, r));
      centres.push([r.x + r.w / 2, r.y + r.h / 2]);
    }
    // the bottom controls are obstacles for decor and bubbles
    const obst = [
      { x: W - LAY.padR - LAY.playW - 4, y: H - LAY.bottom - 4, w: LAY.playW + LAY.padR + 4, h: LAY.bottom + 4 },
      { x: 0, y: H - LAY.bottom - 4, w: LAY.padL + LAY.blW + 4, h: LAY.bottom + 4 },
    ];
    const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const free = (b) => !centres.some(([x, y]) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) && !obst.some((o) => hit(o, b));
    const onScreen = (b) => b.x >= LAY.safeL && b.x + b.w <= W - LAY.safeR && b.y >= LAY.top && b.y + b.h <= H;
    const place = (cands) => { for (const b of cands) if (free(b) && onScreen(b)) return b; return cands[0]; };
    if (state.pile > 0) { const p = pileAt(); const b = place([0, 18, -18, 36].map((dx) => inflate({ x: p.x + dx, y: p.y, w: p.w, h: p.h }, 4))); out.push(Object.assign({ key: 'pile', kind: 'pile', id: 'pile' }, b)); }
    if (view.crate) { const c = crateAt(); const b = place([0, 24, -14, 44, 64].map((dx) => inflate({ x: c.x + dx, y: c.y, w: c.w, h: c.h }, 4))); out.push(Object.assign({ key: 'crate', kind: 'crate', id: 'crate' }, b)); anchors.crate = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
    const tr = view.truck; truckDx = 0;
    if (tr && tr.scrap + tr.food + tr.meds > 0) {
      const t = truckAt(range), dxs = [0, -40, -80, -120, -160, -200, -240];
      const cands = dxs.map((dx) => inflate({ x: t.x + dx, y: t.y, w: t.w, h: t.h }, 4)), b = place(cands);
      truckDx = dxs[cands.indexOf(b)] || 0;
      out.push(Object.assign({ key: 'truck', kind: 'truck', id: 'truck' }, b)); anchors.truck = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }
    bubblePos = {};
    for (const id of Object.keys(BUBBLE_AT)) {
      const hs = view.hotspots[id]; if (!hs || !hs.bubble || !hs.bubble.show || !visible(id, range)) continue;
      const cands = BUBBLE_AT[id].map(([wx, wy]) => {
        const p = toScreen(wx, wy); let y = p.y - 24; y = Math.max(LAY.top + 24, y);
        return { x: p.x - 22, y: y - 22, w: 44, h: 44, z: 5 };
      });
      const b = place(cands);
      bubblePos[id] = { x: b.x + 22, y: b.y + 22 };
      out.push(Object.assign({ key: 'bubble:' + id, kind: 'bubble', id }, b));
    }
    for (const h of out) if (h.kind === 'building') anchors[h.key] = { x: h.x + h.w / 2, y: h.y + h.h * 0.35 };
    for (const id of Object.keys(bubblePos)) anchors['bubble:' + id] = bubblePos[id];
    anchors.fire = toScreen(FIRE.x, FIRE.y - 20);
    if (state.pile > 0) { const h = out.find((o) => o.key === 'pile'); anchors.pile = { x: h.x + h.w / 2, y: h.y + h.h / 2 }; }
    hot = out;
  }
  function anchor(key) {
    if (anchors[key]) return anchors[key];
    if (PLOTS[key]) { const r = plotRect(key); return toScreen(r.cx, r.y + r.h * 0.4); }
    return toScreen(FIRE.x, FIRE.y);
  }

  // ------------------------------------------------------------------ backdrop
  function drawSky(dawn, now) {
    const hy = HORIZON * cam.s + cam.oy;
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(10, hy));
    g.addColorStop(0, mix('#05070c', '#1a2036', dawn)); g.addColorStop(0.55, mix('#080b12', '#3a2a3a', dawn)); g.addColorStop(1, mix('#0b0e14', '#8a4a2a', dawn));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.ceil(hy) + 1);
  }
  function drawStars(dawn, now) {
    if (!starCv) {
      starCv = document.createElement('canvas'); starCv.width = Math.round(W * DPR); starCv.height = Math.round(H * DPR);
      const s = starCv.getContext('2d'), R = rng(1234);
      s.scale(DPR, DPR);
      for (let i = 0; i < 120; i++) {
        const x = R() * W, y = R() * H * 0.7, r = 0.4 + R() * 1.1, a = 0.35 + R() * 0.65;
        s.fillStyle = 'rgba(236,232,223,' + a.toFixed(2) + ')'; s.beginPath(); s.arc(x, y, r, 0, TAU); s.fill();
      }
    }
    const hy = HORIZON * cam.s + cam.oy;
    ctx.save(); ctx.globalAlpha = 1 - 0.85 * dawn;
    ctx.beginPath(); ctx.rect(0, 0, W, hy - 4); ctx.clip();
    ctx.drawImage(starCv, 0, 0, W, H); ctx.restore();
  }
  function skyX(wx) { const c = 640 * cam.s + cam.ox; return W / 2 + (c - W / 2) * 0.3 + (wx - 640) * cam.s * 0.6; }
  function drawSkyline(now) {
    const hy = HORIZON * cam.s + cam.oy, k = cam.s * 0.6;
    ctx.fillStyle = '#0c0f15';
    for (const b of skyline) {
      const x = skyX(b.x); if (x > W || x + b.w * k < 0) continue;
      ctx.fillRect(x, hy - b.h * k, b.w * k + 0.5, b.h * k + 1);
      if (b.ant) ctx.fillRect(x + b.w * k * 0.5, hy - b.h * k - 14 * k, 1, 14 * k);
    }
  }
  function drawSkyWindows(dawn) {          // static: cached in the after-light layer
    const hy = HORIZON * cam.s + cam.oy, k = cam.s * 0.6;
    ctx.fillStyle = 'rgba(255,198,107,' + (0.75 - 0.4 * dawn).toFixed(2) + ')';
    for (const b of skyline) { const x = skyX(b.x); if (x > W || x + b.w * k < 0) continue; for (const w of b.win) ctx.fillRect(x + w[0] * k, hy - b.h * k + w[1] * k, Math.max(1, 3 * k), Math.max(1, 3 * k)); }
  }
  function drawFarFire(now) {              // animated: the distant fire and its smoke
    const hy = HORIZON * cam.s + cam.oy, k = cam.s * 0.6;
    const fx0 = skyX(1750), fy = hy - 4;
    if (fx0 > -60 && fx0 < W + 60) {
      const fl = 0.8 + 0.2 * Math.sin(now / 130) * Math.sin(now / 57);
      const g = ctx.createRadialGradient(fx0, fy, 0, fx0, fy, 40 * k + 12);
      g.addColorStop(0, 'rgba(255,140,60,' + (0.55 * fl).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g; ctx.fillRect(fx0 - 60, fy - 60, 120, 120);
      for (let i = 0; i < 5; i++) {
        const t = ((now / 4000) + i / 5) % 1;
        ctx.fillStyle = 'rgba(60,55,58,' + (0.35 * (1 - t)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(fx0 + t * 30 * k + Math.sin(t * 6 + i) * 4, fy - 8 - t * 120 * k, (6 + t * 22) * k, 0, TAU); ctx.fill();
      }
    }
  }
  // Backdrop (sky, skyline, ground) and the static after-light layer (stars, far windows) are cached and rebuilt only
  // when the camera, the dawn step or the size changes.
  let bgCv = null, afCv = null, bgKey = '', curDawn = 0;
  function ensureCaches(view, now) {
    const key = [W, H, DPR, cam.s.toFixed(4), cam.ox.toFixed(1), cam.oy.toFixed(1), curDawn.toFixed(3), view.campRange.join('-')].join(',');
    if (key === bgKey && bgCv) return;
    bgKey = key;
    if (!bgCv) { bgCv = document.createElement('canvas'); afCv = document.createElement('canvas'); }
    for (const c of [bgCv, afCv]) { if (c.width !== cv.width || c.height !== cv.height) { c.width = cv.width; c.height = cv.height; } }
    const main = ctx;
    ctx = bgCv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, bgCv.width, bgCv.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); drawSky(curDawn, now); drawSkyline(now);
    ctx.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * cam.ox, DPR * cam.oy); drawGround(view);
    ctx = afCv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, afCv.width, afCv.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); drawStars(curDawn, now); drawSkyWindows(curDawn);
    ctx = main;
  }
  let groundPat = null;
  function drawGround(view) {
    if (!groundPat) {
      const t = document.createElement('canvas'); t.width = t.height = 64; const g = t.getContext('2d'), R = rng(9);
      g.fillStyle = '#12100e'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 70; i++) { g.fillStyle = R() < 0.5 ? 'rgba(60,52,44,.55)' : 'rgba(5,5,5,.5)'; g.fillRect(R() * 64, R() * 64, 1 + R() * 2, 1 + R()); }
      groundPat = ctx.createPattern(t, 'repeat');
    }
    ctx.fillStyle = groundPat; ctx.fillRect(-3000, HORIZON, 7280, 2000);
    const r = view.campRange, cx = (r[0] + r[1]) / 2, hw = (r[1] - r[0]) / 2 + 40;
    ctx.fillStyle = 'rgba(48,38,28,.55)'; ctx.beginPath(); ctx.ellipse(cx, 470, hw, 95, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-3000, HORIZON, 7280, 6);
  }

  // ------------------------------------------------------------------ walls, gate, truck, decor
  function drawWalls(view, now) {
    const r = view.campRange, c = view.cl, L = r[0], R2 = r[1];
    if (c <= 1) {
      // car wreck on the left, tyre stack on the right beyond the gate
      ctx.save(); ctx.translate(L - 30, 500);
      poly([-48, 0, -48, -22, -30, -24, -18, -40, 18, -40, 30, -24, 50, -20, 50, 0], 'car'); box(-14, -36, 26, 12, 'carDark');
      circ(-30, 0, 9, 'tyre'); circ(32, 0, 9, 'tyre'); ctx.restore();
      tyres(R2 + 30, 500, 3);
    } else if (c <= 3) {
      pallets(L - 20, 500); tyres(L + 14, 500, 2);
      pallets(R2 + 26, 500); tyres(R2 + 58, 500, 3);
    } else {
      sheetWall(L - 8, 500, now); sheetWall(R2 + 26, 500, now);
    }
    // gate at the right camp edge
    const gx = gateX(r);
    box(gx - 34, 408, 6, 92, 'metalDark'); box(gx + 28, 408, 6, 92, 'metalDark');
    box(gx - 28, 420, 27, 80, c >= 4 ? 'metal' : 'woodDark'); box(gx + 1, 420, 27, 80, c >= 4 ? 'metal' : 'woodDark');
    for (let i = 0; i < 4; i++) seg(gx - 28, 430 + i * 20, gx + 28, 430 + i * 20, 'wire', 2);
    seg(gx - 28, 420, gx - 1, 500, 'wire', 2); seg(gx + 28, 420, gx + 1, 500, 'wire', 2);
    lamps.push({ x: gx - 31, y: 404, r: 26, a: 0.6 });
  }
  function tyres(x, y, n) { for (let i = 0; i < n; i++) { ell(x, y - 6 - i * 11, 15, 6, 'tyre'); ell(x, y - 7 - i * 11, 7, 2.5, '#0a0a0c'); } }
  function pallets(x, y) { for (let i = 0; i < 4; i++) { box(x - 22, y - 8 - i * 9, 44, 6, i % 2 ? 'woodDark' : 'wood'); } box(x - 20, y - 70, 6, 36, 'woodDark'); box(x + 12, y - 64, 6, 30, 'woodDark'); }
  function sheetWall(x, y, now) {
    for (let i = 0; i < 3; i++) { box(x - 18 + i * 12, y - 86 + (i % 2) * 6, 12, 86 - (i % 2) * 6, i % 2 ? 'metalDark' : 'metal'); }
    ctx.fillStyle = C('metalLight');
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 18 + i * 6, y - 86); ctx.lineTo(x - 15 + i * 6, y - 98); ctx.lineTo(x - 12 + i * 6, y - 86); ctx.fill(); }
  }
  let truckDx = 0;
  function drawTruck(view, now) {
    const t = truckAt(view.campRange), x = t.x + t.w / 2 + truckDx, y = 540;
    box(x - 35, y - 26, 48, 18, 'rustDark'); box(x + 13, y - 34, 22, 26, 'rust'); box(x + 17, y - 31, 12, 9, 'glass');
    const tr = view.truck; const full = tr && tr.scrap + tr.food + tr.meds > 0;
    if (full) { box(x - 32, y - 38, 14, 12, 'wood'); box(x - 16, y - 36, 14, 10, 'woodLight'); box(x - 24, y - 48, 12, 10, 'wood'); }
    circ(x - 22, y - 6, 7, 'tyre'); circ(x + 22, y - 6, 7, 'tyre');
  }
  function drawPile(now) {
    const p = pileAt(), x = p.x + p.w / 2, y = p.y + p.h;
    poly([x - 26, y, x - 18, y - 14, x - 6, y - 22, x + 8, y - 18, x + 20, y - 10, x + 26, y], 'metal');
    box(x - 14, y - 16, 18, 4, 'metalLight'); seg(x - 4, y - 24, x + 12, y - 8, 'rust', 3); circ(x + 14, y - 6, 4, 'tyre');
  }
  function drawCrate(view, now) {
    const c = crateAt(), b = hot.find((h) => h.key === 'crate');
    const x = b ? (b.x + b.w / 2 - cam.ox) / cam.s : c.x + c.w / 2, y = c.y + c.h;
    box(x - 20, y - 30, 40, 30, 'wood'); box(x - 20, y - 30, 40, 5, 'woodLight');
    seg(x - 18, y - 2, x + 18, y - 26, 'woodDark', 3); seg(x - 18, y - 26, x + 18, y - 2, 'woodDark', 3);
  }
  function drawForeground(view) {
    const r = view.campRange, R = rng(31);
    for (let i = 0; i < 18; i++) {
      const x = r[0] - 80 + R() * (r[1] - r[0] + 160), y = 512 + R() * 44;
      if (x > 600 && x < 760 && y < 535) continue;
      ctx.fillStyle = R() < 0.5 ? '#1d1914' : '#26201a';
      ctx.beginPath(); ctx.ellipse(x, y, 6 + R() * 14, 2 + R() * 3, 0, 0, TAU); ctx.fill();
      if (R() < 0.4) { ctx.strokeStyle = '#2d3a22'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 8); ctx.moveTo(x + 2, y); ctx.lineTo(x + 4, y - 7); ctx.stroke(); }
    }
  }

  // ------------------------------------------------------------------ building art (local units, origin at the base centre)
  const ART = {};
  ART.radio = function (L, now, ex) {
    seg(0, -196, -34, 0, 'wire', 1.5); seg(0, -196, 34, 0, 'wire', 1.5);
    if (L >= 3) {
      seg(-7, 0, -3, -222, 'metal', 3); seg(7, 0, 3, -222, 'metal', 3);
      for (let y = -10; y > -215; y -= 18) { seg(-7 + (-y / 222) * 4, y, 7 - ((-y - 18) / 222) * 4, y - 18, 'metalDark', 1.5); }
    } else box(-3, -215, 6, 215, 'metal');
    seg(0, -215, 0, -232, 'metalLight', 2); seg(-9, -206, 9, -206, 'metalLight', 2);
    if (L >= 3) { const on = Math.sin(now / 400) > 0; circ(0, -233, 3.5, on ? '#ff3b2f' : '#5a1a14'); if (on) lamp(0, -233, 24, 0.7); }
    if (L >= 6) { ctx.save(); ctx.translate(-12, -150); ctx.rotate(-0.5); ell(0, 0, 14, 6, 'whiteDark'); ctx.restore(); seg(-6, -150, 0, -150, 'metal', 2); }
    box(8, -26, 32, 26, 'wood'); box(8, -26, 32, 4, 'woodLight');
    box(12, -38, 22, 12, 'metalDark'); circ(29, -32, 2, Math.sin(now / 250) > -0.2 ? '#3bd16f' : '#1b4a2a');
    lamp(24, -30, 30, 0.6);
    if (ex.partyOut && mode === 0) {
      ctx.strokeStyle = 'rgba(255,198,107,.5)'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const t = ((now / 1600) + i / 3) % 1; ctx.globalAlpha = 1 - t; ctx.beginPath(); ctx.arc(0, -232, 10 + t * 40, -2.4, -0.7); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  };
  ART.bunkhouse = function (L, now, ex) {
    if (L < 3) {
      poly([-62, 0, -33, -64, -4, 0], 'canvas'); poly([-33, -64, -4, 0, -20, 0], 'canvasDark'); poly([-38, 0, -33, -34, -28, 0], '#2b261e');
      poly([4, 0, 33, -58, 62, 0], 'canvas'); poly([33, -58, 62, 0, 46, 0], 'canvasDark'); poly([28, 0, 33, -30, 38, 0], '#2b261e');
      if (ex.lit > 0) lamp(-33, -16, 30, 0.5);
      return;
    }
    const top = L >= 6 ? -118 : -72;
    box(-60, -72, 120, 72, 'wood');
    for (let y = -64; y < 0; y += 9) seg(-60, y, 60, y, 'woodDark', 1);
    if (L >= 6) { box(-52, -118, 104, 46, 'woodLight'); for (let y = -110; y < -72; y += 9) seg(-52, y, 52, y, 'wood', 1); }
    poly([-68, top, 0, top - 28, 68, top], 'woodDark');
    box(-10, -42, 20, 42, '#2b1e14');
    const wins = L >= 6 ? [[-46, -56], [28, -56], [-40, -104], [-8, -104], [24, -104]] : [[-46, -56], [28, -56]];
    wins.forEach(([x, y], i) => { const lit = i < ex.lit; box(x, y, 16, 14, lit ? '#ffc66b' : '#1a1712'); if (lit) lamp(x + 8, y + 7, 40, 0.55); });
  };
  ART.storehouse = function (L, now) {
    box(-58, -50, 116, 50, 'rust'); box(-58, -50, 116, 5, 'rustDark');
    for (let x = -52; x < 58; x += 9) seg(x, -44, x, -2, 'rustDark', 1.5);
    seg(40, -44, 40, -2, '#2b130b', 2); box(44, -30, 3, 10, 'metalLight');
    if (L >= 3) { box(-56, -22, 22, 22, 'wood'); box(-50, -40, 18, 18, 'woodLight'); seg(-56, -22, -34, 0, 'woodDark', 2); box(36, -18, 18, 18, 'wood'); }
    if (L >= 6) { box(-48, -96, 100, 46, 'tarp'); box(-48, -96, 100, 5, '#2f4a5a'); for (let x = -42; x < 52; x += 9) seg(x, -90, x, -52, '#2f4a5a', 1.5); poly([-54, -96, 58, -96, 64, -76, -60, -80], 'canvasDark'); }
  };
  ART.infirmary = function (L, now, ex) {
    const tw = L >= 3 ? 30 : 34;
    poly([-56, 0, -50, -54, -22, -70, tw - 14, -70, tw - 4, -52, tw, 0], 'white');
    poly([-22, -70, -50, -54, -56, 0, -40, 0], 'whiteDark');
    box(-6, -66, 8, 22, 'red'); box(-13, -59, 22, 8, 'red');
    poly([-14, 0, -4, -34, 6, 0], '#3a3530'); lamp(-4, -16, 36, 0.6);
    if (L >= 3) { box(tw - 2, -46, 26, 46, 'whiteDark'); box(tw + 4, -38, 12, 10, 'glass'); circ(tw + 6, 0, 5, 'tyre'); }
    if (L >= 6) { box(-62, -30, 44, 26, 'white'); box(-62, -18, 44, 5, 'red'); box(-30, -26, 12, 10, 'glass'); circ(-52, -2, 6, 'tyre'); circ(-26, -2, 6, 'tyre'); }
    // the shelf: one box per medkit, one bottle per pills in stock
    const sx = 40;
    box(sx, -42, 18, 3, 'woodDark'); box(sx, -22, 18, 3, 'woodDark'); box(sx, -42, 2, 42, 'woodDark'); box(sx + 16, -42, 2, 42, 'woodDark');
    for (let i = 0; i < Math.min(3, ex.medkit); i++) { box(sx + 2 + i * 5, -50, 5, 8, 'red'); box(sx + 3.5 + i * 5, -47, 2, 3, 'white'); }
    for (let i = 0; i < Math.min(3, ex.pills); i++) { box(sx + 3 + i * 5, -30, 4, 8, 'white'); box(sx + 3 + i * 5, -31, 4, 2, '#3a7a9a'); }
  };
  ART.workbench = function (L, now, ex) {
    if (L >= 3) { box(-58, -92, 46, 92, 'metalDark'); seg(-35, -88, -35, -4, '#20262d', 2); for (let y = -84; y < -60; y += 5) seg(-54, y, -40, y, '#20262d', 1); }
    if (L >= 6) { for (let i = 0; i < 3; i++) ell(-46 + i * 14, -6, 9, 6, 'sand'); ell(-39, -15, 9, 6, 'sand'); circ(48, -14, 12, 'stone'); circ(48, -14, 3, 'stoneDark'); }
    // the rack shows the unlocked weapons
    box(-8, -96, 62, 44, 'woodDark');
    const guns = [['smg', -84], ['shotgun', -71], ['rifle', -58]];
    for (const [g, y] of guns) {
      if (mode === 2) break;
      const owned = ex.weapons && ex.weapons[g];
      icon(g, 23, y, 52, owned ? C('metalLight') : 'rgba(255,255,255,.07)');
    }
    box(-30, -36, 76, 7, 'woodLight'); box(-28, -29, 5, 29, 'wood'); box(38, -29, 5, 29, 'wood');
    box(20, -46, 12, 10, 'metal'); box(24, -50, 4, 4, 'metalLight');
    seg(-22, -36, -28, -70, 'metal', 3); poly([-36, -72, -20, -72, -24, -80, -32, -80], 'metalLight');
    if (mode === 0) { circ(-28, -70, 3, '#fff1c4'); lamp(-28, -66, 50, 0.7); }
    box(46, -18, 18, 18, 'wood');
    for (let i = 0; i < Math.min(3, ex.bomb); i++) { box(48 + i * 5, -26, 4, 8, '#5d7a3a'); }
  };
  ART.salvage = function (L, now) {
    if (L >= 3) { poly([-70, 0, -70, -58, -20, -74, -20, 0], 'metalDark'); seg(-70, -58, -20, -74, 'metalLight', 2); }
    poly([-36, 0, -24, -30, -6, -46, 14, -40, 30, -24, 44, 0], 'metal');
    poly([-24, -30, -6, -46, 2, -30, -14, -18], 'metalLight'); seg(-10, -36, 20, -14, 'rust', 4); box(4, -34, 16, 6, 'rustDark');
    ell(-46, -11, 13, 11, 'tyre'); ell(-46, -11, 5, 4, '#0a0a0c');
    box(36, -20, 26, 13, 'metalDark'); circ(40, -4, 4, 'tyre'); circ(58, -4, 4, 'tyre');
    if (L >= 3) {
      const sw = Math.sin(now / 900) * (reduced ? 0.02 : 0.08);
      if (L >= 6) {
        seg(56, 0, 56, -112, 'rust', 5); seg(56, -110, -10, -118, 'rust', 4);
        ctx.save(); ctx.translate(-4, -117); ctx.rotate(sw); seg(0, 0, 0, 34, 'wire', 1.5);
        box(-22, 34, 44, 14, 'car'); box(-12, 26, 22, 9, 'carDark'); circ(-12, 48, 5, 'tyre'); circ(12, 48, 5, 'tyre'); ctx.restore();
      } else {
        seg(44, 0, 58, -96, 'rust', 4); seg(72, 0, 58, -96, 'rust', 4); seg(58, -96, 30, -92, 'rust', 3);
        ctx.save(); ctx.translate(31, -92); ctx.rotate(sw); seg(0, 0, 0, 40, 'wire', 1.5); box(-5, 40, 10, 6, 'metalLight'); ctx.restore();
      }
    }
  };
  ART.garden = function (L, now, ex) {
    if (L >= 6) { box(-68, -76, 136, 76, 'glass'); ctx.strokeStyle = C('metalLight'); ctx.lineWidth = 2; ctx.strokeRect(-68, -76, 136, 76); seg(0, -76, 0, 0, 'metalLight', 2); poly([-72, -76, 0, -96, 72, -76], 'glass'); if (mode === 0) { box(-30, -72, 60, 3, '#d080ff'); lamp(0, -60, 60, 0.6); } }
    const fill = clamp(ex.fill || 0, 0, 1), sway = reduced ? 0 : Math.sin(now / 700) * 1.5;
    for (let b = -1; b <= 1; b++) {
      const x = b * 44;
      box(x - 19, -14, 38, 14, 'wood'); box(x - 17, -15, 34, 4, 'soil');
      for (let i = 0; i < 5; i++) {
        const sx = x - 14 + i * 7, h = 5 + fill * 20 + ((i * 7 + b * 3) % 5);
        seg(sx, -15, sx + sway * (h / 20), -15 - h, 'leafDark', 2);
        ell(sx + sway * (h / 20) - 3, -15 - h + 2, 3.5, 2, 'leaf'); ell(sx + sway * (h / 20) + 3, -15 - h + 4, 3.5, 2, 'leaf');
      }
    }
    if (L >= 3 && L < 6) {
      ctx.strokeStyle = C('metalLight'); ctx.lineWidth = 1.5;
      for (let b = -1; b <= 1; b++) { ctx.fillStyle = 'rgba(190,220,210,.12)'; ctx.beginPath(); ctx.arc(b * 44, -12, 21, Math.PI, 0); ctx.fill(); ctx.stroke(); }
    }
  };
  ART.generator = function (L, now, ex) {
    box(-44, -58, 62, 58, 'metalDark'); poly([-50, -58, 24, -58, 18, -70, -44, -70], 'metal');
    box(-36, -44, 18, 44, '#20262d'); box(-10, -46, 20, 10, 'metal');
    for (let i = 0; i < ex.holds; i++) box(-8 + i * 5, -42, 3, 5, i < ex.charges ? '#ffd84a' : '#3a3520');
    seg(6, -70, 6, -84, 'metal', 4);
    if (mode === 0 && !reduced) for (let i = 0; i < 3; i++) { const t = ((now / 1800) + i / 3) % 1; ctx.fillStyle = 'rgba(70,70,75,' + (0.4 * (1 - t)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(6 + t * 8, -88 - t * 30, 3 + t * 8, 0, TAU); ctx.fill(); }
    seg(34, 0, 34, -112, 'metal', 3); poly([24, -116, 46, -116, 42, -108, 28, -108], 'metalLight');
    if (mode === 0) { box(28, -108, 14, 2, '#fff1c4'); lamp(34, -96, 70, 0.75); }
  };
  ART.campfire = function (L, now, ex) {
    const lit = ex.lit, cl = L;
    if (cl >= 10) { box(-26, -60, 52, 60, 'metalDark'); box(-30, -64, 60, 6, 'metal'); seg(-22, 0, -16, -60, 'wire', 2); seg(22, 0, 16, -60, 'wire', 2); }
    else if (cl >= 5) { box(-18, -36, 36, 36, 'rust'); box(-18, -36, 36, 4, 'rustDark'); box(-18, -20, 36, 3, 'rustDark'); }
    else {
      for (let i = 0; i < 9; i++) { const a = Math.PI * (i / 8); ell(Math.cos(a) * -34, -4 - Math.sin(a) * 8, 8, 6, i % 2 ? 'stone' : 'stoneDark'); }
      ctx.save(); ctx.translate(0, -8); ctx.rotate(0.35); box(-22, -3, 44, 6, 'woodDark'); ctx.rotate(-0.7); box(-22, -3, 44, 6, 'wood'); ctx.restore();
    }
    if (mode !== 0) return;
    const by = cl >= 10 ? -64 : cl >= 5 ? -36 : -8;
    if (!lit) {
      circ(-4, by - 2, 3, '#5a1a0e'); circ(5, by - 3, 2, '#7a2a10');
      for (let i = 0; i < 3; i++) { const t = ((now / 2600) + i / 3) % 1; ctx.fillStyle = 'rgba(90,90,95,' + (0.3 * (1 - t)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(Math.sin(t * 5 + i) * 6, by - 10 - t * 50, 3 + t * 9, 0, TAU); ctx.fill(); }
      return;
    }
    const big = (cl >= 10 ? 2.2 : 1 + 0.06 * (cl - 1)) * (1 + (fx.flare && now - fx.flare < 600 ? 0.3 * (1 - (now - fx.flare) / 600) : 0));
    const sw = reduced ? 0.3 : 1;
    const layers = [['#7a1d0e', 30, 62], ['#e0461b', 24, 50], ['#ffb347', 16, 36], ['#fff1c4', 8, 20]];
    layers.forEach(([c, w, h], i) => {
      const s1 = Math.sin(now / (170 + i * 40) + i) * 4 * sw, h1 = h * big * (1 + 0.08 * Math.sin(now / (90 + i * 23)) * sw);
      ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(s1, by - h1); ctx.bezierCurveTo(w * big * 0.62, by - h1 * 0.45, w * big * 0.55, by, 0, by); ctx.bezierCurveTo(-w * big * 0.55, by, -w * big * 0.62, by - h1 * 0.45, s1, by - h1); ctx.fill();
    });
  };

  function scaffold(L, w, h, k) {
    const x0 = -w / 2, x1 = w / 2;
    ctx.strokeStyle = C('woodLight'); ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, 0); ctx.lineTo(x0, -h); ctx.moveTo(x1, 0); ctx.lineTo(x1, -h);
    for (let y = 0; y > -h; y -= 30) { ctx.moveTo(x0, y); ctx.lineTo(x1, y - 30 > -h ? y - 30 : -h); ctx.moveTo(x1, y); ctx.lineTo(x0, y - 30 > -h ? y - 30 : -h); }
    ctx.moveTo(x0, -h); ctx.lineTo(x1, -h);
    ctx.stroke();
  }

  // ------------------------------------------------------------------ one plot
  function springScale(id, now) {
    const t0 = fx.spring[id]; if (!t0) return 1;
    const k = (now - t0) / 450; if (k >= 1) { delete fx.spring[id]; return 1; }
    if (reduced) return 1;
    const keys = [[0, 1], [0.35, 1.12], [0.7, 0.96], [1, 1]];
    for (let i = 1; i < keys.length; i++) if (k <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; return lerp(a[1], b[1], ease((k - a[0]) / (b[0] - a[0]))); }
    return 1;
  }
  function drawPlot(id, view, state, now) {
    const hs = view.hotspots[id], p = PLOTS[id], row = ROW[p.row];
    const L = hs.level, st = hs.state;
    cur = { x: p.x, y: row.y, k: row.k };
    ctx.save(); ctx.translate(p.x, row.y); ctx.scale(row.k, row.k);
    const sp = springScale(id, now); if (sp !== 1) ctx.scale(sp, sp);
    const ex = artExtras(id, view, state);
    const prevMode = mode; mode = row.dark ? 1 : 0;
    if (st === 'locked') { mode = 2; ctx.globalAlpha = 0.7; ART[id](id === 'campfire' ? view.cl : 1, now, ex); ctx.globalAlpha = 1; }
    else if (st === 'available') { /* the dashed outline and "+" are drawn as badges */ }
    else {
      const job = st === 'constructing' ? hs.timer : null;
      const lvDraw = id === 'campfire' ? view.cl : Math.max(1, L);
      if (job && !L) {
        const prog = clamp(job.progress, 0, 1);
        ctx.save(); ctx.beginPath(); ctx.rect(-p.w, -p.h * prog - 2, p.w * 2, p.h * prog + 4); ctx.clip(); ART[id](1, now, ex); ctx.restore();
      } else ART[id](lvDraw, now, ex);
      if (job) scaffold(L, p.w * 0.95, p.h * (L ? 0.9 : Math.max(0.35, job.progress)), row.k);
      const fall = fx.fall[id];
      if (!job && fall && now - fall < 400) {
        const k = (now - fall) / 400; ctx.save(); ctx.globalAlpha = 1 - k;
        ctx.save(); ctx.translate(-p.w * 0.48, 0); ctx.rotate(-k * 0.9); seg(0, 0, 0, -p.h * 0.9, 'woodLight', 3); ctx.restore();
        ctx.save(); ctx.translate(p.w * 0.48, 0); ctx.rotate(k * 0.9); seg(0, 0, 0, -p.h * 0.9, 'woodLight', 3); ctx.restore();
        ctx.restore();
      }
      // rim light on the fire side
      if (id !== 'campfire' && mode !== 2) {
        const d = Math.abs(p.x - FIRE.x), R = light.r;
        if (d < R) {
          const a = 0.35 * (1 - d / R), side = p.x < FIRE.x ? 1 : -1;
          ctx.strokeStyle = 'rgba(255,198,107,' + a.toFixed(3) + ')'; ctx.lineWidth = 2 / (cam.s * row.k);
          ctx.beginPath(); ctx.moveTo(side * p.w * 0.46, -2); ctx.lineTo(side * p.w * 0.46, -p.h * (id === 'radio' ? 0.15 : 0.6)); ctx.stroke();
        }
      }
    }
    mode = prevMode;
    ctx.restore();
  }
  function artExtras(id, view, state) {
    if (id === 'bunkhouse') return { lit: (view.assign && view.assign.fire ? view.assign.fire.length : 0) + (view.people ? view.people.filter((p) => p.state === 'injured').length : 0) };
    if (id === 'infirmary') return { medkit: view.stock.medkit, pills: view.stock.pills };
    if (id === 'workbench') return { weapons: view.weapons, bomb: view.stock.bomb };
    if (id === 'garden') { const b = view.buffers.garden; return { fill: b && b.cap ? b.stored / b.cap : 0 }; }
    if (id === 'generator') return { charges: view.generator.charges, holds: view.generator.holds || 2 };
    if (id === 'radio') return { partyOut: view.partiesActive > 0 };
    if (id === 'campfire') return { lit: state.ftue.step > 0 || state.ftue.done };
    return {};
  }

  // ------------------------------------------------------------------ people
  const SEATS = [[-64, 504], [64, 504], [-90, 494], [90, 494], [-44, 516], [44, 516], [-112, 506], [112, 506], [-70, 524], [70, 524]];
  const WORK = { salvage: [[440, 500], [550, 500]], garden: [[730, 500], [850, 500]], infirmary: [[935, 400], [1066, 400]] };
  function person(x, y, col, pose, k, now, seed) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    if (pose === 'lie') { ell(0, -5, 15, 5, col); circ(-17, -7, 5, '#c9a27e'); box(-22, -12, 9, 3, '#ddd6c6'); ctx.restore(); return; }
    const bob = reduced ? 0 : Math.sin(now / 600 + seed) * 0.8;
    if (pose === 'sit') { ell(0, -2, 9, 4, '#2a2420'); rrect(ctx, -6, -22 + bob, 12, 18, 4); ctx.fillStyle = col; ctx.fill(); circ(0, -27 + bob, 5, '#c9a27e'); }
    else { box(-4, -12, 3, 12, '#2a2420'); box(1, -12, 3, 12, '#2a2420'); rrect(ctx, -6, -30 + bob, 12, 19, 4); ctx.fillStyle = col; ctx.fill(); circ(0, -35 + bob, 5, '#c9a27e'); }
    ctx.restore();
  }
  function drawPeople(view, now) {
    if (!view.people) return;
    const col = (name) => JACKETS[(DATA.ROSTER.indexOf(name) + 12) % JACKETS.length];
    const a = view.assign || {};
    (a.fire || []).slice(0, SEATS.length).forEach((n, i) => person(640 + SEATS[i][0], SEATS[i][1], col(n), 'sit', 1, now, i));
    for (const id of ['salvage', 'garden', 'infirmary']) (a[id] || []).forEach((n, i) => { const w = WORK[id][i]; if (w) person(w[0], w[1], col(n), 'stand', id === 'infirmary' ? 0.9 : 1, now, i + 3); });
    const inf = visible('infirmary', view.campRange) && view.hotspots.infirmary.level > 0;
    view.people.filter((p) => p.state === 'injured').slice(0, 2).forEach((p, i) => person((inf ? 940 : 392) - i * 34, 404, col(p.name), 'lie', 0.9, now, 0));
  }

  // ------------------------------------------------------------------ embers and light
  function stepEmbers(dt, now, view, lit) {
    const rate = (!lit ? 0.6 : reduced ? 2 : 6 * (1 + (view.cl - 1) * 0.08)) * (reduced ? 1 : particles);
    emberAcc += rate * dt / 1000;
    const R = Math.random;
    while (emberAcc >= 1) { emberAcc--; embers.push({ x: FIRE.x + (R() - 0.5) * 30, y: FIRE.y - 10, vx: (R() - 0.5) * 14, vy: -(28 + R() * 34), t: 0, life: 1.4 + R() * 1.2, r: 1 + R() * 1.4 }); }
    if (fx.flare && now - fx.flare < 50 && !fx.flared) { fx.flared = true; for (let i = 0, n = Math.round((reduced ? 12 : 60) * Math.max(reduced ? 1 : 0, particles)); i < n; i++) embers.push({ x: FIRE.x + (R() - 0.5) * 40, y: FIRE.y - 20, vx: (R() - 0.5) * 90, vy: -(50 + R() * 110), t: 0, life: 1 + R() * 1.4, r: 1.2 + R() * 1.8 }); }
    const s = dt / 1000;
    for (const e of embers) { e.t += s; e.x += (e.vx + Math.sin(e.t * 4 + e.r * 9) * 8) * s; e.y += e.vy * s; e.vy *= 0.995; }
    embers = embers.filter((e) => e.t < e.life);
  }
  function dawnAt(view, now) {
    if (dawnT.v == null || reduced) { dawnT.v = dawnT.to = dawnT.from = view.dawn; return view.dawn; }
    if (view.dawn !== dawnT.to) { dawnT.from = dawnT.v; dawnT.to = view.dawn; dawnT.t0 = now; }
    dawnT.v = lerp(dawnT.from, dawnT.to, ease(clamp((now - dawnT.t0) / 1200, 0, 1)));
    return dawnT.v;
  }
  function updateLight(view, state, now) {
    const lit = state.ftue.step > 0 || state.ftue.done;
    const target = lit ? view.lightRadius : 70;
    if (target !== light.to) { light.from = light.r; light.to = target; light.t0 = now; light.dur = reduced ? 1 : 1200; }
    const k = clamp((now - light.t0) / light.dur, 0, 1); light.r = lerp(light.from, light.to, ease(k));
    if (now - flickT > 125) { flickT = now; flickTo = 1 + (Math.random() - 0.5) * 0.06; }
    flick += (flickTo - flick) * 0.12;
  }
  function lightPass(view, now) {
    const k = lc.width / W, dawn = curDawn;
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.fillStyle = 'rgba(4,6,10,' + (0.82 - 0.30 * dawn).toFixed(3) + ')'; lctx.fillRect(0, 0, lc.width, lc.height);
    lctx.setTransform(k * cam.s, 0, 0, k * cam.s, k * cam.ox, k * cam.oy);
    lctx.globalCompositeOperation = 'destination-out';
    const glow = (x, y, r, a) => { lctx.globalAlpha = clamp(a, 0, 1); lctx.drawImage(glowSpr, x - r, y - r, r * 2, r * 2); };
    // moonlight over the camp so the edges still read; the fire does the real work
    const r = view.campRange; lctx.globalAlpha = 0.28; lctx.fillStyle = '#000';
    lctx.beginPath(); lctx.ellipse((r[0] + r[1]) / 2, 420, (r[1] - r[0]) / 2 + 30, 190, 0, 0, TAU); lctx.fill();
    const R = light.r * flick;
    glow(FIRE.x, FIRE.y - 10, R * 1.35, 1);
    for (const l of lamps) glow(l.x, l.y, l.r, l.a);
    for (const g of [[640, 300, 220, 0.12]]) glow(g[0], g[1], g[2], g[3]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lc, 0, 0, cv.width, cv.height);
    // warm glow
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const c = toScreen(FIRE.x, FIRE.y - 10), gr = R * 0.6 * cam.s;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(1, gr));
    g.addColorStop(0, 'rgba(255,140,60,.12)'); g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g; ctx.fillRect(c.x - gr, c.y - gr, gr * 2, gr * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ badges (screen space, after the light pass)
  function pill(x, y, text, bg, fg, font, padX, h) {
    ctx.font = font; const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
    rrect(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 0.5);
    return w;
  }
  const RES_COL = { scrap: '#c9cdd2', food: '#a6d86e', meds: '#ff7b7b', bat: '#ffd84a' };
  function drawBadges(view, state, now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const range = view.campRange, s = cam.s, bob = (ph) => (reduced ? 0 : Math.sin(now / 420 + ph) * 2);
    const fsz = Math.round(clamp(11 + s * 4, 11, 15));
    for (const id of Object.keys(PLOTS)) {
      if (!visible(id, range)) continue;
      const hs = view.hotspots[id], r = plotRect(id), base = toScreen(r.cx, r.base), top = toScreen(r.cx, r.y);
      const mid = toScreen(r.cx, r.y + r.h / 2);
      if (hs.state === 'locked') {
        icon('lock', mid.x, mid.y - 8, 18, 'rgba(236,232,223,.75)');
        pill(mid.x, mid.y + 12, hs.lockLabel, 'rgba(8,10,14,.82)', '#a7a9a6', '700 ' + fsz + 'px "Barlow Condensed", sans-serif', 6, fsz + 6);
        continue;
      }
      if (hs.state === 'available') {
        const ap = fx.appear[id];
        if (ap) { if (now < ap) continue; if (now - ap > 150) delete fx.appear[id]; else ctx.globalAlpha = (now - ap) / 150; }
        const ok = view.affordable[id];
        const tl = toScreen(r.x, r.y), br = toScreen(r.x + r.w, r.base);
        ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeStyle = ok ? 'rgba(255,198,107,.85)' : 'rgba(167,169,166,.5)';
        rrect(ctx, tl.x, tl.y, br.x - tl.x, br.y - tl.y, 6); ctx.stroke(); ctx.setLineDash([]);
        const pul = ok && !reduced ? 1 + 0.08 * Math.sin(now / 260) : 1, rad = 18 * pul;
        ctx.beginPath(); ctx.arc(mid.x, mid.y, rad, 0, TAU); ctx.fillStyle = ok ? 'rgba(255,198,107,.92)' : 'rgba(30,34,40,.85)'; ctx.fill();
        if (!ok) { ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(167,169,166,.7)'; ctx.stroke(); }
        icon('plus', mid.x, mid.y, 20, ok ? '#1b1203' : '#a7a9a6');
        if (reduced && ok) { ctx.fillStyle = '#ff7a2f'; ctx.beginPath(); ctx.arc(mid.x + 14, mid.y - 14, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a0b03'; ctx.font = '800 11px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', mid.x + 14, mid.y - 13.5); }
        ctx.globalAlpha = 1;
        continue;
      }
      // level plate
      if (id !== 'campfire' && hs.level > 0) {
        const pf = fx.plate[id], fk = pf && !reduced ? (now - pf) / 320 : 1;       // the level plate flips after a build
        if (fk < 1) { ctx.save(); ctx.translate(base.x, base.y + 1); ctx.scale(1, Math.max(0.05, Math.abs(Math.cos(fk * Math.PI)))); pill(0, 0, String(fk < 0.5 ? Math.max(1, hs.level - 1) : hs.level), 'rgba(8,10,14,.85)', '#ffc66b', '800 ' + fsz + 'px "Barlow Condensed", sans-serif', 5, fsz + 4); ctx.restore(); }
        else { if (pf) delete fx.plate[id]; pill(base.x, base.y + 1, String(hs.level), 'rgba(8,10,14,.85)', '#ffc66b', '800 ' + fsz + 'px "Barlow Condensed", sans-serif', 5, fsz + 4); }
        if (hs.doneAway) { ctx.beginPath(); ctx.arc(base.x + fsz, base.y - 2, 8, 0, TAU); ctx.fillStyle = '#3bd16f'; ctx.fill(); icon('check', base.x + fsz, base.y - 2, 12, '#06180c'); }
      }
      if (hs.timer) {
        const t = hs.timer, ty = clamp(id === 'radio' ? base.y - 30 * s : (top.y + base.y) / 2, LAY.top + 14, H - 14);
        const fnt = '800 ' + (fsz + 1) + 'px "Barlow Condensed", sans-serif';
        ctx.font = fnt; const tw = ctx.measureText(t.clock).width + 34;
        rrect(ctx, top.x - tw / 2, ty - 11, tw, 22, 11); ctx.fillStyle = t.free ? 'rgba(59,209,111,.95)' : 'rgba(8,10,14,.88)'; ctx.fill();
        const rx = top.x - tw / 2 + 12;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(rx, ty, 6, 0, TAU); ctx.stroke();
        ctx.strokeStyle = t.free ? '#06180c' : '#ffc66b'; ctx.beginPath(); ctx.arc(rx, ty, 6, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(t.progress, 0, 1)); ctx.stroke();
        ctx.fillStyle = t.free ? '#06180c' : '#ece8df'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t.free ? 'FREE' : t.clock, rx + 10, ty + 0.5);
      }
      // the skip beat: the timer ring spins to zero (400 ms) while a green electric arc runs round the building (300 ms)
      const sp = fx.spin[id];
      if (sp && !hs.timer && now - sp.t0 < 400) {
        const k = (now - sp.t0) / 400, ty = clamp(id === 'radio' ? base.y - 30 * s : (top.y + base.y) / 2, LAY.top + 14, H - 14);
        const fnt = '800 ' + (fsz + 1) + 'px "Barlow Condensed", sans-serif'; ctx.font = fnt;
        const label = k > 0.7 ? '0:00' : sp.clock || '0:00', tw = ctx.measureText(label).width + 34;
        rrect(ctx, top.x - tw / 2, ty - 11, tw, 22, 11); ctx.fillStyle = 'rgba(8,10,14,.88)'; ctx.fill();
        const rx = top.x - tw / 2 + 12, pr = reduced ? 1 : lerp(sp.progress, 1, ease(k));
        ctx.lineWidth = 3; ctx.strokeStyle = '#3bd16f'; ctx.beginPath(); ctx.arc(rx, ty, 6, -Math.PI / 2, -Math.PI / 2 + TAU * pr); ctx.stroke();
        ctx.fillStyle = '#ece8df'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, rx + 10, ty + 0.5);
      } else if (sp && now - sp.t0 >= 400) delete fx.spin[id];
      const a = fx.arc[id];
      if (a && now - a < 300 && !reduced) {
        ctx.strokeStyle = 'rgba(120,255,160,' + (1 - (now - a) / 300).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.beginPath();
        const tl = toScreen(r.x, r.y), br = toScreen(r.x + r.w, r.base);
        for (let i = 0; i <= 24; i++) { const u = i / 24, ang = u * TAU, x = (tl.x + br.x) / 2 + Math.cos(ang) * (br.x - tl.x) * 0.6 + (Math.random() - 0.5) * 6, y = (tl.y + br.y) / 2 + Math.sin(ang) * (br.y - tl.y) * 0.6 + (Math.random() - 0.5) * 6; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.stroke();
      } else if (a && now - a >= 300) delete fx.arc[id];
    }
    // bubbles
    for (const id of Object.keys(bubblePos)) {
      const hs = view.hotspots[id], b = hs.bubble, p = bubblePos[id], y = p.y + bob(p.x / 50);
      let ic = 'scrap', col = RES_COL.scrap, txt = String(b.stored || '');
      if (id === 'garden') { ic = 'food'; col = RES_COL.food; } else if (id === 'infirmary') { ic = 'meds'; col = RES_COL.meds; }
      else if (id === 'generator') { ic = 'bat'; col = RES_COL.bat; } else if (id === 'radio') { ic = 'crate'; col = '#ffc66b'; txt = ''; }
      drawBubble(p.x, y, ic, col, b.full ? 'FULL' : txt, b.full);
    }
    // crate, truck and pile
    if (view.crate && anchors.crate) { const a = anchors.crate; drawBubble(a.x, a.y - 30 + bob(1), 'crate', '#ffc66b', 'TAP', false); }
    const tr = view.truck; if (tr && tr.scrap + tr.food + tr.meds > 0 && anchors.truck) { const a = anchors.truck; drawBubble(a.x, a.y - 28 + bob(2), 'crate', '#ff7a2f', 'TRUCK', false); }
    if (state.pile > 0 && anchors.pile) {
      const a = anchors.pile, t = (now / 900) % 1, sz = 5 + 4 * Math.sin(t * Math.PI);
      ctx.strokeStyle = 'rgba(255,241,196,' + (0.9 * Math.sin(t * Math.PI)).toFixed(2) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a.x + 6 - sz, a.y - 6); ctx.lineTo(a.x + 6 + sz, a.y - 6); ctx.moveTo(a.x + 6, a.y - 6 - sz); ctx.lineTo(a.x + 6, a.y - 6 + sz); ctx.stroke();
    }
    // squash ghosts of collected bubbles
    fx.ghosts = fx.ghosts.filter((g) => now - g.t0 < 180);
    for (const g of fx.ghosts) {
      const k = (now - g.t0) / 180, sc = k < 0.3 ? lerp(1, 0.8, k / 0.3) : k < 0.6 ? lerp(0.8, 1.15, (k - 0.3) / 0.3) : lerp(1.15, 0, (k - 0.6) / 0.4);
      ctx.save(); ctx.translate(g.x, g.y); ctx.scale(sc, sc); drawBubble(0, 0, g.ic, g.col, '', false); ctx.restore();
    }
  }
  function drawBubble(x, y, ic, col, txt, full) {
    const r = 17;
    ctx.font = '800 14px "Barlow Condensed", sans-serif';
    const tw = txt ? Math.ceil(ctx.measureText(txt).width) + 6 : 0, w = 2 * r + tw;
    ctx.beginPath(); ctx.moveTo(x - 5, y + r - 2); ctx.lineTo(x, y + r + 6); ctx.lineTo(x + 5, y + r - 2); ctx.fillStyle = full ? '#ff7a2f' : 'rgba(236,232,223,.96)'; ctx.fill();
    rrect(ctx, x - w / 2, y - r, w, 2 * r, r); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
    const ix = x - w / 2 + r;
    ctx.beginPath(); ctx.arc(ix, y, r - 4, 0, TAU); ctx.fillStyle = '#15120d'; ctx.fill();
    icon(ic, ix, y, 18, col);
    if (txt) { ctx.fillStyle = full ? '#1a0b03' : '#15120d'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, ix + r - 1, y + 0.5); }
  }

  // ------------------------------------------------------------------ frame
  function draw(state, view, now, opts) {
    if (!ctx) return;
    opts = opts || {};
    const dt = lastNow ? Math.min(100, now - lastNow) : 16; lastNow = now;
    if (appearCL && view.cl > appearCL && !reduced) {
      let i = 0; for (const id of Object.keys(PLOTS)) if (DATA.BUILDINGS[id] && DATA.BUILDINGS[id].unlockCL === view.cl) fx.appear[id] = now + 500 + 150 * i++;
    }
    appearCL = view.cl;
    curDawn = dawnAt(view, now);
    updateCamera(view, now); updateLight(view, state, now);
    const lit = state.ftue.step > 0 || state.ftue.done;
    stepEmbers(dt, now, view, lit);
    computeHot(view, state);
    if (opts.doneAway) for (const id of opts.doneAway) if (view.hotspots[id]) view.hotspots[id].doneAway = true;
    lamps = [];
    ensureCaches(view, now);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bgCv, 0, 0);
    ctx.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * cam.ox, DPR * cam.oy);
    mode = 1; drawWalls(view, now); mode = 0;
    for (const id of BACK_ORDER) if (visible(id, view.campRange)) drawPlot(id, view, state, now);
    drawTruck(view, now);
    drawPlot('campfire', view, state, now);
    for (const id of FRONT_ORDER) if (visible(id, view.campRange)) drawPlot(id, view, state, now);
    drawPeople(view, now);
    if (state.pile > 0) drawPile(now);
    if (view.crate) drawCrate(view, now);
    drawForeground(view);
    lightPass(view, now);
    // after the light: stars, far lights, embers
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(afCv, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); drawFarFire(now);
    ctx.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * cam.ox, DPR * cam.oy);
    for (const e of embers) { const a = 1 - e.t / e.life; ctx.fillStyle = 'rgba(255,' + Math.round(150 + 60 * a) + ',80,' + a.toFixed(2) + ')'; ctx.fillRect(e.x - e.r / 2, e.y - e.r / 2, e.r, e.r); }
    const fl = reduced ? 250 : 80;                    // the white flash; under reduced motion a 250 ms brightness flash replaces the spring
    for (const id of Object.keys(fx.spring)) {
      const t0 = fx.spring[id]; if (!t0 || now - t0 > fl || !PLOTS[id]) continue;
      const r = plotRect(id); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,' + ((reduced ? 0.35 : 0.5) * (1 - (now - t0) / fl)).toFixed(2) + ')';
      ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalCompositeOperation = 'source-over';
    }
    drawBadges(view, state, now);
    if (cutCv && now - cutAt < 200) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1 - (now - cutAt) / 200; ctx.drawImage(cutCv, 0, 0); ctx.globalAlpha = 1; }
  }

  return {
    PLOTS, init, setLayout, setReduced, setParticles, draw, focus, toScreen, anchor,
    hotspots: () => hot,
    camera: () => ({ s: cam.s, ox: cam.ox, oy: cam.oy, tweening: !!tween }),
    lightRadius: () => light.r,
    dawn: () => curDawn,
    fx: {
      spring(id) { const n = typeof performance !== 'undefined' ? performance.now() : 0; fx.spring[id] = n; fx.fall[id] = n; fx.plate[id] = n + 120; },
      spin(id, snap) { fx.spin[id] = { t0: typeof performance !== 'undefined' ? performance.now() : 0, progress: snap ? snap.progress || 0 : 0, clock: snap ? snap.clock || '' : '' }; },
      arc(id) { fx.arc[id] = typeof performance !== 'undefined' ? performance.now() : 0; },
      flare() { fx.flare = typeof performance !== 'undefined' ? performance.now() : 0; fx.flared = false; },
      ghost(key) {
        const id = key.replace('bubble:', ''), p = bubblePos[id] || anchors[key]; if (!p) return;
        const ic = { garden: 'food', infirmary: 'meds', generator: 'bat', radio: 'crate', crate: 'crate', truck: 'crate' }[id] || 'scrap';
        fx.ghosts.push({ x: p.x, y: p.y, ic, col: RES_COL[{ food: 'food', meds: 'meds', bat: 'bat' }[ic]] || '#ffc66b', t0: typeof performance !== 'undefined' ? performance.now() : 0 });
      },
    },
  };
});
