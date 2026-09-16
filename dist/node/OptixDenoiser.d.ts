import type * as Types from '../types.js';
export declare function chartCrops(result: Types.BakeResult, { margin }?: {
    margin?: number;
}): {
    width: number;
    height: number;
    margin: number;
    id: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}[];
/** Multi-source nearest-neighbor fill removes the black UV background and isolates every chart. */
export declare function fillChart(result: Types.BakeResult, crop: ChartCrop): {
    indirect: Float32Array<ArrayBuffer>;
    ao: Float32Array<ArrayBuffer>;
    normal: Float32Array<ArrayBuffer>;
};
export declare function denoiseOffline(result: Types.BakeResult, { executable, signal, onProgress, margin, channels, }?: OfflineDenoiseOptions): Promise<{
    width: number;
    height: number;
    samples: number;
    positions: Float32Array;
    normals: Float32Array;
    geometricNormals: Float32Array;
    albedo: Float32Array;
    coverage: Uint8Array;
    charts: Int32Array;
    sampleCounts: Uint32Array;
    metadata: Types.BakeMetadata;
    direct: Float32Array<ArrayBuffer>;
    indirect: Float32Array<ArrayBuffer>;
    ao: Float32Array<ArrayBuffer>;
    lightmap: Float32Array<ArrayBuffer>;
}>;
export interface ChartCrop {
    id: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
    margin: number;
}
export interface OfflineDenoiseOptions {
    executable?: string;
    signal?: AbortSignal;
    onProgress?: (progress: {
        completed: number;
        total: number;
    }) => void | Promise<void>;
    margin?: number;
    channels?: Types.DenoiseChannel[];
}
/** Offline native OptiX worker, isolated from browser bundles. */
export declare class OptixDenoiser implements Types.Denoiser {
    private readonly options;
    readonly type = "optix";
    constructor(options?: OfflineDenoiseOptions);
    run(result: Types.BakeResult, { signal }?: {
        signal?: AbortSignal;
    }): Promise<{
        width: number;
        height: number;
        samples: number;
        positions: Float32Array;
        normals: Float32Array;
        geometricNormals: Float32Array;
        albedo: Float32Array;
        coverage: Uint8Array;
        charts: Int32Array;
        sampleCounts: Uint32Array;
        metadata: Types.BakeMetadata;
        direct: Float32Array<ArrayBuffer>;
        indirect: Float32Array<ArrayBuffer>;
        ao: Float32Array<ArrayBuffer>;
        lightmap: Float32Array<ArrayBuffer>;
    }>;
}
//# sourceMappingURL=OptixDenoiser.d.ts.map