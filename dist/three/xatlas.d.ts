import type { BufferGeometry } from 'three';
import type { AtlasProvider } from '../types.js';
/** Structural interface compatible with a loaded xatlas-three UVUnwrapper (0.2.x).
 * The caller owns WASM loading and worker disposal. Use a dedicated unwrapper per bake.
 */
export interface XAtlasUnwrapper {
    packOptions: {
        resolution?: number;
        padding?: number;
        texelsPerUnit?: number;
    };
    chartOptions: {
        useInputMeshUvs?: boolean;
    };
    packAtlas(geometries: BufferGeometry[], outputUv?: 'uv' | 'uv2', inputUv?: 'uv' | 'uv2'): Promise<{
        atlasCount: number;
        width: number;
        height: number;
        geometries: BufferGeometry[];
    }>;
}
/** Pack all mesh instances together, retaining corner provenance through seam splits. */
export declare function createXAtlasProvider(unwrapper: XAtlasUnwrapper): AtlasProvider;
//# sourceMappingURL=xatlas.d.ts.map