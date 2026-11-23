#!/usr/bin/env python3
"""NO SURVIVORS, "Keep Them Dancing": the soundtrack render (arrange, mix, master).

score.js (the source of truth) -> every part: double-tracked rhythm guitars hard left / right, bass, Granny's lead
(riffs, twin leads, the solo), the kit (played with baseball bats: wooden tock on every attack, fills, cymbals,
chokes), the perc lanes (heartbeat, bat clicks, crowd stomps and claps, road cases), organ, clean arpeggios, the
music box; every FX hit at its beat; the beds (rain, radio, room tones, chopper, thermal hum, applause); the voices
(ns_voices.render_all) -> mix (EQ carving: guitars vs vocal vs bass vs kick, sidechains, reverb sends, chokes, the
verse-2 low-pass, the tape stop, every gap silent but room tone and the FX scheduled in it, section automation) ->
master (-11 LUFS integrated over the band sections, true peak <= -1 dBTP; cold open, safe room, blackout and coda
clearly quieter) ->

  OUT/keep-them-dancing.wav             float32 stereo 44.1 kHz, exactly 180.0 s (the master)
  no-survivors/keep-them-dancing.mp3    stereo 44.1 kHz 192 kbps CBR, 180.0 s, sample-aligned with the WAV
  no-survivors/radio.js                 window.NS_RADIO = {mime, b64 (mono 64 kbps MP3), clips: {id: [from, to]}, ...}
  no-survivors/score.js                 vocals.spoken[].dur / .words (measured) + a top-level "audio" summary
  OUT/report.json, OUT/spectrogram.png, OUT/loudness.png, OUT/excerpts/<section>.wav|.png (10 s listen-proxies)

The 1987 bootleg (chorus 1 in E minor with the DEAD MEAT lyric, live, through a cassette, the crowd yelling ONE
MORE SONG between the lines, a fire bell from its 6th second, feedback, tape cut) is built once and used three
times: the radioTune glimpse at 0:00, the 0.3 s flashback at the mirror (294.25) and the board radio's 870 station.

Deterministic (every random choice is seeded) and cached per stem (OUT/work/stems, keyed by the renderer's source,
ns_synth / ns_voices and the score data it reads): a warm re-render after a mix change takes ~2-3 minutes.

usage: python3 tools/no_survivors_audio.py [--score PATH] [--out DIR] [--work DIR] [--mp3 PATH] [--radio-js PATH]
                                           [--no-repo] [--no-writeback] [--no-cache] [--no-excerpts] [--stems]
                                           [--strict] [--quiet]
"""
import argparse
import base64
import hashlib
import inspect
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent
sys.path.insert(0, str(TOOLS))
import ns_synth as S      # noqa: E402
import ns_voices as NV    # noqa: E402

SR = S.SR
BEAT, BAR, STEP = 0.4, 1.6, 0.1
DURATION = 180.0
N = int(round(DURATION * SR))
F32 = np.float32
VERSION = 'no_survivors_audio 1.0'
_T0 = time.time()
QUIET = False


def log(*a):
    if not QUIET:
        print(f'[ns_audio {time.time() - _T0:6.1f}s]', *a, flush=True)


def tb(beat):
    return float(beat) * BEAT


def ts(bar, step=0.0):
    return (bar * 16 + step) * STEP


def note_m(x):
    return int(S.note(x))


# =====================================================================================================
# score
# =====================================================================================================

def load_score(path):
    """Parse no-survivors/score.js -> (dict, header_text). The header is the // comment block before the one
    assignment line."""
    s = Path(path).read_text(encoding='utf-8')
    k = s.index('\nwindow.SCORE')
    i = s.index('{', k)
    return json.loads(s[i:s.rindex(';')]), s[:k + 1]


def hit_onsets(h):
    """SPEC 10.6: onsets are beat, beat + n, ... while < toBeat when `every` is given."""
    if h.get('every'):
        out, k = [], 0
        while h['beat'] + k * h['every'] < h['toBeat'] - 1e-9:
            out.append(h['beat'] + k * h['every'])
            k += 1
        return out
    return [h['beat']]


def gaps_s(score):
    return [(tb(g['fromBeat']), tb(g['toBeat'])) for g in score['gaps']]


def sections(score):
    return [(s['id'], ts(s['bars'][0]), ts(s['bars'][1])) for s in score['sections']]


BAND_SECTIONS = ('intro', 'verse1a', 'verse1b', 'pre1', 'chorus1', 'post1', 'verse2', 'chorus2', 'solo', 'lift',
                 'chorus3', 'ending')
QUIET_SECTIONS = ('coldopen', 'saferoom', 'blackout', 'coda')
# section loudness targets (integrated LUFS of the finished master; band sections average -11)
SECTION_TARGET = {'coldopen': -23.0, 'intro': -11.0, 'verse1a': -11.3, 'verse1b': -11.8, 'pre1': -11.0,
                  'chorus1': -10.5, 'post1': -11.0, 'saferoom': -22.0, 'verse2': -13.8, 'chorus2': -10.5,
                  'blackout': None, 'crescendo': -14.5, 'solo': -10.4, 'lift': -11.0, 'chorus3': -10.2,
                  'ending': -10.4, 'coda': -24.0}


def parse_art(art):
    a = {}
    for tok in (art or '').split():
        if tok[0] == 'b' and tok[1:].isdigit():
            a['bend'] = int(tok[1:])
        elif tok.startswith('dive') and tok[4:].isdigit():
            a['dive'] = int(tok[4:])
        else:
            a[tok] = True
    return a


def track_events(score, tid):
    """All note events of a pitched track (arrangement.tracks[tid] or SCORE.bass) as dicts:
    t, dur (s), pitches [MIDI], vel, art (dict), bar, step, pid."""
    R = score['riffs']
    arr = score['bass'] if tid == 'bass' else score['arrangement']['tracks'][tid]
    out = []
    for bar, ref in enumerate(arr):
        if ref is None:
            continue
        pid, semi = (ref, 0) if isinstance(ref, str) else (ref[0], int(ref[1]))
        for step, ln, pitch, vel, art in R[pid]['notes']:
            ps = [int(p) + semi for p in (pitch if isinstance(pitch, list) else [pitch])]
            out.append(dict(t=ts(bar, step), dur=ln * STEP, pitches=ps, vel=float(vel), art=parse_art(art), bar=bar,
                            step=step, pid=pid))
    out.sort(key=lambda e: (e['t'], e['pitches'][0]))
    return out


def lane_hits(rows, vel_map):
    """[(t, char, vel)] for one 112-bar lane string list ('r' = two 32nds)."""
    out = []
    for bar, row in enumerate(rows):
        for i, c in enumerate(row):
            if c == '.':
                continue
            t = ts(bar, i)
            if c == 'r':
                out += [(t, c, vel_map['r']), (t + STEP / 2, c, vel_map['r'] * 0.92)]
            else:
                out.append((t, c, vel_map.get(c, vel_map.get(c.lower(), 0.7)) * (1.0 if not c.isupper() else 1.0)))
    return out


def band_onsets(score):
    """Sorted onset times (s) of everything the band plays (tracks + drums + band perc)."""
    ts_ = []
    for tid in list(score['arrangement']['tracks']) + ['bass']:
        if tid == 'musicbox':
            continue
        ts_ += [e['t'] for e in track_events(score, tid)]
    for lane, rows in score['drums'].items():
        ts_ += [h[0] for h in lane_hits(rows, {'X': 1, 'x': 1, 'g': 1, 'r': 1, 'h': 1, 'm': 1, 'f': 1})]
    for lane, rows in score['perc'].items():
        if lane != 'choke':
            ts_ += [h[0] for h in lane_hits(rows, {'X': 1, 'x': 1, 'r': 1})]
    return np.array(sorted(ts_))


# =====================================================================================================
# stem cache
# =====================================================================================================

def _md5(b):
    return hashlib.md5(b).hexdigest()


_LIBHASH = None


def lib_hash():
    global _LIBHASH
    if _LIBHASH is None:
        _LIBHASH = _md5((TOOLS / 'ns_synth.py').read_bytes() + (TOOLS / 'ns_voices.py').read_bytes())[:12]
    return _LIBHASH


class Cache:
    def __init__(self, work, enabled=True):
        self.dir = Path(work) / 'stems'
        self.dir.mkdir(parents=True, exist_ok=True)
        self.enabled = enabled

    def get(self, name, fns, data, make):
        """Return make() (an array or a dict of arrays), cached under a key built from the sources of `fns`, the
        libraries and the JSON of `data`."""
        src = ''.join(inspect.getsource(f) for f in fns)
        key = _md5((VERSION + lib_hash() + src + json.dumps(data, sort_keys=True, default=str)).encode())[:14]
        path = self.dir / f'{name}_{key}.npz'
        if self.enabled and path.exists():
            with np.load(path, allow_pickle=False) as z:
                d = {k: z[k] for k in z.files}
            log(f'{name}: cache')
            return d['_'] if list(d) == ['_'] else d
        t0 = time.time()
        x = make()
        d = x if isinstance(x, dict) else {'_': x}
        np.savez(path, **{k: np.asarray(v, F32) for k, v in d.items()})
        for old in self.dir.glob(f'{name}_*.npz'):
            if old != path:
                old.unlink()
        log(f'{name}: rendered in {time.time() - t0:.1f} s')
        return {k: np.asarray(v, F32) for k, v in d.items()} if isinstance(x, dict) else np.asarray(x, F32)


def music_data(score):
    keys = ('riffs', 'bass', 'arrangement', 'drums', 'perc', 'gaps', 'duration', 'hits', 'sections')
    return {k: score.get(k) for k in keys}


# =====================================================================================================
# small instruments and FX of our own (everything else comes from ns_synth)
# =====================================================================================================

def heart_thump(kind='lub', vel=1.0, seed=0):
    """One heartbeat thump (mono): the LUB (deep ~48 Hz) or the DUB (~66 Hz, softer)."""
    r = np.random.default_rng(seed)
    f, tau = (48.0, 0.075) if kind == 'lub' else (66.0, 0.05)
    m = S.ns(0.32)
    u = S.tt(m)
    th = S._sweep_sine(f * (1 + 0.45 * np.exp(-u / 0.015)), m) * np.exp(-u / tau) * np.minimum(1, u / 0.005)
    th += S.lp(r.standard_normal(m), 180, 2) * np.exp(-u / 0.02) * 0.35
    th += S.bp(r.standard_normal(m), 300, 1200, 2) * np.exp(-u / 0.006) * 0.12     # the felt knock
    return S.fades(th / (np.abs(th).max() + 1e-9) * vel, 0.001, 0.04)


def bat_clack(vel=1.0, seed=0):
    """Tiny's two baseball bats clacked together (count-in): a deep, woody CLOK (mono)."""
    r = np.random.default_rng(700 + seed)
    m = S.ns(0.16)
    u = S.tt(m)
    k = r.uniform(0.97, 1.03)
    x = (np.sin(2 * np.pi * 780 * k * u) * np.exp(-u / 0.03) + 0.7 * np.sin(2 * np.pi * 1320 * k * u + 1) * np.exp(-u / 0.02)
         + 0.4 * np.sin(2 * np.pi * 2240 * k * u + 2) * np.exp(-u / 0.012) + 0.5 * np.sin(2 * np.pi * 410 * k * u) * np.exp(-u / 0.035))
    x += S.bp(r.standard_normal(m), 1500, 7000, 2) * np.exp(-u / 0.0015) * 1.6
    return S.fades(x / np.abs(x).max() * vel, 0.0001, 0.02)


def bat_tock(vel=1.0, seed=0):
    """The wooden tock a baseball bat adds to every drum attack (mono, very short)."""
    r = np.random.default_rng(760 + seed % 8)
    m = S.ns(0.05)
    u = S.tt(m)
    f = r.uniform(780.0, 1250.0)
    x = 0.45 * (np.sin(2 * np.pi * f * u) * np.exp(-u / 0.005) + 0.6 * np.sin(2 * np.pi * f * 1.83 * u + 1) * np.exp(-u / 0.0035))
    x += S.bp(r.standard_normal(m), 600, 5000, 2) * np.exp(-u / 0.002) * 1.4
    return S.fades(x / np.abs(x).max() * vel, 0.0001, 0.01)


def crowd_clap(vel=1.0, seed=0, count=140):
    """The whole pit clapping in perfect sync (stereo): `count` hands within a few ms, theatre space."""
    r = np.random.default_rng(1300 + seed)
    n = S.ns(1.2)
    out = np.zeros((n, 2))
    m = S.ns(0.03)
    u = S.tt(m)
    for k in range(count):
        fc = r.uniform(900, 2800)
        c = S.bp(r.standard_normal(m), fc * 0.55, min(fc * 3.0, 12000), 2) * np.exp(-u / r.uniform(0.002, 0.004))
        S.place(out, c * r.uniform(0.4, 1.0), 0.02 + r.normal(0, 0.006), 1.0, r.uniform(-0.9, 0.9))
    out = S.reverb(out, 'theatre', 0.35, 300.0, None, tail=False)
    return S.fades(S.peak_norm(out, 0.9 * vel), 0.0005, 0.2)


def megaphone_squeal(midi='B4', dur=0.8, seed=0):
    """Vex's megaphone feeding back (mono): a howl on `midi` swelling in, wobbling, jumping to its octave, then
    cut off; through the horn's band-pass and drive."""
    r = np.random.default_rng(seed)
    n = S.ns(dur)
    t = S.tt(n)
    f = float(S.hz(midi)) * 2 ** ((0.25 * S.smooth_noise(n, 3, seed) + 0.15 * np.sin(2 * np.pi * 6.0 * t)) / 12)
    jump = S.smoothstep((t - 0.55 * dur) / 0.03)
    x = (1 - 0.7 * jump) * (np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR))
    x += jump * 0.9 * np.sin(4 * np.pi * np.cumsum(f * 1.003) / SR)
    env = S.smoothstep(t / 0.12) ** 1.5 * (1 - S.smoothstep((t - (dur - 0.05)) / 0.05))
    x = x * env + S.bp(r.standard_normal(n), 2000, 6000, 2) * 0.03 * env
    x = S.bp(x, 420, 4200, 2)
    x = S.peq(x, 2100, 6, 1.5)
    x = np.tanh(3.0 * x / (np.abs(x).max() + 1e-9))
    return S.fades(S.peak_norm(x, 0.85), 0.002, 0.01)


def impact_boom(dur=1.6, seed=0):
    """A cinematic low impact under the title hit (stereo): sub sweep 70 -> 32 Hz and a noise thump."""
    r = np.random.default_rng(seed)
    n = S.ns(dur)
    t = S.tt(n)
    sub = S._sweep_sine(32 + 40 * np.exp(-t / 0.06), n) * np.exp(-t / 0.5) * np.minimum(1, t / 0.002)
    th = S.lp(r.standard_normal(n), 220, 2) * np.exp(-t / 0.05) * 0.8
    y = S.stereo(sub + th)
    y += S.reverb(S.hp(r.standard_normal(n), 300, 2) * np.exp(-t / 0.01) * 0.3, 'hall', 1.0, 200.0, None, tail=False)
    return S.fades(S.peak_norm(y, 0.9), 0.0005, 0.3)


def wiper(seed=0):
    """One windscreen-wiper stroke heard inside the van (mono): rubber swish across wet glass + a soft thunk."""
    r = np.random.default_rng(seed)
    n = S.ns(0.36)
    t = S.tt(n)
    sw = S.tvf(r.standard_normal(n), 'bp', 900 + 1300 * np.sin(np.pi * t / 0.36), 1.5, 128) * np.sin(np.pi * t / 0.36) ** 2
    th = S._sweep_sine(110 * (1 + 0.3 * np.exp(-np.maximum(t - 0.3, 0) / 0.01)), n) * np.exp(-np.maximum(t - 0.3, 0) / 0.03) * (t > 0.3)
    return S.fades(S.peak_norm(0.6 * sw + 0.5 * th, 0.7), 0.003, 0.02)


def knob_click(seed=0):
    """The radio's volume knob turned up (mono): a few detent clicks."""
    r = np.random.default_rng(seed)
    out = np.zeros(S.ns(0.25))
    m = S.ns(0.012)
    for k in range(4):
        c = S.bp(r.standard_normal(m), 2500, 8000, 2) * np.exp(-S.tt(m) / 0.0012)
        S.place(out, c * (0.5 + 0.12 * k), 0.045 * k)
    return S.fades(S.peak_norm(out, 0.6), 0.0001, 0.01)


def phone_blips(seed=0, count=70, spread=0.45):
    """Hundreds of phones starting to record across the pit (stereo): tiny, distant digital blips."""
    r = np.random.default_rng(seed)
    n = S.ns(spread + 0.6)
    out = np.zeros((n, 2))
    for k in range(count):
        m = S.ns(0.05)
        u = S.tt(m)
        f = r.choice([1568.0, 2093.0, 2637.0]) * r.uniform(0.99, 1.01)
        b = np.sin(2 * np.pi * f * u) * np.exp(-u / 0.012) * (u < 0.04)
        S.place(out, b * r.uniform(0.2, 1.0), abs(r.normal(0, spread / 2.5)), 1.0, r.uniform(-0.95, 0.95))
    out = S.reverb(S.lp(out, 6000, 2), 'theatre', 0.5, 300.0, None, tail=False)
    return S.fades(S.peak_norm(out, 0.6), 0.002, 0.2)


def roadie_stomp(seed=0):
    """One foot of the Roadie (3x a man) hitting the stage (stereo): a sub boom and the boards jumping."""
    y = S.big_thud(seed=seed)
    y = S.lp(y, 1800, 2) + 0.3 * S.hp(y, 1800, 2)
    return S.peak_norm(y, 0.9)


def knee_clip(x, th=0.7):
    """Soft-knee peak clipper (2x oversampled): transparent below th, tanh-rounds the overshoot above it."""
    x = np.asarray(x, float)
    n = x.shape[0]
    up = signal.resample_poly(x, 2, 1, axis=0)
    a = np.abs(up)
    over = a > th
    y = up.copy()
    k = 1.0 - th
    y[over] = np.sign(up[over]) * (th + k * np.tanh((a[over] - th) / k))
    return signal.resample_poly(y, 1, 2, axis=0)[:n]


def zp_band(x, lo, hi, order=2):
    """Zero-phase band-pass (its complement x - band is an exact zero-phase band-stop)."""
    sos = signal.butter(order, [lo, hi], 'band', fs=SR, output='sos')
    return signal.sosfiltfilt(sos, x, axis=0)


def env_db(x, attack=0.005, release=0.15, win=0.01):
    """Smoothed level envelope in dB (peak-ish RMS)."""
    m = S.mono(x) if np.ndim(x) == 2 else np.asarray(x, float)
    a = np.exp(-1.0 / (win * SR))
    p = signal.lfilter([1 - a], [1, -a], m * m)
    return S._env_follow(10 * np.log10(p + 1e-12), attack, release)


# =====================================================================================================
# the parts
# =====================================================================================================

def _gtr_events(evs, humanize_vel=True):
    """Score events -> (gtr_track events, pick slides, feedback notes)."""
    out, slides, fbs = [], [], []
    for e in evs:
        a = e['art']
        if a.get('fb'):
            fbs.append(e)
            continue
        if a.get('slideDn') or a.get('slideUp'):
            slides.append(e)
            continue
        if a.get('trem'):
            k, tot = 0, int(round(e['dur'] / (STEP / 2)))
            while k < tot:
                out.append(dict(t=e['t'] + k * STEP / 2, dur=STEP / 2, notes=e['pitches'],
                                vel=e['vel'] * (0.82 + 0.18 * k / max(1, tot - 1)), palm=0.15,
                                dir='down' if k % 2 == 0 else 'up', strum=0.003))
                k += 1
            continue
        pm = bool(a.get('pm'))
        out.append(dict(t=e['t'], dur=e['dur'], notes=e['pitches'], vel=e['vel'], palm=0.85 if pm else 0.0,
                        ring=bool(a.get('ring')), bright=0.66 if pm else 0.7))
    return out, slides, fbs


def render_rhythm(score, side):
    """One rhythm guitar (side 'L' = gtrL take A, cab A; 'R' = gtrR take B, cab B): mono, post-amp."""
    tid = 'gtr' + side
    evs = track_events(score, tid)
    ev, slides, fbs = _gtr_events(evs)
    seed, det, cab = (101, 3.0, 'A') if side == 'L' else (202, -3.0, 'A')
    di = S.gtr_track(ev, DURATION, seed=seed, humanize=0.7, detune=det, tight=1.4)
    for e in slides:
        x = S.pick_slide(e['dur'], down=bool(e['art'].get('slideDn')), seed=seed + int(e['t'] * 10))
        S.place(di, x * 0.9, e['t'])
    y = S.amp(di, 'rhythm', cab=cab, gain=1.0 if side == 'L' else 1.1, mid=-1.0 if side == 'L' else -2.0,
              treble=-2.0 if side == 'L' else -1.0, presence=0.5)
    for e in fbs:
        m = e['pitches'][-1]
        fb = S.feedback(m, e['dur'] + 0.05, swell=0.6 * e['dur'], preset='lead', from_note=m - 12, seed=seed + m)
        S.place(y, S.fades(fb, 0.01, 0.03) * 0.8 * e['vel'], e['t'])
    return y


def render_bass(score):
    """Noodle's picked bass (mono)."""
    ev = []
    for e in track_events(score, 'bass'):
        a = e['art']
        m = e['pitches'][0]
        if a.get('trem'):
            k, tot = 0, int(round(e['dur'] / (STEP / 2)))
            while k < tot:
                ev.append(dict(t=e['t'] + k * STEP / 2, dur=STEP / 2, midi=m, vel=e['vel'] * (0.85 + 0.15 * k / max(1, tot - 1)),
                               palm=0.3))
                k += 1
            continue
        d = dict(t=e['t'], dur=e['dur'], midi=m, vel=e['vel'], palm=0.85 if a.get('pm') else 0.0)
        if a.get('buzz'):
            d.update(sag=50.0, buzz=0.55)
        ev.append(d)
    return S.bass(ev, DURATION, drive=0.62, blend=0.55, seed=5, humanize=0.7)


def _lead_voices(evs):
    """Split lead events into monophonic voices (index 0 = the lowest note of a chord) -> lead_line notes."""
    voices = [[], []]
    fbs = []
    for e in evs:
        a = e['art']
        if a.get('fb'):
            fbs.append(e)
            continue
        for v, p in enumerate(sorted(e['pitches'])[:2]):
            d = dict(t=e['t'], dur=e['dur'], midi=p, vel=e['vel'])
            if a.get('hammer'):
                d['kind'] = 'hammer'
            if a.get('tap'):
                d['kind'] = 'tap'
            if a.get('bend'):
                d['midi'] = p - a['bend']
                d['bend'] = a['bend']
                d['bend_t'] = 0.14
            if a.get('vib'):
                d.update(vib=0.3, vib_delay=0.15)
            if a.get('vibw'):
                d.update(vib=0.6, vib_delay=0.12 if not a.get('bend') else 0.2)
            if a.get('harm'):
                d['pinch'] = 3
            if a.get('dive'):
                d['dive'] = -float(a['dive'])
                d['dive_t'] = max(0.2, e['dur'] * 0.9)
            voices[v].append(d)
    return voices, fbs


def render_lead(score):
    """Granny's lead (stereo, dry): voice 0 at +0.15, the twin-lead harmony at -0.45, feedback pedals."""
    evs = track_events(score, 'lead')
    voices, fbs = _lead_voices(evs)
    out = np.zeros((N, 2))
    for v, notes in enumerate(voices):
        if not notes:
            continue
        di = S.lead_line(notes, DURATION, seed=7 + 31 * v, bright=0.72, humanize=0.8, detune=0.0 if v == 0 else -5.0)
        y = S.amp(di, 'lead', cab='C' if v == 0 else 'B', gate_db=-60.0)
        out += S.stereo(y, 0.15 if v == 0 else -0.45) * (1.0 if v == 0 else 0.85)
    for e in fbs:
        m = e['pitches'][0]
        fb = S.feedback(m, e['dur'] + 0.05, swell=0.5 * e['dur'], preset='lead', from_note=m - 12, seed=77 + m)
        S.place(out, S.stereo(S.fades(fb, 0.02, 0.05) * 0.6 * e['vel'], 0.15), e['t'])
    return out


def _drum_hits(score):
    """The kit's hits for drum_track: (t, piece, vel) / dicts with chokes. Crescendo bars (74-81) separately."""
    D = score['drums']
    V = {'kick': {'X': 1.0, 'x': 0.86, 'g': 0.4, 'r': 0.75}, 'snare': {'X': 1.0, 'x': 0.78, 'g': 0.3, 'r': 0.62},
         'hat': {'X': 0.85, 'x': 0.62, 'g': 0.35, 'r': 0.5}, 'open': {'X': 0.75, 'x': 0.55, 'r': 0.5},
         'crash': {'X': 1.0, 'x': 0.8, 'r': 0.7}, 'ride': {'X': 0.9, 'x': 0.72, 'r': 0.6}, 'bell': {'X': 0.5, 'x': 0.4},
         'tom': {'X': 1.0, 'x': 0.75, 'h': 0.78, 'm': 0.78, 'f': 0.8, 'H': 1.0, 'M': 1.0, 'F': 1.0}}
    chokes = [h[0] for h in lane_hits(score['perc']['choke'], {'x': 1, 'X': 1})] + [a for a, b in gaps_s(score)]
    chokes = np.array(sorted(chokes))
    hits = []
    hat_t = sorted(h[0] for lane in ('hat', 'open') for h in lane_hits(D[lane], V[lane]))
    n_crash = 0
    for lane in ('kick', 'snare', 'hat', 'open', 'crash', 'ride', 'tom'):
        for t, c, v in lane_hits(D[lane], V[lane]):
            bar = int(t / BAR + 1e-6)
            if lane == 'kick':
                hits.append((t, 'kick', v))
            elif lane == 'snare':
                hits.append((t, 'ghost' if c == 'g' else 'snare', v))
                if c != 'g':
                    hits.append((t, 'tock', 0.28 * v))
            elif lane == 'hat':
                hits.append((t, 'hat', v))
            elif lane == 'open':
                nxt = [h for h in hat_t if h > t + 0.01]
                ch = min(0.34, (nxt[0] - t) * 0.92) if nxt else 0.34
                hits.append(dict(t=t, piece='hat_open', vel=v, choke=ch))
            elif lane in ('crash', 'ride'):
                piece = ('crash' if n_crash % 2 == 0 else 'crash2') if lane == 'crash' else ('bell' if 92 <= bar < 100 else 'ride')
                if lane == 'crash':
                    n_crash += 1
                    if c == 'X' and bar in (8, 36, 64, 82, 92, 105):
                        hits.append((t + 0.004, 'china' if bar in (82, 92) else 'crash2', 0.75))
                nx = chokes[chokes > t + 0.02]
                d = dict(t=t, piece=piece, vel=V['bell'].get(c, 0.4) if piece == 'bell' else v)
                if len(nx) and nx[0] - t < 4.0:
                    d['choke'] = float(nx[0] - t)
                hits.append(d)
                hits.append((t, 'tock', 0.18 * v))
            elif lane == 'tom':
                piece = {'h': 'bat_tom1', 'm': 'bat_tom2', 'f': 'bat_tom3'}[c.lower()]
                hits.append((t, piece, v))
                hits.append((t, 'tock', 0.3 * v))
    return hits


TOM_TUNING = {'tom1': 110.0, 'tom2': 87.3, 'tom3': 65.4}      # A2 / F2 / C2 (arrangement.mix.drums)
S.TOM_F.update(TOM_TUNING)


def render_drums(score):
    """The kit (stereo mix + a mono kick key). Toms tuned ~A2/F2/C2; bats on everything; the acoustic crescendo
    (bars 74-81) is rendered in the theatre's room."""
    orig = S.drum_hit

    def drum_hit(piece, vel=1.0, rr=0):
        if piece == 'tock':
            return bat_tock(vel, rr), 'snare', 0.0
        return orig(piece, vel, rr)
    S.drum_hit = drum_hit
    try:
        hits = _drum_hits(score)
        c0, c1 = ts(74), ts(82)

        def tof(h):
            return h['t'] if isinstance(h, dict) else h[0]
        main = [h for h in hits if not (c0 <= tof(h) < c1)]
        cres = [h for h in hits if c0 <= tof(h) < c1]
        a = S.drum_track(main, DURATION, humanize=0.8, seed=3, room=0.3, comp=0.0, overhead_bleed=0.22, stems=True)
        b = S.drum_track(cres, DURATION, humanize=1.0, seed=4, room=0.62, comp=0.0, overhead_bleed=0.3, stems=True,
                         room_kind='theatre')
    finally:
        S.drum_hit = orig
    return {k: a[k] + b[k] for k in ('kick', 'snare', 'tom', 'cym', 'room')}


def drum_bus(d, cym_db=-5.0, room_db=0.0, comp=0.4):
    """The kit's bus from its stems (pre-bus sum = the kit): cymbals on their own fader (and a softer top), then
    parallel compression and the bus soft clip as in ns_synth.drum_track."""
    cy = S.shelf(np.asarray(d['cym'], float), 7500.0, -2.0, 'high') * S.undb(cym_db)
    sn = S.peq(np.asarray(d['snare'], float), 210.0, 2.0, 1.2)
    bus = np.asarray(d['kick'], float) + sn + np.asarray(d['tom'], float) + cy + np.asarray(d['room'], float) * S.undb(room_db)
    if comp:
        bus = S.parallel_comp(bus, comp, -32.0, 8.0, 0.0015, 0.09)
    return S.softclip(bus * 1.1, 1.2) / 1.1


def render_perc(score):
    """The perc lanes (stereo): heartbeat (mono centre), Tiny's bat clicks, crowd stomps, synced claps, bats on
    road cases."""
    P = score['perc']
    out = np.zeros((N, 2))
    for k, (t, c, v) in enumerate(lane_hits(P['heart'], {'X': 1.0, 'x': 0.62})):
        S.place(out, heart_thump('lub' if c == 'X' else 'dub', v, seed=k % 5) * 0.9, t)
    for k, (t, c, v) in enumerate(lane_hits(P['sticks'], {'X': 1.0, 'x': 0.8})):
        S.place(out, bat_clack(v, k), t, 0.8, 0.05)
    for k, (t, c, v) in enumerate(lane_hits(P['stomp'], {'X': 1.0, 'x': 0.8})):
        S.place(out, S.crowd_stomp(count=90, vel=v, spread=0.022, seed=40 + k % 6, space='theatre'), t - 0.05, 0.9)
    for k, (t, c, v) in enumerate(lane_hits(P['clap'], {'X': 1.0, 'x': 0.8})):
        S.place(out, crowd_clap(v, seed=k % 6), t - 0.02, 0.55)
    for k, (t, c, v) in enumerate(lane_hits(P['case'], {'X': 1.0, 'x': 0.8})):
        S.place(out, S.bat_on_case(v, k % 4), t, 0.5, -0.25)
    return out


def render_organ(score):
    """The organ (stereo): drawbar tones summed into one continuous Leslie; the registration follows the section;
    the Leslie speeds up for the final chorus."""
    evs = track_events(score, 'organ')
    raw = np.zeros(N + S.ns(1.0))
    reg = [('coldopen', 0, 8, 'horror'), ('saferoom', 48, 56, 'soft'), ('verse2', 56, 64, 'pad'),
           ('lift', 90, 92, 'gospel'), ('chorus3', 92, 104, 'pad'), ('ending', 104, 106, 'theatre')]
    for k, e in enumerate(evs):
        rg = next((r for (_, b0, b1, r) in reg if b0 <= e['bar'] < b1), 'pad')
        att = 0.5 * e['dur'] if e['art'].get('swell') else 0.012
        x = S.organ_tone(e['pitches'], e['dur'], registration=rg, click=0.35 if not e['art'].get('swell') else 0.0,
                         seed=k, attack=att, release=0.05)
        S.place(raw, x * e['vel'], e['t'])
    raw = raw[:N]
    t = S.tt(N)
    k = S.smoothstep((t - ts(91, 8)) / 1.2)
    horn = 0.83 + (6.5 - 0.83) * k
    drum = 0.70 + (5.6 - 0.70) * S.smoothstep((t - ts(91, 8)) / 2.5)
    y = S.leslie(raw, (horn, drum), drive=0.18, seed=3)
    return S.lp(y, 9000.0, 2)


def render_clean(score):
    """Clean arpeggios (stereo): clean amp, soft tremolo, chorus."""
    evs = track_events(score, 'clean')
    ev = [dict(t=e['t'], dur=e['dur'], notes=e['pitches'], vel=e['vel'], ring=True, bright=0.62) for e in evs]
    di = S.gtr_track(ev, DURATION, seed=55, humanize=0.8)
    y = S.amp(di, 'clean', cab='C')
    t = S.tt(N)
    y = y * (1.0 - 0.13 * (0.5 + 0.5 * np.sin(2 * np.pi * 4.6 * t)))
    return S.chorus(S.stereo(y, -0.35), 9.0, 2.2, 0.7, 0.35)


def render_musicbox(score):
    """The music box (stereo): the safe room (stops dead with its catch at beat 216) and the coda (runs down, the
    spring's click at 447.9, before STOPS)."""
    evs = track_events(score, 'musicbox')
    out = np.zeros((N, 2))
    hits = {h['type']: h for h in score['hits']}
    for lo, hi in ((48, 56), (106, 112)):
        t0 = ts(lo) - 0.25                       # the box is wound a moment before its first note
        part = [dict(t=e['t'] - t0, midi=e['pitches'][0], vel=e['vel'], dur=2.2) for e in evs if lo <= e['bar'] < hi]
        if not part:
            continue
        if lo == 48:
            stop = (tb(hits['musicBox']['toBeat'] + 1) if 'musicBox' in hits else ts(54)) - t0
            y = S.music_box_line(part, stop + 0.3, mech=0.3, stop_at=stop, seed=48, room=0.3)
            i = int(stop * SR) + S.ns(0.012)
            y[i:] *= np.exp(-np.arange(y.shape[0] - i) / (0.02 * SR))[:, None]
        else:
            stop = (tb(hits['musicBoxCoda']['toBeat']) if 'musicBoxCoda' in hits else ts(111, 15.6)) - t0
            slow = part[-4]['t'] - 0.4 if len(part) >= 4 else stop - 3.0
            y = S.music_box_line(part, DURATION - t0, mech=0.35, slow_from=slow, stop_at=stop, seed=110, room=0.3)
        y = S.fades(y, 0.2, 0.002)
        S.place(out, y, t0)
    return out


# =====================================================================================================
# the 1987 bootleg
# =====================================================================================================

def render_bootleg(score, st, bvox):
    """The 1987 audience tape (mono, 16 s): chorus 1 (bars 36-43) played live with the DEAD MEAT lyric, the crowd
    yelling ONE MORE SONG in the answer slots, a fire bell from 6 s, then two bars of the last chord feeding back
    under the crowd's chant, and the tape cut."""
    bl = score['arrangement'].get('bootleg1987') or {}
    b0, b1 = (bl.get('bars') or [36, 44])
    T0, L = ts(b0), ts(b1 - b0 + 2)
    n = S.ns(L)
    i0 = int(round(T0 * SR))
    band = np.zeros(n)
    body = S.ns(ts(b1 - b0))

    def cut(x, k=1.0):
        seg = S.mono(x[i0:i0 + body]) if np.ndim(x) == 2 else x[i0:i0 + body]
        band[:len(seg)] += k * np.asarray(seg, float)
    cut(st['gtrL'], 0.75)
    cut(st['gtrR'], 0.75)
    cut(st['bass'], 0.55)
    cut(st['drums'], 0.85)
    # the tail: the last chord (E5) rung and left feeding back, a crash, floor-tom 8ths under the chant
    tl = ts(b1 - b0)
    di = S.gtr_track([dict(t=0.0, dur=3.3, notes=[40, 47, 52, 55], vel=1.0, ring=True)], 3.4, seed=87)
    ch = S.amp(di, 'rhythm', cab='A')
    fb = S.feedback(76, 3.2, swell=2.4, preset='lead', from_note=64, seed=87)
    fb2 = S.feedback(83, 2.0, swell=1.6, preset='lead', seed=88)
    tail = S.pad_to(ch, S.ns(3.4)) * 0.9 + S.pad_to(fb, S.ns(3.4)) * 0.9
    S.place(tail, fb2 * 0.6, 1.3)
    hits = [(0.0, 'crash', 1.0), (0.0, 'kick', 1.0), (0.0, 'snare', 1.0)]
    hits += [(0.4 * k, 'bat_tom3', 0.6 + 0.05 * k) for k in range(1, 8)]
    dr = S.mono(S.drum_track(hits, 3.4, room=0.5, seed=9))
    tail += S.pad_to(dr, S.ns(3.4)) * 0.8
    S.place(band, tail, tl)
    # a live band in a theatre heard from the floor: lots of room, the PA's honk
    band = S.mono(S.reverb(band, 'theatre', 0.42, 150.0, None, tail=False))
    band = S.peq(S.hp(band, 110, 2), 1000, 3.0, 0.8)
    vox = S.mono(S.pad_to(bvox, n))
    bell = S.fire_alarm_bell(L - 6.0, rate=18.0, seed=1987)
    bell = S.mono(S.reverb(bell, 'stairwell', 0.5, 300.0, None, tail=False))
    fire = S.mono(S.fire(L - 9.0, 0.8, seed=31))
    crowd = S.mono(S.crowd_murmur(L, size=60, seed=1987)) * np.linspace(0.6, 1.4, n)
    mix = np.zeros(n)
    mix += band / (S.rms(band) + 1e-9) * 0.10
    mix += vox / (S.rms(vox) + 1e-9) * 0.075
    S.place(mix, bell / (S.rms(bell) + 1e-9) * 0.035, 6.0)
    S.place(mix, fire / (S.rms(fire) + 1e-9) * 0.02 * np.linspace(0.2, 1.0, len(fire)), 9.0)
    mix += crowd / (S.rms(crowd) + 1e-9) * 0.025
    # the cassette: no built-in wow (ours is 0.4 Hz / 6 Hz), band 120 Hz - 6 kHz, hiss, dropouts, the cut
    y = S.cassette(mix, wow=0.0, flutter=0.0, hiss=0.025, dropouts=2, band=(120.0, 6000.0), drive=0.45,
                   cut_click=True, seed=87)
    t = S.tt(n)
    sp = 1.0 + 0.0040 * (np.sin(2 * np.pi * 0.4 * t) + 0.3 * S.smooth_noise(n, 0.6, 5)) + 0.0013 * np.sin(2 * np.pi * 6.0 * t)
    d = np.cumsum(1.0 - sp)
    y = S.frac_delay(y, d - d.min() + 2.0)
    y = S.fades(y, 0.01, 0.0)
    y[-S.ns(0.012):] = 0.0
    return S.peak_norm(y, 0.9)


# =====================================================================================================
# FX hits and beds
# =====================================================================================================

PREROLL_TYPES = ('titleRiser',)                    # layers that swell INTO a hit (their end is the beat)
SOFT_TYPES = ('skid', 'curtainFire', 'frisbee', 'phonesUp', 'genCatch', 'vexSqueal', 'thunder', 'burn',
              'radioTune')                         # onset = where the sound starts (swells, beds, rumbles)


def sfx_plan(score, boot, boot_info):
    """Every sound-effect hit: list of dicts {type, beat, t (the beat in s), audio, at (placement s), gain (dB),
    pan, anchor (s into the clip that lands on the beat), band (False)}. Hits whose sound is in the parts or the
    voices are not here (titleHit/bandHit/finalHit get only an impact layer)."""
    P = []
    rr = {}

    def add(h, beat, audio, gain, pan=0.0, anchor=0.0, kind=None):
        k = rr.get(h['type'], 0)
        rr[h['type']] = k + 1
        typ = kind or h['type']
        P.append(dict(type=typ, beat=beat, t=tb(beat), audio=audio, gain=gain, pan=pan, anchor=anchor,
                      at=tb(beat) - anchor, check='none' if typ in PREROLL_TYPES else
                      ('start' if typ in SOFT_TYPES else 'attack')))
    yells = boot_info.get('yells') or [dict(t=9.1, song=9.58)]
    for h in score['hits']:
        typ = h['type']
        for j, beat in enumerate(hit_onsets(h)):
            k = rr.get(typ, 0)
            span = tb(h['toBeat'] - beat) if 'toBeat' in h and not h.get('every') else None
            if typ == 'radioTune':
                dur = max(0.6, span or 0.6)
                seg = boot[S.ns(9.45):S.ns(9.45) + S.ns(0.5)]
                x = S.radio_tune(dur + 0.25, catches=[(0.32, seg, 0.5)], settle=0.2, seed=13)
                add(h, beat, S.fades(x, 0.004, 0.03), -16, 0.25)
            elif typ == 'radioUp':
                add(h, beat, knob_click(seed=3), -30, 0.3)
            elif typ == 'thunder':
                dist = float(h.get('k', 0.35 if k else 0.5))
                x = S.thunder(5.0 if k == 0 else 6.0, distance=dist, seed=21 + k)
                add(h, beat, S.lp(x, 2500 if k == 0 else 4000, 2), -15 if k == 0 else -12)
            elif typ == 'titleHit':
                add(h, beat, impact_boom(seed=32), -9, kind='titleBoom')
                rc = S.reverse_crash(1.2, size=19)
                add(h, beat, rc, -17, -0.1, anchor=len(rc) / SR, kind='titleRiser')
            elif typ == 'zombieBonk':
                x = S.stereo(S.body_bonk(pitch=[1.0, 1.25, 0.85, 1.1][k % 4], seed=k))
                add(h, beat, S.reverb(x, 'street', 0.2, 200.0, None, tail=False), -10, [-0.4, 0.4, -0.2, 0.3][k % 4])
            elif typ == 'skid':
                add(h, beat, S.car_skid(max(1.0, span or 1.0) + 0.15, seed=60), -12, -0.2)
            elif typ == 'carCrash':
                add(h, beat, S.car_crash(seed=62), -3, 0.0)
            elif typ == 'lick' and h.get('part') == 'sfx':
                add(h, beat, megaphone_squeal('B4', 0.78, seed=70), -13, -0.3, kind='vexSqueal')
            elif typ == 'pump':
                add(h, beat, S.shotgun_pump(seed=79), -9, 0.3)
            elif typ == 'shotgun':
                add(h, beat, S.shotgun(seed=150 + k, space='street'), -5.5, [0.25, -0.2, 0.3, -0.15, 0.2][k % 5])
                if k in (0, 2):
                    add(h, beat + 1.0, S.shell_tink(seed=151 + k), -17, 0.5, kind='shellTink')
            elif typ == 'reload':
                add(h, beat, S.shotgun_reload(1, seed=163), -9, 0.3)
            elif typ == 'doorSlam':
                add(h, beat, S.door_slam(seed=192), -5, 0.0)
            elif typ == 'doorPound':
                add(h, beat, S.stereo(S.door_pound(seed=200 + j % 4)), -13, 0.0)
            elif typ == 'pills':
                t0, t1 = tb(h['beat']), tb(h['toBeat'])
                times = list(np.arange(t0, t1 - 1e-6, STEP))
                acc = [1.0 if i % 2 == 0 else 0.55 for i in range(len(times))]
                x = S.pill_shaker([tt_ - t0 + 0.02 for tt_ in times], t1 - t0 + 0.4, accents=acc, seed=198)
                add(h, beat, x, -22, 0.35, anchor=0.0)
            elif typ == 'knock':
                add(h, beat, S.door_knock(seed=218 + k, hard=0.75), -13, 0.0)
            elif typ == 'tinyKnock':
                for o in (0.0, 0.5):
                    add(h, beat + o, S.door_knock(seed=223 + int(o * 2), hard=1.0), -10, 0.05)
            elif typ == 'doorBurst':
                add(h, beat, S.door_burst(seed=224), -4, 0.0)
            elif typ == 'sparks':
                add(h, beat, S.spark_zap(0.7, seed=246), -10, 0.35)
                x = S.amp_power_on(hum_dur=1.0, seed=246)
                add(h, beat + 0.25, S.fades(x, 0.001, 0.25), -17, 0.4, kind='ampThunk')
            elif typ == 'flashlightClick':
                add(h, beat, S.flashlight_click(seed=290 + k), -24, [-0.3, 0.35][k % 2])
            elif typ == 'phonesUp':
                add(h, beat, phone_blips(seed=292), -38, 0.0)
            elif typ == 'flashback':
                span = tb(h['toBeat'] - h['beat'])
                song = yells[min(2, len(yells) - 1)]['song']
                a = max(0.0, song - 0.15)
                seg = np.array(boot[S.ns(a):S.ns(a) + S.ns(span)], float)
                fr = S.mono(S.fire(span + 0.05, 1.4, seed=294))[:len(seg)]
                bell = S.fire_alarm_bell(span + 0.05, seed=295)[:len(seg)]
                x = seg / (S.rms(seg) + 1e-9) * 0.1 + fr / (S.rms(fr) + 1e-9) * 0.03 + bell / (S.rms(bell) + 1e-9) * 0.02
                x = S.fades(x, 0.004, 0.003)
                ck = S.bp(np.random.default_rng(5).standard_normal(S.ns(0.006)), 500, 6000, 2) * 0.5
                S.place(x, ck / (np.abs(ck).max() + 1e-9) * np.abs(x).max() * 0.8, len(x) - S.ns(0.006))
                add(h, beat, S.peak_norm(x, 0.9), -16, 0.0)
            elif typ == 'genPull':
                outcome = 'backfire' if k == 2 else 'sputter'
                add(h, beat, S.generator_pull(h.get('pitch', 'C3'), outcome, pull=0.55, seed=300 + k), -9, 0.35)
            elif typ == 'reverseBeep':
                add(h, beat, S.reverse_beep(h.get('pitch', 'B4'), 0.42, seed=309 + k, space='theatre'), -15, -0.3)
            elif typ == 'roadieStinger':
                pitches = h.get('pitches') or ['Bb1', 'E2']
                add(h, beat, S.brass_stinger(pitches, 2.2, seed=312), -6, 0.0)
                add(h, beat, roadie_stomp(seed=312), -8, -0.1, kind='roadieStomp')
            elif typ == 'stomp':
                add(h, beat, roadie_stomp(seed=313 + k), -8, [-0.15, 0.1][k % 2])
            elif typ == 'genCatch':
                c = S.generator_catch('E2', 2.0, seed=324)
                idle = S.generator_idle(8.0, 'E2', seed=325)
                x = np.zeros((S.ns(10.0), 2))
                S.place(x, c, 0.0)
                fade = np.clip(1 - S.tt(idle.shape[0]) / 7.5, 0, 1) ** 1.5
                S.place(x, S.fades(idle, 0.05, 0.5) * fade[:, None] * 0.85, 1.95)
                add(h, beat, x, -10, 0.3)
            elif typ == 'ampsOn':
                add(h, beat, S.amp_power_on(hum_dur=0.9, seed=326), -14, -0.3)
            elif typ == 'lightsOn':
                add(h, beat, S.lights_on(seed=328), -14, 0.0)
            elif typ == 'pyro':
                add(h, beat, S.pyro_whoosh(1.3, seed=328 + k), -12, [-0.5, 0.5][k % 2])
            elif typ == 'curtainFire':
                d = tb(h['toBeat'] - h['beat']) + 1.0
                x = S.fire(d, 0.8, seed=344) * np.linspace(0.3, 1.0, S.ns(d))[:, None]
                add(h, beat, x, -24, -0.6)
            elif typ == 'frisbee':
                d = tb(356 - beat) if beat < 356 else 0.8
                add(h, beat, S.frisbee_whoosh(max(0.5, d), seed=354), -13, 0.0)
            elif typ == 'ding':
                add(h, beat, S.cymbal_ding(h.get('pitch', 'B5'), 3.0, seed=356), -8, 0.2)
            elif typ == 'roadieThud':
                add(h, beat, S.big_thud(seed=357), -6, 0.1)
            elif typ == 'fireworks':
                wh = k in (0, 2)
                x = S.firework_boom(crackle=True, whistle=wh, seed=375 + k)
                add(h, beat, x, -11, [-0.5, 0.45, -0.3, 0.55, -0.6][k % 5], anchor=0.9 if wh else 0.0)
            elif typ == 'finalHit':
                add(h, beat, impact_boom(2.2, seed=420), -10, kind='finalBoom')
            elif typ == 'burn':
                add(h, beat, S.film_burn(max(0.8, tb(h['toBeat'] - h['beat'])), seed=422), -16, 0.0)
            elif typ == 'hudChirp':
                add(h, beat, S.hud_chirp(seed=438), -22, 0.0)
                for b in range(3):
                    blip = S.hud_chirp(seed=439 + b)[:S.ns(0.05)]
                    add(h, beat + 0.5 + 0.5 * b, S.fades(blip, 0.001, 0.01), -32, 0.0, kind='hudBlink')
            elif typ == 'musicBoxCoda':
                pass      # the spring click is rendered by the music box part (music_box_line stop_at)
    return P


def render_sfx(score, boot, boot_info):
    """Mix every FX hit into one stereo stem; returns (stem, log) where log lists each hit's placement."""
    out = np.zeros((N, 2))
    logs = []
    for p in sfx_plan(score, boot, boot_info):
        x = np.asarray(p['audio'], float)
        g = S.undb(p['gain'])
        # land the audible onset (attack, or the start of a swell) on the beat, not the clip's first sample
        shift = 0.0 if p['check'] == 'none' else float(np.clip(clip_onset(x, p['anchor'], p['check']) - p['anchor'], 0.0, 0.12))
        at = p['at'] - shift
        S.place(out, x * g, at, 1.0, p['pan'])
        i0 = int(round(at * SR))
        logs.append(dict(type=p['type'], beat=p['beat'], t=round(p['t'], 4), at=round(at, 4), shift_ms=round(shift * 1000, 1),
                         anchor=round(p['anchor'], 4), dur=round(x.shape[0] / SR, 3), gain=p['gain'], check=p['check'],
                         onset=round(i0 / SR + clip_onset(x, p['anchor'], p['check']), 4)))
    return out, logs


def clip_onset(x, anchor=0.0, mode='attack'):
    """The onset (s into the clip) of a sound. 'attack': the first point where the 1 ms envelope reaches 12 % of
    its peak in the 400 ms from the anchor (searched from anchor - 50 ms, or - 10 ms for pre-rolled clips);
    'start': the first point above 0.5 % of the clip's peak (sounds that fade in); 'none': the anchor."""
    if mode == 'none':
        return anchor
    m = np.abs(S.mono(x))
    if mode == 'start':
        k = np.nonzero(m >= 0.005 * m.max())[0]
        return k[0] / SR if len(k) else anchor
    a = max(0, int((anchor - (0.01 if anchor > 0 else 0.05)) * SR))
    b = min(len(m), int((anchor + 0.4) * SR))
    seg = maximum_filter1d(m[a:b], S.ns(0.001))
    if not len(seg) or seg.max() <= 0:
        return anchor
    k = int(np.argmax(seg >= 0.12 * seg.max()))
    return (a + k) / SR


def render_beds(score):
    """Ambience (stereo): rain in and around the van and the streets, the van, the radio under Lou, room tones per
    location (they are what sounds in the gaps), the chopper, the thermal hum, the applause, crowd murmurs."""
    out = np.zeros((N, 2))
    H = {}
    for h in score['hits']:
        H.setdefault(h['type'], []).append(h)

    def bed(x, t0, t1, gain_db, fin=0.3, fout=0.3, pan=0.0):
        x = S.fades(S.pad_to(np.asarray(x, float), S.ns(t1 - t0)), fin, fout)
        S.place(out, x * S.undb(gain_db), t0, 1.0, pan)
    t_riff = ts(8)
    # the van: rain on the roof, the engine, the wipers on every beat, the radio
    bed(S.rain_bed(t_riff + 0.6, 1.0, inside=True, seed=1), 0.0, t_riff + 0.6, -14, 0.05, 0.6)
    bed(S.room_tone(t_riff + 0.4, 'van', seed=2), 0.0, t_riff + 0.4, -8, 0.05, 0.4)
    for k in range(int(round(t_riff / BEAT))):
        S.place(out, S.stereo(wiper(seed=k % 4)) * S.undb(-36), k * BEAT - 0.3 + BEAT, 1.0, 0.0)
    rt = H.get('radioTune', [{'beat': 0, 'toBeat': 1.5}])[0]
    ru = H.get('radioUp', [{'beat': 3}])[0]
    t_on = tb(rt.get('toBeat', 1.5))
    st = S.radio_static(t_riff - t_on, crackle=0.35, whistle=0.1, seed=7)
    t = S.tt(len(st))
    up = S.smoothstep((t - (tb(ru['beat']) - t_on)) / 0.12)
    st = S.bp(st, 250, 2600, 2) * (1 - up) + S.bp(st, 180, 4200, 2) * up * 2.0
    lou_end = max((tb(sp['win'][1]) for sp in score['vocals']['spoken'] if sp['voice'] == 'lou' and sp['bar'] < 8),
                  default=10.2)
    st = st * np.interp(t + t_on, [0, lou_end, lou_end + 1.2, t_riff], [1, 1, 0.55, 0.0])
    bed(S.stereo(st, 0.25), t_on, t_riff, -26, 0.08, 0.2)
    # Lou on the radio later (the rescue, the ride, the sign-off): a little static under each line
    for sp in score['vocals']['spoken']:
        if sp['voice'] == 'lou' and sp['bar'] >= 8:
            a, b = tb(sp['win'][0]) - 0.25, tb(sp['win'][1]) + 0.3
            bed(S.stereo(S.bp(S.radio_static(b - a, crackle=0.3, seed=int(a)), 250, 3000, 2), 0.2), a, b, -32, 0.15, 0.25)
    # outdoors: rain + the night street (intro to the safe-room door)
    a, b = t_riff, ts(48)
    bed(S.rain_bed(b - a, 0.85, seed=11), a, b, -19, 0.6, 0.1)
    bed(S.room_tone(b - a, 'street', seed=12), a, b, -6, 0.6, 0.1)
    # the safe room: room tone, a flickering bulb's buzz, rain far above
    a, b = ts(48), ts(56)
    hum = S.mains_hum(b - a, base=60.0, buzz=0.3, seed=48) * (0.7 + 0.3 * S.smooth_noise(S.ns(b - a), 3.0, 48))
    bed(S.room_tone(b - a, 'room', seed=48) + S.stereo(S.hp(hum, 100, 2)) * 0.006, a, b, -3, 0.05, 0.05)
    bed(S.lp(S.rain_bed(b - a, 0.6, inside=True, seed=49), 700, 2), a, b, -28, 0.05, 0.05)
    # outside the Orpheum (verse 2)
    a, b = ts(56), ts(64)
    bed(S.room_tone(b - a, 'street', seed=56), a, b, -6, 0.05, 0.2)
    # the theatre (chorus 2 to the solo)
    a, b = ts(64), ts(90)
    bed(S.room_tone(b - a, 'theatre', seed=64), a, b, -2, 0.2, 0.4)
    a, b = ts(74), ts(82)
    bed(S.crowd_murmur(b - a, size=60, seed=74), a, b, -26, 0.8, 0.3)
    # the roof
    a, b = ts(90), ts(106)
    bed(S.room_tone(b - a, 'roof', seed=90), a, b, -4, 0.4, 0.3)
    for bar in (100, 102):
        bed(S.crowd_murmur(BAR + 0.4, size=80, seed=bar), ts(bar) - 0.1, ts(bar + 1) + 0.3, -24, 0.15, 0.3)
    # the chopper: blades fade in over the lift, locked to the 16th grid; muffled in the coda
    for h in H.get('chopper', []):
        t0, t1 = tb(h['beat']), tb(h['toBeat'])
        tc = tb(422)
        n0 = int(round((tc - t0) / STEP))
        x = S.helicopter(n0 * STEP + 0.5, rate=10.0, fade_in=2 * BAR, seed=360)
        bed(S.lp(x, 2400, 2), t0, t0 + n0 * STEP + 0.5, -15, 0.01, 0.6)
        xm = S.helicopter(t1 - tc + 0.8, rate=10.0, muffled=True, seed=422)
        xm = S.hp(xm, 55.0, 2)
        bed(xm, tc, min(DURATION, t1 + 0.8), -23, 0.4, 0.6)
    for h in H.get('thermalHum', []):
        a, b = tb(h['beat']), min(DURATION, tb(h['toBeat']) + 0.8)
        bed(S.thermal_hum(b - a, seed=424), a, b, -4, 0.25, 0.4)
    for h in H.get('applause', []):
        a, b = tb(h['beat']), tb(h['toBeat'])
        bed(S.applause(b - a + 0.5, size=320, distant=True, whistles=3, seed=426), a, b + 0.5, -15, 0.6, 0.8)
    # the last 0.8 s after the picture: room tone only (the roof wind under the hum)
    a, b = ts(106), DURATION
    bed(S.room_tone(b - a, 'roof', seed=106), a, b, -12, 0.5, 0.3)
    return out


# =====================================================================================================
# voices
# =====================================================================================================

def voice_score(score):
    """The score as ns_voices expects it: spoken[].words / dur as authored (the measured values this script writes
    back must not feed the next render, and they would invalidate ns_voices' cache)."""
    sc = json.loads(json.dumps(score))
    auth = ((score.get('audio') or {}).get('authoredWords')) or {}
    for sp in sc['vocals']['spoken']:
        sid = sp['id']
        if sid in auth:
            sp['words'] = auth[sid]
        elif sp.get('words') and not all(float(w[1]).is_integer() for w in sp['words']):
            sp['words'] = None          # measured seconds (no authored steps recorded): let ns_voices re-measure
        sp['dur'] = None
    sc.pop('audio', None)
    return sc


def authored_words(score):
    """The authored word steps of spoken lines (integers), kept in SCORE.audio.authoredWords across write-backs."""
    auth = dict(((score.get('audio') or {}).get('authoredWords')) or {})
    for sp in score['vocals']['spoken']:
        if sp['id'] not in auth and sp.get('words') and all(float(w[1]).is_integer() for w in sp['words']):
            auth[sp['id']] = sp['words']
    return auth


# =====================================================================================================
# mix
# =====================================================================================================

def gap_gain(score, n=N, fade_out=0.003, fade_in=0.002, extend=None):
    """Gain curve: 0 inside every gap (the band and the voices), raised-cosine edges of a few ms."""
    g = np.ones(n)
    for a, b in (extend or gaps_s(score)):
        i0, i1 = int(round(a * SR)), int(round(b * SR))
        fo, fi = S.ns(fade_out), S.ns(fade_in)
        g[i0:i0 + fo] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(min(fo, n - i0)) / fo)
        g[i0 + fo:max(i0 + fo, i1 - fi)] = 0.0
        j = max(i0 + fo, i1 - fi)
        m = min(i1, n) - j
        if m > 0:
            g[j:j + m] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(m) / max(1, i1 - j))
    return g


def choke_gain(score, onsets, n=N):
    """Gain for the band's reverb returns: cut at every perc.choke step (and gap start), back at the next onset."""
    chokes = [h[0] for h in lane_hits(score['perc']['choke'], {'x': 1, 'X': 1})]
    g = np.ones(n)
    for tc in chokes:
        i0 = int(tc * SR)
        nx = onsets[onsets > tc + 0.005]
        t1 = nx[0] if len(nx) else tc + 2.0
        i1 = int(t1 * SR)
        f = S.ns(0.025)
        g[i0:i0 + f] *= np.linspace(1, 0, min(f, n - i0))
        g[i0 + f:i1] = 0.0
    return g


def section_curve(score, values, n=N, ramp=0.03, default=0.0):
    """Piecewise-constant per-section value (dB) with short ramps at the boundaries -> linear gain."""
    v = np.full(n, float(default))
    for sid, a, b in sections(score):
        if sid in values:
            v[int(a * SR):int(b * SR)] = values[sid]
    if ramp:
        k = S.ns(ramp)
        v = np.convolve(v, np.ones(k) / k, mode='same')
    return S.undb(v)


def dyn_carve(x, key, lo=1300.0, hi=4200.0, depth_db=4.0, thr_db=-38.0, range_db=18.0):
    """Dynamic EQ: duck the lo-hi band of x (zero-phase split) by up to depth_db while the key (the lead vocal)
    sings; the rest of x is untouched."""
    lvl = env_db(key, 0.008, 0.18)
    k = np.clip((lvl - thr_db) / range_db, 0, 1)
    g = S.undb(-depth_db * k)
    band = zp_band(x, lo, hi, 2)
    gg = g if np.ndim(x) == 1 else g[:, None]
    return x + (gg - 1.0) * band


def tape_stop_seg(x, start, dur, curve=1.6):
    """S.tape_stop on a window around the stop only (identical samples before `start`), silence after."""
    a = max(0, int((start - 0.5) * SR))
    b = min(x.shape[0], int((start + dur + 0.05) * SR))
    seg = S.tape_stop(x[a:b], start - a / SR, dur, curve=curve)[:b - a]
    y = np.array(x, float, copy=True)
    y[a:b] = seg
    y[b:int((start + dur) * SR) + 1] = 0.0
    return y


def lowpass_auto(x, score):
    """The band low-pass automation (arrangement.automation band/lowpassHz): applied from its first point to its
    last, log-frequency interpolation, 30 ms crossfades at both ends."""
    pts = None
    for a in score['arrangement'].get('automation', []):
        if a.get('target') == 'band' and a.get('param') == 'lowpassHz':
            pts = a['points']
    if not pts:
        return x
    t0, t1 = tb(pts[0][0]), tb(pts[-1][0])
    a, b = int((t0 - 0.05) * SR), int((t1 + 0.1) * SR)
    seg = x[a:b]
    tt_ = a / SR + S.tt(b - a)
    fc = np.exp(np.interp(tt_, [tb(p[0]) for p in pts], [np.log(p[1]) for p in pts]))
    fc = np.minimum(fc, 19000.0)
    y = S.tvf(seg, 'lp', fc, 0.7071, 64)
    y = S.tvf(y, 'lp', fc * 1.15, 0.6, 64)
    w = np.ones(b - a)
    f = S.ns(0.03)
    i0 = int(t0 * SR) - a
    w[:i0] = 0.0
    w[i0:i0 + f] = np.linspace(0, 1, f)
    w[-f:] = np.linspace(1, 0, f)
    out = np.array(x, float, copy=True)
    out[a:b] = seg * (1 - w[:, None]) + y * w[:, None]
    return out


def build_mix(score, st, vox, sfx, beds, vreport):
    """All groups -> (pre-master stereo mix, groups dict for analysis)."""
    log('mix: groups')
    t = S.tt(N)
    G = {}
    sec_db = lambda vals: section_curve(score, vals)          # noqa: E731
    lead_vox = S.mono(vox['lead']).astype(float)
    key_vox = lead_vox + 0.5 * S.mono(vox['gang'])
    # ---- rhythm guitars: HP under the bass, mud and fizz trimmed, carved under the vocal, hard L / R
    gtr = {}
    for side, p in (('L', -1.0), ('R', 1.0)):
        g = np.asarray(st['gtr' + side], float)
        g = S.hp(S.hp(g, 82.0, 2), 60.0, 2)
        g = S.eq(g, ('peak', 160.0, 2.0, 0.9), ('peak', 2600.0, -2.0, 1.0), ('peak', 4300.0, -3.0, 1.6),
                 ('hs', 7000.0, -3.0), ('lp', 11000.0))
        g = dyn_carve(g, key_vox, 1300.0, 4200.0, 4.5)
        gtr[side] = S.stereo(g, p)
    gtr_bus = (gtr['L'] + gtr['R']) * S.undb(-3.0)
    gtr_bus *= sec_db({'verse1b': -1.0, 'verse2': -0.5, 'chorus1': 0.0, 'solo': -1.0, 'chorus3': 0.0})[:, None]
    G['gtr'] = gtr_bus
    # ---- bass: kick-keyed duck, mud out, growl kept
    kick = np.asarray(st['kick'], float)
    bs = np.asarray(st['bass'], float)
    bs = S.eq(S.hp(bs, 33.0, 2), ('peak', 250.0, -2.5, 1.0), ('peak', 900.0, 1.5, 1.0), ('lp', 7000.0))
    bs = S.duck(bs, kick, depth_db=3.5, attack=0.002, release=0.09, thr_db=-30.0)
    G['bass'] = S.stereo(bs) * S.undb(-1.0)
    # ---- drums: a little more punch and air
    dr = np.asarray(st['drums'], float)
    dr = S.eq(dr, ('peak', 62.0, 1.5, 1.0), ('peak', 420.0, -1.5, 1.0), ('peak', 4500.0, 1.0, 0.8), ('hs', 10000.0, 1.0))
    G['drums'] = dr * S.undb(1.5)
    # ---- perc (heartbeat, clicks, stomps, claps, cases)
    G['perc'] = np.asarray(st['perc'], float) * S.undb(-3.0)
    # ---- lead guitar: delay (3/16 = 0.3 s) and a plate send; up for the solo
    ld = np.asarray(st['lead'], float)
    ld = S.eq(ld, ('hp', 150.0), ('peak', 3000.0, -1.0, 1.0), ('lp', 11000.0))
    ld *= sec_db({'solo': 2.0, 'intro': -1.5, 'post1': -1.5, 'chorus3': -7.0, 'ending': -1.0})[:, None]
    ld_wet = S.delay(ld, 0.3, 0.32, 1.0, 4200.0, 300.0, True) - ld
    ld_wet = ld_wet * 0.17 + S.convolve(S.hp(ld, 300, 2), S.ir('plate')) * 0.11
    G['lead'] = ld * S.undb(-1.5)
    wet = ld_wet * S.undb(-1.5)
    # ---- organ: the cold-open fade (automation), a theatre send
    og = np.asarray(st['organ'], float)
    auto = [a for a in score['arrangement'].get('automation', []) if a.get('target') == 'organ' and a.get('param') == 'gainDb']
    og_db = np.zeros(N)
    if auto:
        pts = auto[0]['points']
        og_db = np.interp(t, [tb(p[0]) for p in pts], [p[1] for p in pts])
        og_db = np.where(t < ts(8), og_db - pts[-1][1], 0.0)        # the fade-in shapes the cold open only
    og = og * S.undb(og_db)[:, None]
    og = S.eq(og, ('hp', 45.0), ('peak', 2500.0, -2.0, 1.0))
    og *= sec_db({'coldopen': 0.0, 'saferoom': -2.0, 'verse2': -6.0, 'lift': -7.0, 'chorus3': -12.0, 'ending': -6.0})[:, None]
    G['organ'] = og * S.undb(-4.0)
    wet += S.convolve(S.hp(G['organ'], 200, 2), S.ir('theatre')) * 0.22
    # ---- clean (safe room) + spring-ish plate
    cl = np.asarray(st['clean'], float)
    G['clean'] = S.eq(cl, ('hp', 90.0)) * S.undb(-2.0)
    wet += S.convolve(S.hp(G['clean'], 250, 2), S.ir('plate')) * 0.25
    # ---- rhythm guitar room (a touch)
    wet += S.convolve(S.hp(S.mono(gtr_bus), 300, 2), S.ir('room')) * 0.05
    # ---- the band bus: sum, choke the reverb returns, glue, the verse-2 low-pass, the tape stop, the gaps
    log('mix: band bus')
    onsets = band_onsets(score)
    wet *= choke_gain(score, onsets)[:, None]
    band = G['gtr'] + G['bass'] + G['drums'] + G['perc'] + G['lead'] + G['organ'] + G['clean'] + wet
    band = S.compressor(band, -15.0, 2.0, attack=0.025, release=0.18, knee=8.0)
    band = lowpass_auto(band, score)
    v2 = section_curve(score, {'verse2': 1.0}, ramp=0.0)
    v2 = v2 * (t < tb(246)) + (t >= tb(246)) * np.interp(t, [tb(246), tb(248)], [S.undb(1.0), 1.0])
    band_room = S.convolve(S.hp(S.mono(band), 200, 2) * np.clip((v2 - 1.0) / 0.122, 0, 1), S.ir('bigroom')) * 0.25
    band = band + band_room
    for a in score['arrangement'].get('automation', []):
        if a.get('target') == 'band' and a.get('param') == 'tapeSpeed':
            p0, p1 = a['points'][0][0], a['points'][-1][0]
            band = tape_stop_seg(band, tb(p0), tb(p1 - p0), 1.6)
    band *= gap_gain(score)[:, None]
    G['band'] = band
    # ---- the music box (not the band: its own gap rules are in its part)
    mb = np.asarray(st['musicbox'], float)
    mb = S.reverb(mb, 'small', 0.25, 300.0, None, tail=False) * S.undb(-6.0)
    gap_sr = [(a, b) for (a, b) in gaps_s(score) if b <= ts(56) + 0.01 and a >= ts(48)]
    mb *= gap_gain(score, extend=gap_sr)[:, None]
    G['musicbox'] = mb
    # ---- voices
    log('mix: voices')
    V = {}
    lv = np.asarray(vox['lead'], float)
    lv = S.eq(lv, ('hp', 140.0), ('peak', 2600.0, 1.5, 1.0), ('peak', 5500.0, 1.0, 1.0))
    lv = S.compressor(lv, -22.0, 3.0, attack=0.004, release=0.1, knee=6.0)
    V['lead'] = lv * S.undb(3.0) * sec_db({'verse2': -1.0})[:, None]
    V['gang'] = S.widen(np.asarray(vox['gang'], float), 1.25) * S.undb(1.0)
    V['zombies'] = np.asarray(vox['zombies'], float) * S.undb(2.0)
    V['lou'] = np.asarray(vox['lou'], float) * S.undb(1.0)
    V['tiny'] = np.asarray(vox['tiny'], float) * S.undb(-2.0)
    V['fx_vocal'] = np.asarray(vox['fx_vocal'], float) * S.undb(-1.0) * sec_db({'verse1b': -5.0, 'blackout': -3.0})[:, None]
    V['roadie'] = np.asarray(vox['roadie'], float) * S.undb(0.0)
    V['fan'] = np.asarray(vox['fan'], float) * S.undb(2.0)
    V['huh'] = np.asarray(vox['huh'], float) * S.undb(-1.0)
    vox_bus = sum(V.values())
    G['vox'] = vox_bus
    G['vox_lead'] = V['lead']
    # ---- FX and beds
    G['sfx'] = np.asarray(sfx, float)
    G['beds'] = np.asarray(beds, float)
    mix = G['band'] + G['musicbox'] + G['vox'] + G['sfx'] + G['beds']
    return mix, G


def master_chain(score, mix, n_iter=4):
    """Section trims (fader rides toward SECTION_TARGET) + gain so the band sections integrate to -11 LUFS, glue,
    a soft-knee clipper and the true-peak limiter (ceiling -1.3 dBTP so the MP3 stays under -1.0)."""
    secs = sections(score)
    trims = {sid: 0.0 for sid, _, _ in secs}
    g_in = 0.0
    y = None

    def band_lufs(z):
        parts = [z[int(a * SR):int(b * SR)] for sid, a, b in secs if sid in BAND_SECTIONS]
        return S.lufs(np.concatenate(parts))
    for it in range(n_iter):
        cur = mix * section_curve(score, trims, ramp=0.05)[:, None] * S.undb(g_in)
        y = S.compressor(cur, -12.0, 1.8, attack=0.03, release=0.25, knee=10.0)
        y = knee_clip(y, 0.72)
        y = S.limiter(y, -1.35, look=0.0015, release=0.06)
        L = band_lufs(y)
        g_in += -11.0 - L
        log(f'master pass {it + 1}: band sections {L:.2f} LUFS, gain {g_in:+.2f} dB')
        for sid, a, b in secs:
            tgt = SECTION_TARGET.get(sid)
            if tgt is None:
                continue
            Ls = S.lufs(y[int(a * SR):int(b * SR)])
            if np.isfinite(Ls):
                trims[sid] = float(np.clip(trims[sid] + 0.8 * (tgt - Ls - (-11.0 - L)), -6.0, 6.0))
    cur = mix * section_curve(score, trims, ramp=0.05)[:, None] * S.undb(g_in)
    y = S.compressor(cur, -12.0, 1.8, attack=0.03, release=0.25, knee=10.0)
    y = knee_clip(y, 0.72)
    y = S.limiter(y, -1.35, look=0.0015, release=0.06)
    y = S.limiter(y, -1.35, look=0.0015, release=0.06)
    y[-S.ns(0.05):] *= np.linspace(1, 0, S.ns(0.05))[:, None]
    return y[:N], dict(trims={k: round(v, 2) for k, v in trims.items()}, gain_db=round(g_in, 2))


# =====================================================================================================
# outputs
# =====================================================================================================

def write_f32_wav(path, x):
    wavfile.write(str(path), SR, np.asarray(x, F32))


def ffmpeg_mp3(wav, mp3, bitrate='192k', mono=False):
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav), '-map_metadata', '-1',
           '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'libmp3lame', '-b:a', bitrate, '-ar', str(SR),
           '-ac', '1' if mono else '2', '-id3v2_version', '0', '-write_id3v1', '0', str(mp3)]
    subprocess.run(cmd, check=True)


def decode_mp3(mp3, ch=2):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(mp3), '-f', 'f32le', '-ac', str(ch),
                        '-ar', str(SR), '-'], check=True, capture_output=True)
    y = np.frombuffer(r.stdout, np.float32)
    return y.reshape(-1, ch) if ch > 1 else y


def mp3_offset(ref, dec, max_lag=4000):
    """Lag (samples) of dec relative to ref by cross-correlating a busy 6 s window (positive = dec is late)."""
    r = S.mono(ref)
    d = S.mono(dec)
    i0 = int(np.argmax(maximum_filter1d(np.abs(r), S.ns(1.0)) > 0.05 * np.abs(r).max()))
    i0 = max(i0, S.ns(14.0))
    w = S.ns(6.0)
    a = r[i0:i0 + w]
    b = d[i0 - max_lag:i0 + w + max_lag] if i0 >= max_lag else np.pad(d, (max_lag, 0))[i0:i0 + w + 2 * max_lag]
    c = signal.correlate(b, a, mode='valid', method='fft')
    return int(np.argmax(c)) - max_lag


def encode_master(master, wav, mp3, score):
    """WAV -> 192 kbps MP3; measures the decoded length, its offset against the WAV (compensated by shifting the
    encoder's input if ffmpeg's decode is not sample-aligned) and its true peak (the codec's overshoot is absorbed by
    re-limiting the master a little lower, up to 3 times). Returns (master, decoded, info)."""
    shift = 0
    info = {}
    for it in range(5):
        write_f32_wav(wav, master)
        src = wav
        if shift:
            sh = np.zeros_like(master)
            if shift > 0:
                sh[:N - shift] = master[shift:]
            else:
                sh[-shift:] = master[:N + shift]
            src = wav.parent / 'mp3_src.wav'
            write_f32_wav(src, sh)
        ffmpeg_mp3(src, mp3, '192k')
        dec = decode_mp3(mp3)
        lag = mp3_offset(master, dec)
        tp = round(float(S.db(S.true_peak(dec[:N]))), 2)
        info.update(bytes=mp3.stat().st_size, decoded_samples=int(dec.shape[0]), decoded_seconds=dec.shape[0] / SR,
                    offset_samples_vs_wav=lag, input_shift_samples=shift, true_peak_dbtp=tp,
                    wav_true_peak_dbtp=round(float(S.db(S.true_peak(master))), 2))
        if lag != 0 and it < 2:
            log(f'mp3 decodes {lag} samples off the WAV: compensating')
            shift += lag
            continue
        if tp > -1.02:
            ceil = info['wav_true_peak_dbtp'] - (tp + 1.0) - 0.08
            log(f'mp3 true peak {tp} dBTP: re-limiting the master to {ceil:.2f} dBTP')
            master = S.limiter(master, ceil, look=0.0015, release=0.06)
            continue
        break
    info['lufs_band_sections'] = round(S.lufs(np.concatenate([dec[int(a * SR):int(b * SR)] for sid, a, b in sections(score)
                                                              if sid in BAND_SECTIONS])), 2)
    info['ok'] = bool(abs(dec.shape[0] - N) <= 1 and info['offset_samples_vs_wav'] == 0 and info['true_peak_dbtp'] <= -1.0)
    return master, dec, info


def build_radio(score, work, boot):
    """The board's radio clips: ns_voices' numbers / tape / lou / lou3am + our bleed (the bootleg heard on AM) and
    the tape's bed (fire bell + the band's last chord, muffled). Returns (mono array, clips, meta)."""
    vs = voice_score(score)
    rad, clips = NV.render_radio(vs, work_dir=str(work / 'voices'), strict=False)
    rad = np.asarray(rad, float)
    # the tape (1204): bell in the corridor, the band's last chord behind the doors, all on a 1987 cassette
    if 'tape' in clips:
        a, b = clips['tape']['bed']
        n = S.ns(b - a)
        i0 = S.ns(a)
        seg = rad[i0:i0 + n].copy()
        bell = S.mono(S.reverb(S.fire_alarm_bell(b - a, rate=17.0, seed=1204), 'stairwell', 0.6, 300.0, None, tail=False))
        di = S.gtr_track([dict(t=0.0, dur=b - a, notes=[40, 47, 52, 55], vel=1.0, ring=True)], b - a, seed=1204)
        chord = S.amp(di, 'rhythm', cab='A')
        fb = S.feedback(64, b - a, swell=(b - a) * 0.6, preset='lead', seed=1205)
        band = S.lp(S.mono(S.reverb(chord + 0.7 * fb, 'theatre', 0.6, 150.0, None, tail=False)), 700, 2)
        sv = S.rms(seg)
        bed = bell / (S.rms(bell) + 1e-9) * 0.18 * sv + band / (S.rms(band) + 1e-9) * 0.35 * sv
        bed = S.fades(bed, 0.3, 0.6)
        y = seg + bed
        y = S.cassette(y, wow=0.25, flutter=0.1, hiss=0.012, dropouts=1, band=(60.0, 9000.0), drive=0.25,
                       cut_click=False, seed=1204)
        rad[i0:i0 + n] = S.fades(y, 0.02, 0.05) * (np.abs(seg).max() / (np.abs(y).max() + 1e-9))
    # bleed (870): the bootleg on AM, replacing ns_voices' placeholder (it is last, so it may be resized)
    if 'bleed' in clips:
        bl = S.am_radio(boot, band=(170.0, 4800.0), drive=0.2, noise=0.004, crackle=0.15, seed=870)
        bl = S.fades(bl, 0.02, 0.0)
        a = clips['bleed']['fromSec']
        rad = np.concatenate([rad[:S.ns(a)], bl, np.zeros(S.ns(0.3))])
        clips['bleed'].update(toSec=round(a + len(bl) / SR, 4))
        clips['bleed'].pop('placeholder', None)
    # loudness-match the clips (-19 LUFS each, peaks <= -1.5 dBFS)
    for cid, c in clips.items():
        i0, i1 = S.ns(c['fromSec']), S.ns(c['toSec'])
        L = S.lufs(rad[i0:i1])
        if np.isfinite(L):
            rad[i0:i1] *= S.undb(-19.0 - L)
    pk = np.abs(rad).max()
    if pk > S.undb(-1.5):
        rad *= S.undb(-1.5) / pk
    return rad, clips


def write_radio_js(path, mp3_bytes, clips, offset_s, duration):
    """window.NS_RADIO = { mime, b64, clips: {id: [fromSec, toSec]}, meta: {...} }"""
    order = ('bleed', 'numbers', 'tape', 'lou', 'lou3am')
    cl = {k: [round(clips[k]['fromSec'] + offset_s, 3), round(clips[k]['toSec'] + offset_s, 3)] for k in order if k in clips}
    meta = {}
    for k in order:
        if k not in clips:
            continue
        c = clips[k]
        m = {'loop': bool(c.get('loop'))}
        if c.get('words'):
            m['words'] = [[w, round(t_ - c['fromSec'], 3)] for w, t_ in c['words']]
        if c.get('voice'):
            m['voice'] = [round(c['voice'][0] - c['fromSec'], 3), round(c['voice'][1] - c['fromSec'], 3)]
        if k == 'tape':
            m['stored'] = 'forwards'
        meta[k] = m
    obj = dict(mime='audio/mpeg', duration=round(duration, 3), clips=cl, meta=meta)
    head = json.dumps(obj, ensure_ascii=False)
    b64 = base64.b64encode(mp3_bytes).decode('ascii')
    txt = ('// NO SURVIVORS: the evidence board\'s radio clips (generated by tools/no_survivors_audio.py; do not edit).\n'
           '// clips[id] = [fromSec, toSec] in the decoded audio; meta[id].words = [[word, sec from the clip start]].\n'
           'window.NS_RADIO = ' + head[:-1] + ', "b64": "' + b64 + '"};\n')
    tmp = Path(str(path) + '.tmp')
    tmp.write_text(txt, encoding='utf-8')
    os.replace(tmp, path)


def writeback_score(path, vreport, audio_obj):
    """Write vocals.spoken[].dur / .words (measured, seconds from win[0]) and SCORE.audio into score.js. Re-reads
    the file first and changes nothing else."""
    obj, head = load_score(path)
    auth = authored_words(obj)
    sp_rep = vreport.get('spoken', {})
    changed = False
    for sp in obj['vocals']['spoken']:
        r = sp_rep.get(sp['id'])
        if not r:
            continue
        dur = round(float(r['dur']), 3)
        words = [[w, round(float(t_), 3)] for w, t_ in r['words']]
        if sp.get('dur') != dur or sp.get('words') != words:
            sp['dur'], sp['words'] = dur, words
            changed = True
    audio_obj = dict(audio_obj, authoredWords=auth)
    if obj.get('audio') != audio_obj:
        obj['audio'] = audio_obj
        changed = True
    if not changed:
        return False
    txt = head + 'window.SCORE = ' + json.dumps(obj, indent=1, ensure_ascii=False) + ';\n'
    tmp = Path(str(path) + '.tmp')
    tmp.write_text(txt, encoding='utf-8')
    os.replace(tmp, path)
    return True


# =====================================================================================================
# analysis
# =====================================================================================================

def attack_near(x, t, lo=-0.03, hi=0.05, band=(2000.0, 9000.0)):
    """Measured attack (s) of the biggest new event in [t + lo, t + hi] of a dense signal (rolls, tremolo): the largest
    linear jump of the band-passed 2 ms envelope over 3 ms, backed off to where the envelope crosses halfway between
    the level before the jump and the level it reaches."""
    m = S.mono(x)
    pad = S.ns(0.05)
    a, b = max(0, int((t + lo) * SR) - pad), min(len(m), int((t + hi) * SR) + pad)
    seg = S.bp(np.asarray(m[a:b], float), band[0], band[1], 2)
    e = maximum_filter1d(np.abs(seg), S.ns(0.002))
    k3 = S.ns(0.003)
    d = np.zeros_like(e)
    d[k3:] = e[k3:] - e[:-k3]
    w0, w1 = int((t + lo) * SR) - a, int((t + hi) * SR) - a
    if w1 <= w0 or e.max() <= 0:
        return None
    i = w0 + int(np.argmax(d[w0:w1]))
    lo_v, hi_v = e[max(0, i - k3)], e[min(len(e) - 1, i + S.ns(0.002))]
    j = i - k3
    while j < i + k3 and e[j] < 0.5 * (lo_v + hi_v):
        j += 1
    return (a + j - S.ns(0.001)) / SR


def onset_near(x, t, lo=-0.03, hi=0.06, band=None, rel=0.25):
    """Measured onset (s) of the first attack within [t + lo, t + hi]: the first point where the 1 ms envelope
    (optionally band-passed) rises above rel * (its max in the window), searching after the quietest point."""
    m = S.mono(x)
    a, b = max(0, int((t + lo - 0.02) * SR)), min(len(m), int((t + hi + 0.03) * SR))
    seg = np.asarray(m[a:b], float)
    if band:
        seg = S.bp(np.pad(seg, (S.ns(0.05), 0)), band[0], band[1], 2)[S.ns(0.05):]
    e = maximum_filter1d(np.abs(seg), S.ns(0.001))
    if not len(e) or e.max() <= 1e-9:
        return None
    w0 = int((t + lo - a / SR) * SR)
    w0 = max(0, w0)
    pre = int(np.argmin(e[w0:w0 + S.ns(max(0.0, -lo) + 0.005)])) + w0 if w0 < len(e) else 0
    k = np.nonzero(e[pre:] >= rel * e[pre:].max())[0]
    return (a + pre + (k[0] if len(k) else 0)) / SR


def analyse(score, master, G, st, vox, sfx_log, vreport, out_dir, mp3_info):
    """The verification report (dict) + PNGs."""
    log('analysis')
    rep = {'version': VERSION}
    rep['duration'] = dict(samples=int(master.shape[0]), seconds=master.shape[0] / SR, ok=master.shape[0] == N)
    secs = sections(score)
    # loudness
    band_parts = [master[int(a * SR):int(b * SR)] for sid, a, b in secs if sid in BAND_SECTIONS]
    L_band = S.lufs(np.concatenate(band_parts))
    per = {}
    for sid, a, b in secs:
        y = master[int(a * SR):int(b * SR)]
        L = S.lufs(y)
        tst, stl = S.short_term_lufs(y, 3.0, 0.5) if len(y) > 3 * SR else (np.array([0.0]), np.array([L]))
        per[sid] = dict(t=[round(a, 2), round(b, 2)], lufs=round(L, 2) if np.isfinite(L) else None,
                        short_term_max=round(float(np.max(stl)), 2) if len(stl) else None,
                        peak_db=round(float(S.db(np.abs(y).max())), 2), target=SECTION_TARGET.get(sid))
    tp = S.db(S.true_peak(master))
    rep['loudness'] = dict(integrated_band_sections=round(L_band, 2), integrated_all=round(S.lufs(master), 2),
                           true_peak_dbtp=round(float(tp), 2), sample_peak_db=round(float(S.db(np.abs(master).max())), 2),
                           clipped_samples=int(np.sum(np.abs(master) >= 0.999)), sections=per,
                           quiet_vs_band_lu={sid: round(per[sid]['lufs'] - L_band, 1) for sid in QUIET_SECTIONS
                                             if per.get(sid, {}).get('lufs') is not None})
    rep['loudness']['ok'] = bool(abs(L_band + 11.0) < 0.5 and tp <= -1.0 and rep['loudness']['clipped_samples'] == 0)
    # gaps: the band bus and the voices must be silent; the full mix = room tone + the FX scheduled there
    gl = []
    for g in score['gaps']:
        a, b = tb(g['fromBeat']), tb(g['toBeat'])
        i0, i1 = int((a + 0.004) * SR), int((b - 0.003) * SR)
        bnd = G['band'][i0:i1]
        vx = np.concatenate([np.asarray(vox[k][i0:i1], float) for k in ('lead', 'gang', 'zombies')], axis=1)
        mx = master[i0:i1]
        mb = G['musicbox'][i0:i1]
        gl.append(dict(fromBeat=g['fromBeat'], toBeat=g['toBeat'], band_peak_db=round(float(S.db(np.abs(bnd).max())), 1),
                       sung_voices_peak_db=round(float(S.db(np.abs(vx).max())), 1),
                       musicbox_peak_db=round(float(S.db(np.abs(mb).max())), 1),
                       mix_rms_db=round(float(S.db(S.rms(mx))), 1), mix_peak_db=round(float(S.db(np.abs(mx).max())), 1),
                       fx_in_gap=sorted({s['type'] for s in sfx_log if a - 0.01 <= s['t'] < b})))
    for g in gl:
        g['ok'] = g['band_peak_db'] < -90 and g['sung_voices_peak_db'] < -90 and (g['musicbox_peak_db'] < -90 or g['fromBeat'] >= 422)
    rep['gaps'] = dict(ok=all(g['ok'] for g in gl), list=gl)
    # hits: SFX onsets from their clips; part-borne hits measured on the stems
    hl = []
    for s in sfx_log:
        if s.get('check') == 'none':
            continue
        err = (s['onset'] - s['t']) * 1000
        hl.append(dict(type=s['type'], beat=s['beat'], source='sfx', err_ms=round(err, 2), measure=s.get('check')))
    stem_of = {'titleHit': 'band', 'bandHit': 'band', 'finalHit': 'band', 'doorSlam': 'band', 'countIn': 'perc',
               'musicBox': 'musicbox', 'musicBoxCoda': 'musicbox'}
    lick_stem = {'lead': 'lead', 'drums': 'drums', 'bass': 'bass'}
    voice_stem = {'gangHey': ('gang', (300, 2000)), 'crowdHuh': ('huh', (200, 1500)), 'zombieHuh': ('huh', (200, 1500)),
                  'groupieShriek': ('fx_vocal', (300, 4000)), 'groupieSob': ('fx_vocal', (200, 3000)),
                  'hordeRoar': ('fx_vocal', (150, 2000))}
    raw = dict(band=G['band'], perc=st['perc'], musicbox=G['musicbox'], lead=st['lead'], drums=st['drums'], bass=st['bass'])
    for h in score['hits']:
        typ = h['type']
        for beat in hit_onsets(h):
            t = tb(beat)
            src = stem_of.get(typ) or (lick_stem.get(h.get('part')) if typ == 'lick' and h.get('part') != 'sfx' else None)
            if src:
                if src in ('band', 'drums', 'bass', 'lead'):
                    o = attack_near(raw[src], t, -0.03, 0.05, band=(2000.0, 9000.0) if src != 'bass' else (300.0, 3000.0))
                else:
                    o = onset_near(raw[src], t, -0.03, 0.05)
                hl.append(dict(type=typ, beat=beat, source=src, err_ms=round((o - t) * 1000, 2) if o is not None else None))
            elif typ in voice_stem:
                stn, band = voice_stem[typ]
                o = onset_near(vox[stn], t, -0.06, 0.08, band=band, rel=0.3)
                hl.append(dict(type=typ, beat=beat, source='voice:' + stn, err_ms=round((o - t) * 1000, 2) if o is not None else None,
                               note='vowel onset (P-centre)'))
    errs = [abs(x['err_ms']) for x in hl if x['err_ms'] is not None and not x['source'].startswith('voice')]
    verrs = [abs(x['err_ms']) for x in hl if x['err_ms'] is not None and x['source'].startswith('voice')]
    rep['hits'] = dict(count=len(hl), max_abs_err_ms=round(max(errs), 2) if errs else None,
                       mean_abs_err_ms=round(float(np.mean(errs)), 2) if errs else None,
                       over_10ms=[x for x in hl if x['err_ms'] is not None and abs(x['err_ms']) > 10 and not x['source'].startswith('voice')],
                       voice_hits_max_abs_err_ms=round(max(verrs), 1) if verrs else None,
                       missing=[x for x in hl if x['err_ms'] is None], list=hl)
    rep['hits']['ok'] = not rep['hits']['over_10ms'] and not rep['hits']['missing']
    # tape stop: the band falls silent by beat 288
    ts0, ts1 = tb(286), tb(288)
    rep['tape_stop'] = dict(band_rms_db_before=round(float(S.db(S.rms(G['band'][int((ts0 - 0.4) * SR):int(ts0 * SR)]))), 1),
                            band_rms_db_during=round(float(S.db(S.rms(G['band'][int(ts0 * SR):int(ts1 * SR)]))), 1),
                            band_peak_db_after=round(float(S.db(np.abs(G['band'][int(ts1 * SR) + 10:int((ts1 + 0.5) * SR)]).max())), 1))
    # vocal intelligibility proxies: per sung line, the lead vocal vs everything else in 1-4 kHz, and overall
    vl = []
    lead_m = S.mono(G['vox_lead'])
    acc_all = S.mono(G['band'] + G['sfx'] + G['beds'] + G['musicbox'] + G['vox']) - lead_m
    for l in score['vocals']['lines']:
        if 'vex' not in l['singer']:
            continue
        a = ts(l['bar'], l['notes'][0][1])
        b = ts(l['bar'], l['notes'][-1][1] + l['notes'][-1][2])
        i0, i1 = int(a * SR), int(b * SR)
        v = S.bp(lead_m[i0:i1], 1000, 4000, 2)
        acc = S.bp(acc_all[i0:i1], 1000, 4000, 2)
        var = 10 * np.log10((np.mean(v ** 2) + 1e-20) / (np.mean(acc ** 2) + 1e-20))
        vl.append(dict(id=l['id'], text=l['text'], var_1k4k_db=round(float(var), 1)))
    sung = vreport.get('sung', {})
    pitch = [abs(c) for lid, d in sung.items() if isinstance(d, dict) and 'pitch_cents' in d
             for c in d['pitch_cents'] if c is not None and abs(c) < 600]
    vow = [d2[2] - d2[1] for lid, d in sung.items() if isinstance(d, dict) and 'syllables' in d and isinstance(d['syllables'], list)
           for d2 in d['syllables'] if isinstance(d2, list) and len(d2) >= 3 and isinstance(d2[1], (int, float))]
    rep['vocals'] = dict(lines=vl, min_var_db=min(x['var_1k4k_db'] for x in vl) if vl else None,
                         median_var_db=float(np.median([x['var_1k4k_db'] for x in vl])) if vl else None,
                         pitch_err_cents_median=round(float(np.median(pitch)), 1) if pitch else None,
                         vowel_after_step_ms_median=round(float(np.median(vow)) * 1000, 1) if vow else None,
                         voices_warnings=vreport.get('warnings', []))
    rep['mp3'] = mp3_info
    rep['spectral'] = {sid: S.octave_db(master[int(a * SR):int(min(b, a + 10) * SR)]) for sid, a, b in secs if sid in BAND_SECTIONS}
    rep['stereo_corr_band'] = round(float(np.corrcoef(G['gtr'][:, 0][::7], G['gtr'][:, 1][::7])[0, 1]), 3)
    # pictures
    S.spectrogram_png(master, out_dir / 'spectrogram.png', 'keep-them-dancing: master (0-180 s)', width=1800, height=480,
                      grid_s=None)
    loudness_png(score, master, out_dir / 'loudness.png', per, L_band)
    return rep


def loudness_png(score, x, path, per, L_band):
    from PIL import Image, ImageDraw
    W, H = 1800, 420
    im = Image.new('RGB', (W, H), (14, 14, 20))
    d = ImageDraw.Draw(im)
    L, T, R, B = 50, 30, W - 10, H - 40
    lo, hi = -45.0, -5.0

    def fy(v):
        return B - (np.clip(v, lo, hi) - lo) / (hi - lo) * (B - T)

    def fx(t):
        return L + t / DURATION * (R - L)
    for v in range(int(lo), int(hi) + 1, 5):
        d.line([(L, fy(v)), (R, fy(v))], fill=(40, 40, 55))
        d.text((6, fy(v) - 6), f'{v}', fill=(170, 170, 180))
    tst, stl = S.short_term_lufs(x, 3.0, 0.25)
    tm, mom = S.short_term_lufs(x, 0.4, 0.1)
    d.line([(fx(a), fy(b)) for a, b in zip(tm, mom)], fill=(70, 110, 160), width=1)
    d.line([(fx(a), fy(b)) for a, b in zip(tst, stl)], fill=(240, 200, 90), width=2)
    for sid, a, b in sections(score):
        d.line([(fx(a), T), (fx(a), B)], fill=(80, 60, 90))
        v = per[sid]['lufs']
        if v is not None:
            d.line([(fx(a), fy(v)), (fx(b), fy(v))], fill=(255, 90, 110), width=3)
        d.text((fx(a) + 3, B + 4 + 12 * (sections(score).index((sid, a, b)) % 2)), sid, fill=(200, 200, 210))
    d.line([(L, fy(-11)), (R, fy(-11))], fill=(120, 220, 140))
    d.text((L, 8), f'loudness: momentary (blue), short-term 3 s (yellow), section integrated (red); band sections '
                   f'{L_band:.2f} LUFS (green = -11)', fill=(230, 230, 230))
    im.save(str(path))


def excerpts(score, master, out_dir):
    """10 s listen-proxies of every section (WAV + spectrogram PNG) and a contact sheet."""
    from PIL import Image
    ex = out_dir / 'excerpts'
    ex.mkdir(exist_ok=True)
    tiles = []
    for sid, a, b in sections(score):
        t0 = a
        t1 = min(DURATION, max(b, a + 10.0)) if b - a < 10 else a + 10.0
        if b - a < 10:
            t0 = max(0.0, min(a - 1.0, DURATION - 10.0))
            t1 = t0 + 10.0
        y = master[int(t0 * SR):int(t1 * SR)]
        S.write_wav(ex / f'{sid}.wav', y)
        p = ex / f'{sid}.png'
        S.spectrogram_png(y, p, f'{sid}  {t0:.1f}-{t1:.1f} s', width=880, height=300)
        tiles.append(p)
    ims = [Image.open(p) for p in tiles]
    w = max(i.width for i in ims)
    h = sum(i.height for i in ims[:9])
    sheet = Image.new('RGB', (2 * w, max(h, sum(i.height for i in ims[9:]))), (0, 0, 0))
    y0 = [0, 0]
    for k, i in enumerate(ims):
        c = 0 if k < 9 else 1
        sheet.paste(i, (c * w, y0[c]))
        y0[c] += i.height
    sheet.save(str(out_dir / 'excerpts_sheet.png'))


# =====================================================================================================
# main
# =====================================================================================================

def prepare(args):
    """Load the score and render (or load from the caches) every stem: returns a dict of everything the mix needs."""
    global QUIET
    QUIET = args.quiet
    NV._QUIET = True
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    work = Path(args.work) if args.work else out / 'work'
    work.mkdir(parents=True, exist_ok=True)
    cache = Cache(work, enabled=not args.no_cache)
    score, _ = load_score(args.score)
    if abs(float(score.get('duration', DURATION)) - DURATION) > 1e-6:
        raise SystemExit(f'score duration {score.get("duration")} != {DURATION}')
    md = music_data(score)
    # ---- voices
    log('voices (ns_voices.render_all)')
    vs = voice_score(score)
    vox, vrep = NV.render_all(vs, work_dir=str(work / 'voices'), strict=args.strict, cache=not args.no_cache)
    bvox, binfo = NV.render_bootleg_voices(vs, work_dir=str(work / 'voices'), with_info=True)
    # ---- parts
    st = {}
    st['gtrL'] = cache.get('gtrL', [render_rhythm, _gtr_events, track_events], md, lambda: render_rhythm(score, 'L'))
    st['gtrR'] = cache.get('gtrR', [render_rhythm, _gtr_events, track_events], md, lambda: render_rhythm(score, 'R'))
    st['bass'] = cache.get('bass', [render_bass, track_events], md, lambda: render_bass(score))
    st['lead'] = cache.get('lead', [render_lead, _lead_voices, track_events], md, lambda: render_lead(score))
    d = cache.get('drums', [render_drums, _drum_hits, lane_hits, bat_tock], md, lambda: render_drums(score))
    st['drum_stems'] = d
    st['drums'] = drum_bus(d)
    st['kick'] = S.mono(d['kick'])
    st['perc'] = cache.get('perc', [render_perc, lane_hits, heart_thump, bat_clack, crowd_clap], md, lambda: render_perc(score))
    st['organ'] = cache.get('organ', [render_organ, track_events], md, lambda: render_organ(score))
    st['clean'] = cache.get('clean', [render_clean, track_events], md, lambda: render_clean(score))
    st['musicbox'] = cache.get('musicbox', [render_musicbox, track_events], md, lambda: render_musicbox(score))
    # ---- the 1987 bootleg, FX, beds
    bkey = dict(md, bootleg_voices=_md5(np.ascontiguousarray(bvox).tobytes())[:12])
    boot = cache.get('bootleg', [render_bootleg], bkey, lambda: render_bootleg(score, st, bvox))
    sfx_box = {}

    def make_sfx():
        x, lg = render_sfx(score, boot, binfo)
        sfx_box['log'] = lg
        return x
    sfx_fns = [sfx_plan, render_sfx, clip_onset, impact_boom, megaphone_squeal, knob_click, phone_blips, roadie_stomp]
    skey = dict(md, boot=_md5(np.ascontiguousarray(boot).tobytes())[:12], binfo=binfo)
    sfx = cache.get('sfx', sfx_fns, skey, make_sfx)
    lpath = cache.dir / 'sfx_log.json'
    if 'log' in sfx_box:
        lpath.write_text(json.dumps(sfx_box['log']))
    sfx_log = json.loads(lpath.read_text()) if lpath.exists() else render_sfx(score, boot, binfo)[1]
    beds = cache.get('beds', [render_beds, wiper], dict(md, spoken=[(s['id'], s['win'], s['voice'], s['bar']) for s in score['vocals']['spoken']]),
                     lambda: render_beds(score))
    return dict(score=score, st=st, vox=vox, vrep=vrep, boot=boot, binfo=binfo, sfx=sfx, sfx_log=sfx_log, beds=beds,
                out=out, work=work)


def render(args):
    P = prepare(args)
    score, st, vox, vrep, boot, sfx, sfx_log, beds, out, work = (P[k] for k in (
        'score', 'st', 'vox', 'vrep', 'boot', 'sfx', 'sfx_log', 'beds', 'out', 'work'))
    del P
    # ---- mix + master
    mix, G = build_mix(score, st, vox, sfx, beds, vrep)
    log('master')
    master, minfo = master_chain(score, mix)
    del mix
    wav = out / 'keep-them-dancing.wav'
    write_f32_wav(wav, master)
    if args.stems:
        sd = out / 'stems'
        sd.mkdir(exist_ok=True)
        for k in ('band', 'vox', 'sfx', 'beds', 'musicbox'):
            S.write_wav(sd / f'{k}.wav', G[k] * S.undb(minfo['gain_db']))
    # ---- MP3 (and its alignment with the WAV)
    log('mp3')
    mp3_tmp = out / 'keep-them-dancing.mp3'
    master, dec, mp3_info = encode_master(master, wav, mp3_tmp, score)
    # ---- radio.js
    log('radio clips')
    rad, clips = build_radio(score, work, boot)
    rwav = out / 'radio.wav'
    S.write_wav(rwav, rad)
    rmp3 = out / 'radio.mp3'
    ffmpeg_mp3(rwav, rmp3, '64k', mono=True)
    rdec = decode_mp3(rmp3, 1)
    rlag = mp3_offset(np.pad(rad, (0, max(0, len(rdec) - len(rad)))), rdec[:max(len(rad), len(rdec))], 3000) if len(rad) > S.ns(25) else 0
    radio_info = dict(bytes=rmp3.stat().st_size, seconds=round(len(rdec) / SR, 3), offset_samples=rlag,
                      clips={k: [v['fromSec'], v['toSec']] for k, v in clips.items()})
    # ---- report
    rep = analyse(score, master, G, st, vox, sfx_log, vrep, out, mp3_info)
    rep['master'] = minfo
    rep['radio'] = radio_info
    rep['render_seconds'] = round(time.time() - _T0, 1)
    if not args.no_excerpts:
        excerpts(score, master, out)
    (out / 'report.json').write_text(json.dumps(rep, indent=1, default=float))
    log(f'report: band {rep["loudness"]["integrated_band_sections"]} LUFS, TP {rep["loudness"]["true_peak_dbtp"]} dBTP, '
        f'hits max err {rep["hits"]["max_abs_err_ms"]} ms, gaps ok {rep["gaps"]["ok"]}, mp3 ok {mp3_info["ok"]}')
    # ---- the repo
    if not args.no_repo:
        mp3_dst = Path(args.mp3)
        data = mp3_tmp.read_bytes()
        if not mp3_dst.exists() or mp3_dst.read_bytes() != data:
            tmp = Path(str(mp3_dst) + '.tmp')
            tmp.write_bytes(data)
            os.replace(tmp, mp3_dst)
        write_radio_js(Path(args.radio_js), rmp3.read_bytes(), clips, rlag / SR if rlag else 0.0, len(rdec) / SR)
        if not args.no_writeback:
            aobj = dict(
                version=VERSION, file='keep-them-dancing.mp3', seconds=DURATION, mp3Kbps=192,
                mp3OffsetSamples=mp3_info['offset_samples_vs_wav'],
                lufsBandSections=rep['loudness']['integrated_band_sections'], truePeakDbtp=rep['loudness']['true_peak_dbtp'],
                lufs={sid: v['lufs'] for sid, v in rep['loudness']['sections'].items()},
                timing=dict(hits=rep['hits']['count'], maxErrMs=rep['hits']['max_abs_err_ms'],
                            over10ms=len(rep['hits']['over_10ms'])),
                gapsSilent=rep['gaps']['ok'])
            ch = writeback_score(args.score, vrep, aobj)
            log('score.js written back' if ch else 'score.js unchanged')
    log('done')
    return rep


def main(argv=None):
    tmp_default = os.environ.get('NS_AUDIO_OUT') or str(Path(tempfile.gettempdir()) / 'no-survivors-audio')
    ap = argparse.ArgumentParser(
        prog='no_survivors_audio.py',
        description='Render the NO SURVIVORS "Keep Them Dancing" soundtrack from no-survivors/score.js: parts, FX, '
                    'beds and voices -> mix -> master (-11 LUFS band sections, <= -1 dBTP) -> WAV + 192 kbps MP3 '
                    '(180.0 s), the board radio clips (radio.js), measured spoken timings written back into score.js, '
                    'and a verification report.',
        epilog='Outputs: OUT/keep-them-dancing.wav, OUT/report.json, OUT/spectrogram.png, OUT/loudness.png, '
               'OUT/excerpts/*.wav|png; repo: no-survivors/keep-them-dancing.mp3, no-survivors/radio.js, score.js '
               '(vocals.spoken[].dur/words + "audio"). Caches live in OUT/work (per stem; ns_voices in OUT/work/voices).')
    ap.add_argument('--score', default=str(REPO / 'no-survivors' / 'score.js'), help='score.js to render (default: %(default)s)')
    ap.add_argument('--out', default=tmp_default, help='output dir for the WAV, report and excerpts (default: $NS_AUDIO_OUT or %(default)s)')
    ap.add_argument('--work', default=None, help='cache dir (default: OUT/work)')
    ap.add_argument('--mp3', default=str(REPO / 'no-survivors' / 'keep-them-dancing.mp3'), help='MP3 destination (default: %(default)s)')
    ap.add_argument('--radio-js', default=str(REPO / 'no-survivors' / 'radio.js'), help='radio.js destination (default: %(default)s)')
    ap.add_argument('--no-repo', action='store_true', help='write nothing into the repo (MP3, radio.js and score.js stay as they are)')
    ap.add_argument('--no-writeback', action='store_true', help='do not write the spoken timings / audio summary into score.js')
    ap.add_argument('--no-cache', action='store_true', help='re-render every stem (the caches are still refreshed)')
    ap.add_argument('--no-excerpts', action='store_true', help='skip the 10 s per-section excerpts')
    ap.add_argument('--stems', action='store_true', help='also write the mix groups (band, vox, sfx, beds, musicbox) as WAVs')
    ap.add_argument('--strict', action='store_true', help='fail (ns_voices FitError) when a spoken line cannot fit its window at 0.85x-1.1x')
    ap.add_argument('--quiet', action='store_true', help='no progress log')
    args = ap.parse_args(argv)
    rep = render(args)
    ok = rep['loudness']['ok'] and rep['gaps']['ok'] and rep['hits']['ok'] and rep['mp3']['ok'] and rep['duration']['ok']
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
