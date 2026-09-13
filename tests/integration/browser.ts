import { runVisualTests } from './visuals.js';
import { LightmapBaker, exportLightmap, importLightmap } from '../../src/index.js';
import { planeScene, cornellScene } from '../fixtures.js';
const report = {
  status: 'running',
  userAgent: navigator.userAgent,
  webgpu: !!navigator.gpu,
  tests: [],
  errors: [],
};
window.__TEST_REPORT__ = report;
const assert = (v, message) => {
  if (!v) throw new Error(message);
};
window.addEventListener('error', (e) => report.errors.push(e.message));
window.addEventListener('unhandledrejection', (e) => report.errors.push(String(e.reason)));
async function run(name, fn) {
  const filter = new URLSearchParams(location.search).get('filter');
  if (filter && !name.includes(filter)) return;
  const start = performance.now();
  try {
    const details = await fn();
    report.tests.push({
      name,
      status: 'passed',
      milliseconds: performance.now() - start,
      ...details,
    });
  } catch (e) {
    report.tests.push({ name, status: 'failed', error: e.stack ?? e.message });
  }
  document.getElementById('output').textContent = JSON.stringify(report, null, 2);
}
async function bake(backend, scene, options = {}) {
  const b = new LightmapBaker({
    backend,
    width: 64,
    height: 64,
    samples: 8,
    bounces: 2,
    ...options,
  });
  try {
    await b.prepare(scene);
    return await b.bake();
  } finally {
    await b.dispose();
  }
}
try {
  assert(navigator.gpu, 'WebGPU is not exposed. Use a supported browser on localhost/HTTPS.');
  const adapter = await navigator.gpu.requestAdapter();
  report.adapter = adapter
    ? {
        ...Object.fromEntries(
          ['vendor', 'architecture', 'device', 'description'].map((k) => [k, adapter.info[k]]),
        ),
        features: [...adapter.features],
      }
    : null;
  for (const backend of ['tsl', 'webgpu']) {
    await run(`${backend}: real kernel compilation and constant-environment energy`, async () => {
      const r = await bake(backend, planeScene(), { width: 32, height: 32, samples: 4 });
      for (let i = 0; i < r.coverage.length; i++)
        if (r.coverage[i]) {
          assert(Math.abs(r.direct[i * 3] - 1) < 0.0001, 'Environment energy mismatch');
          assert(r.ao[i] === 1, 'Open plane AO mismatch');
          assert(r.sampleCounts[i] === 4, 'Sample count mismatch');
        }
      return { backend: r.metadata.backend };
    });
    await run(`${backend}: directional-light RGB energy`, async () => {
      const r = await bake(
        backend,
        planeScene({
          environment: [0, 0, 0],
          lights: [
            {
              type: 'directional',
              direction: [0, -1, 0],
              intensity: Math.PI,
              color: [1, 0.5, 0.2],
            },
          ],
        }),
      );
      for (let i = 0; i < r.coverage.length; i++)
        if (r.coverage[i])
          for (let k = 0; k < 3; k++)
            assert(
              Math.abs(r.direct[i * 3 + k] - [1, 0.5, 0.2][k]) < 0.0001,
              'Direct RGB energy mismatch',
            );
    });
    await run(`${backend}: diffuse bounce parity with CPU reference`, async () => {
      const scene = cornellScene(),
        cpu = await bake('cpu', scene, { samples: 32 }),
        gpu = await bake(backend, scene, { samples: 32 });
      let error = 0,
        count = 0,
        indirect = 0;
      for (let i = 0; i < gpu.lightmap.length; i++)
        if (gpu.coverage[Math.floor(i / 3)]) {
          assert(Number.isFinite(gpu.lightmap[i]), 'Nonfinite GPU output');
          error += (gpu.lightmap[i] - cpu.lightmap[i]) ** 2;
          indirect += gpu.indirect[i];
          count++;
        }
      const rmse = Math.sqrt(error / count);
      assert(rmse < 0.035, `CPU/GPU RMS difference too large: ${rmse}`);
      assert(indirect / count > 0.005, 'Bounce light is missing');
      const copy = importLightmap(exportLightmap(gpu));
      assert(copy.samples === 32, 'GPU TLMB roundtrip failed');
      return { linearRMSEAgainstCPU: rmse, meanIndirect: indirect / count };
    });
    await run(`${backend}: reset and resumed accumulation`, async () => {
      const b = new LightmapBaker({ backend, width: 32, height: 32, samples: 3 });
      try {
        await b.prepare(planeScene());
        await b.step();
        b.pause();
        await b.bake();
        assert((await b.getResult()).samples === 3, 'Resume failed');
        await b.reset();
        assert((await b.getResult()).samples === 0, 'Reset did not clear GPU storage');
        await b.bake();
        assert((await b.getResult()).samples === 3, 'Rebake failed');
      } finally {
        await b.dispose();
      }
    });
  }
  for (const backend of ['tsl', 'webgpu']) {
    await run(`${backend}: mixed lights and textured bounce/emission parity`, async () => {
      const scene = cornellScene();
      scene.materials[1].map = {
        width: 2,
        height: 1,
        data: new Float32Array([0.2, 0.8, 0.4, 1, 0.8, 0.3, 0.7, 1]),
        wrapS: 'mirror',
        wrapT: 'repeat',
        transform: [2, 0, 0.3, 0, 1, 0],
        flipY: true,
      };
      scene.materials[3].emissiveMap = {
        width: 2,
        height: 1,
        data: new Float32Array([0.2, 0.1, 0.4, 1, 1, 0.8, 0.3, 1]),
      };
      scene.lights = [
        { type: 'point', position: [0, 2, 1], intensity: 2, color: [1, 0.1, 0.2] },
        {
          type: 'spot',
          position: [1, 2, 0],
          direction: [0, -1, 0],
          intensity: 3,
          color: [0.2, 0.4, 1],
          angle: 0.7,
          penumbra: 0.4,
        },
        {
          type: 'rect',
          position: [0, 2.8, 0],
          u: [0.3, 0, 0],
          v: [0, 0, 0.2],
          intensity: 2,
          color: [0.5, 1, 0.3],
        },
        { type: 'directional', direction: [0, -1, -1], intensity: 1, color: [0.7, 0.8, 1] },
      ];
      const options = { width: 64, height: 64, resolutionScale: 0.5, samples: 32, bounces: 3 },
        cpu = await bake('cpu', scene, options),
        gpu = await bake(backend, scene, options);
      let error = 0,
        count = 0;
      for (let i = 0; i < gpu.lightmap.length; i++)
        if (gpu.coverage[Math.floor(i / 3)]) {
          error += (gpu.lightmap[i] - cpu.lightmap[i]) ** 2;
          count++;
        }
      const rmse = Math.sqrt(error / count);
      assert(rmse < 0.01, `Textured mixed-light RMSE ${rmse}`);
      assert(gpu.width === 32 && gpu.height === 32, 'Downscaling did not reduce allocation');
      return { rmse };
    });
    await run(
      `${backend}: million-sample request stays bounded and reports device loss`,
      async () => {
        const b = new LightmapBaker({
          backend,
          width: 32,
          height: 32,
          samples: 1000000,
          tileSize: 16,
          minTileSize: 16,
          maxTileSize: 32,
        });
        try {
          await b.prepare(planeScene());
          for (let i = 0; i < 4; i++) await b.step();
          assert(
            b.progress.dispatches === 4 && b.progress.samples === 0,
            'Total samples escaped bounded scheduler',
          );
          const device = b.backend.device;
          device.destroy();
          await device.lost;
          let lost = false;
          try {
            await b.step();
          } catch (e) {
            lost = /device lost/i.test(e.message);
          }
          assert(lost, 'Device loss was not reported');
        } finally {
          await b.dispose();
        }
      },
    );
  }
  await runVisualTests(run);
  report.status =
    report.tests.every((t) => t.status === 'passed') && report.errors.length === 0
      ? 'passed'
      : 'failed';
} catch (e) {
  report.status = 'blocked';
  report.reason = e.stack ?? e.message;
}
window.__TEST_DONE__ = true;
document.getElementById('output').textContent = JSON.stringify(report, null, 2);
