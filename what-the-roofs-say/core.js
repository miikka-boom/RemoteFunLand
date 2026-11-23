'use strict';
/* What the Roofs Say: shared core (loaded first).
 * WTRS.util  small helpers (seeded RNG, maths, easing, params, storage, reduced motion)
 * WTRS.bus   a tiny event bus: on(name, fn) -> off(), once(name, fn), emit(name, payload)
 * Every other module hangs itself off window.WTRS: data, paint, murals, icons, sfx, world, ui, game.
 */
window.WTRS = window.WTRS || {};
(function (W) {
  const util = {};

  // mulberry32: small, fast, seedable. Same seed -> same sequence on every device.
  util.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // FNV-1a string hash -> 32-bit seed (e.g. util.rng(util.seed('M5')))
  util.seed = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };
  util.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  util.lerp = (a, b, t) => a + (b - a) * t;
  util.smooth = (t) => t * t * (3 - 2 * t);
  util.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  util.easeOut = (t) => 1 - Math.pow(1 - t, 3);
  util.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  util.key = (x, y, z) => (z === undefined ? x + ',' + y : x + ',' + y + ',' + z);
  util.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  util.now = () => performance.now();
  util.dpr = () => Math.min(2, window.devicePixelRatio || 1);

  // URL switches: ?fresh (ignore the save), ?debug (debug overlay), ?murals (mural gallery page)
  const q = new URLSearchParams(location.search);
  util.params = { fresh: q.has('fresh'), debug: q.has('debug'), murals: q.has('murals') };

  // prefers-reduced-motion, kept live
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  util.reduced = !!(mq && mq.matches);
  if (mq) {
    const onChange = (e) => { util.reduced = e.matches; bus.emit('reducedmotion', util.reduced); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  // localStorage, never throwing (private windows, blocked storage, previews)
  util.load = function (key) {
    try { const s = window.localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  };
  util.save = function (key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  };
  util.forget = function (key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  };

  // canvas helper: a canvas of CSS size w x h at a given pixel ratio
  util.canvas = function (w, h, ratio) {
    const c = document.createElement('canvas');
    const r = ratio || 1;
    c.width = Math.max(1, Math.round(w * r));
    c.height = Math.max(1, Math.round(h * r));
    return c;
  };

  const handlers = Object.create(null);
  const bus = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return () => bus.off(name, fn); },
    off(name, fn) { const l = handlers[name]; if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    once(name, fn) { const off = bus.on(name, (p) => { off(); fn(p); }); return off; },
    emit(name, payload) {
      const l = handlers[name];
      if (!l) return;
      for (const fn of l.slice()) {
        try { fn(payload); } catch (e) { console.error('[bus ' + name + ']', e); }
      }
    },
  };

  W.util = util;
  W.bus = bus;
})(window.WTRS);
