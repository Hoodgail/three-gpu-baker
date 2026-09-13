# Performance & scope

## Keep dispatches bounded

The progressive scheduler adapts tile size using completed dispatch duration, submits one tile at a time, awaits the GPU queue, and yields to the browser. This limits queue growth and keeps cancellation responsive between tiles.

Start with a 64–128 pixel atlas, 8–32 samples, and two bounces. Increase quality after validating illumination. On slow devices, reduce `maxTileSize`, `bounces`, and `resolutionScale`. A smaller tile helps prevent watchdog resets but cannot guarantee that a driver will never time out. An already submitted GPU dispatch cannot be interrupted by an AbortSignal.

BVH traversal accelerates ray casting. Scene extraction, chart packing, rasterization and BVH construction happen on the CPU during preparation; large inputs can still block the main thread. Applications with heavy scenes should prepare serializable core descriptors in a worker or provide a custom compiler. Atlas memory estimates and storage-buffer limits reject oversized work before dispatch.

## Supported scope

| Feature                           | v1 behavior                                                  |
| --------------------------------- | ------------------------------------------------------------ |
| Diffuse indirect lighting         | 0–8 continuations, MIS, explicit emissive sampling           |
| GPU pipeline                      | Three.js r186 TSL + WebGPU; no WebGL compute fallback        |
| Reference rendering               | CPU diffuse integrator                                       |
| Surface textures                  | Readable static 2D albedo/emissive, uint8/float16/float32    |
| Geometry                          | Visible static meshes and instances; frozen animation only   |
| UV generation                     | Planar charts; use external unwrap for dense curved assets   |
| Denoising                         | CPU à-trous/bilateral; offline native OptiX integration      |
| Light probes                      | CPU SH9; regular-grid interpolation                          |
| Alpha, refraction, specular paths | Not supported                                                |
| Normal/bump/displacement maps     | Rejected; bake effects into geometry first                   |
| HDR/cube environment maps         | Not supported; use constant environment or emitting geometry |
| Dynamic geometry during baking    | Prepare a new snapshot                                       |

Metalness reduces diffuse reflectance; specular energy is not traced. The result is a diffuse irradiance bake, not a general offline beauty renderer.

## Render validation

`npm test` checks deterministic transport, energy invariants, chart/UV validation, scheduler/lifecycle behavior, corruption handling, model extraction, and the native process contract. `npm run test:gpu` compiles and executes the actual TSL/WGSL kernels, compares CPU/GPU results, checks selective denoising, and validates textured glTF round trips.

Browser tests also render offscreen camera views at increasing sample counts and save screenshots under `artifacts/`. The docs preview uses an offscreen render target on the same renderer, avoiding a separate canvas swapchain requirement. Test artifacts are generated locally and are excluded from npm.

Software WebGPU is useful for correctness, not representative hardware performance. Native OptiX needs separate NVIDIA validation. Run the browser suite on your target browsers and GPUs before broadening the pinned Three.js compatibility range.
