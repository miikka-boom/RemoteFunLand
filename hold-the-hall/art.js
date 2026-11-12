/* Hold the Hall: art. Everything is drawn with canvas paths; there are no image files.
 *
 * World space: tiles on an isometric grid, 64 x 32 px a tile at zoom 1. P(x, y, z) -> [px, py] (z in px, up).
 * A lot is 4 x 4 tiles with its origin (X, Y) at the back corner; the two faces you see are the +y face ("L", lower left)
 * and the +x face ("R", lower right). Painters take em, a list they push glowing things into: the scene draws those
 * after the darkness, so windows, flames and lamps shine at night.
 */
(function (root) {
  'use strict';
  const HW = 32, HHt = 16, TAU = Math.PI * 2;
  const P = (x, y, z) => [(x - y) * HW, (x + y) * HHt - (z || 0)];

  // ---------------------------------------------------------------- colour
  const cache = {};
  function rgb(hex) { let c = cache[hex]; if (!c) { const n = parseInt(hex.slice(1), 16); c = cache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; } return c; }
  const h2 = (v) => { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); };
  const tone = (hex, f) => { const c = rgb(hex); return '#' + h2(c[0] * f) + h2(c[1] * f) + h2(c[2] * f); };
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + h2(x[0] + (y[0] - x[0]) * t) + h2(x[1] + (y[1] - x[1]) * t) + h2(x[2] + (y[2] - x[2]) * t); };
  const ruinOf = (hex) => tone(mix(hex, '#5a5d5e', 0.66), 0.78);
  const F = (base) => ({ t: tone(base, 1.1), l: tone(base, 0.93), r: tone(base, 0.7) });
  const rnd = (seed) => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  // ---------------------------------------------------------------- primitives
  function poly(g, pts, fill, stroke, lw) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  function line(g, a, b, col, lw) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.strokeStyle = col; g.lineWidth = lw || 1; g.stroke(); }
  function box(g, x0, y0, x1, y1, z0, z1, c) {
    poly(g, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], c.l);
    poly(g, [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], c.r);
    poly(g, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], c.t);
  }
  const onL = (g, x0, x1, y, z0, z1, fill) => poly(g, [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)], fill);
  const onR = (g, x, y0, y1, z0, z1, fill) => poly(g, [P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)], fill);
  function gable(g, x0, y0, x1, y1, z, rise, roof, wall) {   // ridge along x
    const ym = (y0 + y1) / 2;
    poly(g, [P(x1, y0, z), P(x1, y1, z), P(x1, ym, z + rise)], tone(wall, 0.7));
    poly(g, [P(x0, y1, z), P(x1, y1, z), P(x1, ym, z + rise), P(x0, ym, z + rise)], roof);
    line(g, P(x0, ym, z + rise), P(x1, ym, z + rise), tone(roof, 1.25), 1.2);
  }
  function pyramid(g, x0, y0, x1, y1, z, rise, col) {
    const a = P((x0 + x1) / 2, (y0 + y1) / 2, z + rise);
    poly(g, [P(x0, y1, z), P(x1, y1, z), a], tone(col, 1.0));
    poly(g, [P(x1, y0, z), P(x1, y1, z), a], tone(col, 0.72));
  }
  function cyl(g, x, y, r, z0, z1, col) {
    const [px, py] = P(x, y, 0), rx = r * 45, ry = rx / 2;
    g.fillStyle = tone(col, 0.8); g.beginPath(); g.ellipse(px, py - z0, rx, ry, 0, 0, Math.PI); g.lineTo(px - rx, py - z1); g.ellipse(px, py - z1, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
    g.fillStyle = tone(col, 1.12); g.beginPath(); g.ellipse(px, py - z1, rx, ry, 0, 0, TAU); g.fill();
  }
  // a window or door: st 'lit' | 'dark' | 'board'
  function win(g, face, a0, a1, c, z0, z1, st, em) {
    const pts = face === 'L' ? [P(a0, c, z0), P(a1, c, z0), P(a1, c, z1), P(a0, c, z1)] : [P(c, a0, z0), P(c, a1, z0), P(c, a1, z1), P(c, a0, z1)];
    poly(g, pts, st === 'lit' ? '#ffd98a' : '#1b1e24');
    if (st === 'lit') { if (em) em.push({ k: 'poly', pts, col: 'rgba(255,196,110,.55)' }); }
    else if (st === 'board') { line(g, pts[0], pts[2], '#6e5539', 1.8); line(g, pts[1], pts[3], '#5f4830', 1.8); }
  }
  function flag(g, x, y, z, t, col, k) {            // a pole with a flag raised k (0-1) of the way
    const a = P(x, y, z), top = [a[0], a[1] - 26];
    line(g, a, top, '#c9c4b8', 1.6);
    if (k <= 0) return;
    const fy = a[1] - 4 - 22 * k + 6, w1 = Math.sin(t * 3) * 1.6, w2 = Math.sin(t * 3 + 1.3) * 2.2;
    poly(g, [[a[0], fy - 9], [a[0] + 9, fy - 8 + w1], [a[0] + 17, fy - 7 + w2], [a[0] + 17, fy + 1 + w2], [a[0] + 9, fy + w1], [a[0], fy - 1]], col);
  }

  // ---------------------------------------------------------------- buildings (X, Y = the lot's origin; r = a ruin)
  const B = {
    // o: { flag (0-1), chained, lights (0-1 of the windows lit), flicker }
    hall(g, X, Y, r, lv, t, em, seed, o) {
      o = o || {};
      const c = (h) => (r ? ruinOf(h) : h), wall = c('#dccfb3'), trim = c('#f3ead3'), roof = c('#96493a');
      const lights = o.lights == null ? (r ? 0 : 1) : o.lights;
      let wi = 0; const st = () => { const on = (wi++ + 0.5) / 15 < lights; return on ? 'lit' : (r ? (wi % 3 === 0 ? 'board' : 'dark') : 'dark'); };
      box(g, X + 0.5, Y + 0.5, X + 3.1, Y + 2.9, 0, 46, F(wall));
      onL(g, X + 0.5, X + 3.1, Y + 2.9, 41, 46, trim); onR(g, X + 3.1, Y + 0.5, Y + 2.9, 41, 46, tone(trim, 0.76));
      poly(g, [P(X + 0.72, Y + 0.72, 46), P(X + 2.88, Y + 0.72, 46), P(X + 2.88, Y + 2.68, 46), P(X + 0.72, Y + 2.68, 46)], tone(wall, 0.8));
      for (const x of [0.6, 1.36, 2.16, 2.92]) onL(g, X + x, X + x + 0.09, Y + 2.9, 0, 41, trim);
      for (const [z0, z1] of [[9, 19], [25, 36]]) {
        win(g, 'L', X + 0.8, X + 1.24, Y + 2.9, z0, z1, st(), em); win(g, 'L', X + 2.36, X + 2.8, Y + 2.9, z0, z1, st(), em);
        for (const y of [0.72, 1.48, 2.24]) win(g, 'R', Y + y, Y + y + 0.46, X + 3.1, z0, z1, st(), em);
      }
      win(g, 'L', X + 1.56, X + 2.06, Y + 2.9, 27, 36, st(), em);
      if (o.flicker && Math.sin(t * 13) + Math.sin(t * 7.3) > 0.4) win(g, 'L', X + 2.36, X + 2.8, Y + 2.9, 25, 36, 'lit', em);
      box(g, X + 1.2, Y + 2.9, X + 2.42, Y + 3.22, 0, 5, F(c('#bcb29b')));
      onL(g, X + 1.5, X + 2.12, Y + 2.9, 5, 24, o.open ? '#0e0b09' : r ? '#2b2622' : '#6d4b2f');
      if (!r && !o.open) { onL(g, X + 1.8, X + 1.82, Y + 2.9, 5, 24, '#3b2a1c'); win(g, 'L', X + 1.56, X + 2.06, Y + 2.9, 19, 23, 'lit', em); }
      if (o.chained) { line(g, P(X + 1.5, Y + 2.9, 22), P(X + 2.12, Y + 2.9, 8), '#9aa0a6', 1.6); line(g, P(X + 1.5, Y + 2.9, 8), P(X + 2.12, Y + 2.9, 22), '#9aa0a6', 1.6); }
      if (r) { g.strokeStyle = '#3c5235'; g.lineWidth = 1.4; for (let i = 0; i < 5; i++) { const a = P(X + 0.56 + i * 0.13, Y + 2.9, 0), h2v = 12 + ((seed + i * 7) % 16); g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(a[0] + 4, a[1] - h2v * 0.6, a[0] + 1, a[1] - h2v); g.stroke(); } }
      box(g, X + 1.35, Y + 1.25, X + 2.25, Y + 2.15, 46, 78, F(wall));
      const ck = P(X + 1.8, Y + 2.15, 64);
      g.fillStyle = r ? '#8f918a' : '#f7f0da'; g.beginPath(); g.ellipse(ck[0], ck[1], 7.5, 8, 0, 0, TAU); g.fill();
      g.strokeStyle = '#3a342c'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(ck[0], ck[1]); g.lineTo(ck[0], ck[1] - 5.5); g.moveTo(ck[0], ck[1]); g.lineTo(ck[0] + 3.6, ck[1] + 1.2); g.stroke();
      if (!r) em.push({ k: 'dot', x: ck[0], y: ck[1], r: 13, col: 'rgba(255,225,160,.35)' });
      pyramid(g, X + 1.25, Y + 1.15, X + 2.35, Y + 2.25, 78, 22, roof);
      flag(g, X + 1.8, Y + 1.7, 100, t, '#ff8a3c', o.flag == null ? (r ? 0 : 1) : o.flag);
      for (let i = 1; i < lv; i++) poly(g, [P(X + 0.74 + i * 0.3, Y + 2.9, 41), P(X + 0.98 + i * 0.3, Y + 2.9, 41), P(X + 0.86 + i * 0.3, Y + 2.9, 30)], '#ff8a3c');
    },
    home(g, X, Y, r, lv, t, em, seed) {
      const cols = ['#e7d4a9', '#bcd2d8', '#dcbda3', '#cbd8b3'], roofs = ['#7d4135', '#4f5c6e', '#6e4c3b', '#5c6d4f'];
      house(g, X + 0.6, Y + 0.7, X + 2.5, Y + 2.5, 22, 15, cols[seed % 4], roofs[seed % 4], r, em, seed);
      if (lv >= 2) house(g, X + 2.62, Y + 1.7, X + 3.5, Y + 3.0, 15, 11, cols[(seed + 1) % 4], roofs[(seed + 2) % 4], r, em, seed + 3);
      if (!r) { box(g, X + 0.5, Y + 2.75, X + 1.3, Y + 3.15, 0, 3, F('#5b4332')); for (let i = 0; i < 4; i++) { const a = P(X + 0.6 + i * 0.2, Y + 2.95, 3); g.fillStyle = '#7fb65a'; g.beginPath(); g.arc(a[0], a[1] - 1, 2.6, 0, TAU); g.fill(); } }
    },
    garden(g, X, Y, r, lv, t, em, seed) {
      if (r) {
        deadTree(g, X + 1.0, Y + 1.1, 1.15, seed); deadTree(g, X + 2.7, Y + 0.9, 0.9, seed + 1); deadTree(g, X + 2.2, Y + 2.6, 1.0, seed + 2);
        cyl(g, X + 1.9, Y + 1.7, 0.42, 0, 6, '#6f716d');
        const a = P(X + 0.9, Y + 2.6, 0), b = P(X + 1.5, Y + 2.6, 0);
        for (const q of [a, b]) { line(g, [q[0] - 5, q[1]], [q[0], q[1] - 24], '#5d4a3c', 1.6); line(g, [q[0] + 5, q[1]], [q[0], q[1] - 24], '#5d4a3c', 1.6); }
        line(g, [a[0], a[1] - 24], [b[0], b[1] - 24], '#5d4a3c', 1.6); line(g, [a[0] + 9, a[1] - 20], [a[0] + 11, a[1] - 5], '#4b4d50', 1);
        return;
      }
      const rows = lv >= 3 ? 3 : 2 + (lv >= 2 ? 1 : 0) * 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
        if (j >= rows + (lv >= 2 ? 1 : 0)) continue;
        const x0 = X + 0.5 + i * 0.98, y0 = Y + 0.55 + j * 0.84;
        poly(g, [P(x0, y0), P(x0 + 0.86, y0), P(x0 + 0.86, y0 + 0.66), P(x0, y0 + 0.66)], '#5d4331');
        for (let k = 0; k < 3; k++) { const yy = y0 + 0.14 + k * 0.2; for (let q = 0; q < 5; q++) { const a = P(x0 + 0.1 + q * 0.17, yy, 0), hh = 3 + lv + ((seed + q + k) % 3); g.fillStyle = (q + k + j) % 4 ? '#86bd5c' : '#c9d86a'; g.beginPath(); g.ellipse(a[0], a[1] - hh / 2, 2.4, hh / 1.6, 0, 0, TAU); g.fill(); } }
      }
      if (lv >= 2) { g.globalAlpha = 0.42; box(g, X + 0.46, Y + 0.5, X + 2.4, Y + 1.25, 0, 13, F('#cfeef0')); g.globalAlpha = 1; for (let i = 0; i <= 4; i++) line(g, P(X + 0.46 + i * 0.485, Y + 1.25, 0), P(X + 0.46 + i * 0.485, Y + 1.25, 13), '#eef7f5', 1); line(g, P(X + 0.46, Y + 1.25, 13), P(X + 2.4, Y + 1.25, 13), '#eef7f5', 1); }
      box(g, X + 2.55, Y + 0.5, X + 3.1, Y + 1.25, 0, 15, F('#a9865d')); onL(g, X + 2.7, X + 2.95, Y + 1.25, 0, 11, '#4a3526');
      poly(g, [P(X + 2.5, Y + 0.45, 15), P(X + 3.15, Y + 0.45, 19), P(X + 3.15, Y + 1.3, 19), P(X + 2.5, Y + 1.3, 15)], '#6b4a3a');
      cyl(g, X + 2.85, Y + 1.9, 0.2, 0, 13, '#4f86a8');
      const s = P(X + 2.85, Y + 2.75, 0); line(g, s, [s[0], s[1] - 20], '#6b4f35', 1.6); line(g, [s[0] - 7, s[1] - 14], [s[0] + 7, s[1] - 14], '#6b4f35', 1.6);
      g.fillStyle = '#d8b25a'; g.beginPath(); g.arc(s[0], s[1] - 22, 3.4, 0, TAU); g.fill(); poly(g, [[s[0] - 5, s[1] - 24], [s[0] + 5, s[1] - 24], [s[0], s[1] - 29]], '#8a5a3a');
    },
    workshop(g, X, Y, r, lv, t, em, seed) {
      const c = (h) => (r ? ruinOf(h) : h), wall = c('#8f98a3');
      box(g, X + 0.5, Y + 0.6, X + 3.1, Y + 2.7, 0, 26, F(wall));
      for (let i = 1; i < 9; i++) line(g, P(X + 3.1, Y + 0.6 + i * 0.233, 0), P(X + 3.1, Y + 0.6 + i * 0.233, 26), tone(wall, 0.6), 0.7);
      onL(g, X + 0.5, X + 3.1, Y + 2.7, 20, 26, c('#e09a2e'));
      onL(g, X + 0.75, X + 2.05, Y + 2.7, 0, 18, r ? '#2a2c30' : '#2b1f15');
      if (!r) { em.push({ k: 'poly', pts: [P(X + 0.75, Y + 2.7, 0), P(X + 2.05, Y + 2.7, 0), P(X + 2.05, Y + 2.7, 11), P(X + 0.75, Y + 2.7, 11)], col: 'rgba(255,170,80,.4)' }); onL(g, X + 0.75, X + 2.05, Y + 2.7, 11, 18, '#6f7780'); }
      for (let i = 0; i < (r ? 6 : 2); i++) line(g, P(X + 0.75, Y + 2.7, r ? 2 + i * 3 : 13 + i * 2.5), P(X + 2.05, Y + 2.7, r ? 3 + i * 3 - (i % 2) * 2 : 13 + i * 2.5), '#4a4e55', 0.9);
      win(g, 'L', X + 2.3, X + 2.8, Y + 2.7, 8, 17, r ? 'board' : 'lit', em); win(g, 'R', Y + 1.0, Y + 1.7, X + 3.1, 9, 18, r ? 'dark' : 'lit', em);
      box(g, X + 1.0, Y + 1.0, X + 1.6, Y + 1.5, 26, 32, F(c('#6f7780'))); cyl(g, X + 2.4, Y + 1.2, 0.13, 26, 42, c('#5b6168'));
      if (r) { poly(g, [P(X + 2.3, Y + 2.7, 26), P(X + 3.1, Y + 2.7, 26), P(X + 3.1, Y + 2.7, 15), P(X + 2.75, Y + 2.7, 20)], '#191b1f'); }
      else { crates(g, X + 2.5, Y + 3.0, 2); for (let i = 1; i < lv; i++) box(g, X + 0.55 + i * 0.3, Y + 2.95, X + 0.75 + i * 0.3, Y + 3.15, 0, 7, F('#c7483b')); }
    },
    clinic(g, X, Y, r, lv, t, em, seed) {
      const c = (h) => (r ? ruinOf(h) : h), wall = c('#eceeea'), teal = c('#45b384');
      box(g, X + 0.6, Y + 0.6, X + 3.0, Y + 2.7, 0, 28, F(wall));
      onL(g, X + 0.6, X + 3.0, Y + 2.7, 21, 25, teal); onR(g, X + 3.0, Y + 0.6, Y + 2.7, 21, 25, tone(teal, 0.75));
      win(g, 'L', X + 1.5, X + 2.1, Y + 2.7, 0, 17, r ? 'dark' : 'lit', em);
      win(g, 'L', X + 0.8, X + 1.25, Y + 2.7, 7, 17, r ? 'board' : 'lit', em); win(g, 'L', X + 2.35, X + 2.8, Y + 2.7, 7, 17, r ? 'dark' : 'lit', em);
      for (const y of [0.85, 1.55, 2.2]) win(g, 'R', Y + y, Y + y + 0.4, X + 3.0, 7, 17, r ? (y > 2 ? 'board' : 'dark') : 'lit', em);
      box(g, X + 1.35, Y + 1.3, X + 2.25, Y + 1.5, 28, 46, F(c('#f6f6f1')));
      const cr = r ? '#6f7471' : '#35c27f', a = [P(X + 1.72, Y + 1.5, 31), P(X + 1.88, Y + 1.5, 31), P(X + 1.88, Y + 1.5, 43), P(X + 1.72, Y + 1.5, 43)], b = [P(X + 1.55, Y + 1.5, 35), P(X + 2.05, Y + 1.5, 35), P(X + 2.05, Y + 1.5, 39), P(X + 1.55, Y + 1.5, 39)];
      poly(g, a, cr); if (!r || seed % 2) poly(g, b, cr);
      if (!r) { em.push({ k: 'poly', pts: a, col: 'rgba(80,255,170,.7)' }); em.push({ k: 'poly', pts: b, col: 'rgba(80,255,170,.7)' }); for (let i = 1; i < lv; i++) box(g, X + 0.7 + i * 0.35, Y + 2.95, X + 0.95 + i * 0.35, Y + 3.15, 0, 6, F('#f2f2ee')); }
    },
    armory(g, X, Y, r, lv, t, em, seed) {
      const c = (h) => (r ? ruinOf(h) : h), wall = c('#a15c49');
      box(g, X + 0.5, Y + 0.6, X + 3.1, Y + 2.7, 0, 30, F(wall));
      for (let i = 1; i < 6; i++) { line(g, P(X + 0.5, Y + 2.7, i * 5), P(X + 3.1, Y + 2.7, i * 5), tone(wall, 0.78), 0.6); line(g, P(X + 3.1, Y + 0.6, i * 5), P(X + 3.1, Y + 2.7, i * 5), tone(wall, 0.55), 0.6); }
      box(g, X + 0.5, Y + 0.6, X + 1.8, Y + 1.9, 30, 45, F(c('#915040')));
      onL(g, X + 1.55, X + 2.1, Y + 2.7, 0, 20, c('#3c4148'));
      for (const x of [0.75, 2.4]) { win(g, 'L', X + x, X + x + 0.5, Y + 2.7, 9, 20, r ? 'dark' : 'lit', em); for (let i = 1; i < 4; i++) line(g, P(X + x + i * 0.125, Y + 2.7, 9), P(X + x + i * 0.125, Y + 2.7, 20), '#2a2d33', 1); }
      win(g, 'R', Y + 1.1, Y + 1.6, X + 3.1, 9, 20, r ? 'board' : 'lit', em); win(g, 'L', X + 0.8, X + 1.4, Y + 1.9, 34, 41, r ? 'dark' : 'lit', em);
      const lamp = P(X + 2.6, Y + 1.2, 30); box(g, X + 2.5, Y + 1.1, X + 2.7, Y + 1.3, 30, 35, F('#39424d'));
      if (!r) { if (Math.sin(t * 5) > 0) em.push({ k: 'dot', x: lamp[0], y: lamp[1] - 6, r: 9, col: 'rgba(90,150,255,.85)' }); sandbags(g, X + 0.6, Y + 3.05, 2 + lv); flag(g, X + 0.6, Y + 0.7, 45, t, '#ff8a3c', 1); }
      else for (let i = 0; i < 6; i++) { const q = P(X + 0.7 + ((seed * (i + 3)) % 20) / 10, Y + 2.7, 4 + ((seed + i * 5) % 14)); g.fillStyle = '#1c1b1b'; g.fillRect(q[0], q[1], 1.6, 1.6); }
    },
    tower(g, X, Y, r, lv, t, em, seed) {
      const c = (h) => (r ? ruinOf(h) : h), x0 = X + 1.3, y0 = Y + 1.2, x1 = X + 2.5, y1 = Y + 2.4, leg = c('#6b5b49'), top = 52 + (r ? 0 : lv * 3);
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) line(g, P(x, y, 0), P(x + (x === x0 ? 0.12 : -0.12), y + (y === y0 ? 0.12 : -0.12), top), leg, 2.4);
      line(g, P(x0, y1, 4), P(x1, y1, top - 8), leg, 1.2); line(g, P(x1, y1, 4), P(x0, y1, top - 8), leg, 1.2); line(g, P(x1, y0, 4), P(x1, y1, top - 8), leg, 1.2); line(g, P(x1, y1, 4), P(x1, y0, top - 8), leg, 1.2);
      box(g, x0 - 0.12, y0 - 0.12, x1 + 0.12, y1 + 0.12, top, top + 4, F(c('#7d6a54')));
      if (r) { cyl(g, (x0 + x1) / 2, (y0 + y1) / 2, 0.6, top + 4, top + 30, '#73574a'); line(g, P(x1, y1, 0), P(x1 - 0.1, y1 - 0.4, top), '#4a4e52', 1); return; }
      box(g, x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, top + 4, top + 20, F(c('#ad8a60')));
      win(g, 'L', x0 + 0.3, x1 - 0.3, y1 - 0.08, top + 10, top + 17, 'lit', em); win(g, 'R', y0 + 0.3, y1 - 0.3, x1 - 0.08, top + 10, top + 17, 'lit', em);
      pyramid(g, x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05, top + 20, 12, '#6e4c3b');
      line(g, P(x1, y1, 0), P(x1 - 0.1, y1 - 0.25, top), '#c9c4b8', 1);
    },
    gas(g, X, Y, r, lv, t, em, seed) {
      const c = (h) => (r ? ruinOf(h) : h);
      box(g, X + 0.6, Y + 0.5, X + 2.3, Y + 1.5, 0, 22, F(c('#d9d4c5')));
      win(g, 'L', X + 0.8, X + 2.1, Y + 1.5, 6, 17, r ? 'board' : 'lit', em); onL(g, X + 0.6, X + 2.3, Y + 1.5, 18, 22, c('#c7483b'));
      if (r) car(g, X + 1.2, Y + 2.2, 0, '#6c7078', seed % 2 === 0, t, em);
      for (const x of [0.95, 2.05]) { line(g, P(X + x - 0.2, Y + 2.5, 0), P(X + x - 0.2, Y + 2.5, 32), c('#b9b4a6'), 2); box(g, X + x, Y + 2.38, X + x + 0.24, Y + 2.62, 0, 14, F(c('#c7483b'))); }
      box(g, X + 0.5, Y + 1.95, X + 2.75, Y + 3.05, 32, 37, F(c('#ebe6d7'))); onL(g, X + 0.5, X + 2.75, Y + 3.05, 32, 37, c('#c7483b'));
      if (!r) { for (const x of [1.0, 1.6, 2.2]) { const q = P(X + x, Y + 2.5, 31); em.push({ k: 'dot', x: q[0], y: q[1], r: 7, col: 'rgba(255,240,200,.8)' }); } for (let i = 0; i < lv; i++) cyl(g, X + 2.9 + (i % 2) * 0.3, Y + 0.8 + i * 0.32, 0.14, 0, 12, '#c7483b'); }
      line(g, P(X + 3.2, Y + 3.2, 0), P(X + 3.2, Y + 3.2, 46), c('#b9b4a6'), 2); box(g, X + 3.05, Y + 3.2, X + 3.35, Y + 3.22, 36, 48, F(c('#f0c34a')));
    },
    bridge(g, X, Y, r, lv, t, em, seed) {
      const c = (h) => (r ? ruinOf(h) : h);
      box(g, X + 0.7, Y + 0.8, X + 2.3, Y + 1.6, 4, 21, F(c('#62704f'))); box(g, X + 2.3, Y + 0.86, X + 2.95, Y + 1.54, 4, 17, F(c('#586547')));
      win(g, 'R', Y + 0.95, Y + 1.45, X + 2.95, 10, 16, 'dark');
      for (const [x, y] of [[1.0, 1.6], [2.0, 1.6], [2.7, 1.54]]) { const q = P(X + x, Y + y, 2); g.fillStyle = '#17181a'; g.beginPath(); g.ellipse(q[0], q[1], 5, 5.5, 0, 0, TAU); g.fill(); }
      for (const [x, y, a] of [[0.5, 2.5, 0], [1.5, 2.7, 1], [2.6, 2.45, 0]]) box(g, X + x, Y + y, X + x + 0.85, Y + y + 0.22, 0, 9, F(a ? '#c9c6bd' : '#b5b2a9'));
      sandbags(g, X + 0.5, Y + 3.2, 4);
      line(g, P(X + 3.3, Y + 3.0, 0), P(X + 3.3, Y + 3.0, 58), '#8a8f96', 2);
      const q = P(X + 3.3, Y + 3.0, 60);
      if (r) { if (Math.sin(t * 3) > 0.2) em.push({ k: 'dot', x: q[0], y: q[1], r: 10, col: 'rgba(255,60,50,.9)' }); }
      else em.push({ k: 'dot', x: q[0], y: q[1], r: 12, col: 'rgba(90,255,150,.9)' });
      box(g, X + 0.9, Y + 3.5, X + 2.3, Y + 3.52, 10, 24, F('#e0b93f')); onL(g, X + 0.9, X + 2.3, Y + 3.52, 15, 19, '#26221d');
      line(g, P(X + 0.95, Y + 3.5, 0), P(X + 0.95, Y + 3.5, 10), '#7a7468', 2); line(g, P(X + 2.25, Y + 3.5, 0), P(X + 2.25, Y + 3.5, 10), '#7a7468', 2);
    },
  };
  function house(g, x0, y0, x1, y1, h, rise, wallC, roofC, r, em, seed) {
    const wall = r ? ruinOf(wallC) : wallC, roof = r ? ruinOf(roofC) : roofC, w = x1 - x0, d = y1 - y0, st = (i) => (r ? ((seed + i) % 2 ? 'board' : 'dark') : 'lit');
    box(g, x0, y0, x1, y1, 0, h, F(wall));
    onL(g, x0 + w * 0.41, x0 + w * 0.59, y1, 0, h * 0.64, r ? '#27231f' : '#6d4b2f');
    win(g, 'L', x0 + w * 0.1, x0 + w * 0.31, y1, h * 0.36, h * 0.76, st(0), em); win(g, 'L', x0 + w * 0.69, x0 + w * 0.9, y1, h * 0.36, h * 0.76, st(1), em);
    win(g, 'R', y0 + d * 0.3, y0 + d * 0.68, x1, h * 0.36, h * 0.76, st(2), em);
    gable(g, x0 - 0.08, y0 - 0.08, x1 + 0.08, y1 + 0.08, h, rise, roof, wall);
    if (r) poly(g, [P(x0 + w * 0.5, y1 - d * 0.1, h + rise * 0.22), P(x0 + w * 0.82, y1 - d * 0.14, h + rise * 0.3), P(x0 + w * 0.74, y1 - d * 0.36, h + rise * 0.74), P(x0 + w * 0.5, y1 - d * 0.3, h + rise * 0.6)], '#17191c');
    else box(g, x0 + w * 0.68, y0 + d * 0.3, x0 + w * 0.8, y0 + d * 0.42, h + rise * 0.5, h + rise + 6, F('#8b5a48'));
  }

  // ---------------------------------------------------------------- props
  function deadTree(g, x, y, s, seed) {
    const a = P(x, y, 0), col = '#3b312a', k = 26 * s, f = (seed % 2 ? 1 : -1);
    line(g, a, [a[0] + 2 * f, a[1] - k], col, 2.4 * s);
    line(g, [a[0] + f, a[1] - k * 0.5], [a[0] + 10 * s * f, a[1] - k * 0.85], col, 1.6 * s); line(g, [a[0] + 1.4 * f, a[1] - k * 0.66], [a[0] - 9 * s * f, a[1] - k * 0.98], col, 1.5 * s);
    line(g, [a[0] + 2 * f, a[1] - k], [a[0] + 6 * s * f, a[1] - k * 1.28], col, 1.2 * s); line(g, [a[0] + 2 * f, a[1] - k], [a[0] - 4 * s * f, a[1] - k * 1.25], col, 1.2 * s);
  }
  function tree(g, x, y, s) {
    const a = P(x, y, 0);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(a[0], a[1], 9 * s, 4 * s, 0, 0, TAU); g.fill();
    line(g, a, [a[0], a[1] - 12 * s], '#5a4332', 2.6 * s);
    g.fillStyle = '#4f8a45'; g.beginPath(); g.arc(a[0], a[1] - 19 * s, 9.5 * s, 0, TAU); g.fill();
    g.fillStyle = '#69a856'; g.beginPath(); g.arc(a[0] - 2.5 * s, a[1] - 22 * s, 6.5 * s, 0, TAU); g.fill();
  }
  function car(g, x, y, along, col, burnt, t, em) {
    const c = burnt ? '#2b2a29' : col, L = 1.15, Wd = 0.52;
    const x1 = x + (along ? Wd : L), y1 = y + (along ? L : Wd);
    g.fillStyle = 'rgba(0,0,0,.3)'; poly(g, [P(x - 0.05, y - 0.05), P(x1 + 0.08, y - 0.05), P(x1 + 0.08, y1 + 0.08), P(x - 0.05, y1 + 0.08)], 'rgba(0,0,0,.3)');
    box(g, x, y, x1, y1, 2, 10, F(c));
    const cx0 = along ? x + 0.04 : x + L * 0.26, cy0 = along ? y + L * 0.26 : y + 0.04, cx1 = along ? x1 - 0.04 : x + L * 0.76, cy1 = along ? y + L * 0.76 : y1 - 0.04;
    box(g, cx0, cy0, cx1, cy1, 10, 17, F(tone(c, 0.9)));
    onL(g, cx0 + 0.04, cx1 - 0.04, cy1, 11, 16, '#14171b'); onR(g, cx1, cy0 + 0.04, cy1 - 0.04, 11, 16, '#101216');
    if (burnt && em) { const q = P((x + x1) / 2, (y + y1) / 2, 14); em.push({ k: 'flame', x: q[0], y: q[1], s: 0.9, seed: (x * 31 + y * 17) | 0 }); }
  }
  function barrel(g, x, y, fire, em, seed) {
    cyl(g, x, y, 0.17, 0, 13, '#5d4233');
    if (fire && em) { const q = P(x, y, 14); em.push({ k: 'flame', x: q[0], y: q[1], s: 0.75, seed: seed | 0 }); }
  }
  function debris(g, x, y, seed) {
    const r = rnd(seed * 977 + 13), cols = ['#2f3135', '#4a4640', '#3b3f44', '#55504a'];
    for (let i = 0; i < 6; i++) { const a = P(x + (r() - 0.5) * 0.7, y + (r() - 0.5) * 0.7, 0), w = 3 + r() * 6, h = 2 + r() * 4; poly(g, [[a[0] - w, a[1]], [a[0], a[1] - h], [a[0] + w, a[1] - h * 0.3], [a[0] + w * 0.4, a[1] + h * 0.6]], cols[i % 4]); }
  }
  function crates(g, x, y, n) { for (let i = 0; i < n; i++) box(g, x + i * 0.33, y, x + i * 0.33 + 0.28, y + 0.28, 0, 8 + (i % 2) * 3, F('#b08a55')); }
  function sandbags(g, x, y, n) {
    for (let i = 0; i < n; i++) { const a = P(x + i * 0.26, y, 0); g.fillStyle = i % 2 ? '#b7a781' : '#a39470'; g.beginPath(); g.ellipse(a[0], a[1] - 3, 7.5, 4.2, 0.46, 0, TAU); g.fill(); }
    for (let i = 0; i < n - 1; i++) { const a = P(x + 0.13 + i * 0.26, y, 0); g.fillStyle = '#ad9e79'; g.beginPath(); g.ellipse(a[0], a[1] - 8.5, 7.5, 4.2, 0.46, 0, TAU); g.fill(); }
  }
  function lamp(g, x, y, on, em, broken) {
    const a = P(x, y, 0), top = [a[0] + (broken ? 5 : 0), a[1] - 36];
    line(g, a, top, '#5d646c', 2); line(g, top, [top[0] + 7, top[1] + 2], '#5d646c', 2);
    g.fillStyle = on ? '#ffe7a8' : '#3a3f45'; g.beginPath(); g.arc(top[0] + 8, top[1] + 3.5, 2.6, 0, TAU); g.fill();
    if (on && em) em.push({ k: 'dot', x: top[0] + 8, y: top[1] + 3.5, r: 12, col: 'rgba(255,225,150,.75)' });
  }
  function barricade(g, x, y, along) {                 // a wooden X across a street
    const a = P(x, y, 0), b = along ? P(x, y + 0.8, 0) : P(x + 0.8, y, 0);
    line(g, [a[0], a[1]], [b[0], b[1] - 14], '#6e5539', 3); line(g, [a[0], a[1] - 14], [b[0], b[1]], '#5f4830', 3); line(g, [a[0], a[1] - 7], [b[0], b[1] - 7], '#7a6044', 2.4);
  }
  function campfire(g, x, y, em, seed) {
    const a = P(x, y, 0);
    g.fillStyle = '#6a6c6e'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(a[0] + Math.cos(i) * 8, a[1] + Math.sin(i) * 4, 2.4, 1.6, 0, 0, TAU); g.fill(); }
    line(g, [a[0] - 6, a[1] + 1], [a[0] + 6, a[1] - 3], '#4a3424', 2.6); line(g, [a[0] - 6, a[1] - 3], [a[0] + 6, a[1] + 1], '#3b291c', 2.6);
    em.push({ k: 'flame', x: a[0], y: a[1] - 2, s: 1, seed: seed | 0 });
  }
  function grave(g, x, y, col, sel) {
    const a = P(x, y, 0);
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(a[0] + 2, a[1] + 1, 8, 3.4, 0, 0, TAU); g.fill();
    g.fillStyle = '#6b5a45'; g.beginPath(); g.ellipse(a[0] + 4, a[1] + 4, 9, 3.6, 0.46, 0, TAU); g.fill();
    g.fillStyle = sel ? '#e9ece6' : '#c3c7c1'; g.beginPath(); g.moveTo(a[0] - 5, a[1]); g.lineTo(a[0] - 5, a[1] - 11); g.arc(a[0], a[1] - 11, 5, Math.PI, 0); g.lineTo(a[0] + 5, a[1]); g.closePath(); g.fill();
    g.fillStyle = col; g.fillRect(a[0] - 5, a[1] - 9, 10, 2.2);
    g.fillStyle = '#f2d06b'; g.beginPath(); g.arc(a[0] + 7, a[1] + 3, 1.6, 0, TAU); g.fill(); g.fillStyle = '#e88aa0'; g.beginPath(); g.arc(a[0] + 4, a[1] + 5, 1.5, 0, TAU); g.fill();
  }
  // a wall piece along a tile edge: from (x0, y0) to (x1, y1), h px tall; kind 0 wood, 1 sheet metal, 2 gate
  function wall(g, x0, y0, x1, y1, h, kind, em, t, seed) {
    const a = P(x0, y0, 0), b = P(x1, y1, 0), alongX = y0 === y1;
    const base = kind === 1 ? '#727b84' : kind === 2 ? '#5d646c' : '#86684a', col = alongX ? base : tone(base, 0.76);
    if (kind === 2) {
      g.globalAlpha = 0.5; poly(g, [a, b, [b[0], b[1] - h], [a[0], a[1] - h]], col); g.globalAlpha = 1;
      for (let i = 0; i <= 4; i++) { const k = i / 4, q = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; line(g, q, [q[0], q[1] - h], '#aab1b8', i % 4 ? 0.8 : 2.2); }
      line(g, [a[0], a[1] - h], [b[0], b[1] - h], '#aab1b8', 1.6); line(g, [a[0], a[1] - h * 0.5], [b[0], b[1] - h * 0.5], '#aab1b8', 0.8);
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - h - 3];
      g.fillStyle = '#ffd98a'; g.beginPath(); g.arc(m[0], m[1], 2.2, 0, TAU); g.fill(); if (em) em.push({ k: 'dot', x: m[0], y: m[1], r: 10, col: 'rgba(255,215,140,.7)' });
      return;
    }
    poly(g, [a, b, [b[0], b[1] - h], [a[0], a[1] - h]], col);
    for (let i = 1; i < 4; i++) { const k = i / 4, q = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; line(g, q, [q[0], q[1] - h], tone(base, 0.55), 0.8); }
    g.fillStyle = tone(base, alongX ? 1.15 : 0.9);
    for (let i = 0; i < 4; i++) { const k0 = i / 4, k1 = (i + 1) / 4, km = (k0 + k1) / 2; g.beginPath(); g.moveTo(a[0] + (b[0] - a[0]) * k0, a[1] + (b[1] - a[1]) * k0 - h); g.lineTo(a[0] + (b[0] - a[0]) * km, a[1] + (b[1] - a[1]) * km - h - 4 - ((seed + i) % 3)); g.lineTo(a[0] + (b[0] - a[0]) * k1, a[1] + (b[1] - a[1]) * k1 - h); g.closePath(); g.fill(); }
    if (kind === 1) line(g, [a[0], a[1] - h * 0.55], [b[0], b[1] - h * 0.55], '#8b4f32', 1.4);
  }
  function scaffold(g, X, Y, k) {                      // over a building being built; k = progress
    const c = '#d8b25a';
    for (const x of [0.45, 1.8, 3.15]) line(g, P(X + x, Y + 3.0, 0), P(X + x, Y + 3.0, 34), c, 1.6);
    for (const y of [0.55, 1.75, 3.0]) line(g, P(X + 3.15, Y + y, 0), P(X + 3.15, Y + y, 34), c, 1.6);
    for (const z of [12, 24, 34]) { line(g, P(X + 0.45, Y + 3.0, z), P(X + 3.15, Y + 3.0, z), c, 1.2); line(g, P(X + 3.15, Y + 0.55, z), P(X + 3.15, Y + 3.0, z), c, 1.2); }
    line(g, P(X + 0.45, Y + 3.0, 0), P(X + 1.8, Y + 3.0, 12), c, 1); line(g, P(X + 1.8, Y + 3.0, 12), P(X + 3.15, Y + 3.0, 24), c, 1);
  }

  // ---------------------------------------------------------------- people and walkers (feet at the given screen point)
  // o: { look, t, walk, face (1 | -1), pose: 'stand' | 'sit' | 'down' | 'aim', alpha, s }
  function person(g, px, py, o) {
    const L = o.look, s = o.s || 1, f = o.face < 0 ? -1 : 1, sw = o.walk ? Math.sin(o.t * 9) * 3 : 0;
    g.save(); g.translate(px, py); g.scale(s * f, s); if (o.alpha != null) g.globalAlpha *= o.alpha;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(0, 0, 7, 3, 0, 0, TAU); g.fill();
    if (o.pose === 'down') { g.rotate(-1.45); g.translate(-2, -4); }
    const sit = o.pose === 'sit', by = sit ? -13 : -20;
    g.lineCap = 'round'; g.strokeStyle = '#2f3440'; g.lineWidth = 3;
    if (sit) { g.beginPath(); g.moveTo(-1.5, -3); g.lineTo(5, -2); g.moveTo(1.5, -3); g.lineTo(6, 0); g.stroke(); }
    else { g.beginPath(); g.moveTo(-2, -8.5); g.lineTo(-2 + sw, 0); g.moveTo(2, -8.5); g.lineTo(2 - sw, 0); g.stroke(); }
    g.fillStyle = L.jacket; g.beginPath(); g.roundRect(-4.6, by, 9.2, 12.5, 3); g.fill();
    g.strokeStyle = tone(L.jacket, 0.72); g.lineWidth = 2.6;
    if (o.pose === 'aim') { g.beginPath(); g.moveTo(3, by + 3); g.lineTo(10, by + 3.5); g.stroke(); g.strokeStyle = '#1e2126'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, by + 3); g.lineTo(15, by + 2.5); g.stroke(); }
    else { g.beginPath(); g.moveTo(-4.2, by + 2.5); g.lineTo(-5.2, by + 9 - sw * 0.6); g.moveTo(4.2, by + 2.5); g.lineTo(5.2, by + 9 + sw * 0.6); g.stroke(); }
    g.fillStyle = L.skin; g.beginPath(); g.arc(0, by - 4.4, 4.6, 0, TAU); g.fill();
    g.fillStyle = L.hair;
    if (L.style === 2) { g.fillStyle = tone(L.jacket, 0.6); g.beginPath(); g.arc(0, by - 5, 4.8, Math.PI, 0); g.fill(); g.fillRect(-4.8, by - 5.6, 9.6, 1.8); }
    else { g.beginPath(); g.arc(0, by - 5.2, 4.7, Math.PI * 1.05, -0.05 * Math.PI); g.fill(); if (L.style === 1) g.fillRect(-4.7, by - 5.4, 2.6, 6.5); if (L.style === 3) { g.beginPath(); g.arc(-1, by - 10.4, 2.3, 0, TAU); g.fill(); } }
    g.restore();
  }
  const ZSHIRT = ['#6f7d8c', '#8a6f6a', '#77806a', '#8b8473', '#6a6f86', '#7d6a80'];
  // o: { seed, t, face, walk, hit (0-1 white flash), fall (0-1), s, bang }
  function zombie(g, px, py, o) {
    const s = o.s || 1, f = o.face < 0 ? -1 : 1, sw = o.walk ? Math.sin(o.t * 5) * 2.2 : 0, fall = o.fall || 0;
    g.save(); g.translate(px, py); g.scale(s * f, s);
    g.globalAlpha *= 1 - Math.max(0, fall - 0.6) / 0.4;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(0, 0, 7, 3, 0, 0, TAU); g.fill();
    g.rotate(0.2 + fall * 1.25); g.translate(0, fall * 3);
    const skin = o.hit ? '#ffffff' : (o.s > 1.5 ? '#77896a' : '#93a886'), shirt = o.hit ? '#ffffff' : ZSHIRT[o.seed % 6];
    g.lineCap = 'round'; g.strokeStyle = o.hit ? '#fff' : '#33363d'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-2, -8.5); g.lineTo(-3 + sw, 0); g.moveTo(2, -8.5); g.lineTo(1 - sw * 0.5, 0); g.stroke();
    g.fillStyle = shirt; g.beginPath(); g.roundRect(-4.6, -20, 9.2, 12.5, 3); g.fill();
    g.fillStyle = tone(o.hit ? '#ffffff' : shirt, 0.7); g.fillRect(-4.6, -11, 4, 3.5);
    const ay = o.bang ? Math.sin(o.t * 14) * 3 : Math.sin(o.t * 2.2) * 1.2;
    g.strokeStyle = skin; g.lineWidth = 2.6; g.beginPath(); g.moveTo(3.5, -17.5); g.lineTo(11, -16 + ay); g.moveTo(2.5, -15.5); g.lineTo(10, -12.5 - ay); g.stroke();
    g.fillStyle = skin; g.beginPath(); g.arc(1.6, -24, 4.6, 0, TAU); g.fill();
    g.fillStyle = o.hit ? '#fff' : '#3a2f2a'; g.beginPath(); g.arc(1, -25.6, 4.4, Math.PI * 1.1, -0.15 * Math.PI); g.fill();
    g.restore();
  }
  // glowing things, drawn with 'lighter' after the darkness
  function flame(g, x, y, s, t, seed) {
    const w = Math.sin(t * 11 + seed) * 1.6 + Math.sin(t * 17.3 + seed * 2) * 1.1, h = 1 + 0.16 * Math.sin(t * 9 + seed * 3);
    const lobe = (rx, ry, col, ox) => { g.fillStyle = col; g.beginPath(); g.moveTo(x - rx * s, y); g.quadraticCurveTo(x - rx * s * 0.9, y - ry * s * h * 0.6, x + (w + ox) * s, y - ry * s * h); g.quadraticCurveTo(x + rx * s * 0.9, y - ry * s * h * 0.6, x + rx * s, y); g.closePath(); g.fill(); };
    lobe(7, 19, 'rgba(255,110,30,.75)', 0); lobe(4.6, 13, 'rgba(255,190,60,.85)', -0.6); lobe(2.4, 7, 'rgba(255,245,200,.9)', 0.4);
  }
  function glow(g, e, t) {
    if (e.k === 'poly') poly(g, e.pts, e.col);
    else if (e.k === 'dot') { const gr = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r); gr.addColorStop(0, e.col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); }
    else if (e.k === 'flame') flame(g, e.x, e.y, e.s, t, e.seed);
  }

  // ---------------------------------------------------------------- the ground (drawn once into a cache)
  // owned(bx, by) -> bool; inside(tx, ty) -> the tile is inside the walls
  function ground(g, D, seed, owned, inside) {
    const { N, LOT, P: PITCH, WORLD: Wd, C } = D, r = rnd(seed * 31 + 7);
    const lot = (b) => 1 + b * PITCH;
    // the dark fields and the woods around the town, and the roads that leave it
    for (let i = 0; i < 420; i++) {
      const side = Math.floor(r() * 4), u = r() * (Wd + 10) - 5, out = -0.6 - r() * r() * 7.5;
      const x = side === 0 ? u : side === 1 ? Wd - out : side === 2 ? u : out, y = side === 0 ? out : side === 1 ? u : side === 2 ? Wd - out : u, a = P(x, y, 0), s = 0.8 + r() * 0.9;
      g.fillStyle = ['#1d2a22', '#19241e', '#22302a', '#1a2620'][i % 4]; g.beginPath(); g.ellipse(a[0], a[1] - 9 * s, 13 * s, 15 * s, 0, 0, TAU); g.fill();
    }
    for (const k of [10, 15]) { poly(g, [P(k, -9), P(k + 1, -9), P(k + 1, 0), P(k, 0)], '#30333a'); poly(g, [P(k, Wd), P(k + 1, Wd), P(k + 1, Wd + 9), P(k, Wd + 9)], '#30333a'); poly(g, [P(-9, k), P(0, k), P(0, k + 1), P(-9, k + 1)], '#30333a'); poly(g, [P(Wd, k), P(Wd + 9, k), P(Wd + 9, k + 1), P(Wd, k + 1)], '#30333a'); }
    poly(g, [P(0, 0), P(Wd, 0), P(Wd, Wd), P(0, Wd)], '#3c4048');
    // street tiles: a little noise, cracks, stains and litter (less of it inside the walls)
    for (let ty = 0; ty < Wd; ty++) for (let tx = 0; tx < Wd; tx++) {
      if (tx % PITCH && ty % PITCH) continue;
      const ins = inside(tx, ty), v = r();
      poly(g, [P(tx, ty), P(tx + 1, ty), P(tx + 1, ty + 1), P(tx, ty + 1)], ins ? (v < 0.5 ? '#5a5d60' : '#56595c') : (v < 0.33 ? '#3a3e46' : v < 0.66 ? '#40444c' : '#373b42'));
      if (!ins && r() < 0.5) { const a = P(tx + r(), ty + r(), 0); g.strokeStyle = '#2a2d33'; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]); for (let k = 0; k < 3; k++) g.lineTo(a[0] + (r() - 0.5) * 34, a[1] + (r() - 0.5) * 17); g.stroke(); }
      if (!ins && r() < 0.22) { const a = P(tx + r(), ty + r(), 0); g.fillStyle = 'rgba(20,22,26,.5)'; g.beginPath(); g.ellipse(a[0], a[1], 6 + r() * 10, 3 + r() * 5, 0, 0, TAU); g.fill(); }
      if (!ins && r() < 0.5) for (let k = 0; k < 3; k++) { const a = P(tx + r(), ty + r(), 0); g.fillStyle = ['#8d8a78', '#6d5c48', '#9aa0a6'][k]; g.fillRect(a[0], a[1], 1.8, 1.2); }
    }
    // lane dashes
    for (let s = 0; s <= N; s++) for (let u = 0; u < Wd; u += 0.5) {
      if (Math.floor(u) % PITCH === 0) continue;
      const k = s * PITCH + 0.5, ins1 = inside(k - 0.5, Math.floor(u)), ins2 = inside(Math.floor(u), k - 0.5);
      if (ins1 || r() < 0.72) poly(g, [P(k - 0.03, u + 0.1), P(k + 0.03, u + 0.1), P(k + 0.03, u + 0.36), P(k - 0.03, u + 0.36)], ins1 ? '#cfc9a8' : '#77745f');
      if (ins2 || r() < 0.72) poly(g, [P(u + 0.1, k - 0.03), P(u + 0.36, k - 0.03), P(u + 0.36, k + 0.03), P(u + 0.1, k + 0.03)], ins2 ? '#cfc9a8' : '#77745f');
    }
    // the lots
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
      const X = lot(bx), Y = lot(by), mine = owned(bx, by), hallLot = bx === C && by === C;
      poly(g, [P(X, Y), P(X + LOT, Y), P(X + LOT, Y + LOT), P(X, Y + LOT)], mine ? '#8b8672' : '#474b42', mine ? '#a8a28b' : '#5b5f63', 1.5);
      const n = mine ? 9 : 14;
      for (let i = 0; i < n; i++) {
        const a = P(X + 0.3 + r() * 3.4, Y + 0.3 + r() * 3.4, 0);
        g.fillStyle = mine ? (hallLot ? '#96907a' : ['#7fa35f', '#8aae66', '#93896f'][i % 3]) : ['#3f4439', '#4d5145', '#383c36', '#515846'][i % 4];
        g.beginPath(); g.ellipse(a[0], a[1], 10 + r() * 16, 5 + r() * 8, 0, 0, TAU); g.fill();
      }
      if (mine) { poly(g, [P(X + 0.1, Y + 3.25), P(X + 3.9, Y + 3.25), P(X + 3.9, Y + 3.8), P(X + 0.1, Y + 3.8)], '#a59c84'); poly(g, [P(X + 3.25, Y + 0.1), P(X + 3.8, Y + 0.1), P(X + 3.8, Y + 3.8), P(X + 3.25, Y + 3.8)], '#a59c84'); }
      else for (let i = 0; i < 10; i++) { const a = P(X + r() * 4, Y + r() * 4, 0); g.strokeStyle = '#59684a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0] + (r() - 0.5) * 5, a[1] - 4 - r() * 5); g.stroke(); }
    }
  }

  root.HH = root.HH || {};
  root.HH.Art = { P, tone, mix, rnd, poly, line, box, cyl, B, deadTree, tree, car, barrel, debris, crates, sandbags, lamp, barricade, campfire, grave, wall, scaffold, person, zombie, flame, glow, ground };
})(typeof self !== 'undefined' ? self : this);
