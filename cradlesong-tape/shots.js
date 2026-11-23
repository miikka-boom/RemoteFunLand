// Cradlesong: Tape 3. The shots. CSHOTS.frame(t) draws the tape at time t into a 2D canvas, in the
// greys of an infrared night-vision camcorder (post.js turns them green and plays them back like
// tape), with the camera's burned-in overlay and the whispers' captions, and returns the playback
// settings for that frame.
(function () {
  'use strict';
  const L = window.CSLIB, S = window.SCORE, TAU = L.TAU;
  const { clamp, lerp, smooth, ease, hash } = L;

  let cv, g, W = 2, H = 2, A = null;
  let reduced = false;
  const SH = S.shots;

  // ------------------------------------------------------------------ assets
  function makeAssets() {
    const a = {};
    const wf = L.noiseField(256, 4, 21, 2);
    a.wood = (() => {
      const c = L.canvas(256, 256), x = c.getContext('2d'), im = x.createImageData(256, 256);
      for (let y = 0; y < 256; y++) for (let i = 0; i < 256; i++) {
        const v = wf[y * 256 + i];
        const gr = 0.5 + 0.5 * Math.sin((y * 0.11 + v * 9 + Math.sin(i * 0.02) * 0.6) * 3.2);
        const k = (0.55 + 0.45 * gr) * 190;
        const o = (y * 256 + i) * 4;
        im.data[o] = im.data[o + 1] = im.data[o + 2] = k; im.data[o + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      return c;
    })();
    const gf = L.noiseField(256, 6, 33, 8, 0.6);
    a.grass = L.fieldCanvas(gf, 256, [0, 0, 0], (v) => 0.15 + 0.6 * (1 - v));
    a.trees = [L.treeSprite(4), L.treeSprite(9), L.treeSprite(15)];
    a.treeLine = (() => {
      const c = L.canvas(1024, 160), x = c.getContext('2d'), r = L.rng(77);
      x.fillStyle = '#000';
      x.beginPath(); x.moveTo(0, 160);
      for (let i = 0; i <= 1024; i += 4) x.lineTo(i, 110 - 30 * L.wob(i / 60, 2) - 18 * L.wob(i / 13, 5));
      x.lineTo(1024, 160); x.fill();
      for (let k = 0; k < 12; k++) { const tx = r() * 1024, s = 0.25 + r() * 0.2; x.drawImage(a.trees[k % 3], tx - 180 * s, 160 - 480 * s - 20, 360 * s, 480 * s); }
      return c;
    })();
    return a;
  }

  // ------------------------------------------------------------------ camera helpers
  const portrait = () => H > W * 1.05;
  const reset = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };
  const fill = (c) => { reset(); g.fillStyle = c; g.fillRect(0, 0, W, H); };
  const grey = (v) => { const k = clamp(Math.round(v * 255), 0, 255); return `rgb(${k},${k},${k})`; };
  // a hand holding the camera: slow wander, quicker tremble; amt ~1 is a steady hand
  function hand(t, amt, seed = 0) {
    const k = reduced ? amt * 0.3 : amt;
    const m = Math.min(W, H);
    return {
      x: (L.wob(t * 0.8, seed) * 0.6 + L.wob(t * 2.9, seed + 4) * 0.3 + L.wob(t * 9.0, seed + 7) * 0.12) * k * m * 0.018,
      y: (L.wob(t * 0.7, seed + 2) * 0.6 + L.wob(t * 3.3, seed + 5) * 0.3 + L.wob(t * 8.0, seed + 8) * 0.12) * k * m * 0.018,
      r: (L.wob(t * 0.6, seed + 9) * 0.7 + L.wob(t * 4.0, seed + 11) * 0.3) * k * 0.012,
    };
  }
  // put the camera's shake and digital zoom on the frame; then draw in screen pixels
  function shoot(h, zoom = 1, ox = 0, oy = 0) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(W / 2 + h.x, H / 2 + h.y);
    g.rotate(h.r);
    g.scale(zoom, zoom);
    g.translate(-W / 2 - ox, -H / 2 - oy);
  }
  // inside a shot drawn in design units: fit a box, through the camera
  function fitIn(h, zoom, fx, fy, fw, fh) {
    const s = Math.min(W / fw, H / fh);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(W / 2 + h.x, H / 2 + h.y);
    g.rotate(h.r);
    g.scale(s * zoom, s * zoom);
    g.translate(-fx, -fy);
    return s * zoom;
  }
  // infrared falloff: the camera's lamp lights what's near
  const irK = (d, near = 5) => clamp(Math.pow(near / Math.max(d, 0.5), 1.35), 0, 1);
  function lamp(x, y, r, inner = 1, outer = 0.05) {
    const keep = g.getTransform();
    reset();
    g.globalCompositeOperation = 'multiply';
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, grey(inner)); gr.addColorStop(0.55, grey(lerp(inner, outer, 0.55))); gr.addColorStop(1, grey(outer));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.setTransform(keep);
  }

  // ------------------------------------------------------------------ the field in infrared
  const VARIANTS = 64, VARIANT0 = 9100;
  const vP = new Map();
  const variantP = (seed) => { const v = VARIANT0 + (seed % VARIANTS); if (!vP.has(v)) vP.set(v, L.deadParams(v)); return vP.get(v); };
  function irFigure(cam, f, o) {
    const p = L.projP(cam, f.x, 0, f.z);
    if (!p) return;
    const hpx = p.k * 1.75;
    if (hpx < 1.5 || p.x < -hpx || p.x > W + hpx || p.y < -2 * hpx || p.y > H + 3 * hpx) return;
    const k = (irK(p.d, 6.5) * 0.95 + 0.03) * (o.dim || 1);
    const rot = o.rot || 0, flip = (f.seed >> 6) & 1 ? -1 : 1;
    const sp = L.deadSprite(VARIANT0 + (f.seed % VARIANTS), hpx < 70 ? 96 : hpx < 140 ? 160 : 300, '#bdbdbd');
    const sc = hpx / sp.px;
    g.save();
    g.translate(p.x, p.y);
    if (rot) g.rotate(rot);
    g.scale(flip, 1);
    g.globalAlpha = clamp(k, 0, 1);
    g.drawImage(sp.body, -sp.w / 2 * sc, -sp.footY * sc, sp.w * sc, sp.h * sc);
    g.restore();
    const eyes = o.eyes === undefined ? 1 : o.eyes;
    if (eyes > 0.01 && (f.eyeAt === undefined || o.t >= f.eyeAt)) {
      const P = variantP(f.seed);
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const r = Math.max(1.0, hpx * 0.0095) * (reduced ? 1 : 1);
      const a = eyes * clamp(0.55 + 0.45 * irK(p.d, 14), 0, 1) * (f.blink && Math.sin(o.t * 1.7 + f.seed) > 0.97 ? 0 : 1);
      for (const [ex, ey] of L.eyesOf(P)) {
        const sx = p.x + (flip * ex * cs - ey * sn) * hpx, sy = p.y + (flip * ex * sn + ey * cs) * hpx;
        g.fillStyle = `rgba(255,255,255,${a})`;
        g.beginPath(); g.arc(sx, sy, r, 0, TAU); g.fill();
        L.glow(g, sx, sy, r * 5, [255, 255, 255], 0.35 * a);
      }
    }
  }
  function irGround(cam, t, bright = 0.6) {
    // the sky barely there, a tree line against it, then the field lit by the lamp, falling off
    g.fillStyle = grey(0.035);
    g.fillRect(-W, -H, 3 * W, 3 * H);
    const far = L.projP(cam, cam.x, 0, cam.z + 200);
    const horizonY = far ? far.y : -H;
    if (far) {
      const th = Math.max(4, 26 * far.k);
      g.save(); g.globalAlpha = 0.9;
      L.tile(g, A.treeLine, -W, horizonY - th, 3 * W, th, -cam.x * far.k, 0, th * 6.4 / 1024, th / 160);
      g.restore();
    }
    let prev = null;
    for (let dz = 200; dz > 0.25; dz *= 0.93) {
      const z = cam.z + dz;
      const p = L.projP(cam, cam.x, 0, z);
      if (!p) break;
      const y = p.y;
      if (prev !== null && y > prev) {
        g.fillStyle = grey(0.03 + bright * irK(p.d, 5.5));
        g.fillRect(-W, prev - 0.5, 3 * W, y - prev + 1);
      }
      prev = y;
      if (y > 2 * H) break;
    }
    if (prev !== null && prev < 2 * H) { g.fillStyle = grey(0.03 + bright); g.fillRect(-W, prev, 3 * W, 2 * H - prev); }
    g.save();
    g.globalAlpha = 0.5;
    g.globalCompositeOperation = 'multiply';
    L.tile(g, A.grass, -W, Math.max(-H, horizonY), 3 * W, 3 * H, -cam.x * 30, 0, Math.max(W, H) / 256 * 0.5);
    g.restore();
  }
  function crowd(n, seed, zr, spread, base) {
    const r = L.rng(seed), o = [];
    for (let i = 0; i < n; i++) {
      const z = zr[0] + (zr[1] - zr[0]) * Math.pow(r(), 1.2);
      o.push({ x: (r() * 2 - 1) * (spread[0] + z * spread[1]), z, seed: base + i, blink: r() < 0.3, eyeAt: undefined, ph: r() * 6 });
    }
    return o.sort((a, b) => b.z - a.z);
  }

  // ------------------------------------------------------------------ the camcorder's overlay
  function clockText(sec) {
    sec = Math.floor(sec);
    let h = Math.floor(sec / 3600) % 24;
    const m = Math.floor(sec / 60) % 60, s = sec % 60;
    const ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ap}`;
  }
  function counterText(sec) {
    sec = Math.floor(sec);
    return `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }
  function osdText(text, x, y, align, size) {
    g.font = `${size}px ${L.FONT_CRT}`;
    g.textAlign = align;
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillText(text, x + size * 0.08, y + size * 0.08);
    g.fillStyle = 'rgba(245,245,245,0.95)';
    g.fillText(text, x, y);
  }
  function osd(t, sh, o = {}) {
    reset();
    const lt = t - sh.t0;
    const size = Math.max(13, Math.min(H * 0.062, W * 0.058));
    const mx = Math.max(size * 0.9, W * 0.055), my = Math.max(size * 1.4, H * 0.08);
    if (Math.floor(t * 1.25) % 2 === 0 || reduced) {
      g.fillStyle = 'rgba(255,60,50,0.95)';
      g.beginPath(); g.arc(mx + size * 0.28, my - size * 0.3, size * 0.25, 0, TAU); g.fill();
    }
    osdText('REC', mx + size * 0.7, my, 'left', size);
    osdText('NIGHT', mx, my + size * 1.05, 'left', size * 0.8);
    osdText('SP  ' + counterText(sh.counter + lt), W - mx, my, 'right', size);
    osdText(S.date, W - mx, H - my - size * 1.05, 'right', size);
    osdText(clockText(sh.clock + lt), W - mx, H - my, 'right', size);
    if (o.zoom > 1.05) {
      const zx = mx, zy = H - my;
      osdText('D.ZOOM', zx, zy - size * 1.05, 'left', size * 0.8);
      const bw = size * 4.2, k = clamp((o.zoom - 1) / 11, 0, 1);
      g.strokeStyle = 'rgba(245,245,245,0.9)'; g.lineWidth = Math.max(1, size * 0.08);
      g.strokeRect(zx, zy - size * 0.55, bw, size * 0.5);
      g.fillStyle = 'rgba(245,245,245,0.9)';
      g.fillRect(zx, zy - size * 0.55, bw * (0.3 + 0.7 * k), size * 0.5);
      osdText('W', zx - size * 0.6, zy, 'left', size * 0.7);
      osdText('T', zx + bw + size * 0.2, zy, 'left', size * 0.7);
    }
    if (o.battery && Math.floor(t * 2) % 2 === 0) {
      const bx = W - mx - size * 1.6, by = my + size * 0.55;
      g.strokeStyle = 'rgba(245,245,245,0.95)'; g.lineWidth = Math.max(1, size * 0.08);
      g.strokeRect(bx, by, size * 1.4, size * 0.6);
      g.fillStyle = 'rgba(245,245,245,0.95)';
      g.fillRect(bx + size * 1.4, by + size * 0.18, size * 0.12, size * 0.24);
      g.fillRect(bx + size * 0.12, by + size * 0.12, size * 0.25, size * 0.36);
    }
  }

  // ------------------------------------------------------------------ shots
  const shots = {};
  const DEF = { mode: 1, grain: 0.11, blur: 0, pix: 1, track: 0.15, tear: 0, stat: 0, expo: 1, vig: 0.55, jit: 1.2, roll: 0, drop: 1, bloom: 0.9, osd: true };

  shots.card = (lt, dur) => {
    fill('#000');
    reset();
    // typed lines, wrapped to the frame, each fading in on its cue
    const maxW = W * 0.84;
    let fs = Math.max(15, Math.min(H * 0.045, W * 0.036));
    const font = (z) => `${z}px "Courier Prime", "Courier New", Courier, monospace`;
    const wrap = (text) => {
      const out = []; let cur = '';
      for (const w of text.split(' ')) { const tr = cur ? cur + ' ' + w : w; if (g.measureText(tr).width > maxW && cur) { out.push(cur); cur = w; } else cur = tr; }
      if (cur) out.push(cur);
      return out;
    };
    g.font = font(fs);
    let blocks = S.card.map((c) => ({ c, lines: wrap(c.text) }));
    const n = blocks.reduce((a, b) => a + b.lines.length, 0);
    const lh = fs * 1.75, gap = fs * 1.1;
    const total = n * lh + gap;
    let y = H / 2 - total / 2 + fs;
    const widest = Math.max(...blocks.flatMap((b) => b.lines.map((l) => g.measureText(l).width)));
    const x0 = (W - widest) / 2;
    g.textAlign = 'left';
    blocks.forEach((b, bi) => {
      const a = smooth(b.c.t, b.c.t + 0.5, lt) * (1 - smooth(dur - 0.7, dur - 0.15, lt));
      g.fillStyle = `rgba(225,222,214,${a})`;
      if (bi === 2) y += gap;
      for (const l of b.lines) { g.fillText(l, x0, y); y += lh; }
    });
    return { mode: 0, grain: 0.05, track: 0, jit: 0, drop: 0, vig: 0.4, osd: false };
  };

  shots.vcr = (lt, dur, sh) => {
    fill('rgb(22,40,196)');
    reset();
    const size = Math.max(16, Math.min(H * 0.075, W * 0.07));
    g.font = `${size}px ${L.FONT_CRT}`;
    g.textAlign = 'left';
    g.fillStyle = '#f2f2f2';
    const mx = Math.max(size, W * 0.07), my = Math.max(size * 1.6, H * 0.12);
    g.fillText(sh.label === 'STOP' ? 'STOP ■' : 'PLAY ▶', mx, my);
    g.textAlign = 'right';
    g.fillText('SP', W - mx, my);
    if (sh.label === 'STOP') { g.textAlign = 'left'; g.fillText('0:18:31', mx, my + size * 1.2); }
    const into = sh.label === 'PLAY' ? smooth(0.75, 1.4, lt) : 0;
    return { mode: 2, grain: 0.06 + 0.4 * into, track: 0.4 + 2 * into, tear: 0.6 * into, jit: 2 + 10 * into, roll: into * 0.3 * hash(Math.floor(lt * 20)), drop: 3, vig: 0.25, osd: false, bloom: 0.3 };
  };

  shots.glitch = (lt, dur) => {
    // the tape tears between takes: what's left of the last frame, rolling
    const u = lt / dur;
    const prev = SH[shotAt(Math.max(0, lastT - lt - 0.02))];
    void prev;
    fill(grey(0.12 + 0.2 * hash(Math.floor(lt * 30))));
    reset();
    for (let i = 0; i < 18; i++) {
      const y = hash(i * 3.3 + Math.floor(lt * 24)) * H, h = H * (0.01 + 0.06 * hash(i * 7.1));
      g.fillStyle = grey(0.1 + 0.8 * hash(i * 1.9 + Math.floor(lt * 30)));
      g.fillRect(0, y, W, h);
    }
    return { mode: 1, grain: 0.4, track: 3, tear: 1.5, jit: 30, roll: reduced ? 0 : u * 0.8, drop: 30, stat: 0.35, osd: false };
  };

  // ---------------------------------------------------------------- segment 1: the window
  const FIELD1 = crowd(150, 41, [7, 62], [3, 0.75], 1000);
  shots.window = (lt, dur, sh) => {
    const t = sh.t0 + lt;
    fill('#000');
    const approach = smooth(3.6, 7.6, lt);
    const pan = smooth(8.0, 12.0, lt);
    const tilt = smooth(12.0, 13.7, lt);
    const zoomD = lerp(1, 3.4, smooth(12.2, 14.2, lt));
    const jolt = t >= 22.8 ? Math.exp(-(t - 22.8) / 0.35) : 0;
    const h = hand(t, 1.1 + 2.5 * jolt + 0.6 * tilt, 3);
    if (jolt > 0 && !reduced) { h.x += Math.sin(t * 60) * jolt * W * 0.02; h.y += Math.cos(t * 47) * jolt * H * 0.03; }
    // the field beyond the boards
    const cam = { x: lerp(-5, 4.5, ease(pan)) * (1 - tilt) + 0.3 * tilt, y: -4.4, z: -0.6, pitch: lerp(0.3, 1.18, ease(tilt)), f: Math.min(W * 0.95, H * 1.25) * lerp(1, 1.15, approach), cx: W / 2, cy: H * 0.5 };
    const fp = L.projP(cam, 0.35, -1.62, 1.7);
    const aim = smooth(12.0, 13.4, lt);
    shoot(h, zoomD, fp ? (fp.x - W / 2) * aim : 0, fp ? (fp.y - H / 2) * aim : 0);
    irGround(cam, t, 0.5);
    for (const f of FIELD1) irFigure(cam, f, { t, eyes: 1, rot: 0.01 * Math.sin(t * 0.7 + f.ph) });
    // the one standing right under the window, face turned up to the lens
    if (tilt > 0.05) {
      const p = L.projP(cam, 0.35, -1.62, 1.7);
      if (p) {
        g.save();
        g.translate(p.x, p.y);
        const s = p.k * 0.42;
        g.scale(s, s);
        g.globalAlpha = clamp(tilt * 1.5, 0, 1);
        L.drawFaceUp(g, 7, 1, 0);
        g.restore();
        for (const sx of [-1, 1]) L.glow(g, p.x + sx * 0.165 * p.k * 0.42, p.y - 0.045 * p.k * 0.42, p.k * 0.045, [255, 255, 255], 0.9 * tilt);
      }
    }
    // the boards across the window, close to the lens; the camera pushes up to the gap between them
    const bz = lerp(1, portrait() ? 8.6 : 5.2, ease(approach));
    const s = Math.min(W / 1600, H / 1200);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(W / 2 + h.x, H / 2 + h.y);
    g.rotate(h.r);
    g.scale(s * bz * zoomD, s * bz * zoomD);
    g.translate(0, -270 * ease(approach));
    const boards = [[-1400, -230, -0.02], [-160, 200, 0.015], [340, 1400, -0.01]];
    for (const [y0, y1, a] of boards) {
      g.save(); g.rotate(a);
      g.beginPath(); g.rect(-1400, y0, 2800, y1 - y0); g.clip();
      L.tile(g, A.wood, -1400, y0, 2800, y1 - y0, 0, y0 * 0.3, 2.4, 1.1);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-1400, y0, 2800, y1 - y0);
      for (const nx of [-560, 540]) { for (const ny of [y0 + 40, y1 - 40]) { if (Math.abs(ny) > 1300) continue; g.fillStyle = grey(0.12); g.beginPath(); g.arc(nx, ny, 13, 0, TAU); g.fill(); g.fillStyle = grey(0.75); g.beginPath(); g.arc(nx - 3, ny - 3, 4, 0, TAU); g.fill(); } }
      g.restore();
    }
    // the lamp lights the boards hard and the field barely; the boards go soft as we get close
    reset();
    lamp(W / 2 + h.x, H / 2 + h.y, Math.hypot(W, H) * 0.6, 1, 0.25);
    osd(t, sh, { zoom: zoomD });
    const blur = Math.max(0, 2.2 - lt * 2.2) + 2.2 * Math.max(0, Math.sin(Math.PI * smooth(3.8, 6.2, lt))) + (t > 21.8 && t < 22.8 ? 2.6 * smooth(21.8, 22.2, t) : 0);
    return { blur: reduced ? blur * 0.5 : blur, pix: zoomD > 1.6 ? 1 + (zoomD - 1.6) * 1.2 : 1, track: 0.15 + (t > 25.5 ? 2 : 0), tear: t > 25.7 ? (t - 25.7) * 2 : 0 };
  };

  // ---------------------------------------------------------------- segment 2: Wren at her window
  const GAP_EYES = (() => { const r = L.rng(12), o = []; for (let i = 0; i < 11; i++) o.push({ gap: i % 3, x: -0.75 + r() * 1.5, at: 30.3 + i * 0.75 + r() * 0.4, s: 0.6 + r() * 0.5 }); return o; })();
  function room1pt(near, far, b) {
    // a room in one-point perspective: near is the frame's box, far the back wall; b brightness near/far
    const q = (pts, v) => { g.fillStyle = grey(v); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); };
    const [nx0, ny0, nx1, ny1] = near, [fx0, fy0, fx1, fy1] = far;
    q([[nx0, ny0], [fx0, fy0], [fx0, fy1], [nx0, ny1]], b[0] * 0.8);
    q([[nx1, ny0], [fx1, fy0], [fx1, fy1], [nx1, ny1]], b[0] * 0.75);
    q([[nx0, ny0], [nx1, ny0], [fx1, fy0], [fx0, fy0]], b[0] * 0.45);
    q([[nx0, ny1], [nx1, ny1], [fx1, fy1], [fx0, fy1]], b[0] * 0.9);
    q([[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]], b[1]);
  }
  shots.wren = (lt, dur, sh) => {
    const t = sh.t0 + lt;
    fill('#000');
    const creep = ease(clamp(lt / dur, 0, 1));
    const h = hand(t, 0.9, 17);
    fitIn(h, lerp(1.35, 1.75, creep), 40, -40, 1600, 1200);
    // the room from the doorway
    const far = [-430, -370, 430, 330];
    room1pt([-2400, -1900, 2400, 1700], far, [0.55, 0.2]);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 10;
    for (let x = -400; x <= 400; x += 55) { g.beginPath(); g.moveTo(x, -370); g.lineTo(x, 330); g.stroke(); }
    g.fillStyle = grey(0.12); g.fillRect(-430, 300, 860, 30);
    g.fillStyle = grey(0.3);                                    // a drawing pinned up beside the window
    g.save(); g.translate(330, -150); g.rotate(0.06); g.fillRect(-45, -35, 90, 70); g.restore();
    // the bed along the left wall
    g.fillStyle = grey(0.62);
    g.beginPath(); g.moveTo(-2400, 520); g.lineTo(-430, 170); g.lineTo(-250, 175); g.lineTo(-1100, 900); g.closePath(); g.fill();
    g.fillStyle = grey(0.4);
    g.beginPath(); g.moveTo(-2400, 900); g.lineTo(-1100, 900); g.lineTo(-250, 175); g.lineTo(-250, 260); g.lineTo(-1000, 1300); g.lineTo(-2400, 1300); g.closePath(); g.fill();
    g.strokeStyle = grey(0.35); g.lineWidth = 6;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-2100 + i * 260, 640 - i * 30); g.quadraticCurveTo(-1500 + i * 200, 520 + hash(i) * 120, -800 + i * 90, 380 - i * 15); g.stroke(); }
    g.fillStyle = grey(0.7);
    g.beginPath(); g.ellipse(-395, 205, 70, 30, -0.3, 0, TAU); g.fill();
    // the window on the back wall, boarded; the dark between the boards
    const wx0 = -150, wx1 = 230, wy0 = -250, wy1 = 110;
    g.fillStyle = grey(0.02);
    g.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    const gaps = [[wy0 + 70, wy0 + 92], [wy0 + 178, wy0 + 198], [wy0 + 282, wy0 + 300]];
    // eyes out there in the gaps, more of them as the dead hum with her; gone when she stops
    for (const e of GAP_EYES) {
      if (t < e.at || t >= 39.6) continue;
      const [gy0, gy1] = gaps[e.gap];
      const cx = lerp(wx0 + 20, wx1 - 20, (e.x + 1) / 2), cy = (gy0 + gy1) / 2;
      for (const sx of [-1, 1]) { g.fillStyle = 'rgba(255,255,255,0.97)'; g.beginPath(); g.arc(cx + sx * 9 * e.s, cy, 4.2 * e.s, 0, TAU); g.fill(); }
    }
    g.fillStyle = grey(0.24);
    let prevY = wy0;
    for (const [gy0, gy1] of gaps) { g.fillRect(wx0 - 30, prevY, wx1 - wx0 + 60, gy0 - prevY); prevY = gy1; }
    g.fillRect(wx0 - 30, prevY, wx1 - wx0 + 60, wy1 - prevY);
    g.strokeStyle = grey(0.3); g.lineWidth = 12; g.strokeRect(wx0 - 8, wy0 - 8, wx1 - wx0 + 16, wy1 - wy0 + 16);
    // Wren, at the window, her back to us
    const turn = smooth(40.2, 41.8, t) * 0.85;
    g.save();
    g.translate(40, 318);
    g.scale(300, 300);
    L.drawGirlBack(g, turn, smooth(41.0, 41.3, t));
    g.restore();
    // a near door frame at the left edge, bright and soft
    g.fillStyle = grey(0.85);
    g.fillRect(-2400, -1900, 1650 - 2400 + 1500, 3600);
    g.fillStyle = grey(0.65);
    g.fillRect(-900 + 0, -1900, 60, 3600);
    reset();
    lamp(W / 2 + h.x, H / 2 + h.y, Math.hypot(W, H) * 0.75, 1, 0.3);
    osd(t, sh);
    return { blur: t > 41.7 ? 1.2 : 0, track: 0.15 + (t > 41.6 ? 1.5 : 0), tear: t > 41.75 ? 1 : 0 };
  };

  // ---------------------------------------------------------------- the fragments
  shots.frag1 = (lt, dur, sh) => {
    const t = sh.t0 + lt;
    fill('#000');
    const h = hand(t, 5, 21);
    if (!reduced) { h.y += Math.sin(lt * 22) * H * 0.02; }
    fitIn(h, lerp(1.0, 1.45, lt / dur), 0, 0, 1600, 1200);
    room1pt([-2200, -1800, 2200, 1700], [-260, -330, 260, 330], [0.6, 0.18]);
    g.fillStyle = grey(0.24); g.fillRect(-210, -300, 420, 630);
    g.fillStyle = grey(0.03); g.fillRect(120, -300, 90, 630);
    g.save(); g.translate(-60, -150); g.fillStyle = grey(0.7); g.fillRect(-55, -42, 110, 84); g.fillStyle = grey(0.25); g.font = `600 26px ${L.FONT_HAND}`; g.textAlign = 'center'; g.fillText('WREN', 0, -12); g.restore();
    reset();
    lamp(W / 2 + h.x, H / 2 + h.y, Math.hypot(W, H) * 0.6, 1, 0.2);
    osd(t, sh);
    return { blur: 1.4, track: 1.2, jit: 6, drop: 8 };
  };
  shots.frag2 = (lt, dur, sh) => {
    const t = sh.t0 + lt;
    fill('#000');
    const h = hand(t, 3.5, 23);
    fitIn(h, lerp(1.0, 1.15, lt / dur), 0, 0, 1600, 1200);
    g.fillStyle = grey(0.5); g.fillRect(-2000, -1500, 4000, 3000);
    // sheets thrown back, the dent in the pillow, the tape deck lying where she was
    g.fillStyle = grey(0.82);
    g.beginPath(); g.moveTo(-900, -600); g.quadraticCurveTo(-200, -720, 700, -560); g.lineTo(820, 700); g.quadraticCurveTo(0, 820, -880, 660); g.closePath(); g.fill();
    g.strokeStyle = grey(0.45); g.lineWidth = 10;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(-800 + i * 30, -400 + i * 120); g.quadraticCurveTo(-100 + hash(i) * 300, -300 + i * 110, 700, -380 + i * 125); g.stroke(); }
    g.fillStyle = grey(0.92); g.beginPath(); g.ellipse(-450, -420, 260, 120, -0.1, 0, TAU); g.fill();
    g.fillStyle = grey(0.7); g.beginPath(); g.ellipse(-430, -410, 120, 50, -0.1, 0, TAU); g.fill();
    g.fillStyle = grey(0.18); g.fillRect(180, 40, 330, 210);
    g.fillStyle = grey(0.55); g.fillRect(205, 60, 200, 80);
    g.fillStyle = grey(0.08); g.beginPath(); g.arc(255, 190, 26, 0, TAU); g.arc(355, 190, 26, 0, TAU); g.fill();
    reset();
    lamp(W / 2 + h.x, H / 2 + h.y, Math.hypot(W, H) * 0.65, 1, 0.25);
    osd(t, sh);
    return { blur: 0.9, track: 1.5, jit: 5, drop: 10 };
  };
  shots.frag3 = (lt, dur, sh) => {
    const t = sh.t0 + lt;
    fill('#000');
    const h = hand(t, 4, 29);
    fitIn(h, 1.05, 0, 0, 1600, 1200);
    g.fillStyle = grey(0.42); g.fillRect(-2000, -1500, 4000, 3000);
    g.fillStyle = grey(0.03); g.fillRect(-340, -560, 680, 720);                  // the window, open on the dark
    g.strokeStyle = grey(0.6); g.lineWidth = 34; g.strokeRect(-340, -560, 680, 720);
    // the curtain blowing in
    g.fillStyle = grey(0.75);
    g.beginPath(); g.moveTo(330, -600); g.quadraticCurveTo(200 + 60 * Math.sin(lt * 6), -200, 260 + 90 * Math.sin(lt * 5 + 1), 200); g.lineTo(420, 220); g.lineTo(430, -600); g.fill();
    // the boards on the floor, nails still in them, bent outward
    for (const [x, y, a] of [[-300, 520, 0.12], [80, 600, -0.18], [-60, 700, 0.05]]) {
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = grey(0.66); g.fillRect(-380, -45, 760, 90);
      g.strokeStyle = grey(0.2); g.lineWidth = 7;
      for (const nx of [-330, 320]) { g.beginPath(); g.moveTo(nx, -40); g.lineTo(nx + 18, -95); g.stroke(); }
      g.restore();
    }
    reset();
    lamp(W / 2 + h.x, H / 2 + h.y, Math.hypot(W, H) * 0.6, 1, 0.22);
    osd(t, sh);
    return { blur: 1.1, track: 1.8, jit: 7, drop: 10 };
  };

  // ---------------------------------------------------------------- segment 3: out of the open window
  const FIELD3 = crowd(190, 77, [8, 60], [3, 0.8], 2000);
  for (const f of FIELD3) f.eyeAt = 53.4 + hash(f.seed) * 0.06;
  function wrenAt(t) {
    const u = smooth(45.1, 52.5, t);
    return { x: lerp(-1.6, -0.8, u), z: lerp(9.5, 20.5, u), walk: t < 52.5 ? 1 : 0 };
  }
  function drawField3(t, h, zoom, focus) {
    const turned = t >= 53.4;
    const wr = wrenAt(t);
    const search = smooth(45.6, 48.4, t);
    const cam = { x: lerp(3.5, wr.x, ease(search)), y: -4.4, z: -0.5, pitch: 0.42, f: Math.min(W * 0.95, H * 1.25), cx: W / 2, cy: H * 0.42 };
    const pw = L.projP(cam, wr.x, -0.6, wr.z);
    const ox = pw ? (pw.x - W / 2) * focus : 0, oy = pw ? (pw.y - H / 2) * focus : 0;
    shoot(h, zoom, ox, oy);
    irGround(cam, t, 0.5);
    let drewWren = false;
    for (const f of FIELD3) {
      if (!drewWren && f.z < wr.z) { drawWren(cam, wr, t, turned); drewWren = true; }
      irFigure(cam, f, { t, eyes: turned ? 1 : 0, rot: 0.01 * Math.sin(t * 0.6 + f.ph), dim: 0.62 });
    }
    if (!drewWren) drawWren(cam, wr, t, turned);
    // the window frame close around the edge of the picture
    reset();
    g.translate(h.x, h.y);
    g.fillStyle = grey(0.55);
    g.fillRect(-W, -H, W * 1.07, 3 * H);
    g.fillRect(W * 0.95, -H, W, 3 * H);
    g.fillStyle = grey(0.7);
    g.fillRect(-W, H * 0.9, 3 * W, H);
    return cam;
  }
  function drawWren(cam, wr, t, turned) {
    const p = L.projP(cam, wr.x, 0, wr.z);
    if (!p) return;
    const hpx = p.k * 1.2;
    const bob = wr.walk ? Math.abs(Math.sin(t * 5.5)) * hpx * 0.015 : 0;
    g.save();
    g.translate(p.x, p.y - bob);
    g.scale(hpx, hpx);
    g.globalAlpha = 1;
    L.drawGirlBack(g, turned ? smooth(53.4, 53.7, t) : 0, turned ? 1 : 0);
    g.restore();
    L.glow(g, p.x, p.y - hpx * 0.55, hpx * 0.7, [255, 255, 255], 0.22);
  }
  shots.field = (lt, dur, sh) => {
    const t = sh.t0 + lt;
    fill('#000');
    const turned = t >= 53.4;
    const jolt = turned ? Math.exp(-(t - 53.4) / 0.6) : 0;
    const h = hand(t, 1.8 + 3 * jolt, 31);
    if (jolt > 0 && !reduced) { h.x += Math.sin(t * 55) * jolt * W * 0.025; h.y += Math.cos(t * 43) * jolt * H * 0.03; }
    const zoomD = turned ? lerp(3.4, 1.4, smooth(53.4, 53.8, t)) : lerp(1, 3.4, smooth(49.0, 52.0, t));
    drawField3(t, h, zoomD, smooth(48.2, 50.5, t));
    reset();
    lamp(W / 2 + h.x, H / 2 + h.y, Math.hypot(W, H) * 0.75, 1, 0.35);
    osd(t, sh, { zoom: zoomD, battery: true });
    return { pix: zoomD > 1.6 ? 1 + (zoomD - 1.6) * 1.1 : 1, blur: jolt * 1.5 + (smooth(48.5, 49.2, t) - smooth(49.4, 50.2, t)) * 2 };
  };

  // ---------------------------------------------------------------- the drop
  shots.drop = (lt, dur, sh) => {
    const t = sh.t0 + lt;
    fill('#000');
    const fall = clamp(lt / 0.9, 0, 1);
    const h = hand(t, 4, 37);
    h.r += (reduced ? 0.6 : 2.3) * fall * fall;
    h.y += fall * fall * H * 0.9;
    drawField3(t, h, 1.2, 0);
    reset();
    lamp(W / 2, H / 2, Math.hypot(W, H) * 0.7, 1, 0.3);
    osd(t, sh, { battery: true });
    const hit = lt > 0.88 ? Math.exp(-(lt - 0.88) / 0.05) : 0;
    return { blur: 1.5 + 2.5 * fall, track: 1 + 2 * fall, tear: 0.5 * fall + hit, jit: 4 + 20 * hit, stat: 0.5 * hit, drop: 8 };
  };

  // ---------------------------------------------------------------- on the floor, tipped on its side
  function frontFoot(x, y, s, k) {
    // a bare foot seen from the front, toes toward the lens, bright in the lamp; ankle rising out of frame
    g.save(); g.translate(x, y); g.scale(s, s);
    const gr = g.createLinearGradient(0, -2.6, 0, 0.2);
    gr.addColorStop(0, grey(0.45 * k)); gr.addColorStop(1, grey(0.95 * k));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-0.36, -2.6); g.lineTo(-0.33, -1.1);
    g.quadraticCurveTo(-0.62, -0.55, -0.6, -0.12);
    g.quadraticCurveTo(-0.6, 0.12, -0.4, 0.14); g.lineTo(0.42, 0.14);
    g.quadraticCurveTo(0.62, 0.12, 0.6, -0.12);
    g.quadraticCurveTo(0.6, -0.55, 0.33, -1.1); g.lineTo(0.36, -2.6); g.closePath(); g.fill();
    g.fillStyle = grey(1.0 * k);
    const toes = [[-0.42, 0.11, 0.13], [-0.19, 0.17, 0.115], [0.02, 0.18, 0.105], [0.22, 0.16, 0.1], [0.42, 0.12, 0.09]];
    for (const [tx, ty, tr] of toes) { g.beginPath(); g.ellipse(tx, ty, tr, tr * 1.05, 0, 0, TAU); g.fill(); }
    g.fillStyle = grey(0.25 * k);
    for (const [tx, ty, tr] of toes) { g.beginPath(); g.ellipse(tx, ty + tr * 0.55, tr * 0.6, tr * 0.28, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(30,30,30,0.5)';
    g.beginPath(); g.ellipse(0.15, -0.55, 0.12, 0.25, 0.2, 0, TAU); g.fill();
    g.restore();
  }
  shots.floor = (lt, dur, sh) => {
    const t = sh.t0 + lt;
    fill('#000');
    const settle = lt < 0.4 ? Math.exp(-lt / 0.1) * Math.sin(lt * 60) * 0.05 : 0;
    const h = { x: 0, y: 0, r: -0.42 + settle };
    const P = portrait();
    fitIn(h, 1.0, P ? 160 : 0, P ? 60 : 0, P ? 1000 : 1600, P ? 1500 : 1200);
    // floorboards running away from the lens to the far wall; the window open on the dark
    const hz = -120;
    g.fillStyle = grey(0.1); g.fillRect(-3000, -2000, 6000, 2000 + hz);
    for (let i = -16; i <= 16; i++) {
      g.fillStyle = grey(0.3 + 0.18 * hash(i * 3.1));
      g.beginPath(); g.moveTo(i * 26, hz); g.lineTo((i + 1) * 26 - 2, hz); g.lineTo((i + 1) * 620 - 20, 1600); g.lineTo(i * 620, 1600); g.closePath(); g.fill();
    }
    const fg = g.createLinearGradient(0, hz, 0, 700);
    fg.addColorStop(0, 'rgba(0,0,0,0.85)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fg; g.fillRect(-3000, hz, 6000, 820);
    g.fillStyle = grey(0.01); g.fillRect(-170, -560, 330, 400);
    g.strokeStyle = grey(0.2); g.lineWidth = 14; g.strokeRect(-170, -560, 330, 400);
    if (t > 55.9) for (const [x, y] of [[-110, -400], [-20, -380], [60, -420], [-70, -330], [100, -350]]) {
      for (const s2 of [-1, 1]) { g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(x + s2 * 6, y, 3.2, 0, TAU); g.fill(); }
    }
    // she walks up from the window side and stops right in front of the lens
    const step1 = smooth(56.1, 56.45, t), step2 = smooth(56.55, 56.9, t), plant = smooth(57.0, 57.3, t), crouch = smooth(57.2, 57.7, t);
    if (step1 > 0) {
      const near = lerp(0.5, 1, Math.max(step2 * 0.6, plant)) * lerp(1, 1.12, crouch);
      // a long nightgown above the feet: the lamp is down here, so the hem glares and the rest fades up
      const hy = lerp(-260, 20, crouch) - 200 * (1 - near);
      const x0 = lerp(500, -560, step1), x1 = x0 + 1150 * near;
      g.save();
      g.beginPath(); g.moveTo(x0 + 120, -2000); g.lineTo(x0 - 40, hy);
      for (let i = 0; i <= 12; i++) g.lineTo(lerp(x0 - 40, x1 + 40, i / 12), hy + Math.sin(i * 1.9 + t * 2) * 22);
      g.lineTo(x1 - 120, -2000); g.closePath();
      const gg = g.createLinearGradient(0, hy, 0, hy - 900);
      gg.addColorStop(0, grey(0.8 * step1)); gg.addColorStop(0.4, grey(0.42 * step1)); gg.addColorStop(1, grey(0.1 * step1));
      g.fillStyle = gg; g.fill();
      g.clip();
      for (let i = 0; i < 6; i++) {
        const fx = lerp(x0, x1, (i + 0.5) / 6) + 25 * Math.sin(t * 1.5 + i);
        const fgr = g.createLinearGradient(fx - 60, 0, fx + 60, 0);
        fgr.addColorStop(0, 'rgba(0,0,0,0)'); fgr.addColorStop(0.5, 'rgba(0,0,0,0.28)'); fgr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = fgr; g.fillRect(fx - 60, hy - 1500, 120, 1540);
      }
      g.restore();
      frontFoot(lerp(700, -230, step1), lerp(220, 460, near), 190 * near, step1);
      if (step2 > 0) frontFoot(lerp(900, 260, step2), lerp(240, 470, near), 200 * near, step2);
    }
    // then a hand comes down over the lens, fingers spread, and covers it
    const reach = smooth(58.2, 59.4, t);
    if (reach > 0) {
      const k = L.easeIn(reach);
      g.save();
      const come = smooth(58.2, 58.9, t), close = smooth(58.9, 59.45, t);
      g.translate(lerp(380, 60, come), lerp(-1100, -120, come) + 160 * close);
      g.rotate(lerp(0.55, 0.2, come));
      const hs = lerp(380, 900, come) * lerp(1, 3.4, L.easeIn(close));
      g.scale(hs, hs);
      g.save(); g.scale(1.07, 1.05); g.fillStyle = 'rgba(0,0,0,0.6)'; g.strokeStyle = 'rgba(0,0,0,0.6)'; L.drawHand(g, 0.1 + 0.25 * k, 1.15); g.restore();
      g.fillStyle = grey(0.97); g.strokeStyle = grey(0.97);
      L.drawHand(g, 0.1 + 0.25 * k, 1.15);
      g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 0.01;
      for (const [x0, y0, x1, y1] of [[-0.18, 0.12, 0.18, 0.05], [-0.15, 0.25, 0.12, 0.32], [-0.05, -0.02, -0.12, 0.3]]) { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 0.04, x1, y1); g.stroke(); }
      g.restore();
    }
    const dark = smooth(59.25, 59.55, t);
    if (dark > 0) { reset(); g.fillStyle = `rgba(0,0,0,${0.96 * dark})`; g.fillRect(0, 0, W, H); }
    reset();
    lamp(W / 2, H / 2, Math.hypot(W, H) * 0.7, 1, 0.3);
    osd(t, sh, { battery: true });
    const hum = smooth(57.6, 58.0, t) * (1 - smooth(60.2, 60.5, t));
    return { blur: 0.4 + crouch * 0.6, track: 0.3 + (t > 60.3 ? 3 : 0), jit: 1.5 + hum * 1.5, tear: t > 60.45 ? 1 : 0 };
  };

  shots.static = (lt) => {
    fill(grey(0.5));
    return { mode: 2, stat: 1, grain: 0.3, track: 0, jit: 3, osd: false, vig: 0.2, bloom: 0.2 };
  };

  shots.title = (lt, dur) => {
    fill('#000');
    reset();
    const a = smooth(0.5, 1.8, lt) * (1 - smooth(dur - 1.6, dur - 0.4, lt));
    let size = Math.min(H * 0.13, W * 0.1);
    g.font = `600 ${size}px ${L.FONT_SERIF}`;
    const w0 = L.spaced(g, 'CRADLESONG', 0, 0, size * 0.3, 'center', false);
    if (w0 > W * 0.84) size *= (W * 0.84) / w0;
    const fl = 0.85 + 0.15 * L.flick(lt * 0.6, 3);
    g.translate(W / 2, H * 0.46);
    g.font = `600 ${size}px ${L.FONT_SERIF}`;
    g.fillStyle = `rgba(232,226,212,${a * fl})`;
    g.textBaseline = 'middle';
    L.spaced(g, 'CRADLESONG', 0, 0, size * 0.3);
    const a2 = smooth(2.2, 3.0, lt) * (1 - smooth(dur - 1.6, dur - 0.4, lt));
    g.font = `${size * 0.24}px "Courier Prime", "Courier New", monospace`;
    g.fillStyle = `rgba(200,196,186,${a2 * 0.8})`;
    L.spaced(g, 'TAPE 3 OF 7', 0, size * 1.0, size * 0.06);
    g.font = `600 ${size * 0.26}px ${L.FONT_SERIF}`;
    g.fillStyle = `rgba(180,48,38,${a2 * 0.9})`;
    L.spaced(g, 'COMING 2027', 0, size * 1.75, size * 0.1);
    g.textBaseline = 'alphabetic';
    return { mode: 0, grain: 0.05, track: 0, jit: 0, drop: 0, vig: 0.35, osd: false, bloom: 0.5 };
  };

  // ---------------------------------------------------------------- captions
  function captions(t) {
    for (const s of S.subs) {
      if (t < s.t0 - 0.1 || t > s.t1 + 0.1) continue;
      const a = smooth(s.t0 - 0.08, s.t0 + 0.08, t) * (1 - smooth(s.t1 - 0.08, s.t1 + 0.08, t));
      if (a <= 0) continue;
      reset();
      const size = Math.max(13, Math.min(H * 0.045, W * 0.04));
      g.font = `500 ${size}px ${L.FONT_SUB}`;
      g.textAlign = 'center';
      const w = g.measureText(s.text).width;
      const y = H - Math.max(size * 3.4, H * 0.19);
      g.fillStyle = `rgba(0,0,0,${0.72 * a})`;
      g.fillRect(W / 2 - w / 2 - size * 0.5, y - size * 1.05, w + size, size * 1.45);
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.fillText(s.text, W / 2, y);
    }
  }

  // ---------------------------------------------------------------- frame
  let lastT = 0;
  function shotAt(t) {
    let i = 0;
    while (i < SH.length - 1 && t >= SH[i + 1].t0) i++;
    return i;
  }
  function frame(t, opts = {}) {
    reduced = !!opts.reduced;
    t = clamp(t, 0, S.duration - 1e-3);
    lastT = t;
    const i = shotAt(t), sh = SH[i];
    const fn = shots[sh.id] || ((lt) => { fill('#000'); void lt; return { mode: 0 }; });
    g.save();
    const r = fn(t - sh.t0, sh.t1 - sh.t0, sh) || {};
    g.restore();
    reset();
    captions(t);
    const post = Object.assign({}, DEF, r);
    post.seed = Math.floor(t * 30);
    post.t = t;
    post.id = sh.id;
    if (reduced) { post.tear *= 0.3; post.roll *= 0.2; post.jit = Math.min(post.jit, 3); post.track *= 0.5; post.stat = Math.min(post.stat, 0.6); }
    return post;
  }

  function captionAt(t) {
    for (const s of S.subs) if (t >= s.t0 && t < s.t1) return '[whispering] ' + s.text;
    const sh = SH[shotAt(t)];
    if (sh.id === 'card') return S.card.map((c) => c.text).join(' ');
    if (sh.id === 'vcr') return sh.label === 'STOP' ? 'The tape stops.' : 'The tape plays.';
    if (sh.id === 'wren' && t >= 27.2 && t < 39.6) return '[a child hums a lullaby; outside, many voices hum with her]';
    if (sh.id === 'floor' && t >= 57.6) return '[a woman hums one low note, very close]';
    if (sh.id === 'title') return 'Cradlesong. Tape 3 of 7. Coming 2027.';
    return '';
  }

  function init(canvas) {
    cv = canvas;
    g = cv.getContext('2d', { alpha: false });
    if (!A) A = makeAssets();
    W = cv.width; H = cv.height;
  }
  function resize() {
    if (!cv) return;
    W = cv.width; H = cv.height;
  }
  let warmed = false;
  function warm(sync) {
    if (warmed) return;
    warmed = true;
    const jobs = [];
    for (const px of [96, 160]) for (let v = 0; v < VARIANTS; v++) jobs.push(() => L.deadSprite(VARIANT0 + v, px, '#bdbdbd'));
    if (sync) { jobs.forEach((j) => j()); return; }
    const step = () => { const t0 = performance.now(); while (jobs.length && performance.now() - t0 < 6) jobs.shift()(); if (jobs.length) setTimeout(step, 16); };
    step();
  }

  window.CSHOTS = { init, resize, frame, captionAt, warm, shotAt: (t) => SH[shotAt(t)] };
})();
