import { prepareCoreScene, validateScene } from './scene.js';
import { generateAtlas } from './atlas.js';
import { inspectUVs, triangleSource, UVValidationError } from './uv.js';
/** Compiles validated world-space geometry into an atlas, BVH and surface guides.
 * Override compile to integrate an external chart packer or a scene cache.
 */
export class SceneCompiler {
    compile(scene, options) {
        const mode = options.uvMode === 'auto'
            ? scene.triangles?.every((t) => t.lmUV)
                ? 'existing'
                : 'generate'
            : options.uvMode;
        if (options.atlasProvider && (mode === 'generate' || mode === 'repack'))
            return this.compileProvider(scene, options, mode);
        return prepareCoreScene(scene, options);
    }
    async compileProvider(scene, options, mode) {
        validateScene(scene);
        if (mode === 'repack') {
            const invalid = inspectUVs(scene.triangles, false);
            if (invalid.length)
                throw new UVValidationError(invalid);
        }
        const triangles = structuredClone(scene.triangles).map((t, i) => ({
            ...t,
            source: triangleSource(t, i),
        }));
        const uvs = await options.atlasProvider.generate(structuredClone(triangles), {
            ...options,
            uvMode: mode,
        });
        if (!Array.isArray(uvs) || uvs.length !== triangles.length)
            throw new Error('Atlas provider must return UVs for every input triangle.');
        const atlas = generateAtlas(triangles.map((t, i) => ({ ...t, lmUV: uvs[i] })), options.width, options.height, { ...options, uvMode: 'preserve' });
        atlas.mode = mode;
        return prepareCoreScene(scene, options, atlas);
    }
}
//# sourceMappingURL=SceneCompiler.js.map