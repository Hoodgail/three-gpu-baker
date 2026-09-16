import type * as Types from '../types.js';
/** One uniformly selected light; selection-PDF compensation keeps arbitrary light counts unbiased.
 * A null normal estimates incident radiance integrated over solid angle, for SH projection.
 */
export declare function sampleDirect(scene: Types.TransportScene, surface: Types.Surface | Types.ProbeSurface, rng: import('./math.js').RNG, { spherical }?: {
    spherical?: boolean;
}): {
    value: number[];
    direction: number[];
};
/** Integrate a sampled incident direction. No specular, transmission or volumetric transport. */
export declare function traceIncoming(scene: Types.TransportScene, surface: Types.Surface | Types.ProbeSurface, direction: number[], rng: import('./math.js').RNG, { initialPDF, bounces }?: {
    initialPDF?: number;
    bounces?: number;
}): {
    direct: number[];
    indirect: number[];
    ao: number;
};
export declare function sampleIrradiance(scene: Types.TransportScene, surface: Types.Surface, rng: import('./math.js').RNG): {
    direct: number[];
    indirect: number[];
    ao: number;
};
//# sourceMappingURL=integrator.d.ts.map