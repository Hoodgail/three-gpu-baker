import type * as Types from '../types.js';
import * as T from 'three/webgpu';
export declare const uvAttribute: (channel: Types.UVChannel) => string;
/** Snapshot texture pixels as linear RGB. Sampling transformations remain explicit. */
export declare function extractTexture(map?: T.Texture | null, sourceUVChannel?: Types.UVChannel): Promise<{
    width: number;
    height: number;
    data: Float32Array<ArrayBuffer>;
    transform: number[];
    wrapS: Types.WrapMode;
    wrapT: Types.WrapMode;
    flipY: boolean;
} | undefined>;
/** Flatten visible static meshes/instances into world-space diffuse transport data.
 * Source objects are never modified. Morph/skinned meshes must be frozen first.
 */
export declare function extractThreeScene(root: T.Object3D, { signal, sourceUVChannel, lightmapUVChannel, }?: {
    signal?: AbortSignal;
    sourceUVChannel?: Types.UVChannel;
    lightmapUVChannel?: Types.UVChannel;
}): Promise<Types.CoreScene>;
/** A detached static model with the generated global uv1 atlas. */
export declare function createThreeModel(prepared: Types.PreparedScene): T.Group<T.Object3DEventMap>;
export declare function createLightmapTextures(result: Types.BakeResult): {
    lightmap: T.DataTexture;
    direct: T.DataTexture;
    indirect: T.DataTexture;
    ao: T.DataTexture;
};
/** Fully baked diffuse display: albedo * (E/π) + emission. Does not double-light or multiply AO. */
export declare function applyLightmaps(root: T.Object3D, result: Types.BakeResult, { textures }?: {
    textures?: {
        lightmap: T.DataTexture;
        direct: T.DataTexture;
        indirect: T.DataTexture;
        ao: T.DataTexture;
    } | undefined;
}): {
    lightmap: T.DataTexture;
    direct: T.DataTexture;
    indirect: T.DataTexture;
    ao: T.DataTexture;
};
export declare function createThreeLightProbe(probe: Types.Probe): T.LightProbe;
export interface SurfaceMaterial extends T.Material {
    color?: T.Color;
    emissive?: T.Color;
    emissiveIntensity?: number;
    metalness?: number;
    transmission?: number;
    map?: T.Texture | null;
    emissiveMap?: T.Texture | null;
    alphaMap?: T.Texture | null;
    normalMap?: T.Texture | null;
    bumpMap?: T.Texture | null;
    displacementMap?: T.Texture | null;
    isShaderMaterial?: boolean;
    isNodeMaterial?: boolean;
}
//# sourceMappingURL=scene.d.ts.map