/* Bellhaven character generator (SPEC 4.2, 4.3): an exact port of the reference generator. Pure, seeded.
 *
 * Classic script with the shared UMD header: BH.Names in the browser, module.exports in node.
 *
 *   Names.person(saveSeed, index, opts) -> { seed, index, first, last, name, age, role, trade, trait, habit,
 *                                            look: { skin, hairStyle, hair, jacket, acc }, lv }
 *     opts: { taken: first names in use (living, buried, at the Inn), takenHabits: habit indexes of the living,
 *             role: forced role or null, buried: family names on graves (kin, P1), lv }
 *   Names.mulberry32(a) -> () => [0, 1)        Names.hash(a, b) -> uint32
 *   Names.article(trade) -> 'a' | 'an'          ("an" only for "archery coach")
 *   Names.usedToBe(trade) -> 'Used to be a PE teacher.'
 *   Names.habitLine(i) -> 'Cannot stand silence.'   Names.habitPast(i) -> 'Could not stand silence.'
 *   Names.cardLine(p) -> 'Used to be a PE teacher. Cannot stand silence.'
 *   Names.jacketName(hex) -> 'red'
 * Pools: POOLS (16 x 8 first + 6 family names), ROLES, TRADES, TRAITS, HABITS ([present, past] x 24), SKIN, STYLES,
 * HAIR, GREY, DYED, JACKETS, JACKET_NAMES, ACC. Looks never depend on the name pool.
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).Names = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';
  const POOLS = [
    ['Aino Eero Helmi Juho Kaisa Lauri Minttu Onni', 'Lehtonen Virtanen Koskinen Mäkelä Heikkinen Laine'],
    ['Ada Chidi Funmi Tunde Ngozi Emeka Bisi Kelechi', 'Okafor Adebayo Eze Balogun Nwosu Adeyemi'],
    ['Lupe Mateo Ximena Diego Rosa Joaquín Paloma Iker', 'Ibarra Salazar Ortega Villalobos Cruz Montes'],
    ['Haru Yui Kenji Aiko Sora Rin Daichi Emi', 'Sato Nakamura Ito Kobayashi Mori Takeda'],
    ['Kasia Tomek Zofia Bartek Ola Piotr Hania Kuba', 'Nowak Mazur Wójcik Krawczyk Zając Dudek'],
    ['Priya Arjun Meera Rohan Divya Karthik Anjali Vikram', 'Raman Iyer Sharma Nair Patel Menon'],
    ['Rami Layla Karim Nour Ziad Yasmin Omar Hiba', 'Haddad Khoury Nassar Saleh Mansour Aziz'],
    ['Min-jun Ji-woo Seo-yeon Hyun Da-eun Joon Ha-na Tae-yang', 'Park Kim Choi Jung Han Yoon'],
    ['Siobhan Cian Niamh Rory Aoife Declan Orla Fionn', 'Kelly Byrne Doyle Gallagher Walsh Quinn'],
    ['Thiago Larissa Caio Bianca Rafael Lívia Bruno Yara', 'Rocha Almeida Souza Barbosa Carvalho Pereira'],
    ['Linh Minh Thu Bao Mai Duc Lan Khoa', 'Tran Nguyen Pham Le Vo Dang'],
    ['Elif Emre Zeynep Arda Defne Burak Selin Kerem', 'Yılmaz Demir Şahin Aydın Kaya Öztürk'],
    ['Kwame Ama Kofi Efua Yaw Akosua Kojo Abena', 'Mensah Owusu Boateng Asante Appiah Darko'],
    ['Sven Elin Linnea Axel Maja Oskar Freja Nils', 'Lund Berg Holm Ek Sjöberg Nyström'],
    ['Eleni Nikos Sofia Yannis Katerina Petros Dimitra Alexis', 'Pappas Antoniou Georgiou Christou Lambrou Ioannou'],
    ['Marisol Paolo Joy Rey Liza Migs Carmela Jun', 'Reyes Santos Bautista Villanueva Mendoza Aquino'],
  ].map(([f, l]) => ({ first: f.split(' '), last: l.split(' ') }));
  const ROLES = ['sprinter', 'brawler', 'marksman', 'medic', 'scout'];
  const TRADES = {
    sprinter: ['bike courier', 'mail carrier', 'dog walker', 'PE teacher', 'delivery rider'],
    brawler: ['bouncer', 'firefighter', 'furniture mover', 'rugby coach', 'stunt performer'],
    marksman: ['archery coach', 'surveyor', 'photographer', 'watchmaker', 'sign painter'],
    medic: ['nurse', 'vet', 'pharmacist', 'paramedic', 'midwife'],
    scout: ['park ranger', 'night guard', 'DJ', 'taxi driver', 'birdwatcher'],
  };
  const TRAITS = ['tough', 'lucky', 'light_sleeper', 'quick_learner', 'steady', 'iron_stomach', 'night_owl', 'reckless', 'loud', 'heavy'];
  const HABITS = [
    ['hums old pop songs', 'hummed old pop songs'], ['names every crow', 'named every crow'], ['keeps a list of dead streets', 'kept a list of dead streets'],
    ['sharpens pencils to stay calm', 'sharpened pencils to stay calm'], ['never takes off the left glove', 'never took off the left glove'],
    ['collects bottle caps', 'collected bottle caps'], ['counts steps out loud', 'counted every step out loud'], ['writes letters nobody can send', 'wrote letters nobody could send'],
    ['feeds the stray cat first', 'fed the stray cat first'], ['tells the same joke every night', 'told the same joke every night'], ['braids string bracelets', 'braided string bracelets for everyone'],
    ['talks to the radio', 'talked to the radio'], ['sleeps with boots on', 'slept with boots on'], ['rates every sunset out of ten', 'rated every sunset out of ten'],
    ['knows every bus timetable', 'knew every bus timetable'], ['saves the last biscuit for someone else', 'saved the last biscuit for someone else'],
    ['whistles through teeth', 'whistled through teeth'], ['reads the same paperback again', 'read the same paperback to pieces'], ['draws maps on napkins', 'drew maps on napkins'],
    ['cannot stand silence', 'could not stand silence'], ['keeps a seed packet for later', 'kept a seed packet for later'], ['apologises to doors', 'apologised to doors'],
    ['laughs too loud at gates', 'laughed too loud at gates'], ['carries a photo nobody has seen', 'carried a photo nobody saw'],
  ];
  const SKIN = ['#f2d0b5', '#e0b392', '#c68e6a', '#a26a4a', '#7a4a33', '#4f3022'];
  const STYLES = ['buzz', 'short', 'bob', 'bun', 'ponytail', 'curls', 'bald'];
  const HAIR = ['#1d1a1a', '#3b2a20', '#7a4b2a', '#c8954e', '#a33b2a'], GREY = '#d8d2c4', DYED = '#4a6fa5';
  const JACKETS = ['#3f6fb5', '#c9503c', '#4f8f5a', '#d9a441', '#7a5ca8', '#2f8f8f', '#8a8f98', '#e07aa0'];   // never orange: orange means "selected"
  const JACKET_NAMES = ['blue', 'red', 'green', 'mustard', 'purple', 'teal', 'grey', 'pink'];
  const ACC = ['none', 'none', 'none', 'beanie', 'cap', 'glasses', 'scarf', 'headband'];

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(a, b) { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2d); return (h ^ h >>> 15) >>> 0; }

  // SPEC 4.2, exact: every draw in this order, so the seed rebuilds the person.
  function person(saveSeed, index, opts) {
    opts = opts || {};
    const seed = hash(saveSeed >>> 0, index), r = mulberry32(seed), n = (k) => Math.floor(r() * k);
    const taken = new Set(opts.taken || []);
    let pool, first, tries = 0;
    do { pool = POOLS[n(16)]; first = pool.first[n(8)]; tries++; } while (taken.has(first) && tries < 32);
    if (taken.has(first)) { outer: for (const p of POOLS) for (const f of p.first) if (!taken.has(f)) { pool = p; first = f; break outer; } }
    let last = pool.last[n(6)];
    const k1 = r(), k2 = r();                                   // always drawn, so kin never shifts the stream
    if (opts.buried && opts.buried.length && k1 < 0.2) last = opts.buried[Math.floor(k2 * opts.buried.length)];
    const age = 19 + Math.floor((r() + r() + r()) / 3 * 46);   // 19-64, mostly 30s and 40s
    let role = ROLES[n(5)]; if (opts.role) role = opts.role;    // drawn even when forced
    const trade = TRADES[role][n(5)];
    const trait = TRAITS[n(10)];
    const takenH = new Set(opts.takenHabits || []);
    let habit = n(24), ht = 1; while (takenH.has(habit) && ht < 8) { habit = n(24); ht++; }
    const skin = SKIN[n(6)], hairStyle = STYLES[n(7)];
    const a = r(), b = r();
    const hair = age > 55 && a < 0.6 ? GREY : a > 0.96 ? DYED : HAIR[Math.floor(b * 5)];
    const jacket = JACKETS[n(8)], acc = ACC[n(8)];
    return { seed, index, first, last, name: first + ' ' + last, age, role, trade, trait, habit,
             look: { skin, hairStyle, hair, jacket, acc }, lv: opts.lv || 1 };
  }

  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const article = (trade) => (trade === 'archery coach' ? 'an' : 'a');
  const usedToBe = (trade) => 'Used to be ' + article(trade) + ' ' + trade + '.';
  const habitLine = (i) => (HABITS[i] ? cap1(HABITS[i][0]) + '.' : '');
  const habitPast = (i) => (HABITS[i] ? cap1(HABITS[i][1]) + '.' : '');
  const cardLine = (p) => usedToBe(p.trade) + ' ' + habitLine(p.habit);
  const jacketName = (hex) => { const i = JACKETS.indexOf(hex); return i < 0 ? '' : JACKET_NAMES[i]; };

  return { POOLS, ROLES, TRADES, TRAITS, HABITS, SKIN, STYLES, HAIR, GREY, DYED, JACKETS, JACKET_NAMES, ACC,
    mulberry32, hash, person, article, usedToBe, habitLine, habitPast, cardLine, jacketName };
});
