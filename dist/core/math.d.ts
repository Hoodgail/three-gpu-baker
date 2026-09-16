import type * as Types from '../types.js';
/** Small allocation-friendly vector helpers shared by the reference integrator. */
export declare const PI: number;
export declare const add: (a: number[], b: number[]) => number[];
export declare const sub: (a: number[], b: number[]) => number[];
export declare const scale: (a: number[], s: number) => number[];
export declare const mul: (a: number[], b: number[]) => number[];
export declare const dot: (a: number[], b: number[]) => number;
export declare const cross: (a: number[], b: number[]) => number[];
export declare const length: (a: number[]) => number;
export declare const normalize: (a: number[]) => number[];
export declare const maxComponent: (a: number[]) => number;
export declare const clamp: (x: number, a: number, b: number) => number;
export declare const lerp: (a: number, b: number, t: number) => number;
export declare const luminance: (c: number[]) => number;
export declare const mix3: (a: number[], b: number[], c: number[], w: number[]) => number[];
export declare const geometricNormal: (t: Types.Triangle) => number[];
export declare const triangleArea: (t: Types.Triangle) => number;
export declare const powerHeuristic: (a: number, b: number) => number;
export declare const srgbToLinear: (x: number) => number;
export declare const linearToSrgb: (x: number) => number;
/** 32-bit PCG permutation. The high 24 bits map exactly to an f32 in [0,1). */
export declare function pcg(value: number): number;
export declare class RNG {
    state: number;
    constructor(seed?: number);
    next(): number;
}
export declare function sampleSeed(pixel: number, sample: number, seed: number): number;
export declare function cosineHemisphere(n: number[], rng: RNG): number[];
export declare function uniformSphere(rng: RNG): number[];
export declare function shBasis([x, y, z]: number[]): number[];
export declare function abortIfNeeded(signal: AbortSignal | undefined): void;
export declare const yieldToHost: () => Promise<unknown>;
//# sourceMappingURL=math.d.ts.map