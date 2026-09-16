# Changelog

## Unreleased

- Add configurable source/lightmap UV channels (defaults remain `uv`/`uv1`), explicit `generate`, `preserve` and `repack` modes; retain `auto` and `existing` compatibility.
- Add fixed world-space texel density, shared multi-mesh packing, and an optional async xatlas-three adapter with no mandatory WASM dependency.
- Report structured mesh/triangle diagnostics for missing, nonfinite, out-of-range, degenerate, overlapping and empty-chart UVs, plus advisory gutter warnings.
- Expose source geometry, instance, triangle and corner mappings through preparation and detached model output; keep atlas chart references correct after BVH reordering.
- Add procedural UV examples, CPU regressions and a real xatlas WASM browser test.

## 1.0.1

Initial public API for `three-gpu-baker`.

- Modular TypeScript implementation with generated declarations and explicit extension interfaces.
- Progressive Three.js r186 TSL and WebGPU compute backends, with a CPU reference integrator.
- Diffuse bounce lighting, colored analytic/emissive lights, textured albedo and emission.
- Global lightmap atlas preparation, resolution scaling, independent direct/indirect/AO outputs.
- Selective spatial denoising and offline chart-isolated OptiX integration.
- Model/lightmap/probe import and export with checked lossless containers.
- Documentation website, four procedural lighting examples, and automated rendering tests.
