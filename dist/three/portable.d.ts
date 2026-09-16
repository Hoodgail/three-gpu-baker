import * as T from 'three/webgpu';
/** glTF PNG/JPEG material images are normalized sRGB, unlike the HDR TLMB sidecar. */
export declare function prepareExportModel(source: T.Object3D): Promise<{
    root: T.Object3D<T.Object3DEventMap>;
    dispose: () => void;
}>;
//# sourceMappingURL=portable.d.ts.map