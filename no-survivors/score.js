// NO SURVIVORS: Keep Them Dancing. The single source of truth for timing, read by the page
// (window.SCORE) and by the soundtrack synth (tools/no_survivors_audio.py).
// Format: these // comment lines, then ONE line that assigns the JSON object to window.SCORE, then a final ";".
// Parse it (Python): i = s.index("{", s.index("\nwindow.SCORE")); obj = json.loads(s[i : s.rindex(";")]).
// Write it back as that same assignment line + json.dumps(obj, indent=1, ensure_ascii=False) + ";" (any valid JSON).
//
// 150 BPM, 4/4, 112 bars = 179.2 s (+0.8 s room tone: the audio is 180.0 s). One beat 0.4 s, one bar
// 1.6 s, one 16th step 0.1 s. Bars count from 0; "bars": [a, b] are half-open. A "beat" in hits, gaps and
// spoken[].win is a global beat index (bar * 4 + beat in bar). Steps in words/notes are 16ths from the line's
// bar. Per-bar arrays (energy, chords, bass, each drum lane) have 112 entries. Strings may contain the tokens
// {night} {prev} {next} {countdown} (NS.fill). Every on-screen string has exactly one source key.
// The musical keys (chords, bass, riffs, arrangement, drums, perc, vocals notes) are documented in SCORE.notes.
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
   "bars": [0, 8],
   "label": "Cold open",
   "role": "rain, radio, Lou in four phrases; organ drone + heartbeat choke on \"stop.\"; thunder; Tiny counts in on bar 7"
  },
  {
   "id": "intro",
   "bars": [8, 16],
   "label": "Intro",
   "role": "main riff x2 (its stabs are the hook rhythm), title smash; skid and crash on bar 15"
  },
  {
   "id": "verse1a",
   "bars": [16, 24],
   "label": "The band",
   "role": "verse riff; gang shouts each name on its downbeat; a signature lick per member in the 2nd bar"
  },
  {
   "id": "verse1b",
   "bars": [24, 32],
   "label": "Verse 1",
   "role": "verse 1 vocals; the Groupie; stop-time on bar 30, shriek on 31"
  },
  {
   "id": "pre1",
   "bars": [32, 36],
   "label": "Pre-chorus",
   "role": "call and response HERE THEY COME; roots climb A-Bb-B under one sung B3"
  },
  {
   "id": "chorus1",
   "bars": [36, 44],
   "label": "Chorus",
   "role": "chorus 1: the horde; the band stops dead on STOPS (bar 40)"
  },
  {
   "id": "post1",
   "bars": [44, 48],
   "label": "Riff",
   "role": "main riff; the band stab on bar 48 IS the door slam"
  },
  {
   "id": "saferoom",
   "bars": [48, 56],
   "label": "Intermission",
   "role": "breakdown: clean arpeggios, heartbeat, the pounding door as backbeat, music box; all stops at bar 54; the knock gag"
  },
  {
   "id": "verse2",
   "bars": [56, 64],
   "label": "Verse 2",
   "role": "verse 2 half-time, heard from outside; v2c-v2d sung dry (no megaphone); Noodle plugs in at 61.5"
  },
  {
   "id": "chorus2",
   "bars": [64, 72],
   "label": "Chorus",
   "role": "chorus 2 on stage; the pit grunts HUH!; stop on STOPS (bar 68); tape stop at 71.5"
  },
  {
   "id": "blackout",
   "bars": [72, 74],
   "label": "Blackout",
   "role": "silence: clicks, phones, the groan, the mirror and a 0.3 s 1987 flashback"
  },
  {
   "id": "crescendo",
   "bars": [74, 82],
   "label": "Crescendo",
   "role": "acoustic only (no power): toms, bats on road cases, crowd stomps, chant; tuned generator pulls; the Roadie; catch on bar 81"
  },
  {
   "id": "solo",
   "bars": [82, 90],
   "label": "Solo",
   "role": "Granny's solo over the riff; pyro; double kick from 86; the DING harmonises with her held B"
  },
  {
   "id": "lift",
   "bars": [90, 92],
   "label": "Lift",
   "role": "band hit and choke; Lou; EVERYBODY UP! and the whole-tone lift"
  },
  {
   "id": "chorus3",
   "bars": [92, 104],
   "label": "Final chorus",
   "role": "final chorus in F# minor; stop on STOPS (bar 96); call and response ONE MORE SONG? / HOW MANY MORE?"
  },
  {
   "id": "ending",
   "bars": [104, 106],
   "label": "Ending",
   "role": "F#5 tremolo and drum roll, GOOD NIGHT!, final hit on bar 105, the picture burns"
  },
  {
   "id": "coda",
   "bars": [106, 112],
   "label": "Coda",
   "role": "thermal: hum, muffled blades, a fan shouts, Lou signs off, the music box runs down before STOPS"
  }
 ],
 "energy": [
  0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.08, 0.3, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.88, 0.95, 0.62, 0.62, 0.62, 0.62,
  0.62, 0.62, 0.62, 0.62, 0.66, 0.66, 0.66, 0.66, 0.66, 0.66, 0.6, 0.76, 0.74, 0.78, 0.84, 0.88, 0.92, 0.92, 0.92,
  0.92, 0.92, 0.92, 0.92, 0.92, 0.82, 0.82, 0.82, 0.82, 0.3, 0.22, 0.24, 0.24, 0.27, 0.3, 0.12, 0.14, 0.55, 0.55,
  0.55, 0.55, 0.55, 0.55, 0.72, 0.74, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.0, 0.0, 0.3, 0.38, 0.46, 0.54,
  0.62, 0.7, 0.78, 0.88, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.7, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
  0.72, 1.0, 0.76, 1.0, 0.95, 0.6, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06
 ],
 "chords": [
  "Em", "Em", "Em", "Em", "Cmaj7/E", "Cmaj7/E", null, null, "E5", "E5", "E5", "E5", "E5", "E5", "C5", "B5", "E5",
  "E5", "G5", "G5", "A5", "A5", "C5", "D5", "Em", "Em", "C", "D", "Em", "Em", "C", "B5", "A5", "Bb5", "B5", "B5",
  "C5", "D5", "Em", "Em", ["C5", "D5"], "D5", "B5", "B7", "E5", "E5", "E5", ["E5", "E5", "C5", "B5"], "Em", "Em",
  "Cmaj7", "Cmaj7", "Am(add9)", "B7", null, null, "Em", "Em", "C", "D", "Em", "Em", "Am", "B7", "C5", "D5", "Em",
  "Em", ["C5", "D5"], "D5", "B5", "B7", null, null, null, null, null, null, null, null, null, [null, "E5"], "E5",
  "E5", "E5", "E5", "C5", "D5", "B5", "B5", "B5", ["D5", "E5"], "D5", "E5", "F#m", "F#m", ["D5", "E5"], "E5", "C#5",
  "C#7", null, ["D5", "E5", "F#5", "F#5"], null, ["D5", "E5", "F#5", "F#5"], "F#5", "F#5", null, null, null, null,
  null, null
 ],
 "bass": [
  null, null, null, null, null, null, null, null, "b_riffA", "b_riffB", "b_riffA", "b_riffB", "b_riffA", "b_riffB",
  "b_c5_build", "b_skid", "b_gal_E5", "b_vexFreeze", "b_gal_G5", "b_grannyFreeze", "b_gal_A5", "b_tinyFreeze",
  "b_gal_C5", "b_noodle", "b_gal_E5", "b_galR_E5", "b_gal_C5", "b_galR_D5", "b_gal_E5", "b_galR_E5", "b_stopC5",
  "b_shriekB5", "b_pre_A5", "b_pre_Bb5", "b_pre_B5_chug", "b_pre_B5_trem", "b_ch_C5", "b_ch2_D5", "b_ch_E5",
  "b_ch2_E5", "b_ch_stop", "b_ch2_D5", "b_ch_B5", "b_ch_B7", "b_riffA", "b_riffB", "b_riffA", "b_riffB_to48",
  "b_slam", null, null, null, "b_whole_A1", "b_whole_B1", null, null, "b_half_E5", "b_half_E5", "b_half_C5",
  "b_half_D5", "b_half_E5", "b_half_E5", "b_gal_A5", "b_galR_B5", "b_ch_C5", "b_ch2_D5", "b_ch_E5", "b_ch2_E5",
  "b_ch_stop", "b_ch2_D5", "b_ch_B5", "b_ch_B7_tape", null, null, null, null, null, null, null, null, null, null,
  "b_riffA", "b_riffB", "b_riffA", "b_riffB", "b_chug16_C5", "b_chug16_D5", "b_chug16_B5", "b_ding", "b_hitB5",
  "b_lift", ["b_ch_C5", 2], ["b_ch2_D5", 2], ["b_ch_E5", 2], ["b_ch2_E5", 2], ["b_ch_stop", 2], ["b_ch2_D5", 2],
  ["b_ch_B5", 2], ["b_ch_B7", 2], null, "b_stabsDEF", null, "b_stabsDEF_ring", "b_tremF5", "b_final", null, null,
  null, null, null, null
 ],
 "riffs": {
  "riffA": {
   "desc": "MAIN RIFF bar A: E5 G5 B5(accent) A5(tied over) on steps 0/4/8/14 = the hook rhythm; palm-muted open E2 16ths between",
   "notes": [
    [0, 2, [40, 47, 52], 1.0, ""], [2, 1, 40, 0.72, "pm"], [3, 1, 40, 0.72, "pm"], [4, 2, [43, 50, 55], 0.95, ""],
    [6, 1, 40, 0.72, "pm"], [7, 1, 40, 0.72, "pm"], [8, 4, [47, 54, 59], 1.0, "ring"], [12, 1, 40, 0.72, "pm"],
    [13, 1, 40, 0.72, "pm"], [14, 6, [45, 52, 57], 0.95, "ring"]
   ]
  },
  "riffB": {
   "desc": "MAIN RIFF bar B: (A5 still ringing) E2 chugs, then the chromatic fall Bb5 A5 G5 F#5 back to E",
   "notes": [
    [4, 1, 40, 0.75, "pm"], [5, 1, 40, 0.72, "pm"], [6, 1, 40, 0.75, "pm"], [7, 1, 40, 0.72, "pm"],
    [8, 2, [46, 53, 58], 1.0, ""], [10, 2, [45, 52, 57], 0.92, ""], [12, 2, [43, 50, 55], 0.92, ""],
    [14, 2, [42, 49, 54], 0.95, ""]
   ]
  },
  "riffB_to48": {
   "desc": "MAIN RIFF bar B, last pass: chugs, then C5 and B5 on beats 3 and 4 into the door-slam E5 on bar 48",
   "notes": [
    [4, 1, 40, 0.75, "pm"], [5, 1, 40, 0.72, "pm"], [6, 1, 40, 0.75, "pm"], [7, 1, 40, 0.72, "pm"],
    [8, 4, [48, 55, 60], 1.0, ""], [12, 4, [47, 54, 59], 1.0, ""]
   ]
  },
  "b_riffA": {
   "desc": "bass, MAIN RIFF bar A: the roots an octave down, picking the 16ths",
   "notes": [
    [0, 2, 28, 1.0, ""], [2, 1, 28, 0.75, "pm"], [3, 1, 28, 0.75, "pm"], [4, 2, 31, 0.95, ""], [6, 1, 28, 0.75, "pm"],
    [7, 1, 28, 0.75, "pm"], [8, 4, 35, 1.0, ""], [12, 1, 28, 0.75, "pm"], [13, 1, 28, 0.75, "pm"],
    [14, 6, 33, 0.95, ""]
   ]
  },
  "b_riffB": {
   "desc": "bass, MAIN RIFF bar B",
   "notes": [
    [4, 1, 28, 0.78, "pm"], [5, 1, 28, 0.75, "pm"], [6, 1, 28, 0.78, "pm"], [7, 1, 28, 0.75, "pm"],
    [8, 2, 34, 1.0, ""], [10, 2, 33, 0.92, ""], [12, 2, 31, 0.92, ""], [14, 2, 30, 0.95, ""]
   ]
  },
  "b_riffB_to48": {
   "desc": "bass, MAIN RIFF bar B last pass: C2 then B1 into the slam",
   "notes": [
    [4, 1, 28, 0.78, "pm"], [5, 1, 28, 0.75, "pm"], [6, 1, 28, 0.78, "pm"], [7, 1, 28, 0.75, "pm"],
    [8, 4, 36, 1.0, ""], [12, 4, 35, 1.0, ""]
   ]
  },
  "l_hookA": {
   "desc": "lead: the hook an octave above the vocal, G4 G4 B4 A4 on the riff stabs",
   "notes": [[0, 4, 67, 0.9, ""], [4, 4, 67, 0.85, ""], [8, 6, 71, 1.0, "vib"], [14, 6, 69, 0.9, "vib"]]
  },
  "l_hookB": {
   "desc": "lead: doubles the riff fall Bb4 A4 G4 F#4",
   "notes": [[8, 2, 70, 0.9, ""], [10, 2, 69, 0.85, ""], [12, 2, 67, 0.85, ""], [14, 2, 66, 0.85, ""]]
  },
  "l_hook3A": {
   "desc": "lead: the hook harmonised in thirds (twin-lead), G4+B4 G4+B4 B4+D5 A4+C5",
   "notes": [
    [0, 4, [67, 71], 0.9, ""], [4, 4, [67, 71], 0.85, ""], [8, 6, [71, 74], 1.0, "vib"],
    [14, 6, [69, 72], 0.9, "vib"]
   ]
  },
  "l_hook3B": {
   "desc": "lead: the riff fall in thirds",
   "notes": [
    [8, 2, [70, 74], 0.9, ""], [10, 2, [69, 72], 0.85, ""], [12, 2, [67, 71], 0.85, ""], [14, 2, [66, 69], 0.85, ""]
   ]
  },
  "l_hook3B_to48": {
   "desc": "lead: C5+E5 then B4+D#5 (the leading tone) into the slam",
   "notes": [[8, 4, [72, 76], 1.0, ""], [12, 4, [71, 75], 1.0, "vib"]]
  },
  "o_drone_Em": {
   "desc": "organ drone E2 B2 F#3 (Em add9, no third), 4 bars, swelling in under the rain",
   "notes": [[0, 64, [40, 47, 54], 0.55, "swell"]]
  },
  "o_drone_Cmaj7E": {
   "desc": "organ creeps up a semitone (B2->C3, F#3->G3, adds B3): Cmaj7/E, choked dead on \"stop.\" (beat 24.5)",
   "notes": [[0, 34, [40, 48, 55, 59], 0.6, ""]]
  },
  "c5_build": {
   "desc": "C5 in 8ths, open, crescendo (BRAKES! BRAKES! BRAKES!)",
   "notes": [
    [0, 2, [48, 55, 60], 0.72, ""], [2, 2, [48, 55, 60], 0.76, ""], [4, 2, [48, 55, 60], 0.8, ""],
    [6, 2, [48, 55, 60], 0.84, ""], [8, 2, [48, 55, 60], 0.88, ""], [10, 2, [48, 55, 60], 0.92, ""],
    [12, 2, [48, 55, 60], 0.96, ""], [14, 2, [48, 55, 60], 1.0, ""]
   ]
  },
  "b_c5_build": {
   "desc": "bass C2 8ths, crescendo",
   "notes": [
    [0, 2, 36, 0.75, ""], [2, 2, 36, 0.785, ""], [4, 2, 36, 0.82, ""], [6, 2, 36, 0.855, ""], [8, 2, 36, 0.89, ""],
    [10, 2, 36, 0.925, ""], [12, 2, 36, 0.96, ""], [14, 2, 36, 0.995, ""]
   ]
  },
  "skidL": {
   "desc": "B5 tremolo-picked under the skid, then one B5 hit with the car crash at step 10 (beat 62.5), cut at 62.75",
   "notes": [[0, 10, [47, 54, 59], 0.9, "trem"], [10, 1, [47, 54, 59], 1.0, ""]]
  },
  "skidR": {
   "desc": "B5 tremolo, then a long descending pick slide = the tyres skidding, then the crash hit",
   "notes": [[0, 4, [47, 54, 59], 0.9, "trem"], [4, 6, [47, 54, 59], 0.9, "slideDn"], [10, 1, [47, 54, 59], 1.0, ""]]
  },
  "b_skid": {"desc": "bass B1 tremolo, then the crash hit", "notes": [[0, 10, 35, 0.9, "trem"], [10, 1, 35, 1.0, ""]]},
  "l_skid": {
   "desc": "lead: a pinch-harmonic squeal diving two octaves with the van",
   "notes": [[2, 8, 71, 0.85, "harm dive24"]]
  },
  "gal_E5": {
   "desc": "verse gallop on E5: 8th + two 16ths per beat, palm-muted, open accent on step 0",
   "notes": [
    [0, 2, [40, 47, 52], 1.0, ""], [2, 1, [40, 47], 0.7, "pm"], [3, 1, [40, 47], 0.7, "pm"],
    [4, 2, [40, 47], 0.8, "pm"], [6, 1, [40, 47], 0.7, "pm"], [7, 1, [40, 47], 0.7, "pm"],
    [8, 2, [40, 47], 0.8, "pm"], [10, 1, [40, 47], 0.7, "pm"], [11, 1, [40, 47], 0.7, "pm"],
    [12, 2, [40, 47], 0.8, "pm"], [14, 1, [40, 47], 0.7, "pm"], [15, 1, [40, 47], 0.7, "pm"]
   ]
  },
  "b_gal_E5": {
   "desc": "bass doubles the gallop on the E5 root",
   "notes": [
    [0, 2, 28, 1.0, ""], [2, 1, 28, 0.72, "pm"], [3, 1, 28, 0.72, "pm"], [4, 2, 28, 0.85, "pm"],
    [6, 1, 28, 0.72, "pm"], [7, 1, 28, 0.72, "pm"], [8, 2, 28, 0.85, "pm"], [10, 1, 28, 0.72, "pm"],
    [11, 1, 28, 0.72, "pm"], [12, 2, 28, 0.85, "pm"], [14, 1, 28, 0.72, "pm"], [15, 1, 28, 0.72, "pm"]
   ]
  },
  "gal_G5": {
   "desc": "verse gallop on G5: 8th + two 16ths per beat, palm-muted, open accent on step 0",
   "notes": [
    [0, 2, [43, 50, 55], 1.0, ""], [2, 1, [43, 50], 0.7, "pm"], [3, 1, [43, 50], 0.7, "pm"],
    [4, 2, [43, 50], 0.8, "pm"], [6, 1, [43, 50], 0.7, "pm"], [7, 1, [43, 50], 0.7, "pm"],
    [8, 2, [43, 50], 0.8, "pm"], [10, 1, [43, 50], 0.7, "pm"], [11, 1, [43, 50], 0.7, "pm"],
    [12, 2, [43, 50], 0.8, "pm"], [14, 1, [43, 50], 0.7, "pm"], [15, 1, [43, 50], 0.7, "pm"]
   ]
  },
  "b_gal_G5": {
   "desc": "bass doubles the gallop on the G5 root",
   "notes": [
    [0, 2, 31, 1.0, ""], [2, 1, 31, 0.72, "pm"], [3, 1, 31, 0.72, "pm"], [4, 2, 31, 0.85, "pm"],
    [6, 1, 31, 0.72, "pm"], [7, 1, 31, 0.72, "pm"], [8, 2, 31, 0.85, "pm"], [10, 1, 31, 0.72, "pm"],
    [11, 1, 31, 0.72, "pm"], [12, 2, 31, 0.85, "pm"], [14, 1, 31, 0.72, "pm"], [15, 1, 31, 0.72, "pm"]
   ]
  },
  "gal_A5": {
   "desc": "verse gallop on A5: 8th + two 16ths per beat, palm-muted, open accent on step 0",
   "notes": [
    [0, 2, [45, 52, 57], 1.0, ""], [2, 1, [45, 52], 0.7, "pm"], [3, 1, [45, 52], 0.7, "pm"],
    [4, 2, [45, 52], 0.8, "pm"], [6, 1, [45, 52], 0.7, "pm"], [7, 1, [45, 52], 0.7, "pm"],
    [8, 2, [45, 52], 0.8, "pm"], [10, 1, [45, 52], 0.7, "pm"], [11, 1, [45, 52], 0.7, "pm"],
    [12, 2, [45, 52], 0.8, "pm"], [14, 1, [45, 52], 0.7, "pm"], [15, 1, [45, 52], 0.7, "pm"]
   ]
  },
  "b_gal_A5": {
   "desc": "bass doubles the gallop on the A5 root",
   "notes": [
    [0, 2, 33, 1.0, ""], [2, 1, 33, 0.72, "pm"], [3, 1, 33, 0.72, "pm"], [4, 2, 33, 0.85, "pm"],
    [6, 1, 33, 0.72, "pm"], [7, 1, 33, 0.72, "pm"], [8, 2, 33, 0.85, "pm"], [10, 1, 33, 0.72, "pm"],
    [11, 1, 33, 0.72, "pm"], [12, 2, 33, 0.85, "pm"], [14, 1, 33, 0.72, "pm"], [15, 1, 33, 0.72, "pm"]
   ]
  },
  "gal_C5": {
   "desc": "verse gallop on C5: 8th + two 16ths per beat, palm-muted, open accent on step 0",
   "notes": [
    [0, 2, [48, 55, 60], 1.0, ""], [2, 1, [48, 55], 0.7, "pm"], [3, 1, [48, 55], 0.7, "pm"],
    [4, 2, [48, 55], 0.8, "pm"], [6, 1, [48, 55], 0.7, "pm"], [7, 1, [48, 55], 0.7, "pm"],
    [8, 2, [48, 55], 0.8, "pm"], [10, 1, [48, 55], 0.7, "pm"], [11, 1, [48, 55], 0.7, "pm"],
    [12, 2, [48, 55], 0.8, "pm"], [14, 1, [48, 55], 0.7, "pm"], [15, 1, [48, 55], 0.7, "pm"]
   ]
  },
  "b_gal_C5": {
   "desc": "bass doubles the gallop on the C5 root",
   "notes": [
    [0, 2, 36, 1.0, ""], [2, 1, 36, 0.72, "pm"], [3, 1, 36, 0.72, "pm"], [4, 2, 36, 0.85, "pm"],
    [6, 1, 36, 0.72, "pm"], [7, 1, 36, 0.72, "pm"], [8, 2, 36, 0.85, "pm"], [10, 1, 36, 0.72, "pm"],
    [11, 1, 36, 0.72, "pm"], [12, 2, 36, 0.85, "pm"], [14, 1, 36, 0.72, "pm"], [15, 1, 36, 0.72, "pm"]
   ]
  },
  "vexFreeze": {
   "desc": "gallop for two beats, then E5 left ringing for the megaphone squeal (Vex freeze, beat 70)",
   "notes": [
    [0, 2, [40, 47, 52], 1.0, ""], [2, 1, [40, 47], 0.7, "pm"], [3, 1, [40, 47], 0.7, "pm"],
    [4, 2, [40, 47], 0.8, "pm"], [6, 1, [40, 47], 0.7, "pm"], [7, 1, [40, 47], 0.7, "pm"],
    [8, 8, [40, 47, 52], 1.0, "ring"]
   ]
  },
  "b_vexFreeze": {
   "desc": "bass gallop two beats, then E1 rings",
   "notes": [
    [0, 2, 28, 1.0, ""], [2, 1, 28, 0.72, "pm"], [3, 1, 28, 0.72, "pm"], [4, 2, 28, 0.85, "pm"],
    [6, 1, 28, 0.72, "pm"], [7, 1, 28, 0.72, "pm"], [8, 8, 28, 1.0, ""]
   ]
  },
  "grannyFreeze": {
   "desc": "G5 struck on the downbeat and left ringing under Granny's lick; silence for the pump (beat 79)",
   "notes": [[0, 12, [43, 50, 55], 1.0, "ring"]]
  },
  "b_grannyFreeze": {"desc": "bass G1 rings under the lick", "notes": [[0, 12, 31, 1.0, ""]]},
  "l_granny": {
   "desc": "Granny's lick (beat 76): 16ths E5 G5 A5 Bb5 B5 legato, then a pinch-harmonic dive bomb",
   "notes": [
    [0, 1, 76, 0.95, ""], [1, 1, 79, 0.9, "hammer"], [2, 1, 81, 0.9, "hammer"], [3, 1, 82, 0.9, "hammer"],
    [4, 1, 83, 0.95, "hammer"], [5, 7, 71, 1.0, "harm dive24"]
   ]
  },
  "tinyFreeze": {
   "desc": "A5 hit and let ring for one and a half beats; the bar belongs to Tiny's bat fill",
   "notes": [[0, 6, [45, 52, 57], 1.0, "ring"]]
  },
  "b_tinyFreeze": {"desc": "bass A1 hit", "notes": [[0, 6, 33, 1.0, ""]]},
  "noodleFreeze": {
   "desc": "guitars tacet for Noodle's lick; a D5 stab on beat 4 (bVII) kicks the verse in",
   "notes": [[12, 4, [50, 57, 62], 1.0, ""]]
  },
  "b_noodle": {
   "desc": "Noodle's lick (beat 92): E2 G2 A2 B2, the B buzzing and sagging a quarter-tone (duct-taped neck); D2 stab on beat 4",
   "notes": [
    [0, 2, 40, 0.95, ""], [2, 2, 43, 0.9, ""], [4, 2, 45, 0.9, ""], [6, 6, 47, 1.0, "buzz"], [12, 4, 38, 1.0, ""]
   ]
  },
  "galR_E5": {
   "desc": "verse gallop on E5: 8th + two 16ths per beat, palm-muted, open accent on step 0; rests steps 12-15 (vocal breath)",
   "notes": [
    [0, 2, [40, 47, 52], 1.0, ""], [2, 1, [40, 47], 0.7, "pm"], [3, 1, [40, 47], 0.7, "pm"],
    [4, 2, [40, 47], 0.8, "pm"], [6, 1, [40, 47], 0.7, "pm"], [7, 1, [40, 47], 0.7, "pm"],
    [8, 2, [40, 47], 0.8, "pm"], [10, 1, [40, 47], 0.7, "pm"], [11, 1, [40, 47], 0.7, "pm"]
   ]
  },
  "b_galR_E5": {
   "desc": "bass doubles the gallop on the E5 root; rests steps 12-15",
   "notes": [
    [0, 2, 28, 1.0, ""], [2, 1, 28, 0.72, "pm"], [3, 1, 28, 0.72, "pm"], [4, 2, 28, 0.85, "pm"],
    [6, 1, 28, 0.72, "pm"], [7, 1, 28, 0.72, "pm"], [8, 2, 28, 0.85, "pm"], [10, 1, 28, 0.72, "pm"],
    [11, 1, 28, 0.72, "pm"]
   ]
  },
  "galR_D5": {
   "desc": "verse gallop on D5: 8th + two 16ths per beat, palm-muted, open accent on step 0; rests steps 12-15 (vocal breath)",
   "notes": [
    [0, 2, [50, 57, 62], 1.0, ""], [2, 1, [50, 57], 0.7, "pm"], [3, 1, [50, 57], 0.7, "pm"],
    [4, 2, [50, 57], 0.8, "pm"], [6, 1, [50, 57], 0.7, "pm"], [7, 1, [50, 57], 0.7, "pm"],
    [8, 2, [50, 57], 0.8, "pm"], [10, 1, [50, 57], 0.7, "pm"], [11, 1, [50, 57], 0.7, "pm"]
   ]
  },
  "b_galR_D5": {
   "desc": "bass doubles the gallop on the D5 root; rests steps 12-15",
   "notes": [
    [0, 2, 38, 1.0, ""], [2, 1, 38, 0.72, "pm"], [3, 1, 38, 0.72, "pm"], [4, 2, 38, 0.85, "pm"],
    [6, 1, 38, 0.72, "pm"], [7, 1, 38, 0.72, "pm"], [8, 2, 38, 0.85, "pm"], [10, 1, 38, 0.72, "pm"],
    [11, 1, 38, 0.72, "pm"]
   ]
  },
  "stopC5": {
   "desc": "stop-time: C5 stabs on steps 0/4/8 (each \"don't\"), choked; silence on \"stop,\"; RUN! at 14 a cappella",
   "notes": [[0, 2, [48, 55, 60], 1.0, ""], [4, 2, [48, 55, 60], 1.0, ""], [8, 2, [48, 55, 60], 1.0, ""]]
  },
  "b_stopC5": {
   "desc": "bass C2 stabs with the guitars",
   "notes": [[0, 2, 36, 1.0, ""], [4, 2, 36, 1.0, ""], [8, 2, 36, 1.0, ""]]
  },
  "shriekB5": {
   "desc": "full band B5 on the downbeat under the shriek, then B5 palm-muted 16ths crescendo (they bolt)",
   "notes": [
    [0, 8, [47, 54, 59], 1.0, "ring"], [8, 1, [47, 54], 0.6, "pm"], [9, 1, [47, 54], 0.64, "pm"],
    [10, 1, [47, 54], 0.68, "pm"], [11, 1, [47, 54], 0.72, "pm"], [12, 1, [47, 54], 0.76, "pm"],
    [13, 1, [47, 54], 0.8, "pm"], [14, 1, [47, 54], 0.84, "pm"], [15, 1, [47, 54], 0.88, "pm"]
   ]
  },
  "b_shriekB5": {
   "desc": "bass B1 rings, then 16ths",
   "notes": [
    [0, 8, 35, 1.0, ""], [8, 1, 35, 0.65, "pm"], [9, 1, 35, 0.69, "pm"], [10, 1, 35, 0.73, "pm"],
    [11, 1, 35, 0.77, "pm"], [12, 1, 35, 0.81, "pm"], [13, 1, 35, 0.85, "pm"], [14, 1, 35, 0.89, "pm"],
    [15, 1, 35, 0.93, "pm"]
   ]
  },
  "pre_A5": {
   "desc": "A5 rings under Vex (\"Here they come,\"), then stabs on 8/10/12 with the gang (\"HERE THEY COME!\")",
   "notes": [
    [0, 8, [45, 52, 57], 1.0, "ring"], [8, 2, [45, 52, 57], 1.0, ""], [10, 2, [45, 52, 57], 1.0, ""],
    [12, 4, [45, 52, 57], 1.0, "ring"]
   ]
  },
  "b_pre_A5": {
   "desc": "bass A1 with the stabs",
   "notes": [[0, 8, 33, 1.0, ""], [8, 2, 33, 1.0, ""], [10, 2, 33, 1.0, ""], [12, 4, 33, 1.0, ""]]
  },
  "pre_Bb5": {
   "desc": "Bb5 rings under Vex (\"Here they come,\"), then stabs on 8/10/12 with the gang (\"HERE THEY COME!\")",
   "notes": [
    [0, 8, [46, 53, 58], 1.0, "ring"], [8, 2, [46, 53, 58], 1.0, ""], [10, 2, [46, 53, 58], 1.0, ""],
    [12, 4, [46, 53, 58], 1.0, "ring"]
   ]
  },
  "b_pre_Bb5": {
   "desc": "bass Bb1 with the stabs",
   "notes": [[0, 8, 34, 1.0, ""], [8, 2, 34, 1.0, ""], [10, 2, 34, 1.0, ""], [12, 4, 34, 1.0, ""]]
  },
  "pre_B5_chug": {
   "desc": "\"a thousand feet\": B5 palm-muted 16ths, open accents on 1 and 3, double-time drums",
   "notes": [
    [0, 2, [47, 54, 59], 1.0, ""], [2, 1, [47, 54], 0.72, "pm"], [3, 1, [47, 54], 0.72, "pm"],
    [4, 1, [47, 54], 0.72, "pm"], [5, 1, [47, 54], 0.72, "pm"], [6, 1, [47, 54], 0.72, "pm"],
    [7, 1, [47, 54], 0.72, "pm"], [8, 2, [47, 54, 59], 1.0, ""], [10, 1, [47, 54], 0.72, "pm"],
    [11, 1, [47, 54], 0.72, "pm"], [12, 1, [47, 54], 0.72, "pm"], [13, 1, [47, 54], 0.72, "pm"],
    [14, 1, [47, 54], 0.72, "pm"], [15, 1, [47, 54], 0.72, "pm"]
   ]
  },
  "b_pre_B5_chug": {
   "desc": "bass B1 8ths",
   "notes": [
    [0, 2, 35, 1.0, ""], [2, 2, 35, 0.82, ""], [4, 2, 35, 0.82, ""], [6, 2, 35, 0.82, ""], [8, 2, 35, 1.0, ""],
    [10, 2, 35, 0.82, ""], [12, 2, 35, 0.82, ""], [14, 2, 35, 0.82, ""]
   ]
  },
  "pre_B5_trem": {
   "desc": "\"...a single drum!\": B5 tremolo-picked, crescendo into the chorus",
   "notes": [[0, 16, [47, 54, 59], 0.95, "trem"]]
  },
  "b_pre_B5_trem": {"desc": "bass B1 tremolo 16ths, crescendo", "notes": [[0, 16, 35, 0.95, "trem"]]},
  "l_pre_fb": {
   "desc": "lead: a B4 feedback pedal under the rising roots (9th over A, b9 over Bb, root over B)",
   "notes": [[0, 32, 71, 0.6, "fb"]]
  },
  "l_pre_B": {"desc": "lead: B4 held with vibrato", "notes": [[0, 16, 71, 0.7, "vib"]]},
  "l_pre_D": {
   "desc": "lead: doubles \"drum!\" an octave up, D5 bent up from C5",
   "notes": [[0, 12, 74, 0.85, "b2 vibw"]]
  },
  "chL_stop": {
   "desc": "IF THE MUSIC STOPS: C5 8ths, D5 on STOPS (step 8), then EVERYTHING chokes at step 10 (gap); Tiny's two snare 16ths at 14-15",
   "notes": [
    [0, 2, [48, 55, 60], 1.0, ""], [2, 2, [48, 55, 60], 0.8, ""], [4, 2, [48, 55, 60], 1.0, ""],
    [6, 2, [48, 55, 60], 0.8, ""], [8, 2, [50, 57, 62], 1.0, ""]
   ]
  },
  "chR_stop": {
   "desc": "gtrR: Cmaj7 rung, D on STOPS, choked at step 10",
   "notes": [[0, 8, [48, 52, 55, 59, 64], 0.9, "ring"], [8, 2, [50, 57, 62, 66], 1.0, ""]]
  },
  "b_ch_stop": {
   "desc": "bass: C2 8ths, D2 on STOPS, choked at step 10",
   "notes": [
    [0, 2, 36, 1.0, ""], [2, 2, 36, 0.85, ""], [4, 2, 36, 0.85, ""], [6, 2, 36, 0.85, ""], [8, 2, 38, 1.0, ""]
   ]
  },
  "chL_B7": {
   "desc": "gtrL: B5 8ths, then two stabs on 8 and 12 with the line-end hits",
   "notes": [
    [0, 2, [47, 54, 59], 1.0, ""], [2, 2, [47, 54, 59], 0.8, ""], [4, 2, [47, 54, 59], 1.0, ""],
    [6, 2, [47, 54, 59], 0.8, ""], [8, 4, [47, 54, 59], 1.0, ""], [12, 4, [47, 54, 59], 1.0, ""]
   ]
  },
  "chR_B7": {
   "desc": "gtrR: open B7, re-struck on 8 and 12",
   "notes": [
    [0, 8, [47, 51, 57, 59, 66], 0.9, "ring"], [8, 4, [47, 51, 57, 59, 66], 1.0, ""],
    [12, 4, [47, 51, 57, 59, 66], 1.0, ""]
   ]
  },
  "b_ch_B7": {
   "desc": "bass: B1 8ths, stabs on 8 and 12",
   "notes": [
    [0, 2, 35, 1.0, ""], [2, 2, 35, 0.85, ""], [4, 2, 35, 0.85, ""], [6, 2, 35, 0.85, ""], [8, 4, 35, 1.0, ""],
    [12, 4, 35, 1.0, ""]
   ]
  },
  "chL_B7_tape": {
   "desc": "gtrL: B5 8ths straight through (the tape stop drags them down from beat 286)",
   "notes": [
    [0, 2, [47, 54, 59], 1.0, ""], [2, 2, [47, 54, 59], 0.85, ""], [4, 2, [47, 54, 59], 0.85, ""],
    [6, 2, [47, 54, 59], 0.85, ""], [8, 2, [47, 54, 59], 1.0, ""], [10, 2, [47, 54, 59], 0.85, ""],
    [12, 2, [47, 54, 59], 0.85, ""], [14, 2, [47, 54, 59], 0.85, ""]
   ]
  },
  "chR_B7_tape": {
   "desc": "gtrR: open B7 struck on 1 and 3, ringing into the tape stop",
   "notes": [[0, 8, [47, 51, 57, 59, 66], 0.9, "ring"], [8, 8, [47, 51, 57, 59, 66], 0.95, "ring"]]
  },
  "b_ch_B7_tape": {
   "desc": "bass: B1 8ths straight through",
   "notes": [
    [0, 2, 35, 1.0, ""], [2, 2, 35, 0.85, ""], [4, 2, 35, 0.85, ""], [6, 2, 35, 0.85, ""], [8, 2, 35, 1.0, ""],
    [10, 2, 35, 0.85, ""], [12, 2, 35, 0.85, ""], [14, 2, 35, 0.85, ""]
   ]
  },
  "chL_C5": {
   "desc": "chorus gtrL: C5 power chords in 8ths, accents on the hook steps 0/4/8/14",
   "notes": [
    [0, 2, [48, 55, 60], 1.0, ""], [2, 2, [48, 55, 60], 0.8, ""], [4, 2, [48, 55, 60], 1.0, ""],
    [6, 2, [48, 55, 60], 0.8, ""], [8, 2, [48, 55, 60], 1.0, ""], [10, 2, [48, 55, 60], 0.8, ""],
    [12, 2, [48, 55, 60], 0.8, ""], [14, 2, [48, 55, 60], 1.0, ""]
   ]
  },
  "chR_Cmaj7": {"desc": "chorus gtrR: open Cmaj7 rung out", "notes": [[0, 16, [48, 52, 55, 59, 64], 0.9, "ring"]]},
  "b_ch_C5": {
   "desc": "chorus bass: C2 8ths",
   "notes": [
    [0, 2, 36, 1.0, ""], [2, 2, 36, 0.85, ""], [4, 2, 36, 0.85, ""], [6, 2, 36, 0.85, ""], [8, 2, 36, 1.0, ""],
    [10, 2, 36, 0.85, ""], [12, 2, 36, 0.85, ""], [14, 2, 36, 0.85, ""]
   ]
  },
  "chL2_D5": {
   "desc": "chorus gtrL: D5 power chords in 8ths, accents on the hook steps 0/4/8/14; stab on 12 (answer slot)",
   "notes": [
    [0, 2, [50, 57, 62], 1.0, ""], [2, 2, [50, 57, 62], 0.8, ""], [4, 2, [50, 57, 62], 1.0, ""],
    [6, 2, [50, 57, 62], 0.8, ""], [8, 2, [50, 57, 62], 1.0, ""], [10, 2, [50, 57, 62], 0.8, ""],
    [12, 4, [50, 57, 62], 1.0, ""]
   ]
  },
  "chR2_D": {
   "desc": "chorus gtrR: open D rung out, re-struck on the answer slot (12)",
   "notes": [[0, 12, [50, 57, 62, 66], 0.9, "ring"], [12, 4, [50, 57, 62, 66], 1.0, ""]]
  },
  "b_ch2_D5": {
   "desc": "chorus bass: D2 8ths; stab on 12",
   "notes": [
    [0, 2, 38, 1.0, ""], [2, 2, 38, 0.85, ""], [4, 2, 38, 0.85, ""], [6, 2, 38, 0.85, ""], [8, 2, 38, 1.0, ""],
    [10, 2, 38, 0.85, ""], [12, 4, 38, 1.0, ""]
   ]
  },
  "chL_E5": {
   "desc": "chorus gtrL: E5 power chords in 8ths, accents on the hook steps 0/4/8/14",
   "notes": [
    [0, 2, [40, 47, 52], 1.0, ""], [2, 2, [40, 47, 52], 0.8, ""], [4, 2, [40, 47, 52], 1.0, ""],
    [6, 2, [40, 47, 52], 0.8, ""], [8, 2, [40, 47, 52], 1.0, ""], [10, 2, [40, 47, 52], 0.8, ""],
    [12, 2, [40, 47, 52], 0.8, ""], [14, 2, [40, 47, 52], 1.0, ""]
   ]
  },
  "chR_Em": {"desc": "chorus gtrR: open Em rung out", "notes": [[0, 16, [40, 47, 52, 55, 59, 64], 0.9, "ring"]]},
  "b_ch_E5": {
   "desc": "chorus bass: E1 8ths",
   "notes": [
    [0, 2, 28, 1.0, ""], [2, 2, 28, 0.85, ""], [4, 2, 28, 0.85, ""], [6, 2, 28, 0.85, ""], [8, 2, 28, 1.0, ""],
    [10, 2, 28, 0.85, ""], [12, 2, 28, 0.85, ""], [14, 2, 28, 0.85, ""]
   ]
  },
  "chL2_E5": {
   "desc": "chorus gtrL: E5 power chords in 8ths, accents on the hook steps 0/4/8/14; stab on 12 (answer slot)",
   "notes": [
    [0, 2, [40, 47, 52], 1.0, ""], [2, 2, [40, 47, 52], 0.8, ""], [4, 2, [40, 47, 52], 1.0, ""],
    [6, 2, [40, 47, 52], 0.8, ""], [8, 2, [40, 47, 52], 1.0, ""], [10, 2, [40, 47, 52], 0.8, ""],
    [12, 4, [40, 47, 52], 1.0, ""]
   ]
  },
  "chR2_Em": {
   "desc": "chorus gtrR: open Em rung out, re-struck on the answer slot (12)",
   "notes": [[0, 12, [40, 47, 52, 55, 59, 64], 0.9, "ring"], [12, 4, [40, 47, 52, 55, 59, 64], 1.0, ""]]
  },
  "b_ch2_E5": {
   "desc": "chorus bass: E1 8ths; stab on 12",
   "notes": [
    [0, 2, 28, 1.0, ""], [2, 2, 28, 0.85, ""], [4, 2, 28, 0.85, ""], [6, 2, 28, 0.85, ""], [8, 2, 28, 1.0, ""],
    [10, 2, 28, 0.85, ""], [12, 4, 28, 1.0, ""]
   ]
  },
  "chL_B5": {
   "desc": "chorus gtrL: B5 power chords in 8ths, accents on the hook steps 0/4/8/14",
   "notes": [
    [0, 2, [47, 54, 59], 1.0, ""], [2, 2, [47, 54, 59], 0.8, ""], [4, 2, [47, 54, 59], 1.0, ""],
    [6, 2, [47, 54, 59], 0.8, ""], [8, 2, [47, 54, 59], 1.0, ""], [10, 2, [47, 54, 59], 0.8, ""],
    [12, 2, [47, 54, 59], 0.8, ""], [14, 2, [47, 54, 59], 1.0, ""]
   ]
  },
  "chR_B5": {"desc": "chorus gtrR: open B5 rung out", "notes": [[0, 16, [47, 54, 59, 66], 0.9, "ring"]]},
  "b_ch_B5": {
   "desc": "chorus bass: B1 8ths",
   "notes": [
    [0, 2, 35, 1.0, ""], [2, 2, 35, 0.85, ""], [4, 2, 35, 0.85, ""], [6, 2, 35, 0.85, ""], [8, 2, 35, 1.0, ""],
    [10, 2, 35, 0.85, ""], [12, 2, 35, 0.85, ""], [14, 2, 35, 0.85, ""]
   ]
  },
  "slamE5": {
   "desc": "THE DOOR SLAM: the whole band on one E5, choked after 2 steps",
   "notes": [[0, 2, [40, 47, 52], 1.0, ""]]
  },
  "b_slam": {"desc": "bass E1 slam", "notes": [[0, 2, 28, 1.0, ""]]},
  "l_slam": {"desc": "lead E5 slam", "notes": [[0, 2, 76, 1.0, ""]]},
  "c_arp_Em_late": {
   "desc": "clean arpeggio Em in 8ths (E3 B3 E4 G4 B4 G4 E4 B3), entering after the slam",
   "notes": [
    [4, 4, 64, 0.6, "ring"], [6, 4, 67, 0.52, "ring"], [8, 4, 71, 0.6, "ring"], [10, 4, 67, 0.52, "ring"],
    [12, 4, 64, 0.6, "ring"], [14, 4, 59, 0.52, "ring"]
   ]
  },
  "c_arp_Em": {
   "desc": "clean arpeggio Em in 8ths, each note let ring",
   "notes": [
    [0, 4, 52, 0.68, "ring"], [2, 4, 59, 0.52, "ring"], [4, 4, 64, 0.6, "ring"], [6, 4, 67, 0.52, "ring"],
    [8, 4, 71, 0.6, "ring"], [10, 4, 67, 0.52, "ring"], [12, 4, 64, 0.6, "ring"], [14, 4, 59, 0.52, "ring"]
   ]
  },
  "c_arp_Cmaj7": {
   "desc": "clean arpeggio Cmaj7 (C3 G3 B3 E4 G4 E4 B3 G3)",
   "notes": [
    [0, 4, 48, 0.68, "ring"], [2, 4, 55, 0.52, "ring"], [4, 4, 59, 0.6, "ring"], [6, 4, 64, 0.52, "ring"],
    [8, 4, 67, 0.6, "ring"], [10, 4, 64, 0.52, "ring"], [12, 4, 59, 0.6, "ring"], [14, 4, 55, 0.52, "ring"]
   ]
  },
  "c_arp_Am9": {
   "desc": "clean arpeggio Am(add9) (A2 E3 B3 C4 E4 C4 B3 E3)",
   "notes": [
    [0, 4, 45, 0.68, "ring"], [2, 4, 52, 0.52, "ring"], [4, 4, 59, 0.6, "ring"], [6, 4, 60, 0.52, "ring"],
    [8, 4, 64, 0.6, "ring"], [10, 4, 60, 0.52, "ring"], [12, 4, 59, 0.6, "ring"], [14, 4, 52, 0.52, "ring"]
   ]
  },
  "c_arp_B7": {
   "desc": "clean arpeggio B7 (B2 F#3 A3 D#4 F#4 D#4 A3 F#3); everything stops dead at beat 216",
   "notes": [
    [0, 4, 47, 0.68, "ring"], [2, 4, 54, 0.52, "ring"], [4, 4, 57, 0.6, "ring"], [6, 4, 63, 0.52, "ring"],
    [8, 4, 66, 0.6, "ring"], [10, 4, 63, 0.52, "ring"], [12, 4, 57, 0.6, "ring"], [14, 2, 54, 0.52, "ring"]
   ]
  },
  "o_pad_Cmaj7": {"desc": "organ: soft Cmaj7 pad swelling in (2 bars)", "notes": [[0, 32, [48, 55, 59, 64], 0.42, "swell"]]},
  "o_pad_Am9": {"desc": "organ: Am(add9) pad", "notes": [[0, 16, [45, 52, 59, 60], 0.48, ""]]},
  "o_pad_B7": {"desc": "organ: B7 pad, cut dead at beat 216", "notes": [[0, 16, [47, 54, 57, 63], 0.52, ""]]},
  "b_whole_A1": {"desc": "bass enters: A1 whole note", "notes": [[0, 16, 33, 0.8, ""]]},
  "b_whole_B1": {"desc": "bass: B1 whole note, cut dead at beat 216", "notes": [[0, 16, 35, 0.85, ""]]},
  "m_48": {
   "desc": "music box, hook at half speed: KEEP (G5) ... THEM (G5), with soft chord plinks",
   "notes": [[0, 8, 79, 0.9, ""], [4, 4, 71, 0.38, ""], [8, 8, 79, 0.85, ""], [12, 4, 76, 0.38, ""]]
  },
  "m_49": {
   "desc": "music box: DAN (B5) ... CING (A5)",
   "notes": [[0, 12, 83, 0.9, ""], [4, 4, 76, 0.38, ""], [8, 4, 79, 0.38, ""], [12, 8, 81, 0.85, ""]]
  },
  "m_50": {
   "desc": "music box: Cmaj7 plinks while CING hangs",
   "notes": [[0, 4, 76, 0.45, ""], [4, 4, 79, 0.42, ""], [8, 4, 83, 0.5, ""], [12, 4, 79, 0.42, ""]]
  },
  "m_51": {
   "desc": "music box: the main riff's fall at half speed, Bb5 A5 G5 F#5 (the horror note in a lullaby)",
   "notes": [[0, 4, 82, 0.6, ""], [4, 4, 81, 0.55, ""], [8, 4, 79, 0.55, ""], [12, 4, 78, 0.6, ""]]
  },
  "m_52": {
   "desc": "music box: KEEP (G5) ... 'EM (G5)",
   "notes": [[0, 8, 79, 0.9, ""], [4, 4, 69, 0.38, ""], [8, 8, 79, 0.85, ""], [12, 4, 76, 0.38, ""]]
  },
  "m_53": {
   "desc": "music box: ON THE (A5 A5) BEAT (B5), and at beat 216 the music stops where \"IF THE MUSIC STOPS\" would start",
   "notes": [
    [0, 4, 81, 0.88, ""], [2, 2, 71, 0.34, ""], [4, 4, 81, 0.84, ""], [6, 2, 75, 0.34, ""], [8, 8, 83, 0.92, ""]
   ]
  },
  "half_E5": {
   "desc": "verse 2 half-time figure on E5: big chord on 1, two chugs, chord on 3, chugs on the 8ths",
   "notes": [
    [0, 6, [40, 47, 52], 0.95, "ring"], [6, 1, [40, 47], 0.7, "pm"], [7, 1, [40, 47], 0.7, "pm"],
    [8, 4, [40, 47, 52], 0.9, "ring"], [12, 2, [40, 47], 0.72, "pm"], [14, 2, [40, 47], 0.72, "pm"]
   ]
  },
  "b_half_E5": {
   "desc": "bass half-time figure on E1",
   "notes": [
    [0, 6, 28, 0.95, ""], [6, 1, 28, 0.72, "pm"], [7, 1, 28, 0.72, "pm"], [8, 4, 28, 0.9, ""],
    [12, 2, 28, 0.75, "pm"], [14, 2, 28, 0.75, "pm"]
   ]
  },
  "half_C5": {
   "desc": "verse 2 half-time figure on C5: big chord on 1, two chugs, chord on 3, chugs on the 8ths",
   "notes": [
    [0, 6, [48, 55, 60], 0.95, "ring"], [6, 1, [48, 55], 0.7, "pm"], [7, 1, [48, 55], 0.7, "pm"],
    [8, 4, [48, 55, 60], 0.9, "ring"], [12, 2, [48, 55], 0.72, "pm"], [14, 2, [48, 55], 0.72, "pm"]
   ]
  },
  "b_half_C5": {
   "desc": "bass half-time figure on C2",
   "notes": [
    [0, 6, 36, 0.95, ""], [6, 1, 36, 0.72, "pm"], [7, 1, 36, 0.72, "pm"], [8, 4, 36, 0.9, ""],
    [12, 2, 36, 0.75, "pm"], [14, 2, 36, 0.75, "pm"]
   ]
  },
  "half_D5": {
   "desc": "verse 2 half-time figure on D5: big chord on 1, two chugs, chord on 3, chugs on the 8ths",
   "notes": [
    [0, 6, [50, 57, 62], 0.95, "ring"], [6, 1, [50, 57], 0.7, "pm"], [7, 1, [50, 57], 0.7, "pm"],
    [8, 4, [50, 57, 62], 0.9, "ring"], [12, 2, [50, 57], 0.72, "pm"], [14, 2, [50, 57], 0.72, "pm"]
   ]
  },
  "b_half_D5": {
   "desc": "bass half-time figure on D2",
   "notes": [
    [0, 6, 38, 0.95, ""], [6, 1, 38, 0.72, "pm"], [7, 1, 38, 0.72, "pm"], [8, 4, 38, 0.9, ""],
    [12, 2, 38, 0.75, "pm"], [14, 2, 38, 0.75, "pm"]
   ]
  },
  "fb_B4": {
   "desc": "gtrR: Noodle plugs in (sparks, beat 246): two beats of B4 feedback swelling into the right channel",
   "notes": [[8, 8, 71, 0.65, "fb"]]
  },
  "galR_B5": {
   "desc": "verse gallop on B5: 8th + two 16ths per beat, palm-muted, open accent on step 0; rests steps 12-15 (vocal breath)",
   "notes": [
    [0, 2, [47, 54, 59], 1.0, ""], [2, 1, [47, 54], 0.7, "pm"], [3, 1, [47, 54], 0.7, "pm"],
    [4, 2, [47, 54], 0.8, "pm"], [6, 1, [47, 54], 0.7, "pm"], [7, 1, [47, 54], 0.7, "pm"],
    [8, 2, [47, 54], 0.8, "pm"], [10, 1, [47, 54], 0.7, "pm"], [11, 1, [47, 54], 0.7, "pm"]
   ]
  },
  "b_galR_B5": {
   "desc": "bass doubles the gallop on the B5 root; rests steps 12-15",
   "notes": [
    [0, 2, 35, 1.0, ""], [2, 1, 35, 0.72, "pm"], [3, 1, 35, 0.72, "pm"], [4, 2, 35, 0.85, "pm"],
    [6, 1, 35, 0.72, "pm"], [7, 1, 35, 0.72, "pm"], [8, 2, 35, 0.85, "pm"], [10, 1, 35, 0.72, "pm"],
    [11, 1, 35, 0.72, "pm"]
   ]
  },
  "o_v2_Em": {
   "desc": "organ: Em held for the bar, high and thin above the voice (verse 2)",
   "notes": [[0, 16, [64, 67, 71], 0.5, ""]]
  },
  "o_v2_C": {
   "desc": "organ: C held for the bar, high and thin above the voice (verse 2)",
   "notes": [[0, 16, [64, 67, 72], 0.5, ""]]
  },
  "o_v2_D": {
   "desc": "organ: D held for the bar, high and thin above the voice (verse 2)",
   "notes": [[0, 16, [62, 66, 69], 0.5, ""]]
  },
  "o_v2_Am": {
   "desc": "organ: Am held for the bar, high and thin above the voice (verse 2)",
   "notes": [[0, 16, [64, 69, 72], 0.5, ""]]
  },
  "o_v2_B7": {
   "desc": "organ: B7 held for the bar, high and thin above the voice (verse 2)",
   "notes": [[0, 16, [63, 66, 69, 71], 0.5, ""]]
  },
  "fb_E5_L": {"desc": "amps on (beat 326): feedback blooming up to E5 into the solo", "notes": [[8, 8, 76, 0.75, "fb"]]},
  "fb_E5_R": {"desc": "amps on: the second guitar feeds back two 16ths later", "notes": [[10, 6, 76, 0.7, "fb"]]},
  "chug16_C5": {
   "desc": "thrash: C5 open on 1, palm-muted 16ths, open accent on 3 (over the double kick)",
   "notes": [
    [0, 2, [48, 55, 60], 1.0, ""], [2, 1, [48, 55], 0.72, "pm"], [3, 1, [48, 55], 0.72, "pm"],
    [4, 1, [48, 55], 0.72, "pm"], [5, 1, [48, 55], 0.72, "pm"], [6, 1, [48, 55], 0.72, "pm"],
    [7, 1, [48, 55], 0.72, "pm"], [8, 1, [48, 55], 0.95, ""], [9, 1, [48, 55], 0.72, "pm"],
    [10, 1, [48, 55], 0.72, "pm"], [11, 1, [48, 55], 0.72, "pm"], [12, 1, [48, 55], 0.72, "pm"],
    [13, 1, [48, 55], 0.72, "pm"], [14, 1, [48, 55], 0.72, "pm"], [15, 1, [48, 55], 0.72, "pm"]
   ]
  },
  "b_chug16_C5": {
   "desc": "bass C2 16ths",
   "notes": [
    [0, 2, 36, 1.0, ""], [2, 1, 36, 0.75, "pm"], [3, 1, 36, 0.75, "pm"], [4, 1, 36, 0.9, "pm"],
    [5, 1, 36, 0.75, "pm"], [6, 1, 36, 0.75, "pm"], [7, 1, 36, 0.75, "pm"], [8, 1, 36, 0.9, "pm"],
    [9, 1, 36, 0.75, "pm"], [10, 1, 36, 0.75, "pm"], [11, 1, 36, 0.75, "pm"], [12, 1, 36, 0.9, "pm"],
    [13, 1, 36, 0.75, "pm"], [14, 1, 36, 0.75, "pm"], [15, 1, 36, 0.75, "pm"]
   ]
  },
  "chug16_D5": {
   "desc": "thrash: D5 open on 1, palm-muted 16ths, open accent on 3 (over the double kick)",
   "notes": [
    [0, 2, [50, 57, 62], 1.0, ""], [2, 1, [50, 57], 0.72, "pm"], [3, 1, [50, 57], 0.72, "pm"],
    [4, 1, [50, 57], 0.72, "pm"], [5, 1, [50, 57], 0.72, "pm"], [6, 1, [50, 57], 0.72, "pm"],
    [7, 1, [50, 57], 0.72, "pm"], [8, 1, [50, 57], 0.95, ""], [9, 1, [50, 57], 0.72, "pm"],
    [10, 1, [50, 57], 0.72, "pm"], [11, 1, [50, 57], 0.72, "pm"], [12, 1, [50, 57], 0.72, "pm"],
    [13, 1, [50, 57], 0.72, "pm"], [14, 1, [50, 57], 0.72, "pm"], [15, 1, [50, 57], 0.72, "pm"]
   ]
  },
  "b_chug16_D5": {
   "desc": "bass D2 16ths",
   "notes": [
    [0, 2, 38, 1.0, ""], [2, 1, 38, 0.75, "pm"], [3, 1, 38, 0.75, "pm"], [4, 1, 38, 0.9, "pm"],
    [5, 1, 38, 0.75, "pm"], [6, 1, 38, 0.75, "pm"], [7, 1, 38, 0.75, "pm"], [8, 1, 38, 0.9, "pm"],
    [9, 1, 38, 0.75, "pm"], [10, 1, 38, 0.75, "pm"], [11, 1, 38, 0.75, "pm"], [12, 1, 38, 0.9, "pm"],
    [13, 1, 38, 0.75, "pm"], [14, 1, 38, 0.75, "pm"], [15, 1, 38, 0.75, "pm"]
   ]
  },
  "chug16_B5": {
   "desc": "thrash: B5 open on 1, palm-muted 16ths, open accent on 3 (over the double kick)",
   "notes": [
    [0, 2, [47, 54, 59], 1.0, ""], [2, 1, [47, 54], 0.72, "pm"], [3, 1, [47, 54], 0.72, "pm"],
    [4, 1, [47, 54], 0.72, "pm"], [5, 1, [47, 54], 0.72, "pm"], [6, 1, [47, 54], 0.72, "pm"],
    [7, 1, [47, 54], 0.72, "pm"], [8, 1, [47, 54], 0.95, ""], [9, 1, [47, 54], 0.72, "pm"],
    [10, 1, [47, 54], 0.72, "pm"], [11, 1, [47, 54], 0.72, "pm"], [12, 1, [47, 54], 0.72, "pm"],
    [13, 1, [47, 54], 0.72, "pm"], [14, 1, [47, 54], 0.72, "pm"], [15, 1, [47, 54], 0.72, "pm"]
   ]
  },
  "b_chug16_B5": {
   "desc": "bass B1 16ths",
   "notes": [
    [0, 2, 35, 1.0, ""], [2, 1, 35, 0.75, "pm"], [3, 1, 35, 0.75, "pm"], [4, 1, 35, 0.9, "pm"],
    [5, 1, 35, 0.75, "pm"], [6, 1, 35, 0.75, "pm"], [7, 1, 35, 0.75, "pm"], [8, 1, 35, 0.9, "pm"],
    [9, 1, 35, 0.75, "pm"], [10, 1, 35, 0.75, "pm"], [11, 1, 35, 0.75, "pm"], [12, 1, 35, 0.9, "pm"],
    [13, 1, 35, 0.75, "pm"], [14, 1, 35, 0.75, "pm"], [15, 1, 35, 0.75, "pm"]
   ]
  },
  "ding_B5": {
   "desc": "B5 rung under the DING and Granny's held bend; unison triplet B5 A5 G5 on beat 4",
   "notes": [
    [0, 12, [47, 54, 59], 1.0, "ring"], [12, 1.333, [47, 54, 59], 1.0, ""], [13.333, 1.333, [45, 52, 57], 1.0, ""],
    [14.667, 1.333, [43, 50, 55], 1.0, ""]
   ]
  },
  "b_ding": {
   "desc": "bass B1 held, triplet B1 A1 G1",
   "notes": [
    [0, 12, 35, 1.0, ""], [12, 1.333, 35, 1.0, ""], [13.333, 1.333, 33, 1.0, ""], [14.667, 1.333, 31, 1.0, ""]
   ]
  },
  "l_solo82": {
   "desc": "solo 1: \"My turn.\" The hook an octave above the vocal, bent into and sung with vibrato",
   "notes": [[0, 4, 67, 0.95, "b2"], [4, 4, 67, 0.9, "vib"], [8, 6, 71, 1.0, "b2 vibw"], [14, 6, 69, 0.9, "vib"]]
  },
  "l_solo83": {
   "desc": "solo 2: a B-C-B turn, then she doubles the riff fall Bb4 A4 G4 F#4",
   "notes": [
    [4, 1, 71, 0.85, ""], [5, 1, 72, 0.85, "hammer"], [6, 2, 71, 0.85, "hammer"], [8, 2, 70, 0.95, "vib"],
    [10, 2, 69, 0.9, ""], [12, 2, 67, 0.9, ""], [14, 2, 66, 0.9, ""]
   ]
  },
  "l_solo84": {
   "desc": "solo 3: the hook a third higher, B4 B4 D5 C5",
   "notes": [[0, 4, 71, 0.95, "vib"], [4, 4, 71, 0.9, "b1"], [8, 6, 74, 1.0, "b2 vibw"], [14, 6, 72, 0.9, "vib"]]
  },
  "l_solo85": {
   "desc": "solo 4: pentatonic pull-offs E5 D5 B4 A4, the Bb4 horror note, then up again B4 D5 E5",
   "notes": [
    [4, 1, 76, 0.9, ""], [5, 1, 74, 0.85, "hammer"], [6, 1, 71, 0.85, "hammer"], [7, 1, 69, 0.85, "hammer"],
    [8, 2, 70, 0.95, "vib"], [10, 2, 71, 0.9, ""], [12, 2, 74, 0.9, ""], [14, 2, 76, 0.95, ""]
   ]
  },
  "l_solo86": {
   "desc": "solo 5 (C5): descending fours in 16ths E5 D5 C5 B4 | D5 C5 B4 A4 | C5 B4 A4 G4 | B4 A4 G4 F#4",
   "notes": [
    [0, 1, 76, 0.95, ""], [1, 1, 74, 0.85, "hammer"], [2, 1, 72, 0.85, "hammer"], [3, 1, 71, 0.85, "hammer"],
    [4, 1, 74, 0.95, ""], [5, 1, 72, 0.85, "hammer"], [6, 1, 71, 0.85, "hammer"], [7, 1, 69, 0.85, "hammer"],
    [8, 1, 72, 0.95, ""], [9, 1, 71, 0.85, "hammer"], [10, 1, 69, 0.85, "hammer"], [11, 1, 67, 0.85, "hammer"],
    [12, 1, 71, 0.95, ""], [13, 1, 69, 0.85, "hammer"], [14, 1, 67, 0.85, "hammer"], [15, 1, 66, 0.85, "hammer"]
   ]
  },
  "l_solo87": {
   "desc": "solo 6 (D5): the run F#4 G4 A4 B4 C5 D5 E5 F#5 G5 A5 B5 C6 up to a screaming D6",
   "notes": [
    [0, 1, 66, 0.85, ""], [1, 1, 67, 0.86, "hammer"], [2, 1, 69, 0.87, "hammer"], [3, 1, 71, 0.88, ""],
    [4, 1, 72, 0.89, "hammer"], [5, 1, 74, 0.9, "hammer"], [6, 1, 76, 0.91, ""], [7, 1, 78, 0.92, "hammer"],
    [8, 1, 79, 0.93, "hammer"], [9, 1, 81, 0.94, ""], [10, 1, 83, 0.95, "hammer"], [11, 1, 84, 0.96, "hammer"],
    [12, 4, 86, 1.0, "vibw"]
   ]
  },
  "l_solo88": {
   "desc": "solo 7 (B5): tapped B7 arpeggio B4 D#5 F#5 A5 B5 A5 F#5 D#5, twice (the frisbee leaves on beat 3)",
   "notes": [
    [0, 1, 71, 0.9, "tap"], [1, 1, 75, 0.9, "tap"], [2, 1, 78, 0.9, "tap"], [3, 1, 81, 0.9, "tap"],
    [4, 1, 83, 0.9, "tap"], [5, 1, 81, 0.9, "tap"], [6, 1, 78, 0.9, "tap"], [7, 1, 75, 0.9, "tap"],
    [8, 1, 71, 0.9, "tap"], [9, 1, 75, 0.9, "tap"], [10, 1, 78, 0.9, "tap"], [11, 1, 81, 0.9, "tap"],
    [12, 1, 83, 0.9, "tap"], [13, 1, 81, 0.9, "tap"], [14, 1, 78, 0.9, "tap"], [15, 1, 75, 0.9, "tap"]
   ]
  },
  "l_solo89": {
   "desc": "solo 8: bends up to B5 exactly with the cymbal DING (beat 356) and holds it, vibrato; unison triplet B5 A5 G5",
   "notes": [
    [0, 12, 83, 1.0, "b2 vibw"], [12, 1.333, 83, 1.0, ""], [13.333, 1.333, 81, 1.0, ""], [14.667, 1.333, 79, 1.0, ""]
   ]
  },
  "hitB5": {
   "desc": "band hit B5 on beat 1 (beat 360), choked on beat 2; Lou talks in the hole",
   "notes": [[0, 4, [47, 54, 59], 1.0, ""]]
  },
  "b_hitB5": {"desc": "bass B1 hit, choked", "notes": [[0, 4, 35, 1.0, ""]]},
  "l_hitB5": {"desc": "lead B5 with the hit", "notes": [[0, 4, 83, 1.0, "vib"]]},
  "liftL": {
   "desc": "lift: D5 8ths (beats 1-2) then E5 8ths (beats 3-4), crescendo",
   "notes": [
    [0, 2, [50, 57, 62], 1.0, ""], [2, 2, [50, 57, 62], 0.8, ""], [4, 2, [50, 57, 62], 0.8, ""],
    [6, 2, [50, 57, 62], 0.8, ""], [8, 2, [40, 47, 52], 1.0, ""], [10, 2, [40, 47, 52], 0.88, ""],
    [12, 2, [40, 47, 52], 0.88, ""], [14, 2, [40, 47, 52], 0.88, ""]
   ]
  },
  "liftR": {
   "desc": "lift: D5 8ths then E5 8ths and an upward pick slide on beat 4",
   "notes": [
    [0, 2, [50, 57, 62], 1.0, ""], [2, 2, [50, 57, 62], 0.8, ""], [4, 2, [50, 57, 62], 0.8, ""],
    [6, 2, [50, 57, 62], 0.8, ""], [8, 2, [40, 47, 52], 1.0, ""], [10, 2, [40, 47, 52], 0.9, ""],
    [12, 4, [40, 47, 52], 0.9, "slideUp"]
   ]
  },
  "b_lift": {
   "desc": "bass D2 8ths then E2 8ths (up)",
   "notes": [
    [0, 2, 38, 1.0, ""], [2, 2, 38, 0.85, ""], [4, 2, 38, 0.85, ""], [6, 2, 38, 0.85, ""], [8, 2, 40, 1.0, ""],
    [10, 2, 40, 0.85, ""], [12, 2, 40, 0.85, ""], [14, 2, 40, 0.85, ""]
   ]
  },
  "o_lift": {
   "desc": "organ: D swells, then E MAJOR (its G# is the new key's 2nd) into F# minor",
   "notes": [[0, 8, [62, 66, 69], 0.55, "swell"], [8, 8, [64, 68, 71], 0.8, ""]]
  },
  "o_c3_D": {"desc": "organ pad: D, voiced above the voice", "notes": [[0, 16, [62, 66, 69], 0.62, ""]]},
  "o_c3_E": {"desc": "organ pad: E, voiced above the voice", "notes": [[0, 16, [64, 68, 71], 0.62, ""]]},
  "o_c3_F#m_2bars": {"desc": "organ pad: F#m, voiced above the voice (2 bars)", "notes": [[0, 32, [66, 69, 73], 0.62, ""]]},
  "o_c3_C#5": {"desc": "organ pad: C#5, voiced above the voice", "notes": [[0, 16, [61, 68, 73], 0.62, ""]]},
  "o_c3_C#7": {"desc": "organ pad: C#7, voiced above the voice", "notes": [[0, 16, [61, 65, 71], 0.62, ""]]},
  "o_c3_stop": {
   "desc": "organ: D, then E on STOPS, choked at step 10 with the band",
   "notes": [[0, 8, [62, 66, 69], 0.62, ""], [8, 2, [64, 68, 71], 0.7, ""]]
  },
  "stabsDEF": {
   "desc": "response: D5 / E5 / F#5 stabs on steps 0/4/8 (the motif), each choked after 3 steps; F#5 rings to 14",
   "notes": [[0, 3, [50, 57, 62], 1.0, ""], [4, 3, [52, 59, 64], 1.0, ""], [8, 6, [54, 61, 66], 1.0, "ring"]]
  },
  "stabsDEF_ring": {
   "desc": "response 2: D5 / E5 / F#5, the F#5 rings on into the ending roll",
   "notes": [[0, 3, [50, 57, 62], 1.0, ""], [4, 3, [52, 59, 64], 1.0, ""], [8, 8, [54, 61, 66], 1.0, "ring"]]
  },
  "b_stabsDEF": {"desc": "bass D2 E2 F#2 stabs", "notes": [[0, 3, 38, 1.0, ""], [4, 3, 40, 1.0, ""], [8, 6, 42, 1.0, ""]]},
  "b_stabsDEF_ring": {
   "desc": "bass D2 E2 F#2, F#2 rings",
   "notes": [[0, 3, 38, 1.0, ""], [4, 3, 40, 1.0, ""], [8, 8, 42, 1.0, ""]]
  },
  "l_stabsDEF": {
   "desc": "lead D5 E5 F#5 with the stabs",
   "notes": [[0, 3, 74, 1.0, ""], [4, 3, 76, 1.0, ""], [8, 6, 78, 1.0, "vib"]]
  },
  "l_stabsDEF_ring": {
   "desc": "lead D5 E5 F#5, F#5 rings",
   "notes": [[0, 3, 74, 1.0, ""], [4, 3, 76, 1.0, ""], [8, 8, 78, 1.0, "vib"]]
  },
  "tremF5": {
   "desc": "ending: F#5 tremolo-picked for the whole bar over the drum roll",
   "notes": [[0, 16, [42, 49, 54], 1.0, "trem"]]
  },
  "b_tremF5": {"desc": "bass F#1 tremolo", "notes": [[0, 16, 30, 1.0, "trem"]]},
  "l_end104": {"desc": "lead: a screaming A5 bent up from G5, wide vibrato", "notes": [[0, 16, 81, 0.95, "b2 vibw"]]},
  "o_end104": {"desc": "organ: F#m swelling under the roll", "notes": [[0, 16, [42, 54, 57, 61, 66], 0.7, "swell"]]},
  "finalF5": {
   "desc": "THE FINAL HIT (beat 420): F#5, rings two beats, choked at 422",
   "notes": [[0, 8, [42, 49, 54], 1.0, ""]]
  },
  "b_final": {"desc": "bass F#1 final hit", "notes": [[0, 8, 30, 1.0, ""]]},
  "l_final": {"desc": "lead F#5 final hit", "notes": [[0, 8, 78, 1.0, "vibw"]]},
  "o_final": {"desc": "organ F#m final hit", "notes": [[0, 8, [42, 54, 57, 61, 66], 0.9, ""]]},
  "m_110": {
   "desc": "coda music box: KEEP THEM DAN-CING, G5 G5 B5 A5 (beats 440, 441, 442, 443.5)",
   "notes": [[0, 4, 79, 0.8, ""], [4, 4, 79, 0.75, ""], [8, 6, 83, 0.8, ""], [14, 6, 81, 0.72, ""]]
  },
  "m_111": {
   "desc": "coda music box, slowing: IF THE MU-SIC (B5 B5 C6 B5 at 445, 445.6, 446.3, 447.2); STOPS (D6) never comes",
   "notes": [[4, 2.4, 83, 0.7, ""], [6.4, 2.8, 83, 0.62, ""], [9.2, 3.6, 84, 0.58, ""], [12.8, 3.1, 83, 0.5, ""]]
  },
  "l_c3_92": {
   "desc": "lead doubles Vex an octave up (c3a)",
   "notes": [[0, 4, 69, 0.95, ""], [4, 4, 69, 0.88, ""], [8, 6, 73, 0.88, "vib"], [14, 10, 71, 0.88, "b2 vib"]]
  },
  "l_c3_94": {
   "desc": "lead doubles Vex an octave up (c3b)",
   "notes": [
    [0, 4, 69, 0.95, ""], [4, 4, 69, 0.88, ""], [8, 2, 71, 0.88, ""], [10, 2, 71, 0.88, ""],
    [12, 12, 73, 0.88, "b2 vib"]
   ]
  },
  "l_c3_96": {
   "desc": "lead doubles Vex an octave up (c3c)",
   "notes": [
    [0, 2, 73, 0.95, ""], [2, 2, 73, 0.88, ""], [4, 2, 74, 0.88, ""], [6, 2, 73, 0.88, ""], [8, 2, 76, 0.88, ""]
   ]
  },
  "l_c3_98": {
   "desc": "lead doubles Vex an octave up (c3d)",
   "notes": [
    [0, 2, 73, 0.95, ""], [2, 2, 73, 0.88, ""], [4, 2, 71, 0.88, ""], [6, 2, 71, 0.88, ""],
    [8, 14, 68, 0.88, "b2 vib"]
   ]
  }
 },
 "arrangement": {
  "tracks": {
   "gtrL": [
    null, null, null, null, null, null, null, null, "riffA", "riffB", "riffA", "riffB", "riffA", "riffB", "c5_build",
    "skidL", "gal_E5", "vexFreeze", "gal_G5", "grannyFreeze", "gal_A5", "tinyFreeze", "gal_C5", "noodleFreeze",
    "gal_E5", "galR_E5", "gal_C5", "galR_D5", "gal_E5", "galR_E5", "stopC5", "shriekB5", "pre_A5", "pre_Bb5",
    "pre_B5_chug", "pre_B5_trem", "chL_C5", "chL2_D5", "chL_E5", "chL2_E5", "chL_stop", "chL2_D5", "chL_B5", "chL_B7",
    "riffA", "riffB", "riffA", "riffB_to48", "slamE5", null, null, null, null, null, null, null, "half_E5", "half_E5",
    "half_C5", "half_D5", "half_E5", "half_E5", "gal_A5", "galR_B5", "chL_C5", "chL2_D5", "chL_E5", "chL2_E5",
    "chL_stop", "chL2_D5", "chL_B5", "chL_B7_tape", null, null, null, null, null, null, null, null, null, "fb_E5_L",
    "riffA", "riffB", "riffA", "riffB", "chug16_C5", "chug16_D5", "chug16_B5", "ding_B5", "hitB5", "liftL",
    ["chL_C5", 2], ["chL2_D5", 2], ["chL_E5", 2], ["chL2_E5", 2], ["chL_stop", 2], ["chL2_D5", 2], ["chL_B5", 2],
    ["chL_B7", 2], null, "stabsDEF", null, "stabsDEF_ring", "tremF5", "finalF5", null, null, null, null, null, null
   ],
   "gtrR": [
    null, null, null, null, null, null, null, null, "riffA", "riffB", "riffA", "riffB", "riffA", "riffB", "c5_build",
    "skidR", "gal_E5", "vexFreeze", "gal_G5", "grannyFreeze", "gal_A5", "tinyFreeze", "gal_C5", "noodleFreeze",
    "gal_E5", "galR_E5", "gal_C5", "galR_D5", "gal_E5", "galR_E5", "stopC5", "shriekB5", "pre_A5", "pre_Bb5",
    "pre_B5_chug", "pre_B5_trem", "chR_Cmaj7", "chR2_D", "chR_Em", "chR2_Em", "chR_stop", "chR2_D", "chR_B5",
    "chR_B7", "riffA", "riffB", "riffA", "riffB_to48", "slamE5", null, null, null, null, null, null, null, null, null,
    null, null, null, "fb_B4", "gal_A5", "galR_B5", "chR_Cmaj7", "chR2_D", "chR_Em", "chR2_Em", "chR_stop", "chR2_D",
    "chR_B5", "chR_B7_tape", null, null, null, null, null, null, null, null, null, "fb_E5_R", "riffA", "riffB",
    "riffA", "riffB", "chug16_C5", "chug16_D5", "chug16_B5", "ding_B5", "hitB5", "liftR", ["chR_Cmaj7", 2],
    ["chR2_D", 2], ["chR_Em", 2], ["chR2_Em", 2], ["chR_stop", 2], ["chR2_D", 2], ["chR_B5", 2], ["chR_B7", 2], null,
    "stabsDEF", null, "stabsDEF_ring", "tremF5", "finalF5", null, null, null, null, null, null
   ],
   "lead": [
    null, null, null, null, null, null, null, null, null, null, "l_hookA", "l_hookB", "l_hook3A", "l_hook3B", null,
    "l_skid", null, null, null, "l_granny", null, null, null, null, null, null, null, null, null, null, null, null,
    "l_pre_fb", null, "l_pre_B", "l_pre_D", null, null, null, null, null, null, null, null, "l_hookA", "l_hookB",
    "l_hook3A", "l_hook3B_to48", "l_slam", null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, "l_solo82", "l_solo83", "l_solo84", "l_solo85", "l_solo86", "l_solo87", "l_solo88", "l_solo89",
    "l_hitB5", null, "l_c3_92", null, "l_c3_94", null, "l_c3_96", null, "l_c3_98", null, null, "l_stabsDEF", null,
    "l_stabsDEF_ring", "l_end104", "l_final", null, null, null, null, null, null
   ],
   "organ": [
    "o_drone_Em", null, null, null, "o_drone_Cmaj7E", null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "o_pad_Cmaj7",
    null, "o_pad_Am9", "o_pad_B7", null, null, "o_v2_Em", "o_v2_Em", "o_v2_C", "o_v2_D", "o_v2_Em", "o_v2_Em",
    "o_v2_Am", "o_v2_B7", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, "o_lift", "o_c3_D", "o_c3_E",
    "o_c3_F#m_2bars", null, "o_c3_stop", "o_c3_E", "o_c3_C#5", "o_c3_C#7", null, null, null, null, "o_end104",
    "o_final", null, null, null, null, null, null
   ],
   "clean": [
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, "c_arp_Em_late", "c_arp_Em", "c_arp_Cmaj7",
    "c_arp_Cmaj7", "c_arp_Am9", "c_arp_B7", null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null
   ],
   "musicbox": [
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, "m_48", "m_49", "m_50", "m_51", "m_52", "m_53", null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "m_110",
    "m_111"
   ]
  },
  "mix": {
   "gtrL": {
    "inst": "high-gain rhythm guitar, take A (E standard, 2-3 note power chords, tight palm mutes)",
    "pan": -0.85,
    "gainDb": 0,
    "band": true
   },
   "gtrR": {
    "inst": "high-gain rhythm guitar, take B (same part, different cab/detune; plays the open chords in choruses)",
    "pan": 0.85,
    "gainDb": 0,
    "band": true
   },
   "bass": {
    "inst": "gritty picked electric bass (Noodle; duct-taped neck: 'buzz' notes sag)",
    "pan": 0.0,
    "gainDb": 0,
    "band": true
   },
   "lead": {
    "inst": "Granny's lead guitar: singing high gain, 3/16 delay (0.3 s) at ~18%, plate",
    "pan": 0.15,
    "gainDb": -1,
    "band": true
   },
   "organ": {
    "inst": "horror organ: drawbars 16' 8' 2 2/3', slow rotary, a little grit; wide",
    "pan": 0.0,
    "gainDb": -4,
    "band": true
   },
   "clean": {
    "inst": "clean electric guitar: chorus + spring reverb, soft tremolo (safe room)",
    "pan": -0.35,
    "gainDb": -3,
    "band": true
   },
   "musicbox": {
    "inst": "wind-up music box: steel comb tines, short metallic decay (~1.2 s), faint mechanism ticks",
    "pan": 0.3,
    "gainDb": -6,
    "band": false
   },
   "drums": {
    "inst": "big rock kit played with two baseball bats: every attack gets a short wooden tock; toms h/m/f tuned ~A2/F2/C2",
    "pan": 0.0,
    "gainDb": 0,
    "band": true
   },
   "perc": {
    "inst": "see notes.perc (heartbeat, bat clicks, crowd stomps and claps, road cases, chokes)",
    "pan": 0.0,
    "gainDb": 0,
    "band": true
   }
  },
  "sections": {
   "coldopen": {
    "layers": ["organ", "perc.heart", "perc.sticks"],
    "drums": "no kit; heartbeat lub-dub every 2 beats; bat clicks on the count-in (bar 7)",
    "how": "Organ drone E2 B2 F#3 swells in under the rain and radio (bars 0-3), creeps up a semitone to Cmaj7/E on bar 4 as Lou says \"Rescue's two minutes out\", and is choked dead with the heartbeat on \"stop.\" (beat 24.5: the last heartbeat never gets its dub). Bar 6 is rain and the thunder (beat 26). Bar 7: Tiny counts ONE! TWO! THREE! FOUR! clacking his bats."
   },
   "intro": {
    "layers": ["gtrL", "gtrR", "bass", "drums", "lead (10-13, 15)"],
    "drums": "riff groove: kick with the stabs (0/4/8/14), snare 2+4, 8th hats, crash on each bar A",
    "how": "The main riff slams in on bar 8 (title hit) and plays three times: alone (8-9), with the lead doubling the hook an octave above the vocal (10-11), with a twin lead in thirds (12-13). Gang HEY! on step 4 of each riff bar B (beats 37, 45, 53). Bar 14 C5 8ths and a snare build under BRAKES!; bar 15 B5 tremolo, a descending pick slide and a diving pinch harmonic imitate the skid, the whole band hits with the car crash at beat 62.5 and is cut at 62.75 (gap to 64)."
   },
   "verse1a": {
    "layers": ["gtrL", "gtrR", "bass", "drums", "lead (19)"],
    "drums": "full gallop: kick doubles the gallop, snare 2+4, crash on every name",
    "how": "Palm-muted gallop E5 E5 G5 G5 A5 A5 C5 D5. The gang shouts each name on its bar's downbeat (rising E3 G3 A3 C4). Each 2nd bar is the member's freeze-frame lick: 17 the band leaves an E5 ringing for Vex's megaphone squeal (SFX at 70); 19 G5 rings under Granny's E5 G5 A5 Bb5 B5 run and pinch-harmonic dive, then silence for Gerald's pump (79); 21 an A5 hit and Tiny's one-bar bat fill round the toms into the crash on 22; 23 the guitars stop for Noodle's E2 G2 A2 B2 (the B buzzes and sags) and the band stabs D5 on beat 4 into the verse."
   },
   "verse1b": {
    "layers": ["gtrL", "gtrR", "bass", "drums", "vocals"],
    "drums": "lighter gallop (kick gallops on beats 1 and 3 only), snare 2+4, 8th hats",
    "how": "Gallop Em Em C D Em Em; every 2nd bar rests steps 12-15 for the breath. Vex chants on E3/G3/A3 and lands each line on the 2nd bar's downbeat. Bar 30 is stop-time: C5 stabs on each \"don't\" (steps 0/4/8), silence on \"stop,\", RUN! with the gang; bar 31 the full band hits B5 under the Groupie's shriek (124), then palm-muted 16ths and a tom fill as they bolt."
   },
   "pre1": {
    "layers": ["gtrL", "gtrR", "bass", "drums", "lead", "vocals"],
    "drums": "32-33 heavy half-time: floor-tom 8ths, kick+snare stabs with the gang on 8/10/12; 34 double-time skank beat; 35 one big hit on \"drum!\" then a snare build",
    "how": "Roots climb A5 Bb5 B5 under one sung B3 (a 9th, a sour b9, then the root) while the lead holds a B4 feedback pedal. Call and response: Vex \"Here they come,\" over a ringing chord, the gang (B2) \"HERE THEY COME!\" with band stabs. Bar 34 \"a thousand feet\" palm-muted 16ths over the skank beat; bar 35 B5 tremolo crescendo under the held D4 \"drum!\"."
   },
   "chorus1": {
    "layers": ["gtrL", "gtrR", "bass", "drums", "vocals"],
    "drums": "kick 1 and 3 (+ the and of 3), snare 2+4, open-hat 8ths, crash every bar; kick+snare accent on the answer slot (step 12 of each 2nd bar) with the shotgun BLAMs",
    "how": "C5 D5 Em Em | C5>D5 D5 B5 B7: the rising bVI-bVII-i motif opens the chorus. gtrL power-chord 8ths accenting the hook steps 0/4/8/14; gtrR open chords rung out (Cmaj7 voicing on C, so DAN's B3 is doubled); bass 8ths. On STOPS (beat 162, a D4 over D5) the whole band stops dead at 162.5 (gap) and the horde freezes; only the reload (162.75); Tiny's two snare 16ths (163.5) bring everybody back on bar 41."
   },
   "post1": {
    "layers": ["gtrL", "gtrR", "bass", "drums", "lead"],
    "drums": "riff groove; bar 47 kick+snare+crash on the C5 and B5 hits",
    "how": "Main riff x2 with the twin lead; gang HEY! on 181 and 189. Bar 47 ends C5 / B5 (lead C5+E5, B4+D#5) and the whole band's E5 on 48 IS the door slam (crash choked after 2 steps)."
   },
   "saferoom": {
    "layers": ["clean", "musicbox", "organ (50-53)", "bass (52-53)", "perc.heart", "hits: doorPound/pills/knock"],
    "drums": "no kit: heartbeat lub-dub on 1 and 3, the pounding door on 2 and 4 (hit doorPound) = a half-time backbeat; pills as the only shaker",
    "how": "Clean 8th arpeggios Em Em Cmaj7 Cmaj7 Am(add9) B7, each note ringing; organ pad from 50, bass whole notes from 52; the heartbeat races on every beat in bar 53. The music box plays the hook at half speed: KEEP ... THEM ... DAN-CING (48-49), Cmaj7 plinks (50), the riff's Bb-A-G-F# fall as a lullaby (51), KEEP 'EM ON THE BEAT (52-53) - and at beat 216 everything stops exactly where \"IF THE MUSIC STOPS\" would begin. 54-55: room tone, the shave-and-a-haircut knocks (218-221), Tiny's answer (223), the door bursts on 224."
   },
   "verse2": {
    "layers": ["gtrL", "bass", "organ", "drums", "vocals", "gtrR (61.5-)"],
    "drums": "half-time: kick 1 and the and of 2, snare on 3 only, 8th hats; 62-63 the full gallop returns",
    "how": "Heard from outside the theatre: the band bus is low-passed near 2.8 kHz (automation) and only gtrL plays (hard left), with bass and an organ chord per bar. v2a-v2b megaphone, v2c-v2d dry (the confession). Sparks at 246: gtrR feeds back on B4 for two beats, the filter opens by 248, and the gallop returns at full width (62-63); v2d's D#3 is left hanging over B7."
   },
   "chorus2": {
    "layers": ["gtrL", "gtrR", "bass", "drums", "vocals"],
    "drums": "as chorus 1; bar 71 plays straight through into the tape stop",
    "how": "As chorus 1 (the pit grunts HUH! on the answer slots 263/271/279, the band freezes on STOPS 274.5-275.5). MEAT is held 24 steps so the tape stop (286-288) drags Vex and the whole band down into a groan; silence at 288."
   },
   "blackout": {
    "layers": [],
    "drums": "none",
    "how": "Total silence (room tone): two flashlight clicks, the groan \"one... more...\", the 0.3 s 1987 flashback (hit flashback)."
   },
   "crescendo": {
    "layers": [
     "drums (toms, snare)", "perc.stomp", "perc.clap", "perc.case", "vocals (chant)", "gtrL/gtrR feedback (81.5-)"
    ],
    "drums": "74-75 floor tom 3+3+2; 76-77 rack toms join in 8ths; 78-79 snare 16ths accented 3+3+2; 80-81 the full roll (16ths, then 32nds); kick on 1 and 3 from 75",
    "how": "Acoustic only (no power): no guitars, bass or organ. Tiny holds the crowd on the toms and bats on road cases (8th upbeats); the dead stomp on 1 and 3 (from 75) and clap on 2 and 4 (from 76) in perfect sync. The chant C3-D3-E3 (z1 76, z2 80, z3 81 in double time). Generator pulls on 75/77/79 (whirrs peaking C3, D3, D#3), the Roadie's reversing beeps (B4, 309-311) and brass cluster (Bb1+E2, 312), his mic check over ghosted snare. The catch at 324 locks into an E2 idle; amps on at 326 and both guitars feed back up to E5 into the solo."
   },
   "solo": {
    "layers": ["gtrL", "gtrR", "bass", "drums", "lead"],
    "drums": "82-83 riff groove, 84-85 skank double-time, 86-88 double kick 16ths with ride quarters, 89 the DING (no crash), Roadie thud + floor tom, triplet fill",
    "how": "Granny: the hook an octave above the vocal (82-83), a third higher (84-85), descending fours over C5 (86), a run up to D6 over D5 (87), a tapped B7 arpeggio (88), then she bends up to B5 exactly with the cymbal DING (356) and holds it while the band rings B5; unison triplet B-A-G into the lift."
   },
   "lift": {
    "layers": ["gtrL", "gtrR", "bass", "lead (90)", "organ (91)", "drums", "vocals"],
    "drums": "90 one hit, choked; 91 snare 16ths crescendo to 32nds",
    "how": "B5 hit on beat 360, choked on 361; Lou talks in the hole over the chopper fading in. EVERYBODY UP! (a 16th pickup E3 G3 A3 B3 to D4 on beat 3) over D5 8ths > E5 8ths with an upward pick slide; the organ goes D then E major (its G# announces the new key) and the song lands in F# minor."
   },
   "chorus3": {
    "layers": ["gtrL", "gtrR", "bass", "drums", "organ", "lead", "vocals (gang on every line)"],
    "drums": "as chorus 1 but NO hats (the chopper thup replaces them), ride bell on quarters, crash every bar; 100/102 kick quarters only; 101/103 stabs with crashes; 103 snare roll from step 12",
    "how": "Chorus 1 up a whole tone (D5 E5 F#m F#m D5>E5 E5 C#5 C#7) with an organ pad, the gang on every line and the lead doubling Vex an octave up. STOPS (386) stops the band; only the chopper blades (386.5-387.5). Fireworks on the answer slots. 100-103: Vex calls ONE MORE SONG? / HOW MANY MORE? over N.C. (kick quarters, blades); the crowd answers ONE! MORE! SONG! on D3 E3 F#3 with band stabs D5 E5 F#5 (the motif) and crashes."
   },
   "ending": {
    "layers": ["gtrL", "gtrR", "bass", "lead", "organ", "drums"],
    "drums": "the big roll: snare 32nds, crashes on every beat, kick 16ths and floor toms on beat 4; final hit on 420",
    "how": "F#5 tremolo, F#1 tremolo bass, the lead screaming A5, organ F#m swell, GOOD NIGHT! (418), and the final hit F#5 on beat 420, ringing to 422 and choked; silence."
   },
   "coda": {
    "layers": ["musicbox (110-111)"],
    "drums": "none",
    "how": "Thermal hum, muffled blades and applause are SFX. The music box comes back in E MINOR (the loop restarting): KEEP THEM DAN-CING (440-443.5), then IF THE MU-SIC slowing (445, 445.6, 446.3, 447.2); the spring runs out with a click at 447.9 and STOPS (D6) never comes."
   }
  },
  "automation": [
   {
    "target": "band",
    "param": "lowpassHz",
    "points": [[224, 2800], [246, 2800], [248, 20000]],
    "note": "verse 2 is heard from outside the theatre; opens after Noodle plugs in (sparks 246). Interpolate log-frequency between points; before the first / after the last point hold the value."
   },
   {
    "target": "band",
    "param": "tapeSpeed",
    "points": [[286, 1.0], [288, 0.0]],
    "note": "the tape stop: playback speed of the whole band and Vex falls from 1 to 0 (pitch with it, ease-in curve), then silence at 288. Same as hit tapeStop."
   },
   {
    "target": "organ",
    "param": "gainDb",
    "points": [[0, -18], [8, -6]],
    "note": "the cold-open drone fades in over the first two beats"
   },
   {
    "target": "drums.hat+open",
    "param": "mute",
    "points": [[368, 1], [420, 1]],
    "note": "final chorus: no hats at all (the chopper thup is the hat); already true in SCORE.drums"
   }
  ],
  "chordTones": {
   "Em": [40, 47, 52, 55, 59, 64],
   "Cmaj7/E": [40, 48, 55, 59],
   "E5": [40, 47, 52],
   "F#5": [42, 49, 54],
   "G5": [43, 50, 55],
   "A5": [45, 52, 57],
   "Bb5": [46, 53, 58],
   "B5": [47, 54, 59],
   "C5": [48, 55, 60],
   "C#5": [49, 56, 61],
   "D5": [50, 57, 62],
   "C": [48, 52, 55, 60, 64],
   "D": [50, 57, 62, 66],
   "B7": [47, 51, 57, 59, 66],
   "Cmaj7": [48, 52, 55, 59, 64],
   "Am(add9)": [45, 52, 59, 60, 64],
   "Am": [45, 52, 57, 60, 64],
   "F#m": [42, 49, 54, 57, 61, 66],
   "C#7": [49, 53, 59, 61, 65]
  },
  "bootleg1987": {
   "bars": [36, 44],
   "key": "E minor",
   "lyric": "DEAD MEAT (chorus 1 as written)",
   "how": "Render chorus 1 (bars 36-43: tracks, drums, vocals c1a-c1d incl. the STOPS gap) as a live 1987 audience tape: mono, band-limited 120 Hz-6 kHz, wow 0.4 Hz and flutter 6 Hz, hiss, room/crowd bleed; the crowd yells ONE MORE SONG between the lines (in the answer slots instead of the shotguns); a fire-alarm bell (~1 kHz, 18 Hz clapper) enters 6 s in and keeps ringing; ends in rising feedback and a tape cut. Used by hit radioTune (0:00), hit flashback (294.25-295) and radio station 870 (bleed)."
  }
 },
 "drums": {
  "kick": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "X...x...X.....x.", "x.......x.x.x.x.",
   "X...x...X.....x.", "x.......x.x.x.x.", "X...x...X.....x.", "x.......x.x.x.x.", "x...x...x...x...",
   "X.........X.....", "x.xxx.xxx.xxx.xx", "x.xxx.xxX.......", "x.xxx.xxx.xxx.xx", "X...............",
   "x.xxx.xxx.xxx.xx", "X...X...X...X...", "x.xxx.xxx.xxx.xx", "............X...", "x.xx....x.xx....",
   "x.xx....x.xx....", "x.xx....x.xx....", "x.xx....x.xx....", "x.xx....x.xx....", "x.xx....x.xx....",
   "X...X...X.......", "X.......x...x...", "X.......X.X.X...", "X.......X.X.X...", "x...x...x...x...",
   "X...............", "X.......X.x.....", "x.......x.x.X...", "X.......X.x.....", "x.......x.x.X...",
   "X.......X.......", "x.......x.x.X...", "X.......X.x.....", "X.......X...X...", "X...x...X.....x.",
   "x.......x.x.x.x.", "X...x...X.....x.", "x.......X...X...", "X...............", "................",
   "................", "................", "................", "................", "................",
   "................", "X.....x...x.....", "x.....x...x.....", "x.....x...x.....", "x.....x...x.....",
   "x.....x...x.....", "x.....x...x.....", "x.xxx.xxx.xxx.xx", "x.xxx.xxx.xx....", "X.......X.x.....",
   "x.......x.x.X...", "X.......X.x.....", "x.......x.x.X...", "X.......X.......", "x.......x.x.X...",
   "X.......X.x.....", "X.......X.x.....", "................", "................", "................",
   "X.......x.......", "X.......x.......", "X.......x.......", "X.......x.......", "X.......x.......",
   "X...x...X...x...", "X...x...X...x...", "X...x...X.....x.", "x.......x.x.x.x.", "x...x...x...x...",
   "x...x...x...x...", "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxx", "X...X.......X...",
   "X...............", "X.......X.......", "X.......X.x.....", "x.......x.x.X...", "X.......X.x.....",
   "x.......x.x.X...", "X.......X.......", "x.......x.x.X...", "X.......X.x.....", "X.......X...X...",
   "x...x...x...x...", "X...X...X.......", "x...x...x...x...", "X...X...X.......", "X.......x.x.xxxx",
   "X...............", "................", "................", "................", "................",
   "................", "................"
  ],
  "snare": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "....X.......X...", "....X.......X...",
   "....X.......X...", "....X.......X.xx", "....X.......X...", "....X.......X...", "x.x.x.x.x.x.xxxx",
   "xxxxrrrrrrX.....", "....X.......X...", "....X...........", "....X.......X...", "................",
   "....X.......X...", "................", "....X.......X...", "............X.rr", "....X..g....X...",
   "....X..g....X...", "....X..g....X...", "....X..g....X.xx", "....X..g....X...", "....X..g....X...",
   "X...X...X...xxXX", "........x.x.....", "........X.X.X...", "........X.X.X...", "..x...x...x...x.",
   "....x.x.x.xxXXrr", "....X.......X...", "....X.......X...", "....X.......X...", "....X.......X...",
   "....X...X.....xx", "....X.......X...", "....X.......X...", "....X...X...X...", "....X.......X...",
   "....X.......X...", "....X.......X...", "....X...X...X...", "X...............", "................",
   "................", "................", "................", "................", "................",
   "................", "X.......X.......", "........X.......", "........X.......", "........X.....xx",
   "........X.......", "........X...xxXX", "....X.......X...", "....X.......Xx..", "....X.......X...",
   "....X.......X...", "....X.......X...", "....X.......X...", "....X...X.....xx", "....X.......X...",
   "....X.......X...", "....X.......X...", "................", "................", "................",
   "................", "................", "................", ".ggxggxgxggxggxg", "XggXggXgXggXggXg",
   "XxxxXxxxXxxxXxxx", "rrrrrrrrrrrrrrrr", "....X.......X...", "....X.......X...", "..x...x...x...x.",
   "..x...x...x.xxXX", "....X.......X...", "....X.......X...", "....X.......X...", "............X...",
   "X...............", "ggggxxxxxxxxXXrr", "....X.......X...", "....X.......X...", "....X.......X...",
   "....X.......X...", "....X...X.....xx", "....X.......X...", "....X.......X...", "....X...X...X...",
   "................", "X...X...X.......", "................", "X...X...X...rrrr", "rrrrrrrrrrrrrrrr",
   "X...............", "................", "................", "................", "................",
   "................", "................"
  ],
  "hat": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "................",
   "................", "x.x.x.x.x.x.x.x.", "x.x.x.x.........", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.....",
   "x.x.x.x.x.x.x.x.", "................", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.....", "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.",
   "................", "................", "................", "................", "x.x.x.x.x.x.x.x.",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.........", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "..x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x...", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.x.x.", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................"
  ],
  "open": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.....", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.....",
   "x.x.x.x.........", "x.x.x.x.x.x.....", "x.x.x.x.x.x.x.x.", "x.x.x.x.........", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "x.x.x.x.x.x.x.x.",
   "x.x.x.x.x.x.....", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.....", "x.x.x.x.........", "x.x.x.x.x.x.....",
   "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x.", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................"
  ],
  "crash": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "X...............", "................",
   "X...............", "................", "X...............", "................", "X...............",
   "..........X.....", "X...............", "........X.......", "X...............", "X...............",
   "X...............", "................", "X...............", "................", "X...............",
   "................", "................", "................", "................", "................",
   "X...X...X.......", "X...............", "X...............", "X...............", "X...............",
   "X...............", "X...............", "X...............", "X...............", "X...............",
   "X.......X.......", "X...............", "X...............", "X.......X.......", "X...............",
   "................", "X...............", "........X...X...", "X...............", "................",
   "................", "................", "................", "................", "................",
   "................", "X...............", "................", "................", "................",
   "................", "................", "X...............", "................", "X...............",
   "X...............", "X...............", "X...............", "X.......X.......", "X...............",
   "X...............", "X...............", "................", "................", "................",
   "................", "................", "................", "X...............", "................",
   "................", "X...............", "X...............", "X...............", "X...............",
   "X...............", "X...............", "X...............", "X...............", "................",
   "X...............", "................", "X...............", "X...............", "X...............",
   "X...............", "X.......X.......", "X...............", "X...............", "X.......X.......",
   "................", "X...X...X.......", "................", "X...X...X.......", "X...x...X...x...",
   "X...............", "................", "................", "................", "................",
   "................", "................"
  ],
  "ride": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "x...x...x...x...", "x...x...x...x...", "x...x...x...x...", "................",
   "................", "................", "x...x...x...x...", "x...x...x.......", "x...x...x...x...",
   "x...x...x.......", "x...x...........", "x...x...x.......", "x...x...x...x...", "x...x...........",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................"
  ],
  "tom": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "H.hhM.mmF.ffFFFF", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "............HhMF", "F.f.F.f.........", "F.f.F.f.........", "................",
   "F...............", "................", "................", "................", "................",
   "................", "................", "................", ".............HMF", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "..............MF", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "F..f..f.f..f..f.",
   "F..f..f.F..f..f.", "F.hfm.F.F.hfm.F.", "F.hfm.F.F.hfm.F.", "F...............", "F.....F.F.....F.",
   "F.......F.......", "............FFFF", "................", "................", "................",
   "................", "................", "................", "................", "....F........MF.",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", ".............HMF",
   "................", "................", "................", "................", "............FFFF",
   "F...............", "................", "................", "................", "................",
   "................", "................"
  ]
 },
 "perc": {
  "heart": [
   "........X.x.....", "X.x.....X.x.....", "X.x.....X.x.....", "X.x.....X.x.....", "X.x.....X.x.....",
   "X.x.....X.x.....", "X...............", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "........X.x.....", "X.x.....X.x.....",
   "X.x.....X.x.....", "X.x.....X.x.....", "X.x.....X.x.....", "X.x.X.x.X.x.X.x.", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................"
  ],
  "sticks": [
   "................", "................", "................", "................", "................",
   "................", "................", "X...X...X...X...", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................"
  ],
  "stomp": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "X.......X.......", "X.......X.......", "X.......X.......", "X.......X.......", "X.......X.......",
   "X.......X.......", "X.......X.......", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................"
  ],
  "clap": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "....X.......X...", "....X.......X...", "....X.......X...", "....X.......X...",
   "....X.......X...", "....X.......X...", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................"
  ],
  "case": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "..x.......x.....", "..x...x...x...x.", "..x...x...x...x.", "..x...x...x...x.", "..x...x...x...x.",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................"
  ],
  "choke": [
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "...........x....", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "..x...x...x.....", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "..........x.....", "................", "................", "................", "................",
   "................", "................", "................", "..x.............", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "..........x.....", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "................", "................", "................", "................", "................",
   "....x...........", "................", "................", "................", "................",
   "................", "..........x.....", "................", "................", "................",
   "................", "...x...x......x.", "................", "...x...x........", "................",
   "........x.......", "................", "................", "................", "................",
   "................", "................"
  ]
 },
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
    "words": [["VEX!", 0]],
    "notes": [["VEX", 0, 4, 52]]
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
    "words": [["GRANNY!", 0]],
    "notes": [["GRAN", 0, 2, 55], ["NY", 2, 4, 55]]
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
    "words": [["TINY!", 0]],
    "notes": [["TI", 0, 2, 57], ["NY", 2, 4, 57]]
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
    "words": [["NOODLE!", 0]],
    "notes": [["NOO", 0, 2, 60], ["DLE", 2, 4, 60]]
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
    "words": [["Three", 0], ["A.M.", 2], ["on", 8], ["the", 10], ["county", 12], ["line", 16]],
    "notes": [
     ["Three", 0, 2, 52], ["A", 2, 2, 55], ["M", 4, 2, 55], ["on", 8, 2, 52], ["the", 10, 2, 52], ["coun", 12, 2, 55],
     ["ty", 14, 2, 57], ["line", 16, 8, 59]
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
    "words": [["Lou", 0], ["on", 4], ["the", 6], ["radio,", 8], ["right", 12], ["on", 14], ["time", 16]],
    "notes": [
     ["Lou", 0, 4, 55], ["on", 4, 2, 52], ["the", 6, 2, 52], ["ra", 8, 2, 55], ["di", 10, 1, 55], ["o", 11, 1, 52],
     ["right", 12, 2, 55], ["on", 14, 2, 57], ["time", 16, 8, 54]
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
     ["Girl", 0], ["in", 2], ["the", 3], ["alley", 4], ["says", 8], ["she's", 10], ["number", 12], ["one,", 16]
    ],
    "notes": [
     ["Girl", 0, 2, 52], ["in", 2, 1, 52], ["the", 3, 1, 52], ["al", 4, 2, 55], ["ley", 6, 2, 55], ["says", 8, 2, 57],
     ["she's", 10, 2, 57], ["num", 12, 2, 59], ["ber", 14, 2, 57], ["one", 16, 8, 59]
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
     ["Don't", 0], ["look,", 2], ["don't", 4], ["touch,", 6], ["don't", 8], ["stop,", 10], ["just", 12], ["RUN!", 14]
    ],
    "notes": [
     ["Don't", 0, 2, 55], ["look", 2, 2, 55], ["don't", 4, 2, 55], ["touch", 6, 2, 55], ["don't", 8, 2, 57],
     ["stop", 10, 2, 57], ["just", 12, 2, 57], ["RUN", 14, 10, 59]
    ],
    "gangOn": [7]
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
    "words": [["Here", 0], ["they", 2], ["come,", 4]],
    "notes": [["Here", 0, 2, 59], ["they", 2, 2, 59], ["come", 4, 4, 59]]
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
    "words": [["HERE", 8], ["THEY", 10], ["COME!", 12]],
    "notes": [["HERE", 8, 2, 47], ["THEY", 10, 2, 47], ["COME", 12, 4, 47]]
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
    "words": [["Here", 0], ["they", 2], ["come,", 4]],
    "notes": [["Here", 0, 2, 59], ["they", 2, 2, 59], ["come", 4, 4, 59]]
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
    "words": [["HERE", 8], ["THEY", 10], ["COME!", 12]],
    "notes": [["HERE", 8, 2, 47], ["THEY", 10, 2, 47], ["COME", 12, 4, 47]]
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
    "words": [["a", 0], ["thousand", 2], ["feet", 6], ["and", 8], ["a", 10], ["single", 12], ["drum!", 16]],
    "notes": [
     ["a", 0, 2, 59], ["thou", 2, 2, 59], ["sand", 4, 2, 59], ["feet", 6, 2, 59], ["and", 8, 2, 59], ["a", 10, 2, 59],
     ["sin", 12, 2, 59], ["gle", 14, 2, 60], ["drum", 16, 12, 62]
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
    "words": [["KEEP", 0], ["THEM", 4], ["DANCING!", 8]],
    "notes": [["KEEP", 0, 4, 55], ["THEM", 4, 4, 55], ["DAN", 8, 6, 59], ["CING", 14, 10, 57]]
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
    "words": [["KEEP", 0], ["'EM", 4], ["ON", 8], ["THE", 10], ["BEAT!", 12]],
    "notes": [["KEEP", 0, 4, 55], ["EM", 4, 4, 55], ["ON", 8, 2, 57], ["THE", 10, 2, 57], ["BEAT", 12, 12, 59]],
    "gangOn": [4]
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
    "words": [["IF", 0], ["THE", 2], ["MUSIC", 4], ["STOPS,", 8]],
    "notes": [["IF", 0, 2, 59], ["THE", 2, 2, 59], ["MU", 4, 2, 60], ["SIC", 6, 2, 59], ["STOPS", 8, 2, 62]]
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
    "words": [["WE'RE", 0], ["ALL", 2], ["DEAD", 4], ["MEAT!", 8]],
    "notes": [["WE'RE", 0, 2, 59], ["ALL", 2, 2, 59], ["DEAD", 4, 4, 57], ["MEAT", 8, 14, 54]],
    "gangOn": [3]
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
     ["Same", 0], ["old", 2], ["stage", 4], ["and", 8], ["the", 10], ["same", 12], ["old", 14], ["crowd,", 16]
    ],
    "notes": [
     ["Same", 0, 2, 52], ["old", 2, 2, 52], ["stage", 4, 4, 55], ["and", 8, 2, 52], ["the", 10, 2, 52],
     ["same", 12, 2, 55], ["old", 14, 2, 57], ["crowd", 16, 8, 59]
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
     ["same", 0], ["stopped", 2], ["clock", 4], ["and", 8], ["the", 10], ["same", 12], ["black", 14], ["cloud,", 16]
    ],
    "notes": [
     ["same", 0, 2, 55], ["stopped", 2, 2, 55], ["clock", 4, 4, 52], ["and", 8, 2, 52], ["the", 10, 2, 52],
     ["same", 12, 2, 55], ["black", 14, 2, 57], ["cloud", 16, 8, 54]
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
    "words": [["found", 0], ["my", 2], ["name", 4], ["on", 8], ["the", 10], ["safe-room", 12], ["wall,", 16]],
    "notes": [
     ["found", 0, 2, 52], ["my", 2, 2, 52], ["name", 4, 4, 55], ["on", 8, 2, 52], ["the", 10, 2, 52],
     ["safe", 12, 2, 55], ["room", 14, 2, 57], ["wall", 16, 8, 59]
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
    "words": [["don't", 0], ["remember", 2], ["writing", 8], ["it", 12], ["at", 14], ["all.", 16]],
    "notes": [
     ["don't", 0, 2, 52], ["re", 2, 2, 52], ["mem", 4, 2, 57], ["ber", 6, 2, 55], ["wri", 8, 2, 52],
     ["ting", 10, 2, 52], ["it", 12, 2, 52], ["at", 14, 2, 54], ["all", 16, 12, 51]
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
    "words": [["KEEP", 0], ["THEM", 4], ["DANCING!", 8]],
    "notes": [["KEEP", 0, 4, 55], ["THEM", 4, 4, 55], ["DAN", 8, 6, 59], ["CING", 14, 10, 57]]
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
    "words": [["KEEP", 0], ["'EM", 4], ["ON", 8], ["THE", 10], ["BEAT!", 12]],
    "notes": [["KEEP", 0, 4, 55], ["EM", 4, 4, 55], ["ON", 8, 2, 57], ["THE", 10, 2, 57], ["BEAT", 12, 12, 59]],
    "gangOn": [4]
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
    "words": [["IF", 0], ["THE", 2], ["MUSIC", 4], ["STOPS,", 8]],
    "notes": [["IF", 0, 2, 59], ["THE", 2, 2, 59], ["MU", 4, 2, 60], ["SIC", 6, 2, 59], ["STOPS", 8, 2, 62]]
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
    "words": [["WE'RE", 0], ["ALL", 2], ["DEAD", 4], ["MEAT!", 8]],
    "notes": [["WE'RE", 0, 2, 59], ["ALL", 2, 2, 59], ["DEAD", 4, 4, 57], ["MEAT", 8, 24, 54]],
    "gangOn": [3]
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
    "words": [["ONE!", 0], ["MORE!", 4], ["SONG!", 8]],
    "notes": [["ONE", 0, 3, 48], ["MORE", 4, 3, 50], ["SONG", 8, 6, 52]]
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
    "words": [["ONE!", 0], ["MORE!", 4], ["SONG!", 8]],
    "notes": [["ONE", 0, 3, 48], ["MORE", 4, 3, 50], ["SONG", 8, 6, 52]]
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
    "words": [["ONE!", 0], ["MORE!", 2], ["SONG!", 4], ["ONE!", 8], ["MORE!", 10], ["SONG!", 12]],
    "notes": [
     ["ONE", 0, 2, 48], ["MORE", 2, 2, 50], ["SONG", 4, 3, 52], ["ONE", 8, 2, 48], ["MORE", 10, 2, 50],
     ["SONG", 12, 4, 52]
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
    "words": [["EVERYBODY", 4], ["UP!", 8]],
    "notes": [["EV", 4, 1, 52], ["ERY", 5, 1, 55], ["BO", 6, 1, 57], ["DY", 7, 1, 59], ["UP", 8, 8, 62]]
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
    "words": [["KEEP", 0], ["THEM", 4], ["DANCING!", 8]],
    "notes": [["KEEP", 0, 4, 57], ["THEM", 4, 4, 57], ["DAN", 8, 6, 61], ["CING", 14, 10, 59]]
   },
   {
    "id": "c3b",
    "bar": 94,
    "part": "chorus",
    "singer": "vex+gang",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "KEEP 'EM ON THE BEAT!",
    "words": [["KEEP", 0], ["'EM", 4], ["ON", 8], ["THE", 10], ["BEAT!", 12]],
    "notes": [["KEEP", 0, 4, 57], ["EM", 4, 4, 57], ["ON", 8, 2, 59], ["THE", 10, 2, 59], ["BEAT", 12, 12, 61]]
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
    "words": [["IF", 0], ["THE", 2], ["MUSIC", 4], ["STOPS,", 8]],
    "notes": [["IF", 0, 2, 61], ["THE", 2, 2, 61], ["MU", 4, 2, 62], ["SIC", 6, 2, 61], ["STOPS", 8, 2, 64]]
   },
   {
    "id": "c3d",
    "bar": 98,
    "part": "chorus",
    "singer": "vex+gang",
    "fx": "megaphone",
    "display": "lyric",
    "zone": "auto",
    "text": "WE'RE DEAD ON OUR FEET!",
    "words": [["WE'RE", 0], ["DEAD", 2], ["ON", 4], ["OUR", 6], ["FEET!", 8]],
    "notes": [["WE'RE", 0, 2, 61], ["DEAD", 2, 2, 61], ["ON", 4, 2, 59], ["OUR", 6, 2, 59], ["FEET", 8, 14, 56]]
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
    "words": [["ONE", 0], ["MORE", 4], ["SONG?", 8]],
    "notes": [["ONE", 0, 4, 54], ["MORE", 4, 4, 57], ["SONG", 8, 8, 61]]
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
    "words": [["ONE!", 0], ["MORE!", 4], ["SONG!", 8]],
    "notes": [["ONE", 0, 3, 50], ["MORE", 4, 3, 52], ["SONG", 8, 6, 54]]
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
    "words": [["HOW", 0], ["MANY", 4], ["MORE?", 8]],
    "notes": [["HOW", 0, 4, 54], ["MA", 4, 2, 57], ["NY", 6, 2, 57], ["MORE", 8, 8, 61]]
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
    "words": [["ONE!", 0], ["MORE!", 4], ["SONG!", 8]],
    "notes": [["ONE", 0, 3, 50], ["MORE", 4, 3, 52], ["SONG", 8, 6, 54]]
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
    "win": [4, 11.75],
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
    "win": [12, 16.75],
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
    "win": [17, 20],
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
    "win": [20, 25.5],
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
    "win": [28, 32],
    "words": [["ONE!", 0], ["TWO!", 4], ["THREE!", 8], ["FOUR!", 12]],
    "dur": null
   },
   {
    "id": "groan",
    "bar": 73,
    "beat": 0,
    "voice": "zombie",
    "fx": "dry",
    "text": "one... more...",
    "win": [292.5, 296],
    "words": [["one...", 2], ["more...", 12]],
    "dur": null
   },
   {
    "id": "lou_rescue",
    "bar": 74,
    "beat": 2,
    "voice": "lou",
    "fx": "radio",
    "text": "Rescue's two minutes out.",
    "win": [298, 302],
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
    "win": [313.5, 316],
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
    "win": [361, 364.5],
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
    "win": [418, 420],
    "words": [["GOOD", 0], ["NIGHT!", 2]],
    "dur": null
   },
   {
    "id": "fan",
    "bar": 107,
    "beat": 0,
    "voice": "fan",
    "fx": "distant",
    "text": "One more song!",
    "win": [428, 431],
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
    "win": [432, 438],
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
  {"type": "thunder", "beat": 10, "k": 0.5},
  {"type": "organChoke", "beat": 24.5, "note": "organ drone and heartbeat stop dead on \"stop.\""},
  {"type": "thunder", "beat": 26, "note": "into the silence after \"stop.\""},
  {"type": "countIn", "beat": 28, "toBeat": 32},
  {"type": "titleHit", "beat": 32},
  {
   "type": "gangHey",
   "beat": 37,
   "pitch": "A3",
   "note": "the gang shouts HEY! on step 4 of a main-riff bar B (over the ringing A5)"
  },
  {"type": "zombieBonk", "beat": 42},
  {
   "type": "gangHey",
   "beat": 45,
   "pitch": "A3",
   "note": "the gang shouts HEY! on step 4 of a main-riff bar B (over the ringing A5)"
  },
  {"type": "zombieBonk", "beat": 47},
  {"type": "zombieBonk", "beat": 53},
  {
   "type": "gangHey",
   "beat": 53,
   "pitch": "A3",
   "note": "the gang shouts HEY! on step 4 of a main-riff bar B (over the ringing A5)"
  },
  {"type": "zombieBonk", "beat": 56},
  {"type": "skid", "beat": 60, "toBeat": 62.5},
  {
   "type": "fill",
   "beat": 60,
   "toBeat": 62.5,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): snare roll under the skid into the crash"
  },
  {"type": "carCrash", "beat": 62.5},
  {
   "type": "lick",
   "beat": 70,
   "who": "vex",
   "note": "megaphone feedback squeal on B4, beats 3-4 of bar 17",
   "part": "sfx"
  },
  {
   "type": "lick",
   "beat": 76,
   "who": "granny",
   "note": "16ths E5 G5 A5 Bb5 B5, pinch-harmonic dive bomb",
   "part": "lead"
  },
  {"type": "pump", "beat": 79, "note": "Gerald's pump chk-chk"},
  {
   "type": "lick",
   "beat": 84,
   "who": "tiny",
   "note": "tom fill with baseball bats (wooden tock) into one crash",
   "part": "drums"
  },
  {
   "type": "fill",
   "beat": 84,
   "toBeat": 88,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): Tiny's bat fill around the toms into one crash (lick)"
  },
  {
   "type": "lick",
   "beat": 92,
   "who": "noodle",
   "note": "bass lick E2 G2 A2 B2, the B buzzing and sagging a quarter-tone (duct-taped neck)",
   "part": "bass"
  },
  {
   "type": "fill",
   "beat": 95,
   "toBeat": 96,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): snare pickup into verse 1"
  },
  {"type": "groupieSob", "beat": 112, "toBeat": 124},
  {
   "type": "fill",
   "beat": 123,
   "toBeat": 124,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): snare 16ths under \"just RUN!\""
  },
  {"type": "groupieShriek", "beat": 124},
  {
   "type": "fill",
   "beat": 127,
   "toBeat": 128,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): tom fill into the pre-chorus"
  },
  {"type": "hordeRoar", "beat": 128, "toBeat": 136},
  {"type": "hordeRoar", "beat": 140, "toBeat": 144},
  {
   "type": "fill",
   "beat": 141,
   "toBeat": 144,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): snare build on \"...a single drum!\" into the chorus"
  },
  {"type": "shotgun", "beat": 151},
  {"type": "shotgun", "beat": 159},
  {"type": "reload", "beat": 162.75, "note": "inside the STOPS gap: only the reload sounds"},
  {"type": "shotgun", "beat": 167},
  {"type": "shotgun", "beat": 174},
  {"type": "shotgun", "beat": 175},
  {
   "type": "fill",
   "beat": 175.25,
   "toBeat": 176,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): tom fill after the line-end hits"
  },
  {
   "type": "gangHey",
   "beat": 181,
   "pitch": "A3",
   "note": "the gang shouts HEY! on step 4 of a main-riff bar B (over the ringing A5)"
  },
  {
   "type": "gangHey",
   "beat": 189,
   "pitch": "A3",
   "note": "the gang shouts HEY! on step 4 of a main-riff bar B (over the ringing A5)"
  },
  {"type": "doorSlam", "beat": 192, "note": "the band stab on bar 48 is the slam"},
  {"type": "musicBox", "beat": 192, "toBeat": 215, "note": "the hook at half speed"},
  {"type": "doorPound", "beat": 197, "toBeat": 216, "every": 2, "note": "the backbeat of the breakdown"},
  {"type": "pills", "beat": 198, "toBeat": 206, "note": "the pill bottle as a 16th-note shaker"},
  {"type": "knock", "beat": 218},
  {"type": "knock", "beat": 219},
  {"type": "knock", "beat": 219.5},
  {"type": "knock", "beat": 220},
  {"type": "knock", "beat": 221},
  {"type": "tinyKnock", "beat": 223, "note": "Tiny answers the knock: two bits"},
  {"type": "doorBurst", "beat": 224},
  {
   "type": "sparks",
   "beat": 246,
   "note": "Noodle plugs in: ZZZAP, amp-on thunk, mains hum, 2 beats of B4 feedback swelling into the right guitar"
  },
  {
   "type": "fill",
   "beat": 247,
   "toBeat": 248,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): snare build as the filter opens"
  },
  {
   "type": "fill",
   "beat": 254,
   "toBeat": 256,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): fill into chorus 2"
  },
  {"type": "crowdHuh", "beat": 263},
  {"type": "crowdHuh", "beat": 271},
  {"type": "zombieHuh", "beat": 275},
  {"type": "crowdHuh", "beat": 279},
  {"type": "tapeStop", "beat": 286, "toBeat": 288},
  {"type": "flashlightClick", "beat": 290},
  {"type": "flashlightClick", "beat": 291},
  {"type": "phonesUp", "beat": 292.5, "note": "hundreds of phone screens light up on \"one...\""},
  {
   "type": "flashback",
   "beat": 294.25,
   "toBeat": 295,
   "note": "0.3 s of the 1987 bootleg: chord, ...MORE SONG!, fire roar, alarm bell; cut by a tape click as the reflection vanishes"
  },
  {"type": "genPull", "beat": 300, "pitch": "C3"},
  {"type": "genPull", "beat": 308, "pitch": "D3"},
  {"type": "reverseBeep", "beat": 309, "pitch": "B4"},
  {"type": "reverseBeep", "beat": 310, "pitch": "B4"},
  {"type": "reverseBeep", "beat": 311, "pitch": "B4"},
  {
   "type": "roadieStinger",
   "beat": 312,
   "note": "detuned low brass cluster Bb1+E2, sub drop, stomp",
   "pitches": ["Bb1", "E2"]
  },
  {"type": "stomp", "beat": 313},
  {"type": "stomp", "beat": 315},
  {"type": "genPull", "beat": 316, "pitch": "D#3"},
  {
   "type": "fill",
   "beat": 320,
   "toBeat": 328,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): the full roll: 16ths then 32nds into the solo"
  },
  {"type": "genCatch", "beat": 324, "note": "locks into an E2 idle with an 8th-note chug"},
  {"type": "ampsOn", "beat": 326, "note": "click and hum; both guitars feed back up to E5 into the solo"},
  {"type": "lightsOn", "beat": 328},
  {"type": "pyro", "beat": 328},
  {"type": "pyro", "beat": 332},
  {"type": "pyro", "beat": 336},
  {"type": "pyro", "beat": 340},
  {
   "type": "fill",
   "beat": 343,
   "toBeat": 344,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): snare fill into the double kick"
  },
  {"type": "pyro", "beat": 344},
  {
   "type": "curtainFire",
   "beat": 344,
   "toBeat": 360,
   "note": "the stage-left jet licks the curtain at bar 86; a small flame climbs it"
  },
  {"type": "pyro", "beat": 348},
  {"type": "pyro", "beat": 352},
  {"type": "frisbee", "beat": 354},
  {"type": "pyro", "beat": 356},
  {"type": "ding", "beat": 356, "pitch": "B5"},
  {"type": "roadieThud", "beat": 357},
  {
   "type": "fill",
   "beat": 359,
   "toBeat": 360,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): triplet fill (B-A-G) into the lift"
  },
  {"type": "bandHit", "beat": 360, "note": "B5 hit on beat 1, choked on beat 2; Lou in the hole"},
  {
   "type": "chopper",
   "beat": 360,
   "toBeat": 448,
   "note": "a 16th-note thup locked to the grid, low-passed; replaces the hats in the final chorus; muffled in the coda"
  },
  {
   "type": "fill",
   "beat": 364,
   "toBeat": 368,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): snare 16th roll under EVERYBODY UP!"
  },
  {"type": "fireworks", "beat": 375},
  {"type": "fireworks", "beat": 383},
  {"type": "fireworks", "beat": 391},
  {"type": "fireworks", "beat": 398},
  {"type": "fireworks", "beat": 399},
  {
   "type": "fill",
   "beat": 399.25,
   "toBeat": 400,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): tom fill after the line-end hits"
  },
  {
   "type": "fill",
   "beat": 415,
   "toBeat": 420,
   "note": "drum fill (picture cue for Tiny; the notes are in SCORE.drums): the big roll: snare from 103 step 12, the whole of bar 104, toms and kick into the final hit"
  },
  {"type": "finalHit", "beat": 420},
  {"type": "burn", "beat": 422, "toBeat": 424, "note": "the freeze-frame burns like jammed film"},
  {"type": "thermalHum", "beat": 424, "toBeat": 448},
  {"type": "applause", "beat": 426, "toBeat": 447, "note": "real crowd applause and whistles, distant"},
  {"type": "hudChirp", "beat": 438, "note": "HEAT SIGNATURES 1,204 -> 1,205"},
  {
   "type": "musicBoxCoda",
   "beat": 440,
   "toBeat": 447.9,
   "note": "E minor; slows; the spring runs out with a click before STOPS"
  }
 ],
 "gaps": [
  {"fromBeat": 62.75, "toBeat": 64, "note": "after the crash: debris only"},
  {"fromBeat": 162.5, "toBeat": 163.5, "note": "ch1: the band stops on STOPS; only the reload"},
  {"fromBeat": 216.25, "toBeat": 218, "note": "safe room: everything stops; the handwriting line lands"},
  {"fromBeat": 221.25, "toBeat": 223, "note": "the pause before Tiny answers the knock"},
  {"fromBeat": 274.5, "toBeat": 275.5, "note": "ch2: the pit freezes mid-headbang; one zombie huh?"},
  {
   "fromBeat": 288,
   "toBeat": 296,
   "note": "blackout: room tone, two clicks, the groan, the 0.3 s flashback; no band"
  },
  {"fromBeat": 386.5, "toBeat": 387.5, "note": "ch3: only the chopper blades"},
  {"fromBeat": 422, "toBeat": 448, "note": "after the final hit has rung: no band; only the coda sounds"}
 ],
 "captions": [
  {"bar": 0, "beat": 1, "beats": 5, "who": "GRANNY", "text": "Turn it up. I'm old, not dead.", "pos": "auto"},
  {"bar": 12, "beat": 0, "beats": 3, "who": "VEX", "text": "We SOLD OUT!", "pos": "auto"},
  {"bar": 13, "beat": 0, "beats": 3, "who": "TINY", "text": "That's a horde.", "pos": "auto"},
  {"bar": 14, "beat": 2, "beats": 4, "who": "NOODLE", "text": "BRAKES! BRAKES! BRAKES!", "pos": "auto"},
  {"bar": 25, "beat": 0, "beats": 4, "who": "GRANNY", "text": "Good photo of me, though.", "pos": "auto"},
  {"bar": 31, "beat": 0, "beats": 4, "who": "GROUPIE", "text": "VEX!!! SIGN IT AGAIN!!!", "pos": "auto"},
  {"bar": 35, "beat": 0, "beats": 4, "who": "GRANNY", "text": "Gerald. Wake up.", "pos": "auto"},
  {"bar": 40, "beat": 2.5, "beats": 3, "who": "GRANNY", "text": "Reloading, dear.", "pos": "auto"},
  {"bar": 44, "beat": 0, "beats": 4, "who": "VEX", "text": "Where's my click track?!", "pos": "auto"},
  {"bar": 45, "beat": 0, "beats": 4, "who": "TINY", "text": "I AM the click track.", "pos": "auto"},
  {"bar": 46, "beat": 1, "beats": 5, "who": "NOODLE", "text": "THE RED DOOR! GO!", "pos": "auto"},
  {"bar": 49, "beat": 1, "beats": 3, "who": "GRANNY", "text": "Ooh. Mints.", "pos": "auto"},
  {"bar": 50, "beat": 0, "beats": 4, "who": "TINY", "text": "Those are my heart pills.", "pos": "auto"},
  {"bar": 51, "beat": 0, "beats": 3, "who": "GRANNY", "text": "Not anymore.", "pos": "auto"},
  {"bar": 53, "beat": 0, "beats": 4, "who": "NOODLE", "text": "Guys... who's been counting?", "pos": "auto"},
  {"bar": 54, "beat": 0, "beats": 5, "who": "VEX", "text": "...that's my handwriting.", "pos": "auto"},
  {"bar": 57, "beat": 0, "beats": 4, "who": "VEX", "text": "THE ORPHEUM! We're on in two!", "pos": "auto"},
  {"bar": 59, "beat": 0, "beats": 4, "who": "GRANNY", "text": "So are we, dear.", "pos": "auto"},
  {"bar": 64, "beat": 2, "beats": 4, "who": "TINY", "text": "They know the words.", "pos": "auto"},
  {"bar": 70, "beat": 2, "beats": 3, "who": "VEX", "text": "They LOVE me.", "pos": "auto"},
  {"bar": 72, "beat": 1, "beats": 3, "who": "NOODLE", "text": "Who unplugged the—", "pos": "auto"},
  {"bar": 74, "beat": 0, "beats": 2, "who": "NOODLE", "text": "Guys, the mirror—", "pos": "auto"},
  {"bar": 77, "beat": 0, "beats": 4, "who": "NOODLE", "text": "It's ALWAYS two minutes!", "pos": "auto"},
  {"bar": 80, "beat": 3, "beats": 3, "who": "GRANNY", "text": "Stop choking, sweetie.", "pos": "auto"},
  {"bar": 82, "beat": 0, "beats": 3, "who": "GRANNY", "text": "My turn.", "pos": "auto"},
  {"bar": 86, "beat": 0, "beats": 3, "who": "VEX", "text": "That's MY move!", "pos": "auto"},
  {"bar": 88, "beat": 0, "beats": 3, "who": "TINY", "text": "Fore.", "pos": "auto"},
  {"bar": 89, "beat": 2, "beats": 2, "who": "NOODLE", "text": "Is the curtain supposed to—", "pos": "auto"},
  {"bar": 93, "beat": 0, "beats": 4, "who": "NOODLE", "text": "We're actually getting out?!", "pos": "auto"},
  {"bar": 94, "beat": 3, "beats": 5, "who": "GRANNY", "text": "Same chopper as last night.", "pos": "auto"},
  {"bar": 96, "beat": 2.75, "beats": 4, "who": "NOODLE", "text": "There was a LAST night?", "pos": "auto"}
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
  {"type": "chapter", "bar": 24, "beat": 0, "beats": 4, "n": "ACT ONE", "title": "THE STREETS"},
  {
   "type": "special",
   "bar": 28,
   "beat": 3,
   "beats": 5,
   "name": "THE GROUPIE",
   "line": "Biggest fan. No eye contact."
  },
  {"type": "warning", "bar": 32, "beat": 0, "beats": 6, "text": "SOLD OUT", "style": "stamp"},
  {"type": "chapter", "bar": 48, "beat": 0, "beats": 4, "n": "INTERMISSION", "title": "THE SAFE ROOM"},
  {"type": "chapter", "bar": 56, "beat": 0, "beats": 4, "n": "ACT TWO", "title": "THE ORPHEUM"},
  {
   "type": "special",
   "bar": 78,
   "beat": 0,
   "beats": 5,
   "name": "THE ROADIE",
   "line": "All access. Cargo shorts. No mercy."
  },
  {"type": "chapter", "bar": 91, "beat": 0, "beats": 4, "n": "ENCORE", "title": "THE ROOF"},
  {
   "type": "end",
   "bar": 110,
   "beat": 0,
   "beats": 8,
   "stagger": 4,
   "lines": ["NIGHT {night} · NO SURVIVORS", "NIGHT {next} BEGINS IN {countdown}"]
  }
 ],
 "clues": [
  {
   "id": "lou",
   "hub": "who",
   "bar": 1.5,
   "hold": [1, 2.75],
   "shot": "van",
   "title": "1313 AM",
   "note": "who is LOU?"
  },
  {
   "id": "clock",
   "hub": "when",
   "bar": 3.25,
   "hold": [2.75, 4.25],
   "shot": "van",
   "title": "Every clock says 3:00",
   "note": "none of them tick. 3:00... or an L?"
  },
  {
   "id": "missing",
   "hub": "when",
   "bar": 25,
   "hold": [24.5, 26.5],
   "shot": "street",
   "title": "MISSING since 1987",
   "note": "Granny hasn't aged a day. LOU PRESENTS?"
  },
  {
   "id": "groupie",
   "hub": "crowd",
   "bar": 29.5,
   "hold": [29, 30.5],
   "shot": "street",
   "title": "The alley",
   "note": "candles. flowers. their photo."
  },
  {
   "id": "tally",
   "hub": "who",
   "bar": 53.5,
   "hold": [53, 54],
   "shot": "saferoom",
   "title": "Who has been counting?",
   "note": "{prev} nights. same as night 1."
  },
  {
   "id": "handwriting",
   "hub": "who",
   "bar": 54.5,
   "hold": [54, 55.5],
   "shot": "saferoom",
   "title": "VEX WAS HERE",
   "note": "his handwriting. he doesn't remember. LOU LIES?"
  },
  {
   "id": "condemned",
   "hub": "when",
   "bar": 58.5,
   "hold": [58, 59.5],
   "shot": "orpheum",
   "title": "CONDEMNED · FIRE · 3:00 AM",
   "note": "31 OCT 1987. same minute as the clocks."
  },
  {
   "id": "wristband",
   "hub": "crowd",
   "bar": 66,
   "hold": [65.5, 66.75],
   "shot": "stage",
   "title": "ADMIT ONE",
   "note": "zombies don't buy tickets."
  },
  {
   "id": "setlist",
   "hub": "when",
   "bar": 67.5,
   "hold": [67, 68.25],
   "shot": "stage",
   "title": "The setlist",
   "note": "first things first.",
   "board": "card"
  },
  {
   "id": "mirror",
   "hub": "when",
   "bar": 73.55,
   "hold": [73.375, 73.75],
   "shot": "blackout",
   "title": "In the mirror",
   "note": "that's Granny's beehive."
  },
  {
   "id": "chopper",
   "hub": "who",
   "bar": 94,
   "hold": [93.5, 94.75],
   "shot": "rooftop",
   "title": "Same chopper as last night",
   "note": "rescue is always two minutes out.",
   "reply": {"who": "GRANNY", "text": "every night, sweetie."}
  },
  {
   "id": "thermal",
   "hub": "crowd",
   "bar": 108.5,
   "hold": [106.5, 111],
   "shot": "thermal",
   "title": "Thermal",
   "note": "1,204 warm. 4 cold."
  },
  {
   "id": "wave",
   "hub": "crowd",
   "bar": 109.75,
   "hold": [109.5, 110.5],
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
   {"id": "when", "q": "WHAT HAPPENED AT 3:00 AM?"},
   {"id": "crowd", "q": "WHO'S IN THE CROWD?"},
   {"id": "who", "q": "WHO BOOKED THIS GIG?"}
  ],
  "strings": [
   {"a": "clock", "b": "lou", "label": "3:00... or an L?"},
   {"a": "condemned", "b": "contract", "label": "3:00 AM / 2:59 AM"},
   {"a": "wristband", "b": "ticket", "label": "same purple"},
   {"a": "thermal", "b": "ticket", "label": "1,204 / No. 1,205"},
   {"a": "handwriting", "b": "contract", "label": "LOU LIES / UNTIL THE MUSIC STOPS"}
  ]
 },
 "contract": {
  "head": "ENGAGEMENT AGREEMENT",
  "lines": [
   "PROMOTER: [mark]", "ARTIST: NO SURVIVORS (4 PIECE)", "VENUE: THE ORPHEUM", "SHOWS: NIGHTLY · DOORS 3:00 AM",
   "TERM: UNTIL THE MUSIC STOPS", "FEE: ONE MORE ░░░░", "SIGNED 31 OCT 1987 · 2:59 AM"
  ],
  "sign": ["Vex", "G. Gloom", "Tiny", "Noodle"],
  "witchingLine": "______________ (+1)"
 },
 "ticket": {
  "lines": ["ADMIT ONE · No. 1,205", "NO SURVIVORS · THE ORPHEUM", "NIGHT {next} · DOORS 3:00 AM", "{countdown}"],
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
   "CONDEMNED", "FIRE · 31 OCT 1987 · 3:00 AM", "UNSAFE STRUCTURE · CAPACITY 1,204 · NO ADMITTANCE",
   "BY ORDER OF THE CITY"
  ],
  "missing": ["MISSING", "SINCE 1987", "LAST SEEN: THE ORPHEUM"],
  "gigPoster": [
   "LAST CALL LOU PRESENTS", "NO SURVIVORS", "THE ORPHEUM", "FRI 30 OCT 1987 · ONE NIGHT ONLY", "LIVE ON 1313 AM"
  ],
  "wristband": "ADMIT ONE",
  "stageDoor": "STAGE DOOR",
  "vigilSign": "ONE MORE SONG",
  "groupieShirt": "NO SURVIVORS · THE ORPHEUM · OCT '87",
  "pillLabel": "TINY · HEART · 1 DAILY",
  "graffiti": [
   {"text": "THEY DON'T BITE.", "who": "NOODLE", "clue": true},
   {"text": "THEY CLAP.", "who": "TINY", "clue": true},
   {"text": "NIGHT {prev}: SAME AS NIGHT 1", "who": "NOODLE", "clue": true},
   {"text": "VEX WAS HERE ★", "who": "VEX", "clue": true, "signature": true},
   {"text": "DON'T STOP PLAYING", "who": "VEX", "clue": true},
   {"text": "LOU LIES", "who": "GRANNY", "clue": true},
   {"text": "FREE MINTS →", "who": "GRANNY"},
   {"text": "TINY — TAKE YOUR PILLS ♥ — TINY", "who": "TINY"},
   {"text": "CHOKE IS ON THE LEFT, NOODLE", "who": "GRANNY"},
   {"text": "\"TWO MINUTES\" MY FOOT", "who": "GRANNY"},
   {"text": "SHE JUST WANTS AN AUTOGRAPH", "who": "TINY"},
   {"text": "NO MORE ENCORES!!", "who": "NOODLE", "struck": true},
   {"text": "ONE MORE SONG ★", "who": "VEX"}
  ],
  "thermalHud": {"tl": "● REC  CAM 1", "tr": "03:00:00", "bl": "HEAT SIGNATURES {heat}", "br": "LADDER 0"},
  "odometer": "rolls from {prev} to {night} on bar 3 (\"Full house again\")"
 },
 "setlist": {
  "header": "NO SURVIVORS · THE ORPHEUM · FRI 30 OCT '87",
  "songs": ["Horde Call", "Eat Your Heart Out", "Last Call Lou", "Pyro Party", "Up in Smoke", "Same Time Tomorrow"],
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
  {"shot": "van", "bars": [0, 8]},
  {"shot": "highway", "bars": [8, 16], "trans": {"type": "flash", "beats": 0.5}},
  {"shot": "intros", "bars": [16, 24], "trans": {"type": "cut"}},
  {"shot": "street", "bars": [24, 32], "trans": {"type": "whip", "beats": 0.5}},
  {"shot": "hordeWarn", "bars": [32, 36], "trans": {"type": "cut"}},
  {"shot": "horde", "bars": [36, 44], "trans": {"type": "flash", "beats": 0.5}},
  {"shot": "dash", "bars": [44, 48], "trans": {"type": "whip", "beats": 0.5}},
  {"shot": "saferoom", "bars": [48, 56], "trans": {"type": "cut"}},
  {"shot": "orpheum", "bars": [56, 64], "trans": {"type": "cut"}},
  {"shot": "stage", "bars": [64, 72], "trans": {"type": "cut"}},
  {"shot": "blackout", "bars": [72, 74], "trans": {"type": "cut"}},
  {"shot": "generator", "bars": [74, 82], "trans": {"type": "cut"}},
  {"shot": "solo", "bars": [82, 90], "trans": {"type": "flash", "beats": 1}},
  {"shot": "rooftop", "bars": [90, 106], "trans": {"type": "whip", "beats": 0.5}},
  {"shot": "thermal", "bars": [106, 112], "trans": {"type": "burn", "beats": 2}}
 ],
 "warning": {"text": "Flashing lights: muzzle flashes, lightning and stage lights.", "reduce": "Reduce flashing"},
 "notes": {
  "about": "Written by the composer. Everything below documents the musical keys: chords, bass, riffs, arrangement, drums, perc, vocals.lines[].notes/words/gangOn, and the musical hit types. Time: 150 BPM 4/4, beat = 0.4 s, bar = 1.6 s, step = one 16th = 0.1 s. A step position in a bar may be fractional (triplets: 4/3 steps; the coda music box slows down); seconds = (bar * 16 + step) * 0.1.",
  "chords": "SCORE.chords: 112 entries, one per bar. A string = the chord for the whole bar; null = N.C. (no chord); an array of 2 = [beats 1-2, beats 3-4]; an array of 4 = one chord per beat (bars 47, 101, 103). An array element may be null (bar 81: [null, \"E5\"]). Symbols: E5-style power chords, Em, C, D, Cmaj7, Cmaj7/E, Am, Am(add9), B7, F#m, C#7. A reference voicing (MIDI notes) for every symbol is in arrangement.chordTones. The chords are the lead sheet; the parts in riffs/tracks are what sounds.",
  "events": "A note event (in riffs[id].notes) is [step, len, pitch, vel, art] (always 5 elements). step: 16th position in the bar, 0 <= step < 16 (may be fractional). len: duration in steps (may run past the bar line; the note sounds for len steps unless a later note on the same track starts first on the same strings: monophonic lead/bass lines stop at the next note). pitch: MIDI note number (C4 = 60, E2 = 40) or a list of MIDI notes struck together (a chord; strum it downwards over ~7 ms, ~3 ms when palm-muted). vel: 0..1 (1.0 accent, ~0.85 normal, ~0.7 palm-muted chug, < 0.5 soft). art: a space-separated list of articulation tokens (see art), \"\" when none.",
  "art": {
   "pm": "palm-muted (short, dark, chunky; ~0.85 palm in ns_synth gtr_track)",
   "ring": "let ring for the full len even if the next event starts earlier on another string (rhythm guitar: ring=True)",
   "trem": "tremolo picking: re-strike the pitch every 32nd (every half step) for the whole len, vel as given with a slight crescendo",
   "slideDn": "a long descending pick slide (scrape noise) over the len instead of a pitched note; the pitch is only the start position",
   "slideUp": "an ascending pick slide (scrape noise rising) over the len",
   "fb": "feedback: a sustained tone swelling in from silence over ~60% of len, starting one octave below the written pitch and jumping up to it at ~55% (ns_synth gtr_feedback with from_note = pitch - 12)",
   "swell": "volume swell: fades in from silence over the first half of len",
   "hammer": "legato: no new pick attack (hammer-on / pull-off from the previous note)",
   "tap": "tapped note (bright, legato attack)",
   "bN": "bend: the string is fretted N semitones BELOW the written pitch and bends up to it over ~0.12 s; the written pitch is what you hear after the bend (e.g. \"b2\" on B5 = fret A5, bend a whole tone). ns_synth: midi = pitch - N, bend = N",
   "vib": "vibrato ~0.3 semitone, 5.5 Hz, after ~0.15 s",
   "vibw": "wide vibrato ~0.6 semitone",
   "harm": "pinch harmonic: fretted at the written pitch, squeals at its 3rd harmonic (+19 semitones)",
   "diveN": "whammy dive: the pitch falls N semitones over the len (ease-in)",
   "buzz": "Noodle's duct-taped neck: fret buzz, and the pitch sags a quarter-tone (-0.5 semitone) over the len"
  },
  "riffs": "SCORE.riffs: the pattern library, { patternId: { desc, notes: [event, ...] } }. A pattern is ONE bar long (notes may ring past the bar end via len). Patterns are instrument-agnostic; the track that references a pattern decides the instrument. Ids: riffA/riffB (the main riff), gal_*/galR_* (verse gallop), ch*_ (chorus), b_* bass, l_* lead, o_* organ, c_* clean, m_* music box.",
  "bass": "SCORE.bass: the bass track, 112 entries (one per bar): null = rest, \"patternId\" = play riffs[patternId] in that bar, [\"patternId\", n] = the same transposed n semitones (chorus 3 uses +2). Instrument and mix in arrangement.mix.bass.",
  "arrangement": "SCORE.arrangement: tracks = { gtrL, gtrR, lead, organ, clean, musicbox: 112 entries each, same format as SCORE.bass }. The full set of pitched parts is arrangement.tracks + { bass: SCORE.bass }. mix = per track (plus \"drums\" and \"perc\"): inst (what it is), pan (-1 left .. +1 right), gainDb (relative suggestion), band (true = it is part of \"the band\": silenced by every gap; the musicbox is not, see gaps). sections = per SCORE.sections id: layers (what plays), drums (the feel), how (prose). automation = [{ target, param, points: [[globalBeat, value], ...], note }] (linear between points unless the note says otherwise). chordTones = { chord symbol: [MIDI notes] } reference voicings. bootleg1987 = how to render the 1987 tape (radio, flashback).",
  "drums": "SCORE.drums: lanes kick, snare, hat (closed), open (open hi-hat), crash, ride, tom; each 112 strings of 16 chars, one char per 16th step. \"X\" accent (vel 1.0), \"x\" hit (0.7), \"g\" ghost (0.3; ignored by S.snare etc.), \"r\" a 32nd-note double (two hits, at the step and half a step later, 0.6 each), \".\" rest. The tom lane uses \"h\"/\"m\"/\"f\" = high/mid/floor tom (upper case = accent, vel 1.0; lower case 0.7) and nothing else. Tiny plays with baseball bats: add a short wooden tock to every attack. Crash on the downbeat of new sections, every bar in choruses; no hats in the final chorus (the chopper is the hat).",
  "perc": "SCORE.perc: extra lanes in the drums format (112 strings of 16 chars, \"X\" accent, \"x\" hit, \".\" rest): heart = a heartbeat thump (soft, low, ~45-60 Hz sine with a felt knock; \"X\" = the louder lub, \"x\" = the dub) in the cold open and the safe room; sticks = Tiny clacking his two bats together (count-in, bar 7); stomp = the whole crowd stomping (huge, roomy, slightly loose); clap = the crowd clapping in perfect sync; case = a bat on a road case (hollow wooden tock); choke = at this step mute every ringing cymbal (crash/ride/open) and cut the band reverb tails short (pitched parts already end by their len).",
  "vocals": "vocals.lines[].notes: [[syllable, step, lengthSteps, midi], ...] sorted by step; step is a 16th from the line's bar (integer), the length may run past the bar line. Every word in words is [word, step] with step = the step of its first syllable; the syllables of word i, concatenated, spell its letters (A.M. = A + M). Pitches are written (sounding) pitch for a baritone/tenor, E3-B3 with peaks on D4 (G#3-E4 in the final chorus); gang shouts are rhythmic, their midi is a rough pitch centre; the zombie chant is low (C3 D3 E3). Long final notes may fall ~2 semitones in their last 4 steps (a megaphone-rock fall). gangOn (optional, on lines sung by \"vex\"): a list of syllable indexes into notes that the gang shouts with Vex. singer \"vex+gang\" = the gang doubles the whole line.",
  "hits": "New musical hit types: gangHey (gang shout HEY!, pitch = a note name, render 6-8 layered shouts), fill (picture cue only: a drum fill [beat, toBeat] for animating Tiny; the sound is already in SCORE.drums). Added fields: reverseBeep.pitch (note name), roadieStinger.pitches (note names of the brass cluster), lick.part (where the lick's notes live: \"lead\", \"drums\", \"bass\", or \"sfx\" = render it from the hit). Hits whose sound is ALREADY in the parts (do not render them again): titleHit (the riff downbeat; add an impact boom if wanted), bandHit, finalHit, doorSlam (the band stab; layer a door slam SFX on top), lick (except part \"sfx\"), musicBox, musicBoxCoda (notes in the musicbox track; the coda's spring-click at 447.9 is SFX), countIn (bat clicks in perc.sticks; the voice is vocals.spoken tiny_count), fill. Everything else is a sound effect.",
  "gaps": "In every gap [fromBeat, toBeat) the band is silent: no track note, drum or perc hit sounds and every note that started before the gap is cut at fromBeat (+ at most a few ms of release). The checker enforces this. Exception: the musicbox track inside the final gap 422-448 (the coda's music box is not the band). Hits/SFX may sound in gaps (reload, zombieHuh, the knocks, the chopper blades).",
  "energy": "SCORE.energy (refined by the composer): 0..1 per bar, follows the arrangement (a dip on the stop-time bar 30, the safe-room silence 54-55, the calls 100/102, the final hit bar 105)."
 }
};
