# RemoteFunLand

## Lissajous Nocturne

A 77-second audio-visual demo in a single file: [`index.html`](index.html).

Two tones play on the left and right channels and steer the beam of a simulated
X–Y oscilloscope. The left channel moves it sideways and the right moves it up and
down, so each musical interval (2 : 3, 3 : 4, 4 : 5 …) draws its own Lissajous figure.
Kick, snare, hats and bass go to the speakers on a separate bus, so they appear only
as a duck in the figure on each kick and in the FFT strip.

Everything is generated live with the Web Audio API and drawn on `<canvas>`. There
are no audio files and no dependencies apart from two Google Fonts.

### Run it

Open `index.html` in a browser and press **Play**. Turn the sound on; headphones help.

You can also serve the folder if you prefer:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

### Structure of the piece

| Time | Section        | Bars  | What happens                                                    |
| ---- | -------------- | ----- | --------------------------------------------------------------- |
| 0:00 | Warm-up        | 1–4   | One channel, then both, in unison at 110 Hz                     |
| 0:09 | Just intervals | 5–12  | Right channel walks through whole-number ratios over a held A   |
| 0:28 | Pulse          | 13–20 | Kick and bass enter; each kick ducks the beam                   |
| 0:48 | Arpeggio       | 21–28 | Sixteenth-note arpeggio on the right channel                    |
| 1:07 | Afterglow      | 29–32 | Drums drop out, the figure collapses to a dot                   |

Controls: play/pause (Space), restart, jump to any cue, scrub by bar, phosphor
persistence, beam intensity and full screen.
