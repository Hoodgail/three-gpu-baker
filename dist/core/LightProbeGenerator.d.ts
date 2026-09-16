import type { ProbeOptions, ProbeData, SceneInput, TransportScene } from '../types.js';
/** Deterministic CPU SH9 sampler. Reuse a prepared scene to share its acceleration data. */
export declare class LightProbeGenerator {
    private readonly scene;
    constructor(scene: SceneInput | TransportScene);
    generate(options: ProbeOptions): Promise<ProbeData>;
}
//# sourceMappingURL=LightProbeGenerator.d.ts.map