import type * as Types from '../types.js';
/** Dependency-free PNG encoding using valid zlib stored blocks (larger, lossless files). */
export declare function encodePNG(rgba: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer>;
export declare function previewPixels(result: Types.BakeResult, channel?: Types.PreviewChannel, { exposure, toneMap, transparent }?: Types.PreviewOptions): Uint8Array<ArrayBuffer>;
export declare function exportPNG(result: Types.BakeResult, channel: Types.PreviewChannel, options?: Types.PreviewOptions): Uint8Array<ArrayBuffer>;
//# sourceMappingURL=images.d.ts.map