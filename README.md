# RemoteFunLand

A playground of small browser demos, each built in a Claude Code cloud session and
published as a single static page.

**Live gallery:** https://miikka-boom.github.io/RemoteFunLand/

## Demos

| No. | Demo | What it is |
| --- | ---- | ---------- |
| 008 | [Strung Out](https://miikka-boom.github.io/RemoteFunLand/strung-out/) | A psychedelic 1970s marionette on a WebGL liquid light show: drag its hands, head and feet by their strings (multi-touch on phones), record over a 1, 2 or 4-bar loop at 88, 100 or 112 BPM, overdub lane by lane with undo, and share the dance as a link. The hands stir the paint and open a wah on the synthesized dorian funk vamp. |
| 007 | [Dance Deck](https://miikka-boom.github.io/RemoteFunLand/dance-deck/) | An interactive dance sequencer for phones: drag 17 robot moves (the original keys, New Moves, Human Mode poses and the motion capture) into an 8-slot, 16-count loop that the crew keeps dancing, with four synthesized beats, three tempos, mirror and canon, and a shareable link. |
| 006 | [Human Mode](https://miikka-boom.github.io/RemoteFunLand/human-mode/) | A 3:12 music video for the song “Human Mode”, synced to its measured 122 BPM beat grid: sixteen robots rehearse in stepped unison until Unit 04 goes human (the Blender file’s motion capture), then everyone does. Lights follow the track’s own kick and hi-hats. |
| 005 | [Circumambulatio](https://miikka-boom.github.io/RemoteFunLand/circumambulatio/) | A minute and a half. A little tangram square looks for a shadow that fits, and finds the other six pieces holding open a hole the shape of itself. |
| 004 | [New Moves](https://miikka-boom.github.io/RemoteFunLand/new-moves/) | Three original 64-count dances (Signal Boost, Static Shuffle, Overdrive) composed with `tools/new_moves.py` by mirroring, mixing and aiming poses sampled from the original Blender keys, staged on the Antenna Aerobics set with a synthesized track for each. |
| 003 | [Antenna Aerobics](https://miikka-boom.github.io/RemoteFunLand/antenna-aerobics/) | The robots, rig and dance from `robot_CameraWork.blend`, exported to glTF and staged in three.js: a 90-second aerobics class to an original Web Audio score at 150 BPM, ending in a 16-robot party with the file’s hidden PARTY sign and disco ball. |
| 002 | [The Alchemist’s Spread](https://miikka-boom.github.io/RemoteFunLand/alchemists-spread/) | Three random Tarot de Marseille cards become a 2:24 audio-visual ritual after Jodorowsky’s *The Holy Mountain*: three painted tableaux, an ascent to gold and a pull-back to the film set. Canvas 2D at 30 fps, adapting its resolution for low-end devices. |
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
