#!/usr/bin/env python3
"""NO SURVIVORS: instrument synthesis and DSP for the "Keep Them Dancing" soundtrack.

Plain numpy + scipy, 44.1 kHz, deterministic (every random choice is seeded). Import it:

    import sys; sys.path.insert(0, 'tools'); import ns_synth as S
    python3 tools/ns_synth.py --demo DIR     # test set: WAVs + spectrogram PNGs + lead pitch plot + report.json (~40 s)

CONVENTIONS
  Audio is float64 numpy: mono (n,), stereo (n, 2). Times are seconds. S.SR = 44100.
  Notes are MIDI numbers or names ('E2' = 40, 'F#3', 'Bb1'). S.BPM 150, S.BEAT 0.4, S.BAR 1.6, S.STEP 0.1 (16th).
  Levels: instruments come out calibrated (noted per function); one-shot FX are peak-normalised (~0.8-0.95);
  beds (rain_bed, radio_static, room_tone, thermal_hum, fire, crowd_murmur) are quiet RMS-calibrated beds.
  Nothing is limited for you: sum, then master() or limiter(). A render of the whole 112-bar song's guitars
  (2 takes), bass and drums takes about a minute; identical notes / drum hits are cached (round robin).

BASICS  note(name)->midi  hz(m)  ns(sec)->samples  tt(n)  mono(x)  stereo(x, pan=0)  pan(x, p)  panlaw(p)
  place(buf, x, t, gain=1, pan=0)  (adds x into buf at t s; mono/stereo either way)  pad_to(x, n)  mix(*xs)
  fades(x, fin, fout)  curve(n, [(t, v), ...], log_domain=False)  db  undb  rms  peak_norm(x, peak)  crest_db
  env_exp(n, tau)  adsr(n, a, d, s, r, hold)  smoothstep  write_wav(path, x)  read_wav(path)
  oscillators: saw / pulse(width) / sine / tri (freq scalar or per-sample array, PolyBLEP)
  noise: white / pink / brown (n, seed, ch)  smooth_noise(n, rate_hz, seed) (a wandering control in ~[-1, 1])

FILTERS / EQ  lp(x, f, order=2)  hp  bp(x, lo, hi)  peq(x, f, dB, q)  shelf(x, f, dB, 'low'|'high')
  eq(x, ('hp', 90), ('peak', 2500, 3, 1.2), ('ls', 100, 2), ('hs', 8000, -3), ('lp', 9000), ('notch', f, q))
  tvf(x, 'lp'|'hp'|'bp'|..., fc_curve, q)  onepole  dc_block  comb_fb(x, delay_s, fb, damp)  frac_delay(x, d)
  biquad(kind, f, q, gain_db) -> sos  minphase_fir(freqs, dBs) -> h  fir(x, h)
  resample_speed(x, rate_curve) (vinyl/tape speed: pitch + time together)

DYNAMICS / LOUDNESS
  compressor(x, thr_db=-18, ratio=4, attack=.005, release=.12, knee=6, makeup_db=0, side=None) (side = key)
  parallel_comp(x, amount=.4)  gate(x, thr_db=-50, attack, hold, release, range_db, side=None)
  limiter(x, ceiling_db=-1.0) (true-peak, look-ahead, 4x detector)  true_peak(x) (linear)  softclip(x, drive)
  saturate(x, drive=2, asym=0, mix=1)  lufs(x) (BS.1770-4 integrated; pass stereo)  short_term_lufs(x)
  duck(x, key, depth_db=6, attack=.004, release=.18, thr_db=-30) (sidechain ducking)
  pump(n, times, depth_db, attack, release) (a gain curve dipping at each time)
  master(x, target_lufs=-11, ceiling_db=-1.0) (glue comp + gain to target + true-peak limiter; stereo out)

SPACE  ir(kind) cached stereo IRs: 'room' (0.85 s drum room) 'bigroom' 'hall' (2.8 s) 'plate' 'theatre' (2.4 s,
  dark) 'street' (outdoor slap) 'small' (van / closet) 'stairwell';  make_ir(dur, rt_lo, rt_hi, ...)
  convolve(x, h) -> stereo   reverb(x, kind='room', mix=.25, pre_hp=150, tail=True) -> stereo (len + IR if tail)
  delay(x, time_s, fb, mix, lp_f, hp_f, pingpong=True)  slap(x, time_s, gain)  chorus(x, base_ms, depth_ms, rate, mix)
  widen(x, amount) (M/S; lows kept mono)  haas(x, ms)

ELECTRIC GUITAR (DI signals from an extended Karplus-Strong string with pick position, pickup comb, stiffness
  dispersion (real wound-string inharmonicity), pick-attack pitch transient, palm-mute and fretting-hand damping)
  gtr_note(midi, dur, vel=.9, palm=0, bright=.7, pick_pos=.17, detune=0 (cents), release=.035, ring=1) -> DI
  gtr_chord(notes, dur, vel, palm, strum=.007, direction='down'|'up', ...) -> DI
  power(root, '5'|'r5'|'8'|'5_8'|'b5') -> MIDI list   chord_notes('E5'|'Em'|'Cmaj7'|'Am(add9)'|'B7'|'F#m'|'C#7'..,
    voicing='auto'|'power'|'open') (VOICINGS dict holds the open shapes)
  gtr_track(events, dur, seed, humanize=1, detune=0, tight=1) -> DI track. events: dicts
    {t, dur, notes=[midi..] | chord='E5' | midi=40, vel=.9, palm=0..1, strum=s, dir='down'|'up', bright=.7,
     ring=False (True lets it ring past the next event), voicing}. Each event is stopped at the next one.
    Palm-muted chug: {t, dur: .1, midi: 40, palm: .85}. Tremolo picking = many short events.
  lead_line(notes, dur, seed, bright=.75, humanize=1, detune=0) -> DI on ONE continuous string, notes: dicts
    {t, dur, midi, vel, kind='pick'|'hammer'|'tap'|'slide', slide=.08 (glide s for kind 'slide'),
     bend=semitones, bend_t=.12, bend_at=0, release=s_after_onset (bend back), pre_bend=True,
     vib=semitones (.3), vib_rate=5.5, vib_delay=.15, pinch=3|4|5 (pinch-harmonic squeal),
     dive=-24 (whammy dive, semitones), dive_t=.6, slide_out=-12 (fall off at the end)}; rests are muted.
  pick_slide(dur=.5, down=True) -> DI (mix into a DI track or amp() it)
  gtr_feedback(midi, dur, swell=.6, vib=.12, from_note=None) -> DI-like sustained tone (amp it)
  feedback(midi, dur, swell=.8, preset='lead') -> amped mono feedback that blooms in over `swell` s
  humanize_events(events, seed, timing=.004, vel=.05)
AMP  amp(di, preset='rhythm'|'lead'|'crunch'|'clean', gain=1, bass/mid/treble/presence=dB overrides,
    cab='A'|'B'|'C'|False, gate_db=None|False|dB, out_db=0) -> mono. Chain: tight HP + mid boost, three
    asymmetric triode stages at 4x oversampling with coupling / Miller filters, tone stack, power-amp
    saturation + presence + speaker resonance, a synthetic min-phase 4x12 cab IR (resonance ~105 Hz, presence
    2-4.5 kHz, steep roll-off from 5.5 kHz), DI-keyed noise gate. Output: rhythm / crunch ~-13..-14 dBFS RMS,
    lead single notes ~-13, clean ~-21..-25 (headroom for ringing chords). AMP_PRESETS holds the settings;
    cab_ir(variant) the IRs.
  double_track(events, dur, preset='rhythm', seeds=(101, 202), detune=(3, -3), width=1, cabs=('A', 'B'),
    humanize=1, tight=1, amp_kw=None) -> stereo: two humanised takes (timing, pick attack, detune), each through
    its own amp + cab, hard L / R (width < 1 bleeds them). ~-13.5 dBFS RMS per side on chords.
  guitar(events, dur, preset, seed, pan_pos) -> stereo single take
  lead(notes, dur, preset='lead', seed, pan_pos=0, delay_s=None, delay_mix=.18, double=False) -> stereo
  Mixing tip: high-pass rhythm guitars ~70-90 Hz under the bass; they carry a lot of 80-120 Hz chug.

BASS  bass_note(midi, dur, vel, bright=.45, palm, kind='pick'|'finger', sag=cents (the pitch sags this much over
    the note), buzz=0..1 (fret buzz), slide_to=midi, slide_t=.12) -> DI
  bass_track(events, dur, seed, humanize) (events {t, dur, midi, vel, palm, kind, sag, buzz, slide_to, bright})
  bass_amp(di, drive=.6, blend=.5) -> mono (clean low branch + driven high branch, ~-16 dBFS RMS for 8ths)
  bass(events, dur, drive, blend) = bass_amp(bass_track(...))   sub_bass(events, dur, octave=0) -> clean sine

DRUMS (modal membranes, partial-cloud cymbals; 3 velocity layers x round robins, cached)
  pieces (mono unless noted): kick(vel, rr) snare(vel, rr, kind='hit'|'rim'|'ghost') (hard hits = rimshot)
  cross_stick  stick_click (count-in clicks)  tom('tom1'|'tom2'|'tom3'|Hz, vel, rr, mallet='stick'|'bat', tune)
  hat(vel, rr, kind='closed'|'open'|'half'|'pedal')  bat_on_case (wooden road-case TOCK)
  stereo: crash(vel, rr, size=16..20) china splash ride ride_bell
  drum_hit(piece, vel, rr) -> (audio, group, pan) for piece names: kick snare rim ghost xstick stick hat hat_open
    hat_half hat_pedal crash crash2 china splash ride bell tom1 tom2 tom3 bat_tom1 bat_tom2 bat_tom3 case
  drum_track(hits, dur, humanize=1, room=.28, comp=.35, overhead_bleed=.22, stems=False, room_kind='room')
    -> stereo kit (close mics panned drummer's view, overheads with bleed, compressed live room, parallel comp,
    bus soft clip; a groove sits ~-14 dBFS RMS) or with stems=True a dict of stereo stems
    {kick, snare, tom, cym, room, mix} (stems pre-bus: they sum to the mix before its parallel comp / soft clip).
    hits: (t, piece, vel) tuples or {t, piece, vel, choke: s_after}. Open hats
    are choked by the next closed / pedal hat; `choke` chokes a crash (e.g. the B5 hit and choke).
  drum_bus(close, overheads, room, comp) -> stereo (bus for your own stems)
  drum_pattern({'kick': 'X.....x.X.......', 'snare': '....X.......X..g', 'hat': 'x.x.x.x.x.x.o.x.'}, bars, t0)
    -> hit tuples (x .8, X 1.0, g ghost .3, o open hat, r = two 32nds)
  roll_hits(piece, t0, t1, rate=STEP/2, v0=.5, v1=1) -> hit tuples (crescendo roll)
  reverse_crash(dur) (place at downbeat - dur)  riser(dur)

KEYS AND COLOUR
  organ(notes, dur, registration='horror'|'full'|'soft'|'gospel'|'pad'|'theatre'|'888000006', leslie_speed=
    'slow'|'fast'|'stop', drive=.15, click=.5, perc=0, room=0) -> stereo (drawbar tonewheels + two-rotor Leslie).
    The cold-open drone: organ(['E2', 'B2', 'F#3'], dur). Peak ~-2..-5 dBFS.
  organ_track(events {t, dur, notes, vel, registration}, dur, registration, leslie_speed (or a (horn_hz, drum_hz)
    pair of curves for speed-ups)) -> stereo, one continuous Leslie   leslie(x, speed)  organ_tone(...)
  music_box(midi, dur=2.2, vel) -> mono tine
  music_box_line(events {t, midi, vel, dur}, dur, mech=.25, slow_from=None, stop_at=None, room=.25) -> stereo;
    slow_from / stop_at: the clockwork whirr slows and stops with the spring's CLICK at stop_at (s).
    slowing_times(count, t0, step, ritard=1.12) -> onset times of a running-down box. Peak ~-5 dBFS.
  brass_stinger(notes=('Bb1', 'E2'), dur=2.2, voices=3, sub_drop=True, scoop=-1.6, fall=-.5, growl=.6, room=.3)
    -> stereo (the low tritone cluster stinger with sub drop, SPEC 10.3)
  bwaam(midi='E2', dur=1.8) -> stereo (the Roadie's comic-dread BWAAAM: big scoop, growl, sad droop)
  cymbal_ding(midi='B5', dur=3.0) -> stereo pitched DING (reads as the note)

FX (all synthesized; stereo unless noted)
  weather / radio: rain_bed(dur, intensity=1, inside=False) (inside = in the van)  thunder(dur=5, distance=.5)
    radio_static(dur, crackle, whistle) mono   radio_tune(dur=1.5, catches=[(t_centre, audio, width_s)], settle=.25)
    mono (sweep with heterodyne whistles; catches fade in band-limited as the dial crosses them)
    am_radio(x, band=(320, 3000), drive, noise, crackle) mono processor
  car: car_skid(dur=2.5)  car_crash(dur=3.5) (thump, crumple, glass, debris, a hubcap wobbling to rest)
    glass_shatter(dur)  body_bonk(pitch=1) mono (comic BONK)
  Gerald: shotgun(space='street')  shotgun_pump() mono chk-CHK  shotgun_reload(shells=2) mono  shell_tink() mono
  doors: door_slam(space='stairwell') (heavy steel)  door_pound(muffled=True) mono (fist, from outside)
    door_knock(hard=.7) mono (one knuckle knock on steel, heard from inside)  door_burst()
  safe room: pill_rattle(dur=.25, energy) mono  pill_shaker(times, dur, accents) mono (one shake per onset)
    heartbeat_hit(vel, gap=.17) mono (lub-dub)  heartbeat(times, dur) mono  flashlight_click(on=True) mono
  electricity / amps: spark_zap(dur=.7)  mains_hum(dur, base=60, buzz=.5) mono  amp_power_on(hum_dur=1.5) mono
    (thunk + standby click + hum)  lights_on() (contactor CLUNK + dimmer hum)
  generator: generator_pull(pitch='C3', outcome='sputter'|'backfire'|'none', pull=.55) (recoil whirr sweeping up to
    pitch over `pull` s, then a comic cough or a PFFT; ~pull + 1 s)  generator_catch(midi='E2', dur=2, chug_s=.2)
    (fires, revs past, settles into the idle)  generator_idle(dur, midi='E2', chug_s=.2, chug=.6) (hums the note,
    8th-note load chug)
  stage: pyro_whoosh(dur=1.3)  fire(dur, intensity) bed  frisbee_whoosh(dur=1.0)  whoosh(dur, f_lo, f_hi, pan_from,
    pan_to, flutter)  big_thud() (the Roadie down)  crowd_stomp(count=60, spread=.03) (one stomp of many feet)
    bat_on_case (see drums)  firework_boom(crackle=True, whistle=False)  reverse_beep(midi='B4', dur=.45) (truck
    reversing beeper + street slap)
  crowd: applause(dur, size=300, distant=True, whistles=3, woos=0)  crowd_murmur(dur, size=40) bed
  chopper / camera: helicopter(dur, rate=10 (blade slaps per s from t=0: 16ths at 150 BPM), muffled=False,
    fade_in=0, accent=4)  thermal_hum(dur) bed  hud_chirp(up=True) mono
  ambience: room_tone(dur, 'room'|'theatre'|'wind'|'van'|'street'|'roof') (~-40 dBFS RMS)
  1987 bootleg: cassette(x, wow=.35, flutter=.15, hiss=.02, dropouts=2, band=(90, 7000), drive=.4, cut_click=True)
    mono processor (mono, band-limited, saturated, wow / flutter, hiss, dropouts, tape-cut click + dead air at the
    end)  fire_alarm_bell(dur, rate=17) mono  film_burn(dur=.8) (projector jam + burning)
  processors: tape_stop(x, start, dur=.8, curve=1.6) (winds pitch and speed down to silence; same shape back)

ANALYSIS  metrics(x) -> dict (peak, true peak, RMS, crest, LUFS, band energies, octave_db, clipping, stereo corr)
  octave_db(x)  band_db(x, lo, hi)  ltas(x)  spectrogram_png(x, path, title, grid_s=None)  spectrum_png([(label,
  x, rgb)], path)  pitch_track(x) -> (t, midi)  pitch_png(...)
"""
import argparse
import json
import time
import zlib
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

SR = 44100
BPM = 150.0
BEAT = 60.0 / BPM        # 0.4 s
BAR = 4 * BEAT           # 1.6 s
STEP = BEAT / 4          # 0.1 s (a 16th)
_T0 = time.time()


def log(*a):
    print(f'[ns_synth {time.time() - _T0:6.1f}s]', *a, flush=True)


# =====================================================================================================
# basics: notes, time, shapes
# =====================================================================================================

_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def note(name):
    """'E2' -> 40, 'F#3' -> 54, 'Bb1' -> 34, 'C#5' -> 73. Ints / floats pass through unchanged."""
    if isinstance(name, (int, float, np.integer, np.floating)):
        return name
    s = str(name).strip()
    pc = _PC[s[0].upper()]
    i = 1
    while i < len(s) and s[i] in '#b':
        pc += 1 if s[i] == '#' else -1
        i += 1
    octv = int(s[i:])
    return 12 * (octv + 1) + pc


def hz(m):
    """MIDI note (number, array or name) -> Hz."""
    if isinstance(m, str):
        m = note(m)
    return 440.0 * 2.0 ** ((np.asarray(m, float) - 69.0) / 12.0)


def ns(sec):
    """Seconds -> whole samples (at least 1)."""
    return max(1, int(round(sec * SR)))


def tt(n):
    return np.arange(n) / SR


def mono(x):
    x = np.asarray(x, float)
    return x.mean(axis=1) if x.ndim == 2 else x


def panlaw(p):
    """Equal-power pan gains (gl, gr) for p in [-1, 1]; unity in both channels at the centre."""
    a = (np.clip(p, -1, 1) + 1.0) * np.pi / 4.0
    return np.cos(a) * np.sqrt(2.0), np.sin(a) * np.sqrt(2.0)


def stereo(x, pan=0.0):
    """Mono (n,) -> stereo (n, 2) panned with panlaw; stereo input is returned as is (or balanced by pan)."""
    x = np.asarray(x, float)
    if x.ndim == 2:
        if pan == 0.0:
            return x
        gl, gr = panlaw(pan)
        return x * np.array([min(1.0, gl), min(1.0, gr)])
    gl, gr = panlaw(pan)
    return np.stack([x * gl, x * gr], axis=1)


def pan(x, p):
    return stereo(mono(x) if np.ndim(x) == 2 else x, p)


def place(buf, x, t, gain=1.0, pan=0.0):
    """Add x (mono or stereo) into buf (mono (n,) or stereo (n, 2)) starting at t (seconds; or an int sample)."""
    i0 = int(t) if isinstance(t, (int, np.integer)) else int(round(t * SR))
    x = np.asarray(x, float)
    if buf.ndim == 2:
        x = stereo(x, pan) if x.ndim == 1 else (stereo(x, pan) if pan else x)
    elif x.ndim == 2:
        x = x.mean(axis=1)
    n = x.shape[0]
    a, b = max(0, i0), min(buf.shape[0], i0 + n)
    if b > a:
        buf[a:b] += gain * x[a - i0:b - i0]
    return buf


def pad_to(x, n):
    x = np.asarray(x, float)
    if x.shape[0] >= n:
        return x[:n]
    w = [(0, n - x.shape[0])] + [(0, 0)] * (x.ndim - 1)
    return np.pad(x, w)


def fades(x, fin=0.002, fout=0.005):
    """Raised-cosine fade in and out (seconds)."""
    x = np.array(x, float, copy=True)
    n = x.shape[0]
    a = min(n, max(1, int(fin * SR)))
    b = min(n, max(1, int(fout * SR)))
    sh = (-1,) + (1,) * (x.ndim - 1)
    x[:a] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)).reshape(sh)
    x[n - b:] *= (0.5 + 0.5 * np.cos(np.pi * (np.arange(b) + 1) / b)).reshape(sh)
    return x


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def curve(n, pts, log_domain=False):
    """Piecewise-linear automation of n samples from [(time_s, value), ...] (optionally interpolated in log)."""
    ts = np.array([p[0] for p in pts], float)
    vs = np.array([p[1] for p in pts], float)
    t = tt(n)
    if log_domain:
        return np.exp(np.interp(t, ts, np.log(np.maximum(vs, 1e-9))))
    return np.interp(t, ts, vs)


def db(x):
    return 20.0 * np.log10(np.maximum(np.abs(x), 1e-12))


def undb(d):
    return 10.0 ** (np.asarray(d, float) / 20.0)


def peak_norm(x, peak=1.0):
    m = np.abs(x).max()
    return x * (peak / m) if m > 0 else x


def rms(x):
    return float(np.sqrt(np.mean(np.asarray(x, float) ** 2) + 1e-20))


def mix(*items, n=None):
    """Sum mono / stereo arrays of different lengths (stereo if any input is). Returns the sum."""
    items = [np.asarray(i, float) for i in items if i is not None]
    n = n or max(i.shape[0] for i in items)
    st_ = any(i.ndim == 2 for i in items)
    out = np.zeros((n, 2) if st_ else n)
    for i in items:
        place(out, i, 0)
    return out


def env_exp(n, tau, attack=0.0005):
    t = tt(n)
    return np.exp(-t / tau) * np.minimum(1.0, t / max(attack, 1e-6))


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, hold=None):
    """ADSR of n samples; the release starts at `hold` seconds (default n - r)."""
    t = tt(n)
    hold = (n / SR - r) if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    lvl = np.interp(hold, t, e) if n else 0
    e = np.where(t < hold, e, lvl * np.exp(-(t - hold) / max(r / 4.0, 1e-6)))
    return e


# =====================================================================================================
# oscillators and noise
# =====================================================================================================

def _phase(freq, n, ph0=0.0):
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


def pulse(freq, n, ph0=0.0, width=0.5):
    ph, dt = _phase(freq, n, ph0)
    ph2 = (ph + width) % 1.0
    return (2.0 * ph - 1.0 - _blep(ph, dt)) - (2.0 * ph2 - 1.0 - _blep(ph2, dt))


def sine(freq, n, ph0=0.0):
    ph, _ = _phase(freq, n, ph0)
    return np.sin(2 * np.pi * ph)


def tri(freq, n, ph0=0.0):
    ph, _ = _phase(freq, n, ph0)
    return 4.0 * np.abs(ph - 0.5) - 1.0


def white(n, seed=0, ch=1):
    r = np.random.default_rng(seed)
    return r.standard_normal((n, ch)) if ch > 1 else r.standard_normal(n)


def pink(n, seed=0, ch=1):
    """Pink-ish noise (Voss-McCartney approximation via a 1/f filter on white), unit RMS."""
    w = white(n, seed, ch)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    y = signal.lfilter(b, a, w, axis=0)
    return y / (np.std(y) + 1e-12)


def brown(n, seed=0, ch=1):
    w = white(n, seed, ch)
    y = signal.lfilter([1.0], [1, -0.997], w, axis=0)
    y = hp(y, 15, 1)
    return y / (np.std(y) + 1e-12)


def smooth_noise(n, rate_hz, seed=0):
    """Band-limited random control signal in about [-1, 1] changing at roughly rate_hz."""
    r = np.random.default_rng(seed)
    k = max(4, int(n / SR * rate_hz) + 4)
    pts = r.uniform(-1, 1, k)
    xs = np.linspace(0, n, k)
    cs = np.interp(np.arange(n), xs, pts)
    return lp(cs, max(0.5, rate_hz), 2)


# =====================================================================================================
# filters
# =====================================================================================================

def _sos(kind, f, order=2, fs=SR):
    return signal.butter(order, f, btype=kind, fs=fs, output='sos')


def lp(x, f, order=2, zero_phase=False):
    """Butterworth low-pass (works on mono (n,) or stereo (n, 2) along time)."""
    sos = _sos('low', min(f, SR * 0.49), order)
    return (signal.sosfiltfilt if zero_phase else signal.sosfilt)(sos, x, axis=0)


def hp(x, f, order=2, zero_phase=False):
    sos = _sos('high', max(f, 1.0), order)
    return (signal.sosfiltfilt if zero_phase else signal.sosfilt)(sos, x, axis=0)


def bp(x, lo, hi, order=2, zero_phase=False):
    sos = _sos('band', (max(lo, 1.0), min(hi, SR * 0.49)), order)
    return (signal.sosfiltfilt if zero_phase else signal.sosfilt)(sos, x, axis=0)


def biquad(kind, f, q=0.7071, gain_db=0.0, fs=SR):
    """RBJ cookbook biquad as a (1, 6) sos. kind: lp hp bp notch peak ls hs ap."""
    f = float(np.clip(f, 5.0, fs * 0.49))
    w = 2 * np.pi * f / fs
    c, s = np.cos(w), np.sin(w)
    al = s / (2 * q)
    A = 10 ** (gain_db / 40.0)
    if kind == 'lp':
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'hp':
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'bp':
        b = [al, 0.0, -al]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'notch':
        b = [1.0, -2 * c, 1.0]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'ap':
        b = [1 - al, -2 * c, 1 + al]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind in ('ls', 'hs'):
        sq = 2 * np.sqrt(A) * al
        if kind == 'ls':
            b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
            a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
        else:
            b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
            a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return np.concatenate([b, a])[None, :]


def peq(x, f, gain_db, q=1.0):
    """Peaking EQ band."""
    return signal.sosfilt(biquad('peak', f, q, gain_db), x, axis=0)


def shelf(x, f, gain_db, kind='low', q=0.7071):
    return signal.sosfilt(biquad('ls' if kind.startswith('l') else 'hs', f, q, gain_db), x, axis=0)


def eq(x, *bands):
    """Chain of bands, each a tuple: ('hp', f[, order]) ('lp', f[, order]) ('peak', f, dB[, q]) ('ls', f, dB)
    ('hs', f, dB) ('notch', f[, q]) ('bp', lo, hi). Example: eq(x, ('hp', 90), ('peak', 2500, 3, 1.2), ('lp', 9000))."""
    y = np.asarray(x, float)
    for b in bands:
        k = b[0]
        if k == 'hp':
            y = hp(y, b[1], b[2] if len(b) > 2 else 2)
        elif k == 'lp':
            y = lp(y, b[1], b[2] if len(b) > 2 else 2)
        elif k == 'bp':
            y = bp(y, b[1], b[2], b[3] if len(b) > 3 else 2)
        elif k == 'peak':
            y = peq(y, b[1], b[2], b[3] if len(b) > 3 else 1.0)
        elif k in ('ls', 'hs'):
            y = signal.sosfilt(biquad(k, b[1], b[3] if len(b) > 3 else 0.7071, b[2]), y, axis=0)
        elif k == 'notch':
            y = signal.sosfilt(biquad('notch', b[1], b[2] if len(b) > 2 else 4.0), y, axis=0)
        else:
            raise ValueError(k)
    return y


def tvf(x, kind, fc, q=0.7071, block=64):
    """Biquad with a time-varying cutoff fc (scalar or per-sample array); coefficients per block, state carried."""
    x = np.asarray(x, float)
    x2 = x[:, None] if x.ndim == 1 else x
    n = x2.shape[0]
    fc = np.broadcast_to(np.asarray(fc, float), (n,))
    y = np.empty_like(x2)
    zi = np.zeros((1, 2, x2.shape[1]))
    for s0 in range(0, n, block):
        sos = biquad(kind, fc[min(n - 1, s0 + block // 2)], q)
        y[s0:s0 + block], zi = signal.sosfilt(sos, x2[s0:s0 + block], axis=0, zi=zi)
    return y[:, 0] if x.ndim == 1 else y


def onepole(x, fc, kind='lp'):
    """First-order low/high-pass (fc scalar)."""
    a = np.exp(-2 * np.pi * fc / SR)
    y = signal.lfilter([1 - a], [1, -a], x, axis=0)
    return y if kind == 'lp' else np.asarray(x, float) - y


def dc_block(x, f=12.0):
    return hp(x, f, 1)


def comb_fb(x, delay_s, fb=0.6, damp=0.3):
    """Feedback comb (for resonant / metallic bodies): y[n] = x[n] + fb * lp(y[n - d])."""
    d = max(1, int(round(delay_s * SR)))
    a = np.zeros(d + 2)
    a[0] = 1.0
    a[d] = -fb * (1 - damp)
    a[d + 1] = -fb * damp
    return signal.lfilter([1.0], a, x, axis=0)


def frac_delay(x, d):
    """Delay x by d samples (scalar or per-sample array, >= 0) with linear interpolation."""
    x = np.asarray(x, float)
    n = x.shape[0]
    idx = np.arange(n) - np.broadcast_to(np.asarray(d, float), (n,))
    if x.ndim == 1:
        return np.interp(idx, np.arange(n), x, left=0.0)
    return np.stack([np.interp(idx, np.arange(n), x[:, c], left=0.0) for c in range(x.shape[1])], axis=1)


def resample_speed(x, rate):
    """Play x back at a per-sample speed curve `rate` (1 = normal, 0 = stopped): pitch and time change together
    (vinyl / tape). Output length = len(rate)."""
    x = np.asarray(x, float)
    pos = np.cumsum(np.asarray(rate, float)) - rate[0]
    n = x.shape[0]
    pos = np.clip(pos, 0, n - 1)
    if x.ndim == 1:
        return np.interp(pos, np.arange(n), x)
    return np.stack([np.interp(pos, np.arange(n), x[:, c]) for c in range(x.shape[1])], axis=1)


def minphase_fir(freqs, gains_db, ntaps=2048, nfft=16384):
    """Minimum-phase FIR whose magnitude follows (freqs Hz, gains dB) interpolated on a log axis."""
    f = np.fft.rfftfreq(nfft, 1 / SR)
    lf = np.log(np.maximum(f, 1.0))
    g = np.interp(lf, np.log(np.asarray(freqs, float)), np.asarray(gains_db, float))
    mag = 10 ** (g / 20.0)
    cep = np.fft.irfft(np.log(np.maximum(mag, 1e-9)), nfft)
    fold = np.zeros(nfft)
    fold[0] = cep[0]
    fold[1:nfft // 2] = 2 * cep[1:nfft // 2]
    fold[nfft // 2] = cep[nfft // 2]
    h = np.fft.irfft(np.exp(np.fft.rfft(fold)), nfft)[:ntaps]
    w = np.ones(ntaps)
    k = ntaps // 4
    w[-k:] = 0.5 + 0.5 * np.cos(np.pi * np.arange(k) / k)
    return h * w


def fir(x, h):
    """FFT convolution of mono / stereo x with FIR h, truncated to len(x)."""
    x = np.asarray(x, float)
    n = x.shape[0]
    if x.ndim == 1:
        return signal.oaconvolve(x, h)[:n]
    return np.stack([signal.oaconvolve(x[:, c], h)[:n] for c in range(x.shape[1])], axis=1)


# =====================================================================================================
# dynamics and loudness
# =====================================================================================================

def _env_follow(lvl_db, attack, release):
    """Peak-capture in dB with linear-in-dB release, then one-pole attack (vectorised)."""
    idx = np.arange(len(lvl_db))
    rate = (20.0 / max(release, 1e-4)) / SR
    env = np.maximum.accumulate(lvl_db + idx * rate) - idx * rate
    aa = np.exp(-1.0 / (max(attack, 1e-5) * SR))
    return signal.lfilter([1 - aa], [1, -aa], env)


def compressor(x, thr_db=-18.0, ratio=4.0, attack=0.005, release=0.12, knee=6.0, makeup_db=0.0, side=None,
               rms_win=0.008, return_gain=False):
    """Feed-forward compressor (RMS detector, soft knee). Mono or stereo (linked). side = optional key signal."""
    x = np.asarray(x, float)
    d = x if side is None else np.asarray(side, float)
    p = d ** 2 if d.ndim == 1 else np.mean(d ** 2, axis=1)
    a = np.exp(-1.0 / (rms_win * SR))
    p = signal.lfilter([1 - a], [1, -a], p)
    lvl = 10 * np.log10(p + 1e-12)
    over = lvl - thr_db
    s = 1 - 1.0 / ratio
    gr = np.where(over <= -knee / 2, 0.0, np.where(over >= knee / 2, over * s, s * (over + knee / 2) ** 2 / (2 * knee)))
    env = _env_follow(gr, attack, release)
    g = 10 ** ((makeup_db - env) / 20)
    if len(g) < x.shape[0]:
        g = pad_to(g, x.shape[0]) + (g[-1] if len(g) else 1.0) * (np.arange(x.shape[0]) >= len(g))
    g = g[:x.shape[0]]
    y = x * (g if x.ndim == 1 else g[:, None])
    return (y, g) if return_gain else y


def parallel_comp(x, amount=0.4, thr_db=-30.0, ratio=8.0, attack=0.002, release=0.08):
    """New York compression: x + amount * heavily-compressed x (level matched)."""
    c = compressor(x, thr_db, ratio, attack, release, knee=4.0)
    c *= rms(x) / (rms(c) + 1e-12)
    return x + amount * c


def gate(x, thr_db=-50.0, attack=0.0005, hold=0.01, release=0.05, range_db=80.0, side=None):
    """Noise gate keyed on side (or x): opens over the 6 dB below thr_db (peak level), holds `hold` s, then closes
    by range_db over `release` s (linear in dB). Mono or stereo."""
    x = np.asarray(x, float)
    d = np.abs(mono(x if side is None else side))
    d = maximum_filter1d(d, size=max(3, int(0.003 * SR)))
    op = smoothstep((db(d) - (thr_db - 6.0)) / 6.0)
    h = max(1, int(hold * SR))
    op = maximum_filter1d(op, size=2 * h + 1)          # opens h early and holds h late
    gdb = -range_db * (1.0 - op)
    idx = np.arange(len(gdb))
    rate = range_db / max(release, 1e-4) / SR
    env = np.maximum.accumulate(gdb + idx * rate) - idx * rate
    aa = np.exp(-1.0 / (max(attack, 1e-5) * SR))
    env = signal.lfilter([1 - aa], [1, -aa], env, zi=[env[0] * aa])[0]
    g = pad_to(10 ** (env / 20), x.shape[0])
    g[len(env):] = g[len(env) - 1] if len(env) else 1.0
    return x * (g if x.ndim == 1 else g[:, None])


def true_peak(x):
    """4x-oversampled peak (linear)."""
    x = np.asarray(x, float)
    up = signal.resample_poly(x, 4, 1, axis=0)
    return float(max(np.abs(up).max(), np.abs(x).max()))


def limiter(x, ceiling_db=-1.0, look=0.0015, release=0.08):
    """True-peak look-ahead limiter (4x oversampled detector; gain at every peak <= what it needs)."""
    x = np.asarray(x, float)
    x2 = x[:, None] if x.ndim == 1 else x
    n = x2.shape[0]
    c = 10 ** (ceiling_db / 20)
    up = np.abs(signal.resample_poly(x2, 4, 1, axis=0)).max(axis=1)[:4 * n]
    up = pad_to(up, 4 * n).reshape(n, 4).max(axis=1)
    pk = maximum_filter1d(np.maximum(up, np.abs(x2).max(axis=1)), 3)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    L = max(1, int(look * SR))
    h = minimum_filter1d(req, size=2 * L + 1, mode='nearest')
    g = uniform_filter1d(h, size=2 * L + 1, mode='nearest')
    g = np.minimum(g, h)
    gdb = 20 * np.log10(np.maximum(g, 1e-6))
    idx = np.arange(n)
    rate = (10.0 / release) / SR
    gdb = np.minimum.accumulate(gdb - idx * rate) + idx * rate
    g = 10 ** (gdb / 20)
    y = x2 * g[:, None]
    return y[:, 0] if x.ndim == 1 else y


def softclip(x, drive=1.0):
    """tanh soft clipper (2x oversampled), unity small-signal gain."""
    x = np.asarray(x, float)
    n = x.shape[0]
    up = signal.resample_poly(x, 2, 1, axis=0)
    up = np.tanh(drive * up) / drive
    return signal.resample_poly(up, 1, 2, axis=0)[:n]


def saturate(x, drive=2.0, asym=0.0, mix=1.0):
    """Tape/tube-style saturation (2x oversampled), output roughly level-matched."""
    x = np.asarray(x, float)
    n = x.shape[0]
    up = signal.resample_poly(x, 2, 1, axis=0)
    b = asym
    y = (np.tanh(drive * up + b) - np.tanh(b)) / (drive * (1 - np.tanh(b) ** 2) + 1e-9)
    y = signal.resample_poly(y, 1, 2, axis=0)[:n]
    y = dc_block(y, 8) if asym else y
    return (1 - mix) * x + mix * y


def k_weight(x):
    """BS.1770 K-weighting (pre-filter shelf + RLB high-pass)."""
    x = np.asarray(x, float)
    G, Q, fc = 3.999843853973347, 0.7071752369554196, 1681.974450955533
    A = 10 ** (G / 40)
    w0 = 2 * np.pi * fc / SR
    al = np.sin(w0) / (2 * Q)
    c = np.cos(w0)
    b = [A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c),
         A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * al)]
    a = [(A + 1) - (A - 1) * c + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c),
         (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * al]
    y = signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)
    Q, fc = 0.5003270373238773, 38.13547087602444
    w0 = 2 * np.pi * fc / SR
    al = np.sin(w0) / (2 * Q)
    c = np.cos(w0)
    b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    a = [1 + al, -2 * c, 1 - al]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], y, axis=0)


def lufs(x, start=None, end=None):
    """Integrated loudness, BS.1770-4 (400 ms blocks, 75 % overlap, -70 LUFS absolute and -10 LU relative gates).
    Mono input is measured as one channel (a centred mono signal in stereo reads +3 LU)."""
    y = k_weight(np.asarray(x, float))
    if y.ndim == 1:
        y = y[:, None]
    if start is not None:
        y = y[int(start * SR):int(end * SR)]
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    if y.shape[0] < blk:
        return -np.inf
    c = np.cumsum(np.pad(y ** 2, ((1, 0), (0, 0))), axis=0)
    st_idx = np.arange(0, y.shape[0] - blk + 1, hop)
    z = (c[st_idx + blk] - c[st_idx]) / blk
    zs = z.sum(axis=1)
    l = -0.691 + 10 * np.log10(zs + 1e-20)
    m = l > -70
    if not m.any():
        return -np.inf
    rel = -0.691 + 10 * np.log10(zs[m].mean()) - 10
    m &= l > rel
    return float(-0.691 + 10 * np.log10(zs[m].mean()))


def short_term_lufs(x, win=3.0, hop=0.5):
    """Short-term loudness curve: (times_s, LUFS) with a win-second window every hop seconds."""
    y = k_weight(np.asarray(x, float))
    if y.ndim == 1:
        y = y[:, None]
    e = np.sum(y ** 2, axis=1)
    c = np.concatenate([[0.0], np.cumsum(e)])
    W, H = int(win * SR), int(hop * SR)
    idx = np.arange(0, max(1, len(e) - W + 1), H)
    v = (c[np.minimum(idx + W, len(e))] - c[idx]) / W
    return (idx + W / 2) / SR, -0.691 + 10 * np.log10(v + 1e-20)


def crest_db(x):
    x = np.asarray(x, float)
    return float(db(np.abs(x).max()) - db(rms(x)))


def duck(x, key, depth_db=6.0, attack=0.004, release=0.18, thr_db=-30.0, knee_db=12.0):
    """Sidechain ducking: x is lowered by up to depth_db while key is above thr_db (smooth, knee_db wide)."""
    k = mono(key)
    a = np.exp(-1.0 / (0.005 * SR))
    p = signal.lfilter([1 - a], [1, -a], k ** 2)
    lvl = 10 * np.log10(p + 1e-12)
    amt = smoothstep((lvl - thr_db) / knee_db) * depth_db
    env = _env_follow(amt, attack, release)
    g = pad_to(10 ** (-env / 20), np.asarray(x).shape[0])
    g[len(env):] = 1.0
    return x * (g if np.ndim(x) == 1 else g[:, None])


def pump(n, times, depth_db=6.0, attack=0.003, release=0.22):
    """Gain curve of n samples that dips by depth_db at each time in `times` (a kick-keyed pump)."""
    t = tt(n)
    g = np.zeros(n)
    for t0 in times:
        i0 = int(t0 * SR)
        if 0 <= i0 < n:
            u = t[i0:] - t[i0]
            g[i0:] = np.maximum(g[i0:], np.exp(-u / release) * np.minimum(1, u / attack + 0.3))
    return 10 ** (-depth_db * g / 20)


# =====================================================================================================
# space: synthetic impulse responses, convolution reverb, delays, width
# =====================================================================================================

def make_ir(dur=1.6, rt_lo=1.6, rt_hi=0.8, pre=0.012, er=12, er_span=0.06, er_gain=1.0, lp_f=11000.0,
            build=0.01, width=1.0, seed=0, dense_er=0):
    """Synthetic stereo IR (n, 2): 3-band exponential noise tail (RT60 rt_lo below 600 Hz, rt_hi above 3.5 kHz),
    sparse early reflections inside er_span, optional dense_er extra ER taps, pre-delay, energy normalised."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    out = np.zeros((n, 2))
    sos_lo = _sos('low', 600)
    sos_hi = _sos('high', 3500)
    rt_mid = 0.5 * (rt_lo + rt_hi)
    common = r.standard_normal(n)
    for ch in range(2):
        w = r.standard_normal(n)
        w = width * w + (1 - width) * common
        lo = signal.sosfilt(sos_lo, w)
        hi = signal.sosfilt(sos_hi, w)
        mid = w - lo - hi
        y = lo * np.exp(-6.91 * t / rt_lo) + mid * np.exp(-6.91 * t / rt_mid) + hi * np.exp(-6.91 * t / rt_hi)
        y *= 1.0 - np.exp(-t / max(build, 1e-4))
        for _ in range(er + dense_er):
            d = int(r.uniform(0.002, er_span) * SR)
            if d < n:
                y[d] += er_gain * r.uniform(3, 10) * (1.0 - d / (1.3 * er_span * SR)) * r.choice([-1.0, 1.0])
        out[:, ch] = lp(y, lp_f)
    tail = n // 8
    out[n - tail:] *= (np.linspace(1, 0, tail) ** 2)[:, None]
    out = np.pad(out, ((ns(pre), 0), (0, 0)))
    out /= np.sqrt(np.sum(out ** 2, axis=0, keepdims=True))
    return out


_IRS = {}


def ir(kind='room'):
    """Cached named IRs: 'room' (drum room, 0.8 s), 'bigroom' (1.3 s), 'hall' (2.6 s), 'plate' (1.8 s bright),
    'theatre' (old theatre, 2.2 s dark), 'street' (outdoor slap, 1.2 s), 'small' (closet / van, 0.35 s),
    'stairwell' (2 s, ringing)."""
    if kind in _IRS:
        return _IRS[kind]
    P = {
        'room': dict(dur=1.0, rt_lo=0.85, rt_hi=0.45, pre=0.004, er=18, er_span=0.035, er_gain=1.4, lp_f=9000, seed=11),
        'bigroom': dict(dur=1.6, rt_lo=1.4, rt_hi=0.7, pre=0.008, er=16, er_span=0.05, er_gain=1.2, lp_f=9500, seed=12),
        'hall': dict(dur=3.2, rt_lo=2.8, rt_hi=1.5, pre=0.022, er=10, er_span=0.08, lp_f=10000, seed=13),
        'plate': dict(dur=2.2, rt_lo=1.7, rt_hi=1.5, pre=0.002, er=0, lp_f=13000, build=0.004, seed=14),
        'theatre': dict(dur=2.8, rt_lo=2.4, rt_hi=1.0, pre=0.018, er=14, er_span=0.09, er_gain=1.1, lp_f=7000, seed=15),
        'street': dict(dur=1.6, rt_lo=1.1, rt_hi=0.6, pre=0.03, er=6, er_span=0.16, er_gain=1.8, lp_f=8000, seed=16),
        'small': dict(dur=0.5, rt_lo=0.32, rt_hi=0.18, pre=0.001, er=14, er_span=0.012, er_gain=1.5, lp_f=7000, seed=17),
        'stairwell': dict(dur=2.4, rt_lo=2.0, rt_hi=1.4, pre=0.006, er=20, er_span=0.04, er_gain=1.3, lp_f=9000, seed=18),
    }[kind]
    _IRS[kind] = make_ir(**P)
    return _IRS[kind]


def convolve(x, h):
    """Mono / stereo x convolved with IR h (n, 2) or (n,): returns stereo (len(x), 2)."""
    x = np.asarray(x, float)
    n = x.shape[0]
    h = np.asarray(h, float)
    if h.ndim == 1:
        h = np.stack([h, h], axis=1)
    xs = stereo(x) if x.ndim == 1 else x
    return np.stack([signal.oaconvolve(xs[:, c], h[:, c])[:n] for c in range(2)], axis=1)


def reverb(x, kind='room', mix=0.25, pre_hp=150.0, pre_lp=None, tail=True):
    """Wet/dry convolution reverb with a named IR (see ir()). Returns stereo; tail=True extends the output by the
    IR length so the decay is not cut."""
    x = np.asarray(x, float)
    h = ir(kind) if isinstance(kind, str) else kind
    xs = stereo(x)
    if tail:
        xs = np.pad(xs, ((0, h.shape[0]), (0, 0)))
    w = xs
    if pre_hp:
        w = hp(w, pre_hp, 2)
    if pre_lp:
        w = lp(w, pre_lp, 2)
    return xs * (1 - mix) + convolve(w, h) * mix


def delay(x, time_s=0.3, fb=0.35, mix=0.25, lp_f=4500.0, hp_f=200.0, pingpong=True, taps=8):
    """Feedback delay (filtered repeats), stereo out; pingpong alternates the repeats L/R. Output keeps len(x)."""
    xs = stereo(x)
    n = xs.shape[0]
    m = xs.mean(axis=1)
    d = int(round(time_s * SR))
    out = np.zeros((n, 2))
    cur = hp(m, hp_f, 1)
    for k in range(1, taps + 1):
        if k * d >= n:
            break
        cur = onepole(cur, lp_f) * (fb if k > 1 else 1.0)
        if pingpong:
            out[k * d:, (k - 1) % 2] += cur[:n - k * d]
        else:
            out[k * d:] += cur[:n - k * d, None]
    return xs + mix * out


def slap(x, time_s=0.09, gain=0.35, lp_f=3500.0):
    """Single slapback echo (mono in, mono out)."""
    m = mono(x)
    d = int(time_s * SR)
    y = m.copy()
    y[d:] += gain * onepole(m, lp_f)[:-d]
    return y


def widen(x, amount=1.3):
    """Mid/side width: 0 = mono, 1 = unchanged, >1 wider (side boosted, low side kept mono below 150 Hz)."""
    xs = stereo(x)
    m = 0.5 * (xs[:, 0] + xs[:, 1])
    s = 0.5 * (xs[:, 0] - xs[:, 1])
    s_lo = lp(s, 150, 2)
    s = s_lo * min(amount, 1.0) + (s - s_lo) * amount
    return np.stack([m + s, m - s], axis=1)


def haas(x, ms=12.0, side=1):
    """Mono -> stereo by delaying one side a few ms (side 1 = right delayed)."""
    m = mono(x)
    d = int(ms * SR / 1000)
    dl = np.concatenate([np.zeros(d), m[:-d]]) if d > 0 else m
    return np.stack([m, dl] if side > 0 else [dl, m], axis=1)


def chorus(x, base_ms=9.0, depth_ms=2.0, rate=0.6, mix=0.4):
    """Stereo chorus (two modulated taps in quadrature)."""
    xs = stereo(x)
    n = xs.shape[0]
    t = tt(n)
    y = np.empty_like(xs)
    for ch, ph in enumerate((0.0, np.pi / 2)):
        d = (base_ms + depth_ms * np.sin(2 * np.pi * rate * t + ph)) * SR / 1000.0
        y[:, ch] = (1 - mix) * xs[:, ch] + mix * frac_delay(xs[:, ch], d)
    return y


def master(x, target_lufs=-11.0, ceiling_db=-1.0, glue=True):
    """Simple master chain: gentle bus comp, gain to target LUFS, true-peak limiter (iterated twice)."""
    y = stereo(x)
    if glue:
        y = compressor(y, -14.0, 2.0, attack=0.02, release=0.2, knee=8.0)
    for _ in range(3):
        L = lufs(y)
        if not np.isfinite(L):
            break
        y = y * 10 ** ((target_lufs - L) / 20)
        y = limiter(y, ceiling_db - 0.15)
    return y


def write_wav(path, x, peak_guard=True):
    """Write float audio as 16-bit PCM WAV (mono or stereo (n, 2))."""
    x = np.asarray(x, float)
    if peak_guard:
        m = np.abs(x).max()
        if m > 0.999:
            x = x * (0.999 / m)
    wavfile.write(str(path), SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


def read_wav(path):
    sr, x = wavfile.read(str(path))
    x = x.astype(float) / (32768.0 if x.dtype == np.int16 else 1.0)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr, axis=0)
    return x


# =====================================================================================================
# the string: extended Karplus-Strong, vectorised one period at a time
# =====================================================================================================
# y[n] = e[n] + g * LP( y[n - D(n)] ), D fractional (3rd-order Lagrange), LP a one-pole whose coefficient is
# solved from two decay times (t60 of the fundamental and t60_hi at f_hi), g corrected for the LP's loss at f0,
# D corrected for the LP's phase delay at f0 (so the pitch is exact). Because the loop delay is at least one
# period, a whole block of (period - 3) samples only reads samples already computed: numpy evaluates it in one
# go and scipy carries the one-pole state across blocks. Any period curve works (bends, vibrato, slides,
# dive bombs), and the cost is ~ SR / period Python iterations per second of audio.

def _lagrange3(y, pos):
    i = np.floor(pos).astype(np.int64)
    f = pos - i
    ym1 = y[i - 1]
    y0 = y[i]
    y1 = y[i + 1]
    y2 = y[i + 2]
    fm1 = f - 1.0
    fm2 = f - 2.0
    fp1 = f + 1.0
    return (-f * fm1 * fm2 / 6.0) * ym1 + (fp1 * fm1 * fm2 / 2.0) * y0 + (-fp1 * f * fm2 / 2.0) * y1 + (fp1 * f * fm1 / 6.0) * y2


def _loop_lp_coef(f0, t60, t60_hi, f_hi):
    """One-pole loop coefficient p (vectorised) giving the extra high-frequency loss per period."""
    f_hi = np.maximum(np.minimum(f_hi, SR * 0.45), 2.5 * f0)
    extra_db_per_s = np.maximum(60.0 / t60_hi - 60.0 / t60, 0.0)
    l_db = extra_db_per_s / f0                       # dB lost per period at f_hi (beyond the fundamental's)
    L = 10 ** (-l_db / 10.0)                         # |H(w_hi)|^2
    c = np.cos(2 * np.pi * f_hi / SR)
    oneL = np.maximum(1.0 - L, 1e-12)
    A = 1.0 - L * c
    disc = np.maximum(A * A - oneL * oneL, 0.0)
    p = (A - np.sqrt(disc)) / oneL
    return np.clip(np.where(l_db < 1e-9, 0.0, p), 0.0, 0.995)


def _ap_phase_delay(a, w, M):
    """Phase delay (samples) of M cascaded first-order allpasses (a + z^-1) / (1 + a z^-1) at w (rad/sample)."""
    ph = np.arctan2(-np.sin(w), a + np.cos(w)) - np.arctan2(-a * np.sin(w), 1 + a * np.cos(w))
    return -M * ph / w


_DISP_CACHE = {}


def dispersion_coef(period, B, M=4):
    """Allpass coefficient a (< 0) for M stages so that the loop delay falls with frequency like a stiff string of
    inharmonicity B (partial k at k f0 sqrt(1 + B k^2)), fitted at partial 16 (where it is audible under gain)."""
    key = (round(float(period), 1), round(B * 1e6), M)
    if key in _DISP_CACHE:
        return _DISP_CACHE[key]
    P = float(period)
    k = 16
    w1 = 2 * np.pi / P
    want = P * (1 - 1 / np.sqrt(1 + B * k * k))      # delay drop needed between f0 and partial k
    lo, hi = -0.98, -0.0001
    for _ in range(40):
        a = 0.5 * (lo + hi)
        got = _ap_phase_delay(a, w1, M) - _ap_phase_delay(a, min(np.pi * 0.95, k * w1), M)
        if got > want:
            lo = a
        else:
            hi = a
    a = 0.5 * (lo + hi)
    _DISP_CACHE[key] = a
    return a


def string_ks(n, period, excite, t60=5.0, t60_hi=1.0, f_hi=3000.0, dc=True, B=0.0, M=4):
    """Extended Karplus-Strong string. period: samples (scalar or (n,) curve); excite: (n,) input force
    (the pluck burst(s)); t60, t60_hi: decay times (s) of the fundamental and of f_hi (scalars or (n,) curves:
    lower them to mute / palm-mute / damp the string); B: stiffness inharmonicity (e.g. 1.5e-4 for a wound guitar
    string), realised by M allpasses in the loop (tuning corrected). Returns the string output (n,)."""
    P = np.broadcast_to(np.asarray(period, float), (n,)).astype(float)
    T60 = np.broadcast_to(np.asarray(t60, float), (n,))
    T60h = np.broadcast_to(np.asarray(t60_hi, float), (n,))
    f0 = SR / P
    p = _loop_lp_coef(f0, np.maximum(T60, 1e-4), np.maximum(np.minimum(T60h, T60), 1e-4), f_hi)
    w0 = 2 * np.pi * f0 / SR
    re = 1.0 - p * np.cos(w0)
    im = p * np.sin(w0)
    h0 = (1.0 - p) / np.sqrt(re * re + im * im)      # |H(w0)|
    pd = np.arctan2(im, re) / w0                     # phase delay of the LP at f0 (samples)
    g = np.minimum(10 ** (-3.0 / (f0 * np.maximum(T60, 1e-4))) / np.maximum(h0, 1e-6), 0.99995)
    D = P - pd
    ap = None
    if B > 0:
        a_ap = dispersion_coef(np.median(P), B, M)
        D = D - _ap_phase_delay(a_ap, w0, M)
        b1, a1 = np.array([a_ap, 1.0]), np.array([1.0, a_ap])
        bA, aA = b1, a1
        for _ in range(M - 1):
            bA, aA = np.convolve(bA, b1), np.convolve(aA, a1)
        ap = (bA, aA, np.zeros(M))
        if D.min() < 8:
            raise ValueError('string_ks: dispersion too strong for this pitch')
    e = np.asarray(excite, float)
    if e.shape[0] < n:
        e = pad_to(e, n)
    off = int(np.ceil(D.max())) + 6
    y = np.zeros(off + n + 4)
    s = 0
    wlast = 0.0
    ar = np.arange(n, dtype=float)
    while s < n:
        d0 = D[s]
        look = min(n, s + int(d0) + 1)
        dmin = D[s:look].min()
        B = max(1, int(dmin) - 3)
        e_ = min(n, s + B)
        pos = off + ar[s:e_] - D[s:e_]
        v = _lagrange3(y, pos)
        if ap is not None:
            v, zi_ap = signal.lfilter(ap[0], ap[1], v, zi=ap[2])
            ap = (ap[0], ap[1], zi_ap)
        pb = p[s]
        if pb > 0.0:
            w, _ = signal.lfilter([1.0 - pb], [1.0, -pb], v, zi=[pb * wlast])
        else:
            w = v
        wlast = w[-1]
        y[off + s:off + e_] = e[s:e_] + g[s:e_] * w
        s = e_
    out = y[off:off + n]
    return dc_block(out, 15.0) if dc else out


def pluck_burst(period, vel=1.0, bright=0.7, pick_pos=0.17, scrape=0.25, seed=0, kind='pick'):
    """The excitation force for one pluck: a low-passed impulse (pick hardness = bright * vel), comb-filtered at
    the pick position (fraction of the string from the bridge), plus a little pick-scrape noise.
    kind: 'pick' | 'finger' (rounder) | 'hammer' (legato: soft, no scrape) | 'tap'. Returns a short array."""
    r = np.random.default_rng(seed)
    L = int(period * 1.5) + 96
    x = np.zeros(L)
    x[0] = 1.0
    b = float(np.clip(bright * (0.55 + 0.45 * vel), 0.02, 1.0))
    if kind == 'finger':
        b *= 0.45
    elif kind in ('hammer', 'tap'):
        b *= 0.6 if kind == 'hammer' else 0.85
    fc = 500.0 * (16.0 ** b)                     # 0.5 .. 8 kHz
    x = signal.sosfilt(_sos('low', min(fc, SR * 0.45), 2), x)
    if kind in ('pick', 'finger', 'tap'):
        d = pick_pos * period
        x = x - frac_delay(x, d)
    if kind == 'pick' and scrape > 0:
        t = tt(L)
        nz = signal.sosfilt(_sos('band', (1500, 7000), 2), r.standard_normal(L)) * np.exp(-t / 0.0018)
        x = x + scrape * 0.25 * b * nz
    x /= (np.sqrt(np.sum(x * x)) + 1e-12)
    amp = vel * (0.35 if kind == 'hammer' else 1.0)
    return x * amp * np.sqrt(period / 100.0)


def _pickup(x, period, pos=0.11, res_f=3200.0, res_db=4.0, lp_f=6500.0):
    """Electric pickup: comb at the pickup position (fraction of the string), the coil + cable resonance and the
    roll-off above it."""
    P = np.broadcast_to(np.asarray(period, float), (len(x),))
    y = x - 0.85 * frac_delay(x, pos * P)
    y = signal.sosfilt(biquad('peak', res_f, 1.6, res_db), y)
    return lp(y, lp_f, 2)


# =====================================================================================================
# electric guitar: notes, chords, tracks, leads (DI signals; run them through amp())
# =====================================================================================================

def _string_t60(midi):
    """Natural decays (fundamental, 3 kHz) of a fretted electric string by pitch."""
    m = float(midi)
    t60 = float(np.interp(m, [40, 52, 64, 76, 88], [7.0, 5.5, 4.0, 2.6, 1.6]))
    t60h = float(np.interp(m, [40, 52, 64, 76, 88], [1.3, 1.1, 0.9, 0.7, 0.45]))
    return t60, t60h


def string_B(midi):
    """Stiffness inharmonicity of the string a guitar note is likely played on (wound low strings are stiffest);
    0 for very high notes (their stretched partials are above hearing anyway)."""
    m = float(note(midi))
    if m > 79:
        return 0.0
    return float(np.interp(m, [28, 40, 52, 64, 76], [2.4e-4, 1.5e-4, 1.0e-4, 5e-5, 3e-5]))


def gtr_note(midi, dur, vel=0.9, *, palm=0.0, bright=0.7, pick_pos=0.17, detune=0.0, release=0.035, ring=1.0,
             kind='pick', seed=0, tail=0.25, pickup=0.11, stiff=True):
    """One plucked electric-guitar string (DI, mono). midi: note; dur: seconds until the fretting hand / palm
    stops it; palm 0..1 palm-mute amount; detune in cents; ring scales the natural sustain; release: damping time
    after dur. Returns dur + tail seconds."""
    f = float(hz(midi)) * 2 ** (detune / 1200.0)
    P = SR / f
    n = ns(dur + tail)
    t60, t60h = _string_t60(midi)
    t60 *= ring
    t60h *= ring
    pm = float(np.clip(palm, 0, 1))
    if pm > 0:
        t60 = t60 * (1 - pm) + pm * float(np.interp(midi, [40, 64], [0.13, 0.09]))
        t60h = t60h * (1 - pm) + pm * 0.022
    T = np.full(n, t60)
    Th = np.full(n, t60h)
    k = min(n, ns(dur))
    rel = max(release, 0.004)
    u = tt(n - k)
    T[k:] = np.minimum(t60, rel + (t60 - rel) * np.exp(-u / 0.004))
    Th[k:] = np.minimum(Th[k:], T[k:])
    e = np.zeros(n)
    b = pluck_burst(P, vel, bright * (1 - 0.45 * pm), pick_pos * (1 - 0.3 * pm), 0.25 * (1 - pm), seed, kind)
    e[:len(b)] = b[:n]
    # a hard pick stretches the string: the pitch starts a few cents sharp and settles (tension modulation)
    tu = tt(n)
    sharp = (6.0 + 10.0 * pm) * vel * np.exp(-tu / (0.05 + 0.04 * (1 - pm)))
    Pc = P / 2 ** (sharp / 1200.0)
    y = string_ks(n, Pc, e, T, Th, 3000.0, B=string_B(midi) if stiff else 0.0)
    return _pickup(y, P, pickup)


def power(root, shape='5'):
    """Power-chord notes from a root (name or MIDI): '5' root+5th+octave, 'r5' root+5th, '8' root+octave,
    '5_8' root+5th+octave+5th, 'b5' root+b5 (tritone horror)."""
    r = int(note(root))
    return {'5': [r, r + 7, r + 12], 'r5': [r, r + 7], '8': [r, r + 12], '5_8': [r, r + 7, r + 12, r + 19],
            'b5': [r, r + 6, r + 12]}[shape]


# open / full voicings (E standard, low to high), keyed by chord name
VOICINGS = {
    'Em': [40, 47, 52, 55, 59, 64], 'E': [40, 47, 52, 56, 59, 64], 'E5': [40, 47, 52],
    'C': [48, 52, 55, 60, 64], 'Cmaj7': [48, 52, 55, 59, 64], 'Cmaj7/E': [40, 48, 52, 55, 59, 64],
    'D': [50, 57, 62, 66], 'Dm': [50, 57, 62, 65], 'G': [43, 47, 50, 55, 59, 67], 'A': [45, 52, 57, 61, 64],
    'Am': [45, 52, 57, 60, 64], 'Am(add9)': [45, 52, 57, 59, 64], 'Amadd9': [45, 52, 57, 59, 64],
    'B7': [47, 51, 57, 59, 66], 'B': [47, 54, 59, 63, 66], 'Bm': [47, 54, 59, 62, 66],
    'F#m': [42, 49, 54, 57, 61, 66], 'F#': [42, 49, 54, 58, 61, 66], 'C#7': [49, 56, 59, 65, 68],
    'C#m': [49, 56, 61, 64, 68], 'Bb': [46, 53, 58, 62, 65], 'Bb5': [46, 53, 58], 'F': [41, 48, 53, 57, 60, 65],
}


def chord_notes(name, voicing='auto'):
    """Guitar voicing (MIDI list) for a chord name like 'E5', 'Em', 'Cmaj7', 'Am(add9)', 'B7', 'F#m', 'C#7',
    'D5>E5' (takes the first). voicing: 'auto' (power chord for X5 names, open shapes otherwise), 'power',
    'open'. Unknown names fall back to a root-position triad around E3."""
    name = str(name).split('>')[0].strip()
    if voicing == 'power' or (voicing == 'auto' and name.endswith('5') and not name.endswith('add5')):
        root = name[:-1] if name.endswith('5') else name.rstrip('m7').rstrip('maj')
        r = int(note(root + '2'))
        if r < 40:
            r += 12
        if r > 50:
            r -= 12
        return power(r)
    if name in VOICINGS:
        return list(VOICINGS[name])
    root = name[0] + (name[1] if len(name) > 1 and name[1] in '#b' else '')
    rest = name[len(root):]
    r = int(note(root + '2'))
    if r < 40:
        r += 12
    third = 3 if rest.startswith('m') and not rest.startswith('maj') else 4
    ns_ = [r, r + 7, r + 12, r + 12 + third, r + 19]
    if '7' in rest:
        ns_.append(r + (23 if 'maj' in rest else 22))
    return ns_


_GMEMO = {}


def _stable_seed(key):
    """A seed from a cache key that is the same in every process (Python's hash() of str is salted)."""
    return zlib.crc32(repr(key).encode()) & 0xffffff


_GMEMO_BYTES = [0]


def _gmemo(key, make):
    """Render cache for repeated notes (float32, capped at ~300 MB, then flushed)."""
    v = _GMEMO.get(key)
    if v is None:
        if _GMEMO_BYTES[0] > 300e6:
            _GMEMO.clear()
            _GMEMO_BYTES[0] = 0
        v = np.asarray(make(), np.float32)
        v.setflags(write=False)
        _GMEMO[key] = v
        _GMEMO_BYTES[0] += v.nbytes
    return v.astype(float)


def gtr_chord(notes, dur, vel=0.9, *, palm=0.0, strum=0.007, direction='down', bright=0.7, detune=0.0, seed=0,
              release=0.035, ring=1.0, tail=0.25, spread=1.5):
    """Strummed chord (DI mono): each string its own string model, offset by `strum` s per string (direction
    'down' low->high, 'up' high->low), per-string detune spread (cents) and velocity variation."""
    notes = list(notes)
    r = np.random.default_rng(seed)
    order = list(range(len(notes))) if direction == 'down' else list(range(len(notes)))[::-1]
    lag = (len(notes) - 1) * strum
    out = np.zeros(ns(dur + tail + lag + 0.01))
    for j, i in enumerate(order):
        m = notes[i]
        v = vel * (1.0 - 0.06 * j / max(1, len(notes) - 1)) * r.uniform(0.92, 1.05)
        dt = j * strum * r.uniform(0.75, 1.25)
        x = gtr_note(m, max(0.02, dur - dt), v, palm=palm, bright=bright * r.uniform(0.92, 1.06),
                     detune=detune + r.normal(0, spread), release=release, ring=ring, seed=int(r.integers(1 << 30)),
                     tail=tail)
        place(out, x, dt)
    return out


def gtr_track(events, dur, *, seed=0, humanize=1.0, detune=0.0, tight=1.0, cache=True):
    """Render a rhythm-guitar DI track (mono, dur seconds) from events, each a dict:
      t (s), dur (s), and notes (list of MIDI) or chord (name, see chord_notes) or midi (single note);
      optional: vel (0.9), palm (0..1), strum (s, default 0.007; 0.003 for palm mutes), dir ('down'|'up'),
      bright (0.7), ring (True to let it ring over the next event), voicing ('auto'|'power'|'open').
    humanize scales the timing (sd 4 ms * humanize / tight), velocity and strum randomisation; detune in cents
    (per take). Notes are stopped at the next event unless ring. Identical notes are cached (round robin)."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    out = np.zeros(n + ns(1.0))
    evs = sorted(events, key=lambda e: e['t'])
    for k, e in enumerate(evs):
        if 'notes' in e:
            notes = list(e['notes'])
        elif 'chord' in e:
            notes = chord_notes(e['chord'], e.get('voicing', 'auto'))
        else:
            notes = [int(note(e['midi']))]
        palm = float(e.get('palm', 0.0))
        d = float(e['dur'])
        if not e.get('ring') and k + 1 < len(evs):
            d = min(d, evs[k + 1]['t'] - e['t'] + 0.004)
        d = max(0.03, d)
        jit = r.normal(0, 0.004 * humanize / max(tight, 0.1))
        jit = float(np.clip(jit, -0.012, 0.012))
        vel = float(e.get('vel', 0.9)) * (1 + r.normal(0, 0.05 * humanize))
        strum = float(e.get('strum', 0.003 if palm > 0.5 else 0.007)) * (1 + r.normal(0, 0.25 * humanize))
        direction = e.get('dir', 'down')
        bright = float(e.get('bright', 0.7))
        if cache:
            vq = round(np.clip(vel, 0.1, 1.3) * 10) / 10
            key = ('ch', tuple(notes), round(d, 2), round(palm, 2), vq, direction, round(bright, 2),
                   round(detune, 1), bool(e.get('ring')), int(r.integers(4)), round(strum * 1000))
            x = _gmemo(key, lambda: gtr_chord(notes, round(d, 2), vq, palm=palm, strum=strum, direction=direction,
                                              bright=bright, detune=detune, seed=_stable_seed(key)))
            x = x * (vel / vq)
        else:
            x = gtr_chord(notes, d, vel, palm=palm, strum=strum, direction=direction, bright=bright, detune=detune,
                          seed=int(r.integers(1 << 30)))
        place(out, x, e['t'] + jit)
    return out[:n]


def lead_line(notes, dur, *, seed=0, bright=0.75, string_t60=None, humanize=1.0, detune=0.0):
    """A lead line on ONE continuous string model (DI mono, dur seconds), so bends, vibrato, slides and legato
    are real pitch changes of a ringing string. notes: list of dicts with
      t, dur (s), midi (note or name); optional:
      vel (0.9); kind: 'pick' (default) | 'hammer' (legato hammer-on / pull-off, no new pick) | 'tap' |
        'slide' (glides from the previous pitch over `slide` s, no re-pick) ;
      bend: semitones to bend up (e.g. 2); bend_t: time to reach it (0.12); bend_at: delay before bending (0);
      release: bend back down at this time after the onset (s, optional); pre_bend: start already bent;
      vib: vibrato depth in semitones (e.g. 0.35); vib_rate (5.5 Hz); vib_delay (0.15 s);
      pinch: harmonic number for a pinch-harmonic squeal (e.g. 3, 4 or 5): the string sounds at that harmonic;
      dive: semitones of whammy dive after the onset (negative, e.g. -24), dive_t (0.6 s);
      slide: seconds of glide for kind 'slide' (0.08), or slide_out: semitones to slide away at the end.
    Between notes (rests) the string is muted."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    evs = sorted(notes, key=lambda e: e['t'])
    pitch = np.full(n, float(note(evs[0]['midi'])) if evs else 64.0)
    T = np.full(n, 0.02)
    Th = np.full(n, 0.01)
    e = np.zeros(n)
    t = tt(n)
    prev = None
    for k, ev in enumerate(evs):
        m = float(note(ev['midi'])) + detune / 100.0
        t0 = float(ev['t']) + float(np.clip(r.normal(0, 0.003 * humanize), -0.008, 0.008))
        d = float(ev['dur'])
        i0 = max(0, int(t0 * SR))
        nxt = int(evs[k + 1]['t'] * SR) if k + 1 < len(evs) else n
        i1 = min(n, max(i0 + 1, int((t0 + d) * SR)))
        i1 = min(i1, nxt) if ev.get('kind', 'pick') != 'hold' else i1
        seg = slice(i0, i1)
        u = t[seg] - t0
        kind = ev.get('kind', 'pick')
        pc = np.full(i1 - i0, m)
        if kind == 'slide' and prev is not None:
            sl = float(ev.get('slide', 0.08))
            pc = prev + (m - prev) * smoothstep(u / max(sl, 1e-3))
        if ev.get('pre_bend'):
            pc = pc + float(ev.get('bend', 2.0))
        elif ev.get('bend'):
            bt = float(ev.get('bend_t', 0.12))
            ba = float(ev.get('bend_at', 0.0))
            b = float(ev['bend']) * smoothstep((u - ba) / bt) ** 0.8
            if ev.get('release') is not None:
                rt = float(ev['release'])
                b = b * (1 - smoothstep((u - rt) / max(bt, 0.05)))
            pc = pc + b
        if ev.get('dive'):
            dt_ = float(ev.get('dive_t', 0.6))
            pc = pc + float(ev['dive']) * smoothstep((u - 0.05) / dt_) ** 1.4
        if ev.get('slide_out'):
            so = float(ev['slide_out'])
            pc = pc + so * smoothstep((u - (d - 0.09)) / 0.09)
        if ev.get('vib'):
            vr = float(ev.get('vib_rate', 5.5)) * r.uniform(0.95, 1.05)
            vd = float(ev.get('vib_delay', 0.15))
            ramp = smoothstep((u - vd) / 0.2)
            pc = pc + float(ev['vib']) * ramp * np.sin(2 * np.pi * vr * np.maximum(u - vd, 0))
        harm = int(ev.get('pinch', 1))
        pitch[seg] = pc + 12 * np.log2(harm)
        t60, t60h = string_t60 if string_t60 else _string_t60(m)
        if harm > 1:
            t60, t60h = t60 * 0.8, t60h * 1.6
        T[seg] = t60
        Th[seg] = t60h
        # the string is stopped just before each new pick (pick contact) and after the note ends
        if kind in ('pick', 'tap') or prev is None:
            q = slice(max(0, i0 - int(0.0025 * SR)), i0)
            T[q] = 0.003
            Th[q] = 0.002
        if kind not in ('slide',) or prev is None:
            P0 = SR / float(hz(pc[0] + 12 * np.log2(harm)))
            kb = 'hammer' if kind == 'hammer' else ('tap' if kind == 'tap' else 'pick')
            v = float(ev.get('vel', 0.9)) * (1 + r.normal(0, 0.04 * humanize))
            bb = pluck_burst(P0, v, bright * (1.15 if harm > 1 else 1.0), 0.13 if harm == 1 else 0.5 / harm, 0.3,
                             int(r.integers(1 << 30)), kb)
            j1 = min(n, i0 + len(bb))
            e[i0:j1] += bb[:j1 - i0]
        if ev.get('slide') or kind == 'slide':
            sl = float(ev.get('slide', 0.08))
            j0, j1 = i0, min(n, i0 + ns(sl))
            e[j0:j1] += 0.012 * bp(r.standard_normal(j1 - j0), 2000, 6000, 1) * smoothstep(tt(j1 - j0) / 0.01)
        prev = pc[-1] if len(pc) else m
        if i1 < nxt:                          # a rest: hold the last pitch, mute
            pitch[i1:nxt] = pitch[i1 - 1]
            T[i1:nxt] = 0.025
            Th[i1:nxt] = 0.012
    first = int(evs[0]['t'] * SR) if evs else n
    pitch[:first] = pitch[first] if first < n else pitch[:first]
    P = SR / hz(pitch)
    mm = float(np.median(pitch))
    y = string_ks(n, P, e, T, Th, 3000.0, B=string_B(mm) if P.min() > 60 else 0.0)
    return _pickup(y, P, 0.11)


def gtr_feedback(midi, dur, *, swell=0.6, vib=0.12, vib_rate=5.0, from_note=None, seed=0):
    """A sustained guitar feedback tone (DI-like, mono) at `midi`: it swells in over `swell` s (optionally
    emerging from a held from_note, which fades as the feedback blooms), with a slow vibrato. Run it through
    amp(..., 'lead') (or mix it into a DI track) and it sings."""
    n = ns(dur)
    t = tt(n)
    fb = float(hz(midi))
    vibc = vib * smoothstep((t - swell * 0.7) / 0.5) * np.sin(2 * np.pi * vib_rate * t) / 12.0
    f = fb * 2 ** (vibc + 0.002 * smooth_noise(n, 3, seed))
    tone = sine(f, n) + 0.12 * sine(2 * f, n, 0.3) + 0.05 * sine(3 * f, n, 0.1)
    env = smoothstep(t / max(swell, 0.01)) ** 1.5 * (0.85 + 0.15 * smooth_noise(n, 2.0, seed + 1))
    x = tone * env * 0.5
    if from_note is not None:
        base = gtr_note(from_note, dur, 0.9, seed=seed, tail=0.0)[:n]
        x = x + base * (1 - 0.8 * smoothstep(t / max(swell, 0.01)))
    return fades(x, 0.003, 0.03)


def humanize_events(events, seed=0, timing=0.004, vel=0.05):
    """Copy of events with gaussian timing (s) and velocity jitter."""
    r = np.random.default_rng(seed)
    out = []
    for e in events:
        e2 = dict(e)
        e2['t'] = float(e['t']) + float(np.clip(r.normal(0, timing), -3 * timing, 3 * timing))
        e2['vel'] = float(e.get('vel', 0.9)) * (1 + r.normal(0, vel))
        out.append(e2)
    return out


# =====================================================================================================
# guitar amp: pre-EQ, three asymmetric triode stages (4x oversampled), tone stack, power amp, 4x12 cab, gate
# =====================================================================================================

FS4 = SR * 4

AMP_PRESETS = {
    # tight high-gain rhythm (boosted modern amp, tight low end, mids slightly scooped, steep cab)
    'rhythm': dict(tight=95.0, boost_f=820.0, boost_db=5.0, in_gain=5.0, stages=((5.5, 0.30), (8.0, -0.22), (3.0, 0.15)),
                   couple=(28.0, 140.0, 35.0), miller=(9500.0, 7000.0, 8500.0), bass=1.5, mid=-3.0, mid_f=600.0,
                   treble=0.0, presence=2.0, reso=3.0, power=1.5, cab='A', out=0.134, gate_db=-58.0),
    # singing lead: more gain and mids, a little smoother top
    'lead': dict(tight=140.0, boost_f=900.0, boost_db=7.0, in_gain=6.0, stages=((6.0, 0.16), (9.0, -0.125), (3.5, 0.09)),
                 couple=(60.0, 200.0, 90.0), miller=(8000.0, 6500.0, 8000.0), bass=-1.0, mid=1.5, mid_f=750.0,
                 treble=0.5, presence=2.0, reso=2.0, power=1.8, cab='A', out=0.128, gate_db=-66.0),
    # classic crunch (lower gain, mid-forward, more dynamic)
    'crunch': dict(tight=70.0, boost_f=750.0, boost_db=2.0, in_gain=2.2, stages=((3.0, 0.2), (3.0, -0.12), (1.6, 0.08)),
                   couple=(40.0, 120.0, 60.0), miller=(10000.0, 8500.0, 9000.0), bass=1.0, mid=1.0, mid_f=700.0,
                   treble=2.0, presence=2.5, reso=2.0, power=1.6, cab='B', out=0.115, gate_db=-70.0),
    # clean (pre-amp barely clips, brighter cab, gentle compression)
    'clean': dict(tight=60.0, boost_f=800.0, boost_db=0.0, in_gain=0.55, stages=((1.2, 0.1), (1.0, 0.0), (1.0, 0.0)),
                  couple=(20.0, 40.0, 20.0), miller=(14000.0, 14000.0, 14000.0), bass=1.5, mid=-1.0, mid_f=500.0,
                  treble=3.0, presence=2.0, reso=1.5, power=0.6, cab='C', out=0.6, gate_db=-90.0),
}

_CABS = {}


def cab_ir(variant='A'):
    """Synthetic 4x12 closed-back cabinet IR (minimum phase, 2048 taps), cached. 'A' = a close mic on the cone
    edge (tight, presence peak ~3 kHz), 'B' = slightly off-axis (darker, more low-mid), 'C' = open / cleaner top
    (for clean). All: resonance ~100 Hz, low cut below ~70 Hz, cone-breakup ripples 1-5 kHz, steep roll-off from
    ~5.5 kHz (-30 dB by 9 kHz)."""
    if variant in _CABS:
        return _CABS[variant]
    seed = {'A': 3, 'B': 7, 'C': 11}.get(variant, 5)
    r = np.random.default_rng(seed)
    base = {
        'A': [(20, -42), (45, -24), (65, -9), (85, -1), (105, 3.5), (130, 2.0), (180, 0.0), (300, -0.5), (450, -1.5),
              (700, -1.5), (1000, -0.5), (1500, 0.5), (2100, 2.0), (2800, 3.5), (3500, 2.5), (4200, 3.0), (4900, 0.5),
              (5600, -5.0), (6400, -13.0), (7500, -22.0), (9000, -32.0), (11000, -44.0), (14000, -56.0), (20000, -70.0)],
        'B': [(20, -42), (45, -22), (65, -8), (85, 0), (110, 3.0), (140, 2.5), (200, 1.0), (300, 0.5), (450, -0.5),
              (700, -1.0), (1000, 0.0), (1500, 0.5), (2100, 2.5), (2800, 3.5), (3500, 2.0), (4200, 1.5), (4900, -2.0),
              (5600, -7.0), (6400, -16.0), (7500, -25.0), (9000, -35.0), (11000, -47.0), (14000, -58.0), (20000, -72.0)],
        'C': [(20, -40), (45, -20), (65, -7), (85, -1), (110, 2.0), (150, 1.0), (250, 0.0), (500, -1.0), (900, -0.5),
              (1500, 0.5), (2400, 3.0), (3200, 4.0), (4200, 3.0), (5200, 0.5), (6200, -5.0), (7400, -12.0),
              (9000, -22.0), (11000, -33.0), (14000, -45.0), (20000, -60.0)],
    }[variant if variant in ('A', 'B', 'C') else 'A']
    f = np.exp(np.linspace(np.log(20), np.log(20000), 600))
    g = np.interp(np.log(f), np.log([p[0] for p in base]), [p[1] for p in base])
    for _ in range(9):                       # cone breakup: irregular peaks and dips
        fc = np.exp(r.uniform(np.log(900), np.log(5200)))
        amt = r.uniform(-4.0, 2.5)
        bwo = r.uniform(0.16, 0.34)          # octaves (narrower ones ring audibly)
        g += amt * np.exp(-0.5 * (np.log2(f / fc) / bwo) ** 2)
    h = minphase_fir(f, g, 2048)
    # the box: a faint delayed reflection off the back panel
    d = int(0.00085 * SR)
    h2 = h.copy()
    h2[d:] += 0.18 * lp(h, 2500, 1)[:-d]
    h2 /= np.sqrt(np.sum(h2 ** 2)) * 6.0
    _CABS[variant] = h2
    return h2


def _tube(x, bias):
    """Asymmetric triode-ish clipper, unity slope at 0 (positive side clips harder for bias > 0)."""
    tb = np.tanh(bias)
    return (np.tanh(x + bias) - tb) / (1.0 - tb * tb)


def amp(di, preset='rhythm', *, gain=1.0, bass=None, mid=None, treble=None, presence=None, cab=None, gate_db=None,
        out_db=0.0, oversample=4, return_pre_cab=False):
    """Guitar amp + 4x12 cab for a DI signal (mono). preset: 'rhythm' | 'lead' | 'crunch' | 'clean' (see
    AMP_PRESETS); gain scales the pre-amp drive (x0.5 .. x2); bass/mid/treble/presence in dB override the tone stack;
    cab: 'A' | 'B' | 'C' | None (preset's) | False (no cab); gate_db: the DI-keyed noise gate threshold (None =
    preset's, False = off). Output is mono at a calibrated level (a full chord ~ -14 dBFS RMS for rhythm)."""
    x = np.asarray(di, float)
    n = len(x)
    CH, PRE = ns(15.0), ns(0.5)
    if n > 2 * CH and not return_pre_cab:     # long tracks: 15 s chunks with a 0.5 s pre-roll (bounded memory)
        out = np.empty(n)
        kw = dict(gain=gain, bass=bass, mid=mid, treble=treble, presence=presence, cab=cab, gate_db=gate_db,
                  out_db=out_db, oversample=oversample)
        for s0 in range(0, n, CH):
            a0 = max(0, s0 - PRE)
            seg = amp(x[a0:min(n, s0 + CH)], preset, **kw)
            out[s0:min(n, s0 + CH)] = seg[s0 - a0:]
        return out
    P = dict(AMP_PRESETS[preset])
    # input stage at 1x: tighten the lows (the boost pedal), mid hump, tame the top before the drive
    y = hp(x, P['tight'], 1)
    y = hp(y, 40.0, 2)
    if P['boost_db']:
        y = peq(y, P['boost_f'], P['boost_db'], 0.7)
    y = lp(y, 6500.0, 1)
    y = y * P['in_gain'] * gain
    os_ = int(oversample)
    fs = SR * os_
    y = signal.resample_poly(y, os_, 1)
    for (g, b), fc_hp, fc_lp in zip(P['stages'], P['couple'], P['miller']):
        y = _tube(y * g, b)
        y = signal.sosfilt(signal.butter(1, fc_hp, 'high', fs=fs, output='sos'), y)
        y = signal.sosfilt(signal.butter(1, min(fc_lp, fs * 0.45), 'low', fs=fs, output='sos'), y)
    y = signal.resample_poly(y, 1, os_)[:n]
    # tone stack
    y = shelf(y, 110.0, P['bass'] if bass is None else bass, 'low', 0.6)
    y = peq(y, P['mid_f'], P['mid'] if mid is None else mid, 0.75)
    y = shelf(y, 2600.0, P['treble'] if treble is None else treble, 'high', 0.6)
    # power amp: soft symmetric saturation, presence and the speaker resonance interaction
    pw = P['power']
    y = np.tanh(pw * y) / np.tanh(pw)
    y = shelf(y, 3600.0, P['presence'] if presence is None else presence, 'high', 0.7)
    y = peq(y, 105.0, P['reso'], 1.2)
    if return_pre_cab:
        return y
    c = P['cab'] if cab is None else cab
    if c:
        y = fir(y, cab_ir(c)) * 6.0
    gd = P['gate_db'] if gate_db is None else gate_db
    if gd is not False and gd is not None:
        y = gate(y, gd, attack=0.0008, hold=0.012, release=0.06, range_db=70.0, side=x)
    return y * P['out'] * undb(out_db)


def double_track(events, dur, preset='rhythm', *, seeds=(101, 202), detune=(3.0, -3.0), width=1.0, cabs=('A', 'B'),
                 humanize=1.0, tight=1.0, amp_kw=None, gain_lr=(1.0, 0.96)):
    """Two takes of the same part (different humanised timing, pick attack, slight detune), each through its own
    amp and cab, hard panned L / R. width < 1 bleeds each take into the other side. Returns stereo (n, 2)."""
    amp_kw = dict(amp_kw or {})
    takes = []
    for i in range(2):
        di = gtr_track(events, dur, seed=seeds[i], humanize=humanize, detune=detune[i], tight=tight)
        kw = dict(amp_kw)
        kw.setdefault('cab', cabs[i])
        takes.append(amp(di, preset, **kw) * gain_lr[i])
    L, R = takes
    w = float(np.clip(width, 0, 1))
    a = 0.5 + 0.5 * w
    return np.stack([a * L + (1 - a) * R, a * R + (1 - a) * L], axis=1)


def guitar(events, dur, preset='rhythm', *, seed=1, pan_pos=0.0, amp_kw=None, humanize=1.0, detune=0.0):
    """Single rhythm-guitar take (events as gtr_track) through amp(): stereo (n, 2) panned at pan_pos."""
    di = gtr_track(events, dur, seed=seed, humanize=humanize, detune=detune)
    return stereo(amp(di, preset, **(amp_kw or {})), pan_pos)


def lead(notes, dur, preset='lead', *, seed=7, amp_kw=None, pan_pos=0.0, delay_s=None, delay_mix=0.18, humanize=1.0,
         double=False):
    """Lead guitar (notes as lead_line) through the lead amp; optional tempo delay; double=True adds a second take
    (slightly detuned, panned apart) for harmonised / fat lines. Returns stereo (n, 2)."""
    di = lead_line(notes, dur, seed=seed, humanize=humanize)
    y = stereo(amp(di, preset, **(amp_kw or {})), pan_pos)
    if double:
        di2 = lead_line(notes, dur, seed=seed + 31, humanize=humanize, detune=-4.0)
        y2 = amp(di2, preset, **(amp_kw or {}))
        y = 0.75 * (stereo(mono(y), -0.35) + stereo(y2, 0.35))
    if delay_s:
        y = delay(y, delay_s, 0.3, delay_mix, 4000.0, 300.0, True)
    return y



# =====================================================================================================
# performance extras: pick slide, reverse crash, riser, rolls
# =====================================================================================================

def pick_slide(dur=0.5, *, down=True, seed=0):
    """Pick slide (DI, mono): the pick edge scraped along the wound E and A strings: windings clicked at a sweeping
    rate (2.6 kHz -> 700 Hz going down the neck) ringing the strings. Mix it into a DI track or amp() it alone:
    amp(pick_slide(), 'rhythm')."""
    r = np.random.default_rng(seed)
    n = ns(dur + 0.2)
    t = tt(n)
    k = np.clip(t / dur, 0, 1)
    rate = (2600.0 * (700.0 / 2600.0) ** k) if down else (700.0 * (2600.0 / 700.0) ** k)
    imp = _engine_pulses(rate, n, seed, 0.4) * (t < dur)
    exc = (imp + 0.3 * bp(r.standard_normal(n), 1500, 6000, 2) * (t < dur)) * 0.05
    exc *= smoothstep(t / 0.03) * (1 - 0.5 * k)
    y = np.zeros(n)
    for m in (40, 45):
        P = SR / float(hz(m))
        y += string_ks(n, P, exc, 0.6, 0.15, 3000.0)
    return _pickup(y + exc * 0.5, SR / float(hz(40)), 0.11)


def reverse_crash(dur=1.6, *, size=18, rr=0):
    """A reversed crash swelling into the downbeat at `dur` (stereo): place it at (downbeat - dur)."""
    c = np.array(crash(1.0, rr, size))
    m = min(c.shape[0], ns(dur))
    r = c[::-1][-m:].copy()
    x = np.linspace(0, 1, m)
    r *= (x ** 1.3)[:, None]
    return fades(r / (np.abs(r).max() + 1e-9) * 0.9, 0.05, 0.002)


def riser(dur=2.0, *, seed=0, top=9000.0):
    """Noise riser (stereo): band-passed noise sweeping 250 Hz -> top over dur, swelling into the end."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    x = np.linspace(0, 1, n)
    fc = 250 * (top / 250) ** (x ** 1.4)
    out = np.zeros((n, 2))
    for ch in range(2):
        out[:, ch] = tvf(r.standard_normal(n), 'bp', fc, 1.1, 128)
    out *= (x ** 2.2)[:, None]
    return fades(peak_norm(out, 0.8), 0.05, 0.003)


def roll_hits(piece, t0, t1, *, rate=STEP / 2, v0=0.5, v1=1.0, alt=0.12):
    """Hit tuples for drum_track: a roll on `piece` from t0 to t1 (s) every `rate` s (32nds by default),
    crescendo v0 -> v1, alternating sticking accent `alt`."""
    out = []
    k = 0
    t = t0
    while t < t1 - 1e-9:
        u = (t - t0) / max(t1 - t0, 1e-9)
        out.append((t, piece, (v0 + (v1 - v0) * u) * (1 - alt if k % 2 else 1.0)))
        k += 1
        t = t0 + k * rate
    return out


# =====================================================================================================
# analysis: spectra, spectrograms, metrics (used by --demo; handy for the mix scripts too)
# =====================================================================================================

def colormap(v):
    stops = np.array([[0, 0, 0, 4], [0.2, 40, 11, 84], [0.4, 120, 28, 109], [0.6, 205, 66, 72],
                      [0.8, 249, 142, 9], [1.0, 252, 255, 164]], float)
    v = np.clip(v, 0, 1)
    out = np.zeros(v.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(v, stops[:, 0], stops[:, c + 1])
    return out.astype(np.uint8)


def spectrogram_png(x, path, title='', t0=0.0, t1=None, width=1400, height=460, fmin=30, fmax=18000, rng_db=80,
                    grid_s=None):
    """Log-frequency spectrogram PNG (inferno-like map). grid_s draws a vertical line every grid_s seconds."""
    from PIL import Image, ImageDraw
    m = mono(x)
    t1 = len(m) / SR if t1 is None else t1
    m = m[int(t0 * SR):int(t1 * SR)]
    nfft = 4096 if t1 - t0 > 6 else 2048
    hop = max(1, len(m) // width)
    w = np.hanning(nfft)
    xp = np.pad(m, (nfft // 2, nfft))
    fr = np.lib.stride_tricks.sliding_window_view(xp, nfft)[::hop][:width]
    S_ = np.abs(np.fft.rfft(fr * w, axis=1)) + 1e-10
    dbv = 20 * np.log10(S_)
    dbv -= dbv.max()
    f = np.fft.rfftfreq(nfft, 1 / SR)
    fy = np.exp(np.linspace(np.log(fmax), np.log(fmin), height))
    img = np.array([np.interp(fy, f, col) for col in dbv]).T
    rgb = colormap((img + rng_db) / rng_db)
    pad_t, pad_l = 22, 48
    im = Image.new('RGB', (rgb.shape[1] + pad_l + 6, height + pad_t + 20), (12, 10, 16))
    im.paste(Image.fromarray(rgb), (pad_l, pad_t))
    d = ImageDraw.Draw(im)
    d.text((pad_l, 5), title, fill=(230, 230, 230))
    dur = t1 - t0
    if grid_s:
        k = 0
        while k * grid_s <= dur:
            xx = pad_l + int(k * grid_s / dur * rgb.shape[1])
            d.line([(xx, pad_t), (xx, pad_t + height)], fill=(70, 90, 120), width=1)
            k += 1
    for fq in (50, 100, 200, 500, 1000, 2000, 5000, 10000):
        if fmin <= fq <= fmax:
            yy = pad_t + int(np.interp(np.log(fq), np.log(fy[::-1]), np.arange(height)[::-1]))
            d.line([(pad_l - 6, yy), (pad_l, yy)], fill=(200, 200, 200))
            d.text((4, yy - 6), f'{fq if fq < 1000 else str(fq // 1000) + "k"}', fill=(200, 200, 200))
    for s_ in range(int(dur) + 1):
        xx = pad_l + int(s_ / max(dur, 1e-9) * rgb.shape[1])
        d.text((xx + 1, pad_t + height + 4), f'{t0 + s_:.0f}s', fill=(160, 160, 180))
    im.save(str(path))


def ltas(x, nfft=8192, smooth_oct=1 / 6):
    """Long-term average spectrum: (freqs, dB) smoothed over smooth_oct octaves (power average)."""
    m = np.pad(mono(x), (nfft // 2, nfft // 2))       # padded so onsets at the edges are not windowed away
    f, P = signal.welch(m, SR, nperseg=nfft)
    if smooth_oct:
        lf = np.log2(np.maximum(f, 1))
        Ps = np.empty_like(P)
        cs = np.cumsum(P)
        lo = np.searchsorted(lf, lf - smooth_oct / 2)
        hi = np.searchsorted(lf, lf + smooth_oct / 2)
        hi = np.maximum(hi, lo + 1)
        Ps = (cs[np.minimum(hi, len(P)) - 1] - np.where(lo > 0, cs[lo - 1], 0)) / (hi - lo)
        P = Ps
    return f, 10 * np.log10(P + 1e-20)


def spectrum_png(curves, path, title='', fmin=20, fmax=20000, db_range=70, width=900, height=420):
    """Plot several LTAS curves [(label, x_or_(f, dB), (r, g, b)), ...] normalised to their own max."""
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (width, height), (14, 14, 20))
    d = ImageDraw.Draw(im)
    L, T_, R_, B_ = 50, 24, width - 10, height - 26
    d.text((L, 5), title, fill=(230, 230, 230))
    def fx(f):
        return L + (np.log(f) - np.log(fmin)) / (np.log(fmax) - np.log(fmin)) * (R_ - L)
    def fy(v):
        return T_ + (-v) / db_range * (B_ - T_)
    for fq in (20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000):
        xx = fx(fq)
        d.line([(xx, T_), (xx, B_)], fill=(40, 40, 55))
        d.text((xx - 8, B_ + 4), f'{fq if fq < 1000 else str(fq // 1000) + "k"}', fill=(170, 170, 180))
    for v in range(0, db_range + 1, 10):
        yy = fy(-v)
        d.line([(L, yy), (R_, yy)], fill=(40, 40, 55))
        d.text((8, yy - 6), f'-{v}', fill=(170, 170, 180))
    for k, (label, data, col) in enumerate(curves):
        f, v = data if isinstance(data, tuple) else ltas(data)
        m = (f >= fmin) & (f <= fmax)
        f, v = f[m], v[m]
        v = v - v.max()
        pts = [(fx(a), fy(max(b, -db_range))) for a, b in zip(f, v)]
        d.line(pts, fill=col, width=2)
        d.text((R_ - 230, T_ + 6 + 14 * k), label, fill=col)
    im.save(str(path))


def band_db(x, lo, hi):
    """Energy (dB) of x between lo and hi Hz relative to the total."""
    X = np.abs(np.fft.rfft(mono(x))) ** 2             # whole-signal periodogram (transients count fully)
    f = np.fft.rfftfreq(len(mono(x)), 1 / SR)
    P = X
    tot = P.sum() + 1e-20
    m = (f >= lo) & (f < hi)
    return float(10 * np.log10(P[m].sum() / tot + 1e-20))


def octave_db(x, centres=(63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)):
    """Energy per octave band (dB, relative to the loudest band): {centre_hz: dB}. Pink noise reads flat."""
    X = np.abs(np.fft.rfft(mono(x))) ** 2
    f = np.fft.rfftfreq(len(mono(x)), 1 / SR)
    e = {c: float(X[(f >= c / np.sqrt(2)) & (f < c * np.sqrt(2))].sum()) + 1e-20 for c in centres}
    m = max(e.values())
    return {c: round(float(10 * np.log10(v / m)), 1) for c, v in e.items()}


def metrics(x):
    """Quick objective report of a render: peak, true peak, RMS, crest, LUFS, spectral balance, clipping."""
    x = np.asarray(x, float)
    xs = stereo(x)
    return {
        'dur_s': round(x.shape[0] / SR, 3),
        'peak_db': round(float(db(np.abs(x).max())), 2),
        'true_peak_db': round(float(db(true_peak(x))), 2),
        'rms_db': round(float(db(rms(x))), 2),
        'crest_db': round(crest_db(x), 2),
        'lufs': round(lufs(xs), 2),
        'clipped_samples': int(np.sum(np.abs(x) >= 0.999)),
        'band_db': {k: round(band_db(x, a, b), 1) for k, (a, b) in
                    {'sub<60': (20, 60), 'low60-250': (60, 250), 'lowmid250-1k': (250, 1000), 'mid1-4k': (1000, 4000),
                     'pres4-8k': (4000, 8000), 'air8k+': (8000, 20000)}.items()},
        'octave_db': octave_db(x),
        'stereo_corr': round(float(np.corrcoef(xs[:, 0], xs[:, 1])[0, 1]), 3) if rms(xs[:, 0] - xs[:, 1]) > 1e-9 else 1.0,
    }


# =====================================================================================================
# bass: picked string model (DI) + drive blend amp, clean sub
# =====================================================================================================

def bass_note(midi, dur, vel=0.9, *, bright=0.45, palm=0.0, kind='pick', detune=0.0, sag=0.0, buzz=0.0,
              slide_to=None, slide_t=0.12, release=0.03, seed=0, tail=0.2):
    """One bass string (DI, mono). kind 'pick' | 'finger'; palm 0..1; sag: cents the pitch sags over the note
    (e.g. 50 = a quarter-tone flat by the end, the duct-taped neck); buzz 0..1 fret buzz rattle; slide_to: MIDI
    note to slide to over the last slide_t seconds."""
    r = np.random.default_rng(seed)
    f = float(hz(midi)) * 2 ** (detune / 1200)
    P = SR / f
    n = ns(dur + tail)
    t = tt(n)
    t60 = float(np.interp(midi, [28, 40, 52], [9.0, 6.0, 4.0]))
    t60h = float(np.interp(midi, [28, 40, 52], [0.30, 0.25, 0.2]))
    if palm > 0:
        t60 = t60 * (1 - palm) + palm * 0.45
        t60h = t60h * (1 - palm) + palm * 0.04
    T = np.full(n, t60)
    Th = np.full(n, t60h)
    k = min(n, ns(dur))
    u = tt(n - k)
    T[k:] = np.minimum(t60, max(release, 0.004) + t60 * np.exp(-u / 0.004))
    Th[k:] = np.minimum(Th[k:], T[k:])
    cents = 8.0 * vel * np.exp(-t / 0.07)
    if sag:
        cents = cents - sag * smoothstep(t / max(dur, 0.05)) ** 0.7
    if slide_to is not None:
        st0 = max(0.0, dur - slide_t)
        cents = cents + 100.0 * (float(note(slide_to)) - float(note(midi))) * smoothstep((t - st0) / slide_t)
    Pc = P / 2 ** (cents / 1200.0)
    e = np.zeros(n)
    b = pluck_burst(P, vel, bright * (1 - 0.4 * palm), 0.2 if kind == 'pick' else 0.27, 0.35 if kind == 'pick' else 0.0,
                    int(r.integers(1 << 30)), 'pick' if kind == 'pick' else 'finger')
    e[:len(b)] = b[:n]
    y = string_ks(n, Pc, e, T, Th, 1500.0, B=string_B(midi))
    y = y - 0.6 * frac_delay(y, 0.21 * Pc)           # pickup position
    y = peq(y, 2000.0, 2.0, 1.4)
    y = shelf(y, 90.0, 4.0, 'low', 0.7)
    y = lp(y, 4000.0, 2)
    if buzz > 0:
        a = np.abs(y).max() + 1e-9
        th = 0.55 * a
        res = np.sign(y) * np.maximum(np.abs(y) - th, 0.0)      # the string slapping the fret
        rat = hp(res, 700.0, 2) * (1.0 + 0.5 * r.standard_normal(n))
        y = y + buzz * 6.0 * lp(rat, 6000.0, 1)
    return y


def bass_track(events, dur, *, seed=0, humanize=1.0, cache=True):
    """Bass DI track (mono): events are dicts t, dur, midi (or note name); optional vel, palm, kind, sag, buzz,
    slide_to, slide_t, bright. Notes stop at the next event (one string at a time). Cached round robin."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    out = np.zeros(n + ns(1.0))
    evs = sorted(events, key=lambda e: e['t'])
    for k, e in enumerate(evs):
        m = int(note(e['midi']))
        d = float(e['dur'])
        if k + 1 < len(evs):
            d = min(d, evs[k + 1]['t'] - e['t'] + 0.004)
        d = max(0.03, d)
        jit = float(np.clip(r.normal(0, 0.003 * humanize), -0.009, 0.009))
        vel = float(e.get('vel', 0.9)) * (1 + r.normal(0, 0.05 * humanize))
        kw = dict(palm=float(e.get('palm', 0.0)), kind=e.get('kind', 'pick'), sag=float(e.get('sag', 0.0)),
                  buzz=float(e.get('buzz', 0.0)), slide_to=e.get('slide_to'), slide_t=float(e.get('slide_t', 0.12)),
                  bright=float(e.get('bright', 0.45)))
        simple = not (kw['sag'] or kw['buzz'] or kw['slide_to'] is not None)
        if cache and simple:
            vq = round(np.clip(vel, 0.1, 1.3) * 10) / 10
            key = ('bass', m, round(d, 2), round(kw['palm'], 2), kw['kind'], vq, round(kw['bright'], 2), int(r.integers(3)))
            x = _gmemo(key, lambda: bass_note(m, round(d, 2), vq, seed=_stable_seed(key), **kw)) * (vel / vq)
        else:
            x = bass_note(m, d, vel, seed=int(r.integers(1 << 30)), **kw)
        place(out, x, e['t'] + jit)
    return out[:n]


BASS_CAL = 3.34                 # bass_amp output trim: steady picked 8ths at vel 0.9 -> about -15 dBFS RMS


def bass_amp(di, drive=0.6, blend=0.5, *, growl_f=1100.0, out_db=0.0):
    """Bass amp: a clean low branch (compressed, low-passed) + a driven high branch (high-passed at ~250 Hz, three
    asymmetric stages at 4x, 'cab' low-pass ~3.5 kHz, growl peak) blended; then mud cut / clank, a gentle
    compressor and soft clip. Fixed calibration: steady picked 8ths at vel 0.9 come out near -15 dBFS RMS."""
    x = np.asarray(di, float)
    n = len(x)
    CH, PRE = ns(15.0), ns(0.5)
    if n > 2 * CH:                            # long tracks: 15 s chunks with a 0.5 s pre-roll (bounded memory)
        out = np.empty(n)
        for s0 in range(0, n, CH):
            a0 = max(0, s0 - PRE)
            seg = bass_amp(x[a0:min(n, s0 + CH)], drive, blend, growl_f=growl_f, out_db=out_db)
            out[s0:min(n, s0 + CH)] = seg[s0 - a0:]
        return out
    clean = lp(x, 900.0, 2)
    clean = compressor(clean, -24.0, 4.0, 0.004, 0.12, 6.0)
    d = hp(x, 250.0, 2)
    d = peq(d, 800.0, 4.0, 0.8) * (4.0 + 30.0 * drive)
    u = signal.resample_poly(d, 4, 1)
    fs = SR * 4
    for b, fc in ((0.25, 80.0), (-0.2, 120.0)):
        u = _tube(u, b)
        u = signal.sosfilt(signal.butter(1, fc, 'high', fs=fs, output='sos'), u)
        u = signal.sosfilt(signal.butter(1, 9000.0, 'low', fs=fs, output='sos'), u) * 2.5
    d = signal.resample_poly(u, 1, 4)[:n]
    d = lp(d, 3800.0, 4)
    d = peq(d, growl_f, 3.5, 1.0)
    d = d * 0.024                                        # driven branch level vs clean (calibrated)
    y = clean + blend * d
    y = peq(y, 380.0, -2.5, 1.0)
    y = peq(y, 75.0, 2.0, 0.9)
    y = hp(y, 32.0, 2)
    y = y * BASS_CAL * undb(out_db)
    y = compressor(y, -17.0, 3.0, 0.003, 0.09, 6.0)
    return softclip(y * 1.6, 1.0) / 1.6


def bass(events, dur, *, drive=0.6, blend=0.5, seed=5, humanize=1.0):
    """Convenience: bass_track -> bass_amp (mono, about -15 dBFS RMS for steady 8ths)."""
    return bass_amp(bass_track(events, dur, seed=seed, humanize=humanize), drive, blend)


def sub_bass(events, dur, *, octave=0, attack=0.008, release=0.04):
    """Clean sine sub (mono): events t, dur, midi (+ optional vel); octave shifts (-1 = an octave down)."""
    n = ns(dur)
    out = np.zeros(n + ns(0.5))
    for e in sorted(events, key=lambda e: e['t']):
        f = float(hz(note(e['midi']) + 12 * octave))
        d = float(e['dur'])
        m = ns(d + release * 4)
        tm = tt(m)
        env = np.minimum(1.0, tm / attack) * np.where(tm < d, 1.0, np.exp(-(tm - d) / release))
        x = np.sin(2 * np.pi * f * tm) * env * float(e.get('vel', 0.9))
        x = x + 0.08 * np.sin(4 * np.pi * f * tm) * env
        place(out, fades(x, 0.001, 0.01), e['t'])
    return out[:n] * 0.5


# =====================================================================================================
# drums: a rock kit in a room (modal membranes, partial-cloud cymbals), round robins, the drum bus
# =====================================================================================================
# Every piece is rendered once per (velocity layer, round robin) and cached, like a sampler. Velocity picks the
# layer (soft / medium / hard sound different: brightness, wire level, pitch bend) and scales the level.

_DMEMO = {}


def _dm(key, make):
    v = _DMEMO.get(key)
    if v is None:
        v = np.asarray(make(), float)
        v.setflags(write=False)
        _DMEMO[key] = v
    return v


def _layer(vel):
    return 0 if vel < 0.45 else (1 if vel < 0.8 else 2)


def _sweep_sine(f, n, ph0=0.0):
    return np.sin(2 * np.pi * (np.cumsum(f) - f[0]) / SR + ph0)


def _kick_raw(vel, seed, tone=1.0):
    r = np.random.default_rng(seed)
    n = ns(0.65)
    t = tt(n)
    f0 = 56.0 * r.uniform(0.985, 1.015) * tone
    bend = 1.0 + (1.2 + 0.8 * vel) * np.exp(-t / 0.011) + 0.22 * np.exp(-t / 0.07)
    f = f0 * bend
    body = _sweep_sine(f, n) * (0.8 * np.exp(-t / (0.085 + 0.045 * vel)) + 0.35 * np.exp(-t / 0.03)
                                + 0.07 * np.exp(-t / 0.2))
    ov = (0.38 * _sweep_sine(f * 1.59, n, 1.0) * np.exp(-t / 0.035) + 0.22 * _sweep_sine(f * 2.14, n, 2.0) * np.exp(-t / 0.022)
          + 0.12 * _sweep_sine(f * 2.65, n, 0.5) * np.exp(-t / 0.016))
    thwack = bp(r.standard_normal(n), 120, 700, 2) * np.exp(-t / 0.014) * 0.55
    click = bp(r.standard_normal(n), 1800, 9000, 2) * np.exp(-t / (0.0022 + 0.0012 * vel)) * (0.35 + 0.9 * vel)
    click += np.sin(2 * np.pi * 3600 * t) * np.exp(-t / 0.0025) * 0.3 * vel
    click += bp(r.standard_normal(n), 900, 2400, 2) * np.exp(-t / 0.006) * 0.5 * vel     # head slap
    x = body + ov + thwack + click
    x *= np.minimum(1.0, t / 0.0004)
    x = np.tanh(1.6 * x) / np.tanh(1.6)
    x = peq(x, 380.0, -6.0, 1.1)          # the boxy low-mids out
    x = peq(x, 4200.0, 4.0 + 3 * vel, 0.9)  # beater
    x = peq(x, 62.0, 2.5, 1.0)
    return fades(x / np.abs(x).max(), 0.0003, 0.08) * (0.55 + 0.45 * vel)


def kick(vel=1.0, rr=0):
    """Rock kick (mono, 0.65 s): beater click (~4 kHz), pitch-dropping membrane body (~56 Hz) + overtones, low-mid
    scooped."""
    L = _layer(vel)
    return _dm(('kick', L, rr % 6), lambda: _kick_raw((0.35, 0.7, 1.0)[L], 100 + 7 * rr)) * (vel / (0.35, 0.7, 1.0)[L])


SNARE_MODES = [(1.0, 1.0, 0.16), (1.59, 0.55, 0.10), (2.14, 0.42, 0.075), (2.30, 0.35, 0.065), (2.65, 0.28, 0.05),
               (2.92, 0.2, 0.045), (3.16, 0.16, 0.04), (3.50, 0.12, 0.035)]


def _snare_raw(vel, seed, kind='hit', f1=188.0):
    r = np.random.default_rng(seed)
    n = ns(0.9)
    t = tt(n)
    f1 = f1 * r.uniform(0.985, 1.015)
    bend = 1.0 + 0.10 * vel * np.exp(-t / 0.012)
    body = np.zeros(n)
    for ratio, a, tau in SNARE_MODES:
        body += a * _sweep_sine(f1 * ratio * bend, n, r.uniform(0, 6.28)) * np.exp(-t / (0.45 * tau * (0.8 + 0.4 * vel)))
    body *= 0.9
    rim = kind in ('rim', 'hit') and vel > 0.8
    if rim or kind == 'rim':                     # rimshot: the shell rings, a sharper crack
        body += 0.35 * np.sin(2 * np.pi * 920 * t) * np.exp(-t / 0.06) + 0.2 * np.sin(2 * np.pi * 1480 * t) * np.exp(-t / 0.03)
    crack = hp(r.standard_normal(n), 900, 2) * np.exp(-t / (0.0025 + 0.0015 * vel)) * (0.45 + 0.9 * vel)
    # wires: noise, driven by the batter head's motion (they buzz while it swings), sizzle tail
    drive = np.abs(signal.hilbert(lp(body, 400, 2)))
    drive = drive / (drive.max() + 1e-9)
    wenv = np.minimum(1.0, t / 0.0015) * (0.55 * drive + 0.45 * np.exp(-t / (0.11 + 0.1 * vel)))
    wn = r.standard_normal(n)
    gr = 1.0 + 0.6 * lp(r.standard_normal(n), 260, 1) * 3.0            # grainy buzz
    wires = bp(wn * gr, 1200, 9000, 2) + 0.2 * bp(wn, 5000, 12000, 2) + 0.4 * bp(wn, 400, 1500, 1)
    wl = (1.0 + 0.5 * (1 - vel)) if kind != 'ghost' else 1.4
    x = body + crack + wl * 1.2 * wires * wenv
    x *= np.minimum(1.0, t / 0.0003)
    x = peq(x, 220.0, 2.0, 1.0)
    x = peq(x, 500.0, -3.0, 1.2)
    x = peq(x, 5000.0, 2.0 * vel, 0.8)
    if vel < 0.45:
        x = lp(x, 7000, 1)
    return fades(x / np.abs(x).max(), 0.0002, 0.15) * (0.4 + 0.6 * vel)


def snare(vel=1.0, rr=0, kind='hit'):
    """Snare (mono, 0.9 s): stick crack, eight membrane modes (~188 Hz) with a pitch bend, wires driven by the head;
    hard hits become rimshots (shell ring ~920 Hz). kind 'hit' | 'rim' | 'ghost'. 3 velocity layers x 6 rr."""
    L = _layer(vel)
    lv = (0.35, 0.7, 1.0)[L]
    return _dm(('snare', kind, L, rr % 6), lambda: _snare_raw(lv, 200 + 11 * rr + 3 * L, kind)) * (vel / lv)


def cross_stick(vel=0.8, rr=0):
    """Cross-stick (the stick laid on the head, clicking the rim): woody click + short shell tone (mono)."""
    def make():
        r = np.random.default_rng(300 + rr)
        n = ns(0.18)
        t = tt(n)
        x = (np.sin(2 * np.pi * 1650 * t) * 0.6 + np.sin(2 * np.pi * 2700 * t + 1) * 0.35 + np.sin(2 * np.pi * 540 * t) * 0.4)
        x = x * np.exp(-t / 0.018) + bp(r.standard_normal(n), 1500, 7000) * np.exp(-t / 0.003) * 1.2
        x += 0.25 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
        return fades(x / np.abs(x).max(), 0.0002, 0.03)
    return _dm(('xstick', rr % 4), make) * vel


def stick_click(vel=0.9, rr=0):
    """Two drumsticks clicked together (count-ins): a hard, short wooden clack (mono)."""
    def make():
        r = np.random.default_rng(320 + rr)
        n = ns(0.12)
        t = tt(n)
        f = r.uniform(0.96, 1.04)
        x = (np.sin(2 * np.pi * 2350 * f * t) * 0.7 + np.sin(2 * np.pi * 3900 * f * t + 1) * 0.5
             + np.sin(2 * np.pi * 1250 * f * t + 2) * 0.35) * np.exp(-t / 0.012)
        x += bp(r.standard_normal(n), 2000, 9000) * np.exp(-t / 0.0015) * 1.5
        return fades(x / np.abs(x).max(), 0.0001, 0.02)
    return _dm(('stickclick', rr % 4), make) * vel


TOM_F = {'tom1': 152.0, 'tom2': 112.0, 'tom3': 80.0}


def _tom_raw(f1, vel, seed, mallet='stick'):
    r = np.random.default_rng(seed)
    n = ns(1.3)
    t = tt(n)
    f1 *= r.uniform(0.99, 1.01)
    bend = 1.0 + (0.18 + 0.1 * vel) * np.exp(-t / 0.03)
    x = np.zeros(n)
    for ratio, a, tau in ((1.0, 1.0, 0.36), (1.5, 0.45, 0.16), (1.98, 0.3, 0.11), (2.44, 0.22, 0.08), (2.9, 0.12, 0.06)):
        x += a * _sweep_sine(f1 * ratio * bend, n, r.uniform(0, 6.28)) * np.exp(-t / (tau * (0.7 + 0.5 * vel)))
    if mallet == 'bat':                          # a baseball bat: a fatter, woodier, duller attack
        att = bp(r.standard_normal(n), 300, 2500, 2) * np.exp(-t / 0.006) * 0.9
        att += np.sin(2 * np.pi * 620 * t) * np.exp(-t / 0.012) * 0.4
    else:
        att = hp(r.standard_normal(n), 1200, 2) * np.exp(-t / 0.004) * (0.5 + 0.9 * vel)
    x = x * np.minimum(1.0, t / 0.0006) + att
    x += 0.12 * bp(r.standard_normal(n), 2000, 8000) * np.exp(-t / 0.08)    # snare wires sympathetic buzz
    x = peq(x, 420.0, -4.0, 1.0)
    x = np.tanh(1.3 * x / np.abs(x).max()) / np.tanh(1.3)
    return fades(x / np.abs(x).max(), 0.0003, 0.2) * (0.45 + 0.55 * vel)


def tom(which='tom2', vel=1.0, rr=0, mallet='stick', tune=1.0):
    """Toms (mono, 1.3 s): which 'tom1' (hi rack ~152 Hz) | 'tom2' (mid ~112) | 'tom3' (floor ~80); or a frequency
    in Hz. mallet 'stick' | 'bat' (baseball bat: woody, dull attack). tune scales the pitch."""
    f1 = (TOM_F[which] if isinstance(which, str) else float(which)) * tune
    L = _layer(vel)
    lv = (0.35, 0.7, 1.0)[L]
    return _dm(('tom', round(f1, 1), mallet, L, rr % 4), lambda: _tom_raw(f1, lv, 400 + 13 * rr + int(f1), mallet)) * (vel / lv)


def _partials(n, freqs, amps, taus, seed, beat=1.5, bloom=None, fm=0.0):
    """Sum of decaying sine partials, each split into a slowly beating pair (cymbal shimmer); fm adds a random
    slow frequency wobble (relative depth, e.g. 0.002) that smears each line into a band like a real cymbal's
    chaotic modes. float32, chunked; the wobble comes from a shared bank of 8 modulators."""
    r = np.random.default_rng(seed)
    t = (np.arange(n) / SR).astype(np.float32)
    out = np.zeros(n, np.float32)
    k = len(freqs)
    ph = r.uniform(0, 2 * np.pi, (k, 2)).astype(np.float32)
    det = r.uniform(0.2, beat, k)
    bank_r = r.uniform(2.0, 9.0, 8)
    bank = np.sin(2 * np.pi * bank_r[:, None] * t[None, :] + r.uniform(0, 6.28, (8, 1))).astype(np.float32)
    which = r.integers(0, 8, k)
    tau_t = 2 * np.pi
    for a0 in range(0, k, 32):
        sl = slice(a0, min(k, a0 + 32))
        f = freqs[sl].astype(np.float32)[:, None]
        d2 = (det[sl] / 2).astype(np.float32)[:, None]
        env = (amps[sl].astype(np.float32)[:, None]
               * np.exp(-t[None, :] / taus[sl].astype(np.float32)[:, None]))
        if bloom is not None:
            env *= 1 - np.exp(-t[None, :] / bloom[sl].astype(np.float32)[:, None])
        base = (tau_t * f) * t[None, :]
        dd = (tau_t * d2) * t[None, :]
        if fm:
            base += (fm * f[:, 0] / bank_r[which[sl]]).astype(np.float32)[:, None] * bank[which[sl]]
        s_ = np.sin(base - dd + ph[sl, 0:1]) + np.sin(base + dd + ph[sl, 1:2])
        out += np.einsum('ij,ij->j', s_, env)
    return out.astype(float)


def _cymbal_raw(dur, seed, *, f_lo=350.0, f_hi=16000.0, count=220, peak_f=5000.0, tilt=0.0, tau_lo=2.2, tau_hi=0.9,
                tau_mid=None, noise_amt=0.6, noise_tau=0.9, splash_tau=0.04, splash=1.0, trash=0.0, bloom=0.012,
                hp_f=300.0, stick=0.5, width=0.6):
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    out = np.zeros((n, 2))
    common_f = np.exp(r.uniform(np.log(f_lo), np.log(f_hi), count) ** 1.0)
    for ch in range(2):
        rc = np.random.default_rng(seed * 7 + ch)
        # partials: shared modes (with per-channel jitter) and amplitude follows a log-Gaussian hump at peak_f
        f = common_f * rc.uniform(0.997, 1.003, count)
        lf = np.log2(f / peak_f)
        amp = np.exp(-0.5 * (lf / 1.6) ** 2) * 10 ** (rc.uniform(-8, 4, count) / 20) * (f / 1000.0) ** tilt
        taus = np.exp(np.interp(np.log(f), [np.log(f_lo), np.log(2500), np.log(f_hi)],
                                [np.log(tau_lo), np.log(tau_mid or (tau_lo * tau_hi) ** 0.5), np.log(tau_hi)]))
        taus *= rc.uniform(0.7, 1.3, count)
        bl = np.full(count, bloom) * (f / 4000.0)
        p = _partials(n, f, amp, taus, seed * 13 + ch, beat=3.0, bloom=bl, fm=0.0025)
        p /= (np.abs(p).max() + 1e-9)
        nz = rc.standard_normal(n)
        if trash:
            nz *= 1.0 + trash * 2.5 * lp(rc.standard_normal(n), 90.0, 1) * 4
        wash = bp(nz, max(hp_f, 1500.0), min(f_hi, 16000.0), 2)
        wash = signal.sosfilt(biquad('peak', peak_f, 0.8, 6.0), wash)
        wash = wash / (np.abs(wash).max() + 1e-9)
        sp = hp(rc.standard_normal(n), 2500.0, 2)
        sp /= np.abs(sp).max() + 1e-9
        tick = bp(rc.standard_normal(n), 2000, 9000) * np.exp(-t / 0.0015)
        tick /= np.abs(tick).max() + 1e-9
        y = (p * 0.7 + noise_amt * 1.3 * wash * np.exp(-t / noise_tau) * (1 - np.exp(-t / 0.008))
             + splash * sp * np.exp(-t / splash_tau) + stick * 0.4 * tick)
        out[:, ch] = hp(y, hp_f, 2) * np.minimum(1, t / 0.0004)
    m = out.mean(axis=1, keepdims=True)
    out = m + width * (out - m)
    out /= np.abs(out).max() + 1e-9
    return fades(out, 0.0002, min(0.4, dur * 0.25))


def crash(vel=1.0, rr=0, size=18):
    """Crash cymbal (stereo, ~3 s): stick tick, splash attack, a cloud of 200 beating partials peaking near 5 kHz
    with a long wash. size 16 (brighter, shorter) .. 20 (darker, longer). Soft hits are darker."""
    L = _layer(vel)
    lv = (0.4, 0.75, 1.0)[L]
    k = (size - 18) / 2.0
    raw = _dm(('crashraw', size, rr % 3), lambda: _cymbal_raw(3.2 + 0.4 * k, 500 + 17 * rr + size, peak_f=5200 * (1 - 0.12 * k),
                                                             tau_lo=2.6 + 0.4 * k, tau_hi=0.75, noise_amt=0.55,
                                                             noise_tau=1.0 + 0.3 * k, splash=1.25, count=200))
    def make():
        y = np.array(raw)
        if lv < 0.5:
            y = lp(y, 6000, 1)
        elif lv < 0.8:
            y = 0.6 * y + 0.4 * lp(y, 8000, 1)
        return y * (0.5 + 0.5 * lv)
    return _dm(('crash', size, L, rr % 3), make) * (vel / lv)


def china(vel=1.0, rr=0):
    """China cymbal (stereo, ~2 s): trashy, mid-heavy, fast bloom, rough amplitude texture."""
    L = _layer(vel)
    lv = (0.4, 0.75, 1.0)[L]
    raw = _dm(('chinaraw', rr % 3), lambda: _cymbal_raw(2.2, 600 + 19 * rr, f_lo=400.0, f_hi=12000.0, count=160,
                                                       peak_f=2600.0, tau_lo=1.4, tau_hi=0.5, noise_amt=0.9,
                                                       noise_tau=0.7, splash=0.8, trash=1.0, hp_f=350.0))
    return _dm(('china', L, rr % 3), lambda: (lp(raw, 6000, 1) if lv < 0.5 else np.array(raw)) * (0.5 + 0.5 * lv)) * (vel / lv)


def splash(vel=1.0, rr=0):
    """Splash cymbal (stereo, ~1 s): small, bright, quick."""
    return _dm(('splash', rr % 3), lambda: _cymbal_raw(1.2, 650 + 23 * rr, f_lo=900.0, f_hi=17000.0, count=150,
                                                      peak_f=7000.0, tau_lo=0.8, tau_hi=0.3, noise_amt=0.6,
                                                      noise_tau=0.35, splash=1.2, hp_f=700.0)) * vel


def ride(vel=0.8, rr=0):
    """Ride (stereo, ~3 s): a defined stick ping (partial cluster 2.5-6 kHz + a 480 Hz bell-ish tone) on a soft
    long wash that builds when played repeatedly."""
    def make():
        r = np.random.default_rng(700 + rr)
        n = ns(3.0)
        t = tt(n)
        wash = _cymbal_raw(3.0, 710 + rr, f_lo=500.0, f_hi=15000.0, count=110, peak_f=6000.0, tau_lo=3.5, tau_hi=1.4,
                           noise_amt=0.25, noise_tau=1.5, splash=0.15, stick=0.0, bloom=0.03)
        fr = np.exp(r.uniform(np.log(2400), np.log(6500), 24))
        ping = _partials(n, fr, r.uniform(0.3, 1.0, 24), r.uniform(0.08, 0.35, 24), 720 + rr, beat=2.0)
        ping /= np.abs(ping).max() + 1e-9
        tone = (np.sin(2 * np.pi * 482 * t) * 0.5 + np.sin(2 * np.pi * 1130 * t + 1) * 0.3) * np.exp(-t / 0.5)
        tick = bp(r.standard_normal(n), 2500, 9000) * np.exp(-t / 0.001)
        y = 0.35 * wash + stereo(0.6 * ping + 0.25 * tone + 0.35 * tick / (np.abs(tick).max() + 1e-9))
        return fades(y / np.abs(y).max(), 0.0002, 0.5)
    return _dm(('ride', rr % 4), make) * vel


def ride_bell(vel=0.9, rr=0):
    """Ride bell (stereo, ~3 s): a clear inharmonic bell (~640 Hz base) with some wash."""
    def make():
        r = np.random.default_rng(760 + rr)
        n = ns(3.0)
        t = tt(n)
        f0 = 640.0 * r.uniform(0.995, 1.005)
        ratios = [(1.0, 1.0, 1.8), (1.49, 0.6, 1.2), (2.27, 0.55, 0.9), (2.83, 0.4, 0.7), (3.93, 0.3, 0.5),
                  (5.41, 0.2, 0.35), (6.9, 0.12, 0.25)]
        b = np.zeros(n)
        for ra, a, tau in ratios:
            for d in (-0.7, 0.7):
                b += a * np.sin(2 * np.pi * (f0 * ra + d) * t + r.uniform(0, 6.28)) * np.exp(-t / tau)
        tick = bp(r.standard_normal(n), 2500, 9000) * np.exp(-t / 0.0012)
        wash = _cymbal_raw(3.0, 770 + rr, f_lo=600.0, count=90, peak_f=6000.0, tau_lo=2.5, tau_hi=1.0, noise_amt=0.2,
                           splash=0.2, stick=0.0)
        y = stereo(b / np.abs(b).max() + 0.4 * tick / (np.abs(tick).max() + 1e-9)) + 0.3 * wash
        return fades(y / np.abs(y).max(), 0.0002, 0.5)
    return _dm(('ridebell', rr % 3), make) * vel


def _hat_raw(kind, vel, seed):
    r = np.random.default_rng(seed)
    dur = {'closed': 0.35, 'open': 1.6, 'half': 0.8, 'pedal': 0.3}[kind]
    n = ns(dur)
    t = tt(n)
    count = 110
    f = np.exp(r.uniform(np.log(1600), np.log(17000), count))
    amp = np.exp(-0.5 * (np.log2(f / 8500.0) / 1.2) ** 2) * 10 ** (r.uniform(-8, 3, count) / 20)
    tau_m = {'closed': 0.02 + 0.012 * vel, 'open': 0.7, 'half': 0.22, 'pedal': 0.045}[kind]
    taus = tau_m * r.uniform(0.6, 1.4, count) * (8000.0 / f) ** 0.3
    p = _partials(n, f, amp, taus, seed + 1, beat=6.0, fm=0.003)
    p /= np.abs(p).max() + 1e-9
    nz = hp(r.standard_normal(n), 5500, 2)
    if kind in ('open', 'half'):                 # the two plates rattle against each other
        nz *= 1.0 + 0.8 * np.abs(lp(r.standard_normal(n), 45.0, 1)) * 6
    nz /= np.abs(nz).max() + 1e-9
    ntau = {'closed': 0.014 + 0.01 * vel, 'open': 0.5, 'half': 0.15, 'pedal': 0.03}[kind]
    y = 0.8 * p + 0.75 * nz * np.exp(-t / ntau)
    if kind == 'pedal':
        y = 0.5 * y + 0.6 * bp(r.standard_normal(n), 400, 1800) * np.exp(-t / 0.012)
    else:
        tick = bp(r.standard_normal(n), 1800, 8000) * np.exp(-t / 0.0011)
        y += (0.35 + 0.3 * vel) * tick / (np.abs(tick).max() + 1e-9)
        y += 0.15 * np.sin(2 * np.pi * 1180 * t) * np.exp(-t / 0.004)        # the stick's wood
    y = hp(y, 600.0, 2) * np.minimum(1.0, t / 0.0002)
    if vel < 0.45:
        y = lp(y, 9000, 1)
    return fades(y / np.abs(y).max(), 0.0002, min(0.15, dur * 0.3)) * (0.45 + 0.55 * vel)


def hat(vel=0.8, rr=0, kind='closed'):
    """Hi-hat (mono): kind 'closed' | 'open' | 'half' | 'pedal' (foot chick). Stick tick + 110 beating partials
    (~8.5 kHz hump) + plate rattle noise. 3 layers x 8 rr (closed)."""
    L = _layer(vel)
    lv = (0.35, 0.7, 1.0)[L]
    k = 8 if kind == 'closed' else 4
    return _dm(('hat', kind, L, rr % k), lambda: _hat_raw(kind, lv, 800 + 29 * rr + 5 * L + len(kind))) * (vel / lv)


def bat_on_case(vel=1.0, rr=0):
    """A baseball bat on a road case: a hollow wooden-box TOCK (plywood box modes ~180/420/760 Hz, hard woody click,
    a tiny rattle of the case's metal corners). Mono."""
    def make():
        r = np.random.default_rng(900 + rr)
        n = ns(0.5)
        t = tt(n)
        f = r.uniform(0.95, 1.05)
        box = (np.sin(2 * np.pi * 182 * f * t) * np.exp(-t / 0.09) + 0.7 * np.sin(2 * np.pi * 425 * f * t + 1) * np.exp(-t / 0.05)
               + 0.5 * np.sin(2 * np.pi * 760 * f * t + 2) * np.exp(-t / 0.03) + 0.35 * np.sin(2 * np.pi * 1230 * f * t) * np.exp(-t / 0.018))
        click = bp(r.standard_normal(n), 800, 6000, 2) * np.exp(-t / 0.003)
        click /= np.abs(click).max() + 1e-9
        rattle = bp(r.standard_normal(n), 3000, 9000) * np.exp(-t / 0.04) * (1 + np.sin(2 * np.pi * 37 * t)) * 0.08
        y = 0.9 * box + 0.9 * click + rattle
        y = comb_fb(y, 0.0031, 0.35, 0.4)
        return fades(y / np.abs(y).max(), 0.0002, 0.08)
    return _dm(('batcase', rr % 4), make) * vel


DRUM_PAN = {'kick': 0.0, 'snare': 0.0, 'tom1': -0.3, 'tom2': 0.12, 'tom3': 0.5, 'hat': -0.42, 'ride': 0.5,
            'crash': -0.55, 'crash2': 0.6, 'china': 0.7, 'splash': -0.25, 'case': -0.2, 'stick': 0.0}


def drum_hit(piece, vel=1.0, rr=0):
    """Any kit piece by name -> (audio, group, pan). piece: kick, snare, rim, ghost, xstick, stick, hat, hat_open,
    hat_half, hat_pedal, crash, crash2, china, splash, ride, bell, tom1, tom2, tom3, bat_tom1..3 (bat on toms),
    case (bat on road case)."""
    p = piece
    if p == 'kick':
        return kick(vel, rr), 'kick', 0.0
    if p in ('snare', 'rim', 'ghost'):
        return snare(vel if p != 'ghost' else min(vel, 0.35), rr, 'hit' if p == 'snare' else p), 'snare', 0.0
    if p == 'xstick':
        return cross_stick(vel, rr), 'snare', 0.0
    if p == 'stick':
        return stick_click(vel, rr), 'snare', 0.0
    if p in ('hat', 'hat_open', 'hat_half', 'hat_pedal'):
        k = {'hat': 'closed', 'hat_open': 'open', 'hat_half': 'half', 'hat_pedal': 'pedal'}[p]
        return hat(vel, rr, k), 'cym', DRUM_PAN['hat']
    if p in ('crash', 'crash2'):
        return crash(vel, rr + (7 if p == 'crash2' else 0), 18 if p == 'crash' else 19), 'cym', DRUM_PAN[p]
    if p == 'china':
        return china(vel, rr), 'cym', DRUM_PAN['china']
    if p == 'splash':
        return splash(vel, rr), 'cym', DRUM_PAN['splash']
    if p == 'ride':
        return ride(vel, rr), 'cym', DRUM_PAN['ride']
    if p == 'bell':
        return ride_bell(vel, rr), 'cym', DRUM_PAN['ride']
    if p in ('tom1', 'tom2', 'tom3'):
        return tom(p, vel, rr), 'tom', DRUM_PAN[p]
    if p.startswith('bat_tom'):
        w = 'tom' + p[-1]
        return tom(w, vel, rr, 'bat'), 'tom', DRUM_PAN[w]
    if p == 'case':
        return bat_on_case(vel, rr), 'tom', DRUM_PAN['case']
    raise ValueError(piece)


def drum_track(hits, dur, *, humanize=1.0, seed=3, room=0.28, comp=0.35, overhead_bleed=0.22, stems=False,
               room_kind='room'):
    """Render a drum performance into a mixed kit (stereo (n, 2)) or, with stems=True, a dict of stereo stems
    {'kick', 'snare', 'tom', 'cym', 'room'} plus 'mix'. hits: list of (t, piece, vel) tuples or dicts
    {t, piece, vel, choke (s after onset to choke a cymbal / open hat)}. Open hats are choked by the next
    closed / pedal hat. Close mics are panned (drummer's view), the kit bleeds into the overheads, the room is a
    0.85 s live room, and the bus gets parallel compression (comp = blend). The stems are pre-bus (their sum is
    the mix before the parallel compression and the bus soft clip)."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    N = n + ns(3.5)
    grp = {g: np.zeros((N, 2)) for g in ('kick', 'snare', 'tom', 'cym')}
    hs = []
    for h in hits:
        if isinstance(h, dict):
            hs.append((float(h['t']), h['piece'], float(h.get('vel', 0.9)), h.get('choke')))
        else:
            hs.append((float(h[0]), h[1], float(h[2]) if len(h) > 2 else 0.9, h[3] if len(h) > 3 else None))
    hs.sort(key=lambda z: z[0])
    rrc = {}
    hat_times = [h[0] for h in hs if h[1] in ('hat', 'hat_pedal')]
    for (t0, piece, vel, choke) in hs:
        k = rrc.get(piece, 0)
        rrc[piece] = k + 1
        rr = (k + int(r.integers(3))) % 8
        v = vel * (1 + r.normal(0, 0.05 * humanize))
        x, g, pn = drum_hit(piece, v, rr)
        x = np.array(x, float)
        if piece == 'hat_open' and choke is None:
            nxt = [ht for ht in hat_times if ht > t0 + 0.01]
            if nxt:
                choke = nxt[0] - t0
        if choke is not None:
            c = ns(choke)
            if c < x.shape[0]:
                fl = ns(0.025)
                sh = (-1,) + (1,) * (x.ndim - 1)
                x[c:c + fl] *= np.linspace(1, 0, min(fl, x.shape[0] - c)).reshape(sh)[:x.shape[0] - c]
                x[c + fl:] = 0.0
        jt = float(np.clip(r.normal(0, 0.002 * humanize), -0.006, 0.006))
        place(grp[g], x, t0 + jt, 1.0, pn)
    # close-mic processing (kick and snare are mono close mics)
    kk = compressor(grp.pop('kick').mean(axis=1), -16.0, 4.0, 0.006, 0.08, 6.0)
    sn = compressor(grp.pop('snare').mean(axis=1), -18.0, 3.5, 0.004, 0.1, 6.0)
    tm = compressor(grp.pop('tom'), -18.0, 3.0, 0.005, 0.15, 6.0)
    cy = grp.pop('cym')
    # the room: everything, compressed hard (classic rock room)
    send = stereo(0.5 * kk + 1.0 * sn) + 0.9 * tm + 0.55 * cy
    rm = compressor(convolve(hp(send, 90.0, 2), ir(room_kind)), -26.0, 6.0, 0.003, 0.12, 6.0)
    g_rm = rms(send) / (rms(rm) + 1e-9)       # make-up: the compressed room at the send's level
    del send
    rm = lp(rm, 8000.0, 1) * (g_rm * room)
    # overheads: cymbals + the kit bleeding in (high-passed, wide)
    oh = cy + overhead_bleed * hp(stereo(sn, 0.1) + tm + 0.4 * stereo(kk), 250.0, 2)
    del cy
    oh = shelf(oh, 9000.0, 1.5, 'high') * 0.75
    tm *= 0.85
    if stems:
        out = {'kick': stereo(kk)[:n], 'snare': stereo(sn * 0.9)[:n], 'tom': tm[:n].copy(), 'cym': oh[:n].copy(),
               'room': rm[:n].copy()}
    bus = stereo(kk + 0.9 * sn)
    del kk, sn
    bus += tm
    bus += oh
    bus += rm
    del tm, oh, rm
    bus = bus[:n]
    if comp:
        bus = parallel_comp(bus, comp, -32.0, 8.0, 0.0015, 0.09)
    bus = softclip(bus * 1.1, 1.2) / 1.1
    if stems:
        out['mix'] = bus
        return out
    return bus


def drum_bus(close, overheads=None, room=0.28, comp=0.35, room_kind='room'):
    """Process your own drum stems: close (stereo kit close mics), overheads (stereo cymbals), a room send from
    both, parallel compression; returns stereo."""
    c = stereo(close)
    o = stereo(overheads) if overheads is not None else np.zeros_like(c)
    send = c + 0.5 * o
    rm = convolve(hp(send, 90.0, 2), ir(room_kind))
    rm = compressor(rm, -26.0, 6.0, 0.003, 0.12, 6.0)
    rm = rm * (rms(send) / (rms(rm) + 1e-9))
    bus = c + 0.75 * o + room * lp(rm, 8000.0, 1)
    if comp:
        bus = parallel_comp(bus, comp, -32.0, 8.0, 0.0015, 0.09)
    return bus


def drum_pattern(pattern, bars, *, t0=0.0, bar_s=BAR, steps=16, vel=None):
    """Expand a step pattern {piece: 'x...X...g...'} (one char per 16th: x hit 0.8, X accent 1.0, g ghost 0.3,
    o open hat, r roll (two 32nds), . rest) over `bars` bars starting at t0 into hit tuples for drum_track."""
    out = []
    st = bar_s / steps
    V = {'x': 0.8, 'X': 1.0, 'g': 0.3, 'o': 0.85, 'r': 0.6}
    for b in range(bars):
        for piece, row in pattern.items():
            row = row.replace(' ', '').replace('|', '')
            for i, c in enumerate(row[:steps]):
                if c == '.':
                    continue
                t = t0 + b * bar_s + i * st
                v = V.get(c, 0.8) if vel is None else vel
                pc = 'hat_open' if (c == 'o' and piece == 'hat') else ('ghost' if c == 'g' and piece == 'snare' else piece)
                if c == 'r':
                    out += [(t, pc, v), (t + st / 2, pc, v * 0.85)]
                else:
                    out.append((t, pc, v))
    return out


# =====================================================================================================
# keys and colour: drawbar organ + Leslie, music box, brass stingers, pitched cymbal DING
# =====================================================================================================

DRAWBAR_H = [0.5, 1.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0]      # 16' 5 1/3' 8' 4' 2 2/3' 2' 1 3/5' 1 1/3' 1'
REGISTRATIONS = {
    'horror': '888000006',    # the cold-open drone: deep, hollow, an eerie 1' whistle on top
    'full': '888888888',      # everything out (final chorus swells)
    'soft': '008400000',      # flutes (safe room)
    'gospel': '888000000',
    'pad': '678604002',
    'theatre': '868808008',
}


def leslie(x, speed='slow', *, drive=0.0, horn_depth=0.55, drum_depth=0.3, seed=0):
    """Two-rotor rotary speaker (horn above 800 Hz, drum below), two mics -> stereo (n, 2). speed: 'slow' (chorale,
    0.83 / 0.7 Hz), 'fast' (tremolo, 6.7 / 5.8 Hz), 'stop', or a pair of per-sample rate curves (horn_hz, drum_hz).
    Doppler (delay modulation), directional AM and the cabinet's mild tube drive."""
    x = np.asarray(mono(x), float)
    n = len(x)
    if drive:
        x = saturate(x, 1.0 + 4.0 * drive, 0.1)
    horn = hp(x, 800.0, 2)
    drum = lp(x, 800.0, 2)
    if isinstance(speed, str):
        hr, dr_ = {'slow': (0.83, 0.70), 'fast': (6.7, 5.8), 'stop': (0.0, 0.0)}[speed]
        hr = np.full(n, hr)
        dr_ = np.full(n, dr_)
    else:
        hr = np.broadcast_to(np.asarray(speed[0], float), (n,))
        dr_ = np.broadcast_to(np.asarray(speed[1], float), (n,))
    rr = np.random.default_rng(seed)
    th_h = 2 * np.pi * np.cumsum(hr) / SR + rr.uniform(0, 6.28)
    th_d = 2 * np.pi * np.cumsum(dr_) / SR + rr.uniform(0, 6.28)
    out = np.zeros((n, 2))
    for ch, phi in enumerate((-1.1, 1.1)):
        dh = 0.00045 * SR * (1 + np.sin(th_h + phi)) + 2
        dd = 0.00020 * SR * (1 + np.sin(th_d + phi)) + 2
        ah = 1.0 + horn_depth * np.cos(th_h + phi)
        ad = 1.0 + drum_depth * np.cos(th_d + phi)
        hy = frac_delay(horn, dh) * ah
        hy = 0.75 * hy + 0.25 * lp(hy, 3000.0, 1) * (1.0 + 0.3 * np.cos(th_h + phi + 2.0))   # horn reflections
        out[:, ch] = hy + frac_delay(drum, dd) * ad
    return out


def organ_tone(notes, dur, *, registration='horror', click=0.5, perc=0.0, seed=0, attack=0.008, release=0.06):
    """Raw tonewheel organ (mono) holding MIDI `notes` for dur s: drawbar sines (with slight tonewheel grit),
    key click, optional percussion (2nd harmonic ping)."""
    r = np.random.default_rng(seed)
    reg = REGISTRATIONS.get(registration, registration)
    lv = [int(c) / 8.0 for c in reg]
    n = ns(dur + release * 5)
    t = tt(n)
    x = np.zeros(n)
    for m in notes:
        f8 = float(hz(note(m)))
        for h, a in zip(DRAWBAR_H, lv):
            if a <= 0:
                continue
            f = f8 * h
            if f > 12000:
                continue
            amp = (10 ** ((a * 8 - 8) * 3 / 20)) if a < 1 else 1.0     # 3 dB per drawbar step
            ph = r.uniform(0, 6.28)
            w = np.sin(2 * np.pi * f * t + ph)
            w = w + 0.04 * np.sin(2 * np.pi * 3 * f * t + 2 * ph)       # tonewheel shape
            x += amp * w * (1.0 if f > 60 else 0.8)
        if perc:
            x += perc * 1.2 * np.sin(2 * np.pi * 2 * f8 * t) * np.exp(-t / 0.25)
    env = np.minimum(1.0, t / attack) * np.where(t < dur, 1.0, np.exp(-(t - dur) / release))
    x *= env / max(1, len(notes)) ** 0.5
    if click:
        ck = bp(r.standard_normal(n), 800, 7000, 2) * np.exp(-t / 0.003) * 0.5 * click
        ck += bp(r.standard_normal(n), 800, 7000, 2) * np.exp(-np.maximum(t - dur, 0) / 0.002) * (t >= dur) * 0.2 * click
        x += ck
    return x / 4.0


def organ(notes, dur, *, registration='horror', leslie_speed='slow', drive=0.15, click=0.5, perc=0.0, seed=0,
          attack=0.008, release=0.06, room=0.0):
    """Horror organ (stereo): organ_tone through leslie(). notes: MIDI list (or names), e.g. ['E2','B2','F#3'];
    registration: 'horror' | 'full' | 'soft' | 'gospel' | 'pad' | 'theatre' | a 9-digit drawbar string;
    leslie_speed 'slow' | 'fast' | 'stop'; room: wet amount of a theatre reverb."""
    x = organ_tone(notes, dur, registration=registration, click=click, perc=perc, seed=seed, attack=attack, release=release)
    y = leslie(x, leslie_speed, drive=drive, seed=seed)
    y = lp(y, 9000.0, 2)
    if room:
        y = reverb(y, 'theatre', room, 200.0, None, tail=False)
    return y


def organ_track(events, dur, *, registration='horror', leslie_speed='slow', drive=0.15, seed=0):
    """Organ part (stereo) from events {t, dur, notes, [vel]}: all notes summed into one tone, one Leslie (so the
    rotor runs continuously). leslie_speed can be a (horn_hz, drum_hz) pair of curves over the track."""
    n = ns(dur)
    raw = np.zeros(n + ns(1.0))
    for k, e in enumerate(sorted(events, key=lambda e: e['t'])):
        x = organ_tone(e['notes'], float(e['dur']), registration=e.get('registration', registration),
                       click=float(e.get('click', 0.5)), seed=seed + k)
        place(raw, x * float(e.get('vel', 1.0)), e['t'])
    y = leslie(raw[:n], leslie_speed, drive=drive, seed=seed)
    return lp(y, 9000.0, 2)


def music_box(midi, dur=2.2, vel=1.0, seed=0):
    """One music-box tine (mono): a pin plucks a clamped steel tooth (partials 1, 5.93, 16.7 with fast-dying highs),
    paired teeth beating slightly, a pin tick and the small wooden box resonance."""
    def make():
        r = np.random.default_rng(seed + int(note(midi)) * 3)
        f = float(hz(note(midi)))
        n = ns(dur)
        t = tt(n)
        x = np.zeros(n)
        for d in (-0.6, 0.6):
            x += np.sin(2 * np.pi * (f + d) * t + r.uniform(0, 6.28)) * np.exp(-t / 1.1)
        for ra, a, tau in ((2.0, 0.06, 0.5), (5.93, 0.28, 0.12), (16.7, 0.09, 0.03)):
            if f * ra < 18000:
                x += a * np.sin(2 * np.pi * f * ra * t + r.uniform(0, 6.28)) * np.exp(-t / tau)
        tick = bp(r.standard_normal(n), 2500, 9000) * np.exp(-t / 0.0012) * 0.25
        x = x * np.minimum(1, t / 0.0006) + tick
        x = x + 0.25 * comb_fb(bp(x, 300, 2500, 1), 0.0023, 0.4, 0.5)
        return fades(x / np.abs(x).max(), 0.0005, 0.3)
    return _dm(('mbox', int(round(float(note(midi)) * 10)), round(dur, 2), seed), make) * vel


def slowing_times(count, t0, step, ritard=1.12):
    """Onset times of `count` notes starting at t0 with the first gap = step, each next gap multiplied by ritard
    (a music box running down: ritard 1.1-1.3)."""
    out = []
    t = t0
    g = step
    for _ in range(count):
        out.append(t)
        t += g
        g *= ritard
    return out


def music_box_line(events, dur, *, mech=0.25, slow_from=None, stop_at=None, seed=0, room=0.25):
    """Music box part (stereo): events {t, midi, [vel], [dur]} at absolute times; mech = level of the clockwork
    (governor whirr + ratchet ticks). slow_from / stop_at (s): the spring runs down: the governor whirr slows from
    slow_from and stops at stop_at with the catch's dry CLICK (the click is placed even without slow_from).
    Note times are yours (see slowing_times)."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    out = np.zeros(n + ns(2.5))
    for e in events:
        place(out, music_box(e['midi'], float(e.get('dur', 2.2)), 0.3 * float(e.get('vel', 0.8)), seed), e['t'])
    out = out[:n]
    if mech:
        t = tt(n)
        rate = np.full(n, 1.0)
        if slow_from is not None:
            end = stop_at if stop_at is not None else dur
            k = np.clip((t - slow_from) / max(end - slow_from, 1e-3), 0, 1)
            rate = (1 - k) ** 1.6
        if stop_at is not None:
            rate[t >= stop_at] = 0.0
        ph = np.cumsum(rate) / SR
        whirr = bp(r.standard_normal(n), 1800, 6000, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * 38 * ph)) * rate
        ticks = np.zeros(n)
        tick_ph = np.floor(ph * 9.0)
        idx = np.nonzero(np.diff(tick_ph) > 0)[0]
        tk = bp(r.standard_normal(ns(0.01)), 2000, 8000) * np.exp(-tt(ns(0.01)) / 0.001)
        for i in idx:
            place(ticks, tk * 0.6, int(i))
        out += mech * 0.05 * (whirr + ticks)
    if stop_at is not None:
        m = ns(0.12)
        tm = tt(m)
        clk = (bp(r.standard_normal(m), 1200, 7000, 2) * np.exp(-tm / 0.002) * 1.4
               + np.sin(2 * np.pi * 2900 * tm) * np.exp(-tm / 0.006) * 0.5 + np.sin(2 * np.pi * 760 * tm) * np.exp(-tm / 0.02) * 0.3)
        place(out, clk * 0.5, stop_at)
    y = stereo(out)
    y = widen(np.stack([out, frac_delay(out, 9.0)], axis=1), 1.0) * 0.8 + 0.2 * y
    if room:
        y = reverb(y, 'small', room, 300.0, None, tail=False)
    return y


def _brass_voice(f0, n, r, *, scoop=-1.6, scoop_t=0.07, fall=0.0, bright=1.0, growl=0.4, vib=0.0, swell=0.04):
    t = tt(n)
    dur = n / SR
    cents = 100 * scoop * np.exp(-t / scoop_t) + 100 * fall * smoothstep((t - 0.65 * dur) / (0.35 * dur))
    if vib:
        cents = cents + vib * 100 * np.sin(2 * np.pi * 5.2 * t) * smoothstep((t - 0.35) / 0.3)
    f = f0 * 2 ** (cents / 1200.0) * 2 ** (r.normal(0, 6) / 1200)
    x = 0.65 * saw(f, n, r.random()) + 0.35 * pulse(f, n, r.random(), 0.3)
    amp = smoothstep(t / swell) * (0.75 + 0.25 * np.exp(-t / 0.25))
    amp = amp * (1 + growl * 0.45 * np.sin(2 * np.pi * r.uniform(24, 32) * t) * np.exp(-t / 0.5))
    fc = (250 + 2600 * bright * smoothstep(t / 0.09) * (0.55 + 0.45 * np.exp(-t / 0.4))) + 3 * f
    x = tvf(x, 'lp', fc, q=1.4, block=64)
    x = tvf(x, 'lp', fc * 1.3, q=0.6, block=64)
    return x * amp


def brass_stinger(notes=('Bb1', 'E2'), dur=2.2, *, voices=3, sub_drop=True, scoop=-1.6, fall=-0.5, growl=0.6,
                  bright=1.0, seed=0, room=0.3):
    """Low brass stinger (stereo): a section (voices per note, detuned, spread) lip-scooping up into a growling
    BWAAAM with a sagging fall; formant body ~550 Hz / 1.2 kHz; sub_drop adds a sine sweeping 62 -> 30 Hz.
    Default = the dread tritone cluster Bb1 + E2. A comic single 'BWAAAM' = brass_stinger(['E2', 'E3'], fall=-1.0)."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    out = np.zeros((n, 2))
    k = 0
    for m in notes:
        f0 = float(hz(note(m)))
        for v in range(voices):
            x = _brass_voice(f0, n, r, scoop=scoop * r.uniform(0.8, 1.2), fall=fall, bright=bright, growl=growl)
            p = (k / max(1, len(notes) * voices - 1)) * 1.2 - 0.6
            out += stereo(x, p)
            k += 1
    out /= max(1, k) ** 0.6
    out = peq(out, 550.0, 5.0, 1.0)
    out = peq(out, 1250.0, 3.0, 1.5)
    out = peq(out, 250.0, -2.0, 1.0)
    out = saturate(out, 1.8, 0.1)
    env = np.minimum(1.0, (dur - t) / 0.25)
    out *= np.clip(env, 0, 1)[:, None]
    if sub_drop:
        f = 30.0 + 32.0 * np.exp(-t / 0.45)
        sd = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.8) * np.minimum(1, t / 0.01)
        out += stereo(sd) * 0.6 * np.abs(out).max()
    if room:
        out = reverb(out, 'theatre', room, 120.0, None, tail=False)
    return fades(out / np.abs(out).max(), 0.002, 0.2) * 0.9


def bwaam(midi='E2', dur=1.8, seed=0):
    """The Roadie's comic-dread BWAAAM: one low brass note + its octave, big scoop, growl, a sad droop at the end."""
    m = int(note(midi))
    return brass_stinger([m, m + 12], dur, voices=3, sub_drop=False, scoop=-2.2, fall=-1.0, growl=0.8, seed=seed, room=0.2)


def cymbal_ding(midi='B5', dur=3.0, vel=1.0, seed=0):
    """A pitched cymbal DING (stereo): a stick strike on a cymbal bell tuned to `midi` (strong fundamental + octave,
    a few inharmonic bell partials, a short splash). Reads clearly as the note."""
    r = np.random.default_rng(seed)
    f0 = float(hz(note(midi)))
    n = ns(dur)
    t = tt(n)
    x = np.zeros(n)
    for ra, a, tau in ((1.0, 1.0, 1.6), (2.0, 0.35, 0.9), (2.76, 0.18, 0.45), (3.0, 0.12, 0.5), (4.1, 0.1, 0.3),
                       (5.4, 0.08, 0.2), (0.5, 0.05, 0.8)):
        if f0 * ra < 18000:
            for d in (-0.8, 0.8):
                x += a * np.sin(2 * np.pi * (f0 * ra + d) * t + r.uniform(0, 6.28)) * np.exp(-t / tau)
    x /= np.abs(x).max()
    tick = bp(r.standard_normal(n), 2500, 10000) * np.exp(-t / 0.0015)
    x = x * np.minimum(1, t / 0.0005) + 0.5 * tick / (np.abs(tick).max() + 1e-9)
    sp = splash(0.8, seed)
    y = stereo(x) + 0.25 * pad_to(sp, n)
    return fades(y / np.abs(y).max(), 0.0003, 0.4) * 0.9 * vel


# =====================================================================================================
# FX, batch 1: weather, radio, the car, Gerald (the shotgun), doors
# =====================================================================================================

def _impulses(n, rate_hz, seed, amp_sd=0.6, rate_curve=None):
    """Random (Poisson) impulse train of n samples at rate_hz events/s (rate_curve scales it per sample)."""
    r = np.random.default_rng(seed)
    p = rate_hz / SR * (np.ones(n) if rate_curve is None else np.asarray(rate_curve, float))
    hit = r.random(n) < p
    x = np.zeros(n)
    k = int(hit.sum())
    x[hit] = np.exp(r.normal(0, amp_sd, k)) * r.choice([-1.0, 1.0], k)
    return x


def _resonate(x, f, q=8.0):
    return signal.sosfilt(biquad('bp', f, q), x, axis=0)


def rain_bed(dur, intensity=1.0, *, inside=False, seed=0):
    """Rain (stereo). Outside: a wide hiss of distant rain plus thousands of near droplet ticks and splashes.
    inside=True: heard from inside the van: drops drumming on the roof and windshield (low, dull taps), a muffled
    wash, the odd heavier drip."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    out = np.zeros((n, 2))
    sw = 1.0 + 0.25 * smooth_noise(n, 0.3, seed + 1)
    for ch in range(2):
        s_ = seed * 10 + ch
        hiss = pink(n, s_)
        if inside:
            hiss = lp(bp(hiss, 150, 2500, 2), 1800, 2) * 0.35
            taps = _impulses(n, 900 * intensity, s_ + 1, 0.7, sw)
            roof = sum(_resonate(taps * (r.random(n) < 0.33), f, 6.0) for f in (320.0, 520.0, 760.0)) * 0.22
            glass = sum(_resonate(taps * (r.random(n) < 0.25), f, 10.0) for f in (1700.0, 2600.0)) * 0.08
            drips = _resonate(_impulses(n, 2.5, s_ + 2, 0.4), 180.0, 4.0) * 0.6
            out[:, ch] = hiss * 0.5 + roof + glass + drips
        else:
            hiss = bp(hiss, 400, 12000, 2) * 0.5
            ticks = _impulses(n, 1400 * intensity, s_ + 3, 0.8, sw)
            plinks = sum(_resonate(ticks * (r.random(n) < 0.2), f, 14.0) for f in (2300.0, 3100.0, 4200.0, 5600.0, 7400.0))
            splat = hp(_impulses(n, 300 * intensity, s_ + 4, 0.6, sw), 1500, 2) * 0.5
            out[:, ch] = hiss + 0.25 * plinks + splat
    out *= sw[:, None] * intensity
    out = out / (rms(out) + 1e-12) * 0.06
    return fades(out, 0.5, 0.5)


def thunder(dur=5.0, distance=0.5, *, seed=0):
    """Thunder (stereo): distance 0 = right overhead (a ripping crack, then the roll), 1 = far (only the low
    rolling rumble). The rumble is several overlapping rolls of low-passed noise; an echo off the buildings."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    out = np.zeros((n, 2))
    for ch in range(2):
        nz = brown(n, seed * 3 + ch)
        env = np.zeros(n)
        for k in range(r.integers(4, 7)):
            t0 = r.uniform(0.0, 0.5) + k * r.uniform(0.15, 0.6)
            a = r.uniform(0.5, 1.0) * (0.85 ** k)
            u = t - t0
            env += a * np.where(u > 0, (1 - np.exp(-u / 0.08)) * np.exp(-u / r.uniform(0.5, 1.4)), 0.0)
        rum = lp(nz, 180 + 220 * (1 - distance), 4) * env
        body = bp(nz, 150, 600, 2) * env * (0.5 * (1 - distance))
        out[:, ch] = rum + body
    out /= np.abs(out).max() + 1e-9
    if distance < 0.6:
        c = np.zeros((n, 2))
        for ch in range(2):
            w = r.standard_normal(n)
            e = np.zeros(n)
            for o in np.cumsum(r.uniform(0.004, 0.03, 18)):
                u = t - o
                e += np.where(u > 0, np.exp(-np.maximum(u, 0) / 0.01), 0.0) * r.uniform(0.3, 1.0)
            c[:, ch] = hp(w, 1200, 2) * e * (t < 0.6)
        out += c / (np.abs(c).max() + 1e-9) * (0.9 - distance)
    out = reverb(out, 'street', 0.3, 60.0, None, tail=False)
    return fades(out / np.abs(out).max(), 0.002, 1.0) * (1.0 - 0.4 * distance)


def am_radio(x, *, band=(320.0, 3000.0), drive=0.35, noise=0.015, crackle=0.3, seed=0):
    """Process audio as heard on an AM radio (mono out): band-pass, small-speaker resonance, soft drive, a bed of
    static with crackles."""
    m = mono(x)
    n = len(m)
    y = bp(m, band[0], band[1], 3)
    y = peq(y, 1100.0, 4.0, 1.0)
    y = saturate(y / (np.abs(y).max() + 1e-9), 1.0 + 3.0 * drive, 0.05) * np.abs(m).max()
    if noise or crackle:
        st_ = radio_static(n / SR, seed=seed, crackle=crackle) * (noise / 0.05)
        y = y + st_[:n] * np.abs(m).max()
    return y


def radio_static(dur, *, crackle=0.5, whistle=0.2, fade=0.3, seed=0):
    """AM static (mono, ~0.05 RMS): band-limited hiss with slow fading, sferic crackles and a faint wandering
    heterodyne whistle."""
    n = ns(dur)
    hiss = bp(pink(n, seed), 200, 4500, 2)
    hiss *= 1.0 + fade * smooth_noise(n, 0.7, seed + 1)
    ck = _impulses(n, 25.0, seed + 2, 1.0)
    ck = bp(ck, 300, 5000, 2) * 6.0
    wf = 1400 + 500 * smooth_noise(n, 0.25, seed + 3)
    wh = sine(wf, n) * whistle * 0.2 * (0.5 + 0.5 * smooth_noise(n, 0.5, seed + 4))
    y = hiss + crackle * ck + wh
    return y / (rms(y) + 1e-12) * 0.05


def radio_tune(dur=1.5, *, catches=(), settle=0.25, seed=0):
    """Tuning across the AM dial (mono): static swells, heterodyne whistles swoop through zero-beat at each
    passing station, and `catches` = [(t_center, audio, width_s), ...] fade in band-limited as the dial crosses
    them; it settles into a clean carrier over the last `settle` s (static ducks away)."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    y = radio_static(dur, crackle=0.6, whistle=0.0, seed=seed)
    k_settle = 1 - smoothstep((t - (dur - settle)) / max(settle, 1e-3))
    for c in range(4):                        # passing carriers: whistles swooping down through zero and back up
        tc = r.uniform(0.05, dur - settle) if dur > settle + 0.1 else dur / 2
        sp = r.uniform(4000, 9000)
        f = np.abs(t - tc) * sp + 30
        w = sine(np.minimum(f, 5000), n) * np.exp(-((t - tc) / 0.18) ** 2) * 0.06
        y += w
    for (tc, audio, width) in catches:
        a = am_radio(audio, noise=0.0, crackle=0.0)
        g = np.exp(-((t - tc) / max(width / 2.5, 1e-3)) ** 2)
        seg = np.zeros(n)
        i0 = int((tc - width) * SR)
        place(seg, a, max(0, i0))
        y += seg * g * 0.8
    y = y * (0.25 + 0.75 * k_settle)
    return fades(y, 0.01, 0.02)


def car_skid(dur=2.5, *, seed=0):
    """Tyre squeal (stereo): stick-slip harmonics around 700-1000 Hz wobbling chaotically, rubber hiss, falling
    as the van slows."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    f0 = 880 * (1 - 0.25 * t / dur) * (1 + 0.04 * smooth_noise(n, 9, seed) + 0.015 * smooth_noise(n, 31, seed + 1))
    x = np.zeros(n)
    for h, a in ((1, 1.0), (2, 0.5), (3, 0.35), (4, 0.2), (5, 0.12), (6, 0.08)):
        x += a * sine(f0 * h, n, r.random()) * (0.7 + 0.3 * smooth_noise(n, 13, seed + h))
    hiss = bp(r.standard_normal(n), 1200, 7000, 2) * 0.35 * (1 + 0.5 * smooth_noise(n, 20, seed + 9))
    rumble = lp(r.standard_normal(n), 200, 2) * 0.3
    env = smoothstep(t / 0.08) * (1 - smoothstep((t - dur * 0.75) / (dur * 0.25)))
    y = (x * 0.5 + hiss + rumble) * env
    y = np.stack([y, frac_delay(y, 0.0004 * SR * (1 + smooth_noise(n, 1.0, seed + 5)) + 1)], axis=1)
    return fades(peak_norm(y, 0.9), 0.01, 0.1)


def glass_shatter(dur=1.6, *, seed=0):
    """Breaking glass (stereo): a crack, a shower of bright pings and tinkles (dense, then sparse), grit."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    out = stereo(hp(r.standard_normal(n), 2000, 2) * np.exp(-t / 0.008) * 1.5)
    for _ in range(90):
        o = r.uniform(0, 0.9) ** 2.2
        f = r.uniform(2200, 10500)
        u = t - o
        m = u >= 0
        ping = np.zeros(n)
        ping[m] = np.sin(2 * np.pi * f * u[m]) * np.exp(-u[m] / r.uniform(0.008, 0.07))
        ping[m] += 0.5 * np.sin(2 * np.pi * f * 1.73 * u[m]) * np.exp(-u[m] / 0.01)
        out += stereo(ping * r.uniform(0.1, 0.5) * (1.0 - 0.5 * o), r.uniform(-0.9, 0.9))
    grit = bp(r.standard_normal(n), 3000, 12000, 2) * np.exp(-t / 0.2) * 0.25
    out += stereo(grit)
    return fades(peak_norm(out, 0.9), 0.0003, 0.2)


def _metal_hit(n, f_lo, f_hi, count, tau, seed, damp_hi=True):
    r = np.random.default_rng(seed)
    t = tt(n)
    x = np.zeros(n)
    for _ in range(count):
        f = np.exp(r.uniform(np.log(f_lo), np.log(f_hi)))
        tt_ = tau * r.uniform(0.4, 1.4) * ((f_lo / f) ** 0.3 if damp_hi else 1.0)
        x += r.uniform(0.3, 1.0) * np.sin(2 * np.pi * f * t + r.uniform(0, 6.28)) * np.exp(-t / tt_)
    return x / (np.abs(x).max() + 1e-9)


def car_crash(*, dur=3.5, seed=0):
    """The van hits the pile-up (stereo): a body-blow thump, crumpling metal (grinding grains over 0.4 s + clangs),
    glass, then debris and a hubcap wobbling to rest (wah-wah-wa-wawawa). Peak ~0.9."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    thump = (_sweep_sine(48 + 80 * np.exp(-t / 0.03), n) * np.exp(-t / 0.18) + lp(r.standard_normal(n), 300, 2) * np.exp(-t / 0.06))
    clang = _metal_hit(n, 140, 2600, 40, 0.35, seed + 1)
    crumple = np.zeros(n)
    for _ in range(70):
        o = r.uniform(0, 0.45) ** 1.3
        g = ns(r.uniform(0.004, 0.03))
        grain = bp(r.standard_normal(g), r.uniform(300, 2000), r.uniform(2500, 7000), 2) * np.hanning(g)
        place(crumple, grain * r.uniform(0.3, 1.0), o)
    out = stereo(1.1 * thump + 0.6 * clang + 0.7 * crumple)
    out += 0.55 * pad_to(glass_shatter(1.6, seed=seed + 2), n)
    for _ in range(14):                       # debris
        o = r.uniform(0.3, 1.6)
        m = ns(0.3)
        piece = _metal_hit(m, 600, 6000, 6, 0.05, int(r.integers(1 << 20)))
        place(out, piece * r.uniform(0.05, 0.2), o, 1.0, r.uniform(-0.8, 0.8))
    # hubcap: a metal disc wobbling, the wobble rate rising as it settles
    hs, hd = 1.0, 2.3
    m = ns(hd)
    u = tt(m)
    wob = 4.0 + 40.0 * (u / hd) ** 2.5
    ph = 2 * np.pi * np.cumsum(wob) / SR
    ring = _metal_hit(m, 900, 4500, 8, 0.4, seed + 7) + 0.6 * lp(r.standard_normal(m), 1500, 2)
    hub = ring * (0.5 + 0.5 * np.abs(np.sin(ph))) * (1 - u / hd) ** 0.6
    hub[-ns(0.05):] *= np.linspace(1, 0, ns(0.05))
    place(out, hub * 0.25, hs, 1.0, 0.4)
    out = reverb(out, 'street', 0.25, 120.0, None, tail=False)
    return fades(peak_norm(out, 0.9), 0.0005, 0.3)


def body_bonk(pitch=1.0, *, seed=0):
    """Comic BONK (mono): a hollow coconut knock with a pitch drop and a tiny boing; pitch scales it."""
    r = np.random.default_rng(seed)
    n = ns(0.35)
    t = tt(n)
    f = 380 * pitch * r.uniform(0.95, 1.05) * (1 + 0.45 * np.exp(-t / 0.02))
    x = _sweep_sine(f, n) * np.exp(-t / 0.07) + 0.4 * _sweep_sine(f * 2.32, n, 1) * np.exp(-t / 0.03)
    x += bp(r.standard_normal(n), 800, 5000) * np.exp(-t / 0.003) * 0.8
    x += 0.25 * _sweep_sine(f * 0.5 * (1 + 0.06 * np.sin(2 * np.pi * 14 * t)), n) * np.exp(-t / 0.12)    # boing
    x += lp(r.standard_normal(n), 200, 2) * np.exp(-t / 0.02) * 0.6                                     # body thud
    return fades(peak_norm(x, 0.9), 0.0002, 0.05)


def shotgun(*, seed=0, space='street'):
    """Gerald fires (stereo): a supersonic crack, a chest-hitting boom (60 Hz + low noise), mid blast, the
    mechanism rattle and a slapback off the walls. Peak ~0.95."""
    r = np.random.default_rng(seed)
    n = ns(1.6)
    t = tt(n)
    crack = hp(r.standard_normal(n), 1500, 2) * np.exp(-t / 0.0025) * 2.0
    boom = _sweep_sine(60 + 90 * np.exp(-t / 0.01), n) * np.exp(-t / 0.14) * 1.4
    boom += lp(r.standard_normal(n), 400, 2) * np.exp(-t / 0.05) * 1.6
    mid = bp(r.standard_normal(n), 300, 3000, 2) * np.exp(-t / 0.035) * 1.6
    rattle = _metal_hit(n, 1500, 6000, 10, 0.03, seed + 3) * 0.12
    x = (crack + boom + mid + rattle) * np.minimum(1, t / 0.0002)
    x = np.tanh(1.5 * x) / np.tanh(1.5)
    y = reverb(x, space, 0.35, 150.0, None, tail=False)
    return fades(peak_norm(y, 0.95), 0.0002, 0.3)


def _clack(n, r, f_set=(2100.0, 3400.0, 5200.0), tau=0.018, thunk=300.0):
    t = tt(n)
    x = bp(r.standard_normal(n), 900, 7000, 2) * np.exp(-t / 0.003) * 1.4
    for f in f_set:
        x += np.sin(2 * np.pi * f * r.uniform(0.97, 1.03) * t) * np.exp(-t / tau) * 0.35
    x += np.sin(2 * np.pi * thunk * t) * np.exp(-t / 0.02) * 0.5
    return x


def shotgun_pump(*, seed=0):
    """Pump action chk-CHK (mono, ~0.45 s): slide back (scrape + clack), slide home (heavier clack)."""
    r = np.random.default_rng(seed)
    n = ns(0.45)
    out = np.zeros(n)
    scrape = bp(r.standard_normal(ns(0.06)), 2000, 8000, 2) * np.hanning(ns(0.06)) * 0.3
    place(out, scrape, 0.0)
    place(out, _clack(ns(0.15), r) * 0.8, 0.05)
    place(out, bp(r.standard_normal(ns(0.05)), 1500, 6000, 2) * np.hanning(ns(0.05)) * 0.25, 0.16)
    place(out, _clack(ns(0.2), r, (1700.0, 2900.0, 4600.0), 0.025, 220.0) * 1.0, 0.2)
    return fades(peak_norm(out, 0.9), 0.0002, 0.03)


def shotgun_reload(shells=2, *, seed=0):
    """Thumbing shells into the tube (mono): per shell a plastic click and the spring zip (~0.28 s each)."""
    r = np.random.default_rng(seed)
    out = np.zeros(ns(0.3 * shells + 0.2))
    for k in range(shells):
        t0 = 0.3 * k
        place(out, _clack(ns(0.06), r, (2600.0, 4100.0), 0.008, 600.0) * 0.5, t0)
        z = ns(0.09)
        zip_ = bp(r.standard_normal(z), 2500, 9000, 2) * np.linspace(0.2, 1, z) * 0.25
        place(out, zip_, t0 + 0.03)
        place(out, _clack(ns(0.08), r, (1900.0, 3300.0), 0.012, 400.0) * 0.7, t0 + 0.12)
    return fades(peak_norm(out, 0.8), 0.0002, 0.03)


def shell_tink(*, bounces=4, seed=0):
    """An ejected shell bouncing off a head and the road (mono): bright hollow tinks at shrinking intervals."""
    r = np.random.default_rng(seed)
    out = np.zeros(ns(1.0))
    t0, gap, a = 0.0, 0.16, 1.0
    for k in range(bounces):
        m = ns(0.12)
        u = tt(m)
        f = r.uniform(2800, 3600)
        x = (np.sin(2 * np.pi * f * u) + 0.5 * np.sin(2 * np.pi * f * 2.6 * u)) * np.exp(-u / 0.025)
        x += bp(r.standard_normal(m), 2000, 9000) * np.exp(-u / 0.002) * 0.5
        place(out, x * a, t0)
        t0 += gap
        gap *= 0.62
        a *= 0.6
    return fades(peak_norm(out, 0.7), 0.0002, 0.05)


def door_slam(*, seed=0, space='stairwell'):
    """A heavy steel door slammed (stereo): sub thud, the steel panel's clanging boom (inharmonic 90 Hz-1.5 kHz),
    the latch's click a beat later, a hard-walled corridor tail. Peak ~0.95."""
    r = np.random.default_rng(seed)
    n = ns(2.2)
    t = tt(n)
    thud = _sweep_sine(46 + 40 * np.exp(-t / 0.02), n) * np.exp(-t / 0.16) * 1.3 + lp(r.standard_normal(n), 250, 2) * np.exp(-t / 0.04)
    panel = _metal_hit(n, 90, 1500, 30, 0.3, seed + 1) * 0.7
    impact = bp(r.standard_normal(n), 400, 6000, 2) * np.exp(-t / 0.008)
    latch = np.zeros(n)
    place(latch, _clack(ns(0.1), r, (2400.0, 3900.0), 0.012, 500.0) * 0.5, 0.045)
    x = np.tanh(1.3 * (thud + panel + impact + latch)) / np.tanh(1.3)
    y = reverb(x, space, 0.35, 100.0, None, tail=False)
    return fades(peak_norm(y, 0.95), 0.0003, 0.4)


def door_pound(*, seed=0, muffled=True):
    """A fist pounding the steel door from the other side (mono): dull low thump + the panel's boom, muffled."""
    r = np.random.default_rng(seed)
    n = ns(0.9)
    t = tt(n)
    x = _sweep_sine(70 + 50 * np.exp(-t / 0.015), n) * np.exp(-t / 0.09) * 1.2
    x += _metal_hit(n, 80, 900, 14, 0.35, seed + 1) * 0.5
    x += lp(r.standard_normal(n), 400, 2) * np.exp(-t / 0.02) * 0.9
    if muffled:
        x = lp(x, 900, 2)
    return fades(peak_norm(x, 0.9), 0.001, 0.2)


def door_knock(*, seed=0, hard=0.7):
    """One knuckle knock on a steel door, heard from inside (mono): a short dull knock (~250 Hz) with a little
    metallic ring, muffled by the door."""
    r = np.random.default_rng(seed)
    n = ns(0.4)
    t = tt(n)
    x = _sweep_sine(240 * r.uniform(0.95, 1.05) * (1 + 0.2 * np.exp(-t / 0.004)), n) * np.exp(-t / 0.03)
    x += _metal_hit(n, 500, 2200, 10, 0.12, seed + 1) * 0.35 * hard
    x += bp(r.standard_normal(n), 300, 2500, 2) * np.exp(-t / 0.004) * (0.6 + 0.6 * hard)
    x = lp(x, 2400, 2)
    return fades(peak_norm(x, 0.8) * (0.6 + 0.4 * hard), 0.0003, 0.1)


def door_burst(*, seed=0):
    """The door bursting open (stereo): the bolt snapping, the steel door swinging into the wall (slam) and its
    shudder, plus a rush of air."""
    r = np.random.default_rng(seed)
    n = ns(2.4)
    out = np.zeros((n, 2))
    place(out, _clack(ns(0.15), r, (1900.0, 3100.0, 4700.0), 0.04, 260.0) * 0.6, 0.0)
    place(out, door_slam(seed=seed + 1)[:n], 0.06)
    air = bp(r.standard_normal(ns(0.5)), 300, 3000, 2) * np.hanning(ns(0.5)) * 0.15
    place(out, air, 0.0)
    return fades(peak_norm(out, 0.95), 0.0003, 0.3)


# =====================================================================================================
# FX, batch 2: electricity, the generator, pyro, the chopper, crowds, alarms, the camera, tape and film
# =====================================================================================================

def spark_zap(dur=0.7, *, seed=0):
    """Electrical arc ZZZAP (stereo): a sharp snap, a 120 Hz-harmonic buzz gated by the arc flickering, crackle
    and sizzle, dying away."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    gate_ = (smooth_noise(n, 35, seed) > -0.2).astype(float)
    gate_ = lp(gate_, 300, 1)
    buzz = saw(120 * (1 + 0.02 * smooth_noise(n, 6, seed + 1)), n) + 0.5 * pulse(240, n, 0.3, 0.2)
    buzz = bp(buzz, 150, 6000, 1) * gate_
    crack = bp(_impulses(n, 400, seed + 2, 1.0), 1500, 12000, 2) * 4.0
    sizzle = hp(r.standard_normal(n), 3500, 2) * (0.5 + 0.5 * gate_) * 0.5
    snap = hp(r.standard_normal(n), 800, 2) * np.exp(-t / 0.006) * 3.0
    env = np.exp(-t / (dur * 0.45)) * np.minimum(1, t / 0.001)
    x = (0.5 * buzz + crack + sizzle) * env + snap
    y = np.stack([x, frac_delay(x, 7.0)], axis=1)
    return fades(peak_norm(y, 0.9), 0.0002, 0.05)


def tape_stop(x, start=0.0, dur=0.8, *, curve=1.6, tail=0.0):
    """Tape-stop processor: from `start` (s) the playback speed winds down to zero over `dur` s (pitch and speed
    together; rate = (1 - k) ** curve), then silence. Works on mono or stereo; returns the same length (plus
    `tail` s)."""
    x = np.asarray(x, float)
    n = x.shape[0] + ns(tail)
    t = tt(n)
    k = np.clip((t - start) / max(dur, 1e-3), 0, 1)
    rate = np.where(t < start, 1.0, (1 - k) ** curve)
    y = resample_speed(pad_to(x, n), rate)
    stop = int((start + dur) * SR)
    if stop < n:
        y[stop:] = 0.0
    fl = ns(0.02)
    i0 = max(0, stop - fl)
    sh = (-1,) + (1,) * (y.ndim - 1)
    y[i0:stop] *= np.linspace(1, 0, stop - i0).reshape(sh)
    return y


def flashlight_click(*, seed=0, on=True):
    """A flashlight's clicky switch (mono): press click + latch click ~25 ms later (on) or one click (off)."""
    r = np.random.default_rng(seed)
    out = np.zeros(ns(0.12))
    for k, (o, a) in enumerate(((0.0, 0.7), (0.026, 1.0)) if on else ((0.0, 1.0),)):
        m = ns(0.03)
        u = tt(m)
        c = bp(r.standard_normal(m), 2500, 9000, 2) * np.exp(-u / 0.0012) + 0.4 * np.sin(2 * np.pi * 3300 * u) * np.exp(-u / 0.004)
        place(out, c * a, o)
    return fades(peak_norm(out, 0.7), 0.0001, 0.02)


def _engine_pulses(rate_hz, n, seed, roughness=0.15):
    """Combustion pulse train: one exhaust pop per cycle at a per-sample rate (array), slightly irregular."""
    r = np.random.default_rng(seed)
    rate = np.broadcast_to(np.asarray(rate_hz, float), (n,))
    ph = np.cumsum(rate) / SR
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    x = np.zeros(n)
    x[idx] = 1.0 + roughness * r.standard_normal(len(idx))
    return x


def generator_pull(pitch='C3', outcome='sputter', *, pull=0.55, seed=0):
    """Recoil-start pull (stereo): the rope ratchets and the flywheel whirr sweeps up to `pitch` (MIDI / name) over
    `pull` s, then the outcome: 'sputter' (a comic cough: three feeble uneven pops), 'backfire' (a fat PFFT), or
    'none'. Returns ~pull + 1.0 s."""
    r = np.random.default_rng(seed)
    n = ns(pull + 1.0)
    t = tt(n)
    f_top = float(hz(note(pitch)))
    k = np.clip(t / pull, 0, 1)
    f = f_top * (0.3 + 0.7 * k ** 0.6) * np.where(t < pull, 1.0, np.exp(-(t - pull) / 0.25))
    whirr = (saw(f, n) * 0.5 + sine(f * 2, n) * 0.3)
    whirr = bp(whirr, 150, 3500, 2) * np.where(t < pull, 0.3 + 0.7 * k, np.exp(-(t - pull) / 0.12))
    comp = _engine_pulses(f / 6.0, n, seed)               # compression strokes thumping through the rope
    comp = signal.lfilter([1.0], [1, -0.97], comp) * 0.08
    comp = bp(comp, 60, 600, 2) * (t < pull + 0.15)
    rope = bp(r.standard_normal(n), 600, 5000, 2) * (t < pull) * (0.1 + 0.25 * k) * (1 + 0.6 * np.sin(2 * np.pi * f / 4 * t))
    x = whirr + 2.0 * comp + 0.3 * rope
    if outcome == 'sputter':
        for i, (o, a) in enumerate(((0.05, 0.9), (0.24, 0.6), (0.47, 0.35))):
            m = ns(0.18)
            u = tt(m)
            pop = (_sweep_sine(90 * (1 + 0.6 * np.exp(-u / 0.01)), m) * np.exp(-u / 0.04)
                   + bp(r.standard_normal(m), 200, 2500, 2) * np.exp(-u / 0.025) * 0.8)
            place(x, pop * a * 0.8, pull + o + r.uniform(-0.02, 0.02))
    elif outcome == 'backfire':
        m = ns(0.5)
        u = tt(m)
        pf = (_sweep_sine(70 * (1 + np.exp(-u / 0.01)), m) * np.exp(-u / 0.06) * 1.2
              + bp(r.standard_normal(m), 300, 6000, 2) * np.exp(-u / 0.004) * 1.5
              + bp(r.standard_normal(m), 800, 4000, 2) * np.exp(-u / 0.12) * 0.5 * (1 - np.exp(-u / 0.03)))
        place(x, pf, pull + 0.06)
    y = np.stack([x, frac_delay(x, 11.0)], axis=1)
    y = reverb(y, 'room', 0.15, 100.0, None, tail=False)
    return fades(peak_norm(y, 0.9), 0.003, 0.1)


def generator_idle(dur, midi='E2', *, chug_s=BEAT / 2, chug=0.6, seed=0):
    """A generator idling (stereo): combustion pulses at the frequency of `midi` (so it hums the note), through a
    muffler, with a rhythmic load chug every chug_s s (8ths at 150 BPM by default) and a mechanical rattle."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    f = float(hz(note(midi)))
    puls = _engine_pulses(f * (1 + 0.004 * smooth_noise(n, 3, seed)), n, seed, 0.25)
    tone = signal.lfilter([1.0], [1, -0.985], puls)
    tone = hp(tone, 40, 2)
    tone = peq(lp(tone, 900, 2), 2 * f, 6.0, 2.0)
    ch = 1.0 - chug * 0.5 * (1 - np.exp(-((t % chug_s) / (chug_s * 0.35))))
    rattle = bp(r.standard_normal(n), 1500, 6000, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * f / 2 * t)) * 0.05
    x = (tone / (np.abs(tone).max() + 1e-9)) * ch + rattle
    y = np.stack([x, frac_delay(x, 13.0)], axis=1)
    return fades(peak_norm(y, 0.8), 0.01, 0.05)


def generator_catch(midi='E2', dur=2.0, *, chug_s=BEAT / 2, seed=0):
    """The engine catches (stereo): a last pull, it fires, revs up past the idle (+5 semitones) and settles into
    generator_idle on `midi` within ~0.4 s, chugging in 8ths. Returns dur s (pad / crossfade into a longer idle)."""
    n = ns(dur)
    t = tt(n)
    f = float(hz(note(midi)))
    cur = f * 2 ** ((5.0 * np.exp(-np.maximum(t - 0.08, 0) / 0.18) * smoothstep(t / 0.08) - 7.0 * (1 - smoothstep(t / 0.08))) / 12)
    puls = _engine_pulses(cur, n, seed, 0.3)
    tone = signal.lfilter([1.0], [1, -0.985], puls)
    tone = peq(lp(hp(tone, 40, 2), 1100, 2), 2 * f, 6.0, 2.0)
    tone = tone / (np.abs(tone).max() + 1e-9)
    idle = generator_idle(dur, midi, chug_s=chug_s, seed=seed + 1)
    k = smoothstep((t - 0.35) / 0.25)
    y = stereo(tone * (1 - k)) * 0.9 + idle * k[:, None]
    bang = np.zeros(n)
    m = ns(0.2)
    u = tt(m)
    place(bang, _sweep_sine(80 * (1 + np.exp(-u / 0.01)), m) * np.exp(-u / 0.05), 0.0)
    y += stereo(bang) * 0.6
    return fades(peak_norm(y, 0.85), 0.002, 0.05)


def pyro_whoosh(dur=1.3, *, seed=0):
    """A stage pyro flame jet (stereo): an ignition pop, a roaring FWOOMP (low roar + bright hiss) that swells and
    falls, crackling flame on the tail."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    env = smoothstep(t / 0.05) * np.exp(-np.maximum(t - 0.25, 0) / 0.3)
    out = np.zeros((n, 2))
    for ch in range(2):
        nz = r.standard_normal(n)
        roar = lp(nz, 380, 2) * 2.0 * (1 + 0.3 * smooth_noise(n, 18, seed + ch))
        fc = 3500 * np.exp(-t / 0.4) + 600
        hiss = tvf(nz, 'bp', fc, 0.8, 128) * 0.9
        out[:, ch] = (roar + hiss) * env
    crack = bp(_impulses(n, 60, seed + 5, 1.0), 800, 9000, 2) * 5.0 * np.exp(-np.maximum(t - 0.1, 0) / 0.5) * (t > 0.08)
    out += stereo(crack) * 0.3
    pop = bp(r.standard_normal(n), 200, 3000, 2) * np.exp(-t / 0.008)
    out += stereo(pop)
    return fades(peak_norm(out, 0.9), 0.001, 0.2)


def fire(dur, intensity=1.0, *, seed=0):
    """Burning (stereo): a low roar, flickering, and crackles / pops (more crackle with intensity)."""
    n = ns(dur)
    out = np.zeros((n, 2))
    for ch in range(2):
        roar = lp(brown(n, seed + ch), 300, 2) * (1 + 0.4 * smooth_noise(n, 4, seed + 7 + ch))
        hiss = bp(pink(n, seed + 3 + ch), 1500, 8000, 2) * 0.15 * (1 + 0.5 * smooth_noise(n, 9, seed + 9 + ch))
        cr = bp(_impulses(n, 30 * intensity, seed + 11 + ch, 1.1), 600, 9000, 2) * 3.0
        out[:, ch] = roar * 0.6 + hiss + cr * intensity
    out = out / (rms(out) + 1e-9) * 0.08 * intensity
    return fades(softclip(out * 1.4, 1.0) / 1.4, 0.3, 0.3)


def whoosh(dur=0.8, *, f_lo=300.0, f_hi=3000.0, pan_from=-0.8, pan_to=0.8, flutter=0.0, seed=0):
    """A pass-by whoosh (stereo): band-passed noise whose centre rises then falls (Doppler-ish) while it pans
    across; flutter adds a spinning amplitude ripple (Hz)."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    u = t / dur
    bell = np.exp(-((u - 0.5) / 0.22) ** 2)
    fc = f_lo + (f_hi - f_lo) * bell * (1.0 + 0.15 * (0.5 - u))
    x = tvf(r.standard_normal(n), 'bp', fc, 1.2, 64) * bell
    if flutter:
        x *= 0.6 + 0.4 * np.sin(2 * np.pi * flutter * t * (1 + 0.2 * u)) ** 2
    p = pan_from + (pan_to - pan_from) * smoothstep(u)
    gl, gr = panlaw(p)
    y = np.stack([x * gl, x * gr], axis=1)
    return fades(peak_norm(y, 0.8), 0.01, 0.05)


def frisbee_whoosh(dur=1.0, *, seed=0):
    """Tiny's cymbal thrown like a frisbee (stereo): a spinning, fluttering metallic whoosh panning across, with a
    faint ring of the cymbal itself."""
    w = whoosh(dur, f_lo=900.0, f_hi=6000.0, flutter=22.0, seed=seed)
    n = w.shape[0]
    t = tt(n)
    ring = _metal_hit(n, 3000, 9000, 18, 0.6, seed + 1) * 0.12 * np.exp(-((t / dur - 0.5) / 0.3) ** 2)
    ring *= 0.6 + 0.4 * np.sin(2 * np.pi * 22 * t) ** 2
    return fades(peak_norm(w + stereo(ring), 0.85), 0.01, 0.05)


def helicopter(dur, *, rate=10.0, muffled=False, fade_in=0.0, seed=0, accent=4):
    """Helicopter (stereo): main-rotor blade slaps at exactly `rate` per second from t=0 (10 Hz = 16ths at 150 BPM,
    so it locks to the grid), every `accent`-th slap stronger, turbine whine, tail-rotor buzz. muffled=True: heard
    through the chopper's hull / a thermal camera feed (low-passed ~450 Hz, no whine)."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    out = np.zeros((n, 2))
    m = ns(1.0 / rate)
    u = tt(m)
    k = 0
    tb = 0.0
    while tb < dur:
        g = 1.0 if k % accent == 0 else 0.72
        slap = (_sweep_sine(72 * (1 + 0.5 * np.exp(-u / 0.006)), m) * np.exp(-u / 0.022)
                + lp(r.standard_normal(m), 900, 2) * np.exp(-u / 0.012) * 0.9)
        place(out, slap * g, tb, 1.0, 0.15 * np.sin(k * 0.7))
        k += 1
        tb = k / rate
    out = lp(out, 1600, 2)
    if not muffled:
        whine = (sine(5200 * (1 + 0.002 * smooth_noise(n, 0.5, seed)), n) * 0.012
                 + bp(r.standard_normal(n), 2500, 7000, 2) * 0.02)
        tail = bp(saw(68.0, n) * (0.5 + 0.5 * np.sin(2 * np.pi * 34.0 * t)), 200, 2500, 2) * 0.06
        out += stereo(whine + tail)
        out += stereo(lp(brown(n, seed + 3), 120, 2) * 0.08)
    else:
        out = lp(out, 450, 2) + stereo(lp(brown(n, seed + 3), 90, 2) * 0.05)
    if fade_in:
        out *= smoothstep(t / fade_in)[:, None]
    return out / (np.abs(out).max() + 1e-9) * 0.85


def applause(dur, *, size=300, distant=True, whistles=3, woos=0, seed=0):
    """Applause (stereo): `size` people clapping at their own tempos (cupped / flat hands = different resonances),
    swelling in and thinning out; distant=True: across a big space (low-passed, reverberant). whistles: number of
    two-finger whistles; woos: shouted-ish 'woo' glides (synthetic, small)."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    out = np.zeros((n, 2))
    groups = 10
    for g in range(groups):
        imp = np.zeros(n)
        for p in range(size // groups):
            rate = r.uniform(3.2, 5.2)
            t0 = r.uniform(0, 0.6)
            tend = dur - r.uniform(0.0, dur * 0.35)
            k = np.arange(int((tend - t0) * rate))
            tk = t0 + k / rate + r.normal(0, 0.012, len(k))
            tk = tk[(tk > 0) & (tk < dur)]
            idx = (tk * SR).astype(int)
            np.add.at(imp, idx, r.uniform(0.5, 1.0) * r.uniform(0.6, 1.0, len(idx)))
        fc = r.uniform(900, 2600)
        kern = bp(r.standard_normal(ns(0.012)), fc * 0.6, min(fc * 3.2, 12000), 2) * np.exp(-tt(ns(0.012)) / 0.0025)
        clap = signal.oaconvolve(imp, kern)[:n]
        out += stereo(clap, r.uniform(-0.85, 0.85))
    env = smoothstep(t / 0.8) * (1 - 0.5 * smoothstep((t - dur * 0.6) / (dur * 0.4)))
    out *= env[:, None]
    for w in range(whistles):
        o = r.uniform(0.3, max(0.4, dur - 1.2))
        m = ns(r.uniform(0.5, 1.0))
        u = tt(m)
        f = r.uniform(1800, 2600) * (1 + 0.08 * smoothstep(u / 0.1) - 0.12 * smoothstep((u - 0.5 * m / SR) / (0.5 * m / SR)))
        wh = sine(f * (1 + 0.006 * np.sin(2 * np.pi * 6 * u)), m) * np.hanning(m) * 0.25
        place(out, wh, o, 1.0, r.uniform(-0.6, 0.6))
    for w in range(woos):
        o = r.uniform(0.2, max(0.3, dur - 1.0))
        m = ns(0.7)
        u = tt(m)
        f0 = r.uniform(280, 420) * (1 + 0.35 * smoothstep(u / 0.25) - 0.25 * smoothstep((u - 0.35) / 0.35))
        v = saw(f0, m) * np.hanning(m)
        v = peq(peq(bp(v, 250, 3000, 2), 450, 8, 3), 900, 6, 3) * 0.15
        place(out, v, o, 1.0, r.uniform(-0.6, 0.6))
    if distant:
        out = lp(out, 3200, 2)
        out = reverb(out, 'hall', 0.55, 150.0, None, tail=False)
    return fades(out / (np.abs(out).max() + 1e-9) * 0.8, 0.3, 0.5)


def crowd_murmur(dur, *, size=40, seed=0):
    """A restless crowd murmur (stereo): many unintelligible voices (formant-filtered buzz bursts), low level."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    out = np.zeros((n, 2))
    for v in range(size):
        f0 = r.uniform(95, 240)
        f = f0 * (1 + 0.08 * smooth_noise(n, 3, seed + v))
        src = saw(f, n, r.random())
        vow = 500 + 400 * smooth_noise(n, 2.5, seed + 100 + v)
        y = tvf(src, 'bp', vow, 3.0, 256) + 0.4 * tvf(src, 'bp', vow * 2.4, 4.0, 256)
        gate_ = smoothstep(smooth_noise(n, 1.5, seed + 200 + v) * 3)
        out += stereo(y * gate_, r.uniform(-0.9, 0.9))
    out = lp(out, 2500, 2)
    out = reverb(out, 'theatre', 0.4, 150.0, None, tail=False)
    return fades(out / (rms(out) + 1e-9) * 0.05, 0.4, 0.4)


def crowd_stomp(count=60, *, vel=1.0, spread=0.03, seed=0, space='theatre'):
    """A crowd stomping once on a wooden floor (stereo): `count` feet within +-spread s: low thuds, floor creak,
    the room. Peak ~0.9 * vel."""
    r = np.random.default_rng(seed)
    n = ns(1.4)
    t = tt(n)
    out = np.zeros((n, 2))
    m = ns(0.3)
    u = tt(m)
    for k in range(count):
        o = 0.05 + r.normal(0, spread)
        f = r.uniform(55, 110)
        th = _sweep_sine(f * (1 + 0.5 * np.exp(-u / 0.01)), m) * np.exp(-u / 0.05) + lp(r.standard_normal(m), 600, 2) * np.exp(-u / 0.012) * 0.6
        place(out, th * r.uniform(0.5, 1.0), max(0.0, o), 1.0, r.uniform(-0.8, 0.8))
    boards = _metal_hit(n, 120, 700, 12, 0.08, seed + 1, False) * 0.1 * np.exp(-t / 0.1)
    out += stereo(boards)
    out = reverb(out, space, 0.3, 80.0, None, tail=False)
    return fades(peak_norm(out, 0.9 * vel), 0.0005, 0.2)


def big_thud(*, seed=0):
    """Something huge falls flat on a stage (stereo): sub boom, boards rattling, dust; the Roadie going down."""
    r = np.random.default_rng(seed)
    n = ns(2.0)
    t = tt(n)
    x = _sweep_sine(40 + 50 * np.exp(-t / 0.03), n) * np.exp(-t / 0.25) * 1.3
    x += lp(r.standard_normal(n), 500, 2) * np.exp(-t / 0.05) * 1.2
    x += _metal_hit(n, 100, 900, 16, 0.15, seed + 1, False) * 0.3
    rattle = bp(_impulses(n, 90, seed + 2, 0.8), 1500, 7000, 2) * np.exp(-t / 0.3) * 2.0
    y = reverb(x + rattle, 'theatre', 0.3, 60.0, None, tail=False)
    return fades(peak_norm(y, 0.95), 0.0005, 0.4)


def lights_on(*, seed=0):
    """Stage lights slam on (stereo): a heavy contactor CLUNK, then the rising hum of the dimmer racks."""
    r = np.random.default_rng(seed)
    n = ns(1.8)
    t = tt(n)
    clunk = _clack(n, r, (900.0, 1700.0, 2600.0), 0.05, 140.0) * np.exp(-t / 0.2)
    clunk += _sweep_sine(55 * (1 + np.exp(-t / 0.01)), n) * np.exp(-t / 0.08)
    hum = mains_hum(1.8, buzz=0.6, seed=seed)[:n] * smoothstep((t - 0.03) / 0.25) * 0.4
    y = stereo(clunk + hum)
    y = reverb(y, 'theatre', 0.25, 100.0, None, tail=False)
    return fades(peak_norm(y, 0.9), 0.0005, 0.3)


def mains_hum(dur, *, base=60.0, buzz=0.5, seed=0):
    """Mains hum (mono): base + harmonics; buzz 0..1 adds the odd-harmonic, rectified edge of a dirty ground loop
    through an amp."""
    n = ns(dur)
    t = tt(n)
    x = np.sin(2 * np.pi * base * t) + 0.5 * np.sin(2 * np.pi * 2 * base * t + 0.4) + 0.25 * np.sin(2 * np.pi * 3 * base * t)
    b = np.sign(np.sin(2 * np.pi * base * t + 0.2)) * np.abs(np.sin(2 * np.pi * base * t + 0.2)) ** 0.15
    x = x + buzz * bp(b, 200, 3500, 2) * 0.8
    return fades(x / (np.abs(x).max() + 1e-9) * 0.5, 0.01, 0.05)


def amp_power_on(*, hum_dur=1.5, seed=0):
    """An amp switched on (mono): the speaker's THUNK (cone pop), the standby click, then mains hum and a faint hiss
    rising behind it."""
    r = np.random.default_rng(seed)
    n = ns(0.3 + hum_dur)
    t = tt(n)
    pop = _sweep_sine(38 * (1 + 0.8 * np.exp(-t / 0.008)), n) * np.exp(-t / 0.07) * 1.4
    pop += bp(r.standard_normal(n), 300, 4000, 2) * np.exp(-t / 0.004) * 0.6
    click = np.zeros(n)
    place(click, _clack(ns(0.05), r, (3100.0, 4800.0), 0.006, 900.0) * 0.4, 0.0)
    hum = mains_hum(hum_dur + 0.3, buzz=0.7, seed=seed) * smoothstep((t - 0.05) / 0.3) * 0.35
    hiss = hp(r.standard_normal(n), 3000, 2) * 0.01 * smoothstep((t - 0.05) / 0.3)
    return fades(peak_norm(pop + click + hum + hiss, 0.9), 0.0003, 0.05)


def feedback(midi, dur, *, swell=0.8, preset='lead', from_note=None, seed=0):
    """Amp'd guitar feedback (mono): gtr_feedback() through amp(preset); the tone blooms in loudness over
    `swell` s (from about -24 dB) and sings."""
    y = amp(gtr_feedback(midi, dur, swell=swell, from_note=from_note, seed=seed), preset, gate_db=False)
    t = tt(len(y))
    return y * (0.06 + 0.94 * smoothstep(t / max(swell, 0.01)) ** 1.3)


def heartbeat_hit(vel=1.0, *, seed=0, gap=0.17):
    """One heartbeat (mono): LUB (deep thump ~50 Hz) then DUB (~70 Hz, softer) gap s later."""
    r = np.random.default_rng(seed)
    n = ns(gap + 0.35)
    out = np.zeros(n)
    for o, f, a, tau in ((0.0, 48.0, 1.0, 0.07), (gap, 66.0, 0.65, 0.05)):
        m = ns(0.25)
        u = tt(m)
        th = _sweep_sine(f * (1 + 0.4 * np.exp(-u / 0.015)), m) * np.exp(-u / tau) * np.minimum(1, u / 0.006)
        th += lp(r.standard_normal(m), 180, 2) * np.exp(-u / 0.02) * 0.3
        place(out, th * a, o)
    return fades(out / (np.abs(out).max() + 1e-9) * 0.9 * vel, 0.002, 0.05)


def heartbeat(times, dur, *, vel=1.0, seed=0):
    """Heartbeats (mono) at the given onset times (s), over dur s."""
    out = np.zeros(ns(dur) + ns(0.6))
    for k, t0 in enumerate(times):
        place(out, heartbeat_hit(vel, seed=seed + k % 3), t0)
    return out[:ns(dur)]


def room_tone(dur, kind='room', *, seed=0):
    """Ambience beds (stereo, quiet, ~-40 dBFS RMS): 'room' (air + faint hum), 'theatre' (a big empty hall's air,
    a far creak now and then), 'wind' (gusting, whistling wind), 'van' (engine rumble + road), 'street' (night
    city wash), 'roof' (wind + far city)."""
    n = ns(dur)
    out = np.zeros((n, 2))
    for ch in range(2):
        s_ = seed * 5 + ch
        if kind == 'room':
            y = lp(pink(n, s_), 3000, 2) * 0.4 + mains_hum(dur, base=60, buzz=0.1)[:n] * 0.05
        elif kind == 'theatre':
            y = lp(pink(n, s_), 1500, 2) * 0.6 + lp(brown(n, s_ + 1), 80, 2) * 0.5
            cr = _impulses(n, 0.3, s_ + 2, 0.3)
            y += _resonate(cr, 330.0, 3.0) * 0.4
        elif kind in ('wind', 'roof'):
            g = 0.6 + 0.4 * smooth_noise(n, 0.25, seed + 9)
            fc = 500 + 400 * smooth_noise(n, 0.15, s_ + 3)
            y = tvf(pink(n, s_), 'bp', fc, 2.5, 256) * g + lp(brown(n, s_ + 4), 200, 2) * 0.4 * g
            if kind == 'roof':
                y += lp(pink(n, s_ + 5), 700, 2) * 0.25
        elif kind == 'van':
            eng = _engine_pulses(38.0 * (1 + 0.02 * smooth_noise(n, 0.4, seed)), n, seed, 0.2)
            eng = lp(signal.lfilter([1.0], [1, -0.98], eng), 300, 2) * 0.1
            y = eng + lp(pink(n, s_), 900, 2) * 0.5
        elif kind == 'street':
            y = lp(pink(n, s_), 2000, 2) * 0.5 + lp(brown(n, s_ + 6), 150, 2) * 0.4
        else:
            raise ValueError(kind)
        out[:, ch] = y
    out = out / (rms(out) + 1e-12) * 0.01
    return fades(out, 0.3, 0.3)


def cassette(x, *, wow=0.35, flutter=0.15, hiss=0.02, dropouts=2, band=(90.0, 7000.0), drive=0.4, cut_click=True,
             seed=0):
    """Mono cassette-bootleg processor: band-limit, tape saturation, wow (0.6 Hz) and flutter (9 Hz) in % of
    speed, hiss level, `dropouts` brief level / treble dips, and a tape-cut click + dead air at the end
    (cut_click). Returns mono of the same length."""
    r = np.random.default_rng(seed)
    m = mono(x)
    n = len(m)
    t = tt(n)
    y = bp(m, band[0], band[1], 2)
    y = saturate(y / (np.abs(y).max() + 1e-9), 1.0 + 3.0 * drive, 0.08) * 0.8
    sp = 1.0 + wow / 100 * (np.sin(2 * np.pi * 0.6 * t) + 0.3 * smooth_noise(n, 0.8, seed)) + flutter / 100 * np.sin(2 * np.pi * 9.1 * t)
    d = np.cumsum(1.0 - sp)
    d = d - d.min() + 2.0
    y = frac_delay(y, d)
    for _ in range(dropouts):
        c = r.uniform(0.1, 0.9) * n / SR
        w = r.uniform(0.03, 0.12)
        g = 1.0 - 0.75 * np.exp(-((t - c) / w) ** 2)
        y = y * g + lp(y, 2000, 1) * (1 - g) * 0.5
    y = y + hiss * hp(pink(n, seed + 1), 2500, 1)
    y = shelf(y, 120.0, 2.0, 'low')
    if cut_click:
        k = ns(0.012)
        y[-k:] = 0.0
        ck = bp(r.standard_normal(ns(0.006)), 500, 6000, 2) * 0.8
        place(y, ck, n - k)
    pk_in = np.abs(m).max()
    return y * (min(1.0, 0.95 / (np.abs(y).max() + 1e-12)) if pk_in > 0 else 1.0)


def fire_alarm_bell(dur, *, rate=17.0, seed=0):
    """Electromechanical fire-alarm bell (mono): a clapper hitting a steel gong ~17 times a second (inharmonic
    partials around 1.2-6 kHz, overlapping into a continuous clangour) with the motor buzz."""
    n = ns(dur)
    imp = _engine_pulses(rate * (1 + 0.01 * smooth_noise(n, 2, seed)), n, seed, 0.1)
    bell = np.zeros(n)
    for ratio, a, tau in ((1.0, 1.0, 0.25), (2.32, 0.6, 0.18), (3.86, 0.45, 0.12), (5.41, 0.3, 0.08), (6.9, 0.2, 0.06)):
        f = 1180.0 * ratio
        if f < 16000:
            res = signal.lfilter([1.0], [1, -2 * np.exp(-1 / (tau * SR)) * np.cos(2 * np.pi * f / SR), np.exp(-2 / (tau * SR))], imp)
            bell += a * res / (np.abs(res).max() + 1e-9)
    buzz = bp(saw(rate * 2, n), 200, 2000, 1) * 0.05
    return fades(peak_norm(bell + buzz, 0.8), 0.005, 0.05)


def reverse_beep(midi='B4', dur=0.45, *, seed=0, space='street'):
    """A truck's reversing beeper (stereo): a hard-gated piezo tone on `midi` (square-ish, small horn), the street
    slap after it."""
    n = ns(dur + 0.6)
    t = tt(n)
    f = float(hz(note(midi)))
    x = (pulse(f, n, 0.0, 0.5) * 0.7 + sine(f, n) * 0.5) * (t < dur)
    x = bp(x, 400, 5000, 2)
    x = fades(x, 0.004, 0.0)
    x[ns(dur):ns(dur) + ns(0.004)] *= np.linspace(1, 0, ns(0.004))
    y = reverb(x, space, 0.3, 200.0, None, tail=False)
    return peak_norm(y, 0.8)


def firework_boom(*, crackle=True, whistle=False, seed=0):
    """A firework (stereo): optional launch whistle, the BOOM (sub thump + rumbling echoes off buildings), then a
    shimmering crackle of sparks."""
    r = np.random.default_rng(seed)
    n = ns(3.5)
    out = np.zeros((n, 2))
    t0 = 0.0
    if whistle:
        m = ns(0.9)
        u = tt(m)
        w = sine(1800 + 1400 * u / 0.9, m) * smoothstep(u / 0.1) * 0.15
        place(out, w, 0.0, 1.0, -0.3)
        t0 = 0.9
    m = ns(2.5)
    u = tt(m)
    boom = _sweep_sine(45 * (1 + 1.2 * np.exp(-u / 0.015)), m) * np.exp(-u / 0.25) * 1.2
    boom += lp(r.standard_normal(m), 350, 2) * np.exp(-u / 0.08) * 1.3
    boom += hp(r.standard_normal(m), 1000, 2) * np.exp(-u / 0.006) * 0.8
    place(out, boom, t0)
    if crackle:
        m = ns(2.2)
        u = tt(m)
        cr = np.zeros((m, 2))
        for ch in range(2):
            cr[:, ch] = bp(_impulses(m, 220, seed + 3 + ch, 1.0), 1500, 11000, 2) * 4.0 * np.exp(-u / 0.7) * smoothstep(u / 0.2)
        place(out, cr * 0.5, t0 + 0.35)
    out = reverb(out, 'street', 0.4, 60.0, None, tail=False)
    return fades(peak_norm(out, 0.95), 0.0005, 0.4)


def film_burn(dur=0.8, *, seed=0):
    """Film jamming and burning in the projector gate (stereo): the 24 fps claw chatter slowing and catching,
    a hiss-and-bubble of burning acetate, pops; ends dry."""
    n = ns(dur)
    t = tt(n)
    rate = 24.0 * (1 - 0.7 * smoothstep(t / dur))
    claw = _engine_pulses(rate, n, seed, 0.2)
    claw = signal.lfilter([1.0], [1, -0.9], claw)
    claw = bp(claw, 800, 6000, 2) * 0.5
    burn = bp(pink(n, seed + 1), 1500, 9000, 2) * 0.12 * smoothstep(t / 0.15) * (1 + 0.6 * smooth_noise(n, 25, seed + 2))
    pops = bp(_impulses(n, 50, seed + 3, 1.0), 900, 10000, 2) * 2.5 * smoothstep(t / 0.1)
    y = np.stack([claw + burn + pops, frac_delay(claw + burn, 5.0) + pops * 0.7], axis=1)
    return fades(peak_norm(y, 0.8), 0.003, 0.06)


def hud_chirp(*, seed=0, up=True):
    """A thermal-camera HUD chirp (mono): two quick digital blips (2.2 kHz -> 3.3 kHz), slightly bit-crushed."""
    n = ns(0.16)
    t = tt(n)
    f1, f2 = (2200.0, 3300.0) if up else (3300.0, 2200.0)
    x = pulse(f1, n, 0.0, 0.5) * ((t > 0.0) & (t < 0.045)) + pulse(f2, n, 0.0, 0.5) * ((t > 0.06) & (t < 0.12))
    x = np.round(lp(x, 7000, 2) * 12) / 12
    return fades(x * 0.35, 0.001, 0.01)


def thermal_hum(dur, *, seed=0):
    """A thermal camera feed's electronic bed (stereo, quiet): 60 Hz hum, a faint 7.8 kHz sensor whine, the
    cooler's fan hiss, the cryocooler's slow pulse."""
    r = np.random.default_rng(seed)
    n = ns(dur)
    t = tt(n)
    hum = mains_hum(dur, base=60.0, buzz=0.15, seed=seed)[:n] * 0.4
    whine = sine(7800.0 * (1 + 0.0008 * smooth_noise(n, 0.3, seed)), n) * 0.015
    fan = bp(pink(n, seed + 1), 300, 3000, 2) * 0.05
    cool = lp(r.standard_normal(n), 120, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * 1.1 * t)) * 0.2
    x = hum + whine + fan + cool
    y = np.stack([x, frac_delay(x, 17.0)], axis=1)
    return fades(y / (rms(y) + 1e-9) * 0.02, 0.2, 0.2)


def pill_rattle(dur=0.25, *, energy=1.0, seed=0):
    """One shake of a plastic pill bottle (mono): a burst of tiny hard clicks (pill on pill, pill on wall) with the
    bottle's hollow plastic resonance."""
    n = ns(dur)
    t = tt(n)
    env = np.exp(-((t - dur * 0.3) / (dur * 0.22)) ** 2)
    imp = _impulses(n, 900 * energy, seed, 0.7, env)
    clicks = bp(imp, 2500, 11000, 2) * 2.0
    body = _resonate(imp, 1450.0, 6.0) * 0.6 + _resonate(imp, 3100.0, 8.0) * 0.4
    return fades(peak_norm(clicks + body, 0.8) * energy, 0.001, 0.02)


def pill_shaker(times, dur, *, accents=None, seed=0):
    """Pill-bottle shaker part (mono): one shake at each onset time (s); accents = optional list of 0..1 levels
    (default: alternating strong / weak like a real shaker)."""
    out = np.zeros(ns(dur) + ns(0.4))
    for k, t0 in enumerate(times):
        a = accents[k] if accents is not None else (1.0 if k % 2 == 0 else 0.6)
        place(out, pill_rattle(0.11, energy=a, seed=seed + k % 5), t0 - 0.02)
    return out[:ns(dur)]


# =====================================================================================================
# demo / self-test:  python3 tools/ns_synth.py --demo DIR
# =====================================================================================================

def pitch_track(x, hop=0.01, fmin=70.0, fmax=1600.0, win=0.04):
    """Simple normalised-autocorrelation pitch tracker (mono): (times, MIDI or nan)."""
    m = mono(x)
    W = int(win * SR)
    H = int(hop * SR)
    lo, hi = int(SR / fmax), int(SR / fmin)
    ts, ps = [], []
    for i in range(0, len(m) - W - hi, H):
        seg = m[i:i + W + hi]
        a = seg[:W]
        if rms(a) < 1e-3:
            ts.append(i / SR); ps.append(np.nan); continue
        c = np.correlate(seg, a, 'valid')[:hi + 1]
        e = np.sqrt(np.sum(a * a) * np.array([np.sum(seg[k:k + W] ** 2) for k in range(hi + 1)]) + 1e-12)
        nc = c / e
        best = float(np.max(nc[lo:hi]))
        cand = np.nonzero((nc[lo + 1:hi - 1] >= 0.9 * best) & (nc[lo + 1:hi - 1] >= nc[lo:hi - 2]) &
                          (nc[lo + 1:hi - 1] >= nc[lo + 2:hi]))[0]
        k = lo + 1 + int(cand[0]) if len(cand) else lo + int(np.argmax(nc[lo:hi]))   # shortest strong lag: no octave errors
        if nc[k] < 0.6:
            ts.append(i / SR); ps.append(np.nan); continue
        if 1 <= k < hi:
            y0, y1, y2 = nc[k - 1], nc[k], nc[k + 1]
            d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-12)
        else:
            d = 0.0
        f = SR / (k + d)
        ts.append(i / SR)
        ps.append(69 + 12 * np.log2(f / 440.0))
    return np.array(ts), np.array(ps)


def pitch_png(ts, ps, path, title, target=None):
    from PIL import Image, ImageDraw
    W_, H_ = 1000, 360
    im = Image.new('RGB', (W_, H_), (14, 14, 20))
    d = ImageDraw.Draw(im)
    ok = np.isfinite(ps)
    lo = np.floor(np.nanmin(ps[ok]) - 2) if ok.any() else 40
    hi = np.ceil(np.nanmax(ps[ok]) + 2) if ok.any() else 90
    T = ts[-1] if len(ts) else 1
    fx = lambda t: 40 + t / T * (W_ - 50)
    fy = lambda p: H_ - 24 - (p - lo) / (hi - lo) * (H_ - 50)
    for mm in range(int(lo), int(hi) + 1):
        if mm % 12 in (0, 4, 7, 11, 2, 5, 9):
            d.line([(40, fy(mm)), (W_ - 10, fy(mm))], fill=(32, 32, 44) if mm % 12 else (60, 60, 80))
        if mm % 12 == 0:
            d.text((4, fy(mm) - 6), f'C{mm // 12 - 1}', fill=(170, 170, 180))
    if target is not None:
        for (t0, t1, p) in target:
            d.line([(fx(t0), fy(p)), (fx(t1), fy(p))], fill=(80, 160, 255), width=3)
    for t, p in zip(ts, ps):
        if np.isfinite(p):
            d.rectangle([fx(t) - 1, fy(p) - 1, fx(t) + 1, fy(p) + 1], fill=(255, 160, 60))
    d.text((40, 4), title, fill=(230, 230, 230))
    im.save(str(path))


def _demo_main_riff(bar0, gtr, bs, hits, crash_first=True):
    """The MAIN riff (SPEC 10.8): A: 0 E5(2) 2 x 3 x 4 G5(2) 6 x 7 x 8 B5(4, acc) 12 x 13 x 14 A5 (tied) |
    B: 0-3 A5 rings 4-7 x 8 Bb5(2) 10 A5(2) 12 G5(2) 14 F#5(2)."""
    st = STEP
    A = [(0, 'E5', 2), (2, 'x', 1), (3, 'x', 1), (4, 'G5', 2), (6, 'x', 1), (7, 'x', 1), (8, 'B5', 4, 1), (12, 'x', 1),
         (13, 'x', 1), (14, 'A5', 6)]
    Bp = [(4, 'x', 1), (5, 'x', 1), (6, 'x', 1), (7, 'x', 1), (8, 'Bb5', 2), (10, 'A5', 2), (12, 'G5', 2), (14, 'F#5', 2)]
    for bar, pat in ((bar0, A), (bar0 + 1, Bp)):
        for it in pat:
            s_, c, d_ = it[0], it[1], it[2]
            t = (bar * 16 + s_) * st
            if c == 'x':
                gtr.append(dict(t=t, dur=d_ * st, midi=40, palm=0.85, vel=0.85))
                bs.append(dict(t=t, dur=d_ * st, midi=28, palm=0.6, vel=0.8))
            else:
                gtr.append(dict(t=t, dur=d_ * st, chord=c, vel=1.0 if len(it) > 3 else 0.92))
                bs.append(dict(t=t, dur=d_ * st, midi=chord_notes(c)[0] - 12, vel=0.95))
                hits.append((t, 'kick', 1.0 if len(it) > 3 else 0.9))
    for bar in (bar0, bar0 + 1):
        for s_ in range(0, 16, 2):
            hits.append(((bar * 16 + s_) * st, 'hat', 0.85 if s_ % 4 == 0 else 0.65))
        for s_ in (4, 12):
            hits.append(((bar * 16 + s_) * st, 'snare', 1.0))
    if crash_first:
        hits.append((bar0 * 16 * st, 'crash', 1.0))


def demo(out_dir):
    """Render the test set into out_dir: band riff (+ stems), verse gallop, chorus chords, lead, solo, clean
    arpeggios, bass lick, organ, music box, brass, ding, kit tour, every FX; spectrogram PNGs, a lead pitch-track
    PNG and report.json with objective metrics for every file."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rep = {}
    t_start = time.time()

    def save(name, x, spec=True, grid=None, norm=None):
        x = np.asarray(x, float)
        if norm:
            x = peak_norm(x, norm)
        write_wav(out / f'{name}.wav', x)
        rep[name] = metrics(x)
        if spec:
            spectrogram_png(x, out / f'{name}.png', name, grid_s=grid)
        log('wrote', name, f"lufs {rep[name]['lufs']} peak {rep[name]['peak_db']} crest {rep[name]['crest_db']}")

    st = STEP
    # ---- 1. the main riff, 4 bars, full band ----------------------------------------------------------------
    gtr, bs, hits = [], [], []
    _demo_main_riff(0, gtr, bs, hits)
    _demo_main_riff(2, gtr, bs, hits, crash_first=True)
    hits += [((3 * 16 + 14) * st, 'tom2', 0.9), ((3 * 16 + 15) * st, 'tom3', 0.95)]
    dur = 4 * BAR + 1.6
    g = double_track(gtr, dur, 'rhythm')
    b = bass(bs, dur)
    d = drum_track(hits, dur)
    band = 0.85 * hp(g, 70.0, 2) + stereo(hp(b, 35.0, 2)) * 0.9 + 0.8 * d
    save('riff', master(band, -11.0, -1.0), grid=BEAT)
    save('riff_guitars', g, grid=BEAT)
    save('riff_bass', b, grid=BEAT)
    save('riff_drums', d, grid=BEAT)
    spectrum_png([('guitars', g, (255, 150, 60)), ('bass', b, (120, 200, 255)), ('drums', d, (200, 255, 120)),
                  ('mix', band, (255, 255, 255))], out / 'riff_ltas.png', 'riff: long-term spectra')

    # ---- 2. verse gallop (palm-muted 0,2,3 per beat, open accent on step 0; bar 2 rests 12-15) ----------
    gtr, bs, hits = [], [], []
    roots = [('E5', 40), ('E5', 40), ('G5', 43), ('G5', 43)]
    for bar, (ch, r_) in enumerate(roots):
        for s_ in range(16):
            if bar % 2 == 1 and s_ >= 12:
                continue
            if s_ % 4 in (0, 2, 3):
                t = (bar * 16 + s_) * st
                if s_ == 0:
                    gtr.append(dict(t=t, dur=0.2, chord=ch, vel=1.0))
                else:
                    gtr.append(dict(t=t, dur=0.1, midi=r_, palm=0.9, vel=0.8 if s_ % 4 else 0.9))
                bs.append(dict(t=t, dur=0.1, midi=r_ - 12, palm=0.5))
        hits += [((bar * 16 + s_) * st, 'kick', 0.9) for s_ in (0, 6, 8)]
        hits += [((bar * 16 + s_) * st, 'snare', 1.0) for s_ in (4, 12)]
        hits += [((bar * 16 + s_) * st, 'hat', 0.7) for s_ in range(0, 16, 2)]
    dur = 4 * BAR + 1.0
    v = 0.85 * hp(double_track(gtr, dur, 'rhythm'), 70.0) + stereo(bass(bs, dur)) * 0.85 + 0.8 * drum_track(hits, dur)
    save('verse_gallop', master(v, -11.0, -1.0), grid=BEAT)

    # ---- 3. chorus: ringing chords C5 D5 Em Em, crash every bar, 8th bass ------------------------------
    gtr, bs, hits = [], [], []
    for bar, ch in enumerate(['C5', 'D5', 'Em', 'Em']):
        t = bar * BAR
        gtr.append(dict(t=t, dur=BAR, chord=ch, vel=1.0, voicing='power' if ch.endswith('5') else 'open', ring=True))
        r_ = chord_notes(ch)[0] - 12
        bs += [dict(t=t + k * 2 * st, dur=0.2, midi=r_) for k in range(8)]
        hits += [(t, 'crash', 1.0), (t, 'kick', 1.0), (t + 6 * st, 'kick', 0.9), (t + 8 * st, 'kick', 0.9),
                 (t + 4 * st, 'snare', 1.0), (t + 12 * st, 'snare', 1.0)]
        hits += [(t + k * 2 * st, 'ride', 0.6) for k in range(1, 8)]
    dur = 4 * BAR + 2.0
    c = 0.85 * hp(double_track(gtr, dur, 'rhythm'), 70.0) + stereo(bass(bs, dur)) * 0.85 + 0.8 * drum_track(hits, dur)
    save('chorus_chords', master(c, -11.0, -1.0), grid=BEAT)

    # ---- 4. lead line: hook an octave above the vocal (G4 G4 B4 A4), bends, vibrato, slide, pinch squeal ----
    q = BEAT
    lead_notes = [
        dict(t=0.0, dur=q, midi='G4'), dict(t=q, dur=q, midi='G4'), dict(t=2 * q, dur=q, midi='B4'),
        dict(t=3 * q, dur=q * 2, midi='A4', vib=0.3),
        dict(t=5 * q, dur=q * 1.5, midi='A4', bend=2.0, bend_t=0.12, vib=0.25, vib_delay=0.25),
        dict(t=6.5 * q, dur=q * 0.5, midi='G4', kind='hammer'),
        dict(t=7 * q, dur=q, midi='E4', kind='slide', slide=0.09),
        dict(t=8 * q, dur=q * 3, midi='E4', pinch=4, dive=-14.0, dive_t=0.9),
        dict(t=11.5 * q, dur=q * 2.5, midi='B4', bend=1.0, pre_bend=False, vib=0.4, vib_delay=0.2),
    ]
    L = lead(lead_notes, 14 * q + 1.0, delay_s=3 * STEP, delay_mix=0.2)
    save('lead', reverb(L, 'hall', 0.15, 200.0, None, tail=False), grid=BEAT)
    di = lead_line(lead_notes, 14 * q + 1.0)
    ts, ps = pitch_track(di, fmin=150.0, fmax=1400.0)
    tgt = [(n_['t'], n_['t'] + n_['dur'], float(note(n_['midi'])) + 12 * np.log2(n_.get('pinch', 1))) for n_ in lead_notes]
    pitch_png(ts, ps, out / 'lead_pitch.png', 'lead DI pitch track (orange) vs written notes (blue): bends, vibrato, slide, pinch dive', tgt)

    # ---- 5. solo run over a backing: 16ths up to D6, a tapped B7 arpeggio, a bend to B5 with vibrato -------
    s16 = STEP
    solo_notes = []
    run = ['E5', 'F#5', 'G5', 'A5', 'B5', 'C6', 'B5', 'A5', 'G5', 'A5', 'B5', 'C6', 'C#6', 'D6']
    for i, m in enumerate(run):
        solo_notes.append(dict(t=i * s16, dur=s16, midi=m, kind='pick' if i % 2 == 0 else 'hammer', vel=0.95))
    t0 = len(run) * s16
    solo_notes.append(dict(t=t0, dur=2 * s16, midi='D6', vib=0.35, vib_delay=0.05))
    arp = ['B4', 'D#5', 'F#5', 'A5', 'B5', 'A5', 'F#5', 'D#5'] * 2
    t1 = t0 + 2 * s16
    for i, m in enumerate(arp):
        solo_notes.append(dict(t=t1 + i * s16, dur=s16, midi=m, kind='tap' if m == 'B5' else 'hammer', vel=0.85))
    t2 = t1 + len(arp) * s16
    solo_notes.append(dict(t=t2, dur=8 * s16, midi='A5', bend=2.0, bend_t=0.15, vib=0.45, vib_delay=0.3))
    sdur = t2 + 8 * s16 + 1.2
    sl = lead(solo_notes, sdur, delay_s=3 * STEP, delay_mix=0.18)
    gtr, bs, hits = [], [], []
    for bar in range(int(np.ceil(sdur / BAR))):
        ch = ['E5', 'C5', 'D5', 'B5'][bar % 4]
        for k in range(8):
            t = bar * BAR + k * 2 * st
            gtr.append(dict(t=t, dur=0.2, chord=ch, vel=0.9, palm=0.5 if k % 2 else 0.0))
            bs.append(dict(t=t, dur=0.2, midi=chord_notes(ch)[0] - 12))
        hits += [(bar * BAR, 'crash', 1.0)] + [(bar * BAR + k * 2 * st, 'kick', 0.9) for k in range(8)]
        hits += [(bar * BAR + s_ * st, 'snare', 1.0) for s_ in (4, 12)] + [(bar * BAR + k * 2 * st, 'ride', 0.6) for k in range(8)]
    back = 0.65 * hp(double_track(gtr, sdur, 'rhythm'), 70.0) + stereo(bass(bs, sdur)) * 0.75 + 0.75 * drum_track(hits, sdur)
    save('solo', master(back + 1.1 * reverb(sl, 'hall', 0.15, 200, None, tail=False), -11.0, -1.0), grid=BEAT)

    # ---- 6. safe-room clean arpeggios Em - Cmaj7 - Am(add9) - B7 (8ths, let ring), chorus + room ----------
    arps = {'Em': [40, 47, 52, 55, 59, 55, 52, 47], 'Cmaj7': [48, 52, 55, 59, 64, 59, 55, 52],
            'Am(add9)': [45, 52, 57, 59, 64, 59, 57, 52], 'B7': [47, 51, 57, 59, 66, 59, 57, 51]}
    ev = []
    for bar, ch in enumerate(arps):
        for k, m in enumerate(arps[ch]):
            ev.append(dict(t=bar * BAR + k * 2 * st, dur=1.0, notes=[m], vel=0.7 if k % 2 else 0.8, ring=True, bright=0.55))
    di = gtr_track(ev, 4 * BAR + 2.0, seed=4)
    cl = amp(di, 'clean')
    cl = reverb(chorus(cl, 8.0, 2.5, 0.5, 0.45), 'bigroom', 0.3, 150, None, tail=False)
    save('clean_arps', cl, grid=BEAT, norm=0.8)

    # ---- 7. Noodle's bass lick: E2 G2 A2 B2, the B buzzing and sagging a quarter-tone ---------------------
    lick = [dict(t=0.0, dur=0.2, midi='E2'), dict(t=0.2, dur=0.2, midi='G2'), dict(t=0.4, dur=0.2, midi='A2'),
            dict(t=0.6, dur=1.0, midi='B2', sag=50.0, buzz=0.7)]
    save('bass_lick', stereo(bass_amp(bass_track(lick, 2.0), 0.7, 0.6)), norm=0.8)

    # ---- 8. keys and colour -------------------------------------------------------------------------------
    save('organ_drone', organ(['E2', 'B2', 'F#3'], 6.0, registration='horror', room=0.2), norm=0.8)
    save('organ_pad_fast', organ(['E3', 'G3', 'B3', 'E4'], 4.0, registration='pad', leslie_speed='fast'), norm=0.8)
    mbe = [dict(t=i * 0.8, midi=m) for i, m in enumerate(['G5', 'G5', 'B5', 'A5'])]
    ts_ = slowing_times(4, 3.2, 0.8, 1.22)
    mbe += [dict(t=t, midi=m) for t, m in zip(ts_, ['B5', 'B5', 'C6', 'B5'])]
    save('music_box_rundown', music_box_line(mbe, 9.0, slow_from=3.2, stop_at=ts_[-1] + 1.3), norm=0.8)
    save('brass_tritone', brass_stinger())
    save('bwaam', bwaam())
    save('ding_B5', cymbal_ding('B5'))

    # ---- 9. kit tour and a tom fill (bats too) --------------------------------------------------------------
    tour = []
    t = 0.0
    for p_ in ['kick', 'snare', 'ghost', 'rim', 'xstick', 'stick', 'hat', 'hat_open', 'hat_pedal', 'tom1', 'tom2', 'tom3',
               'bat_tom1', 'bat_tom3', 'case', 'ride', 'bell', 'splash', 'china', 'crash']:
        tour.append((t, p_, 0.95))
        t += 0.6 if p_ not in ('ride', 'bell', 'splash', 'china') else 1.2
    save('kit_tour', drum_track(tour, t + 3.0, humanize=0.0), grid=0.6)
    fill = []
    for k in range(16):
        tm = k * st
        fill.append((tm, ['tom1', 'tom1', 'tom2', 'tom2', 'tom3', 'tom3', 'snare', 'snare'][k // 2], 0.75 + 0.25 * (k % 2)))
    fill += [(16 * st, 'crash', 1.0), (16 * st, 'kick', 1.0)]
    for k in range(8):
        fill.append((2.4 + k * 2 * st, 'case' if k % 2 else 'bat_tom3', 0.9))
    save('drum_fill', drum_track(fill, 4.6), grid=BEAT)

    # ---- 10. FX -----------------------------------------------------------------------------------------------
    clip = stereo(lp(saw(hz(40), ns(3.0)) * 0.3, 2000))
    boot = cassette(clip[:, 0] * 2 + fire_alarm_bell(3.0)[:ns(3.0)] * 0.2, seed=2)
    fx = [
        ('fx_rain', rain_bed(5.0)), ('fx_rain_in_van', rain_bed(5.0, inside=True)),
        ('fx_thunder_near', thunder(5.0, 0.15)), ('fx_thunder_far', thunder(5.0, 0.8, seed=3)),
        ('fx_radio_static', radio_static(3.0)), ('fx_radio_tune', radio_tune(1.5, catches=[(0.6, boot[:ns(0.5)], 0.5)])),
        ('fx_car_skid', car_skid()), ('fx_car_crash', car_crash()), ('fx_bonk', np.concatenate([body_bonk(), np.zeros(ns(0.25)), body_bonk(1.3, seed=2)])),
        ('fx_shotgun', shotgun()), ('fx_pump', shotgun_pump()), ('fx_reload', shotgun_reload()), ('fx_shell_tink', shell_tink()),
        ('fx_door_slam', door_slam()), ('fx_door_pound', door_pound()), ('fx_door_burst', door_burst()),
        ('fx_knocks', _demo_knocks()), ('fx_pills', pill_shaker([i * st for i in range(16)], 2.0)),
        ('fx_spark_zap', spark_zap()), ('fx_flashlight', flashlight_click()),
        ('fx_tape_stop', tape_stop(g[:ns(3.2)], 1.2, 0.8)),
        ('fx_gen_pull_C3', generator_pull('C3')), ('fx_gen_pull_D#3_backfire', generator_pull('D#3', 'backfire')),
        ('fx_gen_catch_idle', np.concatenate([generator_catch('E2', 2.0), generator_idle(3.0, 'E2')])),
        ('fx_pyro', pyro_whoosh()), ('fx_fire', fire(3.0)), ('fx_frisbee', frisbee_whoosh()),
        ('fx_helicopter', helicopter(4.0, fade_in=1.0)), ('fx_helicopter_muffled', helicopter(4.0, muffled=True)),
        ('fx_applause_distant', applause(6.0)), ('fx_thermal_hum', thermal_hum(3.0)), ('fx_heartbeat', heartbeat([0, 0.8, 1.6, 2.4], 3.2)),
        ('fx_room_tone', room_tone(3.0)), ('fx_wind', room_tone(3.0, 'wind')), ('fx_theatre', room_tone(3.0, 'theatre')),
        ('fx_cassette_bootleg', boot), ('fx_fire_alarm', fire_alarm_bell(2.0)), ('fx_reverse_beep_B4', _demo_beeps()),
        ('fx_amp_on', amp_power_on()), ('fx_feedback_E5', feedback('E5', 3.0, swell=1.0)), ('fx_crowd_stomp', crowd_stomp()),
        ('fx_bat_case', mix(*[pad_to(np.concatenate([np.zeros(ns(0.4 * k)), bat_on_case(0.9, k)]), ns(2.0)) for k in range(4)])),
        ('fx_fireworks', firework_boom(whistle=True)), ('fx_film_burn', film_burn()), ('fx_hud_chirp', hud_chirp()),
        ('fx_lights_on', lights_on()), ('fx_big_thud', big_thud()), ('fx_crowd_murmur', crowd_murmur(3.0, size=24)),
        ('fx_mains_hum', mains_hum(2.0)),
    ]
    for name, x in fx:
        save(name, x, spec=True)
    rep['_render_seconds'] = round(time.time() - t_start, 1)
    (out / 'report.json').write_text(json.dumps(rep, indent=1))
    log('demo done in', rep['_render_seconds'], 's ->', out)
    return rep


def _demo_knocks():
    """Shave-and-a-haircut from outside (beats 0, 1, 1.5, 2, 3), then two answering knocks."""
    out = np.zeros(ns(3.4))
    for k, b_ in enumerate((0, 1, 1.5, 2, 3)):
        place(out, door_knock(seed=k, hard=0.8), b_ * BEAT)
    for k, b_ in enumerate((5, 5.5)):
        place(out, door_knock(seed=10 + k, hard=1.0) * 1.2, b_ * BEAT)
    return out


def _demo_beeps():
    out = np.zeros((ns(2.0), 2))
    for k in range(3):
        place(out, reverse_beep('B4', 0.25), k * BEAT)
    return out


def main():
    ap = argparse.ArgumentParser(description='NO SURVIVORS instrument + DSP library (import it); --demo renders tests.')
    ap.add_argument('--demo', metavar='DIR', help='render the test set (WAVs, spectrogram PNGs, report.json) into DIR')
    a = ap.parse_args()
    if a.demo:
        demo(a.demo)
    else:
        ap.print_help()


if __name__ == '__main__':
    main()
