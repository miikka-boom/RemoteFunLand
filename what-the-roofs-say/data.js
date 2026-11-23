'use strict';
/* What the Roofs Say: the static data every module codes against (loaded after core.js).
 *
 * Coordinates: cells are (x, y) with x = column 0..43 and y = row 0..39, north up. Rects are
 * [x0, y0, x1, y1] INCLUSIVE. A walkable place is (x, y, z) with z = 0 street, 1 roof terrace, 2 tower top.
 * Mural art lives in mural space: 200 x 200 units, origin top-left, painted upright and never rotated.
 * The single source of truth for the story is this file plus the mural drawings in murals-*.js.
 */
window.WTRS = window.WTRS || {};
WTRS.data = (function () {
  const D = {};
  D.version = 1;
  D.title = 'What the Roofs Say';
  D.slug = 'what-the-roofs-say';
  D.saveKey = 'what-the-roofs-say/v1';
  D.W = 44;
  D.H = 40;

  // ---------------------------------------------------------------------------------------------
  // The map of Saltreach. One character per cell; meanings in D.cells (and D.murals for 1-9, A-C).
  D.map = [
    '^TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT^^^^^^^^^', // 00
    '^.#####w33333w..AAAA.AAAA."#####""T""""""""^', // 01
    '^.#####w33333w..AAAA.AAAA."#####T"T"^""""^"^', // 02
    '^.#####w33333w..AAAA.AAAA."#####""T""""""""^', // 03
    '^.#####w33333w..AAAA.AAAA."#####"TT""HooH""^', // 04
    '^.#####w33333w............T""T""""T""8888""^', // 05
    '^.........s.....AAAA.AAAA.""""""T"T^"8888""^', // 06
    '^.HvHHG.BBBBBT..AAAA.AAAA."#####""T""8888"^^', // 07
    '^.5555..BBBBBT..AAAA.AAAA."#####""T""8888""^', // 08
    '^.5555..BBBBBT..AAAA.AAAA."#####"TT""HHvH""^', // 09
    '^.5555..BBBBBT............"#####""T"""G""""^', // 10
    '^.5555..BBBBB:::11111111:::::"""""T""""""""^', // 11
    '^............:::11111111::!::"T"T"T""""""^"^', // 12
    '^............:::11111111:000:"""""T""""""""^', // 13
    '^...T#######.::h11111111:000:......""""""""^', // 14
    '^....#######.::c11111111:::::......""""""""^', // 15
    '^....#######.:::11111111:::::####"^""""""""^', // 16
    '^...T#######T:::11111111:::::####T^"^""""""^', // 17
    '^............:::11111111:::::####"^""""""""^', // 18
    '^.................................^""""""^"^', // 19
    '^.......................k.S.......^""""""""^', // 20
    '^...RRRRRRRR_RRRRRRRRRRRRRR###RRRR^^"""""""^', // 21
    '^...RRRRRRRR_R4444RRRR7777R###RRRR^""""""""^', // 22
    '^222RRRRRRRR_R4444RoRR7777R...R666^"""""^""^', // 23
    '^222RRRRRRRRPR4444RRRR7777RCCCR666^""""""""^', // 24
    '^222RRRRRRRR_R4444RRRR7777RCCCR666^""""""""^', // 25
    '^...RRRRRRRR_RRRRRRRoRRRRRRCCCRRRR^"""""""^^', // 26
    '^...RRRRRRRR_RRRRRRRRRRRRRRwGwRRRR^""""^^^^^', // 27
    '^.....L.p......t.............gS...^^"""^^^^^', // 28
    '^.................................^^...^^^^^', // 29
    '^=================================^^...^^^^^', // 30
    '~~~~~~~~~~~~~~~~~~~~~~~~==~~~~~~,,^^...^^^^^', // 31
    '~~~~~~~~~~~~~~~~~~~~~~~~==~~~~~~,,^^.b.^^^^^', // 32
    '~~~~~~~~~~~~~~~~~~~~~~~~==FF~~~~,,^^^^^^^^^^', // 33
    '~~~~~~~~~~~~~~~~~~~~~~~~==FF~~~~~~~~~~~~~~~~', // 34
    '~~~~~~~~~~~~~~~~~~~~~~~~@=FF%%%%%%~~~^^^^^^~', // 35
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~%%M%%%~~~^999^^~', // 36
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^999^^~', // 37
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^999^^~', // 38
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^~', // 39
  ];

  // Cell meanings. z: the one level you can stand on in that cell (null = never walkable).
  // ground: what is drawn underneath (street, plaza, grass, quay, jetty, sea, sand, reef, rock, roof...).
  // gate: walkable at z0 only while that flag is set. Mural chars ('1'-'9', 'A'-'C') take z from D.murals.
  D.cells = {
    '.': { z: 0, ground: 'street' },
    ':': { z: 0, ground: 'plaza' },
    '"': { z: 0, ground: 'grass' },
    '=': { z: 0, ground: 'quay-edge' },     // the quay's edge row (y 30) and the jetty planks (x 24-25, y 31-35)
    '@': { z: 0, ground: 'jetty', start: true },
    'T': { z: null, ground: 'grass', prop: 'tree' },
    '^': { z: null, ground: 'rock' },
    '~': { z: null, ground: 'sea' },
    ',': { z: null, ground: 'sand' },
    '%': { z: null, ground: 'reef' },
    'M': { z: null, ground: 'reef', prop: 'mast' },
    'F': { z: null, ground: 'sea', prop: 'ferry' },        // the moored ferry covers x 26-27, y 33-35
    'w': { z: null, ground: 'street', prop: 'wall' },
    '#': { z: null, ground: 'roof' },                       // unreachable pitched roof (style from D.buildings)
    'R': { z: 1, ground: 'roof' },                          // reachable roof terrace
    'H': { z: 2, ground: 'tower' },
    'o': { z: null, ground: 'roof', prop: 'chimney' },      // a chimney on a terrace, or the lamp on the lighthouse
    '_': { z: null, ground: 'lightwell' },
    'P': { z: 1, ground: 'plank' },
    'L': { z: 0, ground: 'street', link: 'L1' },
    'S': { z: 0, ground: 'street', link: 'S' },             // S1 at (30,28), S2 at (26,20)
    'G': { z: 0, ground: 'street', gate: true },            // see D.gates
    'v': { z: 2, ground: 'tower', vantage: true },
    'h': { z: null, ground: 'plaza', prop: 'hat-post' },
    '!': { z: null, ground: 'plaza', prop: 'rule-stone' },
    '0': { z: 0, ground: 'plaza', prop: 'board' },
    'b': { z: null, ground: 'rock', prop: 'bracket' },
    's': { z: 0, ground: 'street', npc: 'sorrel' },
    'k': { z: 0, ground: 'street', npc: 'kell' },
    't': { z: 0, ground: 'street', npc: 'tobin' },
    'g': { z: 0, ground: 'street', npc: 'grue' },
    'p': { z: 0, ground: 'street', npc: 'pip' },
    'c': { z: 0, ground: 'plaza', npc: 'cat' },
  };

  // Gate cells: walkable at z0 only while the flag is set.
  D.gates = { '6,7': 'G2', '38,10': 'G3', '28,27': 'G4' };

  // Links between levels. Walking from a to b (or back) climbs, with a 300 ms fade-step.
  // flag: the link works only while that flag is set. downOnly: until `unlocksBoth` is set it only works b -> a.
  D.links = [
    { id: 'L1', kind: 'ladder', a: [6, 28, 0], b: [6, 27, 1], flag: 'G1' },
    { id: 'S1', kind: 'stair', a: [30, 28, 0], b: [30, 27, 1] },
    { id: 'S2', kind: 'stair', a: [26, 20, 0], b: [26, 21, 1], downOnly: true, unlocksBoth: 'stairDown' },
    { id: 'T1', kind: 'door', a: [6, 7, 0], b: [5, 7, 2], flag: 'G2' },
    { id: 'T2', kind: 'door', a: [38, 10, 0], b: [38, 9, 2], flag: 'G3' },
  ];

  // Buildings, for drawing roofs (the walk model comes from D.cells alone).
  // roof: 'slate' pitched slate | 'red' pitched red tiles | 'terrace' reachable lime-wash with a rope rail
  //       'flat' unreachable flat roof with a parapet | 'tower' pale stone tower top | 'open' no roof (courtyard)
  //       'lime' the Gull Rock chapel roof (lime-painted slate)
  D.buildings = [
    { id: 'B1', name: 'Chapel nave', rect: [2, 1, 6, 5], roof: 'slate' },
    { id: 'B2', name: 'Cloister', rect: [8, 1, 12, 5], roof: 'open', walls: [[7, 1, 7, 5], [13, 1, 13, 5]] },
    { id: 'B3', name: 'Bell tower', rect: [2, 7, 5, 11], roof: 'tower' },
    { id: 'B4a', name: 'Market Row NW', rect: [16, 1, 19, 4], roof: 'flat', mural: 'M10' },
    { id: 'B4b', name: 'Market Row NE', rect: [21, 1, 24, 4], roof: 'flat', mural: 'M10' },
    { id: 'B4c', name: 'Market Row SW', rect: [16, 6, 19, 9], roof: 'flat', mural: 'M10' },
    { id: 'B4d', name: 'Market Row SE', rect: [21, 6, 24, 9], roof: 'flat', mural: 'M10' },
    { id: 'B5a', name: 'Garden house', rect: [27, 1, 31, 4], roof: 'red' },
    { id: 'B5b', name: 'Garden house', rect: [27, 7, 31, 10], roof: 'red' },
    { id: 'B5c', name: 'Garden house', rect: [29, 16, 32, 18], roof: 'red' },
    { id: 'B6', name: 'Lantern Row', rect: [5, 14, 11, 17], roof: 'red' },
    { id: 'B7a', name: 'Net-loft A', rect: [4, 21, 7, 27], roof: 'terrace' },
    { id: 'B7b', name: 'Net-loft B', rect: [8, 21, 11, 27], roof: 'terrace' },
    { id: 'B8', name: "Tobin's boat shed", rect: [13, 21, 17, 27], roof: 'terrace' },
    { id: 'B9', name: 'Quay Row', rect: [18, 21, 21, 27], roof: 'terrace' },
    { id: 'B10', name: 'Counting-house (the Notice Roof)', rect: [22, 21, 26, 27], roof: 'terrace' },
    { id: 'B11', name: 'Ferry net shed', rect: [27, 21, 29, 22], roof: 'red' },
    { id: 'B12', name: 'Ferry-house yard', rect: [27, 23, 29, 26], roof: 'open', walls: [[27, 27, 27, 27], [29, 27, 29, 27]] },
    { id: 'B13', name: 'Ferry-house', rect: [30, 21, 33, 27], roof: 'terrace' },
    { id: 'B14', name: 'Lighthouse', rect: [37, 4, 40, 9], roof: 'tower' },
    { id: 'B15', name: 'Gull Rock chapel', rect: [38, 36, 40, 38], roof: 'lime', mural: 'M9' },
  ];
  D.lightWell = [12, 21, 12, 27]; // the drop between the net-lofts and Tobin's shed; the plank is at (12,24)

  // Vantage cells: standing here offers Look, and the camera frames `frame` (contain, >= 24 px per tile).
  D.vantages = [
    { id: 'belfry', cell: [3, 7, 2], frame: [15, 0, 25, 10], mural: 'M10', flag: 'G2' },
    { id: 'gallery', cell: [39, 9, 2], frame: [35, 33, 43, 39], mural: 'M9', flag: 'G3' },
  ];
  D.mist = { from: [34, 33], color: '#E8EEF0', alpha: 0.85 }; // drawn over x >= 34, y >= 33 unless the gallery view is open

  // Covers and other world props with state.
  D.covers = {
    awning: { rect: [1, 22, 3, 26], over: 'M2', colors: ['#C8352B', '#EDE6D3'], fadeNear: 0.15 },
    sail: { rect: [22, 22, 25, 25], over: 'M7', z: 1, rolled: [26, 22, 26, 25], openFlag: 'm7open', colors: { cloth: '#EDE6D3', fish: '#4F7C99', stone: '#8C8476' } },
    plank: { mural: 'M12', openFlag: 'm12open' },
  };
  D.props = {
    hatPost: { cell: [15, 14] },            // Ama's real hat nailed to a post (F1)
    ruleStone: { cell: [26, 12] },          // the rule in pictures (one brush = cracked seal, two brushes = gold seal)
    board: { rect: [25, 13, 27, 14] },      // six blank panels; the True Mural board
    bracket: { cell: [37, 32] },            // fish-stamped iron bracket + Ama's smashed lantern (F2)
    mast: { cell: [30, 36] },               // the Heron's broken mast on the reef
    ferry: { rect: [26, 33, 27, 35], leavesOn: 'G4' },
    window: { cell: [23, 21], face: 'north' }, // the counting-house strongroom window, seen from the street (F3)
    lamp: { cells: [[38, 4], [39, 4]], sooty: true },
    kite: { offset: [3, -3] },              // Pip's kite flies 3 tiles north-east of Pip
  };

  // ---------------------------------------------------------------------------------------------
  // Painters. style: the render pass in paint.js. border: the frame pattern. badge: the emblem in the
  // painter badge (top-left corner of every mural).
  D.painters = {
    council: { name: 'The council', hand: 'Kell', style: 'fresco', border: 'checker', badge: 'key' },
    warden: { name: 'Mother Sorrel, the Hush-Warden', hand: 'Sorrel', style: 'fresco', border: 'gold', badge: 'eye' },
    tobin: { name: 'Tobin Marsh', hand: 'Tobin', style: 'enamel', border: 'rope', badge: 'heron' },
    grue: { name: 'Grue Hollin', hand: 'Grue', style: 'enamel', border: 'fishscale', badge: 'fish' },
    pip: { name: 'Pip', hand: 'Pip', style: 'chalk', border: 'chalk', badge: 'star' },
    ama: { name: 'Ama Vell', hand: 'Ama', style: 'mosaic', border: 'yellow-tile', badge: 'moth' },
    founders: { name: 'The founders', hand: 'founders', style: 'mosaic', border: 'grout', badge: 'salt-star' },
  };

  // The hour code (taught by M11). Drawn inside the roundel at the top-right of event murals.
  D.hours = {
    dusk: { sky: '#3A3566', band: '#E07A4F', glyph: 'moon-low-left' },
    midnight: { sky: '#121A33', glyph: 'moon-top-stars' },
    late: { sky: '#121A33', glyph: 'moon-low-right' },
    dawn: { sky: '#F2B58C', glyph: 'sun-rising' },
    day: { sky: '#A9D3E6', glyph: 'sun-high' },
  };

  // The mural palette (hex), shared by every painter.
  D.palette = {
    ink: '#1C1712', plaster: '#EBDDC0', cream: '#EDE6D3', grout: '#8C8577',
    chalkStone: '#3B3D40', slate: '#2E3338', deckTar: '#3A2E24', deckSeam: '#241C15',
    dusk: '#3A3566', duskBand: '#E07A4F', night: '#121A33', nightSea: '#1E3E5C', moon: '#F4F1E6', moonPath: '#C9D6E3',
    dawnTop: '#F2B58C', dawnBottom: '#F7DFA8', sun: '#FFD23F', rays: '#FFE27A', daySky: '#A9D3E6',
    sea: '#2F6E8E', crest: '#BFE3EC',
    rock: '#6D6559', rockLight: '#8C8476', cliff: '#4F4840', hill: '#8FA66B',
    lighthouse: '#F4F1E6', band: '#B83A2E', lampLit: '#FFE27A', lampDark: '#1C1712',
    door: '#5C3A1A', wood: '#8B6B43', woodDark: '#6B4E2E',
    chest: '#4A2E1A', iron: '#6B6B6B', saltStar: '#F4F1E6',
    gold: '#C9A13B', forbid: '#B83A2E', silhouette: '#2A2420', rim: '#F7DFA8',
    rain: '#D0D8E0', heronBlue: '#2B3F6B',
  };

  // ---------------------------------------------------------------------------------------------
  // Characters. One figure() draws them all at one global head unit H (16 mural units; 8 px in the
  // world at a 30 px tile). heads = height feet-to-crown without the hat. shoulder/hem = half-widths in H.
  // The hat can change hands (figure overrides). Height and companion cannot: that is the whole tell.
  D.characters = {
    ama: {
      name: 'Ama Vell', role: 'lamp-keeper (missing)', heads: 2.2, shoulder: 0.9, hem: 1.6,
      body: '#E8A317', trim: '#B5770C', skin: '#C68B59',
      hat: 'straw', held: 'lantern', companion: 'cat', emblem: 'moth',
    },
    grue: {
      name: 'Grue Hollin', role: 'ferryman', heads: 3.8, shoulder: 0.85, hem: 1.3,
      body: '#5E6B73', trim: '#8C99A1', skin: '#E0B48C',
      hat: 'souwester', held: 'pole', companion: 'dog', emblem: 'fish',
    },
    kell: {
      name: 'Kell Brask', role: 'the Reeve, keeper of keys', heads: 3.8, shoulder: 0.8, hem: 1.25,
      body: '#6E2F5E', trim: '#1E1A1C', skin: '#F1D0B0',
      hat: 'stovepipe', held: 'key', companion: 'none', emblem: 'key',
    },
    tobin: {
      name: 'Tobin Marsh', role: 'captain of the Heron', heads: 3.2, shoulder: 1.3, hem: 1.9,
      body: '#2B3F6B', trim: '#D9B24A', skin: '#8D5A3B', sling: '#F4F4F4', // the sling only in the world, after the wreck
      hat: 'bobble', held: 'rope', companion: 'none', emblem: 'heron',
    },
    sorrel: {
      name: 'Mother Sorrel', role: 'the Hush-Warden', heads: 3.2, shoulder: 0.9, hem: 1.7,
      body: '#F2EFE6', trim: '#CFCBBF', skin: '#D9A577', edge: '#C9A13B',
      hat: 'hood', held: 'bell-bound', companion: 'none', emblem: 'eye',
    },
    pip: {
      name: 'Pip', role: 'child, chalk painter', heads: 1.8, shoulder: 0.7, hem: 1.1,
      body: '#2E9FC4', trim: '#23809E', skin: '#B07A4F', hair: '#3B2416',
      hat: 'bunches', held: 'chalk', companion: 'none', emblem: 'star', kite: ['#D8432C', '#FFFFFF'],
    },
    apprentice: {
      name: 'The apprentice (you)', role: 'player', heads: 2.8, shoulder: 0.85, hem: 1.4,
      body: '#4E9A3A', trim: '#2E6B43', skin: '#E8B990',
      hat: 'cap', held: 'brush', heldLeft: 'pot', companion: 'none', emblem: 'brush',
    },
    folk1: { name: 'Net-mender', heads: 3.0, shoulder: 0.9, hem: 1.4, body: '#A88B68', trim: '#8C7356', skin: '#C8956A', hat: 'none', held: 'net', companion: 'none', emblem: null },
    folk2: { name: 'Sweeper', heads: 3.0, shoulder: 0.9, hem: 1.4, body: '#8C7A5B', trim: '#6E5F45', skin: '#E2B78F', hat: 'none', held: 'broom', companion: 'none', emblem: null },
    folk3: { name: 'Old man', heads: 3.0, shoulder: 0.9, hem: 1.4, body: '#B59C7A', trim: '#937D5F', skin: '#9A6A48', hat: 'none', held: 'none', companion: 'none', emblem: null },
    kneeler: { name: 'Townsperson', heads: 3.0, shoulder: 0.9, hem: 1.4, body: '#A88B68', trim: '#8C7356', skin: '#C8956A', hat: 'none', held: 'none', companion: 'none', emblem: null },
  };
  D.heightClass = (heads) => (heads < 2.6 ? 'short' : heads > 3.4 ? 'tall' : 'mid');
  D.hats = {
    straw: { color: '#E9D27A', band: '#8A5A1E', brim: [2.6, 0.3], crown: [0.7, 0.35] },
    souwester: { color: '#3E4A52', dome: 1.15, backBrim: 0.9 },
    stovepipe: { color: '#1E1A1C', size: [0.75, 1.1], brim: [1.0, 0.12] },
    bobble: { color: '#C8352B', dome: [1.05, 0.5], bobble: 0.18, bobbleColor: '#FFFFFF' },
    hood: { color: '#F2EFE6', edge: '#C9A13B', base: 1.2, above: 1.0 },
    bunches: { color: '#3B2416', r: 0.45 },
    cap: { color: '#2E6B43' },
    none: {},
  };
  D.companions = {
    cat: { color: '#FFFFFF', w: 0.7 },                                   // sits on the figure's right shoulder (viewer's left)
    dog: { color: '#8A5A2B', ear: '#5C3A1A', len: 1.8, tall: 1.3, tailLoop: 0.45 }, // at the feet; the curled tail loop has a clear gap
  };
  // Emblems (the chest patch, the painter badge, the Vigil Roll rows, answer stamps).
  D.emblems = {
    moth: { owner: 'ama', colors: ['#F4F1E6', '#6B5A3A'] },
    fish: { owner: 'grue', colors: ['#4F7C99', '#FFFFFF'] },
    key: { owner: 'kell', colors: ['#1E1A1C', '#FFFFFF'] },
    heron: { owner: 'tobin', colors: ['#FFFFFF', '#2B3F6B'] },
    eye: { owner: 'sorrel', colors: ['#C9A13B', '#F2EFE6'] },
    star: { owner: 'pip', colors: ['#FFD23F', '#3B3D40'] },
    brush: { owner: 'apprentice', colors: ['#C8352B', '#FFFFFF'] },
    'salt-star': { owner: 'founders', colors: ['#F4F1E6', '#2B3F6B'] },
  };

  // ---------------------------------------------------------------------------------------------
  // The twelve murals. rect: footprint in cells. z: the level you stand on to Look (null: vantage only).
  // view: 'stand' (Look while standing on it at its level) or 'vantage:<id>'. auto: Look opens by itself on
  // the first stop (after 0.4 s standing still). cover: what hides it until a flag. reveals: design notes.
  D.murals = [
    { id: 'M1', ch: '1', title: 'The Verdict', surface: 'ground', z: 0, rect: [16, 11, 23, 18], view: 'stand', auto: true,
      painter: 'council', when: 'IV', hour: 'dusk', tally: 3,
      reveals: "The town's version: the lamp was dark at the vigil hour, the keeper slept, the Heron sank, the sea took her." },
    { id: 'M2', ch: '2', title: 'Two Lights', surface: 'ground', z: 0, rect: [1, 23, 3, 25], view: 'stand', auto: true,
      painter: 'pip', when: 'IV', hour: 'midnight', tally: 3, cover: 'awning',
      reveals: 'At midnight the lamp was lit and Ama was awake, shorter than the door, cat on her shoulder, running to a second light on the Point.' },
    { id: 'M3', ch: '3', title: 'The Vigil Roll', surface: 'ground', z: 0, rect: [8, 1, 12, 5], view: 'stand',
      painter: 'warden', when: 'I-VII', hour: 'dusk', tally: null,
      reveals: 'Ama was at the vigil on night III. Of those ashore, only the fish (Grue) and the key (Kell) were absent. Tobin was at sea I-III.' },
    { id: 'M4', ch: '4', title: "The Heron's Last Course", surface: 'roof', z: 1, rect: [14, 22, 17, 25], view: 'stand',
      painter: 'tobin', when: 'V', hour: 'dusk', tally: 3,
      reveals: 'At the vigil hour the tower was dark and the Heron steered for a single other light over the reef.' },
    { id: 'M5', ch: '5', title: "Ama's Last Walk", surface: 'tower', z: 2, rect: [2, 8, 5, 11], view: 'stand', auto: true,
      painter: 'warden', when: 'IV', hour: 'dawn', tally: 3,
      reveals: 'The dawn walker is taller than the door, has a curly-tailed dog and no cat: not Ama. The Warden painted a backlit silhouette and labelled it with the moth.' },
    { id: 'M6', ch: '6', title: 'Her Hat on the Water', surface: 'roof', z: 1, rect: [31, 23, 33, 25], view: 'stand', auto: true,
      painter: 'grue', when: 'IV', hour: 'dawn', tally: 3,
      reveals: "Grue's alibi: he found her hat by his jetty, inside the harbour, at sunrise. Fixes tall + sou'wester + pole + curly-tailed dog = Grue." },
    { id: 'M7', ch: '7', title: 'The Night Boat', surface: 'roof', z: 1, rect: [22, 22, 25, 25], view: 'stand', cover: 'sail',
      painter: 'tobin', when: 'V', hour: 'late', tally: 3,
      reveals: 'After midnight a flat boat took a small slumped figure, a tall one, a dog and a box to Gull Rock, and came back without the small one but with the box.' },
    { id: 'M8', ch: '8', title: "The Keeper's Rose", surface: 'tower', z: 2, rect: [37, 5, 40, 8], view: 'stand',
      painter: 'ama', when: 'years ago (the brush tile: the week before the Hush)', hour: null, tally: null,
      reveals: 'Sooty dog prints to the lamp and back and a tuft of brown fur: the lamp was put out by someone with a brown dog. Moth = Ama, brush = her apprentice.' },
    { id: 'M9', ch: '9', title: 'The Moth on Gull Rock', surface: 'offshore', z: null, rect: [38, 36, 40, 38], view: 'vantage:gallery',
      painter: 'ama', when: 'IV-VIII', hour: null, tally: null,
      reveals: 'Ama is alive on Gull Rock: a fresh moth, a brush for her apprentice, five tallies with the last still wet.' },
    { id: 'M10', ch: 'A', title: 'The Heron and the Ferry', surface: 'spread', z: null, rect: [16, 1, 24, 9], view: 'vantage:belfry',
      painter: 'council', when: 'last spring', hour: 'day', tally: null,
      // the four roofs (cells) and their quarter of the 200 x 200 picture (mural units)
      quarters: [
        { roof: [16, 1, 19, 4], q: [8, 8, 95, 95] },
        { roof: [21, 1, 24, 4], q: [105, 8, 192, 95] },
        { roof: [16, 6, 19, 9], q: [8, 105, 95, 192] },
        { roof: [21, 6, 24, 9], q: [105, 105, 192, 192] },
      ],
      reveals: "The motive: the town voted (Kell, Sorrel, Tobin yes; Grue's sleeve no) to replace Grue's ferry with the Heron, which carries the silver." },
    { id: 'M11', ch: 'B', title: 'The Hush Wheel', surface: 'ground', z: 0, rect: [8, 7, 12, 11], view: 'stand',
      painter: 'founders', when: 'long ago', hour: null, tally: null,
      reveals: 'The hour code and the Hush rules: eyes closed at the dusk vigil, the lamp lit at midnight, no boats after midnight, the dawn wind blows from the land out to sea.' },
    { id: 'M12', ch: 'C', title: 'The Fresh Fish', surface: 'ground', z: 0, rect: [27, 24, 29, 26], view: 'stand', cover: 'plank',
      painter: 'grue', when: 'VII', hour: null, tally: null,
      reveals: 'Under the still-wet fish a raised plank hides an iron-banded corner with a salt-star: the chest.' },
  ];
  D.muralById = {};
  for (const m of D.murals) D.muralById[m.id] = m;
  D.muralByChar = {};
  for (const m of D.murals) D.muralByChar[m.ch] = m;
  // Not part of the twelve: the True Mural painted over the Verdict in the ending (same 8 x 8 footprint as M1).
  D.trueMural = { id: 'TRUE', title: 'The True Mural', rect: [16, 11, 23, 18], painter: 'warden' };

  // Finds: examined with Look from a cell next to them. Drawn as small scenes (paint.renderMural('F1') etc.).
  D.finds = [
    { id: 'F1', title: 'Her hat', cell: [15, 14], from: [[14, 14], [15, 15], [16, 14], [15, 13], [14, 13], [14, 15]],
      shows: "Ama's real straw hat nailed to a post beside the Verdict (moth stitched inside the band)." },
    { id: 'F2', title: 'The Point', cell: [37, 32], from: [[36, 32], [38, 32], [37, 31], [36, 31], [38, 31]],
      shows: 'A blackened iron lantern bracket stamped with a fish, driven into the rock, and Ama\'s smashed lantern with a moth etched on it.' },
    { id: 'F3', title: 'The strongroom', cell: [23, 21], from: [[22, 20], [23, 20]],
      shows: 'Through the counting-house window: an open strongroom, an empty chest stand and a cold lantern. Kell waited for a chest that never came.' },
  ];

  // ---------------------------------------------------------------------------------------------
  // People in the world. at: [x, y, z]. Sprites are upright billboards drawn with paint.sprite().
  D.npcs = [
    { id: 'grue', at: [29, 28, 0], face: -1, dog: [28, 27, 0], dogPose: 'lie',   // the dog lies across the yard gate until G4
      intro: { from: [25, 34, 0] } },
    { id: 'kell', at: [24, 20, 0], face: 1 },
    { id: 'tobin', at: [15, 28, 0], face: 1, pose: 'sit', sling: true },
    { id: 'sorrel', at: [10, 6, 0], face: 1, afterG2: [7, 8, 0], afterBoard: [28, 14, 0] },
    { id: 'pip', at: null, face: 1, onG1: { appear: [4, 22, 1], then: [8, 28, 0] } }, // hidden until G1; the kite is always up
    { id: 'cat', at: [15, 15, 0], face: -1, joinsOn: 'catJoined', avoids: 'grue', avoidRadius: 2 },
    { id: 'folk1', at: [11, 29, 0], face: 1, pose: 'sit' },
    { id: 'folk2', at: [14, 19, 0], face: -1 },
    { id: 'folk3', at: [33, 15, 0], face: -1, pose: 'sit' },
  ];
  D.pipKiteBeforeG1 = [2, 21];  // before Pip appears, the kite flies over Net Lane from behind the net-lofts

  // ---------------------------------------------------------------------------------------------
  // Flags and gates. Every gate is one row here. game.js applies effects; check.cjs plays the table.
  D.flags = [
    { id: 'intro', trigger: 'title tap', effect: 'arrival cutscene; Grue leads up S1 onto M6; Look opens' },
    { id: 'catJoined', trigger: 'M1 seen', effect: 'the cat leaves (15,15) and follows the player' },
    { id: 'G1', trigger: 'M2 seen', effect: 'Pip appears on the net-loft roof (4,22,1), climbs down to (8,28,0), L1 works; Pip bubble: M4 thumb + up arrow' },
    { id: 'stairDown', trigger: 'player stands on (26,21,1)', effect: 'S2 drops and works both ways' },
    { id: 'm7open', trigger: 'Uncover on any M7 cell', effect: 'the sail rolls to (26,22..25); M7 can be Looked' },
    { id: 'G2', trigger: 'Show M3 to Sorrel', effect: 'Sorrel walks to (7,8); the bell tower door (6,7) opens; T1 works' },
    { id: 'G3', trigger: 'Show M7 or M5 to Kell', effect: 'a key flies into the HUD; the lighthouse ribbon is cut; (38,10) opens; T2 works' },
    { id: 'G4', trigger: 'first Look of M9 at the gallery', effect: 'camera shows the jetty 1.5 s: Grue and the dog row the ferry out west; the gate (28,27) opens' },
    { id: 'm12open', trigger: 'Uncover on M12 after its first Look', effect: 'the plank lifts; the chest corner shows; Look reopens' },
    { id: 'board', trigger: 'm12open', effect: 'Sorrel moves to (28,14); standing on the board offers Paint' },
    { id: 'solved', trigger: 'all six panels correct', effect: 'recap, then the ending' },
  ];
  // Show: which mural(s) each gatekeeper wants.
  D.shows = {
    sorrel: { wants: ['M3'], flag: 'G2', chip: 'M3' },
    kell: { wants: ['M7', 'M5'], flag: 'G3', chip: 'M7' },
  };

  // Picture bubbles (no words). Tokens: {mural:'M6'} a thumbnail; {icon:'question'} an icon from icons.js;
  // {chip:'M3'} a mini-map chip outlining that mural; {nearest:true} the nearest unread mural's thumbnail.
  D.bubbles = {
    grue: { before: [{ mural: 'M6' }], growl: ['M5', 'M7'] },
    pip: { before: [{ nearest: true }], afterG1: [{ mural: 'M4' }, { icon: 'arrow-up' }] },
    tobin: { before: [{ icon: 'sail-roof' }, { icon: 'question' }], afterM7: [{ icon: 'nod' }, { mural: 'M7' }, { icon: 'arrow-kell' }] },
    sorrel: { before: [{ mural: 'M1' }, { icon: 'question' }], afterG2: [{ icon: 'tower' }, { icon: 'arrow-up' }], board: [{ icon: 'board' }] },
    kell: { before: [{ mural: 'M1' }, { icon: 'lighthouse-ribbon' }], afterG3: [{ icon: 'lighthouse' }, { icon: 'arrow-up' }] },
    folk: { before: [{ icon: 'hush' }] },
    cat: { before: [{ icon: 'paw' }] },
  };

  // The cat's hint order: the first unmet, currently reachable target gets the cat after 75 s without progress.
  D.hintIdle = 75; // seconds
  D.hintOrder = [
    { need: 'seen:M2', target: { mural: 'M2' } },
    { need: 'seen:M1', target: { mural: 'M1' } },
    { need: 'seen:M11', target: { mural: 'M11' } },
    { need: 'seen:M3', target: { mural: 'M3' } },
    { need: 'flag:G2', target: { npc: 'sorrel' } },
    { need: 'seen:M5', target: { mural: 'M5' } },
    { need: 'seen:M10', target: { vantage: 'belfry' } },
    { need: 'seen:M4', target: { mural: 'M4' } },
    { need: 'flag:m7open', target: { mural: 'M7' } },
    { need: 'seen:M7', target: { mural: 'M7' } },
    { need: 'flag:G3', target: { npc: 'kell' } },
    { need: 'seen:M8', target: { mural: 'M8' } },
    { need: 'seen:M9', target: { vantage: 'gallery' } },
    { need: 'seen:M12', target: { mural: 'M12' } },
    { need: 'flag:m12open', target: { mural: 'M12' } },
    { need: 'flag:solved', target: { cell: [26, 14, 0] } },
  ];

  // ---------------------------------------------------------------------------------------------
  // The final deduction: the True Mural board. Each panel takes an answer stamp plus one proof mural.
  // A panel is correct only if the answer is right AND the proof is in `proofs`. Feedback is only the count.
  // Stamps unlock as you see things (unlock: any one condition: 'seen:M1', 'met:kell', 'flag:G2', 'find:F3', 'visit:x,y').
  D.stamps = [
    { id: 'ama', kind: 'person', icon: 'stamp-ama', unlock: ['seen:M1', 'seen:M2'] },
    { id: 'grue', kind: 'person', icon: 'stamp-grue', unlock: ['flag:intro', 'seen:M6'] },
    { id: 'kell', kind: 'person', icon: 'stamp-kell', unlock: ['met:kell', 'seen:M10'] },
    { id: 'tobin', kind: 'person', icon: 'stamp-tobin', unlock: ['met:tobin', 'seen:M4', 'seen:M10'] },
    { id: 'sleeper', kind: 'cause', icon: 'stamp-sleeper', unlock: ['seen:M1'] },
    { id: 'storm', kind: 'cause', icon: 'stamp-storm', unlock: ['seen:M1', 'seen:M4'] },
    { id: 'lantern-point', kind: 'cause', icon: 'stamp-lantern-point', unlock: ['seen:M2', 'seen:M4', 'find:F2'] },
    { id: 'sea', kind: 'place', icon: 'stamp-sea', unlock: ['seen:M1'] },
    { id: 'point', kind: 'place', icon: 'stamp-point', unlock: ['seen:M2', 'find:F2'] },
    { id: 'gull-rock', kind: 'place', icon: 'stamp-gull-rock', unlock: ['seen:M7', 'seen:M9', 'seen:M11'] },
    { id: 'reef', kind: 'place', icon: 'stamp-reef', unlock: ['seen:M1', 'seen:M4'] },
    { id: 'counting-house', kind: 'place', icon: 'stamp-counting-house', unlock: ['visit:24,23,1', 'find:F3', 'met:kell'] },
    { id: 'ferry-house', kind: 'place', icon: 'stamp-ferry-house', unlock: ['seen:M6'] },
    { id: 'painter-pip', kind: 'painter', icon: 'stamp-painter-pip', unlock: ['seen:M2'] },
    { id: 'painter-tobin', kind: 'painter', icon: 'stamp-painter-tobin', unlock: ['seen:M4', 'seen:M7'] },
    { id: 'painter-warden', kind: 'painter', icon: 'stamp-painter-warden', unlock: ['seen:M3', 'seen:M5'] },
    { id: 'painter-grue', kind: 'painter', icon: 'stamp-painter-grue', unlock: ['seen:M6', 'seen:M12'] },
    { id: 'painter-council', kind: 'painter', icon: 'stamp-painter-council', unlock: ['seen:M1', 'seen:M10'] },
  ];
  D.questions = [
    { id: 'P1', prompt: 'prompt-P1', ask: 'Who darkened the lamp?',
      options: ['ama', 'grue', 'kell', 'tobin'], answer: 'grue', proofs: ['M8', 'M3'], hintProof: 'M8', recap: ['M8', 'M6'] },
    { id: 'P2', prompt: 'prompt-P2', ask: 'What led the Heron onto the reef?',
      options: ['sleeper', 'storm', 'lantern-point', 'tobin'], answer: 'lantern-point', proofs: ['M4', 'M2'], hintProof: 'M4', recap: ['M4', 'M2'] },
    { id: 'P3', prompt: 'prompt-P3', ask: "Who walked the cliff at dawn in Ama's hat?",
      options: ['ama', 'grue', 'kell', 'tobin'], answer: 'grue', proofs: ['M5', 'M6', 'M11', 'M2'], hintProof: 'M5', recap: ['M5', 'M6'] },
    { id: 'P4', prompt: 'prompt-P4', ask: 'Where is Ama now?',
      options: ['sea', 'point', 'gull-rock'], answer: 'gull-rock', proofs: ['M9', 'M7'], hintProof: 'M9', recap: ['M9', 'M8'] },
    { id: 'P5', prompt: 'prompt-P5', ask: 'Where is the silver chest?',
      options: ['reef', 'counting-house', 'gull-rock', 'ferry-house'], answer: 'ferry-house', proofs: ['M12', 'M7'], hintProof: 'M12', recap: ['M12', 'M7'] },
    { id: 'P6', prompt: 'prompt-P6', ask: 'Which witness painted true shapes but named the wrong person?',
      options: ['painter-pip', 'painter-tobin', 'painter-warden', 'painter-grue', 'painter-council'], answer: 'painter-warden', proofs: ['M5', 'M6', 'M2'], hintProof: 'M5', recap: ['M5', 'M6'] },
  ];
  D.hintAfterMisses = 2; // from the 2nd failed submission on, Sorrel points at the lowest-numbered wrong panel

  // ---------------------------------------------------------------------------------------------
  // Icons drawn by icons.js (canvas, in the murals' visual vocabulary). UI chrome icons (book, sound,
  // close, context actions, level badges) are inline SVG in index.html/ui.js instead.
  D.icons = [
    // answer stamps
    'stamp-ama', 'stamp-grue', 'stamp-kell', 'stamp-tobin',
    'stamp-sleeper', 'stamp-storm', 'stamp-lantern-point',
    'stamp-sea', 'stamp-point', 'stamp-gull-rock', 'stamp-reef', 'stamp-counting-house', 'stamp-ferry-house',
    'stamp-painter-pip', 'stamp-painter-tobin', 'stamp-painter-warden', 'stamp-painter-grue', 'stamp-painter-council',
    // board prompts (icon-only questions)
    'prompt-P1', 'prompt-P2', 'prompt-P3', 'prompt-P4', 'prompt-P5', 'prompt-P6',
    // bubbles and hints
    'question', 'arrow-up', 'arrow-kell', 'nod', 'shake', 'hush', 'growl', 'paw',
    'tower', 'lighthouse', 'lighthouse-ribbon', 'sail-roof', 'board',
    // the rule stone and the board
    'rule', 'seal-cracked', 'seal-gold', 'brush-1', 'brush-2', 'bell-bound', 'bell-free', 'key',
  ];

  // Sounds in sfx.js (names for sfx.play).
  D.sounds = ['step-stone', 'step-roof', 'step-wood', 'step-grass', 'creak', 'sketch', 'uncover-cloth', 'uncover-plank',
    'pop', 'nod', 'shake', 'prrp', 'tok', 'bell', 'key', 'splash', 'page'];

  // ---------------------------------------------------------------------------------------------
  // The arrival (intro) and the ending, as shot lists for game.js. Under reduced motion moves become cuts.
  D.intro = [
    { shot: 'ferry-in', frame: [18, 27, 33, 39], ms: 2500, note: 'the ferry glides in from the west to its mooring (x 26-27, y 33-35); cut under reduced motion' },
    { shot: 'step-off', note: 'player appears at (24,35,0), Grue at (25,34,0) with his dog' },
    { shot: 'lead', note: 'input locked; Grue walks to S1 (30,28) and up to (31,26,1), the player auto-walks behind him onto M6 (32,24,1); Look opens on M6' },
    { shot: 'kite-pan', ms: 1000, note: 'after Look closes: Grue goes back to (29,28,0); the camera pans along the quay to the kite over Net Lane and back; reduced motion: a kite icon pulses at the screen edge' },
  ];
  D.ending = [
    { shot: 'bell', frame: [0, 5, 9, 13], ms: 6000, note: 'Sorrel on the bell tower top unbinds the bell; it rings 3 times (sfx bell)' },
    { shot: 'rescue', frame: [20, 26, 43, 39], ms: 7000, note: 'the mist lifts; a dinghy with Kell and two townsfolk rows from the jetty to Gull Rock and back with Ama' },
    { shot: 'jetty', frame: [19, 27, 30, 36], ms: 6000, note: 'Ama on the jetty, the cat leaps to her shoulder; Grue sits on the jetty with his dog, pole across his knees; Kell stands by' },
    { shot: 'square', frame: [13, 10, 28, 19], ms: 7000, note: 'the True Mural is painted over the Verdict stroke by stroke; the hat goes from the post onto Ama\'s head' },
    { shot: 'lamp', frame: [26, 0, 43, 16], ms: 7000, note: 'dusk; Ama in the lamp room; the lamp is lit; camera rises (zooms out) over the roofs' },
    { shot: 'card', note: 'end card: the title, play again, the gallery link' },
  ];

  return D;
})();
