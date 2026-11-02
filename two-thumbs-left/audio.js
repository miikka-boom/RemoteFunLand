'use strict';
/* Two Thumbs Left: all sound is synthesized with Web Audio. Nothing plays until the first tap. */
window.Sfx = (function () {
  let ac = null, master, sfx, amb, music, verbSend, verb, noise, comp;
  let muted = false;
  let windGain = null, sirenNodes = null, motorNodes = null, drumTimer = 0, drumOn = false, drumNext = 0, drumStep = 0;
  let groans = 0;
  let lastShotAt = 0;

  function init() {
    if (ac) { resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      // iOS 17+: play through the silent switch like a game, not like a notification.
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* not supported */ }
    ac = new AC({ latencyHint: 'interactive' });
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.9;
    master.connect(comp); comp.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    amb = ac.createGain(); amb.gain.value = 0.5; amb.connect(master);
    music = ac.createGain(); music.gain.value = 0.0; music.connect(master);
    // Small room/street reverb on a send.
    verb = ac.createConvolver();
    verb.buffer = impulse(1.6, 2.4);
    verbSend = ac.createGain(); verbSend.gain.value = 0.35;
    verbSend.connect(verb); verb.connect(master);
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startWind();
    resume();
    // Unlock: play one silent sample inside the tap that started the run.
    try { const b = ac.createBuffer(1, 1, ac.sampleRate); const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch (e) { /* ignore */ }
    // iOS 16 and older: a looping silent <audio> moves the page to the "playback" session,
    // so the ring/silent switch doesn't mute the game.
    if (!navigator.audioSession && /iP(hone|ad|od)/.test(navigator.userAgent)) {
      try { const el = new Audio(silentWav()); el.loop = true; el.setAttribute('playsinline', ''); el.play().catch(() => {}); } catch (e) { /* ignore */ }
    }
  }
  function silentWav() {
    const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return 'data:audio/wav;base64,' + btoa(s);
  }

  function resume() { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); }
  function suspend() { if (ac && ac.state === 'running') ac.suspend().catch(() => {}); }
  function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.03); }

  function impulse(sec, decay) {
    const len = Math.floor(ac.sampleRate * sec);
    const b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = b.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // ---- building blocks ----
  function out(pan, wet, dest) {
    const g = ac.createGain();
    let node = g;
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      g.connect(p); node = p;
    }
    node.connect(dest || sfx);
    if (wet) { const w = ac.createGain(); w.gain.value = wet; node.connect(w); w.connect(verbSend); }
    return g;
  }
  function noiseSrc(t, dur) {
    const s = ac.createBufferSource(); s.buffer = noise;
    s.loop = true; s.loopStart = Math.random(); s.loopEnd = s.loopStart + 0.9;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return s;
  }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function burst(t, { type = 'bandpass', f = 1000, q = 1, dur = 0.1, a = 0.002, peak = 0.5, pan = 0, wet = 0.2, f2 = null, dest = null }) {
    const s = noiseSrc(t, a + dur);
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
    const g = ac.createGain(); env(g, t, a, peak, dur);
    s.connect(fl); fl.connect(g); g.connect(out(pan, wet, dest));
  }
  function thump(t, { f0 = 150, f1 = 50, dur = 0.12, peak = 0.6, pan = 0, type = 'sine', wet = 0.1, dest = null }) {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); env(g, t, 0.003, peak, dur);
    o.connect(g); g.connect(out(pan, wet, dest));
    o.start(t); o.stop(t + dur + 0.05);
  }
  function tone(t, { f = 440, f2 = null, dur = 0.1, peak = 0.2, type = 'square', pan = 0, a = 0.004, wet = 0.1, lp = 0 }) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ac.createGain(); env(g, t, a, peak, dur);
    let n = o;
    if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
    n.connect(g); g.connect(out(pan, wet));
    o.start(t); o.stop(t + a + dur + 0.05);
  }

  // ---- weapons ----
  function shot(kind) {
    if (!ac) return;
    const t = ac.currentTime + 0.001;
    const j = 0.92 + Math.random() * 0.16;
    if (kind === 'pistol') {
      burst(t, { type: 'bandpass', f: 1900 * j, q: 0.8, dur: 0.09, peak: 0.55, wet: 0.35 });
      burst(t, { type: 'highpass', f: 4000, q: 0.5, dur: 0.025, peak: 0.35, wet: 0 });
      thump(t, { f0: 210 * j, f1: 60, dur: 0.09, peak: 0.6 });
    } else if (kind === 'smg') {
      burst(t, { type: 'bandpass', f: 2300 * j, q: 0.9, dur: 0.055, peak: 0.42, wet: 0.25 });
      burst(t, { type: 'highpass', f: 5000, q: 0.5, dur: 0.018, peak: 0.25, wet: 0 });
      thump(t, { f0: 180 * j, f1: 70, dur: 0.06, peak: 0.45 });
    } else if (kind === 'shotgun') {
      burst(t, { type: 'lowpass', f: 2600, f2: 500, q: 0.7, dur: 0.32, peak: 0.85, wet: 0.5 });
      burst(t, { type: 'highpass', f: 3000, q: 0.5, dur: 0.04, peak: 0.45, wet: 0 });
      thump(t, { f0: 120 * j, f1: 38, dur: 0.22, peak: 0.95 });
    } else if (kind === 'rifle') {
      burst(t, { type: 'highpass', f: 2400, q: 0.7, dur: 0.06, peak: 0.55, wet: 0.3 });
      burst(t, { type: 'bandpass', f: 900 * j, q: 0.9, dur: 0.14, peak: 0.45, wet: 0.4 });
      thump(t, { f0: 160 * j, f1: 50, dur: 0.1, peak: 0.6 });
    }
    lastShotAt = t;
  }
  function pump() {
    if (!ac) return;
    const t = ac.currentTime + 0.18;
    burst(t, { type: 'bandpass', f: 1400, q: 3, dur: 0.05, peak: 0.25, wet: 0.05 });
    burst(t + 0.13, { type: 'bandpass', f: 1900, q: 3, dur: 0.05, peak: 0.28, wet: 0.05 });
  }
  function dry() { if (!ac) return; const t = ac.currentTime; burst(t, { type: 'bandpass', f: 3200, q: 6, dur: 0.03, peak: 0.25, wet: 0 }); }
  function reload(kind, stage) {
    if (!ac) return;
    const t = ac.currentTime;
    if (stage === 'out') burst(t, { type: 'bandpass', f: 1200, q: 4, dur: 0.05, peak: 0.25, wet: 0.05 });
    else if (stage === 'shell') { burst(t, { type: 'bandpass', f: 2200, q: 5, dur: 0.035, peak: 0.22, wet: 0.05 }); thump(t, { f0: 400, f1: 200, dur: 0.03, peak: 0.08 }); }
    else { burst(t, { type: 'bandpass', f: 1700, q: 4, dur: 0.04, peak: 0.3, wet: 0.05 }); burst(t + 0.09, { type: 'bandpass', f: 2600, q: 5, dur: 0.03, peak: 0.25, wet: 0.05 }); }
  }
  function swap() { if (!ac) return; const t = ac.currentTime; burst(t, { type: 'bandpass', f: 1500, q: 3, dur: 0.06, peak: 0.2, wet: 0.05 }); }

  // ---- bodies ----
  function hit(pan, kill, vol) {
    if (!ac) return;
    const t = ac.currentTime + Math.random() * 0.01;
    const v = vol == null ? 1 : vol;
    burst(t, { type: 'lowpass', f: kill ? 900 : 700, f2: 180, q: 1.2, dur: kill ? 0.16 : 0.07, peak: (kill ? 0.5 : 0.28) * v, pan, wet: 0.08 });
    if (kill) thump(t, { f0: 110, f1: 45, dur: 0.12, peak: 0.35 * v, pan });
  }
  function shove(pan) {
    if (!ac) return;
    const t = ac.currentTime;
    burst(t, { type: 'bandpass', f: 500, f2: 1800, q: 1.2, dur: 0.14, a: 0.02, peak: 0.35, pan, wet: 0.05 });
  }
  function shoveImpact(n, pan) {
    if (!ac) return;
    const t = ac.currentTime + 0.03;
    thump(t, { f0: 140, f1: 55, dur: 0.12, peak: Math.min(0.9, 0.35 + n * 0.12), pan });
    burst(t, { type: 'lowpass', f: 600, q: 1, dur: 0.08, peak: 0.3, pan, wet: 0.05 });
  }
  function hurt() {
    if (!ac) return;
    const t = ac.currentTime;
    thump(t, { f0: 95, f1: 40, dur: 0.18, peak: 0.8, wet: 0 });
    burst(t, { type: 'bandpass', f: 380, q: 2.5, dur: 0.14, peak: 0.45, wet: 0 });
    // a short strangled voice
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(150 + Math.random() * 30, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.2);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 4;
    const g = ac.createGain(); env(g, t, 0.01, 0.16, 0.2);
    o.connect(f); f.connect(g); g.connect(out(0, 0)); o.start(t); o.stop(t + 0.3);
  }
  function heartbeat(rate) {
    if (!ac) return;
    const t = ac.currentTime;
    thump(t, { f0: 70, f1: 40, dur: 0.12, peak: 0.55 * rate, wet: 0 });
    thump(t + 0.18, { f0: 60, f1: 35, dur: 0.14, peak: 0.4 * rate, wet: 0 });
  }
  function pickup() { if (!ac) return; const t = ac.currentTime; tone(t, { f: 660, dur: 0.06, peak: 0.12, type: 'triangle' }); tone(t + 0.07, { f: 990, dur: 0.09, peak: 0.12, type: 'triangle' }); }
  function heal() { if (!ac) return; const t = ac.currentTime; for (let i = 0; i < 3; i++) tone(t + i * 0.08, { f: 520 + i * 180, dur: 0.12, peak: 0.1, type: 'sine' }); }
  function rip() { if (!ac) return; const t = ac.currentTime; burst(t, { type: 'highpass', f: 2500, f2: 6000, q: 0.7, dur: 0.25, a: 0.03, peak: 0.18, wet: 0 }); }

  // Zombie voice: a sawtooth through two vowel formants with a wobbling pitch.
  function groan(pan, vol, kind) {
    if (!ac || groans >= 3 || vol < 0.04) return;
    groans++;
    const t = ac.currentTime + Math.random() * 0.05;
    const dur = kind === 'alert' ? 0.55 + Math.random() * 0.3 : 0.8 + Math.random() * 0.9;
    const f0 = kind === 'alert' ? 170 + Math.random() * 90 : 75 + Math.random() * 55;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    if (kind === 'alert') { o.frequency.linearRampToValueAtTime(f0 * 1.5, t + dur * 0.3); o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + dur); }
    else o.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + dur);
    const lfo = ac.createOscillator(); lfo.frequency.value = 5 + Math.random() * 6;
    const lg = ac.createGain(); lg.gain.value = f0 * 0.06; lfo.connect(lg); lg.connect(o.frequency);
    const vowel = Math.random() < 0.5 ? [520, 900] : [380, 1100];
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.08);
    g.gain.setValueAtTime(0.22 * vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const dest = out(pan, 0.35);
    for (const fq of vowel) {
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq * (0.9 + Math.random() * 0.2); f.Q.value = 5;
      o.connect(f); f.connect(g);
    }
    const n = noiseSrc(t, dur);
    const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1500; nf.Q.value = 1.5;
    const ng = ac.createGain(); ng.gain.value = 0.25;
    n.connect(nf); nf.connect(ng); ng.connect(g);
    g.connect(dest);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    setTimeout(() => { groans--; }, (dur + 0.1) * 1000);
  }
  function swing(pan) { if (!ac) return; const t = ac.currentTime; burst(t, { type: 'bandpass', f: 700, f2: 300, q: 2, dur: 0.12, peak: 0.12, pan, wet: 0.05 }); }

  // The horde: a far-off chorus of screams, then war drums.
  function hordeCue() {
    if (!ac) return;
    const t = ac.currentTime;
    for (let i = 0; i < 6; i++) {
      const st = t + i * 0.09 + Math.random() * 0.1;
      const o = ac.createOscillator(); o.type = 'sawtooth';
      const f0 = 260 + Math.random() * 260;
      o.frequency.setValueAtTime(f0, st);
      o.frequency.linearRampToValueAtTime(f0 * 1.6, st + 0.5);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.8, st + 1.6);
      const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900 + Math.random() * 500; f1.Q.value = 3;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.12, st + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, st + 1.7);
      o.connect(f1); f1.connect(lp); lp.connect(g); g.connect(out((Math.random() - 0.5) * 1.4, 1.2, amb));
      o.start(st); o.stop(st + 1.8);
    }
    // three heavy hits
    for (let i = 0; i < 3; i++) {
      thump(t + 1.2 + i * 0.32, { f0: 90, f1: 38, dur: 0.4, peak: 0.9, wet: 0.5, dest: amb });
      burst(t + 1.2 + i * 0.32, { type: 'lowpass', f: 400, q: 1, dur: 0.25, peak: 0.35, wet: 0.4, dest: amb });
    }
  }

  // Drum loop while a horde is on you.
  function setDrums(on) {
    if (!ac) return;
    if (on === drumOn) return;
    drumOn = on;
    music.gain.setTargetAtTime(on ? 0.75 : 0.0, ac.currentTime, on ? 0.2 : 1.2);
    if (on && !drumTimer) { drumNext = ac.currentTime + 0.05; drumStep = 0; drumTimer = setInterval(scheduleDrums, 60); }
  }
  function scheduleDrums() {
    if (!ac) return;
    if (!drumOn && music.gain.value < 0.01) { clearInterval(drumTimer); drumTimer = 0; return; }
    const spb = 60 / 148 / 2; // eighths at 148 BPM
    while (drumNext < ac.currentTime + 0.2) {
      const s = drumStep % 16, t = drumNext;
      if ([0, 3, 6, 8, 10, 11, 14].includes(s)) thump(t, { f0: s % 8 === 0 ? 95 : 140, f1: 45, dur: 0.22, peak: s % 8 === 0 ? 0.9 : 0.55, wet: 0.3, dest: music });
      if (s === 4 || s === 12) burst(t, { type: 'bandpass', f: 1800, q: 0.8, dur: 0.18, peak: 0.35, wet: 0.5, dest: music });
      if (s % 2 === 1) burst(t, { type: 'highpass', f: 7000, q: 0.5, dur: 0.03, peak: 0.08, wet: 0, dest: music });
      drumNext += spb; drumStep++;
    }
  }

  function startWind() {
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.6;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ac.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency);
    windGain = ac.createGain(); windGain.gain.value = 0.18;
    s.connect(f); f.connect(windGain); windGain.connect(amb);
    // a low city drone
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 43.65;
    const of = ac.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 120;
    const og = ac.createGain(); og.gain.value = 0.05;
    o.connect(of); of.connect(og); og.connect(amb);
    s.start(); lfo.start(); o.start();
  }

  function siren(on) {
    if (!ac) return;
    if (on && !sirenNodes) {
      const t = ac.currentTime;
      const o = ac.createOscillator(); o.type = 'square';
      const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.1;
      const lg = ac.createGain(); lg.gain.value = 110; lfo.connect(lg); lg.connect(o.frequency);
      o.frequency.value = 760;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.3);
      o.connect(f); f.connect(g); g.connect(out(0.3, 0.8));
      o.start(); lfo.start();
      sirenNodes = { o, lfo, g };
    } else if (!on && sirenNodes) {
      const { o, lfo, g } = sirenNodes; const t = ac.currentTime;
      g.gain.setTargetAtTime(0.0001, t, 0.3); o.stop(t + 1.5); lfo.stop(t + 1.5);
      sirenNodes = null;
    }
  }
  function motor(on) {
    if (!ac) return;
    if (on && !motorNodes) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      const g = ac.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.09, ac.currentTime, 0.4);
      o.connect(f); f.connect(g); g.connect(out(0.3, 0.3));
      o.start(); motorNodes = { o, g };
    } else if (!on && motorNodes) {
      const t = ac.currentTime; motorNodes.g.gain.setTargetAtTime(0.0001, t, 0.2); motorNodes.o.stop(t + 1);
      motorNodes = null;
      thump(t, { f0: 80, f1: 40, dur: 0.4, peak: 0.8, wet: 0.6 });
      burst(t, { type: 'bandpass', f: 900, q: 2, dur: 0.3, peak: 0.4, wet: 0.6 });
    }
  }
  function clunk() { if (!ac) return; const t = ac.currentTime; thump(t, { f0: 120, f1: 40, dur: 0.25, peak: 0.7, wet: 0.4 }); burst(t, { type: 'bandpass', f: 1300, q: 3, dur: 0.12, peak: 0.35, wet: 0.4 }); }
  function beep(urgent) { if (!ac) return; tone(ac.currentTime, { f: urgent ? 2200 : 1800, dur: 0.05, peak: 0.12, type: 'square', lp: 4000 }); }
  function boom(vol) {
    if (!ac) return;
    const t = ac.currentTime;
    const v = vol == null ? 1 : vol;
    burst(t, { type: 'lowpass', f: 3000, f2: 120, q: 0.8, dur: 1.1, peak: 0.95 * v, wet: 0.8 });
    thump(t, { f0: 90, f1: 25, dur: 0.9, peak: 1.0 * v, wet: 0.6 });
  }
  function throwWhoosh() { if (!ac) return; const t = ac.currentTime; burst(t, { type: 'bandpass', f: 700, f2: 2400, q: 1.5, dur: 0.18, a: 0.03, peak: 0.2, wet: 0.05 }); }
  function door() { if (!ac) return; const t = ac.currentTime; thump(t, { f0: 70, f1: 30, dur: 0.5, peak: 1, wet: 0.7 }); burst(t, { type: 'lowpass', f: 800, q: 1, dur: 0.35, peak: 0.5, wet: 0.6 }); burst(t + 0.25, { type: 'bandpass', f: 2600, q: 6, dur: 0.06, peak: 0.25, wet: 0.3 }); }
  function sting(win) {
    if (!ac) return;
    const t = ac.currentTime;
    const notes = win ? [220, 277.2, 329.6, 440] : [196, 185, 174.6, 155.6];
    notes.forEach((f, i) => tone(t + i * (win ? 0.14 : 0.3), { f, dur: win ? 1.6 : 1.4, peak: 0.08, type: 'sawtooth', lp: 1400, a: 0.04, wet: 0.6 }));
  }
  function setWind(v) { if (windGain && ac) windGain.gain.setTargetAtTime(v, ac.currentTime, 0.8); }

  return {
    init, resume, suspend, setMuted,
    get ready() { return !!ac; },
    get muted() { return muted; },
    shot, pump, dry, reload, swap, hit, shove, shoveImpact, hurt, heartbeat, pickup, heal, rip,
    groan, swing, hordeCue, setDrums, siren, motor, clunk, beep, boom, throwWhoosh, door, sting, setWind,
  };
})();
