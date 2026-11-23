// NO SURVIVORS: Keep Them Dancing. The single source of truth for timing, read by the page
// (window.SCORE) and by the soundtrack synth (tools/no_survivors_audio.py).
// Format: the JSON object starts after "window.SCORE = " and ends at the last ";". Parse it with
// s[s.index("window.SCORE =") + 14 : s.rindex(";")]. Write it with json.dumps(obj, indent=1, ensure_ascii=False).
//
// 150 BPM, 4/4, 112 bars = 179.2 s (+0.8 s room tone: the audio is 180.0 s). One beat 0.4 s, one bar
// 1.6 s, one 16th step 0.1 s. Bars count from 0; "bars": [a, b] are half-open. A "beat" in hits, gaps and
// spoken[].win is a global beat index (bar * 4 + beat in bar). Steps in words/notes are 16ths from the line's
// bar. Per-bar arrays (energy, chords, bass, each drum lane) have 112 entries. Strings may contain the tokens
// {night} {prev} {next} {countdown} (NS.fill). Every on-screen string has exactly one source key.
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
 "key": "E minor; final chorus F# minor (+2) from bar 92; the coda music box is back in E minor",
 "sections": [
  {
   "id": "coldopen",
   "bars": [
    0,
    8
   ],
   "label": "Cold open",
   "role": "rain, radio, Lou in four phrases; organ drone + heartbeat choke on \"stop.\"; thunder; Tiny counts in on bar 7"
  },
  {
   "id": "intro",
   "bars": [
    8,
    16
   ],
   "label": "Intro",
   "role": "main riff x2 (its stabs are the hook rhythm), title smash; skid and crash on bar 15"
  },
  {
   "id": "verse1a",
   "bars": [
    16,
    24
   ],
   "label": "The band",
   "role": "verse riff; gang shouts each name on its downbeat; a signature lick per member in the 2nd bar"
  },
  {
   "id": "verse1b",
   "bars": [
    24,
    32
   ],
   "label": "Verse 1",
   "role": "verse 1 vocals; the Groupie; stop-time on bar 30, shriek on 31"
  },
  {
   "id": "pre1",
   "bars": [
    32,
    36
   ],
   "label": "Pre-chorus",
   "role": "call and response HERE THEY COME; roots climb A-Bb-B under one sung B3"
  },
  {
   "id": "chorus1",
   "bars": [
    36,
    44
   ],
   "label": "Chorus",
   "role": "chorus 1: the horde; the band stops dead on STOPS (bar 40)"
  },
  {
   "id": "post1",
   "bars": [
    44,
    48
   ],
   "label": "Riff",
   "role": "main riff; the band stab on bar 48 IS the door slam"
  },
  {
   "id": "saferoom",
   "bars": [
    48,
    56
   ],
   "label": "Intermission",
   "role": "breakdown: clean arpeggios, heartbeat, the pounding door as backbeat, music box; all stops at bar 54; the knock gag"
  },
  {
   "id": "verse2",
   "bars": [
    56,
    64
   ],
   "label": "Verse 2",
   "role": "verse 2 half-time, heard from outside; v2c-v2d sung dry (no megaphone); Noodle plugs in at 61.5"
  },
  {
   "id": "chorus2",
   "bars": [
    64,
    72
   ],
   "label": "Chorus",
   "role": "chorus 2 on stage; the pit grunts HUH!; stop on STOPS (bar 68); tape stop at 71.5"
  },
  {
   "id": "blackout",
   "bars": [
    72,
    74
   ],
   "label": "Blackout",
   "role": "silence: clicks, phones, the groan, the mirror and a 0.3 s 1987 flashback"
  },
  {
   "id": "crescendo",
   "bars": [
    74,
    82
   ],
   "label": "Crescendo",
   "role": "acoustic only (no power): toms, bats on road cases, crowd stomps, chant; tuned generator pulls; the Roadie; catch on bar 81"
  },
  {
   "id": "solo",
   "bars": [
    82,
    90
   ],
   "label": "Solo",
   "role": "Granny's solo over the riff; pyro; double kick from 86; the DING harmonises with her held B"
  },
  {
   "id": "lift",
   "bars": [
    90,
    92
   ],
   "label": "Lift",
   "role": "band hit and choke; Lou; EVERYBODY UP! and the whole-tone lift"
  },
  {
   "id": "chorus3",
   "bars": [
    92,
    104
   ],
   "label": "Final chorus",
   "role": "final chorus in F# minor; stop on STOPS (bar 96); call and response ONE MORE SONG? / HOW MANY MORE?"
  },
  {
   "id": "ending",
   "bars": [
    104,
    106
   ],
   "label": "Ending",
   "role": "F#5 tremolo and drum roll, GOOD NIGHT!, final hit on bar 105, the picture burns"
  },
  {
   "id": "coda",
   "bars": [
    106,
    112
   ],
   "label": "Coda",
   "role": "thermal: hum, muffled blades, a fan shouts, Lou signs off, the music box runs down before STOPS"
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
  0.6,
  0.6,
  0.6,
  0.6,
  0.6,
  0.6,
  0.6,
  0.6,
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
  0.3,
  0.38,
  0.46,
  0.54,
  0.62,
  0.7,
  0.78,
  0.86,
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
  0.06,
  0.06,
  0.06,
  0.06,
  0.06,
  0.06
 ],
 "chords": null,
 "bass": null,
 "riffs": null,
 "arrangement": null,
 "drums": null,
 "vocals": {
  "lines": [
   {
    "id": "g1",
    "bar": 16,
    "part": "names",
    "singer": "gang",
    "fx": "shout",
    "display": "card",
    "zone": "auto",
    "text": "VEX!",
    "words": [
     [
      "VEX!",
      0
     ]
    ],
    "notes": [
     [
      "VEX",
      0,
      4,
      52
     ]
    ]
   },
   {
    "id": "g2",
    "bar": 18,
    "part": "names",
    "singer": "gang",
    "fx": "shout",
    "display": "card",
    "zone": "auto",
    "text": "GRANNY!",
    "words": [
     [
      "GRANNY!",
      0
     ]
    ],
    "notes": [
     [
      "GRAN",
      0,
      2,
      52
     ],
     [
      "NY",
      2,
      4,
      52
     ]
    ]
   },
   {
    "id": "g3",
    "bar": 20,
    "part": "names",
    "singer": "gang",
    "fx": "shout",
    "display": "card",
    "zone": "auto",
    "text": "TINY!",
    "words": [
     [
      "TINY!",
      0
     ]
    ],
    "notes": [
     [
      "TI",
      0,
      2,
      52
     ],
     [
      "NY",
      2,
      4,
      52
     ]
    ]
   },
   {
    "id": "g4",
    "bar": 22,
    "part": "names",
    "singer": "gang",
    "fx": "shout",
    "display": "card",
    "zone": "auto",
    "text": "NOODLE!",
    "words": [
     [
      "NOODLE!",
      0
     ]
    ],
    "notes": [
     [
      "NOO",
      0,
      2,
      52
     ],
     [
      "DLE",
      2,
      4,
      52
     ]
    ]
   },
   {
    "id": "v1a",
    "bar": 24,
    "part": "verse1",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
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
      8
     ],
     [
      "the",
      10
     ],
     [
      "county",
      12
     ],
     [
      "line",
      16
     ]
    ],
    "notes": [
     [
      "Three",
      0,
      2,
      52
     ],
     [
      "A",
      2,
      2,
      55
     ],
     [
      "M",
      4,
      2,
      55
     ],
     [
      "on",
      8,
      2,
      52
     ],
     [
      "the",
      10,
      2,
      52
     ],
     [
      "coun",
      12,
      2,
      55
     ],
     [
      "ty",
      14,
      2,
      57
     ],
     [
      "line",
      16,
      8,
      59
     ]
    ]
   },
   {
    "id": "v1b",
    "bar": 26,
    "part": "verse1",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "Lou on the radio, right on time",
    "words": [
     [
      "Lou",
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
      "radio,",
      8
     ],
     [
      "right",
      12
     ],
     [
      "on",
      14
     ],
     [
      "time",
      16
     ]
    ],
    "notes": [
     [
      "Lou",
      0,
      4,
      55
     ],
     [
      "on",
      4,
      2,
      52
     ],
     [
      "the",
      6,
      2,
      52
     ],
     [
      "ra",
      8,
      2,
      55
     ],
     [
      "di",
      10,
      1,
      55
     ],
     [
      "o",
      11,
      1,
      52
     ],
     [
      "right",
      12,
      2,
      55
     ],
     [
      "on",
      14,
      2,
      57
     ],
     [
      "time",
      16,
      8,
      54
     ]
    ]
   },
   {
    "id": "v1c",
    "bar": 28,
    "part": "verse1",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "Girl in the alley says she's number one,",
    "words": [
     [
      "Girl",
      0
     ],
     [
      "in",
      2
     ],
     [
      "the",
      3
     ],
     [
      "alley",
      4
     ],
     [
      "says",
      8
     ],
     [
      "she's",
      10
     ],
     [
      "number",
      12
     ],
     [
      "one,",
      16
     ]
    ],
    "notes": [
     [
      "Girl",
      0,
      2,
      52
     ],
     [
      "in",
      2,
      1,
      52
     ],
     [
      "the",
      3,
      1,
      52
     ],
     [
      "al",
      4,
      2,
      55
     ],
     [
      "ley",
      6,
      2,
      55
     ],
     [
      "says",
      8,
      2,
      57
     ],
     [
      "she's",
      10,
      2,
      57
     ],
     [
      "num",
      12,
      2,
      59
     ],
     [
      "ber",
      14,
      2,
      57
     ],
     [
      "one",
      16,
      8,
      59
     ]
    ]
   },
   {
    "id": "v1d",
    "bar": 30,
    "part": "verse1",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
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
    "notes": [
     [
      "Don't",
      0,
      2,
      55
     ],
     [
      "look",
      2,
      2,
      55
     ],
     [
      "don't",
      4,
      2,
      55
     ],
     [
      "touch",
      6,
      2,
      55
     ],
     [
      "don't",
      8,
      2,
      57
     ],
     [
      "stop",
      10,
      2,
      57
     ],
     [
      "just",
      12,
      2,
      57
     ],
     [
      "RUN",
      14,
      10,
      59
     ]
    ]
   },
   {
    "id": "p1a",
    "bar": 32,
    "part": "pre",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "Here they come,",
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
     ]
    ],
    "notes": [
     [
      "Here",
      0,
      2,
      59
     ],
     [
      "they",
      2,
      2,
      59
     ],
     [
      "come",
      4,
      4,
      59
     ]
    ]
   },
   {
    "id": "p1g",
    "bar": 32,
    "part": "pre",
    "singer": "gang",
    "fx": "shout",
    "display": "lyric",
    "zone": "auto",
    "text": "HERE THEY COME!",
    "words": [
     [
      "HERE",
      8
     ],
     [
      "THEY",
      10
     ],
     [
      "COME!",
      12
     ]
    ],
    "notes": [
     [
      "HERE",
      8,
      2,
      47
     ],
     [
      "THEY",
      10,
      2,
      47
     ],
     [
      "COME",
      12,
      4,
      47
     ]
    ]
   },
   {
    "id": "p1a2",
    "bar": 33,
    "part": "pre",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "Here they come,",
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
     ]
    ],
    "notes": [
     [
      "Here",
      0,
      2,
      59
     ],
     [
      "they",
      2,
      2,
      59
     ],
     [
      "come",
      4,
      4,
      59
     ]
    ]
   },
   {
    "id": "p1g2",
    "bar": 33,
    "part": "pre",
    "singer": "gang",
    "fx": "shout",
    "display": "lyric",
    "zone": "auto",
    "text": "HERE THEY COME!",
    "words": [
     [
      "HERE",
      8
     ],
     [
      "THEY",
      10
     ],
     [
      "COME!",
      12
     ]
    ],
    "notes": [
     [
      "HERE",
      8,
      2,
      47
     ],
     [
      "THEY",
      10,
      2,
      47
     ],
     [
      "COME",
      12,
      4,
      47
     ]
    ]
   },
   {
    "id": "p1b",
    "bar": 34,
    "part": "pre",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
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
      6
     ],
     [
      "and",
      8
     ],
     [
      "a",
      10
     ],
     [
      "single",
      12
     ],
     [
      "drum!",
      16
     ]
    ],
    "notes": [
     [
      "a",
      0,
      2,
      59
     ],
     [
      "thou",
      2,
      2,
      59
     ],
     [
      "sand",
      4,
      2,
      59
     ],
     [
      "feet",
      6,
      2,
      59
     ],
     [
      "and",
      8,
      2,
      59
     ],
     [
      "a",
      10,
      2,
      59
     ],
     [
      "sin",
      12,
      2,
      59
     ],
     [
      "gle",
      14,
      2,
      60
     ],
     [
      "drum",
      16,
      12,
      62
     ]
    ]
   },
   {
    "id": "c1a",
    "bar": 36,
    "part": "chorus",
    "singer": "vex+gang",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "KEEP THEM DANCING!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "THEM",
      4
     ],
     [
      "DANCING!",
      8
     ]
    ],
    "notes": [
     [
      "KEEP",
      0,
      4,
      55
     ],
     [
      "THEM",
      4,
      4,
      55
     ],
     [
      "DAN",
      8,
      6,
      59
     ],
     [
      "CING",
      14,
      10,
      57
     ]
    ]
   },
   {
    "id": "c1b",
    "bar": 38,
    "part": "chorus",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "KEEP 'EM ON THE BEAT!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "'EM",
      4
     ],
     [
      "ON",
      8
     ],
     [
      "THE",
      10
     ],
     [
      "BEAT!",
      12
     ]
    ],
    "notes": [
     [
      "KEEP",
      0,
      4,
      55
     ],
     [
      "EM",
      4,
      4,
      55
     ],
     [
      "ON",
      8,
      2,
      57
     ],
     [
      "THE",
      10,
      2,
      57
     ],
     [
      "BEAT",
      12,
      12,
      59
     ]
    ]
   },
   {
    "id": "c1c",
    "bar": 40,
    "part": "chorus",
    "singer": "vex+gang",
    "fx": "megaphone",
    "display": "lyric",
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
      8
     ]
    ],
    "notes": [
     [
      "IF",
      0,
      2,
      59
     ],
     [
      "THE",
      2,
      2,
      59
     ],
     [
      "MU",
      4,
      2,
      60
     ],
     [
      "SIC",
      6,
      2,
      59
     ],
     [
      "STOPS",
      8,
      2,
      62
     ]
    ]
   },
   {
    "id": "c1d",
    "bar": 42,
    "part": "chorus",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "WE'RE ALL DEAD MEAT!",
    "words": [
     [
      "WE'RE",
      0
     ],
     [
      "ALL",
      2
     ],
     [
      "DEAD",
      4
     ],
     [
      "MEAT!",
      8
     ]
    ],
    "notes": [
     [
      "WE'RE",
      0,
      2,
      59
     ],
     [
      "ALL",
      2,
      2,
      59
     ],
     [
      "DEAD",
      4,
      4,
      57
     ],
     [
      "MEAT",
      8,
      14,
      54
     ]
    ]
   },
   {
    "id": "v2a",
    "bar": 56,
    "part": "verse2",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
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
      8
     ],
     [
      "the",
      10
     ],
     [
      "same",
      12
     ],
     [
      "old",
      14
     ],
     [
      "crowd,",
      16
     ]
    ],
    "notes": [
     [
      "Same",
      0,
      2,
      52
     ],
     [
      "old",
      2,
      2,
      52
     ],
     [
      "stage",
      4,
      4,
      55
     ],
     [
      "and",
      8,
      2,
      52
     ],
     [
      "the",
      10,
      2,
      52
     ],
     [
      "same",
      12,
      2,
      55
     ],
     [
      "old",
      14,
      2,
      57
     ],
     [
      "crowd",
      16,
      8,
      59
     ]
    ]
   },
   {
    "id": "v2b",
    "bar": 58,
    "part": "verse2",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "same stopped clock and the same black cloud,",
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
      "clock",
      4
     ],
     [
      "and",
      8
     ],
     [
      "the",
      10
     ],
     [
      "same",
      12
     ],
     [
      "black",
      14
     ],
     [
      "cloud,",
      16
     ]
    ],
    "notes": [
     [
      "same",
      0,
      2,
      55
     ],
     [
      "stopped",
      2,
      2,
      55
     ],
     [
      "clock",
      4,
      4,
      52
     ],
     [
      "and",
      8,
      2,
      52
     ],
     [
      "the",
      10,
      2,
      52
     ],
     [
      "same",
      12,
      2,
      55
     ],
     [
      "black",
      14,
      2,
      57
     ],
     [
      "cloud",
      16,
      8,
      54
     ]
    ]
   },
   {
    "id": "v2c",
    "bar": 60,
    "part": "verse2",
    "singer": "vex",
    "fx": "dry",
    "display": "lyric",
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
      8
     ],
     [
      "the",
      10
     ],
     [
      "safe-room",
      12
     ],
     [
      "wall,",
      16
     ]
    ],
    "notes": [
     [
      "found",
      0,
      2,
      52
     ],
     [
      "my",
      2,
      2,
      52
     ],
     [
      "name",
      4,
      4,
      55
     ],
     [
      "on",
      8,
      2,
      52
     ],
     [
      "the",
      10,
      2,
      52
     ],
     [
      "safe",
      12,
      2,
      55
     ],
     [
      "room",
      14,
      2,
      57
     ],
     [
      "wall",
      16,
      8,
      59
     ]
    ]
   },
   {
    "id": "v2d",
    "bar": 62,
    "part": "verse2",
    "singer": "vex",
    "fx": "dry",
    "display": "lyric",
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
      8
     ],
     [
      "it",
      12
     ],
     [
      "at",
      14
     ],
     [
      "all.",
      16
     ]
    ],
    "notes": [
     [
      "don't",
      0,
      2,
      52
     ],
     [
      "re",
      2,
      2,
      52
     ],
     [
      "mem",
      4,
      2,
      57
     ],
     [
      "ber",
      6,
      2,
      55
     ],
     [
      "wri",
      8,
      2,
      52
     ],
     [
      "ting",
      10,
      2,
      52
     ],
     [
      "it",
      12,
      2,
      52
     ],
     [
      "at",
      14,
      2,
      54
     ],
     [
      "all",
      16,
      12,
      51
     ]
    ]
   },
   {
    "id": "c2a",
    "bar": 64,
    "part": "chorus",
    "singer": "vex+gang",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "KEEP THEM DANCING!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "THEM",
      4
     ],
     [
      "DANCING!",
      8
     ]
    ],
    "notes": [
     [
      "KEEP",
      0,
      4,
      55
     ],
     [
      "THEM",
      4,
      4,
      55
     ],
     [
      "DAN",
      8,
      6,
      59
     ],
     [
      "CING",
      14,
      10,
      57
     ]
    ]
   },
   {
    "id": "c2b",
    "bar": 66,
    "part": "chorus",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "KEEP 'EM ON THE BEAT!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "'EM",
      4
     ],
     [
      "ON",
      8
     ],
     [
      "THE",
      10
     ],
     [
      "BEAT!",
      12
     ]
    ],
    "notes": [
     [
      "KEEP",
      0,
      4,
      55
     ],
     [
      "EM",
      4,
      4,
      55
     ],
     [
      "ON",
      8,
      2,
      57
     ],
     [
      "THE",
      10,
      2,
      57
     ],
     [
      "BEAT",
      12,
      12,
      59
     ]
    ]
   },
   {
    "id": "c2c",
    "bar": 68,
    "part": "chorus",
    "singer": "vex+gang",
    "fx": "megaphone",
    "display": "lyric",
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
      8
     ]
    ],
    "notes": [
     [
      "IF",
      0,
      2,
      59
     ],
     [
      "THE",
      2,
      2,
      59
     ],
     [
      "MU",
      4,
      2,
      60
     ],
     [
      "SIC",
      6,
      2,
      59
     ],
     [
      "STOPS",
      8,
      2,
      62
     ]
    ]
   },
   {
    "id": "c2d",
    "bar": 70,
    "part": "chorus",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "WE'RE ALL DEAD MEAT!",
    "words": [
     [
      "WE'RE",
      0
     ],
     [
      "ALL",
      2
     ],
     [
      "DEAD",
      4
     ],
     [
      "MEAT!",
      8
     ]
    ],
    "notes": [
     [
      "WE'RE",
      0,
      2,
      59
     ],
     [
      "ALL",
      2,
      2,
      59
     ],
     [
      "DEAD",
      4,
      4,
      57
     ],
     [
      "MEAT",
      8,
      14,
      54
     ]
    ]
   },
   {
    "id": "z1",
    "bar": 76,
    "part": "chant",
    "singer": "zombies",
    "fx": "choir",
    "display": "lyric",
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
    "notes": [
     [
      "ONE",
      0,
      3,
      48
     ],
     [
      "MORE",
      4,
      3,
      50
     ],
     [
      "SONG",
      8,
      6,
      52
     ]
    ]
   },
   {
    "id": "z2",
    "bar": 80,
    "part": "chant",
    "singer": "zombies",
    "fx": "choir",
    "display": "lyric",
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
    "notes": [
     [
      "ONE",
      0,
      3,
      48
     ],
     [
      "MORE",
      4,
      3,
      50
     ],
     [
      "SONG",
      8,
      6,
      52
     ]
    ]
   },
   {
    "id": "z3",
    "bar": 81,
    "part": "chant",
    "singer": "zombies",
    "fx": "choir",
    "display": "lyric",
    "zone": "auto",
    "text": "ONE! MORE! SONG! ONE! MORE! SONG!",
    "words": [
     [
      "ONE!",
      0
     ],
     [
      "MORE!",
      2
     ],
     [
      "SONG!",
      4
     ],
     [
      "ONE!",
      8
     ],
     [
      "MORE!",
      10
     ],
     [
      "SONG!",
      12
     ]
    ],
    "notes": [
     [
      "ONE",
      0,
      2,
      48
     ],
     [
      "MORE",
      2,
      2,
      50
     ],
     [
      "SONG",
      4,
      3,
      52
     ],
     [
      "ONE",
      8,
      2,
      48
     ],
     [
      "MORE",
      10,
      2,
      50
     ],
     [
      "SONG",
      12,
      4,
      52
     ]
    ]
   },
   {
    "id": "lift",
    "bar": 91,
    "part": "lift",
    "singer": "vex+gang",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "EVERYBODY UP!",
    "words": [
     [
      "EVERYBODY",
      0
     ],
     [
      "UP!",
      8
     ]
    ],
    "notes": [
     [
      "EV",
      0,
      2,
      52
     ],
     [
      "ERY",
      2,
      2,
      52
     ],
     [
      "BO",
      4,
      2,
      55
     ],
     [
      "DY",
      6,
      2,
      57
     ],
     [
      "UP",
      8,
      8,
      59
     ]
    ]
   },
   {
    "id": "c3a",
    "bar": 92,
    "part": "chorus",
    "singer": "vex+gang",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "KEEP THEM DANCING!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "THEM",
      4
     ],
     [
      "DANCING!",
      8
     ]
    ],
    "notes": [
     [
      "KEEP",
      0,
      4,
      57
     ],
     [
      "THEM",
      4,
      4,
      57
     ],
     [
      "DAN",
      8,
      6,
      61
     ],
     [
      "CING",
      14,
      10,
      59
     ]
    ]
   },
   {
    "id": "c3b",
    "bar": 94,
    "part": "chorus",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "KEEP 'EM ON THE BEAT!",
    "words": [
     [
      "KEEP",
      0
     ],
     [
      "'EM",
      4
     ],
     [
      "ON",
      8
     ],
     [
      "THE",
      10
     ],
     [
      "BEAT!",
      12
     ]
    ],
    "notes": [
     [
      "KEEP",
      0,
      4,
      57
     ],
     [
      "EM",
      4,
      4,
      57
     ],
     [
      "ON",
      8,
      2,
      59
     ],
     [
      "THE",
      10,
      2,
      59
     ],
     [
      "BEAT",
      12,
      12,
      61
     ]
    ]
   },
   {
    "id": "c3c",
    "bar": 96,
    "part": "chorus",
    "singer": "vex+gang",
    "fx": "megaphone",
    "display": "lyric",
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
      8
     ]
    ],
    "notes": [
     [
      "IF",
      0,
      2,
      61
     ],
     [
      "THE",
      2,
      2,
      61
     ],
     [
      "MU",
      4,
      2,
      62
     ],
     [
      "SIC",
      6,
      2,
      61
     ],
     [
      "STOPS",
      8,
      2,
      64
     ]
    ]
   },
   {
    "id": "c3d",
    "bar": 98,
    "part": "chorus",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "WE'RE DEAD ON OUR FEET!",
    "words": [
     [
      "WE'RE",
      0
     ],
     [
      "DEAD",
      2
     ],
     [
      "ON",
      4
     ],
     [
      "OUR",
      6
     ],
     [
      "FEET!",
      8
     ]
    ],
    "notes": [
     [
      "WE'RE",
      0,
      2,
      61
     ],
     [
      "DEAD",
      2,
      2,
      61
     ],
     [
      "ON",
      4,
      2,
      59
     ],
     [
      "OUR",
      6,
      2,
      59
     ],
     [
      "FEET",
      8,
      14,
      56
     ]
    ]
   },
   {
    "id": "r1",
    "bar": 100,
    "part": "call",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "ONE MORE SONG?",
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
      "SONG?",
      8
     ]
    ],
    "notes": [
     [
      "ONE",
      0,
      4,
      54
     ],
     [
      "MORE",
      4,
      4,
      57
     ],
     [
      "SONG",
      8,
      8,
      61
     ]
    ]
   },
   {
    "id": "r2",
    "bar": 101,
    "part": "response",
    "singer": "zombies",
    "fx": "crowd",
    "display": "lyric",
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
    "notes": [
     [
      "ONE",
      0,
      3,
      50
     ],
     [
      "MORE",
      4,
      3,
      52
     ],
     [
      "SONG",
      8,
      6,
      54
     ]
    ]
   },
   {
    "id": "r3",
    "bar": 102,
    "part": "call",
    "singer": "vex",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "HOW MANY MORE?",
    "words": [
     [
      "HOW",
      0
     ],
     [
      "MANY",
      4
     ],
     [
      "MORE?",
      8
     ]
    ],
    "notes": [
     [
      "HOW",
      0,
      4,
      54
     ],
     [
      "MA",
      4,
      2,
      57
     ],
     [
      "NY",
      6,
      2,
      57
     ],
     [
      "MORE",
      8,
      8,
      61
     ]
    ]
   },
   {
    "id": "r4",
    "bar": 103,
    "part": "response",
    "singer": "zombies+gang",
    "fx": "crowd",
    "display": "lyric",
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
    "notes": [
     [
      "ONE",
      0,
      3,
      50
     ],
     [
      "MORE",
      4,
      3,
      52
     ],
     [
      "SONG",
      8,
      6,
      54
     ]
    ]
   }
  ],
  "spoken": [
   {
    "id": "lou_open1",
    "bar": 1,
    "beat": 0,
    "voice": "lou",
    "fx": "radio",
    "text": "Welcome back to Last Call Lou, thirteen-thirteen A.M.",
    "win": [
     4,
     11.75
    ],
    "words": null,
    "dur": null,
    "flite": "Welcome back, to Last Call Lou. Thirteen thirteen, ay em."
   },
   {
    "id": "lou_open2",
    "bar": 3,
    "beat": 0,
    "voice": "lou",
    "fx": "radio",
    "text": "Three A.M. Full house again.",
    "win": [
     12,
     16.75
    ],
    "words": null,
    "dur": null,
    "flite": "Three ay em. Full house, again."
   },
   {
    "id": "lou_open3",
    "bar": 4,
    "beat": 1,
    "voice": "lou",
    "fx": "radio",
    "text": "Rescue's two minutes out.",
    "win": [
     17,
     20
    ],
    "words": null,
    "dur": null,
    "flite": "Rescue's two minutes out."
   },
   {
    "id": "lou_open4",
    "bar": 5,
    "beat": 0,
    "voice": "lou",
    "fx": "radio",
    "text": "Whatever you do... don't let the music stop.",
    "win": [
     20,
     25.5
    ],
    "words": null,
    "dur": null,
    "flite": "Whatever you do. Don't let the music. Stop."
   },
   {
    "id": "tiny_count",
    "bar": 7,
    "beat": 0,
    "voice": "tiny",
    "fx": "shout",
    "text": "ONE! TWO! THREE! FOUR!",
    "win": [
     28,
     32
    ],
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
    ],
    "dur": null
   },
   {
    "id": "groan",
    "bar": 73,
    "beat": 0,
    "voice": "zombie",
    "fx": "dry",
    "text": "one... more...",
    "win": [
     292.5,
     296
    ],
    "words": [
     [
      "one...",
      2
     ],
     [
      "more...",
      12
     ]
    ],
    "dur": null
   },
   {
    "id": "lou_rescue",
    "bar": 74,
    "beat": 2,
    "voice": "lou",
    "fx": "radio",
    "text": "Rescue's two minutes out.",
    "win": [
     298,
     302
    ],
    "words": null,
    "dur": null,
    "take": "lou_open3"
   },
   {
    "id": "roadie_check",
    "bar": 78,
    "beat": 1.5,
    "voice": "roadie",
    "fx": "dry",
    "text": "check... one... two...",
    "win": [
     313.5,
     316
    ],
    "words": null,
    "dur": null
   },
   {
    "id": "lou_ride",
    "bar": 90,
    "beat": 1,
    "voice": "lou",
    "fx": "radio",
    "text": "Your ride is here, kids.",
    "win": [
     361,
     364.5
    ],
    "words": null,
    "dur": null
   },
   {
    "id": "vex_goodnight",
    "bar": 104,
    "beat": 2,
    "voice": "vex",
    "fx": "megaphone",
    "text": "GOOD NIGHT!",
    "win": [
     418,
     420
    ],
    "words": [
     [
      "GOOD",
      0
     ],
     [
      "NIGHT!",
      2
     ]
    ],
    "dur": null
   },
   {
    "id": "fan",
    "bar": 107,
    "beat": 0,
    "voice": "fan",
    "fx": "distant",
    "text": "One more song!",
    "win": [
     428,
     431
    ],
    "words": null,
    "dur": null
   },
   {
    "id": "lou_close",
    "bar": 108,
    "beat": 0,
    "voice": "lou",
    "fx": "radio",
    "text": "Great show, kids. Same time tomorrow.",
    "win": [
     432,
     438
    ],
    "words": null,
    "dur": null
   }
  ]
 },
 "hits": [
  {
   "type": "radioTune",
   "beat": 0,
   "toBeat": 1.5,
   "note": "the sweep crosses 870 kHz and catches 0.5 s of the 1987 bootleg before settling on 1313"
  },
  {
   "type": "radioUp",
   "beat": 3,
   "note": "Granny turns the radio up: +6 dB, wider band; Lou comes in clear on bar 1"
  },
  {
   "type": "thunder",
   "beat": 10,
   "k": 0.5
  },
  {
   "type": "thunder",
   "beat": 26,
   "note": "into the silence after \"stop.\""
  },
  {
   "type": "organChoke",
   "beat": 24.5,
   "note": "organ drone and heartbeat stop dead on \"stop.\""
  },
  {
   "type": "countIn",
   "beat": 28,
   "toBeat": 32
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
   "type": "lick",
   "beat": 70,
   "who": "vex",
   "note": "megaphone feedback squeal on B4, beats 3-4 of bar 17"
  },
  {
   "type": "lick",
   "beat": 76,
   "who": "granny",
   "note": "16ths E5 G5 A5 Bb5 B5, pinch-harmonic dive bomb"
  },
  {
   "type": "pump",
   "beat": 79,
   "note": "Gerald's pump chk-chk"
  },
  {
   "type": "lick",
   "beat": 84,
   "who": "tiny",
   "note": "tom fill with baseball bats (wooden tock) into one crash"
  },
  {
   "type": "lick",
   "beat": 92,
   "who": "noodle",
   "note": "bass lick E2 G2 A2 B2, the B buzzing and sagging a quarter-tone (duct-taped neck)"
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
   "beat": 162.75,
   "note": "inside the STOPS gap: only the reload sounds"
  },
  {
   "type": "doorSlam",
   "beat": 192,
   "note": "the band stab on bar 48 is the slam"
  },
  {
   "type": "doorPound",
   "beat": 197,
   "toBeat": 216,
   "every": 2,
   "note": "the backbeat of the breakdown"
  },
  {
   "type": "pills",
   "beat": 198,
   "toBeat": 206,
   "note": "the pill bottle as a 16th-note shaker"
  },
  {
   "type": "musicBox",
   "beat": 192,
   "toBeat": 215,
   "note": "the hook at half speed"
  },
  {
   "type": "knock",
   "beat": 218
  },
  {
   "type": "knock",
   "beat": 219
  },
  {
   "type": "knock",
   "beat": 219.5
  },
  {
   "type": "knock",
   "beat": 220
  },
  {
   "type": "knock",
   "beat": 221
  },
  {
   "type": "tinyKnock",
   "beat": 223,
   "note": "Tiny answers the knock: two bits"
  },
  {
   "type": "doorBurst",
   "beat": 224
  },
  {
   "type": "sparks",
   "beat": 246,
   "note": "Noodle plugs in: ZZZAP, amp-on thunk, mains hum, 2 beats of B4 feedback swelling into the right guitar"
  },
  {
   "type": "crowdHuh",
   "beat": 263
  },
  {
   "type": "crowdHuh",
   "beat": 271
  },
  {
   "type": "crowdHuh",
   "beat": 279
  },
  {
   "type": "zombieHuh",
   "beat": 275
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
   "type": "phonesUp",
   "beat": 292.5,
   "note": "hundreds of phone screens light up on \"one...\""
  },
  {
   "type": "flashback",
   "beat": 294.25,
   "toBeat": 295,
   "note": "0.3 s of the 1987 bootleg: chord, ...MORE SONG!, fire roar, alarm bell; cut by a tape click as the reflection vanishes"
  },
  {
   "type": "genPull",
   "beat": 300,
   "pitch": "C3"
  },
  {
   "type": "genPull",
   "beat": 308,
   "pitch": "D3"
  },
  {
   "type": "genPull",
   "beat": 316,
   "pitch": "D#3"
  },
  {
   "type": "reverseBeep",
   "beat": 309
  },
  {
   "type": "reverseBeep",
   "beat": 310
  },
  {
   "type": "reverseBeep",
   "beat": 311
  },
  {
   "type": "roadieStinger",
   "beat": 312,
   "note": "detuned low brass cluster Bb1+E2, sub drop, stomp"
  },
  {
   "type": "stomp",
   "beat": 313
  },
  {
   "type": "stomp",
   "beat": 315
  },
  {
   "type": "genCatch",
   "beat": 324,
   "note": "locks into an E2 idle with an 8th-note chug"
  },
  {
   "type": "ampsOn",
   "beat": 326,
   "note": "click and hum; both guitars feed back up to E5 into the solo"
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
   "type": "curtainFire",
   "beat": 344,
   "toBeat": 360,
   "note": "the stage-left jet licks the curtain at bar 86; a small flame climbs it"
  },
  {
   "type": "frisbee",
   "beat": 354
  },
  {
   "type": "ding",
   "beat": 356,
   "pitch": "B5"
  },
  {
   "type": "roadieThud",
   "beat": 357
  },
  {
   "type": "bandHit",
   "beat": 360,
   "note": "B5 hit on beat 1, choked on beat 2; Lou in the hole"
  },
  {
   "type": "chopper",
   "beat": 360,
   "toBeat": 448,
   "note": "a 16th-note thup locked to the grid, low-passed; replaces the hats in the final chorus; muffled in the coda"
  },
  {
   "type": "fireworks",
   "beat": 375
  },
  {
   "type": "fireworks",
   "beat": 383
  },
  {
   "type": "fireworks",
   "beat": 391
  },
  {
   "type": "fireworks",
   "beat": 398
  },
  {
   "type": "fireworks",
   "beat": 399
  },
  {
   "type": "finalHit",
   "beat": 420
  },
  {
   "type": "burn",
   "beat": 422,
   "toBeat": 424,
   "note": "the freeze-frame burns like jammed film"
  },
  {
   "type": "thermalHum",
   "beat": 424,
   "toBeat": 448
  },
  {
   "type": "applause",
   "beat": 426,
   "toBeat": 447,
   "note": "real crowd applause and whistles, distant"
  },
  {
   "type": "hudChirp",
   "beat": 438,
   "note": "HEAT SIGNATURES 1,204 -> 1,205"
  },
  {
   "type": "musicBoxCoda",
   "beat": 440,
   "toBeat": 447.9,
   "note": "E minor; slows; the spring runs out with a click before STOPS"
  }
 ],
 "gaps": [
  {
   "fromBeat": 62.75,
   "toBeat": 64,
   "note": "after the crash: debris only"
  },
  {
   "fromBeat": 162.5,
   "toBeat": 163.5,
   "note": "ch1: the band stops on STOPS; only the reload"
  },
  {
   "fromBeat": 216.25,
   "toBeat": 218,
   "note": "safe room: everything stops; the handwriting line lands"
  },
  {
   "fromBeat": 221.25,
   "toBeat": 223,
   "note": "the pause before Tiny answers the knock"
  },
  {
   "fromBeat": 274.5,
   "toBeat": 275.5,
   "note": "ch2: the pit freezes mid-headbang; one zombie huh?"
  },
  {
   "fromBeat": 288,
   "toBeat": 296,
   "note": "blackout: room tone, two clicks, the groan, the 0.3 s flashback; no band"
  },
  {
   "fromBeat": 386.5,
   "toBeat": 387.5,
   "note": "ch3: only the chopper blades"
  },
  {
   "fromBeat": 422,
   "toBeat": 448,
   "note": "after the final hit has rung: no band; only the coda sounds"
  }
 ],
 "captions": [
  {
   "bar": 0,
   "beat": 1,
   "beats": 5,
   "who": "GRANNY",
   "text": "Turn it up. I'm old, not dead.",
   "pos": "auto"
  },
  {
   "bar": 12,
   "beat": 0,
   "beats": 3,
   "who": "VEX",
   "text": "We SOLD OUT!",
   "pos": "auto"
  },
  {
   "bar": 13,
   "beat": 0,
   "beats": 3,
   "who": "TINY",
   "text": "That's a horde.",
   "pos": "auto"
  },
  {
   "bar": 14,
   "beat": 2,
   "beats": 4,
   "who": "NOODLE",
   "text": "BRAKES! BRAKES! BRAKES!",
   "pos": "auto"
  },
  {
   "bar": 25,
   "beat": 0,
   "beats": 4,
   "who": "GRANNY",
   "text": "Good photo of me, though.",
   "pos": "auto"
  },
  {
   "bar": 31,
   "beat": 0,
   "beats": 4,
   "who": "GROUPIE",
   "text": "VEX!!! SIGN IT AGAIN!!!",
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
   "beat": 2.5,
   "beats": 3,
   "who": "GRANNY",
   "text": "Reloading, dear.",
   "pos": "auto"
  },
  {
   "bar": 44,
   "beat": 0,
   "beats": 4,
   "who": "VEX",
   "text": "Where's my click track?!",
   "pos": "auto"
  },
  {
   "bar": 45,
   "beat": 0,
   "beats": 4,
   "who": "TINY",
   "text": "I AM the click track.",
   "pos": "auto"
  },
  {
   "bar": 46,
   "beat": 1,
   "beats": 5,
   "who": "NOODLE",
   "text": "THE RED DOOR! GO!",
   "pos": "auto"
  },
  {
   "bar": 49,
   "beat": 1,
   "beats": 3,
   "who": "GRANNY",
   "text": "Ooh. Mints.",
   "pos": "auto"
  },
  {
   "bar": 50,
   "beat": 0,
   "beats": 4,
   "who": "TINY",
   "text": "Those are my heart pills.",
   "pos": "auto"
  },
  {
   "bar": 51,
   "beat": 0,
   "beats": 3,
   "who": "GRANNY",
   "text": "Not anymore.",
   "pos": "auto"
  },
  {
   "bar": 53,
   "beat": 0,
   "beats": 4,
   "who": "NOODLE",
   "text": "Guys... who's been counting?",
   "pos": "auto"
  },
  {
   "bar": 54,
   "beat": 0,
   "beats": 5,
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
   "beats": 4,
   "who": "GRANNY",
   "text": "So are we, dear.",
   "pos": "auto"
  },
  {
   "bar": 64,
   "beat": 2,
   "beats": 4,
   "who": "TINY",
   "text": "They know the words.",
   "pos": "auto"
  },
  {
   "bar": 70,
   "beat": 2,
   "beats": 3,
   "who": "VEX",
   "text": "They LOVE me.",
   "pos": "auto"
  },
  {
   "bar": 72,
   "beat": 1,
   "beats": 3,
   "who": "NOODLE",
   "text": "Who unplugged the—",
   "pos": "auto"
  },
  {
   "bar": 74,
   "beat": 0,
   "beats": 2,
   "who": "NOODLE",
   "text": "Guys, the mirror—",
   "pos": "auto"
  },
  {
   "bar": 77,
   "beat": 0,
   "beats": 4,
   "who": "NOODLE",
   "text": "It's ALWAYS two minutes!",
   "pos": "auto"
  },
  {
   "bar": 80,
   "beat": 3,
   "beats": 3,
   "who": "GRANNY",
   "text": "Stop choking, sweetie.",
   "pos": "auto"
  },
  {
   "bar": 82,
   "beat": 0,
   "beats": 3,
   "who": "GRANNY",
   "text": "My turn.",
   "pos": "auto"
  },
  {
   "bar": 86,
   "beat": 0,
   "beats": 3,
   "who": "VEX",
   "text": "That's MY move!",
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
   "bar": 89,
   "beat": 2,
   "beats": 2,
   "who": "NOODLE",
   "text": "Is the curtain supposed to—",
   "pos": "auto"
  },
  {
   "bar": 93,
   "beat": 0,
   "beats": 4,
   "who": "NOODLE",
   "text": "We're actually getting out?!",
   "pos": "auto"
  },
  {
   "bar": 94,
   "beat": 3,
   "beats": 5,
   "who": "GRANNY",
   "text": "Same chopper as last night.",
   "pos": "auto"
  },
  {
   "bar": 96,
   "beat": 2.75,
   "beats": 4,
   "who": "NOODLE",
   "text": "There was a LAST night?",
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
   "side": "right",
   "name": "VEX",
   "role": "VOCALS",
   "line": "Hair: immortal."
  },
  {
   "type": "intro",
   "bar": 18,
   "beat": 0,
   "beats": 8,
   "who": "GRANNY",
   "side": "left",
   "name": "GRANNY GLOOM",
   "role": "LEAD GUITAR",
   "line": "71 for years now. Shotgun: Gerald."
  },
  {
   "type": "intro",
   "bar": 20,
   "beat": 0,
   "beats": 8,
   "who": "TINY",
   "side": "right",
   "name": "TINY",
   "role": "DRUMS & PYRO",
   "line": "Isn't."
  },
  {
   "type": "intro",
   "bar": 22,
   "beat": 0,
   "beats": 8,
   "who": "NOODLE",
   "side": "left",
   "name": "NOODLE",
   "role": "BASS",
   "line": "Joined for the dental plan."
  },
  {
   "type": "chapter",
   "bar": 24,
   "beat": 0,
   "beats": 4,
   "n": "ACT ONE",
   "title": "THE STREETS"
  },
  {
   "type": "special",
   "bar": 28,
   "beat": 3,
   "beats": 5,
   "name": "THE GROUPIE",
   "line": "Biggest fan. No eye contact."
  },
  {
   "type": "warning",
   "bar": 32,
   "beat": 0,
   "beats": 6,
   "text": "SOLD OUT",
   "style": "stamp"
  },
  {
   "type": "chapter",
   "bar": 48,
   "beat": 0,
   "beats": 4,
   "n": "INTERMISSION",
   "title": "THE SAFE ROOM"
  },
  {
   "type": "chapter",
   "bar": 56,
   "beat": 0,
   "beats": 4,
   "n": "ACT TWO",
   "title": "THE ORPHEUM"
  },
  {
   "type": "special",
   "bar": 78,
   "beat": 0,
   "beats": 5,
   "name": "THE ROADIE",
   "line": "All access. Cargo shorts. No mercy."
  },
  {
   "type": "chapter",
   "bar": 91,
   "beat": 0,
   "beats": 4,
   "n": "ENCORE",
   "title": "THE ROOF"
  },
  {
   "type": "end",
   "bar": 110,
   "beat": 0,
   "beats": 8,
   "stagger": 4,
   "lines": [
    "NIGHT {night} · NO SURVIVORS",
    "NIGHT {next} BEGINS IN {countdown}"
   ]
  }
 ],
 "clues": [
  {
   "id": "lou",
   "hub": "who",
   "bar": 1.5,
   "hold": [
    1,
    2.75
   ],
   "shot": "van",
   "title": "1313 AM",
   "note": "who is LOU?"
  },
  {
   "id": "clock",
   "hub": "when",
   "bar": 3.25,
   "hold": [
    2.75,
    4.25
   ],
   "shot": "van",
   "title": "Every clock says 3:00",
   "note": "none of them tick. 3:00... or an L?"
  },
  {
   "id": "missing",
   "hub": "when",
   "bar": 25,
   "hold": [
    24.5,
    26.5
   ],
   "shot": "street",
   "title": "MISSING since 1987",
   "note": "Granny hasn't aged a day. LOU PRESENTS?"
  },
  {
   "id": "groupie",
   "hub": "crowd",
   "bar": 29.5,
   "hold": [
    29,
    30.5
   ],
   "shot": "street",
   "title": "The alley",
   "note": "candles. flowers. their photo."
  },
  {
   "id": "tally",
   "hub": "who",
   "bar": 53.5,
   "hold": [
    53,
    54
   ],
   "shot": "saferoom",
   "title": "Who has been counting?",
   "note": "{prev} nights. same as night 1."
  },
  {
   "id": "handwriting",
   "hub": "who",
   "bar": 54.5,
   "hold": [
    54,
    55.5
   ],
   "shot": "saferoom",
   "title": "VEX WAS HERE",
   "note": "his handwriting. he doesn't remember. LOU LIES?"
  },
  {
   "id": "condemned",
   "hub": "when",
   "bar": 58.5,
   "hold": [
    58,
    59.5
   ],
   "shot": "orpheum",
   "title": "CONDEMNED · FIRE · 3:00 AM",
   "note": "31 OCT 1987. same minute as the clocks."
  },
  {
   "id": "wristband",
   "hub": "crowd",
   "bar": 66,
   "hold": [
    65.5,
    66.75
   ],
   "shot": "stage",
   "title": "ADMIT ONE",
   "note": "zombies don't buy tickets."
  },
  {
   "id": "setlist",
   "hub": "when",
   "bar": 67.5,
   "hold": [
    67,
    68.25
   ],
   "shot": "stage",
   "title": "The setlist",
   "note": "first things first.",
   "board": "card"
  },
  {
   "id": "mirror",
   "hub": "when",
   "bar": 73.55,
   "hold": [
    73.375,
    73.75
   ],
   "shot": "blackout",
   "title": "In the mirror",
   "note": "that's Granny's beehive."
  },
  {
   "id": "chopper",
   "hub": "who",
   "bar": 94,
   "hold": [
    93.5,
    94.75
   ],
   "shot": "rooftop",
   "title": "Same chopper as last night",
   "note": "rescue is always two minutes out.",
   "reply": {
    "who": "GRANNY",
    "text": "every night, sweetie."
   }
  },
  {
   "id": "thermal",
   "hub": "crowd",
   "bar": 108.5,
   "hold": [
    106.5,
    111
   ],
   "shot": "thermal",
   "title": "Thermal",
   "note": "1,204 warm. 4 cold."
  },
  {
   "id": "wave",
   "hub": "crowd",
   "bar": 109.75,
   "hold": [
    109.5,
    110.5
   ],
   "shot": "thermal",
   "title": "...is that ME?",
   "note": "is that ME?",
   "witching": true
  }
 ],
 "board": {
  "title": "THINGS THAT DON'T ADD UP",
  "voice": "one fan, lowercase marker, calls the band \"they\"; observations and questions, never answers",
  "hubs": [
   {
    "id": "when",
    "q": "WHAT HAPPENED AT 3:00 AM?"
   },
   {
    "id": "crowd",
    "q": "WHO'S IN THE CROWD?"
   },
   {
    "id": "who",
    "q": "WHO BOOKED THIS GIG?"
   }
  ],
  "strings": [
   {
    "a": "clock",
    "b": "lou",
    "label": "3:00... or an L?"
   },
   {
    "a": "condemned",
    "b": "contract",
    "label": "3:00 AM / 2:59 AM"
   },
   {
    "a": "wristband",
    "b": "ticket",
    "label": "same purple"
   },
   {
    "a": "thermal",
    "b": "ticket",
    "label": "1,204 / No. 1,205"
   },
   {
    "a": "handwriting",
    "b": "contract",
    "label": "LOU LIES / UNTIL THE MUSIC STOPS"
   }
  ]
 },
 "contract": {
  "head": "ENGAGEMENT AGREEMENT",
  "lines": [
   "PROMOTER: [mark]",
   "ARTIST: NO SURVIVORS (4 PIECE)",
   "VENUE: THE ORPHEUM",
   "SHOWS: NIGHTLY · DOORS 3:00 AM",
   "TERM: UNTIL THE MUSIC STOPS",
   "FEE: ONE MORE ░░░░",
   "SIGNED 31 OCT 1987 · 2:59 AM"
  ],
  "sign": [
   "Vex",
   "G. Gloom",
   "Tiny",
   "Noodle"
  ],
  "witchingLine": "______________ (+1)"
 },
 "ticket": {
  "lines": [
   "ADMIT ONE · No. 1,205",
   "NO SURVIVORS · THE ORPHEUM",
   "NIGHT {next} · DOORS 3:00 AM",
   "{countdown}"
  ],
  "witchingStamp": "YOU CAME BACK"
 },
 "numbers": {
  "capacity": 1204,
  "ticket": 1205,
  "station": 1313,
  "tape": 1204,
  "numbers": 1031,
  "bleed": 870,
  "note": "1,204 = the notice capacity = the thermal HEAT SIGNATURES = the 1987 tape station; 1,205 = the ticket = the +1 at the end"
 },
 "texts": {
  "gate": {
   "normal": "NIGHT {night} · RECORDED 3:00 AM · NEXT DOORS IN {countdown}",
   "witching": "NIGHT {night} · LIVE NOW · DOORS ARE OPEN"
  },
  "condemned": [
   "CONDEMNED",
   "FIRE · 31 OCT 1987 · 3:00 AM",
   "UNSAFE STRUCTURE · CAPACITY 1,204 · NO ADMITTANCE",
   "BY ORDER OF THE CITY"
  ],
  "missing": [
   "MISSING",
   "SINCE 1987",
   "LAST SEEN: THE ORPHEUM"
  ],
  "gigPoster": [
   "LAST CALL LOU PRESENTS",
   "NO SURVIVORS",
   "THE ORPHEUM",
   "FRI 30 OCT 1987 · ONE NIGHT ONLY",
   "LIVE ON 1313 AM"
  ],
  "wristband": "ADMIT ONE",
  "stageDoor": "STAGE DOOR",
  "vigilSign": "ONE MORE SONG",
  "groupieShirt": "NO SURVIVORS · THE ORPHEUM · OCT '87",
  "pillLabel": "TINY · HEART · 1 DAILY",
  "graffiti": [
   {
    "text": "THEY DON'T BITE.",
    "who": "NOODLE",
    "clue": true
   },
   {
    "text": "THEY CLAP.",
    "who": "TINY",
    "clue": true
   },
   {
    "text": "NIGHT {prev}: SAME AS NIGHT 1",
    "who": "NOODLE",
    "clue": true
   },
   {
    "text": "VEX WAS HERE ★",
    "who": "VEX",
    "clue": true,
    "signature": true
   },
   {
    "text": "DON'T STOP PLAYING",
    "who": "VEX",
    "clue": true
   },
   {
    "text": "LOU LIES",
    "who": "GRANNY",
    "clue": true
   },
   {
    "text": "FREE MINTS →",
    "who": "GRANNY"
   },
   {
    "text": "TINY — TAKE YOUR PILLS ♥ — TINY",
    "who": "TINY"
   },
   {
    "text": "CHOKE IS ON THE LEFT, NOODLE",
    "who": "GRANNY"
   },
   {
    "text": "\"TWO MINUTES\" MY FOOT",
    "who": "GRANNY"
   },
   {
    "text": "SHE JUST WANTS AN AUTOGRAPH",
    "who": "TINY"
   },
   {
    "text": "NO MORE ENCORES!!",
    "who": "NOODLE",
    "struck": true
   },
   {
    "text": "ONE MORE SONG ★",
    "who": "VEX"
   }
  ],
  "thermalHud": {
   "tl": "● REC  CAM 1",
   "tr": "03:00:00",
   "bl": "HEAT SIGNATURES {heat}",
   "br": "LADDER 0"
  },
  "odometer": "rolls from {prev} to {night} on bar 3 (\"Full house again\")"
 },
 "setlist": {
  "header": "NO SURVIVORS · THE ORPHEUM · FRI 30 OCT '87",
  "songs": [
   "Horde Call",
   "Eat Your Heart Out",
   "Last Call Lou",
   "Pyro Party",
   "Up in Smoke",
   "Same Time Tomorrow"
  ],
  "encore": "Keep Them Dancing",
  "acrostic": "HELPUS",
  "note": "taped by the mic stand, in Vex's handwriting; bottom edge charred; encore underlined twice; never highlight the acrostic"
 },
 "radio": [
  {
   "id": "bleed",
   "freq": 870,
   "voice": "song",
   "loop": true,
   "text": "the 1987 audience bootleg of this chorus (DEAD MEAT lyric, E minor): mono cassette, wow, flutter, hiss, the crowd yelling ONE MORE SONG between lines, a fire-alarm bell from its 6th second, feedback, tape cut"
  },
  {
   "id": "numbers",
   "freq": 1031,
   "voice": "numbers",
   "loop": true,
   "text": "one. zero. three. one. one. nine. eight. seven. zero. three. zero. zero."
  },
  {
   "id": "tape",
   "freq": 1204,
   "voice": "tape1987",
   "loop": true,
   "reversed": true,
   "text": "One more, kids. Keep them dancing. I'll take care of the doors.",
   "bed": "fire bell ringing; the crowd chanting ONE MORE SONG; the band's last chord",
   "note": "Lou dry and close to the mic (not band-passed): the only time he is not on the radio. Stored forwards; the board plays it reversed by default and its reverse button plays it forwards"
  },
  {
   "id": "lou",
   "freq": 1313,
   "voice": "lou",
   "text": "You're still listening. Good. Doors at three, kid. Bring a friend."
  },
  {
   "id": "lou3am",
   "freq": 1313,
   "voice": "lou",
   "witching": true,
   "text": "You came back. They always come back. Doors are open, kid."
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
    "type": "cut"
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
    "type": "burn",
    "beats": 2
   }
  }
 ],
 "warning": {
  "text": "Flashing lights: muzzle flashes, lightning and stage lights.",
  "reduce": "Reduce flashing"
 },
 "composerTodo": "Fill chords, bass, riffs, arrangement, drums; finalise every vocals.lines[].notes (seeded from the critique; adjust freely but keep words aligned) and document every key you add under \"notes\". Delete this key when done."
};
