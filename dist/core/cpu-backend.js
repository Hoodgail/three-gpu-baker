import { RNG, sampleSeed } from './math.js';
import { sampleIrradiance } from './integrator.js';
export class CPUBackend {
    output;
    scene;
    name = 'cpu-reference';
    async init(scene) {
        this.scene = scene;
        this.output = new Float32Array(scene.gbuffer.width * scene.gbuffer.height * 12);
    }
    async dispatch(start, count, sample) {
        const { scene, output } = this;
        if (!scene || !output)
            throw new Error('Backend is not initialized.');
        const g = scene.gbuffer;
        for (let i = start; i < start + count; i++) {
            if (!g.coverage[i])
                continue;
            const p = i * 3, surface = {
                p: Array.from(g.positions.subarray(p, p + 3)),
                n: Array.from(g.normals.subarray(p, p + 3)),
                g: Array.from(g.geometricNormals.subarray(p, p + 3)),
                triangle: g.triangleIds[i],
            };
            const value = sampleIrradiance(scene, surface, new RNG(sampleSeed(i, sample, scene.options.seed)));
            const offset = i * 12, n = output[offset + 3] + 1;
            for (let k = 0; k < 3; k++) {
                output[offset + k] += (value.direct[k] - output[offset + k]) / n;
                output[offset + 4 + k] += (value.indirect[k] - output[offset + 4 + k]) / n;
            }
            output[offset + 8] += (value.ao - output[offset + 8]) / n;
            output[offset + 3] = n;
            output[offset + 7] = n;
            output[offset + 11] = n;
        }
    }
    async read() {
        return this.output.slice();
    }
    async reset() {
        this.output.fill(0);
    }
    async dispose() {
        this.output = null;
        this.scene = null;
    }
}
//# sourceMappingURL=cpu-backend.js.map