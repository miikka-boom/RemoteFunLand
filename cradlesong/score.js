// CRADLESONG teaser trailer: the one timeline everything follows.
// The page draws its shots, cards and subtitles from it, and tools/cradlesong_audio.py renders
// the soundtrack (cradlesong.mp3) from the same cues, so a hit in "cues" is a hit on a cut.
// The object below is strict JSON (the audio tool parses it), so no comments inside it.
//
// Times are seconds from the start of the trailer.
// phrases: [note, beats] in 3/4. "A2" is the take on Mum's tape, which stops a few beats short
// of the end; "B" is the ending nobody has heard, which the dead hum; "END" is the last note.
// hums: who hums which phrases, from when, at what tempo; "cut" stops a take dead (the tape).
window.SCORE = {
  "title": "Cradlesong",
  "duration": 145.0,
  "phrases": {
    "A":   [["A4", 2], ["F4", 1], ["D4", 1.5], ["E4", 0.5], ["F4", 1], ["G4", 2], ["F4", 1], ["E4", 3]],
    "A2":  [["A4", 2], ["F4", 1], ["D4", 1.5], ["E4", 0.5], ["F4", 1], ["Bb4", 2], ["A4", 1], ["G4", 1], ["F4", 1], ["E4", 1]],
    "B":   [["A4", 2], ["C5", 1], ["D5", 2], ["C5", 1], ["Bb4", 1], ["A4", 1], ["G4", 1], ["F4", 1], ["E4", 1], ["C#4", 3]],
    "END": [["D4", 3]]
  },
  "hums": [
    { "id": "tape1",  "who": "tape",   "phrases": ["A", "A2"], "t": 2.4,   "bpm": 72, "cut": 22.05 },
    { "id": "dead1",  "who": "dead",   "phrases": ["A"],       "t": 54.0,  "bpm": 72 },
    { "id": "tape2",  "who": "tape",   "phrases": ["A2"],      "t": 108.6, "bpm": 72, "fromBeat": 6, "cut": 113.25 },
    { "id": "dead2",  "who": "choir",  "phrases": ["B"],       "t": 114.6, "bpm": 60, "cut": 128.6 },
    { "id": "mara",   "who": "mara",   "phrases": ["END"],     "t": 136.9, "bpm": 66 }
  ],
  "shots": [
    { "id": "black",     "t0": 0.0,   "t1": 1.6 },
    { "id": "cassette",  "t0": 1.6,   "t1": 7.6,   "in": "fade", "inDur": 0.45 },
    { "id": "bedroom",   "t0": 7.6,   "t1": 22.05, "in": "dissolve", "inDur": 1.4 },
    { "id": "cassette2", "t0": 22.05, "t1": 25.2 },
    { "id": "bedroom2",  "t0": 25.2,  "t1": 29.4 },
    { "id": "house",     "t0": 29.4,  "t1": 40.0,  "in": "fade", "inDur": 1.2 },
    { "id": "black",     "t0": 40.0,  "t1": 40.6 },
    { "id": "card",      "t0": 40.6,  "t1": 45.0,  "lines": ["ON THE NINTH DAY", "THE DEAD STOPPED SCREAMING."] },
    { "id": "street",    "t0": 45.0,  "t1": 50.4,  "in": "fade", "inDur": 0.8 },
    { "id": "card",      "t0": 50.4,  "t1": 53.8,  "lines": ["ON THE THIRTIETH", "THEY STARTED TO HUM."] },
    { "id": "crowd",     "t0": 53.8,  "t1": 59.2,  "in": "fade", "inDur": 1.0 },
    { "id": "profile",   "t0": 59.2,  "t1": 64.0,  "in": "dissolve", "inDur": 0.9 },
    { "id": "tv",        "t0": 64.0,  "t1": 77.2 },
    { "id": "tapehand",  "t0": 77.2,  "t1": 80.4 },
    { "id": "card",      "t0": 80.4,  "t1": 83.6,  "lines": ["NO ONE ELSE KNOWS IT."] },
    { "id": "window",    "t0": 83.6,  "t1": 86.6 },
    { "id": "hallway",   "t0": 86.6,  "t1": 92.0 },
    { "id": "card",      "t0": 92.0,  "t1": 94.6,  "lines": ["THEY’RE NOT HUNTING US."] },
    { "id": "aerial",    "t0": 94.6,  "t1": 98.6,  "in": "fade", "inDur": 0.6 },
    { "id": "card",      "t0": 98.6,  "t1": 100.6, "lines": ["THEY’RE LISTENING."] },
    { "id": "mdoor",     "t0": 100.6, "t1": 101.5 },
    { "id": "mheads",    "t0": 101.5, "t1": 102.4 },
    { "id": "mhand",     "t0": 102.4, "t1": 103.2 },
    { "id": "mwren",     "t0": 103.2, "t1": 104.0 },
    { "id": "mtorch",    "t0": 104.0, "t1": 104.8 },
    { "id": "mfield",    "t0": 104.8, "t1": 106.0 },
    { "id": "black",     "t0": 106.0, "t1": 108.0 },
    { "id": "led",       "t0": 108.0, "t1": 113.9 },
    { "id": "final",     "t0": 113.9, "t1": 128.6, "in": "fade", "inDur": 1.6 },
    { "id": "title",     "t0": 128.6, "t1": 134.4 },
    { "id": "black",     "t0": 134.4, "t1": 135.8 },
    { "id": "stinger",   "t0": 135.8, "t1": 140.4, "in": "fade", "inDur": 0.9 },
    { "id": "endcard",   "t0": 140.4, "t1": 145.0 }
  ],
  "subs": [
    { "t0": 23.0,  "t1": 25.3,  "text": "Why does it always stop there?" },
    { "t0": 26.0,  "t1": 28.9,  "text": "Mum never finished it." },
    { "t0": 77.6,  "t1": 80.2,  "text": "That’s Wren’s song." },
    { "t0": 118.6, "t1": 122.6, "text": "Dad… they know how it ends." }
  ],
  "broadcast": {
    "lines": [
      { "t": 66.0, "say": "This is an emergency broadcast.",           "show": ["THIS IS AN", "EMERGENCY BROADCAST"] },
      { "t": 68.5, "say": "The infected are humming the same melody.", "show": ["THE INFECTED ARE HUMMING", "THE SAME MELODY"] },
      { "t": 71.6, "say": "Its source is unknown.",                    "show": ["ITS SOURCE", "IS UNKNOWN"] },
      { "t": 73.5, "say": "Do not sing it.",                           "show": ["DO NOT SING IT"] },
      { "t": 74.9, "say": "Do not let your children hear it.",         "show": ["DO NOT LET YOUR", "CHILDREN HEAR IT"] }
    ]
  },
  "lightning": [85.2, 104.85],
  "cues": [
    { "t": 0.0,    "type": "rain_in",   "until": 29.4 },
    { "t": 1.6,    "type": "tape_play" },
    { "t": 22.05,  "type": "tape_stop" },
    { "t": 29.4,   "type": "outdoor",   "until": 40.0 },
    { "t": 30.0,   "type": "drone_low", "until": 40.0 },
    { "t": 38.3,   "type": "thump" },
    { "t": 40.6,   "type": "boom",      "size": 0.8 },
    { "t": 45.0,   "type": "street",    "until": 50.4 },
    { "t": 50.4,   "type": "boom",      "size": 0.55 },
    { "t": 53.8,   "type": "wind",      "until": 64.0 },
    { "t": 53.8,   "type": "drone_mid", "until": 64.4 },
    { "t": 64.0,   "type": "alert" },
    { "t": 66.0,   "type": "broadcast" },
    { "t": 77.2,   "type": "tv_off" },
    { "t": 80.4,   "type": "boom",      "size": 1.0 },
    { "t": 83.6,   "type": "heartbeat", "until": 100.6, "bpm0": 58, "bpm1": 104 },
    { "t": 83.6,   "type": "rain_glass","until": 86.6 },
    { "t": 85.2,   "type": "thunder",   "hit": true },
    { "t": 86.6,   "type": "torch_on" },
    { "t": 86.6,   "type": "breath",    "until": 92.0 },
    { "t": 87.5,   "type": "creak" },
    { "t": 88.7,   "type": "creak" },
    { "t": 89.0,   "type": "flicker",   "until": 89.5 },
    { "t": 89.5,   "type": "hit",       "size": 1.0 },
    { "t": 89.5,   "type": "close_hum", "until": 91.0 },
    { "t": 91.0,   "type": "flicker",   "until": 91.35 },
    { "t": 92.0,   "type": "drone_low", "until": 94.6 },
    { "t": 94.6,   "type": "riser",     "until": 106.0 },
    { "t": 98.6,   "type": "boom",      "size": 0.9 },
    { "t": 100.6,  "type": "hit",       "size": 0.8, "foley": "door" },
    { "t": 101.5,  "type": "hit",       "size": 0.8, "foley": "snap" },
    { "t": 102.4,  "type": "hit",       "size": 0.85, "foley": "splinter" },
    { "t": 103.2,  "type": "hit",       "size": 0.85, "foley": "none" },
    { "t": 104.0,  "type": "hit",       "size": 0.9, "foley": "clatter" },
    { "t": 104.85, "type": "thunder",   "hit": true },
    { "t": 106.0,  "type": "silence" },
    { "t": 108.0,  "type": "tape_play" },
    { "t": 113.25, "type": "tape_stop" },
    { "t": 113.9,  "type": "night",     "until": 128.6 },
    { "t": 127.1,  "type": "swell",     "until": 128.6 },
    { "t": 128.6,  "type": "title" },
    { "t": 136.4,  "type": "breath_in" },
    { "t": 140.4,  "type": "low_end" }
  ]
};
