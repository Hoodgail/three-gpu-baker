import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {
  LightmapBaker,
  UVValidationError,
  validateLightmapUVs,
  createXAtlasProvider,
} from '../src/index.js';
import { generateAtlas } from '../src/core/atlas.js';
import { prepareCoreScene, validateOptions } from '../src/core/scene.js';
import { planeScene, cornellScene } from './fixtures.js';
import { extractThreeScene, createThreeModel, createLightmapTextures } from '../src/three/scene.js';

const options = (over = {}) =>
  validateOptions({
    backend: 'cpu',
    width: 64,
    height: 64,
    samples: 1,
    ...over,
  });
const authored = () => {
  const s = planeScene();
  s.triangles.forEach((t) => {
    t.lmUV = t.uv.map((p) => p.map((v) => v * 0.8 + 0.1));
  });
  return s;
};

test('UV defaults, aliases and option bounds remain compatible', () => {
  const defaults = validateOptions();
  assert.equal(defaults.uvMode, 'auto');
  assert.equal(defaults.sourceUVChannel, 0);
  assert.equal(defaults.lightmapUVChannel, 1);
  assert.equal(defaults.padding, 2);
  for (const bad of [
    { sourceUVChannel: 4 },
    { lightmapUVChannel: -1 },
    { sourceUVChannel: 1 },
    { texelDensity: 0 },
    { texelDensity: Infinity },
    { texelDensity: NaN },
    { uvMode: 'bad' },
  ])
    assert.throws(() => options(bad));
  const s = authored();
  const before = structuredClone(s.triangles);
  for (const uvMode of ['existing', 'preserve', 'auto']) {
    const p = prepareCoreScene(s, options({ uvMode }));
    assert.deepEqual(
      p.triangles.map((t) => t.lmUV),
      s.triangles.map((t) => t.lmUV),
    );
  }
  assert.deepEqual(s.triangles, before);
  delete s.triangles[0].lmUV;
  assert.equal(prepareCoreScene(s, options()).atlas.mode, 'generate');
  assert.throws(() => prepareCoreScene(s, options({ uvMode: 'preserve' })), UVValidationError);
});

test('diagnostics identify missing, nonfinite, out-of-range and degenerate triangles', () => {
  const t = authored().triangles[0];
  const triangles = [
    { ...t, owner: 'missing', lmUV: undefined },
    {
      ...t,
      owner: 'nan',
      lmUV: [
        [NaN, 0],
        [1, 0],
        [0, 1],
      ],
    },
    {
      ...t,
      owner: 'infinity',
      lmUV: [
        [Infinity, 0],
        [1, 0],
        [0, 1],
      ],
    },
    {
      ...t,
      owner: 'outside',
      lmUV: [
        [-0.1, 0],
        [1, 0],
        [0, 1],
      ],
    },
    {
      ...t,
      owner: 'flat',
      lmUV: [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    },
    {
      ...t,
      owner: 'tiny',
      lmUV: [
        [0, 0],
        [1e-7, 0],
        [0, 1e-7],
      ],
    },
  ];
  const d = validateLightmapUVs(triangles, 32, 32);
  assert.deepEqual(
    d.map((v) => v.code),
    ['missing', 'nonfinite', 'nonfinite', 'out-of-range', 'degenerate', 'degenerate'],
  );
  assert.deepEqual(
    d.map((v) => v.source.mesh),
    triangles.map((t) => t.owner),
  );
  assert.deepEqual(
    d.map((v) => v.source.triangle),
    [0, 1, 2, 3, 4, 5],
  );
});

test('cross-mesh overlaps report both sources and a texel; shared edges are valid', () => {
  const s = authored();
  assert.deepEqual(validateLightmapUVs(s.triangles, 64, 64), []);
  const duplicates = s.triangles.map((t) => ({ ...t, owner: 'second' }));
  const d = validateLightmapUVs([...s.triangles, ...duplicates], 64, 64);
  assert.ok(
    d.some(
      (v) =>
        v.code === 'overlap' && v.source.mesh === 'second' && v.related && v.texel?.length === 2,
    ),
  );
  assert.throws(
    () =>
      prepareCoreScene(
        { ...s, triangles: [...s.triangles, ...duplicates] },
        options({ uvMode: 'preserve' }),
      ),
    (e) => e instanceof UVValidationError && e.diagnostics.some((d) => d.code === 'overlap'),
  );
});

test('empty charts are errors and insufficient filtering gutters are warnings', () => {
  const t = authored().triangles[0];
  assert.ok(
    validateLightmapUVs(
      [
        {
          ...t,
          lmUV: [
            [0, 0],
            [0.001, 0],
            [0, 0.001],
          ],
        },
      ],
      32,
      32,
    ).some((d) => d.code === 'empty-chart'),
  );
  const left = {
    ...t,
    owner: 'left',
    lmUV: [
      [0, 0],
      [0.49, 0],
      [0.49, 1],
    ],
  };
  const right = {
    ...t,
    owner: 'right',
    lmUV: [
      [0.51, 0],
      [1, 0],
      [0.51, 1],
    ],
  };
  const d = validateLightmapUVs([left, right], 32, 32, 2);
  assert.ok(d.some((v) => v.code === 'padding' && v.severity === 'warning' && v.related));
  assert.deepEqual(validateLightmapUVs([left, right], 32, 32, 0), []);
});

test('repack combines independent layouts, retains charts and scales by world area', () => {
  const s = authored();
  const triangles = [
    ...s.triangles.map((t) => ({ ...t, owner: 'a' })),
    ...s.triangles.map((t) => ({
      ...t,
      owner: 'b',
      p: t.p.map((p) => p.map((v) => v * 2)),
    })),
  ];
  const before = structuredClone(triangles);
  const p = prepareCoreScene({ ...s, triangles }, options({ uvMode: 'repack', texelDensity: 3 }));
  assert.equal(p.atlas.chartCount, 2);
  assert.equal(p.atlas.mode, 'repack');
  const [a, b] = p.atlas.charts.map((c) => c.rect.w - 4);
  assert.equal(b, 2 * a);
  assert.deepEqual(triangles, before);
  const outside = triangles.map((t) => ({
    ...t,
    lmUV: t.lmUV.map((p) => p.map((v) => v + 3)),
  }));
  assert.doesNotThrow(() =>
    prepareCoreScene({ ...s, triangles: outside }, options({ uvMode: 'repack' })),
  );
});

test('fixed texel density and padding affect allocation and reject overflow', () => {
  const t = planeScene().triangles;
  const low = generateAtlas(t, 128, 128, { texelDensity: 4, padding: 1 });
  const high = generateAtlas(t, 128, 128, { texelDensity: 8, padding: 3 });
  assert.equal(high.charts[0].rect.w - 6, 2 * (low.charts[0].rect.w - 2));
  assert.throws(() => generateAtlas(t, 8, 8, { texelDensity: 100 }), /density|Density/);
});

test('channel selection and mappings survive negative scales, instances and detached output', async () => {
  const geometry = new T.PlaneGeometry(2, 2);
  geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
  const material = new T.MeshStandardMaterial();
  material.map = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  material.map.channel = 2;
  const mesh = new T.InstancedMesh(geometry, material, 2);
  mesh.name = 'panels';
  mesh.setMatrixAt(0, new T.Matrix4().makeScale(-1, 1, 1));
  mesh.setMatrixAt(1, new T.Matrix4().makeTranslation(3, 0, 0));
  const settings = options({ sourceUVChannel: 2, lightmapUVChannel: 3 });
  const scene = await extractThreeScene(mesh, settings);
  const prepared = prepareCoreScene(scene, settings);
  const model = createThreeModel(prepared);
  assert.equal(model.children.length, 2);
  assert.equal(geometry.getAttribute('uv3'), undefined);
  for (const output of model.children) {
    assert.ok(output.geometry.getAttribute('uv2'));
    assert.ok(output.geometry.getAttribute('uv3'));
    assert.notEqual(output.material.map, material.map);
    assert.equal(output.material.map.channel, 2);
    for (const mapping of output.userData.geometryMappings) {
      assert.equal(mapping.source.mesh, mesh.uuid);
      assert.equal(mapping.source.geometry, geometry.uuid);
      mapping.outputVertices.forEach((v, k) => {
        assert.equal(
          output.geometry.getAttribute('uv2').getX(v),
          geometry.getAttribute('uv2').getX(mapping.source.vertices[k]),
        );
      });
    }
  }
  const baker = new LightmapBaker(settings);
  await baker.prepare(mesh);
  const result = await baker.bake();
  assert.equal(createLightmapTextures(result).lightmap.channel, 3);
  await baker.dispose();
});

test('BVH mappings and chart indices refer to the same prepared triangles', () => {
  const s = cornellScene();
  const p = prepareCoreScene(s, options({ width: 128, height: 128 }));
  for (const m of p.geometryMappings)
    assert.deepEqual(p.triangles[m.triangle].p, s.triangles[m.source.triangle].p);
  for (const c of p.atlas.charts)
    for (const i of c.triangles) assert.equal(p.triangles[i].chart, c.id);
});

test('nonindexed material groups and draw ranges retain original triangle and corner indices', async () => {
  const geometry = new T.PlaneGeometry(2, 2).toNonIndexed();
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  geometry.setDrawRange(3, 3);
  const mesh = new T.Mesh(geometry, [new T.MeshStandardMaterial(), new T.MeshStandardMaterial()]);
  const s = await extractThreeScene(mesh);
  assert.equal(s.triangles.length, 1);
  const p = prepareCoreScene(s, options({ sourceUVChannel: 3, lightmapUVChannel: 0 }));
  assert.equal(p.geometryMappings[0].source.triangle, 1);
  assert.deepEqual(p.geometryMappings[0].source.vertices, [3, 4, 5]);
  const output = createThreeModel(p).children[0];
  assert.ok(output.geometry.getAttribute('uv'));
  assert.ok(output.geometry.getAttribute('uv3'));
  assert.equal(output.userData.lightmap.texCoord, 0);
});

test('sparse and malformed UVs produce diagnostics rather than crashing', () => {
  const t = planeScene().triangles[0];
  for (const lmUV of [
    new Array(3),
    { length: 3 },
    [
      [0, 0],
      [1, 0],
    ],
    [
      [, 0],
      [1, 0],
      [0, 1],
    ],
  ])
    assert.ok(validateLightmapUVs([{ ...t, lmUV }], 32, 32).length);
  assert.throws(() => generateAtlas([], 32, 32), /triangles/);
});

test('preservation bypasses providers, and async provider cancellation never initializes transport', async () => {
  let calls = 0;
  const provider = {
    async generate() {
      calls++;
      throw new Error('unexpected');
    },
  };
  for (const uvMode of ['auto', 'existing', 'preserve']) {
    const baker = new LightmapBaker(options({ uvMode, atlasProvider: provider }));
    await baker.prepare(authored());
    await baker.dispose();
  }
  assert.equal(calls, 0);
  const controller = new AbortController();
  let initialized = false;
  const baker = new LightmapBaker(
    options({
      uvMode: 'generate',
      atlasProvider: {
        async generate(triangles) {
          controller.abort(new Error('cancelled unwrap'));
          return generateAtlas(triangles, 64, 64).triangles.map((t) => t.lmUV);
        },
      },
      backendFactory: async () => {
        initialized = true;
        throw new Error('unexpected');
      },
    }),
  );
  await assert.rejects(
    baker.prepare(authored(), { signal: controller.signal }),
    /cancelled unwrap/,
  );
  assert.equal(initialized, false);
  await baker.dispose();
});

test('async atlas providers receive the complete detached scene and cannot drop triangles', async () => {
  const s = authored(),
    before = structuredClone(s.triangles);
  let calls = 0;
  const baker = new LightmapBaker(
    options({
      uvMode: 'generate',
      atlasProvider: {
        async generate(triangles, settings) {
          calls++;
          assert.equal(triangles.length, s.triangles.length);
          const uv = generateAtlas(triangles, settings.width, settings.height).triangles.map(
            (t) => t.lmUV,
          );
          triangles[0].p[0][0] = 999;
          return uv;
        },
      },
    }),
  );
  await baker.prepare(s);
  assert.equal(calls, 1);
  assert.deepEqual(s.triangles, before);
  assert.notEqual(baker.scene.triangles[0].p[0][0], 999);
  await baker.dispose();
  const invalid = new LightmapBaker(
    options({
      uvMode: 'generate',
      atlasProvider: {
        async generate() {
          return [];
        },
      },
    }),
  );
  await assert.rejects(invalid.prepare(s), /every input triangle/);
  await invalid.dispose();
});

test('xatlas adapter packs meshes together and reconstructs reordered corner mappings', async () => {
  const triangles = authored().triangles.map((t, i) => ({
    ...t,
    owner: `mesh${i}`,
  }));
  const packOptions = { padding: 9 },
    chartOptions = {};
  const unwrapper = {
    packOptions,
    chartOptions,
    async packAtlas(geometries) {
      assert.equal(geometries.length, 2);
      assert.equal(this.packOptions.padding, 2);
      for (const g of geometries) {
        g.setAttribute('uv2', g.getAttribute('uv').clone());
        g.setIndex([2, 0, 1]);
      }
      return {
        atlasCount: 1,
        width: 64,
        height: 64,
        geometries: geometries.reverse(),
      };
    },
  };
  const provider = createXAtlasProvider(unwrapper);
  const output = await provider.generate(triangles, options());
  assert.deepEqual(
    output,
    triangles.map((t) => t.uv),
  );
  assert.equal(unwrapper.packOptions, packOptions);
  assert.equal(unwrapper.chartOptions, chartOptions);
  await assert.rejects(provider.generate(triangles, options({ height: 32 })), /square/);
  unwrapper.packAtlas = async () => ({
    atlasCount: 2,
    width: 64,
    height: 64,
    geometries: [],
  });
  await assert.rejects(provider.generate(triangles, options()), /one shared atlas/);
});
