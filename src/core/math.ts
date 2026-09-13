import type * as Types from '../types.js';

/** Small allocation-friendly vector helpers shared by the reference integrator. */
export const PI = Math.PI;
export const add = (a: number[], b: number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: number[], s: number) => [a[0] * s, a[1] * s, a[2] * s];
export const mul = (a: number[], b: number[]) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: number[]) => {
  const l = length(a);
  return l > 1e-30 ? scale(a, 1 / l) : [0, 1, 0];
};
export const maxComponent = (a: number[]) => Math.max(a[0], a[1], a[2]);
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const luminance = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const mix3 = (a: number[], b: number[], c: number[], w: number[]) =>
  [0, 1, 2].map((k) => a[k] * w[0] + b[k] * w[1] + c[k] * w[2]);
export const geometricNormal = (t: Types.Triangle) =>
  normalize(cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0])));
export const triangleArea = (t: Types.Triangle) =>
  length(cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]))) * 0.5;
export const powerHeuristic = (a: number, b: number) => (a * a) / (a * a + b * b || 1);
export const srgbToLinear = (x: number) =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
export const linearToSrgb = (x: number) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055;

/** 32-bit PCG permutation. The high 24 bits map exactly to an f32 in [0,1). */
export function pcg(value: number) {
  const state = (Math.imul(value, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}
export class RNG {
  state!: number;

  constructor(seed = 1) {
    this.state = seed >>> 0;
  }
  next() {
    this.state = pcg(this.state);
    return (this.state >>> 8) / 16777216;
  }
}
export function sampleSeed(pixel: number, sample: number, seed: number) {
  return pcg((pixel ^ Math.imul(sample + 1, 0x9e3779b9) ^ seed) >>> 0);
}
export function cosineHemisphere(n: number[], rng: RNG) {
  const r = Math.sqrt(rng.next()),
    phi = 2 * PI * rng.next();
  const tangent = normalize(cross(Math.abs(n[2]) < 0.999 ? [0, 0, 1] : [1, 0, 0], n));
  const bitangent = cross(n, tangent);
  return add(
    add(scale(tangent, r * Math.cos(phi)), scale(bitangent, r * Math.sin(phi))),
    scale(n, Math.sqrt(Math.max(0, 1 - r * r))),
  );
}
export function uniformSphere(rng: RNG) {
  const z = 1 - 2 * rng.next(),
    phi = 2 * PI * rng.next(),
    r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(phi), r * Math.sin(phi), z];
}
export function shBasis([x, y, z]: number[]) {
  // Same real SH ordering as THREE.SphericalHarmonics3.getBasisAt().
  return [
    0.28209479177387814,
    0.4886025119029199 * y,
    0.4886025119029199 * z,
    0.4886025119029199 * x,
    1.0925484305920792 * x * y,
    1.0925484305920792 * y * z,
    0.31539156525252005 * (3 * z * z - 1),
    1.0925484305920792 * x * z,
    0.5462742152960396 * (x * x - y * y),
  ];
}
export function abortIfNeeded(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Operation aborted', 'AbortError');
}
export const yieldToHost = () => new Promise((resolve) => setTimeout(resolve, 0));
