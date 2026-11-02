'use strict';
/* Two Thumbs Left: twin-stick input.
 *
 * TOUCH (the thing prototype 0 is about)
 * - Thumbs are tracked with Touch Events, bound by Touch.identifier. Every touch event carries
 *   the full list of fingers still down (e.touches), so a stick whose finger vanished (system
 *   gesture, alert, app switch) is released on the next event instead of getting stuck, and a
 *   finger that lands afterwards gets the freed stick straight away.
 * - Zones: landscape = left / right halves under the HUD strip; portrait = the bottom 60 %,
 *   split in two. Swapped for left-handed play.
 * - Floating sticks: the base appears under the thumb and drags along when the thumb overshoots.
 *   The landing point is always zero deflection; near a screen edge only the drawn base is
 *   nudged inward, so a thumb resting at the edge never walks or fires by itself.
 * - Fixed sticks: a touch on or near the drawn base uses it; a touch far from it floats a base
 *   under the thumb for that touch, so a stray landing never starts at full deflection.
 * - Move stick: radial dead zone, outer saturation, response curve, and a minimum speed so a
 *   push never crawls.
 * - Aim stick: inside the fire ring you aim the flashlight; past it you fire (with hysteresis).
 *   Alternative modes: fire on any aim, or auto-fire at the aim-assist target.
 * - A quick tap on the aim side (or, optionally, a flick) is a shove.
 * - Once the aim stick has had a direction, resting the thumb back near the centre keeps that
 *   direction (no fire) until the thumb lifts.
 *
 * Fallbacks: Pointer Events for mouse/pen (aim at cursor, left button fires, right button
 * shoves), keyboard, and a standard-mapping gamepad.
 */
window.TwinStick = (function () {
  const cfg = {
    mode: 'floating', // 'floating' | 'fixed'
    size: 0,          // stick radius in CSS px; 0 = auto (14 % of the short screen side, 44-72)
    follow: true,     // base drags along when the thumb overshoots the rim
    moveDead: 0.10,   // radial dead zone (fraction of radius)
    moveSat: 0.85,    // full speed from here out
    moveCurve: 1.0,   // response exponent
    moveMin: 0.30,    // output jumps to this as soon as you leave the dead zone
    aimDead: 0.18,    // inside this the aim angle is frozen (no jitter near centre)
    fireMode: 'ring', // 'ring' | 'any' | 'auto'
    fireAt: 0.65,     // ring radius (fraction)
    fireHys: 0.10,    // stop firing below fireAt - fireHys
    tapShove: true,
    flickShove: false,
    tapMs: 180,
    tapPx: 14,
    lefty: false,
    haptics: true,
  };

  const now = () => performance.now();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function makeStick(role) {
    return {
      role, id: null, active: false,
      ox: 0, oy: 0, px: 0, py: 0, sx: 0, sy: 0, t0: 0, travel: 0, fired: false, floating: false,
      homeX: 0, homeY: 0, drawX: 0, drawY: 0, relT: 0,
      mag: 0, ang: 0, x: 0, y: 0, hasDir: false, hadDir: false, firing: false, prevAng: 0, angVel: 0,
    };
  }
  const sticks = { move: makeStick('move'), aim: makeStick('aim') };

  const move = { x: 0, y: 0, mag: 0 };
  const aim = { active: false, ang: 0, mag: 0, firing: false, wantsFire: false, source: 'none', worldTarget: false, angVel: 0 };
  const mouse = { x: 0, y: 0, inside: false, fire: false };
  const keys = Object.create(null);
  const pressed = Object.create(null);
  const shoves = []; // queued shove requests {dir: angle|null}
  let source = 'none';
  let el = null;
  let W = 0, H = 0, R = 56;
  const insets = { t: 0, r: 0, b: 0, l: 0 };
  const zones = { move: { x0: 0, y0: 0, x1: 0, y1: 0 }, aim: { x0: 0, y0: 0, x1: 0, y1: 0 } };
  const debugTouches = new Map();
  let padPrev = [];
  let padFire = false;
  let enabled = true;
  let lastBuzz = 0;
  let lastFrame = now();
  let mouseButtons = 0;

  function press(action) { if (enabled) pressed[action] = true; }
  function consume(action) { const v = !!pressed[action]; pressed[action] = false; return v; }
  function takeShove() { return shoves.length ? shoves.shift() : null; }

  function buzz(ms, force) {
    if (!cfg.haptics || source !== 'touch') return;
    const t = now();
    if (!force && t - lastBuzz < 90) return;
    lastBuzz = t;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ }
  }

  function radius() { return cfg.size > 0 ? cfg.size : clamp(Math.round(0.14 * Math.min(W, H)), 44, 72); }

  function layout(w, h, ins) {
    W = w; H = h;
    if (ins) Object.assign(insets, ins);
    R = radius();
    const portrait = H > W;
    const top = portrait ? H * 0.4 : insets.t + 64;
    const mid = W / 2;
    const L = { x0: 0, y0: top, x1: mid, y1: H }, Rt = { x0: mid, y0: top, x1: W, y1: H };
    zones.move = cfg.lefty ? Rt : L; zones.aim = cfg.lefty ? L : Rt;
    const left = { x: insets.l + R + 40, y: H - insets.b - R - 44 };
    const right = { x: W - insets.r - R - 40, y: H - insets.b - R - 44 };
    const mv = cfg.lefty ? right : left, am = cfg.lefty ? left : right;
    sticks.move.homeX = mv.x; sticks.move.homeY = mv.y;
    sticks.aim.homeX = am.x; sticks.aim.homeY = am.y;
    for (const k in sticks) {
      const s = sticks[k];
      if (!s.active) { s.ox = s.homeX; s.oy = s.homeY; s.drawX = s.homeX; s.drawY = s.homeY; }
      // a held stick keeps its origin until the thumb lifts: moving it would deflect the stick under a still thumb
    }
  }

  // Where the base is drawn: the logical origin, nudged so the whole ring stays on screen.
  // The offset applies to the knob too, so the picture still matches the deflection.
  function basePos(s) {
    const pad = 12;
    return {
      x: clamp(s.ox, insets.l + R + pad, Math.max(insets.l + R + pad, W - insets.r - R - pad)),
      y: clamp(s.oy, insets.t + R + pad, Math.max(insets.t + R + pad, H - insets.b - R - pad)),
    };
  }

  function zoneAt(x, y) {
    for (const k of ['move', 'aim']) { const z = zones[k]; if (x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1) return k; }
    return null;
  }

  function bind(s, id, x, y) {
    s.active = true; s.id = id; s.t0 = now(); s.travel = 0; s.fired = false;
    s.sx = x; s.sy = y;
    // fixed: only a touch on or near the drawn base grabs it; anything farther floats a base for this touch
    s.floating = cfg.mode !== 'fixed' || Math.hypot(x - s.homeX, y - s.homeY) > R * 1.25;
    if (s.floating) { s.ox = x; s.oy = y; } else { s.ox = s.homeX; s.oy = s.homeY; }
    s.px = x; s.py = y; s.hasDir = false; s.hadDir = false; s.firing = false; s.angVel = 0;
    follow(s);
  }

  function release(s, allowTap) {
    if (!s.active) return;
    if (s.role === 'aim' && allowTap) {
      const dt = now() - s.t0;
      if (dt <= cfg.tapMs) {
        // a flick is fast enough to cross the fire ring on its way out, so it may have fired
        if (cfg.tapShove && !s.fired && s.travel <= cfg.tapPx) shoves.push({ dir: null, kind: 'tap' });
        else if (cfg.flickShove && s.travel > cfg.tapPx && s.travel / Math.max(1, dt) >= 1.0) shoves.push({ dir: Math.atan2(s.py - s.sy, s.px - s.sx), kind: 'flick' });
      }
    }
    const b = basePos(s);
    s.drawX = b.x; s.drawY = b.y; s.relT = s.floating ? 0.15 : 0;
    s.active = false; s.id = null; s.fired = false; s.firing = false; s.hasDir = false; s.hadDir = false; s.mag = 0; s.floating = false;
    s.ox = s.homeX; s.oy = s.homeY; s.px = s.ox; s.py = s.oy;
  }

  function releaseAll() {
    release(sticks.move, false); release(sticks.aim, false);
    mouse.fire = false; padFire = false; mouseButtons = 0;
    for (const k in keys) keys[k] = false;
    for (const k in pressed) pressed[k] = false;
    debugTouches.clear();
    shoves.length = 0;
  }

  function follow(s) {
    if (!s.floating || !cfg.follow) return;
    const dx = s.px - s.ox, dy = s.py - s.oy, d = Math.hypot(dx, dy);
    if (d > R) { const k = (d - R) / d; s.ox += dx * k; s.oy += dy * k; }
  }

  // ---- touch
  function reconcile(list) {
    const live = new Set();
    for (let i = 0; i < list.length; i++) live.add(list[i].identifier);
    for (const k in sticks) { const s = sticks[k]; if (s.active && !live.has(s.id)) release(s, false); }
    for (const id of debugTouches.keys()) if (!live.has(id)) debugTouches.delete(id);
  }
  function onTouchStart(e) {
    if (e.cancelable) e.preventDefault();
    if (!enabled) return;
    source = 'touch';
    reconcile(e.touches); // free any stick whose finger vanished before binding the new ones
    for (const t of e.changedTouches) {
      const role = zoneAt(t.clientX, t.clientY);
      debugTouches.set(t.identifier, { x: t.clientX, y: t.clientY, role: role || 'none' });
      if (!role) continue;
      const s = sticks[role];
      if (s.active) continue; // that thumb is already down
      bind(s, t.identifier, t.clientX, t.clientY);
    }
  }
  function onTouchMove(e) {
    if (e.cancelable) e.preventDefault();
    reconcile(e.touches);
    for (const t of e.changedTouches) {
      const d = debugTouches.get(t.identifier);
      if (d) { d.x = t.clientX; d.y = t.clientY; }
      for (const k in sticks) {
        const s = sticks[k];
        if (s.id !== t.identifier || !s.active) continue;
        s.px = t.clientX; s.py = t.clientY;
        s.travel = Math.max(s.travel, Math.hypot(s.px - s.sx, s.py - s.sy));
        follow(s);
      }
    }
  }
  function onTouchEnd(e) {
    if (e.cancelable) e.preventDefault();
    const cancel = e.type === 'touchcancel';
    for (const t of e.changedTouches) {
      debugTouches.delete(t.identifier);
      for (const k in sticks) { const s = sticks[k]; if (s.active && s.id === t.identifier) release(s, !cancel); }
    }
    reconcile(e.touches);
  }

  // ---- mouse / pen
  // Chorded buttons only send pointermove, so the state comes from e.buttons, not e.button.
  function syncButtons(e) {
    const b = e.buttons | 0;
    mouse.fire = enabled && (b & 1) !== 0;
    if (enabled && (b & 2) && !(mouseButtons & 2)) shoves.push({ dir: null, kind: 'mouse' });
    mouseButtons = b;
  }
  function onPointerDown(e) {
    if (e.pointerType === 'touch' || !enabled) return;
    source = 'mouse';
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    syncButtons(e);
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    if (Math.abs(e.clientX - mouse.x) + Math.abs(e.clientY - mouse.y) > 1) source = 'mouse';
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    if ((e.buttons | 0) !== mouseButtons) syncButtons(e);
  }
  function onPointerUp(e) {
    if (e.pointerType === 'touch') return;
    if (e.type === 'pointercancel') { mouse.fire = false; mouseButtons = 0; return; }
    syncButtons(e);
  }

  function onKey(e, down) {
    const k = e.code;
    if (down && !e.repeat && enabled) {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyR', 'KeyQ', 'KeyE', 'KeyF', 'KeyH', 'KeyG', 'KeyC'].includes(k)) source = 'mouse';
      if (k === 'Space') shoves.push({ dir: null, kind: 'key' });
      if (k === 'KeyR') press('reload');
      if (k === 'KeyQ' || k === 'Tab') press('swap');
      if (k === 'KeyH' || k === 'Digit1') press('med');
      if (k === 'KeyC' || k === 'Digit3') press('pills');
      if (k === 'KeyG' || k === 'Digit2') press('bomb');
      if (k === 'Escape' || k === 'KeyP') press('pause');
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k) && document.body.classList.contains('playing')) e.preventDefault();
    keys[k] = down;
  }

  function attach(canvas) {
    el = canvas;
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') mouse.inside = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, (e) => e.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
    window.addEventListener('blur', releaseAll);
    window.addEventListener('pagehide', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) { mouse.fire = false; mouseButtons &= ~1; } });
  }

  // A thumb that lands near the edge of the glass has less than a stick radius left to push into.
  // Past the dead zone, travel toward that edge is stretched so reaching the edge reads as (nearly)
  // a full push. Only the strength is stretched: the direction is still where the thumb really is.
  function pushLen(s, dx, dy) {
    if (!s.floating) return Math.hypot(dx, dy);
    const dz = R * (s.role === 'aim' ? cfg.aimDead : cfg.moveDead);
    const st = (room, v) => {
      const a = Math.abs(v);
      return room >= R || a <= dz ? a : dz + ((a - dz) * R) / Math.max(room, R * 0.4);
    };
    return Math.hypot(st(dx > 0 ? W - s.ox : s.ox, dx), st(dy > 0 ? H - s.oy : s.oy, dy));
  }

  function computeStick(s, dt) {
    if (!s.active) { s.mag = 0; s.x = 0; s.y = 0; s.hasDir = false; s.hadDir = false; s.firing = false; s.angVel = 0; return; }
    const dx = s.px - s.ox, dy = s.py - s.oy;
    const d = Math.hypot(dx, dy);
    s.mag = Math.min(pushLen(s, dx, dy) / R, 1);
    if (s.role === 'move') {
      if (d > 0.5) s.ang = Math.atan2(dy, dx);
      let t = clamp((s.mag - cfg.moveDead) / Math.max(0.01, cfg.moveSat - cfg.moveDead), 0, 1);
      if (t > 0) t = cfg.moveMin + (1 - cfg.moveMin) * Math.pow(t, cfg.moveCurve);
      s.x = Math.cos(s.ang) * t; s.y = Math.sin(s.ang) * t;
      s.hasDir = t > 0;
    } else {
      // The angle only updates outside the dead zone, so the light never flickers on thumb noise.
      const was = s.hasDir;
      s.hasDir = s.mag >= cfg.aimDead || (was && s.mag >= cfg.aimDead * 0.75);
      if (s.hasDir) {
        const a = Math.atan2(dy, dx);
        if (was) {
          // skip near-zero intervals: they read as 'no motion' and would drag the estimate down
          if (dt > 0.004) {
            let da = a - s.prevAng; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
            s.angVel = s.angVel * 0.6 + (Math.abs(da) / dt) * 0.4;
            s.prevAng = a;
          }
        } else { s.angVel = 0; s.prevAng = a; }
        s.ang = a; s.hadDir = true;
      } else s.angVel = 0;
      if (cfg.fireMode === 'any') s.firing = s.hasDir;
      else if (cfg.fireMode === 'auto') s.firing = false; // the game decides (needs a target)
      else s.firing = s.hasDir && (s.mag >= cfg.fireAt || (s.firing && s.mag >= cfg.fireAt - cfg.fireHys));
      if (s.firing) s.fired = true;
    }
  }

  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let p = null;
    for (const g of pads) if (g && g.connected) { p = g; if (g.mapping === 'standard') break; }
    if (!p) return null;
    const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.35));
    const edge = (i) => b(i) && !padPrev[i];
    const out = { lx: p.axes[0] || 0, ly: p.axes[1] || 0, rx: p.axes[2] || 0, ry: p.axes[3] || 0, rt: p.buttons[7] ? p.buttons[7].value : 0 };
    if (edge(4) || edge(5)) shoves.push({ dir: null, kind: 'pad' });
    if (edge(2)) press('reload');
    if (edge(3)) press('swap');
    if (edge(0)) press('use');
    if (edge(1)) press('med');
    if (edge(12) || edge(6)) press('bomb');
    if (edge(13)) press('pills');
    if (edge(9)) press('pause');
    padPrev = p.buttons.map((_, i) => b(i));
    const any = Math.hypot(out.lx, out.ly) > 0.3 || Math.hypot(out.rx, out.ry) > 0.3 || out.rt > 0.2 || padPrev.some(Boolean);
    if (any) source = 'pad';
    return out;
  }

  function update() {
    const t = now();
    const dt = Math.min(0.1, (t - lastFrame) / 1000); lastFrame = t;
    computeStick(sticks.move, dt);
    computeStick(sticks.aim, dt);
    for (const k in sticks) if (sticks[k].relT > 0) sticks[k].relT -= dt;
    const pad = pollPad();

    let mx = 0, my = 0;
    if (sticks.move.active) { mx = sticks.move.x; my = sticks.move.y; }
    else if (pad && Math.hypot(pad.lx, pad.ly) > 0.15) {
      const m = Math.hypot(pad.lx, pad.ly);
      let k = clamp((m - 0.15) / 0.7, 0, 1); k = cfg.moveMin + (1 - cfg.moveMin) * k;
      mx = (pad.lx / m) * k; my = (pad.ly / m) * k;
    } else {
      const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      const ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
      if (kx || ky) { const m = Math.hypot(kx, ky); mx = kx / m; my = ky / m; }
    }
    move.x = mx; move.y = my; move.mag = Math.min(1, Math.hypot(mx, my));

    aim.active = false; aim.firing = false; aim.wantsFire = false; aim.worldTarget = false; aim.mag = 0; aim.angVel = 0;
    if (sticks.aim.active) {
      aim.source = 'touch';
      if (sticks.aim.hasDir) {
        aim.active = true; aim.ang = sticks.aim.ang; aim.mag = sticks.aim.mag; aim.firing = sticks.aim.firing; aim.angVel = sticks.aim.angVel;
        aim.wantsFire = cfg.fireMode === 'auto';
      } else if (sticks.aim.hadDir) {
        // thumb resting back near the centre: hold the last direction, don't fire
        aim.active = true; aim.ang = sticks.aim.ang; aim.mag = 0.5;
      }
    } else if (pad && source === 'pad' && (Math.hypot(pad.rx, pad.ry) > 0.25 || pad.rt > 0.3)) {
      aim.source = 'pad';
      const m = Math.hypot(pad.rx, pad.ry);
      if (m > 0.25) { aim.active = true; aim.ang = Math.atan2(pad.ry, pad.rx); aim.mag = Math.min(1, m); }
      const ring = cfg.fireMode === 'any' ? 0.25 : cfg.fireAt;
      padFire = pad.rt > 0.3 || (cfg.fireMode !== 'auto' && (m >= ring || (padFire && m >= ring - cfg.fireHys)));
      aim.firing = padFire && aim.active;
      aim.wantsFire = cfg.fireMode === 'auto' && aim.active;
    } else if (source === 'mouse' && mouse.inside) {
      aim.source = 'mouse';
      aim.active = true; aim.worldTarget = true; aim.firing = mouse.fire;
    } else aim.source = 'none';
  }

  // ---- drawing (CSS px, on top of the scene)
  function draw(ctx, opts) {
    const t = opts.time || 0;
    for (const k in sticks) {
      const s = sticks[k];
      const isAim = s.role === 'aim';
      const ring = isAim && cfg.fireMode === 'ring';
      if (!s.active) {
        let bx = s.homeX, by = s.homeY;
        if (s.relT > 0) { const u = 1 - s.relT / 0.15; bx = s.drawX + (s.homeX - s.drawX) * u; by = s.drawY + (s.homeY - s.drawY) * u; }
        if (!opts.showGhost) continue; // mouse, keys and pad: no touch sticks on screen (the Shove button dims instead)
        if (isAim && opts.shoveBlocked > 0) {
          // a tap-shove on cooldown: flash the ring as it slides back from where the thumb was
          ctx.save(); ctx.globalAlpha = Math.min(1, opts.shoveBlocked * 4); ringP(ctx, bx, by, R + 4, '#ff4b2f', 3); ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = cfg.mode === 'fixed' ? 0.34 : 0.22;
        ringP(ctx, bx, by, R, '#ece8df', 2);
        if (ring) dashed(ctx, bx, by, R * cfg.fireAt, '#ff7a2f');
        disc(ctx, bx, by, R * 0.45, 'rgba(236,232,223,.5)');
        if (isAim) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - 8, by); ctx.lineTo(bx + 8, by); ctx.moveTo(bx, by - 8); ctx.lineTo(bx, by + 8); ctx.stroke(); }
        if (opts.labels) {
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = '#ece8df';
          ctx.font = '700 12px "Barlow Condensed", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(isAim ? (ring ? 'AIM · PAST RING = FIRE' : 'AIM + FIRE') : 'MOVE', bx, by - R - 10);
        }
        ctx.restore();
        continue;
      }
      const b = basePos(s), ox = b.x, oy = b.y;
      const kx = ox + Math.cos(s.ang) * Math.min(s.mag, 1) * R;
      const ky = oy + Math.sin(s.ang) * Math.min(s.mag, 1) * R;
      ctx.save();
      ctx.globalAlpha = 0.45;
      disc(ctx, ox, oy, R, 'rgba(10,12,18,.6)');
      ringP(ctx, ox, oy, R, '#ece8df', 2);
      ctx.globalAlpha = 1;
      if (ring) {
        ctx.globalAlpha = s.firing ? 0.95 : 0.65;
        dashed(ctx, ox, oy, R * cfg.fireAt, s.firing ? '#ff4b2f' : '#ff7a2f');
        ctx.globalAlpha = 1;
      }
      if (!isAim && cfg.moveDead > 0) { ctx.globalAlpha = 0.22; ringP(ctx, ox, oy, R * cfg.moveDead, '#ece8df', 1); ctx.globalAlpha = 1; }
      if (isAim && !s.hasDir) { ctx.globalAlpha = 0.25; ringP(ctx, ox, oy, R * cfg.aimDead, '#ece8df', 1); ctx.globalAlpha = 1; }
      const col = isAim ? (s.firing || opts.autoFiring ? '#ff4b2f' : s.hasDir ? '#ffb26b' : '#ece8df') : '#ece8df';
      ctx.globalAlpha = 0.72;
      disc(ctx, kx, ky, R * 0.45, col);
      ctx.globalAlpha = 1;
      ringP(ctx, kx, ky, R * 0.45, 'rgba(0,0,0,.35)', 2);
      if (isAim && (s.firing || opts.autoFiring)) {
        ctx.globalAlpha = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 40));
        ringP(ctx, kx, ky, R * 0.45 + 5, '#ff4b2f', 3);
      }
      if (isAim && opts.shoveBlocked > 0) { ctx.globalAlpha = Math.min(1, opts.shoveBlocked * 4); ringP(ctx, ox, oy, R + 4, '#ff4b2f', 3); }
      ctx.restore();
    }
    if (opts.debug) {
      ctx.save();
      ctx.font = '500 11px ui-monospace, Menlo, monospace';
      for (const [id, p] of debugTouches) {
        ringP(ctx, p.x, p.y, 22, p.role === 'aim' ? '#ff7a2f' : p.role === 'move' ? '#6bd1ff' : '#888', 2);
        ctx.fillStyle = '#fff'; ctx.fillText(`#${id} ${p.role}`, p.x + 26, p.y - 4);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.setLineDash([4, 6]);
      for (const k of ['move', 'aim']) { const z = zones[k]; ctx.strokeRect(z.x0 + 1, z.y0 + 1, z.x1 - z.x0 - 2, z.y1 - z.y0 - 2); }
      ctx.restore();
    }
  }
  function ringP(ctx, x, y, r, col, w) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); }
  function disc(ctx, x, y, r, col) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
  function dashed(ctx, x, y, r, col) { ctx.save(); ctx.setLineDash([5, 5]); ringP(ctx, x, y, r, col, 2); ctx.restore(); }

  return {
    cfg, sticks, move, aim, mouse, keys, zones,
    attach, layout, update, draw, press, consume, takeShove, buzz, releaseAll,
    get R() { return R; },
    get source() { return source; },
    set source(v) { source = v; },
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (!v) releaseAll(); },
  };
})();
