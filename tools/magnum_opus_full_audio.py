#!/usr/bin/env python3
"""MAGNUM OPUS (The Full Opus): the full-length soundtrack, composed, synthesised and mixed in code.

The score-driven version of tools/magnum_opus_audio.py (the 30 s Rubedo Radio Edit, whose instruments,
voices and master chain it reuses). Everything comes from the score (magnum-opus-fullversion/score.js):
tempo, the per-bar chords and bass roots, the per-section arrangement (pad, piano, bass pattern, lead,
arp, drone, choir, bells, bus), the riff and where it plays, the five 16-step drum lanes, hits,
sweeps, all gaps, the kick and monitor filters, the chakra bells, the key change, and every vocal
line: the sung lines with their notes (vocals.hook, vocals.sung), the rap with its styles, the
Hermit, the announcers and the director, and the chops. A kick in the pattern is a kick in the audio
at that sample; a word on a step has its vowel on that step (P-centre placement).

Sound sources are numpy/scipy only (PolyBLEP and additive oscillators, biquads with time-varying
cutoff, synthetic convolution reverbs), plus ffmpeg for the voices: flite TTS (rap, shouts, Hermit:
rms; sung lines: slt; announcers: rms/awb) and the rubberband time/pitch filter. Sung lines are
tuned by a TD-PSOLA pitch corrector driving a cepstral STFT vocoder whose carrier plays the melody,
one melody/hook run per contiguous sung passage. flite renders are cached by hash in <stems>/voice.

  python3 tools/magnum_opus_full_audio.py --score <score.js> \\
      --wav <dir>/magnum-opus-full.wav --mp3 magnum-opus-fullversion/magnum-opus-full.mp3

Stems, voice renders, analysis images, report.json and timing.json (the measured syllable, word and
gap times the picture keys on) go next to the WAV (--stems DIR to change that), never into the repo.
Next to the WAV it also writes <name>-aac.wav, the master lowered until ffmpeg's AAC of it (256k and 192k) stays
under -1 dBTP: mux the MP4 from that file (render-video.cjs --audio <name>-aac.wav --abr 256k), never from the WAV.
The run ends with a verification report (timing, gaps, vocals, pitch, loudness arc, true peak, MP3
alignment, the MP4 audio feed); --no-verify skips it, and --verify-only re-runs it from <stems>/state.pkl and the written files.
A render takes about 10 minutes on an idle machine (most of it the full-length filters and the mastering
passes that steer the loudness arc); repeated notes come from a render cache, voices from the flite cache.
"""
import argparse
import hashlib
import json
import pickle
import re
import subprocess
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

SR = 44100
F32 = np.float32
REPO = Path(__file__).resolve().parent.parent
SCORE_PATH = REPO / 'magnum-opus-fullversion' / 'score.js'
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


def subdrop(dur=1.7, ratio=1.0):
    n = ns(dur)
    t = tt(n)
    f = (30.0 + 32.0 * np.exp(-t / 0.4)) * ratio
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


VOICING = {  # pad voicings (MIDI), ascending; the first is the bass root (the bass itself comes from score.bass)
    'A5': [45, 57, 64, 69], 'Am': [45, 57, 64, 69, 72], 'F': [41, 57, 65, 69, 72], 'C': [48, 55, 64, 67, 72],
    'G': [43, 55, 62, 67, 71], 'E': [40, 56, 64, 68, 71], 'A': [45, 57, 64, 69, 73],
    # the full version's vocabulary (SPEC-full 2.5.1)
    'Dm': [38, 57, 62, 65, 69], 'Em': [40, 55, 64, 67, 71], 'Esus4': [40, 57, 64, 69, 71], 'G/B': [47, 55, 62, 67, 71],
    'Am/E': [52, 57, 64, 69, 72], 'E/G#': [56, 59, 64, 68, 71], 'F#/A#': [58, 61, 66, 70, 73],
    'Bm': [47, 59, 66, 71, 74], 'D': [38, 57, 66, 69, 74],
}
CHOIR = {'A5': [64, 69, 76], 'Am': [64, 69, 72], 'F': [65, 69, 72], 'C': [64, 67, 72], 'G': [62, 67, 71],
         'E': [64, 68, 71], 'A': [64, 69, 73],
         'Dm': [62, 65, 69], 'Em': [64, 67, 71], 'Esus4': [64, 69, 71], 'G/B': [62, 67, 71], 'Am/E': [64, 69, 72],
         'E/G#': [64, 68, 71], 'F#/A#': [66, 70, 73], 'Bm': [66, 71, 74], 'D': [66, 69, 74]}
PIANO = {'A5': [57, 64, 69], 'Am': [57, 60, 64, 69], 'F': [57, 60, 65, 69], 'C': [55, 60, 64, 67],
         'G': [55, 59, 62, 67], 'E': [56, 59, 64, 68], 'A': [57, 61, 64, 69],
         'Dm': [57, 62, 65, 69], 'Em': [55, 59, 64, 67], 'Esus4': [57, 59, 64, 69], 'G/B': [55, 59, 62, 67],
         'Am/E': [57, 60, 64, 69], 'E/G#': [56, 59, 64, 68], 'F#/A#': [58, 61, 66, 70], 'Bm': [59, 62, 66, 71],
         'D': [57, 62, 66, 69]}
PCS = {'A5': [9, 4], 'Am': [9, 0, 4], 'F': [5, 9, 0], 'C': [0, 4, 7], 'G': [7, 11, 2], 'E': [4, 8, 11], 'A': [9, 1, 4],
       'Dm': [2, 5, 9], 'Em': [4, 7, 11], 'Esus4': [4, 9, 11], 'G/B': [7, 11, 2], 'Am/E': [9, 0, 4], 'E/G#': [4, 8, 11],
       'F#/A#': [6, 10, 1], 'Bm': [11, 2, 6], 'D': [2, 6, 9]}
# chakra bells of the build's roll call, one per bar on 72.1-78.1, an octave over each note of the rising
# bass (A2 B2 C3 D3 E3 F3 G#3): A harmonic minor, the crown's G#6 leads through F#/A# to the drop's B
CHAKRA_NOTES = [81, 83, 84, 86, 88, 89, 92]
# flite spellings of sung syllables (keyed by the score's syllable, or (word, syllable)), chosen by
# audition: each candidate syllable string was rendered and compared (MFCC + DTW) with flite's whole word;
# "mown" is the verb (moan-tin), "ron" made "eye-ron"; "per" and "pur" are the same, "urn" is iron's vowel
SUNG_SPELL = {('mountain', 'mown'): 'mount', ('iron', 'ron'): 'urn', ('copper', 'per'): 'pur'}
# flite spellings of rapped/spoken words: "lead" the metal, not the verb
SAID_SPELL = {'lead': 'led'}


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
    return dict(x=x, marks=marks, v0=v0, v1=v1, lead=ns(lead_in(x)), f0=float(np.median(f0[v])) if v.any() else 0.0)


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


def warp_map(an, n_out, cons_max=None):
    """Output-sample -> input-sample map. The onset consonant (up to the vowel: the later of the f0 voicing onset
    and the energy-based vowel onset) runs 1:1, or is shortened to cons_max samples when the note leaves it less
    time (a singer shortens a long "s"). When the note is longer than the syllable, the vowel's first 60 ms and
    last 50 ms run 1:1 too (a crisp consonant-vowel transition and a natural release) and only its steady middle
    is stretched; when shorter, the 30 s rule (the nucleus gives up to 55 % of itself, the consonants the rest).
    (The 30 s map stretched the whole voiced region, so a weak voiced onset, the "g" of a 16-step "GOLD!", grew
    to a 240 ms fade-in, and an "s" the f0 tracker called voiced was stretched: "sun" sang its vowel 170 ms late.)"""
    n0 = len(an['x'])
    v0 = min(n0 - 2, max(an['v0'], an.get('lead', 0)))
    v1 = min(n0, max(an['v1'], v0 + 2))
    pre, voi, post = v0, v1 - v0, n0 - v1
    pre_o = pre if cons_max is None else max(1, min(pre, int(cons_max)))
    n0e = pre_o + voi + post
    if n_out >= n0e:
        a = min(ns(0.06), int(0.3 * voi))
        b = min(ns(0.05), int(0.2 * voi))
        knots = [(0, 0), (pre_o, v0), (pre_o + a, v0 + a), (n_out - post - b, v1 - b), (n_out - post, v1), (n_out, n0)]
    else:
        cut = n0e - n_out
        cv = min(cut, 0.55 * voi)
        rest = cut - cv
        cons = max(1, pre_o + post)
        pre2 = pre_o - rest * pre_o / cons
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
# new instruments and helpers of the full version
# =====================================================================================

def music_box(midi, dur=1.8, vel=1.0):
    """Music-box tine: a clamped steel bar (partials 1, 6.27, 17.55, the highs dying fast) with a tick."""
    f = float(hz(midi))
    n = ns(dur)
    t = tt(n)
    x = np.sin(2 * np.pi * f * t + RNG.random() * 6.28) * np.exp(-t / 0.95)
    for r, a, tau in ((2.0, 0.10, 0.4), (6.27, 0.32, 0.09), (17.55, 0.10, 0.025)):
        if f * r < 18000:
            x += a * np.sin(2 * np.pi * f * r * t + RNG.random() * 6.28) * np.exp(-t / tau)
    x += bw(noise(n), 'band', (3000, 9000)) * np.exp(-t / 0.0015) * 0.12
    x *= np.minimum(1, t / 0.0005)
    return fades(x, 0.0005, 0.25) * vel


def woodblock(vel=1.0):
    """The slate: a 6 ms clack (band-passed noise) on a 40 ms woody body (three damped modes), dry."""
    n = ns(0.10)
    t = tt(n)
    clack = bw(noise(n), 'band', (1500, 8000), order=2) * np.exp(-t / 0.0017)
    body = (0.8 * np.sin(2 * np.pi * 880 * t) + 0.5 * np.sin(2 * np.pi * 1530 * t + 1.0)
            + 0.45 * np.sin(2 * np.pi * 560 * t + 2.0)) * np.exp(-t / 0.011)
    x = (1.3 * clack / (np.abs(clack).max() + 1e-9) + body) * np.minimum(1, t / 0.0002)
    return fades(x, 0.0002, 0.03) * vel / np.abs(x).max()


def thunder(dur=2.0):
    """The Tower: a 25 ms white-noise crack high-passed at 2 kHz with a few crackles after it (stereo), and a
    2 s rumble of noise low-passed at 120 Hz with a 400 Hz body for small speakers (mono)."""
    n = ns(dur)
    t = tt(n)
    crack = np.zeros((2, n))
    for ch in range(2):
        c = bw(noise(n), 'high', 2000, order=2)
        env = np.where(t < 0.003, 1.0, np.exp(-(t - 0.003) / 0.007)) * (t < 0.025)
        for o, a in ((0.04, 0.45), (0.075, 0.3), (0.13, 0.22), (0.21, 0.12)):
            u = t - o - RNG.uniform(-0.004, 0.004)
            env += a * np.where(u >= 0, np.exp(-np.maximum(u, 0) / 0.012), 0.0)
        crack[ch] = c * env
    crack = fades(crack / np.abs(crack).max(), 0.0003, 0.05)
    roll = 1.0 + 0.5 * np.sin(2 * np.pi * 3.1 * t) * np.sin(2 * np.pi * 0.7 * t + 1.0)
    renv = (1 - np.exp(-t / 0.06)) * np.exp(-t / 0.75) * roll
    rumble = bw(noise(n), 'low', 120, order=4) * renv
    body = bw(noise(n), 'band', (150, 420), order=2) * renv * np.exp(-t / 0.4) * 0.35
    r = rumble + body
    return crack, fades(r / np.abs(r).max(), 0.002, 0.3)


def downlifter(dur):
    """Noise falling from 9 kHz to 200 Hz with a detuned saw falling three octaves, fading into the stop."""
    n = ns(dur)
    x = np.linspace(0, 1, n)
    nz = noise(n, 2)
    fc = 9000 * (200 / 9000) ** (x ** 0.7)
    r = tvf(nz, 'bp', fc, q=0.9, block=128)
    f = 880.0 * 2 ** (-3.0 * x ** 0.8)
    s = supersaw(f, n, detune=30, voices=5)
    s = tvf(s, 'lp', np.maximum(f * 4, 300), q=0.8, block=128) * 0.3
    amp = (1 - x) ** 1.4 * np.minimum(1, x / 0.03)
    return fades((r + s) * amp, 0.01, 0.05)


def sub_swell(dur):
    """The sub drop reversed and stretched to dur: a sine climbing 30 -> 62 Hz, swelling into its end."""
    n = ns(dur)
    u = tt(n)[::-1]  # time before the end
    k = dur / 1.7
    f = 30.0 + 32.0 * np.exp(-u / (0.4 * k))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-u / (0.75 * k))
    return fades(x, 0.05, 0.015)


def shatter(dur=1.2):
    """A mask shattering (not in the current score; a "shatter" hit type if one is added): a cracking transient,
    a scatter of short inharmonic glassy pings over 250 ms and a dark thud. Returns (stereo, thud mono)."""
    n = ns(dur)
    t = tt(n)
    out = np.zeros((2, n))
    out += st(bw(noise(n), 'high', 1500, order=2) * np.exp(-t / 0.006) * 1.2)
    for _ in range(36):
        o = RNG.uniform(0.0, 0.25) ** 1.5
        f = RNG.uniform(2200, 9000)
        u = t - o
        ping = np.where(u >= 0, np.sin(2 * np.pi * f * u) * np.exp(-np.maximum(u, 0) / RNG.uniform(0.01, 0.06)), 0.0)
        out += st(ping * RNG.uniform(0.15, 0.4), RNG.uniform(-0.9, 0.9))
    thud = (np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.09) + bw(noise(n), 'low', 250) * np.exp(-t / 0.03)) * np.minimum(1, t / 0.002)
    return fades(out / np.abs(out).max(), 0.0003, 0.2), fades(thud / np.abs(thud).max(), 0.001, 0.1)


# ------------------------------------------------------------------ render cache
# The full song plays thousands of identical notes (stabs, hats, claps, plucks, bells). Every instrument below is
# linear in its velocity (or keyed on it), so each distinct note is synthesised once and re-used, like a sampler;
# hits that vary (hats, claps, kicks, crashes) rotate through a few renders (round robin) instead of one.
_MEMO = {}
_RR = {}


def _memo(key, make):
    v = _MEMO.get(key)
    if v is None:
        v = np.asarray(make(), float)
        v.setflags(write=False)
        _MEMO[key] = v
    return v


def _rr(name, k):
    i = _RR.get(name, 0)
    _RR[name] = i + 1
    return i % k


_piano_note, _pluck, _bell, _hat, _clap, _kick, _snare, _bass_note, _music_box, _crash = \
    piano_note, pluck, bell, hat, clap, kick, snare, bass_note, music_box, crash


def piano_note(midi, dur, vel=1.0):
    return _memo(('piano', midi, round(dur, 3)), lambda: _piano_note(midi, dur, 1.0)) * vel


def bell(midi, dur=3.2, vel=1.0):
    return _memo(('bell', midi, round(dur, 3)), lambda: _bell(midi, dur, 1.0)) * vel


def music_box(midi, dur=1.8, vel=1.0):
    return _memo(('mbox', midi, round(dur, 3)), lambda: _music_box(midi, dur, 1.0)) * vel


def pluck(midi, dur=0.32, vel=1.0, bright=1.0, decay=0.16):
    b = round(vel * bright, 2)    # the filter envelope depends on vel * bright only
    return _memo(('pluck', midi, round(dur, 3), b, round(decay, 3)), lambda: _pluck(midi, dur, 1.0, b, decay)) * vel


def bass_note(midi, dur, vel=1.0):
    v = round(vel, 2)
    return _memo(('bass', midi, round(dur, 3), v), lambda: _bass_note(midi, dur, v))


def hat(vel=1.0, open_=False):
    k = _rr(('hat', open_), 8)
    return _memo(('hat', open_, k), lambda: _hat(1.0, open_)) * vel


def clap(vel=1.0):
    k = _rr('clap', 6)
    return _memo(('clap', k), lambda: _clap(1.0)) * vel


def kick(vel=1.0, muffle=None):
    if muffle is None or muffle >= 15000:
        k = _rr('kick', 4)
        return _memo(('kick', k), lambda: _kick(1.0)) * vel
    fc = float(np.exp(round(np.log(muffle) * 50) / 50))   # 2 % steps
    return _memo(('kick', fc), lambda: _kick(1.0, fc)) * vel


def snare(vel=1.0, pitch=200.0, decay=0.13):
    pq, dq = round(pitch / 4) * 4, round(decay, 3)
    return _memo(('snare', pq, dq), lambda: _snare(1.0, pq, dq)) * vel


def crash(dur=2.6, bright=1.0):
    k = _rr(('crash', round(dur, 2), bright), 3)
    return _memo(('crash', round(dur, 3), bright, k), lambda: _crash(dur, bright))


def formant_bank(x, vowel):
    """The 30 s choir's parallel formant filter, as 'aah' (700, 1220, 2600, 3400 Hz) or 'ooh'."""
    F = {'aah': ((700, 4.0, 1.0), (1220, 6.0, 0.55), (2600, 8.0, 0.28), (3400, 9.0, 0.12)),
         'ooh': ((330, 3.0, 1.0), (800, 5.0, 0.42), (2300, 8.0, 0.12), (3000, 9.0, 0.05))}[vowel]
    y = sum(eq(x, 'bp', f, q) * a for f, q, a in F)
    return y + 0.08 * bw(x, 'low', 1000)


def whisper(x, n_out=None):
    """A whisper: the voice's cepstral envelope on white noise (a noise-excited vocoder), sibilance passed."""
    n = len(x)
    y = vocoder(x, noise(n), noise_amt=0.0, sib=0.45)
    return y * np.sqrt(np.mean(x ** 2)) / (np.sqrt(np.mean(y ** 2)) + 1e-12)


def yin(x, fmin=90.0, fmax=800.0, win=1024, hop=256, thr=0.15):
    """YIN pitch tracker (de Cheveigne & Kawahara 2002) in numpy: the cumulative-mean-normalised difference
    function per frame, the first dip under `thr` (else the global minimum), walked down to its local
    minimum, parabolic interpolation. Returns frame centres (samples), f0 (Hz), aperiodicity, rms."""
    x = np.asarray(x, float)
    tmax = int(SR / fmin)
    tmin = max(2, int(SR / fmax))
    L = win + tmax
    if len(x) < win:
        x = np.pad(x, (0, win - len(x)))
    xp = np.pad(x, (0, L))
    nf = 1 + (len(x) - win) // hop
    fr = np.lib.stride_tricks.sliding_window_view(xp, L)[::hop][:nf]
    E = np.cumsum(np.pad(fr ** 2, ((0, 0), (1, 0))), axis=1)
    taus = np.arange(tmax + 1)
    E0 = E[:, win] - E[:, 0]
    Et = E[:, win + taus] - E[:, taus]
    nfft = 1 << int(np.ceil(np.log2(L + win)))
    r = np.fft.irfft(np.fft.rfft(fr, nfft, axis=1) * np.conj(np.fft.rfft(fr[:, :win], nfft, axis=1)), nfft, axis=1)[:, :tmax + 1]
    d = np.maximum(E0[:, None] + Et - 2 * r, 0.0)
    d[:, 0] = 0.0
    cm = np.cumsum(d[:, 1:], axis=1)
    dp = np.ones_like(d)
    dp[:, 1:] = d[:, 1:] * taus[1:] / np.maximum(cm, 1e-12)
    seg = dp[:, tmin:tmax]
    below = seg < thr
    k = np.where(below.any(axis=1), np.argmax(below, axis=1), np.argmin(seg, axis=1))
    for _ in range(64):  # walk each dip down to its local minimum
        nxt = np.minimum(k + 1, seg.shape[1] - 1)
        mv = seg[np.arange(nf), nxt] < seg[np.arange(nf), k]
        if not mv.any():
            break
        k = np.where(mv, nxt, k)
    k = k + tmin
    km = np.clip(k, 1, tmax - 1)
    y0, y1, y2 = dp[np.arange(nf), km - 1], dp[np.arange(nf), km], dp[np.arange(nf), km + 1]
    den = y0 - 2 * y1 + y2
    with np.errstate(divide='ignore', invalid='ignore'):
        delta = np.where(np.abs(den) > 1e-12, 0.5 * (y0 - y2) / den, 0.0)
    f0 = SR / (km + np.clip(delta, -0.5, 0.5))
    rms = np.sqrt(np.mean(fr[:, :win] ** 2, axis=1))
    return np.arange(nf) * hop + win // 2, f0, dp[np.arange(nf), km], rms


def envelope_db(x, lo=250, hi=1500, frame=0.005, smooth=5):
    m = x.mean(0) if np.ndim(x) == 2 else np.asarray(x, float)
    b = bw(m, 'band', (lo, hi), order=2, zero_phase=True)
    w = ns(frame)
    k = max(1, len(b) // w)
    e = 10 * np.log10(np.mean(b[:k * w].reshape(k, w) ** 2, axis=1) + 1e-14)
    return uniform_filter1d(e, smooth) if smooth > 1 else e


def syllable_onsets(y, count, frame=0.005):
    """Syllable onsets (s from the start of y) of a rendered shout: its `count` most prominent vowel nuclei
    (peaks of the 250-1500 Hz energy, at least 70 ms apart, within 24 dB of the loudest); syllable 1 starts
    where the sound starts, each later one at the energy dip (the consonant) before its nucleus."""
    e = envelope_db(y, frame=frame)
    top = e.max()
    on0 = int(np.argmax(e > top - 30))
    pk, pr = signal.find_peaks(e, distance=int(0.07 / frame), prominence=1.0, height=top - 24)
    if len(pk) > count:
        keep = np.sort(np.argsort(pr['prominences'])[::-1][:count])
        pk = pk[keep]
    ons = [on0 * frame]
    for a, b in zip(pk[:-1], pk[1:]):
        ons.append((a + int(np.argmin(e[a:b + 1]))) * frame)
    return [round(float(o), 4) for o in ons], [round(float(p * frame), 4) for p in pk]


def mark_regions(n, spans):
    """Boolean mask over n samples that is True inside the given (t0, t1) second spans."""
    m = np.zeros(n, bool)
    for a, b in spans:
        m[max(0, ns(a)):max(0, ns(b))] = True
    return m


# =====================================================================================
# composition: the score-driven song
# =====================================================================================

def parse_khz(txt, default):
    m = re.findall(r'(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*kHz', txt or '')
    if m:
        return float(m[0][0]) * 1000, float(m[0][1]) * 1000
    m = re.findall(r'(\d+(?:\.\d+)?)\s*kHz', txt or '')
    if m:
        return float(m[0]) * 1000, float(m[0]) * 1000
    return default


class Song:
    def __init__(self, score, work):
        self.S = score
        self.T = Timing(score)
        self.N = self.T.n
        self.V = Voice(work)
        self.work = Path(work)
        self.stems = {}
        self.bars = int(score['bars'])
        self.chords = score['chords']
        self.energy = score['energy']
        self.bassline = score['bass']
        self.arr = score['arrangement']
        self.ev = {k: pattern_events(self.T, v) for k, v in score['drums'].items()}
        self.sec = [None] * self.bars
        self.sections = score['sections']
        for s in self.sections:
            for b in range(*s['bars']):
                self.sec[b] = s['id']
        self.gaps = [(float(g['fromBeat']), float(g['toBeat'])) for g in score['gaps']]
        self.gaps_s = [(self.bt(a), self.bt(b)) for a, b in self.gaps]
        # dead stops that are not gaps ("bar 63 stops at step 12" in a riff play): sustained layers end there,
        # reverb tails ring on (the "air")
        self.stops = []
        for pl in score['riff']['plays']:
            for b, s in re.findall(r'bar (\d+) stops at step (\d+)', pl.get('voice', '')):
                self.stops.append(self.T.t(int(b), 0, int(s)))
        self.key_change = score.get('keyChange', {})
        self.timing = {}       # measured times for timing.json
        self.vox_layers = {}   # tuned layers kept for the pitch check: passage id -> dict
        self.lines = []        # every vocal line with its window, for the presence check

    # ------------------------------------------------------------------ helpers
    def stem(self, name, ch=2):
        if name not in self.stems:
            self.stems[name] = np.zeros((2, self.N), F32) if ch == 2 else np.zeros(self.N, F32)
        return self.stems[name]

    def bt(self, beat):
        return self.T.b(beat)

    def A(self, bar, key, default=None):
        if bar < 0 or bar >= self.bars:
            return default
        return self.arr.get(self.sec[bar], {}).get(key, default)

    def sec_span(self, sid):
        s = next(x for x in self.sections if x['id'] == sid)
        return s['bars']

    def in_gap(self, beat):
        return any(a <= beat < b for a, b in self.gaps)

    def in_gap_t(self, t):
        return any(a <= t < b for a, b in self.gaps_s)

    def is_drop_bar(self, bar):
        """The bar starts where a gap ends: nothing of it may start early, inside the gap."""
        return any(abs(b - 4 * bar) < 1e-9 for _, b in self.gaps)

    def last_gap_end(self, t):
        e = [b for _, b in self.gaps_s if b <= t + 1e-9]
        return max(e) if e else None

    def cut_time(self, t, stops=True):
        """The first gap start (or dead stop) after t: where an event starting at t must end."""
        c = [a for a, _ in self.gaps_s if a > t + 1e-9]
        if stops:
            c += [s for s in self.stops if s > t + 1e-9]
        return min(c) if c else None

    def until_gap(self, x, t, stops=True, fade=0.006):
        """An event that starts before a gap (or a dead stop) ends at it with a short fade: the gate only mutes
        the gap, so without this a long note's tail would come back after it, on top of the drop."""
        c = self.cut_time(t, stops)
        if c is None or t + x.shape[-1] / SR <= c:
            return x
        k = max(1, ns(c - t))
        return fades(x[..., :k], 0.0, min(fade, k / SR))

    def put(self, name, x, t, gain=1.0, pan=0.0, ch=2, stops=True, gap_ok=False):
        """Place an event; nothing may start inside a gap (its tail would ring on after it, over the drop),
        except long buffers that are silent there (gap_ok: a vocal passage's lead-in)."""
        if not gap_ok and self.in_gap_t(t):
            return
        if stops and any(a - 1e-9 <= t < a + self.T.bar - (a % self.T.bar) for a in self.stops):
            return   # after a dead stop the bar is air
        place(self.stem(name, ch), self.until_gap(np.asarray(x, float), t, stops), t, gain, pan)

    def bar_start(self, bar):
        """(start of a bar's sustained notes, is it a drop): a bar that starts inside a gap starts at the gap's
        end; a bar that starts where a gap ends is a drop (nothing of it may start early, inside the gap)."""
        t = self.T.t(bar)
        for ga, gb in self.gaps_s:
            if ga - 1e-9 <= t < gb - 1e-9:
                return gb, True
            if abs(gb - t) < 1e-9:
                return t, True
        return t, False

    def sections_with(self, key, pred=lambda v: bool(v)):
        return [s for s in self.sections if pred(self.arr.get(s['id'], {}).get(key))]

    # ------------------------------------------------------------------ drums
    def kick_filter(self, beat):
        for f in self.S.get('filters', []):
            if f['type'] == 'kickMuffle' and f['fromBeat'] <= beat < f['toBeat']:
                x = (beat - f['fromBeat']) / (f['toBeat'] - f['fromBeat'])
                a, b = f['fc']
                return a * (b / a) ** (x ** 2.2), x, a == b
        return None, 1.0, False

    def drums(self):
        T = self.T
        K = self.stem('kick', 1)
        for (t, v, acc, bar, s) in self.ev['kick']:
            fc, x, fixed = self.kick_filter(t / T.beat)
            if fixed:    # the heartbeat: lub (steps 0, 8) - dub (3, 11), low-passed
                place(K, kick(0.95 if s % 8 == 0 else 0.62, muffle=fc), t)
            elif fc is not None:  # the 30 s muffled kick opening (and the build's)
                place(K, kick(0.8 + 0.15 * x, muffle=fc), t)
            else:
                place(K, kick(1.0 if acc else 0.9), t)
        # clip the kick on its own channel (oversampled): a louder, denser kick whose transient no longer
        # drives the master limiter
        pk = np.abs(K).max()
        K[:] = softclip(K / pk * 2.0, knee=0.5)[0] * pk / 2.0 * 1.6
        clap_rows = self.S['drums']['clap']
        for (t, v, acc, bar, s) in self.ev['clap']:
            row = clap_rows[bar]
            fill = s >= 12 and not (s == 12 and row[4] != '.')
            g = (1.0 if acc else 0.85) * (0.75 if self.sec[bar] in ('intro', 'coldopen') else 1.0)
            if fill and not acc:
                g *= 0.6 + 0.1 * (s - 12)
            elif s not in (4, 12) and not acc:   # the lifts' claps on every beat / 8ths, rising through the bar
                g *= 0.68 + 0.3 * s / 15
            place(self.stem('clap'), clap(g), t)
            if fill:
                place(self.stem('snare'), snare(0.55 + 0.12 * (s - 12), pitch=205 + 12 * (s - 12), decay=0.12), t)
        acc16 = [0.62, 0.34, 0.42, 0.44]
        H = self.stem('hats')
        for (t, v, acc, bar, s) in self.ev['closedHat']:
            e = self.energy[bar]
            g = acc16[int(s) % 4] * (0.55 + 0.45 * e) * (0.75 if self.sec[bar] == 'intro' else 1.0)
            place(H, hat(g), t, pan=0.18)
        for (t, v, acc, bar, s) in self.ev['openHat']:
            e = self.energy[bar]
            place(H, hat(0.75 * (0.6 + 0.4 * e) * (0.75 if self.sec[bar] == 'intro' else 1.0), open_=True), t, pan=-0.12)
        # snare rolls: one velocity/pitch ramp per contiguous passage (the build's 8 bars, a stop bar's 32nds)
        ev = sorted(self.ev['roll'])
        groups = []
        for e in ev:
            if groups and e[0] - groups[-1][-1][0] < T.bar:
                groups[-1].append(e)
            else:
                groups.append([e])
        for g in groups:
            t_a, t_b = g[0][0], g[-1][0] + 1e-9
            long_ = t_b - t_a > 2 * T.bar
            for (t, v, acc, bar, s) in g:
                x = (t - t_a) / max(t_b - t_a, 1e-9)
                vel = 0.22 + 0.78 * x ** 1.3 if long_ else 0.5 + 0.45 * x
                place(self.stem('roll'), snare(vel, pitch=180 + 160 * x, decay=0.16 - 0.1 * x), t, pan=0.1 * np.sin(40 * t))
        drops = {h['beat'] for h in self.S['hits'] if h['type'] in ('orchHit', 'subDrop')}
        for h in self.S['hits']:
            if h['type'] == 'crash':
                soft = 'soft' in h.get('note', '')
                self.put('crash', crash(2.8 if h['beat'] in drops else 1.9) * (0.55 if soft else 1.0), self.bt(h['beat']))
        for sw in self.S['sweeps']:
            if sw['type'] == 'reverseCymbal':
                a, b = self.bt(sw['fromBeat']), self.bt(sw['toBeat'])
                name = 'revcym_gap' if self.in_gap(sw['fromBeat']) else 'revcym'
                r = reverse_cymbal(b - a)
                place(self.stem(name), r, ns(b) - r.shape[-1])

    # ------------------------------------------------------------------ fx and hits
    def chord_at_beat(self, beat):
        return self.chords[min(self.bars - 1, int(beat // 4))]

    def fx(self):
        T = self.T
        for h in self.S['hits']:
            t = self.bt(h.get('beat', h.get('fromBeat', 0)))
            typ = h['type']
            note = h.get('note', '')
            if typ == 'gong':
                long_ = h['beat'] == 0
                g, thump = gong(55.0, 9.0 if long_ else 3.0)
                self.put('gong', g, t)
                self.put('low', thump * 0.8, t, ch=1)
                b = bowl(220.0 if long_ else 277.18, 10.0 if long_ else 3.0)  # coda: C#, the major third
                self.put('gong', b * 0.55, t + 0.003)
            elif typ == 'orchHit':
                chord = self.chord_at_beat(h['beat'])
                dark = 'dark' in note
                if dark:
                    notes = [33, 45, 52, 57, 60]
                else:
                    r = VOICING[chord][0]
                    while r > 47:
                        r -= 12
                    notes = [r, r + 12] + [m for m in range(r + 13, 79) if m % 12 in PCS[chord]]
                dur = 1.6 if dark else 0.8 if 'short' in note else 1.2
                x, timp = orch_hit(notes, dark=dark, dur=dur)
                if 'bright' in note:
                    x = eq(x, 'hs', 4000, 0.7, 3.0)
                if 'brass' in note:
                    x = eq(x, 'peak', 1200, 0.8, 3.0)
                self.put('orch', x, t)
                self.put('low', timp * (0.9 if dark else 0.7), t, ch=1)
            elif typ == 'subDrop':
                # tuned to the drop's key: the B minor drops end on B, not A
                root = VOICING[self.chord_at_beat(h['beat'])][0] % 12
                semis = (root - 9 + 6) % 12 - 6
                self.put('low', subdrop(1.8, 2 ** (semis / 12)), t, ch=1)
            elif typ == 'jingle':
                # the eyecatch sting: E6 D6 G6-E6 (the "Magnum Opus" motif) in 8ths and a ding, and slt
                # whispering "Magnum Opus" (low-passed, tremolo)
                for (s, m, L) in ((0, 88, 2), (2, 86, 2), (4, 91, 4), (8, 88, 4)):
                    self.put('jingle', bell(m, 2.2, 0.75), t + s * T.step, pan=0.25 * np.sin(s))
                    self.put('jingle', music_box(m + 12, 1.0, 0.25), t + s * T.step, pan=-0.3)
                self.put('jingle', bell(93, 3.2, 0.9), t + 12 * T.step)
                w = trim(self.V.flite('Magnum Opus', 'slt'))
                w = trim(self.V.rubberband(w, tempo=0.9, pitch=2 ** (1 / 12)))
                y = whisper(w)
                y = bw(y, 'band', (300, 3500), order=2)
                y *= 1 - 0.45 * (0.5 + 0.5 * np.sin(2 * np.pi * 7.5 * tt(len(y))))
                self.put('whisperfx', st(fades(y, 0.01, 0.1) / (np.abs(y).max() + 1e-9), -0.2), t + 0.02)
                self.timing.setdefault('fx', []).append(dict(type='jingle', beat=h['beat'], t=round(t, 4),
                                                             bells_s=[round(t + s * T.step, 4) for s in (0, 2, 4, 8, 12)]))
            elif typ == 'bowl':
                self.put('gong', bowl(220.0, 8.0), t)
            elif typ == 'subSwell':
                a, b = self.bt(h['fromBeat']), self.bt(h['toBeat'])
                self.put('low', sub_swell(b - a) * 0.9, a, ch=1)
            elif typ == 'thunder':
                # the crack on its own bus (GAINS['thunder']: on the fx bus it sat under the white riser and the
                # drums; the mixer also ducks those under it, THUNDER_DUCK_DB), the rumble's small-speaker body +4 dB
                crack, rumble = thunder(2.0)
                self.put('thunder', crack, t)
                self.put('low', rumble * 0.9, t, ch=1)
                self.put('fx', st(bw(rumble, 'band', (120, 900), order=2)) * (0.5 * 10 ** (4 / 20)), t)
            elif typ == 'shatter':
                glass, thud = shatter()
                self.put('fx', glass, t)
                self.put('low', thud * 0.7, t, ch=1)
            elif typ == 'slate':
                # dry, in the gap with the director: on the bypass bus
                place(self.stem('gapfx'), st(woodblock(1.0), 0.1), t)
                self.timing.setdefault('fx', []).append(dict(type='slate', beat=h['beat'], t=round(t, 4)))
            elif typ == 'musicBox':
                for (m, s, L) in h['notes']:
                    self.put('musicbox', music_box(m, max(1.2, L * T.step + 0.8), 0.8), t + s * T.step,
                             pan=0.3 * np.sin(1.3 * s))
        for sw in self.S['sweeps']:
            typ = sw['type']
            if typ == 'reverseCymbal':
                continue
            a, b = self.bt(sw['fromBeat']), self.bt(sw['toBeat'])
            note = sw.get('note', '')
            if typ == 'riser':
                soft = 'soft' in note
                white = 'white' in note or sw['fromBeat'] >= 32
                r = riser(b - a, white=white and not soft)
                if soft:
                    r = bw(r, 'low', 2500) * 0.5
                elif sw['fromBeat'] < 32:
                    r = r * 0.8
                self.put('riser', r, a)
            elif typ == 'downlifter':
                self.put('riser', downlifter(b - a) * 1.1, a, stops=False)
            elif typ == 'reverseSwell':
                # the 30 s reverse swell: a reversed hall tail of a piano chord, ending exactly on the downbeat
                ch = sw.get('chord', 'A')
                notes = sorted(set([VOICING[ch][0]] + PIANO[ch] + [m + 12 for m in PIANO[ch][1:3]]))
                chord = sum(piano_note(m, 0.3, 1.0) for m in notes)
                ir = make_ir(3.6, 3.2, 1.7, pre=0.0, seed=7)
                wet = convolve(st(np.pad(chord, (0, ns(3.8)))), ir)
                L = ns(b - a)
                rev = wet[:, ::-1][:, -L - ns(0.02):-ns(0.02)]
                rev = fades(rev / np.abs(rev).max(), 0.3, 0.004) * np.linspace(0, 1, L) ** 1.5
                place(self.stem('swell'), rev, ns(b) - L)
        # chakra bells, ascending, with an octave-up shimmer echo; the crown's echoes stop at the gap
        for i, c in enumerate(self.S['chakras']):
            t = self.bt(c['beat'])
            m = CHAKRA_NOTES[i % len(CHAKRA_NOTES)]
            self.put('bells', bell(m, 3.0, 0.8 + 0.03 * i), t, pan=-0.35 + 0.7 * (i % 2))
            sh = bell(m + 12, 2.0, 0.3)
            for k in range(1, 5):
                te = t + k * 3 * T.step
                c_ = self.cut_time(t)
                if c_ is not None and te >= c_:
                    break
                self.put('bells', sh * 0.62 ** k, te, pan=0.6 if k % 2 else -0.6)

    # ------------------------------------------------------------------ atmosphere: the nigredo drone and wind
    def atmosphere(self):
        T = self.T
        for s in self.sections_with('drone'):
            b0, b1 = s['bars']
            kind = self.arr[s['id']]['drone']
            t0 = T.t(b0)
            n = ns(T.t(b1) - t0)
            t = tt(n)
            L = (b1 - b0) * T.bar
            if kind is True:
                # the 30 s nigredo: A1/A2 saws through a slow low-pass, a resonant overtone band sweeping,
                # and wind, swelling in and out over the section
                x = (saw(55.0, n, 0.1) + 0.7 * saw(55.0 * 1.0016, n, 0.6) + 0.5 * saw(110.0 * 0.9993, n, 0.3)
                     + 0.35 * saw(164.81, n, 0.8))
                body = tvf(x, 'lp', 300 + 180 * np.sin(2 * np.pi * 0.11 * t) ** 2, q=0.9, block=128)
                q = L / 4
                ot = keys_curve(n, [(0, 660), (q, 1320), (2 * q, 880), (3 * q, 1100), (4 * q, 1650)], True)
                over = tvf(x, 'bp', ot, q=14, block=64) * 1.8
                env = keys_curve(n, [(0, 0), (0.08 * L, 0.9), (0.25 * L, 1.0), (0.5 * L, 0.7), (0.92 * L, 0.4), (L, 0.0)])
                self.put('drone', (body * 0.5 + over * 0.6) * env, t0)
                self.put('low', np.sin(2 * np.pi * 55 * t) * env * 0.2, t0, ch=1)
                wn = noise(n, 2)
                fc = 550 + 420 * np.sin(2 * np.pi * 0.21 * t) + 260 * np.sin(2 * np.pi * 0.47 * t + 1)
                w = tvf(wn, 'bp', fc, q=1.6, block=128)
                wenv = keys_curve(n, [(0, 0), (0.17 * L, 0.5), (0.42 * L, 0.9), (0.7 * L, 0.6), (L, 0.0)])
                self.put('wind', w * wenv * (0.75 + 0.25 * np.sin(2 * np.pi * 0.6 * t)) * 0.5, t0)
            else:
                # 'low': a quiet tonic drone under the verse (A2 saws low-passed at ~300 Hz, a slow overtone)
                x = saw(110.0, n, 0.2) + 0.8 * saw(110.0 * 1.0021, n, 0.7) + 0.4 * saw(164.81 * 0.9991, n, 0.4)
                body = tvf(x, 'lp', 260 + 90 * np.sin(2 * np.pi * 0.07 * t) ** 2, q=0.8, block=256)
                over = tvf(x, 'bp', 900 + 500 * np.sin(2 * np.pi * 0.05 * t) ** 2, q=12, block=128) * 0.9
                env = keys_curve(n, [(0, 0), (T.bar, 0.55), (L - T.bar, 0.55), (L, 0.0)])
                self.put('drone', (body * 0.45 + over * 0.35) * env, t0)

    # ------------------------------------------------------------------ harmony
    def pad_style(self, sid):
        p = self.arr.get(sid, {}).get('pad')
        if not p:
            return None
        if p == 'choir-pad':      # the cold open: a dark, slow pad under the a cappella hook
            return dict(fc=(650, 1500), g=0.85, att=0.35, det=13.0)
        if p == 'low-passed':     # the intro: the beat assembles under it
            return dict(fc=(420, 2800), g=0.62, att=0.06, det=21.0)
        if p.startswith('low-passed'):
            return dict(fc=parse_khz(p, (2500, 2500)), g=0.68, att=0.03, det=21.0)
        if p.startswith('opening'):
            return dict(fc=parse_khz(p, (2500, 9000)), g=0.7, att=0.03, det=21.0)
        if p.startswith('warm'):
            return dict(fc=parse_khz(p, (1200, 1200)), g=0.9, att=0.4, det=11.0)
        if p.startswith('rising'):
            return dict(fc=(500, 9000), g=0.62, att=0.03, det=21.0, ramp=(0.7, 1.1))
        if p == 'monitor':
            return dict(fc=(8500, 8500), g=0.7, att=0.03, det=21.0)
        if p == 'A major':
            return dict(fc=(10000, 900), g=1.0, att=0.002, det=16.0, coda=True)
        return dict(fc=(9500, 9500), g=0.62, att=0.015, det=21.0)   # full

    def pad(self):
        T = self.T
        P = self.stem('pad')
        keys = []
        for s in self.sections:
            ps = self.pad_style(s['id'])
            if not ps:
                continue
            b0, b1 = s['bars']
            if ps.get('coda'):
                keys += [(T.t(b0), 10000), (T.t(b0, 3), 2500), (T.dur, 900)]
            else:
                keys += [(T.t(b0) + 0.001, ps['fc'][0]), (T.t(b1) - 0.02, ps['fc'][1])]
        keys = [(0.0, keys[0][1])] + keys + [(T.dur + 1, keys[-1][1])]
        done_coda = False
        for bar in range(self.bars):
            sid = self.sec[bar]
            ps = self.pad_style(sid)
            if not ps:
                continue
            name = self.chords[bar]
            notes = [m for m in VOICING[name] if m >= 55]
            att = ps['att']
            tb, drop = self.bar_start(bar)
            if ps.get('coda'):
                if done_coda:
                    continue
                done_coda = True
                t0, t1 = T.t(bar), T.dur
            else:
                nxt = self.pad_style(self.sec[bar + 1]) if bar + 1 < self.bars else None
                t0 = tb - (0.0 if drop else max(0.015, att / 2))
                t1 = T.t(bar + 1) + (max(0.08, att / 2) if nxt else 0.3)
            n = ns(t1 - t0)
            x = sum(supersaw(hz(m), n, ps['det']) for m in notes) / len(notes) ** 0.5
            g = ps['g']
            b0, b1 = self.sec_span(sid)
            if 'ramp' in ps:
                g *= ps['ramp'][0] + (ps['ramp'][1] - ps['ramp'][0]) * (bar - b0) / max(1, b1 - b0 - 1)
            if ps.get('coda'):
                # the 30 s ending: the lead turned to gold, A5 and C#6 on top; a long decay under the coda vocal
                x += 0.6 * supersaw(hz(81), n, 18.0) + 0.5 * supersaw(hz(85), n, 18.0)
                tl = tt(n)
                x *= 0.35 + 0.65 * np.exp(-tl / 1.6)
                x = fades(x, 0.002, 0.5)
            else:
                x = fades(x, 0.002 if drop else max(0.015, att), max(0.08, att) if bar + 1 < self.bars else 0.3)
            self.put('pad', x * g, t0)
        fc = keys_curve(self.N, keys, True)
        P[:] = tvf(P, 'lp', fc, q=1.25, block=128)
        P[:] = tvf(P, 'lp', fc * 1.3, q=0.6, block=128)
        P[:] = chorus(P, mix=0.25)
        P[:] = eq(P, 'peak', 450, 0.9, -3.0)  # keep the low mids clear for the vocals

    def choir_style(self, sid):
        c = self.arr.get(sid, {}).get('choir')
        if not c:
            return None
        d = dict(g=0.75, vowel='aah', extra=[], oct=0, up=False, att=0.25)
        if c == 'soft':
            d.update(g=0.42, att=0.5)
        elif c == 'low':
            d.update(g=0.55, oct=-12)
        elif c == 'ooh':
            d.update(g=0.55, vowel='ooh', att=0.45)
        elif c == 'swell':
            d.update(g=0.8, swell=True)
        elif c == 'full':
            d.update(g=0.75, extra=[57])
        elif c in ('octave up', 'sings the hook'):
            d.update(g=0.7, extra=[57], up=True)
        elif c.startswith('rising'):
            d.update(g=0.85, rising=True)
        elif c == 'pad':
            d.update(g=0.45, att=0.45)
        elif c == 'A major':
            d.update(g=1.0, extra=[57], coda=True)
        return d

    def choir(self):
        T = self.T
        bufs = {'aah': np.zeros((2, self.N), F32), 'ooh': np.zeros((2, self.N), F32)}
        done_coda = False
        for bar in range(self.bars):
            sid = self.sec[bar]
            cs = self.choir_style(sid)
            if not cs:
                continue
            name = self.chords[bar]
            b0, b1 = self.sec_span(sid)
            if cs.get('rising'):   # the build's "aah" on bass +12/+19/+24, following the rising line
                bb = self.bassline[bar] if self.bassline[bar] is not None else VOICING[name][0]
                notes = [bb + 12, bb + 19, bb + 24]
            else:
                notes = [m + cs['oct'] for m in CHOIR[name] + cs['extra']]
                if cs['up']:
                    notes += [m + 12 for m in CHOIR[name][1:]]
            tb, drop = self.bar_start(bar)
            if cs.get('coda'):
                if done_coda:
                    continue
                done_coda = True
                t0, t1 = T.t(bar), T.dur
            else:
                t0 = tb - (0.0 if drop else cs['att'])
                t1 = T.t(bar + 1) + 0.35
            n = ns(t1 - t0)
            tl = tt(n)
            x = np.zeros((2, n))
            for i, m in enumerate(notes):
                for v in range(3):
                    rate = 5.0 + RNG.random() * 0.8
                    dep = 10 + RNG.random() * 8
                    f = hz(m) * 2 ** ((dep * np.sin(2 * np.pi * rate * tl + RNG.random() * 6.28) + RNG.uniform(-7, 7)) / 1200)
                    x += st(saw(f, n, RNG.random()), RNG.uniform(-0.8, 0.8))
            g = cs['g']
            frac = (bar - b0) / max(1, b1 - b0 - 1)
            if cs.get('swell'):    # the pre: louder each bar, and each bar swelling into the next
                g *= 0.4 + 0.6 * frac
                x *= (0.55 + 0.45 * smoothstep(tl / (T.bar + cs['att'])))
            if cs.get('rising'):
                g *= 0.35 + 0.65 * frac
            if cs.get('coda'):
                x *= 0.4 + 0.6 * np.exp(-tl / 2.0)
            x = fades(x, 0.04 if drop else 0.3, 0.35) * g / len(notes)
            place(bufs[cs['vowel']], self.until_gap(x, t0), t0)
        out = None
        for vowel, b in bufs.items():
            if np.abs(b).max() > 0:
                y = formant_bank(b.astype(float), vowel)
                out = y if out is None else out + y
        self.stems['choir'] = out.astype(F32)

    BASS_PAT = {
        'groove': [(2, 0, 1.0, 1.5), (6, 0, 0.95, 1.5), (7, 12, 0.55, 0.7), (10, 0, 1.0, 1.5), (14, 0, 0.95, 1.5), (15, 12, 0.55, 0.7)],
        'drop': [(2, 0, 1.0, 1.5), (3, 12, 0.5, 0.7), (6, 0, 0.95, 1.5), (7, 12, 0.6, 0.7), (10, 0, 1.0, 1.5),
                 (11, 12, 0.5, 0.7), (14, 0, 0.95, 1.5), (15, 7, 0.6, 0.7)],
        'pedal': [(0, 0, 1.0, 7.0), (8, 0, 0.95, 7.0)],
        'rising8': [(s, 0, 0.92 if s % 4 == 0 else 0.8, 1.7) for s in range(0, 16, 2)],
    }

    def bass(self):
        T = self.T
        B = self.stem('bass', 1)
        for bar in range(self.bars):
            kind = self.A(bar, 'bass')
            root = self.bassline[bar]
            if not kind or root is None:
                continue
            if 'once' in kind:     # the coda: one long note (the 30 s ending: A2 with its A1 sub)
                r = root + 12 if root < 40 else root
                d = T.beat * 3.2
                self.put('bass', bass_note(r, d, 1.0) * np.exp(-tt(ns(d + 0.03)) / 0.9), T.t(bar), ch=1)
                continue
            pat = kind.split()[0]
            if pat == 'drop' and not any(c in 'xX' for c in self.S['drums']['kick'][bar]):
                pat = 'pedal'      # drums out (the outro's last bar): hold the root
            sid = self.sec[bar]
            b0, b1 = self.sec_span(sid)
            for (s, iv, v, L) in self.BASS_PAT[pat]:
                t = T.t(bar, 0, s)
                if self.in_gap_t(t) or any(s_ <= t + 1e-9 < s_ + T.bar for s_ in self.stops):
                    continue
                if pat == 'rising8':
                    v *= 0.85 + 0.15 * (bar - b0) / max(1, b1 - b0 - 1)
                self.put('bass', bass_note(root + iv, L * T.step, v), t, ch=1)
        # drive the bass into an oversampled soft clipper: denser, more audible on small speakers, and its
        # filter-envelope attacks stop poking out of the mix
        pk = np.abs(B).max()
        r0 = np.sqrt(np.mean(B.astype(float) ** 2))
        y = softclip(B / pk * 1.8, knee=0.45)[0]
        B[:] = y * r0 / np.sqrt(np.mean(y ** 2))

    def piano(self):
        T = self.T
        done_coda = False
        for bar in range(self.bars):
            kind = self.A(bar, 'piano')
            if not kind:
                continue
            name = self.chords[bar]
            notes = PIANO[name]
            if kind == 'stabs':
                for s in [2, 6, 10, 14] + ([7] if bar % 2 else []):
                    self.put('piano', sum(piano_note(m, 0.16, 1.0 if s in (2, 10) else 0.85) for m in notes), T.t(bar, 0, s))
            elif kind.startswith('soft stabs'):
                steps = [int(v) for v in re.findall(r'\d+', kind)] or [2, 10]
                for s in steps:
                    self.put('piano', sum(piano_note(m, 0.2, 0.55) for m in notes), T.t(bar, 0, s))
            elif kind == 'whole-notes':
                low = VOICING[name][0]
                x = sum(piano_note(m, T.bar - 0.05, 0.62) for m in [low] + notes) * 1.3
                self.put('piano', bw(x, 'low', 3500), T.t(bar))
            elif kind.startswith('broken'):
                # the breakdown ballad: a broken chord in 8ths over the low root, pedal down through the bar
                low = VOICING[name][0]
                tones = sorted(notes)
                seq = [low, tones[0], tones[1], tones[2], tones[3], tones[2], tones[1], tones[0]]
                for k, m in enumerate(seq):
                    s = 2 * k
                    v = 2.0 * (0.78 if k == 0 else 0.62 if k in (4,) else 0.52) * (0.85 if bar == self.sec_span(self.sec[bar])[0] else 1.0)
                    self.put('piano', piano_note(m, (16 - s) * T.step + 0.1, v), T.t(bar, 0, s), pan=0.25 * (m - 60) / 12)
            elif kind == 'chords':
                for s in (0, 8):
                    t = T.t(bar, 0, s)
                    if self.in_gap_t(t):
                        continue
                    self.put('piano', sum(piano_note(m, 7 * T.step, 0.8) for m in notes), t)
            elif kind == 'A major':
                if done_coda:
                    continue
                done_coda = True
                self.put('piano', sum(piano_note(m, 1.4, 1.0) for m in PIANO['A'] + [69, 73]), T.t(bar))
                # and softly again under "I am... whole."
                for b in (2, 3):
                    self.put('piano', sum(piano_note(m, T.bar * 0.95, 0.42) for m in [45] + PIANO['A']), T.t(bar + b))
        P = self.stem('piano')
        P[:] = chorus(P, base_ms=9, depth_ms=1.2, rate=0.8, mix=0.3)

    def arp(self):
        T = self.T
        pat = [0, 2, 4, 2, 1, 3, 5, 3, 2, 4, 6, 4, 1, 3, 5, 3]
        for bar in range(self.bars):
            kind = self.A(bar, 'arp')
            if not kind:
                continue
            name = self.chords[bar]
            e = self.energy[bar]
            sid = self.sec[bar]
            b0, b1 = self.sec_span(sid)
            frac = (bar - b0) / max(1, b1 - b0 - 1)
            if 'rising' in kind:   # the pre: eight 8ths climbing the chord, brighter each bar
                tones = [m for m in range(57, 100) if m % 12 in PCS[name]][:8]
                for k in range(8):
                    self.put('arp', pluck(tones[k], 0.3, 0.7 + 0.25 * k / 7, 0.35 + 0.45 * frac, 0.14),
                             T.t(bar, 0, 2 * k), pan=0.5 * np.sin(k * 1.9))
                continue
            up = 12 if 'octave up' in kind else 0
            tones = [m + up for m in range(57, 90) if m % 12 in PCS[name]][:7]
            br = 0.5 + 0.5 * e if 'albedo' in kind else 0.55
            for s in range(16):
                m = tones[pat[s] % len(tones)]
                v = 0.85 if s % 4 == 0 else 0.6
                self.put('arp', pluck(m, 0.24, v, br, 0.12), T.t(bar, 0, s), pan=0.45 * np.sin(s * 1.7))
        # bell sparkles (verse 2) and bells answering the pre's line ends (pre 2)
        for s in self.sections:
            bells = self.arr.get(s['id'], {}).get('bells')
            if bells is not True and not (s['id'] == 'verse2'):
                continue
            b0, b1 = s['bars']
            for bar in range(b0, b1):
                name = self.chords[bar]
                tones = [m for m in range(84, 100) if m % 12 in PCS[name]]
                if bells is True:   # an answer after each line: two notes falling, before the line's last step
                    t = T.t(bar, 0, 14)
                    if self.in_gap_t(t):
                        continue
                    self.put('bells', bell(tones[2], 1.6, 0.5), t, pan=0.5)
                    self.put('bells', bell(tones[0], 1.6, 0.42), T.t(bar, 0, 15), pan=-0.5)
                else:               # sparkles: one high bell on an off-beat 16th, alternating sides
                    s_ = (11, 14, 7, 15)[bar % 4]
                    self.put('bells', bell(tones[(bar * 2) % len(tones)], 1.4, 0.32), T.t(bar, 0, s_), pan=0.6 if bar % 2 else -0.6)

    # ------------------------------------------------------------------ leads: the riff, the tease, the hook double
    def lead_line(self, notes, stem, down=0.55, up=0.22, bright=1.0, pluck_amt=0.35, t_a=None):
        """A supersaw lead playing [(t, dur, midi)]: legato notes glide (25 ms), a filter envelope per note,
        the octave below for body, a soft octave above, and a pluck layered on each attack."""
        notes = sorted(notes)
        t_a = notes[0][0] - 0.01 if t_a is None else t_a
        t_b = max(t + d for t, d, m in notes) + 0.3
        n = ns(t_b - t_a)
        midi = np.full(n, np.nan)
        gate = np.zeros(n)
        fenv = np.zeros(n)
        tl = tt(n)
        for (t, d, m) in notes:
            i0, i1 = ns(t - t_a), ns(t + d - t_a)
            midi[i0:i1] = m
            e = np.zeros(n)
            e[i0:i1] = 1.0
            r = ns(0.06)
            e[i1:i1 + r] = np.linspace(1, 0, len(e[i1:i1 + r]))
            gate = np.maximum(gate, e)
            u = tl - (t - t_a)
            fenv = np.where(u >= 0, np.exp(-np.maximum(u, 0) / 0.18), fenv)
        first = int(np.argmax(~np.isnan(midi)))
        midi[:first] = midi[first]
        idx = np.where(np.isnan(midi), 0, np.arange(n))
        np.maximum.accumulate(idx, out=idx)
        midi = midi[idx]
        a = np.exp(-1 / (0.012 * SR))
        midi, _ = signal.lfilter([1 - a], [1, -a], midi, zi=signal.lfilter_zi([1 - a], [1, -a]) * midi[0])
        gate = uniform_filter1d(gate, ns(0.004))
        f = hz(midi)
        x = supersaw(f, n, 18.0, 0.9) + down * supersaw(f / 2, n, 14.0, 0.6) + up * supersaw(f * 2, n, 12.0, 1.0, voices=5)
        fc = 1400 + 6500 * bright * fenv
        x = tvf(x, 'lp', np.minimum(fc, 16000), q=0.9, block=64) * gate
        for (t, d, m) in notes:
            place(x, st(pluck(m, min(0.3, d + 0.1), 0.8, 1.0, 0.09) * pluck_amt), ns(t - t_a))
        self.put(stem, x, t_a)

    def riff(self):
        T = self.T
        R = self.S['riff']
        self.timing['riff'] = []
        for pl in R['plays']:
            a, b = pl['bars']
            notes = []
            for i, bar in enumerate(range(a, b)):
                for (m, s, L) in R['notes'][pl['riffBars'][i]]:
                    notes.append([T.t(bar, 0, s), L * T.step, m + pl['key']])
            fb = re.findall(r'from beat (\d+)', pl.get('voice', ''))
            if fb:
                notes = [x for x in notes if x[0] >= self.bt(float(fb[0])) - 1e-6]
            keep = []
            for x in notes:   # nothing starts in a gap or after a dead stop; notes crossing one end there
                if self.in_gap_t(x[0]) or any(s <= x[0] + 1e-9 < s + T.bar for s in self.stops):
                    continue
                c = self.cut_time(x[0])
                if c is not None and x[0] + x[1] > c:
                    x[1] = c - x[0] - 0.01
                keep.append(tuple(x))
            if not keep:
                continue
            if 'pluck' in pl.get('voice', ''):   # the intro tease: the riff on a filtered pluck
                for k, (t, d, m) in enumerate(keep):
                    x = (t - keep[0][0]) / max(1e-9, keep[-1][0] - keep[0][0])
                    self.put('tease', pluck(m, d + 0.25, 0.9, 0.22 + 0.25 * x, decay=max(0.2, d * 0.8)), t)
            else:
                self.lead_line(keep, 'riff')
            self.timing['riff'].append(dict(bars=pl['bars'], key=pl['key'], voice=pl.get('voice', ''),
                                            notes=[[round(t, 4), round(d, 4), m] for t, d, m in keep]))

    def tease(self):
        """The build's tease pluck: the chord climbing in 8ths, then 16ths, its filter opening bar by bar."""
        T = self.T
        pat = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1]
        for s in self.sections_with('lead', lambda v: v == 'tease-pluck'):
            b0, b1 = s['bars']
            for bar in range(b0, b1):
                name = self.chords[bar]
                tones = [m for m in range(69, 100) if m % 12 in PCS[name]][:5]
                x = (bar - b0) / max(1, b1 - b0 - 1)
                steps = list(range(0, 16, 2)) if bar < b0 + (b1 - b0) // 2 else list(range(16))
                for k, s_ in enumerate(steps):
                    m = tones[pat[k % 16] % len(tones)]
                    self.put('tease', pluck(m, 0.22, 0.55 + 0.35 * x, 0.22 + 0.6 * x, 0.1), T.t(bar, 0, s_), pan=0.4 * np.sin(k * 1.3))

    def coda_lead(self):
        T = self.T
        for s in self.sections_with('lead', lambda v: v == 'A major triad'):
            t0 = T.t(s['bars'][0])
            n2 = ns(T.dur - t0)
            t2 = tt(n2)
            c = sum(supersaw(hz(m), n2, 16.0) for m in (69, 73, 76, 81)) * 0.55
            c = tvf(c, 'lp', 1200 + 7000 * np.exp(-t2 / 0.5), q=0.8, block=64) * np.exp(-t2 / 1.4)
            self.put('lead', fades(c, 0.003, 0.3), t0)

    # ------------------------------------------------------------------ sung lines (vocals.hook + vocals.sung)
    VSTYLE = {  # mix of the vocoder (melody carrier) and the PSOLA-tuned voice, doubles, extras
        'hook':   dict(voc=0.9, tun=0.55, dbl=(0.22, 0.12), vib=0.2, stem='hook'),                 # the 30 s chain
        'metal':  dict(voc=0.9, tun=0.55, dbl=(0.22, 0.12), vib=0.24, stem='metal'),               # the hook chain, one word
        'pre':    dict(voc=0.54, tun=0.6, dbl=(0.16, 0.1), vib=0.17, stem='pre', presence=3.0),    # vocoder at 60 %
        'ghost':  dict(voc=0.0, tun=1.0, dbl=None, vib=0.12, stem='ghost', band=(180, 9000)),      # tuned only, big hall
        'bridge': dict(voc=0.0, tun=1.0, dbl=None, vib=0.15, stem='bridge'),                       # tuned only, plate
        'coda':   dict(voc=0.0, tun=1.0, dbl=None, vib=0.1, stem='coda', breath=True),             # tuned only, dry, close
    }

    def passages(self):
        """Contiguous sung passages (same style, consecutive bars, no gap between): one melody/PSOLA/vocoder
        run each, so glides never connect across sections."""
        T = self.T
        V = self.S['vocals']
        lines = sorted([dict(l, kind='hook') for l in V.get('hook', [])] + [dict(l, kind='sung') for l in V.get('sung', [])],
                       key=lambda l: l['bar'])
        groups = []
        for l in lines:
            g = groups[-1] if groups else None
            if g and l['bar'] == g[-1]['bar'] + 1 and l['style'] == g[-1]['style'] and \
                    not any(T.t(g[-1]['bar']) <= a < T.t(l['bar']) for a, _ in self.gaps_s):
                g.append(l)
            else:
                groups.append([l])
        out = []
        for g in groups:
            syl = []
            for l in g:
                words = l['words']
                for (sy, step, L, midi) in l['notes']:
                    w = max((w for w in words if w[1] <= step + 1e-9), key=lambda w: w[1], default=words[0])[0]
                    text = SUNG_SPELL.get((w.lower().strip(',.!?'), sy), sy)
                    syl.append(dict(t=T.t(l['bar'], 0, step), dur=L * T.step, midi=float(midi), text=text, syl=sy,
                                    word=w, bar=l['bar'], step=step, len=L, part=l.get('part'), style=l['style'],
                                    line=l['text']))
            out.append(dict(id=f"{g[0]['style']}@{g[0]['bar']}", style=g[0]['style'], lines=g, syl=syl,
                            bars=(g[0]['bar'], g[-1]['bar'] + 1)))
        return out

    def melody(self, P):
        """The passage's pitch curve (MIDI, written pitch): notes held between syllables, 28 ms glides, a
        scoop into detached notes, vibrato on long ones. Shared by the tuned voice, the vocoder carrier and
        the supersaw double."""
        syl = P['syl']
        vib = self.VSTYLE[P['style']]['vib']
        p0 = syl[0]['t'] - 0.25
        p1 = max(s['t'] + s['dur'] for s in syl) + 0.5
        i0 = ns(p0)
        n = ns(p1) - i0
        midi = np.full(n, np.nan)
        for s in syl:
            midi[ns(s['t']) - i0:ns(s['t'] + s['dur']) - i0] = s['midi']
        first = ns(syl[0]['t']) - i0
        midi[:first] = syl[0]['midi']
        idx = np.where(np.isnan(midi), 0, np.arange(n))
        np.maximum.accumulate(idx, out=idx)
        midi = midi[idx]
        a = np.exp(-1 / (0.028 * SR))
        mid, _ = signal.lfilter([1 - a], [1, -a], midi, zi=signal.lfilter_zi([1 - a], [1, -a]) * midi[0])
        prev_end = -1.0
        for s in syl:
            j0, j1 = ns(s['t']) - i0, ns(s['t'] + s['dur']) - i0
            u = (np.arange(j0, j1) + i0) / SR - s['t']
            if s['t'] - prev_end > 0.06:
                mid[j0:j1] += -0.55 * np.exp(-u / 0.045)
            if s['dur'] > 0.35:
                mid[j0:j1] += vib * np.sin(2 * np.pi * 5.6 * u) * smoothstep((u - 0.16) / 0.3)
            prev_end = s['t'] + s['dur']
        P.update(i0=i0, n=n, mel=mid)

    def sing(self, P):
        """PSOLA-tune every syllable of a passage (and a flat 140 Hz copy as the vocoder's modulator), place it
        by its P-centre, then run the passage's style chain."""
        T, V = self.T, self.V
        sty = self.VSTYLE[P['style']]
        syl, i0p, n = P['syl'], P['i0'], P['n']
        tuned = np.zeros(n)
        modu = np.zeros(n)
        src = [trim(V.flite(s['text'], 'slt')) for s in syl]
        ans = [analyse_voice(x) for x in src]
        # P-centre: a syllable starts ahead of its note by its unvoiced/breathy lead-in, taking the time from the
        # rest before it and at most 30 % of the previous note; nothing starts inside a gap
        pre = []
        for k, (s, an) in enumerate(zip(syl, ans)):
            p = pre_roll(an['x'])
            if k:
                q = syl[k - 1]
                p = min(p, max(0.0, s['t'] - (q['t'] + q['dur']) + 0.3 * q['dur']))
            gb = self.last_gap_end(s['t'])
            if gb is not None:
                p = min(p, max(0.0, s['t'] - gb))
            pre.append(p)
        recs = []
        for k, s in enumerate(syl):
            an = ans[k]
            nxt = syl[k + 1]['t'] if k + 1 < len(syl) else None
            legato = nxt is not None and nxt - (s['t'] + s['dur']) < 0.03
            start = s['t'] - pre[k]
            end = s['t'] + s['dur'] - (0.0 if legato else 0.015)
            if nxt is not None:
                end = min(end, nxt - pre[k + 1] - (0.0 if legato else 0.005))
            D = end - start
            n_out = ns(D)
            warp = warp_map(an, n_out, cons_max=ns(pre[k] + 0.025))
            j0 = ns(start) - i0p
            seg = P['mel'][j0:j0 + n_out]
            y = psola(an, n_out, warp, hz(seg - 12))
            m = psola(an, n_out, warp, np.full(n_out, 140.0))
            rel = 0.012 if legato else 0.04
            y = fades(y, 0.002, rel)
            m = fades(m, 0.002, rel)
            lvl = 0.1 * (1.12 if s['dur'] > 0.4 else 0.92 if s['text'] in ('the', 'to', 'in', 'my', 'me') else 1.0)
            vo = (warp >= an['v0']) & (warp < an['v1'])
            g_t = lvl / (np.sqrt(np.mean(y[vo] ** 2)) + 1e-9) if vo.any() else 1.0
            g_m = lvl / (np.sqrt(np.mean(m[vo] ** 2)) + 1e-9) if vo.any() else 1.0
            place(tuned, y * g_t, j0)
            place(modu, m * g_m, j0)
            vowel = start + lead_in(y)   # measured on the rendered syllable
            recs.append(dict(bar=s['bar'], step=s['step'], len=s['len'], word=s['word'], syllable=s['syl'], flite=s['text'],
                             midi=s['midi'], style=s['style'], t_score=round(s['t'], 4), start_s=round(start, 4),
                             vowel_s=round(vowel, 4), vowel_vs_note_ms=round((vowel - s['t']) * 1000, 1),
                             end_s=round(start + D, 4), pre_roll_ms=round(pre[k] * 1000, 1)))
        P['recs'] = recs
        P['tuned'] = tuned.astype(F32)
        P['modu'] = modu
        # the style chain
        f_t = 0.72 * hz(P['mel'] - 12)
        tun = tvf(tvf(tuned, 'hp', f_t, q=0.7, block=128), 'hp', f_t, q=0.7, block=128)
        tun = eq(tun, 'peak', 3000, 1.0, 3.0)
        tun = sat(tun / np.abs(tun).max(), 1.2)
        out = st(tun) * sty['tun']
        if sty['voc'] > 0:
            f = hz(P['mel'])
            outs = []
            for det in (+7, -7):
                # oversampled saws: the vocoder whitens the carrier (+6 dB/oct), which would lift PolyBLEP's
                # top-octave aliasing into the hook's air band
                c = (saw_os(f * 2 ** (det / 1200), n, RNG.random()) + 0.6 * saw_os(f * 2 ** (-det / 1200), n, RNG.random())
                     + 0.45 * saw_os(f / 2, n, RNG.random()) + 0.2 * saw_os(f * 2, n, RNG.random()))
                outs.append(vocoder(modu, c))
            voc = np.vstack(outs)
            voc = eq(voc, 'hp', 160)
            voc = eq(voc, 'peak', 2800, 0.9, 2.5)
            voc = sat(voc / np.abs(voc).max(), 1.3)
            out = out + voc * sty['voc']
            P['voc'] = voc
        if sty['dbl']:
            dbl = np.zeros(n)
            place(dbl, tun, ns(0.013))
            out = out + np.vstack([dbl * sty['dbl'][0], dbl * sty['dbl'][1]])
        if 'band' in sty:
            out = bw(out, 'band', sty['band'], order=2)
        if sty.get('presence'):
            out = eq(out, 'peak', 3000, 1.0, sty['presence'])
        if sty.get('breath'):   # a little breath before each line and in the "..."
            for l in P['lines']:
                t_on = T.t(l['bar'], 0, l['notes'][0][1])
                nb = ns(0.34)
                tb = tt(nb)
                br = tvf(noise(nb), 'bp', 1200 + 1800 * (tb / tb[-1]), q=0.8) * (tb / tb[-1]) ** 2 * 0.05
                place(out, st(fades(br, 0.05, 0.04)), ns(t_on - 0.42) - i0p)
        if P['style'] != 'hook':   # every passage sits at the level of the hook passages; GAINS sets the style
            out = out * self.vox_ref / (active_rms(out) + 1e-12)
        else:
            self.vox_ref_list.append(active_rms(out))
        self.put(sty['stem'], out, i0p / SR, stops=False, gap_ok=True)
        self.lines += [dict(kind='sung', style=l['style'], bar=l['bar'], text=l['text'], stem=sty['stem'],
                            t0=T.t(l['bar']), t1=T.t(l['bar'] + 1)) for l in P['lines']]
        self.timing.setdefault('sung', []).extend(recs)

    def hook_lead(self, P):
        """The 30 s supersaw double of the hook melody (-12 dB in GAINS), with the octave in the final choruses."""
        lead = self.A(P['bars'][0], 'lead') or ''
        if 'hook double' not in lead:
            return
        up = 0.75 if 'octave' in lead else 0.35
        i0, n = P['i0'], P['n'] + ns(0.4)
        a = i0 / SR
        f = hz(np.pad(P['mel'], (0, n - P['n']), mode='edge'))
        gate = np.zeros(n)
        fenv = np.zeros(n)
        tl = tt(n)
        for s in P['syl']:
            s0, s1 = ns(s['t']) - i0, ns(s['t'] + s['dur']) - i0
            e = np.zeros(n)
            e[s0:s1] = 1.0
            r = ns(0.06)
            e[s1:s1 + r] = np.linspace(1, 0, len(e[s1:s1 + r]))
            gate = np.maximum(gate, e)
            u = tl - (s['t'] - a)
            fenv = np.where(u >= 0, np.exp(-np.maximum(u, 0) / 0.2), fenv)
        gate = uniform_filter1d(gate, ns(0.004))
        x = supersaw(f, n, 18.0, 0.9) + up * supersaw(f * 2, n, 14.0, 1.0, voices=5) + st(0.3 * pulse(f / 2, n, 0.3))
        x = tvf(x, 'lp', 1500 + 6000 * fenv, q=0.9, block=64)
        self.put('lead', x * gate, a, stops=False, gap_ok=True)

    def crowd(self, P):
        """'The choir sings the hook with her': the hook's modulator vocoding a crowd of detuned saws at the
        melody and an octave below (two independent crowds, left and right)."""
        n = P['n']
        f = hz(P['mel'])
        tl = tt(n)
        sides = []
        for side in range(2):
            c = np.zeros(n)
            for v in range(7):
                octv = 1.0 if v < 4 else 0.5
                cents = RNG.uniform(-16, 16) + (8 + 8 * RNG.random()) * np.sin(2 * np.pi * (4.6 + RNG.random()) * tl + RNG.random() * 6.28)
                c += saw_os(f * octv * 2 ** (cents / 1200), n, RNG.random()) * (1.0 if octv == 1.0 else 0.7)
            sides.append(vocoder(P['modu'], c, noise_amt=0.3, sib=0.15))
        y = eq(np.vstack(sides), 'hp', 200)
        y = eq(y, 'hs', 7000, 0.7, -3.0)
        y = y * self.vox_ref / (active_rms(y) + 1e-12)
        self.put('crowd', y, P['i0'] / SR, stops=False, gap_ok=True)

    def chops(self, hookP):
        """vocals.chops: the rendered (vocoded) hook syllables of chorus 1 re-used over the riff."""
        T = self.T
        if hookP is None or 'voc' not in hookP:
            return
        recs = hookP['recs']
        voc = hookP['voc']
        out = []
        for c in self.S['vocals'].get('chops', []):
            want = [s.lower() for s, _ in c['syllables']]
            # the first run of consecutive syllables of chorus 1 matching the chop's
            k0 = None
            for k in range(len(recs) - len(want) + 1):
                if [r['syllable'].lower() for r in recs[k:k + len(want)]] == want:
                    k0 = k
                    break
            if k0 is None:
                log('chop not found in the hook:', c['text'])
                continue
            src = recs[k0:k0 + len(want)]
            w0 = ns(src[0]['start_s'] - 0.01) - hookP['i0']
            w1 = ns(src[-1]['end_s'] + 0.06) - hookP['i0']
            x = fades(voc[:, w0:w1], 0.003, 0.03)
            shift = T.t(c['bar'], 0, c['syllables'][0][1]) - src[0]['t_score']
            t = src[0]['start_s'] - 0.01 + shift
            x = sat(eq(x, 'hp', 220) * 1.3, 1.4)
            self.put('chops', x, t)
            if len(want) == 1:   # "whole!": a 1/8 ping-pong echo, ringing into the air after a stop
                e = pingpong(np.pad(x, ((0, 0), (0, ns(1.6)))), 2 * T.step, fb=0.5, taps=6, lp=6000, hp=300) * 0.7
                nb = T.t(c['bar'] + 1) + 0.2 - t
                e = e[:, :ns(nb)]
                e = fades(e, 0.0, 0.2)
                place(self.stem('chops'), e, t)
            out.append(dict(bar=c['bar'], text=c['text'], src_bar=src[0]['bar'],
                            syllables=[dict(syllable=r['syllable'], step=c['syllables'][i][1],
                                            vowel_s=round(r['vowel_s'] + shift, 4)) for i, r in enumerate(src)]))
            self.lines.append(dict(kind='chop', style='chop', bar=c['bar'], text=c['text'], stem='chops',
                                   t0=T.t(c['bar']), t1=T.t(c['bar'] + 1)))
        self.timing['chops'] = out

    def coda_echo(self):
        """The 30 s coda: a vocoded echo of 'whole' on an A major chord carrier, at bar 100 beat 2."""
        T, V = self.T, self.V
        cs = [s for s in self.sections if self.arr.get(s['id'], {}).get('lead') == 'A major triad']
        if not cs:
            return
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
        t = T.t(cs[0]['bars'][0], 1)
        self.put('echo', st(e / np.abs(e).max()), t)
        self.timing.setdefault('fx', []).append(dict(type='coda whole echo', t=round(t, 4)))

    def vocals_sung(self):
        Ps = self.passages()
        self.vox_ref_list = []
        hookP = None
        for P in sorted(Ps, key=lambda P: P['style'] != 'hook'):   # the hook passages first: they set the level
            self.melody(P)
            if P['style'] != 'hook' and not hasattr(self, 'vox_ref'):
                self.vox_ref = float(np.mean(self.vox_ref_list)) if self.vox_ref_list else 0.1
            self.sing(P)
            if P['style'] == 'hook':
                self.hook_lead(P)
                if self.A(P['bars'][0], 'choir') == 'sings the hook':
                    if not hasattr(self, 'vox_ref'):
                        self.vox_ref = float(np.mean(self.vox_ref_list))
                    self.crowd(P)
                if hookP is None or P['bars'][0] < hookP['bars'][0]:
                    hookP = P
            self.vox_layers[P['id']] = dict(i0=P['i0'], tuned=P['tuned'], mel=P['mel'].astype(F32), syl=P['syl'],
                                            recs=P['recs'], style=P['style'])
            log(f"  sung {P['id']}: {len(P['syl'])} syllables")
        self.chops(hookP)
        for P in Ps:
            P.pop('modu', None)
            P.pop('voc', None)
        self.coda_echo()

    # ------------------------------------------------------------------ rap, shouts, the Hermit, announcers
    def word_slots(self, lines):
        T = self.T
        words = []
        for line in lines:
            ws = line['words']
            for i, (w, s) in enumerate(ws):
                nxt = ws[i + 1][1] if i + 1 < len(ws) else min(16, s + 6)
                words.append(dict(t=T.t(line['bar'], 0, s), word=w, key=w.strip(',.!?').lower(), avail=(nxt - s) * T.step,
                                  bar=line['bar'], step=s, last=i + 1 == len(ws)))
        return words

    def said(self, lines, layers, pitch_main, tempo_nat=1.0, weak_gain=0.8, i_lo=0, n=None):
        """The 30 s rap pipeline for any spoken voice: each word rendered by flite (rms), time-fitted into its
        slot by rubberband, P-centre placed (it starts ahead of its step by its unvoiced lead-in, taken from
        the word before), one buffer per layer (tempo, pitch, delay). Returns the buffers and the records."""
        V = self.V
        words = self.word_slots(lines)
        weak = {'on', 'the', 'to', 'a', 'in', 'is', 'of', 'my', 'at', 'it'}
        src = []
        for w in words:
            x = trim(V.flite(SAID_SPELL.get(w['key'], w['key']), 'rms'))
            src.append(x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * (0.1 * weak_gain if w['key'] in weak else 0.1))

        def dur(x, avail):
            n0 = len(x) / SR / tempo_nat
            return min(float(np.clip(n0, 0.55 * avail, 0.9 * avail)), 1.3 * n0)

        def say(x, D, tm=1.0, pc=pitch_main):
            y = trim(V.rubberband(x, tempo=len(x) / SR / D * tm, pitch=2 ** (pc / 12)))
            return fit_len(y, ns(D / tm))
        pre = [pre_roll(say(x, dur(x, w['avail'])), cap=0.16) for x, w in zip(src, words)]
        bufs = [np.zeros(n) for _ in layers]
        recs = []
        for i, (x, w) in enumerate(zip(src, words)):
            joined = i + 1 < len(words) and abs(words[i + 1]['t'] - (w['t'] + w['avail'])) < 1e-6
            nxt_pre = pre[i + 1] if joined else 0.0
            D = min(dur(x, w['avail']), 0.9 * (w['avail'] + pre[i] - nxt_pre) + 0.02)
            y0 = say(x, D)
            p = min(pre[i], pre_roll(y0, cap=0.16))   # a word squeezed for the next one's pre-roll has a shorter lead-in
            for buf, (tm, pc, dt_) in zip(bufs, layers):
                y = y0 if (tm == 1.0 and pc == pitch_main) else say(x, D, tm, pc)
                place(buf, fades(y, 0.002, 0.015), ns(w['t'] - p + dt_) - i_lo)
            vowel = w['t'] - p + lead_in(y0)
            recs.append(dict(bar=w['bar'], step=w['step'], word=w['word'], flite=SAID_SPELL.get(w['key'], w['key']),
                             t_score=round(w['t'], 4), start_s=round(w['t'] - p, 4), vowel_s=round(vowel, 4),
                             vowel_vs_step_ms=round((vowel - w['t']) * 1000, 1), pre_roll_ms=round(p * 1000, 1),
                             dur_s=round(D, 4)))
        return bufs, recs

    def rap(self):
        T = self.T
        lines = sorted(self.S['vocals'].get('rap', []), key=lambda l: l['bar'])
        groups = []
        for l in lines:
            if groups and l['bar'] == groups[-1][-1]['bar'] + 1 and l['style'] == groups[-1][-1]['style']:
                groups[-1].append(l)
            else:
                groups.append([l])
        self.timing['rap'] = []
        self.timing['shouts'] = []
        for g in groups:
            style = g[0]['style']
            if style == 'shout':
                self.shouts(g)
                continue
            t_lo = T.t(g[0]['bar']) - 0.3
            i_lo = ns(t_lo)
            n = ns(T.t(g[-1]['bar'] + 1) + 0.8) - i_lo
            if style == 'whisper':
                layers = [(1.0, -2.5, 0.0)]
            else:
                layers = [(1.0, -2.5, 0.0), (1.012, -2.35, 0.011), (0.988, -2.65, 0.017)]
                if style == 'hype':
                    layers.append((1.006, -2.0, 0.023))    # hype: a third double
            bufs, recs = self.said(g, layers, -2.5, i_lo=i_lo, n=n)
            for r in recs:
                r['style'] = style
            self.timing['rap'] += recs
            main = bufs[0]
            if style == 'whisper':
                # breathy: the line as a whisper (noise-excited) with a little of the voice under it, no doubles
                y = 0.85 * whisper(main) + 0.3 * main
                y = eq(eq(y, 'hp', 250, 0.8), 'lp', 9000, 0.7)
                y = eq(y, 'peak', 2600, 1.0, 3.0)
                y = sat(y / np.abs(y).max() * 1.2, 1.2)
                self.put('whisper', st(y), t_lo, stops=False, gap_ok=True)
                stem = 'whisper'
            else:
                drive = 10 ** (2 / 20) if style == 'hype' else 1.0
                y = eq(main, 'hp', 150, 0.8)
                y = eq(y, 'lp', 7500, 0.7)
                y = eq(y, 'peak', 350, 1.0, -3.0)
                y = eq(y, 'peak', 2600, 1.0, 4.0)
                pk = np.abs(y).max()
                y = sat(y / pk * 1.6 * drive, 1.8)
                d = sat((eq(eq(bufs[1], 'hp', 180), 'lp', 6500)) / pk * 1.6 * drive, 1.8)
                e = sat((eq(eq(bufs[2], 'hp', 180), 'lp', 6500)) / pk * 1.6 * drive, 1.8)
                out = st(y) + 0.42 * np.vstack([d, e * 0.8]) + 0.42 * np.vstack([d * 0.25, e])
                if style == 'hype':
                    f3 = sat((eq(eq(bufs[3], 'hp', 200), 'lp', 6000)) / pk * 1.6 * drive, 1.8)
                    out += 0.3 * st(f3)
                slap = np.zeros_like(out)
                place(slap, bw(out.mean(0), 'band', (300, 3500)) * 0.28, ns(T.step))
                out = out + slap[::-1]  # opposite side (L<->R swap)
                if style == 'hype':
                    out = out * 10 ** (HYPE_GAIN_DB / 20)   # over the riff: the loudest rap
                self.put('rap', out, t_lo, stops=False, gap_ok=True)
                stem = 'rap'
            self.lines += [dict(kind='rap', style=style, bar=l['bar'], text=l['text'], stem=stem,
                                t0=T.t(l['bar']), t1=T.t(l['bar'] + 1)) for l in g]

    def shout_voice(self, text, max_len=None, tempo=0.95):
        """The 30 s RUBEDO chain: rms at -2 st, awb doubling at -4 st, rms an octave lower, saturated, presence."""
        V = self.V
        x = trim(V.flite(text, 'rms'))
        x2 = trim(V.flite(text, 'awb'))
        if max_len:
            tempo = max(tempo, len(x) / SR / max_len)
        main = trim(V.rubberband(x, tempo=tempo, pitch=2 ** (-2 / 12)))
        dbl = trim(V.rubberband(x2, tempo=len(x2) / len(x) * tempo, pitch=2 ** (-4 / 12)))
        low = trim(V.rubberband(x, tempo=tempo, pitch=2 ** (-14 / 12)))
        n = max(len(main), len(dbl), len(low))
        y = fit_len(main, n) + 0.45 * fit_len(dbl, n) + 0.35 * fit_len(low, n)
        y = sat(y / np.abs(y).max() * 2.0, 2.8)
        y = eq(y, 'peak', 3200, 0.9, 5.0)
        y = eq(y, 'hs', 6000, 0.7, 3.0)
        y = eq(y, 'hp', 120)
        return y, main

    def shout_record(self, kind, text, beat_t, y, start, extra=None):
        count = max(1, len(re.findall(r'[aeiouy]+', text.lower().replace('pull', 'pul'))))
        ons, nuc = syllable_onsets(y, count)
        T = self.T
        absol = [round(start + o, 4) for o in ons]
        r = dict(kind=kind, text=text, t=round(beat_t, 4), beat=round(beat_t / T.beat, 4), start_s=round(start, 4),
                 end_s=round(start + y.shape[-1] / SR, 4), syllable_count=count, syllables_s=absol,
                 syllables_rel_s=[round(a - beat_t, 4) for a in absol],
                 syllables_beats=[round((a - beat_t) / T.beat, 3) for a in absol],
                 nuclei_s=[round(start + v, 4) for v in nuc], found=len(ons) == count)
        if extra:
            r.update(extra)
        return r

    def shouts(self, g):
        """The roll call's planet names: the announcer chain on one word, on the downbeat (P-centre), fitted
        into the bar's first half so the sung metal on beat 3 stands alone."""
        T = self.T
        for line in g:
            for (w, s) in line['words']:
                t = T.t(line['bar'], 0, s)
                txt = w.strip(',.!?').lower()
                y, main = self.shout_voice(txt, max_len=6.0 * T.step)
                p = pre_roll(main)
                self.put('shout', st(y), t - p, stops=False)
                self.timing['shouts'].append(self.shout_record('shout', w, t, y, t - p, dict(bar=line['bar'], step=s)))
            self.lines.append(dict(kind='rap', style='shout', bar=line['bar'], text=line['text'], stem='shout',
                                   t0=T.t(line['bar']), t1=T.t(line['bar'], 0, 8)))

    def spoken(self):
        """The Hermit: rms at -9 st and tempo 0.8, words placed by P-centre like the rap, a warm hall on the main
        voice and a dry double an octave under it."""
        T = self.T
        lines = self.S['vocals'].get('spoken', [])
        if not lines:
            return
        t_lo = T.t(lines[0]['bar']) - 0.3
        i_lo = ns(t_lo)
        n = ns(T.t(lines[-1]['bar'] + 1) + 1.0) - i_lo
        bufs, recs = self.said(lines, [(1.0, -9.0, 0.0), (1.0, -21.0, 0.0)], -9.0, tempo_nat=0.8, weak_gain=0.85,
                               i_lo=i_lo, n=n)
        main, low = bufs
        y = eq(main, 'hp', 70)
        y = eq(y, 'ls', 220, 0.7, 3.0)          # close
        y = eq(y, 'peak', 2500, 1.0, 2.5)
        y = eq(y, 'lp', 7000, 0.7)
        pk = np.abs(y).max()
        y = sat(y / pk * 1.3, 1.3)
        d = eq(eq(low, 'lp', 2500), 'hp', 50)
        d = sat(d / pk * 1.3, 1.3)
        self.put('hermit', st(y), t_lo, stops=False, gap_ok=True)
        self.put('hermit_dry', st(d), t_lo, stops=False, gap_ok=True)
        for r in recs:
            r['style'] = 'hermit'
        self.timing['spoken'] = recs
        self.lines += [dict(kind='spoken', style='hermit', bar=l['bar'], text=l['text'], stem='hermit',
                            t0=T.t(l['bar']), t1=T.t(l['bar'] + 1)) for l in lines]

    def announcer(self):
        V = self.V
        self.timing['announcer'] = []
        A = self.stem('announcer')
        send = self.stem('ann_send')
        for a in self.S['vocals'].get('announcer', []):
            t = self.bt(a['beat'])
            text = a.get('flite', a['text'])
            style = a.get('style', '')
            voice = a.get('voice', 'rms')
            gap = next((g for g in self.gaps_s if abs(g[0] - t) < 1e-6), None)
            if 'deep' in style:
                # the 30 s Nigredo: rms slowed to 0.8 at -6 st with an octave below, saturated, huge reverb
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
                place(send, st(y), t)
                rec = self.shout_record('announcer', a['text'], t, y, t, dict(voice='rms', chain='30 s Nigredo'))
            elif voice == 'awb':
                # THE DIRECTOR: dry megaphone (band-passed 350-3500 Hz, horn grit), a 60 ms slap, no hall
                x = trim(V.flite(text, 'awb'))
                max_len = (gap[1] - gap[0]) + 0.25 if gap else None
                tempo = max(1.0, len(x) / SR / max_len) if max_len else 1.0
                y = trim(V.rubberband(x, tempo=tempo, pitch=2 ** (1 / 12)))
                y = bw(y, 'band', (350, 3500), order=4)
                y = sat(y / np.abs(y).max() * 2.4, 2.6)
                y = bw(y, 'band', (350, 3500), order=2)
                y = eq(y, 'peak', 1700, 1.1, 4.0)
                y = y / np.abs(y).max()
                out = st(y, -0.08)
                slap = np.zeros((2, out.shape[-1] + ns(0.08)))
                place(slap, st(bw(y, 'band', (400, 3000)) * 0.32, 0.5), ns(0.060))
                out = np.pad(out, ((0, 0), (0, ns(0.08)))) + slap
                place(self.stem('director'), out, t)
                rec = self.shout_record('director', a['text'], t, y, t, dict(voice='awb', chain='megaphone'))
            elif '+' in voice:
                # the anime title shout on the title drop: doubled, a short plate, on the music bus
                y, main = self.shout_voice(text, tempo=0.95)
                self.put('title', st(y), t, stops=False)
                rec = self.shout_record('title', a['text'], t, y, t, dict(voice=voice, chain='30 s RUBEDO, plate'))
            else:
                # a stage shouted into its gap (the 30 s RUBEDO chain), fitted to the gap + 0.12 s, its own hall
                max_len = (gap[1] - gap[0]) + 0.12 if gap else None
                y, main = self.shout_voice(text, max_len=max_len)
                place(A, st(y), t)
                sd = st(y) * 0.45
                if 'bright' in style:
                    sd = eq(sd, 'hs', 4500, 0.7, 4.0)
                elif 'warm' in style:
                    sd = eq(eq(sd, 'lp', 5000, 0.7), 'ls', 300, 0.7, 2.0)
                place(send, sd, t)
                rec = self.shout_record('announcer', a['text'], t, y, t, dict(voice='rms', flite=text, chain='30 s RUBEDO'))
            rec['beat'] = a['beat']
            self.timing['announcer'].append(rec)
            self.lines.append(dict(kind='announcer', style=voice, bar=int(a['beat'] // 4), text=a['text'],
                                   stem='director' if voice == 'awb' else 'title' if '+' in voice else 'announcer',
                                   t0=t, t1=t + 0.6))

    # ------------------------------------------------------------------ all
    def compose(self, mixer):
        """Vocals first (the mixer's vocal-keyed ducking needs them), then each instrument group, handed to the
        mixer as soon as it is done so the full-length stems never all live in memory at once."""
        for name, fn in [('sung', self.vocals_sung), ('rap', self.rap), ('spoken', self.spoken), ('announcer', self.announcer)]:
            fn()
            log('composed', name)
        self.presence = check_lines(self)
        mixer.set_duck(self)
        steps = [('drums', self.drums), ('fx', self.fx), ('atmosphere', self.atmosphere), ('pad', self.pad),
                 ('choir', self.choir), ('bass', self.bass), ('piano', self.piano), ('arp', self.arp),
                 ('riff', self.riff), ('tease', self.tease), ('coda lead', self.coda_lead), ('vocals', None)]
        kept = set()
        for name, fn in steps:
            if fn is not None:
                fn()
            for k in list(self.stems):
                if (k in VOCAL_STEMS and fn is not None) or k in kept:
                    continue
                mixer.add(k, self.stems[k])
                if k in KEEP_STEMS:
                    kept.add(k)
                else:
                    del self.stems[k]
            log('composed' if fn else 'mixed', name)


def active_rms(x, floor_db=-30.0):
    """RMS over the 50 ms blocks within floor_db of the loudest (the level while something sounds)."""
    p = np.mean(np.atleast_2d(x) ** 2, axis=0)
    w = ns(0.05)
    k = max(1, len(p) // w)
    e = p[:k * w].reshape(k, w).mean(axis=1)
    act = e > e.max() * 10 ** (floor_db / 10)
    return float(np.sqrt(e[act].mean())) if act.any() else 0.0


# =====================================================================================
# mix and master
# =====================================================================================

GAINS = {  # dB, before the master gain (the 30 s values for the 30 s stems)
    'kick': -1.5, 'clap': 3.0, 'snare': -3.0, 'hats': -9.0, 'roll': -7.0, 'crash': -11.0, 'revcym': -12.0,
    'revcym_gap': -10.0, 'bass': -7.0, 'low': -6.0, 'pad': -6.0, 'choir': -6.0, 'piano': -5.0, 'arp': -14.0,
    'tease': -12.0, 'lead': -12.0, 'bells': -17.0, 'orch': -2.0, 'gong': -9.0, 'drone': -8.0, 'wind': -10.0,
    'swell': -5.0, 'riser': -13.0, 'announcer': -3.0, 'rap': 0.0, 'hook': 0.8, 'echo': -3.0,
    # the full version's
    'riff': -6.5, 'pre': -0.5, 'metal': 2.0, 'ghost': -1.0, 'bridge': 1.0, 'coda': -2.0, 'crowd': -7.0,
    'chops': -7.0, 'whisper': -1.0, 'shout': 0.0, 'hermit': 2.0, 'hermit_dry': -6.0, 'title': -3.0,
    'director': 2.7, 'jingle': -13.0, 'whisperfx': -14.0, 'musicbox': -11.0, 'fx': -9.0, 'gapfx': -9.0,
    'thunder': 3.0,
}
SEND_HALL = {'pad': 0.12, 'choir': 0.45, 'piano': 0.22, 'lead': 0.22, 'bells': 0.6, 'orch': 0.55, 'gong': 0.35,
             'clap': 0.10, 'rap': 0.10, 'hook': 0.28, 'arp': 0.25, 'tease': 0.4, 'crash': 0.08, 'snare': 0.15,
             'echo': 0.8, 'drone': 0.3, 'swell': 0.2, 'riser': 0.15, 'roll': 0.08,
             'riff': 0.18, 'pre': 0.3, 'metal': 0.32, 'ghost': 0.2, 'bridge': 0.15, 'crowd': 0.5, 'chops': 0.15,
             'whisper': 0.4, 'shout': 0.3, 'hermit': 0.6, 'jingle': 0.45, 'whisperfx': 0.6, 'musicbox': 0.5,
             'fx': 0.25, 'thunder': 0.25, 'title': 0.05}
SEND_BIG = {'ghost': 0.7, 'gong': 0.25, 'jingle': 0.25, 'bells': 0.15, 'whisperfx': 0.3}   # the 4.5 s hall
SEND_PLATE = {'clap': 0.30, 'snare': 0.35, 'hook': 0.25, 'rap': 0.16, 'lead': 0.10, 'roll': 0.15, 'piano': 0.1,
              'pre': 0.22, 'metal': 0.25, 'bridge': 0.5, 'title': 0.45, 'shout': 0.22, 'riff': 0.08, 'chops': 0.2}
SEND_DELAY = {'hook': 0.22, 'lead': 0.14, 'arp': 0.30, 'tease': 0.35, 'bells': 0.25, 'echo': 0.4, 'piano': 0.08,
              'riff': 0.22, 'pre': 0.2, 'metal': 0.3, 'chops': 0.3, 'whisper': 0.3, 'musicbox': 0.3, 'jingle': 0.3,
              'bridge': 0.1, 'crowd': 0.12}
SEND_PREFILTER = {'hermit': ('low', 3800)}   # the Hermit's warm hall
PUMPED = {'pad': 0.65, 'choir': 0.45, 'bass': 0.8, 'lead': 0.4, 'piano': 0.35, 'arp': 0.5, 'tease': 0.4, 'hall': 0.5,
          'delay': 0.4, 'riff': 0.42, 'crowd': 0.3}
LOW_GROUP = ('kick', 'bass', 'low')
DUCKED = ('pad', 'choir', 'piano', 'arp', 'lead', 'tease', 'riff')  # everything else is high-passed at ~130 Hz
HYPE_GAIN_DB = 2.0                     # the hype rap (over the riff, bars 88-92) over the other rap styles
RAP_DUCK_DB = {'riff': 5.0, 'lead': 4.0}   # ...and the supersaws under it dip while its words sound (broadband)
THUNDER_DUCK_DB = {'riser': 10.0, 'clap': 6.0, 'snare': 6.0, 'hats': 6.0, 'roll': 6.0, 'crash': 6.0}  # under the crack
BYPASS = ('announcer', 'revcym_gap', 'director', 'gapfx')            # not gated: the gaps' shouts and their fx
VOCAL_STEMS = ('hook', 'metal', 'pre', 'ghost', 'bridge', 'coda', 'crowd', 'rap', 'whisper', 'shout', 'hermit',
               'hermit_dry', 'announcer', 'ann_send', 'title', 'director')
DUCK_KEY = ('rap', 'hook', 'pre', 'metal', 'ghost', 'bridge', 'coda', 'whisper', 'shout', 'hermit', 'title')
KEEP_STEMS = ('kick',)
GROUPS = {'drums': ('kick', 'clap', 'snare', 'hats', 'roll', 'crash', 'revcym'), 'bass': ('bass', 'low'),
          'vocals': VOCAL_STEMS + ('chops', 'echo', 'whisperfx'),
          'fx': ('riser', 'orch', 'gong', 'swell', 'fx', 'thunder', 'jingle', 'musicbox', 'bells', 'revcym_gap', 'gapfx')}


def group_of(name):
    for g, names in GROUPS.items():
        if name in names:
            return g
    return 'music'


def gap_gate(song):
    g = np.ones(song.N)
    r = ns(0.006)
    o = ns(0.001)
    for fa, fb in song.gaps:
        a, b = ns(song.bt(fa)), ns(song.bt(fb))
        g[a - r:a] = np.minimum(g[a - r:a], np.linspace(1, 0, r))
        g[a:b] = 0.0
        g[b - o:b] = np.linspace(0, 1, o + 1)[:-1]  # reopen over 1 ms ending exactly on the drop's first sample
    return g


def arc_units(song):
    """The loudness arc of SPEC-full 2.5 point 9, as units with target short-term loudness relative to the
    final chorus (LU): sections (gaps excluded), the build bar by bar (+8 LU over 8 bars), the stage gaps
    (the shout within 2 LU of its drop). Units without a target are only measured."""
    T = song.T
    ARC = {'coldopen': -8.0, 'intro': -6.0, 'riff1': -2.8, 'verse1': -5.0, 'pre1': -4.0, 'chorus1': -2.5, 'riff2': -2.6, 'verse2': -3.5,
           'pre2': -2.8, 'chorus2': -1.0, 'riff3': -1.6, 'breakdown': -10.2, 'chorus3': 0.0, 'rapriff': -0.3,
           'chorus4': 0.0}
    gaps = song.gaps_s

    def minus_gaps(a, b):
        spans = [(a, b)]
        for ga, gb in gaps:
            nxt = []
            for x, y in spans:
                if gb <= x or ga >= y:
                    nxt.append((x, y))
                else:
                    if ga > x:
                        nxt.append((x, ga))
                    if gb < y:
                        nxt.append((gb, y))
            spans = nxt
        return [s for s in spans if s[1] - s[0] > 0.05]
    units = []
    for s in song.sections:
        b0, b1 = s['bars']
        if s['id'] == 'build':
            for bar in range(b0, b1):
                units.append(dict(name=f'build.{bar}', spans=minus_gaps(T.t(bar), T.t(bar + 1)),
                                  target=-9.5 + 8.0 * (bar - b0) / (b1 - b0 - 1), kind='bar', centre=T.t(bar, 2)))
            continue
        units.append(dict(name=s['id'], spans=minus_gaps(T.t(b0), T.t(b1)), target=ARC.get(s['id']), kind='section'))
    shout_beats = {a['beat'] for a in song.S['vocals'].get('announcer', [])}
    for (fa, fb), (ga, gb) in zip(song.gaps, gaps):
        drop_bar = int(round(fb / 4))
        drop = next((u['name'] for u in units if u['kind'] == 'section' and song.sec[drop_bar] == u['name']), None)
        stage = fa in shout_beats and song.S['vocals']['announcer'] and \
            any(a['beat'] == fa and a.get('voice', 'rms') == 'rms' for a in song.S['vocals']['announcer'])
        director = any(a['beat'] == fa and a.get('voice') == 'awb' for a in song.S['vocals'].get('announcer', []))
        units.append(dict(name=f'gap@{fa:g}', spans=[(ga, gb)], target=-5.0 if director else None, kind='gap',
                          drop=drop, drop_bar=(T.t(drop_bar), T.t(drop_bar + 1)), stage=bool(stage)))
    return units


def unit_loudness(y, units):
    kw = k_weight(y)
    c = np.concatenate([[0.0], np.cumsum(np.sum(kw ** 2, axis=0))])
    del kw
    out = {}
    for u in units:
        tot = sum(c[ns(b)] - c[ns(a)] for a, b in u['spans'])
        cnt = sum(ns(b) - ns(a) for a, b in u['spans'])
        out[u['name']] = float(-0.691 + 10 * np.log10(tot / max(cnt, 1) + 1e-20))
        if u['kind'] == 'gap':
            a, b = u['drop_bar']
            out[u['name'] + ':drop'] = float(-0.691 + 10 * np.log10((c[ns(b)] - c[ns(a)]) / max(1, ns(b) - ns(a)) + 1e-20))
    return out


class Mixer:
    """Gain staging, high-passes, sidechain pumping, the vocal-keyed dynamic EQ, sends, the gaps, the monitor:
    stems are added one by one (and can then be freed); finish() returns the pre-master stereo sum."""

    def __init__(self, song):
        self.song = song
        T, N = song.T, song.N
        self.N = N
        self.bus = np.zeros((2, N))
        self.sends = {k: np.zeros((2, N), F32) for k in ('hall', 'plate', 'delay', 'big')}
        self.byp = {}
        self.ann_send = None
        self.groups = {g: np.zeros((2, N), F32) for g in ('drums', 'bass', 'music', 'fx', 'vocals')}
        self.units = arc_units(song)
        self.stats = {}
        # sidechain: one pumping shape, scaled per stem (the muffled and heartbeat kicks pump less)
        L = ns(0.21 + 0.03)
        u = tt(L)
        shape = np.where(u < 0.003, u / 0.003, np.where(u < 0.018, 1.0, (1 - smoothstep((u - 0.018) / 0.21))))
        P = np.zeros(N)
        for (t, v, acc, bar, s) in song.ev['kick']:
            fc, x, fixed = song.kick_filter(t / T.beat)
            d = 0.3 if fixed else 0.4 if fc is not None else 1.0
            i0 = ns(t) - ns(0.001)
            seg = P[i0:i0 + L]
            np.maximum(seg, d * shape[:len(seg)], out=seg)
        self.P = P.astype(F32)
        # high-pass sweeps on the music into the stops: the pre-choruses' last bar and a half, the build's crown
        self.hp_sweeps = []
        for (fa, fb) in song.gaps:
            bar = int(fa // 4)
            sid = song.sec[bar]
            if sid and sid.startswith('pre'):
                a, b = song.bt(fa) - 1.5 * T.bar, song.bt(fa)
                names = ('pad', 'choir', 'bass', 'arp', 'low')
                top = 380.0
            elif sid == 'build':
                a, b = song.bt(fa) - 1.5 * T.bar, song.bt(fa)
                names = ('pad', 'choir', 'arp')
                top = 260.0
            else:
                continue
            i0, i1 = ns(a), ns(b)
            curve = np.exp(np.linspace(np.log(20.0), np.log(top), i1 - i0) ** 1.0)
            self.hp_sweeps.append((i0, i1, curve, names))
        self.duck = np.ones(N, F32)
        self.rapduck = None
        # the thunder (SPEC-full 1.4, the sixth moment) clears the air: under its crack the white riser and the
        # drums' clap, snare roll, hats and crash dip (3 ms down, held 0.3 s, back over 0.25 s), the kick stays
        self.thunder_duck = None
        th = [song.bt(h['beat']) for h in song.S['hits'] if h['type'] == 'thunder']
        if th:
            w = np.zeros(N)
            k = ns(0.553)
            seg = keys_curve(k, [(0, 0.0), (0.003, 1.0), (0.303, 1.0), (0.553, 0.0)])
            for t in th:
                i0 = ns(t) - ns(0.003)
                w[i0:i0 + k] = np.maximum(w[i0:i0 + k], seg[:N - i0])
            self.thunder_duck = {nm: (10 ** (-d * w / 20)).astype(F32) for nm, d in THUNDER_DUCK_DB.items()}

    def set_duck(self, song):
        """Vocal-keyed dynamic EQ: while anyone sings, raps or shouts, the harmony instruments dip (up to 6 dB)
        in the 0.9-5 kHz band, so the words sit on top without the music getting smaller."""
        vox = np.zeros(self.N)
        for k in DUCK_KEY:
            if k in song.stems:
                x = song.stems[k]
                vox += (x.mean(0) if x.ndim == 2 else x) * 10 ** (GAINS.get(k, 0) / 20)
        vb = bw(vox, 'band', (300, 4000))
        a = np.exp(-1.0 / (0.015 * SR))
        e = np.sqrt(np.maximum(signal.lfilter([1 - a], [1, -a], vb ** 2), 0))
        e /= np.percentile(e[e > 1e-5], 90)
        ddb = 20 * np.log10(1 - 0.5 * np.clip(e, 0, 1))
        idx = np.arange(self.N)
        rate = 30.0 / SR  # recover at 30 dB/s
        ddb = np.minimum.accumulate(ddb - idx * rate) + idx * rate
        self.duck = (10 ** (ddb / 20)).astype(F32)
        # the hype rap sits in the supersaw riff's band (1-4 kHz): while each of its words sounds (from its rendered
        # start, consonant included, for its rendered length) the riff and the lead dip as a whole, 10 ms down,
        # back at 25 dB/s
        key = np.zeros(self.N)
        for r in song.timing.get('rap', []):
            if r.get('style') == 'hype':
                key[ns(r['start_s']):ns(r['start_s'] + r['dur_s'])] = 1.0
        if key.any():
            key = uniform_filter1d(key, ns(0.010))
            self.rapduck = {}
            for k, d in RAP_DUCK_DB.items():
                g = -d * key
                g = np.minimum.accumulate(g - idx * (25.0 / SR)) + idx * (25.0 / SR)
                self.rapduck[k] = (10 ** (g / 20)).astype(F32)

    def stat(self, name, y, o=0):
        """K-weighted mean power of a stem (starting at sample o) in every arc unit."""
        kw = k_weight(y)
        c = np.concatenate([[0.0], np.cumsum(np.sum(kw ** 2, axis=0))])
        L = len(c) - 1
        row = self.stats.setdefault(name, {})
        for u in self.units:
            tot = sum(c[int(np.clip(ns(b) - o, 0, L))] - c[int(np.clip(ns(a) - o, 0, L))] for a, b in u['spans'])
            cnt = sum(ns(b) - ns(a) for a, b in u['spans'])
            row[u['name']] = row.get(u['name'], 0.0) + tot / max(cnt, 1)

    def add(self, name, x):
        if name == 'ann_send':
            self.ann_send = (st(x) * 10 ** (GAINS['announcer'] / 20)).astype(F32)
            return
        # only the stem's active extent (plus 0.6 s for the filters' tails) is processed: most stems are sparse
        act = np.flatnonzero(np.abs(np.atleast_2d(x)).max(axis=0) > 0)
        if not len(act):
            return
        o, e = int(act[0]), min(self.N, int(act[-1]) + ns(0.6))
        y = st(x[..., o:e]) * 10 ** (GAINS.get(name, -12) / 20)
        if name not in LOW_GROUP:
            y = eq(y, 'hp', 90 if name in ('orch', 'gong', 'drone') else 130, 0.7)
        if name in DUCKED:
            band = bw(y, 'band', (900, 5000), order=2, zero_phase=True)
            y = y - band * (1 - self.duck[o:e])
            del band
        if self.rapduck and name in self.rapduck:
            y = y * self.rapduck[name][o:e]
        if self.thunder_duck and name in self.thunder_duck:
            y = y * self.thunder_duck[name][o:e]
        if name in PUMPED:
            y = y * (1 - PUMPED[name] * self.P[o:e])
        for (i0, i1, curve, names) in self.hp_sweeps:
            a, b = max(i0, o), min(i1, e)
            if name in names and b > a:
                y[:, a - o:b - o] = tvf(y[:, a - o:b - o], 'hp', curve[a - i0:b - i0], q=0.9, block=64)
        self.stat(name, y, o)
        self.groups[group_of(name)][:, o:e] += y
        if name in BYPASS:
            if name not in self.byp:
                self.byp[name] = np.zeros((2, self.N), F32)
            self.byp[name][:, o:e] += y
            return
        self.bus[:, o:e] += y
        for k, tab in (('hall', SEND_HALL), ('plate', SEND_PLATE), ('delay', SEND_DELAY), ('big', SEND_BIG)):
            amt = tab.get(name, 0)
            if amt:
                src = bw(y, SEND_PREFILTER[name][0], SEND_PREFILTER[name][1]) if (k == 'hall' and name in SEND_PREFILTER) else y
                self.sends[k][:, o:e] += amt * src

    def regions(self):
        """The spans between gaps: reverb and delay returns of what was sent in one span end at its gap for
        good, and only what is sent from the drop on is heard after it (the 30 s rule, for every gap)."""
        cuts = [0]
        for ga, gb in self.song.gaps_s:
            cuts += [ns(ga), ns(gb)]
        cuts.append(self.N)
        return [(cuts[i], cuts[i + 1]) for i in range(0, len(cuts), 2)]

    def ret(self, send, fx, gate):
        out = np.zeros((2, self.N))
        for r0, r1 in self.regions():
            if r1 - r0 < 16:
                continue
            seg = send[:, r0:r1].astype(float) * gate[r0:r1]
            out[:, r0:r1] = fx(seg)[:, :r1 - r0] * gate[r0:r1]
        return out

    def monitor(self, bus):
        """'Pull back, camera!': the music bus shrinks into a speaker on the set: band-passed 350-3500 Hz
        narrowing to 600-2000 Hz, summed to mono, a 0.4 s small room, -9 dB; over the reverse swell it opens
        back to full range and full level into the final hit."""
        song, T = self.song, self.song.T
        room_ir = make_ir(0.4, 0.35, 0.22, pre=0.003, seed=21, er=6, lp=9000)
        self.monitor_spans = []
        for f in song.S.get('filters', []):
            if f['type'] != 'monitor':
                continue
            a, b = ns(song.bt(f['fromBeat'])), ns(song.bt(f['toBeat']))
            sw = [x for x in song.S['sweeps'] if x['type'] == 'reverseSwell' and f['fromBeat'] <= x['fromBeat'] < f['toBeat']]
            c = ns(song.bt(sw[0]['fromBeat'])) if sw else b - ns(T.beat)
            n = b - a
            seg = bus[:, a:b].copy()
            m = seg.mean(0)
            hp = keys_curve(n, [(0, 350), ((c - a) / SR, 600), (n / SR, 30)], True)
            lp = keys_curve(n, [(0, 3500), ((c - a) / SR, 2000), (n / SR, 18000)], True)
            y = tvf(tvf(m, 'hp', hp, q=0.8, block=64), 'hp', hp, q=0.6, block=64)
            y = tvf(tvf(y, 'lp', lp, q=1.0, block=64), 'lp', lp, q=0.6, block=64)
            pk = np.abs(y).max() + 1e-9
            y = sat(y / pk * 1.4, 1.4) * pk          # a small speaker's grit
            mon = (st(y) + 0.45 * convolve(st(y), room_ir)) * 10 ** (-9 / 20)
            w = np.ones(n)
            k = c - a
            w[k:] = 1 - smoothstep(np.linspace(0, 1, n - k))
            bus[:, a:b] = (1 - w) * seg + w * mon
            self.monitor_spans.append((a / SR, c / SR, b / SR))
        return bus

    def finish(self):
        song, T, N = self.song, self.song.T, self.N
        gate = gap_gate(song)
        self.gate = gate
        hall_ir = make_ir(2.4, 2.2, 1.1, pre=0.025, seed=11)
        plate_ir = make_ir(1.4, 1.3, 0.9, pre=0.004, seed=12, er=0, build=0.003, lp=13000)
        big_ir = make_ir(4.5, 4.2, 2.0, pre=0.04, seed=14)
        ann_ir = make_ir(5.0, 4.6, 2.2, pre=0.035, seed=13)
        pump = self.P.astype(float)
        r = self.ret(self.sends.pop('hall'), lambda s: eq(eq(convolve(s, hall_ir), 'hp', 220), 'lp', 9000), gate)
        self.bus += r * 0.9 * (1 - PUMPED['hall'] * pump)
        r = self.ret(self.sends.pop('plate'), lambda s: eq(convolve(s, plate_ir), 'hp', 300), gate)
        self.bus += r * 0.8
        r = self.ret(self.sends.pop('delay'), lambda s: pingpong(s, 3 * T.step, fb=0.42, taps=7, lp=4500, hp=350), gate)
        self.bus += r * 0.7 * (1 - PUMPED['delay'] * pump)
        r = self.ret(self.sends.pop('big'), lambda s: eq(eq(convolve(s, big_ir), 'hp', 200), 'lp', 8000), gate)
        self.bus += r * 0.8
        del r
        # the gaps: everything stops except the shouts (with their own hall), the director, his slate and the
        # reverse cymbals
        self.bus *= gate
        self.bus = self.monitor(self.bus)
        ann = self.byp.get('announcer', np.zeros((2, N)))
        if self.ann_send is not None:
            ann = ann + 0.75 * eq(eq(convolve(self.ann_send.astype(float), ann_ir), 'hp', 150), 'lp', 8000)
        self.byp_sum = ann + sum(self.byp.get(k, 0) for k in BYPASS if k != 'announcer')
        # what each gap holds: music (must be silent), allowed content (shout, slate, reverse cymbal)
        self.gap_info = []
        for (fa, fb), (ga, gb) in zip(song.gaps, song.gaps_s):
            sl = slice(ns(ga), ns(gb - 0.0012))
            self.gap_info.append(dict(fromBeat=fa, toBeat=fb, music_peak=float(np.abs(self.bus[:, sl]).max()),
                                      allowed_rms=float(np.sqrt(np.mean(self.byp_sum[:, sl] ** 2)) + 1e-20)))
        # the measured silence of the music bus around each gap (-60 dB under the bar before it)
        env = maximum_filter1d(np.abs(self.bus).max(axis=0), ns(0.002))
        for gi, (ga, gb) in zip(self.gap_info, song.gaps_s):
            ref = np.percentile(env[ns(ga - T.bar):ns(ga)], 99) + 1e-12
            thr = ref * 1e-3
            a = ns(ga - 0.05)
            q = np.nonzero(env[a:ns(gb + 2.0)] < thr)[0]
            s0 = a + int(q[0]) if len(q) else ns(ga)
            back = np.nonzero(env[s0:ns(gb + 2.0)] >= thr)[0]
            s1 = s0 + int(back[0]) if len(back) else ns(gb)
            gi['silence_s'] = [round(s0 / SR, 4), round(s1 / SR, 4)]
            gi['silence_vs_gap_ms'] = [round((s0 / SR - ga) * 1000, 2), round((s1 / SR - gb) * 1000, 2)]
        master = self.bus + self.byp_sum
        self.bus = None
        return master


def glue(master):
    """DC/subsonic high-pass, mono lows, a little air off the top, then a gentle 2:1 bus compressor at a fixed
    working level (the 30 s chain)."""
    # causal on purpose: a zero-phase (forward-backward) high-pass rings *before* every low-frequency onset
    master = bw(master, 'high', 22, order=2)
    mid, side = 0.5 * (master[0] + master[1]), 0.5 * (master[0] - master[1])
    side = bw(side, 'high', 120, order=4, zero_phase=True)
    master = np.vstack([mid + side, mid - side])
    del mid, side
    master = eq(master, 'hs', 9000, 0.7, -2.5)  # tame the crash/hat/saw fizz a little
    pre = 10 ** ((-16.0 - lufs(master)) / 20)
    master = master * pre
    master, _ = compressor(master, thr_db=-17.0, ratio=2.0, attack=0.012, release=0.16, knee=8.0, rms=0.01)
    return master, pre


def end_fade(song):
    """The ending: the coda decays (linear in dB) into digital silence that is exactly zero for the last 25 ms."""
    T, N = song.T, song.N
    a, b = T.dur - 0.45, T.dur - 0.05
    fade_db = np.interp(tt(N), [0, a, b, T.dur], [0, 0, -48, -48])
    fade = 10 ** (fade_db / 20)
    k = ns(b)
    fade[k:] *= np.linspace(1, 0, N - k) ** 2
    fade[ns(T.dur - 0.025):] = 0.0
    k0 = ns(0.003)
    fade[:k0] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(k0) / k0)
    return fade


def macro_curve(song, units, v):
    """Per-unit macro gain (dB) as a curve: flat inside each section and gap with 25 ms ramps, the build's bars
    joined linearly bar centre to bar centre."""
    pts = []
    for u in units:
        if u['kind'] == 'bar':
            pts.append((u['centre'], v[u['name']]))
        else:
            for a, b in u['spans']:
                e = 0.003 if u['kind'] == 'gap' else 0.025
                pts += [(a + e, v[u['name']]), (b - e, v[u['name']])]
    pts.sort()
    pts = [(0.0, pts[0][1])] + pts + [(song.T.dur + 1, pts[-1][1])]
    return 10 ** (keys_curve(song.N, pts) / 20)


def master_once(x, gain, ceiling_db, fade):
    y = softclip(x * gain, knee=0.82)
    y, lg = tp_limiter(y, ceiling_db)
    return y * fade, lg


def master_arc(song, glued, ceiling_db, ref_target, iters=7, v=None, gain=None):
    """Master through the 30 s chain (soft clipper, true-peak limiter) while steering the per-section macro
    gains until the short-term loudness of every unit hits its arc target relative to the final chorus,
    the final chorus sits at ref_target LUFS, and each stage shout is 1 LU under the first bar of its drop."""
    units = arc_units(song)
    fade = end_fade(song)
    ref = 'chorus3'
    if v is None:
        m0 = unit_loudness(glued, units)
        v = {u['name']: 0.0 for u in units}
        for u in units:
            if u['target'] is not None and u['name'] != ref:
                v[u['name']] = float(np.clip((u['target'] + m0[ref]) - m0[u['name']], -12, 8))
        gain = 10 ** ((ref_target - m0[ref]) / 20)
    hist = []
    for it in range(iters):
        y, lg = master_once(glued * macro_curve(song, units, v), gain, ceiling_db, fade)
        m = unit_loudness(y, units)
        err = {ref: ref_target - m[ref]}
        for u in units:
            if u['name'] == ref:
                continue
            if u['kind'] == 'gap' and u['stage']:
                tgt = m[u['name'] + ':drop'] - 1.0
            elif u['target'] is not None:
                tgt = ref_target + u['target']
            else:
                continue
            err[u['name']] = tgt - m[u['name']]
        worst = max(abs(e) for e in err.values())
        hist.append(round(worst, 2))
        log(f'  arc pass {it + 1}: chorus3 {m[ref]:.2f} LUFS, worst unit error {worst:.2f} LU')
        if worst < 0.2 or it == iters - 1:
            break
        gain *= 10 ** (0.9 * err[ref] / 20)
        for k, e in err.items():
            if k != ref:
                v[k] = float(np.clip(v[k] + 0.85 * e, -18, 10))
    return y, dict(v=v, gain=gain, units=units, meas=m, err=err, hist=hist, limiter_gain=lg)


# =====================================================================================
# analysis, verification, timing, images
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


def detect_kicks(k, T, expected, rise_db=6.0, floor_db=40.0):
    """Blind onset detection on the kick stem: an onset is a rise of the 10 ms peak envelope by more than
    rise_db within 10 ms, within floor_db of the loudest hit (one onset per run of rising frames; runs closer
    than 100 ms are one hit), refined to the first sample above 10 % of the hit's peak. Then each expected
    kick is matched to the nearest onset. (A 2 ms envelope falls to zero at every zero crossing of a 55 Hz
    tail and re-triggered there.)"""
    a = np.abs(np.asarray(k, float))
    env = maximum_filter1d(a, ns(0.010))
    e = 20 * np.log10(env + 1e-9)
    lag = ns(0.010)
    d = np.full_like(e, -99.0)
    d[lag:] = e[lag:] - e[:-lag]
    idx = np.flatnonzero((d > rise_db) & (e > e.max() - floor_db))
    on = []
    last = -10 ** 9
    for i in idx:
        if i - last > ns(0.1):
            i0 = max(0, i - ns(0.015))
            w = a[i0:i + ns(0.04)]
            on.append((i0 + int(np.argmax(w > 0.1 * w.max()))) / SR)
        last = i
    on = np.array(on)
    errs = np.array([(on[np.argmin(np.abs(on - t))] - t) * 1000 for t in expected]) if len(on) else np.array([np.nan])
    return on, errs


def band_energy(x, t0, t1, lo=300, hi=3000):
    m = x.mean(0) if np.ndim(x) == 2 else x
    seg = m[int(t0 * SR):int(t1 * SR)]
    if len(seg) < 64:
        return -120.0
    y = bw(seg, 'band', (lo, hi), order=2)
    return 10 * np.log10(np.mean(y ** 2) + 1e-20)


def check_lines(song):
    """Every vocal line present at its bar: 300-3000 Hz energy of its stem over the line's window (pre-mix)."""
    out = []
    for l in song.lines:
        x = song.stems.get(l['stem'])
        a = max(0, int(round((l['t0'] - 0.7) * SR)))
        seg = x[..., a:int(round(l['t1'] * SR))] if x is not None else None
        e = band_energy(seg, l['t0'] - a / SR, l['t1'] - a / SR) if x is not None else -200.0
        before = band_energy(seg, max(0.0, l['t0'] - 0.6 - a / SR), max(0.0, l['t0'] - 0.25 - a / SR)) if x is not None else -200.0
        out.append(dict(kind=l['kind'], style=l['style'], bar=l['bar'], text=l['text'], stem=l['stem'],
                        db=round(e, 1), db_before=round(before, 1), present=bool(e > -60.0)))
    return out


def kick_check(song):
    T = song.T
    k = song.stems['kick'].astype(float)
    a = np.abs(k)
    exp = np.array([e[0] for e in song.ev['kick']])
    errs = []
    for t in exp:
        i0, i1 = ns(t - 0.02), ns(t + 0.05)
        w = a[i0:i1]
        errs.append((i0 + int(np.argmax(w > 0.1 * w.max())) - t * SR) / SR * 1000 if w.max() > 0 else np.nan)
    on, _ = detect_kicks(k, T, exp)
    # every detected onset must belong to a kick of the patterns (nothing extra)
    extra = [float(o) for o in on if np.min(np.abs(exp - o)) > 0.03]
    filt = np.array([song.kick_filter(t / T.beat)[0] is not None for t in exp])
    errs = np.array(errs)
    return dict(expected=int(len(exp)), detected_blind=int(len(on)), extra_onsets=extra[:10],
                max_abs_err_ms=round(float(np.nanmax(np.abs(errs))), 3), mean_err_ms=round(float(np.nanmean(errs)), 3),
                full_kicks=dict(n=int((~filt).sum()), max_abs_err_ms=round(float(np.nanmax(np.abs(errs[~filt]))), 3)),
                low_passed_kicks=dict(n=int(filt.sum()), max_abs_err_ms=round(float(np.nanmax(np.abs(errs[filt]))), 3),
                                      note='intro muffle, heartbeat (150 Hz) and the build opening: slow attacks'),
                per_bar_counts_match=bool(all(
                    sum(1 for e in song.ev['kick'] if e[3] == b) == sum(1 for o in on if T.t(b) - 0.01 <= o < T.t(b + 1) - 0.01)
                    for b in range(song.bars))))


def pitch_check(song):
    """YIN (numpy, above) on the PSOLA-tuned layer of every sung syllable, judged from 40 ms after the note
    starts to 30 ms before it ends on frames that are periodic and within 10 dB of the syllable's loudest:
    the median deviation from the sung pitch curve (written MIDI - 12, with its scoops and vibrato) and from
    the written note itself."""
    rows = []
    for pid, L in song.vox_layers.items():
        i0, tuned, mel = L['i0'], L['tuned'], L['mel']
        for s in L['syl']:
            a = max(0, ns(s['t'] - 0.13) - i0)
            b = min(len(tuned), ns(s['t'] + s['dur']) - i0)
            seg = tuned[a:b].astype(float)
            if len(seg) < 1400:
                rows.append(dict(passage=pid, bar=s['bar'], step=s['step'], syllable=s['syl'], midi=s['midi'], cents=None))
                continue
            c, f0, ap, rms = yin(seg, fmin=100, fmax=700, win=1024, hop=128)
            tc = (a + c + i0) / SR
            v = (ap < 0.2) & (rms > 0.32 * rms.max()) & (tc > s['t'] + 0.04) & (tc < s['t'] + s['dur'] - 0.03)
            if v.sum() >= 3:
                cc = 1200 * np.log2(f0[v] / hz(mel[np.minimum(a + c[v], len(mel) - 1)] - 12))
                cw = 1200 * np.log2(f0[v] / hz(s['midi'] - 12))
                rows.append(dict(passage=pid, bar=s['bar'], step=s['step'], syllable=s['syl'], midi=s['midi'],
                                 cents=round(float(np.median(cc)), 1), cents_vs_written=round(float(np.median(cw)), 1),
                                 frames=int(v.sum()), aperiodicity=round(float(np.median(ap[v])), 3)))
            else:
                rows.append(dict(passage=pid, bar=s['bar'], step=s['step'], syllable=s['syl'], midi=s['midi'], cents=None))
    ok = [r for r in rows if r['cents'] is not None]
    summ = dict(syllables=len(rows), measured=len(ok),
                median_abs_cents=round(float(np.median([abs(r['cents']) for r in ok])), 1) if ok else None,
                within_25_cents=sum(1 for r in ok if abs(r['cents']) <= 25),
                within_50_cents_of_written=sum(1 for r in ok if abs(r['cents_vs_written']) <= 50),
                worst=sorted(ok, key=lambda r: -abs(r['cents']))[:6])
    hi = [r for r in ok if r['midi'] >= 80]
    summ['above_G5 (G#5, A5)'] = dict(n=len(hi), median_abs_cents=round(float(np.median([abs(r['cents']) for r in hi])), 1) if hi else None,
                                      max_abs_cents=round(float(max(abs(r['cents']) for r in hi)), 1) if hi else None,
                                      median_aperiodicity=round(float(np.median([r['aperiodicity'] for r in hi])), 3) if hi else None)
    lo = [r for r in ok if 76 <= r['midi'] <= 79]
    summ['E5-G5 reference'] = dict(n=len(lo), median_aperiodicity=round(float(np.median([r['aperiodicity'] for r in lo])), 3) if lo else None)
    return rows, summ


def verify(song, mixer, y, arc, mp3, out_dir):
    T = song.T
    rep = {}
    rep['samples'] = int(y.shape[-1])
    rep['duration_s'] = round(y.shape[-1] / SR, 6)
    rep['score_duration_s'] = round(song.bars * 240.0 / song.T.bpm, 6)
    rep['duration_matches_score'] = abs(rep['duration_s'] - rep['score_duration_s']) < 0.5 / SR + 1e-9
    rep['limiter_ceiling_dbtp'] = round(song.ceiling, 2)
    rep['lufs_integrated'] = round(lufs(y), 2)
    rep['true_peak_dbtp'] = round(20 * np.log10(true_peak(y)), 2)
    rep['sample_peak_dbfs'] = round(20 * np.log10(np.abs(y).max()), 2)
    rep['dc'] = [float(v) for v in y.mean(axis=1)]
    rep['first_1ms_peak'] = float(np.abs(y[:, :ns(0.001)]).max())
    rep['last_25ms_peak'] = float(np.abs(y[:, -ns(0.025):]).max())
    # the loudness arc
    m, units = arc['meas'], arc['units']
    ref = m['chorus3']
    arc_rows = []
    for u in units:
        row = dict(unit=u['name'], lufs_st=round(m[u['name']], 2), rel_final_chorus=round(m[u['name']] - ref, 2),
                   macro_db=round(arc['v'][u['name']], 2))
        if u['target'] is not None:
            row['target_rel'] = round(u['target'], 2)
        if u['kind'] == 'gap':
            row['drop_bar_lufs'] = round(m[u['name'] + ':drop'], 2)
            row['vs_drop_lu'] = round(m[u['name']] - m[u['name'] + ':drop'], 2)
            row['stage_shout'] = u['stage']
        arc_rows.append(row)
    rep['loudness_arc'] = arc_rows
    g = {r['unit']: r['lufs_st'] for r in arc_rows}
    rep['arc_checks'] = dict(
        verse1_under_chorus1=round(g['chorus1'] - g['verse1'], 2), verse2_under_chorus2=round(g['chorus2'] - g['verse2'], 2),
        breakdown_under_choruses=round(np.mean([g['chorus1'], g['chorus2'], g['chorus3']]) - g['breakdown'], 2),
        build_rise_72_to_79=round(g['build.79'] - g['build.72'], 2),
        chorus1_under_chorus2=round(g['chorus2'] - g['chorus1'], 2), chorus1_under_final=round(g['chorus3'] - g['chorus1'], 2),
        loudest_unit=max((r for r in arc_rows if r['unit'] in g and not r['unit'].startswith('gap')), key=lambda r: r['lufs_st'])['unit'],
        stage_shouts_vs_drop=[(r['unit'], r['vs_drop_lu']) for r in arc_rows if r.get('stage_shout')])
    rep['arc_passes_worst_error'] = arc['hist']
    # stems at master gain per arc unit (before the limiter)
    gdb = 20 * np.log10(song.master_gain)
    rep['stem_lufs_by_unit'] = {name: {u: round(-0.691 + 10 * np.log10(p + 1e-20) + gdb + arc['v'][u], 1)
                                       for u, p in row.items() if p > 1e-12}
                                for name, row in sorted(mixer.stats.items())}
    lo = bw(y, 'low', 120, order=4)
    rep['low_side_to_mid_db'] = round(float(10 * np.log10(np.sum((lo[0] - lo[1]) ** 2) / np.sum((lo[0] + lo[1]) ** 2) + 1e-20)), 1)
    del lo
    rep['lr_correlation'] = round(float(np.corrcoef(y[0], y[1])[0, 1]), 3)
    # kicks
    rep['kicks'] = kick_check(song)
    a, b = ns(T.t(8)), ns(T.t(16))
    km = bw(song.stems['kick'][a:b].astype(float), 'band', (150, 8000), order=4, zero_phase=True)
    mm = bw(y.mean(0)[a:b], 'band', (150, 8000), order=4, zero_phase=True)
    cc = signal.correlate(mm, km, mode='full', method='fft')
    rep['master_vs_kick_stem_lag_samples'] = int(np.argmax(cc) - (len(km) - 1))
    # gaps
    gaps = []
    for gi, (ga, gb) in zip(mixer.gap_info, song.gaps_s):
        sl = slice(ns(ga), ns(gb - 0.0012))
        r = dict(gi)
        r['gap_s'] = [round(ga, 4), round(gb, 4)]
        r['master_rms_dbfs'] = round(float(10 * np.log10(np.mean(y[:, sl] ** 2) + 1e-20)), 1)
        r['allowed_rms_dbfs_premaster'] = round(float(20 * np.log10(r.pop('allowed_rms')) + 20 * np.log10(song.master_gain)), 1)
        r['silent_except_allowed'] = r['music_peak'] == 0.0
        gaps.append(r)
    rep['gaps'] = gaps
    # vocals
    rep['vocal_lines_present'] = f"{sum(1 for l in song.presence if l['present'])}/{len(song.presence)}"
    rep['vocal_lines'] = song.presence
    rows, summ = pitch_check(song)
    rep['sung_pitch_summary'] = summ
    rep['sung_pitch'] = rows
    rep['shout_syllables'] = [(r['text'], r['syllable_count'], r['found'], r['syllables_rel_s'])
                              for r in song.timing.get('announcer', []) + song.timing.get('shouts', [])]
    rap = song.timing.get('rap', [])
    rep['rap_vowel_vs_step_ms'] = dict(n=len(rap), median=round(float(np.median([r['vowel_vs_step_ms'] for r in rap])), 1),
                                       max_abs=round(float(max(abs(r['vowel_vs_step_ms']) for r in rap)), 1))
    sung = song.timing.get('sung', [])
    rep['sung_vowel_vs_note_ms'] = dict(n=len(sung), median=round(float(np.median([r['vowel_vs_note_ms'] for r in sung])), 1),
                                        max_abs=round(float(max(abs(r['vowel_vs_note_ms']) for r in sung)), 1))
    # mp3
    if mp3:
        pr = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,bit_rate,size:stream=sample_rate,channels,codec_name',
                             '-of', 'json', str(mp3)], capture_output=True, text=True)
        rep['mp3_ffprobe'] = json.loads(pr.stdout)
        d = decode_audio(mp3, out_dir)
        rep['mp3_decoded_samples'] = int(d.shape[-1])
        a, b = ns(T.t(8)), ns(T.t(14))
        a_ = y.mean(0)[a:b]
        b_ = d.mean(0)[a - 4096:b + 4096]
        cc = signal.correlate(b_, a_, mode='valid', method='fft')
        rep['mp3_lag_samples'] = int(np.argmax(cc) - 4096)
        nmin = min(d.shape[-1], y.shape[-1])
        err = d[:, :nmin] - y[:, :nmin]
        rep['mp3_vs_wav_snr_db'] = round(float(10 * np.log10(np.sum(y[:, :nmin] ** 2) / np.sum(err ** 2))), 1)
        rep['mp3_true_peak_dbtp'] = round(20 * np.log10(true_peak(d)), 2)
        rep['mp3_lufs'] = round(lufs(d), 2)
        rep['mp3_bytes'] = Path(mp3).stat().st_size
    return rep


def timing_json(song, mixer, y_dur):
    T = song.T
    words = []
    for r in song.timing.get('sung', []):
        if words and words[-1]['bar'] == r['bar'] and words[-1]['word'] == r['word'] and r['step'] > words[-1]['step']:
            words[-1]['syllables'].append(r['syllable'])
            words[-1]['end_s'] = r['end_s']
            continue
        words.append(dict(bar=r['bar'], step=r['step'], word=r['word'], style=r['style'], syllables=[r['syllable']],
                          t_score=r['t_score'], vowel_s=r['vowel_s'], vowel_vs_note_ms=r['vowel_vs_note_ms'],
                          end_s=r['end_s']))
    gaps = []
    for gi, (fa, fb), (ga, gb) in zip(mixer.gap_info, song.gaps, song.gaps_s):
        gaps.append(dict(fromBeat=fa, toBeat=fb, gap_s=[round(ga, 4), round(gb, 4)], silence_s=gi['silence_s'],
                         silence_vs_gap_ms=gi['silence_vs_gap_ms']))
    ann = song.timing.get('announcer', [])
    return dict(
        about=('MAGNUM OPUS full version: times measured on the rendered soundtrack, in seconds from the start of '
               'the master (beats are the score\'s absolute 0-based beats; one beat = %.6f s). announcer and shouts: '
               'syllable onsets (one glyph group each); syllables_beats is relative to the entry\'s beat, the unit '
               'of score.js vocals.announcer[].syllables. rap, spoken, sung (per syllable) and sung_words: the '
               'measured vowel onset of each word/syllable (its P-centre). gaps: the span in which the music bus '
               'is silent (-60 dB under the bar before; only the shout, slate and reverse cymbal sound).') % T.beat,
        bpm=T.bpm, duration_s=round(y_dur, 6), samples=song.N,
        announcer=ann, shouts=song.timing.get('shouts', []),
        score_syllables_beats={str(r['beat']): r['syllables_beats'] for r in ann},
        rap=song.timing.get('rap', []), spoken=song.timing.get('spoken', []),
        sung_words=words, sung=song.timing.get('sung', []), chops=song.timing.get('chops', []),
        riff=song.timing.get('riff', []), fx=song.timing.get('fx', []), gaps=gaps,
        monitor_s=[[round(v, 4) for v in s] for s in getattr(mixer, 'monitor_spans', [])])


def encode_mp3(wav, mp3):
    Path(mp3).parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav), '-c:a', 'libmp3lame',
                    '-b:a', '192k', '-ar', '44100', '-ac', '2', '-write_xing', '1',
                    '-metadata', 'title=Magnum Opus (The Full Opus)', '-metadata', 'artist=RemoteFunLand',
                    str(mp3)], check=True)


def aac_feed(y, wav, work, rates=('256k', '192k'), target=-1.2):
    """The MP4's audio track (tools/render-video.cjs --audio <this> --abr 256k): ffmpeg's native AAC encoder adds
    2-3 dB of overshoot to this master at 192-256 kbps (+0.3 to +0.9 dBTP, sample peaks over 0 dBFS), so the MP4
    is muxed from its own copy, the master lowered in 0.5 dB steps until the decoded AAC stays under target dBTP
    at every rate in rates. The WAV and the MP3 stay as they are. Returns the facts for the report."""
    path = Path(wav).with_name(Path(wav).stem + '-aac.wav')
    m4a = Path(work) / 'aac_check.m4a'
    for g in np.arange(-1.5, -6.01, -0.5):
        wavfile.write(path, SR, (y * 10 ** (g / 20)).T.astype(np.float32))
        tps = {}
        for br in rates:
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(path), '-c:a', 'aac',
                            '-b:a', br, str(m4a)], check=True)
            d = decode_audio(m4a, work)
            tps[br] = (round(float(20 * np.log10(true_peak(d))), 2), round(float(20 * np.log10(np.abs(d).max())), 2))
        m4a.unlink()
        log(f'MP4 audio feed at {g:+.1f} dB: decoded AAC true peak / sample peak (dB) ' +
            ', '.join(f'{br} {a:+.2f} / {b:+.2f}' for br, (a, b) in tps.items()))
        if max(a for a, _ in tps.values()) <= target:
            break
    return dict(path=str(path), gain_db=round(float(g), 2), target_dbtp=target,
                aac_true_peak_dbtp={br: a for br, (a, _) in tps.items()},
                aac_sample_peak_dbfs={br: b for br, (_, b) in tps.items()},
                lufs_integrated=round(lufs(y * 10 ** (g / 20)), 2))


def decode_audio(path, work):
    """Decode with ffmpeg (which applies the LAME encoder-delay/padding tag) to float stereo."""
    dec = Path(work) / 'decoded_check.wav'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(path), '-c:a', 'pcm_f32le', str(dec)], check=True)
    sr, d = wavfile.read(dec)
    assert sr == SR
    dec.unlink()
    return d.T.astype(float)


def images(song, mixer, y, out_dir):
    T = song.T
    spectrogram_png(y, out_dir / 'spec_mix.png', 'MAGNUM OPUS full master (bars marked)', T, width=2400)
    vox = mixer.groups['vocals']
    spectrogram_png(vox, out_dir / 'spec_vocals.png', 'vocal group (dry)', T, fmin=60, width=2400)
    for name, a, b in (('coldopen_gap', 4.5, 9.5), ('title_drop', 12.5, 17.0), ('albedo_gap', 46.5, 51.5),
                       ('citrinitas_gap', 88.0, 93.5), ('breakdown', 112.0, 127.5), ('rollcall_rubedo', 126.5, 143.5),
                       ('final_chorus', 141.0, 149.0), ('outro_coda', 166.5, T.dur)):
        spectrogram_png(y, out_dir / f'spec_{name}.png', f'master {a:.1f}-{b:.1f} s ({name})', T, a, b, fmin=30)


# =====================================================================================
# main
# =====================================================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--wav', required=True, help='lossless master (32-bit float WAV)')
    ap.add_argument('--mp3', help='web MP3 (192 kbps)')
    ap.add_argument('--stems', help='folder for stems, voice renders, analysis, timing.json (default: next to the WAV)')
    ap.add_argument('--score', default=str(SCORE_PATH))
    ap.add_argument('--timing', help='timing.json path (default: <stems>/timing.json)')
    ap.add_argument('--no-verify', action='store_true')
    ap.add_argument('--verify-only', action='store_true',
                    help='re-run the verification (and rewrite timing.json) from <stems>/state.pkl and the written WAV/MP3')
    ap.add_argument('--no-stems', action='store_true')
    ap.add_argument('--ref-lufs', type=float, default=-7.6, help='short-term loudness of the final chorus (the arc reference)')
    ap.add_argument('--ceiling', type=float, default=-2.1, help='start true-peak ceiling, dBTP')
    args = ap.parse_args()
    wav = Path(args.wav)
    wav.parent.mkdir(parents=True, exist_ok=True)
    out_dir = Path(args.stems) if args.stems else wav.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.verify_only:
        st_ = pickle.loads((out_dir / 'state.pkl').read_bytes())
        song = Song(st_['S'], out_dir)
        for k in ('timing', 'presence', 'vox_layers', 'master_gain', 'ceiling'):
            setattr(song, k, st_[k])
        song.aac = st_.get('aac')
        song.stems['kick'] = st_['kick']
        mixer = SimpleNamespace(stats=st_['stats'], gap_info=st_['gap_info'], monitor_spans=st_['monitor_spans'])
        arc = dict(st_['arc'], units=arc_units(song))
        y = wavfile.read(wav)[1].T.astype(float)
        report(song, mixer, y, arc, Path(args.mp3) if args.mp3 else None, out_dir, args)
        return
    score = load_score(args.score)
    missing = [k for k in ('arrangement', 'gaps', 'bass', 'riff', 'filters') if k not in score]
    if missing:
        raise SystemExit(f'{args.score} is not a full-version score (no {", ".join(missing)}): pass --score <full score.js>')
    song = Song(score, out_dir)
    log(f"score {args.score}: {score['bpm']} BPM, {score['bars']} bars, {song.N} samples ({song.N / SR:.6f} s)")
    mixer = Mixer(song)
    song.compose(mixer)
    master = mixer.finish()
    log('mixed')
    glued, pre = glue(master)
    del master
    log('glued')
    ceiling = args.ceiling
    mp3 = Path(args.mp3) if args.mp3 else None
    y, arc = master_arc(song, glued, ceiling, args.ref_lufs)
    for attempt in range(5):
        tp = true_peak(y)
        lim = 10 ** (ceiling / 20)
        if tp > lim:
            y = y * lim / tp
        wavfile.write(wav, SR, y.T.astype(np.float32))
        if mp3 is None:
            break
        encode_mp3(wav, mp3)
        tpm = 20 * np.log10(true_peak(decode_audio(mp3, out_dir)))
        log(f'master ceiling {ceiling:.2f} dBTP -> decoded MP3 true peak {tpm:.2f} dBTP')
        if tpm <= -1.0:
            break
        # lossy coding adds inter-sample peaks: lower the ceiling so the WAV and the MP3 stay the same master
        ceiling -= tpm + 1.0 + 0.08
        y, arc = master_arc(song, glued, ceiling, args.ref_lufs, iters=5, v=arc['v'], gain=arc['gain'])
    song.ceiling = ceiling
    song.master_gain = pre * arc['gain']
    log('wrote', wav, mp3 or '')
    song.aac = aac_feed(y, wav, out_dir)
    log('wrote', song.aac['path'], f"(MP4 audio feed, {song.aac['gain_db']:+.1f} dB)")
    tpath = Path(args.timing) if args.timing else out_dir / 'timing.json'
    tj = timing_json(song, mixer, y.shape[-1] / SR)
    tpath.write_text(json.dumps(tj, indent=1, ensure_ascii=False, default=float))
    log('timing', tpath)
    (out_dir / 'state.pkl').write_bytes(pickle.dumps(dict(
        S=score, timing=song.timing, presence=song.presence, vox_layers=song.vox_layers, kick=song.stems['kick'],
        master_gain=song.master_gain, ceiling=song.ceiling, aac=song.aac, stats=mixer.stats, gap_info=mixer.gap_info,
        monitor_spans=mixer.monitor_spans, arc=dict(v=arc['v'], gain=arc['gain'], meas=arc['meas'], hist=arc['hist'],
                                                    err=arc['err']))))
    if not args.no_stems:
        sd = out_dir / 'stems'
        sd.mkdir(exist_ok=True)
        for gname, x in mixer.groups.items():
            wavfile.write(sd / f'{gname}.wav', SR, (x * song.master_gain).T.astype(np.float32))
        images(song, mixer, y, out_dir)
        log('stems and images in', out_dir)
    if not args.no_verify:
        report(song, mixer, y, arc, mp3, out_dir, args)
    log('done')


def report(song, mixer, y, arc, mp3, out_dir, args):
    if args.verify_only:
        tpath = Path(args.timing) if args.timing else out_dir / 'timing.json'
        tpath.write_text(json.dumps(timing_json(song, mixer, y.shape[-1] / SR), indent=1, ensure_ascii=False, default=float))
    if True:
        rep = verify(song, mixer, y, arc, mp3, out_dir)
        if getattr(song, 'aac', None):
            rep['mp4_audio'] = song.aac
        (out_dir / 'report.json').write_text(json.dumps(rep, indent=1, default=float, ensure_ascii=False))
        for k, v in rep.items():
            if k in ('vocal_lines', 'sung_pitch', 'stem_lufs_by_unit', 'loudness_arc', 'gaps'):
                continue
            print(f'{k}: {v}')
        print('loudness arc (unit, LUFS short-term, rel. final chorus, target, macro dB):')
        for r in rep['loudness_arc']:
            print('   ', r)
        print('gaps:')
        for r in rep['gaps']:
            print('   ', r)
        bad = [l for l in rep['vocal_lines'] if not l['present']]
        print('vocal lines missing:', bad if bad else 'none')


if __name__ == '__main__':
    main()
