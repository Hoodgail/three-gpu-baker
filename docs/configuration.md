# Bake configuration

A good preview starts with a small atlas and a modest sample count. Raise resolution and samples once the scene's lighting is correct.

| Option                    | Default   | Notes                                                                             |
| ------------------------- | --------- | --------------------------------------------------------------------------------- |
| backend                   | tsl       | tsl, webgpu, cpu, auto                                                            |
| width / height            | 256 / 256 | Requested atlas dimensions, 8–8192                                                |
| resolutionScale           | 1         | (0,1]; dimensions floored, minimum 8                                              |
| samples                   | 128       | Target per-texel samples                                                          |
| bounces                   | 2         | 0–8 diffuse continuations; direct environment/emission still traced at 0          |
| uvMode                    | auto      | Use existing global lmUV/uv1 if present on every triangle; otherwise generate     |
| sourceUVChannel           | 0         | Three attribute used for albedo/emission: 0=`uv`, 1=`uv1`, 2=`uv2`, 3=`uv3`       |
| lightmapUVChannel         | 1         | Input/output lightmap attribute; must differ from sourceUVChannel                 |
| texelDensity              | auto-fit  | Positive pixels per world unit at effective resolution; generation/repacking only |
| atlasProvider             | —         | Optional async provider, e.g. `createXAtlasProvider(loadedUnwrapper)`             |
| padding                   | 2         | Atlas gutter, 0–32 pixels                                                         |
| aoDistance                | 1         | World-space AO ray length                                                         |
| rayBias                   | 0.0001    | World-space self-intersection offset                                              |
| maxRadiance               | 0         | 0 disables optional firefly clamping; clamping introduces bias                    |
| seed                      | 1337      | Reproducible uint32 seed                                                          |
| tileSize                  | 256       | Initial texels per dispatch                                                       |
| minTileSize / maxTileSize | 16 / 4096 | Adaptive tile limits                                                              |
| targetDispatchMs          | 8         | Scheduler target, not a guaranteed execution deadline                             |
| maxMemoryMB               | 512       | Atlas working-set allocation guard                                                |
| renderer / device         | —         | Caller-owned Three renderer / native GPU device                                   |
| backendFactory            | —         | Custom backend factory overrides backend selection                                |

## Lights and surfaces

The Three adapter supports colored `PointLight`, `SpotLight`, `DirectionalLight`, `RectAreaLight`, `AmbientLight`, and emissive geometry. AmbientLight is converted to a constant environment. Core descriptors use `point`, `spot`, `directional`, and `rect`; emissive triangle lights are generated during compilation.

Rectangular light vectors `u` and `v` are half-edge vectors. Their cross product defines emission orientation. Point and spot attenuation honor decay and cutoff distance. Texture transforms, wrap modes, flipY, color-space decoding, and material groups are preserved.

## UV channels and modes

`uv1` is the default lightmap channel. Unlike ordinary albedo `uv`, it must describe **one shared, non-overlapping atlas across every mesh being baked**. Two meshes can each have a valid local layout covering `0..1`, yet overlap completely when combined. The baker cannot assign different lighting to the same atlas pixels and rejects the scene.

| Mode                       | Behavior                                                                                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (unchanged default) | Preserve if every triangle has lightmap UVs; otherwise generate for the entire scene. A complete but invalid atlas is rejected.                                                                                                                             |
| `generate`                 | Ignore existing lightmap UVs; create and pack charts across all meshes.                                                                                                                                                                                     |
| `preserve`                 | Require and validate every triangle's lightmap UVs without moving them.                                                                                                                                                                                     |
| `existing`                 | Backward-compatible name for preservation.                                                                                                                                                                                                                  |
| `repack`                   | Require finite, nondegenerate lightmap UVs; retain their chart parameterization and pack charts together. Out-of-range input is allowed. Overlap between separate charts can be repaired; folds inside one chart require generation or external unwrapping. |

Channel numbers use Three.js conventions: `0` = `uv`, `1` = `uv1`, `2` = `uv2`, `3` = `uv3`. Albedo and emissive textures must use `sourceUVChannel`; mixed texture channels are rejected. Core descriptors continue to use `Triangle.uv` and `Triangle.lmUV` independently of Three attribute names. The selected channels are written into the detached model and result metadata, and `applyLightmaps` uses the selected lightmap channel.

```ts
const baker = new LightmapBaker({
  uvMode: 'generate',
  sourceUVChannel: 0,
  lightmapUVChannel: 1,
  width: 512,
  height: 512,
  texelDensity: 16,
  padding: 4,
});
```

Generated planar charts preserve albedo UVs. Highly curved geometry may produce many small charts. Without `texelDensity`, the built-in packer finds the largest density that fits. With a density, packing fails if it cannot fit; it never silently reduces the requested value. Chart dimensions round up to pixels with a two-pixel minimum. Repacking scales each chart according to world-space surface area versus UV area. `padding` reserves a gutter on each side of a packed chart, in pixels of the effective (resolution-scaled) atlas. Density is also measured at that effective resolution. These options do not move preserved coordinates. Result rows remain bottom-to-top (`v=0` first).

Recommended fixes for an invalid atlas:

1. Use `uvMode: 'generate'` for a combined atlas.
2. Use an external unwrap tool such as xatlas to generate one global packed atlas.
3. Bake independently overlapping meshes in separate jobs.
4. Keep albedo and lightmap coordinates in separate channels.

## Validation diagnostics

`validateLightmapUVs(triangles, width, height, padding?)` returns structured diagnostics without baking. `inspectUVs(triangles)` performs only structural checks. Preparation throws `UVValidationError` with a `diagnostics` array for invalid atlases. Every diagnostic has a `code`, `severity`, `message` and `source` identifying the original mesh, triangle and corner indices; Three inputs also include the mesh name, geometry UUID and instance index. Overlaps include `related` source information and the first conflicting `texel`.

Error codes are `missing`, `nonfinite`, `out-of-range`, `degenerate`, `overlap`, and `empty-chart`. Degeneracy means normalized double UV area ≤ `1e-12`. Overlap and empty-chart checks use pixel-center rasterization at the requested dimensions; shared edges inside a chart are allowed. Thus raster diagnostics depend on bake resolution. Missing UVs in `auto` cause regeneration for compatibility; `preserve`/`repack` report them as errors.

`padding` warnings flag charts whose rasterized gutters meet during four-neighbor dilation. They are advisory, approximate filtering diagnostics, not a guarantee for arbitrary mip chains or denoisers. They do not reject preserved atlases, maintaining existing behavior. Read successful preparation warnings from `baker.scene.uvDiagnostics` or result metadata. Use `getResult({ padding: true })` to dilate chart colors after filtering; coverage remains unchanged.

```ts
try {
  await baker.prepare(scene);
} catch (error) {
  if (error instanceof UVValidationError) {
    for (const diagnostic of error.diagnostics) console.log(diagnostic);
  } else throw error;
}
```

## Optional xatlas integration

Install `xatlas-three@0.2.1` and `xatlasjs@0.2.0` in the application. Serve their WASM and worker assets from URLs appropriate for your bundler and CSP; the baker downloads nothing automatically.

```ts
import { BufferAttribute } from 'three';
import { UVUnwrapper } from 'xatlas-three';
import { LightmapBaker, createXAtlasProvider } from 'three-gpu-baker';

const unwrapper = new UVUnwrapper({ BufferAttribute });
await unwrapper.loadLibrary(() => {}, '/vendor/xatlas.wasm', '/vendor/xatlas.js');
const baker = new LightmapBaker({
  uvMode: 'generate',
  width: 512,
  height: 512,
  padding: 4,
  atlasProvider: createXAtlasProvider(unwrapper),
});
await baker.prepare(scene);
```

The adapter submits all mesh instances in **one** `packAtlas` call and maps xatlas seam splits back to original triangle corners. It requires square bake dimensions and rejects multiple atlases, oversized output, missing/duplicate corner mappings and invalid resulting UVs. Smaller xatlas output is placed at its pixel scale within the requested atlas. `repack` passes xatlas's `useInputMeshUvs` chart option; `preserve` and complete `auto` atlases bypass the provider. Padding, resolution and density options override the corresponding unwrapper packing options for the call and are restored afterward.

Use a dedicated loaded unwrapper for each concurrent bake; the caller owns its worker lifetime. Provider completion is awaited before cancellation is checked; cancellation cannot interrupt an active WASM call. Other integrations can implement `AtlasProvider.generate`: it receives a detached complete triangle list plus resolved options and must return normalized UVs in exactly the original triangle/corner order. `SceneCompiler.compile` can now return a promise.
