interface ChartProjection {
  id: number;
  indices: number[];
  u: number[];
  v: number[];
  minX: number;
  minY: number;
  dx: number;
  dy: number;
}
import type * as Types from '../types.js';
import { sub, dot, cross, normalize, geometricNormal, mix3 } from './math.js';
import { evaluateMaterial } from './material.js';

const key3 = (p: number[]) => p.map((v) => Math.round(v * 1e6)).join(',');
const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const inside = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

function chartGroups(triangles: Types.Triangle[], existing: boolean = false) {
  const parent = triangles.map((_, i) => i),
    edges = new Map<string, number[]>();
  const find = (i: number) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const normals = triangles.map(geometricNormal);
  triangles.forEach((t, i) => {
    for (let e = 0; e < 3; e++) {
      const a = e,
        b = (e + 1) % 3;
      const ka =
          key3(t.p[a]) +
          (existing ? `/${t.lmUV![a].map((v) => Math.round(v * 1e7)).join(',')}` : ''),
        kb =
          key3(t.p[b]) +
          (existing ? `/${t.lmUV![b].map((v) => Math.round(v * 1e7)).join(',')}` : '');
      const key = `${t.owner ?? ''}:${t.material ?? 0}:${edgeKey(ka, kb)}`;
      const previous = edges.get(key) ?? [];
      for (const j of previous) {
        // Strictly planar charts avoid projection folds. Curved surfaces fall back to small charts.
        if (existing || dot(normals[find(j)], normals[find(i)]) > 0.999999)
          parent[find(i)] = find(j);
      }
      previous.push(i);
      edges.set(key, previous);
    }
  });
  const groups = new Map<number, number[]>();
  triangles.forEach((_, i) => {
    const id = find(i);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(i);
  });
  return [...groups.values()];
}

function pack(
  charts: ChartProjection[],
  width: number,
  height: number,
  padding: number,
  density: number,
) {
  const rectangles = charts.map((c) => ({
    id: c.id,
    w: Math.max(2, Math.ceil(c.dx * density)) + 2 * padding,
    h: Math.max(2, Math.ceil(c.dy * density)) + 2 * padding,
  }));
  rectangles.sort(
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.id - b.id,
  );
  // MaxRects free-space pruning becomes prohibitively expensive on imported
  // meshes with thousands of charts. Bounded shelves trade packing density for
  // predictable O(chartCount²) work and O(chartCount) memory on those assets.
  if (charts.length > 128) return packShelves(rectangles, width, height);
  let free = [{ x: 0, y: 0, w: width, h: height }];
  const placed = [];
  for (const rect of rectangles) {
    let choice = null;
    for (let i = 0; i < free.length; i++)
      for (let rotate = 0; rotate < 2; rotate++) {
        const w = rotate ? rect.h : rect.w,
          h = rotate ? rect.w : rect.h,
          f = free[i];
        if (w > f.w || h > f.h) continue;
        const score = Math.min(f.w - w, f.h - h) * 1e6 + Math.max(f.w - w, f.h - h);
        if (!choice || score < choice.score) choice = { i, w, h, score, rotate: !!rotate };
      }
    if (!choice) return null;
    const f = free[choice.i],
      used = { x: f.x, y: f.y, w: choice.w, h: choice.h };
    const next: Omit<Types.AtlasRectangle, 'rotate'>[] = [];
    // MaxRects splitting. Free rectangles may overlap; pruning keeps the list bounded.
    for (const r of free) {
      if (
        used.x >= r.x + r.w ||
        used.x + used.w <= r.x ||
        used.y >= r.y + r.h ||
        used.y + used.h <= r.y
      ) {
        next.push(r);
        continue;
      }
      if (used.x > r.x) next.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h });
      if (used.x + used.w < r.x + r.w)
        next.push({ x: used.x + used.w, y: r.y, w: r.x + r.w - used.x - used.w, h: r.h });
      if (used.y > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y });
      if (used.y + used.h < r.y + r.h)
        next.push({ x: r.x, y: used.y + used.h, w: r.w, h: r.y + r.h - used.y - used.h });
    }
    free = next.filter(
      (r, i) =>
        r.w > 0 &&
        r.h > 0 &&
        !next.some((s, j) => j !== i && inside(r, s) && (j < i || !inside(s, r))),
    );
    placed[rect.id] = { ...used, rotate: choice.rotate };
  }
  return placed;
}

function packShelves(
  rectangles: { id: number; w: number; h: number }[],
  width: number,
  height: number,
) {
  const shelves = [],
    placed = [];
  let bottom = 0;
  for (const rect of rectangles) {
    let best = null;
    for (let rotate = 0; rotate < 2; rotate++) {
      const w = rotate ? rect.h : rect.w,
        h = rotate ? rect.w : rect.h;
      if (w > width || h > height) continue;
      for (const shelf of shelves)
        if (h <= shelf.h && shelf.x + w <= width) {
          const score = (shelf.h - h) * width + width - shelf.x - w;
          if (!best || score < best.score) best = { shelf, w, h, rotate: !!rotate, score };
        }
    }
    if (!best) {
      const variants = [
        { w: rect.w, h: rect.h, rotate: false },
        { w: rect.h, h: rect.w, rotate: true },
      ]
        .filter((r) => r.w <= width && bottom + r.h <= height)
        .sort((a, b) => a.h - b.h);
      if (!variants.length) return null;
      const r = variants[0],
        shelf = { x: 0, y: bottom, h: r.h };
      bottom += r.h;
      shelves.push(shelf);
      best = { ...r, shelf };
    }
    placed[rect.id] = {
      x: best.shelf.x,
      y: best.shelf.y,
      w: best.w,
      h: best.h,
      rotate: best.rotate,
    };
    best.shelf.x += best.w;
  }
  return placed;
}

/** Deterministic planar chart packing; never overwrites albedo UVs. */
export function generateAtlas(
  triangles: Types.Triangle[],
  width: number,
  height: number,
  {
    padding = 2,
    uvMode = 'generate',
  }: { padding?: number; uvMode?: Types.BakeOptions['uvMode'] } = {},
) {
  const result = triangles.map((t) => ({ ...t }));
  if (uvMode === 'auto') uvMode = triangles.every((t) => t.lmUV) ? 'existing' : 'generate';
  if (uvMode === 'existing') {
    for (const t of triangles)
      if (
        !t.lmUV ||
        t.lmUV.some(
          (uv) => uv.length !== 2 || uv.some((v) => !Number.isFinite(v) || v < 0 || v > 1),
        )
      )
        throw new Error(
          'Existing lightmap UVs must be present and within [0,1] on every triangle.',
        );
    const groups = chartGroups(triangles, true);
    groups.forEach((g, id) => g.forEach((i) => (result[i].chart = id)));
    return {
      triangles: result as Types.AtlasTriangle[],
      chartCount: groups.length,
      charts: groups.map((g, id) => ({ id, triangles: g })),
      mode: uvMode,
      padding,
    };
  }
  if (uvMode !== 'generate') throw new Error(`Unsupported UV mode: ${uvMode}`);
  const groups = chartGroups(triangles);
  const charts = groups.map((indices, id) => {
    const seed = triangles[indices[0]],
      normal = geometricNormal(seed),
      u = normalize(sub(seed.p[1], seed.p[0])),
      v = cross(normal, u);
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const i of indices)
      for (const p of triangles[i].p) {
        const x = dot(p, u),
          y = dot(p, v);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    return {
      id,
      indices,
      u,
      v,
      minX,
      minY,
      dx: Math.max(1e-12, maxX - minX),
      dy: Math.max(1e-12, maxY - minY),
    };
  });
  if (!pack(charts, width, height, padding, 0))
    throw new Error(
      `${charts.length} UV charts do not fit ${width}×${height} with ${padding}px padding. Increase resolution or provide an xatlas-generated uv1 atlas.`,
    );
  let lo = 0,
    hi = Math.sqrt((width * height) / charts.reduce((s, c) => s + c.dx * c.dy, 0)) * 2;
  while (pack(charts, width, height, padding, hi)) hi *= 2;
  for (let k = 0; k < 25; k++) {
    const mid = (lo + hi) * 0.5;
    if (pack(charts, width, height, padding, mid)) lo = mid;
    else hi = mid;
  }
  const placed = pack(charts, width, height, padding, lo);
  if (!placed) throw new Error('Atlas packing failed.');
  for (const c of charts) {
    const r = placed[c.id],
      iw = r.w - 2 * padding,
      ih = r.h - 2 * padding;
    for (const i of c.indices) {
      result[i].chart = c.id;
      result[i].lmUV = triangles[i].p.map((p) => {
        const x = (dot(p, c.u) - c.minX) / c.dx,
          y = (dot(p, c.v) - c.minY) / c.dy;
        return [
          (r.x + padding + (r.rotate ? 1 - y : x) * iw) / width,
          (r.y + padding + (r.rotate ? x : y) * ih) / height,
        ];
      });
    }
  }
  return {
    triangles: result as Types.AtlasTriangle[],
    chartCount: charts.length,
    charts: charts.map((c) => ({ id: c.id, rect: placed![c.id], triangles: c.indices })),
    mode: uvMode,
    padding,
    density: lo,
  };
}

/** CPU UV rasterization supplies world-space guides and explicit chart ownership. */
export function rasterizeAtlas(
  triangles: Types.AtlasTriangle[],
  materials: Types.DiffuseMaterial[],
  width: number,
  height: number,
  { conservative = false }: { conservative?: boolean } = {},
) {
  const size = width * height;
  const positions = new Float32Array(size * 3),
    normals = new Float32Array(size * 3),
    geometricNormals = new Float32Array(size * 3),
    albedo = new Float32Array(size * 3);
  const coverage = new Uint8Array(size),
    charts = new Int32Array(size).fill(-1),
    triangleIds = new Int32Array(size).fill(-1),
    interior = new Float32Array(size);
  const chartCoverage = new Map();
  let covered = 0;
  triangles.forEach((t, triangle) => {
    const uv = t.lmUV.map((p) => [p[0] * width, p[1] * height]);
    const [a, b, c] = uv,
      den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-10) throw new Error(`Degenerate lightmap UV triangle ${triangle}.`);
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))),
      maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))),
      maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const g = geometricNormal(t);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5,
          py = y + 0.5,
          w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den,
          w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den,
          w2 = 1 - w0 - w1,
          edge = Math.min(w0, w1, w2);
        if (edge < -1e-6) continue;
        const index = y * width + x,
          w = [w0, w1, w2];
        if (coverage[index]) {
          if (charts[index] !== t.chart || (edge > 1e-5 && interior[index] > 1e-5))
            throw new Error(
              `Overlapping lightmap UVs at texel (${x}, ${y}). A single global non-overlapping uv1 atlas is required.`,
            );
          if (edge <= interior[index]) continue;
        } else covered++;
        coverage[index] = 1;
        charts[index] = t.chart;
        triangleIds[index] = triangle;
        interior[index] = edge;
        chartCoverage.set(t.chart, (chartCoverage.get(t.chart) ?? 0) + 1);
        positions.set(mix3(t.p[0], t.p[1], t.p[2], w), index * 3);
        geometricNormals.set(g, index * 3);
        let n = t.n ? normalize(mix3(t.n[0], t.n[1], t.n[2], w)) : g;
        if (dot(n, g) < 0) n = n.map((v) => -v);
        normals.set(n, index * 3);
        const tuv = t.uv
          ? [0, 1].map((k) => t.uv![0][k] * w0 + t.uv![1][k] * w1 + t.uv![2][k] * w2)
          : [0, 0];
        albedo.set(evaluateMaterial(materials[t.material ?? 0], tuv).albedo, index * 3);
      }
  });
  const missing = [...new Set(triangles.map((t) => t.chart))].filter((c) => !chartCoverage.has(c));
  let conservativeCharts = 0;
  if (conservative)
    for (let m = missing.length - 1; m >= 0; m--) {
      const chart = missing[m];
      for (let triangle = 0; triangle < triangles.length; triangle++) {
        const t = triangles[triangle];
        if (t.chart !== chart) continue;
        const x = Math.min(
            width - 1,
            Math.floor((t.lmUV.reduce((s, v) => s + v[0], 0) * width) / 3),
          ),
          y = Math.min(height - 1, Math.floor((t.lmUV.reduce((s, v) => s + v[1], 0) * height) / 3)),
          index = y * width + x;
        if (coverage[index]) continue;
        // A subpixel chart still contributes one valid surface sample. This is
        // enabled only for our non-overlapping packed charts, never user UVs.
        const w = [1 / 3, 1 / 3, 1 / 3],
          g = geometricNormal(t);
        let n = t.n ? normalize(mix3(t.n[0], t.n[1], t.n[2], w)) : g;
        if (dot(n, g) < 0) n = n.map((v) => -v);
        coverage[index] = 1;
        charts[index] = chart;
        triangleIds[index] = triangle;
        covered++;
        conservativeCharts++;
        positions.set(mix3(t.p[0], t.p[1], t.p[2], w), index * 3);
        normals.set(n, index * 3);
        geometricNormals.set(g, index * 3);
        const uv = t.uv ? [0, 1].map((k) => t.uv!.reduce((s, v) => s + v[k], 0) / 3) : [0, 0];
        albedo.set(evaluateMaterial(materials[t.material ?? 0], uv).albedo, index * 3);
        missing.splice(m, 1);
        break;
      }
    }
  if (missing.length)
    throw new Error(
      `${missing.length} UV charts have no covered texels. Increase atlas resolution.`,
    );
  if (!covered) throw new Error('The atlas has no covered texels.');
  return {
    width,
    height,
    positions,
    normals,
    geometricNormals,
    albedo,
    coverage,
    charts,
    triangleIds,
    covered,
    conservativeCharts,
  };
}

/** Copy edge texels into gutters without changing the authoritative coverage mask. */
export function dilateChannels(result: Types.BakeResult, iterations: number = 2) {
  const out = {
    ...result,
    direct: result.direct.slice(),
    indirect: result.indirect.slice(),
    ao: result.ao.slice(),
    lightmap: result.lightmap.slice(),
  };
  let owners = new Int32Array(result.coverage.length);
  for (let i = 0; i < owners.length; i++) owners[i] = result.coverage[i] ? i : -1;
  for (let step = 0; step < iterations; step++) {
    const next = owners.slice();
    for (let y = 0; y < result.height; y++)
      for (let x = 0; x < result.width; x++) {
        const i = y * result.width + x;
        if (owners[i] >= 0) continue;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= result.width || yy >= result.height) continue;
          const source = owners[yy * result.width + xx];
          if (source < 0) continue;
          next[i] = source;
          for (const key of ['direct', 'indirect', 'lightmap'] as const)
            for (let k = 0; k < 3; k++) out[key][i * 3 + k] = result[key][source * 3 + k];
          out.ao[i] = result.ao[source];
          break;
        }
      }
    owners = next;
  }
  return out;
}
