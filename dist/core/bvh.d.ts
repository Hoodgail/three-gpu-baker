import type * as Types from '../types.js';
/** Binned SAH, flattened depth-first with escape links. No GPU traversal stack. */
export declare function buildBVH(triangles: Types.Triangle[], { leafSize, bins }?: {
    leafSize?: number;
    bins?: number;
}): {
    nodes: Types.BVHNode[];
    triangles: Types.Triangle[];
    originalIndices: number[];
    bounds: {
        min: number[];
        max: number[];
    };
};
export declare function intersectsBounds(origin: number[], direction: number[], node: Types.Bounds, maxT: number, minT?: number): boolean;
export declare function intersectTriangle(origin: number[], direction: number[], triangle: Types.Triangle, maxT?: number, minT?: number): {
    distance: number;
    bary: number[];
} | null;
export declare function trace(bvh: Types.BVHData, origin: number[], direction: number[], maxT?: number, skip?: number, minT?: number, anyHit?: boolean): {
    distance: number;
    bary: number[];
    index: number;
} | null;
export declare function surfaceAt(bvh: Types.BVHData, hit: Types.RayHit, rayDirection: number[]): {
    p: number[];
    n: number[];
    g: number[];
    uv: number[];
    material: number;
    triangle: number;
    backface: boolean;
};
//# sourceMappingURL=bvh.d.ts.map