import { BufferAttribute, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { UVUnwrapper } from 'xatlas-three';
import { LightmapBaker, createXAtlasProvider } from '../src/index.js';

/** Two locally overlapping layouts; generated together into one detached global atlas. */
export async function sharedAtlasExample(
  wasmURL?: string,
  workerURL?: string,
  uvMode: 'generate' | 'repack' = 'generate',
) {
  const scene = new Group();
  for (let i = 0; i < 2; i++) {
    const geometry = new PlaneGeometry(2, 2);
    geometry.setAttribute('uv1', geometry.getAttribute('uv').clone());
    const mesh = new Mesh(geometry, new MeshStandardMaterial());
    mesh.name = `Panel ${i}`;
    mesh.position.x = i * 3;
    scene.add(mesh);
  }
  let atlasProvider;
  if (wasmURL && workerURL) {
    const unwrapper = new UVUnwrapper({ BufferAttribute });
    await unwrapper.loadLibrary(() => {}, wasmURL, workerURL);
    atlasProvider = createXAtlasProvider(unwrapper);
  }
  const baker = new LightmapBaker({
    backend: 'cpu',
    width: 64,
    height: 64,
    samples: 1,
    uvMode,
    sourceUVChannel: 0,
    lightmapUVChannel: 1,
    padding: 2,
    texelDensity: 8,
    atlasProvider,
  });
  try {
    await baker.prepare(scene);
    const result = await baker.bake();
    const model = await baker.createModel();
    return { model, result, mappings: baker.scene!.geometryMappings };
  } finally {
    await baker.dispose();
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        (object.material as MeshStandardMaterial).dispose();
      }
    });
  }
}
