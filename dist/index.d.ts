export { LightmapBaker } from './LightmapBaker.js';
export { UVValidationError, inspectUVs } from './core/uv.js';
export { validateLightmapUVs } from './core/atlas.js';
export { createXAtlasProvider } from './three/xatlas.js';
export type { XAtlasUnwrapper } from './three/xatlas.js';
export { denoiseSpatial } from './denoise/atrous.js';
export * from './core/probes.js';
export * from './io/index.js';
export declare function importModel(...args: Parameters<typeof import('./three/io.js').importModel>): Promise<import("three").Group<import("three").Object3DEventMap>>;
export declare function exportModel(...args: Parameters<typeof import('./three/io.js').exportModel>): Promise<ArrayBuffer | {
    [key: string]: unknown;
}>;
export declare function applyLightmaps(...args: Parameters<typeof import('./three/scene.js').applyLightmaps>): Promise<{
    lightmap: import("three").DataTexture;
    direct: import("three").DataTexture;
    indirect: import("three").DataTexture;
    ao: import("three").DataTexture;
}>;
export declare function createLightmapTextures(...args: Parameters<typeof import('./three/scene.js').createLightmapTextures>): Promise<{
    lightmap: import("three").DataTexture;
    direct: import("three").DataTexture;
    indirect: import("three").DataTexture;
    ao: import("three").DataTexture;
}>;
export declare function createThreeLightProbe(...args: Parameters<typeof import('./three/scene.js').createThreeLightProbe>): Promise<import("three").LightProbe>;
export { createOptixDenoiser } from './denoise/optix.js';
export declare function importModelFiles(...args: Parameters<typeof import('./three/io.js').importModelFiles>): Promise<import("three").Group<import("three").Object3DEventMap>>;
export type * from './types.js';
export { SceneCompiler } from './core/SceneCompiler.js';
export { LightProbeGenerator } from './core/LightProbeGenerator.js';
export { SpatialDenoiser } from './denoise/SpatialDenoiser.js';
export { LightmapIO } from './io/LightmapIO.js';
export { ModelIO, ThreeSceneAdapter } from './three/ModelIO.js';
//# sourceMappingURL=index.d.ts.map