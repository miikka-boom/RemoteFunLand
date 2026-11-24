#!/usr/bin/env python3
"""CRADLESONG: TAPE 3, the found-footage teaser: its soundtrack, synthesized and mixed in code.

Follows cradlesong-tape/score.js. Nearly everything is diegetic and goes through a camcorder: the
house at night, the dead humming beyond the boards, Wren humming the part of the lullaby nobody
taught her, her father's whispers, footsteps, the drop, and the last note hummed right into the mic.
That bus gets a camcorder's automatic gain control (so silences fill with hiss), preamp clipping,
a narrow band, then tape wow and flutter. The VCR (play, stop, static) sits outside the camera.

The whispers are flite (rms) speech resynthesized from noise with frame-wise LPC, so they keep the
words' formants but lose the voice. The hummed voices and DSP come from tools/cradlesong_audio.py.

  python3 tools/cradlesong_tape_audio.py --out cradlesong-tape/cradlesong-tape.mp3 [--work DIR]
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.linalg import solve_toeplitz

sys.dont_write_bytecode = True    # importing the first teaser's tool shouldn't leave a cache in the repo
import cradlesong_audio as ca  # noqa: E402
from cradlesong_audio import (SR, db, fades, filt, hp, lp, bp, pink, brown, band_noise, slow_noise, ramp_env,
                              norm_rms, rms_db, pan2, make_ir, convolve, hum, render_voices, shift_notes,
                              VOICE_MARA, VOICE_DEAD, VOICE_CHOIR, wind, creak, tape_mech, impact, log)

REPO = Path(__file__).resolve().parent.parent
SCORE_PATH = REPO / 'cradlesong-tape' / 'score.js'

VOICE_CHILD = dict(bright=980, nasal=(360, 1.3, 5.0), notch=(1350, 2.0, -9.0), lpf=7800, hpf=160,
                   vib_rate=5.9, vib_depth=7, vib_delay=0.55, scoop=26, glide=0.06, drift=8.0,
                   jitter=1.2, rasp=0.05, creak=0.0, shimmer=0.1, breath=0.08, attack=0.07,
                   release=0.22, dip=0.32)


def shots_with(score, sid):
    return [s for s in score['shots'] if s['id'] == sid]


# ------------------------------------------------------------------ voices
def whisperize(y, rng, order=20, frame=0.03, hop=0.0075):
    """Keep the vocal tract (frame-wise LPC), replace the voice with noise: a whisper."""
    win, h = int(frame * SR), int(hop * SR)
    pre = signal.lfilter([1, -0.92], [1], y)
    out = np.zeros(len(y) + win)
    w = np.hanning(win)
    norm = np.zeros(len(y) + win)
    for i in range(0, len(y) - win, h):
        seg = pre[i:i + win] * w
        r = np.correlate(seg, seg, 'full')[win - 1:win + order]
        if r[0] < 1e-9:
            continue
        r[0] *= 1.0001
        a = solve_toeplitz((r[:order], r[:order]), -r[1:order + 1])
        err = max(r[0] + np.dot(a, r[1:order + 1]), 1e-12)
        g = np.sqrt(err / np.sum(w ** 2))
        syn = signal.lfilter([g], np.concatenate([[1], a]), rng.standard_normal(win))
        out[i:i + win] += syn * w
        norm[i:i + win] += w ** 2
    out = out[:len(y)] / np.maximum(norm[:len(y)], 1e-3)
    out = signal.lfilter([1], [1, -0.92], out)
    out = hp(out, 300)
    return out / (np.max(np.abs(out)) + 1e-9)


def whisper_line(text, work, rng):
    y = ca.tts(text, work, voice='rms', tempo=0.86, pitch=1.0)
    return whisperize(y, rng)


# ------------------------------------------------------------------ sounds
def handling(rng, kind='bump'):
    """Hands on the camera body: a low thump and a rub of plastic."""
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    thump = lp(rng.standard_normal(n), 180) * np.exp(-t / 0.05) * (3.0 if kind == 'jolt' else 1.6)
    rub = bp(rng.standard_normal(n), 400, 2500) * np.exp(-((t - 0.12) / 0.09) ** 2) * 0.5
    click = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.004) * 0.4
    return thump + rub + click


def gasp(rng, dur=0.45):
    n = int(dur * SR)
    u = np.arange(n) / n
    env = np.minimum(1, u / 0.08) * np.exp(-np.maximum(0, u - 0.25) / 0.25)
    return band_noise(n, 900, 4200, rng) * env + band_noise(n, 300, 900, rng) * env * 0.4


def footstep(rng, bare=True, weight=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    thud = lp(rng.standard_normal(n), 220 if bare else 600) * np.exp(-t / 0.04) * 1.4
    body = filt(rng.standard_normal(n), 'band', 140, 3) * np.exp(-t / 0.06)
    slap = bp(rng.standard_normal(n), 700, 3000) * np.exp(-t / (0.01 if bare else 0.02)) * (0.25 if bare else 0.6)
    return (thud + body + slap) * weight


def tape_tear(rng, dur):
    """A VHS tracking tear: buzz, chopped noise, a warbling tone."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    buzz = np.sign(np.sin(2 * np.pi * 60 * t)) * 0.35 + np.sign(np.sin(2 * np.pi * 120.4 * t)) * 0.15
    nz = rng.standard_normal(n)
    chop = (rng.uniform(size=int(dur * 30) + 2) > 0.35).astype(float)
    chop = np.repeat(chop, int(SR / 30) + 1)[:n]
    chop = ca.uniform_filter1d(chop, int(0.004 * SR))
    warble = np.sin(2 * np.pi * np.cumsum(900 + 500 * np.sin(2 * np.pi * 7 * t)) / SR) * 0.15
    y = (bp(nz, 300, 7000) * 0.8 + buzz + warble) * chop
    return y * ramp_env(n, [(0, 0.2), (0.03, 1), (dur - 0.03, 1), (dur, 0.3)])


def static_burst(rng, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    nz = np.vstack([hp(rng.standard_normal(n), 150), hp(rng.standard_normal(n), 150)])
    buzz = np.sin(2 * np.pi * 15734 * t) * 0.05 + np.sign(np.sin(2 * np.pi * 60 * t)) * 0.08
    return nz * 0.7 + buzz


def vcr_motor(rng, dur, start=True):
    n = int(dur * SR)
    t = np.arange(n) / SR
    k = 1 - np.exp(-t / 0.25) if start else np.exp(-t / 0.2)
    f = 30 * k + 1
    ph = 2 * np.pi * np.cumsum(f) / SR
    whirr = (np.sin(ph) + 0.4 * np.sin(3 * ph)) * k * 0.3 + bp(rng.standard_normal(n), 800, 3000) * k * 0.08
    return whirr


def agc(x, resets, target_db=-23.0, max_gain_db=16.0, min_gain_db=-9.0, att=0.06, rel=1.3, block=0.01):
    """A camcorder's automatic gain: quick to duck, slow to come back up, so silence fills with hiss."""
    bl = int(block * SR)
    nb = x.shape[1] // bl
    pw = np.mean(x[:, :nb * bl] ** 2, axis=0).reshape(nb, bl).mean(axis=1)
    env = np.sqrt(pw) + 1e-9
    want = np.clip(10 ** ((target_db - 20 * np.log10(env)) / 20), db(min_gain_db), db(max_gain_db))
    a_att, a_rel = np.exp(-block / att), np.exp(-block / rel)
    reset_blocks = {int(r * SR) // bl for r in resets}
    g = np.empty(nb)
    cur = 1.0
    for i in range(nb):
        if i in reset_blocks:
            cur = 1.0
        w = want[i - 2] if i >= 2 else want[0]
        cur = a_att * cur + (1 - a_att) * w if w < cur else a_rel * cur + (1 - a_rel) * w
        g[i] = cur
    gs = np.repeat(g, bl)
    gs = np.concatenate([gs, np.full(x.shape[1] - len(gs), gs[-1])])
    gs = ca.uniform_filter1d(gs, int(0.005 * SR))
    return x * gs


def wow(x, rng):
    """Tape wow and flutter as a wobbling fractional delay."""
    n = x.shape[1]
    t = np.arange(n) / SR
    d = (0.0006 * np.sin(2 * np.pi * 0.6 * t) + 0.00012 * np.sin(2 * np.pi * 6.5 * t + 1)
         + 0.00015 * slow_noise(n, 1.5, rng)) * SR
    idx = np.clip(np.arange(n) - 40 - d, 0, n - 1)
    return np.vstack([np.interp(idx, np.arange(n), ch) for ch in x])


# ------------------------------------------------------------------ the mix
def build(score, work):
    dur = float(score['duration'])
    cuts = score['cuts']
    cam = ca.Mix(dur, cuts)        # everything the camcorder's microphone hears
    vcr = ca.Mix(dur, cuts)        # the VCR playing the tape: mechanics, static
    R = lambda s: np.random.default_rng(s)  # noqa: E731
    IR = {
        'room': make_ir(0.5, 31, predelay=0.005, width=0.5),
        'house': make_ir(0.9, 32, predelay=0.01, width=0.7),
        'out': make_ir(2.4, 33, predelay=0.02, width=1.0, bands=((0, 350, 1.2), (350, 1500, 1.0), (1500, 4500, 0.5), (4500, 20000, 0.25))),
    }
    cue = lambda kind: [c for c in score['cues'] if c['type'] == kind]  # noqa: E731

    # ---- the camera's own noise floor while it records
    for sid in ('window', 'wren', 'frag1', 'frag2', 'frag3', 'field', 'drop', 'floor'):
        for s in shots_with(score, sid):
            n = int((s['t1'] - s['t0']) * SR)
            nz = np.vstack([pink(n, R(int(s['t0'] * 10))), pink(n, R(int(s['t0'] * 10) + 1))])
            motor = np.sin(2 * np.pi * 29.97 * np.arange(n) / SR) * 0.3 + np.sin(2 * np.pi * 59.94 * np.arange(n) / SR) * 0.2
            cam.place(norm_rms(hp(nz, 200), -60) + motor * db(-66), s['t0'], cut=s['t1'])

    # ---- the house at night (segment 1): wind on the boards, the dead humming far off
    log('house')
    c = cue('house')[0]
    d = c['until'] - c['t']
    y = lp(norm_rms(wind(d + 0.5, R(1), lo=160, hi=600, whistle=0.3), -38), 900)
    cam.place(y, c['t'], cut=c['until'], send={'house': 0.2})
    for k, at in enumerate((11.0, 19.4, 24.0)):
        cam.place(lp(creak(R(20 + k), dur=0.8, f=(300, 620, 1300), rate=(25, 70)), 2200), at, gain=db(-40), pan=0.4, send={'house': 0.5})
    notes, cut, beat = ca.performance(score, 'deadfar')
    rng = R(50)
    specs = []
    for i in range(16):
        octv = -12 if i < 10 else (-24 if i < 13 else 0)
        p = dict(VOICE_DEAD, jitter=rng.uniform(8, 18), rasp=rng.uniform(0.2, 0.45), vib_depth=rng.uniform(10, 22), glide=rng.uniform(0.1, 0.2))
        specs.append(dict(notes=shift_notes(notes, octv, abs(rng.normal(0.05, 0.05))), p=p, pan=rng.uniform(-0.8, 0.8),
                          gain=rng.uniform(0.5, 1.0), lpf=1200, pitch_cents=rng.normal(0, 9), cut=cut))
    t0, y = render_voices(specs, 600)
    y = lp(norm_rms(y, -33), 650)
    y = y + 0.6 * convolve(y, IR['out'])[:, :y.shape[1]]
    y *= ramp_env(y.shape[1], [(0, 0), (2.5, 1), (100, 1)])
    cam.place(y, t0, cut=cut)
    # Dad, close to the mic, breathing quietly
    b = ca.breathing(R(3), d, holds=((22.6 - c['t'], 24.0 - c['t']),))
    cam.place(norm_rms(lp(b, 2600), -50), c['t'], cut=c['until'])

    # ---- whispers
    log('whispers')
    for k, s in enumerate(score['subs']):
        y = whisper_line(s['say'], work, R(70 + k))
        y = norm_rms(y, -27)
        cam.place(y, s['t0'] - 0.05, pan=0.05, send={'room': 0.12})

    # ---- handling and the jolt
    for c in cue('handle'):
        for k, at in enumerate(c['at']):
            cam.place(handling(R(int((c['t'] + at) * 31))), c['t'] + at, gain=db(-24), pan=0.1)
    c = cue('jolt')[0]
    cam.place(handling(R(91), 'jolt'), c['t'], gain=db(-8))
    cam.place(gasp(R(92)), c['t'] + 0.05, gain=db(-17))
    cam.place(impact(0.5, R(93), dur=1.5), c['t'], gain=db(-14))

    # ---- Wren's room (segment 2): she hums the ending; the dead outside hum it with her
    log('Wren')
    c = cue('room')[0]
    d = c['until'] - c['t']
    y = lp(norm_rms(wind(d + 0.5, R(4), lo=150, hi=500, whistle=0.2), -44), 700)
    cam.place(y, c['t'], cut=c['until'], send={'room': 0.2})
    notes, cut, beat = ca.performance(score, 'wren')
    t0, y = hum(notes, VOICE_CHILD, seed=777, cut=cut)
    y = norm_rms(y, -26)
    cam.place(y, t0, pan=0.2, send={'room': 0.45}, cut=cut, region_t=notes[0][0])
    notes, cut, beat = ca.performance(score, 'deadjoin')
    rng = R(61)
    specs = []
    for i in range(26):
        octv = -12 if i < 14 else (0 if i < 20 else -24)
        p = dict(VOICE_CHOIR, rasp=rng.uniform(0.08, 0.25), jitter=rng.uniform(3, 8), vib_depth=rng.uniform(8, 16))
        specs.append(dict(notes=shift_notes(notes, octv, rng.normal(0.02, 0.03)), p=p, pan=rng.uniform(-0.9, 0.9),
                          gain=rng.uniform(0.6, 1.0), lpf=2000, pitch_cents=rng.normal(0, 6), cut=cut,
                          amp_env=lambda tt, a=notes[0][0], e=cut: np.interp(tt, [a, a + 3.5, e - 0.5, e], [0.2, 0.85, 1.25, 1.25])))
    t0, y = render_voices(specs, 800)
    y = norm_rms(y, -22)
    y = y + 0.7 * convolve(y, IR['out'])[:, :y.shape[1]]
    y = lp(y, 1100)                          # through the glass and the boards
    cam.place(y, t0, cut=cut)
    c = cue('creak')[0]
    cam.place(creak(R(9), dur=0.7), c['t'], gain=db(-30), pan=-0.1, send={'room': 0.4})

    # ---- glitches (tape tears) go to the VCR side
    for c in cue('glitch'):
        y = tape_tear(R(int(c['t'] * 17)), c['until'] - c['t'])
        vcr.place(norm_rms(y, -17), c['t'], cut=c['until'])

    # ---- the run to her room
    log('run')
    c = cue('run')[0]
    t = c['t'] + 0.05
    k = 0
    while t < c['until'] - 0.1:
        cam.place(footstep(R(200 + k), bare=False, weight=1.0), t, gain=db(-14), pan=0.05, send={'house': 0.35})
        t += 0.27 + 0.03 * np.sin(k)
        k += 1
    y = ca.breathing(R(5), c['until'] - c['t'])
    cam.place(norm_rms(y, -29), c['t'], cut=c['until'])
    n = int((c['until'] - c['t']) * SR)
    cam.place(norm_rms(bp(R(6).standard_normal(n), 300, 2500) * (0.5 + 0.5 * np.abs(slow_noise(n, 6, R(7)))), -30), c['t'], cut=c['until'])

    # ---- the open window (segment 3): wind on the mic, panic, then they all turn
    log('window')
    c = cue('outside')[0]
    d = c['until'] - c['t']
    y = norm_rms(wind(d + 0.5, R(8), lo=120, hi=900, gust=1.1, whistle=0.25), -30)
    rumble = lp(brown(int((d + 0.5) * SR), R(9)), 120) * np.abs(slow_noise(int((d + 0.5) * SR), 1.2, R(10)))
    cam.place(y + norm_rms(np.vstack([rumble, rumble]), -36), c['t'], cut=c['until'])
    c = cue('panic')[0]
    y = ca.breathing(R(11), c['until'] - c['t'])
    cam.place(norm_rms(lp(y, 3000), -32), c['t'], cut=c['until'])
    c = cue('turn')[0]
    cam.place(gasp(R(12), 0.6), c['t'] + 0.12, gain=db(-12))
    cam.place(handling(R(13), 'jolt'), c['t'] + 0.1, gain=db(-9))
    n = int(2.5 * SR)
    tt = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(28 + 30 * np.exp(-tt / 0.4)) / SR) * np.exp(-tt / 1.0) * (1 - np.exp(-tt / 0.01))
    cam.place(np.tanh(2 * sub), c['t'] + 0.1, gain=db(-10))

    # ---- the drop
    c = cue('drop')[0]
    n = int((c['impact'] - c['t']) * SR)
    tum = bp(R(14).standard_normal(n), 200, 3000) * np.abs(np.sin(np.linspace(0, 9, n))) * ramp_env(n, [(0, 0.3), (n / SR, 1)])
    cam.place(norm_rms(tum, -22), c['t'])
    clat = np.zeros(int(1.2 * SR))
    tt = np.arange(len(clat)) / SR
    for at, a in ((0.0, 1.0), (0.13, 0.5), (0.29, 0.3)):
        i = int(at * SR)
        clat[i:] += a * (lp(R(int(at * 100) + 15).standard_normal(len(clat) - i), 600) * np.exp(-tt[:len(clat) - i] / 0.05) * 2.2
                         + filt(R(16).standard_normal(len(clat) - i), 'band', 1900, 5) * np.exp(-tt[:len(clat) - i] / 0.03))
    cam.place(clat, c['impact'], gain=db(-4))

    # ---- on the floor: someone walks up, crouches, hums the last note into the microphone
    log('floor')
    c = cue('floor')[0]
    d = c['until'] - c['t']
    y = lp(norm_rms(wind(d + 0.5, R(17), lo=140, hi=600), -40), 1400)
    cam.place(y, c['t'], cut=c['until'], send={'room': 0.3})
    for k, s in enumerate(cue('step')):
        cam.place(footstep(R(300 + k), bare=True, weight=0.6 + 0.25 * k), s['t'], gain=db(-15 + 2 * k), pan=0.25 - 0.1 * k, send={'room': 0.3})
        cam.place(lp(creak(R(310 + k), dur=0.35, rate=(40, 90)), 2500), s['t'] + 0.04, gain=db(-38))
    c = cue('rustle')[0]
    n = int(0.55 * SR)
    u = np.arange(n) / n
    rus = bp(R(18).standard_normal(n), 1200, 7000) * np.sin(np.pi * u) ** 2 * (0.6 + 0.4 * np.abs(slow_noise(n, 25, R(19))))
    cam.place(norm_rms(rus, -27), c['t'])
    notes, _, beat = ca.performance(score, 'mara')
    p = dict(VOICE_MARA, breath=0.1, vib_delay=0.9, vib_depth=12, release=0.5, hpf=60)
    t0, y = hum(notes, p, seed=4243)
    y = filt(y, 'peak', 140, 0.8, 7.0)        # her mouth an inch from the microphone
    y = norm_rms(y, -17)
    cover = cue('cover')[0]['t']             # then her hand closes over the camera, and the mic
    tt = t0 + np.arange(len(y)) / SR
    y = ca.tv_filter(y, np.interp(tt, [cover, cover + 0.25], [9000, 750]), 'low', q=0.8) * np.interp(tt, [cover, cover + 0.25], [1.0, 1.35])
    cam.place(y, t0, pan=-0.05, region_t=notes[0][0])
    cam.place(handling(R(20)), cover, gain=db(-12))

    # ---- the VCR
    log('vcr')
    n = int(7.6 * SR)
    tt = np.arange(n) / SR
    mains = sum(a * np.sin(2 * np.pi * 60 * h * tt) for h, a in ((1, 1), (2, .45), (3, .3), (5, .15)))
    vcr.place(norm_rms(mains, -50) * ramp_env(n, [(0, 0), (1.5, 1), (7.4, 1), (7.6, 0.6)]), 0.0)
    for c in cue('vcr_play'):
        vcr.place(tape_mech('play', R(40)), c['t'], gain=db(-12))
        vcr.place(vcr_motor(R(41), 1.4), c['t'] + 0.05, gain=db(-26))
    c = cue('tracking')[0]
    vcr.place(norm_rms(tape_tear(R(42), c['until'] - c['t']), -22) * ramp_env(int((c['until'] - c['t']) * SR), [(0, 0.3), (0.5, 1), (10, 1)]), c['t'], cut=c['until'])
    c = cue('static')[0]
    vcr.place(norm_rms(static_burst(R(43), c['until'] - c['t']), -15), c['t'], cut=c['until'])
    c = cue('vcr_stop')[0]
    vcr.place(tape_mech('stop', R(44)), c['t'], gain=db(-10))
    vcr.place(vcr_motor(R(45), 0.8, start=False), c['t'], gain=db(-28))
    c = cue('title')[0]
    n = int(7.0 * SR)
    tt = np.arange(n) / SR
    low = (np.sin(2 * np.pi * 36.71 * tt) + 0.4 * np.sin(2 * np.pi * 73.42 * tt)) * ramp_env(n, [(0, 0), (2.5, 1), (5.0, 0.8), (7.0, 0)])
    vcr.place(norm_rms(low, -30), c['t'])

    # ---- render: the camera's bus through its gain control, its preamp and the tape
    log('render')
    y_cam = cam.render(IR)
    y_cam = agc(y_cam, resets=[0.0] + cuts)
    y_cam = np.tanh(1.6 * y_cam) / 1.6
    mid = y_cam.mean(axis=0)
    side = (y_cam[0] - y_cam[1]) / 2 * 0.35
    y_cam = np.vstack([mid + side, mid - side])
    y_cam = lp(hp(y_cam, 110), 8500)
    y_cam = filt(y_cam, 'peak', 2800, 1.0, 2.5)
    y_cam = wow(y_cam, R(46))
    # the tape's own hiss while it plays, under everything that came off it
    rec = np.zeros(y_cam.shape[1])
    for s in score['shots']:
        if 'clock' in s:
            rec[int(s['t0'] * SR):int(s['t1'] * SR)] = 1
    hiss = np.vstack([hp(pink(y_cam.shape[1], R(47)), 2500), hp(pink(y_cam.shape[1], R(48)), 2500)])
    y_cam += norm_rms(hiss, -50) * rec
    y = y_cam + vcr.render(IR)
    y[:, int(dur * SR):] = 0

    log('master')
    y *= db(3.5)
    peak = np.max(np.abs(y), axis=0)
    req = np.minimum(1.0, db(-2.0) / np.maximum(peak, 1e-9))
    look, hold = int(0.006 * SR), int(0.04 * SR)
    gm = ca.minimum_filter1d(req, 2 * (look + hold) + 1)
    gm = ca.uniform_filter1d(gm, 2 * look + 1)
    y *= np.minimum(gm, 1.0)
    return y[:, :int(dur * SR)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=str(REPO / 'cradlesong-tape' / 'cradlesong-tape.mp3'))
    ap.add_argument('--wav', help='also keep the full-quality WAV here')
    ap.add_argument('--work', help='directory for TTS takes and analysis (default: a temporary directory)')
    ap.add_argument('--abr', default='128k')
    args = ap.parse_args()
    work = Path(args.work) if args.work else Path(tempfile.mkdtemp(prefix='cradlesong-tape-'))
    work.mkdir(parents=True, exist_ok=True)
    score = ca.load_score(SCORE_PATH)
    y = build(score, work)
    wav = Path(args.wav) if args.wav else work / 'cradlesong-tape.wav'
    pcm = np.clip(y.T + np.random.default_rng(0).triangular(-1, 0, 1, y.T.shape) / 32768, -1, 1)
    wavfile.write(wav, SR, (pcm * 32767).astype(np.int16))
    log(f'wrote {wav}')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-c:a', 'libmp3lame', '-b:a', args.abr,
                    '-ar', str(SR), str(args.out)], check=True)
    log(f'wrote {args.out} ({Path(args.out).stat().st_size / 1e6:.2f} MB)')
    ca.report(y, score, wav, work)


if __name__ == '__main__':
    main()
