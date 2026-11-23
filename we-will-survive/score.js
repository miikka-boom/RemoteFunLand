/* We Will Survive. Right? — the score.
   One time code for sound and picture: 128 BPM, 96 bars of 4/4 (exactly 3:00), then a tail.
   Positions are in bars from 0; bar 16.25 is bar 16, beat 2. q(bar, beat) writes them. */
(function () {
'use strict';

const BPM = 128, BEAT = 60 / BPM, BAR = 4 * BEAT, BARS = 96, TAIL = 6;
const DUR = BARS * BAR + TAIL;
const q = (bar, beat = 1) => bar + (beat - 1) / 4;
const sec = (bars) => bars * BAR;

/* ---------------- shots: what the picture shows, bar ranges ---------------- */
const SHOTS = [
  { id: 'road', from: 0, to: 8, name: 'Old Quarry Road' },
  { id: 'graveyard', from: 8, to: 16, name: 'Hollow Hill Cemetery' },
  { id: 'fight', from: 16, to: 24, name: 'Back to back' },
  { id: 'horde', from: 24, to: 28, name: 'There were more' },
  { id: 'forest', from: 28, to: 32, name: 'The woods' },
  { id: 'werewolf', from: 32, to: 40, name: 'The clearing' },
  { id: 'chapel', from: 40, to: 48, name: 'St. Agatha’s' },
  { id: 'fog', from: 48, to: 56, name: 'The fog' },
  { id: 'thing', from: 56, to: 64, name: 'The lake' },
  { id: 'crank', from: 64, to: 72, name: 'It won’t start' },
  { id: 'chase', from: 72, to: 78, name: 'The road' },
  { id: 'jump', from: 78, to: 80, name: 'The bridge' },
  { id: 'dawn', from: 80, to: 88, name: 'The far side' },
  { id: 'sunrise', from: 88, to: 96 + TAIL / BAR, name: 'Sunrise' },
];

/* ---------------- harmony ----------------
   bass: MIDI root for the bass; cell: the ostinato's five notes (root, third, fifth, sixth,
   fifth); pad: a four-note voicing. D minor, then D major at dawn. */
const CHORDS = {
  Dm: { bass: 38, cell: [62, 65, 69, 70, 69], pad: [50, 57, 62, 65] },
  Bb: { bass: 34, cell: [58, 62, 65, 67, 65], pad: [50, 53, 58, 62] },
  F: { bass: 41, cell: [65, 69, 72, 74, 72], pad: [53, 57, 60, 65] },
  C: { bass: 36, cell: [60, 64, 67, 69, 67], pad: [52, 55, 60, 64] },
  Gm: { bass: 43, cell: [67, 70, 74, 75, 74], pad: [50, 55, 58, 62] },
  A: { bass: 33, cell: [57, 61, 64, 65, 64], pad: [49, 52, 57, 61] },
  Eb: { bass: 39, cell: [63, 67, 70, 72, 70], pad: [51, 55, 58, 63] },
  'A/C#': { bass: 37, cell: [57, 61, 64, 65, 64], pad: [49, 52, 57, 61] },
  'F/C': { bass: 36, cell: [65, 69, 72, 74, 72], pad: [53, 57, 60, 65] },
  'G/B': { bass: 35, cell: [67, 71, 74, 76, 74], pad: [50, 55, 59, 62] },
  'F/A': { bass: 33, cell: [65, 69, 72, 74, 72], pad: [53, 57, 60, 65] },
  D: { bass: 38, cell: [62, 66, 69, 71, 69], pad: [50, 57, 62, 66] },
  'A+': { bass: 33, cell: [57, 61, 64, 66, 64], pad: [49, 52, 57, 61] },
  'A+/C#': { bass: 37, cell: [57, 61, 64, 66, 64], pad: [49, 52, 57, 61] },
  Bm: { bass: 35, cell: [59, 62, 66, 67, 66], pad: [50, 54, 59, 62] },
  G: { bass: 43, cell: [67, 71, 74, 76, 74], pad: [50, 55, 59, 62] },
};
// one chord per bar
const CHART = [].concat(
  Array(8).fill('Dm'),                                         // 0-7   the road
  ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'],              // 8-15  the graveyard
  ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'],               // 16-23 the fight (theme)
  ['Dm', 'Eb', 'Dm', 'Eb'],                                    // 24-27 the horde
  ['Dm', 'Bb', 'Gm', 'A'],                                     // 28-31 the woods
  ['Dm', 'Dm', 'Dm', 'Dm', 'Eb', 'Eb', 'Gm', 'A'],             // 32-39 the werewolf
  ['Dm', 'A/C#', 'F/C', 'G/B', 'Bb', 'F/A', 'Gm', 'A'],        // 40-47 the chapel (lament bass)
  ['Dm', 'Bb', 'Dm', 'Bb', 'Gm', 'Gm', 'A', 'A'],              // 48-55 the fog
  ['Dm', 'Dm', 'Eb', 'Eb', 'Dm', 'Dm', 'Eb', 'A'],             // 56-63 the Thing
  ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'],              // 64-71 it won't start
  ['Dm', 'Bb', 'F', 'C', 'Gm', 'A'],                           // 72-77 the chase (theme)
  ['Bb', 'C'],                                                 // 78-79 the jump
  ['Dm', 'C'],                                                 // 80-81 landing
  ['D', 'A+/C#', 'Bm', 'G', 'D', 'A+'],                        // 82-87 dawn (theme in major)
  ['G', 'A+'],                                                 // 88-89 "We will survive."
  ['Bb', 'Bb'],                                                // 90-91 "...Right?"
  ['Dm', 'Dm', 'Dm', 'Dm'],                                    // 92-95 the blink, the sting
);
const chordAt = (bar) => CHORDS[CHART[Math.max(0, Math.min(CHART.length - 1, Math.floor(bar)))]];

/* ---------------- the theme: "we will sur- | VIVE" ----------------
   [beat from the phrase's first downbeat, MIDI, length in beats]; the pickup is negative. */
const THEME_MINOR = [
  [-1.5, 69, .5], [-1, 72, .5], [-.5, 74, .5],
  [0, 77, 2.5], [2.5, 76, .5], [3, 74, 1],
  [4, 74, 2], [6, 72, .5], [6.5, 74, .5], [7, 77, .5], [7.5, 79, .5],
  [8, 81, 2.5], [10.5, 79, .5], [11, 77, 1],
  [12, 76, 2.5], [14.5, 69, .5], [15, 72, .5], [15.5, 74, .5],
  [16, 77, 2.5], [18.5, 76, .5], [19, 74, 1],
  [20, 82, 2], [22, 81, 1], [23, 79, 1],
  [24, 79, 1.5], [25.5, 77, .5], [26, 74, 1], [27, 77, 1],
  [28, 76, 2], [30, 73, 1], [31, 76, 1],
];
const THEME_MAJOR = [
  [-1.5, 69, .5], [-1, 71, .5], [-.5, 74, .5],
  [0, 78, 2.5], [2.5, 76, .5], [3, 74, 1],
  [4, 73, 2], [6, 71, .5], [6.5, 73, .5], [7, 74, .5], [7.5, 76, .5],
  [8, 78, 2.5], [10.5, 76, .5], [11, 74, 1],
  [12, 74, 2.5], [14.5, 69, .5], [15, 71, .5], [15.5, 74, .5],
  [16, 78, 2.5], [18.5, 79, .5], [19, 81, 1],
  [20, 81, 2], [22, 83, 1], [23, 85, 1],
  [24, 86, 4],
  [28, 85, 2], [30, 81, 2],
];
// where the lead plays it: [phrase start bar, theme, first beat, last beat (exclusive), octave shift]
const LEAD = [
  { at: 16, notes: THEME_MINOR, from: 0, to: 32, shift: 0 },          // the fight (no pickup: the flashlight is dead)
  { at: 72, notes: THEME_MINOR, from: 0, to: 16, shift: 0 },          // the chase, first half...
  { at: 70, notes: THEME_MINOR, from: 24, to: 32, shift: 0 },         // ...then bars 76-77 take the last two bars
  { at: 82, notes: THEME_MAJOR, from: -2, to: 32, shift: 0 },         // dawn, in D major
];
// "...Right?" — a question that bends up and never lands
const RIGHT_NOTES = [[q(90, 1), 74, .5], [q(90, 1.5), 76, 7]];
// the music box: the theme, slow and broken; at the very end it never reaches "VIVE"
const MUSIC_BOX = [
  [q(49, 1), 81], [q(49, 2), 84], [q(49, 3), 86], [q(50, 1), 89, 2],
  [q(51, 1), 88], [q(51, 3), 86],
  [q(52, 1), 81], [q(52, 2), 84], [q(52, 3), 86], [q(53, 1), 87, 2],
  [q(54, 1), 85, 3],
  [q(95, 1), 81], [q(95, 2), 84], [q(95, 3), 86],
];

/* ---------------- drums ----------------
   16 steps a bar. X accent, x normal, o ghost. */
const KITS = {
  heart: { heart: 'x.o.....x.o.....' },
  heartToms: { heart: 'x.o.....x.o.....', tomLo: '........x...x...' },
  fight: { kick: 'X.....x.X.....x.', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
  tribal: { kick: 'X.......X.......', tomLo: 'x..x..x...x.....', tomHi: '..........x.x.x.', snare: '............X...' },
  run: { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'xoxoxoxoxoxoxoxo', ohat: '..x...x...x...x.' },
  halftime: { kick: 'X.........x.....', snare: '........X.......', hat: 'x.x.x.x.x.x.x.x.' },
  gothic: { kick: 'X...X...X...X...', snare: '....X.......X...', ohat: '..x...x...x...x.', hat: 'o.o.o.o.o.o.o.o.' },
  heartSlow: { heart: 'h.h.....h.h.....' },
  timpani: { timp: 'X.......x.......' },
  build: { kick: 'X...X...X...X...', timp: 'X...............', snare: '..o...o...o...o.' },
  crank: { kick: 'X.......X.......', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' },
  crank2: { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'xoxoxoxoxoxoxoxo' },
  chase: { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'xoxoxoxoxoxoxoxo', ohat: '..x...x...x...x.' },
  landing: { kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
  dawn: { kick: 'X...X...X...X...', clap: '....X.......X...', ohat: '..x...x...x...x.', shaker: 'oxoxoxoxoxoxoxox' },
  outro: { kick: 'X...............', clap: '....o.......o...' },
};
const DRUM_SECTIONS = [
  [8, 12, 'heart'], [12, 15, 'heartToms'], [16, 24, 'fight'], [24, 28, 'tribal'], [28, 32, 'run'],
  [34, 40, 'halftime'], [40, 48, 'gothic'], [48, 55, 'heartSlow'], [56, 60, 'timpani'], [60, 64, 'build'],
  [64, 68, 'crank'], [68, 71, 'crank2'], [72, 78, 'chase'], [80, 82, 'landing'], [82, 88, 'dawn'], [88, 90, 'outro'],
];
// bars where the kit's pattern is replaced (fills, stops); [bar, {inst: pattern}] (a kit key set to '' mutes it)
const DRUM_BARS = {
  15: { heart: 'X.x.....', tomLo: 'x.x.', tomHi: '..x.' },
  19: { tomHi: '............xx..', tomLo: '..............xx' },
  23: { kick: 'X...X...X...X...', snare: 'X...X...X...X...', tomHi: '........x.x.xx..', tomLo: '............xxxx', hat: '' },
  27: { snare: '............xxxx' },
  31: { tomHi: '........x.x.x...', tomLo: '..........x.x.xx', snare: '....X...........' },
  39: { snare: '....X.......xxxx' },
  47: { snare: '....X...x.x.xxxx', ohat: '' },
  54: { heart: 'o.h.............' },
  62: { snare: 'o.o.o.o.o.o.o.o.' },
  63: { snare: 'oooooooxxxxxxxXX', kick: 'X...X...X...X...' },
  70: { snare: 'oooooooooooooooo' },
  71: { kick: 'X...X...X...', snare: 'xxxxxxxxXXXX', hat: '' },
  75: { ohat: '..x...x...x...x.' },
  77: { snare: '....X...xxxxXXXX', tomHi: '........x.x.....', tomLo: '..........x.x...' },
  81: { snare: '....X.......xxxx', tomLo: '........x.x.....' },
  87: { clap: '....X.......X...', snare: '............xxxx' },
};
const CRASH = [16, 20, 24, 28, 34, 40, 44, 64, 68, 72, 74, 76, q(78), 80, 82, 86];

/* ---------------- bass, pads, ostinato, choir: which bars, how ---------------- */
// bass styles: drone, long, eighths, drive, tribal, gallop, riff, octaves, sub, none
// [from, to, style, level]
const BASS = [
  [0, 8, 'drone', .5], [8, 12, 'long', .8], [12, 15, 'eighths', .9], [16, 24, 'drive', 1], [24, 28, 'tribal', 1],
  [28, 32, 'gallop', 1], [32, 34, 'drone', .8], [34, 40, 'riff', 1], [40, 48, 'octaves', .9], [48, 56, 'sub', .45],
  [56, 60, 'drone', 1], [60, 64, 'eighths', 1], [64, 71.75, 'drive', 1], [72, 78, 'gallop', 1],
  [78, 80, 'sub', .6], [80, 82, 'drive', 1], [82, 88, 'octaves', .9], [88, 90, 'long', .8], [90, 92, 'sub', .55], [92, 94, 'drone', .7],
];
// ostinato: [from, to, octave shift, cutoff from, cutoff to, level]
const OSTINATO = [
  [4, 8, 0, 450, 900, .3], [8, 15.5, 0, 900, 2600, .45], [16, 24, 0, 3000, 3200, .5], [24, 28, 0, 1600, 1800, .45],
  [28, 32, 12, 3600, 4200, .42], [34, 40, -12, 1400, 2200, .5], [60, 64, 0, 700, 3400, .5],
  [64, 71.75, 0, 3000, 3600, .48], [72, 78, 12, 4200, 5000, .4], [80, 82, 0, 2600, 3200, .45], [82, 88, 12, 3800, 4400, .36],
];
// pads: [from, to, level, brightness]
const PADS = [
  [0, 8, .2, 500], [8, 16, .28, 800], [16, 24, .28, 1400], [24, 28, .33, 900], [28, 32, .25, 1600],
  [32, 40, .33, 900], [48, 56, .16, 700], [56, 64, .37, 600], [64, 72, .28, 1200], [72, 78, .28, 1800],
  [78, 80, .5, 2200], [80, 82, .4, 1600], [82, 90, .42, 2600], [90, 92, .42, 1200],
];
// choir: [from, to, vowel, level]; chord tones from the chart
const CHOIR = [
  [24, 28, 'o', .3], [32, 34, 'u', .3], [36, 40, 'a', .25], [56, 64, 'o', .38], [78, 80, 'a', .5],
  [84, 90, 'a', .32], [92, 94, 'u', .3],
];
// the gothic organ and harpsichord in the chapel
const ORGAN = [[40, 48]];
const HARPSI = [[40, 48]];

/* ---------------- the friend's shotgun, your bat, the sky ----------------
   gunshots: [bar, direction (+1 right, -1 left), target tag]. Pumps follow each shot by an eighth. */
const GUNSHOTS = [
  [q(16, 1), 1, 'r1'], [q(17, 2), 1, 'r2'], [q(18, 2), -1, 'l3'], [q(18, 4), 1, 'r3'], [q(19, 2), 1, 'r1'],
  [q(21, 1), 1, 'r2'], [q(21, 3), -1, 'l1'], [q(22, 2), 1, 'r3'],
  [q(23, 1), 1, 'r4'], [q(23, 2), -1, 'l2'], [q(23, 3), 1, 'r1'], [q(23, 4), -1, 'l4'],
  [q(27, 1), 1, 'horde'], [q(29, 1), -1, 'chaser'], [q(31, 1), -1, 'chaser2'],
  [q(34, 2), 1, 'wolf'], [q(34, 4), 1, 'wolf'],
  [q(74, 2), -1, 'chase'], [q(74, 4), -1, 'chase'], [q(75, 2), -1, 'chase'], [q(76, 2), -1, 'chase'],
];
const WHACKS = [[q(16, 4), 'l1'], [q(17, 4), 'l2'], [q(22, 4), 'l1'], [q(29, 4.5), 'jumper']];
const LIGHTNING = [q(24, 1), q(25, 1), q(25, 3), q(26, 1), q(27, 1), q(27, 3)];   // at least half a second apart
// the starter motor: one crank per eighth note, in two-beat attempts; the engine catches at bar 72
const CRANKS = [];
for (let b = 64; b < 71.75; b += 0.125) {
  const beat = Math.round((b % 1) * 8) % 4;           // eighth within the half bar
  if (b >= 71.75) break;
  if ((b >= 66 && b < 67 && beat === 3) || (b >= 68 && b < 68.5 && beat >= 2)) continue;  // breathers
  CRANKS.push(b);
}
const SLAPS = [q(66, 2.5), q(66, 4), q(67, 2), q(67, 3.5), q(68, 1.5), q(69, 1), q(69, 2), q(69, 3.5), q(70, 1), q(70, 2.5), q(71, 1), q(71, 2), q(71, 3)];

/* ---------------- sound effects ----------------
   beds: [from, to, name, params] (ambiences that run for a while; seeking starts them mid-way)
   hits: [bar, name, params] */
const BEDS = [
  [0, 16, 'wind', { level: .3 }], [0, 9, 'crickets', {}], [24, 32, 'rain', {}], [40.5, 47.75, 'swarm', {}],
  [48, 56, 'wind', { level: .22, dark: 1 }], [48.5, 55.4, 'whispers', {}], [56, 64, 'rumble', {}],
  [72, 78, 'engine', {}], [78, 80, 'rush', {}], [82, 92, 'birds', {}], [92, 95.5, 'drone', {}],
];
const HITS = [
  [q(1, 2), 'owl'], [q(4, 1), 'gateCreak'], [q(7, 3), 'gateClang'],
  [q(10, 1), 'dirt', { big: 1 }], [q(10, 3), 'groan', { pan: .3, pitch: 1 }],
  [q(11, 1), 'dirt', { pan: -.5 }], [q(11, 3), 'dirt', { pan: .6 }], [q(12, 1), 'dirt', { pan: -.2 }], [q(12, 3.5), 'dirt', { pan: .8 }],
  [q(13, 1), 'dirt', { pan: -.7 }], [q(13, 2.5), 'dirt', { pan: .4 }], [q(13, 4), 'dirt', { pan: -.4 }],
  [q(11, 2), 'groan', { pan: -.5, pitch: .9 }], [q(12, 2), 'groan', { pan: .6, pitch: 1.1 }], [q(12, 4), 'groan', { pan: -.2, pitch: .8 }],
  [q(13, 3), 'groan', { pan: .7, pitch: 1.2 }], [q(14, 1), 'groan', { pan: -.6, pitch: .95 }], [q(15, 1), 'groan', { pan: .2, pitch: .85 }],
  [q(14, 3), 'pump', {}], [q(15, 3), 'click', {}], [q(15, 3.5), 'click', {}], [q(15, 4), 'groan', { pan: 0, pitch: .7, close: 1 }],
  [q(16, 3), 'click', {}],
  [q(17, 3), 'groan', { pan: .7, pitch: 1 }], [q(18, 3), 'groan', { pan: -.6, pitch: .9 }], [q(20, 3), 'groan', { pan: .4, pitch: 1.15 }],
  [q(21, 4), 'groan', { pan: -.3, pitch: .8 }], [q(22, 3), 'groan', { pan: .5, pitch: 1.05 }],
  [q(19, 4), 'dryFire', {}], [q(20, 1), 'shells', {}], [q(20, 3), 'load', {}], [q(20, 3.5), 'load', {}], [q(20, 4), 'pump', {}],
  [q(24, 2), 'groanCrowd', {}], [q(26, 1), 'groanCrowd', {}],
  [q(28, 1), 'groan', { pan: -.7, pitch: .9 }], [q(30, 1), 'groan', { pan: -.5, pitch: 1.1 }],
  [q(32, 2), 'howl', { far: 0 }], [q(34, 2.1), 'ricochet', {}], [q(34, 4.1), 'ricochet', { pan: .4 }],
  [q(35, 3), 'growl', {}], [q(37, 1), 'roar', {}], [q(37, 1.5), 'whoosh', {}], [q(37, 3), 'treeCrack', {}],
  [q(38, 1), 'treeFall', {}], [q(39, 3), 'howl', { far: 1 }],
  [q(40, 1), 'bell', {}], [q(41, 1), 'bell', {}], [q(40, 3), 'batBurst', {}],
  [q(42, 1), 'hiss', {}], [q(43, 3), 'snap', {}], [q(44, 4), 'breath', {}], [q(45, 2), 'shriek', {}], [q(45, 3), 'batBurst', { small: 1 }],
  [q(47, 3), 'door', {}], [q(47, 4), 'door', { pan: .4 }],
  [q(50, 3), 'groan', { pan: -.8, pitch: .7, far: 1 }], [q(52, 3), 'squeak', {}], [q(54, 3), 'creak', {}],
  [q(55, 3), 'slam', {}],
  [q(56, 1), 'braam', { root: 26 }], [q(58, 1), 'braam', { root: 27 }], [q(60, 1), 'braam', { root: 26 }], [q(62, 1), 'braam', { root: 27 }],
  [q(57, 1), 'eye', {}], [q(57, 2), 'eye', { pan: .5 }], [q(57, 3), 'eye', { pan: -.5 }], [q(57, 4), 'eye', { pan: .2 }],
  [q(58, 3), 'eye', { pan: -.3 }], [q(59, 1), 'eye', { pan: .6 }], [q(59, 3), 'eye', { big: 1 }],
  [q(61, 1), 'howl', { far: 1 }], [q(61, 3), 'batBurst', { small: 1 }], [q(62, 3), 'groanCrowd', {}],
  [q(65, 3), 'sputter', {}], [q(67, 1), 'thud', {}], [q(67, 1.5), 'growl', {}], [q(67, 3), 'thud', {}], [q(69, 3), 'sputter', {}],
  [q(70, 3), 'glass', {}], [q(68, 1), 'groanCrowd', {}],
  [q(72, 1), 'engineStart', {}], [q(72, 1.5), 'screech', {}], [q(72, 3), 'bodyHit', {}], [q(73, 1), 'bodyHit', { pan: .3 }],
  [q(73, 3), 'growl', {}], [q(74, 1), 'bodyHit', { pan: -.3 }], [q(75, 1), 'roar', {}], [q(76, 4), 'rev', {}],
  [q(78, 1), 'launch', {}], [q(79, 2), 'yelp', {}],
  [q(80, 1), 'landing', {}], [q(80, 3), 'hubcap', {}],
  [q(82, 1), 'shimmer', {}], [q(86, 1), 'shimmer', { soft: 1 }],
  [q(92, 1), 'blink', {}], [q(93, 1), 'blink', { soft: 1 }],
  [q(94, 1), 'sting', {}],
];

/* ---------------- words ----------------
   [from, to, who, text]. who: friend, you, whisper (the friend, quietly), narr, stamp, slam.
   "|" breaks a slam into lines. */
const LINES = [
  [0.3, 3.7, 'stamp', 'OLD QUARRY ROAD · 11:52 PM'],
  [1.5, 3.3, 'friend', 'Trust me. It’s a shortcut.'],
  [3.4, 4.8, 'you', 'It’s a cemetery.'],
  [4.9, 7.2, 'friend', 'It’s a shortcut through a cemetery.'],
  [8.6, 10.0, 'friend', '…Did you hear that?'],
  [11.4, 13.7, 'you', 'Please be a gardener. Please be a gardener.'],
  [14.0, 15.45, 'friend', 'Stay behind me.'],
  [16.0, 18.0, 'slam', 'WE WILL|SURVIVE'],
  [19.25, 20.0, 'friend', 'Shells!'],
  [20.0, 20.8, 'you', 'Catch!'],
  [21.2, 22.4, 'friend', 'They keep getting back up!'],
  [22.5, 23.9, 'you', 'WHY do they keep getting back up?!'],
  [24.0, 25.4, 'slam', 'THERE WERE|MORE.'],
  [25.5, 26.45, 'you', 'How many shells left?'],
  [26.5, 27.0, 'friend', 'Four.'],
  [27.25, 28.0, 'friend', 'Three.'],
  [28.0, 29.0, 'friend', 'RUN!'],
  [29.95, 31.0, 'you', 'Sorry!'],
  [32.1, 35.2, 'stamp', 'HOLLOW HILL · 12:31 AM'],
  [33.5, 34.6, 'you', 'Tell me that was a dog.'],
  [34.75, 35.6, 'friend', 'Silver. We need silver.'],
  [35.6, 36.3, 'you', 'I have a spoon!'],
  [36.3, 36.9, 'friend', 'Is it silver?!'],
  [36.9, 37.75, 'you', 'It’s plastic!'],
  [38.25, 39.6, 'friend', 'THIS WAY!'],
  [40.1, 43.2, 'stamp', 'ST. AGATHA’S · 1:47 AM'],
  [40.9, 42.0, 'you', 'Bats. Why is it always bats.'],
  [42.1, 42.9, 'friend', 'The cross! Hold up the cross!'],
  [42.9, 43.6, 'you', 'It’s two sticks!'],
  [44.0, 44.5, 'friend', 'Garlic?!'],
  [44.5, 45.6, 'you', 'I had garlic bread for lunch!'],
  [46.0, 47.6, 'friend', 'TO THE CAR!'],
  [48.1, 51.2, 'stamp', 'IN THE CAR · 3:13 AM'],
  [49.0, 51.0, 'narr', 'Don’t move.'],
  [51.0, 53.0, 'narr', 'Don’t breathe.'],
  [53.5, 55.3, 'whisper', '…I think they’re gone.'],
  [58.5, 59.25, 'friend', 'Okay.'],
  [59.25, 60.0, 'you', 'Okay?'],
  [60.0, 61.6, 'friend', 'That one we can’t shoot.'],
  [62.0, 63.6, 'friend', 'Start the car.'],
  [64.25, 65.8, 'you', 'It won’t start!'],
  [66.0, 67.8, 'friend', 'It ALWAYS starts in the movies!'],
  [68.0, 71.6, 'you', 'Come on… come on… come on…'],
  [72.25, 73.6, 'friend', 'GO GO GO!'],
  [76.0, 77.0, 'you', 'THE BRIDGE IS OUT!'],
  [77.0, 77.95, 'friend', 'THEN FLY!'],
  [80.6, 83.6, 'stamp', 'THE FAR SIDE · 5:59 AM'],
  [82.75, 84.1, 'you', 'Is that… the sun?'],
  [84.5, 85.6, 'friend', 'We made it.'],
  [85.6, 87.0, 'you', 'We made it!'],
  [88.0, 89.8, 'friend', 'We will survive.'],
  [90.0, 91.8, 'you', '…Right?'],
  [94.0, 96 + TAIL / BAR, 'slam', 'RIGHT?'],
];

window.WWS = window.WWS || {};
window.WWS.score = {
  BPM, BEAT, BAR, BARS, TAIL, DUR, q, sec,
  SHOTS, CHORDS, CHART, chordAt, THEME_MINOR, THEME_MAJOR, LEAD, RIGHT_NOTES, MUSIC_BOX,
  KITS, DRUM_SECTIONS, DRUM_BARS, CRASH, BASS, OSTINATO, PADS, CHOIR, ORGAN, HARPSI,
  GUNSHOTS, WHACKS, LIGHTNING, CRANKS, SLAPS, BEDS, HITS, LINES,
};
})();
