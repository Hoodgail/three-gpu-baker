import type { CoreScene, PreparedScene, ResolvedBakeOptions } from '../types.js';
import { prepareCoreScene } from './scene.js';

/** Compiles validated world-space geometry into an atlas, BVH and surface guides.
 * Override compile to integrate an external chart packer or a scene cache.
 */
export class SceneCompiler {
  compile(scene: CoreScene, options: ResolvedBakeOptions): PreparedScene {
    return prepareCoreScene(scene, options);
  }
}
