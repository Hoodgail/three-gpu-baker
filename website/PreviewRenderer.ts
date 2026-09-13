import * as T from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  applyLightmaps,
  type BakeResult,
  type LightmapBaker,
  type LightmapTextures,
} from '../src/index.js';

/** Offscreen rendering keeps compute and display on one device without a swapchain dependency. */
export class PreviewRenderer {
  readonly renderer = new T.WebGPURenderer({ antialias: false });
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(43, 4 / 3, 0.01, 100);
  private readonly target = new T.RenderTarget(768, 576);
  private readonly controls: OrbitControls;
  private model?: T.Group;
  private textures?: LightmapTextures;
  private drawing = false;
  private dirty = false;
  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.width = 768;
    canvas.height = 576;
    this.scene.background = new T.Color('#171a17');
    this.camera.position.set(0.65, 1.55, 6.1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 1.4, -0.35);
    this.controls.enableDamping = false;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 14;
    this.controls.update();
    this.controls.addEventListener('change', () => {
      void this.draw();
    });
    this.target.texture.colorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ReinhardToneMapping;
  }
  async init() {
    await this.renderer.init();
  }
  async update(baker: LightmapBaker, result: BakeResult) {
    if (!this.model) {
      this.model = await baker.createModel();
      this.textures = await applyLightmaps(this.model, result);
      this.scene.add(this.model);
    } else if (this.textures) {
      const texture = this.textures.lightmap;
      const data = texture.image.data as Float32Array;
      for (let i = 0; i < result.width * result.height; i++)
        for (let c = 0; c < 3; c++) data[i * 4 + c] = result.lightmap[i * 3 + c];
      texture.needsUpdate = true;
    }
    await this.draw();
  }
  async draw() {
    this.dirty = true;
    if (this.drawing || !this.model) return;
    this.drawing = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        this.renderer.setRenderTarget(this.target);
        await this.renderer.compileAsync(this.scene, this.camera);
        this.renderer.render(this.scene, this.camera);
        const pixels = await this.renderer.readRenderTargetPixelsAsync(this.target, 0, 0, 768, 576);
        this.canvas
          .getContext('2d')!
          .putImageData(new ImageData(new Uint8ClampedArray(pixels), 768, 576), 0, 0);
        this.renderer.setRenderTarget(null);
      }
    } finally {
      this.drawing = false;
    }
  }
  clear() {
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((object) => {
        if (object instanceof T.Mesh) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
        }
      });
    }
    for (const texture of Object.values(this.textures ?? {})) texture.dispose();
    this.model = undefined;
    this.textures = undefined;
  }
  dispose() {
    this.controls.dispose();
    this.clear();
    this.target.dispose();
    this.renderer.dispose();
  }
}
