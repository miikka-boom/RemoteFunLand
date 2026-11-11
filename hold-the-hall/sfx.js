/* Hold the Hall: sound. Everything is synthesized with Web Audio; nothing plays before the first tap (unlock()).
 * HH.Sfx: unlock() · play(name) · setOn(bool) · isOn()
 * names: shot, groan, hit, clang, tap, deny, collect, build, win, lose, bell, crank, power, horde, level, door
 */
(function (root) {
  'use strict';
  let ac = null, master = null, on = true, noiseBuf = null, windGain = null;
  const now = () => ac.currentTime;
  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain(); master.gain.value = on ? 0.8 : 0; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    wind();
  }
  function tone(type, f0, f1, dur, vol, t0, attack) {
    const o = ac.createOscillator(), g = ac.createGain(), t = now() + (t0 || 0);
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, q, t0, type) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = now() + (t0 || 0);
    s.buffer = noiseBuf; s.loop = true; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function wind() {                                 // a low wind that never stops
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), l = ac.createOscillator(), lg = ac.createGain();
    windGain = ac.createGain(); windGain.gain.value = 0.05;
    s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.6;
    l.frequency.value = 0.09; lg.gain.value = 0.03; l.connect(lg); lg.connect(windGain.gain);
    s.connect(f); f.connect(windGain); windGain.connect(master); s.start(); l.start();
  }
  const S = {
    shot() { noise(0.11, 0.5, 1700, 0.8); tone('square', 150, 45, 0.12, 0.22); },
    groan() { const f = 70 + Math.random() * 40; tone('sawtooth', f * 1.3, f, 0.45, 0.07, 0, 0.08); noise(0.4, 0.04, 420, 3, 0.02); },
    hit() { noise(0.07, 0.25, 700, 1.5); tone('triangle', 190, 90, 0.09, 0.12); },
    clang() { tone('square', 523, 500, 0.22, 0.09); tone('triangle', 784, 760, 0.3, 0.1); tone('sine', 1320, 1290, 0.18, 0.06); noise(0.06, 0.2, 3200, 2); },
    tap() { tone('sine', 520, 420, 0.05, 0.1); },
    deny() { tone('square', 120, 95, 0.14, 0.09); },
    collect() { tone('sine', 660, 660, 0.07, 0.14); tone('sine', 990, 990, 0.1, 0.14, 0.06); },
    build() { for (let i = 0; i < 3; i++) { noise(0.05, 0.22, 900, 2, i * 0.13); tone('triangle', 240, 160, 0.06, 0.1, i * 0.13); } },
    level() { [523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.12, 0.12, i * 0.07)); },
    win() { [392, 523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.13, i * 0.09)); },
    lose() { [392, 349, 294, 220].forEach((f, i) => tone('sawtooth', f, f * 0.97, 0.3, 0.06, i * 0.14, 0.03)); },
    bell() { tone('sine', 392, 390, 2.4, 0.2, 0, 0.004); tone('sine', 784, 780, 1.6, 0.09, 0, 0.004); tone('sine', 1178, 1170, 1.0, 0.05, 0, 0.004); noise(0.03, 0.12, 2500, 2); },
    crank() { noise(0.03, 0.14, 1300, 3); tone('square', 90, 70, 0.04, 0.06); },
    power() { tone('sawtooth', 50, 110, 1.3, 0.1, 0, 0.3); tone('sine', 220, 440, 1.2, 0.08, 0.2, 0.3); [523, 659, 784].forEach((f, i) => tone('sine', f, f, 1.2, 0.07, 1.0 + i * 0.05, 0.05)); },
    horde() { for (let i = 0; i < 3; i++) { tone('square', 620, 620, 0.16, 0.08, i * 0.36); tone('square', 470, 470, 0.16, 0.08, i * 0.36 + 0.18); } },
    door() { noise(0.25, 0.4, 300, 0.8, 0, 'lowpass'); tone('square', 90, 40, 0.3, 0.2); },
    thud() { tone('sine', 110, 35, 0.4, 0.4); noise(0.2, 0.2, 200, 0.7, 0, 'lowpass'); },
  };
  function play(name) { if (!ac || !on || !S[name]) return; try { S[name](); } catch (e) { /* a sound must never break the game */ } }
  function setOn(v) { on = !!v; if (master) master.gain.value = on ? 0.8 : 0; }
  root.HH = root.HH || {};
  root.HH.Sfx = { unlock, play, setOn, isOn: () => on, ready: () => !!ac };
})(typeof self !== 'undefined' ? self : this);
