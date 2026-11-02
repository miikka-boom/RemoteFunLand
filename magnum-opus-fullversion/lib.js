// Shared GLSL for every scene. The engine prepends MO_HEADER + MO_LIB to each scene's
// fragment shader, so every function here is available in every scene.
// Conventions: GLSL ES 3.00, output linear HDR colour (values above 1 bloom); the post
// pass does bloom, ACES tone mapping and sRGB gamma.
window.MO_HEADER = `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform vec2  uRes;      // render-target size in pixels (16:9)
uniform float uTime;     // global seconds, 0..SCORE.duration
uniform float uLocal;    // seconds since this scene started
uniform float uDur;      // this scene's length in seconds
uniform float uBeat;     // global beat position (float), 136 BPM
uniform float uBar;      // global bar position (float)
uniform float uKick;     // drum envelopes: 1 at the hit, decaying (see engine.js)
uniform float uClap;
uniform float uHat;
uniform float uOpenHat;
uniform float uRoll;
uniform float uCrash;    // crash / orch hit / gong / sub drop envelope (slow decay)
uniform float uKickN;    // number of kicks so far (for alternating moves)
uniform float uClapN;
uniform float uEnergy;   // arrangement energy 0..1, interpolated per bar
uniform float uChord;    // index of the current chord in SCORE.chords
uniform float uReduced;  // 1 when the viewer asked for less flashing / motion
`;

window.MO_LIB = `
#define PI  3.14159265359
#define TAU 6.28318530718
#define PHI 1.61803398875

// ---------- basics ----------
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3  sat(vec3 x)  { return clamp(x, 0.0, 1.0); }
float remap(float x, float a, float b) { return sat((x - a) / (b - a)); }
float easeOut(float x) { x = sat(x); return 1.0 - (1.0 - x) * (1.0 - x) * (1.0 - x); }
float easeIn(float x)  { x = sat(x); return x * x * x; }
float easeInOut(float x) { x = sat(x); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) * 0.5; }
// window that rises over [a, a+fi] and falls over [b-fo, b]
float window01(float t, float a, float b, float fi, float fo) { return remap(t, a, a + fi) * (1.0 - remap(t, b - fo, b)); }
// centred, aspect-correct coordinates: y in [-1, 1], x in [-16/9, 16/9]
vec2 uvCentered(vec2 fc) { return (2.0 * fc - uRes) / uRes.y; }
// 1 pixel in uvCentered units
float px() { return 2.0 / uRes.y; }

// ---------- hashing / noise ----------
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3  hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash33(i).x, n100 = hash33(i + vec3(1,0,0)).x, n010 = hash33(i + vec3(0,1,0)).x, n110 = hash33(i + vec3(1,1,0)).x;
  float n001 = hash33(i + vec3(0,0,1)).x, n101 = hash33(i + vec3(1,0,1)).x, n011 = hash33(i + vec3(0,1,1)).x, n111 = hash33(i + vec3(1,1,1)).x;
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = m * p; a *= 0.5; } return s; }
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// ridged noise: thin bright ridges, good for nerves, veins, filaments
float ridge(vec2 p) { return 1.0 - abs(2.0 * vnoise(p) - 1.0); }
float ridgedFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { float r = ridge(p); s += a * r * r; p = rot(0.7) * p * 2.1; a *= 0.5; } return s; }
// voronoi: x = distance to nearest cell point, y = distance to the cell edge, zw = cell id
vec4 voronoi(vec2 p) {
  vec2 n = floor(p), f = fract(p), mg, mr; float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)); vec2 o = hash22(n + g); vec2 r = g + o - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float me = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j)); vec2 o = hash22(n + g); vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 0.00001) me = min(me, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec4(sqrt(md), me, n + mg);
}

// ---------- colour ----------
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), sat(p - 1.0), c.y); }
// Inigo Quilez cosine palette
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(TAU * (c * t + d)); }
vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }
// the seven chakra colours, root (0) to crown (6), linear-ish and saturated
vec3 chakraColor(float i) {
  i = clamp(i, 0.0, 6.0);
  vec3 c0 = vec3(0.95, 0.06, 0.08), c1 = vec3(1.0, 0.38, 0.02), c2 = vec3(1.0, 0.82, 0.05), c3 = vec3(0.10, 0.90, 0.25);
  vec3 c4 = vec3(0.05, 0.50, 1.0), c5 = vec3(0.30, 0.12, 1.0), c6 = vec3(0.85, 0.35, 1.0);
  vec3 c = c0;
  c = mix(c, c1, sat(i - 0.0)); c = mix(c, c2, sat(i - 1.0)); c = mix(c, c3, sat(i - 2.0));
  c = mix(c, c4, sat(i - 3.0)); c = mix(c, c5, sat(i - 4.0)); c = mix(c, c6, sat(i - 5.0));
  return c;
}
// alchemical stage palette: 0 nigredo (ink), 1 albedo (silver-cyan), 2 citrinitas (gold), 3 rubedo (crimson)
vec3 stageColor(float s) {
  vec3 n = vec3(0.10, 0.06, 0.16), a = vec3(0.75, 0.90, 1.0), c = vec3(1.0, 0.72, 0.18), r = vec3(1.0, 0.12, 0.10);
  s = clamp(s, 0.0, 3.0);
  return mix(mix(mix(n, a, sat(s)), c, sat(s - 1.0)), r, sat(s - 2.0));
}

// ---------- 2D SDF ----------
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) { return sdSegment(p, a, b) - r; }
// capsule whose radius goes from ra at a to rb at b
float sdTaper(vec2 p, vec2 a, vec2 b, float ra, float rb) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h) - mix(ra, rb, h); }
float sdEllipse(vec2 p, vec2 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
float sdTriangle(vec2 p, float r) { const float k = 1.7320508; p.x = abs(p.x) - r; p.y = p.y + r / k; if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0; p.x -= clamp(p.x, -2.0 * r, 0.0); return -length(p) * sign(p.y); }
float sdRing(vec2 p, float r, float w) { return abs(length(p) - r) - w; }
// vertical vesica / almond (the mandorla): two circle arcs, half width w < half height h.
// For a horizontal eye shape call sdVesica(p.yx, halfHeight, halfWidth).
float sdVesica(vec2 p, float w, float h) { p = abs(p); float d = 0.5 * (h * h / w - w); float r = w + d; return ((p.y - h) * d > p.x * h) ? length(p - vec2(0.0, h)) : length(p - vec2(-d, 0.0)) - r; }
float sdStar(vec2 p, float r, float n, float m) { float an = PI / n, en = PI / m; vec2 acs = vec2(cos(an), sin(an)), ecs = vec2(cos(en), sin(en)); float bn = mod(atan(p.x, p.y), 2.0 * an) - an; p = length(p) * vec2(cos(bn), abs(sin(bn))); p -= r * acs; p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y); return length(p) * sign(p.x); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
// anti-aliased fill / line from an SDF (aa = pixel size in the SDF's units)
float fill(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }
float stroke(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
// soft glow falloff around an SDF edge
float glow(float d, float k) { return 1.0 / (1.0 + k * max(d, 0.0) * k * max(d, 0.0)); }
float glowExp(float d, float k) { return exp(-k * max(d, 0.0)); }

// ---------- symmetry / mandala ----------
// fold p into one wedge of an n-fold kaleidoscope (mirrored)
vec2 kaleido(vec2 p, float n) { float a = atan(p.y, p.x), r = length(p); float w = TAU / n; a = mod(a + 0.5 * w, w) - 0.5 * w; a = abs(a); return r * vec2(cos(a), sin(a)); }
// polar repetition without mirroring; returns the folded point, id in .z
vec3 polarRep(vec2 p, float n) { float w = TAU / n; float a = atan(p.y, p.x) + 0.5 * w; float id = floor(a / w); a = mod(a, w) - 0.5 * w; return vec3(length(p) * vec2(cos(a), sin(a)), id); }

// ---------- the human figure (front view, Sacred-Mirrors pose) ----------
// Body space: feet at y = -1, top of head at y = +1, x = 0 is the midline.
// arms: 0 = arms hanging slightly out, palms forward; 1 = arms raised in a V (the World dancer / triumph)
float sdBody(vec2 p, float arms) {
  vec2 q = vec2(abs(p.x), p.y);                       // bilateral symmetry
  float head = sdEllipse(p - vec2(0.0, 0.84), vec2(0.105, 0.135));
  float neck = sdCapsule(q, vec2(0.0, 0.66), vec2(0.0, 0.74), 0.045);
  float chest = sdEllipse(p - vec2(0.0, 0.47), vec2(0.20, 0.17));
  float waist = sdEllipse(p - vec2(0.0, 0.22), vec2(0.145, 0.16));
  float pelvis = sdEllipse(p - vec2(0.0, 0.03), vec2(0.17, 0.11));
  float trap = sdTaper(q, vec2(0.0, 0.66), vec2(0.20, 0.585), 0.06, 0.055);
  float torso = smin(smin(chest, waist, 0.12), pelvis, 0.10);
  torso = smin(torso, trap, 0.06);
  // arms: shoulder -> elbow -> wrist, blended between hanging (a=0) and raised V (a=1)
  vec2 sh = vec2(0.205, 0.575);
  vec2 el = mix(vec2(0.285, 0.29), vec2(0.40, 0.80), arms);
  vec2 wr = mix(vec2(0.33, 0.02), vec2(0.52, 1.04), arms);
  vec2 hd = mix(vec2(0.35, -0.08), vec2(0.56, 1.13), arms);
  float upper = sdTaper(q, sh, el, 0.058, 0.043);
  float fore  = sdTaper(q, el, wr, 0.043, 0.032);
  float hand  = sdTaper(q, wr, hd, 0.035, 0.022);
  float arm = smin(smin(upper, fore, 0.03), hand, 0.02);
  // legs
  float thigh = sdTaper(q, vec2(0.095, 0.0), vec2(0.105, -0.47), 0.085, 0.055);
  float shin  = sdTaper(q, vec2(0.105, -0.47), vec2(0.105, -0.90), 0.055, 0.034);
  float foot  = sdTaper(q, vec2(0.105, -0.92), vec2(0.15, -0.985), 0.032, 0.022);
  float leg = smin(smin(thigh, shin, 0.03), foot, 0.02);
  float d = smin(torso, neck, 0.04);
  d = smin(d, head, 0.03);
  d = smin(d, arm, 0.04);
  d = smin(d, leg, 0.05);
  return d;
}
// chakra centres in body space, 0 = root ... 6 = crown
vec2 chakraPos(int i) {
  float y = i == 0 ? -0.02 : i == 1 ? 0.10 : i == 2 ? 0.25 : i == 3 ? 0.44 : i == 4 ? 0.665 : i == 5 ? 0.865 : 1.0;
  return vec2(0.0, y);
}

// ---------- 3D helpers ----------
mat3 lookAt(vec3 ro, vec3 ta, float roll) { vec3 f = normalize(ta - ro); vec3 r = normalize(cross(f, vec3(sin(roll), cos(roll), 0.0))); vec3 u = cross(r, f); return mat3(r, u, f); }
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox3(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdOcta(vec3 p, float s) { p = abs(p); return (p.x + p.y + p.z - s) * 0.57735027; }

// ---------- anime grammar ----------
// radial speed lines around c; density ~ number of lines, returns 0..1 line mask
float speedLines(vec2 p, vec2 c, float density, float t, float inner) {
  vec2 d = p - c; float a = atan(d.y, d.x); float r = length(d);
  float id = floor(a / TAU * density);
  // re-rolled once per 16th note (136 BPM), frozen in reduced-flashing mode
  float h = hash11(id + floor(t * 9.0666667 * (1.0 - uReduced)) * 7.31);
  float w = fract(a / TAU * density);
  float line = smoothstep(0.5 - 0.08 * h, 0.5, w) * (1.0 - smoothstep(0.5, 0.5 + 0.08 * h, w));
  return line * step(0.55, h) * smoothstep(inner * (0.6 + 0.6 * h), inner * (0.9 + 0.6 * h) + 0.3, r);
}
// four-point anime sparkle (twinkle) centred at c, size s
float sparkle(vec2 p, vec2 c, float s) {
  vec2 d = abs(p - c) / s;
  float cross4 = max(1.0 - smoothstep(0.0, 0.06, d.y) - d.x * 0.9, 0.0) + max(1.0 - smoothstep(0.0, 0.06, d.x) - d.y * 0.9, 0.0);
  float core = exp(-dot(d, d) * 18.0);
  return sat(cross4) * 0.8 + core;
}
// ---------- photosensitivity ----------
// Anti-strobe (full version, spec 7.3 rule 1): perFrame = how many features of a repeated
// pattern cross this pixel per frame (e.g. |d(phase)/dt| / fps). Returns a contrast multiplier:
// 1 when slow, fading to 0 (draw the pattern at its average coverage) as it approaches strobing.
float moAntiStrobe(float perFrame) { return 1.0 - smoothstep(0.07, 0.25, perFrame); }
`;
