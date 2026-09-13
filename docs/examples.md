# Example scenes

Run `npm ci` and `npm run dev`, then open **Examples**. Every scene is procedural and self-contained; no model downloads or paid assets are needed.

| Scene                   | Demonstrates                                         | Try this                                          |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Color in the shadows    | Cornell room, emissive mesh, colored diffuse bounces | Compare 0 and 3 bounces in the indirect channel.  |
| A study in color        | Point, spot, and rectangular colored lights          | Inspect direct versus indirect lighting.          |
| Surfaces that give back | Repeating albedo and patterned emissive textures     | Watch texture colors transfer to nearby surfaces. |
| Under an open sky       | Directional sunlight, constant sky, separate AO      | Compare AO with the combined irradiance map.      |

The lighting lab allows backend selection, sample counts, resolution scaling, bounce limits, selective denoising, pause/resume, and export. Reset before changing the active bake configuration.

## Use a scene in code

Each example implements `BakingExample` with metadata, default options, and `create(): CoreScene`. Source lives in `examples/scenes/index.ts`.

```ts
import { LightmapBaker } from 'three-gpu-baker';
import { CornellBox } from './examples/scenes/index.js';

const example = new CornellBox();
const baker = new LightmapBaker({ ...example.options, backend: 'tsl' });
try {
  await baker.prepare(example.create());
  const result = await baker.bake();
} finally {
  await baker.dispose();
}
```

## Headless CPU example

```sh
npm run example:cpu
```

This writes a small Cornell bake and preview under `artifacts/example/`. It demonstrates the same API without a browser or GPU. To run it after unpacking the npm package, use the documented core scene descriptor shape instead of repository example imports.

## Export from the lab

**Export bake bundle** downloads the detached GLB, lossless TLMB lightmap, linear PFM channels, PNG previews, and metadata. **Generate & export light probes** samples an 18-position grid and downloads radiance SH9 JSON. Probe generation uses the CPU transport implementation and reports progress.

## Rebuild the scene thumbnails

Run `npm run examples:render` after installing Playwright Chromium. This renders all four scenes at 256 samples with selective à-trous filtering and updates the documentation images. Test runs save their own renders under `artifacts/` and do not overwrite the website assets.
