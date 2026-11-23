// NO SURVIVORS: Keep Them Dancing. The single source of truth for timing, read by the page
// (window.SCORE) and by the soundtrack synth (tools/no_survivors_audio.py). Everything after the first
// "=" up to the final ";" is plain JSON: no comments inside the object, double quotes only.
//
// 150 BPM, 4/4, 112 bars = 179.2 s (+0.8 s room tone: the audio is 180.0 s). One beat 0.4 s, one bar
// 1.6 s, one 16th step 0.1 s. Bars count from 0; "bars": [a, b] are half-open. A "beat" in hits/gaps is
// a global beat index (bar * 4 + beat in bar). Steps in words/notes are 16ths from the line's bar.
// Per-bar arrays (energy, chords, bass, each drum lane) have 112 entries. The keys are described in
// SPEC.md (scratchpad) and in the composer's notes under "notes".
window.SCORE = {
 "title": "Keep Them Dancing",
 "band": "No Survivors",
 "venue": "The Orpheum",
 "bpm": 150,
 "beatsPerBar": 4,
 "stepsPerBeat": 4,
 "bars": 112,
 "duration": 180.0,
 "end": 179.2,
 "key": "E minor; final chorus F# minor (+2) from bar 92",
 "sections": [
  {
   "id": "coldopen",
   "bars": [
    0,
    8
   ],
   "part": "prologue",
   "role": "cold open: rain, radio, Lou; Tiny counts in on bar 7",
   "label": "Cold open"
  },
  {
   "id": "intro",
   "bars": [
    8,
    16
   ],
   "part": "prologue",
   "role": "main riff x2, title smash; van crash on bar 15",
   "label": "Intro"
  },
  {
   "id": "verse1a",
   "bars": [
    16,
    24
   ],
   "part": "streets",
   "role": "verse riff, instrumental; gang shouts each name",
   "label": "Intros"
  },
  {
   "id": "verse1b",
   "bars": [
    24,
    32
   ],
   "part": "streets",
   "role": "verse 1 vocals; the Groupie",
   "label": "Verse 1"
  },
  {
   "id": "pre1",
   "bars": [
    32,
    36
   ],
   "part": "streets",
   "role": "pre-chorus build: here they come",
   "label": "Pre-chorus"
  },
  {
   "id": "chorus1",
   "bars": [
    36,
    44
   ],
   "part": "streets",
   "role": "chorus 1: the horde",
   "label": "Chorus"
  },
  {
   "id": "post1",
   "bars": [
    44,
    48
   ],
   "part": "streets",
   "role": "main riff; run for the red door",
   "label": "Riff"
  },
  {
   "id": "saferoom",
   "bars": [
    48,
    56
   ],
   "part": "saferoom",
   "role": "breakdown: clean arpeggios, heartbeat, pounding door",
   "label": "Safe room"
  },
  {
   "id": "verse2",
   "bars": [
    56,
    64
   ],
   "part": "orpheum",
   "role": "verse 2 vocals (the mystery verse); arrive at the Orpheum",
   "label": "Verse 2"
  },
  {
   "id": "chorus2",
   "bars": [
    64,
    72
   ],
   "part": "orpheum",
   "role": "chorus 2 on stage; tape stop at the end",
   "label": "Chorus"
  },
  {
   "id": "blackout",
   "bars": [
    72,
    74
   ],
   "part": "orpheum",
   "role": "silence: power cut",
   "label": "Blackout"
  },
  {
   "id": "crescendo",
   "bars": [
    74,
    82
   ],
   "part": "orpheum",
   "role": "drums + chant + generator pulls; the Roadie",
   "label": "Crescendo"
  },
  {
   "id": "solo",
   "bars": [
    82,
    90
   ],
   "part": "orpheum",
   "role": "guitar solo, full spectacle",
   "label": "Solo"
  },
  {
   "id": "lift",
   "bars": [
    90,
    92
   ],
   "part": "encore",
   "role": "build and modulation to F# minor; the chopper",
   "label": "Lift"
  },
  {
   "id": "chorus3",
   "bars": [
    92,
    104
   ],
   "part": "encore",
   "role": "final chorus +2 and the one-more-song call and response",
   "label": "Final chorus"
  },
  {
   "id": "ending",
   "bars": [
    104,
    106
   ],
   "part": "encore",
   "role": "big rock ending: roll, final hit, cut",
   "label": "Ending"
  },
  {
   "id": "coda",
   "bars": [
    106,
    112
   ],
   "part": "coda",
   "role": "thermal camera: applause, Lou, music box",
   "label": "Coda"
  }
 ],
 "chapters": [
  {
   "type": "chapter",
   "bar": 24,
   "beat": 0,
   "beats": 7,
   "n": "PART ONE",
   "title": "THE STREETS"
  },
  {
   "type": "chapter",
   "bar": 48,
   "beat": 0,
   "beats": 7,
   "n": "PART TWO",
   "title": "THE SAFE ROOM"
  },
  {
   "type": "chapter",
   "bar": 56,
   "beat": 0,
   "beats": 7,
   "n": "PART THREE",
   "title": "THE ORPHEUM"
  },
  {
   "type": "chapter",
   "bar": 90,
   "beat": 0,
   "beats": 7,
   "n": "PART FOUR",
   "title": "THE ENCORE"
  }
 ],
 "energy": [
  0.12,
  0.12,
  0.12,
  0.12,
  0.12,
  0.12,
  0.12,
  0.12,
  0.8,
  0.8,
  0.8,
  0.8,
  0.8,
  0.8,
  0.8,
  0.8,
  0.6,
  0.6,
  0.6,
  0.6,
  0.6,
  0.6,
  0.6,
  0.6,
  0.65,
  0.65,
  0.65,
  0.65,
  0.65,
  0.65,
  0.65,
  0.65,
  0.75,
  0.75,
  0.75,
  0.75,
  0.92,
  0.92,
  0.92,
  0.92,
  0.92,
  0.92,
  0.92,
  0.92,
  0.8,
  0.8,
  0.8,
  0.8,
  0.25,
  0.25,
  0.25,
  0.25,
  0.25,
  0.25,
  0.25,
  0.25,
  0.68,
  0.68,
  0.68,
  0.68,
  0.68,
  0.68,
  0.68,
  0.68,
  0.95,
  0.95,
  0.95,
  0.95,
  0.95,
  0.95,
  0.95,
  0.95,
  0.0,
  0.0,
  0.35,
  0.43,
  0.51,
  0.59,
  0.67,
  0.75,
  0.83,
  0.91,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  1.0,
  0.85,
  0.85,
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
  0.9,
  0.9,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08,
  0.08
 ],
 "chords": null,
 "drums": null,
 "bass": null,
 "riffs": null,
 "arrangement": null,
 "vocals": {
  "lines": [
   {
    "id": "g1",
    "bar": 16,
    "part": "names",
    "singer": "gang",
    "zone": "auto",
    "text": "VEX!",
    "words": [
     [
      "VEX!",
      0
     ]
    ],
    "notes": null
   },
   {
    "id": "g2",
    "bar": 18,
    "part": "names",
    "singer": "gang",
    "zone": "auto",
    "text": "GRANNY!",
    "words": [
     [
      "GRANNY!",
      0
     ]
    ],
    "notes": null
   },
   {
    "id": "g3",
    "bar": 20,
    "part": "names",
    "singer": "gang",
    "zone": "auto",
    "text": "TINY!",
    "words": [
     [
      "TINY!",
      0
     ]
    ],
    "notes": null
   },
   {
    "id": "g4",
    "bar": 22,
    "part": "names",
    "singer": "gang",
    "zone": "auto",
    "text": "NOODLE!",
    "words": [
     [
      "NOODLE!",
      0
     ]
    ],
    "notes": null
   },
   {
    "id": "v1a",
    "bar": 24,
    "part": "verse1",
    "singer": "vex",
    "zone": "auto",
    "text": "Three A.M. on the county line",
    "words": [
     [
      "Three",
      0
     ],
     [
      "A.M.",
      2
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
      "county",
      8
     ],
     [
      "line",
      10
     ]
    ],
    "notes": null
   },
   {
    "id": "v1b",
    "bar": 26,
    "part": "verse1",
    "singer": "vex",
    "zone": "auto",
    "text": "Lou on the radio, right on time",
    "words": [
     [
      "Lou",
      0
     ],
     [
      "on",
      2
     ],
     [
      "the",
      4
     ],
     [
      "radio,",
      6
     ],
     [
      "right",
      8
     ],
     [
      "on",
      10
     ],
     [
      "time",
      12
     ]
    ],
    "notes": null
   },
   {
    "id": "v1c",
    "bar": 28,
    "part": "verse1",
    "singer": "vex",
    "zone": "auto",
    "text": "Something's crying in the alley, son",
    "words": [
     [
      "Something's",
      0
     ],
     [
      "crying",
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
      "alley,",
      8
     ],
     [
      "son",
      10
     ]
    ],
    "notes": null
   },
   {
    "id": "v1d",
    "bar": 30,
    "part": "verse1",
    "singer": "vex",
    "zone": "auto",
    "text": "Don't look, don't touch, don't stop, just RUN!",
    "words": [
     [
      "Don't",
      0
     ],
     [
      "look,",
      2
     ],
     [
      "don't",
      4
     ],
     [
      "touch,",
      6
     ],
     [
      "don't",
      8
     ],
     [
      "stop,",
      10
     ],
     [
      "just",
      12
     ],
     [
      "RUN!",
      14
     ]
    ],
    "notes": null
   },
   {
    "id": "p1a",
    "bar": 32,
    "part": "pre",
    "singer": "vex",
    "zone": "auto",
    "text": "Here they come, here they come,",
    "words": [
     [
      "Here",
      0
     ],
     [
      "they",
      2
     ],
     [
      "come,",
      4
     ],
     [
      "here",
      6
     ],
     [
      "they",
      8
     ],
     [
      "come,",
      10
     ]
    ],
    "notes": null
   },
   {
    "id": "p1b",
    "bar": 34,
    "part": "pre",
    "singer": "vex",
    "zone": "auto",
    "text": "a thousand feet and a single drum!",
    "words": [
     [
      "a",
      0
     ],
     [
      "thousand",
      2
     ],
     [
      "feet",
      4
     ],
     [
      "and",
      6
     ],
     [
      "a",
      8
     ],
     [
      "single",
      10
     ],
     [
      "drum!",
      12
     ]
    ],
    "notes": null
   },
   {
    "id": "c1a",
    "bar": 36,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "KEEP THEM DANCING!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "THEM",
      2
     ],
     [
      "DANCING!",
      4
     ]
    ],
    "notes": null
   },
   {
    "id": "c1b",
    "bar": 38,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "KEEP 'EM ON THE BEAT!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "'EM",
      2
     ],
     [
      "ON",
      4
     ],
     [
      "THE",
      6
     ],
     [
      "BEAT!",
      8
     ]
    ],
    "notes": null
   },
   {
    "id": "c1c",
    "bar": 40,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "IF THE MUSIC STOPS,",
    "words": [
     [
      "IF",
      0
     ],
     [
      "THE",
      2
     ],
     [
      "MUSIC",
      4
     ],
     [
      "STOPS,",
      6
     ]
    ],
    "notes": null
   },
   {
    "id": "c1d",
    "bar": 42,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "WE'RE SOMETHING TO EAT!",
    "words": [
     [
      "WE'RE",
      0
     ],
     [
      "SOMETHING",
      2
     ],
     [
      "TO",
      4
     ],
     [
      "EAT!",
      6
     ]
    ],
    "notes": null
   },
   {
    "id": "v2a",
    "bar": 56,
    "part": "verse2",
    "singer": "vex",
    "zone": "auto",
    "text": "Same old stage and the same old crowd,",
    "words": [
     [
      "Same",
      0
     ],
     [
      "old",
      2
     ],
     [
      "stage",
      4
     ],
     [
      "and",
      6
     ],
     [
      "the",
      8
     ],
     [
      "same",
      10
     ],
     [
      "old",
      12
     ],
     [
      "crowd,",
      14
     ]
    ],
    "notes": null
   },
   {
    "id": "v2b",
    "bar": 58,
    "part": "verse2",
    "singer": "vex",
    "zone": "auto",
    "text": "same stopped clock, and it's three right now,",
    "words": [
     [
      "same",
      0
     ],
     [
      "stopped",
      2
     ],
     [
      "clock,",
      4
     ],
     [
      "and",
      6
     ],
     [
      "it's",
      8
     ],
     [
      "three",
      10
     ],
     [
      "right",
      12
     ],
     [
      "now,",
      14
     ]
    ],
    "notes": null
   },
   {
    "id": "v2c",
    "bar": 60,
    "part": "verse2",
    "singer": "vex",
    "zone": "auto",
    "text": "found my name on the safe-room wall,",
    "words": [
     [
      "found",
      0
     ],
     [
      "my",
      2
     ],
     [
      "name",
      4
     ],
     [
      "on",
      6
     ],
     [
      "the",
      8
     ],
     [
      "safe-room",
      10
     ],
     [
      "wall,",
      12
     ]
    ],
    "notes": null
   },
   {
    "id": "v2d",
    "bar": 62,
    "part": "verse2",
    "singer": "vex",
    "zone": "auto",
    "text": "don't remember writing it at all.",
    "words": [
     [
      "don't",
      0
     ],
     [
      "remember",
      2
     ],
     [
      "writing",
      4
     ],
     [
      "it",
      6
     ],
     [
      "at",
      8
     ],
     [
      "all.",
      10
     ]
    ],
    "notes": null
   },
   {
    "id": "c2a",
    "bar": 64,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "KEEP THEM DANCING!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "THEM",
      2
     ],
     [
      "DANCING!",
      4
     ]
    ],
    "notes": null
   },
   {
    "id": "c2b",
    "bar": 66,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "KEEP 'EM ON THE BEAT!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "'EM",
      2
     ],
     [
      "ON",
      4
     ],
     [
      "THE",
      6
     ],
     [
      "BEAT!",
      8
     ]
    ],
    "notes": null
   },
   {
    "id": "c2c",
    "bar": 68,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "IF THE MUSIC STOPS,",
    "words": [
     [
      "IF",
      0
     ],
     [
      "THE",
      2
     ],
     [
      "MUSIC",
      4
     ],
     [
      "STOPS,",
      6
     ]
    ],
    "notes": null
   },
   {
    "id": "c2d",
    "bar": 70,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "WE'RE SOMETHING TO EAT!",
    "words": [
     [
      "WE'RE",
      0
     ],
     [
      "SOMETHING",
      2
     ],
     [
      "TO",
      4
     ],
     [
      "EAT!",
      6
     ]
    ],
    "notes": null
   },
   {
    "id": "z1",
    "bar": 76,
    "part": "chant",
    "singer": "zombies",
    "zone": "auto",
    "text": "ONE! MORE! SONG!",
    "words": [
     [
      "ONE!",
      0
     ],
     [
      "MORE!",
      4
     ],
     [
      "SONG!",
      8
     ]
    ],
    "notes": null
   },
   {
    "id": "z2",
    "bar": 80,
    "part": "chant",
    "singer": "zombies",
    "zone": "auto",
    "text": "ONE! MORE! SONG!",
    "words": [
     [
      "ONE!",
      0
     ],
     [
      "MORE!",
      4
     ],
     [
      "SONG!",
      8
     ]
    ],
    "notes": null
   },
   {
    "id": "c3a",
    "bar": 92,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "KEEP THEM DANCING!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "THEM",
      2
     ],
     [
      "DANCING!",
      4
     ]
    ],
    "notes": null
   },
   {
    "id": "c3b",
    "bar": 94,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "KEEP 'EM ON THE BEAT!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "'EM",
      2
     ],
     [
      "ON",
      4
     ],
     [
      "THE",
      6
     ],
     [
      "BEAT!",
      8
     ]
    ],
    "notes": null
   },
   {
    "id": "c3c",
    "bar": 96,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "IF THE MUSIC STOPS,",
    "words": [
     [
      "IF",
      0
     ],
     [
      "THE",
      2
     ],
     [
      "MUSIC",
      4
     ],
     [
      "STOPS,",
      6
     ]
    ],
    "notes": null
   },
   {
    "id": "c3d",
    "bar": 98,
    "part": "chorus",
    "singer": "vex",
    "zone": "auto",
    "text": "WE'RE SOMETHING TO EAT!",
    "words": [
     [
      "WE'RE",
      0
     ],
     [
      "SOMETHING",
      2
     ],
     [
      "TO",
      4
     ],
     [
      "EAT!",
      6
     ]
    ],
    "notes": null
   },
   {
    "id": "r1",
    "bar": 100,
    "part": "call",
    "singer": "vex",
    "zone": "auto",
    "text": "One more song?",
    "words": [
     [
      "One",
      0
     ],
     [
      "more",
      2
     ],
     [
      "song?",
      4
     ]
    ],
    "notes": null
   },
   {
    "id": "r2",
    "bar": 101,
    "part": "response",
    "singer": "zombies",
    "zone": "auto",
    "text": "ONE MORE SONG!",
    "words": [
     [
      "ONE",
      0
     ],
     [
      "MORE",
      4
     ],
     [
      "SONG!",
      8
     ]
    ],
    "notes": null
   },
   {
    "id": "r3",
    "bar": 102,
    "part": "call",
    "singer": "vex",
    "zone": "auto",
    "text": "One more song?",
    "words": [
     [
      "One",
      0
     ],
     [
      "more",
      2
     ],
     [
      "song?",
      4
     ]
    ],
    "notes": null
   },
   {
    "id": "r4",
    "bar": 103,
    "part": "response",
    "singer": "zombies",
    "zone": "auto",
    "text": "ONE! MORE! SONG!",
    "words": [
     [
      "ONE!",
      0
     ],
     [
      "MORE!",
      4
     ],
     [
      "SONG!",
      8
     ]
    ],
    "notes": null
   }
  ],
  "spoken": [
   {
    "id": "lou_open",
    "bar": 0,
    "beat": 1,
    "voice": "lou",
    "fx": "radio",
    "text": "This is Last Call Lou, thirteen-thirteen on your A.M. dial. Three A.M., and they're restless tonight. Rescue's two minutes out. Whatever you do... don't let the music stop.",
    "words": null
   },
   {
    "id": "tiny_count",
    "bar": 7,
    "beat": 0,
    "voice": "tiny",
    "fx": "shout",
    "text": "ONE! TWO! THREE! FOUR!",
    "words": [
     [
      "ONE!",
      0
     ],
     [
      "TWO!",
      4
     ],
     [
      "THREE!",
      8
     ],
     [
      "FOUR!",
      12
     ]
    ]
   },
   {
    "id": "groan",
    "bar": 73,
    "beat": 0,
    "voice": "zombie",
    "fx": "dry",
    "text": "one... more...",
    "words": [
     [
      "one...",
      0
     ],
     [
      "more...",
      6
     ]
    ]
   },
   {
    "id": "lou_rescue",
    "bar": 75,
    "beat": 2,
    "voice": "lou",
    "fx": "radio",
    "text": "Rescue's two minutes out, kids.",
    "words": null
   },
   {
    "id": "lou_ride",
    "bar": 90,
    "beat": 0,
    "voice": "lou",
    "fx": "radio",
    "text": "Your ride is here, kids.",
    "words": null
   },
   {
    "id": "vex_goodnight",
    "bar": 104,
    "beat": 2,
    "voice": "vex",
    "fx": "megaphone",
    "text": "GOOD NIGHT!",
    "words": [
     [
      "GOOD",
      0
     ],
     [
      "NIGHT!",
      2
     ]
    ]
   },
   {
    "id": "lou_close",
    "bar": 108,
    "beat": 0,
    "voice": "lou",
    "fx": "radio",
    "text": "Great show, kids. Same time tomorrow.",
    "words": null
   }
  ]
 },
 "hits": [
  {
   "type": "radioTune",
   "beat": 0
  },
  {
   "type": "thunder",
   "beat": 8
  },
  {
   "type": "thunder",
   "beat": 22
  },
  {
   "type": "countIn",
   "beat": 28
  },
  {
   "type": "titleHit",
   "beat": 32
  },
  {
   "type": "zombieBonk",
   "beat": 42
  },
  {
   "type": "zombieBonk",
   "beat": 47
  },
  {
   "type": "zombieBonk",
   "beat": 53
  },
  {
   "type": "zombieBonk",
   "beat": 56
  },
  {
   "type": "skid",
   "beat": 60,
   "toBeat": 62.5
  },
  {
   "type": "carCrash",
   "beat": 62.5
  },
  {
   "type": "groupieSob",
   "beat": 112,
   "toBeat": 124
  },
  {
   "type": "groupieShriek",
   "beat": 124
  },
  {
   "type": "hordeRoar",
   "beat": 128,
   "toBeat": 136
  },
  {
   "type": "hordeRoar",
   "beat": 140,
   "toBeat": 144
  },
  {
   "type": "shotgun",
   "beat": 151
  },
  {
   "type": "shotgun",
   "beat": 159
  },
  {
   "type": "shotgun",
   "beat": 167
  },
  {
   "type": "shotgun",
   "beat": 174
  },
  {
   "type": "shotgun",
   "beat": 175
  },
  {
   "type": "reload",
   "beat": 160
  },
  {
   "type": "doorSlam",
   "beat": 192
  },
  {
   "type": "doorPound",
   "beat": 197,
   "toBeat": 224,
   "every": 2
  },
  {
   "type": "pills",
   "beat": 198
  },
  {
   "type": "doorBurst",
   "beat": 224
  },
  {
   "type": "sparks",
   "beat": 246
  },
  {
   "type": "tapeStop",
   "beat": 286,
   "toBeat": 288
  },
  {
   "type": "flashlightClick",
   "beat": 290
  },
  {
   "type": "flashlightClick",
   "beat": 291
  },
  {
   "type": "genPull",
   "beat": 300
  },
  {
   "type": "genPull",
   "beat": 308
  },
  {
   "type": "genPull",
   "beat": 316
  },
  {
   "type": "roadieStinger",
   "beat": 312
  },
  {
   "type": "genCatch",
   "beat": 324
  },
  {
   "type": "lightsOn",
   "beat": 328
  },
  {
   "type": "pyro",
   "beat": 328
  },
  {
   "type": "pyro",
   "beat": 332
  },
  {
   "type": "pyro",
   "beat": 336
  },
  {
   "type": "pyro",
   "beat": 340
  },
  {
   "type": "pyro",
   "beat": 344
  },
  {
   "type": "pyro",
   "beat": 348
  },
  {
   "type": "pyro",
   "beat": 352
  },
  {
   "type": "pyro",
   "beat": 356
  },
  {
   "type": "frisbee",
   "beat": 354
  },
  {
   "type": "ding",
   "beat": 356
  },
  {
   "type": "chopper",
   "beat": 360,
   "toBeat": 448
  },
  {
   "type": "finalHit",
   "beat": 420
  },
  {
   "type": "thermalHum",
   "beat": 424,
   "toBeat": 448
  },
  {
   "type": "applause",
   "beat": 428,
   "toBeat": 448
  },
  {
   "type": "musicBox",
   "beat": 440
  }
 ],
 "gaps": [
  {
   "fromBeat": 62.75,
   "toBeat": 64,
   "note": "after the crash: debris and silence, the verse slams in on bar 16"
  },
  {
   "fromBeat": 288,
   "toBeat": 296,
   "note": "blackout: the band is gone (tape stop ends at bar 72); room tone, clicks, the groan only"
  },
  {
   "fromBeat": 422,
   "toBeat": 448,
   "note": "after the final hit has rung: no band; only the coda sounds"
  }
 ],
 "captions": [
  {
   "bar": 4,
   "beat": 2,
   "beats": 6,
   "who": "GRANNY",
   "text": "Turn it up. I'm old, not dead.",
   "pos": "auto"
  },
  {
   "bar": 12,
   "beat": 0,
   "beats": 4,
   "who": "VEX",
   "text": "Is that... a crowd?",
   "pos": "auto"
  },
  {
   "bar": 13,
   "beat": 0,
   "beats": 4,
   "who": "TINY",
   "text": "That's a horde.",
   "pos": "auto"
  },
  {
   "bar": 14,
   "beat": 2,
   "beats": 6,
   "who": "NOODLE",
   "text": "BRAKES! BRAKES! BRAKES!",
   "pos": "auto"
  },
  {
   "bar": 25,
   "beat": 0,
   "beats": 6,
   "who": "NOODLE",
   "text": "Why are our faces on a MISSING poster?",
   "pos": "auto"
  },
  {
   "bar": 26,
   "beat": 2,
   "beats": 5,
   "who": "GRANNY",
   "text": "Good photo of me, though.",
   "pos": "auto"
  },
  {
   "bar": 28,
   "beat": 2,
   "beats": 5,
   "who": "TINY",
   "text": "Lights off. It's a Groupie.",
   "pos": "auto"
  },
  {
   "bar": 30,
   "beat": 2,
   "beats": 5,
   "who": "GROUPIE",
   "text": "VEX?! SIGN MY CAST!!!",
   "pos": "auto"
  },
  {
   "bar": 35,
   "beat": 0,
   "beats": 4,
   "who": "GRANNY",
   "text": "Gerald. Wake up.",
   "pos": "auto"
  },
  {
   "bar": 40,
   "beat": 0,
   "beats": 4,
   "who": "GRANNY",
   "text": "RELOADING!",
   "pos": "auto"
  },
  {
   "bar": 42,
   "beat": 2,
   "beats": 5,
   "who": "VEX",
   "text": "I can't hear the click track!",
   "pos": "auto"
  },
  {
   "bar": 44,
   "beat": 0,
   "beats": 4,
   "who": "TINY",
   "text": "I AM the click track.",
   "pos": "auto"
  },
  {
   "bar": 46,
   "beat": 0,
   "beats": 6,
   "who": "NOODLE",
   "text": "SAFE ROOM! RED DOOR!",
   "pos": "auto"
  },
  {
   "bar": 49,
   "beat": 2,
   "beats": 5,
   "who": "GRANNY",
   "text": "PILLS HERE!",
   "pos": "auto"
  },
  {
   "bar": 50,
   "beat": 2,
   "beats": 5,
   "who": "TINY",
   "text": "Those are my heart pills.",
   "pos": "auto"
  },
  {
   "bar": 51,
   "beat": 3,
   "beats": 4,
   "who": "GRANNY",
   "text": "Not anymore.",
   "pos": "auto"
  },
  {
   "bar": 52,
   "beat": 2,
   "beats": 6,
   "who": "NOODLE",
   "text": "Guys... who's been counting?",
   "pos": "auto"
  },
  {
   "bar": 54,
   "beat": 2,
   "beats": 6,
   "who": "VEX",
   "text": "...that's my handwriting.",
   "pos": "auto"
  },
  {
   "bar": 57,
   "beat": 0,
   "beats": 4,
   "who": "VEX",
   "text": "THE ORPHEUM! We're on in two!",
   "pos": "auto"
  },
  {
   "bar": 59,
   "beat": 0,
   "beats": 5,
   "who": "NOODLE",
   "text": "It says CONDEMNED.",
   "pos": "auto"
  },
  {
   "bar": 60,
   "beat": 2,
   "beats": 4,
   "who": "VEX",
   "text": "So are we, kid.",
   "pos": "auto"
  },
  {
   "bar": 61,
   "beat": 2,
   "beats": 3,
   "who": "NOODLE",
   "text": "Plugging in... OW.",
   "pos": "auto"
  },
  {
   "bar": 66,
   "beat": 0,
   "beats": 5,
   "who": "TINY",
   "text": "They're... headbanging?",
   "pos": "auto"
  },
  {
   "bar": 67,
   "beat": 2,
   "beats": 5,
   "who": "GRANNY",
   "text": "They're FANS, sweetie.",
   "pos": "auto"
  },
  {
   "bar": 72,
   "beat": 1,
   "beats": 5,
   "who": "NOODLE",
   "text": "Who unplugged the—",
   "pos": "auto"
  },
  {
   "bar": 74,
   "beat": 2,
   "beats": 4,
   "who": "TINY",
   "text": "Generator. NOW.",
   "pos": "auto"
  },
  {
   "bar": 75,
   "beat": 1,
   "beats": 3,
   "who": "NOODLE",
   "text": "PULL!",
   "pos": "auto"
  },
  {
   "bar": 77,
   "beat": 1,
   "beats": 3,
   "who": "NOODLE",
   "text": "It's flooded!",
   "pos": "auto"
  },
  {
   "bar": 77,
   "beat": 3,
   "beats": 4,
   "who": "TINY",
   "text": "SO ARE MY PANTS!",
   "pos": "auto"
  },
  {
   "bar": 79,
   "beat": 1,
   "beats": 3,
   "who": "NOODLE",
   "text": "PULL!!",
   "pos": "auto"
  },
  {
   "bar": 80,
   "beat": 0,
   "beats": 4,
   "who": "GRANNY",
   "text": "Kid. Pull it like you mean it.",
   "pos": "auto"
  },
  {
   "bar": 82,
   "beat": 0,
   "beats": 4,
   "who": "GRANNY",
   "text": "SOLO!!!",
   "pos": "auto"
  },
  {
   "bar": 86,
   "beat": 0,
   "beats": 4,
   "who": "VEX",
   "text": "Big one! Twelve o'clock!",
   "pos": "auto"
  },
  {
   "bar": 88,
   "beat": 0,
   "beats": 3,
   "who": "TINY",
   "text": "Fore.",
   "pos": "auto"
  },
  {
   "bar": 90,
   "beat": 0,
   "beats": 5,
   "who": "LOU",
   "text": "Your ride is here, kids.",
   "pos": "auto"
  },
  {
   "bar": 93,
   "beat": 0,
   "beats": 5,
   "who": "NOODLE",
   "text": "We're actually getting out?!",
   "pos": "auto"
  },
  {
   "bar": 94,
   "beat": 2,
   "beats": 6,
   "who": "GRANNY",
   "text": "Same chopper as last night.",
   "pos": "auto"
  },
  {
   "bar": 96,
   "beat": 2,
   "beats": 4,
   "who": "NOODLE",
   "text": "There was a LAST night?",
   "pos": "auto"
  },
  {
   "bar": 99,
   "beat": 0,
   "beats": 4,
   "who": "TINY",
   "text": "Not without my kit.",
   "pos": "auto"
  },
  {
   "bar": 108,
   "beat": 0,
   "beats": 6,
   "who": "LOU",
   "text": "Great show, kids. Same time tomorrow.",
   "pos": "auto"
  }
 ],
 "cards": [
  {
   "type": "title",
   "bar": 8,
   "beat": 0,
   "beats": 12,
   "band": "NO SURVIVORS",
   "song": "KEEP THEM DANCING",
   "sub": "LIVE AT THE ORPHEUM · NIGHT {night}"
  },
  {
   "type": "intro",
   "bar": 16,
   "beat": 0,
   "beats": 8,
   "who": "VEX",
   "name": "VEX",
   "role": "VOCALS",
   "line": "Has never once read the room."
  },
  {
   "type": "intro",
   "bar": 18,
   "beat": 0,
   "beats": 8,
   "who": "GRANNY",
   "name": "GRANNY GLOOM",
   "role": "LEAD GUITAR",
   "line": "71. Shotgun named Gerald."
  },
  {
   "type": "intro",
   "bar": 20,
   "beat": 0,
   "beats": 8,
   "who": "TINY",
   "name": "TINY",
   "role": "DRUMS",
   "line": "Isn't."
  },
  {
   "type": "intro",
   "bar": 22,
   "beat": 0,
   "beats": 8,
   "who": "NOODLE",
   "name": "NOODLE",
   "role": "BASS",
   "line": "Joined for the dental plan."
  },
  {
   "type": "chapter",
   "bar": 24,
   "beat": 0,
   "beats": 7,
   "n": "PART ONE",
   "title": "THE STREETS"
  },
  {
   "type": "special",
   "bar": 28,
   "beat": 0,
   "beats": 5,
   "name": "THE GROUPIE",
   "line": "Do not startle."
  },
  {
   "type": "warning",
   "bar": 32,
   "beat": 0,
   "beats": 8,
   "text": "HERE THEY COME"
  },
  {
   "type": "chapter",
   "bar": 48,
   "beat": 0,
   "beats": 7,
   "n": "PART TWO",
   "title": "THE SAFE ROOM"
  },
  {
   "type": "chapter",
   "bar": 56,
   "beat": 0,
   "beats": 7,
   "n": "PART THREE",
   "title": "THE ORPHEUM"
  },
  {
   "type": "special",
   "bar": 78,
   "beat": 0,
   "beats": 6,
   "name": "THE ROADIE",
   "line": "Here for the load-out."
  },
  {
   "type": "chapter",
   "bar": 90,
   "beat": 0,
   "beats": 7,
   "n": "PART FOUR",
   "title": "THE ENCORE"
  },
  {
   "type": "end",
   "bar": 109,
   "beat": 2,
   "beats": 10,
   "lines": [
    "NIGHT {night} · COMPLETE",
    "NIGHT {next} BEGINS IN {countdown}"
   ]
  }
 ],
 "clues": [
  {
   "id": "clock",
   "title": "Every clock says 3:00",
   "note": "ALWAYS 3:00?",
   "bar": 3
  },
  {
   "id": "lou",
   "title": "1313 AM",
   "note": "Who is LOU?",
   "bar": 1
  },
  {
   "id": "missing",
   "title": "MISSING since 1987",
   "note": "that's US??",
   "bar": 25
  },
  {
   "id": "wristband",
   "title": "ADMIT ONE",
   "note": "they all have TICKETS",
   "bar": 66
  },
  {
   "id": "notdead",
   "title": "THEY'RE NOT THE DEAD ONES",
   "note": "then who is?",
   "bar": 51
  },
  {
   "id": "tally",
   "title": "Who has been counting?",
   "note": "NIGHT {night}",
   "bar": 53
  },
  {
   "id": "handwriting",
   "title": "VEX WAS HERE",
   "note": "his handwriting",
   "bar": 54.5
  },
  {
   "id": "condemned",
   "title": "CONDEMNED · FIRE · 3:00 AM",
   "note": "31 OCT 1987",
   "bar": 58.5
  },
  {
   "id": "setlist",
   "title": "The setlist",
   "note": "read it top to bottom",
   "bar": 67.5
  },
  {
   "id": "mirror",
   "title": "In the mirror",
   "note": "what did Noodle see?",
   "bar": 73
  },
  {
   "id": "chopper",
   "title": "Same chopper as last night",
   "note": "every night?",
   "bar": 94
  },
  {
   "id": "thermal",
   "title": "Thermal",
   "note": "THEY'RE WARM. WE'RE COLD.",
   "bar": 108
  }
 ],
 "setlist": {
  "header": "NO SURVIVORS · THE ORPHEUM",
  "songs": [
   "Horde Call",
   "Eat the Rich (Literally)",
   "Last Call Lou",
   "Pills & Thrills",
   "Undead Weight",
   "Safe Room (Don't Knock)"
  ],
  "encore": "Keep Them Dancing",
  "acrostic": "HELPUS"
 },
 "radio": [
  {
   "id": "lou",
   "freq": 1313,
   "voice": "lou",
   "text": "You're still listening. Good. Doors at three. Bring a friend.",
   "fromSec": null,
   "toSec": null
  },
  {
   "id": "lou3am",
   "freq": 1313,
   "voice": "lou",
   "witching": true,
   "text": "You came back. The doors are open, kid. Come on in.",
   "fromSec": null,
   "toSec": null
  },
  {
   "id": "numbers",
   "freq": 1031,
   "voice": "numbers",
   "text": "one. zero. three. one. one. nine. eight. seven.",
   "loop": true,
   "fromSec": null,
   "toSec": null
  },
  {
   "id": "chant",
   "freq": 1600,
   "voice": "zombies",
   "reversed": true,
   "text": "one more song, one more song, one more song",
   "loop": true,
   "fromSec": null,
   "toSec": null
  },
  {
   "id": "bleed",
   "freq": 870,
   "voice": "song",
   "text": "(the chorus, bleeding through, lo-fi)",
   "loop": true,
   "fromSec": null,
   "toSec": null
  }
 ],
 "cues": [
  {
   "shot": "van",
   "bars": [
    0,
    8
   ]
  },
  {
   "shot": "highway",
   "bars": [
    8,
    16
   ],
   "trans": {
    "type": "flash",
    "beats": 0.5
   }
  },
  {
   "shot": "intros",
   "bars": [
    16,
    24
   ],
   "trans": {
    "type": "cut"
   }
  },
  {
   "shot": "street",
   "bars": [
    24,
    32
   ],
   "trans": {
    "type": "whip",
    "beats": 0.5
   }
  },
  {
   "shot": "hordeWarn",
   "bars": [
    32,
    36
   ],
   "trans": {
    "type": "cut"
   }
  },
  {
   "shot": "horde",
   "bars": [
    36,
    44
   ],
   "trans": {
    "type": "flash",
    "beats": 0.5
   }
  },
  {
   "shot": "dash",
   "bars": [
    44,
    48
   ],
   "trans": {
    "type": "whip",
    "beats": 0.5
   }
  },
  {
   "shot": "saferoom",
   "bars": [
    48,
    56
   ],
   "trans": {
    "type": "cut"
   }
  },
  {
   "shot": "orpheum",
   "bars": [
    56,
    64
   ],
   "trans": {
    "type": "flash",
    "beats": 0.5
   }
  },
  {
   "shot": "stage",
   "bars": [
    64,
    72
   ],
   "trans": {
    "type": "cut"
   }
  },
  {
   "shot": "blackout",
   "bars": [
    72,
    74
   ],
   "trans": {
    "type": "cut"
   }
  },
  {
   "shot": "generator",
   "bars": [
    74,
    82
   ],
   "trans": {
    "type": "cut"
   }
  },
  {
   "shot": "solo",
   "bars": [
    82,
    90
   ],
   "trans": {
    "type": "flash",
    "beats": 1
   }
  },
  {
   "shot": "rooftop",
   "bars": [
    90,
    106
   ],
   "trans": {
    "type": "whip",
    "beats": 0.5
   }
  },
  {
   "shot": "thermal",
   "bars": [
    106,
    112
   ],
   "trans": {
    "type": "glitch",
    "beats": 1
   }
  }
 ],
 "warning": {
  "text": "Flashing lights: muzzle flashes, lightning and stage lights.",
  "reduce": "Reduce flashing"
 },
 "composerTodo": "chords, drums, bass, riffs, arrangement and every vocals.lines[].notes are filled in by the composer; words may be re-timed to the melody. Delete this key when done."
};
