import type * as Types from '../types.js';
import {
  RNG,
  sampleSeed,
  uniformSphere,
  shBasis,
  PI,
  add,
  normalize,
  clamp,
  abortIfNeeded,
  yieldToHost,
  triangleArea,
} from './math.js';
import { sampleDirect, traceIncoming } from './integrator.js';
import { validateScene, validateOptions } from './scene.js';
import { buildBVH } from './bvh.js';

export function createProbeGrid({ min, max, spacing = 1 }: Types.ProbeGridOptions) {
  if (
    !min ||
    !max ||
    min.length !== 3 ||
    max.length !== 3 ||
    ![...min, ...max, spacing].every(Number.isFinite) ||
    spacing <= 0 ||
    min.some((v, k) => v > max[k])
  )
    throw new RangeError('Invalid probe grid bounds/spacing.');
  const dimensions = min.map((v, k) => Math.max(1, Math.ceil((max[k] - v) / spacing) + 1));
  const count = dimensions.reduce((a, b) => a * b, 1);
  if (count > 100000) throw new RangeError('Probe grid exceeds 100,000 probes. Increase spacing.');
  const positions = [];
  for (let z = 0; z < dimensions[2]; z++)
    for (let y = 0; y < dimensions[1]; y++)
      for (let x = 0; x < dimensions[0]; x++)
        positions.push(
          [x, y, z].map((i, k) =>
            dimensions[k] === 1 ? min[k] : min[k] + (i * (max[k] - min[k])) / (dimensions[k] - 1),
          ),
        );
  return { min: [...min], max: [...max], dimensions, positions };
}

export async function generateLightProbes(
  input: Types.SceneInput | Types.TransportScene,
  options: Types.ProbeOptions = {},
): Promise<Types.ProbeData> {
  const samples = options.samples ?? 512,
    bounces = options.bounces ?? ('options' in input ? input.options.bounces : undefined) ?? 2,
    seed = options.seed ?? 1337;
  if (!Number.isInteger(samples) || samples < 1 || samples > 16777216)
    throw new RangeError('Invalid probe samples.');
  if (
    !Number.isInteger(bounces) ||
    bounces < 0 ||
    bounces > 8 ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 4294967295
  )
    throw new RangeError('Invalid probe bounces/seed.');
  if (options.grid && options.positions)
    throw new Error('Provide grid OR explicit positions, not both.');
  let scene: Types.TransportScene;
  if ('bvh' in input) scene = input;
  else {
    const core =
      'isObject3D' in input
        ? await (await import('../three/scene.js')).extractThreeScene(input)
        : input;
    validateScene(core);
    const settings = validateOptions({ ...options, bounces });
    const bvh = buildBVH(core.triangles);
    scene = {
      ...core,
      bvh,
      triangles: bvh.triangles,
      options: settings,
      environment: core.environment ?? [0, 0, 0],
      lights: [...(core.lights ?? [])],
    };
    scene.triangles.forEach((t, i) => {
      const m = scene.materials[t.material ?? 0];
      if ((m.emissive ?? [0, 0, 0]).some((c) => c * (m.emissiveIntensity ?? 1) > 0))
        scene.lights.push({ type: 'emissive', triangle: i, area: triangleArea(t) });
    });
  }
  const grid = options.grid ? createProbeGrid(options.grid) : null,
    positions = options.positions ?? grid?.positions;
  if (
    !positions?.length ||
    positions.length > 100000 ||
    positions.some((p) => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))
  )
    throw new TypeError('Provide finite probe positions or grid bounds.');
  const probes = [];
  for (let index = 0; index < positions.length; index++) {
    const p = positions[index],
      coefficients = new Float64Array(27),
      surface = { p, n: null, g: null, triangle: -1 };
    for (let sample = 0; sample < samples; sample++) {
      if (sample % 32 === 0) {
        abortIfNeeded(options.signal);
        await yieldToHost();
      }
      const rng = new RNG(sampleSeed(index, sample, seed));
      const direct = sampleDirect(scene, surface, rng, { spherical: true }),
        directBasis = shBasis(direct.direction);
      const direction = uniformSphere(rng),
        incoming = traceIncoming(scene, surface, direction, rng, {
          initialPDF: 1 / (4 * PI),
          bounces,
        });
      const radiance = add(incoming.direct, incoming.indirect),
        basis = shBasis(direction);
      for (let k = 0; k < 9; k++)
        for (let c = 0; c < 3; c++)
          coefficients[k * 3 + c] +=
            basis[k] * radiance[c] * 4 * PI + directBasis[k] * direct.value[c];
    }
    probes.push({ position: [...p], coefficients: Array.from(coefficients, (v) => v / samples) });
    options.onProgress?.({
      completed: index + 1,
      total: positions.length,
      fraction: (index + 1) / positions.length,
    });
  }
  return {
    schema: 'three-lightmap-probes',
    version: 1,
    coefficientType: 'radiance',
    order: 2,
    basis: 'three.js real SH (l=0..2)',
    colorSpace: 'linear-srgb',
    samples,
    bounces,
    grid: grid ? { min: grid.min, max: grid.max, dimensions: grid.dimensions } : null,
    probes,
  };
}

export function validateProbes(data: Types.ProbeData) {
  if (
    data?.schema !== 'three-lightmap-probes' ||
    data.version !== 1 ||
    data.coefficientType !== 'radiance' ||
    data.order !== 2 ||
    !Array.isArray(data.probes) ||
    data.probes.length > 100000
  )
    throw new Error('Unsupported probe file.');
  for (const p of data.probes)
    if (
      !Array.isArray(p.position) ||
      p.position.length !== 3 ||
      !Array.isArray(p.coefficients) ||
      p.coefficients.length !== 27 ||
      ![...p.position, ...p.coefficients].every(Number.isFinite)
    )
      throw new Error('Invalid probe coefficients/position.');
  if (data.grid) {
    const g = data.grid;
    if (
      !g.min ||
      !g.max ||
      !g.dimensions ||
      g.min.length !== 3 ||
      g.max.length !== 3 ||
      g.dimensions.length !== 3 ||
      ![...g.min, ...g.max].every(Number.isFinite) ||
      g.dimensions.some(
        (d, k) =>
          !Number.isInteger(d) || d < 1 || g.max[k] < g.min[k] || (d > 1 && g.max[k] === g.min[k]),
      ) ||
      g.dimensions.reduce((a, b) => a * b, 1) !== data.probes.length
    )
      throw new Error('Invalid probe grid.');
  }
  return data;
}
export function exportProbes(data: Types.ProbeData) {
  validateProbes(data);
  return JSON.stringify(data, null, 2);
}
export function importProbes(text: string) {
  return validateProbes(JSON.parse(text));
}

/** Cosine-convolved SH returns irradiance E. Divide by π before multiplying a Lambert albedo. */
export function evaluateSHIrradiance(coefficients: ArrayLike<number>, normal: number[]) {
  if (coefficients.length !== 27) throw new Error('SH9 requires 27 RGB values.');
  const basis = shBasis(normalize(normal)),
    out = [0, 0, 0];
  for (let k = 0; k < 9; k++) {
    const convolution = k === 0 ? PI : k < 4 ? (2 * PI) / 3 : PI / 4;
    for (let c = 0; c < 3; c++) out[c] += coefficients[k * 3 + c] * basis[k] * convolution;
  }
  return out;
}
export function interpolateProbeGrid(data: Types.ProbeData, position: number[]) {
  validateProbes(data);
  const grid = data.grid;
  if (!grid) throw new Error('Trilinear interpolation requires a regular grid.');
  const { min, max, dimensions: d } = grid;
  const coord = position.map((v, k) =>
      d[k] === 1 ? 0 : clamp(((v - min[k]) / (max[k] - min[k])) * (d[k] - 1), 0, d[k] - 1),
    ),
    base = coord.map(Math.floor),
    f = coord.map((v, k) => v - base[k]),
    out = new Float64Array(27);
  for (let z = 0; z < 2; z++)
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const index = [x, y, z].map((v, k) => Math.min(d[k] - 1, base[k] + v)),
          weight = (x ? f[0] : 1 - f[0]) * (y ? f[1] : 1 - f[1]) * (z ? f[2] : 1 - f[2]);
        const p = data.probes[(index[2] * d[1] + index[1]) * d[0] + index[0]];
        for (let k = 0; k < 27; k++) out[k] += p.coefficients[k] * weight;
      }
  return Array.from(out);
}
