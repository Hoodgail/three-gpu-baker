import type * as Types from '../types.js';
import { clamp } from './math.js';

export function validateTexture(
  texture: Types.LinearTexture | undefined,
  name: string = 'texture',
) {
  if (!texture) return;
  const { width, height, data } = texture;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16777216
  )
    throw new RangeError(`${name}: invalid dimensions.`);
  if (!(data instanceof Float32Array) || data.length !== width * height * 4)
    throw new TypeError(`${name}: expected linear Float32 RGBA pixels.`);
  if (!data.every(Number.isFinite)) throw new TypeError(`${name}: nonfinite pixels.`);
  if (
    texture.transform &&
    (texture.transform.length !== 6 || !texture.transform.every(Number.isFinite))
  )
    throw new TypeError(`${name}: transform needs six finite values.`);
  for (const w of [texture.wrapS, texture.wrapT])
    if (w !== undefined && !['repeat', 'mirror', 'clamp'].includes(w))
      throw new Error(`${name}: unsupported wrap mode ${w}.`);
}
function wrapIndex(i: number, size: number, mode: Types.WrapMode = 'clamp') {
  if (mode === 'repeat') return ((i % size) + size) % size;
  if (mode === 'mirror') {
    const j = ((i % (size * 2)) + size * 2) % (size * 2);
    return j < size ? j : 2 * size - 1 - j;
  }
  return clamp(i, 0, size - 1);
}
export function sampleTexture(texture: Types.LinearTexture | undefined, uv: number[]) {
  if (!texture) return [1, 1, 1, 1];
  const m = texture.transform ?? [1, 0, 0, 0, 1, 0];
  let u = m[0] * uv[0] + m[1] * uv[1] + m[2],
    v = m[3] * uv[0] + m[4] * uv[1] + m[5];
  if (texture.flipY) v = 1 - v;
  const x = u * texture.width - 0.5,
    y = v * texture.height - 0.5,
    x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  const out = [0, 0, 0, 0];
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      const index =
        (wrapIndex(y0 + j, texture.height, texture.wrapT) * texture.width +
          wrapIndex(x0 + i, texture.width, texture.wrapS)) *
        4;
      const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      for (let k = 0; k < 4; k++) out[k] += texture.data[index + k] * w;
    }
  return out;
}
export function evaluateMaterial(material: Types.DiffuseMaterial, uv: number[]) {
  const base = sampleTexture(material.map, uv),
    em = sampleTexture(material.emissiveMap, uv),
    metal = material.metalness ?? 0;
  return {
    albedo: (material.color ?? [1, 1, 1]).map((c, k) => clamp(c * base[k], 0, 1) * (1 - metal)),
    emission: (material.emissive ?? [0, 0, 0]).map((c, k) =>
      Math.max(0, c * em[k] * (material.emissiveIntensity ?? 1)),
    ),
    doubleSided: material.doubleSided ?? false,
  };
}
