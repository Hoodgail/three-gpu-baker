import type { GeometrySource, Triangle, UVDiagnostic } from '../types.js';
export declare class UVValidationError extends Error {
    readonly diagnostics: UVDiagnostic[];
    constructor(diagnostics: UVDiagnostic[]);
}
export declare function triangleSource(t: Triangle, index: number): GeometrySource;
/** Structural diagnostics use normalized UV area, independent of atlas resolution. */
export declare function inspectUVs(triangles: Triangle[], checkRange?: boolean): UVDiagnostic[];
//# sourceMappingURL=uv.d.ts.map