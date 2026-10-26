// Dither Burn shaders from the supplied Originkit component; lifecycle adapted for full-screen backgrounds.
import { useEffect, useRef, useState } from "react";

const VERT_SRC = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`;

const FIELD_SRC = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uSize;
uniform float uAngle;
out vec4 o;

const float TAU = 6.28318530718;
const float LAYERS = 84.0;
const float GAIN = 0.5;
const vec2 CENTRE = vec2(0.68, -0.21);
const float TILT = 0.1;
const float ZOOM = 1.05;
const float THETA = 2.135;
const float SHEAR = 0.962;
const float SHRINK = 0.952;
const vec2 WARP_FREQ = vec2(0.4, 2.35);
const vec2 WARP_AMP = vec2(0.125, 0.026);
const vec2 ASPECT = vec2(2.0, 0.19);
const float OFFSET = 0.36;
const float GLOW = 0.0021;
const float SOFT = 0.0019;
const float FALLOFF = 0.37;
const float PHASE = 97.0;
const float CYCLE = 0.16;
const float HUE_TRAVEL = 2.0;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

void main() {
  vec2 R = uRes;
  vec2 pos = (gl_FragCoord.xy - 0.5 * R) / R.y;

  pos = rot(uAngle) * pos / uSize;
  float t = uTime * 0.49 + PHASE;
  float breath = (-sin(uTime * 0.735) + sin(uTime * 0.49 + 1.0)) * 0.25 + 0.5;
  vec2 u = rot(TILT) * ((pos - CENTRE) * (ZOOM - breath * 0.085));
  mat2 fold = mat2(cos(THETA), sin(THETA), -SHEAR, cos(THETA));

  vec3 col = vec3(0.0);
  for (float i = 1.0; i <= LAYERS; i += 1.0) {
    u.x -= sin(u.y * WARP_FREQ.x + t + i * 0.007) * WARP_AMP.x;
    u.y -= sin(u.x * WARP_FREQ.y - t + i * 0.02) * WARP_AMP.y;
    u = fold * u * SHRINK;
    vec2 q = (u - vec2(OFFSET + breath * 0.1, 0.0)) * ASPECT;
    float g = GLOW / (dot(q, q) + SOFT) * (0.25 + breath * 0.4);
    float r = length(u);
    float k = sin(i * CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
    col += g * mix(uC1, uC2, k) * (0.62 + 0.5 * k) * exp2(-r * FALLOFF);
  }
  vec3 x = max(col * GAIN, 0.0);
  col = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.85, 0.92, 0.98));
  col *= 1.0 - smoothstep(0.5, 1.6, length(pos)) * 0.07;
  o = vec4(col, 1.0);
}
`;

const FINISH_SRC = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uField;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg;
uniform float uPaper;
uniform vec2 uMouse;
uniform float uOn;
uniform float uReach;
uniform float uCell;
out vec4 o;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
const float LEVELS = 7.0;
const float BURN_LIFT = 1.15;

float ign(vec2 p, float f) { p += 5.588238 * mod(f, 64.0); return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y)); }

vec3 scene(vec2 uv) { return texture(uField, clamp(uv, 0.0, 1.0)).rgb; }

float near(vec2 p) { vec2 d = (p - uMouse) / uReach; return uOn * exp(-dot(d, d)); }

vec3 dither(vec2 frag, vec2 uv) {
  vec2 g = floor(frag / uCell);
  vec2 cc = (g + 0.5) * uCell;
  vec3 soft = scene(uv);
  vec3 ink = scene(cc / uRes);
  float lvl = dot(ink, LUMA);

  float w = 0.0;
  if (uOn > 0.0) w = smoothstep(0.0, 1.0, near(cc));
  float levels = mix(LEVELS, 1.0, w);
  ivec2 b = ivec2(mod(g, 4.0));
  float th = (BAYER[b.y * 4 + b.x] + 0.5) / 16.0;
  float qz = floor(pow(max(lvl, 0.0), 0.8) * levels + th) / levels;
  vec3 dith = clamp(ink / max(lvl, 1e-4) * pow(min(qz, 1.0), 1.25) * mix(1.0, BURN_LIFT, w), 0.0, 1.4);
  float presence = smoothstep(0.03, 0.14, lvl) * mix(0.5, 1.0, w);
  return mix(soft, dith, presence);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 L = max(dither(frag, frag / uRes), 0.0);

  vec3 dark = uBg + L * (1.0 - uBg);
  float strength = clamp(max(L.r, max(L.g, L.b)), 0.0, 1.0);
  vec3 paper = uBg * (1.0 - strength) + L * 0.96;
  vec3 col = mix(dark, paper, uPaper);
  col += (ign(frag, floor(uTime * 24.0)) - 0.5) / 255.0;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

function program(gl: WebGL2RenderingContext, fragment: string) {
  const shaders: WebGLShader[] = [];
  let result: WebGLProgram | null = null;
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, VERT_SRC], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    }
    result = gl.createProgram();
    if (!result) return null;
    for (const shader of shaders) gl.attachShader(result, shader);
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) { gl.deleteProgram(result); return null; }
    return result;
  } finally { for (const shader of shaders) gl.deleteShader(shader); }
}
function uniforms(gl: WebGL2RenderingContext, shader: WebGLProgram, names: string[]): Record<string, WebGLUniformLocation | null> {
  return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(shader, name)]));
}

export default function DitherBurnCanvas({ paused, onFailure }: { paused: boolean; onFailure: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const playback = useRef<((value: boolean) => void) | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let gl: WebGL2RenderingContext | null = null;
    try { gl = surface.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power" }); } catch { /* Decorative backgrounds retain their static poster. */ }
    if (!gl) { onFailure(); return; }
    const context = gl;
    const field = program(context, FIELD_SRC), finish = program(context, FINISH_SRC);
    const texture = context.createTexture(), buffer = context.createFramebuffer(), vertex = context.createVertexArray();
    let frame = 0, disposed = false, pausedNow = false, last = 0, clock = 0;
    function release() {
      disposed = true; cancelAnimationFrame(frame); playback.current = null;
      context.deleteTexture(texture); context.deleteFramebuffer(buffer); context.deleteVertexArray(vertex);
      if (field) context.deleteProgram(field); if (finish) context.deleteProgram(finish);
    }
    if (!field || !finish || !texture || !buffer || !vertex) { release(); onFailure(); return; }
    const uf = uniforms(context, field, ["uRes", "uTime", "uC1", "uC2", "uSize", "uAngle"]);
    const un = uniforms(context, finish, ["uField", "uRes", "uTime", "uBg", "uPaper", "uMouse", "uOn", "uReach", "uCell"]);
    context.bindVertexArray(vertex);
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    let width = 1, height = 1, bw = 1, bh = 1, fw = 1, fh = 1, ratio = 1;
    const pointer = { x: 0, y: 0, inside: false };
    let mx = 0, my = 0, on = 0;
    function draw() {
      context.bindFramebuffer(context.FRAMEBUFFER, buffer); context.viewport(0, 0, fw, fh); context.useProgram(field);
      context.uniform2f(uf.uRes, fw, fh); context.uniform1f(uf.uTime, clock);
      context.uniform3f(uf.uC1, 1, 1, 1); context.uniform3f(uf.uC2, 1, 1, 1);
      context.uniform1f(uf.uSize, 2); context.uniform1f(uf.uAngle, 56 * Math.PI / 180);
      context.drawArrays(context.TRIANGLES, 0, 3);
      context.bindFramebuffer(context.FRAMEBUFFER, null); context.viewport(0, 0, bw, bh); context.useProgram(finish);
      context.activeTexture(context.TEXTURE0); context.bindTexture(context.TEXTURE_2D, texture); context.uniform1i(un.uField, 0);
      context.uniform2f(un.uRes, bw, bh); context.uniform1f(un.uTime, clock);
      context.uniform3f(un.uBg, 0, 0, 0); context.uniform1f(un.uPaper, 0);
      context.uniform2f(un.uMouse, mx * bw / width, bh - my * bh / height);
      context.uniform1f(un.uOn, on * 0.71); context.uniform1f(un.uReach, 200 * bh / height);
      context.uniform1f(un.uCell, Math.max(2, Math.round(2 * ratio))); context.drawArrays(context.TRIANGLES, 0, 3);
    }
    function resize() {
      if (disposed || !surface) return;
      width = Math.max(1, surface.clientWidth); height = Math.max(1, surface.clientHeight);
      ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1_500_000 / (width * height)));
      bw = Math.max(1, Math.round(width * ratio)); bh = Math.max(1, Math.round(height * ratio));
      surface.width = bw; surface.height = bh;
      const scale = Math.min(0.5, 480 / Math.max(bw, bh));
      fw = Math.max(1, Math.round(bw * scale)); fh = Math.max(1, Math.round(bh * scale));
      context.bindTexture(context.TEXTURE_2D, texture);
      // The supplied field shader tone maps to 0..1, so no optional float framebuffer is needed.
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA8, fw, fh, 0, context.RGBA, context.UNSIGNED_BYTE, null);
      context.bindFramebuffer(context.FRAMEBUFFER, buffer);
      context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, texture, 0);
      if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) { onFailure(); return; }
      draw(); setReady(true);
    }
    function schedule() { if (!disposed && !pausedNow && !document.hidden && !frame) frame = requestAnimationFrame(tick); }
    function tick(now: number) {
      frame = 0;
      if (disposed || pausedNow || document.hidden) return;
      if (!last || now - last >= 1000 / 30) {
        const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; last = now;
        clock = (clock + dt * 2) % 3600;
        const present = pointer.inside ? 1 : 0;
        if (present && on < 0.02) { mx = pointer.x; my = pointer.y; }
        on += (present - on) * (1 - Math.exp(-dt * 5));
        const follow = 1 - Math.exp(-dt * 16);
        mx += (pointer.x - mx) * follow; my += (pointer.y - my) * follow;
        draw();
      }
      schedule();
    }
    function stop() { cancelAnimationFrame(frame); frame = 0; last = 0; }
    const move = (event: PointerEvent) => { if (event.pointerType !== "touch") { pointer.x = event.clientX; pointer.y = event.clientY; pointer.inside = true; } };
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) pointer.inside = false; };
    const visibility = () => { if (document.hidden) stop(); else schedule(); };
    const lost = (event: Event) => { event.preventDefault(); stop(); onFailure(); };
    playback.current = (value) => { pausedNow = value; if (value) stop(); else schedule(); };
    const observer = new ResizeObserver(resize); observer.observe(surface);
    surface.addEventListener("webglcontextlost", lost);
    window.addEventListener("pointermove", move, { passive: true }); window.addEventListener("pointerout", leave, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    resize(); schedule();
    return () => {
      observer.disconnect(); surface.removeEventListener("webglcontextlost", lost);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerout", leave);
      document.removeEventListener("visibilitychange", visibility); release();
    };
  }, [onFailure]);
  useEffect(() => { playback.current?.(paused); }, [paused]);
  return <canvas ref={canvas} className="dither-burn-canvas" data-ready={ready} aria-hidden="true" />;
}
