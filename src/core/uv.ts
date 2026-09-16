import type { GeometrySource, Triangle, UVDiagnostic } from '../types.js';

export class UVValidationError extends Error {
  constructor(public readonly diagnostics: UVDiagnostic[]) {
    super(diagnostics.map((d) => d.message).join('\n'));
    this.name = 'UVValidationError';
  }
}

export function triangleSource(t: Triangle, index: number): GeometrySource {
  return (
    t.source ?? {
      mesh: t.owner ?? 'core',
      triangle: index,
      vertices: [0, 1, 2],
    }
  );
}

/** Structural diagnostics use normalized UV area, independent of atlas resolution. */
export function inspectUVs(triangles: Triangle[], checkRange = true): UVDiagnostic[] {
  const diagnostics: UVDiagnostic[] = [];
  triangles.forEach((t, i) => {
    const add = (code: UVDiagnostic['code'], message: string) =>
      diagnostics.push({
        code,
        severity: 'error',
        source: triangleSource(t, i),
        message: `Mesh ${t.source?.name || t.owner || 'core'}, triangle ${t.source?.triangle ?? i}: ${message}`,
      });
    const uv = t.lmUV;
    if (
      !Array.isArray(uv) ||
      uv.length !== 3 ||
      [0, 1, 2].some((k) => !Array.isArray(uv[k]) || uv[k].length !== 2)
    ) {
      add('missing', 'Lightmap UVs must be present on every triangle.');
      return;
    }
    if (uv.some((v) => !Number.isFinite(v[0]) || !Number.isFinite(v[1]))) {
      add('nonfinite', 'Nonfinite lightmap UVs.');
      return;
    }
    if (checkRange && uv.some((v) => v.some((n) => n < 0 || n > 1)))
      add('out-of-range', 'Lightmap UVs must be within [0,1].');
    const [a, b, c] = uv;
    if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) <= 1e-12)
      add('degenerate', 'Degenerate lightmap UV triangle.');
  });
  return diagnostics;
}
