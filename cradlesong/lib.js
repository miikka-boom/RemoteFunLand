// Cradlesong: shared drawing helpers and generated assets (noise, figures, trees, the cassette deck).
// Everything is drawn with Canvas 2D; shots.js composes the shots from these pieces.
(function () {
  'use strict';
  const L = {};
  const TAU = Math.PI * 2;
  L.TAU = TAU;

  // ------------------------------------------------------------------ math
  L.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  L.lerp = (a, b, u) => a + (b - a) * u;
  L.smooth = (a, b, t) => { const u = L.clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  L.ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  L.easeOut = (u) => 1 - Math.pow(1 - L.clamp(u, 0, 1), 3);
  L.easeIn = (u) => Math.pow(L.clamp(u, 0, 1), 3);
  L.rng = (seed) => {
    let a = (seed * 2654435761) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  L.hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  // smooth keyframes: [[t, v], ...] with an S-curve between neighbours
  L.keys = (t, k) => {
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i][0]) {
        const u = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
        return L.lerp(k[i - 1][1], k[i][1], u * u * (3 - 2 * u));
      }
    }
    return k[k.length - 1][1];
  };
  // value noise in 1D, for flicker and wobble
  L.wob = (x, seed = 0) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return L.lerp(L.hash(i + seed * 101), L.hash(i + 1 + seed * 101), u) * 2 - 1;
  };
  L.flick = (t, seed = 0) => 0.5 * L.wob(t * 9, seed) + 0.3 * L.wob(t * 23, seed + 3) + 0.2 * L.wob(t * 51, seed + 7);

  L.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };

  // ------------------------------------------------------------------ text
  L.FONT_SERIF = '"Cormorant Garamond", "Cormorant", Garamond, "Times New Roman", serif';
  L.FONT_HAND = 'Caveat, "Segoe Print", "Bradley Hand", cursive';
  L.FONT_CRT = 'VT323, "Courier New", monospace';
  L.FONT_SUB = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", Roboto, sans-serif';
  const hasLS = (() => { try { return 'letterSpacing' in L.canvas(1, 1).getContext('2d'); } catch (e) { return false; } })();
  // letter-spaced text, aligned 'center' | 'left' | 'right'; returns its width
  L.spaced = (g, text, x, y, spacing, align = 'center', draw = true) => {
    if (hasLS) {
      g.letterSpacing = spacing + 'px';
      const w = g.measureText(text).width - spacing;
      if (draw) {
        g.textAlign = 'left';
        const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
        g.fillText(text, x0, y);
      }
      g.letterSpacing = '0px';
      return w;
    }
    const chars = [...text];
    const ws = chars.map((c) => g.measureText(c).width);
    const w = ws.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    if (draw) {
      g.textAlign = 'left';
      let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      chars.forEach((c, i) => { g.fillText(c, cx, y); cx += ws[i] + spacing; });
    }
    return w;
  };

  // ------------------------------------------------------------------ noise textures
  L.noiseField = (size, octaves, seed, base = 4, persist = 0.5) => {
    const r = L.rng(seed);
    const out = new Float32Array(size * size);
    let amp = 1;
    for (let o = 0; o < octaves; o++) {
      const n = base << o, grid = new Float32Array(n * n);
      for (let i = 0; i < grid.length; i++) grid[i] = r();
      for (let y = 0; y < size; y++) {
        const fy = (y / size) * n, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
        const ya = (y0 % n) * n, yb = ((y0 + 1) % n) * n;
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * n, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
          const xa = x0 % n, xb = (x0 + 1) % n;
          out[y * size + x] += amp * ((grid[ya + xa] * (1 - sx) + grid[ya + xb] * sx) * (1 - sy) + (grid[yb + xa] * (1 - sx) + grid[yb + xb] * sx) * sy);
        }
      }
      amp *= persist;
    }
    let mn = Infinity, mx = -Infinity;
    for (const v of out) { if (v < mn) mn = v; if (v > mx) mx = v; }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
    return out;
  };
  L.fieldCanvas = (field, size, rgb, curve) => {
    const c = L.canvas(size, size), g = c.getContext('2d'), im = g.createImageData(size, size);
    for (let i = 0; i < field.length; i++) {
      const a = L.clamp(curve(field[i], i % size, (i / size) | 0), 0, 1);
      im.data[i * 4] = rgb[0]; im.data[i * 4 + 1] = rgb[1]; im.data[i * 4 + 2] = rgb[2];
      im.data[i * 4 + 3] = Math.round(a * 255);
    }
    g.putImageData(im, 0, 0);
    return c;
  };
  // tile tex over rect (x, y, w, h) at a scale, scrolled by (ox, oy); the caller clips if needed
  L.tile = (g, tex, x, y, w, h, ox, oy, sx, sy = sx) => {
    const tw = tex.width * sx, th = tex.height * sy;
    if (tw < 1 || th < 1) return;
    const x0 = x + ((((ox % tw) + tw) % tw) - tw);
    const y0 = y + ((((oy % th) + th) % th) - th);
    for (let yy = y0; yy < y + h; yy += th) for (let xx = x0; xx < x + w; xx += tw) g.drawImage(tex, xx, yy, tw + 0.5, th + 0.5);
  };

  // soft round glow sprite (white), drawn tinted via globalCompositeOperation / filters by callers
  L.glowSprite = (() => {
    const cache = {};
    return (rgb) => {
      const key = rgb.join(',');
      if (cache[key]) return cache[key];
      const c = L.canvas(128, 128), g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, `rgba(${key},1)`);
      gr.addColorStop(0.25, `rgba(${key},0.45)`);
      gr.addColorStop(0.6, `rgba(${key},0.1)`);
      gr.addColorStop(1, `rgba(${key},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return (cache[key] = c);
    };
  })();
  L.glow = (g, x, y, r, rgb, a = 1, op = 'lighter') => {
    if (a <= 0.003 || r <= 0) return;
    const pa = g.globalAlpha, po = g.globalCompositeOperation;
    g.globalAlpha = Math.min(1, a);
    g.globalCompositeOperation = op;
    g.drawImage(L.glowSprite(rgb), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = pa;
    g.globalCompositeOperation = po;
  };

  // ------------------------------------------------------------------ the dead
  L.deadParams = (seed) => {
    const r = L.rng(seed + 17);
    const female = r() < 0.42;
    const side = () => (r() < 0.5 ? -1 : 1);
    return {
      seed, female,
      h: (female ? 0.93 : 0.99) + r() * 0.1,
      girth: (female ? 0.82 : 0.95) + r() * 0.3,
      lean: (r() - 0.5) * 0.17,
      tilt: side() * (0.12 + r() * 0.5),
      drop: r() * 0.8,
      shTilt: (r() - 0.5) * 0.14,
      armA: [0.05 + r() * 0.22, 0.05 + r() * 0.22],
      armB: [(r() - 0.3) * 0.35, (r() - 0.3) * 0.35],
      reach: r() < 0.14 ? (r() < 0.5 ? 0 : 1) : -1,
      stump: r() < 0.07 ? (r() < 0.5 ? 0 : 1) : -1,
      leg: [0.025 + r() * 0.06, 0.025 + r() * 0.06],
      knee: (r() - 0.5) * 0.05,
      cloth: female ? (r() < 0.55 ? 'dress' : 'coat') : (r() < 0.55 ? 'coat' : 'shirt'),
      hem: r(),
      hair: female ? (r() < 0.75 ? 2 : 1) : (r() < 0.55 ? 1 : 0),
      tat: 0.3 + r() * 0.7,
    };
  };

  L.headOf = (P) => {
    const H = P.h;
    const hipY = -0.5 * H;
    const cs = Math.cos(P.lean), sn = Math.sin(P.lean);
    const neck = [-(-0.83 * H - hipY) * sn, hipY + (-0.83 * H - hipY) * cs];
    const len = 0.085 * H * (1 - P.drop * 0.45);
    const a = P.tilt * 0.8 + P.lean;
    return { x: neck[0] + Math.sin(a) * len, y: neck[1] - Math.cos(a) * len, tilt: P.tilt + P.lean, rx: 0.05 * H, ry: 0.064 * H, neck };
  };

  // a standing body, height ~1, feet at the origin, front or back (a silhouette either way)
  L.drawDead = (g, P) => {
    const r = L.rng(P.seed * 7 + 3);
    const H = P.h, G = P.girth;
    const hipY = -0.5 * H;
    const cs = Math.cos(P.lean), sn = Math.sin(P.lean);
    const up = (x, y) => [x * cs - (y - hipY) * sn, hipY + x * sn + (y - hipY) * cs];
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // legs
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      const hip = [s * 0.05 * G, hipY + 0.03];
      const knee = [s * (0.052 * G + P.leg[k] * 0.55) + P.knee, -0.265 * H];
      const ank = [s * (0.045 + P.leg[k]), -0.035];
      g.lineWidth = 0.075 * G;
      g.beginPath(); g.moveTo(hip[0], hip[1]); g.lineTo(knee[0], knee[1]); g.stroke();
      g.lineWidth = 0.055 * G;
      g.beginPath(); g.moveTo(knee[0], knee[1]); g.lineTo(ank[0], ank[1]); g.stroke();
      g.beginPath(); g.ellipse(ank[0] + s * 0.012, -0.014, 0.04, 0.017, 0, 0, TAU); g.fill();
    }
    // torso and clothes
    const sw = 0.13 * G, ww = 0.088 * G, hw = 0.1 * G;
    const shY = -0.795 * H;
    const shL = up(-sw, shY + P.shTilt * 0.45), shR = up(sw, shY - P.shTilt * 0.45);
    g.beginPath();
    g.moveTo(shL[0], shL[1]);
    let p = up(0, shY - 0.03);
    g.quadraticCurveTo(p[0], p[1], shR[0], shR[1]);
    p = up(sw * 1.02, -0.69 * H);
    let q = up(ww, -0.6 * H);
    g.quadraticCurveTo(p[0], p[1], q[0], q[1]);
    if (P.cloth === 'dress' || P.cloth === 'coat') {
      const dress = P.cloth === 'dress';
      const hemY = dress ? -0.28 * H + P.hem * 0.1 : hipY + 0.1 + P.hem * 0.12;
      const hemW = dress ? 0.165 * G : 0.118 * G;
      g.lineTo(hw * 1.05, hipY);
      g.lineTo(hemW, hemY);
      const n = 11;
      for (let i = 1; i < n; i++) {
        const u = i / n;
        g.lineTo(hemW - 2 * hemW * u + (r() - 0.5) * 0.012, hemY + (r() - 0.25) * 0.06 * P.tat);
      }
      g.lineTo(-hemW, hemY);
      g.lineTo(-hw * 1.05, hipY);
    } else {
      g.lineTo(hw, hipY + 0.035);
      g.lineTo(-hw, hipY + 0.035);
    }
    q = up(-ww, -0.6 * H);
    g.lineTo(q[0], q[1]);
    p = up(-sw * 1.02, -0.69 * H);
    g.quadraticCurveTo(p[0], p[1], shL[0], shL[1]);
    g.closePath();
    g.fill();
    // arms
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      const S = k ? shR : shL;
      const sh = [S[0] - s * 0.012, S[1] + 0.02];
      let a1 = P.armA[k], a2 = a1 + P.armB[k];
      let l1 = 0.18 * H, l2 = 0.16 * H;
      if (P.reach === k) { a1 = 0.55 + P.armA[k]; a2 = a1 + 0.5; l1 *= 0.85; l2 *= 0.7; }
      const el = [sh[0] + s * Math.sin(a1 + P.lean * s) * l1, sh[1] + Math.cos(a1 + P.lean * s) * l1];
      g.lineWidth = 0.06 * G;
      g.beginPath(); g.moveTo(sh[0], sh[1]); g.lineTo(el[0], el[1]); g.stroke();
      if (P.stump === k) {
        g.beginPath();
        g.moveTo(el[0] - 0.03 * G, el[1]);
        for (let i = 0; i <= 4; i++) g.lineTo(el[0] - 0.03 * G + i * 0.015 * G, el[1] + 0.02 + (i % 2) * 0.03);
        g.lineTo(el[0] + 0.03 * G, el[1]);
        g.fill();
        continue;
      }
      const wr = [el[0] + s * Math.sin(a2 + P.lean * s) * l2, el[1] + Math.cos(a2 + P.lean * s) * l2];
      g.lineWidth = 0.045 * G;
      g.beginPath(); g.moveTo(el[0], el[1]); g.lineTo(wr[0], wr[1]); g.stroke();
      // a hanging hand, long fingers
      const ha = a2 + P.lean * s;
      g.save();
      g.translate(wr[0], wr[1]);
      g.rotate(-s * ha);
      g.beginPath(); g.ellipse(0, 0.035, 0.022, 0.04, 0, 0, TAU); g.fill();
      g.lineWidth = 0.009;
      for (let f = -2; f <= 1; f++) { g.beginPath(); g.moveTo(f * 0.009, 0.05); g.lineTo(f * 0.011 + 0.004, 0.1 + (f === 1 ? -0.012 : 0)); g.stroke(); }
      g.restore();
    }
    // neck and head
    const hd = L.headOf(P);
    g.lineWidth = 0.05 * G;
    g.beginPath(); g.moveTo(hd.neck[0], hd.neck[1] + 0.02); g.lineTo((hd.neck[0] + hd.x) / 2, (hd.neck[1] + hd.y) / 2 + 0.01); g.stroke();
    g.save();
    g.translate(hd.x, hd.y);
    g.rotate(hd.tilt);
    g.beginPath(); g.ellipse(0, 0, hd.rx, hd.ry, 0, 0, TAU); g.fill();
    if (P.hair === 2) {          // long, lank hair
      g.beginPath();
      g.moveTo(-hd.rx * 1.05, -hd.ry * 0.3);
      g.quadraticCurveTo(-hd.rx * 1.35, hd.ry * 1.6, -hd.rx * 1.1, hd.ry * 3.2);
      for (let i = 0; i <= 8; i++) g.lineTo(-hd.rx * 1.1 + (i / 8) * hd.rx * 2.2, hd.ry * (2.6 + 0.7 * r()));
      g.quadraticCurveTo(hd.rx * 1.35, hd.ry * 1.6, hd.rx * 1.05, -hd.ry * 0.3);
      g.closePath();
      g.fill();
    } else if (P.hair === 1) {   // thin, matted strands
      g.lineWidth = hd.rx * 0.16;
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
        const x0 = Math.cos(a) * hd.rx * 0.9, y0 = Math.sin(a) * hd.ry * 0.9;
        g.beginPath(); g.moveTo(x0, y0);
        g.lineTo(x0 + Math.cos(a) * hd.rx * 0.28 + (r() - 0.5) * hd.rx * 0.3, y0 + Math.sin(a) * hd.ry * 0.12 + hd.ry * 0.2 * r());
        g.stroke();
      }
    }
    g.restore();
  };

  // the face, for figures that face us (the last shot): pale, eyes closed or open
  L.drawFace = (g, P, open) => {
    const hd = L.headOf(P);
    const r = L.rng(P.seed * 13 + 1);
    g.save();
    g.translate(hd.x, hd.y);
    g.rotate(hd.tilt);
    const rx = hd.rx * 0.74, ry = hd.ry * 0.8;
    if (!open) {
      const gr = g.createRadialGradient(-rx * 0.15, -ry * 0.3, rx * 0.05, 0, ry * 0.1, rx * 1.15);
      gr.addColorStop(0, 'rgba(176,184,190,1)');
      gr.addColorStop(0.65, 'rgba(118,126,134,1)');
      gr.addColorStop(1, 'rgba(58,64,72,1)');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(0, ry * 0.12, rx, ry, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(14,15,18,0.88)';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * rx * 0.4, -ry * 0.02, rx * 0.27, ry * 0.2, s * 0.15, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(90,96,104,0.9)'; g.lineWidth = rx * 0.06;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * rx * 0.58, ry * 0.02); g.quadraticCurveTo(s * rx * 0.4, ry * 0.1, s * rx * 0.2, ry * 0.02); g.stroke(); }
      g.fillStyle = 'rgba(20,22,26,0.7)';
      g.beginPath(); g.ellipse(0, ry * 0.34, rx * 0.12, ry * 0.08, 0, 0, TAU); g.fill();
      g.fillRect(-rx * 0.26, ry * 0.6, rx * 0.52, ry * 0.06);
      g.fillStyle = 'rgba(10,10,12,0.55)';
      g.beginPath(); g.ellipse(0, ry * 1.0, rx * 0.6, ry * 0.18, 0, 0, TAU); g.fill();
      if (r() < 0.35) {           // a dark wound or rot on a cheek
        g.fillStyle = 'rgba(30,18,18,0.7)';
        g.beginPath(); g.ellipse((r() < 0.5 ? -1 : 1) * rx * 0.5, ry * 0.4, rx * 0.2, ry * 0.15, r(), 0, TAU); g.fill();
      }
      if (P.hair === 2) {
        g.fillStyle = '#000';
        g.beginPath(); g.ellipse(-rx * 0.98, ry * 0.25, rx * 0.36, ry * 1.1, 0.12, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(rx * 0.98, ry * 0.25, rx * 0.36, ry * 1.1, -0.12, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(0, -ry * 0.75, rx * 0.9, ry * 0.3, 0, 0, TAU); g.fill();
      }
    } else {
      for (const s of [-1, 1]) {
        g.fillStyle = 'rgba(225,228,218,1)';
        g.beginPath(); g.ellipse(s * rx * 0.4, -ry * 0.02, rx * 0.16, ry * 0.09, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(0,0,0,1)';
        g.beginPath(); g.arc(s * rx * 0.4, -ry * 0.03, rx * 0.055, 0, TAU); g.fill();
      }
    }
    g.restore();
  };

  // sprites of the dead: body (black), face (closed eyes) and eyes (open), cached per seed and size
  const spriteCache = new Map();
  L.deadSprite = (seed, px = 220) => {
    const key = seed + ':' + px;
    let s = spriteCache.get(key);
    if (s) return s;
    const P = L.deadParams(seed);
    const w = Math.round(px * 0.72), h = Math.round(px * 1.12);
    const mk = (fn) => {
      const c = L.canvas(w, h), g = c.getContext('2d');
      g.translate(w / 2, h - px * 0.04);
      g.scale(px, px);
      fn(g);
      return c;
    };
    s = {
      P, w, h, px, footY: h - px * 0.04,
      body: mk((g) => { g.fillStyle = '#000'; g.strokeStyle = '#000'; L.drawDead(g, P); }),
      face: null, eyes: null,
    };
    s.faces = () => {
      if (!s.face) {
        s.face = mk((g) => L.drawFace(g, P, false));
        s.eyes = mk((g) => L.drawFace(g, P, true));
      }
      return s;
    };
    spriteCache.set(key, s);
    return s;
  };

  // ------------------------------------------------------------------ the living
  // Dad seated on a chair, side view facing right, hunched, forearms on knees; height ~1.3 units
  L.drawDadSeated = (g, lift = 0) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // chair
    g.lineWidth = 0.035;
    g.beginPath(); g.moveTo(-0.32, 0); g.lineTo(-0.3, -0.46); g.moveTo(0.06, 0); g.lineTo(0.05, -0.46);
    g.moveTo(-0.34, -0.47); g.lineTo(0.08, -0.47); g.moveTo(-0.33, -0.47); g.lineTo(-0.38, -1.02); g.stroke();
    g.lineWidth = 0.03;
    g.beginPath(); g.moveTo(-0.37, -0.75); g.lineTo(-0.33, -0.55); g.stroke();
    // legs: thigh forward, shin down
    g.lineWidth = 0.13;
    g.beginPath(); g.moveTo(-0.18, -0.52); g.lineTo(0.2, -0.53); g.lineTo(0.24, -0.06); g.stroke();
    g.beginPath(); g.ellipse(0.29, -0.03, 0.1, 0.04, 0, 0, TAU); g.fill();
    // torso, hunched forward
    const lean = 0.62 - lift * 0.35;
    g.save();
    g.translate(-0.16, -0.55);
    g.rotate(lean);
    g.beginPath();
    g.moveTo(-0.11, 0.02);
    g.quadraticCurveTo(-0.16, -0.32, -0.08, -0.6);
    g.quadraticCurveTo(0.02, -0.68, 0.1, -0.6);
    g.quadraticCurveTo(0.16, -0.3, 0.12, 0.02);
    g.closePath();
    g.fill();
    // neck and bowed head
    g.save();
    g.translate(0.02, -0.62);
    g.rotate(0.55 - lift * 0.9);
    g.lineWidth = 0.07;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0.01, -0.06); g.stroke();
    g.beginPath(); g.ellipse(0.02, -0.14, 0.085, 0.1, 0.2, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(0.09, -0.17); g.lineTo(0.13, -0.12); g.lineTo(0.09, -0.09); g.fill();   // nose
    g.restore();
    // arm: shoulder -> elbow on knee -> hands clasped
    g.lineWidth = 0.075;
    g.beginPath(); g.moveTo(0.03, -0.55); g.lineTo(0.2, -0.33); g.stroke();
    g.restore();
    g.lineWidth = 0.065;
    const el = [-0.16 + Math.sin(lean) * 0.0 + 0.32, -0.6];
    g.beginPath(); g.moveTo(el[0], el[1]); g.lineTo(0.32, -0.66); g.stroke();
    g.beginPath(); g.ellipse(0.35, -0.67, 0.05, 0.04, 0, 0, TAU); g.fill();
  };

  // Dad standing, seen from behind, a hand up on the boards; height ~1.78
  L.drawDadBack = (g) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // legs, a little apart
    g.lineWidth = 0.13;
    g.beginPath(); g.moveTo(-0.08, -0.9); g.lineTo(-0.1, -0.45); g.lineTo(-0.11, -0.04); g.stroke();
    g.beginPath(); g.moveTo(0.08, -0.9); g.lineTo(0.11, -0.45); g.lineTo(0.13, -0.04); g.stroke();
    g.beginPath(); g.ellipse(-0.12, -0.02, 0.07, 0.03, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(0.14, -0.02, 0.07, 0.03, 0, 0, TAU); g.fill();
    // jacket: broad shoulders, hem below the hips
    g.beginPath();
    g.moveTo(-0.235, -1.43);
    g.quadraticCurveTo(-0.12, -1.5, 0, -1.5);
    g.quadraticCurveTo(0.13, -1.5, 0.24, -1.44);
    g.quadraticCurveTo(0.27, -1.3, 0.22, -1.12);
    g.lineTo(0.21, -0.82);
    g.lineTo(-0.2, -0.82);
    g.lineTo(-0.21, -1.12);
    g.quadraticCurveTo(-0.27, -1.3, -0.235, -1.43);
    g.fill();
    // left arm hanging, right arm up to the boards
    g.lineWidth = 0.085;
    g.beginPath(); g.moveTo(-0.22, -1.38); g.lineTo(-0.28, -1.1); g.lineTo(-0.27, -0.86); g.stroke();
    g.beginPath(); g.ellipse(-0.27, -0.81, 0.04, 0.055, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(0.22, -1.4); g.lineTo(0.33, -1.6); g.lineTo(0.3, -1.82); g.stroke();
    g.beginPath(); g.ellipse(0.3, -1.87, 0.045, 0.06, 0.15, 0, TAU); g.fill();
    // neck, head bowed toward a gap in the boards
    g.lineWidth = 0.1;
    g.beginPath(); g.moveTo(0, -1.47); g.lineTo(0.015, -1.56); g.stroke();
    g.beginPath(); g.ellipse(0.025, -1.64, 0.088, 0.108, 0.12, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(-0.06, -1.64, 0.018, 0.03, 0, 0, TAU); g.fill();       // ears
    g.beginPath(); g.ellipse(0.11, -1.63, 0.018, 0.03, 0, 0, TAU); g.fill();
  };

  // a woman seated on the edge of a bed, side view facing left, leaning over it; long hair
  L.drawMara = (g) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // thighs along the mattress edge, shins down
    g.lineWidth = 0.12;
    g.beginPath(); g.moveTo(0.02, -0.02); g.lineTo(-0.3, 0.0); g.lineTo(-0.33, 0.42); g.stroke();
    g.beginPath(); g.ellipse(-0.37, 0.44, 0.08, 0.03, 0, 0, TAU); g.fill();
    // torso, bent toward the pillow
    g.save();
    g.translate(0.02, -0.04);
    g.rotate(-0.5);
    g.beginPath();
    g.moveTo(0.12, 0.05);
    g.quadraticCurveTo(0.17, -0.3, 0.09, -0.58);
    g.quadraticCurveTo(0.0, -0.68, -0.09, -0.6);
    g.quadraticCurveTo(-0.15, -0.3, -0.1, 0.05);
    g.closePath();
    g.fill();
    // neck and head bowed over the child
    g.save();
    g.translate(0.0, -0.64);
    g.rotate(-0.25);
    g.lineWidth = 0.055;
    g.beginPath(); g.moveTo(0, 0.02); g.lineTo(0, -0.07); g.stroke();
    g.beginPath(); g.ellipse(-0.01, -0.15, 0.072, 0.09, 0, 0, TAU); g.fill();
    // long hair, falling past the face
    g.beginPath();
    g.moveTo(0.07, -0.2);
    g.quadraticCurveTo(0.13, 0.08, 0.06, 0.4);
    g.lineTo(0.02, 0.43); g.lineTo(-0.02, 0.36); g.lineTo(-0.05, 0.41);
    g.quadraticCurveTo(-0.1, 0.1, -0.08, -0.18);
    g.fill();
    g.restore();
    // an arm reaching out toward the pillow
    g.lineWidth = 0.055;
    g.beginPath(); g.moveTo(-0.05, -0.52); g.lineTo(-0.2, -0.3); g.lineTo(-0.38, -0.24); g.stroke();
    g.beginPath(); g.ellipse(-0.43, -0.23, 0.05, 0.03, 0.2, 0, TAU); g.fill();
    g.restore();
  };

  // a hand, palm toward us, fingers up; curl 0 (flat) .. 1 (clawed); about 1 unit tall
  L.drawHand = (g, curl = 0, spread = 1) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(-0.2, 0.42);
    g.quadraticCurveTo(-0.25, 0.1, -0.21, -0.05);
    g.lineTo(0.2, -0.07);
    g.quadraticCurveTo(0.25, 0.12, 0.16, 0.42);
    g.closePath();
    g.fill();
    const fingers = [[-0.155, 0.38, -0.11], [-0.055, 0.44, -0.035], [0.05, 0.42, 0.04], [0.145, 0.33, 0.12]];
    for (const [x, len, a0] of fingers) {
      let ang = a0 * spread - Math.PI / 2, px = x, py = -0.04, w = 0.085;
      const segs = [0.42, 0.33, 0.25];
      for (let k = 0; k < 3; k++) {
        const l = len * segs[k];
        const nx = px + Math.cos(ang) * l, ny = py + Math.sin(ang) * l;
        g.lineWidth = w;
        g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
        px = nx; py = ny; w *= 0.86;
        ang += curl * 0.55;
      }
    }
    // thumb
    let ang = Math.PI * (0.85 - 0.08 * spread), px = -0.19, py = 0.22, w = 0.1;
    for (const l of [0.16, 0.13]) {
      const nx = px + Math.cos(ang) * l, ny = py - Math.sin(ang) * l;
      g.lineWidth = w;
      g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      px = nx; py = ny; w *= 0.85; ang -= 0.3 + curl * 0.4;
    }
    // wrist
    g.beginPath(); g.moveTo(-0.17, 0.38); g.lineTo(-0.15, 0.9); g.lineTo(0.13, 0.9); g.lineTo(0.14, 0.38); g.closePath(); g.fill();
  };

  // a head and shoulders, seen from the front or back, for figures pressed close; unit = head height
  L.drawBust = (g, seed, tilt = 0) => {
    const r = L.rng(seed);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-1.6, 3.2);
    g.quadraticCurveTo(-1.55, 1.1, -0.55, 0.85);
    g.lineTo(0.55, 0.85);
    g.quadraticCurveTo(1.55, 1.1, 1.6, 3.2);
    g.closePath();
    g.fill();
    g.fillRect(-0.22, 0.2, 0.44, 0.8);
    g.save();
    g.rotate(tilt);
    g.beginPath(); g.ellipse(0, -0.05, 0.4, 0.52, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(-0.4, 0.0, 0.07, 0.13, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(0.4, 0.0, 0.07, 0.13, 0, 0, TAU); g.fill();
    g.lineWidth = 0.035;
    const long = r() < 0.5;
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI + (i / 25) * Math.PI;
      const x0 = Math.cos(a) * 0.38, y0 = -0.05 + Math.sin(a) * 0.5;
      const len = long ? 0.5 + r() * 0.9 : 0.08 + r() * 0.18;
      g.beginPath(); g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 * 1.2, y0 + len * 0.5, x0 * (1.05 + r() * 0.2), y0 + len);
      g.stroke();
    }
    g.restore();
  };

  // ------------------------------------------------------------------ trees
  L.treeSprite = (seed, w = 360, h = 480) => {
    const c = L.canvas(w, h), g = c.getContext('2d'), r = L.rng(seed);
    g.strokeStyle = '#000';
    g.lineCap = 'round';
    const branch = (x, y, a, len, wid, d) => {
      const x2 = x + Math.sin(a) * len, y2 = y - Math.cos(a) * len;
      g.lineWidth = wid;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.sin(a + (r() - 0.5) * 0.6) * len * 0.5, y - Math.cos(a) * len * 0.5, x2, y2);
      g.stroke();
      if (d <= 0 || len < 4) return;
      const kids = d > 4 ? 2 : 2 + (r() < 0.5 ? 1 : 0);
      for (let i = 0; i < kids; i++) {
        const na = a + (i - (kids - 1) / 2) * (0.5 + r() * 0.35) + (r() - 0.5) * 0.3;
        branch(x2, y2, na, len * (0.62 + r() * 0.18), wid * 0.66, d - 1);
      }
    };
    branch(w / 2, h, (r() - 0.5) * 0.1, h * 0.3, w * 0.045, 7);
    return c;
  };

  // ------------------------------------------------------------------ 2.5D projection
  // camera {x, y, z, f, cx, cy}; y is up-negative, ground at y = 0
  L.proj = (cam, x, y, z) => {
    const d = z - cam.z;
    if (d <= 0.05) return null;
    const k = cam.f / d;
    return { x: cam.cx + (x - cam.x) * k, y: cam.cy + (y - cam.y) * k, k, d };
  };

  // ------------------------------------------------------------------ the cassette deck
  // A portable cassette recorder seen from above, 1000 x 640 units centered on the origin.
  // o: { reel (radians), play (key down), progress (0..1 tape wound), led (0..1), label (bool) }
  L.drawDeck = (g, o) => {
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
    // body
    let gr = g.createLinearGradient(0, -330, 0, 330);
    gr.addColorStop(0, '#2a2725');
    gr.addColorStop(1, '#141312');
    g.fillStyle = gr;
    rr(-500, -320, 1000, 640, 46); g.fill();
    g.strokeStyle = 'rgba(255,240,220,0.14)';
    g.lineWidth = 4;
    rr(-497, -317, 994, 634, 44); g.stroke();
    // keys
    const names = ['REC', 'PLAY', 'REW', 'F.FWD', 'STOP'];
    for (let i = 0; i < 5; i++) {
      const x = -440 + i * 162, down = (i === 1 && o.play) ? 10 : 0;
      gr = g.createLinearGradient(0, -330 + down, 0, -250 + down);
      gr.addColorStop(0, down ? '#3e3b38' : '#6a6661');
      gr.addColorStop(1, down ? '#2a2826' : '#3f3c39');
      g.fillStyle = gr;
      rr(x, -338 + down, 148, 82, 10); g.fill();
      g.fillStyle = down ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)';
      g.fillRect(x, -258 + down, 148, 6);
      g.fillStyle = i === 0 ? '#8a2a22' : 'rgba(20,18,16,0.85)';
      g.font = '600 22px ' + L.FONT_SUB;
      g.textAlign = 'center';
      g.fillText(names[i], x + 74, -284 + down);
    }
    // the cassette window
    g.fillStyle = '#0b0a0a';
    rr(-420, -210, 660, 430, 18); g.fill();
    // cassette shell
    gr = g.createLinearGradient(0, -190, 0, 200);
    gr.addColorStop(0, '#3a3530');
    gr.addColorStop(1, '#221f1c');
    g.fillStyle = gr;
    rr(-395, -188, 610, 386, 14); g.fill();
    // label
    g.fillStyle = '#e4d9c2';
    rr(-370, -168, 560, 196, 8); g.fill();
    g.fillStyle = 'rgba(160,60,50,0.55)';
    g.fillRect(-370, -132, 560, 4);
    g.fillRect(-370, -124, 560, 2);
    if (o.label !== false) {
      g.save();
      g.translate(-345, -96);
      g.rotate(-0.025);
      g.fillStyle = '#1d2b4c';
      g.font = '600 64px ' + L.FONT_HAND;
      g.textAlign = 'left';
      g.fillText('Wren’s song', 0, 0);
      g.font = '500 36px ' + L.FONT_HAND;
      g.fillText('for when you can’t sleep', 6, 50);
      g.fillText('love, Mum', 300, 96);
      // a heart, drawn
      g.translate(450, 84);
      g.beginPath();
      g.moveTo(0, 8);
      g.bezierCurveTo(-18, -6, -10, -20, 0, -10);
      g.bezierCurveTo(10, -20, 18, -6, 0, 8);
      g.lineWidth = 3;
      g.strokeStyle = '#1d2b4c';
      g.stroke();
      g.restore();
      // a little wren, cocked tail
      g.save();
      g.translate(120, -40);
      g.strokeStyle = '#1d2b4c';
      g.lineWidth = 3.2;
      g.lineCap = 'round';
      g.beginPath();
      g.ellipse(0, 0, 22, 15, -0.15, 0, TAU);
      g.moveTo(16, -6); g.lineTo(26, -30); g.lineTo(32, -27); g.lineTo(21, -3);
      g.moveTo(-20, -6); g.lineTo(-30, -2); g.lineTo(-20, 1);
      g.moveTo(-4, 14); g.lineTo(-6, 24); g.moveTo(4, 14); g.lineTo(5, 24);
      g.stroke();
      g.beginPath(); g.arc(-12, -5, 2.5, 0, TAU); g.fillStyle = '#1d2b4c'; g.fill();
      g.restore();
    }
    // tape window with reels
    g.fillStyle = '#0d0c0b';
    rr(-280, 48, 380, 120, 40); g.fill();
    const prog = o.progress || 0;
    for (const [cx, rad] of [[-170, 50 - 22 * prog], [-10, 28 + 22 * prog]]) {
      g.fillStyle = '#2d1c12';
      g.beginPath(); g.arc(cx, 108, rad + 22, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,220,180,0.08)';
      g.beginPath(); g.arc(cx, 108, rad + 22, -2.4, -1.4); g.lineTo(cx, 108); g.fill();
      g.fillStyle = '#d8d2c6';
      g.beginPath(); g.arc(cx, 108, 24, 0, TAU); g.fill();
      g.fillStyle = '#0d0c0b';
      g.beginPath(); g.arc(cx, 108, 15, 0, TAU); g.fill();
      g.save();
      g.translate(cx, 108);
      g.rotate(o.reel || 0);
      g.fillStyle = '#d8d2c6';
      for (let k = 0; k < 6; k++) { g.rotate(TAU / 6); g.fillRect(-3, -15, 6, 8); }
      g.restore();
    }
    // window glare
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath(); g.moveTo(-420, -210); g.lineTo(-200, -210); g.lineTo(-420, 60); g.fill();
    // speaker grille
    g.fillStyle = '#080707';
    for (let y = -180; y <= 190; y += 26) for (let x = 290; x <= 460; x += 26) { g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); }
    // LED and its label
    const led = o.led || 0;
    g.fillStyle = led > 0.02 ? `rgb(${120 + 135 * led},${20 + 20 * led},${18})` : '#2a1210';
    g.beginPath(); g.arc(380, -270, 11, 0, TAU); g.fill();
    g.fillStyle = 'rgba(220,210,190,0.35)';
    g.font = '600 18px ' + L.FONT_SUB;
    g.textAlign = 'center';
    g.fillText('BATT', 380, -236);
  };

  window.CSLIB = L;
})();
