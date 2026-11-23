/* L'Amor che Morde: drawing the theatre. Uses window.OperaState / OperaUtil from stage.js. */
(function () {
  'use strict';
  const S = window.OperaState;
  const U = window.OperaUtil;
  const { clamp, lerp, smooth, easeOut, easeIn, mixc, rgb, hash, mulberry } = U;
  const OPEN = S.OPEN;
  const FLOOR = S.FLOOR;
  const sx = S.sx;
  const TAU = Math.PI * 2;
  const INK = '#1b1016';
  const FONT_D = '"Playfair Display", "Bodoni 72", Didot, Georgia, serif';

  // ------------------------------------------------------------------ canvas + camera
  let cv, ctx, W = 0, H = 0, DPR = 1;
  const cam = { x: 960, y: 560, s: 1, tx: 960, ty: 560, ts: 1, portrait: false, base: 1, shake: 0 };
  let reduced = false;
  const caches = {};

  function setReduced(v) { reduced = !!v; }

  let thumb = false;
  function setThumb(v) { thumb = !!v; }
  function frameFor(t) {
    // the region of the world the camera wants to show
    if (thumb) return { x0: 286, x1: 1634, y0: 112, y1: 955, portrait: false };
    const portrait = W / H < 0.9;
    if (!portrait) {
      const narrow = W / H < 1.4;
      return { x0: 150, x1: 1770, y0: narrow ? 30 : 46, y1: 1086, portrait: false };
    }
    // portrait: follow the action across the stage, show the ceiling above for the surtitles
    let wsum = 0, xsum = 0;
    for (const w of ['livia', 'amadeo', 'velena', 'ossobuco']) {
      if (!U.charShown(w, t)) continue;
      const x = S.charX(w, t);
      if (x < -1.25 || x > 1.25) continue;
      const k = 0.25 + 2.0 * S.isSinging(w, t);
      wsum += k; xsum += k * sx(x);
    }
    const g = S.groupAt('dead', t);
    if (g.action === 'rise' || g.action === 'close') { wsum += 0.6; xsum += 0.6 * 960; }
    let cx = wsum > 0 ? xsum / wsum : 960;
    const half = 300;
    cx = clamp(cx, OPEN.l + half - 30, OPEN.r - half + 30);
    return { x0: cx - half, x1: cx + half, y0: 300, y1: 900, portrait: true };
  }

  function fit(fr) {
    const fw = fr.x1 - fr.x0, fh = fr.y1 - fr.y0;
    const s = Math.min(W / fw, H / fh);
    return { x: (fr.x0 + fr.x1) / 2, y: (fr.y0 + fr.y1) / 2 + (fr.portrait ? -40 : 0), s };
  }

  function resize(w, h, dpr) {
    W = w; H = h; DPR = dpr;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const f = fit(frameFor(0));
    cam.x = cam.tx = f.x; cam.y = cam.ty = f.y; cam.s = cam.ts = f.s;
    cam.portrait = W / H < 0.9;
    cam.base = f.s;
    buildCaches();
  }

  function updateCamera(t, dt) {
    const f = fit(frameFor(t));
    cam.portrait = W / H < 0.9;
    cam.tx = f.x; cam.ty = f.y; cam.ts = f.s;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 1.6);
    cam.x = lerp(cam.x, cam.tx, k); cam.y = lerp(cam.y, cam.ty, k); cam.s = lerp(cam.s, cam.ts, k);
    if (dt > 0.5 || dt <= 0) { cam.x = cam.tx; cam.y = cam.ty; cam.s = cam.ts; }
  }

  function applyCam(c) {
    let ox = 0, oy = 0;
    if (cam.shake > 0 && !reduced) { ox = (Math.random() - 0.5) * cam.shake * 6; oy = (Math.random() - 0.5) * cam.shake * 4; }
    c.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * (W / 2 - cam.x * cam.s + ox), DPR * (H / 2 - cam.y * cam.s + oy));
  }
  function toScreen(x, y) { return [W / 2 + (x - cam.x) * cam.s, H / 2 + (y - cam.y) * cam.s]; }
  function toWorld(px, py) { return [(px - W / 2) / cam.s + cam.x, (py - H / 2) / cam.s + cam.y]; }

  // ------------------------------------------------------------------ cached layers
  function makeLayer(x0, y0, x1, y1, draw, q) {
    const sc = Math.min(cam.base * DPR * (q || 1), 4096 / (x1 - x0), 4096 / (y1 - y0), Math.sqrt(12e6 / ((x1 - x0) * (y1 - y0))));
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil((x1 - x0) * sc)); c.height = Math.max(2, Math.ceil((y1 - y0) * sc));
    const g = c.getContext('2d');
    g.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
    draw(g);
    return { c, x0, y0, w: x1 - x0, h: y1 - y0 };
  }
  function blit(c, L) { c.drawImage(L.c, L.x0, L.y0, L.w, L.h); }

  // the auditorium with the house lights down: darkened, with the stage's glow spilling onto it
  function darken(draw, x0, y0, x1, y1, amount) {
    return (g) => {
      draw(g);
      g.save();
      g.fillStyle = `rgba(4,2,8,${amount})`;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = radial(g, 960, 520, 150, 1150, [[0, 'rgba(255,190,150,0.13)'], [0.5, 'rgba(200,120,110,0.05)'], [1, 'rgba(0,0,0,0)']]);
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.restore();
    };
  }
  function drawStatic(g) { drawHouseStatic(g); drawProscenium(g); drawPitStatic(g); }
  function buildCaches() {
    const portrait = W / H < 0.9;
    const hx0 = -260, hy0 = portrait ? -480 : -160, hx1 = 2180, hy1 = 1240;
    caches.house = makeLayer(hx0, hy0, hx1, hy1, drawStatic);
    caches.houseDark = makeLayer(hx0, hy0, hx1, hy1, (g) => { darken(drawStatic, hx0, hy0, hx1, hy1, 0.86)(g); drawPitLamps(g); });
    caches.valance = makeLayer(OPEN.l - 6, OPEN.t - 14, OPEN.r + 6, OPEN.t + 92, drawValance);
    caches.piazza = makeLayer(OPEN.l, OPEN.t, OPEN.r, OPEN.b, drawPiazza);
    caches.grave = makeLayer(OPEN.l, OPEN.t, OPEN.r, OPEN.b, drawGraveyard);
  }
  function blitHouse(c, lit, dark, house) {
    if (house >= 0.99) blit(c, lit);
    else if (house <= 0.01) blit(c, dark);
    else { blit(c, dark); c.globalAlpha = house; blit(c, lit); c.globalAlpha = 1; }
  }

  // ------------------------------------------------------------------ drawing helpers
  function path(c, pts, close) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    if (close) c.closePath();
  }
  function fillStroke(c, fill, stroke, lw) {
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function ellipse(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU); }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); }
  function vgrad(c, y0, y1, stops) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  }
  function hgrad(c, x0, x1, stops) {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  }
  function radial(c, x, y, r0, r1, stops) {
    const g = c.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  }
  const GOLD = (c, x0, x1) => hgrad(c, x0, x1, [[0, '#6e4c16'], [0.25, '#e3c06a'], [0.5, '#fbe7a6'], [0.75, '#c99a3c'], [1, '#5f3f10']]);
  const GOLDV = (c, y0, y1) => vgrad(c, y0, y1, [[0, '#6e4c16'], [0.3, '#f0d48a'], [0.55, '#fff0bd'], [0.8, '#b98a33'], [1, '#5a3b0e']]);

  // a tiny skull, the house emblem
  function skull(c, x, y, r, col, eye) {
    c.save(); c.translate(x, y);
    c.fillStyle = col;
    ellipse(c, 0, -r * 0.15, r, r * 0.92); c.fill();
    c.fillRect(-r * 0.55, r * 0.45, r * 1.1, r * 0.55);
    c.fillStyle = eye;
    ellipse(c, -r * 0.38, -r * 0.08, r * 0.27, r * 0.3); c.fill();
    ellipse(c, r * 0.38, -r * 0.08, r * 0.27, r * 0.3); c.fill();
    path(c, [0, r * 0.18, -r * 0.12, r * 0.42, r * 0.12, r * 0.42], true); c.fill();
    c.fillRect(-r * 0.4, r * 0.62, r * 0.8, r * 0.07);
    c.restore();
  }
  function rosette(c, x, y, r) {
    c.save(); c.translate(x, y);
    for (let i = 0; i < 8; i++) {
      c.rotate(TAU / 8);
      ellipse(c, r * 0.55, 0, r * 0.45, r * 0.22); c.fillStyle = '#e6c36f'; c.fill();
    }
    circle(c, 0, 0, r * 0.32); c.fillStyle = '#8a6320'; c.fill();
    c.restore();
  }

  // ------------------------------------------------------------------ the house (static)
  function damask(c, x0, y0, x1, y1, base, dark) {
    c.fillStyle = base; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.fillStyle = dark;
    for (let y = y0; y < y1; y += 56) {
      for (let x = x0 + ((y / 56) % 2 ? 28 : 0); x < x1; x += 56) {
        c.save(); c.translate(x, y);
        ellipse(c, 0, 0, 7, 13); c.fill();
        ellipse(c, 0, -14, 3, 5); c.fill();
        ellipse(c, -9, 6, 6, 3, 0.6); c.fill();
        ellipse(c, 9, 6, 6, 3, -0.6); c.fill();
        c.restore();
      }
    }
  }

  function boxTier(c, x0, x1, y, side, seed) {
    // a curved gold balustrade with a dark box behind it and a couple of patrons
    const r = mulberry(seed);
    c.fillStyle = '#16070a'; c.fillRect(x0, y - 150, x1 - x0, 150);
    // patrons
    for (let k = 0; k < 2; k++) {
      const px = lerp(x0 + 40, x1 - 40, k === 0 ? 0.3 : 0.72) + (r() - 0.5) * 20;
      const py = y - 52 - r() * 10;
      c.fillStyle = '#05020a';
      ellipse(c, px, py + 34, 34, 26); c.fill();
      circle(c, px, py, 20); c.fill();
      const kind = Math.floor(r() * 4);
      if (kind === 0) { c.fillRect(px - 14, py - 40, 28, 26); c.fillRect(px - 22, py - 16, 44, 5); }      // top hat
      if (kind === 1) { ellipse(c, px, py - 20, 14, 18); c.fill(); }                                         // beehive
      if (kind === 2) { c.fillStyle = '#41612f'; circle(c, px + 8 * side, py - 2, 3); c.fill(); }             // a zombie's eye
      if (kind === 3) { c.save(); c.translate(px + 10 * side, py - 8); c.rotate(side * 0.5); c.fillStyle = '#05020a'; c.fillRect(-2, -26, 4, 26); c.fillRect(-9, -26, 14, 9); c.restore(); } // an axe
    }
    // balustrade front
    c.beginPath();
    c.moveTo(x0, y - 36); c.quadraticCurveTo((x0 + x1) / 2, y - 22, x1, y - 36);
    c.lineTo(x1, y + 22); c.quadraticCurveTo((x0 + x1) / 2, y + 40, x0, y + 22); c.closePath();
    c.fillStyle = vgrad(c, y - 36, y + 40, [[0, '#8e1d24'], [0.5, '#5a0e14'], [1, '#33060a']]); c.fill();
    c.lineWidth = 7; c.strokeStyle = GOLDV(c, y - 44, y - 28);
    c.beginPath(); c.moveTo(x0, y - 36); c.quadraticCurveTo((x0 + x1) / 2, y - 22, x1, y - 36); c.stroke();
    c.lineWidth = 4; c.strokeStyle = '#b98a33';
    c.beginPath(); c.moveTo(x0, y + 22); c.quadraticCurveTo((x0 + x1) / 2, y + 40, x1, y + 22); c.stroke();
    for (let k = 1; k < 4; k++) rosette(c, lerp(x0, x1, k / 4), y + 4 + Math.sin(k / 4 * Math.PI) * 10, 7);
  }

  function chandelier(c, x, y) {
    c.save(); c.translate(x, y);
    c.strokeStyle = '#7a5a20'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -420); c.lineTo(0, -60); c.stroke();
    for (let tier = 0; tier < 3; tier++) {
      const ry = tier * 46, rw = 150 - tier * 38;
      c.lineWidth = 6; c.strokeStyle = GOLD(c, -rw, rw);
      ellipse(c, 0, ry, rw, 16); c.stroke();
      for (let k = 0; k < 9 - tier * 2; k++) {
        const a = (k + 0.5) / (9 - tier * 2) * Math.PI;
        const px = Math.cos(a) * rw, py = ry + Math.sin(a) * 16;
        c.fillStyle = 'rgba(220,235,255,0.65)';
        ellipse(c, px, py + 16, 4, 11); c.fill();
        c.fillStyle = '#f3e7c6'; c.fillRect(px - 3, py - 18, 6, 16);
      }
    }
    c.fillStyle = GOLD(c, -30, 30);
    ellipse(c, 0, 150, 26, 36); c.fill();
    c.restore();
  }

  function drawHouseStatic(c) {
    // walls and gallery
    damask(c, -260, -480, 2180, 1240, '#4a0b12', 'rgba(20,0,4,0.35)');
    // gallery tiers above the proscenium
    for (let k = 0; k < 3; k++) {
      const y = -380 + k * 150;
      c.fillStyle = '#18060a'; c.fillRect(-260, y, 2440, 110);
      for (let i = 0; i < 26; i++) {
        const px = -240 + i * 96 + (k % 2) * 40;
        c.fillStyle = '#07020a'; circle(c, px, y + 70, 18); c.fill(); ellipse(c, px, y + 104, 30, 20); c.fill();
      }
      c.beginPath(); c.moveTo(-260, y + 96); c.quadraticCurveTo(960, y + 150, 2180, y + 96);
      c.lineTo(2180, y + 140); c.quadraticCurveTo(960, y + 194, -260, y + 140); c.closePath();
      c.fillStyle = vgrad(c, y + 96, y + 194, [[0, '#7c1820'], [1, '#2c0508']]); c.fill();
      c.lineWidth = 6; c.strokeStyle = '#c99a3c';
      c.beginPath(); c.moveTo(-260, y + 96); c.quadraticCurveTo(960, y + 150, 2180, y + 96); c.stroke();
    }
    chandelier(c, 960, -150);
    // side boxes, three tiers each side
    for (let k = 0; k < 3; k++) {
      const y = 330 + k * 205;
      boxTier(c, -250, 196, y, 1, 11 + k);
      boxTier(c, 1724, 2170, y, -1, 21 + k);
    }
    // pilasters between boxes and proscenium
    for (const x of [180, 1702]) {
      c.fillStyle = GOLD(c, x, x + 38); c.fillRect(x, 90, 38, 760);
      c.fillStyle = 'rgba(80,50,10,0.5)';
      for (let k = 0; k < 4; k++) c.fillRect(x + 6 + k * 8, 130, 3, 680);
    }
    // the apron, stage front, pit walls
    c.fillStyle = '#120608'; c.fillRect(-260, 800, 2440, 460);
  }

  function drawProscenium(c) {
    const o = OPEN;
    // the frame: thick gilded mouldings around the opening
    c.save();
    c.beginPath();
    c.rect(236, 128, 1448, 672);
    c.rect(o.l, o.t, o.r - o.l, o.b - o.t);
    c.fillStyle = '#9c7425';
    c.fill('evenodd');
    // bands of moulding
    const bands = [[0, '#5d3e0f'], [6, '#f6dc94'], [14, '#c4943a'], [26, '#7a5518'], [34, '#f2d384'], [46, '#a37a2c'], [58, '#6a4914']];
    for (let i = 0; i < bands.length; i++) {
      const d = bands[i][0];
      c.strokeStyle = bands[i][1]; c.lineWidth = 7;
      c.beginPath(); c.moveTo(236 + d + 3, 800); c.lineTo(236 + d + 3, 128 + d + 3); c.lineTo(1684 - d - 3, 128 + d + 3); c.lineTo(1684 - d - 3, 800); c.stroke();
    }
    // inner reveal (depth) of the opening
    c.fillStyle = hgrad(c, o.l - 24, o.l, [[0, '#4d3410'], [1, '#1a0f04']]); c.fillRect(o.l - 24, o.t - 24, 24, o.b - o.t + 24);
    c.fillStyle = hgrad(c, o.r, o.r + 24, [[0, '#1a0f04'], [1, '#4d3410']]); c.fillRect(o.r, o.t - 24, 24, o.b - o.t + 24);
    c.fillStyle = vgrad(c, o.t - 24, o.t, [[0, '#4d3410'], [1, '#1a0f04']]); c.fillRect(o.l - 24, o.t - 24, o.r - o.l + 48, 24);
    // ornaments along the top band
    for (let x = 300; x <= 1620; x += 66) {
      if (Math.abs(x - 960) < 170) continue;
      skull(c, x, 168, 9, '#f0d48a', '#4a3210');
    }
    for (let y = 250; y <= 760; y += 70) { rosette(c, 268, y, 10); rosette(c, 1652, y, 10); }
    // corner blocks
    for (const [x, y] of [[268, 160], [1652, 160]]) {
      c.fillStyle = GOLD(c, x - 26, x + 26); c.fillRect(x - 26, y - 26, 52, 52);
      rosette(c, x, y, 16);
    }
    // the crest: a cartouche with a crowned skull and a ribbon
    c.save(); c.translate(960, 136);
    ellipse(c, 0, 0, 138, 82); c.fillStyle = GOLD(c, -138, 138); c.fill();
    ellipse(c, 0, 0, 120, 66); c.fillStyle = '#3a0a10'; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#f6dc94'; ellipse(c, 0, 0, 120, 66); c.stroke();
    skull(c, 0, -6, 30, '#f3e3b8', '#3a0a10');
    // laurel
    c.strokeStyle = '#d9b45a'; c.lineWidth = 3;
    for (const s of [-1, 1]) {
      c.beginPath(); c.arc(0, -4, 46, s > 0 ? -0.2 : Math.PI + 0.2, s > 0 ? 1.4 : Math.PI - 1.4, s < 0); c.stroke();
      for (let k = 0; k < 6; k++) {
        const a = (s > 0 ? -0.1 : Math.PI + 0.1) + s * k * 0.26;
        ellipse(c, Math.cos(a) * 46, -4 + Math.sin(a) * 46, 8, 3.5, a + s * 1.2); c.fillStyle = '#d9b45a'; c.fill();
      }
    }
    // crown
    c.fillStyle = '#f0c95a';
    path(c, [-22, -38, -22, -52, -12, -44, 0, -58, 12, -44, 22, -52, 22, -38], true); c.fill();
    c.restore();
    // ribbon with the title
    c.save(); c.translate(960, 188);
    c.fillStyle = '#7d121b';
    path(c, [-190, -16, 190, -16, 210, 0, 190, 16, -190, 16, -210, 0], true); c.fill();
    c.strokeStyle = '#f2d384'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#f7e2a4'; c.font = `700 22px ${FONT_D}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('TEATRO DEI MORTI', 0, 1);
    c.restore();
    // apron edge and footlight hoods
    c.fillStyle = vgrad(c, o.b, o.b + 22, [[0, '#2a1608'], [1, '#0e0603']]); c.fillRect(236, o.b, 1448, 22);
    c.fillStyle = GOLDV(c, o.b - 2, o.b + 4); c.fillRect(236, o.b - 2, 1448, 5);
    for (let x = o.l + 24; x < o.r; x += 44) {
      c.beginPath(); c.moveTo(x - 15, o.b + 4); c.quadraticCurveTo(x, o.b - 16, x + 15, o.b + 4); c.closePath();
      c.fillStyle = '#2f2a24'; c.fill(); c.strokeStyle = '#8b6a2a'; c.lineWidth = 1.5; c.stroke();
    }
    c.restore();
  }

  function drawValance(c) {
    const o = OPEN;
    // the valance: a swagged pelmet across the top of the opening
    const vy = o.t;
    for (let k = 0; k < 6; k++) {
      const x0 = o.l + (o.r - o.l) * k / 6, x1 = o.l + (o.r - o.l) * (k + 1) / 6;
      c.beginPath(); c.moveTo(x0, vy - 2); c.lineTo(x1, vy - 2);
      c.quadraticCurveTo((x0 + x1) / 2, vy + 82, x0, vy - 2);
      c.fillStyle = vgrad(c, vy, vy + 60, [[0, '#6e0b14'], [0.6, '#a0141f'], [1, '#5a0710']]); c.fill();
      c.strokeStyle = '#e8c56a'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(x1, vy - 2); c.quadraticCurveTo((x0 + x1) / 2, vy + 82, x0, vy - 2); c.stroke();
      // tassel
      c.fillStyle = '#e8c56a';
      c.fillRect(x0 - 3, vy, 6, 26); ellipse(c, x0, vy + 32, 7, 10); c.fill();
    }
    c.fillStyle = vgrad(c, vy - 10, vy + 14, [[0, '#7d0f18'], [1, '#4c0a10']]); c.fillRect(o.l - 4, vy - 10, o.r - o.l + 8, 22);
    c.strokeStyle = '#e8c56a'; c.lineWidth = 3; c.beginPath(); c.moveTo(o.l, vy + 12); c.lineTo(o.r, vy + 12); c.stroke();
  }

  function drawPitStatic(c) {
    // the pit's back wall (the stage front) and its rail
    c.fillStyle = vgrad(c, 800, 905, [[0, '#0a0406'], [1, '#150709']]); c.fillRect(150, 800, 1620, 105);
    // rail
    c.fillStyle = vgrad(c, 902, 945, [[0, '#4a1a10'], [0.3, '#2a0c07'], [1, '#120403']]); c.fillRect(150, 902, 1620, 43);
    c.fillStyle = GOLDV(c, 898, 906); c.fillRect(150, 898, 1620, 7);
  }

  // ------------------------------------------------------------------ scenery: Act I
  function cobbles(c, y0, y1, col1, col2) {
    c.fillStyle = vgrad(c, y0, y1, [[0, col1], [1, col2]]); c.fillRect(OPEN.l, y0, OPEN.r - OPEN.l, y1 - y0);
    c.strokeStyle = 'rgba(60,40,30,0.35)'; c.lineWidth = 1.2;
    for (let row = 0; row < 9; row++) {
      const y = y0 + (y1 - y0) * Math.pow(row / 9, 1.25);
      const h = (y1 - y0) / 9 * (0.6 + row * 0.12);
      c.beginPath(); c.moveTo(OPEN.l, y); c.lineTo(OPEN.r, y); c.stroke();
      const step = 26 + row * 6;
      for (let x = OPEN.l + (row % 2) * step / 2; x < OPEN.r; x += step) {
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (x - 960) * 0.04, y + h); c.stroke();
      }
    }
  }

  function house(c, x0, x1, ytop, col, shut, seed, side) {
    const r = mulberry(seed);
    c.fillStyle = col; c.fillRect(x0, ytop, x1 - x0, 780 - ytop);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(side > 0 ? x1 - 26 : x0, ytop, 26, 780 - ytop);
    // roof
    c.fillStyle = '#a4472a';
    path(c, [x0 - 14, ytop + 6, x1 + 14, ytop + 6, x1 + 6, ytop - 12, x0 - 6, ytop - 12], true); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    // windows with shutters
    const cols = Math.max(1, Math.floor((x1 - x0) / 90));
    for (let f = 0; f < 3; f++) {
      const wy = ytop + 40 + f * 120;
      if (wy > 680) break;
      for (let k = 0; k < cols; k++) {
        const wx = lerp(x0 + 40, x1 - 40, cols === 1 ? 0.5 : k / (cols - 1));
        c.fillStyle = '#2a1a1e'; c.fillRect(wx - 16, wy, 32, 52);
        c.fillStyle = shut; c.fillRect(wx - 30, wy - 2, 13, 56); c.fillRect(wx + 17, wy - 2, 13, 56);
        c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1;
        for (let s = 0; s < 6; s++) { c.beginPath(); c.moveTo(wx - 30, wy + 6 + s * 8); c.lineTo(wx - 17, wy + 6 + s * 8); c.moveTo(wx + 17, wy + 6 + s * 8); c.lineTo(wx + 30, wy + 6 + s * 8); c.stroke(); }
        if (f === 1) {
          // balcony with flowers
          c.fillStyle = '#3a2a22'; c.fillRect(wx - 34, wy + 52, 68, 6);
          c.strokeStyle = '#3a2a22'; c.lineWidth = 2;
          for (let b = 0; b < 7; b++) { c.beginPath(); c.moveTo(wx - 30 + b * 10, wy + 58); c.lineTo(wx - 30 + b * 10, wy + 76); c.stroke(); }
          c.fillRect(wx - 34, wy + 74, 68, 4);
          for (let b = 0; b < 5; b++) { c.fillStyle = ['#d8304a', '#f08a3c', '#f4d35e', '#d8304a', '#ea6f9a'][b]; circle(c, wx - 24 + b * 12, wy + 48 + r() * 4, 6); c.fill(); }
        }
      }
    }
    c.strokeStyle = INK; c.lineWidth = 2.5; c.strokeRect(x0, ytop, x1 - x0, 780 - ytop);
  }

  function drawPiazza(c) {
    const o = OPEN;
    c.fillStyle = vgrad(c, o.t, 650, [[0, '#4a2e6e'], [0.32, '#a64f78'], [0.62, '#ec8a62'], [1, '#f8cf74']]);
    c.fillRect(o.l, o.t, o.r - o.l, 650 - o.t);
    // the sun going down
    c.fillStyle = radial(c, 1230, 590, 10, 220, [[0, 'rgba(255,240,170,0.9)'], [0.3, 'rgba(255,200,120,0.35)'], [1, 'rgba(255,170,100,0)']]);
    c.fillRect(o.l, o.t, o.r - o.l, 440);
    circle(c, 1230, 590, 58); c.fillStyle = '#ffd789'; c.fill();
    // clouds
    c.fillStyle = 'rgba(255,190,190,0.55)';
    for (const [x, y, w] of [[480, 300, 160], [760, 270, 110], [1300, 320, 190], [1520, 280, 90]]) {
      ellipse(c, x, y, w, 13); c.fill(); ellipse(c, x + w * 0.25, y - 9, w * 0.45, 11); c.fill();
    }
    // far hills with a hill town
    c.fillStyle = '#a06882';
    c.beginPath(); c.moveTo(o.l, 610);
    for (let x = o.l; x <= o.r; x += 20) c.lineTo(x, 590 - 28 * Math.sin(x / 140) - 16 * Math.sin(x / 61 + 1));
    c.lineTo(o.r, 700); c.lineTo(o.l, 700); c.fill();
    c.fillStyle = '#8a5672';
    for (let k = 0; k < 9; k++) { const x = 1330 + k * 22; c.fillRect(x, 555 - (k % 3) * 8, 18, 30); }
    c.fillRect(1395, 512, 12, 50);
    // near hills, cypresses
    c.fillStyle = '#6a4466';
    c.beginPath(); c.moveTo(o.l, 640);
    for (let x = o.l; x <= o.r; x += 20) c.lineTo(x, 628 - 18 * Math.sin(x / 95 + 2));
    c.lineTo(o.r, 720); c.lineTo(o.l, 720); c.fill();
    c.fillStyle = '#2f3a2a';
    for (const x of [640, 672, 1240, 1270, 1500]) { ellipse(c, x, 600, 11, 46); c.fill(); }
    // houses (wings)
    house(c, o.l, o.l + 250, 330, '#d9a560', '#4b7a55', 3, 1);
    house(c, o.r - 250, o.r, 360, '#d88f7b', '#3f6a7a', 4, -1);
    // bell tower
    const bx0 = 640, bx1 = 732;
    c.fillStyle = '#d8c09a'; c.fillRect(bx0, 300, bx1 - bx0, 480);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(bx1 - 18, 300, 18, 480);
    c.fillStyle = '#2a1c1c'; c.beginPath(); c.moveTo(bx0 + 16, 380); c.lineTo(bx0 + 16, 322); c.arc((bx0 + bx1) / 2, 322, (bx1 - bx0) / 2 - 16, Math.PI, 0); c.lineTo(bx1 - 16, 380); c.fill();
    c.fillStyle = '#a4472a'; path(c, [bx0 - 10, 300, (bx0 + bx1) / 2, 236, bx1 + 10, 300], true); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
    c.strokeRect(bx0, 300, bx1 - bx0, 480);
    for (let y = 420; y < 760; y += 90) { c.fillStyle = '#2a1c1c'; c.fillRect((bx0 + bx1) / 2 - 7, y, 14, 30); }
    // the church facade
    const cx0 = 780, cx1 = 1140;
    c.fillStyle = vgrad(c, 330, 780, [[0, '#f2dfbd'], [1, '#d7b98d']]);
    path(c, [cx0, 780, cx0, 420, 960, 330, cx1, 420, cx1, 780], true); c.fill();
    c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
    c.strokeStyle = 'rgba(120,80,50,0.5)'; c.lineWidth = 2;
    path(c, [cx0 + 18, 440, 960, 356, cx1 - 18, 440]); c.stroke();
    for (const x of [cx0 + 60, cx1 - 60]) { c.fillStyle = 'rgba(160,120,80,0.35)'; c.fillRect(x - 8, 440, 16, 340); }
    // rose window
    c.save(); c.translate(960, 470);
    circle(c, 0, 0, 52); c.fillStyle = '#7a5a3a'; c.fill();
    circle(c, 0, 0, 44); c.fillStyle = radial(c, 0, 0, 4, 44, [[0, '#ffd88a'], [0.5, '#e0785a'], [1, '#6a3a6a']]); c.fill();
    c.strokeStyle = '#4a3020'; c.lineWidth = 3;
    for (let k = 0; k < 12; k++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(k * TAU / 12) * 44, Math.sin(k * TAU / 12) * 44); c.stroke(); }
    circle(c, 0, 0, 14); c.stroke(); circle(c, 0, 0, 44); c.stroke();
    c.restore();
    // portal
    c.fillStyle = '#3a2418'; c.beginPath(); c.moveTo(915, 780); c.lineTo(915, 640); c.arc(960, 640, 45, Math.PI, 0); c.lineTo(1005, 780); c.fill();
    c.strokeStyle = '#8a6a48'; c.lineWidth = 5; c.beginPath(); c.moveTo(905, 780); c.lineTo(905, 640); c.arc(960, 640, 55, Math.PI, 0); c.lineTo(1015, 780); c.stroke();
    // floral arch over the couple
    c.lineWidth = 10; c.strokeStyle = '#6b8f4e';
    c.beginPath(); c.moveTo(1020, 770); c.lineTo(1020, 610); c.arc(1110, 610, 90, Math.PI, 0); c.lineTo(1200, 770); c.stroke();
    const r = mulberry(8);
    for (let k = 0; k < 46; k++) {
      const a = k / 45;
      let px, py;
      if (a < 0.3) { px = 1020; py = 770 - a / 0.3 * 160; } else if (a > 0.7) { px = 1200; py = 610 + (a - 0.7) / 0.3 * 160; } else { const th = Math.PI + (a - 0.3) / 0.4 * Math.PI; px = 1110 + Math.cos(th) * 90; py = 610 + Math.sin(th) * 90; }
      c.fillStyle = ['#fff6f0', '#f7c4d4', '#ffffff', '#f2a3b8'][k % 4];
      circle(c, px + (r() - 0.5) * 8, py + (r() - 0.5) * 8, 6 + r() * 3); c.fill();
    }
    // bunting
    for (const [x0, y0, x1, y1] of [[o.l + 240, 380, 640, 330], [732, 330, 1140, 420], [1140, 420, o.r - 240, 400]]) {
      c.strokeStyle = '#3a2a22'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + 50, x1, y1); c.stroke();
      for (let k = 1; k < 10; k++) {
        const a = k / 10;
        const px = lerp(lerp(x0, (x0 + x1) / 2, a), lerp((x0 + x1) / 2, x1, a), a);
        const py = lerp(lerp(y0, Math.max(y0, y1) + 50, a), lerp(Math.max(y0, y1) + 50, y1, a), a);
        c.fillStyle = ['#2f8a4a', '#f4efe6', '#c8323c'][k % 3];
        path(c, [px - 8, py, px + 8, py, px, py + 20], true); c.fill();
      }
    }
    cobbles(c, 690, 780, '#b39070', '#8f6a50');
  }

  // ------------------------------------------------------------------ scenery: Acts II and III
  const GRAVES = [-0.86, -0.6, -0.36, -0.1, 0.62, 0.82, 0.98, 0.12];
  function tombstone(c, x, y, kind, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#7d869d'; c.strokeStyle = INK; c.lineWidth = 2.5 / s;
    if (kind === 0) { c.beginPath(); c.moveTo(-26, 0); c.lineTo(-26, -60); c.arc(0, -60, 26, Math.PI, 0); c.lineTo(26, 0); c.closePath(); }
    else if (kind === 1) { path(c, [-7, 0, -7, -60, -26, -60, -26, -74, -7, -74, -7, -96, 7, -96, 7, -74, 26, -74, 26, -60, 7, -60, 7, 0], true); }
    else if (kind === 2) { path(c, [-14, 0, -10, -110, 0, -126, 10, -110, 14, 0], true); }
    else { c.beginPath(); c.rect(-30, -56, 60, 56); }
    c.fill(); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    if (kind === 0 || kind === 3) { c.fillRect(-14, -44, 28, 3); c.fillRect(-14, -36, 22, 3); }
    c.restore();
  }
  function deadTree(c, x, y) {
    c.save(); c.translate(x, y);
    c.strokeStyle = '#131624'; c.lineCap = 'round';
    const branch = (len, ang, w, d) => {
      if (d > 5 || len < 8) return;
      c.lineWidth = w; c.beginPath(); c.moveTo(0, 0);
      const ex = Math.sin(ang) * len, ey = -Math.cos(ang) * len;
      c.quadraticCurveTo(ex * 0.5 + 8, ey * 0.5, ex, ey); c.stroke();
      c.save(); c.translate(ex, ey);
      branch(len * 0.72, ang - 0.5 - hash(d + len) * 0.3, w * 0.68, d + 1);
      branch(len * 0.66, ang + 0.45 + hash(d * 3 + len) * 0.3, w * 0.62, d + 1);
      c.restore();
    };
    branch(150, 0.12, 26, 0);
    c.restore();
  }
  function drawGraveyard(c) {
    const o = OPEN;
    c.fillStyle = vgrad(c, o.t, 660, [[0, '#060b22'], [0.55, '#14204a'], [1, '#2a3a6c']]);
    c.fillRect(o.l, o.t, o.r - o.l, 660 - o.t);
    // far hills with a ruined chapel
    c.fillStyle = '#141b38';
    c.beginPath(); c.moveTo(o.l, 640);
    for (let x = o.l; x <= o.r; x += 20) c.lineTo(x, 600 - 40 * Math.sin(x / 210 + 0.5) - 14 * Math.sin(x / 70));
    c.lineTo(o.r, 700); c.lineTo(o.l, 700); c.fill();
    c.fillStyle = '#0f1430';
    path(c, [430, 600, 430, 520, 470, 490, 510, 520, 510, 600], true); c.fill();
    c.fillRect(452, 440, 22, 80); path(c, [448, 440, 463, 410, 478, 440], true); c.fill();
    for (const x of [600, 628, 1180, 1215, 1460]) { c.fillStyle = '#0b0f22'; ellipse(c, x, 580, 13, 58); c.fill(); }
    // mausoleum
    c.fillStyle = '#4a5268'; c.fillRect(1400, 520, 190, 190);
    path(c, [1385, 524, 1495, 468, 1605, 524], true); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke(); c.strokeRect(1400, 520, 190, 190);
    for (const x of [1418, 1460, 1530, 1572]) { c.fillStyle = '#5d6680'; c.fillRect(x - 7, 530, 14, 175); }
    c.fillStyle = '#10131f'; c.fillRect(1474, 600, 42, 110);
    // the wall with an iron gate
    c.fillStyle = '#3d4459'; c.fillRect(o.l, 618, o.r - o.l, 52);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5;
    for (let x = o.l; x < o.r; x += 40) { c.beginPath(); c.moveTo(x, 618); c.lineTo(x, 670); c.stroke(); }
    c.beginPath(); c.moveTo(o.l, 644); c.lineTo(o.r, 644); c.stroke();
    c.fillStyle = '#10131f'; c.fillRect(905, 560, 110, 110);
    c.strokeStyle = '#1b1f2e'; c.lineWidth = 4;
    for (let x = 912; x < 1015; x += 14) { c.beginPath(); c.moveTo(x, 670); c.lineTo(x, 566); c.stroke(); path(c, [x - 4, 570, x, 556, x + 4, 570], true); c.fillStyle = '#1b1f2e'; c.fill(); }
    c.beginPath(); c.arc(960, 560, 55, Math.PI, 0); c.stroke();
    c.fillRect(957, 486, 6, 26); c.fillRect(948, 494, 24, 6);
    for (const x of [890, 1030]) { c.fillStyle = '#4c556e'; c.fillRect(x - 15, 540, 30, 130); c.fillRect(x - 20, 532, 40, 12); }
    // dead tree with its owl
    deadTree(c, 430, 760);
    // upstage stones
    const r = mulberry(17);
    const ups = [[560, 690, 0, 0.8], [690, 694, 1, 0.75], [790, 690, 3, 0.7], [1080, 692, 0, 0.72], [1170, 690, 2, 0.7], [1290, 694, 1, 0.8], [1360, 700, 0, 0.7]];
    for (const [x, y, k, s] of ups) tombstone(c, x, y, k, s);
    // an angel on a plinth
    c.save(); c.translate(1250, 704);
    c.fillStyle = '#6f7891'; c.fillRect(-30, -40, 60, 40);
    c.fillStyle = '#8e97ad'; ellipse(c, 0, -80, 16, 40); c.fill(); circle(c, 0, -128, 12); c.fill();
    c.beginPath(); c.moveTo(-8, -110); c.quadraticCurveTo(-60, -150, -44, -70); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(8, -110); c.quadraticCurveTo(60, -150, 44, -70); c.closePath(); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    c.restore();
    // the ground
    c.fillStyle = vgrad(c, 680, 780, [[0, '#2a3326'], [1, '#18200f']]); c.fillRect(o.l, 690, o.r - o.l, 90);
    c.fillStyle = 'rgba(80,100,70,0.35)';
    for (let k = 0; k < 80; k++) { const x = o.l + r() * (o.r - o.l), y = 700 + r() * 76; path(c, [x, y, x + 3, y - 10, x + 6, y], true); c.fill(); }
  }

  // dynamic graveyard pieces: the downstage graves, Livia's mound and cross
  function drawGraves(c, t, open) {
    for (let i = 0; i < GRAVES.length; i++) {
      if (i === 7) continue;
      const x = sx(GRAVES[i]);
      const k = i % 4;
      if (open > 0) {
        // open: a dark hole, a tilted stone
        c.fillStyle = '#0b0d08'; ellipse(c, x, 772, 56 * open, 10 * open); c.fill();
        c.fillStyle = '#3b2f22'; ellipse(c, x + 52, 770, 30, 9); c.fill();
        c.save(); c.translate(x - 50, 776); c.rotate(-0.35 * open * (i % 2 ? 1 : -1)); tombstone(c, 0, 0, k, 0.62); c.restore();
      } else {
        tombstone(c, x - 52, 778, k, 0.62);
        c.fillStyle = '#2b2418'; ellipse(c, x, 774, 50, 7); c.fill();
      }
    }
  }
  function drawLiviaGrave(c, t, risen) {
    const x = sx(0.32);
    // wooden cross with her name and a wreath
    c.save(); c.translate(x + 70, 772);
    c.rotate(risen > 0.5 ? 0.25 : 0.02);
    c.fillStyle = '#5a3c22'; c.fillRect(-6, -130, 12, 130); c.fillRect(-36, -104, 72, 12);
    c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(-6, -130, 12, 130); c.strokeRect(-36, -104, 72, 12);
    c.fillStyle = '#f0e2c0'; c.font = `700 11px ${FONT_D}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LIVIA', 0, -97);
    c.strokeStyle = '#4b6b38'; c.lineWidth = 6; circle(c, 0, -64, 18); c.stroke();
    for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#e8e0e0' : '#c83246'; circle(c, Math.cos(k / 8 * TAU) * 18, -64 + Math.sin(k / 8 * TAU) * 18, 4); c.fill(); }
    c.restore();
    // the mound (broken open once she has risen)
    c.fillStyle = '#4a3a26';
    c.beginPath(); c.moveTo(x - 92, 778);
    c.quadraticCurveTo(x, 742 + risen * 12, x + 92, 778); c.closePath(); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    if (risen > 0) {
      c.fillStyle = '#120d07'; ellipse(c, x, 770, 44 * risen, 8 * risen); c.fill();
      c.fillStyle = '#4a3a26';
      for (let k = 0; k < 6; k++) { circle(c, x - 60 + k * 24, 768 - (k % 2) * 6, 7); c.fill(); }
    }
  }

  // ------------------------------------------------------------------ people
  const LOOK = {
    livia: { kind: 'gown', h: 246, skin: [246, 210, 186], hair: [74, 42, 30], hairDo: 'bun', cloth: [248, 244, 236], cloth2: [222, 214, 200], trim: [232, 196, 120], veil: 1, lips: [196, 56, 72], prop: 'bouquet' },
    amadeo: { kind: 'tenor', h: 232, skin: [238, 198, 162], hair: [34, 24, 24], hairDo: 'curly', cloth: [30, 30, 42], shirt: [246, 242, 234], tie: [178, 30, 44], legs: [34, 34, 44], mustache: 1 },
    velena: { kind: 'mermaid', h: 262, skin: [240, 218, 206], hair: [28, 16, 24], hairDo: 'updo', cloth: [98, 40, 118], cloth2: [56, 18, 70], trim: [20, 10, 20], lips: [150, 16, 52], hat: 1, beauty: 1, brow: -0.5 },
    ossobuco: { kind: 'digger', h: 226, skin: [214, 170, 140], hair: [130, 120, 110], hairDo: 'cap', cloth: [110, 80, 52], shirt: [196, 186, 160], legs: [90, 88, 78], nose: 1.6, stubble: 1, scarf: [84, 116, 72], prop: 'shovel' },
  };
  const ZSKIN = [150, 176, 132];
  const MUD = [104, 88, 62];
  const emissive = [];   // glowing bits recorded while drawing people (device pixels), drawn after the lighting
  function emitDev(c, kind, x, y, size) {
    const m = c.getTransform();
    const sc = Math.sqrt(m.a * m.a + m.b * m.b);
    emissive.push([kind, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f, size * sc]);
  }

  function limb(c, x, y, a1, a2, l1, l2, w1, w2, col, s) {
    // two-segment arm from (x, y); s = -1 left, +1 right; returns the hand position
    const ex = x + s * Math.sin(a1) * l1, ey = y + Math.cos(a1) * l1;
    const hx = ex + s * Math.sin(a2) * l2, hy = ey + Math.cos(a2) * l2;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = INK; c.lineWidth = w1 + 4;
    c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
    c.strokeStyle = col; c.lineWidth = w1;
    c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
    c.lineWidth = w2; c.beginPath(); c.moveTo(ex, ey); c.lineTo(hx, hy); c.stroke();
    return [hx, hy, ex, ey];
  }

  function face(c, L, hx, hy, r, st) {
    const z = st.z;
    const skin = mixc(L.skin, ZSKIN, z);
    // hair behind
    if (L.hairDo === 'bun' || L.hairDo === 'updo') {
      c.fillStyle = rgb(mixc(L.hair, [70, 70, 60], z * 0.5));
      ellipse(c, hx, hy - r * 0.15, r * 1.08, r * 1.08); c.fill();
    }
    if (L.hairDo === 'scarf') {
      // the headscarf behind the face, tied under the chin
      c.fillStyle = rgb(mixc(L.scarfc || [170, 60, 60], [90, 80, 70], z * 0.5));
      c.beginPath(); c.arc(hx, hy - r * 0.08, r * 1.12, Math.PI * 0.8, Math.PI * 2.2); c.lineTo(hx + r * 0.55, hy + r * 1.05); c.lineTo(hx - r * 0.55, hy + r * 1.05); c.closePath(); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    }
    if (L.hairDo === 'hood') {
      c.fillStyle = rgb(mixc(L.cloth, MUD, z * 0.4));
      c.beginPath(); c.arc(hx, hy - r * 0.05, r * 1.22, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(hx + r * 1.05, hy + r * 1.2); c.lineTo(hx - r * 1.05, hy + r * 1.2); c.closePath(); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    }
    // the head
    ellipse(c, hx, hy, r * 0.92, r); c.fillStyle = rgb(skin); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
    // cheeks
    if (z < 0.5) { c.fillStyle = `rgba(230,110,110,${0.35 * (1 - z * 2)})`; circle(c, hx - r * 0.5, hy + r * 0.25, r * 0.2); c.fill(); circle(c, hx + r * 0.5, hy + r * 0.25, r * 0.2); c.fill(); }
    else { c.fillStyle = 'rgba(60,70,50,0.35)'; ellipse(c, hx - r * 0.45, hy + r * 0.3, r * 0.18, r * 0.26); c.fill(); ellipse(c, hx + r * 0.45, hy + r * 0.3, r * 0.18, r * 0.26); c.fill(); }
    // eyes
    const look = 0.18 * r;
    const dead = st.dead;
    for (const s of [-1, 1]) {
      const ex = hx + s * r * 0.36, ey = hy - r * 0.08;
      if (z > 0.4) { c.fillStyle = 'rgba(40,30,40,0.55)'; ellipse(c, ex, ey, r * 0.24, r * 0.22); c.fill(); }
      if (dead) {
        c.strokeStyle = INK; c.lineWidth = 2;
        c.beginPath(); c.moveTo(ex - 4, ey - 4); c.lineTo(ex + 4, ey + 4); c.moveTo(ex + 4, ey - 4); c.lineTo(ex - 4, ey + 4); c.stroke();
        continue;
      }
      if (st.blink) { c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - 5, ey); c.lineTo(ex + 5, ey); c.stroke(); continue; }
      c.fillStyle = z > 0.5 ? '#dfe6c8' : '#ffffff'; ellipse(c, ex, ey, r * 0.17, r * 0.14); c.fill();
      const px = ex + look * 0.6, py = ey + 1;
      c.fillStyle = z > 0.5 ? '#203018' : '#1c1416'; circle(c, px, py, r * (z > 0.5 ? 0.06 : 0.085)); c.fill();
      if (z > 0.5) emitDev(c, 'eye', px, py, r * 0.32);
      else { c.fillStyle = '#fff'; circle(c, px + 1.2, py - 1.2, 1.2); c.fill(); }
    }
    // brows
    const b = st.brow;
    c.strokeStyle = rgb(mixc(L.hair, [40, 40, 40], 0.3)); c.lineWidth = 2.6;
    for (const s of [-1, 1]) {
      const ex = hx + s * r * 0.36, ey = hy - r * 0.34;
      c.beginPath(); c.moveTo(ex - s * r * 0.18, ey + b * 3); c.lineTo(ex + s * r * 0.18, ey - b * 1.5 - (L.brow || 0) * 3); c.stroke();
    }
    // nose
    c.strokeStyle = 'rgba(80,40,30,0.6)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(hx + r * 0.08, hy + r * 0.02); c.quadraticCurveTo(hx + r * 0.22 * (L.nose || 1), hy + r * 0.25, hx + r * 0.02, hy + r * 0.3); c.stroke();
    if ((L.nose || 1) > 1.2) { c.fillStyle = rgb(mixc(skin, [200, 110, 100], 0.4)); ellipse(c, hx + r * 0.16, hy + r * 0.2, r * 0.2, r * 0.16); c.fill(); c.stroke(); }
    // mouth: open by the vowel being sung, wide for i/e, round for o/u
    const open = st.mouth.open, wide = st.mouth.wide;
    const mw = r * (0.16 + 0.2 * clamp(wide, -0.3, 1)), mh = r * (0.04 + 0.42 * open);
    const my = hy + r * 0.52 + mh * 0.2;
    if (L.mustache) { c.fillStyle = rgb(L.hair); ellipse(c, hx - r * 0.18, hy + r * 0.38, r * 0.22, r * 0.08, 0.2); c.fill(); ellipse(c, hx + r * 0.18, hy + r * 0.38, r * 0.22, r * 0.08, -0.2); c.fill(); }
    if (open > 0.04) {
      ellipse(c, hx, my, mw, mh); c.fillStyle = z > 0.5 ? '#2a1414' : '#5a1620'; c.fill();
      c.strokeStyle = rgb(mixc(L.lips || [150, 70, 70], [80, 60, 60], z)); c.lineWidth = 2; c.stroke();
      if (z > 0.5) { c.fillStyle = '#e8e2c0'; for (let k = -2; k <= 2; k++) { path(c, [hx + k * mw * 0.36 - 2, my - mh * 0.85, hx + k * mw * 0.36 + 2, my - mh * 0.85, hx + k * mw * 0.36, my - mh * 0.45], true); c.fill(); } }
    } else {
      c.strokeStyle = rgb(mixc(L.lips || [140, 70, 70], [70, 60, 60], z)); c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(hx - mw, my); c.quadraticCurveTo(hx, my + (z > 0.5 ? -2 : 3), hx + mw, my); c.stroke();
    }
    if (L.beauty) { c.fillStyle = INK; circle(c, hx + r * 0.42, hy + r * 0.42, 1.6); c.fill(); }
    if (L.stubble) { c.fillStyle = 'rgba(60,50,50,0.25)'; ellipse(c, hx, hy + r * 0.62, r * 0.55, r * 0.3); c.fill(); }
    if (z > 0.6) { c.strokeStyle = 'rgba(40,30,30,0.6)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hx - r * 0.7, hy + r * 0.1); c.lineTo(hx - r * 0.45, hy + r * 0.45); for (let k = 0; k < 3; k++) { const q = k / 3; c.moveTo(hx - r * 0.7 + q * r * 0.25 - 3, hy + r * 0.1 + q * r * 0.35); c.lineTo(hx - r * 0.7 + q * r * 0.25 + 3, hy + r * 0.1 + q * r * 0.35); } c.stroke(); }
    // hair on top
    const hc = rgb(mixc(L.hair, [80, 80, 70], z * 0.5));
    c.fillStyle = hc;
    if (L.hairDo === 'bun') {
      c.beginPath(); c.arc(hx, hy - r * 0.1, r * 0.96, Math.PI * 1.05, Math.PI * 1.95); c.quadraticCurveTo(hx, hy - r * 0.55, hx - r * 0.92, hy - r * 0.1); c.fill();
      circle(c, hx, hy - r * 1.05, r * 0.42); c.fill();
    } else if (L.hairDo === 'updo') {
      c.beginPath(); c.arc(hx, hy - r * 0.1, r * 0.98, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(hx + r * 0.3, hy - r * 0.6, hx - r * 0.95, hy - r * 0.15); c.fill();
    } else if (L.hairDo === 'curly') {
      for (let k = 0; k < 9; k++) { const a = Math.PI * (1.0 + k / 8); circle(c, hx + Math.cos(a) * r * 0.9, hy - r * 0.12 + Math.sin(a) * r * 0.92, r * 0.3); c.fill(); }
    } else if (L.hairDo === 'cap') {
      c.fillStyle = '#4a3b2c'; c.beginPath(); c.arc(hx, hy - r * 0.2, r * 0.98, Math.PI, 0); c.fill();
      ellipse(c, hx + r * 0.45, hy - r * 0.22, r * 0.75, r * 0.14); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.arc(hx, hy - r * 0.2, r * 0.98, Math.PI, 0); c.stroke();
      c.fillStyle = hc; circle(c, hx - r * 0.85, hy + r * 0.05, r * 0.22); c.fill();
    } else if (L.hairDo === 'bald') {
      c.fillStyle = hc; circle(c, hx - r * 0.85, hy, r * 0.22); c.fill(); circle(c, hx + r * 0.85, hy, r * 0.22); c.fill();
    } else if (L.hairDo === 'scarf') {
      // the scarf's front edge across the forehead
      c.strokeStyle = rgb(mixc(L.scarfc || [170, 60, 60], [90, 80, 70], z * 0.5)); c.lineWidth = r * 0.42; c.lineCap = 'round';
      c.beginPath(); c.arc(hx, hy + r * 0.05, r * 0.86, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
    } else if (L.hairDo === 'tophat') {
      c.fillStyle = '#16141a'; c.fillRect(hx - r * 0.7, hy - r * 2.1, r * 1.4, r * 1.3); ellipse(c, hx, hy - r * 0.8, r * 1.15, r * 0.2); c.fill();
    } else if (L.hairDo === 'hood') {
      c.strokeStyle = rgb(mixc(L.cloth, MUD, z * 0.4)); c.lineWidth = r * 0.5; c.lineCap = 'round';
      c.beginPath(); c.arc(hx, hy + r * 0.05, r * 0.95, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    } else if (L.hairDo === 'helmet') {
      c.fillStyle = '#5a5e52'; c.beginPath(); c.arc(hx, hy - r * 0.15, r * 1.05, Math.PI, 0); c.fill(); c.fillRect(hx - r * 1.3, hy - r * 0.2, r * 2.6, r * 0.16);
    }
    if (L.veil) {
      c.fillStyle = `rgba(255,255,255,${0.75 - 0.25 * z})`;
      c.beginPath(); c.moveTo(hx - r * 0.5, hy - r * 1.3); c.lineTo(hx + r * 0.5, hy - r * 1.3); c.lineTo(hx + r * 0.6, hy - r * 1.05); c.lineTo(hx - r * 0.6, hy - r * 1.05); c.fill();
      for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#f4c0cc' : '#ffffff'; circle(c, hx - r * 0.45 + k * r * 0.22, hy - r * 1.18, r * 0.11); c.fill(); }
    }
    if (L.hat) {
      c.save(); c.translate(hx, hy - r * 0.85);
      c.fillStyle = '#2a0f33'; ellipse(c, 0, 0, r * 1.9, r * 0.32, -0.12); c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
      c.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 0.75);
      c.fillStyle = '#9e5bbf';
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(r * 0.3, -r * 0.6); c.quadraticCurveTo(r * (1.4 + k * 0.3), -r * (2.2 + k * 0.25), r * (2.1 + k * 0.2), -r * (0.9 + k * 0.4)); c.quadraticCurveTo(r * 1.2, -r * 1.1, r * 0.3, -r * 0.6); c.fill(); }
      c.restore();
    }
  }

  // draw a person at world (wx, wy). st: pose p, facing f, scale sc, zombie z, mouth, blink, extras
  function person(c, L, st) {
    const p = st.p;
    const Hh = L.h;
    const z = st.z;
    c.save();
    c.translate(st.x, st.y);
    c.scale(st.sc * st.f, st.sc);
    // emerging from a grave: clip below ground and push the figure down
    const rise = clamp(p.rise, 0, 1);
    if (rise < 1) {
      c.beginPath(); c.rect(-400, -600, 800, 600 - 4); c.clip();
      c.translate(0, (1 - rise) * (Hh + 30));
    }
    if (p.fall > 0) {
      c.translate(0, -6 * p.fall);
      c.rotate(-p.fall * 1.48);
      c.translate(0, 0);
    }
    c.rotate(p.lean);
    const cr = p.crouch;
    const drop = cr * Hh * 0.26;
    const hipY = -Hh * 0.46 + drop;
    const shY = -Hh * 0.79 + drop;
    const bend = p.bend;
    const kind = L.kind;
    const cloth = mixc(L.cloth, mixc(L.cloth, MUD, 0.55), z);
    const cloth2 = L.cloth2 ? mixc(L.cloth2, MUD, z * 0.5) : cloth;
    const skin = mixc(L.skin, ZSKIN, z);
    const torn = z > 0.4;
    // ---- legs / skirt
    if (kind === 'gown' || kind === 'mermaid' || kind === 'dress') {
      const hem = kind === 'mermaid' ? 64 : (kind === 'dress' ? 52 : 86);
      const waist = kind === 'mermaid' ? 18 : 20;
      const wy = -Hh * 0.55 + drop;
      c.beginPath();
      c.moveTo(-waist, wy);
      if (kind === 'mermaid') c.bezierCurveTo(-34, wy + 60, -16, -40, -hem - cr * 30, -2);
      else c.quadraticCurveTo(-hem * 0.55, wy + 40, -hem - cr * 30, -2);
      // hem: scalloped, torn for zombies
      const n = 9;
      for (let k = 1; k <= n; k++) {
        const x = lerp(-hem - cr * 30, hem + cr * 30, k / n);
        const y = -2 + (k % 2 ? 7 : 0) + (torn ? (hash(k * 3.1 + L.h) - 0.3) * 22 * z : 0);
        c.lineTo(x, y);
      }
      if (kind === 'mermaid') c.bezierCurveTo(16, -40, 34, wy + 60, waist, wy);
      else c.quadraticCurveTo(hem * 0.55, wy + 40, waist, wy);
      c.closePath();
      c.fillStyle = vgrad(c, wy, 0, [[0, rgb(cloth)], [1, rgb(cloth2)]]); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
      // folds
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2;
      for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.moveTo(k * 14, wy + 20); c.lineTo(k * (hem + cr * 30) * 0.9, -6); c.stroke(); }
      if (L.trim) { c.strokeStyle = rgb(L.trim); c.lineWidth = 3; c.beginPath(); c.moveTo(-hem - cr * 30 + 6, -8); c.lineTo(hem + cr * 30 - 6, -8); c.stroke(); }
      if (z > 0.3) { c.fillStyle = `rgba(90,70,40,${0.45 * z})`; ellipse(c, -20, -20, 40, 14); c.fill(); ellipse(c, 30, -40, 18, 10); c.fill(); }
    } else {
      // trousers with knees
      const legc = rgb(mixc(L.legs || [40, 40, 50], MUD, z * 0.4));
      for (const s of [-1, 1]) {
        const hx = s * 12, kx = s * 14 + cr * 26, ky = hipY * 0.48 - cr * 6, fx = s * 15 - cr * 4;
        c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 22;
        c.beginPath(); c.moveTo(hx, hipY); c.lineTo(kx, ky); c.lineTo(fx, -8); c.stroke();
        c.strokeStyle = legc; c.lineWidth = 17;
        c.beginPath(); c.moveTo(hx, hipY); c.lineTo(kx, ky); c.lineTo(fx, -8); c.stroke();
        c.fillStyle = '#16100e'; ellipse(c, fx + 7, -4, 15, 7); c.fill();
      }
    }
    // ---- torso (pivots at the hips for bows)
    c.save();
    c.translate(0, hipY); c.rotate(bend * 0.95); c.translate(0, -hipY);
    const sw = kind === 'tenor' ? 34 : (kind === 'digger' ? 30 : 27);
    if (kind === 'gown' || kind === 'mermaid' || kind === 'dress') {
      const wy = -Hh * 0.55 + drop;
      path(c, [-sw, shY + 4, sw, shY + 4, 18, wy, -18, wy], true);
      c.fillStyle = rgb(cloth); c.fill(); c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
      if (L.trim) { c.strokeStyle = rgb(L.trim); c.lineWidth = 3; c.beginPath(); c.moveTo(-sw + 4, shY + 10); c.quadraticCurveTo(0, shY + 26, sw - 4, shY + 10); c.stroke(); }
      if (kind === 'mermaid') { c.fillStyle = 'rgba(20,10,20,0.5)'; path(c, [-8, shY + 6, 8, shY + 6, 0, wy - 4], true); c.fill(); }
    } else if (kind === 'tenor') {
      // a round tenor in tails
      path(c, [-sw, shY + 2, sw, shY + 2, sw + 6, hipY + 4, -sw - 6, hipY + 4], true);
      c.fillStyle = rgb(cloth); c.fill(); c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
      ellipse(c, 0, (shY + hipY) / 2 + 12, 24, (hipY - shY) / 2 + 4); c.fillStyle = rgb(mixc(L.shirt, MUD, z * 0.4)); c.fill(); c.stroke();
      c.fillStyle = '#d8b04a'; for (let k = 0; k < 3; k++) { circle(c, 0, shY + 30 + k * 18, 2.4); c.fill(); }
      // tails
      c.fillStyle = rgb(cloth); path(c, [-sw - 6, hipY, -sw + 6, hipY + 60 - cr * 30, -sw + 14, hipY], true); c.fill();
      path(c, [sw + 6, hipY, sw - 6, hipY + 60 - cr * 30, sw - 14, hipY], true); c.fill();
      // bow tie
      c.fillStyle = rgb(L.tie); path(c, [0, shY + 6, -12, shY, -12, shY + 12], true); c.fill(); path(c, [0, shY + 6, 12, shY, 12, shY + 12], true); c.fill();
    } else if (kind === 'digger') {
      path(c, [-sw, shY + 4, sw, shY + 2, sw + 10, hipY + 40 - cr * 30, -sw - 10, hipY + 40 - cr * 30], true);
      c.fillStyle = rgb(cloth); c.fill(); c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
      c.fillStyle = 'rgba(60,40,20,0.5)'; c.fillRect(-14, shY + 50, 16, 14);
      c.fillStyle = rgb(L.scarf); path(c, [-sw + 4, shY + 2, sw - 4, shY + 2, 6, shY + 20, 14, shY + 46, 2, shY + 44, -4, shY + 18], true); c.fill();
    } else {
      // generic coat (chorus men, zombies)
      path(c, [-sw, shY + 3, sw, shY + 3, sw + 4, hipY + 18 - cr * 20, -sw - 4, hipY + 18 - cr * 20], true);
      c.fillStyle = rgb(cloth); c.fill(); c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
      if (L.shirt) { path(c, [-9, shY + 3, 9, shY + 3, 0, shY + 40], true); c.fillStyle = rgb(L.shirt); c.fill(); }
      if (torn) { c.fillStyle = 'rgba(30,20,20,0.45)'; path(c, [sw - 12, hipY - 30, sw - 2, hipY - 16, sw - 14, hipY - 8], true); c.fill(); }
    }
    // ---- neck and head
    const r = Hh * 0.1;
    const headX = 0, headY = shY - r * 1.05 + (p.tilt > 0 ? p.tilt * 10 : 0);
    c.fillStyle = rgb(skin); c.fillRect(-6, shY - r * 0.4, 12, r * 0.5);
    // ---- arms (back arm first so the front one overlaps the body)
    const sleeve = rgb(kind === 'gown' ? mixc(L.cloth, MUD, z * 0.4) : cloth);
    const arm = (s, a) => limb(c, s * (sw - 3), shY + 8, a[0], a[1], Hh * 0.17, Hh * 0.165, 11, 9, sleeve, s);
    const hL = st.noArm ? [-(sw - 3), shY + 8, 0, 0] : arm(-1, p.aL);
    // head (tilted)
    c.save();
    c.translate(headX, headY); c.rotate(p.tilt * 0.6); c.translate(-headX, -headY);
    const wx = (lx, ly) => st.x + st.f * st.sc * lx;     // approximate world mapping for glows
    const wy = (lx, ly) => st.y + st.sc * ly;
    face(c, L, headX, headY, r, { z, mouth: st.mouth, blink: st.blink, brow: p.brow, dead: st.dead, wx, wy, sc: st.sc });
    c.restore();
    const hR = arm(1, p.aR);
    // hands
    for (const h of (st.noArm ? [hR] : [hL, hR])) { circle(c, h[0], h[1], 6.5); c.fillStyle = rgb(skin); c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); }
    // props
    if (st.prop === 'bouquet') {
      const [x, y] = hL;
      for (let k = 0; k < 6; k++) { c.fillStyle = z > 0.5 ? (k % 2 ? '#6b4a32' : '#4a3a28') : (k % 2 ? '#d22d45' : '#f2f2f2'); circle(c, x + Math.cos(k) * 7, y + 6 + Math.sin(k) * 6, 6); c.fill(); }
      c.strokeStyle = '#3e6b30'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y + 8); c.lineTo(x - 2, y + 28); c.moveTo(x + 3, y + 8); c.lineTo(x + 5, y + 28); c.stroke();
    }
    if (st.prop === 'glass') {
      const [x, y] = hR;
      c.strokeStyle = 'rgba(230,240,255,0.9)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x - 6, y - 22); c.quadraticCurveTo(x, y - 6, x + 6, y - 22); c.moveTo(x, y - 12); c.lineTo(x, y); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.stroke();
      c.fillStyle = 'rgba(150,20,40,0.85)'; c.beginPath(); c.moveTo(x - 5, y - 19); c.quadraticCurveTo(x, y - 9, x + 5, y - 19); c.fill();
    }
    if (st.prop === 'shovel') {
      const [x, y] = hR, [x2, y2] = hL;
      const ang = Math.atan2(y - y2, x - x2);
      c.save(); c.translate(x, y); c.rotate(ang + Math.PI / 2 + 0.4);
      c.fillStyle = '#6b4b2a'; c.fillRect(-3, -70, 6, 130);
      c.fillStyle = '#8a8f98'; path(c, [-14, 58, 14, 58, 10, 90, 0, 98, -10, 90], true); c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
      c.restore();
    }
    if (st.prop === 'torch') {
      const [x, y] = hR;
      c.fillStyle = '#5a3a1e'; c.fillRect(x - 3, y - 60, 6, 70);
      emitDev(c, 'flame', x, y - 66, 1);
    }
    if (st.prop === 'lantern') {
      const [x, y] = hL;
      c.fillStyle = '#2a2418'; c.fillRect(x - 8, y + 6, 16, 22); c.fillStyle = '#ffd27a'; c.fillRect(x - 5, y + 9, 10, 16);
      emitDev(c, 'lantern', x, y + 17, 1);
    }
    if (st.prop === 'flowers') {
      const [x, y] = hR;
      for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#f2f2f2' : '#e0405a'; circle(c, x + Math.cos(k * 1.3) * 6, y - 10 + Math.sin(k * 1.3) * 5, 5); c.fill(); }
    }
    if (st.noArm) { /* the arm that fell off: drawn by the caller */ }
    c.restore();   // torso
    c.restore();
  }

  // ------------------------------------------------------------------ chorus members
  const VILL = [], DEAD = [];
  (function makeChorus() {
    const r = mulberry(1234);
    const scarves = [[180, 60, 60], [60, 100, 160], [200, 150, 60], [120, 60, 120]];
    for (let i = 0; i < 8; i++) {
      const woman = i % 2 === 0;
      VILL.push({
        kind: woman ? 'dress' : 'coat', h: 214 + r() * 26,
        skin: [[240, 200, 170], [220, 176, 140], [200, 150, 120], [245, 214, 190]][i % 4],
        hair: [[60, 40, 30], [120, 80, 40], [30, 25, 25], [150, 140, 130]][(i + 1) % 4],
        hairDo: woman ? 'scarf' : (i % 3 === 1 ? 'bald' : 'curly'), scarfc: scarves[i % 4],
        cloth: woman ? [[200, 90, 80], [90, 120, 170], [220, 180, 90], [140, 90, 150]][i % 4] : [[90, 70, 50], [60, 70, 90], [110, 90, 60], [70, 60, 60]][i % 4],
        cloth2: woman ? [[160, 60, 60], [60, 90, 140], [190, 150, 60], [110, 70, 120]][i % 4] : null,
        shirt: woman ? null : [230, 225, 210], legs: [60, 55, 50], seed: r() * 10,
      });
    }
    const zk = [
      { kind: 'coat', hairDo: 'tophat', cloth: [40, 40, 52], shirt: [200, 200, 190] },
      { kind: 'dress', hairDo: 'bun', cloth: [120, 110, 140], cloth2: [80, 70, 100] },
      { kind: 'coat', hairDo: 'hood', cloth: [70, 56, 44] },
      { kind: 'coat', hairDo: 'helmet', cloth: [70, 80, 60], shirt: [150, 140, 110] },
      { kind: 'dress', hairDo: 'scarf', scarfc: [80, 60, 70], cloth: [90, 80, 70], cloth2: [60, 50, 50] },
      { kind: 'coat', hairDo: 'bald', cloth: [60, 70, 80], shirt: [180, 180, 170] },
      { kind: 'coat', hairDo: 'curly', cloth: [90, 50, 50], shirt: [200, 190, 170] },
      { kind: 'dress', hairDo: 'updo', cloth: [60, 60, 70], cloth2: [40, 40, 50] },
    ];
    for (let i = 0; i < 8; i++) {
      DEAD.push(Object.assign({ h: 208 + r() * 34, skin: [200, 200, 180], hair: [90, 90, 80], legs: [50, 50, 50], seed: r() * 10, grave: GRAVES[i] }, zk[i]));
    }
  })();

  function chorusMouth(g, t) {
    const m = S.singAt(g, t);
    return m ? { open: m.open, wide: m.wide } : { open: 0, wide: 0.4 };
  }

  function drawVillagers(c, t, act) {
    const g = S.groupAt('vill', t);
    if (g.action === 'hide') return;
    const mouth = chorusMouth('vill', t);
    const n = VILL.length;
    for (let i = 0; i < n; i++) {
      const L = VILL[i];
      let x, f = i < n / 2 ? 1 : -1, pose = 'idle', prop = null;
      const left = i < n / 2;
      const slot = left ? i : i - n / 2;
      // wedding: two clusters flanking the couple
      x = left ? -0.92 + slot * 0.16 : 0.62 + slot * 0.13;
      let y = UPSTAGE_Y(i);
      let shown = true;
      if (g.action === 'cheer') pose = Math.sin(t * 3 + L.seed) > 0.3 ? 'arms' : 'idle';
      if (g.action === 'toast') { pose = 'toast'; prop = 'glass'; }
      if (g.action === 'gasp') pose = 'clutch';
      if (g.action === 'worry') pose = (i % 3 === 0) ? 'clutch' : (i % 3 === 1 ? 'heart' : 'swoon');
      if (g.action === 'torches' || (g.action === 'gasp' && S.sceneAt(t) === 'graveyard')) {
        prop = 'torch'; pose = 'command';
        const k = g.action === 'torches' ? smooth(g.dt / 1.6) : 1;
        x = left ? lerp(-1.5, -1.02 + slot * 0.14, k) : lerp(1.5, 0.84 + slot * 0.12, k);
        if (g.action === 'gasp') { pose = 'cower'; }
      }
      if (g.action === 'flee') {
        prop = 'torch'; pose = 'cower';
        const k = smooth(g.dt / 1.8);
        x = left ? lerp(-1.02 + slot * 0.14, -1.7, k) : lerp(0.84 + slot * 0.12, 1.7, k);
        f = left ? -1 : 1;
        if (k >= 1) shown = false;
      }
      if (g.action === 'line' || g.action === 'bow') {
        x = -1.02 + i * 0.27; f = 1; y = UPSTAGE - 6;
        if (g.action === 'bow') pose = (g.dt % 6 < 1.8) ? 'bow' : 'idle';
      }
      if (!shown) continue;
      const pp = U.livePose(pose, g.dt, t, L.seed);
      if (pose === 'arms' || pose === 'idle') { pp.aL[0] += 0.08 * Math.sin(t * 2 + L.seed); }
      person(c, L, { x: sx(x), y, sc: 0.8, f, p: pp, z: 0, mouth, blink: blinkAt(t, L.seed), prop });
    }
  }
  function UPSTAGE_Y(i) { return UPSTAGE + (i % 2) * 6; }
  const UPSTAGE = 716;

  function drawDead(c, t) {
    const g = S.groupAt('dead', t);
    if (g.action === 'hide') return;
    const mouth = chorusMouth('dead', t);
    const velX = S.charX('velena', t);
    for (let i = 0; i < DEAD.length; i++) {
      const L = DEAD[i];
      const home = L.grave;
      let x = home, y = FLOOR - 10, pose = 'sway', f = home < 0.3 ? 1 : -1;
      const p0 = { rise: 1 };
      let rise = 1;
      if (g.action === 'rise') {
        const delay = (i * 0.37) % 2.2;
        rise = easeOut((g.dt - delay) / 2.6);
      }
      if (g.action === 'close' || g.action === 'eat') {
        const k = smooth(g.dt / 2.5);
        x = lerp(home, velX + (i - 3.5) * 0.07, k * 0.85);
        f = x < velX ? 1 : -1;
        pose = 'lunge';
      }
      const ate = U.fxSince('eaten', t);
      if (ate !== null && (g.action === 'close')) {
        // the scrum, then they wander back to their graves
        const k = smooth((ate - 2.0) / 3.0);
        const target = velX + (i - 3.5) * 0.07;
        x = lerp(target, home, k);
        pose = k > 0 ? 'sway' : 'bite';
      }
      if (g.action === 'back') { const k = smooth(g.dt / 3); x = lerp(velX + (i - 3.5) * 0.07, home, ate !== null ? 1 : k); pose = 'sway'; }
      if (g.action === 'line' || g.action === 'bow') {
        x = -0.885 + i * 0.27; y = UPSTAGE - 2; f = 1; pose = g.action === 'bow' && (g.dt % 6 < 1.8) ? 'bow' : 'idle';
      }
      const pp = U.livePose(pose, g.action === 'rise' ? 99 : g.dt, t, L.seed);
      pp.rise = rise;
      if (rise < 1) { pp.aL = [-1.3, -1.45]; pp.aR = [1.45, 1.5]; }
      person(c, L, { x: sx(x), y, sc: 0.8, f, p: pp, z: 1, mouth, blink: false, prop: null });
    }
  }

  function blinkAt(t, seed) { const ph = (t * 0.31 + seed * 0.77) % 1; return ph < 0.025; }

  // which partner a soloist looks at
  const PARTNER = { livia: 'amadeo', amadeo: 'livia', velena: 'livia', ossobuco: null };

  function drawSoloists(c, t, scene) {
    const order = ['ossobuco', 'velena', 'amadeo', 'livia'];
    for (const w of order) {
      if (!U.charShown(w, t)) continue;
      const x = S.charX(w, t);
      if (x < -1.32 || x > 1.32) continue;
      const pose = S.charPose(w, t);
      const p = Object.assign({}, pose.p);
      if (pose.name === 'buried') continue;
      const L = LOOK[w];
      let f = U.charFacing(w, t);
      const partner = PARTNER[w];
      if (partner && U.charShown(partner, t) && !['aside', 'scream', 'command', 'dig', 'hide'].includes(pose.name)) {
        const px = S.charX(partner, t);
        if (Math.abs(px - x) > 0.05 && Math.abs(px - x) < 1.2 && (S.isSinging(partner, t) > 0 || S.isSinging(w, t) > 0)) f = px > x ? 1 : -1;
      }
      const z = U.charZombie(w, t);
      const sing = S.singAt(w, t);
      let mouth = { open: p.mouth, wide: 0.3 };
      if (sing && sing.open > 0.01) {
        mouth = { open: Math.max(p.mouth, sing.open), wide: sing.wide };
        // a singer lifts as the line climbs
        p.tilt = (p.tilt || 0) - 0.08 * sing.lvl;
        if (pose.name === 'idle') { p.aL = [p.aL[0] + 0.5 * sing.lvl, p.aL[1] + 0.9 * sing.lvl]; p.aR = [p.aR[0] + 0.3 * sing.lvl, p.aR[1] + 0.5 * sing.lvl]; }
      }
      let prop = L.prop || null;
      if (w === 'livia' && scene !== 'piazza') prop = z > 0.3 ? 'bouquet' : null;
      if ((w === 'livia' || w === 'amadeo' || w === 'velena') && (pose.name === 'toast' || pose.name === 'drink')) prop = 'glass';
      if (w === 'amadeo' && pose.name === 'mourn') prop = 'flowers';
      if (w === 'ossobuco') prop = pose.name === 'dig' ? 'shovel' : 'lantern';
      let y = FLOOR;
      if (w === 'ossobuco' && pose.name === 'hide') y = FLOOR - 26;
      const sc = w === 'ossobuco' && pose.name === 'hide' ? 0.92 : 1;
      const noArm = w === 'amadeo' && U.fxSince('arm', t) !== null && t - (OP_BOWS_T() || 0) > 0;
      person(c, L, { x: sx(x), y, sc, f, p, z, mouth, blink: blinkAt(t, WHOSEED[w]), dead: pose.name === 'dead' && z < 0.5, prop, noArm });
      if (w === 'ossobuco' && pose.name === 'hide') {
        // the tombstone he hides behind
        tombstone(c, sx(x) + 30 * f, FLOOR + 6, 3, 1.3);
      }
    }
  }
  const WHOSEED = { livia: 1.1, amadeo: 2.3, velena: 3.7, ossobuco: 4.9 };

  // ------------------------------------------------------------------ the curtain (Italian drape)
  function drawCurtain(c, u, light) {
    if (u >= 0.999) return;
    const o = OPEN, top = o.t + 6, bot = o.b + 2, mid = 960;
    const e = smooth(u);
    for (const side of [-1, 1]) {
      const outer = side < 0 ? o.l : o.r;
      const inner = mid;
      // bottom-inner corner rises toward the top outer corner; the outer bottom corner lifts a little
      const Px = lerp(inner, outer + side * -70, Math.pow(e, 0.8)), Py = lerp(bot, top + 60, e);
      const Qx = outer, Qy = lerp(bot, bot - (bot - top) * 0.42, e);
      const ctrlx = lerp((inner + outer) / 2, outer - side * -60, e), ctrly = lerp(bot, Qy + (Py - Qy) * 0.1 + 80 * e, e);
      const N = 16;
      // the curtain is drawn as N fold strips from the top rail to the swagged bottom edge
      const bottom = (k) => {
        const q = k / N;
        const a = 1 - q;
        const x = a * a * Px + 2 * a * q * ctrlx + q * q * Qx;
        const y = a * a * Py + 2 * a * q * ctrly + q * q * Qy;
        return [x, y];
      };
      for (let k = 0; k < N; k++) {
        const tx0 = lerp(inner, outer, k / N), tx1 = lerp(inner, outer, (k + 1) / N);
        // gather the top as it opens
        const g0 = lerp(tx0, outer + side * -40 * (1 - k / N), e * 0.85), g1 = lerp(tx1, outer + side * -40 * (1 - (k + 1) / N), e * 0.85);
        const [bx0, by0] = bottom(k), [bx1, by1] = bottom(k + 1);
        c.beginPath(); c.moveTo(g0, top); c.lineTo(g1, top); c.lineTo(bx1, by1); c.lineTo(bx0, by0); c.closePath();
        const gr = c.createLinearGradient(Math.min(g0, bx0), 0, Math.max(g1, bx1), 0);
        const bright = 0.75 + 0.25 * light;
        gr.addColorStop(0, rgb([70 * bright, 6, 14]));
        gr.addColorStop(0.45, rgb([176 * bright, 22 * bright, 34 * bright]));
        gr.addColorStop(0.62, rgb([200 * bright, 40 * bright, 48 * bright]));
        gr.addColorStop(1, rgb([86 * bright, 8, 18]));
        c.fillStyle = gr; c.fill();
      }
      // shading toward the floor, the gold fringe on the swag
      c.beginPath(); c.moveTo(inner, top);
      for (let k = 0; k <= N; k++) { const [bx, by] = bottom(k); c.lineTo(bx, by); }
      c.lineTo(outer, top); c.closePath();
      c.fillStyle = vgrad(c, top, bot, [[0, 'rgba(0,0,0,0.35)'], [0.4, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.25)']]); c.fill();
      c.lineWidth = 10; c.strokeStyle = '#d6ad52';
      c.beginPath(); for (let k = 0; k <= N; k++) { const [bx, by] = bottom(k); if (k === 0) c.moveTo(bx, by); else c.lineTo(bx, by); } c.stroke();
      c.lineWidth = 3; c.strokeStyle = '#8a6220';
      for (let k = 0; k <= N * 3; k++) { const [bx, by] = bottom(k / 3); c.beginPath(); c.moveTo(bx, by + 3); c.lineTo(bx, by + 14); c.stroke(); }
      // the inner edge's gold border
      if (e < 0.9) {
        const gx = lerp(inner, outer + side * -40, e * 0.85);
        const [bx, by] = bottom(0);
        c.strokeStyle = '#d6ad52'; c.lineWidth = 6; c.beginPath(); c.moveTo(gx + side * 3, top); c.lineTo(bx + side * 3, by); c.stroke();
      }
    }
    // the embroidered emblem on the closed curtain
    if (u < 0.35) {
      const a = 1 - u / 0.35;
      c.save(); c.globalAlpha = a * 0.85;
      c.strokeStyle = '#d6ad52'; c.lineWidth = 3;
      for (const side of [-1, 1]) {
        c.beginPath(); c.arc(960 + side * 4, 500, 120, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side < 0 ? Math.PI * 1.5 : Math.PI * 0.5); c.stroke();
      }
      c.fillStyle = '#e6c06a'; c.font = `italic 700 54px ${FONT_D}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('L’Amor', 960, 478);
      c.font = `italic 700 40px ${FONT_D}`; c.fillText('che Morde', 960, 532);
      skull(c, 960, 410, 14, '#e6c06a', '#6a0b14');
      c.restore();
    }
  }

  // ------------------------------------------------------------------ lighting
  function drawLighting(c, t, L, scene) {
    const o = OPEN;
    // 1. the colour wash (multiply)
    c.save();
    c.globalCompositeOperation = 'multiply';
    const lv = L.lvl;
    c.fillStyle = rgb([L.amb[0] * lv, L.amb[1] * lv, L.amb[2] * lv]);
    c.fillRect(o.l, o.t, o.r - o.l, o.b - o.t);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    // 2. moonlight on the backdrop
    if (L.moon > 0.01 && scene === 'graveyard') {
      c.fillStyle = radial(c, 1300, 330, 10, 360, [[0, `rgba(200,215,255,${0.16 * L.moon})`], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(940, o.t, o.r - 940, 690 - o.t);
    }
    // 3. green glow from the opened graves
    if (L.green > 0.01 && scene === 'graveyard') {
      const open = graveOpen(t);
      for (let i = 0; i < GRAVES.length; i++) {
        const x = sx(GRAVES[i]);
        const a = (i === 7 ? 0.5 : open) * L.green * (0.75 + 0.25 * Math.sin(t * 3 + i));
        if (a < 0.01) continue;
        c.fillStyle = radial(c, x, 770, 4, 150, [[0, `rgba(120,255,110,${0.35 * a})`], [1, 'rgba(0,0,0,0)']]);
        c.fillRect(x - 150, 620, 300, 160);
      }
      c.fillStyle = vgrad(c, 640, 780, [[0, 'rgba(0,0,0,0)'], [1, `rgba(60,160,60,${0.18 * L.green})`]]);
      c.fillRect(o.l, 640, o.r - o.l, 140);
    }
    // 4. torchlight
    if (L.torch > 0.01) {
      const fl = 0.8 + 0.2 * Math.sin(t * 17) * Math.sin(t * 7.3);
      for (const x of [420, 560, 1420, 1540]) {
        c.fillStyle = radial(c, x, 560, 8, 300, [[0, `rgba(255,150,60,${0.32 * L.torch * fl})`], [1, 'rgba(0,0,0,0)']]);
        c.fillRect(x - 300, 260, 600, 520);
      }
    }
    // 5. follow spots on whoever is singing (and the couple in scripted moments)
    if (L.sa > 0.01) {
      for (const w of ['livia', 'amadeo', 'velena', 'ossobuco']) {
        if (!U.charShown(w, t)) continue;
        const s = S.isSinging(w, t);
        const pose = S.charPose(w, t).name;
        let a = s > 0 ? 0.6 + 0.4 * s : 0.0;
        if (pose === 'buried') a = 0;
        if (a <= 0) continue;
        const x = sx(S.charX(w, t));
        const k = a * L.sa;
        // beam from above
        c.fillStyle = hgrad(c, x - 150, x + 150, [[0, 'rgba(0,0,0,0)'], [0.5, rgb(L.spot, 0.07 * k)], [1, 'rgba(0,0,0,0)']]);
        path(c, [x - 40, o.t, x + 40, o.t, x + 130, FLOOR + 10, x - 130, FLOOR + 10], true); c.fill();
        // the pool on the boards and the glow on the singer
        c.fillStyle = radial(c, x, FLOOR - 4, 4, 130, [[0, rgb(L.spot, 0.3 * k)], [1, 'rgba(0,0,0,0)']]);
        c.save(); c.translate(x, FLOOR - 4); c.scale(1, 0.22); circle(c, 0, 0, 130); c.restore(); c.fill();
        c.fillStyle = radial(c, x, FLOOR - 130, 10, 170, [[0, rgb(L.spot, 0.18 * k)], [1, 'rgba(0,0,0,0)']]);
        c.fillRect(x - 170, FLOOR - 300, 340, 320);
      }
    }
    // 6. the finale's glory
    if (L.glory > 0.01) {
      const g = L.glory * (0.85 + 0.15 * Math.sin(t * 1.3));
      c.fillStyle = radial(c, 1060, 520, 20, 520, [[0, `rgba(255,200,140,${0.22 * g})`], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(o.l, o.t, o.r - o.l, o.b - o.t);
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + (k - 4) * 0.2 + 0.05 * Math.sin(t * 0.4 + k);
        c.fillStyle = `rgba(255,220,170,${0.05 * g})`;
        path(c, [1060, 520, 1060 + Math.cos(a - 0.04) * 700, 520 + Math.sin(a - 0.04) * 700, 1060 + Math.cos(a + 0.04) * 700, 520 + Math.sin(a + 0.04) * 700], true); c.fill();
      }
    }
    // 7. footlights wash from below
    c.fillStyle = vgrad(c, o.b - 160, o.b, [[0, 'rgba(0,0,0,0)'], [1, `rgba(255,200,140,${0.12 * clamp(L.lvl, 0, 1)})`]]);
    c.fillRect(o.l, o.b - 160, o.r - o.l, 160);
    c.restore();
  }

  function drawEmissive(c, t, L, scene) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const keep = c.getTransform();
    c.setTransform(1, 0, 0, 1, 0, 0);
    for (const e of emissive) {
      const [kind, x, y, s] = e;
      if (kind === 'eye') {
        c.fillStyle = radial(c, x, y, 0, 1.6 * s, [[0, 'rgba(225,255,150,0.95)'], [0.35, 'rgba(160,255,90,0.45)'], [1, 'rgba(120,255,80,0)']]);
        c.fillRect(x - 1.6 * s, y - 1.6 * s, 3.2 * s, 3.2 * s);
      } else if (kind === 'flame') {
        const fl = 0.8 + 0.2 * Math.sin(t * 23 + x) + 0.1 * Math.sin(t * 9 + y);
        c.fillStyle = radial(c, x, y, 0, 60 * s, [[0, `rgba(255,220,140,${0.9 * fl})`], [0.25, `rgba(255,140,40,${0.5 * fl})`], [1, 'rgba(255,80,0,0)']]);
        c.fillRect(x - 60 * s, y - 60 * s, 120 * s, 120 * s);
        c.fillStyle = `rgba(255,236,170,${fl})`;
        c.beginPath(); c.moveTo(x - 8 * s, y + 8 * s); c.quadraticCurveTo(x + 6 * s * Math.sin(t * 13 + x), y - 24 * s * fl, x + 8 * s, y + 8 * s); c.fill();
      } else if (kind === 'owl') {
        c.fillStyle = radial(c, x, y, 0, 2.2 * s, [[0, 'rgba(255,236,140,1)'], [0.4, 'rgba(255,200,60,0.5)'], [1, 'rgba(255,180,40,0)']]);
        c.fillRect(x - 2.2 * s, y - 2.2 * s, 4.4 * s, 4.4 * s);
      } else if (kind === 'lantern') {
        c.fillStyle = radial(c, x, y, 0, 80 * s, [[0, 'rgba(255,210,120,0.55)'], [1, 'rgba(255,160,60,0)']]);
        c.fillRect(x - 80 * s, y - 80 * s, 160 * s, 160 * s);
      }
    }
    c.setTransform(keep);
    // the moon itself stays bright whatever the wash
    if (scene === 'graveyard' && L.moon > 0.01) {
      c.fillStyle = radial(c, 1300, 330, 40, 150, [[0, `rgba(230,235,255,${0.35 * L.moon})`], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(1150, 180, 300, 300);
      c.globalCompositeOperation = 'source-over';
      circle(c, 1300, 330, 62); c.fillStyle = `rgba(246,240,214,${0.55 + 0.45 * L.moon})`; c.fill();
      c.fillStyle = `rgba(200,195,170,${0.5 * L.moon})`;
      for (const [dx, dy, r] of [[-20, -12, 12], [18, 10, 9], [-6, 24, 7], [24, -22, 6]]) { circle(c, 1300 + dx, 330 + dy, r); c.fill(); }
      // clouds drifting across
      for (let k = 0; k < 3; k++) {
        const cx = 1000 + ((t * 9 + k * 260) % 800);
        c.fillStyle = `rgba(30,40,70,${0.55})`;
        ellipse(c, cx, 300 + k * 40, 110, 14); c.fill(); ellipse(c, cx + 40, 292 + k * 40, 60, 12); c.fill();
      }
    }
    if (scene === 'piazza') {
      // lanterns strung on the houses come on as the sun goes
      for (const x of [520, 1450]) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = radial(c, x, 470, 0, 60, [[0, 'rgba(255,210,140,0.35)'], [1, 'rgba(0,0,0,0)']]);
        c.fillRect(x - 60, 410, 120, 120);
      }
    }
    c.restore();
    emissive.length = 0;
  }

  function drawFog(c, t, L) {
    if (L.fog < 0.02) return;
    const o = OPEN;
    c.save();
    c.globalCompositeOperation = 'screen';
    for (let k = 0; k < 7; k++) {
      const sp = 14 + k * 5;
      const x = o.l - 300 + (((t * sp) + k * 320) % (o.r - o.l + 600));
      const y = 742 + (k % 3) * 14;
      const a = 0.11 * L.fog;
      c.fillStyle = radial(c, x, y, 10, 260, [[0, rgb(mixc([170, 185, 220], L.amb, 0.5), a)], [1, 'rgba(0,0,0,0)']]);
      c.save(); c.translate(x, y); c.scale(1, 0.22); circle(c, 0, 0, 260); c.restore(); c.fill();
    }
    c.restore();
  }

  function graveOpen(t) { const s = U.fxSince('graves', t); return s === null ? 0 : smooth(s / 1.8); }

  // ------------------------------------------------------------------ the pit and the Maestro
  const PIT = [];
  (function makePit() {
    const r = mulberry(77);
    const add = (x0, x1, n, kind, y) => { for (let i = 0; i < n; i++) PIT.push({ x: lerp(x0, x1, (i + 0.5) / n) + (r() - 0.5) * 10, y: y + (r() - 0.5) * 6, kind, seed: r() * 10, hair: Math.floor(r() * 4) }); };
    add(340, 640, 6, 'vln', 872);
    add(650, 820, 3, 'vln', 868);
    add(830, 905, 2, 'wind', 862);
    add(1015, 1090, 2, 'wind', 862);
    add(1100, 1240, 3, 'vla', 870);
    add(1250, 1420, 3, 'vc', 878);
    add(1440, 1530, 2, 'cb', 874);
    add(870, 1060, 4, 'brass', 846);
    PIT.push({ x: 1580, y: 866, kind: 'timp', seed: 3, hair: 0 });
    PIT.push({ x: 300, y: 870, kind: 'harp', seed: 5, hair: 1 });
  })();

  function drawPitLamps(c) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const m of PIT) {
      if (m.kind === 'brass') continue;
      c.fillStyle = radial(c, m.x + 14, m.y - 20, 2, 46, [[0, 'rgba(255,214,150,0.5)'], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(m.x - 40, m.y - 66, 108, 92);
    }
    c.restore();
  }
  function drawPit(c, t, houseLvl) {
    const strl = U.pitAt('str', t) / 9, art = U.pitAt('art', t), wl = U.pitAt('wind', t) / 9, bl = U.pitAt('brass', t) / 9, tl = U.pitAt('timp', t) / 9, hl = U.pitAt('harp', t) / 9;
    for (const m of PIT) {
      const x = m.x, y = m.y;
      c.fillStyle = '#0c0608';
      // shoulders + head silhouette with a warm rim from the lamp
      ellipse(c, x, y + 24, 26, 18); c.fill();
      circle(c, x, y, 15); c.fill();
      c.strokeStyle = 'rgba(255,190,120,0.45)'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 15, -1.2, 0.4); c.stroke();
      if (m.hair === 1) { c.fillStyle = '#0c0608'; circle(c, x - 6, y - 12, 9); c.fill(); }
      if (m.hair === 2) { c.fillStyle = '#4a6a3a'; circle(c, x + 6, y - 2, 2.2); c.fill(); }   // one of the zombie players
      // stand
      c.fillStyle = '#1e1410'; c.fillRect(x + 8, y - 28, 22, 3);
      c.fillStyle = 'rgba(240,226,190,0.7)'; c.fillRect(x + 9, y - 40, 20, 12);
      if (m.kind === 'vln' || m.kind === 'vla') {
        // violin under the chin and a bow that moves with the strings
        let ang = 0;
        if (art === 2) ang = 0.1 * Math.sin(t * 50 + m.seed);
        else if (art === 3) ang = -0.5;
        else if (art === 4) ang = 0.35 * Math.sin(t * 9 + m.seed);
        else ang = 0.45 * Math.sin(t * 1.6 + m.seed);
        ang *= strl > 0 ? 1 : 0;
        c.strokeStyle = '#3a2214'; c.lineWidth = 5; c.beginPath(); c.moveTo(x - 4, y + 10); c.lineTo(x - 26, y + 2); c.stroke();
        c.strokeStyle = 'rgba(220,200,170,0.75)'; c.lineWidth = 1.5;
        c.save(); c.translate(x - 12, y + 8); c.rotate(-0.5 + ang); c.beginPath(); c.moveTo(-30, 0); c.lineTo(34, 0); c.stroke(); c.restore();
      } else if (m.kind === 'vc' || m.kind === 'cb') {
        const tall = m.kind === 'cb' ? 1.5 : 1;
        c.fillStyle = '#3a2214'; ellipse(c, x - 14, y + 20 - 14 * tall, 9, 26 * tall, 0.15); c.fill();
        c.fillRect(x - 17, y - 30 * tall, 4, 30 * tall);
        let ang = art === 2 ? 0.08 * Math.sin(t * 46 + m.seed) : art === 3 ? 0.4 : 0.35 * Math.sin(t * 1.3 + m.seed);
        ang *= strl > 0 ? 1 : 0;
        c.strokeStyle = 'rgba(220,200,170,0.7)'; c.lineWidth = 1.5;
        c.save(); c.translate(x - 10, y + 10); c.rotate(0.1 + ang); c.beginPath(); c.moveTo(-34, 0); c.lineTo(34, 0); c.stroke(); c.restore();
      } else if (m.kind === 'brass') {
        c.fillStyle = `rgba(230,190,90,${0.5 + 0.5 * bl})`;
        ellipse(c, x + 18, y - 6 - 6 * bl, 8, 6); c.fill();
        c.strokeStyle = '#b8902e'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 4, y + 2); c.lineTo(x + 18, y - 6 - 6 * bl); c.stroke();
      } else if (m.kind === 'wind') {
        c.strokeStyle = '#151010'; c.lineWidth = 4; c.beginPath(); c.moveTo(x + 2, y + 8); c.lineTo(x + 8, y + 40 - 6 * wl); c.stroke();
      } else if (m.kind === 'timp') {
        c.fillStyle = '#7a4a22'; ellipse(c, x + 10, y + 30, 34, 12); c.fill(); c.fillStyle = '#e8dcc0'; ellipse(c, x + 10, y + 24, 30, 9); c.fill();
        const hit = U.pitAt('timp', t) > 3;
        c.strokeStyle = '#d8c8a8'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x + 2, y + 10); c.lineTo(x + 6, y + (hit ? 22 : 8)); c.stroke();
      } else if (m.kind === 'harp') {
        c.strokeStyle = '#c99a3c'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(x + 22, y + 30); c.lineTo(x + 22, y - 70); c.quadraticCurveTo(x + 4, y - 80, x - 18, y - 50); c.lineTo(x + 22, y + 30); c.stroke();
        c.strokeStyle = `rgba(240,230,200,${0.4 + 0.5 * hl})`; c.lineWidth = 1;
        for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(x + 18 - k * 5, y + 22 - k * 9); c.lineTo(x + 18 - k * 5, y - 62 + k * 4); c.stroke(); }
      }
    }
  }

  function drawMaestro(c, t, env) {
    const m = S.maestroAt(t);
    const podX = 960, podY = 884;
    let x = podX, front = false, bow = 0, armUp = 0;
    if (m.a === 'away') return;
    if (m.a === 'enter') { x = lerp(-60 + 700, podX, smooth(m.dt / 1.2)); front = true; }
    if (m.a === 'bow') { front = true; bow = Math.sin(clamp(m.dt / 1.4, 0, 1) * Math.PI); }
    if (m.a === 'bowpit') { front = true; bow = Math.sin(clamp(m.dt / 1.6, 0, 1) * Math.PI) * (m.dt < 3.4 ? 1 : 0); }
    if (m.a === 'raise' || m.a === 'tap') armUp = 1;
    c.save(); c.translate(x, podY);
    // the podium
    c.fillStyle = '#2a120c'; c.fillRect(-36, 4, 72, 18);
    // body (tails), seen from the back unless he faces us
    c.fillStyle = '#0d0a10';
    path(c, [-26, -36, 26, -36, 30, 16, -30, 16], true); c.fill();
    c.save(); c.rotate(bow * 0.0); c.translate(0, bow * 14);
    // head: wild white hair; a greenish profile when he turns to bow
    c.fillStyle = front ? '#9fb58e' : '#121014';
    circle(c, 0, -52, 16); c.fill();
    c.fillStyle = '#e8e8e0';
    for (let k = 0; k < 9; k++) { const a = Math.PI * (0.9 + k / 8 * 1.2); circle(c, Math.cos(a) * 16, -54 + Math.sin(a) * 16, 7); c.fill(); }
    if (front) {
      c.fillStyle = '#1a1a14'; circle(c, -6, -52, 2.5); c.fill(); circle(c, 6, -52, 2.5); c.fill();
      c.strokeStyle = '#d8c8a0'; c.lineWidth = 1.5; circle(c, 6, -52, 5); c.stroke();     // a monocle
      c.strokeStyle = '#3a2a2a'; c.lineWidth = 2; c.beginPath(); c.arc(0, -44, 5, 0.2, Math.PI - 0.2); c.stroke();
    }
    c.restore();
    // arms: the baton follows the beat pattern
    let bx = 30, by = -30, lx = -30, ly = -26;
    const beat = S.beatAt(t);
    const conducting = m.a === 'conduct' && beat;
    if (conducting) {
      const n = beat.n, k = beat.k, ph = beat.ph;
      const size = 16 + 26 * clamp(env, 0, 1);
      // standard patterns: points each beat lands on (relative), with a bounce between
      const pts = {
        2: [[0, 1], [0.2, -0.6]],
        3: [[0, 1], [0.9, 0.4], [0.3, -0.7]],
        4: [[0, 1], [-0.8, 0.4], [0.9, 0.4], [0.2, -0.7]],
      }[n] || [[0, 1], [0.2, -0.6]];
      const a = pts[k % pts.length], b = pts[(k + 1) % pts.length];
      const e = smooth(ph);
      const bounce = Math.sin(ph * Math.PI) * 0.45;
      bx = 26 + size * lerp(a[0], b[0], e);
      by = -46 + size * (lerp(a[1], b[1], e) - bounce) * 0.8;
      lx = -26 - size * 0.4 * lerp(a[0], b[0], e) * 0.5;
      ly = -40 + size * 0.3 * (lerp(a[1], b[1], e) - bounce);
    } else if (armUp) { bx = 30; by = -78; lx = -32; ly = -70; }
    else if (m.a === 'rest') { bx = 28; by = -12; lx = -28; ly = -12; }
    if (bow > 0) { bx = 24; by = -10 + bow * 20; lx = -20; ly = -10; }
    c.strokeStyle = '#0d0a10'; c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(18, -32); c.lineTo(bx, by); c.stroke();
    c.beginPath(); c.moveTo(-18, -32); c.lineTo(lx, ly); c.stroke();
    c.fillStyle = '#9fb58e'; circle(c, bx, by, 5); c.fill(); circle(c, lx, ly, 5); c.fill();
    // baton
    c.strokeStyle = '#f4efe2'; c.lineWidth = 2.2;
    const ang = Math.atan2(by + 30, bx - 18);
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(ang) * 30, by + Math.sin(ang) * 30 - 10); c.stroke();
    // the arm that falls off at the bows
    const armOff = U.fxSince('arm', t);
    c.restore();
  }

  // ------------------------------------------------------------------ the audience in front of you
  const HEADS = [];
  (function makeHeads() {
    const r = mulberry(99);
    const rows = [[958, 36, 22], [1032, 48, 17], [1130, 66, 12]];
    for (let ri = 0; ri < rows.length; ri++) {
      const [y, rad, n] = rows[ri];
      for (let i = 0; i < n; i++) {
        const x = -120 + (i + 0.5 + (ri % 2) * 0.5) * (2160 / n) + (r() - 0.5) * 30;
        HEADS.push({ x, y: y + (r() - 0.5) * 10, r: rad * (0.85 + r() * 0.3), kind: Math.floor(r() * 9), row: ri, seed: r() * 10, zombie: r() < 0.4 });
      }
    }
  })();
  const shushes = [];   // {head, t0}

  function drawAudience(c, t, stageLight, clapping) {
    for (const h of HEADS) {
      const sh = shushes.find((s) => s.h === h && t - s.t0 < 1.8 && t >= s.t0);
      let bob = Math.sin(t * 0.7 + h.seed) * 2;
      if (clapping) bob += Math.abs(Math.sin(t * 9 + h.seed)) * 4;
      const x = h.x, y = h.y + bob, r = h.r;
      c.fillStyle = '#07040a';
      ellipse(c, x, y + r * 1.6, r * 1.6, r * 0.9); c.fill();
      if (sh) continue;      // drawn turned around below
      circle(c, x, y, r); c.fill();
      const k = h.kind;
      if (k === 0) { c.fillRect(x - r * 0.75, y - r * 2.1, r * 1.5, r * 1.4); ellipse(c, x, y - r * 0.75, r * 1.2, r * 0.22); c.fill(); }
      else if (k === 1) { ellipse(c, x, y - r * 0.95, r * 0.7, r * 0.9); c.fill(); }
      else if (k === 2) { circle(c, x - r * 0.4, y - r * 0.85, r * 0.45); c.fill(); circle(c, x + r * 0.4, y - r * 0.85, r * 0.45); c.fill(); }
      else if (k === 3) { c.save(); c.translate(x + r * 0.3, y - r * 0.4); c.rotate(0.6); c.fillRect(-r * 0.08, -r * 1.3, r * 0.16, r * 1.2); c.fillRect(-r * 0.4, -r * 1.35, r * 0.6, r * 0.38); c.restore(); }
      else if (k === 4) { c.beginPath(); c.moveTo(x - r * 0.2, y - r); c.quadraticCurveTo(x + r * 0.9, y - r * 2.4, x + r * 0.5, y - r * 0.7); c.fill(); }
      else if (k === 5) { ellipse(c, x, y - r * 0.85, r * 1.15, r * 0.3); c.fill(); ellipse(c, x, y - r * 1.05, r * 0.6, r * 0.4); c.fill(); }
      // the stage's light on top of the heads
      c.strokeStyle = rgb(stageLight, 0.3); c.lineWidth = 2.5;
      c.beginPath(); c.arc(x, y, r, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      if (h.zombie && h.row < 2) { c.fillStyle = 'rgba(150,240,110,0.5)'; circle(c, x + r * 0.5, y + r * 0.05, Math.max(1.5, r * 0.06)); c.fill(); }
      if (clapping && h.row === 2) {
        const up = Math.abs(Math.sin(t * 9 + h.seed));
        c.fillStyle = '#07040a';
        ellipse(c, x - r * 0.3 + up * 6, y + r * 0.2, r * 0.22, r * 0.3); c.fill();
        ellipse(c, x + r * 0.3 - up * 6, y + r * 0.2, r * 0.22, r * 0.3); c.fill();
      }
    }
    // the zombie who turns round to shush you
    for (const s of shushes) {
      const dt = t - s.t0;
      if (dt < 0 || dt > 1.8) continue;
      const h = s.h;
      const k = smooth(dt / 0.25) * (1 - smooth((dt - 1.5) / 0.3));
      const x = h.x, y = h.y, r = h.r;
      c.fillStyle = '#9fb58e'; circle(c, x, y, r); c.fill();
      c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#e8f0c8'; circle(c, x - r * 0.35, y - r * 0.1, r * 0.18); c.fill(); circle(c, x + r * 0.35, y - r * 0.1, r * 0.18); c.fill();
      c.fillStyle = '#1a2010'; circle(c, x - r * 0.3, y - r * 0.05, r * 0.07); c.fill(); circle(c, x + r * 0.4, y - r * 0.05, r * 0.07); c.fill();
      c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x - r * 0.55, y - r * 0.42); c.lineTo(x - r * 0.15, y - r * 0.3); c.moveTo(x + r * 0.55, y - r * 0.42); c.lineTo(x + r * 0.15, y - r * 0.3); c.stroke();
      ellipse(c, x, y + r * 0.45, r * 0.16, r * 0.12); c.fillStyle = '#2a1010'; c.fill();
      c.fillStyle = '#9fb58e'; c.fillRect(x - r * 0.06, y + r * 0.1, r * 0.12, r * 0.6);
      // the bubble
      c.globalAlpha = k;
      const bx = x + r * 0.9, by = y - r * 1.6;
      c.fillStyle = '#f6f0e0'; ellipse(c, bx, by, r * 1.3, r * 0.6); c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
      path(c, [bx - r * 0.6, by + r * 0.4, bx - r * 0.9, by + r * 0.95, bx - r * 0.2, by + r * 0.5], true); c.fillStyle = '#f6f0e0'; c.fill();
      c.fillStyle = INK; c.font = `italic 700 ${Math.round(r * 0.6)}px ${FONT_D}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('Shhh!', bx, by + 2);
      c.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ roses
  const roses = [];
  function throwRose(px, py, t) {
    const [wx, wy] = toWorld(px, py);
    const tx = clamp(wx, OPEN.l + 40, OPEN.r - 40);
    const ty = clamp(wy, 690, 790);
    roses.push({ x0: clamp(wx, 100, 1820), y0: 1200, x1: tx, y1: ty, t0: t, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12 });
    if (roses.length > 60) roses.shift();
  }
  function shush(px, py, t) {
    const [wx] = toWorld(px, py);
    let best = null, bd = 1e9;
    for (const h of HEADS) { if (h.row !== 2) continue; const d = Math.abs(h.x - wx); if (d < bd) { bd = d; best = h; } }
    if (best && !shushes.some((s) => t - s.t0 < 1.8 && t >= s.t0)) shushes.push({ h: best, t0: t });
    if (shushes.length > 10) shushes.shift();
  }
  function drawRose(c, x, y, rot, s) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    c.strokeStyle = '#2e6b2a'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 34); c.stroke();
    c.fillStyle = '#3f8a3a'; ellipse(c, 6, 18, 7, 3, -0.6); c.fill();
    c.fillStyle = '#c3122e'; circle(c, 0, -4, 9); c.fill();
    c.fillStyle = '#e83a52'; ellipse(c, -3, -7, 5, 4); c.fill(); ellipse(c, 3, -2, 4, 3); c.fill();
    c.restore();
  }
  function houseRoses(c, t) {
    const b = OP_BOWS_T();
    if (b === null || t < b + 6) return;
    for (let i = 0; i < 26; i++) {
      const t0 = b + 6 + hash(i + 300) * 16;
      const dt = t - t0;
      if (dt < 0) continue;
      const k = clamp(dt / 1.0, 0, 1);
      const x0 = 200 + hash(i + 400) * 1520, x1 = OPEN.l + 60 + hash(i + 500) * (OPEN.r - OPEN.l - 120);
      const y1 = 735 + hash(i + 600) * 45;
      const x = lerp(x0, x1, k), y = lerp(1150, y1, k) - Math.sin(k * Math.PI) * 360;
      drawRose(c, x, y, k < 1 ? dt * 7 + i : (i % 2 ? 1.5 : -1.5), lerp(2, 1, k));
    }
  }
  function drawRoses(c, t, curtain) {
    houseRoses(c, t);
    for (const r of roses) {
      const dt = t - r.t0;
      if (dt < 0) continue;
      const k = clamp(dt / 0.9, 0, 1);
      const x = lerp(r.x0, r.x1, k);
      const y = lerp(r.y0, r.y1, k) - Math.sin(k * Math.PI) * 330;
      const rot = k < 1 ? r.rot + r.spin * dt : r.rot + r.spin * 0.9;
      const s = lerp(2.2, 1.0, k);
      drawRose(c, x, y, k < 1 ? rot : Math.PI / 2 * (r.spin > 0 ? 1 : -1), s);
    }
  }

  // ------------------------------------------------------------------ one-shot effects
  function fxWindow(name, t) {
    // [since, duration] of the latest cue of this effect whose window covers t
    const f = U.fxLast(name, t);
    if (!f) return null;
    const d = +f[2] || 0;
    const since = t - f[0];
    return since <= d ? [since, d] : null;
  }
  function drawPetals(c, t) {
    const w = fxWindow('petals', t);
    if (!w) return;
    const [since, d] = w;
    const fade = smooth(since / 1.5) * (1 - smooth((since - d + 2) / 2));
    for (let i = 0; i < 46; i++) {
      const sp = 38 + hash(i) * 40;
      const y = OPEN.t - 30 + ((since * sp + hash(i + 50) * 600) % 620);
      const x = OPEN.l + hash(i + 9) * (OPEN.r - OPEN.l) + 30 * Math.sin(since * (0.8 + hash(i + 3)) + i);
      c.save(); c.translate(x, y); c.rotate(since * (1 + hash(i + 7) * 2) + i);
      c.globalAlpha = fade * 0.9;
      c.fillStyle = ['#f6c6d2', '#ffffff', '#e8445e', '#f9e0a8'][i % 4];
      ellipse(c, 0, 0, 6, 3.2); c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
  }
  function drawBell(c, t) {
    const w = fxWindow('bells', t);
    const ang = w ? 0.55 * Math.sin(w[0] * Math.PI * 2 * 1.15) * (1 - w[0] / w[1]) : 0;
    c.save(); c.translate(686, 318); c.rotate(ang);
    c.fillStyle = '#b8862e'; c.strokeStyle = INK; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-12, 6); c.quadraticCurveTo(-14, 34, -24, 44); c.lineTo(24, 44); c.quadraticCurveTo(14, 34, 12, 6); c.quadraticCurveTo(0, -2, -12, 6); c.fill(); c.stroke();
    circle(c, 0, 46 + 4 * Math.sin(ang * 6), 5); c.fill();
    c.restore();
  }
  function drawOwl(c, t) {
    const w = fxWindow('owl', t);
    const hoot = w ? Math.sin(Math.PI * w[0] / w[1]) : 0;
    const x = 468, y = 606 - hoot * 4;
    c.fillStyle = '#0d0f1a';
    ellipse(c, x, y, 15, 20); c.fill();
    circle(c, x, y - 18, 12); c.fill();
    path(c, [x - 11, y - 24, x - 8, y - 36, x - 3, y - 26], true); c.fill();
    path(c, [x + 11, y - 24, x + 8, y - 36, x + 3, y - 26], true); c.fill();
    const blink = ((t * 0.37) % 1) < 0.04;
    if (!blink) {
      emitDev(c, 'owl', x - 5, y - 18, 3 + hoot * 2);
      emitDev(c, 'owl', x + 5, y - 18, 3 + hoot * 2);
    }
  }
  function drawDirt(c, t) {
    const s = U.fxSince('graves', t);
    if (s === null || s > 2.2) return;
    for (let i = 0; i < GRAVES.length - 1; i++) {
      const x0 = sx(GRAVES[i]);
      for (let k = 0; k < 7; k++) {
        const vx = (hash(i * 9 + k) - 0.5) * 260, vy = -220 - hash(i * 7 + k) * 260;
        const tt = Math.max(0, s - hash(i * 3 + k) * 0.4);
        const x = x0 + vx * tt, y = 770 + vy * tt + 0.5 * 900 * tt * tt;
        if (y > 790 || tt <= 0) continue;
        c.fillStyle = k % 2 ? '#3b2d1c' : '#57432a';
        circle(c, x, y, 4 + (k % 3) * 2); c.fill();
      }
    }
  }
  function drawBolt(c, t, flash) {
    if (flash < 0.5) return;
    const f = U.fxLast('flash', t);
    const seed = f ? f[0] : 0;
    let x = 520 + hash(seed) * 700, y = OPEN.t;
    c.strokeStyle = 'rgba(235,240,255,0.95)'; c.lineWidth = 4; c.lineJoin = 'miter';
    c.beginPath(); c.moveTo(x, y);
    for (let k = 1; k < 9; k++) { x += (hash(seed + k) - 0.5) * 70; y += 46; c.lineTo(x, y); }
    c.stroke();
    c.strokeStyle = 'rgba(150,180,255,0.5)'; c.lineWidth = 12; c.stroke();
  }
  function drawStageFX(c, t, scene) {
    if (scene === 'piazza') { drawBell(c, t); drawPetals(c, t); }
    else { drawPetals(c, t); drawDirt(c, t); }
    // the bell swinging in its tower during the wedding
    // the hand from the grave
    const hs = U.fxSince('hand', t);
    if (scene === 'graveyard' && hs !== null && hs < 6) {
      const x = sx(0.32) - 10;
      const k = easeOut(hs / 0.6);
      c.save(); c.beginPath(); c.rect(x - 60, 600, 120, 168); c.clip();
      c.translate(x, 772 - 50 * k);
      c.rotate(0.15 * Math.sin(hs * 6));
      c.fillStyle = '#9fb58e'; c.strokeStyle = INK; c.lineWidth = 2;
      c.fillRect(-7, 0, 14, 60); c.strokeRect(-7, 0, 14, 60);
      ellipse(c, 0, -6, 13, 11); c.fill(); c.stroke();
      for (let f = 0; f < 4; f++) { c.save(); c.translate(-9 + f * 6, -14); c.rotate(-0.2 + f * 0.12 + 0.2 * Math.sin(hs * 9 + f)); c.fillRect(-2.5, -16, 5, 16); c.strokeRect(-2.5, -16, 5, 16); c.restore(); }
      c.restore();
    }
    // the scrum around the Contessa: a cartoon dust cloud
    const ea = U.fxSince('eaten', t);
    if (ea !== null && ea < 2.6) {
      const x = sx(S.charX('velena', t - ea)), y = FLOOR - 90;
      const k = 1 - smooth((ea - 1.8) / 0.8);
      c.save(); c.globalAlpha = k;
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * TAU + ea * 2;
        c.fillStyle = i % 2 ? '#cfc6b0' : '#b0a68e';
        circle(c, x + Math.cos(a) * (70 + 10 * Math.sin(ea * 12 + i)), y + Math.sin(a) * 50, 34 + 6 * Math.sin(ea * 10 + i)); c.fill();
      }
      c.fillStyle = '#e8e0c8'; circle(c, x, y, 64); c.fill();
      c.fillStyle = INK; c.font = `italic 700 28px ${FONT_D}`; c.textAlign = 'center'; c.fillText(['✶', '✷', '✸'][Math.floor(ea * 8) % 3], x + 30 * Math.sin(ea * 9), y - 20);
      c.restore();
    }
    // the hat that survives her
    const hat = U.fxSince('hat', t);
    if (hat !== null && scene === 'graveyard' && !(OP_BOWS_T() !== null && t > OP_BOWS_T() + 2.5)) {
      const x0 = sx(S.charX('velena', t - hat));
      // up out of the scrum, then a slow pendulum fall onto the boards, where it stays
      let x, yy, rot;
      if (hat < 0.7) { const k = Math.sin(hat / 0.7 * Math.PI / 2); x = x0; yy = FLOOR - 150 - 220 * k; rot = hat * 6; }
      else {
        const fall = Math.min(hat - 0.7, 5.2);
        x = x0 + 40 * Math.sin(fall * 2.2) + fall * 14;
        yy = FLOOR - 370 + fall * 70;
        rot = hat - 0.7 >= 5.2 ? 0.12 : 0.35 * Math.sin(fall * 2.2);
      }
      c.save(); c.translate(x, yy); c.rotate(rot);
      c.fillStyle = '#2a0f33'; ellipse(c, 0, 0, 48, 8); c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
      c.fillRect(-19, -19, 38, 19);
      c.fillStyle = '#9e5bbf';
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(8, -15); c.quadraticCurveTo(35 + k * 8, -55 - k * 6, 52 + k * 5, -22 - k * 10); c.quadraticCurveTo(30, -28, 8, -15); c.fill(); }
      c.restore();
    }
    // the bite: a burst
    const bi = U.fxSince('bite', t);
    if (bi !== null && bi < 0.7) {
      const x = (sx(S.charX('livia', t)) + sx(S.charX('amadeo', t))) / 2, y = FLOOR - 220;
      const k = easeOut(bi / 0.25) * (1 - smooth((bi - 0.4) / 0.3));
      c.save(); c.translate(x, y); c.scale(k, k);
      c.fillStyle = '#fff2c0'; c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath();
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, rr = i % 2 ? 34 : 70; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.75); }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#b3121f'; c.font = `italic 900 30px ${FONT_D}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CHOMP', 0, 2);
      c.restore();
    }
    // Amadeo's arm at the curtain call
    const arm = U.fxSince('arm', t);
    if (arm !== null) {
      const x = sx(S.charX('amadeo', t)) + 40;
      const k = clamp(arm / 0.5, 0, 1);
      c.save(); c.translate(x, lerp(FLOOR - 150, FLOOR - 8, easeIn(k))); c.rotate(k * 1.4);
      c.strokeStyle = INK; c.lineWidth = 15; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -30); c.lineTo(0, 30); c.stroke();
      c.strokeStyle = '#2a2a38'; c.lineWidth = 11; c.stroke();
      c.fillStyle = '#9fb58e'; circle(c, 0, 34, 7); c.fill();
      c.restore();
    }
  }

  // ------------------------------------------------------------------ the frame
  let lastT = 0;
  function render(t, opts) {
    opts = opts || {};
    const dt = opts.dt === undefined ? 1 / 60 : opts.dt;
    updateCamera(t, dt);
    const tremble = U.fxSince('tremble', t);
    cam.shake = tremble !== null && tremble < 4.0 ? 0.6 * Math.sin(Math.PI * tremble / 4.0) : 0;
    const shakeGraves = U.fxSince('graves', t);
    if (shakeGraves !== null && shakeGraves < 2) cam.shake = Math.max(cam.shake, 0.7 * (1 - shakeGraves / 2));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07030a'; ctx.fillRect(0, 0, cv.width, cv.height);
    applyCam(ctx);
    const c = ctx;
    const house = S.houseAt(t);
    blitHouse(c, caches.house, caches.houseDark, house);
    const scene = S.sceneAt(t);
    const L = S.lightAt(t);
    // lightning
    const fl = U.fxSince('flash', t);
    let flash = 0;
    if (fl !== null && fl < 0.9) flash = (fl < 0.08 ? 1 : fl < 0.16 ? 0.2 : fl < 0.24 ? 0.8 : Math.max(0, 1 - fl)) * (reduced ? 0.25 : 1);
    const curtain = S.curtainAt(t);
    // ---- the stage
    c.save();
    c.beginPath(); c.rect(OPEN.l, OPEN.t, OPEN.r - OPEN.l, OPEN.b - OPEN.t + 4); c.clip();
    if (curtain > 0.001) {
      blit(c, scene === 'piazza' ? caches.piazza : caches.grave);
      if (scene === 'graveyard') {
        // stars
        c.fillStyle = '#fff';
        for (let k = 0; k < 60; k++) {
          const x = OPEN.l + hash(k) * (OPEN.r - OPEN.l), y = OPEN.t + 20 + hash(k + 99) * 260;
          const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.5 + hash(k + 7)) + k));
          c.globalAlpha = 0.6 * tw * L.sky; c.fillRect(x, y, 2, 2);
        }
        c.globalAlpha = 1;
        drawGraves(c, t, graveOpen(t));
        drawOwl(c, t);
        const lp = S.charPose('livia', t).name;
        const risen = U.fxSince('hand', t) !== null ? 1 : 0;
        drawLiviaGrave(c, t, risen);
        drawDead(c, t);
      }
      drawVillagers(c, t, scene);
      drawSoloists(c, t, scene);
      if (scene === 'graveyard') {
        // the front lip of Livia's grave hides her legs while she rises
        const x = sx(0.32);
        c.fillStyle = '#4a3a26'; c.beginPath(); c.moveTo(x - 70, 790); c.quadraticCurveTo(x, 760, x + 70, 790); c.fill();
      }
      drawStageFX(c, t, scene);
      drawLighting(c, t, L, scene);
      drawEmissive(c, t, L, scene);
      drawFog(c, t, L);
      if (flash > 0) { c.fillStyle = `rgba(220,230,255,${0.6 * flash})`; c.fillRect(OPEN.l, OPEN.t, OPEN.r - OPEN.l, OPEN.b - OPEN.t); if (!reduced) drawBolt(c, t, flash); }
    } else {
      emissive.length = 0;
    }
    drawCurtain(c, curtain, 0.55 + 0.45 * house);
    c.restore();
    blit(c, caches.valance);
    drawBoard(c);
    // footlights
    c.save(); c.globalCompositeOperation = 'lighter';
    const fA = 0.18 + 0.36 * Math.max(curtain * L.lvl, 0.4 * (1 - house));
    for (let x = OPEN.l + 24; x < OPEN.r; x += 44) {
      c.fillStyle = radial(c, x, OPEN.b - 2, 1, 40, [[0, `rgba(255,220,160,${fA})`], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(x - 40, OPEN.b - 42, 80, 60);
    }
    c.restore();
    // ---- the pit
    drawPit(c, t, house);
    drawMaestro(c, t, S.envAt(t));
    const hk = 0.3 + 0.7 * house;
    c.fillStyle = vgrad(c, 902, 945, [[0, rgb([74 * hk, 26 * hk, 16 * hk])], [0.3, rgb([42 * hk, 12 * hk, 7 * hk])], [1, '#120403']]); c.fillRect(150, 902, 1620, 43);
    c.fillStyle = rgb([200 * hk + 30, 160 * hk + 20, 80 * hk + 10]); c.fillRect(150, 898, 1620, 6);
    // ---- the audience
    const stageCol = curtain > 0.05 ? mixc([255, 200, 160], L.amb, 0.6) : [200, 60, 60];
    const bowsT = OP_BOWS_T();
    drawAudience(c, t, stageCol, bowsT !== null && t > bowsT && t < bowsT + 26);
    // the chandelier glows when the house lights are up
    if (house > 0.02) {
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = radial(c, 960, -110, 10, 420, [[0, `rgba(255,220,160,${0.45 * house})`], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(540, -530, 840, 840);
      c.restore();
    }
    drawRoses(c, t, curtain);
    if (flash > 0) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = `rgba(200,215,255,${0.12 * flash})`; c.fillRect(0, 0, cv.width, cv.height);
    }
    lastT = t;
  }

  let showBoard = true;
  function setBoard(v) { showBoard = !!v; }
  function drawBoard(c) {
    if (!showBoard) return;
    const x0 = 640, x1 = 1280, y0 = OPEN.t + 30, y1 = OPEN.t + 92;
    c.strokeStyle = 'rgba(210,190,140,0.55)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x0 + 50, OPEN.t - 6); c.lineTo(x0 + 50, y0); c.moveTo(x1 - 50, OPEN.t - 6); c.lineTo(x1 - 50, y0); c.stroke();
    c.fillStyle = 'rgba(8,4,7,0.94)';
    c.beginPath(); c.roundRect ? c.roundRect(x0, y0, x1 - x0, y1 - y0, 6) : c.rect(x0, y0, x1 - x0, y1 - y0); c.fill();
    c.strokeStyle = '#a5802c'; c.lineWidth = 2; c.stroke();
  }

  let BOWS_T = undefined;
  function OP_BOWS_T() {
    if (BOWS_T === undefined) { const ch = window.OPERA.chapters.find((x) => x[1] === 'bows'); BOWS_T = ch ? ch[0] : null; }
    return BOWS_T;
  }

  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext('2d');
  }

  // where the surtitle board sits on screen (for the page to lay the text over it)
  function boardRect() {
    const [x0, y0] = toScreen(640, OPEN.t + 30);
    const [x1, y1] = toScreen(1280, OPEN.t + 92);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, portrait: cam.portrait };
  }
  function stageRect() {
    const [x0, y0] = toScreen(OPEN.l, OPEN.t);
    const [x1, y1] = toScreen(OPEN.r, OPEN.b);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function hitStage(px, py) { const [x, y] = toWorld(px, py); return x > OPEN.l && x < OPEN.r && y > OPEN.t && y < OPEN.b + 20; }

  window.Theatre = { init, resize, render, throwRose, shush, boardRect, stageRect, hitStage, setReduced, setBoard, setThumb, rebuild: buildCaches };
})();
