import type * as Types from '../types.js';
/** Three.js r186 TSL compute graph. Native WGSL is incorporated using supported wgslFn nodes. */
export declare class TSLBackend {
    kernel: import('three/webgpu').ComputeNode;
    seed: import('three/src/nodes/core/UniformNode.js').default<'uint', number>;
    sample: import('three/src/nodes/core/UniformNode.js').default<'uint', number>;
    active: import('three/src/nodes/core/UniformNode.js').default<'uint', number>;
    start: import('three/src/nodes/core/UniformNode.js').default<'uint', number>;
    onError: (event: GPUUncapturedErrorEvent) => void;
    failure: Error | undefined;
    loss: Error | undefined;
    device: GPUDevice;
    scene: Types.PreparedScene | null;
    disposed: boolean;
    attributes: import('three/webgpu').StorageBufferAttribute[];
    ownsRenderer: boolean;
    renderer: import('three/webgpu').WebGPURenderer;
    name: string;
    constructor({ renderer }?: {
        renderer?: import('three/webgpu').WebGPURenderer;
    });
    init(scene: Types.PreparedScene): Promise<void>;
    check(): void;
    dispatch(start: number, count: number, sample: number): Promise<void>;
    read(): Promise<Float32Array<ArrayBuffer>>;
    reset(): Promise<void>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=tsl-backend.d.ts.map