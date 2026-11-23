// NO SURVIVORS: Keep Them Dancing. overlay.js: the kinetic typography layer.
// Draws everything textual that comes from the score on the overlay canvas: lyrics (SCORE.vocals.lines),
// spoken lines (SCORE.vocals.spoken: Lou's radio lower-third, Tiny's count, GOOD NIGHT!, the groan, the Roadie's
// mic check, the fan), banter captions (SCORE.captions: speech bubbles at S.anchors[who], else subtitles, or the
// phone shelf's two lanes) and cards (SCORE.cards: title, intro, chapter, special, warning, end).
//
// NS.overlay.draw(ctx, S)      ctx is already transformed to the 1280 x 720 frame (+ the shelf below y 720) and
//                              cleared. A pure function of S.t (+ S.anchors, S.shelf, S.cssScale, S.now, S.reduced,
//                              S.shakeK, S.shakeXY, S.witching, S.night). Every item is placed ONCE (cached by id) from
//                              NS.engine.layoutAt(onset) + the clue holds it overlaps (SPEC 10.6); bubbles follow the
//                              live anchor.
// NS.overlay.layout(S)         -> [{ kind, id, rect: [x, y, w, h] }] the text rects drawn at S.t (no drawing).
// NS.overlay.logo(ctx, cx, cy, w, k?)  draws the band logo (cached sprite) centred at (cx, cy), w units wide.
// NS.overlay.items()           -> the parsed schedule (lines, spoken, captions, cards) for tests.
// NS.overlay.init()            called by the engine after the fonts load (parses the schedule).
// Legibility: CSS px per frame unit = S.cssScale (else ctx.canvas.clientWidth / 1280), never below a 390 px phone's;
//   lyrics >= 17 CSS px, captions >= 12.5, card titles >= 26 (the chapter slate's title >= 14: it is a small slate).
// Phone shelf (S.shelf.h > 0): banter captions, Lou and the fan go to two subtitle lanes below y 720.
// Memory: sprites via NS.makeCanvas(w, h, 'overlay'); card sprites are freed when the clock is far from the card.
(function () {
  'use strict';
  const NS = window.NS;
  if (!NS) { console.error('overlay.js: core.js must load first'); return; }
  const SCORE = window.SCORE || {};
  const W = NS.W, H = NS.H, BEAT = NS.BEAT, BAR = NS.BAR, STEP = NS.STEP;
  const clamp = NS.clamp, lerp = NS.lerp, smoothstep = NS.smoothstep, EZ = NS.ease, hash = NS.hash, noise1 = NS.noise1;
  const C = NS.C, F = NS.F, WHO = NS.WHO, TAU = Math.PI * 2;
  const PHONE = 390 / 1280;
  const tb = (bar, beat) => (+bar || 0) * BAR + (+beat || 0) * BEAT;
  const sid = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 99991; };
  const INK = '#07070a';
  const WHITE = '#fbfaf5';
  const GANG = C.tiny, ZOMB = '#a9d44e', LOU = WHO.LOU || '#9fe8ff';
  const SINGER_COL = { vex: C.vex, gang: GANG, zombies: ZOMB, crowd: ZOMB };
  const BANDS = { top: [40, 40, 1200, 160], center: [40, 260, 1200, 200], bottom: [40, 520, 1200, 170] };
  const BANDS_BIG = { top: [24, 24, 1232, 220], center: [24, 205, 1232, 310], bottom: [24, 455, 1232, 245] };
  const ZONES = { title: [240, 180, 800, 360], chapter: [40, 30, 480, 140], warning: [340, 200, 600, 320], special: [0, 520, 1280, 200], end: [240, 220, 800, 280] };
  const CUT_RE = /(—|–|-|\.\.\.|…)$/;

  // ================================================================================================ schedule
  // Lyric styles: verse (karaoke lower third), confess (verse 2's dry lines), gang, chorus, zombie (chant), call,
  // response (the biggest), count (Tiny's count-in: the numbers pile up, each bigger), shout (GOOD NIGHT!).
  const STY = {
    verse:    { slam: false, base: 54, maxRows: 2, rowH: 1.07, cap: 0.86, gap: 0.27, pad: 12, tail: 0.45, out: 0.22, pre: 0.4 },
    confess:  { slam: false, base: 54, maxRows: 2, rowH: 1.07, cap: 0.86, gap: 0.27, pad: 12, tail: 0.5, out: 0.3, pre: 0.4 },
    gang:     { slam: true, max: 124, maxRows: 2, rowH: 0.97, cap: 0.86, gap: 0.22, acc: 1.25, pad: 18, tail: 0.5, out: 0.12, pre: 0.06 },
    chorus:   { slam: true, max: 152, maxRows: 2, rowH: 0.97, cap: 0.86, gap: 0.2, acc: 1.36, pad: 20, tail: 0.8, out: 0.13, pre: 0.06 },
    zombie:   { slam: true, max: 140, maxRows: 2, rowH: 1.0, cap: 0.86, gap: 0.24, acc: 1.2, pad: 30, tail: 0.6, out: 0.16, pre: 0.06 },
    call:     { slam: true, max: 140, maxRows: 1, rowH: 0.97, cap: 0.86, gap: 0.2, acc: 1.28, pad: 20, tail: 0.6, out: 0.12, pre: 0.06, big: true },
    response: { slam: true, max: 220, maxRows: 1, rowH: 0.97, cap: 0.86, gap: 0.18, acc: 1, pad: 28, tail: 0.6, out: 0.14, pre: 0.06, big: true },
    count:    { slam: true, max: 210, maxRows: 1, rowH: 0.97, cap: 0.74, gap: 0.2, acc: 1, pad: 24, tail: 0.1, out: 0.06, pre: 0.05, big: true, fam: 'comic' },
    shout:    { slam: true, max: 168, maxRows: 1, rowH: 0.97, cap: 0.86, gap: 0.2, acc: 1.22, pad: 22, tail: 0.12, out: 0.14, pre: 0.06, big: true },
  };
  function styleOf(l) {
    const part = String(l.part || ''), singer = String(l.singer || '');
    if (part === 'response') return 'response';
    if (part === 'call') return 'call';
    if (part === 'chant' || singer === 'zombies') return 'zombie';
    if (part === 'chorus' || part === 'lift') return 'chorus';
    if (singer === 'gang') return 'gang';
    if (l.fx === 'dry') return 'confess';
    return 'verse';
  }
  const lettersOf = (s) => String(s).replace(/[^A-Za-z]/g, '');
  const isCapsWord = (s) => { const L = lettersOf(s); return L.length >= 2 && L === L.toUpperCase(); };

  let SCH = null;
  function build() {
    const V = SCORE.vocals || {};
    const lines = [], spoken = [], caps = [], cards = [];
    (V.lines || []).forEach((l, li) => {
      if (!l || !Array.isArray(l.words) || !l.words.length) return;
      const notes = (Array.isArray(l.notes) ? l.notes : []).slice().sort((a, b) => a[1] - b[1]);
      const t0 = tb(l.bar);
      const st = styleOf(l);
      const ws = l.words.map((w, j) => ({ text: String(w[0]), step: +w[1] || 0, j }));
      ws.forEach((w, j) => {
        const nx = j + 1 < ws.length ? ws[j + 1].step : Infinity;
        let end = w.step + 2, len = 0;
        notes.forEach((n) => { if (n[1] >= w.step - 1e-6 && n[1] < nx - 1e-6) { end = Math.max(end, n[1] + n[2]); len += n[2]; } });
        w.t = t0 + w.step * STEP; w.tEnd = t0 + end * STEP; w.len = len;
      });
      (Array.isArray(l.gangOn) ? l.gangOn : []).forEach((si) => {
        const n = notes[si]; if (!n) return;
        let wi = 0; ws.forEach((w, j) => { if (w.step <= n[1] + 1e-6) wi = j; });
        ws[wi].gang = true;
      });
      // accents: the longest held word (>= 8 steps) of a shouted line; STOPS always; RUN! in a verse
      if (STY[st].slam && st !== 'response' && ws.length > 2) {
        let bi = -1, bl = 7.5;
        ws.forEach((w, j) => { if (w.len > bl) { bl = w.len; bi = j; } });
        if (bi >= 0) ws[bi].acc = true;
      }
      ws.forEach((w) => { if (/^STOPS?\b/i.test(w.text) && STY[st].slam) w.acc = true; w.stops = /^STOPS?\b/i.test(w.text); });
      if (!STY[st].slam) ws.forEach((w) => { if (isCapsWord(w.text) && !/\./.test(w.text) && /[a-z]/.test(l.text || '') && lettersOf(w.text).length >= 3) w.acc = true; });
      const singers = String(l.singer || 'vex').split('+');
      const layers = singers.map((s) => SINGER_COL[s] || C.vex);
      const tEndLine = Math.max(...ws.map((w) => w.tEnd));
      const item = {
        id: 'L:' + (l.id || li), kind: 'line', src: l, st, words: ws, layers, singers,
        zombie: singers.indexOf('zombies') >= 0, zone: l.zone && l.zone !== 'auto' ? l.zone : null,
        monster: st === 'response' ? (singers.indexOf('gang') >= 0 ? 0.35 : 0.6) : 1,
        tFirst: ws[0].t, tLast: ws[ws.length - 1].t, tEnd: tEndLine, seed: sid(l.id || li), card: l.display === 'card',
      };
      if (item.card) { lines.push(item); return; }
      item.tIn = item.tFirst - STY[st].pre;
      lines.push(item);
    });
    // spoken
    (V.spoken || []).forEach((sp, si) => {
      if (!sp || !sp.text) return;
      const win = Array.isArray(sp.win) ? sp.win : [tb(sp.bar, sp.beat) / BEAT, tb(sp.bar, sp.beat) / BEAT + 4];
      const w0 = win[0] * BEAT, w1 = win[1] * BEAT;
      const hasDur = sp.dur != null && isFinite(+sp.dur) && +sp.dur > 0;
      const tLine = hasDur ? w0 : tb(sp.bar, sp.beat);
      const tEnd = hasDur ? w0 + (+sp.dur) : w1;
      const texts = String(sp.text).split(/\s+/).filter(Boolean);
      let words;
      if (Array.isArray(sp.words) && sp.words.length) {
        // rendered (dur known): [word, secFromLineStart]; hand-written: [word, step] (16ths from bar/beat)
        let secs = hasDur;
        if (secs && sp.words.some((w) => +w[1] > (w1 - w0) + 1.5)) secs = false;
        words = sp.words.map((w) => ({ text: String(w[0]), t: secs ? w0 + (+w[1] || 0) : tb(sp.bar, sp.beat) + (+w[1] || 0) * STEP }));
      } else {
        const span = hasDur ? +sp.dur : (w1 - w0) * 0.94;
        const tot = texts.reduce((a, s) => a + s.length + 1, 0);
        let acc = 0;
        words = texts.map((s) => { const o = { text: s, t: w0 + span * (acc / tot) }; acc += s.length + 1; return o; });
      }
      words.forEach((w, j) => { w.j = j; });
      const voice = String(sp.voice || '');
      const base = { id: 'S:' + (sp.id || si), src: sp, words, tLine, tEnd, w0, w1, text: String(sp.text), seed: sid(sp.id || si), voice };
      if (voice === 'lou' || sp.fx === 'radio') {
        spoken.push(Object.assign(base, { kind: 'lou', tIn: words[0].t - 0.3, tOut: Math.max(tEnd, words[words.length - 1].t + 0.6) + 0.55 }));
      } else if (voice === 'tiny' || voice === 'vex' || sp.fx === 'shout') {
        // shouts are kinetic type: lyric-like lines
        const st = voice === 'tiny' ? 'count' : 'shout';
        const ws = words.map((w, j) => ({ text: w.text, t: w.t, tEnd: j + 1 < words.length ? words[j + 1].t : Math.max(w.t + 0.35, tEnd), len: 4, j }));
        if (st === 'shout') ws[ws.length - 1].acc = true;
        const who = voice === 'tiny' ? 'tiny' : 'vex';
        lines.push({
          id: base.id, kind: 'line', src: sp, st, words: ws, layers: [who === 'tiny' ? GANG : C.vex], singers: [who],
          zombie: false, zone: null, tFirst: ws[0].t, tLast: ws[ws.length - 1].t, tEnd, seed: base.seed, tIn: ws[0].t - STY[st].pre,
        });
      } else if (voice === 'zombie' || voice === 'crowd') {
        spoken.push(Object.assign(base, { kind: 'whisper', tIn: words[0].t - 0.15, tOut: Math.max(tEnd, words[words.length - 1].t + 0.9) + 0.6 }));
      } else if (voice === 'roadie') {
        spoken.push(Object.assign(base, { kind: 'boom', tIn: words[0].t - 0.05, tOut: Math.max(tEnd, words[words.length - 1].t + 0.6) + 0.35 }));
      } else {
        spoken.push(Object.assign(base, { kind: 'fan', tIn: words[0].t - 0.1, tOut: Math.max(tEnd, words[words.length - 1].t + 0.9) + 0.4 }));
      }
    });
    // a verse line's dim preview waits for a card that leaves before its first word
    (SCORE.cards || []).forEach((c) => {
      if (!c || c.type === 'chapter' || c.type === 'warning') return;
      const c0 = tb(c.bar, c.beat), c1 = c0 + (+c.beats || 4) * BEAT;
      lines.forEach((L) => { if (!L.card && !STY[L.st].slam && L.tIn < c1 && c1 <= L.tFirst + 0.02 && c0 < L.tIn) L.tIn = c1; });
    });
    // line exits: after the last syllable, or when the next line arrives
    const shown = lines.filter((L) => !L.card).sort((a, b) => a.tFirst - b.tFirst);
    shown.forEach((L, i) => {
      const s = STY[L.st];
      const nx = shown[i + 1];
      let out = L.tEnd + s.tail;
      if (L.st === 'shout') out = L.tEnd + s.out;          // GOOD NIGHT! punches out on the final hit
      if (nx && nx.tIn < out && nx.tIn > L.tLast + 0.05) out = nx.tIn;
      L.tOut = out;
    });
    // nothing lyrical survives into the title card's slam
    (SCORE.cards || []).forEach((c) => {
      if (!c || c.type !== 'title') return;
      const tc = tb(c.bar, c.beat) - 0.08;
      shown.forEach((L) => { if (L.tIn < tc && L.tOut > tc) L.tOut = tc; });
    });
    // captions
    (SCORE.captions || []).forEach((c, i) => {
      if (!c || !c.text) return;
      const nW = String(c.text).trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
      const cut = CUT_RE.test(String(c.text).trim());
      const t0 = tb(c.bar, c.beat), t1 = t0 + Math.max(+c.beats || 3, cut ? 0 : Math.max(3, nW / 1.25)) * BEAT;
      const L = lettersOf(c.text);
      const up = L.length ? L.replace(/[^A-Z]/g, '').length / L.length : 0;
      const shape = up > 0.7 ? 'burst' : /^(\.\.\.|…)|(\.\.\.|…)$/.test(c.text.trim()) && !/!$/.test(c.text) ? 'whisper' : 'round';
      caps.push({ id: 'C:' + i, kind: 'cap', src: c, who: String(c.who || '').toUpperCase(), text: String(c.text), t0, t1, tIn: t0, tOut: t1, shape, seed: sid('cap' + i), cut });
    });
    // cards
    (SCORE.cards || []).forEach((c, i) => {
      if (!c || !c.type) return;
      const t0 = tb(c.bar, c.beat), t1 = t0 + (+c.beats || 4) * BEAT;
      const card = { id: 'K:' + i + ':' + c.type, kind: 'card', type: c.type, src: c, t0, t1, tIn: t0, tOut: t1, seed: sid('card' + i) };
      if (c.type === 'intro') {
        const g = lines.find((L) => L.card && Math.abs(L.src.bar - c.bar) < 1e-6);
        card.punch = g ? g.tFirst : t0;
        card.gang = g || null;
      }
      if (c.type === 'title') { card.tIn = t0 - 0.08; card.pre = 0.08; }
      cards.push(card);
    });
    // one read at a time: an incoming caption/card pushes the outgoing one out within 0.25 beat
    const reads = caps.concat(cards).sort((a, b) => a.t0 - b.t0);
    for (let i = 0; i + 1 < reads.length; i++) {
      const a = reads[i], b = reads[i + 1];
      if (b.t0 < a.tOut - 1e-6) a.tOut = Math.max(a.t0 + 0.3, b.t0 + 0.1);
    }
    // Lou's lines that follow within 0.6 s chain into one panel run (the text swaps, the panel stays)
    const lous = spoken.filter((x) => x.kind === 'lou').sort((a, b) => a.tIn - b.tIn);
    let grp = null;
    lous.forEach((x, i) => {
      const nx = lous[i + 1];
      if (!grp) grp = { id: 'G:' + x.id, kind: 'louRun', items: [], tIn: x.tIn };
      grp.items.push(x); x.group = grp;
      if (nx && nx.tIn - x.tOut < 0.6) {
        // the old line stays on air until the new one's first word
        const sw = Math.max(x.words[x.words.length - 1].t + 0.3, nx.words[0].t - 0.06);
        x.tOut = sw; nx.tIn = sw; x.chainOut = true; nx.chainIn = true;
      }
      else { grp.tOut = x.tOut; grp = null; }
    });
    // phone shelf lanes: banter on lane 0, Lou and the fan on lane 1; overlapping banter flips lanes
    const shelfItems = caps.concat(spoken.filter((s) => s.kind === 'lou' || s.kind === 'fan')).sort((a, b) => a.tIn - b.tIn);
    shelfItems.forEach((it, i) => {
      it.lane = it.kind === 'cap' ? 0 : 1;
      for (let j = 0; j < i; j++) {
        const o = shelfItems[j];
        if (o.tOut > it.tIn + 0.05 && o.lane === it.lane) it.lane = 1 - it.lane;
      }
    });
    shelfItems.forEach((it) => { it.laneShare = shelfItems.some((o) => o !== it && Math.min(o.tOut, it.tOut) - Math.max(o.tIn, it.tIn) > 0.35); });
    const gaps = (SCORE.gaps || []).map((g) => ({ t0: g.fromBeat * BEAT, t1: g.toBeat * BEAT }));
    const clues = (SCORE.clues || []).filter((c) => c && c.id && Array.isArray(c.hold));
    SCH = { lines, shown, spoken, caps, cards, gaps, clues, all: shown.concat(spoken, caps, cards) };
    return SCH;
  }
  const sched = () => SCH || build();

  // ================================================================================================ environment
  let fontsOK = false;
  function checkFonts() {
    if (fontsOK) return true;
    try {
      fontsOK = !document.fonts || ['Metal Mania', 'Anton', 'Bangers', 'Share Tech Mono', 'Special Elite'].every((f) => document.fonts.check("40px '" + f + "'"));
    } catch (e) { fontsOK = true; }
    if (fontsOK) WCACHE.clear();
    return fontsOK;
  }
  // E: per-frame environment. k = CSS px per frame unit used for minimum sizes (never below the 390 px phone).
  function envOf(ctx, S) {
    let cs = +S.cssScale;
    if (!(cs > 0)) { const cw = ctx && ctx.canvas && ctx.canvas.clientWidth; cs = cw ? cw / W : 1; }
    const k = Math.max(PHONE, Math.round(Math.max(cs, PHONE) * 40) / 40);
    const sh = S.shelf && +S.shelf.h > 0 ? { y: +S.shelf.y || H, h: +S.shelf.h } : null;
    const witching = !!(S.witching != null ? S.witching : NS.witching);
    const f = checkFonts();
    return {
      k, shelf: sh, witching, fonts: f,
      minU: (px) => px / k,
      key: [k.toFixed(3), sh ? sh.h : 0, witching ? 1 : 0, f ? 1 : 0].join('|'),
    };
  }
  // ---- layout sampling: NS.engine.layoutAt, or the clue registry when the engine is absent ----------------
  const rectOk = (r) => Array.isArray(r) && r.length >= 4 && r.slice(0, 4).every(isFinite) && r[2] > 0 && r[3] > 0;
  const sameRect = (a, b) => a && b && Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5 && Math.abs(a[2] - b[2]) < 0.5 && Math.abs(a[3] - b[3]) < 0.5;
  function layoutAt(t, E) {
    const out = { zone: null, kos: [] };
    let L = null;
    if (NS.engine && typeof NS.engine.layoutAt === 'function') { try { L = NS.engine.layoutAt(t); } catch (e) { L = null; } }
    if (L) {
      out.zone = /^(top|bottom|center)$/.test(L.lyricZone) ? L.lyricZone : null;
      const clueR = (L.clueRects || []).map((c) => c && c.rect).filter(rectOk);
      (L.keepOut || []).forEach((r) => { if (rectOk(r)) out.kos.push({ r: r.slice(0, 4).map(Number), hard: clueR.some((c) => sameRect(c, r)) }); });
      clueR.forEach((c) => { if (!out.kos.some((k) => sameRect(k.r, c))) out.kos.push({ r: c.slice(0, 4).map(Number), hard: true }); });
      return out;
    }
    sched().clues.forEach((c) => {
      if (c.witching && !E.witching) return;
      if (t < c.hold[0] * BAR - 1e-6 || t >= c.hold[1] * BAR) return;
      const reg = NS.clues && NS.clues[c.id];
      let r = reg && reg.rect;
      if (typeof r === 'function') { try { r = r({ t, bar: t / BAR, beat: t / BEAT, W, H, witching: E.witching, night: NS.night }); } catch (e) { r = null; } }
      if (rectOk(r)) out.kos.push({ r: r.slice(0, 4).map(Number), hard: true });
    });
    return out;
  }
  // keep-outs for an item living over [t0, t1]: layoutAt(onset) + every clue hold it overlaps
  function kosFor(t0, t1, E) {
    const ts = [t0 + 0.02];
    sched().clues.forEach((c) => {
      if (c.witching && !E.witching) return;
      const h0 = c.hold[0] * BAR, h1 = c.hold[1] * BAR;
      if (h1 > t0 && h0 < t1) ts.push(Math.max(t0, h0) + 0.02);
    });
    const kos = [];
    let zone = null;
    ts.forEach((t, i) => {
      const L = layoutAt(t, E);
      if (i === 0) zone = L.zone;
      L.kos.forEach((k) => { if (!kos.some((o) => sameRect(o.r, k.r))) kos.push(k); });
    });
    return { zone, kos };
  }

  // ================================================================================================ measuring
  let MC = null;
  const WCACHE = new Map();
  function mctx() { if (!MC) MC = NS.makeCanvas(8, 8, 'overlay').getContext('2d'); return MC; }
  // width of text at 100 px in family fam
  function w100(text, fam) {
    const key = fam + '\u0001' + text;
    let v = WCACHE.get(key);
    if (v == null) {
      const m = mctx(); m.font = '100px ' + fam; v = m.measureText(text).width;
      if (WCACHE.size > 5000) WCACHE.clear();
      WCACHE.set(key, v);
    }
    return v;
  }
  const tw = (text, fam, size) => w100(text, fam) * size / 100;
  const spacedW = (text, fam, size, sp) => { let w = 0; for (const ch of text) w += tw(ch, fam, size) + sp; return Math.max(0, w - sp); };
  // greedy wrap words into lines of at most maxW (first line may be indented)
  function wrap(words, fam, size, maxW, indent0) {
    const sw = tw(' ', fam, size);
    const out = [];
    let cur = [], cw = indent0 || 0;
    words.forEach((w) => {
      const ww = tw(w, fam, size);
      const add = (cur.length ? sw : 0) + ww;
      if (cur.length && cw + add > maxW) { out.push(cur); cur = [w]; cw = ww; }
      else { cur.push(w); cw += add; }
    });
    if (cur.length) out.push(cur);
    return out;
  }
  const lineW = (ws, fam, size) => tw(ws.join(' '), fam, size);
  // ---- geometry ----------------------------------------------------------------------------------------------
  function inter(a, b) {
    const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
    const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    return x * y;
  }
  // penalty of a rect against keep-outs: hard (clue) rects are near-absolute, soft ones tolerate 10%
  function penalty(r, kos, res) {
    let p = 0;
    const A = r[2] * r[3];
    kos.forEach((k) => {
      const o = inter(r, k.r);
      if (o <= 0) return;
      const f = o / Math.max(1, Math.min(A, k.r[2] * k.r[3]));
      if (k.hard) p += f > 0.004 ? 20 + f * 20 : f;
      else p += f > 0.1 ? 2 + f * 2 : f * 0.4;
    });
    (res || []).forEach((q) => { const o = inter(r, q); if (o > 0) p += 4 + 8 * o / Math.max(1, Math.min(A, q[2] * q[3])); });
    const ox = Math.max(0, 12 - r[0]) + Math.max(0, r[0] + r[2] - (W - 12)), oy = Math.max(0, 8 - r[1]) + Math.max(0, r[1] + r[3] - (H - 6));
    if (ox + oy > 0) p += 3 + (ox + oy) / 40;
    return p;
  }
  const expand = (r, m) => [r[0] - m, r[1] - m, r[2] + 2 * m, r[3] + 2 * m];

  // ================================================================================================ placement cache
  const PCACHE = new Map();
  function cached(id, E, fn) {
    let m = PCACHE.get(E.key);
    if (!m) { if (PCACHE.size > 5) PCACHE.clear(); m = new Map(); PCACHE.set(E.key, m); }
    let v = m.get(id);
    if (v === undefined) { v = fn(); m.set(id, v); }
    return v;
  }
  const overlaps = (a, b) => a.tOut > b.tIn + 1e-6 && a.tIn < b.tOut - 1e-6;

  // ---- cards: the rect each card occupies (its fixed layout) ----------------------------------------------
  function cardRect(card, E) {
    return cached(card.id + ':rect', E, () => {
      const c = card.src;
      if (card.type === 'intro') { const L = introLayout(card, E); return L.rect; }
      if (card.type === 'chapter') { const L = slateLayout(card, E); return [L.x - 6, L.y - 6, L.w + 12, L.h + 12]; }
      if (card.type === 'special') return ZONES.special;
      if (card.type === 'title') return [200, 160, 880, 400];
      if (card.type === 'end') return endLayout(card, E).rect;
      if (card.type === 'warning') return ZONES.warning;
      return ZONES[c.type] || [240, 220, 800, 280];
    });
  }
  // rects (as hard-ish reservations) of every card overlapping [tIn, tOut]
  function cardRes(it, E) {
    const out = [];
    sched().cards.forEach((c) => { if (c !== it && overlaps(c, it)) out.push(cardRect(c, E)); });
    return out;
  }

  // ---- Lou's lane: bottom-left lower third (its own lane; may overlap banter, never lyrics or cards) -----------
  const LOU_PREFIX = '1313 AM';
  // the text layout of one Lou line (no placement)
  function louBase(it, E) {
    return cached(it.id + ':base', E, () => {
      const fam = F.hud;
      const fs = Math.max(29, E.minU(12));
      const pfs = fs * 0.86;
      const pre = spacedW(LOU_PREFIX, fam, pfs, pfs * 0.06) + pfs * 1.55;     // "1313 AM ▸ "
      const words = it.text.split(/\s+/);
      let maxW = Math.max(620, fs * 30);
      let lines = wrap(words, fam, fs, maxW, pre);
      while (lines.length > 2 && maxW < 1080) { maxW += 80; lines = wrap(words, fam, fs, maxW, pre); }
      const lh = fs * 1.32;
      let cw = 0;
      lines.forEach((ln) => { cw = Math.max(cw, pre + lineW(ln, fam, fs)); });
      const icon = fs * 1.5;
      const pos = [];
      let wi = 0;
      lines.forEach((ln, li) => {
        let x = pre;
        ln.forEach((wd) => { pos[wi++] = { li, x, w: tw(wd, fam, fs) }; x += tw(wd + ' ', fam, fs); });
      });
      return { fs, pfs, pre, lh, lines, pos, icon, fam, w: icon + cw + fs * 1.0, h: lines.length * lh + fs * 0.62 };
    });
  }
  // Lou's lines that follow each other share one panel (placed once for the whole run)
  function louLayout(it, E) {
    return cached(it.id, E, () => {
      const G = it.group || { id: it.id, items: [it], tIn: it.tIn, tOut: it.tOut };
      const panel = cached(G.id + ':panel', E, () => {
        let w = 0, h = 0;
        G.items.forEach((m) => { const B = louBase(m, E); w = Math.max(w, B.w); h = Math.max(h, B.h); });
        const { kos } = kosFor(G.tIn, G.tOut, E);
        const res = cardRes(G, E);
        const cands = [[40, 690 - h], [W - 40 - w, 690 - h], [(W - w) / 2, 690 - h], [40, 470 - h * 0.5], [40, 36], [W - 40 - w, 36], [(W - w) / 2, 36]];
        let best = null;
        cands.forEach((p, i) => {
          const r = [p[0], p[1], w, h];
          const pen = penalty(r, kos, res) + i * 0.05;
          if (!best || pen < best.pen) best = { r, pen };
        });
        return best.r;
      });
      return Object.assign({}, louBase(it, E), { rect: panel, G });
    });
  }
  function louRes(it, E) {
    const out = [];
    if (E.shelf) return out;
    sched().spoken.forEach((s) => { if (s.kind === 'lou' && overlaps(s, it)) { const r = louLayout(s, E).rect; if (!out.some((q) => sameRect(q, r))) out.push(r); } });
    return out;
  }

  // ---- lyric lines ----------------------------------------------------------------------------------------
  function partitions(n, maxRows) {
    const out = [];
    const rec = (start, rows) => {
      if (start === n) { out.push(rows.slice()); return; }
      if (rows.length >= maxRows) return;
      for (let e = start + 1; e <= n; e++) { rows.push([start, e]); rec(e, rows); rows.pop(); }
    };
    rec(0, []);
    return out;
  }
  function famOf(st) { return STY[st].fam === 'comic' ? F.comic : F.title; }
  // a word's size relative to the line: hook words are bigger; Tiny's count grows number by number
  function rOf(L, i) {
    const s0 = STY[L.st];
    if (L.st === 'count') return 1 + 0.11 * i;
    return L.words[i].acc ? (s0.acc || 1.15) : 1;
  }
  // fit the words of a line into box; returns { s, rows: [{a, b, r, w}], bw, bh }
  function fitLine(L, box, E) {
    const s0 = STY[L.st], fam = famOf(L.st);
    const minS = E.minU(17) * (s0.slam ? 1.15 : 1);
    const ws = L.words.map((w, i) => ({ w: w100(w.text, fam) / 100, r: rOf(L, i) }));
    const rowMetrics = (a, b) => {
      let w = 0, r = 0;
      for (let i = a; i < b; i++) { w += ws[i].w * ws[i].r + (i > a ? s0.gap * Math.max(ws[i].r, ws[i - 1].r) : 0); r = Math.max(r, ws[i].r); }
      return { w, r };
    };
    if (!s0.slam) {
      // karaoke: fixed size, wrap if needed
      const s = Math.max(s0.base, E.minU(17));
      let rows = [];
      let a = 0;
      while (a < ws.length) {
        let b = a + 1;
        while (b < ws.length && rowMetrics(a, b + 1).w * s <= box[2]) b++;
        rows.push([a, b]); a = b;
      }
      if (rows.length > s0.maxRows) rows = [[0, Math.ceil(ws.length / 2)], [Math.ceil(ws.length / 2), ws.length]];
      const R = rows.map(([a2, b2]) => Object.assign({ a: a2, b: b2 }, rowMetrics(a2, b2)));
      return { s, rows: R, bw: Math.max(...R.map((r) => r.w)) * s, bh: R.reduce((h, r) => h + r.r * s0.rowH * s, 0) };
    }
    let best = null;
    partitions(ws.length, s0.maxRows).forEach((P) => {
      const R = P.map(([a, b]) => Object.assign({ a, b }, rowMetrics(a, b)));
      const wMax = Math.max(...R.map((r) => r.w));
      const hSum = R.reduce((h, r) => h + r.r * s0.rowH, 0);
      const s = Math.min(s0.max, box[2] / wMax, box[3] / hSum);
      // balanced rows read better than a single word dangling (unless it is the accent)
      const score = s * (1 - 0.05 * (R.length - 1));
      if (!best || score > best.score) best = { score, s, R, wMax, hSum };
    });
    const s = Math.max(minS, best.s);
    return { s, rows: best.R, bw: best.wMax * s, bh: best.hSum * s };
  }
  function lineCandidates(L, zonePref, kos) {
    const s0 = STY[L.st];
    const def = s0.slam ? (L.st === 'count' || L.st === 'response' || L.st === 'call' ? 'center' : 'top') : 'bottom';
    const pref = L.zone || zonePref || def;
    const order = [pref].concat(['bottom', 'top', 'center'].filter((z) => z !== pref));
    const out = [];
    order.forEach((z, oi) => {
      const sets = s0.big ? [BANDS_BIG[z], BANDS[z]] : [BANDS[z]];
      sets.forEach((b, bi) => {
        out.push({ z, oi: oi + bi * 0.3, box: b });
        // free intervals beside keep-outs that cut through this band
        const xs = kos.filter((k) => inter(k.r, [0, b[1], W, b[3]]) > 0 && Math.min(k.r[1] + k.r[3], b[1] + b[3]) - Math.max(k.r[1], b[1]) > Math.min(24, b[3] * 0.15))
          .map((k) => [k.r[0] - 18, k.r[0] + k.r[2] + 18]).sort((p, q) => p[0] - q[0]);
        if (!xs.length) return;
        const merged = [];
        xs.forEach((iv) => { const m = merged[merged.length - 1]; if (m && iv[0] <= m[1]) m[1] = Math.max(m[1], iv[1]); else merged.push(iv.slice()); });
        let x = b[0];
        merged.concat([[b[0] + b[2], b[0] + b[2]]]).forEach((iv) => {
          const x1 = Math.min(iv[0], b[0] + b[2]);
          if (x1 - x >= 300) out.push({ z, oi: oi + bi * 0.3 + 0.1, box: [x, b[1], x1 - x, b[3]] });
          x = Math.max(x, iv[1]);
        });
      });
    });
    return out;
  }
  function lineLayout(L, E) {
    return cached(L.id, E, () => {
      const s0 = STY[L.st];
      const { zone, kos } = kosFor(L.tIn, L.tOut, E);
      const res = cardRes(L, E).concat(louRes(L, E));
      let best = null;
      lineCandidates(L, zone, kos.concat(res.map((r) => ({ r, hard: false, res: true })))).forEach((cd) => {
        const box = [cd.box[0] + s0.pad, cd.box[1] + s0.pad * 0.5, cd.box[2] - 2 * s0.pad, cd.box[3] - s0.pad];
        const fit = fitLine(L, box, E);
        const bx = box[0] + (box[2] - fit.bw) / 2, by = box[1] + (box[3] - fit.bh) / 2;
        const rect = [bx, by, fit.bw, fit.bh];
        const pen = penalty(expand(rect, s0.pad * 0.5), kos, res) + cd.oi * 0.06 + (best ? Math.max(0, best.fit.s - fit.s) / Math.max(1, best.fit.s) * 0.4 : 0);
        if (!best || pen < best.pen) best = { pen, fit, rect, box, z: cd.z };
      });
      // word positions
      const { fit, rect, box } = best;
      const fam = famOf(L.st);
      const s = fit.s;
      const words = [];
      let y = rect[1];
      fit.rows.forEach((row, ri) => {
        const rh = row.r * s0.rowH * s;
        const rw = row.w * s;
        let x = rect[0] + (fit.bw - rw) / 2;
        for (let i = row.a; i < row.b; i++) {
          const w = L.words[i];
          const r = rOf(L, i);
          const fsz = s * r;
          const ww = tw(w.text, fam, fsz);
          if (i > row.a) x += s0.gap * s * Math.max(r, rOf(L, i - 1));
          const capH = fsz * s0.cap;
          // baseline: rows align on their bottom (cap bottoms line up)
          const base = y + rh - (rh - row.r * s * s0.cap) * 0.42;
          words[i] = { x, cx: x + ww / 2, w: ww, fs: fsz, base, cy: base - capH / 2, capH, row: ri };
          x += ww;
        }
        y += rh;
      });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      words.forEach((w) => { x0 = Math.min(x0, w.x); x1 = Math.max(x1, w.x + w.w); y0 = Math.min(y0, w.base - w.capH); y1 = Math.max(y1, w.base + w.fs * 0.14); });
      const tight = [x0 - 8, y0 - 8, x1 - x0 + 16, y1 - y0 + 16];
      return { s, words, rect: tight, z: best.z, fam, pen: best.pen };
    });
  }

  // ---- spoken in-frame (groan, roadie, fan) ------------------------------------------------------------------
  function spokenLayout(it, E) {
    return cached(it.id, E, () => {
      const { zone, kos } = kosFor(it.tIn, it.tOut, E);
      const res = cardRes(it, E).concat(louRes(it, E));
      sched().shown.forEach((L) => { if (overlaps(L, it)) res.push(lineLayout(L, E).rect); });
      const fam = it.kind === 'whisper' ? F.type : it.kind === 'boom' ? F.title : F.comic;
      const fs = it.kind === 'whisper' ? Math.max(66, E.minU(17)) : it.kind === 'boom' ? Math.max(80, E.minU(20)) : Math.max(42, E.minU(14));
      const sp = it.kind === 'whisper' ? fs * 0.16 : 0;
      const gapW = it.kind === 'fan' ? tw(' ', fam, fs) : fs * 0.55;
      const ww = it.words.map((w) => (sp ? spacedW(w.text, fam, fs, sp) : tw(w.text, fam, fs)));
      const total = ww.reduce((a, b) => a + b, 0) + gapW * (ww.length - 1);
      const capR = it.kind === 'whisper' ? 0.69 : it.kind === 'boom' ? 0.86 : 0.74;
      const h = fs * (capR + 0.4);
      const pref = it.kind === 'fan' ? ['bottom', 'center', 'top'] : it.kind === 'boom' ? ['top', 'center', 'bottom'] : [zone === 'top' ? 'top' : 'center', 'bottom', 'top'];
      let best = null;
      pref.forEach((z, oi) => {
        const b = BANDS[z];
        [0.5, 0.3, 0.7].forEach((ax, ai) => {
          const cx = clamp(b[0] + b[2] * ax, b[0] + total / 2, b[0] + b[2] - total / 2);
          const r = [cx - total / 2 - 12, b[1] + (b[3] - h) / 2, total + 24, h];
          const pen = penalty(r, kos, res) + oi * 0.05 + ai * 0.2;
          if (!best || pen < best.pen) best = { pen, r };
        });
      });
      const r = best.r;
      let x = r[0] + 12;
      const words = it.words.map((w, i) => { const o = { x, w: ww[i] }; x += ww[i] + gapW; return o; });
      return { rect: r, fs, fam, sp, words, base: r[1] + h * 0.5 + fs * capR * 0.5 };
    });
  }

  // ---- captions: bubble metrics (text wrap), subtitle placement -----------------------------------------------
  function capText(cap, E, fsOverride, maxWOverride) {
    const fs = fsOverride || Math.max(34, E.minU(12.5));
    const fam = F.comic;
    const raw = cap.text.split(/\s+/).filter(Boolean);
    const mixed = /[a-z]/.test(cap.text);
    const words = raw.map((w) => ({ text: w, em: mixed && isCapsWord(w) }));
    const wOf = (w) => tw(w.text, fam, fs * (w.em ? 1.16 : 1));
    const sw = tw(' ', fam, fs);
    const maxW = maxWOverride || clamp(fs * 10.5, 300, 600);
    const lines = [];
    let cur = [], cw = 0;
    words.forEach((w) => {
      const ww = wOf(w);
      if (cur.length && cw + sw + ww > maxW) { lines.push({ ws: cur, w: cw }); cur = [w]; cw = ww; }
      else { cw += (cur.length ? sw : 0) + ww; cur.push(w); }
    });
    if (cur.length) lines.push({ ws: cur, w: cw });
    // balance two lines
    if (lines.length === 2 && !maxWOverride) {
      const all = words; let bestSplit = null;
      for (let i = 1; i < all.length; i++) {
        const a = all.slice(0, i), b = all.slice(i);
        const wa = a.reduce((s, w) => s + wOf(w), 0) + sw * (a.length - 1), wb = b.reduce((s, w) => s + wOf(w), 0) + sw * (b.length - 1);
        if (wa > maxW || wb > maxW) continue;
        const m = Math.max(wa, wb);
        if (!bestSplit || m < bestSplit.m) bestSplit = { m, a: { ws: a, w: wa }, b: { ws: b, w: wb } };
      }
      if (bestSplit) { lines[0] = bestSplit.a; lines[1] = bestSplit.b; }
    }
    const lh = fs * 1.02;
    const w = Math.max(...lines.map((l) => l.w));
    return { fs, fam, lines, lh, w, h: lines.length * lh, sw };
  }
  function bubbleMetrics(cap, E) {
    return cached(cap.id + ':bub', E, () => {
      const fs = Math.max(36, E.minU(12.5));
      const nW = cap.text.split(/\s+/).length;
      const T = capText(cap, E, fs, nW >= 4 ? Math.max(fs * 7.2, tw(cap.text, F.comic, fs) * 0.56) : fs * 12);
      const n = 2.5, kk = Math.pow(2, 1 / n);
      const padX = T.fs * 0.5, padY = T.fs * 0.42;
      let rx = (T.w / 2 + padX) * kk * 0.97, ry = (T.h / 2 + padY) * kk;
      if (cap.shape === 'burst') { rx *= 1.12; ry *= 1.22; }
      return { T, rx, ry, n };
    });
  }
  // reserved rects every caption must avoid: lyrics (their tight rects), cards, Lou's lane, spoken in-frame
  function capReserved(cap, E) {
    return cached(cap.id + ':res', E, () => {
      const res = cardRes(cap, E).concat(louRes(cap, E));
      sched().shown.forEach((L) => { if (overlaps(L, cap)) res.push(expand(lineLayout(L, E).rect, 10)); });
      sched().spoken.forEach((s) => { if (s.kind !== 'lou' && overlaps(s, cap) && !(E.shelf && s.kind === 'fan')) res.push(spokenLayout(s, E).rect); });
      const { kos } = kosFor(cap.tIn, cap.tOut, E);
      return { res, kos };
    });
  }
  function subtitleLayout(cap, E) {
    return cached(cap.id + ':sub', E, () => {
      const fs = Math.max(36, E.minU(12.5));
      const tagFs = fs * 0.78;
      const tag = cap.who;
      const tagW = tw(tag, F.comic, tagFs) + tagFs * 0.9;
      const T = capText(cap, E, fs, Math.max(560, 1000 - tagW));
      const w = tagW + T.w + fs * 1.0, h = T.h + fs * 0.62;
      const { res, kos } = capReserved(cap, E);
      const cands = [[(W - w) / 2, 692 - h], [(W - w) / 2, 34], [40, 692 - h], [W - 40 - w, 692 - h], [40, 34], [W - 40 - w, 34], [(W - w) / 2, 360 - h / 2]];
      let best = null;
      cands.forEach((p, i) => { const r = [p[0], p[1], w, h]; const pen = penalty(r, kos, res) + i * 0.03; if (!best || pen < best.pen) best = { r, pen }; });
      return { rect: best.r, T, tagFs, tagW, fs };
    });
  }
  // bubble body placement for the live anchor (pure in S: depends on the anchor only)
  function bubblePlace(cap, anc, E) {
    const M = bubbleMetrics(cap, E);
    const { res, kos } = capReserved(cap, E);
    const ax = anc[0], ay = anc[1];
    const bw = M.rx * 2, bh = M.ry * 2;
    const face = [ax - 64, ay - 4, 128, 150];       // never sit on the speaker's own face
    const sd = ax < W / 2 ? 1 : -1;                 // prefer the side facing the frame centre
    const cands = [];
    [0, 70, 150].forEach((far, fi) => {
      cands.push([ax + sd * (M.rx * 0.72 + 46 + far * 0.7), ay - M.ry - 46 - far * 0.5, fi]);
      cands.push([ax - sd * (M.rx * 0.72 + 46 + far * 0.7), ay - M.ry - 46 - far * 0.5, fi]);
      cands.push([ax + sd * M.rx * 0.2, ay - M.ry - 74 - far, fi]);
      cands.push([ax + sd * (M.rx + 74 + far), ay - M.ry * 0.25, fi]);
      cands.push([ax - sd * (M.rx + 74 + far), ay - M.ry * 0.25, fi]);
    });
    [0, 80].forEach((far) => {
      cands.push([ax + sd * (M.rx + 80 + far), ay + M.ry * 0.7, 1.5]);
      cands.push([ax - sd * (M.rx + 80 + far), ay + M.ry * 0.7, 1.5]);
    });
    // last resort: the band opposite the lyric (a long tail or a speaker tag)
    const topBusy = res.some((q) => q[1] < 230);
    cands.push([clamp(ax, M.rx + 20, W - M.rx - 20), topBusy ? 690 - M.ry : 34 + M.ry, 4]);
    let best = null;
    cands.forEach((p, i) => {
      const cx = clamp(p[0], M.rx + 14, W - M.rx - 14), cy = clamp(p[1], M.ry + 10, H - M.ry - 10);
      const r = [cx - M.rx, cy - M.ry, bw, bh];
      const moved = Math.hypot(cx - p[0], cy - p[1]);
      let pen = penalty(r, kos, res) + p[2] * 0.12 + (i % 5) * 0.02 + moved / 700;
      const f = inter(r, face) / (face[2] * face[3]);
      if (f > 0.04) pen += 1.5 + f * 3;
      if (cy - M.ry * 0.2 > ay && Math.abs(cx - ax) < M.rx + 40) pen += 0.6;    // below the head reads wrong
      if (!best || pen < best.pen) best = { cx, cy, pen, r };
    });
    return Object.assign({ M }, best);
  }
  // ---- the phone shelf: two subtitle lanes ---------------------------------------------------------------
  function shelfLayout(it, E) {
    return cached(it.id + ':shelf', E, () => {
      const sh = E.shelf;
      const lou = it.kind === 'lou', fan = it.kind === 'fan';
      const full = !it.laneShare;
      const lx = full ? 40 : it.lane === 0 ? 32 : 656;
      const lw = full ? W - 80 : 592;
      const fam = lou ? F.hud : F.comic;
      let fs = lou ? 48 : 54;
      const tagFs = 42;
      let tag = lou ? '' : fan ? '' : it.who;
      const words = it.text.split(/\s+/);
      const preOf = (f) => spacedW(LOU_PREFIX, F.hud, f * 0.86, f * 0.05) + f * 1.5;
      let pre = lou ? preOf(fs) : 0, badge = false;
      let lines;
      for (;;) {
        lines = wrap(words, fam, fs, lw, pre);
        if (lines.length <= 2 || fs <= 40) break;
        fs -= 2; if (lou) pre = preOf(fs);
      }
      if (lou && lines.length > 2) {
        // the station badge moves up to the tag line
        badge = true; pre = 0; fs = 46;
        for (;;) { lines = wrap(words, fam, fs, lw, 0); if (lines.length <= 2 || fs <= 38) break; fs -= 2; }
      }
      const lh = fs * 1.08;
      const tagH = tag || badge ? tagFs * 1.12 : 0;
      const h = tagH + lines.length * lh;
      const y = sh.y + Math.max(10, (sh.h - h) / 2);
      const pos = [];
      let wi = 0;
      lines.forEach((ln, li) => {
        let x = lou && !badge ? pre : 0;
        ln.forEach((wd) => { pos[wi++] = { li, x, w: tw(wd, fam, fs) }; x += tw(wd + ' ', fam, fs); });
      });
      return { x: lx, y, w: lw, h, fs, fam, lines, lh, tag, badge, tagFs, tagH, pos, pre, rect: [lx, y, lw, h] };
    });
  }
  // ================================================================================================ sprites
  const SPR = new Map();
  function resOf(ctx) {
    let a = 1;
    try { const m = ctx.getTransform(); a = Math.hypot(m.a, m.b); } catch (e) { a = 1; }
    return clamp(Math.ceil(a * 4) / 4, 0.25, 3);
  }
  // life: [t0, t1] seconds the sprite is needed for; it is freed when the frame is far outside (rebuilt on demand)
  function sprite(key, wU, hU, res, fn, life) {
    const k = key + '@' + res;
    let s = SPR.get(k);
    if (s) return s;
    // drop other resolutions of the same sprite
    SPR.forEach((v, kk) => { if (kk.split('@')[0] === key) { NS.freeCanvas(v.c); SPR.delete(kk); } });
    const c = NS.makeCanvas(Math.ceil(wU * res), Math.ceil(hU * res), 'overlay');
    const g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, 0, 0);
    try { fn(g, wU, hU); } catch (e) { console.error('overlay sprite ' + key, e); }
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    s = { c, w: wU, h: hU, life: life || null };
    SPR.set(k, s);
    return s;
  }
  function releaseSprites(t) {
    SPR.forEach((v, k) => { if (v.life && (t < v.life[0] - 3 || t > v.life[1] + 2.5)) { NS.freeCanvas(v.c); SPR.delete(k); } });
  }
  // soft dark backing for the karaoke line
  function backSprite(res) {
    return sprite('back', 256, 64, Math.min(res, 1), (g) => {
      const gr = g.createLinearGradient(0, 0, 256, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.18, 'rgba(0,0,0,1)'); gr.addColorStop(0.82, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
      g.globalCompositeOperation = 'destination-in';
      const gv = g.createLinearGradient(0, 0, 0, 64);
      gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(0.35, 'rgba(0,0,0,1)'); gv.addColorStop(0.7, 'rgba(0,0,0,1)'); gv.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gv; g.fillRect(0, 0, 256, 64);
    });
  }
  function glowSprite(res) {
    return sprite('glow', 128, 128, Math.min(res, 1), (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
  }
  function vignetteSprite(res) {
    return sprite('vig', 256, 128, Math.min(res, 1), (g) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(3,4,8,0.85)'); gr.addColorStop(0.55, 'rgba(3,4,8,0.5)'); gr.addColorStop(1, 'rgba(3,4,8,0)');
      g.translate(128, 64); g.scale(1, 0.5);
      g.fillStyle = gr; g.fillRect(-128, -128, 256, 256);
    });
  }
  // the band logo: NO SURVIVORS in Metal Mania, blood-chrome fill, double outline, red glow, blade flourishes
  const LOGO_FS = 132;
  function logoSprite(res, life, tag) {
    const text = String(SCORE.band || 'No Survivors').toUpperCase();
    const fam = F.logo;
    const tw0 = tw(text, fam, LOGO_FS);
    const wU = tw0 + 300, hU = LOGO_FS * 1.45 + 60;
    return sprite('logo:' + text + ':' + (fontsOK ? 1 : 0) + (tag || ''), wU, hU, res, (g) => {
      const x = wU / 2, base = 30 + LOGO_FS * 0.98;
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.font = NS.font(LOGO_FS, fam);
      g.lineJoin = 'round'; g.miterLimit = 2;
      // blades: two long tapered spikes out of the first and last letters
      const yb = base - LOGO_FS * 0.36;
      const blade = (dir) => {
        const x0 = x + dir * (tw0 / 2 - 14), x1 = x + dir * (tw0 / 2 + 128);
        g.beginPath();
        g.moveTo(x0, yb - 15); g.lineTo(x1, yb - 1); g.lineTo(x1 - dir * 6, yb + 3); g.lineTo(x0, yb + 9);
        g.closePath();
      };
      // glow
      g.save();
      g.shadowColor = 'rgba(255,40,52,0.85)'; g.shadowBlur = 34 * res;
      g.fillStyle = '#2a0306'; g.fillText(text, x, base); blade(-1); g.fill(); blade(1); g.fill();
      g.restore();
      // outer black outline (very heavy) + drop shadow block
      g.fillStyle = INK; g.strokeStyle = INK;
      g.lineWidth = 22; g.strokeText(text, x + 7, base + 8); blade(-1); g.stroke(); blade(1); g.stroke();
      g.lineWidth = 20; g.strokeText(text, x, base);
      blade(-1); g.lineWidth = 14; g.stroke(); blade(1); g.stroke();
      // dark red inner rim
      g.strokeStyle = '#7a0a12'; g.lineWidth = 8; g.strokeText(text, x, base);
      blade(-1); g.lineWidth = 5; g.stroke(); blade(1); g.stroke();
      // blood-chrome fill
      const gr = g.createLinearGradient(0, base - LOGO_FS * 0.78, 0, base + LOGO_FS * 0.12);
      gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.32, '#ffd9cc'); gr.addColorStop(0.5, '#ff6a6e'); gr.addColorStop(0.53, '#e8262e');
      gr.addColorStop(0.8, '#a80f1b'); gr.addColorStop(1, '#4a0309');
      g.fillStyle = gr; g.fillText(text, x, base);
      blade(-1); g.fill(); blade(1); g.fill();
      // chrome horizon line highlight
      g.save();
      g.beginPath(); g.rect(0, base - LOGO_FS * 0.39, wU, 3.5); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(text, x, base);
      g.restore();
      // a few scratches knocked out of the fill
      g.save();
      g.globalCompositeOperation = 'source-atop';
      const R = NS.rng(77);
      g.strokeStyle = 'rgba(40,0,4,0.55)'; g.lineWidth = 1.6;
      for (let i = 0; i < 26; i++) {
        const sx = x - tw0 / 2 + R() * tw0, sy = base - LOGO_FS * (0.1 + R() * 0.6);
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 10 + R() * 26, sy + (R() - 0.5) * 8); g.stroke();
      }
      g.restore();
    }, life);
  }
  // halftone dot field (comic), clipped by the caller: dots grow along the banner
  function halftone(g, x, y, w, h, color, pitch, r0, r1, angle) {
    g.save();
    g.fillStyle = color;
    g.beginPath();
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2 + pitch;
    for (let v = -R; v <= R; v += pitch) {
      for (let u = -R; u <= R; u += pitch) {
        const px = cx + u * ca - v * sa, py = cy + u * sa + v * ca;
        if (px < x - pitch || px > x + w + pitch || py < y - pitch || py > y + h + pitch) continue;
        const k = clamp((px - x) / w);
        const r = lerp(r0, r1, k);
        if (r < 0.3) continue;
        g.moveTo(px + r, py); g.arc(px, py, r, 0, TAU);
      }
    }
    g.fill();
    g.restore();
  }
  // Lou's mark: kit.symbol when the world kit provides it, else a clock face at 3:00 whose hands make an L
  function mark(g, x, y, d, color, o) {
    if (NS.kit && typeof NS.kit.symbol === 'function') {
      try { NS.kit.symbol(g, x, y, d, color, 1, Object.assign({ weight: 0.085, ticks: true }, o || {})); return; } catch (e) { /* fall through */ }
    }
    const r = d / 2, lw = Math.max(0.8, d * 0.085);
    g.save();
    g.strokeStyle = color; g.lineCap = 'round';
    g.lineWidth = lw; g.beginPath(); g.arc(x, y, r - lw / 2, 0, TAU); g.stroke();
    g.lineWidth = lw * 0.55; g.beginPath();
    [6, 9].forEach((i) => { const a = i * TAU / 12 - Math.PI / 2; g.moveTo(x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66); g.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); });
    g.stroke();
    g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(x, y - r * 0.62); g.lineTo(x, y); g.lineTo(x + r * 0.47, y); g.stroke();
    g.restore();
  }
  // paper texture inside the current clip
  function paper(g, x, y, w, h, seed, base) {
    g.fillStyle = base; g.fillRect(x, y, w, h);
    const R = NS.rng(seed);
    // edge darkening
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.7);
    gr.addColorStop(0, 'rgba(120,80,30,0)'); gr.addColorStop(1, 'rgba(110,70,25,0.38)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    // fibres and speckle
    for (let i = 0; i < w * h / 90; i++) {
      const px = x + R() * w, py = y + R() * h;
      g.fillStyle = R() < 0.5 ? 'rgba(90,60,20,' + (0.05 + R() * 0.12) + ')' : 'rgba(255,250,235,' + (0.08 + R() * 0.15) + ')';
      g.fillRect(px, py, 0.6 + R() * 2.4, 0.5 + R() * 0.9);
    }
    // a tide-mark stain
    g.strokeStyle = 'rgba(130,85,30,0.16)'; g.lineWidth = 2.2;
    g.beginPath(); g.ellipse(x + w * (0.72 + R() * 0.15), y + h * (0.3 + R() * 0.4), h * 0.42, h * 0.36, R(), 0.3, 5.6); g.stroke();
  }
  // a rough-edged rectangle path (paper)
  function roughRect(g, x, y, w, h, amp, seed) {
    const R = NS.rng(seed);
    g.beginPath();
    const pts = [];
    const step = 14;
    for (let u = 0; u < w; u += step) pts.push([x + u, y + (R() - 0.5) * amp]);
    for (let v = 0; v < h; v += step) pts.push([x + w + (R() - 0.5) * amp, y + v]);
    for (let u = w; u > 0; u -= step) pts.push([x + u, y + h + (R() - 0.5) * amp]);
    for (let v = h; v > 0; v -= step) pts.push([x + (R() - 0.5) * amp, y + v]);
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
  }

  // ================================================================================================ text helpers
  // white text, heavy black outline, stacked offset colour copies (each with its own outline)
  function popText(g, text, x, y, o) {
    const lw = o.lw;
    g.lineJoin = 'round'; g.miterLimit = 2;
    const L = o.layers || [];
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      if (lw > 0) { g.lineWidth = lw; g.strokeStyle = o.stroke || INK; g.strokeText(text, x + d.dx, y + d.dy); }
      g.fillStyle = d.c; g.fillText(text, x + d.dx, y + d.dy);
    }
    if (lw > 0) { g.lineWidth = lw; g.strokeStyle = o.stroke || INK; g.strokeText(text, x, y); }
    if (o.fill) { g.fillStyle = o.fill; g.fillText(text, x, y); }
  }
  function fillSpaced(g, text, x, y, fam, size, sp, mode) {
    // mode: 'fill' | 'stroke' | 'both'; x = left
    g.textAlign = 'left';
    let cx = x;
    for (const ch of text) {
      if (mode !== 'fill') g.strokeText(ch, cx, y);
      if (mode !== 'stroke') g.fillText(ch, cx, y);
      cx += tw(ch, fam, size) + sp;
    }
  }
  function tri(g, x, y, s) { g.beginPath(); g.moveTo(x, y - s * 0.5); g.lineTo(x + s * 0.8, y); g.lineTo(x, y + s * 0.5); g.closePath(); g.fill(); }
  // pure decode-glitch characters for a fresh word
  const GLITCH = '#%&@$*+=?/<>{}[]01';
  function glitchStr(text, t, seed, k) {
    if (k >= 1) return text;
    let out = '';
    const f = Math.floor(t * 40);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ' ' || hash(i + seed * 13, f) < k) out += ch;
      else out += GLITCH[Math.floor(hash(i * 7 + seed, f + 3) * GLITCH.length)];
    }
    return out;
  }
  function gapAt(S, t) {
    if (S && S.gap && isFinite(S.gap.t0)) return S.gap;
    const g = sched().gaps.find((x) => t >= x.t0 - 1e-6 && t < x.t1);
    return g || null;
  }

  // ================================================================================================ lyrics
  function drawLine(g, L, t, S, E) {
    const P = lineLayout(L, E);
    const s0 = STY[L.st];
    if (!s0.slam) return drawKaraoke(g, L, P, t, S, E);
    return drawSlam(g, L, P, t, S, E);
  }
  function drawKaraoke(g, L, P, t, S, E) {
    const s0 = STY[L.st];
    const kIn = clamp((t - L.tIn) / 0.22), kOut = clamp((t - (L.tOut - s0.out)) / s0.out);
    const A = EZ.outQuad(kIn) * (1 - EZ.inQuad(kOut));
    if (A <= 0.003) return;
    const conf = L.st === 'confess';
    const acc = conf ? '#8fa3c7' : L.layers[0];
    const drift = kOut * 10 + (1 - kIn) * 8;
    g.save();
    g.translate(0, drift);
    // backing
    const r = P.rect, bs = backSprite(1);
    g.globalAlpha = A * (conf ? 0.62 : 0.5);
    g.drawImage(bs.c, r[0] - 90, r[1] - r[3] * 0.32, r[2] + 180, r[3] * 1.64);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const tremble = conf ? 1 : 0;
    L.words.forEach((w, i) => {
      const p = P.words[i];
      if (!p) return;
      const dt = t - w.t;
      g.font = NS.font(p.fs, P.fam);
      let x = p.cx, y = p.base;
      if (tremble) { x += noise1(t * 9, L.seed + i) * 1.2; y += noise1(t * 9 + 40, L.seed + i) * 1.0; }
      if (dt < 0) {
        g.globalAlpha = A * 0.9;
        popText(g, w.text, x, y, { lw: p.fs * 0.11, stroke: 'rgba(4,5,9,0.85)', fill: conf ? '#8d96a8' : '#a3a6ad' });
        return;
      }
      const k = clamp(dt / 0.17);
      const sc = lerp(1.16, 1, EZ.outBack(k));
      const lift = (1 - EZ.outCubic(k)) * p.fs * 0.18;
      g.globalAlpha = A;
      g.save();
      g.translate(x, p.cy - lift);
      g.scale(sc, sc);
      const off = p.fs * 0.065;
      popText(g, w.text, 0, p.base - p.cy, { lw: p.fs * 0.13, layers: [{ dx: off, dy: off, c: conf ? '#53627f' : acc }], fill: conf ? '#eef2fa' : WHITE });
      g.restore();
    });
    // karaoke progress underline
    let cur = -1;
    L.words.forEach((w, i) => { if (t >= w.t) cur = i; });
    if (cur >= 0) {
      const p0 = P.words[0], pc = P.words[cur], w = L.words[cur];
      if (p0 && pc && pc.row === p0.row) {
        const k = clamp((t - w.t) / Math.max(0.1, w.tEnd - w.t));
        const x0 = p0.x - 4, x1 = pc.x + pc.w * EZ.outQuad(k) + 4;
        const y = p0.base + p0.fs * 0.14;
        g.globalAlpha = A * 0.95;
        g.fillStyle = INK; g.fillRect(x0 - 2, y - 2, x1 - x0 + 4, p0.fs * 0.1 + 4);
        g.fillStyle = acc; g.fillRect(x0, y, x1 - x0, p0.fs * 0.1);
      }
    }
    g.restore();
  }
  function drawSlam(g, L, P, t, S, E) {
    const s0 = STY[L.st];
    if (t < L.tIn || t > L.tOut) return;
    const gap = gapAt(S, t);
    const frozen = !!(gap && gap.t0 >= L.tFirst - 0.05 && gap.t0 < L.tOut);
    const ta = frozen ? Math.min(t, gap.t0) : t;          // animation time stops dead in a STOPS gap
    const kOut = clamp((t - (L.tOut - s0.out)) / s0.out);
    const shakeK = S.shakeK == null ? 1 : S.shakeK;
    // impact shake from the latest landed word
    let land = null;
    L.words.forEach((w) => { if (ta >= w.t) land = w; });
    let sx = 0, sy = 0;
    if (land && !frozen) {
      const d = ta - land.t, A = P.s * (land.acc ? 0.085 : 0.06) * Math.exp(-d / 0.11) * shakeK;
      sx = A * noise1(ta * 60, L.seed); sy = A * noise1(ta * 60 + 31, L.seed + 3);
    }
    const coldK = frozen ? 1 : 0;
    g.save();
    g.translate(sx, sy);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const beatSince = ((ta % BEAT) + BEAT) % BEAT;
    const pulse = frozen ? 0 : 0.022 * Math.exp(-beatSince / 0.09);
    // the call and response: a comic burst behind the crowd's answer
    if (L.st === 'response' && land) drawBurst(g, P, L, ta, t, kOut);
    // comic impact ticks behind the hook words as they land
    if (!frozen) L.words.forEach((w, i) => {
      const p = P.words[i], dt = ta - w.t;
      if (!p || dt < 0 || dt >= 0.24 || !(w.acc || L.st === 'count')) return;
      impactTicks(g, p.cx, p.cy, p.w * 0.5 + p.fs * 0.12, p.capH * 0.5 + p.fs * 0.16, dt / 0.24, p.fs, L.seed + i, 1 - kOut, L.st === 'count' ? GANG : WHITE);
    });
    L.words.forEach((w, i) => {
      const p = P.words[i];
      if (!p) return;
      const pre = s0.pre;
      let dt = ta - w.t;
      if (dt < -pre) return;
      // fall-in (pre-roll) lands exactly on the step, then squash and settle
      let sc, a, rot;
      const rot0 = (hash(i, L.seed) - 0.5) * (L.st === 'count' ? 0.16 : 0.07);
      if (dt < 0) {
        const k = (dt + pre) / pre;
        sc = lerp(2.15, 1, k * k); a = clamp(k * 2.2); rot = rot0 + (hash(i, L.seed + 9) - 0.5) * 0.3 * (1 - k);
      } else {
        sc = 1 - 0.07 * Math.exp(-dt / 0.05) * Math.cos(dt * 38); a = 1; rot = rot0;
      }
      sc *= 1 + pulse;
      if (kOut > 0) { sc *= 1 + 0.2 * EZ.inQuad(kOut); a *= 1 - kOut; }
      if (a <= 0.003) return;
      const fs = p.fs;
      const off = fs * (L.st === 'response' ? 0.06 : 0.07);
      const lw = fs * (L.st === 'count' ? 0.12 : 0.11);
      let layers = L.layers.map((c, li) => ({ dx: off * (li + 1), dy: off * (li + 1) * 1.05, c }));
      if (w.gang && L.layers.indexOf(GANG) < 0) layers.push({ dx: off * (layers.length + 1), dy: off * (layers.length + 1) * 1.05, c: GANG });
      if (coldK) layers = layers.map((d) => ({ dx: d.dx, dy: d.dy, c: '#8b93a3' }));
      g.save();
      g.globalAlpha = a;
      g.translate(p.cx, p.cy);
      g.rotate(rot);
      g.scale(sc, sc);
      g.font = NS.font(fs, P.fam);
      const by = p.base - p.cy;
      if (L.zombie) drawZombieWord(g, w.text, by, fs, lw, layers, L, i, ta, dt, frozen);
      else popText(g, w.text, 0, by, { lw, layers, fill: coldK ? '#f2f6ff' : WHITE });
      g.restore();
    });
    g.restore();
  }
  function drawZombieWord(g, text, by, fs, lw, layers, L, wi, ta, dt, frozen) {
    // ragged: each letter jittered and wobbling; drips hang from the green copy
    const fam = F.title;
    const chars = Array.from(text);
    const total = tw(text, fam, fs);
    let x = -total / 2;
    const xs = chars.map((ch) => { const o = x; x += tw(ch, fam, fs); return o; });
    const wob = (i, sd) => (frozen ? 0 : noise1(ta * 2.2 + i * 0.7, L.seed + wi * 17 + sd));
    const mk = L.monster == null ? 1 : L.monster;
    const jit = chars.map((ch, i) => ({
      dy: ((hash(i + wi * 31, L.seed) - 0.5) * fs * 0.07 + wob(i, 1) * fs * 0.012) * mk,
      rot: ((hash(i + wi * 31, L.seed + 5) - 0.5) * 0.13 + wob(i, 2) * 0.02) * mk,
    }));
    const each = (fn) => chars.forEach((ch, i) => {
      const cw = tw(ch, fam, fs);
      g.save(); g.translate(xs[i] + cw / 2, by + jit[i].dy); g.rotate(jit[i].rot); fn(ch, i, cw); g.restore();
    });
    g.textAlign = 'center';
    g.lineJoin = 'round';
    const dripLayer = layers.some((d) => d.c === ZOMB) ? layers.findIndex((d) => d.c === ZOMB) : layers.length - 1;
    for (let li = layers.length - 1; li >= 0; li--) {
      const d = layers[li];
      each((ch) => { g.lineWidth = lw; g.strokeStyle = INK; g.strokeText(ch, d.dx, d.dy); g.fillStyle = d.c; g.fillText(ch, d.dx, d.dy); });
      if (li === dripLayer) drips(g, total, by + d.dy, fs * (0.4 + 0.6 * mk), lw, L.seed + wi * 13, Math.max(0, dt), d.dx, frozen ? '#8b93a3' : ZOMB);
    }
    each((ch) => { g.lineWidth = lw; g.strokeStyle = INK; g.strokeText(ch, 0, 0); g.fillStyle = frozen ? '#f2f6ff' : '#f6fbe9'; g.fillText(ch, 0, 0); });
    // a sick green sheen on the letters' lower half
    g.save();
    g.globalAlpha *= 0.32;
    g.beginPath(); g.rect(-total / 2 - 10, by - fs * 0.32, total + 20, fs * 0.4); g.clip();
    each((ch) => { g.fillStyle = frozen ? '#c7cede' : '#b9e36a'; g.fillText(ch, 0, 0); });
    g.restore();
  }
  function drips(g, total, by, fs, lw, seed, dt, dx, col) {
    const n = 2 + Math.floor(hash(seed, 3) * 3);
    const grow = EZ.outCubic(clamp(dt / 0.9)) + Math.min(0.35, dt * 0.12);
    g.save();
    g.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const x = dx + (-0.42 + 0.84 * (i + 0.2 + hash(seed + i, 5) * 0.6) / n) * total;
      const dw = fs * (0.05 + 0.035 * hash(seed + i, 7));
      const len = fs * (0.12 + 0.34 * hash(seed + i, 9)) * grow;
      if (len < 1) continue;
      const y0 = by - fs * 0.06;
      const path = () => {
        g.beginPath();
        g.moveTo(x - dw, y0);
        g.lineTo(x - dw * 0.55, y0 + len);
        g.arc(x, y0 + len, dw * 0.62, Math.PI, 0, true);
        g.lineTo(x + dw, y0);
        g.closePath();
      };
      path(); g.lineWidth = lw * 0.55; g.strokeStyle = INK; g.stroke();
      path(); g.fillStyle = col; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath(); g.arc(x - dw * 0.22, y0 + len - dw * 0.1, dw * 0.18, 0, TAU); g.fill();
    }
    g.restore();
  }
  function impactTicks(g, cx, cy, rx, ry, k, fs, seed, a, col) {
    const n = 14;
    g.save();
    g.lineCap = 'round';
    g.globalAlpha = a * (1 - EZ.inQuad(k));
    for (let i = 0; i < n; i++) {
      const ang = (i + 0.5) / n * TAU + (hash(i, seed) - 0.5) * 0.35;
      if (Math.abs(Math.sin(ang)) < 0.42) continue;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const r0 = 1 + 0.06 + EZ.outCubic(k) * 0.22, len = fs * (0.16 + 0.12 * hash(i, seed + 1)) * (1 - k * 0.6);
      const x0 = cx + c * rx * r0, y0 = cy + sn * ry * r0;
      const x1 = x0 + c * len, y1 = y0 + sn * len;
      g.strokeStyle = INK; g.lineWidth = fs * 0.065 + 3;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = col; g.lineWidth = fs * 0.065;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.restore();
  }
  function drawBurst(g, P, L, ta, t, kOut) {
    const r = P.rect;
    const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
    const R = Math.max(r[2], r[3]) * 0.6;
    const n = 26, rot = ta * 0.2;
    const k = clamp((ta - L.tFirst + 0.06) / 0.2);
    // swell on each landed word
    let pulse = 0;
    L.words.forEach((w) => { const d = ta - w.t; if (d >= 0) pulse = Math.max(pulse, Math.exp(-d / 0.18)); });
    g.save();
    g.globalAlpha = (0.1 + 0.1 * pulse) * EZ.outCubic(k) * (1 - kOut);
    g.translate(cx, cy);
    g.scale(1, 0.42);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = rot + i * TAU / n, a1 = a0 + TAU / n * 0.32;
      g.moveTo(0, 0); g.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); g.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); g.closePath();
    }
    g.fillStyle = L.layers.indexOf(GANG) >= 0 ? '#ffd23f' : '#c9e04a';
    g.fill();
    g.restore();
  }

  // ================================================================================================ spoken
  function radioIcon(g, x, y, s, t, active, seed) {
    g.save();
    g.strokeStyle = LOU; g.fillStyle = LOU; g.lineCap = 'round';
    // a little tower: mast + dot, waves to the right
    g.lineWidth = s * 0.09;
    g.beginPath(); g.moveTo(x - s * 0.18, y + s * 0.42); g.lineTo(x, y - s * 0.12); g.lineTo(x + s * 0.18, y + s * 0.42); g.stroke();
    g.beginPath(); g.arc(x, y - s * 0.18, s * 0.09, 0, TAU); g.fill();
    for (let i = 0; i < 3; i++) {
      const ph = active ? (Math.sin(t * 9 - i * 1.3 + noise1(t * 3, seed) * 1.2) * 0.5 + 0.5) : 0.25;
      g.globalAlpha = 0.25 + 0.75 * ph;
      g.lineWidth = s * 0.075;
      const rr = s * (0.24 + i * 0.16);
      g.beginPath(); g.arc(x, y - s * 0.18, rr, -0.75, 0.75); g.stroke();
      g.beginPath(); g.arc(x, y - s * 0.18, rr, Math.PI - 0.75, Math.PI + 0.75); g.stroke();
    }
    g.restore();
  }
  function drawLou(g, it, t, S, E) {
    const P = louLayout(it, E);
    const r = P.rect, G = P.G;
    const kIn = clamp((t - G.tIn) / 0.24), kOut = clamp((t - (G.tOut - 0.28)) / 0.28);
    if (kIn <= 0 || kOut >= 1) return;
    const flick = S.reduced ? 1 : 0.93 + 0.07 * noise1(t * 14, it.seed);
    const wK = EZ.outCubic(kIn), hK = 1 - EZ.inCubic(clamp(kOut * 1.6));
    const wK2 = 1 - EZ.inCubic(clamp(kOut * 1.6 - 0.6));
    const ww = r[2] * wK * wK2, hh = Math.max(3, r[3] * hK);
    const x = r[0], y = r[1] + (r[3] - hh) / 2;
    g.save();
    g.globalAlpha = flick;
    // panel
    g.fillStyle = 'rgba(4,8,14,0.84)';
    g.fillRect(x, y, ww, hh);
    g.fillStyle = LOU;
    g.fillRect(x, y, Math.min(ww, 5), hh);
    g.globalAlpha = flick * 0.55;
    g.fillRect(x, y, ww, 1.5); g.fillRect(x, y + hh - 1.5, ww, 1.5);
    // scanlines
    g.globalAlpha = flick * 0.07;
    g.fillStyle = '#bff4ff';
    for (let sy = y + 2; sy < y + hh; sy += 4) g.fillRect(x, sy, ww, 1);
    g.globalAlpha = flick;
    if (hK < 0.6 || wK < 0.65) { g.restore(); return; }
    g.beginPath(); g.rect(x, y, ww, hh); g.clip();
    const active = t >= it.words[0].t - 0.05 && t <= it.tEnd + 0.1;
    // the next line of a run wipes in over the previous one
    const sw = it.chainIn ? clamp((t - it.tIn) / 0.12) : 1;
    const ty0 = r[1] + Math.max(0, (r[3] - P.h) / 2);     // a shorter line sits centred in the run's panel
    const ix = x + P.icon * 0.55, iy = ty0 + P.fs * 0.31 + P.lh * 0.5;
    radioIcon(g, ix, iy, P.fs * 0.95, t, active, it.seed);
    const tx = x + P.icon;
    const by = (li) => ty0 + P.fs * 0.31 + li * P.lh + P.lh * 0.5 + P.fs * 0.35;
    g.textBaseline = 'alphabetic';
    // prefix "1313 AM ▸"
    g.font = NS.font(P.pfs, P.fam);
    const bw = spacedW(LOU_PREFIX, P.fam, P.pfs, P.pfs * 0.06);
    g.fillStyle = LOU;
    g.fillRect(tx - P.pfs * 0.25, by(0) - P.pfs * 0.86, bw + P.pfs * 0.5, P.pfs * 1.08);
    g.fillStyle = '#04080e';
    fillSpaced(g, LOU_PREFIX, tx, by(0), P.fam, P.pfs, P.pfs * 0.06, 'fill');
    g.fillStyle = LOU;
    tri(g, tx + bw + P.pfs * 0.55, by(0) - P.pfs * 0.33, P.pfs * 0.46);
    // words, revealed on their onsets; the newest one decodes in
    g.font = NS.font(P.fs, P.fam);
    g.textAlign = 'left';
    if (sw < 1) { g.beginPath(); g.rect(x, y, ww * sw, hh); g.clip(); }
    it.words.forEach((w, i) => {
      const p = P.pos[i];
      if (!p || t < w.t) return;
      const k = S.reduced ? 1 : clamp((t - w.t) / 0.12);
      const s = glitchStr(w.text, t, it.seed + i, k);
      g.globalAlpha = flick * (0.55 + 0.45 * k);
      g.fillStyle = k < 1 ? LOU : '#e9fbff';
      g.fillText(s, tx + p.x, by(p.li));
    });
    // a blinking cursor after the last revealed word while he speaks
    if (active) {
      let li = 0, cx = P.pre;
      it.words.forEach((w, i) => { if (t >= w.t && P.pos[i]) { li = P.pos[i].li; cx = P.pos[i].x + P.pos[i].w + P.fs * 0.2; } });
      if (S.reduced || Math.floor(t * 2.5) % 2 === 0) { g.globalAlpha = flick * 0.8; g.fillStyle = LOU; g.fillRect(tx + cx, by(li) - P.fs * 0.68, P.fs * 0.5, P.fs * 0.78); }
    }
    g.restore();
  }
  function drawWhisper(g, it, t, S, E) {
    const P = spokenLayout(it, E);
    const kOut = clamp((t - (it.tOut - 0.7)) / 0.7);
    g.save();
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = NS.font(P.fs, P.fam);
    const gs = glowSprite(1);
    it.words.forEach((w, i) => {
      const dt = t - w.t;
      if (dt < -0.05) return;
      const p = P.words[i];
      // a faint cold breath behind the word
      g.save();
      g.globalAlpha = 0.22 * smoothstep(-0.05, 0.8, dt) * (1 - kOut);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(gs.c, p.x - P.fs * 0.4, P.base - P.fs * 1.05, p.w + P.fs * 0.8, P.fs * 1.5);
      g.restore();
      let cx = p.x;
      Array.from(w.text).forEach((ch, ci) => {
        const d = dt - ci * 0.055;
        const kIn = smoothstep(-0.02, 0.45, d);
        const A = kIn * (1 - kOut) * (0.8 + 0.2 * noise1(t * 3 + ci, it.seed + i));
        const cw = tw(ch, P.fam, P.fs);
        if (A > 0.003) {
          const rise = (1 - EZ.outCubic(kIn)) * P.fs * 0.25 + kOut * P.fs * 0.3;
          const wob = noise1(t * 1.1 + ci * 0.7, it.seed + i * 5) * P.fs * 0.06;
          const y = P.base - rise + wob;
          g.globalAlpha = A * 0.16; g.fillStyle = '#a8c49a';
          g.fillText(ch, cx + P.fs * 0.05, y - P.fs * 0.12 - kOut * 10);
          g.globalAlpha = A * 0.95; g.fillStyle = '#e3eadb';
          g.fillText(ch, cx, y);
        }
        cx += cw + P.sp;
      });
    });
    g.restore();
  }
  function drawBoom(g, it, t, S, E) {
    const P = spokenLayout(it, E);
    const kOut = clamp((t - (it.tOut - 0.35)) / 0.35);
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = NS.font(P.fs, P.fam);
    it.words.forEach((w, i) => {
      const dt = t - w.t;
      if (dt < -0.04) return;
      const p = P.words[i];
      const cx = p.x + p.w / 2;
      const k = clamp((dt + 0.04) / 0.12);
      const sc = lerp(1.5, 1, EZ.outCubic(k)) * (1 + 0.015 * noise1(t * 30, i));
      const A = clamp(k * 2) * (1 - kOut);
      // loudspeaker shock rings
      for (let e = 0; e < 2; e++) {
        const ek = clamp((dt - e * 0.14) / 0.6);
        if (ek <= 0 || ek >= 1) continue;
        g.save();
        g.globalAlpha = A * (1 - ek) * (S.reduced ? 0.25 : 0.45);
        g.strokeStyle = C.bone; g.lineWidth = 3 * (1 - ek) + 1;
        g.beginPath(); g.ellipse(cx, P.base - P.fs * 0.43, p.w * 0.55 + ek * 110, P.fs * 0.55 + ek * 46, 0, 0, TAU); g.stroke();
        g.restore();
      }
      g.save();
      g.globalAlpha = A;
      g.translate(cx, P.base - P.fs * 0.43); g.scale(sc, sc);
      popText(g, w.text, 0, P.fs * 0.43, { lw: P.fs * 0.12, layers: [{ dx: P.fs * 0.05, dy: P.fs * 0.06, c: '#5b6474' }], fill: C.bone });
      g.restore();
    });
    g.restore();
  }
  function drawFan(g, it, t, S, E) {
    const P = spokenLayout(it, E);
    const kIn = smoothstep(it.tIn, it.tIn + 0.35, t), kOut = clamp((t - (it.tOut - 0.5)) / 0.5);
    const A = kIn * (1 - kOut);
    if (A <= 0.003) return;
    g.save();
    g.globalAlpha = A;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = NS.font(P.fs, P.fam);
    const sc = lerp(0.85, 1, EZ.outBack(kIn));
    const cx = P.rect[0] + P.rect[2] / 2;
    g.translate(cx, P.base); g.scale(sc, sc); g.translate(-cx, -P.base);
    it.words.forEach((w, i) => {
      const p = P.words[i];
      const dy = noise1(t * 2 + i, it.seed) * 2;
      popText(g, w.text, p.x, P.base + dy, { lw: P.fs * 0.14, fill: C.fireHot });
    });
    g.restore();
  }

  // ================================================================================================ captions
  function superellipse(g, cx, cy, rx, ry, n) {
    g.beginPath();
    const N = 56;
    for (let i = 0; i <= N; i++) {
      const a = i / N * TAU, c = Math.cos(a), s = Math.sin(a);
      const x = cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = cy + ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  }
  function burstPath(g, cx, cy, rx, ry, seed) {
    g.beginPath();
    const N = 26;
    for (let i = 0; i < N * 2; i++) {
      const a = i / (N * 2) * TAU + 0.11;
      const rr = i % 2 ? 0.93 : 1.08 + 0.16 * hash(i, seed);
      const x = cx + Math.cos(a) * rx * rr, y = cy + Math.sin(a) * ry * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  }
  function tailPath(g, cx, cy, rx, ry, tx, ty, base, shape, bend) {
    const dx = tx - cx, dy = ty - cy, d = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    const edge = 1 / Math.sqrt((ux / rx) * (ux / rx) + (uy / ry) * (uy / ry));
    const bx = cx + ux * edge * 0.62, by = cy + uy * edge * 0.62;
    g.beginPath();
    g.moveTo(bx + nx * base, by + ny * base);
    if (shape === 'burst') {
      const mx = (bx + tx) / 2, my = (by + ty) / 2;
      g.lineTo(mx + nx * base * 0.55, my + ny * base * 0.55);
      g.lineTo(mx + nx * base * 0.05 - ux * 6, my + ny * base * 0.05 - uy * 6);
      g.lineTo(tx, ty);
    } else {
      const L = d - edge * 0.62;
      const mx = bx + ux * L * 0.55 + nx * (base * 0.9 + L * 0.1) * bend, my = by + uy * L * 0.55 + ny * (base * 0.9 + L * 0.1) * bend;
      g.quadraticCurveTo(mx, my, tx, ty);
      g.quadraticCurveTo(mx - nx * base * 0.9 * bend, my - ny * base * 0.9 * bend, bx - nx * base, by - ny * base);
    }
    g.lineTo(bx - nx * base, by - ny * base);
    g.closePath();
  }
  function capTextDraw(g, T, cx, cy, color, strokeCol, lwK, align) {
    g.textBaseline = 'alphabetic';
    const top = cy - T.h / 2;
    T.lines.forEach((ln, li) => {
      let x = align === 'left' ? cx : cx - ln.w / 2;
      const base = top + (li + 0.5) * T.lh + T.fs * 0.37;
      ln.ws.forEach((w, wi) => {
        const fs = T.fs * (w.em ? 1.16 : 1);
        g.font = NS.font(fs, T.fam);
        g.textAlign = 'left';
        if (w.em) {
          g.save(); g.translate(x, base); g.transform(1, 0, -0.14, 1, 0, 0);
          if (lwK) { g.lineWidth = fs * lwK; g.strokeStyle = strokeCol; g.lineJoin = 'round'; g.strokeText(w.text, 0, 0); }
          g.fillStyle = color; g.fillText(w.text, 0, 0);
          g.restore();
        } else {
          if (lwK) { g.lineWidth = fs * lwK; g.strokeStyle = strokeCol; g.lineJoin = 'round'; g.strokeText(w.text, x, base); }
          g.fillStyle = color; g.fillText(w.text, x, base);
        }
        x += tw(w.text, T.fam, fs) + (wi < ln.ws.length - 1 ? T.sw : 0);
      });
    });
  }
  function capAlpha(cap, t) {
    const kIn = clamp((t - cap.tIn) / 0.16), kOut = clamp((t - (cap.tOut - 0.13)) / 0.13);
    return { kIn, kOut };
  }
  function drawBubble(g, cap, anc, t, S, E) {
    const B = bubblePlace(cap, anc, E);
    const M = B.M, T = M.T;
    const { kIn, kOut } = capAlpha(cap, t);
    if (kIn <= 0 || kOut >= 1) return B.r;
    const col = WHO[cap.who] || C.white;
    const tipD = Math.hypot(anc[0] - B.cx, anc[1] - B.cy);
    const tx = anc[0] + (B.cx - anc[0]) * Math.min(1, 18 / Math.max(1, tipD)), ty = anc[1] - 10 + (B.cy - anc[1]) * Math.min(1, 18 / Math.max(1, tipD));
    const longTail = tipD > Math.max(M.rx, M.ry) + 420;
    const sc = lerp(0.25, 1, EZ.outBack(kIn)) * (1 - 0.14 * kOut);
    const jit = cap.cut && kIn >= 1 ? noise1(t * 22, cap.seed) * 1.4 : 0;
    g.save();
    g.globalAlpha = 1 - EZ.inQuad(kOut);
    // scale about a point between the body and the tail tip
    const ox = lerp(B.cx, tx, 0.35), oy = lerp(B.cy, ty, 0.35);
    g.translate(ox + jit, oy);
    g.scale(sc, sc);
    g.translate(-ox, -oy);
    const lw = Math.max(3.5, T.fs * 0.115);
    const tailBase = Math.min(M.rx, M.ry) * 0.3;
    const bend = anc[0] < B.cx ? 1 : -1;
    const body = () => (cap.shape === 'burst' ? burstPath(g, B.cx, B.cy, M.rx, M.ry, cap.seed) : superellipse(g, B.cx, B.cy, M.rx, M.ry, M.n));
    const tail = () => tailPath(g, B.cx, B.cy, M.rx, M.ry, tx, ty, tailBase, cap.shape, bend);
    g.lineJoin = 'round';
    // offset print shadow in the speaker's colour
    const sd = T.fs * 0.2;
    g.save(); g.translate(sd, sd * 1.1);
    g.fillStyle = col;
    body(); g.fill(); if (!longTail) { tail(); g.fill(); }
    body(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
    g.restore();
    // outline (union), then fill
    if (cap.shape === 'whisper') g.setLineDash([lw * 2.2, lw * 1.5]);
    g.strokeStyle = INK; g.lineWidth = lw * 2;
    body(); g.stroke(); if (!longTail) { tail(); g.stroke(); }
    g.setLineDash([]);
    g.fillStyle = cap.shape === 'whisper' ? '#f1f3f7' : '#ffffff';
    body(); g.fill(); if (!longTail) { tail(); g.fill(); }
    // speaker tag on long tails (a band away from the head)
    if (longTail) {
      g.font = NS.font(T.fs * 0.62, F.comic);
      const tg = cap.who, tgw = tw(tg, F.comic, T.fs * 0.62) + T.fs * 0.5;
      const gx = B.cx - M.rx * 0.7, gy = B.cy - M.ry * 0.95;
      g.fillStyle = INK; g.fillRect(gx - 3, gy - T.fs * 0.42 - 3, tgw + 6, T.fs * 0.8 + 6);
      g.fillStyle = col; g.fillRect(gx, gy - T.fs * 0.42, tgw, T.fs * 0.8);
      g.fillStyle = INK; g.textAlign = 'left'; g.fillText(tg, gx + T.fs * 0.25, gy + T.fs * 0.2);
    }
    capTextDraw(g, T, B.cx, B.cy + (cap.shape === 'burst' ? T.fs * 0.04 : 0), INK, null, 0, 'center');
    g.restore();
    return B.r;
  }
  function drawSubtitle(g, cap, t, S, E) {
    const P = subtitleLayout(cap, E);
    const { kIn, kOut } = capAlpha(cap, t);
    if (kIn <= 0 || kOut >= 1) return;
    const r = P.rect, col = WHO[cap.who] || C.white;
    g.save();
    g.globalAlpha = EZ.outQuad(kIn) * (1 - kOut);
    g.translate(0, (1 - EZ.outBack(kIn)) * 14);
    g.fillStyle = 'rgba(4,6,12,0.8)';
    g.beginPath(); g.moveTo(r[0] + 10, r[1]); g.lineTo(r[0] + r[2], r[1]); g.lineTo(r[0] + r[2] - 10, r[1] + r[3]); g.lineTo(r[0], r[1] + r[3]); g.closePath(); g.fill();
    g.fillStyle = col; g.fillRect(r[0] + 8, r[1] + r[3] - 4, r[2] - 18, 4);
    g.font = NS.font(P.tagFs, F.comic); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = col;
    const ty = r[1] + P.fs * 0.31 + P.T.lh * 0.5 + P.tagFs * 0.36;
    g.fillText(cap.who, r[0] + P.fs * 0.5, ty);
    capTextDraw(g, P.T, r[0] + P.fs * 0.5 + P.tagW, r[1] + r[3] / 2, WHITE, INK, 0.12, 'left');
    g.restore();
  }
  function drawShelfItem(g, it, t, S, E) {
    const P = shelfLayout(it, E);
    const G = it.group || it;
    const kIn = clamp((t - G.tIn) / 0.18), kOut = clamp((t - (G.tOut - 0.18)) / 0.18);
    if (kIn <= 0 || kOut >= 1) return;
    const lou = it.kind === 'lou';
    const col = lou ? LOU : it.kind === 'fan' ? C.fireHot : (WHO[it.who] || C.white);
    g.save();
    g.globalAlpha = EZ.outQuad(kIn) * (1 - kOut);
    g.translate(0, (1 - EZ.outCubic(kIn)) * 12);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    // lane rule
    g.fillStyle = col; g.globalAlpha *= 0.9;
    g.fillRect(P.x - 14, P.y + 4, 5, P.h - 6);
    let y = P.y;
    const louBadge = (f, bx, bb) => {
      g.font = NS.font(f, F.hud);
      const bw = spacedW(LOU_PREFIX, F.hud, f, f * 0.05);
      g.fillStyle = LOU; g.fillRect(bx - f * 0.2, bb - f * 0.84, bw + f * 0.4, f * 1.06);
      g.fillStyle = '#04080e'; fillSpaced(g, LOU_PREFIX, bx, bb, F.hud, f, f * 0.05, 'fill');
      g.fillStyle = LOU; tri(g, bx + bw + f * 0.5, bb - f * 0.32, f * 0.46);
    };
    if (P.tag) {
      g.font = NS.font(P.tagFs, F.comic);
      g.fillStyle = col;
      g.fillText(P.tag, P.x, y + P.tagFs * 0.82);
      y += P.tagH;
    } else if (P.badge) {
      louBadge(P.tagFs * 0.86, P.x + 6, y + P.tagFs * 0.82);
      y += P.tagH;
    }
    const base = (li) => y + li * P.lh + P.fs * 0.8;
    if (lou) {
      if (!P.badge) louBadge(P.fs * 0.86, P.x + 6, base(0));
      g.font = NS.font(P.fs, F.hud);
      it.words.forEach((w, i) => {
        const p = P.pos[i];
        if (!p || t < w.t) return;
        const k = S.reduced ? 1 : clamp((t - w.t) / 0.12);
        g.fillStyle = k < 1 ? LOU : '#e9fbff';
        g.fillText(glitchStr(w.text, t, it.seed + i, k), P.x + p.x, base(p.li));
      });
    } else {
      g.font = NS.font(P.fs, P.fam);
      g.lineJoin = 'round';
      let wi = 0;
      P.lines.forEach((ln, li) => {
        let x = P.x;
        ln.forEach((wd) => {
          const em = /[a-z]/.test(it.text) && isCapsWord(wd);
          g.fillStyle = it.kind === 'fan' ? C.fireHot : em ? col : WHITE;
          g.fillText(wd, x, base(li));
          x += tw(wd + ' ', P.fam, P.fs);
          wi++;
        });
      });
    }
    g.restore();
  }

  // ================================================================================================ cards
  // ---- title (bar 8): logo slam + sparks, KEEP THEM DAN-CING on the riff stabs, the sub line types on ----------
  function titleLayout(card, E) {
    return cached(card.id + ':L', E, () => {
      const c = card.src;
      const song = String(c.song || SCORE.title || '').toUpperCase();
      const words = song.split(/\s+/);
      // the last word splits on the riff (DAN-CING) when it is long
      const pieces = [];
      words.forEach((w, i) => {
        if (i === words.length - 1 && w.length >= 6) { const h = Math.ceil(w.length / 2) - 1; pieces.push({ text: w.slice(0, h), join: true }, { text: w.slice(h) }); }
        else pieces.push({ text: w });
      });
      const fs = Math.max(78, E.minU(26));
      const fam = F.title;
      const gap = fs * 0.24;
      let total = 0;
      pieces.forEach((p, i) => { p.w = tw(p.text, fam, fs); total += p.w + (i < pieces.length - 1 && !p.join ? gap : 0); });
      let x = W / 2 - total / 2;
      pieces.forEach((p, i) => { p.x = x; p.cx = x + p.w / 2; x += p.w + (i < pieces.length - 1 && !p.join ? gap : 0); });
      // stabs: steps 0/4/8/14 of the bar after the logo (the hook rhythm)
      const stabs = [0, 4, 8, 14];
      pieces.forEach((p, i) => { p.t = card.t0 + BAR + (stabs[i] != null ? stabs[i] : 14 + (i - 3) * 2) * STEP; });
      const sub = NS.fill ? String(c.sub || '') : '';
      const sfs = Math.max(27, E.minU(12));
      const logoW = Math.min(800, W - 120);
      return { pieces, fs, fam, sub, sfs, logoW, logoY: 300, titleBase: 440, subBase: 506, song };
    });
  }
  function sparks(g, t, t0, x0, x1, y, n, seed, scale, reduced) {
    const dt = t - t0;
    if (dt < 0 || dt > 1.1) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const life = 0.45 + hash(i, seed) * 0.6;
      if (dt > life) continue;
      const k = dt / life;
      const ox = lerp(x0, x1, hash(i, seed + 1)), oy = y + (hash(i, seed + 2) - 0.5) * 30;
      const ang = -Math.PI / 2 + (hash(i, seed + 3) - 0.5) * 2.6;
      const sp = (380 + hash(i, seed + 4) * 900) * scale;
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
      const px = ox + vx * dt, py = oy + vy * dt + 900 * scale * dt * dt;
      const vyy = vy + 1800 * scale * dt;
      const vl = Math.hypot(vx, vyy) || 1;
      const len = 10 + 26 * (1 - k);
      g.globalAlpha = (1 - k) * (reduced ? 0.5 : 0.95);
      g.strokeStyle = hash(i, seed + 5) < 0.3 ? '#ffffff' : hash(i, seed + 6) < 0.6 ? C.fireHot : C.fire;
      g.lineWidth = 1.5 + 2.5 * (1 - k);
      g.beginPath(); g.moveTo(px, py); g.lineTo(px - vx / vl * len, py - vyy / vl * len); g.stroke();
    }
    g.restore();
  }
  function drawTitleStatic(g, card, E, res, opts) {
    const P = titleLayout(card, E);
    const LS = logoSprite(res, [card.tIn, card.tOut]);
    const sc = P.logoW / (LS.w - 300) * 0.98;
    const vg = vignetteSprite(res);
    g.save();
    g.globalAlpha = opts && opts.vig != null ? opts.vig : 0.75;
    g.drawImage(vg.c, 180, 150, 920, 440);
    g.restore();
    const lw = LS.w * sc, lh = LS.h * sc;
    g.drawImage(LS.c, W / 2 - lw / 2, P.logoY - lh / 2, lw, lh);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = NS.font(P.fs, P.fam);
    P.pieces.forEach((p) => popText(g, p.text, p.cx, P.titleBase, { lw: P.fs * 0.12, layers: [{ dx: P.fs * 0.06, dy: P.fs * 0.065, c: GANG }], fill: WHITE }));
    drawSub(g, P, card, null, 1);
  }
  function drawSub(g, P, card, S, k) {
    const text = NS.fill(String(P.sub || ''), S || undefined);
    if (!text) return;
    const fam = F.title, fs = P.sfs, sp = fs * 0.22;
    const full = spacedW(text, fam, fs, sp);
    const n = Math.floor(Array.from(text).length * k);
    const shown = Array.from(text).slice(0, n).join('');
    const x0 = W / 2 - full / 2;
    g.save();
    g.textBaseline = 'alphabetic';
    g.font = NS.font(fs, fam);
    // rules either side
    const rk = EZ.outCubic(clamp(k * 1.5));
    g.fillStyle = INK; g.fillRect(x0 - 26 - 90 * rk - 2, P.subBase - fs * 0.42 - 2, 90 * rk + 4, 7); g.fillRect(x0 + full + 24 - 2, P.subBase - fs * 0.42 - 2, 90 * rk + 4, 7);
    g.fillStyle = C.vex; g.fillRect(x0 - 26 - 90 * rk, P.subBase - fs * 0.42, 90 * rk, 3); g.fillRect(x0 + full + 24, P.subBase - fs * 0.42, 90 * rk, 3);
    g.lineWidth = fs * 0.16; g.strokeStyle = INK; g.lineJoin = 'round';
    g.fillStyle = C.bone;
    fillSpaced(g, shown, x0, P.subBase, fam, fs, sp, 'both');
    if (k < 1 && k > 0) { const cw = spacedW(shown, fam, fs, sp); g.fillStyle = C.vex; g.fillRect(x0 + cw + sp, P.subBase - fs * 0.86, fs * 0.5, fs * 0.9); }
    g.restore();
  }
  function drawTitle(g, card, t, S, E) {
    const P = titleLayout(card, E);
    const res = resOf(g);
    const t0 = card.t0, t1 = card.tOut;
    const exitD = 0.42;
    const shakeK = S.shakeK == null ? 1 : S.shakeK;
    if (t >= t1 - exitD) return drawTitleExit(g, card, t, S, E, res, clamp((t - (t1 - exitD)) / exitD));
    // camera-ish shake from the logo slam and each title stab
    let A = 0;
    const dL = t - t0;
    if (dL >= 0) A += 22 * Math.exp(-dL / 0.16);
    P.pieces.forEach((p) => { const d = t - p.t; if (d >= 0) A += 9 * Math.exp(-d / 0.09); });
    A *= shakeK;
    const sx = A * noise1(t * 50, 11), sy = A * noise1(t * 50 + 7, 12);
    g.save();
    g.translate(sx, sy);
    const vg = vignetteSprite(res);
    g.save(); g.globalAlpha = 0.75 * smoothstep(t0 - 0.08, t0 + 0.3, t); g.drawImage(vg.c, 180, 150, 920, 440); g.restore();
    // logo slam (pre-roll lands on the downbeat)
    const LS = logoSprite(res, [card.tIn, card.tOut]);
    const sc0 = P.logoW / (LS.w - 300) * 0.98;
    const lw = LS.w * sc0, lh = LS.h * sc0;
    const pre = card.pre || 0.08;
    let sc, a;
    if (dL < 0) { const k = (dL + pre) / pre; sc = lerp(3.2, 1, k * k); a = clamp(k * 1.5); }
    else { sc = 1 - 0.06 * Math.exp(-dL / 0.06) * Math.cos(dL * 34); a = 1; }
    // breathing glow on the kick
    const kick = isFinite(S.kick) ? S.kick : 9;
    const glowK = dL >= 0 ? 0.45 * Math.exp(-kick / 0.12) + 0.9 * Math.exp(-dL / 0.25) : 0;
    if (a > 0) {
      // motion ghosts while falling
      if (dL < 0) for (let i = 2; i >= 1; i--) { const s2 = Math.min(1.6, sc) * (1 + i * 0.12); g.globalAlpha = a * 0.16; g.drawImage(LS.c, W / 2 - lw * s2 / 2, P.logoY - lh * s2 / 2, lw * s2, lh * s2); }
      if (glowK > 0.01) {
        const gs = glowSprite(res);
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, glowK) * 0.55 * (S.flashK == null ? 1 : S.flashK);
        g.drawImage(gs.c, W / 2 - 520, P.logoY - 150, 1040, 300);
        g.restore();
      }
      g.globalAlpha = a;
      g.drawImage(LS.c, W / 2 - lw * sc / 2, P.logoY - lh * sc / 2, lw * sc, lh * sc);
      if (dL >= 0 && dL < 0.16 && !S.reduced) {
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - dL / 0.16) * 0.6;
        g.drawImage(LS.c, W / 2 - lw / 2, P.logoY - lh / 2, lw, lh);
        g.restore();
      }
      g.globalAlpha = 1;
    }
    sparks(g, t, t0, W / 2 - P.logoW * 0.45, W / 2 + P.logoW * 0.45, P.logoY + 40, 56, 101, 1, S.reduced);
    // song title pieces (their sparks fly up from behind them)
    P.pieces.forEach((p, i) => { if (t >= p.t) sparks(g, t, p.t, p.x, p.x + p.w, P.titleBase - P.fs * 0.8, 12, 200 + i, 0.55, S.reduced); });
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = NS.font(P.fs, P.fam);
    P.pieces.forEach((p, i) => {
      const d = t - p.t;
      if (d < -0.06) return;
      let s2, a2;
      if (d < 0) { const k = (d + 0.06) / 0.06; s2 = lerp(2.0, 1, k * k); a2 = clamp(k * 2); }
      else { s2 = 1 - 0.08 * Math.exp(-d / 0.05) * Math.cos(d * 40); a2 = 1; }
      g.save();
      g.globalAlpha = a2;
      g.translate(p.cx, P.titleBase - P.fs * 0.43);
      g.rotate((hash(i, 5) - 0.5) * 0.05 * (1 - clamp(d / 0.3)));
      g.scale(s2, s2);
      popText(g, p.text, 0, P.fs * 0.43, { lw: P.fs * 0.12, layers: [{ dx: P.fs * 0.06, dy: P.fs * 0.065, c: GANG }], fill: WHITE });
      g.restore();
    });
    // the sub line types on at bar 10
    const ts = t0 + 2 * BAR;
    if (t >= ts) drawSub(g, P, card, S, clamp((t - ts) / 0.55));
    g.restore();
  }
  // exit: the card slices into strips that shoot sideways
  function drawTitleExit(g, card, t, S, E, res, k) {
    const zx = 140, zy = 130, zw = 1000, zh = 440;
    const rs = Math.min(res, 1.25);
    const sp = sprite('title:' + NS.fmtInt(S.night || NS.night) + ':' + E.key, zw, zh, rs, (c2) => {
      c2.translate(-zx, -zy);
      drawTitleStatic(c2, card, E, res, { vig: 0.75 });
    }, [card.tOut - 0.6, card.tOut]);
    res = rs;
    const n = 9;
    const reduced = S.reduced || (S.shakeK != null && S.shakeK < 0.5);
    g.save();
    for (let i = 0; i < n; i++) {
      const y0 = zh * i / n, hh = zh / n;
      const dir = i % 2 ? 1 : -1;
      const kk = clamp(k * (1 + hash(i, 3) * 0.6));
      const dx = reduced ? 0 : dir * EZ.inCubic(kk) * (700 + 500 * hash(i, 4));
      const a = 1 - EZ.inQuad(kk);
      if (a <= 0.003) continue;
      g.globalAlpha = a;
      g.drawImage(sp.c, 0, y0 * res, zw * res, hh * res + 1, zx + dx, zy + y0, zw, hh + 1 / res);
      if (!reduced && kk > 0.05 && kk < 0.7) {
        g.globalAlpha = a * 0.35;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(sp.c, 0, y0 * res, zw * res, hh * res + 1, zx + dx * 1.15 + dir * 10, zy + y0, zw, hh + 1 / res);
        g.globalCompositeOperation = 'source-over';
      }
    }
    g.restore();
  }

  // ---- intro (bars 16-24): halftone banner, NAME punch on the shout, role tab, narration box ------------------
  function introLayout(card, E) {
    return cached(card.id + ':L', E, () => {
      const c = card.src;
      const right = String(c.side || 'right') !== 'left';
      const maxW = 560;
      const name = String(c.name || c.who || '').toUpperCase();
      const fam = F.comic;
      const minS = E.minU(26);
      // one row or two
      const one = Math.min(168, (maxW - 30) / (w100(name, fam) / 100));
      let rows = [name], ns = one;
      const parts = name.split(' ');
      if (parts.length > 1 && one < 132) {
        const two = Math.min(168, (maxW - 60) / (Math.max(...parts.map((p) => w100(p, fam) / 100))));
        if (two * 0.86 > one) { rows = parts; ns = Math.min(two, 140); }
      }
      ns = Math.max(minS, ns);
      const rfs = Math.max(34, E.minU(12));
      const lfs = Math.max(36, E.minU(12.5));
      const T = capText({ text: String(c.line || '') }, E, lfs, maxW - 70);
      const role = String(c.role || '').toUpperCase();
      const rsp = rfs * 0.14;
      const nameW = Math.max(...rows.map((r, i) => tw(r, fam, ns) + i * ns * 0.2)) + 20;
      const roleW = spacedW(role, F.title, rfs, rsp) + 28;
      const boxW = T.w + lfs * 0.9;
      const bw = clamp(Math.max(nameW * 0.92, roleW + 40, boxW + 50) + 46, 340, 620);
      const x0 = right ? W - 44 - bw + 20 : 44;
      const nameTop = 196;
      const nameH = rows.length * ns * 0.8;
      const bannerY = nameTop + nameH * 0.55;
      const roleY = nameTop + nameH + 30;
      const boxY = roleY + rfs * 1.22 + 20;
      const boxH = T.h + lfs * 0.7;
      const bannerH = boxY + boxH + 30 - bannerY;
      const rect = [right ? 640 : 0, nameTop - 30, 640, bannerY + bannerH + 40 - (nameTop - 30)];
      return { right, x0, bw, name, rows, ns, fam, rfs, rsp, roleW, lfs, T, boxW, nameTop, roleY, bannerY, bannerH, boxY, boxH, rect, role, col: WHO[String(c.who || '').toUpperCase()] || C.vex };
    });
  }
  function introBanner(card, E, res) {
    const P = introLayout(card, E);
    const bw = P.bw + 40, bh = P.bannerH;
    return sprite('intro:' + card.id + ':' + E.key, bw + 40, bh + 40, Math.min(res, 1.5), (g) => {
      g.translate(20, 20);
      const sk = 30;
      const path = () => { g.beginPath(); g.moveTo(sk, 0); g.lineTo(bw, 0); g.lineTo(bw - sk, bh); g.lineTo(0, bh); g.closePath(); };
      // drop block in the accent colour (offset print), then the dark banner
      g.save(); g.translate(11, 13); path(); g.fillStyle = P.col; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); g.restore();
      path(); g.fillStyle = '#0d0b12'; g.fill();
      g.save(); path(); g.clip();
      // accent halftone, growing toward the outer edge
      const mirror = !P.right;
      g.save();
      if (mirror) { g.translate(bw, 0); g.scale(-1, 1); }
      g.globalAlpha = 0.55;
      halftone(g, 0, 0, bw, bh, P.col, 12, 0.3, 4.6, 0.5);
      g.restore();
      // a dark gradient so the text side stays clean
      const gr = g.createLinearGradient(mirror ? bw : 0, 0, mirror ? 0 : bw, 0);
      gr.addColorStop(0, 'rgba(13,11,18,0.92)'); gr.addColorStop(0.55, 'rgba(13,11,18,0.55)'); gr.addColorStop(1, 'rgba(13,11,18,0)');
      g.fillStyle = gr; g.fillRect(0, 0, bw, bh);
      // speed streaks
      g.fillStyle = 'rgba(255,255,255,0.07)';
      const R = NS.rng(card.seed);
      for (let i = 0; i < 10; i++) { const y = R() * bh; g.fillRect(0, y, bw, 1 + R() * 2.5); }
      // accent rail along the bottom
      g.fillStyle = P.col; g.fillRect(0, bh - 10, bw, 10);
      g.restore();
      path(); g.lineWidth = 6; g.strokeStyle = INK; g.lineJoin = 'miter'; g.stroke();
    }, [card.tIn, card.tOut]);
  }
  function drawIntro(g, card, t, S, E) {
    const P = introLayout(card, E);
    const res = resOf(g);
    const t0 = card.t0, t1 = card.tOut;
    const kOut = clamp((t - (t1 - 0.2)) / 0.2);
    const outDir = P.right ? 1 : -1;
    const ox = EZ.inCubic(kOut) * 760 * outDir;
    const A = 1 - kOut;
    if (A <= 0.003) return;
    const shakeK = S.shakeK == null ? 1 : S.shakeK;
    const dP = t - card.punch;
    const sh = dP >= 0 ? 12 * Math.exp(-dP / 0.12) * shakeK : 0;
    g.save();
    g.translate(ox + sh * noise1(t * 50, card.seed), sh * noise1(t * 50 + 9, card.seed));
    g.globalAlpha = A;
    const cx = P.x0 + P.bw / 2, cy = P.bannerY + P.bannerH / 2;
    g.translate(cx, cy); g.rotate(P.right ? -0.04 : 0.04); g.translate(-cx, -cy);
    // banner wipe from the outer edge
    const bk = EZ.outCubic(clamp((t - (t0 - 0.06)) / 0.2));
    const B = introBanner(card, E, res);
    const bx = P.x0 - 40, by = P.bannerY - 20;
    g.save();
    g.beginPath();
    if (P.right) g.rect(bx + B.w * (1 - bk), by - 40, B.w * bk + 60, B.h + 80);
    else g.rect(bx - 60, by - 40, B.w * bk + 60, B.h + 80);
    g.clip();
    g.drawImage(B.c, bx, by, B.w, B.h);
    g.restore();
    // role tab (beat 1): accent tab, black type
    const rk = EZ.outBack(clamp((t - (t0 + BEAT)) / 0.18));
    if (rk > 0) {
      g.save();
      g.translate((1 - rk) * 120 * outDir, 0);
      g.globalAlpha = A * clamp(rk * 2);
      g.font = NS.font(P.rfs, F.title);
      const rx = P.x0 + 22, ry = P.roleY;
      const h = P.rfs * 1.22;
      g.fillStyle = INK; g.fillRect(rx - 12 + 5, ry - 4 + 6, P.roleW, h);
      g.fillStyle = P.col; g.fillRect(rx - 12, ry - 4, P.roleW, h);
      g.fillStyle = INK; g.textBaseline = 'alphabetic';
      fillSpaced(g, P.role, rx + 2, ry - 4 + h * 0.5 + P.rfs * 0.43, F.title, P.rfs, P.rsp, 'fill');
      g.restore();
    }
    // narration box (beat 2)
    const lk = clamp((t - (t0 + 2 * BEAT)) / 0.16);
    if (lk > 0) {
      g.save();
      const bxx = P.x0 + 34, byy = P.boxY, bww = P.boxW, bhh = P.boxH;
      g.translate(bxx + bww / 2, byy + bhh / 2);
      g.rotate((P.right ? 0.022 : -0.022) * (1 + (1 - lk) * 3));
      const s2 = lerp(0.6, 1, EZ.outBack(lk));
      g.scale(s2, s2);
      g.globalAlpha = A * clamp(lk * 2);
      g.fillStyle = INK; g.fillRect(-bww / 2 + 7, -bhh / 2 + 8, bww, bhh);
      g.fillStyle = C.paper; g.fillRect(-bww / 2, -bhh / 2, bww, bhh);
      g.lineWidth = 4; g.strokeStyle = INK; g.strokeRect(-bww / 2, -bhh / 2, bww, bhh);
      capTextDraw(g, P.T, 0, 0, INK, null, 0, 'center');
      g.restore();
    }
    // the NAME punches on the shout's downbeat with the gang-yellow shadow
    const pre = 0.07;
    if (dP >= -pre) {
      let sc, a;
      if (dP < 0) { const k = (dP + pre) / pre; sc = lerp(2.4, 1, k * k); a = clamp(k * 2); }
      else { sc = 1 - 0.08 * Math.exp(-dP / 0.05) * Math.cos(dP * 36); a = 1; }
      g.font = NS.font(P.ns, P.fam);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      P.rows.forEach((row, ri) => {
        const base = P.nameTop + (ri + 1) * P.ns * 0.8;
        const rw = tw(row, P.fam, P.ns);
        const nx = P.x0 + 4 + rw / 2 + ri * P.ns * 0.2;
        g.save();
        g.globalAlpha = A * a;
        g.translate(nx, base - P.ns * 0.37);
        g.rotate(-0.035);
        g.scale(sc, sc);
        const off = P.ns * 0.065;
        popText(g, row, -rw / 2, P.ns * 0.37, { lw: P.ns * 0.1, layers: [{ dx: off, dy: off * 1.1, c: GANG }], fill: P.col });
        // a crisp highlight across the top of the letters
        g.save(); g.beginPath(); g.rect(-rw / 2 - 20, -P.ns * 0.37 - 4, rw + 40, P.ns * 0.2); g.clip();
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillText(row, -rw / 2, P.ns * 0.37);
        g.restore();
        if (dP >= 0 && dP < 0.18 && !S.reduced) {
          const k = dP / 0.18;
          g.globalAlpha = A * (1 - k) * 0.7;
          g.strokeStyle = WHITE; g.lineWidth = 2;
          g.save(); g.scale(1 + k * 0.25, 1 + k * 0.25); g.strokeText(row, -rw / 2, P.ns * 0.37); g.restore();
        }
        g.restore();
      });
    }
    g.restore();
  }

  // ---- chapter: a programme slate top-left (yellowed paper, Special Elite, Lou's mark) -------------------------
  function slateLayout(card, E) {
    return cached(card.id + ':L', E, () => {
      const c = card.src;
      const n = String(c.n || '').toUpperCase(), title = String(c.title || '').toUpperCase();
      const fam = F.type;
      const nfs = Math.max(22, E.minU(10.5)), tfs = Math.max(44, E.minU(14));
      const nsp = nfs * 0.35;
      const tW = tw(title, fam, tfs), nW = spacedW(n, fam, nfs, nsp);
      const w = clamp(Math.max(tW, nW + 120) + 64, 340, 600);
      const h = 22 + nfs * 1.1 + 10 + tfs * 1.0 + 14 + 26 + 10;
      return { n, title, fam, nfs, tfs, nsp, w, h, x: 40, y: 30 };
    });
  }
  function slateSprite(card, E, res) {
    const P = slateLayout(card, E);
    const pad = 16;
    return sprite('slate:' + card.id + ':' + E.key + ':' + (NS.kit && NS.kit.symbol ? 1 : 0), P.w + pad * 2, P.h + pad * 2, res, (g) => {
      g.translate(pad, pad);
      // shadow
      g.save(); g.translate(5, 7); roughRect(g, 0, 0, P.w, P.h, 2.5, card.seed); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill(); g.restore();
      roughRect(g, 0, 0, P.w, P.h, 2.5, card.seed);
      g.save(); g.clip();
      paper(g, -4, -4, P.w + 8, P.h + 8, card.seed, '#e6d6ad');
      g.restore();
      const ink = '#2a1d12';
      g.strokeStyle = ink; g.globalAlpha = 0.8;
      g.lineWidth = 2.2; g.strokeRect(9, 9, P.w - 18, P.h - 18);
      g.lineWidth = 0.9; g.strokeRect(14, 14, P.w - 28, P.h - 28);
      g.globalAlpha = 1;
      // ACT line with rules
      g.fillStyle = ink; g.textBaseline = 'alphabetic';
      g.font = NS.font(P.nfs, P.fam);
      const nW = spacedW(P.n, P.fam, P.nfs, P.nsp);
      const ny = 22 + P.nfs * 0.95;
      fillSpaced(g, P.n, P.w / 2 - nW / 2, ny, P.fam, P.nfs, P.nsp, 'fill');
      g.fillRect(28, ny - P.nfs * 0.33, P.w / 2 - nW / 2 - 44, 1.6);
      g.fillRect(P.w / 2 + nW / 2 + 16, ny - P.nfs * 0.33, P.w / 2 - nW / 2 - 44, 1.6);
      // title, letterpress (a faint second impression)
      g.font = NS.font(P.tfs, P.fam);
      g.textAlign = 'center';
      const ty = ny + 10 + P.tfs * 0.9;
      g.globalAlpha = 0.28; g.fillText(P.title, P.w / 2 + 1.2, ty + 0.8);
      g.globalAlpha = 1; g.fillText(P.title, P.w / 2, ty);
      // printer's mark: Lou's clock between two short rules
      const my = P.h - 26;
      mark(g, P.w / 2, my, 22, ink, { weight: 0.1 });
      g.fillRect(P.w / 2 - 70, my - 0.8, 44, 1.6); g.fillRect(P.w / 2 + 26, my - 0.8, 44, 1.6);
      // worn ink
      g.globalCompositeOperation = 'destination-out';
      const R = NS.rng(card.seed + 5);
      for (let i = 0; i < 260; i++) { g.globalAlpha = 0.2 + R() * 0.5; g.fillRect(20 + R() * (P.w - 40), 14 + R() * (P.h - 28), 0.8 + R() * 1.6, 0.8 + R() * 1.4); }
    }, [card.tIn, card.tOut]);
  }
  function drawChapter(g, card, t, S, E) {
    const P = slateLayout(card, E);
    const res = resOf(g);
    const sp = slateSprite(card, E, res);
    const kIn = clamp((t - card.t0) / 0.38), kOut = clamp((t - (card.tOut - 0.26)) / 0.26);
    if (kIn <= 0 || kOut >= 1) return;
    const reducedM = S.shakeK != null && S.shakeK < 0.5;
    const y = lerp(-P.h - 40, P.y, EZ.outBack(kIn)) - EZ.inCubic(kOut) * (P.h + 60);
    const swing = reducedM ? 0 : Math.exp(-(t - card.t0) / 0.3) * Math.sin((t - card.t0) * 16) * 0.05;
    g.save();
    g.globalAlpha = 1 - kOut * 0.6;
    g.translate(P.x + 30, y);
    g.rotate(-0.022 + swing);
    g.translate(-30, 0);
    g.drawImage(sp.c, -16, -16, sp.w, sp.h);
    g.restore();
  }

  // ---- special: an enemy-intro banner across the bottom band, with a jolt ---------------------------------------
  function drawSpecial(g, card, t, S, E) {
    const c = card.src;
    const kIn = clamp((t - card.t0) / 0.13), kOut = clamp((t - (card.tOut - 0.2)) / 0.2);
    if (kIn <= 0 || kOut >= 1) return;
    const name = String(c.name || '').toUpperCase(), line = String(c.line || '');
    const nfs = Math.max(98, E.minU(28)), lfs = Math.max(38, E.minU(12.5));
    const shakeK = S.shakeK == null ? 1 : S.shakeK;
    const d = t - card.t0;
    const jolt = (d >= 0 ? 16 * Math.exp(-d / 0.1) : 0) + (d >= BEAT ? 7 * Math.exp(-(d - BEAT) / 0.08) : 0);
    const jx = jolt * noise1(t * 60, card.seed) * shakeK, jy = jolt * noise1(t * 60 + 5, card.seed) * shakeK;
    const yOff = (1 - EZ.outBack(kIn)) * 190 + EZ.inCubic(kOut) * 200;
    g.save();
    g.translate(jx, jy + yOff);
    // the band: black, slanted, red rails, hazard ticks
    const y0 = 556, y1 = 704;
    g.beginPath(); g.moveTo(-20, y0 + 22); g.lineTo(W + 20, y0 - 8); g.lineTo(W + 20, y1); g.lineTo(-20, y1 + 10); g.closePath();
    g.fillStyle = 'rgba(6,4,6,0.9)'; g.fill();
    g.fillStyle = C.red;
    g.beginPath(); g.moveTo(-20, y0 + 22); g.lineTo(W + 20, y0 - 8); g.lineTo(W + 20, y0 - 1); g.lineTo(-20, y0 + 29); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-20, y1 + 4); g.lineTo(W + 20, y1 - 6); g.lineTo(W + 20, y1); g.lineTo(-20, y1 + 10); g.closePath(); g.fill();
    g.save();
    g.beginPath(); g.moveTo(-20, y0 + 30); g.lineTo(150, y0 + 26); g.lineTo(110, y1 + 3); g.lineTo(-20, y1 + 5); g.closePath(); g.clip();
    for (let i = -2; i < 8; i++) { g.beginPath(); g.moveTo(i * 34, y1 + 10); g.lineTo(i * 34 + 17, y1 + 10); g.lineTo(i * 34 + 87, y0); g.lineTo(i * 34 + 70, y0); g.closePath(); g.fillStyle = C.red; g.fill(); }
    g.restore();
    // name with a chromatic split that snaps together
    const nx = 176, nb = 668;
    g.font = NS.font(nfs, F.title); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const split = S.reduced ? 0 : 14 * Math.exp(-Math.max(0, d) / 0.09) + (d >= BEAT ? 6 * Math.exp(-(d - BEAT) / 0.07) : 0);
    if (split > 0.4) {
      g.save(); g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.7; g.fillStyle = '#ff2030'; g.fillText(name, nx - split, nb);
      g.fillStyle = '#20e0ff'; g.fillText(name, nx + split, nb);
      g.restore();
    }
    popText(g, name, nx, nb, { lw: nfs * 0.1, layers: [{ dx: nfs * 0.06, dy: nfs * 0.06, c: C.red }], fill: WHITE });
    const nW = tw(name, F.title, nfs);
    // the line, typed after the jolt
    const T = capText({ text: line }, E, lfs, Math.max(320, W - 260 - nW - 60));
    const lx = Math.min(nx + nW + 50, W - 40 - T.w);
    const lk = clamp((t - card.t0 - 0.25) / 0.2);
    if (lk > 0) {
      g.save();
      g.globalAlpha = lk;
      g.translate((1 - EZ.outCubic(lk)) * 30, 0);
      capTextDraw(g, T, lx, 638, C.bone, INK, 0.12, 'left');
      g.restore();
    }
    g.restore();
  }

  // ---- warning: the SOLD OUT rubber stamp (Anton, -8°, ink texture), slammed on the bar-32 downbeat --------------
  function stampSprite(card, E, res) {
    const text = String(card.src.text || 'SOLD OUT').toUpperCase();
    const fs = Math.max(150, E.minU(30));
    const fam = F.title;
    const twd = tw(text, fam, fs);
    const w = twd + 92, h = fs * 0.86 + 96;
    return sprite('stamp:' + text + ':' + E.key, w + 40, h + 40, res, (g) => {
      g.translate(20, 20);
      const red = '#d8212c';
      g.strokeStyle = red; g.fillStyle = red; g.lineJoin = 'round';
      rrPath(g, 6, 6, w - 12, h - 12, 22); g.lineWidth = 12; g.stroke();
      rrPath(g, 22, 22, w - 44, h - 44, 12); g.lineWidth = 4; g.stroke();
      g.font = NS.font(fs, fam); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(text, w / 2, h / 2 + fs * 0.43);
      // ink texture: uneven pressure, speckles knocked out, a worn streak
      const R = NS.rng(card.seed + 3);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 1600; i++) {
        const x = R() * w, y = R() * h, r = R() < 0.92 ? 0.5 + R() * 1.6 : 2 + R() * 4;
        g.globalAlpha = 0.25 + R() * 0.75;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      for (let i = 0; i < 7; i++) {
        g.globalAlpha = 0.18 + R() * 0.2;
        const y = R() * h;
        g.fillRect(0, y, w, 1 + R() * 3);
      }
      g.globalAlpha = 0.35;
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.25;
      for (let i = 0; i < 40; i++) { g.fillStyle = R() < 0.5 ? '#7d0a12' : '#ff5a62'; g.beginPath(); g.arc(R() * w, R() * h, 6 + R() * 24, 0, TAU); g.fill(); }
    }, [card.tIn, card.tOut]);
  }
  function rrPath(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function drawWarning(g, card, t, S, E) {
    const res = resOf(g);
    const sp = stampSprite(card, E, res);
    const d = t - card.t0, pre = 0.07;
    if (d < -pre) return;
    const kOut = clamp((t - (card.tOut - 0.35)) / 0.35);
    if (kOut >= 1) return;
    let sc, a;
    if (d < 0) { const k = (d + pre) / pre; sc = lerp(2.3, 1, k * k); a = clamp(k * 2) * 0.9; }
    else { sc = 1 - 0.05 * Math.exp(-d / 0.04) * Math.cos(d * 45); a = 1; }
    // at most one pulse per beat
    if (d > 0.3 && !S.reduced) { const bs = ((t % BEAT) + BEAT) % BEAT; sc *= 1 + 0.018 * Math.exp(-bs / 0.07); }
    const shakeK = S.shakeK == null ? 1 : S.shakeK;
    const sh = d >= 0 ? 14 * Math.exp(-d / 0.1) * shakeK : 0;
    const maxW = 600, fit = Math.min(1, maxW / (sp.w * Math.cos(0.14) + sp.h * Math.sin(0.14)));
    g.save();
    g.translate(640 + sh * noise1(t * 60, 3), 360 + sh * noise1(t * 60 + 4, 3));
    g.rotate(-8 * Math.PI / 180);
    g.scale(sc * fit, sc * fit);
    g.globalAlpha = a * (1 - EZ.inQuad(kOut));
    // ink splatter flicked off by the impact
    if (d >= 0) {
      const R = NS.rng(card.seed + 9);
      g.fillStyle = '#d8212c';
      for (let i = 0; i < 18; i++) {
        const ang = R() * TAU, dist = (sp.w * 0.42 + R() * 90) * Math.min(1, d / 0.08 + 0.6);
        const rr = 2 + R() * 6;
        g.globalAlpha = a * (1 - EZ.inQuad(kOut)) * 0.85;
        g.beginPath(); g.arc(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.45, rr, 0, TAU); g.fill();
      }
      g.globalAlpha = a * (1 - EZ.inQuad(kOut));
    }
    g.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    if (d >= 0 && d < 0.2) { g.globalAlpha = (1 - d / 0.2) * 0.35; g.drawImage(sp.c, -sp.w / 2 * 1.04, -sp.h / 2 * 1.04, sp.w * 1.04, sp.h * 1.04); }
    g.restore();
  }

  // ---- end: two staggered lines, the second with a live countdown -------------------------------------------
  function endLayout(card, E) {
    return cached(card.id + ':L', E, () => {
      const lines = (card.src.lines || []).map(String);
      const f1 = Math.max(74, E.minU(26)), f2 = Math.max(40, E.minU(14));
      return { lines, f1, f2, b1: 372, b2: 448, rect: [200, 280, 880, 200] };
    });
  }
  function drawEnd(g, card, t, S, E) {
    const P = endLayout(card, E);
    const stg = (+card.src.stagger || 4) * BEAT;
    const d1 = t - card.t0, d2 = t - (card.t0 + stg);
    if (d1 < 0) return;
    g.save();
    g.textBaseline = 'alphabetic';
    // line 1: types on with a scan cursor
    const s1 = NS.fill(P.lines[0] || '', S);
    const k1 = clamp(d1 / 0.7);
    const ch1 = Array.from(s1);
    const n1 = Math.round(ch1.length * EZ.outQuad(k1));
    const sp1 = P.f1 * 0.06;
    const fw1 = spacedW(s1, F.title, P.f1, sp1);
    const x1 = W / 2 - fw1 / 2;
    g.font = NS.font(P.f1, F.title);
    g.lineJoin = 'round';
    g.globalAlpha = 1;
    // cold block shadow, then the line
    g.fillStyle = '#16267a';
    fillSpaced(g, ch1.slice(0, n1).join(''), x1 + P.f1 * 0.05, P.b1 + P.f1 * 0.06, F.title, P.f1, sp1, 'fill');
    g.lineWidth = P.f1 * 0.1; g.strokeStyle = INK; g.fillStyle = C.bone;
    fillSpaced(g, ch1.slice(0, n1).join(''), x1, P.b1, F.title, P.f1, sp1, 'both');
    if (k1 < 1) { const cw = spacedW(ch1.slice(0, n1).join(''), F.title, P.f1, sp1); g.fillStyle = LOU; g.fillRect(x1 + cw + 6, P.b1 - P.f1 * 0.86, P.f1 * 0.4, P.f1 * 0.86); }
    // hairline rule and HUD corner brackets
    const rk = EZ.outCubic(clamp(d1 / 0.9));
    g.fillStyle = 'rgba(233,226,207,0.55)';
    g.fillRect(W / 2 - fw1 / 2 * rk, P.b1 + P.f1 * 0.22, fw1 * rk, 2);
    {
      const bx0 = x1 - 44, bx1 = x1 + fw1 + 44, by0 = P.b1 - P.f1 * 0.86 - 34, by1 = P.b2 + P.f2 * 0.5 + 26;
      const L = 30 * rk, ex = (1 - rk) * 40;
      g.strokeStyle = 'rgba(233,226,207,0.75)'; g.lineWidth = 3; g.lineCap = 'square';
      g.beginPath();
      g.moveTo(bx0 - ex, by0 - ex + L); g.lineTo(bx0 - ex, by0 - ex); g.lineTo(bx0 - ex + L, by0 - ex);
      g.moveTo(bx1 + ex - L, by0 - ex); g.lineTo(bx1 + ex, by0 - ex); g.lineTo(bx1 + ex, by0 - ex + L);
      g.moveTo(bx0 - ex, by1 + ex - L); g.lineTo(bx0 - ex, by1 + ex); g.lineTo(bx0 - ex + L, by1 + ex);
      g.moveTo(bx1 + ex - L, by1 + ex); g.lineTo(bx1 + ex, by1 + ex); g.lineTo(bx1 + ex, by1 + ex - L);
      g.stroke();
    }
    // line 2 (stagger beats later): Share Tech Mono, Lou's cyan, the countdown ticks live
    if (d2 >= 0) {
      const s2 = NS.fill(P.lines[1] || '', S);
      const k2 = clamp(d2 / 0.5);
      const ch2 = Array.from(s2);
      const n2 = Math.round(ch2.length * EZ.outQuad(k2));
      g.font = NS.font(P.f2, F.hud);
      const fw2 = tw(s2, F.hud, P.f2);
      const x2 = W / 2 - fw2 / 2;
      g.textAlign = 'left';
      g.lineWidth = P.f2 * 0.14; g.strokeStyle = INK;
      const shown = ch2.slice(0, n2).join('');
      g.strokeText(shown, x2, P.b2);
      g.fillStyle = LOU; g.fillText(shown, x2, P.b2);
      if (k2 < 1 || Math.floor(t * 2) % 2 === 0) { const cw = tw(shown, F.hud, P.f2); g.fillStyle = LOU; g.fillRect(x2 + cw + 4, P.b2 - P.f2 * 0.72, P.f2 * 0.45, P.f2 * 0.8); }
    }
    g.restore();
  }

  function drawCard(g, card, t, S, E) {
    switch (card.type) {
      case 'title': return drawTitle(g, card, t, S, E);
      case 'intro': return drawIntro(g, card, t, S, E);
      case 'chapter': return drawChapter(g, card, t, S, E);
      case 'special': return drawSpecial(g, card, t, S, E);
      case 'warning': return drawWarning(g, card, t, S, E);
      case 'end': return drawEnd(g, card, t, S, E);
      default: return null;
    }
  }

  // ================================================================================================ frame
  const live = (it, t) => t >= it.tIn - 1e-6 && t <= it.tOut + 1e-6;
  function draw(ctx, S) {
    if (!S || !isFinite(S.t)) return;
    const sc = sched();
    const t = S.t;
    const E = envOf(ctx, S);
    const g = ctx;
    const shake = Array.isArray(S.shakeXY) ? S.shakeXY : [0, 0];
    const anchors = S.anchors || {};
    releaseSprites(t);
    prewarm(g, sc, t, E);
    g.save();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // cards (behind the lyrics); the end card is drawn last
    sc.cards.forEach((c) => { if (c.type !== 'end' && t >= c.tIn - 0.1 && t <= c.tOut + 1e-6) { g.save(); drawCard(g, c, t, S, E); g.restore(); } });
    // lyrics and kinetic shouts follow the camera shake
    g.save();
    g.translate(shake[0] || 0, shake[1] || 0);
    sc.shown.forEach((L) => { if (live(L, t)) { g.save(); drawLine(g, L, t, S, E); g.restore(); } });
    sc.spoken.forEach((s) => {
      if (!live(s, t)) return;
      g.save();
      if (s.kind === 'whisper') drawWhisper(g, s, t, S, E);
      else if (s.kind === 'boom') drawBoom(g, s, t, S, E);
      else if (s.kind === 'fan' && !E.shelf) drawFan(g, s, t, S, E);
      g.restore();
    });
    // captions: bubbles at the live anchor, else subtitles; the phone shelf takes them all
    sc.caps.forEach((cap) => {
      if (!live(cap, t) || E.shelf) return;
      g.save();
      const a = anchors[cap.who];
      if (Array.isArray(a) && isFinite(a[0]) && isFinite(a[1]) && a[0] > -40 && a[0] < W + 40 && a[1] > -40 && a[1] < H + 60) drawBubble(g, cap, a, t, S, E);
      else drawSubtitle(g, cap, t, S, E);
      g.restore();
    });
    g.restore();
    // Lou's lane
    sc.spoken.forEach((s) => { if (s.kind === 'lou' && live(s, t) && !E.shelf) { g.save(); drawLou(g, s, t, S, E); g.restore(); } });
    // the shelf lanes
    if (E.shelf) {
      sc.caps.forEach((cap) => { if (live(cap, t)) { g.save(); drawShelfItem(g, cap, t, S, E); g.restore(); } });
      sc.spoken.forEach((s) => { if ((s.kind === 'lou' || s.kind === 'fan') && live(s, t)) { g.save(); drawShelfItem(g, s, t, S, E); g.restore(); } });
    }
    sc.cards.forEach((c) => { if (c.type === 'end' && t >= c.tIn && t <= c.tOut + 1.6) { g.save(); drawCard(g, c, t, S, E); g.restore(); } });
    g.restore();
  }

  // build a card's sprites a little before it is needed (one card per frame), so its first frame stays cheap
  function prewarm(g, sc, t, E) {
    const c = sc.cards.find((x) => x.tIn > t && x.tIn - t < 1.2);
    if (!c) return;
    const res = resOf(g);
    if (c.type === 'title') { logoSprite(res, [c.tIn, c.tOut]); vignetteSprite(res); glowSprite(res); }
    else if (c.type === 'intro') introBanner(c, E, res);
    else if (c.type === 'chapter') slateSprite(c, E, res);
    else if (c.type === 'warning') stampSprite(c, E, res);
  }
  // the rects of everything textual at S.t (no drawing): [{ kind, id, rect }]
  function layout(S) {
    if (!S || !isFinite(S.t)) return [];
    const sc = sched();
    const t = S.t;
    const E = envOf(null, Object.assign({ cssScale: S.cssScale || 1 }, S));
    const out = [];
    sc.cards.forEach((c) => { if (t >= c.tIn && t <= c.tOut) out.push({ kind: 'card', type: c.type, id: c.id, rect: cardRect(c, E) }); });
    sc.shown.forEach((L) => { if (live(L, t)) out.push({ kind: 'lyric', id: L.id, rect: lineLayout(L, E).rect }); });
    sc.spoken.forEach((s) => {
      if (!live(s, t)) return;
      if (s.kind === 'lou') out.push({ kind: 'lou', id: s.id, rect: E.shelf ? shelfLayout(s, E).rect : louLayout(s, E).rect });
      else if (s.kind === 'fan' && E.shelf) out.push({ kind: 'spoken', id: s.id, rect: shelfLayout(s, E).rect });
      else out.push({ kind: 'spoken', id: s.id, rect: spokenLayout(s, E).rect });
    });
    const anchors = S.anchors || {};
    sc.caps.forEach((cap) => {
      if (!live(cap, t)) return;
      if (E.shelf) { out.push({ kind: 'caption', id: cap.id, rect: shelfLayout(cap, E).rect }); return; }
      const a = anchors[cap.who];
      if (Array.isArray(a) && isFinite(a[0]) && isFinite(a[1])) out.push({ kind: 'bubble', id: cap.id, rect: bubblePlace(cap, a, E).r });
      else out.push({ kind: 'caption', id: cap.id, rect: subtitleLayout(cap, E).rect });
    });
    return out;
  }

  // the band logo for scenes (e.g. the final freeze-frame poster): centred at (cx, cy), w units wide
  function logo(ctx, cx, cy, w, k) {
    const res = clamp(resOf(ctx) * (w / LOGO_W_NOMINAL), 0.25, 3);
    const LS = logoSprite(Math.ceil(res * 4) / 4, null, ':scene');
    const sc = w / LS.w;
    ctx.save();
    if (k != null) ctx.globalAlpha *= clamp(k);
    ctx.drawImage(LS.c, cx - w / 2, cy - LS.h * sc / 2, w, LS.h * sc);
    ctx.restore();
  }
  const LOGO_W_NOMINAL = 1100;

  NS.overlay = {
    draw,
    layout,
    logo,
    init() { sched(); },
    items: () => sched(),
    version: 1,
  };
})();
