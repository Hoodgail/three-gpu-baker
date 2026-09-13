import { examples } from '../../examples/scenes/index.js';
import { LightmapBaker } from '../../src/index.js';
import { PreviewRenderer } from '../../website/PreviewRenderer.js';
const canvas = document.createElement('canvas');
document.body.append(canvas);
const preview = new PreviewRenderer(canvas);
const images: { id: string; data: string }[] = [];
try {
  await preview.init();
  for (const example of examples) {
    const baker = new LightmapBaker({
      ...example.options,
      backend: 'tsl',
      renderer: preview.renderer,
      samples: Number(new URLSearchParams(location.search).get('samples') ?? 64),
      tileSize: 256,
      maxTileSize: 2048,
    });
    try {
      await baker.prepare(example.create());
      await baker.bake();
      await preview.update(baker, await baker.getResult({ denoise: 'atrous', padding: true }));
      images.push({ id: example.id, data: canvas.toDataURL('image/png') });
      preview.clear();
    } finally {
      await baker.dispose();
    }
  }
  Reflect.set(window, 'gallery', images);
} catch (error) {
  Reflect.set(window, 'galleryError', String(error));
} finally {
  preview.dispose();
  Reflect.set(window, 'galleryDone', true);
}
