import test from 'node:test';
import assert from 'node:assert/strict';
import { LightmapBaker, denoiseSpatial } from '../src/index.js';
import { cornellScene } from './fixtures.js';
import { chartCrops, denoiseOffline } from '../src/node/OptixDenoiser.js';

test('Denoising can select indirect or AO independently and rejects direct', async () => {
  const b = new LightmapBaker({ backend: 'cpu', width: 32, height: 32, samples: 2 });
  try {
    await b.prepare(cornellScene());
    const r = await b.bake();
    for (const channel of ['indirect', 'ao']) {
      const d = await denoiseSpatial(r, { channels: [channel] });
      const unchanged = channel === 'ao' ? 'indirect' : 'ao';
      assert.deepEqual(d[unchanged], r[unchanged]);
      assert.deepEqual(d.direct, r.direct);
      assert.notDeepEqual(d[channel], r[channel]);
    }
    await assert.rejects(denoiseSpatial(r, { channels: ['direct'] }), /only indirect and ao/);
    assert.deepEqual((await denoiseSpatial(r, { channels: [] })).lightmap, r.lightmap);
    assert.throws(() => chartCrops(r, { margin: -1 }), /margin/);
    await assert.rejects(denoiseOffline(r, { channels: ['direct'] }), /only indirect and ao/);
  } finally {
    await b.dispose();
  }
});
test('Pending reset owns accumulation and cannot overlap a new step or prepare', async () => {
  const b = new LightmapBaker({ backend: 'cpu', width: 32, height: 32, samples: 1 });
  await b.prepare(cornellScene());
  await b.bake();
  const reset = b.backend.reset.bind(b.backend);
  let release;
  b.backend.reset = async () => {
    await new Promise((resolve) => (release = resolve));
    await reset();
  };
  const pending = b.reset();
  await assert.rejects(b.step(), /lifecycle/);
  await assert.rejects(b.getResult(), /lifecycle/);
  await assert.rejects(b.prepare(cornellScene()), /another operation/);
  release();
  await pending;
  assert.equal((await b.getResult()).samples, 0);
  await b.dispose();
});
test('Offline process protocol isolates charts and leaves unselected channels intact (mock worker)', async () => {
  const { mkdtemp, writeFile, chmod, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'tlmb-protocol-')),
    executable = join(directory, 'worker.mjs');
  const binaryURL = new URL('../dist/io/binary.js', import.meta.url).href;
  await writeFile(
    executable,
    `#!/usr/bin/env node\nimport {readFile,writeFile} from 'node:fs/promises';import {decodePFM,encodePFM} from ${JSON.stringify(binaryURL)};const [input,normal,output]=process.argv.slice(2);const p=decodePFM(await readFile(input));decodePFM(await readFile(normal));await writeFile(output,encodePFM(p.data.map(v=>v*.5),p.width,p.height));`,
  );
  await chmod(executable, 0o700);
  const b = new LightmapBaker({ backend: 'cpu', width: 16, height: 16, samples: 2 });
  try {
    const { planeScene } = await import('./fixtures.js');
    await b.prepare(planeScene());
    const r = await b.bake();
    const out = await denoiseOffline(r, { executable, channels: ['ao'], margin: 2 });
    assert.deepEqual(out.direct, r.direct);
    assert.deepEqual(out.indirect, r.indirect);
    assert.deepEqual(out.lightmap, r.lightmap);
    for (let i = 0; i < r.coverage.length; i++)
      if (r.coverage[i]) assert.equal(out.ao[i], r.ao[i] * 0.5);
    await writeFile(executable, '#!/usr/bin/env node\nprocess.exit(0);');
    await assert.rejects(denoiseOffline(r, { executable, channels: ['ao'], margin: 2 }), /ENOENT/);
  } finally {
    await b.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Large chart sets use bounded packing and preserve chart coverage', async () => {
  const { quad } = await import('./fixtures.js');
  const triangles = [];
  for (let i = 0; i < 160; i++) {
    const x = i * 2;
    triangles.push(
      ...quad(
        [
          [x, 0, 0],
          [x, 0, 1],
          [x + 1, 0, 1],
          [x + 1, 0, 0],
        ],
        0,
        `piece-${i}`,
      ),
    );
  }
  const b = new LightmapBaker({ backend: 'cpu', width: 128, height: 128, samples: 1 });
  try {
    await b.prepare({ triangles, materials: [{}], environment: [1, 1, 1] });
    assert.equal(b.scene.atlas.chartCount, 160);
    assert.equal(new Set(Array.from(b.scene.gbuffer.charts).filter((v) => v >= 0)).size, 160);
  } finally {
    await b.dispose();
  }
});
