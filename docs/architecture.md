# Extending the baker

The session orchestrator owns lifecycle and scheduling. Transport backends own accumulation resources. Scene compilation and denoisers are replaceable services.

## Modules

| Directory   | Responsibility                                                                   |
| ----------- | -------------------------------------------------------------------------------- |
| src/core    | Validation, atlas rasterization, BVH, diffuse CPU integration, probes, scheduler |
| src/gpu     | Packed storage layout, shared WGSL transport, TSL graph, native WebGPU backend   |
| src/three   | Static scene extraction, model I/O, portable textures, display materials         |
| src/denoise | Chart-aware spatial filters and loopback adapter                                 |
| src/io      | Binary codecs, images, bundles                                                   |
| src/node    | Native process orchestration and CLI                                             |

The TSL backend integrates native WGSL functions through `wgslFn`. TSL owns compute graph construction, uniforms and storage bindings; the shared WGSL kernel implements ray traversal and transport. The native WebGPU backend uses that same kernel directly. The CPU implementation provides deterministic reference behavior for regression tests.

## Replace a backend

Implement `BakeBackend` and supply a factory. `init` receives a `PreparedScene`; `dispatch` processes a contiguous texel range for one sample index; `read` returns a detached accumulation buffer.

```ts
const baker = new LightmapBaker({
  backendFactory: async (options) => new MyBackend(options),
});
```

The accumulation layout is 12 floats per texel: direct RGB + count, indirect RGB + count, AO + two reserved values + count. Counts are represented as floats in transport storage; the validated sample limit preserves integer precision. GPU storage and scene layout are defined in `src/gpu/pack.ts`.

Each dispatch must fence completed work before resolving. `reset` clears accumulation. `dispose` must be idempotent and must not destroy caller-owned devices. Throw on device loss; the scheduler cannot make a lost device recoverable.

## Replace scene preparation

Subclass `SceneCompiler` and override `compile(scene, options)`. Return a complete `PreparedScene` (or a promise) with a matching BVH triangle order, atlas, geometry buffer, `geometryMappings` and `uvDiagnostics`. Atlas chart triangle indices reference this same prepared order. This is the boundary for a spatial cache or specialized receiver selection. For unwrapping alone, supply an async `AtlasProvider` via bake options; the built-in compiler validates its complete global output before building acceleration data.

`SceneAdapter<Input>` defines asynchronous extraction to a `CoreScene`. `ThreeSceneAdapter` is provided. A custom adapter can run before `prepare`: `await baker.prepare(await adapter.extract(input))`.

## Replace denoising

Implement `Denoiser` with a `type` string and `run(result, {signal})`. Pass the instance to `getResult({denoise})`. Return a detached result, preserve direct light and guides, and recompute lightmap as direct + indirect. Preserve the AO convention and coverage. Custom denoisers are trusted application code; built-in spatial and OptiX implementations enforce their channel-preservation contracts.

## Transport references

The implementation follows standard diffuse path-tracing techniques; no engine source is vendored here. Useful primary references:

- [Three.js TSL documentation](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer): tiled accumulation and physically based GPU transport.
- [PBRT: Light Transport](https://pbr-book.org/4ed/Light_Transport_I_Surface_Reflection): next-event estimation and multiple importance sampling.
- [Godot LightmapGI](https://docs.godotengine.org/en/stable/classes/class_lightmapgi.html): baked-lightmap workflows.
- [NVIDIA OptiX](https://developer.nvidia.com/rtx/ray-tracing/optix): native denoising SDK.
