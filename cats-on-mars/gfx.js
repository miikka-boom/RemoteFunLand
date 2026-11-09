/* Cats on Mars: the visuals.
   A 320x180 software renderer in plain JavaScript: every pixel is written by hand into a
   Uint32Array (no canvas drawing calls, no WebGL), then dithered into a small palette.
   Each frame is a pure function of the song time t, so the browser and the Node video
   renderer draw exactly the same picture. */
(function (G) {
  'use strict';
  const CM = G.CM, S = CM.song, E = S.events;
  const W = 320, H = 180, TAU = Math.PI * 2;
  const BAR = S.BAR, BEAT = S.BEAT, STEP = S.STEP, T = S.T;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const fract = x => x - Math.floor(x);
  const OPT = { calm: false, dither: true, levels: 16 };

  // ---------------------------------------------------------------- surface and colour
  const FB = new Uint32Array(W * H);
  let px = FB, SW = W, SH = H;
  function target(buf, w, h) { px = buf; SW = w; SH = h; }
  const rgb = (r, g, b) => (0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255));
  const cl = x => (x <= 0 ? 0 : x >= 255 ? 255 : x | 0);
  const rgbc = (r, g, b) => rgb(cl(r), cl(g), cl(b));
  const R_ = c => c & 255, G_ = c => (c >>> 8) & 255, B_ = c => (c >>> 16) & 255;
  const hex = s => rgb(parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16));
  function mix(a, b, t) { return rgbc(R_(a) + (R_(b) - R_(a)) * t, G_(a) + (G_(b) - G_(a)) * t, B_(a) + (B_(b) - B_(a)) * t); }
  function shade(c, k) { return rgbc(R_(c) * k, G_(c) * k, B_(c) * k); }
  function hsv(h, s, v) {
    h = fract(h) * 6; const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), u = v * (1 - s * (1 - f));
    const [r, g, b] = [[v, u, p], [q, v, p], [p, v, u], [p, q, v], [u, p, v], [v, p, q]][i % 6];
    return rgbc(r * 255, g * 255, b * 255);
  }
  const BLACK = rgb(0, 0, 0), WHITE = rgb(255, 255, 255);

  // ---------------------------------------------------------------- primitives
  function clear(c) { px.fill(c); }
  function hspan(x0, x1, y, c) {
    if (y < 0 || y >= SH) return;
    let a = Math.ceil(x0 - 0.5), b = Math.floor(x1 - 0.5);
    if (a < 0) a = 0;
    if (b >= SW) b = SW - 1;
    if (b < a) return;
    const o = y * SW;
    px.fill(c, o + a, o + b + 1);
  }
  function rect(x, y, w, h, c) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(SW, Math.round(x + w)), y1 = Math.min(SH, Math.round(y + h));
    if (x1 <= x0) return;
    for (let j = y0; j < y1; j++) px.fill(c, j * SW + x0, j * SW + x1);
  }
  function pset(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < SW && y < SH) px[y * SW + x] = c; }
  function blendI(i, c, a) {
    const d = px[i];
    px[i] = rgb(R_(d) + (R_(c) - R_(d)) * a, G_(d) + (G_(c) - G_(d)) * a, B_(d) + (B_(c) - B_(d)) * a);
  }
  function blend(x, y, c, a) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < SW && y < SH) blendI(y * SW + x, c, clamp(a, 0, 1)); }
  function addI(i, r, g, b) {
    const d = px[i];
    px[i] = rgb(Math.min(255, R_(d) + r), Math.min(255, G_(d) + g), Math.min(255, B_(d) + b));
  }
  function addPx(x, y, r, g, b) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < SW && y < SH) addI(y * SW + x, r, g, b); }
  function rectBlend(x, y, w, h, c, a) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(SW, Math.round(x + w)), y1 = Math.min(SH, Math.round(y + h));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) blendI(j * SW + i, c, a);
  }
  function circle(cx, cy, r, c) {
    const y0 = Math.ceil(cy - r - 0.5), y1 = Math.floor(cy + r - 0.5);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy, d = r * r - dy * dy;
      if (d < 0) continue;
      const dx = Math.sqrt(d);
      hspan(cx - dx, cx + dx, y, c);
    }
  }
  function discBlend(cx, cy, r, c, a) {
    const y0 = Math.max(0, Math.ceil(cy - r - 0.5)), y1 = Math.min(SH - 1, Math.floor(cy + r - 0.5));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy, d = r * r - dy * dy;
      if (d < 0) continue;
      const dx = Math.sqrt(d), xa = Math.max(0, Math.ceil(cx - dx - 0.5)), xb = Math.min(SW - 1, Math.floor(cx + dx - 0.5));
      for (let x = xa; x <= xb; x++) blendI(y * SW + x, c, a);
    }
  }
  function ringBlend(cx, cy, r0, r1, c, a) {
    const y0 = Math.max(0, Math.floor(cy - r1)), y1 = Math.min(SH - 1, Math.ceil(cy + r1));
    for (let y = y0; y <= y1; y++) for (let x = Math.max(0, Math.floor(cx - r1)); x <= Math.min(SW - 1, Math.ceil(cx + r1)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d >= r0 && d < r1) blendI(y * SW + x, c, a);
    }
  }
  function glow(cx, cy, r, cr, cg, cb, k) {
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(SH - 1, Math.ceil(cy + r));
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(SW - 1, Math.ceil(cx + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d) * k;
      addI(y * SW + x, cr * f, cg * f, cb * f);
    }
  }
  const XS = new Float64Array(128);
  function poly(p, c) {
    const n = p.length >> 1;
    let y0 = 1e9, y1 = -1e9;
    for (let i = 1; i < p.length; i += 2) { if (p[i] < y0) y0 = p[i]; if (p[i] > y1) y1 = p[i]; }
    const ya = Math.max(0, Math.ceil(y0 - 0.5)), yb = Math.min(SH - 1, Math.floor(y1 - 0.5));
    for (let y = ya; y <= yb; y++) {
      const sy = y + 0.5;
      let k = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = p[2 * i + 1], yj = p[2 * j + 1];
        if ((yi > sy) !== (yj > sy) && k < 128) { const xi = p[2 * i], xj = p[2 * j]; XS[k++] = xi + (sy - yi) * (xj - xi) / (yj - yi); }
      }
      for (let a = 1; a < k; a++) { const v = XS[a]; let b = a - 1; while (b >= 0 && XS[b] > v) { XS[b + 1] = XS[b]; b--; } XS[b + 1] = v; }
      for (let a = 0; a + 1 < k; a += 2) hspan(XS[a], XS[a + 1], y, c);
    }
  }
  function line(x0, y0, x1, y1, c) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let i = 0; i <= n; i++) pset(x0 + dx * i / n, y0 + dy * i / n, c);
  }
  function lineAdd(x0, y0, x1, y1, r, g, b) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let i = 0; i <= n; i++) addPx(x0 + dx * i / n, y0 + dy * i / n, r, g, b);
  }
  function thick(x0, y0, x1, y1, w, c) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L * w / 2, ny = dx / L * w / 2;
    poly([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], c);
    circle(x0, y0, w / 2, c); circle(x1, y1, w / 2, c);
  }
  function vgrad(y0, y1, stops) {
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(SH, Math.ceil(y1));
    for (let y = y0; y < y1; y++) {
      const p = (y - y0) / Math.max(1, y1 - y0 - 1);
      let k = 0;
      while (k < stops.length - 2 && p > stops[k + 1][0]) k++;
      const [pa, ca] = stops[k], [pb, cb] = stops[k + 1];
      px.fill(mix(ca, cb, clamp((p - pa) / (pb - pa), 0, 1)), y * SW, y * SW + SW);
    }
  }
  function flash(a) {
    if (a <= 0.004) return;
    a = Math.min(a, OPT.calm ? 0.25 : 1);
    for (let i = 0; i < px.length; i++) blendI(i, WHITE, a);
  }
  function fadeTo(c, a) { if (a <= 0.004) return; for (let i = 0; i < px.length; i++) blendI(i, c, Math.min(1, a)); }

  // ---------------------------------------------------------------- bitmap font (5x7)
  const GLYPHS = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
    C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
    E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
    K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
    O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
    Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '#####|...#.|..#..|...#.|....#|#...#|.###.',
    4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
    8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
    '.': '.....|.....|.....|.....|.....|.##..|.##..', ',': '.....|.....|.....|.....|.##..|..#..|.#...',
    '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
    "'": '..#..|..#..|.#...|.....|.....|.....|.....', '-': '.....|.....|.....|.###.|.....|.....|.....',
    ':': '.....|.##..|.##..|.....|.##..|.##..|.....', '/': '.....|....#|...#.|..#..|.#...|#....|.....',
    '>': '.#...|..#..|...#.|....#|...#.|..#..|.#...', '<': '...#.|..#..|.#...|#....|.#...|..#..|...#.',
    '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.', ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
    '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
    '=': '.....|.....|#####|.....|#####|.....|.....', '_': '.....|.....|.....|.....|.....|.....|#####',
    '"': '.#.#.|.#.#.|.#.#.|.....|.....|.....|.....', '*': '.....|..#..|#.#.#|.###.|#.#.#|..#..|.....',
    '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.', '@': '.....|.#.#.|#####|#####|.###.|..#..|.....',
    '~': '.#.#.|.#.#.|.....|.###.|#####|#####|.###.', '^': '#...#|##.##|#####|#.#.#|#####|.###.|.....',
    '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
    ' ': '.....|.....|.....|.....|.....|.....|.....'
  };
  const FONT = {};
  for (const k in GLYPHS) FONT[k] = GLYPHS[k].split('|').map(r => r.split('').reduce((a, ch) => (a << 1) | (ch === '#' ? 1 : 0), 0));
  const textW = (s, sc) => s.length * 6 * sc - sc;
  function glyph(ch, x, y, sc, c) {
    const g = FONT[ch];
    if (!g) return;
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      if (!row) continue;
      for (let k = 0; k < 5; k++) if (row & (16 >> k)) { if (sc === 1) pset(x + k, y + r, c); else rect(x + k * sc, y + r * sc, sc, sc, c); }
    }
  }
  function text(s, x, y, sc, c) { s = s.toUpperCase(); for (let i = 0; i < s.length; i++) glyph(s[i], x + i * 6 * sc, y, sc, c); }
  function textO(s, x, y, sc, c, o, w) {
    w = w || 1;
    for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (dx || dy) text(s, x + dx, y + dy, sc, o);
    text(s, x, y, sc, c);
  }
  function textC(s, y, sc, c, o) { const x = Math.round((W - textW(s, sc)) / 2); if (o !== undefined) textO(s, x, y, sc, c, o); else text(s, x, y, sc, c); }
  // text whose colour changes per pixel row (copper-style)
  function textRows(s, x, y, sc, colFn) {
    s = s.toUpperCase();
    for (let i = 0; i < s.length; i++) {
      const g = FONT[s[i]];
      if (!g) continue;
      for (let r = 0; r < 7; r++) for (let j = 0; j < sc; j++) {
        const yy = y + r * sc + j, c = colFn(r * sc + j, i);
        for (let k = 0; k < 5; k++) if (g[r] & (16 >> k)) hspan(x + i * 6 * sc + k * sc, x + i * 6 * sc + (k + 1) * sc, yy, c);
      }
    }
  }

  // ---------------------------------------------------------------- noise
  function tileNoise(P, seed) {
    const R = CM.rng(seed), g = new Float32Array(P * P);
    for (let i = 0; i < P * P; i++) g[i] = R();
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
      const a = g[y0 * P + x0], b = g[y0 * P + x1], c = g[y1 * P + x0], d = g[y1 * P + x1];
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  }
  function fbmMap(N, seed, oct, base, gain) {
    const out = new Float32Array(N * N);
    let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const P = base << o, nf = tileNoise(P, seed + o * 101);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] += nf(x / N * P, y / N * P) * amp;
      tot += amp; amp *= gain;
    }
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < N * N; i++) { out[i] /= tot; lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
    for (let i = 0; i < N * N; i++) out[i] = (out[i] - lo) / (hi - lo);
    return out;
  }
  function hash3(x, y, z) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
    return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy), l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
  }
  function fbm3(x, y, z, oct) { let a = 0.5, s = 0, t = 0; for (let o = 0; o < oct; o++) { s += vnoise3(x, y, z) * a; t += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s / t; }

  // ---------------------------------------------------------------- assets (built once)
  let A = null;
  function init() {
    if (A) return;
    A = {};
    // --- Mars globe texture (equirectangular)
    {
      const TW = 256, TH = 128, tex = new Uint32Array(TW * TH), R = CM.rng(77);
      const craters = [];
      for (let i = 0; i < 70; i++) {
        const lo = R() * TAU, la = Math.asin(R() * 2 - 1) * 0.9;
        craters.push([Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo), 0.02 + R() * R() * 0.08]);
      }
      for (let v = 0; v < TH; v++) {
        const lat = (0.5 - (v + 0.5) / TH) * Math.PI;
        for (let u = 0; u < TW; u++) {
          const lon = (u + 0.5) / TW * TAU;
          const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
          const n1 = fbm3(x * 3 + 5, y * 3, z * 3, 5), n2 = fbm3(x * 1.3 + 9, y * 1.3 + 2, z * 1.3, 4);
          const dark = smooth((n2 - 0.5) * 5), bright = smooth((n1 - 0.5) * 4);
          let r = lerp(185, 228, bright), g = lerp(88, 150, bright), b = lerp(48, 92, bright);
          r = lerp(r, 104, dark * 0.75); g = lerp(g, 48, dark * 0.75); b = lerp(b, 32, dark * 0.75);
          // a long canyon and a giant volcano
          const cy = -0.13 + 0.04 * Math.sin(lon * 9), dv = Math.abs(lat - cy);
          if (lon > 4.2 && lon < 5.4 && dv < 0.035) { const k = (1 - dv / 0.035) * 0.55 * Math.min(1, (lon - 4.2) * 4, (5.4 - lon) * 4); r *= 1 - k; g *= 1 - k; b *= 1 - k; }
          const vx = Math.cos(0.32) * Math.cos(3.9), vy = Math.sin(0.32), vz = Math.cos(0.32) * Math.sin(3.9);
          const va = Math.acos(clamp(x * vx + y * vy + z * vz, -1, 1));
          if (va < 0.12) { const k = va < 0.09 ? 1.18 : 0.7; r *= k; g *= k; b *= k; }
          for (const c of craters) {
            const a = Math.acos(clamp(x * c[0] + y * c[1] + z * c[2], -1, 1)) / c[3];
            if (a < 1.25) { const k = a < 0.8 ? 0.82 : a < 1 ? 1.15 : 1.05; r *= k; g *= k; b *= k; }
          }
          const cap = smooth((Math.abs(lat) - 1.18 - (n1 - 0.5) * 0.3) * 12);
          r = lerp(r, 238, cap); g = lerp(g, 228, cap); b = lerp(b, 222, cap);
          tex[v * TW + u] = rgbc(r, g, b);
        }
      }
      A.mars = tex;
    }
    // --- terrain: heights and colour maps (256 x 256, wraps)
    {
      const N = 256, h = fbmMap(N, 11, 6, 4, 0.52), n2 = fbmMap(N, 23, 4, 8, 0.55), ord = fbmMap(N, 31, 4, 4, 0.5);
      const R = CM.rng(99);
      for (let i = 0; i < N * N; i++) h[i] = Math.pow(h[i], 1.35);
      for (let k = 0; k < 18; k++) {
        const cx = R() * N, cy = R() * N, rr = 6 + R() * 22, dep = 0.06 + R() * 0.1;
        for (let y = Math.floor(cy - rr * 1.6); y < cy + rr * 1.6; y++) for (let x = Math.floor(cx - rr * 1.6); x < cx + rr * 1.6; x++) {
          const d = Math.hypot(x - cx, y - cy) / rr, i = ((y & 255) << 8) | (x & 255);
          if (d < 1) h[i] -= dep * (1 - d * d);
          else if (d < 1.6) h[i] += dep * 0.45 * Math.exp(-Math.pow((d - 1.05) / 0.18, 2));
        }
      }
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < N * N; i++) { lo = Math.min(lo, h[i]); hi = Math.max(hi, h[i]); }
      const HM = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) { h[i] = (h[i] - lo) / (hi - lo); HM[i] = h[i] * 86; }
      const L = [-0.55, -0.45, 0.7], ll = Math.hypot(...L);
      const day = new Uint32Array(N * N), dusk = new Uint32Array(N * N), green = new Uint32Array(N * N), gnight = new Uint32Array(N * N);
      const M1 = [96, 40, 26], M2 = [172, 78, 42], M3 = [212, 132, 76], M4 = [232, 176, 120];
      const G1 = [30, 92, 50], G2 = [58, 138, 60], G3 = [112, 162, 70], ROCK = [150, 124, 100];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const sx = (HM[y * N + ((x + 1) & 255)] - HM[y * N + ((x - 1) & 255)]) / 2;
        const sy = (HM[((y + 1) & 255) * N + x] - HM[((y - 1) & 255) * N + x]) / 2;
        const nl = Math.hypot(sx, sy, 1);
        const diff = Math.max(0, (-sx * L[0] - sy * L[1] + L[2]) / (nl * ll));
        const slope = Math.hypot(sx, sy);
        const m = clamp(h[i] * 0.55 + n2[i] * 0.6 - 0.1, 0, 1);
        const pick = (a, b, c, d, f) => (f < 0.33 ? a.map((v, j) => lerp(v, b[j], f / 0.33)) : f < 0.66 ? b.map((v, j) => lerp(v, c[j], (f - 0.33) / 0.33)) : c.map((v, j) => lerp(v, d[j], (f - 0.66) / 0.34)));
        const alb = pick(M1, M2, M3, M4, m);
        const k1 = 0.32 + 0.85 * diff, k2 = 0.16 + 0.42 * diff;
        day[i] = rgbc(alb[0] * k1, alb[1] * k1, alb[2] * k1);
        dusk[i] = rgbc(alb[0] * k2 + 10, alb[1] * k2 + 14, alb[2] * k2 + 34);
        let g = n2[i] < 0.5 ? G1.map((v, j) => lerp(v, G2[j], n2[i] * 2)) : G2.map((v, j) => lerp(v, G3[j], (n2[i] - 0.5) * 2));
        const rocky = smooth((slope - 2.2) / 2) * 0.8 + smooth((h[i] - 0.82) * 8) * 0.9;
        g = g.map((v, j) => lerp(v, ROCK[j], clamp(rocky, 0, 1)));
        let gr = g[0] * k1, gg = g[1] * k1, gb = g[2] * k1;
        const f = R();
        if (rocky < 0.3 && f < 0.035) { const fl = [[250, 120, 170], [250, 220, 90], [245, 245, 245]][Math.floor(f * 1000) % 3]; gr = fl[0] * k1; gg = fl[1] * k1; gb = fl[2] * k1; }
        green[i] = rgbc(gr, gg, gb);
        gnight[i] = rgbc(g[0] * (0.1 + 0.22 * diff) + 6, g[1] * (0.1 + 0.22 * diff) + 10, g[2] * (0.1 + 0.22 * diff) + 32);
      }
      // the order in which life spreads: from where the cat slept, with noise
      const ORD = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = Math.min(Math.abs(x - 128), 256 - Math.abs(x - 128)), dy = Math.min(Math.abs(y - 200), 256 - Math.abs(y - 200));
        ORD[y * N + x] = clamp(ord[y * N + x] * 0.85 + Math.hypot(dx, dy) / 256 * 0.25 - 0.04, 0, 1);
      }
      Object.assign(A, { h, HM, day, dusk, green, gnight, ORD });
    }
    // --- clouds for the terraformed sky
    {
      const N = 256, c = fbmMap(N, 57, 5, 4, 0.55);
      A.clouds = c;
    }
    // --- tables for tunnel, sunburst and plasma
    {
      const TW2 = W * 2, TH2 = H * 2;
      A.TA = new Uint16Array(TW2 * TH2); A.TD = new Uint16Array(TW2 * TH2); A.TS = new Float32Array(TW2 * TH2);
      for (let y = 0; y < TH2; y++) for (let x = 0; x < TW2; x++) {
        const dx = x - W + 0.5, dy = (y - H + 0.5) * 1.15, d = Math.hypot(dx, dy) + 0.01, i = y * TW2 + x;
        A.TA[i] = Math.floor((Math.atan2(dy, dx) / TAU + 0.5) * 256) & 255;
        A.TD[i] = Math.floor(8192 / d) & 0xffff;
        A.TS[i] = clamp((d - 6) / 110, 0, 1);
      }
      A.SA = new Float32Array(W * H); A.SD = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        A.SA[y * W + x] = Math.atan2(y + 0.5 - 96, x + 0.5 - 160) / TAU + 0.5;
        A.SD[y * W + x] = Math.hypot(x + 0.5 - 160, y + 0.5 - 96) / 190;
      }
    }
    // --- cat tiles for the tunnel and the rotozoomer
    {
      const saved = [px, SW, SH];
      const tile = new Uint32Array(64 * 64);
      target(tile, 64, 64);
      clear(hex('3a0f1e'));
      const R = CM.rng(3);
      for (let i = 0; i < 40; i++) pset(R() * 64, R() * 64, hex('ffd0a0'));
      catHead(32, 34, 17, { pal: PALS.ginger, mouth: 0.4, wide: 0.6 });
      A.tileTunnel = tile;
      const t2 = new Uint32Array(64 * 64);
      target(t2, 64, 64);
      const bgs = ['f4c040', '40b0e0', 'e85090', '60d070'];
      const pals = ['ginger', 'gray', 'black', 'white'];
      for (let q = 0; q < 4; q++) {
        const ox = (q & 1) * 32, oy = (q >> 1) * 32;
        rect(ox, oy, 32, 32, hex(bgs[q]));
        catHead(ox + 16, oy + 18, 9.5, { pal: PALS[pals[q]], mouth: q % 2 ? 0.5 : 0, wide: 0.5 });
      }
      A.tileRoto = t2;
      target(saved[0], saved[1], saved[2]);
    }
    // --- stars
    {
      const R = CM.rng(5);
      A.stars3 = [];
      for (let i = 0; i < 460; i++) A.stars3.push([R() * 2 - 1, R() * 2 - 1, R()]);
      A.stars2 = [];
      for (let i = 0; i < 300; i++) A.stars2.push({ x: R() * W, y: R() * H, b: 0.25 + R() * R() * 0.75, sp: 1 + R() * 4, ph: R() * TAU, tint: R() });
    }
    // --- the constellation, fireworks, bubbles
    {
      const chains = [
        [[50, 26], [56, 8], [66, 18], [78, 8], [84, 26], [72, 40], [50, 26]],
        [[56, 36], [40, 52], [30, 78], [36, 94], [66, 94], [70, 62], [72, 40]],
        [[30, 78], [12, 86], [6, 70], [14, 58]]
      ];
      const pts = [];
      const key = p => p.join(',');
      const seen = {};
      for (const ch of chains) for (const p of ch) if (!seen[key(p)]) { seen[key(p)] = pts.length; pts.push(p); }
      const segs = [];
      for (const ch of chains) for (let i = 0; i + 1 < ch.length; i++) segs.push([seen[key(ch[i])], seen[key(ch[i + 1])]]);
      A.cons = { pts, segs };
      const R = CM.rng(8);
      A.motes = [];
      for (let i = 0; i < 180; i++) A.motes.push({ x0: R() * W, k: i % pts.length, t0: T(16) + R() * 2.2, dur: 1.6 + R() * 1.6, sp: R() * TAU, r: 10 + R() * 30 });
      A.fireworks = [];
      for (let b = 56; b < 64; b++) {
        if (b === 58 || b === 59) continue;
        for (let q = 0; q < 2; q++) A.fireworks.push({ t0: T(b, q * 8) - 0.7, x: 40 + R() * 240, y: 24 + R() * 40, hue: R(), seed: b * 10 + q });
      }
      for (let k = 0; k < 7; k++) A.fireworks.push({ t0: T(64) + k * 0.9 + R() * 0.4, x: 30 + R() * 260, y: 20 + R() * 40, hue: R(), seed: 900 + k, small: 1 });
    }
    // --- Game of Life seed
    lifeSeed();
  }

  // ---------------------------------------------------------------- sync helpers
  function lastIdx(arr, t) {
    let lo = 0, hi = arr.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  function pulse(arr, t, k) { const i = lastIdx(arr, t); if (i < 0) return 0; return Math.exp(-(t - arr[i].t) * k) * (arr[i].v || 1); }
  function mouthAt(t) {
    const M = CM.audio && CM.audio.mouth;
    if (!M) return { open: 0, wide: 0.5, av: 0 };
    const f = t * 100, i = Math.floor(f), a = f - i;
    if (i < 0 || i * 3 + 5 >= M.length) return { open: 0, wide: 0.5, av: 0 };
    const av = lerp(M[i * 3], M[i * 3 + 3], a), f1 = lerp(M[i * 3 + 1], M[i * 3 + 4], a) || 500, f2 = lerp(M[i * 3 + 2], M[i * 3 + 5], a) || 1500;
    return { open: clamp(av * (f1 - 220) / 520, 0, 1), wide: clamp((f2 - 750) / 1500, 0, 1), av };
  }
  const SPEC = new Float32Array(32);
  const FFTN = 1024, fre = new Float64Array(FFTN), fim = new Float64Array(FFTN), HANN = new Float64Array(FFTN);
  for (let i = 0; i < FFTN; i++) HANN[i] = 0.5 - 0.5 * Math.cos(TAU * i / FFTN);
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  function spectrum(t, nb) {
    const au = CM.audio;
    SPEC.fill(0);
    if (!au || !au.L) return SPEC;
    const i0 = Math.floor(t * S.SR) - FFTN / 2;
    for (let k = 0; k < FFTN; k++) {
      const j = i0 + k;
      fre[k] = j >= 0 && j < au.L.length ? (au.L[j] + au.R[j]) * 0.5 * HANN[k] : 0;
      fim[k] = 0;
    }
    fft(fre, fim);
    for (let b = 0; b < nb; b++) {
      const k0 = Math.floor(2 * Math.pow(180, b / nb)), k1 = Math.max(k0 + 1, Math.floor(2 * Math.pow(180, (b + 1) / nb)));
      let s = 0;
      for (let k = k0; k < k1; k++) s += Math.hypot(fre[k], fim[k]);
      s /= (k1 - k0);
      SPEC[b] = clamp((20 * Math.log10(s + 1e-6) + 8) / 42, 0, 1);
    }
    return SPEC;
  }
  function activeLine(t, voices) {
    let best = null;
    for (const L of S.lines) {
      if (voices && voices.indexOf(L.voice) < 0) continue;
      if (t >= L.t0 - 0.75 && t <= L.t1 + 0.45) best = L;
    }
    return best;
  }

  // ---------------------------------------------------------------- the cats
  const PALS = {
    ginger: { base: hex('e88c3c'), dark: hex('a8541c'), light: hex('f8dcb4'), ear: hex('f0a0a0'), nose: hex('e87888'), eye: hex('86d84a'), stripes: true },
    gray: { base: hex('9c9caa'), dark: hex('5c5c6a'), light: hex('e2e2ea'), ear: hex('e8a8b0'), nose: hex('d87888'), eye: hex('ecd040'), stripes: true },
    black: { base: hex('34343e'), dark: hex('18181e'), light: hex('62627a'), ear: hex('8a5a64'), nose: hex('7a4a54'), eye: hex('ecd040'), stripes: false },
    white: { base: hex('ececec'), dark: hex('b4b4c0'), light: hex('ffffff'), ear: hex('f4b0b8'), nose: hex('f08898'), eye: hex('58a8f0'), stripes: false },
    calico: { base: hex('f2e8da'), dark: hex('d07830'), light: hex('ffffff'), ear: hex('f0a8a8'), nose: hex('e88898'), eye: hex('86d84a'), stripes: false, patches: hex('3a3232') }
  };
  const MOUTH = hex('4a1018'), TONGUE = hex('f07888'), WHISK = hex('f0f0f0'), SUIT = hex('e8eaf0'), SUITD = hex('a8acb8');
  const TF = { x: 0, y: 0, s: 1, c: 1, si: 0, m: 1 };
  function tfSet(x, y, s, rot, mirror) { TF.x = x; TF.y = y; TF.s = s; TF.c = Math.cos(rot || 0); TF.si = Math.sin(rot || 0); TF.m = mirror || 1; }
  const tx = (u, v) => { u *= TF.m; return TF.x + TF.s * (u * TF.c - v * TF.si); };
  const ty = (u, v) => { u *= TF.m; return TF.y + TF.s * (u * TF.si + v * TF.c); };
  function tEll(u, v, rx, ry, col) {
    const n = Math.max(8, Math.min(48, Math.round((rx + ry) * TF.s * 1.3)));
    const p = new Array(n * 2);
    for (let i = 0; i < n; i++) { const a = i / n * TAU, uu = u + rx * Math.cos(a), vv = v + ry * Math.sin(a); p[2 * i] = tx(uu, vv); p[2 * i + 1] = ty(uu, vv); }
    poly(p, col);
  }
  function tPoly(q, col) { const p = []; for (let i = 0; i < q.length; i += 2) p.push(tx(q[i], q[i + 1]), ty(q[i], q[i + 1])); poly(p, col); }
  function tLine(u0, v0, u1, v1, col) { line(tx(u0, v0), ty(u0, v0), tx(u1, v1), ty(u1, v1), col); }
  function tThick(u0, v0, u1, v1, w, col) { thick(tx(u0, v0), ty(u0, v0), tx(u1, v1), ty(u1, v1), Math.max(1, w * TF.s), col); }
  function tCurve(q, w0, w1, col) {
    const n = q.length / 2;
    for (let i = 0; i < n - 1; i++) tThick(q[2 * i], q[2 * i + 1], q[2 * i + 2], q[2 * i + 3], lerp(w0, w1, i / Math.max(1, n - 2)), col);
  }
  function helmet(cx, cy, r, t) {
    discBlend(cx, cy, r, hex('a0d8ff'), 0.13);
    ringBlend(cx, cy, r - Math.max(1, r * 0.06), r, hex('e8f6ff'), 0.75);
    for (let k = 0; k < 6; k++) {
      const a = -2.3 + k * 0.12;
      blend(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, WHITE, 0.85);
      if (r > 20) blend(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74, WHITE, 0.6);
    }
  }
  function catHead(x, y, s, o) {
    const P = o.pal;
    tfSet(x, y, s, o.tilt || 0, 1);
    tPoly([-0.98, -0.18, -0.8, -1.25, -0.2, -0.8], P.base); tPoly([0.98, -0.18, 0.8, -1.25, 0.2, -0.8], P.base);
    tPoly([-0.82, -0.32, -0.74, -1.0, -0.42, -0.74], P.ear); tPoly([0.82, -0.32, 0.74, -1.0, 0.42, -0.74], P.ear);
    tEll(0, 0, 1.0, 0.82, P.base); tEll(-0.48, 0.3, 0.56, 0.4, P.base); tEll(0.48, 0.3, 0.56, 0.4, P.base);
    if (P.patches) { tEll(-0.5, -0.45, 0.36, 0.3, P.dark); tEll(0.52, -0.5, 0.3, 0.26, P.patches); }
    if (P.stripes) {
      tPoly([-0.1, -0.82, 0.1, -0.82, 0, -0.5], P.dark); tPoly([-0.42, -0.76, -0.24, -0.81, -0.3, -0.55], P.dark);
      tPoly([0.42, -0.76, 0.24, -0.81, 0.3, -0.55], P.dark);
      tPoly([-1.02, 0.05, -0.74, 0.03, -0.98, 0.17], P.dark); tPoly([1.02, 0.05, 0.74, 0.03, 0.98, 0.17], P.dark);
    }
    tEll(-0.16, 0.42, 0.22, 0.17, P.light); tEll(0.16, 0.42, 0.22, 0.17, P.light);
    const bl = o.blink || 0, lk = (o.look || 0) * 0.06;
    for (const sx of [-1, 1]) {
      const ex = 0.37 * sx, ey = -0.1;
      if (bl < 0.8) {
        tEll(ex, ey, 0.205, 0.235 * (1 - bl), hex('1a1010'));
        tEll(ex, ey, 0.17, 0.2 * (1 - bl), P.eye);
        tEll(ex + lk, ey, 0.055 + (o.dilate || 0) * 0.07, 0.18 * (1 - bl), hex('0c0808'));
        if (bl < 0.4) { const hx = tx(ex - 0.07, ey - 0.08), hy = ty(ex - 0.07, ey - 0.08); pset(hx, hy, WHITE); if (s > 24) { pset(hx + 1, hy, WHITE); pset(hx, hy + 1, WHITE); } }
      } else {
        tThick(ex - 0.16, ey, ex, ey + 0.07, 0.055, hex('1a1010'));
        tThick(ex, ey + 0.07, ex + 0.16, ey, 0.055, hex('1a1010'));
      }
    }
    tPoly([-0.1, 0.2, 0.1, 0.2, 0, 0.31], P.nose);
    const mo = o.mouth || 0, mw = o.wide === undefined ? 0.5 : o.wide;
    if (mo > 0.06) {
      const h = 0.05 + 0.26 * mo, w = 0.1 + 0.13 * mw;
      tEll(0, 0.34 + h, w, h, MOUTH);
      tEll(0, 0.34 + h * 1.5, w * 0.68, h * 0.45, TONGUE);
    } else {
      tLine(0, 0.31, -0.13, 0.43, P.dark); tLine(0, 0.31, 0.13, 0.43, P.dark);
    }
    if (s >= 7) for (const sx of [-1, 1]) for (let k = -1; k <= 1; k++) tLine(0.32 * sx, 0.38 + k * 0.05, 1.3 * sx, 0.24 + k * 0.17, WHISK);
  }
  function catSit(x, y, s, o) {
    const P = o.pal, sq = o.squash || 0, t = o.t || 0;
    tfSet(x, y, s, 0, 1);
    const sw = Math.sin(t * 3.1 + (o.phase || 0));
    tCurve([0.55, -0.3, 1.2, -0.55, 1.45 + sw * 0.25, -1.25, 1.2 + sw * 0.6, -2.0], 0.34, 0.22, P.base);
    const bh = 1.05 * (1 - sq * 0.13);
    tEll(0, -bh, 0.82, bh, P.base);
    if (P.patches) tEll(0.35, -bh * 1.2, 0.36, 0.42, P.patches);
    tEll(0, -bh * 1.05, 0.42, bh * 0.62, P.light);
    tEll(-0.55, -0.42, 0.42, 0.42, P.base); tEll(0.55, -0.42, 0.42, 0.42, P.base);
    for (const [sx, a] of [[-1, o.armL || 0], [1, o.armR || 0]]) {
      const shx = 0.45 * sx, shy = -bh * 1.5;
      const ex = lerp(0.3 * sx, 1.05 * sx, a), ey = lerp(-0.1, -bh * 2.55, a);
      tThick(shx, shy, ex, ey, 0.3, P.base);
      tEll(ex, ey, 0.2, 0.15, P.light);
    }
    const hx = tx(0, -bh * 2 - 0.5), hy = ty(0, -bh * 2 - 0.5);
    catHead(hx, hy, s, { pal: P, tilt: o.tilt, mouth: o.mouth, wide: o.wide, blink: o.blink, look: o.look });
    if (o.helmet) helmet(hx, hy - s * 0.15, s * 1.45, t);
  }
  function catSide(x, y, s, o) {
    const P = o.pal, ph = o.walk || 0, t = o.t || 0;
    tfSet(x, y, s, 0, o.dir || 1);
    const bob = Math.abs(Math.sin(ph)) * 0.08;
    const body = o.suit ? SUIT : P.base, bodyD = o.suit ? SUITD : P.dark;
    const sw = Math.sin(t * 2.4 + 1) * 0.25;
    tCurve([-1.3, -1.5 - bob, -1.9, -1.9, -2.1 + sw, -2.7, -1.8 + sw, -3.15], 0.34, 0.22, P.base);
    const leg = (hx, phase, col) => {
      const a = ph + phase, fx = hx + 0.38 * Math.sin(a), fy = -Math.max(0, Math.cos(a)) * 0.3;
      tThick(hx, -1.05 - bob, fx, fy - 0.14, 0.36, col);
      tEll(fx + 0.1, fy - 0.1, 0.22, 0.13, col);
    };
    leg(-0.85, Math.PI, bodyD); leg(0.9, 0, bodyD);
    tEll(0, -1.38 - bob, 1.45, 0.72, body);
    if (o.suit) {
      tPoly([-1.25, -2.0 - bob, -0.35, -2.25 - bob, -0.35, -1.45 - bob, -1.2, -1.4 - bob], SUITD);
      tEll(0.2, -1.3 - bob, 0.25, 0.2, hex('e05040'));
    } else if (P.stripes) for (const k of [-0.7, -0.2, 0.3]) tPoly([k - 0.12, -2.05 - bob, k + 0.12, -2.08 - bob, k + 0.02, -1.75 - bob], P.dark);
    leg(-0.6, 0, body); leg(1.15, Math.PI, body);
    const hx = 1.42, hy = -2.05 - bob;
    tPoly([hx - 0.45, hy - 0.35, hx - 0.3, hy - 1.05, hx + 0.05, hy - 0.55], P.base);
    tPoly([hx + 0.15, hy - 0.5, hx + 0.45, hy - 1.08, hx + 0.62, hy - 0.32], P.base);
    tPoly([hx + 0.25, hy - 0.5, hx + 0.44, hy - 0.9, hx + 0.52, hy - 0.4], P.ear);
    tEll(hx, hy, 0.72, 0.62, P.base);
    if (P.stripes) tPoly([hx - 0.25, hy - 0.6, hx - 0.05, hy - 0.62, hx - 0.15, hy - 0.35], P.dark);
    tEll(hx + 0.5, hy + 0.2, 0.32, 0.22, P.light);
    if (o.blink) tThick(hx + 0.2, hy - 0.08, hx + 0.42, hy - 0.06, 0.06, hex('1a1010'));
    else { tEll(hx + 0.32, hy - 0.1, 0.12, 0.15, P.eye); tEll(hx + 0.36, hy - 0.1, 0.045, 0.13, hex('0c0808')); }
    tEll(hx + 0.8, hy + 0.06, 0.08, 0.06, P.nose);
    if (s >= 6) { tLine(hx + 0.6, hy + 0.22, hx + 1.45, hy + 0.08, WHISK); tLine(hx + 0.6, hy + 0.28, hx + 1.4, hy + 0.36, WHISK); }
    if (o.helmet) helmet(tx(hx + 0.1, hy - 0.05), ty(hx + 0.1, hy - 0.05), s * 1.08, t);
  }
  function catSitSide(x, y, s, o) {
    const P = o.pal, sil = o.sil, t = o.t || 0, c = k => (sil !== undefined ? sil : P[k]);
    tfSet(x, y, s, 0, o.dir || 1);
    const sw = Math.sin(t * 1.7) * 0.15;
    tCurve([-0.45, -0.12, -1.1, -0.1, -1.55, -0.32 + sw, -1.6, -0.75 + sw], 0.32, 0.22, c('base'));
    tEll(-0.05, -1.0, 0.72, 1.0, c('base'));
    tEll(0.38, -0.95, 0.3, 0.75, c('light'));
    tEll(0.5, -0.12, 0.32, 0.14, c('light'));
    const up = o.lookUp || 0, hx = 0.32 + up * 0.05, hy = -2.05 - up * 0.05;
    tfSet(tx(hx, hy), ty(hx, hy), s, -up * 0.45 * (o.dir || 1), o.dir || 1);
    tPoly([-0.42, -0.3, -0.32, -0.98, 0.02, -0.5], c('base'));
    tPoly([0.12, -0.45, 0.42, -0.98, 0.58, -0.28], c('base'));
    if (sil === undefined) tPoly([0.22, -0.48, 0.41, -0.84, 0.49, -0.36], P.ear);
    tEll(0, 0, 0.62, 0.55, c('base'));
    if (sil === undefined) {
      tEll(0.42, 0.18, 0.28, 0.2, P.light);
      tEll(0.28, -0.1, 0.11, 0.14, P.eye); tEll(0.31, -0.1, 0.04, 0.12, hex('0c0808'));
      tEll(0.68, 0.06, 0.07, 0.055, P.nose);
      if (s > 7) { tLine(0.5, 0.22, 1.25, 0.1, WHISK); tLine(0.5, 0.27, 1.2, 0.36, WHISK); }
    }
    if (o.helmet) helmet(tx(0.05, -0.05), ty(0.05, -0.05), s * 0.95, t);
  }
  function catSleep(x, y, s, o) {
    const P = o.pal, br = 1 + 0.04 * Math.sin((o.t || 0) * 2.6 + (o.phase || 0));
    tfSet(x, y, s, 0, o.dir || 1);
    tEll(0, -0.78 * br, 1.65, 0.8 * br, P.base);
    if (P.stripes) for (const k of [-0.9, -0.35, 0.2]) tPoly([k - 0.13, -1.5 * br, k + 0.13, -1.53 * br, k + 0.02, -1.18 * br], P.dark);
    if (P.patches) tEll(-0.45, -1.05 * br, 0.55, 0.35, P.patches);
    tCurve([-1.5, -0.4, -1.15, -0.08, -0.25, 0.02, 0.6, -0.04, 1.15, -0.2], 0.36, 0.28, P.base);
    tCurve([0.6, -0.04, 1.15, -0.2], 0.3, 0.27, P.dark);
    const hx = 1.05, hy = -0.62;
    tPoly([hx - 0.15, hy - 0.42, hx + 0.08, hy - 1.0, hx + 0.38, hy - 0.5], P.base);
    tPoly([hx + 0.35, hy - 0.45, hx + 0.78, hy - 0.86, hx + 0.74, hy - 0.22], P.base);
    tEll(hx, hy, 0.68, 0.56, P.base);
    tEll(hx + 0.34, hy + 0.2, 0.3, 0.2, P.light);
    tThick(hx + 0.02, hy - 0.06, hx + 0.26, hy - 0.01, 0.07, hex('1a1010'));
    tEll(hx + 0.62, hy + 0.1, 0.065, 0.05, P.nose);
  }
  function catBack(x, y, s, col) {
    tfSet(x, y, s, 0, 1);
    tEll(0, -1.0, 0.8, 1.0, col);
    tEll(0, -2.15, 0.62, 0.56, col);
    tPoly([-0.55, -2.3, -0.42, -3.0, -0.08, -2.62], col);
    tPoly([0.55, -2.3, 0.42, -3.0, 0.08, -2.62], col);
  }
  // two tails that meet on the ground and draw a heart
  function heartTails(xl, xr, cx, by, k, grow, col) {
    thick(xl, by - 1, cx, by - 1, 2.2, col); thick(xr, by - 1, cx, by - 1, 2.2, col);
    for (const side of [-1, 1]) {
      let lx = cx, ly = by;
      const n = 16;
      for (let i = 1; i <= n * grow; i++) {
        const th = Math.PI - i / n * Math.PI;
        const x = cx + side * 16 * Math.pow(Math.sin(th), 3) * k;
        const y = by - (13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th) + 17) * k;
        thick(lx, ly, x, y, lerp(2.4, 1.6, i / n), col);
        lx = x; ly = y;
      }
    }
  }

  // ---------------------------------------------------------------- effects
  function stars3d(t, speed, cx, cy, fade) {
    for (const s of A.stars3) {
      const z = fract(s[2] - t * speed);
      if (z < 0.03) continue;
      const sx = cx + s[0] / z * 90, sy = cy + s[1] / z * 90;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const b = clamp((1 - z) * 1.5, 0, 1) * fade * 255;
      addPx(sx, sy, b, b, b);
      if (z < 0.3) addPx(sx + 1, sy, b * 0.5, b * 0.5, b * 0.5);
    }
  }
  function starsStatic(t, a, yMax) {
    for (const s of A.stars2) {
      if (s.y > yMax) continue;
      const v = s.b * (0.65 + 0.35 * Math.sin(t * s.sp + s.ph)) * a * 255;
      addPx(s.x, s.y, v * (0.85 + s.tint * 0.15), v * 0.9, v * (1.05 - s.tint * 0.2));
    }
  }
  function planet(cx, cy, R, rot, light, o) {
    o = o || {};
    const tex = A.mars, TW = 256, TH = 128;
    const [lx, ly, lz] = light;
    const ar = o.atmo ? 230 : 0, ag = o.atmo ? 140 : 0, ab = o.atmo ? 110 : 0;
    const detail = o.detail || 0;
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) {
      const ny = (y + 0.5 - cy) / R;
      if (ny * ny >= 1) continue;
      const half = Math.sqrt(1 - ny * ny) * R;
      const x0 = Math.max(0, Math.floor(cx - half)), x1 = Math.min(W - 1, Math.ceil(cx + half));
      const lat = Math.asin(-ny), v = clamp(Math.floor((0.5 - lat / Math.PI) * TH), 0, TH - 1);
      const vf = (0.5 - lat / Math.PI) * TH * 8;
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / R, d = nx * nx + ny * ny;
        if (d >= 1) continue;
        const nz = Math.sqrt(1 - d);
        const uf = fract((Math.atan2(nx, nz) + rot) / TAU) * TW;
        let c;
        if (detail > 0) {
          const fv = clamp((0.5 - lat / Math.PI) * TH - 0.5, 0, TH - 1.001), j = fv | 0, fy = fv - j;
          const fu = uf - 0.5 + TW, i = fu | 0, fx = fu - i, i0 = i & 255, i1 = (i + 1) & 255;
          const a = tex[j * TW + i0], b = tex[j * TW + i1], d = tex[(j + 1) * TW + i0], e = tex[(j + 1) * TW + i1];
          const w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
          c = rgb(R_(a) * w0 + R_(b) * w1 + R_(d) * w2 + R_(e) * w3, G_(a) * w0 + G_(b) * w1 + G_(d) * w2 + G_(e) * w3, B_(a) * w0 + B_(b) * w1 + B_(d) * w2 + B_(e) * w3);
        } else c = tex[v * TW + (uf | 0)];
        const lam = Math.max(0, nx * lx + ny * ly + nz * lz);
        let k = 0.04 + 0.96 * lam;
        if (detail > 0) k *= 1 + detail * (R_(tex[((vf | 0) & 127) * TW + ((uf * 8) & 255)]) / 255 - 0.5) * 0.6;
        const hz = Math.pow(1 - nz, 2.5) * (0.25 + lam) * 0.9;
        px[y * W + x] = rgbc(R_(c) * k + ar * hz, G_(c) * k + ag * hz, B_(c) * k + ab * hz);
      }
    }
    if (o.atmo && R < 400) {
      const r1 = R * 1.12;
      const ya = Math.max(0, Math.floor(cy - r1)), yb = Math.min(H - 1, Math.ceil(cy + r1));
      for (let y = ya; y <= yb; y++) for (let x = Math.max(0, Math.floor(cx - r1)); x <= Math.min(W - 1, Math.ceil(cx + r1)); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        if (d < R || d >= r1) continue;
        const f = Math.pow(1 - (d - R) / (r1 - R), 2) * clamp(0.3 + (dx * lx + dy * ly) / d, 0, 1);
        addI(y * W + x, 200 * f, 110 * f, 90 * f);
      }
    }
  }
  function moon(x, y, r, lit, seed) {
    const R = CM.rng(seed);
    const n = Math.max(8, Math.round(r * 3)), p = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = r * (0.82 + R() * 0.3) * (i % 2 ? 1 : 0.95); p.push(x + Math.cos(a) * rr * 1.25, y + Math.sin(a) * rr); }
    poly(p, shade(hex('8a7f78'), 0.35 + lit * 0.4));
    discBlend(x - r * 0.3, y - r * 0.2, r * 0.75, hex('c8beb4'), 0.55 * lit);
    if (r > 4) for (let k = 0; k < 3; k++) circle(x + (R() - 0.5) * r * 1.4, y + (R() - 0.5) * r, Math.max(1, r * 0.18), shade(hex('6a605a'), 0.5 + lit * 0.3));
  }
  function sunDisc(x, y, r, col, gr, gg, gb, gk) { glow(x, y, r * 7, gr, gg, gb, gk); circle(x, y, r, col); }

  const YB = new Float32Array(W);
  function groundH(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, HM = A.HM;
    const a = HM[((yi & 255) << 8) | (xi & 255)], b = HM[((yi & 255) << 8) | ((xi + 1) & 255)];
    const c = HM[(((yi + 1) & 255) << 8) | (xi & 255)], d = HM[(((yi + 1) & 255) << 8) | ((xi + 1) & 255)];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }
  function camAlt(x, y, ang, over) {
    let m = 0;
    for (const d of [0, 10, 22, 40, 60]) m = Math.max(m, groundH(x + Math.cos(ang) * d, y + Math.sin(ang) * d) - d * 0.12);
    return m + over;
  }
  function voxel(cam, o) {
    const HM = A.HM, cm = o.cm, cm2 = o.cm2, ORD = A.ORD, L = o.life || 0;
    const far = o.far || 280, scaleH = o.scaleH || 120, hor = cam.horizon, fov = o.fov || 0.8;
    const fr = R_(o.fog), fg = G_(o.fog), fb = B_(o.fog);
    const water = o.water !== undefined ? o.water : -1, wc = o.waterCol || hex('3a78c8');
    YB.fill(H);
    const sa = Math.sin(cam.ang), ca = Math.cos(cam.ang);
    let z = 1.2, dz = 0.3;
    while (z < far) {
      const cx = cam.x + ca * z, cy = cam.y + sa * z;
      let mx = cx + sa * z * fov, my = cy - ca * z * fov;
      const dx = -2 * sa * z * fov / W, dy = 2 * ca * z * fov / W;
      const fk = clamp((z - far * 0.3) / (far * 0.7), 0, 1), fk2 = fk * fk;
      const inv = scaleH / z;
      for (let i = 0; i < W; i++) {
        const idx = (((my | 0) & 255) << 8) | ((mx | 0) & 255);
        let h = HM[idx];
        const isW = h < water && L > ORD[idx] + 0.02;
        if (isW) h = water;
        const ys = (cam.z - h) * inv + hor;
        const yb = YB[i];
        if (ys < yb) {
          let c;
          if (isW) {
            const sh = 0.82 + 0.18 * Math.sin(mx * 0.9 + (o.t || 0) * 3 + my * 0.4);
            c = shade(wc, sh);
          } else {
            c = cm[idx];
            if (cm2 && L > 0) { const lf = (L - ORD[idx]) * 9; if (lf > 0) c = lf >= 1 ? cm2[idx] : mix(c, cm2[idx], lf); }
          }
          if (fk2 > 0) c = rgb(R_(c) + (fr - R_(c)) * fk2, G_(c) + (fg - G_(c)) * fk2, B_(c) + (fb - B_(c)) * fk2);
          const ya = Math.max(0, Math.ceil(ys));
          for (let y = ya; y < yb; y++) px[y * W + i] = c;
          YB[i] = ya;
        }
        mx += dx; my += dy;
      }
      z += dz; dz += 0.011;
    }
  }
  function copperBar(y, h, col, a) {
    for (let j = -h; j <= h; j++) {
      const yy = Math.round(y + j);
      if (yy < 0 || yy >= H) continue;
      const k = 1 - Math.abs(j) / (h + 1), c = mix(BLACK, col, Math.pow(k, 0.7));
      const hl = Math.pow(k, 8) * 0.8;
      const cc = mix(c, WHITE, hl);
      if (a >= 1) px.fill(cc, yy * W, yy * W + W);
      else for (let x = 0; x < W; x++) blendI(yy * W + x, cc, a);
    }
  }
  function plasma(t, pal, y0, y1, sc) {
    sc = sc || 1;
    for (let y = y0; y < y1; y++) {
      const sy = Math.sin(y * 0.06 * sc - t * 1.3);
      for (let x = 0; x < W; x++) {
        const v = Math.sin(x * 0.045 * sc + t) + sy + Math.sin((x + y) * 0.035 * sc + t * 0.7) + Math.sin(Math.hypot(x - 160, y - 90) * 0.07 * sc - t * 2);
        px[y * W + x] = pal[((v + 4) * 32 + t * 40) & 255];
      }
    }
  }
  function palette(stops) {
    const p = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const f = i / 256 * stops.length, k = Math.floor(f), a = f - k;
      p[i] = mix(stops[k % stops.length], stops[(k + 1) % stops.length], smooth(a));
    }
    return p;
  }
  const PAL_MARS = palette([hex('2a0610'), hex('8a1a20'), hex('e05a20'), hex('f8b040'), hex('e05a20'), hex('8a1a20')]);
  const PAL_RAINBOW = palette([hex('ff3a6a'), hex('ffa030'), hex('f8f050'), hex('50e070'), hex('40a8ff'), hex('9a5aff')]);
  const PAL_NIGHT = palette([hex('0a0420'), hex('3a1060'), hex('a02a80'), hex('ff6a60'), hex('a02a80'), hex('3a1060')]);
  function sunburst(t, n, c1, c2, rotSpeed) {
    const SA = A.SA, SD = A.SD, sh = t * rotSpeed;
    for (let i = 0; i < W * H; i++) {
      const s = Math.floor(SA[i] * n + sh) & 1;
      const d = clamp(SD[i], 0, 1);
      px[i] = mix(s ? c1 : c2, BLACK, d * 0.55);
    }
  }
  function tunnel(t, tex, ox, oy, su, sv) {
    const TA = A.TA, TD = A.TD, TS = A.TS, TW2 = W * 2;
    ox = clamp(Math.round(ox), 0, W); oy = clamp(Math.round(oy), 0, H);
    for (let y = 0; y < H; y++) {
      let i = (y + oy) * TW2 + ox;
      for (let x = 0; x < W; x++, i++) {
        const u = ((TA[i] << 1) + su) & 63, v = (TD[i] + sv) & 63;
        const c = tex[(v << 6) | u], k = TS[i];
        px[y * W + x] = rgb(R_(c) * k, G_(c) * k, B_(c) * k);
      }
    }
  }
  function rotozoom(tex, ang, zoom, ou, ov, dim) {
    const ca = Math.cos(ang) * zoom, sa = Math.sin(ang) * zoom;
    for (let y = 0; y < H; y++) {
      let u = -160 * ca - (y - 90) * sa + ou + 65536, v = -160 * sa + (y - 90) * ca + ov + 65536;
      for (let x = 0; x < W; x++) {
        const c = tex[((v & 63) << 6) | (u & 63)];
        px[y * W + x] = dim < 1 ? rgb(R_(c) * dim, G_(c) * dim, B_(c) * dim) : c;
        u += ca; v += sa;
      }
    }
  }
  function ball(x, y, r, cr, cg, cb) {
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    for (let yy = y0; yy <= y1; yy++) for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++) {
      const nx = (xx + 0.5 - x) / r, ny = (yy + 0.5 - y) / r, d = nx * nx + ny * ny;
      if (d >= 1) continue;
      const nz = Math.sqrt(1 - d), l = Math.max(0, -0.45 * nx - 0.55 * ny + 0.7 * nz);
      const k = 0.22 + 0.85 * l, sp = Math.pow(l, 14) * 230;
      px[yy * W + xx] = rgbc(cr * k + sp, cg * k + sp, cb * k + sp);
    }
  }
  function fireworks(t) {
    for (const f of A.fireworks) {
      const tau = t - f.t0;
      if (tau < 0 || tau > 2.6) continue;
      const col = hsv(f.hue, 0.55, 1), r = R_(col), g = G_(col), b = B_(col);
      if (tau < 0.7) {
        const p = tau / 0.7, y = lerp(H + 4, f.y, 1 - (1 - p) * (1 - p)), x = f.x + Math.sin(p * 9) * 1.5;
        addPx(x, y, 255, 220, 160); addPx(x, y + 1, 160, 100, 60); addPx(x, y + 2, 80, 40, 20);
        continue;
      }
      const e = tau - 0.7, Rn = CM.rng(f.seed), n = f.small ? 28 : 44;
      const fade = clamp(1 - e / 1.8, 0, 1);
      if (e < 0.12) glow(f.x, f.y, 14, r, g, b, (1 - e / 0.12) * 0.9);
      for (let k = 0; k < n; k++) {
        const ang = k / n * TAU + Rn() * 0.15, sp = (f.small ? 22 : 34) * (0.6 + Rn() * 0.5);
        for (let j = 0; j < 4; j++) {
          const ee = Math.max(0, e - j * 0.05), d = sp * ee * (1 - 0.32 * ee);
          const x = f.x + Math.cos(ang) * d, y = f.y + Math.sin(ang) * d + 14 * ee * ee;
          const a = fade * (1 - j * 0.24) * (0.7 + 0.3 * Math.sin(t * 30 + k));
          addPx(x, y, r * a, g * a, b * a);
        }
      }
    }
  }
  function gridFloor(t, hor, bg1, bg2, lineCol, speed) {
    vgrad(hor, H, [[0, bg1], [1, bg2]]);
    const ph = fract(t * speed);
    for (let k = 1; k < 40; k++) {
      const z = k - ph;
      if (z < 0.35) continue;
      const y = hor + 26 / z;
      if (y >= H) continue;
      const a = clamp(1.4 / z, 0.15, 1);
      const yy = Math.floor(y);
      for (let x = 0; x < W; x++) blendI(yy * W + x, lineCol, a);
    }
    for (let j = -14; j <= 14; j++) {
      const x1 = 160 + j * (H - hor) * 1.6;
      const n = H - hor;
      for (let i = 0; i < n; i++) { const y = hor + i, x = lerp(160, x1, i / n); blend(x, y, lineCol, clamp(i / n * 1.5, 0.1, 0.9)); }
    }
  }
  function sineScroller(s, t, y, sc, speed, amp, colFn) {
    const tw = textW(s, sc) + W;
    const off = W - ((t * speed) % tw);
    s = s.toUpperCase();
    for (let i = 0; i < s.length; i++) {
      const x = off + i * 6 * sc;
      if (x < -6 * sc || x > W) continue;
      const yy = y + Math.sin(x * 0.03 + t * 3) * amp;
      const c = colFn(i, x);
      glyph(s[i], Math.round(x) + sc, Math.round(yy) + sc, sc, BLACK);
      glyph(s[i], Math.round(x), Math.round(yy), sc, c);
    }
  }
  function equalizer(t, x0, y0, w, h, nb, colFn) {
    const sp = spectrum(t, nb), bw = w / nb;
    for (let b = 0; b < nb; b++) {
      const v = sp[b], hh = Math.round(v * h);
      for (let j = 0; j < hh; j += 2) rect(x0 + b * bw, y0 - j - 1, bw - 1, 1, colFn(j / h, b));
    }
  }

  // Game of Life (80x45), stepped in sync with the 16th notes
  const LW = 80, LH = 45;
  let lifeA = new Uint8Array(LW * LH), lifeB = new Uint8Array(LW * LH), lifeHeat = new Float32Array(LW * LH), lifeGen = 0, lifeSeedA = null;
  function lifeSeed() {
    if (!lifeSeedA) {
      const s = new Uint8Array(LW * LH), put = (x, y) => { s[((y + LH) % LH) * LW + ((x + LW) % LW)] = 1; };
      const gun = ['........................O', '......................O.O', '............OO......OO............OO', '...........O...O....OO............OO',
        'OO........O.....O...OO', 'OO........O...O.OO....O.O', '..........O.....O.......O', '...........O...O', '............OO'];
      gun.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch === 'O') put(2 + x, 2 + y); }));
      const cat = ['#.......#', '##.....##', '#.#####.#', '#.......#', '#..#.#..#', '#.......#', '#...#...#', '.#######.'];
      cat.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch === '#') put(36 + x, 24 + y); }));
      [[0, 1], [1, 0], [-1, 1], [0, 1], [0, 2]].forEach(([dx, dy]) => put(62 + dx, 30 + dy));
      const R = CM.rng(42);
      for (let y = 4; y < 18; y++) for (let x = 48; x < 76; x++) if (R() < 0.33) put(x, y);
      for (let k = 0; k < 4; k++) { const gx = 10 + k * 14, gy = 34; [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]].forEach(([dx, dy]) => put(gx + dx, gy + dy)); }
      lifeSeedA = s;
    }
    lifeA.set(lifeSeedA); lifeHeat.fill(0);
    for (let i = 0; i < lifeA.length; i++) if (lifeA[i]) lifeHeat[i] = 1;
    lifeGen = 0;
  }
  function lifeTo(gen) {
    if (gen < lifeGen) lifeSeed();
    while (lifeGen < gen) {
      for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += lifeA[((y + dy + LH) % LH) * LW + ((x + dx + LW) % LW)];
        const i = y * LW + x, alive = lifeA[i];
        lifeB[i] = (n === 3 || (alive && n === 2)) ? 1 : 0;
      }
      const tmp = lifeA; lifeA = lifeB; lifeB = tmp;
      for (let i = 0; i < lifeA.length; i++) lifeHeat[i] = lifeA[i] ? 1 : lifeHeat[i] * 0.72;
      lifeGen++;
    }
  }

  // ---------------------------------------------------------------- overlays
  const HL = hex('ffc838'), TXT = hex('f0f0f0');
  function karaoke(t, y) {
    const L = activeLine(t, ['lead']);
    if (!L) return;
    y = y === undefined ? 168 : y;
    const a = clamp(Math.min((t - (L.t0 - 0.75)) / 0.25, (L.t1 + 0.45 - t) / 0.3), 0, 1);
    if (a <= 0) return;
    const s = L.text.toUpperCase(), x0 = Math.round((W - textW(s, 1)) / 2);
    rectBlend(x0 - 4, y - 3, textW(s, 1) + 8, 13, BLACK, 0.45 * a);
    const sung = new Float32Array(s.length);
    for (const n of L.notes) {
      const p = clamp((t - n.t) / Math.max(0.1, Math.min(n.d, 0.5)), 0, 1);
      for (let c = n.c0; c < n.c1; c++) sung[c] = clamp(p * (n.c1 - n.c0) - (c - n.c0), 0, 1) > 0 ? 1 : 0;
    }
    for (let i = 0; i < s.length; i++) {
      if (s[i] === ' ') continue;
      const x = x0 + i * 6, c = sung[i] ? HL : TXT, lift = sung[i] ? 0 : 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) glyph(s[i], x + dx, y + dy - lift, 1, BLACK);
      glyph(s[i], x, y - lift, 1, a < 1 ? mix(BLACK, c, a) : c);
    }
  }
  function currentWord(t) {
    const L = activeLine(t, ['lead']);
    if (!L) return null;
    let cur = null;
    for (const n of L.notes) if (t >= n.t - 0.04) cur = n;
    if (!cur || t > L.t1 + 0.3) return null;
    const s = L.text;
    let a = cur.c0, b = cur.c1;
    while (a > 0 && s[a - 1] !== ' ') a--;
    while (b < s.length && s[b] !== ' ') b++;
    const first = L.notes.find(n => n.c0 >= a && n.c0 < b);
    return { word: s.slice(a, b).toUpperCase().replace(/[,.]/g, ''), t0: first.t, line: L };
  }
  function bigWord(t, y, colFn) {
    const w = currentWord(t);
    if (!w) return;
    const age = t - w.t0;
    const sc = age < 0.07 ? 6 : 5;
    const s = w.word, x = Math.round((W - textW(s, sc)) / 2);
    textRows(s, x + 3, y + 3, sc, () => BLACK);
    textRows(s, x, y, sc, (r, i) => colFn(r, i, age));
  }
  function robotCaption(t) {
    const L = activeLine(t, ['robot']);
    if (!L) return;
    const s = '> ' + L.text.toUpperCase();
    let shown = 0;
    for (const n of L.notes) if (t >= n.t - 0.05) shown = n.c1 + 2;
    if (t > L.t1) shown = s.length;
    const vis = s.slice(0, shown) + ((Math.floor(t * 3) & 1) ? '_' : '');
    const x = Math.round((W - textW(s, 1)) / 2);
    rectBlend(x - 4, 163, textW(s, 1) + 12, 13, hex('001a08'), 0.7);
    text(vis, x, 166, 1, hex('60ff80'));
  }

  // ---------------------------------------------------------------- scenes
  const C = {};
  function sTerminal(c) {
    const t = c.t;
    clear(hex('030a05'));
    if (t > 2.4) starsStatic(t, clamp((t - 2.4) / 2, 0, 1) * 0.7, H);
    const G1 = hex('70ff90'), G2 = hex('2c8a44');
    for (let y = 0; y < H; y += 2) rectBlend(0, y, W, 1, BLACK, 0.18);
    const typed = (s, t0, x, y, col) => { const n = clamp(Math.floor((t - t0) * 32), 0, s.length); if (n > 0) text(s.slice(0, n), x, y, 1, col); return n === s.length; };
    typed('MARS RELAY STATION 4 . SOL 2026', 0.05, 16, 22, G2);
    typed('> INCOMING TRANSMISSION', 0.35, 16, 44, G1);
    const gates = E.morse;
    let on = false;
    for (const [a, b] of gates) if (t >= a && t < b) on = true;
    if (t > 0.5) { circle(176, 47, 3, on ? hex('b8ffc8') : hex('1c4a26')); if (on) glow(176, 47, 12, 60, 255, 120, 0.6); }
    const groups = [2, 1, 3, 3], letters = 'MEOW';
    let gi = 0, dec = '';
    for (let k = 0; k < 4; k++) { gi += groups[k]; if (t >= gates[gi - 1][1] + 0.05) dec += letters[k] + ' '; }
    if (t > 0.6) text('> DECODING: ' + dec, 16, 60, 1, G1);
    if (dec.length === 8) {
      typed('> SIGNAL IS: MEOW', 3.45, 16, 76, G1);
      typed('> ORIGIN: MARS ?!', 3.85, 16, 92, hex('ffe070'));
    }
    if ((Math.floor(t * 4) & 1) === 0) rect(16 + 6 * 18, 108, 5, 7, G1);
    if (t > 3.3 && t < 4.4) {
      const k = clamp((t - 3.3) / 1.0, 0, 1);
      textRows('MEOW', 160 - textW('MEOW', 6) / 2 + 40, 110, 6, (r) => mix(hex('104a20'), hex('80ffa0'), k * (0.6 + 0.4 * Math.sin(r * 0.5 + t * 20))));
    }
    if (t > 3.9) for (let y = 0; y < H; y++) { const sh = Math.round(Math.sin(y * 0.7 + t * 50) * (t - 3.9) * 30); if (sh) { const row = px.slice(y * W, y * W + W); for (let x = 0; x < W; x++) px[y * W + x] = row[((x - sh) % W + W) % W]; } }
  }
  const LIGHT = [-0.62, -0.42, 0.66];
  function sSpace(c) {
    clear(hex('020208'));
    stars3d(c.t, 0.03, 160, 92, clamp(c.lt / 1.5, 0, 1));
    const R = lerp(16, 54, smooth(c.u)), rot = c.t * 0.22;
    const pa = c.t * 1.05, mx = 160 + Math.cos(pa) * R * 1.7, my = 94 + Math.sin(pa) * R * 0.3, front = Math.sin(pa) > 0;
    if (!front) moon(mx, my, Math.max(2, R * 0.09), 0.8, 4);
    planet(160, 94, R, rot, LIGHT, { atmo: 1 });
    if (front) moon(mx, my, Math.max(2, R * 0.09), 0.8, 4);
    const d2 = c.t * 0.6, dx = 160 + Math.cos(d2) * R * 2.4, dy = 94 + Math.sin(d2) * R * 0.5;
    if (Math.sin(d2) > 0 || Math.hypot(dx - 160, dy - 94) > R) moon(dx, dy, Math.max(1.5, R * 0.05), 0.8, 9);
    titleCard(c.t, 1);
    robotCaption(c.t);
  }
  function titleCard(t, alpha) {
    const t0 = T(4);
    if (t < t0) return;
    const s = 'CATS ON MARS', sc = 4, x0 = Math.round((W - textW(s, sc)) / 2);
    for (let i = 0; i < s.length; i++) {
      if (s[i] === ' ') continue;
      const tau = t - t0 - i * 0.055;
      if (tau < 0) continue;
      const drop = tau < 0.35 ? -50 * Math.pow(1 - tau / 0.35, 2) : Math.sin((tau - 0.35) * 18) * 3 * Math.exp(-(tau - 0.35) * 6);
      const x = x0 + i * 6 * sc, y = 16 + Math.round(drop);
      textRows(s[i], x + 2, y + 2, sc, () => hex('3a0808'));
      textRows(s[i], x, y, sc, r => {
        const k = fract(r / 28 + t * 0.6);
        return mix(mix(hex('ffe890'), hex('ff7a30'), smooth(k * 2)), hex('c02a40'), smooth(k * 2 - 1));
      });
    }
    if (t > T(5)) {
      const sub = 'THE NATURE OF LIFE', n = clamp(Math.floor((t - T(5)) * 18), 0, sub.length);
      const x = Math.round((W - textW(sub, 1)) / 2);
      text(sub.slice(0, n), x, 150, 1, hex('ffd0a0'));
    }
  }
  function sDescent(c) {
    clear(hex('020208'));
    stars3d(c.t, 0.03 + c.u * 0.4, 160, 92, 1 - c.u);
    const R = 54 * Math.exp(Math.pow(c.u, 1.4) * 2.1);
    planet(160, 94 + c.u * 40, R, c.t * 0.22, LIGHT, { atmo: 1, detail: Math.max(0.001, clamp((R - 100) / 200, 0, 1)) });
    if (c.u > 0.55) {
      const k = (c.u - 0.55) / 0.45;
      const R2 = CM.rng(12);
      for (let i = 0; i < 60; i++) {
        const a = R2() * TAU, r0 = 40 + R2() * 200, sp = fract(R2() + c.t * (0.8 + R2()));
        const r1 = r0 * (0.4 + sp * 1.2);
        const x0 = 160 + Math.cos(a) * r1, y0 = 94 + Math.sin(a) * r1 * 0.6;
        lineAdd(x0, y0, x0 + Math.cos(a) * 12 * k, y0 + Math.sin(a) * 7 * k, 255 * k, 150 * k, 70 * k);
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const e = Math.max(Math.abs(x - 160) / 160, Math.abs(y - 90) / 90);
        if (e > 0.7) { const f = Math.pow((e - 0.7) / 0.3, 2) * k * 0.9; addI(y * W + x, 255 * f, 110 * f, 30 * f); }
      }
    }
    if (c.u > 0.72) fadeTo(hex('ffb070'), Math.pow((c.u - 0.72) / 0.28, 1.5) * 0.85);
    if (c.t < T(6.6)) titleCard(c.t, 1);
    robotCaption(c.t);
  }
  const SKY_DAY = [[0, hex('5a3a32')], [0.5, hex('a8805e')], [1, hex('d8b088')]];
  function ridge(t, scroll, y0, col, top) {
    for (let x = 0; x < W; x++) {
      const u = (x + scroll) * 0.025;
      const y = y0 + 4 * Math.sin(u) + 2.5 * Math.sin(u * 2.7 + 1) + 1.2 * Math.sin(u * 6.1);
      const yy = Math.round(y);
      for (let j = Math.max(0, yy); j < H; j++) px[j * W + x] = j === yy ? top : col;
    }
  }
  function ridgeY(x, scroll, y0) { const u = (x + scroll) * 0.025; return y0 + 4 * Math.sin(u) + 2.5 * Math.sin(u * 2.7 + 1) + 1.2 * Math.sin(u * 6.1); }
  function sWalk(c) {
    const hor = 74;
    vgrad(0, hor + 30, SKY_DAY);
    sunDisc(262, 26, 3.5, hex('fff6e8'), 255, 220, 170, 0.5);
    moon(70, 30, 5, 0.8, 4);
    const ang = -Math.PI / 2, cx = 10000 + 40 + c.lt * 7.5, cy = 10000 + 120;
    voxel({ x: cx, y: cy, z: camAlt(cx, cy, ang, 26), ang, horizon: hor }, { cm: A.day, fog: hex('d0a880'), far: 300, t: c.t });
    const scroll = c.lt * 46;
    ridge(c.t, scroll, 158, hex('5a2014'), hex('a04a28'));
    const R2 = CM.rng(3);
    for (let k = 0; k < 9; k++) {
      const rx = ((R2() * 500 - scroll) % 500 + 500) % 500 - 60, ry = ridgeY(rx, scroll, 158);
      circle(rx, ry + 2, 3 + R2() * 4, hex('3e140c'));
    }
    const catX = 92 + c.u * 50, ph = c.t * 8.5, gy = ridgeY(catX, scroll, 158) + 1;
    const stepT = Math.PI / 8.5, kNow = Math.floor(c.t / stepT);
    for (let k = 0; k < 7; k++) {
      const tk = (kNow - k) * stepT, age = c.t - tk;
      const xk = 92 + clamp((tk - c.t0) / (T(12) - c.t0), 0, 1) * 50 + 7 - (c.t - tk) * 46;
      const a = clamp(0.7 - age * 0.9, 0, 1);
      if (a > 0) discBlend(xk, ridgeY(xk, scroll, 158) - 1 - age * 5, 1 + age * 5, hex('d09868'), a * 0.55);
    }
    catSide(catX, gy, 8, { pal: PALS.ginger, walk: ph, helmet: true, suit: true, t: c.t, dir: 1 });
    karaoke(c.t);
  }
  function sMoons(c) {
    const hor = 104;
    vgrad(0, hor + 30, [[0, hex('16142e')], [0.45, hex('6a4446')], [1, hex('d09068')]]);
    starsStatic(c.t, clamp(c.u * 1.5, 0, 0.8), 70);
    sunDisc(40, 98, 4, hex('fff0d8'), 255, 190, 140, 0.55);
    moon(238, 40, 9 + c.u * 2, 1, 4);
    moon(170, 24, 3.5, 1, 9);
    const st = T(15) - c.t0, sp = (c.lt - st) / 0.7;
    if (sp > 0 && sp < 1) { const x = 300 - sp * 170, y = 18 + sp * 40; for (let k = 0; k < 18; k++) addPx(x + k * 2.1, y - k * 0.5, 255 * (1 - k / 18), 240 * (1 - k / 18), 200 * (1 - k / 18)); glow(x, y, 6, 255, 255, 220, 0.8 * (1 - sp)); }
    const ang = -Math.PI / 2 - 0.25 + c.u * 0.5, cx = 10000 + 90 + c.lt * 2, cy = 10000 + 200 - c.lt * 4;
    voxel({ x: cx, y: cy, z: camAlt(cx, cy, ang, 30), ang, horizon: hor }, { cm: A.day, fog: hex('b07a5c'), far: 280, t: c.t });
    poly([0, 150, 30, 138, 70, 134, 100, 142, 118, 160, 130, 180, 0, 180], hex('3a120c'));
    poly([0, 150, 30, 138, 70, 134, 100, 142, 104, 145, 60, 140, 20, 146], hex('7a3018'));
    const look = smooth((c.t - T(14)) / 1.5);
    catSitSide(60, 138, 8.5, { pal: PALS.ginger, t: c.t, lookUp: 0.3 + look * 0.7, helmet: true, dir: 1 });
    karaoke(c.t);
  }
  function sConstellation(c) {
    vgrad(0, H, [[0, hex('04030e')], [0.6, hex('1a1036')], [1, hex('3a1a2a')]]);
    starsStatic(c.t, 0.7, 150);
    const cs = A.cons, sc = 1.05, ox = 160 - 47 * sc, oy = 18;
    const P = cs.pts.map(([x, y]) => [ox + x * sc, oy + y * sc]);
    const arrive = new Float32Array(P.length), count = new Float32Array(P.length);
    for (const m of A.motes) {
      count[m.k]++;
      const p = (c.t - m.t0) / m.dur;
      if (p >= 1) { arrive[m.k]++; continue; }
      if (p < 0) continue;
      const e = smooth(p), sx = m.x0, sy = 172;
      const [tx_, ty_] = P[m.k];
      const sw = (1 - e) * m.r;
      const x = lerp(sx, tx_, e) + Math.cos(m.sp + p * 7) * sw, y = lerp(sy, ty_, e) + Math.sin(m.sp + p * 7) * sw * 0.4;
      const b = 0.5 + 0.5 * e;
      addPx(x, y, 255 * b, 160 * b, 80 * b);
      addPx(x, y + 1, 120 * b * (1 - e), 60 * b * (1 - e), 30 * b * (1 - e));
    }
    const bell = pulse(E.bell, c.t, 6);
    const lp = clamp((c.t - T(18.4)) / (T(19.6) - T(18.4)), 0, 1), nseg = cs.segs.length;
    for (let i = 0; i < nseg; i++) {
      const f = clamp(lp * nseg - i, 0, 1);
      if (f <= 0) continue;
      const [a, b] = cs.segs[i];
      lineAdd(P[a][0], P[a][1], lerp(P[a][0], P[b][0], f), lerp(P[a][1], P[b][1], f), 90, 120, 200);
    }
    for (let k = 0; k < P.length; k++) {
      const v = arrive[k] / count[k];
      if (v <= 0) continue;
      const tw = 0.75 + 0.25 * Math.sin(c.t * 5 + k) + bell * 0.5;
      glow(P[k][0], P[k][1], 3 + v * 7, 255, 230, 200, v * tw * 0.8);
      addPx(P[k][0], P[k][1], 255 * v, 255 * v, 255 * v);
    }
    const hy = 158;
    for (let x = 0; x < W; x++) {
      const y = Math.round(hy + 5 * Math.sin(x * 0.03) + 3 * Math.sin(x * 0.11 + 2) + 1.5 * Math.sin(x * 0.37));
      for (let j = y; j < H; j++) px[j * W + x] = j === y ? hex('5a2418') : hex('1a0806');
    }
    if (c.t > T(19.5)) flash((c.t - T(19.5)) / (T(20) - T(19.5)) * 0.6);
    karaoke(c.t);
  }
  function sSinger(c, v) {
    const fin = v === 1;
    const kick = pulse(E.kick, c.t, 9);
    sunburst(c.t, 18, fin ? hsv(c.t * 0.05, 0.6, 0.85) : hex('c83c28'), fin ? hsv(c.t * 0.05 + 0.5, 0.6, 0.55) : hex('6a1420'), 0.35);
    glow(160, 98, 95, 255, 160, 80, 0.35 + kick * 0.25);
    const bars = fin ? 5 : 3;
    for (let i = 0; i < bars; i++) {
      const y = 98 + Math.sin(c.t * 1.9 + i * 1.3) * 60;
      copperBar(y, 6, fin ? hsv(i / bars + c.t * 0.1, 0.65, 1) : [hex('ffb040'), hex('ff5a40'), hex('ffe070')][i % 3], 0.55);
    }
    const bob = Math.abs(Math.sin(c.t / BEAT * Math.PI)) * -3, tilt = Math.sin(c.t / BAR * Math.PI) * 0.12;
    const P = PALS.ginger, s = 40, hx = 160, hy = 96 + bob;
    tfSet(hx, hy, s, 0, 1);
    tEll(0, 1.45, 1.05, 0.75, fin ? P.base : SUIT);
    if (!fin) { tEll(0, 0.98, 0.72, 0.22, SUITD); tEll(-0.55, 1.5, 0.12, 0.12, hex('e05040')); tEll(-0.25, 1.5, 0.12, 0.12, hex('40c0e0')); }
    else tEll(0, 1.4, 0.45, 0.5, P.light);
    const m = mouthAt(c.t);
    const blink = fract(c.t / 3.3) < 0.04 ? 1 : 0;
    catHead(hx, hy, s, { pal: P, tilt, mouth: m.open, wide: m.wide, blink, look: Math.sin(c.t * 0.7), dilate: kick });
    if (!fin) helmet(hx, hy - 4, s * 1.42, c.t);
    for (const mw of E.meows) {
      const tau = c.t - mw.t;
      if (tau < 0 || tau > 0.75) continue;
      const left = mw.pan < 0, x = left ? 46 : 274, y = 132;
      const pop = tau < 0.1 ? tau / 0.1 : 1, fade = clamp((0.75 - tau) / 0.2, 0, 1);
      catHead(x, y, 15 * pop, { pal: left ? PALS.gray : PALS.black, mouth: clamp(Math.sin(tau / 0.55 * Math.PI), 0, 1) * 0.9, wide: 0.4, tilt: left ? -0.2 : 0.2 });
      if (fade > 0.2) textO('MEOW!', x - textW('MEOW!', 1) / 2, y - 30, 1, hex('fff0a0'), BLACK);
    }
    bigWord(c.t, 8, (r, i, age) => mix(hex('fff4c0'), fin ? hsv(i * 0.12 + c.t * 0.3, 0.7, 1) : hex('ff8a3a'), r / 35));
    equalizer(c.t, 0, 180, W, 18, 32, (f, b) => (fin ? hsv(b / 32, 0.6, 1) : mix(hex('ffcc60'), hex('ff4030'), f)));
  }
  function sDance(c, v) {
    const fin = v === 1, hor = 112;
    plasma(c.t, fin ? PAL_RAINBOW : PAL_MARS, 0, hor, 0.8);
    for (let y = 0; y < hor; y++) rectBlend(0, y, W, 1, BLACK, 0.12 + 0.3 * (y / hor));
    if (fin) fireworks(c.t);
    gridFloor(c.t, hor, fin ? hex('0c2a1a') : hex('2a0810'), fin ? hex('1a5a2a') : hex('5a1420'), fin ? hex('80ffb0') : hex('ff7040'), 1 / BEAT);
    equalizer(c.t, 0, hor, W, 14, 32, (f, b) => (fin ? hsv(b / 32 + c.t * 0.2, 0.7, 1) : mix(hex('ffd060'), hex('ff3a2a'), f)));
    sineScroller('   CATS ON MARS ^ WE ARE MADE OF STARS ^ LIFE WILL ALWAYS FIND A WAY ^ PURRING IN THE DARK ^   ', c.t, 14, 2, 70, 7, (i, x) => (fin ? hsv(x / 320 + c.t * 0.3, 0.55, 1) : mix(hex('fff0b0'), hex('ffa040'), 0.5 + 0.5 * Math.sin(x * 0.05))));
    const beat = Math.floor(c.t / BEAT), bp = fract(c.t / BEAT), kick = pulse(E.kick, c.t, 10);
    const order = ['gray', 'black', 'ginger', 'white', 'calico'];
    for (let i = 0; i < 5; i++) {
      const x = 40 + i * 60, phase = (beat + i) % 4;
      const armL = phase === 0 || phase === 3 ? 1 - bp * 0.3 : 0.15, armR = phase === 1 || phase === 2 ? 1 - bp * 0.3 : 0.15;
      const isLead = i === 2, m = isLead ? mouthAt(c.t) : { open: 0, wide: 0.5 };
      catSit(x, 160 - Math.abs(Math.sin(c.t / BEAT * Math.PI + i)) * 4, isLead ? 11 : 9.8, {
        pal: PALS[order[i]], t: c.t, phase: i, squash: kick, armL, armR, tilt: Math.sin(c.t / BEAT * Math.PI + i * 0.7) * 0.22,
        mouth: m.open, wide: m.wide, blink: fract(c.t / 2.9 + i * 0.37) < 0.05 ? 1 : 0
      });
    }
    karaoke(c.t, 170);
  }
  function sTunnel(c) {
    const t = c.t;
    const ox = W / 2 + Math.sin(t * 0.9) * 70, oy = H / 2 + Math.sin(t * 1.3) * 40;
    tunnel(t, A.tileTunnel, ox, oy, Math.floor(t * 40), Math.floor(t * 160));
    const kick = pulse(E.kick, t, 8);
    if (kick > 0.05) flash(kick * 0.12);
    const cx = W - ox, cy = H - oy;
    for (const mw of E.meows) {
      const tau = t - mw.t;
      if (tau < 0 || tau > mw.d + 0.25 || mw.t < T(28) || mw.t > T(32)) continue;
      const p = clamp(tau / (mw.d + 0.25), 0, 1), s = 6 + p * p * 70;
      const mo = clamp(Math.sin(clamp(tau / mw.d, 0, 1) * Math.PI), 0, 1);
      const pal = [PALS.ginger, PALS.gray, PALS.white, PALS.black, PALS.calico][Math.round(mw.t / STEP) % 5];
      catHead(lerp(cx, 160, p), lerp(cy, 92, p), s, { pal, mouth: mo * 0.95, wide: 0.35, tilt: Math.sin(mw.t * 7) * 0.3 });
    }
    if (c.t < T(30)) bigWord2(t);
    sineScroller('      MEOW! GREETINGS TO ALL LIFE FORMS ON EARTH, ON MARS AND IN BETWEEN ... STAY CURIOUS ... NINE LIVES ARE NOT ENOUGH ... ', t, 150, 2, 85, 8, (i, x) => hsv(x / 400 + t * 0.2, 0.45, 1));
  }
  function bigWord2(t) {
    const words = [['CATS', 0], ['ON', 2], ['MARS!', 4], ['WE ARE', 16], ['MADE OF', 20], ['STARS', 24]];
    let w = null;
    for (const [s, st] of words) if (t >= T(28, st) - 0.03) w = [s, st];
    if (!w) return;
    const age = t - T(28, w[1]), sc = age < 0.08 ? 5 : 4;
    const x = Math.round((W - textW(w[0], sc)) / 2);
    textRows(w[0], x + 2, 24 + 2, sc, () => BLACK);
    textRows(w[0], x, 24, sc, r => hsv(r / 40 + t * 0.5, 0.5, 1));
  }
  const SKY_DUSK = [[0, hex('060814')], [0.45, hex('1c1c3a')], [0.85, hex('4a4058')], [1, hex('6a5a62')]];
  function duskSky(hor, sx, sy, t) {
    vgrad(0, hor + 40, SKY_DUSK);
    glow(sx, sy, 110, 60, 110, 190, 0.85);
    glow(sx, sy, 40, 120, 170, 230, 0.7);
    circle(sx, sy, 3.2, hex('f4f8ff'));
  }
  function sSleep(c) {
    const hor = 118;
    duskSky(hor, 228, hor - 6 + c.u * 8, c.t);
    starsStatic(c.t, 0.25 + c.u * 0.4, 80);
    moon(60, 30, 4, 0.7, 9);
    for (let x = 0; x < W; x++) {
      const y = Math.round(hor - 4 + 6 * Math.sin(x * 0.02 + 1) + 3 * Math.sin(x * 0.07));
      for (let j = Math.max(0, y); j < hor + 8; j++) px[j * W + x] = hex('241422');
    }
    vgrad(hor + 4, H, [[0, hex('3a1c1c')], [1, hex('5a2a1e')]]);
    const R = CM.rng(21);
    for (let k = 0; k < 14; k++) circle(R() * W, hor + 14 + R() * 50, 1 + R() * 3, hex('2a1210'));
    const catX = 118, catY = 160, s = 17;
    // seeds drift out of the fur and sprout where they land
    const R2 = CM.rng(61);
    for (let k = 0; k < 16; k++) {
      const t0 = T(32) + 0.5 + k * 0.45 + R2() * 0.3, dx = (R2() - 0.5) * 200, land = catY + 4 + R2() * 14;
      const tau = c.t - t0;
      if (tau < 0) continue;
      const p = clamp(tau / 1.2, 0, 1);
      const x = catX + dx * smooth(p) * 0.9, y = lerp(catY - 22, land, p) - Math.sin(p * Math.PI) * 20;
      if (p < 1) { rect(x, y, 2, 2, hex('a0ff80')); glow(x + 1, y + 1, 4, 40, 120, 30, 0.6); }
      else {
        const g = clamp((tau - 1.2) / 2.2, 0, 1), hgt = 2 + g * (7 + (k % 4) * 3), sw = Math.sin(c.t * 2 + k) * g;
        thick(x, land, x + sw, land - hgt, 1.2, hex('48b048'));
        if (g > 0.3) { tfSet(x + sw * 0.6, land - hgt * 0.55, 3, 0.5, 1); tEll(0.6, 0, 0.7, 0.3, hex('70d858')); tfSet(x + sw * 0.6, land - hgt * 0.7, 3, -0.5, 1); tEll(-0.6, 0, 0.7, 0.3, hex('70d858')); }
        if (g > 0.85) { circle(x + sw, land - hgt - 1, 2, [hex('ff80b0'), hex('fff080'), hex('ffffff')][k % 3]); pset(x + sw, land - hgt - 1, hex('ffd040')); }
      }
    }
    const g = smooth((c.t - T(33.5)) / (T(36) - T(33.5)));
    if (g > 0) tree(232, 160, 26 * g + 4, -Math.PI / 2, 7, g, c.t, 0);
    catSleep(catX, catY, s, { pal: PALS.ginger, t: c.t });
    for (let k = 0; k < 3; k++) {
      const p = fract(c.t * 0.35 + k / 3), x = catX + 28 + p * 18 + Math.sin(p * 6 + k) * 3, y = catY - 26 - p * 30;
      text('Z', Math.round(x), Math.round(y), p > 0.5 ? 2 : 1, mix(hex('d8e8ff'), hex('20283a'), p));
    }
    karaoke(c.t);
  }
  function tree(x, y, len, ang, depth, grow, t, lvl) {
    if (depth <= 0 || len < 1) return;
    const g = clamp(grow * 7 - lvl, 0, 1);
    if (g <= 0) return;
    const sway = Math.sin(t * 1.3 + lvl) * 0.04 * lvl;
    const x2 = x + Math.cos(ang + sway) * len * g, y2 = y + Math.sin(ang + sway) * len * g;
    thick(x, y, x2, y2, Math.max(1, depth * 0.7), lvl < 2 ? hex('5a3420') : hex('6a4428'));
    if (depth <= 2 && g >= 1) { circle(x2, y2, 2.2, lvl % 2 ? hex('60c050') : hex('48a848')); if ((lvl * 7 + depth) % 3 === 0) pset(x2, y2 - 1, hex('ff9ac0')); }
    if (g < 1) return;
    tree(x2, y2, len * 0.72, ang - 0.42, depth - 1, grow, t, lvl + 1);
    tree(x2, y2, len * 0.7, ang + 0.36, depth - 1, grow, t, lvl + 1);
  }
  function sGreening(c) {
    const hor = 78;
    duskSky(hor, 200, hor - 4, c.t);
    starsStatic(c.t, 0.6, 60);
    moon(80, 22, 5, 0.9, 4);
    const ang = -Math.PI / 2 + Math.sin(c.lt * 0.3) * 0.25, cx = 10000 + 128 + Math.sin(c.lt * 0.2) * 20, cy = 10000 + 200 - c.lt * 12;
    voxel({ x: cx, y: cy, z: camAlt(cx, cy, ang, 24), ang, horizon: hor }, { cm: A.dusk, cm2: A.green, life: lerp(0.08, 0.62, smooth(c.u * 1.05)), fog: hex('4a4058'), far: 260, t: c.t });
    karaoke(c.t);
  }
  const BOBS = (() => {
    const p = [], N = 230;
    for (let i = 0; i < N; i++) { const yy = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - yy * yy), a = i * 2.39996; p.push([Math.cos(a) * r, yy * 0.86, Math.sin(a) * r, 0]); }
    for (const sx of [-1, 1]) for (let k = 0; k <= 6; k++) for (let j = 0; j <= 6 - k; j++) {
      const f = k / 6, g = j / 6;
      p.push([sx * (0.3 + 0.5 * g + 0.15 * f), -0.62 - 0.75 * f, 0.15, k > 1 && j > 0 && j < 6 - k ? 4 : 0]);
    }
    p.push([-0.38, -0.12, 1.02, 1], [0.38, -0.12, 1.02, 1], [0, 0.2, 1.1, 2], [-0.14, 0.34, 1.04, 3], [0.14, 0.34, 1.04, 3]);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) for (let j = 1; j <= 3; j++) p.push([sx * (0.45 + j * 0.28), 0.25 + (k - 1) * 0.1 * j * 0.6, 0.85 - j * 0.08, 3]);
    return p;
  })();
  function sRotoBobs(c) {
    const t = c.t, kick = pulse(E.kick, t, 10);
    rotozoom(A.tileRoto, Math.sin(t * 0.4) * 1.2, 0.95 + 0.3 * Math.sin(t * 0.33), t * 30, t * 12, 0.38);
    const ay = Math.sin(t * 0.85) * 0.95, ax = Math.sin(t * 1.1) * 0.25 - 0.08, cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    const sc = 1 + kick * 0.08, items = [];
    for (const b of BOBS) {
      let x = b[0] * cy + b[2] * sy, z = -b[0] * sy + b[2] * cy, y = b[1];
      const y2 = y * cx - z * sx, z2 = y * sx + z * cx;
      const d = 3.2 + z2, k = 215 / d * sc;
      items.push([160 + x * k * 0.95, 92 + y2 * k * 0.95, -z2, b[3], 14 / d * sc]);
    }
    items.sort((a, b) => b[2] - a[2]);
    discBlend(160, 92, 84, BLACK, 0.5);
    const cols = [[240, 140, 60], [120, 240, 90], [250, 120, 150], [245, 245, 245], [250, 160, 170]];
    const size = [1, 2.1, 1.3, 0.55, 0.8];
    for (const it of items) { const cc = cols[it[3]]; ball(it[0], it[1], it[4] * size[it[3]], cc[0], cc[1], cc[2]); }
    karaoke(c.t);
  }
  function sConga(c) {
    const t = c.t;
    vgrad(0, H, [[0, hex('060418')], [1, hex('1a0a2e')]]);
    starsStatic(t, 0.6, H);
    const n = 7;
    const bars = [];
    for (let i = 0; i < n; i++) { const a = t * 1.6 + i * 0.7; bars.push([90 + Math.sin(a) * 58, Math.cos(a), i]); }
    bars.sort((a, b) => a[1] - b[1]);
    for (const [y, z, i] of bars) copperBar(y, 7, hsv(i / n + t * 0.05, 0.7, 1), 1);
    const kick = pulse(E.kick, t, 9);
    for (let k = 0; k < 9; k++) {
      const x = ((k * 46 + t * 38) % 414) - 40, base = 118 + Math.sin(x * 0.025 + t * 2) * 22;
      const pal = [PALS.ginger, PALS.gray, PALS.black, PALS.white, PALS.calico][k % 5];
      catSide(x, base, 6.6, { pal, walk: t * 9 + k, t: t + k, dir: 1, blink: fract(t / 2.3 + k * 0.3) < 0.06 });
      if (kick > 0.6 && k % 2 === 0) text('~', Math.round(x - 4), Math.round(base - 30), 1, hex('fff0a0'));
    }
    karaoke(c.t);
  }
  function sMitosis(c) {
    const t = c.t;
    vgrad(0, H, [[0, hex('031a1c')], [1, hex('0a2a2a')]]);
    const R = CM.rng(15);
    for (let k = 0; k < 70; k++) { const x = (R() * W + t * (4 + R() * 6)) % W, y = (R() * H + Math.sin(t + k) * 3); addPx(x, y, 30, 90, 80); }
    const L = S.lines.find(l => l.bar === 48);
    const times = [L.notes[0].t, L.notes[2].t, L.notes[4].t, L.notes[6].t];
    let gen = 0;
    for (let i = 1; i < 4; i++) if (t >= times[i]) gen = i;
    const prog = i => smooth((t - times[i]) / 0.5);
    const cells = [];
    const build = (x, y, g, r, ang) => {
      if (g > gen) { cells.push([x, y, r]); return; }
      if (g === 0) { build(x, y, 1, r, ang); return; }
      const p = prog(g), d = r * 0.95 * p, r2 = r * lerp(1, 0.78, p);
      build(x + Math.cos(ang) * d, y + Math.sin(ang) * d, g + 1, r2, ang + 1.3);
      build(x - Math.cos(ang) * d, y - Math.sin(ang) * d, g + 1, r2, ang + 1.3 + Math.PI / 3);
    };
    const pulseR = 1 + 0.05 * Math.sin(t * 4);
    build(160 + Math.sin(t * 0.5) * 6, 92, 0, 34 * pulseR, 0.3);
    const n = cells.length, X = new Float32Array(n), Y = new Float32Array(n), R2 = new Float32Array(n);
    cells.forEach(([x, y, r], i) => { X[i] = x + Math.sin(t * 1.7 + i) * 2; Y[i] = y + Math.cos(t * 1.3 + i) * 2; R2[i] = r * r; });
    const born = t < times[1] ? smooth((t - times[0] + 0.3) / 0.6) : 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let f = 0, fn = 0;
      for (let i = 0; i < n; i++) { const dx = x - X[i], dy = y - Y[i], d2 = dx * dx + dy * dy + 1; f += R2[i] / d2; fn += R2[i] * 0.09 / d2; }
      f *= born; fn *= born;
      const i = y * W + x;
      if (fn > 1) px[i] = fn > 1.25 ? hex('5a3a8a') : hex('8a62c0');
      else if (f > 1.18) px[i] = mix(hex('3aa86a'), hex('62d08a'), clamp((f - 1.18) * 0.6, 0, 1));
      else if (f > 1) px[i] = hex('c8ffd8');
      else if (f > 0.7) addI(i, 0, 60 * (f - 0.7) * 3, 40 * (f - 0.7) * 3);
    }
    const words = ['BORN', 'GROW', 'PLAY', 'SLEEP'];
    for (let i = 0; i < 4; i++) {
      if (t < times[i] - 0.03) continue;
      const age = t - times[i], sc = age < 0.08 ? 3 : 2;
      const s = words[i], x = 20 + i * 76 + (76 - textW(s, sc)) / 2;
      textO(s, Math.round(x), 150, sc, i === gen ? hex('ffffff') : hex('a0e0c0'), hex('062018'));
    }
  }
  function sLife(c) {
    const t = c.t;
    const gen = Math.max(0, Math.floor((t - T(50)) / STEP * 3));
    lifeTo(gen);
    clear(hex('020a04'));
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const h = lifeHeat[y * LW + x];
      if (h < 0.04) continue;
      const col = h >= 1 ? hex('90ffa8') : mix(hex('020a04'), hex('1e8a3a'), h);
      rect(x * 4, y * 4, 3, 3, col);
    }
    const L = S.lines.find(l => l.bar === 50);
    const top = 'THAT IS THE', big = 'NATURE OF LIFE';
    const shownTop = L.notes.filter(n => t >= n.t && n.c1 <= 11).length;
    const words = top.split(' ');
    if (shownTop > 0) textC(words.slice(0, Math.min(3, shownTop)).join(' '), 60, 2, hex('d0ffe0'), hex('03140a'));
    const n2 = L.notes.filter(n => t >= n.t - 0.03 && n.c0 >= 12).length;
    if (n2 > 0) {
      const s = n2 >= 4 ? big : n2 >= 3 ? 'NATURE OF' : 'NATURE', sc = 3, x = Math.round((W - textW(big, sc)) / 2);
      textRows(s, x + 2, 86, sc, () => hex('03140a'));
      textRows(s, x, 84, sc, r => mix(hex('ffffff'), hex('60ff90'), r / 21));
    }
  }
  function sLovers(c) {
    const t = c.t, hor = 130;
    duskSky(hor, 160, hor - 2, t);
    starsStatic(t, 0.55 + c.u * 0.3, 110);
    moon(270, 24, 5, 0.8, 4);
    for (let x = 0; x < W; x++) {
      const y = Math.round(hor + 10 - 28 * Math.exp(-Math.pow((x - 160) / 90, 2)) + 2 * Math.sin(x * 0.09));
      for (let j = Math.max(0, y); j < H; j++) px[j * W + x] = hex('0e0610');
    }
    const sil = hex('0e0610');
    const dis = smooth((t - T(53)) / (BAR * 0.9));
    const hp = smooth((t - T(52)) / (BAR * 0.8));
    heartTails(140, 181, 160, 116, 1.05, hp, sil);
    catBack(186, 116, 9, sil);
    if (dis < 0.35) catBack(134, 116, 10.5, sil);
    if (dis > 0) {
      const R = CM.rng(17);
      for (let k = 0; k < 140; k++) {
        const u = (R() - 0.5) * 1.6, v = -R() * 3.0, x0 = 134 + u * 10.5, y0 = 116 + v * 10.5;
        const rise = dis * dis * (30 + R() * 90), x = x0 + Math.sin(t * 2 + k) * dis * 8, y = y0 - rise;
        const b = clamp(1.4 - dis * 0.9, 0, 1) * (0.6 + 0.4 * Math.sin(t * 9 + k)) * 255;
        addPx(x, y, b, b * 0.9, b * 0.8);
      }
      if (dis < 0.45) glow(134, 100, 30, 255, 220, 200, (0.45 - dis) * 1.5);
    }
    for (let k = 0; k < 5; k++) {
      const p = fract(t * 0.25 + k / 5), x = 160 + Math.sin(p * 5 + k * 2) * 18, y = 92 - p * 70;
      if (t > T(52) + k * 0.3) text('@', Math.round(x - 2), Math.round(y), 1, mix(hex('ff6a8a'), hex('2a1030'), p));
    }
    karaoke(c.t);
  }
  function sDNA(c) {
    const t = c.t, sp = 1 + c.u * 3;
    vgrad(0, H, [[0, hex('050212')], [1, hex('140626')]]);
    starsStatic(t, 0.6, H);
    glow(160, 90, 120, 60, 40, 120, 0.6 + c.u * 0.4);
    const items = [], N = 30, ph = t * sp * 1.6;
    const sc = (t * sp * 26) % 10;
    for (let i = -2; i < N; i++) {
      const y = i * 10 - sc - 40, a = (i + Math.floor((t * sp * 26) / 10)) * 0.42 + ph;
      const x1 = Math.cos(a) * 36, z1 = Math.sin(a) * 36;
      const pc = [[255, 90, 90], [90, 160, 255], [90, 230, 120], [250, 220, 80]][((i + Math.floor((t * sp * 26) / 10)) % 4 + 4) % 4];
      items.push({ x: x1, y, z: z1, k: 0 }, { x: -x1, y, z: -z1, k: 1 }, { x: 0, y, z: 0, k: 2, x1, z1, pc });
    }
    const P = it => { const d = 160 / (160 + it.z); return [160 + it.x * d, 90 + (it.y - 90) * d * 0.9 + 0, d]; };
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      if (it.k === 2) {
        const a = P({ x: it.x1, y: it.y, z: it.z1 }), b = P({ x: -it.x1, y: it.y, z: -it.z1 });
        const pc = it.pc;
        thick(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 2, rgbc(pc[0], pc[1], pc[2]));
        thick((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, b[0], b[1], 2, rgbc(pc[1], pc[2], pc[0]));
      } else {
        const p = P(it);
        ball(p[0], p[1], 4.2 * p[2], it.k ? 200 : 255, it.k ? 210 : 150, it.k ? 255 : 90);
      }
    }
    const L = S.lines.find(l => l.bar === 54);
    const lifeN = L.notes[L.notes.length - 1];
    if (t >= L.notes[0].t - 0.05) {
      const n = L.notes.filter(n => t >= n.t - 0.03).length;
      const s = n >= 7 ? 'NATURE OF LIFE!' : n >= 6 ? 'NATURE OF' : n >= 4 ? 'NATURE' : n >= 3 ? 'THAT IS THE' : n >= 2 ? 'THAT IS' : 'THAT';
      const sc = n >= 7 ? 3 : 2, x = Math.round((W - textW(s, sc)) / 2);
      textRows(s, x + 2, 142, sc, () => BLACK);
      textRows(s, x, 140, sc, r => hsv(r / 30 + t * 0.4, 0.5, 1));
    }
    if (t > lifeN.t + lifeN.d) fadeTo(BLACK, 0.85);
    if (t > T(55.5)) flash(clamp((t - T(55.5)) / (T(56) - T(55.5)), 0, 1) * 0.5);
  }
  function terraSky(hor, t) {
    vgrad(0, hor + 40, [[0, hex('2a64c8')], [0.7, hex('7ab4ea')], [1, hex('c4e2f6')]]);
    sunDisc(250, 30, 5, hex('fffef0'), 255, 240, 200, 0.55);
    const cl = A.clouds;
    for (let y = 4; y < hor - 6; y++) {
      const v = ((y * 3 + 40) & 255) << 8;
      const k0 = (y < hor * 0.5 ? 1 : (hor - 6 - y) / (hor * 0.5 - 6));
      for (let x = 0; x < W; x++) {
        const f = cl[v | (((x + t * 9) | 0) & 255)];
        if (f > 0.56) blendI(y * W + x, WHITE, clamp((f - 0.56) * 4, 0, 0.9) * k0);
      }
    }
  }
  function sTerra(c, v) {
    const t = c.t, hor = 76;
    terraSky(hor, t);
    fireworks(t);
    const ang = -Math.PI / 2 + Math.sin(c.lt * 0.6 + v) * 0.35, cx = 10000 + 60 + v * 90 + Math.sin(c.lt * 0.3) * 30, cy = 10000 + 230 - c.lt * 30 - v * 100;
    const water = 22;
    voxel({ x: cx, y: cy, z: Math.max(water, camAlt(cx, cy, ang, 22)) + 6, ang, horizon: hor + Math.sin(c.lt * 0.6 + v) * 6 }, { cm: A.day, cm2: A.green, life: 1.3, water, waterCol: hex('3a7ad0'), fog: hex('b4d6f0'), far: 280, t });
    const kick = pulse(E.kick, t, 9);
    const flyers = v === 0 ? [[0, 'ginger', 0]] : [[0, 'gray', -14], [0.08, 'ginger', 0], [0.16, 'white', 14]];
    for (const [d, p, oy] of flyers) {
      const q = clamp(c.u * 1.15 - d, 0, 1), x = -30 + q * 380, y = 58 + oy + Math.sin(t * 3 + d * 20) * 4 - q * 10;
      jetCat(x, y, 4.2, PALS[p], t + d * 10);
    }
    karaoke(c.t);
    if (kick > 0.5 && !OPT.calm) flash((kick - 0.5) * 0.12);
  }
  function jetCat(x, y, s, pal, t) {
    tfSet(x, y, s, 0, 1);
    const fl = 0.7 + 0.3 * Math.sin(t * 40);
    tPoly([-1.25, -1.65, -1.25 - 1.6 * fl, -1.35, -1.25, -1.1], hex('ff9a30'));
    tPoly([-1.25, -1.55, -1.25 - 0.9 * fl, -1.37, -1.25, -1.2], hex('fff0a0'));
    catSide(x, y, s, { pal, walk: 1.2, t, dir: 1, helmet: true, suit: true });
  }
  function sOutro(c) {
    const t = c.t, hor = 96;
    vgrad(0, hor + 40, [[0, hex('02030e')], [0.8, hex('0c1230')], [1, hex('1a2448')]]);
    starsStatic(t, 1, hor + 10);
    const ex = 64, ey = 30;
    if (t > T(66)) {
      const a = clamp((t - T(66)) / 2, 0, 1);
      glow(ex, ey, 9, 60, 120, 255, 0.6 * a);
      circle(ex, ey, 1.6, mix(BLACK, hex('6aa8ff'), a));
      pset(ex, ey, mix(BLACK, hex('80e080'), a));
      if (t > T(68.5)) { const b = clamp((t - T(68.5)) / 1, 0, 1); line(ex + 4, ey + 4, ex + 14, ey + 12, mix(BLACK, hex('8090b0'), b)); text('EARTH', ex + 16, ey + 12, 1, mix(BLACK, hex('b0c8ff'), b)); }
    }
    moon(250, 40, 8, 0.7, 4);
    fireworks(t);
    const ang = -Math.PI / 2, cx = 10000 + 128 + c.lt * 1.5, cy = 10000 + 210;
    voxel({ x: cx, y: cy, z: Math.max(22, camAlt(cx, cy, ang, 26)) + 6, ang, horizon: hor }, { cm: A.gnight, life: 1.3, water: 22, waterCol: hex('101c40'), fog: hex('141c3a'), far: 260, t });
    poly([0, 180, 0, 150, 60, 138, 160, 132, 260, 138, 320, 150, 320, 180], hex('0a1a14'));
    poly([0, 150, 60, 138, 160, 132, 260, 138, 320, 150, 320, 153, 260, 141, 160, 135, 60, 141, 0, 153], hex('1a3a26'));
    const pile = [[120, 150, 'gray', 1], [200, 150, 'white', -1], [160, 146, 'ginger', 1], [140, 160, 'black', -1], [184, 162, 'calico', 1]];
    pile.forEach(([x, y, p, d], i) => catSleep(x, y, i === 2 ? 12 : 10, { pal: PALS[p], t, phase: i * 1.3, dir: d }));
    for (let k = 0; k < 3; k++) {
      const p = fract(t * 0.3 + k / 3), x = 176 + p * 20 + Math.sin(p * 6 + k) * 3, y = 118 - p * 34;
      text('Z', Math.round(x), Math.round(y), p > 0.5 ? 2 : 1, mix(hex('d8e8ff'), hex('101830'), p));
    }
    const R = CM.rng(33);
    for (let k = 0; k < 24; k++) {
      const x = R() * W + Math.sin(t * 0.7 + k) * 10, y = 120 + R() * 50 + Math.sin(t * 1.1 + k * 2) * 6, b = Math.max(0, Math.sin(t * 2 + k * 1.7));
      addPx(x, y, 200 * b, 255 * b, 80 * b);
      if (b > 0.7) glow(x, y, 4, 120, 200, 40, (b - 0.7) * 1.5);
    }
    const cr = 'CATS ON MARS ... THE NATURE OF LIFE ... A LOWTECH DEMO FOR REMOTEFUNLAND ... CODE, MUSIC AND DIGITAL VOICE BY CLAUDE ... MEOW!';
    if (t < T(69)) {
      const span = textW(cr, 1) + W + 8, off = W - (t - T(64)) / (T(69) - T(64) - 0.6) * span;
      textO(cr, Math.round(off), 170, 1, hex('c0d0ff'), BLACK);
    }
    karaoke(t, 170);
    if (t > T(70.5)) {
      const k = clamp((t - T(70.5)) / (T(72) - T(70.5)), 0, 1);
      fadeTo(BLACK, k);
    }
    if (t > T(71)) {
      const a = clamp((t - T(71)) / 1.2, 0, 1) * clamp((S.DURATION - 0.4 - t) / 0.8, 0, 1);
      textC('CATS ON MARS', 70, 3, mix(BLACK, hex('ff9a50'), a));
      textC('THE NATURE OF LIFE', 100, 1, mix(BLACK, hex('d0c0b0'), a));
    }
  }

  const SCENES = [
    [0, 2, sTerminal], [2, 6, sSpace], [6, 8, sDescent], [8, 12, sWalk], [12, 16, sMoons], [16, 20, sConstellation],
    [20, 24, sSinger, 0], [24, 28, sDance, 0], [28, 32, sTunnel], [32, 36, sSleep], [36, 40, sGreening],
    [40, 44, sRotoBobs], [44, 48, sConga], [48, 50, sMitosis], [50, 52, sLife], [52, 54, sLovers], [54, 56, sDNA],
    [56, 58, sTerra, 0], [58, 60, sSinger, 1], [60, 62, sTerra, 1], [62, 64, sDance, 1], [64, 99, sOutro]
  ];
  const BIG_CUTS = [8, 20, 28, 40, 48, 56, 64], SMALL_CUTS = [12, 16, 24, 32, 36, 44, 50, 52, 54, 58, 60, 62];

  function frame(t, out) {
    init();
    target(FB, W, H);
    const b = t / BAR;
    let sc = SCENES[0];
    for (const s of SCENES) if (b >= s[0]) sc = s;
    const t0 = T(sc[0]), t1 = Math.min(T(sc[1]), S.DURATION);
    C.t = t; C.b = b; C.t0 = t0; C.lt = t - t0; C.u = clamp((t - t0) / (t1 - t0), 0, 1);
    sc[2](C, sc[3]);
    for (const cb of BIG_CUTS) { const d = t - T(cb); if (d >= 0 && d < 0.4) flash((1 - d / 0.4) * 0.85); }
    for (const cb of SMALL_CUTS) { const d = t - T(cb); if (d >= 0 && d < 0.25) flash((1 - d / 0.25) * 0.35); }
    if (OPT.dither) quantize(OPT.levels);
    if (out && out !== FB) out.set(FB);
    return FB;
  }

  // ---------------------------------------------------------------- dither to a small palette
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  let QL = null, QN = 0;
  function quantize(levels) {
    if (QN !== levels) {
      QL = new Uint8Array(16 * 256); QN = levels;
      const step = 255 / (levels - 1);
      for (let b = 0; b < 16; b++) {
        const th = (b + 0.5) / 16 - 0.5;
        for (let v = 0; v < 256; v++) QL[b * 256 + v] = clamp(Math.round(clamp(Math.round(v / step + th), 0, levels - 1) * step), 0, 255);
      }
    }
    for (let y = 0; y < H; y++) {
      const row = (y & 3) << 2;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, c = px[i], o = BAYER[row | (x & 3)] << 8;
        px[i] = rgb(QL[o + (c & 255)], QL[o + ((c >>> 8) & 255)], QL[o + ((c >>> 16) & 255)]);
      }
    }
  }

  // ---------------------------------------------------------------- loading screen
  function precalc(progress, t, ready) {
    init();
    target(FB, W, H);
    clear(hex('05040e'));
    starsStatic(t, 0.8, H);
    planet(276, 60, 22, t * 0.3, LIGHT, { atmo: 1 });
    textRows('CATS ON MARS', 24, 30, 3, r => mix(hex('ffe890'), hex('ff5a30'), r / 21));
    text('THE NATURE OF LIFE', 26, 58, 1, hex('d0b8a0'));
    const bx = 24, by = 130, bw = 272;
    rect(bx, by, bw, 6, hex('2a1620'));
    rect(bx, by, Math.round(bw * progress), 6, hex('e0703a'));
    catSide(bx + bw * progress, by - 1, 4, { pal: PALS.ginger, walk: t * 9, t, dir: 1, helmet: true, suit: true });
    if (!ready) text('PRECALCULATING LIFE ... ' + Math.floor(progress * 100) + '%', bx, by + 14, 1, hex('c8b8a8'));
    else if ((Math.floor(t * 2.5) & 1) === 0) text('READY. CLICK OR TAP TO LAND ON MARS', bx, by + 14, 1, hex('ffd070'));
    text('SOUND ON', bx, by + 28, 1, hex('7a6a6a'));
    if (OPT.dither) quantize(OPT.levels);
    return FB;
  }

  CM.gfx = { W, H, frame, precalc, init, OPT, mouthAt, spectrum };
  if (typeof module !== 'undefined' && module.exports) module.exports = CM;
})(typeof globalThis !== 'undefined' ? globalThis : window);
