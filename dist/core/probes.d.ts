import type * as Types from '../types.js';
export declare function createProbeGrid({ min, max, spacing }: Types.ProbeGridOptions): {
    min: number[];
    max: number[];
    dimensions: number[];
    positions: number[][];
};
export declare function generateLightProbes(input: Types.SceneInput | Types.TransportScene, options?: Types.ProbeOptions): Promise<Types.ProbeData>;
export declare function validateProbes(data: Types.ProbeData): Types.ProbeData;
export declare function exportProbes(data: Types.ProbeData): string;
export declare function importProbes(text: string): Types.ProbeData;
/** Cosine-convolved SH returns irradiance E. Divide by π before multiplying a Lambert albedo. */
export declare function evaluateSHIrradiance(coefficients: ArrayLike<number>, normal: number[]): number[];
export declare function interpolateProbeGrid(data: Types.ProbeData, position: number[]): number[];
//# sourceMappingURL=probes.d.ts.map