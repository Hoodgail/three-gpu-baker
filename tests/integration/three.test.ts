import test from 'node:test';
import assert from 'node:assert/strict';
let T;
try {
  T = await import('three/webgpu');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const options = { skip: !T ? 'Three.js dependency is unavailable; npm ci is required.' : false };
test(
  'Three r186 extraction preserves UV0 and handles world-space negative scale',
  options,
  async () => {
    const { extractThreeScene, createThreeModel } = await import('../../src/three/scene.js');
    const { prepareCoreScene, validateOptions } = await import('../../src/core/scene.js');
    const root = new T.Group(),
      mesh = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshStandardMaterial());
    mesh.scale.x = -1;
    mesh.position.set(2, 1, 0);
    root.add(mesh);
    const before = mesh.geometry.getAttribute('uv').array.slice(),
      s = await extractThreeScene(root);
    assert.equal(s.triangles.length, 2);
    assert.ok(s.triangles.flatMap((t) => t.p).every((p) => p[0] >= 1 && p[0] <= 3));
    const model = createThreeModel(prepareCoreScene(s, validateOptions({ width: 32, height: 32 })));
    assert.ok(model.children[0].geometry.getAttribute('uv1'));
    assert.deepEqual(mesh.geometry.getAttribute('uv').array, before);
  },
);
test('Instanced meshes are flattened at their individual transforms', options, async () => {
  const { extractThreeScene } = await import('../../src/three/scene.js');
  const root = new T.Group(),
    mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial(), 2);
  mesh.setMatrixAt(0, new T.Matrix4().makeTranslation(-2, 0, 0));
  mesh.setMatrixAt(1, new T.Matrix4().makeTranslation(2, 0, 0));
  root.add(mesh);
  const s = await extractThreeScene(root);
  assert.equal(s.triangles.length, 4);
  assert.equal(new Set(s.triangles.map((t) => t.owner)).size, 2);
});
test('Three texture extraction decodes sRGB and applies matrix transforms', options, async () => {
  const { extractTexture } = await import('../../src/three/scene.js');
  const map = new T.DataTexture(new Uint8Array([128, 64, 32, 255]), 1, 1);
  map.colorSpace = T.SRGBColorSpace;
  map.repeat.set(2, 3);
  map.offset.set(0.2, 0.4);
  const t = await extractTexture(map);
  assert.ok(Math.abs(t.data[0] - 0.21586) < 0.0001);
  assert.ok(t.transform.every((v, i) => Math.abs(v - [2, 0, 0.2, 0, 3, 0.4][i]) < 1e-12));
});
test('GLB export/import roundtrip preserves the generated TEXCOORD_1 atlas', options, async () => {
  // Browser FileReader API, using Node's Blob implementation for this geometry-only fixture.
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
        this.onloadend?.();
      });
    }
  };
  const { LightmapBaker } = await import('../../src/index.js'),
    { exportModel, importModel } = await import('../../src/three/io.js'),
    { planeScene } = await import('../fixtures.js');
  const b = new LightmapBaker({ backend: 'cpu', width: 32, height: 32, samples: 1 });
  await b.prepare(planeScene());
  const model = await b.createModel(),
    binary = await exportModel(model),
    copy = await importModel(binary, { format: 'glb' });
  let found = false;
  copy.traverse((o) => {
    if (o.isMesh) {
      assert.ok(o.geometry.getAttribute('uv1'));
      found = true;
    }
  });
  assert.ok(found);
  await b.dispose();
});
test('Baked preview uses a node material and channel-one HDR textures', options, async () => {
  const { LightmapBaker, applyLightmaps } = await import('../../src/index.js'),
    { planeScene } = await import('../fixtures.js');
  const b = new LightmapBaker({ backend: 'cpu', width: 32, height: 32, samples: 1 });
  await b.prepare(planeScene());
  const r = await b.bake(),
    model = await b.createModel(),
    textures = await applyLightmaps(model, r);
  assert.equal(textures.lightmap.channel, 1);
  assert.ok(model.children[0].material.isNodeMaterial);
  Object.values(textures).forEach((t) => t.dispose());
  await b.dispose();
});
test('BoxGeometry material groups work with one scalar material', options, async () => {
  const { extractThreeScene } = await import('../../src/three/scene.js');
  const root = new T.Group();
  root.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial()));
  const s = await extractThreeScene(root);
  assert.equal(s.triangles.length, 12);
  assert.ok(s.triangles.every((t) => t.material === 0));
});
test(
  'Portable material export converts float linear textures without mutating source',
  options,
  async () => {
    const { prepareExportModel } = await import('../../src/three/portable.js');
    const map = new T.DataTexture(
      new Float32Array([0.5, 0.25, 0.125, 1]),
      1,
      1,
      T.RGBAFormat,
      T.FloatType,
    );
    map.colorSpace = T.LinearSRGBColorSpace;
    map.matrix.set(2, 0, 0.2, 0, 3, 0.4, 0, 0, 1);
    map.matrixAutoUpdate = false;
    const source = new T.Mesh(new T.PlaneGeometry(), new T.MeshStandardMaterial({ map }));
    const before = map.image.data.slice();
    const p = await prepareExportModel(source);
    try {
      assert.deepEqual(Array.from(p.root.material.map.image.data), [188, 137, 99, 255]);
      assert.deepEqual(map.image.data, before);
      assert.equal(map.type, T.FloatType);
      assert.ok(p.root.material.map.matrix.equals(map.matrix));
      assert.notEqual(p.root.material, source.material);
    } finally {
      p.dispose();
    }
  },
);
test('Model import accepts Blob and JSON text without extension guessing', options, async () => {
  const { importModel } = await import('../../src/three/io.js');
  const json = JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 });
  assert.ok((await importModel(json)).isObject3D);
  assert.ok((await importModel(new Blob([json]), { format: 'gltf' })).isObject3D);
});
