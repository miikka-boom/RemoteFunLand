#!/usr/bin/env python3
"""L'Amor che Morde: the singers, the orchestra and the house, synthesised with numpy and scipy.

tools/amor_che_morde.py composes the opera and renders it with these instruments.

Singing is additive: every harmonic of the sung pitch gets its amplitude from a five-formant
envelope (the FOF tables for soprano, alto, tenor and bass), evaluated every 128 samples, so
vowels glide into each other and vibrato sweeps the harmonics through the formants the way a
real voice does. Syllables are written in Italian or Church Latin and turned into phones;
consonants are voicing dips, nasal and liquid formants, frication and bursts shaped in the STFT
domain, and the breath noise follows the glottal cycle. A 'zombie' amount adds sub-harmonic
growl (period doubling), rasp, scoops, drift and a darker, longer vocal tract.

The orchestra is PolyBLEP string sections through short body impulse responses, additive
winds and brass whose brightness follows the dynamic, modal timpani and bells, plucked harp
and pizzicato, an additive organ, and the house: murmur, tuning, applause, coughs, thunder.
"""
import numpy as np
from scipy import signal

SR = 44100
HOP = 128                      # control rate for the voice: one frame every 2.9 ms
FR = SR / HOP


def m2f(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def dbl(x):
    return 10.0 ** (np.asarray(x, dtype=float) / 20.0)


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def slow_noise(n, rate_frames, rng, order=2):
    """Smooth random curve (unit-ish std) of n samples whose features are about rate_frames apart."""
    k = max(2, int(n / max(rate_frames, 1.0)) + 3)
    pts = rng.standard_normal(k)
    x = np.linspace(0, k - 1.0001, n)
    i = x.astype(int)
    f = x - i
    if order == 1:
        return pts[i] * (1 - f) + pts[i + 1] * f
    s = f * f * (3 - 2 * f)
    return pts[i] * (1 - s) + pts[i + 1] * s


def moving_avg(x, w, axis=-1):
    """Centred moving average (w frames) along axis, edges held."""
    w = int(max(1, w))
    if w <= 1:
        return x
    k = np.ones(w) / w
    pad = [(0, 0)] * x.ndim
    pad[axis] = (w // 2, w - 1 - w // 2)
    xp = np.pad(x, pad, mode='edge')
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), axis, xp)


# =====================================================================================
# voice: formant tables
# =====================================================================================

# FOF tables (CHANT): formant frequency (Hz), amplitude (dB), bandwidth (Hz) for a e i o u.
FOF = {
    'S': {'a': ((800, 1150, 2900, 3900, 4950), (0, -6, -32, -20, -50), (80, 90, 120, 130, 140)),
          'e': ((350, 2000, 2800, 3600, 4950), (0, -20, -15, -40, -56), (60, 100, 120, 150, 200)),
          'i': ((270, 2140, 2950, 3900, 4950), (0, -12, -26, -26, -44), (60, 90, 100, 120, 120)),
          'o': ((450, 800, 2830, 3800, 4950), (0, -11, -22, -22, -50), (70, 80, 100, 130, 135)),
          'u': ((325, 700, 2700, 3800, 4950), (0, -16, -35, -40, -60), (50, 60, 170, 180, 200))},
    'A': {'a': ((800, 1150, 2800, 3500, 4950), (0, -4, -20, -36, -60), (80, 90, 120, 130, 140)),
          'e': ((400, 1600, 2700, 3300, 4950), (0, -24, -30, -35, -60), (60, 80, 120, 150, 200)),
          'i': ((350, 1700, 2700, 3700, 4950), (0, -20, -30, -36, -60), (50, 100, 120, 150, 200)),
          'o': ((450, 800, 2830, 3500, 4950), (0, -9, -16, -28, -55), (70, 80, 100, 130, 135)),
          'u': ((325, 700, 2530, 3500, 4950), (0, -12, -30, -40, -64), (50, 60, 170, 180, 200))},
    'T': {'a': ((650, 1080, 2650, 2900, 3250), (0, -6, -7, -8, -22), (80, 90, 120, 130, 140)),
          'e': ((400, 1700, 2600, 3200, 3580), (0, -14, -12, -14, -20), (70, 80, 100, 120, 120)),
          'i': ((290, 1870, 2800, 3250, 3540), (0, -15, -18, -20, -30), (40, 90, 100, 120, 120)),
          'o': ((400, 800, 2600, 2800, 3000), (0, -10, -12, -12, -26), (40, 80, 100, 120, 120)),
          'u': ((350, 600, 2700, 2900, 3300), (0, -20, -17, -14, -26), (40, 60, 100, 120, 120))},
    'B': {'a': ((600, 1040, 2250, 2450, 2750), (0, -7, -9, -9, -20), (60, 70, 110, 120, 130)),
          'e': ((400, 1620, 2400, 2800, 3100), (0, -12, -9, -12, -18), (40, 80, 100, 120, 120)),
          'i': ((250, 1750, 2600, 3050, 3340), (0, -30, -16, -22, -28), (60, 90, 100, 120, 120)),
          'o': ((400, 750, 2400, 2600, 2900), (0, -11, -21, -20, -40), (40, 80, 100, 120, 120)),
          'u': ((350, 600, 2400, 2675, 2950), (0, -20, -32, -28, -36), (40, 80, 100, 120, 120))},
}
for _t in FOF.values():   # a neutral schwa for groans and sighs
    _t['@'] = tuple(tuple(float(np.mean([_t[v][q][i] for v in 'aeo'])) for i in range(5)) for q in range(3))

VOWELS = set('aeiou@')

# voice types: the FOF table, a glottal-formant level (strength of the fundamental),
# vibrato, breathiness, and the spoken range used by speech mode
VOICE_TYPES = {
    'S': dict(table='S', glottal=-3.0, vib_rate=5.9, vib_depth=72.0, breath=-30.0),
    'A': dict(table='A', glottal=-5.0, vib_rate=5.6, vib_depth=64.0, breath=-30.0),
    'T': dict(table='T', glottal=-9.0, vib_rate=5.8, vib_depth=52.0, breath=-32.0),
    'B': dict(table='B', glottal=-11.0, vib_rate=5.4, vib_depth=48.0, breath=-32.0),
}

# consonants: kind, duration (s), and the parameters that matter for each kind
#   nasal/liquid/glide: formants (relative shape), voicing level (dB)
#   fric: noise shape, noise level, voiced (dB of voicing or None)
#   stop: closure (s), burst shape, burst level, voiced closure (voice bar) or not, frication after
CONS = {
    'm': dict(kind='nasal', dur=0.065, F=(280, 900, 2200, 3000, 4000), A=(0, -26, -36, -44, -56), V=-9.0),
    'n': dict(kind='nasal', dur=0.060, F=(280, 1500, 2500, 3200, 4000), A=(0, -24, -34, -42, -56), V=-9.0),
    'J': dict(kind='nasal', dur=0.070, F=(280, 2000, 2700, 3300, 4100), A=(0, -22, -32, -40, -56), V=-9.0),
    'l': dict(kind='liquid', dur=0.055, F=(360, 1250, 2650, 3300, 4000), A=(0, -12, -24, -30, -46), V=-5.0),
    'L': dict(kind='liquid', dur=0.065, F=(300, 1900, 2700, 3300, 4000), A=(0, -12, -22, -30, -46), V=-5.0),
    'r': dict(kind='tap', dur=0.032, taps=1),
    'R': dict(kind='tap', dur=0.080, taps=3),
    'j': dict(kind='glide', dur=0.045, vowel='i', V=-2.0),
    'w': dict(kind='glide', dur=0.045, vowel='u', V=-2.0),
    's': dict(kind='fric', dur=0.085, noise='s', N=-14.5, V=None),
    'S': dict(kind='fric', dur=0.090, noise='S', N=-14.0, V=None),
    'f': dict(kind='fric', dur=0.075, noise='f', N=-22.0, V=None),
    'h': dict(kind='fric', dur=0.060, noise='asp', N=-15.0, V=None),
    'v': dict(kind='fric', dur=0.055, noise='f', N=-28.0, V=-12.0),
    'z': dict(kind='fric', dur=0.060, noise='s', N=-21.0, V=-14.0),
    'p': dict(kind='stop', dur=0.075, clo=0.062, burst='p', B=-17.0, VB=None),
    't': dict(kind='stop', dur=0.070, clo=0.058, burst='t', B=-12.0, VB=None),
    'k': dict(kind='stop', dur=0.075, clo=0.060, burst='k', B=-12.5, VB=None),
    'b': dict(kind='stop', dur=0.060, clo=0.050, burst='p', B=-18.0, VB=-24.0),
    'd': dict(kind='stop', dur=0.055, clo=0.046, burst='t', B=-14.0, VB=-24.0),
    'g': dict(kind='stop', dur=0.060, clo=0.050, burst='k', B=-14.0, VB=-24.0),
    'tS': dict(kind='affr', dur=0.100, clo=0.045, noise='S', N=-14.0, VB=None),
    'dZ': dict(kind='affr', dur=0.085, clo=0.040, noise='S', N=-19.0, VB=-16.0),
    'ts': dict(kind='affr', dur=0.095, clo=0.045, noise='s', N=-14.0, VB=None),
    'dz': dict(kind='affr', dur=0.080, clo=0.040, noise='s', N=-20.0, VB=-16.0),
}


# =====================================================================================
# voice: Italian / Church Latin syllables to phones
# =====================================================================================

ACCENTS = str.maketrans('àáèéìíòóùú', 'aaeeiioouu')


def syllable_phones(text):
    """'cer' -> (['tS'], 'e', ['r']);  'gli' -> (['L'], 'i', []);  'muo' -> (['m', 'w'], 'o', []).

    Special syllables: 'mm' hum, 'ah' a with breath, '@'/'uh' schwa, 'sh' a hush, 'hm' breathy hum.
    """
    s = text.lower().translate(ACCENTS)
    s = ''.join(ch for ch in s if ch.isalpha() or ch == '@')
    if s in ('mm', 'mmm', 'hm', 'hmm'):
        return (['h'] if s.startswith('h') else []), 'mm', []
    if s in ('uh', 'ugh', 'eh@', '@'):
        return [], '@', []
    if s in ('sh', 'shh', 'sss'):
        return ['S'], 'sh', []
    out = []
    i = 0
    n = len(s)

    def nxt(k=1):
        return s[i + k] if i + k < n else ''

    while i < n:
        ch = s[i]
        if ch in 'aeiou':
            # i/u before another vowel in the same syllable is a glide
            if ch in 'iu' and nxt() in 'aeiou' and nxt() != '':
                out.append('j' if ch == 'i' else 'w')
            elif ch in 'iu' and out and out[-1] in VOWELS and nxt() == '':
                out.append('j' if ch == 'i' else 'w')    # off-glide: 'mai', 'tuoi'
            elif ch == 'e' and out and out[-1] == 'a':
                out[-1] = 'e'                             # Latin ae
            else:
                out.append(ch)
            i += 1
            continue
        if ch == 'c':
            if nxt() == 'h':
                out.append('k'); i += 2; continue
            if nxt() in ('e', 'i') and nxt() != '':
                out.append('tS'); i += 1
                if nxt(0) == 'i' and nxt(1) in 'aeou' and nxt(1) != '':
                    i += 1
                continue
            out.append('k'); i += 1; continue
        if ch == 'g':
            if nxt() == 'h':
                out.append('g'); i += 2; continue
            if nxt() == 'l' and nxt(2) == 'i':
                out.append('L'); i += 2
                if nxt(1) in 'aeou' and nxt(1) != '':
                    i += 1
                continue
            if nxt() == 'n':
                out.append('J'); i += 2; continue
            if nxt() in ('e', 'i') and nxt() != '':
                out.append('dZ'); i += 1
                if nxt(0) == 'i' and nxt(1) in 'aeou' and nxt(1) != '':
                    i += 1
                continue
            if nxt() == 'u' and nxt(2) in 'aeio' and nxt(2) != '':
                out.extend(['g', 'w']); i += 2; continue
            out.append('g'); i += 1; continue
        if ch == 's':
            if nxt() == 'c' and nxt(2) in ('e', 'i') and nxt(2) != '':
                out.append('S'); i += 2
                if nxt(0) == 'i' and nxt(1) in 'aeou' and nxt(1) != '':
                    i += 1
                continue
            if nxt() and nxt() in 'bdgvmnlr':
                out.append('z'); i += 1; continue
            out.append('s'); i += 1; continue
        if ch == 'q':
            out.append('k'); i += 1
            if nxt(0) == 'u':
                out.append('w'); i += 1
            continue
        if ch == 'z':
            out.append('ts'); i += 1; continue
        if ch == 'h':
            i += 1; continue
        if ch == 'x':
            out.extend(['k', 's']); i += 1; continue
        if ch == 'y':
            out.append('i'); i += 1; continue
        if ch == 'r':
            # rolled at the start of a word-syllable cluster or before a consonant, tapped between vowels
            prev_v = bool(out) and out[-1] in VOWELS
            next_v = nxt() in 'aeiou' and nxt() != ''
            out.append('r' if (prev_v and next_v) or (not prev_v and next_v and out) else 'R')
            i += 1; continue
        if ch in 'bdfklmnptvjw':
            out.append(ch); i += 1; continue
        i += 1
    # split around the nucleus (the first full vowel)
    vi = next((k for k, p in enumerate(out) if p in VOWELS), None)
    if vi is None:
        return out, '@', []
    return out[:vi], out[vi], out[vi + 1:]


# =====================================================================================
# voice: spectral helpers
# =====================================================================================

def res_mag(f, F, B):
    """Magnitude of a two-pole resonance at F (bandwidth B), normalised to 1 at its peak."""
    s = np.pi * B
    w0 = 2 * np.pi * F
    w = 2 * np.pi * f
    num = s * s + w0 * w0
    mag = num / np.sqrt((s * s + (w - w0) ** 2) * (s * s + (w + w0) ** 2))
    peak = num / (s * np.sqrt(s * s + 4 * w0 * w0))
    return mag / peak


def formant_phase(f, F, B):
    """Phase of the cascaded formant resonances at f (K, J): each resonance turns the phase by -pi
    across its band, so a harmonic sum with these phases rings like a vocal tract instead of
    clicking like a pulse train."""
    ph = np.zeros_like(f)
    w = 2 * np.pi * f
    for q in range(F.shape[0]):
        s = (np.pi * B[q])[None, :]
        w0 = (2 * np.pi * F[q])[None, :]
        ph -= np.arctan2(w - w0, s) + np.arctan2(w + w0, s)
    return ph


def formant_env(f, F, A, B):
    """Sum of formant resonances. f: (K, J) or (bins, J); F, A(linear), B: (5, J)."""
    env = np.zeros_like(f)
    for q in range(F.shape[0]):
        env += A[q][None, :] * res_mag(f, F[q][None, :], B[q][None, :])
    return env


def noise_shape(kind, f, F=None, A=None, B=None):
    """Spectral magnitude (bins, J) for a noise kind."""
    lf = np.log2(np.maximum(f, 20.0))
    if kind == 's':
        g = np.exp(-0.5 * ((lf - np.log2(6800.0)) / 0.55) ** 2) + 0.25 * (f > 4000)
        return g * (f > 2500)
    if kind == 'S':
        return np.exp(-0.5 * ((lf - np.log2(3300.0)) / 0.6) ** 2) * (f > 1400)
    if kind == 'f':
        return (0.35 + 0.65 * np.exp(-0.5 * ((lf - np.log2(5000.0)) / 1.3) ** 2)) * (f > 700)
    if kind == 'p':
        return np.exp(-0.5 * ((lf - np.log2(1100.0)) / 1.2) ** 2)
    if kind == 't':
        return np.exp(-0.5 * ((lf - np.log2(4600.0)) / 0.8) ** 2)
    if kind == 'k':
        return np.exp(-0.5 * ((lf - np.log2(2300.0)) / 0.55) ** 2)
    if kind == 'asp':
        return formant_env(f, F, A, B)
    raise ValueError(kind)


# =====================================================================================
# voice: the singer
# =====================================================================================

class Note:
    """One sung note. text is the syllable ('cer', 'vel', 'lo'), or '_' to hold the previous vowel
    over a new pitch (melisma). vel 0..1. flags: 'acc' accent, 'stacc', 'slur' (portamento into it),
    'growl' (extra zombie growl), 'fry' (creak at its end), 'cresc', 'dim', 'swell', 'spoken'
    (no vibrato), 'breathy'. mend: MIDI at the note's end (a glide, for speech and sighs)."""
    __slots__ = ('t0', 't1', 'midi', 'text', 'vel', 'flags', 'mend', 'phones', 'who', 'z', 'pos')

    def __init__(self, t0, t1, midi, text, vel=0.7, flags=(), mend=None, who=None):
        self.t0 = float(t0)
        self.t1 = float(t1)
        self.midi = float(midi)
        self.text = text
        self.vel = float(vel)
        self.flags = set(flags)
        self.mend = None if mend is None else float(mend)
        self.who = who
        self.phones = None if text == '_' else syllable_phones(text)
        self.z = None
        self.pos = None


def split_phrases(notes, gap=0.22):
    """Group notes into legato phrases (a rest longer than gap starts a new phrase)."""
    notes = sorted(notes, key=lambda n: n.t0)
    out, cur = [], []
    for n in notes:
        if cur and n.t0 - cur[-1].t1 > gap:
            out.append(cur)
            cur = []
        cur.append(n)
    if cur:
        out.append(cur)
    return out


class Singer:
    """A voice: type S/A/T/B plus personal variation. zombie 0..1."""

    def __init__(self, vtype, zombie=0.0, fscale=1.0, seed=0, vib_rate=None, vib_depth=None,
                 breath=None, detune=0.0, glottal=None, bright=0.0, wobble=1.0, scoop=1.0):
        base = VOICE_TYPES[vtype]
        self.vtype = vtype
        self.table = FOF[base['table']]
        self.zombie = float(zombie)
        self.fscale = float(fscale)
        self.seed = seed
        self.vib_rate = base['vib_rate'] if vib_rate is None else vib_rate
        self.vib_depth = base['vib_depth'] if vib_depth is None else vib_depth
        self.breath = base['breath'] if breath is None else breath
        self.glottal = base['glottal'] if glottal is None else glottal
        self.detune = detune          # cents
        self.bright = bright          # dB tilt on the upper formants
        self.wobble = wobble          # vibrato irregularity
        self.scoop = scoop

    # ---------------------------------------------------------------- phone timeline
    def timeline(self, phrase):
        """Turn a phrase into [(phone, ts, te, note_index)] with consonants placed around the beats."""
        segs = []
        nn = len(phrase)
        # first pass: each syllable's onset, nucleus, coda; melisma notes extend the nucleus
        sylls = []   # (note_index, onset, vowel, coda)
        for k, n in enumerate(phrase):
            if n.phones is None:
                continue
            on, v, co = n.phones
            sylls.append([k, list(on), v, list(co)])
        # each syllable: the vowel starts on its note's t0; onset consonants come before it
        for si, (k, on, v, co) in enumerate(sylls):
            n = phrase[k]
            # the last note this syllable spans (melisma notes that follow it)
            k_end = sylls[si + 1][0] - 1 if si + 1 < len(sylls) else nn - 1
            t_end = phrase[k_end].t1
            if 'stacc' in phrase[k_end].flags:
                t_end = phrase[k_end].t0 + 0.55 * (phrase[k_end].t1 - phrase[k_end].t0)
            next_on = sylls[si + 1][1] if si + 1 < len(sylls) else []
            next_t0 = phrase[sylls[si + 1][0]].t0 if si + 1 < len(sylls) else None
            # durations
            don = [CONS[c]['dur'] for c in on]
            dco = [CONS[c]['dur'] for c in co]
            dnext = sum(CONS[c]['dur'] for c in next_on)
            avail = (t_end - n.t0)
            # squeeze consonants in fast passages: keep at least 45 % of the note for the vowel
            budget = 0.55 * avail if next_t0 is not None else 0.6 * avail
            tot = sum(dco) + (dnext if next_t0 is not None else 0.0)
            sq = min(1.0, budget / tot) if tot > 0 else 1.0
            sq_on = min(1.0, max(0.35, 0.6 * avail / sum(don))) if don else 1.0
            don = [d * sq_on for d in don]
            dco = [d * sq for d in dco]
            # onset (before the beat). In the first syllable of a phrase the singer starts early.
            t = n.t0 - sum(don)
            for c, d in zip(on, don):
                segs.append((c, t, t + d, k))
                t += d
            # vowel up to the coda, which ends where the next syllable's onset begins
            if next_t0 is not None and next_t0 - t_end < 0.03:
                v_end = next_t0 - dnext * sq - sum(dco)
            else:
                v_end = t_end - sum(dco)
            v_end = max(v_end, n.t0 + 0.03)
            segs.append((v, n.t0, v_end, k))
            t = v_end
            for c, d in zip(co, dco):
                segs.append((c, t, t + d, k_end))
                t += d
            # a silence if a staccato or a rest leaves a hole before the next syllable
            if next_t0 is not None:
                hole_end = next_t0 - dnext * sq
                if hole_end - t > 0.012:
                    segs.append(('#', t, hole_end, k_end))
        segs.sort(key=lambda s: s[1])
        return segs

    # ---------------------------------------------------------------- frame parameters
    def render_phrase(self, phrase, rng):
        segs = self.timeline(phrase)
        zs = [n.z for n in phrase if n.z is not None]
        z = float(max(zs)) if zs else self.zombie
        t_start = segs[0][1] - 0.06
        t_stop = max(segs[-1][2], phrase[-1].t1) + 0.16 + 0.1 * z
        J = int(np.ceil((t_stop - t_start) * FR)) + 2
        tf = t_start + (np.arange(J) + 0.5) / FR
        # ---- which phone and which note each frame belongs to
        starts = np.array([s[1] for s in segs])
        idx = np.clip(np.searchsorted(starts, tf, side='right') - 1, 0, len(segs) - 1)
        seg_end = np.array([s[2] for s in segs])
        after = tf > seg_end[idx]                      # past the end of the last segment
        note_t0 = np.array([n.t0 for n in phrase])
        nidx = np.clip(np.searchsorted(note_t0, tf, side='right') - 1, 0, len(phrase) - 1)

        # ---- formant targets per frame (5, J), voicing dB, noise
        F = np.zeros((5, J)); A = np.zeros((5, J)); B = np.zeros((5, J))
        V = np.zeros(J)                  # voicing dB
        Nlev = np.full(J, -120.0)        # frication / burst level dB
        Nkind = np.zeros(J, dtype=int)   # 0 none 1 s 2 S 3 f 4 p 5 t 6 k 7 asp
        kinds = {'s': 1, 'S': 2, 'f': 3, 'p': 4, 't': 5, 'k': 6, 'asp': 7}
        taps = np.ones(J)
        # vowel of each segment's neighbourhood (for consonant colouring)
        seg_vowel = []
        last_v = None
        for s in segs:
            if s[0] in VOWELS:
                last_v = s[0]
            seg_vowel.append(last_v)
        next_vowel = [None] * len(segs)
        nv = None
        for q in range(len(segs) - 1, -1, -1):
            if segs[q][0] in VOWELS:
                nv = segs[q][0]
            next_vowel[q] = nv
        for q, (ph, ts, te, k) in enumerate(segs):
            m = idx == q
            if not m.any():
                continue
            vref = next_vowel[q] or seg_vowel[q] or 'a'
            if ph in VOWELS:
                vref = ph
            if ph == 'mm':
                vref = 'u'
            Fv, Av, Bv = (np.array(x, dtype=float) for x in self.table[vref])
            F[:, m] = Fv[:, None]; A[:, m] = Av[:, None]; B[:, m] = Bv[:, None]
            if ph in VOWELS:
                V[m] = {'a': 0, 'e': -1, 'o': -1, 'i': -2.5, 'u': -3.5, '@': -1}[ph]
                continue
            if ph == 'mm':
                c = CONS['m']
                F[:, m] = np.array(c['F'], float)[:, None]; A[:, m] = np.array(c['A'], float)[:, None]
                V[m] = -4.0
                continue
            if ph == 'sh':
                V[m] = -120.0; Nlev[m] = -6.0; Nkind[m] = kinds['S']
                continue
            if ph == '#':
                V[m] = -120.0
                continue
            c = CONS[ph]
            kd = c['kind']
            if kd in ('nasal', 'liquid'):
                F[:, m] = np.array(c['F'], float)[:, None]; A[:, m] = np.array(c['A'], float)[:, None]
                V[m] = c['V']
            elif kd == 'glide':
                Fg, Ag, Bg = (np.array(x, dtype=float) for x in self.table[c['vowel']])
                F[:, m] = Fg[:, None]; A[:, m] = Ag[:, None]; B[:, m] = Bg[:, None]
                V[m] = c['V']
            elif kd == 'tap':
                # vowel-like with one or three quick interruptions (tongue tip taps)
                V[m] = -2.0
                F[2, m] *= 0.85
                tt = (tf[m] - ts) / max(te - ts, 1e-3)
                ntap = c['taps']
                ph_ = np.sin(np.pi * tt * ntap) ** 2
                taps[m] = 1.0 - 0.93 * ph_
            elif kd == 'fric':
                V[m] = -120.0 if c['V'] is None else c['V']
                Nlev[m] = c['N']; Nkind[m] = kinds[c['noise']]
                if c['noise'] == 'asp':
                    Nkind[m] = kinds['asp']
            elif kd in ('stop', 'affr'):
                tt = tf[m] - ts
                clo = c['clo'] * (te - ts) / c['dur']
                V[m] = np.where(tt < clo, -120.0 if c['VB'] is None else c['VB'], -6.0)
                if kd == 'stop':
                    burst = (tt >= clo) & (tt < clo + 0.014)
                    lev = np.where(burst, c['B'], -120.0)
                    Nlev[m] = lev; Nkind[m] = kinds[c['burst']]
                    # voiceless stops: voicing starts a hair after the burst
                    if c['VB'] is None:
                        V[m] = np.where(tt < clo + 0.012, -120.0, -4.0)
                else:
                    fr = tt >= clo
                    Nlev[m] = np.where(fr, c['N'], -120.0); Nkind[m] = kinds[c['noise']]
                    if c['VB'] is None:
                        V[m] = np.where(tt < te - ts - 0.004, -120.0, -6.0)
                    else:
                        V[m] = np.where(fr, -12.0, c['VB'])
        V[after] = -120.0
        # before the first and after the last segment: silence (with release handled below)
        V[tf < segs[0][1]] = -120.0

        # ---- formant scaling, zombie darkening, coarticulation smoothing
        fs = self.fscale * (1.0 - 0.055 * z)
        F *= fs
        B *= (1.0 + 0.6 * z)
        F = moving_avg(F, 12)
        A = moving_avg(A, 10)
        B = moving_avg(B, 10)
        # ---- pitch (cents), with transitions, vibrato, drift, scoops
        cents = np.full(J, phrase[0].midi * 100.0)
        prev = phrase[0].midi * 100.0
        for k in range(1, len(phrase)):
            n = phrase[k]
            d = n.midi * 100.0 - prev
            prev = n.midi * 100.0
            if abs(d) < 1e-6:
                continue
            slur = 'slur' in n.flags
            dur = (0.20 if slur else 0.065 + 0.004 * min(abs(d) / 100.0, 12)) * (1 + 0.6 * z)
            dur = min(dur, 0.5 * (n.t1 - n.t0) + 0.04)
            centre = n.t0 - 0.25 * dur
            x = (tf - centre) / dur + 0.5
            cents += d * smoothstep(x)
            # a small overshoot on arrival (upward leaps)
            if d > 150 and not slur:
                bump = np.exp(-((tf - (centre + 0.6 * dur)) / 0.05) ** 2)
                cents += min(25.0, 0.06 * d) * bump
        for k, n in enumerate(phrase):
            if n.mend is not None:
                m = (tf >= n.t0) & (tf < n.t1)
                g = smoothstep((tf[m] - n.t0) / max(n.t1 - n.t0, 1e-3))
                cents[m] += (n.mend - n.midi) * 100.0 * g
                if k + 1 < len(phrase):
                    cents[tf >= n.t1] += 0.0
        # vibrato envelope per note
        vib_env = np.zeros(J)
        spoken = np.zeros(J, dtype=bool)
        for k, n in enumerate(phrase):
            m = nidx == k
            if not m.any():
                continue
            if 'spoken' in n.flags:
                spoken[m] = True
                continue
            # held notes (and melisma chains) develop vibrato; short ones keep a little
            tt = tf[m] - n.t0
            vib_env[m] = np.maximum(0.28, smoothstep((tt - 0.09) / 0.32))
        vib_env = moving_avg(vib_env, 20)
        vib_env[spoken] = 0.0
        rate = self.vib_rate * (1.0 + 0.035 * slow_noise(J, FR * 0.7, rng) + 0.08 * z * slow_noise(J, FR * 0.3, rng))
        vph = 2 * np.pi * np.cumsum(rate) / FR + rng.uniform(0, 2 * np.pi)
        depth = self.vib_depth * (1.0 + 0.12 * slow_noise(J, FR * 0.9, rng) * self.wobble + 0.45 * z * np.abs(slow_noise(J, FR * 0.5, rng)))
        cents += depth * vib_env * np.sin(vph)
        # drift and jitter
        cents += (5.0 + 38.0 * z) * slow_noise(J, FR * 0.8, rng)
        cents += (1.2 + 4.0 * z) * moving_avg(rng.standard_normal(J), 3)
        cents += self.detune
        # scoop into the phrase (and into accented notes for zombies)
        sc = (55.0 + 260.0 * z) * self.scoop
        scd = 0.07 + 0.11 * z
        t_first = phrase[0].t0
        cents -= sc * (1.0 - smoothstep((tf - (t_first - 0.04)) / scd)) * (tf < t_first + scd)
        if z > 0.3:
            for n in phrase[1:]:
                if 'acc' in n.flags or 'growl' in n.flags:
                    cents -= 0.6 * sc * (1.0 - smoothstep((tf - n.t0 + 0.02) / scd)) * ((tf > n.t0 - 0.05) & (tf < n.t0 + scd))
        # creaky fall at the end of a phrase ('fry' flag, or zombies at phrase ends)
        last = phrase[-1]
        fry = np.zeros(J)
        if 'fry' in last.flags or z > 0.75:
            m = tf > last.t1 - 0.18
            fry[m] = smoothstep((tf[m] - (last.t1 - 0.18)) / 0.25)
            cents -= 500.0 * fry
        f0 = m2f(cents / 100.0)

        # ---- dynamics per frame
        lev = np.zeros(J)
        for k, n in enumerate(phrase):
            m = nidx == k
            if not m.any():
                continue
            base = 0.18 + 0.82 * n.vel ** 1.3
            dur = n.t1 - n.t0
            x = np.clip((tf[m] - n.t0) / max(dur, 1e-3), 0, 1)
            shape = np.ones(m.sum())
            if 'cresc' in n.flags:
                shape *= dbl(-5.0 + 8.0 * x)
            elif 'dim' in n.flags:
                shape *= dbl(2.0 - 9.0 * x)
            elif 'swell' in n.flags or dur > 1.3:
                shape *= dbl(-1.5 + 3.5 * np.sin(np.pi * x) ** 1.5)
            if 'acc' in n.flags:
                shape *= 1.0 + 0.6 * np.exp(-(tf[m] - n.t0).clip(0) / 0.12)
            lev[m] = base * shape
        lev = moving_avg(lev, 14)
        # brightness follows loudness: louder singing lifts the upper formants
        tilt = (lev - 0.6) * 14.0 + self.bright
        A_lin = dbl(A + np.array([0.0, 0.3, 0.75, 0.9, 1.0])[:, None] * tilt[None, :])
        # attack / release of the whole phrase
        onset = smoothstep((tf - (segs[0][1] - 0.01)) / 0.045)
        end_t = max(segs[-1][2], phrase[-1].t1)
        rel = 1.0 - smoothstep((tf - (end_t - 0.03)) / (0.13 + 0.12 * z))
        vgain = dbl(moving_avg(np.maximum(V, -120.0), 3)) * taps
        vgain = moving_avg(vgain, 2)
        amp = lev * onset * rel * vgain

        # ---- formant tuning: keep F1 above the fundamental on high notes
        F1 = F[0]
        tune = f0 > 0.88 * F1
        F[0] = np.where(tune, np.maximum(F1, f0 * 1.07), F1)
        B[0] = np.where(tune, B[0] * 1.3, B[0])

        # ---- harmonic synthesis
        n_samp = J * HOP
        x_ctrl = (np.arange(n_samp) + 0.5) / HOP - 0.5
        f0s = np.interp(x_ctrl, np.arange(J), f0)
        theta = 2 * np.pi * np.cumsum(f0s) / SR + rng.uniform(0, 2 * np.pi)
        fmax = 10500.0
        K = int(min(160, fmax / max(40.0, f0.min())))
        kk = np.arange(1, K + 1, dtype=float)[:, None]
        hf = kk * f0[None, :]
        env = formant_env(hf, F, A_lin, B)
        # glottal formant: the fundamental's own strength
        env += dbl(self.glottal) * res_mag(hf, 1.05 * f0[None, :], 0.9 * f0[None, :])
        env *= 1.0 / (1.0 + (hf / 7500.0) ** 4)          # gentle top roll-off
        env *= (hf < fmax)
        env /= np.sqrt((env ** 2).sum(axis=0, keepdims=True)) + 1e-12
        # zombie rasp: shimmer on the harmonic amplitudes
        if z > 0:
            env *= 1.0 + 0.25 * z * rng.standard_normal(env.shape) * 0.5
        env *= amp[None, :]
        # drop harmonics that never matter
        keep = np.where(env.max(axis=1) > 2e-4 * max(env.max(), 1e-9))[0]
        idx0 = np.clip(np.floor(x_ctrl).astype(int), 0, J - 1)
        idx1 = np.clip(idx0 + 1, 0, J - 1)
        w = np.clip(x_ctrl - idx0, 0, 1)
        phs = formant_phase(hf, F, B)
        e_s = env * np.cos(phs)
        e_c = env * np.sin(phs)
        cos_t = np.cos(theta)
        c2 = 2.0 * cos_t
        s_prev = np.zeros(n_samp)
        s_cur = np.sin(theta)
        k_prev = np.ones(n_samp)
        k_cur = cos_t
        y = np.zeros(n_samp)
        kmax_used = (keep.max() + 1) if keep.size else 0
        keepset = set(keep.tolist())
        for k in range(kmax_used):
            if k in keepset:
                a, b = e_s[k], e_c[k]
                y += (a[idx0] * (1 - w) + a[idx1] * w) * s_cur + (b[idx0] * (1 - w) + b[idx1] * w) * k_cur
            s_next = c2 * s_cur - s_prev
            s_prev, s_cur = s_cur, s_next
            k_next = c2 * k_cur - k_prev
            k_prev, k_cur = k_cur, k_next
        # zombie growl: period doubling (half-integer harmonics) and a rough low AM
        growl_frames = np.zeros(J)
        for k, n in enumerate(phrase):
            if 'growl' in n.flags:
                growl_frames[nidx == k] = 1.0
        sub_amt = np.clip(0.30 * z + 0.55 * moving_avg(growl_frames, 20) + 0.5 * fry, 0, 1)
        if sub_amt.max() > 0.01:
            hfs = (kk - 0.5) * f0[None, :]
            envs = formant_env(hfs, F, A_lin, B) / (1.0 + (hfs / 6000.0) ** 4) * (hfs < 8000)
            envs /= np.sqrt((envs ** 2).sum(axis=0, keepdims=True)) + 1e-12
            envs *= (amp * sub_amt * 0.55)[None, :]
            half = theta / 2.0
            s_prev = -np.sin(half)
            s_cur = np.sin(half)
            for k in range(min(K, 60)):
                e = envs[k]
                y += (e[idx0] * (1 - w) + e[idx1] * w) * s_cur
                s_next = c2 * s_cur - s_prev
                s_prev, s_cur = s_cur, s_next
        if z > 0.05:
            am = slow_noise(n_samp, SR / 45.0, rng, order=1)
            am = signal.lfilter(*signal.butter(2, [20 / (SR / 2), 90 / (SR / 2)], 'band'), am)
            am /= (np.std(am) + 1e-9)
            y *= 1.0 + (0.22 * z + 0.25 * np.interp(x_ctrl, np.arange(J), growl_frames)) * am

        # ---- noise: breath (pitch-synchronous), frication, bursts
        nn = n_samp + 1024
        wn = rng.standard_normal(nn)
        fseg, tseg, Z = signal.stft(wn, fs=SR, nperseg=512, noverlap=512 - HOP, boundary='zeros', padded=True)
        M = Z.shape[1]
        jj = np.clip(np.round(np.arange(M) - 0.5).astype(int), 0, J - 1)
        fb = fseg[:, None] * np.ones((1, M))
        # breath shaped like the voice's own formants
        asp_shape = formant_env(fb, F[:, jj], A_lin[:, jj], B[:, jj] * 1.5) * (fb > 300) / (1.0 + (fb / 9000.0) ** 2)
        asp_shape /= np.sqrt((asp_shape ** 2).mean(axis=0, keepdims=True)) + 1e-12
        breath_db = self.breath + 11.0 * z + (6.0 if any('breathy' in n.flags for n in phrase) else 0.0)
        asp_lev = dbl(breath_db) * amp[jj]
        shape = asp_shape * asp_lev[None, :]
        # frication / bursts
        lv = dbl(Nlev)
        lv[Nlev < -100] = 0.0
        lv = moving_avg(lv, 2)
        lev_ref = np.maximum(moving_avg(lev, 40), 0.25)
        for name, code in kinds.items():
            m = Nkind[jj] == code
            if not m.any():
                continue
            if name == 'asp':
                sh = asp_shape[:, m]
            else:
                sh = noise_shape(name, fb[:, m])
                sh /= np.sqrt((sh ** 2).mean(axis=0, keepdims=True)) + 1e-12
            shape[:, m] += sh * (lv[jj][m] * lev_ref[jj][m] * onset[jj][m])[None, :]
        _, yn = signal.istft(Z * shape, fs=SR, nperseg=512, noverlap=512 - HOP, boundary=True)
        yn = yn[:n_samp]
        # breath pulses with the glottal cycle (voiced parts)
        voiced = np.interp(x_ctrl, np.arange(J), np.clip(vgain, 0, 1))
        puls = 1.0 - 0.55 * voiced * (0.5 + 0.5 * np.cos(theta))
        y = y + yn * puls
        return y.astype(np.float32), t_start

    def render(self, notes, seed=None):
        """Render all notes. Returns list of (t_start_seconds, mono float32 buffer)."""
        rng = np.random.default_rng(self.seed if seed is None else seed)
        out = []
        for ph in split_phrases(notes):
            y, t0 = self.render_phrase(ph, rng)
            out.append((t0, y))
        return out


def breath_in(dur=0.35, level=0.05, rng=None, zombie=0.0):
    """An inhale before a phrase: soft filtered noise, rising then cut."""
    rng = rng or np.random.default_rng(3)
    n = int(dur * SR)
    x = rng.standard_normal(n)
    b, a = signal.butter(2, [500 / (SR / 2), 4200 / (SR / 2)], 'band')
    x = signal.lfilter(b, a, x)
    if zombie > 0:
        b2, a2 = signal.butter(2, [180 / (SR / 2), 900 / (SR / 2)], 'band')
        rattle = signal.lfilter(b2, a2, rng.standard_normal(n)) * (1 + np.sign(np.sin(2 * np.pi * 38 * np.arange(n) / SR)))
        x = x + 1.6 * zombie * rattle
    t = np.arange(n) / n
    env = smoothstep(t / 0.7) * (1 - smoothstep((t - 0.88) / 0.12))
    x *= env / (np.std(x) + 1e-9) * level
    return x.astype(np.float32)


# =====================================================================================
# orchestra helpers
# =====================================================================================

def polyblep_saw(freq, rng=None, phase0=None):
    """Band-limited sawtooth for a per-sample frequency array."""
    dt = np.asarray(freq, dtype=float) / SR
    ph0 = (rng.uniform() if rng is not None else 0.0) if phase0 is None else phase0
    ph = (ph0 + np.cumsum(dt)) % 1.0
    y = 2.0 * ph - 1.0
    dtc = np.clip(dt, 1e-6, 0.5)
    m = ph < dtc
    t = ph[m] / dtc[m]
    y[m] -= t + t - t * t - 1.0
    m = ph > 1.0 - dtc
    t = (ph[m] - 1.0) / dtc[m]
    y[m] -= t * t + t + t + 1.0
    return y


def adsr(n, att, rel, sus_n=None, curve=1.0):
    """Attack (s) / hold / release (s) envelope of n samples; release at the end."""
    a = max(1, int(att * SR))
    r = max(1, int(rel * SR))
    env = np.ones(n)
    a = min(a, n)
    env[:a] = smoothstep(np.arange(a) / a) if curve == 1.0 else (np.arange(a) / a) ** curve
    r = min(r, n)
    env[n - r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return env


def one_pole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    return signal.lfilter([1 - a], [1, -a], x)


def body_ir(seed, length=0.03, peaks=((280, 1.0), (460, 0.8), (1100, 0.5), (2600, 0.7), (4200, 0.35)), decay=0.006):
    """A short random impulse response with resonant peaks: an instrument body."""
    rng = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = np.zeros(n)
    for f, g in peaks:
        for _ in range(3):
            ff = f * np.exp(rng.normal(0, 0.12))
            ir += g * np.exp(-t / (decay * rng.uniform(0.6, 1.6))) * np.sin(2 * np.pi * ff * t + rng.uniform(0, 6.28))
    ir += 0.25 * rng.standard_normal(n) * np.exp(-t / 0.002)
    ir[0] += 1.5
    return ir / np.sqrt((ir ** 2).sum())


def peq(x, f, gain_db, q=1.0):
    """Peaking EQ (RBJ)."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / SR
    al = np.sin(w) / (2 * q)
    b = np.array([1 + al * A, -2 * np.cos(w), 1 - al * A])
    a = np.array([1 + al / A, -2 * np.cos(w), 1 - al / A])
    return signal.lfilter(b / a[0], a / a[0], x)


def shelf(x, f, gain_db, high=True):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / SR
    cs, sn = np.cos(w), np.sin(w)
    al = sn / 2 * np.sqrt(2)
    if high:
        b = [A * ((A + 1) + (A - 1) * cs + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * cs), A * ((A + 1) + (A - 1) * cs - 2 * np.sqrt(A) * al)]
        a = [(A + 1) - (A - 1) * cs + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * cs), (A + 1) - (A - 1) * cs - 2 * np.sqrt(A) * al]
    else:
        b = [A * ((A + 1) - (A - 1) * cs + 2 * np.sqrt(A) * al), 2 * A * ((A - 1) - (A + 1) * cs), A * ((A + 1) - (A - 1) * cs - 2 * np.sqrt(A) * al)]
        a = [(A + 1) + (A - 1) * cs + 2 * np.sqrt(A) * al, -2 * ((A - 1) + (A + 1) * cs), (A + 1) + (A - 1) * cs - 2 * np.sqrt(A) * al]
    b, a = np.array(b), np.array(a)
    return signal.lfilter(b / a[0], a / a[0], x)


def bfilt(x, kind, f, order=2):
    if kind == 'band':
        b, a = signal.butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], 'band')
    else:
        b, a = signal.butter(order, f / (SR / 2), kind)
    return signal.lfilter(b, a, x)


class Ev:
    """An orchestral note: start, end (s), MIDI, velocity 0..1, articulation."""
    __slots__ = ('t0', 't1', 'midi', 'vel', 'art')

    def __init__(self, t0, t1, midi, vel=0.6, art='leg'):
        self.t0, self.t1, self.midi, self.vel, self.art = float(t0), float(t1), float(midi), float(vel), art


def place(buf, x, t, gain=1.0):
    """Add mono x into buf (mono or (2, n)) at time t seconds."""
    i = int(round(t * SR))
    if i < 0:
        x = x[..., -i:]
        i = 0
    n = min(x.shape[-1], buf.shape[-1] - i)
    if n <= 0:
        return
    buf[..., i:i + n] += gain * x[..., :n]


# =====================================================================================
# strings
# =====================================================================================

STRINGS = {
    #       players, detune cents, vib rate, vib depth, lowpass, body peaks, gain
    'vln1': dict(n=6, det=7.0, vr=5.9, vd=14.0, lp=7800, seed=11, peaks=((290, 1.0), (500, 0.7), (1150, 0.45), (2700, 0.8), (4300, 0.4))),
    'vln2': dict(n=5, det=7.0, vr=5.7, vd=13.0, lp=7200, seed=12, peaks=((290, 1.0), (500, 0.7), (1150, 0.45), (2700, 0.75), (4300, 0.35))),
    'vla': dict(n=4, det=6.0, vr=5.5, vd=13.0, lp=6000, seed=13, peaks=((230, 1.0), (420, 0.8), (900, 0.5), (2200, 0.6), (3600, 0.3))),
    'vc': dict(n=4, det=5.0, vr=5.2, vd=12.0, lp=4800, seed=14, peaks=((110, 0.9), (210, 1.0), (400, 0.7), (1000, 0.4), (2200, 0.35))),
    'cb': dict(n=3, det=4.0, vr=4.8, vd=9.0, lp=2600, seed=15, peaks=((70, 1.0), (120, 0.9), (260, 0.6), (600, 0.3), (1200, 0.2))),
}


def strings_section(events, name, total_n, seed=0):
    """Render a string section (arco: leg/marc/stacc/acc/trem, plus pizz) to a mono buffer."""
    cfg = STRINGS[name]
    rng = np.random.default_rng(seed + cfg['seed'])
    out = np.zeros(total_n)
    pl = np.zeros(total_n)   # pizzicato goes around the body IR (it has its own)
    dets = rng.normal(0, cfg['det'], cfg['n'])
    for ev in events:
        if ev.art == 'pizz':
            pizz_note(pl, ev, name, rng)
            continue
        dur = max(0.03, ev.t1 - ev.t0)
        art = ev.art
        if art == 'stacc':
            dur = min(dur, 0.16)
        att = {'leg': 0.085, 'marc': 0.028, 'stacc': 0.014, 'acc': 0.02, 'trem': 0.03, 'sfz': 0.012, 'swell': 0.35}.get(art, 0.06)
        rel = {'stacc': 0.06, 'marc': 0.12, 'sfz': 0.15}.get(art, 0.18)
        n = int((dur + rel) * SR)
        t = np.arange(n) / SR
        f0 = m2f(ev.midi)
        players = cfg['n'] if art != 'solo' else 1
        note = np.zeros(n)
        for p in range(players):
            off = rng.uniform(0.0, 0.022) if art in ('leg', 'trem', 'swell') else rng.uniform(0.0, 0.010)
            o = int(off * SR)
            m = n - o
            if m <= 16:
                continue
            tt = t[:m]
            vib_on = smoothstep((tt - 0.18) / 0.4) if art in ('leg', 'swell', 'solo') else 0.25 * smoothstep(tt / 0.3)
            vr = cfg['vr'] * rng.uniform(0.92, 1.08)
            cents = dets[p] + cfg['vd'] * rng.uniform(0.7, 1.3) * vib_on * np.sin(2 * np.pi * vr * tt + rng.uniform(0, 6.28))
            cents += 3.0 * slow_noise(m, SR * 0.6, rng)
            freq = f0 * 2 ** (cents / 1200.0)
            y = polyblep_saw(freq, rng)
            env = adsr(m, att * rng.uniform(0.8, 1.25), rel)
            if art == 'acc' or art == 'sfz':
                env *= 1.0 + 0.8 * np.exp(-tt / 0.09)
            if art == 'swell':
                env *= smoothstep(tt / max(dur, 0.1)) * 0.85 + 0.15
            if art == 'trem':
                rate = rng.uniform(13.0, 16.0)
                tr = np.abs(np.sin(np.pi * rate * tt + rng.uniform(0, 3.14)))
                env *= 0.35 + 0.65 * tr ** 0.6
            note[o:] += y * env
        note /= np.sqrt(players)
        # brightness from velocity
        note = one_pole_lp(note, 1200 + 6000 * ev.vel ** 1.2)
        # bow noise
        bn = bfilt(rng.standard_normal(n), 'band', (1500, 7000)) * adsr(n, 0.02, rel) * 0.025
        note += bn
        place(out, note, ev.t0, gain=ev.vel ** 1.1 * 0.5)
    ir = body_ir(cfg['seed'] + seed, peaks=cfg['peaks'])
    if np.any(out):
        out = signal.oaconvolve(out, ir)[:total_n]
        out = one_pole_lp(out, cfg['lp'])
        out = bfilt(out, 'high', 40.0 if name == 'cb' else 70.0)
    return out + pl


def pizz_note(buf, ev, name, rng):
    f0 = m2f(ev.midi)
    base_tau = {'vln1': 0.32, 'vln2': 0.32, 'vla': 0.42, 'vc': 0.6, 'cb': 0.85}[name]
    players = {'vln1': 4, 'vln2': 3, 'vla': 3, 'vc': 3, 'cb': 2}[name]
    n = int(min(2.5, base_tau * 5) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for p in range(players):
        off = int(rng.uniform(0, 0.016) * SR)
        det = 2 ** (rng.normal(0, 6) / 1200)
        tt = t[:n - off]
        z = np.zeros(n - off)
        for k in range(1, 14):
            fk = f0 * k * det * (1 + 0.0004 * k * k)
            if fk > 9000:
                break
            amp = (1.0 / k ** 1.25) * (0.6 if k % 4 == 0 else 1.0)
            tau = base_tau / (1 + 0.45 * (k - 1))
            z += amp * np.exp(-tt / tau) * np.sin(2 * np.pi * fk * tt + rng.uniform(0, 6.28))
        z *= smoothstep(tt / 0.003)
        y[off:] += z
    y /= np.sqrt(players)
    thump = bfilt(rng.standard_normal(n), 'low', 900.0) * np.exp(-t / 0.008) * 0.15
    place(buf, (y + thump), ev.t0, gain=ev.vel ** 1.3 * 0.38)


# =====================================================================================
# winds and brass (additive)
# =====================================================================================

def gauss_db(f, fc, width_oct, gain_db):
    return gain_db * np.exp(-0.5 * (np.log2(np.maximum(f, 1.0) / fc) / width_oct) ** 2)


WINDS = {
    'picc': dict(kind='wind', vib=(5.2, 9.0), noise=-34.0, att=0.035, rel=0.09),
    'fl': dict(kind='wind', vib=(5.0, 11.0), noise=-32.0, att=0.045, rel=0.12),
    'ob': dict(kind='wind', vib=(5.4, 9.0), noise=-36.0, att=0.03, rel=0.08),
    'cl': dict(kind='wind', vib=(0.0, 0.0), noise=-38.0, att=0.03, rel=0.1),
    'bsn': dict(kind='wind', vib=(5.0, 6.0), noise=-36.0, att=0.03, rel=0.09),
    'hn': dict(kind='brass', vib=(4.8, 4.0), noise=-44.0, att=0.06, rel=0.16),
    'tpt': dict(kind='brass', vib=(5.2, 4.0), noise=-44.0, att=0.03, rel=0.11),
    'tbn': dict(kind='brass', vib=(0.0, 0.0), noise=-44.0, att=0.045, rel=0.14),
    'tuba': dict(kind='brass', vib=(0.0, 0.0), noise=-44.0, att=0.06, rel=0.16),
}


def wind_spectrum(name, f0, k, vel):
    """Harmonic amplitudes (linear) for instrument name at f0 for harmonic numbers k."""
    f = f0 * k
    if name in ('fl', 'picc'):
        db_ = -np.where(k == 1, 0, 9 + 9 * (k - 2)) + 6 * (vel - 0.5) * (k > 1)
        return dbl(db_)
    if name == 'ob':
        db_ = -6 * np.log2(k) + gauss_db(f, 1150, 0.5, 12) + gauss_db(f, 2900, 0.4, 6) - (f < 600) * 8
        return dbl(db_ + 6 * (vel - 0.5) * np.log2(k))
    if name == 'cl':
        odd = (k % 2 == 1) | (f > 1800)
        db_ = -5 * np.log2(k) - np.where(odd, 0, 18) - (f > 3000) * 10
        return dbl(db_ + 5 * (vel - 0.5) * np.log2(k))
    if name == 'bsn':
        db_ = -4 * np.log2(k) + gauss_db(f, 480, 0.45, 12) + gauss_db(f, 1150, 0.4, 5) - (f > 2500) * 14
        return dbl(db_)
    # brass: brightness rises steeply with the dynamic
    slope = {'hn': 9.0, 'tpt': 6.0, 'tbn': 7.0, 'tuba': 10.0}[name] - 7.0 * vel
    fc, g = {'hn': (420, 6), 'tpt': (1300, 8), 'tbn': (600, 7), 'tuba': (260, 6)}[name]
    db_ = -slope * np.log2(k) + gauss_db(f, fc, 0.6, g)
    if name == 'hn':
        db_ -= (f > 2000) * 12
    return dbl(db_)


def wind_note(name, ev, rng, extra_cents=None):
    cfg = WINDS[name]
    dur = max(0.04, ev.t1 - ev.t0)
    if ev.art == 'stacc':
        dur = min(dur, 0.14)
    att = cfg['att'] * (0.5 if ev.art in ('acc', 'marc', 'sfz', 'stacc') else 1.0)
    rel = cfg['rel']
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    f0 = m2f(ev.midi)
    vr, vd = cfg['vib']
    cents = 2.0 * slow_noise(n, SR * 0.5, rng)
    if vd > 0:
        cents += vd * smoothstep((t - 0.2) / 0.4) * np.sin(2 * np.pi * vr * t + rng.uniform(0, 6.28))
    if cfg['kind'] == 'brass':
        cents -= 18.0 * np.exp(-t / 0.035)            # lip into the note
    if extra_cents is not None:
        cents += extra_cents[:n] if len(extra_cents) >= n else np.pad(extra_cents, (0, n - len(extra_cents)), 'edge')
    freq = f0 * 2 ** (cents / 1200.0)
    theta = 2 * np.pi * np.cumsum(freq) / SR
    K = int(min(40, 11000 / f0))
    k = np.arange(1, K + 1)
    amps = wind_spectrum(name, f0, k, ev.vel)
    amps /= np.sqrt((amps ** 2).sum())
    env = adsr(n, att, rel)
    if ev.art in ('acc', 'sfz', 'marc'):
        env *= 1.0 + 0.7 * np.exp(-t / 0.08)
    if ev.art == 'swell':
        env *= 0.25 + 0.75 * smoothstep(t / max(dur, 0.1))
    if ev.art == 'dim':
        env *= 1.0 - 0.75 * smoothstep(t / max(dur, 0.1))
    y = np.zeros(n)
    c2 = 2 * np.cos(theta)
    s_prev = np.zeros(n)
    s_cur = np.sin(theta)
    for i in range(K):
        # upper harmonics speak later and fade sooner (brass especially)
        p = 1.0 + (0.18 if cfg['kind'] == 'brass' else 0.06) * i
        y += amps[i] * env ** p * s_cur
        s_next = c2 * s_cur - s_prev
        s_prev, s_cur = s_cur, s_next
    if cfg['noise'] > -60:
        nz = bfilt(rng.standard_normal(n), 'band', (max(200.0, f0 * 0.8), min(12000.0, f0 * 8)))
        nz *= env * dbl(cfg['noise'] + 6) * (1 + 2.0 * np.exp(-t / 0.05))
        y += nz
    return y


def winds_part(events, name, total_n, seed=0):
    rng = np.random.default_rng(seed + hash(name) % 1000)
    out = np.zeros(total_n)
    for ev in events:
        y = wind_note(name, ev, rng)
        place(out, y, ev.t0, gain=0.12 + 0.55 * ev.vel ** 1.5)
    return out


# =====================================================================================
# percussion, harp, organ, bells, celesta
# =====================================================================================

def timp_hit(f0, vel, rng, dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ratios = (1.0, 1.504, 1.742, 2.0, 2.245, 2.494, 2.8, 3.1)
    amps = (1.0, 0.55, 0.3, 0.32, 0.18, 0.12, 0.08, 0.05)
    taus = (1.9, 0.9, 0.55, 0.6, 0.4, 0.3, 0.25, 0.2)
    glide = 1.0 + 0.018 * vel * np.exp(-t / 0.12)
    y = np.zeros(n)
    for r, a, tau in zip(ratios, amps, taus):
        ph = 2 * np.pi * np.cumsum(f0 * r * glide) / SR + rng.uniform(0, 6.28)
        y += a * (0.5 + 0.5 * vel) ** (r - 1) * np.exp(-t / tau) * np.sin(ph)
    thump = bfilt(rng.standard_normal(n), 'low', 260.0 + 500 * vel) * np.exp(-t / 0.025) * 0.7
    y = (y + thump) * smoothstep(t / 0.002)
    return y * vel


def timp_part(events, total_n, seed=0):
    rng = np.random.default_rng(seed + 77)
    out = np.zeros(total_n)
    strikes = []
    for ev in events:
        f0 = m2f(ev.midi)
        if ev.art == 'roll':
            t = ev.t0
            k = 0
            dur = ev.t1 - ev.t0
            while t < ev.t1:
                x = (t - ev.t0) / max(dur, 1e-3)
                v = ev.vel * (0.75 + 0.25 * rng.uniform()) * (1.0 if not hasattr(ev, 'cres') else 1.0)
                place(out, timp_hit(f0, v, rng, dur=1.6), t, 0.55)
                t += 1.0 / rng.uniform(15.0, 18.0)
                k += 1
            # the roll ends with a stroke
            place(out, timp_hit(f0, ev.vel, rng), ev.t1, 0.8)
            strikes.append((ev.t0, ev.t1 - ev.t0, 'roll'))
        else:
            place(out, timp_hit(f0, ev.vel, rng), ev.t0, 1.0)
            strikes.append((ev.t0, 0.0, 'hit'))
    return out, strikes


def bass_drum(vel, rng):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    f = 46 + 22 * np.exp(-t / 0.06)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55)
    y += bfilt(rng.standard_normal(n), 'low', 180.0) * np.exp(-t / 0.05) * 0.8
    return y * vel


def cymbal(vel, rng, dur=3.2, choke=None):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = bfilt(rng.standard_normal(n), 'band', (2500, 14000)) * np.exp(-t / (0.9 + 0.5 * vel))
    y += bfilt(rng.standard_normal(n), 'band', (600, 3000)) * np.exp(-t / 0.35) * 0.4
    for _ in range(40):
        f = rng.uniform(300, 9000)
        y += 0.03 * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / rng.uniform(0.3, 1.6))
    y *= smoothstep(t / 0.001)
    if choke:
        y *= 1 - smoothstep((t - choke) / 0.05)
    return y * vel


def cym_roll(dur, vel, rng):
    n = int((dur + 2.0) * SR)
    t = np.arange(n) / SR
    env = (0.08 + 0.92 * smoothstep(t / dur) ** 2) * np.where(t > dur, np.exp(-(t - dur) / 0.8), 1.0)
    y = bfilt(rng.standard_normal(n), 'band', (2000, 12000)) * env
    y *= 1 + 0.2 * np.sin(2 * np.pi * 9 * t)
    return y * vel * 0.6


def tamtam(vel, rng, dur=7.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    bloom = smoothstep(t / 0.35)
    for _ in range(70):
        f = 60 * np.exp(rng.uniform(0, np.log(60)))
        tau = rng.uniform(1.5, 5.0) * (300 / max(f, 300)) ** 0.3
        y += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / tau) * rng.uniform(0.2, 1.0) / np.sqrt(f / 60)
    y = y * (0.3 + 0.7 * bloom)
    y += bfilt(rng.standard_normal(n), 'band', (150, 1500)) * np.exp(-t / 0.15) * 0.5
    y /= np.abs(y).max() + 1e-9
    return y * vel


def harp_note(f0, vel, rng, dur=None):
    tau1 = 1.9 * (220.0 / f0) ** 0.45
    dur = dur or min(4.0, tau1 * 4)
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k in range(1, 16):
        fk = f0 * k * (1 + 0.0002 * k * k)
        if fk > 10000:
            break
        a = (1.0 / k ** 1.6) * (0.3 if k == 2 else 1.0) * (1 + 0.6 * vel * (k > 2))
        y += a * np.exp(-t * (1 + 0.55 * (k - 1)) / tau1) * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28))
    y *= smoothstep(t / 0.004)
    y += bfilt(rng.standard_normal(n), 'band', (800, 5000)) * np.exp(-t / 0.006) * 0.08
    return y * vel


def harp_part(events, total_n, seed=0):
    rng = np.random.default_rng(seed + 91)
    out = np.zeros(total_n)
    for ev in events:
        place(out, harp_note(m2f(ev.midi), ev.vel, rng), ev.t0, 0.5)
    return out


def organ_note(ev, rng, stops='full'):
    dur = max(0.1, ev.t1 - ev.t0)
    rel = 0.35
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    f0 = m2f(ev.midi)
    ranks = {'full': ((0.5, 0.55), (1.0, 1.0), (2.0, 0.65), (3.0, 0.28), (4.0, 0.4), (6.0, 0.16), (8.0, 0.14)),
             'soft': ((1.0, 1.0), (2.0, 0.35), (4.0, 0.1)),
             'reed': ((1.0, 1.0), (2.0, 0.7), (3.0, 0.55), (4.0, 0.45), (5.0, 0.35), (6.0, 0.25))}[stops]
    y = np.zeros(n)
    for r, a in ranks:
        f = f0 * r
        if f > 12000:
            continue
        det = 2 ** (rng.normal(0, 1.5) / 1200)
        # each rank is a pipe: a few harmonics of its own
        for h, ha in ((1, 1.0), (2, 0.25), (3, 0.1)):
            if f * h > 12000:
                break
            y += a * ha * np.sin(2 * np.pi * f * h * det * t + rng.uniform(0, 6.28))
    env = adsr(n, 0.06, rel)
    chiff = bfilt(rng.standard_normal(n), 'band', (min(f0 * 2, 6000), min(f0 * 6, 15000))) * np.exp(-t / 0.03) * 0.25
    return (y * env + chiff) * ev.vel


def organ_part(events, total_n, seed=0, stops='full'):
    rng = np.random.default_rng(seed + 55)
    out = np.zeros(total_n)
    for ev in events:
        place(out, organ_note(ev, rng, stops), ev.t0, 0.16)
    return out


def church_bell(f_nom, vel, rng, dur=9.0):
    """A tuned church bell: hum, prime, minor-third tierce, quint, nominal and the upper partials."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    parts = ((0.5, 0.9, 6.5), (1.0, 0.7, 4.5), (1.2, 0.8, 3.6), (1.5, 0.35, 2.8), (2.0, 1.0, 2.6),
             (2.5, 0.4, 1.6), (2.67, 0.3, 1.4), (3.0, 0.35, 1.2), (4.0, 0.2, 0.8), (5.33, 0.12, 0.5))
    y = np.zeros(n)
    for r, a, tau in parts:
        f = f_nom * r / 2.0
        for d in (-0.35, 0.35):
            y += 0.5 * a * np.exp(-t / tau) * np.sin(2 * np.pi * (f + d * r) * t + rng.uniform(0, 6.28))
    strike = bfilt(rng.standard_normal(n), 'band', (1500, 9000)) * np.exp(-t / 0.01) * 0.6
    return (y + strike) * vel * smoothstep(t / 0.002)


def celesta_note(f0, vel, rng):
    n = int(2.4 * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f0 * t) * np.exp(-t / 1.1)
    y += 0.25 * np.sin(2 * np.pi * f0 * 4.0 * t) * np.exp(-t / 0.25)
    y += 0.08 * np.sin(2 * np.pi * f0 * 9.8 * t) * np.exp(-t / 0.06)
    y *= smoothstep(t / 0.002)
    return y * vel


# =====================================================================================
# the house and the stage: sound effects
# =====================================================================================

def noise_band(n, lo, hi, rng, order=2):
    return bfilt(rng.standard_normal(n), 'band', (lo, hi), order)


def applause(dur, rng, density=40.0, peak=1.0, shape=None):
    """Many hands. density: claps per second per... crowd; shape: envelope function of x in 0..1."""
    n = int(dur * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    clappers = int(density)
    clap_len = int(0.05 * SR)
    tt = np.arange(clap_len) / SR
    for c in range(clappers):
        rate = rng.uniform(3.2, 5.6)
        t = rng.uniform(0, 0.3)
        lo = rng.uniform(600, 1500)
        hi = lo * rng.uniform(2.0, 4.5)
        b, a = signal.butter(2, [lo / (SR / 2), min(hi, 15000) / (SR / 2)], 'band')
        pan = rng.uniform(-1, 1)
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        base = signal.lfilter(b, a, rng.standard_normal(clap_len)) * np.exp(-tt / rng.uniform(0.008, 0.02))
        start = rng.uniform(0, 0.15)
        stop = dur - rng.uniform(0.0, 0.6)
        while t < dur:
            if start <= t <= stop:
                x = t / dur
                g = shape(x) if shape else 1.0
                if rng.uniform() < g:
                    i = int(t * SR)
                    k = min(clap_len, n - i)
                    amp = rng.uniform(0.5, 1.0)
                    L[i:i + k] += gl * amp * base[:k]
                    R[i:i + k] += gr * amp * base[:k]
            t += 1.0 / rate * rng.uniform(0.85, 1.15)
    st = np.vstack([L, R])
    st /= np.abs(st).max() + 1e-9
    return st * peak


def thunder(rng, dur=5.0, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    crack = noise_band(n, 300, 9000, rng) * np.exp(-t / 0.08) * 0.8
    rum = np.zeros(n)
    for _ in range(6):
        c = rng.uniform(0.05, dur * 0.6)
        w = rng.uniform(0.3, 1.2)
        rum += np.exp(-0.5 * ((t - c) / w) ** 2) * rng.uniform(0.4, 1.0)
    rum = bfilt(np.cumsum(rng.standard_normal(n)) * 0.02, 'band', (25, 400)) * rum
    rum /= np.abs(rum).max() + 1e-9
    y = crack + rum * np.exp(-t / (dur * 0.5))
    return y / (np.abs(y).max() + 1e-9) * vel


def wind_sfx(dur, rng, vel=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    y = np.zeros(n)
    for fc, q in ((420, 6), (700, 8), (1100, 10)):
        mod = fc * (1 + 0.25 * slow_noise(n, SR * 1.2, rng))
        # block-wise resonant band-pass that drifts
        blk = 2048
        zi = None
        for i in range(0, n, blk):
            f = float(mod[i])
            b, a = signal.iirpeak(f / (SR / 2), q)
            seg, zi = signal.lfilter(b, a, x[i:i + blk], zi=zi if zi is not None else signal.lfilter_zi(b, a) * 0)
            y[i:i + blk] += seg
    env = (0.5 + 0.5 * slow_noise(n, SR * 1.5, rng)).clip(0.1) * smoothstep(t / 1.0) * (1 - smoothstep((t - dur + 1.5) / 1.5))
    y *= env
    return y / (np.abs(y).max() + 1e-9) * vel


def owl(rng, vel=0.3):
    out = []
    for i, (f, d) in enumerate(((392.0, 0.28), (370.0, 0.55))):
        n = int(d * SR)
        t = np.arange(n) / SR
        fr = f * (1 + 0.03 * np.sin(np.pi * t / d)) * (1 - 0.04 * t / d)
        y = np.sin(2 * np.pi * np.cumsum(fr) / SR)
        y += 0.15 * np.sin(2 * 2 * np.pi * np.cumsum(fr) / SR)
        y += 0.05 * bfilt(rng.standard_normal(n), 'band', (300, 1200))
        y *= np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.7
        out.append(y)
        out.append(np.zeros(int(0.12 * SR)))
    return np.concatenate(out) * vel


def rumble(dur, rng, vel=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = bfilt(np.cumsum(rng.standard_normal(n)) * 0.03, 'band', (20, 160))
    y *= smoothstep(t / (dur * 0.4)) * (1 - smoothstep((t - dur * 0.8) / (dur * 0.2)))
    y /= np.abs(y).max() + 1e-9
    # cracks of earth and stone
    for _ in range(int(dur * 4)):
        c = rng.uniform(0.2, dur * 0.9)
        i = int(c * SR)
        k = int(0.05 * SR)
        if i + k < n:
            y[i:i + k] += noise_band(k, 300, 5000, rng) * np.exp(-np.arange(k) / (0.006 * SR)) * rng.uniform(0.2, 0.7)
    return y * vel


def chomp(rng, vel=0.9):
    """A bite: a crunch of short bursts and a wet squelch."""
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for _ in range(9):
        c = rng.uniform(0.0, 0.16)
        i = int(c * SR)
        k = int(0.02 * SR)
        y[i:i + k] += noise_band(k, 900, 6000, rng) * np.exp(-np.arange(k) / (0.003 * SR)) * rng.uniform(0.4, 1.0)
    sq = noise_band(n, 150, 1200, rng) * np.exp(-((t - 0.12) / 0.09) ** 2)
    f = 300 + 900 * np.exp(-t / 0.08)
    sq += 0.4 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.06)
    y = y + 0.8 * sq
    return y / (np.abs(y).max() + 1e-9) * vel


def glass_clink(rng, vel=0.5):
    n = int(1.5 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f, a, tau in ((2490, 1.0, 0.5), (4130, 0.6, 0.3), (6020, 0.3, 0.18), (2560, 0.7, 0.45)):
        y += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t / tau)
    y[:int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    return y * vel * 0.3


def baton_tap(rng, vel=0.5):
    n = int(0.15 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f, a in ((1400, 1.0), (2300, 0.6), (3900, 0.3), (850, 0.5)):
        y += a * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.018)
    y += noise_band(n, 1500, 8000, rng) * np.exp(-t / 0.003) * 0.6
    return y * vel


def shovel(rng, vel=0.5):
    """A spade into earth: a scrape and a thud of soil."""
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    scrape = noise_band(n, 1200, 6000, rng) * np.exp(-((t - 0.06) / 0.05) ** 2) * (1 + 0.5 * np.sin(2 * np.pi * 60 * t))
    thud = noise_band(n, 80, 600, rng) * np.exp(-((t - 0.16) / 0.04) ** 2) * 1.4
    y = scrape * 0.6 + thud
    return y / (np.abs(y).max() + 1e-9) * vel


def fire_crackle(dur, rng, vel=0.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = noise_band(n, 200, 2000, rng) * (0.25 + 0.15 * slow_noise(n, SR * 0.3, rng)).clip(0)
    for _ in range(int(dur * 14)):
        i = int(rng.uniform(0, dur - 0.05) * SR)
        k = int(0.01 * SR)
        y[i:i + k] += noise_band(k, 1500, 9000, rng) * np.exp(-np.arange(k) / (0.0015 * SR)) * rng.uniform(0.5, 2.5)
    y *= smoothstep(t / 0.8) * (1 - smoothstep((t - dur + 0.8) / 0.8))
    return y / (np.abs(y).max() + 1e-9) * vel


def cough(rng, singer_cls, vel=0.4):
    """Two coughs from row F: noisy bursts through an 'a' tract, with a voiced edge."""
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for c, a in ((0.02, 1.0), (0.34, 0.7)):
        env = np.exp(-np.maximum(t - c, 0) / 0.06) * (t >= c) * smoothstep((t - c) / 0.008)
        burst = noise_band(n, 200, 4500, rng) * env
        burst = peq(burst, 700, 9, 1.2)
        burst = peq(burst, 1300, 6, 1.5)
        voiced = np.sign(np.sin(2 * np.pi * 190 * t)) * env * 0.12
        y += a * (burst + bfilt(voiced, 'low', 2500.0))
    return y / (np.abs(y).max() + 1e-9) * vel


# =====================================================================================
# space and mastering
# =====================================================================================

def hall_ir(dur=2.6, rt_lo=1.9, rt_mid=1.6, rt_hi=0.75, pre=0.022, seed=5):
    """Stereo opera-house impulse response: early reflections plus three-band decaying noise."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for ch in range(2):
        nz = rng.standard_normal(n)
        lo = bfilt(nz, 'low', 350.0)
        mid = bfilt(nz, 'band', (350.0, 3000.0))
        hi = bfilt(nz, 'high', 3000.0)
        tail = (lo * 10 ** (-3 * t / rt_lo) + mid * 10 ** (-3 * t / rt_mid) + 0.7 * hi * 10 ** (-3 * t / rt_hi))
        build = smoothstep((t - pre) / 0.06)
        ir[ch] = tail * build
        for _ in range(14):
            d = pre + rng.uniform(0.002, 0.075)
            i = int(d * SR)
            ir[ch, i] += rng.uniform(0.3, 1.0) * (1.0 - d * 6) * rng.choice((-1, 1)) * 4.0
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    return ir


def convolve_stereo(x, ir):
    """x: (2, n) or (n,), ir: (2, m) -> (2, n)."""
    if x.ndim == 1:
        x = np.vstack([x, x])
    n = x.shape[1]
    out = np.zeros((2, n))
    for ch in range(2):
        out[ch] = signal.oaconvolve(x[ch], ir[ch])[:n]
    return out


def pan_st(x, pan, width=0.0):
    """Equal-power pan of a mono signal; pan -1..1 (a scalar or a per-sample array)."""
    p = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.vstack([x * np.cos(p), x * np.sin(p)])


def _rbj(kind, f0, q, gain_db=0.0):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    cs = np.cos(w)
    if kind == 'hs':
        b = [A * ((A + 1) + (A - 1) * cs + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * cs),
             A * ((A + 1) + (A - 1) * cs - 2 * np.sqrt(A) * al)]
        a = [(A + 1) - (A - 1) * cs + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * cs),
             (A + 1) - (A - 1) * cs - 2 * np.sqrt(A) * al]
    else:  # high-pass
        b = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2]
        a = [1 + al, -2 * cs, 1 - al]
    b, a = np.array(b), np.array(a)
    return b / a[0], a / a[0]


def k_weight(x):
    """BS.1770 K-weighting at 44.1 kHz: a +4 dB high shelf at 1.68 kHz and a 38 Hz high-pass."""
    b1, a1 = _rbj('hs', 1681.974450955533, 0.7071752369554196, 3.999843853973347)
    b2, a2 = _rbj('hp', 38.13547087602444, 0.5003270373238773)
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)


def lufs(x, gate=True):
    """Integrated loudness (BS.1770, 48k coefficients used at 44.1k: close enough for mastering here)."""
    if x.ndim == 1:
        x = x[None, :]
    y = k_weight(x)
    blk = int(0.4 * SR)
    hop = int(0.1 * SR)
    pw = []
    for i in range(0, y.shape[1] - blk, hop):
        pw.append((y[:, i:i + blk] ** 2).mean(axis=1).sum())
    pw = np.array(pw) + 1e-12
    l = -0.691 + 10 * np.log10(pw)
    if gate:
        pw = pw[l > -70]
        l0 = -0.691 + 10 * np.log10(pw.mean())
        pw = pw[-0.691 + 10 * np.log10(pw) > l0 - 10]
    return -0.691 + 10 * np.log10(pw.mean())


def true_peak(x):
    up = signal.resample_poly(x, 4, 1, axis=-1)
    return 20 * np.log10(np.abs(up).max() + 1e-12)


def compressor(x, thr_db=-18.0, ratio=2.0, att=0.02, rel=0.25, makeup=0.0):
    """Stereo-linked RMS compressor."""
    mono = np.sqrt((x ** 2).mean(axis=0))
    env = one_pole_lp(mono ** 2, 1.0 / (2 * np.pi * 0.03))
    lev = 10 * np.log10(env + 1e-12)
    over = np.maximum(lev - thr_db, 0)
    gr = -over * (1 - 1 / ratio)
    # smooth the gain: fast attack, slow release (block-wise)
    g = np.zeros_like(gr)
    a_a = np.exp(-1 / (att * SR))
    a_r = np.exp(-1 / (rel * SR))
    prev = 0.0
    blk = 64
    for i in range(0, len(gr), blk):
        target = gr[i:i + blk].min()
        coef = a_a if target < prev else a_r
        prev = coef ** blk * prev + (1 - coef ** blk) * target
        g[i:i + blk] = prev
    return x * dbl(g + makeup)


def limiter(x, ceiling_db=-1.2, look=0.003, rel=0.08):
    """Look-ahead peak limiter on the 4x-oversampled peak estimate (block-wise gain)."""
    c = dbl(ceiling_db)
    pk = np.abs(x).max(axis=0)
    la = int(look * SR)
    # running max over the look-ahead window
    from scipy.ndimage import maximum_filter1d
    pkw = maximum_filter1d(pk, size=2 * la + 1)
    need = np.minimum(1.0, c / (pkw * 1.12 + 1e-12))
    g = np.ones_like(need)
    a_r = np.exp(-1 / (rel * SR))
    blk = 32
    prev = 1.0
    for i in range(0, len(need), blk):
        target = need[i:i + blk].min()
        if target < prev:
            prev = target
        else:
            prev = a_r ** blk * prev + (1 - a_r ** blk) * target
        g[i:i + blk] = prev
    g = one_pole_lp(g, 400.0)
    g = np.minimum(g, need)
    return x * g
