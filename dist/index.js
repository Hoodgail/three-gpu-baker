export { LightmapBaker } from './LightmapBaker.js';
export { UVValidationError, inspectUVs } from './core/uv.js';
export { validateLightmapUVs } from './core/atlas.js';
export { createXAtlasProvider } from './three/xatlas.js';
export { denoiseSpatial } from './denoise/atrous.js';
export * from './core/probes.js';
export * from './io/index.js';
// Three-specific adapters are lazy: Node/CPU callers do not need a DOM or a GPU.
export async function importModel(...args) {
    return (await import('./three/io.js')).importModel(...args);
}
export async function exportModel(...args) {
    return (await import('./three/io.js')).exportModel(...args);
}
export async function applyLightmaps(...args) {
    return (await import('./three/scene.js')).applyLightmaps(...args);
}
export async function createLightmapTextures(...args) {
    return (await import('./three/scene.js')).createLightmapTextures(...args);
}
export async function createThreeLightProbe(...args) {
    return (await import('./three/scene.js')).createThreeLightProbe(...args);
}
export { createOptixDenoiser } from './denoise/optix.js';
export async function importModelFiles(...args) {
    return (await import('./three/io.js')).importModelFiles(...args);
}
export { SceneCompiler } from './core/SceneCompiler.js';
export { LightProbeGenerator } from './core/LightProbeGenerator.js';
export { SpatialDenoiser } from './denoise/SpatialDenoiser.js';
export { LightmapIO } from './io/LightmapIO.js';
export { ModelIO, ThreeSceneAdapter } from './three/ModelIO.js';
//# sourceMappingURL=index.js.map