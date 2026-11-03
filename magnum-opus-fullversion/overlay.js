// MAGNUM OPUS (full version) typography layer. Everything here is Canvas 2D, drawn by one
// MO.overlay() callback after tone mapping, so colours appear exactly as drawn. The post pass's
// flashes go under the type (it stays legible through them); its impact frames, vignette and grain
// land on top. A pure function of t: every time comes from score.js (overlayWindows, sections,
// stages, vocals, trumps, chakras, cues, drums, hits), never from hard-coded seconds (the one
// exception is the measured consonant pre-roll of a few rap words, see PRE_ROLL).
// The frame is laid out in 1920x1080 units (ctx.scale(H / 1080)).
//
// Layers (back to front): wheel of trumps, motto, HUD (cartouche, bar counter, sequencer, TC),
// trump rail + title stamps, OP credits, roll call (GOLD!, cards, 変身), kundalini + metal gauge,
// riff chops, lyrics (ghost, fansub, whisper, hype, lift, tategaki, lantern serif, chrome karaoke,
// moon karaoke), character captions, episode cards, OP title card, viewfinder + slate + ED roll,
// coda card, final logo + つづく + fade to black, eyecatch, the four stage inserts.
//
// Every element looks its window up by a keyword in overlayWindows[].what and loops over all
// matches (wins), so a score without a window simply does not draw that element (the 30 s score
// still runs: it draws the NIGREDO and RUBEDO inserts, the rap, the hook and the logo).
//
// Hooks for the scenes (optional, all in 0..1 frame fractions, y down):
//   MO.anchors.lantern = [x, y] or (t) => [x, y]   centre of the eyecatch's iris-in (the Hermit's lantern)
//   MO.anchors.frame   = (t) => [x0, y0, x1, y1]   what the viewfinder brackets frame in the pull-back
(() => {
  'use strict';
  const S = window.SCORE, BEAT = MO.BEAT, BAR = MO.BAR, STEP = MO.STEP;
  const { clamp, mix, remap, easeOut, easeIn, easeInOut } = MO;
  const TAU = Math.PI * 2;
  const FRAME = 1 / 30;                 // one frame of the 30 fps master
  const bt = (b) => b * BEAT;
  const barT = (bar, step = 0) => bar * BAR + step * STEP;
  const arr = (x) => (Array.isArray(x) ? x : []);
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const easeOutBack = (x, c = 1.7) => { x = clamp(x); const y = x - 1; return 1 + (c + 1) * y * y * y + c * y * y; };
  const V = S.vocals || {};

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
  const WINS = arr(S.overlayWindows).map((w) => ({ what: String(w.what || ''), a: bt(w.fromBeat), b: bt(w.toBeat), fromBeat: w.fromBeat, toBeat: w.toBeat }));
  // every window whose description matches (string: substring, RegExp: test), in time order
  const wins = (key) => WINS.filter((w) => (key instanceof RegExp ? key.test(w.what) : w.what.includes(key))).sort((p, q) => p.a - q.a);
  const win1 = (key) => wins(key)[0] || null;
  const within = (list, t) => { for (const w of list) if (t >= w.a && t < w.b) return w; return null; };
  const inside = (w, t) => !!w && t >= w.a && t < w.b;

  const SECS = arr(S.sections).map((x, i) => ({ ...x, i, t0: barT(x.bars[0]), t1: barT(x.bars[1]) }));
  const secAt = (t) => SECS.find((x) => t >= x.t0 && t < x.t1) || SECS[SECS.length - 1];
  // the stages (Nigredo, Albedo, Citrinitas, Rubedo, Opus): score.stages, else runs of section.stage
  const STAGES = (() => {
    let list = arr(S.stages).filter((x) => x && x.stage && x.bars);
    if (!list.length) {
      list = [];
      for (const x of SECS) {
        const last = list[list.length - 1];
        if (last && last.stage === x.stage) last.bars = [last.bars[0], x.bars[1]];
        else list.push({ stage: x.stage, bars: [x.bars[0], x.bars[1]] });
      }
    }
    return list.map((x, i) => {
      const id = String(x.stage).toLowerCase();
      const first = SECS.find((q) => q.stage === x.stage);
      return { id, name: String(x.stage), i, t0: barT(x.bars[0]), t1: barT(x.bars[1]), jp: first ? first.jp : '' };
    });
  })();
  const stageAt = (t) => STAGES.find((x) => t >= x.t0 && t < x.t1) || STAGES[STAGES.length - 1];
  const KANJI = { nigredo: '黒化', albedo: '白化', citrinitas: '黄化', rubedo: '赤化', opus: '終', coda: '終' };
  const ORDINAL = ['PRIMA', 'SECUNDA', 'TERTIA', 'QUARTA', 'QUINTA', 'SEXTA'];
  const CHAPTER = ['第一章', '第二章', '第三章', '第四章', '第五章', '第六章'];
  const roman = (n) => {
    if (!(n > 0)) return '0';
    const T = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, r] of T) while (n >= v) { s += r; n -= v; }
    return s;
  };
  const operatio = (st) => (st.id === 'opus' || st.id === 'coda' ? 'OPUS' : 'OPERATIO ' + roman(st.i + 1));
  const STYLE = {
    nigredo:    { ink: '#ece5da', acc: '#b48ae0', plate: 'rgba(6,3,12,', chrome: 'lead' },
    albedo:     { ink: '#f4f9ff', acc: '#9fdcff', plate: 'rgba(4,8,30,', chrome: 'silver' },
    citrinitas: { ink: '#fff6dc', acc: '#ffc53d', plate: 'rgba(30,14,0,', chrome: 'gold' },
    rubedo:     { ink: '#fff4ee', acc: '#ff5a3c', plate: 'rgba(28,2,6,', chrome: 'rainbow' },
    opus:       { ink: '#fff3dc', acc: '#f3c867', plate: 'rgba(20,10,0,', chrome: 'logo' },
  };
  const styleOf = (id) => STYLE[id] || STYLE.nigredo;
  // trump card names (for cards the score does not list) and the colour of the stage a trump was drawn in
  const TAROT = [['0', 'Le Mat'], ['I', 'Le Bateleur'], ['II', 'La Papesse'], ['III', "L'Impératrice"], ['IV', "L'Empereur"], ['V', 'Le Pape'], ['VI', "L'Amoureux"], ['VII', 'Le Chariot'], ['VIII', 'La Justice'], ['IX', "L'Hermite"], ['X', 'La Roue de Fortune'], ['XI', 'La Force'], ['XII', 'Le Pendu'], ['XIII', 'La Mort'], ['XIV', 'Tempérance'], ['XV', 'Le Diable'], ['XVI', 'La Maison Dieu'], ['XVII', "L'Étoile"], ['XVIII', 'La Lune'], ['XIX', 'Le Soleil'], ['XX', 'Le Jugement'], ['XXI', 'Le Monde']];
  const RAILCOL = { fool: '#ece5da', nigredo: '#b48ae0', albedo: '#9fdcff', citrinitas: '#ffc53d', rubedo: '#ff4a4a', opus: '#f3c867' };
  const TRUMPS = arr(S.trumps).map((x, k) => {
    const t = bt(x.beat);
    return { ...x, k, t, col: x.n === 0 ? RAILCOL.fool : RAILCOL[stageAt(t + 2 * BEAT).id] || '#fff' };
  });
  const TRUMP_N = {};
  TRUMPS.forEach((x) => { TRUMP_N[x.n] = x; });
  const trumpName = (n) => (TRUMP_N[n] ? TRUMP_N[n].fr : (TAROT[n] || ['', ''])[1]);
  const trumpNumeral = (n) => (TRUMP_N[n] ? TRUMP_N[n].numeral : (TAROT[n] || [''])[0]);
  const trumpByNumeral = (num) => TRUMPS.find((x) => x.numeral === num) || null;

  // the windows
  const W_NIG = wins(/^NIGREDO/).find((w) => /full-screen/i.test(w.what)) || null;
  const W_ALB = wins(/^ALBEDO/).find((w) => /full-screen/i.test(w.what)) || null;
  const W_CIT = wins(/^CITRINITAS/).find((w) => /full-screen/i.test(w.what)) || null;
  const W_RUB = wins(/^RUBEDO/).find((w) => /full-screen/i.test(w.what)) || null;
  const W_MOTTO = win1(/motto/i);
  const W_HUD = wins(/^HUD/);
  const W_RAIL = win1(/^trump rail/);
  const W_TITLE = win1(/OP title card/);
  const W_EPI = wins(/episode card/);
  const W_CAP = wins(/^character caption/);
  const W_SUB = wins(/^rap subtitles|^whisper|^hype rap/);
  const W_GHOST = wins(/^ghost/);
  const W_LIFT = wins(/^pre-chorus/);
  const W_HOOK = wins(/^hook karaoke|^hook lyrics/);
  const W_CHOP = wins(/^chop stencil/);
  const W_BRIDGE = wins(/^bridge lyrics/);
  const W_HERMIT = wins(/Hermit's words/);
  const W_WHEEL = win1(/^wheel of trumps/);
  const W_EYE = win1(/^EYECATCH/);
  const W_HENSHIN = win1(/^変身/);
  const W_ROLL = win1(/^roll-call/);
  const W_VF = win1(/^viewfinder/);
  const W_CODACARD = win1(/^coda card/);
  const W_CODA = wins(/^coda lyric/);
  const W_LOGO = wins(/^final .*logo/).pop() || null;           // the last window: everything after it fades to black
  // the HUD (and the rail) hide under these
  const HIDE = wins(/^(NIGREDO|ALBEDO|CITRINITAS|RUBEDO) full-screen|^EYECATCH|^wheel of trumps|^viewfinder/);
  const BREAKDOWN = SECS.filter((x) => /breakdown/i.test(x.id + ' ' + (x.role || '')));

  // ---------------------------------------------------------------- frame state + caches
  let s = 1, VW = 1920, curH = 0, lastT = 0;
  const cache = new Map();                               // small things: layouts, gradients, patterns
  const cached = (key, make) => { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; };
  // big bitmaps (chrome lettering, glows, cards): least recently used, with a pixel budget
  const big = new Map();
  let bigPx = 0;
  const BIG_BUDGET = 22e6;
  function bigCached(key, make) {
    let v = big.get(key);
    if (v) { big.delete(key); big.set(key, v); return v; }
    v = make();
    big.set(key, v); bigPx += v.px || 0;
    while (bigPx > BIG_BUDGET && big.size > 1) {
      const [k0, v0] = big.entries().next().value;
      big.delete(k0); bigPx -= v0.px || 0;
    }
    return v;
  }
  const mcan = document.createElement('canvas'); mcan.width = mcan.height = 8;
  const mctx = mcan.getContext('2d');
  const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  // text with letter spacing; returns the visual width (without the trailing space)
  const HAS_LS = 'letterSpacing' in CanvasRenderingContext2D.prototype;   // older Safari lacks it
  const HAS_FILTER = 'filter' in CanvasRenderingContext2D.prototype;
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
  // vertical (tategaki) text: glyphs stacked from `top`, centred on cx. Punctuation moves to the
  // top right of its cell; the long-vowel mark and brackets turn 90 degrees.
  function vtext(ctx, str, cx, top, px, lead = 1.0, mode = 'fill') {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [...str].forEach((ch, i) => {
      const y = top + (i + 0.5) * px * lead;
      let dx = 0, dy = 0, rot = 0;
      if ('、。，．'.includes(ch)) { dx = px * 0.55; dy = -px * 0.55; }
      else if ('ー〜「」『』（）—―…'.includes(ch)) rot = Math.PI / 2;
      ctx.save(); ctx.translate(cx + dx, y + dy); if (rot) ctx.rotate(rot);
      if (mode !== 'fill') ctx.strokeText(ch, 0, 0);
      if (mode !== 'stroke') ctx.fillText(ch, 0, 0);
      ctx.restore();
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
    if (w <= 1 || alpha <= 0) return;
    const img = cached(`plate|${rgbaPrefix}|${side}`, () => {
      const c = newCanvas(128, 64), g = c.getContext('2d');
      const x0 = side === 'l' ? 0 : side === 'r' ? 128 : 64;
      if (side === 'c') {        // an ellipse feathered to nothing on all four edges
        g.translate(64, 32); g.scale(1, 0.5);
        const hg = g.createRadialGradient(0, 0, 0, 0, 0, 64);
        hg.addColorStop(0, rgbaPrefix + '1)'); hg.addColorStop(0.55, rgbaPrefix + '0.7)'); hg.addColorStop(1, rgbaPrefix + '0)');
        g.fillStyle = hg; g.fillRect(-64, -64, 128, 128);
        return c;
      }
      const hg = g.createLinearGradient(x0, 0, 128 - x0, 0);
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
      const q = r * 0.98 / Math.SQRT2;
      ctx.rect(cx - q, cy - q, 2 * q, 2 * q);
      ctx.moveTo(cx, cy - q); ctx.lineTo(cx + q, cy + q); ctx.lineTo(cx - q, cy + q); ctx.closePath();
      const ri = q * 0.5;
      ctx.moveTo(cx + ri, cy + q * 0.33); ctx.arc(cx, cy + q * 0.33, ri, 0, TAU);
    }
    ctx.stroke();
    ctx.restore();
  }
  // the seven planetary glyphs as strokes (♄ ♃ ♂ ♀ ☿ ☽ ☉), in a box of half-size r
  function planet(ctx, name, cx, cy, r, lw) {
    const p = String(name).toLowerCase();
    if (p === 'saturn') return sign(ctx, 'nigredo', cx, cy, r, lw);
    if (p === 'luna' || p === 'moon') return sign(ctx, 'albedo', cx, cy, r * 0.9, lw);
    if (p === 'sol' || p === 'sun') return sign(ctx, 'citrinitas', cx, cy, r * 0.85, lw);
    ctx.save(); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.translate(cx, cy); ctx.scale(r, r); ctx.lineWidth = lw / r;
    ctx.beginPath();
    if (p === 'jupiter') {
      ctx.moveTo(-0.62, -0.62); ctx.bezierCurveTo(-0.25, -1.05, 0.2, -0.55, -0.55, 0.28);
      ctx.lineTo(0.75, 0.28); ctx.moveTo(0.38, -0.78); ctx.lineTo(0.38, 0.95);
    } else if (p === 'mars') {
      ctx.arc(-0.18, 0.22, 0.52, 0, TAU);
      ctx.moveTo(0.2, -0.16); ctx.lineTo(0.78, -0.74);
      ctx.moveTo(0.3, -0.76); ctx.lineTo(0.8, -0.76); ctx.lineTo(0.8, -0.26);
    } else if (p === 'venus') {
      ctx.arc(0, -0.34, 0.46, 0, TAU);
      ctx.moveTo(0, 0.12); ctx.lineTo(0, 0.98); ctx.moveTo(-0.36, 0.56); ctx.lineTo(0.36, 0.56);
    } else if (p === 'mercury') {
      ctx.moveTo(0.38, -0.12); ctx.arc(0, -0.12, 0.38, 0, TAU);
      ctx.moveTo(-0.36, -0.98); ctx.arc(0, -0.98, 0.36, Math.PI, 0, true);
      ctx.moveTo(0, 0.26); ctx.lineTo(0, 0.98); ctx.moveTo(-0.3, 0.64); ctx.lineTo(0.3, 0.64);
    } else {
      ctx.arc(0, 0, 0.8, 0, TAU);
    }
    ctx.stroke();
    ctx.restore();
  }
  // the 30 s manga focus lines; they 'boil' once per 16th, locked to the grid (frozen in reduced mode)
  function focusLines(ctx, t, rin, alpha, rgb = '14,6,6', cx = 960, cy = 540) {
    if (alpha <= 0.005) return;
    const seed = MO.reduced ? 5.0 : Math.floor(t / STEP + 1e-3) * 17.0;
    ctx.fillStyle = `rgba(${rgb},${alpha})`;
    ctx.beginPath();
    const N = 160;
    for (let i = 0; i < N; i++) {
      const h1 = hash(i * 1.37 + seed), h2 = hash(i * 2.71 + seed * 0.5), h3 = hash(i * 0.91 + seed * 1.3);
      const an = (i + h1 * 0.8) / N * TAU;
      const r0 = rin * (0.82 + 0.5 * h2), r1 = 1500, hw = (1.5 + 9 * h3 * h3) / 2;
      const ca = Math.cos(an), sa = Math.sin(an);
      ctx.moveTo(cx + ca * r0 * 1.15, cy + sa * r0 * 0.78);
      ctx.lineTo(cx + ca * r1 - sa * hw * 3, cy + sa * r1 + ca * hw * 3);
      ctx.lineTo(cx + ca * r1 + sa * hw * 3, cy + sa * r1 - ca * hw * 3);
      ctx.closePath();
    }
    ctx.fill();
  }
  // anime 'held breath' tremble on twos (a new random offset every 1/15 s): the same at 30 and 60 fps
  function tremble(t, amp) {
    if (MO.reduced || amp <= 0) return [0, 0];
    const k2 = Math.floor(t * 15 + 2e-3);
    return [amp * (hash(k2 * 1.31 + 0.7) * 2 - 1), 0.7 * amp * (hash(k2 * 2.17 + 5.3) * 2 - 1)];
  }
  // a fade-in over 3 frames in reduced mode (the inserts and the eyecatch); a hard cut otherwise
  const reducedIn = (t, a) => (MO.reduced ? clamp((t - a) / (3 * FRAME) + 1 / 3) : 1);
  // window gate with soft edges: in over fin, out over fout (seconds)
  const gate = (t, a, b, fin, fout) => (t < a || t >= b ? 0 : easeOut(remap(t, a, a + fin)) * (1 - MO.smooth(remap(t, b - fout, b))));
  // lyric tokens: the line's own spelling when it splits into as many tokens as there are words
  function tokens(line) {
    const ws = arr(line.words);
    const tx = String(line.text || '').split(/\s+/).filter(Boolean);
    if (tx.length === ws.length) return ws.map((w, i) => ({ text: tx[i], step: w[1], word: w[0] }));
    return ws.map((w) => ({ text: String(w[0]), step: w[1], word: w[0] }));
  }

  // ---------------------------------------------------------------- chrome lettering (cached bitmaps)
  // kinds: rainbow (the 30 s hook: 90s eurodance chrome in Exo 2 Black Italic), silver, gold, lead,
  // and logo (chrome-gold Cinzel). Face gradients run sky (top half) / ground (bottom half).
  const RAINBOW = ['#ff2a6d', '#ff9f1c', '#ffe94a', '#3bff8a', '#2ad8ff', '#7b5cff', '#ff4fd8'];
  const KINDS = {
    rainbow: {
      fam: F.chrome, sp: 0.012, depth: 0.075, black: 0.12, rimW: 0.05,
      rim: RAINBOW.map((c, i, a) => [i / (a.length - 1), c]),
      extr: [[0, '#24345e'], [0.5, '#120f22'], [1, '#3a1a08']],
      face: [[0, '#1e4fa8'], [0.2, '#5fb0ff'], [0.4, '#d8f1ff'], [0.5, '#ffffff'], [0.5, '#2c1606'], [0.57, '#5a2f0c'], [0.72, '#c0701c'], [0.88, '#ffc35a'], [1, '#fff1c0']],
      horizon: 'rgba(255,220,170,0.35)', edge: 'rgba(255,255,255,0.55)', outline: '#050208',
    },
    silver: {
      fam: F.chrome, sp: 0.012, depth: 0.075, black: 0.12, rimW: 0.05,
      rim: [[0, '#8fa3c8'], [0.3, '#e9f4ff'], [0.5, '#ffffff'], [0.7, '#e9f4ff'], [1, '#8fa3c8']],
      extr: [[0, '#1b2a6b'], [0.5, '#0b1236'], [1, '#22346f']],
      face: [[0, '#6c8fd6'], [0.2, '#bfe6ff'], [0.44, '#ffffff'], [0.5, '#ffffff'], [0.5, '#1b2a6b'], [0.58, '#2a3f8f'], [0.76, '#6c8fd6'], [0.9, '#bfe6ff'], [1, '#ffffff']],
      horizon: 'rgba(205,238,255,0.6)', edge: 'rgba(255,255,255,0.65)', outline: '#04081c',
    },
    gold: {
      fam: F.chrome, sp: 0.012, depth: 0.075, black: 0.12, rimW: 0.05,
      rim: [[0, '#d6402b'], [0.5, '#ff6a3a'], [1, '#d6402b']],
      extr: [[0, '#4a2300'], [0.5, '#1f0d00'], [1, '#5a2a04']],
      face: [[0, '#c07a12'], [0.2, '#ffd34d'], [0.44, '#fff6cf'], [0.5, '#ffffff'], [0.5, '#4a2300'], [0.58, '#7a3e06'], [0.76, '#c07a12'], [0.9, '#ffd34d'], [1, '#fff6cf']],
      horizon: 'rgba(255,240,190,0.55)', edge: 'rgba(255,250,225,0.6)', outline: '#140600',
    },
    lead: {
      fam: F.chrome, sp: 0.012, depth: 0.075, black: 0.12, rimW: 0.05,
      rim: [[0, '#5b3a8c'], [0.5, '#b48ae0'], [1, '#5b3a8c']],
      extr: [[0, '#1c1626'], [0.5, '#09060e'], [1, '#231a33']],
      face: [[0, '#3a3446'], [0.22, '#8d86a0'], [0.44, '#e6e0f0'], [0.5, '#ffffff'], [0.5, '#141018'], [0.6, '#2a2434'], [0.78, '#5b5170'], [0.9, '#a99cc4'], [1, '#d9d0ec']],
      horizon: 'rgba(220,200,255,0.4)', edge: 'rgba(240,230,255,0.55)', outline: '#050308',
    },
    logo: {
      fam: F.cinzel, sp: 0.07, depth: 0.05, black: 0.085, rimW: 0.035, logo: true,
      rim: [[0, '#7a4a12'], [0.5, '#ffe9a8'], [1, '#7a4a12']],
      extr: [[0, '#5a2a06'], [1, '#1a0a02']],
      face: [[0, '#fff2bf'], [0.28, '#f2b02a'], [0.47, '#fff5d2'], [0.5, '#ffffff'], [0.5, '#4a1c00'], [0.6, '#9a520a'], [0.78, '#f7b52c'], [0.9, '#ffd970'], [1, '#fff4c6']],
      horizon: 'rgba(255,240,200,0.55)', edge: 'rgba(255,248,220,0.7)', outline: '#050208',
    },
  };
  KINDS.hook = KINDS.rainbow;
  const kindOf = (k) => KINDS[k] || KINDS.rainbow;
  const ckey = (str, pxU, kind, stencil) => `cw|${kind}|${pxU.toFixed(2)}|${stencil ? 1 : 0}|${str}`;
  function chromeWord(str, pxU, kind = 'rainbow', stencil = false) {
    return bigCached(ckey(str, pxU, kind, stencil), () => {
      const K = kindOf(kind);
      const px = pxU * s;
      const logo = !!K.logo;
      const sp = px * K.sp;
      mctx.font = font(K.fam, 900, px);
      const tw = measure(mctx, str, sp);
      const capH = mctx.measureText('H').actualBoundingBoxAscent || px * 0.7;
      const depth = Math.max(2, Math.round(px * K.depth));
      const black = px * K.black;
      const rim = px * K.rimW;
      const pad = Math.ceil(black + rim + depth + px * 0.2);
      const c = newCanvas(tw + pad * 2, capH + px * 0.35 + pad * 2);
      const g = c.getContext('2d');
      const ox = pad, oy = pad + capH;
      g.font = mctx.font; g.letterSpacing = sp + 'px'; g.lineJoin = 'round'; g.textBaseline = 'alphabetic';
      const dx = depth * 0.45, dy = depth;
      const layers = Math.max(2, Math.round(depth / Math.max(1, s * 1.8)));
      // 1. outer rim
      const rg = g.createLinearGradient(ox, 0, ox + tw, 0);
      K.rim.forEach(([o, col]) => rg.addColorStop(o, col));
      g.strokeStyle = rg; g.lineWidth = (black + rim * 2);
      g.strokeText(str, ox + dx, oy + dy); g.strokeText(str, ox, oy);
      // 2. heavy black outline around the face and the whole extrusion
      g.strokeStyle = K.outline; g.lineWidth = black;
      for (let i = layers; i >= 0; i--) g.strokeText(str, ox + dx * i / layers, oy + dy * i / layers);
      // 3. extrusion body
      const eg = g.createLinearGradient(0, oy - capH, 0, oy + dy);
      K.extr.forEach(([o, col]) => eg.addColorStop(o, col));
      g.fillStyle = eg;
      for (let i = layers; i >= 1; i--) g.fillText(str, ox + dx * i / layers, oy + dy * i / layers);
      // 4. the chrome face on its own canvas, so reflections can be clipped to it
      const f = newCanvas(c.width, c.height), h = f.getContext('2d');
      h.font = g.font; h.letterSpacing = g.letterSpacing; h.textBaseline = 'alphabetic';
      const top = oy - capH;
      const cg = h.createLinearGradient(0, top - capH * 0.08, 0, oy + px * 0.04);
      K.face.forEach(([o, col]) => cg.addColorStop(o, col));
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
      hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, K.horizon); hg.addColorStop(1, 'rgba(255,255,255,0)');
      h.fillStyle = hg; h.fillRect(0, hy - px * 0.05, c.width, px * 0.1);
      h.globalCompositeOperation = 'source-over';
      // crisp light edge, hugging the face from outside (stroke at double width, interior cut away)
      const e = newCanvas(c.width, c.height), ec = e.getContext('2d');
      ec.font = g.font; ec.letterSpacing = g.letterSpacing; ec.textBaseline = 'alphabetic'; ec.lineJoin = 'round';
      ec.strokeStyle = K.edge; ec.lineWidth = 2 * Math.max(1, px * 0.012);
      ec.strokeText(str, ox, oy);
      ec.globalCompositeOperation = 'destination-out'; ec.fillText(str, ox, oy);
      h.drawImage(e, 0, 0);
      g.drawImage(f, 0, 0);
      // stencil: two hairline bridges cut through the whole word (riff chops)
      if (stencil) {
        g.globalCompositeOperation = 'destination-out';
        g.fillRect(0, top + capH * 0.36, c.width, Math.max(1, px * 0.022));
        g.fillRect(0, top + capH * 0.64, c.width, Math.max(1, px * 0.022));
        g.globalCompositeOperation = 'source-over';
      }
      // a flat white silhouette of the face (for flare sheens / flashes)
      const wsil = newCanvas(c.width, c.height), wg = wsil.getContext('2d');
      wg.font = g.font; wg.letterSpacing = g.letterSpacing; wg.fillStyle = '#fff'; wg.fillText(str, ox, oy);
      return { c, white: wsil, ox: ox / s, oy: oy / s, w: tw / s, capH: capH / s, cw: c.width / s, ch: c.height / s, px: c.width * c.height * 2 };
    });
  }
  // draw a chrome word centred on (cx, base) with scale sc (and an optional white-hot flash 0..1)
  function drawChrome(ctx, bm, cx, base, sc = 1, flash = 0, sq = 1) {
    const ix = cx - bm.w / 2 - bm.ox, iy = base - bm.oy, cy = base - bm.capH * 0.5;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(sc * sq, sc); ctx.translate(-cx, -cy);
    ctx.drawImage(bm.c, ix, iy, bm.cw, bm.ch);
    if (flash > 0.03) { ctx.globalAlpha *= clamp(flash); ctx.drawImage(bm.white, ix, iy, bm.cw, bm.ch); }
    ctx.restore();
  }

  // ================================================================ trump cards (an atlas drawn once)
  // Our own cards: flat Marseille colours on cream with a 3 px black outline, a numeral box, a name
  // ribbon and one simple original pictogram each. Drawn in 120 x 208 card units.
  const CRE = '#efe3c4', INK = '#161013', VER = '#d6402b', ULT = '#2c49a8', OCH = '#e8b830', FLE = '#f0c8a0', LEAF = '#3f9a4b', PAPER = '#f6eedb';
  function P(g, pts, close = true) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); }
  function ink(g, fill, lw = 2) { if (fill) { g.fillStyle = fill; g.fill(); } if (lw > 0) { g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); } }
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function seg(g, x0, y0, x1, y1, lw, col = INK, outline = 0) {
    g.lineCap = 'round';
    if (outline) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineWidth = lw + outline * 2; g.strokeStyle = INK; g.stroke(); }
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineWidth = lw; g.strokeStyle = col; g.stroke();
  }
  function lemni(g, x, y, a, lw, col) {
    const path = () => { g.beginPath(); for (let i = 0; i <= 48; i++) { const u = i / 48 * TAU, d = 1 + Math.sin(u) ** 2; const px = x + a * Math.cos(u) / d, py = y + a * Math.sin(u) * Math.cos(u) / d; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); };
    path(); g.lineWidth = lw + 3; g.strokeStyle = INK; g.stroke();
    path(); g.lineWidth = lw; g.strokeStyle = col; g.stroke();
  }
  function starPath(g, x, y, ro, ri, n, rot = -Math.PI / 2) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, an = rot + i * Math.PI / n; i ? g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r) : g.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r); }
    g.closePath();
  }
  function crescentPath(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, Math.PI * 0.32, Math.PI * 1.68, false);
    g.arc(x + r * 0.62, y, r * 0.82, Math.PI * 1.17, Math.PI * 0.83, true);
    g.closePath();
  }
  // a thin crescent: circle (x, y, r) minus the circle offset by d to the right with radius r2
  function thinCrescent(g, x, y, r, d = 0.3, k2 = 0.92) {
    const r2 = r * k2, dd = r * d;
    const ix = (r * r - r2 * r2 + dd * dd) / (2 * dd), iy = Math.sqrt(Math.max(0, r * r - ix * ix));
    const a1 = Math.atan2(iy, ix), a2 = Math.atan2(iy, ix - dd);
    g.beginPath();
    g.arc(x, y, r, a1, TAU - a1, false);
    g.arc(x + dd, y, r2, TAU - a2, a2, true);
    g.closePath();
  }
  function person(g, x, y, sc, col, opts = {}) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    seg(g, -5, 22, -7, 44, 4.5, opts.legs || ULT, 1.2); seg(g, 5, 22, 7, 44, 4.5, opts.legs || ULT, 1.2);
    P(g, [[-10, -18], [10, -18], [14, 24], [-14, 24]]); ink(g, col);
    if (opts.arms !== false) { seg(g, -10, -14, -18, 6, 3.5, FLE, 1.1); seg(g, 10, -14, 18, 6, 3.5, FLE, 1.1); }
    circ(g, 0, -27, 8.5); ink(g, FLE);
    if (opts.hair) { g.beginPath(); g.arc(0, -29, 8.5, Math.PI, 0); ink(g, opts.hair, 1.5); }
    g.restore();
  }
  const ART = [
    (g) => { // 0 the Fool: a walking figure with a bindle and a small dog
      g.fillStyle = LEAF; g.fillRect(-50, 50, 100, 18); seg(g, -50, 50, 50, 50, 1.5);
      g.beginPath(); g.ellipse(27, 41, 10, 5.5, 0, 0, TAU); ink(g, CRE, 1.6);
      circ(g, 37, 34, 5); ink(g, CRE, 1.6);
      seg(g, 19, 40, 13, 32, 1.8); seg(g, 22, 45, 20, 50, 1.8); seg(g, 32, 45, 34, 50, 1.8);
      seg(g, -4, 10, -16, 47, 4.5, ULT, 1.2); seg(g, 5, 10, 11, 47, 4.5, ULT, 1.2);
      P(g, [[-12, -24], [10, -24], [17, 12], [-19, 14]]); ink(g, VER);
      seg(g, -15, -2, 14, -2, 3, OCH);
      seg(g, 10, -18, 26, 47, 2.4, INK);
      seg(g, 8, -20, -24, -50, 2.4, INK);
      circ(g, -27, -52, 8.5); ink(g, ULT);
      circ(g, -1, -33, 8.5); ink(g, FLE);
      P(g, [[-10, -37], [8, -39], [17, -52], [0, -46]]); ink(g, OCH, 1.6);
      circ(g, 17, -52, 2.6); ink(g, VER, 1.2);
    },
    (g) => { // I the Magician: a lemniscate over a table
      P(g, [[-36, 10], [36, 10], [36, 20], [-36, 20]]); ink(g, OCH);
      seg(g, -28, 20, -28, 54, 4, VER, 1.2); seg(g, 28, 20, 28, 54, 4, VER, 1.2);
      P(g, [[-24, -4], [-12, -4], [-15, 10], [-21, 10]]); ink(g, VER, 1.6);
      circ(g, 2, 4, 5.5); ink(g, OCH, 1.6);
      seg(g, 14, 7, 28, 1, 2.2, INK);
      lemni(g, 0, -34, 30, 5, ULT);
      seg(g, -30, -6, -42, -54, 3, CRE, 1.2);
    },
    (g) => { // II the High Priestess: two pillars and a crescent
      P(g, [[-46, -52], [-30, -52], [-30, 56], [-46, 56]]); ink(g, INK);
      P(g, [[-50, -60], [-26, -60], [-26, -52], [-50, -52]]); ink(g, OCH, 1.5);
      P(g, [[30, -52], [46, -52], [46, 56], [30, 56]]); ink(g, CRE);
      P(g, [[26, -60], [50, -60], [50, -52], [26, -52]]); ink(g, OCH, 1.5);
      P(g, [[-26, -40], [26, -40], [22, 50], [-22, 50]]); ink(g, 'rgba(44,73,168,0.28)', 1.2);
      crescentPath(g, 0, -4, 20); ink(g, CRE);
    },
    (g) => { // III the Empress: a crown over Venus
      P(g, [[-22, -32], [-22, -48], [-12, -38], [0, -54], [12, -38], [22, -48], [22, -32]]); ink(g, OCH);
      g.beginPath(); g.arc(0, -2, 17, 0, TAU); g.lineWidth = 10; g.strokeStyle = INK; g.stroke(); g.lineWidth = 6; g.strokeStyle = VER; g.stroke();
      seg(g, 0, 15, 0, 52, 6, VER, 2); seg(g, -15, 34, 15, 34, 6, VER, 2);
    },
    (g) => { // IV the Emperor: a crown on a cube
      P(g, [[0, -6], [30, 8], [0, 22], [-30, 8]]); ink(g, OCH);
      P(g, [[-30, 8], [0, 22], [0, 56], [-30, 42]]); ink(g, VER);
      P(g, [[0, 22], [30, 8], [30, 42], [0, 56]]); ink(g, ULT);
      P(g, [[-20, -14], [-20, -30], [-11, -22], [0, -36], [11, -22], [20, -30], [20, -14]]); ink(g, OCH);
      circ(g, 0, -40, 3.5); ink(g, VER, 1.4);
    },
    (g) => { // V the Hierophant: two crossed keys
      const key = (rot, col) => {
        g.save(); g.rotate(rot);
        seg(g, 0, -26, 0, 46, 6, col, 1.5);
        circ(g, 0, -34, 10); g.lineWidth = 8.5; g.strokeStyle = INK; g.stroke(); g.lineWidth = 5.5; g.strokeStyle = col; g.stroke();
        P(g, [[0, 30], [13, 30], [13, 36], [0, 36]]); ink(g, col, 1.5);
        P(g, [[0, 40], [10, 40], [10, 46], [0, 46]]); ink(g, col, 1.5);
        g.restore();
      };
      key(0.55, OCH); key(-0.55, CRE);
    },
    (g) => { // VI the Lovers: two figures and a heart
      person(g, -20, 12, 0.9, VER, { hair: OCH }); person(g, 20, 12, 0.9, ULT, { hair: INK });
      g.beginPath(); g.moveTo(0, -30); g.bezierCurveTo(-4, -38, -18, -40, -16, -50); g.bezierCurveTo(-14, -58, -3, -58, 0, -50);
      g.bezierCurveTo(3, -58, 14, -58, 16, -50); g.bezierCurveTo(18, -40, 4, -38, 0, -30); ink(g, VER);
    },
    (g) => { // VII the Chariot: a canopy on two wheels
      seg(g, -30, -34, -30, 10, 3, OCH, 1.2); seg(g, 30, -34, 30, 10, 3, OCH, 1.2);
      P(g, [[-40, -48], [40, -48], [34, -32], [-34, -32]]); ink(g, ULT);
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-28 + i * 14, -32, 7, 0, Math.PI); ink(g, ULT, 1.4); }
      circ(g, 0, -14, 8); ink(g, FLE);
      P(g, [[-36, 6], [36, 6], [36, 30], [-36, 30]]); ink(g, OCH);
      for (const wx of [-26, 26]) {
        circ(g, wx, 44, 13); ink(g, CRE);
        for (let k = 0; k < 4; k++) { const an = k * Math.PI / 4; seg(g, wx - Math.cos(an) * 12, 44 - Math.sin(an) * 12, wx + Math.cos(an) * 12, 44 + Math.sin(an) * 12, 1.5); }
      }
    },
    (g) => { // VIII Justice: scales
      P(g, [[-16, 56], [16, 56], [6, 42], [-6, 42]]); ink(g, OCH);
      seg(g, 0, -50, 0, 44, 4, OCH, 1.2);
      seg(g, -38, -36, 38, -36, 4, OCH, 1.2);
      circ(g, 0, -52, 4); ink(g, VER, 1.4);
      for (const sx of [-38, 38]) {
        seg(g, sx, -36, sx - 11, 2, 1.4); seg(g, sx, -36, sx + 11, 2, 1.4);
        g.beginPath(); g.moveTo(sx - 14, 2); g.lineTo(sx + 14, 2); g.arc(sx, 2, 14, 0, Math.PI); ink(g, sx < 0 ? VER : ULT);
      }
    },
    (g) => { // IX the Hermit: a lantern with a star
      seg(g, 0, -60, 0, -44, 2.4);
      P(g, [[-14, -44], [14, -44], [20, -34], [-20, -34]]); ink(g, OCH);
      const lg = g.createRadialGradient(0, 2, 2, 0, 2, 34); lg.addColorStop(0, '#fffbe6'); lg.addColorStop(1, '#f2cf62');
      P(g, [[-20, -34], [20, -34], [26, 0], [20, 38], [-20, 38], [-26, 0]]); ink(g, lg, 2.4);
      seg(g, -26, 0, 26, 0, 1.2);
      starPath(g, 0, 2, 17, 8.5, 6); ink(g, VER, 1.6);
      P(g, [[-16, 38], [16, 38], [12, 48], [-12, 48]]); ink(g, OCH);
    },
    (g) => { // X the Wheel of Fortune: an eight-spoked wheel
      P(g, [[-30, 58], [30, 58], [18, 30], [-18, 30]]); ink(g, LEAF);
      for (let k = 0; k < 4; k++) { const an = k * Math.PI / 4; seg(g, -Math.cos(an) * 36, -8 - Math.sin(an) * 36, Math.cos(an) * 36, -8 + Math.sin(an) * 36, 3, OCH, 1.1); }
      circ(g, 0, -8, 38); g.lineWidth = 11; g.strokeStyle = INK; g.stroke(); g.lineWidth = 7; g.strokeStyle = VER; g.stroke();
      circ(g, 0, -8, 9); ink(g, ULT);
    },
    (g) => { // XI Strength: a lemniscate over a circle of flames
      for (let k = 0; k < 12; k++) {
        const an = k / 12 * TAU, ca = Math.cos(an), sa = Math.sin(an);
        const bx = ca * 24, by = 16 + sa * 24, tx = ca * 44, ty = 16 + sa * 44;
        g.beginPath(); g.moveTo(bx - sa * 7, by + ca * 7); g.quadraticCurveTo(tx - sa * 2, ty + ca * 2, tx, ty); g.quadraticCurveTo(tx + sa * 2, ty - ca * 2, bx + sa * 7, by - ca * 7); g.closePath();
        ink(g, k % 2 ? OCH : VER, 1.4);
      }
      circ(g, 0, 16, 24); ink(g, CRE);
      lemni(g, 0, -46, 22, 4.5, ULT);
    },
    (g) => { // XII the Hanged Man: an inverted figure from a beam
      P(g, [[-44, -62], [44, -62], [44, -54], [-44, -54]]); ink(g, LEAF);
      P(g, [[-44, -54], [-36, -54], [-36, 60], [-44, 60]]); ink(g, LEAF);
      P(g, [[36, -54], [44, -54], [44, 60], [36, 60]]); ink(g, LEAF);
      seg(g, 0, -54, 0, -42, 1.8);
      seg(g, 0, -42, 0, -10, 5, ULT, 1.2);
      seg(g, 0, -30, 12, -22, 5, ULT, 1.2); seg(g, 12, -22, 2, -12, 5, ULT, 1.2);
      P(g, [[-12, -10], [12, -10], [9, 24], [-9, 24]]); ink(g, VER);
      seg(g, -9, -4, -14, 18, 3.4, FLE, 1); seg(g, 9, -4, 14, 18, 3.4, FLE, 1);
      circ(g, 0, 33, 8.5); ink(g, FLE);
      for (let k = -2; k <= 2; k++) seg(g, k * 3, 40, k * 3.5, 48, 1.6, OCH);
    },
    (g) => { // XIII Death: a scythe
      g.fillStyle = LEAF; g.fillRect(-50, 50, 100, 18); seg(g, -50, 50, 50, 50, 1.5);
      seg(g, -30, 50, 24, -46, 5, OCH, 1.4);
      g.beginPath(); g.moveTo(26, -48); g.quadraticCurveTo(-8, -66, -42, -36); g.quadraticCurveTo(-8, -50, 22, -38); g.closePath(); ink(g, CRE);
      seg(g, -18, 47, -6, 45, 2.4, CRE, 1); seg(g, 10, 47, 22, 46, 2.4, CRE, 1);
      circ(g, 30, 42, 5); ink(g, CRE, 1.4);
    },
    (g) => { // XIV Temperance: two cups and a stream
      g.beginPath(); g.moveTo(-22, -38); g.bezierCurveTo(-6, -20, 6, 4, 22, 22); g.lineWidth = 10; g.strokeStyle = INK; g.stroke(); g.lineWidth = 7; g.strokeStyle = ULT; g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = '#9fc2ff'; g.stroke();
      g.save(); g.translate(-26, -40); g.rotate(0.7); P(g, [[-12, -12], [12, -12], [8, 6], [-8, 6]]); ink(g, OCH); P(g, [[-3, 6], [3, 6], [5, 14], [-5, 14]]); ink(g, OCH, 1.5); g.restore();
      g.save(); g.translate(24, 34); P(g, [[-13, -10], [13, -10], [9, 8], [-9, 8]]); ink(g, VER); P(g, [[-3, 8], [3, 8], [6, 16], [-6, 16]]); ink(g, VER, 1.5); g.restore();
    },
    (g) => { // XV the Devil: a horned head over two small figures
      P(g, [[-12, -38], [-24, -60], [-18, -40]]); ink(g, INK);
      P(g, [[12, -38], [24, -60], [18, -40]]); ink(g, INK);
      circ(g, 0, -26, 18); ink(g, VER);
      circ(g, -7, -30, 3.5); ink(g, OCH, 1.2); circ(g, 7, -30, 3.5); ink(g, OCH, 1.2);
      seg(g, -7, -17, 7, -17, 2);
      P(g, [[-14, -4], [14, -4], [14, 10], [-14, 10]]); ink(g, OCH);
      person(g, -26, 26, 0.55, LEAF, { arms: false }); person(g, 26, 26, 0.55, LEAF, { arms: false });
      seg(g, -12, 6, -24, 16, 1.3); seg(g, 12, 6, 24, 16, 1.3);
    },
    (g) => { // XVI the Tower: a tower, a bolt, a falling crown
      P(g, [[-18, -30], [18, -30], [20, 58], [-20, 58]]); ink(g, CRE);
      for (let k = 0; k < 6; k++) seg(g, -18, -16 + k * 13, 18, -16 + k * 13, 1);
      P(g, [[-6, 4], [6, 4], [6, 20], [-6, 20]]); ink(g, VER, 1.6);
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-16 + k * 10, -30); g.quadraticCurveTo(-12 + k * 10, -44, -8 + k * 10, -30); ink(g, k % 2 ? OCH : VER, 1.2); }
      P(g, [[50, -66], [30, -46], [38, -46], [14, -26], [26, -44], [18, -44], [40, -66]]); ink(g, OCH, 1.6);
      g.save(); g.translate(-30, -50); g.rotate(-0.6); P(g, [[-12, 6], [-12, -6], [-6, 0], [0, -10], [6, 0], [12, -6], [12, 6]]); ink(g, OCH, 1.6); g.restore();
      circ(g, -36, 18, 4); ink(g, FLE, 1.2); circ(g, 36, 30, 4); ink(g, FLE, 1.2);
    },
    (g) => { // XVII the Star: one big 8-point star and seven small ones
      starPath(g, 0, -22, 30, 12, 8); ink(g, OCH);
      starPath(g, 0, -22, 18, 8, 8, -Math.PI / 2 + Math.PI / 8); ink(g, VER, 1.4);
      const sm = [[-38, -54], [38, -54], [-42, -16], [42, -16], [-30, 18], [30, 18], [0, 30]];
      sm.forEach(([x, y], k) => { starPath(g, x, y, 8, 3.4, 8); ink(g, [ULT, CRE, VER][k % 3], 1.2); });
      g.beginPath(); g.ellipse(0, 52, 34, 9, 0, 0, TAU); ink(g, ULT, 1.5);
    },
    (g) => { // XVIII the Moon: a crescent between two towers
      circ(g, 0, -36, 22); ink(g, OCH);
      crescentPath(g, -4, -36, 16); ink(g, CRE, 1.4);
      for (const sx of [-34, 34]) {
        P(g, [[sx - 10, 4], [sx + 10, 4], [sx + 10, 50], [sx - 10, 50]]); ink(g, CRE);
        for (let k = 0; k < 3; k++) { P(g, [[sx - 10 + k * 8, -2], [sx - 6 + k * 8, -2], [sx - 6 + k * 8, 4], [sx - 10 + k * 8, 4]]); ink(g, CRE, 1.2); }
        P(g, [[sx - 3, 38], [sx + 3, 38], [sx + 3, 50], [sx - 3, 50]]); ink(g, INK, 0);
      }
      for (let k = 0; k < 5; k++) { const x = -16 + k * 8, y = -4 + (k % 2) * 8; g.beginPath(); g.moveTo(x, y - 6); g.quadraticCurveTo(x + 3, y, x, y + 3); g.quadraticCurveTo(x - 3, y, x, y - 6); ink(g, VER, 1); }
      g.beginPath(); g.ellipse(0, 58, 26, 7, 0, 0, TAU); ink(g, ULT, 1.4);
    },
    (g) => { // XIX the Sun: a rayed sun
      for (let k = 0; k < 16; k++) {
        const an = k / 16 * TAU, ca = Math.cos(an), sa = Math.sin(an);
        if (k % 2) { P(g, [[ca * 24 - sa * 5, -14 + sa * 24 + ca * 5], [ca * 46, -14 + sa * 46], [ca * 24 + sa * 5, -14 + sa * 24 - ca * 5]]); ink(g, VER, 1.4); }
        else {
          g.beginPath();
          for (let j = 0; j <= 10; j++) { const r = 24 + j * 2.2, off = Math.sin(j / 10 * TAU) * 3; const x = ca * r - sa * off, y = -14 + sa * r + ca * off; j ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.lineWidth = 5.5; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3; g.strokeStyle = OCH; g.stroke();
        }
      }
      circ(g, 0, -14, 22); ink(g, OCH);
      circ(g, 0, -14, 14); ink(g, '#fff1b0', 1.2);
      P(g, [[-50, 44], [50, 44], [50, 52], [-50, 52]]); ink(g, LEAF, 1.5);
    },
    (g) => { // XX Judgement: a trumpet with a banner
      for (const [x, y, r] of [[22, -54, 14], [38, -48, 12], [8, -50, 10], [44, -60, 10]]) { circ(g, x, y, r); ink(g, ULT, 1.4); }
      P(g, [[30, -42], [-14, -2], [-10, 4], [36, -36]]); ink(g, OCH);
      P(g, [[-14, -2], [-30, 0], [-12, 16], [-10, 4]]); ink(g, OCH);
      P(g, [[2, -14], [18, -28], [18, 10], [2, 22]]); ink(g, CRE, 1.6);
      seg(g, 10, -14, 10, 10, 3, VER); seg(g, 4, -2, 16, -6, 3, VER);
      P(g, [[-40, 40], [40, 40], [40, 60], [-40, 60]]); ink(g, LEAF);
      circ(g, -10, 38, 6); ink(g, FLE, 1.4); circ(g, 12, 38, 6); ink(g, FLE, 1.4);
    },
    (g) => { // XXI the World: a mandorla wreath, a dancer, four corner circles
      g.beginPath(); g.ellipse(0, 2, 30, 48, 0, 0, TAU); g.lineWidth = 11; g.strokeStyle = INK; g.stroke(); g.lineWidth = 7.5; g.strokeStyle = LEAF; g.stroke();
      for (let k = 0; k < 18; k++) { const an = k / 18 * TAU; seg(g, Math.cos(an) * 30, 2 + Math.sin(an) * 48, Math.cos(an + 0.15) * 36, 2 + Math.sin(an + 0.15) * 54, 2, LEAF); }
      person(g, 0, 4, 0.7, VER, { legs: FLE, hair: OCH });
      [[-42, -56, OCH], [42, -56, VER], [-42, 58, ULT], [42, 58, LEAF]].forEach(([x, y, c]) => { circ(g, x, y, 7.5); ink(g, c, 1.5); });
    },
  ];
  function paintCard(g, n) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    rr(1.5, 1.5, 117, 205, 7); g.fillStyle = CRE; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 1.1; g.strokeRect(7, 7, 106, 194);
    // numeral box
    g.fillStyle = CRE; g.fillRect(30, 10, 60, 22); g.lineWidth = 1.5; g.strokeRect(30, 10, 60, 22);
    g.fillStyle = INK; g.font = font(F.cinzel, 700, 14); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(trumpNumeral(n), 60, 22);
    // picture panel
    g.save(); g.beginPath(); g.rect(10, 36, 100, 136); g.clip();
    const pg = g.createLinearGradient(0, 36, 0, 172); pg.addColorStop(0, PAPER); pg.addColorStop(1, '#efe0bd');
    g.fillStyle = pg; g.fillRect(10, 36, 100, 136);
    g.translate(60, 104);
    try { (ART[n] || ART[0])(g); } catch (e) { /* a pictogram never breaks the card */ }
    g.restore();
    g.lineWidth = 1.5; g.strokeStyle = INK; g.strokeRect(10, 36, 100, 136);
    // name ribbon
    g.fillStyle = CRE; g.fillRect(10, 177, 100, 22); g.strokeRect(10, 177, 100, 22);
    const name = trumpName(n).toUpperCase();
    let px = 11; g.font = font(F.cinzel, 700, px);
    const w = g.measureText(name).width;
    if (w > 92) { px = Math.max(6, px * 92 / w); g.font = font(F.cinzel, 700, px); }
    g.fillStyle = INK; g.fillText(name, 60, 188.5);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  // a card bitmap wU card units wide (permanent cache; 4 sizes at most per card)
  const cards = new Map();
  function cardImg(n, wU) {
    const key = n + '|' + wU;
    let c = cards.get(key);
    if (!c) {
      const k = wU * s / 120;
      c = newCanvas(120 * k, 208 * k);
      const g = c.getContext('2d');
      g.scale(c.width / 120, c.height / 208);
      paintCard(g, n);
      cards.set(key, c);
    }
    return c;
  }

  // ================================================================ 0. the motto (cold open)
  function drawMotto(ctx, t) {
    const w = W_MOTTO || { a: 0.45, b: 1.7 };
    const a = gate(t, w.a, w.b, 0.45, 0.35);
    if (a <= 0) return false;
    ctx.globalAlpha = a * 0.72;
    ctx.fillStyle = '#e9e1d3';
    ctx.font = font(F.cinzel, 600, 20);
    const wd = spaced(ctx, 'SOLVE  ET  COAGULA', 960, 1032, 10, 'center');
    rule(ctx, 960 - wd / 2 - 74, 1025, 960 - wd / 2 - 26, 1.2);
    rule(ctx, 960 + wd / 2 + 26, 1025, 960 + wd / 2 + 74, 1.2);
    ctx.globalAlpha = 1;
    return true;
  }

  // ================================================================ 1. NIGREDO insert (black; the 30 s design)
  function drawNigredo(ctx, t) {
    if (!W_NIG) return false;
    const N0 = W_NIG.a, N1 = W_NIG.b;
    // exit: on the kick after the insert the card flickers to a negative for one frame (1/30 s) on
    // a mid-tone paper, a flicker rather than a white-out, then the scene. Reduced mode cuts straight.
    const invert = !MO.reduced && t >= N1 && t < N1 + FRAME;
    if (t < N0 || (t >= N1 && !invert)) return false;
    const u = clamp((t - N0) / (N1 - N0));
    const bg = invert ? '#8d877c' : '#000', fg = invert ? '#0d0a08' : '#f3eee5';
    const ember = invert ? '#5a140b' : '#c4452c';
    ctx.globalAlpha = reducedIn(t, N0);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, 1080);
    if (t >= N0 + BEAT) return nigredoB(ctx, t, fg, ember, N0), true;   // cut on the next kick
    const z = 1 + 0.03 * easeOut(u) + (MO.reduced ? 0 : 0.008 * MO.env('kick', t, 0.07));
    ctx.translate(960, 540); ctx.scale(z, z); ctx.translate(-960, -540);
    const draw = easeOut(remap(t, N0, N0 + 0.32));
    const typed = (str, t0, dur) => str.slice(0, Math.ceil(str.length * remap(t, t0, t0 + dur)));
    ctx.fillStyle = fg; ctx.strokeStyle = fg;
    ctx.save();
    ctx.translate(150, 540); ctx.scale(0.8, 1);
    ctx.font = font(F.min, 800, 330);
    ctx.lineWidth = 7; ctx.lineJoin = 'round';
    spaced(ctx, 'ニグレド', 0, 0, -6, 'left', 'both');
    ctx.restore();
    ctx.save();
    ctx.font = font(F.cinzel, 400, 190);
    ctx.strokeStyle = ember; ctx.lineWidth = 2.5;
    spaced(ctx, 'XIII', 1772, 520, 6, 'right', 'stroke');
    ctx.restore();
    ctx.font = font(F.cinzel, 900, 164);
    spaced(ctx, 'NIGREDO', 1772, 790, 30, 'right');
    rule(ctx, 150, 846, mix(150, 1772, draw), 2);
    ctx.fillStyle = ember; rule(ctx, 150, 846, mix(150, 330, draw), 10); ctx.fillStyle = fg;
    rule(ctx, 112, 150, 112 + 1.6, 1); ctx.fillRect(111, 150, 2, 780 * draw);
    rule(ctx, 150, 205, mix(150, 830, draw), 1.2);
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
  // second card, cut in on the next kick: the mirror image (vertical katakana right, Latin left)
  function nigredoB(ctx, t, fg, ember, N0) {
    const t5 = N0 + BEAT, ub = (t - t5) / BEAT;
    const z = 1.0 + 0.04 * easeOut(ub) + (MO.reduced ? 0 : 0.008 * MO.env('kick', t, 0.07));
    ctx.translate(960, 540); ctx.scale(z, z); ctx.translate(-960, -540);
    const draw = easeOut(remap(t, t5, t5 + 0.28));
    ctx.fillStyle = fg; ctx.strokeStyle = fg; ctx.lineJoin = 'round';
    ctx.save();
    ctx.translate(1600, 0); ctx.scale(1.0, 0.94);
    ctx.font = font(F.min, 800, 240); ctx.lineWidth = 6;
    vtext(ctx, 'ニグレド', 0, 70, 240, 0.98, 'both');
    ctx.restore();
    ctx.fillRect(1408, 92, 2, 896 * draw);
    ctx.save();
    ctx.strokeStyle = ember; ctx.lineWidth = 3; ctx.font = font(F.cinzel, 400, 300);
    spaced(ctx, 'XIII', 140, 430, 14, 'left', 'stroke');
    ctx.restore();
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
    for (let i = 0; i < 24; i++) rule(ctx, 1396, 110 + i * 37, 1396 + (i % 4 ? 6 : 14), 1.2);
    return true;
  }

  // ================================================================ 2. the gap inserts: ALBEDO, CITRINITAS, RUBEDO
  // Each lasts exactly its window (the 2-beat gap) and stamps its katakana glyph group by glyph
  // group on the announcer's measured syllables (entry.syllables, beats after entry.beat), falling
  // back to an even spread when the score has none yet.
  function shoutSyllables(w, n, fallback) {
    const e = arr(V.announcer).find((x) => x.beat >= w.fromBeat - 0.01 && x.beat < w.toBeat);
    if (e && Array.isArray(e.syllables) && e.syllables.length) {
      const sy = e.syllables.map((b) => e.beat + b - w.fromBeat);
      while (sy.length < n) sy.push(sy[sy.length - 1] + 0.35);
      return sy;
    }
    if (fallback) return fallback.map((b) => (e ? e.beat - w.fromBeat : 0) + b);
    const k = e && e.flite ? String(e.flite).split(/\s+/).length : n;
    const m = Math.max(n, k), st = Math.min(0.42, 1.25 / Math.max(1, m - 1));
    return Array.from({ length: m }, (_, i) => (e ? e.beat - w.fromBeat : 0) + i * st);
  }
  // the trump line under an insert: the trump drawn during the insert or on its drop (the card the
  // rail flips at that moment: XVIII on the ALBEDO drop, XIX on CITRINITAS, XX in the RUBEDO gap),
  // else the card of the section the drop lands in. "XVIII · LA LUNE ·" + kanji
  function dropTrump(w, french) {
    const drawn = TRUMPS.filter((x) => x.t >= w.a - 1e-3 && x.t <= w.b + 1e-3).pop();
    if (drawn) return { lat: `${drawn.numeral} · ${String(french ? drawn.fr : drawn.en).toUpperCase()} ·`, jp: drawn.jp || '' };
    const sec = secAt(w.b + 1e-3);
    const tr = trumpByNumeral(sec.arcana);
    const name = french && tr ? tr.fr : sec.card;
    return { lat: `${sec.arcana} · ${String(name).toUpperCase()} ·`, jp: sec.cardJp || (tr ? tr.jp : '') };
  }
  // a row of glyph groups, each stamped (full ink on its first frame, the scale settling from 1.45)
  function stampRow(ctx, groups, ub, syl, o) {
    ctx.font = font(F.min, 800, o.px);
    const ws = groups.map((g) => measure(ctx, g[0], o.sp || 0));
    const total = ws.reduce((p, q) => p + q, 0) + o.gap * (groups.length - 1);
    let x = 960 - total / 2;
    groups.forEach(([str, si], i) => {
      const age = ub - syl[si];
      if (age >= 0) {
        const k = easeOut(age / 0.18), sc = mix(1.45, 1, k);
        const cx = x + ws[i] / 2, cy = o.base - o.px * 0.37;
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
        if (o.shadow) { ctx.fillStyle = o.shadow; spaced(ctx, str, x + o.sdx, o.base + o.sdy, o.sp || 0); }
        if (o.mis > 0.01) {     // print misregistration: an ink ghost slipping out from under the colour
          ctx.fillStyle = `rgba(${o.misRgb || '20,4,8'},${0.28 * o.mis})`;
          spaced(ctx, str, x + o.mis * 9 * Math.sin(ub * 16 + i * 2), o.base + o.mis * 6 * Math.cos(ub * 13 + i), o.sp || 0);
        }
        ctx.lineJoin = 'round';
        if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw; spaced(ctx, str, x, o.base, o.sp || 0, 'left', 'stroke'); }
        ctx.fillStyle = o.fill; spaced(ctx, str, x, o.base, o.sp || 0);
        ctx.restore();
      }
      x += ws[i] + o.gap;
    });
    return total;
  }
  function insertHeader(ctx, stIdx, latin, fill, acc, ub, at) {
    if (ub < at) return;
    ctx.fillStyle = fill; ctx.font = font(F.cinzel, 600, 22);
    spaced(ctx, `OPERATIO ${ORDINAL[stIdx] || roman(stIdx + 1)} · ${latin}`, 150, 140, 9);
    ctx.font = font(F.min, 800, 26); ctx.fillStyle = acc;
    const st = STAGES[stIdx];
    spaced(ctx, `${CHAPTER[stIdx] || ''}　${KANJI[st ? st.id : ''] || ''}`, 1770, 141, 6, 'right');
    ctx.fillStyle = fill; rule(ctx, 150, 160, 1770, 1.2);
  }
  function trumpLine(ctx, tl, y, latFill, jpFill, sp = 14, px = 30) {
    ctx.font = font(F.cinzel, 700, px);
    const wl = measure(ctx, tl.lat, sp);
    ctx.font = font(F.min, 800, px + 2);
    const wk = measure(ctx, tl.jp, 6);
    const x0 = 960 - (wl + 20 + wk) / 2;
    ctx.fillStyle = latFill; ctx.font = font(F.cinzel, 700, px); spaced(ctx, tl.lat, x0, y, sp);
    ctx.fillStyle = jpFill; ctx.font = font(F.min, 800, px + 2); spaced(ctx, tl.jp, x0 + wl + 20, y + 1, 6);
  }
  const insertStage = (w) => stageAt(w.b + 1e-3);

  function drawAlbedo(ctx, t) {
    const w = W_ALB;
    if (!w || t < w.a || t >= w.b) return false;
    const span = (w.b - w.a) / BEAT, ub = (t - w.a) / BEAT;
    const syl = INS_SYL.albedo;
    const sLast = syl[Math.min(2, syl.length - 1)], uL = sLast + 0.18;
    ctx.globalAlpha = reducedIn(t, w.a);
    const g = cached('albGround', () => {
      const gg = ctx.createRadialGradient(960, 520, 40, 960, 540, 1150);
      gg.addColorStop(0, '#16308c'); gg.addColorStop(0.5, '#0b1a5e'); gg.addColorStop(1, '#050c34');
      return gg;
    });
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, 1080);
    focusLines(ctx, t, mix(900, 640, easeIn(ub / span)), 0.5 * remap(ub, 0.2, 0.7), '170,205,255');
    const z = 1 + 0.07 * easeIn(ub / span);
    const [shx, shy] = tremble(t, 7 * easeIn(ub / span) + 3);
    ctx.translate(960 + shx, 540 + shy); ctx.scale(z, z); ctx.translate(-960, -540);
    // the moon's thin crescent, left of centre
    ctx.save();
    ctx.strokeStyle = 'rgba(238,244,255,0.92)'; ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(150,200,255,0.9)'; ctx.shadowBlur = 16 * s;
    // (r 262 at (620, 452): its halo ring clears the header rule at y 160 and its lower tip the
    // A of A L B E D O)
    thinCrescent(ctx, 620, 452, 262 * mix(0.96, 1, easeOut(ub / 0.5)), 0.3, 0.93); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.2; ctx.globalAlpha *= 0.6;
    ctx.beginPath(); ctx.arc(620, 452, 280, 0, TAU); ctx.stroke();
    ctx.restore();
    // アル on "Al", ベ on "bee", ド on "doe"
    const total = stampRow(ctx, [['アル', 0], ['ベ', 1], ['ド', 2]], ub, syl,
      { px: 420, base: 610, gap: -6, sp: -10, fill: '#eef4ff', stroke: '#050a26', lw: 12, mis: easeIn(remap(ub, sLast, span)) * (MO.reduced ? 0.3 : 0.7), misRgb: '120,180,255' });
    if (ub >= uL) {
      const k = easeOut((ub - uL) / 0.15);
      ctx.save();
      ctx.translate(960, 770); ctx.scale(mix(1.25, 1, k), mix(1.25, 1, k)); ctx.translate(-960, -770);
      ctx.font = font(F.cinzel, 700, 64); ctx.fillStyle = '#f6fbff';
      ctx.shadowColor = 'rgba(120,200,255,0.8)'; ctx.shadowBlur = 18 * s;
      spaced(ctx, 'ALBEDO', 960, 792, 40, 'center');
      ctx.restore();
    }
    const kr = easeOut(remap(ub, uL, uL + 0.35));
    ctx.fillStyle = '#9fdcff';
    rule(ctx, 960 - total / 2 * kr, 834, 960 + total / 2 * kr, 2);
    if (ub >= uL + 0.15) {
      ctx.globalAlpha *= clamp((ub - uL - 0.15) / 0.1);
      trumpLine(ctx, dropTrump(w, true), 884, '#9fdcff', '#eef4ff', 10, 22);
    }
    ctx.globalAlpha = reducedIn(t, w.a);
    insertHeader(ctx, insertStage(w).i, 'THE WHITENING', '#cfe6ff', '#9fdcff', ub, syl[1]);
    return true;
  }

  function drawCitrinitas(ctx, t) {
    const w = W_CIT;
    if (!w || t < w.a || t >= w.b) return false;
    const span = (w.b - w.a) / BEAT, ub = (t - w.a) / BEAT;
    const syl = INS_SYL.citrinitas;
    const sLatin = syl[Math.min(3, syl.length - 1)];
    ctx.globalAlpha = reducedIn(t, w.a);
    ctx.fillStyle = '#c99a2e'; ctx.fillRect(0, 0, VW, 1080);
    // 24 static XIX rays a shade lighter, straight and wavy alternating (nothing flashes)
    ctx.save();
    ctx.translate(960, 520);
    ctx.fillStyle = '#d7ab43'; ctx.strokeStyle = '#d7ab43';
    for (let i = 0; i < 24; i++) {
      const an = i / 24 * TAU + 0.02, ca = Math.cos(an), sa = Math.sin(an);
      if (i % 2 === 0) {
        const hw = 0.06;
        ctx.beginPath(); ctx.moveTo(ca * 120, sa * 120);
        ctx.lineTo(Math.cos(an - hw) * 1400, Math.sin(an - hw) * 1400); ctx.lineTo(Math.cos(an + hw) * 1400, Math.sin(an + hw) * 1400); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) { const r = 140 + k * 32, off = Math.sin(k * 0.55) * 22; const x = ca * r - sa * off, y = sa * r + ca * off; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.lineWidth = 16; ctx.stroke();
      }
    }
    ctx.restore();
    const z = 1 + 0.06 * easeIn(ub / span);
    const [shx, shy] = tremble(t, 6 * easeIn(ub / span) + 3);
    ctx.translate(960 + shx, 540 + shy); ctx.scale(z, z); ctx.translate(-960, -540);
    // キト on "Kit", リニ on "tree", タス on "nee": black with vermilion shadows
    const total = stampRow(ctx, [['キト', 0], ['リニ', 1], ['タス', 2]], ub, syl,
      { px: 290, base: 580, gap: 4, sp: -8, fill: '#140902', shadow: '#d6402b', sdx: 12, sdy: 10, mis: 0 });
    if (ub >= sLatin) {
      const k = easeOut((ub - sLatin) / 0.15);
      ctx.save();
      ctx.translate(960, 760); ctx.scale(mix(1.25, 1, k), mix(1.25, 1, k)); ctx.translate(-960, -760);
      ctx.font = font(F.cinzel, 900, 66);
      ctx.fillStyle = '#d6402b'; spaced(ctx, 'CITRINITAS', 964, 788, 34, 'center');
      ctx.fillStyle = '#140902'; spaced(ctx, 'CITRINITAS', 960, 784, 34, 'center');
      ctx.restore();
    }
    const kr = easeOut(remap(ub, sLatin, sLatin + 0.35));
    ctx.fillStyle = '#140902';
    rule(ctx, 960 - total / 2 * kr, 828, 960 + total / 2 * kr, 3);
    ctx.fillStyle = '#d6402b';
    rule(ctx, 960 - total / 2 * kr, 838, 960 + total / 2 * kr, 1.2);
    if (ub >= sLatin + 0.12) {
      ctx.globalAlpha *= clamp((ub - sLatin - 0.12) / 0.1);
      trumpLine(ctx, dropTrump(w, true), 884, '#2a1200', '#8a1d0c', 10, 22);
    }
    ctx.globalAlpha = reducedIn(t, w.a);
    insertHeader(ctx, insertStage(w).i, 'THE YELLOWING', '#2a1200', '#8a1d0c', ub, syl[1]);
    return true;
  }

  function drawRubedo(ctx, t) {
    const w = W_RUB;
    if (!w || t < w.a || t >= w.b) return false;
    const span = (w.b - w.a) / BEAT, ub = (t - w.a) / BEAT;
    const red = '#d6191b', ink = '#140607';
    const SH = INS_SYL.rubedo;
    const sLast = SH[Math.min(2, SH.length - 1)], uL = sLast + 0.18;
    ctx.globalAlpha = reducedIn(t, w.a);
    ctx.fillStyle = '#fbf8f1'; ctx.fillRect(0, 0, VW, 1080);
    focusLines(ctx, t, mix(900, 640, easeIn(ub / span)), 0.9 * remap(ub, 0.2, 0.7));
    const z = 1 + 0.07 * easeIn(ub / span);
    const [shx, shy] = tremble(t, 7 * easeIn(ub / span) + 3);
    ctx.translate(960 + shx, 540 + shy); ctx.scale(z, z); ctx.translate(-960, -540);
    const mis = easeIn(remap(ub, sLast, span)) * (MO.reduced ? 0.3 : 1);
    const totalW = stampRow(ctx, [['ル', 0], ['ベ', 1], ['ド', 2]], ub, SH, { px: 460, base: 584, gap: -14, fill: red, stroke: red, lw: 8, mis });
    if (ub >= uL) {
      const k = easeOut((ub - uL) / 0.15);
      ctx.save();
      ctx.translate(960, 736); ctx.scale(mix(1.25, 1, k), mix(1.25, 1, k)); ctx.translate(-960, -736);
      ctx.font = font(F.cinzel, 900, 150);
      const nat = measure(ctx, 'RUBEDO', 0);
      const sp = Math.max(0, (totalW - nat) / 5);
      ctx.fillStyle = ink; spaced(ctx, 'RUBEDO', 960, 792, sp, 'center');
      ctx.restore();
    }
    const kr = easeOut(remap(ub, uL, uL + 0.35));
    ctx.fillStyle = red;
    rule(ctx, 960 - totalW / 2 * kr, 836, 960 + totalW / 2 * kr, 3);
    rule(ctx, 960 - totalW / 2 * kr, 846, 960 + totalW / 2 * kr, 1);
    if (ub >= uL + 0.15) {
      ctx.globalAlpha *= clamp((ub - uL - 0.15) / 0.1);
      trumpLine(ctx, dropTrump(w, false), 900, ink, ink, 14, 32);
      // the key change, in the HUD face
      const kc = S.keyChange;
      if (kc && Math.abs(barT(kc.bar) - w.b) < 0.02) {
        ctx.fillStyle = red; ctx.font = font(F.hud, 400, 17);
        const sgn = kc.semitones > 0 ? '+' : '';
        spaced(ctx, `KEY ${sgn}${kc.semitones} · ${String(kc.to || '').toUpperCase()}`, 960, 950, 6, 'center');
      }
    }
    ctx.globalAlpha = reducedIn(t, w.a);
    insertHeader(ctx, insertStage(w).i, 'THE REDDENING', ink, red, ub, SH[1]);
    return true;
  }

  // ================================================================ 3. HUD: cartouche, bar counter, sequencer, TC
  // gate of an element that hides under the full-screen moments: kIn after each hidden span (or the
  // window start), kOut before the next one (or the window end)
  function hudGate(t, list, fin = 0.4, fout = 0.1) {
    const w = within(list, t);
    if (!w) return null;
    let a = w.a, b = w.b;
    for (const h of HIDE) {
      if (t >= h.a && t < h.b) return null;
      if (h.b <= t && h.b > a) a = h.b;
      if (h.a > t && h.a < b) b = h.a;
    }
    return { kIn: easeOut(remap(t, a, a + fin)), kOut: MO.smooth(remap(t, b - fout, b)), a, b, w };
  }
  function breakdownDim(t) {
    let d = 1;
    for (const x of BREAKDOWN) d = Math.min(d, 1 - 0.5 * remap(t, x.t0 - 0.3, x.t0) * (1 - remap(t, x.t1 - 0.3, x.t1)));
    return d;
  }
  function drawHUD(ctx, t) {
    const gt = hudGate(t, W_HUD);
    if (!gt) return false;
    const { kIn } = gt;
    const a = kIn * (1 - gt.kOut) * breakdownDim(t) * (1 - 0.6 * episodeCover(t));
    if (a <= 0) return false;
    const stg = stageAt(t), st = styleOf(stg.id), sec = secAt(t);
    ctx.save();
    ctx.globalAlpha = a;
    // ---- left: cartouche with the trump's numeral, stage name, katakana + kanji
    const x = 58, y = 48;
    plate(ctx, x - 40, y - 26, 700 * kIn, 128, st.plate, 'l', 0.7);
    const numW = 92;
    ctx.strokeStyle = st.ink; ctx.lineWidth = 2; ctx.strokeRect(x, y, numW, 50);
    ctx.lineWidth = 1; ctx.strokeRect(x + 5, y + 5, numW - 10, 40);
    // the numeral flips when the section (and its trump) changes
    const prev = SECS[sec.i - 1];
    const fu = (t - sec.t0) / 0.2;
    let num = sec.arcana, sx = 1;
    if (prev && fu < 1 && sec.t0 > gt.a + 0.05) { sx = Math.abs(Math.cos(Math.PI * fu)); if (fu < 0.5) num = prev.arcana; }
    ctx.save();
    ctx.translate(x + numW / 2, 0); ctx.scale(Math.max(0.02, sx), 1); ctx.translate(-(x + numW / 2), 0);
    ctx.fillStyle = st.ink; ctx.font = font(F.cinzel, 700, String(num).length > 3 ? 22 : 25);
    spaced(ctx, String(num), x + numW / 2, y + 34, 2, 'center');
    ctx.restore();
    const tx = x + numW + 18;
    ctx.save();
    ctx.beginPath(); ctx.rect(tx - 4, y - 12, 500 * kIn, 104); ctx.clip();
    ctx.fillStyle = st.ink; ctx.font = font(F.cinzel, 700, 27);
    const nw = spaced(ctx, stg.name.toUpperCase(), tx, y + 24, 9);
    ctx.fillStyle = st.acc; ctx.font = font(F.min, 800, 19);
    spaced(ctx, stg.jp + '・' + (KANJI[stg.id] || ''), tx + 1, y + 52, 5);
    ctx.fillStyle = st.ink; ctx.font = font(F.cinzel, 600, 15);
    spaced(ctx, String(sec.card).toUpperCase() + ' · ' + operatio(stg), tx + 1, y + 78, 4);
    ctx.fillStyle = st.acc; rule(ctx, tx + nw + 16, y + 15, tx + nw + 16 + 110 * kIn, 1.2);
    ctx.restore();

    // ---- right: alchemical sign, bar counter, 16-step sequencer, timecode
    const rx = 1862, ry = 50;
    plate(ctx, rx + 50 - 490 * kIn, y - 26, 490 * kIn, 124, st.plate, 'r', 0.7);
    const bar = Math.floor(t / BAR + 1e-6), step = Math.floor((t - bar * BAR) / STEP + 1e-6);
    ctx.fillStyle = st.ink; ctx.font = font(F.hud, 400, 21);
    const digits = Math.max(2, String(S.bars).length);
    const bstr = String(bar + 1).padStart(digits, '0');
    ctx.globalAlpha = a * 0.92;
    spaced(ctx, bstr, rx - 64, ry + 22, 2, 'right');
    ctx.font = font(F.hud, 400, 13); ctx.globalAlpha = a * 0.7;
    spaced(ctx, '/' + S.bars, rx, ry + 21, 2, 'right');
    spaced(ctx, 'BAR', rx - 64 - 21 * digits - 12, ry + 21, 3, 'right');
    const kick = S.drums.kick[Math.min(bar, S.drums.kick.length - 1)] || '';
    const sx0 = rx - 16 * 13 + 4, sy = ry + 34;
    for (let i = 0; i < 16; i++) {
      const on = i === step, past = i < step, k = kick[i] === 'x' || kick[i] === 'X';
      ctx.globalAlpha = a * (on ? 1 : past ? 0.55 : 0.22);
      ctx.fillStyle = on ? st.acc : st.ink;
      const hh = k ? 10 : 5;
      ctx.fillRect(sx0 + i * 13, sy + (10 - hh), 9, hh);
    }
    ctx.globalAlpha = a * 0.7; ctx.fillStyle = st.ink; ctx.font = font(F.hud, 400, 13);
    spaced(ctx, 'TC ' + timecode(t), rx, sy + 31, 2, 'right');
    ctx.globalAlpha = a;
    ctx.strokeStyle = st.acc;
    const kp = MO.env('kick', t, 0.1);
    sign(ctx, stg.id, sx0 - 40, ry + 26, 17 * (1 + 0.12 * kp), 2.2);
    ctx.restore();
    return true;
  }
  function timecode(t) {
    const sec = Math.floor(t + 1e-6), fr = Math.floor((t - sec) * 30 + 1e-6);
    const tc = (v) => String(v).padStart(2, '0');
    return `${tc(Math.floor(sec / 3600))}:${tc(Math.floor(sec / 60) % 60)}:${tc(sec % 60)}:${tc(fr)}`;
  }

  // ================================================================ 4. the trump rail (left edge) + title stamps
  const RAIL = { x: 36, y: 214, pitch: 33, w: 20, h: 32 };
  const CHAPTER_TRUMPS = new Set([13, 18, 19, 21]);
  const T_COMPLETE = TRUMPS.length ? TRUMPS[TRUMPS.length - 1].t : Infinity;
  function railGate(t) {
    if (!W_RAIL || !TRUMPS.length) return null;
    const out = 0.32;                                    // slides off as the viewfinder takes over
    if (t < W_RAIL.a || t >= W_RAIL.b + out) return null;
    for (const h of HIDE) if (t >= h.a && t < h.b && !/viewfinder/.test(h.what) && !/wheel/.test(h.what)) return null;
    let a = 1;
    for (const h of HIDE) if (h.b <= t) a = Math.min(a, easeOut(remap(t, h.b, h.b + 0.35)) + (h.b < t - 0.4 ? 1 : 0));
    const wheel = W_WHEEL && t >= W_WHEEL.a - 0.2 && t < W_WHEEL.b + 0.2 ? 0.35 : 1;
    const slide = easeIn(remap(t, W_RAIL.b, W_RAIL.b + out));
    return { a: clamp(a) * wheel * breakdownDim(t) * (1 - slide), slide };
  }
  function drawRail(ctx, t) {
    const g = railGate(t);
    if (!g || g.a <= 0.01) return false;
    ctx.save();
    ctx.translate(-110 * g.slide, 0);
    ctx.globalAlpha = g.a;
    const n = TRUMPS.filter((x) => t >= x.t).length;
    const complete = t >= T_COMPLETE;
    // label: ARCANA 07/22; at 22/22 it grows into a gold Cinzel line, ARCANA 22/22 · OPUS COMPLETE
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
    const lab = `ARCANA ${String(n).padStart(2, '0')}/${TRUMPS.length}`;
    if (!complete) {
      ctx.font = font(F.hud, 400, 15); ctx.fillStyle = '#ece5da';
      spaced(ctx, lab, RAIL.x - RAIL.w / 2, RAIL.y - 30, 3, 'left', 'both');
    } else {
      const ck = easeOutBack(remap(t, T_COMPLETE, T_COMPLETE + 0.25), 1.6);
      const lx = RAIL.x - RAIL.w / 2, ly = RAIL.y - 28;
      ctx.save();
      ctx.translate(lx, ly); ctx.scale(mix(0.6, 1, ck), mix(0.6, 1, ck)); ctx.translate(-lx, -ly);
      plate(ctx, lx - 30, ly - 40, 640, 58, 'rgba(20,10,0,', 'l', 0.7 * clamp(ck));
      ctx.font = font(F.cinzel, 700, 24); ctx.fillStyle = '#ffe6a0'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,8,0,0.8)';
      const lw = spaced(ctx, lab, lx, ly, 3, 'left', 'both');
      ctx.fillStyle = '#f3c867';
      spaced(ctx, '·  OPUS COMPLETE', lx + lw + 14, ly, 4, 'left', 'both');
      ctx.restore();
    }
    // slots
    for (const tr of TRUMPS) {
      const cx = RAIL.x, cy = RAIL.y + tr.k * RAIL.pitch + RAIL.h / 2;
      const age = t - tr.t;
      if (age < 0) {
        ctx.globalAlpha = g.a * 0.3;
        ctx.strokeStyle = '#ece5da'; ctx.lineWidth = 1;
        ctx.strokeRect(cx - RAIL.w / 2, cy - RAIL.h / 2, RAIL.w, RAIL.h);
        continue;
      }
      // flip in over 6 frames: the back (stage colour) turns to the face (numeral)
      const fu = clamp(age / (6 * FRAME));
      const sx = Math.abs(Math.cos(Math.PI * (1 - fu) / 1)) || 0.02;
      const face = fu >= 0.5;
      ctx.save();
      ctx.globalAlpha = g.a;
      ctx.translate(cx, cy); ctx.scale(Math.max(0.04, fu < 1 ? sx : 1), 1);
      if (!face) { ctx.fillStyle = tr.col; ctx.fillRect(-RAIL.w / 2, -RAIL.h / 2, RAIL.w, RAIL.h); }
      else {
        ctx.fillStyle = 'rgba(10,6,14,0.78)'; ctx.fillRect(-RAIL.w / 2, -RAIL.h / 2, RAIL.w, RAIL.h);
        ctx.strokeStyle = tr.col; ctx.lineWidth = 1.5; ctx.strokeRect(-RAIL.w / 2, -RAIL.h / 2, RAIL.w, RAIL.h);
        const numeral = String(tr.numeral);
        ctx.fillStyle = tr.col; ctx.font = font(F.cinzel, 700, numeral.length > 3 ? 7 : numeral.length > 2 ? 8.5 : 10);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(numeral, 0, 1);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      // OPUS COMPLETE: all the cards shimmer gold in sequence over half a second
      if (complete) {
        const ph = (t - T_COMPLETE) / 0.5 * (TRUMPS.length + 3) - tr.k;
        if (ph > 0 && ph < 3) {
          const k = Math.sin(ph / 3 * Math.PI);
          ctx.globalAlpha = g.a * 0.85 * k; ctx.fillStyle = '#ffd34d';
          ctx.fillRect(-RAIL.w / 2 - 2, -RAIL.h / 2 - 2, RAIL.w + 4, RAIL.h + 4);
        }
        if (ph >= 1.5) { ctx.globalAlpha = g.a; ctx.strokeStyle = '#f3c867'; ctx.lineWidth = 1.5; ctx.strokeRect(-RAIL.w / 2 - 2.5, -RAIL.h / 2 - 2.5, RAIL.w + 5, RAIL.h + 5); }
      }
      ctx.restore();
    }
    ctx.restore();
    // the newest card's title stamp slides out for one beat (the chapter trumps get their insert)
    for (const tr of TRUMPS) {
      const age = t - tr.t;
      if (age < 0 || age > BEAT * 1.35) continue;
      if (CHAPTER_TRUMPS.has(tr.n)) continue;
      if (HIDE.some((h) => h.a < tr.t + BEAT && h.b > tr.t - 0.05)) continue;
      drawStamp(ctx, t, tr, age, g);
    }
    return true;
  }
  function drawStamp(ctx, t, tr, age, g) {
    const kIn = easeOutBack(remap(age, 0, 0.14), 1.4), kOut = easeIn(remap(age, BEAT * 1.1, BEAT * 1.35));
    const cy = RAIL.y + tr.k * RAIL.pitch + RAIL.h / 2;
    const y = clamp(cy - 46, 120, 1080 - 130);
    const x0 = RAIL.x + RAIL.w / 2 + 12;
    const wPl = 530;
    ctx.save();
    ctx.globalAlpha = g.a * (1 - kOut);
    ctx.beginPath(); ctx.rect(x0, y - 10, wPl * kIn, 120); ctx.clip();
    ctx.translate(-(1 - kIn) * 120, 0);
    plate(ctx, x0 - 10, y - 6, wPl + 40, 104, 'rgba(8,4,12,', 'l', 0.85);
    ctx.strokeStyle = tr.col; ctx.lineWidth = 1.2;
    rule(ctx, x0, y, x0 + 2, 1);
    ctx.fillStyle = tr.col; ctx.fillRect(x0, y + 2, 3, 88);
    const ci = cardImg(tr.n, 60);
    ctx.drawImage(ci, x0 + 14, y + 2, 52, 52 * 208 / 120);
    const tx = x0 + 80;
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 4;
    ctx.fillStyle = '#fff6e8'; ctx.font = font(F.cinzel, 700, 24);
    spaced(ctx, `${tr.numeral} · ${String(tr.fr).toUpperCase()}`, tx, y + 34, 5, 'left', 'both');
    ctx.fillStyle = tr.col; ctx.font = font(F.cinzel, 600, 18);
    const ew = spaced(ctx, String(tr.en).toUpperCase(), tx + 1, y + 63, 5, 'left', 'both');
    ctx.font = font(F.min, 800, 23); ctx.fillStyle = '#fff6e8';
    spaced(ctx, tr.jp || '', tx + ew + 18, y + 65, 3, 'left', 'both');
    ctx.globalAlpha *= 0.75; ctx.fillStyle = '#ece5da'; ctx.font = font(F.hud, 400, 12);
    spaced(ctx, `ARCANUM ${String(tr.k + 1).padStart(2, '0')}/${TRUMPS.length}`, tx + 1, y + 89, 3);
    ctx.restore();
  }

  // ================================================================ 5. OP credits (lower left, verses)
  const CREDITS = [
    ['作詞', 'LYRICS', 'THE ANIMA & THE SHADOW'], ['作曲', 'MUSIC', `${S.bpm} BPM IN A MINOR`],
    ['歌', 'VOICES', 'THE ANIMA, THE MASK'], ['絵コンテ', 'STORYBOARD', 'THE FOOL'],
    ['演出', 'DIRECTION', 'THE HERMIT'], ['作画', 'ANIMATION', 'GLSL ES 3.00'],
    ['色彩設計', 'COLOUR', 'NIGREDO ALBEDO CITRINITAS RUBEDO'], ['監督', 'DIRECTOR', 'THE SELF'],
  ];
  const CREDIT_SLOTS = (() => {
    const out = [];
    wins(/^rap subtitles, verse/).slice(0, 2).forEach((v, vi) => {
      for (let j = 0; j < 4; j++) {
        const a = v.a + j * 2 * BAR, b = Math.min(v.b, a + 2 * BAR);
        if (a < v.b) out.push({ a, b, c: CREDITS[vi * 4 + j] });
      }
    });
    return out;
  })();
  function drawCredits(ctx, t) {
    const sl = within(CREDIT_SLOTS, t);
    if (!sl) return false;
    const a = gate(t, sl.a + 0.05, sl.b - 0.08, 0.35, 0.3) * 0.75;
    if (a <= 0) return false;
    const [jp, role, name] = sl.c;
    const lift = (1 - easeOut(remap(t, sl.a, sl.a + 0.45))) * 10;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, lift);
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 4;
    // sizes up from the spec's 16/18 px: at 720p those were about 10 px and barely legible
    const x = 82, y = 846;
    ctx.fillStyle = '#f3e3b8'; ctx.font = font(F.min, 800, 24);
    const jw = spaced(ctx, jp, x, y, 3, 'left', 'both');
    ctx.fillStyle = '#e4d9c3'; ctx.font = font(F.cinzel, 600, 16);
    spaced(ctx, role, x + jw + 14, y - 2, 5, 'left', 'both');
    ctx.fillStyle = '#ffffff'; ctx.font = font(F.cinzel, 500, 22);
    spaced(ctx, name, x, y + 34, 4, 'left', 'both');
    ctx.restore();
    return true;
  }

  // ================================================================ 6. roll call: kundalini + metal gauge, cards, 変身
  const CHAK = arr(S.chakras).map((c, i) => {
    const bar = Math.floor(c.beat / S.beatsPerBar + 1e-6);
    const metal = arr(V.sung).find((l) => l.part === 'metal' && l.bar === bar);
    const shout = arr(V.rap).find((l) => l.style === 'shout' && l.bar === bar);
    const mStep = metal ? (metal.notes && metal.notes[0] ? metal.notes[0][1] : metal.words[0][1]) : 8;
    const jp = String(c.jp || '').split(/[—\-–]/);
    return {
      ...c, i, t: bt(c.beat), tm: barT(bar, mStep), bar,
      css: `rgb(${c.color.map((v) => Math.round(clamp(v) * 255)).join(',')})`,
      rgb: c.color.map((v) => Math.round(clamp(v) * 255)).join(','),
      planetJp: jp[0] || '', metalJp: jp[1] || '',
      planetEn: shout ? String(shout.text).replace(/[!?.,]/g, '').toUpperCase() : String(c.planet || '').toUpperCase(),
      metalEn: metal ? String(metal.text).replace(/[!?.,]/g, '').toUpperCase() : String(c.metal || '').toUpperCase(),
      metalText: metal ? String(metal.text).toUpperCase() : String(c.metal || '').toUpperCase(),
    };
  });
  const HAS_ROLL = !!W_ROLL && CHAK.length === 7 && CHAK.every((c) => c.planet);
  // the lightning: the thunder hit (else the roll-call window's last 2 beats)
  const T_BOLT = (() => {
    const h = arr(S.hits).find((x) => x.type === 'thunder');
    return h ? bt(h.beat) : W_ROLL ? W_ROLL.b - 2 * BEAT : Infinity;
  })();
  // the manga triptych (citrinitas.c3a) slams panels in under the gauge: dim it then
  const C3A = arr(S.cues).filter((c) => c.shot === 'citrinitas.c3a').map((c) => {
    const b0 = c.beats ? c.beats[0] : c.bars[0] * S.beatsPerBar, b1 = c.beats ? c.beats[1] : c.bars[1] * S.beatsPerBar;
    return { a: bt(b0 + 0.5), b: bt(b1) };
  });
  function drawChakraGauge(ctx, t) {
    if (!HAS_ROLL) return false;
    const a0 = W_ROLL.a, a1 = (W_RUB ? W_RUB.a : W_ROLL.b) - 0.095;
    if (t < a0 || t >= a1) return false;
    let dim = 1;
    for (const c of C3A) dim = Math.min(dim, 1 - 0.45 * remap(t, c.a, c.a + 0.1) * (1 - remap(t, c.b - 0.12, c.b)));
    const a = easeOut(remap(t, a0, a0 + 0.25)) * (1 - MO.smooth(remap(t, a1 - 0.15, a1))) * dim;
    const x = 1836, y0 = 900, dy = 78, N = CHAK.length - 1;
    // the build is complete when 金 / GOLD! stamps across the frame: the label columns and the
    // counters step aside for it (only the spine and the lit pips stay)
    // and while 変身 swells on the downbeat they wait: the labels come in as it fades
    const solT = CHAK[CHAK.length - 1].tm;
    const hen = W_HENSHIN && Math.abs(W_HENSHIN.a - a0) < 0.05 ? easeOut(remap(t, W_HENSHIN.a + 1.55 * BEAT, W_HENSHIN.a + 2 * BEAT)) : 1;
    const txt = hen * (1 - MO.smooth(remap(t, solT - 0.04, solT + 0.1)));
    ctx.save();
    ctx.globalAlpha = a;
    plate(ctx, x - 640, y0 - dy * N - 110, 720, dy * N + 210, 'rgba(30,12,0,', 'r', 0.66 * (0.35 + 0.65 * txt));
    const lit = CHAK.filter((c) => t >= c.t).length;
    ctx.fillStyle = 'rgba(255,240,210,0.3)'; ctx.fillRect(x - 1, y0 - dy * N, 2, dy * N);
    if (lit > 0) {
      const grow = lit < CHAK.length ? easeOut(remap(t, CHAK[lit - 1].t, CHAK[lit - 1].t + 0.25)) : 1;
      const top = y0 - dy * Math.max(0, lit - 2 + grow);
      const lg = cached('gaugeGrad', () => { const g = ctx.createLinearGradient(0, y0, 0, y0 - dy * N); CHAK.forEach((c, i) => g.addColorStop(i / N, c.css)); return g; });
      ctx.fillStyle = lg; ctx.fillRect(x - 2.5, top, 5, y0 - top);
    }
    CHAK.forEach((c, i) => {
      const y = y0 - i * dy, on = t >= c.t, age = t - c.t;
      const pop = on ? 1 + 0.6 * Math.exp(-age / 0.09) : 1;
      ctx.save();
      ctx.globalAlpha = a * (on ? 1 : 0.4);
      ctx.translate(x, y);
      ctx.save(); ctx.scale(pop, pop);
      ctx.strokeStyle = on ? c.css : 'rgba(255,240,210,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const an = k / 8 * TAU + (on && !MO.reduced ? age * 0.8 : 0);
        ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(an - 0.35) * 26, Math.sin(an - 0.35) * 26, Math.cos(an) * 24, Math.sin(an) * 24);
        ctx.quadraticCurveTo(Math.cos(an + 0.35) * 26, Math.sin(an + 0.35) * 26, 0, 0);
      }
      ctx.stroke();
      // the lit pip's glow is a cached sprite (a per-frame shadowBlur here cost ~20 ms a frame)
      if (on) { const gs = glowSprite(c.rgb); ctx.drawImage(gs, -30, -30, 60, 60); }
      ctx.fillStyle = on ? c.css : '#1a0d02';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
      if (on) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill(); }
      ctx.restore();
      if (on && age < 0.4) {
        ctx.strokeStyle = c.css; ctx.lineWidth = 4 * (1 - age / 0.4);
        ctx.globalAlpha = a * (1 - age / 0.4);
        ctx.beginPath(); ctx.arc(0, 0, 18 + age * 260, 0, TAU); ctx.stroke();
        ctx.globalAlpha = a;
      }
      if (txt > 0.01) {
        ctx.globalAlpha = a * txt;
        ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(28,10,0,0.75)'; ctx.lineWidth = 4;
        ctx.fillStyle = on ? '#fff6e0' : 'rgba(255,240,210,0.9)';
        ctx.font = font(F.cinzel, 700, 21);
        spaced(ctx, c.name.toUpperCase(), -42, 3, 4, 'right', 'both');
        ctx.fillStyle = on ? c.css : 'rgba(255,240,210,0.75)'; ctx.font = font(F.hud, 400, 12); ctx.lineWidth = 3;
        spaced(ctx, c.en.toUpperCase(), -42, 23, 3, 'right', 'both');
        // the metal column: lead grey until its sphere floods gold on beat 3; the next one up glows
        const flooded = t >= c.tm;
        const next = i > 0 && t >= CHAK[i - 1].tm && !flooded;
        const glow = next ? 0.5 + 0.5 * Math.sin((t - CHAK[i - 1].tm) * 9) : 0;
        const mx = -470;
        ctx.globalAlpha = a * txt * (flooded ? 1 : 0.55 + 0.45 * glow);
        if (flooded && t - c.tm < 0.5) { ctx.save(); ctx.globalAlpha *= 1 - (t - c.tm) / 0.5; ctx.drawImage(glowSprite(c.rgb), mx - 28 - 26, -6 - 26, 52, 52); ctx.restore(); }
        ctx.strokeStyle = flooded ? c.css : '#8d8a96';
        planet(ctx, c.planet, mx - 28, -6, 14, 2.4);
        ctx.strokeStyle = 'rgba(28,10,0,0.75)';
        ctx.fillStyle = flooded ? c.css : '#a8a4b0'; ctx.font = font(F.cinzel, 700, 20); ctx.lineWidth = 4;
        spaced(ctx, c.metalEn, mx - 4, 3, 3, 'left', 'both');
        ctx.fillStyle = flooded ? '#fff6e0' : '#a8a4b0'; ctx.font = font(F.min, 800, 18); ctx.lineWidth = 3;
        const kw = spaced(ctx, c.metalJp, mx - 4, 26, 2, 'left', 'both');
        ctx.font = font(F.hud, 400, 11);
        spaced(ctx, String(c.planet).toUpperCase(), mx + kw + 6, 25, 3, 'left', 'both');
      }
      ctx.restore();
    });
    if (txt > 0.01) {
      ctx.globalAlpha = a * txt;
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(28,10,0,0.75)'; ctx.lineWidth = 4;
      ctx.fillStyle = '#fff6e0'; ctx.font = font(F.hud, 400, 14);
      spaced(ctx, 'KUNDALINI', x + 20, y0 + 64, 4, 'right', 'both');
      spaced(ctx, 'METALLA', x - 470 + 130, y0 + 64, 4, 'right', 'both');
      ctx.font = font(F.hud, 400, 24);
      spaced(ctx, `${lit}/${CHAK.length}`, x + 20, y0 - dy * N - 42, 2, 'right', 'both');
      const fl = CHAK.filter((c) => t >= c.tm).length;
      spaced(ctx, `${fl}/${CHAK.length}`, x - 470 + 130, y0 - dy * N - 42, 2, 'right', 'both');
    }
    ctx.restore();
    return true;
  }
  // a soft round glow in one colour (60 units across), cached per colour and scale
  function glowSprite(rgb) {
    return cached(`glow|${rgb}|${s.toFixed(3)}`, () => {
      const n = Math.max(8, Math.ceil(60 * s)), c = newCanvas(n, n), g = c.getContext('2d');
      const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      gr.addColorStop(0, `rgba(${rgb},0.95)`); gr.addColorStop(0.3, `rgba(${rgb},0.55)`); gr.addColorStop(0.6, `rgba(${rgb},0.16)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
      return c;
    });
  }
  // a ring of spark glints (the metal stamps)
  function sparkRing(ctx, cx, cy, age, r0, r1, n, color = '255,236,170') {
    const k = clamp(age / 0.45);
    if (k >= 1) return;
    const r = mix(r0, r1, easeOut(k));
    for (let i = 0; i < n; i++) {
      const an = i / n * TAU + hash(i * 3.3) * 0.3;
      star(ctx, cx + Math.cos(an) * r, cy + Math.sin(an) * r * 0.8, 46 * (1 - k) + 8, (1 - k) * 0.9, an, color);
    }
  }
  function drawRollCall(ctx, t) {
    if (!HAS_ROLL) return false;
    if (t < CHAK[0].t || t >= T_BOLT + 3 * FRAME) return false;
    let drew = false;
    const sol = CHAK[CHAK.length - 1];
    // 金 / GOLD! across the full frame width, behind the cards, at 50 %
    if (t >= sol.tm) {
      const age = t - sol.tm;
      const out = remap(t, T_BOLT, T_BOLT + 3 * FRAME);
      const a = 0.5 * clamp(age / (3 * FRAME)) * (1 - out);
      const k = easeOut(age / 0.22), sc = mix(1.25, 1, k);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(960, 560); ctx.scale(sc, sc); ctx.translate(-960, -560);
      ctx.font = font(F.min, 800, 560);
      const gg = cached('goldKanjiGrad', () => { const g = ctx.createLinearGradient(0, 220, 0, 760); [[0, '#fff6cf'], [0.45, '#ffd34d'], [0.5, '#c07a12'], [1, '#ffd970']].forEach(([o, c]) => g.addColorStop(o, c)); return g; });
      ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a1000'; ctx.lineWidth = 14;
      const kw = measure(ctx, sol.metalJp || '金');
      const gw = sol.metalText.replace(/[^A-Z!]/g, '') || 'GOLD!';
      const bm = chromeWord(gw, 250, 'gold');
      // centred, but the chrome's ink (outline, extrusion, italic) stays left of the gauge's pips
      const inkR = kw + 40 + chromeInk(gw, 'gold').r * 2.5;
      const total = kw + 40 + bm.w, x0 = Math.min(960 - total / 2, 1770 - inkR);
      spaced(ctx, sol.metalJp || '金', x0, 760, 0, 'left', 'stroke');
      ctx.fillStyle = gg; spaced(ctx, sol.metalJp || '金', x0, 760);
      drawChrome(ctx, bm, x0 + kw + 40 + bm.w / 2, 640, 1, Math.exp(-age / 0.08) * 0.8);
      ctx.restore();
      drew = true;
    }
    // the planet cards: one per downbeat, slanted, slammed in from the left; the next pushes it off
    for (let i = 0; i < CHAK.length; i++) {
      const c = CHAK[i];
      const tOff = i + 1 < CHAK.length ? CHAK[i + 1].t : sol.tm;
      const tIn = i === 0 && W_HENSHIN && Math.abs(W_HENSHIN.a - c.t) < 0.05 ? c.t + BEAT : c.t;   // after the 変身 stamp
      if (t < tIn || t >= tOff + 0.16) continue;
      const kIn = easeOutBack(remap(t, tIn, tIn + 0.15), 1.2);
      const kOut = easeIn(remap(t, tOff, tOff + 0.16));
      ctx.save();
      ctx.translate(430 - (1 - kIn) * 1000 - kOut * 1150, 470 + kOut * 60);
      ctx.rotate(-12 * Math.PI / 180);
      planetCard(ctx, t, c);
      ctx.restore();
      drew = true;
    }
    return drew;
  }
  function planetCard(ctx, t, c) {
    const W2 = 300, H2 = 210;
    // plate
    ctx.fillStyle = 'rgba(12,6,2,0.8)';
    ctx.beginPath(); ctx.moveTo(-W2, -H2); ctx.lineTo(W2, -H2); ctx.lineTo(W2, H2); ctx.lineTo(-W2, H2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e8b830'; ctx.lineWidth = 3; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeRect(-W2 + 10, -H2 + 10, W2 * 2 - 20, H2 * 2 - 20);
    ctx.fillStyle = c.css; ctx.fillRect(-W2, -H2, 14, H2 * 2);
    // numeral of the rung + tag
    ctx.fillStyle = '#e8b830'; ctx.font = font(F.cinzel, 700, 20);
    spaced(ctx, roman(c.i + 1), -W2 + 34, -H2 + 40, 4);
    ctx.font = font(F.hud, 400, 11); ctx.fillStyle = 'rgba(255,236,190,0.75)';
    spaced(ctx, `${String(c.en).toUpperCase()} · ${String(c.name).toUpperCase()}`, W2 - 28, -H2 + 36, 3, 'right');
    // the planet kanji, huge, in the chakra colour with a black outline
    const age = t - c.t;
    const kk = easeOut(age / 0.12), sc = mix(1.3, 1, kk);
    ctx.save();
    ctx.translate(0, -30); ctx.scale(sc, sc); ctx.translate(0, 30);
    ctx.font = font(F.min, 800, 176); ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 12;
    spaced(ctx, c.planetJp, 0, 40, 4, 'center', 'stroke');
    ctx.fillStyle = c.css; spaced(ctx, c.planetJp, 0, 40, 4, 'center');
    ctx.restore();
    // glyph + English name
    ctx.font = font(F.cinzel, 900, 58);
    const nm = c.planetEn;
    const nw = measure(ctx, nm, 10);
    const gx = -(nw + 70) / 2;
    ctx.strokeStyle = c.css; planet(ctx, c.planet, gx + 24, 116, 24, 4);
    ctx.fillStyle = '#fff6e0'; spaced(ctx, nm, gx + 70, 138, 10);
    // on beat 3 the metal stamps under the card in gold chrome, with a ring of sparks
    if (t >= c.tm && c.i < CHAK.length - 1) {
      const ma = t - c.tm, mk = easeOut(ma / 0.12), ms = mix(1.6, 1, mk);
      const bm = chromeWord(c.metalEn, 84, 'gold');
      ctx.save();
      ctx.translate(40, 300); ctx.scale(ms, ms); ctx.translate(-40, -300);
      ctx.font = font(F.min, 800, 120); ctx.lineJoin = 'round';
      const kw = measure(ctx, c.metalJp);
      const total = kw + 26 + bm.w, x0 = 40 - total / 2;
      const gg = cached('metalKanjiGrad', () => { const g = ctx.createLinearGradient(0, 220, 0, 340); [[0, '#fff6cf'], [0.45, '#ffd34d'], [0.5, '#c07a12'], [1, '#ffd970']].forEach(([o, col]) => g.addColorStop(o, col)); return g; });
      ctx.strokeStyle = '#1a0800'; ctx.lineWidth = 10;
      spaced(ctx, c.metalJp, x0, 338, 0, 'left', 'stroke');
      ctx.fillStyle = gg; spaced(ctx, c.metalJp, x0, 338);
      drawChrome(ctx, bm, x0 + kw + 26 + bm.w / 2, 330, 1, Math.exp(-ma / 0.07) * 0.9);
      ctx.restore();
      sparkRing(ctx, 40, 290, ma, 80, 330, 12);
    }
  }
  // 変身: stamped on the downbeat with focus lines, then scaled up and faded (the transformation)
  function drawHenshin(ctx, t) {
    const w = W_HENSHIN;
    if (!w || t < w.a || t >= w.a + 2 * BEAT) return false;
    const age = t - w.a;
    // stamped, held for most of a beat, then it swells to 1.55x while it fades (the fade trails the
    // growth, so the transformation reads)
    const grow = easeOut(remap(age, 0.75 * BEAT, 1.9 * BEAT));
    focusLines(ctx, t, 560 + 300 * grow, 0.75 * (1 - remap(age, 0.6 * BEAT, 1.4 * BEAT)));
    const k = easeOut(age / 0.12), sc = mix(1.3, 1, k) * mix(1, 1.55, grow);
    ctx.save();
    ctx.globalAlpha = 1 - easeIn(remap(age, 0.85 * BEAT, 1.75 * BEAT));
    ctx.translate(960, 540); ctx.scale(sc, sc); ctx.translate(-960, -540);
    ctx.font = font(F.min, 800, 360); ctx.lineJoin = 'round';
    const g = cached('henshinGrad', () => { const gg = ctx.createLinearGradient(0, 300, 0, 680); gg.addColorStop(0, '#d6191b'); gg.addColorStop(0.55, '#ff7a1c'); gg.addColorStop(1, '#ffd34d'); return gg; });
    ctx.strokeStyle = '#120404'; ctx.lineWidth = 30; spaced(ctx, '変身', 960, 668, 10, 'center', 'stroke');
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 14; spaced(ctx, '変身', 960, 668, 10, 'center', 'stroke');
    ctx.fillStyle = g; spaced(ctx, '変身', 960, 668, 10, 'center');
    ctx.font = font(F.cinzel, 900, 40); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#120404'; ctx.lineWidth = 8;
    spaced(ctx, 'HENSHIN', 960, 760, 30, 'center', 'both');
    ctx.restore();
    return true;
  }

  // ================================================================ 7. riff chops: stencil chrome, upper third
  const CHOP_TEXT = { mag: 'MAG', num: 'NUM', oh: 'O', pus: 'PUS', whole: 'WHOLE!' };
  const CHOPS = arr(V.chops).map((c) => {
    const t0 = barT(c.bar);
    const syl = arr(c.syllables).map(([sy, st]) => ({ text: CHOP_TEXT[String(sy).toLowerCase()] || String(sy).toUpperCase(), t: barT(c.bar, st) }));
    const first = syl.length ? syl[0].t : t0;
    const w = within(W_CHOP, first + 1e-4);
    return w ? { syl, t0: first, t1: Math.min(barT(c.bar + 1), w.b + 0.001), kind: styleOf(stageAt(t0 + 1e-3).id).chrome } : null;
  }).filter(Boolean);
  const CHOP_PX = 120;
  function chopLayout(ch) {
    return cached('chop|' + ch.t0, () => {
      mctx.font = font(F.chrome, 900, 100);
      const ws = ch.syl.map((x) => measure(mctx, x.text, 1.2) * CHOP_PX / 100);
      const gap = 46, total = ws.reduce((p, q) => p + q, 0) + gap * (ws.length - 1);
      let x = 960 - total / 2;
      return ch.syl.map((sy, i) => { const o = { ...sy, cx: x + ws[i] / 2, rot: (hash(i * 5.1 + ch.t0) - 0.5) * 0.09 }; x += ws[i] + gap; return o; });
    });
  }
  function drawChops(ctx, t) {
    const ch = CHOPS.find((c) => t >= c.t0 && t < c.t1);
    if (!ch) return false;
    const out = remap(t, ch.t1 - 3 * FRAME, ch.t1);
    const inWheel = inside(W_WHEEL, t);
    const base = inWheel ? 648 : 296;                  // in the wheel of trumps' empty hub while it turns (centre y 616)
    ctx.save();
    ctx.globalAlpha = 1 - out;
    if (inWheel) { ctx.translate(960, base - 40); ctx.scale(0.6, 0.6); ctx.translate(-960, -(base - 40)); }
    for (const sy of chopLayout(ch)) {
      const age = t - sy.t;
      if (age < 0) continue;
      const bm = chromeWord(sy.text, CHOP_PX, ch.kind, true);
      const k = easeOut(age / 0.08), sc = mix(1.55, 1, k) * (1 + 0.04 * MO.env('kick', t, 0.1));
      ctx.save();
      ctx.translate(sy.cx, base - 40); ctx.rotate(sy.rot * (1 - k * 0.5)); ctx.translate(-sy.cx, -(base - 40));
      if (age < 0.25) {     // a thin shock ring
        const kk = age / 0.25;
        ctx.save(); ctx.globalAlpha *= (1 - kk) * 0.7; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6 * (1 - kk) + 1;
        ctx.beginPath(); ctx.ellipse(sy.cx, base - 40, bm.w * 0.6 + kk * 260, (bm.w * 0.6 + kk * 260) * 0.3, 0, 0, TAU); ctx.stroke(); ctx.restore();
      }
      drawChrome(ctx, bm, sy.cx, base, sc, Math.exp(-age / 0.06) * 0.85);
      ctx.restore();
    }
    ctx.restore();
    return true;
  }

  // ================================================================ 8. lyrics
  // ---- cold open: ghost (Cinzel 500, bone, each word fading in from a blur on its step)
  const GHOST = arr(V.sung).filter((l) => l.part === 'cold' || l.style === 'ghost').map((line) => {
    const w = within(W_GHOST, barT(line.bar) + 1e-4);
    return w ? { line, jp: line.jp, toks: tokens(line).map((k) => ({ ...k, t: barT(line.bar, k.step) - FRAME })), t0: barT(line.bar) - 2 * FRAME, w } : null;
  }).filter(Boolean);
  GHOST.forEach((l, i) => { const n = GHOST[i + 1]; l.t1 = n && n.w === l.w ? n.t0 : l.w.b; l.cut = !(n && n.w === l.w); });
  function drawGhost(ctx, t) {
    const line = GHOST.find((l) => t >= l.t0 && t < l.t1);
    if (!line) return false;
    const out = line.cut ? 0 : remap(t, line.t1 - 0.22, line.t1);   // the last line cuts with the audio
    ctx.save();
    ctx.globalAlpha = 0.6 * (1 - out) * easeOut(remap(t, line.t0, line.t0 + 0.2));
    ctx.fillStyle = '#ece5da'; ctx.font = font(F.min, 800, 28);
    spaced(ctx, line.jp || '', 960, 846, 8, 'center');
    ctx.font = font(F.cinzel, 500, 58);
    const sp = 14, space = measure(ctx, ' ', 0) + sp;
    const ws = line.toks.map((k) => measure(ctx, k.text, sp));
    const total = ws.reduce((p, q) => p + q, 0) + space * (ws.length - 1);
    let x = 960 - total / 2;
    line.toks.forEach((k, i) => {
      const age = t - k.t;
      if (age >= 0) {
        const u = clamp(age / (5 * FRAME));
        ctx.globalAlpha = 0.75 * u * (1 - out);
        if (HAS_FILTER && u < 1) ctx.filter = `blur(${(6 * (1 - u) * s).toFixed(2)}px)`;
        ctx.fillStyle = '#ece5da';
        spaced(ctx, k.text, x, 900, sp);
        ctx.filter = 'none';
      }
      x += ws[i] + space;
    });
    ctx.restore();
    return true;
  }

  // ---- fansub (rap verses, whisper) and hype
  // A subtitle must never arrive after its word is heard. Every word leads its score step by two
  // frames, and words that open on a long consonant lead by that consonant's length plus one frame.
  // PRE_ROLL: seconds of audible consonant before the step, measured on the rap stem (30 s build).
  const PRE_ROLL = { Shadow: 0.059, Holy: 0.059, to: 0.045, Self: 0.087, left: 0.030, light: 0.024 };
  // line.preRoll (seconds per word, measured on the full soundtrack: audio/timing.json) wins when present
  const lead = (word, pr) => Math.max(2 * FRAME, (Number.isFinite(pr) ? pr : PRE_ROLL[word] || 0) + FRAME);
  const RAP = arr(V.rap).filter((l) => l.style !== 'shout').map((line) => {
    const w = within(W_SUB, barT(line.bar) + 1e-4);
    if (!w) return null;
    const pre = Array.isArray(line.preRoll) && line.preRoll.length === arr(line.words).length ? line.preRoll : null;
    const toks = tokens(line).map((k, i) => ({ ...k, t: barT(line.bar, k.step) - lead(k.word, pre ? pre[i] : undefined) }));
    return { line, style: line.style || 'verse', jp: line.jp || '', toks, t0: Math.min(...toks.map((k) => k.t)), w, st: stageAt(barT(line.bar) + 1e-3) };
  }).filter(Boolean);
  RAP.forEach((l, i) => { const n = RAP[i + 1]; l.t1 = n && n.w === l.w ? Math.min(n.t0, l.w.b) : l.w.b; l.last = !(n && n.w === l.w); });
  // the fresh-word tint (it settles to white): pale blue under the violet accent, pale gold under
  // the ice accent of verse 2, so the step-8 accent word still stands out
  const FRESH = { nigredo: [150, 228, 255], albedo: [255, 226, 150], citrinitas: [150, 228, 255], rubedo: [150, 228, 255], opus: [150, 228, 255] };
  function drawRap(ctx, t) {
    const line = RAP.find((l) => t >= l.t0 && t < l.t1);
    if (!line) return false;
    if (line.style === 'hype') return drawHype(ctx, t, line);
    const whisper = line.style === 'whisper';
    const acc = styleOf(line.st.id).acc;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    const al = whisper ? 0.7 * gate(t, line.t0, line.t1, 0.12, 0.25) : 1;
    ctx.globalAlpha = al;
    if (whisper) { ctx.translate(960, 980); ctx.transform(1, 0, -0.2, 1, 0, 0); ctx.translate(-960, -980); }
    ctx.font = font(F.round, 800, 38);
    ctx.strokeStyle = 'rgba(4,6,20,0.92)'; ctx.lineWidth = 7; ctx.fillStyle = whisper ? '#e2dcff' : '#d9ecff';
    spaced(ctx, line.jp, 960, 928, 4, 'center', 'both');
    ctx.font = font(F.round, 800, 62);
    const space = measure(ctx, ' ', 0);
    const widths = line.toks.map((k) => measure(ctx, k.text, 0));
    const total = widths.reduce((p, q) => p + q, 0) + space * (widths.length - 1);
    let x = 960 - total / 2;
    const y = 1004;
    line.toks.forEach((k, i) => {
      const age = t - k.t;
      if (age >= 0) {
        const stress = k.step === 8 && !whisper;          // the step-8 word pops in the stage accent
        const kk = easeOut(age / (5 * FRAME)), sc = mix(stress ? 1.12 : 1.06, 1, kk);
        const cx = x + widths[i] / 2;
        ctx.save();
        ctx.translate(cx, y - 22); ctx.scale(sc, sc); ctx.translate(-cx, -(y - 22));
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 12;
        ctx.strokeText(k.text, x + 3, y + 4);
        ctx.strokeStyle = '#05040c'; ctx.lineWidth = 10;
        ctx.strokeText(k.text, x, y);
        const hl = Math.exp(-age / 0.22), fr = FRESH[line.st.id] || FRESH.nigredo;
        ctx.fillStyle = stress ? acc : whisper ? '#f0ecff' : hl > 0.02 ? `rgb(${fr.map((v) => Math.round(mix(255, v, hl))).join(',')})` : '#fff';
        ctx.fillText(k.text, x, y);
        ctx.restore();
      }
      x += widths[i] + space;
    });
    ctx.restore();
    return true;
  }
  // hype: M+ Rounded 84 px, white with a red outline, each word slams; the last line of the window
  // ('everybody sing!') switches to rainbow chrome, bridging into the final hook
  function drawHype(ctx, t, line) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    ctx.font = font(F.round, 800, 38);
    ctx.strokeStyle = 'rgba(30,0,4,0.92)'; ctx.lineWidth = 7; ctx.fillStyle = '#ffe2d6';
    spaced(ctx, line.jp, 960, line.last ? 1040 : 842, 4, 'center', 'both');
    if (line.last) {
      // chrome: EVERYBODY SING!
      const toks = line.toks.map((k) => ({ ...k, up: k.text.toUpperCase() }));
      const lay = cached('hypeChrome|' + line.t0, () => {
        mctx.font = font(F.chrome, 900, 100);
        const ws = toks.map((k) => measure(mctx, k.up, 1.2) * 0.9);
        const space = 34, tot = ws.reduce((p, q) => p + q, 0) + space * (ws.length - 1);
        const px = Math.min(190, 100 * 1700 / tot), kk = px / 100;
        let x = 960 - tot * kk / 2;
        return { px, items: toks.map((k, i) => { const o = { ...k, cx: x + ws[i] * kk / 2 }; x += (ws[i] + space) * kk; return o; }) };
      });
      for (const it of lay.items) {
        const age = t - it.t;
        if (age < 0) continue;
        const bm = chromeWord(it.up, lay.px, 'rainbow');
        const sc = 1 + 0.9 * Math.exp(-age * 30) * Math.cos(34 * age);
        drawChrome(ctx, bm, it.cx, 960, sc, Math.exp(-age / 0.06) * 0.85, 0.9);
      }
      ctx.restore();
      return true;
    }
    ctx.font = font(F.round, 800, 84);
    const space = measure(ctx, ' ', 0);
    const widths = line.toks.map((k) => measure(ctx, k.text, 0));
    const total = widths.reduce((p, q) => p + q, 0) + space * (widths.length - 1);
    let x = 960 - total / 2;
    const y = 929;
    line.toks.forEach((k, i) => {
      const age = t - k.t;
      if (age >= 0) {
        const kk = easeOut(age / (3 * FRAME)), sc = mix(1.4, 1, kk);
        const cx = x + widths[i] / 2;
        ctx.save();
        ctx.translate(cx, y - 30); ctx.scale(sc, sc); ctx.translate(-cx, -(y - 30));
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 20; ctx.strokeText(k.text, x + 4, y + 5);
        ctx.strokeStyle = '#120204'; ctx.lineWidth = 19; ctx.strokeText(k.text, x, y);
        ctx.strokeStyle = '#ff3a2a'; ctx.lineWidth = 12; ctx.strokeText(k.text, x, y);
        ctx.fillStyle = '#ffffff'; ctx.fillText(k.text, x, y);
        ctx.restore();
      }
      x += widths[i] + space;
    });
    ctx.restore();
    return true;
  }

  // ---- pre-chorus: the lift (Cinzel 700 skewed, gold glow, a rising baseline; YOU! in chrome-white)
  const LIFT = arr(V.sung).filter((l) => l.part === 'pre').map((line) => {
    const w = within(W_LIFT, barT(line.bar) + 1e-4);
    return w ? { line, jp: line.jp || '', toks: tokens(line).map((k) => ({ ...k, t: barT(line.bar, k.step) - FRAME })), t0: barT(line.bar) - 2 * FRAME, w } : null;
  }).filter(Boolean);
  LIFT.forEach((l, i) => {
    const n = LIFT[i + 1];
    l.t1 = n && n.w === l.w ? n.t0 : l.w.b;
    l.j = LIFT.slice(0, i).filter((q) => q.w === l.w).length;     // line index in its pre-chorus
    l.last = !(n && n.w === l.w);
  });
  // a cached glow bitmap of a word (the gold glow is expensive to blur every frame)
  function glowWord(str, pxU, fam, w8, glow, blurU, spU = 0) {
    return bigCached(`gw|${str}|${pxU}|${fam}|${glow}|${blurU}|${spU}|${s.toFixed(3)}`, () => {
      const px = pxU * s, bl = blurU * s;
      mctx.font = font(fam, w8, px);
      const tw = measure(mctx, str, spU * s);
      const pad = Math.ceil(bl * 2.2 + px * 0.2);
      const c = newCanvas(tw + pad * 2, px * 1.4 + pad * 2), g = c.getContext('2d');
      g.font = mctx.font; g.textBaseline = 'alphabetic';
      if (HAS_LS) g.letterSpacing = (spU * s) + 'px';
      g.shadowColor = glow; g.shadowBlur = bl; g.fillStyle = glow;
      g.fillText(str, pad, pad + px);
      g.shadowBlur = 0;
      return { c, ox: pad / s, oy: (pad + px) / s, cw: c.width / s, ch: c.height / s, w: tw / s, px: c.width * c.height };
    });
  }
  function drawLift(ctx, t) {
    const line = LIFT.find((l) => t >= l.t0 && t < l.t1);
    if (!line) return false;
    ctx.save();
    const base = 960 - 20 * line.j;
    const SKEW = -Math.tan(10 * Math.PI / 180);
    ctx.font = font(F.cinzel, 700, 64);
    const space = measure(ctx, ' ', 0) + 6;
    const items = line.toks.map((k, i) => {
      const you = line.last && i === line.toks.length - 1;
      const text = you ? k.text.toUpperCase() : k.text;
      const w = you ? chromeWord(text, 102, 'silver').w * 0.92 : measure(ctx, text, 2);
      return { ...k, text, you, w };
    });
    // the JP sits 26 units above the highest settled word top of the whole line (the rising
    // baseline and the 1.6x YOU! chrome included), so it never moves while the line builds
    const jpBase = cached('liftJp|' + line.t0, () => {
      let top = Infinity;
      items.forEach((k, i) => {
        const y = base - 14 * i;
        if (k.you) { const bm = chromeWord(k.text, 102, 'silver'); top = Math.min(top, y + 8 - bm.capH - 102 * (KINDS.silver.black / 2 + KINDS.silver.rimW)); }
        else top = Math.min(top, y - 64 * 0.72 - 6);
      });
      return Math.min(base - 112, top - 26);
    });
    ctx.globalAlpha = easeOut(remap(t, line.t0, line.t0 + 0.12));
    ctx.font = font(F.min, 800, 30); ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20,8,0,0.85)'; ctx.lineWidth = 6; ctx.fillStyle = '#ffe9b8';
    spaced(ctx, line.jp, 960, jpBase, 8, 'center', 'both');
    ctx.globalAlpha = 1;
    ctx.font = font(F.cinzel, 700, 64);
    const total = items.reduce((p, q) => p + q.w, 0) + space * (items.length - 1);
    let x = 960 - total / 2;
    items.forEach((k, i) => {
      const age = t - k.t;
      const y = base - 14 * i;
      if (age >= 0) {
        const kk = easeOut(age / (4 * FRAME)), sc = mix(k.you ? 1.5 : 1.15, 1, kk);
        const cx = x + k.w / 2;
        ctx.save();
        ctx.translate(cx, y - 24); ctx.scale(sc, sc); ctx.transform(1, 0, SKEW, 1, 0, 0); ctx.translate(-cx, -(y - 24));
        if (k.you) {
          drawChrome(ctx, chromeWord(k.text, 102, 'silver'), cx, y + 8, 1, Math.exp(-age / 0.07) * 0.9, 0.92);
        } else {
          const gw = glowWord(k.text, 64, F.cinzel, 700, '#ffd27a', 18, 2);
          ctx.globalAlpha = 0.85;
          ctx.drawImage(gw.c, x - gw.ox, y - gw.oy, gw.cw, gw.ch);
          ctx.globalAlpha = 1;
          ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(30,10,0,0.8)'; ctx.lineWidth = 7;
          spaced(ctx, k.text, x, y, 2, 'left', 'stroke');
          ctx.fillStyle = '#ffffff';
          spaced(ctx, k.text, x, y, 2);
        }
        ctx.restore();
      }
      x += k.w + space;
    });
    ctx.restore();
    return true;
  }

  // ---- bridge: tategaki (one column per line on its downbeat) + a small English line
  const BRIDGE = arr(V.sung).filter((l) => l.part === 'bridge').map((line) => {
    const w = within(W_BRIDGE, barT(line.bar) + 1e-4);
    return w ? { line, jp: line.jp || '', text: line.text, t0: barT(line.bar), w } : null;
  }).filter(Boolean);
  BRIDGE.forEach((l, i) => { l.col = BRIDGE.slice(0, i).filter((q) => q.w === l.w).length; const n = BRIDGE[i + 1]; l.t1 = n && n.w === l.w ? n.t0 : l.w.b; });
  // the columns start at x 1660 (not 1700) so the character caption at the right edge (隠者 THE
  // HERMIT, rule at x 1800) keeps a clear gutter
  const BRIDGE_X = 1660, BRIDGE_XFADE = 0.22;
  function drawBridge(ctx, t) {
    const w = within(W_BRIDGE, t);
    if (!w) return false;
    const lines = BRIDGE.filter((l) => l.w === w && t >= l.t0 - 0.05);
    if (!lines.length) return false;
    const out = remap(t, w.b - 0.5, w.b);
    ctx.save();
    ctx.lineJoin = 'round';
    for (const l of lines) {
      const a = easeOut(remap(t, l.t0 - 0.05, l.t0 + 0.45)) * (1 - out);
      ctx.globalAlpha = a * 0.8;
      ctx.font = font(F.min, 800, 44);
      ctx.strokeStyle = 'rgba(10,8,24,0.7)'; ctx.lineWidth = 6; ctx.fillStyle = '#f4ecd8';
      vtext(ctx, l.jp, BRIDGE_X - l.col * 66, 150, 44, 1.04, 'both');
    }
    // the English line: the old one is gone by the next line's downbeat (out over BRIDGE_XFADE),
    // the new one fades in from it and rises 14 units, so two lines never share the spot
    ctx.font = font(F.cinzel, 600, 38); ctx.strokeStyle = 'rgba(10,8,24,0.85)'; ctx.lineWidth = 7; ctx.fillStyle = '#f4ecd8';
    const all = BRIDGE.filter((l) => l.w === w);
    for (let i = 0; i < all.length; i++) {
      const l = all[i], n = all[i + 1];
      if (t < l.t0 || (n && t >= n.t0)) continue;
      const kin = easeOut(remap(t, l.t0, l.t0 + 0.45));
      const kout = n ? MO.smooth(remap(t, n.t0 - BRIDGE_XFADE, n.t0)) : out;
      const a = kin * (1 - kout);
      if (a <= 0.004) continue;
      ctx.globalAlpha = a;
      spaced(ctx, l.text, 960, 1010 + 14 * (1 - kin), 6, 'center', 'both');
    }
    ctx.restore();
    return true;
  }

  // ---- the Hermit: lantern serif (amber Cinzel, words fade in; 'wake' holds), JP in tategaki
  const HERMIT = arr(V.spoken).map((line) => {
    const w = within(W_HERMIT, barT(line.bar) + 1e-4);
    return w ? { line, jp: line.jp || '', toks: tokens(line).map((k) => ({ ...k, t: barT(line.bar, k.step) - FRAME })), t0: barT(line.bar) - 2 * FRAME, w } : null;
  }).filter(Boolean);
  HERMIT.forEach((l, i) => { const n = HERMIT[i + 1]; l.t1 = n && n.w === l.w ? n.t0 : l.w.b; l.last = !(n && n.w === l.w); l.col = HERMIT.slice(0, i).filter((q) => q.w === l.w).length; });
  // 'wake' (the window's last word) holds alone: the other words fade from its onset, it stays at
  // full strength with an amber glow to the window's end and fades over HERMIT_TAIL after it
  const HERMIT_TAIL = 0.45;
  function drawHermit(ctx, t) {
    let w = within(W_HERMIT, t);
    const tail = !w;
    if (tail) w = W_HERMIT.find((x) => t >= x.b && t < x.b + HERMIT_TAIL);
    if (!w) return false;
    const outW = tail ? 1 : remap(t, w.b - 0.4, w.b);
    const line = tail ? HERMIT.filter((l) => l.w === w).pop() : HERMIT.find((l) => t >= l.t0 && t < l.t1);
    ctx.save();
    ctx.lineJoin = 'round';
    // JP columns at the right edge
    if (!tail) {
      for (const l of HERMIT.filter((q) => q.w === w && t >= q.t0)) {
        ctx.globalAlpha = 0.85 * easeOut(remap(t, l.t0, l.t0 + 0.4)) * (1 - outW);
        ctx.font = font(F.min, 800, 40); ctx.strokeStyle = 'rgba(20,10,0,0.7)'; ctx.lineWidth = 6; ctx.fillStyle = '#ffe6bf';
        vtext(ctx, l.jp, 1834 - l.col * 62, 170, 40, 1.04, 'both');
      }
    }
    if (line) {
      const lastK = line.toks[line.toks.length - 1];
      const holdT = line.last ? lastK.t + 2 * FRAME : Infinity;     // from 'wake' the others fade
      const holdOut = line.last ? 1 - MO.smooth(remap(t, w.b, w.b + HERMIT_TAIL)) : 1;
      ctx.save();
      ctx.globalAlpha = line.last ? easeOut(remap(t, line.t0, line.t0 + 0.25)) * mix(1, 0.7, remap(t, holdT, holdT + 0.25)) * holdOut
        : gate(t, line.t0, line.t1, 0.25, 0.3) * (1 - outW);
      plate(ctx, 260, 700, 1400, 150, 'rgba(14,6,0,', 'c', 0.55);
      ctx.restore();
      ctx.font = font(F.cinzel, 600, 64);
      const sp = 4, space = measure(ctx, ' ', 0) + sp;
      const ws = line.toks.map((k) => measure(ctx, k.text, sp));
      const total = ws.reduce((p, q) => p + q, 0) + space * (ws.length - 1);
      let x = 960 - total / 2;
      line.toks.forEach((k, i) => {
        const age = t - k.t;
        if (age >= 0) {
          const isHold = line.last && k === lastK;
          let a = clamp(age / (4 * FRAME));
          if (isHold) a *= holdOut;
          else if (line.last) a *= 1 - easeOut(remap(t, holdT, holdT + 0.25));
          else a *= (1 - remap(t, line.t1 - 0.2, line.t1)) * (1 - outW);
          if (a > 0.004) {
            ctx.globalAlpha = a;
            if (isHold) {           // the lantern glow: a cached blurred copy, breathing slowly
              const gw = glowWord(k.text, 64, F.cinzel, 600, 'rgba(255,196,110,0.95)', 24, sp);
              ctx.save(); ctx.globalAlpha = a * (0.65 + 0.35 * Math.sin(age * 3));
              ctx.drawImage(gw.c, x - gw.ox, 800 - gw.oy, gw.cw, gw.ch);
              ctx.restore();
            }
            ctx.strokeStyle = 'rgba(30,14,0,0.8)'; ctx.lineWidth = 7; ctx.fillStyle = isHold ? '#ffe2b0' : '#ffd9a0';
            spaced(ctx, k.text, x, 800, sp, 'left', 'both');
          }
        }
        x += ws[i] + space;
      });
    }
    ctx.restore();
    return true;
  }

  // ---- the hook: giant chrome karaoke (silver, gold, rainbow), with WHOLE! held and shattered
  const HOOK = (() => {
    const out = [];
    let run = 0;
    arr(V.hook).forEach((line, i, all) => {
      const prev = all[i - 1];
      run = prev && prev.bar === line.bar - 1 && prev.part === line.part ? run + 1 : 0;
      const t0 = barT(line.bar);
      const w = within(W_HOOK, t0 + 1e-4);
      if (!w) return;
      out.push({
        li: out.length, li4: run % 4, part: line.part || 'A', kind: line.chrome || 'rainbow', jp: line.jp || '', w, t0,
        t1: barT(line.bar + 1), notes: arr(line.notes),
        toks: tokens(line).map((k) => ({ text: k.text.toUpperCase(), t: barT(line.bar, k.step) })),
      });
    });
    out.forEach((l, i) => {
      const n = out[i + 1];
      const lastInWin = !(n && n.w === l.w);
      // the last line of a window that runs past its bar: its last word is held, grows and shatters
      if (lastInWin && l.w.b > l.t1 + 0.05) { l.hold = { tGrow: l.toks[l.toks.length - 1].t, tShatter: l.t1, end: l.w.b }; l.t1 = l.w.b; }
    });
    return out;
  })();
  const HOOK_MAX = [172, 172, 250, 272], SQ = 0.9;   // SQ: horizontal condensing of the chrome
  // the ink of a chrome word at 100 px, from its text origin: glyph ink (italic overhang included)
  // plus the rim + black outline (half the stroke) and, on the right, the extrusion
  function chromeInk(str, kind = 'rainbow') {
    return cached(`cink|${kind}|${str}`, () => {
      const K = kindOf(kind);
      mctx.font = font(K.fam, 900, 100);
      if (HAS_LS) mctx.letterSpacing = (100 * K.sp) + 'px';
      const m = mctx.measureText(str);
      mctx.letterSpacing = '0px';
      const halo = (100 * K.black + 100 * K.rimW * 2) / 2;
      return { l: (m.actualBoundingBoxLeft || 0) + halo, r: (m.actualBoundingBoxRight || m.width) + halo + 100 * K.depth * 0.45 + 2 };
    });
  }
  // a settled hook line keeps at least HOOK_MARGIN units of clear frame each side of its ink (the
  // trump rail lives in the left 60), so the boosts only apply where they still fit
  const HOOK_MARGIN = 130;
  function hookLayout(line) {
    return cached('hook-layout|' + line.li, () => {
      mctx.font = font(F.chrome, 900, 100);
      const ws = line.toks.map((w) => measure(mctx, w.text, 1.2) * SQ);
      const space = 34;
      const total = ws.reduce((p, q) => p + q, 0) + space * (ws.length - 1);
      // ink extent of the whole line at 100 px, relative to the first word's origin
      const ink0 = chromeInk(line.toks[0].text, line.kind), inkN = chromeInk(line.toks[line.toks.length - 1].text, line.kind);
      const inkL = -ink0.l * SQ, inkR = total - ws[ws.length - 1] + inkN.r * SQ;
      const boost = (line.kind === 'rainbow' && arr(S.trumps).length ? 1.1 : 1) * (line.kind === 'rainbow' && line.part === 'B' ? 1.08 : 1);
      const px = Math.min(HOOK_MAX[line.li4] * boost, 100 * (1920 - 2 * HOOK_MARGIN) / (inkR - inkL)), k = px / 100;
      let x = 960 - (inkL + inkR) * k / 2;                 // the ink, not the advance, is centred
      const words = line.toks.map((w, i) => { const o = { ...w, x, w: ws[i] * k }; x += (ws[i] + space) * k; return o; });
      return { px, words, base: line.li4 >= 2 ? 884 : 862 };
    });
  }
  const JP_FILL = { rainbow: '#fff3d2', silver: '#eef7ff', gold: '#fff3c4', lead: '#ece5da', logo: '#fff3d2' };
  const RING = { rainbow: ['#d8f2ff', '#fff3c4'], silver: ['#e6f6ff', '#ffffff'], gold: ['#fff1c0', '#ffd34d'], lead: ['#e2d6ff', '#e2d6ff'], logo: ['#fff3c4', '#fff3c4'] };
  function drawHookLine(ctx, t, line) {
    const lay = hookLayout(line);
    const big = line.li4 >= 2;
    const hold = line.hold && t >= line.hold.tGrow + 0.12 ? line.hold : null;
    const growK = hold ? easeInOut(remap(t, hold.tGrow + 0.12, hold.tGrow + 0.12 + BEAT * 1.1)) : 0;
    const kp = 1 + 0.03 * MO.env('kick', t, 0.1) + (line.li4 === 3 ? 0.05 * MO.env('clap', t, 0.08) * remap(t, barT(Math.round(line.t0 / BAR) + 1) - BEAT * 1.05, barT(Math.round(line.t0 / BAR) + 1) - BEAT) : 0);
    let shx = 0;
    if (line.li4 === 3 && !MO.reduced && !hold) shx = 9 * MO.env('clap', t, 0.06) * (MO.count('clap', t) % 2 ? 1 : -1);
    ctx.save();
    ctx.translate(960 + shx, lay.base - lay.px * 0.3); ctx.scale(kp, kp); ctx.translate(-960, -(lay.base - lay.px * 0.3));
    // the two big bars: a laser sunburst behind each word as it lands (rainbow; silver and gold in their metal)
    if (big) {
      for (const w of lay.words) {
        const age = t - w.t;
        if (age < 0 || age > 0.7) continue;
        const k = Math.exp(-age / 0.2) * (MO.reduced ? 0.15 : line.kind === 'rainbow' ? 1 : 0.6);
        const cx = w.x + w.w / 2, cy = lay.base - lay.px * 0.35;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(age * 0.5 + w.t);
        const N = 22, R0 = 40 + 700 * easeOut(age / 0.5), R = 260 + 1700 * easeOut(age / 0.25);
        ctx.lineCap = 'round';
        for (let i = 0; i < N; i++) {
          const an = (i + 0.5 * hash(i + w.t)) / N * TAU, ca = Math.cos(an), sa = Math.sin(an);
          ctx.beginPath(); ctx.moveTo(ca * R0, sa * R0); ctx.lineTo(ca * R, sa * R);
          const hue = line.kind === 'rainbow' ? (i / N * 360 + age * 300) % 360 : line.kind === 'gold' ? 38 + 14 * Math.sin(i) : 205 + 12 * Math.sin(i);
          const sat = line.kind === 'rainbow' ? 100 : line.kind === 'gold' ? 95 : 70;
          ctx.strokeStyle = `hsla(${hue},${sat}%,60%,${0.45 * k})`; ctx.lineWidth = 12; ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`; ctx.lineWidth = 2.5; ctx.stroke();
        }
        ctx.restore();
      }
    }
    const lastW = lay.words[lay.words.length - 1];
    lay.words.forEach((w, wi) => {
      const age = t - w.t;
      if (age < 0) return;
      const isHeld = hold && wi === lay.words.length - 1;
      if (isHeld) return;                        // drawn below, outside the line's pump
      const bm = chromeWord(w.text, lay.px, line.kind);
      const cx = w.x + w.w / 2, cy = lay.base - bm.capH * 0.5, ix = cx - bm.w / 2 - bm.ox, iy = lay.base - bm.oy;
      const sc = 1 + 1.0 * Math.exp(-age * 30) * Math.cos(34 * age);
      const fade = hold ? 1 - growK : 1;
      if (fade <= 0.01) return;
      if (age < 0.28) {
        const k = age / 0.28;
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.85 * fade;
        ctx.strokeStyle = RING[line.kind] ? RING[line.kind][big ? 1 : 0] : '#fff'; ctx.lineWidth = 10 * (1 - k) + 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, w.w * 0.55 + k * 520, (w.w * 0.55 + k * 520) * 0.28, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      if (age < 0.09) {
        ctx.save(); ctx.globalAlpha = 0.28 * (1 - age / 0.09);
        const g = sc * 1.35;
        ctx.translate(cx, cy); ctx.scale(g * SQ, g); ctx.translate(-cx, -cy);
        ctx.drawImage(bm.c, ix, iy, bm.cw, bm.ch);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha *= clamp(age / 0.03) * fade;
      ctx.translate(cx, cy); ctx.scale(sc * SQ, sc); ctx.translate(-cx, -cy);
      ctx.drawImage(bm.c, ix, iy, bm.cw, bm.ch);
      const flash = Math.exp(-age / 0.06);
      if (flash > 0.03) { ctx.globalAlpha *= flash * 0.85; ctx.drawImage(bm.white, ix, iy, bm.cw, bm.ch); }
      ctx.restore();
    });
    // star glints on letter edges
    if (!hold) {
      const hat = MO.env('openHat', t, 0.12), ch = MO.env('closedHat', t, 0.05);
      lay.words.forEach((w, i) => {
        const age = t - w.t;
        if (age < 0.05) return;
        const bm = chromeWord(w.text, lay.px, line.kind);
        const j = (i + line.li4) % 2;
        const [gx, gy] = j ? [w.x + w.w * 0.97 + bm.capH * 0.05, lay.base - bm.capH * 0.96] : [w.x + bm.capH * 0.26, lay.base - bm.capH * 0.97];
        const ph = hash(i * 7 + j * 3 + line.li);
        const tw = 0.5 + 0.5 * Math.sin(t * (5 + 4 * ph) + ph * 20);
        const r = lay.px * (0.1 + 0.08 * tw + 0.14 * hat + 0.04 * ch) * (big ? 1.15 : 1);
        star(ctx, gx, gy, r, clamp((age - 0.05) / 0.1) * (0.55 + 0.45 * tw), 0.12 * Math.sin(t + ph));
      });
    }
    ctx.restore();
    // the held word: grows to ~1700 px wide, holds with a slow shine, then shatters into gold shards
    if (line.hold && t >= lastW.t) drawHeld(ctx, t, line, lay, lastW, growK);
    // Japanese line beneath
    {
      const a = remap(t, line.t0, line.t0 + 0.12) * (1 - (hold ? growK : 0));
      if (a > 0) {
        ctx.save(); ctx.globalAlpha = a;
        ctx.font = font(F.min, 800, big ? 46 : 42);
        ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(8,2,2,0.95)'; ctx.lineWidth = 8; ctx.fillStyle = JP_FILL[line.kind] || '#fff3d2';
        spaced(ctx, line.jp, 960, lay.base + (big ? 100 : 84), 12, 'center', 'both');
        ctx.restore();
      }
    }
  }
  // the held word's size and centre: its ink (outline and extrusion included) fills x 100-1700, so
  // the character caption at the right edge (自己 THE SELF, x 1770+) keeps its space
  const HELD_INK = [100, 1700];
  function heldGeom(line, w) {
    return cached('heldGeom|' + line.li, () => {
      mctx.font = font(F.chrome, 900, 100);
      const adv = measure(mctx, w.text, 1.2);          // advance at 100 px, before the SQ condensing
      const ink = chromeInk(w.text, line.kind);
      const px = Math.min(520, 100 * (HELD_INK[1] - HELD_INK[0]) / (SQ * (ink.l + ink.r))), k = px / 100;
      // ink spans [cx - SQ*adv*k/2 - SQ*l*k, cx - SQ*adv*k/2 + SQ*r*k]; put its centre mid-range
      const cx = (HELD_INK[0] + HELD_INK[1]) / 2 + SQ * k * (adv / 2 - (ink.r - ink.l) / 2);
      return { px, cx };
    });
  }
  const heldBig = (line, w) => heldGeom(line, w).px;
  // 60 shards on a jittered grid over the word's box (shared vertices, so they tile)
  function shardsFor(cols, rows) {
    return cached(`shards|${cols}|${rows}`, () => {
      const V2 = [];
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const edgeX = i === 0 || i === cols, edgeY = j === 0 || j === rows;
        V2.push([(i + (edgeX ? 0 : (hash(i * 3.7 + j * 9.1) - 0.5) * 0.7)) / cols, (j + (edgeY ? 0 : (hash(i * 5.3 + j * 2.9) - 0.5) * 0.7)) / rows]);
      }
      const at = (i, j) => V2[j * (cols + 1) + i];
      const out = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        const c = [q.reduce((p, v) => p + v[0], 0) / 4, q.reduce((p, v) => p + v[1], 0) / 4];
        out.push({ q, c, h: hash(i * 13.1 + j * 7.7) });
      }
      return out;
    });
  }
  function drawHeld(ctx, t, line, lay, w, growK) {
    const h = line.hold;
    const pxBig = heldBig(line, w);
    const age = t - w.t;
    if (t < h.tShatter) {
      // Anti-strobe (spec 7.3): the grow is a zoom-dissolve. Scaling the striped chrome continuously to
      // ~1700 px swept its bands over each pixel several times in half a second (a 10-degree flash fail,
      // normal and reduced); now the line-size word fades out in place while the big word fades in,
      // settling from 0.96x, so each pixel changes about once.
      const bm = chromeWord(w.text, pxBig, line.kind);
      if (growK < 1) {
        const sc0 = (lay.px / pxBig) * (growK > 0 ? 1 : 1 + 1.0 * Math.exp(-age * 30) * Math.cos(34 * age));
        ctx.save();
        ctx.globalAlpha = clamp(age / 0.03) * (1 - growK);
        drawChrome(ctx, bm, w.x + w.w / 2, lay.base, sc0, Math.exp(-age / 0.06) * (MO.reduced ? 0.2 : 0.85), SQ);
        ctx.restore();
      }
      if (growK <= 0) return;
      const sc = mix(0.96, 1, growK), cx = heldGeom(line, w).cx, base = 700;
      ctx.save();
      ctx.globalAlpha = growK;
      drawChrome(ctx, bm, cx, base, sc, 0, SQ);
      // a slow shine sweep across the held word
      const sw = remap(t, h.tGrow + 0.12 + BEAT * 0.9, h.tShatter - 0.02);
      if (sw > 0 && sw < 1) {
        const ix = cx - bm.w / 2 - bm.ox, iy = base - bm.oy;
        const fx = mix(ix, ix + bm.cw, easeInOut(sw));
        ctx.translate(cx, base - bm.capH * 0.5); ctx.scale(sc * SQ, sc); ctx.translate(-cx, -(base - bm.capH * 0.5));
        ctx.beginPath(); ctx.moveTo(fx - 60, iy); ctx.lineTo(fx + 40, iy); ctx.lineTo(fx - 80, iy + bm.ch); ctx.lineTo(fx - 180, iy + bm.ch); ctx.closePath(); ctx.clip();
        ctx.globalAlpha = MO.reduced ? 0.2 : 0.4; ctx.drawImage(bm.white, ix, iy, bm.cw, bm.ch);
      }
      ctx.restore();
      if (growK >= 1) star(ctx, cx + bm.w * SQ * 0.4, base - bm.capH * 0.95, 150 * (0.7 + 0.3 * Math.sin(t * 6)), 0.85);
      return;
    }
    // the shatter: gold shards fly out over half a beat
    const T = BEAT * 0.5, a = t - h.tShatter;
    if (a >= T) return;
    const bm = chromeWord(w.text, pxBig, 'gold');
    const cx = heldGeom(line, w).cx, base = 700;
    const ix = cx - bm.w / 2 - bm.ox, iy = base - bm.oy;
    const cols = MO.reduced ? 5 : 10, rows = 6;
    const sh = shardsFor(cols, rows);
    const u = a / T;
    ctx.save();
    ctx.translate(cx, base - bm.capH * 0.5); ctx.scale(SQ, 1); ctx.translate(-cx, -(base - bm.capH * 0.5));
    for (const p of sh) {
      const px0 = ix + p.c[0] * bm.cw, py0 = iy + p.c[1] * bm.ch;
      const dx = px0 - cx, dy = py0 - (base - bm.capH * 0.5);
      const len = Math.hypot(dx, dy) || 1;
      const sp = (MO.reduced ? 500 : 900) * (0.6 + 0.8 * p.h);
      const ox = dx / len * sp * a + dx * 0.6 * u, oy = dy / len * sp * a + 700 * a * a - 120 * a;
      const rot = (p.h - 0.5) * 7 * a;
      const sc = 1 - 0.45 * u;
      ctx.save();
      ctx.globalAlpha = Math.pow(1 - u, 1.4);
      ctx.translate(px0 + ox, py0 + oy); ctx.rotate(rot); ctx.scale(sc, sc); ctx.translate(-px0, -py0);
      ctx.beginPath();
      p.q.forEach(([qx, qy], k) => { const X = ix + qx * bm.cw, Y = iy + qy * bm.ch; k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.closePath(); ctx.clip();
      ctx.drawImage(bm.c, ix, iy, bm.cw, bm.ch);
      ctx.restore();
    }
    ctx.restore();
  }
  function drawHook(ctx, t) {
    const line = HOOK.find((l) => t >= l.t0 && t < l.t1);
    if (!line) return false;
    drawHookLine(ctx, t, line);   // lines hard-cut on the bar line
    return true;
  }

  // ---- coda: moon karaoke, gold ('I am… whole.' wiped syllable by syllable)
  const CODA = (() => {
    const lines = arr(V.sung).filter((l) => l.part === 'coda');
    const w = W_CODA.find((x) => lines.some((l) => barT(l.bar) >= x.a - 0.01 && barT(l.bar) < x.b));
    if (!w || !lines.length) return null;
    const syl = [];
    lines.forEach((l, li) => {
      const tk = tokens(l);
      const notes = arr(l.notes);
      tk.forEach((k, i) => {
        const n = notes.find((q) => q[1] === k.step) || [k.word, k.step, 4];
        let text = k.text;
        if (li < lines.length - 1 && i === tk.length - 1 && !/[.,!?…]$/.test(text)) text += '…';
        syl.push({ text, t: barT(l.bar, k.step), d: Math.max(STEP * 2, n[2] * STEP) });
      });
    });
    return { w, syl, jp: lines.map((l) => l.jp || '').join(''), jpParts: lines.map((l) => ({ jp: l.jp || '', t: barT(l.bar), d: BAR * 0.5 })) };
  })();
  function drawCodaLyric(ctx, t) {
    if (!CODA || t < CODA.w.a - 0.1 || t >= CODA.w.b) return false;
    const a = gate(t, CODA.w.a - 0.1, CODA.w.b, 0.3, 0.35);
    if (a <= 0) return false;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = font(F.cinzel, 600, 50);
    const sp = 6, space = measure(ctx, ' ', 0) + sp;
    const ws = CODA.syl.map((k) => measure(ctx, k.text, sp));
    const total = ws.reduce((p, q) => p + q, 0) + space * (ws.length - 1);
    let x = 960 - total / 2;
    const y = 650;
    ctx.lineJoin = 'round';
    CODA.syl.forEach((k, i) => {
      ctx.strokeStyle = 'rgba(10,4,0,0.75)'; ctx.lineWidth = 6; ctx.fillStyle = 'rgba(236,229,218,0.55)';
      spaced(ctx, k.text, x, y, sp, 'left', 'both');
      const wu = easeInOut(remap(t, k.t, k.t + k.d));
      if (wu > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x - 4, y - 60, (ws[i] + 8) * wu, 90); ctx.clip();
        ctx.fillStyle = '#ffd36a'; ctx.shadowColor = 'rgba(255,190,80,0.8)'; ctx.shadowBlur = 14 * s;
        spaced(ctx, k.text, x, y, sp);
        ctx.restore();
      }
      x += ws[i] + space;
    });
    ctx.font = font(F.min, 800, 26);
    const jw = CODA.jpParts.map((p) => measure(ctx, p.jp, 6));
    const jt = jw.reduce((p, q) => p + q, 0);
    let jx = 960 - jt / 2;
    CODA.jpParts.forEach((p, i) => {
      ctx.strokeStyle = 'rgba(10,4,0,0.75)'; ctx.lineWidth = 5; ctx.fillStyle = 'rgba(236,229,218,0.5)';
      spaced(ctx, p.jp, jx, y + 40, 6, 'left', 'both');
      const wu = easeInOut(remap(t, p.t, p.t + p.d));
      if (wu > 0) { ctx.save(); ctx.beginPath(); ctx.rect(jx - 4, y + 8, (jw[i] + 8) * wu, 46); ctx.clip(); ctx.fillStyle = '#ffd36a'; spaced(ctx, p.jp, jx, y + 40, 6); ctx.restore(); }
      jx += jw[i];
    });
    ctx.restore();
    return true;
  }

  // ================================================================ 9. character captions (right edge, vertical)
  const CAPS = W_CAP.map((w) => {
    const m = /character caption\s+(\S+)\s+(.+)$/.exec(w.what);
    return m ? { ...w, jp: m[1], en: m[2].trim() } : null;
  }).filter(Boolean);
  function drawCaption(ctx, t) {
    const c = CAPS.find((x) => t >= x.a && t < x.b);
    if (!c) return false;
    const kIn = easeOutBack(remap(t, c.a, c.a + 0.2), 1.3), kOut = easeIn(remap(t, c.b - 0.25, c.b));
    const n = [...c.jp].length, px = 56, top = 250, hgt = n * px * 1.04;
    ctx.save();
    ctx.translate((1 - kIn) * 160 + kOut * 160, 0);
    ctx.globalAlpha = clamp(kIn * 1.4) * (1 - kOut);
    plate(ctx, 1640, top - 60, 300, hgt + 200, 'rgba(6,4,10,', 'r', 0.6);
    ctx.lineJoin = 'round';
    ctx.font = font(F.min, 800, px); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 7; ctx.fillStyle = '#ffffff';
    vtext(ctx, c.jp, 1846, top, px, 1.04, 'both');
    ctx.fillStyle = '#f3c867';
    ctx.fillRect(1800, top - 10, 1.6, Math.max(hgt, 240) + 20);
    ctx.save();
    ctx.translate(1780, top); ctx.rotate(Math.PI / 2);
    ctx.font = font(F.cinzel, 600, 18); ctx.fillStyle = '#f4ecd8'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 4;
    spaced(ctx, c.en.toUpperCase(), 0, 0, 7, 'left', 'both');
    ctx.restore();
    ctx.restore();
    return true;
  }

  // ================================================================ 10. episode cards (top left, slanted black band)
  const EPIS = W_EPI.map((w, i) => {
    const m = /episode card\s+(\S+)\s+(\S+)\s*·\s*(EPISODE\s+[IVXLC]+)\s*·\s*(.+)$/.exec(w.what);
    const dflt = [['第一話', '仮面', 'EPISODE I', 'THE PERSONA'], ['第二話', '鏡', 'EPISODE II', 'THE MIRROR'], ['第三話', '隠者', 'EPISODE III', 'THE HERMIT'], ['第四話', '変身', 'EPISODE IV', 'HENSHIN']][i] || ['', '', `EPISODE ${roman(i + 1)}`, ''];
    const [no, title, ep, en] = m ? [m[1], m[2], m[3], m[4].trim()] : dflt;
    return { ...w, no, title, ep, en };
  });
  function episodeCover(t) {
    const e = EPIS.find((x) => t >= x.a && t < x.b);
    return e ? gate(t, e.a, e.b, 4 * FRAME, 4 * FRAME) : 0;
  }
  function drawEpisode(ctx, t) {
    const e = EPIS.find((x) => t >= x.a && t < x.b);
    if (!e) return false;
    const kIn = easeOut(remap(t, e.a, e.a + 4 * FRAME)), kOut = easeIn(remap(t, e.b - 4 * FRAME, e.b));
    const x1 = 760, y0 = 110, y1 = 210, sl = Math.tan(12 * Math.PI / 180) * (y1 - y0);
    ctx.save();
    ctx.translate(-(1 - kIn) * 820 - kOut * 820, 0);
    ctx.fillStyle = '#050307';
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(x1 + sl, y0); ctx.lineTo(x1, y1); ctx.lineTo(0, y1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d6402b';
    ctx.beginPath(); ctx.moveTo(0, y0 - 6); ctx.lineTo(x1 + sl + 1.3, y0 - 6); ctx.lineTo(x1 + sl, y0); ctx.lineTo(0, y0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f3c867'; rule(ctx, 0, y1 + 4, x1 - 12, 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(F.min, 800, 34);
    const nw = spaced(ctx, e.no, 54, 182, 2);
    ctx.font = font(F.min, 800, 64);
    const tw = spaced(ctx, e.title, 54 + nw + 22, 188, 4);
    const ex = 54 + nw + 22 + tw + 30;
    ctx.fillStyle = '#d6402b'; ctx.fillRect(ex, 140, 2, 52);
    ctx.fillStyle = '#f3c867'; ctx.font = font(F.cinzel, 600, 19);
    spaced(ctx, e.ep, ex + 16, 157, 6);
    ctx.fillStyle = '#ffffff'; ctx.font = font(F.cinzel, 600, 26);
    spaced(ctx, e.en, ex + 16, 190, 5);
    ctx.restore();
    return true;
  }

  // ================================================================ 11. anime OP title card
  function drawTitleCard(ctx, t) {
    const w = W_TITLE;
    if (!w || t < w.a || t >= w.b) return false;
    const age = t - w.a;
    // out by a diagonal wipe over the last beat: a gold band with a white leading edge sweeps left
    // to right and takes the card with it (eased in and out, so the sweep reads as a wipe)
    const wipe = remap(t, w.b - BEAT, w.b);
    const xw = mix(-300, 2460, easeInOut(wipe)), SLANT = 420;
    focusLines(ctx, t, 520, 0.85 * (1 - remap(age, 0.2, 0.3)));
    ctx.save();
    if (wipe > 0) {
      ctx.beginPath(); ctx.moveTo(xw, 0); ctx.lineTo(2600, 0); ctx.lineTo(2600, 1080); ctx.lineTo(xw - SLANT, 1080); ctx.closePath(); ctx.clip();
    }
    const cy = 756;
    // a thin gold 8-point starburst outline, turning, behind the logo
    const sa = easeOut(remap(age, 0, 0.25));
    ctx.save();
    ctx.globalAlpha = sa * 0.9;
    ctx.translate(960, cy - 40);
    ctx.strokeStyle = '#f3c867'; ctx.lineWidth = 2.5;
    starPath(ctx, 0, 0, 470 * mix(0.7, 1, sa), 190, 8, -Math.PI / 2 + age * 0.12); ctx.stroke();
    ctx.globalAlpha = sa * 0.5; ctx.lineWidth = 1.4;
    starPath(ctx, 0, 0, 330 * mix(0.7, 1, sa), 140, 8, -Math.PI / 2 + Math.PI / 8 - age * 0.18); ctx.stroke();
    ctx.restore();
    const bm = chromeWord(String(S.title || 'Magnum Opus').toUpperCase(), 150, 'logo');
    const k = easeOut(age / (6 * FRAME)), sc = mix(1.3, 1, k);
    drawChrome(ctx, bm, 960, cy + bm.capH * 0.5, sc, Math.exp(-age / 0.08) * 0.9);
    const [nameJp, edJp] = String(S.titleJp || '').split(/\s+/);
    const ta = easeOut(remap(age, 0.08, 0.3));
    ctx.globalAlpha = ta;
    ctx.lineJoin = 'round';
    ctx.font = font(F.min, 800, 44); ctx.fillStyle = '#f3c867'; ctx.strokeStyle = 'rgba(10,4,0,0.9)'; ctx.lineWidth = 7;
    spaced(ctx, nameJp || '', 960, cy - bm.capH * 0.5 - 52, 34, 'center', 'both');
    // 完全版 · THE FULL OPUS: the middle dot sits exactly GAP from both neighbours
    const sub = String(S.subtitle || '').toUpperCase();
    const GAP = 22;
    ctx.font = font(F.min, 800, 30);
    const ew = edJp ? measure(ctx, edJp, 6) : 0;
    ctx.font = font(F.cinzel, 700, 26);
    const dw = measure(ctx, '·', 0), sw = measure(ctx, sub, 10);
    const tw = edJp ? ew + GAP + dw + GAP + sw : sw;
    const x0 = 960 - tw / 2, y1 = cy + bm.capH * 0.5 + 80;
    ctx.fillStyle = '#ffffff';
    if (edJp) {
      ctx.font = font(F.min, 800, 30); spaced(ctx, edJp, x0, y1 + 1, 6, 'left', 'both');
      ctx.font = font(F.cinzel, 700, 26); spaced(ctx, '·', x0 + ew + GAP, y1, 0, 'left', 'both');
    }
    ctx.font = font(F.cinzel, 700, 26); spaced(ctx, sub, x0 + tw - sw, y1, 10, 'left', 'both');
    const ep = EPIS[0];
    ctx.globalAlpha = easeOut(remap(age, 0.25, 0.5));
    ctx.font = font(F.min, 800, 28); ctx.fillStyle = '#ece5da';
    spaced(ctx, `${ep ? ep.no : '第一話'}「黒い太陽」`, 960, y1 + 50, 6, 'center', 'both');
    ctx.restore();
    // an anamorphic flare streak crosses left to right on the third beat
    const fl = remap(t, w.a + 2 * BEAT, w.a + 2 * BEAT + 0.5);
    if (fl > 0 && fl < 1 && wipe <= 0) {
      const fx = mix(-300, 2220, easeInOut(fl)), fy = cy - 8, fa = Math.sin(fl * Math.PI);
      ctx.save();
      const streak = ctx.createLinearGradient(fx - 1100, 0, fx + 300, 0);
      streak.addColorStop(0, 'rgba(120,180,255,0)'); streak.addColorStop(0.75, `rgba(200,230,255,${0.75 * fa})`); streak.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = streak; ctx.fillRect(fx - 1100, fy - 2, 1400, 4);
      ctx.globalAlpha = 0.35 * fa; ctx.fillRect(fx - 900, fy - 12, 1200, 24);
      ctx.restore();
      star(ctx, fx, fy, 220, fa, 0, '220,236,255');
    }
    // the wipe band itself (about 4 % of the frame, moving: no flash)
    if (wipe > 0 && wipe < 1) {
      const band = (o, wd, fill) => { ctx.beginPath(); ctx.moveTo(xw - o - wd, 0); ctx.lineTo(xw - o, 0); ctx.lineTo(xw - o - SLANT, 1080); ctx.lineTo(xw - o - wd - SLANT, 1080); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
      ctx.save();
      band(0, 64, 'rgba(243,200,103,0.92)');
      band(96, 14, 'rgba(214,64,43,0.9)');
      band(0, 5, 'rgba(255,255,255,0.95)');
      ctx.restore();
    }
    return true;
  }

  // ================================================================ 12. wheel of trumps
  function drawWheel(ctx, t) {
    const w = W_WHEEL;
    if (!w || t < w.a || t >= w.b || !TRUMPS.length) return false;
    const u = (t - w.a) / (w.b - w.a);
    const theta = 21 * (0.3 * u + 0.7 * u * u);         // accelerating: 0 LE MAT on top at the start, XXI at the end
    const col = easeIn(remap(t, w.b - 2 * BEAT, w.b));     // collapses into the club's sun ball
    const fin = easeOut(remap(t, w.a, w.a + 0.35));
    ctx.save();
    ctx.globalAlpha = fin * (1 - col);
    const pg = cached('wheelPlate', () => { const g = ctx.createRadialGradient(960, 620, 80, 960, 620, 980); g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(0.6, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; });
    ctx.fillStyle = pg; ctx.fillRect(0, 0, VW, 1080);
    ctx.restore();
    const WR = 372;                                        // wheel radius (units)
    const cx = 960, cy = mix(616, 324, col);
    const scale = mix(1, 0.05, col) * (1 + 0.04 * MO.env('kick', t, 0.1));
    ctx.save();
    ctx.globalAlpha = fin * (1 - col * col);
    ctx.translate(cx, cy); ctx.scale(scale, scale);
    // the rim
    ctx.strokeStyle = 'rgba(243,200,103,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, WR, 0, TAU); ctx.stroke();
    const RI = WR * 0.625, RS = WR * 0.825;
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, RI, 0, TAU); ctx.stroke();
    for (let k = 0; k < 22; k++) { const an = (k - theta + 0.5) * TAU / 22; ctx.beginPath(); ctx.moveTo(Math.sin(an) * RI, -Math.cos(an) * RI); ctx.lineTo(Math.sin(an) * RS, -Math.cos(an) * RS); ctx.stroke(); }
    const items = [];
    for (let n = 0; n < 22; n++) {
      let d = ((n - theta) % 22 + 22) % 22;
      if (d > 11) d -= 22;
      const k = MO.smooth(1 - Math.min(1, Math.abs(d)));
      items.push({ n, ang: d * TAU / 22, k, sc: mix(0.55, 2, k) });
    }
    items.sort((p, q) => p.sc - q.sc);
    for (const it of items) {
      const x = Math.sin(it.ang) * WR, y = -Math.cos(it.ang) * WR + it.k * 14;
      const cw = 120 * it.sc, chh = 208 * it.sc;
      if (it.k > 0.05) {
        const gl = ctx.createRadialGradient(x, y, 20, x, y, 320 * it.k);
        gl.addColorStop(0, `rgba(255,214,120,${0.5 * it.k})`); gl.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = gl; ctx.fillRect(x - 330, y - 330, 660, 660);
      }
      ctx.save();
      ctx.globalAlpha *= mix(0.8, 1, it.k);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x - cw / 2 + 6, y - chh / 2 + 8, cw, chh);
      ctx.drawImage(cardImg(it.n, it.sc > 1.05 ? 240 : 120), x - cw / 2, y - chh / 2, cw, chh);
      ctx.restore();
    }
    // name ribbon under the top card
    const topN = ((Math.round(theta) % 22) + 22) % 22;
    const tr = TRUMP_N[topN];
    const nearK = MO.smooth(1 - Math.min(1, Math.abs(theta - Math.round(theta)) * 2.2));
    if (tr && nearK > 0.02) {
      ctx.globalAlpha *= nearK;
      const ry = -WR + 14 + 208 + 34;
      const label = `${tr.numeral} · ${String(tr.fr).toUpperCase()}`;
      ctx.font = font(F.cinzel, 700, 26);
      const lw = measure(ctx, label, 6);
      ctx.font = font(F.min, 800, 26);
      const kw = measure(ctx, tr.jp || '', 4);
      const tot = lw + 22 + kw, rw = tot + 80;
      ctx.fillStyle = VER;
      ctx.beginPath(); ctx.moveTo(-rw / 2, ry - 26); ctx.lineTo(rw / 2, ry - 26); ctx.lineTo(rw / 2 - 18, ry + 2); ctx.lineTo(rw / 2, ry + 30); ctx.lineTo(-rw / 2, ry + 30); ctx.lineTo(-rw / 2 + 18, ry + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#fff6e0';
      ctx.font = font(F.cinzel, 700, 26); spaced(ctx, label, -tot / 2, ry + 12, 6);
      ctx.font = font(F.min, 800, 26); spaced(ctx, tr.jp || '', -tot / 2 + lw + 22, ry + 13, 4);
    }
    ctx.restore();
    return true;
  }

  // ================================================================ 13. EYECATCH (mid-show card, flips, iris-in)
  function lanternAt(t) {
    const a = MO.anchors && MO.anchors.lantern;
    let v = typeof a === 'function' ? a(t) : a;
    // hermit.lantern publishes MO.hermitLantern(t) -> {x, y, r} (frame fractions, y down)
    if (!(Array.isArray(v) && v.length >= 2) && typeof MO.hermitLantern === 'function') {
      const L = MO.hermitLantern(t);
      if (L && Number.isFinite(L.x) && Number.isFinite(L.y)) v = [L.x, L.y];
    }
    return Array.isArray(v) && v.length >= 2 ? [v[0] * 1920, v[1] * 1080] : [770, 390];
  }
  function toneImg() {
    return bigCached('tone|' + s.toFixed(3), () => {
      const c = newCanvas(960 * s, 1080 * s), g = c.getContext('2d');
      g.scale(s, s);
      g.fillStyle = ULT;
      const P2 = 18;
      for (let y = 0; y < 1080 + P2; y += P2) for (let x = 0; x < 960 + P2; x += P2) {
        const ox = (Math.round(y / P2) % 2) * P2 / 2;
        const r = 0.6 + 6.2 * Math.pow((x + ox) / 960, 1.4);
        g.beginPath(); g.arc(x + ox, y, r, 0, TAU); g.fill();
      }
      return { c, px: c.width * c.height };
    }).c;
  }
  function eyecatchFace(ctx, t, w, variant) {
    // variant 0: as it arrives; 1: after the flip (the Hanged Man upright, the logo upside down)
    ctx.fillStyle = '#f4ecd8'; ctx.fillRect(0, 0, 1920, 1080);
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.55;
    ctx.drawImage(toneImg(), 960, 0, 960, 1080);
    ctx.globalAlpha = ga;
    // pale diagonal stripes sliding slowly
    ctx.save();
    ctx.fillStyle = 'rgba(214,190,140,0.16)';
    const off = ((t - w.a) * 40) % 90;
    ctx.beginPath();
    for (let x = -1200 + off; x < 1920 + 1200; x += 90) { ctx.moveTo(x, 0); ctx.lineTo(x + 36, 0); ctx.lineTo(x + 36 - 1080, 1080); ctx.lineTo(x - 1080, 1080); ctx.closePath(); }
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(40, 40, 1840, 1000);
    ctx.lineWidth = 1.2; ctx.strokeRect(52, 52, 1816, 976);
    // the Hanged Man, upside down (upright after the flip)
    const ci = cardImg(12, 420), cw = 450, chh = cw * 208 / 120;
    ctx.save();
    ctx.translate(520, 535); if (!variant) ctx.rotate(Math.PI); ctx.rotate(-0.04);
    ctx.fillStyle = 'rgba(20,14,10,0.35)'; ctx.fillRect(-cw / 2 + 14, -chh / 2 + 16, cw, chh);
    ctx.drawImage(ci, -cw / 2, -chh / 2, cw, chh);
    ctx.restore();
    // the logo block
    ctx.save();
    ctx.translate(1350, 520); if (variant) ctx.rotate(Math.PI); ctx.translate(-1350, -520);
    const bm = chromeWord(String(S.title || 'Magnum Opus').toUpperCase(), 108, 'logo');
    drawChrome(ctx, bm, 1350, 500);
    ctx.font = font(F.min, 800, 46); ctx.fillStyle = VER;
    spaced(ctx, String(S.titleJp || '').split(/\s+/)[0], 1350, 590, 20, 'center');
    ctx.font = font(F.cinzel, 700, 28); ctx.fillStyle = INK;
    const pw = measure(ctx, 'PARS SECUNDA ·', 10);
    ctx.font = font(F.min, 800, 30);
    const kw = measure(ctx, '後編', 6);
    const px0 = 1350 - (pw + 16 + kw) / 2;
    ctx.font = font(F.cinzel, 700, 28); spaced(ctx, 'PARS SECUNDA ·', px0, 662, 10);
    ctx.font = font(F.min, 800, 30); ctx.fillStyle = VER; spaced(ctx, '後編', px0 + pw + 16, 663, 6);
    ctx.fillStyle = INK; rule(ctx, 1350 - 260, 700, 1350 + 260, 1.4);
    ctx.restore();
    // a tiny cassette label
    ctx.save();
    ctx.translate(1640, 978);
    ctx.fillStyle = '#fbf6ea'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-150, -26, 300, 46, 8) : ctx.rect(-150, -26, 300, 46); ctx.fill(); ctx.stroke();
    ctx.fillStyle = VER; ctx.fillRect(-150, -26, 12, 46);
    ctx.fillStyle = INK; ctx.font = font(F.hud, 400, 15);
    spaced(ctx, 'SIDE A', -120, 4, 3);
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(10, -2); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    spaced(ctx, 'SIDE B', 26, 4, 3);
    ctx.restore();
  }
  function drawEyecatch(ctx, t) {
    const w = W_EYE;
    if (!w || t < w.a || t >= w.b) return false;
    const tf = w.a + 2 * BEAT, tIris = w.b - BEAT;
    ctx.save();
    ctx.globalAlpha = reducedIn(t, w.a);
    // the iris-in exit: a circle centred on the lantern grows until it uncovers the frame
    if (t >= tIris) {
      const [lx, ly] = lanternAt(t);
      const far = Math.max(Math.hypot(lx, ly), Math.hypot(1920 - lx, ly), Math.hypot(lx, 1080 - ly), Math.hypot(1920 - lx, 1080 - ly)) * 1.02;
      const r = far * easeInOut(remap(t, tIris, w.b));
      ctx.beginPath(); ctx.rect(-10, -10, VW + 20, 1100); ctx.arc(lx, ly, Math.max(0.5, r), 0, TAU); ctx.clip('evenodd');
    }
    // the flip on the third beat: scaleY = cos over 4 frames (reduced: a 6-frame cross-fade)
    const fu = (t - tf) / (4 * FRAME);
    if (MO.reduced) {
      const x = clamp((t - tf) / (6 * FRAME));
      if (x < 1) { ctx.save(); eyecatchFace(ctx, t, w, 0); ctx.restore(); }
      if (x > 0) { ctx.save(); ctx.globalAlpha *= x; eyecatchFace(ctx, t, w, 1); ctx.restore(); }
    } else if (fu < 0 || fu >= 1) {
      eyecatchFace(ctx, t, w, fu >= 1 ? 1 : 0);
    } else {
      // behind the turning card: a slightly darker paper, not black (no luminance step over the frame)
      ctx.fillStyle = '#d3c7ad'; ctx.fillRect(0, 0, VW, 1080);
      const sy = Math.cos(Math.PI * fu);
      ctx.save();
      ctx.translate(960, 540); ctx.scale(1, Math.max(0.02, Math.abs(sy))); ctx.translate(-960, -540);
      eyecatchFace(ctx, t, w, sy >= 0 ? 0 : 1);
      ctx.restore();
    }
    // the jingle's four bells: four sparkle stars on the 8ths
    [[1060, 430], [1400, 400], [1690, 445], [1520, 560]].forEach(([x, y], i) => {
      const age = t - (w.a + i * BEAT * 0.5);
      if (age >= 0 && age < 0.5) star(ctx, x, y, 120 * (1 - age), (1 - age / 0.5), i * 0.4, '255,236,180');
    });
    // a chibi Fool hops along the bottom on beats 2 and 3
    {
      const u = remap(t, w.a, tIris + BEAT);
      const x = mix(860, 1480, u);
      let hop = 0;
      for (const hb of [w.a + BEAT, w.a + 2 * BEAT]) { const k = (t - hb) / 0.3; if (k > 0 && k < 1) hop = Math.max(hop, Math.sin(k * Math.PI)); }
      const y = 1012 - 90 * hop;
      ctx.save();
      ctx.translate(x, y); ctx.scale(1.7, 1.7);
      ctx.fillStyle = '#18204a';
      ctx.beginPath(); ctx.arc(0, -64, 17, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(22, -6); ctx.lineTo(-22, -6); ctx.closePath(); ctx.fill();
      ctx.fillRect(-12, -6, 7, 10); ctx.fillRect(5, -6, 7, 10);
      ctx.strokeStyle = '#18204a'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(8, -40); ctx.lineTo(-26, -84); ctx.stroke();
      ctx.beginPath(); ctx.arc(-29, -88, 10, 0, TAU); ctx.fillStyle = VER; ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // the iris edge: a thin dark ring
    if (t >= tIris) {
      const [lx, ly] = lanternAt(t);
      const far = Math.max(Math.hypot(lx, ly), Math.hypot(1920 - lx, ly), Math.hypot(lx, 1080 - ly), Math.hypot(1920 - lx, 1080 - ly)) * 1.02;
      const r = far * easeInOut(remap(t, tIris, w.b));
      ctx.strokeStyle = '#0b0a10'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(lx, ly, Math.max(0.5, r), 0, TAU); ctx.stroke();
    }
    return true;
  }

  // ================================================================ 14. viewfinder, slate, ED roll (the pull-back)
  function vfRect(t, w) {
    const a = MO.anchors && MO.anchors.frame;
    const v = typeof a === 'function' ? a(t) : null;
    if (Array.isArray(v) && v.length >= 4) return [v[0] * 1920, v[1] * 1080, v[2] * 1920, v[3] * 1080];
    // default: the full frame → the Fool card (97.1) → the wheel (98.1) → the set (99.1)
    const K = [[w.a, [70, 60, 1850, 1020]], [w.a + 4 * BEAT, [690, 90, 1230, 990]], [w.a + 8 * BEAT, [520, 110, 1400, 970]], [w.a + 12 * BEAT, [110, 80, 1810, 1000]]];
    return MO.keys(K, t, easeInOut);
  }
  const ED = [
    ['h', 'CAST'],
    ['c', '仮面', 'THE PERSONA'], ['c', '影', 'THE SHADOW'], ['c', 'アニマ', 'THE ANIMA'],
    ['c', '隠者', 'THE HERMIT'], ['c', '七人', 'THE SEVEN THIEVES'], ['c', '自己', 'THE SELF'],
    ['g'],
    ['k', 'MUSIC', `${S.bpm} BPM · A MINOR → B MINOR → A MAJOR`],
    ['k', 'VOICES', 'FLITE RMS · SLT · AWB'],
    ['k', 'PICTURE', `GLSL · ${arr(S.cues).length || '–'} CUES · ${S.bars} BARS`],
  ];
  function drawViewfinder(ctx, t) {
    const w = W_VF;
    if (!w || t < w.a || t >= w.b) return false;
    const tOff = w.b - 2 * BEAT;                         // REC out, brackets fade: the eye unframed for the final hit
    const fade = 1 - MO.smooth(remap(t, tOff, tOff + 0.3));
    const kIn = easeOut(remap(t, w.a, w.a + 0.15));
    let [x0, y0, x1, y1] = vfRect(t, w);
    x0 = mix(0, x0, kIn); y0 = mix(0, y0, kIn); x1 = mix(1920, x1, kIn); y1 = mix(1080, y1, kIn);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 4; ctx.lineCap = 'square';
    const L = Math.min(90, (x1 - x0) * 0.18);
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(cx, cy + sy * L); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * L, cy); ctx.stroke();
    }
    // 2.39:1 frame lines and the centre cross
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, fh = Math.min(y1 - y0, (x1 - x0) / 2.39) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0 + 14, my - fh); ctx.lineTo(x1 - 14, my - fh); ctx.moveTo(x0 + 14, my + fh); ctx.lineTo(x1 - 14, my + fh); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.moveTo(mx - 22, my); ctx.lineTo(mx + 22, my); ctx.moveTo(mx, my - 22); ctx.lineTo(mx, my + 22); ctx.stroke();
    // REC and the timecode under it (top right); scene/take top left once the slate has gone (the
    // slate carries SC/TK until then). The bottom of the frame stays free for the director's line.
    ctx.font = font(F.hud, 400, 18); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
    if (t < tOff) {
      ctx.fillStyle = '#ff2a2a';
      ctx.beginPath(); ctx.arc(x1 - 128, y0 + 40, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; spaced(ctx, 'REC', x1 - 30, y0 + 47, 4, 'right', 'both');
    }
    const lastTr = TRUMPS[TRUMPS.length - 1];
    ctx.font = font(F.hud, 400, 16); ctx.fillStyle = '#ffffff';
    spaced(ctx, 'TC ' + timecode(t), x1 - 30, y0 + 80, 3, 'right', 'both');
    const sa = remap(t - w.a, SLATE_END * BEAT, SLATE_END * BEAT + 0.25);
    if (sa > 0) {
      ctx.globalAlpha = fade * sa;
      spaced(ctx, `SCENE ${lastTr ? lastTr.numeral : 'XXI'} · TAKE ${TRUMPS.length || 22}`, x0 + 30, y0 + 47, 4, 'left', 'both');
    }
    ctx.restore();
    // the clapperboard snaps shut on the slate, then leaves
    drawSlate(ctx, t, w);
    // the director's line, as a fansub
    const ann = arr(V.announcer).find((x) => Math.abs(bt(x.beat) - w.a) < 0.02);
    if (ann && t < w.a + 4 * BEAT) {
      const age = t - w.a, k = easeOut(age / (3 * FRAME)), sc = mix(1.3, 1, k);
      const out = remap(t, w.a + 4 * BEAT - 0.25, w.a + 4 * BEAT);
      ctx.save();
      ctx.globalAlpha = 1 - out;
      ctx.lineJoin = 'round';
      ctx.font = font(F.round, 800, 38); ctx.strokeStyle = 'rgba(4,6,20,0.92)'; ctx.lineWidth = 7; ctx.fillStyle = '#fff2a8';
      spaced(ctx, ann.jp || '', 960, 928, 4, 'center', 'both');
      ctx.translate(960, 982); ctx.scale(sc, sc); ctx.translate(-960, -982);
      ctx.font = font(F.round, 800, 64);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 12; spaced(ctx, String(ann.text).toUpperCase(), 963, 1008, 2, 'center', 'stroke');
      ctx.strokeStyle = '#05040c'; ctx.lineWidth = 10; ctx.fillStyle = '#ffe36a';
      spaced(ctx, String(ann.text).toUpperCase(), 960, 1004, 2, 'center', 'both');
      ctx.restore();
    }
    // ED roll from the second bar: every part is played by the same actor. It scrolls up a right
    // column on a soft plate, clipped between the bracket corners (never over a bracket or a label)
    const r0 = w.a + 4 * BEAT;
    if (t >= r0) {
      const a = easeOut(remap(t, r0, r0 + 0.4)) * fade;
      const L = Math.min(90, (x1 - x0) * 0.18);
      const cTop = Math.max(y0 + L + 24, 120), cBot = Math.min(y1 - L - 24, 1000);
      const xL = 1214, xR = 1806;
      const rollH = ED.reduce((p, r) => p + (r[0] === 'h' ? 58 : r[0] === 'g' ? 26 : r[0] === 'c' ? 46 : 38), 0);
      const yTop = mix(cBot + 40, 600 - rollH, clamp((t - r0) / (tOff - r0)));
      ctx.save();
      ctx.globalAlpha = a;
      // the plate follows the rows that are on screen (feathered, dense at the right like the HUD's)
      const pTop = Math.max(cTop - 20, yTop - 70), pBot = Math.min(cBot + 20, yTop + rollH + 10);
      if (pBot - pTop > 20) plate(ctx, xL - 150, pTop - 30, VW + 20 - (xL - 150), pBot - pTop + 60, 'rgba(4,4,12,', 'r', 0.55 * clamp((pBot - pTop) / 260));
      ctx.beginPath(); ctx.rect(xL - 20, cTop, xR - xL + 40, cBot - cTop); ctx.clip();
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 4;
      let y = yTop;
      for (const row of ED) {
        const ya = clamp(remap(y, cBot + 30, cBot - 40)) * clamp(remap(y, cTop, cTop + 60));
        ctx.globalAlpha = a * ya;
        if (row[0] === 'h') { ctx.fillStyle = '#f3c867'; ctx.font = font(F.cinzel, 700, 28); spaced(ctx, row[1], xL, y, 14, 'left', 'both'); y += 58; continue; }
        if (row[0] === 'g') { y += 26; continue; }
        if (row[0] === 'c') {
          ctx.fillStyle = '#ffffff'; ctx.font = font(F.min, 800, 26);
          spaced(ctx, row[1], xL, y + 1, 2, 'left', 'both');
          ctx.font = font(F.cinzel, 600, 21);
          const rw = spaced(ctx, row[2], xL + 112, y, 3, 'left', 'both');
          const aw = measure(ctx, 'THE FOOL', 3);
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          for (let dx = xL + 112 + rw + 12; dx < xR - aw - 12; dx += 10) ctx.fillRect(dx, y - 5, 2.5, 2.5);
          ctx.fillStyle = '#f3c867'; spaced(ctx, 'THE FOOL', xR, y, 3, 'right', 'both');
          y += 46; continue;
        }
        ctx.fillStyle = '#e4d9c3'; ctx.font = font(F.cinzel, 700, 17);
        spaced(ctx, row[1], xL, y, 5, 'left', 'both');
        ctx.fillStyle = '#ffffff'; ctx.font = font(F.min, 800, 19);
        spaced(ctx, row[2], xL + 124, y + 1, 1, 'left', 'both');
        y += 38;
      }
      ctx.restore();
    }
    return true;
  }
  const SLATE_END = 2.6;                                   // beats the clapperboard stays
  function drawSlate(ctx, t, w) {
    const age = t - w.a;
    if (age < 0 || age > SLATE_END * BEAT) return;
    const out = easeIn(remap(age, 1.9 * BEAT, SLATE_END * BEAT));
    ctx.save();
    ctx.translate(140, 170 - out * 520);
    ctx.rotate(-0.05);
    const bw = 430, bh = 250;
    // board
    ctx.fillStyle = '#121214'; ctx.fillRect(0, 0, bw, bh);
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, bw, bh);
    ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(0, 96); ctx.lineTo(bw, 96); ctx.moveTo(0, 168); ctx.lineTo(bw, 168); ctx.moveTo(bw / 2, 96); ctx.lineTo(bw / 2, 168); ctx.stroke();
    ctx.fillStyle = '#f2f2f2'; ctx.font = font(F.hud, 400, 28);
    spaced(ctx, String(S.title || 'Magnum Opus').toUpperCase(), 20, 66, 4);
    ctx.font = font(F.hud, 400, 12); ctx.fillStyle = '#9a9aa2';
    spaced(ctx, 'SC', 18, 118, 3); spaced(ctx, 'TK', bw / 2 + 16, 118, 3); spaced(ctx, 'DIR.', 18, 190, 3);
    ctx.font = font(F.hud, 400, 28); ctx.fillStyle = '#f2f2f2';
    spaced(ctx, String(Math.round(w.a / BAR)).padStart(3, '0'), 60, 150, 4);
    spaced(ctx, String(TRUMPS.length || 22), bw / 2 + 60, 150, 4);
    ctx.font = font(F.hud, 400, 22);
    spaced(ctx, 'THE FOOL', 80, 222, 4);
    // the stick: open on the first frame, shut on the slate
    const ang = age < FRAME ? -0.32 : age < 2 * FRAME ? -0.1 : 0;
    ctx.save();
    ctx.translate(0, 0); ctx.rotate(ang);
    ctx.fillStyle = '#121214'; ctx.fillRect(0, -50, bw, 46);
    ctx.save(); ctx.beginPath(); ctx.rect(0, -50, bw, 46); ctx.clip();
    ctx.fillStyle = '#f2f2f2';
    for (let x = -40; x < bw + 40; x += 64) { ctx.beginPath(); ctx.moveTo(x, -50); ctx.lineTo(x + 32, -50); ctx.lineTo(x + 2, -4); ctx.lineTo(x - 30, -4); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 2; ctx.strokeRect(0, -50, bw, 46);
    ctx.restore();
    if (age < 0.12 && !MO.reduced) {     // snap lines
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - age / 0.12)})`; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bw + 14 + i * 4, -60 + i * 18); ctx.lineTo(bw + 54 + i * 8, -78 + i * 22); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ================================================================ 15. coda card, final logo + つづく, fade to black
  function drawCodaCard(ctx, t) {
    const w = W_CODACARD;
    if (!w || t < w.a || t >= w.b) return false;
    const a = gate(t, w.a, w.b, 0.4, 0.35);
    if (a <= 0) return false;
    const st = styleOf('opus');
    const fool = TRUMP_N[0] || { numeral: '0', fr: 'Le Mat', en: 'The Fool', jp: '愚者' };
    ctx.save();
    ctx.globalAlpha = a;
    const x = 58, y = 48, kIn = easeOut(remap(t, w.a, w.a + 0.5));
    plate(ctx, x - 40, y - 26, 700 * kIn, 150, st.plate, 'l', 0.75);
    ctx.drawImage(cardImg(0, 120), x, y - 8, 64, 64 * 208 / 120);
    const tx = x + 86;
    ctx.fillStyle = st.ink; ctx.font = font(F.cinzel, 700, 30);
    const nw = spaced(ctx, `${fool.numeral} · ${String(fool.fr).toUpperCase()}`, tx, y + 28, 9);
    ctx.fillStyle = st.acc; ctx.font = font(F.min, 800, 22);
    spaced(ctx, `${fool.jp}・${KANJI.opus}`, tx + 1, y + 62, 6);
    ctx.fillStyle = st.ink; ctx.font = font(F.cinzel, 600, 15);
    spaced(ctx, `${String(fool.en).toUpperCase()} · OPUS`, tx + 1, y + 90, 6);
    ctx.fillStyle = st.acc; rule(ctx, tx + nw + 16, y + 18, tx + nw + 16 + 120 * kIn, 1.2);
    ctx.restore();
    return true;
  }
  function drawLogo(ctx, t) {
    if (!W_LOGO || t < W_LOGO.a) return false;
    const L0 = W_LOGO.a, L1 = W_LOGO.b;
    const ub = (t - L0) / BEAT;
    const fade = easeIn(remap(t, L1 - 0.85, L1 - 0.2));
    const px = 162, base = 862;
    const bm = chromeWord(String(S.title || 'Magnum Opus').toUpperCase(), px, 'logo');
    const x = 960 - bm.w / 2;
    const rev = easeOut(remap(ub, 0, 0.6));
    if (fade < 1) {
      ctx.save();
      const ha = easeOut(remap(ub, 0, 0.8));
      ctx.save(); ctx.translate(960, base - bm.capH * 0.45); ctx.scale(1, 0.2);
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 900);
      hg.addColorStop(0, `rgba(255,170,60,${0.32 * ha})`); hg.addColorStop(0.5, `rgba(200,80,20,${0.12 * ha})`); hg.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = hg; ctx.fillRect(-900, -900, 1800, 1800);
      ctx.restore();
      ctx.fillStyle = '#f3c867';
      const rw = 640 * easeOut(remap(ub, 0.15, 0.8));
      rule(ctx, 960 - rw, 722, 960 - 16, 1.2); rule(ctx, 960 + 16, 722, 960 + rw, 1.2);
      ctx.save(); ctx.translate(960, 722); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.rect(x - bm.ox, base - bm.oy, (bm.cw) * rev, bm.ch); ctx.clip();
      ctx.drawImage(bm.c, x - bm.ox, base - bm.oy, bm.cw, bm.ch);
      ctx.restore();
      if (rev < 1) {
        const ex = x - bm.ox + bm.cw * rev;
        ctx.save(); ctx.beginPath(); ctx.rect(ex - 60, base - bm.oy, 70, bm.ch); ctx.clip();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(bm.white, x - bm.ox, base - bm.oy, bm.cw, bm.ch);
        ctx.restore();
        star(ctx, ex, base - bm.capH * 0.5, 120, 1 - rev * 0.5);
      }
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
        const gx = 960 - (fx - 960) * 0.6, gy = 540 - (fy - 540) * 0.6;
        [[0.0, 26, '255,190,90'], [0.35, 14, '120,200,255'], [0.7, 40, '255,120,90'], [1.1, 9, '200,255,190']].forEach(([k, r, col]) => {
          const px2 = mix(fx, gx, k), py2 = mix(fy, gy, k);
          const g = ctx.createRadialGradient(px2, py2, 0, px2, py2, r);
          g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.8, `rgba(${col},${0.22 * fa})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px2, py2, r, 0, TAU); ctx.fill();
        });
        ctx.restore();
      }
      if (rev >= 1) {
        star(ctx, x + bm.w * 0.035, base - bm.capH * 0.98, 46 * (0.6 + 0.4 * Math.sin(t * 7)), 0.9);
        star(ctx, x + bm.w * 0.93, base - bm.capH * 0.2, 36 * (0.6 + 0.4 * Math.sin(t * 9 + 2)), 0.8);
      }
      const k2 = remap(ub, 0.45, 0.8);
      ctx.globalAlpha = k2;
      ctx.font = font(F.min, 800, 40); ctx.fillStyle = '#f3c867';
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(10,4,0,0.9)'; ctx.lineWidth = 6;
      spaced(ctx, S.titleJp || '', 960, 930, 24, 'center', 'both');
      const k3 = easeOutBack(remap(ub, 0.7, 1.0), 1.6);
      if (k3 > 0) {
        ctx.globalAlpha = clamp(k3);
        ctx.save(); ctx.translate(960, 978); ctx.rotate(-0.035); ctx.scale(k3, k3);
        ctx.font = font(F.chrome, 900, 38);
        ctx.strokeStyle = '#08030a'; ctx.lineWidth = 9; ctx.fillStyle = '#ffffff';
        spaced(ctx, `(${S.subtitle || ''})`, 0, 13, 2, 'center', 'both');
        ctx.restore();
      }
      // つづく: the anime end-of-episode tag, in the last bar
      const tz = L1 - BAR;
      if (t >= tz && arr(S.trumps).length) {
        const kz = easeOut(remap(t, tz, tz + 0.3));
        ctx.globalAlpha = kz;
        ctx.save();
        ctx.translate(1772, 1018);
        ctx.font = font(F.min, 800, 34); ctx.fillStyle = '#f4ecd8'; ctx.strokeStyle = 'rgba(10,4,0,0.9)'; ctx.lineWidth = 5;
        spaced(ctx, 'つづく', 0, 0, 8, 'right', 'both');
        ctx.font = font(F.cinzel, 600, 16); ctx.fillStyle = '#f3c867';
        spaced(ctx, 'TO BE CONTINUED', 0, 30, 6, 'right', 'both');
        ctx.restore();
      }
      ctx.restore();
    }
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, VW, 1080); }
    return true;
  }

  // the shout syllables of the three gap inserts (beats after each window start)
  // Fallbacks (until the score carries entry.syllables): the onsets measured on the full soundtrack
  // (audio/timing.json, score_syllables_beats), in beats after the announcer entry's beat
  const INS_SYL = {
    albedo: W_ALB ? shoutSyllables(W_ALB, 3, [0, 0.567, 0.918]) : [0, 0.567, 0.918],
    citrinitas: W_CIT ? shoutSyllables(W_CIT, 4, [0, 0.351, 1.009, 1.349]) : [0, 0.351, 1.009, 1.349],
    rubedo: W_RUB ? shoutSyllables(W_RUB, 3, [0, 0.64, 1.17]) : [0, 0.64, 1.17],
  };

  // ================================================================ cache warm-up
  // A chrome bitmap costs a few to ~40 ms (SwiftShader); the warm-up builds the ones due in the
  // next few seconds in the background, one per tick, so a word never stalls its own frame. The
  // output is identical either way (the caches only save work).
  const WARM = [];
  const addWarm = (t, fn) => WARM.push({ t, fn });
  HOOK.forEach((l) => {
    const lay = () => hookLayout(l);
    l.toks.forEach((w) => addWarm(l.t0 - 0.2, () => chromeWord(w.text, lay().px, l.kind)));
    if (l.hold) { const w = l.toks[l.toks.length - 1]; addWarm(l.hold.tGrow - 0.5, () => chromeWord(w.text, heldBig(l, w), l.kind)); addWarm(l.hold.tGrow, () => chromeWord(w.text, heldBig(l, w), 'gold')); }
  });
  CHOPS.forEach((c) => c.syl.forEach((sy) => addWarm(c.t0 - 0.2, () => chromeWord(sy.text, CHOP_PX, c.kind, true))));
  if (W_TITLE) addWarm(W_TITLE.a - 1, () => chromeWord(String(S.title || 'Magnum Opus').toUpperCase(), 150, 'logo'));
  if (W_EYE) { addWarm(W_EYE.a - 2, () => chromeWord(String(S.title || 'Magnum Opus').toUpperCase(), 108, 'logo')); addWarm(W_EYE.a - 1.5, () => toneImg()); addWarm(W_EYE.a - 1.2, () => cardImg(12, 420)); }
  if (W_LOGO) addWarm(W_LOGO.a - 1, () => chromeWord(String(S.title || 'Magnum Opus').toUpperCase(), 162, 'logo'));
  LIFT.filter((l) => l.last).forEach((l) => { const k = l.toks[l.toks.length - 1]; addWarm(l.t0 - 0.3, () => chromeWord(k.text.toUpperCase(), 102, 'silver')); });
  RAP.filter((l) => l.style === 'hype' && l.last).forEach((l) => addWarm(l.t0 - 0.3, () => { /* built on first use via the layout */ }));
  if (HAS_ROLL) CHAK.forEach((c, i) => addWarm(c.t - 0.3, () => (i < CHAK.length - 1 ? chromeWord(c.metalEn, 84, 'gold') : chromeWord(c.metalText.replace(/[^A-Z!]/g, '') || 'GOLD!', 250, 'gold'))));
  TRUMPS.forEach((tr) => addWarm(tr.t - 0.5, () => cardImg(tr.n, 60)));
  if (W_WHEEL) for (let n = 0; n < 22; n++) { addWarm(W_WHEEL.a - 2, () => cardImg(n, 120)); addWarm(W_WHEEL.a - 1, () => cardImg(n, 240)); }
  WARM.sort((p, q) => p.t - q.t);
  let warmTimer = 0, warmDone = new Set();
  // one job per idle period (requestIdleCallback where there is one), so a build lands between frames
  const later = (fn, ms) => (window.requestIdleCallback ? setTimeout(() => requestIdleCallback(fn, { timeout: 400 }), ms) : setTimeout(fn, ms));
  function warmTick() {
    warmTimer = 0;
    const lo = lastT - 0.5, hi = lastT + 8;
    for (let i = 0; i < WARM.length; i++) {
      const j = WARM[i];
      if (j.t > hi) break;
      if (j.t < lo || warmDone.has(i)) continue;
      warmDone.add(i);
      try { j.fn(); } catch (e) { /* warming is best effort */ }
      warmTimer = later(warmTick, 30);
      return;
    }
    warmTimer = later(warmTick, 250);
  }
  function startWarm() {
    if (warmTimer) clearTimeout(warmTimer);
    warmDone = new Set();
    warmTimer = later(warmTick, 60);
  }

  // ================================================================ the overlay callback
  MO.overlay((ctx, t, W, H) => {
    if (H !== curH) { cache.clear(); big.clear(); bigPx = 0; cards.clear(); rayGrad.clear(); curH = H; s = H / 1080; startWarm(); }
    if (Math.abs(t - lastT) > 2) warmDone = new Set();
    lastT = t;
    s = H / 1080; VW = W / s;
    ctx.scale(s, s);
    ctx.textBaseline = 'alphabetic';
    let drew = false;
    const layer = (fn) => { ctx.save(); try { if (fn(ctx, t)) drew = true; } finally { ctx.restore(); } };
    layer(drawWheel);
    layer(drawMotto);
    layer(drawHUD);
    layer(drawRail);
    layer(drawCredits);
    layer(drawHenshin);
    layer(drawRollCall);
    layer(drawChakraGauge);
    layer(drawChops);
    layer(drawGhost);
    layer(drawRap);
    layer(drawLift);
    layer(drawBridge);
    layer(drawHermit);
    layer(drawHook);
    layer(drawCodaLyric);
    layer(drawCaption);
    layer(drawEpisode);
    layer(drawTitleCard);
    layer(drawViewfinder);
    layer(drawCodaCard);
    layer(drawLogo);
    layer(drawEyecatch);
    layer(drawNigredo);
    layer(drawAlbedo);
    layer(drawCitrinitas);
    layer(drawRubedo);
    return drew;
  });
})();
