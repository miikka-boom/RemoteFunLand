# RemoteFunLand

A playground of small browser demos, each built in a Claude Code cloud session and
published as a single static page.

**Live gallery:** https://miikka-boom.github.io/RemoteFunLand/

## Demos

| No. | Demo | What it is |
| --- | ---- | ---------- |
| 001 | [Lissajous Nocturne](https://miikka-boom.github.io/RemoteFunLand/lissajous-nocturne/) | A 77-second Web Audio piece whose left and right channels steer a simulated X–Y oscilloscope, so each musical interval draws its own Lissajous figure. |

## How it works

- Each demo lives in its own folder with an `index.html` and is served at
  `/RemoteFunLand/<folder>/`. The root `index.html` is the gallery.
- GitHub Pages publishes the `main` branch. A new demo is built on a session branch
  and merged into `main` through a pull request; Pages republishes about a minute
  after the merge.
- The conventions for new demos are in [`CLAUDE.md`](CLAUDE.md).

## Run locally

Open any `index.html` directly in a browser, or serve the repo:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```
