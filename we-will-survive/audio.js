/* We Will Survive. Right? — the sound.
   Every note and noise is synthesized with Web Audio from score.js. Drums and the effects that
   repeat are rendered once into a sample bank (OfflineAudioContext, on page load); the melodic
   parts play on a few persistent voices; the rest is built per event. The engine plays live with
   a look-ahead scheduler (pause, resume, seek) and renders offline for the checks. */
(function () {
'use strict';
const S = WWS.score;
const { BAR, BEAT } = S;
const STEP = BEAT / 4;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// a smooth random curve of n points in [0, 1] through `knots` random knots
function smoothCurve(rand, n, knots) {
  const k = []; for (let i = 0; i <= knots + 1; i++) k.push(rand());
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1) * knots, j = Math.floor(x), f = x - j, s = f * f * (3 - 2 * f);
    c[i] = k[j] + (k[j + 1] - k[j]) * s;
  }
  return c;
}
function curveOf(n, fn) { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1)); return c; }
// tanh drive, normalized so a full-scale input still peaks at 1
function driveCurve(k) {
  const n = 1024, c = new Float32Array(n), d = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / d; }
  return c;
}
// the master's soft limiter: unity gain for small signals, never above 1
function limitCurve() {
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 1.6; c[i] = Math.tanh(x); }
  return c;
}

/* ---------------- impulse responses ---------------- */
function hallIR(ctx, seconds, rand) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, a = clamp(0.92 - t * 0.22, 0.25, 0.92);   // the tail darkens
      lp = lp + (rand() * 2 - 1 - lp) * a;
      d[i] = lp * Math.pow(10, -3 * t / seconds) * (t < 0.012 ? t / 0.012 : 1);
    }
    for (let k = 0; k < 9; k++) {
      const at = Math.floor(sr * (0.011 + rand() * 0.07)), amp = (0.5 - k * 0.04) * (rand() < 0.5 ? -1 : 1);
      if (at < len) d[at] += amp;
    }
  }
  return b;
}
function gatedIR(ctx, rand) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 0.32), b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      lp = lp + (rand() * 2 - 1 - lp) * 0.55;
      d[i] = lp * Math.min(1, t / 0.004) * (1 - t * 1.1) * (t > 0.27 ? Math.max(0, 1 - (t - 0.27) / 0.03) : 1);
    }
  }
  return b;
}

/* ================================================================
   Synth: the instruments. Routing goes through syn.s (a session:
   music, lead, drums, sfx buses and rev / gate / dly sends).
   ================================================================ */
function Synth(ctx, seed) {
  const syn = { ctx };
  const R = syn.R = mulberry(seed);
  const sr = ctx.sampleRate, NYQ = sr / 2 - 200;
  function noiseBuf(sec, brown) {
    const len = Math.floor(sr * sec), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = R() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  const WHITE = noiseBuf(4, false), BROWN = noiseBuf(4, true);
  const g = syn.g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const osc = syn.osc = (type, f, det) => { const n = ctx.createOscillator(); n.type = type; n.frequency.value = f; if (det) n.detune.value = det; return n; };
  const bq = syn.bq = (type, f, Q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = Math.min(f, NYQ); if (Q !== undefined) n.Q.value = Q; return n; };
  const panner = syn.panner = (p) => { const n = ctx.createStereoPanner(); n.pan.value = clamp(p || 0, -1, 1); return n; };
  const shaper = syn.shaper = (k) => { const n = ctx.createWaveShaper(); n.curve = driveCurve(k); return n; };
  const noise = syn.noise = (at, dur, brown) => {
    const s = ctx.createBufferSource(); s.buffer = brown ? BROWN : WHITE; s.loop = true;
    s.start(at, R() * 3.5); s.stop(at + dur + 0.05);
    return s;
  };
  const chain = syn.chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
  const to = syn.to = (node, ...dests) => { for (const d of dests) if (d) node.connect(d); return node; };
  // attack/decay: linear attack, then down to ~5% after d seconds
  const ad = syn.ad = (param, at, a, peak, d) => { param.setValueAtTime(0, at); param.linearRampToValueAtTime(peak, at + a); param.setTargetAtTime(0, at + a, Math.max(0.002, d / 3)); };
  const ahr = syn.ahr = (param, at, a, peak, hold, r) => {
    param.setValueAtTime(0, at); param.linearRampToValueAtTime(peak, at + a);
    param.setValueAtTime(peak, at + a + hold); param.linearRampToValueAtTime(0, at + a + hold + r);
  };
  const sends = syn.sends = (node, rev, gate, dly) => {
    const s = syn.s;
    if (rev && s.rev) to(node, to(g(rev), s.rev));
    if (gate && s.gate) to(node, to(g(gate), s.gate));
    if (dly && s.dly) to(node, to(g(dly), s.dly));
  };
  const out = syn.out = (p, rev, gate) => { const pn = panner(p || 0); to(pn, syn.s.sfx); sends(pn, rev, gate || 0, 0); return pn; };
  const burst = (at, dur, type, f, Q, peak, dest, attack) => {
    const n = noise(at, dur + 0.05), b = bq(type, f, Q), a = g(0);
    ad(a.gain, at, attack || 0.001, peak, dur);
    chain(n, b, a, dest); return a;
  };
  const thump = (at, f0, f1, dur, peak, dest) => {
    const o = osc('sine', f0), a = g(0);
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.7);
    ad(a.gain, at, 0.002, peak, dur);
    chain(o, a, dest); o.start(at); o.stop(at + dur + 0.1); return a;
  };
  const metal = (at, freqs, dur, peak, dest, type) => {
    const sum = g(1);
    freqs.forEach((f, i) => {
      const o = osc(type || 'sine', f), a = g(0);
      ad(a.gain, at, 0.001, peak / (1 + i * 0.4), dur * (1 - i * 0.07));
      chain(o, a, sum); o.start(at); o.stop(at + dur + 0.1);
    });
    to(sum, dest); return sum;
  };
  const VOWELS = { a: [[800, 1], [1150, 0.5], [2900, 0.22]], o: [[450, 1], [800, 0.45], [2830, 0.16]], u: [[325, 1], [700, 0.3], [2530, 0.1]], e: [[400, 1], [1700, 0.4], [2600, 0.2]], i: [[270, 1], [2200, 0.3], [3000, 0.2]] };
  const formants = syn.formants = (vowel, input, Qs) => {
    const o = g(1);
    VOWELS[vowel].forEach(([f, amp], i) => { const b = bq('bandpass', f, Qs ? Qs[i] : 8); chain(input, b, to(g(amp * 3), o)); });
    return o;
  };
  const creak = (at, dur, r0, r1, f1, f2, peak, p) => {
    const s = osc('sawtooth', r0);
    s.frequency.setValueCurveAtTime(curveOf(48, (x) => lerp(r0, r1, x) * (0.75 + 0.5 * Math.abs(Math.sin(x * 23 + R() * 0.3)))), at, dur);
    const hp = bq('highpass', 400), b1 = bq('bandpass', f1, 5), b2 = bq('bandpass', f2, 6), a = g(0), sum = g(1);
    chain(s, hp); hp.connect(b1); hp.connect(b2); b1.connect(sum); chain(b2, to(g(0.7), sum));
    ahr(a.gain, at, 0.08, peak, dur - 0.2, 0.12);
    chain(sum, a, out(p, 0.4)); s.start(at); s.stop(at + dur + 0.05);
  };
  syn.burst = burst; syn.thump = thump; syn.metal = metal;

  /* ---------- drums (rendered into the bank) ---------- */
  syn.kick = (at) => {
    const o = osc('sine', 160), a = g(0);
    o.frequency.setValueAtTime(165, at); o.frequency.exponentialRampToValueAtTime(55, at + 0.055); o.frequency.exponentialRampToValueAtTime(42, at + 0.3);
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.95, at + 0.002); a.gain.setValueAtTime(0.95, at + 0.05); a.gain.setTargetAtTime(0, at + 0.05, 0.08);
    chain(o, a, syn.s.drums); o.start(at); o.stop(at + 0.45);
    burst(at, 0.012, 'highpass', 2500, 0.7, 0.2, syn.s.drums);
  };
  syn.heart = (at) => {
    const o = osc('sine', 70), a = g(0), lp = bq('lowpass', 180);
    o.frequency.setValueAtTime(75, at); o.frequency.exponentialRampToValueAtTime(36, at + 0.18);
    ad(a.gain, at, 0.006, 0.95, 0.24);
    chain(o, lp, a, syn.s.drums); o.start(at); o.stop(at + 0.4);
  };
  syn.snare = (at) => {
    const o = osc('triangle', 200), a = g(0);
    o.frequency.setValueAtTime(205, at); o.frequency.exponentialRampToValueAtTime(160, at + 0.06);
    ad(a.gain, at, 0.001, 0.5, 0.11); chain(o, a, syn.s.drums); o.start(at); o.stop(at + 0.2);
    const n = noise(at, 0.25), bp = bq('bandpass', 1900, 0.7), hp = bq('highpass', 700), b = g(0);
    ad(b.gain, at, 0.001, 0.62, 0.17); chain(n, bp, hp, b, syn.s.drums);
  };
  syn.clap = (at) => {
    for (let k = 0; k < 3; k++) burst(at + k * 0.011, 0.018, 'bandpass', 1300, 1.2, 0.5, syn.s.drums);
    burst(at + 0.03, 0.2, 'bandpass', 1150, 0.9, 0.38, syn.s.drums, 0.002);
  };
  syn.hat = (at, open) => {
    const n = noise(at, open ? 0.3 : 0.06), hp = bq('highpass', open ? 7000 : 8200), pk = bq('peaking', 10500, 1), a = g(0);
    pk.gain.value = 6;
    ad(a.gain, at, 0.001, open ? 0.17 : 0.15, open ? 0.22 : 0.035);
    chain(n, hp, pk, a, panner(0.25), syn.s.drums);
  };
  syn.shaker = (at) => {
    const n = noise(at, 0.08), hp = bq('highpass', 6000), a = g(0);
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.08, at + 0.015); a.gain.setTargetAtTime(0, at + 0.015, 0.018);
    chain(n, hp, a, panner(-0.3), syn.s.drums);
  };
  syn.tom = (at, hi) => {
    const f0 = hi ? 150 : 100, o = osc('sine', f0), a = g(0), pn = panner(hi ? 0.3 : -0.3);
    o.frequency.setValueAtTime(f0 * 1.35, at); o.frequency.exponentialRampToValueAtTime(f0 * 0.72, at + 0.3);
    ad(a.gain, at, 0.002, 0.75, 0.34); chain(o, a, pn); o.start(at); o.stop(at + 0.5);
    burst(at, 0.03, 'lowpass', 1800, 0.7, 0.25, pn);
    to(pn, syn.s.drums);
  };
  syn.timp = (at) => {
    [[1, 1], [1.5, 0.35], [2, 0.28], [2.44, 0.12]].forEach(([r, amp]) => {
      const o = osc('sine', 73.4 * r), a = g(0);
      o.frequency.setValueAtTime(73.4 * r * 1.04, at); o.frequency.exponentialRampToValueAtTime(73.4 * r, at + 0.12);
      ad(a.gain, at, 0.004, amp * 0.9, 1.6 / r); chain(o, a, syn.s.drums); o.start(at); o.stop(at + 2);
    });
    burst(at, 0.03, 'lowpass', 900, 0.7, 0.35, syn.s.drums);
  };
  syn.crash = (at) => {
    const n = noise(at, 2.2), hp = bq('highpass', 4200), a = g(0), pn = panner(-0.2);
    ad(a.gain, at, 0.002, 0.22, 1.7); chain(n, hp, a, pn);
    const m = g(0), bp = bq('bandpass', 7500, 0.8); ad(m.gain, at, 0.001, 0.05, 1.1);
    [297, 435, 561, 720, 885, 1104].forEach((f) => { const o = osc('square', f * 2.3); o.connect(bp); o.start(at); o.stop(at + 1.6); });
    chain(bp, m, pn); to(pn, syn.s.drums);
  };

  /* ---------- foley and repeated effects (rendered into the bank) ---------- */
  syn.step = (at, run) => {
    const o = syn.s.sfx;
    burst(at, run ? 0.06 : 0.08, 'bandpass', 1700 + R() * 900, 0.8, 0.16, o);
    burst(at + 0.012 + R() * 0.01, 0.05, 'bandpass', 3200 + R() * 1200, 1.2, 0.08, o);
    thump(at, 120, 70, 0.08, 0.12, o);
  };
  syn.dirt = (at, big) => {
    const o = syn.s.sfx;
    burst(at, big ? 0.5 : 0.32, 'lowpass', 700, 0.7, big ? 0.7 : 0.4, o, 0.004);
    thump(at, big ? 95 : 80, 38, big ? 0.4 : 0.25, big ? 0.8 : 0.45, o);
    for (let k = 0; k < 6; k++) burst(at + 0.05 + R() * 0.4, 0.03, 'bandpass', 1500 + R() * 2500, 1.5, 0.12 + R() * 0.1, o);
  };
  syn.groan = (at, pitch) => {
    const dur = 1.3 + R() * 0.5, f0 = 82 * pitch;
    const s = osc('sawtooth', f0), sq = osc('square', f0 * 0.5);
    const fc = curveOf(40, (x) => f0 * (0.9 + 0.25 * Math.sin(Math.PI * x) + 0.04 * Math.sin(x * 60 + R())));
    s.frequency.setValueCurveAtTime(fc, at, dur); sq.frequency.setValueCurveAtTime(fc.map((v) => v * 0.5), at, dur);
    const src = g(1); to(s, src); chain(sq, to(g(0.4), src));
    chain(noise(at, dur), to(g(0.25), src));
    const grit = chain(src, shaper(3));
    const f1 = bq('bandpass', 400, 6), f2 = bq('bandpass', 800, 7), f3 = bq('bandpass', 2400, 8), sum = g(1);
    f1.frequency.setValueCurveAtTime(curveOf(16, (x) => lerp(330, 760, Math.sin(Math.PI * x))), at, dur);
    f2.frequency.setValueCurveAtTime(curveOf(16, (x) => lerp(720, 1150, Math.sin(Math.PI * x))), at, dur);
    grit.connect(f1); grit.connect(f2); grit.connect(f3);
    chain(f1, to(g(2.2), sum)); chain(f2, to(g(1.2), sum)); chain(f3, to(g(0.4), sum));
    const a = g(0);
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.3, at + 0.2); a.gain.linearRampToValueAtTime(0.24, at + dur * 0.7); a.gain.linearRampToValueAtTime(0, at + dur);
    chain(sum, a, syn.s.sfx);
    s.start(at); sq.start(at); s.stop(at + dur + 0.05); sq.stop(at + dur + 0.05);
  };
  syn.shotgun = (at) => {
    const sum = g(1), dist = shaper(2.4), o = g(1);
    chain(sum, dist, o, syn.s.sfx);
    burst(at, 0.008, 'highpass', 200, 0.5, 1.0, sum);
    burst(at, 0.2, 'lowpass', 2600, 0.6, 0.9, sum, 0.0015);
    burst(at + 0.004, 0.45, 'lowpass', 700, 0.5, 0.45, sum, 0.003);
    thump(at, 95, 34, 0.32, 1.0, sum);
    // the slap back from the trees
    const dl = ctx.createDelay(1), lp = bq('lowpass', 1400), e = g(0.3); dl.delayTime.value = 0.21;
    chain(o, dl, lp, e, syn.s.sfx);
  };
  syn.pump = (at) => {
    const o = syn.s.sfx;
    burst(at, 0.025, 'bandpass', 2600, 1.5, 0.35, o); thump(at, 400, 300, 0.03, 0.12, o);
    burst(at + 0.11, 0.035, 'bandpass', 1300, 1.2, 0.45, o); thump(at + 0.11, 260, 180, 0.05, 0.22, o);
  };
  syn.click = (at) => { const o = syn.s.sfx; burst(at, 0.01, 'bandpass', 3200, 2, 0.3, o); burst(at + 0.03, 0.008, 'bandpass', 2400, 2, 0.18, o); };
  syn.dryFire = (at) => { const o = syn.s.sfx; burst(at, 0.014, 'bandpass', 2100, 3, 0.45, o); thump(at, 520, 400, 0.04, 0.12, o); };
  syn.shells = (at) => { for (let k = 0; k < 6; k++) metal(at + k * 0.05 + R() * 0.04, [3100 + R() * 1300, 5200 + R() * 1500], 0.12, 0.07, syn.s.sfx, 'sine'); };
  syn.load = (at) => { const o = syn.s.sfx; burst(at, 0.02, 'bandpass', 1700, 2, 0.3, o); burst(at + 0.04, 0.015, 'bandpass', 3300, 2, 0.22, o); };
  syn.whack = (at) => {
    const o = syn.s.sfx;
    burst(at, 0.05, 'bandpass', 1100, 1.5, 0.6, o);
    const s = osc('triangle', 460), a = g(0); s.frequency.setValueAtTime(470, at); s.frequency.exponentialRampToValueAtTime(330, at + 0.07);
    ad(a.gain, at, 0.001, 0.35, 0.08); chain(s, a, o); s.start(at); s.stop(at + 0.15);
    thump(at, 140, 60, 0.15, 0.5, o);
  };
  syn.crank = (at) => {
    const dur = STEP * 2 * 0.92, s = osc('sawtooth', 96), sq = osc('square', 48), lp = bq('lowpass', 900, 2), a = g(0);
    s.frequency.setValueCurveAtTime(curveOf(16, (x) => (96 - 22 * Math.sin(Math.PI * x)) * (0.97 + R() * 0.06)), at, dur);
    a.gain.setValueCurveAtTime(curveOf(16, (x) => Math.min(1, x * 12) * (0.75 + 0.25 * Math.cos(x * Math.PI * 2)) * Math.min(1, (1 - x) * 8) * 0.32), at, dur);
    const src = g(1); to(s, src); chain(sq, to(g(0.6), src));
    chain(noise(at, dur), bq('bandpass', 1600, 2), to(g(0.25), src));
    chain(src, shaper(2.5), lp, a, syn.s.sfx);
    s.start(at); sq.start(at); s.stop(at + dur + 0.02); sq.stop(at + dur + 0.02);
  };
  syn.slap = (at) => { const o = syn.s.sfx; burst(at, 0.025, 'bandpass', 1100 + R() * 300, 1, 0.5, o); thump(at, 160, 90, 0.07, 0.35, o); metal(at, [2000 + R() * 500, 3400], 0.12, 0.06, o); };
  syn.thud = (at) => { const o = syn.s.sfx; thump(at, 75, 40, 0.3, 0.9, o); burst(at, 0.12, 'lowpass', 600, 0.7, 0.4, o); metal(at, [182, 263, 411, 590], 0.45, 0.13, o, 'triangle'); };
  syn.bodyHit = (at) => { const o = syn.s.sfx; thump(at, 110, 48, 0.18, 0.8, o); burst(at, 0.08, 'lowpass', 1100, 0.7, 0.5, o); burst(at + 0.01, 0.05, 'bandpass', 650, 2, 0.35, o); };

  /* ---------- one-off effects (built live) ---------- */
  syn.owl = (at) => {
    const o = out(-0.6, 0.7);
    [[0, 0.42], [0.55, 0.18], [0.78, 0.5]].forEach(([dt, len]) => {
      const s = osc('sine', 390), lp = bq('lowpass', 900), a = g(0);
      s.frequency.setValueAtTime(400, at + dt); s.frequency.linearRampToValueAtTime(365, at + dt + len);
      ahr(a.gain, at + dt, 0.06, 0.1, len - 0.12, 0.08);
      chain(s, lp, a, o); s.start(at + dt); s.stop(at + dt + len + 0.05);
    });
  };
  syn.gateCreak = (at) => creak(at, 1.6, 34, 62, 1100, 2400, 0.45, 0.2);
  syn.creak = (at) => creak(at, 1.1, 22, 40, 650, 1450, 0.4, 0);
  syn.gateClang = (at) => { const o = out(0.1, 0.6); metal(at, [212, 563, 897, 1311, 1768, 2390], 1.3, 0.13, o, 'sine'); burst(at, 0.05, 'bandpass', 2200, 1, 0.25, o); };
  syn.thunder = (at, p) => {
    const o = out((p && p.pan) || 0, 0.5);
    burst(at, 0.12, 'highpass', 1400, 0.5, 0.34, o);
    burst(at + 0.02, 0.3, 'bandpass', 900, 0.6, 0.27, o, 0.005);
    const n = noise(at, 4.2, true), lp = bq('lowpass', 220, 0.8), a = g(0);
    a.gain.setValueCurveAtTime(curveOf(64, (x) => Math.pow(1 - x, 2.2) * (0.6 + 0.4 * Math.abs(Math.sin(x * 17 + R() * 6))) * Math.min(1, x * 30) * 0.9), at, 4);
    chain(n, lp, a, o);
    thump(at, 70, 28, 0.9, 0.55, o);
  };
  syn.howl = (at, p) => {
    const far = p && p.far ? 1 : 0, dur = far ? 2.4 : 3.2, lev = far ? 0.1 : 0.26;
    const pn = out(far ? 0.5 : -0.1, far ? 0.9 : 0.6);
    const voice = (t0, sc, levK) => {
      const fc = curveOf(64, (x) => sc * (x < 0.12 ? lerp(330, 540, x / 0.12) : x < 0.62 ? 540 + 18 * Math.sin((x - 0.12) * 60) : lerp(540, 360, (x - 0.62) / 0.38)));
      const s = osc('sine', 330), sw = osc('sawtooth', 330), h = osc('sine', 660);
      s.frequency.setValueCurveAtTime(fc, t0, dur); sw.frequency.setValueCurveAtTime(fc, t0, dur); h.frequency.setValueCurveAtTime(fc.map((v) => v * 2), t0, dur);
      const sum = g(1); to(s, sum); chain(h, to(g(0.18), sum));
      chain(formants('u', sw, [6, 6, 6]), to(g(0.08), sum));
      const a = g(0); a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(lev * levK, t0 + 0.3); a.gain.setValueAtTime(lev * levK, t0 + dur * 0.7); a.gain.linearRampToValueAtTime(0, t0 + dur);
      if (far) chain(sum, bq('lowpass', 1300), a, pn); else chain(sum, a, pn);
      for (const x of [s, sw, h]) { x.start(t0); x.stop(t0 + dur + 0.05); }
    };
    voice(at, 1, 1);
    if (!far) voice(at + 0.7, 0.93, 0.35);
  };
  syn.ricochet = (at, p) => {
    const o = out((p && p.pan) || 0.2, 0.35), s = osc('sine', 2600), a = g(0);
    s.frequency.setValueAtTime(2700, at); s.frequency.exponentialRampToValueAtTime(850, at + 0.38);
    ad(a.gain, at, 0.002, 0.14, 0.38); chain(s, a, o); s.start(at); s.stop(at + 0.45);
    metal(at, [3800, 5100], 0.08, 0.1, o);
  };
  const beast = (at, dur, f0s, vowel, lev, p, rattle) => {
    const s = osc('sawtooth', f0s[0]);
    s.frequency.setValueCurveAtTime(curveOf(32, (x) => (x < 0.3 ? lerp(f0s[0], f0s[1], x / 0.3) : lerp(f0s[1], f0s[2], (x - 0.3) / 0.7)) * (1 + 0.06 * Math.sin(x * 90))), at, dur);
    const src = g(1); to(s, src);
    chain(noise(at, dur), to(g(0.6), src));
    const am = osc('sine', rattle || 22), amd = g(0.45), amg = g(0.55); chain(am, amd, amg.gain); am.start(at); am.stop(at + dur + 0.05);
    const f = formants(vowel, chain(src, shaper(4), amg), [5, 6, 6]);
    const a = g(0); a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(lev, at + 0.08); a.gain.setValueAtTime(lev, at + dur * 0.6); a.gain.linearRampToValueAtTime(0, at + dur);
    chain(f, a, out(p, 0.35));
    s.start(at); s.stop(at + dur + 0.05);
  };
  syn.growl = (at) => beast(at, 1.2, [58, 72, 55], 'o', 0.3, 0.3, 24);
  syn.roar = (at) => beast(at, 1.5, [85, 150, 80], 'a', 0.42, 0.1, 31);
  syn.whoosh = (at, p) => {
    const dur = (p && p.dur) || 0.6, n = noise(at, dur), b = bq('bandpass', 300, 1.2), a = g(0);
    b.frequency.setValueAtTime(300, at); b.frequency.exponentialRampToValueAtTime(2400, at + dur * 0.45); b.frequency.exponentialRampToValueAtTime(350, at + dur);
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.45, at + dur * 0.45); a.gain.linearRampToValueAtTime(0, at + dur);
    chain(n, b, a, out(0, 0.2));
  };
  syn.treeCrack = (at) => {
    const o = out(0.4, 0.4);
    for (let k = 0; k < 10; k++) burst(at + 0.5 * Math.pow(k / 10, 0.6), 0.012, 'highpass', 1100, 0.7, 0.22 + k * 0.03, o);
    burst(at + 0.52, 0.12, 'bandpass', 1400, 0.6, 0.6, o);
  };
  syn.treeFall = (at) => {
    const o = out(0.3, 0.5);
    burst(at, 1.4, 'lowpass', 380, 0.7, 0.7, o, 0.01); thump(at, 70, 28, 0.6, 0.8, o);
    for (let k = 0; k < 8; k++) burst(at + R() * 0.8, 0.03, 'bandpass', 1800 + R() * 2000, 1, 0.13, o);
  };
  syn.bell = (at) => {
    const o = out(0.35, 0.8), f = 146.8;
    [[0.5, 0.35, 6], [1, 1, 4.5], [1.183, 0.55, 3.8], [1.506, 0.4, 3.2], [2, 0.45, 2.6], [2.514, 0.22, 2.1], [2.662, 0.18, 1.9], [3.011, 0.14, 1.6]].forEach(([r, amp, d]) => {
      const s = osc('sine', f * r), a = g(0); ad(a.gain, at, 0.003, amp * 0.12, d); chain(s, a, o); s.start(at); s.stop(at + d + 0.2);
    });
    burst(at, 0.03, 'bandpass', 2000, 1, 0.13, o);
  };
  syn.batBurst = (at, p) => {
    const small = p && p.small, dur = small ? 1.2 : 2.2, lev = small ? 0.13 : 0.26, o = out(0.2, 0.3);
    const flap = osc('square', 17), fd = g(0.5), fg = g(0.5), a = g(0);
    chain(flap, fd, fg.gain); flap.start(at); flap.stop(at + dur + 0.05);
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(lev, at + 0.15); a.gain.linearRampToValueAtTime(0, at + dur);
    chain(noise(at, dur), bq('bandpass', 3200, 1.5), fg, a, o);
    for (let k = 0; k < (small ? 6 : 14); k++) {
      const tt = at + R() * dur * 0.8, s = osc('sine', 8000 + R() * 4000), sa = g(0);
      s.frequency.setValueAtTime(s.frequency.value, tt); s.frequency.exponentialRampToValueAtTime(s.frequency.value * 0.7, tt + 0.03);
      ad(sa.gain, tt, 0.002, 0.045, 0.03); chain(s, sa, panner(R() * 2 - 1), syn.s.sfx); s.start(tt); s.stop(tt + 0.06);
    }
  };
  syn.hiss = (at) => { const a = g(0); ahr(a.gain, at, 0.12, 0.26, 0.5, 0.3); chain(noise(at, 1), bq('highpass', 3500), bq('bandpass', 6200, 1.5), a, out(0.3, 0.3)); };
  syn.shriek = (at) => {
    const o = out(0.4, 0.6), dur = 0.9, s = osc('sawtooth', 700);
    s.frequency.setValueCurveAtTime(curveOf(24, (x) => (x < 0.25 ? lerp(650, 1450, x / 0.25) : lerp(1450, 800, (x - 0.25) / 0.75)) * (1 + 0.03 * Math.sin(x * 120))), at, dur);
    const f = formants('i', chain(s, shaper(2)), [4, 5, 5]), a = g(0);
    ahr(a.gain, at, 0.05, 0.2, dur - 0.3, 0.25); chain(f, a, o); s.start(at); s.stop(at + dur + 0.05);
    burst(at, 0.5, 'highpass', 4000, 0.7, 0.13, o, 0.05);
  };
  syn.snap = (at) => { const o = out(-0.15, 0.2); burst(at, 0.008, 'highpass', 2000, 0.7, 0.5, o); burst(at + 0.045, 0.006, 'highpass', 2500, 0.7, 0.36, o); thump(at, 640, 520, 0.03, 0.18, o); };
  syn.breath = (at) => {
    const f = formants('a', chain(noise(at, 1.0), g(1)), [3, 4, 5]), a = g(0);
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.11, at + 0.12); a.gain.setValueAtTime(0.11, at + 0.5); a.gain.linearRampToValueAtTime(0, at + 0.9);
    chain(f, a, out(-0.2, 0.15));
  };
  syn.door = (at, p) => {
    const o = out((p && p.pan) || -0.3, 0.2);
    thump(at, 95, 55, 0.22, 0.7, o); burst(at, 0.1, 'lowpass', 1200, 0.7, 0.42, o); burst(at + 0.01, 0.012, 'bandpass', 3000, 2, 0.22, o);
    metal(at, [410, 780, 1260], 0.25, 0.05, o);
  };
  syn.squeak = (at) => {
    const o = out(-0.5, 0.3), dur = 0.55, s = osc('sine', 1400), a = g(0);
    s.frequency.setValueCurveAtTime(curveOf(32, (x) => 1300 + 400 * x + 90 * Math.sin(x * 70)), at, dur);
    ahr(a.gain, at, 0.04, 0.05, dur - 0.1, 0.06); chain(s, a, o); s.start(at); s.stop(at + dur + 0.05);
  };
  syn.slam = (at) => {
    const o = out(-0.5, 0.4);
    thump(at, 85, 36, 0.4, 0.95, o); burst(at, 0.2, 'lowpass', 2200, 0.7, 0.75, o);
    metal(at, [2300, 3100, 4400, 5900], 0.5, 0.07, o);
    const st = g(0), sum = g(1);
    [86, 87, 88].forEach((m, i) => { const s = osc('sawtooth', mtof(m), (i - 1) * 14); chain(s, sum); s.start(at); s.stop(at + 1.6); });
    ahr(st.gain, at, 0.01, 0.08, 0.3, 1.1); chain(sum, bq('highpass', 900), st, out(0, 0.6));
  };
  syn.eye = (at, p) => {
    p = p || {};
    const o = out(p.pan || 0, 0.45), a = g(0), b = bq('bandpass', 300, 4);
    burst(at, 0.05, 'lowpass', 500, 0.7, 0.4, o);
    b.frequency.setValueAtTime(260, at); b.frequency.exponentialRampToValueAtTime(p.big ? 1400 : 950, at + 0.18);
    ad(a.gain, at, 0.01, p.big ? 0.6 : 0.35, 0.22); chain(noise(at, 0.3), b, a, o);
    thump(at, p.big ? 60 : 52, 30, p.big ? 0.7 : 0.35, p.big ? 0.7 : 0.35, o);
    if (p.big) creak(at + 0.05, 0.9, 14, 26, 500, 1100, 0.25, 0);
  };
  syn.sputter = (at) => {
    const o = out(0, 0.2);
    for (let k = 0; k < 4; k++) { const tt = at + k * 0.075; burst(tt, 0.04, 'lowpass', 420, 0.7, 0.5 - k * 0.1, o); thump(tt, 75, 45, 0.06, 0.4 - k * 0.08, o); }
  };
  syn.glass = (at) => {
    const o = out(-0.4, 0.35);
    burst(at, 0.04, 'highpass', 3000, 0.7, 0.45, o);
    for (let k = 0; k < 12; k++) burst(at + R() * 0.25, 0.01, 'highpass', 2500, 0.7, 0.18, o);
    for (let k = 0; k < 8; k++) metal(at + 0.05 + R() * 0.5, [3000 + R() * 4000], 0.2, 0.045, o);
  };
  syn.engineStart = (at) => {
    const o = out(0, 0.25), dur = 1.6, s = osc('sawtooth', 30), sq = osc('square', 15), lp = bq('lowpass', 300, 2), a = g(0);
    const fc = curveOf(48, (x) => (x < 0.35 ? lerp(28, 75, x / 0.35) : x < 0.6 ? lerp(75, 135, (x - 0.35) / 0.25) : lerp(135, 98, (x - 0.6) / 0.4)));
    s.frequency.setValueCurveAtTime(fc, at, dur); sq.frequency.setValueCurveAtTime(fc.map((v) => v / 2), at, dur);
    lp.frequency.setValueCurveAtTime(fc.map((v) => v * 14), at, dur);
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.42, at + 0.3); a.gain.setValueAtTime(0.42, at + 1.1); a.gain.linearRampToValueAtTime(0, at + dur);
    const src = g(1); to(s, src); chain(sq, to(g(0.7), src));
    chain(src, shaper(3), lp, a, o);
    s.start(at); sq.start(at); s.stop(at + dur + 0.05); sq.stop(at + dur + 0.05);
    for (let k = 0; k < 5; k++) burst(at + k * 0.06, 0.04, 'lowpass', 500, 0.7, 0.45, o);
  };
  syn.screech = (at) => {
    const o = out(0.3, 0.3), dur = 0.9, a = g(0), sa = g(0), s = osc('sine', 2400);
    ahr(a.gain, at, 0.03, 0.4, dur - 0.3, 0.25); chain(noise(at, dur), bq('bandpass', 2700, 9), a, o);
    s.frequency.setValueCurveAtTime(curveOf(48, (x) => 2400 + 120 * Math.sin(x * 140) - 300 * x), at, dur);
    ahr(sa.gain, at, 0.03, 0.06, dur - 0.3, 0.25); chain(s, sa, o); s.start(at); s.stop(at + dur + 0.05);
  };
  syn.rev = (at) => {
    const dur = 1.0, s = osc('sawtooth', 120), a = g(0);
    s.frequency.setValueAtTime(115, at); s.frequency.exponentialRampToValueAtTime(240, at + dur);
    ahr(a.gain, at, 0.1, 0.18, dur - 0.2, 0.1); chain(s, shaper(3), bq('lowpass', 1500, 2), a, out(0, 0.1)); s.start(at); s.stop(at + dur + 0.05);
  };
  syn.launch = (at) => {
    const o = out(0, 0.5), s = osc('sawtooth', 200), a = g(0);
    thump(at, 70, 25, 1.0, 0.9, o); burst(at, 0.3, 'lowpass', 2000, 0.7, 0.5, o);
    s.frequency.setValueAtTime(200, at); s.frequency.exponentialRampToValueAtTime(420, at + 0.7);
    ahr(a.gain, at, 0.02, 0.18, 0.4, 0.8); chain(s, shaper(2), bq('lowpass', 2500, 2), a, o); s.start(at); s.stop(at + 1.3);
  };
  syn.yelp = (at) => {
    const dur = 1.1, s = osc('sawtooth', 620), a = g(0), lp = bq('lowpass', 2000);
    s.frequency.setValueCurveAtTime(curveOf(32, (x) => lerp(640, 260, x) * (1 + 0.04 * Math.sin(x * 50))), at, dur);
    lp.frequency.setValueAtTime(2400, at); lp.frequency.exponentialRampToValueAtTime(500, at + dur);
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.22, at + 0.05); a.gain.linearRampToValueAtTime(0, at + dur);
    chain(formants('o', s, [4, 5, 5]), lp, a, out(-0.3, 0.8)); s.start(at); s.stop(at + dur + 0.05);
  };
  syn.landing = (at) => {
    const o = out(0, 0.4), ms = g(1);
    thump(at, 62, 24, 0.7, 0.95, o); burst(at, 0.35, 'lowpass', 3000, 0.7, 0.7, o);
    chain(ms, shaper(2), o); metal(at, [151, 233, 347, 523, 761, 902], 0.45, 0.16, ms, 'square');
    for (let k = 0; k < 10; k++) metal(at + 0.05 + R() * 0.5, [3200 + R() * 4000], 0.2, 0.045, o);
    const s = osc('sine', 180), a = g(0);   // the suspension: boing
    s.frequency.setValueCurveAtTime(curveOf(64, (x) => 180 + 45 * Math.sin(x * 2 * Math.PI * 4.2) * (1 - x)), at + 0.08, 0.7);
    ad(a.gain, at + 0.08, 0.01, 0.18, 0.7); chain(s, a, o); s.start(at + 0.08); s.stop(at + 0.9);
  };
  syn.hubcap = (at) => {
    const o = out(0.5, 0.3), dur = 1.8, s = osc('sine', 1900), s2 = osc('sine', 2630), a = g(0.06), wob = g(0);
    wob.gain.setValueCurveAtTime(curveOf(256, (x) => { const ph = 3 * x + 6 * x * x * x; return (0.5 + 0.5 * Math.cos(ph * 2 * Math.PI * 3)) * (1 - x * 0.7); }), at, dur);
    a.gain.setValueAtTime(0.06, at + dur); a.gain.linearRampToValueAtTime(0, at + dur + 0.05);
    to(s, wob); chain(s2, to(g(0.6), wob)); chain(wob, a, o);
    for (const x of [s, s2]) { x.start(at); x.stop(at + dur + 0.1); }
    metal(at + dur, [1850, 2700, 3900], 0.5, 0.1, o);
  };
  syn.shimmer = (at, p) => {
    const soft = p && p.soft, o = out(0, 0.8), dur = 4;
    [86, 93, 98, 102].forEach((m, i) => {
      const s = osc('sine', mtof(m)), a = g(0), tr = osc('sine', 3 + i * 0.7), td = g(0.4), tg = g(0.6);
      chain(tr, td, tg.gain);
      ahr(a.gain, at, 1.2, (soft ? 0.02 : 0.035) / (1 + i * 0.3), 1.6, 1.2); chain(s, tg, a, o);
      for (const x of [s, tr]) { x.start(at); x.stop(at + dur + 0.1); }
    });
  };
  syn.blink = (at, p) => {
    const soft = p && p.soft, o = out(0, 0.5), lp = bq('lowpass', 1400, 3), a = g(0);
    lp.frequency.setValueAtTime(1400, at); lp.frequency.exponentialRampToValueAtTime(180, at + 0.3);
    ad(a.gain, at, 0.02, soft ? 0.3 : 0.7, 0.35); chain(noise(at, 0.5), lp, a, o);
    thump(at + 0.02, 48, 26, 0.7, soft ? 0.45 : 0.9, o);
    burst(at + 0.28, 0.03, 'bandpass', 800, 4, soft ? 0.18 : 0.4, o);
    creak(at + 0.04, 0.5, 18, 30, 420, 950, soft ? 0.12 : 0.25, 0);
  };
  syn.musicBox = (at, midi, v, dur) => {
    const f = mtof(midi), c = osc('sine', f), m = osc('sine', f * 3.5), mi = g(0), a = g(0), h = osc('sine', f * 2), hg = g(0);
    mi.gain.setValueAtTime(f * 2.2, at); mi.gain.setTargetAtTime(0, at, 0.08);
    chain(m, mi, c.frequency);
    ad(a.gain, at, 0.002, v, dur); ad(hg.gain, at, 0.002, v * 0.25, 0.6);
    chain(c, a); chain(h, hg, a);
    for (const x of [c, m, h]) { x.start(at); x.stop(at + dur + 0.3); }
    to(a, syn.s.music); sends(a, 0.6, 0, 0.3);
  };
  syn.braam = (at, root, v, dur) => {
    dur = dur || 3.4;
    const sum = g(1), lp = bq('lowpass', 150, 2.5), a = g(0), sg = g(0), o = g(1);
    lp.frequency.setValueAtTime(140, at); lp.frequency.exponentialRampToValueAtTime(1700, at + 0.28); lp.frequency.exponentialRampToValueAtTime(420, at + dur * 0.8);
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(v, at + 0.05); a.gain.setValueAtTime(v, at + 0.6); a.gain.linearRampToValueAtTime(0, at + dur);
    [[0, -16], [0, 14], [12, -8], [12, 9], [19, 5], [24, -4]].forEach(([iv, det]) => {
      const x = osc('sawtooth', mtof(root + iv), det); x.connect(sum); x.start(at); x.stop(at + dur + 0.1);
    });
    chain(sum, shaper(2.2), lp, a, o);
    const sub = osc('sine', mtof(root)); ahr(sg.gain, at, 0.03, v * 1.1, dur * 0.5, dur * 0.5);
    chain(sub, sg, o); sub.start(at); sub.stop(at + dur + 0.1);
    to(o, syn.s.sfx); sends(o, 0.55, 0, 0);
  };

  /* ---------- beds: ambiences that run for a while (at: start, off: seconds already gone) ---------- */
  const bedGain = (a, at, len, lev, fadeIn, fadeOut, off) => {
    a.gain.setValueAtTime(off ? lev : 0, at); a.gain.linearRampToValueAtTime(lev, at + (off ? 0.05 : fadeIn));
    a.gain.setValueAtTime(lev, at + Math.max(off ? 0.06 : fadeIn + 0.01, len - fadeOut)); a.gain.linearRampToValueAtTime(0, at + len);
  };
  syn.wind = (at, dur, off, p) => {
    const len = dur - off; if (len <= 0.1) return;
    const lev = (p && p.level) || 0.5;
    for (const side of [-0.6, 0.6]) {
      const b = bq('bandpass', 500, 0.9), a = g(0);
      b.frequency.setValueCurveAtTime(smoothCurve(R, 64, Math.max(3, Math.floor(len / 2))).map((v) => 250 + v * 650), at, len);
      const gust = smoothCurve(R, 64, Math.max(3, Math.floor(len / 2.5)));
      a.gain.setValueCurveAtTime(gust.map((v, i) => (0.35 + 0.65 * v) * lev * Math.min(1, (i / 63) * len / (off ? 0.1 : 2.5)) * Math.min(1, (1 - i / 63) * len / 1.5)), at, len);
      chain(noise(at, len, true), b, bq('lowpass', p && p.dark ? 700 : 1400), a, panner(side), syn.s.sfx);
    }
  };
  syn.crickets = (at, dur, off) => {
    const end = at + dur - off;
    for (let v = 0; v < 3; v++) {
      const f = 4300 + v * 300, pn = [-0.7, 0.1, 0.8][v];
      for (let tt = at + R() * 0.8; tt < end - 0.3; tt += 0.55 + R() * 0.7) {
        const s = osc('sine', f), a = g(0), n = 3 + Math.floor(R() * 2), fade = Math.min(1, (end - tt) / 2);
        for (let k = 0; k < n; k++) { const t0 = tt + k * 0.032; a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(0.03 * fade, t0 + 0.004); a.gain.linearRampToValueAtTime(0, t0 + 0.016); }
        chain(s, a, panner(pn), syn.s.sfx); s.start(tt); s.stop(tt + n * 0.032 + 0.02);
      }
    }
  };
  syn.rain = (at, dur, off) => {
    const len = dur - off; if (len <= 0.1) return;
    for (const side of [-0.5, 0.5]) { const a = g(0); bedGain(a, at, len, 0.1, 1, 1.5, off); chain(noise(at, len), bq('highpass', 2200), bq('lowpass', 9000), a, panner(side), syn.s.sfx); }
  };
  syn.swarm = (at, dur, off) => {
    const len = dur - off; if (len <= 0.1) return;
    const f1 = osc('square', 14), f2 = osc('square', 19.3), fd = g(0.25), fg = g(0.5), a = g(0);
    f1.connect(fd); f2.connect(fd); fd.connect(fg.gain); for (const x of [f1, f2]) { x.start(at); x.stop(at + len + 0.05); }
    a.gain.setValueCurveAtTime(smoothCurve(R, 64, 8).map((v, i) => (0.05 + 0.1 * v) * Math.min(1, (1 - i / 63) * len / 1.2)), at, len);
    chain(noise(at, len), bq('bandpass', 3000, 1.8), fg, a, panner(0.1), syn.s.sfx);
    for (let tt = at + R() * 0.3; tt < at + len - 0.1; tt += 0.25 + R() * 0.5) {
      const s = osc('sine', 8000 + R() * 4000), sa = g(0);
      s.frequency.setValueAtTime(s.frequency.value, tt); s.frequency.exponentialRampToValueAtTime(s.frequency.value * 0.75, tt + 0.03);
      ad(sa.gain, tt, 0.002, 0.03, 0.03); chain(s, sa, panner(R() * 2 - 1), syn.s.sfx); s.start(tt); s.stop(tt + 0.06);
    }
  };
  syn.whispers = (at, dur, off) => {
    const len = dur - off; if (len <= 0.1) return;
    for (let v = 0; v < 3; v++) {
      const n = noise(at, len), b1 = bq('bandpass', 900, 7), b2 = bq('bandpass', 2200, 8), a = g(0), pn = panner(0), sum = g(1);
      b1.frequency.setValueCurveAtTime(smoothCurve(R, 128, Math.floor(len * 3)).map((x) => 400 + x * 700), at, len);
      b2.frequency.setValueCurveAtTime(smoothCurve(R, 128, Math.floor(len * 3)).map((x) => 1500 + x * 1400), at, len);
      const syl = new Float32Array(256);
      let ph = R() * 10;
      for (let i = 0; i < 256; i++) { ph += (4 + R() * 3) * len / 256; const w = Math.max(0, Math.sin(ph * 2 * Math.PI)); syl[i] = w * w * (0.5 + 0.5 * Math.sin(i / 256 * Math.PI * (2 + v))) * 0.26 * Math.min(1, i / 30, (255 - i) / 30); }
      a.gain.setValueCurveAtTime(syl, at, len);
      pn.pan.setValueCurveAtTime(curveOf(32, (x) => Math.sin(x * Math.PI * (1 + v) + v * 2) * 0.8), at, len);
      chain(n, b1, sum); chain(n, b2, to(g(0.6), sum));
      chain(sum, a, pn, syn.s.sfx); sends(pn, 0.6, 0, 0);
    }
  };
  syn.rumble = (at, dur, off) => {
    const len = dur - off; if (len <= 0.1) return;
    const a = g(0), sa = g(0), wa = g(0), s = osc('sine', 33);
    bedGain(a, at, len, 0.15, 1.5, 1, off); chain(noise(at, len, true), bq('lowpass', 90, 1), a, out(0, 0.3));
    bedGain(sa, at, len, 0.08, 1, 1, off); chain(s, sa, syn.s.sfx); s.start(at); s.stop(at + len + 0.05);
    wa.gain.setValueCurveAtTime(smoothCurve(R, 64, Math.max(2, Math.floor(len * 1.5))).map((v) => v * v * 0.12), at, len);
    chain(noise(at, len), bq('lowpass', 600), wa, out(0.3, 0.2));
  };
  syn.engine = (at, dur, off) => {
    const len = dur - off; if (len <= 0.1) return;
    // rpm over the chase (bars 72-78): pull away, shift at 74 and 76, flat out into the jump
    const rpm = (bar) => (bar < 74 ? lerp(80, 150, (bar - 72) / 2) : bar < 76 ? lerp(105, 160, (bar - 74) / 2) : lerp(115, 190, Math.min(1, (bar - 76) / 2)));
    const b0 = 72 + off / BAR, b1 = 72 + dur / BAR, fc = curveOf(128, (x) => rpm(lerp(b0, b1, x)));
    const s = osc('sawtooth', 100), s2 = osc('sawtooth', 150), sq = osc('square', 50), lp = bq('lowpass', 900, 1.5), a = g(0), na = g(0);
    s.frequency.setValueCurveAtTime(fc, at, len); s2.frequency.setValueCurveAtTime(fc.map((v) => v * 1.5), at, len); sq.frequency.setValueCurveAtTime(fc.map((v) => v * 0.5), at, len);
    lp.frequency.setValueCurveAtTime(fc.map((v) => v * 9), at, len);
    bedGain(a, at, len, 0.075, 0.4, 0.15, off);
    const src = g(1); to(s, src); chain(s2, to(g(0.35), src)); chain(sq, to(g(0.6), src));
    chain(src, shaper(2.6), lp, a, out(0, 0.08));
    for (const x of [s, s2, sq]) { x.start(at); x.stop(at + len + 0.05); }
    bedGain(na, at, len, 0.05, 0.5, 0.2, off); chain(noise(at, len), bq('bandpass', 300, 1.2), na, syn.s.sfx);
  };
  syn.rush = (at, dur, off) => {
    const len = dur - off; if (len <= 0.1) return;
    const b = bq('bandpass', 500, 0.8), a = g(0);
    b.frequency.setValueCurveAtTime(smoothCurve(R, 32, 4).map((v) => 350 + v * 700), at, len);
    bedGain(a, at, len, 0.25, 0.3, 0.4, off); chain(noise(at, len), b, a, out(0, 0.5));
  };
  syn.birds = (at, dur, off) => {
    const end = at + dur - off;
    for (let v = 0; v < 3; v++) {
      const base = 2800 + v * 900, pn = [-0.6, 0.5, 0.1][v];
      for (let tt = at + 0.3 + R() * 1.2; tt < end - 0.5; tt += 0.9 + R() * 1.8) {
        const n = 2 + Math.floor(R() * 4);
        for (let k = 0; k < n; k++) {
          const t0 = tt + k * (0.09 + R() * 0.05), f0 = base * (0.9 + R() * 0.4), up = R() < 0.5, s = osc('sine', f0), a = g(0);
          s.frequency.setValueAtTime(up ? f0 : f0 * 1.5, t0); s.frequency.exponentialRampToValueAtTime(up ? f0 * 1.6 : f0, t0 + 0.06);
          ad(a.gain, t0, 0.005, 0.026, 0.06); chain(s, a, panner(pn), syn.s.sfx); sends(a, 0.2, 0, 0); s.start(t0); s.stop(t0 + 0.1);
        }
      }
    }
  };
  syn.droneBed = (at, dur, off) => {
    const len = dur - off; if (len <= 0.1) return;
    const lp = bq('lowpass', 220, 1.5), a = g(0);
    bedGain(a, at, len, 0.07, 0.6, 1.5, off);
    [[26, -5], [27, 4], [38, 0]].forEach(([m, d]) => { const s = osc('sawtooth', mtof(m), d); s.connect(lp); s.start(at); s.stop(at + len + 0.05); });
    chain(lp, a, syn.s.sfx); sends(a, 0.4, 0, 0);
  };
  syn.drone = (at, midi, dur, v, off) => {
    const len = dur - off; if (len <= 0.05) return;
    const lp = bq('lowpass', 260, 2), a = g(0);
    bedGain(a, at, len, v, 1.8, 1.2, off);
    lp.frequency.setValueCurveAtTime(curveOf(64, (x) => 200 + 160 * Math.sin((x * len + off) * 0.6) ** 2), at, len);
    [[0, -6, 'sawtooth'], [12, 6, 'sawtooth'], [0, 0, 'sine']].forEach(([iv, det, type]) => {
      const x = osc(type, mtof(midi + iv), det); x.connect(lp); x.start(at); x.stop(at + len + 0.05);
    });
    chain(lp, a, syn.s.music); sends(a, 0.3, 0, 0);
  };
  return syn;
}

/* ================================================================
   The sample bank: drums and repeated effects, rendered once.
   [name, seconds, render(syn, at)]
   ================================================================ */
const SAMPLES = [
  ['kick', 0.45, (y, t) => y.kick(t)], ['heart', 0.4, (y, t) => y.heart(t)], ['snare', 0.45, (y, t) => y.snare(t)],
  ['clap', 0.35, (y, t) => y.clap(t)], ['hat', 0.08, (y, t) => y.hat(t, false)], ['ohat', 0.35, (y, t) => y.hat(t, true)],
  ['shaker', 0.1, (y, t) => y.shaker(t)], ['tomHi', 0.55, (y, t) => y.tom(t, true)], ['tomLo', 0.55, (y, t) => y.tom(t, false)],
  ['timp', 2.0, (y, t) => y.timp(t)], ['crash', 2.2, (y, t) => y.crash(t)],
  ['step0', 0.14, (y, t) => y.step(t)], ['step1', 0.14, (y, t) => y.step(t)], ['step2', 0.14, (y, t) => y.step(t)], ['step3', 0.14, (y, t) => y.step(t)],
  ['run0', 0.12, (y, t) => y.step(t, 1)], ['run1', 0.12, (y, t) => y.step(t, 1)], ['run2', 0.12, (y, t) => y.step(t, 1)],
  ['dirt0', 0.5, (y, t) => y.dirt(t)], ['dirt1', 0.5, (y, t) => y.dirt(t)], ['dirt2', 0.5, (y, t) => y.dirt(t)], ['dirtBig', 0.65, (y, t) => y.dirt(t, 1)],
  ['groan0', 1.9, (y, t) => y.groan(t, 0.75)], ['groan1', 1.9, (y, t) => y.groan(t, 0.85)], ['groan2', 1.9, (y, t) => y.groan(t, 0.95)],
  ['groan3', 1.9, (y, t) => y.groan(t, 1.05)], ['groan4', 1.9, (y, t) => y.groan(t, 1.15)], ['groan5', 1.9, (y, t) => y.groan(t, 1.25)],
  ['shotgun', 1.1, (y, t) => y.shotgun(t)], ['pump', 0.2, (y, t) => y.pump(t)], ['click', 0.06, (y, t) => y.click(t)],
  ['dryFire', 0.08, (y, t) => y.dryFire(t)], ['shells', 0.55, (y, t) => y.shells(t)], ['load', 0.08, (y, t) => y.load(t)],
  ['whack', 0.25, (y, t) => y.whack(t)], ['crank0', 0.24, (y, t) => y.crank(t)], ['crank1', 0.24, (y, t) => y.crank(t)],
  ['slap0', 0.18, (y, t) => y.slap(t)], ['slap1', 0.18, (y, t) => y.slap(t)], ['slap2', 0.18, (y, t) => y.slap(t)],
  ['thud', 0.5, (y, t) => y.thud(t)], ['bodyHit', 0.25, (y, t) => y.bodyHit(t)],
];
const GROAN_PITCH = [0.75, 0.85, 0.95, 1.05, 1.15, 1.25];

async function renderBank(sampleRate) {
  sampleRate = sampleRate || 44100;
  const GAP = 0.05, total = SAMPLES.reduce((a, s) => a + s[1] + GAP, 0.05);
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  const syn = Synth(ctx, 4242);
  const D = ctx.createGain(); D.connect(ctx.destination);
  syn.s = { drums: D, music: D, sfx: D, lead: D };
  let t = 0.02;
  const slots = [];
  for (const [name, dur, fn] of SAMPLES) { fn(syn, t); slots.push([name, t, dur]); t += dur + GAP; }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), Rr = buf.getChannelData(1), bank = { sampleRate, data: {} };
  for (const [name, t0, dur] of slots) {
    const a = Math.floor(t0 * sampleRate), n = Math.floor(dur * sampleRate);
    const l = L.slice(a, a + n), r = Rr.slice(a, a + n);
    for (let i = 0; i < 64; i++) { const k = n - 1 - i, f = i / 64; l[k] *= f; r[k] *= f; }   // no click at the cut
    bank.data[name] = [l, r];
  }
  return bank;
}

/* ================================================================
   The engine: sessions, voices, the event list, scheduling
   ================================================================ */
function Engine(ctx, bank, opts) {
  opts = opts || {};
  const E = this;
  E.ctx = ctx;
  const syn = E.syn = Synth(ctx, 20261123);
  const { g, osc, bq, panner, chain, to, sends } = syn;
  const R = mulberry(777);

  // the bank, as buffers of this context
  const buffers = {};
  for (const name in bank.data) {
    const [l, r] = bank.data[name], b = ctx.createBuffer(2, l.length, bank.sampleRate);
    b.getChannelData(0).set(l); b.getChannelData(1).set(r); buffers[name] = b;
  }

  // master: bus → compressor → soft limiter → volume → out; hall, gated reverb and a delay on the side
  E.bus = g(1);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.25;
  const lim = ctx.createWaveShaper(); lim.curve = limitCurve(); lim.oversample = '2x';
  const pre = g(0.62);
  // keep the subsonic rumble out of the compressor, and take a little off the low end
  const hpf = bq('highpass', 28, 0.7), shelf = bq('lowshelf', 75);
  shelf.gain.value = -3.5;
  E.vol = g(opts.volume === undefined ? 1 : opts.volume);
  chain(E.bus, hpf, shelf, comp, pre, lim, E.vol, ctx.destination);
  const RI = mulberry(99);
  E.hall = ctx.createConvolver(); E.hall.buffer = hallIR(ctx, 3.4, RI); chain(E.hall, to(g(0.5), E.bus));
  E.gated = ctx.createConvolver(); E.gated.buffer = gatedIR(ctx, RI); chain(E.gated, to(g(0.45), E.bus));
  E.delay = ctx.createDelay(2); E.delay.delayTime.value = STEP * 3;
  const dfb = g(0.36), dlp = bq('lowpass', 2600, 0.5);
  chain(E.delay, dlp, dfb, E.delay); chain(dlp, to(g(0.6), E.bus));

  E.newSession = function () {
    const s = { out: to(g(1), E.bus), pools: {} };
    s.pump = to(g(1), s.out);
    s.music = to(g(0.9), s.pump);
    s.lead = to(g(0.7), s.out);
    s.drums = to(g(0.9), s.out);
    s.sfx = to(g(0.9), s.out);
    s.rev = to(g(1), E.hall);
    s.gate = to(g(1), E.gated);
    s.dly = to(g(1), E.delay);
    return s;
  };
  E.killSession = function (s) {
    const now = ctx.currentTime;
    for (const k of ['out', 'rev', 'gate', 'dly']) { s[k].gain.cancelScheduledValues(now); s[k].gain.setTargetAtTime(0, now, 0.02); }
    setTimeout(() => { for (const k of ['out', 'rev', 'gate', 'dly']) { try { s[k].disconnect(); } catch (e) { /* gone */ } } }, 700);
  };
  E.setSession = (s) => { E.s = syn.s = s; };
  E.setSession(E.newSession());

  // play a bank sample
  function play(name, at, v, o) {
    const b = buffers[name]; if (!b) return;
    o = o || {};
    const src = ctx.createBufferSource(); src.buffer = b;
    if (o.rate) src.playbackRate.value = o.rate;
    let node = chain(src, g(v));
    if (o.lp) node = chain(node, bq('lowpass', o.lp, 0.7));
    if (o.pan) node = chain(node, panner(o.pan));
    to(node, o.dest || syn.s.sfx);
    sends(node, o.rev || 0, o.gate || 0, o.dly || 0);
    src.start(at);
  }
  function pump(at, depth, tc) { const p = syn.s.pump.gain; p.setValueAtTime(depth, at); p.setTargetAtTime(1, at + 0.02, tc || 0.075); }
  const DRUM = {
    kick: (at, v) => { play('kick', at, v, { dest: syn.s.drums }); pump(at, 0.45); },
    heart: (at, v) => { play('heart', at, v * 0.7, { dest: syn.s.drums }); pump(at, 0.65, 0.12); },
    snare: (at, v) => play('snare', at, v, { dest: syn.s.drums, rev: 0.12, gate: 0.75 }),
    clap: (at, v) => play('clap', at, v, { dest: syn.s.drums, rev: 0.3, gate: 0.2 }),
    hat: (at, v) => play('hat', at, v, { dest: syn.s.drums }),
    ohat: (at, v) => play('ohat', at, v, { dest: syn.s.drums }),
    shaker: (at, v) => play('shaker', at, v, { dest: syn.s.drums }),
    tomLo: (at, v) => play('tomLo', at, v, { dest: syn.s.drums, rev: 0.15, gate: 0.6 }),
    tomHi: (at, v) => play('tomHi', at, v, { dest: syn.s.drums, rev: 0.15, gate: 0.6 }),
    timp: (at, v) => play('timp', at, v * 0.42, { dest: syn.s.drums, rev: 0.45 }),
  };
  E.crash = (at, v) => play('crash', at, v, { dest: syn.s.drums, rev: 0.35 });

  // persistent voices: a part over a section plays on a small round-robin pool
  function pool(key, at, until, n, make) {
    const s = syn.s;
    let p = s.pools[key];
    if (!p) { p = s.pools[key] = { i: 0, v: [] }; for (let k = 0; k < n; k++) p.v.push(make(at, until, k)); }
    return p.v[p.i++ % n];
  }
  const NYQ = ctx.sampleRate / 2 - 200;
  function ostVoice(at, until, k) {
    const o1 = osc('sawtooth', 200, -6), o2 = osc('square', 200, 8), lp = bq('lowpass', 1000, 3), amp = g(0);
    o1.connect(lp); chain(o2, to(g(0.5), lp)); chain(lp, amp, panner(k ? 0.28 : -0.28), syn.s.music); sends(amp, 0.12, 0, 0.22);
    for (const o of [o1, o2]) { o.start(at); o.stop(until); }
    return (t, midi, v, cut) => {
      const f = mtof(midi);
      o1.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f, t);
      lp.frequency.setValueAtTime(Math.min(cut * 3, NYQ), t); lp.frequency.exponentialRampToValueAtTime(cut, t + 0.07);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(v, t + 0.003); amp.gain.setTargetAtTime(0, t + 0.003, 0.05);
    };
  }
  function bassVoice(at, until) {
    const s1 = osc('sawtooth', 55, -7), s2 = osc('square', 55, 7), sub = osc('sine', 55), lp = bq('lowpass', 700, 4), amp = g(0);
    s1.connect(lp); s2.connect(lp); chain(sub, to(g(0.9), amp)); chain(lp, amp, syn.s.music);
    for (const o of [s1, s2, sub]) { o.start(at); o.stop(until); }
    return (t, midi, len, v, cut) => {
      const f = mtof(midi);
      s1.frequency.setValueAtTime(f, t); s2.frequency.setValueAtTime(f, t); sub.frequency.setValueAtTime(f, t);
      lp.frequency.setValueAtTime(Math.min(cut * 2.6, NYQ), t); lp.frequency.exponentialRampToValueAtTime(cut, t + 0.11);
      const hold = Math.max(0.03, len - 0.05);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(v, t + 0.004); amp.gain.setValueAtTime(v, t + hold); amp.gain.linearRampToValueAtTime(0, t + hold + 0.05);
    };
  }
  function leadVoice(at, until) {
    const lp = bq('lowpass', 600, 1.3), amp = g(0), vib = osc('sine', 5.3), vd = g(0);
    vib.connect(vd);
    const dets = [-10, 0, 10, 0], oscs = [osc('sawtooth', 440, -10), osc('sawtooth', 440, 0), osc('sawtooth', 440, 10), osc('square', 220, 0)];
    oscs.forEach((o, i) => { vd.connect(o.detune); chain(o, to(g(i === 3 ? 0.35 : 0.33), lp)); });
    chain(lp, amp, syn.s.lead); sends(amp, 0.35, 0, 0.2);
    for (const o of oscs.concat([vib])) { o.start(at); o.stop(until); }
    return (t, midi, dur, v, bend) => {
      const f = mtof(midi);
      oscs.forEach((o, i) => {
        o.frequency.setValueAtTime(i === 3 ? f / 2 : f, t); o.detune.setValueAtTime(dets[i], t);
        if (bend) { o.detune.setValueAtTime(dets[i], t + 0.4); o.detune.linearRampToValueAtTime(dets[i] + bend, t + dur); }
      });
      lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(4200, t + 0.05); lp.frequency.setTargetAtTime(2500, t + 0.05, 0.2);
      const hold = Math.max(0.05, dur - 0.04);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(v, t + 0.018); amp.gain.setValueAtTime(v, t + hold); amp.gain.linearRampToValueAtTime(0, t + hold + 0.14);
      vd.gain.setValueAtTime(0, t);
      if (dur > 0.4) { vd.gain.setValueAtTime(0, t + 0.22); vd.gain.linearRampToValueAtTime(16, t + 0.6); }
    };
  }
  function harpVoice(at, until, k) {
    const o1 = osc('sawtooth', 440), o2 = osc('square', 880), hp = bq('highpass', 260), amp = g(0);
    o1.connect(hp); chain(o2, to(g(0.35), hp)); chain(hp, bq('lowpass', 7000), amp, panner([-0.35, 0, 0.35][k % 3]), syn.s.music); sends(amp, 0.25, 0, 0.12);
    for (const o of [o1, o2]) { o.start(at); o.stop(until); }
    return (t, midi, v) => {
      const f = mtof(midi);
      o1.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f * 2, t);
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(v, t + 0.001); amp.gain.setTargetAtTime(0, t + 0.001, 0.09);
    };
  }

  // sections that hold chords: pads, choir, organ. One set of oscillators per section; the
  // notes move at each bar line.
  function chordSection(at, off, a, b, notesOf, build, lev, fadeIn) {
    const t0 = at - off, end = t0 + (b - a) * BAR;
    if (end - at < 0.05) return;
    const amp = g(0);
    amp.gain.setValueAtTime(off > 0 ? lev : 0, at); amp.gain.linearRampToValueAtTime(lev, at + (off > 0 ? 0.05 : fadeIn));
    amp.gain.setValueAtTime(lev, Math.max(at + 0.06, end - 0.25)); amp.gain.linearRampToValueAtTime(0, end + 0.35);
    const voices = build(amp, at, end + 0.4);       // [{set(t, midi, first)}] one per chord note
    let prev = null;
    for (let bar = a; bar < b; bar++) {
      const tb = t0 + (bar - a) * BAR;
      if (tb + BAR <= at) continue;
      const notes = notesOf(bar), key = notes.join();
      if (key === prev) continue;
      const first = prev === null; prev = key;
      voices.forEach((v, i) => v(first ? at : tb, notes[i % notes.length], first));
    }
  }
  E.padSection = (at, off, a, b, lev, bright) => chordSection(at, off, a, b, (bar) => S.chordAt(bar).pad, (amp, start, stop) => {
    const lp = bq('lowpass', bright, 0.8); chain(lp, amp, syn.s.music); sends(amp, 0.45, 0, 0);
    const vs = [];
    for (let i = 0; i < 4; i++) {
      const pair = [-9, 9].map((det) => { const o = osc('sawtooth', 220, det + (i % 2 ? 3 : -3)); chain(o, panner((i / 3 - 0.5) * 0.8 * (det > 0 ? 1 : -1)), lp); o.start(start); o.stop(stop); return o; });
      vs.push((t, m, first) => { for (const o of pair) { if (first) o.frequency.setValueAtTime(mtof(m), t); else o.frequency.setTargetAtTime(mtof(m), t, 0.025); } });
    }
    return vs;
  }, lev * 0.15, 0.4);
  E.choirSection = (at, off, a, b, vowel, lev) => chordSection(at, off, a, b, (bar) => S.chordAt(bar).pad.slice(1).map((m) => m + 12), (amp, start, stop) => {
    const src = g(1), vib = osc('sine', 4.8), vd = g(14);
    chain(vib, vd); vib.start(start); vib.stop(stop);
    chain(syn.formants(vowel, src), amp, syn.s.music); sends(amp, 0.7, 0, 0);
    const vs = [];
    for (let i = 0; i < 3; i++) {
      const trio = [-11, 0, 12].map((det) => { const o = osc('sawtooth', 220, det); vd.connect(o.detune); chain(o, to(g(0.4), src)); o.start(start); o.stop(stop); return o; });
      vs.push((t, m, first) => { for (const o of trio) { if (first) o.frequency.setValueAtTime(mtof(m), t); else o.frequency.setTargetAtTime(mtof(m), t, 0.06); } });
    }
    return vs;
  }, lev * 0.16, 0.7);
  E.organSection = (at, off, a, b, lev) => chordSection(at, off, a, b, (bar) => S.chordAt(bar).pad.slice(1), (amp, start, stop) => {
    const sum = g(1), trem = osc('sine', 5.8), td = g(0.18), tg = g(0.82);
    chain(trem, td, tg.gain); trem.start(start); trem.stop(stop);
    chain(sum, syn.shaper(1.6), tg, amp, syn.s.music); sends(amp, 0.5, 0, 0);
    const vs = [];
    for (let i = 0; i < 3; i++) {
      const parts = [[1, 1], [2, 0.55], [3, 0.35], [4, 0.22], [8, 0.08]].map(([r, amp2]) => { const o = osc('sine', 220 * r); chain(o, to(g(amp2 * 0.25), sum)); o.start(start); o.stop(stop); return [o, r]; });
      vs.push((t, m) => { for (const [o, r] of parts) o.frequency.setValueAtTime(mtof(m) * r, t); });
    }
    return vs;
  }, lev, 0.08);

  /* ---------------- the event list ---------------- */
  const events = [];
  let TAG = '';
  const add = (bar, fn, bed, durBars) => { if (!opts.only || opts.only.includes(TAG)) events.push({ t: bar * BAR, d: (durBars || 0) * BAR, fn, bed: !!bed, tag: TAG }); };
  const vel = { X: 1, x: 0.75, o: 0.42, h: 0.2 };
  const T = (bar) => E.t0 + bar * BAR;   // ctx time of a bar (valid once the timeline has started)

  // drums
  TAG = 'drums';
  const kitAt = (bar) => { for (const [a, b, k] of S.DRUM_SECTIONS) if (bar >= a && bar < b) return S.KITS[k]; return null; };
  for (let bar = 0; bar < S.BARS; bar++) {
    const kit = Object.assign({}, kitAt(bar) || {}, S.DRUM_BARS[bar] || {});
    for (const inst in kit) {
      const pat = kit[inst], fn = DRUM[inst];
      for (let i = 0; i < pat.length; i++) { const v = vel[pat[i]]; if (v) add(bar + i / 16, (at) => fn(at, v)); }
    }
  }
  for (const b of S.CRASH) add(b, (at) => E.crash(at, 0.85));

  // bass
  TAG = 'bass';
  const BASS_TRIM = 0.21;
  S.BASS.forEach(([a, b, style, lev], si) => {
    if (style === 'drone') { add(a, (at, off) => syn.drone(at, 26, (b - a) * BAR, 0.045 * lev, off || 0), true, b - a); return; }
    const key = 'bass' + si, until = () => T(b + 0.6);
    const note = (bar, m, len, v, cut) => add(bar, (at) => pool(key, at, until(), 2, bassVoice)(at, m, len, v * BASS_TRIM * lev, cut));
    for (let bar = Math.floor(a); bar < b; bar++) {
      const r = S.chordAt(bar).bass;
      if (style === 'long' || style === 'sub') { note(bar, r, BAR * 0.98, style === 'sub' ? 0.26 : 0.32, style === 'sub' ? 260 : 420); continue; }
      for (let st = 0; st < 16; st++) {
        const x = st / 16; if (bar + x >= b) continue;
        if (style === 'eighths' && st % 2 === 0) note(bar + x, r, STEP * 1.6, st % 4 ? 0.22 : 0.3, 500);
        else if (style === 'drive' && st % 2 === 0) note(bar + x, st === 14 ? r + 12 : r, STEP * 1.5, st % 4 ? 0.26 : 0.34, 900);
        else if (style === 'tribal' && [0, 3, 6, 10].includes(st)) note(bar + x, r, STEP * 2.5, 0.34, 500);
        else if (style === 'gallop' && st % 4 !== 1) note(bar + x, r, STEP * 0.9, st % 4 === 0 ? 0.34 : 0.25, 1100);
        else if (style === 'octaves' && st % 2 === 0) note(bar + x, st % 4 ? r + 12 : r, STEP * 1.5, 0.3, 1000);
        else if (style === 'riff') {
          const rf = { 0: [0, 2.5], 3: [0, 1], 4: [0, 1], 6: [12, 1.5], 8: [0, 2.5], 11: [0, 1], 12: [1, 1.5], 14: [0, 1.5] }[st];
          if (rf) note(bar + x, r + rf[0], STEP * rf[1], 0.36, 1300);
        }
      }
    }
  });
  // pads, choir, organ
  TAG = 'pad';
  for (const [a, b, lev, bright] of S.PADS) add(a, (at, off) => E.padSection(at, off || 0, a, b, lev, bright), true, b - a);
  TAG = 'choir';
  for (const [a, b, vowel, lev] of S.CHOIR) add(a, (at, off) => E.choirSection(at, off || 0, a, b, vowel, lev), true, b - a);
  TAG = 'chapel';
  for (const [a, b] of S.ORGAN) add(a, (at, off) => E.organSection(at, off || 0, a, b, 0.1), true, b - a);
  const HARP = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0, 1, 2, 3];
  S.HARPSI.forEach(([a, b], hi) => {
    for (let bar = a; bar < b; bar++) {
      const c = S.chordAt(bar).cell, tones = [c[0], c[1], c[2]];
      for (let st = 0; st < 16; st++) {
        const k = HARP[st], m = tones[k % 3] + 12 * Math.floor(k / 3);
        add(bar + st / 16, (at) => pool('harp' + hi, at, T(b + 0.5), 3, harpVoice)(at, m, 0.032));
      }
    }
  });
  // the ostinato: a five-note cell over a 16-step bar, so its accent drifts and lines up again every five bars
  TAG = 'ost';
  S.OSTINATO.forEach(([a, b, shift, c0, c1, lev], oi) => {
    for (let st = Math.round(a * 16); st < Math.round(b * 16); st++) {
      const bar = st / 16, idx = st % 5, m = S.chordAt(bar).cell[idx] + shift;
      const cut = lerp(c0, c1, (bar - a) / (b - a)), v = lev * (idx === 0 ? 0.62 : 0.42) * (st % 4 === 0 ? 1.1 : 1);
      add(bar, (at) => pool('ost' + oi, at, T(b + 0.5), 2, ostVoice)(at, m, v, cut));
    }
  });
  // the theme, "...Right?", the music box
  TAG = 'lead';
  S.LEAD.forEach((L, li) => {
    const last = Math.max(...L.notes.filter((n) => n[0] >= L.from && n[0] < L.to).map((n) => n[0] + n[2]));
    for (const [beat, m, len] of L.notes) {
      if (beat < L.from || beat >= L.to) continue;
      add(L.at + beat / 4, (at) => pool('lead' + li, at, T(L.at + last / 4 + 0.5), 2, leadVoice)(at, m + L.shift, len * BEAT, 0.24));
    }
  });
  for (const [bar, m, len] of S.RIGHT_NOTES) add(bar, (at) => pool('right', at, T(92), 2, leadVoice)(at, m, len * BEAT, 0.2, len > 2 ? 45 : 0));
  TAG = 'mbox';
  for (const [bar, m, len] of S.MUSIC_BOX) add(bar, (at) => syn.musicBox(at, m, 0.065, (len || 1) * BEAT + 1.5));

  // feet: walking to the cemetery, into it, running
  TAG = 'steps';
  let sk = 0;
  const step = (bar, v, p, run) => { const k = sk++; add(bar, (at) => play((run ? 'run' : 'step') + (k % (run ? 3 : 4)), at, v, { pan: p, rev: 0.05 })); };
  for (let b = 0.5; b < 7.9; b += 0.25) { if (b >= 4 && b < 4.75) continue; step(b, 0.8, -0.2); step(b + 0.125, 0.65, 0.25); }
  for (let b = 8; b < 10; b += 0.25) step(b, 0.6, 0);
  for (const [a, z] of [[28, 31.9], [38, 39.9], [46, 47.5]]) for (let b = a; b < z; b += 0.125) step(b, 0.7, (Math.round(b * 8) % 2) ? 0.3 : -0.3, true);

  // the shotgun, the bat, the sky, the car
  TAG = 'gun';
  for (const [b, dir] of S.GUNSHOTS) { add(b, (at) => play('shotgun', at, 0.95, { pan: dir * 0.35, rev: 0.4 })); add(b + 0.125, (at) => play('pump', at, 0.9, { pan: 0.15, rev: 0.12 })); }
  for (const [b] of S.WHACKS) add(b, (at) => play('whack', at, 1, { pan: -0.25, rev: 0.2 }));
  TAG = 'sky';
  for (const b of S.LIGHTNING) add(b, (at) => syn.thunder(at, { pan: (b * 7 % 2) - 1 }));
  TAG = 'car';
  S.CRANKS.forEach((b, i) => add(b, (at) => play('crank' + (i % 2), at, 0.5, { rev: 0.1 })));
  S.SLAPS.forEach((b, i) => add(b, (at) => play('slap' + (i % 3), at, 0.9, { pan: i % 2 ? 0.6 : -0.6, rev: 0.2 })));

  // beds and one-off hits
  TAG = 'beds';
  const BEDFN = { wind: syn.wind, crickets: syn.crickets, rain: syn.rain, swarm: syn.swarm, whispers: syn.whispers, rumble: syn.rumble, engine: syn.engine, rush: syn.rush, birds: syn.birds, drone: syn.droneBed };
  for (const [a, b, name, p] of S.BEDS) { const len = (b - a) * BAR; add(a, (at, off) => BEDFN[name](at, len, off || 0, p), true, b - a); }
  // the slow-motion heartbeat under the jump
  for (const b of [78, 78.5, 79, 79.5]) add(b, (at) => DRUM.heart(at, 0.95));
  TAG = 'hits';
  let dk = 0;
  const groan = (at, p) => {
    p = p || {};
    const pitch = p.pitch || 1, i = clamp(Math.round((pitch - 0.75) / 0.1), 0, 5);
    play('groan' + i, at, (p.close ? 1.5 : 1) * (p.far ? 0.5 : 1), { rate: pitch / GROAN_PITCH[i], pan: p.pan || 0, lp: p.far ? 900 : 0, rev: p.far ? 0.6 : 0.25 });
  };
  const HITFN = {
    dirt: (at, p) => play(p && p.big ? 'dirtBig' : 'dirt' + (dk++ % 3), at, p && p.big ? 1 : 0.75, { pan: (p && p.pan) || 0, rev: 0.25 }),
    groan,
    groanCrowd: (at) => { for (let k = 0; k < 6; k++) groan(at + R() * 0.9, { pan: R() * 1.6 - 0.8, pitch: 0.7 + R() * 0.55, far: 1 }); },
    pump: (at) => play('pump', at, 0.9, { pan: 0.15, rev: 0.12 }),
    click: (at) => play('click', at, 1, { pan: -0.2 }),
    dryFire: (at) => play('dryFire', at, 1, { pan: 0.15, rev: 0.2 }),
    shells: (at) => play('shells', at, 1, { pan: -0.1, rev: 0.25 }),
    load: (at) => play('load', at, 1, { pan: 0.1, rev: 0.1 }),
    thud: (at) => play('thud', at, 1, { rev: 0.3 }),
    bodyHit: (at, p) => play('bodyHit', at, 1, { pan: (p && p.pan) || 0.2, rev: 0.25 }),
    braam: (at, p) => syn.braam(at, p.root, 0.17),
    sting: (at) => {
      syn.braam(at, 26, 0.36, 5.5); syn.braam(at, 27, 0.22, 5.5);
      DRUM.timp(at, 1); E.crash(at, 1);
      const cs = g(0); cs.gain.setValueAtTime(0, at); cs.gain.linearRampToValueAtTime(0.03, at + 0.5); cs.gain.setValueAtTime(0.03, at + 3); cs.gain.linearRampToValueAtTime(0, at + 5);
      const src = g(1), vib = osc('sine', 6.5), vd = g(25); chain(vib, vd); vib.start(at); vib.stop(at + 5.2);
      [62, 63, 69, 70, 86, 87].forEach((m, i) => { const o = osc('sawtooth', mtof(m), (i % 2 ? 9 : -9)); vd.connect(o.detune); chain(o, to(g(i > 3 ? 0.5 : 1), src)); o.start(at); o.stop(at + 5.2); });
      chain(syn.formants('a', src), cs, syn.s.music); sends(cs, 0.7, 0, 0);
    },
    launch: (at) => { syn.launch(at); E.crash(at, 1); },
    landing: (at) => { syn.landing(at); E.crash(at, 1); play('thud', at + 0.05, 0.8, { rev: 0.3 }); },
  };
  for (const [b, name, p] of S.HITS) {
    const fn = HITFN[name] || syn[name];
    if (!fn) { console.warn('no sound for ' + name); continue; }
    add(b, (at) => fn(at, p));
  }
  events.sort((a, b) => a.t - b.t);
  E.events = events;

  /* ---------------- scheduling ---------------- */
  E.t0 = 0;       // ctx time of timeline 0
  E.next = 0;     // index of the next event to schedule
  E.timeline = (ctxTime) => ctxTime - E.t0;
  E.scheduleUntil = function (until) {
    while (E.next < events.length && events[E.next].t < until) {
      const ev = events[E.next++];
      try { ev.fn(E.t0 + ev.t, 0); } catch (e) { console.error(e); }
    }
  };
  // start the timeline at `from` seconds, `lead` seconds from now; beds already running join in
  E.startAt = function (from, lead) {
    const now = ctx.currentTime + (lead === undefined ? 0.06 : lead);
    E.t0 = now - from;
    E.next = 0;
    while (E.next < events.length && events[E.next].t < from - 1e-6) {
      const ev = events[E.next++];
      if (ev.bed && ev.t + ev.d > from + 0.1) { try { ev.fn(now, from - ev.t); } catch (e) { console.error(e); } }
    }
  };
}

/* ---------------- the bank, rendered once per page ---------------- */
let bankPromise = null;
function prepare() {
  if (!bankPromise) bankPromise = renderBank(44100).catch((e) => { bankPromise = null; throw e; });
  return bankPromise;
}

/* ---------------- live player ---------------- */
function Live(bank, opts) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC({ latencyHint: 'playback' });
  const E = new Engine(ctx, bank, opts);
  let timer = null, playing = false;
  const look = () => (document.hidden ? 3 : 1.2);
  const tick = () => { if (playing) E.scheduleUntil(E.timeline(ctx.currentTime) + look()); };
  const startTimer = () => { clearInterval(timer); timer = setInterval(tick, 100); };
  return {
    ctx, engine: E,
    async play(from) {
      if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* blocked */ } }
      E.killSession(E.s); E.setSession(E.newSession());
      E.startAt(from || 0, 0.1);
      playing = true; tick(); startTimer();
    },
    async pause() { playing = false; clearInterval(timer); try { await ctx.suspend(); } catch (e) { /* ignore */ } },
    async resume() { try { await ctx.resume(); } catch (e) { /* ignore */ } playing = true; tick(); startTimer(); },
    stop() { playing = false; clearInterval(timer); E.killSession(E.s); E.setSession(E.newSession()); },
    time() { return E.timeline(ctx.currentTime); },
    latency() { return (ctx.outputLatency || 0) + (ctx.baseLatency || 0); },
    setVolume(v) { E.vol.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    state() { return ctx.state; },
    close() { playing = false; clearInterval(timer); try { ctx.close(); } catch (e) { /* ignore */ } },
  };
}

/* ---------------- offline render (for the checks) ---------------- */
async function renderOffline(from, to, sampleRate, only) {
  sampleRate = sampleRate || 44100;
  const bank = await prepare();
  const ctx = new OfflineAudioContext(2, Math.ceil((to - from) * sampleRate), sampleRate);
  const E = new Engine(ctx, bank, { only });
  E.startAt(from, 0);
  const SL = 5;
  E.scheduleUntil(from + SL + 1);
  for (let k = 1; k * SL < to - from; k++) {
    const at = k * SL;
    ctx.suspend(at).then(() => { E.scheduleUntil(from + at + SL + 1); ctx.resume(); });
  }
  return ctx.startRendering();
}

window.WWS.Audio = { prepare, Live, renderOffline, SAMPLES };
})();
