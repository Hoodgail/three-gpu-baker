import * as T from 'three/webgpu';
import { extractTexture } from './scene.js';
import { linearToSrgb } from '../core/math.js';

/** glTF PNG/JPEG material images are normalized sRGB, unlike the HDR TLMB sidecar. */
export async function prepareExportModel(source: T.Object3D) {
  const root = source.clone(true),
    materials: T.Material[] = [],
    textures: T.Texture[] = [],
    cache = new Map<T.Texture, T.Texture>();
  const dispose = () => {
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
  };
  async function portable(map?: T.Texture | null) {
    if (!map) return null;
    if (cache.has(map)) return cache.get(map)!;
    const out = map.clone();
    out.source = new T.TextureSource(map.source.data);
    textures.push(out);
    cache.set(map, out);
    if ('isDataTexture' in map || map.colorSpace === T.LinearSRGBColorSpace) {
      const d = (await extractTexture(map))!,
        data = new Uint8Array(d.data.length);
      for (let i = 0; i < data.length; i++) {
        const v = d.data[i];
        if (!Number.isFinite(v) || v < 0 || v > 1)
          throw new Error(
            'Portable glTF material textures must be in [0,1]. Move HDR emission into emissiveIntensity before exporting.',
          );
        data[i] = Math.round(255 * (i % 4 === 3 ? v : linearToSrgb(v)));
      }
      out.image = { data, width: d.width, height: d.height };
      Object.defineProperty(out, 'isDataTexture', { value: true, configurable: true });
      out.type = T.UnsignedByteType;
      out.format = T.RGBAFormat;
      out.colorSpace = T.SRGBColorSpace;
    }
    // The exporter reads offset/repeat/rotation, not an explicit Matrix3.
    if (!map.matrixAutoUpdate) {
      const e = map.matrix.elements,
        sx = Math.hypot(e[0], e[3]),
        det = e[0] * e[4] - e[1] * e[3];
      if (sx < 1e-12) throw new Error('Cannot export a singular texture transform.');
      out.center.set(0, 0);
      out.offset.set(e[6], e[7]);
      out.repeat.set(sx, det / sx);
      out.rotation = Math.atan2(e[3], e[0]);
      out.updateMatrix();
      if (e.some((v, i) => Math.abs(v - out.matrix.elements[i]) > 1e-6))
        throw new Error('glTF cannot represent a sheared texture transform.');
      out.matrixAutoUpdate = true;
    }
    return out;
  }
  try {
    const meshes: T.Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof T.Mesh) meshes.push(o);
    });
    for (const mesh of meshes) {
      const converted = [];
      for (const sourceMaterial of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = sourceMaterial.clone() as import('./scene.js').SurfaceMaterial;
        materials.push(m);
        m.map = await portable(m.map);
        m.emissiveMap = await portable(m.emissiveMap);
        converted.push(m);
      }
      mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
    }
    return { root, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
