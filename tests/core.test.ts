import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RNG,
  pcg,
  sampleSeed,
  cosineHemisphere,
  dot,
  length,
  normalize,
  sub,
} from '../src/core/math.js';
import { buildBVH, trace, intersectTriangle, intersectsBounds } from '../src/core/bvh.js';
import { sampleTexture, evaluateMaterial } from '../src/core/material.js';
import { prepareCoreScene, validateOptions, validateScene } from '../src/core/scene.js';
import { generateAtlas, rasterizeAtlas, dilateChannels } from '../src/core/atlas.js';
import { sampleIrradiance, sampleDirect } from '../src/core/integrator.js';
import { ProgressiveScheduler } from '../src/core/scheduler.js';
import { planeScene, quad, box, cornellScene } from './fixtures.js';
const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b} (tolerance ${e})`);
const settings = (over) => validateOptions({ width: 96, height: 96, ...over });
const surface = { p: [0, 0, 0], n: [0, 1, 0], g: [0, 1, 0], triangle: -1 };

test('PCG is deterministic, uint32, and seeds are sample/pixel-specific', () => {
  assert.equal(pcg(1234), pcg(1234));
  const r = new RNG(10),
    r2 = new RNG(10);
  for (let i = 0; i < 10000; i++) {
    const v = r.next();
    assert.equal(v, r2.next());
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(sampleSeed(1, 2, 3), sampleSeed(2, 1, 3));
});
test('Cosine hemisphere has unit directions and expected cosine moment 2/3', () => {
  const rng = new RNG(5);
  let sum = 0;
  for (let i = 0; i < 40000; i++) {
    const d = cosineHemisphere([0, 1, 0], rng);
    close(length(d), 1, 1e-6);
    assert.ok(d[1] >= 0);
    sum += d[1];
  }
  close(sum / 40000, 2 / 3, 0.006);
});
test('BVH agrees with brute force for 1,500 randomized rays', () => {
  const triangles = [...box([0, 0, 0], [2, 2, 2], 0.2), ...box([2, 1, -1], [1, 3, 2], 0.7)],
    bvh = buildBVH(triangles),
    rng = new RNG(14);
  for (let i = 0; i < 1500; i++) {
    const origin = [rng.next() * 8 - 4, rng.next() * 8 - 4, rng.next() * 8 - 4],
      direction = normalize([rng.next() * 2 - 1, rng.next() * 2 - 1, rng.next() * 2 - 1]),
      actual = trace(bvh, origin, direction);
    let distance = Infinity;
    for (const t of triangles) {
      const h = intersectTriangle(origin, direction, t, distance);
      if (h) distance = h.distance;
    }
    assert.equal(!!actual, Number.isFinite(distance));
    if (actual) close(actual.distance, distance, 1e-7);
  }
});
test('BVH parallel slab rays do not produce NaN edge behavior', () => {
  const b = { min: [0, 0, 0], max: [1, 1, 1] };
  assert.equal(intersectsBounds([0, 0.5, -1], [0, 0, 1], b, 10), true);
  assert.equal(intersectsBounds([-0.1, 0.5, -1], [0, 0, 1], b, 10), false);
  assert.equal(intersectsBounds([0, 0.5, -1], [0, 0, 1], b, 0.5), false);
});
test('BVH escape links strictly advance and cover all triangles', () => {
  const s = cornellScene(),
    b = buildBVH(s.triangles);
  b.nodes.forEach((n, i) => assert.ok(n.escape > i && n.escape <= b.nodes.length));
  assert.equal(
    b.nodes.filter((n) => n.count).reduce((a, b) => a + b.count, 0),
    s.triangles.length,
  );
  assert.equal(new Set(b.originalIndices).size, s.triangles.length);
});
test('Scene/options reject degenerate input, nonfinite values, unsupported lights and bad seeds', () => {
  for (const options of [
    { samples: 0 },
    { bounces: 9 },
    { seed: -1 },
    { seed: 2 ** 32 },
    { resolutionScale: 0 },
    { tileSize: 1 },
    { rayBias: NaN },
  ])
    assert.throws(() => settings(options));
  assert.throws(() => validateScene(planeScene({ lights: [{ type: 'unknown' }] })));
  assert.throws(() =>
    validateScene(
      planeScene({
        triangles: [
          {
            p: [
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ],
          },
        ],
      }),
    ),
  );
  assert.throws(() =>
    validateScene(
      planeScene({ lights: [{ type: 'rect', position: [0, 1, 0], u: [1, 0, 0], v: [2, 0, 0] }] }),
    ),
  );
});
test('Atlas generates deterministic nonoverlapping charts without touching uv0', () => {
  const scene = cornellScene(),
    before = JSON.stringify(scene.triangles),
    a = generateAtlas(scene.triangles, 128, 128),
    b = generateAtlas(scene.triangles, 128, 128);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(scene.triangles), before);
  assert.equal(a.chartCount, 18);
  const g = rasterizeAtlas(a.triangles, scene.materials, 128, 128);
  assert.ok(g.covered > 128 * 128 * 0.4);
  assert.ok(g.normals.every(Number.isFinite));
});
test('Existing globally overlapping uv1 is rejected', () => {
  const triangles = [
    ...planeScene().triangles,
    ...planeScene().triangles.map((t) => ({
      ...t,
      owner: 'other',
      p: t.p.map((p) => [p[0], p[1] + 1, p[2]]),
    })),
  ].map((t) => ({ ...t, lmUV: t.uv }));
  assert.throws(
    () => prepareCoreScene(planeScene({ triangles }), settings({ uvMode: 'existing' })),
    /Overlapping/,
  );
});
test('Existing uv1 is preserved and downscaling changes the real atlas dimensions', () => {
  const scene = planeScene();
  scene.triangles.forEach((t) => (t.lmUV = t.uv.map((p) => p.map((v) => v * 0.8 + 0.1))));
  const out = prepareCoreScene(scene, settings({ width: 128, height: 96, resolutionScale: 0.5 }));
  assert.equal(out.options.width, 64);
  assert.equal(out.options.height, 48);
  assert.equal(out.atlas.mode, 'existing');
  assert.deepEqual(out.triangles[0].lmUV, scene.triangles[0].lmUV);
});
test('Insufficient resolution fails instead of silently losing charts', () =>
  assert.throws(
    () => prepareCoreScene(cornellScene(), settings({ width: 8, height: 8 })),
    /atlas|charts|fit/i,
  ));
test('Bilinear texture sampling, repeat/mirror, transform and flipY', () => {
  const tex = {
    width: 2,
    height: 2,
    data: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]),
  };
  assert.deepEqual(sampleTexture(tex, [0.25, 0.25]), [1, 0, 0, 1]);
  assert.deepEqual(sampleTexture(tex, [0.5, 0.5]), [0.5, 0.5, 0.5, 1]);
  assert.deepEqual(sampleTexture({ ...tex, flipY: true }, [0.25, 0.25]), [0, 0, 1, 1]);
  assert.deepEqual(sampleTexture({ ...tex, wrapS: 'repeat' }, [1.25, 0.25]), [1, 0, 0, 1]);
  assert.deepEqual(sampleTexture({ ...tex, wrapS: 'mirror' }, [1.25, 0.25]), [0, 1, 0, 1]);
  assert.deepEqual(
    sampleTexture({ ...tex, transform: [1, 0, 0.5, 0, 1, 0] }, [0.25, 0.25]),
    [0, 1, 0, 1],
  );
});
test('Material throughput includes textured albedo/emission and diffuse metalness', () => {
  const map = { width: 1, height: 1, data: new Float32Array([0.25, 0.5, 1, 1]) };
  const m = evaluateMaterial(
    {
      color: [1, 1, 1],
      map,
      emissive: [2, 2, 2],
      emissiveIntensity: 3,
      emissiveMap: map,
      metalness: 0.5,
    },
    [0, 0],
  );
  assert.deepEqual(m.albedo, [0.125, 0.25, 0.5]);
  assert.deepEqual(m.emission, [1.5, 3, 6]);
});
test('Unoccluded constant environment conserves irradiance/pi exactly', () => {
  const s = prepareCoreScene(planeScene(), settings());
  for (let i = 0; i < 50; i++) {
    const v = sampleIrradiance(s, surface, new RNG(i));
    assert.deepEqual(v.direct, [1, 0.5, 0.2]);
    assert.deepEqual(v.indirect, [0, 0, 0]);
    assert.equal(v.ao, 1);
  }
});
test('Directional and point light radiometry matches analytic values', () => {
  for (const light of [
    { type: 'directional', direction: [0, -1, 0], intensity: Math.PI },
    { type: 'point', position: [0, 2, 0], intensity: Math.PI * 4 },
  ]) {
    const s = prepareCoreScene(
      planeScene({ environment: [0, 0, 0], lights: [{ ...light, color: [1, 0.5, 0.25] }] }),
      settings(),
    );
    const d = sampleDirect(s, surface, new RNG(4)).value;
    d.forEach((v, c) => close(v, [1, 0.5, 0.25][c], 1e-12));
  }
});
test('A blocker behind a finite point light does not cast a shadow', () => {
  for (const [y, expected] of [
    [3, 1],
    [1, 0],
  ]) {
    const base = planeScene({
      environment: [0, 0, 0],
      lights: [{ type: 'point', position: [0, 2, 0], intensity: 4 * Math.PI }],
    });
    base.triangles.push(
      ...quad(
        [
          [-1, y, -1],
          [1, y, -1],
          [1, y, 1],
          [-1, y, 1],
        ],
        0,
        'blocker',
      ),
    );
    const s = prepareCoreScene(base, settings());
    close(sampleDirect(s, surface, new RNG(1)).value[0], expected);
  }
});
test('Spot cone and point distance cutoff suppress illumination', () => {
  const base = planeScene({
    environment: [0, 0, 0],
    lights: [
      { type: 'spot', position: [0, 2, 0], direction: [0, 1, 0], angle: 0.3, intensity: 100 },
    ],
  });
  close(sampleDirect(prepareCoreScene(base, settings()), surface, new RNG(1)).value[0], 0);
  base.lights = [{ type: 'point', position: [0, 2, 0], distance: 1, intensity: 100 }];
  close(sampleDirect(prepareCoreScene(base, settings()), surface, new RNG(1)).value[0], 0);
});
test('Uniform multi-light selection preserves total light energy and colors', () => {
  const s = prepareCoreScene(
    planeScene({
      environment: [0, 0, 0],
      lights: [
        { type: 'directional', direction: [0, -1, 0], intensity: Math.PI, color: [1, 0, 0] },
        { type: 'directional', direction: [0, -1, 0], intensity: Math.PI, color: [0, 0, 2] },
      ],
    }),
    settings(),
  );
  const rng = new RNG(3),
    sum = [0, 0, 0];
  for (let i = 0; i < 20000; i++) {
    const v = sampleDirect(s, surface, rng).value;
    v.forEach((x, k) => (sum[k] += x / 20000));
  }
  close(sum[0], 1, 0.03);
  close(sum[1], 0);
  close(sum[2], 2, 0.06);
});
test('RectAreaLight sampling matches deterministic area quadrature', () => {
  const light = { type: 'rect', position: [0, 2, 0], u: [1, 0, 0], v: [0, 0, 1], intensity: 3 };
  const s = prepareCoreScene(planeScene({ environment: [0, 0, 0], lights: [light] }), settings()),
    rng = new RNG(82);
  let mean = 0,
    truth = 0;
  for (let i = 0; i < 20000; i++) mean += sampleDirect(s, surface, rng).value[0] / 20000;
  const n = 200;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const xx = -1 + ((x + 0.5) * 2) / n,
        zz = -1 + ((y + 0.5) * 2) / n,
        r2 = xx * xx + zz * zz + 4;
      truth += (((3 * 4) / (Math.PI * r2 * r2)) * 4) / (n * n);
    }
  close(mean, truth, 0.008);
});
test('Emissive triangle MIS agrees with area integral (no double counting)', () => {
  const base = planeScene({ environment: [0, 0, 0] });
  base.materials.push({ color: [0, 0, 0], emissive: [3, 3, 3] });
  base.triangles.push(
    ...quad(
      [
        [-1, 2, -1],
        [1, 2, -1],
        [1, 2, 1],
        [-1, 2, 1],
      ],
      1,
      'emitter',
    ),
  );
  const s = prepareCoreScene(base, settings({ bounces: 0 })),
    rng = new RNG(83);
  let mean = 0,
    truth = 0;
  for (let i = 0; i < 25000; i++) mean += sampleIrradiance(s, surface, rng).direct[0] / 25000;
  const n = 100;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const xx = -1 + ((x + 0.5) * 2) / n,
        zz = -1 + ((y + 0.5) * 2) / n,
        r2 = xx * xx + zz * zz + 4;
      truth += (((3 * 4) / (Math.PI * r2 * r2)) * 4) / (n * n);
    }
  close(mean, truth, 0.012);
});
test('Multiple bounces generate colored indirect transport; zero bounces does not', () => {
  const scene = cornellScene();
  const a = prepareCoreScene(scene, settings({ bounces: 0 })),
    b = prepareCoreScene(scene, settings({ bounces: 2 }));
  let i0 = 0,
    i2 = [0, 0, 0];
  const receiver = { ...surface, p: [-1.7, 0.001, 0.5] };
  for (let i = 0; i < 2500; i++) {
    i0 += sampleIrradiance(a, receiver, new RNG(i)).indirect[0];
    const v = sampleIrradiance(b, receiver, new RNG(i)).indirect;
    v.forEach((x, c) => (i2[c] += x / 2500));
  }
  assert.equal(i0, 0);
  assert.ok(i2[0] > 0.03);
  assert.ok(i2[0] > i2[1] * 1.1, `Expected red bleed: ${i2}`);
});
test('Scheduler bounds work and adapts without changing sample count', () => {
  const s = new ProgressiveScheduler(
    100,
    settings({ samples: 2, tileSize: 32, minTileSize: 8, maxTileSize: 64 }),
  );
  let items = 0;
  while (!s.done) {
    const j = s.next();
    assert.ok(j.count <= 64);
    items += j.count;
    s.commit(j, 30);
  }
  assert.equal(items, 200);
  assert.equal(s.sample, 2);
  assert.ok(s.tileSize >= 8);
});
