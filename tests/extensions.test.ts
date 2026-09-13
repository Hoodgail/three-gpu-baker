import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LightmapBaker,
  SceneCompiler,
  SpatialDenoiser,
  LightmapIO,
  LightProbeGenerator,
} from '../src/index.js';
import { CPUBackend } from '../src/core/cpu-backend.js';
import { planeScene } from './fixtures.js';

test('custom compiler, backend and denoiser compose through the public API', async () => {
  let compilations = 0,
    initializations = 0;
  class Compiler extends SceneCompiler {
    compile(scene, options) {
      compilations++;
      return super.compile(scene, options);
    }
  }
  class Backend extends CPUBackend {
    async init(scene) {
      initializations++;
      await super.init(scene);
    }
  }
  const baker = new LightmapBaker(
    { backendFactory: () => new Backend(), width: 16, height: 16, samples: 2 },
    new Compiler(),
  );
  try {
    await baker.prepare(planeScene());
    await baker.bake();
    const result = await baker.getResult({ denoise: new SpatialDenoiser({ channels: ['ao'] }) });
    assert.equal(compilations, 1);
    assert.equal(initializations, 1);
    assert.equal(result.metadata.denoiser.type, 'atrous');
    const io = new LightmapIO();
    assert.deepEqual(io.decode(io.encode(result)).direct, result.direct);
    const probes = await new LightProbeGenerator(planeScene()).generate({
      positions: [[0, 1, 0]],
      samples: 8,
    });
    assert.equal(io.decodeProbes(io.encodeProbes(probes)).probes.length, 1);
  } finally {
    await baker.dispose();
  }
});
