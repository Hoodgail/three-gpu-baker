import { generateLightProbes } from './probes.js';
/** Deterministic CPU SH9 sampler. Reuse a prepared scene to share its acceleration data. */
export class LightProbeGenerator {
    scene;
    constructor(scene) {
        this.scene = scene;
    }
    generate(options) {
        return generateLightProbes(this.scene, options);
    }
}
//# sourceMappingURL=LightProbeGenerator.js.map