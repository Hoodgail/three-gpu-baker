import { WebGPURenderer, StorageBufferAttribute, REVISION } from 'three/webgpu';
import { Fn, If, storage, instanceIndex, uniform, wgsl, wgslFn } from 'three/tsl';
import { packScene, checkStorageLimits } from './pack.js';
import { WGSL_LIBRARY, WGSL_ENTRY } from './kernels.js';
/** Three.js r186 TSL compute graph. Native WGSL is incorporated using supported wgslFn nodes. */
export class TSLBackend {
    kernel;
    seed;
    sample;
    active;
    start;
    onError;
    failure;
    loss;
    device;
    scene;
    disposed;
    attributes;
    ownsRenderer;
    renderer;
    name = 'three-tsl-webgpu';
    constructor({ renderer } = {}) {
        if (renderer)
            this.renderer = renderer;
        this.ownsRenderer = !renderer;
        this.attributes = [];
        this.disposed = false;
    }
    async init(scene) {
        if (Number(REVISION) !== 186)
            throw new Error(`This build targets Three.js r186; detected r${REVISION}. Use the pinned dependency or run the integration suite before widening support.`);
        this.scene = scene;
        if (!this.renderer) {
            const settings = { antialias: false };
            if (typeof OffscreenCanvas === 'function')
                settings.canvas = new OffscreenCanvas(1, 1);
            this.renderer = new WebGPURenderer(settings);
        }
        await this.renderer.init();
        if (!('isWebGPUBackend' in this.renderer.backend))
            throw new Error('The TSL baker requires the WebGPU backend. WebGL fallback is deliberately rejected.');
        this.device = this.renderer.backend.device;
        const packed = packScene(scene);
        checkStorageLimits(this.device, packed);
        this.device.lost.then((info) => {
            if (!this.disposed)
                this.loss = new Error(`WebGPU device lost (${info.reason}): ${info.message}`);
        });
        this.onError = (event) => {
            this.failure ??= new Error(event.error.message);
        };
        this.device.addEventListener('uncapturederror', this.onError);
        this.attributes = [packed.scene, packed.atlas, packed.result].map((array) => new StorageBufferAttribute(array, 4));
        const input = storage(this.attributes[0], 'vec4', this.attributes[0].count).toReadOnly();
        const atlas = storage(this.attributes[1], 'vec4', this.attributes[1].count).toReadOnly();
        const output = storage(this.attributes[2], 'vec4', this.attributes[2].count);
        this.start = uniform(0, 'uint');
        this.active = uniform(0, 'uint');
        this.sample = uniform(0, 'uint');
        this.seed = uniform(scene.options.seed >>> 0, 'uint');
        const nativeKernel = wgslFn(WGSL_ENTRY, [wgsl(WGSL_LIBRARY)]);
        this.kernel = Fn(() => {
            If(instanceIndex.lessThan(this.active), () => {
                nativeKernel({
                    pixel: this.start.add(instanceIndex),
                    sampleIndex: this.sample,
                    seed: this.seed,
                    scene: input,
                    atlas,
                    output,
                }).toVar('lm_status'); // Materialize the call: a discarded uint return omits its side effects.
            });
        })().compute(scene.options.maxTileSize, [64]);
        // Compile and upload with zero active rays. This also validates the actual TSL shader graph.
        await this.renderer.computeAsync(this.kernel);
        await this.device.queue.onSubmittedWorkDone();
        this.check();
    }
    check() {
        if (this.disposed)
            throw new Error('Backend is disposed.');
        if (this.loss)
            throw this.loss;
        if (this.failure)
            throw this.failure;
    }
    async dispatch(start, count, sample) {
        this.check();
        this.kernel.count = count;
        this.start.value = start;
        this.active.value = count;
        this.sample.value = sample;
        await this.renderer.computeAsync(this.kernel);
        // computeAsync submits; explicitly fence completion to prevent unbounded queue growth.
        await this.device.queue.onSubmittedWorkDone();
        this.check();
    }
    async read() {
        this.check();
        const result = await this.renderer.getArrayBufferAsync(this.attributes[2]);
        this.check();
        return new Float32Array(result).slice();
    }
    async reset() {
        this.check();
        this.attributes[2].array.fill(0);
        this.attributes[2].needsUpdate = true;
        this.active.value = 0;
        await this.renderer.computeAsync(this.kernel);
        await this.device.queue.onSubmittedWorkDone();
        this.check();
    }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        if (this.device && this.onError)
            this.device.removeEventListener('uncapturederror', this.onError);
        this.kernel?.dispose();
        // r186 has no standalone public StorageBufferAttribute.dispose(). Keep this compatibility
        // boundary isolated; it releases the attributes and Three's memory accounting together.
        for (const attribute of this.attributes) {
            const renderer = this.renderer;
            if (renderer?._attributes)
                renderer._attributes.delete(attribute);
            else
                renderer?.backend?.destroyAttribute?.(attribute);
        }
        if (this.ownsRenderer)
            this.renderer?.dispose();
        this.attributes = [];
        this.scene = null;
    }
}
//# sourceMappingURL=tsl-backend.js.map