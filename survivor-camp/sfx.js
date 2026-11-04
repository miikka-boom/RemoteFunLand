/* Survivor Camp sound (SPEC 8.8): every cue is synthesized with Web Audio, nothing is loaded.
 *
 * The AudioContext is created inside the first tap (unlock), never before. Graph: cues -> sfx bus (0.9) and the fire
 * ambience -> ambience bus (0.5) -> master (volume, 0 when muted) -> compressor (threshold -14, ratio 5) -> speakers.
 * At most 12 cues sound at once; extra ones are dropped. Collect ticks keep a 25 ms minimum gap.
 *
 * API (SC.Sfx): unlock(dev) on every user gesture (creates the context the first time, resumes it after), play(name,
 *   opts), setMuted(bool), setVolume(0..1), ambience(bool) for the fire loop, suspend() / resume() for page
 *   visibility, created() (true once a context exists), state() for checks.
 * Cues: tap, tick {step 0-7}, chunk, battery, spend, deny, build, clup, zip, radio, tickline, horde, win, loss,
 *   crate, whoomp, collect, secondWind.
 */
(function (root, f) {
  const api = f(root.SC || {});
  if (typeof module === 'object' && module.exports) module.exports = api; else (root.SC = root.SC || {}).Sfx = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];   // C5 D5 E5 G5 A5 C6 D6 E6
  const MAX_VOICES = 12;
  let ac = null, master = null, comp = null, sfxBus = null, ambBus = null, noiseBuf = null, fireBuf = null;
  let muted = false, volume = 0.8, ambOn = false, ambNodes = null, lastTick = 0, lastErr = '';
  const voices = [];

  function create() {
    const AC = typeof AudioContext !== 'undefined' ? AudioContext : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null; // eslint-disable-line no-undef
    if (!AC) return false;
    try { if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
    try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { ac = null; return false; }
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.knee.value = 8; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = muted ? 0 : volume;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    ambBus = ac.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    fireBuf = makeFire();
    // one silent sample inside the gesture unlocks output on iOS
    try { const b = ac.createBuffer(1, 1, ac.sampleRate), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch (e) { /* ignore */ }
    if (ambOn) startAmb();
    return true;
  }
  // A 4 s fire loop: soft brown noise with random crackles baked in.
  function makeFire() {
    const n = ac.sampleRate * 4, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const clicks = 46;
    for (let c = 0; c < clicks; c++) {
      const at = Math.floor(Math.random() * (n - 800)), len = 40 + Math.floor(Math.random() * 400), amp = 0.25 + Math.random() * 0.6;
      for (let i = 0; i < len; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.pow(1 - i / len, 3);
    }
    for (let i = 0; i < 400; i++) { const k = i / 400; d[i] *= k; d[n - 1 - i] *= k; }       // seamless loop
    return b;
  }

  // ------------------------------------------------------------------ helpers
  function free() {
    const t = ac.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i] < t) voices.splice(i, 1);
    return voices.length < MAX_VOICES;
  }
  function voice(end) { voices.push(end); }
  function gainEnv(t, a, peak, d, dest) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(dest || sfxBus);
    return g;
  }
  function osc(type, f0, f1, t, dur, peak, o) {
    o = o || {};
    const os = ac.createOscillator(); os.type = type;
    os.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) os.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (o.detune) os.detune.value = o.detune;
    const g = gainEnv(t, o.a || 0.004, peak, dur, o.dest);
    let n = os;
    if (o.hp || o.lp) { const fl = ac.createBiquadFilter(); fl.type = o.hp ? 'highpass' : 'lowpass'; fl.frequency.value = o.hp || o.lp; os.connect(fl); n = fl; }
    n.connect(g);
    os.start(t); os.stop(t + (o.a || 0.004) + dur + 0.05);
    return os;
  }
  function noise(t, dur, peak, type, freq, q, o) {
    o = o || {};
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.setValueAtTime(freq || 1000, t); if (q) fl.Q.value = q;
    if (o.f1) fl.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = gainEnv(t, o.a || 0.004, peak, dur, o.dest);
    s.connect(fl); fl.connect(g);
    s.start(t, Math.random() * 0.5); s.stop(t + (o.a || 0.004) + dur + 0.05);
  }

  // ------------------------------------------------------------------ cues (SPEC 8.8)
  const CUES = {
    tap(t) { osc('square', 1800, 0, t, 0.025, 0.05, { hp: 1200 }); return 0.04; },
    tick(t, o) {
      if (t < lastTick + 0.025) t = lastTick + 0.025;
      lastTick = t;
      const f = PENTA[Math.max(0, Math.min(7, (o && o.step) | 0))];
      osc('triangle', f, 0, t, 0.06, 0.08);
      osc('sine', 3000, 0, t, 0.03, 0.018);
      return t - ac.currentTime + 0.07;
    },
    chunk(t) { osc('sine', 180, 90, t, 0.12, 0.22); noise(t, 0.1, 0.08, 'lowpass', 900); return 0.14; },
    battery(t) { osc('sine', 1318, 0, t, 0.08, 0.09); osc('sine', 1760, 0, t + 0.08, 0.08, 0.09); return 0.18; },
    spend(t) { osc('sine', 220, 110, t, 0.07, 0.16); return 0.08; },
    deny(t) { osc('square', 196, 0, t, 0.06, 0.06, { lp: 1400 }); osc('square', 196, 0, t + 0.09, 0.06, 0.06, { lp: 1400 }); return 0.17; },
    build(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => osc('triangle', f, 0, t + i * 0.07, 0.16, 0.09));
      noise(t, 0.35, 0.05, 'bandpass', 600, 0.8, { f1: 3000, a: 0.08 });
      return 0.5;
    },
    clup(t) {
      osc('sine', 70, 35, t, 0.6, 0.45, { a: 0.01 });
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.4); g.gain.setValueAtTime(0.05, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7 + 1.8);
      lp.connect(g); g.connect(sfxBus);
      for (const f of [220, 277.18, 329.63]) for (const dt of [-6, 6]) {
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + 2.6);
      }
      return 2.6;
    },
    zip(t) { osc('sine', 400, 1600, t, 0.4, 0.1); return 0.42; },
    radio(t) {
      noise(t, 0.28, 0.1, 'bandpass', 1800, 1.4);
      osc('square', 1100, 900, t + 0.02, 0.06, 0.02, { lp: 2500 });
      return 0.3;
    },
    tickline(t) { osc('sine', 2000, 0, t, 0.015, 0.04); return 0.02; },
    horde(t) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      for (let i = 0; i < 10; i++) o.frequency.setValueAtTime(i % 2 ? 800 : 600, t + i * 0.125);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.setValueAtTime(0.05, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(lp); lp.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.25);
      return 1.25;
    },
    win(t) { for (const f of [523.25, 659.25, 783.99]) osc('triangle', f, 0, t, 0.45, 0.07); osc('sawtooth', 130.81, 0, t, 0.35, 0.04, { lp: 700 }); return 0.5; },
    loss(t) { osc('sawtooth', 300, 80, t, 0.6, 0.08, { lp: 1200 }); osc('sawtooth', 290, 75, t + 0.02, 0.6, 0.05, { lp: 900 }); return 0.65; },
    crate(t) { CUES.chunk(t); for (const f of [392, 493.88, 587.33]) osc('triangle', f, 0, t + 0.05, 0.4, 0.06, { a: 0.02 }); return 0.5; },
    whoomp(t) { noise(t, 0.45, 0.16, 'lowpass', 300, 0, { f1: 2400, a: 0.05 }); osc('sine', 110, 55, t, 0.35, 0.18); return 0.5; },
    collect(t) { osc('sine', 700, 1100, t, 0.06, 0.05); return 0.07; },
    secondWind(t) { osc('sine', 80, 45, t, 0.18, 0.4); osc('sine', 80, 45, t + 0.24, 0.18, 0.3); return 0.45; },
  };

  // ------------------------------------------------------------------ fire ambience
  function startAmb() {
    if (!ac || ambNodes) return;
    const t = ac.currentTime;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 1.5); g.connect(ambBus);
    const a = ac.createBufferSource(); a.buffer = fireBuf; a.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.5;
    const ga = ac.createGain(); ga.gain.value = 0.12; a.connect(bp); bp.connect(ga); ga.connect(g);
    const r = ac.createBufferSource(); r.buffer = fireBuf; r.loop = true; r.playbackRate.value = 0.5;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
    const gr = ac.createGain(); gr.gain.value = 0.35; r.connect(lp); lp.connect(gr); gr.connect(g);
    a.start(t); r.start(t, 1.3);
    ambNodes = { g, a, r };
  }
  function stopAmb() {
    if (!ambNodes) return;
    const n = ambNodes, t = ac.currentTime; ambNodes = null;
    n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(Math.max(0.0001, n.g.gain.value), t); n.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    n.a.stop(t + 0.45); n.r.stop(t + 0.45);
  }

  // ------------------------------------------------------------------ API
  return {
    unlock(dev) {
      if (dev) { muted = !!dev.muted; if (typeof dev.volume === 'number') volume = Math.max(0, Math.min(1, dev.volume)); }
      if (!ac && !create()) return false;
      if (ac.state !== 'running') ac.resume().catch(() => {});
      return true;
    },
    created() { return !!ac; },
    state() { return { ctx: ac ? ac.state : 'none', voices: voices.length, ambience: !!ambNodes, muted, volume, lastError: lastErr }; },
    play(name, o) {
      if (!ac || muted || ac.state !== 'running') return;
      const cue = CUES[name]; if (!cue) return;
      if (!free()) return;
      try { const t = ac.currentTime + 0.005, len = cue(t, o || {}); voice(t + (len || 0.2)); } catch (e) { lastErr = name + ': ' + (e && e.message); }   // a cue never breaks the page
    },
    setMuted(m) { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ac.currentTime, 0.03); },
    setVolume(v) { volume = Math.max(0, Math.min(1, +v || 0)); if (master && !muted) master.gain.setTargetAtTime(volume, ac.currentTime, 0.03); },
    ambience(on) { ambOn = !!on; if (!ac) return; if (ambOn) startAmb(); else stopAmb(); },
    suspend() { if (ac && ac.state === 'running') ac.suspend().catch(() => {}); },
    resume() { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); },
  };
});
