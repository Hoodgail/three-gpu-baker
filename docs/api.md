# API reference

The root entry exports the high-level classes, helpers, and public TypeScript types. Subpath imports expose focused modules.

| Entry                       | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `three-gpu-baker` | Baker, I/O, probes, denoisers, public types                   |
| `…/core`                    | CPU transport, scheduler, scene preparation, geometry helpers |
| `…/gpu`                     | TSL and native WebGPU backends, buffer layout                 |
| `…/three`                   | Three.js adapters and model I/O                               |
| `…/io`                      | TLMB, PFM, PNG, ZIP codecs                                    |
| `…/denoise`                 | Spatial filter and loopback service adapter                   |
| `…/node`                    | Offline native OptiX runner; Node only                        |

## LightmapBaker

`new LightmapBaker(options?, compiler?)` creates a progressive rendering session. Options are validated and frozen. Supply a `SceneCompiler` subclass as the second argument to customize preparation.

| Member                                 | Contract                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `prepare(scene, {signal}?)`            | Extract, validate, build atlas/BVH, initialize backend. Returns this baker.                  |
| `step()`                               | Submit and await one bounded tile; return progress.                                          |
| `bake({signal,onProgress}?)`           | Accumulate to target samples or pause; return a snapshot.                                    |
| `pause()` / `cancel()`                 | Stop after the submitted tile.                                                               |
| `reset()`                              | Clear accumulation while retaining prepared resources.                                       |
| `getResult({denoise,padding,signal}?)` | Detached HDR channel snapshot; optionally filter/dilate.                                     |
| `createModel()`                        | Detached Three.js Group with generated global `uv1`.                                         |
| `generateProbes(options)`              | CPU SH9 integration using prepared acceleration data.                                        |
| `dispose()`                            | Await work and release owned backend resources.                                              |
| `progress`                             | State, samples, targetSamples, fraction, texelsInPass, tileSize, lastDispatchMs, dispatches. |
| `state`                                | idle, preparing, ready, baking, paused, complete, resetting, error, disposed.                |

Overlapping lifecycle mutations are rejected. Await `prepare`, `reset`, and `dispose`. Concurrent `step` calls are not permitted. Backend failures enter `error`; prepare again to rebuild the session.

## BakeResult

All pixels use **bottom-to-top rows** (`v=0` first), linear sRGB, and one shared atlas. RGB channels use three floats per pixel; AO uses one. Display PNG encoding flips rows and applies an explicit preview transform.

| Channel                                    | Meaning                                                               |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `direct`, `indirect`, `lightmap`           | Float32 RGB; irradiance divided by π. lightmap = direct + indirect.   |
| `ao`                                       | Float32; 1 unoccluded, 0 occluded; never multiplied into lightmap.    |
| `albedo`                                   | Receiver diffuse reflectance, for inspection/guides.                  |
| `positions`, `normals`, `geometricNormals` | World-space surface guides.                                           |
| `coverage`, `charts`                       | Uint8 coverage and Int32 chart ownership; empty charts are -1.        |
| `sampleCounts`                             | Uint32 per-texel sample counts, including partially completed passes. |
| `metadata`                                 | Backend, units, settings, chart statistics, denoiser information.     |

Receiver albedo and emission are excluded from the irradiance map. Multiplying by albedo and adding receiver emission happens at display time.

## Service classes

`ModelIO` provides `load`, `loadFiles`, and `export`. `LightmapIO` provides `encode`, `decode`, `encodePFM`, `decodePFM`, `preview`, `bundle`, `encodeProbes`, and `decodeProbes`. Matching free functions are also exported for small functional integrations.

`SpatialDenoiser` implements the `Denoiser` interface. `LightProbeGenerator` accepts a scene and exposes `generate(options)`. `ThreeSceneAdapter` implements `SceneAdapter<Object3D>`.

See the generated `.d.ts` files for exact parameter and return types; declarations are built directly from the implementation.
