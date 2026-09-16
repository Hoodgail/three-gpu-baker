import type { CoreScene, PreparedScene, ResolvedBakeOptions } from '../types.js';
/** Compiles validated world-space geometry into an atlas, BVH and surface guides.
 * Override compile to integrate an external chart packer or a scene cache.
 */
export declare class SceneCompiler {
    compile(scene: CoreScene, options: ResolvedBakeOptions): PreparedScene | Promise<PreparedScene>;
    private compileProvider;
}
//# sourceMappingURL=SceneCompiler.d.ts.map