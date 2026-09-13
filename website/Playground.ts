import {
  LightmapBaker,
  LightmapIO,
  ModelIO,
  downloadBytes,
  previewPixels,
  type BakeResult,
  type PreviewChannel,
} from '../src/index.js';
import { examples, type BakingExample } from '../examples/scenes/index.js';
import { PreviewRenderer } from './PreviewRenderer.js';

export class Playground {
  private baker?: LightmapBaker;
  private preview?: PreviewRenderer;
  private result?: BakeResult;
  private running?: Promise<void>;
  private selected: BakingExample = examples[0];
  private disposed = false;
  constructor(private readonly host: HTMLElement) {
    host.innerHTML = /* HTML */ `<div class="page-heading">
        <div>
          <p class="eyebrow">THE LIGHTING LAB</p>
          <h1>Make light your own.</h1>
          <p>Choose a scene. Change the transport. Watch it converge.</p>
        </div>
        <span class="badge">4 procedural scenes</span>
      </div>
      <div class="scene-grid">
        ${examples
          .map(
            (e, i) => `<button class="scene-card ${i === 0 ? 'selected' : ''}" data-scene="${e.id}">
<span class="scene-visual scene-${e.id}">
<img src="${import.meta.env.BASE_URL}images/${e.id}.png" alt="" loading="lazy"/>
</span>
<small>0${i + 1} / ${e.category}</small>
<strong>${e.title}</strong>
</button>`,
          )
          .join('')}
      </div>
      <div class="lab-grid">
        <div class="viewport-panel">
          <div class="viewport-top">
            <span id="scene-title">${this.selected.title}</span>
            <span class="status-dot" id="backend-label">Ready to bake</span>
          </div>
          <div class="viewport">
            <img
              class="placeholder"
              src="${import.meta.env.BASE_URL}images/cornell.png"
              alt="Cornell room with baked diffuse lighting"
            />
            <canvas id="preview" aria-label="Interactive baked 3D scene; drag to orbit" hidden>
            </canvas>
            <canvas id="atlas" aria-label="Selected lightmap channel" hidden> </canvas>
            <span class="viewport-hint">Drag to orbit · Scroll to zoom</span>
          </div>
          <div class="channel-bar" role="group" aria-label="Preview channel">
            ${['Scene', 'Lightmap', 'Direct', 'Indirect', 'AO'].map((c, i) => `<button data-channel="${c.toLowerCase()}" class="${i === 0 ? 'active' : ''}">${c}</button>`).join('')}
          </div>
          <div class="progress-track">
            <i id="progress-fill"> </i>
          </div>
          <div class="render-stats">
            <span> <strong id="samples-value">0</strong> samples</span>
            <span> <strong id="time-value">0.0</strong> seconds</span>
            <span> <strong id="dispatch-value">—</strong> ms / tile</span>
          </div>
        </div>
        <aside class="settings">
          <p class="eyebrow">BAKE CONFIGURATION</p>
          <label
            >Compute backend<select id="backend">
              <option value="tsl">Three.js TSL · WebGPU</option>
              <option value="cpu">CPU reference</option>
              <option value="webgpu">Native WebGPU</option>
            </select>
          </label>
          <div class="field-pair">
            <label
              >Atlas size<select id="resolution">
                <option>64</option>
                <option selected>128</option>
                <option>256</option>
                <option>512</option>
              </select>
            </label>
            <label
              >Samples<select id="samples">
                <option>8</option>
                <option selected>32</option>
                <option>64</option>
                <option>128</option>
              </select>
            </label>
          </div>
          <div class="range-label">
            <label for="bounces">Diffuse bounces</label>
            <output id="bounce-value">3</output>
          </div>
          <input id="bounces" type="range" min="0" max="8" value="3" />
          <label
            >Resolution scale<select id="scale">
              <option value="1">Full resolution</option>
              <option value="0.5">½ resolution</option>
              <option value="0.25">¼ resolution</option>
            </select>
          </label>
          <label
            >Denoising<select id="denoise">
              <option value="none">None</option>
              <option value="atrous" selected>À-trous · indirect + AO</option>
              <option value="indirect">À-trous · indirect only</option>
              <option value="ao">À-trous · AO only</option>
            </select>
          </label>
          <button id="bake" class="button primary wide">Start baking <span>↗</span></button>
          <div class="button-row">
            <button id="pause" class="button secondary" disabled>Pause</button>
            <button id="reset" class="button secondary" disabled>Reset</button>
          </div>
          <p id="status" class="status-message" role="status" aria-live="polite">
            ${this.selected.description}
          </p>
          <hr />
          <p class="eyebrow">TAKE IT WITH YOU</p>
          <button id="export" class="button secondary wide" disabled>
            Export bake bundle <span>↓</span>
          </button>
          <button id="probes" class="text-button" disabled>Generate & export light probes ↗</button>
          <p class="help">
            Bundle includes GLB, lossless HDR channels, PNG previews, and metadata.
          </p>
        </aside>
      </div>
      <div class="lab-footer">
        <div>
          <h3>Same scene. Your application.</h3>
          <p>
            Each scene is an independent TypeScript class in <code>examples/scenes</code>. All
            geometry and textures are generated locally.
          </p>
        </div>
        <a class="text-link" href="#docs/examples">Explore example code ↗</a>
      </div>`;
    this.query<HTMLInputElement>('#bounces').oninput = (e) => {
      this.query('#bounce-value').textContent = (e.target as HTMLInputElement).value;
    };
    this.query<HTMLButtonElement>('#bake').onclick = () => {
      this.running = this.bake().catch((error) => this.error(error));
    };
    this.query<HTMLButtonElement>('#pause').onclick = () => this.baker?.pause();
    this.query<HTMLButtonElement>('#reset').onclick = () => {
      void this.reset().catch((error) => this.error(error));
    };
    this.query<HTMLButtonElement>('#export').onclick = () => {
      void this.export().catch((error) => this.error(error));
    };
    this.query<HTMLButtonElement>('#probes').onclick = () => {
      void this.probes().catch((error) => this.error(error));
    };
    host.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(
      (button) =>
        (button.onclick = () => {
          void this.select(button.dataset.scene!).catch((error) => this.error(error));
        }),
    );
    host.querySelectorAll<HTMLButtonElement>('[data-channel]').forEach(
      (button) =>
        (button.onclick = () => {
          host.querySelector('[data-channel].active')?.classList.remove('active');
          button.classList.add('active');
          this.showChannel();
        }),
    );
  }
  private query<E extends HTMLElement = HTMLElement>(selector: string) {
    return this.host.querySelector<E>(selector)!;
  }
  private value(id: string) {
    return this.query<HTMLSelectElement>(`#${id}`).value;
  }
  private status(text: string) {
    this.query('#status').textContent = text;
  }
  private error(error: unknown) {
    if (!this.disposed) {
      this.status(error instanceof Error ? error.message : String(error));
      this.busy(false);
    }
  }
  private busy(value: boolean) {
    this.host
      .querySelectorAll<HTMLSelectElement | HTMLInputElement>('select,input')
      .forEach((input) => (input.disabled = value || !!this.baker));
    this.query<HTMLButtonElement>('#bake').disabled = value;
    this.query<HTMLButtonElement>('#pause').disabled = !value;
    this.query<HTMLButtonElement>('#reset').disabled = value || !this.baker;
    this.query<HTMLButtonElement>('#export').disabled = value || !this.result;
    this.query<HTMLButtonElement>('#probes').disabled = value || !this.result;
    this.host
      .querySelectorAll<HTMLButtonElement>('[data-scene]')
      .forEach((button) => (button.disabled = value));
  }
  private async select(id: string) {
    await this.reset();
    this.selected = examples.find((example) => example.id === id)!;
    this.host
      .querySelectorAll('[data-scene]')
      .forEach((button) =>
        button.classList.toggle('selected', (button as HTMLElement).dataset.scene === id),
      );
    this.query('#scene-title').textContent = this.selected.title;
    this.query<HTMLInputElement>('#bounces').value = String(this.selected.options.bounces);
    this.query('#bounce-value').textContent = String(this.selected.options.bounces);
    this.query<HTMLImageElement>('.placeholder').src =
      `${import.meta.env.BASE_URL}images/${id}.png`;
    this.status(this.selected.description);
  }
  private async bake() {
    this.busy(true);
    const start = performance.now();
    if (!this.baker) {
      this.status('Preparing geometry and compiling the transport kernel…');
      this.preview ??= new PreviewRenderer(this.query<HTMLCanvasElement>('#preview'));
      if (this.value('backend') !== 'cpu') await this.preview.init();
      this.baker = new LightmapBaker({
        backend: this.value('backend') as 'tsl' | 'cpu' | 'webgpu',
        renderer: this.value('backend') === 'tsl' ? this.preview.renderer : undefined,
        width: Number(this.value('resolution')),
        height: Number(this.value('resolution')),
        resolutionScale: Number(this.value('scale')),
        samples: Number(this.value('samples')),
        bounces: Number(this.value('bounces')),
        aoDistance: this.selected.options.aoDistance ?? 1,
        tileSize: 128,
        maxTileSize: 1024,
      });
      await this.baker.prepare(this.selected.create());
    }
    let lastSample = -1;
    await this.baker.bake({
      onProgress: async (progress) => {
        this.query('#progress-fill').style.width = `${progress.fraction * 100}%`;
        this.query('#samples-value').textContent = String(progress.samples);
        this.query('#time-value').textContent = ((performance.now() - start) / 1000).toFixed(1);
        this.query('#dispatch-value').textContent = progress.lastDispatchMs.toFixed(1);
        if (
          progress.samples !== lastSample &&
          progress.samples > 0 &&
          (progress.samples === 1 || progress.samples % 4 === 0)
        ) {
          lastSample = progress.samples;
          await this.snapshot(false);
        }
      },
    });
    await this.snapshot(true);
    this.status(
      this.baker.state === 'complete'
        ? 'Bake complete. Explore the channels or export your result.'
        : 'Paused. Resume to continue accumulating samples.',
    );
    this.query('#backend-label').textContent = this.result?.metadata.backend ?? 'Ready';
    this.query('#bake').textContent =
      this.baker.state === 'complete' ? 'Bake complete' : 'Resume baking';
    this.busy(false);
    if (this.baker.state === 'complete') this.query<HTMLButtonElement>('#bake').disabled = true;
  }
  private async snapshot(final: boolean) {
    const mode = this.value('denoise');
    this.result = await this.baker!.getResult({
      padding: true,
      denoise:
        final && mode !== 'none'
          ? {
              type: 'atrous',
              channels:
                mode === 'indirect' ? ['indirect'] : mode === 'ao' ? ['ao'] : ['indirect', 'ao'],
            }
          : 'none',
    });
    if (this.value('backend') !== 'cpu') await this.preview!.update(this.baker!, this.result);
    else if (!navigator.gpu) {
      this.host.querySelector('[data-channel].active')?.classList.remove('active');
      this.host.querySelector('[data-channel="lightmap"]')!.classList.add('active');
    } else {
      await this.preview!.init();
      await this.preview!.update(this.baker!, this.result);
    }
    this.showChannel();
  }
  private showChannel() {
    if (!this.result) return;
    const channel = (this.host.querySelector('[data-channel].active') as HTMLElement).dataset
      .channel!;
    this.query<HTMLImageElement>('.placeholder').hidden = true;
    this.query<HTMLCanvasElement>('#preview').hidden = channel !== 'scene';
    const canvas = this.query<HTMLCanvasElement>('#atlas');
    canvas.hidden = channel === 'scene';
    if (channel !== 'scene') {
      canvas.width = this.result.width;
      canvas.height = this.result.height;
      canvas
        .getContext('2d')!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(
              previewPixels(this.result, channel as PreviewChannel, { transparent: false }),
            ),
            canvas.width,
            canvas.height,
          ),
          0,
          0,
        );
    }
    this.query('.viewport-hint').textContent =
      channel === 'scene'
        ? 'Drag to orbit · Scroll to zoom'
        : channel === 'ao'
          ? 'AO: white is unoccluded · exported separately'
          : 'Linear HDR data · tone-mapped preview';
  }
  private async reset() {
    this.baker?.pause();
    await this.running;
    await this.baker?.dispose();
    this.baker = undefined;
    this.result = undefined;
    this.preview?.clear();
    this.query('#bake').textContent = 'Start baking ↗';
    this.query('#progress-fill').style.width = '0%';
    this.query('#samples-value').textContent = '0';
    this.query<HTMLCanvasElement>('#preview').hidden = true;
    this.query<HTMLCanvasElement>('#atlas').hidden = true;
    this.query<HTMLImageElement>('.placeholder').hidden = false;
    this.busy(false);
    this.status('Configuration reset. Choose your settings and start baking.');
  }
  private async export() {
    if (!this.baker || !this.result) return;
    this.busy(true);
    this.status('Preparing a portable GLB and HDR lightmap bundle…');
    try {
      const model = await this.baker.createModel();
      const binary = await new ModelIO().export(model, { binary: true });
      downloadBytes(
        new LightmapIO().bundle(this.result, { model: binary as ArrayBuffer }),
        `${this.selected.id}-bake.zip`,
      );
      this.status('Bundle exported.');
    } finally {
      this.busy(false);
    }
  }
  private async probes() {
    if (!this.baker) return;
    this.busy(true);
    this.status('Sampling a 3 × 2 × 3 light probe grid…');
    try {
      const probes = await this.baker.generateProbes({
        grid: { min: [-1, 0.5, -1], max: [1, 1.5, 1], spacing: 1 },
        samples: 128,
        onProgress: (p) => this.status(`Light probes ${p.completed}/${p.total}`),
      });
      downloadBytes(
        new TextEncoder().encode(new LightmapIO().encodeProbes(probes)),
        `${this.selected.id}-probes.json`,
        'application/json',
      );
      this.status('18 SH9 light probes exported.');
    } finally {
      this.busy(false);
    }
  }
  async dispose() {
    this.disposed = true;
    this.baker?.pause();
    await this.running;
    await this.baker?.dispose();
    this.preview?.dispose();
  }
}
