import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LightmapBaker,
  denoiseSpatial,
  exportLightmap,
  importLightmap,
  encodePFM,
  decodePFM,
  createZip,
  exportPNG,
  createOptixDenoiser,
} from '../src/index.js';
import { planeScene, cornellScene } from './fixtures.js';
import { chartCrops, fillChart, denoiseOffline } from '../src/node/OptixDenoiser.js';
import { packScene, checkStorageLimits } from '../src/gpu/pack.js';
import { rawComputeWGSL } from '../src/gpu/kernels.js';
async function baked(options = {}, scene = planeScene()) {
  const baker = new LightmapBaker({
    backend: 'cpu',
    width: 32,
    height: 32,
    samples: 4,
    ...options,
  });
  await baker.prepare(scene);
  const result = await baker.bake();
  return { baker, result };
}

test('API prepares/bakes/reads/resets/disposes and rejects post-disposal operations', async () => {
  const { baker, result } = await baked();
  assert.equal(baker.state, 'complete');
  assert.equal(result.samples, 4);
  assert.equal(result.metadata.backend, 'cpu-reference');
  assert.equal(result.metadata.aoAppliedToLightmap, false);
  for (let i = 0; i < result.coverage.length; i++)
    if (result.coverage[i]) {
      assert.equal(result.sampleCounts[i], 4);
      assert.equal(result.ao[i], 1);
      assert.equal(result.direct[i * 3], 1);
    }
  result.direct.fill(999);
  assert.ok(!(await baker.getResult()).direct.includes(999));
  await baker.reset();
  assert.equal(baker.state, 'ready');
  assert.equal((await baker.getResult()).samples, 0);
  await baker.dispose();
  await baker.dispose();
  await assert.rejects(() => baker.step(), /disposed|prepare/i);
});
test('Progressive output is bit-identical across different dispatch tile sizes', async () => {
  const scene = cornellScene(),
    a = await baked(
      { width: 64, height: 64, samples: 5, tileSize: 32, minTileSize: 32, maxTileSize: 32 },
      scene,
    ),
    b = await baked(
      { width: 64, height: 64, samples: 5, tileSize: 1024, minTileSize: 1024, maxTileSize: 1024 },
      scene,
    );
  for (const key of ['direct', 'indirect', 'ao', 'sampleCounts'])
    assert.deepEqual(a.result[key], b.result[key]);
  await a.baker.dispose();
  await b.baker.dispose();
});
test('Pause/resume and AbortSignal retain accumulated samples', async () => {
  const b = new LightmapBaker({ backend: 'cpu', width: 32, height: 32, samples: 10 });
  await b.prepare(planeScene());
  let stopped = false;
  await b.bake({
    onProgress: (p) => {
      if (!stopped && p.fraction > 0) {
        stopped = true;
        b.pause();
      }
    },
  });
  assert.equal(b.state, 'paused');
  assert.ok(b.progress.fraction < 1);
  await b.bake();
  assert.equal(b.state, 'complete');
  await b.reset();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => b.bake({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(b.state, 'paused');
  await b.dispose();
});
test('Concurrent steps/prepares are rejected and failed preparation is disposable', async () => {
  const b = new LightmapBaker({ backend: 'cpu', width: 32, height: 32 });
  await b.prepare(planeScene());
  const step = b.step();
  await assert.rejects(() => b.step(), /concurrent|progress/i);
  await step;
  await b.dispose();
  const bad = new LightmapBaker({ backend: 'cpu' });
  await assert.rejects(() => bad.prepare({}), /triangles/);
  await bad.dispose();
});
test('Huge sample requests remain progressive rather than one giant dispatch', async () => {
  const b = new LightmapBaker({
    backend: 'cpu',
    width: 32,
    height: 32,
    samples: 1000000,
    tileSize: 16,
    minTileSize: 16,
    maxTileSize: 16,
  });
  await b.prepare(planeScene());
  await b.step();
  assert.equal(b.scheduler.sample, 0);
  assert.equal(b.scheduler.cursor, 16);
  await b.dispose();
});
test('Spatial denoising changes only indirect/AO and never bleeds between charts', async () => {
  const { baker, result: r } = await baked();
  r.coverage.fill(1);
  r.normals.fill(0);
  for (let i = 0; i < r.coverage.length; i++) {
    r.normals[i * 3 + 1] = 1;
    r.charts[i] = i % r.width < r.width / 2 ? 0 : 1;
    for (let k = 0; k < 3; k++) r.indirect[i * 3 + k] = r.charts[i] === 0 ? (i % 2 ? 0 : 2) : 100;
    r.ao[i] = i % 2 ? 0 : 1;
  }
  const before = r.indirect.slice(),
    direct = r.direct.slice();
  for (const type of ['atrous', 'bilateral']) {
    const d = await denoiseSpatial(r, { type, positionSigma: 100, colorSigma: 1000 });
    assert.deepEqual(d.direct, direct);
    assert.deepEqual(r.indirect, before);
    assert.ok(d.ao.every((v) => v >= 0 && v <= 1));
    for (let i = 0; i < r.coverage.length; i++)
      if (r.charts[i] === 0) assert.ok(d.indirect[i * 3] < 2.001);
      else assert.equal(d.indirect[i * 3], 100);
    assert.notDeepEqual(d.indirect, r.indirect);
  }
  await baker.dispose();
});
test('Denoising snapshots does not corrupt subsequent accumulation', async () => {
  const { baker, result } = await baked();
  await baker.getResult({ denoise: 'atrous' });
  assert.deepEqual((await baker.getResult()).direct, result.direct);
  assert.deepEqual((await baker.getResult()).indirect, result.indirect);
  await baker.dispose();
});
test('TLMB roundtrips every channel without float loss and detects corruption', async () => {
  const { baker, result: r } = await baked(),
    bytes = exportLightmap(r),
    copy = importLightmap(bytes);
  for (const key of ['direct', 'indirect', 'ao', 'coverage', 'charts', 'normals', 'sampleCounts'])
    assert.deepEqual(copy[key], r[key]);
  const altered = bytes.slice();
  altered[altered.length - 1] ^= 1;
  assert.throws(() => importLightmap(altered), /checksum/);
  assert.throws(() => importLightmap(bytes.subarray(0, 40)));
  assert.throws(() => importLightmap(bytes, { maxBytes: 32 }));
  await baker.dispose();
});
test('PFM preserves bottom-first HDR float RGB and grayscale', () => {
  for (const channels of [1, 3]) {
    const a = Float32Array.from({ length: 2 * 3 * channels }, (_, i) => i * 0.321),
      b = decodePFM(encodePFM(a, 2, 3, { channels }));
    assert.equal(b.channels, channels);
    assert.deepEqual(a, b.data);
  }
  assert.throws(() => decodePFM(new TextEncoder().encode('PF\n1 1\n-1\n')));
});
test('ZIP signatures are correct, path traversal and duplicate entries rejected', () => {
  const b = createZip([{ name: 'hello.txt', data: 'hello' }]);
  assert.equal(new DataView(b.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(b.buffer).getUint32(b.length - 22, true), 0x06054b50);
  assert.throws(() => createZip([{ name: '../bad', data: '' }]));
  assert.throws(() =>
    createZip([
      { name: 'a', data: '' },
      { name: 'a', data: '' },
    ]),
  );
});
test('PNG encodes valid signature and dimensions', async () => {
  const { baker, result } = await baked();
  const png = exportPNG(result, 'direct');
  assert.deepEqual(Array.from(png.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(new DataView(png.buffer).getUint32(16), 32);
  await baker.dispose();
});
test('OptiX chart isolation fills guides without borrowing neighboring charts', async () => {
  const { baker, result } = await baked({ width: 64, height: 64, samples: 1 }, cornellScene());
  const crops = chartCrops(result);
  assert.equal(crops.length, 18);
  for (const crop of crops) {
    const filled = fillChart(result, crop);
    assert.ok(filled.normal.every(Number.isFinite));
    for (let i = 0; i < filled.normal.length; i += 3)
      assert.ok(Math.hypot(...filled.normal.subarray(i, i + 3)) > 0.99);
  }
  await assert.rejects(() => denoiseOffline(result, { executable: undefined }), /OPTIX/);
  assert.throws(
    () => createOptixDenoiser({ endpoint: 'https://example.com', token: 'abcdefghijklmnop' }),
    /loopback/,
  );
  await baker.dispose();
});
test('GPU scene packing uses expected header and enforces storage limits', async () => {
  const { baker } = await baked();
  const p = packScene(baker.scene);
  assert.equal(p.scene[0], 2);
  assert.equal(p.atlas.length, 32 * 32 * 12);
  assert.equal(p.result.length, 32 * 32 * 12);
  assert.throws(
    () => checkStorageLimits({ limits: { maxStorageBufferBindingSize: 16, maxBufferSize: 16 } }, p),
    /limit|buffer/i,
  );
  assert.match(rawComputeWGSL(), /@compute @workgroup_size\(64\)/);
  await baker.dispose();
});
test('Asynchronous progress callbacks are awaited; callback errors leave a resumable bake', async () => {
  const b = new LightmapBaker({ backend: 'cpu', width: 32, height: 32, samples: 2 });
  await b.prepare(planeScene());
  let called = false;
  await assert.rejects(
    () =>
      b.bake({
        onProgress: async () => {
          await new Promise((r) => setTimeout(r, 1));
          called = true;
          throw new Error('observer failed');
        },
      }),
    /observer failed/,
  );
  assert.ok(called);
  assert.equal(b.state, 'paused');
  await b.bake();
  assert.equal(b.state, 'complete');
  await b.dispose();
});
test('Disposing from a progress callback is rejected instead of self-deadlocking', async () => {
  const b = new LightmapBaker({ backend: 'cpu', width: 32, height: 32, samples: 2 });
  await b.prepare(planeScene());
  await assert.rejects(() => b.bake({ onProgress: () => b.dispose() }), /pause/);
  await b.dispose();
});
