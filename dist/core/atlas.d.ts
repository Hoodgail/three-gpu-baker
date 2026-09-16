import type * as Types from '../types.js';
/** Deterministic planar chart packing; never overwrites albedo UVs. */
export declare function generateAtlas(triangles: Types.Triangle[], width: number, height: number, { padding, uvMode, texelDensity, }?: Pick<Types.BakeOptions, 'padding' | 'uvMode' | 'texelDensity'>): {
    triangles: Types.AtlasTriangle[];
    chartCount: number;
    charts: {
        id: number;
        triangles: number[];
    }[];
    mode: "existing" | "preserve";
    padding: number;
    density?: undefined;
} | {
    triangles: Types.AtlasTriangle[];
    chartCount: number;
    charts: {
        id: number;
        rect: {
            x: number;
            y: number;
            w: number;
            h: number;
            rotate: boolean;
        };
        triangles: number[];
    }[];
    mode: "generate" | "repack";
    padding: number;
    density: number;
};
/** CPU UV rasterization supplies world-space guides and explicit chart ownership. */
export declare function rasterizeAtlas(triangles: Types.AtlasTriangle[], materials: Types.DiffuseMaterial[], width: number, height: number, { conservative, padding, diagnostics, }?: {
    conservative?: boolean;
    padding?: number;
    diagnostics?: Types.UVDiagnostic[];
}): {
    width: number;
    height: number;
    positions: Float32Array<ArrayBuffer>;
    normals: Float32Array<ArrayBuffer>;
    geometricNormals: Float32Array<ArrayBuffer>;
    albedo: Float32Array<ArrayBuffer>;
    coverage: Uint8Array<ArrayBuffer>;
    charts: Int32Array<ArrayBuffer>;
    triangleIds: Int32Array<ArrayBuffer>;
    covered: number;
    conservativeCharts: number;
};
/** Inspect a shared atlas without baking. Padding is advisory for compatibility. */
export declare function validateLightmapUVs(triangles: Types.Triangle[], width: number, height: number, padding?: number): Types.UVDiagnostic[];
/** Copy edge texels into gutters without changing the authoritative coverage mask. */
export declare function dilateChannels(result: Types.BakeResult, iterations?: number): {
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
};
//# sourceMappingURL=atlas.d.ts.map