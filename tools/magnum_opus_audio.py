#!/usr/bin/env python3
"""MAGNUM OPUS (Rubedo Radio Edit): the soundtrack, composed, synthesised and mixed in code.

Everything follows magnum-opus/score.js, the timeline the visuals are driven by too: tempo,
chords, energy, the 16-step drum patterns, hits, sweeps, the gap, the chakra bells and the
word-by-word vocal timing. A kick in the pattern is a kick in the audio at that sample.

Sound sources are numpy/scipy only (PolyBLEP and additive oscillators, biquads with
time-varying cutoff, synthetic convolution reverbs), plus ffmpeg for the voices:
flite TTS (rap: rms, hook: slt, announcer: rms/awb) and the rubberband time/pitch filter.
The hook is sung by a TD-PSOLA pitch corrector (flat notes, glides, vibrato) driving a
cepstral STFT vocoder whose carrier plays the melody. Rap and hook words are placed by their
P-centre: a word with an unvoiced lead-in (s, sh, h, t, p) starts that much ahead of its beat,
so its vowel lands on the score's word time.

  python3 tools/magnum_opus_audio.py --wav <dir>/magnum-opus.wav --mp3 magnum-opus/magnum-opus.mp3

Stems, intermediate voice renders and analysis images go next to the WAV (--stems DIR to
change that), never into the repo. The run ends with a verification report (timing, gap,
vocals, loudness, true peak, MP3 alignment); --no-verify skips it.
"""
import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

SR = 44100
REPO = Path(__file__).resolve().parent.parent
SCORE_PATH = REPO / 'magnum-opus' / 'score.js'
RNG = np.random.default_rng(1945)
T0 = time.time()


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


# =====================================================================================
# score and timing
# =====================================================================================

def load_score(path=SCORE_PATH):
    # the object after the first "=" up to the final ";" (the header comment lines are skipped,
    # since they mention "=" themselves)
    lines = Path(path).read_text(encoding='utf-8').splitlines()
    txt = '\n'.join(l for l in lines if not l.lstrip().startswith('//'))
    return json.loads(txt[txt.index('=') + 1:txt.rindex(';')])


class Timing:
    def __init__(self, score):
        self.bpm = float(score['bpm'])
        self.beat = 60.0 / self.bpm
        self.step = self.beat / score['stepsPerBeat']
        self.bar = self.beat * score['beatsPerBar']
        self.dur = float(score['duration'])
        self.n = int(round(self.dur * SR))

    def t(self, bar=0, beat=0.0, step=0.0):
        return bar * self.bar + beat * self.beat + step * self.step

    def b(self, beat):
        return beat * self.beat


def pattern_events(T, rows):
    """(time, velocity, accent, bar, step) for every hit of a 16-step pattern (same rules as engine.js)."""
    out = []
    for bar, row in enumerate(rows):
        for s, c in enumerate(row):
            if c in 'xX':
                out.append((T.t(bar, 0, s), 1.0 if c == 'X' else 0.8, c == 'X', bar, s))
            elif c == 'r':
                out.append((T.t(bar, 0, s), 0.7, False, bar, s))
                out.append((T.t(bar, 0, s + 0.5), 0.7, False, bar, s + 0.5))
    return out


# =====================================================================================
# DSP primitives
# =====================================================================================

def hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, float) - 69.0) / 12.0)


def tt(n):
    return np.arange(n) / SR


def ns(sec):
    return max(1, int(round(sec * SR)))


def _phase(freq, n, ph0):
    f = np.asarray(freq, float)
    dt = np.full(n, f / SR) if f.ndim == 0 else f[:n] / SR
    ph = (ph0 + np.cumsum(dt) - dt) % 1.0
    return ph, dt


def _blep(ph, dt):
    y = np.zeros_like(ph)
    m = ph < dt
    if m.any():
        x = ph[m] / dt[m]
        y[m] = x + x - x * x - 1.0
    m = ph > 1.0 - dt
    if m.any():
        x = (ph[m] - 1.0) / dt[m]
        y[m] = x * x + x + x + 1.0
    return y


def saw(freq, n, ph0=0.0):
    """Band-limited (PolyBLEP) sawtooth; freq scalar or per-sample array."""
    ph, dt = _phase(freq, n, ph0)
    return 2.0 * ph - 1.0 - _blep(ph, dt)


def saw_os(freq, n, ph0=0.0, os_=4):
    """PolyBLEP saw rendered at os_ times the rate and decimated: its alias products in the top octave drop
    from ~25 dB to ~70 dB under the harmonics. For exposed, HF-boosted uses (the vocoder carriers)."""
    f = np.asarray(freq, float)
    fu = f if f.ndim == 0 else np.repeat(f[:n], os_)
    ph, dt = _phase(fu / os_, n * os_, ph0)
    return signal.resample_poly(2.0 * ph - 1.0 - _blep(ph, dt), 1, os_)[:n]


def pulse(freq, n, ph0=0.0, width=0.5):
    ph, dt = _phase(freq, n, ph0)
    ph2 = (ph + width) % 1.0
    return (2.0 * ph - 1.0 - _blep(ph, dt)) - (2.0 * ph2 - 1.0 - _blep(ph2, dt))


def sine(freq, n, ph0=0.0):
    ph, _ = _phase(freq, n, ph0)
    return np.sin(2 * np.pi * ph)


def panlaw(p):
    a = (np.clip(p, -1, 1) + 1.0) * np.pi / 4.0
    return np.cos(a) * np.sqrt(2.0), np.sin(a) * np.sqrt(2.0)


def st(x, pan=0.0):
    x = np.asarray(x, float)
    if x.ndim == 2:
        return x
    gl, gr = panlaw(pan)
    return np.vstack([x * gl, x * gr])


def place(buf, x, t, gain=1.0, pan=0.0):
    """Add x (mono or stereo) into buf starting at time t (seconds) or sample index (int)."""
    i0 = t if isinstance(t, (int, np.integer)) else int(round(t * SR))
    x = st(x, pan) if buf.ndim == 2 else np.asarray(x, float)
    n = x.shape[-1]
    a, b = max(0, i0), min(buf.shape[-1], i0 + n)
    if b > a:
        buf[..., a:b] += gain * x[..., a - i0:b - i0]


def fades(x, fin=0.002, fout=0.005):
    x = np.array(x, float, copy=True)
    n = x.shape[-1]
    a = min(n, max(1, int(fin * SR)))
    b = min(n, max(1, int(fout * SR)))
    x[..., :a] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
    x[..., n - b:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(b) + 1) / b)
    return x


def sat(x, drive=1.5):
    return np.tanh(drive * x) / np.tanh(drive)


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def keys_curve(n, pts, log_domain=False):
    """Piecewise-linear automation from [(time_s, value)], optionally interpolated in log space."""
    ts = np.array([p[0] for p in pts], float)
    vs = np.array([p[1] for p in pts], float)
    t = tt(n)
    if log_domain:
        return np.exp(np.interp(t, ts, np.log(vs)))
    return np.interp(t, ts, vs)


def biquad(kind, f, q=0.7071, gain_db=0.0):
    """RBJ cookbook coefficients, vectorised over f. Returns b (3, k), a (3, k)."""
    f = np.clip(np.asarray(f, float), 10.0, SR * 0.48)
    w = 2 * np.pi * f / SR
    c, s = np.cos(w), np.sin(w)
    al = s / (2 * q)
    A = 10 ** (gain_db / 40.0)
    if kind == 'lp':
        b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al
    elif kind == 'hp':
        b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al
    elif kind == 'bp':
        b0 = al; b1 = 0 * c; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al
    elif kind == 'peak':
        b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A
    elif kind in ('ls', 'hs'):
        sq = 2 * np.sqrt(A) * al
        if kind == 'ls':
            b0 = A * ((A + 1) - (A - 1) * c + sq); b1 = 2 * A * ((A - 1) - (A + 1) * c)
            b2 = A * ((A + 1) - (A - 1) * c - sq); a0 = (A + 1) + (A - 1) * c + sq
            a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - sq
        else:
            b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c)
            b2 = A * ((A + 1) + (A - 1) * c - sq); a0 = (A + 1) - (A - 1) * c + sq
            a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq
    else:
        raise ValueError(kind)
    return np.stack([b0 / a0, b1 / a0, b2 / a0]), np.stack([np.ones_like(a0), a1 / a0, a2 / a0])


def eq(x, kind, f, q=0.7071, gain_db=0.0):
    b, a = biquad(kind, f, q, gain_db)
    return signal.lfilter(b, a, x, axis=-1)


def tvf(x, kind, fc, q=0.7071, block=64):
    """Biquad with a time-varying cutoff: coefficients per block, filter state carried across."""
    x = np.asarray(x, float)
    x2 = np.atleast_2d(x)
    C, n = x2.shape
    fc = np.broadcast_to(np.asarray(fc, float), (n,))
    starts = np.arange(0, n, block)
    B, A = biquad(kind, fc[np.minimum(starts + block // 2, n - 1)], q)
    y = np.empty_like(x2)
    zi = np.zeros((C, 2))
    for k, s0 in enumerate(starts):
        y[:, s0:s0 + block], zi = signal.lfilter(B[:, k], A[:, k], x2[:, s0:s0 + block], axis=-1, zi=zi)
    return y if x.ndim == 2 else y[0]


def bw(x, kind, f, order=2, zero_phase=False):
    """Static Butterworth: kind low/high/band (f = (lo, hi) for band)."""
    sos = signal.butter(order, f, btype=kind, fs=SR, output='sos')
    if zero_phase:
        return signal.sosfiltfilt(sos, x, axis=-1)
    return signal.sosfilt(sos, x, axis=-1)


def noise(n, ch=1):
    return RNG.standard_normal((ch, n)) if ch > 1 else RNG.standard_normal(n)


# =====================================================================================
# effects: reverbs, delays, dynamics, loudness
# =====================================================================================

def make_ir(dur, rt_lo, rt_hi, pre=0.015, seed=0, er=10, lp=11000.0, build=0.02):
    rng = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    out = np.zeros((2, n))
    sos_lo = signal.butter(2, 600, 'low', fs=SR, output='sos')
    sos_hi = signal.butter(2, 3500, 'high', fs=SR, output='sos')
    rt_mid = 0.5 * (rt_lo + rt_hi)
    for ch in range(2):
        w = rng.standard_normal(n)
        lo = signal.sosfilt(sos_lo, w)
        hi = signal.sosfilt(sos_hi, w)
        mid = w - lo - hi
        y = lo * np.exp(-6.91 * t / rt_lo) + mid * np.exp(-6.91 * t / rt_mid) + hi * np.exp(-6.91 * t / rt_hi)
        y *= 1.0 - np.exp(-t / build)
        for _ in range(er):
            d = int(rng.uniform(0.003, 0.075) * SR)
            y[d] += rng.uniform(4, 12) * (1.0 - d / (0.09 * SR)) * rng.choice([-1.0, 1.0])
        out[ch] = bw(y, 'low', lp)
    tail = n // 8
    out[:, n - tail:] *= np.linspace(1, 0, tail) ** 2
    out = np.pad(out, ((0, 0), (ns(pre), 0)))
    out /= np.sqrt(np.sum(out ** 2, axis=1, keepdims=True))
    return out


def convolve(x, ir):
    x = st(x)
    n = x.shape[-1]
    return np.vstack([signal.oaconvolve(x[c], ir[c])[:n] for c in range(2)])


def pingpong(x, delay, fb=0.45, taps=8, lp=5000.0, hp=250.0):
    m = x.mean(0) if np.ndim(x) == 2 else np.asarray(x, float)
    n = len(m)
    d = int(round(delay * SR))
    out = np.zeros((2, n))
    cur = bw(m, 'high', hp)
    sos = signal.butter(1, lp, 'low', fs=SR, output='sos')
    for k in range(1, taps + 1):
        if k * d >= n:
            break
        cur = signal.sosfilt(sos, cur) * (fb if k > 1 else 1.0)
        out[(k - 1) % 2, k * d:] += cur[:n - k * d]
    return out


def chorus(x, base_ms=11.0, depth_ms=2.5, rate=0.45, mix=0.35):
    x = st(x)
    n = x.shape[-1]
    t = tt(n)
    idx = np.arange(n, dtype=float)
    y = np.empty_like(x)
    for ch, ph in enumerate((0.0, np.pi / 2)):
        d = (base_ms + depth_ms * np.sin(2 * np.pi * rate * t + ph)) * SR / 1000.0
        y[ch] = (1 - mix) * x[ch] + mix * np.interp(idx - d, idx, x[ch], left=0.0)
    return y


def compressor(x, thr_db, ratio, attack=0.005, release=0.12, knee=6.0, rms=0.008, side=None):
    """Feed-forward compressor, vectorised: RMS detector, soft knee, instant peak capture with
    linear-in-dB release (cumulative max trick), then one-pole attack smoothing."""
    d = np.atleast_2d(x if side is None else side)
    p = np.mean(d ** 2, axis=0)
    a = np.exp(-1.0 / (rms * SR))
    p = signal.lfilter([1 - a], [1, -a], p)
    lvl = 10 * np.log10(p + 1e-12)
    over = lvl - thr_db
    s = 1 - 1.0 / ratio
    gr = np.where(over <= -knee / 2, 0.0, np.where(over >= knee / 2, over * s, s * (over + knee / 2) ** 2 / (2 * knee)))
    idx = np.arange(len(gr))
    rate = (20.0 / release) / SR
    env = np.maximum.accumulate(gr + idx * rate) - idx * rate
    aa = np.exp(-1.0 / (attack * SR))
    env = signal.lfilter([1 - aa], [1, -aa], env)
    g = 10 ** (-env / 20)
    return x * g, g


def true_peak(x):
    up = signal.resample_poly(np.atleast_2d(x), 4, 1, axis=-1)
    return float(np.abs(up).max())


def tp_limiter(x, ceiling_db=-1.2, look=0.0008, release=0.09):
    """Look-ahead limiter on the 4x oversampled peak: min-filter + moving average guarantees the
    gain at every peak is at or below what that peak needs; release is linear in dB."""
    x = np.atleast_2d(x)
    n = x.shape[-1]
    c = 10 ** (ceiling_db / 20)
    up = np.abs(signal.resample_poly(x, 4, 1, axis=-1)).max(axis=0)[:4 * n].reshape(n, 4).max(axis=1)
    pk = maximum_filter1d(np.maximum(up, np.abs(x).max(axis=0)), 3)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    L = max(1, int(look * SR))
    h = minimum_filter1d(req, size=2 * L + 1, mode='nearest')
    g = uniform_filter1d(h, size=2 * L + 1, mode='nearest')
    g = np.minimum(g, h)
    gdb = 20 * np.log10(np.maximum(g, 1e-6))
    idx = np.arange(n)
    rate = (10.0 / release) / SR
    gdb = np.minimum.accumulate(gdb - idx * rate) + idx * rate
    return x * 10 ** (gdb / 20), 10 ** (gdb / 20)


def softclip(x, knee=0.8):
    x = np.atleast_2d(x)
    n = x.shape[-1]
    up = signal.resample_poly(x, 2, 1, axis=-1)
    a = np.abs(up)
    m = a > knee
    up[m] = np.sign(up[m]) * (knee + (1 - knee) * np.tanh((a[m] - knee) / (1 - knee)))
    return signal.resample_poly(up, 1, 2, axis=-1)[:, :n]


def k_weight(x):
    """BS.1770 K-weighting (pre-filter shelf + RLB high-pass) designed for SR."""
    x = np.atleast_2d(x)
    G, Q, fc = 3.999843853973347, 0.7071752369554196, 1681.974450955533
    A = 10 ** (G / 40)
    w0 = 2 * np.pi * fc / SR
    al = np.sin(w0) / (2 * Q)
    c = np.cos(w0)
    b = [A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c),
         A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * al)]
    a = [(A + 1) - (A - 1) * c + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c),
         (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * al]
    y = signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=-1)
    Q, fc = 0.5003270373238773, 38.13547087602444
    w0 = 2 * np.pi * fc / SR
    al = np.sin(w0) / (2 * Q)
    c = np.cos(w0)
    b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    a = [1 + al, -2 * c, 1 - al]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], y, axis=-1)


def lufs(x, start=None, end=None):
    """Integrated loudness (BS.1770-4: 400 ms blocks, 75 % overlap, -70 LUFS and -10 LU gates)."""
    y = k_weight(x)
    if start is not None:
        y = y[:, int(start * SR):int(end * SR)]
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if y.shape[-1] < blk:
        return -np.inf
    c = np.cumsum(np.pad(y ** 2, ((0, 0), (1, 0))), axis=1)
    st_idx = np.arange(0, y.shape[-1] - blk + 1, hop)
    z = (c[:, st_idx + blk] - c[:, st_idx]) / blk
    zs = z.sum(axis=0)
    l = -0.691 + 10 * np.log10(zs + 1e-20)
    m = l > -70
    if not m.any():
        return -np.inf
    rel = -0.691 + 10 * np.log10(zs[m].mean()) - 10
    m &= l > rel
    return float(-0.691 + 10 * np.log10(zs[m].mean()))


def short_term(x, t0, t1):
    y = k_weight(x)[:, int(t0 * SR):int(t1 * SR)]
    return float(-0.691 + 10 * np.log10(np.mean(np.sum(y ** 2, axis=0)) + 1e-20))


# =====================================================================================
# instruments: drums
# =====================================================================================

def kick(vel=1.0, muffle=None):
    """909-ish kick: sine with a fast pitch sweep (~375 -> 155 -> 55 Hz, tail tuned to A1),
    click transient, gentle saturation, tail faded out before the next beat."""
    n = ns(0.40)
    t = tt(n)
    f = 55.0 + 100.0 * np.exp(-t / 0.024) + 220.0 * np.exp(-t / 0.0025)
    body = np.sin(2 * np.pi * (np.cumsum(f) - f[0]) / SR)
    amp = 0.6 * np.exp(-t / 0.21) + 0.4 * np.exp(-t / 0.05)
    amp *= np.minimum(1.0, t / 0.0005)
    k = ns(0.26)
    amp[k:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(n - k) / (n - k))
    x = sat(body * amp, 2.0)
    clk = bw(noise(n), 'band', (1500, 7000)) * np.exp(-t / 0.0022) * 0.30
    clk += np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.0012) * 0.18
    x = x + clk * np.minimum(1.0, t / 0.0003)
    if muffle is not None and muffle < 15000:
        x = bw(x, 'low', muffle, order=2, zero_phase=True)
        x[0] = 0.0
    return x * vel


def clap(vel=1.0):
    n = ns(0.42)
    t = tt(n)
    out = np.zeros((2, n))
    e = np.zeros(n)
    for k, o in enumerate((0.0, 0.0095, 0.0195, 0.0300)):
        tk = t - o
        m = tk >= 0
        e[m] += (0.8 if k < 3 else 1.0) * np.exp(-tk[m] / 0.0032) * np.minimum(1, tk[m] / 0.0003)
    tk = t - 0.030
    m = tk >= 0
    e[m] += 0.55 * np.exp(-tk[m] / 0.10)
    for ch in range(2):
        nz = noise(n)
        out[ch] = (bw(nz, 'band', (900, 2600)) * 1.0 + bw(nz, 'band', (2600, 6000)) * 0.25) * e
    out = fades(out, 0.0003, 0.05)
    return out * vel / np.abs(out).max()


HAT_FREQS = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0])


def hat(vel=1.0, open_=False):
    n = ns(0.34 if open_ else 0.09)
    t = tt(n)
    m = sum(pulse(f, n, RNG.random()) for f in HAT_FREQS * RNG.uniform(0.995, 1.005)) / 6
    m = bw(m, 'band', (6500, 12500))
    nz = bw(noise(n), 'high', 7000)
    tau = 0.075 if open_ else 0.020
    x = (0.7 * m + 0.6 * nz) * np.exp(-t / tau) * np.minimum(1, t / 0.0002)
    return fades(x, 0.0002, 0.03 if open_ else 0.01) * vel


def snare(vel=1.0, pitch=200.0, decay=0.13):
    n = ns(min(0.45, decay * 3 + 0.03))
    t = tt(n)
    f = pitch * (1 + 0.5 * np.exp(-t / 0.008))
    ph = np.cumsum(f) / SR
    tone = np.sin(2 * np.pi * ph) * np.exp(-t / 0.05) + 0.45 * np.sin(2 * np.pi * 1.62 * ph) * np.exp(-t / 0.03)
    nz = bw(noise(n), 'band', (1700, 9500)) * np.exp(-t / (decay * 0.55))
    x = (0.55 * tone + 1.1 * nz) * np.minimum(1, t / 0.0003)
    return fades(x, 0.0003, 0.02) * vel / 1.2


def crash(dur=2.6, bright=1.0):
    n = ns(dur)
    t = tt(n)
    out = np.zeros((2, n))
    for ch in range(2):
        nz = noise(n)
        x = 0.65 * bw(nz, 'high', 4500) + 0.3 * bw(nz, 'band', (2200, 7000))
        met = np.zeros(n)
        for _ in range(24):
            f = RNG.uniform(3000, 12000)
            met += np.sin(2 * np.pi * f * t + RNG.random() * 6.28) * np.exp(-t / RNG.uniform(0.4, 1.4))
        x += met * 0.05 * bright
        env = (0.7 * np.exp(-t / 0.85) + 0.6 * np.exp(-t / 0.10)) * np.minimum(1, t / 0.001)
        out[ch] = x * env
    return fades(out, 0.0005, 0.3) / np.abs(out).max()


def reverse_cymbal(dur):
    c = crash(dur + 0.02, bright=1.2)
    r = c[:, ::-1][:, -ns(dur):].copy()
    x = np.linspace(0, 1, r.shape[-1])
    r *= x ** 1.2
    r = fades(r, 0.05, 0.0012)
    return r / np.abs(r).max()


# =====================================================================================
# instruments: tonal
# =====================================================================================

SS_OFF = np.array([-1.0, -0.62, -0.28, 0.0, 0.27, 0.6, 1.0])
SS_AMP = np.array([0.8, 0.85, 0.9, 1.0, 0.9, 0.85, 0.8])


def supersaw(freq, n, detune=20.0, spread=0.85, voices=7):
    out = np.zeros((2, n))
    offs = SS_OFF if voices == 7 else np.linspace(-1, 1, voices)
    amps = SS_AMP if voices == 7 else np.ones(voices)
    f = np.asarray(freq, float)
    for o, a in zip(offs, amps):
        s = saw(f * 2 ** (o * detune / 1200), n, RNG.random()) * a
        gl, gr = panlaw(o * spread)
        out[0] += s * gl
        out[1] += s * gr
    return out / np.sqrt(voices)


def additive_saw(f, n, cutoff, q=0.8, poles=2, kmax=80):
    """Saw built from harmonics, each weighted by a resonant low-pass response at the
    time-varying cutoff: alias-free 'filtered saw' with a filter envelope."""
    t = tt(n)
    K = int(min(kmax, (SR * 0.45) // f))
    out = np.zeros(n)
    cutoff = np.broadcast_to(np.asarray(cutoff, float), (n,))
    ph = RNG.random()
    for k in range(1, K + 1):
        r = k * f / cutoff
        H = 1.0 / np.sqrt((1 - r * r) ** 2 + (r / q) ** 2)
        if poles == 4:
            H = H * H
        out += H * np.sin(2 * np.pi * (k * f * t + k * ph)) / k
    return out


def pluck(midi, dur=0.32, vel=1.0, bright=1.0, decay=0.16):
    f = float(hz(midi))
    n = ns(dur)
    t = tt(n)
    fc = 300 + 5200 * bright * vel * np.exp(-t / 0.055)
    x = additive_saw(f, n, fc, q=1.4) + 0.6 * additive_saw(f * 1.0046, n, fc * 0.9, q=1.2)
    x *= np.exp(-t / decay) * vel
    return fades(x, 0.0015, 0.03)


def bass_note(midi, dur, vel=1.0):
    f = float(hz(midi))
    n = ns(dur + 0.03)
    t = tt(n)
    x = 0.55 * saw(f, n, RNG.random()) + 0.45 * pulse(f, n, RNG.random(), 0.42)
    fc = 160 + 2400 * vel * np.exp(-t / 0.065) + 2.2 * f
    x = tvf(x, 'lp', fc, q=1.25, block=32)
    x = tvf(x, 'lp', fc * 1.4, q=0.6, block=32)
    sub = np.sin(2 * np.pi * f * 0.5 * t) * 0.85
    y = (x * 1.0 + sub) * vel
    env = np.ones(n)
    g = ns(dur)
    r = n - g
    env[g:] = np.linspace(1, 0, r) ** 2
    return fades(y * env, 0.002, 0.006)


def piano_note(midi, dur, vel=1.0):
    """M1-style house piano: inharmonic additive partials with fast-dying highs, a bell layer,
    a hammer thump, two slightly detuned copies."""
    f0 = float(hz(midi))
    n = ns(dur + 0.25)
    t = tt(n)
    x = np.zeros(n)
    B = 0.00035
    for det in (-3.5, 3.5):
        f = f0 * 2 ** (det / 1200)
        for k in range(1, 18):
            fk = k * f * np.sqrt(1 + B * k * k)
            if fk > 15000:
                break
            amp = (1.0 / k ** 0.85) * (1.0 if k > 1 else 1.1)
            tau = 1.1 / (1 + 0.55 * (k - 1))
            x += amp * np.sin(2 * np.pi * fk * t + RNG.random() * 6.28) * np.exp(-t / tau)
    for r, a, tau in ((2.0, 0.35, 0.18), (3.0, 0.22, 0.10), (4.2, 0.18, 0.06), (6.3, 0.10, 0.035)):
        x += a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t / tau) * 2.0
    x += bw(noise(n), 'band', (300, 3000)) * np.exp(-t / 0.006) * 0.6
    env = np.ones(n)
    g = ns(dur)
    env[g:] = np.exp(-(t[g:] - t[g]) / 0.05)
    x *= env * np.minimum(1, t / 0.0008)
    return fades(x, 0.0008, 0.04) * vel / 6.0


def bell(midi, dur=3.2, vel=1.0):
    """Bright FM + additive bell for the chakras."""
    f = float(hz(midi))
    n = ns(dur)
    t = tt(n)
    I = 3.0 * np.exp(-t / 0.35) + 0.5
    fm = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * 3.5 * f * t)) * np.exp(-t / 1.4)
    add = np.zeros(n)
    for r, a, tau in ((1.0, 1.0, 2.6), (2.0, 0.45, 1.5), (2.76, 0.35, 0.9), (4.07, 0.25, 0.55),
                      (5.43, 0.18, 0.32), (0.5, 0.25, 2.2)):
        if f * r < 16000:
            add += a * np.sin(2 * np.pi * f * r * t + RNG.random() * 6.28) * np.exp(-t / tau)
    x = (0.55 * fm + 0.8 * add) * np.minimum(1, t / 0.0008)
    return fades(x, 0.0008, 0.4) * vel


def orch_hit(notes, dark=False, dur=1.2):
    """Stacked brass-like saws + strings + noise burst (stereo) and a timpani (mono, returned apart)."""
    n = ns(dur)
    t = tt(n)
    brass = np.zeros((2, n))
    strings = np.zeros((2, n))
    for i, m in enumerate(notes):
        f = float(hz(m))
        for det in (-9, 0, 9):
            s = saw(f * 2 ** (det / 1200), n, RNG.random())
            brass += st(s, (det / 9) * 0.5 * (1 if i % 2 else -1))
        for det in (-14, -5, 5, 14):
            s = saw(f * 2 ** (det / 1200) * (1 + 0.002 * np.sin(2 * np.pi * 5.5 * t)), n, RNG.random())
            strings += st(s, det / 16)
    top = 2000.0 if dark else 5500.0
    fc = top * np.exp(-t / 0.16) + (450.0 if dark else 900.0)
    brass = tvf(brass, 'lp', fc, q=1.1, block=64)
    brass = tvf(brass, 'lp', fc * 1.5, q=0.7, block=64)
    strings = bw(strings, 'band', (250, 2800 if dark else 7000))
    env_b = (0.78 * np.exp(-t / 0.13) + 0.22 * np.exp(-t / 0.45)) * np.minimum(1, t / 0.0015)
    env_s = (0.6 * np.exp(-t / 0.22) + 0.4 * np.exp(-t / 0.6)) * np.minimum(1, t / 0.004)
    nb = bw(noise(n, 2), 'band', (700, 6000)) * np.exp(-t / 0.018) * (0.25 if dark else 0.5)
    x = brass * env_b / len(notes) + 0.55 * strings * env_s / len(notes) + nb
    x = sat(x * 0.9, 1.8)
    root = float(hz(min(notes) - (12 if not dark else 0)))
    while root > 120:
        root /= 2
    ft = root * (1 + 0.12 * np.exp(-t / 0.03))
    timp = np.sin(2 * np.pi * np.cumsum(ft) / SR) * np.exp(-t / 0.45)
    timp += bw(noise(n), 'low', 300) * np.exp(-t / 0.03) * 0.5
    timp *= np.minimum(1, t / 0.001)
    return fades(x, 0.001, 0.2), fades(timp, 0.001, 0.2)


def metal_body(f0, ratios, dur, beat_hz=(0.3, 1.6), tau0=7.0, tau_k=0.2, bloom=0.03, amp_k=0.7, pan=0.7):
    """Inharmonic partials in slowly beating pairs: gongs and singing bowls."""
    n = ns(dur)
    t = tt(n)
    out = np.zeros((2, n))
    for i, r in enumerate(ratios):
        f = f0 * r
        if f > 12000:
            continue
        amp = 1.0 / (1 + i) ** amp_k
        tau = tau0 / (1 + tau_k * r)
        bl = 1 - np.exp(-t / (0.004 + bloom * r))
        d = RNG.uniform(*beat_hz)
        p = RNG.uniform(-pan, pan)
        for sgn in (-1, 1):
            s = np.sin(2 * np.pi * (f + sgn * d / 2) * t + RNG.random() * 6.28) * amp * 0.5 * np.exp(-t / tau) * bl
            out += st(s, p + 0.15 * sgn)
    return out


GONG_R = [1.0, 1.47, 2.09, 2.76, 3.52, 4.18, 5.40, 6.27, 7.03, 8.93, 9.88, 11.4, 13.1, 15.6, 18.3, 21.9, 26.1, 31.5]
BOWL_R = [1.0, 2.71, 5.15, 8.27, 11.9]


def gong(f0=55.0, dur=9.0):
    x = metal_body(f0, GONG_R, dur, beat_hz=(0.2, 1.2), tau0=8.0, tau_k=0.22, bloom=0.012, amp_k=0.55)
    n = x.shape[-1]
    t = tt(n)
    thump = (np.sin(2 * np.pi * 41 * t) * np.exp(-t / 0.20) + bw(noise(n), 'low', 400) * np.exp(-t / 0.05) * 0.6)
    x = x * np.minimum(1, t / 0.004)
    return fades(x, 0.004, 0.5) / np.abs(x).max(), fades(thump * np.minimum(1, t / 0.002), 0.002, 0.2)


def bowl(f0=220.0, dur=10.0):
    x = metal_body(f0, BOWL_R, dur, beat_hz=(0.6, 2.4), tau0=9.0, tau_k=0.35, bloom=0.002, amp_k=0.9, pan=0.5)
    n = x.shape[-1]
    t = tt(n)
    x += st(bw(noise(n), 'band', (1500, 5000)) * np.exp(-t / 0.01) * 0.08)
    x *= np.minimum(1, t / 0.003)
    return fades(x, 0.003, 0.5) / np.abs(x).max()


def subdrop(dur=1.7):
    n = ns(dur)
    t = tt(n)
    f = 30.0 + 32.0 * np.exp(-t / 0.4)
    x = np.sin(2 * np.pi * (np.cumsum(f) - f[0]) / SR) * np.exp(-t / 0.75) * np.minimum(1, t / 0.010)
    return fades(x, 0.01, 0.3)


def riser(dur, white=False):
    n = ns(dur)
    x = np.linspace(0, 1, n)
    nz = noise(n, 2)
    fc = 250 * (9000 / 250) ** (x ** 1.4)
    r = tvf(nz, 'bp', fc, q=1.2 if not white else 0.6, block=128)
    if white:
        r = 0.6 * r + 0.5 * tvf(nz, 'hp', fc * 0.5, q=0.7, block=128)
    amp = x ** 2.2
    f = 110.0 * 2 ** (4.0 * x ** 1.6)
    s = supersaw(f, n, detune=35, voices=5)
    s = tvf(s, 'lp', f * 4, q=0.9, block=128) * (x ** 2.5) * 0.35
    y = (r * 1.0 + s) * amp
    return fades(y, 0.05, 0.003)


VOICING = {  # pad voicings (MIDI), ascending; the first is the bass root
    'A5': [45, 57, 64, 69],
    'Am': [45, 57, 64, 69, 72],
    'F':  [41, 57, 65, 69, 72],
    'C':  [48, 55, 64, 67, 72],
    'G':  [43, 55, 62, 67, 71],
    'E':  [40, 56, 64, 68, 71],
    'A':  [45, 57, 64, 69, 73],
}
CHOIR = {'A5': [64, 69, 76], 'Am': [64, 69, 72], 'F': [65, 69, 72], 'C': [64, 67, 72],
         'G': [62, 67, 71], 'E': [64, 68, 71], 'A': [64, 69, 73]}
PIANO = {'A5': [57, 64, 69], 'Am': [57, 60, 64, 69], 'F': [57, 60, 65, 69], 'C': [55, 60, 64, 67],
         'G': [55, 59, 62, 67], 'E': [56, 59, 64, 68], 'A': [57, 61, 64, 69]}
PCS = {'A5': [9, 4], 'Am': [9, 0, 4], 'F': [5, 9, 0], 'C': [0, 4, 7], 'G': [7, 11, 2], 'E': [4, 8, 11], 'A': [9, 1, 4]}
BASS_ROOT = {'A5': 45, 'Am': 45, 'F': 41, 'C': 48, 'G': 43, 'E': 40, 'A': 45}

# The hook (bars 12-15), composed for the score's word steps: per score word, its syllables as
# (flite text, offset in steps from the word, length in steps, MIDI note). A minor over Am F C G,
# held notes on "fire", "gold", "O(pus)" and "whole". Spellings steer flite: "led" is the metal,
# "too" is the sung (stressed) "to", "oh"/"pus" split "Opus" so each syllable gets its own note.
HOOK_MELODY = [
    [[('burn', 0, 2, 69)], [('me', 0, 2, 72)], [('in', 0, 2, 76)], [('the', 0, 2, 74)], [('fire', 0, 7.3, 76)]],
    [[('turn', 0, 2, 69)], [('my', 0, 2, 72)], [('led', 0, 2, 77)], [('too', 0, 2, 76)], [('gold', 0, 7.3, 72)]],
    [[('mag', 0, 2, 76), ('num', 2, 2, 74)], [('oh', 0, 5.6, 79), ('pus', 6, 2.6, 76)]],
    [[('I', 0, 3.7, 74)], [('am', 0, 3.7, 76)], [('whole', 0, 8.0, 79)]],
]
# Hook tease on a filtered pluck in the build (bar: [(step, length, midi)])
TEASE = {
    8: [(0, 2, 69), (2, 2, 72), (4, 2, 77), (6, 2, 76), (8, 6, 72)],
    9: [(0, 4, 74), (4, 4, 76), (8, 6, 79)],
    10: [(0, 2, 69), (2, 2, 72), (4, 2, 76), (6, 2, 74), (8, 6, 76)],
    11: [(0, 2, 68), (2, 2, 71), (4, 2, 74), (6, 2, 76)],
}
CHAKRA_NOTES = [81, 83, 84, 86, 88, 89, 92]  # A harmonic minor, A5 .. G#6: the crown's G# leads to the drop's A


# =====================================================================================
# voices: flite, rubberband, PSOLA, vocoder
# =====================================================================================

class Voice:
    def __init__(self, work):
        self.dir = Path(work) / 'voice'
        self.dir.mkdir(parents=True, exist_ok=True)

    def _run(self, args):
        r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] + args, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError('ffmpeg failed: ' + ' '.join(args) + '\n' + r.stderr)

    def flite(self, text, voice):
        key = hashlib.md5(f'{voice}|{text}'.encode()).hexdigest()[:10]
        out = self.dir / f'flite_{voice}_{key}.wav'
        if not out.exists():
            tf = self.dir / f'text_{key}.txt'
            tf.write_text(text, encoding='utf-8')
            self._run(['-f', 'lavfi', '-i', f'flite=textfile={tf}:voice={voice}', '-ar', '44100', '-af',
                       'aresample=resampler=soxr', '-c:a', 'pcm_f32le', str(out)])
        sr, x = wavfile.read(out)
        assert sr == SR
        return x.astype(float)

    def rubberband(self, x, tempo=1.0, pitch=1.0, formant='shifted'):
        key = hashlib.md5(x.tobytes() + f'{tempo:.6f}|{pitch:.6f}|{formant}'.encode()).hexdigest()[:12]
        out = self.dir / f'rb_{key}.wav'
        if not out.exists():
            src = self.dir / f'rbin_{key}.wav'
            pad = np.zeros(ns(0.15))
            wavfile.write(src, SR, np.concatenate([pad, x, pad]).astype(np.float32))
            self._run(['-i', str(src), '-af',
                       f'rubberband=tempo={tempo:.6f}:pitch={pitch:.6f}:formant={formant}:pitchq=quality:transients=crisp',
                       '-c:a', 'pcm_f32le', str(out)])
            src.unlink()
        sr, y = wavfile.read(out)
        return y.astype(float)


def trim(x, thr_db=-40.0, pre=0.0015, post=0.01):
    """Cut silence; the onset (first sample within thr_db of the peak) ends up `pre` s in."""
    a = np.abs(x)
    pk = a.max()
    idx = np.nonzero(a > pk * 10 ** (thr_db / 20))[0]
    i0 = max(0, idx[0] - ns(pre))
    i1 = min(len(x), idx[-1] + ns(post))
    y = x[i0:i1].copy()
    return fades(y, 0.001, 0.008)


def fit_len(x, n):
    if len(x) >= n:
        return fades(x[:n], 0.0005, 0.012)
    return np.concatenate([x, np.zeros(n - len(x))])


def f0_track(x, hop=220, win=1323, fmin=75.0, fmax=450.0):
    """Normalised-autocorrelation pitch track. Returns frame centres (samples), f0, voiced, rms."""
    pad = win // 2
    xp = np.pad(x, (pad, pad + win))
    nf = 1 + len(x) // hop
    fr = np.lib.stride_tricks.sliding_window_view(xp, win)[::hop][:nf].copy()
    fr -= fr.mean(axis=1, keepdims=True)
    w = np.hanning(win)
    F = np.fft.rfft(fr * w, 2 * win, axis=1)
    ac = np.fft.irfft(np.abs(F) ** 2, axis=1)[:, :win]
    acw = np.fft.irfft(np.abs(np.fft.rfft(w, 2 * win)) ** 2)[:win]
    acn = ac / np.maximum(acw, 1e-9) * (acw[0] / np.maximum(ac[:, :1], 1e-12))
    lo, hi = int(SR / fmax), int(SR / fmin)
    seg = acn[:, lo:hi]
    k = np.argmax(seg, axis=1) + lo
    conf = acn[np.arange(nf), k]
    # octave-error guard: prefer half the lag when it is almost as periodic
    for _ in range(2):
        kh = k // 2
        ok = (kh >= lo) & (acn[np.arange(nf), np.maximum(kh, 1)] > 0.86 * conf)
        k = np.where(ok, kh, k)
        conf = acn[np.arange(nf), k]
    km = np.clip(k, 1, win - 2)
    y0, y1, y2 = acn[np.arange(nf), km - 1], acn[np.arange(nf), km], acn[np.arange(nf), km + 1]
    den = y0 - 2 * y1 + y2
    with np.errstate(divide='ignore', invalid='ignore'):  # silent frames: 0/0 in the branch np.where drops
        delta = np.where(np.abs(den) > 1e-9, 0.5 * (y0 - y2) / den, 0.0)
    f0 = SR / (km + np.clip(delta, -0.5, 0.5))
    rms = np.sqrt(np.mean(fr ** 2, axis=1))
    voiced = (conf > 0.5) & (rms > 0.04 * rms.max())
    # keep only runs of >= 3 voiced frames; median-smooth f0 inside voiced runs
    v = voiced.copy()
    i = 0
    while i < nf:
        if v[i]:
            j = i
            while j < nf and v[j]:
                j += 1
            if j - i < 3:
                v[i:j] = False
            else:
                f0[i:j] = signal.medfilt(f0[i:j], 5) if j - i >= 5 else np.median(f0[i:j])
            i = j
        else:
            i += 1
    return np.arange(nf) * hop, f0, v, rms


UV_STEP = ns(0.004)


def pitch_marks(x, centres, f0, voiced):
    """Marks on the positive peak of a near-sinusoidal copy of the fundamental, so every grain is
    cut at the same phase of its period (inconsistent marks smear PSOLA into rough sidebands)."""
    fm = float(np.median(f0[voiced])) if voiced.any() else 150.0
    xl = bw(x, 'low', float(np.clip(1.25 * fm, 120, 450)), order=4, zero_phase=True)
    n = len(x)
    hop = centres[1] - centres[0] if len(centres) > 1 else 220
    marks = []
    p = 0
    pv = False
    T_prev = UV_STEP
    while True:
        cand = p + (T_prev if pv else UV_STEP)
        if cand >= n - 1:
            break
        fi = int(np.clip(round(cand / hop), 0, len(f0) - 1))
        if voiced[fi]:
            T = SR / f0[fi]
            if pv:
                lo, hi = int(cand - 0.3 * T), int(cand + 0.3 * T) + 1
            else:
                lo, hi = int(cand), int(cand + T) + 1
            lo, hi = max(p + 1, lo), min(n, hi)
            if hi <= lo:
                break
            h = int(T)
            if pv and p - h >= 0 and hi + h <= n:
                # the shift whose two-period window best matches the previous grain's: consecutive
                # grains stay phase-aligned, so re-spacing them gives an exactly periodic output
                w = np.hanning(2 * h)
                ref = x[p - h:p + h] * w
                segs = np.lib.stride_tricks.sliding_window_view(x[lo - h:hi - 1 + h], 2 * h) * w
                num = segs @ ref
                den = np.sqrt(np.sum(segs ** 2, axis=1) * np.sum(ref ** 2)) + 1e-12
                q = lo + int(np.argmax(num / den))
            else:
                q = lo + int(np.argmax(xl[lo:hi]))
            marks.append((q, T, True))
            p, pv, T_prev = q, True, T
        else:
            q = int(cand)
            marks.append((q, float(UV_STEP), False))
            p, pv = q, False
    return marks


def analyse_voice(x):
    c, f0, v, _ = f0_track(x)
    marks = pitch_marks(x, c, f0, v)
    vi = np.nonzero(v)[0]
    if len(vi):
        v0, v1 = int(c[vi[0]]), int(min(len(x), c[vi[-1]] + 220))
    else:
        v0, v1 = 0, len(x)
    return dict(x=x, marks=marks, v0=v0, v1=v1, f0=float(np.median(f0[v])) if v.any() else 0.0)


LEAD_SOS = signal.butter(4, (150, 1000), 'band', fs=SR, output='sos')


def lead_in(y):
    """Length (s) of a word's unvoiced lead-in: up to the first 5 ms frame whose 150-1000 Hz (vowel F1)
    energy is within 20 dB of the word's maximum there. s, sh, f, h, t, p and breath have little energy in
    that band; vowels and voiced consonants (r, l, m, n, w) have most of theirs. (The autocorrelation
    voicing flag is unreliable this close to an onset: it missed the r of "right" and fired inside "sh".)"""
    b = signal.sosfiltfilt(LEAD_SOS, y)
    w = ns(0.005)
    k = len(b) // w
    e = 10 * np.log10(np.mean(b[:k * w].reshape(k, w) ** 2, axis=1) + 1e-14)
    return int(np.argmax(e >= e.max() - 20.0)) * w / SR


def pre_roll(y, cap=0.12):
    """How far ahead of its beat a word should start so that it is heard on the beat. A word's perceived
    onset (P-centre) sits near its vowel, so an unvoiced or breathy lead-in (s, sh, h, t, p, a breath) makes
    it sound late: start it earlier by ~70 % of an audible consonant and by all of a near-silent one.
    Lead-ins under 25 ms are just the attack of the voice: no pre-roll."""
    v0 = ns(lead_in(y))
    if v0 < ns(0.025):
        return 0.0
    w = ns(0.01)
    k = len(y) // w
    pk = np.sqrt(np.mean(y[:k * w].reshape(k, w) ** 2, axis=1)).max()
    lead = np.sqrt(np.mean(y[:v0] ** 2))
    return float(min(cap, (1.0 if lead < pk * 10 ** (-24 / 20) else 0.7) * v0 / SR))


def warp_map(an, n_out):
    """Output-sample -> input-sample map: consonants ~1:1, the voiced nucleus stretched/compressed."""
    n0 = len(an['x'])
    v0, v1 = an['v0'], an['v1']
    pre, voi, post = v0, max(1, v1 - v0), n0 - v1
    if n_out >= n0:
        knots = [(0, 0), (pre, v0), (n_out - post, v1), (n_out, n0)]
    else:
        cut = n0 - n_out
        cv = min(cut, 0.55 * voi)
        rest = cut - cv
        cons = max(1, pre + post)
        pre2 = pre - rest * pre / cons
        post2 = post - rest * post / cons
        voi2 = voi - cv
        knots = [(0, 0), (pre2, v0), (pre2 + voi2, v1), (pre2 + voi2 + post2, n0)]
    ko = np.array([k[0] for k in knots], float)
    ki = np.array([k[1] for k in knots], float)
    return np.interp(np.arange(n_out), ko, ki)


def psola(an, n_out, warp, f_out):
    """TD-PSOLA: Hann grains two analysis periods long, centred on pitch marks, re-spaced at the
    target period (formants preserved), fractional placement by interpolation."""
    x = an['x']
    mk = an['marks']
    if not mk:
        return np.zeros(n_out)
    mp = np.array([m[0] for m in mk], float)
    mT = np.array([m[1] for m in mk], float)
    mv = np.array([m[2] for m in mk], bool)
    xi = np.arange(len(x), dtype=float)
    y = np.zeros(n_out + 4096)
    off = 2048
    t = 0.0
    while t < n_out:
        ti = warp[min(n_out - 1, int(t))]
        k = int(np.clip(np.searchsorted(mp, ti), 0, len(mp) - 1))
        if k > 0 and abs(mp[k - 1] - ti) < abs(mp[k] - ti):
            k -= 1
        if mv[k]:
            Ta = mT[k]
            Ts = SR / f_out[min(n_out - 1, int(t))]
            L = Ta
            g = np.sqrt(Ts / Ta)
        else:
            Ta = Ts = L = float(UV_STEP)
            g = 1.0
        j0, j1 = int(np.ceil(t - L)), int(np.floor(t + L))
        js = np.arange(j0, j1 + 1)
        u = js - t
        w = 0.5 + 0.5 * np.cos(np.pi * u / L)
        y[js + off] += g * w * np.interp(mp[k] + u, xi, x, left=0.0, right=0.0)
        t += Ts
    return y[off:off + n_out]


def stft(x, nfft=1024, hop=256):
    w = np.hanning(nfft + 1)[:-1]
    xp = np.pad(x, (nfft // 2, nfft + hop))
    nf = 1 + len(x) // hop
    fr = np.lib.stride_tricks.sliding_window_view(xp, nfft)[::hop][:nf]
    return np.fft.rfft(fr * w, axis=1)


def istft(X, n, nfft=1024, hop=256):
    w = np.hanning(nfft + 1)[:-1]
    fr = np.fft.irfft(X, n=nfft, axis=1) * w
    out = np.zeros(n + 2 * nfft + hop)
    ws = np.zeros_like(out)
    for i in range(fr.shape[0]):
        out[i * hop:i * hop + nfft] += fr[i]
        ws[i * hop:i * hop + nfft] += w * w
    out = out / np.maximum(ws, 1e-3)
    return out[nfft // 2:nfft // 2 + n]


def cep_envelope(mag, keep=0.002, nfft=1024):
    """Cepstrally smoothed spectral envelope (lifter below `keep` seconds of quefrency)."""
    c = np.fft.irfft(np.log(mag + 1e-7), n=nfft, axis=1)
    q = int(keep * SR)
    lw = np.zeros(nfft)
    taper = 0.5 + 0.5 * np.cos(np.pi * np.arange(q) / q)
    lw[:q] = taper
    lw[nfft - q + 1:] = taper[1:][::-1]
    return np.exp(np.fft.rfft(c * lw, axis=1).real)


def vocoder(mod, carrier, nfft=1024, hop=256, noise_amt=0.6, sib=0.35):
    """Spectral-envelope transfer: the carrier (whitened by a +6 dB/oct tilt, plus noise for
    consonants) takes the modulator's cepstral envelope frame by frame; frame energy follows
    the modulator; the modulator's sibilance above 4.5 kHz is passed through."""
    n = len(mod)
    M = stft(mod, nfft, hop)
    C = stft(carrier, nfft, hop)
    f = np.fft.rfftfreq(nfft, 1 / SR)
    magM = np.abs(M)
    env = cep_envelope(magM, 0.002, nfft)
    # flite is 16 kHz, resampled: its passband ends near 7.2 kHz and the smoothed envelope starts falling
    # into the resampler's stopband from ~6.7 kHz. Continue it above 6.4 kHz from its 5.8-6.4 kHz level with
    # a gentle roll-off (air). (Anchoring at 7.4 kHz, inside the stopband, cut the hook ~20 dB above 7.3 kHz.)
    ka, kb = np.searchsorted(f, 5800), np.searchsorted(f, 6400)
    ref = np.exp(np.mean(np.log(env[:, ka:kb] + 1e-12), axis=1, keepdims=True))
    env[:, kb:] = ref * (6400 / f[kb:]) ** 1.5
    tilt = np.clip(f / 400.0, 0.25, 40.0)
    Cw = C * tilt
    ref = np.sqrt(np.mean(np.abs(Cw) ** 2, axis=1, keepdims=True)) + 1e-9
    Cw = Cw / ref
    hf = (magM[:, f > 3000] ** 2).sum(1) / ((magM ** 2).sum(1) + 1e-12)
    ng = np.clip((hf - 0.2) / 0.45, 0, 1) * noise_amt + 0.015
    Nz = stft(noise(n), nfft, hop)
    Nz /= np.sqrt(np.mean(np.abs(Nz) ** 2, axis=1, keepdims=True)) + 1e-9
    Y = (Cw + ng[:, None] * Nz) * env
    eM = (magM ** 2).sum(1)
    eY = (np.abs(Y) ** 2).sum(1) + 1e-12
    Y *= np.sqrt(eM / eY)[:, None]
    y = istft(Y, n, nfft, hop)
    y += sib * bw(mod, 'high', 4500, order=4)
    return y


# =====================================================================================
# composition
# =====================================================================================

class Song:
    def __init__(self, score, work):
        self.S = score
        self.T = Timing(score)
        self.N = self.T.n
        self.V = Voice(work)
        self.stems = {}
        self.chords = score['chords']
        self.energy = score['energy']
        self.ev = {k: pattern_events(self.T, v) for k, v in score['drums'].items()}

    def stem(self, name, ch=2):
        if name not in self.stems:
            self.stems[name] = np.zeros((2, self.N)) if ch == 2 else np.zeros(self.N)
        return self.stems[name]

    def bt(self, beat):
        return self.T.b(beat)

    # ------------------------------------------------------------------ drums
    def drums(self):
        T = self.T
        K = self.stem('kick', 1)
        for (t, v, acc, bar, s) in self.ev['kick']:
            beat = t / T.beat
            if beat < 16:
                x = np.clip((beat - 4) / 12.0, 0, 1)
                fc = 250.0 * 64.0 ** (x ** 2.2)
                place(K, kick(0.8 + 0.15 * x, muffle=fc), t)
            else:
                place(K, kick(1.0 if acc else 0.9), t)
        # clip the kick on its own channel (oversampled): a louder, denser kick whose transient
        # no longer drives the master limiter
        pk = np.abs(K).max()
        K[:] = softclip(K / pk * 2.0, knee=0.5)[0] * pk / 2.0 * 1.6
        C = self.stem('clap')
        SN = self.stem('snare')
        for (t, v, acc, bar, s) in self.ev['clap']:
            row = self.S['drums']['clap'][bar]
            fill = s >= 12 and not (s == 12 and row[4] != '.')
            g = (1.0 if acc else 0.85) * (0.75 if bar < 4 else 1.0)
            if fill and not acc:
                g *= 0.6 + 0.1 * (s - 12)
            place(C, clap(g), t)
            if fill:
                place(SN, snare(0.55 + 0.12 * (s - 12), pitch=205 + 12 * (s - 12), decay=0.12), t)
        H = self.stem('hats')
        acc16 = [0.62, 0.34, 0.42, 0.44]
        for (t, v, acc, bar, s) in self.ev['closedHat']:
            e = self.energy[bar]
            g = acc16[int(s) % 4] * (0.55 + 0.45 * e) * (0.7 if bar < 4 else 1.0)
            place(H, hat(g), t, pan=0.18)
        for (t, v, acc, bar, s) in self.ev['openHat']:
            e = self.energy[bar]
            place(H, hat(0.75 * (0.6 + 0.4 * e) * (0.75 if bar < 4 else 1.0), open_=True), t, pan=-0.12)
        R = self.stem('roll')
        t_a, t_b = self.bt(32), self.bt(46)
        for (t, v, acc, bar, s) in self.ev['roll']:
            x = (t - t_a) / (t_b - t_a)
            vel = 0.22 + 0.78 * x ** 1.3
            place(R, snare(vel, pitch=180 + 160 * x, decay=0.16 - 0.1 * x), t, pan=0.1 * np.sin(40 * t))
        CR = self.stem('crash')
        for h in self.S['hits']:
            if h['type'] == 'crash':
                place(CR, crash(2.8 if h['beat'] < 64 else 1.9), self.bt(h['beat']))
        for sw in self.S['sweeps']:
            if sw['type'] == 'reverseCymbal':
                a, b = self.bt(sw['fromBeat']), self.bt(sw['toBeat'])
                name = 'revcym_gap' if self.in_gap(sw['fromBeat']) else 'revcym'
                r = reverse_cymbal(b - a)
                place(self.stem(name), r, ns(b) - r.shape[-1])

    def in_gap(self, beat):
        g = self.S['gap']
        return g['fromBeat'] <= beat < g['toBeat']

    def gap_span(self):
        g = self.S['gap']
        return self.bt(g['fromBeat']), self.bt(g['toBeat'])

    def until_gap(self, x, t):
        """An event that starts before the gap ends at the gap (6 ms fade, like the gap gate): the gate only
        mutes the gap, so without this a long note's tail would come back after it, on top of the drop."""
        ga, _ = self.gap_span()
        if t >= ga or t + x.shape[-1] / SR <= ga:
            return x
        k = max(1, ns(ga - t))
        return fades(x[..., :k], 0.0, min(0.006, k / SR))

    # ------------------------------------------------------------------ fx and hits
    def fx(self):
        T = self.T
        for h in self.S['hits']:
            t = self.bt(h['beat'])
            if h['type'] == 'gong':
                g, thump = gong(55.0, 9.0 if h['beat'] == 0 else 3.0)
                place(self.stem('gong'), g, t)
                place(self.stem('low', 1), thump * 0.8, t)
                b = bowl(220.0 if h['beat'] == 0 else 277.18, 10.0 if h['beat'] == 0 else 3.0)
                place(self.stem('gong'), b * 0.55, t + 0.003)
            elif h['type'] == 'orchHit':
                chord = self.chords[min(16, int(h['beat'] // 4))]
                dark = 'dark' in h.get('note', '') or h['beat'] < 16
                if dark:
                    notes = [33, 45, 52, 57, 60]
                elif chord == 'A':
                    notes = [45, 57, 61, 64, 69, 73, 76]
                else:
                    notes = [45, 57, 60, 64, 69, 72, 76]
                x, timp = orch_hit(notes, dark=dark, dur=1.6 if dark else 1.2)
                place(self.stem('orch'), x, t)
                place(self.stem('low', 1), timp * (0.9 if dark else 0.7), t)
            elif h['type'] == 'subDrop':
                place(self.stem('low', 1), subdrop(1.8 if h['beat'] < 64 else 1.7), t)
        for sw in self.S['sweeps']:
            if sw['type'] == 'riser':
                a, b = self.bt(sw['fromBeat']), self.bt(sw['toBeat'])
                place(self.stem('riser'), riser(b - a, white=sw['fromBeat'] >= 32) * (0.8 if sw['fromBeat'] < 16 else 1.0), a)
        # chakra bells, ascending, with an octave-up shimmer echo
        B = self.stem('bells')
        ga, _ = self.gap_span()
        for i, c in enumerate(self.S['chakras']):
            t = self.bt(c['beat'])
            m = CHAKRA_NOTES[i % len(CHAKRA_NOTES)]
            place(B, self.until_gap(bell(m, 3.0, 0.8 + 0.03 * i), t), t, pan=-0.35 + 0.7 * (i % 2))
            sh = bell(m + 12, 2.0, 0.3)
            for k in range(1, 5):
                te = t + k * 3 * T.step
                if t < ga <= te:
                    break  # the crown bell's echoes would land in the gap / on the drop
                place(B, self.until_gap(sh * 0.62 ** k, te), te, pan=0.6 if k % 2 else -0.6)

    # ------------------------------------------------------------------ nigredo atmosphere
    def nigredo(self):
        T = self.T
        n = ns(T.t(4))
        t = tt(n)
        x = (saw(55.0, n, 0.1) + 0.7 * saw(55.0 * 1.0016, n, 0.6) + 0.5 * saw(110.0 * 0.9993, n, 0.3)
             + 0.35 * saw(164.81, n, 0.8))
        body = tvf(x, 'lp', 300 + 180 * np.sin(2 * np.pi * 0.11 * t) ** 2, q=0.9, block=128)
        ot = keys_curve(n, [(0, 660), (T.t(1), 1320), (T.t(2), 880), (T.t(3), 1100), (T.t(4), 1650)], True)
        over = tvf(x, 'bp', ot, q=14, block=64) * 1.8
        env = keys_curve(n, [(0, 0), (T.t(0, 1.5), 0.9), (T.t(1), 1.0), (T.t(2), 0.55), (T.t(3, 3), 0.35), (T.t(4), 0.0)])
        drone = (body * 0.5 + over * 0.6) * env
        place(self.stem('drone'), drone, 0.0)
        place(self.stem('low', 1), np.sin(2 * np.pi * 55 * t) * env * 0.35, 0.0)
        # wind
        nw = ns(T.t(4))
        tw = tt(nw)
        wn = noise(nw, 2)
        fc = 550 + 420 * np.sin(2 * np.pi * 0.21 * tw) + 260 * np.sin(2 * np.pi * 0.47 * tw + 1)
        w = tvf(wn, 'bp', fc, q=1.6, block=128)
        wenv = keys_curve(nw, [(0, 0), (1.2, 0.5), (3.0, 0.9), (5.0, 0.6), (T.t(4), 0.0)]) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.6 * tw))
        place(self.stem('wind'), w * wenv * 0.5, 0.0)
        # breath in, right before "Nigredo"
        nb = ns(0.62)
        tb = tt(nb)
        br = tvf(noise(nb, 2), 'bp', 900 + 1600 * (tb / tb[-1]), q=0.9) * (tb / tb[-1]) ** 2.5
        place(self.stem('wind'), fades(br, 0.05, 0.05) * 0.9, T.t(1) - 0.62 - 0.03)
        # reverse swell into bar 1: a reversed hall tail of an A minor chord, ending exactly on beat 4
        chord = sum(piano_note(m, 0.3, 1.0) for m in (45, 57, 60, 64, 69, 76))
        ir = make_ir(3.2, 3.0, 1.6, pre=0.0, seed=7)
        wet = convolve(st(np.pad(chord, (0, ns(3.4)))), ir)
        L = ns(T.beat * 2)
        rev = wet[:, ::-1][:, -L - ns(0.02):-ns(0.02)]
        rev = fades(rev / np.abs(rev).max(), 0.3, 0.004) * np.linspace(0, 1, L) ** 1.5
        place(self.stem('swell'), rev, ns(T.t(1)) - L)

    # ------------------------------------------------------------------ harmony
    def pad(self):
        T = self.T
        P = self.stem('pad')
        for bar in range(1, 17):
            name = self.chords[bar]
            notes = [m for m in VOICING[name] if m >= 55]
            drop = bar == 12  # nothing may start inside the gap: the drop begins on its first sample
            t0 = T.t(bar) - (0.0 if drop else 0.015)
            t1 = T.t(bar + 1) + 0.08 if bar < 16 else T.dur
            n = ns(t1 - t0)
            x = sum(supersaw(hz(m), n, 21.0) for m in notes) / len(notes) ** 0.5
            if bar == 16:
                x += 0.6 * supersaw(hz(81), n, 18.0) + 0.5 * supersaw(hz(85), n, 18.0)
            g = {1: 1.0, 2: 1.0, 3: 1.0}.get(bar, 0.55 if bar < 8 else 0.7 if bar < 12 else 0.62 if bar < 16 else 1.0)
            # (the E chord of bar 11 used to run 80 ms past the gap, i.e. into the A minor drop)
            place(P, self.until_gap(fades(x, 0.002 if drop else 0.015, 0.08 if bar < 16 else 0.5) * g, t0), t0)
        fc = keys_curve(self.N, [(0, 250), (T.t(1), 280), (T.t(2), 480), (T.t(3), 1300), (T.t(3, 3), 3800),
                                 (T.t(4), 6500), (T.t(8), 6500), (T.t(11, 2), 9500), (T.t(12), 9500),
                                 (T.t(16), 10000), (T.t(16, 3), 2500), (T.dur, 900)], True)
        P[:] = tvf(P, 'lp', fc, q=1.25, block=128)
        P[:] = tvf(P, 'lp', fc * 1.3, q=0.6, block=128)
        P[:] = chorus(P, mix=0.25)
        P[:] = eq(P, 'peak', 450, 0.9, -3.0)  # keep the low mids clear for the vocals

    def choir(self):
        T = self.T
        Ch = np.zeros((2, self.N))
        for bar in range(4, 17):
            name = self.chords[bar]
            notes = CHOIR[name] + ([57] if bar >= 12 else [])
            drop = bar == 12
            t0 = T.t(bar) - (0.0 if drop else 0.25)
            t1 = (T.t(bar + 1) + 0.35) if bar < 16 else T.dur
            if bar == 11:
                t1 = T.t(11, 2)
            n = ns(t1 - t0)
            tl = tt(n)
            x = np.zeros((2, n))
            for i, m in enumerate(notes):
                for v in range(3):
                    rate = 5.0 + RNG.random() * 0.8
                    dep = 10 + RNG.random() * 8
                    f = hz(m) * 2 ** ((dep * np.sin(2 * np.pi * rate * tl + RNG.random() * 6.28) + RNG.uniform(-7, 7)) / 1200)
                    x += st(saw(f, n, RNG.random()), RNG.uniform(-0.8, 0.8))
            g = 0.55 if bar < 8 else 0.7 if bar < 12 else 0.75 if bar < 16 else 1.0
            place(Ch, fades(x, 0.04 if drop else 0.3, 0.35 if bar != 11 else 0.02) * g / len(notes), t0)
        form = (eq(Ch, 'bp', 700, 4.0) * 1.0 + eq(Ch, 'bp', 1220, 6.0) * 0.55 + eq(Ch, 'bp', 2600, 8.0) * 0.28
                + eq(Ch, 'bp', 3400, 9.0) * 0.12)
        form += 0.08 * bw(Ch, 'low', 1000)
        self.stems['choir'] = form

    def bass(self):
        T = self.T
        B = self.stem('bass', 1)
        groove = [(2, 0, 1.0, 1.5), (6, 0, 0.95, 1.5), (7, 12, 0.55, 0.7), (10, 0, 1.0, 1.5), (14, 0, 0.95, 1.5), (15, 12, 0.55, 0.7)]
        drop = [(2, 0, 1.0, 1.5), (3, 12, 0.5, 0.7), (6, 0, 0.95, 1.5), (7, 12, 0.6, 0.7), (10, 0, 1.0, 1.5),
                (11, 12, 0.5, 0.7), (14, 0, 0.95, 1.5), (15, 7, 0.6, 0.7)]
        for bar in range(4, 16):
            pat = drop if bar >= 12 else groove
            root = BASS_ROOT[self.chords[bar]]
            for (s, iv, v, L) in pat:
                t = T.t(bar, 0, s)
                if self.in_gap(t / T.beat) or (bar == 11 and s >= 8):
                    continue
                place(B, bass_note(root + iv, L * T.step, v), t)
        place(B, bass_note(45, T.beat * 3.2, 1.0) * np.exp(-tt(ns(T.beat * 3.2 + 0.03)) / 0.9), T.t(16))
        # drive the bass into an oversampled soft clipper: denser, more audible on small speakers,
        # and its filter-envelope attacks stop poking out of the mix
        pk = np.abs(B).max()
        r0 = np.sqrt(np.mean(B ** 2))
        B[:] = softclip(B / pk * 1.8, knee=0.45)[0]
        B *= r0 / np.sqrt(np.mean(B ** 2))

    def piano(self):
        T = self.T
        P = self.stem('piano')
        for bar in range(12, 16):
            notes = PIANO[self.chords[bar]]
            steps = [2, 6, 10, 14] + ([7] if bar in (13, 15) else [])
            for s in steps:
                v = 1.0 if s in (2, 10) else 0.85
                x = sum(piano_note(m, 0.16, v) for m in notes)
                place(P, x, T.t(bar, 0, s), pan=0.0)
        x = sum(piano_note(m, 1.4, 1.0) for m in PIANO['A'] + [69, 73])
        place(P, x, T.t(16))
        P[:] = chorus(P, base_ms=9, depth_ms=1.2, rate=0.8, mix=0.3)

    def arp(self):
        T = self.T
        A = self.stem('arp')
        pat = [0, 2, 4, 2, 1, 3, 5, 3, 2, 4, 6, 4, 1, 3, 5, 3]
        for bar in list(range(4, 8)) + list(range(12, 16)):
            name = self.chords[bar]
            tones = [m for m in range(57, 90) if m % 12 in PCS[name]][:7]
            for s in range(16):
                m = tones[pat[s] % len(tones)]
                v = 0.85 if s % 4 == 0 else 0.6
                br = 0.5 + 0.5 * self.energy[bar] if bar < 12 else 0.55
                place(A, pluck(m, 0.24, v, br, 0.12), T.t(bar, 0, s), pan=0.45 * np.sin(s * 1.7))
        for bar, notes in TEASE.items():
            for (s, L, m) in notes:
                d = L * T.step
                x = pluck(m, d + 0.25, 0.9, 0.35 + 0.2 * (bar - 8), decay=max(0.2, d * 0.8))
                place(self.stem('tease'), x, T.t(bar, 0, s))
        tz = self.stems['tease']
        k = ns(T.t(11, 2))
        tz[:, k:] = 0.0

    def melody(self):
        """Hook syllables with absolute times, and the global pitch curve (MIDI, glides, scoops,
        vibrato) shared by the sung voice, the vocoder carrier and the supersaw lead."""
        T = self.T
        syl = []
        for li, line in enumerate(self.S['vocals']['hook']):
            mel = HOOK_MELODY[li]
            assert len(mel) == len(line['words']), 'hook melody does not match score words'
            for wi, (word, step) in enumerate(line['words']):
                for (txt, off, L, m) in mel[wi]:
                    syl.append(dict(t=T.t(line['bar'], 0, step + off), dur=L * T.step, midi=m, text=txt, word=word))
        t_end = T.t(16) + 0.05
        n = self.N
        midi = np.full(n, np.nan)
        for s in syl:
            midi[ns(s['t']):ns(s['t'] + s['dur'])] = s['midi']
        # hold the last note between syllables (for glides), before the first: the first note
        first = ns(syl[0]['t'])
        midi[:first] = syl[0]['midi']
        idx = np.where(np.isnan(midi), 0, np.arange(n))
        np.maximum.accumulate(idx, out=idx)
        midi = midi[idx]
        a = np.exp(-1 / (0.028 * SR))
        zi = signal.lfilter_zi([1 - a], [1, -a]) * midi[0]
        mid, _ = signal.lfilter([1 - a], [1, -a], midi, zi=zi)
        tl = tt(n)
        prev_end = -1.0
        for s in syl:
            i0, i1 = ns(s['t']), ns(s['t'] + s['dur'])
            u = tl[i0:i1] - s['t']
            if s['t'] - prev_end > 0.06:
                mid[i0:i1] += -0.55 * np.exp(-u / 0.045)
            if s['dur'] > 0.35:
                mid[i0:i1] += 0.2 * np.sin(2 * np.pi * 5.6 * u) * smoothstep((u - 0.16) / 0.3)
            prev_end = s['t'] + s['dur']
        self.syl = syl
        self.mel_midi = mid
        self.hook_span = (syl[0]['t'] - 0.1, t_end)

    def lead(self):
        T = self.T
        a, b = self.hook_span
        i0, i1 = ns(a), ns(b + 0.4)
        n = i1 - i0
        f = hz(self.mel_midi[i0:i1])
        gate = np.zeros(n)
        fenv = np.zeros(n)
        tl = tt(n)
        for s in self.syl:
            s0, s1 = ns(s['t']) - i0, ns(s['t'] + s['dur']) - i0
            e = np.zeros(n)
            e[s0:s1] = 1.0
            r = ns(0.06)
            e[s1:s1 + r] = np.linspace(1, 0, len(e[s1:s1 + r]))
            gate = np.maximum(gate, e)
            u = tl - (s['t'] - a)
            fenv = np.where(u >= 0, np.exp(-np.maximum(u, 0) / 0.2), fenv)
        gate = uniform_filter1d(gate, ns(0.004))
        x = supersaw(f, n, 18.0, 0.9) + 0.35 * supersaw(f * 2, n, 14.0, 1.0, voices=5) + st(0.3 * pulse(f / 2, n, 0.3))
        fc = 1500 + 6000 * fenv
        x = tvf(x, 'lp', fc, q=0.9, block=64)
        place(self.stem('lead'), x * gate, i0)
        # the coda: the lead turns to gold, a held A major triad
        n2 = ns(T.dur - T.t(16))
        t2 = tt(n2)
        c = sum(supersaw(hz(m), n2, 16.0) for m in (69, 73, 76, 81)) * 0.55
        c = tvf(c, 'lp', 1200 + 7000 * np.exp(-t2 / 0.5), q=0.8, block=64) * np.exp(-t2 / 1.4)
        place(self.stem('lead'), fades(c, 0.003, 0.3), T.t(16))

    # ------------------------------------------------------------------ voices
    def announcer(self):
        V = self.V
        A = self.stem('announcer')
        for a in self.S['vocals']['announcer']:
            t = self.bt(a['beat'])
            text = a['text']
            if a['beat'] < 20:
                x = trim(V.flite(text, 'rms'))
                main = trim(V.rubberband(x, tempo=0.80, pitch=2 ** (-6 / 12)))
                low = trim(V.rubberband(x, tempo=0.80, pitch=2 ** (-18 / 12)))
                n = max(len(main), len(low))
                y = fit_len(main, n) + 0.55 * fit_len(low, n)
                y = sat(y / np.abs(y).max() * 1.4, 2.2)
                y = eq(y, 'ls', 160, 0.7, 4.0)
                y = eq(y, 'peak', 2200, 1.0, 3.0)
                y = eq(y, 'hp', 45)
                place(A, st(y), t)
                self.ann_nig = (t, len(y) / SR)
            else:
                x = trim(V.flite(text, 'rms'))
                x2 = trim(V.flite(text, 'awb'))
                main = trim(V.rubberband(x, tempo=0.95, pitch=2 ** (-2 / 12)))
                dbl = trim(V.rubberband(x2, tempo=len(x2) / len(x) * 0.95, pitch=2 ** (-4 / 12)))
                low = trim(V.rubberband(x, tempo=0.95, pitch=2 ** (-14 / 12)))
                n = max(len(main), len(dbl), len(low))
                y = fit_len(main, n) + 0.45 * fit_len(dbl, n) + 0.35 * fit_len(low, n)
                y = sat(y / np.abs(y).max() * 2.0, 2.8)
                y = eq(y, 'peak', 3200, 0.9, 5.0)
                y = eq(y, 'hs', 6000, 0.7, 3.0)
                # the shout fills the gap on its own: at 0.7 with a 90 Hz high-pass the "silence" measured
                # -9.3 LUFS momentary, within 1 LU of the build and 2 LU of the drop. ~4 dB down and the sub
                # band left empty for the drop's kick and sub drop
                y = eq(y, 'hp', 120)
                place(A, st(y) * 0.45, t)
                self.ann_rub = (t, len(y) / SR)

    def rap(self):
        T, V = self.T, self.V
        words = []
        for line in self.S['vocals']['rap']:
            ws = line['words']
            for i, (w, s) in enumerate(ws):
                nxt = ws[i + 1][1] if i + 1 < len(ws) else min(16, s + 6)
                words.append((T.t(line['bar'], 0, s), w.strip(',.!?').lower(), (nxt - s) * T.step))
        self.rap_words = words
        main = np.zeros(self.N)
        dl = np.zeros(self.N)
        dr = np.zeros(self.N)
        weak = {'on', 'the', 'to', 'a', 'in'}
        src = []
        for (t, w, avail) in words:
            x = trim(V.flite(w, 'rms'))
            src.append(x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * (0.08 if w in weak else 0.1))

        def dur(x, avail):
            n0 = len(x) / SR
            return min(float(np.clip(n0, 0.55 * avail, 0.9 * avail)), 1.3 * n0)

        def say(x, D, tm=1.0, pc=-2.5):
            y = trim(V.rubberband(x, tempo=len(x) / SR / D * tm, pitch=2 ** (pc / 12)))
            return fit_len(y, ns(D / tm))
        # P-centre: each word starts ahead of its beat by its consonant lead-in, so "Shadow", "Holy", "Self"
        # are heard on the beat (their vowels came up to a 16th late); the word before gives up that time
        pre = [pre_roll(say(x, dur(x, av))) for x, (t, w, av) in zip(src, words)]
        self.rap_timing = []
        for i, (x, (t, w, avail)) in enumerate(zip(src, words)):
            joined = i + 1 < len(words) and abs(words[i + 1][0] - (t + avail)) < 1e-6  # next word, same line
            nxt_pre = pre[i + 1] if joined else 0.0
            # its slot runs from its own pre-rolled start to the next word's; the 15 ms fade-out may overlap
            # the next word's consonant by 20 ms
            D = min(dur(x, avail), 0.9 * (avail + pre[i] - nxt_pre) + 0.02)
            y0 = say(x, D)
            p = min(pre[i], pre_roll(y0))  # a word squeezed for the next one's pre-roll has a shorter lead-in
            for buf, tm, pc, dt_ in ((main, 1.0, -2.5, 0.0), (dl, 1.012, -2.35, 0.011), (dr, 0.988, -2.65, 0.017)):
                y = y0 if tm == 1.0 else say(x, D, tm, pc)
                place(buf, fades(y, 0.002, 0.015), t - p + dt_)
            self.rap_timing.append((w, round(t, 3), round(p * 1000, 1), round((lead_in(y0) - p) * 1000, 1)))
        y = main
        y = eq(y, 'hp', 150, 0.8)
        y = eq(y, 'lp', 7500, 0.7)
        y = eq(y, 'peak', 350, 1.0, -3.0)
        y = eq(y, 'peak', 2600, 1.0, 4.0)
        pk = np.abs(y).max()
        y = sat(y / pk * 1.6, 1.8)
        d = sat((eq(eq(dl, 'hp', 180), 'lp', 6500)) / pk * 1.6, 1.8)
        e = sat((eq(eq(dr, 'hp', 180), 'lp', 6500)) / pk * 1.6, 1.8)
        out = st(y) + 0.42 * np.vstack([d, e * 0.8]) + 0.42 * np.vstack([d * 0.25, e])
        slap = np.zeros_like(out)
        place(slap, bw(out.mean(0), 'band', (300, 3500)) * 0.28, ns(T.step))
        slap = slap[::-1]  # opposite side (L<->R swap)
        self.stems['rap'] = out + slap

    def hook(self):
        T, V = self.T, self.V
        n = self.N
        tuned = np.zeros(n)
        modu = np.zeros(n)
        self.hook_f0 = []
        src = [trim(V.flite(s['text'], 'slt')) for s in self.syl]
        ans = [analyse_voice(x) for x in src]
        # P-centre: a syllable starts ahead of its note by its unvoiced/breathy lead-in ("turn", "pus", the
        # breathy "I" sang their vowels 60-130 ms late), taking the time from the gap before it and at most
        # 30 % of the previous note; nothing starts inside the gap
        _, gb = self.gap_span()
        pre = []
        for k, (s, an) in enumerate(zip(self.syl, ans)):
            p = pre_roll(an['x'])
            if k:
                q = self.syl[k - 1]
                p = min(p, max(0.0, s['t'] - (q['t'] + q['dur']) + 0.3 * q['dur']))
            if s['t'] >= gb - 1e-9:
                p = min(p, s['t'] - gb)
            pre.append(p)
        self.hook_timing = []
        for k, s in enumerate(self.syl):
            x, an = src[k], ans[k]
            nxt = self.syl[k + 1]['t'] if k + 1 < len(self.syl) else None
            legato = nxt is not None and nxt - (s['t'] + s['dur']) < 0.03
            start = s['t'] - pre[k]
            end = s['t'] + s['dur'] - (0.0 if legato else 0.015)
            if nxt is not None:
                end = min(end, nxt - pre[k + 1] - (0.0 if legato else 0.005))
            D = end - start
            n_out = ns(D)
            warp = warp_map(an, n_out)
            i0 = ns(start)
            self.hook_timing.append((s['text'], round(s['t'], 3), round(pre[k] * 1000, 1),
                                     round(float(np.argmax(warp >= ns(lead_in(x))) / SR - pre[k]) * 1000, 1)))
            seg = self.mel_midi[i0:i0 + n_out]
            y = psola(an, n_out, warp, hz(seg - 12))
            m = psola(an, n_out, warp, np.full(n_out, 140.0))
            rel = 0.012 if legato else 0.04
            y = fades(y, 0.002, rel)
            m = fades(m, 0.002, rel)
            lvl = 0.1 * (1.12 if s['dur'] > 0.4 else 0.92 if s['text'] in ('the', 'to', 'in', 'my', 'me') else 1.0)
            vo = (warp >= an['v0']) & (warp < an['v1'])
            g_t = lvl / (np.sqrt(np.mean(y[vo] ** 2)) + 1e-9) if vo.any() else 1.0
            g_m = lvl / (np.sqrt(np.mean(m[vo] ** 2)) + 1e-9) if vo.any() else 1.0
            place(tuned, y * g_t, i0)
            place(modu, m * g_m, i0)
            self.hook_f0.append((s['text'], an['f0'], len(x) / SR, D))
        self.hook_tuned = tuned
        self.hook_mod = modu
        # carriers: melody pitch, saws + an octave below, two detuned doubles for L and R
        a, b = self.hook_span
        i0, i1 = ns(a), ns(b + 0.2)
        f = hz(self.mel_midi[i0:i1])
        nn = i1 - i0
        outs = []
        for det in (+7, -7):
            # oversampled saws: the vocoder whitens the carrier (+6 dB/oct), which would lift PolyBLEP's
            # top-octave aliasing into the hook's air band
            c = (saw_os(f * 2 ** (det / 1200), nn, RNG.random()) + 0.6 * saw_os(f * 2 ** (-det / 1200), nn, RNG.random())
                 + 0.45 * saw_os(f / 2, nn, RNG.random()) + 0.2 * saw_os(f * 2, nn, RNG.random()))
            v = vocoder(modu[i0:i1], c)
            outs.append(v)
        voc = np.zeros((2, n))
        voc[0, i0:i1] = outs[0]
        voc[1, i0:i1] = outs[1]
        f_t = 0.72 * hz(self.mel_midi - 12)
        tun = tvf(tvf(tuned, 'hp', f_t, q=0.7, block=128), 'hp', f_t, q=0.7, block=128)
        tun = eq(tun, 'peak', 3000, 1.0, 3.0)
        voc = eq(voc, 'hp', 160)
        voc = eq(voc, 'peak', 2800, 0.9, 2.5)
        vk = np.abs(voc).max()
        voc = sat(voc / vk, 1.3)
        tun = sat(tun / np.abs(tun).max(), 1.2)
        out = voc * 0.9 + st(tun) * 0.55
        dbl = np.zeros(n)
        place(dbl, tun, ns(0.013))
        out += np.vstack([dbl * 0.22, dbl * 0.12])
        self.stems['hook'] = out
        # coda: a vocoded echo of "whole" on an A major chord
        x = trim(V.flite('whole', 'slt'))
        an = analyse_voice(x)
        n_out = ns(1.25)
        m = psola(an, n_out, warp_map(an, n_out), np.full(n_out, 140.0))
        m = fades(m, 0.003, 0.5) * np.sqrt(np.mean(x ** 2)) / (np.sqrt(np.mean(m ** 2)) + 1e-9)
        tc = tt(n_out)
        car = sum(saw_os(hz(mm) * (1 + 0.003 * np.sin(2 * np.pi * 5.2 * tc + i)), n_out, RNG.random())
                  for i, mm in enumerate((57, 64, 69, 73, 76)))
        e = vocoder(m, car, noise_amt=0.4)
        e = eq(e, 'hp', 180) * np.exp(-tc / 0.9)
        place(self.stem('echo'), st(e / np.abs(e).max()), T.t(16, 1))

    # ------------------------------------------------------------------ all
    def compose(self):
        steps = [('drums', self.drums), ('fx', self.fx), ('nigredo', self.nigredo), ('pad', self.pad),
                 ('choir', self.choir), ('bass', self.bass), ('piano', self.piano), ('arp', self.arp),
                 ('melody', self.melody), ('lead', self.lead), ('announcer', self.announcer),
                 ('rap', self.rap), ('hook', self.hook)]
        for name, fn in steps:
            fn()
            log('composed', name)


# =====================================================================================
# mix and master
# =====================================================================================

GAINS = {  # dB, before the master gain
    'kick': -1.5, 'clap': 3.0, 'snare': -3.0, 'hats': -9.0, 'roll': -7.0, 'crash': -11.0, 'revcym': -12.0,
    'revcym_gap': -10.0, 'bass': -7.0, 'low': -6.0, 'pad': -6.0, 'choir': -6.0, 'piano': -5.0, 'arp': -14.0,
    'tease': -12.0, 'lead': -12.0, 'bells': -17.0, 'orch': -2.0, 'gong': -9.0, 'drone': -8.0, 'wind': -10.0,
    'swell': -5.0, 'riser': -13.0, 'announcer': -3.0, 'rap': 0.0, 'hook': 0.0, 'echo': -3.0,
}
SEND_HALL = {'pad': 0.12, 'choir': 0.45, 'piano': 0.22, 'lead': 0.22, 'bells': 0.6, 'orch': 0.55, 'gong': 0.35,
             'clap': 0.10, 'rap': 0.10, 'hook': 0.28, 'arp': 0.25, 'tease': 0.4, 'crash': 0.08, 'snare': 0.15,
             'echo': 0.8, 'drone': 0.3, 'swell': 0.2, 'riser': 0.15, 'roll': 0.08}
SEND_PLATE = {'clap': 0.30, 'snare': 0.35, 'hook': 0.25, 'rap': 0.16, 'lead': 0.10, 'roll': 0.15, 'piano': 0.1}
SEND_DELAY = {'hook': 0.22, 'lead': 0.14, 'arp': 0.30, 'tease': 0.35, 'bells': 0.25, 'echo': 0.4, 'piano': 0.08}
PUMPED = {'pad': 0.65, 'choir': 0.45, 'bass': 0.8, 'lead': 0.4, 'piano': 0.35, 'arp': 0.5, 'tease': 0.4, 'hall': 0.5,
          'delay': 0.4}
LOW_GROUP = ('kick', 'bass', 'low')
DUCKED = ('pad', 'choir', 'piano', 'arp', 'lead', 'tease')  # everything else is high-passed at ~130 Hz


def pump_curve(T, kicks, n, depth, release=0.21):
    g = np.ones(n)
    L = ns(release + 0.03)
    u = tt(L)
    shape = np.where(u < 0.003, u / 0.003, np.where(u < 0.018, 1.0, (1 - smoothstep((u - 0.018) / release))))
    for (t, v, acc, bar, s) in kicks:
        i0 = ns(t) - ns(0.001)
        d = depth * (0.4 if t < T.t(4) else 1.0)
        seg = g[i0:i0 + L]
        np.minimum(seg, 1 - d * shape[:len(seg)], out=seg)
    return g


def gap_gate(song):
    g = np.ones(song.N)
    a, b = ns(song.bt(song.S['gap']['fromBeat'])), ns(song.bt(song.S['gap']['toBeat']))
    r = ns(0.006)
    g[a - r:a] = np.linspace(1, 0, r)
    g[a:b] = 0.0
    o = ns(0.001)  # reopen over 1 ms ending exactly on the drop's first sample (only old tails there)
    g[b - o:b] = np.linspace(0, 1, o + 1)[:-1]
    return g, a, b


def mix(song):
    """Gain staging, high-passes, sidechain pumping, sends, build sweep, the gap. Returns the
    pre-master stereo sum."""
    T, N = song.T, song.N
    S = song.stems
    gate, ga, gb = gap_gate(song)
    sc = {k: pump_curve(T, song.ev['kick'], N, d) for k, d in PUMPED.items()}
    hall_ir = make_ir(2.4, 2.2, 1.1, pre=0.025, seed=11)
    plate_ir = make_ir(1.4, 1.3, 0.9, pre=0.004, seed=12, er=0, build=0.003, lp=13000)
    ann_ir = make_ir(5.0, 4.6, 2.2, pre=0.035, seed=13)
    send_h = np.zeros((2, N))
    send_p = np.zeros((2, N))
    send_d = np.zeros((2, N))
    bus = np.zeros((2, N))
    proc = {}
    # vocal-keyed dynamic EQ: while the rap or the hook sings, the harmony instruments dip (up to
    # 6 dB) in the 0.9-5 kHz band, so the words sit on top without the music getting smaller
    vox = (st(S['rap']) * 10 ** (GAINS['rap'] / 20) + st(S['hook']) * 10 ** (GAINS['hook'] / 20)).mean(0)
    vb = bw(vox, 'band', (300, 4000))
    a = np.exp(-1.0 / (0.015 * SR))
    e = np.sqrt(signal.lfilter([1 - a], [1, -a], vb ** 2))
    e /= np.percentile(e[e > 1e-5], 90)
    ddb = 20 * np.log10(1 - 0.5 * np.clip(e, 0, 1))
    idx = np.arange(N)
    rate = 30.0 / SR  # recover at 30 dB/s
    ddb = np.minimum.accumulate(ddb - idx * rate) + idx * rate
    duck = 10 ** (ddb / 20)
    song.vocal_duck = duck
    for name, x in S.items():
        if name in ('announcer', 'revcym_gap'):
            continue
        y = st(x) * 10 ** (GAINS.get(name, -12) / 20)
        if name not in LOW_GROUP:
            y = eq(y, 'hp', 130 if name not in ('orch', 'gong', 'drone') else 90, 0.7)
        if name in DUCKED:
            band = bw(y, 'band', (900, 5000), order=2, zero_phase=True)
            y = y - band * (1 - duck)
        if name in PUMPED:
            y = y * sc[name]
        proc[name] = y
        bus += y
        send_h += SEND_HALL.get(name, 0) * y
        send_p += SEND_PLATE.get(name, 0) * y
        send_d += SEND_DELAY.get(name, 0) * y
    # the build: a high-pass sweep on the music (not drums, not the tease) from bar 8 into the gap
    hp_fc = keys_curve(N, [(0, 20), (T.t(8), 20), (T.t(10), 140), (T.t(11), 420), (T.t(11, 2), 1100),
                           (T.t(12) - 0.001, 1100), (T.t(12), 20), (T.dur, 20)], True)
    a8, a12 = ns(T.t(8)), ns(T.t(12))
    music = sum(proc[k] for k in ('pad', 'choir', 'bass', 'arp', 'low') if k in proc)
    swept = tvf(music[:, a8:a12], 'hp', hp_fc[a8:a12], q=0.9, block=64)
    bus[:, a8:a12] += swept - music[:, a8:a12]
    # reverb and delay returns: what was sent before the gap ends at the gap for good, and only what is sent
    # from the drop on is heard after it (the gate alone let the build's hall, plate and echo tails, a
    # G#6 bell and its echoes among them, come back on top of the A minor drop)
    kill = gate.copy()
    kill[ga:] = 0.0
    post = np.zeros(N)
    post[gb:] = 1.0

    def ret(send, fx):
        return fx(send * kill) * kill + fx(send * post)
    hall = ret(send_h, lambda s: eq(eq(convolve(s, hall_ir), 'hp', 220), 'lp', 9000)) * 0.9
    plate = ret(send_p, lambda s: eq(convolve(s, plate_ir), 'hp', 300)) * 0.8
    dly = ret(send_d, lambda s: pingpong(s, 3 * T.step, fb=0.42, taps=7, lp=4500, hp=350)) * 0.7
    hall *= sc['hall']
    dly *= sc['delay']
    bus += hall + plate + dly
    # the gap: everything stops except the announcer (with its own hall) and its reverse cymbal
    bus = bus * gate
    ann = st(S['announcer']) * 10 ** (GAINS['announcer'] / 20)
    ann_wet = eq(eq(convolve(ann, ann_ir), 'hp', 150), 'lp', 8000)
    ann_bus = ann + 0.75 * ann_wet
    rev_gap = st(S['revcym_gap']) * 10 ** (GAINS['revcym_gap'] / 20)
    master = bus + ann_bus + rev_gap
    # the score's per-bar energy as macro dynamics (from ALBEDO on): the verse sits ~1.5 dB under
    # the drop, the build climbs into it, so the limiter leaves the drop the biggest moment
    pts = []
    for bar, e in enumerate(song.energy):
        gdb = 0.0 if bar < 4 or bar >= 12 else -4.5 * (1.0 - e)
        pts += [(T.t(bar) + 0.02, gdb), (T.t(bar + 1) - 0.02, gdb)]
    pts[0] = (0.0, pts[0][1])
    macro = 10 ** (keys_curve(N, pts) / 20)
    master = master * macro
    song.macro = macro
    song.proc = proc
    song.buses = dict(gated=bus, announcer=ann_bus, revcym_gap=rev_gap, gate=gate)
    return master


def glue(master):
    """DC/subsonic high-pass, then a gentle 2:1 bus compressor at a fixed working level."""
    # causal on purpose: a zero-phase (forward-backward) high-pass rings *before* every low-frequency
    # onset, so the master started on a -24 dBFS DC step at sample 0 and the drop's sub pre-echoed into
    # the gap. A causal 22 Hz filter also removes the DC, so no mean subtraction (that was a step too).
    master = bw(master, 'high', 22, order=2)
    # mono below 120 Hz: high-pass the side channel
    mid, side = 0.5 * (master[0] + master[1]), 0.5 * (master[0] - master[1])
    side = bw(side, 'high', 120, order=4, zero_phase=True)
    master = np.vstack([mid + side, mid - side])
    master = eq(master, 'hs', 9000, 0.7, -2.5)  # tame the crash/hat/saw fizz a little
    pre = 10 ** ((-16.0 - lufs(master)) / 20)
    master = master * pre
    master, _ = compressor(master, thr_db=-17.0, ratio=2.0, attack=0.012, release=0.16, knee=8.0, rms=0.01)
    return master, pre


def finalize(song, master, pre, ceiling_db=-1.5, target=-9.0):
    """Loudness to target through a 2x-oversampled soft clipper and the true-peak limiter, then the
    ending: a decay into digital silence that is exactly zero for the last 25 ms."""
    T, N = song.T, song.N
    # the ending: from 28.75 s the coda decays (linear in dB) into digital silence at 29.975 s
    fade_db = np.interp(tt(N), [0, 28.75, 29.90, T.dur], [0, 0, -48, -48])
    fade = 10 ** (fade_db / 20)
    k = ns(29.90)
    fade[k:] *= np.linspace(1, 0, N - k) ** 2
    fade[ns(29.975):] = 0.0
    g = 10 ** ((target - lufs(master)) / 20)
    for it in range(8):
        y = softclip(master * g, knee=0.82)
        y, lg = tp_limiter(y, ceiling_db)
        y = y * fade
        L = lufs(y)
        if abs(L - target) < 0.03:
            break
        g *= 10 ** ((target - L) / 20)
    tp = true_peak(y)
    lim = 10 ** (ceiling_db / 20)
    if tp > lim:
        y *= lim / tp
    song.master_gain = pre * g
    song.limiter_gain = lg
    return y


# =====================================================================================
# analysis, verification, images
# =====================================================================================

def colormap(v):
    stops = np.array([[0, 0, 0, 4], [0.2, 40, 11, 84], [0.4, 120, 28, 109], [0.6, 205, 66, 72],
                      [0.8, 249, 142, 9], [1.0, 252, 255, 164]], float)
    v = np.clip(v, 0, 1)
    out = np.zeros(v.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(v, stops[:, 0], stops[:, c + 1])
    return out.astype(np.uint8)


def spectrogram_png(x, path, title, T, t0=0.0, t1=None, width=1600, height=520, fmin=40, fmax=16000, rng_db=80):
    from PIL import Image, ImageDraw
    m = x.mean(0) if np.ndim(x) == 2 else x
    t1 = T.dur if t1 is None else t1
    m = m[int(t0 * SR):int(t1 * SR)]
    nfft = 4096 if t1 - t0 > 8 else 2048
    hop = max(1, len(m) // width)
    w = np.hanning(nfft)
    xp = np.pad(m, (nfft // 2, nfft))
    fr = np.lib.stride_tricks.sliding_window_view(xp, nfft)[::hop][:width]
    S = np.abs(np.fft.rfft(fr * w, axis=1)) + 1e-10
    db = 20 * np.log10(S)
    db -= db.max()
    f = np.fft.rfftfreq(nfft, 1 / SR)
    fy = np.exp(np.linspace(np.log(fmax), np.log(fmin), height))
    img = np.array([np.interp(fy, f, col) for col in db]).T
    rgb = colormap((img + rng_db) / rng_db)
    pad_t, pad_l = 26, 54
    im = Image.new('RGB', (width + pad_l + 6, height + pad_t + 22), (12, 10, 16))
    im.paste(Image.fromarray(rgb), (pad_l, pad_t))
    d = ImageDraw.Draw(im)
    d.text((pad_l, 6), title, fill=(230, 230, 230))
    for bar in range(int(np.ceil(t0 / T.bar)), int(t1 / T.bar) + 1):
        tb = bar * T.bar
        if t0 <= tb <= t1:
            xx = pad_l + int((tb - t0) / (t1 - t0) * width)
            d.line([(xx, pad_t), (xx, pad_t + height)], fill=(90, 200, 255) if bar % 4 == 0 else (70, 70, 90), width=1)
            d.text((xx + 2, pad_t + height + 4), str(bar), fill=(180, 180, 200))
    for fq in (50, 100, 300, 1000, 3000, 10000):
        if fmin <= fq <= fmax:
            yy = pad_t + int(np.interp(np.log(fq), np.log(fy[::-1]), np.arange(height)[::-1]))
            d.line([(pad_l - 6, yy), (pad_l, yy)], fill=(200, 200, 200))
            d.text((4, yy - 6), f'{fq if fq < 1000 else str(fq // 1000) + "k"}', fill=(200, 200, 200))
    im.save(path)


def detect_kicks(k, T, expected, thr=0.08):
    """Blind onset detection on the kick stem (envelope rise after near-silence), then match."""
    a = np.abs(k)
    env = maximum_filter1d(a, ns(0.002))
    pk = env.max()
    on = []
    i = 0
    above = env > thr * pk
    quiet = env < 0.01 * pk
    n = len(a)
    while i < n:
        j = np.argmax(above[i:])
        if not above[i + j]:
            break
        i += j
        w = a[max(0, i - ns(0.03)):i + ns(0.05)]
        first = max(0, i - ns(0.03)) + int(np.argmax(w > 0.1 * w.max()))
        on.append(first / SR)
        # re-arm only after the hit has died away (hysteresis)
        q = np.argmax(quiet[first + ns(0.02):])
        i = first + ns(0.02) + max(1, q)
    on = np.array(on)
    errs = []
    for t in expected:
        k_ = np.argmin(np.abs(on - t))
        errs.append((on[k_] - t) * 1000)
    return on, np.array(errs)


def band_energy(x, t0, t1, lo=300, hi=3000):
    m = x.mean(0) if np.ndim(x) == 2 else x
    seg = m[int(t0 * SR):int(t1 * SR)]
    if len(seg) < 64:
        return -120.0
    y = bw(seg, 'band', (lo, hi), order=2)
    return 10 * np.log10(np.mean(y ** 2) + 1e-20)


def verify(song, y, wav, mp3, out_dir):
    T = song.T
    rep = {}
    rep['samples'] = y.shape[-1]
    rep['limiter_ceiling_dbtp'] = round(song.ceiling, 2)
    rep['duration_s'] = y.shape[-1] / SR
    rep['lufs_integrated'] = lufs(y)
    rep['true_peak_dbtp'] = 20 * np.log10(true_peak(y))
    rep['sample_peak_dbfs'] = 20 * np.log10(np.abs(y).max())
    rep['dc'] = [float(v) for v in y.mean(axis=1)]
    rep['last_50ms_peak'] = float(np.abs(y[:, -ns(0.025):]).max())
    sect = {'nigredo 0-4': (0, 4), 'albedo 4-8': (4, 8), 'citrinitas 8-11.5': (8, 11.5), 'rubedo 12-16': (12, 16), 'coda 16-17': (16, 17)}
    rep['section_loudness_lufs'] = {k: round(short_term(y, T.t(a), T.t(b)), 1) for k, (a, b) in sect.items()}
    # balance: each processed stem's loudness (at master gain, before the limiter) per section
    lv = {}
    for name, x in sorted(song.proc.items()):
        kw = k_weight(x * song.master_gain)
        row = []
        for k, (a, b) in sect.items():
            seg = kw[:, int(T.t(a) * SR):int(T.t(b) * SR)]
            v = -0.691 + 10 * np.log10(np.mean(np.sum(seg ** 2, axis=0)) + 1e-20)
            row.append(round(v, 1) if v > -60 else None)
        lv[name] = row
    for name in ('announcer', 'revcym_gap'):
        kw = k_weight(song.buses[name] * song.master_gain)
        lv[name + ' (bus)'] = [round(float(-0.691 + 10 * np.log10(np.mean(np.sum(kw[:, int(T.t(a) * SR):int(T.t(b) * SR)] ** 2, axis=0)) + 1e-20)), 1)
                               for (a, b) in sect.values()]
    rep['stem_lufs_by_section(' + ','.join(sect) + ')'] = lv
    # stereo: correlation per section, and the side/mid energy ratio below 120 Hz (should be ~0)
    lo = bw(y, 'low', 120, order=4)
    rep['low_side_to_mid_db'] = round(float(10 * np.log10(np.sum((lo[0] - lo[1]) ** 2) / np.sum((lo[0] + lo[1]) ** 2) + 1e-20)), 1)
    rep['lr_correlation'] = round(float(np.corrcoef(y[0], y[1])[0, 1]), 3)
    # kick timing
    exp_k = np.array([e[0] for e in song.ev['kick']])
    on, errs = detect_kicks(song.stems['kick'], T, exp_k)
    rep['kick_expected'] = len(exp_k)
    rep['kick_detected'] = len(on)
    rep['kick_max_abs_err_ms'] = float(np.abs(errs).max())
    rep['kick_mean_err_ms'] = float(errs.mean())
    # the master must not be shifted against the kick stem (look-ahead, filters): cross-correlate the
    # 150 Hz-8 kHz band (the attack). Below that the causal 22 Hz DC filter's phase lead (~1.7 ms at
    # 55 Hz, not a delay: nothing comes out before it goes in) would bias a broadband correlation.
    km = bw(song.stems['kick'][:ns(14)], 'band', (150, 8000), order=4, zero_phase=True)
    mm = bw(y.mean(0)[:ns(14)], 'band', (150, 8000), order=4, zero_phase=True)
    cc = signal.correlate(mm, km, mode='full', method='fft')
    rep['master_vs_kick_stem_lag_samples'] = int(np.argmax(cc) - (len(km) - 1))
    # gap
    ga, gb = song.bt(song.S['gap']['fromBeat']), song.bt(song.S['gap']['toBeat'])
    gseg = slice(ns(ga), ns(gb - 0.0012))
    gb_ = song.buses['gated'][:, gseg]
    rep['gap_other_content_peak'] = float(np.abs(gb_).max())
    allowed = song.buses['announcer'][:, gseg] + song.buses['revcym_gap'][:, gseg]
    rep['gap_allowed_rms_dbfs_premaster'] = float(10 * np.log10(np.mean(allowed ** 2) + 1e-20) + 20 * np.log10(song.master_gain))
    rep['gap_master_rms_dbfs'] = float(10 * np.log10(np.mean(y[:, gseg] ** 2) + 1e-20))
    # vocals
    vox = song.stems['rap'] + song.stems['hook'] + st(song.stems['announcer'])
    floor = band_energy(vox, T.t(9), T.t(10))
    words = []
    for (t, w, av) in song.rap_words:
        words.append(('rap', w, round(t, 3), round(band_energy(song.stems['rap'], t, t + 0.2), 1),
                      round(band_energy(song.stems['rap'], t - 0.12, t - 0.005), 1)))
    for s in song.syl:
        words.append(('hook', s['text'], round(s['t'], 3), round(band_energy(song.stems['hook'], s['t'], s['t'] + min(0.2, s['dur'])), 1),
                      round(band_energy(song.stems['hook'], s['t'] - 0.12, s['t'] - 0.005), 1)))
    for a in song.S['vocals']['announcer']:
        t = song.bt(a['beat'])
        words.append(('announcer', a['text'], round(t, 3), round(band_energy(song.stems['announcer'], t, t + 0.3), 1),
                      round(band_energy(song.stems['announcer'], t - 0.12, t - 0.005), 1)))
    rep['vocal_words'] = words
    rep['vocal_floor_bar9_db'] = round(floor, 1)
    # P-centre placement: how far each word starts ahead of its beat, and where its vowel (sonorant) onset lands
    rep['rap_timing(word, t, pre_roll_ms, vowel_onset_ms_vs_beat)'] = song.rap_timing
    rep['hook_timing(syllable, t, pre_roll_ms, vowel_onset_ms_vs_beat)'] = song.hook_timing
    # the master must start from silence (no step at sample 0)
    rep['first_1ms_peak'] = float(np.abs(y[:, :ns(0.001)]).max())
    rep['first_sample'] = [float(v) for v in y[:, 0]]
    # hook pitch accuracy: f0 of the tuned layer per syllable vs the note (an octave below the melody)
    pa = []
    for s in song.syl:
        # track the whole syllable (pre-roll included), judge the frames from 40 ms after the note starts to
        # 30 ms before it ends that are voiced and within 9 dB of the syllable's loudest frame (a short vowel
        # fading into its "s", like "pus", leaves too few frames: reported as None)
        i0 = ns(s['t'] - 0.13)
        seg = song.hook_tuned[i0:ns(s['t'] + s['dur'])]
        c, f0, v, r = f0_track(seg, fmin=150, fmax=500)
        tc = (i0 + c) / SR
        v &= (r > 0.35 * r.max()) & (tc > s['t'] + 0.04) & (tc < s['t'] + s['dur'] - 0.03)
        if v.sum() >= 3:
            want = hz(song.mel_midi[i0 + c[v]] - 12)
            cents = 1200 * np.log2(f0[v] / want)
            pa.append((s['text'], s['midi'], round(float(np.median(cents)), 1)))
        else:
            pa.append((s['text'], s['midi'], None))
    rep['hook_pitch_cents_vs_note'] = pa
    # mp3
    if mp3:
        pr = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,bit_rate,size:stream=sample_rate,channels,codec_name,start_time,duration',
                             '-of', 'json', str(mp3)], capture_output=True, text=True)
        rep['mp3_ffprobe'] = json.loads(pr.stdout)
        d = decode_audio(mp3, out_dir)
        rep['mp3_decoded_samples'] = d.shape[-1]
        a_ = y.mean(0)[:ns(12)]
        b_ = d.mean(0)[:ns(12)]
        cc = signal.correlate(b_, a_, mode='full', method='fft')
        lag = int(np.argmax(cc) - (len(a_) - 1))
        rep['mp3_lag_samples'] = lag
        nmin = min(d.shape[-1], y.shape[-1])
        err = d[:, :nmin] - y[:, :nmin]
        rep['mp3_vs_wav_snr_db'] = float(10 * np.log10(np.sum(y[:, :nmin] ** 2) / np.sum(err ** 2)))
        rep['mp3_true_peak_dbtp'] = 20 * np.log10(true_peak(d))
        rep['mp3_lufs'] = lufs(d)
        rep['mp3_bytes'] = Path(mp3).stat().st_size
    return rep


def encode_mp3(wav, mp3):
    Path(mp3).parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav), '-c:a', 'libmp3lame',
                    '-b:a', '192k', '-ar', '44100', '-ac', '2', '-write_xing', '1',
                    '-metadata', 'title=Magnum Opus (Rubedo Radio Edit)', '-metadata', 'artist=RemoteFunLand',
                    str(mp3)], check=True)


def decode_audio(path, work):
    """Decode with ffmpeg (which applies the LAME encoder-delay/padding tag) to float stereo."""
    dec = Path(work) / 'decoded_check.wav'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(path), '-c:a', 'pcm_f32le', str(dec)], check=True)
    sr, d = wavfile.read(dec)
    assert sr == SR
    return d.T.astype(float)


# =====================================================================================
# main
# =====================================================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--wav', required=True, help='lossless master (32-bit float WAV)')
    ap.add_argument('--mp3', help='web MP3 (192 kbps)')
    ap.add_argument('--stems', help='folder for stems, voice renders and analysis (default: next to the WAV)')
    ap.add_argument('--score', default=str(SCORE_PATH))
    ap.add_argument('--no-verify', action='store_true')
    ap.add_argument('--no-stems', action='store_true')
    ap.add_argument('--lufs', type=float, default=-9.0, help='integrated loudness target (BS.1770)')
    ap.add_argument('--ceiling', type=float, default=-1.5, help='start true-peak ceiling, dBTP')
    args = ap.parse_args()
    wav = Path(args.wav)
    wav.parent.mkdir(parents=True, exist_ok=True)
    out_dir = Path(args.stems) if args.stems else wav.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    score = load_score(args.score)
    song = Song(score, out_dir)
    log(f"score: {score['bpm']} BPM, {score['bars']} bars, {song.N} samples")
    song.compose()
    glued, pre = glue(mix(song))
    log('mixed')
    # master; if the decoded MP3 overshoots -1 dBTP (lossy coding adds inter-sample peaks), lower
    # the limiter ceiling so the WAV and the MP3 stay the same master
    ceiling = args.ceiling
    mp3 = Path(args.mp3) if args.mp3 else None
    for attempt in range(5):
        y = finalize(song, glued, pre, ceiling, args.lufs)
        wavfile.write(wav, SR, y.T.astype(np.float32))
        if mp3 is None:
            break
        encode_mp3(wav, mp3)
        tp = 20 * np.log10(true_peak(decode_audio(mp3, out_dir)))
        log(f'master ceiling {ceiling:.2f} dBTP -> decoded MP3 true peak {tp:.2f} dBTP')
        if tp <= -1.0:
            break
        ceiling -= tp + 1.0 + 0.08
    song.ceiling = ceiling
    log('wrote', wav, mp3 or '')
    if not args.no_stems:
        sd = out_dir / 'stems'
        sd.mkdir(exist_ok=True)
        g = song.master_gain
        for name, x in song.stems.items():
            wavfile.write(sd / f'{name}.wav', SR, (st(x) * g * 10 ** (GAINS.get(name, -12) / 20)).T.astype(np.float32))
        vox = song.stems['rap'] * 10 ** (GAINS['rap'] / 20) + song.stems['hook'] * 10 ** (GAINS['hook'] / 20) \
            + st(song.stems['announcer']) * 10 ** (GAINS['announcer'] / 20)
        wavfile.write(sd / 'vocals.wav', SR, (vox * g).T.astype(np.float32))
        spectrogram_png(y, out_dir / 'spec_mix.png', 'MAGNUM OPUS master (bars marked)', song.T)
        spectrogram_png(vox, out_dir / 'spec_vocals.png', 'vocal stem: announcer + rap + hook', song.T, fmin=60)
        spectrogram_png(y, out_dir / 'spec_gap.png', 'master 18.5-23.5 s (build, gap, drop)', song.T, 18.5, 23.5, fmin=30)
        spectrogram_png(vox, out_dir / 'spec_hook.png', 'hook vocals 21-28.3 s', song.T, 21.0, 28.4, fmin=80, fmax=12000)
        spectrogram_png(song.stems['rap'], out_dir / 'spec_rap.png', 'rap 7-14.2 s', song.T, 7.0, 14.2, fmin=80, fmax=12000)
        log('stems and images in', out_dir)
    if not args.no_verify:
        rep = verify(song, y, wav, args.mp3, out_dir)
        (out_dir / 'report.json').write_text(json.dumps(rep, indent=1, default=float))
        for k, v in rep.items():
            if k == 'vocal_words':
                print('vocal words (part, word, t, dB 300-3k in [t, t+0.2], dB just before):')
                for w in v:
                    print('   ', w)
            else:
                print(f'{k}: {v}')
    log('done')


if __name__ == '__main__':
    main()
