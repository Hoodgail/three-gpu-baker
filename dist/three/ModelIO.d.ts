import type { Object3D } from 'three';
import type { SceneAdapter } from '../types.js';
/** glTF/GLB and OBJ import, glTF/GLB export, and local dependent-file resolution. */
export declare class ModelIO {
    load(...args: Parameters<typeof import('./io.js').importModel>): Promise<import("three").Group<import("three").Object3DEventMap>>;
    loadFiles(...args: Parameters<typeof import('./io.js').importModelFiles>): Promise<import("three").Group<import("three").Object3DEventMap>>;
    export(...args: Parameters<typeof import('./io.js').exportModel>): Promise<ArrayBuffer | {
        [key: string]: unknown;
    }>;
}
export declare class ThreeSceneAdapter implements SceneAdapter<Object3D> {
    extract(...args: Parameters<typeof import('./scene.js').extractThreeScene>): Promise<import("../types.js").CoreScene>;
}
//# sourceMappingURL=ModelIO.d.ts.map