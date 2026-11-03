'use strict';
/* Two Thumbs Left, prototype 0: a single-player, top-down zombie horde run for phones.
 * Start room -> night streets -> a slow gate opened by a loud switch -> safe room.
 * World units: 1 tile = 40 u; the survivor is ~26 u across and runs at 200 u/s.
 */
(() => {
  // ================================================================ utils
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const reducedMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const $ = (s) => document.querySelector(s);
  const IN = window.TwinStick;
  const SFX = window.Sfx;

  // ================================================================ settings / feel lab
  const DEFAULTS = {
    // sticks (mirrored into TwinStick.cfg)
    mode: 'floating', size: 0, follow: true, moveDead: 0.10, moveSat: 0.85, moveCurve: 1.0, moveMin: 0.30,
    aimDead: 0.18, fireMode: 'ring', fireAt: 0.65, fireHys: 0.10, tapShove: true, flickShove: false, lefty: false, haptics: true,
    // feel
    speed: 200, accelMs: 90, aimTurn: 900, lookHold: 600,
    assist: 0.5, assistCone: 12, assistMax: 8,
    shoveBtn: true, topUp: true,
    zoom: 1, lookAhead: 1, shake: 1,
    // world
    horde: 1, cap: 45, threat: true, quality: 'auto',
    // practice
    god: false, infAmmo: false, slowmo: false, debug: false, fps: false,
  };
  const CONTROL_KEYS = ['mode', 'size', 'follow', 'moveDead', 'moveSat', 'moveCurve', 'moveMin', 'aimDead', 'fireMode', 'fireAt', 'fireHys', 'tapShove', 'flickShove', 'lefty', 'haptics'];
  const PRESETS = [
    { id: 'A', name: 'A · Fire ring', note: 'aim inside, fire past 65 %', set: { fireMode: 'ring', fireAt: 0.65, fireHys: 0.10, assist: 0.5 } },
    { id: 'B', name: 'B · Hair trigger', note: 'fire past 35 %', set: { fireMode: 'ring', fireAt: 0.35, fireHys: 0.07, assist: 0.5 } },
    { id: 'C', name: 'C · Fire on aim', note: 'any push fires', set: { fireMode: 'any', assist: 0.5 } },
    { id: 'D', name: 'D · Auto-fire', note: 'fires at targets in the cone', set: { fireMode: 'auto', assist: 0.7 } },
  ];
  const cfg = Object.assign({}, DEFAULTS);
  const STORE = 'remotefunland:two-thumbs-left:feel';
  let sharedLoaded = false;

  function sanitize(src) { for (const k in src) if (k in DEFAULTS && typeof src[k] === typeof DEFAULTS[k]) cfg[k] = src[k]; }
  function loadCfg() {
    try { sanitize(JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* storage blocked */ }
    const m = /feel=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (m) {
      try { sanitize(JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))))); sharedLoaded = true; } catch (e) { /* bad link */ }
    }
  }
  function saveCfg() { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* storage blocked */ } }
  function applyCfg() { for (const k of CONTROL_KEYS) IN.cfg[k] = cfg[k]; document.body.classList.toggle('lefty', cfg.lefty); syncHowto(); resize(); }
  function shareLink() {
    const diff = {};
    for (const k in DEFAULTS) if (cfg[k] !== DEFAULTS[k]) diff[k] = cfg[k];
    const b = btoa(unescape(encodeURIComponent(JSON.stringify(diff)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.href.split('#')[0] + (Object.keys(diff).length ? '#feel=' + b : '');
  }

  const pct = (v) => Math.round(v * 100) + '%';
  const LAB = [
    { group: () => `Move stick · ${cfg.lefty ? 'right' : 'left'} thumb` },
    { key: 'mode', label: 'Placement', type: 'seg', options: [['floating', 'Floating'], ['fixed', 'Fixed']], hint: 'Floating: the stick appears wherever your thumb lands.' },
    { key: 'size', label: 'Stick size', type: 'range', min: 0, max: 96, step: 2, fmt: (v) => (v === 0 ? 'auto (' + IN.R + ' px)' : v + ' px') },
    { key: 'follow', label: 'Base follows thumb', type: 'toggle', hint: 'When your thumb runs past the rim, the stick slides along with it.' },
    { key: 'moveDead', label: 'Dead zone', type: 'range', min: 0, max: 0.35, step: 0.01, fmt: pct },
    { key: 'moveSat', label: 'Full speed at', type: 'range', min: 0.5, max: 1, step: 0.01, fmt: pct },
    { key: 'moveMin', label: 'Minimum speed', type: 'range', min: 0, max: 0.6, step: 0.02, fmt: pct, hint: 'Pushes below about half are a quiet walk that sleeping zombies don’t hear.' },
    { key: 'moveCurve', label: 'Response curve', type: 'range', min: 0.5, max: 2.5, step: 0.05, fmt: (v) => v.toFixed(2) + (v === 1 ? ' linear' : v > 1 ? ' fine' : ' twitchy') },
    { key: 'speed', label: 'Run speed', type: 'range', min: 140, max: 260, step: 5, fmt: (v) => v + ' u/s' },
    { key: 'accelMs', label: 'Get up to speed in', type: 'range', min: 0, max: 300, step: 10, fmt: (v) => v + ' ms' },
    { group: () => `Aim stick · ${cfg.lefty ? 'left' : 'right'} thumb` },
    { key: 'fireMode', label: 'Firing', type: 'seg', options: [['ring', 'Ring'], ['any', 'On aim'], ['auto', 'Auto']] },
    { key: 'fireAt', label: 'Fire ring', type: 'range', min: 0.25, max: 0.95, step: 0.01, fmt: pct, hint: 'Inside the ring you aim the flashlight without spending ammo; past it you shoot.' },
    { key: 'fireHys', label: 'Ring stickiness', type: 'range', min: 0, max: 0.25, step: 0.01, fmt: pct },
    { key: 'aimDead', label: 'Aim dead zone', type: 'range', min: 0.05, max: 0.45, step: 0.01, fmt: pct },
    { key: 'aimTurn', label: 'Turn speed cap', type: 'range', min: 180, max: 3600, step: 60, fmt: (v) => (v >= 3600 ? 'instant' : v + '°/s') },
    { key: 'lookHold', label: 'Keep aim after release', type: 'range', min: 0, max: 2000, step: 50, fmt: (v) => v + ' ms' },
    { key: 'assist', label: 'Aim assist', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => (v === 0 ? 'off' : pct(v)) },
    { key: 'assistCone', label: 'Assist cone', type: 'range', min: 4, max: 30, step: 1, fmt: (v) => '±' + v + '°' },
    { key: 'assistMax', label: 'Assist max pull', type: 'range', min: 2, max: 20, step: 1, fmt: (v) => v + '°' },
    { group: 'Shove' },
    { key: 'tapShove', label: () => `Tap the ${cfg.lefty ? 'left' : 'right'} side to shove`, type: 'toggle' },
    { key: 'flickShove', label: 'Flick to shove (aims the shove)', type: 'toggle' },
    { key: 'shoveBtn', label: 'Shove button', type: 'toggle' },
    { group: 'Layout & comfort' },
    { key: 'lefty', label: 'Swap sides (left-handed)', type: 'toggle' },
    { key: 'haptics', label: 'Vibration (Android)', type: 'toggle' },
    { key: 'topUp', label: 'Reload during lulls', type: 'toggle' },
    { group: 'Camera' },
    { key: 'zoom', label: 'Zoom', type: 'range', min: 0.6, max: 1.6, step: 0.05, fmt: (v) => v.toFixed(2) + '×' },
    { key: 'lookAhead', label: 'Look ahead', type: 'range', min: 0, max: 2, step: 0.05, fmt: pct },
    { key: 'shake', label: 'Screen shake', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: pct },
    { group: 'Horde' },
    { key: 'horde', label: 'Horde size', type: 'range', min: 0.5, max: 2.5, step: 0.1, fmt: (v) => v.toFixed(1) + '×' },
    { key: 'cap', label: 'Max zombies alive', type: 'range', min: 20, max: 120, step: 5, fmt: (v) => String(v) },
    { key: 'threat', label: 'Threat markers', type: 'toggle', hint: 'Red ticks around you for zombies you can hear but not see.' },
    { group: 'Practice & debug' },
    { key: 'god', label: 'Can’t die', type: 'toggle' },
    { key: 'infAmmo', label: 'Infinite ammo', type: 'toggle' },
    { key: 'slowmo', label: 'Slow motion (¼ speed)', type: 'toggle' },
    { key: 'quality', label: 'Quality', type: 'seg', options: [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']] },
    { key: 'debug', label: 'Show touches & stick values', type: 'toggle' },
    { key: 'fps', label: 'Show FPS', type: 'toggle' },
  ];

  // ================================================================ map
  const T = 40;
  const BLOCK_P = 1, OPAQUE = 2, BLOCK_Z = 4, NOSPAWN = 8, YARD = 16, FENCE = 32;
  const K = { NONE: 0, BUILDING: 1, CAR: 2, FENCE: 3, WALL: 4, GATE: 5, TREE: 6, SAFEWALL: 7, CRATE: 8, DOOR: 9 };
  const FL = { ASPHALT: 0, SIDEWALK: 1, GRASS: 2, LOT: 3, SAFE: 4, GRAVEL: 5, ALLEY: 6, CONCRETE: 7 };
  const BW = 11, S = 5, NX = 7, NY = 3, OX = 1, OY = 1;
  const CW = NX * BW + (NX + 1) * S, CH = NY * BW + (NY + 1) * S;
  const YW = 14;
  const MW = OX + CW + 1 + YW + 1, MH = OY + CH + 1;
  const WALLX = OX + CW;
  const streetX = (i) => OX + i * (BW + S), streetY = (j) => OY + j * (BW + S);
  const blockX = (i) => streetX(i) + S, blockY = (j) => streetY(j) + S;
  let M = null;

  function generate(seed) {
    const R = mulberry32(seed);
    const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
    const W = MW, H = MH;
    const flags = new Uint8Array(W * H), kind = new Uint8Array(W * H), floor = new Uint8Array(W * H);
    const id = (x, y) => y * W + x;
    const solid = (x, y, k, f) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = id(x, y); kind[i] = k; flags[i] = (flags[i] & (NOSPAWN | YARD)) | f; };
    const clear = (x, y) => { const i = id(x, y); kind[i] = 0; flags[i] &= NOSPAWN | YARD; };
    const isFree = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && !(flags[id(x, y)] & (BLOCK_P | BLOCK_Z));
    const fl = (x, y, f) => { if (x >= 0 && y >= 0 && x < W && y < H) floor[id(x, y)] = f; };
    const buildings = [], cars = [], trees = [], lights = [], items = [], decor = [], marks = [], lots = [];
    const WALL_F = BLOCK_P | BLOCK_Z | OPAQUE;

    for (let x = 0; x < W; x++) { solid(x, 0, K.WALL, WALL_F); solid(x, H - 1, K.WALL, WALL_F); }
    for (let y = 0; y < H; y++) { solid(0, y, K.WALL, WALL_F); solid(W - 1, y, K.WALL, WALL_F); }

    // open street segments: random spanning tree over intersections + some loops
    const nodes = (NX + 1) * (NY + 1);
    const parent = Array.from({ length: nodes }, (_, i) => i);
    const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
    const edges = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      if (i < NX) edges.push({ h: true, i, j, a: j * (NX + 1) + i, b: j * (NX + 1) + i + 1 });
      if (j < NY) edges.push({ h: false, i, j, a: j * (NX + 1) + i, b: (j + 1) * (NX + 1) + i });
    }
    for (let k = edges.length - 1; k > 0; k--) { const r = Math.floor(R() * (k + 1)); [edges[k], edges[r]] = [edges[r], edges[k]]; }
    const js = ri(0, NY - 1);
    const jg = ri(1, NY - 1);
    for (const e of edges) {
      const forced = !e.h && e.i === 1 && e.j === js;
      const ra = find(e.a), rb = find(e.b);
      if (ra !== rb) { parent[ra] = rb; e.open = true; } else e.open = forced || R() < 0.42;
    }

    function addBuilding(x, y, w, h, style) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) solid(xx, yy, K.BUILDING, WALL_F);
      const det = [];
      const n = Math.floor((w * h) / 10) + 1;
      for (let k = 0; k < n; k++) det.push({ t: R() < 0.55 ? 'ac' : R() < 0.5 ? 'vent' : 'hatch', x: (x + 0.6 + R() * (w - 1.2)) * T, y: (y + 0.6 + R() * (h - 1.2)) * T, s: 0.7 + R() * 0.6 });
      buildings.push({ x: x * T, y: y * T, w: w * T, h: h * T, style, det });
    }
    function addCar(tx, ty, horiz) {
      const w = horiz ? 4 : 2, h = horiz ? 2 : 4;
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) if (!isFree(x, y)) return false;
      for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) solid(x, y, K.CAR, BLOCK_P | BLOCK_Z);
      const cols = ['#6b2f2f', '#2f4a6b', '#5f6266', '#c9c4b8', '#2c3a2c', '#7a5a2a', '#3b3b44', '#8a8f96'];
      cars.push({ x: tx * T, y: ty * T, w: w * T, h: h * T, horiz, col: cols[Math.floor(R() * cols.length)], flip: R() < 0.5, wreck: R() < 0.35, ang: (R() - 0.5) * 0.06 });
      return true;
    }
    function courtyard(x, y, w, h) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) fl(xx, yy, FL.CONCRETE);
      decor.push({ t: 'dumpster', x: (x + w / 2) * T, y: (y + h / 2) * T, a: w > h ? 0 : Math.PI / 2 });
    }

    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const bx = blockX(i), by = blockY(j);
      for (let y = by; y < by + BW; y++) for (let x = bx; x < bx + BW; x++) fl(x, y, FL.SIDEWALK);
      if (i === 0 && j === js) continue;
      const roll = R();
      const type = roll < 0.3 ? 'building' : roll < 0.55 ? 'split' : roll < 0.72 ? 'lot' : roll < 0.84 ? 'park' : 'court';
      const style = ri(0, 5);
      if (type === 'building') addBuilding(bx + 1, by + 1, 9, 9, style);
      else if (type === 'split') {
        const o = ri(3, 4), aw = 2;
        if (R() < 0.5) {
          addBuilding(bx + 1, by + 1, o, 9, style);
          addBuilding(bx + 1 + o + aw, by + 1, 9 - o - aw, 9, (style + 1) % 6);
          for (let y = by + 1; y < by + 10; y++) for (let x = bx + 1 + o; x < bx + 1 + o + aw; x++) fl(x, y, FL.ALLEY);
          if (R() < 0.6) decor.push({ t: 'dumpster', x: (bx + 1 + o + aw / 2) * T, y: (by + ri(2, 7) + 0.5) * T, a: Math.PI / 2 });
        } else {
          addBuilding(bx + 1, by + 1, 9, o, style);
          addBuilding(bx + 1, by + 1 + o + aw, 9, 9 - o - aw, (style + 2) % 6);
          for (let y = by + 1 + o; y < by + 1 + o + aw; y++) for (let x = bx + 1; x < bx + 10; x++) fl(x, y, FL.ALLEY);
          if (R() < 0.6) decor.push({ t: 'dumpster', x: (bx + ri(2, 7) + 0.5) * T, y: (by + 1 + o + aw / 2) * T, a: 0 });
        }
      } else if (type === 'lot') {
        for (let y = by; y < by + BW; y++) for (let x = bx; x < bx + BW; x++) fl(x, y, FL.LOT);
        lots.push({ i, j, x: bx, y: by });
        for (const cx of [bx + 1, bx + 4, bx + 7]) {
          marks.push({ x: (cx - 0.5) * T, y: (by + 0.6) * T, w: 3, h: 4.2 * T });
          marks.push({ x: (cx - 0.5) * T, y: (by + 5.9) * T, w: 3, h: 4.2 * T });
          if (R() < 0.55) addCar(cx, by + 1, false);
          if (R() < 0.55) addCar(cx, by + 6, false);
        }
        marks.push({ x: (bx + 9.5) * T, y: (by + 0.6) * T, w: 3, h: 4.2 * T });
        marks.push({ x: (bx + 9.5) * T, y: (by + 5.9) * T, w: 3, h: 4.2 * T });
        lights.push({ x: (bx + 5.5) * T, y: (by + 5.5) * T, r: 230, warm: 0.2, flicker: R() < 0.3 ? 1 : 0 });
      } else if (type === 'park') {
        for (let y = by + 1; y < by + 10; y++) for (let x = bx + 1; x < bx + 10; x++) fl(x, y, FL.GRASS);
        for (let k = 0; k < 9; k++) { fl(bx + 1 + k, by + 5, FL.SIDEWALK); fl(bx + 5, by + 1 + k, FL.SIDEWALK); }
        let n = ri(6, 9);
        for (let tries = 0; tries < 60 && n > 0; tries++) {
          const x = bx + ri(1, 9), y = by + ri(1, 9);
          if (x === bx + 5 || y === by + 5 || !isFree(x, y)) continue;
          if (trees.some((t) => Math.abs(t.tx - x) + Math.abs(t.ty - y) < 2)) continue;
          solid(x, y, K.TREE, BLOCK_P | BLOCK_Z);
          trees.push({ tx: x, ty: y, x: (x + 0.5) * T, y: (y + 0.5) * T, r: 26 + R() * 10, hue: R() });
          n--;
        }
        decor.push({ t: 'bench', x: (bx + 3) * T, y: (by + 5.5) * T, a: 0 });
        decor.push({ t: 'bench', x: (bx + 8) * T, y: (by + 5.5) * T, a: 0 });
      } else {
        const side = ri(0, 3);
        const x0 = bx + 1, y0 = by + 1;
        if (side === 0) { addBuilding(x0, y0, 3, 9, style); addBuilding(x0 + 6, y0, 3, 9, style); addBuilding(x0 + 3, y0 + 5, 3, 4, style); courtyard(x0 + 3, y0, 3, 5); }
        else if (side === 2) { addBuilding(x0, y0, 3, 9, style); addBuilding(x0 + 6, y0, 3, 9, style); addBuilding(x0 + 3, y0, 3, 4, style); courtyard(x0 + 3, y0 + 4, 3, 5); }
        else if (side === 1) { addBuilding(x0, y0, 9, 3, style); addBuilding(x0, y0 + 6, 9, 3, style); addBuilding(x0, y0 + 3, 4, 3, style); courtyard(x0 + 4, y0 + 3, 5, 3); }
        else { addBuilding(x0, y0, 9, 3, style); addBuilding(x0, y0 + 6, 9, 3, style); addBuilding(x0 + 5, y0 + 3, 4, 3, style); courtyard(x0, y0 + 3, 5, 3); }
      }
    }

    // start room
    const sbx = blockX(0), sby = blockY(js);
    for (let y = sby + 1; y <= sby + 9; y++) for (let x = sbx + 1; x <= sbx + 9; x++) {
      const edge = x === sbx + 1 || x === sbx + 9 || y === sby + 1 || y === sby + 9;
      if (edge) solid(x, y, K.SAFEWALL, WALL_F); else fl(x, y, FL.SAFE);
    }
    clear(sbx + 9, sby + 5); fl(sbx + 9, sby + 5, FL.SAFE);
    for (let y = sby - 2; y <= sby + 12; y++) for (let x = sbx - 3; x <= sbx + 15; x++) if (x >= 0 && y >= 0 && x < W && y < H) flags[id(x, y)] |= NOSPAWN;
    lights.push({ x: (sbx + 10.2) * T, y: (sby + 5.5) * T, r: 180, warm: 0.9, flicker: 0 });
    lights.push({ x: (sbx + 5.5) * T, y: (sby + 5.5) * T, r: 220, warm: 0.6, flicker: 0, inside: true });

    // markings
    for (let j = 0; j <= NY; j++) for (let i = 0; i < NX; i++) marks.push({ dash: true, x: blockX(i) * T, y: (streetY(j) + S / 2) * T - 1.5, w: BW * T, h: 3, horiz: true });
    for (let i = 0; i <= NX; i++) for (let j = 0; j < NY; j++) marks.push({ dash: true, x: (streetX(i) + S / 2) * T - 1.5, y: blockY(j) * T, w: 3, h: BW * T, horiz: false });
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const x = streetX(i), y = streetY(j);
      if (i > 0) marks.push({ zebra: true, x: (x - 1.1) * T, y: y * T + 6, w: 0.9 * T, h: S * T - 12 });
      if (i < NX) marks.push({ zebra: true, x: (x + S + 0.2) * T, y: y * T + 6, w: 0.9 * T, h: S * T - 12 });
    }

    // barricades on closed segments: zombies climb them, the survivor can't
    for (const e of edges) {
      if (e.open) continue;
      if (e.h) {
        const x = blockX(e.i) + 5, y0 = streetY(e.j) - 1, y1 = streetY(e.j) + S;
        for (let y = y0; y <= y1; y++) if (isFree(x, y)) solid(x, y, K.FENCE, BLOCK_P | FENCE);
        if (R() < 0.6) addCar(x + (R() < 0.5 ? 1 : -4), streetY(e.j) + ri(0, 3), true);
      } else {
        const y = blockY(e.j) + 5, x0 = streetX(e.i) - 1, x1 = streetX(e.i) + S;
        for (let x = x0; x <= x1; x++) if (isFree(x, y)) solid(x, y, K.FENCE, BLOCK_P | FENCE);
        if (R() < 0.6) addCar(streetX(e.i) + ri(0, 3), y + (R() < 0.5 ? 1 : -4), false);
      }
    }
    for (const e of edges) {
      if (!e.open || R() < 0.35) continue;
      const lane = [0, 3, 1, 2][ri(0, 3)];
      if (e.h) addCar(blockX(e.i) + ri(0, 7), streetY(e.j) + lane, true);
      else if (!(e.i === 1 && e.j === js)) addCar(streetX(e.i) + lane, blockY(e.j) + ri(0, 7), false);
      // a lamp on some segments
      if (R() < 0.35) {
        if (e.h) lights.push({ x: (blockX(e.i) + 5.5) * T, y: (R() < 0.5 ? streetY(e.j) - 0.2 : streetY(e.j) + S + 0.2) * T, r: 200, warm: 1, flicker: R() < 0.2 ? 1 : 0, pole: true });
        else lights.push({ x: (R() < 0.5 ? streetX(e.i) - 0.2 : streetX(e.i) + S + 0.2) * T, y: (blockY(e.j) + 5.5) * T, r: 200, warm: 1, flicker: R() < 0.2 ? 1 : 0, pole: true });
      }
    }
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      if (R() > 0.55) continue;
      const cx = R() < 0.5 ? streetX(i) - 0.3 : streetX(i) + S + 0.3;
      const cy = R() < 0.5 ? streetY(j) - 0.3 : streetY(j) + S + 0.3;
      lights.push({ x: cx * T, y: cy * T, r: 210 + R() * 30, warm: 1, flicker: R() < 0.18 ? 1 : 0, pole: true });
    }

    // yard: wall with a chain-link gate, gravel, the safe room
    const gy0 = streetY(jg), gy1 = streetY(jg) + S - 1, gyc = streetY(jg) + 2;
    for (let y = 1; y < H - 1; y++) {
      if (y >= gy0 && y <= gy1) solid(WALLX, y, K.GATE, BLOCK_P | BLOCK_Z);
      else solid(WALLX, y, K.WALL, WALL_F);
    }
    for (let y = 1; y < H - 1; y++) for (let x = WALLX + 1; x < W - 1; x++) { fl(x, y, FL.GRAVEL); flags[id(x, y)] |= YARD | NOSPAWN; }
    const ex0 = WALLX + 7, ex1 = WALLX + 13;
    for (let y = gyc - 3; y <= gyc + 3; y++) for (let x = ex0; x <= ex1; x++) {
      const edge = x === ex0 || x === ex1 || y === gyc - 3 || y === gyc + 3;
      if (edge) solid(x, y, K.SAFEWALL, WALL_F); else fl(x, y, FL.SAFE);
    }
    clear(ex0, gyc); fl(ex0, gyc, FL.SAFE);
    for (let k = 0; k < 10; k++) {
      const x = WALLX + ri(2, 12), y = ri(2, H - 3);
      if (Math.abs(y - gyc) <= 2 && x < ex0 + 1) continue;
      if (x >= ex0 - 1 && x <= ex1 + 1 && y >= gyc - 4 && y <= gyc + 4) continue;
      if (isFree(x, y)) solid(x, y, K.CRATE, BLOCK_P | BLOCK_Z);
      if (R() < 0.5 && x + 1 < W - 1 && isFree(x + 1, y) && !(x + 1 >= ex0 - 1 && Math.abs(y - gyc) <= 4)) solid(x + 1, y, K.CRATE, BLOCK_P | BLOCK_Z);
    }
    lights.push({ x: (ex0 - 0.6) * T, y: (gyc + 0.5) * T, r: 290, warm: 0.25, flicker: 0, flood: true });
    lights.push({ x: (ex0 + 3.5) * T, y: (gyc + 0.5) * T, r: 200, warm: 0.6, flicker: 0, insideEnd: true });
    lights.push({ x: (WALLX - 0.5) * T, y: (gy0 - 0.6) * T, r: 220, warm: 0.15, flicker: 0, alarm: true });

    // items
    const startRoom = { x0: (sbx + 2) * T, y0: (sby + 2) * T, x1: (sbx + 9) * T, y1: (sby + 9) * T };
    const spawn = { x: (sbx + 4) * T, y: (sby + 5.5) * T };
    items.push({ t: 'weapon', w: 'smg', x: (sbx + 7.2) * T, y: (sby + 3.4) * T, mag: null, res: null });
    items.push({ t: 'weapon', w: 'shotgun', x: (sbx + 7.2) * T, y: (sby + 7.6) * T, mag: null, res: null });
    items.push({ t: 'ammo', x: (sbx + 2.8) * T, y: (sby + 2.8) * T });
    items.push({ t: 'medkit', x: (sbx + 2.8) * T, y: (sby + 8.2) * T });
    items.push({ t: 'bomb', x: (sbx + 4.6) * T, y: (sby + 8.2) * T });
    const placeIn = (col, type, extra, region) => {
      for (let tries = 0; tries < 300; tries++) {
        let x, y;
        if (region) { x = region.x + ri(0, BW - 1); y = region.y + ri(0, BW - 1); }
        else { x = blockX(col) - S + ri(0, BW + S - 1); y = ri(1, H - 2); }
        const i = id(x, y);
        if (flags[i] & (BLOCK_P | BLOCK_Z | NOSPAWN | FENCE)) continue;
        if (!region && floor[i] === FL.ASPHALT && R() < 0.75) continue;
        let ok = true;
        for (const it of items) if (Math.hypot(it.x / T - x, it.y / T - y) < 4) { ok = false; break; }
        if (!ok) continue;
        items.push(Object.assign({ t: type, x: (x + 0.5) * T, y: (y + 0.5) * T }, extra || {}));
        return true;
      }
      return false;
    };
    placeIn(2, 'pills');
    placeIn(3, 'bomb');
    const lot = lots.find((l) => l.i >= 3 && l.i <= 4);
    if (!lot || !placeIn(0, 'weapon', { w: 'rifle', mag: null, res: null }, lot)) placeIn(3, 'weapon', { w: 'rifle', mag: null, res: null });
    placeIn(3, 'ammo');
    placeIn(4, 'pills');
    placeIn(5, 'medkit');
    if (R() < 0.5) placeIn(2, 'medkit');
    const sw = { x: (WALLX - 0.15) * T, y: (gy0 - 0.5) * T };
    items.push({ t: 'switch', x: sw.x, y: sw.y, used: false });
    items.push({ t: 'ammo', x: (WALLX - 1.5) * T, y: (gy0 - 3) * T });
    items.push({ t: 'pills', x: (WALLX - 3) * T, y: (gy0 - 1.5) * T });
    items.push({ t: 'bomb', x: (WALLX - 1.5) * T, y: (gy1 + 2.5) * T });

    for (let k = 0; k < 130; k++) {
      const x = ri(1, WALLX - 1), y = ri(1, H - 2);
      if (flags[id(x, y)] & (BLOCK_P | BLOCK_Z)) continue;
      const r = R();
      decor.push({ t: r < 0.22 ? 'manhole' : r < 0.58 ? 'puddle' : r < 0.85 ? 'paper' : 'crack', x: (x + R()) * T, y: (y + R()) * T, s: 0.6 + R() * 0.8, a: R() * TAU });
    }

    const m = {
      W, H, flags, kind, floor, buildings, cars, trees, lights, items, decor, marks, lots,
      seed, js, jg, startRoom, spawn,
      gate: { x: WALLX, y0: gy0, y1: gy1, state: 'closed', t: 0, dur: 60 },
      sw, endDoor: { x: ex0, y: gyc },
      endWin: { x0: (ex0 + 2) * T, y0: (gyc - 2) * T, x1: ex1 * T, y1: (gyc + 3) * T },
      endRoom: { x0: (ex0 + 1) * T, y0: (gyc - 2) * T, x1: ex1 * T, y1: (gyc + 3) * T },
    };
    const reach = reachable(m, Math.floor(spawn.x / T), Math.floor(spawn.y / T));
    if (!reach[id(WALLX - 1, gy0 - 1)]) return null;
    for (const it of items) if (!reach[id(Math.floor(it.x / T), Math.floor(it.y / T))] && it.t !== 'switch') it.dead = true;
    m.items = items.filter((it) => !it.dead);
    return m;
  }

  function reachable(m, sx, sy) {
    const seen = new Uint8Array(m.W * m.H);
    const q = [sy * m.W + sx]; seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop(); const x = i % m.W, y = (i / m.W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
        const j = ny * m.W + nx;
        if (seen[j] || (m.flags[j] & BLOCK_P)) continue;
        seen[j] = 1; q.push(j);
      }
    }
    return seen;
  }
  const fAt = (x, y) => (x < 0 || y < 0 || x >= M.W || y >= M.H ? (BLOCK_P | BLOCK_Z | OPAQUE) : M.flags[y * M.W + x]);

  // ================================================================ rays, LOS, flow fields
  function castRay(ox, oy, dx, dy, maxDist, mask) {
    const x = ox / T, y = oy / T;
    let mx = Math.floor(x), my = Math.floor(y);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e9, tdy = dy !== 0 ? Math.abs(1 / dy) : 1e9;
    let tmx = dx > 0 ? (mx + 1 - x) * tdx : (x - mx) * tdx;
    let tmy = dy > 0 ? (my + 1 - y) * tdy : (y - my) * tdy;
    const maxT = maxDist / T;
    const W = M.W, H = M.H, F = M.flags;
    for (let n = 0; n < 400; n++) {
      let t;
      if (tmx < tmy) { t = tmx; tmx += tdx; mx += stepX; } else { t = tmy; tmy += tdy; my += stepY; }
      if (t >= maxT) return maxDist;
      if (mx < 0 || my < 0 || mx >= W || my >= H) return t * T;
      if (F[my * W + mx] & mask) return t * T;
    }
    return maxDist;
  }
  function los(ax, ay, bx, by, mask) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d < 1) return true;
    return castRay(ax, ay, dx / d, dy / d, d, mask) >= d - 0.5;
  }
  class Heap {
    constructor(n) { this.k = new Int32Array(n); this.p = new Float32Array(n); this.n = 0; }
    push(k, p) { let i = this.n++; while (i > 0) { const pa = (i - 1) >> 1; if (this.p[pa] <= p) break; this.k[i] = this.k[pa]; this.p[i] = this.p[pa]; i = pa; } this.k[i] = k; this.p[i] = p; }
    pop() {
      const top = this.k[0]; const lk = this.k[--this.n], lp = this.p[this.n];
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= this.n) break; if (c + 1 < this.n && this.p[c + 1] < this.p[c]) c++; if (this.p[c] >= lp) break; this.k[i] = this.k[c]; this.p[i] = this.p[c]; i = c; }
      this.k[i] = lk; this.p[i] = lp; return top;
    }
  }
  let heap = null;
  const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DY8 = [0, 0, 1, -1, 1, -1, 1, -1];
  // Path distance (tiles) to a target over ground zombies can cross; fences cost extra (climbing).
  // block: tiles the walker can't enter. Zombies (the default) climb fences at a cost; the bot can't.
  function flowField(field, tx, ty, block = BLOCK_Z) {
    const W = M.W, H = M.H, F = M.flags;
    const climbs = !(block & BLOCK_P), corner = climbs ? (BLOCK_Z | FENCE) : block;
    field.fill(1e9);
    if (!heap || heap.k.length < W * H * 8) heap = new Heap(W * H * 8);
    heap.n = 0;
    tx = clamp(tx, 0, W - 1); ty = clamp(ty, 0, H - 1);
    const s = ty * W + tx; field[s] = 0; heap.push(s, 0);
    while (heap.n) {
      const i = heap.pop(); const d = field[i];
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = DX8[k], dy = DY8[k], nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (F[j] & block) continue;
        if (dx && dy && ((F[y * W + nx] & corner) || (F[ny * W + x] & corner))) continue;
        const c = (dx && dy ? 1.414 : 1) * (climbs && (F[j] & FENCE) ? 5 : 1);
        if (d + c < field[j]) { field[j] = d + c; heap.push(j, d + c); }
      }
    }
  }
  function flowDir(field, x, y, out, corner = BLOCK_Z | FENCE) {
    const W = M.W, F = M.flags;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= M.W || ty >= M.H) { out.x = 0; out.y = 0; return false; }
    let best = field[ty * W + tx], bx = -1, by = -1;
    for (let k = 0; k < 8; k++) {
      const dx = DX8[k], dy = DY8[k], nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= M.W || ny >= M.H) continue;
      if (dx && dy && ((F[ty * W + nx] & corner) || (F[ny * W + tx] & corner))) continue;
      const v = field[ny * W + nx];
      if (v < best) { best = v; bx = nx; by = ny; }
    }
    if (bx < 0) { out.x = 0; out.y = 0; return false; }
    const cx = (bx + 0.5) * T - x, cy = (by + 0.5) * T - y, d = Math.hypot(cx, cy) || 1;
    out.x = cx / d; out.y = cy / d;
    return true;
  }

  // ================================================================ state
  const WEAP = {
    pistol: { name: 'Pistol', dmg: 26, rof: 5.5, mag: 15, reload: 1.4, spread: 0.035, bloom: 0.012, bloomMax: 0.07, range: 650, knock: 56, pellets: 1, pen: 0, noise: 450, sfx: 'pistol', shake: 0.07, kick: 3, len: 9, flash: 0.75 },
    smg: { name: 'SMG', dmg: 18, rof: 15, mag: 50, maxRes: 400, startRes: 250, reload: 2.0, spread: 0.045, bloom: 0.005, bloomMax: 0.05, range: 650, knock: 48, pellets: 1, pen: 0, noise: 550, sfx: 'smg', shake: 0.05, kick: 2.2, len: 15, flash: 0.75 },
    shotgun: { name: 'Shotgun', dmg: 12, rof: 1.18, mag: 8, maxRes: 64, startRes: 40, perShell: 0.45, spread: 0.14, bloom: 0, bloomMax: 0, range: 420, falloff: [120, 300], knock: 64, pellets: 9, pen: 0, noise: 700, sfx: 'shotgun', shake: 0.3, kick: 9, len: 19, pump: true, flash: 1 },
    rifle: { name: 'Rifle', dmg: 34, rof: 11, mag: 50, maxRes: 300, startRes: 200, reload: 2.2, spread: 0.03, bloom: 0.004, bloomMax: 0.04, range: 900, knock: 56, pellets: 1, pen: 1, penDmg: 0.6, noise: 600, sfx: 'rifle', shake: 0.08, kick: 3.5, len: 21, flash: 0.9 },
  };
  const Z_IDLE = 0, Z_ALERT = 1, Z_CHASE = 2, Z_ATTACK = 3, Z_STUMBLE = 4;
  const SKINS = ['#8d9a7e', '#9aa38a', '#7f8d76', '#a5a18c', '#8b8f7f', '#93998a'];
  const SHIRTS = ['#3d4a5c', '#5c3d3d', '#4a5c3d', '#5c553d', '#38383c', '#6b5a48', '#2f3e46', '#5a4a5e', '#6e6e6e', '#4b3a2a'];
  const Z_TURN = 300 * DEG, Z_ACC = 900, MAX_ATTACKERS = 5, SHOVE_REACH = 50;

  let P = null, Z = [], dying = [], items = [], parts = [], tracers = [], flashes = [], bombs = [], spawnQ = [];
  let fieldP = null, fieldL = null, fieldB = null, fieldPTile = -1, fieldPT = 0;
  let lure = null;
  let gameTime = 0, runTime = 0, hitStop = 0;
  let state = 'title'; // title | play | paused | won | dead
  let mode = 'attract'; // attract | run
  let D = null, stats = null, endT = 0;
  const cam = { x: 0, y: 0, zoom: 1, kx: 0, ky: 0, lx: 0, ly: 0, trauma: 0, sx: 0, sy: 0 };
  const vis = { ox: 0, oy: 0, n: 720, len: new Float32Array(1440), cos: null, sin: null, maxD: 900 };
  const flowTmp = { x: 0, y: 0 };
  const dmgInd = [];
  const tips = { shown: {} };
  let playerLit = false, shoveBlocked = 0, useHeld = false, useHoldT = 0;
  let runId = 0; // bumps on every newRun so stale timers can tell they belong to an old run
  let dirty = true; // redraw once even while the scene is frozen (paused, settled end screen)

  function newRun(seed, asMode) {
    mode = asMode;
    let m = null, s = seed >>> 0;
    for (let k = 0; k < 30 && !m; k++) { m = generate(s); if (!m) s = (s * 1664525 + 1013904223) >>> 0; }
    M = m;
    fieldP = new Float32Array(M.W * M.H); fieldL = new Float32Array(M.W * M.H); fieldB = new Float32Array(M.W * M.H);
    fieldPTile = -1; fieldB.goal = false;
    Z = []; dying = []; parts = []; tracers = []; flashes = []; bombs = []; spawnQ = []; lure = null;
    items = M.items.map((it) => Object.assign({}, it));
    resetDecals();
    P = {
      x: M.spawn.x, y: M.spawn.y, vx: 0, vy: 0, r: 13, hp: 100, temp: 0,
      aim: 0, aimHold: 0, lastMoveAng: 0, moveAng: 0,
      primary: null, pistol: { kind: 'pistol', mag: WEAP.pistol.mag, res: Infinity }, cur: 'pistol',
      fireCd: 0, reloadT: 0, reloadTotal: 0, swapT: 0, bloom: 0, dryT: 0, pumpT: 0, idleFire: 0,
      shoveCd: 0, shoveT: 0, shoveDir: 0, chain: 0, wasFiring: false, lastShove: -9, slowT: 0, hurtT: 0, healT: 0, med: 0, bombs: 0, pills: 0,
      firingT: 0, walkPhase: 0, assist: null, assistT: 0, dead: false, safe: false, secondWind: true, wounded: false, invT: 0, hbT: 0, sneaking: false,
    };
    if (mode === 'attract') { P.primary = { kind: 'smg', mag: 50, res: 400 }; P.cur = 'primary'; P.x = (blockX(1) - 2.5) * T; P.y = (blockY(M.js) + 5.5) * T; }
    botS.chkT = 6; botS.cx = P.x; botS.cy = P.y;
    D = { phase: 'start', intensity: 0, lastHurt: -9, mobT: 0, relaxT: 0, relaxX: 0, peakT: 0, upkeepT: 2, cresc: false, waveT: 0, waveN: 0, waveDir: -1, mobs: 0, drumsOff: 0, warn: null, pending: null };
    stats = { kills: 0, shots: 0, hits: 0, dmg: 0, shoves: 0, mobs: 0, time: 0, healed: 0 };
    gameTime = 0; runTime = 0; endT = 0; hitStop = 0;
    // these gates compare against gameTime, which just went back to 0
    noiseGate = 0; noiseMax = 0; noiseX = 0; noiseY = 0; groanGate = 0;
    runId++;
    cam.x = P.x; cam.y = P.y; cam.trauma = 0; cam.kx = cam.ky = 0; cam.lx = cam.ly = 0;
    useHeld = false; useHoldT = 0;
    populate();
    dmgInd.length = 0;
    hudCache = {};
    flowField(fieldP, Math.floor(P.x / T), Math.floor(P.y / T));
  }

  function populate() {
    const startX = M.spawn.x;
    let clumps = 0;
    for (let tries = 0; tries < 4000 && clumps < 16; tries++) {
      const x = 2 + Math.floor(Math.random() * (WALLX - 3)), y = 1 + Math.floor(Math.random() * (M.H - 2));
      if ((x + 0.5) * T < startX + 700) continue;
      if (M.flags[y * M.W + x] & (BLOCK_Z | NOSPAWN | FENCE)) continue;
      const n = 1 + Math.floor(Math.random() * 4 * Math.min(1.5, cfg.horde));
      for (let k = 0; k < n; k++) {
        const zx = (x + 0.5) * T + rand(-26, 26), zy = (y + 0.5) * T + rand(-26, 26);
        if (fAt(Math.floor(zx / T), Math.floor(zy / T)) & BLOCK_Z) continue;
        addZombie(zx, zy, Z_IDLE);
      }
      clumps++;
    }
  }

  function addZombie(x, y, st) {
    const r = Math.random();
    const speed = r < 0.15 ? rand(150, 175) : r < 0.8 ? rand(205, 225) : rand(235, 250);
    const face = Math.random() * TAU;
    const z = {
      x, y, vx: 0, vy: 0, kx: 0, ky: 0, hd: face, sp: 0, r: 11 + Math.random() * 1.4, hp: 50,
      state: st, face, speed,
      skin: SKINS[(Math.random() * SKINS.length) | 0], shirt: SHIRTS[(Math.random() * SHIRTS.length) | 0],
      phase: Math.random() * TAU, think: Math.random() * 0.3, alertT: 0, atkT: 0, atkCd: 0, stun: 0, flinch: 0, flash: 0,
      losT: 0, hasLos: false, groanT: rand(3, 14), wander: Math.random() < 0.35, wanderA: Math.random() * TAU, wanderT: rand(1, 4),
      vis: 0, lured: false, stuckT: 0, flowMode: 0, climb: 0, lastX: x, lastY: y, hair: Math.random() < 0.6, lit: false, sway: Math.random() * TAU,
    };
    Z.push(z);
    return z;
  }

  // ================================================================ decals (chunked canvases, LRU-capped)
  const CHUNK = 512, MAX_CHUNKS = 36;
  let decalChunks = new Map();
  function resetDecals() { for (const c of decalChunks.values()) { c.cv.width = 0; c.cv.height = 0; } decalChunks = new Map(); }
  function chunkAt(cx, cy, create) {
    const key = cx + ',' + cy;
    let c = decalChunks.get(key);
    if (c) { c.used = gameTime; return c; }
    if (!create) return null;
    if (decalChunks.size >= MAX_CHUNKS) {
      let oldK = null, oldT = Infinity;
      for (const [k, v] of decalChunks) if (v.used < oldT) { oldT = v.used; oldK = k; }
      const o = decalChunks.get(oldK); o.cv.width = 0; o.cv.height = 0; decalChunks.delete(oldK);
    }
    const cv = document.createElement('canvas'); cv.width = CHUNK; cv.height = CHUNK;
    c = { cv, g: cv.getContext('2d'), cx, cy, used: gameTime };
    decalChunks.set(key, c);
    return c;
  }
  function stamp(x, y, r, fn) {
    const c0x = Math.floor((x - r) / CHUNK), c1x = Math.floor((x + r) / CHUNK);
    const c0y = Math.floor((y - r) / CHUNK), c1y = Math.floor((y + r) / CHUNK);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = chunkAt(cx, cy, true);
      c.g.setTransform(1, 0, 0, 1, -cx * CHUNK, -cy * CHUNK);
      fn(c.g);
    }
  }
  function bloodDecal(x, y, s, a) {
    stamp(x, y, 30 * s, (g) => {
      g.fillStyle = `rgba(${(90 + Math.random() * 40) | 0},8,10,${a == null ? 0.75 : a})`;
      g.beginPath();
      const n = 5 + ((Math.random() * 4) | 0);
      for (let k = 0; k < n; k++) {
        const ang = Math.random() * TAU, d = Math.random() * 12 * s;
        const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
        g.moveTo(px, py); g.arc(px, py, (2 + Math.random() * 5) * s, 0, TAU);
      }
      g.fill();
    });
  }
  function corpseDecal(z, ang) {
    stamp(z.x, z.y, 40, (g) => {
      g.save();
      g.fillStyle = 'rgba(70,6,8,.7)';
      g.beginPath(); g.ellipse(z.x, z.y, 22, 16, ang, 0, TAU); g.fill();
      g.translate(z.x, z.y); g.rotate(ang);
      g.fillStyle = shade(z.shirt, -18); g.beginPath(); g.ellipse(-2, 0, 9, 12, 0, 0, TAU); g.fill();
      g.strokeStyle = shade(z.skin, -25); g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-2, -9); g.lineTo(-14, -15); g.moveTo(-2, 9); g.lineTo(-12, 17); g.stroke();
      g.fillStyle = shade(z.skin, -25); g.beginPath(); g.arc(-13, 0, 6, 0, TAU); g.fill();
      g.restore();
    });
  }
  function casingDecal(x, y, a) { stamp(x, y, 4, (g) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(200,160,70,.8)'; g.fillRect(-2, -1, 4, 2); g.restore(); }); }
  function scorchDecal(x, y) {
    stamp(x, y, 110, (g) => {
      const gr = g.createRadialGradient(x, y, 10, x, y, 105);
      gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 105, 0, TAU); g.fill();
    });
  }
  const shadeCache = new Map();
  function shade(hex, amt) {
    const key = hex + amt;
    let v = shadeCache.get(key);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    v = `rgb(${clamp((n >> 16) + amt, 0, 255)},${clamp(((n >> 8) & 255) + amt, 0, 255)},${clamp((n & 255) + amt, 0, 255)})`;
    shadeCache.set(key, v);
    return v;
  }

  // ================================================================ effects
  function addPart(p) { if (parts.length < 500) parts.push(p); }
  function bloodSpray(x, y, ang, n, force) {
    for (let k = 0; k < n; k++) {
      const a = ang + rand(-0.6, 0.6), sp = rand(60, 260) * force;
      addPart({ t: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.15, 0.4), max: 0.4, s: rand(1.5, 3.5) });
    }
  }
  function sparks(x, y, ang, n) {
    for (let k = 0; k < n; k++) {
      const a = ang + Math.PI + rand(-1, 1), sp = rand(80, 320);
      addPart({ t: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.08, 0.25), max: 0.25, s: 1.5 });
    }
  }
  function smoke(x, y, n, s) { for (let k = 0; k < n; k++) addPart({ t: 'smoke', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-20, 20), vy: rand(-20, 20), life: rand(0.4, 0.9), max: 0.9, s: s * rand(0.7, 1.3) }); }
  function shake(a) { cam.trauma = Math.min(1, cam.trauma + a); }

  // ================================================================ noise, alerts, director
  let groanGate = 0;
  function voice(z, kind) {
    if (mode !== 'run' || gameTime < groanGate) return;
    const dx = z.x - P.x, dy = z.y - P.y, d = Math.hypot(dx, dy);
    if (d > 900) return;
    groanGate = gameTime + (kind === 'alert' ? 0.18 : 0.35);
    SFX.groan(clamp(dx / 500, -1, 1), clamp(1 - d / 900, 0, 1) * (kind === 'alert' ? 1 : 0.8), kind);
  }
  function alertZ(z, delay) {
    if (z.state !== Z_IDLE) return;
    z.state = Z_ALERT; z.alertT = delay + rand(0.3, 0.8);
  }
  let noiseGate = 0, noiseMax = 0, noiseX = 0, noiseY = 0;
  function makeNoise(x, y, radius) {
    if (radius > noiseMax) { noiseMax = radius; noiseX = x; noiseY = y; }
    if (gameTime < noiseGate) return;
    noiseGate = gameTime + 0.15;
    const r = noiseMax, r2 = r * r, half2 = r2 / 4;
    noiseMax = 0;
    for (const z of Z) {
      if (z.state !== Z_IDLE) continue;
      const dx = z.x - noiseX, dy = z.y - noiseY, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      // walls halve how far a shot carries
      if (d2 > half2 && !los(noiseX, noiseY, z.x, z.y, OPAQUE)) continue;
      alertZ(z, Math.sqrt(d2) / 1100);
    }
  }
  function bump(v) { D.intensity = clamp(D.intensity + v, 0, 1); }
  // Make room for a mob: drop the farthest sleeping zombie the survivor can't see.
  function evictSleeper() {
    let best = -1, bd = 900;
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      if (z.state !== Z_IDLE || z.vis > 0) continue;
      const d = Math.hypot(z.x - P.x, z.y - P.y);
      if (d > bd) { bd = d; best = i; }
    }
    if (best < 0) return false;
    Z.splice(best, 1);
    return true;
  }
  function freeTileNear(tx, ty) {
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (!(fAt(x, y) & (BLOCK_P | BLOCK_Z | FENCE))) return { x, y };
    }
    return { x: tx, y: ty };
  }
  function chasers() { let n = 0; for (const z of Z) if (z.state !== Z_IDLE) n++; return n; }
  const maxZ = () => cfg.cap;

  // side(x, y) in tiles: which side of the survivor to prefer; strict = only that side
  function hiddenSpawnTiles(minD, maxD, want, side, strict) {
    const out = [];
    const W = M.W, F = M.flags;
    for (let tries = 0; tries < 1200 && out.length < want; tries++) {
      const x = 1 + Math.floor(Math.random() * (W - 2)), y = 1 + Math.floor(Math.random() * (M.H - 2));
      const i = y * W + x;
      if (F[i] & (BLOCK_Z | NOSPAWN | FENCE)) continue;
      const fd = fieldP[i];
      if (fd < minD || fd > maxD) continue;
      if (side && !side(x, y) && (strict || Math.random() < 0.75)) continue;
      const wx = (x + 0.5) * T, wy = (y + 0.5) * T;
      const sd = Math.hypot(wx - P.x, wy - P.y);
      if (sd < 500) continue;
      if (sd < 900 && los(P.x, P.y, wx, wy, OPAQUE)) continue;
      if (onScreen(wx, wy, 60)) continue;
      let lit = false;
      for (const L of M.lights) if (!L.inside && !L.insideEnd && Math.hypot(L.x - wx, L.y - wy) < L.r * 0.6) { lit = true; break; }
      if (lit && Math.random() < 0.8) continue;
      out.push({ x: wx, y: wy });
    }
    return out;
  }
  function planMob(n, minD, maxD, behindBias, side) {
    const want = Math.random() < 0.5 ? 1 : 2;
    let anchors;
    if (side) {
      anchors = hiddenSpawnTiles(minD, maxD, want, side, true);
      if (!anchors.length) anchors = hiddenSpawnTiles(minD, maxD, want, null);
    } else {
      const behind = Math.random() < behindBias, px = P.x / T;
      anchors = hiddenSpawnTiles(minD, maxD, want, (x) => (x < px) === behind);
    }
    if (!anchors.length) return null;
    return { n, anchors };
  }
  // still out of sight? (checked again when a planned mob is released)
  function anchorHidden(a) {
    const d = Math.hypot(a.x - P.x, a.y - P.y);
    if (d < 400 || onScreen(a.x, a.y, 60)) return false;
    return !(d < 900 && los(P.x, P.y, a.x, a.y, OPAQUE));
  }
  function releaseMob(plan, t0) {
    if (!plan || !plan.anchors.length) return;
    for (let k = 0; k < plan.n; k++) {
      const a = plan.anchors[k % plan.anchors.length];
      spawnQ.push({ at: t0 + k * 0.08, x: a.x + rand(-30, 30), y: a.y + rand(-30, 30), ax: a.x, ay: a.y, st: Z_CHASE });
    }
  }
  function warnFrom(plan, sec) {
    if (!plan) return;
    let ax = 0, ay = 0;
    for (const a of plan.anchors) { ax += a.x; ay += a.y; }
    ax /= plan.anchors.length; ay /= plan.anchors.length;
    D.warn = { ang: Math.atan2(ay - P.y, ax - P.x), t: sec, max: sec };
  }

  function refreshFieldP() {
    const tx = Math.floor(P.x / T), ty = Math.floor(P.y / T);
    flowField(fieldP, tx, ty); fieldPTile = ty * M.W + tx; fieldPT = 0.12;
  }
  function director(dt) {
    if (mode === 'run' && state !== 'play') return; // nothing new behind the end screen
    if (D.labCue) { D.labCue = false; SFX.hordeCue(); banner('HORDE!', 'danger', 2.4); } // queued by the lab's 'Horde now'
    const near400 = Z.some((z) => z.state !== Z_IDLE && Math.abs(z.x - P.x) < 400 && Math.abs(z.y - P.y) < 400);
    if (!near400 && gameTime - D.lastHurt > 3) D.intensity = Math.max(0, D.intensity - 0.035 * dt);
    const ch = chasers();
    if (mode === 'run') {
      if (ch >= 8 || D.cresc) { SFX.setDrums(true); D.drumsOff = 0; }
      else if (ch < 3) { D.drumsOff += dt; if (D.drumsOff > 4) SFX.setDrums(false); }
    }
    if (D.warn) { D.warn.t -= dt; if (D.warn.t <= 0) D.warn = null; }

    if (D.cresc) {
      const g = M.gate;
      if (g.state === 'opening') {
        D.waveT -= dt;
        const late = g.dur - g.t < 15;
        if (D.waveT <= 0) {
          const first = D.waveN === 0;
          const n = Math.round((first ? 14 : late ? 12 : rand(8, 10.99)) * cfg.horde);
          const room = Math.max(0, Math.min(maxZ(), Math.round(26 * cfg.horde)) - ch);
          D.waveT = 10; D.waveN++;
          if (room > 0) {
            // the survivor stands against the wall, so alternate along it: north, then south, then north…
            const north = D.waveDir !== 1; D.waveDir = north ? 1 : 0;
            const py = P.y / T, total = Math.min(n, room);
            const sideN = (x, y) => y < py, sideS = (x, y) => y >= py;
            let plan;
            if (first) {
              // the opening wave comes from both ends at once
              const a = planMob(total, 12, 26, 0, sideN), b = planMob(total, 12, 26, 0, sideS);
              plan = a && b ? { n: total, anchors: a.anchors.concat(b.anchors) } : a || b;
            } else plan = planMob(total, 12, 26, 0, north ? sideN : sideS);
            releaseMob(plan, gameTime + 0.3);
            warnFrom(plan, 2);
          }
        }
      }
      return;
    }
    const inStart = inRoomRect(P, M.startRoom);
    switch (D.phase) {
      case 'start':
        if (!inStart && P.x > M.startRoom.x1 + T) { D.phase = 'build'; D.mobT = rand(40, 60); }
        break;
      case 'build': {
        if (D.intensity >= 0.8) { D.phase = 'peak'; D.peakT = 4; break; }
        if (Math.hypot(P.x - M.sw.x, P.y - M.sw.y) < 14 * T) { D.phase = 'relax'; D.relaxT = 1e9; D.relaxX = P.x; break; }
        D.mobT -= dt;
        if (D.mobT <= 3 && !D.pending) {
          const n = Math.round((rand(10, 16.99) + D.mobs) * cfg.horde);
          D.pending = planMob(n, 16, 28, 0.6);
          if (!D.pending) D.mobT = 3.5;
          else { warnFrom(D.pending, 3); if (mode === 'run') { SFX.hordeCue(); banner('HORDE!', 'danger', 2.4); } }
        }
        if (D.mobT <= 0 && D.pending) {
          // the survivor may have walked into view of a planned spot in the last 3 s
          D.pending.anchors = D.pending.anchors.filter(anchorHidden);
          if (!D.pending.anchors.length) { const p = planMob(D.pending.n, 16, 28, 0.6); if (p) { D.pending.anchors = p.anchors; warnFrom(p, 1); } }
          if (D.pending.anchors.length) {
            releaseMob(D.pending, gameTime);
            D.pending = null; D.mobs++; stats.mobs++;
            D.mobT = rand(75, 120);
          } else D.mobT = 0.5;
        }
        break;
      }
      case 'peak':
        D.peakT -= dt;
        if (D.peakT <= 0) D.phase = 'fade';
        break;
      case 'fade':
        if (D.intensity < 0.35) { D.phase = 'relax'; D.relaxT = rand(30, 40); D.relaxX = P.x; }
        break;
      case 'relax':
        D.relaxT -= dt;
        if (D.relaxT > 1e8 && Math.hypot(P.x - M.sw.x, P.y - M.sw.y) > 16 * T) D.relaxT = 6;
        if (D.relaxT <= 0 || (D.relaxT < 1e8 && P.x - D.relaxX > 1500)) D.phase = 'build';
        break;
    }
    if (D.pending && D.phase !== 'build') { releaseMob(D.pending, gameTime + 0.5); D.pending = null; D.mobs++; stats.mobs++; D.mobT = rand(75, 120); }
    // wanderers ahead
    D.upkeepT -= dt;
    if (D.upkeepT <= 0 && (D.phase === 'build' || D.phase === 'relax')) {
      D.upkeepT = 3;
      let ahead = 0;
      for (const z of Z) if (z.state === Z_IDLE && z.x > P.x + 200 && z.x < P.x + 1600) ahead++;
      if (ahead < 16 && Z.length < maxZ() - 4) {
        const px = P.x / T;
        for (const t of hiddenSpawnTiles(18, 40, 2, (x) => x >= px)) {
          if (t.x < P.x + 700 || t.x > WALLX * T) continue;
          const n = 1 + ((Math.random() * 4) | 0);
          for (let k = 0; k < n; k++) addZombie(t.x + rand(-24, 24), t.y + rand(-24, 24), Z_IDLE);
        }
      }
    }
  }

  // ================================================================ player actions
  const curW = () => (P.cur === 'primary' && P.primary ? P.primary : P.pistol);

  function tryFire() {
    const w = curW(), def = WEAP[w.kind];
    if (P.fireCd > 0 || P.swapT > 0) return;
    if (P.reloadT > 0) { if (def.perShell && w.mag > 0) P.reloadT = 0; else return; }
    if (w.mag <= 0) {
      if (cfg.infAmmo && w.res !== Infinity) w.res = Math.max(w.res, def.mag);
      if (w.res > 0) startReload();
      else if (P.cur === 'primary') swapWeapon(true);
      else if (P.dryT <= 0) { if (mode === 'run') SFX.dry(); P.dryT = 0.3; IN.buzz(8); }
      return;
    }
    w.mag--;
    if (cfg.infAmmo && w.res !== Infinity) w.res = Math.max(w.res, def.mag);
    P.fireCd = 1 / def.rof;
    P.idleFire = 0;
    const moving = Math.hypot(P.vx, P.vy) > 60;
    const spread = def.spread * (moving ? 1.3 : 1) + P.bloom;
    P.bloom = Math.min(def.bloomMax, P.bloom + def.bloom);
    const ca = Math.cos(P.aim), sa = Math.sin(P.aim);
    const mx = P.x + ca * (P.r + def.len), my = P.y + sa * (P.r + def.len);
    const hitAny = { v: false, per: new Map() };
    for (let k = 0; k < def.pellets; k++) {
      const a = P.aim + (def.pellets > 1 ? (k / (def.pellets - 1) - 0.5) * 2 * def.spread * 0.85 + rand(-0.035, 0.035) : rand(-spread, spread));
      shootRay(mx, my, a, def, hitAny);
    }
    // a shotgun blast that lands several pellets staggers the target
    for (const [z, n] of hitAny.per) if (n >= 3 && z.hp > 0 && z.state === Z_ATTACK) { z.state = Z_CHASE; z.atkCd = 0.5; }
    stats.shots++;
    if (hitAny.v) stats.hits++;
    if (mode === 'run') { SFX.shot(def.sfx); if (def.pump) { SFX.pump(); P.pumpT = 0.55; } }
    makeNoise(P.x, P.y, def.noise);
    shake(def.shake);
    if (!reducedMotion.matches) { cam.kx -= ca * def.kick; cam.ky -= sa * def.kick; }
    flashes.push({ x: mx, y: my, a: P.aim, t: 0.06, s: def.flash });
    smoke(mx, my, def.pellets > 1 ? 3 : 1, def.pellets > 1 ? 9 : 5);
    if (!def.pump) {
      const ea = P.aim + Math.PI / 2 + rand(-0.3, 0.3);
      addPart({ t: 'casing', x: P.x + ca * 8, y: P.y + sa * 8, vx: Math.cos(ea) * rand(80, 140), vy: Math.sin(ea) * rand(80, 140), life: rand(0.25, 0.4), max: 0.4, s: 1, a: Math.random() * TAU, va: rand(-20, 20) });
    }
    P.firingT = 0.12;
    if (w.mag === 0 && (w.res > 0 || cfg.infAmmo)) P.autoReloadT = 0.14;
  }

  function shootRay(x, y, ang, def, hitAny) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const fromBody = castRay(P.x, P.y, dx, dy, def.range + P.r + def.len, OPAQUE) - (P.r + def.len);
    const maxT = Math.max(0, Math.min(def.range, fromBody));
    const hits = [];
    for (const z of Z) {
      const ox = z.x - x, oy = z.y - y;
      const t = ox * dx + oy * dy;
      if (t < -z.r || t > maxT + z.r) continue;
      const px = ox - dx * t, py = oy - dy * t;
      const rr = z.r + 2, p2 = px * px + py * py;
      if (p2 > rr * rr) continue;
      hits.push({ z, t: Math.max(0, t - Math.sqrt(rr * rr - p2)) });
    }
    hits.sort((a, b) => a.t - b.t);
    let pen = def.pen + 1, endT = maxT, k = 0, stopped = false;
    for (const h of hits) {
      if (h.t > maxT) break;
      let dmg = def.dmg * (k > 0 ? def.penDmg || 1 : 1);
      if (def.falloff) dmg *= h.t <= def.falloff[0] ? 1 : clamp(1 - 0.5 * (h.t - def.falloff[0]) / (def.falloff[1] - def.falloff[0]), 0.5, 1);
      damageZ(h.z, dmg, ang, def.knock, x + dx * h.t, y + dy * h.t);
      hitAny.v = true; hitAny.per.set(h.z, (hitAny.per.get(h.z) || 0) + 1);
      k++;
      if (--pen <= 0) { endT = h.t; stopped = true; break; }
    }
    if (!stopped && fromBody < def.range) sparks(x + dx * endT, y + dy * endT, ang, 3);
    tracers.push({ x1: x, y1: y, x2: x + dx * endT, y2: y + dy * endT, t: 0.07, max: 0.07, w: def.pellets > 1 ? 1.2 : 1.8 });
  }

  function damageZ(z, dmg, ang, knock, hx, hy) {
    if (z.hp <= 0) return;
    z.hp -= dmg;
    z.flash = 0.06; z.flinch = Math.max(z.flinch, 0.15);
    z.kx += Math.cos(ang) * knock; z.ky += Math.sin(ang) * knock;
    const kl = Math.hypot(z.kx, z.ky); if (kl > 600) { z.kx *= 600 / kl; z.ky *= 600 / kl; }
    bloodSpray(hx, hy, ang, dmg > 25 ? 5 : 3, 1);
    if (z.state === Z_IDLE || z.state === Z_ALERT) { z.state = Z_CHASE; voice(z, 'alert'); }
    if (z.hp <= 0) killZ(z, ang);
    else if (mode === 'run') SFX.hit(clamp((z.x - P.x) / 500, -1, 1), false, 0.8);
  }

  function killZ(z, ang) {
    z.hp = 0;
    stats.kills++;
    const d = Math.hypot(z.x - P.x, z.y - P.y);
    if (d < 120) bump(0.03);
    dying.push({ z, t: 0.32, ang: ang + rand(-0.4, 0.4), vx: z.kx * 0.6 + Math.cos(ang) * 90, vy: z.ky * 0.6 + Math.sin(ang) * 90 });
    bloodSpray(z.x, z.y, ang, 8, 1.3);
    bloodDecal(z.x + Math.cos(ang) * 10, z.y + Math.sin(ang) * 10, 1.2);
    if (mode === 'run') SFX.hit(clamp((z.x - P.x) / 500, -1, 1), true, 1);
    if (P.assist === z) P.assist = null;
  }

  function startReload() {
    const w = curW(), def = WEAP[w.kind];
    if (P.reloadT > 0 || w.mag >= def.mag || (w.res <= 0 && !cfg.infAmmo)) return;
    P.reloadT = def.perShell || def.reload; P.reloadTotal = P.reloadT;
    if (mode === 'run') SFX.reload(w.kind, def.perShell ? 'shell' : 'out');
  }
  function finishReloadStep() {
    const w = curW(), def = WEAP[w.kind];
    if (def.perShell) {
      if (w.res > 0 || cfg.infAmmo) { w.mag++; if (w.res !== Infinity && !cfg.infAmmo) w.res--; }
      if (w.mag < def.mag && (w.res > 0 || cfg.infAmmo)) { P.reloadT = def.perShell; P.reloadTotal = def.perShell; if (mode === 'run') SFX.reload(w.kind, 'shell'); }
      else if (mode === 'run') SFX.pump();
    } else {
      const need = def.mag - w.mag;
      const take = w.res === Infinity || cfg.infAmmo ? need : Math.min(need, w.res);
      w.mag += take; if (w.res !== Infinity && !cfg.infAmmo) w.res -= take;
      if (mode === 'run') SFX.reload(w.kind, 'in');
    }
  }
  function swapWeapon(auto) {
    if (!P.primary) return;
    P.cur = P.cur === 'primary' ? 'pistol' : 'primary';
    P.reloadT = 0; P.swapT = 0.32; P.bloom = 0;
    if (mode === 'run') SFX.swap();
    if (auto) banner('Out of ammo: pistol', 'info', 1.6);
  }

  // Shove: aim (or flick / move) direction, nudged up to 45° toward the nearest zombie in reach.
  function shove(req) {
    if (P.shoveCd > 0) { shoveBlocked = 0.25; return; }
    const sinceLast = gameTime - P.lastShove;
    P.chain = sinceLast < 1.2 ? P.chain + 1 : 1;
    P.lastShove = gameTime;
    P.shoveCd = P.chain >= 6 ? 1.6 : P.chain >= 4 ? 1.0 : 0.35;
    P.shoveT = 0.22;
    stats.shoves++;
    // while the light is held (or was a moment ago) shove where it points, even when backing off
    let dir = req && req.dir != null ? req.dir : ((IN.aim.active || P.aimHold > 0) ? P.aim : (Math.hypot(P.vx, P.vy) > 40 ? Math.atan2(P.vy, P.vx) : P.aim));
    if (req && req.kind === 'mouse' && IN.mouse.inside) { const w = screenToWorld(IN.mouse.x, IN.mouse.y); dir = Math.atan2(w.y - P.y, w.x - P.x); }
    const near = [];
    for (const z of Z) {
      if (z.hp <= 0) continue;
      const d = Math.hypot(z.x - P.x, z.y - P.y);
      if (d < P.r + z.r + SHOVE_REACH) near.push({ z, a: Math.atan2(z.y - P.y, z.x - P.x), d });
    }
    near.sort((a, b) => a.d - b.d);
    if (near.length) dir += clamp(angDiff(near[0].a, dir), -45 * DEG, 45 * DEG);
    P.shoveDir = dir;
    let n = 0;
    for (const m of near) {
      if (n >= 5) break;
      const touching = m.d < P.r + m.z.r + 6;
      if (Math.abs(angDiff(m.a, dir)) > 60 * DEG && !touching) continue;
      const z = m.z;
      const kx = Math.cos(m.a) * 0.6 + Math.cos(dir) * 0.4, ky = Math.sin(m.a) * 0.6 + Math.sin(dir) * 0.4, kl = Math.hypot(kx, ky) || 1;
      z.kx = (kx / kl) * 560; z.ky = (ky / kl) * 560; z.sp = 0;
      z.state = Z_STUMBLE; z.stun = 1.0; z.atkT = 0; z.flash = 0.05;
      n++;
    }
    if (mode === 'run') { SFX.shove(0); if (n) SFX.shoveImpact(n, 0); }
    if (n) hitStop = Math.min(0.07, 0.03 + 0.01 * (n - 1));
    shake(n ? 0.13 : 0.04);
    IN.buzz(n ? 12 : 6);
    flashes.push({ shove: true, x: P.x, y: P.y, a: dir, t: 0.16 });
  }

  function hurtPlayer(dmg, src) {
    if (P.dead || P.safe || P.invT > 0) return;
    const wasLow = P.hp + P.temp < 40;
    if (!cfg.god) {
      const fromTemp = Math.min(P.temp, dmg);
      P.temp -= fromTemp; P.hp -= dmg - fromTemp;
    }
    stats.dmg += dmg;
    P.slowT = 0.4; P.hurtT = 0.45;
    D.lastHurt = gameTime;
    dmgInd.push({ a: Math.atan2(src.y - P.y, src.x - P.x), t: 0.7 });
    shake(0.25);
    IN.buzz(25);
    bump(dmg * 0.01 + (wasLow ? 0.1 : 0));
    if (mode === 'run') SFX.hurt();
    bloodSpray(P.x, P.y, Math.atan2(P.y - src.y, P.x - src.x), 3, 0.8);
    if (P.hp <= 0) {
      if (P.secondWind && mode === 'run') {
        P.secondWind = false; P.hp = 1; P.temp = 0; P.invT = 1.5; P.wounded = true;
        bump(0.2);
        // a free shove all the way round
        for (const z of Z) {
          const d = Math.hypot(z.x - P.x, z.y - P.y);
          if (d > P.r + z.r + SHOVE_REACH + 10) continue;
          const a = Math.atan2(z.y - P.y, z.x - P.x);
          z.kx = Math.cos(a) * 600; z.ky = Math.sin(a) * 600; z.sp = 0; z.state = Z_STUMBLE; z.stun = 1.2; z.atkT = 0;
        }
        flashes.push({ shove: true, ring: true, x: P.x, y: P.y, a: 0, t: 0.3 });
        shake(0.6);
        IN.buzz(60, true);
        if (mode === 'run') { SFX.shoveImpact(5, 0); SFX.heartbeat(1); }
        banner('SECOND WIND — get out of there', 'danger', 2.6);
      } else { P.hp = 0; die(); }
    }
  }
  function die() {
    if (P.dead) return;
    P.dead = true;
    if (mode === 'attract') { newRun((Math.random() * 1e9) >>> 0, 'attract'); return; }
    state = 'dead'; endT = 0; D.cresc = false;
    IN.enabled = false; // nothing pressed during the slow-mo carries into the next run
    SFX.stopAll(); SFX.sting(false);
    bloodDecal(P.x, P.y, 2, 0.9);
  }

  function useMedkit() {
    if (P.healT > 0) { P.healT = 0; banner('Healing cancelled', 'info', 1); return; }
    if (P.med <= 0) { banner('No medkit', 'info', 1); return; }
    if (P.hp >= 100) { banner('Already at full health', 'info', 1.2); return; }
    P.healT = 3; P.reloadT = 0;
    if (mode === 'run') SFX.rip();
    banner('Healing… stand still', 'info', 1.4);
  }
  function usePills() {
    if (P.pills <= 0) { banner('No pills', 'info', 1); return; }
    if (P.hp + P.temp >= 100) { banner('Already at full health', 'info', 1.2); return; }
    P.pills = 0; P.temp = Math.min(100 - P.hp, P.temp + 50);
    if (mode === 'run') SFX.heal();
    banner('+50 temporary health', 'go', 1.4);
  }
  function throwBomb() {
    if (P.bombs <= 0) { banner('No noise bomb', 'info', 1); return; }
    P.bombs--;
    let tx, ty;
    if (IN.aim.source === 'mouse' && IN.mouse.inside) { const w = screenToWorld(IN.mouse.x, IN.mouse.y); tx = w.x; ty = w.y; }
    else { tx = P.x + Math.cos(P.aim) * 300; ty = P.y + Math.sin(P.aim) * 300; }
    const L = Math.hypot(tx - P.x, ty - P.y) || 1;
    const dx = (tx - P.x) / L, dy = (ty - P.y) / L;
    let d = Math.min(L, 350);
    const wall = castRay(P.x, P.y, dx, dy, d, OPAQUE);
    d = Math.max(0, Math.min(d, wall - 14)); // blocked point-blank: it drops at your feet, not inside the wall
    bombs.push({ x0: P.x, y0: P.y, x: P.x, y: P.y, x1: P.x + dx * d, y1: P.y + dy * d, t: 0, fly: 0.6, life: 6, beepT: 0, landed: false, h: 0, blink: 0 });
    if (mode === 'run') SFX.throwWhoosh();
  }

  // ================================================================ interaction & pickups
  let useTarget = null, useNear = false; // useNear: within 48 u of a use target's reach (the camera starts making room for the pill)
  function updateItems() {
    useTarget = null; useNear = false;
    let bestD = 1e9;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const d = Math.hypot(it.x - P.x, it.y - P.y);
      const touch = d < P.r + 24;
      if (it.t === 'ammo') {
        if (touch && P.primary && P.primary.res < WEAP[P.primary.kind].maxRes) { P.primary.res = WEAP[P.primary.kind].maxRes; banner('Ammo refilled', 'info', 1.2); if (mode === 'run') SFX.pickup(); }
      } else if (it.t === 'medkit') {
        if (touch && P.med < 1) { P.med = 1; items.splice(i, 1); banner('Medkit', 'info', 1.2); if (mode === 'run') SFX.pickup(); }
      } else if (it.t === 'pills') {
        if (touch && P.pills < 1) { P.pills = 1; items.splice(i, 1); banner('Pills', 'info', 1.2); if (mode === 'run') SFX.pickup(); }
      } else if (it.t === 'bomb') {
        if (touch && P.bombs < 1) { P.bombs = 1; items.splice(i, 1); banner('Noise bomb: throw it to pull the horde away', 'info', 2); if (mode === 'run') SFX.pickup(); }
      } else if (it.t === 'weapon') {
        if (!P.primary && touch) { useTarget = it; doUse(); return; }
        if (d < 64 + 48) useNear = true;
        if (d < 64 && d < bestD) { bestD = d; useTarget = it; }
      } else if (it.t === 'switch' && !it.used) {
        if (d < 90 + 48) useNear = true;
        if (d < 90 && d < bestD) { bestD = d; useTarget = it; }
      }
    }
  }
  function doUse() {
    const it = useTarget;
    if (!it) return;
    if (it.t === 'weapon') {
      const def = WEAP[it.w];
      const old = P.primary;
      P.primary = { kind: it.w, mag: it.mag == null ? def.mag : it.mag, res: it.res == null ? def.startRes : it.res };
      P.cur = 'primary'; P.reloadT = 0; P.swapT = 0.3;
      items.splice(items.indexOf(it), 1);
      if (old) items.push({ t: 'weapon', w: old.kind, x: P.x + rand(-6, 6), y: P.y + rand(-6, 6), mag: old.mag, res: old.res });
      banner('Took the ' + def.name.toLowerCase(), 'info', 1.2);
      if (mode === 'run') SFX.swap();
      useTarget = null;
    } else if (it.t === 'switch') {
      it.used = true; useTarget = null;
      startCrescendo();
    }
  }
  const SIREN_S = 4.5; // seconds of alarm wail after the switch is pulled
  function startCrescendo() {
    M.gate.state = 'opening'; M.gate.t = 0;
    D.cresc = true; D.waveT = 2.5; D.waveN = 0; D.phase = 'peak'; D.pending = null;
    makeNoise(P.x, P.y, 2000);
    if (mode === 'run') {
      SFX.clunk(); SFX.siren(true); SFX.motor(true); SFX.setDrums(true); // the siren stops at gate time SIREN_S (updateGate)
    }
    banner('ALARM! Hold out while the gate opens', 'danger', 3);
    bump(0.5);
  }
  function updateGate(dt) {
    const g = M.gate;
    if (g.state !== 'opening') return;
    g.t += dt;
    if (mode === 'run' && g.t >= SIREN_S && g.t - dt < SIREN_S) SFX.siren(false);
    if (g.t >= g.dur) {
      g.state = 'open';
      for (let y = g.y0; y <= g.y1; y++) { const i = y * M.W + g.x; M.flags[i] &= NOSPAWN | YARD; M.kind[i] = K.NONE; }
      fieldPTile = -1;
      if (mode === 'run') { SFX.motor(false); SFX.siren(false); }
      banner('The gate is open — RUN!', 'go', 3);
      // one last mob, from behind
      releaseMob(planMob(Math.round(10 * cfg.horde), 10, 24, 1), gameTime + 1);
    }
  }

  // ================================================================ update
  function update(dt) {
    if (hitStop > 0) { hitStop -= dt; updateCamera(dt); return; }
    gameTime += dt;
    if (mode === 'run' && state === 'play') { runTime += dt; stats.time = runTime; }
    const alive = !P.dead && !P.safe;
    noiseMax = Math.max(0, noiseMax);

    // --- input
    let mvx = 0, mvy = 0, aimActive = false, aimAng = P.aim, firing = false;
    if (mode === 'attract') {
      const b = bot(dt); mvx = b.mx; mvy = b.my; aimActive = b.aim; aimAng = b.ang; firing = b.fire; if (b.shove) shove(null);
    } else if (alive) {
      // IN.update() runs once per frame in frame(), so substeps share one reading
      mvx = IN.move.x; mvy = IN.move.y;
      if (IN.aim.active) {
        aimActive = true;
        if (IN.aim.worldTarget) { const w = screenToWorld(IN.mouse.x, IN.mouse.y); aimAng = Math.atan2(w.y - P.y, w.x - P.x); P.assist = null; }
        else aimAng = assistAim(IN.aim.ang, IN.aim.angVel, dt);
      } else P.assist = null;
      firing = IN.aim.firing || (IN.aim.wantsFire && !!P.assist);
      let sreq;
      while ((sreq = IN.takeShove())) shove(sreq);
      if (IN.consume('reload')) startReload();
      if (IN.consume('swap')) swapWeapon(false);
      if (IN.consume('use')) doUse();
      if (IN.consume('med')) useMedkit();
      if (IN.consume('pills')) usePills();
      if (IN.consume('bomb')) throwBomb();
      if (IN.consume('pause')) { pause(); return; }
      if (useHeld && useTarget && useTarget.t === 'switch') {
        useHoldT += dt; if (useHoldT >= 0.6) { doUse(); useHeld = false; useHoldT = 0; }
      } else useHoldT = 0;
    }
    // penalties (slowdown, bloom, the firing look) only while the gun can actually go off
    const wNow = curW();
    const canShoot = P.swapT <= 0 && wNow.mag > 0 && (P.reloadT <= 0 || !!WEAP[wNow.kind].perShell);
    const shooting = firing && canShoot;
    P.firingNow = shooting;
    const trigger = firing && !P.wasFiring; P.wasFiring = firing;

    // --- facing: capped turn rate toward the aim; after a hold, turn toward where you walk
    const moving = Math.hypot(mvx, mvy) > 0.05;
    if (moving) P.moveAng = Math.atan2(mvy, mvx);
    const turnCap = (cfg.aimTurn >= 3600 ? 1e4 : cfg.aimTurn) * DEG;
    if (aimActive) {
      // the first shot of a trigger pull goes where the thumb points; sweeps keep the turn cap
      if (trigger) P.aim = aimAng;
      else P.aim += clamp(angDiff(aimAng, P.aim), -turnCap * dt, turnCap * dt);
      P.aimHold = cfg.lookHold / 1000;
    } else if (P.aimHold > 0) P.aimHold -= dt;
    else if (moving) P.aim += clamp(angDiff(P.moveAng, P.aim), -540 * DEG * dt, 540 * DEG * dt);

    // --- movement
    if (alive) {
      let sp = cfg.speed;
      const mag = Math.min(1, Math.hypot(mvx, mvy));
      P.sneaking = mag > 0 && mag < 0.5;
      if (P.hp + P.temp < 40) sp *= 0.84;
      if (P.wounded) sp *= 0.6;
      if (P.slowT > 0) sp *= 0.7;
      if (P.healT > 0) sp *= 0.3;
      if (shooting) sp *= 0.85;
      if (moving && (aimActive || P.aimHold > 0) && Math.abs(angDiff(P.moveAng, P.aim)) > 120 * DEG) sp *= 0.8;
      const tvx = mvx * sp, tvy = mvy * sp;
      const cur = Math.hypot(P.vx, P.vy), tgt = Math.hypot(tvx, tvy);
      const rate = tgt >= cur ? cfg.speed / Math.max(0.001, cfg.accelMs / 1000) : cfg.speed / 0.06;
      let dvx = tvx - P.vx, dvy = tvy - P.vy;
      const dl = Math.hypot(dvx, dvy), mx = rate * dt;
      if (dl > mx) { dvx *= mx / dl; dvy *= mx / dl; }
      P.vx += dvx; P.vy += dvy;
      if (P.healT > 0 && mag > 0.35) { P.healT = 0; banner('Healing interrupted', 'info', 1); }
    } else { P.vx *= 0.8; P.vy *= 0.8; }
    P.x += P.vx * dt; P.y += P.vy * dt;
    P.walkPhase += Math.hypot(P.vx, P.vy) * dt * 0.06;

    // --- timers
    P.fireCd -= dt; P.swapT -= dt; P.dryT -= dt; P.shoveCd -= dt; P.shoveT -= dt; P.slowT -= dt; P.hurtT -= dt; P.firingT -= dt; P.pumpT -= dt; P.invT -= dt;
    shoveBlocked = Math.max(0, shoveBlocked - dt);
    if (gameTime - P.lastShove > 2) P.chain = 0;
    if (P.temp > 0) P.temp = Math.max(0, P.temp - 0.27 * dt);
    if (P.wounded && P.hp > 40) P.wounded = false;
    if (!shooting) { P.bloom = Math.max(0, P.bloom - dt * 0.25); P.idleFire += dt; }
    if (P.autoReloadT > 0) { P.autoReloadT -= dt; if (P.autoReloadT <= 0) startReload(); }
    if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { P.reloadT = 0; finishReloadStep(); } }
    if (cfg.topUp && P.idleFire > 2 && P.reloadT <= 0 && P.healT <= 0) {
      const w = curW(), def = WEAP[w.kind];
      if (w.mag < def.mag * 0.6 && (w.res > 0 || cfg.infAmmo)) startReload();
    }
    if (P.healT > 0) {
      if (firing) { P.healT = 0; banner('Healing cancelled', 'info', 1); }
      else {
        P.healT -= dt;
        if (P.healT <= 0) {
          const gain = Math.round((100 - P.hp) * 0.8);
          P.hp = Math.min(100, P.hp + gain); P.temp = Math.min(P.temp, 100 - P.hp); P.med = 0; stats.healed += gain; P.healT = 0;
          if (mode === 'run') SFX.heal();
          banner('+' + gain + ' health', 'go', 1.4);
        }
      }
    }
    if (alive && firing && P.healT <= 0 && P.shoveT <= 0) tryFire();
    if (alive) updateItems();

    // --- flow field toward the survivor
    const pt = Math.floor(P.y / T) * M.W + Math.floor(P.x / T);
    fieldPT -= dt;
    if (pt !== fieldPTile && fieldPT <= 0) refreshFieldP();

    // --- is the survivor standing in light (or firing)?
    playerLit = P.firingT > 0;
    if (!playerLit) for (const L of M.lights) if (!L.inside && !L.insideEnd && lightLevel(L) > 0.5 && Math.hypot(L.x - P.x, L.y - P.y) < L.r * 0.7) { playerLit = true; break; }

    updateBombs(dt);
    updateZombies(dt);

    // --- spawn queue
    for (let i = spawnQ.length - 1; i >= 0; i--) {
      const s = spawnQ[i];
      if (gameTime < s.at) continue;
      spawnQ.splice(i, 1);
      if (Z.length >= maxZ() && !evictSleeper()) continue;
      if (s.st === Z_CHASE && onScreen(s.x, s.y, 40) && los(P.x, P.y, s.x, s.y, OPAQUE)) {
        // the spot came into view: move this anchor's whole group somewhere hidden
        const alt = hiddenSpawnTiles(10, 30, 1, null)[0];
        if (!alt) continue;
        const ax = s.ax, ay = s.ay;
        for (const q of spawnQ) if (q.ax === ax && q.ay === ay) { q.x += alt.x - ax; q.y += alt.y - ay; q.ax = alt.x; q.ay = alt.y; }
        s.x += alt.x - ax; s.y += alt.y - ay; s.ax = alt.x; s.ay = alt.y;
      }
      let x = s.x, y = s.y;
      if (fAt(Math.floor(x / T), Math.floor(y / T)) & (BLOCK_Z | FENCE)) { x = s.ax; y = s.ay; }
      const z = addZombie(x, y, s.st);
      z.hd = Math.atan2(P.y - y, P.x - x); z.face = z.hd;
      if (Math.random() < 0.12) voice(z, 'alert');
    }

    director(dt);
    updateGate(dt);
    if (alive && P.x > M.endWin.x0 && P.x < M.endWin.x1 && P.y > M.endWin.y0 && P.y < M.endWin.y1) reachSafety();

    // --- particles & effects
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      const fr = p.t === 'smoke' ? 2 : p.t === 'casing' ? 6 : 5;
      p.vx *= Math.exp(-fr * dt); p.vy *= Math.exp(-fr * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t === 'casing') p.a += p.va * dt;
      if (p.life <= 0) {
        if (p.t === 'blood' && Math.random() < 0.5) bloodDecal(p.x, p.y, 0.25 + p.s * 0.08, 0.55);
        if (p.t === 'casing') casingDecal(p.x, p.y, p.a);
        parts.splice(i, 1);
      }
    }
    for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t -= dt; if (tracers[i].t <= 0) tracers.splice(i, 1); }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t -= dt; if (flashes[i].t <= 0) flashes.splice(i, 1); }
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i];
      d.t -= dt;
      d.z.x += d.vx * dt; d.z.y += d.vy * dt; d.vx *= Math.exp(-7 * dt); d.vy *= Math.exp(-7 * dt);
      collideTiles(d.z, BLOCK_Z);
      if (d.t <= 0) { corpseDecal(d.z, d.ang); dying.splice(i, 1); }
    }
    for (let i = dmgInd.length - 1; i >= 0; i--) { dmgInd[i].t -= dt; if (dmgInd[i].t <= 0) dmgInd.splice(i, 1); }

    if (mode === 'run' && P.hp < 30 && !P.dead && !P.safe) {
      P.hbT -= dt;
      if (P.hbT <= 0) { P.hbT = 0.55 + P.hp / 60; SFX.heartbeat(1 - P.hp / 40); }
    }
    updateCamera(dt);
    tickTips();
  }

  function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.t += dt;
      if (!b.landed) {
        const u = Math.min(1, b.t / b.fly);
        b.x = lerp(b.x0, b.x1, u); b.y = lerp(b.y0, b.y1, u); b.h = Math.sin(u * Math.PI) * 40;
        if (u >= 1) {
          b.landed = true; b.h = 0;
          lure = b; flowField(fieldL, Math.floor(b.x / T), Math.floor(b.y / T));
          for (const z of Z) {
            const d = Math.hypot(z.x - b.x, z.y - b.y);
            if (d < 700) { if (z.state === Z_IDLE) alertZ(z, d / 1500); z.lured = true; }
          }
        }
      } else {
        b.life -= dt; b.beepT -= dt; b.blink -= dt;
        if (b.beepT <= 0) { b.beepT = b.life > 2 ? 0.45 : 0.15; b.blink = 0.06; if (mode === 'run') SFX.beep(b.life < 2); }
        // new arrivals (waves) get pulled in too
        for (const z of Z) if (!z.lured && z.state !== Z_IDLE && Math.abs(z.x - b.x) < 700 && Math.abs(z.y - b.y) < 700) z.lured = true;
        if (b.life <= 0) { explode(b); bombs.splice(i, 1); if (lure === b) { lure = null; for (const z of Z) z.lured = false; } }
      }
    }
  }

  function explode(b) {
    if (mode === 'run') SFX.boom(clamp(1.2 - Math.hypot(b.x - P.x, b.y - P.y) / 1200, 0.2, 1));
    shake(clamp(0.9 - Math.hypot(b.x - P.x, b.y - P.y) / 900, 0.15, 0.8));
    flashes.push({ boom: true, x: b.x, y: b.y, t: 0.35, max: 0.35 });
    smoke(b.x, b.y, 14, 22);
    sparks(b.x, b.y, 0, 18);
    scorchDecal(b.x, b.y);
    makeNoise(b.x, b.y, 900);
    for (const z of Z) {
      const d = Math.hypot(z.x - b.x, z.y - b.y);
      if (d > 220 || !los(b.x, b.y, z.x, z.y, OPAQUE)) continue;
      const a = Math.atan2(z.y - b.y, z.x - b.x);
      if (d <= 140) damageZ(z, 300, a, 500, z.x, z.y);
      else { z.state = Z_STUMBLE; z.stun = 1.2; z.kx = Math.cos(a) * 400; z.ky = Math.sin(a) * 400; z.sp = 0; }
    }
    const pd = Math.hypot(P.x - b.x, P.y - b.y);
    if (pd < 150 && los(b.x, b.y, P.x, P.y, OPAQUE)) hurtPlayer(Math.round(25 * (1 - pd / 150)) + 5, b);
  }

  function reachSafety() {
    P.safe = true;
    state = 'won'; endT = 0; D.cresc = false;
    IN.enabled = false;
    const d = M.endDoor, i = d.y * M.W + d.x;
    M.flags[i] |= BLOCK_P | BLOCK_Z | OPAQUE; M.kind[i] = K.DOOR;
    fieldPTile = -1;
    if (mode === 'run') { SFX.door(); SFX.stopAll(); const run = runId; setTimeout(() => { if (run === runId) SFX.sting(true); }, 500); }
    banner('Safe.', 'go', 2.5);
  }

  // Aim assist: lit, visible targets inside a narrow cone; the pull is capped and sticky.
  function assistAim(raw, angVel, dt) {
    const pull = cfg.assist > 0;
    // with the pull off, Auto fire still needs a target, so the search runs but the aim stays raw
    if (angVel > 400 * DEG || (!pull && cfg.fireMode !== 'auto')) { P.assist = null; return raw; }
    const cone = cfg.assistCone * DEG, range = WEAP[curW().kind].range;
    const cur = P.assist;
    if (cur) {
      P.assistT += dt;
      const d = Math.hypot(cur.x - P.x, cur.y - P.y);
      const err = Math.abs(angDiff(Math.atan2(cur.y - P.y, cur.x - P.x), raw));
      if (cur.hp <= 0 || cur.vis < 0.5 || !cur.lit || d > range || err > 18 * DEG) P.assist = null;
    }
    if (!P.assist || P.assistT > 0.25) {
      let best = null, bestScore = 1e9;
      for (const z of Z) {
        if (z.hp <= 0 || z.vis < 0.5 || !z.lit) continue;
        const dx = z.x - P.x, dy = z.y - P.y, d = Math.hypot(dx, dy);
        if (d > range || d < 1) continue;
        const err = Math.abs(angDiff(Math.atan2(dy, dx), raw));
        if (err > cone + Math.atan(z.r / d)) continue;
        let score = 0.6 * (err / cone) + 0.4 * (d / range);
        if (d < 60 || (z.state === Z_CHASE && (z.vx * -dx + z.vy * -dy) > 0)) score -= 0.3;
        if (z === P.assist) score -= 0.15;
        if (score < bestScore) { bestScore = score; best = z; }
      }
      if (best !== P.assist) P.assistT = 0;
      P.assist = best;
    }
    if (!P.assist || !pull) return raw;
    const ta = Math.atan2(P.assist.y - P.y, P.assist.x - P.x);
    const max = cfg.assistMax * DEG;
    return raw + clamp(angDiff(ta, raw) * cfg.assist, -max, max);
  }

  // ---- zombies
  const SH = { cell: 64, w: 0, h: 0, head: null, next: null };
  function updateZombies(dt) {
    SH.w = Math.ceil((M.W * T) / SH.cell); SH.h = Math.ceil((M.H * T) / SH.cell);
    if (!SH.head || SH.head.length !== SH.w * SH.h) SH.head = new Int32Array(SH.w * SH.h);
    if (!SH.next || SH.next.length < Z.length) SH.next = new Int32Array(Math.max(256, Z.length * 2));
    const alive = !P.dead && !P.safe;
    let attackers = 0;
    for (const z of Z) if (z.state === Z_ATTACK) attackers++;
    const running = Math.hypot(P.vx, P.vy) > 120 && !P.sneaking;

    for (let i = Z.length - 1; i >= 0; i--) {
      const z = Z[i];
      if (z.hp <= 0) { Z.splice(i, 1); continue; }
      const dx = P.x - z.x, dy = P.y - z.y, d = Math.hypot(dx, dy);
      if (z.state === Z_IDLE && d > 1500) {
        if (mode === 'run' && z.x < P.x - 1600 && z.vis <= 0) { Z.splice(i, 1); continue; }
        z.phase += dt; continue;
      }
      z.flash -= dt; z.flinch -= dt; z.atkCd -= dt; z.groanT -= dt;
      z.phase += dt * (z.state === Z_CHASE ? 9 : 2.5);
      let want = z.hd, wantSp = 0, turn = Z_TURN;
      switch (z.state) {
        case Z_IDLE: {
          z.think -= dt;
          if (z.think <= 0 && alive) {
            z.think = 0.22 + Math.random() * 0.12;
            let sight = z.lit || playerLit ? 340 : 160;
            if (Math.abs(angDiff(Math.atan2(dy, dx), z.face)) > Math.PI / 2) sight *= 0.5;
            if (d < 50 || (running && d < 120) || (d < sight && los(z.x, z.y, P.x, P.y, OPAQUE))) alertZ(z, 0);
          }
          if (z.wander) {
            z.wanderT -= dt;
            if (z.wanderT <= 0) { z.wanderT = rand(2, 5); z.wanderA += rand(-1.5, 1.5); }
            want = z.wanderA; wantSp = 24; turn = 2;
            z.face += clamp(angDiff(z.wanderA, z.face), -2 * dt, 2 * dt);
          } else z.face += Math.sin(z.phase * 0.5 + z.sway) * 0.25 * dt;
          if (z.groanT <= 0) { z.groanT = rand(7, 16); if (d < 700) voice(z, 'idle'); }
          break;
        }
        case Z_ALERT: {
          z.alertT -= dt;
          z.face += clamp(angDiff(Math.atan2(dy, dx), z.face), -8 * dt, 8 * dt);
          if (z.alertT <= 0) {
            z.state = Z_CHASE; z.hd = z.face;
            voice(z, 'alert');
            for (const o of Z) if (o.state === Z_IDLE && Math.abs(o.x - z.x) < 200 && Math.abs(o.y - z.y) < 200) alertZ(o, rand(0.05, 0.3));
          }
          break;
        }
        case Z_CHASE:
        case Z_ATTACK: {
          const useLure = z.lured && lure && lure.landed;
          const tx = useLure ? lure.x : P.x, ty = useLure ? lure.y : P.y;
          const tdx = tx - z.x, tdy = ty - z.y, td = Math.hypot(tdx, tdy) || 1;
          z.losT -= dt;
          if (z.losT <= 0) { z.losT = 0.2 + Math.random() * 0.15; z.hasLos = td < 520 && los(z.x, z.y, tx, ty, BLOCK_Z); }
          let mx, my;
          if (z.hasLos && z.flowMode <= 0) { mx = tdx / td; my = tdy / td; }
          else if (flowDir(useLure ? fieldL : fieldP, z.x, z.y, flowTmp)) { mx = flowTmp.x; my = flowTmp.y; }
          else { mx = tdx / td; my = tdy / td; }
          z.flowMode -= dt;
          want = Math.atan2(my, mx);
          wantSp = z.speed;
          if (z.flinch > 0) wantSp *= 0.3;
          if (z.climb > 0) wantSp *= 0.35;
          if (z.state === Z_ATTACK) wantSp *= 0.2;
          if (useLure && td < 46) wantSp = 0;
          if (!alive && !useLure) wantSp *= 0.25;
          // close in: turn fast so they don't orbit you
          if (td < 70) turn = 10;
          z.face += clamp(angDiff(td < 220 ? Math.atan2(tdy, tdx) : z.hd, z.face), -10 * dt, 10 * dt);
          if (wantSp > 50) {
            const moved = Math.hypot(z.x - z.lastX, z.y - z.lastY);
            if (moved < wantSp * dt * 0.15) z.stuckT += dt; else z.stuckT = Math.max(0, z.stuckT - dt);
            if (z.stuckT > 0.5) { z.flowMode = 1.2; z.stuckT = 0; }
          }
          if (z.groanT <= 0) { z.groanT = rand(3, 7); voice(z, Math.random() < 0.3 ? 'alert' : 'idle'); }
          if (!useLure && alive) {
            if (z.state === Z_CHASE && d < z.r + P.r + 14 && z.atkCd <= 0 && attackers < MAX_ATTACKERS) { z.state = Z_ATTACK; z.atkT = 0.4; attackers++; }
            if (z.state === Z_ATTACK) {
              z.atkT -= dt;
              if (z.atkT <= 0) {
                if (d < z.r + P.r + 16) hurtPlayer(3, z);
                else if (mode === 'run') SFX.swing(clamp((z.x - P.x) / 500, -1, 1));
                z.state = Z_CHASE; z.atkCd = 0.9; attackers--;
              }
            }
          } else if (z.state === Z_ATTACK) { z.state = Z_CHASE; attackers--; }
          break;
        }
        case Z_STUMBLE: {
          z.stun -= dt;
          z.face += Math.sin(z.phase * 3) * 3 * dt;
          if (z.stun <= 0) { z.state = Z_CHASE; z.atkCd = 0.3; z.hd = z.face; }
          break;
        }
      }
      // heading turns at a capped rate, speed ramps at Z_ACC; knockback rides on top
      if (wantSp > 1) z.hd += clamp(angDiff(want, z.hd), -turn * dt, turn * dt);
      const dsp = wantSp - z.sp;
      z.sp += clamp(dsp, -Z_ACC * 2 * dt, Z_ACC * dt);
      const kd = Math.exp(-8 * dt);
      z.kx *= kd; z.ky *= kd;
      z.vx = Math.cos(z.hd) * z.sp + z.kx; z.vy = Math.sin(z.hd) * z.sp + z.ky;
      z.lastX = z.x; z.lastY = z.y;
      z.x += z.vx * dt; z.y += z.vy * dt;
    }
    // separation
    SH.head.fill(-1);
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      const c = clamp(Math.floor(z.y / SH.cell), 0, SH.h - 1) * SH.w + clamp(Math.floor(z.x / SH.cell), 0, SH.w - 1);
      SH.next[i] = SH.head[c]; SH.head[c] = i;
    }
    for (let i = 0; i < Z.length; i++) {
      const a = Z[i];
      const cx = Math.floor(a.x / SH.cell), cy = Math.floor(a.y / SH.cell);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox, gy = cy + oy;
        if (gx < 0 || gy < 0 || gx >= SH.w || gy >= SH.h) continue;
        for (let j = SH.head[gy * SH.w + gx]; j !== -1; j = SH.next[j]) {
          if (j <= i) continue;
          const b = Z[j];
          const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r - 1, d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 < 1e-4) continue;
          const d = Math.sqrt(d2), push = (min - d) * 0.4;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        }
      }
    }
    for (const z of Z) {
      const dx = z.x - P.x, dy = z.y - P.y, min = z.r + P.r, d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 1e-4 && !P.safe) {
        const d = Math.sqrt(d2), over = min - d, nx = dx / d, ny = dy / d;
        const zs = z.state === Z_STUMBLE ? 0.95 : 0.78;
        z.x += nx * over * zs; z.y += ny * over * zs;
        P.x -= nx * over * (1 - zs); P.y -= ny * over * (1 - zs);
      }
      const ti = Math.floor(z.y / T) * M.W + Math.floor(z.x / T);
      z.climb = M.flags[ti] & FENCE ? 0.2 : Math.max(0, z.climb - 0.016);
      collideTiles(z, BLOCK_Z);
    }
    collideTiles(P, BLOCK_P);
  }

  function collideTiles(e, mask) {
    for (let pass = 0; pass < 2; pass++) {
      const r = e.r;
      const x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r) / T);
      const y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r) / T);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (!(fAt(tx, ty) & mask)) continue;
        const cx = clamp(e.x, tx * T, tx * T + T), cy = clamp(e.y, ty * T, ty * T + T);
        const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2), push = r - d;
          e.x += (dx / d) * push; e.y += (dy / d) * push;
          const vn = (e.vx * dx + e.vy * dy) / d;
          if (vn < 0) { e.vx -= (vn * dx) / d; e.vy -= (vn * dy) / d; }
          if (e.kx !== undefined) { const kn = (e.kx * dx + e.ky * dy) / d; if (kn < 0) { e.kx -= (kn * dx) / d; e.ky -= (kn * dy) / d; } }
        } else {
          const l = e.x - tx * T, rr = tx * T + T - e.x, u = e.y - ty * T, b = ty * T + T - e.y;
          const m = Math.min(l, rr, u, b);
          if (m === l) e.x = tx * T - r; else if (m === rr) e.x = tx * T + T + r; else if (m === u) e.y = ty * T - r; else e.y = ty * T + T + r;
        }
      }
    }
  }

  // ---- attract-mode bot: a survivor that fights its way east behind the title screen
  const botS = { goalT: 0, chkT: 6, cx: 0, cy: 0 };
  function bot(dt) {
    const out = { mx: 0, my: 0, aim: false, ang: P.aim, fire: false, shove: false };
    let near = null, nd = 1e9, crowd = 0, cx = 0, cy = 0;
    for (const z of Z) {
      if (z.hp <= 0 || z.state === Z_IDLE) continue;
      const d = Math.hypot(z.x - P.x, z.y - P.y);
      if (d < 220) { crowd++; cx += z.x; cy += z.y; }
      if (d < nd && d < 520 && z.vis > 0.5) { nd = d; near = z; }
    }
    botS.goalT -= dt;
    if (!fieldB.goal || botS.goalT <= 0) {
      botS.goalT = 1.5;
      flowField(fieldB, Math.min(WALLX - 2, Math.floor(P.x / T) + 14), streetY(M.jg) + 2, BLOCK_P | BLOCK_Z);
      fieldB.goal = true;
    }
    // stuck somewhere for a while: start a fresh demo run
    botS.chkT -= dt;
    if (botS.chkT <= 0) {
      if (Math.hypot(P.x - botS.cx, P.y - botS.cy) < T * 1.5) { newRun((Math.random() * 1e9) >>> 0, 'attract'); return out; }
      botS.chkT = 6; botS.cx = P.x; botS.cy = P.y;
    }
    let mx = 0, my = 0;
    if (flowDir(fieldB, P.x, P.y, flowTmp, BLOCK_P | BLOCK_Z)) { mx = flowTmp.x; my = flowTmp.y; }
    if (crowd) { const ax = P.x - cx / crowd, ay = P.y - cy / crowd, al = Math.hypot(ax, ay) || 1; mx = mx * 0.5 + (ax / al) * 0.9; my = my * 0.5 + (ay / al) * 0.9; }
    const ml = Math.hypot(mx, my) || 1;
    out.mx = (mx / ml) * 0.9; out.my = (my / ml) * 0.9;
    if (near) { out.aim = true; out.ang = Math.atan2(near.y - P.y, near.x - P.x); out.fire = true; if (nd < 40 && P.shoveCd <= 0) out.shove = true; }
    if (P.primary && P.primary.res < 100) P.primary.res = 400;
    P.hp = Math.max(P.hp, 60);
    if (P.x > (WALLX - 4) * T || gameTime > 150) newRun((Math.random() * 1e9) >>> 0, 'attract');
    if (D.phase === 'start') { D.phase = 'build'; D.mobT = 12; }
    return out;
  }

  // ================================================================ camera & view
  function updateCamera(dt) {
    const viewW = cw / cam.zoom, viewH = ch / cam.zoom;
    const portrait = ch > cw;
    // look-ahead: toward the aim (scaled by how far the thumb is pushed) and toward movement
    const aimOn = P.aimHold > 0 || P.firingT > 0;
    const am = mode === 'attract' ? 0.8 : IN.aim.active ? Math.max(0.5, IN.aim.mag) : aimOn ? 0.6 : 0;
    const spd = Math.hypot(P.vx, P.vy) / cfg.speed;
    let ox = (Math.cos(P.aim) * 120 * am + (spd > 0.05 ? (P.vx / (Math.hypot(P.vx, P.vy) || 1)) * 50 * spd : 0)) * cfg.lookAhead;
    let oy = (Math.sin(P.aim) * 120 * am + (spd > 0.05 ? (P.vy / (Math.hypot(P.vx, P.vy) || 1)) * 50 * spd : 0)) * cfg.lookAhead;
    ox = clamp(ox, -viewW * 0.15, viewW * 0.15); oy = clamp(oy, -viewH * 0.15, viewH * 0.15);
    // thumbs cover the bottom of the screen: sit the survivor a little above centre
    // (portrait only a touch, so the button row above the stick zones stays clear of it)
    const lift = viewH * liftFrac();
    // Near a pickup or the switch the Use pill sits 40 px under the survivor's rest spot: don't look
    // so far north that the survivor drops onto it (the second term covers the lag when walking south).
    const pillCap = mode === 'run' && (useTarget || useNear) ? P.r - 36 / cam.zoom + Math.max(0, P.vy) / 9 : -Infinity;
    oy = Math.max(oy, pillCap);
    // Portrait: looking south lifts the survivor toward the button row above the stick zones. Stop
    // before the row covers the survivor and whatever is within 80 u of them. That costs most of the
    // south look-ahead in portrait, where the view below the survivor is already the deep one.
    const capCam = portrait && rowBottom > 0 ? Math.max(lift, (ch / 2 - rowBottom) / cam.zoom - 80) : Infinity;
    oy = Math.min(oy, capCam - lift);
    const kl = 1 - Math.exp(-3.5 * dt);
    cam.lx += (ox - cam.lx) * kl; cam.ly += (oy - cam.ly) * (cam.ly < pillCap ? 1 - Math.exp(-14 * dt) : kl);
    const tx = P.x + cam.lx, ty = P.y + cam.ly + lift;
    const k = 1 - Math.exp(-9 * dt);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    if (cam.y - P.y > capCam) cam.y = P.y + capCam; // the follow lag when walking north must not lift them under it either
    cam.kx *= Math.exp(-dt * 18); cam.ky *= Math.exp(-dt * 18);
    cam.trauma = Math.max(0, cam.trauma - dt * 1.6);
    const amt = cfg.shake * (reducedMotion.matches ? 0 : 1);
    const s = cam.trauma * cam.trauma * 16 * amt;
    cam.sx = (Math.sin(gameTime * 71.3) + Math.sin(gameTime * 43.7) * 0.6) * s * 0.65;
    cam.sy = (Math.sin(gameTime * 57.1 + 1.3) + Math.sin(gameTime * 31.9) * 0.6) * s * 0.65;
  }
  const liftFrac = () => (ch > cw ? 0.02 : 0.05); // how far above centre the camera rests the survivor
  function baseZoom() {
    // about 440 u on the short side: bodies ~23 px wide on a phone
    let s = Math.sqrt((cw * ch) / 440000);
    s = Math.min(s, Math.min(cw, ch) / 440);
    return Math.max(0.35, s);
  }
  function viewOrigin() {
    const z = cam.zoom;
    return { z, ox: cw / 2 - (cam.x + cam.kx) * z + cam.sx, oy: ch / 2 - (cam.y + cam.ky) * z + cam.sy };
  }
  function screenToWorld(sx, sy) { const v = viewOrigin(); return { x: (sx - v.ox) / v.z, y: (sy - v.oy) / v.z }; }
  function onScreen(x, y, pad) {
    const v = viewOrigin(), sx = x * v.z + v.ox, sy = y * v.z + v.oy;
    return sx > -pad && sy > -pad && sx < cw + pad && sy < ch + pad;
  }

  // ================================================================ rendering
  const canvas = $('#game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const lc = document.createElement('canvas');
  const lctx = lc.getContext('2d');
  let cw = 0, ch = 0, dpr = 1, lscale = 0.5;
  const insets = { t: 0, r: 0, b: 0, l: 0 };
  let autoDpr = 2;
  const perf = { iv: [], work: [], bad: 0, good: 0, ups: 0 };
  const qualityLevel = () => (cfg.quality === 'auto' ? (autoDpr >= 1.75 ? 'high' : 'low') : cfg.quality);

  function readInsets() {
    const cs = getComputedStyle($('#insetProbe'));
    insets.t = parseFloat(cs.paddingTop) || 0; insets.r = parseFloat(cs.paddingRight) || 0;
    insets.b = parseFloat(cs.paddingBottom) || 0; insets.l = parseFloat(cs.paddingLeft) || 0;
  }
  function resize() {
    readInsets();
    cw = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
    ch = Math.max(1, document.documentElement.clientHeight || window.innerHeight);
    const want = cfg.quality === 'low' ? 1 : cfg.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2.5) : Math.min(window.devicePixelRatio || 1, autoDpr);
    dpr = Math.max(1, want);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    lscale = qualityLevel() === 'low' ? 0.35 : 0.5;
    lc.width = Math.ceil(cw * lscale); lc.height = Math.ceil(ch * lscale);
    cam.zoom = baseZoom() * cfg.zoom;
    vis.n = qualityLevel() === 'low' ? 360 : 720;
    vis.cos = new Float32Array(vis.n); vis.sin = new Float32Array(vis.n);
    for (let i = 0; i < vis.n; i++) { vis.cos[i] = Math.cos((i / vis.n) * TAU); vis.sin[i] = Math.sin((i / vis.n) * TAU); }
    IN.layout(cw, ch, insets);
    document.documentElement.classList.toggle('portrait', ch > cw);
    layoutButtons();
    dirty = true;
  }

  // Thumb buttons: an arc above the aim stick's home (landscape) or a row above the stick zones (portrait).
  // returns the centre y it settled on
  function placeEl(el, x, y, w, h) {
    x = clamp(x, insets.l + w / 2 + 6, Math.max(insets.l + w / 2 + 6, cw - insets.r - w / 2 - 6));
    y = clamp(y, insets.t + 64 + h / 2, Math.max(insets.t + 64 + h / 2, ch - insets.b - h / 2 - 6));
    if (el) {
      const tf = `translate(${Math.round(x - w / 2)}px, ${Math.round(y - h / 2)}px)`;
      if (el.style.transform !== tf) el.style.transform = tf;
    }
    return y;
  }
  // The Use pill sits just under where the camera rests the survivor, centred between the thumbs.
  // It stays put: updateCamera keeps the survivor from looking down onto it, so it is a still target.
  const useBox = { label: null, w: 0, h: 0 };
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { useBox.w = 0; }); // the label got wider
  function placeUse() {
    const el = hud.use;
    if (!el || el.hidden || useHeld) return;
    const label = hud.useLabel.textContent;
    if (useBox.label !== label || !useBox.w) {
      if (!el.offsetWidth) return; // the HUD is hidden behind a screen: measure once it shows again
      useBox.label = label; useBox.w = el.offsetWidth; useBox.h = el.offsetHeight;
    }
    const rest = ch / 2 - ch * liftFrac();
    placeEl(el, cw / 2, rest + 40 + useBox.h / 2, useBox.w, useBox.h);
  }
  let rowBottom = 0; // portrait: the bottom edge of the thumb-button row (0 in landscape)
  function layoutButtons() {
    const R = IN.R, portrait = ch > cw;
    const am = IN.sticks.aim, mv = IN.sticks.move;
    const place = (el, x, y, size) => placeEl(el, x, y, size, size) + size / 2; // returns the bottom edge
    const flip = cfg.lefty ? -1 : 1;
    if (!portrait) {
      const rad = clamp(am.homeY - (insets.t + 64) - 38, 96, R + 100);
      const at = (deg, r) => ({ x: am.homeX + Math.cos(deg * DEG) * r * flip, y: am.homeY - Math.sin(deg * DEG) * r });
      let p = at(122, rad); place(hud.shove, p.x, p.y, 66);
      p = at(96, rad * 1.02); place(hud.reload, p.x, p.y, 56);
      p = at(150, rad * 1.02); place(hud.bomb, p.x, p.y, 56);
      const ml = clamp(mv.homeY - (insets.t + 64) - 38, 96, R + 100);
      const atL = (deg, r) => ({ x: mv.homeX - Math.cos(deg * DEG) * r * flip, y: mv.homeY - Math.sin(deg * DEG) * r });
      p = atL(90, ml); place(hud.med, p.x, p.y, 56);
      p = atL(58, ml); place(hud.pills, p.x, p.y, 56);
      rowBottom = 0;
    } else {
      const y = ch * 0.4 - 12 - 33;
      const rx = (f) => (cfg.lefty ? cw * (1 - f) : cw * f);
      rowBottom = Math.max(
        place(hud.shove, rx(0.83), y, 66),
        place(hud.reload, rx(0.64), y + 4, 56),
        place(hud.bomb, rx(0.64), y - 64, 56),
        place(hud.med, rx(0.12), y, 56),
        place(hud.pills, rx(0.3), y + 4, 56));
    }
    placeUse();
  }

  // ---- sprites (built once)
  const PAT = {}, SPR = {};
  function makePatterns() {
    const R = mulberry32(7);
    const mk = (base, fn) => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 128, 128); fn(g); return ctx.createPattern(c, 'repeat'); };
    const speck = (g, n, cols, s) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[(R() * cols.length) | 0]; g.fillRect(R() * 128, R() * 128, s * (0.5 + R()), s * (0.5 + R())); } };
    PAT[FL.ASPHALT] = mk('#3a3d42', (g) => speck(g, 900, ['#34373c', '#41444a', '#2f3236', '#45484d'], 2));
    PAT[FL.SIDEWALK] = mk('#585b5f', (g) => { speck(g, 300, ['#5f6266', '#515458'], 2); g.strokeStyle = '#4a4d51'; g.lineWidth = 2; for (let k = 0; k <= 128; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 128); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); } });
    PAT[FL.GRASS] = mk('#2e3f2c', (g) => speck(g, 1200, ['#344832', '#283826', '#3a4f36', '#2a3a28'], 3));
    PAT[FL.LOT] = mk('#45474b', (g) => speck(g, 700, ['#4b4d51', '#3f4145', '#505256'], 2));
    PAT[FL.SAFE] = mk('#5d4b3a', (g) => { g.strokeStyle = '#4c3c2e'; g.lineWidth = 2; for (let k = 0; k <= 128; k += 16) { g.beginPath(); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); } for (let k = 0; k < 40; k++) { const y = ((R() * 8) | 0) * 16, x = R() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); } });
    PAT[FL.GRAVEL] = mk('#4a463f', (g) => speck(g, 1400, ['#55504a', '#3f3b35', '#5c574f', '#46423b'], 2.5));
    PAT[FL.ALLEY] = mk('#323438', (g) => speck(g, 700, ['#2c2e32', '#38393e', '#2a2b2f'], 2));
    PAT[FL.CONCRETE] = mk('#4d4f52', (g) => { speck(g, 500, ['#535558', '#46484b'], 2); g.strokeStyle = '#424447'; g.lineWidth = 1.5; g.strokeRect(0, 0, 64, 64); g.strokeRect(64, 64, 64, 64); });
  }
  function makeSprites() {
    const radial = (size, stops) => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
    };
    SPR.light = radial(128, [[0, 'rgba(0,0,0,1)'], [0.35, 'rgba(0,0,0,.8)'], [0.7, 'rgba(0,0,0,.3)'], [1, 'rgba(0,0,0,0)']]);
    SPR.warm = radial(64, [[0, 'rgba(255,170,80,1)'], [1, 'rgba(255,170,80,0)']]);
    SPR.cool = radial(64, [[0, 'rgba(175,205,255,1)'], [1, 'rgba(175,205,255,0)']]);
    SPR.red = radial(64, [[0, 'rgba(255,40,30,1)'], [1, 'rgba(255,40,30,0)']]);
    SPR.flash = radial(64, [[0, 'rgba(255,230,170,1)'], [0.4, 'rgba(255,140,50,.6)'], [1, 'rgba(255,120,40,0)']]);
    // flashlight cone pointing +x from the left-middle. Built square and drawn 1:2, so the
    // 26°-45° steps here open up to a ~44° core that softens out to ~63° on screen.
    const cone = (col) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 512;
      const g = c.getContext('2d');
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const half = lerp(45, 26, i / (steps - 1)) * DEG;
        const gr = g.createRadialGradient(0, 256, 0, 0, 256, 512);
        gr.addColorStop(0, col(0.13)); gr.addColorStop(0.55, col(0.13)); gr.addColorStop(1, col(0));
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(0, 256); g.arc(0, 256, 512, -half, half); g.closePath(); g.fill();
      }
      return c;
    };
    SPR.cone = cone((a) => `rgba(0,0,0,${a})`);
    SPR.coneTint = cone((a) => `rgba(255,236,196,${a})`);
  }

  const ROOF = [['#23272e', '#323842'], ['#2b2627', '#3d3436'], ['#232a2b', '#33403f'], ['#2c2b25', '#403e34'], ['#1f232a', '#2e343e'], ['#28252c', '#39343f']];
  const touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const FLASH_R = 520;

  function render() {
    const v = viewOrigin();
    const z = v.z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * v.ox, dpr * v.oy);
    const x0 = -v.ox / z, y0 = -v.oy / z, x1 = (cw - v.ox) / z, y1 = (ch - v.oy) / z;
    const tx0 = Math.max(0, Math.floor(x0 / T)), ty0 = Math.max(0, Math.floor(y0 / T));
    const tx1 = Math.min(M.W - 1, Math.floor(x1 / T)), ty1 = Math.min(M.H - 1, Math.floor(y1 / T));

    vis.ox = P.x; vis.oy = P.y;
    vis.maxD = (Math.hypot(cw, ch) / z) * 0.62 + 80;
    for (let i = 0; i < vis.n; i++) vis.len[i] = castRay(P.x, P.y, vis.cos[i], vis.sin[i], vis.maxD, OPAQUE);

    // floor
    ctx.fillStyle = PAT[FL.ASPHALT];
    ctx.fillRect(tx0 * T, ty0 * T, (tx1 - tx0 + 1) * T, (ty1 - ty0 + 1) * T);
    for (const f of [FL.SIDEWALK, FL.GRASS, FL.LOT, FL.SAFE, FL.GRAVEL, FL.ALLEY, FL.CONCRETE]) {
      ctx.beginPath();
      let any = false;
      for (let y = ty0; y <= ty1; y++) {
        let run = -1;
        for (let x = tx0; x <= tx1 + 1; x++) {
          const on = x <= tx1 && M.floor[y * M.W + x] === f;
          if (on && run < 0) run = x;
          if (!on && run >= 0) { ctx.rect(run * T, y * T, (x - run) * T, T); run = -1; any = true; }
        }
      }
      if (any) { ctx.fillStyle = PAT[f]; ctx.fill(); }
    }
    ctx.strokeStyle = 'rgba(160,160,150,.25)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (M.floor[y * M.W + x] !== FL.SIDEWALK) continue;
      if (x + 1 < M.W && M.floor[y * M.W + x + 1] === FL.ASPHALT) { ctx.moveTo(x * T + T, y * T); ctx.lineTo(x * T + T, y * T + T); }
      if (x > 0 && M.floor[y * M.W + x - 1] === FL.ASPHALT) { ctx.moveTo(x * T, y * T); ctx.lineTo(x * T, y * T + T); }
      if (y + 1 < M.H && M.floor[(y + 1) * M.W + x] === FL.ASPHALT) { ctx.moveTo(x * T, y * T + T); ctx.lineTo(x * T + T, y * T + T); }
      if (y > 0 && M.floor[(y - 1) * M.W + x] === FL.ASPHALT) { ctx.moveTo(x * T, y * T); ctx.lineTo(x * T + T, y * T); }
    }
    ctx.stroke();
    for (const m of M.marks) {
      if (m.x > x1 || m.y > y1 || m.x + m.w < x0 || m.y + m.h < y0) continue;
      if (m.dash) {
        ctx.fillStyle = 'rgba(205,180,90,.45)';
        if (m.horiz) for (let x = m.x + 20; x < m.x + m.w - 20; x += 60) ctx.fillRect(x, m.y, 30, m.h);
        else for (let y = m.y + 20; y < m.y + m.h - 20; y += 60) ctx.fillRect(m.x, y, m.w, 30);
      } else if (m.zebra) { ctx.fillStyle = 'rgba(220,220,210,.28)'; for (let y = m.y; y < m.y + m.h; y += 18) ctx.fillRect(m.x, y, m.w, 9); }
      else { ctx.fillStyle = 'rgba(220,220,210,.35)'; ctx.fillRect(m.x, m.y, m.w, m.h); }
    }
    for (const d of M.decor) if (d.x > x0 - 60 && d.x < x1 + 60 && d.y > y0 - 60 && d.y < y1 + 60) drawDecor(d);
    const c0x = Math.floor(x0 / CHUNK), c1x = Math.floor(x1 / CHUNK), c0y = Math.floor(y0 / CHUNK), c1y = Math.floor(y1 / CHUNK);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) { const c = chunkAt(cx, cy, false); if (c) ctx.drawImage(c.cv, cx * CHUNK, cy * CHUNK); }
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const k = M.kind[y * M.W + x];
      if (k === K.FENCE) drawFence(x, y); else if (k === K.CRATE) drawCrate(x, y);
    }
    drawGate();
    for (const c of M.cars) if (c.x < x1 + 20 && c.x + c.w > x0 - 20 && c.y < y1 + 20 && c.y + c.h > y0 - 20) drawCar(c);
    for (const it of items) if (it.x > x0 - 40 && it.x < x1 + 40 && it.y > y0 - 40 && it.y < y1 + 40) drawItem(it);
    for (const b of bombs) drawBomb(b);
    for (const d of dying) drawZombie(d.z, true, 1 - d.t / 0.32);
    for (const zz of Z) {
      const dx = zz.x - P.x, dy = zz.y - P.y;
      const seen = isVisible(zz.x, zz.y, zz.r);
      zz.vis = clamp(zz.vis + (seen ? 0.2 : -0.12), 0, 1);
      zz.lit = seen && litAt(zz.x, zz.y, dx, dy);
      if (zz.vis <= 0 || zz.x < x0 - 30 || zz.x > x1 + 30 || zz.y < y0 - 30 || zz.y > y1 + 30) continue;
      drawZombie(zz, false, 0);
    }
    drawPlayer();
    for (const p of parts) {
      if (p.t === 'blood') { ctx.fillStyle = '#7a0c10'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); }
      else if (p.t === 'casing') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = '#d8b25a'; ctx.fillRect(-2.5, -1.2, 5, 2.4); ctx.restore(); }
      else if (p.t === 'smoke') { const a = p.life / p.max; ctx.fillStyle = `rgba(150,150,150,${0.18 * a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (2 - a), 0, TAU); ctx.fill(); }
    }
    for (const t of M.trees) if (t.x > x0 - 60 && t.x < x1 + 60 && t.y > y0 - 60 && t.y < y1 + 60) drawTree(t);

    // ---- light & darkness
    drawLighting(v);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * v.ox, dpr * v.oy);
    ctx.save();
    visPath(ctx); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of M.lights) {
      if ((L.inside && !inRoomRect(P, M.startRoom)) || (L.insideEnd && !inRoomRect(P, M.endRoom))) continue;
      if (L.x + L.r < x0 || L.x - L.r > x1 || L.y + L.r < y0 || L.y - L.r > y1) continue;
      const lv = lightLevel(L);
      if (lv <= 0) continue;
      ctx.globalAlpha = (L.alarm ? 0.3 : L.warm > 0.5 ? 0.14 : 0.1) * lv;
      ctx.drawImage(L.alarm ? SPR.red : L.warm > 0.5 ? SPR.warm : SPR.cool, L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    if (!P.dead) {
      ctx.globalAlpha = 0.55;
      ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.aim); ctx.drawImage(SPR.coneTint, 0, -FLASH_R, FLASH_R, FLASH_R * 2); ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // walls and roofs sit above the darkness so the city always reads
    for (const b of M.buildings) if (b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0) drawRoof(b);
    drawWalls(tx0, ty0, tx1, ty1);

    // glowing things
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of tracers) {
      const a = t.t / t.max;
      ctx.strokeStyle = `rgba(255,220,150,${0.75 * a})`; ctx.lineWidth = t.w;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    }
    for (const f of flashes) {
      if (f.shove) {
        const a = f.t / (f.ring ? 0.3 : 0.16);
        ctx.strokeStyle = `rgba(255,255,255,${0.4 * a})`; ctx.lineWidth = 5;
        ctx.beginPath();
        if (f.ring) ctx.arc(f.x, f.y, P.r + 40 + (1 - a) * 40, 0, TAU);
        else ctx.arc(f.x, f.y, P.r + 34 + (1 - a) * 24, f.a - 60 * DEG, f.a + 60 * DEG);
        ctx.stroke();
      } else if (f.boom) {
        const a = f.t / f.max;
        ctx.globalAlpha = a; ctx.drawImage(SPR.flash, f.x - 200, f.y - 200, 400, 400); ctx.globalAlpha = 1;
      } else {
        const a = f.t / 0.06;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
        ctx.fillStyle = `rgba(255,210,120,${0.9 * a})`;
        ctx.beginPath(); ctx.moveTo(0, -4 * f.s); ctx.lineTo(18 * f.s + Math.random() * 8, 0); ctx.lineTo(0, 4 * f.s); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(2, 0, 7 * f.s, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    for (const p of parts) if (p.t === 'spark') { const a = p.life / p.max; ctx.fillStyle = `rgba(255,200,90,${a})`; ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5); }
    for (const zz of Z) {
      if (zz.vis <= 0.05 || zz.lit || zz.state === Z_STUMBLE) continue;
      const ex = zz.x + Math.cos(zz.face) * 6, ey = zz.y + Math.sin(zz.face) * 6;
      const px = -Math.sin(zz.face) * 2.6, py = Math.cos(zz.face) * 2.6;
      ctx.fillStyle = zz.state === Z_IDLE ? `rgba(220,200,120,${0.45 * zz.vis})` : `rgba(255,70,40,${0.8 * zz.vis})`;
      ctx.fillRect(ex + px - 1.2, ey + py - 1.2, 2.4, 2.4); ctx.fillRect(ex - px - 1.2, ey - py - 1.2, 2.4, 2.4);
    }
    // laser: dotted while aiming, solid while firing (touch and gamepad)
    if (mode === 'run' && !P.dead && !P.safe && IN.aim.active && IN.aim.source !== 'mouse') {
      const w = WEAP[curW().kind];
      const ca = Math.cos(P.aim), sa = Math.sin(P.aim);
      const sx = P.x + ca * (P.r + w.len), sy = P.y + sa * (P.r + w.len);
      const len = Math.max(0, Math.min(w.range, castRay(P.x, P.y, ca, sa, w.range + 40, OPAQUE) - P.r - w.len));
      ctx.strokeStyle = P.firingNow ? 'rgba(255,60,40,.5)' : 'rgba(255,60,40,.42)';
      ctx.lineWidth = P.firingNow ? 1.6 : 1.3;
      if (!P.firingNow) ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + ca * len, sy + sa * len); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const b of bombs) if (b.landed && b.blink > 0) { ctx.globalAlpha = 0.8; ctx.drawImage(SPR.red, b.x - 60, b.y - 60, 120, 120); ctx.globalAlpha = 1; }
    ctx.restore();
    // aim-assist bracket
    if (mode === 'run' && P.assist && P.assist.hp > 0 && IN.aim.active && cfg.assist > 0) {
      const a = P.assist, s = a.r + 7;
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(a.x + sx * s, a.y + sy * (s - 5)); ctx.lineTo(a.x + sx * s, a.y + sy * s); ctx.lineTo(a.x + sx * (s - 5), a.y + sy * s); }
      ctx.stroke();
    }

    // ---- screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScreenFx(v);
    if (mode === 'run' && state === 'play') {
      const firstMinute = runTime < 45;
      IN.draw(ctx, { showGhost: IN.source === 'touch' || (IN.source === 'none' && touchCapable), labels: firstMinute, time: gameTime, debug: cfg.debug, autoFiring: P.firingNow && IN.aim.wantsFire, shoveBlocked });
    }
    if (cfg.debug && mode === 'run') drawDebug();
  }

  function lightLevel(L) {
    if (L.alarm) return M.gate.state === 'opening' ? 0.5 + 0.5 * Math.sin(gameTime * 9) : 0;
    if (!L.flicker) return 1;
    const n = Math.sin(gameTime * 13.1 + L.x) + Math.sin(gameTime * 7.3 + L.y) + Math.sin(gameTime * 29.7);
    return n > 1.4 ? 0.15 : 1;
  }
  function isVisible(x, y, r) {
    const dx = x - vis.ox, dy = y - vis.oy, d = Math.hypot(dx, dy);
    if (d > vis.maxD) return false;
    if (d < r + 4) return true;
    let a = Math.atan2(dy, dx); if (a < 0) a += TAU;
    const i = Math.floor((a / TAU) * vis.n) % vis.n;
    return d - r < Math.max(vis.len[i], vis.len[(i + 1) % vis.n]);
  }
  function litAt(x, y, dx, dy) {
    const d = Math.hypot(dx, dy);
    if (d < 130) return true;
    // the cone sprite's full-bright core is about ±44° and the floor is still over 70% as bright at ±56°;
    // anything drawn that brightly in the beam counts as lit (past that it fades fast to dark by ±63°)
    if (!P.dead && d < FLASH_R && Math.abs(angDiff(Math.atan2(dy, dx), P.aim)) < 0.98) return true;
    for (const f of flashes) if (!f.shove && Math.hypot(f.x - x, f.y - y) < (f.boom ? 300 : 210)) return true;
    for (const L of M.lights) { if (L.inside || L.insideEnd) continue; if (lightLevel(L) > 0.5 && Math.hypot(L.x - x, L.y - y) < L.r * 0.7) return true; }
    return false;
  }
  function visPath(c) {
    c.beginPath();
    for (let i = 0; i < vis.n; i++) {
      const L = vis.len[i], x = vis.ox + vis.cos[i] * L, y = vis.oy + vis.sin[i] * L;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
  }
  function drawLighting(v) {
    const z = v.z, ls = lscale;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over'; lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.fillStyle = 'rgba(2,4,9,0.93)';
    lctx.fillRect(0, 0, lc.width, lc.height);
    lctx.setTransform(z * ls, 0, 0, z * ls, v.ox * ls, v.oy * ls);
    lctx.globalCompositeOperation = 'destination-out';
    lctx.save();
    visPath(lctx); lctx.clip();
    lctx.fillStyle = 'rgba(0,0,0,0.42)'; // moonlight in whatever you can see
    lctx.fill();
    const glow = (x, y, r, a) => { lctx.globalAlpha = clamp(a, 0, 1); lctx.drawImage(SPR.light, x - r, y - r, r * 2, r * 2); };
    if (!P.dead) {
      glow(P.x, P.y, 150, 0.75);
      lctx.globalAlpha = 1;
      lctx.save(); lctx.translate(P.x, P.y); lctx.rotate(P.aim); lctx.drawImage(SPR.cone, 0, -FLASH_R, FLASH_R, FLASH_R * 2); lctx.restore();
    }
    for (const L of M.lights) {
      if ((L.inside && !inRoomRect(P, M.startRoom)) || (L.insideEnd && !inRoomRect(P, M.endRoom))) continue;
      const lv = lightLevel(L);
      if (lv > 0) glow(L.x, L.y, L.r, (L.flood ? 0.9 : L.alarm ? 0.55 : 0.78) * lv);
    }
    for (const f of flashes) {
      if (f.shove) continue;
      if (f.boom) glow(f.x, f.y, 440, f.t / f.max);
      else glow(f.x, f.y, 220 * f.s, 0.85 * (f.t / 0.06));
    }
    for (const b of bombs) if (b.landed && b.blink > 0) glow(b.x, b.y, 90, 0.6);
    lctx.restore();
    lctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    // exact scale (not stretched to the canvas size), so the holes line up with the sharp layers
    ctx.drawImage(lc, 0, 0, (lc.width / lscale) * dpr, (lc.height / lscale) * dpr);
  }

  function drawDecor(d) {
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a || 0);
    if (d.t === 'manhole') { ctx.fillStyle = '#2b2d30'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.strokeStyle = '#3d4044'; ctx.lineWidth = 2; ctx.stroke(); }
    else if (d.t === 'puddle') { ctx.fillStyle = 'rgba(80,100,130,.18)'; ctx.beginPath(); ctx.ellipse(0, 0, 26 * d.s, 14 * d.s, 0, 0, TAU); ctx.fill(); }
    else if (d.t === 'paper') { ctx.fillStyle = 'rgba(200,195,180,.35)'; ctx.fillRect(-5, -4, 10, 8); }
    else if (d.t === 'crack') { ctx.strokeStyle = 'rgba(20,20,22,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-18 * d.s, -3); ctx.lineTo(-4, 4); ctx.lineTo(6, -2); ctx.lineTo(18 * d.s, 5); ctx.stroke(); }
    else if (d.t === 'bench') { ctx.fillStyle = '#4a3a2a'; ctx.fillRect(-24, -6, 48, 12); ctx.fillStyle = '#5a4630'; ctx.fillRect(-24, -6, 48, 4); }
    else if (d.t === 'dumpster') { ctx.fillStyle = '#2f4a3a'; ctx.fillRect(-26, -15, 52, 30); ctx.fillStyle = '#263c2f'; ctx.fillRect(-26, -15, 52, 6); ctx.strokeStyle = '#1b2a21'; ctx.lineWidth = 2; ctx.strokeRect(-26, -15, 52, 30); }
    ctx.restore();
  }
  function drawFence(x, y) {
    const px = x * T, py = y * T;
    const horizLine = (fAt(x - 1, y) & FENCE) || (fAt(x + 1, y) & FENCE);
    ctx.fillStyle = '#5b4a35';
    if (horizLine) { ctx.fillRect(px, py + 14, T, 12); ctx.fillStyle = '#6e5a40'; ctx.fillRect(px + 3, py + 10, 7, 20); ctx.fillRect(px + 24, py + 9, 7, 22); }
    else { ctx.fillRect(px + 14, py, 12, T); ctx.fillStyle = '#6e5a40'; ctx.fillRect(px + 10, py + 3, 20, 7); ctx.fillRect(px + 9, py + 24, 22, 7); }
  }
  function drawCrate(x, y) {
    const px = x * T + 3, py = y * T + 3, s = T - 6;
    ctx.fillStyle = '#6b5236'; ctx.fillRect(px, py, s, s);
    ctx.strokeStyle = '#4a3824'; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + s, py + s); ctx.stroke();
  }
  function drawGate() {
    const g = M.gate;
    const x = g.x * T, y0 = g.y0 * T, y1 = (g.y1 + 1) * T;
    const open = g.state === 'open' ? 1 : g.state === 'opening' ? clamp(g.t / g.dur, 0, 1) : 0;
    const len = (y1 - y0) * (1 - open);
    ctx.fillStyle = 'rgba(150,160,170,.18)';
    ctx.fillRect(x + 6, y0, T - 12, len);
    ctx.strokeStyle = 'rgba(170,180,190,.55)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < len; k += 8) { ctx.moveTo(x + 6, y0 + k); ctx.lineTo(x + T - 6, y0 + k + 8); ctx.moveTo(x + T - 6, y0 + k); ctx.lineTo(x + 6, y0 + k + 8); }
    ctx.stroke();
    ctx.fillStyle = '#8a9099';
    ctx.fillRect(x + 4, y0 + len - 4, T - 8, 6);
    ctx.fillRect(x + 4, y0 - 2, T - 8, 4);
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawCar(c) {
    ctx.save();
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
    ctx.rotate((c.horiz ? 0 : Math.PI / 2) + c.ang + (c.flip ? Math.PI : 0));
    const L = Math.max(c.w, c.h) - 8, Wd = Math.min(c.w, c.h) - 10;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(-L / 2 + 3, -Wd / 2 + 4, L, Wd, 9); ctx.fill();
    ctx.fillStyle = c.wreck ? shade(c.col, -30) : c.col; rr(-L / 2, -Wd / 2, L, Wd, 9); ctx.fill();
    ctx.fillStyle = 'rgba(20,28,38,.85)'; rr(-L * 0.2, -Wd / 2 + 5, L * 0.46, Wd - 10, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.08)'; rr(-L * 0.16, -Wd / 2 + 7, L * 0.12, Wd - 14, 3); ctx.fill();
    ctx.fillStyle = shade(c.col, 18); rr(-L / 2 + 6, -Wd / 2 + 6, L * 0.24, Wd - 12, 5); ctx.fill();
    ctx.fillStyle = c.wreck ? '#1a1a1a' : 'rgba(255,240,200,.5)'; ctx.fillRect(L / 2 - 4, -Wd / 2 + 4, 3, 7); ctx.fillRect(L / 2 - 4, Wd / 2 - 11, 3, 7);
    if (c.wreck) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(L * 0.25, 0, Wd * 0.35, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawTree(t) {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(t.x + 5, t.y + 6, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = t.hue < 0.5 ? '#253a26' : '#2d3b22'; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = t.hue < 0.5 ? '#2f4a30' : '#38492a';
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + t.hue * 6; ctx.beginPath(); ctx.arc(t.x + Math.cos(a) * t.r * 0.45, t.y + Math.sin(a) * t.r * 0.45, t.r * 0.45, 0, TAU); ctx.fill(); }
  }
  function drawItem(it) {
    const bob = Math.sin(gameTime * 3 + it.x) * 1.5;
    ctx.save(); ctx.translate(it.x, it.y);
    if (it.t !== 'switch') { ctx.fillStyle = it.t === 'medkit' || it.t === 'pills' ? 'rgba(255,80,80,.12)' : 'rgba(255,220,120,.1)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill(); }
    if (it.t === 'ammo') {
      ctx.fillStyle = '#3d4a2e'; ctx.fillRect(-16, -11, 14, 10); ctx.fillRect(2, -11, 14, 10); ctx.fillRect(-8, 1, 16, 10);
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(-14, -9, 10, 2); ctx.fillRect(4, -9, 10, 2); ctx.fillRect(-6, 3, 12, 2);
    } else if (it.t === 'medkit') {
      ctx.translate(0, bob); ctx.fillStyle = '#e8e2d6'; rr(-12, -9, 24, 18, 3); ctx.fill();
      ctx.fillStyle = '#c3272b'; ctx.fillRect(-3, -7, 6, 14); ctx.fillRect(-8, -3, 16, 6);
    } else if (it.t === 'pills') {
      ctx.translate(0, bob); ctx.fillStyle = '#e8e2d6'; rr(-6, -9, 12, 18, 3); ctx.fill();
      ctx.fillStyle = '#d8a23a'; ctx.fillRect(-6, -9, 12, 5); ctx.fillStyle = '#c3272b'; ctx.fillRect(-4, 0, 8, 3);
    } else if (it.t === 'bomb') {
      ctx.translate(0, bob); ctx.rotate(0.6); ctx.fillStyle = '#6a6f75'; rr(-11, -4, 22, 8, 3); ctx.fill();
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(-3, -5, 6, 10);
      ctx.fillStyle = Math.sin(gameTime * 6) > 0 ? '#ff3b2f' : '#5a1a14'; ctx.beginPath(); ctx.arc(8, 0, 2.2, 0, TAU); ctx.fill();
    } else if (it.t === 'weapon') {
      const def = WEAP[it.w];
      ctx.rotate(-0.5);
      ctx.fillStyle = '#1d1f22'; ctx.fillRect(-def.len, -3, def.len * 2, 6);
      ctx.fillStyle = '#3a3d42'; ctx.fillRect(-def.len, -4, 10, 8);
      if (it.w === 'shotgun') { ctx.fillStyle = '#5a3d22'; ctx.fillRect(-def.len, -4, 12, 8); ctx.fillRect(2, -3.5, 8, 7); }
      else { ctx.fillStyle = '#26292d'; ctx.fillRect(-2, 3, 5, it.w === 'rifle' ? 9 : 8); }
    } else if (it.t === 'switch') {
      ctx.fillStyle = '#4a4f57'; ctx.fillRect(-9, -13, 12, 26);
      ctx.fillStyle = it.used ? '#3bd16f' : Math.sin(gameTime * 5) > 0 ? '#ff3b2f' : '#7a1f18';
      ctx.beginPath(); ctx.arc(-3, -6, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(-6, 1, 6, 8);
    }
    ctx.restore();
  }
  function drawBomb(b) {
    ctx.save(); ctx.translate(b.x, b.y - (b.h || 0));
    ctx.rotate(b.landed ? 0 : b.t * 14);
    ctx.fillStyle = '#6a6f75'; rr(-9, -3.5, 18, 7, 3); ctx.fill();
    ctx.fillStyle = b.landed && b.blink > 0 ? '#ff3b2f' : '#5a1a14'; ctx.beginPath(); ctx.arc(7, 0, 2.4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawZombie(z, dead, fall) {
    ctx.save(); ctx.translate(z.x, z.y);
    ctx.rotate(dead ? lerp(z.face, z.face + 0.6, fall) : z.face);
    let s = z.r / 12;
    if (z.climb > 0) s *= 1.12;
    ctx.scale(s, s);
    const chase = z.state === Z_CHASE || z.state === Z_ATTACK;
    const sw = Math.sin(z.phase);
    const white = z.flash > 0;
    ctx.strokeStyle = white ? '#fff' : shade(z.skin, -10); ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (z.state === Z_STUMBLE || dead) { ctx.moveTo(0, -9); ctx.lineTo(-8, -17); ctx.moveTo(0, 9); ctx.lineTo(4, 17); }
    else if (chase) {
      // the windup: arms pulled back then thrown forward
      const wind = z.state === Z_ATTACK ? (z.atkT > 0.12 ? -6 : 7) : 0;
      ctx.moveTo(2, -8); ctx.lineTo(16 + wind + sw * 3, -7 + sw * 1.5);
      ctx.moveTo(2, 8); ctx.lineTo(16 + wind - sw * 3, 7 - sw * 1.5);
    } else { ctx.moveTo(1, -9); ctx.lineTo(7 + sw, -11); ctx.moveTo(1, 9); ctx.lineTo(6 - sw, 11); }
    ctx.stroke();
    ctx.fillStyle = white ? '#fff' : z.shirt;
    ctx.beginPath(); ctx.ellipse(-1, 0, 8, 12 + (chase ? sw * 0.6 : 0), 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = white ? '#fff' : z.skin;
    ctx.beginPath(); ctx.arc(2.5, 0, 6.3, 0, TAU); ctx.fill();
    if (z.hair && !white) { ctx.fillStyle = 'rgba(30,26,22,.85)'; ctx.beginPath(); ctx.arc(1, 0, 6.3, Math.PI * 0.55, Math.PI * 1.45); ctx.fill(); }
    if (!white) { ctx.fillStyle = 'rgba(110,20,20,.55)'; ctx.beginPath(); ctx.arc(-3, 4, 2.6, 0, TAU); ctx.fill(); }
    if (z.state === Z_ATTACK && z.atkT > 0.12) { ctx.strokeStyle = 'rgba(255,60,40,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 15, -0.9, 0.9); ctx.stroke(); }
    ctx.restore();
  }
  function drawPlayer() {
    if (P.dead && state !== 'dead') return;
    // legs follow movement, torso follows the aim
    const spd = Math.hypot(P.vx, P.vy);
    ctx.save(); ctx.translate(P.x, P.y);
    if (P.dead) ctx.globalAlpha = 0.9;
    ctx.save(); ctx.rotate(spd > 10 ? Math.atan2(P.vy, P.vx) : P.aim);
    const step = Math.sin(P.walkPhase) * Math.min(1, spd / 150) * 6;
    ctx.fillStyle = '#1d1f22';
    ctx.beginPath(); ctx.ellipse(step, -6, 5, 3.6, 0, 0, TAU); ctx.ellipse(-step, 6, 5, 3.6, 0, 0, TAU); ctx.fill();
    ctx.restore();
    const lunge = P.shoveT > 0 ? Math.sin(((0.22 - P.shoveT) / 0.22) * Math.PI) : 0;
    ctx.rotate(P.aim + (lunge ? angDiff(P.shoveDir, P.aim) * lunge * 0.6 : 0));
    const w = WEAP[curW().kind];
    const recoil = P.firingT > 0 ? -2.5 * clamp(P.fireCd * w.rof, 0, 1) : 0;
    const pump = P.pumpT > 0 ? Math.sin(((0.55 - P.pumpT) / 0.55) * Math.PI) * 4 : 0;
    ctx.save(); ctx.translate(recoil + lunge * 10, 0);
    ctx.fillStyle = '#16181b'; ctx.fillRect(6, 1, w.len + 6, 5);
    if (curW().kind === 'shotgun') { ctx.fillStyle = '#5a3d22'; ctx.fillRect(10 + pump, 0.5, 8, 6); }
    ctx.strokeStyle = '#d9a77c'; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(1, -9); ctx.lineTo(10, 1); ctx.moveTo(1, 9); ctx.lineTo(16 + pump * 0.5, 5); ctx.stroke();
    ctx.fillStyle = '#fff6d8'; ctx.fillRect(w.len + 11, 0.5, 2.5, 6);
    ctx.restore();
    const blink = (P.hurtT > 0 || P.invT > 0) && Math.sin(gameTime * 60) > 0;
    ctx.fillStyle = blink ? '#ffffff' : '#ff7a2f';
    ctx.beginPath(); ctx.ellipse(-1, 0, 8.5, 13, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#c95a1e'; ctx.fillRect(-7, -2, 6, 4);
    ctx.fillStyle = '#d9a77c'; ctx.beginPath(); ctx.arc(1.5, 0, 6.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.arc(0, 0, 6.6, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
    ctx.restore();
    if (P.healT > 0) { ctx.strokeStyle = '#3bd16f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P.x, P.y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.healT / 3)); ctx.stroke(); }
    if (P.reloadT > 0) { ctx.strokeStyle = 'rgba(255,214,120,.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(P.x, P.y, 21, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.reloadT / P.reloadTotal)); ctx.stroke(); }
  }
  function drawRoof(b) {
    const st = ROOF[b.style] || ROOF[0];
    ctx.fillStyle = st[0]; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = st[1]; ctx.lineWidth = 5; ctx.strokeRect(b.x + 2.5, b.y + 2.5, b.w - 5, b.h - 5);
    for (const d of b.det) {
      ctx.save(); ctx.translate(d.x, d.y);
      if (d.t === 'ac') { ctx.fillStyle = st[1]; ctx.fillRect(-12 * d.s, -9 * d.s, 24 * d.s, 18 * d.s); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 6 * d.s, 0, TAU); ctx.stroke(); }
      else if (d.t === 'vent') { ctx.fillStyle = st[1]; ctx.beginPath(); ctx.arc(0, 0, 6 * d.s, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(0, 0, 3 * d.s, 0, TAU); ctx.fill(); }
      else { ctx.strokeStyle = st[1]; ctx.lineWidth = 2; ctx.strokeRect(-10 * d.s, -10 * d.s, 20 * d.s, 20 * d.s); }
      ctx.restore();
    }
  }
  // Safe-room walls, the yard wall and the slammed door, drawn per tile above the darkness.
  function drawWalls(tx0, ty0, tx1, ty1) {
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const k = M.kind[y * M.W + x];
      if (k === K.SAFEWALL) { ctx.fillStyle = '#2a2420'; ctx.fillRect(x * T, y * T, T, T); ctx.fillStyle = '#5a4632'; ctx.fillRect(x * T + 4, y * T + 4, T - 8, T - 8); }
      else if (k === K.WALL && x > 0 && y > 0 && x < M.W - 1 && y < M.H - 1) { ctx.fillStyle = '#3a3d43'; ctx.fillRect(x * T, y * T, T, T); ctx.fillStyle = '#4a4e55'; ctx.fillRect(x * T + 4, y * T, 4, T); }
      else if (k === K.DOOR) { ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x * T + 6, y * T, T - 12, T); }
    }
    ctx.font = '700 15px "Barlow Condensed", system-ui, sans-serif';
    ctx.textAlign = 'center';
    const s = M.startRoom;
    ctx.fillStyle = '#e9e6df'; ctx.fillText('START', (s.x0 + s.x1) / 2 - T / 2, s.y0 - T + 14);
    const e = M.endRoom;
    ctx.fillStyle = '#3bd16f'; ctx.fillText('SAFE ROOM', (e.x0 + e.x1) / 2, e.y0 - T + 14);
    // door markers
    ctx.fillStyle = '#3bd16f';
    const ed = M.endDoor; if (!P.safe) ctx.fillRect(ed.x * T, ed.y * T + 2, 5, T - 4);
  }

  function drawScreenFx(v) {
    if (mode === 'run' && !P.dead) {
      const px = P.x * v.z + v.ox, py = P.y * v.z + v.oy;
      const ringR = 65 * v.z;
      for (const d of dmgInd) {
        const a = d.t / 0.7;
        ctx.strokeStyle = `rgba(255,40,30,${0.85 * a})`; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(px, py, ringR, d.a - 0.45, d.a + 0.45); ctx.stroke();
      }
      if (cfg.threat) {
        for (const z of Z) {
          if (z.state === Z_IDLE || z.hp <= 0) continue;
          const dx = z.x - P.x, dy = z.y - P.y, d = Math.hypot(dx, dy);
          if (d > 700) continue;
          if (z.vis > 0.5 && z.lit && onScreen(z.x, z.y, -10)) continue;
          const a = Math.atan2(dy, dx);
          const al = 0.75 * (1 - d / 700) + 0.1;
          ctx.fillStyle = `rgba(255,70,50,${al})`;
          ctx.save(); ctx.translate(px + Math.cos(a) * (ringR - 8), py + Math.sin(a) * (ringR - 8)); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-3, -4.5); ctx.lineTo(-3, 4.5); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      // horde warning: the screen edge pulses on the side they come from
      if (D.warn) {
        const u = D.warn.t / D.warn.max;
        const a = D.warn.ang;
        const ex = cw / 2 + Math.cos(a) * cw * 0.5, ey = ch / 2 + Math.sin(a) * ch * 0.5;
        const pulse = 0.5 + 0.5 * Math.sin(gameTime * 10);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * pulse * Math.min(1, u * 3);
        const r = Math.min(cw, ch) * 0.6;
        ctx.drawImage(SPR.red, ex - r, ey - r, r * 2, r * 2);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      const tgt = objectiveTarget();
      if (tgt) {
        const sx = tgt.x * v.z + v.ox, sy = tgt.y * v.z + v.oy;
        const m = 34;
        if (sx < m || sy < m + insets.t + 50 || sx > cw - m || sy > ch - m) {
          const a = Math.atan2(sy - ch / 2, sx - cw / 2);
          const ex = clamp(sx, m + insets.l, cw - m - insets.r), ey = clamp(sy, m + insets.t + 54, ch * 0.55);
          ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
          ctx.fillStyle = 'rgba(59,209,111,.85)';
          ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-7, -9); ctx.lineTo(-3, 0); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    }
    if (P.wounded && !P.dead) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,0.85)'; ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'source-over';
    }
    const low = P.hp + P.temp < 35 ? (35 - P.hp - P.temp) / 35 : 0;
    const hurt = Math.max(0, P.hurtT / 0.45);
    if (low > 0 || hurt > 0) {
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
      g.addColorStop(0, 'rgba(120,0,0,0)');
      g.addColorStop(1, `rgba(150,0,0,${Math.min(0.75, hurt * 0.4 + low * (0.35 + 0.15 * Math.sin(gameTime * 6)))})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }
    if (state === 'dead' || state === 'won') { ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, endT * 0.5)})`; ctx.fillRect(0, 0, cw, ch); }
  }
  function objectiveTarget() {
    if (M.gate.state === 'closed') return M.sw;
    return { x: (M.endDoor.x + 2.5) * T, y: (M.endDoor.y + 0.5) * T };
  }
  function inRoomRect(e, r) { return e.x > r.x0 && e.x < r.x1 && e.y > r.y0 && e.y < r.y1; }

  function drawDebug() {
    const s = IN.sticks;
    const lines = [
      `move ${IN.move.x.toFixed(2)},${IN.move.y.toFixed(2)} out ${IN.move.mag.toFixed(2)} raw ${s.move.mag.toFixed(2)} R ${IN.R}px`,
      `aim ${IN.aim.active ? Math.round((IN.aim.ang * 180) / Math.PI) + '°' : '—'} raw ${s.aim.mag.toFixed(2)} ${IN.aim.firing ? 'FIRE' : ''} ω ${Math.round((IN.aim.angVel * 180) / Math.PI)}°/s src ${IN.source}`,
      `assist ${P.assist ? 'locked' : '—'}  shove cd ${Math.max(0, P.shoveCd).toFixed(2)} chain ${P.chain}`,
      `zombies ${Z.length} active ${chasers()}  ${D.cresc ? 'CRESCENDO' : D.phase} int ${D.intensity.toFixed(2)} mob ${D.phase === 'build' ? Math.max(0, D.mobT).toFixed(0) + 's' : '—'}`,
      `dpr ${dpr.toFixed(2)} q ${qualityLevel()} seed ${M.seed}`,
    ];
    ctx.font = '500 11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    const y0 = insets.t + 92;
    ctx.fillRect(insets.l + 8, y0, 380, lines.length * 15 + 8);
    ctx.fillStyle = '#d6ffd6';
    lines.forEach((l, i) => ctx.fillText(l, insets.l + 14, y0 + 16 + i * 15));
  }

  // ================================================================ HUD (DOM)
  const hud = {
    root: $('#hud'), hpFill: $('#hpFill'), hpTemp: $('#hpTemp'), hpNum: $('#hpNum'), hpTag: $('#hpTag'), obj: $('#objective'), banner: $('#banner'),
    weapon: $('#btnWeapon'), wName: $('#wName'), mag: $('#ammoMag'), res: $('#ammoRes'), swapHint: $('#swapHint'),
    reload: $('#btnReload'), med: $('#btnMed'), medN: $('#medCount'), pills: $('#btnPills'), pillN: $('#pillCount'), bomb: $('#btnBomb'), bombN: $('#bombCount'),
    shove: $('#btnShove'), pips: document.querySelectorAll('#btnShove .pips i'),
    use: $('#btnUse'), useLabel: $('#useLabel'), useFill: $('#useFill'), fps: $('#fps'), gateBar: $('#gateBar'), gateFill: $('#gateFill'),
  };
  let hudCache = {};
  const setText = (el, key, v) => { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } };
  const setOnce = (key, v, fn) => { if (hudCache[key] !== v) { hudCache[key] = v; fn(v); } };
  let bannerT = 0;
  function banner(text, kind, sec) {
    if (mode !== 'run') return;
    hud.banner.textContent = text;
    hud.banner.className = 'banner show ' + (kind || '');
    bannerT = sec || 1.5;
  }
  function updateHud(dt) {
    if (mode !== 'run') return;
    const hp = Math.max(0, Math.ceil(P.hp)), tmp = Math.round(P.temp);
    setText(hud.hpNum, 'hp', String(hp + tmp));
    setOnce('hpw', hp + ':' + tmp, () => {
      hud.hpFill.style.transform = `scaleX(${hp / 100})`;
      hud.hpTemp.style.transform = `scaleX(${Math.min(1, (hp + tmp) / 100)})`;
      hud.hpFill.classList.toggle('low', hp + tmp < 40);
    });
    setText(hud.hpTag, 'tag', P.wounded ? 'SECOND WIND' : P.hp + P.temp < 40 ? 'LIMPING' : '');
    const w = curW(), def = WEAP[w.kind];
    setText(hud.wName, 'wn', def.name + (P.primary ? (P.cur === 'primary' ? ' · 1/2' : ' · 2/2') : ''));
    setText(hud.mag, 'mag', P.reloadT > 0 && !def.perShell ? '··' : String(w.mag));
    setText(hud.res, 'res', w.res === Infinity ? '∞' : String(w.res));
    setOnce('lowmag', w.mag <= Math.ceil(def.mag * 0.2), (v) => hud.weapon.classList.toggle('low', v));
    setOnce('swap', !!P.primary, (v) => { hud.swapHint.hidden = !v; });
    setText(hud.medN, 'med', String(P.med));
    setOnce('medOn', P.med > 0, (v) => hud.med.classList.toggle('empty', !v));
    setOnce('healing', P.healT > 0, (v) => hud.med.classList.toggle('active', v));
    setText(hud.pillN, 'pill', String(P.pills));
    setOnce('pillOn', P.pills > 0, (v) => hud.pills.classList.toggle('empty', !v));
    setText(hud.bombN, 'bomb', String(P.bombs));
    setOnce('bombOn', P.bombs > 0, (v) => hud.bomb.classList.toggle('empty', !v));
    setOnce('shoveCd', P.shoveCd > 0.05, (v) => hud.shove.classList.toggle('cool', v));
    setOnce('shoveBtn', cfg.shoveBtn, (v) => { hud.shove.hidden = !v; });
    const pips = Math.min(5, P.chain);
    setOnce('pips', pips, (v) => hud.pips.forEach((p, i) => p.classList.toggle('on', i < v)));
    let label = '';
    if (useTarget) label = useTarget.t === 'weapon' ? 'Take ' + WEAP[useTarget.w].name.toLowerCase() : 'Hold: LOUD switch';
    if (label && hud.use.hidden && ch / 2 + (P.y - cam.y + P.r) * cam.zoom > ch / 2 - ch * liftFrac() + 38) label = '';
    setOnce('use', label, (v) => { hud.use.hidden = !v; hud.useLabel.textContent = v; });
    if (label) placeUse(); // measured and placed once the HUD shows; a no-op when nothing changed
    hud.useFill.style.transform = `scaleX(${clamp(useHoldT / 0.6, 0, 1)})`;
    let obj;
    if (M.gate.state === 'closed') obj = !P.primary && inRoomRect(P, M.startRoom) ? 'Grab a gun from the table' : 'Find the gate in the east wall →';
    else if (M.gate.state === 'opening') obj = 'Hold out: gate ' + Math.floor((M.gate.t / M.gate.dur) * 100) + '%';
    else obj = 'Get into the safe room!';
    setText(hud.obj, 'obj', obj);
    setOnce('gate', M.gate.state === 'opening', (v) => { hud.gateBar.hidden = !v; });
    if (M.gate.state === 'opening') hud.gateFill.style.transform = `scaleX(${clamp(M.gate.t / M.gate.dur, 0, 1)})`;
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) hud.banner.className = 'banner'; }
  }
  function tickTips() {
    if (mode !== 'run' || state !== 'play') return;
    const say = (k, text, sec) => { if (tips.shown[k]) return; tips.shown[k] = true; banner(text, 'tip', sec || 3.2); };
    const touchy = IN.source === 'touch' || (IN.source === 'none' && touchCapable);
    const mv = cfg.lefty ? 'right' : 'left', am = cfg.lefty ? 'left' : 'right';
    if (runTime > 0.8) say('move', touchy ? `${mv[0].toUpperCase() + mv.slice(1)} thumb moves · ${am} thumb aims the light` : 'WASD moves · the mouse aims · click fires', 3.4);
    const fireTip = cfg.fireMode === 'ring' ? 'Push past the dashed ring to fire' : cfg.fireMode === 'auto' ? `Point the ${am} stick at a lit zombie: it fires by itself` : `Push the ${am} stick to fire`;
    if (P.primary && runTime > 2) say('ring', touchy ? fireTip : 'Space or right-click shoves', 3);
    const shoveTip = cfg.tapShove ? `Too close? TAP the ${am} side to shove` : cfg.shoveBtn ? 'Too close? Hit SHOVE' : cfg.flickShove ? `Too close? FLICK the ${am} stick to shove` : 'Too close? Back off and shoot';
    for (const z of Z) if ((z.state === Z_CHASE || z.state === Z_ATTACK) && Math.hypot(z.x - P.x, z.y - P.y) < 80) { say('shove', touchy ? shoveTip : 'Too close? Space or right-click to shove', 3); break; }
  }
  // the title's how-to follows handedness and the firing mode
  function syncHowto() {
    const mv = cfg.lefty ? 'Right' : 'Left', am = cfg.lefty ? 'Left' : 'Right';
    const set = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
    set('#howMove', `<b>${mv} thumb</b> anywhere on the ${mv.toLowerCase()}: move.`);
    set('#howAim', `<b>${am} thumb</b>: aim the light. ` + (cfg.fireMode === 'ring' ? 'Push past the ring to <b>fire</b>.' : cfg.fireMode === 'auto' ? 'It <b>fires</b> by itself at lit zombies.' : 'Push it to <b>fire</b>.'));
    set('#howShove', cfg.tapShove ? `<b>Tap</b> the ${am.toLowerCase()} side to <b>shove</b> when they get close.`
      : cfg.shoveBtn ? 'Hit the <b>Shove</b> button when they get close.'
      : cfg.flickShove ? `<b>Flick</b> the ${am.toLowerCase()} stick to <b>shove</b> when they get close.`
      : 'No touch shove in this setup: <b>back off</b> and shoot.');
  }

  // ================================================================ screens
  const screens = { title: $('#title'), pause: $('#pause'), end: $('#end'), lab: $('#lab') };
  let labFrom = 'title';
  function show(name) {
    for (const k in screens) screens[k].hidden = k !== name;
    hud.root.hidden = name !== null;
    document.body.classList.toggle('playing', name === null);
    IN.enabled = name === null;
    dirty = true;
    // A screen that opens under a busy thumb ignores touches for a moment, so a double tap on
    // Pause can't hit the back link and a frantic tap can't start a new run.
    if (name === 'pause' || name === 'end') {
      const el = screens[name];
      el.classList.add('arming');
      clearTimeout(show.h); show.h = setTimeout(() => el.classList.remove('arming'), name === 'end' ? 650 : 400);
    }
  }
  function startRun() {
    SFX.init();
    SFX.stopAll(); // a siren, motor or drums left over from the last run
    // Android: go full screen inside the tap that starts the run
    if (touchCapable && /Android/i.test(navigator.userAgent) && !document.fullscreenElement) goFullscreen();
    newRun((Math.random() * 1e9) >>> 0, 'run');
    state = 'play';
    tips.shown = {};
    show(null);
    IN.releaseAll();
    armBack();
    requestWake();
    last = performance.now();
  }
  let backArmed = false;
  function armBack() {
    if (backArmed) return;
    try { history.pushState({ ttl: 1 }, ''); backArmed = true; } catch (e) { /* file:// or sandboxed */ }
  }
  function pause() {
    if (state !== 'play') return;
    state = 'paused';
    IN.releaseAll();
    SFX.stopAll();
    releaseWake();
    $('#seedLine').textContent = `Map seed ${M.seed} · ${Math.floor(runTime / 60)}:${String(Math.floor(runTime % 60)).padStart(2, '0')} in`;
    show('pause');
    $('#pauseH').focus({ preventScroll: true }); // the next Tab lands on Resume, not the gallery link
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'play';
    SFX.resume();
    if (mode === 'run' && M.gate.state === 'opening') { SFX.motor(true); if (M.gate.t < SIREN_S) SFX.siren(true); }
    show(null);
    IN.releaseAll();
    armBack();
    requestWake();
    perf.iv.length = 0; perf.work.length = 0; perf.bad = 0; perf.good = 0;
    last = performance.now();
  }
  function endScreen() {
    const won = state === 'won';
    $('#endTitle').textContent = won ? 'You made it.' : 'Overrun.';
    $('#endSub').textContent = won ? 'The door slams. Something scratches at it for a while, then stops.' : 'They got you ' + clamp(Math.round((P.x / (WALLX * T)) * 100), 0, 100) + '% of the way to the gate.';
    const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const t = Math.round(stats.time);
    const rows = [['Time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`], ['Kills', stats.kills], ['Accuracy', acc + '%'], ['Shoves', stats.shoves], ['Damage taken', stats.dmg], ['Hordes', stats.mobs + (M.gate.state !== 'closed' ? 1 : 0)]];
    $('#endStats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    releaseWake();
    show('end');
  }

  // ---- feel lab
  function presetMatch(p) { for (const k in p.set) if (cfg[k] !== p.set[k]) return false; return true; }
  function buildLab() {
    const pr = $('#labPresets');
    pr.innerHTML = '';
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `${p.name}<small>${p.note}</small>`;
      b.setAttribute('aria-pressed', String(presetMatch(p)));
      b.addEventListener('click', () => { Object.assign(cfg, p.set); applyCfg(); saveCfg(); buildLab(); toast('Preset ' + p.id); });
      pr.appendChild(b);
    }
    const body = $('#labBody');
    const scroller = $('#labScroll');
    const scroll = scroller.scrollTop;
    body.innerHTML = '';
    const txt = (v) => (typeof v === 'function' ? v() : v); // some labels name a side, which flips with 'Swap sides'
    for (const row0 of LAB) {
      const row = { ...row0, group: txt(row0.group), label: txt(row0.label) };
      if (row.group) { const h = document.createElement('h3'); h.textContent = row.group; body.appendChild(h); continue; }
      const wrap = document.createElement('div'); wrap.className = 'row row-' + row.type;
      const id = 'cfg-' + row.key;
      if (row.type === 'range') {
        wrap.innerHTML = `<label for="${id}"><span>${row.label}</span><output></output></label><input id="${id}" type="range" min="${row.min}" max="${row.max}" step="${row.step}">`;
        const inp = wrap.querySelector('input'), o = wrap.querySelector('output');
        inp.value = cfg[row.key]; o.textContent = row.fmt(cfg[row.key]);
        inp.addEventListener('input', () => { cfg[row.key] = parseFloat(inp.value); applyCfg(); o.textContent = row.fmt(cfg[row.key]); saveCfg(); syncPresets(); });
      } else if (row.type === 'toggle') {
        wrap.innerHTML = `<label class="tog"><span>${row.label}</span><input id="${id}" type="checkbox" role="switch"><i aria-hidden="true"></i></label>`;
        const inp = wrap.querySelector('input');
        inp.checked = !!cfg[row.key];
        inp.addEventListener('change', () => {
          cfg[row.key] = inp.checked; applyCfg(); saveCfg();
          if (row.key === 'lefty') { buildLab(); const again = $('#' + id); if (again) again.focus(); } // relabel the sides
        });
      } else if (row.type === 'seg') {
        wrap.innerHTML = `<span class="lbl">${row.label}</span><div class="seg" role="radiogroup" aria-label="${row.label}">${row.options.map(([v, l]) => `<button type="button" role="radio" data-v="${v}">${l}</button>`).join('')}</div>`;
        const btns = wrap.querySelectorAll('button');
        const sync = () => btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === cfg[row.key])));
        sync();
        btns.forEach((b) => b.addEventListener('click', () => { cfg[row.key] = b.dataset.v; sync(); applyCfg(); saveCfg(); syncPresets(); }));
      }
      if (row.hint) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = row.hint; wrap.appendChild(p); }
      body.appendChild(wrap);
    }
    scroller.scrollTop = scroll;
  }
  function syncPresets() { const btns = $('#labPresets').querySelectorAll('button'); PRESETS.forEach((p, i) => btns[i] && btns[i].setAttribute('aria-pressed', String(presetMatch(p)))); }
  function openLab(from) { labFrom = from; buildLab(); show('lab'); }
  function closeLab() { show(labFrom === 'pause' ? 'pause' : labFrom === 'end' ? 'end' : 'title'); }
  function toast(text) {
    const t = $('#toast'); t.textContent = text; t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toast.h); toast.h = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 250); }, 2200);
  }

  // ================================================================ wiring
  function tapBtn(el, fn) {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.pointerType === 'touch') IN.source = 'touch'; fn(e); });
    el.addEventListener('click', (e) => { if (e.detail === 0) fn(e); }); // keyboard activation
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }
  function wire() {
    IN.attach(canvas);
    tapBtn(hud.weapon, () => IN.press('swap'));
    tapBtn(hud.reload, () => IN.press('reload'));
    tapBtn(hud.med, () => IN.press('med'));
    tapBtn(hud.pills, () => IN.press('pills'));
    tapBtn(hud.bomb, () => IN.press('bomb'));
    tapBtn(hud.shove, shoveFromButton);
    // Use pill: the switch needs a 0.6 s hold; a weapon is taken on release inside the pill.
    // Sliding off cancels either, so a thumb that only lands here does nothing.
    let usePtr = null;
    const inUse = (e) => { const r = hud.use.getBoundingClientRect(); return e.clientX >= r.left - 10 && e.clientX <= r.right + 10 && e.clientY >= r.top - 10 && e.clientY <= r.bottom + 10; };
    hud.use.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.pointerType === 'touch') IN.source = 'touch'; useHeld = true; useHoldT = 0; usePtr = e.pointerId; });
    hud.use.addEventListener('pointermove', (e) => { if (e.pointerId === usePtr && useHeld && !inUse(e)) useHeld = false; });
    hud.use.addEventListener('pointerup', (e) => {
      if (e.pointerId !== usePtr) return;
      const tap = useHeld && inUse(e);
      useHeld = false; usePtr = null;
      if (tap && useTarget && useTarget.t === 'weapon') IN.press('use');
    });
    for (const ev of ['pointercancel', 'pointerleave']) hud.use.addEventListener(ev, () => { useHeld = false; usePtr = null; });
    hud.use.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    hud.use.addEventListener('click', (e) => { if (e.detail === 0) IN.press('use'); });
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat && state === 'play') { if (useTarget && useTarget.t === 'switch') { useHeld = true; } else IN.press('use'); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyE') useHeld = false; });
    tapBtn($('#btnPause'), () => pause());
    $('#playBtn').addEventListener('click', startRun);
    $('#resumeBtn').addEventListener('click', resume);
    $('#resumeIcon').addEventListener('click', resume); // on the Pause button's spot: tap there again to go back
    $('#resumeIcon').addEventListener('mousedown', (e) => e.preventDefault()); // aria-hidden: never take focus
    // A touch that lands while a screen is arming is dropped whole, so lifting it after the guard
    // ends doesn't click whatever is under it.
    for (const el of [screens.pause, screens.end]) el.addEventListener('touchstart', (e) => { if (el.classList.contains('arming') && e.cancelable) e.preventDefault(); }, { passive: false });
    $('#restartBtn').addEventListener('click', startRun);
    $('#againBtn').addEventListener('click', startRun);
    $('#labBtnTitle').addEventListener('click', () => openLab('title'));
    $('#labBtnPause').addEventListener('click', () => openLab('pause'));
    $('#labBtnEnd').addEventListener('click', () => openLab('end'));
    $('#labClose').addEventListener('click', closeLab);
    $('#labReset').addEventListener('click', () => { Object.assign(cfg, DEFAULTS); applyCfg(); saveCfg(); buildLab(); toast('Back to defaults'); });
    $('#labShare').addEventListener('click', async () => {
      const url = shareLink();
      try { await navigator.clipboard.writeText(url); toast('Link with these settings copied'); }
      catch (e) { window.prompt('Copy this link:', url); }
    });
    $('#labHorde').addEventListener('click', () => {
      if (mode !== 'run' || state === 'won' || state === 'dead') { toast('Start a run first'); return; }
      if (D.cresc) { toast('Already a crescendo'); return; }
      refreshFieldP(); // paused, so the field may still point at where the survivor was before 'Skip to gate'
      const p = planMob(Math.round((rand(10, 16.99) + D.mobs) * cfg.horde), 16, 28, 0.6);
      if (!p) { toast('No hidden spot for a horde here'); return; }
      warnFrom(p, 3); releaseMob(p, gameTime + 3); D.mobs++; stats.mobs++;
      D.labCue = true; // the HORDE! cue plays on the first tick after resume, not under the pause card
      closeLab(); toast('Horde in 3 seconds…');
    });
    $('#labCresc').addEventListener('click', () => {
      if (mode !== 'run' || state === 'won' || state === 'dead') { toast('Start a run first'); return; }
      const ft = freeTileNear(WALLX - 2, M.gate.y0 - 1);
      P.x = (ft.x + 0.5) * T; P.y = (ft.y + 0.5) * T; P.vx = P.vy = 0;
      if (!P.primary) { P.primary = { kind: 'smg', mag: 50, res: 400 }; P.cur = 'primary'; }
      cam.x = P.x; cam.y = P.y; refreshFieldP();
      for (let i = Z.length - 1; i >= 0; i--) if (Math.hypot(Z[i].x - P.x, Z[i].y - P.y) < 700) Z.splice(i, 1);
      // a horde the director already announced (D.pending) or 'Horde now' queued: plan it again around the gate
      const pend = D.pending, pendAt = pend ? gameTime + Math.max(0.5, D.mobT) : Infinity;
      D.phase = 'relax'; D.relaxT = 1e9; D.relaxX = P.x; D.pending = null; D.warn = null;
      if (pend) { D.mobs++; stats.mobs++; D.mobT = rand(75, 120); } // as when the director releases it
      if (spawnQ.length || pend) {
        const n = spawnQ.length + (pend ? pend.n : 0), at = Math.min(pendAt, ...spawnQ.map((q) => q.at));
        spawnQ.length = 0;
        const p = planMob(n, 16, 28, 0.6);
        if (p) { releaseMob(p, at); warnFrom(p, Math.max(0.5, at - gameTime)); } else D.labCue = false;
      }
      closeLab(); toast('At the gate. Hold the switch to start.');
    });
    // Sound toggle on the title and pause cards. Kept under its own key, not in the feel
    // settings, so a shared feel link never mutes someone else.
    const MUTE_KEY = 'remotefunland:two-thumbs-left:muted';
    const muteBtns = document.querySelectorAll('[data-mute]');
    const syncMute = () => muteBtns.forEach((b) => { b.setAttribute('aria-pressed', String(SFX.muted)); b.querySelector('span').textContent = SFX.muted ? 'Sound off' : 'Sound on'; });
    try { if (localStorage.getItem(MUTE_KEY) === '1') SFX.setMuted(true); } catch (e) { /* storage blocked */ }
    muteBtns.forEach((b) => b.addEventListener('click', () => {
      SFX.setMuted(!SFX.muted);
      try { localStorage.setItem(MUTE_KEY, SFX.muted ? '1' : '0'); } catch (e) { /* storage blocked */ }
      syncMute();
    }));
    syncMute();
    const fullBtn = $('#fullBtn');
    if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) fullBtn.hidden = true;
    fullBtn.addEventListener('click', goFullscreen);

    let pendingResize = 0;
    const relayout = () => {
      cancelAnimationFrame(pendingResize);
      pendingResize = requestAnimationFrame(() => {
        const w = document.documentElement.clientWidth || window.innerWidth, h = document.documentElement.clientHeight || window.innerHeight;
        // a turn moves the zones out from under the thumbs; a toolbar sliding away does not
        if ((h > w) !== (ch > cw)) IN.releaseAll();
        resize();
      });
    };
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (state === 'play') pause(); SFX.suspend(); }
      else { if (SFX.ready) SFX.resume(); if (state === 'play') requestWake(); }
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) { IN.releaseAll(); resize(); if (state === 'play') pause(); } });
    window.addEventListener('popstate', () => {
      backArmed = false;
      IN.releaseAll();
      if (state === 'play') pause();
      if (state === 'play' || state === 'paused') armBack();
    });
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
        if (state === 'paused' && screens.lab.hidden) { e.preventDefault(); resume(); }
        else if (!screens.lab.hidden) { e.preventDefault(); closeLab(); }
      }
      if (e.code === 'Enter' && state === 'title' && !screens.title.hidden && document.activeElement === document.body) startRun();
    });
    // iOS can leave the audio context interrupted after a call or an alarm
    document.addEventListener('touchend', () => { if (SFX.ready) SFX.resume(); }, { passive: true });
  }
  function shoveFromButton() { if (state === 'play' && !P.dead) shove({ dir: null, kind: 'button' }); }
  async function goFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
    } catch (e) { /* not allowed */ }
  }
  let wake = null;
  async function requestWake() {
    try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { /* not allowed */ }
  }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* already gone */ } wake = null; }

  // ================================================================ main loop
  let last = performance.now(), fpsAcc = 0, fpsN = 0;
  const prof = { update: 0, render: 0 };
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) dt = 0.016;
    const raw = dt;
    dt = Math.min(dt, 0.05);
    if (cfg.slowmo && mode === 'run') dt *= 0.25;
    const t0 = performance.now();
    // nothing moves behind the pause screen, a settled end screen or a reduced-motion title
    const frozen = state === 'paused' || (state === 'title' && reducedMotion.matches && gameTime > 0.6) || ((state === 'won' || state === 'dead') && endT > 4.5);
    if (!frozen) {
      // read the sticks once per frame: substeps share it, and the aim speed estimate stays honest
      if (mode === 'run' && state === 'play' && !P.dead && !P.safe) IN.update();
      let rem = dt * (state === 'dead' ? 0.35 : 1);
      while (rem > 1e-4 && state !== 'paused') { const step = Math.min(rem, 1 / 60); update(step); rem -= step; }
      if (state === 'won' || state === 'dead') { endT += dt; if (endT > 1.8 && screens.end.hidden && screens.lab.hidden) endScreen(); }
    }
    const t1 = performance.now();
    if (!frozen || dirty) { render(); dirty = false; }
    const t2 = performance.now();
    prof.update = prof.update * 0.9 + (t1 - t0) * 0.1; prof.render = prof.render * 0.9 + (t2 - t1) * 0.1;
    updateHud(dt);
    if (cfg.quality === 'auto' && state === 'play') autoQuality(raw * 1000, t2 - t0);
    if (cfg.fps) {
      fpsAcc += raw; fpsN++;
      if (fpsAcc > 0.5) { hud.fps.textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; }
      hud.fps.hidden = false;
    } else hud.fps.hidden = true;
  }

  // Auto quality: judge each ~2 s window by its median frame time, so one stall doesn't count.
  // A steady ~33 ms with little script work is a 30 fps cap (low power mode), not a slow GPU.
  function autoQuality(ivMs, workMs) {
    perf.iv.push(ivMs); perf.work.push(workMs);
    if (perf.iv.length < 120) return;
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    const mi = med(perf.iv), mw = med(perf.work);
    let spread = 0; for (const v of perf.iv) spread += Math.abs(v - mi); spread /= perf.iv.length;
    const capped = mi > 30 && mi < 36 && spread < 2.5 && mw < 10;
    if (mi > 24 && !capped) {
      perf.good = 0;
      if (++perf.bad >= 2 && autoDpr > 1) { autoDpr = Math.max(1, autoDpr - 0.5); perf.bad = 0; resize(); }
    } else if (mi < 18 && mw < 6 && autoDpr < 2 && perf.ups < 1) {
      perf.bad = 0;
      if (++perf.good >= 4) { autoDpr = Math.min(2, autoDpr + 0.5); perf.good = 0; perf.ups++; resize(); }
    } else { perf.bad = 0; perf.good = 0; }
    perf.iv.length = 0; perf.work.length = 0;
  }

  // ================================================================ boot
  loadCfg();
  for (const k of CONTROL_KEYS) IN.cfg[k] = cfg[k];
  document.body.classList.toggle('lefty', cfg.lefty);
  syncHowto();
  makePatterns();
  makeSprites();
  wire();
  newRun((Math.random() * 1e9) >>> 0, 'attract');
  resize();
  show('title');
  if (sharedLoaded) setTimeout(() => toast('Loaded shared feel settings'), 400);
  requestAnimationFrame((t) => { last = t; frame(t); });

  // hooks for the screenshot and test scripts
  window.__ttl = {
    get state() { return state; }, get mode() { return mode; }, get P() { return P; }, get Z() { return Z; }, get D() { return D; }, get M() { return M; },
    get cam() { return cam; }, cfg, startRun, pause, resume,
    teleport(tx, ty) { const f = freeTileNear(tx, ty); P.x = (f.x + 0.5) * T; P.y = (f.y + 0.5) * T; P.vx = P.vy = 0; cam.x = P.x; cam.y = P.y; fieldPTile = -1; },
    spawn(n, dist) {
      let made = 0;
      for (let k = 0; k < n * 20 && made < n; k++) {
        const a = Math.random() * TAU, d = (dist || 300) * (0.8 + Math.random() * 0.4);
        const x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
        if (fAt(Math.floor(x / T), Math.floor(y / T)) & (BLOCK_Z | FENCE)) continue;
        addZombie(x, y, Z_CHASE); made++;
      }
      return made;
    },
    get prof() { return prof; },
    give(kind) { P.primary = { kind, mag: WEAP[kind].mag, res: WEAP[kind].maxRes }; P.cur = 'primary'; },
  };
})();
