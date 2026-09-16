import type * as Types from '../types.js';
export declare function crc32(bytes: Uint8Array): number;
export declare const bytesOf: (input: Types.BinaryInput) => Uint8Array<ArrayBufferLike>;
export declare function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer>;
export declare const utf8: (text: string) => Uint8Array<ArrayBuffer>;
/** Lossless portable TLMB v1: JSON metadata + little-endian channels + two CRC32 checksums. */
export declare function exportLightmap(result: Types.BakeResult): Uint8Array<ArrayBuffer>;
export declare function importLightmap(input: Types.BinaryInput, { maxBytes }?: {
    maxBytes?: number;
}): Types.BakeResult;
/** PFM stores bottom-to-top float data; this matches the bake's v=0 first convention. */
export declare function encodePFM(data: Float32Array, width: number, height: number, { channels }?: {
    channels?: 1 | 3;
}): Uint8Array<ArrayBuffer>;
export declare function decodePFM(input: Types.BinaryInput): {
    width: number;
    height: number;
    channels: number;
    data: Float32Array<ArrayBuffer>;
};
//# sourceMappingURL=binary.d.ts.map