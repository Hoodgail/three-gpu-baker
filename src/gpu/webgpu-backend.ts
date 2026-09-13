import type * as Types from '../types.js';
import { packScene, checkStorageLimits } from './pack.js';
import { rawComputeWGSL } from './kernels.js';

/** Dependency-free WebGPU backend; also exercises the exact native kernels used by TSL. */
export class WebGPUBackend {
  bindGroup!: GPUBindGroup;
  pipeline!: GPUComputePipeline;
  compilationMessages!: Array<{ type: string; message: string; line: number; column: number }>;
  params!: GPUBuffer;
  onError!: (event: GPUUncapturedErrorEvent) => void;
  failure!: Error | undefined;
  loss!: Error | undefined;
  packed!: ReturnType<typeof packScene> | null;
  scene!: Types.PreparedScene | null;
  disposed!: boolean;
  buffers!: GPUBuffer[];
  ownsDevice!: boolean;
  device!: GPUDevice;
  name = 'webgpu';
  constructor({ device }: { device?: GPUDevice } = {}) {
    if (device) this.device = device;
    this.ownsDevice = !device;
    this.buffers = [];
    this.disposed = false;
  }
  async init(scene: Types.PreparedScene) {
    this.scene = scene;
    if (!this.device) {
      if (!globalThis.navigator?.gpu)
        throw new Error(
          'WebGPU is unavailable. Use HTTPS/localhost and a WebGPU-capable browser, or select backend: "cpu".',
        );
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('No WebGPU adapter.');
      this.device = await adapter.requestDevice();
    }
    const device = this.device,
      packed = packScene(scene);
    checkStorageLimits(device, packed);
    this.packed = packed;
    device.lost.then((info) => {
      if (!this.disposed)
        this.loss = new Error(`WebGPU device lost (${info.reason}): ${info.message}`);
    });
    this.onError = (event) => {
      this.failure = new Error(event.error.message);
    };
    device.addEventListener('uncapturederror', this.onError);
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    for (const name of ['scene', 'atlas', 'result'] as const) {
      const data = packed[name],
        buffer = device.createBuffer({
          label: `lightmap/${name}`,
          size: data.byteLength,
          usage: storageUsage,
          mappedAtCreation: true,
        });
      new Float32Array(buffer.getMappedRange()).set(data);
      buffer.unmap();
      this.buffers.push(buffer);
    }
    this.params = device.createBuffer({
      label: 'lightmap/params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const module = device.createShaderModule({
      label: 'lightmap/path-kernel',
      code: rawComputeWGSL(),
    });
    const info = await module.getCompilationInfo();
    this.compilationMessages = info.messages.map((m) => ({
      type: m.type,
      message: m.message,
      line: m.lineNum,
      column: m.linePos,
    }));
    const errors = info.messages.filter((m) => m.type === 'error');
    if (errors.length)
      throw new Error(errors.map((e) => `WGSL ${e.lineNum}:${e.linePos} ${e.message}`).join('\n'));
    this.pipeline = await device.createComputePipelineAsync({
      label: 'lightmap/path-pipeline',
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [...this.buffers, this.params].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
    this.check();
  }
  check() {
    if (this.disposed) throw new Error('Backend is disposed.');
    if (this.loss) throw this.loss;
    if (this.failure) throw this.failure;
  }
  async dispatch(start: number, count: number, sample: number) {
    this.check();
    const device = this.device;
    device.queue.writeBuffer(
      this.params,
      0,
      new Uint32Array([start, count, sample, this.scene!.options.seed >>> 0]),
    );
    const encoder = device.createCommandEncoder({ label: 'lightmap/tile' }),
      pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    this.check();
  }
  async read() {
    this.check();
    const device = this.device,
      size = this.packed!.result.byteLength;
    const staging = device.createBuffer({
      label: 'lightmap/readback',
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(this.buffers[2], 0, staging, 0, size);
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      this.check();
      return new Float32Array(staging.getMappedRange().slice(0));
    } finally {
      staging.unmap();
      staging.destroy();
    }
  }
  async reset() {
    this.check();
    this.device.queue.writeBuffer(this.buffers[2], 0, this.packed!.result);
    await this.device.queue.onSubmittedWorkDone();
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.device && this.onError)
      this.device.removeEventListener('uncapturederror', this.onError);
    for (const b of this.buffers) b.destroy();
    this.params?.destroy();
    if (this.ownsDevice) this.device?.destroy();
    this.buffers = [];
    this.packed = null;
    this.scene = null;
  }
}
