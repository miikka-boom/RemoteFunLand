// PLACEHOLDER for the albedo scene. Replace with the real shader.
MO.scene({
  id: 'albedo',
  fs: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  vec3 col = stageColor(float(1)) * (0.25 + 0.75 * uKick);
  col += 2.0 * stroke(sdBody(p * 1.1, 0.5 + 0.5 * sin(uTime)), 0.004, px()) * vec3(1.0);
  col += 0.4 * speedLines(p, vec2(0.0), 90.0, uTime, 0.4);
  fragColor = vec4(col, 1.0);
}`,
});
