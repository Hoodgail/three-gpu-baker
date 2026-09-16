import type * as Types from '../types.js';
/** Standard ZIP32, STORE compression, UTF-8 names. No runtime compression dependency. */
export declare function createZip(entries: Types.ZipEntry[]): Uint8Array<ArrayBuffer>;
export declare function exportBakeBundle(result: Types.BakeResult, { model, probes, includePFM, }?: {
    model?: Types.BinaryInput;
    probes?: Types.ProbeData;
    includePFM?: boolean;
}): Uint8Array<ArrayBuffer>;
export declare function downloadBytes(bytes: Types.BinaryInput, name: string, type?: string): void;
//# sourceMappingURL=zip.d.ts.map