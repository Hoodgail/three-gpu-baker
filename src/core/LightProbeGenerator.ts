import type { ProbeOptions, ProbeData, SceneInput, TransportScene } from '../types.js';
import { generateLightProbes } from './probes.js';

/** Deterministic CPU SH9 sampler. Reuse a prepared scene to share its acceleration data. */
export class LightProbeGenerator {
  constructor(private readonly scene: SceneInput | TransportScene) {}
  generate(options: ProbeOptions): Promise<ProbeData> {
    return generateLightProbes(this.scene, options);
  }
}
