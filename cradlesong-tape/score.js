// CRADLESONG: TAPE 3, the found-footage teaser. The one timeline everything follows: the page draws
// its shots, camcorder overlay and subtitles from it, and tools/cradlesong_tape_audio.py renders the
// soundtrack (cradlesong-tape.mp3) from the same cues. Strict JSON inside (the audio tool parses it).
//
// Times are seconds from the start. "clock" is the camcorder's time stamp (seconds after midnight)
// at the start of a shot, "counter" the tape counter; both run on from there.
// phrases are the lullaby from the first teaser: [note, beats] in 3/4.
window.SCORE = {
  "title": "Cradlesong: Tape 3",
  "duration": 71.0,
  "date": "NOV 21 1998",
  "phrases": {
    "A":   [["A4", 2], ["F4", 1], ["D4", 1.5], ["E4", 0.5], ["F4", 1], ["G4", 2], ["F4", 1], ["E4", 3]],
    "B":   [["A4", 2], ["C5", 1], ["D5", 2], ["C5", 1], ["Bb4", 1], ["A4", 1], ["G4", 1], ["F4", 1], ["E4", 1], ["C#4", 3]],
    "END": [["D4", 3]]
  },
  "hums": [
    { "id": "deadfar",  "who": "deadfar",  "phrases": ["A"],   "t": 17.0, "bpm": 72, "cut": 26.0 },
    { "id": "wren",     "who": "child",    "phrases": ["B"],   "t": 27.2, "bpm": 60, "cut": 39.6 },
    { "id": "deadjoin", "who": "deadjoin", "phrases": ["B"],   "t": 30.2, "bpm": 60, "fromBeat": 3, "cut": 39.6 },
    { "id": "mara",     "who": "mara",     "phrases": ["END"], "t": 57.6, "bpm": 66 }
  ],
  "shots": [
    { "id": "card",   "t0": 0.0,  "t1": 7.6 },
    { "id": "vcr",    "t0": 7.6,  "t1": 9.0,  "label": "PLAY" },
    { "id": "window", "t0": 9.0,  "t1": 26.0, "clock": 11824, "counter": 726 },
    { "id": "glitch", "t0": 26.0, "t1": 26.6 },
    { "id": "wren",   "t0": 26.6, "t1": 42.0, "clock": 13312, "counter": 881 },
    { "id": "glitch", "t0": 42.0, "t1": 42.4 },
    { "id": "frag1",  "t0": 42.4, "t1": 43.3, "clock": 14530, "counter": 1063 },
    { "id": "frag2",  "t0": 43.3, "t1": 44.2, "clock": 14551, "counter": 1084 },
    { "id": "frag3",  "t0": 44.2, "t1": 45.1, "clock": 14567, "counter": 1100 },
    { "id": "field",  "t0": 45.1, "t1": 54.6, "clock": 14585, "counter": 1118 },
    { "id": "drop",   "t0": 54.6, "t1": 55.6, "clock": 14594.5, "counter": 1127.5 },
    { "id": "floor",  "t0": 55.6, "t1": 60.6, "clock": 14595.5, "counter": 1128.5 },
    { "id": "static", "t0": 60.6, "t1": 61.4 },
    { "id": "vcr",    "t0": 61.4, "t1": 62.8, "label": "STOP" },
    { "id": "title",  "t0": 62.8, "t1": 71.0 }
  ],
  "card": [
    { "t": 0.6, "text": "The following tape was recovered from a farmhouse" },
    { "t": 2.2, "text": "on the forty-third day." },
    { "t": 4.3, "text": "No one was found inside." }
  ],
  "subs": [
    { "t0": 10.2, "t1": 12.2, "text": "Day forty-two.", "say": "Day forty two." },
    { "t0": 14.6, "t1": 16.4, "text": "They came back.", "say": "They came back." },
    { "t0": 29.4, "t1": 30.7, "text": "Wren?", "say": "Ren?" },
    { "t0": 34.2, "t1": 36.8, "text": "Who taught you that part?", "say": "Who taught you that part?" },
    { "t0": 46.4, "t1": 47.8, "text": "Wren…", "say": "Ren." }
  ],
  "cuts": [26.0, 26.6, 42.0, 42.4, 43.3, 44.2, 45.1, 60.6, 61.4, 62.8],
  "cues": [
    { "t": 7.6,  "type": "vcr_play" },
    { "t": 8.35, "type": "tracking", "until": 9.0 },
    { "t": 9.0,  "type": "house",    "until": 26.0 },
    { "t": 9.0,  "type": "handle",   "at": [0.25, 3.8, 4.6, 8.2, 12.0] },
    { "t": 22.8, "type": "jolt" },
    { "t": 26.0, "type": "glitch",   "until": 26.6 },
    { "t": 26.6, "type": "room",     "until": 42.0 },
    { "t": 26.6, "type": "handle",   "at": [0.3, 6.5] },
    { "t": 40.3, "type": "creak" },
    { "t": 42.0, "type": "glitch",   "until": 42.4 },
    { "t": 42.4, "type": "run",      "until": 45.1 },
    { "t": 43.3, "type": "glitch",   "until": 43.42 },
    { "t": 44.2, "type": "glitch",   "until": 44.32 },
    { "t": 45.1, "type": "outside",  "until": 54.6 },
    { "t": 45.1, "type": "panic",    "until": 53.3 },
    { "t": 45.1, "type": "handle",   "at": [0.2, 2.9, 4.4] },
    { "t": 53.4, "type": "turn" },
    { "t": 54.6, "type": "drop",     "impact": 55.5 },
    { "t": 55.6, "type": "floor",    "until": 60.6 },
    { "t": 56.1, "type": "step" },
    { "t": 56.55, "type": "step" },
    { "t": 57.0, "type": "step" },
    { "t": 57.2, "type": "rustle" },
    { "t": 59.35, "type": "cover" },
    { "t": 60.6, "type": "static",   "until": 61.4 },
    { "t": 61.4, "type": "vcr_stop" },
    { "t": 63.0, "type": "title" }
  ]
};
