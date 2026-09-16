import type * as Types from '../types.js';
/** One sample per texel per dispatch, independent of the requested total samples. */
export declare class ProgressiveScheduler {
    dispatches: number;
    lastDispatchMs: number;
    tileSize: number;
    cursor: number;
    sample: number;
    options: Types.ResolvedBakeOptions;
    size: number;
    constructor(size: number, options: Types.ResolvedBakeOptions);
    reset(): void;
    get done(): boolean;
    next(): {
        start: number;
        count: number;
        sample: number;
    } | null;
    commit(job: Types.Dispatch, elapsedMs: number): void;
    progress(state: Types.BakeState): {
        state: Types.BakeState;
        samples: number;
        targetSamples: number;
        fraction: number;
        texelsInPass: number;
        tileSize: number;
        lastDispatchMs: number;
        dispatches: number;
    };
}
//# sourceMappingURL=scheduler.d.ts.map