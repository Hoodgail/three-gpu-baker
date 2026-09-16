import type * as Types from '../types.js';
/** Load GLTF/GLB/OBJ. External dependencies must resolve under baseURL or LoadingManager. */
export declare function importModel(input: string | Blob | Types.BinaryInput, { format, baseURL, manager, configureLoader }?: Types.ModelImportOptions): Promise<import("three").Group<import("three").Object3DEventMap>>;
/** GLTF does not standardize lightmaps; the authoritative bake travels in a TLMB sidecar. */
export declare function exportModel(root: import('three').Object3D, { binary, ...options }?: import('three/addons/exporters/GLTFExporter.js').GLTFExporterOptions): Promise<ArrayBuffer | {
    [key: string]: unknown;
}>;
/** Import a browser file selection, including relative glTF buffers and images. */
export declare function importModelFiles(files: Iterable<File>, { entry, configureLoader }?: Types.ModelFileOptions): Promise<import("three").Group<import("three").Object3DEventMap>>;
//# sourceMappingURL=io.d.ts.map