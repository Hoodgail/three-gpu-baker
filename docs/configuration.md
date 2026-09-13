# Bake configuration

A good preview starts with a small atlas and a modest sample count. Raise resolution and samples once the scene's lighting is correct.

| Option                    | Default   | Notes                                                                         |
| ------------------------- | --------- | ----------------------------------------------------------------------------- |
| backend                   | tsl       | tsl, webgpu, cpu, auto                                                        |
| width / height            | 256 / 256 | Requested atlas dimensions, 8–8192                                            |
| resolutionScale           | 1         | (0,1]; dimensions floored, minimum 8                                          |
| samples                   | 128       | Target per-texel samples                                                      |
| bounces                   | 2         | 0–8 diffuse continuations; direct environment/emission still traced at 0      |
| uvMode                    | auto      | Use existing global lmUV/uv1 if present on every triangle; otherwise generate |
| padding                   | 2         | Atlas gutter, 0–32 pixels                                                     |
| aoDistance                | 1         | World-space AO ray length                                                     |
| rayBias                   | 0.0001    | World-space self-intersection offset                                          |
| maxRadiance               | 0         | 0 disables optional firefly clamping; clamping introduces bias                |
| seed                      | 1337      | Reproducible uint32 seed                                                      |
| tileSize                  | 256       | Initial texels per dispatch                                                   |
| minTileSize / maxTileSize | 16 / 4096 | Adaptive tile limits                                                          |
| targetDispatchMs          | 8         | Scheduler target, not a guaranteed execution deadline                         |
| maxMemoryMB               | 512       | Atlas working-set allocation guard                                            |
| renderer / device         | —         | Caller-owned Three renderer / native GPU device                               |
| backendFactory            | —         | Custom backend factory overrides backend selection                            |

## Lights and surfaces

The Three adapter supports colored `PointLight`, `SpotLight`, `DirectionalLight`, `RectAreaLight`, `AmbientLight`, and emissive geometry. AmbientLight is converted to a constant environment. Core descriptors use `point`, `spot`, `directional`, and `rect`; emissive triangle lights are generated during compilation.

Rectangular light vectors `u` and `v` are half-edge vectors. Their cross product defines emission orientation. Point and spot attenuation honor decay and cutoff distance. Texture transforms, wrap modes, flipY, color-space decoding, and material groups are preserved.

## Existing UVs

For an existing atlas, every receiver must use one globally non-overlapping `uv1` layout in [0,1]. Multiple meshes with independently overlapping atlases cannot share a bake. The rasterizer rejects overlaps, degenerate UVs, and charts without covered texels.

Generated charts preserve albedo UVs. Planar grouping is deterministic; highly curved geometry may produce many small charts. Use a dedicated unwrap tool such as xatlas for dense production assets, then select `uvMode: 'existing'`.
