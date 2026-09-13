import type * as Types from '../types.js';
import {
  add,
  sub,
  scale,
  mul,
  dot,
  cross,
  length,
  normalize,
  PI,
  clamp,
  cosineHemisphere,
  geometricNormal,
  maxComponent,
  powerHeuristic,
  mix3,
} from './math.js';
import { trace, surfaceAt } from './bvh.js';
import { evaluateMaterial } from './material.js';

const BLACK = () => [0, 0, 0];
function smoothstep(a: number, b: number, x: number) {
  if (b - a < 1e-8) return x >= b ? 1 : 0;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function emissionLightPDF(
  scene: Types.TransportScene,
  triangle: number,
  from: number[],
  hitPoint: number[],
  normal: number[],
  doubleSided: boolean,
) {
  const delta = sub(hitPoint, from),
    d2 = dot(delta, delta),
    wi = normalize(delta);
  let cosine = dot(normal, scale(wi, -1));
  if (doubleSided) cosine = Math.abs(cosine);
  const t = scene.triangles[triangle];
  const area = length(cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]))) * 0.5;
  return cosine > 0 ? d2 / (area * cosine * scene.lights.length) : 0;
}

/** One uniformly selected light; selection-PDF compensation keeps arbitrary light counts unbiased.
 * A null normal estimates incident radiance integrated over solid angle, for SH projection.
 */
export function sampleDirect(
  scene: Types.TransportScene,
  surface: Types.Surface | Types.ProbeSurface,
  rng: import('./math.js').RNG,
  { spherical = false }: { spherical?: boolean } = {},
) {
  const count = scene.lights.length;
  if (!count) return { value: BLACK(), direction: [0, 1, 0] };
  const light = scene.lights[Math.min(count - 1, Math.floor(rng.next() * count))];
  const p = surface.p,
    n = spherical ? null : surface.n;
  let q = null,
    wi,
    dist = Infinity,
    radiance,
    area = 0,
    ln = null,
    emitter = false,
    twoSided = false;
  if (light.type === 'directional') {
    wi = scale(normalize(light.direction), -1);
    radiance = scale(light.color ?? [1, 1, 1], light.intensity ?? 1);
  } else {
    if (light.type === 'rect') {
      q = add(
        add(light.position, scale(light.u, 2 * rng.next() - 1)),
        scale(light.v, 2 * rng.next() - 1),
      );
      const normal = cross(light.u, light.v);
      area = 4 * length(normal);
      ln = normalize(normal);
      radiance = scale(light.color ?? [1, 1, 1], light.intensity ?? 1);
    } else if (light.type === 'emissive') {
      const t = scene.triangles[light.triangle],
        r = Math.sqrt(rng.next()),
        v = rng.next(),
        w = [1 - r, r * (1 - v), r * v];
      q = mix3(t.p[0], t.p[1], t.p[2], w);
      ln = geometricNormal(t);
      area = light.area;
      emitter = true;
      const uv = t.uv
        ? [0, 1].map((k) => t.uv![0][k] * w[0] + t.uv![1][k] * w[1] + t.uv![2][k] * w[2])
        : [0, 0];
      const m = evaluateMaterial(scene.materials[t.material ?? 0], uv);
      radiance = m.emission;
      twoSided = m.doubleSided;
    } else {
      q = light.position;
      radiance = scale(light.color ?? [1, 1, 1], light.intensity ?? 1);
    }
    const delta = sub(q, p);
    dist = length(delta);
    if (dist < scene.options.rayBias * 2) return { value: BLACK(), direction: [0, 1, 0] };
    wi = scale(delta, 1 / dist);
  }
  const cosine = n ? Math.max(0, dot(n, wi)) : 1;
  if (cosine <= 0) return { value: BLACK(), direction: wi };
  let factor = (count * cosine) / (n ? PI : 1);
  if (area > 0) {
    let lightCos = dot(ln!, scale(wi, -1));
    if (twoSided) lightCos = Math.abs(lightCos);
    if (lightCos <= 1e-8) return { value: BLACK(), direction: wi };
    const pdf = (dist * dist) / (area * lightCos * count),
      bsdf = n ? cosine / PI : 1 / (4 * PI);
    factor = (cosine / ((n ? PI : 1) * pdf)) * (emitter ? powerHeuristic(pdf, bsdf) : 1);
  } else if (light.type !== 'directional') {
    let attenuation = 1 / Math.max(1e-12, dist ** (('decay' in light ? light.decay : 2) ?? 2));
    if ((('distance' in light ? light.distance : 0) ?? 0) > 0)
      attenuation *=
        Math.max(0, 1 - (dist / (('distance' in light ? light.distance : 0) ?? 0)) ** 4) ** 2;
    if (light.type === 'spot') {
      const angle = light.angle ?? PI / 3,
        penumbra = light.penumbra ?? 0;
      attenuation *= smoothstep(
        Math.cos(angle),
        Math.cos(angle * (1 - penumbra)),
        dot(normalize(light.direction), scale(wi, -1)),
      );
    }
    factor *= attenuation;
  }
  if (factor <= 0) return { value: BLACK(), direction: wi };
  const eps = scene.options.rayBias,
    origin = surface.g ? add(p, scale(surface.g, eps)) : p;
  const shadowDirection = q ? normalize(sub(q, origin)) : wi,
    shadowDistance = q ? length(sub(q, origin)) - eps : Infinity;
  if (
    trace(
      scene.bvh,
      origin,
      shadowDirection,
      shadowDistance,
      surface.triangle ?? -1,
      eps * 0.01,
      true,
    )
  )
    return { value: BLACK(), direction: wi };
  return { value: scale(radiance, factor), direction: wi };
}

/** Integrate a sampled incident direction. No specular, transmission or volumetric transport. */
export function traceIncoming(
  scene: Types.TransportScene,
  surface: Types.Surface | Types.ProbeSurface,
  direction: number[],
  rng: import('./math.js').RNG,
  { initialPDF, bounces = scene.options.bounces }: { initialPDF?: number; bounces?: number } = {},
) {
  let direct = BLACK(),
    indirect = BLACK(),
    throughput = [1, 1, 1],
    ao = 1;
  const eps = scene.options.rayBias;
  let origin = surface.g ? add(surface.p, scale(surface.g, eps)) : surface.p,
    previous = surface.p,
    skip = surface.triangle ?? -1,
    pdf = initialPDF ?? Math.max(0, dot(surface.n ?? [0, 0, 0], direction)) / PI;
  for (let depth = 0; depth <= bounces; depth++) {
    const hit = trace(scene.bvh, origin, direction, Infinity, skip, eps * 0.01);
    if (depth === 0) ao = !hit || hit.distance >= scene.options.aoDistance ? 1 : 0;
    if (!hit) {
      const contribution = mul(throughput, scene.environment);
      if (depth === 0) direct = add(direct, contribution);
      else indirect = add(indirect, contribution);
      break;
    }
    const s = surfaceAt(scene.bvh, hit, direction),
      m = evaluateMaterial(scene.materials[s.material], s.uv);
    if (s.backface && !m.doubleSided) break;
    if (maxComponent(m.emission) > 0) {
      const originalNormal = geometricNormal(scene.triangles[hit.index]);
      const lightPDF = emissionLightPDF(
        scene,
        hit.index,
        previous,
        s.p,
        originalNormal,
        m.doubleSided,
      );
      const contribution = scale(mul(throughput, m.emission), powerHeuristic(pdf, lightPDF));
      if (depth === 0) direct = add(direct, contribution);
      else indirect = add(indirect, contribution);
    }
    if (depth === bounces) break;
    throughput = mul(throughput, m.albedo);
    if (maxComponent(throughput) <= 0) break;
    indirect = add(indirect, mul(throughput, sampleDirect(scene, s, rng).value));
    if (depth >= 2) {
      const survival = clamp(maxComponent(throughput), 0.05, 0.95);
      if (rng.next() >= survival) break;
      throughput = scale(throughput, 1 / survival);
    }
    direction = cosineHemisphere(s.n, rng);
    if (dot(s.g, direction) <= 0) break;
    pdf = Math.max(0, dot(s.n, direction)) / PI;
    previous = s.p;
    origin = add(s.p, scale(s.g, eps));
    skip = hit.index;
  }
  return { direct, indirect, ao };
}

export function sampleIrradiance(
  scene: Types.TransportScene,
  surface: Types.Surface,
  rng: import('./math.js').RNG,
) {
  let direct = sampleDirect(scene, surface, rng).value;
  const direction = cosineHemisphere(surface.n, rng);
  const result = traceIncoming(scene, surface, direction, rng);
  direct = add(direct, result.direct);
  let indirect = result.indirect;
  const cap = scene.options.maxRadiance;
  if (cap > 0) {
    direct = direct.map((v) => Math.min(cap, v));
    indirect = indirect.map((v) => Math.min(cap, v));
  }
  return { direct, indirect, ao: result.ao };
}
