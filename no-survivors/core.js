// NO SURVIVORS: Keep Them Dancing. Shared core: the NS namespace, timing, maths, seeded randomness,
// palette, fonts, URL parameters, the night counter and the shot/clue registries.
// Loaded first. Every other file attaches to window.NS. Nothing here draws.
(function () {
  'use strict';
  const NS = (window.NS = window.NS || {});

  // ---- frame and timing -------------------------------------------------------------------------
  // Scenes always draw in a virtual 1280 x 720 frame; the engine scales it to the real canvas.
  NS.W = 1280;
  NS.H = 720;
  NS.BPM = 150;
  NS.BEAT = 0.4;          // seconds per beat
  NS.BAR = 1.6;           // seconds per bar (4/4)
  NS.STEP = 0.1;          // seconds per 16th
  NS.BARS = 112;          // music bars: 112 * 1.6 = 179.2 s
  NS.END = 179.2;         // the picture's last frame; the evidence board takes over after it
  NS.DURATION = 180.0;    // the audio file's length (0.8 s of room tone after NS.END)
  NS.tb = (bar, beat = 0, step = 0) => bar * NS.BAR + beat * NS.BEAT + step * NS.STEP;  // bar/beat -> s
  NS.barAt = (t) => t / NS.BAR;      // fractional global bar
  NS.beatAt = (t) => t / NS.BEAT;    // fractional global beat

  // ---- maths ------------------------------------------------------------------------------------
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
  const remap = (x, a, b, c, d, clampIt = true) => {
    const k = invLerp(a, b, x);
    return lerp(c, d, clampIt ? clamp(k) : k);
  };
  const smoothstep = (a, b, x) => {
    const k = clamp(invLerp(a, b, x));
    return k * k * (3 - 2 * k);
  };
  const fract = (x) => x - Math.floor(x);
  NS.clamp = clamp; NS.lerp = lerp; NS.invLerp = invLerp; NS.remap = remap; NS.smoothstep = smoothstep; NS.fract = fract;
  NS.TAU = Math.PI * 2;

  // Easing: all take k in [0, 1].
  NS.ease = {
    linear: (k) => k,
    inQuad: (k) => k * k,
    outQuad: (k) => 1 - (1 - k) * (1 - k),
    inOutQuad: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
    inCubic: (k) => k * k * k,
    outCubic: (k) => 1 - Math.pow(1 - k, 3),
    inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    inExpo: (k) => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
    outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    outBack: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
    inBack: (k) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * k * k * k - c1 * k * k; },
    outElastic: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
    outBounce: (k) => {
      const n1 = 7.5625, d1 = 2.75;
      if (k < 1 / d1) return n1 * k * k;
      if (k < 2 / d1) return n1 * (k -= 1.5 / d1) * k + 0.75;
      if (k < 2.5 / d1) return n1 * (k -= 2.25 / d1) * k + 0.9375;
      return n1 * (k -= 2.625 / d1) * k + 0.984375;
    },
  };

  // ---- seeded randomness (scenes must be pure functions of time: never Math.random in a draw) ---
  // hash(n, seed): a stable float in [0, 1) for an integer-ish n.
  NS.hash = (n, seed = 0) => {
    let h = (Math.floor(n) * 374761393 + seed * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  // rng(seed): mulberry32 stream. Create it inside a draw with a fixed seed, so a frame repeats.
  NS.rng = (seed) => {
    let a = (seed * 2654435761) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // noise1(x, seed): smooth value noise in [-1, 1].
  NS.noise1 = (x, seed = 0) => {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    return lerp(NS.hash(i, seed), NS.hash(i + 1, seed), u) * 2 - 1;
  };
  NS.pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

  // ---- palette ----------------------------------------------------------------------------------
  NS.C = {
    night0: '#05070d', night1: '#0b1222', night2: '#16223d', fog: '#2a3a5c', moon: '#dfe8ff',
    sodium: '#ff9a3c', sodiumDim: '#7a3f12',
    red: '#e8262e', redDark: '#5a0b10', ink: '#4a0c12',
    uv: '#c86bff', uvHot: '#f0d2ff',                // the wristbands: used for nothing else
    zombieRim: '#8fbf5a', zombieSkin: '#6e8a5a', zombieDark: '#10160f', bile: '#c9e04a',
    vex: '#ff3344', granny: '#ff6fb5', tiny: '#ffd23f', noodle: '#ff8a1f', lamp: '#cff8ff',
    fire: '#ff5a1f', fireHot: '#ffd27a', laser: '#39ffb0', stageBlue: '#3a6bff', stageMagenta: '#ff2bd6',
    white: '#f4f1ea', paper: '#efe6cf', cork: '#a87b4a', string: '#c4161c', bone: '#e9e2cf',
  };
  // Speaker colours for captions.
  NS.WHO = {
    VEX: NS.C.vex, GRANNY: NS.C.granny, TINY: NS.C.tiny, NOODLE: NS.C.noodle,
    LOU: '#9fe8ff', GROUPIE: NS.C.uv, ZOMBIES: NS.C.zombieRim, CROWD: NS.C.zombieRim,
  };

  // ---- fonts (declared in fonts/fonts.css) -------------------------------------------------------
  NS.F = {
    logo: "'Metal Mania', 'Anton', serif",          // the band logo only
    title: "'Anton', Impact, 'Arial Narrow', sans-serif",  // song title, lyrics, big cards
    comic: "'Bangers', 'Anton', Impact, sans-serif",       // banter captions, onomatopoeia, intro cards
    hand: "'Permanent Marker', 'Comic Sans MS', cursive",  // graffiti, evidence notes, setlist
    hud: "'Share Tech Mono', ui-monospace, monospace",     // radio, clocks, thermal HUD, odometer
    type: "'Special Elite', 'Courier New', monospace",     // notices, posters' small print, tickets
  };
  // font(size, family): a canvas font string, e.g. ctx.font = NS.font(48, NS.F.title).
  NS.font = (size, family, weight = '400') => `${weight} ${Math.round(size * 100) / 100}px ${family}`;
  NS.fontsReady = (document.fonts && document.fonts.load)
    ? Promise.all(['Metal Mania', 'Anton', 'Bangers', 'Permanent Marker', 'Share Tech Mono', 'Special Elite']
        .map((f) => document.fonts.load(`40px '${f}'`).catch(() => null))).then(() => true)
    : Promise.resolve(true);

  // ---- URL parameters: ?a=1&b or #a=1&b (the hash wins) -------------------------------------------
  function parse(str) {
    const out = {};
    str.replace(/^[?#]/, '').split('&').forEach((kv) => {
      if (!kv) return;
      const i = kv.indexOf('=');
      const k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      out[k] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
    });
    return out;
  }
  NS.params = Object.assign(parse(location.search), parse(location.hash));
  NS.has = (k) => Object.prototype.hasOwnProperty.call(NS.params, k);
  NS.num = (k, d) => (NS.has(k) && NS.params[k] !== '' && isFinite(+NS.params[k]) ? +NS.params[k] : d);

  // ---- the night counter --------------------------------------------------------------------------
  // The fire was at 3:00 AM on 31 October 1987 (local time): that was Night 1. Every 3:00 AM since is
  // another night. "Tonight's show" is the most recent 3:00 AM; the next one is the countdown target.
  // Overrides for testing: ?now=2026-11-23T12:00 (local), ?night=14268, ?witching (force 3 AM).
  NS.nightInfo = function (nowArg) {
    let now = nowArg || (NS.has('now') ? new Date(NS.params.now) : new Date());
    if (isNaN(now)) now = new Date();
    const show = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0, 0);
    if (now < show) show.setDate(show.getDate() - 1);
    const next = new Date(show.getFullYear(), show.getMonth(), show.getDate() + 1, 3, 0, 0, 0);
    const days = Math.round((Date.UTC(show.getFullYear(), show.getMonth(), show.getDate()) - Date.UTC(1987, 9, 31)) / 86400000);
    let night = days + 1;
    if (NS.has('night') && isFinite(+NS.params.night)) night = Math.max(1, Math.round(+NS.params.night));
    const witching = NS.has('witching') || now.getHours() === 3;
    return { now, show, next, night, msToNext: next - now, witching };
  };
  const ni = NS.nightInfo();
  NS.night = ni.night;               // e.g. 14269 on 23 November 2026
  NS.witching = ni.witching;         // true between 3:00 and 3:59 AM local (or ?witching)
  NS.fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');  // 14269 -> "14,269"
  NS.fmtCountdown = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const p = (x) => String(x).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  };

  // ---- registries ---------------------------------------------------------------------------------
  // Shots: NS.shot('van', { init(ctxInfo) {...}, draw(ctx, S) {...} }). See SPEC "Scene contract".
  NS.shots = NS.shots || {};
  NS.shot = (name, def) => { NS.shots[name] = def; return def; };
  // Clues: a scene registers where its clue is best seen, for the evidence board's polaroids.
  // NS.clue('missing', { t: 41.3, rect: [x, y, w, h] })   (rect in the 1280 x 720 frame)
  NS.clues = NS.clues || {};
  NS.clue = (id, info) => { NS.clues[id] = Object.assign(NS.clues[id] || {}, info); };

  NS.reduced = false;  // reduce flashing; the engine owns it (gate checkbox, transport button, ?reduced)
})();
