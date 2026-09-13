import * as T from 'three/webgpu';
import {
  LightmapBaker,
  applyLightmaps,
  previewPixels,
  denoiseSpatial,
  importModel,
  exportModel,
  importModelFiles,
} from '../../src/index.js';
import { extractThreeScene, extractTexture } from '../../src/three/scene.js';
import { cornellScene, planeScene } from '../fixtures.js';
const assert = (v, m) => {
  if (!v) throw new Error(m);
};
window.__RENDER_FILES__ = [];
function show(canvas, name) {
  const data = canvas.toDataURL('image/png');
  window.__RENDER_FILES__.push({ name, data });
  const figure = document.createElement('figure'),
    caption = document.createElement('figcaption'),
    img = new Image();
  caption.textContent = name;
  img.src = data;
  img.width = 320;
  figure.append(img, caption);
  document.getElementById('renders').append(figure);
}
function atlas(r, channel, name) {
  const c = document.createElement('canvas');
  c.width = r.width;
  c.height = r.height;
  c.getContext('2d').putImageData(
    new ImageData(
      new Uint8ClampedArray(previewPixels(r, channel, { transparent: false })),
      r.width,
      r.height,
    ),
    0,
    0,
  );
  show(c, name);
}
async function camera(b, r, name, renderer) {
  const model = await b.createModel(),
    textures = await applyLightmaps(model, r),
    scene = new T.Scene();
  scene.background = new T.Color('#141922');
  scene.add(model);
  const camera = new T.PerspectiveCamera(43, 4 / 3, 0.01, 100);
  camera.position.set(0.65, 1.55, 6.1);
  camera.lookAt(0, 1.4, -0.35);
  const target = new T.RenderTarget(512, 384);
  target.texture.colorSpace = T.SRGBColorSpace;
  renderer.setRenderTarget(target);
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 512, 384);
  assert(
    pixels.some((v, i) => i % 4 !== 3 && v > 80),
    'Camera render is black or blank',
  );
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  canvas
    .getContext('2d')
    .putImageData(new ImageData(new Uint8ClampedArray(pixels), 512, 384), 0, 0);
  show(canvas, name);
  renderer.setRenderTarget(null);
  target.dispose();
  Object.values(textures).forEach((t) => t.dispose());
  model.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
}
export async function runVisualTests(run) {
  await run('TSL progressive camera renders, CPU parity, indirect/AO denoising', async () => {
    const renderer = new T.WebGPURenderer({ antialias: false });
    await renderer.init();
    renderer.setSize(512, 384);
    renderer.toneMapping = T.ReinhardToneMapping;
    const b = new LightmapBaker({
      backend: 'tsl',
      renderer,
      width: 128,
      height: 128,
      samples: 64,
      bounces: 3,
      tileSize: 256,
      maxTileSize: 2048,
    });
    const cpu = new LightmapBaker({
      backend: 'cpu',
      width: 128,
      height: 128,
      samples: 64,
      bounces: 3,
    });
    let noisy;
    try {
      await b.prepare(cornellScene());
      let checkpoint = 1;
      await b.bake({
        onProgress: async (p) => {
          if (p.samples >= checkpoint) {
            const r = await b.getResult({ padding: true });
            await camera(b, r, `tsl-room-${checkpoint}spp.png`, renderer);
            if (checkpoint === 8) noisy = await b.getResult();
            checkpoint = checkpoint === 1 ? 8 : checkpoint === 8 ? 64 : Infinity;
          }
        },
      });
      const r = await b.getResult();
      await cpu.prepare(cornellScene());
      const ref = await cpu.bake();
      await camera(cpu, await cpu.getResult({ padding: true }), 'cpu-room-64spp.png', renderer);
      const filtered = await denoiseSpatial(noisy, { positionSigma: 0.2 });
      for (const [prefix, value] of [
        ['tsl-8spp', noisy],
        ['tsl-8spp-filtered', filtered],
        ['tsl-64spp', r],
        ['cpu-64spp', ref],
      ])
        for (const channel of ['lightmap', 'indirect', 'ao'])
          atlas(value, channel, `${prefix}-${channel}.png`);
      const rmse = (a, c) => {
        let sum = 0,
          n = 0;
        for (let i = 0; i < a.length; i++)
          if (r.coverage[Math.floor(i / 3)]) {
            sum += (a[i] - c[i]) ** 2;
            n++;
          }
        return Math.sqrt(sum / n);
      };
      const parity = rmse(r.lightmap, ref.lightmap),
        raw = rmse(noisy.indirect, ref.indirect),
        denoised = rmse(filtered.indirect, ref.indirect);
      assert(parity < 0.005, `GPU/CPU RMSE ${parity}`);
      assert(denoised < raw, 'Denoising did not improve fixture');
      assert(
        filtered.direct.every((v, i) => v === noisy.direct[i]),
        'Direct modified',
      );
      return {
        linearRMSEAgainstCPU: parity,
        rawIndirectRMSE: raw,
        denoisedIndirectRMSE: denoised,
        dispatches: b.progress.dispatches,
        lastDispatchMs: b.progress.lastDispatchMs,
      };
    } finally {
      await b.dispose();
      await cpu.dispose();
      renderer.dispose();
    }
  });
  await run('Textured GLB roundtrip preserves UVs, transforms, albedo and emission', async () => {
    const scene = planeScene();
    const map = {
      width: 2,
      height: 2,
      data: new Float32Array([
        0.5, 0.25, 0.125, 1, 0.1, 0.8, 0.2, 1, 0.8, 0.1, 0.3, 1, 0.2, 0.4, 0.9, 1,
      ]),
      transform: [2, 0, 0.2, 0, 3, 0.4],
      wrapS: 'repeat',
      wrapT: 'mirror',
    };
    scene.materials = [
      {
        color: [0.8, 0.7, 0.6],
        map,
        emissiveMap: map,
        emissive: [0.2, 0.3, 0.4],
        emissiveIntensity: 2,
      },
    ];
    const b = new LightmapBaker({ backend: 'cpu', width: 32, height: 32, samples: 1 });
    try {
      await b.prepare(scene);
      const model = await b.createModel(),
        binary = await exportModel(model),
        copy = await importModel(new Blob([binary])),
        core = await extractThreeScene(copy);
      const m = core.materials[0];
      assert(m.map && m.emissiveMap, 'Lost textures');
      assert(
        core.triangles.every((t) => t.lmUV),
        'Lost lightmap UVs',
      );
      let max = 0;
      for (let i = 0; i < map.data.length; i++)
        max = Math.max(max, Math.abs(map.data[i] - m.map.data[i]));
      assert(max < 0.004, `Texture color error ${max}`);
      assert(
        m.map.transform.every((v, i) => Math.abs(v - map.transform[i]) < 1e-6),
        'Lost transform',
      );
      assert(m.emissiveIntensity === 2, 'Lost emissive intensity');
      return { glbBytes: binary.byteLength, maxLinearTextureError: max };
    } finally {
      await b.dispose();
    }
  });
  await run(
    'File-set glTF import resolves external buffers and releases temporary URLs',
    async () => {
      const data = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const json = {
        asset: { version: '2.0' },
        buffers: [{ uri: 'mesh.bin', byteLength: data.byteLength }],
        bufferViews: [{ buffer: 0, byteLength: data.byteLength }],
        accessors: [
          {
            bufferView: 0,
            componentType: 5126,
            count: 3,
            type: 'VEC3',
            min: [0, 0, 0],
            max: [1, 1, 0],
          },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
      };
      const root = await importModelFiles([
        new File([JSON.stringify(json)], 'scene.gltf'),
        new File([data], 'mesh.bin'),
      ]);
      let count = 0;
      root.traverse((o) => {
        if (o.isMesh) count++;
      });
      assert(count === 1, 'External buffer not loaded');
    },
  );
}
