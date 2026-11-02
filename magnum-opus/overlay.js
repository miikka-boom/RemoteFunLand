// MAGNUM OPUS typography layer (owner: type). Everything here is Canvas 2D, drawn by one
// MO.overlay() callback after tone mapping, so colours appear exactly as drawn. The post
// pass's flashes go under the type (it stays legible through them); its impact frames,
// vignette and grain land on top. Pure function of t; all times come from score.js
// (overlayWindows, vocals, drums), never from hard-coded seconds (the one exception is the
// measured consonant pre-roll of a few rap words, see PRE_ROLL).
// The frame is laid out in 1920x1080 units (ctx.scale(H / 1080)).
(() => {
  'use strict';
  const S = window.SCORE, BEAT = MO.BEAT, BAR = MO.BAR;
  const { clamp, mix, remap, easeOut, easeIn, easeInOut } = MO;
  const TAU = Math.PI * 2;
  const FRAME = 1 / 30;                 // one frame of the 30 fps master
  const bt = (b) => b * BEAT;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const easeOutBack = (x, c = 1.7) => { x = clamp(x); const y = x - 1; return 1 + (c + 1) * y * y * y + c * y * y; };

  // ---------------------------------------------------------------- fonts
  const F = { cinzel: 'Cinzel', min: 'MO Mincho', round: 'MO Round', chrome: 'MO Chrome', hud: 'MO Hud' };
  const FACES = [
    [F.cinzel, 'fonts/cinzel-latin.woff2', '400 900'],
    [F.min, 'fonts/shippori-mincho-b1-800-sub.woff2', '800'],
    [F.round, 'fonts/mplus-rounded-800-sub.woff2', '800'],
    [F.chrome, 'fonts/exo2-black-italic-latin.woff2', '900'],
    [F.hud, 'fonts/michroma-latin.woff2', '400'],
  ];
  for (const [fam, url, weight] of FACES) {
    const face = new FontFace(fam, `url(${url})`, { weight });
    MO.waitFor(face.load().then((f) => document.fonts.add(f)).catch((e) => console.warn('[overlay] font ' + fam + ': ' + (e && e.message))));
  }
  const font = (fam, w, px) => `${w} ${px}px "${fam}", ${fam === F.cinzel || fam === F.min ? 'serif' : 'sans-serif'}`;

  // ---------------------------------------------------------------- timeline (from score.js)
  const win = (key) => { const w = S.overlayWindows.find((o) => o.what.includes(key)); return [bt(w.fromBeat), bt(w.toBeat)]; };
  const [N0, N1] = win('NIGREDO');
  const [A0, A1] = win('ALBEDO');
  const [P0, P1] = win('rap');
  const [C0, C1] = win('CITRINITAS');
  const [R0, R1] = win('RUBEDO');
  const [H0, H1] = win('hook');
  const [L0, L1] = win('logo');
  const SEC = Object.fromEntries(S.sections.map((x, i) => [x.id, { ...x, i, t0: x.bars[0] * BAR, t1: x.bars[1] * BAR }]));
  const KANJI = { nigredo: '黒化', albedo: '白化', citrinitas: '黄化', rubedo: '赤化', coda: '終' };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  const STYLE = {
    nigredo:    { ink: '#ece5da', acc: '#b48ae0', plate: 'rgba(6,3,12,' },
    albedo:     { ink: '#f4f9ff', acc: '#9fdcff', plate: 'rgba(4,8,30,' },
    citrinitas: { ink: '#fff6dc', acc: '#ffc53d', plate: 'rgba(30,14,0,' },
    rubedo:     { ink: '#fff4ee', acc: '#ff5a3c', plate: 'rgba(28,2,6,' },
  };
  // corner marker windows: each section's tag shows when its full-screen title has gone
  const MARKS = [
    { id: 'nigredo', a: N1, b: SEC.nigredo.t1 },
    { id: 'albedo', a: A1, b: SEC.albedo.t1 },
    { id: 'citrinitas', a: C1, b: R0 - 0.095, out: 0.15 },   // clear before the gap, with the gauge
    { id: 'rubedo', a: R1, b: SEC.rubedo.t1 },
  ];

  // ---------------------------------------------------------------- frame state + caches
  let s = 1, VW = 1920, curH = 0;
  const cache = new Map();
  const cached = (key, make) => { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; };
  const mcan = document.createElement('canvas'); mcan.width = mcan.height = 8;
  const mctx = mcan.getContext('2d');
  const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  // text with letter spacing; returns the visual width (without the trailing space)
  const HAS_LS = 'letterSpacing' in CanvasRenderingContext2D.prototype;   // older Safari lacks it
  function spaced(ctx, str, x, y, sp = 0, align = 'left', mode = 'fill') {
    if (!HAS_LS) sp = 0;
    ctx.letterSpacing = sp + 'px';
    ctx.textAlign = 'left';
    const w = ctx.measureText(str).width - (str.length ? sp : 0);
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    if (mode !== 'fill') ctx.strokeText(str, x0, y);
    if (mode !== 'stroke') ctx.fillText(str, x0, y);
    ctx.letterSpacing = '0px';
    return w;
  }
  function measure(ctx, str, sp = 0) { if (!HAS_LS) sp = 0; ctx.letterSpacing = sp + 'px'; const w = ctx.measureText(str).width - (str.length ? sp : 0); ctx.letterSpacing = '0px'; return w; }
  // vertical (tategaki) text: glyphs stacked from `top`, centred on cx
  function vtext(ctx, str, cx, top, px, lead = 1.0, mode = 'fill') {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [...str].forEach((ch, i) => {
      const y = top + (i + 0.5) * px * lead;
      if (mode !== 'fill') ctx.strokeText(ch, cx, y);
      if (mode !== 'stroke') ctx.fillText(ch, cx, y);
    });
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  }
  function rule(ctx, x0, y, x1, lw) { ctx.fillRect(Math.min(x0, x1), y - lw / 2, Math.abs(x1 - x0), lw); }
  // a four-point star glint: soft core + rays that fade towards their tips (optical, not clip-art)
  const rayGrad = new Map();
  function star(ctx, x, y, r, a, rotA = 0, color = '255,255,255') {
    if (a <= 0.01 || r <= 0.5) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotA); ctx.globalAlpha *= clamp(a);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
    g.addColorStop(0, `rgba(${color},0.95)`); g.addColorStop(0.12, `rgba(${color},0.55)`); g.addColorStop(0.4, `rgba(${color},0.14)`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.fill();
    // rays in a unit space (length 1), scaled per ray; the gradient is shared
    let rg = rayGrad.get(color);
    if (!rg) {
      rg = ctx.createLinearGradient(0, 0, 0, -1);
      rg.addColorStop(0, `rgba(${color},1)`); rg.addColorStop(0.25, `rgba(${color},0.75)`); rg.addColorStop(1, `rgba(${color},0)`);
      rayGrad.set(color, rg);
    }
    ctx.fillStyle = rg;
    const ray = (ang, len, wid) => {
      ctx.save(); ctx.rotate(ang); ctx.scale(len, len);
      const w = wid / len;
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(0, -1); ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    const w = Math.max(0.8, r * 0.045);
    for (let i = 0; i < 4; i++) ray(i * Math.PI / 2, r, w);
    for (let i = 0; i < 4; i++) ray(Math.PI / 4 + i * Math.PI / 2, r * 0.38, w * 0.6);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, Math.max(0.8, r * 0.035), 0, TAU); ctx.fill();
    ctx.restore();
  }
  // a feathered dark plate behind HUD text: dense on the anchored side ('l' or 'r'), fading to
  // nothing on the other side and softly at top and bottom. Cached as a small bitmap per colour.
  function plate(ctx, x, y, w, h, rgbaPrefix, side, alpha) {
    if (w <= 1) return;
    const img = cached(`plate|${rgbaPrefix}|${side}`, () => {
      const c = newCanvas(128, 64), g = c.getContext('2d');
      const hg = g.createLinearGradient(side === 'l' ? 0 : 128, 0, side === 'l' ? 128 : 0, 0);
      hg.addColorStop(0, rgbaPrefix + '1)'); hg.addColorStop(0.5, rgbaPrefix + '0.7)'); hg.addColorStop(1, rgbaPrefix + '0)');
      g.fillStyle = hg; g.fillRect(0, 0, 128, 64);
      g.globalCompositeOperation = 'destination-in';
      const vg = g.createLinearGradient(0, 0, 0, 64);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.25, 'rgba(0,0,0,1)'); vg.addColorStop(0.75, 'rgba(0,0,0,1)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = vg; g.fillRect(0, 0, 128, 64);
      return c;
    });
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * alpha;
    ctx.drawImage(img, x, y, w, h);
    ctx.globalAlpha = ga;
  }
  // the stage's alchemical sign, drawn as strokes (fonts lack these code points)
  function sign(ctx, id, cx, cy, r, lw) {
    ctx.save(); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (id === 'nigredo') {            // Saturn / lead: a cross with a hooked tail
      ctx.moveTo(cx - r * 0.25, cy - r); ctx.lineTo(cx - r * 0.25, cy + r * 0.25);
      ctx.moveTo(cx - r * 0.65, cy - r * 0.62); ctx.lineTo(cx + r * 0.15, cy - r * 0.62);
      ctx.moveTo(cx - r * 0.25, cy - r * 0.05);
      ctx.bezierCurveTo(cx + r * 0.35, cy - r * 0.55, cx + r * 0.85, cy - r * 0.1, cx + r * 0.35, cy + r * 0.45);
      ctx.quadraticCurveTo(cx + r * 0.05, cy + r * 0.8, cx + r * 0.45, cy + r * 1.0);
    } else if (id === 'albedo') {      // Luna / silver: a crescent
      ctx.arc(cx, cy, r, Math.PI * 0.32, Math.PI * 1.68, false);
      ctx.arc(cx + r * 0.62, cy, r * 0.82, Math.PI * 1.17, Math.PI * 0.83, true);
      ctx.closePath();
    } else if (id === 'citrinitas') {  // Sol / gold: circumpunct
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.moveTo(cx + r * 0.2, cy); ctx.arc(cx, cy, r * 0.2, 0, TAU);
    } else {                           // the stone: circle, square, triangle, circle
      ctx.arc(cx, cy, r, 0, TAU);
      const q = r * 0.98 / Math.SQRT2 * 1.0;
      ctx.rect(cx - q, cy - q, 2 * q, 2 * q);
      ctx.moveTo(cx, cy - q); ctx.lineTo(cx + q, cy + q); ctx.lineTo(cx - q, cy + q); ctx.closePath();
      const ri = q * 0.5;
      ctx.moveTo(cx + ri, cy + q * 0.33); ctx.arc(cx, cy + q * 0.33, ri, 0, TAU);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- chrome lettering (cached bitmaps)
  // kind 'hook': 90s eurodance chrome in Exo 2 Black Italic; kind 'logo': chrome-gold Cinzel.
  function chromeWord(str, pxU, kind) {
    return cached(`cw|${kind}|${pxU.toFixed(2)}|${str}`, () => {
      const px = pxU * s;
      const logo = kind === 'logo';
      const fam = logo ? F.cinzel : F.chrome;
      const sp = logo ? px * 0.07 : px * 0.012;
      mctx.font = font(fam, 900, px);
      const tw = measure(mctx, str, sp);
      const capH = mctx.measureText('H').actualBoundingBoxAscent || px * 0.7;
      const depth = Math.max(2, Math.round(px * (logo ? 0.05 : 0.075)));
      const black = px * (logo ? 0.085 : 0.12);
      const rim = px * (logo ? 0.035 : 0.05);
      const pad = Math.ceil(black + rim + depth + px * 0.2);
      const c = newCanvas(tw + pad * 2, capH + px * 0.35 + pad * 2);
      const g = c.getContext('2d');
      const ox = pad, oy = pad + capH;
      g.font = mctx.font; g.letterSpacing = sp + 'px'; g.lineJoin = 'round'; g.textBaseline = 'alphabetic';
      const dx = depth * 0.45, dy = depth;
      const layers = Math.max(2, Math.round(depth / Math.max(1, s * 1.8)));
      // 1. outer rim (rainbow for the hook, pale gold for the logo)
      const rg = g.createLinearGradient(ox, 0, ox + tw, 0);
      if (logo) { rg.addColorStop(0, '#7a4a12'); rg.addColorStop(0.5, '#ffe9a8'); rg.addColorStop(1, '#7a4a12'); }
      else ['#ff2a6d', '#ff9f1c', '#ffe94a', '#3bff8a', '#2ad8ff', '#7b5cff', '#ff4fd8'].forEach((col, i, a) => rg.addColorStop(i / (a.length - 1), col));
      g.strokeStyle = rg; g.lineWidth = (black + rim * 2);
      g.strokeText(str, ox + dx, oy + dy); g.strokeText(str, ox, oy);
      // 2. heavy black outline around the face and the whole extrusion
      g.strokeStyle = '#050208'; g.lineWidth = black;
      for (let i = layers; i >= 0; i--) g.strokeText(str, ox + dx * i / layers, oy + dy * i / layers);
      // 3. extrusion body
      const eg = g.createLinearGradient(0, oy - capH, 0, oy + dy);
      if (logo) { eg.addColorStop(0, '#5a2a06'); eg.addColorStop(1, '#1a0a02'); }
      else { eg.addColorStop(0, '#24345e'); eg.addColorStop(0.5, '#120f22'); eg.addColorStop(1, '#3a1a08'); }
      g.fillStyle = eg;
      for (let i = layers; i >= 1; i--) g.fillText(str, ox + dx * i / layers, oy + dy * i / layers);
      // 4. the chrome face on its own canvas, so reflections can be clipped to it
      const f = newCanvas(c.width, c.height), h = f.getContext('2d');
      h.font = g.font; h.letterSpacing = g.letterSpacing; h.textBaseline = 'alphabetic';
      const top = oy - capH;
      const cg = h.createLinearGradient(0, top - capH * 0.08, 0, oy + px * 0.04);
      if (logo) {
        [[0, '#fff2bf'], [0.28, '#f2b02a'], [0.47, '#fff5d2'], [0.5, '#ffffff'], [0.5, '#4a1c00'], [0.6, '#9a520a'],
          [0.78, '#f7b52c'], [0.9, '#ffd970'], [1, '#fff4c6']].forEach(([o, col]) => cg.addColorStop(o, col));
      } else {
        [[0, '#1e4fa8'], [0.2, '#5fb0ff'], [0.4, '#d8f1ff'], [0.5, '#ffffff'], [0.5, '#2c1606'], [0.57, '#5a2f0c'],
          [0.72, '#c0701c'], [0.88, '#ffc35a'], [1, '#fff1c0']].forEach(([o, col]) => cg.addColorStop(o, col));
      }
      h.fillStyle = cg; h.fillText(str, ox, oy);
      // reflections: thin diagonal streaks, clipped to the face
      h.globalCompositeOperation = 'source-atop';
      h.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 6; i++) {
        const x = ox + (hash(i * 7.3 + str.length) * 1.1 - 0.05) * tw, w = px * (0.02 + 0.05 * hash(i * 3.1));
        h.beginPath(); h.moveTo(x, top - px * 0.1); h.lineTo(x + w, top - px * 0.1); h.lineTo(x + w - capH * 0.55, oy + px * 0.1); h.lineTo(x - capH * 0.55, oy + px * 0.1); h.closePath(); h.fill();
      }
      // hot horizon glow line
      const hy = top + capH * 0.5;
      const hg = h.createLinearGradient(0, hy - px * 0.05, 0, hy + px * 0.05);
      hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, logo ? 'rgba(255,240,200,0.55)' : 'rgba(255,220,170,0.35)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      h.fillStyle = hg; h.fillRect(0, hy - px * 0.05, c.width, px * 0.1);
      h.globalCompositeOperation = 'source-over';
      // crisp light edge, hugging the face from outside: stroke at double width, then cut the
      // glyph interior away, so the font's overlapping contours (the A's bar, the P's bowl, the
      // G's spur) leave no lines inside the letters
      const e = newCanvas(c.width, c.height), ec = e.getContext('2d');
      ec.font = g.font; ec.letterSpacing = g.letterSpacing; ec.textBaseline = 'alphabetic'; ec.lineJoin = 'round';
      ec.strokeStyle = logo ? 'rgba(255,248,220,0.7)' : 'rgba(255,255,255,0.55)'; ec.lineWidth = 2 * Math.max(1, px * 0.012);
      ec.strokeText(str, ox, oy);
      ec.globalCompositeOperation = 'destination-out'; ec.fillText(str, ox, oy);
      h.drawImage(e, 0, 0);
      g.drawImage(f, 0, 0);
      // a flat white silhouette of the face (for flare sheens / flashes)
      const wsil = newCanvas(c.width, c.height), wg = wsil.getContext('2d');
      wg.font = g.font; wg.letterSpacing = g.letterSpacing; wg.fillStyle = '#fff'; wg.fillText(str, ox, oy);
      return { c, white: wsil, ox: ox / s, oy: oy / s, w: tw / s, capH: capH / s, cw: c.width / s, ch: c.height / s };
    });
  }

  // ================================================================ 0. bar 0: a tiny motto
  function drawCredit(ctx, t) {
    const a = remap(t, 0.45, 0.9) * (1 - remap(t, 1.35, 1.7));
    if (a <= 0) return false;
    ctx.globalAlpha = a * 0.72;
    ctx.fillStyle = '#e9e1d3';
    ctx.font = font(F.cinzel, 600, 20);
    const w = spaced(ctx, 'SOLVE  ET  COAGULA', 960, 1032, 10, 'center');
    rule(ctx, 960 - w / 2 - 74, 1025, 960 - w / 2 - 26, 1.2);
    rule(ctx, 960 + w / 2 + 26, 1025, 960 + w / 2 + 74, 1.2);
    ctx.globalAlpha = 1;
    return true;
  }

  // ================================================================ 1. NIGREDO insert (black)
  function drawNigredo(ctx, t) {
    // exit: on the beat-6 kick the card flickers to a negative for one frame (1/30 s, so two
    // frames live at 60 fps) on a mid-tone paper, a flicker rather than a white-out, then the
    // scene. Reduced mode cuts straight to the scene.
    const invert = !MO.reduced && t >= N1 && t < N1 + FRAME;
    if (t < N0 || (t >= N1 && !invert)) return false;
    const u = clamp((t - N0) / (N1 - N0));
    const bg = invert ? '#8d877c' : '#000', fg = invert ? '#0d0a08' : '#f3eee5';
    const ember = invert ? '#5a140b' : '#c4452c';
    ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, 1080);
    if (t >= N0 + BEAT) return nigredoB(ctx, t, fg, ember), true;   // cut on the next kick
    const z = 1 + 0.03 * easeOut(u) + (MO.reduced ? 0 : 0.008 * MO.env('kick', t, 0.07));
    ctx.translate(960, 540); ctx.scale(z, z); ctx.translate(-960, -540);
    const draw = easeOut(remap(t, N0, N0 + 0.32));
    const typed = (str, t0, dur) => str.slice(0, Math.ceil(str.length * remap(t, t0, t0 + dur)));
    ctx.fillStyle = fg; ctx.strokeStyle = fg;

    // giant condensed katakana, upper left
    ctx.save();
    ctx.translate(150, 540); ctx.scale(0.8, 1);
    ctx.font = font(F.min, 800, 330);
    ctx.lineWidth = 7; ctx.lineJoin = 'round';
    spaced(ctx, 'ニグレド', 0, 0, -6, 'left', 'both');
    ctx.restore();

    // XIII in outline, ember
    ctx.save();
    ctx.font = font(F.cinzel, 400, 190);
    ctx.strokeStyle = ember; ctx.lineWidth = 2.5;
    spaced(ctx, 'XIII', 1772, 520, 6, 'right', 'stroke');
    ctx.restore();

    // NIGREDO, lower right
    ctx.font = font(F.cinzel, 900, 164);
    spaced(ctx, 'NIGREDO', 1772, 790, 30, 'right');

    // rules
    rule(ctx, 150, 846, mix(150, 1772, draw), 2);
    ctx.fillStyle = ember; rule(ctx, 150, 846, mix(150, 330, draw), 10); ctx.fillStyle = fg;
    rule(ctx, 112, 150, 112 + 1.6, 1); ctx.fillRect(111, 150, 2, 780 * draw);
    rule(ctx, 150, 205, mix(150, 830, draw), 1.2);

    // small lines
    ctx.font = font(F.cinzel, 700, 30);
    const deathW = measure(ctx, 'XIII · DEATH ·', 12);
    ctx.font = font(F.min, 800, 32);
    const kW = measure(ctx, '死神', 4);
    const x0 = 1772 - kW - 30 - deathW;
    ctx.font = font(F.cinzel, 700, 30);
    spaced(ctx, typed('XIII · DEATH ·', N0 + 0.1, 0.25), x0, 905, 12);
    ctx.font = font(F.min, 800, 32);
    if (t > N0 + 0.33) spaced(ctx, '死神', 1772, 906, 4, 'right');
    ctx.font = font(F.cinzel, 600, 22);
    spaced(ctx, typed('OPERATIO PRIMA', N0 + 0.05, 0.25), 150, 186, 12);
    spaced(ctx, typed('THE BLACKENING', N0 + 0.15, 0.25), 150, 903, 10);
    ctx.font = font(F.min, 800, 30);
    if (t > N0 + 0.2) spaced(ctx, '第一章　' + KANJI.nigredo, 830, 188, 6, 'right');
    return true;
  }

  // second card, cut in on the beat-5 kick: the mirror image (vertical katakana right, Latin left)
  function nigredoB(ctx, t, fg, ember) {
    const t5 = N0 + BEAT, ub = (t - t5) / BEAT;
    const z = 1.0 + 0.04 * easeOut(ub) + (MO.reduced ? 0 : 0.008 * MO.env('kick', t, 0.07));
    ctx.translate(960, 540); ctx.scale(z, z); ctx.translate(-960, -540);
    const draw = easeOut(remap(t, t5, t5 + 0.28));
    ctx.fillStyle = fg; ctx.strokeStyle = fg; ctx.lineJoin = 'round';
    // enormous vertical ニグレド, right third
    ctx.save();
    ctx.translate(1600, 0); ctx.scale(1.0, 0.94);
    ctx.font = font(F.min, 800, 240); ctx.lineWidth = 6;
    vtext(ctx, 'ニグレド', 0, 70, 240, 0.98, 'both');
    ctx.restore();
    ctx.fillRect(1408, 92, 2, 896 * draw);
    // huge outlined XIII, upper left
    ctx.save();
    ctx.strokeStyle = ember; ctx.lineWidth = 3; ctx.font = font(F.cinzel, 400, 300);
    spaced(ctx, 'XIII', 140, 430, 14, 'left', 'stroke');
    ctx.restore();
    // NIGREDO + rules + small lines
    ctx.font = font(F.cinzel, 900, 132);
    spaced(ctx, 'NIGREDO', 146, 690, 24);
    rule(ctx, 150, 750, mix(150, 1330, draw), 2);
    ctx.fillStyle = ember; rule(ctx, 150, 750, mix(150, 330, draw), 10); ctx.fillStyle = fg;
    ctx.font = font(F.cinzel, 700, 30);
    const dw = spaced(ctx, 'XIII · DEATH ·', 150, 814, 12);
    ctx.font = font(F.min, 800, 32);
    spaced(ctx, '死神', 150 + dw + 30, 815, 4);
    ctx.font = font(F.cinzel, 600, 22);
    spaced(ctx, 'THE BLACKENING · OPERATIO PRIMA', 150, 866, 10);
    ctx.font = font(F.min, 800, 30);
    spaced(ctx, '第一章　' + KANJI.nigredo, 1330, 815, 6, 'right');
    // a column of tiny ticks down the rule (a ruler, counting the kicks)
    for (let i = 0; i < 24; i++) rule(ctx, 1396, 110 + i * 37, 1396 + (i % 4 ? 6 : 14), 1.2);
    return true;
  }

  // ================================================================ 2. chapter marker + HUD
  function drawMarker(ctx, t) {
    const m = MARKS.find((k) => t >= k.a && t < k.b);
    if (!m) return false;
    const st = STYLE[m.id], sec = SEC[m.id];
    const kIn = easeOut(remap(t, m.a, m.a + 0.4)), kOut = MO.smooth(remap(t, m.b - (m.out || 0.1), m.b));
    const a = kIn * (1 - kOut);
    if (a <= 0) return false;
    ctx.save();
    ctx.globalAlpha = a;
    // ---- left: cartouche with the trump's numeral, stage name, katakana + kanji
    const x = 58, y = 48;
    plate(ctx, x - 40, y - 26, 600 * kIn, 124, st.plate, 'l', 0.7);
    const numW = 92;
    ctx.strokeStyle = st.ink; ctx.lineWidth = 2; ctx.strokeRect(x, y, numW, 50);
    ctx.lineWidth = 1; ctx.strokeRect(x + 5, y + 5, numW - 10, 40);
    ctx.fillStyle = st.ink; ctx.font = font(F.cinzel, 700, 25);
    spaced(ctx, sec.arcana, x + numW / 2, y + 34, 2, 'center');
    const tx = x + numW + 18;
    ctx.save();
    ctx.beginPath(); ctx.rect(tx - 4, y - 12, 420 * kIn, 100); ctx.clip();
    ctx.font = font(F.cinzel, 700, 27);
    const nw = spaced(ctx, sec.stage.toUpperCase(), tx, y + 24, 9);
    ctx.fillStyle = st.acc; ctx.font = font(F.min, 800, 19);
    spaced(ctx, sec.jp + '・' + KANJI[m.id], tx + 1, y + 52, 5);
    ctx.fillStyle = st.ink; ctx.font = font(F.cinzel, 600, 13);
    spaced(ctx, sec.card.toUpperCase() + ' · OPERATIO ' + ROMAN[sec.i], tx + 1, y + 76, 5);
    ctx.fillStyle = st.acc; rule(ctx, tx + nw + 16, y + 15, tx + nw + 16 + 110 * kIn, 1.2);
    ctx.restore();

    // ---- right: alchemical sign, bar counter, 16-step sequencer, timecode
    const rx = 1862, ry = 50;
    plate(ctx, rx + 50 - 470 * kIn, y - 26, 470 * kIn, 124, st.plate, 'r', 0.7);
    const bar = Math.floor(t / BAR + 1e-6), step = Math.floor((t - bar * BAR) / MO.STEP + 1e-6);
    ctx.fillStyle = st.ink; ctx.font = font(F.hud, 400, 21);
    const bstr = String(bar + 1).padStart(2, '0');
    ctx.globalAlpha = a * 0.92;
    spaced(ctx, bstr, rx - 64, ry + 22, 2, 'right');
    ctx.font = font(F.hud, 400, 12); ctx.globalAlpha = a * 0.6;
    spaced(ctx, '/' + S.bars, rx, ry + 21, 2, 'right');
    spaced(ctx, 'BAR', rx - 64 - 52, ry + 21, 3, 'right');
    // steps
    const kick = S.drums.kick[Math.min(bar, S.drums.kick.length - 1)] || '';
    const sx = rx - 16 * 13 + 4, sy = ry + 34;
    for (let i = 0; i < 16; i++) {
      const on = i === step, past = i < step, k = kick[i] === 'x' || kick[i] === 'X';
      ctx.globalAlpha = a * (on ? 1 : past ? 0.55 : 0.22);
      ctx.fillStyle = on ? st.acc : st.ink;
      const hh = k ? 10 : 5;
      ctx.fillRect(sx + i * 13, sy + (10 - hh), 9, hh);
    }
    // timecode (seconds:frames)
    ctx.globalAlpha = a * 0.6; ctx.fillStyle = st.ink; ctx.font = font(F.hud, 400, 11);
    const sec2 = Math.floor(t), fr = Math.floor((t - sec2) * 30 + 1e-6);
    spaced(ctx, `TC 00:00:${String(sec2).padStart(2, '0')}:${String(fr).padStart(2, '0')}`, rx, sy + 30, 2, 'right');
    // sign, pulsing with the kick
    ctx.globalAlpha = a;
    ctx.strokeStyle = st.acc;
    const kp = MO.env('kick', t, 0.1);
    sign(ctx, m.id, sx - 40, ry + 26, 17 * (1 + 0.12 * kp), 2.2);
    ctx.restore();
    return true;
  }

  // ================================================================ 3. ALBEDO: XVIII The Moon card
  function moonCard(ctx, cw, ch, t) {
    // drawn centred on (0, 0); linework in moonlight, translucent so the body shows through
    const x0 = -cw / 2, y0 = -ch / 2;
    const line = '#eaf6ff', glow = 'rgba(150,215,255,0.9)';
    ctx.fillStyle = 'rgba(190,225,255,0.07)'; ctx.fillRect(x0, y0, cw, ch);
    ctx.strokeStyle = line;
    ctx.shadowColor = glow; ctx.shadowBlur = 14 * s;
    ctx.lineWidth = 4; ctx.strokeRect(x0, y0, cw, ch);
    ctx.shadowBlur = 0;
    const i1 = 14;
    ctx.lineWidth = 1.4; ctx.strokeRect(x0 + i1, y0 + i1, cw - 2 * i1, ch - 2 * i1);
    // corner studs
    ctx.fillStyle = line;
    for (const [cx, cy] of [[x0, y0], [-x0, y0], [x0, -y0], [-x0, -y0]]) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12); ctx.restore();
    }
    // top cartouche: XVIII
    const ch1 = 78, xi = x0 + i1, wi = cw - 2 * i1;
    ctx.fillStyle = 'rgba(8,16,48,0.5)'; ctx.fillRect(xi, y0 + i1, wi, ch1);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(xi, y0 + i1, wi, ch1);
    ctx.strokeRect(xi + 6, y0 + i1 + 6, wi - 12, ch1 - 12);
    ctx.fillStyle = line; ctx.font = font(F.cinzel, 700, 46);
    spaced(ctx, 'XVIII', 0, y0 + i1 + ch1 / 2 + 17, 8, 'center');
    // bottom cartouche: LA LUNE · THE MOON
    const yb = -y0 - i1 - ch1;
    ctx.fillStyle = 'rgba(8,16,48,0.5)'; ctx.fillRect(xi, yb, wi, ch1);
    ctx.strokeRect(xi, yb, wi, ch1); ctx.strokeRect(xi + 6, yb + 6, wi - 12, ch1 - 12);
    ctx.fillStyle = line; ctx.font = font(F.cinzel, 700, 25);
    spaced(ctx, 'LA LUNE · THE MOON', 0, yb + ch1 / 2 + 9, 7, 'center');
    // the moon: disc with 月, alternating straight and wavy rays, falling yods
    const my = y0 + i1 + ch1 + 96, mr = 58;
    ctx.save();
    ctx.lineWidth = 1.3;
    const rot = t * 0.25;
    for (let i = 0; i < 24; i++) {
      const an = rot + i / 24 * TAU, ca = Math.cos(an), sa = Math.sin(an);
      const r0 = mr + 10, r1 = mr + (i % 2 ? 46 : 64);
      ctx.beginPath();
      if (i % 2) { ctx.moveTo(ca * r0, my + sa * r0); ctx.lineTo(ca * r1, my + sa * r1); }
      else {
        for (let k = 0; k <= 12; k++) {
          const rr = mix(r0, r1, k / 12), off = Math.sin(k / 12 * TAU * 1.5) * 4;
          const px = ca * rr - sa * off, py = my + sa * rr + ca * off;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(10,20,60,0.3)'; ctx.beginPath(); ctx.arc(0, my, mr, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.2; ctx.shadowColor = glow; ctx.shadowBlur = 10 * s;
    ctx.beginPath(); ctx.arc(0, my, mr, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, my, mr - 7, 0, TAU); ctx.stroke();
    ctx.fillStyle = line; ctx.font = font(F.min, 800, 66);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('月', 0, my + 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // yods (drops) drawn upward to the moon, as on the Marseille card
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1, j = i >> 1;
      const dx = side * (mr + 18 + j * 18), dy = my + mr + 38 + j * 34 + Math.sin(t * 3 + i) * 3;
      const r = 6 - j * 0.5;
      ctx.beginPath(); ctx.moveTo(dx, dy - r * 2.6);
      ctx.quadraticCurveTo(dx + r * 1.2, dy - r * 0.2, dx, dy + r); ctx.quadraticCurveTo(dx - r * 1.2, dy - r * 0.2, dx, dy - r * 2.6);
      ctx.fill();
    }
    // two towers' outlines low in the card (the Moon's gate), as pure linework
    ctx.lineWidth = 1.3;
    for (const sd of [-1, 1]) {
      const tx = sd * (cw / 2 - 64), tb = yb - 26, tw = 52, th = 150;
      ctx.beginPath();
      ctx.moveTo(tx - tw / 2, tb); ctx.lineTo(tx - tw / 2, tb - th); ctx.lineTo(tx + tw / 2, tb - th); ctx.lineTo(tx + tw / 2, tb);
      for (let k = 0; k < 4; k++) { const bx = tx - tw / 2 + k * tw / 3.5; ctx.moveTo(bx, tb - th); ctx.lineTo(bx, tb - th - 12); ctx.lineTo(bx + tw / 7, tb - th - 12); ctx.lineTo(bx + tw / 7, tb - th); }
      ctx.moveTo(tx - 7, tb); ctx.lineTo(tx - 7, tb - 30); ctx.arc(tx, tb - 30, 7, Math.PI, 0); ctx.lineTo(tx + 7, tb);
      ctx.stroke();
    }
  }

  function drawAlbedo(ctx, t) {
    if (t < A0 || t >= A1) return false;
    const ub = (t - A0) / BEAT;                              // 0..2 beats
    let sc;
    if (ub < 1) sc = mix(0.4, 1, easeOut(ub));
    else if (ub < 1.55) sc = 1 + 0.035 * (ub - 1) / 0.55;
    else sc = (1 + 0.035) * Math.pow(7, easeIn((ub - 1.55) / 0.45));
    const a = remap(ub, 0, 0.12) * (1 - remap(ub, 1.78, 2));
    const cw = 460, ch = 800, cy = 455;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(960, cy); ctx.scale(sc, sc);
    ctx.rotate((1 - easeOut(ub)) * 0.06);
    moonCard(ctx, cw, ch, t);
    ctx.restore();
    // flanking titles: ALBEDO to the left (Latin), アルベド to the right (vertical)
    const kIn = easeOutBack(remap(ub, 0.3, 0.62), 1.2), kOut = easeIn(remap(ub, 1.5, 1.85));
    if (kIn > 0 && kOut < 1) {
      const off = (1 - kIn) * 260 + kOut * 520;
      ctx.save();
      ctx.globalAlpha = clamp(kIn * 1.5) * (1 - kOut);
      ctx.shadowColor = 'rgba(120,200,255,0.85)'; ctx.shadowBlur = 22 * s;
      ctx.fillStyle = '#f6fbff'; ctx.font = font(F.cinzel, 900, 104);
      const lx = 960 - cw / 2 - 52 - off;
      spaced(ctx, 'ALBEDO', lx, 500, 12, 'right');
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#bfe6ff'; ctx.font = font(F.cinzel, 600, 21);
      spaced(ctx, 'OPERATIO SECUNDA', lx, 548, 9, 'right');
      ctx.font = font(F.min, 800, 24);
      spaced(ctx, '月・' + KANJI.albedo, lx, 588, 6, 'right');
      ctx.fillStyle = '#f6fbff'; rule(ctx, lx - 380, 418, lx, 1.4);
      const rx = 960 + cw / 2 + 110 + off;
      ctx.shadowColor = 'rgba(120,200,255,0.85)'; ctx.shadowBlur = 22 * s;
      ctx.font = font(F.min, 800, 110);
      vtext(ctx, 'アルベド', rx, 186, 110, 1.0);
      ctx.shadowBlur = 0;
      rule(ctx, rx + 74, 196, rx + 74 + 1.4, 1); ctx.fillRect(rx + 73, 196, 1.4, 420);
      ctx.restore();
    }
    return true;
  }

  // ================================================================ 4. rap subtitles (fansub)
  // A subtitle must never arrive after its word is heard. Every word leads its score step by
  // two frames, and words that open on a long consonant lead by that consonant's length plus
  // one frame, so even the first frame drawn at or after the lead time lands before the sound.
  // PRE_ROLL: seconds of audible consonant before the step, measured on the rap stem by the
  // audio build (rap_timing pre_roll_ms); words not listed start on their step.
  const PRE_ROLL = { Shadow: 0.059, Holy: 0.059, to: 0.045, Self: 0.087, left: 0.030, light: 0.024 };
  const lead = (word) => Math.max(2 * FRAME, (PRE_ROLL[word] || 0) + FRAME);
  const RAP = S.vocals.rap.map((line, li) => {
    const toks = line.text.split(' ').map((w, i) => ({ text: w, t: MO.barTime(line.bar, 0, line.words[i][1]) - lead(line.words[i][0]) }));
    return { li, jp: line.jp, toks, t0: Math.min(...toks.map((w) => w.t)) };
  });
  RAP.forEach((l, i) => { l.t1 = i + 1 < RAP.length ? RAP[i + 1].t0 : P1; });
  function drawRap(ctx, t) {
    if (t < RAP[0].t0 || t >= P1) return false;
    const line = RAP.find((l) => t >= l.t0 && t < l.t1);
    if (!line) return false;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    // Japanese line above, whole line at once, together with the first word (no fade: a fade
    // would make the first frame faint)
    ctx.globalAlpha = 1;
    ctx.font = font(F.round, 800, 38);
    ctx.strokeStyle = 'rgba(4,6,20,0.92)'; ctx.lineWidth = 7; ctx.fillStyle = '#d9ecff';
    spaced(ctx, line.jp, 960, 928, 4, 'center', 'both');
    // English line: every word pops in on its step
    ctx.font = font(F.round, 800, 64);
    const space = measure(ctx, ' ', 0);
    const widths = line.toks.map((w) => measure(ctx, w.text, 0));
    const total = widths.reduce((p, q) => p + q, 0) + space * (widths.length - 1);
    let x = 960 - total / 2;
    const y = 1004;
    line.toks.forEach((w, i) => {
      const age = t - w.t;
      if (age >= 0) {
        // entrance = scale pop only; the word is fully opaque on its first frame
        const k = easeOut(age / 0.1), sc = mix(1.32, 1, k);
        const cx = x + widths[i] / 2;
        ctx.save();
        ctx.translate(cx, y - 22); ctx.scale(sc, sc); ctx.translate(-cx, -(y - 22));
        // soft drop shadow + thick black outline + fill
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 12;
        ctx.strokeText(w.text, x + 3, y + 4);
        ctx.strokeStyle = '#05040c'; ctx.lineWidth = 10;
        ctx.strokeText(w.text, x, y);
        const hl = Math.exp(-age / 0.22);
        ctx.fillStyle = hl > 0.02 ? `rgb(${Math.round(mix(255, 150, hl))},${Math.round(mix(255, 228, hl))},255)` : '#fff';
        ctx.fillText(w.text, x, y);
        ctx.restore();
      }
      x += widths[i] + space;
    });
    ctx.restore();
    return true;
  }

  // ================================================================ 5. CITRINITAS diagonal band
  function goldStripe(ctx, y0, h) {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    [[0, '#8a4a00'], [0.25, '#ffcf3a'], [0.5, '#fff3a8'], [0.75, '#ffc21c'], [1, '#7a3c00']].forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fillRect(-1600, y0, 3200, h);
    ctx.fillStyle = '#0b0602'; rule(ctx, -1600, y0, 1600, 3); rule(ctx, -1600, y0 + h, 1600, 3);
  }
  // the band's exit; the chakra gauge fades in as it leaves
  const CIT_OUT = [C0 + 1.5 * BEAT, C0 + 1.8 * BEAT];
  function drawCitrinitas(ctx, t) {
    if (t < C0 || t >= CIT_OUT[1]) return false;
    const ub = (t - C0) / BEAT;                              // 0..1.8
    const inB = easeOutBack(remap(ub, 0, 0.3), 1.3), inG = easeOutBack(remap(ub, 0.05, 0.36), 1.3), inT = easeOut(remap(ub, 0.08, 0.6));
    const out = easeIn(remap(t, CIT_OUT[0], CIT_OUT[1]));
    const L = 3000;
    const bx = (1 - inB) * L - out * L, gx = -(1 - inG) * L + out * L;
    const drift = -36 * ub;
    ctx.save();
    // lower third, across the bottom terraces under the figure's feet: the summit, the sun and
    // the body (where the root chakra ignites on this beat) stay clear for the section's first look
    ctx.translate(960, 944); ctx.rotate(-0.08); ctx.scale(0.8, 0.8);
    // gold stripes (counter-motion, from the left). The lower stripe's left half is below the
    // frame edge, so its lettering sits on the right.
    ctx.save(); ctx.translate(gx, 0);
    goldStripe(ctx, -178, 62); goldStripe(ctx, 118, 50);
    ctx.fillStyle = '#140800';
    ctx.font = font(F.min, 800, 46);
    spaced(ctx, 'キトリニタス', 880 + drift * 0.6, -130, 16, 'right');
    ctx.font = font(F.cinzel, 700, 21);
    spaced(ctx, 'OPERATIO TERTIA · 第三章', -880 + drift * 0.6, -139, 8);
    ctx.font = font(F.cinzel, 700, 27);
    const w1 = measure(ctx, 'XIX · THE SUN ·', 12);
    ctx.font = font(F.min, 800, 29);
    const x1 = 880 - drift * 0.6 - w1 - 22 - measure(ctx, '太陽', 4);
    spaced(ctx, '太陽', x1 + w1 + 22, 154, 4);
    ctx.font = font(F.cinzel, 700, 27);
    spaced(ctx, 'XIX · THE SUN ·', x1, 153, 12);
    ctx.font = font(F.cinzel, 700, 21);
    spaced(ctx, 'THE YELLOWING ·', x1 - 120 - 76, 151, 8, 'right');
    ctx.font = font(F.min, 800, 25);
    spaced(ctx, KANJI.citrinitas, x1 - 120, 152, 4, 'right');
    ctx.restore();
    // the black band with gold chrome lettering (from the right)
    ctx.save(); ctx.translate(bx, 0);
    const g = ctx.createLinearGradient(0, -104, 0, 104);
    g.addColorStop(0, '#000'); g.addColorStop(0.5, '#1a0d02'); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(-1600, -104, 3200, 208);
    // sakuga speed streaks racing along the band
    for (let i = 0; i < 40; i++) {
      const y = -98 + hash(i * 1.7) * 196, len = 140 + hash(i * 2.3) * 620;
      const x = ((hash(i * 3.1) * 3400 - t * (1800 + 1600 * hash(i * 5.7))) % 3400 + 3400) % 3400 - 1700;
      ctx.fillStyle = hash(i * 9.1) > 0.35 ? `rgba(255,190,60,${0.25 + 0.35 * hash(i * 6.6)})` : 'rgba(255,245,210,0.5)';
      ctx.fillRect(x, y, len, 1 + 2.2 * hash(i * 4.4));
    }
    const pulse = MO.env('kick', t, 0.09) * 0.25 + MO.env('roll', t, 0.06) * 0.12;
    ctx.fillStyle = '#ffc53d'; rule(ctx, -1600, -92, 1600, 1.5); rule(ctx, -1600, 92, 1600, 1.5);
    // the word
    ctx.translate((1 - inT) * 760 + drift, 0);
    const bm = chromeWord('CITRINITAS', 146, 'logo');
    ctx.drawImage(bm.c, -bm.w / 2 - bm.ox, 46 - bm.oy, bm.cw, bm.ch);
    if (pulse > 0.02) { ctx.globalAlpha = pulse; ctx.drawImage(bm.white, -bm.w / 2 - bm.ox, 46 - bm.oy, bm.cw, bm.ch); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#ffd35c';
    sign(ctx, 'citrinitas', -bm.w / 2 - 82, -2, 30 * (1 + 0.15 * pulse), 5);
    sign(ctx, 'citrinitas', bm.w / 2 + 82, -2, 30 * (1 + 0.15 * pulse), 5);
    star(ctx, -bm.w / 2 + 30, 46 - bm.capH, 70 * (0.7 + 0.5 * MO.env('openHat', t, 0.12)), 0.9);
    ctx.restore();
    ctx.restore();
    return true;
  }

  // ---- the kundalini gauge: seven chakras light up the right edge on their beats (henshin HUD)
  const CHAK = S.chakras.map((c) => ({ ...c, t: bt(c.beat), css: `rgb(${c.color.map((v) => Math.round(clamp(v) * 255)).join(',')})` }));
  // C3a: the manga triptych slams in over beats 40.5-42; its right panel sits under the gauge
  const C3A = [bt(40.5), bt(42)];
  function drawChakraGauge(ctx, t) {
    // in as the CITRINITAS band leaves (full by the sacral ignition on beat 34); out over
    // R0-0.245 .. R0-0.095, so the last frames before the gap are the crown alone and the
    // RUBEDO card arrives on a clean frame
    const a0 = CIT_OUT[0] + 0.03, a1 = R0 - 0.095;
    if (t < a0 || t >= a1) return false;
    // dim to 55% while the C3a panels slam in; back to full for the ajna ignition on beat 42
    const dim = 1 - 0.45 * remap(t, C3A[0], C3A[0] + 0.1) * (1 - remap(t, C3A[1] - 0.12, C3A[1]));
    const a = easeOut(remap(t, a0, a0 + 0.2)) * (1 - MO.smooth(remap(t, a1 - 0.15, a1))) * dim;
    const x = 1836, y0 = 900, dy = 78;
    ctx.save();
    ctx.globalAlpha = a;
    plate(ctx, x - 360, y0 - dy * 6 - 110, 440, dy * 6 + 210, 'rgba(30,12,0,', 'r', 0.62);
    const lit = CHAK.filter((c) => t >= c.t).length;
    // sushumna: the channel up the spine, lit up to the newest chakra
    ctx.fillStyle = 'rgba(255,240,210,0.3)'; ctx.fillRect(x - 1, y0 - dy * 6, 2, dy * 6);
    if (lit > 0) {
      const grow = lit < 7 ? easeOut(remap(t, CHAK[lit - 1].t, CHAK[lit - 1].t + 0.25)) : 1;
      const top = y0 - dy * Math.max(0, lit - 2 + grow);
      const lg = ctx.createLinearGradient(0, y0, 0, y0 - dy * 6);
      CHAK.forEach((c, i) => lg.addColorStop(i / 6, c.css));
      ctx.fillStyle = lg; ctx.fillRect(x - 2.5, top, 5, y0 - top);
    }
    CHAK.forEach((c, i) => {
      const y = y0 - i * dy, on = t >= c.t, age = t - c.t;
      const pop = on ? 1 + 0.6 * Math.exp(-age / 0.09) : 1;
      ctx.save();
      ctx.globalAlpha = a * (on ? 1 : 0.4);
      // lotus: eight petals around the dot
      ctx.translate(x, y);
      ctx.save(); ctx.scale(pop, pop);
      ctx.strokeStyle = on ? c.css : 'rgba(255,240,210,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const an = k / 8 * TAU + (on ? age * 0.8 : 0);
        ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(an - 0.35) * 26, Math.sin(an - 0.35) * 26, Math.cos(an) * 24, Math.sin(an) * 24);
        ctx.quadraticCurveTo(Math.cos(an + 0.35) * 26, Math.sin(an + 0.35) * 26, 0, 0);
      }
      ctx.stroke();
      ctx.fillStyle = on ? c.css : '#1a0d02';
      if (on) { ctx.shadowColor = c.css; ctx.shadowBlur = 16 * s; }
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      if (on) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill(); }
      ctx.restore();
      // ignition ring
      if (on && age < 0.4) {
        ctx.strokeStyle = c.css; ctx.lineWidth = 4 * (1 - age / 0.4);
        ctx.globalAlpha = a * (1 - age / 0.4);
        ctx.beginPath(); ctx.arc(0, 0, 18 + age * 260, 0, TAU); ctx.stroke();
        ctx.globalAlpha = a;
      }
      // label (outlined so it holds on the brightest gold)
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(28,10,0,0.75)'; ctx.lineWidth = 4;
      ctx.fillStyle = on ? '#fff6e0' : 'rgba(255,240,210,0.9)';
      ctx.font = font(F.cinzel, 700, 18);
      spaced(ctx, c.name.toUpperCase(), -42, 2, 4, 'right', 'both');
      ctx.fillStyle = on ? c.css : 'rgba(255,240,210,0.7)'; ctx.font = font(F.hud, 400, 10); ctx.lineWidth = 3;
      spaced(ctx, c.en.toUpperCase(), -42, 20, 3, 'right', 'both');
      ctx.restore();
    });
    // counter
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(28,10,0,0.75)'; ctx.lineWidth = 4;
    ctx.fillStyle = '#fff6e0'; ctx.font = font(F.hud, 400, 12);
    spaced(ctx, 'KUNDALINI', x + 20, y0 + 64, 4, 'right', 'both');
    ctx.font = font(F.hud, 400, 24);
    spaced(ctx, `${lit}/7`, x + 20, y0 - dy * 6 - 42, 2, 'right', 'both');
    ctx.restore();
    return true;
  }

  // ================================================================ 6. RUBEDO insert (white)
  function focusLines(ctx, t, rin, alpha) {
    // the lines 'boil' once per 16th, locked to the grid (frozen in reduced mode)
    const seed = MO.reduced ? 5.0 : Math.floor(t / MO.STEP + 1e-3) * 17.0;
    ctx.fillStyle = `rgba(14,6,6,${alpha})`;
    ctx.beginPath();
    const N = 160;
    for (let i = 0; i < N; i++) {
      const h1 = hash(i * 1.37 + seed), h2 = hash(i * 2.71 + seed * 0.5), h3 = hash(i * 0.91 + seed * 1.3);
      const an = (i + h1 * 0.8) / N * TAU;
      const r0 = rin * (0.82 + 0.5 * h2), r1 = 1400, hw = (1.5 + 9 * h3 * h3) / 2;
      const ca = Math.cos(an), sa = Math.sin(an);
      ctx.moveTo(960 + ca * r0 * 1.15, 540 + sa * r0 * 0.78);
      ctx.lineTo(960 + ca * r1 - sa * hw * 3, 540 + sa * r1 + ca * hw * 3);
      ctx.lineTo(960 + ca * r1 + sa * hw * 3, 540 + sa * r1 - ca * hw * 3);
      ctx.closePath();
    }
    ctx.fill();
  }
  // the announcer's shout: syllable onsets in beats after the gap starts (score.js vocals)
  const SHOUT = (() => {
    const v = S.vocals.announcer.find((a) => a.syllables && Math.abs(bt(a.beat) - R0) < BEAT * 2) || { beat: R0 / BEAT, syllables: [0, 0.64, 1.17] };
    return v.syllables.map((b) => v.beat + b - R0 / BEAT);  // in beats after R0
  })();
  function drawRubedo(ctx, t) {
    if (t < R0 || t >= R1) return false;
    const ub = (t - R0) / BEAT;                              // 0..2
    const red = '#d6191b', ink = '#140607';
    const sLast = SHOUT[SHOUT.length - 1], uL = sLast + 0.18;  // Latin line lands after the last syllable
    ctx.fillStyle = '#fbf8f1'; ctx.fillRect(0, 0, VW, 1080);
    focusLines(ctx, t, mix(900, 640, easeIn(ub / 2)), 0.9 * remap(ub, 0.2, 0.7));
    const z = 1 + 0.07 * easeIn(ub / 2);
    // held-breath tremble, anime style 'on twos' (a new random offset every 1/15 s), so it looks
    // the same at 30 and 60 fps and never aliases into a frame-by-frame flip
    const amp = MO.reduced ? 0 : 7 * easeIn(ub / 2) + 3;
    const k2 = Math.floor(t * 15 + 2e-3);
    const shx = amp * (hash(k2 * 1.31 + 0.7) * 2 - 1), shy = 0.7 * amp * (hash(k2 * 2.17 + 5.3) * 2 - 1);
    ctx.translate(960 + shx, 540 + shy); ctx.scale(z, z); ctx.translate(-960, -540);
    // enormous red katakana, stamped glyph by glyph with the shout
    ctx.font = font(F.min, 800, 460);
    const chars = ['ル', 'ベ', 'ド'];
    const cwid = chars.map((c) => measure(ctx, c));
    const gap = -14, totalW = cwid.reduce((p, q) => p + q, 0) + gap * 2;
    let x = 960 - totalW / 2;
    const base = 584;
    const mis = easeIn(remap(ub, sLast, 2.0)) * (MO.reduced ? 0.3 : 1);
    ctx.fillStyle = red; ctx.strokeStyle = red; ctx.lineWidth = 8; ctx.lineJoin = 'round';
    chars.forEach((c, i) => {
      // each glyph is stamped on its shouted syllable: full ink on its first frame, the scale
      // settling from 1.45 is the entrance
      const age = ub - SHOUT[i];
      if (age >= 0) {
        const k = easeOut(age / 0.18), sc = mix(1.45, 1, k);
        const cx = x + cwid[i] / 2, cy = base - 170;
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
        if (mis > 0.01) {     // print misregistration: an ink ghost slipping out from under the red
          ctx.fillStyle = `rgba(20,4,8,${0.28 * mis})`;
          ctx.fillText(c, x + mis * 9 * Math.sin(t * 37 + i * 2), base + mis * 6 * Math.cos(t * 29 + i));
          ctx.fillStyle = red;
        }
        ctx.strokeText(c, x, base); ctx.fillText(c, x, base);
        ctx.restore();
      }
      x += cwid[i] + gap;
    });
    // RUBEDO justified to the katakana's width
    if (ub >= uL) {
      const k = easeOut((ub - uL) / 0.15);
      ctx.save();
      const cx = 960, cy = 736; ctx.translate(cx, cy); ctx.scale(mix(1.25, 1, k), mix(1.25, 1, k)); ctx.translate(-cx, -cy);
      ctx.font = font(F.cinzel, 900, 150);
      const nat = measure(ctx, 'RUBEDO', 0);
      const sp = Math.max(0, (totalW - nat) / 5);
      ctx.fillStyle = ink; spaced(ctx, 'RUBEDO', 960, 792, sp, 'center');
      ctx.restore();
    }
    // rules and small lines
    const kr = easeOut(remap(ub, uL, uL + 0.35));
    ctx.fillStyle = red;
    rule(ctx, 960 - totalW / 2 * kr, 836, 960 + totalW / 2 * kr, 3);
    rule(ctx, 960 - totalW / 2 * kr, 846, 960 + totalW / 2 * kr, 1);
    if (ub >= uL + 0.15) {
      ctx.globalAlpha = clamp((ub - uL - 0.15) / 0.1);
      ctx.font = font(F.cinzel, 700, 32);
      const wl = measure(ctx, 'XXI · THE WORLD ·', 14);
      ctx.font = font(F.min, 800, 34);
      const wk = measure(ctx, '世界', 6);
      const x0 = 960 - (wl + 20 + wk) / 2;
      ctx.font = font(F.cinzel, 700, 32); spaced(ctx, 'XXI · THE WORLD ·', x0, 900, 14);
      ctx.font = font(F.min, 800, 34); spaced(ctx, '世界', x0 + wl + 20, 901, 6);
      ctx.globalAlpha = 1;
    }
    if (ub >= SHOUT[1]) {    // the header lands with the second syllable
      ctx.fillStyle = ink; ctx.font = font(F.cinzel, 600, 22);
      spaced(ctx, 'OPERATIO QUARTA · THE REDDENING', 150, 140, 9);
      ctx.font = font(F.min, 800, 26); ctx.fillStyle = red;
      spaced(ctx, '第四章　' + KANJI.rubedo, 1770, 141, 6, 'right');
      ctx.fillStyle = ink; rule(ctx, 150, 160, 1770, 1.2);
    }
    return true;
  }

  // ================================================================ 7. the hook: giant chrome karaoke
  const HOOK = S.vocals.hook.map((line, li) => ({
    li, jp: line.jp, t0: MO.barTime(line.bar), t1: MO.barTime(line.bar + 1),
    toks: line.text.toUpperCase().split(' ').map((w, i) => ({ text: w, t: MO.barTime(line.bar, 0, line.words[i][1]) })),
  }));
  const HOOK_MAX = [172, 172, 250, 272], SQ = 0.9;   // SQ: horizontal condensing of the chrome
  function hookLayout(line) {
    return cached('hook-layout|' + line.li, () => {
      mctx.font = font(F.chrome, 900, 100);
      const ws = line.toks.map((w) => measure(mctx, w.text, 1.2) * SQ);
      const space = 34;
      const total = ws.reduce((p, q) => p + q, 0) + space * (ws.length - 1);
      const px = Math.min(HOOK_MAX[line.li], 100 * 1790 / total), k = px / 100;
      let x = 960 - total * k / 2;
      const words = line.toks.map((w, i) => { const o = { ...w, x, w: ws[i] * k }; x += (ws[i] + space) * k; return o; });
      return { px, words, base: line.li >= 2 ? 884 : 862 };
    });
  }
  function drawHookLine(ctx, t, line) {
    const lay = hookLayout(line);
    const big = line.li >= 2;
    // kick pump; on the closing clap fill of the last bar every clap punches the line
    const kp = 1 + 0.03 * MO.env('kick', t, 0.1) + (line.li === 3 ? 0.05 * MO.env('clap', t, 0.08) * remap(t, line.t1 - BEAT * 1.05, line.t1 - BEAT) : 0);
    let shx = 0;
    // each clap of the closing fill knocks the line sideways, alternating left / right (locked
    // to the claps, not an oscillator, so it cannot alias at 30 fps)
    if (line.li === 3 && !MO.reduced) shx = 9 * MO.env('clap', t, 0.06) * (MO.count('clap', t) % 2 ? 1 : -1);
    ctx.save();
    ctx.translate(960 + shx, lay.base - lay.px * 0.3); ctx.scale(kp, kp); ctx.translate(-960, -(lay.base - lay.px * 0.3));
    // the two big bars: a rainbow laser sunburst behind each word as it lands
    if (big) {
      for (const w of lay.words) {
        const age = t - w.t;
        if (age < 0 || age > 0.7) continue;
        const k = Math.exp(-age / 0.2) * (MO.reduced ? 0.15 : 1);   // reduced: a faint glow, no strobe
        const cx = w.x + w.w / 2, cy = lay.base - lay.px * 0.35;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(age * 0.5 + w.t);
        const N = 22, R0 = 40 + 700 * easeOut(age / 0.5), R = 260 + 1700 * easeOut(age / 0.25);
        ctx.lineCap = 'round';
        for (let i = 0; i < N; i++) {
          const an = (i + 0.5 * hash(i + w.t)) / N * TAU, ca = Math.cos(an), sa = Math.sin(an);
          ctx.beginPath(); ctx.moveTo(ca * R0, sa * R0); ctx.lineTo(ca * R, sa * R);
          ctx.strokeStyle = `hsla(${(i / N * 360 + age * 300) % 360},100%,60%,${0.45 * k})`; ctx.lineWidth = 12; ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`; ctx.lineWidth = 2.5; ctx.stroke();
        }
        ctx.restore();
      }
    }
    for (const w of lay.words) {
      const age = t - w.t;
      if (age < 0) continue;
      const bm = chromeWord(w.text, lay.px, 'hook');
      const cx = w.x + w.w / 2, cy = lay.base - bm.capH * 0.5, ix = cx - bm.w / 2 - bm.ox, iy = lay.base - bm.oy;
      const sc = 1 + 1.0 * Math.exp(-age * 30) * Math.cos(34 * age);
      // shock ring behind the word
      if (age < 0.28) {
        const k = age / 0.28;
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.strokeStyle = big ? '#fff3c4' : '#d8f2ff'; ctx.lineWidth = 10 * (1 - k) + 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, w.w * 0.55 + k * 520, (w.w * 0.55 + k * 520) * 0.28, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      // smear ghosts
      if (age < 0.09) {
        ctx.save(); ctx.globalAlpha = 0.28 * (1 - age / 0.09);
        const g = sc * 1.35;
        ctx.translate(cx, cy); ctx.scale(g * SQ, g); ctx.translate(-cx, -cy);
        ctx.drawImage(bm.c, ix, iy, bm.cw, bm.ch);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha *= clamp(age / 0.03);
      ctx.translate(cx, cy); ctx.scale(sc * SQ, sc); ctx.translate(-cx, -cy);
      ctx.drawImage(bm.c, ix, iy, bm.cw, bm.ch);
      // white-hot flash of the face as it lands
      const flash = Math.exp(-age / 0.06);
      if (flash > 0.03) { ctx.globalAlpha *= flash * 0.85; ctx.drawImage(bm.white, ix, iy, bm.cw, bm.ch); }
      ctx.restore();
    }
    // star glints on letter edges
    {
      const hat = MO.env('openHat', t, 0.12), ch = MO.env('closedHat', t, 0.05);
      lay.words.forEach((w, i) => {
        const age = t - w.t;
        if (age < 0.05) return;
        const bm = chromeWord(w.text, lay.px, 'hook');
        // one glint per word, on a top corner, alternating sides; open hats make them flare
        const j = (i + line.li) % 2;
        const pts = [j ? [w.x + w.w * 0.97 + bm.capH * 0.05, lay.base - bm.capH * 0.96] : [w.x + bm.capH * 0.26, lay.base - bm.capH * 0.97]];
        pts.forEach(([gx, gy]) => {
          const ph = hash(i * 7 + j * 3 + line.li);
          const tw = 0.5 + 0.5 * Math.sin(t * (5 + 4 * ph) + ph * 20);
          const r = lay.px * (0.1 + 0.08 * tw + 0.14 * hat + 0.04 * ch) * (big ? 1.15 : 1);
          star(ctx, gx, gy, r, clamp((age - 0.05) / 0.1) * (0.55 + 0.45 * tw), 0.12 * Math.sin(t + ph));
        });
      });
    }
    ctx.restore();
    // Japanese line beneath
    {
      const a = remap(t, line.t0, line.t0 + 0.12);
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = font(F.min, 800, big ? 46 : 42);
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(8,2,2,0.95)'; ctx.lineWidth = 8; ctx.fillStyle = '#fff3d2';
      spaced(ctx, line.jp, 960, lay.base + (big ? 100 : 84), 12, 'center', 'both');
      ctx.restore();
    }
  }
  function drawHook(ctx, t) {
    if (t < H0 || t >= H1) return false;
    const i = HOOK.findIndex((l) => t >= l.t0 && t < l.t1);
    if (i < 0) return false;
    drawHookLine(ctx, t, HOOK[i]);   // lines hard-cut on the bar line
    return true;
  }

  // ================================================================ 8. final logo + fade to black
  function drawLogo(ctx, t) {
    if (t < L0) return false;
    const ub = (t - L0) / BEAT;                              // 0..3
    const fade = easeIn(remap(t, L1 - 0.85, L1 - 0.2));
    const px = 162, base = 842;
    const bm = chromeWord('MAGNUM OPUS', px, 'logo');
    const x = 960 - bm.w / 2;
    const rev = easeOut(remap(ub, 0, 0.6));
    if (fade < 1) {
      ctx.save();
      // warm halo behind the logo
      const ha = easeOut(remap(ub, 0, 0.8));
      ctx.save(); ctx.translate(960, base - bm.capH * 0.45); ctx.scale(1, 0.2);
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 900);
      hg.addColorStop(0, `rgba(255,170,60,${0.32 * ha})`); hg.addColorStop(0.5, `rgba(200,80,20,${0.12 * ha})`); hg.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = hg; ctx.fillRect(-900, -900, 1800, 1800);
      ctx.restore();
      // thin gold rule + lozenge above
      ctx.fillStyle = '#f3c867';
      const rw = 640 * easeOut(remap(ub, 0.15, 0.8));
      rule(ctx, 960 - rw, 676, 960 - 16, 1.2); rule(ctx, 960 + 16, 676, 960 + rw, 1.2);
      ctx.save(); ctx.translate(960, 676); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      // wipe-on reveal with a hot leading edge
      ctx.save();
      ctx.beginPath(); ctx.rect(x - bm.ox, base - bm.oy, (bm.cw) * rev, bm.ch); ctx.clip();
      ctx.drawImage(bm.c, x - bm.ox, base - bm.oy, bm.cw, bm.ch);
      ctx.restore();
      if (rev < 1) {
        const ex = x - bm.ox + bm.cw * rev;
        const g = ctx.createLinearGradient(ex - 60, 0, ex + 10, 0);
        g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(1, 'rgba(255,250,235,0.95)');
        ctx.save(); ctx.beginPath(); ctx.rect(ex - 60, base - bm.oy, 70, bm.ch); ctx.clip();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9;
        ctx.drawImage(bm.white, x - bm.ox, base - bm.oy, bm.cw, bm.ch);
        ctx.restore();
        star(ctx, ex, base - bm.capH * 0.5, 120, 1 - rev * 0.5);
      }
      // the sheen + lens flare sweep across the logo
      const sw = remap(ub, 0.9, 2.1);
      if (sw > 0 && sw < 1) {
        const fx = mix(x - 200, x + bm.w + 200, easeInOut(sw));
        ctx.save();
        ctx.beginPath(); ctx.moveTo(fx - 30, base - bm.oy); ctx.lineTo(fx + 40, base - bm.oy); ctx.lineTo(fx - 40, base - bm.oy + bm.ch); ctx.lineTo(fx - 110, base - bm.oy + bm.ch); ctx.closePath(); ctx.clip();
        ctx.globalAlpha = 0.85; ctx.drawImage(bm.white, x - bm.ox, base - bm.oy, bm.cw, bm.ch);
        ctx.restore();
        const fy = base - bm.capH * 0.55, fa = Math.sin(sw * Math.PI);
        ctx.save();
        const streak = ctx.createLinearGradient(fx - 900, 0, fx + 900, 0);
        streak.addColorStop(0, 'rgba(255,200,120,0)'); streak.addColorStop(0.5, `rgba(255,248,230,${0.85 * fa})`); streak.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = streak; ctx.fillRect(fx - 900, fy - 2.5, 1800, 5);
        ctx.fillRect(fx - 500, fy - 9, 1000, 18 * 0.3);
        const bloomG = ctx.createRadialGradient(fx, fy, 0, fx, fy, 280);
        bloomG.addColorStop(0, `rgba(255,236,190,${0.55 * fa})`); bloomG.addColorStop(0.3, `rgba(255,170,80,${0.18 * fa})`); bloomG.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = bloomG; ctx.beginPath(); ctx.arc(fx, fy, 280, 0, TAU); ctx.fill();
        star(ctx, fx, fy, 240, fa);
        // ghosts along the flare axis (towards the frame centre)
        const gx = 960 - (fx - 960) * 0.6, gy = 540 - (fy - 540) * 0.6;
        [[0.0, 26, '255,190,90'], [0.35, 14, '120,200,255'], [0.7, 40, '255,120,90'], [1.1, 9, '200,255,190']].forEach(([k, r, col]) => {
          const px2 = mix(fx, gx, k), py2 = mix(fy, gy, k);
          const g = ctx.createRadialGradient(px2, py2, 0, px2, py2, r);
          g.addColorStop(0, `rgba(${col},${0.0})`); g.addColorStop(0.8, `rgba(${col},${0.22 * fa})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px2, py2, r, 0, TAU); ctx.fill();
        });
        ctx.restore();
      }
      // glints that keep twinkling
      if (rev >= 1) {
        star(ctx, x + bm.w * 0.035, base - bm.capH * 0.98, 46 * (0.6 + 0.4 * Math.sin(t * 7)), 0.9);
        star(ctx, x + bm.w * 0.93, base - bm.capH * 0.2, 36 * (0.6 + 0.4 * Math.sin(t * 9 + 2)), 0.8);
      }
      // subtitle lines
      const k2 = remap(ub, 0.45, 0.8);
      ctx.globalAlpha = k2;
      ctx.font = font(F.min, 800, 40); ctx.fillStyle = '#f3c867';
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(10,4,0,0.9)'; ctx.lineWidth = 6;
      spaced(ctx, S.titleJp, 960, 912, 24, 'center', 'both');
      const k3 = easeOutBack(remap(ub, 0.7, 1.0), 1.6);
      if (k3 > 0) {
        ctx.globalAlpha = clamp(k3);
        ctx.save(); ctx.translate(960, 962); ctx.rotate(-0.035); ctx.scale(k3, k3);
        ctx.font = font(F.chrome, 900, 38);
        ctx.strokeStyle = '#08030a'; ctx.lineWidth = 9; ctx.fillStyle = '#ffffff';
        const sub = `(${S.subtitle})`;
        spaced(ctx, sub, 0, 13, 2, 'center', 'both');
        ctx.restore();
      }
      ctx.restore();
    }
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, VW, 1080); }
    return true;
  }

  // ================================================================ cache warm-up
  // Building a chrome bitmap costs a few to ~40 ms (SwiftShader); build them in the background
  // after the first frame so a word never stalls the frame it slams in on. Output is identical
  // either way (the cache only saves work).
  let warmQ = [], warmTimer = 0;
  function warmTick() {
    warmTimer = 0;
    const job = warmQ.shift();
    if (!job) return;
    try { job(); } catch (e) { warmQ = []; return; }
    warmTimer = setTimeout(warmTick, 30);
  }
  function startWarm() {
    if (warmTimer) clearTimeout(warmTimer);
    warmQ = [
      ...HOOK.flatMap((l) => l.toks.map((w) => () => chromeWord(w.text, hookLayout(l).px, 'hook'))),
      () => chromeWord('CITRINITAS', 146, 'logo'),
      () => chromeWord('MAGNUM OPUS', 162, 'logo'),
    ];
    warmTimer = setTimeout(warmTick, 60);
  }

  // ================================================================ the overlay callback
  MO.overlay((ctx, t, W, H) => {
    if (H !== curH) { cache.clear(); curH = H; s = H / 1080; startWarm(); }
    s = H / 1080; VW = W / s;
    ctx.scale(s, s);
    ctx.textBaseline = 'alphabetic';
    let drew = false;
    const layer = (fn) => { ctx.save(); try { if (fn(ctx, t)) drew = true; } finally { ctx.restore(); } };
    layer(drawCredit);
    layer(drawMarker);
    layer(drawAlbedo);
    layer(drawCitrinitas);
    layer(drawChakraGauge);
    layer(drawRap);
    layer(drawHook);
    layer(drawLogo);
    layer(drawNigredo);
    layer(drawRubedo);
    return drew;
  });
})();
