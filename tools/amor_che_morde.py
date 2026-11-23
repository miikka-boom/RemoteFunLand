#!/usr/bin/env python3
"""L'Amor che Morde (The Love That Bites): render the zombie opera.

Composes the score (tools/amor_che_morde_score.py), sings and plays it with the synthesisers in
tools/amor_che_morde_synth.py, mixes it in a simulated opera house and writes:

  amor-che-morde/amor-che-morde.mp3   the soundtrack
  amor-che-morde/score.js             the timing the page runs on (window.OPERA): chapters,
                                      surtitles, stage cues, conductor beats, every sung syllable
                                      (vowel by vowel, for the lip sync) and the pit's activity

  python3 tools/amor_che_morde.py [--work DIR] [--no-mp3] [--section T0 T1]

Stems are cached in the work directory (default: a temp folder), so a second run that changes only
the mix is quick. A report (loudness per number, peaks, spectrograms) is written there too.
"""
import argparse
import hashlib
import json
import os
import pickle
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

import amor_che_morde_synth as S
from amor_che_morde_score import compose
from amor_che_morde_synth import SR, Singer, Note, Ev

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / 'amor-che-morde'
VERSION = 7
SYNTH_HASH = hashlib.sha1((Path(__file__).resolve().parent / 'amor_che_morde_synth.py').read_bytes()).hexdigest()
T0 = time.time()


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


# ------------------------------------------------------------------------------ cache

class Cache:
    def __init__(self, work):
        self.dir = Path(work) / 'cache'
        self.dir.mkdir(parents=True, exist_ok=True)

    def key(self, *parts):
        h = hashlib.sha1()
        h.update(SYNTH_HASH.encode())
        for p in parts:
            h.update(pickle.dumps(p, protocol=4))
        return h.hexdigest()[:20]

    def get(self, name, key):
        f = self.dir / f'{name}-{key}.npy'
        if f.exists():
            return np.load(f)
        return None

    def put(self, name, key, arr):
        np.save(self.dir / f'{name}-{key}.npy', arr.astype(np.float32))


def ev_sig(evs):
    return [(round(e.t0, 4), round(e.t1, 4), e.midi, round(e.vel, 3), e.art) for e in evs]


def note_sig(notes):
    return [(round(n.t0, 4), round(n.t1, 4), n.midi, n.text, round(n.vel, 3), sorted(n.flags), n.z, n.mend) for n in notes]


# ------------------------------------------------------------------------------ stage positions

def stage_track(op, who):
    """[(t, x0, x1, dur)] moves for a character, from 'at' and 'move' cues."""
    tr = []
    x = 0.0
    for c in op.cues:
        if len(c) > 2 and c[2] == who and c[1] in ('at', 'move'):
            if c[1] == 'at':
                tr.append((c[0], c[3], c[3], 0.0))
                x = c[3]
            else:
                tr.append((c[0], x, c[3], c[4]))
                x = c[3]
    return tr


def stage_x(track, t):
    x = 0.0
    for (tc, x0, x1, d) in track:
        if tc > t:
            break
        if d <= 0 or t >= tc + d:
            x = x1
        else:
            x = x0 + (x1 - x0) * S.smoothstep((t - tc) / d)
    return x


# ------------------------------------------------------------------------------ voices

SOLOISTS = {
    'livia': dict(vtype='S', seed=101, vib_depth=70.0, breath=-30.0),
    'amadeo': dict(vtype='T', seed=202, vib_depth=55.0, bright=1.0),
    'velena': dict(vtype='A', seed=303, vib_depth=66.0, bright=2.0, fscale=0.985),
    'ossobuco': dict(vtype='B', seed=404, vib_depth=30.0, vib_rate=5.2, fscale=0.97, breath=-28.0, glottal=-8.0),
}


def render_soloist(op, who, n, cache):
    notes = op.vox[who]
    cfg = dict(SOLOISTS[who])
    key = cache.key('solo', VERSION, who, cfg, note_sig(notes))
    hit = cache.get('v_' + who, key)
    if hit is not None:
        return hit
    vt = cfg.pop('vtype')
    singer = Singer(vt, **cfg)
    track = stage_track(op, who)
    out = np.zeros((2, n))
    rng = np.random.default_rng(cfg['seed'] + 7)
    phrases = S.split_phrases(notes)
    prev_end = -10.0
    for ph in phrases:
        y, t0 = singer.render_phrase(ph, rng)
        tm = 0.5 * (ph[0].t0 + ph[-1].t1)
        pan = float(np.clip(stage_x(track, tm) * 0.6, -0.75, 0.75))
        # a breath before phrases that follow a rest
        if ph[0].t0 - prev_end > 0.6 and not all('spoken' in q.flags for q in ph):
            z = max([q.z or 0.0 for q in ph])
            b = S.breath_in(dur=0.32 + 0.1 * rng.uniform(), level=0.035 * (0.6 + ph[0].vel), rng=rng, zombie=z)
            S.place(out, S.pan_st(b, pan), ph[0].t0 - 0.06 - 0.36 - 0.07 * len(ph[0].phones[0] if ph[0].phones else []))
        S.place(out, S.pan_st(y, pan), t0)
        prev_end = ph[-1].t1
    cache.put('v_' + who, key, out)
    return out


def jitter_notes(notes, rng, dt=0.02, dv=0.08, z=None):
    """A chorister's copy of a part: a personal lag, small per-note offsets, legato kept legato."""
    shift = rng.normal(0, dt)
    starts = [q.t0 + shift + rng.normal(0, dt * 0.4) for q in notes]
    out = []
    for i, q in enumerate(notes):
        t0 = starts[i]
        contiguous = i + 1 < len(notes) and abs(q.t1 - notes[i + 1].t0) < 1e-3
        t1 = starts[i + 1] if contiguous else q.t1 + shift + rng.normal(0, dt * 0.3)
        t1 = max(t1, t0 + 0.04)
        m = Note(t0, t1, q.midi, q.text, vel=float(np.clip(q.vel * (1 + rng.normal(0, dv)), 0.05, 1)),
                 flags=q.flags, mend=q.mend, who=q.who)
        m.z = (q.z if z is None else z) if (q.z is not None or z is not None) else None
        out.append(m)
    return out


def render_chorus(op, group, n, cache, singers_per_part=5):
    parts = [p for p in ('S', 'A', 'T', 'B') if op.vox.get(f'{group}_{p}')]
    key = cache.key('chorus', VERSION, group, singers_per_part, [note_sig(op.vox[f'{group}_{p}']) for p in parts])
    hit = cache.get('c_' + group, key)
    if hit is not None:
        return hit
    out = np.zeros((2, n))
    zombie = group == 'dead'
    rng = np.random.default_rng(9000 + (1 if zombie else 0))
    vt_of = {'S': 'S', 'A': 'A', 'T': 'T', 'B': 'B'}
    pans = {'S': -0.45, 'A': -0.15, 'T': 0.15, 'B': 0.45}
    for p in parts:
        notes = op.vox[f'{group}_{p}']
        for k in range(singers_per_part):
            z = None
            if zombie:
                z = float(np.clip(rng.normal(0.82, 0.1), 0.55, 1.0))
            sing = Singer(vt_of[p], seed=int(rng.integers(1e6)), zombie=z or 0.0,
                          fscale=float(rng.normal(1.0, 0.035)), detune=float(rng.normal(0, 22 if zombie else 7)),
                          vib_rate=float(rng.normal(5.7, 0.35)), vib_depth=float(abs(rng.normal(48, 10))),
                          breath=-26.0 if zombie else -30.0, wobble=1.5 if zombie else 1.0)
            jn = jitter_notes(notes, rng, dt=0.035 if zombie else 0.018, z=z)
            pan = float(np.clip(pans[p] + rng.normal(0, 0.25), -0.9, 0.9))
            for t0, y in sing.render(jn):
                S.place(out, S.pan_st(y, pan), t0, gain=1.0 / np.sqrt(singers_per_part))
        log(f'  chorus {group}_{p}')
    cache.put('c_' + group, key, out)
    return out


# ------------------------------------------------------------------------------ crowd voices

MURMUR_SYL = ('ma che bel la se ra do ve il pro gram ma so no sta to bra vo pri ma fi la '
              'te a tro per ché mi o ca ro co sa di ce no si lei ve ro gior no tem po').split()


def render_murmur(dur, vel, rng):
    n = int(dur * SR) + SR
    out = np.zeros((2, n))
    for k in range(18):
        vt = rng.choice(['S', 'A', 'T', 'B'])
        base = {'S': 64, 'A': 59, 'T': 52, 'B': 47}[vt]
        sing = Singer(vt, seed=int(rng.integers(1e6)), fscale=float(rng.normal(1.0, 0.05)), breath=-22.0)
        t = rng.uniform(0, 1.5)
        notes = []
        while t < dur - 0.5:
            nsyl = int(rng.integers(3, 12))
            m0 = base + rng.normal(0, 1.5)
            for i in range(nsyl):
                d = rng.uniform(0.11, 0.2)
                m = m0 + 3 * np.sin(i / max(nsyl - 1, 1) * np.pi) - 2.5 * i / nsyl
                notes.append(Note(t, t + d, m, str(rng.choice(MURMUR_SYL)), vel=float(rng.uniform(0.25, 0.5)), flags=('spoken',), mend=m - rng.uniform(0, 1.5)))
                t += d
            t += rng.uniform(0.5, 2.2)
        pan = rng.uniform(-0.9, 0.9)
        for t0, y in sing.render(notes):
            S.place(out, S.pan_st(y, pan), t0, gain=0.25)
    out = S.bfilt(out, 'low', 3500.0)
    env = np.ones(n)
    tt = np.arange(n) / SR
    env *= S.smoothstep(tt / 1.0) * (1 - S.smoothstep((tt - (dur - 2.4)) / 2.4))
    return out * env * vel


BRAVO = [('bra vo', 1), ('bra va', 1), ('bra vi', 1), ('bis', 0), ('bra vo', 1), ('bra vis si mo', 2), ('cer vel lo', 3), ('bra va', 1)]


def render_bravo(dur, vel, rng):
    n = int(dur * SR) + 2 * SR
    out = np.zeros((2, n))
    for k in range(16):
        vt = rng.choice(['T', 'B', 'S', 'A', 'T', 'B'])
        base = {'S': 70, 'A': 66, 'T': 60, 'B': 55}[vt]
        text, kind = BRAVO[k % len(BRAVO)]
        z = 0.9 if kind == 3 else 0.0
        sing = Singer(vt, seed=int(rng.integers(1e6)), zombie=z, fscale=float(rng.normal(1.0, 0.04)), breath=-20.0)
        t = rng.uniform(0.2, dur - 1.5)
        syl = text.split()
        notes = []
        for i, sy in enumerate(syl):
            last = i == len(syl) - 1
            d = 0.42 if last else 0.15
            m = base + (4 if i == len(syl) - 2 or len(syl) == 1 else 0)
            notes.append(Note(t, t + d, m, sy, vel=0.8, flags=('spoken',), mend=m - (5 if last else 0)))
            t += d
        for t0, y in sing.render(notes):
            S.place(out, S.pan_st(y, float(rng.uniform(-0.8, 0.8))), t0, gain=float(rng.uniform(0.5, 1.0)))
    return out * vel


# ------------------------------------------------------------------------------ orchestra

PAN = {'vln1': -0.55, 'vln2': -0.25, 'vla': 0.2, 'vc': 0.42, 'cb': 0.58,
       'picc': -0.1, 'fl': -0.12, 'ob': 0.05, 'cl': -0.18, 'bsn': 0.15,
       'hn': -0.35, 'tpt': 0.22, 'tbn': 0.38, 'tuba': 0.48,
       'timp': 0.28, 'harp': -0.62, 'organ': 0.0}

# calibration: target RMS (dBFS) of a reference note at velocity 0.6, per part
TARGET = {'vln1': -21, 'vln2': -22, 'vla': -22, 'vc': -21, 'cb': -22,
          'picc': -29, 'fl': -28, 'ob': -28, 'cl': -28, 'bsn': -28,
          'hn': -25, 'tpt': -25, 'tbn': -25, 'tuba': -26, 'harp': -26, 'organ': -24}
REF_MIDI = {'vln1': 76, 'vln2': 72, 'vla': 62, 'vc': 50, 'cb': 38, 'picc': 88, 'fl': 79, 'ob': 72,
            'cl': 67, 'bsn': 50, 'hn': 62, 'tpt': 72, 'tbn': 55, 'tuba': 41, 'harp': 64, 'organ': 60}


def render_part(name, evs, n):
    if name in S.STRINGS:
        return S.strings_section(evs, name, n)
    if name in S.WINDS:
        return S.winds_part(evs, name, n)
    if name == 'harp':
        return S.harp_part(evs, n)
    if name == 'organ':
        return S.organ_part(evs, n)
    raise ValueError(name)


def calib(name):
    n = SR * 3
    ev = [Ev(0.5, 1.7, REF_MIDI[name], 0.6, 'leg')]
    y = render_part(name, ev, n)
    seg = y[int(0.8 * SR):int(1.6 * SR)]
    if name == 'harp':
        seg = y[int(0.5 * SR):int(1.3 * SR)]
    rms = np.sqrt(np.mean(seg ** 2)) + 1e-12
    return S.dbl(TARGET[name]) / rms


def render_orchestra(op, n, cache):
    stems = {}
    for name, evs in op.ev.items():
        if name == 'timp' or not evs:
            continue
        key = cache.key('orch', VERSION, name, ev_sig(evs))
        hit = cache.get('o_' + name, key)
        if hit is None:
            y = render_part(name, evs, n) * calib(name)
            cache.put('o_' + name, key, y)
        else:
            y = hit
        stems[name] = y
        log(f'  {name}: {len(evs)} notes')
    key = cache.key('timp', VERSION, ev_sig(op.ev['timp']))
    hit = cache.get('o_timp', key)
    if hit is None:
        y, _ = S.timp_part(op.ev['timp'], n)
        y *= 0.5
        cache.put('o_timp', key, y)
    else:
        y = hit
    stems['timp'] = y
    return stems


# ------------------------------------------------------------------------------ effects

def render_sfx(op, n, cache):
    """Two stereo buses: 'house' (the audience around you) and 'stage' (thunder, bells, the pit's
    percussion)."""
    key = cache.key('sfx', VERSION, [sorted(d.items()) for d in op.sfx])
    hit_h = cache.get('sfx_house', key)
    hit_s = cache.get('sfx_stage', key)
    if hit_h is not None and hit_s is not None:
        return hit_h, hit_s
    rng = np.random.default_rng(31337)
    house = np.zeros((2, n))
    stage = np.zeros((2, n))
    for d in op.sfx:
        k, t, v = d['kind'], d['t'], d.get('vel', 0.5)
        if k == 'murmur':
            S.place(house, render_murmur(d['dur'], v, rng), t)
        elif k == 'applause':
            dur = d['dur']
            shp = d.get('shape', 'swell')
            if shp == 'swell':
                f = lambda x: S.smoothstep(x / 0.2) * (1 - S.smoothstep((x - 0.7) / 0.3))
            elif shp == 'fall':
                f = lambda x: S.smoothstep(x / 0.08) * (1 - S.smoothstep((x - 0.25) / 0.75)) ** 1.5
            else:
                f = lambda x: S.smoothstep(x / 0.05) * (1 - 0.25 * np.sin(x * 9) ** 2) * (1 - S.smoothstep((x - 0.82) / 0.18))
            a = S.applause(dur, rng, density=d.get('density', 50), peak=1.0, shape=f)
            S.place(house, a, t, gain=v * 0.45)
        elif k == 'bravo':
            S.place(house, render_bravo(d['dur'], v, rng), t, gain=0.3)
        elif k == 'cough':
            S.place(house, S.pan_st(S.cough(rng, None, v), -0.35), t, gain=0.8)
        elif k == 'baton':
            S.place(stage, S.pan_st(S.baton_tap(rng, v), 0.0), t, gain=0.5)
        elif k == 'bd':
            S.place(stage, S.pan_st(S.bass_drum(v, rng), 0.35), t, gain=0.5)
        elif k == 'cym':
            S.place(stage, S.pan_st(S.cymbal(v, rng), 0.22), t, gain=0.22)
        elif k == 'cymroll':
            S.place(stage, S.pan_st(S.cym_roll(d['dur'], v, rng), 0.22), t, gain=0.22)
        elif k == 'tamtam':
            S.place(stage, S.pan_st(S.tamtam(v, rng), 0.4), t, gain=0.3)
        elif k == 'bell':
            f = S.m2f(d.get('pitch', 60))
            y = S.church_bell(float(f), v, rng, dur=4.0 if d.get('small') else 9.0)
            y = S.bfilt(y, 'low', 5000.0)
            S.place(stage, S.pan_st(y, 0.55 if not d.get('small') else float(rng.uniform(-0.6, 0.6))), t, gain=0.22 if d.get('small') else 0.35)
        elif k == 'celesta':
            S.place(stage, S.pan_st(S.celesta_note(float(S.m2f(d['pitch'])), v, rng), -0.4), t, gain=0.35)
        elif k == 'thunder':
            y = S.thunder(rng, 5.5, v)
            S.place(stage, np.vstack([y, np.roll(y, 900)]), t, gain=0.5)
        elif k == 'wind':
            y = S.wind_sfx(d['dur'], rng, v)
            S.place(stage, np.vstack([y, np.roll(y, 4000)]), t, gain=0.5)
        elif k == 'owl':
            S.place(stage, S.pan_st(S.owl(rng, v), 0.7), t, gain=0.5)
        elif k == 'rumble':
            y = S.rumble(d['dur'], rng, v)
            S.place(stage, np.vstack([y, y]), t, gain=0.5)
        elif k == 'chomp':
            S.place(stage, S.pan_st(S.chomp(rng, v), 0.2), t, gain=0.4)
        elif k == 'clink':
            S.place(stage, S.pan_st(S.glass_clink(rng, v), 0.0), t, gain=0.6)
        elif k == 'shovel':
            S.place(stage, S.pan_st(S.shovel(rng, v), -0.35), t, gain=0.35)
        elif k == 'fire':
            y = S.fire_crackle(d['dur'], rng, v)
            S.place(stage, np.vstack([y, np.roll(y, 2500)]), t, gain=0.4)
        else:
            raise ValueError(k)
    cache.put('sfx_house', key, house)
    cache.put('sfx_stage', key, stage)
    return house, stage


# ------------------------------------------------------------------------------ mix

def env_follow(x, att=0.03, rel=0.4):
    """Smoothed amplitude envelope of a stereo/mono signal (for ducking)."""
    m = np.abs(x).max(axis=0) if x.ndim == 2 else np.abs(x)
    dec = 64
    m = m[: len(m) // dec * dec].reshape(-1, dec).max(axis=1)
    out = np.zeros_like(m)
    a_a = np.exp(-dec / (att * SR))
    a_r = np.exp(-dec / (rel * SR))
    prev = 0.0
    for i, v in enumerate(m):
        c = a_a if v > prev else a_r
        prev = c * prev + (1 - c) * v
        out[i] = prev
    full = np.repeat(out, dec)
    if x.shape[-1] > len(full):
        full = np.pad(full, (0, x.shape[-1] - len(full)), 'edge')
    return full


SOLO_GAIN = 0.5
CHOIR_GAIN = 0.42
BAL_DB = 6.0


def kpow_env(x, hop=2205, win=8):
    """K-weighted power (dB) every 50 ms, smoothed over win hops."""
    y = S.k_weight(x)
    n = y.shape[1] // hop
    p = (y[:, :n * hop].reshape(2, n, hop) ** 2).mean(axis=2).sum(axis=0)
    p = np.convolve(p, np.ones(win) / win, mode='same')
    return 10 * np.log10(p + 1e-12)


def balance_gain(voice, pit, target=6.0, hop=2205):
    V = kpow_env(voice)
    P = kpow_env(pit)
    active = V > (V.max() - 38.0)
    g = np.where(active, np.clip(V - P - target, -7.0, 4.0), 0.0)
    # slow, smooth moves: a conductor, not a compressor
    k = np.hanning(25)
    k /= k.sum()
    g = np.convolve(np.pad(g, 12, mode='edge'), k, mode='valid')
    gl = S.dbl(g)
    n = pit.shape[1]
    x = (np.arange(n) + 0.5) / hop - 0.5
    return np.interp(x, np.arange(len(gl)), gl)


def mix(op, n, voices, chorus, orch, house, stage, work):
    log('mixing')
    hall = S.hall_ir()
    big = S.hall_ir(dur=3.4, rt_lo=2.8, rt_mid=2.4, rt_hi=1.2, pre=0.035, seed=9)
    # pit
    pit = np.zeros((2, n))
    for name, y in orch.items():
        pan = PAN.get(name, 0.0)
        st = S.pan_st(y, pan)
        if name in ('vln1', 'vln2', 'vla', 'vc', 'cb'):
            st[1 if pan < 0 else 0] = np.roll(st[1 if pan < 0 else 0], int(0.0004 * SR))
        pit += st
    # voices
    solo = sum(voices.values()) * SOLO_GAIN
    choir = sum(chorus.values()) * CHOIR_GAIN
    # the conductor's balance: while anyone sings, keep the voices about BAL_DB over the pit,
    # holding the pit back (up to 7 dB) or letting it play out (up to 4 dB)
    g = balance_gain(solo + choir, pit, target=BAL_DB)
    pit_d = pit * g[None, :]
    # brighten and seat the voices
    solo = S.peq(solo, 3000.0, 2.0, 0.8)
    solo = S.bfilt(solo, 'high', 90.0)
    choir = S.bfilt(choir, 'high', 100.0)
    choir = S.peq(choir, 2500.0, 1.5, 0.8)
    pit_d = S.bfilt(pit_d, 'high', 28.0)
    dry = 1.0 * pit_d + solo + choir + 1.0 * stage + 0.9 * house
    wet = S.convolve_stereo(0.22 * pit_d + 0.24 * solo + 0.3 * choir + 0.3 * stage + 0.06 * house, hall)
    wet += S.convolve_stereo(0.1 * stage, big)
    mixd = dry + 0.55 * wet
    np.save(Path(work) / 'premaster.npy', mixd.astype(np.float32))
    return mixd


def master(x, target=-16.0, ceiling=-1.0):
    log('mastering')
    x = S.bfilt(x, 'high', 24.0)
    x = S.shelf(x, 9000.0, 1.0, high=True)
    x = S.compressor(x, thr_db=-20.0, ratio=1.8, att=0.03, rel=0.35)
    for _ in range(3):
        l = S.lufs(x)
        x = x * S.dbl(target - l)
        x = S.limiter(x, ceiling_db=ceiling - 0.3)
    tp = S.true_peak(x)
    if tp > ceiling:
        x *= S.dbl(ceiling - tp)
    return x


# ------------------------------------------------------------------------------ export

VCODE = {'a': 'a', 'e': 'e', 'i': 'i', 'o': 'o', 'u': 'u', '@': 'e', 'mm': 'M'}
LABIAL = {'m', 'b', 'p', 'f', 'v'}


def lipsync(op, who, vtype='S'):
    """Mouth segments [t0, t1, code, level] for a voice part: vowels a e i o u, M closed (m b p f v),
    c other consonants."""
    sing = Singer(vtype)
    out = []
    for ph in S.split_phrases(op.vox[who]):
        segs = sing.timeline(ph)
        for (p, ts, te, k) in segs:
            if p == '#':
                continue
            lvl = round(0.25 + 0.75 * ph[k].vel, 2)
            if p in S.VOWELS or p == 'mm':
                code = VCODE[p]
            elif p in LABIAL:
                code = 'M'
            else:
                code = 'c'
            out.append([round(ts, 3), round(te, 3), code, lvl])
    return out


def pit_activity(op, dur):
    """10 Hz activity strings per pit group: digits 0-9 (level), and the string articulation."""
    fr = 10
    N = int(dur * fr) + 1
    groups = {'str': ('vln1', 'vln2', 'vla', 'vc', 'cb'), 'wind': ('fl', 'ob', 'cl', 'bsn', 'picc'),
              'brass': ('hn', 'tpt', 'tbn', 'tuba'), 'harp': ('harp',), 'timp': ('timp',)}
    res = {}
    art = np.zeros(N, dtype=int)   # 0 none 1 arco 2 trem 3 pizz 4 stacc
    for g, parts in groups.items():
        a = np.zeros(N)
        for p in parts:
            for e in op.ev.get(p, []):
                i0 = int(e.t0 * fr)
                i1 = max(i0 + 1, int(e.t1 * fr))
                a[i0:i1] = np.maximum(a[i0:i1], e.vel)
                if g == 'str':
                    code = {'trem': 2, 'pizz': 3, 'stacc': 4, 'marc': 4}.get(e.art, 1)
                    art[i0:i1] = np.maximum(art[i0:i1], code)
        res[g] = ''.join(str(int(min(9, round(v * 10)))) for v in a)
    res['art'] = ''.join(str(int(v)) for v in art)
    return res


def export_score(op, env, path):
    sing = {}
    for who, vt in (('livia', 'S'), ('amadeo', 'T'), ('velena', 'A'), ('ossobuco', 'B')):
        sing[who] = lipsync(op, who, vt)
    sing['vill'] = lipsync(op, 'vill_S', 'S')
    sing['dead'] = lipsync(op, 'dead_S', 'S')
    data = {
        'title': "L'Amor che Morde",
        'subtitle': 'Opera in tre atti',
        'duration': round(op.duration, 3),
        'chapters': [[m[0], m[1], m[2]] for m in op.marks if m[3]],
        'numbers': [[m[0], m[1], m[2]] for m in op.marks if not m[3]],
        'subs': op.subs,
        'cues': op.cues,
        'beats': op.beats,
        'sing': sing,
        'pit': pit_activity(op, op.duration),
        'env': env,
    }
    txt = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    head = ("// L'Amor che Morde: the timing the page runs on. Generated by tools/amor_che_morde.py from\n"
            "// tools/amor_che_morde_score.py; do not edit by hand. Times are seconds into amor-che-morde.mp3.\n"
            "// chapters/numbers [t, id, label]; subs [t0, t1, who, italian, english]; cues [t, kind, ...args];\n"
            "// beats [t, beat in bar, beats per bar] (the Maestro's baton); sing[who] [t0, t1, mouth, level]\n"
            "// (mouth: a e i o u vowels, M closed lips, c other consonants); pit: 10 Hz activity digits;\n"
            "// env: 10 Hz loudness of the mix (0-99).\n")
    path.write_text(head + 'window.OPERA = ' + txt + ';\n', encoding='utf-8')
    log(f'wrote {path.relative_to(REPO)} ({len(txt) // 1024} KB)')


def spectro(x, path, title, t0=0.0):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    m = x.mean(axis=0)
    plt.figure(figsize=(16, 4.2))
    plt.specgram(m, NFFT=2048, Fs=SR, noverlap=1536, cmap='magma', vmin=-120, vmax=-20, xextent=(t0, t0 + len(m) / SR))
    plt.ylim(0, 9000)
    plt.title(title)
    plt.tight_layout()
    plt.savefig(path, dpi=70)
    plt.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', default=os.path.join(tempfile.gettempdir(), 'amor-che-morde-work'))
    ap.add_argument('--no-mp3', action='store_true')
    ap.add_argument('--section', nargs=2, type=float, default=None, help='only write a WAV excerpt t0 t1')
    ap.add_argument('--score-only', action='store_true', help='re-export score.js from the last render (cue edits only)')
    args = ap.parse_args()
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    cache = Cache(work)
    op = compose()
    if args.score_only:
        if (work / 'env.json').exists():
            env = json.loads((work / 'env.json').read_text())
        else:
            sr, y = wavfile.read(work / 'amor-che-morde.wav')
            y = y.astype(np.float64).mean(axis=1) / 32768.0
            hop = SR // 10
            m = np.sqrt((y[: len(y) // hop * hop].reshape(-1, hop) ** 2).mean(axis=1))
            env = np.clip((20 * np.log10(m + 1e-9) + 50) / 45 * 99, 0, 99).astype(int).tolist()
            (work / 'env.json').write_text(json.dumps(env))
        export_score(op, env, OUT_DIR / 'score.js')
        return
    n = int((op.duration + 1.0) * SR)
    log(f'score: {op.duration:.1f} s')
    voices = {}
    for who in SOLOISTS:
        voices[who] = render_soloist(op, who, n, cache)
        log(f'  sang {who}')
    chorus = {}
    for g in ('vill', 'dead'):
        chorus[g] = render_chorus(op, g, n, cache)
    orch = render_orchestra(op, n, cache)
    house, stage = render_sfx(op, n, cache)
    log('effects done')
    mixd = mix(op, n, voices, chorus, orch, house, stage, work)
    y = master(mixd)
    lu = S.lufs(y)
    tp = S.true_peak(y)
    log(f'master: {lu:.2f} LUFS, true peak {tp:.2f} dBTP')
    # loudness envelope for the page, 10 Hz
    hop = SR // 10
    m = np.sqrt((y.mean(axis=0)[: len(y[0]) // hop * hop].reshape(-1, hop) ** 2).mean(axis=1))
    mdb = 20 * np.log10(m + 1e-9)
    env = np.clip((mdb + 50) / 45 * 99, 0, 99).astype(int).tolist()
    (work / 'env.json').write_text(json.dumps(env))
    wav = work / 'amor-che-morde.wav'
    wavfile.write(wav, SR, (np.clip(y, -1, 1).T * 32767).astype(np.int16))
    log(f'wrote {wav}')
    # report: loudness per number, spectrograms per act
    rep = []
    marks = [m_ for m_ in op.marks] + [[op.duration, 'end', 'end', True]]
    for a, b in zip(marks, marks[1:]):
        i0, i1 = int(a[0] * SR), int(b[0] * SR)
        if i1 - i0 > SR:
            seg = y[:, i0:i1]
            rep.append((a[1], round(a[0], 1), round(S.lufs(seg), 1), round(20 * np.log10(np.abs(seg).max() + 1e-9), 1)))
    for r in rep:
        print('   %-14s %7.1f s  %6.1f LUFS  peak %5.1f dB' % r)
    chap = [m_ for m_ in op.marks if m_[3]] + [[op.duration, 'end', 'end', True]]
    for a, b in zip(chap, chap[1:]):
        i0, i1 = int(a[0] * SR), int(b[0] * SR)
        spectro(y[:, i0:i1], work / f'spec-{a[1]}.png', a[2], a[0])
    if args.section:
        i0, i1 = int(args.section[0] * SR), int(args.section[1] * SR)
        wavfile.write(work / 'excerpt.wav', SR, (np.clip(y[:, i0:i1], -1, 1).T * 32767).astype(np.int16))
    if not args.no_mp3:
        OUT_DIR.mkdir(exist_ok=True)
        mp3 = OUT_DIR / 'amor-che-morde.mp3'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '128k',
                        '-ar', '44100', str(mp3)], check=True)
        log(f'wrote {mp3.relative_to(REPO)} ({mp3.stat().st_size / 1e6:.2f} MB)')
        export_score(op, env, OUT_DIR / 'score.js')


if __name__ == '__main__':
    main()
