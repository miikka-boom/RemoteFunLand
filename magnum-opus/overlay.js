// PLACEHOLDER typography layer. Replace with the real overlay.
(() => {
  const cinzel = new FontFace('Cinzel', 'url(fonts/cinzel-latin.woff2)', { weight: '400 900' });
  MO.waitFor(cinzel.load().then((f) => document.fonts.add(f)).catch((e) => console.warn('font', e)));
  MO.overlay((ctx, t, W, H, MO) => {
    const s = H / 1080;
    const sec = MO.section(t);
    ctx.font = `900 ${Math.round(40 * s)}px Cinzel`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textBaseline = 'top';
    ctx.fillText(`${sec.arcana} · ${sec.stage.toUpperCase()}`, 40 * s, 36 * s);
    return true;
  });
})();
