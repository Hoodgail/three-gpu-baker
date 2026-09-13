import type * as Types from '../types.js';
import { normalize, cross } from '../core/math.js';

export const SCENE_LAYOUT = Object.freeze({
  header: 8,
  triangle: 8,
  node: 3,
  material: 8,
  light: 6,
  atlas: 3,
  result: 3,
});
const wrapCode = (w: Types.WrapMode | undefined) => (w === 'repeat' ? 1 : w === 'mirror' ? 2 : 0);

/** All read-only scene data shares one vec4 storage binding (portable binding count). */
export function packScene(scene: Types.PreparedScene) {
  const l = SCENE_LAYOUT,
    triOffset = l.header,
    nodeOffset = triOffset + scene.triangles.length * l.triangle,
    materialOffset = nodeOffset + scene.bvh.nodes.length * l.node,
    lightOffset = materialOffset + scene.materials.length * l.material,
    textureOffset = lightOffset + scene.lights.length * l.light;
  const textures = [],
    textureMap = new Map();
  let texturePixels = 0;
  for (const m of scene.materials)
    for (const t of [m.map, m.emissiveMap])
      if (t && !textureMap.has(t)) {
        textureMap.set(t, textureOffset + texturePixels);
        textures.push(t);
        texturePixels += t.width * t.height;
      }
  const total = textureOffset + texturePixels;
  if (total >= 16777216)
    throw new RangeError(
      'Packed scene exceeds exact f32 integer indexing. Reduce scene/texture sizes.',
    );
  const data = new Float32Array(Math.max(1, total) * 4);
  const put = (index: number, value: number[]) => data.set(value, index * 4);
  put(0, [
    scene.triangles.length,
    scene.bvh.nodes.length,
    scene.materials.length,
    scene.lights.length,
  ]);
  put(1, [triOffset, nodeOffset, materialOffset, lightOffset]);
  put(2, [textureOffset, scene.options.bounces, scene.options.aoDistance, scene.options.rayBias]);
  put(3, [...scene.environment, scene.options.maxRadiance]);
  scene.triangles.forEach((t, i) => {
    const a = triOffset + i * l.triangle;
    for (let k = 0; k < 3; k++) put(a + k, [...t.p[k], k === 0 ? (t.material ?? 0) : 0]);
    const normal = normalize(
      cross(
        t.p[1].map((v, k) => v - t.p[0][k]),
        t.p[2].map((v, k) => v - t.p[0][k]),
      ),
    );
    for (let k = 0; k < 3; k++) put(a + 3 + k, [...(t.n?.[k] ?? normal), 0]);
    put(a + 6, [...(t.uv?.[0] ?? [0, 0]), ...(t.uv?.[1] ?? [0, 0])]);
    put(a + 7, [...(t.uv?.[2] ?? [0, 0]), 0, 0]);
  });
  scene.bvh.nodes.forEach((n, i) => {
    const a = nodeOffset + i * l.node;
    put(a, [...n.min, n.escape]);
    put(a + 1, [...n.max, n.count]);
    put(a + 2, [n.first, 0, 0, 0]);
  });
  const textureDesc = (t: Types.LinearTexture | undefined) =>
    t
      ? [
          textureMap.get(t),
          t.width,
          t.height,
          wrapCode(t.wrapS) + 4 * wrapCode(t.wrapT) + (t.flipY ? 16 : 0),
        ]
      : [0, 0, 0, 0];
  scene.materials.forEach((m, i) => {
    const a = materialOffset + i * l.material,
      mt = m.map?.transform ?? [1, 0, 0, 0, 1, 0],
      et = m.emissiveMap?.transform ?? [1, 0, 0, 0, 1, 0];
    put(a, [...(m.color ?? [1, 1, 1]), m.metalness ?? 0]);
    put(a + 1, [
      ...(m.emissive ?? [0, 0, 0]).map((v) => v * (m.emissiveIntensity ?? 1)),
      m.doubleSided ? 1 : 0,
    ]);
    put(a + 2, textureDesc(m.map));
    put(a + 3, textureDesc(m.emissiveMap));
    put(a + 4, [...mt.slice(0, 3), 0]);
    put(a + 5, [...mt.slice(3, 6), 0]);
    put(a + 6, [...et.slice(0, 3), 0]);
    put(a + 7, [...et.slice(3, 6), 0]);
  });
  const kinds = { point: 0, directional: 1, spot: 2, rect: 3, emissive: 4 };
  scene.lights.forEach((light, i) => {
    const a = lightOffset + i * l.light,
      angle = ('angle' in light ? light.angle : undefined) ?? Math.PI / 3;
    put(a, [
      kinds[light.type],
      ('triangle' in light ? light.triangle : undefined) ?? -1,
      ('area' in light ? light.area : undefined) ?? 0,
      ('decay' in light ? light.decay : undefined) ?? 2,
    ]);
    put(a + 1, [
      ...(('color' in light ? light.color : undefined) ?? [1, 1, 1]).map(
        (v) => v * (('intensity' in light ? light.intensity : undefined) ?? 1),
      ),
      ('distance' in light ? light.distance : undefined) ?? 0,
    ]);
    put(a + 2, [
      ...(('position' in light ? light.position : undefined) ?? [0, 0, 0]),
      Math.cos(angle),
    ]);
    put(a + 3, [
      ...normalize(('direction' in light ? light.direction : undefined) ?? [0, -1, 0]),
      Math.cos(angle * (1 - (('penumbra' in light ? light.penumbra : undefined) ?? 0))),
    ]);
    put(a + 4, [...(('u' in light ? light.u : undefined) ?? [0, 0, 0]), 0]);
    put(a + 5, [...(('v' in light ? light.v : undefined) ?? [0, 0, 0]), 0]);
  });
  for (const t of textures) data.set(t.data, textureMap.get(t) * 4);
  const g = scene.gbuffer,
    atlas = new Float32Array(g.width * g.height * l.atlas * 4);
  for (let i = 0; i < g.coverage.length; i++) {
    atlas.set([...g.positions.subarray(i * 3, i * 3 + 3), g.coverage[i]], i * 12);
    atlas.set([...g.normals.subarray(i * 3, i * 3 + 3), g.charts[i]], i * 12 + 4);
    atlas.set([...g.geometricNormals.subarray(i * 3, i * 3 + 3), g.triangleIds[i] + 1], i * 12 + 8);
  }
  return {
    scene: data,
    atlas,
    result: new Float32Array(g.width * g.height * 12),
    offsets: { triOffset, nodeOffset, materialOffset, lightOffset, textureOffset },
  };
}

export function checkStorageLimits(device: GPUDevice, packed: ReturnType<typeof packScene>) {
  const limit = Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize);
  for (const name of ['scene', 'atlas', 'result'] as const)
    if (packed[name].byteLength > limit)
      throw new RangeError(
        `${name} buffer needs ${(packed[name].byteLength / 1048576).toFixed(1)} MiB; this device allows ${(limit / 1048576).toFixed(1)} MiB per storage binding. Lower resolutionScale or texture sizes.`,
      );
}
