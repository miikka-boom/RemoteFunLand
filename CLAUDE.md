# RemoteFunLand

A public playground of small browser demos. GitHub Pages publishes the `main` branch
to https://miikka-boom.github.io/RemoteFunLand/. Each demo is one static page in its
own folder, built in a Claude Code cloud session.

## Layout

- `index.html` is the gallery: one `<li class="entry">` per demo, newest first.
- `<slug>/index.html` is a demo, served at `/RemoteFunLand/<slug>/`.
- `<slug>/thumb.jpg` is the demo's gallery thumbnail (shown cropped to 16:10).
- `tools/thumb.cjs` captures that thumbnail with Playwright.
- `.nojekyll` makes Pages serve files as-is instead of running Jekyll. Keep it.

## Adding a demo

1. Pick a short kebab-case slug and create `<slug>/index.html`.
2. Keep it static and self-contained: HTML, CSS, JS and assets inside the folder. No
   build step and no server. Libraries come from a CDN at a pinned exact version
   (cdnjs, jsDelivr, unpkg) or are copied into the folder.
3. Use relative paths only (`./data.json`, `../`). The site lives under
   `/RemoteFunLand/`, so a root path like `/app.js` breaks.
4. Put a link back to the gallery (`href="../"`) at the top of the page.
5. Make it work at phone width (about 390px) with no horizontal scrolling. Audio may
   only start from a click or tap. Respect `prefers-reduced-motion` where it matters.
6. Add an entry at the top of the list in the root `index.html`: copy the existing
   `<li class="entry">` block, give it the next number (`No. 002`, …), today's date,
   a one-sentence description and two or three tags. Add a row to `README.md` too.
7. Capture the thumbnail, for example:
   `node tools/thumb.cjs <slug> --click "#play" --wait 2500`
   (add `--el "<selector>"` to frame just the interesting part).
8. Check it before opening a pull request: load `<slug>/index.html` and the gallery
   with Playwright over `file://`, confirm there are no console errors and that the
   page fits a 390px-wide viewport, and look at a screenshot.

## Publishing

- Work on the session's own branch and open a pull request into `main`. Merging it
  publishes the change; the "pages build and deployment" Actions run takes about a
  minute.
- Don't push straight to `main` unless the user asks for it.
- The cloud environment's network policy may block `*.github.io`. If the live site
  can't be fetched, confirm the deploy through that Actions run instead.

## Rules

- Everything in this repo and on the site is public. Never commit API keys, tokens
  or personal data, including inside client-side JavaScript.
- Keep each demo small (aim for under 10 MB). The whole published site must stay
  under GitHub Pages' 1 GB limit.
- Don't change another demo's folder unless the task is about that demo.
