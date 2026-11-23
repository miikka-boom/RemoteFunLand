// Cradlesong: the shots. CSHOTS.frame(t) draws the trailer's picture at time t (seconds) into a 2D
// canvas, following window.SCORE (shots, cards, subtitles, broadcast lines, lightning), and returns
// the film-look settings post.js should use for that frame.
(function () {
  'use strict';
  const L = window.CSLIB, S = window.SCORE, TAU = L.TAU;
  const { clamp, lerp, smooth, ease, keys, hash, flick } = L;

  let cv, g, W = 2, H = 2, buf = null, bg = null, A = null;
  let reduced = false;
  const SH = S.shots;

  // ------------------------------------------------------------------ assets
  function makeAssets() {
    const a = {};
    const fog = L.noiseField(256, 5, 3, 4);
    a.fog = L.fieldCanvas(fog, 256, [150, 162, 176], (v) => L.smooth(0.32, 0.9, v));
    a.fogWhite = L.fieldCanvas(fog, 256, [205, 212, 220], (v) => L.smooth(0.3, 0.9, v));
    const cl = L.noiseField(256, 6, 8, 3);
    a.cloud = L.fieldCanvas(cl, 256, [26, 31, 40], (v) => L.smooth(0.25, 0.75, v));
    a.cloudShadow = L.fieldCanvas(cl, 256, [0, 0, 0], (v) => L.smooth(0.35, 0.8, v) * 0.85);
    // wood grain
    const wf = L.noiseField(256, 4, 21, 2);
    a.wood = (() => {
      const c = L.canvas(256, 256), x = c.getContext('2d'), im = x.createImageData(256, 256);
      for (let y = 0; y < 256; y++) for (let i = 0; i < 256; i++) {
        const v = wf[y * 256 + i];
        const gr = 0.5 + 0.5 * Math.sin((y * 0.11 + v * 9 + Math.sin(i * 0.02) * 0.6) * 3.2);
        const k = 0.65 + 0.35 * gr;
        const o = (y * 256 + i) * 4;
        im.data[o] = 74 * k; im.data[o + 1] = 47 * k; im.data[o + 2] = 30 * k; im.data[o + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      return c;
    })();
    // faded wallpaper: vertical stripes and small sprigs
    a.wall = (() => {
      const c = L.canvas(120, 120), x = c.getContext('2d');
      x.fillStyle = '#9a8a72'; x.fillRect(0, 0, 120, 120);
      x.fillStyle = 'rgba(70,58,44,0.25)'; x.fillRect(0, 0, 6, 120); x.fillRect(60, 0, 2, 120);
      x.fillStyle = 'rgba(90,70,60,0.35)';
      for (const [px, py] of [[30, 30], [90, 90]]) { x.beginPath(); x.ellipse(px, py, 5, 9, 0.5, 0, TAU); x.fill(); x.beginPath(); x.ellipse(px + 6, py + 4, 4, 7, -0.6, 0, TAU); x.fill(); }
      return c;
    })();
    a.quilt = (() => {
      const c = L.canvas(96, 96), x = c.getContext('2d');
      const cols = ['#7a5e78', '#a08452', '#5f6e86', '#8a4c44', '#6d7a58', '#9b8a7a'];
      const r = L.rng(5);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { x.fillStyle = cols[Math.floor(r() * cols.length)]; x.fillRect(i * 24, j * 24, 24, 24); }
      x.strokeStyle = 'rgba(30,20,20,0.5)'; x.lineWidth = 1.5;
      for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 24, 0); x.lineTo(i * 24, 96); x.moveTo(0, i * 24); x.lineTo(96, i * 24); x.stroke(); }
      return c;
    })();
    a.fogBand = (() => {
      const f = L.noiseField(256, 5, 41, 4);
      const c = L.canvas(256, 128), x = c.getContext('2d'), im = x.createImageData(256, 128);
      for (let y = 0; y < 128; y++) for (let i = 0; i < 256; i++) {
        const v = L.smooth(0.25, 0.85, f[((y * 2) % 256) * 256 + i]);
        const bell = Math.pow(Math.sin(Math.PI * (y + 0.5) / 128), 1.6);
        const o = (y * 256 + i) * 4;
        im.data[o] = 150; im.data[o + 1] = 162; im.data[o + 2] = 176; im.data[o + 3] = Math.round(255 * v * bell);
      }
      x.putImageData(im, 0, 0);
      return c;
    })();
    const gf = L.noiseField(256, 6, 33, 8, 0.6);
    a.groundLight = L.fieldCanvas(gf, 256, [120, 132, 126], (v) => 0.15 + 0.6 * v);
    a.ground = L.fieldCanvas(gf, 256, [16, 20, 16], (v) => 0.55 + 0.45 * v);
    a.trees = [L.treeSprite(4), L.treeSprite(9), L.treeSprite(15), L.treeSprite(23)];
    a.treeLine = (() => {
      const c = L.canvas(1024, 160), x = c.getContext('2d'), r = L.rng(77);
      x.fillStyle = '#000';
      x.beginPath(); x.moveTo(0, 160);
      for (let i = 0; i <= 1024; i += 4) x.lineTo(i, 110 - 30 * L.wob(i / 60, 2) - 18 * L.wob(i / 13, 5) - (r() < 0.04 ? 30 * r() : 0));
      x.lineTo(1024, 160); x.fill();
      for (let k = 0; k < 14; k++) { const tx = r() * 1024, s = 0.25 + r() * 0.2; x.drawImage(a.trees[k % 4], tx - 180 * s, 160 - 480 * s - 20, 360 * s, 480 * s); }
      return c;
    })();
    a.grass = (() => {
      const c = L.canvas(200, 120), x = c.getContext('2d'), r = L.rng(12);
      x.strokeStyle = '#000'; x.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        const bx = 20 + r() * 160, h = 40 + r() * 75, lean = (r() - 0.5) * 40;
        x.lineWidth = 1.5 + r() * 2.5;
        x.beginPath(); x.moveTo(bx, 120); x.quadraticCurveTo(bx + lean * 0.3, 120 - h * 0.6, bx + lean, 120 - h); x.stroke();
      }
      return c;
    })();
    return a;
  }

  // ------------------------------------------------------------------ framing helpers
  const portrait = () => H > W * 1.05;
  // fit the box (fw x fh units around fx, fy) inside the frame, then zoom; sets the transform
  function fit(fx, fy, fw, fh, zoom = 1, rot = 0) {
    const s = Math.min(W / fw, H / fh) * zoom;
    g.setTransform(s, 0, 0, s, W / 2 - fx * s, H / 2 - fy * s);
    if (rot) { g.translate(fx, fy); g.rotate(rot); g.translate(-fx, -fy); }
    return { s, x0: fx - W / 2 / s, x1: fx + W / 2 / s, y0: fy - H / 2 / s, y1: fy + H / 2 / s };
  }
  const reset = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };
  const fill = (c) => { reset(); g.fillStyle = c; g.fillRect(0, 0, W, H); };
  const shake = (t, amt, seed = 0) => (reduced ? [0, 0] : [L.wob(t * 13, seed) * amt, L.wob(t * 11, seed + 9) * amt]);
  // radial light map multiplied over the frame: stops = [[r0..1, [r,g,b]], ...] in px radius
  function lightMap(x, y, r, stops) {
    reset();
    g.globalCompositeOperation = 'multiply';
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, c] of stops) gr.addColorStop(o, `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }
  function vignette(a = 0.6, inner = 0.35) {
    reset();
    const r = Math.hypot(W, H) / 2;
    const gr = g.createRadialGradient(W / 2, H / 2, r * inner, W / 2, H / 2, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${a})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  function dust(x0, y0, x1, y1, n, t, seed, size, alpha, rgb = '255,236,210') {
    for (let i = 0; i < n; i++) {
      const hx = hash(i * 3.1 + seed), hy = hash(i * 7.7 + seed), hs = hash(i * 1.3 + seed);
      const x = x0 + (((hx + t * 0.012 * (hs - 0.4)) % 1 + 1) % 1) * (x1 - x0);
      const y = y0 + (((hy + t * 0.02 * (0.3 + hs)) % 1 + 1) % 1) * (y1 - y0);
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + hs * 2) + i);
      g.fillStyle = `rgba(${rgb},${alpha * tw})`;
      g.beginPath(); g.arc(x, y, size * (0.5 + hs), 0, TAU); g.fill();
    }
  }

  const VARIANTS = 64, VARIANT0 = 9100;
  // a figure in a 2.5D scene: sprite when small, vector when large; fog blends toward fogRGB
  function figure(cam, x, z, seed, o = {}) {
    const p = L.proj(cam, x, 0, z);
    if (!p) return null;
    const hpx = p.k * 1.75;
    if (hpx < 1.5 || p.x < -hpx || p.x > W + hpx) return p;
    const fogAmt = o.fog === undefined ? 1 - Math.exp(-p.d / (o.fogDist || 60)) : o.fog;
    const a = clamp(1 - fogAmt, 0, 1) * (o.alpha === undefined ? 1 : o.alpha);
    if (a <= 0.01) return p;
    const rot = o.rot || 0;
    if (hpx > 280 || o.vector) {
      const P = o.P || L.deadParams(seed);
      const fr = o.fogRGB || [60, 70, 82];
      const c = `rgb(${fr[0] * fogAmt | 0},${fr[1] * fogAmt | 0},${fr[2] * fogAmt | 0})`;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(rot);
      g.scale(hpx, hpx);
      g.fillStyle = c; g.strokeStyle = c;
      L.drawDead(g, P);
      g.restore();
      return p;
    }
    // crowds share 64 silhouettes (mirrored at random), in three sizes, to keep canvas memory small
    const sp = L.deadSprite(VARIANT0 + (seed % VARIANTS), hpx < 70 ? 96 : hpx < 140 ? 160 : 300);
    const sc = hpx / sp.px;
    g.save();
    g.translate(p.x, p.y);
    if (rot) g.rotate(rot);
    if ((seed >> 6) & 1) g.scale(-1, 1);
    g.globalAlpha = a;
    g.drawImage(sp.body, -sp.w / 2 * sc, -sp.footY * sc, sp.w * sc, sp.h * sc);
    if (o.face > 0.01) {
      sp.faces();
      g.globalAlpha = a * o.face;
      g.drawImage(sp.face, -sp.w / 2 * sc, -sp.footY * sc, sp.w * sc, sp.h * sc);
    }
    if (o.eyes > 0.01) {
      sp.faces();
      g.globalAlpha = Math.min(1, a * 1.6) * o.eyes;
      g.drawImage(sp.eyes, -sp.w / 2 * sc, -sp.footY * sc, sp.w * sc, sp.h * sc);
    }
    g.restore();
    return p;
  }

  function skyAndGround(cam, top, horizon, groundFar, groundNear) {
    reset();
    let gr = g.createLinearGradient(0, 0, 0, cam.cy);
    gr.addColorStop(0, top); gr.addColorStop(1, horizon);
    g.fillStyle = gr; g.fillRect(0, 0, W, cam.cy + 1);
    gr = g.createLinearGradient(0, cam.cy, 0, H);
    gr.addColorStop(0, groundFar); gr.addColorStop(1, groundNear);
    g.fillStyle = gr; g.fillRect(0, cam.cy, W, H - cam.cy);
  }
  // a ground-hugging fog band at depth z, soft at the top and bottom
  function fogBand(cam, z, height, alpha, t, tex, speed = 0.6) {
    const p = L.proj(cam, 0, 0, z);
    if (!p) return;
    const top = cam.cy + (-height - cam.y) * p.k, bot = cam.cy + (0.5 - cam.y) * p.k;
    if (bot < 0 || top > H || bot - top < 2) return;
    g.save();
    g.globalAlpha = Math.min(1, alpha);
    const hgt = bot - top, sx = Math.max(1.5, hgt / 40);
    L.tile(g, A.fogBand, 0, top, W, hgt, t * speed * 40 - cam.x * p.k * 0.6, top, sx, hgt / 128);
    g.restore();
    void tex;
  }
  function camFor(x, y, z, fScaleW, fScaleH, cyFrac = 0.5) {
    return { x, y, z, f: Math.min(W * fScaleW * (portrait() ? 1.45 : 1), H * fScaleH), cx: W / 2, cy: H * cyFrac };
  }

  // ------------------------------------------------------------------ shots
  const shots = {};

  shots.black = () => { fill('#000'); };

  // the cassette deck, close
  function deckShot(lt, dur, mode) {
    fill('#040303');
    const P = portrait();
    let fx = 0, fy = 0, fw = 1240, fh = 820, zoom = 1, rot = -0.05;
    if (mode === 'play') { zoom = lerp(1.0, 1.14, ease(lt / dur)); fx = lerp(40, -80, ease(lt / dur)); fy = lerp(20, -40, ease(lt / dur)); }
    if (mode === 'stop') { fx = -90; fy = -40; fw = 900; fh = 600; zoom = lerp(1.0, 1.06, lt / dur); }
    if (mode === 'tv') { fx = -110; fy = -60; fw = 860; fh = 560; zoom = lerp(1.04, 1.12, lt / dur); rot = 0.04; }
    if (P) { fw *= 0.72; fx = lerp(fx, -60, 0.6); }
    const [sx, sy] = shake(lt, mode === 'tv' ? 1.2 : 0.5, 3);
    fit(fx + sx, fy + sy, fw, fh, zoom, rot);
    // the nightstand top
    g.save();
    g.globalAlpha = 1;
    L.tile(g, A.wood, -2400, -2400, 4800, 4800, 0, 0, 3.2, 1.4);
    g.fillStyle = 'rgba(10,6,4,0.35)';
    g.fillRect(-2400, -2400, 4800, 4800);
    g.restore();
    // its soft shadow
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath(); g.roundRect ? g.roundRect(-480, -290, 1010, 660, 60) : g.rect(-480, -290, 1010, 660); g.fill();
    const playing = mode === 'play';
    const reel = playing ? Math.max(0, lt - 0.05) * 2.6 : 0.7;
    L.drawDeck(g, { reel, play: playing, progress: playing ? 0.05 + lt * 0.004 : 0.12, led: playing ? 1 : 0 });
    // light
    const m = g.getTransform();
    const toScr = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    if (mode === 'tv') {
      const k = 0.75 + 0.25 * flick(lt * 0.8, 4);
      const [lx, ly] = toScr(-900, -500);
      lightMap(lx, ly, Math.hypot(W, H) * 1.05, [[0, [130 * k, 190 * k, 215 * k]], [0.5, [60 * k, 95 * k, 120 * k]], [1, [8, 12, 18]]]);
    } else {
      const k = 1 + 0.05 * flick(lt * 0.7, 1) - (mode === 'stop' ? 0.12 : 0);
      const [lx, ly] = toScr(-1100, -700);
      lightMap(lx, ly, Math.hypot(W, H) * 1.1, [[0, [255 * k, 214 * k, 160 * k]], [0.45, [170 * k, 118 * k, 76 * k]], [1, [10, 7, 6]]]);
    }
    if (playing) {
      const [lx, ly] = toScr(380, -270);
      L.glow(g, lx, ly, 26 * m.a, [255, 50, 30], 0.9);
      L.glow(g, lx, ly, 120 * m.a, [255, 40, 20], 0.25);
    }
    vignette(0.75, 0.3);
  }
  shots.cassette = (lt, d) => deckShot(lt, d, 'play');
  shots.cassette2 = (lt, d) => deckShot(lt, d, 'stop');
  shots.tapehand = (lt, d) => deckShot(lt, d, 'tv');

  // ---------------------------------------------------------------- Wren's room
  // world units: the floor line is y = 260, 1 m is about 420 units
  function room(lt, o) {
    const lamp = o.lamp === undefined ? 1 : o.lamp;
    // wall
    g.fillStyle = '#9a8a72';
    g.fillRect(-3000, -3000, 6000, 3260);
    L.tile(g, A.wall, -3000, -3000, 6000, 3260, 0, 0, 1.6);
    g.fillStyle = 'rgba(40,30,22,0.3)';
    g.fillRect(-3000, -3000, 6000, 3260);
    g.fillStyle = '#3a2a1e';
    g.fillRect(-3000, 222, 6000, 40);
    // floor
    L.tile(g, A.wood, -3000, 262, 6000, 3000, 0, 262, 2.6, 0.9);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 300; y < 3000; y += 70) g.fillRect(-3000, y, 6000, 3);
    // window on the back wall: night outside, boards across
    const wx = -20, wy = -560, ww = 320, wh = 390;
    let gr = g.createLinearGradient(0, wy, 0, wy + wh);
    gr.addColorStop(0, '#0b1324'); gr.addColorStop(1, '#22304a');
    g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
    L.glow(g, wx + ww * 0.78, wy + wh * 0.22, 260, [170, 190, 230], 0.55 * (o.moon || 1));
    if (o.shadowPass !== undefined && o.shadowPass > -0.2 && o.shadowPass < 1.2) {     // someone walks past outside
      const sx = wx - 120 + o.shadowPass * (ww + 240);
      g.fillStyle = '#05070c';
      g.beginPath(); g.ellipse(sx, wy + wh * 0.5, 60, 70, 0, 0, TAU); g.fill();
      g.fillRect(sx - 120, wy + wh * 0.62, 240, 400);
    }
    // frame and boards
    g.strokeStyle = '#2a1d14'; g.lineWidth = 22; g.strokeRect(wx, wy, ww, wh);
    g.fillStyle = '#2a1d14'; g.fillRect(wx + ww / 2 - 7, wy, 14, wh); g.fillRect(wx, wy + wh / 2 - 7, ww, 14);
    const boards = [[-0.06, 70, 62], [0.04, 165, 70], [-0.03, 262, 64], [0.05, 340, 52]];
    for (const [a, by, bh] of boards) {
      g.save(); g.translate(wx + ww / 2, wy + by); g.rotate(a);
      g.fillStyle = '#3b2a1c'; g.fillRect(-ww / 2 - 60, -bh / 2, ww + 120, bh);
      g.fillStyle = 'rgba(255,230,200,0.08)'; g.fillRect(-ww / 2 - 60, -bh / 2, ww + 120, 4);
      g.fillStyle = '#16100b'; for (const nx of [-ww / 2 - 40, ww / 2 + 40]) { g.beginPath(); g.arc(nx, 0, 5, 0, TAU); g.fill(); }
      g.restore();
    }
    // a child's drawing pinned up: Mum, Dad, Wren
    g.save(); g.translate(-500, -400); g.rotate(-0.06);
    g.fillStyle = '#ddd4c2'; g.fillRect(-80, -60, 160, 120);
    g.lineWidth = 4; g.lineCap = 'round';
    const stick = (x, h, col) => { g.strokeStyle = col; g.beginPath(); g.arc(x, 30 - h, 9, 0, TAU); g.moveTo(x, 39 - h); g.lineTo(x, 30); g.moveTo(x - 12, 46 - h + 8); g.lineTo(x + 12, 46 - h + 8); g.moveTo(x, 30); g.lineTo(x - 8, 48); g.moveTo(x, 30); g.lineTo(x + 8, 48); g.stroke(); };
    stick(-45, 70, '#b3423a'); stick(-5, 76, '#36569a'); stick(35, 50, '#c79a2a');
    g.strokeStyle = '#d6a320'; g.beginPath(); g.arc(55, -38, 12, 0, TAU); g.stroke();
    g.restore();
    // shelf with a toy rabbit
    g.fillStyle = '#2a1d14'; g.fillRect(380, -300, 260, 16);
    g.fillStyle = '#4a3c32';
    g.beginPath(); g.ellipse(520, -330, 26, 30, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(520, -378, 18, 20, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(510, -412, 6, 22, -0.2, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(531, -410, 6, 22, 0.3, 0, TAU); g.fill();
    // Dad's shadow on the wall, thrown by the lantern (only where there's wall)
    const lampX = -205, lampY = -10;
    if (lamp > 0.02 && o.dad) {
      g.save();
      g.beginPath(); g.rect(-3000, -3000, 6000, 3222); g.clip();
      g.globalAlpha = 0.5 * lamp;
      g.fillStyle = '#1e1710'; g.strokeStyle = '#1e1710';
      g.translate(lampX, lampY); g.scale(1.75, 1.75); g.translate(-lampX, -lampY);
      if (o.dad === 'seated') { g.translate(-560, 262); g.scale(430, 430); L.drawDadSeated(g, o.lift || 0); }
      else if (o.dad === 'window') { g.translate(150, 262); g.scale(430, 430); L.drawDadBack(g); }
      g.restore();
    }
    // the bed: headboard, mattress, pillow, Wren, the quilt
    g.fillStyle = '#2b1e15';
    g.fillRect(-60, -170, 40, 432); g.fillRect(-70, -185, 60, 26);
    g.fillRect(660, 20, 34, 242);
    g.fillStyle = '#3a2a1e'; g.fillRect(-30, 150, 700, 46);
    g.fillStyle = '#cfc6b4'; g.fillRect(-25, 92, 700, 62);
    g.fillStyle = '#d9d2c4';
    g.beginPath(); g.ellipse(80, 82, 95, 34, -0.05, 0, TAU); g.fill();
    // Wren's head on the pillow, turned toward the lamp
    g.fillStyle = '#1a120c';
    g.beginPath(); g.ellipse(90, 50, 46, 40, -0.2, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(120, 30); g.quadraticCurveTo(160, 70, 150, 95); g.lineTo(110, 90); g.fill();
    g.fillStyle = '#b98b6c';
    g.beginPath(); g.ellipse(68, 60, 26, 30, -0.3, 0, TAU); g.fill();
    if (o.eyes > 0.05) {
      g.fillStyle = `rgba(255,240,220,${0.85 * o.eyes})`;
      g.beginPath(); g.ellipse(56, 52, 4.5, 2.5, -0.3, 0, TAU); g.fill();
      g.fillStyle = '#120c08';
      g.beginPath(); g.arc(54.5, 52, 2, 0, TAU); g.fill();
    } else {
      g.strokeStyle = '#4a3022'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(50, 52); g.quadraticCurveTo(56, 56, 62, 52); g.stroke();
    }
    // the quilt, a small body under it
    g.save();
    g.beginPath();
    g.moveTo(108, 158);
    g.quadraticCurveTo(110, 58, 175, 52);
    g.quadraticCurveTo(250, 40, 300, 64);
    g.quadraticCurveTo(380, 50, 470, 72);
    g.quadraticCurveTo(560, 80, 600, 96);
    g.quadraticCurveTo(660, 100, 668, 160);
    g.lineTo(668, 262 - 70); g.lineTo(108, 262 - 70);
    g.closePath();
    g.clip();
    L.tile(g, A.quilt, 100, 0, 600, 300, 0, 0, 1.4);
    g.fillStyle = 'rgba(30,20,20,0.35)'; g.fillRect(100, 0, 600, 300);
    gr = g.createLinearGradient(0, 40, 0, 200);
    gr.addColorStop(0, 'rgba(255,240,220,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = gr; g.fillRect(100, 0, 600, 300);
    g.restore();
    // nightstand with the lantern and the tape deck
    g.fillStyle = '#3d2b1d'; g.fillRect(-270, 40, 200, 222);
    g.fillStyle = '#4a3524'; g.fillRect(-280, 30, 220, 18);
    g.fillStyle = '#2a1d13'; g.fillRect(-255, 80, 170, 70);
    g.fillStyle = '#8a7350'; g.beginPath(); g.arc(-170, 115, 7, 0, TAU); g.fill();
    // deck (seen from the front edge)
    g.fillStyle = '#1b1918'; g.fillRect(-150, -6, 82, 36);
    g.fillStyle = '#3c3a37'; g.fillRect(-146, -12, 74, 8);
    const led = o.led === undefined ? 1 : o.led;
    g.fillStyle = led > 0.05 ? '#ff3a22' : '#3a1410';
    g.beginPath(); g.arc(-84, 6, 3.2, 0, TAU); g.fill();
    // lantern
    if (o.lanternShown !== false) {
      g.fillStyle = '#1a1716'; g.fillRect(-232, 18, 56, 14);
      g.fillStyle = lamp > 0.02 ? '#f2c47a' : '#2a2a30';
      g.beginPath(); g.roundRect ? g.roundRect(-226, -60, 44, 78, 12) : g.rect(-226, -60, 44, 78); g.fill();
      g.fillStyle = '#1a1716'; g.fillRect(-230, -68, 52, 10);
      g.strokeStyle = '#1a1716'; g.lineWidth = 5;
      g.beginPath(); g.arc(-204, -72, 22, Math.PI, 0); g.stroke();
    }
    // Dad
    if (o.dad === 'seated') {
      g.save(); g.fillStyle = '#0a0807'; g.strokeStyle = '#0a0807';
      g.translate(-560, 262); g.scale(430, 430); L.drawDadSeated(g, o.lift || 0); g.restore();
    } else if (o.dad === 'window') {
      g.save(); g.fillStyle = '#0a0807'; g.strokeStyle = '#0a0807';
      g.translate(150, 262); g.scale(430, 430); L.drawDadBack(g); g.restore();
    }
    if (o.mara > 0.01) {
      g.save(); g.globalAlpha = o.mara; g.fillStyle = '#020203'; g.strokeStyle = '#020203';
      g.translate(215, 120); g.scale(420, 420); L.drawMara(g); g.restore();
    }
    return { lampX, lampY, wx, wy, ww, wh };
  }

  function roomLight(R, lamp, moon, lt, shafts = true) {
    const m = g.getTransform();
    const toScr = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    const [lx, ly] = toScr(R.lampX, R.lampY);
    const k = lamp * (1 + 0.045 * flick(lt * 0.6, 2));
    const r = 1150 * m.a;
    const base = [6 + 10 * moon, 7 + 12 * moon, 10 + 20 * moon];
    lightMap(lx, ly, r, [[0, [255 * k + base[0], 205 * k + base[1], 150 * k + base[2]]], [0.35, [190 * k + base[0], 135 * k + base[1], 90 * k + base[2]]],
      [0.75, [70 * k + base[0], 45 * k + base[1], 32 * k + base[2]]], [1, base]]);
    // moonlight through the gaps between the boards, falling into the room as thin shafts
    if (moon > 0.01 && shafts) {
      g.save();
      g.setTransform(m);
      g.globalCompositeOperation = 'lighter';
      const gaps = [[R.wy + 118, 16], [R.wy + 214, 20], [R.wy + 302, 14]];
      for (const [gy, gh] of gaps) {
        const gr = g.createLinearGradient(R.wx + R.ww / 2, gy, R.wx + R.ww / 2 + 260, gy + 560);
        gr.addColorStop(0, `rgba(130,160,210,${0.16 * moon})`);
        gr.addColorStop(0.6, `rgba(130,160,210,${0.05 * moon})`);
        gr.addColorStop(1, 'rgba(130,160,210,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(R.wx + 30, gy); g.lineTo(R.wx + R.ww - 30, gy - 4);
        g.lineTo(R.wx + R.ww + 230, gy + gh + 520); g.lineTo(R.wx + 250, gy + gh + 560);
        g.closePath(); g.fill();
      }
      g.restore();
    }
    if (lamp > 0.02) {
      L.glow(g, lx, ly - 10 * m.a, 70 * m.a, [255, 190, 110], 0.9 * lamp);
      L.glow(g, lx, ly - 10 * m.a, 340 * m.a, [255, 160, 80], 0.22 * lamp);
    }
  }

  shots.bedroom = (lt, dur) => {
    fill('#000');
    const P = portrait();
    const u = ease(clamp(lt / dur, 0, 1));
    const fx = P ? lerp(-235, -160, u) : lerp(-130, -20, u), fy = lerp(-150, -230, u);
    const [sx, sy] = shake(lt, 2, 5);
    fit(fx + sx, fy + sy, P ? 1000 : 1760, P ? 1300 : 960, lerp(1.0, 1.13, u));
    const lift = smooth(10.4, 12.0, lt) * 0.6;
    const R = room(lt, { dad: 'seated', lift, eyes: lt > 2.5 ? 1 : 0, led: 1, shadowPass: (lt - 8.9) / 1.1 });
    roomLight(R, 1, 0.6, lt);
    vignette(0.7, 0.3);
  };

  shots.bedroom2 = (lt, dur) => {
    fill('#000');
    const P = portrait();
    const u = clamp(lt / dur, 0, 1);
    const [sx, sy] = shake(lt, 2.5, 6);
    fit(150 + sx, -330 + sy, P ? 760 : 1250, P ? 1150 : 700, lerp(1.0, 1.08, u));
    const R = room(lt, { dad: 'window', eyes: 1, led: 0 });
    roomLight(R, 0.85, 0.9, lt, false);
    vignette(0.7, 0.3);
  };

  shots.stinger = (lt, dur) => {
    const split = 2.3;
    if (lt < split) {           // the deck, stopped, in moonlight: whatever we hear, it isn't the tape
      fill('#020304');
      const P = portrait();
      fit(-60, -30, P ? 720 : 1000, P ? 620 : 640, lerp(1.0, 1.08, lt / split), 0.03);
      g.save(); L.tile(g, A.wood, -2400, -2400, 4800, 4800, 0, 0, 3.2, 1.4); g.restore();
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(-2400, -2400, 4800, 4800);
      L.drawDeck(g, { reel: 0.7, play: false, progress: 0.97, led: 0 });
      const m = g.getTransform();
      lightMap(m.a * 700 + m.e, m.d * -600 + m.f, Math.hypot(W, H) * 1.0, [[0, [120, 140, 175]], [0.5, [52, 62, 82]], [1, [5, 6, 9]]]);
      vignette(0.8, 0.3);
      return;
    }
    fill('#000');
    const P = portrait();
    const u = clamp((lt - split) / (dur - split), 0, 1);
    fit(lerp(120, 150, u), -40, P ? 760 : 1300, P ? 1150 : 720, lerp(1.0, 1.06, u));
    const R = room(lt, { lamp: 0, dad: null, eyes: 0, led: 0, mara: 0 });
    const m = g.getTransform();
    reset();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgb(22,27,38)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.setTransform(m);
    // a pale patch of moonlight on the wall behind the bed, and across the quilt
    let gr = g.createRadialGradient(260, -170, 20, 260, -170, 420);
    gr.addColorStop(0, 'rgba(70,86,115,0.55)'); gr.addColorStop(1, 'rgba(70,86,115,0)');
    g.fillStyle = gr; g.fillRect(-300, -700, 1200, 1000);
    gr = g.createLinearGradient(0, 40, 0, 200);
    gr.addColorStop(0, 'rgba(60,75,100,0.35)'); gr.addColorStop(1, 'rgba(60,75,100,0)');
    g.fillStyle = gr; g.fillRect(100, 40, 600, 160);
    g.globalCompositeOperation = 'source-over';
    // she sits on the edge of the bed, bent over the pillow
    g.save(); g.fillStyle = '#010102'; g.strokeStyle = '#010102';
    g.translate(232, 128); g.scale(430, 430); L.drawMara(g); g.restore();
    void R;
    vignette(0.85, 0.25);
  };

  // ---------------------------------------------------------------- the house in the field
  const HOUSE_FIGS = (() => {
    const r = L.rng(404), out = [];
    for (let i = 0; i < 230; i++) {
      const z = 4 + 102 * Math.pow(r(), 0.85);
      let x = (r() * 2 - 1) * (2.5 + 0.8 * z);
      if (Math.abs(x) < 1.6 + z * 0.05) x += Math.sign(x || 1) * (1.6 + z * 0.05);
      if (z > 96 && Math.abs(x) < 9) continue;
      out.push({ x, z, seed: 1000 + i });
    }
    return out.sort((a, b) => b.z - a.z);
  })();
  const GRASS = (() => { const r = L.rng(5), o = []; for (let i = 0; i < 220; i++) { const z = -1.5 + 40 * Math.pow(r(), 1.6); o.push({ x: (r() * 2 - 1) * (2 + z * 0.9), z, s: 0.25 + r() * 0.35 }); } return o.sort((a, b) => b.z - a.z); })();
  const TREES = [[-17, 101, 0, 1.0], [14, 117, 1, 1.2], [-31, 140, 2, 1.3], [33, 150, 3, 1.1], [-46, 95, 1, 0.9], [52, 120, 0, 1.0]];

  function farmhouse(cam, fogK, litK, t) {
    const z = 110;
    const d = z - cam.z;
    if (d <= 0.4) return;
    const P = (x, y) => L.proj(cam, x, y, z);
    const fa = 1 - Math.exp(-d / 150);
    const col = (k) => `rgb(${(8 + k) * (1 - fa) + 44 * fa | 0},${(9 + k) * (1 - fa) + 51 * fa | 0},${(11 + k) * (1 - fa) + 61 * fa | 0})`;
    const a = P(-7, 0), b = P(7, -6.4);
    g.fillStyle = col(0);
    g.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
    const k = a.k;
    if (k > 25) {                      // clapboards, only when we're close enough to see them
      g.strokeStyle = col(9); g.lineWidth = Math.max(1, k * 0.02);
      for (let y = -0.2; y > -6.4; y -= 0.24) { const q = P(-7, y), q2 = P(7, y); g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q2.x, q2.y); g.stroke(); }
    }
    g.fillStyle = col(-3);
    const roof = [P(-7.9, -6.25), P(0, -10.6), P(7.9, -6.25)];
    g.beginPath(); g.moveTo(roof[0].x, roof[0].y); g.lineTo(roof[1].x, roof[1].y); g.lineTo(roof[2].x, roof[2].y); g.fill();
    g.strokeStyle = col(14); g.lineWidth = Math.max(1, k * 0.08);
    g.beginPath(); g.moveTo(roof[0].x, roof[0].y); g.lineTo(roof[1].x, roof[1].y); g.lineTo(roof[2].x, roof[2].y); g.stroke();
    const c1 = P(3.6, -9.2), c2 = P(4.6, -11.2);
    g.fillStyle = col(-3); g.fillRect(c1.x, c2.y, c2.x - c1.x, c1.y - c2.y);
    const p1 = P(-7.6, -2.9), p2 = P(7.6, -2.6);
    g.fillRect(p1.x, p1.y, p2.x - p1.x, (p2.y - p1.y) + Math.max(2, k * 0.15));
    for (const px of [-7.2, -2.4, 2.4, 7.2]) { const q1 = P(px - 0.12, -2.8), q2 = P(px + 0.12, 0); g.fillRect(q1.x, q1.y, q2.x - q1.x, q2.y - q1.y); }
    // windows: dark panes in pale trim; one lit upstairs, boarded from inside
    const win = (x, y, lit) => {
      const w1 = P(x - 0.75, y - 0.95), w2 = P(x + 0.75, y + 0.95);
      const tr = Math.max(1, k * 0.12);
      g.fillStyle = col(16); g.fillRect(w1.x - tr, w1.y - tr, w2.x - w1.x + tr * 2, w2.y - w1.y + tr * 2);
      if (lit > 0) {
        const kk = lit * (0.9 + 0.1 * flick(t * 0.6, 2));
        const gr = g.createRadialGradient((w1.x + w2.x) / 2, (w1.y + w2.y) / 2, 0, (w1.x + w2.x) / 2, (w1.y + w2.y) / 2, (w2.y - w1.y) * 0.8);
        gr.addColorStop(0, `rgb(${255 * kk | 0},${178 * kk | 0},${96 * kk | 0})`);
        gr.addColorStop(1, `rgb(${170 * kk | 0},${90 * kk | 0},${40 * kk | 0})`);
        g.fillStyle = gr;
        g.fillRect(w1.x, w1.y, w2.x - w1.x, w2.y - w1.y);
        g.fillStyle = '#140d08';
        const bh = (w2.y - w1.y) * 0.15;
        [[0.12, -0.04], [0.43, 0.05], [0.72, -0.03]].forEach(([f, rot]) => {
          g.save(); g.translate((w1.x + w2.x) / 2, w1.y + (w2.y - w1.y) * f + bh / 2); g.rotate(rot);
          g.fillRect(-(w2.x - w1.x) * 0.55, -bh / 2, (w2.x - w1.x) * 1.1, bh); g.restore();
        });
        g.fillStyle = col(16); g.fillRect((w1.x + w2.x) / 2 - tr / 2, w1.y, tr, w2.y - w1.y);
        const cx = (w1.x + w2.x) / 2, cy = (w1.y + w2.y) / 2, s = (w2.x - w1.x);
        L.glow(g, cx, cy, s * 1.6, [255, 160, 80], 0.35 * kk);
        L.glow(g, cx, cy, s * 7, [255, 140, 70], 0.08 * kk);
      } else {
        g.fillStyle = col(-6);
        g.fillRect(w1.x, w1.y, w2.x - w1.x, w2.y - w1.y);
      }
    };
    win(-3.2, -4.6, litK); win(3.2, -4.6, 0); win(-4.2, -1.5, 0); win(4.2, -1.5, 0);
    const dr1 = P(-0.6, -2.3), dr2 = P(0.6, 0);
    g.fillStyle = col(-5); g.fillRect(dr1.x, dr1.y, dr2.x - dr1.x, dr2.y - dr1.y);
    void fogK;
  }

  shots.house = (lt, dur) => {
    const u = clamp(lt / dur, 0, 1);
    const z = keys(lt, [[0, 103.2], [1.2, 102.4], [3.6, 86], [6.2, 44], [8.0, 6], [8.85, 0.25], [10.6, -1.2]]);
    const cx = keys(lt, [[0, -3.2], [4.0, -2.5], [8, -0.5], [10.6, -0.3]]);
    const cy = keys(lt, [[0, -4.5], [3.5, -3.9], [7.5, -2.0], [10.6, -1.72]]);
    const cam = camFor(cx, cy, z, 0.62, 1.25, 0.5);
    skyAndGround(cam, '#05070b', '#2b333d', '#232a32', '#060708');
    // moon behind cloud, clouds drifting
    L.glow(g, W * 0.78, H * 0.16, Math.max(W, H) * 0.35, [150, 170, 200], 0.35);
    g.save(); g.globalAlpha = 0.85;
    L.tile(g, A.cloud, 0, 0, W, cam.cy, lt * 8, 0, Math.max(W, H) / 256 * 1.3, Math.max(W, H) / 256 * 0.55);
    g.restore();
    // far tree line
    const tl = L.proj(cam, 0, 0, 320);
    if (tl) {
      const th = 26 * tl.k, tw = th * 6.4;
      g.save(); g.globalAlpha = 0.85;
      L.tile(g, A.treeLine, 0, tl.y - th, W, th, -cam.x * tl.k, 0, tw / 1024, th / 160);
      g.restore();
    }
    // the rest in depth order
    const items = [];
    items.push({ z: 110, draw: () => farmhouse(cam, 0.62, 1, lt) });
    for (const [x, tz, i, s] of TREES) items.push({ z: tz, draw: () => {
      const p = L.proj(cam, x, 0, tz); if (!p) return;
      const h = 11 * s * p.k, w = h * 0.75;
      g.save(); g.globalAlpha = clamp(1 - (1 - Math.exp(-p.d / 80)) * 0.85, 0, 1); g.drawImage(A.trees[i], p.x - w / 2, p.y - h, w, h); g.restore();
    } });
    for (const f of HOUSE_FIGS) items.push({ z: f.z, draw: () => figure(cam, f.x, f.z, f.seed, { fogDist: 70, rot: 0.012 * Math.sin(lt * 0.6 + f.seed) }) });
    for (const fz of [100, 80, 62, 45, 30, 18, 9]) items.push({ z: fz + 0.01, draw: () => fogBand(cam, fz, 1.4, 0.42, lt) });
    for (const gr of GRASS) items.push({ z: gr.z, draw: () => {
      const p = L.proj(cam, gr.x, 0, gr.z); if (!p) return;
      const h = gr.s * p.k, w = h * 1.7;
      if (h < 2 || p.x < -w || p.x > W + w) return;
      g.drawImage(A.grass, p.x - w / 2, p.y - h, w, h);
    } });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) if (it.z > cam.z) it.draw();
    // the one standing right behind us
    figure(cam, 0.5, 0.2, 777, { vector: true, fog: 0.03, P: Object.assign(L.deadParams(777), { tilt: 0.42, drop: 0.4, lean: -0.05, reach: -1 }), rot: 0.01 * Math.sin(lt) });
    vignette(0.75, 0.3);
  };

  // ---------------------------------------------------------------- the street, standing still
  const STREET_FIGS = (() => { const r = L.rng(8), o = []; for (let i = 0; i < 46; i++) { const z = 7 + 80 * Math.pow(r(), 1.2); o.push({ x: (r() * 2 - 1) * 6.5, z, seed: 2000 + i }); } return o; })();
  const CARS = [[-4.2, 16, 0.2], [3.6, 27, -0.15], [-3.1, 44, 0.05], [4.4, 63, 0.3], [-1.2, 85, 0.1]];
  shots.street = (lt, dur) => {
    const u = clamp(lt / dur, 0, 1);
    const cam = camFor(lerp(-1.3, 1.1, u), -1.55, lerp(-0.4, 1.4, u), 0.7, 1.35, 0.52);
    skyAndGround(cam, '#0c0f13', '#4a525b', '#30363d', '#0c0d0f');
    g.save(); g.globalAlpha = 0.5;
    L.tile(g, A.cloud, 0, 0, W, cam.cy, lt * 6, 0, Math.max(W, H) / 256, Math.max(W, H) / 256 * 0.4);
    g.restore();
    const items = [];
    // buildings along both sides
    for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 9; i++) {
      const z1 = 4 + i * 13, z2 = z1 + 12, x = side * (8 + (i % 3) * 0.6), h = 9 + 7 * hash(i * 5 + side);
      items.push({ z: z1 + 6, draw: () => {
        const a = L.proj(cam, x, 0, z1), b = L.proj(cam, x, 0, z2), c = L.proj(cam, x, -h, z2), d = L.proj(cam, x, -h, z1);
        if (!a || !b) return;
        const fogA = 1 - Math.exp(-((z1 + z2) / 2 - cam.z) / 55);
        g.fillStyle = `rgb(${8 + 52 * fogA | 0},${9 + 58 * fogA | 0},${11 + 66 * fogA | 0})`;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.fill();
        g.fillStyle = `rgba(0,0,0,${0.45 * (1 - fogA)})`;
        for (let fl = 1; fl < h / 3; fl++) for (let wn = 0; wn < 3; wn++) {
          const wz = z1 + 2 + wn * 3.6, wy = -fl * 3 - 0.4;
          const p1 = L.proj(cam, x, wy, wz), p2 = L.proj(cam, x, wy - 1.4, wz + 1.6);
          if (p1 && p2) { g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p1.y + (p2.y - p1.y) * 0.0); g.lineTo(p2.x, p2.y); g.lineTo(p1.x, p2.y + (p1.y - p2.y) * 0.0 + (p2.y - p1.y)); g.fill(); }
        }
      } });
    }
    for (const [x, z, a] of CARS) items.push({ z, draw: () => {
      const p = L.proj(cam, x, 0, z); if (!p) return;
      const fogA = 1 - Math.exp(-p.d / 55);
      g.save(); g.translate(p.x, p.y); g.rotate(a * 0.2); g.scale(p.k, p.k);
      g.fillStyle = `rgb(${5 + 52 * fogA | 0},${6 + 58 * fogA | 0},${8 + 66 * fogA | 0})`;
      g.beginPath(); g.moveTo(-2.2, -0.25); g.lineTo(-2.1, -0.85); g.lineTo(-1.2, -0.95); g.lineTo(-0.7, -1.45); g.lineTo(0.9, -1.45); g.lineTo(1.5, -0.95); g.lineTo(2.2, -0.85); g.lineTo(2.25, -0.25); g.closePath(); g.fill();
      g.beginPath(); g.arc(-1.4, -0.25, 0.36, 0, TAU); g.arc(1.4, -0.25, 0.36, 0, TAU); g.fill();
      g.restore();
    } });
    for (let i = 0; i < 6; i++) { const z = 10 + i * 16, x = (i % 2 ? 1 : -1) * 6.6; items.push({ z, draw: () => {
      const a = L.proj(cam, x, 0, z), b = L.proj(cam, x, -6, z); if (!a || !b) return;
      const fogA = 1 - Math.exp(-a.d / 55);
      g.strokeStyle = `rgb(${6 + 52 * fogA | 0},${7 + 58 * fogA | 0},${9 + 66 * fogA | 0})`; g.lineWidth = Math.max(1, 0.14 * a.k);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(b.x - Math.sign(x) * 1.2 * a.k, b.y); g.stroke();
      if (i === 4) L.glow(g, b.x - Math.sign(x) * 1.2 * a.k, b.y + 0.1 * a.k, 2.6 * a.k, [200, 210, 190], 0.45 * clamp(0.6 + flick(lt * 1.4, 9), 0, 1));
    } }); }
    for (const f of STREET_FIGS) items.push({ z: f.z, draw: () => figure(cam, f.x, f.z, f.seed, { fogDist: 50 }) });
    for (const fz of [70, 45, 25, 12]) items.push({ z: fz + 0.01, draw: () => fogBand(cam, fz, 2.2, 0.32, lt, A.fog, 0.3) });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();
    vignette(0.65, 0.35);
  };

  // ---------------------------------------------------------------- the crowd starts to hum
  const CROWD = (() => { const r = L.rng(91), o = []; for (let i = 0; i < 140; i++) { const z = 1.6 + 46 * Math.pow(r(), 1.5); o.push({ x: (r() * 2 - 1) * (1.2 + z * 0.7), z, seed: 3000 + i, P: null }); } return o.sort((a, b) => b.z - a.z); })();
  shots.crowd = (lt, dur) => {
    const u = clamp(lt / dur, 0, 1);
    const cam = camFor(0.2, -1.64, lerp(-0.6, 0.9, ease(u)), 0.7, 1.3, 0.55);
    skyAndGround(cam, '#2a3038', '#9aa3aa', '#59626b', '#1a1d21');
    g.save(); g.globalAlpha = 0.55;
    L.tile(g, A.fogWhite, 0, 0, W, H, lt * 14, 0, Math.max(W, H) / 256 * 1.4);
    g.restore();
    const humOn = smooth(0.2, 1.6, lt);
    for (const f of CROWD) {
      if (f.z <= cam.z + 0.3) continue;
      if (!f.P) f.P = L.deadParams(f.seed);
      // the near ones lift their heads a little when the humming starts
      const P = Object.assign({}, f.P, { tilt: f.P.tilt * (1 - 0.35 * humOn) });
      const sway = 0.02 * Math.sin((lt + 0.2) * TAU / 2.5 + 0.3) * humOn + 0.008 * Math.sin(lt * 0.7 + f.seed);
      figure(cam, f.x, f.z, f.seed, { fogDist: 26, fogRGB: [150, 158, 166], rot: sway, P, vector: f.z - cam.z < 5 });
    }
    vignette(0.6, 0.3);
  };

  // ---------------------------------------------------------------- one of them, in profile
  // a gaunt man in profile, facing left; head height about 1 unit
  function profilePath(gg) {
    gg.beginPath();
    gg.moveTo(0.62, 1.6);
    gg.bezierCurveTo(0.44, 1.1, 0.34, 0.85, 0.33, 0.55);
    gg.bezierCurveTo(0.4, 0.4, 0.5, 0.2, 0.45, -0.08);
    gg.bezierCurveTo(0.42, -0.32, 0.26, -0.5, 0.06, -0.54);
    gg.bezierCurveTo(-0.14, -0.57, -0.3, -0.47, -0.37, -0.3);
    gg.quadraticCurveTo(-0.42, -0.18, -0.415, -0.1);
    gg.quadraticCurveTo(-0.44, -0.07, -0.43, -0.04);
    gg.quadraticCurveTo(-0.385, -0.02, -0.39, 0.03);
    gg.quadraticCurveTo(-0.43, 0.1, -0.485, 0.19);
    gg.quadraticCurveTo(-0.5, 0.225, -0.475, 0.235);
    gg.quadraticCurveTo(-0.45, 0.245, -0.425, 0.25);
    gg.quadraticCurveTo(-0.44, 0.28, -0.432, 0.3);
    gg.lineTo(-0.418, 0.315);
    gg.quadraticCurveTo(-0.434, 0.33, -0.425, 0.35);
    gg.quadraticCurveTo(-0.43, 0.39, -0.405, 0.43);
    gg.quadraticCurveTo(-0.37, 0.47, -0.3, 0.465);
    gg.quadraticCurveTo(-0.2, 0.47, -0.14, 0.53);
    gg.quadraticCurveTo(-0.185, 0.6, -0.165, 0.66);
    gg.quadraticCurveTo(-0.14, 0.72, -0.15, 0.8);
    gg.quadraticCurveTo(-0.17, 0.98, -0.32, 1.15);
    gg.bezierCurveTo(-0.55, 1.35, -0.8, 1.45, -1.1, 1.6);
    gg.closePath();
  }
  const PROFILE_HAIR = (() => { const r = L.rng(66), o = []; for (let i = 0; i < 70; i++) { const a = -2.75 + r() * 2.35; o.push({ a, len: 0.12 + r() * 0.55 * (a > -1.6 ? 1 : 0.4), w: 0.0035 + r() * 0.005, ph: r() * 6, c: r() }); } return o; })();
  shots.profile = (lt, dur) => {
    const u = clamp(lt / dur, 0, 1);
    fill('#000');
    const P = portrait();
    reset();
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#2e353d'); gr.addColorStop(0.55, '#7f888f'); gr.addColorStop(1, '#3d444b');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const cam = camFor(0, -1.7, 0, 0.6, 1.2, 0.5);
    for (let i = 0; i < 30; i++) {
      const z = 8 + i * 1.5, x = (hash(i * 9.2) * 2 - 1) * (z * 0.7);
      figure(cam, x, z, 4000 + i, { fogDist: 20, alpha: 0.95 });
    }
    g.save(); g.globalAlpha = 0.4; L.tile(g, A.fogWhite, 0, 0, W, H, lt * 22, 0, Math.max(W, H) / 256 * 1.2); g.restore();
    fit(P ? 0.02 : -0.5, P ? 0.3 : 0.18, P ? 1.6 : 2.6, P ? 3.0 : 1.55, lerp(1.0, 1.1, ease(u)));
    // the throat trembles while it hums
    const tr = reduced ? 0 : 0.0025 * Math.sin(lt * 150) * smooth(0, 0.5, lt);
    g.translate(0, tr);
    g.save();
    g.translate(-0.008, -0.004);
    g.fillStyle = 'rgba(214,222,228,0.9)';
    profilePath(g); g.fill();
    g.restore();
    g.fillStyle = '#040506';
    profilePath(g); g.fill();
    // thin, lank hair; some of it lifting in the wind
    g.strokeStyle = '#040506'; g.lineCap = 'round';
    for (const h of PROFILE_HAIR) {
      const x0 = 0.05 + Math.cos(h.a) * 0.4, y0 = -0.05 + Math.sin(h.a) * 0.47;
      const wv = (Math.sin(lt * 1.8 + h.ph) * 0.03 + L.wob(lt * 1.2 + h.ph, 3) * 0.03) * h.c;
      g.lineWidth = h.w;
      g.beginPath(); g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + 0.08 + wv, y0 + h.len * 0.4, x0 + 0.1 + h.len * 0.25 + wv * 2, y0 + h.len);
      g.stroke();
    }
    // a torn collar
    g.fillStyle = '#040506';
    g.beginPath(); g.moveTo(-0.6, 1.35); for (let i = 0; i <= 10; i++) g.lineTo(-0.6 + i * 0.13, 1.2 + (i % 2) * 0.05 + hash(i) * 0.06); g.lineTo(0.8, 1.7); g.lineTo(-0.6, 1.7); g.fill();
    vignette(0.65, 0.3);
  };

  // ---------------------------------------------------------------- the broadcast
  function tvScreen(sw, sh, lt) {
    const bc = S.broadcast.lines;
    const sg = bufCtx(1, sw, sh);
    sg.setTransform(1, 0, 0, 1, 0, 0);
    const alert = lt < 2.0;
    if (alert) {
      const on = Math.floor(lt * 3) % 2 === 0 || reduced;
      sg.fillStyle = on ? '#6a0b0b' : '#1a0303';
      sg.fillRect(0, 0, sw, sh);
      sg.fillStyle = '#f4e6d0';
      sg.font = `${sh * 0.13}px ${L.FONT_CRT}`;
      sg.textAlign = 'center';
      sg.fillText('EMERGENCY', sw / 2, sh * 0.42);
      sg.fillText('BROADCAST', sw / 2, sh * 0.58);
      sg.font = `${sh * 0.07}px ${L.FONT_CRT}`;
      sg.fillText('STAND BY', sw / 2, sh * 0.78);
    } else {
      sg.fillStyle = '#071021';
      sg.fillRect(0, 0, sw, sh);
      sg.fillStyle = '#b3201b';
      sg.fillRect(0, 0, sw, sh * 0.16);
      sg.fillStyle = '#f4e6d0';
      sg.font = `${sh * 0.085}px ${L.FONT_CRT}`;
      sg.textAlign = 'center';
      sg.fillText('CIVIL EMERGENCY NETWORK', sw / 2, sh * 0.11);
      const at = 64.0 + lt;
      let line = null;
      for (const l of bc) if (at >= l.t - 0.05) line = l;
      if (line) {
        const chars = Math.floor((at - line.t) * 26);
        let left = chars;
        sg.font = `${sh * 0.11}px ${L.FONT_CRT}`;
        line.show.forEach((s, i) => {
          const part = s.slice(0, Math.max(0, left));
          left -= s.length;
          sg.fillText(part, sw / 2, sh * (0.47 + i * 0.14 - (line.show.length - 1) * 0.07));
        });
      }
      // crawl
      sg.fillStyle = '#d8c9a8';
      sg.fillRect(0, sh * 0.86, sw, sh * 0.14);
      sg.fillStyle = '#120d08';
      sg.font = `${sh * 0.075}px ${L.FONT_CRT}`;
      sg.textAlign = 'left';
      const crawl = 'STAY INDOORS • DO NOT OPEN YOUR DOOR • DO NOT ANSWER THEM • KEEP YOUR CHILDREN CLOSE • ';
      const cw = sg.measureText(crawl).width;
      const off = (lt * sw * 0.18) % cw;
      sg.fillText(crawl + crawl + crawl, -off, sh * 0.955);
    }
    // scanlines and snow
    sg.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < sh; y += 3) sg.fillRect(0, y, sw, 1);
    const n = 260;
    for (let i = 0; i < n; i++) {
      const x = hash(i * 1.7 + Math.floor(lt * 24) * 31.1) * sw, y = hash(i * 9.1 + Math.floor(lt * 24) * 7.3) * sh;
      sg.fillStyle = `rgba(255,255,255,${0.08 + 0.12 * hash(i)})`;
      sg.fillRect(x, y, 2 + hash(i * 3) * 6, 1.5);
    }
    if (!reduced && hash(Math.floor(lt * 12)) > 0.8) {
      const y = hash(Math.floor(lt * 12) + 0.5) * sh;
      sg.drawImage(sg.canvas, 0, y, sw, sh * 0.06, (hash(lt) - 0.5) * 30, y, sw, sh * 0.06);
    }
    const vg = sg.createRadialGradient(sw / 2, sh / 2, sh * 0.3, sw / 2, sh / 2, sw * 0.65);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    sg.fillStyle = vg; sg.fillRect(0, 0, sw, sh);
    return sg.canvas;
  }
  const bufCtxs = {};
  function bufCtx(id, w, h) {
    let c = bufCtxs[id];
    if (!c) { c = bufCtxs[id] = L.canvas(w, h).getContext('2d'); }
    if (c.canvas.width !== w || c.canvas.height !== h) { c.canvas.width = w; c.canvas.height = h; }
    return c;
  }

  shots.tv = (lt, dur) => {
    fill('#020304');
    const P = portrait();
    const u = clamp(lt / dur, 0, 1);
    const zoom = P ? lerp(1.7, 1.15, ease(smooth(0.1, 0.9, u))) : lerp(2.0, 1.32, ease(smooth(0.1, 0.9, u)));
    const fx = P ? -265 : lerp(-215, -110, ease(u)), fy = P ? lerp(-255, -160, ease(u)) : lerp(-200, -120, ease(u));
    fit(fx, fy, P ? 900 : 1700, P ? 1400 : 900, zoom);
    const flickK = 0.8 + 0.2 * flick(lt * 1.2, 7) + (lt < 2 ? 0.25 * (Math.floor(lt * 3) % 2 ? -1 : 1) : 0);
    // room: back wall and the cabinet
    g.fillStyle = '#26303a'; g.fillRect(-3000, -2000, 6000, 2200);
    g.fillStyle = '#151a20'; g.fillRect(-3000, 200, 6000, 2000);
    g.fillStyle = '#2b2219'; g.fillRect(-520, 40, 640, 300);
    g.fillStyle = '#1d1711'; g.fillRect(-500, 70, 280, 230); g.fillRect(-200, 70, 280, 230);
    // the tape deck beside the TV
    g.fillStyle = '#1b1918'; g.fillRect(150, -10, 170, 50);
    g.fillStyle = '#d8ccb2'; g.fillRect(172, 0, 90, 22);
    // TV set
    g.fillStyle = '#1a1714';
    g.beginPath(); g.roundRect ? g.roundRect(-480, -430, 560, 470, 26) : g.rect(-480, -430, 560, 470); g.fill();
    g.fillStyle = '#0c0b0a'; g.fillRect(-60, -380, 110, 380);
    for (let i = 0; i < 6; i++) { g.fillStyle = '#2a2622'; g.fillRect(-40, -330 + i * 22, 70, 8); }
    g.fillStyle = '#3a3530'; g.beginPath(); g.arc(-5, -110, 16, 0, TAU); g.fill(); g.beginPath(); g.arc(-5, -60, 16, 0, TAU); g.fill();
    // the screen
    const sx0 = -450, sy0 = -400, sw0 = 370, sh0 = 290;
    const scr = tvScreen(512, 400, lt);
    g.save();
    g.beginPath(); g.roundRect ? g.roundRect(sx0, sy0, sw0, sh0, 30) : g.rect(sx0, sy0, sw0, sh0); g.clip();
    g.globalAlpha = clamp(flickK, 0, 1.2);
    g.drawImage(scr, sx0, sy0, sw0, sh0);
    g.restore();
    // light from the screen on everything
    const m = g.getTransform();
    const scx = m.a * (sx0 + sw0 / 2) + m.e, scy = m.d * (sy0 + sh0 / 2) + m.f;
    const alertCol = lt < 2 ? [255, 120, 110] : [150, 190, 235];
    lightMap(scx, scy, 1500 * m.a, [[0, alertCol.map((c) => c * flickK)], [0.22, alertCol.map((c) => c * 0.75 * flickK)], [0.6, [40 * flickK, 55 * flickK, 75 * flickK]], [1, [6, 8, 11]]]);
    L.glow(g, scx, scy, 330 * m.a, lt < 2 ? [255, 90, 80] : [140, 190, 255], 0.35 * flickK);
    // Dad, from behind, between us and the TV
    g.setTransform(m);
    g.fillStyle = '#020203';
    g.save();
    g.translate(P ? 40 : 230, 470);
    g.scale(560, 560);
    g.beginPath();
    g.moveTo(-0.6, 0.6); g.quadraticCurveTo(-0.55, -0.12, -0.2, -0.2); g.quadraticCurveTo(0, -0.26, 0.2, -0.2); g.quadraticCurveTo(0.55, -0.12, 0.6, 0.6); g.fill();
    g.beginPath(); g.ellipse(0, -0.42, 0.15, 0.19, -0.05, 0, TAU); g.fill();
    g.fillRect(-0.07, -0.3, 0.14, 0.14);
    g.restore();
    // a faint cold rim on his shoulder
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(120,160,210,${0.25 * flickK})`; g.lineWidth = 3;
    g.translate(P ? 40 : 230, 470); g.scale(560, 560); g.lineWidth = 3 / (560 * m.a);
    g.beginPath(); g.moveTo(-0.55, -0.02); g.quadraticCurveTo(-0.5, -0.14, -0.2, -0.2); g.stroke();
    g.beginPath(); g.ellipse(0, -0.42, 0.15, 0.19, -0.05, Math.PI * 0.85, Math.PI * 1.35); g.stroke();
    g.restore();
    vignette(0.7, 0.3);
    return { glitch: lt < 2.2 ? 0.45 : 0.08 + (hash(Math.floor(lt * 8)) > 0.85 ? 0.35 : 0), ca: 1.6 };
  };

  // ---------------------------------------------------------------- the window, lightning
  const BUSTS = [[-215, 330, 250, 0.38, 11], [200, 380, 185, -0.3, 12], [-20, 470, 125, 0.12, 13], [330, 470, 115, 0.45, 14], [-345, 500, 105, -0.32, 15], [90, 520, 95, -0.5, 16]];
  const PRESSED = [[-250, -150, 330, -0.18, 0.12], [215, -70, 290, 0.22, 0.25], [30, 90, 230, 0.05, 0.08]];
  function lightningK(lt, t0) {
    const d = lt - t0;
    if (d < 0) return 0;
    if (reduced) return 0.55 * Math.exp(-d / 0.5) * smooth(0, 0.12, d);
    if (d < 0.07) return 1;
    if (d < 0.14) return 0.25;
    if (d < 0.42) return 0.85 * Math.exp(-(d - 0.14) / 0.35);
    return 0.4 * Math.exp(-(d - 0.42) / 0.5);
  }
  shots.window = (lt) => {
    const P = portrait();
    const flash = lightningK(lt, 85.2 - 83.6);
    fill('#010102');
    fit(0, 0, P ? 1050 : 1900, P ? 1450 : 1000, lerp(1.0, 1.05, lt / 3));
    const ww = 820, wh = 1000;
    const k = flash;
    // outside: the sky lights up
    const gr = g.createLinearGradient(0, -wh / 2, 0, wh / 2);
    gr.addColorStop(0, `rgb(${6 + 225 * k | 0},${8 + 230 * k | 0},${16 + 239 * k | 0})`);
    gr.addColorStop(1, `rgb(${4 + 150 * k | 0},${6 + 160 * k | 0},${12 + 185 * k | 0})`);
    g.fillStyle = gr;
    g.fillRect(-ww / 2, -wh / 2, ww, wh);
    // the ones pressed against the glass
    g.save();
    g.beginPath(); g.rect(-ww / 2, -wh / 2, ww, wh); g.clip();
    g.fillStyle = '#020203'; g.strokeStyle = '#020203';
    for (const [x, y, sz, tilt, seed] of BUSTS) { g.save(); g.translate(x, y); g.scale(sz, sz); L.drawBust(g, seed, tilt); g.restore(); }
    for (const [x, y, sz, rot, curl] of PRESSED) { g.save(); g.translate(x, y); g.rotate(rot); g.scale(sz, sz); L.drawHand(g, curl, 1); g.restore(); }
    g.restore();
    // rain on the glass
    for (let i = 0; i < 140; i++) {
      const x = (hash(i * 1.37) - 0.5) * ww, y0 = (hash(i * 4.1) - 0.5) * wh;
      const sp = 40 + hash(i * 7) * 220, y = ((y0 + lt * sp + wh / 2) % wh) - wh / 2;
      const len = 6 + hash(i * 2.3) * 26;
      g.strokeStyle = `rgba(${150 + 105 * k},${170 + 85 * k},${200 + 55 * k},${0.1 + 0.35 * k})`;
      g.lineWidth = 2 + hash(i) * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y + len); g.stroke();
    }
    // the frame: cross bars and wall
    g.fillStyle = '#020203';
    g.fillRect(-3000, -3000, 6000, 3000 - wh / 2); g.fillRect(-3000, wh / 2, 6000, 3000);
    g.fillRect(-3000, -wh / 2, 3000 - ww / 2, wh); g.fillRect(ww / 2, -wh / 2, 3000, wh);
    g.fillRect(-14, -wh / 2, 28, wh); g.fillRect(-ww / 2, -14, ww, 28);
    g.strokeStyle = '#020203'; g.lineWidth = 36; g.strokeRect(-ww / 2, -wh / 2, ww, wh);
    if (k > 0.01) L.glow(g, 0, 0, 1500, [180, 200, 255], 0.3 * k);
    vignette(0.6, 0.35);
    return { bloom: 0.8 + k * 0.8 };
  };

  // ---------------------------------------------------------------- the hallway
  const HALL_P = Object.assign(L.deadParams(5150), { tilt: 0.5, lean: 0.06, drop: 0.2, reach: -1, stump: -1, hair: 2, cloth: 'shirt' });
  shots.hallway = (lt) => {
    const P = portrait();
    fill('#000');
    // torchlight state: 1 on, 0 off (flicker windows from the score's cue times)
    const t = 86.6 + lt;
    const fl = (a, b) => t >= a && t < b;
    let on = 1;
    if (fl(89.0, 89.5)) on = reduced ? (t < 89.25 ? 1 - (t - 89.0) * 4 : (t - 89.25) * 4) : (hash(Math.floor(t * 30)) > 0.55 ? 0.15 : 0);
    if (fl(91.0, 91.35)) on = reduced ? 0.3 : (hash(Math.floor(t * 30) + 3) > 0.5 ? 0.1 : 0);
    if (fl(89.15, 89.45) && !reduced) on = 0;
    const figure_ = t >= 89.5 && t < 91.2;
    const v = fit(0, 0, P ? 900 : 1800, P ? 1500 : 900, 1);
    void v;
    // corridor geometry: the far door frame is at depth; vanishing point
    const vx = 0, vy = -60;
    const fw = 430, fh = 800;                        // far wall (door wall) size
    const fx0 = vx - fw / 2, fy0 = vy - fh / 2 + 70;
    const nw = 2400, nh = 2200;                      // near frame
    const nx0 = -nw / 2, ny0 = -nh / 2 + 60;
    const quad = (pts, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); };
    quad([[nx0, ny0], [fx0, fy0], [fx0, fy0 + fh], [nx0, ny0 + nh]], '#4a4038');           // left wall
    quad([[nx0 + nw, ny0], [fx0 + fw, fy0], [fx0 + fw, fy0 + fh], [nx0 + nw, ny0 + nh]], '#463d35');
    quad([[nx0, ny0], [nx0 + nw, ny0], [fx0 + fw, fy0], [fx0, fy0]], '#2a2520');           // ceiling
    quad([[nx0, ny0 + nh], [nx0 + nw, ny0 + nh], [fx0 + fw, fy0 + fh], [fx0, fy0 + fh]], '#3a2a1c'); // floor
    // runner rug
    quad([[-360, ny0 + nh], [360, ny0 + nh], [fx0 + fw * 0.68, fy0 + fh], [fx0 + fw * 0.32, fy0 + fh]], '#5a2c24');
    // wallpaper stripes converging
    g.strokeStyle = 'rgba(30,24,18,0.35)'; g.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      const u2 = i / 26;
      g.beginPath(); g.moveTo(nx0 + 0, ny0 + nh * 0 + u2 * 0); g.stroke();
      const zz = Math.pow(u2, 1.6);
      const xl = lerp(nx0, fx0, zz), yt = lerp(ny0, fy0, zz), yb = lerp(ny0 + nh, fy0 + fh, zz);
      g.beginPath(); g.moveTo(xl, yt); g.lineTo(xl, yb); g.stroke();
      const xr = lerp(nx0 + nw, fx0 + fw, zz);
      g.beginPath(); g.moveTo(xr, yt); g.lineTo(xr, yb); g.stroke();
    }
    // side doors
    const sideDoor = (zz, side) => {
      const z1 = zz, z2 = zz + 0.12;
      const X = (z) => side < 0 ? lerp(nx0, fx0, z) : lerp(nx0 + nw, fx0 + fw, z);
      const T = (z) => lerp(ny0, fy0, z), B = (z) => lerp(ny0 + nh, fy0 + fh, z);
      const top1 = lerp(T(z1), B(z1), 0.18), top2 = lerp(T(z2), B(z2), 0.18);
      quad([[X(z1), top1], [X(z2), top2], [X(z2), B(z2)], [X(z1), B(z1)]], '#1c1510');
    };
    sideDoor(0.35, -1); sideDoor(0.55, 1); sideDoor(0.12, 1);
    // a picture hanging crooked
    g.save(); g.translate(lerp(nx0, fx0, 0.5) + 30, lerp(ny0, fy0, 0.5) + 120); g.rotate(0.12); g.fillStyle = '#1a140f'; g.fillRect(-40, -55, 80, 110); g.fillStyle = '#6d6354'; g.fillRect(-30, -45, 60, 90); g.restore();
    // Wren's door at the end, a drawing taped on it
    g.fillStyle = '#6b5a48'; g.fillRect(fx0, fy0, fw, fh);
    g.fillStyle = '#5a4a3a'; g.fillRect(fx0 + 30, fy0 + 30, fw - 60, fh * 0.4); g.fillRect(fx0 + 30, fy0 + fh * 0.5, fw - 60, fh * 0.42);
    g.fillStyle = '#b8a37a'; g.beginPath(); g.arc(fx0 + fw - 40, fy0 + fh * 0.52, 10, 0, TAU); g.fill();
    g.save(); g.translate(vx, fy0 + 150); g.rotate(0.05);
    g.fillStyle = '#ddd4c2'; g.fillRect(-60, -46, 120, 92);
    g.lineWidth = 3.5; g.lineCap = 'round';
    g.fillStyle = '#c4322a'; g.font = `600 26px ${L.FONT_HAND}`; g.textAlign = 'center'; g.fillText('WREN', 0, -18);
    const st = (x, h, col) => { g.strokeStyle = col; g.beginPath(); g.arc(x, 36 - h, 6, 0, TAU); g.moveTo(x, 42 - h); g.lineTo(x, 30); g.moveTo(x - 8, 48 - h); g.lineTo(x + 8, 48 - h); g.moveTo(x, 30); g.lineTo(x - 5, 40); g.moveTo(x, 30); g.lineTo(x + 5, 40); g.stroke(); };
    st(-28, 44, '#b3423a'); st(0, 48, '#36569a'); st(26, 32, '#c79a2a');
    g.fillStyle = 'rgba(10,10,10,0.85)';            // someone has scribbled over Mum
    for (let i = 0; i < 9; i++) { g.save(); g.translate(-28 + Math.sin(i * 2.1) * 6, 6 + i * 3 - 12); g.rotate(i * 0.7); g.fillRect(-10, -1.5, 20, 3); g.restore(); }
    g.restore();
    // the thing at the door, its back to us, listening; its shadow thrown up the door by the torch
    if (figure_) {
      const turn = smooth(90.5, 91.0, t) * 0.25;
      const Pp = Object.assign({}, HALL_P, { tilt: HALL_P.tilt - turn });
      const s2 = fh * 0.97;
      g.save();
      g.translate(vx - 60, fy0 + fh - 30);
      g.scale(s2 * 1.18, s2 * 1.18);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.strokeStyle = 'rgba(0,0,0,0.55)';
      L.drawDead(g, Pp);
      g.restore();
      g.save();
      g.translate(vx - 10, fy0 + fh + 4);
      g.scale(s2, s2);
      g.fillStyle = '#050404'; g.strokeStyle = '#050404';
      L.drawDead(g, Pp);
      g.globalCompositeOperation = 'source-atop';
      const rg = g.createLinearGradient(0, -1.05, 0, -0.62);
      rg.addColorStop(0, 'rgba(150,132,112,0.55)'); rg.addColorStop(1, 'rgba(150,132,112,0)');
      g.fillStyle = rg; g.fillRect(-0.6, -1.2, 1.2, 0.6);
      g.restore();
    }
    // torchlight
    const sway = reduced ? [0, 0] : [L.wob(t * 1.3, 4) * 40, L.wob(t * 1.1, 8) * 25];
    const aimX = lerp(-520, vx, smooth(87.0, 88.4, t)) + sway[0], aimY = lerp(30, fy0 + fh * 0.4, smooth(87.0, 88.4, t)) + sway[1];
    const m = g.getTransform();
    const ax = m.a * aimX + m.e, ay = m.d * aimY + m.f;
    const k = on * (0.95 + 0.05 * flick(t, 3));
    lightMap(ax, ay, 560 * m.a, [[0, [255 * k, 238 * k, 205 * k]], [0.35, [190 * k, 170 * k, 140 * k]], [0.7, [44 * k + 12, 38 * k + 11, 32 * k + 10]], [1, [13, 12, 11]]]);
    if (k > 0.05) {
      // haze in the beam
      reset();
      g.globalCompositeOperation = 'lighter';
      const bx = W * 0.62, by = H * 1.05;
      const gr = g.createLinearGradient(bx, by, ax, ay);
      gr.addColorStop(0, `rgba(255,240,210,${0.14 * k})`); gr.addColorStop(1, 'rgba(255,240,210,0)');
      g.fillStyle = gr;
      const nx = -(ay - by), ny = ax - bx, nl = Math.hypot(nx, ny) || 1;
      const wN = 40, wF = 260 * m.a;
      g.beginPath();
      g.moveTo(bx + nx / nl * wN, by + ny / nl * wN); g.lineTo(ax + nx / nl * wF, ay + ny / nl * wF);
      g.lineTo(ax - nx / nl * wF, ay - ny / nl * wF); g.lineTo(bx - nx / nl * wN, by - ny / nl * wN);
      g.fill();
      dust(ax - 300 * m.a, ay - 200 * m.a, ax + 300 * m.a, ay + 300 * m.a, 60, t, 4, 1.4 * m.a, 0.35 * k);
      g.globalCompositeOperation = 'source-over';
    }
    vignette(0.8, 0.25);
    return { bloom: 0.7 };
  };

  // ---------------------------------------------------------------- from above
  const RINGS = (() => {
    const o = [];
    let id = 0;
    for (const r of [13.5, 17, 20.5, 24, 28, 32.5, 37.5, 43]) {
      const n = Math.floor(TAU * r / 1.05);
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + hash(id) * 0.05; o.push({ x: Math.cos(a) * r + (hash(id * 3) - 0.5) * 0.5, y: Math.sin(a) * r * 1.0 + (hash(id * 5) - 0.5) * 0.5, id: id++ }); }
    }
    return o;
  })();
  const STREAMS = (() => { const o = []; for (let s = 0; s < 7; s++) for (let i = 0; i < 26; i++) o.push({ s, i, off: hash(s * 100 + i) }); return o; })();
  function topDead(x, y, ang, s, a) {
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
    g.globalAlpha = a;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(0.28, 0.2, 0.32, 0.18, 0.4, 0, TAU); g.fill();
    g.fillStyle = '#08090a';
    g.beginPath(); g.ellipse(0, 0, 0.27, 0.15, 0, 0, TAU); g.fill();
    g.fillStyle = '#121315';
    g.beginPath(); g.arc(0.03, -0.01, 0.11, 0, TAU); g.fill();
    g.restore();
  }
  shots.aerial = (lt, dur) => {
    const u = clamp(lt / dur, 0, 1);
    fill('#0b0d0c');
    const P = portrait();
    const span = P ? 66 : 104;
    const scale = Math.max(W, H) / span * lerp(1.0, 1.3, ease(u));
    reset();
    g.translate(W / 2, H / 2);
    g.rotate(lerp(-0.06, 0.1, u));
    g.scale(scale, scale);
    // frost-grey field under the moon
    g.fillStyle = '#3a4140'; g.fillRect(-120, -120, 240, 240);
    L.tile(g, A.groundLight, -120, -120, 240, 240, 0, 0, 0.18);
    g.fillStyle = 'rgba(10,14,14,0.25)'; g.fillRect(-120, -120, 240, 240);
    // the track to the road
    g.strokeStyle = 'rgba(25,24,20,0.22)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(0, 5); g.bezierCurveTo(4, 20, -10, 35, -4, 80); g.stroke();
    // trees and their shadows
    for (const [x, y, r] of [[-24, -11, 5], [19, -18, 6], [28, 15, 4.5], [-16, 24, 5.5], [-40, 30, 6], [42, -30, 5]]) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(x + 2.5, y + 2, r * 0.9, r * 0.75, 0.4, 0, TAU); g.fill();
      g.strokeStyle = '#090a0a'; g.lineCap = 'round';
      for (let i = 0; i < 11; i++) { const a = i / 11 * TAU + hash(x + i); g.lineWidth = 0.35; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); g.lineWidth = 0.15; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); g.lineTo(x + Math.cos(a + 0.4) * r * 1.1, y + Math.sin(a + 0.4) * r * 1.1); g.stroke(); }
    }
    // lamplight spilling from the windows onto the yard
    g.globalCompositeOperation = 'lighter';
    for (const [x, y] of [[-8.5, -1.5], [-3, 5.6], [3.5, 5.6]]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, 7);
      gr.addColorStop(0, 'rgba(255,160,80,0.4)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = gr; g.fillRect(x - 8, y - 8, 16, 16);
    }
    g.globalCompositeOperation = 'source-over';
    // the dead, ring on ring, facing the house; more coming in from the dark
    for (const d of RINGS) {
      const ang = Math.atan2(-d.y, -d.x) + Math.PI / 2;
      topDead(d.x, d.y, ang + 0.05 * Math.sin(lt * 0.9 + d.id), 1, 1);
    }
    for (const st of STREAMS) {
      const a0 = st.s / 7 * TAU + 0.4, along = ((st.i + st.off) / 26 + lt * 0.03) % 1;
      const r = lerp(100, 47, along), a = a0 + along * 0.9;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      topDead(x, y, Math.atan2(-y, -x) + Math.PI / 2, 1, clamp(along * 4, 0, 1));
    }
    // the house: two roof planes, a ridge, a chimney, the porch roof
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-6.2, -3.6, 15, 10);
    g.fillStyle = '#1c1d1f'; g.fillRect(-7.4, -4.8, 14.8, 4.8);
    g.fillStyle = '#121314'; g.fillRect(-7.4, 0, 14.8, 4.8);
    g.fillStyle = '#0c0d0e'; g.fillRect(-7.4, 4.8, 14.8, 1.6);
    g.strokeStyle = '#2a2b2d'; g.lineWidth = 0.18; g.beginPath(); g.moveTo(-7.4, 0); g.lineTo(7.4, 0); g.stroke();
    g.fillStyle = '#0a0a0b'; g.fillRect(3.6, -3.4, 1.1, 1.3);
    // mist drifting over the field
    reset();
    g.globalAlpha = 0.3;
    L.tile(g, A.fog, 0, 0, W, H, lt * 30, lt * 12, Math.max(W, H) / 256 * 1.4);
    g.globalAlpha = 1;
    lightMap(W / 2, H / 2, Math.max(W, H) * 0.8, [[0, [235, 228, 215]], [0.5, [170, 178, 185]], [1, [60, 66, 74]]]);
    vignette(0.8, 0.22);
  };

  // ---------------------------------------------------------------- the montage
  shots.mdoor = (lt) => {
    fill('#000');
    const P = portrait();
    const hits = [0, 0.09, 0.31];
    let jx = 0, jy = 0, bang = 0;
    for (const h of hits) { const d = lt - h; if (d >= 0) { const e = Math.exp(-d / 0.08); bang = Math.max(bang, e); jx += (reduced ? 0.25 : 1) * e * 12 * Math.sin(d * 90 + h * 10); jy += (reduced ? 0.25 : 1) * e * 6 * Math.cos(d * 70); } }
    fit(0, 30, P ? 1000 : 1800, P ? 1500 : 1000, 1.06);
    g.fillStyle = '#0a0908'; g.fillRect(-3000, -3000, 6000, 6000);
    g.translate(jx, jy);
    // cold light leaking through the gaps around the door
    const leak = 0.75 + 0.25 * bang;
    g.fillStyle = `rgba(170,195,235,${leak})`;
    g.fillRect(-258, -462, 516, 6); g.fillRect(-258, -462, 6, 924); g.fillRect(252, -462, 6, 924);
    g.fillRect(-258, 448, 516, 14);
    // something shifting its weight outside, blocking the light under the door
    g.fillStyle = '#050505';
    for (const [x, w] of [[-150 + 20 * Math.sin(lt * 7), 70], [30 - 15 * Math.sin(lt * 5), 80], [160, 60]]) g.fillRect(x, 446, w, 18);
    g.fillStyle = '#21180f'; g.fillRect(-252, -456, 504, 904);
    g.fillStyle = '#18110b'; for (const [x, y, w, h] of [[-205, -405, 180, 370], [25, -405, 180, 370], [-205, 25, 180, 370], [25, 25, 180, 370]]) g.fillRect(x, y, w, h);
    g.fillStyle = '#5a4630'; g.beginPath(); g.arc(200, 20, 12, 0, TAU); g.fill();
    for (const [a, y] of [[-0.16, -250], [0.11, 10], [-0.07, 260]]) {
      g.save(); g.translate(0, y); g.rotate(a);
      g.fillStyle = '#3a2a1b'; g.fillRect(-400, -46, 800, 92);
      g.fillStyle = 'rgba(255,225,190,0.1)'; g.fillRect(-400, -46, 800, 5);
      g.fillStyle = '#0d0907'; for (const nx of [-330, 330]) { g.beginPath(); g.arc(nx, -18, 6, 0, TAU); g.arc(nx, 18, 6, 0, TAU); g.fill(); }
      g.restore();
    }
    const m = g.getTransform();
    L.glow(g, m.e, m.d * 455 + m.f, 380 * m.a, [160, 190, 240], 0.35 * leak);
    lightMap(m.e, m.f, Math.max(W, H) * 0.75, [[0, [215, 205, 195]], [1, [34, 32, 34]]]);
    reset();
    dust(0, 0, W, H * 0.75, 90, lt * 30, 7, 1.2, 0.5 * (0.4 + bang), '220,210,190');
    vignette(0.7, 0.3);
  };

  const MH = (() => { const r = L.rng(17), o = []; for (let i = 0; i < 26; i++) { const z = 5 + 26 * Math.pow(r(), 1.2); o.push({ x: (r() * 2 - 1) * (1 + z * 0.65), z, seed: 6000 + i, P: L.deadParams(6000 + i) }); } return o.sort((a, b) => b.z - a.z); })();
  shots.mheads = (lt) => {
    const cam = camFor(0, -1.6, 0, 0.7, 1.3, 0.48);
    skyAndGround(cam, '#0d1116', '#56616b', '#38414a', '#0b0d0f');
    const snap = reduced ? smooth(0.0, 0.35, lt) : (lt > 0.02 ? 1 : 0);
    for (const f of MH) {
      const P = Object.assign({}, f.P, { tilt: lerp(f.P.tilt * 0.3, 0.9, snap), drop: f.P.drop * 0.5 });
      figure(cam, f.x, f.z, f.seed, { vector: true, fogDist: 30, fogRGB: [86, 97, 107], P });
    }
    g.save(); g.globalAlpha = 0.35; L.tile(g, A.fog, 0, cam.cy - H * 0.2, W, H * 0.5, lt * 40, 0, Math.max(W, H) / 256 * 1.2); g.restore();
    vignette(0.7, 0.3);
  };

  shots.mhand = (lt) => {
    fill('#000');
    const P = portrait();
    fit(0, 0, P ? 1000 : 1800, P ? 1400 : 1000, lerp(1.08, 1.2, lt / 0.8));
    g.fillStyle = 'rgb(96,116,150)'; g.fillRect(-2000, -2000, 4000, 4000);
    const boards = [[-470, 0.02], [-160, -0.015], [170, 0.02], [470, -0.01]];
    for (const [y, a] of boards) {
      g.save(); g.translate(0, y); g.rotate(a);
      g.fillStyle = '#1a120b'; g.fillRect(-2000, -118, 4000, 236);
      g.fillStyle = 'rgba(150,170,210,0.22)'; g.fillRect(-2000, 114, 4000, 4);
      g.restore();
    }
    // a hand pushes in through the gap and gropes for the edge of a board
    const push = L.easeOut(clamp(lt / 0.45, 0, 1));
    const curl = 0.15 + 0.5 * smooth(0.35, 0.75, lt);
    const sz = lerp(260, 430, push);
    const drawArm = (col) => {
      g.fillStyle = col; g.strokeStyle = col;
      g.save();
      g.translate(lerp(-140, 40, push), 0);
      g.rotate(-1.35);
      g.beginPath(); g.moveTo(-0.13 * sz, 0.6 * sz); g.lineTo(-0.2 * sz, 2.6 * sz); g.lineTo(0.22 * sz, 2.6 * sz); g.lineTo(0.13 * sz, 0.6 * sz); g.fill();
      g.scale(sz, sz);
      L.drawHand(g, curl, 1.1);
      g.restore();
    };
    g.save(); g.translate(-6, -6); drawArm('rgba(170,190,225,0.55)'); g.restore();
    drawArm('#0b0b0c');
    vignette(0.75, 0.25);
  };

  function eyesInDark(cx, cy, sz, a, open, wide, red) {
    // two eyes catching a red light from below; everything else stays dark
    for (const s2 of [-1, 1]) {
      const ex = cx + s2 * sz * 0.95, ey = cy;
      if (open > 0.1) {
        g.fillStyle = red ? `rgba(150,70,60,${0.5 * a})` : `rgba(170,165,160,${0.5 * a})`;
        g.beginPath(); g.ellipse(ex, ey, sz * 0.42, sz * (0.16 + 0.1 * wide) * open, 0, 0, TAU); g.fill();
        g.fillStyle = '#000';
        g.beginPath(); g.arc(ex + s2 * sz * 0.03, ey + sz * 0.01, sz * 0.17, 0, TAU); g.fill();
        g.fillStyle = red ? `rgba(255,140,120,${0.95 * a})` : `rgba(255,255,255,${0.95 * a})`;
        g.beginPath(); g.arc(ex + sz * 0.09, ey + sz * 0.07, sz * 0.045, 0, TAU); g.fill();
      } else {
        g.strokeStyle = `rgba(110,40,32,${0.5 * a})`; g.lineWidth = sz * 0.04;
        g.beginPath(); g.moveTo(ex - sz * 0.36, ey); g.quadraticCurveTo(ex, ey + sz * 0.1, ex + sz * 0.36, ey); g.stroke();
      }
    }
    // the faintest light on the lower lids, the nose, the cheeks
    const gr = g.createRadialGradient(cx, cy + sz * 1.6, sz * 0.2, cx, cy + sz * 0.6, sz * 2.4);
    gr.addColorStop(0, `rgba(120,24,16,${0.22 * a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(cx, cy + sz * 0.9, sz * 2.0, sz * 1.6, 0, 0, TAU); g.fill();
    g.strokeStyle = `rgba(150,40,30,${0.35 * a})`; g.lineWidth = sz * 0.035;
    g.beginPath(); g.moveTo(cx - sz * 0.05, cy + sz * 0.45); g.quadraticCurveTo(cx + sz * 0.12, cy + sz * 0.62, cx + sz * 0.02, cy + sz * 0.72); g.stroke();
  }
  shots.mwren = (lt) => {
    fill('#000');
    const P = portrait();
    fit(0, 0, P ? 900 : 1700, P ? 1400 : 950, lerp(1.0, 1.06, lt / 0.8));
    g.fillStyle = '#080605';
    for (let i = -6; i <= 6; i++) g.fillRect(i * 150 - 40, -700, 80, 330);
    g.fillStyle = 'rgba(60,40,30,0.25)';
    for (let i = -6; i <= 6; i++) g.fillRect(i * 150 - 40, -372, 80, 4);
    eyesInDark(0, -40, 110, 1, 1, 1, true);
    const m = g.getTransform();
    L.glow(g, m.a * 40 + m.e, m.d * 360 + m.f, 70 * m.a, [255, 50, 30], 0.8);
    L.glow(g, m.a * 40 + m.e, m.d * 360 + m.f, 320 * m.a, [255, 30, 20], 0.18);
    vignette(0.7, 0.25);
  };

  shots.mtorch = (lt) => {
    fill('#000');
    const P = portrait();
    fit(0, 0, P ? 1000 : 1900, P ? 1400 : 1000, 1);
    L.tile(g, A.wood, -3000, 120, 6000, 3000, 0, 120, 3.0, 0.5);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-3000, 120, 6000, 3000);
    g.fillStyle = '#16110c'; g.fillRect(-3000, -3000, 6000, 3120);
    const legs = [-780, -540, -310, 260, 480, 700, -60];
    for (const [i, x] of legs.entries()) {
      const s2 = 0.85 + 0.35 * hash(i * 3);
      for (const [dx, w] of [[0, 46], [72, 42]]) {
        const gr = g.createLinearGradient(x + dx * s2 - w * s2 / 2, 0, x + dx * s2 + w * s2 / 2, 0);
        gr.addColorStop(0, '#2c2824'); gr.addColorStop(0.5, '#6e675e'); gr.addColorStop(1, '#2a2622');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x + dx * s2 - w * s2 / 2, -900); g.lineTo(x + dx * s2 + w * s2 / 2, -900);
        g.lineTo(x + dx * s2 + w * s2 * 0.38, 105); g.lineTo(x + dx * s2 - w * s2 * 0.38, 105); g.fill();
        g.fillStyle = '#4d463f';
        g.beginPath(); g.ellipse(x + dx * s2 + 10, 118, 52 * s2, 16 * s2, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(20,10,8,0.6)';
        g.fillRect(x + dx * s2 - w * s2 * 0.3, -240 + hash(i + dx) * 200, w * s2 * 0.5, 40);
      }
    }
    const ang = (reduced ? 0.8 : 3.4) * lt + 0.5;
    const dir = Math.cos(ang);
    g.save(); g.translate(0, 150); g.rotate(dir * 0.15);
    g.fillStyle = '#1a1a1c'; g.fillRect(-70, -24, 140, 48);
    g.fillStyle = '#e8e4d8'; g.fillRect(dir > 0 ? 60 : -76, -26, 16, 52);
    g.restore();
    const m = g.getTransform();
    const tx = m.a * (dir * 560) + m.e, ty = m.d * 40 + m.f;
    lightMap(tx, ty, 720 * m.a, [[0, [255, 240, 210]], [0.35, [170, 150, 120]], [0.75, [30, 26, 22]], [1, [5, 5, 6]]]);
    reset();
    g.globalCompositeOperation = 'lighter';
    const bx = m.a * (dir * 70) + m.e, by = m.d * 150 + m.f;
    const gr = g.createLinearGradient(bx, by, tx, ty);
    gr.addColorStop(0, 'rgba(255,240,210,0.3)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(bx, by - 10); g.lineTo(tx, ty - 260 * m.a); g.lineTo(tx, ty + 160 * m.a); g.lineTo(bx, by + 10); g.fill();
    g.globalCompositeOperation = 'source-over';
    vignette(0.7, 0.3);
  };

  const MF = (() => { const r = L.rng(29), o = []; for (let i = 0; i < 90; i++) { const z = 9 + 14 * Math.pow(r(), 0.7); o.push({ x: (r() * 2 - 1) * (2 + (z - 9) * 0.8), z, seed: 7000 + i }); } return o.sort((a, b) => b.z - a.z); })();
  shots.mfield = (lt) => {
    const flash = lightningK(lt, 104.85 - 104.8);
    const cam = camFor(0, -1.9, 0, 0.7, 1.3, 0.5);
    const k = flash;
    skyAndGround(cam, `rgb(${10 + 210 * k | 0},${12 + 215 * k | 0},${18 + 230 * k | 0})`, `rgb(${30 + 180 * k | 0},${34 + 185 * k | 0},${40 + 190 * k | 0})`, `rgb(${16 + 60 * k | 0},${18 + 64 * k | 0},${22 + 70 * k | 0})`, '#050505');
    // the house close, its porch
    const P1 = L.proj(cam, -9, 0, 24), P2 = L.proj(cam, 9, -7, 24);
    g.fillStyle = '#040404';
    g.fillRect(P1.x, P2.y, P2.x - P1.x, P1.y - P2.y);
    const r1 = L.proj(cam, -10, -6.9, 24), r2 = L.proj(cam, 0, -11.5, 24), r3 = L.proj(cam, 10, -6.9, 24);
    g.beginPath(); g.moveTo(r1.x, r1.y); g.lineTo(r2.x, r2.y); g.lineTo(r3.x, r3.y); g.fill();
    const w1 = L.proj(cam, -3.9, -5.6, 24), w2 = L.proj(cam, -2.5, -3.7, 24);
    g.fillStyle = `rgb(${255 * (0.6 + 0.4 * k) | 0},${170 * (0.6 + 0.4 * k) | 0},90)`;
    g.fillRect(w1.x, w1.y, w2.x - w1.x, w2.y - w1.y);
    for (const f of MF) figure(cam, f.x, f.z, f.seed, { fog: 0.05 + 0.25 * (1 - k) * 0.3, fogDist: 40 });
    vignette(0.65, 0.3);
    return { bloom: 0.7 + k };
  };

  // ---------------------------------------------------------------- the red light under the blanket
  shots.led = (lt, dur) => {
    fill('#000');
    const P = portrait();
    const u = clamp(lt / dur, 0, 1);
    fit(0, 40, P ? 800 : 1500, P ? 1300 : 840, lerp(1.0, 1.12, ease(u)));
    const come = smooth(0.2, 1.2, lt);
    const ledA = come * (0.92 + 0.08 * Math.sin(lt * 3));
    // the blanket around her: folds catching a little red
    g.strokeStyle = `rgba(110,26,18,${0.14 * ledA})`; g.lineWidth = 4;
    for (const [x0, y0, x1, y1, cx, cy] of [[-520, -420, -240, 220, -470, -60], [520, -420, 250, 230, 470, -40], [-300, -470, 300, -470, 0, -560]]) { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke(); }
    const blink = lt > 3.0 && lt < 3.15 ? 0 : 1;
    eyesInDark(0, -70, 88, ledA, blink, 0.3, true);
    // the deck held to her chest: its top edge in red, her fingers around it
    g.strokeStyle = `rgba(170,34,22,${0.55 * ledA})`;
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(-210, 230); g.lineTo(210, 230); g.stroke();
    g.strokeStyle = `rgba(120,24,16,${0.35 * ledA})`;
    g.beginPath(); g.moveTo(-210, 230); g.lineTo(-215, 380); g.moveTo(210, 230); g.lineTo(215, 380); g.stroke();
    for (const s2 of [-1, 1]) for (let i = 0; i < 4; i++) {
      const y = 250 + i * 32;
      g.fillStyle = '#000';
      g.beginPath(); g.ellipse(s2 * 214, y, 26, 15, 0, 0, TAU); g.fill();
      g.strokeStyle = `rgba(190,45,30,${0.4 * ledA})`; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(s2 * 214, y, 26, 15, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }
    g.fillStyle = '#ff2a12';
    g.beginPath(); g.arc(120, 250, 7, 0, TAU); g.fill();
    const m = g.getTransform();
    L.glow(g, m.a * 120 + m.e, m.d * 250 + m.f, 32 * m.a, [255, 60, 40], ledA);
    L.glow(g, m.a * 120 + m.e, m.d * 250 + m.f, 300 * m.a, [255, 30, 20], 0.22 * ledA);
    vignette(0.6, 0.3);
    return { bloom: 0.9 };
  };

  // ---------------------------------------------------------------- the ending, through the boards
  const FINAL = (() => {
    const r = L.rng(2718), o = [];
    for (let i = 0; i < 420; i++) {
      const z = 5 + 66 * Math.pow(r(), 1.5);
      o.push({ x: (r() * 2 - 1) * (2 + z * 0.66), z, seed: 8000 + i });
    }
    return o.sort((a, b) => b.z - a.z);
  })();
  shots.final = (lt, dur) => {
    const t = 113.9 + lt;
    const P = portrait();
    const u = clamp(lt / dur, 0, 1);
    const moon = 0.3 + 0.7 * smooth(116.5, 121.0, t);
    const eyesOpen = smooth(127.25, 127.45, t);
    const swayAmt = 1 - smooth(127.2, 127.6, t);
    const sway = 0.05 * Math.sin((t - 114.6) * TAU / 3.0) * swayAmt * smooth(114.4, 115.6, t);
    // the field below the window, seen from upstairs; they look up at us
    const cam = camFor(0, -4.4, lerp(-2.4, -1.9, ease(u)), 0.78, 1.45, P ? 0.24 : 0.2);
    cam.f *= lerp(1.0, 1.1, ease(u));
    const mk = moon;
    skyAndGround(cam, `rgb(${5 + 8 * mk | 0},${6 + 10 * mk | 0},${10 + 16 * mk | 0})`, `rgb(${24 + 30 * mk | 0},${28 + 36 * mk | 0},${36 + 44 * mk | 0})`,
      `rgb(${26 + 30 * mk | 0},${30 + 36 * mk | 0},${36 + 42 * mk | 0})`, `rgb(${10 + 14 * mk | 0},${12 + 16 * mk | 0},${15 + 20 * mk | 0})`);
    const tl = L.proj(cam, 0, 0, 220);
    if (tl) { const th = 22 * tl.k; g.save(); g.globalAlpha = 0.9; L.tile(g, A.treeLine, 0, tl.y - th, W, th, 0, 0, th * 6.4 / 1024, th / 160); g.restore(); }
    for (const fz of [60, 40]) fogBand(cam, fz, 0.9, 0.2 + 0.12 * mk, lt, A.fog, 0.25);
    for (const f of FINAL) figure(cam, f.x, f.z, f.seed, { fogDist: 50, rot: sway, face: 0.8 * mk, eyes: eyesOpen });
    fogBand(cam, 16, 0.7, 0.12 + 0.08 * mk, lt, A.fog, 0.25);
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.4 * (1 - mk * 0.6);
    L.tile(g, A.cloudShadow, 0, cam.cy, W, H - cam.cy, lt * 30, 0, Math.max(W, H) / 256 * 1.6, Math.max(W, H) / 256 * 0.6);
    g.restore();
    // the room: the window and its boards, pushing in toward the opening
    const push = lerp(1.0, 1.75, ease(u));
    fit(0, 0, P ? 1000 : 1900, P ? 1500 : 1000, push);
    const ww = P ? 820 : 1300, wh = P ? 1300 : 860;
    g.fillStyle = '#040302';
    g.fillRect(-6000, -6000, 12000, 6000 - wh / 2); g.fillRect(-6000, wh / 2, 12000, 6000);
    g.fillRect(-6000, -wh / 2, 6000 - ww / 2, wh); g.fillRect(ww / 2, -wh / 2, 6000, wh);
    g.strokeStyle = '#0c0907'; g.lineWidth = 46; g.strokeRect(-ww / 2, -wh / 2, ww, wh);
    const board = (x, y, len, h, a) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = '#100b08'; g.fillRect(-len / 2, -h / 2, len, h);
      g.fillStyle = `rgba(150,170,210,${0.08 + 0.22 * mk})`; g.fillRect(-len / 2, -h / 2, len, 3);
      g.fillStyle = `rgba(150,170,210,${0.04 + 0.08 * mk})`; g.fillRect(-len / 2, h / 2 - 2, len, 2);
      g.fillStyle = '#030202'; for (const nx of [-len / 2 + 40, len / 2 - 40]) { g.beginPath(); g.arc(nx, 0, 7, 0, TAU); g.fill(); }
      g.restore();
    };
    board(0, -wh / 2 + 70, ww + 140, 150, -0.025);
    board(0, wh / 2 - 40, ww + 140, 110, 0.02);
    if (P) {
      board(0, -wh / 2 + 250, ww + 140, 120, 0.06);
      board(-ww / 2 + 120, 120, wh * 0.62, 110, 1.36);
    } else {
      board(-ww / 2 + 210, 0, wh * 0.95, 120, 1.25);
      board(ww / 2 - 230, 30, wh * 0.9, 110, -1.32);
    }
    vignette(0.72, 0.3);
    return { bloom: 0.6 + 0.4 * eyesOpen };
  };

  // ---------------------------------------------------------------- type
  function titleText(size, alpha, spacingEm = 0.3) {
    g.font = `600 ${size}px ${L.FONT_SERIF}`;
    g.fillStyle = `rgba(234,226,210,${alpha})`;
    g.textBaseline = 'middle';
    L.spaced(g, 'CRADLESONG', 0, 0, size * spacingEm);
    g.textBaseline = 'alphabetic';
  }
  function titleSize(frac = 0.84, maxH = 0.17) {
    let size = Math.min(H * maxH, W * 0.11);
    g.font = `600 ${size}px ${L.FONT_SERIF}`;
    const w = L.spaced(g, 'CRADLESONG', 0, 0, size * 0.3, 'center', false);
    if (w > W * frac) size *= (W * frac) / w;
    return size;
  }
  shots.title = (lt, dur) => {
    fill('#000');
    const size = titleSize();
    const a = smooth(0, 0.05, lt) * (1 - smooth(dur - 1.3, dur - 0.1, lt));
    reset();
    g.translate(W / 2, H / 2);
    const sc = lerp(1.0, 1.035, lt / dur);
    g.scale(sc, sc);
    if (!reduced && lt < 0.4) {     // the impact smears it for a moment
      const k = 1 - lt / 0.4;
      for (let i = 1; i <= 4; i++) {
        g.save(); g.scale(1 + 0.03 * i * k, 1 + 0.03 * i * k);
        titleText(size, 0.12 * k * a);
        g.restore();
      }
    }
    titleText(size, a * (0.92 + 0.08 * flick(lt * 0.5, 6)));
    // a hairline under it
    g.fillStyle = `rgba(150,40,32,${0.6 * a})`;
    const lw = size * 2.2 * smooth(0.3, 2.2, lt);
    g.fillRect(-lw / 2, size * 0.75, lw, Math.max(1, size * 0.02));
    return { flash: reduced ? 0 : 0.5 * Math.exp(-lt / 0.07), bloom: 0.8 };
  };
  shots.endcard = (lt, dur) => {
    fill('#000');
    const a = smooth(0.3, 1.3, lt) * (1 - smooth(dur - 1.2, dur - 0.1, lt));
    const size = titleSize(0.62, 0.085);
    reset();
    g.translate(W / 2, H * 0.44);
    titleText(size, a * 0.9);
    g.font = `500 ${size * 0.26}px ${L.FONT_SERIF}`;
    g.fillStyle = `rgba(200,190,175,${a * 0.75})`;
    L.spaced(g, 'A SURVIVAL HORROR GAME', 0, size * 1.25, size * 0.09);
    g.font = `600 ${size * 0.34}px ${L.FONT_SERIF}`;
    g.fillStyle = `rgba(180,48,38,${a * 0.9})`;
    L.spaced(g, 'COMING 2027', 0, size * 1.95, size * 0.12);
  };

  shots.card = (lt, dur, sh) => {
    fill('#000');
    const lines = sh.lines;
    const a = smooth(0.05, 0.55, lt) * (1 - smooth(dur - 0.5, dur - 0.05, lt));
    reset();
    g.translate(W / 2, H / 2);
    const sc = lerp(1.0, 1.03, lt / dur);
    g.scale(sc, sc);
    const big = Math.min(H * 0.075, W * 0.06);
    const small = big * 0.55;
    const n = lines.length;
    const fits = (txt, sz, sp) => { g.font = `600 ${sz}px ${L.FONT_SERIF}`; const w = L.spaced(g, txt, 0, 0, sz * sp, 'center', false); return w > W * 0.86 ? sz * (W * 0.86) / w : sz; };
    if (n === 1) {
      const s = fits(lines[0], big, 0.22);
      g.font = `600 ${s}px ${L.FONT_SERIF}`;
      g.fillStyle = `rgba(232,224,208,${a})`;
      g.textBaseline = 'middle';
      L.spaced(g, lines[0], 0, 0, s * 0.22);
    } else {
      const s1 = fits(lines[0], small, 0.35), s2 = fits(lines[1], big, 0.18);
      g.textBaseline = 'middle';
      g.font = `500 ${s1}px ${L.FONT_SERIF}`;
      g.fillStyle = `rgba(190,182,168,${a * smooth(0.05, 0.5, lt)})`;
      L.spaced(g, lines[0], 0, -s2 * 0.75, s1 * 0.35);
      const a2 = a * smooth(0.55, 1.1, lt);
      g.font = `600 ${s2}px ${L.FONT_SERIF}`;
      g.fillStyle = `rgba(234,226,210,${a2})`;
      L.spaced(g, lines[1], 0, s2 * 0.45, s2 * 0.18);
    }
    g.textBaseline = 'alphabetic';
  };

  // ---------------------------------------------------------------- overlays
  function subtitles(t) {
    for (const s of S.subs) {
      if (t < s.t0 - 0.2 || t > s.t1 + 0.2) continue;
      const a = smooth(s.t0 - 0.12, s.t0 + 0.12, t) * (1 - smooth(s.t1 - 0.12, s.t1 + 0.12, t));
      if (a <= 0) continue;
      reset();
      const size = Math.max(14, Math.min(H * 0.045, W * 0.042));
      g.font = `italic 500 ${size * 1.12}px ${L.FONT_SERIF}`;
      g.textAlign = 'center';
      const y = H - Math.max(size * 1.6, H * 0.085);
      g.fillStyle = `rgba(0,0,0,${0.6 * a})`;
      g.fillText(s.text, W / 2 + 1.5, y + 1.5);
      g.fillStyle = `rgba(240,232,214,${a})`;
      g.fillText(s.text, W / 2, y);
    }
  }
  function dayStamp(t) {
    const a = smooth(9.0, 9.6, t) * (1 - smooth(13.0, 13.6, t));
    if (a <= 0) return;
    reset();
    const size = Math.max(12, Math.min(H * 0.032, W * 0.03));
    g.font = `600 ${size}px ${L.FONT_SERIF}`;
    g.fillStyle = `rgba(232,224,208,${0.85 * a})`;
    L.spaced(g, 'DAY 41', Math.max(size * 2, W * 0.06), H - Math.max(size * 2.2, H * 0.08), size * 0.4, 'left');
  }

  // ---------------------------------------------------------------- frame
  const DEFAULT_POST = { expo: 1, grain: 0.07, vig: 0.35, ca: 0.8, bloom: 0.55, sat: 0.82, glitch: 0, flash: 0, weave: 1 };
  function shotAt(t) {
    let i = 0;
    while (i < SH.length - 1 && t >= SH[i + 1].t0) i++;
    return i;
  }
  function drawShot(i, t) {
    const sh = SH[i];
    const fn = shots[sh.id] || shots.black;
    const lt = t - sh.t0, dur = sh.t1 - sh.t0;
    g.save();
    const r = fn(lt, dur, sh) || {};
    g.restore();
    reset();
    return r;
  }

  function frame(t, opts = {}) {
    reduced = !!opts.reduced;
    t = clamp(t, 0, S.duration - 1e-3);
    const i = shotAt(t), sh = SH[i];
    const lt = t - sh.t0;
    let post = Object.assign({}, DEFAULT_POST, drawShot(i, t));
    if (sh.in === 'dissolve' && i > 0 && lt < sh.inDur) {
      // draw the outgoing shot into the buffer and lay it over, fading out
      const keep = g;
      g = bg;
      const prev = drawShot(i - 1, t);
      g = keep;
      reset();
      g.globalAlpha = 1 - ease(lt / sh.inDur);
      g.drawImage(buf, 0, 0);
      g.globalAlpha = 1;
      void prev;
    }
    if (sh.in === 'fade' && lt < sh.inDur) {
      reset();
      g.fillStyle = `rgba(0,0,0,${1 - ease(lt / sh.inDur)})`;
      g.fillRect(0, 0, W, H);
    }
    dayStamp(t);
    subtitles(t);
    post.seed = Math.floor(t * 24);
    post.t = t;
    post.id = sh.id;
    if (reduced) { post.glitch *= 0.15; post.flash *= 0.3; }
    return post;
  }

  function captionAt(t) {
    for (const s of S.subs) if (t >= s.t0 && t < s.t1) return s.text;
    const sh = SH[shotAt(t)];
    if (sh.id === 'card' && sh.lines) return sh.lines.join(' ');
    if (sh.id === 'title') return 'Cradlesong';
    if (sh.id === 'endcard') return 'Cradlesong. A survival horror game. Coming 2027.';
    if (sh.id === 'tv') {
      let line = null;
      for (const l of S.broadcast.lines) if (t >= l.t) line = l;
      return line ? line.say : 'Emergency broadcast.';
    }
    if (t >= 9.0 && t < 13.6) return 'Day 41.';
    return '';
  }

  function init(canvas) {
    cv = canvas;
    g = cv.getContext('2d', { alpha: false });
    buf = L.canvas(cv.width, cv.height);
    bg = buf.getContext('2d', { alpha: false });
    if (!A) A = makeAssets();
    W = cv.width; H = cv.height;
  }
  function resize() {
    if (!cv) return;
    W = cv.width; H = cv.height;
    if (buf.width !== W || buf.height !== H) { buf.width = W; buf.height = H; }
  }
  // build the shared crowd sprites ahead of time: all at once (capture), or a few per tick
  let warmed = false;
  function warm(sync) {
    if (warmed) return;
    warmed = true;
    const jobs = [];
    for (const px of [96, 160]) for (let v = 0; v < VARIANTS; v++) jobs.push(() => L.deadSprite(VARIANT0 + v, px).faces());
    if (sync) { jobs.forEach((j) => j()); return; }
    const step = () => { const t0 = performance.now(); while (jobs.length && performance.now() - t0 < 6) jobs.shift()(); if (jobs.length) setTimeout(step, 16); };
    step();
  }

  window.CSHOTS = { init, resize, frame, captionAt, warm, shotAt: (t) => SH[shotAt(t)] };
})();
