#!/usr/bin/env python3
"""NO SURVIVORS: every voice of the "Keep Them Dancing" soundtrack, and the evidence board's radio clips.

(The public API is documented in API_DOC near the end of this file; `python3 tools/ns_voices.py --api` prints it.)
"""
import argparse
import ctypes
import hashlib
import json
import math
import os
import pickle
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import uniform_filter1d

SR = 44100
BPM = 150.0
BEAT = 0.4
BAR = 1.6
STEP = 0.1
DURATION = 180.0
VERSION = 'ns_voices 1.2'
F32 = np.float32
_T0 = time.time()
_QUIET = False


def log(*a):
    if not _QUIET:
        print(f'[ns_voices {time.time() - _T0:6.1f}s]', *a, flush=True)


class FitError(ValueError):
    """A spoken line cannot be time-fitted inside its score window within the allowed rubberband range."""


# =====================================================================================================
# score and time
# =====================================================================================================

def load_score(path):
    """Parse no-survivors/score.js (the comment header, then `window.SCORE = {json};`)."""
    s = Path(path).read_text(encoding='utf-8')
    i = s.index('{', s.index('\nwindow.SCORE'))
    return json.loads(s[i:s.rindex(';')])


def tb(bar, step=0.0):
    """Seconds of (bar, 16th step)."""
    return bar * BAR + step * STEP


def bt(beat):
    """Seconds of a global beat."""
    return beat * BEAT


def ns(sec):
    return int(round(sec * SR))


def tt(n):
    return np.arange(n) / SR


def hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, float) - 69.0) / 12.0)


def midi_of(name):
    """'A3' / 'F#3' / 'Bb1' -> MIDI number."""
    m = re.fullmatch(r'([A-Ga-g])([#b]?)(-?\d)', name.strip())
    if not m:
        raise ValueError(name)
    pc = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[m.group(1).upper()]
    pc += {'#': 1, 'b': -1, '': 0}[m.group(2)]
    return 12 * (int(m.group(3)) + 1) + pc


# =====================================================================================================
# DSP basics (mono (n,) or stereo (n, 2), float)
# =====================================================================================================

def panlaw(p):
    a = (np.clip(p, -1, 1) + 1.0) * np.pi / 4.0
    return np.cos(a) * np.sqrt(2.0), np.sin(a) * np.sqrt(2.0)


def stereo(x, pan=0.0):
    x = np.asarray(x, float)
    if x.ndim == 2:
        return x
    gl, gr = panlaw(pan)
    return np.stack([x * gl, x * gr], axis=1)


def mono(x):
    x = np.asarray(x, float)
    return x.mean(axis=1) if x.ndim == 2 else x


def place(buf, x, t, gain=1.0, pan=0.0):
    """Add x (mono or stereo) into buf at t (seconds, or an int sample index)."""
    i0 = int(t) if isinstance(t, (int, np.integer)) else int(round(t * SR))
    x = np.asarray(x, float)
    if buf.ndim == 2 and x.ndim == 1:
        x = stereo(x, pan)
    elif buf.ndim == 1 and x.ndim == 2:
        x = x.mean(axis=1)
    n = x.shape[0]
    a, b = max(0, i0), min(buf.shape[0], i0 + n)
    if b > a:
        buf[a:b] += gain * x[a - i0:b - i0]
    return buf


def fades(x, fin=0.002, fout=0.005):
    x = np.array(x, float, copy=True)
    n = x.shape[0]
    if n == 0:
        return x
    a = min(n, max(1, int(fin * SR)))
    b = min(n, max(1, int(fout * SR)))
    sh = (-1,) + (1,) * (x.ndim - 1)
    x[:a] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)).reshape(sh)
    x[n - b:] *= (0.5 + 0.5 * np.cos(np.pi * (np.arange(b) + 1) / b)).reshape(sh)
    return x


def pad_to(x, n):
    x = np.asarray(x, float)
    if x.shape[0] >= n:
        return x[:n]
    return np.pad(x, [(0, n - x.shape[0])] + [(0, 0)] * (x.ndim - 1))


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def undb(d):
    return 10.0 ** (np.asarray(d, float) / 20.0)


def db(x):
    return 20.0 * np.log10(np.maximum(np.abs(x), 1e-12))


def rms(x):
    return float(np.sqrt(np.mean(np.asarray(x, float) ** 2) + 1e-20))


def active_rms(x, floor_db=-30.0):
    """RMS over the 50 ms blocks within floor_db of the loudest block (the level while something sounds)."""
    p = np.mean(np.atleast_2d(np.asarray(x, float).T).T ** 2, axis=1) if np.ndim(x) == 2 else np.asarray(x, float) ** 2
    w = ns(0.05)
    k = max(1, len(p) // w)
    e = p[:k * w].reshape(k, w).mean(axis=1) if len(p) >= w else np.array([p.mean()])
    act = e > e.max() * 10 ** (floor_db / 10)
    return float(np.sqrt(e[act].mean())) if act.any() else 0.0


def norm_active(x, level=0.1):
    r = active_rms(x)
    return x * (level / r) if r > 0 else x


def rng(seed):
    return np.random.default_rng(seed)


def noise(n, seed=0):
    return rng(seed).standard_normal(n)


def _sos(kind, f, order=2):
    return signal.butter(order, f, kind if kind != 'band' else 'bandpass', fs=SR, output='sos')


def lp(x, f, order=2, zero_phase=False):
    s = _sos('low', min(f, SR * 0.49), order)
    return signal.sosfiltfilt(s, x, axis=0) if zero_phase else signal.sosfilt(s, x, axis=0)


def hp(x, f, order=2, zero_phase=False):
    s = _sos('high', f, order)
    return signal.sosfiltfilt(s, x, axis=0) if zero_phase else signal.sosfilt(s, x, axis=0)


def bp(x, lo, hi, order=2, zero_phase=False):
    s = _sos('band', (lo, min(hi, SR * 0.49)), order)
    return signal.sosfiltfilt(s, x, axis=0) if zero_phase else signal.sosfilt(s, x, axis=0)


def biquad(kind, f, q=0.7071, gain_db=0.0):
    """RBJ biquad (b, a): 'peak', 'ls' (low shelf), 'hs' (high shelf), 'bp', 'lp', 'hp', 'notch'."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f / SR
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2 * q)
    if kind == 'peak':
        b = [1 + al * A, -2 * cw, 1 - al * A]
        a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind in ('ls', 'hs'):
        sA = 2 * np.sqrt(A) * al
        if kind == 'ls':
            b = [A * ((A + 1) - (A - 1) * cw + sA), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sA)]
            a = [(A + 1) + (A - 1) * cw + sA, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sA]
        else:
            b = [A * ((A + 1) + (A - 1) * cw + sA), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sA)]
            a = [(A + 1) - (A - 1) * cw + sA, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sA]
    elif kind == 'bp':
        b = [al, 0.0, -al]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'notch':
        b = [1, -2 * cw, 1]
        a = [1 + al, -2 * cw, 1 - al]
    else:
        raise ValueError(kind)
    return np.array(b) / a[0], np.array(a) / a[0]


def eq(x, kind, f, q=0.7071, gain_db=0.0):
    b, a = biquad(kind, f, q, gain_db)
    return signal.lfilter(b, a, x, axis=0)


def tvf(x, kind, fc, q=0.7071, block=64):
    """Time-varying biquad (per-block coefficients): fc is an array (Hz per sample) or a scalar."""
    x = np.asarray(x, float)
    fc = np.broadcast_to(np.asarray(fc, float), (x.shape[0],))
    y = np.zeros_like(x)
    zi = None
    for i in range(0, x.shape[0], block):
        b, a = biquad(kind, float(np.clip(fc[i], 20, SR * 0.45)), q)
        if zi is None:
            zi = np.zeros((2,) + x.shape[1:])
        seg = x[i:i + block]
        out, zi = signal.lfilter(b, a, seg, axis=0, zi=zi)
        y[i:i + block] = out
    return y


def sat(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)


def softclip(x, drive=1.0, asym=0.0):
    y = np.tanh(drive * (x + asym)) - np.tanh(drive * asym)
    return y / max(1e-9, np.tanh(drive))


def bitcrush(x, bits=8, down=2):
    """Sample-and-hold by `down` and quantise to `bits` (a slight lo-fi edge)."""
    x = np.asarray(x, float)
    y = x.copy()
    if down > 1:
        idx = (np.arange(x.shape[0]) // down) * down
        y = x[idx]
    q = 2.0 ** (bits - 1)
    return np.round(y * q) / q


def env_follow(x, attack=0.002, release=0.06):
    a = np.abs(mono(x))
    ga, gr = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    # two passes: fast peak follower via lfilter on rises/falls approximated by max of two smoothers
    up = signal.lfilter([1 - ga], [1, -ga], a)
    dn = signal.lfilter([1 - gr], [1, -gr], a)
    return np.maximum(up, dn)


def compressor(x, thr_db=-18.0, ratio=4.0, attack=0.004, release=0.09, makeup_db=0.0, knee=6.0):
    """Feed-forward compressor (stereo linked, offline: the peak-hold window looks ahead by `attack`)."""
    from scipy.ndimage import maximum_filter1d
    x = np.asarray(x, float)
    m = mono(x)
    lvl = 10 * np.log10(uniform_filter1d(m ** 2, max(1, ns(0.003))) + 1e-12)
    over = lvl - thr_db
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio), (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    g = maximum_filter1d(gr, size=max(1, 2 * ns(attack)))
    a = np.exp(-1 / (release * SR))
    g = signal.lfilter([1 - a], [1, -a], g)
    g = np.maximum(g, maximum_filter1d(gr, size=max(1, ns(attack))) * 0.0 + g)
    gain = undb(-g + makeup_db)
    return x * (gain[:, None] if x.ndim == 2 else gain)


def make_ir(dur=1.2, rt_lo=1.0, rt_hi=0.5, pre=0.01, er=10, er_span=0.05, lp_f=9000.0, width=1.0, seed=0):
    """Synthetic stereo IR (n, 2): banded exponential noise tail, sparse early reflections, pre-delay."""
    r = rng(seed)
    n = ns(dur)
    t = tt(n)
    out = np.zeros((n, 2))
    common = r.standard_normal(n)
    for ch in range(2):
        w = width * r.standard_normal(n) + (1 - width) * common
        lo = lp(w, 600)
        hi = hp(w, 3500)
        mid = w - lo - hi
        rm = 0.5 * (rt_lo + rt_hi)
        y = lo * np.exp(-6.91 * t / rt_lo) + mid * np.exp(-6.91 * t / rm) + hi * np.exp(-6.91 * t / rt_hi)
        y *= 1 - np.exp(-t / 0.008)
        for _ in range(er):
            d = int(r.uniform(0.002, er_span) * SR)
            y[d] += r.uniform(3, 9) * (1 - d / (1.3 * er_span * SR)) * r.choice([-1, 1])
        out[:, ch] = lp(y, lp_f)
    tail = n // 8
    out[n - tail:] *= (np.linspace(1, 0, tail) ** 2)[:, None]
    out = np.pad(out, ((ns(pre), 0), (0, 0)))
    return out / np.sqrt(np.sum(out ** 2, axis=0, keepdims=True))


_IRS = {}
IR_KINDS = {
    'alley': dict(dur=1.3, rt_lo=0.9, rt_hi=0.45, pre=0.018, er=8, er_span=0.09, lp_f=7000, seed=21),
    'street': dict(dur=1.5, rt_lo=1.1, rt_hi=0.55, pre=0.03, er=6, er_span=0.16, lp_f=7500, seed=22),
    'theatre': dict(dur=2.6, rt_lo=2.2, rt_hi=0.9, pre=0.02, er=14, er_span=0.09, lp_f=6500, seed=23),
    'room': dict(dur=0.7, rt_lo=0.5, rt_hi=0.3, pre=0.004, er=16, er_span=0.03, lp_f=8000, seed=24),
    'plate': dict(dur=1.8, rt_lo=1.4, rt_hi=1.2, pre=0.002, er=0, lp_f=11000, seed=25),
    'small': dict(dur=0.4, rt_lo=0.25, rt_hi=0.15, pre=0.001, er=14, er_span=0.012, lp_f=7000, seed=26),
    'arena': dict(dur=3.4, rt_lo=2.8, rt_hi=1.3, pre=0.04, er=10, er_span=0.14, lp_f=6000, seed=27),
    'night': dict(dur=2.2, rt_lo=1.6, rt_hi=0.7, pre=0.06, er=6, er_span=0.25, lp_f=5000, seed=28),
}


def ir(kind):
    if kind not in _IRS:
        _IRS[kind] = make_ir(**IR_KINDS[kind])
    return _IRS[kind]


def convolve(x, h):
    x = np.asarray(x, float)
    xs = stereo(x)
    return np.stack([signal.oaconvolve(xs[:, c], h[:, c])[:xs.shape[0]] for c in range(2)], axis=1)


def reverb(x, kind='room', mix=0.2, pre_hp=200.0, pre_lp=None, tail=True):
    """Wet/dry convolution reverb, stereo out (tail=True extends by the IR length)."""
    h = ir(kind)
    xs = stereo(x)
    if tail:
        xs = np.pad(xs, ((0, h.shape[0]), (0, 0)))
    w = hp(xs, pre_hp) if pre_hp else xs
    if pre_lp:
        w = lp(w, pre_lp)
    return xs * (1 - mix) + convolve(w, h) * mix


def wet(x, kind='room', pre_hp=200.0, pre_lp=None):
    """Reverb return only (same length as x + the IR)."""
    h = ir(kind)
    xs = np.pad(stereo(x), ((0, h.shape[0]), (0, 0)))
    w = hp(xs, pre_hp) if pre_hp else xs
    if pre_lp:
        w = lp(w, pre_lp)
    return convolve(w, h)


def delay_line(x, d_s, gain=1.0):
    d = ns(d_s)
    y = np.zeros_like(x)
    if d < x.shape[0]:
        y[d:] = x[:x.shape[0] - d] * gain
    return y


def frac_delay(x, d):
    """Variable fractional delay (d samples per output sample), linear interpolation."""
    n = x.shape[0]
    pos = np.arange(n) - d
    return np.interp(pos, np.arange(n), x, left=0.0, right=0.0)


def resample(x, sr_in, sr_out=SR):
    if sr_in == sr_out:
        return np.asarray(x, float)
    g = math.gcd(int(sr_in), int(sr_out))
    return signal.resample_poly(np.asarray(x, float), sr_out // g, sr_in // g)


def speed(x, rate):
    """Varispeed (pitch and formants and time together): rate > 1 is faster and higher."""
    x = np.asarray(x, float)
    n = int(len(x) / rate)
    return np.interp(np.arange(n) * rate, np.arange(len(x)), x)


def trim(x, thr_db=-40.0, pre=0.002, post=0.01):
    """Cut leading/trailing silence (relative to the peak); a short fade at both ends."""
    a = np.abs(mono(x))
    if a.max() <= 0:
        return x[:0]
    idx = np.nonzero(a > a.max() * 10 ** (thr_db / 20))[0]
    i0 = max(0, idx[0] - ns(pre))
    i1 = min(len(a), idx[-1] + ns(post))
    return fades(x[i0:i1], 0.001, 0.008)


def trim_span(x, thr_db=-40.0):
    a = np.abs(mono(x))
    idx = np.nonzero(a > a.max() * 10 ** (thr_db / 20))[0]
    return int(idx[0]), int(idx[-1])


def write_wav(path, x, peak=None):
    x = np.asarray(x, float)
    if peak is not None and np.abs(x).max() > 0:
        x = x * (peak / np.abs(x).max())
    m = np.abs(x).max()
    if m > 0.999:
        x = x * (0.999 / m)
    wavfile.write(str(path), SR, (x * 32767).astype(np.int16))


def read_wav(path):
    sr, x = wavfile.read(str(path))
    if x.dtype == np.int16:
        x = x / 32768.0
    elif x.dtype == np.int32:
        x = x / 2147483648.0
    return sr, x.astype(float)


# =====================================================================================================
# flite (libflite through ctypes: audio + phone/syllable/word timings) and rubberband (ffmpeg)
# =====================================================================================================

VOWELS = {'aa', 'ae', 'ah', 'ao', 'aw', 'ax', 'axr', 'ay', 'eh', 'er', 'ey', 'ih', 'iy', 'ow', 'oy', 'uh', 'uw'}
FLITE_VOICES = ('kal', 'kal16', 'awb', 'rms', 'slt')


class _Wave(ctypes.Structure):
    _fields_ = [('type', ctypes.c_char_p), ('sample_rate', ctypes.c_int), ('num_samples', ctypes.c_int),
                ('num_channels', ctypes.c_int), ('samples', ctypes.POINTER(ctypes.c_short))]


class _VoiceS(ctypes.Structure):
    _fields_ = [('name', ctypes.c_char_p), ('features', ctypes.c_void_p), ('ffunctions', ctypes.c_void_p),
                ('utt_init', ctypes.c_void_p)]


class Flite:
    """flite speech with timings. synth(text, voice, stretch, f0, f0_sd) -> dict:
    x (float, 44.1 kHz), phones [(name, t0, t1, word_i, syl_i)], syls [dict(word_i, t0, t1, v0, v1, phones)],
    words [dict(name, t0, t1, syl_is)]. Uses libflite directly (ctypes); falls back to ffmpeg's flite filter (no
    timings: words/syllables are then estimated from the energy envelope). Results are cached on disk."""
    _lib = None
    _voices = {}
    _set = {}

    def __init__(self, work_dir):
        self.dir = Path(work_dir) / 'cache' / 'flite'
        self.dir.mkdir(parents=True, exist_ok=True)
        self.mem = {}

    @classmethod
    def _load(cls):
        if cls._lib is not None:
            return cls._lib
        try:
            G = ctypes.RTLD_GLOBAL
            lib = ctypes.CDLL('libflite.so.1', mode=G)
            ctypes.CDLL('libflite_usenglish.so.1', mode=G)
            ctypes.CDLL('libflite_cmulex.so.1', mode=G)
            P, S, F = ctypes.c_void_p, ctypes.c_char_p, ctypes.c_float
            for name, res, args in [('flite_init', ctypes.c_int, []), ('flite_synth_text', P, [S, P]),
                                    ('utt_wave', ctypes.POINTER(_Wave), [P]), ('utt_relation', P, [P, S]),
                                    ('relation_head', P, [P]), ('item_next', P, [P]), ('item_parent', P, [P]),
                                    ('item_as', P, [P, S]), ('item_feat_string', S, [P, S]),
                                    ('item_feat_float', F, [P, S]), ('feat_set_float', None, [P, S, F]),
                                    ('feat_remove', ctypes.c_int, [P, S]), ('delete_utterance', None, [P])]:
                fn = getattr(lib, name)
                fn.restype = res
                fn.argtypes = args
            lib.flite_init()
            cls._lib = lib
        except OSError:
            cls._lib = False
        return cls._lib

    _names = {}

    @classmethod
    def _name(cls, k):
        """flite keeps the feature-name POINTER (it does not copy the string): names must live forever."""
        if k not in cls._names:
            cls._names[k] = ctypes.create_string_buffer(k.encode())
        return ctypes.cast(cls._names[k], ctypes.c_char_p)

    @classmethod
    def _voice(cls, name):
        if name not in cls._voices:
            vl = ctypes.CDLL(f'libflite_cmu_us_{name}.so.1', mode=ctypes.RTLD_GLOBAL)
            reg = getattr(vl, f'register_cmu_us_{name}')
            reg.restype = ctypes.POINTER(_VoiceS)
            reg.argtypes = [ctypes.c_char_p]
            cls._voices[name] = reg(None)
            cls._set[name] = set()
        return cls._voices[name]

    def synth(self, text, voice='rms', stretch=1.0, f0=None, f0_sd=None):
        key = hashlib.md5(f'{VERSION}|{voice}|{text}|{stretch:.4f}|{f0}|{f0_sd}'.encode()).hexdigest()[:16]
        if key in self.mem:
            return self.mem[key]
        path = self.dir / f'{voice}_{key}.pkl'
        if path.exists():
            with open(path, 'rb') as fh:
                r = pickle.load(fh)
        else:
            r = self._synth(text, voice, stretch, f0, f0_sd)
            with open(path, 'wb') as fh:
                pickle.dump(r, fh)
        self.mem[key] = r
        return r

    def _synth(self, text, voice, stretch, f0, f0_sd):
        lib = self._load()
        if not lib:
            return self._synth_ffmpeg(text, voice, stretch)
        v = self._voice(voice)
        feats = v.contents.features
        for k in list(self._set[voice]):
            lib.feat_remove(feats, self._name(k))
        self._set[voice] = set()
        want = {'duration_stretch': stretch}
        if f0 is not None:
            want['int_f0_target_mean'] = f0
        if f0_sd is not None:
            want['int_f0_target_stddev'] = f0_sd
        for k, val in want.items():
            lib.feat_set_float(feats, self._name(k), float(val))
            self._set[voice].add(k)
        u = lib.flite_synth_text(text.encode('utf-8'), ctypes.cast(v, ctypes.c_void_p))
        w = lib.utt_wave(u).contents
        x = np.ctypeslib.as_array(w.samples, shape=(w.num_samples * w.num_channels,)).astype(float) / 32768.0
        sr = w.sample_rate
        phones = []
        word_ids, syl_ids = {}, {}
        s = lib.relation_head(lib.utt_relation(u, b'Segment'))
        t_prev = 0.0
        while s:
            name = lib.item_feat_string(s, b'name').decode()
            t1 = float(lib.item_feat_float(s, b'end'))
            ss = lib.item_as(s, b'SylStructure')
            wi = si = -1
            wname = ''
            if ss:
                syl = lib.item_parent(ss)
                wd = lib.item_parent(syl) if syl else None
                if syl and wd:
                    si = syl_ids.setdefault(syl, len(syl_ids))
                    wi = word_ids.setdefault(wd, len(word_ids))
                    wname = lib.item_feat_string(wd, b'name').decode()
            phones.append((name, t_prev, t1, wi, si, wname))
            t_prev = t1
            s = lib.item_next(s)
        lib.delete_utterance(u)
        return self._pack(resample(x, sr), phones)

    def _synth_ffmpeg(self, text, voice, stretch):
        tf = self.dir / 'tmp_text.txt'
        out = self.dir / 'tmp_out.wav'
        tf.write_text(text, encoding='utf-8')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
                        f'flite=textfile={tf}:voice={voice}', '-ar', str(SR), '-c:a', 'pcm_f32le', str(out)], check=True)
        sr, x = read_wav(out)
        x = mono(x)
        if abs(stretch - 1.0) > 1e-3:
            x = rubberband_raw(x, tempo=1.0 / stretch, pitch=1.0, formant='preserved', work=self.dir)
        # no timings: one pseudo word per whitespace token, spread over the voiced span by letter counts
        toks = [t for t in re.split(r'\s+', re.sub(r'[^\w\s\']', ' ', text)) if t]
        a, b = trim_span(x, -35)
        L = np.cumsum([0] + [len(t) + 1 for t in toks], dtype=float)
        L /= L[-1]
        phones = []
        for i, tok in enumerate(toks):
            t0 = (a + L[i] * (b - a)) / SR
            t1 = (a + L[i + 1] * (b - a)) / SR
            phones.append(('ah', t0, t1, i, i, tok.lower()))
        return self._pack(x, phones, have_timing=False)

    @staticmethod
    def _pack(x, phones, have_timing=True):
        syls, words = {}, {}
        for (name, t0, t1, wi, si, wname) in phones:
            if si < 0:
                continue
            sy = syls.setdefault(si, dict(word_i=wi, t0=t0, t1=t1, v0=None, v1=None, vph='', phones=[]))
            sy['t1'] = t1
            sy['phones'].append(name)
            if name in VOWELS and sy['v0'] is None:
                sy['v0'], sy['v1'], sy['vph'] = t0, t1, name
            wd = words.setdefault(wi, dict(name=wname, t0=t0, t1=t1, syl_is=[]))
            wd['t1'] = t1
            if si not in wd['syl_is']:
                wd['syl_is'].append(si)
        syl_list = [syls[k] for k in sorted(syls)]
        for sy in syl_list:
            if sy['v0'] is None:
                sy['v0'], sy['v1'] = sy['t0'], sy['t1']
        return dict(x=x.astype(F32), phones=phones, syls=syl_list, words=[words[k] for k in sorted(words)],
                    timed=have_timing)


def rubberband_raw(x, tempo=1.0, pitch=1.0, formant='preserved', work='.'):
    """ffmpeg rubberband: tempo (>1 faster), pitch ratio; formant 'preserved' or 'shifted'. Padded so the edges
    survive; the output keeps the padding trimmed back off (length ~ len(x) / tempo)."""
    work = Path(work)
    key = hashlib.md5(np.asarray(x, F32).tobytes() + f'{tempo:.6f}|{pitch:.6f}|{formant}'.encode()).hexdigest()[:16]
    out = work / f'rb_{key}.npy'
    if out.exists():
        return np.load(out)
    src = work / f'rbin_{key}.wav'
    dst = work / f'rbout_{key}.wav'
    pad = np.zeros(ns(0.2))
    wavfile.write(str(src), SR, np.concatenate([pad, x, pad]).astype(F32))
    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-af',
                        f'rubberband=tempo={tempo:.6f}:pitch={pitch:.6f}:formant={formant}:pitchq=quality:'
                        f'transients=crisp:window=standard', '-c:a', 'pcm_f32le', str(dst)], capture_output=True,
                       text=True)
    if r.returncode != 0:
        raise RuntimeError('rubberband failed: ' + r.stderr)
    _, y = read_wav(dst)
    src.unlink()
    dst.unlink()
    y = mono(y)
    p = ns(0.2 / tempo)
    y = y[p:p + int(round(len(x) / tempo))]
    np.save(out, y.astype(F32))
    return y.astype(float)


# =====================================================================================================
# analysis: YIN pitch, pitch marks, TD-PSOLA (formant-preserving pitch/time), cepstral envelope, vocoder
# =====================================================================================================

def yin(x, fmin=60.0, fmax=900.0, win=1024, hop=256, thr=0.15, sr=SR):
    """YIN pitch tracker. Returns (frame centres in samples, f0 Hz, aperiodicity, rms)."""
    x = np.asarray(x, float)
    tmax = int(sr / fmin)
    tmin = max(2, int(sr / fmax))
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
    r = np.fft.irfft(np.fft.rfft(fr, nfft, axis=1) * np.conj(np.fft.rfft(fr[:, :win], nfft, axis=1)), nfft,
                     axis=1)[:, :tmax + 1]
    d = np.maximum(E0[:, None] + Et - 2 * r, 0.0)
    d[:, 0] = 0.0
    cm = np.cumsum(d[:, 1:], axis=1)
    dp = np.ones_like(d)
    dp[:, 1:] = d[:, 1:] * taus[1:] / np.maximum(cm, 1e-12)
    seg = dp[:, tmin:tmax]
    below = seg < thr
    k = np.where(below.any(axis=1), np.argmax(below, axis=1), np.argmin(seg, axis=1))
    for _ in range(64):
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
    f0 = sr / (km + np.clip(delta, -0.5, 0.5))
    rmsv = np.sqrt(np.mean(fr[:, :win] ** 2, axis=1))
    return np.arange(nf) * hop + win // 2, f0, dp[np.arange(nf), km], rmsv


def f0_track(x, fmin=60.0, fmax=700.0, hop=220):
    """Voiced f0 track for analysis: (centres, f0, voiced). Voiced = aperiodicity < 0.25 and rms > 3 % of max,
    runs of >= 3 frames, median-smoothed."""
    c, f, ap, r = yin(x, fmin, fmax, win=1323, hop=hop)
    v = (ap < 0.25) & (r > 0.03 * (r.max() + 1e-12))
    i = 0
    nf = len(v)
    while i < nf:
        if v[i]:
            j = i
            while j < nf and v[j]:
                j += 1
            if j - i < 3:
                v[i:j] = False
            elif j - i >= 5:
                f[i:j] = signal.medfilt(f[i:j], 5)
            i = j
        else:
            i += 1
    return c, f, v


UV_STEP = int(0.004 * SR)


def pitch_marks(x, f0c, f0, voiced):
    """Pitch marks [(sample, period, voiced)], phase-consistent across voiced runs (each grain is cut at the
    same phase of its period), a fixed 4 ms step in unvoiced parts."""
    fm = float(np.median(f0[voiced])) if voiced.any() else 150.0
    xl = lp(x, float(np.clip(1.25 * fm, 120, 600)), order=4, zero_phase=True)
    n = len(x)
    hop = f0c[1] - f0c[0] if len(f0c) > 1 else 220
    off = f0c[0] if len(f0c) else 0
    marks = []
    p = 0
    pv = False
    T_prev = UV_STEP
    while True:
        cand = p + (T_prev if pv else UV_STEP)
        if cand >= n - 1:
            break
        fi = int(np.clip(round((cand - off) / hop), 0, len(f0) - 1))
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


def analyse(x):
    c, f0, v = f0_track(x)
    return dict(x=np.asarray(x, float), marks=pitch_marks(x, c, f0, v), c=c, f0=f0, voiced=v,
                f0_med=float(np.median(f0[v])) if v.any() else 0.0)


def psola(an, warp, f_out, gain=None, growl=0.0, jitter=0.0, seed=0):
    """TD-PSOLA. warp: output sample -> input sample (float array, len n_out); f_out: output f0 per output sample.
    Grains (Hann, two analysis periods) centred on the pitch marks are re-spaced at the target period, so formants
    stay put. growl > 0 alternates grain gain (period doubling: a subharmonic growl, vocal fry); jitter > 0
    randomises each period by that fraction (rough voice). gain: optional per-output-sample gain."""
    x = an['x']
    mk = an['marks']
    n_out = len(warp)
    if not mk or n_out == 0:
        return np.zeros(n_out)
    mp = np.array([m[0] for m in mk], float)
    mT = np.array([m[1] for m in mk], float)
    mv = np.array([m[2] for m in mk], bool)
    xi = np.arange(len(x), dtype=float)
    y = np.zeros(n_out + 8192)
    off = 4096
    r = rng(seed)
    t = 0.0
    parity = 0
    while t < n_out:
        ti = warp[min(n_out - 1, int(t))]
        k = int(np.clip(np.searchsorted(mp, ti), 0, len(mp) - 1))
        if k > 0 and abs(mp[k - 1] - ti) < abs(mp[k] - ti):
            k -= 1
        if mv[k]:
            Ta = mT[k]
            Ts = SR / max(30.0, f_out[min(n_out - 1, int(t))])
            if jitter > 0:
                Ts *= 1.0 + jitter * r.standard_normal()
            L = Ta
            g = np.sqrt(min(Ts / Ta, 2.0))
            if growl > 0:
                g *= (1.0 + growl) if parity else (1.0 - growl)
                parity ^= 1
        else:
            Ta = Ts = L = float(UV_STEP)
            g = 1.0
        j0, j1 = int(np.ceil(t - L)), int(np.floor(t + L))
        js = np.arange(j0, j1 + 1)
        u = js - t
        w = 0.5 + 0.5 * np.cos(np.pi * u / L)
        y[js + off] += g * w * np.interp(mp[k] + u, xi, x, left=0.0, right=0.0)
        t += max(8.0, Ts)
    y = y[off:off + n_out]
    if gain is not None:
        y = y * gain
    return y


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
    c = np.fft.irfft(np.log(mag + 1e-7), n=nfft, axis=1)
    q = int(keep * SR)
    lw = np.zeros(nfft)
    taper = 0.5 + 0.5 * np.cos(np.pi * np.arange(q) / q)
    lw[:q] = taper
    lw[nfft - q + 1:] = taper[1:][::-1]
    return np.exp(np.fft.rfft(c * lw, axis=1).real)


def formant_shift_env(x, semis, nfft=1024, hop=256):
    """Shift the spectral envelope (formants) by `semis` semitones, keeping the pitch (harmonics) in place:
    each frame's cepstral envelope is resampled along frequency and the fine structure is re-applied."""
    if abs(semis) < 1e-3:
        return np.asarray(x, float)
    n = len(x)
    X = stft(x, nfft, hop)
    mag = np.abs(X)
    env = cep_envelope(mag, 0.0018, nfft)
    f = np.arange(mag.shape[1], dtype=float)
    k = 2.0 ** (semis / 12.0)
    src = f / k
    env2 = np.stack([np.interp(src, f, e, right=e[-1] * 0.1) for e in env])
    Y = X * (env2 / (env + 1e-9))
    y = istft(Y, n, nfft, hop)
    return y * (rms(x) / (rms(y) + 1e-12))


def vocoder(mod, carrier, nfft=1024, hop=256, noise_amt=0.5, sib=0.3, seed=0):
    """Spectral-envelope transfer: the carrier (whitened, plus noise for consonants) takes the modulator's cepstral
    envelope frame by frame; energy follows the modulator; the modulator's sibilance above 4.5 kHz passes."""
    n = len(mod)
    M = stft(mod, nfft, hop)
    Cc = stft(carrier, nfft, hop)
    f = np.fft.rfftfreq(nfft, 1 / SR)
    magM = np.abs(M)
    env = cep_envelope(magM, 0.002, nfft)
    ka, kb = np.searchsorted(f, 5800), np.searchsorted(f, 6400)
    ref = np.exp(np.mean(np.log(env[:, ka:kb] + 1e-12), axis=1, keepdims=True))
    env[:, kb:] = ref * (6400 / f[kb:]) ** 1.5
    tilt = np.clip(f / 400.0, 0.25, 40.0)
    Cw = Cc * tilt
    Cw = Cw / (np.sqrt(np.mean(np.abs(Cw) ** 2, axis=1, keepdims=True)) + 1e-9)
    hf = (magM[:, f > 3000] ** 2).sum(1) / ((magM ** 2).sum(1) + 1e-12)
    ng = np.clip((hf - 0.2) / 0.45, 0, 1) * noise_amt + 0.015
    Nz = stft(noise(n, seed), nfft, hop)
    Nz /= np.sqrt(np.mean(np.abs(Nz) ** 2, axis=1, keepdims=True)) + 1e-9
    Y = (Cw + ng[:, None] * Nz) * env
    eM = (magM ** 2).sum(1)
    eY = (np.abs(Y) ** 2).sum(1) + 1e-12
    Y *= np.sqrt(eM / eY)[:, None]
    y = istft(Y, n, nfft, hop)
    return y + sib * hp(mod, 4500, order=4)


def whisper(x, seed=0):
    """The voice as a whisper: its cepstral envelope on white noise, sibilance passed."""
    y = vocoder(x, noise(len(x), seed + 7), noise_amt=0.0, sib=0.45, seed=seed)
    return y * rms(x) / (rms(y) + 1e-12)


LEAD_SOS = signal.butter(4, (150, 1000), 'band', fs=SR, output='sos')


def lead_in(y):
    """Seconds of a sound's unvoiced lead-in: up to the first 5 ms frame whose 150-1000 Hz energy is within 20 dB
    of its maximum (vowels and voiced consonants carry most of their energy there; s, sh, f, h, t, p do not)."""
    if len(y) < ns(0.02):
        return 0.0
    b = signal.sosfiltfilt(LEAD_SOS, y)
    w = ns(0.005)
    k = len(b) // w
    e = 10 * np.log10(np.mean(b[:k * w].reshape(k, w) ** 2, axis=1) + 1e-14)
    return int(np.argmax(e >= e.max() - 20.0)) * w / SR


def envelope_db(x, lo=250, hi=1500, frame=0.005, smooth=5):
    m = mono(x)
    b = bp(m, lo, hi, 2, zero_phase=True)
    w = ns(frame)
    k = max(1, len(b) // w)
    e = 10 * np.log10(np.mean(b[:k * w].reshape(k, w) ** 2, axis=1) + 1e-14)
    return uniform_filter1d(e, smooth) if smooth > 1 else e


# =====================================================================================================
# pictures for checks: spectrogram with pitch track and target notes
# =====================================================================================================

def _colormap(v):
    v = np.clip(v, 0, 1)
    stops = np.array([[0, 0, 0], [30, 10, 70], [120, 20, 120], [210, 60, 60], [250, 160, 30], [255, 250, 200]], float)
    pos = np.linspace(0, 1, len(stops))
    return np.stack([np.interp(v, pos, stops[:, c]) for c in range(3)], axis=-1).astype(np.uint8)


def spectrogram_png(x, path, title='', t0=0.0, width=1400, height=420, fmax=8000, rng_db=75, pitch=None,
                    targets=None, marks=None, fmin_pitch=60, fmax_pitch=1000):
    """Log-frequency spectrogram (50 Hz .. fmax), optional pitch track [(t, hz)], target notes [(t0, t1, hz)] as
    cyan bars, and vertical marks [(t, label)] (e.g. step onsets)."""
    from PIL import Image, ImageDraw
    m = mono(x)
    nfft, hop = 2048, max(64, len(m) // width)
    X = np.abs(stft(m, nfft, hop))
    S = 20 * np.log10(X + 1e-9)
    S = (S - (S.max() - rng_db)) / rng_db
    f = np.fft.rfftfreq(nfft, 1 / SR)
    fl = np.exp(np.linspace(np.log(50), np.log(fmax), height))
    cols = np.stack([np.interp(fl, f, col) for col in S], axis=1)[::-1]
    img = Image.fromarray(_colormap(cols)).resize((width, height))
    d = ImageDraw.Draw(img)
    dur = len(m) / SR

    def X_(t):
        return (t - t0) / dur * width

    def Y_(fr):
        return height - (np.log(max(fr, 50)) - np.log(50)) / (np.log(fmax) - np.log(50)) * height
    for fr in (100, 200, 400, 800, 1600, 3200, 6400):
        d.line([(0, Y_(fr)), (12, Y_(fr))], fill=(200, 200, 200))
        d.text((14, Y_(fr) - 6), str(fr), fill=(200, 200, 200))
    if targets:
        for a, b, fr in targets:
            d.line([(X_(a), Y_(fr)), (X_(b), Y_(fr))], fill=(0, 255, 255), width=3)
    if pitch is not None:
        for t, fr in pitch:
            if fr > 0:
                d.point((X_(t), Y_(fr)), fill=(255, 255, 255))
    if marks:
        for t, lab in marks:
            d.line([(X_(t), 0), (X_(t), height)], fill=(80, 255, 80))
            d.text((X_(t) + 2, 2), str(lab), fill=(80, 255, 80))
    d.text((width - 8 - 7 * len(title), height - 16), title, fill=(255, 255, 255))
    img.save(path)
    return path


# =====================================================================================================
# the singer: score syllables -> one flite render of the phrase -> per-syllable warp -> PSOLA on the melody
# =====================================================================================================

# TTS spellings of sung/shouted words (lower case, punctuation stripped first); a value may be several tokens
SPELL = {'a.m.': 'ay em', "'em": 'em', 'safe-room': 'safe room', 'noodle': 'noodle', 'vex': 'vex', 'hey': 'hey',
         'granny': 'granny', 'meat': 'meat', 'argh': 'arg', 'woo': 'woo', 'huh': 'huh'}
DIPHTHONGS = {'ay', 'aw', 'ey', 'ow', 'oy'}
FUNCTION_WORDS = {'the', 'a', 'on', 'in', 'and', 'to', 'at', 'it', 'my', 'of', 'em', "'em", 'our', 'we\'re', 'is'}
F0_SCALE = {'awb': 0.962, 'kal16': 1.0, 'kal': 1.0, 'slt': 1.0, 'rms': None}   # flite int_f0_target_mean -> sung f0
F0_MAX = {'awb': 300.0, 'kal16': 320.0, 'kal': 320.0, 'slt': 380.0, 'rms': 0.0}   # beyond these flite degrades


def word_key(w):
    return re.sub(r"[^\w'.\-]", '', w.lower()).strip('.') if w.lower() != 'a.m.' else 'a.m.'


def spell(w):
    k = re.sub(r"[^\w'.\-]", '', w.lower())
    if k in SPELL:
        return SPELL[k]
    k = k.strip('.').replace('-', ' ')
    return SPELL.get(k, k)


def pre_roll(y, u=None, cap=0.12):
    """How far ahead of its beat a syllable starts so it is heard on the beat (P-centre): ~70 % of an audible
    unvoiced lead-in (s, sh, ch, t, k), all of a near-silent one; none under 25 ms."""
    v0 = ns(lead_in(y) if u is None else u)
    if v0 < ns(0.025):
        return 0.0
    w = ns(0.01)
    k = len(y) // w
    if k < 1:
        return 0.0
    pk = np.sqrt(np.mean(y[:k * w].reshape(k, w) ** 2, axis=1)).max()
    lead = np.sqrt(np.mean(y[:v0] ** 2))
    return float(min(cap, (1.0 if lead < pk * 10 ** (-24 / 20) else 0.7) * v0 / SR))


class Singer:
    """Sings score syllables with one flite voice. events: dicts with t (note onset s), dur (s), midi, syl, word
    (display word), wi (word index in the phrase), plus anything else (copied into the records).
    sing(events, **style) -> (mono y, t_start s, records)."""

    def __init__(self, flite):
        self.F = flite

    # ---- source: one flite render of the phrase, its syllables mapped onto the score's
    def source(self, words, n_syls, voice, f0_hz, stretch=1.0):
        """words: display words of the phrase; n_syls: score syllable count per word. Returns (x, spans) with
        spans[w] = list of n_syls[w] dicts (s0, s1, v0, v1 in samples)."""
        toks = [spell(w).split() for w in words]
        f0p = None
        if F0_SCALE.get(voice) and f0_hz:
            f0p = float(np.clip(f0_hz / F0_SCALE[voice], 70.0, F0_MAX[voice]))
        r = self.F.synth(' '.join(t for tk in toks for t in tk), voice, stretch, f0p)
        x = r['x'].astype(float)
        fw = r['words']
        if r['timed'] and len(fw) == sum(len(t) for t in toks):
            spans, k = [], 0
            for w, tk in enumerate(toks):
                sy = [r['syls'][si] for j in range(len(tk)) for si in fw[k + j]['syl_is']]
                k += len(tk)
                spans.append(self._fit_syls([dict(s0=ns(s['t0']), s1=ns(s['t1']), v0=ns(s['v0']), v1=ns(s['v1']),
                                                  ph=s['phones'], vph=s.get('vph', '')) for s in sy], n_syls[w], x))
            return x, spans
        # fallback: each word on its own
        parts, spans, off = [], [], 0
        for w, tk in enumerate(toks):
            rr = self.F.synth(' '.join(tk), voice, stretch, f0p)
            xx = rr['x'].astype(float)
            sy = [dict(s0=off + ns(s['t0']), s1=off + ns(s['t1']), v0=off + ns(s['v0']), v1=off + ns(s['v1']),
                       ph=s['phones'], vph=s.get('vph', '')) for s in rr['syls']]
            if not sy:
                a, b = trim_span(xx, -35)
                sy = [dict(s0=off + a, s1=off + b, v0=off + a, v1=off + b, ph=[])]
            spans.append(self._fit_syls(sy, n_syls[w], None))
            parts.append(xx)
            off += len(xx)
        return np.concatenate(parts), spans

    @staticmethod
    def _fit_syls(sy, n, x):
        sy = [dict(s) for s in sy]
        while len(sy) > n:                     # merge the shortest adjacent pair
            k = int(np.argmin([sy[i + 1]['s1'] - sy[i]['s0'] for i in range(len(sy) - 1)]))
            a, b = sy[k], sy.pop(k + 1)
            a['s1'], a['v1'], a['ph'] = b['s1'], b['v1'], a['ph'] + b['ph']
        while len(sy) < n:                     # split the longest vowel
            k = int(np.argmax([s['v1'] - s['v0'] for s in sy]))
            a = sy[k]
            mid = (a['v0'] + a['v1']) // 2
            b = dict(s0=mid, s1=a['s1'], v0=mid, v1=a['v1'], ph=a['ph'], vph=a.get('vph', ''))
            a['s1'], a['v1'] = mid, mid
            sy.insert(k + 1, b)
        return sy

    # ---- one phrase
    def sing(self, events, voice='awb', *, detune=0.0, time_jitter=0.0, syl_jitter=0.0, formant=0.0, growl=0.0,
             jitter=0.0, vib=0.25, vib_rate=5.6, scoop=0.6, fall=2.0, fall_min_steps=8, legato=0.03, seed=0,
             pitch_spread=0.0, f0_src=None, stretch=1.0, cons_max=0.07, release=0.02, level=0.1, weak=0.8,
             glide=0.025, octave=0, src_override=None, measure=False):
        """Returns (y mono, t0 s of y[0], records). detune/pitch_spread in cents (constant / per-syllable random);
        time_jitter s (whole phrase), syl_jitter s (per syllable); formant in semitones (envelope shift);
        growl 0..0.6 (period doubling), jitter 0..0.04 (rough periods); fall = semitones the line-final long note
        falls in its last 0.4 s; octave shifts the melody by octaves."""
        r = rng(seed)
        ev = [dict(e) for e in sorted(events, key=lambda e: e['t'])]
        dt = r.uniform(-1, 1) * time_jitter
        for e in ev:
            e['t'] = e['t'] + dt + (r.uniform(-1, 1) * syl_jitter if syl_jitter else 0.0)
            e['m'] = e['midi'] + 12 * octave + detune / 100.0 + (r.normal() * pitch_spread / 100.0 if pitch_spread else 0.0)
        # words in order
        wis = []
        for e in ev:
            if not wis or wis[-1] != e['wi']:
                wis.append(e['wi'])
        words = [next(e['word'] for e in ev if e['wi'] == w) for w in wis]
        nsy = [sum(1 for e in ev if e['wi'] == w) for w in wis]
        tgt = float(np.median(hz([e['m'] for e in ev]))) if f0_src is None else f0_src
        if src_override is not None:
            x, spans = src_override
        else:
            x, spans = self.source(words, nsy, voice, tgt, stretch)
        if abs(formant) > 1e-3:
            x = formant_shift_env(x, formant)
        an = analyse(x)
        flat = []
        for w, sp in zip(wis, spans):
            flat += sp
        for e, s in zip(ev, flat):
            e.update(s0=s['s0'], s1=s['s1'], v0=max(s['s0'], s['v0']), v1=min(s['s1'], max(s['v1'], s['v0'] + 1)),
                     vph=s.get('vph', ''))
            seg = x[e['s0']:e['s1']]
            u = lead_in(seg) if len(seg) > ns(0.02) else 0.0
            e['u'] = min(ns(u), e['v0'] - e['s0']) if e['v0'] > e['s0'] else ns(u)
            e['pre'] = pre_roll(seg, u) if len(seg) > ns(0.02) else 0.0
            # a voiced onset consonant (l, m, n, r, w, v, z...) starts half its sung length ahead of the beat
            e['pre_v'] = min(0.5 * min(max(0, e['v0'] - e['s0'] - e['u']), ns(cons_max)) / SR, 0.035)
            e['pre'] += e['pre_v']
        # layout in output time
        for k, e in enumerate(ev):
            if k:
                q = ev[k - 1]
                room = e['t'] - (q['t'] + q['dur']) + 0.35 * q['dur']
                e['pre'] = min(e['pre'], max(0.0, room))
            e['o'] = e['t'] - e['pre']
        for k, e in enumerate(ev):
            nxt = ev[k + 1] if k + 1 < len(ev) else None
            end = e['t'] + e['dur']
            e['leg'] = nxt is not None and nxt['t'] - end < legato
            e['e'] = end - (0.0 if e['leg'] else release)
            if nxt is not None:
                e['e'] = min(e['e'], nxt['o']) if not e['leg'] else nxt['o']
            e['e'] = max(e['e'], e['o'] + 0.03)
        # chunks of contiguous output
        chunks = [[ev[0]]]
        for e in ev[1:]:
            q = chunks[-1][-1]
            if q['leg'] and abs(e['o'] - q['e']) < 1e-6:
                chunks[-1].append(e)
            else:
                chunks.append([e])
        t_lo = min(e['o'] for e in ev) - 0.05
        t_hi = max(e['e'] for e in ev) + 0.05
        out = np.zeros(ns(t_hi - t_lo) + 16)
        recs = []
        n_line_last = {}
        for e in ev:
            n_line_last[e.get('line', '')] = e
        for ch in chunks:
            o0 = ch[0]['o']
            n_out = max(1, ns(ch[-1]['e'] - o0))
            ko, ki = [], []
            gk_t, gk_v = [], []
            scans = []
            for e in ch:
                a = ns(e['o'] - o0)
                b = ns(e['e'] - o0)
                L = b - a
                s0, s1, v0, v1, u = e['s0'], e['s1'], e['v0'], e['v1'], e['u']
                c_unv = u
                c_vc = max(0, v0 - (s0 + u))
                c_coda = max(0, s1 - v1)
                vowel = max(1, v1 - v0)
                # output lengths: unvoiced lead 1:1 (up to the pre-roll + 20 ms), voiced onset <= cons_max,
                # coda <= 150 ms and <= 35 % of the note; the vowel takes the rest (>= 35 % of the note)
                ou = min(c_unv, ns(e['pre'] - e['pre_v'] + 0.02)) if c_unv else 0
                ovc = min(c_vc, ns(cons_max))
                oco = min(c_coda, ns(0.15), int(0.35 * L))
                ov = L - ou - ovc - oco
                min_v = int(0.35 * L)
                if ov < min_v:
                    over = min_v - ov
                    tot = ou + ovc + oco
                    if tot > 0:
                        f = max(0.0, 1 - over / tot)
                        ou, ovc, oco = int(ou * f), int(ovc * f), int(oco * f)
                    ov = L - ou - ovc - oco
                p = a
                pts = [(p, s0)]
                p += ou
                pts.append((p, s0 + u))
                p += ovc
                pts.append((p, v0))
                va = min(ns(0.04), int(0.3 * vowel))
                vb = min(ns(0.03), int(0.2 * vowel))
                if ov > vowel and ov > va + vb + 4:
                    if e['vph'] in DIPHTHONGS:
                        # hold the nucleus, glide to the off-glide at the end of the note
                        vm = v0 + int(0.45 * vowel)
                        gl = v1 - vm
                        pts += [(p + va, v0 + va), (p + ov - gl, vm)]
                        if ov - gl - va > 1.6 * (vm - v0 - va) and vm - v0 - va > ns(0.012):
                            scans.append((int(p + va), v0 + va, int(p + ov - gl), vm))
                    else:
                        pts += [(p + va, v0 + va), (p + ov - vb, v1 - vb)]
                        if ov - va - vb > 1.6 * (vowel - va - vb) and vowel - va - vb > ns(0.012):
                            scans.append((int(p + va), v0 + va, int(p + ov - vb), v1 - vb))
                p += ov
                pts.append((p, v1))
                pts.append((b, s1))
                for po, pi in pts:
                    if ko and po <= ko[-1]:
                        po = ko[-1] + 1e-3
                    ko.append(po)
                    ki.append(pi)
                e['vowel_out'] = e['o'] + (a + ou + ovc - a) / SR
                # level: the vowel's rms in the source
                vr = rms(x[v0:v1]) if v1 > v0 else rms(x[s0:s1])
                g = level / (vr + 1e-9) * (weak if word_key(e['word']) in FUNCTION_WORDS else 1.0)
                gk_t += [a, b]
                gk_v += [g, g]
            warp = np.interp(np.arange(n_out), ko, ki)
            for (pa, qa, pb, qb) in scans:
                warp[pa:pb] = scan_segment(pb - pa, qa, qb, seed + pa)
            # melody (MIDI) over the chunk
            mel = np.zeros(n_out)
            for e in ch:
                a = ns(e['o'] - o0)
                b = ns(e['e'] - o0)
                mel[a:b] = e['m']
            mel[ns(ch[-1]['e'] - o0):] = ch[-1]['m']
            if glide > 0 and len(ch) > 1:
                al = np.exp(-1 / (glide * SR))
                mel, _ = signal.lfilter([1 - al], [1, -al], mel, zi=[mel[0] * al])
            tl = np.arange(n_out) / SR
            if scoop:
                mel -= scoop * np.exp(-tl / 0.05)
            for e in ch:
                a = ns(e['o'] - o0)
                b = ns(e['e'] - o0)
                u = (np.arange(a, b) - ns(e['t'] - o0)) / SR
                if e['dur'] >= 0.42 and vib:
                    mel[a:b] += vib * np.sin(2 * np.pi * vib_rate * u + r.uniform(0, 6.28)) * smoothstep((u - 0.18) / 0.25)
                last = n_line_last.get(e.get('line', '')) is e
                if fall and last and e.get('len', 0) >= fall_min_steps:
                    d0 = (e['e'] - o0) - 0.4
                    k = np.clip((tl[a:b] - d0) / 0.4, 0, 1)
                    mel[a:b] -= fall * k ** 1.7
            gain = np.interp(np.arange(n_out), gk_t, gk_v)
            gain = uniform_filter1d(gain, ns(0.012))
            y = psola(an, warp, hz(mel), gain=gain, growl=growl, jitter=jitter, seed=seed + len(recs))
            y = fades(y, 0.003, 0.03 if not ch[-1]['leg'] else 0.012)
            place(out, y, ns(o0 - t_lo))
            if measure:
                c_, f_, v_ = f0_track(y, fmin=50, fmax=1200)
                tc = o0 + c_ / SR
            for e in ch:
                rec = dict(syl=e['syl'], word=e['word'], line=e.get('line'), step=e.get('step'), midi=e['midi'],
                           t_note=round(e['t'], 4), start=round(e['o'], 4), vowel=round(e['vowel_out'], 4),
                           end=round(e['e'], 4))
                if measure:
                    a_ = e['vowel_out'] + 0.03
                    b_ = e['e'] - 0.03
                    if fall and e is n_line_last.get(e.get('line', '')) and e.get('len', 0) >= fall_min_steps:
                        b_ = min(b_, e['e'] - 0.42)
                    sel = (tc >= a_) & (tc <= b_) & v_
                    if sel.sum() >= 2:
                        err = 1200 * np.log2(f_[sel] / hz(e['m']))
                        rec['cents'] = round(float(np.median(err)), 1)
                recs.append(rec)
        return out, t_lo, recs


def scan_segment(n, q0, q1, seed=0, speed=0.55):
    """Input positions for a held vowel: instead of crawling through the steady part (each grain repeated many
    times: a frozen, buzzy vowel), sweep back and forth across it at ~`speed` x real time with eased turns,
    ending at q1, so the held vowel keeps the source's micro-variation."""
    if n <= 1:
        return np.full(max(n, 0), float(q1))
    span = float(q1 - q0)
    halves = max(1, int(round(speed * n / max(1.0, abs(span)))))
    if halves % 2 == 0:
        halves += 1
    ph = np.linspace(0, halves, n)
    k = np.floor(ph)
    fr = ph - k
    fr = 0.5 - 0.5 * np.cos(np.pi * fr)
    tri = np.where(k % 2 == 0, fr, 1 - fr)
    tri[-1] = 1.0
    return q0 + span * tri


def line_events(line, notes=None):
    """Score line -> Singer events (one per note/syllable). Falls back to one event per word (spoken on its step,
    held to the next word, default pitch E3) when the line has no notes yet."""
    words = line['words']
    out = []
    if notes is None:
        notes = line.get('notes')
    if notes:
        for k, (sy, step, L, midi) in enumerate(notes):
            wi = max((i for i, w in enumerate(words) if w[1] <= step + 1e-9), default=0)
            out.append(dict(t=tb(line['bar'], step), dur=L * STEP, midi=float(midi), syl=sy, word=words[wi][0], wi=wi,
                            line=line['id'], step=step, len=L, idx=k))
    else:
        for i, (w, step) in enumerate(words):
            nxt = words[i + 1][1] if i + 1 < len(words) else step + 6
            out.append(dict(t=tb(line['bar'], step), dur=(nxt - step) * STEP * 0.9, midi=52.0, syl=w, word=w, wi=i,
                            line=line['id'], step=step, len=nxt - step, idx=i))
    return out


# =====================================================================================================
# voice chains (mono in; mono or stereo out)
# =====================================================================================================

def megaphone(x, drive=3.0, crush=0.25, seed=0):
    """Vex's red megaphone: a cheap horn driver (band-pass ~400 Hz-3.5 kHz with horn resonances near 1.1 and
    2.3 kHz), an overdriven driver (asymmetric), a touch of bit-crush grit, a little metallic cone ring."""
    y = hp(x, 380, 4)
    y = lp(y, 3800, 4)
    y = eq(y, 'peak', 1100, 2.0, 4.0)
    y = eq(y, 'peak', 2300, 3.0, 5.0)
    pk = np.abs(y).max() + 1e-9
    y = softclip(y / pk * drive, 1.0, 0.12)
    if crush:
        y = (1 - crush) * y + crush * bitcrush(y, 9, 2)
    # cone ring: a short feedback comb
    d = int(0.0011 * SR)
    y = signal.lfilter([1.0], np.r_[1.0, np.zeros(d - 1), -0.22], y)
    y = bp(y, 420, 3500, 2)
    return y / (np.abs(y).max() + 1e-9)


def slap(x, time_s=0.095, gain=0.3, lp_f=3200.0, hp_f=500.0):
    """A single slapback echo (mono), band-limited."""
    d = ns(time_s)
    e = np.zeros_like(x)
    e[d:] = bp(x, hp_f, lp_f, 2)[:-d] * gain
    return e


def shout_chain(x, effort=1.0, drive=2.4, presence=5.0):
    """A shouted voice: no rumble, a strong 2.5 kHz presence, saturated, compressed."""
    y = hp(x, 140, 2)
    y = eq(y, 'peak', 2600, 1.0, presence)
    y = eq(y, 'peak', 350, 1.0, -3.0)
    y = eq(y, 'hs', 6500, 0.7, 2.0)
    pk = np.abs(y).max() + 1e-9
    y = sat(y / pk * drive * effort, 1.6)
    return y / (np.abs(y).max() + 1e-9)


def growl_chain(x, amount=0.5, seed=0):
    """Monster grit: a rough 30-45 Hz amplitude flutter (vocal-fold rattle), an under-octave rumble, drive."""
    n = len(x)
    t = tt(n)
    r = rng(seed)
    fl = 1.0 + 0.6 * amount * np.sin(2 * np.pi * (31 + 12 * r.random()) * t + 6 * uniform_filter1d(r.standard_normal(n), ns(0.03)))
    y = x * fl
    y = y + 0.35 * amount * lp(np.abs(x), 160, 2)          # rectified: a sub/fry thickening
    y = softclip(y / (np.abs(y).max() + 1e-9) * (1.5 + 2.5 * amount), 1.0, 0.1)
    return hp(y, 60, 2)


def radio_chain(x, seed=0, crackle=1.0, band=(330.0, 2900.0), hiss=0.004):
    """AM radio on a car dash: steep band-pass, a little tube warmth and drive, slow fading, crackle, hiss."""
    r = rng(seed)
    y = hp(x, band[0], 4)
    y = lp(y, band[1], 4)
    y = eq(y, 'peak', 480, 1.2, 3.0)          # warm
    y = eq(y, 'peak', 1900, 1.4, 2.5)         # the speaker's cone
    pk = np.abs(y).max() + 1e-9
    y = softclip(y / pk * 1.8, 1.0, 0.05)
    y = lp(hp(y, band[0] * 0.9, 4), band[1] * 1.1, 2)        # the speaker cannot reproduce what the drive adds
    n = len(y)
    t = tt(n)
    fade = 1.0 - 0.08 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.27 * t + r.uniform(0, 6))) \
        - 0.05 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.71 * t + r.uniform(0, 6)))
    y = y * fade
    # crackle: sparse clicks and short bursts
    ck = np.zeros(n)
    k = int(crackle * n / SR * 9)
    pos = r.integers(0, max(1, n - 200), k)
    ck[pos] = r.uniform(-1, 1, k) * r.uniform(0.05, 0.35, k) ** 2 * 3
    bursts = int(crackle * n / SR * 0.8)
    for _ in range(bursts):
        b0 = int(r.integers(0, max(1, n - ns(0.06))))
        bl = ns(r.uniform(0.01, 0.05))
        ck[b0:b0 + bl] += r.standard_normal(min(bl, n - b0)) * 0.03
    ck = bp(ck, 600, 5000, 2)
    hs = bp(noise(n, seed + 3), 400, 4000, 2) * hiss
    return y * 0.8 + ck + hs


def close_mic(x, proximity=4.0, air=2.0):
    """Dry, close and intimate: proximity bass, a touch of presence and air, gentle compression."""
    y = hp(x, 70, 2)
    y = eq(y, 'ls', 180, 0.7, proximity)
    y = eq(y, 'peak', 3000, 1.0, 2.0)
    y = eq(y, 'hs', 7000, 0.7, air)
    y = compressor(y / (np.abs(y).max() + 1e-9), -20, 3.0, 0.005, 0.12)
    return y / (np.abs(y).max() + 1e-9)


def distant(x, kind='night', mix=0.45, lp_f=4200.0):
    """Far away: air absorption (low-pass), less low end, a big wet space. Stereo out (with tail)."""
    y = lp(hp(x, 180, 2), lp_f, 2)
    return reverb(y, kind, mix=mix, pre_hp=250)


# =====================================================================================================
# the renderer: score -> stems
# =====================================================================================================

STEM_NAMES = ('lead', 'gang', 'zombies', 'lou', 'tiny', 'fx_vocal', 'roadie', 'fan', 'huh')
# suggested balance when the stems are summed at unity (active RMS, dBFS); the soundtrack mix sets the real gains
STEM_LEVEL_DB = {'lead': -17.0, 'gang': -20.0, 'zombies': -20.0, 'lou': -20.0, 'tiny': -18.0, 'fx_vocal': -21.0,
                 'roadie': -17.0, 'fan': -27.0, 'huh': -22.0}
# gang voices: (flite voice, octave, pan, detune cents)
GANG = [('awb', 0, -0.9, -6), ('kal16', 0, 0.9, 7), ('rms', 0, -0.5, 4), ('awb', -1, 0.5, -3),
        ('slt', 0, -0.7, 10), ('kal16', -1, 0.7, -8), ('rms', 0, -0.2, -12), ('kal', 0, 0.25, 12)]


class Renderer:
    def __init__(self, score, sr=SR, work_dir=None, strict=True, tape_stop=True, gate_gaps=True):
        if sr != SR:
            raise ValueError(f'ns_voices renders at {SR} Hz only (asked for {sr})')
        self.S = score
        self.work = Path(work_dir or '.')
        self.work.mkdir(parents=True, exist_ok=True)
        self.F = Flite(self.work)
        self.sg = Singer(self.F)
        self.rbdir = self.work / 'cache' / 'rb'
        self.rbdir.mkdir(parents=True, exist_ok=True)
        self.strict = strict
        self.tape_stop = tape_stop
        self.gate_gaps = gate_gaps
        self.n = ns(float(score.get('duration', DURATION)))
        self.stems = {}
        self.report = dict(version=VERSION, sung={}, spoken={}, fx=[], warnings=[], stems={})
        self.lines = {l['id']: l for l in score['vocals']['lines']}
        self.spoken = {l['id']: l for l in score['vocals']['spoken']}
        self.gaps = [(bt(g['fromBeat']), bt(g['toBeat'])) for g in score.get('gaps', [])]

    # ---- helpers
    def stem(self, name):
        if name not in self.stems:
            self.stems[name] = np.zeros((self.n, 2), F32)
        return self.stems[name]

    def put(self, name, x, t, gain=1.0, pan=0.0):
        buf = self.stem(name)
        x = np.asarray(x, float)
        if x.ndim == 1:
            x = stereo(x, pan)
        i0 = ns(t)
        a, b = max(0, i0), min(self.n, i0 + x.shape[0])
        if b > a:
            buf[a:b] += (gain * x[a - i0:b - i0]).astype(F32)

    def rb(self, x, tempo=1.0, pitch=1.0, formant='preserved'):
        return rubberband_raw(x, tempo, pitch, formant, self.rbdir)

    def hits(self, *types):
        out = []
        for h in self.S.get('hits', []):
            if h['type'] in types:
                every = h.get('every')
                if every:
                    b = h['beat']
                    while b < h.get('toBeat', b + 1e-9) - 1e-9:
                        out.append(dict(h, beat=b))
                        b += every
                else:
                    out.append(h)
        return out

    def sung_lines(self, pred):
        return [l for l in self.S['vocals']['lines'] if pred(l)]

    # ================================================================================================ lead
    def render_lead(self):
        log('lead (Vex)')
        for l in self.sung_lines(lambda l: 'vex' in l['singer']):
            ev = line_events(l)
            if not l.get('notes'):
                self.report['warnings'].append(f"{l['id']}: no notes yet; spoken on its steps at E3")
            chorus = l['part'] in ('chorus', 'lift', 'call')
            seed = 100 + int(l['bar'] * 7)
            vib = 0.24 if chorus else 0.18
            y, t0, recs = self.sg.sing(ev, 'awb', vib=vib, growl=0.04 if chorus else 0.02, jitter=0.003, seed=seed,
                                       fall=2.0, measure=True)
            self.report['sung'][l['id']] = dict(text=l['text'], fx=l['fx'], syllables=[
                [r['syl'], r['t_note'], r['vowel'], r['start']] for r in recs],
                pitch_cents=[r.get('cents') for r in recs])
            if l['fx'] == 'dry':
                self._lead_dry(ev, y, t0, seed)
            else:
                self._lead_megaphone(ev, y, t0, seed, chorus, l)
        sp = self.spoken.get('vex_goodnight')
        if sp:
            self._goodnight(sp)

    def _lead_megaphone(self, ev, y, t0, seed, chorus, line):
        lvl = 0.1
        main = megaphone(norm_active(y, lvl), drive=3.4 if chorus else 2.8, seed=seed)
        out = stereo(norm_active(main, lvl))
        sl = slap(mono(out), 0.095, 0.32)
        out += stereo(sl, 0.55)
        if chorus:
            # an octave-down double at -8 dB (rms, a darker voice) and a unison double (kal16) a hair late and detuned
            y8, t8, _ = self.sg.sing(ev, 'rms', octave=-1, vib=0.15, seed=seed + 1, time_jitter=0.006, fall=2.0)
            yu, tu, _ = self.sg.sing(ev, 'kal16', detune=9, vib=0.2, seed=seed + 2, time_jitter=0.012, fall=2.0)
            d8 = megaphone(norm_active(y8, lvl), drive=2.6, crush=0.15, seed=seed + 1)
            du = megaphone(norm_active(yu, lvl), drive=3.0, seed=seed + 2)
            d8 = norm_active(d8, lvl) * undb(-8)
            du = norm_active(du, lvl) * undb(-9)
            self.put('lead', d8, t8, pan=-0.25)
            self.put('lead', du, tu + 0.011, pan=0.3)
        else:
            yu, tu, _ = self.sg.sing(ev, 'awb', detune=-7, vib=0.15, seed=seed + 3, time_jitter=0.01, fall=2.0)
            du = megaphone(norm_active(yu, lvl), drive=2.8, seed=seed + 3)
            self.put('lead', norm_active(du, lvl) * undb(-13), tu + 0.009, pan=-0.35)
        self.put('lead', out, t0)

    def _lead_dry(self, ev, y, t0, seed):
        """v2c-v2d: Vex's own voice, no megaphone: close and dry, doubled by a whisper."""
        lvl = 0.1
        main = close_mic(norm_active(y, lvl))
        main = norm_active(main, lvl) * undb(1.0)
        self.put('lead', main, t0)
        yw, tw, _ = self.sg.sing(ev, 'awb', detune=-4, vib=0.1, seed=seed + 5, time_jitter=0.008)
        w = whisper(norm_active(yw, lvl), seed=seed)
        w = eq(hp(w, 300, 2), 'peak', 5000, 1.0, 3.0)
        w = norm_active(w, lvl) * undb(-7)
        self.put('lead', w, tw + 0.006, pan=0.4)
        self.put('lead', reverb(main, 'plate', mix=1.0, pre_hp=300) * 0.10, t0)

    def _goodnight(self, sp):
        """GOOD NIGHT!: shouted through the megaphone on its steps, NIGHT held and falling into the final hit."""
        b0 = sp['win'][0]
        t_line = bt(b0)
        ws = sp.get('words') or [['GOOD', 0], ['NIGHT!', 2]]
        t_end = bt(sp['win'][1])
        ev = []
        for i, (w, step) in enumerate(ws):
            t = t_line + step * STEP
            nxt = t_line + ws[i + 1][1] * STEP if i + 1 < len(ws) else t_end - 0.03
            ev.append(dict(t=t, dur=nxt - t - (0.02 if i + 1 < len(ws) else 0.0), midi=[57, 61][min(i, 1)], syl=w, word=w,
                           wi=i, line=sp['id'], step=step, len=4))
        y, t0, recs = self.sg.sing(ev, 'awb', vib=0.3, growl=0.15, seed=777, fall=5.0, fall_min_steps=0, scoop=1.2)
        main = megaphone(norm_active(y, 0.1), drive=4.0)
        main = norm_active(main, 0.1) * undb(1.5)
        y8, t8, _ = self.sg.sing(ev, 'rms', octave=-1, vib=0.2, seed=778, fall=5.0, fall_min_steps=0)
        d8 = norm_active(megaphone(norm_active(y8, 0.1), drive=3.0), 0.1) * undb(-8)
        out = stereo(main) + stereo(slap(main, 0.095, 0.32), 0.55)
        self.put('lead', out, t0)
        self.put('lead', d8, t8, pan=-0.2)
        self._spoken_report(sp, t_line, [(r['word'], r['vowel']) for r in recs], (t0, t0 + len(y) / SR), 1.0, 'awb')

    # ================================================================================================ gang
    def gang_items(self):
        """Every gang shout as (events, kind): whole gang lines, vex+gang lines, gangOn syllables (whole words), the
        zombies+gang response, and HEY! hits."""
        items = []
        for l in self.S['vocals']['lines']:
            ev = line_events(l)
            if l['singer'] in ('gang', 'vex+gang', 'zombies+gang'):
                items.append((ev, 'line' if l['singer'] != 'gang' else 'shout', l['id']))
            elif l.get('gangOn'):
                idx = set(l['gangOn'])
                wis = {ev[i]['wi'] for i in idx if i < len(ev)}
                sub = [e for e in ev if e['wi'] in wis]
                if sub:
                    items.append((sub, 'shout', l['id'] + ':gangOn'))
        for h in self.hits('gangHey'):
            m = midi_of(h.get('pitch', 'A3'))
            t = bt(h['beat'])
            items.append(([dict(t=t, dur=0.26, midi=float(m), syl='HEY', word='HEY!', wi=0, line=f"hey@{h['beat']}",
                                step=0, len=3)], 'hey', f"gangHey@{h['beat']}"))
        return items

    def render_gang(self):
        log('gang')
        for k, (ev, kind, iid) in enumerate(self.gang_items()):
            shout = kind in ('shout', 'hey')
            acc = None
            t_acc = None
            for v, (voice, octv, pan, cents) in enumerate(GANG):
                o = octv
                if voice == 'slt' and min(e['midi'] for e in ev) < 53:
                    o += 1                      # the woman in the gang shouts an octave up
                y, t0, recs = self.sg.sing(
                    ev, voice, octave=o, detune=cents, time_jitter=0.014, syl_jitter=0.006, vib=0.08, scoop=1.2,
                    fall=3.0 if shout else 1.5, fall_min_steps=0 if shout else 8, stretch=0.9, formant=0.8,
                    seed=1000 + 37 * k + v, release=0.03, cons_max=0.05)
                y = shout_chain(norm_active(y, 0.1), drive=2.6 if shout else 2.0)
                y = norm_active(y, 0.1) * (undb(-3) if o < 0 else 1.0)
                self.put('gang', y, t0, gain=1.0 / np.sqrt(len(GANG)) * 1.6, pan=pan)
                if v == 0:
                    self.report['sung'].setdefault('gang', {})[iid] = [[r['syl'], r['t_note'], r['vowel']] for r in recs]

    # ================================================================================================ zombies
    def crowd(self, ev, n_voices, stem, *, formant=-2.0, growl=0.12, spread=30, tj=0.03, sj=0.02, low_frac=0.25,
              young=0.0, seed=0, tail=0.0, tail_fall=5.0, pans=None, gain=1.0, effort=1.0, chain='zombie'):
        """A crowd singing/shouting the same syllables: n_voices flite voices, each detuned, loose in time, its
        formants shifted (negative = bigger, more monstrous), a fraction an octave down (low_frac) or up (young,
        human crowd only), spread across the stereo field. tail adds a falling groan tail (s) to the last syllable."""
        r = rng(seed)
        pool = ['awb', 'rms', 'kal16', 'awb', 'rms', 'kal', 'kal16', 'slt']
        acc = np.zeros((1, 2))
        start = None
        for v in range(n_voices):
            voice = pool[v % len(pool)]
            octv = 0
            if r.random() < low_frac:
                octv = -1
            if young and (voice == 'slt' or r.random() < young):
                voice = 'slt' if r.random() < 0.6 else 'kal16'
                octv = 1 if voice == 'kal16' or min(e['midi'] for e in ev) < 53 else 0
            evv = [dict(e) for e in ev]
            if tail > 0:
                evv[-1]['dur'] += tail * r.uniform(0.7, 1.2)
            y, t0, _ = self.sg.sing(evv, voice, octave=octv, detune=r.normal() * spread * 0.5, pitch_spread=spread,
                                    time_jitter=tj, syl_jitter=sj, formant=formant + r.uniform(-0.7, 0.7),
                                    growl=growl * r.uniform(0.6, 1.4), jitter=0.006 + 0.01 * growl, vib=0.12,
                                    scoop=0.8, fall=tail_fall if tail > 0 else 1.0, fall_min_steps=0 if tail > 0 else 8,
                                    stretch=r.uniform(0.85, 1.05), seed=seed * 131 + v, cons_max=0.06)
            if chain == 'zombie':
                y = growl_chain(norm_active(y, 0.1), amount=growl * 2.5, seed=seed + v)
                y = lp(y, 5200, 2)
            else:
                y = shout_chain(norm_active(y, 0.1), drive=1.8 * effort, presence=3.0)
            y = norm_active(y, 0.1) * (undb(-2) if octv < 0 else 1.0)
            pan = pans[v % len(pans)] if pans else r.uniform(-0.95, 0.95)
            ys = stereo(y, pan)
            if start is None:
                start = t0
            off = ns(t0 - start)
            if off < 0:
                acc = np.pad(acc, ((-off, 0), (0, 0)))
                start = t0
                off = 0
            if acc.shape[0] < off + ys.shape[0]:
                acc = np.pad(acc, ((0, off + ys.shape[0] - acc.shape[0]), (0, 0)))
            acc[off:off + ys.shape[0]] += ys
        acc = acc / np.sqrt(n_voices) * gain
        return acc, start

    def render_zombies(self):
        log('zombies (chant, responses)')
        plan = {  # id: voices, formant, growl, spread, tail
            'z1': (12, -2.0, 0.12, 28, 0.45), 'z2': (16, -2.0, 0.12, 30, 0.45), 'z3': (20, -2.0, 0.1, 30, 0.35),
        }
        for k, l in enumerate(self.sung_lines(lambda l: l['singer'].startswith('zombies'))):
            ev = line_events(l)
            if l['fx'] == 'choir':
                nv, fm, gr, sp, tail = plan.get(l['id'], (14, -2.0, 0.12, 30, 0.4))
                # punchy: every word but the last clipped short (a chant, not a choir), the groan tail only on
                # the line's last SONG
                ev = [dict(e, dur=e['dur'] * (0.8 if i + 1 < len(ev) else 1.0)) for i, e in enumerate(ev)]
                y, t0 = self.crowd(ev, nv, 'zombies', formant=fm, growl=gr, spread=sp, tj=0.018, sj=0.01,
                                   low_frac=0.3, seed=500 + k, tail=tail, tail_fall=5.0)
                y = y + wet(mono(y), 'theatre', pre_hp=250)[:len(y)] * 0.2
            else:
                # the call and response: a real gig crowd, nearly human (-1 st formant / 0)
                nv = 24 if l['id'] == 'r2' else 30
                y, t0 = self.crowd(ev, nv, 'zombies', formant=-0.6, growl=0.02, spread=40, tj=0.035, sj=0.02,
                                   low_frac=0.12, young=0.3, seed=600 + k, chain='shout', effort=1.1)
                y = y + wet(mono(y), 'arena', pre_hp=250)[:len(y)] * 0.4
            self.put('zombies', y, t0)
            if l['id'] == 'z1' and len(ev) >= 3:
                # the comic beat: one zombie still learning the words, a beat late and a third too high: "...SONG!"
                late = [dict(ev[-1], t=ev[-1]['t'] + 0.34, dur=0.38, midi=ev[-1]['midi'] + 4, wi=0)]
                ys, ts, _ = self.sg.sing(late, 'kal', formant=-1.0, growl=0.1, scoop=2.5, fall=4.0, fall_min_steps=0,
                                         vib=0.4, seed=555)
                ys = growl_chain(norm_active(ys, 0.1), 0.25, seed=555)
                self.put('zombies', norm_active(ys, 0.1) * undb(-4), ts, pan=0.55)
                self.report['fx'].append(dict(type='chantStraggler', t=round(ts, 3)))
            self.report['sung'][l['id']] = dict(text=l['text'], fx=l['fx'], voices=nv, syllables=[
                [e['syl'], round(e['t'], 4)] for e in ev])
        # WOO!s after r4: a few young voices whooping into the ending
        r4 = self.lines.get('r4')
        if r4:
            r = rng(77)
            t_end = tb(r4['bar'] + 1)
            for i in range(7):
                t = t_end - 0.55 + r.uniform(0, 0.9)
                voice = ['slt', 'kal16', 'awb', 'slt', 'kal16', 'slt', 'awb'][i]
                base = {'slt': 76, 'kal16': 69, 'awb': 64}[voice] + r.uniform(-2, 3)
                ev = [dict(t=t, dur=r.uniform(0.35, 0.6), midi=base, syl='WOO', word='woo!', wi=0, line='woo', step=0,
                           len=5)]
                y, t0, _ = self.sg.sing(ev, voice, vib=0.6, vib_rate=6.5, scoop=3.0, fall=7.0, fall_min_steps=0,
                                        seed=900 + i, release=0.01)
                y = shout_chain(norm_active(y, 0.1), drive=1.6, presence=3.0)
                y = reverb(y, 'arena', mix=0.35)
                self.put('zombies', norm_active(y, 0.1) * undb(-6), t0, pan=r.uniform(-0.9, 0.9))
            self.report['fx'].append(dict(type='woo', t=round(t_end - 0.55, 3), n=7))

    # ================================================================================================ spoken
    def _spoken_report(self, sp, t_line, word_times, span, tempo, voice, fit='ok', extra=None):
        """word_times: [(display word, absolute perceived onset s)]; span: (audio start, audio end) absolute."""
        rec = dict(text=sp['text'], voice=voice, t0=round(t_line, 4), win=sp['win'],
                   win_s=[round(bt(sp['win'][0]), 4), round(bt(sp['win'][1]), 4)],
                   dur=round(span[1] - t_line, 4), start=round(span[0], 4), end=round(span[1], 4),
                   words=[[w, round(max(0.0, t - t_line), 4)] for w, t in word_times], tempo=round(tempo, 4), fit=fit)
        if extra:
            rec.update(extra)
        self.report['spoken'][sp['id']] = rec
        return rec

    def _fail_fit(self, sp, msg):
        full = f"{sp['id']}: {msg}"
        if self.strict:
            self._fit_errors.append(full)
        else:
            self.report['warnings'].append('forced fit: ' + full)

    @staticmethod
    def _subtokens(text):
        out = []
        for i, w in enumerate(text.split()):
            parts = [p for p in re.split(r"[-.]", w) if re.sub(r"[^\w]", '', p)]
            for p in parts or [w]:
                out.append((i, re.sub(r"[^a-z0-9]", '', p.lower())))
        return out

    def display_word_onsets(self, display, flite_text, fwords, t_shift=0.0):
        """Map flite's utterance words (name, t0) onto the display text's words. Returns [(word, t0 + t_shift)]."""
        disp = display.split()
        ft = self._subtokens(flite_text)
        # utterance words -> flite-text sub-tokens by letter offsets
        letters = ''.join(t for _, t in ft)
        starts = np.cumsum([0] + [len(t) for _, t in ft])
        tok_t = [None] * len(ft)
        pos = 0
        for w in fwords:
            name = re.sub(r"[^a-z0-9]", '', w['name'].lower())
            if not name:
                continue
            j = letters.find(name, pos)
            if j < 0:
                j = pos
            k = int(np.searchsorted(starts, j, side='right') - 1)
            k = min(max(k, 0), len(ft) - 1)
            if tok_t[k] is None:
                tok_t[k] = w['t0']
            pos = j + len(name)
        # fill holes by interpolation
        known = [i for i, v in enumerate(tok_t) if v is not None]
        for i in range(len(tok_t)):
            if tok_t[i] is None:
                tok_t[i] = float(np.interp(i, known, [tok_t[k] for k in known])) if known else 0.0
        ds = self._subtokens(display)
        out = []
        if len(ds) == len(ft):
            first = {}
            for (wi, _), t in zip(ds, tok_t):
                first.setdefault(wi, t)
            out = [(w, first.get(i, 0.0) + t_shift) for i, w in enumerate(disp)]
        else:   # proportional by letters
            dl = np.cumsum([0] + [len(re.sub(r"[^\w]", '', w)) for w in disp], dtype=float)
            dl /= max(1.0, dl[-1])
            fl = np.cumsum([0] + [len(t) for _, t in ft], dtype=float)
            fl /= max(1.0, fl[-1])
            for i, w in enumerate(disp):
                k = int(np.clip(np.searchsorted(fl, dl[i] + 1e-9, side='right') - 1, 0, len(ft) - 1))
                out.append((w, tok_t[k] + t_shift))
        return out

    def fit_speech(self, sp, voice, pref_stretch=1.0, margin=0.03, max_speed=1.1, min_speed=0.85):
        """Synthesise a whole spoken line with flite, time-fitted into its window: the preferred pace
        (pref_stretch, > 1 = slower), within speed 0.85x-1.1x of flite's natural reading (via flite's own
        duration_stretch), trailing silence trimmed. Returns (audio, flite result, stretch, fit)."""
        text = sp.get('flite') or sp['text']
        W = bt(sp['win'][1]) - bt(sp['win'][0]) - margin

        def D(s):
            r = self.F.synth(text, voice, s)
            a, b = trim_span(r['x'], -42)
            return (b - a) / SR, r, a, b
        d1, _, _, _ = D(1.0)
        s_lo, s_hi = 1.0 / max_speed, 1.0 / min_speed
        target = min(W, d1 * pref_stretch)
        fit = 'ok'
        if d1 * s_lo > W + 1e-6:
            need = d1 / W
            msg = (f'natural {d1:.2f} s (flite {voice}), window {W + margin:.2f} s: needs {need:.2f}x speed (max '
                   f'{max_speed}x); at {max_speed}x it ends at beat {sp["win"][0] + (d1 * s_lo + margin) / BEAT:.2f}')
            self._fail_fit(sp, msg)
            fit = 'forced'
            target = W
        s = float(np.clip(target / d1, s_lo if fit == 'ok' else 0.3, s_hi))
        for _ in range(6):
            d, r, a, b = D(s)
            if abs(d - target) < 0.008:
                break
            s = float(np.clip(s * target / d, s_lo * 0.97 if fit == 'ok' else 0.3, s_hi))
        d, r, a, b = D(s)
        x = r['x'][a:b + ns(0.01)].astype(float)
        if d > W + 1e-3:          # flite's stretch is not exactly linear: rubberband the last few percent
            x = self.rb(x, tempo=d / W)
            r = dict(r, words=[dict(w, t0=a / SR + (w['t0'] - a / SR) * W / d) for w in r['words']])
        return fades(x, 0.002, 0.02), r, s, fit, a / SR, d1

    # ---- Lou
    def lou_voice(self, sp, seed, chain='radio'):
        """Lou: flite rms at a slower, unhurried pace, lowered a little (tape-slow timbre), a felt sub-octave
        shadow under him, then the AM radio (or, for the 1987 tape, dry and close)."""
        x, r, s, fit, a_s, d1 = self.fit_speech(sp, 'rms', pref_stretch=1.14)
        low = self.rb(x, 1.0, 2 ** (-1.3 / 12), 'shifted')
        low = pad_to(low, len(x))
        shadow = pad_to(self.rb(x, 1.0, 0.5, 'shifted'), len(x))
        shadow = lp(shadow, 700, 2)
        y = norm_active(low, 0.1) + norm_active(shadow, 0.1) * undb(-20 if chain == 'radio' else -24)
        y = eq(y, 'ls', 200, 0.7, 3.0)
        y = compressor(y / (np.abs(y).max() + 1e-9), -22, 2.5, 0.006, 0.15)
        if chain == 'radio':
            y = radio_chain(y, seed=seed, crackle=1.0)
            y = np.pad(y, (0, ns(0.12)))
            y = y + delay_line(bp(y, 500, 2500, 2), 0.06, 0.08)          # a dash-board reflection
        else:
            y = close_mic(y, proximity=5.0, air=1.0)
        words = self.display_word_onsets(sp['text'], sp.get('flite') or sp['text'], r['words'], -a_s)
        return norm_active(y, 0.1), words, 1.0 / s, fit, d1, len(x) / SR

    def render_lou(self):
        log('Lou')
        takes = {}
        for sp in self.S['vocals']['spoken']:
            if sp['voice'] != 'lou':
                continue
            t_line = bt(sp['win'][0])
            src = sp.get('take')
            if src and src in takes:
                y, words, tempo, fit, dur = takes[src]
                if dur > bt(sp['win'][1]) - t_line + 1e-3:
                    self._fail_fit(sp, f'take {src} ({dur:.2f} s) is longer than this window')
                extra = dict(take=src)
            else:
                y, words, tempo, fit, d1, dur = self.lou_voice(sp, seed=sum(map(ord, sp['id'])) % 1000)
                takes[sp['id']] = (y, words, tempo, fit, dur)
                extra = dict(natural=round(d1, 3))
            self.put('lou', y, t_line)
            self._spoken_report(sp, t_line, [(w, t_line + t) for w, t in words], (t_line, t_line + dur),
                                tempo, 'rms', fit, extra)

    # ---- Tiny's count-in
    def render_tiny(self):
        sp = self.spoken.get('tiny_count')
        if not sp:
            return
        log('Tiny')
        t_line = bt(sp['win'][0])
        t_end = bt(sp['win'][1])
        ws = sp.get('words') or [[w, 4 * i] for i, w in enumerate(sp['text'].split())]
        pitches = [45, 45, 47, 50]          # A2 A2 B2 D3: rising with the excitement
        word_times = []
        a0, a1 = None, None
        for i, (w, step) in enumerate(ws):
            t = t_line + step * STEP
            nxt = t_line + ws[i + 1][1] * STEP if i + 1 < len(ws) else t_end
            slot = nxt - t
            r = self.F.synth(spell(w), 'rms', 1.0)
            a, b = trim_span(r['x'], -40)
            d = (b - a) / SR
            cons = sum(p1 - p0 for (ph, p0, p1, wi_, si_, wn) in r['phones'] if wi_ >= 0 and ph not in VOWELS)
            if cons / 1.1 > slot - 0.04:      # a beat-locked shout: its vowel is sung to length, its consonants not
                self._fail_fit(sp, f'"{w}": its consonants alone ({cons:.2f} s) overrun a {slot:.2f} s slot')
            dur = min(slot * 0.8, max(0.2, d * 0.95))
            ev = [dict(t=t, dur=dur, midi=float(pitches[min(i, 3)]), syl=w, word=w, wi=0, line='tiny', step=step, len=4)]
            y, t0, recs = self.sg.sing(ev, 'rms', vib=0.0, scoop=2.0, fall=4.0, fall_min_steps=0, formant=-2.0,
                                       growl=0.1, seed=300 + i, stretch=0.9, cons_max=0.05)
            y8, t8, _ = self.sg.sing(ev, 'rms', octave=-1, vib=0.0, scoop=1.0, fall=4.0, fall_min_steps=0, formant=-3.0,
                                     seed=310 + i, stretch=0.9, cons_max=0.05)
            y = shout_chain(norm_active(y, 0.1), drive=2.2, presence=4.0)
            y8 = lp(norm_active(y8, 0.1), 1800, 2) * undb(-8)
            mix = norm_active(y, 0.1) + pad_to(np.pad(y8, (max(0, ns(t8 - t0)), 0)), len(y))
            mix = reverb(mix, 'small', mix=0.18, pre_hp=200)
            self.put('tiny', mix, t0)
            word_times.append((w, recs[0]['t_note']))
            a0 = t0 if a0 is None else a0
            a1 = t0 + len(y) / SR
        self._spoken_report(sp, t_line, word_times, (a0, a1), 1.0, 'rms')

    # ---- the blackout groan
    def render_groan(self):
        sp = self.spoken.get('groan')
        if not sp:
            return
        log('groan')
        t_line = bt(sp['win'][0])
        t_end = bt(sp['win'][1])
        bar_t = tb(sp['bar'], sp.get('beat', 0) * 4)
        ws = sp.get('words') or [['one...', 0], ['more...', 10]]
        ev = []
        for i, (w, step) in enumerate(ws):
            t = bar_t + step * STEP
            nxt = bar_t + ws[i + 1][1] * STEP if i + 1 < len(ws) else t_end
            ev.append(dict(t=t, dur=(nxt - t) * (0.9 if i + 1 < len(ws) else 0.86), midi=[41.0, 39.0][min(i, 1)], syl=w,
                           word=w.strip('.'), wi=i, line='groan', step=step, len=4))
        # a crowd groaning in the dark: -5 st pitch, -3 st formants, dry
        y, t0 = self.crowd(ev, 12, 'fx_vocal', formant=-3.0, growl=0.18, spread=70, tj=0.05, sj=0.04, low_frac=0.2,
                           seed=444, tail=0.0)
        n_max = ns(t_end + 0.02 - t0)
        y = fades(y[:n_max], 0.01, 0.12)
        if t0 < t_line - 0.06:
            cut = ns(t_line - 0.06 - t0)
            y = fades(y[cut:], 0.04, 0.0)
            t0 = t_line - 0.06
        y = y + wet(mono(y), 'room', pre_hp=300)[:len(y)] * 0.12
        self.put('fx_vocal', norm_active(y, 0.1), t0)
        self._spoken_report(sp, t_line, [(w, e['t']) for w, e in zip([w for w, _ in ws], ev)],
                            (t0, t0 + len(y) / SR), 1.0, 'crowd')

    # ---- the Roadie's mic check
    def render_roadie(self):
        sp = self.spoken.get('roadie_check')
        if not sp:
            return
        log('Roadie')
        t_line = bt(sp['win'][0])
        t_end = bt(sp['win'][1])
        words = [w for w in sp['text'].split()]
        nat = []
        for w in words:
            r = self.F.synth(spell(w.strip('.')), 'rms', 1.0)
            a, b = trim_span(r['x'], -38)
            nat.append((b - a) / SR)
        W = t_end - t_line - 0.02
        tot = sum(nat)
        pause = 0.0
        speed_ = 1.0
        if tot / 1.1 > W:
            self._fail_fit(sp, f'natural {tot:.2f} s of words (no pauses) in a {W:.2f} s window')
            speed_ = tot / W
        else:
            speed_ = max(1.0 / 1.0, tot / (W * 0.9)) if tot > W * 0.9 else 1.0
            pause = max(0.0, (W - tot / speed_) / max(1, len(words) - 1))
        t = t_line
        word_times = []
        acc_start = None
        for i, w in enumerate(words):
            d = nat[i] / speed_
            ev = [dict(t=t, dur=d, midi=[38.0, 38.0, 36.0][min(i, 2)], syl=w, word=w.strip('.'), wi=0, line='roadie',
                        step=0, len=4)]
            y, t0, recs = self.sg.sing(ev, 'rms', vib=0.0, scoop=0.5, fall=1.5, fall_min_steps=0, formant=-5.0,
                                       growl=0.22, jitter=0.012, seed=1300 + i, stretch=1.0 / speed_, cons_max=0.06)
            y = growl_chain(norm_active(y, 0.1), amount=0.35, seed=1300 + i)
            y = eq(lp(y, 4200, 2), 'ls', 150, 0.7, 5.0)
            # breath fogging after the word: a low, slow exhale
            nb = ns(0.22)
            br = bp(noise(nb, 1400 + i), 300, 1600, 2) * np.hanning(2 * nb)[nb:] ** 1.5 * 0.05
            y = np.concatenate([y, np.zeros(nb // 2)])
            y[-nb:] += br[:len(y[-nb:])] if len(y) >= nb else 0
            self.put('roadie', norm_active(y, 0.1), t0)
            word_times.append((w, recs[0]['t_note']))
            acc_start = t0 if acc_start is None else acc_start
            t += d + pause
        room = wet(mono(self.stem('roadie')[ns(t_line - 0.2):ns(t_end + 0.8)]), 'theatre', pre_hp=150)
        self.put('roadie', room[:ns(1.0 + 2.0)] * 0.18, t_line - 0.2)
        self._spoken_report(sp, t_line, word_times, (acc_start, t), speed_, 'rms',
                            'forced' if speed_ > 1.1 else 'ok')

    # ---- the fan in the coda
    def render_fan(self):
        sp = self.spoken.get('fan')
        if not sp:
            return
        log('fan')
        t_line = bt(sp['win'][0])
        x, r, s, fit, a_s, d1 = self.fit_speech(sp, 'slt', pref_stretch=1.0)
        # young and warm: a little higher and brighter with excitement, otherwise untouched
        an = analyse(x)
        # an excited shout up to the roof: ONE high, more a little lower, SONG! leaps up and falls away
        n = len(x)
        tw = [w['t0'] - a_s for w in r['words']] + [n / SR]
        pts = [(0.0, 64.0)]
        if len(tw) >= 4:
            pts = [(0.0, 63.0), (tw[0] + 0.12, 63.5), (tw[1], 61.0), (tw[2] - 0.02, 61.5), (tw[2] + 0.12, 66.5),
                   (tw[2] + 0.3, 66.0), (n / SR, 61.0)]
        mel = np.interp(np.arange(n) / SR, [p_[0] for p_ in pts], [p_[1] for p_ in pts])
        mel += 0.25 * np.sin(2 * np.pi * 5.5 * np.arange(n) / SR) * smoothstep((np.arange(n) / SR - tw[-2] - 0.2) / 0.2)
        y = psola(an, np.arange(n, dtype=float), hz(mel))
        y = eq(y, 'peak', 2800, 1.0, 3.0)
        y = distant(norm_active(y, 0.1), 'night', mix=0.32, lp_f=4800)
        self.put('fan', norm_active(y, 0.1), t_line)
        words = self.display_word_onsets(sp['text'], sp.get('flite') or sp['text'], r['words'], -a_s)
        self._spoken_report(sp, t_line, [(w, t_line + t) for w, t in words], (t_line, t_line + len(x) / SR), 1.0 / s,
                            'slt', fit)

    # ================================================================================================ fx voices
    def _gasp(self, dur, seed, pulses=3, level=0.05):
        """A ragged inhalation: band-passed noise in `pulses` spasms, its formant rising."""
        n = ns(dur)
        r = rng(seed)
        t = tt(n)
        env = np.zeros(n)
        for k in range(pulses):
            c = (k + 0.5) / pulses * dur + r.uniform(-0.02, 0.02)
            w = dur / pulses * 0.45
            env += np.exp(-0.5 * ((t - c) / (w * 0.45)) ** 2) * (0.6 + 0.4 * k / max(1, pulses - 1))
        fc = 900 + 1700 * t / dur
        y = tvf(noise(n, seed), 'bp', fc, q=2.5, block=64) + 0.4 * tvf(noise(n, seed + 1), 'bp', fc * 2.1, q=3, block=64)
        return y * env * level / (rms(y * env) + 1e-9)

    def _cry(self, word, t, dur, f_start, f_end, seed, quiver=0.9, breaks=1, breath=0.55, voice='slt'):
        """A crying syllable: slt's word, pitch falling from f_start to f_end (Hz) with an irregular 6-9 Hz quiver
        and sudden upward breaks, breathy (part whisper). Returns (mono, t0)."""
        r = rng(seed)
        ev = [dict(t=t, dur=dur, midi=69 + 12 * np.log2(f_start / 440.0), syl=word, word=word, wi=0, line='sob', step=0,
                   len=int(dur / STEP))]
        y, t0, _ = self.sg.sing(ev, voice, vib=0.0, scoop=0.0, fall=0.0, seed=seed, f0_src=f_start * 0.8,
                                src_override=None, release=0.01)
        # re-tune with the crying contour
        an = analyse(y)
        n = len(y)
        u = np.arange(n) / SR
        m0 = 69 + 12 * np.log2(f_start / 440.0)
        m1 = 69 + 12 * np.log2(f_end / 440.0)
        mel = m0 + (m1 - m0) * smoothstep(u / max(0.05, u[-1]))
        rate = 6.0 + 3.0 * uniform_filter1d(r.standard_normal(n), ns(0.1)) * 4
        ph = np.cumsum(2 * np.pi * np.clip(rate, 4, 11) / SR)
        mel += quiver * np.sin(ph) * (0.6 + 0.4 * np.abs(uniform_filter1d(r.standard_normal(n), ns(0.08)) * 8))
        for _ in range(breaks):
            b0 = r.uniform(0.2, 0.8) * u[-1]
            mel += 3.0 * smoothstep((u - b0) / 0.015) * (1 - smoothstep((u - b0 - 0.08) / 0.03))
        z = psola(an, np.arange(n, dtype=float), hz(mel), jitter=0.015, seed=seed)
        z = (1 - breath) * z + breath * whisper(z, seed)
        if dur > 0.3:   # blubbering: the breath catches in irregular pulses
            ph = np.cumsum(2 * np.pi * (5.2 + 1.5 * np.abs(uniform_filter1d(r.standard_normal(n), ns(0.12)) * 6)) / SR)
            z = z * (1 - 0.45 * (0.5 + 0.5 * np.sin(ph)) * smoothstep(u / 0.15))
        return z, t0

    def scream_chain(self, y, seed):
        """An ear-splitting shriek: rasp (part whisper, part band noise riding the envelope), a wide-open 3 kHz
        resonance, hard drive."""
        y = norm_active(y, 0.1)
        env = uniform_filter1d(np.abs(y), ns(0.01))
        rasp = bp(noise(len(y), seed), 1800, 5200, 2) * env * 1.4
        z = 0.7 * y + 0.35 * whisper(y, seed) + rasp
        z = hp(z, 350, 2)
        z = eq(z, 'peak', 3100, 1.4, 9.0)
        z = eq(z, 'peak', 1500, 1.0, 3.0)
        z = softclip(z / (np.abs(z).max() + 1e-9) * 7.0, 1.0, 0.15)
        return lp(z, 9000, 2)

    def render_groupie(self):
        sob = self.hits('groupieSob')
        if sob:
            log('Groupie sobs')
            h = sob[0]
            T0, T1 = bt(h['beat']), bt(h.get('toBeat', h['beat'] + 12))
            span = T1 - T0
            out = np.zeros(ns(span + 1.5))
            r = rng(28)
            # (time, kind, args): a fan sobbing at a vigil, building to the startle
            plan = [(0.00, 'gasp', 0.32, 3), (0.36, 'catch', 3), (0.86, 'cry', 'oh', 0.62, 470, 340),
                    (1.55, 'gasp', 0.25, 2), (1.85, 'cry', 'vex', 0.5, 440, 370), (2.42, 'catch', 2),
                    (2.75, 'sniff',), (3.0, 'gasp', 0.3, 3), (3.35, 'cry', 'why', 0.65, 510, 330),
                    (4.05, 'catch', 3), (span - 0.24, 'gasp', 0.2, 1)]
            k = 0
            for item in plan:
                t, kind = item[0], item[1]
                if t >= span:
                    continue
                if kind == 'gasp':
                    place(out, self._gasp(item[2], 2800 + k, item[3], 0.035), t)
                elif kind == 'sniff':
                    nn = ns(0.13)
                    y = bp(noise(nn, 2900 + k), 2000, 6000, 2) * np.hanning(nn) * 0.02
                    place(out, y, t)
                elif kind == 'catch':
                    for j in range(item[2]):
                        z, _ = self._cry('huh', 0.0, 0.11, 360 + 40 * j, 420 + 40 * j, 3000 + 10 * k + j, quiver=0.3,
                                         breaks=0, breath=0.6)
                        place(out, norm_active(z, 0.06), t + j * 0.15)
                else:
                    z, _ = self._cry(item[2], 0.0, item[3], item[4], item[5], 3100 + k)
                    place(out, norm_active(z, 0.08), t)
                k += 1
            out = lp(out, 7000, 2)
            y = reverb(out, 'alley', mix=0.28, pre_hp=250)
            self.put('fx_vocal', norm_active(y, 0.1) * undb(-3), T0, pan=0.15)
            self.report['fx'].append(dict(type='groupieSob', t=round(T0, 3), t1=round(T1, 3)))
        sh = self.hits('groupieShriek')
        if sh:
            log('Groupie shriek')
            t = bt(sh[0]['beat'])
            # VEEEX!!! (an ear-splitting scream with a monster under it), then SIGN IT AGAIN!!!
            ev = [dict(t=t, dur=0.74, midi=81.0, syl='VEX', word='vex!', wi=0, line='shriek', step=0, len=7)]
            y, t0, _ = self.sg.sing(ev, 'slt', vib=1.0, vib_rate=7.8, scoop=7.0, fall=4.0, fall_min_steps=0,
                                    formant=3.0, jitter=0.03, growl=0.2, seed=4100, cons_max=0.04, release=0.01)
            y = self.scream_chain(y, 4100)
            ev2 = [dict(t=t + 0.84 + o, dur=d, midi=m, syl=w, word=wd, wi=i, line='shriek2', step=0, len=2)
                   for (w, wd, i, o, d, m) in [('SIGN', 'sign', 0, 0.0, 0.16, 79.0), ('IT', 'it', 1, 0.17, 0.1, 79.0),
                                                ('A', 'again', 2, 0.29, 0.09, 80.0), ('GAIN', 'again', 2, 0.39, 0.42, 82.0)]]
            y2, t2, _ = self.sg.sing(ev2, 'slt', vib=0.8, vib_rate=7.2, scoop=3.0, fall=5.0, fall_min_steps=0,
                                     formant=3.0, jitter=0.03, growl=0.15, seed=4101, cons_max=0.04)
            y2 = self.scream_chain(y2, 4101)
            # the monster underneath: -7 st, formants -4, growl
            m_ev = [dict(e, midi=e['midi'] - 31) for e in ev]
            ym, tm, _ = self.sg.sing(m_ev, 'awb', vib=0.3, scoop=1.0, fall=6.0, fall_min_steps=0, formant=-4.0,
                                     growl=0.45, jitter=0.02, seed=4102)
            ym = growl_chain(norm_active(ym, 0.1), 0.8, seed=4102)
            acc = np.zeros(ns(2.2))
            place(acc, norm_active(y, 0.1), t0 - t)
            place(acc, norm_active(y2, 0.1) * undb(-1.5), t2 - t)
            place(acc, norm_active(ym, 0.1) * undb(-6), tm - t)
            acc = reverb(acc, 'alley', mix=0.3, pre_hp=300)
            self.put('fx_vocal', norm_active(acc, 0.1) * undb(3), t + min(0.0, t0 - t, tm - t))
            self.report['fx'].append(dict(type='groupieShriek', t=round(t, 3), words='VEX!!! SIGN IT AGAIN!!!',
                                          sign_at=round(t2, 3)))

    def render_roar(self):
        hs = self.hits('hordeRoar')
        if not hs:
            return
        log('horde roar')
        words = ['raah', 'argh', 'uh', 'graah', 'aah', 'ohh', 'urgh', 'bra']
        for hi, h in enumerate(hs):
            T0, T1 = bt(h['beat']), bt(h.get('toBeat', h['beat'] + 4))
            span = T1 - T0
            r = rng(600 + hi)
            nv = 26 if span > 2 else 18
            acc = np.zeros((ns(span + 1.2), 2))
            for v in range(nv):
                voice = ['awb', 'rms', 'kal16', 'kal', 'awb', 'rms', 'slt'][v % 7]
                st = r.uniform(0, 0.55) * span
                d = span - st + r.uniform(0.05, 0.3)
                nat = {'awb': 47, 'rms': 44, 'kal16': 43, 'kal': 43, 'slt': 53}[voice]
                m = nat - 7 + r.uniform(-2.5, 2.5)
                w = words[int(r.integers(0, len(words)))]
                ev = [dict(t=st, dur=d, midi=m, syl=w, word=w, wi=0, line='roar', step=0, len=8)]
                y, t0, _ = self.sg.sing(ev, voice, vib=0.5, vib_rate=r.uniform(3, 6), scoop=-2.0, fall=r.uniform(2, 6),
                                        fall_min_steps=0, formant=-4.0 + r.uniform(-1, 1), growl=0.4, jitter=0.02,
                                        seed=6000 + 50 * hi + v, release=0.05)
                y = growl_chain(norm_active(y, 0.1), 0.9, seed=6000 + v)
                k = np.clip((np.arange(len(y)) / SR + t0) / span, 0, 1)
                y = y * (0.15 + 0.85 * k ** 1.6)          # each voice swells toward the end
                place(acc, stereo(norm_active(y, 0.1), r.uniform(-1, 1)), max(0.0, t0))
            # the crowd's breath/noise bed under the voices
            nb = ns(span + 0.6)
            bed = lp(noise(nb, 650 + hi), 900, 2) * np.linspace(0.1, 1, nb) ** 2
            place(acc, stereo(norm_active(bed, 0.1) * undb(-10)), 0.0)
            acc = fades(acc, 0.05, 0.4)
            acc = acc + wet(mono(acc), 'street', pre_hp=200)[:len(acc)] * 0.3
            acc = lp(acc, 6000, 2)
            self.put('fx_vocal', norm_active(acc, 0.1) * undb(1), T0)
            self.report['fx'].append(dict(type='hordeRoar', t=round(T0, 3), t1=round(T1, 3), voices=nv))

    def render_huh(self):
        hs = self.hits('crowdHuh', 'zombieHuh')
        if not hs:
            return
        log('huh')
        for hi, h in enumerate(hs):
            t = bt(h['beat'])
            if h['type'] == 'crowdHuh':
                ev = [dict(t=t, dur=0.16, midi=42.0, syl='HUH', word='huh', wi=0, line='huh', step=0, len=2)]
                y, t0 = self.crowd(ev, 16, 'huh', formant=-3.0, growl=0.15, spread=60, tj=0.012, sj=0.0, low_frac=0.3,
                                   seed=7000 + hi)
                y = y + wet(mono(y), 'theatre', pre_hp=250)[:len(y)] * 0.25
                self.put('huh', norm_active(y, 0.1), t0)
            else:
                ev = [dict(t=t, dur=0.32, midi=40.0, syl='HUH', word='huh', wi=0, line='huh?', step=0, len=3)]
                y, t0, _ = self.sg.sing(ev, 'rms', vib=0.0, scoop=0.0, fall=-6.0, fall_min_steps=0, formant=-3.0,
                                        growl=0.2, seed=7100 + hi)
                y = growl_chain(norm_active(y, 0.1), 0.4, seed=7100)
                y = reverb(y, 'theatre', mix=0.3, pre_hp=250)
                self.put('huh', norm_active(y, 0.1) * undb(-2), t0, pan=0.3)
            self.report['fx'].append(dict(type=h['type'], t=round(t, 3)))

    def render_fx(self):
        self.render_groupie()
        self.render_roar()
        self.render_groan()

    # ================================================================================================ finish
    def tapestop(self, names, b0, b1, curve=1.7):
        """The tape stop: playback speed of these stems falls from 1 to 0 over [b0, b1] beats (pitch with it,
        ease-in), then silence until the next gap end."""
        t0, t1 = bt(b0), bt(b1)
        n = ns(t1 - t0)
        k = np.arange(n) / n
        rate = 1.0 - k ** curve
        pos = np.cumsum(rate) - rate[0]
        for nm in names:
            if nm not in self.stems:
                continue
            buf = self.stems[nm]
            i0 = ns(t0)
            src = buf[i0:i0 + n + 8].astype(float).copy()
            out = np.stack([np.interp(pos, np.arange(len(src)), src[:, c]) for c in range(2)], axis=1)
            out = lp(out, 9000, 2)
            out *= np.clip(rate, 0, 1)[:, None] ** 0.3
            buf[i0:i0 + n] = out.astype(F32)
            gap_end = min([b for a, b in self.gaps if a >= t1 - 1e-6] or [t1])
            buf[i0 + n:ns(max(gap_end, t1))] = 0.0

    def gate(self, names):
        for nm in names:
            if nm not in self.stems:
                continue
            buf = self.stems[nm]
            for a, b in self.gaps:
                i0, i1 = ns(a), min(self.n, ns(b))
                f = ns(0.004)
                if i0 >= self.n:
                    continue
                buf[i0:i1] = 0.0
                if i0 - f >= 0:
                    buf[i0 - f:i0] *= np.linspace(1, 0, f)[:, None].astype(F32)
                if i1 + f <= self.n:
                    buf[i1:i1 + f] *= np.linspace(0, 1, f)[:, None].astype(F32)

    def finish(self):
        if self.tape_stop:
            for h in self.hits('tapeStop'):
                self.tapestop(['lead', 'gang'], h['beat'], h.get('toBeat', h['beat'] + 2))
        if self.gate_gaps:
            self.gate(['lead', 'gang', 'zombies'])
        for nm, buf in self.stems.items():
            lvl = STEM_LEVEL_DB.get(nm, -20.0)
            r = active_rms(buf[::4])
            if r > 0:
                buf *= F32(undb(lvl) / r)
            pk = float(np.abs(buf).max())
            if pk > undb(-1.0):          # a soft safety limit (the mix does the real limiting)
                lim = undb(-1.0)
                buf[:] = (np.tanh(buf / lim) * lim).astype(F32)
            self.report['stems'][nm] = dict(active_rms_db=round(float(db(active_rms(buf[::4]))), 2),
                                            peak_db=round(float(db(np.abs(buf).max())), 2),
                                            regions=regions(buf))
        for nm in STEM_NAMES:
            self.stem(nm)


def regions(buf, thr_db=-60.0, hop=0.05, join=0.4):
    """[[t0, t1], ...] spans (s) where a stem sounds (above thr_db), joined across short silences."""
    m = np.abs(np.asarray(buf, float)).max(axis=1) if np.ndim(buf) == 2 else np.abs(buf)
    w = ns(hop)
    k = len(m) // w
    e = m[:k * w].reshape(k, w).max(axis=1)
    on = e > undb(thr_db)
    out = []
    i = 0
    while i < k:
        if on[i]:
            j = i
            while j < k and on[j]:
                j += 1
            if out and i * hop - out[-1][1] < join:
                out[-1][1] = round(j * hop, 2)
            else:
                out.append([round(i * hop, 2), round(j * hop, 2)])
            i = j
        else:
            i += 1
    return out


# =====================================================================================================
# public API
# =====================================================================================================

def _src_hash():
    try:
        return hashlib.md5(Path(__file__).read_bytes()).hexdigest()[:12]
    except OSError:
        return VERSION


def _score_key(score, *keys):
    sub = {k: score.get(k) for k in keys}
    return hashlib.md5(json.dumps(sub, sort_keys=True).encode()).hexdigest()[:12]


def save_sparse(path, arrays, extra):
    """Save stereo stems sparsely (only 0.5 s blocks that are not silent)."""
    blob = {}
    for nm, a in arrays.items():
        w = ns(0.5)
        k = (len(a) + w - 1) // w
        blocks = []
        for i in range(k):
            seg = a[i * w:(i + 1) * w]
            if np.abs(seg).max() > 0:
                blocks.append((i, np.ascontiguousarray(seg, F32)))
        blob[nm] = (len(a), w, blocks)
    with open(path, 'wb') as fh:
        pickle.dump(dict(stems=blob, extra=extra), fh, protocol=4)


def load_sparse(path):
    with open(path, 'rb') as fh:
        d = pickle.load(fh)
    out = {}
    for nm, (n, w, blocks) in d['stems'].items():
        a = np.zeros((n, 2), F32)
        for i, seg in blocks:
            a[i * w:i * w + len(seg)] = seg
        out[nm] = a
    return out, d['extra']


def render_all(score, sr=SR, work_dir=None, strict=True, tape_stop=True, gate_gaps=True, only=None, cache=True):
    """Render every voice of the soundtrack. Returns (stems, report); see API_DOC."""
    work = Path(work_dir or Path.cwd() / 'ns_voices_work')
    work.mkdir(parents=True, exist_ok=True)
    key = hashlib.md5(f'{_src_hash()}|{_score_key(score, "vocals", "hits", "gaps", "duration")}|{strict}|{tape_stop}|'
                      f'{gate_gaps}|{sorted(only) if only else None}'.encode()).hexdigest()[:16]
    cpath = work / 'cache' / f'stems_{key}.pkl'
    if cache and cpath.exists():
        log('stems from cache', cpath.name)
        stems, report = load_sparse(cpath)
        return stems, report
    R = Renderer(score, sr, work, strict=strict, tape_stop=tape_stop, gate_gaps=gate_gaps)
    R._fit_errors = []
    want = set(only) if only else set(STEM_NAMES)
    steps = [('lou', R.render_lou), ('tiny', R.render_tiny), ('roadie', R.render_roadie), ('fan', R.render_fan),
             ('lead', R.render_lead), ('gang', R.render_gang), ('zombies', R.render_zombies), ('fx_vocal', R.render_fx),
             ('huh', R.render_huh)]
    for nm, fn in steps:
        if nm in want:
            fn()
    if R._fit_errors:
        raise FitError('ns_voices: these spoken lines cannot be time-fitted inside their score windows at '
                       'rubberband 0.85x-1.1x:\n  ' + '\n  '.join(R._fit_errors) +
                       '\nWiden the windows in score.js (vocals.spoken[].win), or call render_all(..., strict=False) '
                       '(CLI --lenient) to squeeze them anyway (reported in report["warnings"]).')
    R.finish()
    stems = {k: v for k, v in R.stems.items() if (k in want or not only)}
    if cache:
        (work / 'cache').mkdir(exist_ok=True)
        save_sparse(cpath, stems, R.report)
    return stems, R.report


# =====================================================================================================
# the board's radio clips
# =====================================================================================================

def _tone(dur, f, level=0.25, seed=0):
    n = ns(dur)
    t = tt(n)
    y = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t + 0.4)
    env = np.minimum(1, t / 0.012) * np.minimum(1, (dur - t) / 0.03)
    return y * np.clip(env, 0, 1) * level


def _numbers_clip(R, text, seed=31):
    """The numbers station: a two-note chime before each number, then slt reading it dead flat (monotone),
    unhurried, on a thin AM carrier."""
    digits = [d.strip() for d in text.split('.') if d.strip()]
    parts = [np.zeros(ns(0.35))]
    words = []
    t = 0.35
    for k, d in enumerate(digits):
        ch = np.concatenate([_tone(0.11, 1046.5, 0.22), _tone(0.16, 784.0, 0.22)])
        parts.append(ch)
        t += len(ch) / SR
        gap = np.zeros(ns(0.12))
        parts.append(gap)
        t += 0.12
        r = R.F.synth(d, 'slt', 1.12)
        a, b = trim_span(r['x'], -40)
        x = r['x'][a:b + ns(0.01)].astype(float)
        an = analyse(x)
        y = psola(an, np.arange(len(x), dtype=float), np.full(len(x), 196.0))          # G3, flat
        y = fades(norm_active(y, 0.1), 0.004, 0.03)
        parts.append(y)
        words.append([d, round(t, 4)])
        t += len(y) / SR
        pause = np.zeros(ns(0.42 if (k + 1) % 4 else 0.85))   # groups of four: 1031 / 1987 / 0300
        parts.append(pause)
        t += len(pause) / SR
    parts.append(np.zeros(ns(0.8)))
    y = np.concatenate(parts)
    y = bp(y, 260, 3400, 2)
    y = y + bp(noise(len(y), seed), 300, 3500, 2) * 0.004
    return norm_active(y, 0.1), words


def _tape_clip(R, item, seed=41):
    """1204: Lou on a 1987 tape, dry and close (the only time he is not on the radio), over a bed the soundtrack
    adds (fire bell, the band's last chord); the crowd chanting ONE MORE SONG is rendered here, muffled behind
    the doors."""
    sp = dict(id='tape', text=item['text'], win=[0, 1000], flite=item.get('flite'))
    x, r, s, fit, a_s, d1 = R.fit_speech(sp, 'rms', pref_stretch=1.18)
    y = norm_active(x, 0.1)
    y = y + norm_active(lp(pad_to(R.rb(x, 1.0, 0.5, 'shifted'), len(x)), 600, 2), 0.1) * undb(-26)
    y = pad_to(R.rb(y, 1.0, 2 ** (-1.0 / 12), 'shifted'), len(y))
    y = close_mic(y, proximity=6.0, air=1.5)
    y = norm_active(y, 0.1)
    words = R.display_word_onsets(item['text'], item.get('flite') or item['text'], r['words'], -a_s)
    pre, post = 1.1, 1.6
    n = ns(pre + len(y) / SR + post)
    out = np.zeros(n)
    place(out, y, pre)
    # the chant behind the doors: a real crowd (1987), muffled and far
    ch = np.zeros(n + ns(1.0))
    beat = 0.43
    cyc = 0
    t = 0.05
    while t < n / SR - 0.6:
        ev = [dict(t=t + i * beat, dur=d, midi=m, syl=w, word=w, wi=i, line='tapechant', step=0, len=3)
              for i, (w, d, m) in enumerate([('ONE', 0.25, 50.0), ('MORE', 0.25, 52.0), ('SONG', 0.42, 54.0)])]
        yy, t0 = R.crowd(ev, 8, 'tape', formant=0.0, growl=0.0, spread=45, tj=0.04, sj=0.02, low_frac=0.1, young=0.3,
                         seed=seed + cyc, chain='shout')
        place(ch, mono(yy), t0)
        cyc += 1
        t += 4 * beat
    ch = lp(ch[:n], 900, 2)
    ch = mono(reverb(ch, 'theatre', mix=0.5, pre_hp=200))[:n]
    out = out + norm_active(ch, 0.1) * undb(-11)
    return out, dict(voice=[round(pre, 3), round(pre + len(y) / SR, 3)], bed=[0.0, round(n / SR, 3)],
                     words=[[w, round(pre + tw, 4)] for w, tw in words])


def render_radio(score, sr=SR, work_dir=None, bleed_sec=16.0, strict=True):
    """The evidence board's radio clips (mono): numbers, tape, lou, lou3am, then a silent placeholder for bleed.
    Returns (mono array, clips) with clips[id] = dict(fromSec, toSec, ...); see API_DOC."""
    work = Path(work_dir or Path.cwd() / 'ns_voices_work')
    R = Renderer(score, sr, work, strict=strict)
    R._fit_errors = []
    items = {it['id']: it for it in score.get('radio', [])}
    segs = []
    clips = {}
    gap = np.zeros(ns(0.3))
    t = 0.0

    def add(cid, y, extra=None):
        nonlocal t
        segs.append(y)
        c = dict(fromSec=round(t, 4), toSec=round(t + len(y) / SR, 4))
        for k, v in (extra or {}).items():
            if k in ('voice', 'bed'):
                c[k] = [round(t + v[0], 4), round(t + v[1], 4)]
            elif k == 'words':
                c[k] = [[w, round(t + tw, 4)] for w, tw in v]
            else:
                c[k] = v
        clips[cid] = c
        t += len(y) / SR
        segs.append(gap)
        t += len(gap) / SR
    log('radio: numbers')
    if 'numbers' in items:
        y, words = _numbers_clip(R, items['numbers']['text'])
        add('numbers', y, dict(words=words, loop=True))
    log('radio: tape')
    if 'tape' in items:
        y, ex = _tape_clip(R, items['tape'])
        add('tape', y, dict(ex, stored='forwards', loop=True))
    for cid in ('lou', 'lou3am'):
        if cid in items:
            log('radio:', cid)
            it = items[cid]
            sp = dict(id=cid, text=it['text'], win=[0, 1000], flite=it.get('flite'), voice='lou')
            y, words, tempo, fit, d1, dur = R.lou_voice(sp, seed=53 + len(cid))
            y = np.concatenate([np.zeros(ns(0.25)), y, np.zeros(ns(0.6))])
            add(cid, y, dict(words=[[w, round(0.25 + tw, 4)] for w, tw in words]))
    segs.append(np.zeros(ns(bleed_sec)))
    clips['bleed'] = dict(fromSec=round(t, 4), toSec=round(t + bleed_sec, 4), placeholder=True, loop=True)
    y = np.concatenate(segs)
    pk = np.abs(y).max()
    if pk > undb(-1.0):
        y = y * undb(-1.0) / pk
    return y.astype(F32), clips


# =====================================================================================================
# the 1987 bootleg's voices (chorus 1 sung live, the crowd yelling ONE MORE SONG between the lines)
# =====================================================================================================

def render_bootleg_voices(score, sr=SR, work_dir=None, with_info=False, tail_bars=2):
    """Stereo (n, 2) stem of the 1987 bootleg's vocals, t = 0 at the downbeat of the chorus' first bar
    (arrangement.bootleg1987.bars[0], bar 36), length = 8 bars + tail_bars (16.0 s). Returns the stem, or
    (stem, info) with with_info=True."""
    work = Path(work_dir or Path.cwd() / 'ns_voices_work')
    R = Renderer(score, sr, work, strict=False)
    R._fit_errors = []
    bl = (score.get('arrangement') or {}).get('bootleg1987') or {}
    b0, b1 = (bl.get('bars') or [36, 44])
    T0 = tb(b0)
    L = tb(b1 - b0 + tail_bars)
    n = ns(L)
    vox = np.zeros((n, 2))
    crowd = np.zeros((n, 2))
    info = dict(t0_bar=b0, length=round(L, 3), lines=[], yells=[], whoops=[], chant=[])
    lines = [l for l in score['vocals']['lines'] if b0 <= l['bar'] < b1 and 'vex' in l['singer']]
    for l in lines:
        ev = [dict(e, t=e['t'] - T0) for e in line_events(l)]
        y, t0, recs = R.sg.sing(ev, 'awb', vib=0.26, growl=0.05, jitter=0.004, seed=8000 + l['bar'], fall=2.5,
                                detune=-12)
        m = megaphone(norm_active(y, 0.1), drive=3.6, crush=0.1, seed=l['bar'])
        place(vox, stereo(norm_active(m, 0.1)), t0)
        info['lines'].append(dict(id=l['id'], text=l['text'], t=round(ev[0]['t'], 3)))
        gang_ev = ev if l['singer'] == 'vex+gang' else [ev[i] for i in (l.get('gangOn') or []) if i < len(ev)]
        if gang_ev:
            for v, (voice, octv, pan, cents) in enumerate(GANG[:4]):
                yg, tg, _ = R.sg.sing(gang_ev, voice, octave=octv, detune=cents + 10, time_jitter=0.02, vib=0.1,
                                      scoop=1.0, fall=2.0, stretch=0.9, formant=0.8, seed=8100 + 10 * l['bar'] + v)
                yg = shout_chain(norm_active(yg, 0.1), drive=2.2)
                place(vox, stereo(norm_active(yg, 0.1) * 0.45, pan * 0.6), tg)
    # the PA in a theatre, heard from the floor
    vox = vox + wet(mono(vox), 'theatre', pre_hp=250)[:n] * 0.5
    vox = lp(vox, 6000, 2)
    # the answer slots (where chorus 1 has its shotguns): the crowd yells ONE MORE SONG
    slots = [h['beat'] for h in R.hits('shotgun') if b0 * 4 <= h['beat'] < b1 * 4]
    yells = []
    for b in slots:
        if yells and b - yells[-1] < 2:
            continue
        yells.append(b)
    r = rng(87)
    for k, b in enumerate(yells):
        t = bt(b) - T0 - 0.1
        ev = [dict(t=t + o, dur=d, midi=m, syl=w, word=w, wi=i, line='yell', step=0, len=2)
              for i, (w, o, d, m) in enumerate([('ONE', 0.0, 0.2, 55.0), ('MORE', 0.24, 0.2, 57.0),
                                                ('SONG', 0.48, 0.42, 59.0)])]
        yy, t0 = R.crowd(ev, 10, 'boot', formant=0.0, growl=0.0, spread=55, tj=0.05, sj=0.03, low_frac=0.1, young=0.35,
                         seed=8200 + k, chain='shout', effort=1.25)
        place(crowd, yy, t0)
        info['yells'].append(dict(t=round(t, 3), song=round(t + 0.48, 3)))
    # whoops and screams in the STOPS gap
    for g in score.get('gaps', []):
        if b0 * 4 <= g['fromBeat'] < b1 * 4:
            tg = bt(g['fromBeat']) - T0
            for i in range(5):
                voice = ['slt', 'kal16', 'slt', 'awb', 'slt'][i]
                ev = [dict(t=tg + 0.05 + r.uniform(0, 0.3), dur=r.uniform(0.3, 0.5),
                           midi={'slt': 77, 'kal16': 69, 'awb': 64}[voice] + r.uniform(-2, 2), syl='WOO', word='woo',
                           wi=0, line='woo', step=0, len=4)]
                yw, tw, _ = R.sg.sing(ev, voice, vib=0.5, vib_rate=6.5, scoop=3.0, fall=6.0, fall_min_steps=0,
                                      seed=8300 + i)
                place(crowd, stereo(shout_chain(norm_active(yw, 0.1), drive=1.5) * 0.5, r.uniform(-0.8, 0.8)), tw)
            info['whoops'].append(round(tg, 3))
    # the tail: the whole crowd chanting while the alarm rings
    tc = tb(b1 - b0) + 0.1
    k = 0
    while tc < L - 0.9:
        ev = [dict(t=tc + i * 0.4, dur=d, midi=m, syl=w, word=w, wi=i, line='chant', step=0, len=3)
              for i, (w, d, m) in enumerate([('ONE', 0.26, 52.0), ('MORE', 0.26, 54.0), ('SONG', 0.5, 55.0)])]
        yy, t0 = R.crowd(ev, 14, 'boot', formant=0.0, growl=0.0, spread=50, tj=0.045, sj=0.02, low_frac=0.1,
                         young=0.3, seed=8400 + k, chain='shout', effort=1.3)
        place(crowd, yy * (1.0 + 0.25 * k), t0)
        info['chant'].append(round(tc, 3))
        tc += 1.6
        k += 1
    crowd = crowd + wet(mono(crowd), 'room', pre_hp=250)[:n] * 0.25
    out = norm_active(vox, 0.1) * undb(-3) + norm_active(crowd, 0.1) * undb(-1)
    out = fades(out, 0.002, 0.05)
    pk = np.abs(out).max()
    out = out * (undb(-1.0) / pk if pk > 0 else 1.0)
    out = out.astype(F32)
    return (out, info) if with_info else out


# =====================================================================================================
# CLI
# =====================================================================================================

API_DOC = r'''
tools/ns_voices.py: every voice of NO SURVIVORS "Keep Them Dancing" + the board radio's voice clips.
Self-contained (numpy, scipy, ffmpeg's rubberband, libflite via ctypes with an ffmpeg-flite fallback).
import: sys.path.insert(0, 'tools'); import ns_voices as NV          SR = 44100, stereo arrays are (n, 2) float32

NV.load_score(path) -> dict                     parse no-survivors/score.js

NV.render_all(score, sr=44100, work_dir=None, strict=True, tape_stop=True, gate_gaps=True, only=None, cache=True)
    -> (stems, report)
  stems: dict name -> float32 array (n, 2), n = round(score.duration * 44100) (180.0 s), every voice at its exact
  time (sung syllables P-centre aligned on their 16th step: unvoiced lead-ins start early so the vowel lands on
  the step). Each stem is normalised to a suggested unity-sum balance (NV.STEM_LEVEL_DB, active RMS dBFS) with
  peaks <= -1 dBFS; the soundtrack mix sets the final gains. Stems:
    'lead'     Vex: flite awb, PSOLA pitch-corrected to vocals.lines[].notes, through the megaphone chain (band-pass
               ~400 Hz-3.5 kHz, horn resonances, drive, slight bit-crush, 95 ms slap); choruses/lift/calls doubled
               (octave-down rms double -8 dB + kal16 unison double -9 dB), verses a faint unison double; v2c-v2d
               (fx 'dry') close and dry with a whisper double; GOOD NIGHT! (spoken vex_goodnight) shouted.
               ALREADY CONTAINS the tapeStop drag (hit tapeStop 286-288) and is silent in every SCORE.gaps span:
               do not tape-stop or gap-gate the vocal stems again (or pass tape_stop=False / gate_gaps=False).
    'gang'     6-8 layered shouts (awb/kal16/rms/slt/kal, octave-down layers, spread wide, shouted chain): name
               shouts g1-g4, HERE THEY COME!, every gangOn word, every vex+gang line, r4, and every gangHey hit
               (HEY! at its beat and pitch). Same tapeStop/gap treatment as lead.
    'zombies'  the chant z1-z3 (12/16/20 voices, formants -2 st, growl, an octave-down share, punchy words, groan
               tails, theatre space; in z1 one straggler yells a late, too-high "SONG!"), the responses r2/r4 (24/30
               voices, near-human: formant -0.6 st, young voices an octave up, arena space), then 7 WOO!s just before
               bar 104. Gap-gated.
    'lou'      Last Call Lou: flite rms at an unhurried pace (flite duration_stretch, time-fitted into each spoken
               win at 0.85x-1.1x), lowered ~1.3 st (tape-slow timbre), a felt sub-octave shadow, AM radio band-pass,
               crackle, hiss. lou_rescue reuses lou_open3's processed audio sample for sample (spoken[].take).
    'tiny'     ONE! TWO! THREE! FOUR!: deep shouts (rms, formants -2 st, octave layer) on their steps, van room.
    'fx_vocal' the Groupie's sobbing (hit groupieSob), her shriek VEEEX!!! SIGN IT AGAIN!!! (groupieShriek: high
               scream + a -7 st / formant -4 growling monster under it), the horde roars (hordeRoar: 18-26 voices,
               -7 st, formants -4, growl, swelling), the blackout groan "one... more..." (spoken groan: 12 voices,
               -5 st / -3, dry, clamped inside its win).
    'roadie'   "check... one... two...": one huge voice (rms ~C2-D2, formants -5 st, growl) with breath after each
               word, a little theatre.
    'fan'      "One more song!" (spoken fan): slt, young and warm, unprocessed but distant (night air reverb).
    'huh'      crowdHuh grunts (16 voices, -3 st formants) and the lone zombieHuh "huh?" (rising) at their beats.
  report: dict(version, warnings[], stems{name: {active_rms_db, peak_db, regions[[t0, t1]...]}},
    spoken{id: {text, voice, t0 (= win[0] in s), win, win_s, dur (s from t0 to the end of the speech), start, end,
                words [[display word, sec from t0], ...] (measured onsets; flite timings mapped onto the display
                text, e.g. 'thirteen-thirteen' and 'A.M.' from the flite spelling), tempo (speed vs flite's natural
                reading), fit ('ok' | 'forced'), natural (s), take (lou_rescue)}},
    sung{line id: {text, fx, syllables [[syllable, note onset s, vowel onset s, audio start s], ...],
                   pitch_cents [median cents error per syllable on the dry tuned voice]},
         'gang': {item id: [[syllable, note s, vowel s], ...]}, z1..r4: {text, fx, voices, syllables}},
    fx[{type, t, ...}])
  strict=True: a spoken line that cannot fit its win at 0.85x-1.1x raises NV.FitError listing every such line
  (natural length, window, the beat where it would end at 1.1x). strict=False squeezes it anyway (flite
  duration_stretch, then rubberband) and records it in report['warnings'] with fit='forced'.
  only: iterable of stem names to render (others are left out). cache: the finished stems are cached in
  work_dir/cache/ keyed by this file's source and the score's vocals/hits/gaps (re-runs take ~1 s).

NV.render_radio(score, sr=44100, work_dir=None, bleed_sec=16.0, strict=True) -> (mono float32 array, clips)
  The board radio's voice clips in one mono array, 0.3 s of silence between clips, in this order:
    numbers  (1031) a two-note chime before each number, slt reading SCORE.radio numbers text dead flat (G3),
             groups of four, thin AM band; loop-friendly (0.8 s tail).
    tape     (1204) stored forwards: Lou dry and close (no radio band-pass) saying SCORE.radio tape text, over a
             crowd chanting ONE MORE SONG muffled behind doors. clips.tape.bed = [from, to] where the soundtrack
             mixes the fire bell + the band's last chord (the whole clip); clips.tape.voice = Lou's span.
    lou      (1313) radio Lou, SCORE.radio lou text.       lou3am (1313, witching hour) SCORE.radio lou3am text.
    bleed    (870) a silent placeholder of bleed_sec seconds at the END of the array: replace it with the
             cassette-processed bootleg (it may be resized: it is last, so nothing else moves).
  clips: {id: {fromSec, toSec, [words [[word, absSec]...]], [voice [a, b]], [bed [a, b]], [loop], [placeholder]}}
  (absolute seconds in the returned array). Peak <= -1 dBFS.

NV.render_bootleg_voices(score, sr=44100, work_dir=None, with_info=False, tail_bars=2) -> stem (n, 2) float32
  (or (stem, info)). The 1987 bootleg's vocals, pre-cassette: t = 0 is the downbeat of bar 36 (arrangement.
  bootleg1987.bars[0]); length 8 bars + tail_bars = 16.0 s. Vex sings c1a-c1d (DEAD MEAT) through the megaphone
  into a theatre PA with his gang on the vex+gang lines/gangOn words; the crowd (human, near the taping mic) yells
  ONE MORE SONG at the chorus' answer slots (the shotgun beats), whoops in the STOPS gap, and chants ONE! MORE!
  SONG! through the 2-bar tail (where the alarm/feedback go). info = {t0_bar, length, lines[{id, text, t}],
  yells[{t, song}], whoops[t], chant[t]} (s, bootleg time): yells[k].song is where '...MORE SONG!' sits (the
  flashback excerpt). Mix it with the band render of bars 36-46 and run the cassette processor on the sum.

Also: NV.FitError, NV.STEM_NAMES, NV.STEM_LEVEL_DB, NV.write_wav(path, x, peak=None), NV.spectrogram_png(...);
NV._QUIET = True silences the progress log. Deterministic (fixed seeds). Takes ~40 s cold, ~1 s from cache.
NOTE (score.js as of this build): strict=True raises FitError for lou_open1 (needs 1.50x), lou_open2 (1.25x),
lou_open3 (1.39x; lou_rescue is its take), lou_open4 (1.35x), lou_ride (1.13x) and roadie_check (1.2x): flite rms
reads slower than those windows allow. Until the windows are widened, call render_all(..., strict=False).

CLI: python3 tools/ns_voices.py --score no-survivors/score.js --out DIR
        [--only lead|gang|zombies|lou|tiny|fx_vocal|roadie|fan|huh|radio|bootleg (comma list)] [--lenient]
        [--work DIR] [--no-cache] [--png] [--api]
  writes DIR/<stem>.wav (stereo 16-bit, full song length), DIR/report.json, DIR/radio.wav + DIR/radio.json,
  DIR/bootleg_voices.wav + DIR/bootleg.json, and with --png spectrogram/pitch pictures of every sung line.
'''


def main(argv=None):
    global _QUIET
    ap = argparse.ArgumentParser(description='NO SURVIVORS voices', formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--score', default=str(Path(__file__).resolve().parent.parent / 'no-survivors' / 'score.js'))
    ap.add_argument('--out', default=None)
    ap.add_argument('--work', default=None)
    ap.add_argument('--only', default=None)
    ap.add_argument('--lenient', action='store_true', help='squeeze spoken lines that do not fit (no FitError)')
    ap.add_argument('--no-cache', action='store_true')
    ap.add_argument('--png', action='store_true')
    ap.add_argument('--api', action='store_true')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args(argv)
    if a.api:
        print(API_DOC)
        return 0
    _QUIET = a.quiet
    if not a.out:
        ap.error('--out DIR is required')
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    work = Path(a.work) if a.work else out / 'work'
    S = load_score(a.score)
    only = set(x.strip() for x in a.only.split(',')) if a.only else None
    stem_only = (only - {'radio', 'bootleg'}) if only else None
    if only is None or stem_only:
        try:
            stems, rep = render_all(S, SR, work, strict=not a.lenient, only=stem_only, cache=not a.no_cache)
        except FitError as e:
            print(str(e), file=sys.stderr)
            return 2
        for nm, x in stems.items():
            if not stem_only or nm in stem_only:
                write_wav(out / f'{nm}.wav', x)
        (out / 'report.json').write_text(json.dumps(rep, indent=1))
        for w in rep['warnings']:
            log('WARNING', w)
        if a.png:
            check_pngs(stems, rep, S, out)
        log('stems:', ', '.join(f"{k} {v['active_rms_db']} dB" for k, v in rep['stems'].items()))
    if only is None or 'radio' in only:
        y, clips = render_radio(S, SR, work, strict=not a.lenient)
        write_wav(out / 'radio.wav', y)
        (out / 'radio.json').write_text(json.dumps(clips, indent=1))
        log('radio:', ', '.join(f"{k} {v['fromSec']}-{v['toSec']}" for k, v in clips.items()))
    if only is None or 'bootleg' in only:
        y, info = render_bootleg_voices(S, SR, work, with_info=True)
        write_wav(out / 'bootleg_voices.wav', y)
        (out / 'bootleg.json').write_text(json.dumps(info, indent=1))
        log('bootleg voices:', info['length'], 's')
    return 0


def check_pngs(stems, rep, S, out):
    """One picture per sung line (lead stem, the line's two bars) with the target notes and the step marks."""
    from PIL import Image
    ims = []
    for l in S['vocals']['lines']:
        if 'vex' not in l['singer'] or not l.get('notes'):
            continue
        a = tb(l['bar']) - 0.2
        b = tb(l['bar'] + 2) + 0.4
        seg = mono(stems['lead'][ns(a):ns(b)])
        tg = [(tb(l['bar'], st), tb(l['bar'], st + L), hz(m)) for (sy, st, L, m) in l['notes']]
        mk = [(tb(l['bar'], st), sy) for (sy, st, L, m) in l['notes']]
        p = out / f'_line_{l["id"]}.png'
        spectrogram_png(seg, p, f'{l["id"]}: {l["text"]}', t0=a, width=700, height=220, fmax=6000, targets=tg, marks=mk)
        ims.append(Image.open(p))
    if ims:
        cols = 2
        rows = (len(ims) + 1) // 2
        W = Image.new('RGB', (700 * cols, 220 * rows))
        for i, im in enumerate(ims):
            W.paste(im, ((i % cols) * 700, (i // cols) * 220))
        W.save(out / 'lines.png')
        for i in range(len(ims)):
            pass
        for p in out.glob('_line_*.png'):
            p.unlink()


if __name__ == '__main__':
    sys.exit(main())
