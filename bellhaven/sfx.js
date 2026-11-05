/* Bellhaven sound (BH.Sfx): every cue of SPEC 8.16, synthesized with Web Audio. No audio file is ever loaded.
 *
 * WHEN  The AudioContext is created inside unlock() and nowhere else. ui.js calls unlock() on the first pointerdown or
 *       keydown, and again on the pointerup and click that follow (touch browsers only grant audio there), at most four
 *       times: it is idempotent (create once, resume() while suspended). play() before unlock() does nothing.
 * MUTE  setMuted(bool) comes from the UI: state.ui.sound, saved with the game by Engine.act({ type: 'setSound' }) when
 *       the City sheet's SOUND or the Lab's toggle changes it (through the UI's api). sfx.js stores nothing itself.
 * GRAPH cues -> master (0 while muted) -> compressor -> speakers. At most 16 cues sound at once (more are dropped);
 *       ticks and collect plinks keep a short gap. While the page is hidden the context is suspended (no drone in a
 *       background tab) and it resumes when the page shows again. Loops end by themselves: the drone 60 s and the
 *       heartbeat loop 30 s after the last { on: true }, so a run screen that never says "off" cannot drone on.
 *
 * API   unlock() -> bool · setMuted(bool) · isMuted() · play(cue, opts) -> bool (false: not played) · stop() (ends the
 *       loops) · created() · state() -> { ctx, created, muted, voices, loops, played, last, error } · CUES (the names,
 *       for the Lab's sound tester) · renderOffline(cue, opts, seconds) -> Promise<AudioBuffer> | null (one cue in an
 *       OfflineAudioContext, through the same compressor: the browser checks measure it; it never touches the live
 *       context).
 * CUES  tick (a UI tick) · collect { step, res } (plinks rising along a pentatonic scale within a streak; bricks woody,
 *       cans metallic, sparks bright) · place (a thud and three hammer taps) · whirr (a soft crane whirr) · finish (a
 *       chime) · bell { times: 1 | 2 | 3, low } (partials 1, 2, 2.76 and 5.4, decay 2.5 s; 1: LET'S BEGIN, 2: a safe
 *       return, 3: a Tower level; low: once, an octave down, for a goodbye or an expired window) · on the run screen:
 *       drone { on } (a low drone), heartbeat (one lub-dub; { on: true } repeats it every 0.86 s until { on: false },
 *       for HP under 30 %), horde (the "HORDE!" sting: an arrow swoop, then a stab; { gate: true }: the gate
 *       crescendo, a rising cluster that pulses faster), fallBeat (two heartbeats, 1.5 s). Unknown cues are ignored.
 *       P1 "more sound" (13.1), played by ui.js: levelUp · nickname · revive · invite · expand (the fence slides
 *       out) · rubble (cleared) · spark (sparks earned) · deny (a tap on something disabled).
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).Sfx = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';
  const MAX_VOICES = 16, MASTER = 0.85;
  const PENTA = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02];   // C6 D6 E6 G6 A6 C7 D7 E7
  const BELL = [[1, 0.26, 1], [2, 0.15, 0.7], [2.76, 0.12, 0.55], [5.4, 0.06, 0.3]];  // partial, level, share of the decay
  let ac = null, K = null, master = null, muted = false, hiddenStop = false, played = 0, last = '', error = '';
  const voices = [];

  // ------------------------------------------------------------------ the graph (live, or offline for the checks)
  function ctorOf(offline) {
    /* global AudioContext, webkitAudioContext, OfflineAudioContext, webkitOfflineAudioContext */
    if (offline) return typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : typeof webkitOfflineAudioContext !== 'undefined' ? webkitOfflineAudioContext : null;
    return typeof AudioContext !== 'undefined' ? AudioContext : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
  }
  function chain(ctx) {                                       // master gain -> compressor -> speakers
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    const m = ctx.createGain(); m.gain.value = MASTER;
    m.connect(comp); comp.connect(ctx.destination);
    return m;
  }
  function noiseBuffer(ctx) {                                 // 1 s of white noise from a fixed xorshift (no Math.random)
    const n = Math.floor(ctx.sampleRate), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let x = 0x2545f491;
    for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; d[i] = (x >>> 0) / 2147483648 - 1; }
    return b;
  }
  // A kit is a context, an output and a noise buffer; every cue draws with one, so the same code renders offline.
  function kit(ctx, out, live) { return { ac: ctx, out, live, noise: noiseBuffer(ctx), noff: 0, loops: {}, gap: {} }; }
  function create() {
    const C = ctorOf(false); if (!C) return false;
    try { ac = new C({ latencyHint: 'interactive' }); } catch (e) { ac = null; error = 'create: ' + ((e && e.message) || e); return false; }
    master = chain(ac); master.gain.value = muted ? 0 : MASTER;
    K = kit(ac, master, true);
    try { const b = ac.createBuffer(1, 1, ac.sampleRate), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch (e) { /* the iOS unlock is best effort */ }
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', onVisibility);
    return true;
  }
  const quiet = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); };
  function onVisibility() {
    if (!ac) return;
    if (document.hidden) { if (ac.state === 'running') { hiddenStop = true; quiet(ac.suspend()); } }
    else if (hiddenStop) { hiddenStop = false; quiet(ac.resume()); }
  }

  // ------------------------------------------------------------------ building blocks
  // env: a gain from silence to peak in a seconds, then an exponential fall to silence over d seconds
  function env(k, t, a, peak, d, dest) {
    const g = k.ac.createGain(), at = t + Math.max(0.001, a);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.01, d));
    g.connect(dest || k.out);
    return g;
  }
  function filt(k, type, f, t, q) { const fl = k.ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (q) fl.Q.setValueAtTime(q, t); return fl; }
  // tone: one oscillator through env (o: glide seconds for the f0 -> f1 sweep, lp cutoff, q, dest)
  function tone(k, type, f0, f1, t, a, d, peak, o) {
    o = o || {};
    const os = k.ac.createOscillator(), g = env(k, t, a, peak, d, o.dest);
    os.type = type; os.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) os.frequency.exponentialRampToValueAtTime(f1, t + (o.glide || a + d));
    let n = os;
    if (o.lp) { const fl = filt(k, 'lowpass', o.lp, t, o.q); n.connect(fl); n = fl; }
    n.connect(g);
    os.start(t); os.stop(t + a + d + 0.05);
    return os;
  }
  // hiss: filtered noise through env (o: q, f1 for a filter sweep, dest)
  function hiss(k, t, a, d, peak, type, f, o) {
    o = o || {};
    const s = k.ac.createBufferSource(), fl = filt(k, type, f, t, o.q), g = env(k, t, a, peak, d, o.dest);
    s.buffer = k.noise; s.loop = true;
    if (o.f1) fl.frequency.exponentialRampToValueAtTime(o.f1, t + a + d);
    s.connect(fl); fl.connect(g);
    k.noff = (k.noff + 0.137) % 0.9;
    s.start(t, k.noff); s.stop(t + a + d + 0.05);
  }
  // after: keep a minimum gap between cues of one kind (returns the time to play at, or -1 to drop it)
  function after(k, key, t, gap, maxAhead) {
    const prev = k.gap[key], u = prev == null ? t : Math.max(t, prev + gap);
    if (u - t > maxAhead) return -1;
    k.gap[key] = u;
    return u;
  }
  function strike(k, t, f, decay, v) {                        // one bell strike (8.16)
    for (const p of BELL) tone(k, 'sine', f * p[0], 0, t, 0.003, decay * p[2], p[1] * v);
    tone(k, 'sine', f * 1.0035, 0, t + 0.002, 0.004, decay * 0.9, 0.05 * v);   // a slow beat against the fundamental
    hiss(k, t, 0.001, 0.05, 0.09 * v, 'bandpass', 3400, { q: 1.4 });           // the clapper
  }
  // horde { gate: true }: the gate crescendo (6.4: "a pulsing ring"): a rising cluster that pulses faster and faster
  function gate(k, t) {
    const c = k.ac, dur = 1.3, g = c.createGain(), lp = filt(k, 'lowpass', 400, t, 6), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    g.connect(k.out);
    lp.frequency.exponentialRampToValueAtTime(2600, t + dur);
    am.gain.setValueAtTime(0.65, t); lfo.frequency.setValueAtTime(5, t); lfo.frequency.linearRampToValueAtTime(11, t + dur); lg.gain.setValueAtTime(0.35, t);
    lfo.connect(lg); lg.connect(am.gain); lp.connect(am); am.connect(g);
    for (const f of [110, 116.54, 164.81]) {
      const os = c.createOscillator(); os.type = 'sawtooth';
      os.frequency.setValueAtTime(f, t); os.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
      os.connect(lp); os.start(t); os.stop(t + dur + 0.3);
    }
    lfo.start(t); lfo.stop(t + dur + 0.3);
    hiss(k, t, dur * 0.8, 0.3, 0.07, 'bandpass', 800, { q: 1, f1: 3000 });
    return dur + 0.3;
  }
  function beat(k, t, v) {                                    // one heartbeat: lub, then dub
    tone(k, 'sine', 78, 44, t, 0.006, 0.14, 0.62 * v, { glide: 0.11 });
    hiss(k, t, 0.003, 0.06, 0.1 * v, 'lowpass', 180);
    tone(k, 'sine', 70, 40, t + 0.17, 0.006, 0.12, 0.44 * v, { glide: 0.09 });
  }

  // ------------------------------------------------------------------ loops (the run screen)
  function armStop(k, name, ms, fade) {
    const L = k.loops[name]; if (!L || !k.live) return;
    if (L.stopT) clearTimeout(L.stopT);
    L.stopT = setTimeout(() => stopLoop(k, name, k.ac.currentTime, fade), ms);
  }
  function stopLoop(k, name, t, fade) {
    const L = k.loops[name]; if (!L) return;
    delete k.loops[name];
    if (L.timer) clearInterval(L.timer);
    if (L.stopT) clearTimeout(L.stopT);
    if (!L.g) return;
    const at = Math.max(t, k.ac.currentTime), p = L.g.gain;
    try {
      if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(at);
      else { p.cancelScheduledValues(at); p.setValueAtTime(at >= L.full ? L.level : Math.max(0.0001, p.value), at); }
      p.exponentialRampToValueAtTime(0.0001, at + Math.max(0.02, fade));
    } catch (e) { /* a node that is already gone */ }
    for (const n of L.nodes) { try { n.stop(at + fade + 0.05); } catch (e) { /* already stopped */ } }
  }
  function stopLoops(k, t, fade) { if (k) for (const name of Object.keys(k.loops)) stopLoop(k, name, t, fade); }

  // ------------------------------------------------------------------ the cues (8.16); each returns its length in s
  const CUES = {
    tick(k, t) {
      const u = after(k, 'tick', t, 0.03, 0); if (u < 0) return 0;
      tone(k, 'sine', 2300, 1700, u, 0.002, 0.03, 0.06);
      return 0.05;
    },
    collect(k, t, o) {
      const u = after(k, 'collect', t, 0.03, 0.3); if (u < 0) return 0;
      const f = PENTA[Math.max(0, Math.min(PENTA.length - 1, Math.floor(+o.step || 0)))];
      if (o.res === 'cans') {                                 // metallic: a sine and its 2.76 partial
        tone(k, 'sine', f, f * 0.995, u, 0.002, 0.18, 0.12);
        tone(k, 'sine', f * 2.76, 0, u, 0.001, 0.06, 0.035);
        hiss(k, u, 0.001, 0.02, 0.03, 'highpass', 5000);
      } else if (o.res === 'sparks') {                        // bright: a fifth up, a shimmer and a glint
        tone(k, 'sine', f * 1.5, 0, u, 0.003, 0.3, 0.08);
        tone(k, 'sine', f * 1.5 * 1.005, 0, u + 0.035, 0.003, 0.26, 0.06);
        tone(k, 'triangle', f * 3, 0, u + 0.06, 0.002, 0.1, 0.025);
      } else {                                                // bricks, woody: an octave down with a knock
        tone(k, 'triangle', f / 2, 0, u, 0.002, 0.16, 0.16);
        tone(k, 'sine', f, 0, u, 0.001, 0.05, 0.03);
        hiss(k, u, 0.001, 0.03, 0.06, 'bandpass', 1100, { q: 2.5 });
      }
      return u - t + 0.32;
    },
    place(k, t) {                                             // a thud, then three hammer taps
      tone(k, 'sine', 120, 45, t, 0.004, 0.24, 0.55, { glide: 0.2 });
      hiss(k, t, 0.003, 0.16, 0.18, 'lowpass', 420);
      for (let i = 0; i < 3; i++) {
        const u = t + 0.3 + i * 0.17, v = 1 - i * 0.12;
        hiss(k, u, 0.001, 0.035, 0.22 * v, 'bandpass', 2400, { q: 5 });
        tone(k, 'triangle', 1180 - i * 40, 0, u, 0.001, 0.05, 0.05 * v);
      }
      return 0.85;
    },
    whirr(k, t) {                                             // a soft motor: a rising saw, low-passed, with a ratchet
      const c = k.ac, dur = 0.85, g = c.createGain(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      const os = c.createOscillator(), lp = filt(k, 'lowpass', 460, t, 2.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.075, t + 0.12);
      g.gain.setValueAtTime(0.075, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(k.out);
      am.gain.setValueAtTime(0.7, t); lfo.frequency.setValueAtTime(11, t); lg.gain.setValueAtTime(0.3, t);
      lfo.connect(lg); lg.connect(am.gain);
      os.type = 'sawtooth'; os.frequency.setValueAtTime(62, t); os.frequency.linearRampToValueAtTime(84, t + dur);
      os.connect(lp); lp.connect(am); am.connect(g);
      os.start(t); lfo.start(t); os.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      hiss(k, t + 0.05, 0.1, dur - 0.2, 0.03, 'bandpass', 1300, { q: 1.2 });
      return dur;
    },
    finish(k, t) {                                            // a chime: E6 G6 C7 with a little bell partial
      [1318.51, 1567.98, 2093].forEach((f, i) => {
        const u = t + i * 0.075;
        tone(k, 'sine', f, 0, u, 0.003, 0.5, 0.11);
        tone(k, 'sine', f * 2.76, 0, u, 0.002, 0.18, 0.025);
      });
      return 0.75;
    },
    bell(k, t, o) {                                           // 2: a safe return · 3: a Tower level · low: a goodbye
      const low = !!o.low, n = low ? 1 : Math.max(1, Math.min(3, Math.round(+o.times || 1)));
      const f = low ? 196 : 392, decay = low ? 3.6 : 2.5, gap = n === 3 ? 0.62 : 0.8;
      for (let i = 0; i < n; i++) strike(k, t + i * gap, f, decay, (low ? 0.95 : 1) * (1 - 0.07 * i));
      return (n - 1) * gap + decay;
    },
    drone(k, t, o) {                                          // the run screen's low drone: { on: true } / { on: false }
      if (o.on === false) { stopLoop(k, 'drone', t, 0.9); return 0; }
      if (k.loops.drone) { armStop(k, 'drone', 60000, 1.2); return 0; }
      const c = k.ac, g = c.createGain(), lp = filt(k, 'lowpass', 230, t, 3), lfo = c.createOscillator(), lg = c.createGain(), nodes = [];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 1.6); g.connect(k.out);
      lp.connect(g);
      for (const [type, f, lvl] of [['sawtooth', 55, 0.5], ['sawtooth', 55.42, 0.5], ['triangle', 82.4, 0.35], ['sine', 41.2, 0.7]]) {
        const os = c.createOscillator(), og = c.createGain();
        os.type = type; os.frequency.setValueAtTime(f, t); og.gain.setValueAtTime(lvl, t);
        os.connect(og); og.connect(type === 'sine' ? g : lp); os.start(t); nodes.push(os);
      }
      lfo.frequency.setValueAtTime(0.11, t); lg.gain.setValueAtTime(90, t); lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); nodes.push(lfo);
      k.loops.drone = { g, nodes, level: 0.15, full: t + 1.6 };
      armStop(k, 'drone', 60000, 1.2);
      return 0;
    },
    heartbeat(k, t, o) {                                      // one lub-dub; { on: true } repeats it until { on: false }
      if (o.on === false) { stopLoop(k, 'heart', t, 0); return 0; }
      if (o.on === true && k.live) {
        if (!k.loops.heart) k.loops.heart = { timer: setInterval(() => { if (ac && ac.state === 'running' && !muted) beat(k, ac.currentTime + 0.02, 1); }, 860) };
        armStop(k, 'heart', 30000, 0);
      }
      beat(k, t, 1);
      return 0.4;
    },
    horde(k, t, o) {                                          // "HORDE!": an arrow swoop, then a dissonant stab
      if (o.gate) return gate(k, t);
      hiss(k, t, 0.01, 0.16, 0.12, 'bandpass', 500, { q: 3, f1: 3200 });
      tone(k, 'sine', 330, 990, t, 0.005, 0.14, 0.07, { glide: 0.12 });
      const c = k.ac, u = t + 0.15, lp = filt(k, 'lowpass', 3000, u, 4), g = env(k, u, 0.008, 0.2, 0.8);
      lp.frequency.exponentialRampToValueAtTime(420, u + 0.75);
      lp.connect(g);
      for (const f of [146.83, 155.56, 207.65]) {
        const os = c.createOscillator(); os.type = 'sawtooth';
        os.frequency.setValueAtTime(f * 1.08, u); os.frequency.exponentialRampToValueAtTime(f, u + 0.07);
        os.connect(lp); os.start(u); os.stop(u + 0.9);
      }
      hiss(k, u, 0.002, 0.22, 0.2, 'lowpass', 1400);
      return 1.0;
    },
    fallBeat(k, t) {                                          // 6.6.1: two heartbeats under "Did Emre make it home?"
      beat(k, t, 1.15); beat(k, t + 0.78, 1);
      tone(k, 'sine', 46, 40, t, 0.3, 1.2, 0.14);
      return 1.55;
    },
    // ---- P1 "more sound" (13.1): ready for the UI to call; nothing plays them until it does
    levelUp(k, t) {                                           // a level-up: a quick rising arpeggio with a shimmer
      [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => { tone(k, 'triangle', f, 0, t + i * 0.06, 0.003, 0.32, 0.08); tone(k, 'sine', f * 2, 0, t + i * 0.06, 0.002, 0.1, 0.015); });
      return 0.6;
    },
    nickname(k, t) {                                          // a nickname: a warm low note under a sparkle
      tone(k, 'triangle', 261.63, 0, t, 0.02, 0.6, 0.09);
      [2349.32, 2637.02, 3135.96, 2637.02, 3520].forEach((f, i) => tone(k, 'sine', f, 0, t + 0.05 + i * 0.055, 0.002, 0.14, 0.035));
      return 0.75;
    },
    revive(k, t) {                                            // a revive: a soft major chord that swells, then one clear note
      [261.63, 329.63, 392].forEach((f) => tone(k, 'sine', f, 0, t, 0.35, 0.7, 0.06));
      tone(k, 'sine', 784, 0, t + 0.38, 0.004, 0.7, 0.08);
      return 1.1;
    },
    invite(k, t) {                                            // an invite: a door chime, ding-dong
      for (const [f, u] of [[783.99, 0], [659.25, 0.28]]) { tone(k, 'sine', f, 0, t + u, 0.003, 0.7, 0.1); tone(k, 'sine', f * 2.76, 0, t + u, 0.002, 0.2, 0.02); }
      return 1.0;
    },
    expand(k, t) {                                            // the fence slides out (0.8 s): a soft whoosh and a creak
      hiss(k, t, 0.25, 0.55, 0.08, 'bandpass', 500, { q: 0.8, f1: 1600 });
      tone(k, 'sawtooth', 90, 70, t + 0.1, 0.05, 0.5, 0.04, { lp: 500 });
      return 0.85;
    },
    rubble(k, t) {                                            // rubble cleared: a few knocks and a crumble
      for (let i = 0; i < 4; i++) hiss(k, t + i * 0.07, 0.002, 0.08, 0.14 - i * 0.025, 'lowpass', 700 - i * 90);
      tone(k, 'sine', 140, 70, t, 0.004, 0.16, 0.2, { glide: 0.15 });
      return 0.45;
    },
    spark(k, t) {                                             // sparks earned (a first clear, the daily spark, a glint)
      [2093, 2637.02, 3135.96].forEach((f, i) => { tone(k, 'sine', f, 0, t + i * 0.045, 0.002, 0.22, 0.05); tone(k, 'sine', f * 1.006, 0, t + i * 0.045 + 0.01, 0.002, 0.2, 0.03); });
      return 0.4;
    },
    deny(k, t) {                                              // a tap on something disabled: a soft low double blip
      const u = after(k, 'deny', t, 0.25, 0); if (u < 0) return 0;
      tone(k, 'triangle', 220, 196, u, 0.004, 0.06, 0.07, { lp: 1200 });
      tone(k, 'triangle', 196, 175, u + 0.09, 0.004, 0.07, 0.06, { lp: 1200 });
      return 0.2;
    },
  };
  const LOOP_CUES = { drone: 1, heartbeat: 1 };

  // ------------------------------------------------------------------ API
  function free() {
    const t = ac.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i] < t) voices.splice(i, 1);
    return voices.length < MAX_VOICES;
  }
  function unlock() {
    if (!ac && !create()) return false;
    if (ac.state !== 'running' && !hiddenStop) { try { quiet(ac.resume()); } catch (e) { /* resumed on a later gesture */ } }
    return true;
  }
  function play(cue, o) {
    if (!ac || !K || !Object.prototype.hasOwnProperty.call(CUES, cue)) return false;
    o = o || {};
    const off = LOOP_CUES[cue] && o.on === false;               // switching a loop off always goes through
    if (!off && (muted || ac.state !== 'running' || !free())) return false;
    try {
      const t = ac.currentTime + 0.01, len = CUES[cue](K, t, o);
      if (len > 0) voices.push(t + len);
      played++; last = cue;
      return true;
    } catch (e) { error = cue + ': ' + ((e && e.message) || e); return false; }   // a cue never breaks the page
  }
  function setMuted(m) {
    muted = !!m;
    if (!ac || !master) return;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(muted ? 0 : MASTER, t, 0.03);
    if (muted) stopLoops(K, t, 0.15);
  }
  function renderOffline(cue, o, seconds) {
    const C = ctorOf(true);
    if (!C || !Object.prototype.hasOwnProperty.call(CUES, cue)) return null;
    const sec = Math.max(0.2, Math.min(10, +seconds || 3)), rate = 44100, ctx = new C(1, Math.ceil(rate * sec), rate);
    const k = kit(ctx, chain(ctx), false);
    CUES[cue](k, 0.02, o || {});
    stopLoops(k, Math.max(0.05, sec - 1), 0.9);                 // a loop rendered offline fades out before the end
    return ctx.startRendering();
  }
  return {
    CUES: Object.keys(CUES),
    unlock, play, setMuted, renderOffline,
    isMuted: () => muted,
    stop() { if (ac) stopLoops(K, ac.currentTime, 0.3); },
    created: () => !!ac,
    state: () => ({ ctx: ac ? ac.state : 'none', created: !!ac, muted, voices: ac ? voices.filter((v) => v >= ac.currentTime).length : 0,
      loops: K ? Object.keys(K.loops) : [], played, last, error }),
  };
});
