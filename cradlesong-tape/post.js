// Cradlesong: Tape 3. The tape look: the 2D frame from shots.js is uploaded to WebGL2 and played back
// like a camcorder tape: horizontal smear, line jitter, a drifting tracking band, head-switching noise
// along the bottom, dropouts, interlace, vertical roll and tears, static, digital-zoom blocks and
// autofocus blur. mode 1 maps it to night-vision green; mode 2 keeps colour (the VCR's blue screen).
// Without WebGL2 a 2D pass tints and grains it instead.
(function () {
  'use strict';
  const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uSeed, uTime, uMode, uGrain, uBlur, uPix, uTrack, uTear, uStatic, uExpo, uVig, uJit, uRoll, uDrop, uBloom;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 smear(vec2 uv, float lod) {
  vec2 px = vec2(1.0 / uRes.x, 0.0);
  return textureLod(uTex, uv, lod).rgb * 0.36
       + (textureLod(uTex, uv - px * 1.5, lod).rgb + textureLod(uTex, uv + px * 1.5, lod).rgb) * 0.22
       + (textureLod(uTex, uv - px * 3.5, lod).rgb + textureLod(uTex, uv + px * 3.5, lod).rgb) * 0.10;
}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float fr = uSeed;
  uv.y = fract(uv.y + uRoll);
  float lines = min(uRes.y, 480.0);
  float row = floor(uv.y * lines);
  float j = (h12(vec2(row, fr)) - 0.5) * uJit / uRes.x;
  float bandY = fract(uTime * 0.11 + 0.2);
  float inBand = smoothstep(0.05, 0.0, abs(uv.y - bandY)) * uTrack;
  j += inBand * (h12(vec2(row * 1.7, fr + 3.0)) - 0.25) * 0.035;
  j += uTear * ((h12(vec2(floor(uv.y * 14.0), fr)) - 0.5) * 0.12 + sin(uv.y * 30.0 + fr) * 0.015);
  float hs = smoothstep(0.962, 0.985, uv.y);
  j += hs * (0.01 + 0.025 * h12(vec2(row, fr + 9.0)));
  uv.x += j;
  if (uPix > 1.01) { vec2 b = vec2(uPix) / uRes; uv = (floor(uv / b) + 0.5) * b; }
  vec3 col = smear(uv, uBlur);
  vec3 bl = textureLod(uTex, uv, 3.0).rgb * 0.45 + textureLod(uTex, uv, 5.0).rgb * 0.55;
  col += max(bl - 0.16, 0.0) * uBloom;
  col *= uExpo;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  vec2 gp = floor(gl_FragCoord.xy / max(1.0, uRes.y / 480.0));
  float gn = h12(gp + fr * 31.7) - 0.5;
  float gn2 = h12(floor(gp / vec2(3.0, 1.0)) + fr * 7.1) - 0.5;
  if (uMode > 0.5 && uMode < 1.5) {
    float v = max(l + (gn * 0.7 + gn2 * 0.5) * uGrain, 0.0);
    vec3 nv = mix(vec3(0.012, 0.04, 0.016), vec3(0.2, 0.6, 0.2), smoothstep(0.0, 0.42, v));
    nv = mix(nv, vec3(0.86, 1.0, 0.8), smoothstep(0.4, 1.05, v));
    col = nv;
  } else if (uMode > 1.5) {
    col += vec3(gn + gn2 * 0.6) * uGrain;
  } else {
    col += vec3(gn) * uGrain;
  }
  float dr = step(1.0 - uDrop * 0.0025, h12(vec2(row, fr * 1.3)));
  float dx = h12(vec2(row + 3.1, fr));
  col = mix(col, vec3(0.92), dr * step(abs(uv.x - dx), 0.06 + 0.1 * h12(vec2(row, fr + 2.0))));
  col += inBand * step(0.9, h12(vec2(floor(gl_FragCoord.x * 0.4), row + fr))) * 0.55;
  col = mix(col, col * 0.5 + vec3(h12(gl_FragCoord.xy + fr)) * 0.3, hs * step(0.5, uMode));
  col *= 0.93 + 0.07 * mod(floor(gl_FragCoord.y / max(1.0, uRes.y / 480.0)), 2.0);
  vec2 c = vUv - 0.5; c.x *= uRes.x / uRes.y;
  float vr = length(c) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
  col *= 1.0 - uVig * smoothstep(0.3, 1.0, vr);
  if (uStatic > 0.0) {
    float s = h12(floor(gl_FragCoord.xy / max(1.5, uRes.y / 320.0)) + fr * 13.0);
    col = mix(col, vec3(s * 0.95), uStatic);
  }
  outColor = vec4(max(col, 0.0), 1.0);
}`;

  const UNIFORMS = ['uTex', 'uRes', 'uSeed', 'uTime', 'uMode', 'uGrain', 'uBlur', 'uPix', 'uTrack', 'uTear', 'uStatic', 'uExpo', 'uVig', 'uJit', 'uRoll', 'uDrop', 'uBloom'];
  function makeGL(canvas, preserve) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: !!preserve, premultipliedAlpha: false });
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const U = {};
    for (const n of UNIFORMS) U[n] = gl.getUniformLocation(prog, n);
    return { gl, prog, vao, tex, U };
  }

  let mode = 'none', ctx = null, canvas = null, noise = null, keep = false;

  function init(displayCanvas, prefer2D, preserve) {
    canvas = displayCanvas;
    keep = !!preserve;
    if (!prefer2D) {
      try { ctx = makeGL(canvas, keep); } catch (e) { console.warn('WebGL2 post failed, using 2D:', e); ctx = null; }
    }
    if (ctx) {
      mode = 'gl';
      canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
      canvas.addEventListener('webglcontextrestored', () => { try { ctx = makeGL(canvas, keep); } catch (e) { console.warn(e); } });
      return mode;
    }
    mode = '2d';
    ctx = canvas.getContext('2d', { alpha: false });
    noise = [];
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const x = c.getContext('2d'), im = x.createImageData(160, 160);
      for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0);
      noise.push(c);
    }
    return mode;
  }

  function render(src, p) {
    const W = canvas.width, H = canvas.height;
    if (mode === 'gl') {
      const { gl, prog, vao, tex, U } = ctx;
      if (gl.isContextLost()) return;
      gl.viewport(0, 0, W, H);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.uniform1i(U.uTex, 0);
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uSeed, p.seed % 997);
      gl.uniform1f(U.uTime, p.t);
      gl.uniform1f(U.uMode, p.mode);
      gl.uniform1f(U.uGrain, p.grain);
      gl.uniform1f(U.uBlur, p.blur);
      gl.uniform1f(U.uPix, p.pix);
      gl.uniform1f(U.uTrack, p.track);
      gl.uniform1f(U.uTear, p.tear);
      gl.uniform1f(U.uStatic, p.stat);
      gl.uniform1f(U.uExpo, p.expo);
      gl.uniform1f(U.uVig, p.vig);
      gl.uniform1f(U.uJit, p.jit);
      gl.uniform1f(U.uRoll, p.roll);
      gl.uniform1f(U.uDrop, p.drop);
      gl.uniform1f(U.uBloom, p.bloom);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(src, 0, Math.round(p.roll * H) % H - (p.roll > 0 ? H : 0), W, H);
    if (p.roll > 0) g.drawImage(src, 0, Math.round(p.roll * H) % H, W, H);
    if (p.mode === 1) { g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(90,255,110)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
    const n = noise[p.seed % noise.length];
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = Math.min(0.8, p.grain * 2.5 + p.stat);
    for (let y = 0; y < H; y += 160) for (let x = 0; x < W; x += 160) g.drawImage(n, x, y);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (p.stat > 0.5) { g.globalAlpha = p.stat * 0.8; for (let y = 0; y < H; y += 160) for (let x = 0; x < W; x += 160) g.drawImage(n, x, y); g.globalAlpha = 1; }
  }

  function resize(w, h) {
    if (!canvas) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  window.CSPOST = { init, render, resize, get mode() { return mode; } };
})();
