#!/usr/bin/env python3
"""L'Amor che Morde (The Love That Bites), opera in tre atti: the score.

Music by Giuseppe Verdastro, libretto by Lorenzo Da Tomba (both, it is rumoured, still around).
Every note, word, surtitle, stage cue and sound effect is written here in bars and beats; the
numbers are laid end to end on one clock. tools/amor_che_morde.py renders it.

Leitmotifs: the Hunger (a groaning neighbour-note figure, D Eb D C# D, and its sung form
'cer-VEL-lo' on a rising semitone) and the Love theme (F major: a rising sixth on 'a-MO-re' and a
falling sequence). The opera's tonal plot runs from the Hunger's D minor to D major in the finale,
where the Love theme is sung by two zombies.
"""
from amor_che_morde_dsl import Opera, Num, Chord, voicing, tones_in, pitch, DYN
from amor_che_morde_synth import Ev, Note

# ------------------------------------------------------------------------------ shared material

LOVE1 = "c5:1 | a5:2 g5:1 bb4:1 | g5:2 f5:1 a4:1 | f5:1.5 e5:0.5 d5:1 c5:1 | bb4:1 a4:1 g4:2"
LOVE1_CH = "F:3 Bb:1 | Gm7:3 F/A:1 | Dm:2 Bb:2 | Gm7:2 C7:2"
LOVE2 = "c5:1 | a5:2 g5:1 a5:0.5 bb5:0.5 | c6:2 bb5:1 a5:1 | g5:1 f5:1 e5:1 g5:1 | f5:3"
LOVE2_CH = "F:4 | F/C:2 Bb:1 F/A:1 | Gm7:2 C7:2 | F:4"

TUTTI_LAYOUT = {
    # part: (lo, hi, n)
    'vln1': (74, 93, 3), 'vln2': (67, 84, 3), 'vla': (57, 72, 2), 'vc': (45, 60, 2),
    'fl': (77, 93, 2), 'ob': (69, 86, 2), 'cl': (62, 81, 2), 'bsn': (45, 62, 2),
    'hn': (55, 74, 4), 'tpt': (67, 81, 2), 'tbn': (48, 65, 3),
}


def tutti(n, bar, beat, dur, sym, vel=0.9, art='acc', skip=(), only=None, timp=True, bd=False, cym=False,
          tam=False, bass_oct=True):
    """A full-orchestra chord on (bar, beat), voiced section by section."""
    ch = Chord(sym)
    for part, (lo, hi, k) in TUTTI_LAYOUT.items():
        if part in skip or (only and part not in only):
            continue
        v = voicing(ch, lo, hi, k)
        for m in v:
            n.op.ev[part].append(Ev(n.at(bar, beat), n.T(n.pos(bar, beat) + dur), m, vel, art))
    if not only or 'cb' in only:
        b = tones_in([ch.bass], 28, 40)[0]
        n.op.ev['cb'].append(Ev(n.at(bar, beat), n.T(n.pos(bar, beat) + dur), b, vel, art))
        if not only or 'tuba' in only:
            tb = tones_in([ch.bass], 33, 45)[0]
            n.op.ev['tuba'].append(Ev(n.at(bar, beat), n.T(n.pos(bar, beat) + dur), tb, vel * 0.9, art))
        if bass_oct and 'vc' not in skip:
            n.op.ev['vc'].append(Ev(n.at(bar, beat), n.T(n.pos(bar, beat) + dur), b + 12, vel, art))
    t = n.at(bar, beat)
    if timp:
        tp = tones_in([ch.bass], 40, 52)
        tp = [m for m in tp if 38 <= m <= 53] or [38]
        n.op.ev['timp'].append(Ev(t, t + 0.1, tp[0], min(1.0, vel), 'hit'))
    if bd:
        n.op.fx(t, 'bd', vel=vel)
    if cym:
        n.op.fx(t, 'cym', vel=vel)
    if tam:
        n.op.fx(t, 'tamtam', vel=vel)


def hunger(n, part, bar, beat, root, vel=0.45, art='leg', octave_part=None):
    """The Hunger motif: root, +1, root, -1, root (1, .5, .5, 1, 1 beats)."""
    from amor_che_morde_dsl import PC
    names = ['c', 'c#', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b']

    def nm(m):
        return names[m % 12] + str(m // 12 - 1)
    s = f"{nm(root)}:1 {nm(root + 1)}:0.5 {nm(root)}:0.5 {nm(root - 1)}:1 {nm(root)}:1"
    n.line(part, bar, beat, s, vel=vel, art=art)
    if octave_part:
        n.line(octave_part, bar, beat, s, vel=vel, art=art, trans=-12)


def heartbeat(op, t, vel=0.35, pitch_=40):
    op.ev['timp'].append(Ev(t, t + 0.1, pitch_, vel, 'hit'))
    op.ev['timp'].append(Ev(t + 0.24, t + 0.34, pitch_, vel * 0.7, 'hit'))


# ==============================================================================================
# PRESHOW: the house, the tuning, the Maestro
# ==============================================================================================

def preshow(op):
    op.mark(0.0, 'top', 'Before the curtain', chapter=True)
    op.cue(0.0, 'house', 1.0, 0.0)
    op.cue(0.0, 'curtain', 'down', 0.0)
    op.cue(0.0, 'scene', 'piazza')
    op.cue(0.0, 'light', 'dusk', 0.0)
    op.cue(0.0, 'maestro', 'away')
    op.fx(0.0, 'murmur', dur=11.8, vel=0.55)
    op.sub(0.6, 5.2, 'house', 'Si prega di spegnere i telefoni.', 'Kindly switch off your phones.')
    op.sub(5.5, 10.4, 'house', 'E di trattenere i lamenti fino alla fine.', 'And kindly hold your groans until the end.')
    E = op.ev
    # the oboe gives the A, then everyone tunes and noodles
    E['ob'] += [Ev(3.0, 6.5, 69, 0.5, 'leg')]
    E['vln1'] += [Ev(4.1, 6.3, 69, 0.3, 'leg'), Ev(6.6, 7.4, 81, 0.25, 'leg'), Ev(7.6, 8.9, 69, 0.3, 'leg'), Ev(7.6, 8.9, 76, 0.3, 'leg'),
                  Ev(9.1, 9.25, 88, 0.3, 'stacc'), Ev(9.3, 9.45, 86, 0.3, 'stacc'), Ev(9.5, 9.65, 84, 0.3, 'stacc')]
    E['vln2'] += [Ev(4.3, 6.0, 69, 0.28, 'leg'), Ev(6.5, 8.0, 62, 0.28, 'leg'), Ev(6.5, 8.0, 69, 0.28, 'leg'), Ev(8.4, 9.6, 55, 0.25, 'leg'), Ev(8.4, 9.6, 62, 0.25, 'leg')]
    E['vla'] += [Ev(4.5, 6.1, 57, 0.28, 'leg'), Ev(7.0, 8.6, 48, 0.25, 'leg'), Ev(7.0, 8.6, 55, 0.25, 'leg'), Ev(8.8, 10.0, 50, 0.25, 'leg'), Ev(8.8, 10.0, 57, 0.25, 'leg')]
    E['vc'] += [Ev(4.6, 6.4, 45, 0.3, 'leg'), Ev(6.8, 8.4, 38, 0.28, 'leg'), Ev(6.8, 8.4, 45, 0.28, 'leg'), Ev(8.6, 10.2, 36, 0.25, 'leg'), Ev(8.6, 10.2, 43, 0.25, 'leg')]
    E['cb'] += [Ev(4.8, 6.6, 33, 0.3, 'leg'), Ev(7.3, 9.0, 28, 0.25, 'leg'), Ev(7.3, 9.0, 33, 0.25, 'leg')]
    for i, m in enumerate([72, 74, 76, 77, 79, 81, 83, 84]):
        E['fl'].append(Ev(5.5 + i * 0.075, 5.5 + i * 0.075 + 0.07, m, 0.35, 'stacc'))
    for i in range(10):
        E['fl'].append(Ev(8.0 + i * 0.07, 8.0 + i * 0.07 + 0.065, 86 if i % 2 == 0 else 88, 0.28, 'stacc'))
    for i, m in enumerate([58, 62, 65, 70, 74, 77]):
        E['cl'].append(Ev(6.4 + i * 0.11, 6.4 + i * 0.11 + 0.1, m, 0.35, 'stacc'))
    E['cl'].append(Ev(8.4, 9.8, 52, 0.3, 'leg'))
    E['hn'] += [Ev(5.2, 6.1, 53, 0.35, 'leg'), Ev(7.5, 8.6, 60, 0.3, 'leg')]
    E['tpt'] += [Ev(8.3, 8.45, 67, 0.4, 'stacc'), Ev(8.48, 8.62, 72, 0.4, 'stacc'), Ev(8.65, 9.1, 76, 0.4, 'leg')]
    E['bsn'] += [Ev(7.2, 8.0, 46, 0.3, 'leg'), Ev(9.0, 9.9, 41, 0.3, 'leg')]
    E['timp'] += [Ev(9.0, 9.1, 38, 0.25, 'hit'), Ev(9.4, 9.5, 45, 0.22, 'hit'), Ev(9.8, 9.9, 45, 0.18, 'hit')]
    for i, m in enumerate(range(55, 91, 2)):
        E['harp'].append(Ev(9.4 + i * 0.03, 10.6, m - (m % 12 in (1, 3, 6, 8, 10)), 0.25, 'leg'))
    # lights down, enter the Maestro
    op.cue(10.4, 'house', 0.0, 1.8)
    op.cue(11.0, 'maestro', 'enter')
    op.fx(11.0, 'applause', dur=4.2, vel=0.75, density=70, shape='swell')
    op.sub(11.2, 15.6, 'house', 'Il Maestro Rigor Mortis!', 'Your conductor this evening: Maestro Rigor Mortis.')
    op.cue(12.3, 'maestro', 'bow')
    op.cue(13.8, 'maestro', 'turn')
    op.cue(14.9, 'maestro', 'tap')
    op.fx(14.95, 'baton', vel=0.5)
    op.fx(15.28, 'baton', vel=0.45)
    op.cue(15.55, 'maestro', 'raise')
    return 16.0


# ==============================================================================================
# SINFONIA
# ==============================================================================================

def sinfonia(op, t0):
    op.mark(t0, 'sinfonia', 'Sinfonia', chapter=True)
    op.cue(t0, 'maestro', 'conduct')
    op.sub(t0 + 0.2, t0 + 4.0, 'title', 'Sinfonia', 'Overture')
    # ---- Largo: two hammer blows, then the Hunger creeps in the basses
    A = Num(op, 'largo', t0, 60, 4, title='Sinfonia: Largo')
    tutti(A, 1, 0, 0.75, 'Dm', vel=0.95, bd=True, cym=True)
    tutti(A, 1, 2, 0.75, 'Eb/G', vel=0.95, timp=False, bd=True, tam=True)
    A.prog(2, 0, "Dm:4 | Bdim7/F:4 | Fm/Ab:2 C7:2")
    A.fermata(4, 2, 1.6)
    hunger(A, 'vc', 2, 0, 50, vel=0.42, octave_part='cb')
    hunger(A, 'bsn', 2, 0, 50, vel=0.32)
    hunger(A, 'vc', 3, 0, 53, vel=0.48, octave_part='cb')
    hunger(A, 'bsn', 3, 0, 53, vel=0.36)
    A.line('vc', 4, 0, "ab3:0.5 a3:0.5 bb3:0.5 b3:0.5 c4^:2", vel=0.55)
    A.line('cb', 4, 0, "ab2:0.5 a2:0.5 bb2:0.5 b2:0.5 c3:2", vel=0.5)
    A.line('bsn', 4, 0, "ab3:0.5 a3:0.5 bb3:0.5 b3:0.5 c4:2", vel=0.4)
    A.pad('vln1', 2, 0, 4, 2, 69, 86, 2, vel=0.22, art='trem')
    A.pad('vln2', 2, 0, 4, 2, 62, 77, 1, vel=0.2, art='trem')
    A.pad('vla', 2, 0, 4, 2, 55, 67, 1, vel=0.2, art='trem')
    op.ev['timp'] += [Ev(A.at(2), A.at(3) - 0.05, 38, 0.18, 'roll'), Ev(A.at(3), A.at(4) - 0.05, 45, 0.22, 'roll')]
    # the C7 that opens the door to the Love theme, and a harp glissando up into it
    A.pad('vln1', 4, 2, 5, 0, 70, 84, 2, vel=0.38, art='swell')
    A.pad('vln2', 4, 2, 5, 0, 60, 72, 2, vel=0.34, art='swell')
    A.pad('hn', 4, 2, 5, 0, 55, 70, 3, vel=0.34, art='swell')
    A.line('cl', 4, 2, "e5^:2", vel=0.35)
    t_g = A.at(4, 2) + 0.4
    gl = [m for m in range(53, 89) if m % 12 in (0, 4, 7, 10)]
    for i, m in enumerate(gl):
        op.ev['harp'].append(Ev(t_g + i * 0.075, t_g + 2.4, m, 0.32))
    op.sub(A.at(2), A.at(4), 'title', 'La Fame', 'The Hunger')
    # ---- Andante: the Love theme
    tB = A.end(5)
    B = Num(op, 'andante', tB - 3 * 60 / 66.0, 66, 4, title='Sinfonia: Andante')
    B.prog(2, 0, LOVE1_CH.replace('C7:2', 'C7:1 A7:1'))
    B.line('vln1', 1, 3, LOVE1.replace('g4:2', 'g4:1 c#5:1'), vel=0.55)
    B.line('fl', 4, 0, "f6:1.5 e6:0.5 d6:1 c6:1 | bb5:1 a5:1 g5:1 c#6:1", vel=0.3)
    B.line('vc', 2, 0, "f3:2 e3:1 d3:1 | bb2:2 c3:1 f3:1 | d3:2 bb2:2 | g2:2 a2:2", vel=0.4)
    B.bass('cb', 2, 0, 6, 0, 29, 41, 4, [(0, 3.5)], vel=0.32, art='leg')
    B.pad('vln2', 2, 0, 6, 0, 62, 74, 2, vel=0.24, art='leg')
    B.pad('vla', 2, 0, 6, 0, 55, 67, 1, vel=0.24, art='leg')
    B.pad('hn', 3, 0, 6, 0, 55, 67, 2, vel=0.24, art='leg')
    B.arp('harp', 2, 0, 6, 0, 53, 77, 0.25, vel=0.3, ring=1.2)
    op.sub(B.at(1, 3), B.end(6), 'title', "L'Amore", 'Love')
    # ---- Allegro: the zombie march, a crescendo in the old manner
    tC = B.end(6)
    C = Num(op, 'allegro', tC, 132, 2, conduct=[0.0, 1.0], title='Sinfonia: Allegro')
    march = ("d4.:0.25 d4.:0.25 f4.:0.5 e4.:0.5 c#4.:0.5 | d4.:0.5 a3.:0.5 r:1 | d4.:0.25 d4.:0.25 f4.:0.5 g4.:0.5 bb4.:0.5 | a4.:1 r:1 | "
             "bb4.:0.25 bb4.:0.25 a4.:0.5 g4.:0.5 f4.:0.5 | e4.:0.5 f4.:0.5 g4.:0.5 e4.:0.5 | d4.:0.5 c#4.:0.5 d4.:0.5 e4.:0.5 | d4.:1 r:1")
    march_ch = "Dm:1 A7:1 | Dm:2 | Dm:1 Gm:1 | A7:2 | Gm:2 | A7:2 | Dm:1 A7:1 | Dm:2"
    C.prog(1, 0, march_ch + " | " + march_ch.replace('| Dm:2', '| Dm:2', 1) + " | Dm:2 | Gm:2 | A7:2 | D:2 | D:2")
    C.line('bsn', 1, 0, march, vel=0.5)
    C.line('cl', 1, 0, march, vel=0.4, trans=12)
    C.line('vln1', 9, 0, march, vel=0.62, art='stacc', trans=12)
    C.line('fl', 9, 0, march, vel=0.45, trans=24)
    C.line('ob', 9, 0, march, vel=0.4, trans=12)
    C.line('vln2', 9, 0, march, vel=0.55, art='stacc')
    C.bass('vc', 1, 0, 17, 0, 38, 50, 2, [(0, 0.4), (1, 0.4)], vel=0.5, art='pizz', alt_fifth=True)
    C.bass('cb', 1, 0, 17, 0, 26, 38, 2, [(0, 0.4), (1, 0.4)], vel=0.5, art='pizz', alt_fifth=True)
    C.pulse('vla', 1, 0, 9, 0, 57, 69, 2, 1.0, [(0.5, 0.3)], vel=0.42, art='pizz')
    C.pulse('vln2', 1, 0, 9, 0, 62, 74, 2, 1.0, [(0.5, 0.3)], vel=0.38, art='pizz')
    C.pulse('vla', 9, 0, 13, 0, 57, 69, 2, 1.0, [(0.5, 0.3)], vel=0.55, art='stacc')
    C.pulse('hn', 9, 0, 13, 0, 57, 69, 2, 1.0, [(0.5, 0.3)], vel=0.5, art='stacc')
    for b in range(1, 13):
        op.ev['timp'].append(Ev(C.at(b), C.at(b) + 0.1, 38 if b % 2 else 45, 0.25 + 0.04 * b, 'hit'))
    op.fx(C.at(9), 'cymroll', dur=C.at(13) - C.at(9), vel=0.4)
    # cadence: Dm | Gm | A7 | D  D
    tutti(C, 13, 0, 0.5, 'Dm', vel=0.85)
    C.line('vln1', 13, 0, "@stacc ff d6:0.5 a5:0.5 f5:0.5 d5:0.5 | bb5:0.5 g5:0.5 d5:0.5 bb4:0.5", vel=0.85)
    tutti(C, 14, 0, 0.5, 'Gm', vel=0.85)
    tutti(C, 15, 0, 1.8, 'A7', vel=0.88, art='trem')
    C.line('vln1', 15, 0, "@leg a5:0.5 c#6:0.5 e6:0.5 g6:0.5", vel=0.85)
    op.ev['timp'].append(Ev(C.at(15), C.at(16) - 0.02, 45, 0.6, 'roll'))
    tutti(C, 16, 0, 0.45, 'D', vel=0.95, cym=True, bd=True)
    tutti(C, 16, 1, 1.6, 'D', vel=0.98, cym=True, bd=True)
    C.fermata(16, 1, 0.9)
    op.ev['timp'].append(Ev(C.at(16, 1) + 0.05, C.at(16, 1) + 1.4, 38, 0.6, 'roll'))
    op.sub(C.at(1), C.at(16), 'title', 'Marcia dei Morti', 'March of the Dead')
    for nn, last in ((A, 5), (C, 17)):
        nn.beats_until(last)
    B.beats_until(6)
    op.cue(C.at(16, 1) + 1.6, 'maestro', 'rest')
    return C.at(16, 1) + 2.2


# ==============================================================================================
# ATTO PRIMO: LE NOZZE
# ==============================================================================================

def act1(op, t0):
    op.mark(t0, 'act1', 'Atto primo: Le nozze', chapter=True)
    op.cue(t0 - 0.6, 'maestro', 'conduct')
    op.cue(t0, 'curtain', 'up', 3.0)
    op.cue(t0, 'light', 'wedding', 2.0)
    op.cue(t0, 'at', 'livia', 0.05, 1)
    op.cue(t0, 'at', 'amadeo', 0.22, -1)
    op.cue(t0, 'at', 'velena', -0.72, 1)
    op.cue(t0, 'group', 'vill', 'wedding', 0.0)
    op.sub(t0 + 0.2, t0 + 3.6, 'title', 'Atto primo: Le nozze', 'Act One: The Wedding. A village square, at sunset.')
    # ---- No. 1 Coro nuziale (G major, 6/8)
    N = Num(op, 'coro_nuziale', t0, 108, 3.0, conduct=[0.0, 1.5], title='Coro nuziale')
    op.cue(N.at(1), 'fx', 'bells', 5.0)
    op.cue(N.at(3), 'fx', 'petals', N.at(16) - N.at(3))
    for k in range(10):
        op.fx(N.at(1) + k * 0.42 + (0.1 if k % 3 == 2 else 0.0), 'bell', pitch=[79, 74, 71, 67][k % 4], vel=0.32, small=True)
    N.prog(1, 0, "G:3 | D7:1.5 G:1.5 | G:3 | G:3 | C:3 | D7:3 | G:1.5 Em:1.5 | C:3 | G/D:1.5 D7:1.5 | G:3 | "
                 "G:1.5 D/F#:1.5 | C:3 | G:1.5 C:1.5 | D7:3 | G:3 | D7:1.5 G:1.5")
    fan = "g4!:1.5 b4:0.5 d5:1 | f#5:1 a5:0.5 g5!:1.5"
    N.line('tpt', 1, 0, fan, vel=0.7)
    N.line('hn', 1, 0, fan, vel=0.6, trans=-12)
    N.line('vln1', 1, 0, "g5:0.5 a5:0.5 b5:0.5 c6:0.5 d6:1 | c6:0.5 a5:0.5 f#5:0.5 g5:1.5", vel=0.6, art='stacc')
    sop = ("d5:1.5 b4:0.5 d5:1 | g5:2 d5:1 | e5:1.5 c5:0.5 e5:1 | d5:2 r:1 | "
           "b4:1 c5:0.5 d5:1 e5:0.5 | g5:2 e5:1 | d5:1 b4:0.5 c5:1 a4:0.5 | g4:2 r:1")
    lyr = "Vi va gli spo si Vi va la mor Suo na no a fe sta can ta no i cuor"
    N.choir('vill', 3, 0, sop, lyr, vel=0.62)
    N.line('vln1', 3, 0, sop, vel=0.45, trans=12)
    N.line('fl', 3, 0, sop, vel=0.3, trans=12)
    N.line('ob', 3, 0, sop, vel=0.32)
    N.bass('cb', 1, 0, 17, 0, 31, 43, 1.5, [(0, 0.7)], vel=0.42, art='pizz')
    N.bass('vc', 1, 0, 17, 0, 43, 55, 1.5, [(0, 0.7)], vel=0.4, art='pizz')
    N.pulse('vla', 3, 0, 17, 0, 55, 67, 2, 1.5, [(0.5, 0.4), (1.0, 0.4)], vel=0.3, art='stacc')
    N.pulse('vln2', 3, 0, 17, 0, 62, 74, 2, 1.5, [(0.5, 0.4), (1.0, 0.4)], vel=0.28, art='stacc')
    N.pad('hn', 3, 0, 11, 0, 55, 67, 2, vel=0.25)
    op.sub(N.at(3), N.at(5), 'vill', 'Viva gli sposi!', 'Long live the bride and groom!')
    op.sub(N.at(5), N.at(7), 'vill', "Viva l'amor!", 'Long live love!')
    op.sub(N.at(7), N.at(9), 'vill', 'Suonano a festa...', 'The bells ring out for the wedding...')
    op.sub(N.at(9), N.at(11), 'vill', '...cantano i cuor!', '...and every heart is singing!')
    op.cue(N.at(3), 'group', 'vill', 'cheer', 0.0)
    # the couple, in tenths
    N.line('livia', 11, 0, "b4:1 d5:0.5 g5:1 f#5:0.5 | e5:2 r:1", "Per sem pre tu a", vel=0.6)
    N.line('amadeo', 11, 0, "g3:1 b3:0.5 e4:1 d4:0.5 | c4:2 r:1", "Per sem pre tu o", vel=0.6)
    N.line('livia', 13, 0, "b4:1 c5:0.5 d5:1 e5:0.5 | f#5:1 g5:0.5 a5~:1.5 | g5^:3", "Fin ché mor te ci se pa ri", vel=0.68)
    N.line('amadeo', 13, 0, "g3:1 a3:0.5 b3:1 c4:0.5 | d4:1 e4:0.5 f#4~:1.5 | b3^:3", "Fin ché mor te ci se pa ri", vel=0.66)
    N.choir('vill', 15, 0, "r:1.5 d5:0.5 g5!:1", "Vi va", vel=0.7)
    N.pad('vln2', 11, 0, 16, 0, 62, 74, 2, vel=0.28)
    N.line('vln1', 13, 0, "b5:1 c6:0.5 d6:1 e6:0.5 | f#6:1 g6:0.5 a6:1.5 | g6:3", vel=0.3)
    N.arp('harp', 11, 0, 16, 0, 55, 79, 0.5, vel=0.3)
    op.sub(N.at(11), N.at(13), 'livia', 'Per sempre tua! / Per sempre tuo!', 'Forever yours! / Forever yours!')
    op.sub(N.at(13), N.at(15, 1.5), 'livia', 'Finché morte ci separi!', 'Till death do us part!')
    op.sub(N.at(15, 1.5), N.at(16, 1.5), 'vill', 'Viva!', 'Hooray!')
    op.cue(N.at(11), 'pose', 'livia', 'heart')
    op.cue(N.at(11), 'pose', 'amadeo', 'heart')
    op.cue(N.at(13), 'pose', 'livia', 'arms')
    op.cue(N.at(13), 'pose', 'amadeo', 'arms')
    op.cue(N.at(15), 'pose', 'livia', 'idle')
    op.cue(N.at(15), 'pose', 'amadeo', 'idle')
    tutti(N, 16, 0, 0.7, 'D7', vel=0.7)
    tutti(N, 16, 1.5, 1.2, 'G', vel=0.78, cym=True)
    N.beats_until(17)
    t = N.end(17)

    # ---- No. 2 Brindisi (E minor waltz): the Contessa's poisoned toast
    W = Num(op, 'brindisi', t, 150, 3.0, conduct=[0.0, 1.0, 2.0], title='Brindisi')
    op.cue(W.at(1), 'move', 'velena', -0.25, 2.4)
    op.cue(W.at(1), 'group', 'vill', 'wedding', 0.0)
    op.cue(W.at(1), 'pose', 'velena', 'toast')
    W.prog(1, 0, "Em:3 | Em:3 | Em:3 | C:3 | B7:3 | Em:3 | Em:3 | B7:3 | Em/G:3 | B7:3 | Em:3 | Em:3 | Em:3 | Em:3 | G:3 | D/F#:1.5 Em:1.5 | A#dim7:3")
    W.line('cl', 1, 0, "b4:0.5 a#4:0.5 a4:0.5 g#4:0.5 g4:0.5 f#4:0.5 | e4:2 r:1", vel=0.4)
    W.bass('cb', 1, 0, 17, 0, 28, 40, 3, [(0, 0.6)], vel=0.42, art='pizz')
    W.bass('vc', 1, 0, 17, 0, 40, 52, 3, [(0, 0.6)], vel=0.4, art='pizz')
    W.pulse('vla', 1, 0, 17, 0, 55, 67, 2, 3, [(1, 0.5), (2, 0.5)], vel=0.32, art='pizz')
    W.pulse('vln2', 1, 0, 17, 0, 62, 74, 2, 3, [(1, 0.5), (2, 0.5)], vel=0.3, art='pizz')
    W.line('velena', 3, 0, "e5:1.5 d#5:0.5 e5:0.5 f#5:0.5 | g5:1 f#5:0.5 e5:0.5 r:1", "Al za te i ca li ci", vel=0.66)
    W.line('velena', 5, 0, "b4:1.5 c5:0.5 b4:0.5 a4:0.5 | g4:1 f#4:0.5 e4:0.5 r:1", "Bril la il vi no ros so", vel=0.62)
    W.line('velena', 7, 0, "e5:0.5 g5:1.5 e5:1 | b5~:1.5 a5:0.5 r:1", "Be vi mia ca ra", vel=0.7)
    W.line('velena', 9, 0, "g4:1 f#4:0.5 f4:0.5 e4:1 | d#4:1 e4_:1 r:1", "è av ve le na to", vel=0.4, flags=('breathy',))
    W.line('bsn', 9, 0, "g3:1 f#3:0.5 f3:0.5 e3:1 | d#3:1 e3:1 r:1", vel=0.35)
    W.line('velena', 11, 0, "r:1 b4:1 e5:1 | g5^:3", "Sa lu te", vel=0.8)
    W.line('vln1', 3, 0, "e6:1.5 d#6:0.5 e6:0.5 f#6:0.5 | g6:1 f#6:0.5 e6:0.5 r:1", vel=0.3)
    W.line('vln1', 7, 0, "e6:0.5 g6:1.5 e6:1 | b6:1.5 a6:0.5 r:1", vel=0.32)
    W.choir('vill', 13, 0, "r:1 b4:1 e5:1 | e5^:3", "Sa lu te", vel=0.72)
    op.fx(W.at(13, 0.6), 'clink', vel=0.55)
    op.fx(W.at(13, 1.1), 'clink', vel=0.4)
    op.cue(W.at(13), 'pose', 'livia', 'drink')
    op.cue(W.at(13), 'pose', 'amadeo', 'toast')
    op.cue(W.at(13), 'fx', 'glasses')
    W.line('livia', 15, 0, "b4:1 d5:1 g5:1 | f#5:2 e5:1", "Che dol ce vi no", vel=0.5)
    W.pad('vln1', 15, 0, 17, 0, 67, 84, 2, vel=0.22)
    W.line('livia', 17, 0, "b5!:2", "ah", vel=0.85)
    tutti(W, 17, 0, 1.4, 'A#dim7', vel=0.9, art='sfz', cym=True)
    op.cue(W.at(17), 'pose', 'livia', 'clutch')
    op.cue(W.at(17), 'pose', 'velena', 'gloat')
    op.cue(W.at(9), 'pose', 'velena', 'aside')
    op.cue(W.at(11), 'pose', 'velena', 'toast')
    op.cue(W.at(3), 'group', 'vill', 'toast', 0.0)
    op.sub(W.at(1), W.at(3), 'velena', '', '[The Contessa Velena. He was engaged to her first.]')
    op.sub(W.at(3), W.at(5), 'velena', 'Alzate i calici!', 'Raise your glasses!')
    op.sub(W.at(5), W.at(7), 'velena', 'Brilla il vino rosso!', 'How the red wine sparkles!')
    op.sub(W.at(7), W.at(9), 'velena', 'Bevi, mia cara!', 'Drink up, my dear!')
    op.sub(W.at(9), W.at(11), 'velena', '(È avvelenato...)', "(It's poisoned.)")
    op.sub(W.at(11), W.at(13), 'velena', 'Salute!', 'Cheers!')
    op.sub(W.at(13), W.at(15), 'vill', 'Salute!', 'Cheers!')
    op.sub(W.at(15), W.at(17), 'livia', 'Che dolce vino...', 'What a sweet wine...')
    op.sub(W.at(17), W.at(18), 'livia', 'Ah!', 'Ah!')
    W.beats_until(18)
    t = W.end(18)

    # ---- No. 3 Aria: Muoio (E minor Largo): she dies, at length
    D = Num(op, 'muoio', t, 54, 4, title='Aria: Muoio')
    D.prog(1, 0, "Em:4 | B7/D#:4 | Em/D:2 G/D:2 | A7/C#:4 | Cmaj7:4 | Am/C:2 B7:2 | Em:4")
    D.fermata(6, 2, 3.2)
    D.tempo(7, 0, 54)
    D.tempo(8, 0, 40, ramp=True)
    D.line('livia', 1, 0, "r:1 c5^:1.5 b4:1.5", "Muo io", vel=0.55)
    D.line('livia', 2, 0, "a4:1 f#4:1 r:0.5 b4:0.5 c5:0.5 d#5:0.5", "Muo io A ma de", vel=0.55)
    D.line('livia', 3, 0, "e5:2 d5:0.5 c5:0.5 b4:0.5 a4:0.5 | g4:1 e5~:1.5 c#5:1.5", "o il mon do si fa scu ro", vel=0.6)
    D.line('livia', 5, 0, "e5:1 f5:0.5 e5:0.5 r:0.5 g5:0.5 b5:1 | c6<:4", "Ma pri ma un bel do", vel=0.72)
    D.line('livia', 7, 0, "b4:1 g4:1 e4>_:2", "Ad di o", vel=0.45)
    # the orchestra: lament bass, pulsing strings, a heartbeat that slows and stops
    D.bass('vc', 1, 0, 8, 0, 45, 57, 4, [(0, 3.9)], vel=0.36, art='leg')
    D.bass('cb', 1, 0, 8, 0, 31, 45, 4, [(0, 3.9)], vel=0.32, art='leg')
    D.pulse('vla', 1, 0, 7, 0, 55, 67, 2, 1.0, [(0, 0.45), (0.5, 0.45)], vel=0.24, art='leg')
    D.pulse('vln2', 1, 0, 7, 0, 62, 74, 2, 1.0, [(0, 0.45), (0.5, 0.45)], vel=0.22, art='leg')
    D.line('vln1', 3, 0, "e6:2 d6:0.5 c6:0.5 b5:0.5 a5:0.5 | g5:1 e6:1.5 c#6:1.5", vel=0.24)
    D.pad('vln1', 5, 0, 7, 0, 72, 88, 2, vel=0.4, art='swell')
    D.pad('hn', 5, 0, 7, 0, 55, 70, 3, vel=0.36, art='swell')
    D.pad('fl', 6, 0, 7, 0, 76, 88, 2, vel=0.3)
    D.line('ob', 1, 0, "r:1 c5:1.5 b4:1.5", vel=0.25)
    D.pad('vln1', 7, 0, 8, 0, 64, 76, 2, vel=0.16)
    for k in range(int(6 * 4)):
        bar, beat = 1 + k // 4, k % 4
        heartbeat(op, D.at(bar, beat), vel=0.22 + (0.1 if bar >= 5 else 0.0))
    for beat in (0, 1, 2.2):
        heartbeat(op, D.at(7, beat), vel=0.18 - 0.04 * beat)
    op.cue(D.at(1), 'pose', 'livia', 'swoon')
    op.cue(D.at(1), 'group', 'vill', 'worry', 0.0)
    op.cue(D.at(1), 'pose', 'velena', 'aside')
    op.cue(D.at(2), 'pose', 'amadeo', 'kneel')
    op.cue(D.at(3), 'pose', 'livia', 'kneel')
    op.cue(D.at(5), 'pose', 'livia', 'rise')
    op.cue(D.at(6), 'pose', 'livia', 'arms')
    op.cue(D.at(7), 'pose', 'livia', 'die')
    op.cue(D.at(7, 2.6), 'pose', 'livia', 'dead')
    op.sub(D.at(1), D.at(2), 'livia', 'Muoio...', 'I am dying...')
    op.sub(D.at(2), D.at(3), 'livia', 'Muoio, Amadeo...', 'I am dying, Amadeo...')
    op.sub(D.at(3), D.at(5), 'livia', 'Il mondo si fa scuro...', 'The world grows dark...')
    op.sub(D.at(5), D.at(6), "livia", "Ma prima... un bel do!", '...but first, one last high C.')
    op.sub(D.at(6), D.at(6, 2.0), 'livia', 'Dooo!', 'Cccccc!')
    op.sub(D.at(6, 2.0), D.at(7), 'livia', 'Dooo...', '[She is still dying.]')
    op.sub(D.at(7), D.at(8), 'livia', 'Addio...', 'Farewell...')
    D.beats_until(8)
    t = D.end(8)
    # a cough in row F, then the groom, then everyone
    op.fx(t + 0.55, 'cough', vel=0.45)
    op.sub(t + 0.4, t + 1.6, 'house', '', '[Someone in row F coughs.]')
    E = Num(op, 'e_morta', t + 1.7, 76, 4, title='È morta!')
    E.line('amadeo', 1, 0, "a4!:1.5 r:0.5 b4:1 a4:0.5 g4:0.5 | e4:2 r:2", "No Li vi a _", vel=0.85)
    E.prog(1, 0, "Em/G:4 | Em:2 | B7:2 | Em:4")
    E.pad('vln1', 1, 0, 2, 0, 69, 84, 3, vel=0.5, art='trem')
    E.pad('vla', 1, 0, 2, 0, 55, 67, 2, vel=0.45, art='trem')
    E.choir('vill', 2, 2, "g5!:0.5 g5:1 | e5^:2.5", "È mor ta", vel=0.85)
    tutti(E, 3, 0, 2.6, 'Em', vel=0.95, bd=True, cym=True, tam=True)
    E.tempo(3, 0, 76)
    E.fermata(3, 0, 1.0)
    op.cue(E.at(1), 'pose', 'amadeo', 'despair')
    op.cue(E.at(2, 2), 'group', 'vill', 'gasp', 0.0)
    op.cue(E.at(3, 0.5), 'curtain', 'down', 2.6)
    op.sub(E.at(1), E.at(2, 2), 'amadeo', 'No! Livia!', 'No! Livia!')
    op.sub(E.at(2, 2), E.at(4), 'vill', 'È morta!', 'She is dead!')
    op.sub(E.at(4), E.at(4) + 2.2, 'title', 'Fine del primo atto', '[Until Act Two.]')
    E.beats_until(4)
    op.cue(E.at(4), 'maestro', 'rest')
    op.fx(E.at(3, 2.4), 'applause', dur=4.4, vel=0.6, density=55, shape='fall')
    return E.at(4) + 3.2


# ==============================================================================================
# ATTO SECONDO: IL CIMITERO
# ==============================================================================================

def act2(op, t0):
    op.mark(t0, 'act2', 'Atto secondo: Il cimitero', chapter=True)
    op.cue(t0 - 2.0, 'scene', 'graveyard')
    op.cue(t0 - 2.0, 'show', 'velena', 0)
    op.cue(t0 - 2.0, 'group', 'vill', 'hide', 0.0)
    op.cue(t0 - 2.0, 'at', 'livia', 0.32, -1)
    op.cue(t0 - 2.0, 'pose', 'livia', 'buried')
    op.cue(t0 - 2.0, 'at', 'amadeo', 1.4, -1)
    op.cue(t0 - 2.0, 'at', 'ossobuco', -1.4, 1)
    op.cue(t0 - 2.0, 'light', 'night', 0.0)
    op.cue(t0 - 0.4, 'maestro', 'conduct')
    op.cue(t0, 'curtain', 'up', 3.5)
    op.sub(t0 + 0.2, t0 + 4.2, 'title', 'Atto secondo: Il cimitero', 'Act Two: The Cemetery. Midnight.')
    # ---- No. 4 Mezzanotte: twelve strokes
    op.fx(t0, 'wind', dur=17.0, vel=0.32)
    M = Num(op, 'mezzanotte', t0, 57, 4, title='Mezzanotte')
    M.prog(1, 0, "Cm:16")
    op.ev['cb'] += [Ev(t0, t0 + 16.5, 36, 0.22, 'trem')]
    op.ev['vc'] += [Ev(t0 + 0.5, t0 + 16.5, 43, 0.2, 'trem'), Ev(t0 + 0.5, t0 + 16.5, 48, 0.18, 'trem')]
    words = ['Uno.', 'Due.', 'Tre.', 'Quattro.', 'Cinque.', 'Sei.', 'Sette.', 'Otto.', 'Nove.', 'Dieci.', 'Undici.', 'Dodici.']
    en = ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.', 'Seven. (Yes, all twelve.)', 'Eight.', 'Nine.', 'Ten.', 'Eleven.', 'Twelve. Midnight.']
    tb0 = t0 + 2.2
    for k in range(12):
        tk = tb0 + k * 1.08
        op.fx(tk, 'bell', pitch=60, vel=0.6)
        op.cue(tk, 'fx', 'toll', k + 1)
        op.sub(tk, tk + (1.06 if k < 11 else 2.4), 'bell', words[k], en[k])
    op.fx(tb0 + 3.9, 'owl', vel=0.28)
    op.fx(tb0 + 9.7, 'owl', vel=0.22)
    op.cue(tb0 + 3.9, 'fx', 'owl', 1.2)
    op.cue(tb0 + 9.7, 'fx', 'owl', 1.2)
    for i, m in enumerate([84, 87, 91, 86, 84, 79]):
        op.fx(tb0 + 13.1 + i * 0.32, 'celesta', pitch=m, vel=0.22)
    t = tb0 + 11 * 1.08 + 2.6

    # ---- No. 5 Aria del becchino: Ossobuco's patter (F major 2/4)
    P = Num(op, 'becchino', t, 138, 2, conduct=[0.0, 1.0], title='Aria del becchino')
    op.cue(P.at(1), 'move', 'ossobuco', -0.45, 2.2)
    op.cue(P.at(1), 'pose', 'ossobuco', 'dig')
    op.cue(P.at(1), 'light', 'moon', 1.5)
    ch = ("F:2 | C7:2 | F:2 | F:2 | C7:2 | C7:2 | F:2 | Bb:1 C7:1 | C7:2 | F:2 | "
          "F:2 | F:2 | C7:2 | C7:2 | F:2 | F:2 | F:2 | Bb:2 | C7:2 | F:2 | C7:2 | F:2 | Bb:1 C7:1 | F:2 | F:2")
    P.prog(1, 0, ch)
    P.bass('cb', 1, 0, 26, 0, 29, 41, 2, [(0, 0.4), (1, 0.4)], vel=0.42, art='pizz', alt_fifth=True)
    P.bass('vc', 1, 0, 26, 0, 41, 53, 2, [(0, 0.4), (1, 0.4)], vel=0.36, art='pizz', alt_fifth=True)
    P.pulse('vla', 1, 0, 26, 0, 57, 67, 2, 1.0, [(0.5, 0.25)], vel=0.3, art='pizz')
    P.pulse('vln2', 1, 0, 26, 0, 62, 72, 2, 1.0, [(0.5, 0.25)], vel=0.26, art='pizz')
    P.line('bsn', 1, 0, "f3.:0.5 c3.:0.5 a3.:0.5 c3.:0.5 | e3.:0.5 c3.:0.5 g3.:0.5 bb3.:0.5", vel=0.45)
    for b in (1, 2, 4, 6, 8, 10):
        op.fx(P.at(b), 'shovel', vel=0.45)
        op.cue(P.at(b), 'fx', 'dig')
    lines = [
        (3, "c3:0.5 c3:0.5 c3:0.5 c3:0.5 | f3:0.5 f3:0.25 f3:0.25 a3:0.5 f3:0.5", "Sca vo sca vo tut ta la not te",
         'Scavo, scavo, tutta la notte,', 'I dig and I dig the whole night through,'),
        (5, "c3:0.5 e3:0.25 g3:0.25 bb3:0.5 g3:0.5 | e3:0.5 c3:0.5 g3:0.5 c3:0.5", "sep pel li sco tut ti i mor ti",
         'seppellisco tutti i morti,', 'I bury the dead, as gravediggers do,'),
        (7, "a3:0.5 a3:0.25 a3:0.25 c4:0.5 a3:0.5 | bb3:0.5 d4:0.5 c4:0.5 bb3:0.5", "ma la mat ti na che sor pre sa",
         'ma la mattina, che sorpresa!', 'but come the morning, what a surprise:'),
        (9, "g3:0.5 g3:0.5 bb3:0.5 g3:0.5 | e3:0.5 c4!:0.5 a3:0.25 f3!:0.5 f3:0.25", "le tom be vuo te tut ti fuo ri",
         'Le tombe vuote! Tutti fuori!', 'the graves are empty! The lot of them, out!'),
        (11, "c3:0.5 f3:0.25 f3:0.25 f3:0.5 a3:0.5 | c4!:0.75 a3:0.25 r:1", "Il si gnor con te fuo ri",
         'Il signor conte? Fuori!', 'His Lordship the Count? Out!'),
        (13, "c3:0.5 g3:0.25 g3:0.25 g3:0.5 bb3:0.5 | c4!:0.75 g3:0.25 r:1", "La non na Pi na fuo ri",
         'La nonna Pina? Fuori!', 'Old Granny Pina? Out!'),
        (15, "c3:0.5 a3:0.5 a3:0.5 a3:0.5 | c4!:0.75 a3:0.25 r:1 | f3.':0.25 f3.':0.25 f3.':0.25 f3.':0.25 r:1",
         "Mio co gna to fuo ri me no ma le", 'Mio cognato? Fuori! (Meno male.)', 'My brother-in-law? Out! (Thank goodness.)'),
        (18, "d3:0.5 d3:0.25 d3:0.25 f3:0.5 bb3:0.5 | e3:0.5 g3:0.5 c4:0.5 bb3:0.5", "Nes su no re sta sot to ter ra",
         'Nessuno resta sotto terra!', 'Nobody stays in the ground any more!'),
        (20, "a3:0.5 a3:0.5 c4:0.5 a3:0.5 | g3:0.5 g3:0.5 bb3:0.5 g3:0.5", "Che la vo ro che la vo ro",
         'Che lavoro! Che lavoro!', 'What a job! What a job!'),
        (22, "a3:0.5 g3:0.5 f3:0.5 e3:0.5 | d3:0.5 c3:0.5 bb2:1 | f2^:2", "Os so bu co po ve ret to",
         'Ossobuco, poveretto!', 'Poor old Ossobuco!'),
    ]
    for bar, notes, lyr, it, en_ in lines:
        P.line('ossobuco', bar, 0, notes, lyr, vel=0.68)
        P.line('bsn', bar, 0, notes, vel=0.32)
        nb = notes.count('|') + 1
        op.sub(P.at(bar), P.at(bar + nb), 'ossobuco', it, en_)
    # comic answers in the rests after each 'Fuori!'
    for bar in (12, 14, 16):
        P.line('vln1', bar, 1, "@stacc c6:0.125 bb5:0.125 a5:0.125 g5:0.125 f5:0.25 c5:0.25", vel=0.45)
        P.line('fl', bar, 1, "c7.:0.125 bb6.:0.125 a6.:0.125 g6.:0.125 f6.:0.25 r:0.25", vel=0.3)
    P.line('vln1', 17, 1, "@stacc f5:0.25 r:0.75", vel=0.3)
    P.tempo(22, 0, 138)
    P.tempo(24, 0, 100, ramp=True)
    P.fermata(24, 0, 1.4)
    tutti(P, 25, 0, 0.4, 'C7', vel=0.6, skip=('tpt', 'tbn', 'hn'))
    tutti(P, 25, 1, 0.5, 'F', vel=0.65, skip=('tpt', 'tbn'))
    P.tempo(25, 0, 138)
    for b, pose in ((3, 'sing'), (11, 'point'), (13, 'point'), (15, 'shrug'), (18, 'sing'), (22, 'lament'), (25, 'listen')):
        op.cue(P.at(b), 'pose', 'ossobuco', pose)
    P.beats_until(26)
    t = P.end(26)
    op.cue(t - 0.3, 'pose', 'ossobuco', 'hide')
    op.cue(t - 0.3, 'move', 'ossobuco', -0.95, 1.4)

    # ---- No. 6 Romanza: Fredda è la tua tomba (D minor -> F major)
    R = Num(op, 'romanza', t + 0.6, 60, 4, title='Romanza')
    op.cue(R.at(1) - 0.4, 'move', 'amadeo', 0.62, 3.0)
    op.cue(R.at(1) - 0.4, 'pose', 'amadeo', 'mourn')
    op.cue(R.at(1), 'light', 'romanza', 3.0)
    R.prog(1, 0, "Dm:4 | Bb:2 Gm:2 | Dm/A:2 A7:2 | Dm:2 Dm/C:2 | Bb:2 Gm6/Bb:2 | A7sus4:2 A7:2 | Dm:4")
    R.fermata(6, 0, 2.4)
    R.line('amadeo', 1, 1, "f4:1.5 g4:0.5 f4:1 | d4:1 c#4:0.5 d4:0.5 bb4~:1.5 a4:0.5", "Li vi a mi a Li vi a", vel=0.58)
    R.line('amadeo', 3, 0, "a4:1 g4:0.5 f4:0.5 e4:1 d4:0.5 e4:0.5 | f4:2 r:1 a3:1", "fred da è la tua tom ba e", vel=0.6)
    R.line('amadeo', 5, 0, "d4:0.5 f4:0.5 bb4~:2 a4:0.5 g4:0.5 | a4!^:2.5 g4:0.5 e4:1 | d4:4", "tor na da me a mo re _ _", vel=0.78)
    R.arp('harp', 1, 0, 7, 0, 50, 74, 0.5, vel=0.32, shape='up', ring=2.0)
    R.line('vc', 1, 0, "d3:2 a3:1 f3:1 | bb3:2 g3:2 | a3:2 e3:2 | d3:2 c3:2 | bb2:2 g2:2 | a2:4 | d3:4", vel=0.36)
    R.bass('cb', 1, 0, 8, 0, 28, 43, 2, [(0, 1.9)], vel=0.26, art='leg')
    R.pad('vln2', 1, 0, 8, 0, 62, 74, 2, vel=0.2)
    R.pad('vla', 1, 0, 8, 0, 55, 67, 1, vel=0.22)
    R.line('cl', 3, 0, "a5:1 g5:0.5 f5:0.5 e5:1 d5:0.5 e5:0.5 | f5:3 r:1", vel=0.26)
    R.line('vln1', 5, 0, "d5:0.5 f5:0.5 bb5:2 a5:0.5 g5:0.5 | a5:2.5 g5:0.5 e5:1 | d5:4", vel=0.42)
    R.pad('hn', 5, 0, 7, 0, 55, 69, 2, vel=0.3, art='swell')
    op.cue(R.at(5), 'pose', 'amadeo', 'arms')
    op.cue(R.at(7), 'pose', 'amadeo', 'kneel')
    op.sub(R.at(1, 1), R.at(3), 'amadeo', 'Livia, mia Livia...', 'Livia, my Livia...')
    op.sub(R.at(3), R.at(4, 3), 'amadeo', 'Fredda è la tua tomba...', 'How cold your grave...')
    op.sub(R.at(4, 3), R.at(6), 'amadeo', 'E torna da me, amore!', 'Oh, come back to me, my love!')
    op.sub(R.at(6), R.at(7, 3), 'amadeo', '...amore!', '[Careful what you wish for.]')
    R.beats_until(8)
    t = R.end(8)

    # ---- No. 7 Resurrezione
    Z = Num(op, 'resurrezione', t, 72, 4, title='La resurrezione')
    op.fx(Z.at(1), 'thunder', vel=0.9)
    op.cue(Z.at(1), 'fx', 'flash')
    op.cue(Z.at(1), 'light', 'storm', 0.5)
    op.cue(Z.at(1), 'pose', 'amadeo', 'cower')
    op.cue(Z.at(1), 'pose', 'ossobuco', 'cower')
    Z.prog(1, 0, "Cdim7:4 | C#dim7:4 | Ddim7:4 | r:4 | Bbm/F:4 | Bbm/F:4")
    Z.pad('vln1', 1, 0, 4, 0, 70, 86, 2, vel=0.5, art='trem')
    Z.pad('vln2', 1, 0, 4, 0, 62, 76, 2, vel=0.45, art='trem')
    Z.pad('vla', 1, 0, 4, 0, 55, 67, 2, vel=0.45, art='trem')
    Z.line('vc', 1, 0, "@trem c3:4 | c#3:4 | d3:3.5", vel=0.5)
    Z.line('cb', 1, 0, "@trem c2:4 | c#2:4 | d2:3.5", vel=0.5)
    op.ev['organ'] += [Ev(Z.at(1), Z.at(4), 36, 0.5, 'leg'), Ev(Z.at(2), Z.at(4), 43, 0.35, 'leg')]
    op.ev['timp'].append(Ev(Z.at(1, 1), Z.at(3, 3.8), 38, 0.55, 'roll'))
    op.fx(Z.at(1, 2), 'rumble', dur=Z.at(4) - Z.at(1, 2), vel=0.7)
    op.cue(Z.at(1, 2), 'fx', 'tremble')
    op.fx(Z.at(2), 'cymroll', dur=Z.at(4) - Z.at(2), vel=0.5)
    op.cue(Z.at(3, 2), 'fx', 'hand')
    tutti(Z, 4, 0, 0.6, 'Ddim7', vel=0.95, cym=True, tam=True, bd=True)
    op.cue(Z.at(4), 'pose', 'livia', 'rise')
    op.cue(Z.at(4), 'zombie', 'livia', 1)
    op.cue(Z.at(4), 'light', 'zombie', 1.5)
    Z.pad('vla', 5, 0, 7, 0, 53, 65, 2, vel=0.22, art='trem')
    Z.pad('vc', 5, 0, 7, 0, 41, 53, 1, vel=0.24)
    for i, m in enumerate([82, 85, 89, 84, 82, 77, 73]):
        op.fx(Z.at(5, 0.2) + i * 0.34, 'celesta', pitch=m, vel=0.2)
    Z.line('livia', 5, 2, "a4:1 bb4*:1.5 a4_:2.5", "Cer vel lo", vel=0.5, z=0.7)
    Z.line('amadeo', 7, 1, "e4':0.5 f4'!:0.5 d4':1", "Li vi a", vel=0.65)
    op.cue(Z.at(5, 2), 'pose', 'livia', 'reach')
    op.cue(Z.at(7), 'pose', 'amadeo', 'amazed')
    op.sub(Z.at(1), Z.at(3, 2), 'house', '', '[A storm. The earth trembles.]')
    op.sub(Z.at(3, 2), Z.at(5, 2), 'house', '', '[Something stirs in the fresh grave.]')
    op.sub(Z.at(5, 2), Z.at(7), 'livia', 'Cervello...?', 'Amadeo...?')
    op.sub(Z.at(7), Z.at(7, 3), 'amadeo', 'Livia?!', 'Livia?!')
    Z.beats_until(8)
    t = Z.at(7, 3)

    # ---- No. 8 Duetto d'amore (F major): the Love theme, now a duet with a dead woman
    L = Num(op, 'duetto', t - 3 * 60 / 69.0, 69, 4, title="Duetto d'amore")
    op.cue(L.at(1, 3), 'light', 'duet', 2.0)
    op.cue(L.at(1, 3), 'move', 'amadeo', 0.55, 2.0)
    L.prog(2, 0, LOVE1_CH + " | " + LOVE2_CH.replace('F:4', 'F:3 C7:1', 1).replace('| F:4', '| F:2 C7:2') + " | Gm7:2 C7:2 | F:4")
    ten = LOVE1.replace('c5:1 |', 'c4:1 |', 1)
    ten = "c4:1 | a4:2 g4:1 bb3:1 | g4:2 f4:1 a3:1 | f4:1.5 e4:0.5 d4:1 c4:1 | bb3:1 a3:1 g3:2"
    L.line('amadeo', 1, 3, ten, "Li vi a sei tu sei tor na ta a me a mo re", vel=0.66)
    L.line('vln1', 1, 3, LOVE1, vel=0.4)
    L.line('livia', 5, 3, "c5:1 | a5:2 g5:1 a5:0.5 bb5:0.5 | c6*:2 bb5:1 a5:1 | g5:1 f5:1 e5:1 g5:1 | f5:2 r:2",
           "Cer vel lo mi o cer vel lo che bel la te sta", vel=0.66, z=0.55)
    L.line('vln1', 6, 0, "a5:2 g5:1 a5:0.5 bb5:0.5 | c6:2 bb5:1 a5:1 | g5:1 f5:1 e5:1 g5:1 | f5:3 r:1", vel=0.36)
    L.line('fl', 6, 0, "a5:2 g5:1 a5:0.5 bb5:0.5 | c6:2 bb5:1 a5:1 | g5:1 f5:1 e5:1 g5:1 | f5:3 r:1", vel=0.25, trans=12)
    # a due: AMORE / CERVELLO
    L.line('livia', 10, 0, "a5:1 c6*~:2.5 bb5:0.5 | a5^:4", "cer vel lo _", vel=0.86, z=0.6)
    L.line('amadeo', 10, 0, "f4:1 a4~:2.5 g4:0.5 | f4^:4", "a mo re _", vel=0.86)
    L.line('vln1', 10, 0, "a5:1 c6:2.5 bb5:0.5 | a5:4", vel=0.6)
    L.arp('harp', 2, 0, 12, 0, 53, 77, 0.25, vel=0.28, ring=1.2)
    L.pad('vln2', 2, 0, 12, 0, 62, 74, 2, vel=0.26)
    L.pad('vla', 2, 0, 12, 0, 55, 67, 1, vel=0.26)
    L.bass('vc', 2, 0, 12, 0, 41, 53, 2, [(0, 1.9)], vel=0.32, art='leg')
    L.bass('cb', 2, 0, 12, 0, 29, 41, 4, [(0, 3.9)], vel=0.28, art='leg')
    L.pad('hn', 6, 0, 12, 0, 55, 67, 2, vel=0.26)
    L.fermata(11, 0, 1.2)
    for nm in ('bsn', 'cl'):
        L.line(nm, 6, 0, "r:4 | r:2 a3.:0.5 bb3.:0.5 a3.:1 | r:4", vel=0.32, trans=12 if nm == 'cl' else 0)
    op.cue(L.at(1, 3), 'pose', 'amadeo', 'arms')
    op.cue(L.at(1, 3), 'pose', 'ossobuco', 'hide')
    op.cue(L.at(5, 3), 'pose', 'livia', 'sway')
    op.cue(L.at(6), 'move', 'livia', 0.4, 4.0)
    op.cue(L.at(8), 'pose', 'amadeo', 'heart')
    op.cue(L.at(10), 'pose', 'livia', 'arms')
    op.cue(L.at(10), 'pose', 'amadeo', 'arms')
    op.sub(L.at(1, 3), L.at(3, 3), 'amadeo', 'Livia, sei tu? Sei tornata a me...', 'Livia, is it you? You have come back to me...')
    op.sub(L.at(3, 3), L.at(5, 3), 'amadeo', '...amore!', '...my love!')
    op.sub(L.at(5, 3), L.at(7, 3), 'livia', 'Cervello mio, cervello...', 'My darling, my only one...')
    op.sub(L.at(7, 3), L.at(10), 'livia', 'Che bella testa!', 'What a beautiful mind you have.')
    op.sub(L.at(10), L.at(12), 'both', 'Amore! / Cervello!', 'LOVE! / BRAINS!')
    L.beats_until(12)
    t = L.end(12)
    op.cue(t - 0.25, 'pose', 'livia', 'lunge')
    op.fx(t, 'thunder', vel=0.75)
    op.cue(t, 'fx', 'flash')
    op.cue(t + 0.05, 'light', 'blackout', 0.15)
    tutti(Num(op, 'sting', t, 60, 4), 1, 0, 1.2, 'Dm', vel=0.9, bd=True, tam=True)
    return t + 2.6


# ==============================================================================================
# ATTO TERZO: LA FAME
# ==============================================================================================

def act3(op, t0):
    op.mark(t0, 'act3', 'Atto terzo: La fame', chapter=True)
    op.cue(t0 - 1.0, 'pose', 'livia', 'idle')
    op.cue(t0 - 1.0, 'at', 'livia', 0.25, 1)
    op.cue(t0 - 1.0, 'at', 'amadeo', 0.6, -1)
    op.cue(t0 - 1.0, 'pose', 'amadeo', 'cower')
    op.sub(t0 + 0.2, t0 + 3.4, 'title', 'Atto terzo: La fame', 'Act Three: The Hunger. A little later.')
    # ---- No. 9 Coro dei morti (D minor)
    C = Num(op, 'coro_morti', t0, 104, 4, title='Coro dei morti')
    op.cue(C.at(1), 'light', 'dead', 1.2)
    op.fx(C.at(1), 'rumble', dur=C.at(3) - C.at(1), vel=0.8)
    op.cue(C.at(1, 2), 'group', 'dead', 'rise', C.at(3) - C.at(1, 2))
    op.cue(C.at(1, 2), 'fx', 'graves')
    C.prog(1, 0, "Dm:4 | Dm:4 | Dm:4 | Gm:4 | Dm:2 Gm:2 | A7:4 | Dm:2 A7:2 | A7:4 | Dm:4 | Dm:4 | Dm:4")
    for b in range(1, 11):
        for beat in range(4):
            op.ev['timp'].append(Ev(C.at(b, beat), C.at(b, beat) + 0.1, 38 if beat % 2 == 0 else 45, 0.42 + (0.12 if beat == 0 else 0), 'hit'))
            op.fx(C.at(b, beat), 'bd', vel=0.35 + (0.2 if beat == 0 else 0))
    op.ev['tbn'] += [Ev(C.at(1), C.at(3), 38, 0.5, 'leg'), Ev(C.at(1), C.at(3), 45, 0.45, 'leg')]
    op.ev['tuba'] += [Ev(C.at(1), C.at(3), 26, 0.5, 'leg')]
    C.pulse('vla', 1, 0, 11, 0, 50, 62, 2, 0.5, [(0, 0.3)], vel=0.42, art='marc', accent=1.25)
    C.pulse('vc', 1, 0, 11, 0, 38, 50, 1, 0.5, [(0, 0.3)], vel=0.48, art='marc', accent=1.25)
    C.bass('cb', 1, 0, 11, 0, 26, 38, 1, [(0, 0.5)], vel=0.5, art='marc')
    C.pad('vln2', 3, 0, 11, 0, 62, 74, 2, vel=0.4, art='trem')
    C.pad('vln1', 3, 0, 11, 0, 69, 84, 2, vel=0.42, art='trem')
    hunger(C, 'tbn', 3, 0, 50, vel=0.7, art='marc')
    hunger(C, 'tbn', 4, 0, 50, vel=0.72, art='marc')
    hunger(C, 'hn', 7, 0, 62, vel=0.7, art='marc')
    hunger(C, 'hn', 8, 0, 64, vel=0.72, art='marc')
    sop = ("a4!:1 a4:0.5 f4!:1.5 r:1 | bb4!:1 bb4:0.5 g4!:1.5 r:1 | a4:0.5 a4:0.5 d5:1 d5:0.5 c5:0.5 bb4:1 | a4:3 r:1 | "
           "f5:1 e5:0.5 d5:0.5 c#5:0.5 d5:0.5 e5:1 | e5:0.5 e5:0.5 e5:0.5 f5:0.5 e5:2 | f5:0.5 f5:0.5 f5:0.5 g5:0.5 a5:2 | a5!:1 a5:0.5 d5!*:2.5")
    lyr = "Ce re brum Ce re brum Do na no bis ce re brum Mor tu i re sur gunt e su ri unt _ e su ri unt _ Ce re brum"
    C.choir('dead', 3, 0, sop, lyr, vel=0.75, z=0.8, flags=('growl',))
    C.line('tpt', 9, 0, "f5:0.5 f5:0.5 f5:0.5 g5:0.5 a5:2 | a5!:1 a5:0.5 d5!:2.5", vel=0.7)
    tutti(C, 11, 0, 1.6, 'Dm', vel=0.95, cym=True, bd=True)
    op.cue(C.at(3), 'group', 'dead', 'sway', 0.0)
    op.cue(C.at(3), 'pose', 'amadeo', 'cower')
    op.cue(C.at(1, 2), 'pose', 'ossobuco', 'cower')
    op.sub(C.at(3), C.at(5), 'dead', 'Cerebrum! Cerebrum!', 'Brains! Brains!')
    op.sub(C.at(5), C.at(7), 'dead', 'Dona nobis cerebrum!', 'Grant us brains!')
    op.sub(C.at(7), C.at(8), 'dead', 'Mortui resurgunt,', 'The dead are rising,')
    op.sub(C.at(8), C.at(10), 'dead', 'esuriunt, esuriunt!', 'and they are feeling peckish!')
    op.sub(C.at(10), C.at(11, 2), 'dead', 'CEREBRUM!', 'BRAINS!')
    C.beats_until(11)
    t = C.at(11, 2)

    # ---- No. 10 Arrivano i paesani: torches, the Contessa, an accident
    V = Num(op, 'paesani', t, 132, 4, title='Coro dei paesani')
    op.cue(V.at(1) - 0.4, 'group', 'vill', 'torches', 1.6)
    op.cue(V.at(1) - 0.4, 'light', 'torch', 1.0)
    op.cue(V.at(1) - 0.4, 'at', 'velena', -1.35, 1)
    op.cue(V.at(1) - 0.4, 'show', 'velena', 1)
    op.cue(V.at(1) - 0.4, 'move', 'velena', -0.55, 2.0)
    op.cue(V.at(1) - 0.4, 'pose', 'velena', 'command')
    op.fx(V.at(1) - 0.4, 'fire', dur=13.0, vel=0.3)
    V.prog(1, 0, "Am:4 | Dm:2 E7:2 | Am:4 | E7:2 Am:2 | Am:2 E7:2 | Am:4 | E7:4 | r:4 | Dm:4 | Am:2 E7:2 | Am:4")
    V.choir('vill', 1, 0, "e5!:1 c5:1 e5!:1 c5:1 | a5!:1 g5:0.5 f5:0.5 e5:1 e5:1", "Fuo co fuo co mor te ai mor ti", vel=0.8)
    V.line('velena', 3, 0, "a4:0.5 c5:0.5 e5:0.5 a5!:0.5 g#5:1.5 a5:0.5 | r:4", "Bru cia te li tut ti", vel=0.82)
    V.line('velena', 5, 0, "e5:0.5 d5:0.5 c5:0.5 b4:0.5 e5!:1.5 a4:0.5", "So no la con tes sa", vel=0.75)
    V.line('velena', 6, 0, "e5!:0.5 r:0.5 g5!:0.5 r:0.5 a5!:1.5", "ah ah ah", vel=0.95)
    V.pulse('vln1', 1, 0, 7, 0, 69, 81, 2, 0.5, [(0, 0.3)], vel=0.55, art='marc')
    V.pulse('vln2', 1, 0, 7, 0, 62, 74, 2, 0.5, [(0, 0.3)], vel=0.5, art='marc')
    V.bass('cb', 1, 0, 7, 0, 28, 40, 1, [(0, 0.5)], vel=0.55, art='marc')
    V.bass('vc', 1, 0, 7, 0, 40, 52, 1, [(0, 0.5)], vel=0.5, art='marc')
    V.pad('hn', 1, 0, 7, 0, 55, 69, 3, vel=0.55, art='marc')
    V.pad('tpt', 1, 0, 3, 0, 67, 79, 2, vel=0.55, art='marc')
    op.fx(V.at(5), 'cymroll', dur=V.at(6, 3.5) - V.at(5), vel=0.45)
    op.cue(V.at(5), 'group', 'dead', 'close', 2.5)
    op.cue(V.at(6), 'pose', 'velena', 'scream')
    tutti(V, 6, 3.5, 0.5, 'E7b9', vel=1.0, art='sfz', cym=True, tam=True, bd=True)
    op.fx(V.at(6, 3.5), 'chomp', vel=0.9)
    op.cue(V.at(6, 3.5), 'fx', 'eaten')
    op.cue(V.at(6, 3.5), 'show', 'velena', 0)
    op.cue(V.at(6, 3.6), 'fx', 'hat')
    op.cue(V.at(7), 'group', 'vill', 'gasp', 0.0)
    V.line('fl', 7, 0, "e6:0.5 d#6:0.5 d6:0.5 c#6:0.5 c6:0.5 b5:0.5 bb5:0.5 a5:0.5 | g#5:1 a5:3", vel=0.32)
    op.ev['harp'] += [Ev(V.at(7) + i * 0.05, V.at(9), m, 0.22) for i, m in enumerate(range(84, 52, -2))]
    V.choir('vill', 9, 0, "c5.:0.5 c5.:0.5 a4!:1 r:2", "Fug gia mo", vel=0.55)
    op.cue(V.at(9, 2), 'group', 'vill', 'flee', 2.0)
    op.cue(V.at(9, 2), 'move', 'ossobuco', -1.6, 2.2)
    op.cue(V.at(9, 2), 'pose', 'ossobuco', 'cower')
    tutti(V, 10, 0, 0.4, 'Am', vel=0.6, skip=('tpt', 'tbn', 'hn'))
    tutti(V, 10, 2, 0.4, 'E7', vel=0.6, skip=('tpt', 'tbn', 'hn'))
    op.sub(V.at(1), V.at(3), 'vill', 'Fuoco! Fuoco! Morte ai morti!', 'Fire! Fire! Death to the dead!')
    op.sub(V.at(3), V.at(5), 'velena', 'Bruciateli tutti!', 'Burn them all!')
    op.sub(V.at(5), V.at(6), 'velena', 'Sono la Contessa!', 'Do you know who I am? I am the Contessa!')
    op.sub(V.at(6), V.at(6, 3.5), 'velena', 'Ah! Ah! Aaah!', 'Ah! Ah! Aaah!')
    op.sub(V.at(6, 3.5), V.at(9), 'house', '', '[The Contessa has left the production.]')
    op.sub(V.at(9), V.at(10), 'vill', 'Fuggiamo!', 'Run!')
    V.beats_until(11)
    t = V.end(10) + 1.2

    # ---- No. 11 Scena: Prendilo, amore (F major): the offer
    S = Num(op, 'scena', t, 63, 4, title='Scena: Prendilo')
    op.cue(S.at(1), 'light', 'tender', 2.5)
    op.cue(S.at(1), 'group', 'dead', 'back', 3.0)
    op.cue(S.at(1), 'pose', 'amadeo', 'idle')
    S.prog(1, 0, "Dm:2 Bb:2 | C7:4 | " + LOVE1_CH + " | Dm:2 Gm:2 | F/C:2 C7:2 | F:4")
    hunger(S, 'bsn', 1, 0, 50, vel=0.32)
    S.line('livia', 1, 1, "a4:1 bb4*:1 a4:1 | c5:1 f5~:2 e5:1", "Non pos so ti a mo", vel=0.5, z=0.55)
    S.pad('vla', 1, 0, 3, 0, 53, 65, 2, vel=0.22)
    S.pad('vc', 1, 0, 3, 0, 41, 53, 1, vel=0.26)
    S.line('amadeo', 2, 3, "c4:1 | a4:2 g4:1 bb3:1 | g4:2 f4:1 a3:1 | f4:1.5 e4:0.5 d4:1 c4:1 | bb3:1 a3:1 g3:2",
           "Pren di lo a mo re mi o è sem pre tu o _", vel=0.6)
    S.line('vln1', 3, 0, "a5:2 g5:1 bb4:1 | g5:2 f5:1 a4:1 | f5:1.5 e5:0.5 d5:1 c5:1 | bb4:1 a4:1 g4:2", vel=0.3)
    S.arp('harp', 3, 0, 7, 0, 53, 77, 0.5, vel=0.26, ring=1.6)
    S.pad('vln2', 3, 0, 9, 0, 62, 74, 2, vel=0.2)
    S.bass('cb', 3, 0, 9, 0, 29, 41, 4, [(0, 3.9)], vel=0.24, art='leg')
    S.line('livia', 7, 0, "r:1 a4':1 c5':1 r:1", "Il tuo", vel=0.4, z=0.55)
    S.line('amadeo', 7, 3, "c4':0.5 c4':0.5 | f4':1 e4'!:1 c4':2", "Il mio cer vel lo", vel=0.5)
    S.line('livia', 9, 0, "a4:1 c5:1 f5~:1.5 e5:0.5 | f5^:4", "A ma de o _", vel=0.5, z=0.3)
    S.line('vln1', 9, 0, "a5:1 c6:1 f6:1.5 e6:0.5 | f6:4", vel=0.32)
    S.pad('hn', 9, 0, 11, 0, 55, 67, 2, vel=0.25)
    S.fermata(10, 2, 1.0)
    op.cue(S.at(1, 1), 'pose', 'livia', 'torn')
    op.cue(S.at(2, 3), 'pose', 'amadeo', 'offer')
    op.cue(S.at(5), 'move', 'amadeo', 0.42, 3.0)
    op.cue(S.at(9), 'pose', 'livia', 'tender')
    op.cue(S.at(9), 'move', 'livia', 0.3, 3.0)
    op.sub(S.at(1, 1), S.at(2, 3), 'livia', 'Non posso... ti amo...', "I can't... I love you...")
    op.sub(S.at(2, 3), S.at(4, 3), 'amadeo', 'Prendilo, amore mio...', 'Take it, my love...')
    op.sub(S.at(4, 3), S.at(7), 'amadeo', '...è sempre tuo.', '...it was always yours.')
    op.sub(S.at(7), S.at(7, 3), 'livia', 'Il tuo...?', 'Your... heart?')
    op.sub(S.at(7, 3), S.at(9), 'amadeo', 'Il mio cervello.', 'My brain.')
    op.sub(S.at(9), S.at(11), 'livia', 'Amadeo...', 'Amadeo...')
    S.beats_until(11)
    t = S.end(11)
    # the bite
    B = Num(op, 'morso', t, 60, 4, title='Il morso')
    op.cue(B.at(1) - 0.3, 'pose', 'livia', 'bite')
    op.cue(B.at(1) - 0.3, 'pose', 'amadeo', 'offer')
    tutti(B, 1, 0, 1.0, 'C#dim7', vel=1.0, art='sfz', cym=True, bd=True)
    op.fx(B.at(1), 'chomp', vel=1.0)
    op.cue(B.at(1), 'fx', 'bite')
    B.line('amadeo', 1, 0.6, "bb4!':0.6", "ahi", vel=0.9)
    op.cue(B.at(1, 1.2), 'pose', 'amadeo', 'die')
    op.cue(B.at(1, 2.4), 'pose', 'amadeo', 'dead')
    op.cue(B.at(1, 1.0), 'pose', 'livia', 'idle')
    for k, beat in enumerate((2.0, 3.2, 4.6)):
        heartbeat(op, B.at(1, beat), vel=0.3 - 0.07 * k)
    op.cue(B.at(1, 1.0), 'light', 'grief', 1.5)
    B.line('vc', 3, 0, "d2:1 a2:1 d3:1 f3:1 | a3^:4", vel=0.42)
    B.line('cb', 3, 0, "d2:4 | d2:4", vel=0.3)
    op.fx(B.at(4, 1), 'celesta', pitch=86, vel=0.3)
    op.fx(B.at(4, 1.4), 'celesta', pitch=81, vel=0.25)
    op.cue(B.at(4), 'pose', 'amadeo', 'getup')
    op.cue(B.at(4), 'zombie', 'amadeo', 1)
    op.sub(B.at(1), B.at(1, 1.6), 'amadeo', 'Ahi!', 'Ouch.')
    op.sub(B.at(1, 1.8), B.at(3), 'house', '', '[Amadeo has died.]')
    op.sub(B.at(3), B.at(4), 'house', '', '[Briefly.]')
    op.sub(B.at(4), B.at(5), 'house', '', "[He's back.]")
    B.beats_until(5)
    t = B.end(5)

    # ---- No. 12 Finale: Insieme per sempre (D major): two zombies sing the Love theme
    F = Num(op, 'finale', t - 60 / 72.0 * 3, 72, 4, title='Finale: Insieme per sempre')
    op.cue(F.at(1, 3), 'light', 'finale', 2.0)
    op.cue(F.at(1, 3), 'group', 'dead', 'sway', 0.0)
    op.cue(F.at(1, 3), 'pose', 'livia', 'arms')
    op.cue(F.at(1, 3), 'pose', 'amadeo', 'arms')
    op.cue(F.at(1, 3), 'move', 'amadeo', 0.5, 2.0)
    op.cue(F.at(1, 3), 'move', 'livia', 0.12, 2.0)
    D = -3   # F -> D
    F.prog(2, 0, "D:3 G:1 | Em7:3 D/F#:1 | Bm:2 G:2 | Em7:2 A7:2 | D:4 | D/A:2 G:1 D/F#:1 | Em7:2 A7:2 | D:4 | "
                 "D:2 G:2 | D/A:2 A7:2 | D:4 | D:4")
    w1 = "In sie me per sem pre nel la mor te nel la fa me"
    w2 = "a mo re e cer vel lo per le ter ni tà _"
    L1 = LOVE1.replace('g4:2', 'g4:1')      # the pickup of the second phrase follows straight on
    F.line('livia', 1, 3, L1, w1, vel=0.75, trans=D, z=0.45)
    F.line('amadeo', 1, 3, L1, w1, vel=0.72, trans=D - 12, z=0.55)
    F.line('livia', 5, 3, LOVE2.replace('f5:3', 'f5:3 r:1'), w2, vel=0.82, trans=D, z=0.45)
    F.line('amadeo', 5, 3, LOVE2.replace('f5:3', 'f5:3 r:1'), w2, vel=0.8, trans=D - 12, z=0.55)
    F.line('vln1', 1, 3, LOVE1 + " | " + LOVE2.replace('c5:1 |', '', 1), vel=0.6, trans=D)
    F.line('fl', 5, 3, LOVE2, vel=0.4, trans=D + 12)
    F.line('tpt', 6, 0, "a4:2 g4:1 a4:0.5 b4:0.5 | c#5:2 b4:1 a4:1 | g4:1 f#4:1 e4:1 g4:1 | f#4:3 r:1", vel=0.45, trans=D + 3)
    F.choir('dead', 2, 0, "a4:1 a4:0.5 f#4:1.5 r:1 | b4:1 b4:0.5 g4:1.5 r:1 | a4:1 a4:0.5 f#4:1.5 r:1 | g4:1 g4:0.5 e4:1.5 r:1",
            "Ce re brum ce re brum ce re brum ce re brum", vel=0.45, z=0.8)
    F.arp('harp', 2, 0, 10, 0, 50, 74, 0.25, vel=0.3, ring=1.2)
    F.pad('vln2', 2, 0, 10, 0, 62, 76, 3, vel=0.4)
    F.pad('vla', 2, 0, 10, 0, 55, 67, 2, vel=0.4)
    F.bass('vc', 2, 0, 12, 0, 38, 52, 2, [(0, 1.9)], vel=0.5, art='leg')
    F.bass('cb', 2, 0, 12, 0, 26, 40, 2, [(0, 1.9)], vel=0.45, art='leg')
    F.pad('hn', 2, 0, 10, 0, 55, 69, 3, vel=0.42)
    F.pad('tbn', 6, 0, 10, 0, 45, 62, 3, vel=0.42)
    for b in range(2, 10):
        op.ev['timp'].append(Ev(F.at(b), F.at(b) + 0.1, 38 if b % 2 == 0 else 45, 0.35, 'hit'))
    # the last word: CERVELLO on a high D, the dead answer CEREBRUM, and the final chords
    F.line('livia', 10, 0, "f#5:1 a5:1 d6*^:2", "cer vel lo", vel=0.95, z=0.4)
    F.line('amadeo', 10, 0, "a3:1 f#4:1 d4^:2", "cer vel lo", vel=0.92, z=0.5)
    F.choir('dead', 10, 0, "a4!:1 a4:0.5 d5!*:2.5", "Ce re brum", vel=0.85, z=0.8)
    F.fermata(10, 2, 2.6)
    tutti(F, 10, 0, 2.0, 'D', vel=0.9, art='leg', timp=False)
    op.ev['timp'].append(Ev(F.at(10), F.at(10, 3.9), 38, 0.7, 'roll'))
    op.fx(F.at(10), 'cymroll', dur=F.at(10, 3.8) - F.at(10), vel=0.55)
    tutti(F, 11, 0, 0.5, 'D', vel=1.0, cym=True, bd=True)
    tutti(F, 11, 1, 0.5, 'A7', vel=1.0, bd=True)
    tutti(F, 11, 2, 1.9, 'D', vel=1.0, cym=True, bd=True, tam=True)
    F.fermata(11, 2, 0.8)
    op.ev['timp'].append(Ev(F.at(11, 2) + 0.05, F.at(11, 2) + 1.9, 38, 0.7, 'roll'))
    op.cue(F.at(5, 3), 'fx', 'petals', F.at(11, 2) + 3 - F.at(5, 3))
    op.cue(F.at(10), 'pose', 'livia', 'high')
    op.cue(F.at(10), 'pose', 'amadeo', 'high')
    op.cue(F.at(11, 2), 'curtain', 'down', 2.2)
    op.sub(F.at(1, 3), F.at(3, 3), 'both', 'Insieme per sempre,', 'Together forever,')
    op.sub(F.at(3, 3), F.at(5, 3), 'both', 'nella morte, nella fame,', 'in death, and in hunger,')
    op.sub(F.at(5, 3), F.at(7, 3), 'both', 'amore e cervello', 'love, and brains,')
    op.sub(F.at(7, 3), F.at(10), 'both', "per l'eternità!", 'for all eternity!')
    op.sub(F.at(10), F.at(11), 'both', 'CERVELLO!', 'BRAINS!')
    op.sub(F.at(11, 2), F.at(11, 2) + 3.0, 'title', 'Fine', 'The End')
    F.beats_until(12)
    t_end = F.at(11, 2)
    op.cue(t_end + 2.4, 'maestro', 'rest')
    return t_end


# ==============================================================================================
# CURTAIN CALL
# ==============================================================================================

def bows(op, t_final):
    t = t_final + 0.3
    op.mark(t, 'bows', 'Curtain call', chapter=True)
    op.fx(t, 'applause', dur=27.0, vel=1.0, density=130, shape='bows')
    op.fx(t + 0.5, 'bravo', dur=16.0, vel=0.7)
    op.cue(t + 0.4, 'house', 0.35, 3.0)
    op.cue(t + 2.6, 'light', 'bows', 0.5)
    op.cue(t + 2.6, 'at', 'livia', 0.12, 1)
    op.cue(t + 2.6, 'at', 'amadeo', 0.45, -1)
    op.cue(t + 2.6, 'pose', 'livia', 'idle')
    op.cue(t + 2.6, 'pose', 'amadeo', 'idle')
    op.cue(t + 2.6, 'show', 'velena', 1)
    op.cue(t + 2.6, 'at', 'velena', -0.28, 1)
    op.cue(t + 2.6, 'zombie', 'velena', 1)
    op.cue(t + 2.6, 'at', 'ossobuco', -0.68, 1)
    op.cue(t + 2.6, 'pose', 'ossobuco', 'idle')
    op.cue(t + 2.6, 'pose', 'velena', 'idle')
    op.cue(t + 2.6, 'group', 'vill', 'line', 0.0)
    op.cue(t + 2.6, 'group', 'dead', 'line', 0.0)
    op.cue(t + 2.8, 'curtain', 'up', 2.4)
    op.cue(t + 5.0, 'group', 'dead', 'bow', 0.0)
    op.cue(t + 5.0, 'group', 'vill', 'bow', 0.0)
    op.cue(t + 7.2, 'pose', 'ossobuco', 'bow')
    op.cue(t + 9.0, 'pose', 'velena', 'bow')
    op.cue(t + 11.2, 'pose', 'livia', 'bow')
    op.cue(t + 11.2, 'pose', 'amadeo', 'bow')
    op.cue(t + 13.2, 'fx', 'arm')
    op.cue(t + 14.6, 'maestro', 'bowpit')
    op.cue(t + 17.0, 'pose', 'livia', 'bow')
    op.cue(t + 17.0, 'pose', 'amadeo', 'bow')
    op.cue(t + 17.0, 'pose', 'ossobuco', 'bow')
    op.cue(t + 17.0, 'pose', 'velena', 'bow')
    op.cue(t + 17.0, 'group', 'dead', 'bow', 0.0)
    op.cue(t + 17.0, 'group', 'vill', 'bow', 0.0)
    op.sub(t + 2.6, t + 7.0, 'house', '', '[Applause.]')
    op.sub(t + 7.2, t + 9.0, 'house', '', 'Ossobuco, the gravedigger')
    op.sub(t + 9.0, t + 11.2, 'house', '', 'La Contessa Velena (who got better)')
    op.sub(t + 11.2, t + 14.6, 'house', '', 'Livia and Amadeo')
    op.sub(t + 14.6, t + 17.0, 'house', '', 'Maestro Rigor Mortis')
    op.sub(t + 17.0, t + 25.0, 'house', '', 'Throw them a rose. They have earned it. (Tap the stage.)')
    op.cue(t + 25.0, 'curtain', 'down', 2.5)
    op.cue(t + 26.0, 'house', 1.0, 2.0)
    return t + 27.5


def compose():
    op = Opera()
    t = preshow(op)
    t = sinfonia(op, t)
    t = act1(op, t + 0.6)
    t = act2(op, t + 0.8)
    t = act3(op, t + 1.2)
    end = bows(op, t)
    op.duration = end
    op.cues.sort(key=lambda c: c[0])
    op.subs.sort(key=lambda s: s[0])
    op.beats.sort(key=lambda b: b[0])
    op.marks.sort(key=lambda m: m[0])
    return op


if __name__ == '__main__':
    op = compose()
    print(f'duration {op.duration:.1f} s')
    for m in op.marks:
        print(f'  {m[0]:7.2f}  {m[1]:16s} {m[2]}')
    print('voices', {k: len(v) for k, v in op.vox.items()})
    print('orchestra', {k: len(v) for k, v in op.ev.items()})
    print('sfx', len(op.sfx), 'cues', len(op.cues), 'subs', len(op.subs), 'beats', len(op.beats))
