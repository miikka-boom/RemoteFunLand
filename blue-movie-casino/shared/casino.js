/* Blue Movie Casino: shared core for the lobby and every game. Plain script, no build step.
   Load it at the end of <body> with <script src="../shared/casino.js"></script>; it defines window.Casino.

   Casino.init({ id, title, minBet, back, backLabel })  builds the sticky top bar: back link, title, balance, mute.
   Casino.wallet   .balance  .canAfford(n)  .bet(n) -> true/false  .win(n)  .onChange(fn(balance, delta, reason))
                   Chips are whole numbers kept in localStorage and shared by every game. win() floors.
   Casino.record({ bet, win })  adds one finished round to this game's box-office stats (the lobby shows them).
   Casino.sfx      synthesized Web Audio, silent until the first tap or key press:
                   click tap chip(p) chips(n) coin(p) tick(p) pop(p) boing(p) whoosh(dur) thud(p) card flip buzz
                   win(level) bigwin(level) lose explode heartbeat spark chime(step) kiss cash riser(dur)
                   .tone({...}) .noise({...}) for custom one-shots; .ctx() and .out for custom loops (out follows mute).
   Casino.fx       .burst(at, { type, count, speed, angle, spread, colors, size, gravity })
                   .shower(type, count)  .fountain(at, { type, rate, ms, ... }) -> stop()
                   .collect(from, to?, { count, type }) -> Promise  (coins fly into the balance pill)
                   .shake(px, ms, el?)  .flash(color, ms, opacity)  .floatText(at, text, { color, size, ms, rise })
                   .countUp(el, from, to, { ms, format, sound }) -> Promise with .skip()
                   .anim(el, 'c-pop' | 'c-jelly' | 'c-wobble' | 'c-slam')  .vibrate(pattern)  .reducedMotion
                   Particle types: coin chip heart kiss confetti spark star feather bill smoke
   Casino.bigWin(amount, bet, { label, level })  tiered celebration overlay, resolves when it closes.
                   Casino.winTier(amount, bet) is 0 below 10x, then 1 (10x) 2 (25x) 3 (50x) 4 (100x).
   Casino.rng      crypto-backed .float() .int(n) .range(a, b) .chance(p) .pick(arr) .shuffle(arr) .weighted([[v, w]])
   Casino.toast(text, 'good' | 'bad')  Casino.dialog({ title, html, button })  Casino.fmt(n)  Casino.sleep(ms)

   An "at" is an element (its centre is used), a pointer event, or a { x, y } point in viewport pixels.
   fx.shake moves the element marked [data-shake] (or <main>), never <body>, so fixed layers stay put. */
(() => {
  'use strict';

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: carry on in memory */ }
    },
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Randomness ---------- */
  const words = new Uint32Array(2);
  const rng = {
    float() {
      crypto.getRandomValues(words);
      return (words[0] * 2097152 + (words[1] >>> 11)) / 9007199254740992;
    },
    int(n) { return Math.floor(rng.float() * n); },
    range(a, b) { return a + rng.float() * (b - a); },
    chance(p) { return rng.float() < p; },
    pick(arr) { return arr[rng.int(arr.length)]; },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    weighted(pairs) {
      let total = 0;
      for (const [, w] of pairs) total += w;
      let r = rng.float() * total;
      for (const [value, w] of pairs) if ((r -= w) < 0) return value;
      return pairs[pairs.length - 1][0];
    },
  };

  /* ---------- Wallet ---------- */
  const WALLET_KEY = 'bmc.wallet.v1';
  const START = 1000;
  const BAILOUT = 500;
  const clean = (n) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : START);
  let balance = clean(store.get(WALLET_KEY, START));
  const walletListeners = new Set();
  const emit = (delta, reason) => {
    for (const fn of walletListeners) {
      try { fn(balance, delta, reason); } catch (err) { console.error(err); }
    }
  };
  const save = () => store.set(WALLET_KEY, balance);
  const wallet = {
    START,
    BAILOUT,
    get balance() { return balance; },
    canAfford(n) { return n > 0 && n <= balance; },
    bet(n) {
      n = Math.round(n);
      if (!(n > 0) || n > balance) return false;
      balance -= n;
      save();
      emit(-n, 'bet');
      return true;
    },
    win(n, reason = 'win') {
      n = Math.floor(n);
      if (!(n > 0)) return 0;
      balance += n;
      save();
      emit(n, reason);
      return n;
    },
    set(n) {
      const d = clean(n) - balance;
      balance = clean(n);
      save();
      emit(d, 'set');
    },
    onChange(fn) {
      walletListeners.add(fn);
      return () => walletListeners.delete(fn);
    },
  };
  addEventListener('storage', (e) => {
    if (e.key !== WALLET_KEY) return;
    const next = clean(store.get(WALLET_KEY, START));
    if (next === balance) return;
    const d = next - balance;
    balance = next;
    emit(d, 'sync');
  });

  /* ---------- Box-office stats ---------- */
  const STATS_KEY = 'bmc.stats.v1';
  let gameId = null;
  function record({ bet = 0, win = 0 } = {}) {
    if (!gameId) return;
    const all = store.get(STATS_KEY, {}) || {};
    const s = all[gameId] && typeof all[gameId] === 'object' ? all[gameId] : { plays: 0, wagered: 0, won: 0, best: 0 };
    s.plays += 1;
    s.wagered += Math.max(0, Math.round(bet));
    s.won += Math.max(0, Math.round(win));
    s.best = Math.max(s.best || 0, Math.round(win));
    all[gameId] = s;
    store.set(STATS_KEY, all);
  }
  const stats = () => store.get(STATS_KEY, {}) || {};

  /* ---------- Sound ---------- */
  const sfx = (() => {
    let ctx = null;
    let master = null;
    let noiseBuf = null;
    let muted = !!store.get('bmc.muted', false);
    const muteListeners = new Set();
    const LEVEL = 0.85;

    function context() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 10;
        comp.ratio.value = 5;
        comp.attack.value = 0.002;
        comp.release.value = 0.2;
        master = ctx.createGain();
        master.gain.value = muted ? 0 : LEVEL;
        master.connect(comp).connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    // Audio only ever starts inside a real tap, click or key press.
    for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, context, { capture: true, passive: true });

    const running = () => (ctx && ctx.state === 'running' ? ctx : null);
    const live = () => (muted ? null : running());

    function tone({ freq = 440, to, type = 'sine', dur = 0.15, vol = 0.25, attack = 0.004, delay = 0, detune = 0, filter, dest } = {}) {
      const c = live();
      if (!c) return null;
      const t = c.currentTime + delay;
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.detune.value = detune;
      if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(attack, dur * 0.95));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      let tail = g;
      if (filter) {
        const f = c.createBiquadFilter();
        f.type = filter.type || 'lowpass';
        f.frequency.setValueAtTime(filter.freq || 2000, t);
        if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, t + dur);
        f.Q.value = filter.q ?? 0.8;
        g.connect(f);
        tail = f;
      }
      tail.connect(dest || master);
      o.start(t);
      o.stop(t + dur + 0.05);
      return o;
    }

    function noise({ dur = 0.2, vol = 0.2, type = 'bandpass', freq = 1800, to, q = 1, attack = 0.003, delay = 0, dest } = {}) {
      const c = live();
      if (!c) return null;
      const t = c.currentTime + delay;
      const s = c.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(attack, dur * 0.95));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(dest || master);
      s.start(t, Math.random() * 1.5);
      s.stop(t + dur + 0.05);
      return s;
    }

    const C5 = 523.25;
    const semi = (n) => C5 * 2 ** (n / 12);
    const PENTA = [0, 2, 4, 7, 9];

    const named = {
      click() { tone({ freq: 1500, to: 900, type: 'square', dur: 0.035, vol: 0.06 }); },
      tap() { tone({ freq: 720, to: 480, type: 'triangle', dur: 0.06, vol: 0.12 }); },
      chip(p = 1, delay = 0) {
        tone({ freq: 3300 * p, dur: 0.06, vol: 0.11, delay });
        tone({ freq: 5050 * p, dur: 0.04, vol: 0.05, delay: delay + 0.004 });
        noise({ type: 'bandpass', freq: 6200, q: 2, dur: 0.03, vol: 0.12, delay });
      },
      chips(n = 4) {
        let d = 0;
        for (let i = 0; i < n; i++) {
          named.chip(0.9 + Math.random() * 0.25, d);
          d += 0.03 + Math.random() * 0.035;
        }
      },
      coin(p = 1, delay = 0) {
        tone({ freq: 1976 * p, dur: 0.26, vol: 0.12, delay });
        tone({ freq: 2637 * p, dur: 0.34, vol: 0.09, delay: delay + 0.045 });
      },
      tick(p = 1) { tone({ freq: 1000 * p, type: 'triangle', dur: 0.03, vol: 0.05 }); },
      pop(p = 1) { tone({ freq: 380 * p, to: 1150 * p, dur: 0.075, vol: 0.2 }); },
      boing(p = 1) {
        const c = live();
        if (!c) return;
        const t = c.currentTime;
        const o = c.createOscillator();
        o.frequency.setValueAtTime(150 * p, t);
        o.frequency.exponentialRampToValueAtTime(430 * p, t + 0.05);
        o.frequency.exponentialRampToValueAtTime(250 * p, t + 0.38);
        const lfo = c.createOscillator();
        lfo.frequency.value = 21;
        const depth = c.createGain();
        depth.gain.setValueAtTime(70 * p, t);
        depth.gain.exponentialRampToValueAtTime(1, t + 0.38);
        lfo.connect(depth).connect(o.frequency);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g).connect(master);
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.45);
        lfo.stop(t + 0.45);
      },
      whoosh(dur = 0.35, vol = 0.16) { noise({ type: 'bandpass', freq: 300, to: 2800, q: 0.8, dur, vol, attack: dur * 0.6 }); },
      thud(p = 1) {
        tone({ freq: 140 * p, to: 45 * p, dur: 0.22, vol: 0.45 });
        noise({ type: 'lowpass', freq: 700, dur: 0.06, vol: 0.18 });
      },
      card() {
        noise({ type: 'highpass', freq: 2600, dur: 0.045, vol: 0.2 });
        tone({ freq: 230, to: 140, type: 'triangle', dur: 0.04, vol: 0.07 });
      },
      flip() { noise({ type: 'bandpass', freq: 1200, to: 4200, q: 1.2, dur: 0.08, vol: 0.18 }); },
      buzz() {
        tone({ freq: 110, type: 'square', dur: 0.22, vol: 0.07, filter: { type: 'lowpass', freq: 900 } });
        tone({ freq: 117, type: 'square', dur: 0.22, vol: 0.06, filter: { type: 'lowpass', freq: 900 } });
      },
      win(level = 1) {
        const seq = level > 1 ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
        seq.forEach((n, i) => {
          tone({ freq: semi(n), type: 'triangle', dur: 0.22, vol: 0.14, delay: i * 0.07 });
          tone({ freq: semi(n + 12), dur: 0.16, vol: 0.04, delay: i * 0.07 + 0.01 });
        });
      },
      bigwin(level = 1) {
        const chords = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19, 24]];
        const step = 0.16;
        chords.forEach((ch, i) => {
          const last = i === chords.length - 1;
          for (const n of ch) {
            tone({ freq: semi(n - 12), type: 'sawtooth', dur: last ? 1.3 : 0.15, vol: 0.06, delay: i * step, filter: { type: 'lowpass', freq: 2400 } });
            tone({ freq: semi(n), type: 'triangle', dur: last ? 1.1 : 0.14, vol: 0.07, delay: i * step });
          }
        });
        noise({ type: 'highpass', freq: 6000, dur: 1.2, vol: 0.05, delay: chords.length * step - step, attack: 0.02 });
        for (let i = 0; i < 6 + level * 3; i++) named.coin(1 + (i % 5) * 0.12, 0.62 + i * 0.07);
      },
      lose() {
        const notes = [392, 370, 349, 330];
        notes.forEach((f, i) => {
          const last = i === notes.length - 1;
          tone({ freq: f / 2, to: last ? f / 2 * 0.94 : undefined, type: 'sawtooth', dur: last ? 0.7 : 0.24, vol: 0.09, delay: i * 0.26, filter: { type: 'lowpass', freq: 1100 } });
        });
      },
      explode() {
        noise({ type: 'lowpass', freq: 4200, to: 70, dur: 1.1, vol: 0.6, attack: 0.004 });
        tone({ freq: 95, to: 28, dur: 0.85, vol: 0.55 });
      },
      heartbeat() {
        tone({ freq: 72, to: 40, dur: 0.14, vol: 0.45 });
        tone({ freq: 64, to: 38, dur: 0.16, vol: 0.32, delay: 0.17 });
      },
      spark() { noise({ type: 'highpass', freq: 5200, dur: 0.05, vol: 0.1 }); },
      chime(step = 0) {
        const n = PENTA[step % 5] + 12 * Math.floor(step / 5);
        tone({ freq: semi(n), type: 'triangle', dur: 0.36, vol: 0.13 });
        tone({ freq: semi(n + 12), dur: 0.24, vol: 0.045, delay: 0.012 });
      },
      kiss() {
        noise({ type: 'bandpass', freq: 1900, q: 3, dur: 0.055, vol: 0.24 });
        tone({ freq: 850, to: 1500, dur: 0.09, vol: 0.1, delay: 0.025 });
      },
      cash() {
        noise({ type: 'bandpass', freq: 3200, q: 4, dur: 0.1, vol: 0.12 });
        tone({ freq: 2093, dur: 0.5, vol: 0.1, delay: 0.06 });
        tone({ freq: 2637, dur: 0.6, vol: 0.08, delay: 0.09 });
        tone({ freq: 3136, dur: 0.7, vol: 0.06, delay: 0.12 });
      },
      riser(dur = 1) {
        tone({ freq: 180, to: 1500, type: 'sawtooth', dur, vol: 0.05, attack: dur * 0.9, filter: { type: 'lowpass', freq: 700, to: 5200 } });
        noise({ type: 'bandpass', freq: 400, to: 5200, dur, vol: 0.09, attack: dur * 0.9 });
      },
    };

    return {
      ...named,
      tone,
      noise,
      play(name, ...args) { if (named[name]) named[name](...args); },
      context,
      ctx: running,
      get out() { return master; },
      get audible() { return !!live(); },
      get muted() { return muted; },
      setMuted(m) {
        muted = !!m;
        store.set('bmc.muted', muted);
        if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.02);
        for (const fn of muteListeners) fn(muted);
      },
      toggleMute() { this.setMuted(!muted); },
      onMute(fn) {
        muteListeners.add(fn);
        return () => muteListeners.delete(fn);
      },
    };
  })();

  /* ---------- Juice ---------- */
  const fx = (() => {
    let canvas = null;
    let g = null;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    const parts = [];
    const emitters = new Set();
    const MAX = 800;
    const TAU = Math.PI * 2;
    const R = (v) => (Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v);
    const ALIAS = { coins: 'coin', chips: 'chip', hearts: 'heart', kisses: 'kiss', sparks: 'spark', stars: 'star', feathers: 'feather', bills: 'bill' };
    const PARTY = ['#ff3d9a', '#ffcf4a', '#3ef0ff', '#4dffb0', '#b06bff', '#ffffff'];

    const TYPES = {
      coin: { size: [9, 15], speed: [380, 900], gravity: 1500, drag: 0.5, life: [1.4, 2.2], spin: [6, 14] },
      chip: { size: [9, 13], speed: [350, 820], gravity: 1500, drag: 0.5, life: [1.4, 2.2], spin: [5, 12], colors: ['#e8334a', '#2f7bff', '#1fae5b', '#1c1c24', '#7b3cff', '#ff8a1f'] },
      heart: { size: [7, 13], speed: [200, 560], gravity: 380, drag: 1.4, life: [1.0, 1.8], spin: [3, 6], colors: ['#ff3d9a', '#ff2e63', '#ff8fc7', '#ffd1e8'] },
      kiss: { size: [9, 14], speed: [200, 520], gravity: 380, drag: 1.4, life: [1.0, 1.8], spin: [3, 6], colors: ['#ff2e63', '#e0004d', '#ff5c8a'] },
      confetti: { size: [6, 11], speed: [300, 900], gravity: 700, drag: 2.2, life: [1.6, 2.8], spin: [5, 12], colors: PARTY },
      spark: { size: [2, 4], speed: [400, 1100], gravity: 600, drag: 2.5, life: [0.35, 0.8], colors: ['#fff6c8', '#ffcf4a', '#ff9a3c'] },
      star: { size: [5, 10], speed: [120, 500], gravity: 200, drag: 2, life: [0.6, 1.2], spin: [4, 9], colors: ['#ffffff', '#fff6c8', '#ffcf4a'] },
      feather: { size: [12, 20], speed: [150, 420], gravity: 140, drag: 2.6, life: [2.2, 3.6], sway: 90, spin: [1.5, 3], colors: ['#ff3d9a', '#ff8fc7', '#ffffff', '#ffcf4a'] },
      bill: { size: [12, 17], speed: [250, 700], gravity: 420, drag: 2.0, life: [2.0, 3.2], sway: 60, spin: [4, 9], colors: ['#5fbf6a'] },
      smoke: { size: [14, 30], speed: [40, 160], gravity: -60, drag: 1.5, life: [0.8, 1.6], colors: ['rgba(255,255,255,.35)'] },
    };

    function circle(x, y, r) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    function heartPath(s) {
      g.beginPath();
      g.moveTo(0, s);
      g.bezierCurveTo(-s * 1.6, -s * 0.1, -s * 0.6, -s * 1.25, 0, -s * 0.45);
      g.bezierCurveTo(s * 0.6, -s * 1.25, s * 1.6, -s * 0.1, 0, s);
      g.closePath();
    }
    const DRAW = {
      coin(p) {
        const s = p.size;
        const c = Math.cos(p.phase);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot * 0.15);
        g.scale(Math.max(0.12, Math.abs(c)), 1);
        g.fillStyle = '#a86b00';
        circle(0, 0, s);
        g.fillStyle = c > 0 ? '#ffd54a' : '#f0b41a';
        circle(0, 0, s * 0.84);
        g.strokeStyle = 'rgba(160, 100, 0, .8)';
        g.lineWidth = s * 0.12;
        g.beginPath();
        g.arc(0, 0, s * 0.55, 0, TAU);
        g.stroke();
        g.fillStyle = 'rgba(255, 255, 255, .7)';
        g.beginPath();
        g.ellipse(-s * 0.32, -s * 0.36, s * 0.22, s * 0.12, -0.6, 0, TAU);
        g.fill();
        g.restore();
      },
      chip(p) {
        const s = p.size;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.max(0.2, Math.abs(Math.cos(p.phase))));
        g.fillStyle = p.color;
        circle(0, 0, s);
        g.fillStyle = '#fff';
        for (let i = 0; i < 6; i++) {
          g.rotate(TAU / 6);
          g.fillRect(-s * 0.14, -s, s * 0.28, s * 0.3);
        }
        g.strokeStyle = 'rgba(255, 255, 255, .85)';
        g.lineWidth = s * 0.08;
        g.beginPath();
        g.arc(0, 0, s * 0.6, 0, TAU);
        g.stroke();
        g.restore();
      },
      heart(p) {
        const s = p.size;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(Math.sin(p.phase) * 0.35);
        const pulse = 1 + 0.1 * Math.sin(p.phase * 2);
        g.scale(pulse, pulse);
        g.fillStyle = p.color;
        heartPath(s);
        g.fill();
        g.fillStyle = 'rgba(255, 255, 255, .55)';
        g.beginPath();
        g.ellipse(-s * 0.45, -s * 0.35, s * 0.2, s * 0.12, -0.7, 0, TAU);
        g.fill();
        g.restore();
      },
      kiss(p) {
        const s = p.size;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot * 0.2);
        g.fillStyle = p.color;
        g.beginPath();
        g.moveTo(-s, 0);
        g.bezierCurveTo(-s * 0.6, -s * 0.6, -s * 0.2, -s * 0.62, 0, -s * 0.3);
        g.bezierCurveTo(s * 0.2, -s * 0.62, s * 0.6, -s * 0.6, s, 0);
        g.bezierCurveTo(s * 0.55, s * 0.72, -s * 0.55, s * 0.72, -s, 0);
        g.fill();
        g.strokeStyle = 'rgba(70, 0, 20, .55)';
        g.lineWidth = s * 0.09;
        g.beginPath();
        g.moveTo(-s * 0.85, s * 0.02);
        g.quadraticCurveTo(0, s * 0.14, s * 0.85, s * 0.02);
        g.stroke();
        g.restore();
      },
      confetti(p) {
        const s = p.size;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.cos(p.phase));
        g.fillStyle = p.color;
        g.fillRect(-s / 2, -s / 4, s, s / 2);
        g.restore();
      },
      spark(p) {
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = p.color;
        g.lineWidth = p.size;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        g.stroke();
        g.globalCompositeOperation = 'source-over';
      },
      star(p) {
        const s = p.size * (0.55 + 0.45 * Math.abs(Math.sin(p.phase)));
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.translate(p.x, p.y);
        g.rotate(p.rot * 0.3);
        g.fillStyle = p.color;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? s * 0.28 : s;
          const a = (i / 8) * TAU;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.restore();
      },
      feather(p) {
        const s = p.size;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot * 0.2 + Math.sin(p.phase) * 0.7);
        g.fillStyle = p.color;
        g.beginPath();
        g.ellipse(0, 0, s, s * 0.3, 0, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(0, 0, 0, .25)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(-s * 1.15, 0);
        g.lineTo(s * 0.9, 0);
        g.stroke();
        g.restore();
      },
      bill(p) {
        const s = p.size;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot * 0.3);
        g.scale(1, Math.cos(p.phase));
        g.fillStyle = '#2f7a3a';
        g.fillRect(-s * 0.85, -s * 0.42, s * 1.7, s * 0.84);
        g.fillStyle = p.color;
        g.fillRect(-s * 0.75, -s * 0.33, s * 1.5, s * 0.66);
        g.fillStyle = '#2f7a3a';
        circle(0, 0, s * 0.22);
        g.restore();
      },
      smoke(p) {
        const s = p.size * (1 + p.age * 1.5);
        const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = grad;
        circle(p.x, p.y, s);
      },
      custom(p) { p.draw(g, p); },
    };

    function ensure() {
      if (canvas) return;
      canvas = document.createElement('canvas');
      canvas.className = 'cfx-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
      g = canvas.getContext('2d');
      resize();
      addEventListener('resize', resize);
    }
    function resize() {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = innerWidth;
      H = innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    function point(at) {
      if (!at) return { x: innerWidth / 2, y: innerHeight / 2 };
      if (at instanceof Element) {
        const r = at.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      if ('clientX' in at) return { x: at.clientX, y: at.clientY };
      return { x: at.x, y: at.y };
    }
    function spawn(type, x, y, o = {}) {
      if (parts.length >= MAX) return null;
      const T = TYPES[type] || TYPES.confetti;
      const angle = (o.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? TAU);
      const speed = R(o.speed ?? T.speed);
      const colors = o.colors || T.colors;
      const p = {
        type: o.draw ? 'custom' : DRAW[type] ? type : 'confetti',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: o.gravity ?? T.gravity,
        drag: o.drag ?? T.drag,
        size: R(o.size ?? T.size) * (o.scale ?? 1),
        life: R(o.life ?? T.life),
        age: 0,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 8,
        phase: Math.random() * TAU,
        vphase: R(T.spin ?? [3, 8]),
        sway: o.sway ?? T.sway ?? 0,
        alpha: o.alpha ?? 1,
        color: colors ? colors[(Math.random() * colors.length) | 0] : '#fff',
        draw: o.draw,
      };
      parts.push(p);
      return p;
    }
    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const e of emitters) e(dt);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        const gone = p.age >= p.life || (!p.path && (p.x < -150 || p.x > W + 150 || (p.y > H + 80 && p.vy > 0)));
        if (gone) {
          parts[i] = parts[parts.length - 1];
          parts.pop();
          if (p.onEnd) p.onEnd();
          continue;
        }
        p.phase += p.vphase * dt;
        let alpha = p.alpha;
        if (p.path) {
          const t = clamp((p.age - p.delay) / (p.life - p.delay), 0, 1);
          if (t <= 0) continue;
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          const P = p.path;
          const u = 1 - e;
          p.x = u * u * P.x0 + 2 * u * e * P.cx + e * e * P.x1;
          p.y = u * u * P.y0 + 2 * u * e * P.cy + e * e * P.y1;
        } else {
          const k = Math.exp(-p.drag * dt);
          p.vx *= k;
          p.vy = p.vy * k + p.gravity * dt;
          p.x += p.vx * dt + (p.sway ? Math.cos(p.phase) * p.sway * dt : 0);
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          const f = p.age / p.life;
          if (f > 0.7) alpha *= 1 - (f - 0.7) / 0.3;
        }
        g.globalAlpha = alpha;
        DRAW[p.type](p);
      }
      g.globalAlpha = 1;
      if (parts.length || emitters.size) {
        raf = requestAnimationFrame(step);
      } else {
        raf = 0;
        g.clearRect(0, 0, W, H);
      }
    }
    function kick() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    }
    const kind = (t) => ALIAS[t] || t || 'coin';
    const amount = (n) => (api.reducedMotion ? Math.ceil(n / 3) : n);

    function burst(at, o = {}) {
      ensure();
      const { x, y } = point(at);
      const type = kind(o.type);
      const n = amount(o.count ?? 24);
      const j = o.jitter ?? 0;
      for (let i = 0; i < n; i++) spawn(type, x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j, o);
      kick();
    }
    function shower(type = 'coin', count = 60, o = {}) {
      ensure();
      type = kind(type);
      const n = amount(count);
      for (let i = 0; i < n; i++) {
        spawn(type, Math.random() * W, -20 - Math.random() * H * 0.7, { angle: Math.PI / 2, spread: 0.6, speed: [60, 260], life: [2.4, 3.6], ...o });
      }
      kick();
    }
    function fountain(at, o = {}) {
      ensure();
      const type = kind(o.type);
      const rate = amount(o.rate ?? 60);
      const end = performance.now() + (o.ms ?? 1200);
      let acc = 0;
      const tick = (dt) => {
        if (performance.now() > end) {
          emitters.delete(tick);
          return;
        }
        const { x, y } = point(at);
        acc += rate * dt;
        while (acc >= 1) {
          acc -= 1;
          spawn(type, x + (Math.random() - 0.5) * (o.jitter ?? 20), y, { angle: -Math.PI / 2, spread: 0.8, ...o });
        }
      };
      emitters.add(tick);
      kick();
      return () => emitters.delete(tick);
    }
    function collect(from, to, o = {}) {
      ensure();
      const a = point(from);
      const b = point(to || document.querySelector('.cbar-bal'));
      const type = kind(o.type);
      const n = api.reducedMotion ? Math.min(4, o.count ?? 12) : o.count ?? 12;
      const dur = (o.ms ?? 620) / 1000;
      const target = to || document.querySelector('.cbar-bal');
      return new Promise((resolve) => {
        let left = n;
        const arrive = (i) => {
          sfx.coin(1 + i * 0.035);
          if (target instanceof Element) anim(target, 'c-pop');
          if (--left <= 0) resolve();
        };
        for (let i = 0; i < n; i++) {
          const sx = a.x + (Math.random() - 0.5) * (o.jitter ?? 60);
          const sy = a.y + (Math.random() - 0.5) * (o.jitter ?? 60);
          const p = spawn(type, sx, sy, o);
          if (!p) {
            arrive(i);
            continue;
          }
          const delay = i * (o.stagger ?? 0.045);
          p.path = {
            x0: sx,
            y0: sy,
            cx: (sx + b.x) / 2 + (Math.random() - 0.5) * 240,
            cy: Math.min(sy, b.y) - 60 - Math.random() * 140,
            x1: b.x,
            y1: b.y,
          };
          p.delay = delay;
          p.life = delay + dur;
          p.onEnd = () => arrive(i);
        }
        if (n <= 0) resolve();
        kick();
      });
    }
    function shake(px = 8, ms = 380, el) {
      if (api.reducedMotion) return;
      const target = el || document.querySelector('[data-shake]') || document.querySelector('main');
      if (!target) return;
      cancelAnimationFrame(target._cshake || 0);
      const t0 = performance.now();
      const f = (t) => {
        const k = 1 - (t - t0) / ms;
        if (k <= 0) {
          target.style.translate = '';
          target.style.rotate = '';
          return;
        }
        const a = px * k * k;
        target.style.translate = `${(Math.random() * 2 - 1) * a}px ${(Math.random() * 2 - 1) * a}px`;
        if (px > 10) target.style.rotate = `${(Math.random() * 2 - 1) * a * 0.04}deg`;
        target._cshake = requestAnimationFrame(f);
      };
      target._cshake = requestAnimationFrame(f);
    }
    function flash(color = '#ffffff', ms = 260, opacity = 0.7) {
      const d = document.createElement('div');
      d.className = 'cfx-flash';
      d.style.background = color;
      d.style.setProperty('--o', api.reducedMotion ? opacity * 0.35 : opacity);
      d.style.animationDuration = `${ms}ms`;
      document.body.appendChild(d);
      d.addEventListener('animationend', () => d.remove());
      setTimeout(() => d.remove(), ms + 200);
    }
    function floatText(at, text, o = {}) {
      const { x, y } = point(at);
      const d = document.createElement('div');
      d.className = `cfx-float ${o.cls || ''}`;
      d.textContent = text;
      d.style.left = `${x}px`;
      d.style.top = `${y}px`;
      d.style.color = o.color || 'var(--gold)';
      if (o.size) d.style.fontSize = `${o.size}px`;
      if (o.font) d.style.fontFamily = o.font;
      d.style.setProperty('--rise', `${-(o.rise ?? 80)}px`);
      const ms = o.ms ?? 1100;
      d.style.animationDuration = `${ms}ms`;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), ms + 50);
      return d;
    }
    function countUp(el, from, to, o = {}) {
      const format = o.format || fmt;
      const ms = o.ms ?? clamp(400 + Math.log10(Math.max(1, Math.abs(to - from))) * 350, 400, 2600);
      const sound = o.sound ?? true;
      let finish;
      const promise = new Promise((resolve) => {
        const t0 = performance.now();
        let lastTick = 0;
        let done = false;
        finish = () => {
          if (done) return;
          done = true;
          el.textContent = format(to);
          resolve();
        };
        const f = (t) => {
          if (done) return;
          const k = Math.min(1, (t - t0) / ms);
          const e = 1 - (1 - k) ** 3;
          el.textContent = format(from + (to - from) * e);
          if (sound && t - lastTick > 55 && k < 1) {
            lastTick = t;
            sfx.tick(1 + k * 1.2);
          }
          if (k < 1) requestAnimationFrame(f);
          else finish();
        };
        requestAnimationFrame(f);
      });
      promise.skip = () => finish();
      return promise;
    }
    function anim(el, cls = 'c-pop') {
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
    }
    function vibrate(pattern = 20) {
      try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* not supported */ }
    }
    function registerParticle(name, draw, defaults = {}) {
      DRAW[name] = (p) => draw(g, p);
      TYPES[name] = { size: [8, 12], speed: [200, 600], gravity: 600, drag: 1.5, life: [1, 2], ...defaults };
    }

    const api = {
      burst,
      shower,
      fountain,
      collect,
      shake,
      flash,
      floatText,
      countUp,
      anim,
      vibrate,
      registerParticle,
      point,
      reducedMotion: motionQuery.matches,
    };
    motionQuery.addEventListener?.('change', (e) => { api.reducedMotion = e.matches; });
    return api;
  })();

  /* ---------- Big win ---------- */
  const TIER_LABELS = ['NICE!', 'BIG WIN!', 'STEAMY WIN!', 'MONEY SHOT!', 'CLIMAX!!!'];
  function winTier(amount, bet) {
    const m = amount / Math.max(1, bet);
    return m >= 100 ? 4 : m >= 50 ? 3 : m >= 25 ? 2 : m >= 10 ? 1 : 0;
  }
  function bigWin(amount, bet, opts = {}) {
    const level = clamp(opts.level ?? Math.max(1, winTier(amount, bet)), 1, 4);
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'cbig';
      el.dataset.level = level;
      el.setAttribute('role', 'alert');
      el.innerHTML = '<div class="cbig-rays"></div><div class="cbig-inner"><div class="cbig-label"></div><div class="cbig-amt">0</div><div class="cbig-sub"></div></div>';
      el.querySelector('.cbig-label').textContent = opts.label || TIER_LABELS[level];
      const mult = bet > 0 ? amount / bet : 0;
      el.querySelector('.cbig-sub').textContent = `${mult ? `×${mult >= 10 ? Math.round(mult) : mult.toFixed(1)} your bet · ` : ''}tap to continue`;
      document.body.appendChild(el);
      const amtEl = el.querySelector('.cbig-amt');

      sfx.bigwin(level);
      fx.flash('#ffcf4a', 340, 0.55);
      fx.shake(6 + level * 4, 500 + level * 160);
      fx.vibrate([40, 40, 90]);
      const stopFountain = fx.fountain({ x: innerWidth / 2, y: innerHeight + 10 }, {
        type: 'coin', rate: 40 + level * 30, spread: 0.9, speed: [900, 1500], ms: 1100 + level * 700,
      });
      fx.shower(level >= 3 ? 'bill' : 'confetti', 30 + level * 15);

      let timer = 0;
      let counted = false;
      let closed = false;
      const count = fx.countUp(amtEl, 0, amount, { ms: 1100 + level * 600 });
      count.then(() => {
        counted = true;
        sfx.cash();
        fx.anim(amtEl, 'c-pop');
        fx.burst(amtEl, { type: 'star', count: 26 });
        timer = setTimeout(close, 1800);
      });
      function close() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        stopFountain();
        removeEventListener('keydown', onKey, true);
        el.classList.add('out');
        setTimeout(() => {
          el.remove();
          resolve();
        }, 340);
      }
      function advance() {
        if (!counted) count.skip();
        else close();
      }
      function onKey(e) {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          advance();
        }
      }
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        advance();
      });
      addEventListener('keydown', onKey, true);
    });
  }

  /* ---------- Toasts and dialogs ---------- */
  function toast(text, tone = '') {
    const d = document.createElement('div');
    d.className = `ctoast ${tone}`;
    d.setAttribute('role', 'status');
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2500);
    return d;
  }
  function dialog({ title = '', html = '', button = 'Got it' } = {}) {
    const d = document.createElement('dialog');
    d.className = 'cdialog';
    d.innerHTML = '<form method="dialog"><h2></h2><div class="cdialog-body"></div><button class="cbtn cbtn--sm" value="ok"></button></form>';
    d.querySelector('h2').textContent = title;
    d.querySelector('.cdialog-body').innerHTML = html;
    d.querySelector('button').textContent = button;
    document.body.appendChild(d);
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.showModal();
    return d;
  }

  /* ---------- Top bar ---------- */
  const ICON_BACK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>';

  function init(opts = {}) {
    const { id = null, title = '', minBet = 1, back = '../', backLabel = 'Lobby' } = opts;
    gameId = id;
    const bar = document.createElement('header');
    bar.className = 'cbar';
    bar.innerHTML = `<a class="cbar-back">${ICON_BACK}<span></span></a><div class="cbar-title"></div><button class="cbar-bail" type="button" hidden></button><div class="cbar-bal" title="Your chips"><i class="cbar-chip" aria-hidden="true"></i><b>0</b></div><button class="cbar-mute" type="button"></button>`;
    const backEl = bar.querySelector('.cbar-back');
    backEl.href = back;
    backEl.querySelector('span').textContent = backLabel;
    bar.querySelector('.cbar-title').textContent = title;
    const bail = bar.querySelector('.cbar-bail');
    bail.textContent = `Residuals +${fmt(BAILOUT)}`;
    bail.title = 'Out of chips? Your residuals check just cleared.';
    const balEl = bar.querySelector('.cbar-bal');
    const balNum = balEl.querySelector('b');
    const mute = bar.querySelector('.cbar-mute');
    document.body.prepend(bar);

    let shown = wallet.balance;
    let tween = 0;
    let settle = 0;
    balNum.textContent = fmt(shown);
    const checkBroke = (b) => {
      const broke = b < minBet;
      bar.classList.toggle('broke', broke);
      bail.hidden = !broke;
    };
    checkBroke(shown);
    wallet.onChange((target, delta) => {
      cancelAnimationFrame(tween);
      clearTimeout(settle);
      const from = shown;
      const t0 = performance.now();
      const ms = delta > 0 ? clamp(300 + Math.log10(delta + 1) * 220, 300, 1200) : 220;
      balEl.classList.toggle('up', delta > 0);
      balEl.classList.toggle('down', delta < 0);
      if (delta > 0) fx.anim(balEl, 'c-pop');
      const f = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        shown = Math.round(from + (target - from) * (1 - (1 - k) ** 3));
        balNum.textContent = fmt(shown);
        if (k < 1) tween = requestAnimationFrame(f);
        else settle = setTimeout(() => balEl.classList.remove('up', 'down'), 260);
      };
      tween = requestAnimationFrame(f);
      checkBroke(target);
    });
    bail.addEventListener('click', () => {
      wallet.win(BAILOUT, 'bailout');
      sfx.cash();
      fx.burst(bail, { type: 'bill', count: 22, speed: [250, 600] });
      fx.vibrate([20, 30, 20]);
      toast(`Your residuals check cleared: +${fmt(BAILOUT)} chips`, 'good');
    });
    const paintMute = (m) => {
      mute.innerHTML = m ? ICON_MUTE : ICON_SOUND;
      mute.setAttribute('aria-pressed', String(m));
      mute.setAttribute('aria-label', m ? 'Sound off' : 'Sound on');
      mute.title = m ? 'Sound off' : 'Sound on';
    };
    paintMute(sfx.muted);
    sfx.onMute(paintMute);
    mute.addEventListener('click', () => {
      sfx.toggleMute();
      if (!sfx.muted) sfx.chip();
    });
    return { bar, balance: balEl };
  }

  window.Casino = {
    init,
    wallet,
    record,
    stats,
    sfx,
    fx,
    bigWin,
    winTier,
    rng,
    toast,
    dialog,
    fmt,
    sleep,
    clamp,
    store,
  };
})();
