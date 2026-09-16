# Light probes

Light probes capture incoming radiance as second-order spherical harmonics: nine RGB coefficients, 27 numbers per position, in Three.js ordering.

```ts
import { LightProbeGenerator, LightmapIO } from 'three-gpu-baker';
const generator = new LightProbeGenerator(scene);
const probes = await generator.generate({
  grid: { min: [-2, 0.5, -2], max: [2, 2.5, 2], spacing: 1 },
  samples: 512,
  bounces: 3,
  onProgress: ({ completed, total }) => console.log(completed, total),
});
const json = new LightmapIO().encodeProbes(probes);
```

Alternatively call `baker.generateProbes(options)` to reuse prepared BVH and material data. Supply explicit `positions` instead of `grid` for irregular placement. Bounds and sample limits are validated, and the loop yields to the host with cancellation checks. Probe integration uses the CPU backend in v1.

## Display and interpolation

```ts
import { createThreeLightProbe, interpolateProbeGrid, evaluateSHIrradiance } from 'three-gpu-baker';
const light = await createThreeLightProbe(probes.probes[0]);
scene.add(light);
const coefficients = interpolateProbeGrid(probes, [0, 1, 0]);
const irradiance = evaluateSHIrradiance(coefficients, [0, 1, 0]);
```

Stored coefficients represent **radiance**. `evaluateSHIrradiance` cosine-convolves them to irradiance E; divide by π before multiplying a Lambertian albedo. Three.js LightProbe performs its own convolution, so pass the original coefficients.

Grid interpolation is trilinear and clamps outside the bounds. It is not visibility-aware; place probes carefully around walls and interiors. The library does not automatically relocate probes out of solid geometry.
