import {
  LightmapBaker,
  type CoreScene,
  exportBakeBundle,
  type BakeProgress,
  createProbeGrid,
  createOptixDenoiser,
} from '../src/index.js';
const scene: CoreScene = {
  triangles: [
    {
      p: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      material: 0,
    },
  ],
  materials: [{ color: [1, 1, 1] }],
  lights: [{ type: 'point', position: [0, 0, 1] }],
};
const baker = new LightmapBaker({ backend: 'cpu', width: 32, bounces: 2 });
async function example() {
  await baker.prepare(scene);
  const result = await baker.bake({
    onProgress: (p: BakeProgress) => {
      console.log(p.samples);
    },
  });
  exportBakeBundle(result);
  await baker.getResult({ denoise: { type: 'atrous', iterations: 2 } });
  await baker.dispose();
}
createProbeGrid({ min: [0, 0, 0], max: [1, 1, 1] });
createOptixDenoiser({ token: 'test-token-not-a-real-secret' });
// @ts-expect-error Deliberately reject unsupported backend names.
new LightmapBaker({ backend: 'webgl' });
void example;
import { denoiseOffline } from 'three-gpu-baker/node';
import { denoiseSpatial } from 'three-gpu-baker/denoise';
import { exportLightmap } from 'three-gpu-baker/io';
async function filters() {
  const result = await baker.getResult();
  await denoiseSpatial(result, { channels: ['ao'] });
  await denoiseOffline(result, { executable: '/path/to/worker', channels: ['indirect'] });
  exportLightmap(result);
  // @ts-expect-error Direct denoising is intentionally unsupported.
  await denoiseSpatial(result, { channels: ['direct'] });
}
void filters;
