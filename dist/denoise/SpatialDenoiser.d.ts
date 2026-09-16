import type { BakeResult, Denoiser, SpatialDenoiseOptions } from '../types.js';
/** Chart-aware filtering of indirect light and AO, with unchanged direct light. */
export declare class SpatialDenoiser implements Denoiser {
    readonly type: 'atrous' | 'bilateral' | 'none';
    private readonly options;
    constructor(options?: SpatialDenoiseOptions);
    run(result: BakeResult, { signal }?: {
        signal?: AbortSignal;
    }): Promise<BakeResult>;
}
//# sourceMappingURL=SpatialDenoiser.d.ts.map