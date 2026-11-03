// MAGNUM OPUS (The Full Opus) — the single source of truth for timing, full version.
// Read by the page (window.SCORE) and by the soundtrack synth (everything after the first equals sign up to
// the final ";" is plain JSON, so keep it that way: no comments inside the object, double quotes only).
// Generated from scratchpad/full/synth/gen.py; SPEC-full.md describes every key in prose.
//
// 136 BPM, 4/4, 104 bars: 416 beats, 183.529 s (duration is bars * 240 / bpm). One beat: 0.441176 s,
// one bar: 1.764706 s, one 16th step: 0.110294 s. Bars count from 0. "bars": [a, b] are half-open.
// Patterns are one string per bar, 16 steps per bar: "x" hit, "X" accent, "r" two 32nd-note hits
// inside that step, "." rest. Every per-bar array (chords, bass, energy, each drum lane) has 104 entries.
//
// Keys of the 30 s score, unchanged in meaning: title, subtitle, titleJp, bpm, beatsPerBar, stepsPerBeat,
//   bars, duration, key, sections, chords, energy, drums, hits, sweeps, gap, chakras, vocals, fx,
//   overlayWindows. ("gap" is now only the RUBEDO gap; all five gaps are in "gaps".)
// New keys:
//   keyChange      {bar, semitones, from, to, approach, home:{bar, key, cadence}}: the final chorus is +2
//                  from bar 80; the synth transposes chords by name (Bm, G, D, A are spelled in the chords
//                  array) and sung notes are already written transposed (each line has "key").
//   stages         the five stage spans (Nigredo, Albedo, Citrinitas, Rubedo, Opus) the HUD and overlay key on.
//   sections[]     now 18 entries; each also has "role" (musical role) and "color" ([r,g,b] 0..1, the
//                  progress-bar colour of its stage). stage/jp/arcana/card/cardJp/theme as before.
//   bass           per-bar bass root, MIDI, or null for no bass (the build's rising line needs octaves
//                  a chord-name lookup cannot give).
//   arrangement    per section id: which synth layers play and how (pad, piano, bass pattern
//                  groove|drop|pedal|rising8, lead riff|hook double|tease, arp, drone, choir, bells, bus).
//   riff           the instrumental hook: notes: 4 riff bars of [midi, step, length] written in A minor;
//                  plays: [{bars:[a,b], riffBars:[...], key, voice}] where it sounds (key: transpose).
//   gaps           [{fromBeat, toBeat, note}]: every gap; the synth gates all music in each (as the 30 s gap).
//   filters        [{type, fromBeat, toBeat, ...}]: kickMuffle (kick low-pass, fc [from, to] Hz) and
//                  monitor (the music bus shrinks into a band-passed mono "monitor" during the pull-back).
//   chakras[]      as before, plus planet, metal, glyph, jp: the build's roll call (one per bar 72-78).
//   trumps         [{n, numeral, fr, en, jp, beat, note}]: when each of the 22 trumps is drawn into the
//                  HUD's trump rail (story order; XXI on the last 'whole').
//   vocals.hook[]  chorus lines: {bar, part "A"|"B", style "hook", key (0 or 2), chrome (karaoke metal:
//                  silver|gold|rainbow), text, jp, words [[word, step]], notes [[flite syllable, step,
//                  length in steps, MIDI]]}. Notes are written pitch (the tuned slt voice sings an octave
//                  lower, as in the 30 s hook()). Steps are 16ths from the line's bar; a length may run
//                  past the bar line (bar 95's 'whole' is 16 steps, into the shout).
//   vocals.sung[]  every other sung line, same fields, part cold|pre|bridge|metal|coda and style
//                  ghost (tuned voice only, big hall) | pre (tuned + 60 % vocoder) | bridge (tuned only,
//                  plate) | metal (tuned + vocoder, one word on step 8) | coda (tuned only, dry, close).
//   vocals.rap[]   {bar, text, jp, style verse|whisper|shout|hype, words}: whisper: -6 dB breathy, no
//                  doubles; shout: the announcer chain on one word; hype: rap chain + 2 dB drive.
//   vocals.spoken[] the Hermit: {bar, voice "hermit", text, jp, words}; rms at -9 st, tempo 0.8, warm hall.
//   vocals.announcer[] as before, plus jp, voice, and flite (the spelling sent to flite).
//   vocals.chops[] vocoded hook syllables re-used as riff chops: {bar, text, syllables [[syl, step]], src}.
//   hits[]         new types: jingle, bowl, thunder, slate, subSwell (fromBeat/toBeat), musicBox (notes
//                  [[midi, step from the hit, length]]); orchHit notes name the chord.
//   sweeps[]       new type reverseSwell (chord).
//   warning        photosensitivity notice for the page: flashFrom, strobeFrom, strongest [[b0, b1], ...].
//   cues[]         the picture edit (INTERFACE.md): {shot, bars:[a, b], params, note}; contiguous over
//                  [0, 104). params use the factories' knobs plus the engine's generic grade / frame.
window.SCORE = {
 "title": "Magnum Opus",
 "subtitle": "The Full Opus",
 "titleJp": "マグヌム・オプス 完全版",
 "bpm": 136,
 "beatsPerBar": 4,
 "stepsPerBeat": 4,
 "bars": 104,
 "duration": 183.529412,
 "key": "A minor; final chorus +2 (B minor) from bar 80; the outro cadences home and the last chord is A major (lead turned to gold)",
 "keyChange": {
  "bar": 80,
  "semitones": 2,
  "from": "A minor",
  "to": "B minor",
  "approach": "build bass A2 B2 C3 D3 E3 F3 G#3 A#3; E/G# -> F#/A# (V of B minor) -> gap -> Bm",
  "home": {
   "bar": 100,
   "key": "A major",
   "cadence": "Bm G Esus4 E | A (ii, bVII, V, I in A major)"
  }
 },
 "stages": [
  {
   "stage": "Nigredo",
   "bars": [
    0,
    28
   ]
  },
  {
   "stage": "Albedo",
   "bars": [
    28,
    52
   ]
  },
  {
   "stage": "Citrinitas",
   "bars": [
    52,
    80
   ]
  },
  {
   "stage": "Rubedo",
   "bars": [
    80,
    96
   ]
  },
  {
   "stage": "Opus",
   "bars": [
    96,
    104
   ]
  }
 ],
 "sections": [
  {
   "id": "coldopen",
   "bars": [
    0,
    4
   ],
   "stage": "Nigredo",
   "jp": "ニグレド",
   "arcana": "0",
   "card": "The Fool",
   "cardJp": "愚者",
   "theme": "the eye opens over the hook sung a cappella; 'I am—' is cut off: we are not whole yet",
   "role": "hook first: the hook a cappella, cut before 'whole'",
   "color": [
    0.36,
    0.17,
    0.55
   ]
  },
  {
   "id": "intro",
   "bars": [
    4,
    8
   ],
   "stage": "Nigredo",
   "jp": "ニグレド",
   "arcana": "XIII",
   "card": "Death",
   "cardJp": "死神",
   "theme": "the blackening: the black sun over the mercury sea, the colossal Shadow rises",
   "role": "'Nigredo'; the beat assembles under the muffled kick",
   "color": [
    0.36,
    0.17,
    0.55
   ]
  },
  {
   "id": "riff1",
   "bars": [
    8,
    16
   ],
   "stage": "Nigredo",
   "jp": "ニグレド",
   "arcana": "I",
   "card": "The Magician",
   "cardJp": "魔術師",
   "theme": "the Work begins: the club of the black sun, the Shadow dances, the stone is lead",
   "role": "first drop: the anime OP title card, the RIFF twice",
   "color": [
    0.36,
    0.17,
    0.55
   ]
  },
  {
   "id": "verse1",
   "bars": [
    16,
    24
   ],
   "stage": "Nigredo",
   "jp": "ニグレド",
   "arcana": "IV",
   "card": "The Emperor",
   "cardJp": "皇帝",
   "theme": "the Persona: the hall of masks, the crown of lead; the mask shatters, the Shadow looks back",
   "role": "rap verse 1: the Persona and the Shadow",
   "color": [
    0.36,
    0.17,
    0.55
   ]
  },
  {
   "id": "pre1",
   "bars": [
    24,
    28
   ],
   "stage": "Nigredo",
   "jp": "ニグレド",
   "arcana": "XV",
   "card": "The Devil",
   "cardJp": "悪魔",
   "theme": "solve: the Shadow melts down; the dive into the pupil",
   "role": "pre-chorus 1 (female): the lift, the dead stop, 'ALBEDO!'",
   "color": [
    0.36,
    0.17,
    0.55
   ]
  },
  {
   "id": "chorus1",
   "bars": [
    28,
    36
   ],
   "stage": "Albedo",
   "jp": "アルベド",
   "arcana": "XVIII",
   "card": "The Moon",
   "cardJp": "月",
   "theme": "the whitening: the ink burns off the luminous body; lead turns to silver; the masks melt into moonlight",
   "role": "chorus 1 (silver): hook A + hook B",
   "color": [
    0.62,
    0.77,
    1.0
   ]
  },
  {
   "id": "riff2",
   "bars": [
    36,
    40
   ],
   "stage": "Albedo",
   "jp": "アルベド",
   "arcana": "XIV",
   "card": "Temperance",
   "cardJp": "節制",
   "theme": "the Rebis is carried up the moonlit mountain; the silver crowd dances",
   "role": "post-chorus riff",
   "color": [
    0.62,
    0.77,
    1.0
   ]
  },
  {
   "id": "verse2",
   "bars": [
    40,
    48
   ],
   "stage": "Albedo",
   "jp": "アルベド",
   "arcana": "II",
   "card": "The High Priestess",
   "cardJp": "女教皇",
   "theme": "the Anima: the black sea under a white moon, every mask her face, the pillars B and J",
   "role": "rap verse 2: the Anima; ends on the 30 s rap",
   "color": [
    0.62,
    0.77,
    1.0
   ]
  },
  {
   "id": "pre2",
   "bars": [
    48,
    52
   ],
   "stage": "Albedo",
   "jp": "アルベド",
   "arcana": "VI",
   "card": "The Lovers",
   "cardJp": "恋人",
   "theme": "the silver henshin foretold; the iris warms from silver to gold",
   "role": "pre-chorus 2: the lift, the dead stop, 'CITRINITAS!'",
   "color": [
    0.62,
    0.77,
    1.0
   ]
  },
  {
   "id": "chorus2",
   "bars": [
    52,
    60
   ],
   "stage": "Citrinitas",
   "jp": "キトリニタス",
   "arcana": "XIX",
   "card": "The Sun",
   "cardJp": "太陽",
   "theme": "the yellowing: sunrise on the Holy Mountain; silver turns to gold; the seven thieves are seen",
   "role": "chorus 2 (gold): hook A + hook B",
   "color": [
    0.94,
    0.71,
    0.16
   ]
  },
  {
   "id": "riff3",
   "bars": [
    60,
    64
   ],
   "stage": "Citrinitas",
   "jp": "キトリニタス",
   "arcana": "X",
   "card": "Wheel of Fortune",
   "cardJp": "運命の輪",
   "theme": "the Fool's journey turns as a wheel of 22 trumps",
   "role": "post-chorus riff under the wheel of trumps; everything stops on 63.4",
   "color": [
    0.94,
    0.71,
    0.16
   ]
  },
  {
   "id": "breakdown",
   "bars": [
    64,
    72
   ],
   "stage": "Citrinitas",
   "jp": "キトリニタス",
   "arcana": "IX",
   "card": "The Hermit",
   "cardJp": "隠者",
   "theme": "the Wise Old Man: the lantern that is the Hermetic vessel; look inside, you wake",
   "role": "breakdown: eyecatch sting, piano ballad, the Hermit speaks, heartbeat",
   "color": [
    0.94,
    0.71,
    0.16
   ]
  },
  {
   "id": "build",
   "bars": [
    72,
    80
   ],
   "stage": "Citrinitas",
   "jp": "キトリニタス",
   "arcana": "XVI",
   "card": "The Tower",
   "cardJp": "塔",
   "theme": "henshin: seven chakras, seven planets, seven metals turned to gold; lightning opens the crown",
   "role": "the build: the planetary roll call over a rising bass; the Tower struck; 'RUBEDO!'",
   "color": [
    0.94,
    0.71,
    0.16
   ]
  },
  {
   "id": "chorus3",
   "bars": [
    80,
    88
   ],
   "stage": "Rubedo",
   "jp": "ルベド",
   "arcana": "XXI",
   "card": "The World",
   "cardJp": "世界",
   "theme": "the reddening: the mandala of the Self, gold deepens to ruby, the Net of Being, the Rebis",
   "role": "final chorus, key change to B minor: hook A + hook B",
   "color": [
    0.84,
    0.1,
    0.11
   ]
  },
  {
   "id": "rapriff",
   "bars": [
    88,
    92
   ],
   "stage": "Rubedo",
   "jp": "ルベド",
   "arcana": "XX",
   "card": "Judgement",
   "cardJp": "審判",
   "theme": "sun king and moon queen married in the fire; everyone rises",
   "role": "rap over the riff: 'everybody sing!'",
   "color": [
    0.84,
    0.1,
    0.11
   ]
  },
  {
   "id": "chorus4",
   "bars": [
    92,
    96
   ],
   "stage": "Rubedo",
   "jp": "ルベド",
   "arcana": "XXI",
   "card": "The World",
   "cardJp": "世界",
   "theme": "the whole work in one frame; the dive into the heart of the Self",
   "role": "final hook; 'whole' held into the shout",
   "color": [
    0.84,
    0.1,
    0.11
   ]
  },
  {
   "id": "outro",
   "bars": [
    96,
    100
   ],
   "stage": "Opus",
   "jp": "オプス",
   "arcana": "I",
   "card": "The Magician",
   "cardJp": "魔術師",
   "theme": "the reality break: the heart was an eye, the eye a card, the card a wheel, the wheel a set",
   "role": "'Pull back, camera!': the band shrinks into a monitor, the cadence home",
   "color": [
    0.96,
    0.93,
    0.85
   ]
  },
  {
   "id": "coda",
   "bars": [
    100,
    104
   ],
   "stage": "Opus",
   "jp": "オプス",
   "arcana": "0",
   "card": "The Fool",
   "cardJp": "愚者",
   "theme": "the return: the set was in the eye; the circle closes, the Fool starts again",
   "role": "the final A major; 'I am whole.' sung softly; the eye closes",
   "color": [
    0.96,
    0.93,
    0.85
   ]
  }
 ],
 "chords": [
  "Am",
  "F",
  "C",
  "G",
  "Am",
  "F",
  "C",
  "G",
  "Am",
  "F",
  "C",
  "G",
  "Am",
  "F",
  "C",
  "G",
  "Am",
  "Am",
  "F",
  "G",
  "Am",
  "Am",
  "F",
  "E",
  "Dm",
  "F",
  "G",
  "E",
  "Am",
  "F",
  "C",
  "G",
  "Am",
  "F",
  "C",
  "G",
  "Am",
  "F",
  "C",
  "G",
  "Am",
  "Am",
  "F",
  "G",
  "Am",
  "F",
  "C",
  "G",
  "Dm",
  "F",
  "G",
  "E",
  "Am",
  "F",
  "C",
  "G",
  "Am",
  "F",
  "C",
  "G",
  "Am",
  "F",
  "C",
  "G",
  "F",
  "G",
  "Em",
  "Am",
  "F",
  "G",
  "Esus4",
  "E",
  "Am",
  "G/B",
  "C",
  "Dm",
  "Am/E",
  "F",
  "E/G#",
  "F#/A#",
  "Bm",
  "G",
  "D",
  "A",
  "Bm",
  "G",
  "D",
  "A",
  "Bm",
  "G",
  "D",
  "A",
  "Bm",
  "G",
  "D",
  "A",
  "Bm",
  "G",
  "Esus4",
  "E",
  "A",
  "A",
  "A",
  "A"
 ],
 "bass": [
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  45,
  41,
  48,
  43,
  45,
  41,
  48,
  43,
  45,
  45,
  41,
  43,
  45,
  45,
  41,
  40,
  38,
  41,
  43,
  40,
  45,
  41,
  48,
  43,
  45,
  41,
  48,
  43,
  45,
  41,
  48,
  43,
  45,
  45,
  41,
  43,
  45,
  41,
  48,
  43,
  38,
  41,
  43,
  40,
  45,
  41,
  48,
  43,
  45,
  41,
  48,
  43,
  45,
  41,
  48,
  43,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  45,
  47,
  48,
  50,
  52,
  53,
  56,
  58,
  47,
  43,
  38,
  45,
  47,
  43,
  38,
  45,
  47,
  43,
  38,
  45,
  47,
  43,
  38,
  45,
  47,
  43,
  40,
  40,
  33,
  null,
  null,
  null
 ],
 "energy": [
  0.1,
  0.14,
  0.18,
  0.22,
  0.3,
  0.38,
  0.46,
  0.56,
  0.86,
  0.86,
  0.88,
  0.88,
  0.88,
  0.88,
  0.9,
  0.9,
  0.66,
  0.66,
  0.66,
  0.68,
  0.68,
  0.68,
  0.7,
  0.72,
  0.74,
  0.78,
  0.84,
  0.9,
  0.92,
  0.92,
  0.93,
  0.93,
  0.94,
  0.94,
  0.95,
  0.95,
  0.9,
  0.9,
  0.9,
  0.9,
  0.68,
  0.68,
  0.7,
  0.7,
  0.72,
  0.72,
  0.74,
  0.76,
  0.78,
  0.82,
  0.88,
  0.94,
  0.96,
  0.96,
  0.96,
  0.96,
  0.96,
  0.96,
  0.96,
  0.96,
  0.92,
  0.92,
  0.92,
  0.86,
  0.3,
  0.28,
  0.28,
  0.3,
  0.32,
  0.34,
  0.38,
  0.44,
  0.5,
  0.56,
  0.62,
  0.68,
  0.76,
  0.84,
  0.92,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  0.55,
  0.45,
  0.4,
  0.5,
  0.85,
  0.65,
  0.45,
  0.25
 ],
 "arrangement": {
  "coldopen": {
   "pad": "choir-pad",
   "piano": "whole-notes",
   "bass": null,
   "lead": null,
   "arp": null,
   "drone": false,
   "choir": "soft"
  },
  "intro": {
   "pad": "low-passed",
   "piano": null,
   "bass": null,
   "lead": "tease-pluck (bars 6-7)",
   "arp": null,
   "drone": true,
   "choir": null
  },
  "riff1": {
   "pad": "full",
   "piano": "stabs",
   "bass": "drop",
   "lead": "riff",
   "arp": "16ths",
   "drone": false,
   "choir": "low"
  },
  "verse1": {
   "pad": "low-passed 2.5 kHz",
   "piano": "soft stabs 2,10",
   "bass": "groove",
   "lead": null,
   "arp": null,
   "drone": "low",
   "choir": null
  },
  "pre1": {
   "pad": "opening 2.5-9 kHz",
   "piano": null,
   "bass": "pedal",
   "lead": null,
   "arp": "rising 8ths",
   "drone": false,
   "choir": "swell"
  },
  "chorus1": {
   "pad": "full",
   "piano": "stabs",
   "bass": "drop",
   "lead": "hook double -12 dB",
   "arp": "16ths",
   "drone": false,
   "choir": "full"
  },
  "riff2": {
   "pad": "full",
   "piano": "stabs",
   "bass": "drop",
   "lead": "riff",
   "arp": "16ths",
   "drone": false,
   "choir": "low"
  },
  "verse2": {
   "pad": "low-passed 3 kHz",
   "piano": "soft stabs 2,10",
   "bass": "groove",
   "lead": null,
   "arp": "30 s albedo pluck",
   "drone": false,
   "choir": "ooh",
   "bells": "sparkles"
  },
  "pre2": {
   "pad": "opening 2.5-9 kHz",
   "piano": null,
   "bass": "pedal",
   "lead": null,
   "arp": "rising 8ths",
   "drone": false,
   "choir": "swell",
   "bells": true
  },
  "chorus2": {
   "pad": "full",
   "piano": "stabs",
   "bass": "drop",
   "lead": "hook double -12 dB",
   "arp": "16ths, octave up",
   "drone": false,
   "choir": "octave up"
  },
  "riff3": {
   "pad": "full",
   "piano": "stabs",
   "bass": "drop",
   "lead": "riff",
   "arp": "16ths",
   "drone": false,
   "choir": "low"
  },
  "breakdown": {
   "pad": "warm 1.2 kHz",
   "piano": "broken-chord 8ths",
   "bass": null,
   "lead": null,
   "arp": null,
   "drone": false,
   "choir": "soft",
   "bowl": true
  },
  "build": {
   "pad": "rising filter",
   "piano": null,
   "bass": "rising8",
   "lead": "tease-pluck",
   "arp": null,
   "drone": false,
   "choir": "rising aah"
  },
  "chorus3": {
   "pad": "full",
   "piano": "stabs",
   "bass": "drop",
   "lead": "hook double + octave",
   "arp": "16ths",
   "drone": false,
   "choir": "octave up"
  },
  "rapriff": {
   "pad": "full",
   "piano": "stabs",
   "bass": "drop",
   "lead": "riff +2",
   "arp": "16ths",
   "drone": false,
   "choir": "full"
  },
  "chorus4": {
   "pad": "full",
   "piano": null,
   "bass": "drop",
   "lead": "hook double + octave",
   "arp": "16ths",
   "drone": false,
   "choir": "sings the hook"
  },
  "outro": {
   "pad": "monitor",
   "piano": "chords",
   "bass": "drop (monitor)",
   "lead": "riff bars 1-2 (monitor)",
   "arp": null,
   "drone": false,
   "choir": "pad",
   "bus": "monitor from beat 386"
  },
  "coda": {
   "pad": "A major",
   "piano": "A major",
   "bass": "A1 once",
   "lead": "A major triad",
   "arp": null,
   "drone": false,
   "choir": "A major",
   "bells": "music box"
  }
 },
 "riff": {
  "notes": [
   [
    [
     81,
     0,
     3
    ],
    [
     84,
     3,
     3
    ],
    [
     88,
     6,
     2
    ],
    [
     86,
     8,
     3
    ],
    [
     88,
     11,
     5
    ]
   ],
   [
    [
     81,
     0,
     3
    ],
    [
     84,
     3,
     3
    ],
    [
     89,
     6,
     2
    ],
    [
     88,
     8,
     3
    ],
    [
     84,
     11,
     5
    ]
   ],
   [
    [
     88,
     0,
     2
    ],
    [
     86,
     2,
     2
    ],
    [
     91,
     4,
     6
    ],
    [
     88,
     10,
     6
    ]
   ],
   [
    [
     86,
     0,
     4
    ],
    [
     88,
     4,
     4
    ],
    [
     91,
     8,
     6
    ],
    [
     83,
     14,
     2
    ]
   ]
  ],
  "plays": [
   {
    "bars": [
     6,
     8
    ],
    "riffBars": [
     0,
     1
    ],
    "key": 0,
    "voice": "tease pluck, low-passed"
   },
   {
    "bars": [
     8,
     16
    ],
    "riffBars": [
     0,
     1,
     2,
     3,
     0,
     1,
     2,
     3
    ],
    "key": 0,
    "voice": "supersaw lead + octave"
   },
   {
    "bars": [
     36,
     40
    ],
    "riffBars": [
     0,
     1,
     2,
     3
    ],
    "key": 0,
    "voice": "supersaw lead + octave"
   },
   {
    "bars": [
     60,
     64
    ],
    "riffBars": [
     0,
     1,
     2,
     3
    ],
    "key": 0,
    "voice": "supersaw lead + octave; bar 63 stops at step 12"
   },
   {
    "bars": [
     88,
     92
    ],
    "riffBars": [
     0,
     1,
     2,
     3
    ],
    "key": 2,
    "voice": "supersaw lead + octave"
   },
   {
    "bars": [
     96,
     98
    ],
    "riffBars": [
     0,
     1
    ],
    "key": 2,
    "voice": "supersaw lead through the monitor bus, from beat 386"
   }
  ]
 },
 "drums": {
  "kick": [
   "................",
   "................",
   "................",
   "................",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...........",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...........",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x.......",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "x..x....x..x....",
   "x..x....x..x....",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...........",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "X...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "........x...x...",
   "x...x...x...x...",
   "x...x...x...x...",
   "................",
   "X...............",
   "................",
   "................",
   "................"
  ],
  "clap": [
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "............xxxX",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x.xX",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......xxxX",
   "x...x...x...x...",
   "x...x...x...x...",
   "x.x.x.x.x.x.x.x.",
   "x...x...........",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x.xX",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......xxxX",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x.xX",
   "x...x...x...x...",
   "x...x...x...x...",
   "x.x.x.x.x.x.x.x.",
   "x...x...........",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x.xX",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......X...",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "x...x...x...x...",
   "x.x.x.xX........",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x.xX",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......xxxX",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "....x.......x...",
   "............x...",
   "....x.......x...",
   "....x.......x...",
   "................",
   "................",
   "................",
   "................",
   "................"
  ],
  "roll": [
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "rrrrrrrr........",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "rrrrrrrr........",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "x...x...x...x...",
   "x...x...x...x...",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "rrrrrrrr........",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................"
  ],
  "openHat": [
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x.........",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x.........",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x.....",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x.........",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "................",
   "..x...x...x...x.",
   "..x...x...x...x.",
   "................",
   "................",
   "................",
   "................",
   "................"
  ],
  "closedHat": [
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "x.x.x.x.x.x.x.x.",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxx........",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxx........",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxx....",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "................",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxx........",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "xxxxxxxxxxxxxxxx",
   "........xxxxxxxx",
   "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.",
   "................",
   "................",
   "................",
   "................",
   "................"
  ]
 },
 "hits": [
  {
   "type": "gong",
   "beat": 0,
   "note": "long (9 s), under the a cappella hook"
  },
  {
   "type": "orchHit",
   "beat": 16,
   "note": "low, dark; with 'Nigredo'"
  },
  {
   "type": "crash",
   "beat": 32
  },
  {
   "type": "orchHit",
   "beat": 32,
   "note": "A minor"
  },
  {
   "type": "subDrop",
   "beat": 32
  },
  {
   "type": "crash",
   "beat": 48
  },
  {
   "type": "crash",
   "beat": 64,
   "note": "soft"
  },
  {
   "type": "crash",
   "beat": 112
  },
  {
   "type": "orchHit",
   "beat": 112,
   "note": "A minor, bright"
  },
  {
   "type": "subDrop",
   "beat": 112
  },
  {
   "type": "crash",
   "beat": 128
  },
  {
   "type": "crash",
   "beat": 144
  },
  {
   "type": "crash",
   "beat": 160,
   "note": "soft"
  },
  {
   "type": "crash",
   "beat": 208
  },
  {
   "type": "orchHit",
   "beat": 208,
   "note": "A minor, brass-heavy"
  },
  {
   "type": "subDrop",
   "beat": 208
  },
  {
   "type": "crash",
   "beat": 224
  },
  {
   "type": "crash",
   "beat": 240
  },
  {
   "type": "jingle",
   "beat": 256,
   "note": "eyecatch sting: bells E6 D6 G6-E6 (the 'Magnum Opus' motif) in 8ths + a ding; slt whispers 'Magnum Opus'"
  },
  {
   "type": "bowl",
   "beat": 256,
   "note": "singing bowl 220 Hz, 8 s"
  },
  {
   "type": "subSwell",
   "fromBeat": 280,
   "toBeat": 288,
   "note": "sub swell under the heartbeat into the build"
  },
  {
   "type": "crash",
   "beat": 288,
   "note": "soft; the build starts"
  },
  {
   "type": "thunder",
   "beat": 316,
   "note": "the Tower: a 25 ms noise crack + 2 s rumble, cut at the gap"
  },
  {
   "type": "crash",
   "beat": 320
  },
  {
   "type": "orchHit",
   "beat": 320,
   "note": "B minor"
  },
  {
   "type": "subDrop",
   "beat": 320
  },
  {
   "type": "crash",
   "beat": 328
  },
  {
   "type": "crash",
   "beat": 336
  },
  {
   "type": "crash",
   "beat": 352
  },
  {
   "type": "orchHit",
   "beat": 352,
   "note": "B minor, short"
  },
  {
   "type": "crash",
   "beat": 368
  },
  {
   "type": "subDrop",
   "beat": 368
  },
  {
   "type": "slate",
   "beat": 384,
   "note": "a 6 ms wood-block clack + 40 ms body, dry, with the director's shout"
  },
  {
   "type": "crash",
   "beat": 400
  },
  {
   "type": "orchHit",
   "beat": 400,
   "note": "A major"
  },
  {
   "type": "gong",
   "beat": 400,
   "note": "3 s"
  },
  {
   "type": "subDrop",
   "beat": 400
  },
  {
   "type": "musicBox",
   "beat": 400,
   "note": "bells, hook lines 1-2 in A major, bars 100-101",
   "notes": [
    [
     81,
     0,
     2
    ],
    [
     85,
     2,
     2
    ],
    [
     88,
     4,
     2
    ],
    [
     86,
     6,
     2
    ],
    [
     88,
     8,
     6
    ],
    [
     81,
     16,
     2
    ],
    [
     85,
     18,
     2
    ],
    [
     90,
     20,
     2
    ],
    [
     88,
     22,
     2
    ],
    [
     85,
     24,
     6
    ]
   ]
  },
  {
   "type": "bowl",
   "beat": 412,
   "note": "as the lids close"
  }
 ],
 "sweeps": [
  {
   "type": "reverseCymbal",
   "fromBeat": 14,
   "toBeat": 16
  },
  {
   "type": "riser",
   "fromBeat": 24,
   "toBeat": 32
  },
  {
   "type": "reverseCymbal",
   "fromBeat": 30,
   "toBeat": 32
  },
  {
   "type": "riser",
   "fromBeat": 96,
   "toBeat": 110
  },
  {
   "type": "reverseCymbal",
   "fromBeat": 110,
   "toBeat": 112
  },
  {
   "type": "reverseCymbal",
   "fromBeat": 142,
   "toBeat": 144
  },
  {
   "type": "riser",
   "fromBeat": 192,
   "toBeat": 206
  },
  {
   "type": "reverseCymbal",
   "fromBeat": 206,
   "toBeat": 208
  },
  {
   "type": "reverseCymbal",
   "fromBeat": 238,
   "toBeat": 240
  },
  {
   "type": "downlifter",
   "fromBeat": 252,
   "toBeat": 256
  },
  {
   "type": "riser",
   "fromBeat": 280,
   "toBeat": 288,
   "note": "soft, filtered, under the heartbeat"
  },
  {
   "type": "riser",
   "fromBeat": 304,
   "toBeat": 318,
   "note": "white noise"
  },
  {
   "type": "reverseCymbal",
   "fromBeat": 318,
   "toBeat": 320
  },
  {
   "type": "reverseCymbal",
   "fromBeat": 350,
   "toBeat": 352
  },
  {
   "type": "reverseCymbal",
   "fromBeat": 366,
   "toBeat": 368
  },
  {
   "type": "reverseSwell",
   "fromBeat": 396,
   "toBeat": 400,
   "chord": "A",
   "note": "the 30 s bar-1 swell, in A major"
  }
 ],
 "gap": {
  "fromBeat": 318,
  "toBeat": 320,
  "note": "the RUBEDO gap (kept for 30 s compatibility; all five are in 'gaps')"
 },
 "gaps": [
  {
   "fromBeat": 14,
   "toBeat": 16,
   "note": "cold open: 'I am—' cut dry; only the reverse cymbal"
  },
  {
   "fromBeat": 110,
   "toBeat": 112,
   "note": "'ALBEDO!' + reverse cymbal"
  },
  {
   "fromBeat": 206,
   "toBeat": 208,
   "note": "'CITRINITAS!' + reverse cymbal"
  },
  {
   "fromBeat": 318,
   "toBeat": 320,
   "note": "'RUBEDO!' + reverse cymbal (the 30 s gap)"
  },
  {
   "fromBeat": 384,
   "toBeat": 386,
   "note": "'Pull back, camera!' + the slate, dry; then the band returns small"
  }
 ],
 "filters": [
  {
   "type": "kickMuffle",
   "fromBeat": 16,
   "toBeat": 32,
   "fc": [
    250,
    16000
   ],
   "note": "the 30 s muffled kick opening over the intro"
  },
  {
   "type": "kickMuffle",
   "fromBeat": 280,
   "toBeat": 288,
   "fc": [
    150,
    150
   ],
   "note": "heartbeat"
  },
  {
   "type": "kickMuffle",
   "fromBeat": 288,
   "toBeat": 296,
   "fc": [
    300,
    16000
   ],
   "note": "the build's kick opens"
  },
  {
   "type": "monitor",
   "fromBeat": 386,
   "toBeat": 400,
   "note": "music bus only: band-pass 350-3500 Hz narrowing to 600-2000, mono, 0.4 s room, -9 dB; the vocal and the shout stay full-range"
  }
 ],
 "chakras": [
  {
   "name": "Muladhara",
   "en": "root",
   "color": [
    0.95,
    0.1,
    0.12
   ],
   "beat": 288,
   "planet": "Saturn",
   "metal": "lead",
   "glyph": "♄",
   "jp": "土星—鉛"
  },
  {
   "name": "Svadhisthana",
   "en": "sacral",
   "color": [
    1.0,
    0.45,
    0.05
   ],
   "beat": 292,
   "planet": "Jupiter",
   "metal": "tin",
   "glyph": "♃",
   "jp": "木星—錫"
  },
  {
   "name": "Manipura",
   "en": "solar",
   "color": [
    1.0,
    0.85,
    0.1
   ],
   "beat": 296,
   "planet": "Mars",
   "metal": "iron",
   "glyph": "♂",
   "jp": "火星—鉄"
  },
  {
   "name": "Anahata",
   "en": "heart",
   "color": [
    0.15,
    0.9,
    0.3
   ],
   "beat": 300,
   "planet": "Venus",
   "metal": "copper",
   "glyph": "♀",
   "jp": "金星—銅"
  },
  {
   "name": "Vishuddha",
   "en": "throat",
   "color": [
    0.1,
    0.6,
    1.0
   ],
   "beat": 304,
   "planet": "Mercury",
   "metal": "quicksilver",
   "glyph": "☿",
   "jp": "水星—水銀"
  },
  {
   "name": "Ajna",
   "en": "third eye",
   "color": [
    0.35,
    0.2,
    1.0
   ],
   "beat": 308,
   "planet": "Luna",
   "metal": "silver",
   "glyph": "☽",
   "jp": "月—銀"
  },
  {
   "name": "Sahasrara",
   "en": "crown",
   "color": [
    0.85,
    0.4,
    1.0
   ],
   "beat": 312,
   "planet": "Sol",
   "metal": "gold",
   "glyph": "☉",
   "jp": "太陽—金"
  }
 ],
 "trumps": [
  {
   "n": 0,
   "numeral": "0",
   "fr": "Le Mat",
   "en": "The Fool",
   "jp": "愚者",
   "beat": 0,
   "note": "the eye opens: the journey starts"
  },
  {
   "n": 13,
   "numeral": "XIII",
   "fr": "La Mort",
   "en": "Death",
   "jp": "死神",
   "beat": 16,
   "note": "NIGREDO"
  },
  {
   "n": 1,
   "numeral": "I",
   "fr": "Le Bateleur",
   "en": "The Magician",
   "jp": "魔術師",
   "beat": 32,
   "note": "the title drop: the Work begins"
  },
  {
   "n": 4,
   "numeral": "IV",
   "fr": "L'Empereur",
   "en": "The Emperor",
   "jp": "皇帝",
   "beat": 70,
   "note": "'crown made of lead'"
  },
  {
   "n": 5,
   "numeral": "V",
   "fr": "Le Pape",
   "en": "The Hierophant",
   "jp": "教皇",
   "beat": 74,
   "note": "'smile for the crowd': the masks of convention"
  },
  {
   "n": 15,
   "numeral": "XV",
   "fr": "Le Diable",
   "en": "The Devil",
   "jp": "悪魔",
   "beat": 94,
   "note": "the mask shatters; the Shadow's eyes"
  },
  {
   "n": 18,
   "numeral": "XVIII",
   "fr": "La Lune",
   "en": "The Moon",
   "jp": "月",
   "beat": 112,
   "note": "ALBEDO"
  },
  {
   "n": 14,
   "numeral": "XIV",
   "fr": "Tempérance",
   "en": "Temperance",
   "jp": "節制",
   "beat": 128,
   "note": "'black into the silver': the mixing"
  },
  {
   "n": 6,
   "numeral": "VI",
   "fr": "L'Amoureux",
   "en": "The Lovers",
   "jp": "恋人",
   "beat": 142,
   "note": "'two are one': the mirror merge"
  },
  {
   "n": 2,
   "numeral": "II",
   "fr": "La Papesse",
   "en": "The High Priestess",
   "jp": "女教皇",
   "beat": 172,
   "note": "the Anima between the pillars"
  },
  {
   "n": 8,
   "numeral": "VIII",
   "fr": "La Justice",
   "en": "Justice",
   "jp": "正義",
   "beat": 180,
   "note": "'Anima on the right': the balance"
  },
  {
   "n": 19,
   "numeral": "XIX",
   "fr": "Le Soleil",
   "en": "The Sun",
   "jp": "太陽",
   "beat": 208,
   "note": "CITRINITAS"
  },
  {
   "n": 17,
   "numeral": "XVII",
   "fr": "L'Étoile",
   "en": "The Star",
   "jp": "星",
   "beat": 230,
   "note": "'silver into sun': the eclipse in the orrery"
  },
  {
   "n": 10,
   "numeral": "X",
   "fr": "La Roue de Fortune",
   "en": "Wheel of Fortune",
   "jp": "運命の輪",
   "beat": 240,
   "note": "the wheel of trumps"
  },
  {
   "n": 12,
   "numeral": "XII",
   "fr": "Le Pendu",
   "en": "The Hanged Man",
   "jp": "吊された男",
   "beat": 256,
   "note": "the eyecatch: the world upside down"
  },
  {
   "n": 9,
   "numeral": "IX",
   "fr": "L'Hermite",
   "en": "The Hermit",
   "jp": "隠者",
   "beat": 260,
   "note": "the lantern"
  },
  {
   "n": 7,
   "numeral": "VII",
   "fr": "Le Chariot",
   "en": "The Chariot",
   "jp": "戦車",
   "beat": 288,
   "note": "the roll call begins: the planets' chariot"
  },
  {
   "n": 11,
   "numeral": "XI",
   "fr": "La Force",
   "en": "Strength",
   "jp": "力",
   "beat": 296,
   "note": "MARS!"
  },
  {
   "n": 3,
   "numeral": "III",
   "fr": "L'Impératrice",
   "en": "The Empress",
   "jp": "女帝",
   "beat": 300,
   "note": "VENUS!"
  },
  {
   "n": 16,
   "numeral": "XVI",
   "fr": "La Maison Dieu",
   "en": "The Tower",
   "jp": "塔",
   "beat": 316,
   "note": "lightning strikes the tower"
  },
  {
   "n": 20,
   "numeral": "XX",
   "fr": "Le Jugement",
   "en": "Judgement",
   "jp": "審判",
   "beat": 318,
   "note": "RUBEDO! shouted into the gap"
  },
  {
   "n": 21,
   "numeral": "XXI",
   "fr": "Le Monde",
   "en": "The World",
   "jp": "世界",
   "beat": 382,
   "note": "'I am whole!': 22/22"
  }
 ],
 "vocals": {
  "announcer": [
   {
    "text": "Nigredo",
    "beat": 16,
    "jp": "ニグレド",
    "voice": "rms",
    "style": "the 30 s render: deep, slow, huge reverb",
    "syllables": [
     0.034,
     0.759,
     1.723
    ]
   },
   {
    "text": "Magnum Opus!",
    "beat": 32,
    "jp": "マグヌム・オプス！",
    "voice": "rms+awb",
    "style": "anime title shout, doubled, short plate, on the title drop",
    "syllables": [
     0,
     0.601,
     1.167,
     1.779
    ]
   },
   {
    "text": "Albedo!",
    "beat": 110,
    "jp": "アルベド！",
    "voice": "rms",
    "flite": "Al bee doe",
    "style": "shouted into the gap, bright hall, tail into the drop",
    "syllables": [
     0,
     0.567,
     0.918
    ]
   },
   {
    "text": "Citrinitas!",
    "beat": 206,
    "jp": "キトリニタス！",
    "voice": "rms",
    "flite": "Kit tree nee tass",
    "style": "shouted into the gap, warm hall",
    "syllables": [
     0,
     0.351,
     1.009,
     1.349
    ]
   },
   {
    "text": "Rubedo!",
    "beat": 318,
    "jp": "ルベド！",
    "voice": "rms",
    "style": "the 30 s shout into the gap",
    "syllables": [
     0,
     0.589,
     1.099
    ]
   },
   {
    "text": "Pull back, camera!",
    "beat": 384,
    "jp": "カメラ、引け！",
    "voice": "awb",
    "style": "THE DIRECTOR: dry, band-passed 350-3500 Hz (megaphone), 60 ms slap, no hall; the only voice from outside the picture",
    "syllables": [
     0.034,
     0.374,
     1.099,
     1.496,
     1.983
    ]
   }
  ],
  "rap": [
   {
    "bar": 16,
    "text": "Mask on my face,",
    "jp": "顔に仮面、",
    "style": "verse",
    "words": [
     [
      "Mask",
      0
     ],
     [
      "on",
      4
     ],
     [
      "my",
      6
     ],
     [
      "face",
      8
     ]
    ],
    "preRoll": [
     0.0,
     0.0,
     0.0,
     0.095
    ]
   },
   {
    "bar": 17,
    "text": "crown made of lead,",
    "jp": "鉛の王冠、",
    "style": "verse",
    "words": [
     [
      "crown",
      0
     ],
     [
      "made",
      4
     ],
     [
      "of",
      6
     ],
     [
      "lead",
      8
     ]
    ],
    "preRoll": [
     0.05,
     0.0,
     0.0,
     0.03
    ]
   },
   {
    "bar": 18,
    "text": "smile for the crowd,",
    "jp": "群衆に笑顔、",
    "style": "verse",
    "words": [
     [
      "smile",
      0
     ],
     [
      "for",
      4
     ],
     [
      "the",
      6
     ],
     [
      "crowd",
      8
     ]
    ],
    "preRoll": [
     0.066,
     0.035,
     0.0,
     0.08
    ]
   },
   {
    "bar": 19,
    "text": "words never said.",
    "jp": "言えなかった言葉。",
    "style": "verse",
    "words": [
     [
      "words",
      0
     ],
     [
      "never",
      4
     ],
     [
      "said",
      8
     ]
    ],
    "preRoll": [
     0.0,
     0.0,
     0.105
    ]
   },
   {
    "bar": 20,
    "text": "Black sun rising,",
    "jp": "黒い太陽が昇る、",
    "style": "verse",
    "words": [
     [
      "Black",
      0
     ],
     [
      "sun",
      4
     ],
     [
      "rising",
      8
     ]
    ],
    "preRoll": [
     0.035,
     0.08,
     0.0
    ]
   },
   {
    "bar": 21,
    "text": "raven in the sky,",
    "jp": "空にカラス、",
    "style": "verse",
    "words": [
     [
      "raven",
      0
     ],
     [
      "in",
      4
     ],
     [
      "the",
      6
     ],
     [
      "sky",
      8
     ]
    ],
    "preRoll": [
     0.0,
     0.0,
     0.0,
     0.108
    ]
   },
   {
    "bar": 22,
    "text": "who is the stranger",
    "jp": "誰だ、見知らぬ者は",
    "style": "verse",
    "words": [
     [
      "who",
      0
     ],
     [
      "is",
      2
     ],
     [
      "the",
      4
     ],
     [
      "stranger",
      8
     ]
    ],
    "preRoll": [
     0.0,
     0.0,
     0.0,
     0.105
    ]
   },
   {
    "bar": 23,
    "text": "behind my eye?",
    "jp": "この瞳の奥に？",
    "style": "verse",
    "words": [
     [
      "behind",
      0
     ],
     [
      "my",
      6
     ],
     [
      "eye",
      8
     ]
    ],
    "preRoll": [
     0.038,
     0.0,
     0.0
    ]
   },
   {
    "bar": 40,
    "text": "Silver on the water,",
    "jp": "水面に銀、",
    "style": "verse",
    "words": [
     [
      "Silver",
      0
     ],
     [
      "on",
      4
     ],
     [
      "the",
      6
     ],
     [
      "water",
      8
     ]
    ],
    "preRoll": [
     0.07,
     0.0,
     0.0,
     0.0
    ]
   },
   {
    "bar": 41,
    "text": "moon upon the sea,",
    "jp": "海に月、",
    "style": "verse",
    "words": [
     [
      "moon",
      0
     ],
     [
      "upon",
      3
     ],
     [
      "the",
      6
     ],
     [
      "sea",
      8
     ]
    ],
    "preRoll": [
     0.0,
     0.0,
     0.0,
     0.108
    ]
   },
   {
    "bar": 42,
    "text": "look into the mirror,",
    "jp": "鏡を覗けば、",
    "style": "verse",
    "words": [
     [
      "look",
      0
     ],
     [
      "into",
      3
     ],
     [
      "the",
      6
     ],
     [
      "mirror",
      8
     ]
    ],
    "preRoll": [
     0.021,
     0.0,
     0.0,
     0.031
    ]
   },
   {
    "bar": 43,
    "text": "she is looking back at me.",
    "jp": "彼女が見つめ返す。",
    "style": "verse",
    "words": [
     [
      "she",
      0
     ],
     [
      "is",
      2
     ],
     [
      "looking",
      4
     ],
     [
      "back",
      8
     ],
     [
      "at",
      10
     ],
     [
      "me",
      12
     ]
    ],
    "preRoll": [
     0.049,
     0.0,
     0.024,
     0.0,
     0.0,
     0.021
    ]
   },
   {
    "bar": 44,
    "text": "Shadow on the left,",
    "jp": "左に、影。",
    "style": "verse",
    "words": [
     [
      "Shadow",
      0
     ],
     [
      "on",
      4
     ],
     [
      "the",
      6
     ],
     [
      "left",
      8
     ]
    ],
    "preRoll": [
     0.059,
     0.0,
     0.0,
     0.03
    ]
   },
   {
    "bar": 45,
    "text": "Anima on the right,",
    "jp": "右に、アニマ。",
    "style": "verse",
    "words": [
     [
      "Anima",
      0
     ],
     [
      "on",
      4
     ],
     [
      "the",
      6
     ],
     [
      "right",
      8
     ]
    ],
    "preRoll": [
     0.0,
     0.0,
     0.0,
     0.0
    ]
   },
   {
    "bar": 46,
    "text": "climb the Holy Mountain",
    "jp": "聖なる山を登れ",
    "style": "verse",
    "words": [
     [
      "climb",
      0
     ],
     [
      "the",
      2
     ],
     [
      "Holy",
      4
     ],
     [
      "Mountain",
      8
     ]
    ],
    "preRoll": [
     0.0,
     0.0,
     0.059,
     0.0
    ]
   },
   {
    "bar": 47,
    "text": "to the Self, the light!",
    "jp": "自己へ、光へ！",
    "style": "verse",
    "words": [
     [
      "to",
      0
     ],
     [
      "the",
      2
     ],
     [
      "Self",
      4
     ],
     [
      "the",
      8
     ],
     [
      "light",
      10
     ]
    ],
    "preRoll": [
     0.045,
     0.0,
     0.087,
     0.0,
     0.024
    ]
   },
   {
    "bar": 71,
    "text": "Seven thieves, I want it back!",
    "jp": "七人の盗賊よ、返してもらう！",
    "style": "whisper",
    "words": [
     [
      "Seven",
      0
     ],
     [
      "thieves",
      2
     ],
     [
      "I",
      6
     ],
     [
      "want",
      8
     ],
     [
      "it",
      10
     ],
     [
      "back",
      12
     ]
    ],
    "preRoll": [
     0.038,
     0.08,
     0.0,
     0.0,
     0.0,
     0.07
    ]
   },
   {
    "bar": 72,
    "text": "SATURN!",
    "jp": "土星！",
    "style": "shout",
    "words": [
     [
      "SATURN",
      0
     ]
    ],
    "syllables": [
     -0.203,
     0.533
    ]
   },
   {
    "bar": 73,
    "text": "JUPITER!",
    "jp": "木星！",
    "style": "shout",
    "words": [
     [
      "JUPITER",
      0
     ]
    ],
    "syllables": [
     0,
     0.589,
     0.884
    ]
   },
   {
    "bar": 74,
    "text": "MARS!",
    "jp": "火星！",
    "style": "shout",
    "words": [
     [
      "MARS",
      0
     ]
    ],
    "syllables": [
     0
    ]
   },
   {
    "bar": 75,
    "text": "VENUS!",
    "jp": "金星！",
    "style": "shout",
    "words": [
     [
      "VENUS",
      0
     ]
    ],
    "syllables": [
     0,
     0.499
    ]
   },
   {
    "bar": 76,
    "text": "MERCURY!",
    "jp": "水星！",
    "style": "shout",
    "words": [
     [
      "MERCURY",
      0
     ]
    ],
    "syllables": [
     -0.063,
     0.469,
     0.764
    ]
   },
   {
    "bar": 77,
    "text": "LUNA!",
    "jp": "月！",
    "style": "shout",
    "words": [
     [
      "LUNA",
      0
     ]
    ],
    "syllables": [
     -0.079,
     0.691
    ]
   },
   {
    "bar": 78,
    "text": "SOL!",
    "jp": "太陽！",
    "style": "shout",
    "words": [
     [
      "SOL",
      0
     ]
    ],
    "syllables": [
     -0.235
    ]
   },
   {
    "bar": 88,
    "text": "Sun is the king,",
    "jp": "太陽は王、",
    "style": "hype",
    "words": [
     [
      "Sun",
      0
     ],
     [
      "is",
      4
     ],
     [
      "the",
      6
     ],
     [
      "king",
      8
     ]
    ],
    "preRoll": [
     0.08,
     0.0,
     0.0,
     0.07
    ]
   },
   {
    "bar": 89,
    "text": "moon is the queen,",
    "jp": "月は女王、",
    "style": "hype",
    "words": [
     [
      "moon",
      0
     ],
     [
      "is",
      4
     ],
     [
      "the",
      6
     ],
     [
      "queen",
      8
     ]
    ],
    "preRoll": [
     0.021,
     0.0,
     0.0,
     0.085
    ]
   },
   {
    "bar": 90,
    "text": "married in the fire,",
    "jp": "炎の中で結ばれ、",
    "style": "hype",
    "words": [
     [
      "married",
      0
     ],
     [
      "in",
      4
     ],
     [
      "the",
      6
     ],
     [
      "fire",
      8
     ]
    ],
    "preRoll": [
     0.035,
     0.0,
     0.0,
     0.066
    ]
   },
   {
    "bar": 91,
    "text": "everybody sing!",
    "jp": "みんなで歌え！",
    "style": "hype",
    "words": [
     [
      "everybody",
      0
     ],
     [
      "sing",
      8
     ]
    ],
    "preRoll": [
     0.0,
     0.112
    ]
   }
  ],
  "hook": [
   {
    "bar": 28,
    "part": "A",
    "style": "hook",
    "key": 0,
    "text": "Burn me in the fire,",
    "jp": "炎で燃やして",
    "words": [
     [
      "Burn",
      0
     ],
     [
      "me",
      2
     ],
     [
      "in",
      4
     ],
     [
      "the",
      6
     ],
     [
      "fire",
      8
     ]
    ],
    "notes": [
     [
      "burn",
      0,
      2,
      69
     ],
     [
      "me",
      2,
      2,
      72
     ],
     [
      "in",
      4,
      2,
      76
     ],
     [
      "the",
      6,
      2,
      74
     ],
     [
      "fire",
      8,
      7.3,
      76
     ]
    ],
    "chrome": "silver"
   },
   {
    "bar": 29,
    "part": "A",
    "style": "hook",
    "key": 0,
    "text": "turn my lead to gold,",
    "jp": "鉛を金に変えて",
    "words": [
     [
      "turn",
      0
     ],
     [
      "my",
      2
     ],
     [
      "lead",
      4
     ],
     [
      "to",
      6
     ],
     [
      "gold",
      8
     ]
    ],
    "notes": [
     [
      "turn",
      0,
      2,
      69
     ],
     [
      "my",
      2,
      2,
      72
     ],
     [
      "led",
      4,
      2,
      77
     ],
     [
      "too",
      6,
      2,
      76
     ],
     [
      "gold",
      8,
      7.3,
      72
     ]
    ],
    "chrome": "silver"
   },
   {
    "bar": 30,
    "part": "A",
    "style": "hook",
    "key": 0,
    "text": "Magnum Opus,",
    "jp": "マグヌム・オプス",
    "words": [
     [
      "Magnum",
      0
     ],
     [
      "Opus",
      4
     ]
    ],
    "notes": [
     [
      "mag",
      0,
      2,
      76
     ],
     [
      "num",
      2,
      2,
      74
     ],
     [
      "oh",
      4,
      5.6,
      79
     ],
     [
      "pus",
      10,
      2.6,
      76
     ]
    ],
    "chrome": "silver"
   },
   {
    "bar": 31,
    "part": "A",
    "style": "hook",
    "key": 0,
    "text": "I am whole!",
    "jp": "我は、全し。",
    "words": [
     [
      "I",
      0
     ],
     [
      "am",
      4
     ],
     [
      "whole",
      8
     ]
    ],
    "notes": [
     [
      "I",
      0,
      3.7,
      74
     ],
     [
      "am",
      4,
      3.7,
      76
     ],
     [
      "whole",
      8,
      8.0,
      79
     ]
    ],
    "chrome": "silver"
   },
   {
    "bar": 32,
    "part": "B",
    "style": "hook",
    "key": 0,
    "text": "Black into the silver,",
    "jp": "黒は銀へ、",
    "words": [
     [
      "Black",
      0
     ],
     [
      "into",
      2
     ],
     [
      "the",
      6
     ],
     [
      "silver",
      8
     ]
    ],
    "notes": [
     [
      "black",
      0,
      2,
      69
     ],
     [
      "in",
      2,
      2,
      72
     ],
     [
      "too",
      4,
      2,
      76
     ],
     [
      "the",
      6,
      2,
      74
     ],
     [
      "sil",
      8,
      4,
      76
     ],
     [
      "ver",
      12,
      3.3,
      74
     ]
    ],
    "chrome": "silver"
   },
   {
    "bar": 33,
    "part": "B",
    "style": "hook",
    "key": 0,
    "text": "silver into sun,",
    "jp": "銀は太陽へ、",
    "words": [
     [
      "silver",
      0
     ],
     [
      "into",
      4
     ],
     [
      "sun",
      8
     ]
    ],
    "notes": [
     [
      "sil",
      0,
      2,
      69
     ],
     [
      "ver",
      2,
      2,
      72
     ],
     [
      "in",
      4,
      2,
      77
     ],
     [
      "too",
      6,
      2,
      76
     ],
     [
      "sun",
      8,
      7.3,
      72
     ]
    ],
    "chrome": "silver"
   },
   {
    "bar": 34,
    "part": "B",
    "style": "hook",
    "key": 0,
    "text": "Magnum Opus,",
    "jp": "マグヌム・オプス",
    "words": [
     [
      "Magnum",
      0
     ],
     [
      "Opus",
      4
     ]
    ],
    "notes": [
     [
      "mag",
      0,
      2,
      76
     ],
     [
      "num",
      2,
      2,
      74
     ],
     [
      "oh",
      4,
      5.6,
      79
     ],
     [
      "pus",
      10,
      2.6,
      76
     ]
    ],
    "chrome": "silver"
   },
   {
    "bar": 35,
    "part": "B",
    "style": "hook",
    "key": 0,
    "text": "two are one!",
    "jp": "二つは一つ！",
    "words": [
     [
      "two",
      0
     ],
     [
      "are",
      4
     ],
     [
      "one",
      8
     ]
    ],
    "notes": [
     [
      "two",
      0,
      3.7,
      74
     ],
     [
      "are",
      4,
      3.7,
      76
     ],
     [
      "one",
      8,
      8.0,
      79
     ]
    ],
    "chrome": "silver"
   },
   {
    "bar": 52,
    "part": "A",
    "style": "hook",
    "key": 0,
    "text": "Burn me in the fire,",
    "jp": "炎で燃やして",
    "words": [
     [
      "Burn",
      0
     ],
     [
      "me",
      2
     ],
     [
      "in",
      4
     ],
     [
      "the",
      6
     ],
     [
      "fire",
      8
     ]
    ],
    "notes": [
     [
      "burn",
      0,
      2,
      69
     ],
     [
      "me",
      2,
      2,
      72
     ],
     [
      "in",
      4,
      2,
      76
     ],
     [
      "the",
      6,
      2,
      74
     ],
     [
      "fire",
      8,
      7.3,
      76
     ]
    ],
    "chrome": "gold"
   },
   {
    "bar": 53,
    "part": "A",
    "style": "hook",
    "key": 0,
    "text": "turn my lead to gold,",
    "jp": "鉛を金に変えて",
    "words": [
     [
      "turn",
      0
     ],
     [
      "my",
      2
     ],
     [
      "lead",
      4
     ],
     [
      "to",
      6
     ],
     [
      "gold",
      8
     ]
    ],
    "notes": [
     [
      "turn",
      0,
      2,
      69
     ],
     [
      "my",
      2,
      2,
      72
     ],
     [
      "led",
      4,
      2,
      77
     ],
     [
      "too",
      6,
      2,
      76
     ],
     [
      "gold",
      8,
      7.3,
      72
     ]
    ],
    "chrome": "gold"
   },
   {
    "bar": 54,
    "part": "A",
    "style": "hook",
    "key": 0,
    "text": "Magnum Opus,",
    "jp": "マグヌム・オプス",
    "words": [
     [
      "Magnum",
      0
     ],
     [
      "Opus",
      4
     ]
    ],
    "notes": [
     [
      "mag",
      0,
      2,
      76
     ],
     [
      "num",
      2,
      2,
      74
     ],
     [
      "oh",
      4,
      5.6,
      79
     ],
     [
      "pus",
      10,
      2.6,
      76
     ]
    ],
    "chrome": "gold"
   },
   {
    "bar": 55,
    "part": "A",
    "style": "hook",
    "key": 0,
    "text": "I am whole!",
    "jp": "我は、全し。",
    "words": [
     [
      "I",
      0
     ],
     [
      "am",
      4
     ],
     [
      "whole",
      8
     ]
    ],
    "notes": [
     [
      "I",
      0,
      3.7,
      74
     ],
     [
      "am",
      4,
      3.7,
      76
     ],
     [
      "whole",
      8,
      8.0,
      79
     ]
    ],
    "chrome": "gold"
   },
   {
    "bar": 56,
    "part": "B",
    "style": "hook",
    "key": 0,
    "text": "Black into the silver,",
    "jp": "黒は銀へ、",
    "words": [
     [
      "Black",
      0
     ],
     [
      "into",
      2
     ],
     [
      "the",
      6
     ],
     [
      "silver",
      8
     ]
    ],
    "notes": [
     [
      "black",
      0,
      2,
      69
     ],
     [
      "in",
      2,
      2,
      72
     ],
     [
      "too",
      4,
      2,
      76
     ],
     [
      "the",
      6,
      2,
      74
     ],
     [
      "sil",
      8,
      4,
      76
     ],
     [
      "ver",
      12,
      3.3,
      74
     ]
    ],
    "chrome": "gold"
   },
   {
    "bar": 57,
    "part": "B",
    "style": "hook",
    "key": 0,
    "text": "silver into sun,",
    "jp": "銀は太陽へ、",
    "words": [
     [
      "silver",
      0
     ],
     [
      "into",
      4
     ],
     [
      "sun",
      8
     ]
    ],
    "notes": [
     [
      "sil",
      0,
      2,
      69
     ],
     [
      "ver",
      2,
      2,
      72
     ],
     [
      "in",
      4,
      2,
      77
     ],
     [
      "too",
      6,
      2,
      76
     ],
     [
      "sun",
      8,
      7.3,
      72
     ]
    ],
    "chrome": "gold"
   },
   {
    "bar": 58,
    "part": "B",
    "style": "hook",
    "key": 0,
    "text": "Magnum Opus,",
    "jp": "マグヌム・オプス",
    "words": [
     [
      "Magnum",
      0
     ],
     [
      "Opus",
      4
     ]
    ],
    "notes": [
     [
      "mag",
      0,
      2,
      76
     ],
     [
      "num",
      2,
      2,
      74
     ],
     [
      "oh",
      4,
      5.6,
      79
     ],
     [
      "pus",
      10,
      2.6,
      76
     ]
    ],
    "chrome": "gold"
   },
   {
    "bar": 59,
    "part": "B",
    "style": "hook",
    "key": 0,
    "text": "two are one!",
    "jp": "二つは一つ！",
    "words": [
     [
      "two",
      0
     ],
     [
      "are",
      4
     ],
     [
      "one",
      8
     ]
    ],
    "notes": [
     [
      "two",
      0,
      3.7,
      74
     ],
     [
      "are",
      4,
      3.7,
      76
     ],
     [
      "one",
      8,
      8.0,
      79
     ]
    ],
    "chrome": "gold"
   },
   {
    "bar": 80,
    "part": "A",
    "style": "hook",
    "key": 2,
    "text": "Burn me in the fire,",
    "jp": "炎で燃やして",
    "words": [
     [
      "Burn",
      0
     ],
     [
      "me",
      2
     ],
     [
      "in",
      4
     ],
     [
      "the",
      6
     ],
     [
      "fire",
      8
     ]
    ],
    "notes": [
     [
      "burn",
      0,
      2,
      71
     ],
     [
      "me",
      2,
      2,
      74
     ],
     [
      "in",
      4,
      2,
      78
     ],
     [
      "the",
      6,
      2,
      76
     ],
     [
      "fire",
      8,
      7.3,
      78
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 81,
    "part": "A",
    "style": "hook",
    "key": 2,
    "text": "turn my lead to gold,",
    "jp": "鉛を金に変えて",
    "words": [
     [
      "turn",
      0
     ],
     [
      "my",
      2
     ],
     [
      "lead",
      4
     ],
     [
      "to",
      6
     ],
     [
      "gold",
      8
     ]
    ],
    "notes": [
     [
      "turn",
      0,
      2,
      71
     ],
     [
      "my",
      2,
      2,
      74
     ],
     [
      "led",
      4,
      2,
      79
     ],
     [
      "too",
      6,
      2,
      78
     ],
     [
      "gold",
      8,
      7.3,
      74
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 82,
    "part": "A",
    "style": "hook",
    "key": 2,
    "text": "Magnum Opus,",
    "jp": "マグヌム・オプス",
    "words": [
     [
      "Magnum",
      0
     ],
     [
      "Opus",
      4
     ]
    ],
    "notes": [
     [
      "mag",
      0,
      2,
      78
     ],
     [
      "num",
      2,
      2,
      76
     ],
     [
      "oh",
      4,
      5.6,
      81
     ],
     [
      "pus",
      10,
      2.6,
      78
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 83,
    "part": "A",
    "style": "hook",
    "key": 2,
    "text": "I am whole!",
    "jp": "我は、全し。",
    "words": [
     [
      "I",
      0
     ],
     [
      "am",
      4
     ],
     [
      "whole",
      8
     ]
    ],
    "notes": [
     [
      "I",
      0,
      3.7,
      76
     ],
     [
      "am",
      4,
      3.7,
      78
     ],
     [
      "whole",
      8,
      8.0,
      81
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 84,
    "part": "B",
    "style": "hook",
    "key": 2,
    "text": "Black into the silver,",
    "jp": "黒は銀へ、",
    "words": [
     [
      "Black",
      0
     ],
     [
      "into",
      2
     ],
     [
      "the",
      6
     ],
     [
      "silver",
      8
     ]
    ],
    "notes": [
     [
      "black",
      0,
      2,
      71
     ],
     [
      "in",
      2,
      2,
      74
     ],
     [
      "too",
      4,
      2,
      78
     ],
     [
      "the",
      6,
      2,
      76
     ],
     [
      "sil",
      8,
      4,
      78
     ],
     [
      "ver",
      12,
      3.3,
      76
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 85,
    "part": "B",
    "style": "hook",
    "key": 2,
    "text": "silver into sun,",
    "jp": "銀は太陽へ、",
    "words": [
     [
      "silver",
      0
     ],
     [
      "into",
      4
     ],
     [
      "sun",
      8
     ]
    ],
    "notes": [
     [
      "sil",
      0,
      2,
      71
     ],
     [
      "ver",
      2,
      2,
      74
     ],
     [
      "in",
      4,
      2,
      79
     ],
     [
      "too",
      6,
      2,
      78
     ],
     [
      "sun",
      8,
      7.3,
      74
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 86,
    "part": "B",
    "style": "hook",
    "key": 2,
    "text": "Magnum Opus,",
    "jp": "マグヌム・オプス",
    "words": [
     [
      "Magnum",
      0
     ],
     [
      "Opus",
      4
     ]
    ],
    "notes": [
     [
      "mag",
      0,
      2,
      78
     ],
     [
      "num",
      2,
      2,
      76
     ],
     [
      "oh",
      4,
      5.6,
      81
     ],
     [
      "pus",
      10,
      2.6,
      78
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 87,
    "part": "B",
    "style": "hook",
    "key": 2,
    "text": "two are one!",
    "jp": "二つは一つ！",
    "words": [
     [
      "two",
      0
     ],
     [
      "are",
      4
     ],
     [
      "one",
      8
     ]
    ],
    "notes": [
     [
      "two",
      0,
      3.7,
      76
     ],
     [
      "are",
      4,
      3.7,
      78
     ],
     [
      "one",
      8,
      8.0,
      81
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 92,
    "part": "A",
    "style": "hook",
    "key": 2,
    "text": "Burn me in the fire,",
    "jp": "炎で燃やして",
    "words": [
     [
      "Burn",
      0
     ],
     [
      "me",
      2
     ],
     [
      "in",
      4
     ],
     [
      "the",
      6
     ],
     [
      "fire",
      8
     ]
    ],
    "notes": [
     [
      "burn",
      0,
      2,
      71
     ],
     [
      "me",
      2,
      2,
      74
     ],
     [
      "in",
      4,
      2,
      78
     ],
     [
      "the",
      6,
      2,
      76
     ],
     [
      "fire",
      8,
      7.3,
      78
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 93,
    "part": "A",
    "style": "hook",
    "key": 2,
    "text": "turn my lead to gold,",
    "jp": "鉛を金に変えて",
    "words": [
     [
      "turn",
      0
     ],
     [
      "my",
      2
     ],
     [
      "lead",
      4
     ],
     [
      "to",
      6
     ],
     [
      "gold",
      8
     ]
    ],
    "notes": [
     [
      "turn",
      0,
      2,
      71
     ],
     [
      "my",
      2,
      2,
      74
     ],
     [
      "led",
      4,
      2,
      79
     ],
     [
      "too",
      6,
      2,
      78
     ],
     [
      "gold",
      8,
      7.3,
      74
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 94,
    "part": "A",
    "style": "hook",
    "key": 2,
    "text": "Magnum Opus,",
    "jp": "マグヌム・オプス",
    "words": [
     [
      "Magnum",
      0
     ],
     [
      "Opus",
      4
     ]
    ],
    "notes": [
     [
      "mag",
      0,
      2,
      78
     ],
     [
      "num",
      2,
      2,
      76
     ],
     [
      "oh",
      4,
      5.6,
      81
     ],
     [
      "pus",
      10,
      2.6,
      78
     ]
    ],
    "chrome": "rainbow"
   },
   {
    "bar": 95,
    "part": "A",
    "style": "hook",
    "key": 2,
    "text": "I am whole!",
    "jp": "我は、全し。",
    "words": [
     [
      "I",
      0
     ],
     [
      "am",
      4
     ],
     [
      "whole",
      8
     ]
    ],
    "notes": [
     [
      "I",
      0,
      3.7,
      76
     ],
     [
      "am",
      4,
      3.7,
      78
     ],
     [
      "whole",
      8,
      16.0,
      81
     ]
    ],
    "chrome": "rainbow"
   }
  ],
  "sung": [
   {
    "bar": 0,
    "part": "cold",
    "style": "ghost",
    "key": 0,
    "text": "Burn me in the fire,",
    "jp": "炎で燃やして",
    "words": [
     [
      "Burn",
      0
     ],
     [
      "me",
      2
     ],
     [
      "in",
      4
     ],
     [
      "the",
      6
     ],
     [
      "fire",
      8
     ]
    ],
    "notes": [
     [
      "burn",
      0,
      2,
      69
     ],
     [
      "me",
      2,
      2,
      72
     ],
     [
      "in",
      4,
      2,
      76
     ],
     [
      "the",
      6,
      2,
      74
     ],
     [
      "fire",
      8,
      7.3,
      76
     ]
    ]
   },
   {
    "bar": 1,
    "part": "cold",
    "style": "ghost",
    "key": 0,
    "text": "turn my lead to gold,",
    "jp": "鉛を金に変えて",
    "words": [
     [
      "turn",
      0
     ],
     [
      "my",
      2
     ],
     [
      "lead",
      4
     ],
     [
      "to",
      6
     ],
     [
      "gold",
      8
     ]
    ],
    "notes": [
     [
      "turn",
      0,
      2,
      69
     ],
     [
      "my",
      2,
      2,
      72
     ],
     [
      "led",
      4,
      2,
      77
     ],
     [
      "too",
      6,
      2,
      76
     ],
     [
      "gold",
      8,
      7.3,
      72
     ]
    ]
   },
   {
    "bar": 2,
    "part": "cold",
    "style": "ghost",
    "key": 0,
    "text": "Magnum Opus,",
    "jp": "マグヌム・オプス",
    "words": [
     [
      "Magnum",
      0
     ],
     [
      "Opus",
      4
     ]
    ],
    "notes": [
     [
      "mag",
      0,
      2,
      76
     ],
     [
      "num",
      2,
      2,
      74
     ],
     [
      "oh",
      4,
      5.6,
      79
     ],
     [
      "pus",
      10,
      2.6,
      76
     ]
    ]
   },
   {
    "bar": 3,
    "part": "cold",
    "style": "ghost",
    "key": 0,
    "text": "I am—",
    "jp": "我は――",
    "words": [
     [
      "I",
      0
     ],
     [
      "am",
      4
     ]
    ],
    "notes": [
     [
      "I",
      0,
      3.7,
      74
     ],
     [
      "am",
      4,
      3.7,
      76
     ]
    ]
   },
   {
    "bar": 24,
    "part": "pre",
    "style": "pre",
    "key": 0,
    "text": "Melt me down, make me new,",
    "jp": "溶かして、作り直して、",
    "words": [
     [
      "Melt",
      0
     ],
     [
      "me",
      2
     ],
     [
      "down",
      4
     ],
     [
      "make",
      8
     ],
     [
      "me",
      10
     ],
     [
      "new",
      12
     ]
    ],
    "notes": [
     [
      "melt",
      0,
      2,
      69
     ],
     [
      "me",
      2,
      2,
      69
     ],
     [
      "down",
      4,
      3.5,
      74
     ],
     [
      "make",
      8,
      2,
      72
     ],
     [
      "me",
      10,
      2,
      74
     ],
     [
      "new",
      12,
      3.5,
      77
     ]
    ]
   },
   {
    "bar": 25,
    "part": "pre",
    "style": "pre",
    "key": 0,
    "text": "light me up, see me through,",
    "jp": "照らして、導いて、",
    "words": [
     [
      "light",
      0
     ],
     [
      "me",
      2
     ],
     [
      "up",
      4
     ],
     [
      "see",
      8
     ],
     [
      "me",
      10
     ],
     [
      "through",
      12
     ]
    ],
    "notes": [
     [
      "light",
      0,
      2,
      72
     ],
     [
      "me",
      2,
      2,
      72
     ],
     [
      "up",
      4,
      3.5,
      77
     ],
     [
      "see",
      8,
      2,
      76
     ],
     [
      "me",
      10,
      2,
      77
     ],
     [
      "through",
      12,
      3.5,
      79
     ]
    ]
   },
   {
    "bar": 26,
    "part": "pre",
    "style": "pre",
    "key": 0,
    "text": "everything I am",
    "jp": "私のすべてを、",
    "words": [
     [
      "everything",
      0
     ],
     [
      "I",
      6
     ],
     [
      "am",
      8
     ]
    ],
    "notes": [
     [
      "ev",
      0,
      2,
      74
     ],
     [
      "ree",
      2,
      2,
      74
     ],
     [
      "thing",
      4,
      2,
      74
     ],
     [
      "I",
      6,
      2,
      76
     ],
     [
      "am",
      8,
      7.5,
      77
     ]
    ]
   },
   {
    "bar": 27,
    "part": "pre",
    "style": "pre",
    "key": 0,
    "text": "I give to you!",
    "jp": "あなたに捧げる！",
    "words": [
     [
      "I",
      0
     ],
     [
      "give",
      2
     ],
     [
      "to",
      4
     ],
     [
      "you",
      6
     ]
    ],
    "notes": [
     [
      "I",
      0,
      2,
      71
     ],
     [
      "give",
      2,
      2,
      74
     ],
     [
      "too",
      4,
      2,
      76
     ],
     [
      "you",
      6,
      2,
      80
     ]
    ]
   },
   {
    "bar": 48,
    "part": "pre",
    "style": "pre",
    "key": 0,
    "text": "Melt me down, make me new,",
    "jp": "溶かして、作り直して、",
    "words": [
     [
      "Melt",
      0
     ],
     [
      "me",
      2
     ],
     [
      "down",
      4
     ],
     [
      "make",
      8
     ],
     [
      "me",
      10
     ],
     [
      "new",
      12
     ]
    ],
    "notes": [
     [
      "melt",
      0,
      2,
      69
     ],
     [
      "me",
      2,
      2,
      69
     ],
     [
      "down",
      4,
      3.5,
      74
     ],
     [
      "make",
      8,
      2,
      72
     ],
     [
      "me",
      10,
      2,
      74
     ],
     [
      "new",
      12,
      3.5,
      77
     ]
    ]
   },
   {
    "bar": 49,
    "part": "pre",
    "style": "pre",
    "key": 0,
    "text": "light me up, see me through,",
    "jp": "照らして、導いて、",
    "words": [
     [
      "light",
      0
     ],
     [
      "me",
      2
     ],
     [
      "up",
      4
     ],
     [
      "see",
      8
     ],
     [
      "me",
      10
     ],
     [
      "through",
      12
     ]
    ],
    "notes": [
     [
      "light",
      0,
      2,
      72
     ],
     [
      "me",
      2,
      2,
      72
     ],
     [
      "up",
      4,
      3.5,
      77
     ],
     [
      "see",
      8,
      2,
      76
     ],
     [
      "me",
      10,
      2,
      77
     ],
     [
      "through",
      12,
      3.5,
      79
     ]
    ]
   },
   {
    "bar": 50,
    "part": "pre",
    "style": "pre",
    "key": 0,
    "text": "everything I am",
    "jp": "私のすべてを、",
    "words": [
     [
      "everything",
      0
     ],
     [
      "I",
      6
     ],
     [
      "am",
      8
     ]
    ],
    "notes": [
     [
      "ev",
      0,
      2,
      74
     ],
     [
      "ree",
      2,
      2,
      74
     ],
     [
      "thing",
      4,
      2,
      74
     ],
     [
      "I",
      6,
      2,
      76
     ],
     [
      "am",
      8,
      7.5,
      77
     ]
    ]
   },
   {
    "bar": 51,
    "part": "pre",
    "style": "pre",
    "key": 0,
    "text": "I give to you!",
    "jp": "あなたに捧げる！",
    "words": [
     [
      "I",
      0
     ],
     [
      "give",
      2
     ],
     [
      "to",
      4
     ],
     [
      "you",
      6
     ]
    ],
    "notes": [
     [
      "I",
      0,
      2,
      71
     ],
     [
      "give",
      2,
      2,
      74
     ],
     [
      "too",
      4,
      2,
      76
     ],
     [
      "you",
      6,
      2,
      80
     ]
    ]
   },
   {
    "bar": 65,
    "part": "bridge",
    "style": "bridge",
    "key": 0,
    "text": "Hold the lantern high,",
    "jp": "ランタンを高く掲げて、",
    "words": [
     [
      "Hold",
      0
     ],
     [
      "the",
      3
     ],
     [
      "lantern",
      4
     ],
     [
      "high",
      8
     ]
    ],
    "notes": [
     [
      "hold",
      0,
      3,
      74
     ],
     [
      "the",
      3,
      1,
      71
     ],
     [
      "lan",
      4,
      3,
      74
     ],
     [
      "tern",
      7,
      1,
      76
     ],
     [
      "high",
      8,
      7,
      79
     ]
    ]
   },
   {
    "bar": 66,
    "part": "bridge",
    "style": "bridge",
    "key": 0,
    "text": "old man of the mountain,",
    "jp": "山の老賢者よ、",
    "words": [
     [
      "old",
      0
     ],
     [
      "man",
      3
     ],
     [
      "of",
      6
     ],
     [
      "the",
      8
     ],
     [
      "mountain",
      10
     ]
    ],
    "notes": [
     [
      "old",
      0,
      3,
      71
     ],
     [
      "man",
      3,
      3,
      71
     ],
     [
      "of",
      6,
      2,
      67
     ],
     [
      "the",
      8,
      2,
      69
     ],
     [
      "mown",
      10,
      3,
      71
     ],
     [
      "tin",
      13,
      3,
      67
     ]
    ]
   },
   {
    "bar": 67,
    "part": "bridge",
    "style": "bridge",
    "key": 0,
    "text": "all the stars that fell",
    "jp": "落ちた星はみな",
    "words": [
     [
      "all",
      0
     ],
     [
      "the",
      3
     ],
     [
      "stars",
      4
     ],
     [
      "that",
      8
     ],
     [
      "fell",
      10
     ]
    ],
    "notes": [
     [
      "all",
      0,
      3,
      72
     ],
     [
      "the",
      3,
      1,
      71
     ],
     [
      "stars",
      4,
      4,
      72
     ],
     [
      "that",
      8,
      2,
      74
     ],
     [
      "fell",
      10,
      6,
      76
     ]
    ]
   },
   {
    "bar": 68,
    "part": "bridge",
    "style": "bridge",
    "key": 0,
    "text": "are burning in the stone.",
    "jp": "石の中で燃えている。",
    "words": [
     [
      "are",
      0
     ],
     [
      "burning",
      2
     ],
     [
      "in",
      6
     ],
     [
      "the",
      8
     ],
     [
      "stone",
      10
     ]
    ],
    "notes": [
     [
      "are",
      0,
      2,
      77
     ],
     [
      "bur",
      2,
      2,
      76
     ],
     [
      "ning",
      4,
      2,
      74
     ],
     [
      "in",
      6,
      2,
      72
     ],
     [
      "the",
      8,
      2,
      72
     ],
     [
      "stone",
      10,
      6,
      69
     ]
    ]
   },
   {
    "bar": 72,
    "part": "metal",
    "style": "metal",
    "key": 0,
    "text": "lead",
    "jp": "鉛",
    "words": [
     [
      "lead",
      8
     ]
    ],
    "notes": [
     [
      "led",
      8,
      6,
      69
     ]
    ]
   },
   {
    "bar": 73,
    "part": "metal",
    "style": "metal",
    "key": 0,
    "text": "tin",
    "jp": "錫",
    "words": [
     [
      "tin",
      8
     ]
    ],
    "notes": [
     [
      "tin",
      8,
      6,
      71
     ]
    ]
   },
   {
    "bar": 74,
    "part": "metal",
    "style": "metal",
    "key": 0,
    "text": "iron",
    "jp": "鉄",
    "words": [
     [
      "iron",
      8
     ]
    ],
    "notes": [
     [
      "i",
      8,
      2,
      72
     ],
     [
      "ron",
      10,
      4,
      72
     ]
    ]
   },
   {
    "bar": 75,
    "part": "metal",
    "style": "metal",
    "key": 0,
    "text": "copper",
    "jp": "銅",
    "words": [
     [
      "copper",
      8
     ]
    ],
    "notes": [
     [
      "cop",
      8,
      2,
      74
     ],
     [
      "per",
      10,
      4,
      74
     ]
    ]
   },
   {
    "bar": 76,
    "part": "metal",
    "style": "metal",
    "key": 0,
    "text": "quicksilver",
    "jp": "水銀",
    "words": [
     [
      "quicksilver",
      8
     ]
    ],
    "notes": [
     [
      "quick",
      8,
      2,
      76
     ],
     [
      "sil",
      10,
      2,
      76
     ],
     [
      "ver",
      12,
      3,
      76
     ]
    ]
   },
   {
    "bar": 77,
    "part": "metal",
    "style": "metal",
    "key": 0,
    "text": "silver",
    "jp": "銀",
    "words": [
     [
      "silver",
      8
     ]
    ],
    "notes": [
     [
      "sil",
      8,
      2,
      77
     ],
     [
      "ver",
      10,
      4,
      77
     ]
    ]
   },
   {
    "bar": 78,
    "part": "metal",
    "style": "metal",
    "key": 0,
    "text": "GOLD!",
    "jp": "金！",
    "words": [
     [
      "GOLD",
      8
     ]
    ],
    "notes": [
     [
      "gold",
      8,
      16,
      80
     ]
    ]
   },
   {
    "bar": 102,
    "part": "coda",
    "style": "coda",
    "key": 0,
    "text": "I am",
    "jp": "我は、",
    "words": [
     [
      "I",
      0
     ],
     [
      "am",
      8
     ]
    ],
    "notes": [
     [
      "I",
      0,
      4,
      73
     ],
     [
      "am",
      8,
      4,
      71
     ]
    ]
   },
   {
    "bar": 103,
    "part": "coda",
    "style": "coda",
    "key": 0,
    "text": "whole.",
    "jp": "全し。",
    "words": [
     [
      "whole",
      0
     ]
    ],
    "notes": [
     [
      "whole",
      0,
      12,
      69
     ]
    ]
   }
  ],
  "spoken": [
   {
    "bar": 69,
    "voice": "hermit",
    "text": "Look outside: you dream.",
    "jp": "外を見る者は、夢を見る。",
    "words": [
     [
      "Look",
      0
     ],
     [
      "outside",
      2
     ],
     [
      "you",
      8
     ],
     [
      "dream",
      10
     ]
    ]
   },
   {
    "bar": 70,
    "voice": "hermit",
    "text": "Look inside: you wake.",
    "jp": "内を見る者は、目覚める。",
    "words": [
     [
      "Look",
      0
     ],
     [
      "inside",
      2
     ],
     [
      "you",
      8
     ],
     [
      "wake",
      10
     ]
    ]
   }
  ],
  "chops": [
   {
    "bar": 10,
    "text": "Magnum Opus",
    "syllables": [
     [
      "mag",
      0
     ],
     [
      "num",
      2
     ],
     [
      "oh",
      4
     ],
     [
      "pus",
      10
     ]
    ],
    "src": "hook A line 3, vocoded"
   },
   {
    "bar": 14,
    "text": "Magnum Opus",
    "syllables": [
     [
      "mag",
      0
     ],
     [
      "num",
      2
     ],
     [
      "oh",
      4
     ],
     [
      "pus",
      10
     ]
    ],
    "src": "hook A line 3, vocoded"
   },
   {
    "bar": 38,
    "text": "Magnum Opus",
    "syllables": [
     [
      "mag",
      0
     ],
     [
      "num",
      2
     ],
     [
      "oh",
      4
     ],
     [
      "pus",
      10
     ]
    ],
    "src": "hook A line 3, vocoded"
   },
   {
    "bar": 62,
    "text": "Magnum Opus",
    "syllables": [
     [
      "mag",
      0
     ],
     [
      "num",
      2
     ],
     [
      "oh",
      4
     ],
     [
      "pus",
      10
     ]
    ],
    "src": "hook A line 3, vocoded"
   },
   {
    "bar": 39,
    "step": 8,
    "text": "whole!",
    "syllables": [
     [
      "whole",
      8
     ]
    ],
    "src": "hook A 'whole', vocoded, 1/8 ping-pong"
   },
   {
    "bar": 63,
    "step": 8,
    "text": "whole!",
    "syllables": [
     [
      "whole",
      8
     ]
    ],
    "src": "hook A 'whole', vocoded, 1/8 ping-pong"
   }
  ]
 },
 "fx": [
  {
   "type": "shake",
   "beat": 16,
   "amount": 0.006,
   "decay": 0.3
  },
  {
   "type": "impact",
   "beat": 32,
   "duration": 0.06,
   "polarity": -1
  },
  {
   "type": "shake",
   "beat": 32,
   "amount": 0.012,
   "decay": 0.35
  },
  {
   "type": "impact",
   "beat": 94,
   "duration": 0.06,
   "polarity": -1
  },
  {
   "type": "shake",
   "beat": 94,
   "amount": 0.01,
   "decay": 0.35
  },
  {
   "type": "flash",
   "beat": 112,
   "color": [
    1.0,
    1.0,
    1.0
   ],
   "amount": 0.8,
   "decay": 0.12
  },
  {
   "type": "shake",
   "beat": 112,
   "amount": 0.01,
   "decay": 0.35
  },
  {
   "type": "flash",
   "beat": 208,
   "color": [
    1.0,
    0.8,
    0.25
   ],
   "amount": 0.55,
   "decay": 0.25
  },
  {
   "type": "shake",
   "beat": 208,
   "amount": 0.01,
   "decay": 0.35
  },
  {
   "type": "flash",
   "beat": 316,
   "color": [
    0.85,
    0.8,
    1.0
   ],
   "amount": 0.3,
   "decay": 0.08,
   "reduced": 0
  },
  {
   "type": "shake",
   "beat": 316,
   "amount": 0.012,
   "decay": 0.3
  },
  {
   "type": "impact",
   "beat": 320,
   "duration": 0.06,
   "polarity": -1
  },
  {
   "type": "shake",
   "beat": 320,
   "amount": 0.006,
   "decay": 0.3
  },
  {
   "type": "impact",
   "beat": 328,
   "duration": 0.07,
   "polarity": 1
  },
  {
   "type": "shake",
   "beat": 328,
   "amount": 0.006,
   "decay": 0.3
  },
  {
   "type": "impact",
   "beat": 352,
   "duration": 0.06,
   "polarity": -1
  },
  {
   "type": "shake",
   "beat": 352,
   "amount": 0.015,
   "decay": 0.4
  },
  {
   "type": "flash",
   "beat": 368,
   "color": [
    1.0,
    0.8,
    0.35
   ],
   "amount": 0.35,
   "decay": 0.15
  },
  {
   "type": "shake",
   "beat": 368,
   "amount": 0.01,
   "decay": 0.35
  },
  {
   "type": "shake",
   "beat": 384,
   "amount": 0.006,
   "decay": 0.25
  },
  {
   "type": "flash",
   "beat": 400,
   "color": [
    1.0,
    0.8,
    0.45
   ],
   "amount": 0.11,
   "decay": 0.12
  },
  {
   "type": "shake",
   "beat": 400,
   "amount": 0.022,
   "decay": 0.6
  }
 ],
 "warning": {
  "flashFrom": 32,
  "strobeFrom": 32,
  "strongest": [
   [
    94,
    96
   ],
   [
    110,
    114
   ],
   [
    314,
    322
   ],
   [
    326,
    330
   ],
   [
    380,
    386
   ],
   [
    398,
    402
   ]
  ]
 },
 "overlayWindows": [
  {
   "what": "SOLVE ET COAGULA motto, bottom centre",
   "fromBeat": 1,
   "toBeat": 7
  },
  {
   "what": "ghost hook lyrics (cold open)",
   "fromBeat": 0,
   "toBeat": 14
  },
  {
   "what": "NIGREDO full-screen insert (black ground; 30 s design)",
   "fromBeat": 16,
   "toBeat": 18
  },
  {
   "what": "HUD: cartouche, bar counter, sequencer, TC (hidden under inserts, eyecatch, wheel, viewfinder)",
   "fromBeat": 18,
   "toBeat": 384
  },
  {
   "what": "trump rail ARCANA n/22 (left edge)",
   "fromBeat": 0,
   "toBeat": 384
  },
  {
   "what": "anime OP title card: MAGNUM OPUS / マグヌム・オプス / 完全版 · THE FULL OPUS",
   "fromBeat": 32,
   "toBeat": 38
  },
  {
   "what": "chop stencils MAG · NUM · O · PUS",
   "fromBeat": 40,
   "toBeat": 44
  },
  {
   "what": "chop stencils MAG · NUM · O · PUS",
   "fromBeat": 56,
   "toBeat": 60
  },
  {
   "what": "episode card 第一話 仮面 · EPISODE I · THE PERSONA",
   "fromBeat": 64,
   "toBeat": 67
  },
  {
   "what": "rap subtitles, verse 1 (violet accent)",
   "fromBeat": 64,
   "toBeat": 96
  },
  {
   "what": "character caption 影 THE SHADOW",
   "fromBeat": 94,
   "toBeat": 100
  },
  {
   "what": "pre-chorus lift lyrics",
   "fromBeat": 96,
   "toBeat": 110
  },
  {
   "what": "ALBEDO full-screen insert (ultramarine)",
   "fromBeat": 110,
   "toBeat": 112
  },
  {
   "what": "hook karaoke, chorus 1 (silver chrome)",
   "fromBeat": 112,
   "toBeat": 144
  },
  {
   "what": "chop stencils MAG · NUM · O · PUS",
   "fromBeat": 152,
   "toBeat": 156
  },
  {
   "what": "chop stencil WHOLE!",
   "fromBeat": 158,
   "toBeat": 160
  },
  {
   "what": "episode card 第二話 鏡 · EPISODE II · THE MIRROR",
   "fromBeat": 160,
   "toBeat": 163
  },
  {
   "what": "rap subtitles, verse 2 (ice accent)",
   "fromBeat": 160,
   "toBeat": 192
  },
  {
   "what": "character caption アニマ THE ANIMA",
   "fromBeat": 172,
   "toBeat": 178
  },
  {
   "what": "pre-chorus lift lyrics",
   "fromBeat": 192,
   "toBeat": 206
  },
  {
   "what": "CITRINITAS full-screen insert (ochre)",
   "fromBeat": 206,
   "toBeat": 208
  },
  {
   "what": "hook karaoke, chorus 2 (gold chrome)",
   "fromBeat": 208,
   "toBeat": 240
  },
  {
   "what": "wheel of trumps (scene dimmed under it)",
   "fromBeat": 240,
   "toBeat": 254
  },
  {
   "what": "chop stencils MAG · NUM · O · PUS",
   "fromBeat": 248,
   "toBeat": 252
  },
  {
   "what": "chop stencil WHOLE!",
   "fromBeat": 254,
   "toBeat": 256
  },
  {
   "what": "EYECATCH full-screen card (XII flips at 64.3; iris-in reveal 64.4-65.1)",
   "fromBeat": 256,
   "toBeat": 260
  },
  {
   "what": "episode card 第三話 隠者 · EPISODE III · THE HERMIT",
   "fromBeat": 260,
   "toBeat": 263
  },
  {
   "what": "bridge lyrics, tategaki",
   "fromBeat": 260,
   "toBeat": 276
  },
  {
   "what": "character caption 隠者 THE HERMIT",
   "fromBeat": 264,
   "toBeat": 270
  },
  {
   "what": "the Hermit's words (lantern serif)",
   "fromBeat": 276,
   "toBeat": 284
  },
  {
   "what": "whisper subtitle",
   "fromBeat": 284,
   "toBeat": 288
  },
  {
   "what": "変身 slam + episode card 第四話 変身 · EPISODE IV · HENSHIN",
   "fromBeat": 288,
   "toBeat": 291
  },
  {
   "what": "roll-call cards + kundalini and metal gauge",
   "fromBeat": 288,
   "toBeat": 318
  },
  {
   "what": "RUBEDO full-screen insert (white; 30 s design + 'KEY +2')",
   "fromBeat": 318,
   "toBeat": 320
  },
  {
   "what": "hook karaoke, final chorus (rainbow chrome)",
   "fromBeat": 320,
   "toBeat": 352
  },
  {
   "what": "character caption 両性具有 THE REBIS",
   "fromBeat": 350,
   "toBeat": 356
  },
  {
   "what": "hype rap",
   "fromBeat": 352,
   "toBeat": 368
  },
  {
   "what": "hook karaoke, final hook (rainbow chrome; WHOLE! grows and shatters at 384)",
   "fromBeat": 368,
   "toBeat": 385
  },
  {
   "what": "character caption 自己 THE SELF",
   "fromBeat": 380,
   "toBeat": 386
  },
  {
   "what": "viewfinder + slate + ED credits (the cast is all THE FOOL)",
   "fromBeat": 384,
   "toBeat": 400
  },
  {
   "what": "coda card 0 · LE MAT · THE FOOL · 愚者",
   "fromBeat": 400,
   "toBeat": 404
  },
  {
   "what": "coda lyric 'I am whole.' (moon karaoke, gold)",
   "fromBeat": 408,
   "toBeat": 414
  },
  {
   "what": "final MAGNUM OPUS logo + つづく, then fade to black (must stay the last window)",
   "fromBeat": 404,
   "toBeat": 416
  }
 ],
 "cues": [
  {
   "shot": "nigredo.eye",
   "bars": [
    0,
    4
   ],
   "params": {
    "zoom": 0.9,
    "triangle": 1.2,
    "speed": 0.6,
    "dive": 1,
    "pace": 0.6
   },
   "note": "On black, the great eye's contour lines draw out under 'Burn'; the lids part slowly across the a cappella hook; the iris fibres ignite; the Providence triangle and its glory draw in; on 3.3 ('I am—', cut) the push becomes the dive into the pupil, in the silence."
  },
  {
   "shot": "nigredo.sun",
   "bars": [
    4,
    8
   ],
   "params": {
    "rise": 4,
    "snap": 1,
    "ravens": 1,
    "zoom": 0.95,
    "grade": {
     "hue": -10,
     "saturation": 1.15,
     "gain": [
      0.95,
      0.88,
      1.15
     ]
    },
    "frame": {
     "roll": [
      [
       0,
       0
      ],
      [
       1,
       -3
      ]
     ]
    }
   },
   "note": "Under the NIGREDO insert (4.1-4.3) the sol niger fades up over the black mercury sea, ravens spiralling. From 5.1 the colossal Shadow rises behind the disc, one lurch per beat (about 10). From 7.3 the fast push into its face; its eyes snap open on the accented clap 7.4."
  },
  {
   "shot": "club.stage",
   "bars": [
    8,
    10
   ],
   "params": {
    "palette": "nigredo",
    "ball": "blacksun",
    "dancer": "shadow",
    "pattern": "fan",
    "crowd": 1
   },
   "note": "Impact frame, then THE CLUB OF THE BLACK SUN: frontal, symmetric, a three-step neon dais (a small ziggurat), the black-sun mirror ball with an ember corona overhead, the Shadow dancing on the dais, violet and acid-green laser fans from seven floor emitters, raised hands in the foreground. The anime OP title card slams over the lower third."
  },
  {
   "shot": "club.stage",
   "bars": [
    10,
    11
   ],
   "params": {
    "palette": "nigredo",
    "ball": "blacksun",
    "dancer": "shadow",
    "pattern": "scissor",
    "crowd": 1,
    "frame": {
     "zoom": 1.35,
     "offset": [
      0,
      0.18
     ],
     "roll": -5
    }
   },
   "note": "Low dutch angle on the dancer; two banks of beams scissor through the haze."
  },
  {
   "shot": "nigredo.sun",
   "bars": [
    11,
    12
   ],
   "params": {
    "shadow": 0,
    "ravens": 1,
    "zoom": 2.4,
    "y": 0.1,
    "speed": 2.0,
    "grade": {
     "hue": -10,
     "saturation": 1.15,
     "gain": [
      0.95,
      0.88,
      1.15
     ]
    },
    "offsetBeats": 1.5
   },
   "note": "Close on the black sun: its ink corona flares on every kick, ravens cutting across fast."
  },
  {
   "shot": "rubedo.wedding",
   "bars": [
    12,
    13
   ],
   "params": {
    "palette": "nigredo",
    "metal": "lead",
    "fuse": false,
    "floor": "ivory",
    "orbit": 35,
    "height": 0.3,
    "pump": 0.15
   },
   "note": "The 1996 CD cover in Nigredo: the chrome vessel over a black-and-white checkerboard under a violet sky; the stone at its heart is LEAD; Sol and Luna circle it and nothing turns."
  },
  {
   "shot": "club.stage",
   "bars": [
    13,
    14
   ],
   "params": {
    "palette": "nigredo",
    "ball": "blacksun",
    "dancer": "shadow",
    "pattern": "sheet",
    "crowd": 1,
    "frame": {
     "zoom": 1.1,
     "offset": [
      0,
      -0.1
     ]
    }
   },
   "note": "A laser sheet slices the haze just above the crowd's hands; the dancer above it."
  },
  {
   "shot": "persona.masks",
   "bars": [
    14,
    15
   ],
   "params": {
    "cam": "hall",
    "palette": "nigredo",
    "eyes": 1,
    "figure": 0,
    "zoom": 1.25
   },
   "note": "First glimpse of THE HALL OF MASKS: tiers of white porcelain masks to a glowing vanishing point; on the chop's 'O-' (14.2) every eye-hole lights white at once."
  },
  {
   "shot": "club.stage",
   "bars": [
    15,
    16
   ],
   "params": {
    "palette": "nigredo",
    "ball": "blacksun",
    "dancer": "shadow",
    "pattern": "tunnel",
    "crowd": 1,
    "frame": {
     "zoom": [
      [
       0,
       1.0
      ],
      [
       1,
       2.2
      ]
     ],
     "offset": [
      [
       0,
       [
        0,
        0
       ]
      ],
      [
       1,
       [
        0,
        0.3
       ]
      ]
     ]
    }
   },
   "note": "Every beam converges on the dancer; push into the Shadow dancer's face."
  },
  {
   "shot": "persona.masks",
   "bars": [
    16,
    18
   ],
   "params": {
    "cam": "hall",
    "palette": "nigredo",
    "crown": 6
   },
   "note": "THE HALL OF MASKS: a stepped amphitheatre of identical porcelain masks; at the front centre the luminous figure wears a gilded chrome mask. On 'lead' (17.3) a dull crown of lead with Saturn's sign settles on its head."
  },
  {
   "shot": "persona.masks",
   "bars": [
    18,
    20
   ],
   "params": {
    "cam": "close",
    "palette": "nigredo",
    "eyes": 2,
    "crack": 6
   },
   "note": "Close on the chrome mask, the hall reflected and curved in it. On 'crowd' (18.3) every reflected mask lights its eye-holes: they all look at you. On 'said' (19.3) a hairline crack runs from the brow."
  },
  {
   "shot": "nigredo.sun",
   "bars": [
    20,
    21
   ],
   "params": {
    "shadow": 0,
    "ravens": 0.6,
    "zoom": 1.5,
    "y": -0.15,
    "roll": -0.2,
    "grade": {
     "hue": -10,
     "saturation": 1.15,
     "gain": [
      0.95,
      0.88,
      1.15
     ]
    },
    "offsetBeats": 1.5
   },
   "note": "Low at the waterline: the black sun and its reflection, the sky contours rippling. 'Black sun rising'."
  },
  {
   "shot": "nigredo.sun",
   "bars": [
    21,
    22
   ],
   "params": {
    "shadow": 0,
    "ravens": 1,
    "zoom": 2.2,
    "x": 0.3,
    "y": 0.18,
    "speed": 0.5,
    "grade": {
     "hue": -10,
     "saturation": 1.15,
     "gain": [
      0.95,
      0.88,
      1.15
     ]
    },
    "offsetBeats": 1.5
   },
   "note": "Slow-motion close-up of the circling ravens; one crosses the disc on 'sky' (21.3)."
  },
  {
   "shot": "persona.masks",
   "bars": [
    22,
    24
   ],
   "params": {
    "cam": "close",
    "palette": "nigredo",
    "crack": -1,
    "crackPerKick": 1,
    "shatter": "word:eye"
   },
   "note": "Push into the cracked mask; each kick drives the crack further. On 'eye' (23.3) a dark impact frame, then the mask bursts into ~36 Voronoi shards in anime slow motion; behind it the Shadow's ink face, whose red-ringed eyes snap open."
  },
  {
   "shot": "club.stage",
   "bars": [
    24,
    25
   ],
   "params": {
    "palette": "nigredo",
    "ball": "blacksun",
    "dancer": "shadow",
    "pattern": "fan",
    "melt": [
     1,
     3
    ],
    "tone": [
     0,
     0.5
    ]
   },
   "note": "The Shadow dancer melts into a pool of mercury on 'down' (24.2); the lasers fade from violet to silver."
  },
  {
   "shot": "albedo.a1",
   "bars": [
    25,
    26
   ],
   "params": {
    "palette": "violet",
    "ink": 0,
    "moon": 0.4,
    "zoom": 1.1
   },
   "note": "'light me up': the luminous body draws itself line by line in a violet lattice; no ink, the chakras unlit."
  },
  {
   "shot": "nigredo.eye",
   "bars": [
    26,
    27.5
   ],
   "params": {
    "offsetBeats": 2,
    "triangle": 0,
    "zoom": 2.4,
    "pulse": 1.5,
    "speed": 3,
    "dive": 1,
    "grade": {
     "saturation": [
      [
       0,
       1
      ],
      [
       1,
       0.4
      ]
     ],
     "gain": [
      [
       0,
       [
        1,
        1,
        1
       ]
      ],
      [
       1,
       [
        0.9,
        0.96,
        1.15
       ]
      ]
     ]
    }
   },
   "note": "Extreme close-up of the iris, already open; its rings spin with the roll; violet greys to silver; on 'you' (27.2) the pupil swallows the frame."
  },
  {
   "shot": "citrinitas.c5",
   "bars": [
    27.5,
    28
   ],
   "params": {
    "palette": "violet",
    "speed": 0.4
   },
   "note": "Hidden under the ALBEDO insert."
  },
  {
   "shot": "albedo.a1",
   "bars": [
    28,
    29
   ],
   "params": {
    "palette": "silver",
    "burn": 1,
    "mandorla": 1,
    "zoom": 0.95
   },
   "note": "White flash: the luminous body, its left half still ink; through 'fire' the ink burns off from the feet up and rises as embers."
  },
  {
   "shot": "rubedo.wedding",
   "bars": [
    29,
    30
   ],
   "params": {
    "palette": "violet",
    "metal": "silver",
    "floor": "ivory",
    "fuse": false,
    "orbit": -40,
    "pump": 0.15
   },
   "note": "The chrome vessel over a blue-white checkerboard; the leaden stone turns to SILVER from 'lead' to 'gold'."
  },
  {
   "shot": "rubedo.tunnel",
   "bars": [
    30,
    31
   ],
   "params": {
    "palette": "violet",
    "lasers": "blue",
    "walls": "figures",
    "speed": 0.8,
    "roll": -10,
    "beams": 4,
    "laser": 0.6
   },
   "note": "A silver tunnel of rings of luminous figures; four ice-blue lasers from the vanishing point."
  },
  {
   "shot": "club.stage",
   "bars": [
    31,
    32
   ],
   "params": {
    "palette": "albedo",
    "ball": "moon",
    "dancer": "luminous",
    "pattern": "fan360",
    "crowd": 1,
    "armsUpAt": [
     2
    ]
   },
   "note": "The club in silver: the moon mirror ball, the luminous dancer; on 'whole' (31.3) arms up and the ball's beams fan out through 360 deg."
  },
  {
   "shot": "persona.masks",
   "bars": [
    32,
    33
   ],
   "params": {
    "cam": "hall",
    "palette": "nigredo",
    "transmute": 2
   },
   "note": "Back in the hall of masks; on 'silver' (32.3) a silver front sweeps from the front tier to the vanishing point: every mask melts into a pearl face of light."
  },
  {
   "shot": "club.stage",
   "bars": [
    33,
    34
   ],
   "params": {
    "palette": "albedo",
    "ball": {
     "from": "moon",
     "to": "sun",
     "at": 2
    },
    "dancer": "luminous",
    "pattern": "fan",
    "crowd": 1
   },
   "note": "On 'sun' (33.3) the moon ball turns into a gold sun ball and every laser turns gold."
  },
  {
   "shot": "net.being",
   "bars": [
    34,
    35
   ],
   "params": {
    "mode": "crowd",
    "palette": "silver",
    "jumpAt": [
     1
    ],
    "wave": 1
   },
   "note": "First sight of THE NET OF BEING: endless rows of luminous silver figures on a glowing lattice, threads of light from crown to crown; everyone jumps on 'O-' (34.2)."
  },
  {
   "shot": "albedo.a3",
   "bars": [
    35,
    36
   ],
   "params": {
    "palette": "silver",
    "spread": 1.0,
    "pillars": 1
   },
   "note": "'two are one!': the Shadow and the Anima walk back into the mirror between the pillars and merge on the cut (36.1)."
  },
  {
   "shot": "albedo.a3b",
   "bars": [
    36,
    37
   ],
   "params": {
    "moon": 1.6,
    "zoom": 0.9
   },
   "note": "The merge shock; the corridor blows away; the floor stacks into the 7-step mountain; the Rebis is carried up under a huge moon."
  },
  {
   "shot": "club.stage",
   "bars": [
    37,
    38
   ],
   "params": {
    "palette": "albedo",
    "ball": "moon",
    "dancer": "luminous",
    "pattern": "chase",
    "crowd": 1
   },
   "note": "Wide club in silver: beams chase around the moon ball on 16ths; hands up on 2 and 4."
  },
  {
   "shot": "net.being",
   "bars": [
    38,
    39
   ],
   "params": {
    "mode": "crowd",
    "palette": "silver",
    "wave": 1,
    "jumpAt": [
     1
    ],
    "roll": 3
   },
   "note": "The silver crowd in a stadium wave; everyone jumps on the chop's 'O-' (38.2)."
  },
  {
   "shot": "club.stage",
   "bars": [
    39,
    40
   ],
   "params": {
    "palette": "albedo",
    "ball": "moon",
    "dancer": "luminous",
    "pattern": "tunnel",
    "frame": {
     "zoom": [
      [
       0,
       1.0
      ],
      [
       1,
       1.8
      ]
     ],
     "offset": [
      [
       0,
       [
        0,
        0
       ]
      ],
      [
       1,
       [
        0,
        0.2
       ]
      ]
     ]
    }
   },
   "note": "Beams converge; push in through the clap fill; the 'whole!' chop (39.3) lights the dancer."
  },
  {
   "shot": "nigredo.sun",
   "bars": [
    40,
    42
   ],
   "params": {
    "shadow": 0,
    "moon": 1,
    "ravens": 1,
    "zoom": 0.85,
    "frame": {
     "offset": [
      [
       0,
       [
        0,
        0.25
       ]
      ],
      [
       1,
       [
        0,
        0
       ]
      ]
     ]
    }
   },
   "note": "The mercury sea of Nigredo again, now under a full white moon with a silver corona where the black sun stood; white doves where the ravens circled; the camera cranes down to the water."
  },
  {
   "shot": "persona.masks",
   "bars": [
    42,
    43
   ],
   "params": {
    "cam": "hall",
    "palette": "silver",
    "anima": 1,
    "eyes": 2
   },
   "note": "'look into the mirror': the hall of masks again, but every mask is HER face, pearl and crescent-crowned; on 'mirror' (42.3) all their pupils slide to the camera."
  },
  {
   "shot": "albedo.a2",
   "bars": [
    43,
    44
   ],
   "params": {
    "spread": 1.0,
    "pillars": 1,
    "frame": {
     "zoom": 1.7,
     "offset": [
      0.28,
      0.05
     ]
    }
   },
   "note": "'she is looking back at me': framed on the Anima between the pillars, crescent crown, hair lines, looking out."
  },
  {
   "shot": "albedo.a1",
   "bars": [
    44,
    45
   ],
   "params": {
    "frame": {
     "zoom": [
      [
       0,
       1.25
      ],
      [
       1,
       1.0
      ]
     ]
    },
    "grade": {
     "saturation": 0.6,
     "gain": [
      0.97,
      0.86,
      1.12
     ]
    }
   },
   "note": "'Shadow on the left': the 30 s A1, ink flooding the left half, the Shadow's eye opening on 'left', but the camera pulls back and the grade is lavender dusk."
  },
  {
   "shot": "albedo.a2",
   "bars": [
    45,
    46
   ],
   "params": {
    "spread": 1.2,
    "pillarX": 1.6,
    "frame": {
     "zoom": 1.1,
     "offset": [
      [
       0,
       [
        -0.15,
        0
       ]
      ],
      [
       1,
       [
        0.15,
        0
       ]
      ]
     ]
    }
   },
   "note": "'Anima on the right': the syzygy, wide, trucking from the Shadow to the Anima."
  },
  {
   "shot": "citrinitas.c1",
   "bars": [
    46,
    47
   ],
   "params": {
    "palette": "silver",
    "dawn": -1,
    "chakraCount": 0,
    "zoom": 0.9
   },
   "note": "'climb the Holy Mountain': THE HOLY MOUNTAIN BY MOONLIGHT, its gold turned to silver, the tower dark on the summit, the figure climbing a step per kick."
  },
  {
   "shot": "albedo.a4",
   "bars": [
    47,
    48
   ],
   "params": {
    "rays": 1.2,
    "grade": {
     "saturation": [
      [
       0,
       0.6
      ],
      [
       1,
       1.0
      ]
     ],
     "gain": [
      [
       0,
       [
        0.97,
        0.86,
        1.12
       ]
      ],
      [
       1,
       [
        1,
        1,
        1
       ]
      ]
     ]
    }
   },
   "note": "'to the Self, the light!': push into the third eye, the lines converge, white-gold light; it inhales on the last clap."
  },
  {
   "shot": "persona.masks",
   "bars": [
    48,
    49
   ],
   "params": {
    "cam": "rush",
    "palette": "silver"
   },
   "note": "'melt me down': rushing up the aisle of the silver hall, the tiers of Anima masks streaming past."
  },
  {
   "shot": "citrinitas.c2",
   "bars": [
    49,
    50
   ],
   "params": {
    "palette": "silver",
    "chakraCount": 0,
    "ribbons": 1.5,
    "cut": "a",
    "roll": 8
   },
   "note": "'light me up': THE SILVER HENSHIN foretold: the moon-white body, ribbons of light spiralling up, chakras unlit."
  },
  {
   "shot": "nigredo.eye",
   "bars": [
    50,
    51.5
   ],
   "params": {
    "offsetBeats": 2,
    "triangle": 0,
    "zoom": 2.6,
    "pulse": 1.5,
    "speed": 3,
    "dive": 1,
    "grade": {
     "saturation": [
      [
       0,
       0.4
      ],
      [
       1,
       1.1
      ]
     ],
     "gain": [
      [
       0,
       [
        0.9,
        0.96,
        1.15
       ]
      ],
      [
       1,
       [
        1.2,
        0.95,
        0.6
       ]
      ]
     ]
    }
   },
   "note": "The iris again, silver warming to gold; the dive on 'you' (51.2)."
  },
  {
   "shot": "citrinitas.c5",
   "bars": [
    51.5,
    52
   ],
   "params": {
    "palette": "gold",
    "speed": 0.4
   },
   "note": "Hidden under the CITRINITAS insert."
  },
  {
   "shot": "citrinitas.c1",
   "bars": [
    52,
    53
   ],
   "params": {
    "palette": "gold",
    "dawn": 1,
    "chakraCount": 0,
    "zoom": 0.8,
    "speed": 0.7
   },
   "note": "Gold flash: THE HOLY MOUNTAIN AT SUNRISE, wide, the XIX sun rising behind the tower, braziers burning on the terraces."
  },
  {
   "shot": "rubedo.wedding",
   "bars": [
    53,
    54
   ],
   "params": {
    "palette": "gold",
    "metal": "transmute",
    "from": "silver",
    "floor": "gold",
    "fuse": false,
    "orbit": 90,
    "height": 0.4,
    "pump": 0.15
   },
   "note": "The vessel over a gold checkerboard at dawn; the SILVER stone turns to GOLD from 'lead' to 'gold'."
  },
  {
   "shot": "rubedo.tunnel",
   "bars": [
    54,
    55
   ],
   "params": {
    "palette": "gold",
    "lasers": "gold",
    "walls": "mixed",
    "speed": 0.9,
    "roll": 12,
    "beams": 4,
    "laser": 0.6
   },
   "note": "A gold tunnel of figures and eyes, amber lasers."
  },
  {
   "shot": "citrinitas.c2",
   "bars": [
    55,
    56
   ],
   "params": {
    "palette": "gold",
    "chakraStart": 4,
    "chakraCount": 0,
    "cut": "a",
    "speed": 0.5,
    "roll": -8
   },
   "note": "'I am whole!': the gold henshin torso, the lower four chakras lit, a sunburst from the heart, ribbons spiralling."
  },
  {
   "shot": "club.stage",
   "bars": [
    56,
    57
   ],
   "params": {
    "palette": "citrinitas",
    "ball": "sun",
    "dancer": {
     "from": "shadow",
     "to": "luminous",
     "at": 2
    },
    "pattern": "fan",
    "crowd": 1
   },
   "note": "The gold club; the dancer flips from black silhouette to silver light on 'silver' (56.3)."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    57,
    58
   ],
   "params": {
    "cam": "low",
    "eclipseAt": 2
   },
   "note": "First sight of THE SEVEN THIEVES: an armillary orrery of chrome spheres in base metals, a masked face reflected in each; low over it the silver Moon passes in front of Sol's empty black socket and on 'sun' (57.3) a corona flares round it."
  },
  {
   "shot": "net.being",
   "bars": [
    58,
    59
   ],
   "params": {
    "mode": "crowd",
    "palette": "gold",
    "jumpAt": [
     1
    ]
   },
   "note": "The crowd in gold with flame auras; everyone jumps on 'O-' (58.2)."
  },
  {
   "shot": "rubedo.wedding",
   "bars": [
    59,
    60
   ],
   "params": {
    "palette": "gold",
    "metal": "gold",
    "floor": "gold",
    "fuse": 0.5,
    "orbit": 180,
    "dist": 0.75,
    "height": 0.8,
    "pump": 0.15
   },
   "note": "'two are one!': high and close from behind, Sol and Luna spiral in and fuse into the gold stone half a beat before the cut."
  },
  {
   "shot": "club.stage",
   "bars": [
    60,
    61
   ],
   "params": {
    "palette": "citrinitas",
    "ball": "sun",
    "dancer": "gold",
    "pattern": "chase",
    "crowd": 1,
    "grade": {
     "gain": 0.58
    }
   },
   "note": "The gold club, dimmed under the WHEEL OF TRUMPS overlay (0 THE FOOL at the top)."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    61,
    62
   ],
   "params": {
    "cam": "wide",
    "orbit": 20,
    "grade": {
     "gain": 0.58
    }
   },
   "note": "The orrery wide, dimmed: the seven base metals turning on their rings, each with its masked thief."
  },
  {
   "shot": "citrinitas.c1",
   "bars": [
    62,
    63
   ],
   "params": {
    "palette": "gold",
    "dawn": 1,
    "chakras": [
     -1,
     -1,
     -1,
     -1,
     -1,
     -1,
     -1
    ],
    "zoom": 0.7,
    "grade": {
     "gain": 0.58
    }
   },
   "note": "The whole Holy Mountain, every terrace lit, dimmed under the wheel."
  },
  {
   "shot": "club.stage",
   "bars": [
    63,
    64
   ],
   "params": {
    "palette": "citrinitas",
    "ball": "sun",
    "dancer": "gold",
    "pattern": "fan360",
    "crowd": 1
   },
   "note": "The wheel collapses into the sun ball; the beams fan out and freeze as the music stops on 63.4."
  },
  {
   "shot": "hermit.lantern",
   "bars": [
    64,
    65
   ],
   "params": {
    "mode": "wide"
   },
   "note": "Under the EYECATCH card; revealed by its iris-in at 64.4."
  },
  {
   "shot": "hermit.lantern",
   "bars": [
    65,
    68
   ],
   "params": {
    "mode": "wide",
    "liftAt": 2,
    "frame": {
     "zoom": [
      [
       0,
       1.0
      ],
      [
       1,
       1.5
      ]
     ],
     "offset": [
      [
       0,
       [
        0,
        0
       ]
      ],
      [
       1,
       [
        0.08,
        0.1
       ]
      ]
     ]
    }
   },
   "note": "Night on the Holy Mountain: THE HERMIT, a tall hooded cloak drawn in fine contour lines, a beard of luminous threads, a staff wound with a serpent; behind him the seven dark terraces and the tower with one lit window; slow falling sparks. He lifts the lantern on 'high' (65.3); the camera rises toward it over three bars."
  },
  {
   "shot": "hermit.lantern",
   "bars": [
    68,
    69
   ],
   "params": {
    "mode": "lantern"
   },
   "note": "Inside the lantern: a six-pointed star burning in a pear-shaped glass flask, a tiny luminous figure curled in its light (the homunculus in the Hermetic vessel); 'are burning in the stone'."
  },
  {
   "shot": "hermit.lantern",
   "bars": [
    69,
    71
   ],
   "params": {
    "mode": "close",
    "eyesAt": 6
   },
   "note": "Close on the hood: darkness, the beard of light. 'Look outside: you dream.' On 'wake' (70.3) two calm silver eyes open."
  },
  {
   "shot": "hermit.lantern",
   "bars": [
    71,
    72
   ],
   "params": {
    "mode": "tower",
    "storm": [
     0.2,
     1.0
    ]
   },
   "note": "Tilt up to the tower on the summit; storm clouds gather, lit from inside; the window burns brighter. 'Seven thieves, I want it back!'"
  },
  {
   "shot": "citrinitas.c1",
   "bars": [
    72,
    72.5
   ],
   "params": {
    "palette": "gold",
    "chakras": "score",
    "dawn": 1
   },
   "note": "'SATURN!': the Holy Mountain; the ROOT ignites red (sakuga burst) and the first terrace lights."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    72.5,
    73
   ],
   "params": {
    "focus": "saturn"
   },
   "note": "Close on Saturn's lead sphere, its masked thief reflected; on 'lead' (72.3) molten gold floods it from the top, the mask dissolves, its ring flares gold."
  },
  {
   "shot": "citrinitas.c1",
   "bars": [
    73,
    73.5
   ],
   "params": {
    "palette": "gold",
    "chakras": "score",
    "dawn": 1,
    "zoom": 1.3,
    "offsetBeats": 2
   },
   "note": "'JUPITER!': closer on the climbing figure; the SACRAL ignites orange."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    73.5,
    74
   ],
   "params": {
    "focus": "jupiter"
   },
   "note": "Close on Jupiter's tin sphere, its masked thief reflected; on 'tin' (73.3) molten gold floods it from the top, the mask dissolves, its ring flares gold."
  },
  {
   "shot": "citrinitas.c2",
   "bars": [
    74,
    74.5
   ],
   "params": {
    "palette": "gold",
    "chakras": "score",
    "cut": "a"
   },
   "note": "'MARS!': the torso; the SOLAR PLEXUS ignites yellow, ribbons spiral."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    74.5,
    75
   ],
   "params": {
    "focus": "mars"
   },
   "note": "Close on Mars's iron sphere, its masked thief reflected; on 'iron' (74.3) molten gold floods it from the top, the mask dissolves, its ring flares gold."
  },
  {
   "shot": "citrinitas.c2",
   "bars": [
    75,
    75.5
   ],
   "params": {
    "palette": "gold",
    "chakras": "score",
    "cut": "b"
   },
   "note": "'VENUS!': cut-in on the HEART igniting green."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    75.5,
    76
   ],
   "params": {
    "focus": "venus"
   },
   "note": "Close on Venus's copper sphere, its masked thief reflected; on 'copper' (75.3) molten gold floods it from the top, the mask dissolves, its ring flares gold."
  },
  {
   "shot": "citrinitas.c3a",
   "bars": [
    76,
    76.5
   ],
   "params": {
    "palette": "gold",
    "chakras": "score"
   },
   "note": "'MERCURY!': the manga triptych slides in; the THROAT ignites blue."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    76.5,
    77
   ],
   "params": {
    "focus": "mercury"
   },
   "note": "Close on Mercury's quicksilver sphere, its masked thief reflected; on 'quicksilver' (76.3) molten gold floods it from the top, the mask dissolves, its ring flares gold."
  },
  {
   "shot": "citrinitas.c3b",
   "bars": [
    77,
    77.5
   ],
   "params": {
    "palette": "gold",
    "chakras": "score"
   },
   "note": "'LUNA!': the eye strip; the THIRD EYE opens and ignites indigo."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    77.5,
    78
   ],
   "params": {
    "focus": "luna"
   },
   "note": "Close on Luna's silver sphere, its masked thief reflected; on 'silver' (77.3) molten gold floods it from the top, the mask dissolves, its ring flares gold."
  },
  {
   "shot": "citrinitas.c4",
   "bars": [
    78,
    78.5
   ],
   "params": {
    "palette": "gold",
    "chakras": "score",
    "push": false
   },
   "note": "'SOL!': arms raised; the CROWN ignites; the rainbow column; the lotus opens."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    78.5,
    79
   ],
   "params": {
    "focus": "all"
   },
   "note": "'GOLD!': all seven spheres gold, Sol's empty socket ignites into a sun with XIX rays, every ring blazes; a fast pull back from Sol to the whole orrery."
  },
  {
   "shot": "hermit.lantern",
   "bars": [
    79,
    79.5
   ],
   "params": {
    "mode": "strike",
    "strikeAt": 0
   },
   "note": "THE TOWER STRUCK: one lightning bolt splits the alchemist's tower; its domed crown is blown off and tumbles up; fire from the window; two tiny figures fall. The crown of the spine opens."
  },
  {
   "shot": "citrinitas.c5",
   "bars": [
    79.5,
    80
   ],
   "params": {
    "palette": "rose",
    "speed": 0.4
   },
   "note": "Rose-gold radiance under the RUBEDO insert."
  },
  {
   "shot": "rubedo.mandala",
   "bars": [
    80,
    81
   ],
   "params": {
    "palette": "crimson",
    "spin": 1.2,
    "seed": 7,
    "roll": -3
   },
   "note": "THE KEY-CHANGE DROP: the eclipse impact frames, then the crimson MANDALA OF THE SELF around the World dancer in her mandorla of fire."
  },
  {
   "shot": "rubedo.wedding",
   "bars": [
    81,
    82
   ],
   "params": {
    "palette": "crimson",
    "metal": "ruby",
    "floor": "crimson",
    "fuse": false,
    "orbit": -30
   },
   "note": "The vessel over the crimson checkerboard; the GOLD stone deepens to RUBY from 'lead' to 'gold': the red stone."
  },
  {
   "shot": "rubedo.tunnel",
   "bars": [
    82,
    83
   ],
   "params": {
    "palette": "crimson",
    "lasers": "rainbow",
    "walls": "mixed",
    "speed": 1.0,
    "roll": 15,
    "beams": 6,
    "laser": 0.8
   },
   "note": "The tunnel at the 30 s rate, lasers in all seven chakra colours."
  },
  {
   "shot": "net.being",
   "bars": [
    83,
    84
   ],
   "params": {
    "mode": "reveal",
    "palette": "gold",
    "armsUpAt": [
     2
    ]
   },
   "note": "THE NET OF BEING revealed: from one luminous figure filling the frame the camera pulls back into thousands, joined crown to crown by threads of light; on 'whole' (83.3) every arm rises into the World dancer's V, row after row to the horizon."
  },
  {
   "shot": "albedo.a2",
   "bars": [
    84,
    85
   ],
   "params": {
    "palette": "blood",
    "spread": 1.0,
    "pillars": 1,
    "zoom": 1.05
   },
   "note": "'Black into the silver': the Shadow and the Anima between the pillars, in ruby and gold."
  },
  {
   "shot": "orrery.thieves",
   "bars": [
    85,
    86
   ],
   "params": {
    "focus": "all",
    "cam": "wide",
    "alignAt": 2,
    "palette": "crimson"
   },
   "note": "'silver into sun': all seven metals gold; on 'sun' (85.3) the planets swing into one line behind the sun (the syzygy)."
  },
  {
   "shot": "rubedo.mandala",
   "bars": [
    86,
    87
   ],
   "params": {
    "palette": "gold",
    "spin": 1.5,
    "zoom": 0.85,
    "seed": 11
   },
   "note": "'Magnum Opus': the whole mandala in gold, spinning fast, seen wider than ever."
  },
  {
   "shot": "albedo.a3",
   "bars": [
    87,
    88
   ],
   "params": {
    "palette": "sun",
    "spread": 1.0,
    "pillars": 1
   },
   "note": "'two are one!': the king and the queen step into each other and merge into the Rebis on the cut (88.1)."
  },
  {
   "shot": "club.stage",
   "bars": [
    88,
    88.5
   ],
   "params": {
    "palette": "rubedo",
    "ball": "ruby",
    "dancer": "gold",
    "pattern": "fan360",
    "crowd": 1,
    "beams": 6
   },
   "note": "Impact; the club at full power: the ruby ball, the gold dancer, beams in all seven colours."
  },
  {
   "shot": "nigredo.eye",
   "bars": [
    88.5,
    89
   ],
   "params": {
    "gold": 1,
    "sun": 1,
    "triangle": 2,
    "zoom": 1.2,
    "offsetBeats": 2,
    "dive": 0
   },
   "note": "'king': the great eye in gold, a white-hot sun for a pupil, inside a blazing triangle."
  },
  {
   "shot": "club.stage",
   "bars": [
    89,
    89.5
   ],
   "params": {
    "palette": "rubedo",
    "ball": "ruby",
    "dancer": "gold",
    "pattern": "scissor",
    "crowd": 1,
    "frame": {
     "zoom": 1.4,
     "offset": [
      0,
      0.18
     ],
     "roll": 5
    },
    "beams": 6
   },
   "note": "Low dutch on the gold dancer."
  },
  {
   "shot": "nigredo.sun",
   "bars": [
    89.5,
    90
   ],
   "params": {
    "shadow": 0,
    "moon": 1,
    "gold": 1,
    "zoom": 2.0,
    "ravens": 1,
    "offsetBeats": 1.5
   },
   "note": "'queen': the full moon over the sea, now in crimson and gold, doves crossing."
  },
  {
   "shot": "rubedo.wedding",
   "bars": [
    90,
    91
   ],
   "params": {
    "palette": "crimson",
    "metal": "gold",
    "fuse": 0.5,
    "orbit": 60,
    "dist": 0.8
   },
   "note": "'married in the fire': Sol and Luna spiral in and fuse into the vessel at the cut."
  },
  {
   "shot": "net.being",
   "bars": [
    91,
    92
   ],
   "params": {
    "mode": "rise",
    "palette": "gold",
    "armsUpAt": [
     2
    ]
   },
   "note": "Rising through the net, layers of gold figures streaming down past the lens; arms up on 'sing' (91.3)."
  },
  {
   "shot": "rubedo.bloom",
   "bars": [
    92,
    93
   ],
   "params": {
    "palette": "crimson",
    "aurum": "front",
    "dive": "none",
    "spin": 1.3
   },
   "note": "Gold flash; the bloom: twelve magenta petals open behind the corona, the gold front runs out over the crimson."
  },
  {
   "shot": "albedo.a4",
   "bars": [
    93,
    94
   ],
   "params": {
    "palette": "sun",
    "light": 1.2,
    "rays": 1.5,
    "inhale": 0
   },
   "note": "'turn my lead to gold': the push into the third eye in gold; this time the light bursts fully and holds."
  },
  {
   "shot": "net.being",
   "bars": [
    94,
    95
   ],
   "params": {
    "mode": "fly",
    "palette": "gold",
    "split": 1
   },
   "note": "'Magnum Opus': flying through the net; the left half are ink Shadows with red eyes, the right half silver Animas, the centre column gold: every stage in one frame."
  },
  {
   "shot": "rubedo.bloom",
   "bars": [
    95,
    96
   ],
   "params": {
    "palette": "gold",
    "aurum": "gold",
    "dive": "heart"
   },
   "note": "'I am whole!': the gold bloom, then from 'whole' (95.3) the dive into the heart, ending on the heart iris. XXI is drawn: ARCANA 22/22."
  },
  {
   "shot": "zoomback.set",
   "bars": [
    96,
    100
   ],
   "params": {
    "freeze": 0.5,
    "layers": 31
   },
   "note": "'PULL BACK, CAMERA!': the frame freezes on the heart iris and greys; the HUD becomes a viewfinder; the pull back: the iris is the great eye (96.3), the eye is painted on card 0 LE MAT (97.1), the card is the hub of a wheel of the other 21 trumps on ultramarine velvet with four candles (98.1), the table stands on the summit of a plywood Holy Mountain set under studio lamps and a camera crane (99.1), and the whole set is the reflection in the iris of the great eye (99.3)."
  },
  {
   "shot": "coda.eye",
   "bars": [
    100,
    104
   ],
   "params": {
    "gold": 1,
    "ignite": 1,
    "blaze": 1,
    "close": 1,
    "low": 1,
    "spin": 0.1
   },
   "note": "The final hit on A major: out of the blazing iris the pull back to the whole great eye; its pupil ignites into a white-hot sun; it rises into the upper frame over the logo; a glint; she sings 'I am... whole.'; the lids meet at 103.3; black by 183.3 s."
  }
 ]
};
