# Quick start

Turn a static scene into portable diffuse lighting. Start with the local lighting lab, or add the baker to an existing Three.js application.

## Install

```sh
npm install three-gpu-baker three
```

Use Three.js r186 (`0.186.0`). TypeScript consumers should also install `@types/three` and `@webgpu/types`. The package is ESM and targets ES2022. Browser WebGPU requires a secure context: HTTPS or localhost.

## Prepare and accumulate

```ts
import { WebGPURenderer } from 'three/webgpu';
import { LightmapBaker, applyLightmaps } from 'three-gpu-baker';

const renderer = new WebGPURenderer();
await renderer.init();
const baker = new LightmapBaker({ renderer, samples: 128, bounces: 3 });

await baker.prepare(scene);
await baker.bake({
  onProgress: ({ samples, fraction }) => {
    progressElement.textContent = `${samples} spp · ${Math.round(fraction * 100)}%`;
  },
});
const result = await baker.getResult({ denoise: 'atrous', padding: true });
const bakedModel = await baker.createModel();
const textures = await applyLightmaps(bakedModel, result);
```

`prepare` snapshots visible static meshes into world space. It leaves your source objects unchanged. `createModel` returns a detached model carrying the generated global `uv1` atlas. Apply the bake to that model, rather than to the original geometry.

`applyLightmaps` produces fully baked diffuse node materials: albedo × lightmap + emission. It does not add dynamic lighting or multiply AO a second time. Keep the original detached model for glTF export before applying these preview materials.

## Own the lifecycle

```ts
const controller = new AbortController();
const job = baker.bake({ signal: controller.signal });
// Later:
baker.pause();
await job;
await baker.bake(); // resumes the same accumulation
await baker.reset(); // clears samples, keeps the compiled scene
```

`cancel()` is an alias for `pause()`. Aborting rejects the run with the signal's reason and preserves completed tiles. Call `pause()` inside progress callbacks; await the bake before resetting, preparing, or disposing. For a custom frame loop, call and await `step()` yourself.

Snapshots own their channel arrays. Denoising and padding never change the live accumulation. Dispose the baker when finished. Also dispose detached model geometries/materials and returned textures when your application no longer needs them. A supplied renderer/device remains owned by the caller.

## No GPU?

```ts
const baker = new LightmapBaker({ backend: 'cpu', samples: 16, width: 64, height: 64 });
```

The CPU reference backend supports the same diffuse transport and file formats. Use the standalone lightmap channel previews when a 3D WebGPU preview is unavailable.
