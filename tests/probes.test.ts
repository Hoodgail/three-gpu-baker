import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProbeGrid,
  generateLightProbes,
  evaluateSHIrradiance,
  interpolateProbeGrid,
  exportProbes,
  importProbes,
} from '../src/core/probes.js';
import { planeScene } from './fixtures.js';
const close = (a, b, t = 0.05) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
test('Probe grid contains endpoints with x-fastest indexing', () => {
  const g = createProbeGrid({ min: [0, 0, 0], max: [1, 2, 0], spacing: 1 });
  assert.deepEqual(g.dimensions, [2, 3, 1]);
  assert.deepEqual(g.positions, [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 2, 0],
    [1, 2, 0],
  ]);
  assert.throws(() => createProbeGrid({ min: [1, 0, 0], max: [0, 1, 1] }));
});
test('SH9 constant radiance projects to pi irradiance in a clear scene', async () => {
  const scene = planeScene();
  scene.triangles.forEach((t) => (t.p = t.p.map((p) => [p[0] + 1e5, p[1], p[2]])));
  const probes = await generateLightProbes(scene, {
    positions: [[0, 5, 0]],
    samples: 8192,
    bounces: 0,
  });
  const c = probes.probes[0].coefficients;
  close(c[0], Math.sqrt(4 * Math.PI), 1e-6);
  close(c[1], Math.sqrt(4 * Math.PI) * 0.5, 1e-6);
  for (const normal of [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ]) {
    const e = evaluateSHIrradiance(c, normal);
    close(e[0], Math.PI, 0.13);
    close(e[1], Math.PI * 0.5, 0.065);
    close(e[2], Math.PI * 0.2, 0.026);
  }
  assert.deepEqual(importProbes(exportProbes(probes)), probes);
});
test('Probe grid trilinear interpolation gives the exact affine value', () => {
  const grid = createProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], spacing: 1 }),
    data = {
      schema: 'three-lightmap-probes',
      version: 1,
      coefficientType: 'radiance',
      order: 2,
      grid: { min: grid.min, max: grid.max, dimensions: grid.dimensions },
      probes: grid.positions.map((p) => ({
        position: p,
        coefficients: Array(27).fill(p[0] + 2 * p[1] + 3 * p[2]),
      })),
    };
  for (const c of interpolateProbeGrid(data, [0.2, 0.4, 0.3])) close(c, 1.9, 1e-12);
  for (const c of interpolateProbeGrid(data, [-1, 0, 0])) close(c, 0, 1e-12);
});
test('Probe generation aborts and rejects conflicting placement definitions', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => generateLightProbes(planeScene(), { positions: [[0, 1, 0]], signal: controller.signal }),
    { name: 'AbortError' },
  );
  await assert.rejects(
    () =>
      generateLightProbes(planeScene(), {
        grid: { min: [0, 0, 0], max: [1, 1, 1] },
        positions: [[0, 0, 0]],
      }),
    /OR/,
  );
  assert.throws(() => importProbes('{"schema":"bad"}'));
});
