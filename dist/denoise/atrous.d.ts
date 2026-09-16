import type * as Types from '../types.js';
/** Chart-masked, normal/position/color-guided à-trous. Direct light is copied byte-for-byte. */
export declare function denoiseSpatial(result: Types.BakeResult, options?: Types.SpatialDenoiseOptions): Promise<{
    width: number;
    height: number;
    samples: number;
    positions: Float32Array;
    normals: Float32Array;
    geometricNormals: Float32Array;
    albedo: Float32Array;
    coverage: Uint8Array;
    charts: Int32Array;
    sampleCounts: Uint32Array;
    metadata: Types.BakeMetadata;
    direct: Float32Array<ArrayBuffer>;
    indirect: Float32Array<ArrayBuffer>;
    ao: Float32Array<ArrayBuffer>;
    lightmap: Float32Array<ArrayBuffer>;
}>;
//# sourceMappingURL=atrous.d.ts.map