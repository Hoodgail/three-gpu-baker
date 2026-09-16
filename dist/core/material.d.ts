import type * as Types from '../types.js';
export declare function validateTexture(texture: Types.LinearTexture | undefined, name?: string): void;
export declare function sampleTexture(texture: Types.LinearTexture | undefined, uv: number[]): number[];
export declare function evaluateMaterial(material: Types.DiffuseMaterial, uv: number[]): {
    albedo: number[];
    emission: number[];
    doubleSided: boolean;
};
//# sourceMappingURL=material.d.ts.map