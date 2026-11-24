# Bringing the Tape 3 look to Unity on low-end Android

Short answer: yes, and it is one of the friendlier horror looks for weak phones. Night vision is
monochrome, noisy, low resolution and mostly dark, which hides exactly what cheap GPUs can't do.
This note is how I'd port the look of this demo to a Unity game, what to change from the web
version, and what it should cost.

The web version this is based on lives next to this file: `post.js` is the tape playback shader,
`shots.js` the infrared lighting and eyeshine, `score.js` the timeline. The soundtrack is made by
`tools/cradlesong_tape_audio.py` in the repository.

## Target

- Low-end Android GPUs: Mali-G52/G57, PowerVR GE8320, Adreno 610-class.
- 30 fps (33 ms a frame), and it has to hold after ten minutes of thermal throttling.
- URP on Unity 2022.3 LTS or Unity 6, OpenGL ES 3 or Vulkan.

## The plan

1. **Render small on purpose.** Set the URP Asset's Render Scale so the scene draws at roughly
   480 lines (bilinear or point upscaling). A real camcorder resolves about 250-330 lines of
   detail, so the low resolution *is* the look, not a compromise. This is the biggest single
   saving, because fill rate is what low-end phones run out of first.
2. **One full-screen pass for the whole tape look.** A Full Screen Pass Renderer Feature (URP 14
   and later) with one material does everything `post.js` does: green ramp, grain, per-line
   jitter, the tracking band, head-switching noise along the bottom, tears, static, vignette.
   They are all UV offsets and a little math in one shader, with about six texture reads. A sketch
   is below.
3. **An infrared lamp without lights.** Use an unlit shader where brightness = albedo x distance
   falloff from the camera (`shots.js` uses `(5 / distance) ^ 1.35`, clamped), fading to black.
   That *is* the camcorder's lamp, it costs almost nothing, and it means no real-time lights and
   no shadows, the most expensive things on these GPUs. Keep the far clip plane short (30-40 m);
   nothing past the lamp is visible anyway.
4. **Eyeshine without bloom.** Bake two small quads into each zombie mesh with an additive
   glow texture and full emission. The "eyes in the dark" moments come from these, not from a
   bloom pass.
5. **Crowds.** The dead mostly stand and sway. Draw them as instanced meshes
   (`Graphics.RenderMeshInstanced` or BatchRendererGroup, not one SkinnedMeshRenderer each) with
   the sway in the vertex shader; bake walkers into vertex-animation textures; use flat
   impostors far away. "Every head turns to the camera at once" becomes a single global shader
   property. A few hundred figures stay cheap that way.
6. **The overlay** (REC, NIGHT, tape counter, date stamp): TextMeshPro on a Screen Space - Camera
   canvas, so it is drawn before the tape pass and gets the same jitter and grain, like a stamp
   burned into the tape. Use Screen Space - Overlay instead if you want it crisp.
7. **Audio.** Pre-rendered stems for the hums, the choir and the whispers (no synthesis at
   runtime). In the Audio Mixer, a Compressor with plenty of make-up gain behaves like the
   camcorder's automatic gain; a hiss bed whose volume a script raises when things go quiet gives
   the "silence fills with noise" effect; a Lowpass snapshot is the hand closing over the mic.

## What to change from the web version

- **Drop the bloom built from mipmaps** (`textureLod` at levels 3 and 5 in `post.js`). On a phone
  it means generating mipmaps every frame, an extra chain of passes. The eyeshine quads replace it.
- **Drop the chromatic aberration.** It costs extra reads and doesn't show in monochrome.
- **Use a noise texture instead of the hash functions.** The `fract(sin(...))`-style hashes in
  `post.js` break down at the half precision mobile GPUs run fragment shaders at, and show up as
  patterns and bands. A tiling 128x128 noise texture sampled with a per-frame random offset is
  cheaper and reliable.
- **Keep it to that one pass.** Mobile GPUs are tile based: every extra full-screen pass writes
  and reads the whole frame through memory. Turn off what forces extra copies unless you need it:
  Opaque Texture, Depth Texture, HDR, MSAA, and URP's own post-processing stack.
- **Digital zoom and autofocus:** do the zoom with the camera's field of view plus point sampling
  for the blocky look. Skip the autofocus blur, or fake it by briefly cross-fading to a
  quarter-resolution copy.

| `post.js` uniform | Unity property | What it does |
| --- | --- | --- |
| `uMode` | `_NightVision` | 1 = green night vision, 0 = colour (the VCR's blue screen) |
| `uGrain` | `_Grain` | grain |
| `uJit` | `_Jitter` | per-line horizontal jitter, in pixels |
| `uTrack` | `_Track` | the tracking band drifting down the picture |
| `uTear` | `_Tear` | the tear between takes |
| `uStatic` | `_Static` | static |
| `uRoll` | `_Roll` | vertical roll |
| `uPix`, `uBlur` | (see above) | digital zoom blocks, autofocus |
| `uBloom` | (dropped) | eyeshine quads instead |

## Shader sketch

A starting point for the Full Screen Pass Renderer Feature (set its requirements to Color). It is
written from the web shader without a Unity install, so it hasn't been compiled: expect to fix
small things. `_NoiseTex` is any tiling grey-noise texture (wrap: Repeat); `_Ramp` is a 256x1
gradient from near-black through green to white.

```hlsl
Shader "Cradlesong/TapePlayback"
{
    Properties
    {
        _NoiseTex ("Noise (tiling)", 2D) = "gray" {}
        _Ramp ("Night-vision ramp", 2D) = "white" {}
        _Grain ("Grain", Range(0, 1)) = 0.11
        _Jitter ("Line jitter (px)", Range(0, 40)) = 1.2
        _Track ("Tracking band", Range(0, 3)) = 0.15
        _Tear ("Tear", Range(0, 2)) = 0
        _Static ("Static", Range(0, 1)) = 0
        _Roll ("Vertical roll", Range(0, 1)) = 0
        _NightVision ("Night vision", Range(0, 1)) = 1
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" }
        ZWrite Off Cull Off ZTest Always
        Pass
        {
            Name "TapePlayback"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"

            TEXTURE2D(_NoiseTex); SAMPLER(sampler_NoiseTex);
            TEXTURE2D(_Ramp);     SAMPLER(sampler_Ramp);
            half _Grain, _Jitter, _Track, _Tear, _Static, _Roll, _NightVision;
            float _Frame;   // set from C# about 30 times a second, so the grain moves like tape

            half Noise(float2 p) { return SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, p).r; }

            half4 Frag(Varyings i) : SV_Target
            {
                float2 uv = i.texcoord;
                uv.y = frac(uv.y + _Roll);
                float row = floor(uv.y * 480.0);                         // a VHS frame has ~480 lines
                float2 rnd = float2(row / 480.0, frac(_Frame * 0.618));   // one noise value per line per frame
                float j = (Noise(rnd) - 0.5) * _Jitter / _ScreenParams.x;
                half band = saturate(1 - abs(uv.y - frac(_Time.y * 0.11)) / 0.05) * _Track;
                j += band * (Noise(rnd + 0.37) - 0.25) * 0.035;
                j += _Tear * (Noise(float2(floor(uv.y * 14.0) / 14.0, rnd.y)) - 0.5) * 0.12;
                j += (1 - smoothstep(0.015, 0.038, uv.y)) * 0.02;         // head-switching noise at the bottom
                uv.x += j;

                // three taps sideways: tape is soft horizontally
                float2 px = float2(1.5 / _ScreenParams.x, 0);
                half3 c = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv).rgb * 0.5
                        + SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv - px).rgb * 0.25
                        + SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv + px).rgb * 0.25;

                half g = Noise(i.texcoord * (_ScreenParams.xy / 128.0) + frac(_Frame * float2(0.37, 0.71))) - 0.5;
                half l = saturate(dot(c, half3(0.299, 0.587, 0.114)) + g * _Grain);
                half3 nv = SAMPLE_TEXTURE2D(_Ramp, sampler_Ramp, float2(l, 0.5)).rgb;
                c = lerp(c + g * _Grain, nv, _NightVision);

                c += band * step(0.9, Noise(float2(i.texcoord.x * 0.4, rnd.y + row))) * 0.55;
                half2 v = (half2)(i.texcoord - 0.5) * half2(_ScreenParams.x / _ScreenParams.y, 1);
                c *= 1 - 0.55 * smoothstep(0.3, 0.75, length(v));
                c = lerp(c, Noise(i.texcoord * (_ScreenParams.xy / 192.0) + rnd).xxx, _Static);
                return half4(c, 1);
            }
            ENDHLSL
        }
    }
}
```

And the game can drive it, so the tape reacts to what's around the player:

```csharp
using UnityEngine;

public class TapeDriver : MonoBehaviour
{
    public Material tape;                          // the material on the Full Screen Pass Renderer Feature
    [Range(0, 1)] public float interference;       // e.g. from the distance to the nearest of the dead

    void Update()
    {
        tape.SetFloat("_Frame", Mathf.Floor(Time.time * 30f));
        tape.SetFloat("_Track", 0.15f + 1.5f * interference);
        tape.SetFloat("_Tear", interference > 0.8f ? (interference - 0.8f) * 5f : 0f);
        tape.SetFloat("_Static", Random.value < interference * 0.02f ? 0.5f : 0f);
    }
}
```

## What it should cost

On Mali-G52/G57 or PowerVR GE8320-class phones I'd expect the tape pass at about 480 lines to
cost a few milliseconds a frame, well inside a 30 fps budget, with the infrared-lit scene and an
instanced crowd costing less than a conventionally lit one would. These are estimates, so profile
on a real device:

- a Development Build with the Unity Profiler attached over USB;
- Arm Performance Studio (Streamline, and the Mali Offline Compiler to count the shader's cycles),
  Snapdragon Profiler on Adreno, or Android GPU Inspector;
- a ten-minute soak test, since cheap phones throttle; drop the render scale a step if it sags.

## Make the artifacts gameplay

- Interference (tracking band, tears, static) that rises as the dead get closer.
- A battery that drains while the infrared lamp is on, and dies at the worst moment.
- Digital zoom that falls apart into blocks the further you push it.
- The automatic gain raising the hiss when it goes quiet, so silence itself becomes a warning.
