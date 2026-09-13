import type { Object3D } from 'three';
import type { SceneAdapter } from '../types.js';

/** glTF/GLB and OBJ import, glTF/GLB export, and local dependent-file resolution. */
export class ModelIO {
  async load(...args: Parameters<typeof import('./io.js').importModel>) {
    return (await import('./io.js')).importModel(...args);
  }
  async loadFiles(...args: Parameters<typeof import('./io.js').importModelFiles>) {
    return (await import('./io.js')).importModelFiles(...args);
  }
  async export(...args: Parameters<typeof import('./io.js').exportModel>) {
    return (await import('./io.js')).exportModel(...args);
  }
}

export class ThreeSceneAdapter implements SceneAdapter<Object3D> {
  async extract(...args: Parameters<typeof import('./scene.js').extractThreeScene>) {
    return (await import('./scene.js')).extractThreeScene(...args);
  }
}
