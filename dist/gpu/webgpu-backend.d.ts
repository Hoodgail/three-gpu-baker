import type * as Types from '../types.js';
import { packScene } from './pack.js';
/** Dependency-free WebGPU backend; also exercises the exact native kernels used by TSL. */
export declare class WebGPUBackend {
    bindGroup: GPUBindGroup;
    pipeline: GPUComputePipeline;
    compilationMessages: Array<{
        type: string;
        message: string;
        line: number;
        column: number;
    }>;
    params: GPUBuffer;
    onError: (event: GPUUncapturedErrorEvent) => void;
    failure: Error | undefined;
    loss: Error | undefined;
    packed: ReturnType<typeof packScene> | null;
    scene: Types.PreparedScene | null;
    disposed: boolean;
    buffers: GPUBuffer[];
    ownsDevice: boolean;
    device: GPUDevice;
    name: string;
    constructor({ device }?: {
        device?: GPUDevice;
    });
    init(scene: Types.PreparedScene): Promise<void>;
    check(): void;
    dispatch(start: number, count: number, sample: number): Promise<void>;
    read(): Promise<Float32Array<ArrayBuffer>>;
    reset(): Promise<void>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=webgpu-backend.d.ts.map