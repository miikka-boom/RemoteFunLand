/* Cats on Mars: the score.
   Tempo, chords, arrangement, lyrics (with the phonemes the digital singer uses) and the
   event lists that both the synthesizer (synth.js) and the visuals (gfx.js) read.
   Works as a classic browser script and under Node (it fills globalThis.CM). */
(function (G) {
  'use strict';
  const CM = G.CM = G.CM || {};

  const SR = 44100;
  const BPM = 110;
  const BEAT = 60 / BPM;
  const STEP = BEAT / 4;            // one 16th note
  const BAR = BEAT * 4;
  const BARS = 72;
  const MUSIC_END = BARS * BAR;     // 157.09 s
  const DURATION = MUSIC_END + 4.5; // reverb tail and end card
  const T = (bar, step) => (bar * 16 + (step || 0)) * STEP;

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SECTIONS = [
    ['intro', 0], ['verse1', 8], ['pre', 16], ['chorus1', 20], ['inter', 28], ['verse2', 32],
    ['chorus2', 40], ['bridge', 48], ['final', 56], ['outro', 64], ['end', 72]
  ].map(([name, bar]) => ({ name, bar }));
  function sectionAt(bar) {
    let s = SECTIONS[0];
    for (const x of SECTIONS) if (bar >= x.bar) s = x;
    return s;
  }

  // One chord per bar, in A minor. The final chorus and the outro are a whole step up.
  const PROG = (
    'Am Am F F C C G G ' +            // 0  intro
    'Am F C G Am F C G ' +            // 8  verse 1
    'Dm Em F G ' +                    // 16 pre-chorus
    'F G Em Am F G Em Am ' +          // 20 chorus 1
    'F G Em Am ' +                    // 28 interlude
    'Am F C G Am F C G ' +            // 32 verse 2
    'F G Em Am F G Em Am ' +          // 40 chorus 2
    'Dm Am F C Dm Am Bb C ' +         // 48 bridge
    'F G Em Am F G Em Am ' +          // 56 final chorus (+2)
    'F G Em Am F G C C'               // 64 outro (+2), ends on D major
  ).split(/\s+/);

  const CHORDS = {
    Am: { root: 33, tones: [57, 60, 64], ext: 67 },
    F: { root: 29, tones: [57, 60, 65], ext: 64 },
    C: { root: 36, tones: [55, 60, 64], ext: 62 },
    G: { root: 31, tones: [55, 59, 62], ext: 57 },
    Dm: { root: 38, tones: [57, 62, 65], ext: 60 },
    Em: { root: 28, tones: [55, 59, 64], ext: 62 },
    Bb: { root: 34, tones: [58, 62, 65], ext: 60 }
  };
  const keyAt = bar => (bar >= 56 ? 2 : 0);
  function chordAt(bar) {
    bar = Math.max(0, Math.min(BARS - 1, bar));
    const c = CHORDS[PROG[bar]], k = keyAt(bar);
    return { name: PROG[bar], root: c.root + k, tones: c.tones.map(n => n + k), ext: c.ext + k };
  }

  // ---------------------------------------------------------------- lyrics
  // Token: text[PHONEMES]:midi:steps   (rest: _:steps). A trailing '-' joins the next syllable.
  // Midi is written in A minor; bars from 56 on are transposed by keyAt().
  function CHORUS(b) {
    return [
      { bar: b, s: 'Cats:69:2 on:69:2 Mars!:72:8 _:4 We:71:2 are:69:2 made:67:2 of:69:2 stars,:67:8' },
      { bar: b + 2, s: 'life:67:2 will:67:2 al-:69:2 ways:67:2 find:64:2 a:62:2 way.:64:18' },
      { bar: b + 4, s: 'Cats:69:2 on:69:2 Mars!:72:8 _:4 Pur-:71:2 ring:69:2 in:67:2 the:69:2 dark,:67:8' },
      { bar: b + 6, s: 'ev-:67:2 ery:67:2 heart:69:2 a:67:2 lit-:64:2 tle:67:2 spark.:69:16' }
    ];
  }
  const LINES = [
    { bar: 4, voice: 'robot', s: 'Hel-:55:2 lo:55:4 Earth.:52:8' },
    { bar: 6, voice: 'robot', s: 'This:55:2 is:55:2 Mars.:50:10' },

    { bar: 8, s: 'Red:64:3 dust:64:3 on:62:2 my:60:2 paws,:57:10' },
    { bar: 10, s: 'two:64:3 moons:64:3 in:67:2 the:64:2 sky.:62:10' },
    { bar: 12, s: 'Nine:64:3 lives:64:3 far:62:2 from:60:2 home,:57:10' },
    { bar: 14, s: 'still:60:3 I:62:3 won-:64:2 der:62:2 why.:67:10' },

    { bar: 16, s: 'Ev-:62:2 ery:64:2 star:65:4 was:64:2 dust:62:2 be-:64:2 fore,:64:12' },
    { bar: 18, s: 'ev-:65:2 ery:67:2 dust:69:4 can:67:2 dream:65:2 of:67:2 more!:67:12' },

    ...CHORUS(20),

    { bar: 32, s: 'Seeds:64:3 hide:64:3 in:62:2 our:60:2 fur,:57:10' },
    { bar: 34, s: 'fall-:64:3 ing:64:3 where:67:2 we:64:2 sleep.:62:10' },
    { bar: 36, s: 'Lit-:64:3 tle:64:3 green:62:2 be-:60:2 gins,:57:10' },
    { bar: 38, s: 'prom-[P R AA]:60:3 is-[M IH]:62:3 es[S IH Z]:64:2 to:62:2 keep.:67:10' },

    ...CHORUS(40),

    { bar: 48, s: 'Born:57:3 and[AH N]:57:1 grow:60:3 and[AH N]:60:1 play:62:3 and[AH N]:62:1 sleep,:64:12' },
    { bar: 50, s: 'that:67:2 is:65:2 the:64:2 na-:62:2 ture:60:2 of:62:2 life.:60:18' },
    { bar: 52, s: 'Love:65:3 the:64:1 ones:69:3 you:65:1 can-:64:2 not:62:2 keep,:64:12' },
    { bar: 54, s: 'that:65:2 is:67:2 the:69:2 na-:70:2 ture:69:2 of:67:2 life!:72:18' },

    ...CHORUS(56),

    { bar: 69, step: 8, s: 'Good-:67:2 night,:67:2 Earth.:64:20' }
  ];

  // ARPAbet per syllable (keys are the lower-cased letters of the sung text)
  const DICT = {
    hel: 'HH EH', lo: 'L OW', earth: 'ER TH', this: 'DH IH S', is: 'IH Z', mars: 'M AA R Z',
    red: 'R EH D', dust: 'D AH S T', on: 'AA N', my: 'M AY', paws: 'P AO Z',
    two: 'T UW', moons: 'M UW N Z', in: 'IH N', the: 'DH AH', sky: 'S K AY',
    nine: 'N AY N', lives: 'L AY V Z', far: 'F AA R', from: 'F R AH M', home: 'HH OW M',
    still: 'S T IH L', i: 'AY', won: 'W AH N', der: 'D ER', why: 'W AY',
    ev: 'EH V', ery: 'R IY', star: 'S T AA R', was: 'W AH Z', be: 'B IH', fore: 'F AO R',
    can: 'K AE N', dream: 'D R IY M', of: 'AH V', more: 'M AO R',
    cats: 'K AE T S', we: 'W IY', are: 'AA R', made: 'M EY D', stars: 'S T AA R Z',
    life: 'L AY F', will: 'W IH L', al: 'AO L', ways: 'W EY Z', find: 'F AY N D', a: 'AH', way: 'W EY',
    pur: 'P ER', ring: 'R IH NG', dark: 'D AA R K', heart: 'HH AA R T', lit: 'L IH', tle: 'T AH L',
    spark: 'S P AA R K', seeds: 'S IY D Z', hide: 'HH AY D', our: 'AW R', fur: 'F ER',
    fall: 'F AO L', ing: 'IH NG', where: 'W EH R', sleep: 'S L IY P', green: 'G R IY N',
    gins: 'G IH N Z', to: 'T UW', keep: 'K IY P', born: 'B AO R N', grow: 'G R OW',
    play: 'P L EY', that: 'DH AE T', na: 'N EY', ture: 'CH ER', love: 'L AH V', ones: 'W AH N Z',
    you: 'Y UW', not: 'N AA T', good: 'G UH D', night: 'N AY T', meow: 'MEOW'
  };

  function parseLine(L) {
    const k = keyAt(L.bar);
    let step = L.bar * 16 + (L.step || 0);
    const notes = [];
    let text = '';
    for (const tok of L.s.match(/(?:[^\s[]+|\[[^\]]*\])+/g)) {
      if (tok.startsWith('_:')) { step += +tok.slice(2); continue; }
      const m = tok.match(/^(.+?)(?:\[([A-Z ]+)\])?:(\d+):(\d+)$/);
      if (!m) throw new Error('bad token ' + tok);
      const raw = m[1], joined = raw.endsWith('-');
      const shown = joined ? raw.slice(0, -1) : raw;
      const key = shown.toLowerCase().replace(/[^a-z]/g, '');
      const ph = m[2] || DICT[key];
      if (!ph) throw new Error('no phonemes for ' + key);
      const c0 = text.length;
      text += shown;
      const c1 = text.length;
      if (!joined) text += ' ';
      notes.push({ t: step * STEP, d: +m[4] * STEP, midi: +m[3] + k, base: +m[3], ph, text: shown, c0, c1 });
      step += +m[4];
    }
    const last = notes[notes.length - 1];
    return { voice: L.voice || 'lead', bar: L.bar, text: text.trim(), notes, t0: notes[0].t, t1: last.t + last.d };
  }

  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  function diatonic(m, steps) {
    const pc = ((m % 12) + 12) % 12;
    let idx = SCALE.indexOf(pc);
    if (idx < 0) return m - 3;
    const i = idx + steps;
    const oct = Math.floor(m / 12) + Math.floor(i / 7);
    return oct * 12 + SCALE[((i % 7) + 7) % 7];
  }

  // ---------------------------------------------------------------- arrangement
  function build() {
    const E = {
      kick: [], snare: [], clap: [], hat: [], ohat: [], crash: [],
      bass: [], pad: [], arp: [], chip: [], lead: [], bell: [], fx: [], phrases: [], meows: []
    };
    const R = rng(20261109);
    const isChorus = n => n === 'chorus1' || n === 'chorus2' || n === 'final';

    for (let bar = 0; bar < BARS; bar++) {
      const sec = sectionAt(bar), name = sec.name, lb = bar - sec.bar, ch = chordAt(bar);
      const at = s => T(bar, s);
      const K = (s, v = 1) => E.kick.push({ t: at(s), v });
      const SN = (s, v = 1) => E.snare.push({ t: at(s), v });
      const CL = (s, v = 1) => E.clap.push({ t: at(s), v });
      const HH = (s, v = 1) => E.hat.push({ t: at(s), v });
      const OH = (s, v = 1) => E.ohat.push({ t: at(s), v });
      const CR = (s, v = 1) => E.crash.push({ t: at(s), v });

      // drums
      if (name === 'intro') {
        if (bar >= 4) { K(0, 0.55); K(8, 0.5); }
        if (bar >= 6) for (let s = 0; s < 16; s += 2) HH(s, s % 4 ? 0.16 : 0.26);
        if (bar === 7) for (let s = 8; s < 16; s++) SN(s, 0.15 + (s - 8) * 0.085);
      } else if (name === 'verse1' || name === 'verse2') {
        K(0); K(8); K(10, 0.8);
        SN(4, 0.9); SN(12, 0.9);
        if (name === 'verse1') for (let s = 0; s < 16; s += 2) HH(s, s % 4 ? 0.28 : 0.42);
        else for (let s = 0; s < 16; s++) HH(s, s % 4 === 0 ? 0.42 : s % 2 ? 0.18 : 0.3);
        OH(14, 0.32);
        if (lb === 0) CR(0, 0.7);
        if (lb === 7) { SN(13, 0.5); SN(14, 0.7); SN(15, 0.9); }
      } else if (name === 'pre') {
        K(0); K(4); K(8); K(12);
        if (lb < 3) { SN(4); SN(12); } else for (let s = 0; s < 16; s++) SN(s, 0.3 + s * 0.045);
        for (let s = 0; s < 16; s++) HH(s, s % 2 ? 0.18 : 0.32);
      } else if (isChorus(name)) {
        K(0); K(4); K(8); K(12);
        SN(4); SN(12); CL(4, 0.8); CL(12, 0.8);
        for (let s = 0; s < 16; s++) { if (s % 4 === 2) OH(s, 0.38); else HH(s, s % 2 ? 0.16 : 0.28); }
        if (lb % (name === 'final' ? 2 : 4) === 0) CR(0, 0.8);
        if (lb === 7 && name === 'chorus1') { SN(14, 0.6); SN(15, 0.8); }
      } else if (name === 'inter') {
        K(0); K(4); K(8); K(12); CL(4, 0.9); CL(12, 0.9);
        for (let s = 0; s < 16; s++) { if (s % 4 === 2) OH(s, 0.28); else HH(s, 0.18); }
        if (lb === 0) CR(0, 0.7);
        if (lb === 3) { SN(12, 0.5); SN(13, 0.6); SN(14, 0.75); SN(15, 0.9); }
      } else if (name === 'bridge') {
        if (lb === 2 || lb === 3) { K(0, 0.8); SN(8, 0.85); }
        if (lb >= 4 && lb <= 6) { K(0); K(10, 0.7); SN(8); for (let s = 0; s < 16; s += 2) HH(s, 0.22); }
        if (lb === 7) { K(0); for (let s = 0; s < 12; s++) SN(s, 0.3 + s * 0.06); }
      } else if (name === 'outro') {
        if (lb < 4) {
          K(0, 0.8); K(10, 0.6); SN(8, 0.7);
          for (let s = 0; s < 16; s += 2) HH(s, 0.2);
          if (lb === 0) CR(0, 0.7);
        }
      }

      // bass
      const B = (s, d, n, v, cut) => E.bass.push({ t: at(s), d: d * STEP, n, v, cut });
      const r = ch.root + 12;
      if (name === 'intro') { if (bar >= 4) B(0, 15.5, r, 0.5, 260); }
      else if (name === 'verse1' || name === 'verse2') {
        const pat = [0, 0, 12, 0, 0, 0, 12, 0];
        for (let e = 0; e < 8; e++) B(e * 2, 1.6, r + pat[e], e === 0 ? 1 : 0.8, 380);
      } else if (name === 'pre') {
        for (let e = 0; e < 8; e++) B(e * 2, 1.6, r, 0.85, 350 + lb * 160 + e * 25);
      } else if (isChorus(name) || name === 'inter') {
        for (let e = 0; e < 8; e++) B(e * 2, 1.6, r + (e % 2 ? 12 : 0), e % 2 ? 0.75 : 1, 520);
      } else if (name === 'bridge') {
        if (lb < 4) B(0, 15.5, r, 0.8, 240);
        else if (lb < 7) { B(0, 7.5, r, 0.85, 300); B(8, 7.5, r, 0.75, 300); }
        else for (let e = 0; e < 6; e++) B(e * 2, 1.6, r, 0.7 + e * 0.05, 400 + e * 120);
      } else if (name === 'outro') {
        if (lb < 4) for (let e = 0; e < 4; e++) B(e * 4, 3.5, r, 0.75, 300);
        else B(0, 15.5, r, Math.max(0.25, 0.7 - (lb - 4) * 0.13), 220);
      }

      // pads
      const padVel = { intro: 0.7, verse1: 0.5, pre: 0.65, chorus1: 0.55, inter: 0.55, verse2: 0.5, chorus2: 0.55, bridge: 0.55, final: 0.6, outro: 0.7 }[name];
      const padCut = { intro: 900, verse1: 1300, pre: 1700, chorus1: 2300, inter: 2000, verse2: 1300, chorus2: 2300, bridge: 1100, final: 2700, outro: 1200 }[name];
      const notes = (isChorus(name) || name === 'bridge') ? [...ch.tones, ch.ext] : ch.tones.slice();
      const prev = E.pad[E.pad.length - 1];
      if (prev && name === 'intro' && prev.name === ch.name && prev.sec === name) prev.d += BAR;
      else E.pad.push({ t: at(0), d: BAR, notes, v: padVel, cut: padCut, name: ch.name, sec: name });

      // chip arpeggio (16ths)
      const arpVel = { intro: bar >= 2 ? 0.3 + (bar - 2) * 0.06 : 0, verse1: 0.32, pre: 0.45, inter: 0.5, verse2: 0.42, bridge: lb >= 4 && lb < 7 ? 0.36 : 0, final: 0.32, outro: lb < 6 ? 0.45 - lb * 0.05 : 0 }[name] || 0;
      if (arpVel > 0) {
        const tones = [...ch.tones, ch.ext].sort((a, b) => a - b);
        const ext = [...tones.map(n => n + 12), tones[0] + 24, tones[1] + 24];
        const pat = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 5, 4, 2, 1, 2];
        for (let s = 0; s < 16; s++) E.arp.push({ t: at(s), d: STEP * 0.9, n: ext[pat[s]], v: arpVel * (s % 4 === 0 ? 1 : 0.72), pan: s % 2 ? 0.35 : -0.35 });
      }

      // tracker-style chord stabs in the choruses
      if (isChorus(name)) {
        for (const [s, d] of [[0, 2], [3, 2], [6, 3], [10, 1.5], [12, 3]]) E.chip.push({ t: at(s), d: d * STEP, notes: ch.tones.map(n => n + 12), v: 0.5 });
      }

      // bells: sparkles in the pre-chorus and the outro
      if (name === 'pre') for (const s of [0, 3, 6, 10, 12]) {
        const tones = [...ch.tones, ch.ext];
        E.bell.push({ t: at(s), n: tones[Math.floor(R() * tones.length)] + 24, v: 0.32 + R() * 0.2, pan: R() * 1.2 - 0.6 });
      }
      if (name === 'outro' && lb >= 4) for (const s of [0, 8]) {
        E.bell.push({ t: at(s), n: ch.tones[(lb + s / 8) % 3] + 24, v: 0.3, pan: s ? 0.4 : -0.4 });
      }
    }

    // ---------------- lead synth: the hook in the interlude, an echo of it in the outro
    const hook = [[0, 69, 2], [2, 69, 2], [4, 72, 8], [16, 71, 2], [18, 69, 2], [20, 67, 2], [22, 69, 2], [24, 67, 8]];
    const hook2 = [[0, 67, 2], [2, 67, 2], [4, 69, 2], [6, 67, 2], [8, 64, 2], [10, 62, 2], [12, 64, 14]];
    const leadPhrase = (bar, list, k, v) => E.lead.push({ v, notes: list.map(([s, n, d]) => ({ t: T(bar, s), d: d * STEP * 0.92, n: n + 12 + k })) });
    leadPhrase(28, hook, 0, 0.55);
    leadPhrase(30, hook2, 0, 0.5);
    leadPhrase(64, hook, 2, 0.4);
    leadPhrase(66, hook2, 2, 0.35);

    // ---------------- vocals
    const lines = LINES.map(parseLine);
    for (const L of lines) {
      E.phrases.push({ voice: L.voice, notes: L.notes, line: L });
      const b = L.bar;
      const chorusLine = (b >= 20 && b < 28) || (b >= 40 && b < 48) || (b >= 56 && b < 64);
      if (chorusLine) {
        E.phrases.push({ voice: 'double', pan: -0.55, detune: 0.09, delay: 0.014, notes: L.notes });
        E.phrases.push({ voice: 'double', pan: 0.55, detune: -0.08, delay: 0.022, notes: L.notes });
      }
      if ((b >= 40 && b < 48) || (b >= 56 && b < 64)) {
        E.phrases.push({ voice: 'harm', pan: 0.3, notes: L.notes.map(n => Object.assign({}, n, { midi: diatonic(n.base, -2) + keyAt(b) })) });
      }
    }
    // meows
    const meow = (bar, step, midi, d, v, pan) => {
      const t = T(bar, step);
      E.phrases.push({ voice: 'meow', pan, gain: v, notes: [{ t, d: d * STEP, midi: midi + keyAt(bar), ph: 'MEOW' }] });
      E.meows.push({ t, d: d * STEP, v, pan });
    };
    meow(2, 8, 72, 6, 0.45, 0.3);
    for (const b of [20, 24, 40, 44, 56, 60]) meow(b, 12, 76, 4, 0.75, (b / 4) % 2 ? 0.45 : -0.45);
    [[30, 0, 67, 4], [30, 4, 71, 4], [30, 8, 74, 4], [30, 12, 76, 4], [31, 0, 72, 6], [31, 6, 69, 10]]
      .forEach(([b, s, m, d], i) => meow(b, s, m, d, 0.85, i % 2 ? 0.25 : -0.25));
    meow(71, 0, 76, 8, 0.5, 0);

    // digital choir: "ooh" in the bridge and outro, "aah" in the final chorus
    const choir = (b0, b1, vowel, v) => {
      for (let i = 0; i < 3; i++) {
        const notes = [];
        for (let bar = b0; bar < b1; bar++) notes.push({ t: T(bar), d: BAR, midi: chordAt(bar).tones[i], ph: vowel });
        E.phrases.push({ voice: 'choir', idx: i, pan: [-0.6, 0, 0.6][i], gain: v, notes });
      }
    };
    choir(52, 56, 'UW', 0.55);
    choir(56, 64, 'AA', 0.5);
    choir(64, 68, 'UW', 0.5);

    // ---------------- effects
    const fx = (type, b0, b1, o) => E.fx.push(Object.assign({ type, t: T(b0), d: T(b1) - T(b0) }, o));
    fx('wind', 0, 9, { v: 1, fadeIn: 2, fadeOut: 2.5 });
    fx('wind', 8, 16, { v: 0.35, fadeIn: 1, fadeOut: 2 });
    fx('wind', 32, 37, { v: 0.6, fadeIn: 1.5, fadeOut: 2 });
    fx('wind', 64, 74, { v: 0.9, fadeIn: 3, fadeOut: 4 });
    {
      const MORSE = { M: '--', E: '.', O: '---', W: '.--' }, dit = STEP / 2, gates = [];
      let t = T(0, 4);
      for (const ch of 'MEOW') {
        for (const sym of MORSE[ch]) { const len = sym === '-' ? 3 : 1; gates.push([t, t + len * dit]); t += (len + 1) * dit; }
        t += 2 * dit;
      }
      E.fx.push({ type: 'morse', t: T(0, 4), d: t - T(0, 4) + 0.3, gates });
      E.morse = gates;
    }
    fx('riser', 6, 8, { v: 0.9 });
    fx('riser', 18, 20, { v: 1 });
    fx('riser', 39, 40, { v: 0.8 });
    fx('riser', 54, 55.75, { v: 1 });
    for (const b of [20, 28, 40, 56]) fx('revcym', b - 1, b, { v: 1 });
    fx('impact', 8, 10, { v: 0.5 });
    fx('impact', 20, 22, { v: 1 });
    fx('impact', 40, 42, { v: 1 });
    fx('impact', 56, 58, { v: 1.2 });
    fx('impact', 64, 66, { v: 0.6 });
    fx('purr', 32, 36, { v: 0.55 });
    fx('purr', 66, 74, { v: 0.9 });

    for (const k of Object.keys(E)) if (Array.isArray(E[k]) && E[k].length && E[k][0].t !== undefined) E[k].sort((a, b) => a.t - b.t);
    E.lines = lines;
    return E;
  }

  const events = build();

  Object.assign(CM, {
    rng,
    song: {
      SR, BPM, BEAT, STEP, BAR, BARS, MUSIC_END, DURATION, T,
      SECTIONS, sectionAt, chordAt, keyAt, PROG,
      events, lines: events.lines
    }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = CM;
})(typeof globalThis !== 'undefined' ? globalThis : window);
