import type * as Types from './types.js';
import { validateOptions } from './core/scene.js';
import { SceneCompiler } from './core/SceneCompiler.js';
import { LightProbeGenerator } from './core/LightProbeGenerator.js';
import { ProgressiveScheduler } from './core/scheduler.js';
import { CPUBackend } from './core/cpu-backend.js';
import { abortIfNeeded, yieldToHost } from './core/math.js';
import { dilateChannels } from './core/atlas.js';
import { denoiseSpatial } from './denoise/atrous.js';

/** Stateful progressive baker. All snapshots/denoised images are detached from accumulation. */
export class LightmapBaker {
  private resetPromise: Promise<void> | null = null;
  private readPromise: Promise<Float32Array> | null = null;
  private runPromise: Promise<Types.BakeResult> | null = null;
  private stepPromise: Promise<Types.BakeProgress> | null = null;
  fallbackReason: string | null = null;
  error: unknown = null;
  private progressiveScheduler: import('./core/scheduler.js').ProgressiveScheduler | null = null;
  get scheduler() {
    return this.progressiveScheduler;
  }
  private transportBackend: Types.BakeBackend | null = null;
  get backend() {
    return this.transportBackend;
  }
  private preparedScene: Types.PreparedScene | null = null;
  get scene() {
    return this.preparedScene;
  }
  private inProgressCallback: boolean = false;
  private disposing: boolean = false;
  private disposed: boolean = false;
  private stop: boolean = false;
  private currentState: Types.BakeState = 'idle';
  get state() {
    return this.currentState;
  }
  readonly options: Types.ResolvedBakeOptions;

  constructor(
    options: Types.BakeOptions = {},
    private readonly compiler = new SceneCompiler(),
  ) {
    this.options = Object.freeze(validateOptions(options));
    this.currentState = 'idle';
    this.stop = false;
    this.disposed = false;
  }
  private assertPrepared(): asserts this is this & {
    scene: Types.PreparedScene;
    backend: Types.BakeBackend;
    scheduler: ProgressiveScheduler;
  } {
    if (this.currentState === 'preparing' || this.resetPromise)
      throw new Error('Await the current lifecycle operation first.');
    if (this.disposed) throw new Error('Baker is disposed.');
    if (!this.scene || !this.backend) throw new Error('Call and await prepare(scene) first.');
  }
  private assertIdleOperation(name: string) {
    if (
      this.stepPromise ||
      this.runPromise ||
      this.readPromise ||
      this.resetPromise ||
      this.disposing ||
      this.currentState === 'preparing'
    )
      throw new Error(
        `${name} cannot run during another operation. Pause and await the current operation first.`,
      );
    if (this.disposed) throw new Error('Baker is disposed.');
  }
  async prepare(input: Types.SceneInput, { signal }: { signal?: AbortSignal } = {}) {
    this.assertIdleOperation('prepare');
    this.currentState = 'preparing';
    this.error = null;
    this.stop = false;
    try {
      abortIfNeeded(signal);
      await this.backend?.dispose();
      this.transportBackend = null;
      let core: Types.CoreScene;
      if ('isObject3D' in input)
        core = await (
          await import('./three/scene.js')
        ).extractThreeScene(input, {
          signal,
          sourceUVChannel: this.options.sourceUVChannel,
          lightmapUVChannel: this.options.lightmapUVChannel,
        });
      else core = input;
      abortIfNeeded(signal);
      // Prevent accidental multi-gigabyte allocations before rasterization.
      const budget = this.options.maxMemoryMB ?? 512,
        estimate = this.options.width * this.options.height * 256;
      if (!Number.isFinite(budget) || budget <= 0 || estimate > budget * 1048576)
        throw new RangeError(
          `Estimated atlas working set ${(estimate / 1048576).toFixed(0)} MiB exceeds maxMemoryMB=${budget}. Lower resolutionScale or explicitly increase the budget.`,
        );
      this.preparedScene = await this.compiler.compile(core, this.options);
      abortIfNeeded(signal);
      this.progressiveScheduler = new ProgressiveScheduler(
        this.options.width * this.options.height,
        this.options,
      );
      let mode = this.options.backend;
      this.fallbackReason = null;
      if (mode === 'auto') {
        if (globalThis.navigator?.gpu || this.options.renderer) mode = 'tsl';
        else {
          mode = 'cpu';
          this.fallbackReason =
            'WebGPU API is unavailable; selected the explicit CPU reference fallback.';
        }
      }
      if (this.options.backendFactory)
        this.transportBackend = await this.options.backendFactory(this.options);
      else if (mode === 'cpu') this.transportBackend = new CPUBackend();
      else if (mode === 'webgpu') {
        const { WebGPUBackend } = await import('./gpu/webgpu-backend.js');
        this.transportBackend = new WebGPUBackend(this.options);
      } else {
        const { TSLBackend } = await import('./gpu/tsl-backend.js');
        this.transportBackend = new TSLBackend(this.options);
      }
      await this.transportBackend.init(this.preparedScene);
      abortIfNeeded(signal);
      this.currentState = 'ready';
      return this;
    } catch (error) {
      this.error = error;
      this.currentState = 'error';
      await this.backend?.dispose();
      this.transportBackend = null;
      throw error;
    }
  }
  get progress() {
    return (
      this.scheduler?.progress(this.state) ?? {
        state: this.state,
        samples: 0,
        targetSamples: this.options.samples,
        fraction: 0,
        texelsInPass: 0,
        tileSize: this.options.tileSize,
        lastDispatchMs: 0,
        dispatches: 0,
      }
    );
  }
  async step() {
    this.assertPrepared();
    if (this.readPromise) await this.readPromise;
    if (this.stepPromise) throw new Error('Concurrent step() calls are not allowed.');
    if (this.currentState === 'error')
      throw this.error ?? new Error('Baker is in error state; prepare again.');
    const job = this.scheduler.next();
    if (!job) {
      this.currentState = 'complete';
      return this.progress;
    }
    this.currentState = 'baking';
    const operation = (async () => {
      const start = performance.now();
      await this.backend.dispatch(job.start, job.count, job.sample);
      this.scheduler.commit(job, performance.now() - start);
      this.currentState = this.scheduler.done ? 'complete' : this.stop ? 'paused' : 'baking';
      return this.progress;
    })();
    this.stepPromise = operation;
    try {
      return await operation;
    } catch (error) {
      this.error = error;
      this.currentState = 'error';
      throw error;
    } finally {
      this.stepPromise = null;
    }
  }
  async bake({ signal, onProgress }: Types.RunOptions = {}) {
    this.assertPrepared();
    if (this.runPromise) throw new Error('A bake() call is already running.');
    this.stop = false;
    const operation = (async () => {
      try {
        while (!this.scheduler.done && !this.stop) {
          abortIfNeeded(signal);
          await this.step();
          this.inProgressCallback = true;
          try {
            await onProgress?.(this.progress);
          } finally {
            this.inProgressCallback = false;
          }
          await yieldToHost();
        }
        abortIfNeeded(signal);
        if (this.stop && !this.scheduler?.done) this.currentState = 'paused';
        return await this.getResult();
      } catch (error) {
        if (this.state !== 'error') {
          this.stop = true;
          this.currentState = 'paused';
        }
        throw error;
      }
    })();
    this.runPromise = operation;
    try {
      return await operation;
    } finally {
      this.runPromise = null;
    }
  }
  pause() {
    this.stop = true;
    if (
      this.scene &&
      this.scheduler &&
      !this.stepPromise &&
      !this.scheduler.done &&
      this.state !== 'error'
    )
      this.currentState = 'paused';
  }
  cancel() {
    this.pause();
  }
  async reset() {
    this.assertIdleOperation('reset');
    this.assertPrepared();
    this.currentState = 'resetting';
    this.resetPromise = this.backend.reset();
    try {
      await this.resetPromise;
      this.scheduler.reset();
      this.stop = false;
      this.currentState = 'ready';
    } catch (error) {
      this.error = error;
      this.currentState = 'error';
      throw error;
    } finally {
      this.resetPromise = null;
    }
  }
  async getResult({ denoise = 'none', padding = false, signal }: Types.ResultOptions = {}) {
    this.assertPrepared();
    if (this.stepPromise) await this.stepPromise;
    abortIfNeeded(signal);
    if (!this.readPromise) this.readPromise = this.backend.read();
    let raw;
    try {
      raw = await this.readPromise;
    } finally {
      this.readPromise = null;
    }
    const g = this.scene.gbuffer,
      n = g.width * g.height,
      direct = new Float32Array(n * 3),
      indirect = new Float32Array(n * 3),
      ao = new Float32Array(n),
      lightmap = new Float32Array(n * 3),
      sampleCounts = new Uint32Array(n);
    let minSamples = Infinity,
      maxSamples = 0;
    for (let i = 0; i < n; i++) {
      const a = i * 12;
      sampleCounts[i] = raw[a + 3];
      if (g.coverage[i]) {
        minSamples = Math.min(minSamples, sampleCounts[i]);
        maxSamples = Math.max(maxSamples, sampleCounts[i]);
      }
      ao[i] = raw[a + 8];
      for (let k = 0; k < 3; k++) {
        direct[i * 3 + k] = raw[a + k];
        indirect[i * 3 + k] = raw[a + 4 + k];
        lightmap[i * 3 + k] = raw[a + k] + raw[a + 4 + k];
      }
    }
    if (
      !direct.every(Number.isFinite) ||
      !indirect.every(Number.isFinite) ||
      !ao.every(Number.isFinite)
    )
      throw new Error(
        'Non-finite GPU output. Inspect the shader validation logs before exporting.',
      );
    let result: Types.BakeResult = {
      width: g.width,
      height: g.height,
      samples: Number.isFinite(minSamples) ? minSamples : 0,
      direct,
      indirect,
      ao,
      lightmap,
      sampleCounts,
      positions: g.positions.slice(),
      normals: g.normals.slice(),
      geometricNormals: g.geometricNormals.slice(),
      albedo: g.albedo.slice(),
      coverage: g.coverage.slice(),
      charts: g.charts.slice(),
      metadata: {
        schema: 'three-lightmap-baker',
        version: 1,
        threeRevision: 186,
        backend: this.backend.name,
        requestedWidth: this.options.requestedWidth,
        requestedHeight: this.options.requestedHeight,
        resolutionScale: this.options.resolutionScale,
        units: 'irradiance-over-pi',
        colorSpace: 'linear-srgb',
        rowOrder: 'bottom-to-top (v=0 first)',
        aoConvention: '1=unoccluded, 0=occluded',
        aoAppliedToLightmap: false,
        receiverAlbedoIncluded: false,
        receiverEmissionIncluded: false,
        bounces: this.options.bounces,
        seed: this.options.seed,
        aoDistance: this.options.aoDistance,
        rayBias: this.options.rayBias,
        maxRadiance: this.options.maxRadiance,
        minSamples: Number.isFinite(minSamples) ? minSamples : 0,
        maxSamples,
        triangleCount: this.scene.triangles.length,
        lightCount: this.scene.lights.length,
        chartCount: this.scene.atlas.chartCount,
        conservativeCharts: g.conservativeCharts ?? 0,
        coverage: g.covered / n,
        denoiser: { type: 'none' },
        uvMode: this.scene.atlas.mode,
        sourceUVChannel: this.options.sourceUVChannel,
        lightmapUVChannel: this.options.lightmapUVChannel,
        texelDensity: this.scene.atlas.density ?? this.options.texelDensity ?? null,
        uvDiagnostics: structuredClone(this.scene.uvDiagnostics),
        padding: this.options.padding,
        fallbackReason: this.fallbackReason,
      },
    };
    const denoiseOptions = typeof denoise === 'string' ? { type: denoise } : denoise;
    if (denoiseOptions && 'run' in denoiseOptions) {
      if (typeof denoiseOptions.run !== 'function')
        throw new Error(
          'OptiX requires a configured offline runner. Use exportLightmap / three-gpu-baker-denoise or createOptixDenoiser().',
        );
      result = await denoiseOptions.run(result, { signal });
    } else if (denoiseOptions?.type !== 'none')
      result = await denoiseSpatial(result, {
        ...(denoiseOptions as Types.SpatialDenoiseOptions),
        signal,
      });
    if (padding) result = dilateChannels(result, this.options.padding);
    return result;
  }
  async generateProbes(options: Types.ProbeOptions = {}) {
    this.assertPrepared();
    return new LightProbeGenerator(this.scene).generate(options);
  }
  async createModel() {
    this.assertPrepared();
    return (await import('./three/scene.js')).createThreeModel(this.scene);
  }
  async dispose() {
    if (this.disposed) return;
    if (this.inProgressCallback)
      throw new Error('Call pause() inside onProgress, then await bake() before dispose().');
    if (this.currentState === 'preparing') throw new Error('Await prepare() before disposing.');
    this.disposing = true;
    this.pause();
    await this.resetPromise?.catch(() => {});
    await this.stepPromise?.catch(() => {});
    await this.runPromise?.catch(() => {});
    await this.readPromise?.catch(() => {});
    await this.backend?.dispose();
    this.transportBackend = null;
    this.preparedScene = null;
    this.progressiveScheduler = null;
    this.disposed = true;
    this.currentState = 'disposed';
  }
}
