import type * as Types from './types.js';
import { SceneCompiler } from './core/SceneCompiler.js';
import { ProgressiveScheduler } from './core/scheduler.js';
/** Stateful progressive baker. All snapshots/denoised images are detached from accumulation. */
export declare class LightmapBaker {
    private readonly compiler;
    private resetPromise;
    private readPromise;
    private runPromise;
    private stepPromise;
    fallbackReason: string | null;
    error: unknown;
    private progressiveScheduler;
    get scheduler(): ProgressiveScheduler | null;
    private transportBackend;
    get backend(): Types.BakeBackend | null;
    private preparedScene;
    get scene(): Types.PreparedScene | null;
    private inProgressCallback;
    private disposing;
    private disposed;
    private stop;
    private currentState;
    get state(): Types.BakeState;
    readonly options: Types.ResolvedBakeOptions;
    constructor(options?: Types.BakeOptions, compiler?: SceneCompiler);
    private assertPrepared;
    private assertIdleOperation;
    prepare(input: Types.SceneInput, { signal }?: {
        signal?: AbortSignal;
    }): Promise<this>;
    get progress(): {
        state: Types.BakeState;
        samples: number;
        targetSamples: number;
        fraction: number;
        texelsInPass: number;
        tileSize: number;
        lastDispatchMs: number;
        dispatches: number;
    };
    step(): Promise<{
        state: Types.BakeState;
        samples: number;
        targetSamples: number;
        fraction: number;
        texelsInPass: number;
        tileSize: number;
        lastDispatchMs: number;
        dispatches: number;
    }>;
    bake({ signal, onProgress }?: Types.RunOptions): Promise<Types.BakeResult>;
    pause(): void;
    cancel(): void;
    reset(): Promise<void>;
    getResult({ denoise, padding, signal }?: Types.ResultOptions): Promise<Types.BakeResult>;
    generateProbes(options?: Types.ProbeOptions): Promise<Types.ProbeData>;
    createModel(): Promise<import("three").Group<import("three").Object3DEventMap>>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=LightmapBaker.d.ts.map