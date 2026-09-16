import type * as Types from '../types.js';
export declare class CPUBackend {
    output: Float32Array | null;
    scene: Types.PreparedScene | null;
    name: string;
    init(scene: Types.PreparedScene): Promise<void>;
    dispatch(start: number, count: number, sample: number): Promise<void>;
    read(): Promise<Float32Array<ArrayBuffer>>;
    reset(): Promise<void>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=cpu-backend.d.ts.map