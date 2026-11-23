// Cradlesong: the film look. The 2D frame from shots.js is uploaded to WebGL2 and finished with
// bloom (from its mipmaps), radial chromatic aberration, a cold-shadow grade, vignette, gate weave,
// dust, scratches, broadcast glitches and grain. Without WebGL2 it falls back to a 2D pass.
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
uniform float uSeed, uGrain, uVig, uCA, uBloom, uExpo, uSat, uGlitch, uFlash, uWeave;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  uv += uWeave * (vec2(h12(vec2(uSeed, 1.7)), h12(vec2(uSeed, 9.1))) - 0.5) * vec2(0.0012, 0.0018);
  if (uGlitch > 0.0) {
    float band = floor(uv.y * 54.0);
    float r = h12(vec2(band, uSeed));
    float on = step(1.0 - uGlitch * 0.3, r);
    uv.x += on * (h12(vec2(band * 3.1, uSeed + 4.0)) - 0.5) * 0.07 * uGlitch;
  }
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  vec2 off = c * r2 * 0.011 * uCA;
  vec3 col = vec3(texture(uTex, uv + off).r, texture(uTex, uv).g, texture(uTex, uv - off).b);
  vec3 b = textureLod(uTex, uv, 3.0).rgb * 0.3 + textureLod(uTex, uv, 5.0).rgb * 0.4 + textureLod(uTex, uv, 6.5).rgb * 0.3;
  col += max(b - 0.16, 0.0) * uBloom;
  col = col * uExpo + uFlash;
  // grade: cold, lifted shadows; a little warmth kept in the highlights
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col += vec3(0.004, 0.009, 0.016) * (1.0 - smoothstep(0.0, 0.35, l));
  col = col / (1.0 + col * 0.18);
  // vignette, aspect aware
  vec2 cv = c * vec2(uRes.x / uRes.y, 1.0);
  float vr = length(cv) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
  col *= 1.0 - uVig * smoothstep(0.45, 1.05, vr);
  // dust and the odd scratch
  float fr = uSeed;
  vec2 px = uv * uRes;
  float dust = step(0.99965, h12(floor(px / 3.0) + fr * 7.13));
  col = mix(col, vec3(0.02), dust * 0.8 * uGrain * 10.0);
  float sx = h12(vec2(fr, 3.3));
  if (sx > 0.86) { float x0 = h12(vec2(fr, 8.1)); float d = abs(uv.x - x0) * uRes.x; col += vec3(0.07) * smoothstep(1.4, 0.0, d) * uGrain * 8.0; }
  // grain, stronger in the shadows
  float gn = h12(px + fr * 37.0) + h12(px * 1.37 + fr * 11.0) - 1.0;
  col += gn * uGrain * (0.45 + 0.55 * (1.0 - clamp(l * 1.6, 0.0, 1.0)));
  outColor = vec4(max(col, 0.0), 1.0);
}`;

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
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const U = {};
    for (const n of ['uTex', 'uRes', 'uSeed', 'uGrain', 'uVig', 'uCA', 'uBloom', 'uExpo', 'uSat', 'uGlitch', 'uFlash', 'uWeave']) U[n] = gl.getUniformLocation(prog, n);
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
      // if the GPU drops the context, rebuild the program and texture when it comes back
      canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
      canvas.addEventListener('webglcontextrestored', () => { try { ctx = makeGL(canvas, keep); } catch (e) { console.warn(e); } });
      return mode;
    }
    mode = '2d';
    ctx = canvas.getContext('2d', { alpha: false });
    noise = [];
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas'); c.width = c.height = 192;
      const x = c.getContext('2d'), im = x.createImageData(192, 192);
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
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.uniform1i(U.uTex, 0);
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uSeed, p.seed % 997);
      gl.uniform1f(U.uGrain, p.grain);
      gl.uniform1f(U.uVig, p.vig);
      gl.uniform1f(U.uCA, p.ca);
      gl.uniform1f(U.uBloom, p.bloom);
      gl.uniform1f(U.uExpo, p.expo);
      gl.uniform1f(U.uSat, p.sat);
      gl.uniform1f(U.uGlitch, p.glitch);
      gl.uniform1f(U.uFlash, p.flash);
      gl.uniform1f(U.uWeave, p.weave);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }
    // 2D fallback
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(src, 0, 0, W, H);
    if (p.flash > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(1, p.flash)})`; g.fillRect(0, 0, W, H); }
    const n = noise[p.seed % noise.length];
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = Math.min(0.5, p.grain * 2.2);
    for (let y = 0; y < H; y += 192) for (let x = 0; x < W; x += 192) g.drawImage(n, x, y);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function resize(w, h) {
    if (!canvas) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  function lost() { return mode === 'gl' && ctx.gl.isContextLost(); }

  window.CSPOST = { init, render, resize, lost, get mode() { return mode; } };
})();
