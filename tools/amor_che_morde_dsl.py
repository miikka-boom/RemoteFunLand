#!/usr/bin/env python3
"""A small notation for writing the opera in Python: tempo maps, melodies with lyrics, chords,
an SATB harmoniser and accompaniment patterns. Used by tools/amor_che_morde.py.

Positions are in quarter-note beats from the start of a number (bar 1, beat 0). A number is a
tempo map: a starting tempo, tempo changes (stepped or ramped) and fermatas (extra seconds after
a position), so every note, cue and surtitle written in bars and beats lands on the exact second.

Melody strings: whitespace-separated tokens.
  pitch[mods]:dur     a note, e.g. c#5:1.5, bb3!:0.5   (dur in quarter beats)
  p1+p2+p3[mods]:dur  a chord (orchestra parts only), e.g. d4+f4+a4!:1
  r:dur               a rest
  pp p mp mf f ff     set the dynamic for the notes that follow
  @leg @stacc @marc @pizz @trem @acc @swell @solo @roll @dim   set the articulation (orchestra)
  mods: ! accent  . staccato  ~ slur (portamento into it)  * growl  ^ swell  < cresc  > dim
        _ fry (creak at the end)  ' spoken (no vibrato)
Lyrics: one syllable per sung note; '_' holds the previous vowel over a new pitch (melisma).
"""
from collections import defaultdict

from amor_che_morde_synth import Note, Ev

PC = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
DYN = {'ppp': 0.12, 'pp': 0.22, 'p': 0.36, 'mp': 0.5, 'mf': 0.62, 'f': 0.76, 'ff': 0.9, 'fff': 1.0}
MODS = {'!': 'acc', '.': 'stacc', '~': 'slur', '*': 'growl', '^': 'swell', '<': 'cresc', '>': 'dim',
        '_': 'fry', "'": 'spoken'}
ORCH_ART = {'acc': 'acc', 'stacc': 'stacc', 'swell': 'swell', 'dim': 'dim'}

SINGERS = {'livia', 'amadeo', 'velena', 'ossobuco'}


def is_voice(part):
    return part in SINGERS or part.startswith(('vill_', 'dead_', 'crowd'))


def pitch(tok):
    """'c#5' -> 73, 'bb3' -> 58, 'e2' -> 40."""
    tok = tok.lower()
    n = PC[tok[0]]
    i = 1
    while i < len(tok) and tok[i] in '#b':
        n += 1 if tok[i] == '#' else -1
        i += 1
    return n + 12 * (int(tok[i:]) + 1)


def split_mods(p):
    mods = set()
    while p and p[-1] in MODS:
        mods.add(MODS[p[-1]])
        p = p[:-1]
    return p, mods


# ------------------------------------------------------------------------------ chords

QUAL = {'': (0, 4, 7), 'm': (0, 3, 7), '7': (0, 4, 7, 10), 'm7': (0, 3, 7, 10), 'maj7': (0, 4, 7, 11),
        'dim': (0, 3, 6), 'dim7': (0, 3, 6, 9), 'm7b5': (0, 3, 6, 10), 'aug': (0, 4, 8),
        'sus4': (0, 5, 7), '7sus4': (0, 5, 7, 10), '6': (0, 4, 7, 9), 'm6': (0, 3, 7, 9),
        '9': (0, 4, 7, 10, 2), '7b9': (0, 4, 7, 10, 1), 'mmaj7': (0, 3, 7, 11), 'add9': (0, 4, 7, 2),
        '5': (0, 7)}


def parse_pc(s):
    n = PC[s[0].lower()]
    for ch in s[1:]:
        n += 1 if ch == '#' else -1
    return n % 12


class Chord:
    __slots__ = ('sym', 'root', 'pcs', 'bass', 'third', 'fifth', 'seventh')

    def __init__(self, sym):
        self.sym = sym
        body, _, bass = sym.partition('/')
        r = body[0]
        k = 1
        while k < len(body) and body[k] in '#b':
            r += body[k]
            k += 1
        q = body[k:]
        if q not in QUAL:
            raise ValueError('chord quality ' + sym)
        self.root = parse_pc(r)
        iv = QUAL[q]
        self.pcs = [(self.root + i) % 12 for i in iv]
        self.bass = parse_pc(bass) if bass else self.root
        self.third = (self.root + iv[1]) % 12 if len(iv) > 1 else None
        self.fifth = (self.root + iv[2]) % 12 if len(iv) > 2 else None
        self.seventh = (self.root + iv[3]) % 12 if len(iv) > 3 else None


def tones_in(pcs, lo, hi):
    return [m for m in range(lo, hi + 1) if m % 12 in pcs]


def voicing(ch, lo, hi, n, prev=None, top=None):
    """Choose n chord tones in [lo, hi]: close or open position, nearest to prev, root and third in."""
    cands = tones_in(ch.pcs, lo, hi)
    if not cands:
        return []
    best, best_cost = None, 1e9
    import itertools
    pool = cands if len(cands) <= 12 else cands
    for combo in itertools.combinations(pool, min(n, len(pool))):
        span = combo[-1] - combo[0]
        if span > 24:
            continue
        pcset = {m % 12 for m in combo}
        cost = 0.0
        if ch.root not in pcset and len(ch.pcs) <= 4:
            cost += 6
        if ch.third is not None and ch.third not in pcset:
            cost += 8
        if ch.seventh is not None and ch.seventh not in pcset and n >= 4:
            cost += 3
        # avoid doubled thirds and seconds at the bottom
        if sum(1 for m in combo if m % 12 == ch.third) > 1:
            cost += 4
        for a, b in zip(combo, combo[1:]):
            if b - a < 3 and a < 55:
                cost += 5
            if b - a < 2:
                cost += 2
        if prev:
            pv = sorted(prev)
            k = min(len(pv), len(combo))
            cost += 0.6 * sum(abs(a - b) for a, b in zip(sorted(combo)[:k], pv[:k]))
        else:
            mid = (lo + hi) / 2
            cost += 0.15 * abs((combo[0] + combo[-1]) / 2 - mid)
        if top is not None:
            cost += 1.5 * abs(combo[-1] - top)
        if cost < best_cost:
            best, best_cost = combo, cost
    return list(best)


# ------------------------------------------------------------------------------ the opera

class Opera:
    def __init__(self):
        self.ev = defaultdict(list)        # orchestra part -> [Ev]
        self.vox = defaultdict(list)       # voice part -> [Note]
        self.sfx = []                      # dict(t, kind, ...)
        self.cues = []                     # [t, kind, *args]
        self.subs = []                     # [t0, t1, who, italian, english]
        self.beats = []                    # [t, beat index in bar, beats in bar]
        self.marks = []                    # [t0, id, label] chapters and numbers
        self.numbers = []

    def cue(self, t, kind, *args):
        self.cues.append([round(float(t), 3), kind] + list(args))

    def sub(self, t0, t1, who, it, en):
        self.subs.append([round(float(t0), 3), round(float(t1), 3), who, it, en])

    def fx(self, t, kind, **kw):
        d = dict(t=float(t), kind=kind)
        d.update(kw)
        self.sfx.append(d)

    def mark(self, t, ident, label, chapter=False):
        self.marks.append([round(float(t), 3), ident, label, bool(chapter)])


class Num:
    """One number of the opera: a tempo map from (bar, beat) to seconds."""

    def __init__(self, op, name, t0, bpm, meter=4.0, conduct=None, title=None):
        self.op = op
        self.name = name
        self.t0 = float(t0)
        self.meter = float(meter)
        self.pts = [(0.0, float(bpm), False)]     # (position, bpm, ramped into)
        self.ferms = []                           # (position, extra seconds)
        self.conduct = conduct or [float(i) for i in range(int(meter))]
        self.chords = []                          # (p0, p1, Chord)
        op.numbers.append(self)
        if title:
            op.mark(self.t0, name, title)

    def pos(self, bar, beat=0.0):
        return (bar - 1) * self.meter + beat

    def tempo(self, bar, beat, bpm, ramp=False):
        """Change tempo at (bar, beat); ramp=True slides linearly from the previous point."""
        self.pts.append((self.pos(bar, beat), float(bpm), ramp))
        self.pts.sort(key=lambda x: x[0])

    def fermata(self, bar, beat, extra):
        self.ferms.append((self.pos(bar, beat), float(extra)))

    def T(self, p):
        """Seconds at position p (quarter beats from bar 1 beat 0)."""
        t = self.t0
        pts = self.pts
        if p < 0:
            return t + 60.0 * p / pts[0][1]
        for i, (p0, b0, _) in enumerate(pts):
            p1 = pts[i + 1][0] if i + 1 < len(pts) else float('inf')
            if p <= p0:
                break
            seg_end = min(p, p1)
            nxt = pts[i + 1] if i + 1 < len(pts) else None
            if nxt is not None and nxt[2]:
                # ramp from b0 at p0 to nxt bpm at p1
                L = p1 - p0
                b1 = nxt[1]
                x = seg_end - p0
                if abs(b1 - b0) < 1e-9:
                    t += 60.0 * x / b0
                else:
                    bx = b0 + (b1 - b0) * x / L
                    t += 60.0 * L / (b1 - b0) * __import__('math').log(bx / b0)
            else:
                t += 60.0 * (seg_end - p0) / b0
            if p <= p1:
                break
        for pf, extra in self.ferms:
            if pf < p - 1e-9:
                t += extra
        return t

    def at(self, bar, beat=0.0):
        return self.T(self.pos(bar, beat))

    def end(self, bar):
        """Seconds at the start of the given bar (e.g. end(9) is the end of bar 8)."""
        return self.T(self.pos(bar, 0.0))

    def beats_until(self, last_bar_exclusive):
        """Export the conductor's beats for bars 1 .. last_bar_exclusive-1."""
        nb = len(self.conduct)
        for bar in range(1, last_bar_exclusive):
            for k, b in enumerate(self.conduct):
                self.op.beats.append([round(self.at(bar, b), 4), k, nb])

    # ---------------------------------------------------------------- writing notes
    def line(self, part, bar, beat, notes, lyr=None, vel=0.6, art='leg', trans=0, flags=(), z=None,
             subs_ok=True):
        """Write a melody. Returns the list of created Note/Ev objects."""
        p = self.pos(bar, beat)
        voice = is_voice(part)
        syl = lyr.split() if lyr else []
        si = 0
        out = []
        cur_art = art
        for tok in notes.split():
            if tok == '|':
                continue
            if tok in DYN:
                vel = DYN[tok]
                continue
            if tok.startswith('@'):
                cur_art = tok[1:]
                continue
            head, _, dur = tok.rpartition(':')
            dur = float(dur)
            if head == 'r':
                p += dur
                continue
            head, mods = split_mods(head)
            pitches = [pitch(h) + trans for h in head.split('+')]
            t0 = self.T(p)
            t1 = self.T(p + dur)
            if voice:
                if si >= len(syl):
                    raise ValueError(f'{self.name} {part}: more notes than syllables at bar {bar} ({lyr!r})')
                n = Note(t0, t1, pitches[0], syl[si], vel=vel, flags=set(flags) | mods, who=part)
                n.z = z
                n.pos = p
                si += 1
                self.op.vox[part].append(n)
                out.append(n)
            else:
                a = cur_art
                for m in mods:
                    if m in ORCH_ART:
                        a = ORCH_ART[m]
                for m in pitches:
                    e = Ev(t0, t1, m, vel, a)
                    self.op.ev[part].append(e)
                    out.append(e)
            p += dur
        if voice and si != len(syl):
            raise ValueError(f'{self.name} {part}: {len(syl)} syllables but {si} notes ({lyr!r})')
        return out

    # ---------------------------------------------------------------- harmony
    def prog(self, bar, beat, text):
        """Chord progression 'Dm:2 A7:2 | ...' starting at (bar, beat). Returns [(p0, p1, Chord)]."""
        p = self.pos(bar, beat)
        out = []
        for tok in text.split():
            if tok == '|':
                continue
            sym, _, dur = tok.rpartition(':')
            dur = float(dur)
            if sym != 'r':
                out.append((p, p + dur, Chord(sym)))
            p += dur
        self.chords.extend(out)
        self.chords.sort(key=lambda c: c[0])
        return out

    def chord_at(self, p):
        best = None
        for c in self.chords:
            if c[0] <= p + 1e-6 < c[1]:
                best = c[2]
        return best

    def choir(self, prefix, bar, beat, sop, lyr, vel=0.6, flags=(), z=None, parts='SATB', lows=None,
              trans=0, written=None):
        """Homophonic chorus: the soprano line as written, alto/tenor/bass derived from the chord
        under each note (held on passing notes). written={'A': '...', 'T': ..., 'B': ...} overrides."""
        written = written or {}
        s_notes = self.line(prefix + '_S', bar, beat, sop, lyr, vel=vel, flags=flags, z=z, trans=trans) if 'S' in parts else []
        if not s_notes:
            return
        for part in 'ATB':
            if part not in parts:
                continue
            if part in written:
                self.line(prefix + '_' + part, bar, beat, written[part], lyr, vel=vel, flags=flags, z=z, trans=trans)
                continue
            prev = None
            for n in s_notes:
                ch = self.chord_at(n.pos)
                s = int(round(n.midi))
                if ch is None:
                    m = {'A': s - 4, 'T': s - 9, 'B': s - 17}[part] if prev is None else prev
                else:
                    passing = (s % 12) not in ch.pcs
                    if passing and prev is not None:
                        m = prev
                    elif part == 'A':
                        c = [x for x in tones_in(ch.pcs, 55, 74) if s - 10 <= x <= s - 3] or [x for x in tones_in(ch.pcs, 55, 74) if x <= s - 1] or [s - 5]
                        m = min(c, key=lambda x: abs(x - prev) if prev else -x)
                    elif part == 'T':
                        c = [x for x in tones_in(ch.pcs, 48, 67) if x <= s - 5] or [s - 12]
                        if prev is None:
                            m = max(c[-3:]) if len(c) >= 1 else s - 12
                        else:
                            m = min(c, key=lambda x: abs(x - prev) + (2 if x % 12 == s % 12 else 0))
                    else:
                        c = tones_in([ch.bass], 40, 60)
                        m = min(c, key=lambda x: abs(x - prev) + (0 if x < 53 else 3)) if prev else (c[1] if len(c) > 1 and c[0] < 43 else c[0])
                prev = m
                nn = Note(n.t0, n.t1, m, n.text, vel=n.vel, flags=n.flags, who=prefix + '_' + part)
                nn.z = n.z
                nn.pos = n.pos
                self.op.vox[prefix + '_' + part].append(nn)

    # ---------------------------------------------------------------- accompaniment patterns
    def _chords_between(self, bar, beat, bar2, beat2):
        p0, p1 = self.pos(bar, beat), self.pos(bar2, beat2)
        return [(max(a, p0), min(b, p1), c) for a, b, c in self.chords if b > p0 and a < p1]

    def pad(self, part, bar, beat, bar2, beat2, lo, hi, n, vel=0.4, art='leg', top=None, gap=0.0):
        prev = None
        for a, b, c in self._chords_between(bar, beat, bar2, beat2):
            v = voicing(c, lo, hi, n, prev, top)
            prev = v
            for m in v:
                self.op.ev[part].append(Ev(self.T(a), self.T(b) - gap, m, vel, art))

    def pulse(self, part, bar, beat, bar2, beat2, lo, hi, n, period, hits, vel=0.4, art='stacc', accent=None):
        """Repeated chords: hits = [(offset, dur)] within each period (beats), on the absolute grid."""
        prev = None
        for a, b, c in self._chords_between(bar, beat, bar2, beat2):
            v = voicing(c, lo, hi, n, prev)
            prev = v
            k0 = int(a // period) - 1
            k = k0
            while k * period < b:
                for off, dur in hits:
                    q = k * period + off
                    if a - 1e-6 <= q < b - 1e-6:
                        vv = vel * (accent if (accent and abs(off) < 1e-6) else 1.0)
                        for m in v:
                            self.op.ev[part].append(Ev(self.T(q), self.T(min(q + dur, b)), m, vv, art))
                k += 1

    def bass(self, part, bar, beat, bar2, beat2, lo, hi, period, hits, vel=0.5, art='stacc', alt_fifth=False):
        """Chord roots (or slash basses) on a rhythm; alt_fifth alternates root and fifth."""
        prev = None
        for a, b, c in self._chords_between(bar, beat, bar2, beat2):
            k = int(a // period) - 1
            i = 0
            while k * period < b:
                for off, dur in hits:
                    q = k * period + off
                    if a - 1e-6 <= q < b - 1e-6:
                        pc = c.bass
                        if alt_fifth and i % 2 == 1 and c.fifth is not None:
                            pc = c.fifth
                        cands = tones_in([pc], lo, hi)
                        m = min(cands, key=lambda x: abs(x - prev) if prev is not None else x - lo)
                        if prev is None:
                            m = cands[0]
                        prev = m
                        self.op.ev[part].append(Ev(self.T(q), self.T(min(q + dur, b)), m, vel, art))
                        i += 1
                k += 1

    def arp(self, part, bar, beat, bar2, beat2, lo, hi, step, vel=0.4, shape='updown', art='leg', ring=1.5):
        """Arpeggiate each chord over [lo, hi] at `step` beats."""
        for a, b, c in self._chords_between(bar, beat, bar2, beat2):
            tones = tones_in(c.pcs, lo, hi)
            if not tones:
                continue
            seq = tones + tones[-2:0:-1] if shape == 'updown' else (tones if shape == 'up' else tones[::-1])
            q = a
            i = 0
            while q < b - 1e-6:
                m = seq[i % len(seq)]
                self.op.ev[part].append(Ev(self.T(q), self.T(q + ring), m, vel * (1.0 if i % len(seq) == 0 else 0.8), art))
                q += step
                i += 1
