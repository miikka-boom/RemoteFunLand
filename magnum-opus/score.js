// MAGNUM OPUS — the single source of truth for timing.
// Read by the page (window.SCORE) and by tools/magnum_opus_audio.py (everything after
// the first "=" up to the final ";" is plain JSON, so keep it that way: no comments
// inside the object, double quotes only).
//
// 136 BPM, 4/4, 17 bars = 68 beats = exactly 30.000 s. One beat = 0.441176 s,
// one bar = 1.764706 s, one 16th step = 0.110294 s.
// Patterns are one string per bar, 16 steps per bar: "x" hit, "X" accent,
// "r" two 32nd-note hits inside that step, "." rest.
window.SCORE = {
  "title": "Magnum Opus",
  "subtitle": "Rubedo Radio Edit",
  "titleJp": "マグヌム・オプス",
  "bpm": 136,
  "beatsPerBar": 4,
  "stepsPerBeat": 4,
  "bars": 17,
  "duration": 30.0,
  "key": "A minor; the very last chord is A major (lead turned to gold)",

  "sections": [
    { "id": "nigredo",    "bars": [0, 4],   "stage": "Nigredo",    "jp": "ニグレド",     "arcana": "XIII",  "card": "Death",     "cardJp": "死神", "theme": "the blackening: the eye opens, the black sun, meeting the Shadow" },
    { "id": "albedo",     "bars": [4, 8],   "stage": "Albedo",     "jp": "アルベド",     "arcana": "XVIII", "card": "The Moon",  "cardJp": "月",   "theme": "the whitening: the luminous body, the Anima, the mirror" },
    { "id": "citrinitas", "bars": [8, 12],  "stage": "Citrinitas", "jp": "キトリニタス", "arcana": "XIX",   "card": "The Sun",   "cardJp": "太陽", "theme": "the yellowing: the ascent of the Holy Mountain, seven chakras ignite" },
    { "id": "rubedo",     "bars": [12, 16], "stage": "Rubedo",     "jp": "ルベド",       "arcana": "XXI",   "card": "The World", "cardJp": "世界", "theme": "the reddening: coniunctio, the mandala of the Self, the drop" },
    { "id": "coda",       "bars": [16, 17], "stage": "Opus",       "jp": "オプス",       "arcana": "0",     "card": "The Fool",  "cardJp": "愚者", "theme": "the return: zoom back into the eye, the circle closes" }
  ],

  "chords": ["A5", "Am", "F", "G",   "Am", "F", "C", "G",   "F", "G", "Am", "E",   "Am", "F", "C", "G",   "A"],
  "energy": [0.08, 0.30, 0.38, 0.48,   0.66, 0.68, 0.70, 0.74,   0.72, 0.80, 0.90, 1.0,   1.0, 1.0, 1.0, 1.0,   0.85],

  "drums": {
    "kick": [
      "................", "x...x...x...x...", "x...x...x...x...", "x...x...x...x...",
      "X...x...x...x...", "x...x...x...x...", "x...x...x...x...", "x...x...x...x...",
      "X...x...x...x...", "x...x...x...x...", "x...x...x...x...", "x...x...........",
      "X...x...x...x...", "x...x...x...x...", "X...x...x...x...", "x...x...x...x...",
      "X..............."
    ],
    "clap": [
      "................", "................", "................", "............xxxX",
      "....x.......x...", "....x.......x...", "....x.......x...", "....x.......x.xX",
      "................", "................", "................", "................",
      "....x.......x...", "....x.......x...", "....x.......x...", "....x.......xxxX",
      "................"
    ],
    "roll": [
      "................", "................", "................", "................",
      "................", "................", "................", "................",
      "x...x...x...x...", "x.x.x.x.x.x.x.x.", "xxxxxxxxxxxxxxxx", "rrrrrrrr........",
      "................", "................", "................", "................",
      "................"
    ],
    "openHat": [
      "................", "................", "................", "..x...x...x...x.",
      "..x...x...x...x.", "..x...x...x...x.", "..x...x...x...x.", "..x...x...x...x.",
      "..x...x...x...x.", "..x...x...x...x.", "..x...x...x...x.", "................",
      "..x...x...x...x.", "..x...x...x...x.", "..x...x...x...x.", "..x...x...x...x.",
      "................"
    ],
    "closedHat": [
      "................", "................", "x.x.x.x.x.x.x.x.", "xxxxxxxxxxxxxxxx",
      "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx",
      "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "................",
      "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx",
      "................"
    ]
  },

  "hits": [
    { "type": "gong",       "beat": 0 },
    { "type": "orchHit",    "beat": 4,  "note": "low, dark" },
    { "type": "crash",      "beat": 16 },
    { "type": "subDrop",    "beat": 16 },
    { "type": "crash",      "beat": 32 },
    { "type": "crash",      "beat": 48 },
    { "type": "orchHit",    "beat": 48 },
    { "type": "subDrop",    "beat": 48 },
    { "type": "crash",      "beat": 56 },
    { "type": "crash",      "beat": 64 },
    { "type": "orchHit",    "beat": 64 },
    { "type": "gong",       "beat": 64 },
    { "type": "subDrop",    "beat": 64 }
  ],

  "sweeps": [
    { "type": "reverseCymbal", "fromBeat": 14, "toBeat": 16 },
    { "type": "riser",         "fromBeat": 12, "toBeat": 16 },
    { "type": "riser",         "fromBeat": 40, "toBeat": 46 },
    { "type": "reverseCymbal", "fromBeat": 46, "toBeat": 48 },
    { "type": "reverseCymbal", "fromBeat": 62, "toBeat": 64 }
  ],

  "gap": { "fromBeat": 46, "toBeat": 48, "note": "everything stops except the announcer shouting RUBEDO and the reverse cymbal" },

  "chakras": [
    { "name": "Muladhara",    "en": "root",       "color": [0.95, 0.10, 0.12], "beat": 32 },
    { "name": "Svadhisthana", "en": "sacral",     "color": [1.00, 0.45, 0.05], "beat": 34 },
    { "name": "Manipura",     "en": "solar",      "color": [1.00, 0.85, 0.10], "beat": 36 },
    { "name": "Anahata",      "en": "heart",      "color": [0.15, 0.90, 0.30], "beat": 38 },
    { "name": "Vishuddha",    "en": "throat",     "color": [0.10, 0.60, 1.00], "beat": 40 },
    { "name": "Ajna",         "en": "third eye",  "color": [0.35, 0.20, 1.00], "beat": 42 },
    { "name": "Sahasrara",    "en": "crown",      "color": [0.85, 0.40, 1.00], "beat": 44 }
  ],

  "vocals": {
    "announcer": [
      { "text": "Nigredo", "beat": 4,  "style": "deep, slow, huge reverb" },
      { "text": "Rubedo!", "beat": 46, "style": "shouted into the silent gap, long reverb tail into the drop" }
    ],
    "rap": [
      { "bar": 4, "text": "Shadow on the left,",     "jp": "左に、影。",       "words": [["Shadow", 0], ["on", 4], ["the", 6], ["left", 8]] },
      { "bar": 5, "text": "Anima on the right,",     "jp": "右に、アニマ。",   "words": [["Anima", 0], ["on", 4], ["the", 6], ["right", 8]] },
      { "bar": 6, "text": "climb the Holy Mountain", "jp": "聖なる山を登れ",   "words": [["climb", 0], ["the", 2], ["Holy", 4], ["Mountain", 8]] },
      { "bar": 7, "text": "to the Self, the light!", "jp": "自己へ、光へ！",   "words": [["to", 0], ["the", 2], ["Self", 4], ["the", 8], ["light", 10]] }
    ],
    "hook": [
      { "bar": 12, "text": "Burn me in the fire,", "jp": "炎で燃やして",     "words": [["Burn", 0], ["me", 2], ["in", 4], ["the", 6], ["fire", 8]] },
      { "bar": 13, "text": "turn my lead to gold,", "jp": "鉛を金に変えて", "words": [["turn", 0], ["my", 2], ["lead", 4], ["to", 6], ["gold", 8]] },
      { "bar": 14, "text": "Magnum Opus,",          "jp": "マグヌム・オプス", "words": [["Magnum", 0], ["Opus", 4]] },
      { "bar": 15, "text": "I am whole!",           "jp": "我は、全し。",     "words": [["I", 0], ["am", 4], ["whole", 8]] }
    ]
  },

  "fx": [
    { "type": "flash",  "beat": 16,    "color": [1.0, 1.0, 1.0],  "amount": 0.85, "decay": 0.45 },
    { "type": "shake",  "beat": 16,    "amount": 0.010, "decay": 0.35 },
    { "type": "flash",  "beat": 32,    "color": [1.0, 0.80, 0.25], "amount": 0.55, "decay": 0.40 },
    { "type": "impact", "beat": 48,    "duration": 0.10 },
    { "type": "flash",  "beat": 48.25, "color": [1.0, 0.25, 0.15], "amount": 0.45, "decay": 0.35 },
    { "type": "shake",  "beat": 48,    "amount": 0.030, "decay": 0.55 },
    { "type": "impact", "beat": 56,    "duration": 0.07 },
    { "type": "shake",  "beat": 56,    "amount": 0.018, "decay": 0.40 },
    { "type": "flash",  "beat": 64,    "color": [1.0, 0.95, 0.85], "amount": 0.90, "decay": 0.55 },
    { "type": "shake",  "beat": 64,    "amount": 0.022, "decay": 0.60 }
  ],

  "overlayWindows": [
    { "what": "NIGREDO full-screen title insert (black ground)", "fromBeat": 4,  "toBeat": 6 },
    { "what": "ALBEDO title (card over the scene)",               "fromBeat": 16, "toBeat": 18 },
    { "what": "rap subtitles",                                    "fromBeat": 16, "toBeat": 32 },
    { "what": "CITRINITAS title (band over the scene)",           "fromBeat": 32, "toBeat": 34 },
    { "what": "RUBEDO full-screen title insert in the gap",       "fromBeat": 46, "toBeat": 48 },
    { "what": "hook lyrics, giant chrome karaoke",                "fromBeat": 48, "toBeat": 64 },
    { "what": "final MAGNUM OPUS logo, then fade to black",       "fromBeat": 65, "toBeat": 68 }
  ]
};
