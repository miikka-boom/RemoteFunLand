#!/usr/bin/env python3
"""CRADLESONG teaser trailer: the soundtrack, composed, synthesized and mixed in code.

Everything follows cradlesong/score.js, the timeline the page draws its shots from. Every hum is
rendered from the score's phrases (Mum's tape, the dead in the street, the choir in the field,
the last note), and every cue (tape clunks, booms, thunder, the broadcast) lands on its cut.

Sound sources are numpy/scipy only: hummed voices are a band-limited glottal source (a closed-form
harmonic series whose roll-off follows the pitch) through a nasal /m/ filter, with glides, scoops,
vibrato, drift, and for the dead jitter, creak and rasp. Braams are PolyBLEP saw stacks through a
swept low-pass, booms are pitch-dropped subs with metal partials, risers are Shepard tones, and the
rooms are synthetic multiband convolution reverbs. The broadcast voice is flite (kal16) through
ffmpeg, fitted to its slots with the rubberband filter and squeezed through a TV speaker.

  python3 tools/cradlesong_audio.py --out cradlesong/cradlesong.mp3 [--wav out.wav] [--work DIR]

Needs numpy, scipy and an ffmpeg with libflite, rubberband and libmp3lame. Intermediate files
(TTS takes, analysis images) go to --work (a temporary directory by default), never into the repo.
The run ends with a short report: levels per shot, peak, and the ffmpeg EBU R128 loudness.
"""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

SR = 44100
REPO = Path(__file__).resolve().parent.parent
SCORE_PATH = REPO / 'cradlesong' / 'score.js'
T_START = time.time()


def log(*a):
    print(f'[{time.time() - T_START:6.1f}s]', *a, flush=True)


# =====================================================================================
# score
# =====================================================================================

def load_score(path=SCORE_PATH):
    # the object after the first "=" up to the final ";" (header comments are skipped)
    lines = Path(path).read_text(encoding='utf-8').splitlines()
    txt = '\n'.join(l for l in lines if not l.lstrip().startswith('//'))
    return json.loads(txt[txt.index('=') + 1:txt.rindex(';')])


_NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi_of(name):
    m = re.fullmatch(r'([A-G])([#b]?)(-?\d)', name)
    return 12 * (int(m.group(3)) + 1) + _NOTE[m.group(1)] + {'#': 1, 'b': -1, '': 0}[m.group(2)]


def hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def performance(score, hum_id):
    """[start s, dur s, midi] for a hum performance in the score, plus its cut time (or None)."""
    hum = next(h for h in score['hums'] if h['id'] == hum_id)
    beat = 60.0 / hum['bpm']
    seq = [n for p in hum['phrases'] for n in score['phrases'][p]]
    out, b, fb = [], 0.0, hum.get('fromBeat', 0)
    for name, beats in seq:
        if b + 1e-9 >= fb:
            out.append([hum['t'] + (b - fb) * beat, beats * beat, midi_of(name)])
        b += beats
    cut = hum.get('cut')
    if cut is not None:
        out = [n for n in out if n[0] < cut]
    return out, cut, beat


def cue_list(score, kind):
    return [c for c in score['cues'] if c['type'] == kind]


# =====================================================================================
# DSP helpers
# =====================================================================================

def rbj(kind, f, q=0.707, gain_db=0.0):
    w = 2 * np.pi * f / SR
    cw, sw = np.cos(w), np.sin(w)
    al = sw / (2 * q)
    if kind == 'low':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'high':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'band':     # 0 dB peak
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'peak':
        A = 10 ** (gain_db / 40)
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    else:
        raise ValueError(kind)
    b, a = np.array(b), np.array(a)
    return b / a[0], a / a[0]


def filt(x, kind, f, q=0.707, gain_db=0.0):
    b, a = rbj(kind, f, q, gain_db)
    return signal.lfilter(b, a, x, axis=-1)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'low', fs=SR, output='sos'), x, axis=-1)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'high', fs=SR, output='sos'), x, axis=-1)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'band', fs=SR, output='sos'), x, axis=-1)


def tv_filter(x, fc, kind='low', q=0.707, block=128):
    """A biquad whose frequency follows the array fc (one value per sample), updated per block."""
    if x.ndim == 2:
        return np.vstack([tv_filter(c, fc, kind, q, block) for c in x])
    y = np.empty_like(x)
    zi = np.zeros(2)
    n = len(x)
    for i in range(0, n, block):
        f = float(np.clip(fc[min(i + block // 2, n - 1)], 20.0, SR * 0.45))
        b, a = rbj(kind, f, q)
        y[i:i + block], zi = signal.lfilter(b, a, x[i:i + block], zi=zi)
    return y


def pink(n, rng):
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    x = np.fft.irfft(X / np.sqrt(f), n)
    return x / (np.std(x) + 1e-12)


def brown(n, rng):
    x = hp(np.cumsum(rng.standard_normal(n)), 18)
    return x / (np.std(x) + 1e-12)


def slow_noise(n, rate, rng):
    """Smooth random wander, about unit standard deviation, changing at roughly `rate` Hz."""
    k = max(6, int(n / SR * rate * 3) + 6)
    pts = rng.standard_normal(k)
    x = np.interp(np.linspace(0, k - 3, n), np.arange(k), pts)
    w = max(1, int(SR / rate / 3))
    x = uniform_filter1d(uniform_filter1d(x, w), w)
    return (x - x.mean()) / (np.std(x) + 1e-12)


def band_noise(n, lo, hi, rng):
    x = bp(rng.standard_normal(n), lo, hi)
    return x / (np.std(x) + 1e-12)


def ramp_env(n, pts):
    """Breakpoint envelope: pts = [(seconds, value), ...] relative to the buffer start."""
    t = np.arange(n) / SR
    ts, vs = zip(*pts)
    return np.interp(t, ts, vs)


def fades(x, fin=0.004, fout=0.004):
    x = x.copy()
    n = x.shape[-1]
    a, b = min(n, int(fin * SR)), min(n, int(fout * SR))
    if a > 0:
        x[..., :a] *= np.linspace(0, 1, a)
    if b > 0:
        x[..., n - b:] *= np.linspace(1, 0, b)
    return x


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-12)


def norm_rms(x, target_db):
    return x * 10 ** ((target_db - rms_db(x)) / 20)


def db(v):
    return 10 ** (v / 20)


def pan2(x, pan):
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.vstack([x * np.cos(a), x * np.sin(a)])


def blep_saw(f, rng):
    """PolyBLEP sawtooth for a per-sample frequency array."""
    dt = f / SR
    p = (np.cumsum(dt) + rng.uniform()) % 1.0
    y = 2 * p - 1
    m = p < dt
    t = p[m] / dt[m]
    y[m] -= t + t - t * t - 1
    m = p > 1 - dt
    t = (p[m] - 1) / dt[m]
    y[m] -= t * t + t + t + 1
    return y


def make_ir(rt60, seed, length=None, predelay=0.012, width=1.0,
            bands=((0, 350, 1.3), (350, 1500, 1.0), (1500, 4500, 0.62), (4500, 20000, 0.33))):
    """Stereo multiband decaying-noise impulse response with unit energy per channel."""
    rng = np.random.default_rng(seed)
    n = int(SR * (length or rt60 * 1.2))
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for ch in range(2):
        nz = rng.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi, k in bands:
            if lo == 0:
                part = lp(nz, hi, 4)
            elif hi >= 20000:
                part = hp(nz, lo, 4)
            else:
                part = bp(nz, lo, hi, 4)
            acc += part * 10 ** (-3 * t / (rt60 * k))
        acc *= 1 - np.exp(-t / 0.01)
        ir[ch] = acc
    d = int(predelay * SR)
    ir = np.pad(ir, ((0, 0), (d, 0)))[:, :n]
    m, s = (ir[0] + ir[1]) / 2, (ir[0] - ir[1]) / 2 * width
    ir = np.vstack([m + s, m - s])
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def convolve(x, ir, tail=True):
    """Stereo (or mono->stereo) convolution; keeps the tail when tail=True."""
    if x.ndim == 1:
        x = np.vstack([x, x])
    n = x.shape[1] + (ir.shape[1] if tail else 0)
    out = np.zeros((2, n))
    for ch in range(2):
        y = signal.fftconvolve(x[ch], ir[ch])
        out[ch] = y[:n] if len(y) >= n else np.pad(y, (0, n - len(y)))
    return out


# =====================================================================================
# the hummed voice
# =====================================================================================

VOICE_MARA = dict(bright=760, nasal=(290, 1.3, 6.0), notch=(1150, 2.2, -12.0), lpf=6200, hpf=110,
                  vib_rate=5.4, vib_depth=22, vib_delay=0.32, scoop=38, glide=0.075, drift=4.0,
                  jitter=0.0, rasp=0.0, creak=0.0, shimmer=0.04, breath=0.05, attack=0.09,
                  release=0.32, dip=0.26)
VOICE_DEAD = dict(bright=600, nasal=(245, 1.2, 7.0), notch=(950, 1.8, -10.0), lpf=3800, hpf=70,
                  vib_rate=4.1, vib_depth=26, vib_delay=0.22, scoop=65, glide=0.2, drift=15.0,
                  jitter=16.0, rasp=0.35, creak=0.45, shimmer=0.22, breath=0.0, attack=0.3,
                  release=0.55, dip=0.12)
VOICE_CHOIR = dict(bright=700, nasal=(260, 1.3, 6.5), notch=(1000, 2.0, -11.0), lpf=5200, hpf=70,
                   vib_rate=4.8, vib_depth=14, vib_delay=0.35, scoop=18, glide=0.11, drift=3.5,
                   jitter=2.5, rasp=0.06, creak=0.05, shimmer=0.05, breath=0.0, attack=0.4,
                   release=0.7, dip=0.14)


def hum(notes, p, seed, cut=None, pitch_cents=0.0, extra_cents=None, amp_env=None):
    """Render one hummed line. notes = [[start s, dur s, midi], ...] (absolute, sorted).
    Returns (t0, mono). extra_cents(tt) and amp_env(tt) take absolute times per sample."""
    rng = np.random.default_rng(seed)
    t_first = notes[0][0]
    t_last = notes[-1][0] + notes[-1][1]
    t0 = t_first - (0.7 if p['breath'] else 0.12)
    t_end = cut if cut is not None else t_last + p['release'] + 0.15
    n = int((t_end - t0) * SR)
    tt = t0 + np.arange(n) / SR

    # target pitch as steps, glided by two one-pole passes (lands a little after the onset)
    target = np.full(n, float(notes[0][2]))
    for ts, d, m in notes:
        target[tt >= ts] = m
    a = 1 - np.exp(-1 / (SR * max(p['glide'], 0.005) / 2.5))
    base = target[0]
    sm = signal.lfilter([a], [1, a - 1], target - base)
    sm = signal.lfilter([a], [1, a - 1], sm) + base

    cents = np.full(n, float(pitch_cents))
    groups = []                        # legato groups: [first index, last index] into notes
    for k, (ts, d, m) in enumerate(notes):
        new_group = k == 0 or notes[k - 1][0] + notes[k - 1][1] < ts - 0.05
        if new_group:
            groups.append([k, k])
        else:
            groups[-1][1] = k
        i = int((ts - t0) * SR)
        if i < n:
            depth = p['scoop'] if new_group else p['scoop'] * 0.35
            seg = np.arange(n - i) / SR
            cents[i:] -= depth * np.exp(-seg / 0.07)

    # vibrato that blooms on long notes
    vd = np.zeros(n)
    for ts, d, m in notes:
        i0, i1 = int((ts - t0) * SR), min(n, int((ts + d - t0) * SR))
        if i1 > i0:
            seg = np.arange(i1 - i0) / SR
            env = np.clip((seg - p['vib_delay']) / 0.45, 0, 1) ** 1.5 * min(1.0, d / 0.9)
            vd[i0:i1] = np.maximum(vd[i0:i1], env)
    vd = uniform_filter1d(vd, int(0.08 * SR))
    rate = p['vib_rate'] * (1 + 0.06 * slow_noise(n, 0.7, rng))
    vph = 2 * np.pi * np.cumsum(rate) / SR + rng.uniform(0, 2 * np.pi)
    cents += p['vib_depth'] * vd * np.sin(vph)
    cents += p['drift'] * slow_noise(n, 0.5, rng)
    if p['jitter']:
        cents += p['jitter'] * band_noise(n, 6, 30, rng)
    if extra_cents is not None:
        cents += extra_cents(tt)
    f0 = hz(sm + cents / 100)
    phase = 2 * np.pi * np.cumsum(f0) / SR + rng.uniform(0, 2 * np.pi)

    # closed-form harmonic series: harmonic k has amplitude r^k = exp(-k f0 / bright)
    r = np.exp(-f0 / p['bright'])
    src = r * np.sin(phase) / (1 - 2 * r * np.cos(phase) + r * r)
    src /= np.sqrt(r * r / (1 - r * r) / 2)
    if p['creak']:      # period doubling: every other glottal pulse a little weaker
        src *= 1 + p['creak'] * np.cos(phase / 2 + 0.4)
    if p['rasp']:       # noise puffed out at each glottal closure
        gate = (0.5 + 0.5 * np.cos(phase)) ** 6
        src += p['rasp'] * 2.2 * band_noise(n, 500, 4200, rng) * gate

    # amplitude: legato groups with soft attacks, re-articulation dips, pitch-following loudness
    amp = np.zeros(n)
    for g0, g1 in groups:
        gs = notes[g0][0]
        ge = notes[g1][0] + notes[g1][1]
        i0 = int((gs - t0) * SR)
        i_e = int((ge - t0) * SR)
        ia = int(p['attack'] * SR)
        ir_ = int(p['release'] * SR)
        e = np.zeros(n)
        if i_e > i0:
            e[i0:i_e] = 1.0
        if ia > 0:
            k = np.arange(min(ia, n - i0))
            e[i0:i0 + len(k)] = 0.5 - 0.5 * np.cos(np.pi * k / ia)
        if i_e < n:
            k = np.arange(min(ir_, n - i_e))
            e[i_e:i_e + len(k)] = 0.5 + 0.5 * np.cos(np.pi * k / max(ir_, 1))
        amp = np.maximum(amp, e)
        for k in range(g0 + 1, g1 + 1):       # "mm-mm": a little dip into each new note
            ts = notes[k][0]
            amp *= 1 - p['dip'] * np.exp(-((tt - ts + 0.015) / 0.04) ** 2)
    for ts, d, m in notes:                     # long notes swell, then sag
        if d > 0.9:
            i0, i1 = int((ts - t0) * SR), min(n, int((ts + d - t0) * SR))
            if i1 > i0:
                u = np.arange(i1 - i0) / (i1 - i0)
                amp[i0:i1] *= (1 + 0.12 * np.sin(np.pi * u)) * (1 - 0.14 * u)
    amp *= (f0 / 300.0) ** 0.3
    if p['shimmer']:
        amp *= 1 + p['shimmer'] * band_noise(n, 4, 25, rng) * 0.5
    if amp_env is not None:
        amp *= amp_env(tt)
    y = src * np.maximum(amp, 0)

    if p['breath']:     # an inhale before each phrase
        for g0, _ in groups:
            gs = notes[g0][0]
            i1 = int((gs - 0.06 - t0) * SR)
            i0 = max(0, i1 - int(0.42 * SR))
            if i1 > i0:
                k = np.arange(i1 - i0) / (i1 - i0)
                env = np.sin(np.pi * k ** 0.8) ** 2
                y[i0:i1] += p['breath'] * env * band_noise(i1 - i0, 900, 4800, rng)

    # the nasal tract of a closed-mouth /m/
    y = hp(y, p['hpf'])
    y = filt(y, 'peak', p['nasal'][0], p['nasal'][1], p['nasal'][2])
    y = filt(y, 'peak', p['notch'][0], p['notch'][1], p['notch'][2])
    y = lp(y, p['lpf'])
    if cut is not None:
        y = fades(y, 0.0, 0.004)
    return t0, y


def render_voices(specs, base_seed):
    """specs: dicts with notes, p, pan, gain, (lpf), (cut), (extra_cents), (amp_env), (pitch_cents).
    Returns (t0, stereo buffer)."""
    takes = []
    for i, s in enumerate(specs):
        t0, y = hum(s['notes'], s['p'], base_seed + i * 7919, cut=s.get('cut'),
                    pitch_cents=s.get('pitch_cents', 0.0), extra_cents=s.get('extra_cents'),
                    amp_env=s.get('amp_env'))
        if s.get('lpf'):
            y = lp(y, s['lpf'])
        takes.append((t0, pan2(y * s.get('gain', 1.0), s.get('pan', 0.0))))
    t0 = min(t for t, _ in takes)
    t1 = max(t + b.shape[1] / SR for t, b in takes)
    out = np.zeros((2, int((t1 - t0) * SR) + 2))
    for t, b in takes:
        i = int(round((t - t0) * SR))
        out[:, i:i + b.shape[1]] += b
    return t0, out


def shift_notes(notes, semis=0, dt=0.0, stretch=1.0):
    return [[ts + dt + (ts - notes[0][0]) * (stretch - 1), d * stretch, m + semis] for ts, d, m in notes]


# =====================================================================================
# instruments and effects
# =====================================================================================

def boom(size, rng, dur=5.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 31 + 46 * np.exp(-t / 0.3)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (1.0 + 0.6 * size)) * (1 - np.exp(-t / 0.003))
    sub = np.tanh(2.4 * sub) / np.tanh(2.4)
    thud = lp(rng.standard_normal(n), 240) * np.exp(-t / 0.09) * 1.4
    crack = hp(rng.standard_normal(n), 1800) * np.exp(-t / 0.014) * 0.35
    metal = np.zeros(n)
    for f0, tau, a in [(97, 2.6, .25), (231, 1.9, .17), (419, 1.3, .13), (643, .95, .09), (911, .7, .07), (1297, .5, .05)]:
        metal += a * np.sin(2 * np.pi * f0 * (1 + 0.003 * rng.standard_normal()) * t + rng.uniform(0, 6.3)) * np.exp(-t / tau)
    metal *= 1 - np.exp(-t / 0.002)
    return (sub + 0.5 * thud + 0.25 * crack + 0.32 * metal) * size


def braam(dur, midis, rng, bright=1.0, drive=2.4, attack=0.03, decay=0.45):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = []
    for ch in range(2):
        x = np.zeros(n)
        for m in midis:
            for d in (-13, -4, 9):
                f = hz(m + (d + rng.normal(0, 3)) / 100.0) * (1 + 0.0025 * np.sin(2 * np.pi * rng.uniform(0.2, 0.5) * t + rng.uniform(0, 6)))
                x += blep_saw(f, rng)
        x /= len(midis) * 3
        fc = 110 + 2600 * bright * np.exp(-t / 0.4) * (1 - np.exp(-t / 0.025)) + 260 * np.exp(-t / 2.5)
        y = tv_filter(x, fc, 'low', q=1.3)
        amp = (1 - np.exp(-t / attack)) * np.exp(-t / (dur * decay))
        out.append(np.tanh(drive * y * amp * 2.2) / np.tanh(drive))
    return np.vstack(out)


def stinger(dur, rng, midis=(83, 84, 85, 86, 88)):
    """A string-cluster screech for jump scares."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = []
    for ch in range(2):
        x = np.zeros(n)
        for m in midis:
            f = hz(m + rng.normal(0, 0.1)) * (1 + 0.012 * np.sin(2 * np.pi * rng.uniform(5, 7) * t + rng.uniform(0, 6)))
            x += blep_saw(f, rng)
        x = bp(x / len(midis), 700, 7000)
        x *= (1 - np.exp(-t / 0.006)) * np.exp(-t / (dur * 0.35))
        out.append(np.tanh(2.0 * x))
    return np.vstack(out)


def impact(size, rng, dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 36 + 70 * np.exp(-t / 0.12)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7) * (1 - np.exp(-t / 0.002))
    sub = np.tanh(2.8 * sub) / np.tanh(2.8)
    body = lp(rng.standard_normal(n), 900) * np.exp(-t / 0.06)
    snap = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.008)
    return (sub + 0.6 * body + 0.35 * snap) * size


def reverse_swell(dur, rng, ir):
    """A reversed reverb tail that rises into a hit landing at the end of the buffer."""
    n = int(dur * SR)
    burst = np.zeros(int(0.08 * SR))
    burst[:] = rng.standard_normal(len(burst)) * np.exp(-np.arange(len(burst)) / (0.02 * SR))
    burst = np.concatenate([burst, np.zeros(n)])
    wet = convolve(hp(burst, 120), ir)[:, :n]
    wet = wet[:, ::-1]
    wet *= ramp_env(n, [(0, 0), (dur * 0.6, 0.35), (dur, 1.0)]) ** 1.6
    return wet / (np.max(np.abs(wet)) + 1e-9)


def shepard(dur, rng, comps=7, base=38.0, rate0=0.1, rate1=0.75):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rate = rate0 + (rate1 - rate0) * (t / dur) ** 2
    pos = np.cumsum(rate) / SR
    out = []
    for ch in range(2):
        y = np.zeros(n)
        for i in range(comps):
            o = (i + pos + ch * 0.02) % comps
            f = base * 2 ** o
            a = np.exp(-0.5 * ((o - comps / 2) / (comps / 6)) ** 2)
            ph = 2 * np.pi * np.cumsum(f) / SR + rng.uniform(0, 6.3)
            y += a * (np.sin(ph) + 0.25 * np.sin(2 * ph + 1.0))
        out.append(y / comps)
    return np.vstack(out)


def heartbeat(t0, t1, bpm0, bpm1, rng):
    dur = t1 - t0
    n = int((dur + 1.0) * SR)
    y = np.zeros(n)
    t, beats = 0.0, []
    while t < dur:
        u = t / dur
        bpm = bpm0 + (bpm1 - bpm0) * u ** 1.4
        beats.append((t, u))
        t += 60.0 / bpm
    k = int(0.5 * SR)
    kt = np.arange(k) / SR
    for bt, u in beats:
        for off, amp, fhi in ((0.0, 1.0, 72), (0.17, 0.72, 64)):
            f = 40 + (fhi - 40) * np.exp(-kt / 0.025)
            s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-kt / 0.085) * (1 - np.exp(-kt / 0.004))
            i = int((bt + off) * SR)
            if i + k <= n:
                y[i:i + k] += amp * (0.55 + 0.45 * u) * s
    y = np.tanh(1.8 * y) / np.tanh(1.8)
    return lp(y, 400)


def wind(dur, rng, lo=180, hi=820, gust=0.7, whistle=0.22):
    n = int(dur * SR)
    fc = lo * (hi / lo) ** (0.5 + 0.5 * np.tanh(slow_noise(n, 0.16, rng)))
    g = 0.55 + 0.45 * np.tanh(slow_noise(n, 0.11, rng) * gust)
    out = []
    for ch in range(2):
        x = pink(n, rng)
        y = tv_filter(x, fc * (1 + 0.04 * ch), 'band', q=1.3)
        y += whistle * tv_filter(x, fc * 3.2, 'band', q=7)
        out.append(hp(y * g, 90))
    return np.vstack(out)


def rain(dur, rng, drops=140, bed_lp=1800, drop_f=(2400, 1100), drips=0.8, glass=False):
    n = int(dur * SR)
    out = []
    for ch in range(2):
        bed = filt(lp(hp(pink(n, rng), 140), bed_lp), 'peak', 650, 0.8, 3.0)
        imp = np.zeros(n)
        k = int(dur * drops)
        imp[rng.integers(0, n, k)] = rng.uniform(0.15, 1, k) ** 2 * rng.choice([-1, 1], k)
        d = filt(imp, 'band', drop_f[0], 3) * 0.6 + filt(imp, 'band', drop_f[1], 4) * 0.4
        if glass:
            d += filt(imp, 'band', 5200, 6) * 0.5
        d = lp(d, 6000 if glass else 4200)
        y = bed * 0.22 + d * 6.0
        if drips:
            kk = int(0.05 * SR)
            kt = np.arange(kk) / SR
            for _ in range(max(1, int(dur * drips))):
                i = int(rng.integers(0, max(1, n - kk)))
                f0 = rng.uniform(850, 1500)
                tok = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 0.6 * np.exp(-kt / 0.006))) / SR) * np.exp(-kt / 0.014)
                y[i:i + kk] += tok * rng.uniform(0.4, 1.0) * 0.9
        out.append(y)
    return np.vstack(out)


def creak(rng, dur=0.7, f=(380, 760, 1460), rate=(35, 110)):
    n = int(dur * SR)
    u = np.arange(n) / n
    r = rate[0] + (rate[1] - rate[0]) * np.sin(np.pi * u) ** 1.5
    r *= 1 + 0.15 * slow_noise(n, 12, rng)
    ph = np.cumsum(r) / SR
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    imp = np.zeros(n)
    imp[idx] = rng.uniform(0.4, 1.0, len(idx)) * np.sin(np.pi * u[idx]) ** 0.7
    y = filt(imp, 'band', f[0], 9) + 0.8 * filt(imp, 'band', f[1], 10) + 0.5 * filt(imp, 'band', f[2], 7)
    return y / (np.max(np.abs(y)) + 1e-9)


def thunder(rng, dur=6.0, crack=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    c = hp(rng.standard_normal(n), 350) * np.exp(-t / 0.05) * crack
    c += bp(rng.standard_normal(n), 120, 2500) * np.exp(-t / 0.22) * 0.6 * crack
    env = np.zeros(n)
    for _ in range(5):
        at = rng.uniform(0.15, 2.5)
        env += rng.uniform(0.4, 1.0) * np.exp(-0.5 * ((t - at) / rng.uniform(0.25, 0.8)) ** 2)
    env += np.exp(-t / 2.0) * 0.6
    rum = lp(brown(n, rng), 260) * env
    out = []
    for ch in range(2):
        out.append(c * (1 + 0.1 * ch) + rum * 1.6 + lp(brown(n, rng), 90) * env * 0.8)
    return np.vstack(out)


def buzz(rng, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = np.sign(np.sin(2 * np.pi * 120 * t)) * 0.3 + np.sin(2 * np.pi * 240 * t) * 0.2
    gate = (rng.uniform(size=int(dur * 40) + 2) > 0.45).astype(float)
    gate = np.repeat(gate, int(SR / 40) + 1)[:n]
    gate = uniform_filter1d(gate, int(0.003 * SR))
    crack = np.zeros(n)
    k = int(dur * 60)
    crack[rng.integers(0, n, k)] = rng.uniform(-1, 1, k)
    crack = hp(crack, 2000) * 3
    return bp(tone * gate, 100, 5000) + crack * gate


def breathing(rng, dur, holds=()):
    """Shaky, frightened breathing. holds: (start, end) seconds where the breath is held."""
    n = int(dur * SR)
    y = np.zeros(n)
    t = 0.05
    while t < dur - 0.4:
        held = next((h for h in holds if h[0] - 0.3 <= t < h[1]), None)
        if held:
            t = held[1]
            continue
        for kind, ln, lo, hi, amp in (('in', rng.uniform(0.45, 0.6), 1100, 4200, 0.75), ('out', rng.uniform(0.6, 0.8), 450, 2200, 1.0)):
            k = int(ln * SR)
            i = int(t * SR)
            if i + k > n:
                break
            u = np.arange(k) / k
            env = np.sin(np.pi * u ** (0.6 if kind == 'in' else 1.4)) ** 2
            if kind == 'out':
                env *= 1 + 0.35 * np.sin(2 * np.pi * 9 * u * ln)    # the shake
            y[i:i + k] += amp * env * band_noise(k, lo, hi, rng)
            t += ln + rng.uniform(0.03, 0.1)
        t += rng.uniform(0.05, 0.2)
    return y


def tape_mech(kind, rng):
    """'play' (a clunk and the motor starting) or 'stop' (a clack)."""
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    hits = [(0.0, 1.0), (0.028, 0.55)] if kind == 'play' else [(0.0, 1.0), (0.012, 0.8), (0.05, 0.3)]
    for at, a in hits:
        i = int(at * SR)
        k = n - i
        kt = t[:k]
        y[i:] += a * (filt(rng.standard_normal(k), 'band', 2600, 2.5) * np.exp(-kt / 0.004) * 1.4
                      + np.sin(2 * np.pi * 140 * kt) * np.exp(-kt / 0.025) * 0.8
                      + filt(rng.standard_normal(k), 'band', 900, 4) * np.exp(-kt / 0.012) * 0.6)
    return y


def tape_transport(dur, rng, spin_up=0.12):
    """Motor whir and hiss while the tape runs."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    up = 1 - np.exp(-t / spin_up)
    hiss = bp(pink(n, rng), 1800, 11000) * 0.5 + hp(rng.standard_normal(n), 6000) * 0.3
    f = 50 * up * (1 + 0.01 * slow_noise(n, 2, rng))
    ph = 2 * np.pi * np.cumsum(f) / SR
    motor = np.sin(ph) * 0.5 + np.sin(2 * ph) * 0.3 + np.sin(3 * ph) * 0.15
    whine = np.sin(2 * np.pi * np.cumsum(410 * up) / SR) * 0.08
    return hiss * db(-47) / 0.6 * up + (motor + whine) * db(-58) * up


def wow_flutter(seed):
    rng = np.random.default_rng(seed)
    phw, phf = rng.uniform(0, 6.3, 2)

    def f(tt):
        return 7.0 * np.sin(2 * np.pi * 0.55 * tt + phw) + 2.6 * np.sin(2 * np.pi * 6.8 * tt + phf)
    return f


def tape_fx(y, rng):
    """Cassette and a little speaker: band-limited, saturated, with the odd dropout."""
    y = hp(y, 170)
    y = lp(y, 4300, 3)
    pk = np.max(np.abs(y)) + 1e-9
    y = np.tanh(1.7 * y / pk) / np.tanh(1.7) * pk
    n = len(y)
    for _ in range(3):
        c = int(rng.integers(int(0.5 * SR), max(int(0.6 * SR), n - SR)))
        w = int(rng.uniform(0.04, 0.09) * SR)
        k = np.arange(-w, w)
        idx = np.clip(c + k, 0, n - 1)
        y[idx] *= 1 - rng.uniform(0.25, 0.45) * np.exp(-(k / (w / 2)) ** 2)
    return filt(y, 'peak', 1300, 1.0, 3.0)


def alert_tone(dur, rng):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in (659.26, 932.33):           # E5 + Bb5, a tritone (not any real alert signal)
        for k, a in ((1, 1.0), (3, 0.33), (5, 0.18), (7, 0.1)):
            y += a * np.sin(2 * np.pi * f * k * t)
    y *= ramp_env(n, [(0, 0), (0.012, 1), (dur - 0.02, 1), (dur, 0)])
    return y / 3


def tv_speaker(y, drive=2.0):
    y = bp(y, 280, 3800, 2)
    y = filt(y, 'peak', 1800, 1.2, 4.0)
    pk = np.max(np.abs(y)) + 1e-9
    return np.tanh(drive * y / pk) / np.tanh(drive) * pk


def tts(text, work, voice='kal16', tempo=1.0, pitch=1.0):
    key = hashlib.md5(f'{text}|{voice}|{tempo:.4f}|{pitch:.4f}'.encode()).hexdigest()[:10]
    tf = work / f'tts_{key}.txt'
    out = work / f'tts_{key}.wav'
    if not out.exists():
        tf.write_text(text)
        af = f'aresample={SR}'
        if abs(tempo - 1) > 1e-3 or abs(pitch - 1) > 1e-3:
            af += f',rubberband=tempo={tempo:.4f}:pitch={pitch:.4f}:formant=preserved'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'flite=textfile={tf}:voice={voice}',
                        '-af', af, '-ac', '1', '-ar', str(SR), str(out)], check=True)
    sr, y = wavfile.read(out)
    y = y.astype(np.float64) / 32768.0
    # trim leading/trailing silence
    a = np.abs(y)
    on = np.nonzero(a > 0.01)[0]
    return y[max(0, on[0] - 200):on[-1] + 400] if len(on) else y


# =====================================================================================
# the mix
# =====================================================================================

class Mix:
    """Sources are placed into regions that end at the trailer's hard cuts, so a cut to black
    silences everything that started before it, reverb tails included."""

    def __init__(self, dur, cuts):
        self.n = int(round(dur * SR)) + SR
        self.bounds = [0.0] + sorted(cuts) + [dur + 1.0]
        self.regions = []
        for r0, r1 in zip(self.bounds[:-1], self.bounds[1:]):
            a = max(0, int((r0 - 1.5) * SR))
            b = min(self.n, int(r1 * SR) + 1)
            self.regions.append({'a': a, 'b': b, 'r1': r1, 'dry': np.zeros((2, b - a)), 'sends': {}})

    def region_for(self, t):
        for k in range(len(self.bounds) - 1):
            if t < self.bounds[k + 1] - 1e-6:
                return self.regions[k]
        return self.regions[-1]

    def place(self, x, t, gain=1.0, pan=0.0, send=None, dry=1.0, cut=None, region_t=None):
        if x.ndim == 1:
            x = pan2(x, pan)
        x = x * gain
        if cut is not None:
            k = max(0, int((cut - t) * SR))
            x = fades(x[:, :k], 0.0, 0.004) if k < x.shape[1] else x
        reg = self.region_for(t if region_t is None else region_t)
        i = int(round(t * SR)) - reg['a']
        if i < 0:
            x, i = x[:, -i:], 0
        j = min(reg['b'] - reg['a'], i + x.shape[1])
        if j <= i:
            return
        if dry:
            reg['dry'][:, i:j] += dry * x[:, :j - i]
        for name, amt in (send or {}).items():
            buf = reg['sends'].setdefault(name, np.zeros_like(reg['dry']))
            buf[:, i:j] += amt * x[:, :j - i]

    def render(self, irs):
        out = np.zeros((2, self.n))
        for reg in self.regions:
            y = reg['dry'].copy()
            for name, buf in reg['sends'].items():
                y += convolve(buf, irs[name], tail=False)
            y = hp(y, 24, 2)                           # before the cut, so the filter can't ring past it
            k = int(reg['r1'] * SR) - reg['a']          # the cut: 3 ms to silence
            r = int(0.003 * SR)
            if k < y.shape[1]:
                y[:, k:] = 0
            y[:, max(0, k - r):k] *= np.linspace(1, 0, k - max(0, k - r))
            out[:, reg['a']:reg['b']] += y
        return out


def build(score, work):
    dur = float(score['duration'])
    title_end = next(sh['t1'] for sh in score['shots'] if sh['id'] == 'title')
    mix = Mix(dur, [40.0, 106.0, title_end])
    R = lambda s: np.random.default_rng(s)  # noqa: E731
    IR = {
        'room': make_ir(0.55, 11, predelay=0.006, width=0.6),
        'hall': make_ir(4.6, 12, predelay=0.02, width=1.0),
        'outdoor': make_ir(3.2, 13, predelay=0.03, width=1.0,
                           bands=((0, 350, 1.2), (350, 1500, 1.0), (1500, 4500, 0.55), (4500, 20000, 0.25))),
        'tv': make_ir(0.45, 14, predelay=0.004, width=0.4),
    }

    # ---------------------------------------------------------------- ambience
    log('ambience')
    c = cue_list(score, 'rain_in')[0]
    y = rain(c['until'] - c['t'] + 0.5, R(1))
    y = norm_rms(y, -40) * ramp_env(y.shape[1], [(0, 0), (1.6, 1), (100, 1)])
    mix.place(y, c['t'], cut=c['until'], send={'room': 0.25})

    c = cue_list(score, 'outdoor')[0]
    d = c['until'] - c['t']
    y = norm_rms(wind(d + 0.5, R(2)), -33) * ramp_env(int((d + 0.5) * SR), [(0, 0.6), (1.5, 1), (100, 1)])
    mix.place(y, c['t'], cut=c['until'], send={'outdoor': 0.2})
    y = norm_rms(rain(d + 0.5, R(3), drops=60, bed_lp=5000, drop_f=(4200, 2600), drips=0), -44)
    mix.place(y, c['t'], cut=c['until'])
    for k, at in enumerate((31.2, 34.6, 38.3)):     # a porch swing, somewhere in the dark
        y = creak(R(40 + k), dur=0.9, f=(310, 640, 1220), rate=(20, 70))
        mix.place(lp(y, 2500), at, gain=db(-37), pan=0.55, send={'outdoor': 0.5})

    c = cue_list(score, 'street')[0]
    d = c['until'] - c['t']
    y = norm_rms(wind(d + 0.5, R(4), lo=260, hi=1100, whistle=0.35), -35)
    mix.place(y, c['t'], cut=c['until'], send={'outdoor': 0.25})
    n = int(d * SR)
    tt = np.arange(n) / SR
    glass = (np.sin(2 * np.pi * 1318.5 * tt) + np.sin(2 * np.pi * 1396.9 * tt + 1) + 0.5 * np.sin(2 * np.pi * 2637 * tt)) / 2.5
    glass *= ramp_env(n, [(0, 0), (1.8, 1), (d - 0.6, 1), (d, 0)]) * (1 + 0.3 * np.sin(2 * np.pi * 0.4 * tt))
    mix.place(glass, c['t'], gain=db(-40), send={'hall': 0.4})
    mix.place(lp(creak(R(5), dur=1.2, f=(520, 1100, 2300), rate=(15, 45)), 3000), c['t'] + 2.2, gain=db(-38), pan=-0.6, send={'outdoor': 0.6})

    c = cue_list(score, 'wind')[0]
    d = c['until'] - c['t']
    y = norm_rms(wind(d + 0.5, R(6), lo=200, hi=700), -38)
    mix.place(y, c['t'], cut=c['until'] + 0.4, send={'outdoor': 0.2})

    c = cue_list(score, 'night')[0]
    d = c['until'] - c['t']
    y = lp(norm_rms(wind(d + 0.5, R(7), lo=150, hi=500, whistle=0.1), -40), 700)
    mix.place(y * ramp_env(y.shape[1], [(0, 0), (1.5, 1), (100, 1)]), c['t'], cut=c['until'])

    # room tone wherever we're inside and nothing else is going on
    for t0, t1, lvl in ((22.05, 29.4, -56), (64.0, 77.2, -54), (77.2, 83.6, -56), (86.6, 92.0, -54),
                        (108.0, 113.9, -58), (135.8, 140.4, -62)):
        n = int((t1 - t0) * SR)
        y = np.vstack([lp(pink(n, R(int(t0 * 10))), 600), lp(pink(n, R(int(t0 * 10) + 1)), 600)])
        mix.place(norm_rms(y, lvl), t0, cut=t1)

    # ---------------------------------------------------------------- tape: Mum's hum
    log('tape hums')
    for hid in ('tape1', 'tape2'):
        notes, cut, beat = performance(score, hid)
        t0, y = hum(notes, VOICE_MARA, seed=301 if hid == 'tape1' else 302, cut=cut, extra_cents=wow_flutter(5))
        y = tape_fx(y, R(8))
        y = norm_rms(y, -19.5)
        mix.place(y, t0, pan=0.12, send={'room': 0.32}, cut=cut)
    for c in cue_list(score, 'tape_play'):
        mix.place(tape_mech('play', R(int(c['t'] * 7))), c['t'], gain=db(-15), pan=0.15, send={'room': 0.3})
        stop = next(s['t'] for s in cue_list(score, 'tape_stop') if s['t'] > c['t'])
        y = tape_transport(stop - c['t'] - 0.15, R(int(c['t'] * 9)))
        mix.place(fades(y, 0.01, 0.006), c['t'] + 0.15, pan=0.15, send={'room': 0.15})
    for c in cue_list(score, 'tape_stop'):
        mix.place(tape_mech('stop', R(int(c['t'] * 5))), c['t'], gain=db(-12), pan=0.15, send={'room': 0.35})

    # ---------------------------------------------------------------- the dead hum (Act II)
    log('the dead hum')
    notes, _, beat = performance(score, 'dead1')
    rng = R(77)
    specs = []
    groups = (  # name, voices, octave, detune sd, jitter, lag mean/sd, rasp, creak, gain
        ('core', 10, -12, 6, (5, 9), (0.03, 0.02), (0.08, 0.18), (0.15, 0.35), 1.0),
        ('low', 6, -24, 8, (7, 12), (0.05, 0.03), (0.3, 0.5), (0.45, 0.65), 0.6),
        ('high', 4, 0, 9, (6, 10), (0.04, 0.03), (0.05, 0.1), (0.05, 0.15), 0.35),
        ('strag', 5, -12, 22, (14, 24), (0.2, 0.08), (0.3, 0.5), (0.35, 0.6), 0.4),
    )
    for gname, count, octv, det, jit, lag, rasp_, creak_, gain in groups:
        for i in range(count):
            join = 0.0 if gname == 'core' else rng.uniform(0.3, 1.6) * beat * 3
            ns = [nn for nn in shift_notes(notes, octv, max(0.0, rng.normal(*lag)), rng.uniform(0.995, 1.015))
                  if nn[0] >= notes[0][0] + join - 1e-6]
            if not ns:
                continue
            p = dict(VOICE_DEAD, glide=rng.uniform(0.09, 0.17) if gname != 'strag' else rng.uniform(0.2, 0.35),
                     vib_rate=rng.uniform(3.6, 5.0), vib_depth=rng.uniform(9, 18), jitter=rng.uniform(*jit),
                     rasp=rng.uniform(*rasp_), creak=rng.uniform(*creak_), bright=rng.uniform(480, 760), drift=8)
            dist = rng.uniform(0, 1) if gname != 'core' else rng.uniform(0, 0.5)
            specs.append(dict(notes=ns, p=p, pan=rng.uniform(-0.9, 0.9), gain=gain * (0.5 + 0.5 * (1 - dist)),
                              lpf=1800 + 3200 * (1 - dist), pitch_cents=rng.normal(0, det)))
    t0, y = render_voices(specs, 5000)
    y = norm_rms(y, -20.5)
    y *= ramp_env(y.shape[1], [(0, 0.5), (1.2, 1.0), (100, 1.0)])
    mix.place(y, t0, send={'outdoor': 0.22})

    # ---------------------------------------------------------------- the street and the TV
    log('broadcast')
    c = cue_list(score, 'alert')[0]
    y = tv_speaker(alert_tone(1.9, R(9)), 1.6)
    mix.place(norm_rms(y, -21), c['t'], pan=-0.1, send={'tv': 0.3})
    tv_t0, tv_t1 = c['t'], cue_list(score, 'tv_off')[0]['t']
    n = int((tv_t1 - tv_t0) * SR)
    rng = R(10)
    stat = bp(rng.standard_normal(n), 900, 9000)
    crk = np.zeros(n)
    k = int((tv_t1 - tv_t0) * 25)
    crk[rng.integers(0, n, k)] = rng.uniform(-1, 1, k) ** 3
    stat = stat * 0.6 + hp(crk, 1500) * 4
    tt = np.arange(n) / SR
    mains = sum(a * np.sin(2 * np.pi * 60 * h * tt) for h, a in ((1, 1), (2, .5), (3, .35), (5, .2)))
    stat_env = ramp_env(n, [(0, 1.6), (2.0, 1.4), (2.3, 0.7), (100, 0.7)])
    mix.place(norm_rms(stat, -43) * stat_env + mains * db(-56), tv_t0, pan=-0.1, send={'tv': 0.2})

    for k, line in enumerate(score['broadcast']['lines']):
        nxt = score['broadcast']['lines'][k + 1]['t'] if k + 1 < len(score['broadcast']['lines']) else tv_t1 - 0.25
        slot = nxt - line['t'] - 0.18
        raw = tts(line['say'], work)
        d0 = len(raw) / SR
        tempo = d0 / slot if d0 / 0.9 > slot else 0.9      # slower and lower if it fits, faster if it must
        tempo = min(1.2, max(0.85, tempo))
        y = tts(line['say'], work, tempo=tempo, pitch=0.95)
        if len(y) / SR > slot:
            y = fades(y[:int(slot * SR)], 0, 0.02)
        y = tv_speaker(y, 2.2)
        mix.place(norm_rms(y, -18.5), line['t'], pan=-0.1, send={'tv': 0.35})
        log(f'  broadcast line {k}: {len(y) / SR:.2f}s in a {slot:.2f}s slot (tempo {tempo:.2f})')

    c = cue_list(score, 'tv_off')[0]
    n = int(0.6 * SR)
    tt = np.arange(n) / SR
    zip_ = np.sin(2 * np.pi * np.cumsum(1700 * np.exp(-tt / 0.07) + 60) / SR) * np.exp(-tt / 0.12)
    zip_ += hp(R(11).standard_normal(n), 3000) * np.exp(-tt / 0.006) * 0.8
    mix.place(zip_, c['t'], gain=db(-24), pan=-0.1, send={'tv': 0.3})

    # ---------------------------------------------------------------- drones and pads
    log('drones')
    for c in cue_list(score, 'drone_low'):
        d = c['until'] - c['t']
        n = int(d * SR)
        tt = np.arange(n) / SR
        rng = R(int(c['t'] * 3))
        y = (np.sin(2 * np.pi * 36.71 * tt) + 0.6 * np.sin(2 * np.pi * 73.42 * tt + 1)
             + 0.35 * np.sin(2 * np.pi * 77.78 * tt + 2) * ramp_env(n, [(0, 0), (d * 0.6, 0), (d, 1)]))
        saws = lp(blep_saw(np.full(n, 73.42), rng) + blep_saw(np.full(n, 110.0 * 1.003), rng), 180, 2)
        y = y + 0.5 * saws
        y *= ramp_env(n, [(0, 0), (min(6, d * 0.7), 0.8), (d, 1.0)]) * (1 + 0.12 * np.sin(2 * np.pi * 0.23 * tt))
        hiss = np.sin(2 * np.pi * 3520 * tt) * ramp_env(n, [(0, 0), (d, 1)]) * db(-24)    # the ears ring
        mix.place(norm_rms(y, -27) + hiss * db(-24), c['t'], cut=c['until'], send={'hall': 0.25})

    c = cue_list(score, 'drone_mid')[0]
    d = c['until'] - c['t']
    n = int(d * SR)
    tt = np.arange(n) / SR
    rng = R(12)
    y = np.vstack([lp(blep_saw(np.full(n, 73.42 * (1 + s)), rng) + blep_saw(np.full(n, 36.71 * (1 - s)), rng), 260)
                   for s in (0.002, -0.002)])
    y *= ramp_env(n, [(0, 0), (3, 0.7), (d - 1.5, 1), (d, 0)])
    mix.place(norm_rms(y, -30), c['t'], send={'hall': 0.3})

    # under the final shot: a low pedal that leans into the dominant
    c = cue_list(score, 'night')[0]
    d = c['until'] - c['t']
    n = int(d * SR)
    tt = np.arange(n) / SR
    y = np.sin(2 * np.pi * 36.71 * tt) + 0.5 * np.sin(2 * np.pi * 55.0 * tt) * ramp_env(n, [(0, 0), (d * 0.7, 0), (d, 1)])
    y *= ramp_env(n, [(0, 0), (4, 0.6), (d, 1.0)])
    mix.place(norm_rms(y, -30), c['t'], cut=c['until'])

    # ---------------------------------------------------------------- hits
    log('booms and hits')
    for c in cue_list(score, 'boom'):
        s = c.get('size', 1.0)
        rng = R(int(c['t'] * 11))
        y = boom(s, rng)
        mix.place(y, c['t'], gain=db(-6.5), send={'hall': 0.42})
        if s >= 0.9:
            br = braam(3.5, [26, 38, 45, 50], rng, bright=0.7, drive=2.2)
            mix.place(br, c['t'], gain=db(-13), send={'hall': 0.35})
            sw = reverse_swell(0.6, rng, IR['hall'])
            mix.place(sw, c['t'] - 0.6, gain=db(-17))

    c = cue_list(score, 'thump')[0]
    mix.place(impact(0.6, R(13)), c['t'], gain=db(-12), send={'outdoor': 0.3})

    for c in cue_list(score, 'thunder'):
        rng = R(int(c['t'] * 13))
        mix.place(thunder(rng), c['t'], gain=db(-9), send={'outdoor': 0.3})
        if c.get('hit'):
            mix.place(impact(1.0, rng), c['t'], gain=db(-7), send={'hall': 0.3})
            mix.place(stinger(1.2, rng), c['t'], gain=db(-20), send={'hall': 0.4})

    for c in cue_list(score, 'hit'):
        s = c.get('size', 1.0)
        rng = R(int(c['t'] * 17))
        mix.place(impact(s, rng), c['t'], gain=db(-8.0), send={'hall': 0.35})
        mix.place(stinger(1.3, rng, midis=tuple(int(m) for m in rng.choice(range(80, 92), 5, replace=False))),
                  c['t'], gain=db(-19), send={'hall': 0.45})
        if c['t'] > 100:      # the montage hits are braams too
            br = braam(1.6, [26 + int(rng.integers(0, 2)), 38, 45], rng, bright=1.1, drive=2.6, decay=0.3)
            mix.place(br, c['t'], gain=db(-12), send={'hall': 0.3})
        fol = c.get('foley')
        if fol == 'door':
            for k, at in enumerate((0, 0.09, 0.31)):
                y = impact(0.8, rng, dur=1.0)
                y = lp(y, 1500) + filt(rng.standard_normal(len(y)), 'band', 320, 3) * np.exp(-np.arange(len(y)) / (0.05 * SR)) * 0.6
                mix.place(y, c['t'] + at, gain=db(-10 - 4 * k), pan=0.2, send={'room': 0.4})
        elif fol == 'snap':
            n = int(0.25 * SR)
            y = hp(rng.standard_normal(n), 1200) * np.exp(-np.arange(n) / (0.004 * SR))
            for k in range(6):
                i = int(rng.uniform(0.005, 0.08) * SR)
                y[i:] += hp(rng.standard_normal(n - i), 800) * np.exp(-np.arange(n - i) / (0.003 * SR)) * rng.uniform(0.3, 0.8)
            mix.place(y, c['t'], gain=db(-14), pan=-0.2, send={'room': 0.3})
        elif fol == 'splinter':
            n = int(0.5 * SR)
            y = np.zeros(n)
            for k in range(14):
                i = int(rng.uniform(0, 0.35) * SR)
                ln = n - i
                y[i:] += filt(rng.standard_normal(ln), 'band', rng.uniform(1200, 3500), 3) * np.exp(-np.arange(ln) / (rng.uniform(0.004, 0.015) * SR)) * rng.uniform(0.3, 1)
            mix.place(y, c['t'], gain=db(-12), pan=0.35, send={'room': 0.3})
        elif fol == 'clatter':
            n = int(1.4 * SR)
            tt = np.arange(n) / SR
            y = np.zeros(n)
            for at in (0.0, 0.11, 0.19, 0.33):
                k = int(at * SR)
                for f0 in (2100, 3420, 5230, 1310):
                    y[k:] += np.sin(2 * np.pi * f0 * tt[:n - k] * (1 + 0.01 * rng.standard_normal())) * np.exp(-tt[:n - k] / 0.05) * rng.uniform(0.2, 0.6)
            roll = lp(rng.standard_normal(n), 900) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * tt)) * ramp_env(n, [(0, 0), (0.35, 0), (0.45, 1), (1.4, 0)])
            mix.place(y * 0.6 + roll * 0.7, c['t'], gain=db(-14), pan=-0.3, send={'room': 0.3})

    # the big one: the title
    c = cue_list(score, 'title')[0]
    rng = R(99)
    br = braam(5.8, [26, 38, 45, 50, 53, 49], rng, bright=1.0, drive=2.6, decay=0.5)
    br *= ramp_env(br.shape[1], [(0, 1), (4.4, 0.5), (5.6, 0.0), (6, 0)])
    mix.place(br, c['t'], gain=db(-9.5), send={'hall': 0.45})
    mix.place(boom(1.3, rng), c['t'], gain=db(-5.5), send={'hall': 0.4})
    mix.place(impact(1.2, rng), c['t'], gain=db(-6), send={'hall': 0.3})
    sw = cue_list(score, 'swell')[0]
    y = reverse_swell(sw['until'] - sw['t'], rng, IR['hall'])
    mix.place(y, sw['t'], gain=db(-12))

    c = cue_list(score, 'low_end')[0]
    y = boom(0.5, R(55), dur=4.0)
    mix.place(lp(y, 200), c['t'], gain=db(-14), send={'hall': 0.25})

    # ---------------------------------------------------------------- Act III textures
    log('heartbeat, hallway, riser')
    c = cue_list(score, 'heartbeat')[0]
    y = heartbeat(c['t'], c['until'], c['bpm0'], c['bpm1'], R(14))
    y = y * ramp_env(len(y), [(0, 0.55), (c['until'] - c['t'], 1.0), (100, 1.0)])
    mix.place(y, c['t'], gain=db(-11), cut=c['until'])

    c = cue_list(score, 'rain_glass')[0]
    d = c['until'] - c['t']
    y = norm_rms(rain(d + 0.3, R(15), drops=220, bed_lp=4000, drop_f=(3200, 1700), drips=0, glass=True), -34)
    mix.place(y, c['t'], cut=c['until'], send={'room': 0.2})

    c = cue_list(score, 'torch_on')[0]
    for at in (0.0, 0.035):
        n = int(0.06 * SR)
        y = filt(R(16).standard_normal(n), 'band', 3400, 3) * np.exp(-np.arange(n) / (0.003 * SR))
        mix.place(y, c['t'] + at, gain=db(-20), pan=0.1, send={'room': 0.3})

    c = cue_list(score, 'breath')[0]
    y = breathing(R(17), c['until'] - c['t'], holds=((89.35 - c['t'], 91.45 - c['t']),))
    mix.place(norm_rms(y, -31), c['t'], pan=0.05, send={'room': 0.15})

    for c in cue_list(score, 'creak'):
        mix.place(creak(R(int(c['t'] * 19))), c['t'], gain=db(-27), pan=0.1, send={'room': 0.5})

    for c in cue_list(score, 'flicker'):
        y = buzz(R(int(c['t'] * 23)), c['until'] - c['t'])
        mix.place(y, c['t'], gain=db(-26), pan=0.1, send={'room': 0.2})

    c = cue_list(score, 'close_hum')[0]
    p = dict(VOICE_DEAD, jitter=20, rasp=0.55, creak=0.6, vib_depth=30, vib_rate=3.6, attack=0.05, bright=700)
    t0, y = hum([[c['t'], c['until'] - c['t'] + 1.0, 52]], p, seed=88, cut=c['until'])
    mix.place(norm_rms(y, -19), t0, pan=-0.15, send={'room': 0.35}, cut=c['until'])

    c = cue_list(score, 'riser')[0]
    d = c['until'] - c['t']
    rng = R(18)
    y = shepard(d, rng)
    y *= ramp_env(y.shape[1], [(0, 0), (d * 0.3, 0.25), (d, 1.0)]) ** 1.3
    mix.place(norm_rms(y, -26), c['t'], cut=c['until'], send={'hall': 0.25})
    n = int(d * SR)
    tt = np.arange(n) / SR
    fc = 300 * (7000 / 300) ** ((tt / d) ** 2)
    nz = np.vstack([tv_filter(rng.standard_normal(n), fc, 'band', 2.0) for _ in range(2)])
    nz *= ramp_env(n, [(0, 0), (d * 0.5, 0.1), (d, 1.0)]) ** 2
    mix.place(norm_rms(nz, -30), c['t'], cut=c['until'], send={'hall': 0.2})
    # the dead, holding the note where the tape stops, dragged upward
    specs = []
    for i in range(16):
        start = c['t'] + rng.uniform(0, 2.5)

        def rise(tt, s=start, e=c['until']):
            u = np.clip((tt - s) / (e - s), 0, 1)
            return 420 * u ** 2
        p = dict(VOICE_DEAD, jitter=rng.uniform(15, 30), rasp=rng.uniform(0.3, 0.6), vib_depth=rng.uniform(10, 30))
        specs.append(dict(notes=[[start, c['until'] - start + 1, 52 + (-12 if i % 3 else 0)]], p=p, cut=c['until'],
                          pan=rng.uniform(-1, 1), gain=rng.uniform(0.5, 1), extra_cents=rise,
                          pitch_cents=rng.normal(0, 25)))
    t0, y = render_voices(specs, 7000)
    y = np.tanh(2.5 * y / (np.max(np.abs(y)) + 1e-9))
    y *= ramp_env(y.shape[1], [(0, 0), (3.0, 0.3), (y.shape[1] / SR, 1.0)]) ** 1.5
    mix.place(norm_rms(y, -24), t0, cut=c['until'], send={'outdoor': 0.4})

    # ---------------------------------------------------------------- the ending (Act IV)
    log('the choir')
    notes, cut, beat = performance(score, 'dead2')
    rng = R(1234)
    bar = beat * 3
    b0 = notes[0][0]
    pads = [(0, 3, ['D3', 'F3', 'A3']), (3, 3, ['Bb2', 'D3', 'F3']), (6, 3, ['G2', 'Bb2', 'D3']), (9, 6, ['A2', 'C#3', 'E3'])]
    specs = []
    shape = lambda tt: np.interp(tt, [b0, b0 + bar, b0 + bar * 1.4, b0 + bar * 2, b0 + bar * 3, b0 + bar * 3.66, cut],  # noqa: E731
                                 [0.35, 0.7, 1.0, 0.85, 0.72, 0.78, 1.3])
    for i in range(22):
        octv = -12 if i < 11 else (0 if i < 17 else -24)
        dt = rng.normal(0.0, 0.015)
        p = dict(VOICE_CHOIR, vib_rate=rng.uniform(4.4, 5.2), vib_depth=rng.uniform(9, 17), bright=rng.uniform(600, 820))
        dist = rng.uniform(0, 1)
        specs.append(dict(notes=shift_notes(notes, octv, dt), p=p, pan=rng.uniform(-0.95, 0.95), cut=cut,
                          gain=(0.55 + 0.45 * (1 - dist)) * (0.85 if octv == 0 else 1.0), lpf=2500 + 3000 * (1 - dist),
                          pitch_cents=rng.normal(0, 5), amp_env=shape))
    for i in range(12):
        member = i % 3
        pn = [[b0 + s * beat + rng.normal(0, 0.02), d * beat + 0.05, midi_of(ch[member])] for s, d, ch in pads]
        p = dict(VOICE_CHOIR, vib_depth=rng.uniform(6, 12), bright=rng.uniform(500, 700), scoop=8)
        specs.append(dict(notes=pn, p=p, pan=rng.uniform(-0.9, 0.9), cut=cut, gain=0.38, lpf=2600,
                          pitch_cents=rng.normal(0, 5), amp_env=shape))
    t0, y = render_voices(specs, 9000)
    y = norm_rms(y, -19.5)
    y = y + 0.5 * convolve(y, IR['outdoor'])[:, :y.shape[1]]
    # heard from inside, through the boards: muffled at first, opening up
    tt = t0 + np.arange(y.shape[1]) / SR
    fc = np.interp(tt, [b0, b0 + bar * 1.6, cut], [850, 5200, 6500])
    y = tv_filter(y, fc, 'low', q=0.6)
    mix.place(y, t0, cut=cut)

    log('the last note')
    notes, _, beat = performance(score, 'mara')
    p = dict(VOICE_MARA, breath=0.08, vib_delay=0.8, vib_depth=16, release=0.6)
    t0, y = hum(notes, p, seed=4242)
    y = filt(y, 'peak', 160, 0.9, 3.0)          # close to the ear
    y = norm_rms(y, -22)
    st = pan2(y, 0.35)
    st[0] = np.concatenate([np.zeros(22), st[0][:-22]])      # a hair later on the far side
    mix.place(st, t0, send={'room': 0.12})

    # ---------------------------------------------------------------- reverbs, cuts, master
    log('reverbs')
    y = mix.render(IR)
    # the title fades out under the black; the cut regions already end in silence
    i0, i1 = int((title_end - 1.4) * SR), int(title_end * SR)
    y[:, i0:i1] *= np.linspace(1, 0, i1 - i0) ** 2
    y[:, int(dur * SR):] = 0

    log('master')
    peak = np.max(np.abs(y), axis=0)
    ceiling = db(-1.2)
    req = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    look, hold = int(0.006 * SR), int(0.04 * SR)
    gm = minimum_filter1d(req, 2 * (look + hold) + 1)
    gm = uniform_filter1d(gm, 2 * look + 1)
    y *= np.minimum(gm, 1.0)
    return y[:, :int(dur * SR)]


# =====================================================================================
# report
# =====================================================================================

def report(y, score, wav_path, work):
    log('report')
    print(f'  length {y.shape[1] / SR:.2f}s, sample peak {20 * np.log10(np.max(np.abs(y)) + 1e-12):.2f} dBFS')
    print('  shot            t0      t1    rms dBFS  peak dBFS')
    for s in score['shots']:
        a, b = int(s['t0'] * SR), int(s['t1'] * SR)
        seg = y[:, a:b]
        label = s['id'] + (f" {s['lines'][0][:14]}" if s.get('lines') else '')
        print(f'  {label:<22} {s["t0"]:6.1f} {s["t1"]:6.1f}  {rms_db(seg):8.1f}  {20 * np.log10(np.max(np.abs(seg)) + 1e-12):8.1f}')
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(wav_path), '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind('Summary:'):]
    print('  ' + '\n  '.join(l.strip() for l in tail.splitlines() if l.strip()))
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        mono = y.mean(axis=0)
        f, t, S = signal.spectrogram(mono, SR, nperseg=2048, noverlap=1024)
        fig, ax = plt.subplots(2, 1, figsize=(22, 9), sharex=True, gridspec_kw={'height_ratios': [1, 2]})
        env = uniform_filter1d(np.abs(mono), int(0.05 * SR))[::441]
        ax[0].plot(np.arange(len(env)) / 100, 20 * np.log10(env + 1e-6), lw=0.6)
        ax[0].set_ylim(-80, 0)
        for s in score['shots']:
            ax[0].axvline(s['t0'], color='r', lw=0.4)
            ax[0].text(s['t0'], -5, s['id'][:8], fontsize=6, rotation=90, va='top')
        ax[1].pcolormesh(t, f, 10 * np.log10(S + 1e-12), shading='auto', vmin=-130, vmax=-30, cmap='magma')
        ax[1].set_yscale('symlog', linthresh=200)
        ax[1].set_ylim(20, 16000)
        fig.tight_layout()
        out = work / 'cradlesong-analysis.png'
        fig.savefig(out, dpi=80)
        print(f'  analysis image: {out}')
    except ImportError:
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=str(REPO / 'cradlesong' / 'cradlesong.mp3'), help='the MP3 the page plays')
    ap.add_argument('--wav', help='also keep the full-quality WAV here')
    ap.add_argument('--work', help='directory for TTS takes and analysis (default: a temporary directory)')
    ap.add_argument('--abr', default='160k', help='MP3 bit rate')
    ap.add_argument('--no-report', action='store_true')
    args = ap.parse_args()
    work = Path(args.work) if args.work else Path(tempfile.mkdtemp(prefix='cradlesong-'))
    work.mkdir(parents=True, exist_ok=True)
    score = load_score()
    y = build(score, work)
    wav = Path(args.wav) if args.wav else work / 'cradlesong.wav'
    pcm = np.clip(y.T + np.random.default_rng(0).triangular(-1, 0, 1, y.T.shape) / 32768, -1, 1)
    wavfile.write(wav, SR, (pcm * 32767).astype(np.int16))
    log(f'wrote {wav}')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-c:a', 'libmp3lame', '-b:a', args.abr,
                    '-ar', str(SR), str(args.out)], check=True)
    log(f'wrote {args.out} ({Path(args.out).stat().st_size / 1e6:.2f} MB)')
    if not args.no_report:
        report(y, score, wav, work)


if __name__ == '__main__':
    main()
