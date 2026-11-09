/* Cats on Mars: the synthesizer.
   Renders the whole song from song.js into two Float32Arrays, block by block, so a browser
   can spread the work over several frames ("precalc") and Node can render it in one go.
   Everything is synthesized: drums, bass, pads, chip arpeggios, FM bells, wind, purring,
   and a formant-synthesis singer (a cascade of resonators driven by a glottal buzz, with
   noise for the consonants), which also writes a lip-sync track for the visuals. */
(function (G) {
  'use strict';
  const CM = G.CM;
  const S = CM.song;
  const SR = S.SR;
  const TAU = Math.PI * 2;
  const BLOCK = 4096;

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  // fast deterministic white noise in [-1, 1)
  let nseed = 0x9E3779B9 | 0;
  function noise() {
    nseed ^= nseed << 13; nseed ^= nseed >>> 17; nseed ^= nseed << 5;
    return (nseed | 0) / 2147483648;
  }

  function blep(t, dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }

  // Chamberlin state-variable filter
  function svf() { return { lo: 0, bp: 0 }; }
  function svfLP(f, x, fc, q) {
    const k = 2 * Math.sin(Math.PI * Math.min(fc, 9000) / SR);
    f.lo += k * f.bp;
    const hp = x - f.lo - q * f.bp;
    f.bp += k * hp;
    return f.lo;
  }
  function svfBP(f, x, fc, q) {
    const k = 2 * Math.sin(Math.PI * Math.min(fc, 9000) / SR);
    f.lo += k * f.bp;
    const hp = x - f.lo - q * f.bp;
    f.bp += k * hp;
    return f.bp;
  }

  const TMP = new Float32Array(BLOCK), TMPR = new Float32Array(BLOCK);

  // ------------------------------------------------------------------ voices
  class Voice {
    constructor(t0, t1, o) {
      o = o || {};
      this.t0 = t0;
      this.s0 = Math.max(0, Math.floor(t0 * SR));
      this.s1 = Math.ceil(t1 * SR);
      this.gain = o.gain === undefined ? 1 : o.gain;
      this.rev = o.rev || 0;
      this.dly = o.dly || 0;
      this.duck = !!o.duck;
      this.stereo = false;
      this.pan(o.pan || 0);
    }
    pan(p) { const a = (clamp(p, -1, 1) + 1) * Math.PI / 4; this.gl = Math.cos(a); this.gr = Math.sin(a); }
    render(bus, b0, b1) {
      const i0 = Math.max(this.s0, b0), i1 = Math.min(this.s1, b1);
      if (i1 <= i0) return;
      const n = i1 - i0, off = i0 - b0, g = this.gain;
      this.gen(TMP, n, i0 - this.s0);
      // 5 ms fade at the very end so no voice stops with a click
      const fadeFrom = this.s1 - 220;
      if (i1 > fadeFrom) {
        for (let i = Math.max(i0, fadeFrom); i < i1; i++) {
          const k = (this.s1 - i) / 220, j = i - i0;
          TMP[j] *= k;
          if (this.stereo) TMPR[j] *= k;
        }
      }
      const L = this.duck ? bus.dL : bus.L, R = this.duck ? bus.dR : bus.R;
      const rs = this.rev * g, ds = this.dly * g, rv = bus.rev, dl = bus.dly;
      if (this.stereo) {
        for (let k = 0; k < n; k++) {
          const a = TMP[k] * g, b = TMPR[k] * g, j = off + k;
          L[j] += a; R[j] += b;
          const m = (TMP[k] + TMPR[k]) * 0.5;
          if (rs) rv[j] += m * rs;
          if (ds) dl[j] += m * ds;
        }
      } else {
        const gl = this.gl * g, gr = this.gr * g;
        for (let k = 0; k < n; k++) {
          const s = TMP[k], j = off + k;
          L[j] += s * gl; R[j] += s * gr;
          if (rs) rv[j] += s * rs;
          if (ds) dl[j] += s * ds;
        }
      }
    }
  }

  class Kick extends Voice {
    constructor(e) { super(e.t, e.t + 0.5, { gain: 0.6 * e.v, rev: 0.02 }); this.ph = 0; }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        this.ph += (46 + 120 * Math.exp(-t * 26) + 260 * Math.exp(-t * 160)) / SR;
        const env = Math.min(1, t * 600) * Math.exp(-t * 5.4);
        const s = Math.sin(TAU * this.ph) * env + noise() * Math.exp(-t * 380) * 0.22;
        buf[k] = Math.tanh(s * 1.5);
      }
    }
  }

  class Snare extends Voice {
    constructor(e) { super(e.t, e.t + 0.45, { gain: 0.25 * e.v, rev: 0.24, pan: 0.05 }); this.p1 = 0; this.p2 = 0; this.lp = 0; this.lp2 = 0; }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        this.p1 += (180 + 50 * Math.exp(-t * 45)) / SR;
        this.p2 += 331 / SR;
        const tone = Math.sin(TAU * this.p1) * Math.exp(-t * 22) * 0.55 + Math.sin(TAU * this.p2) * Math.exp(-t * 32) * 0.22;
        const w = noise();
        this.lp += (w - this.lp) * 0.35;
        this.lp2 += (this.lp - this.lp2) * 0.08;
        const nz = (this.lp - this.lp2) * 1.6;
        buf[k] = tone + nz * Math.exp(-t * 13) * 0.8;
      }
    }
  }

  class Clap extends Voice {
    constructor(e) { super(e.t, e.t + 0.4, { gain: 0.22 * e.v, rev: 0.3, pan: -0.08 }); this.f = svf(); }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        let env = 0;
        for (let b = 0; b < 3; b++) { const tb = t - b * 0.0105; if (tb >= 0) env += Math.exp(-tb * 320); }
        if (t > 0.026) env += Math.exp(-(t - 0.026) * 17) * 0.55;
        buf[k] = svfBP(this.f, noise(), 1250, 0.9) * env * 1.6;
      }
    }
  }

  const HATF = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0].map(f => f * 1.65);
  class Hat extends Voice {
    constructor(e, open) {
      super(e.t, e.t + (open ? 0.5 : 0.12), { gain: (open ? 0.1 : 0.12) * e.v, rev: 0.05, pan: 0.28 });
      this.open = open; this.ph = new Float64Array(6); this.a = 0; this.b = 0;
    }
    gen(buf, n, l0) {
      const dec = this.open ? 8.5 : 65;
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        let m = 0;
        for (let i = 0; i < 6; i++) { this.ph[i] += HATF[i] / SR; if (this.ph[i] >= 1) this.ph[i] -= 1; m += this.ph[i] < 0.5 ? 1 : -1; }
        const x = m * 0.12 + noise() * 0.6;
        this.a += (x - this.a) * 0.6;
        const h1 = x - this.a;
        this.b += (h1 - this.b) * 0.6;
        buf[k] = (h1 - this.b) * Math.exp(-t * dec) * Math.min(1, t * 2000);
      }
    }
  }

  class Crash extends Voice {
    constructor(e) { super(e.t, e.t + 2.6, { gain: 0.11 * e.v, rev: 0.18 }); this.stereo = true; this.a = 0; this.b = 0; this.ph = new Float64Array(6); }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        let m = 0;
        for (let i = 0; i < 6; i++) { this.ph[i] += HATF[i] * 1.31 / SR; if (this.ph[i] >= 1) this.ph[i] -= 1; m += this.ph[i] < 0.5 ? 1 : -1; }
        const env = Math.exp(-t * 1.7) * Math.min(1, t * 900);
        const x1 = noise() + m * 0.08, x2 = noise() + m * 0.08;
        this.a += (x1 - this.a) * 0.45; this.b += (x2 - this.b) * 0.45;
        buf[k] = (x1 - this.a) * env; TMPR[k] = (x2 - this.b) * env;
      }
    }
  }

  class Bass extends Voice {
    constructor(e) {
      super(e.t, e.t + e.d + 0.06, { gain: 0.62 * e.v, duck: true });
      this.f = mtof(e.n); this.d = e.d; this.ph = 0; this.flt = svf(); this.cut = e.cut; this.vel = e.v;
    }
    gen(buf, n, l0) {
      const dt = this.f / SR;
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        this.ph += dt; if (this.ph >= 1) this.ph -= 1;
        const saw = 2 * this.ph - 1 - blep(this.ph, dt);
        const sq = (this.ph < 0.5 ? 1 : -1);
        const x = saw * 0.75 + sq * 0.3;
        const fc = this.cut + 1700 * this.vel * Math.exp(-t * 13);
        const y = svfLP(this.flt, x, fc, 0.55);
        const env = Math.min(1, t * 250) * (t > this.d ? Math.exp(-(t - this.d) * 60) : 1);
        buf[k] = y * env;
      }
    }
  }

  class Pad extends Voice {
    constructor(e) {
      super(e.t, e.t + e.d + 1.0, { gain: 0.16 * e.v, duck: true, rev: 0.32 });
      this.stereo = true; this.d = e.d; this.cut = e.cut;
      this.osc = [];
      e.notes.forEach((m, i) => {
        for (const dc of [-0.07, 0.07]) this.osc.push({ f: mtof(m + dc), ph: (i * 0.37 + dc * 3 + 1) % 1, pan: dc > 0 ? 0.8 : 0.2 });
      });
      this.fl = svf(); this.fr = svf();
    }
    gen(buf, n, l0) {
      const o = this.osc, no = o.length;
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        let l = 0, r = 0;
        for (let i = 0; i < no; i++) {
          const v = o[i], dt = v.f / SR;
          v.ph += dt; if (v.ph >= 1) v.ph -= 1;
          const s = 2 * v.ph - 1 - blep(v.ph, dt);
          l += s * (1 - v.pan); r += s * v.pan;
        }
        const att = Math.min(1, t / 0.35);
        const rel = t > this.d ? Math.exp(-(t - this.d) * 4.5) : 1;
        const fc = this.cut * (1 + 0.25 * Math.sin(TAU * 0.13 * (this.t0 + t)));
        const env = att * att * rel;
        buf[k] = svfLP(this.fl, l, fc, 0.7) * env;
        TMPR[k] = svfLP(this.fr, r, fc * 1.03, 0.7) * env;
      }
    }
  }

  class Pluck extends Voice {   // chip arpeggio note: band-limited 25% pulse
    constructor(e) {
      super(e.t, e.t + e.d + 0.05, { gain: 0.22 * e.v, duck: true, pan: e.pan, dly: 0.22, rev: 0.12 });
      this.f = mtof(e.n); this.ph = 0; this.flt = svf(); this.d = e.d;
    }
    gen(buf, n, l0) {
      const dt = this.f / SR;
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        this.ph += dt; if (this.ph >= 1) this.ph -= 1;
        let p2 = this.ph + 0.75; if (p2 >= 1) p2 -= 1;
        const pulse = (2 * this.ph - 1 - blep(this.ph, dt)) - (2 * p2 - 1 - blep(p2, dt));
        const y = svfLP(this.flt, pulse, 900 + 4000 * Math.exp(-t * 18), 0.8);
        buf[k] = y * Math.min(1, t * 400) * Math.exp(-t * 11) * (t > this.d ? Math.exp(-(t - this.d) * 80) : 1);
      }
    }
  }

  class Chip extends Voice {    // tracker arpeggio: the chord cycles at 50 Hz
    constructor(e) {
      super(e.t, e.t + e.d + 0.04, { gain: 0.12 * e.v, duck: true, pan: 0.32, rev: 0.15, dly: 0.12 });
      this.fs = e.notes.map(mtof); this.ph = 0; this.d = e.d;
    }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        const f = this.fs[Math.floor(t * 50) % this.fs.length], dt = f / SR;
        this.ph += dt; if (this.ph >= 1) this.ph -= 1;
        let p2 = this.ph + 0.5; if (p2 >= 1) p2 -= 1;
        const sq = (2 * this.ph - 1 - blep(this.ph, dt)) - (2 * p2 - 1 - blep(p2, dt));
        const env = Math.min(1, t * 300) * (0.65 + 0.35 * Math.exp(-t * 12)) * (t > this.d ? Math.exp(-(t - this.d) * 90) : 1);
        buf[k] = sq * env;
      }
    }
  }

  class Lead extends Voice {    // square lead with portamento and delayed vibrato
    constructor(p) {
      const a = p.notes[0], z = p.notes[p.notes.length - 1];
      super(a.t - 0.01, z.t + z.d + 0.15, { gain: 0.2 * p.v, duck: true, dly: 0.34, rev: 0.22, pan: -0.1 });
      this.notes = p.notes; this.ni = 0; this.lm = a.n; this.ph = 0; this.flt = svf(); this.amp = 0;
    }
    gen(buf, n, l0) {
      const N = this.notes;
      for (let k = 0; k < n; k++) {
        const t = this.t0 + (l0 + k) / SR;
        while (this.ni < N.length - 1 && t >= N[this.ni + 1].t - 0.005) this.ni++;
        const nt = N[this.ni];
        const on = t >= nt.t && t < nt.t + nt.d;
        this.lm += (nt.n - this.lm) * 0.0016;
        const vib = 0.18 * clamp((t - nt.t - 0.18) / 0.3, 0, 1) * Math.sin(TAU * 5.6 * t);
        const dt = mtof(this.lm + vib) / SR;
        this.ph += dt; if (this.ph >= 1) this.ph -= 1;
        let p2 = this.ph + 0.5; if (p2 >= 1) p2 -= 1;
        const saw = 2 * this.ph - 1 - blep(this.ph, dt);
        const sq = saw - (2 * p2 - 1 - blep(p2, dt));
        this.amp += ((on ? 1 : 0) - this.amp) * (on ? 0.01 : 0.002);
        buf[k] = svfLP(this.flt, sq * 0.8 + saw * 0.25, 2600, 0.9) * this.amp;
      }
    }
  }

  class Bell extends Voice {    // two-operator FM
    constructor(e) { super(e.t, e.t + 2.6, { gain: 0.18 * e.v, rev: 0.5, dly: 0.2, pan: e.pan }); this.fc = mtof(e.n); this.pc = 0; this.pm = 0; }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        this.pm += this.fc * 3.5 / SR; this.pc += this.fc / SR;
        const idx = 2.8 * Math.exp(-t * 3.2);
        buf[k] = Math.sin(TAU * this.pc + idx * Math.sin(TAU * this.pm)) * Math.exp(-t * 2.3) * Math.min(1, t * 1500);
      }
    }
  }

  class Wind extends Voice {
    constructor(e) {
      super(e.t, e.t + e.d, { gain: 0.13 * e.v, rev: 0.15 });
      this.stereo = true; this.d = e.d; this.fi = e.fadeIn || 1; this.fo = e.fadeOut || 1; this.a = svf(); this.b = svf();
    }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR, T0 = this.t0 + t;
        const fade = Math.min(1, t / this.fi, (this.d - t) / this.fo);
        const gust = 0.55 + 0.45 * Math.sin(TAU * 0.13 * T0) * Math.sin(TAU * 0.071 * T0 + 1);
        const f1 = 420 + 260 * Math.sin(TAU * 0.07 * T0), f2 = 470 + 280 * Math.sin(TAU * 0.09 * T0 + 2);
        const g = Math.max(0, fade) * gust * 2.2;
        buf[k] = svfBP(this.a, noise(), f1, 0.22) * g;
        TMPR[k] = svfBP(this.b, noise(), f2, 0.22) * g;
      }
    }
  }

  class Riser extends Voice {
    constructor(e) { super(e.t, e.t + e.d, { gain: 0.16 * e.v, rev: 0.35 }); this.d = e.d; this.f = svf(); this.ph = 0; }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR, u = t / this.d;
        const fc = 300 * Math.pow(25, u);
        const nz = svfBP(this.f, noise(), fc, 0.5);
        this.ph += 110 * Math.pow(2, u * 2) / SR; if (this.ph >= 1) this.ph -= 1;
        buf[k] = (nz * 1.2 + (2 * this.ph - 1) * 0.08 * u) * u * u * Math.min(1, (this.d - t) * 40);
      }
    }
  }

  class RevCym extends Voice {
    constructor(e) { super(e.t, e.t + e.d, { gain: 0.15 * e.v, rev: 0.1 }); this.d = e.d; this.a = 0; this.stereo = true; this.b = 0; }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR, u = t / this.d;
        const env = u * u * u * Math.min(1, (this.d - t) * 200);
        const x1 = noise(), x2 = noise();
        this.a += (x1 - this.a) * 0.5; this.b += (x2 - this.b) * 0.5;
        buf[k] = (x1 - this.a) * env; TMPR[k] = (x2 - this.b) * env;
      }
    }
  }

  class Impact extends Voice {
    constructor(e) { super(e.t, e.t + 2.2, { gain: 0.5 * e.v, rev: 0.35 }); this.ph = 0; this.lp = 0; }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        this.ph += (28 + 70 * Math.exp(-t * 7)) / SR;
        this.lp += (noise() - this.lp) * 0.05;
        buf[k] = Math.sin(TAU * this.ph) * Math.exp(-t * 2.4) * Math.min(1, t * 400) + this.lp * Math.exp(-t * 9) * 1.5;
      }
    }
  }

  class Morse extends Voice {
    constructor(e) {
      super(e.t, e.t + e.d, { gain: 0.11, rev: 0.25, dly: 0.25, pan: 0.15 });
      this.g = e.gates.map(([a, b]) => [a - e.t, b - e.t]); this.gi = 0; this.ph = 0; this.amp = 0; this.lp = 0;
    }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        while (this.gi < this.g.length - 1 && t >= this.g[this.gi][1]) this.gi++;
        const [a, b] = this.g[this.gi];
        const on = t >= a && t < b ? 1 : 0;
        this.amp += (on - this.amp) * 0.02;
        this.ph += 760 / SR;
        const s = Math.sin(TAU * this.ph) * this.amp;
        this.lp += (s - this.lp) * 0.3;
        buf[k] = Math.tanh(this.lp * 2.5) + noise() * 0.03 * this.amp;
      }
    }
  }

  class Purr extends Voice {
    constructor(e) { super(e.t, e.t + e.d, { gain: 0.3 * e.v }); this.d = e.d; this.f = svf(); this.ph = 0; }
    gen(buf, n, l0) {
      for (let k = 0; k < n; k++) {
        const t = (l0 + k) / SR;
        const cyc = t % 2.4, inhale = cyc < 1.1;
        const rate = inhale ? 22 : 26;
        this.ph += rate / SR; if (this.ph >= 1) this.ph -= 1;
        const pulse = Math.exp(-this.ph * 7);
        const breath = inhale ? 0.55 * Math.sin(Math.PI * cyc / 1.1) : Math.sin(Math.PI * (cyc - 1.1) / 1.3);
        const fade = Math.min(1, t / 1.5, (this.d - t) / 2);
        buf[k] = svfLP(this.f, noise(), 260, 0.6) * pulse * breath * Math.max(0, fade) * 2.4;
      }
    }
  }

  // ------------------------------------------------------------------ the singer
  // Vowel formant targets (F1-F3, Hz); diphthongs glide to a second target.
  const VW = (a, b, c, d, e, f) => ({ f: [a, b, c], g: d ? [d, e, f] : null });
  const VOWELS = {
    IY: VW(290, 2450, 3100), IH: VW(400, 2050, 2700), EH: VW(560, 1850, 2600), AE: VW(740, 1750, 2550),
    AA: VW(780, 1220, 2600), AO: VW(600, 920, 2550), AH: VW(640, 1250, 2600), UH: VW(460, 1100, 2500),
    UW: VW(320, 900, 2400), ER: VW(480, 1380, 1700),
    AY: VW(780, 1250, 2600, 420, 2050, 2700), EY: VW(520, 1950, 2650, 340, 2300, 2950),
    OW: VW(560, 950, 2500, 380, 850, 2400), AW: VW(780, 1250, 2600, 380, 900, 2400),
    OY: VW(580, 900, 2500, 420, 2050, 2700)
  };
  // Fricative and burst noise filters: [centre Hz, bandwidth Hz, gain]
  const FR = {
    S: [6200, 3200, 1.0], SH: [2900, 1700, 1.15], F: [4500, 7000, 0.7], TH: [5200, 7000, 0.7],
    P: [1100, 2400, 1.0], B: [900, 2000, 0.9], T: [4300, 3000, 1.0], D: [3600, 2600, 0.9],
    K: [2100, 1200, 1.1], G: [1900, 1200, 1.0]
  };
  const FRK = Object.keys(FR);
  const CONS = {
    P: { k: 'stop', v: 0, pl: 'lab', cl: 0.06, br: 0.013, asp: 0.045, fr: 'P' },
    B: { k: 'stop', v: 1, pl: 'lab', cl: 0.045, br: 0.009, fr: 'B' },
    T: { k: 'stop', v: 0, pl: 'alv', cl: 0.055, br: 0.015, asp: 0.04, fr: 'T' },
    D: { k: 'stop', v: 1, pl: 'alv', cl: 0.04, br: 0.011, fr: 'D' },
    K: { k: 'stop', v: 0, pl: 'vel', cl: 0.06, br: 0.02, asp: 0.045, fr: 'K' },
    G: { k: 'stop', v: 1, pl: 'vel', cl: 0.045, br: 0.015, fr: 'G' },
    CH: { k: 'affr', v: 0, pl: 'pal', cl: 0.045, d: 0.075, fr: 'SH', af: 0.85 },
    JH: { k: 'affr', v: 1, pl: 'pal', cl: 0.04, d: 0.05, fr: 'SH', af: 0.5 },
    S: { k: 'fric', v: 0, pl: 'alv', d: 0.1, fr: 'S', af: 0.9 },
    Z: { k: 'fric', v: 1, pl: 'alv', d: 0.075, fr: 'S', af: 0.5 },
    SH: { k: 'fric', v: 0, pl: 'pal', d: 0.1, fr: 'SH', af: 0.9 },
    F: { k: 'fric', v: 0, pl: 'labd', d: 0.09, fr: 'F', af: 0.5 },
    V: { k: 'fric', v: 1, pl: 'labd', d: 0.065, fr: 'F', af: 0.25 },
    TH: { k: 'fric', v: 0, pl: 'dent', d: 0.085, fr: 'TH', af: 0.4 },
    DH: { k: 'fric', v: 1, pl: 'dent', d: 0.05, fr: 'TH', af: 0.16 },
    HH: { k: 'asp', d: 0.07 },
    M: { k: 'nas', d: 0.075, f: [280, 1000, 2300], z: 1000 },
    N: { k: 'nas', d: 0.07, f: [280, 1650, 2600], z: 1700 },
    NG: { k: 'nas', d: 0.075, f: [280, 2100, 2700], z: 2500 },
    L: { k: 'liq', d: 0.065, f: [360, 1050, 2650] },
    R: { k: 'liq', d: 0.07, f: [420, 1150, 1650] },
    W: { k: 'liq', d: 0.065, f: [300, 700, 2250] },
    Y: { k: 'liq', d: 0.06, f: [280, 2250, 3000] }
  };
  const LOCUS = { lab: [250, 850, 2300], labd: [300, 1100, 2400], dent: [320, 1500, 2600], alv: [300, 1750, 2700], pal: [300, 2000, 2700] };

  function syllabify(ph) {
    const p = ph.trim().split(/\s+/);
    const vi = p.findIndex(x => VOWELS[x]);
    return { on: p.slice(0, vi), nuc: p[vi], co: p.slice(vi + 1) };
  }

  // A segment: {d, f:[F1,F2,F3], av, ah, af, fr, nas, nz}; times are filled in later.
  function consSegs(ph, vf, onset) {
    const c = CONS[ph];
    const seg = (d, f, av, ah, af, fr, extra) => Object.assign({ d, f, av, ah, af, fr: fr || 'S', nas: 0, nz: 1500 }, extra);
    let loc = c.pl === 'vel' ? [300, Math.max(1700, vf[1] + 150), Math.max(2400, vf[1] + 600)] : LOCUS[c.pl];
    const out = [];
    switch (c.k) {
      case 'stop':
        out.push(seg(c.cl, loc, c.v ? 0.12 : 0, 0, 0, c.fr));
        out.push(seg(c.br, loc, c.v ? 0.3 : 0, 0, c.v ? 0.5 : 1.0, c.fr));
        if (!c.v && onset) out.push(seg(c.asp, vf, 0, 0.55, 0.06, c.fr));
        if (!c.v && !onset) out.push(seg(0.02, loc, 0, 0.25, 0.04, c.fr));
        break;
      case 'affr':
        out.push(seg(c.cl, loc, c.v ? 0.12 : 0, 0, 0, c.fr));
        out.push(seg(c.d, loc, c.v ? 0.4 : 0, 0, c.af, c.fr));
        break;
      case 'fric':
        out.push(seg(c.d, loc, c.v ? 0.45 : 0, 0, c.af, c.fr));
        break;
      case 'asp':
        out.push(seg(c.d, vf, 0, 0.6, 0, 'S'));
        break;
      case 'nas':
        out.push(seg(c.d, c.f, 0.55, 0, 0, 'S', { nas: 1, nz: c.z }));
        break;
      case 'liq':
        out.push(seg(c.d, c.f, 0.72, 0, 0, 'S'));
        break;
    }
    return out;
  }

  // Turn a phrase (notes with phonemes) into a timed list of segments.
  function buildSegments(notes, o) {
    const fs = o.fscale || 1;
    const sy = notes.map(n => n.ph === 'MEOW' ? null : syllabify(n.ph));
    const onS = [], coS = [];
    notes.forEach((n, i) => {
      if (!sy[i]) { onS.push(consSegs('M', [300, 2400, 3000], true)); coS.push([]); return; }
      const V = VOWELS[sy[i].nuc];
      onS.push(sy[i].on.flatMap(p => consSegs(p, V.f, true)));
      coS.push(sy[i].co.flatMap(p => consSegs(p, V.g || V.f, false)));
    });
    const dur = a => a.reduce((s, x) => s + x.d, 0);
    const segs = [];
    const push = (t0, t1, s, m, nt) => { if (t1 > t0 + 1e-5) segs.push(Object.assign({}, s, { t0, t1, m, nt, f: s.f.map(x => x * fs) })); };
    let cur = notes[0].t - dur(onS[0]) - 0.05;
    const silence = f => ({ f, av: 0, ah: 0, af: 0, fr: 'S', nas: 0, nz: 1500, av1: 0 });
    let lastF = sy[0] ? VOWELS[sy[0].nuc].f : [300, 2400, 3000];
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i], next = notes[i + 1], end = n.t + n.d;
      const legato = next && next.t - end < 0.02;
      // keep the vowel at least ~45% of the note: squeeze consonants if they don't fit
      const avail = (legato ? next.t : end) - n.t;
      let co = dur(coS[i]), nextOn = legato ? dur(onS[i + 1]) : 0;
      const maxC = avail * 0.55;
      if (co + nextOn > maxC) {
        const k = maxC / (co + nextOn);
        coS[i].forEach(s => { s.d *= k; });
        if (legato) onS[i + 1].forEach(s => { s.d *= k; });
        co *= k; nextOn *= k;
      }
      const on = dur(onS[i]);
      const onStart = n.t - on;
      if (onStart > cur) push(cur, onStart, silence(lastF), n.midi, n.t);
      const t0 = Math.max(cur, onStart), sc = on > 0 ? (n.t - t0) / on : 1;
      let t = t0;
      for (const s of onS[i]) { const t1 = t + s.d * sc; push(t, t1, Object.assign({ av1: s.av }, s), n.midi, n.t); t = t1; }
      const tailEnd = legato ? next.t - nextOn : end;
      const vEnd = tailEnd - co;
      const last = !next || !legato;
      if (!sy[i]) {
        // meow: M + IY -> AA -> UW with a cat-like pitch curve
        const vd = vEnd - n.t, parts = [[0.2, [300, 2500, 3100]], [0.4, [820, 1500, 2700]], [0.4, [360, 820, 2400]]];
        const curve = u => (u < 0.35 ? -3 + 5 * Math.sin(u / 0.35 * Math.PI / 2) : 2 - 8 * Math.pow((u - 0.35) / 0.65, 1.6));
        let tt = n.t;
        parts.forEach(([frac, f], j) => {
          const steps = 6;
          for (let q = 0; q < steps; q++) {
            const a = tt + vd * frac * q / steps, b = tt + vd * frac * (q + 1) / steps;
            const u = (a - n.t) / vd;
            const av = j === 2 ? 0.95 - 0.7 * (q / steps) : 0.95;
            push(a, b, { f, av, av1: av, ah: 0.08, af: 0, fr: 'S', nas: 0, nz: 1500, vowel: 1 }, n.midi + curve(u), n.t);
          }
          tt += vd * frac;
        });
        lastF = parts[2][1];
      } else {
        const V = VOWELS[sy[i].nuc];
        const vs = { f: V.f, av: 1, av1: 1, ah: 0, af: 0, fr: 'S', nas: 0, nz: 1500, vowel: 1 };
        const fade = last && !legato;
        if (V.g) {
          const mid = n.t + (vEnd - n.t) * 0.68;
          push(n.t, mid, Object.assign({}, vs, { av1: fade ? 0.9 : 1 }), n.midi, n.t);
          push(mid, vEnd, Object.assign({}, vs, { f: V.g, av: fade ? 0.9 : 1, av1: fade ? 0.45 : 1 }), n.midi, n.t);
        } else {
          const long = vEnd - n.t > 0.5;
          push(n.t, vEnd, Object.assign({}, vs, { av: long ? 0.88 : 1, av1: fade ? 0.4 : 1 }), n.midi, n.t);
        }
        lastF = V.g || V.f;
      }
      t = vEnd;
      for (const s of coS[i]) { push(t, t + s.d, Object.assign({ av1: s.av }, s), n.midi, n.t); t += s.d; }
      cur = Math.max(t, tailEnd);
    }
    push(cur, cur + 0.25, silence(lastF), notes[notes.length - 1].midi, notes[notes.length - 1].t);
    return segs;
  }

  const kFrom = tau => 1 - Math.exp(-32 / SR / tau);
  function setRes(r, F, BW) {
    const R = Math.exp(-Math.PI * BW / SR);
    r.c = -R * R; r.b = 2 * R * Math.cos(TAU * F / SR); r.a = 1 - r.b - r.c;
  }
  function res() { return { a: 1, b: 0, c: 0, y1: 0, y2: 0 }; }

  const VOICE_TYPES = {
    lead: { fscale: 1.08, gain: 0.62, tilt: 2600, vib: 0.32, breath: 0.035, rev: 0.22, dly: 0.16, pan: 0 },
    double: { fscale: 1.1, gain: 0.2, tilt: 2200, vib: 0.22, breath: 0.05, rev: 0.25, dly: 0.1 },
    harm: { fscale: 1.12, gain: 0.26, tilt: 2200, vib: 0.25, breath: 0.05, rev: 0.3, dly: 0.12 },
    choir: { fscale: 1.0, gain: 0.16, tilt: 1600, vib: 0.2, breath: 0.08, rev: 0.45, dly: 0.05, fadeIn: 0.5, kF: 0.06 },
    meow: { fscale: 1.32, gain: 0.5, tilt: 3000, vib: 0.15, breath: 0.1, rev: 0.3, dly: 0.25, kF: 0.05 },
    robot: { fscale: 0.95, gain: 0.55, tilt: 3200, vib: 0, breath: 0, rev: 0.2, dly: 0.28, radio: true, port: 0.25 }
  };

  class Singer extends Voice {
    constructor(p, mouth) {
      const ty = Object.assign({}, VOICE_TYPES[p.voice]);
      if (p.voice === 'choir') ty.fscale = [0.96, 1.0, 1.05][p.idx];
      const delay = p.delay || 0;
      const notes = p.notes.map(n => Object.assign({}, n, { t: n.t + delay, midi: n.midi + (p.detune || 0) }));
      const segs = buildSegments(notes, ty);
      super(segs[0].t0, segs[segs.length - 1].t1, { gain: ty.gain * (p.gain || 1), rev: ty.rev, dly: ty.dly, pan: p.pan !== undefined ? p.pan : (ty.pan || 0) });
      this.ty = ty; this.segs = segs; this.si = 0; this.mouth = mouth;
      this.vibRate = p.voice === 'choir' ? 4.6 + p.idx * 0.35 : 5.3;
      this.r = [res(), res(), res(), res(), res()];
      const fs = ty.fscale;
      setRes(this.r[3], 3500 * fs, 250); setRes(this.r[4], 4300 * fs, 300);
      this.az = { a: 1, b: 0, c: 0, x1: 0, x2: 0 };
      this.bq = { b0: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 }; this.frc = '';
      const s0 = segs[0];
      this.F = s0.f.slice(); this.AV = 0; this.AH = 0; this.AF = 0; this.NAS = 0; this.NZ = 1500;
      this.lm = s0.m; this.phi = 0; this.dphi = mtof(s0.m) / SR; this.tl = 0;
      this.kF = ty.kF || kFrom(0.018); this.kA = kFrom(0.006); this.kH = kFrom(0.005); this.kR = kFrom(0.0025);
      this.kN = kFrom(0.008); this.kP = ty.port ? kFrom(0.004) : kFrom(0.028);
      this.tiltK = 1 - Math.exp(-TAU * ty.tilt / SR);
      this.fade = ty.fadeIn || 0;
      this.hp = 0; this.lp = 0; this.jit = 0;
      this.gV = 0.17; this.gF = 0.42; this.comp = 1;
    }
    control(t) {
      const sg = this.segs;
      while (this.si < sg.length - 1 && t >= sg[this.si].t1) this.si++;
      const s = sg[this.si];
      const u = clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
      const avT = s.av + (s.av1 - s.av) * u;
      const F = this.F, kF = this.kF;
      F[0] += (s.f[0] - F[0]) * kF; F[1] += (s.f[1] - F[1]) * kF; F[2] += (s.f[2] - F[2]) * kF;
      this.AV += (avT - this.AV) * this.kA;
      this.AH += (s.ah - this.AH) * this.kH;
      this.AF += (s.af - this.AF) * this.kR;
      this.NAS += (s.nas - this.NAS) * this.kN;
      this.NZ += (s.nz - this.NZ) * this.kN;
      this.lm += (s.m - this.lm) * this.kP;
      const ty = this.ty;
      this.jit += (noise() * 0.5 - this.jit) * 0.02;
      const vd = ty.vib * clamp((t - s.nt - 0.16) / 0.35, 0, 1);
      const midi = this.lm + vd * Math.sin(TAU * this.vibRate * t) + this.jit * 0.06;
      const f0 = mtof(midi);
      this.dphi = f0 / SR;
      // singers raise F1 above a high fundamental
      const F1 = s.vowel ? Math.max(F[0], f0 * 1.12) : F[0];
      const F2 = Math.max(F[1], F1 + 250);
      // even out the loudness of close (low F1) and open vowels a little
      this.comp = Math.min(1.6, Math.pow(760 / F1, 0.4));
      setRes(this.r[0], F1, 75 + this.NAS * 60);
      setRes(this.r[1], F2, 95 + this.NAS * 180);
      setRes(this.r[2], Math.max(F[2], F2 + 300), 140 + this.NAS * 160);
      // nasal anti-resonance
      const R = Math.exp(-Math.PI * 220 / SR), c = -R * R, b = 2 * R * Math.cos(TAU * this.NZ / SR), a = 1 - b - c;
      this.az.a = 1 / a; this.az.b = -b / a; this.az.c = -c / a;
      if (s.fr !== this.frc) {
        this.frc = s.fr;
        const [fc, bw, g] = FR[s.fr];
        const w0 = TAU * Math.min(fc * ty.fscale, 9000) / SR, Q = fc / bw, al = Math.sin(w0) / (2 * Q), a0 = 1 + al;
        const q = this.bq;
        q.b0 = al / a0 * g; q.b2 = -al / a0 * g; q.a1 = -2 * Math.cos(w0) / a0; q.a2 = (1 - al) / a0;
      }
      if (this.mouth) {
        const idx = Math.floor(t * 100);
        if (idx >= 0 && idx * 3 + 2 < this.mouth.length) {
          this.mouth[idx * 3] = this.AV * (1 - this.NAS * 0.8);
          this.mouth[idx * 3 + 1] = F1;
          this.mouth[idx * 3 + 2] = F2;
        }
      }
    }
    gen(buf, n, l0) {
      const r0 = this.r[0], r1 = this.r[1], r2 = this.r[2], r3 = this.r[3], r4 = this.r[4], az = this.az, q = this.bq;
      const ty = this.ty, breath = ty.breath, radio = ty.radio;
      for (let k = 0; k < n; k++) {
        const l = l0 + k;
        if ((l & 31) === 0) this.control(this.t0 + l / SR);
        let env = 1;
        if (this.fade) { const tt = l / SR; env = Math.min(1, tt / this.fade); env *= env; }
        this.phi += this.dphi;
        if (this.phi >= 1) this.phi -= 1;
        const saw = 2 * this.phi - 1 - blep(this.phi, this.dphi);
        this.tl += (saw - this.tl) * this.tiltK;
        const nz = noise();
        const x = this.tl * this.AV * env + nz * (this.AH + breath * this.AV) * (this.phi < 0.5 ? 1 : 0.45);
        let y = r0.a * x + r0.b * r0.y1 + r0.c * r0.y2; r0.y2 = r0.y1; r0.y1 = y;
        let z = r1.a * y + r1.b * r1.y1 + r1.c * r1.y2; r1.y2 = r1.y1; r1.y1 = z;
        y = r2.a * z + r2.b * r2.y1 + r2.c * r2.y2; r2.y2 = r2.y1; r2.y1 = y;
        z = r3.a * y + r3.b * r3.y1 + r3.c * r3.y2; r3.y2 = r3.y1; r3.y1 = z;
        y = r4.a * z + r4.b * r4.y1 + r4.c * r4.y2; r4.y2 = r4.y1; r4.y1 = y;
        const yz = az.a * y + az.b * az.x1 + az.c * az.x2; az.x2 = az.x1; az.x1 = y;
        y += (yz - y) * this.NAS;
        const w = noise();
        const f = q.b0 * w + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2;
        q.x2 = q.x1; q.x1 = w; q.y2 = q.y1; q.y1 = f;
        let out = y * this.gV * this.comp + f * this.AF * this.gF;
        if (radio) {
          this.lp += (out - this.lp) * 0.33;
          this.hp += (this.lp - this.hp) * 0.045;
          out = Math.round(Math.tanh((this.lp - this.hp) * 2.2) * 24) / 24;
        }
        buf[k] = out;
      }
    }
  }

  // ------------------------------------------------------------------ effects
  class Reverb {
    constructor() {
      const CL = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AP = [556, 441, 341, 225], SP = 23;
      this.cb = []; this.cs = new Float64Array(16); this.ci = new Int32Array(16);
      for (let i = 0; i < 16; i++) this.cb.push(new Float32Array(CL[i % 8] + (i >= 8 ? SP : 0)));
      this.ab = []; this.ai = new Int32Array(8);
      for (let i = 0; i < 8; i++) this.ab.push(new Float32Array(AP[i % 4] + (i >= 4 ? SP : 0)));
      this.fb = 0.86; this.damp = 0.28;
    }
    process(inp, oL, oR, n) {
      const cb = this.cb, cs = this.cs, ci = this.ci, ab = this.ab, ai = this.ai, fb = this.fb, d = this.damp, d1 = 1 - d;
      for (let k = 0; k < n; k++) {
        const x = inp[k] * 0.02;
        let l = 0, r = 0;
        for (let i = 0; i < 16; i++) {
          const b = cb[i], j = ci[i], y = b[j];
          cs[i] = y * d1 + cs[i] * d;
          b[j] = x + cs[i] * fb;
          ci[i] = j + 1 >= b.length ? 0 : j + 1;
          if (i < 8) l += y; else r += y;
        }
        for (let i = 0; i < 8; i++) {
          const b = ab[i], j = ai[i], bo = b[j];
          const v = i < 4 ? l : r;
          b[j] = v + bo * 0.5;
          ai[i] = j + 1 >= b.length ? 0 : j + 1;
          if (i < 4) l = bo - v; else r = bo - v;
        }
        oL[k] = l; oR[k] = r;
      }
    }
  }

  class PingPong {
    constructor(time, fb) {
      this.n = Math.round(time * SR); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); this.i = 0; this.fb = fb; this.lp = 0;
    }
    process(inp, oL, oR, n) {
      const L = this.L, R = this.R, N = this.n;
      for (let k = 0; k < n; k++) {
        const i = this.i, dl = L[i], dr = R[i];
        this.lp += (dr - this.lp) * 0.35;
        L[i] = inp[k] + this.lp * this.fb;
        R[i] = dl;
        this.i = i + 1 >= N ? 0 : i + 1;
        oL[k] = dl; oR[k] = dr;
      }
    }
  }

  // ------------------------------------------------------------------ the render job
  function buildVoices(E, mouth) {
    const v = [];
    E.kick.forEach(e => v.push(new Kick(e)));
    E.snare.forEach(e => v.push(new Snare(e)));
    E.clap.forEach(e => v.push(new Clap(e)));
    E.hat.forEach(e => v.push(new Hat(e, false)));
    E.ohat.forEach(e => v.push(new Hat(e, true)));
    E.crash.forEach(e => v.push(new Crash(e)));
    E.bass.forEach(e => v.push(new Bass(e)));
    E.pad.forEach(e => v.push(new Pad(e)));
    E.arp.forEach(e => v.push(new Pluck(e)));
    E.chip.forEach(e => v.push(new Chip(e)));
    E.lead.forEach(p => v.push(new Lead(p)));
    E.bell.forEach(e => v.push(new Bell(e)));
    for (const f of E.fx) {
      const C = { wind: Wind, riser: Riser, revcym: RevCym, impact: Impact, morse: Morse, purr: Purr }[f.type];
      v.push(new C(f));
    }
    E.phrases.forEach(p => v.push(new Singer(p, p.voice === 'lead' ? mouth : null)));
    v.sort((a, b) => a.s0 - b.s0);
    return v;
  }

  function createAudioJob(opts) {
    opts = opts || {};
    const N = Math.ceil(S.DURATION * SR);
    const L = opts.L || new Float32Array(N), R = opts.R || new Float32Array(N);
    const mouth = new Float32Array(Math.ceil(S.DURATION * 100 + 2) * 3);
    nseed = 0x9E3779B9 | 0;
    let voices = buildVoices(S.events, mouth);
    if (opts.filter) voices = voices.filter(opts.filter);
    const kicks = S.events.kick.map(e => Math.floor(e.t * SR));
    const mk = () => new Float32Array(BLOCK);
    const bus = { L: mk(), R: mk(), dL: mk(), dR: mk(), rev: mk(), dly: mk() };
    const rL = mk(), rR = mk(), eL = mk(), eR = mk();
    const reverb = new Reverb(), delay = new PingPong(S.STEP * 3, 0.38);
    const active = [];
    let pos = 0, vi = 0, ki = 0, peak = 0;
    const MASTER = opts.master || 0.82;
    const job = {
      L, R, mouth, N, progress: 0, done: false, peak: 0,
      step(budgetMs) {
        const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const tEnd = now() + (budgetMs === undefined ? 1e12 : budgetMs);
        while (pos < N) {
          const b1 = Math.min(N, pos + BLOCK), n = b1 - pos;
          while (vi < voices.length && voices[vi].s0 < b1) active.push(voices[vi++]);
          for (const k in bus) bus[k].fill(0);
          for (let a = active.length - 1; a >= 0; a--) {
            const v = active[a];
            v.render(bus, pos, b1);
            if (v.s1 <= b1) active.splice(a, 1);
          }
          reverb.process(bus.rev, rL, rR, n);
          delay.process(bus.dly, eL, eR, n);
          for (let k = 0; k < n; k++) {
            const i = pos + k;
            while (ki < kicks.length - 1 && kicks[ki + 1] <= i) ki++;
            let duck = 1;
            if (kicks.length && kicks[ki] <= i) {
              const d = (i - kicks[ki]) / SR;
              duck = 1 - 0.55 * (d < 0.006 ? d / 0.006 : Math.exp(-(d - 0.006) / 0.11));
            }
            const l = (bus.L[k] + bus.dL[k] * duck + rL[k] * 1.0 + eL[k] * 0.55) * MASTER;
            const r = (bus.R[k] + bus.dR[k] * duck + rR[k] * 1.0 + eR[k] * 0.55) * MASTER;
            L[i] = soft(l); R[i] = soft(r);
            const m = Math.max(Math.abs(l), Math.abs(r));
            if (m > peak) peak = m;
          }
          pos = b1;
          if (now() > tEnd) break;
        }
        job.progress = pos / N; job.done = pos >= N; job.peak = peak;
        return job.done;
      }
    };
    return job;
  }
  function soft(x) {
    const a = Math.abs(x);
    if (a < 0.85) return x;
    const y = 0.85 + 0.15 * Math.tanh((a - 0.85) / 0.15);
    return x < 0 ? -y : y;
  }

  CM.createAudioJob = createAudioJob;
  CM.synthInternals = { buildSegments, Singer, VOICE_TYPES, syllabify, classes: { Kick, Snare, Clap, Hat, Crash, Bass, Pad, Pluck, Chip, Lead, Bell, Wind, Riser, RevCym, Impact, Morse, Purr, Singer } };
  if (typeof module !== 'undefined' && module.exports) module.exports = CM;
})(typeof globalThis !== 'undefined' ? globalThis : window);
