# Changelog

## 1.0.0

Initial public API for `three-gpu-baker`.

- Modular TypeScript implementation with generated declarations and explicit extension interfaces.
- Progressive Three.js r186 TSL and WebGPU compute backends, with a CPU reference integrator.
- Diffuse bounce lighting, colored analytic/emissive lights, textured albedo and emission.
- Global lightmap atlas preparation, resolution scaling, independent direct/indirect/AO outputs.
- Selective spatial denoising and offline chart-isolated OptiX integration.
- Model/lightmap/probe import and export with checked lossless containers.
- Documentation website, four procedural lighting examples, and automated rendering tests.
