import type * as Types from '../types.js';
export declare const SCENE_LAYOUT: Readonly<{
    header: 8;
    triangle: 8;
    node: 3;
    material: 8;
    light: 6;
    atlas: 3;
    result: 3;
}>;
/** All read-only scene data shares one vec4 storage binding (portable binding count). */
export declare function packScene(scene: Types.PreparedScene): {
    scene: Float32Array<ArrayBuffer>;
    atlas: Float32Array<ArrayBuffer>;
    result: Float32Array<ArrayBuffer>;
    offsets: {
        triOffset: 8;
        nodeOffset: number;
        materialOffset: number;
        lightOffset: number;
        textureOffset: number;
    };
};
export declare function checkStorageLimits(device: GPUDevice, packed: ReturnType<typeof packScene>): void;
//# sourceMappingURL=pack.d.ts.map