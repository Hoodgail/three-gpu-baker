# Import & export

Keep lighting data independent of any one engine's material extensions.

## Models

```ts
import { ModelIO } from 'three-gpu-baker';
const models = new ModelIO();
const scene = await models.load('/assets/scene.glb');
const fromFiles = await models.loadFiles(fileInput.files, {
  entry: 'scene.gltf',
});
```

GLB, glTF, and OBJ are supported for import; GLB and glTF for export. Supply `baseURL` or a `LoadingManager` for external resources. `configureLoader(loader)` lets applications attach Draco, KTX2, or Meshopt decoding to a GLTFLoader; decoded compressed/array textures still require conversion to readable static 2D pixels for transport. OBJ material-library loading is not automatic.

Local file-set import resolves relative buffers/images against the selected entry, rejects missing or ambiguous resources, and revokes temporary object URLs. A Blob containing OBJ text needs `format: 'obj'` unless it is a named File. Bare URLs infer format from their extension.

```ts
const portable = await baker.createModel();
const glb = await models.export(portable, { binary: true });
```

Export before calling `applyLightmaps`: preview node materials are not portable glTF materials. Float material textures are converted to normalized sRGB images on a detached copy. HDR emission belongs in `emissiveIntensity`; values above 1 in material image pixels are rejected. glTF has no standard lightmap slot, so preserve the TLMB sidecar with the model's `TEXCOORD_1` atlas.

## Lightmaps and bundles

```ts
import { LightmapIO, downloadBytes } from 'three-gpu-baker';
const io = new LightmapIO();
const bytes = io.encode(result);
const restored = io.decode(bytes, { maxBytes: 256 * 1024 * 1024 });
downloadBytes(io.bundle(result, { model: glb }), 'bake.zip');
```

TLMB v1 is a lossless container: a versioned JSON channel table, little-endian typed arrays, aligned payloads, and independent metadata/payload CRC32 checksums. Import validates dimensions, sizes, offsets, range overlap, channel types, finite values, and masks. Checksums detect corruption, not malicious tampering.

PFM preserves linear HDR floats with bottom-to-top rows. PNG files are tone-mapped display previews; never use them as HDR interchange. `preview(result, 'ao')` preserves the scalar AO convention. The bundle writer produces standard uncompressed ZIP32 for broad compatibility.

External models and textures must be served with valid CORS headers. Animated meshes must be frozen before extraction; source transforms, instances, groups, and visibility are handled at snapshot time.

With nondefault UV channels, retain the selected `TEXCOORD_n` and `metadata.lightmapUVChannel` alongside the bake. Model `userData.lightmap.texCoord` records that channel. Output mesh `userData.geometryMappings` records source mesh/geometry/instance/triangle and output vertex indices; see [mapping contracts](api.md#uv-preparation-and-geometry-mappings). The default remains `TEXCOORD_1`.
