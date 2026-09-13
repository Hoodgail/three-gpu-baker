# Denoising & OptiX

Filter noisy indirect illumination and ambient occlusion without blurring direct shadows. AO remains a separate output.

## Browser and CPU spatial filtering

```ts
import { SpatialDenoiser } from 'three-gpu-baker';
const denoiser = new SpatialDenoiser({
  type: 'atrous',
  channels: ['indirect'],
  iterations: 2,
  positionSigma: 0.25,
  normalPower: 32,
  colorSigma: 1,
});
const result = await baker.getResult({ denoise: denoiser, padding: true });
```

Supported spatial modes are `none`, `atrous`, and `bilateral`. Default channels are indirect and AO. Filters respect chart ownership and world-space normal/position differences. Direct light is copied unchanged. Apply gutter dilation after denoising; authoritative coverage remains unchanged.

## Native offline OptiX

OptiX runs outside the browser. Build the supplied native worker using NVIDIA's separately installed OptiX SDK, CUDA Toolkit, a compatible NVIDIA driver/GPU, CMake, and a C++17 compiler.

```sh
cmake -S native/optix -B native/optix/build -DOPTIX_ROOT=/path/to/NVIDIA-OptiX-SDK
cmake --build native/optix/build --config Release
npm run build
node dist/node/cli.js input.tlmb output.tlmb /absolute/path/to/lightmap-optix
```

After npm installation, the CLI is `three-gpu-baker-denoise`. You may set `OPTIX_DENOISER_BIN` instead of passing the executable path.

```ts
import { OptixDenoiser } from 'three-gpu-baker/node';
const output = await new OptixDenoiser({
  executable: '/absolute/path/to/lightmap-optix',
  channels: ['indirect', 'ao'],
  margin: 32,
}).run(result, { signal });
```

Each chart is cropped, extended by nearest-neighbor filling, filtered independently in HDR mode with a normal guide, then merged only into that chart's covered texels. This prevents unrelated UV islands from sharing the denoiser's receptive field. Albedo guiding is disabled because the irradiance map excludes receiver albedo. AO is expanded to RGB for the native worker and clamped on merge.

The worker protocol accepts three paths: input RGB PFM, normal RGB PFM, output RGB PFM. Processes run without a shell, use temporary directories, propagate cancellation, and validate output dimensions and finite pixels. SDK files and binaries are not redistributed. Native compilation and quality must be verified on the target NVIDIA machine; the automated process-contract test uses a mock worker.

## Optional local service

`createOptixDenoiser({ endpoint, token, channels })` connects to an application-supplied loopback service using TLMB request/response bodies. The endpoint defaults to `http://127.0.0.1:8790/denoise`; a bearer token of at least 16 characters is required. No server is started by the library. Configure CORS and authentication in your own service. The adapter preserves caller direct light and guides when merging results.
