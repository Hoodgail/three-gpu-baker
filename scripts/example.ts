import { mkdir, writeFile } from 'node:fs/promises';
import { LightmapBaker, LightmapIO } from '../src/index.js';
import { CornellBox } from '../examples/scenes/index.js';
const example = new CornellBox();
const baker = new LightmapBaker({
  ...example.options,
  backend: 'cpu',
  width: 64,
  height: 64,
  samples: 16,
});
try {
  await baker.prepare(example.create());
  const result = await baker.bake();
  const io = new LightmapIO();
  await mkdir('artifacts/example', { recursive: true });
  await writeFile('artifacts/example/cornell.tlmb', io.encode(result));
  await writeFile('artifacts/example/cornell.png', io.preview(result, 'lightmap'));
  console.log(`Saved ${result.samples}-sample bake to artifacts/example/`);
} finally {
  await baker.dispose();
}
