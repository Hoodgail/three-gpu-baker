import type * as Types from '../types.js';
import { sub, cross, dot, normalize, geometricNormal } from './math.js';

const emptyBounds = () => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
});
function extend(a: Types.Bounds, b: Types.Bounds) {
  for (let k = 0; k < 3; k++) {
    a.min[k] = Math.min(a.min[k], b.min[k]);
    a.max[k] = Math.max(a.max[k], b.max[k]);
  }
  return a;
}
function area(b: Types.Bounds) {
  const d = b.min.map((v, k) => Math.max(0, b.max[k] - v));
  return 2 * (d[0] * d[1] + d[1] * d[2] + d[2] * d[0]);
}
function triBounds(t: Types.Triangle) {
  const b = emptyBounds();
  for (const p of t.p)
    for (let k = 0; k < 3; k++) {
      b.min[k] = Math.min(b.min[k], p[k]);
      b.max[k] = Math.max(b.max[k], p[k]);
    }
  return b;
}

/** Binned SAH, flattened depth-first with escape links. No GPU traversal stack. */
export function buildBVH(
  triangles: Types.Triangle[],
  { leafSize = 4, bins = 12 }: { leafSize?: number; bins?: number } = {},
) {
  if (!Number.isInteger(bins) || bins < 2 || bins > 64) throw new RangeError('bins must be 2..64.');
  if (!triangles.length) throw new Error('Cannot build a BVH without triangles.');
  if (!Number.isInteger(leafSize) || leafSize < 1 || leafSize > 32)
    throw new RangeError('leafSize must be 1..32.');
  const records = triangles.map((t, id) => {
    const b = triBounds(t);
    return { t, id, b, c: b.min.map((v, k) => (v + b.max[k]) * 0.5) };
  });
  const nodes: Types.BVHNode[] = [],
    ordered: Types.Triangle[] = [],
    originalIndices: number[] = [];
  function recurse(
    items: { t: Types.Triangle; id: number; b: Types.Bounds; c: number[] }[],
    depth: number = 0,
  ) {
    const bounds = emptyBounds(),
      centroids = emptyBounds();
    for (const r of items) {
      extend(bounds, r.b);
      extend(centroids, { min: r.c, max: r.c });
    }
    const node = { ...bounds, first: 0, count: 0, escape: 0 };
    const index = nodes.push(node) - 1;
    if (items.length <= leafSize || depth >= 48) {
      node.first = ordered.length;
      node.count = items.length;
      for (const r of items) {
        ordered.push(r.t);
        originalIndices.push(r.id);
      }
    } else {
      let bestAxis = -1,
        bestSplit = -1,
        bestCost = Infinity;
      for (let axis = 0; axis < 3; axis++) {
        const extent = centroids.max[axis] - centroids.min[axis];
        if (extent < 1e-12) continue;
        const buckets = Array.from({ length: bins }, () => ({ b: emptyBounds(), n: 0 }));
        for (const r of items) {
          const j = Math.min(
            bins - 1,
            Math.floor(((r.c[axis] - centroids.min[axis]) / extent) * bins),
          );
          extend(buckets[j].b, r.b);
          buckets[j].n++;
        }
        for (let split = 0; split < bins - 1; split++) {
          const a = emptyBounds(),
            b = emptyBounds();
          let an = 0,
            bn = 0;
          for (let j = 0; j <= split; j++)
            if (buckets[j].n) {
              extend(a, buckets[j].b);
              an += buckets[j].n;
            }
          for (let j = split + 1; j < bins; j++)
            if (buckets[j].n) {
              extend(b, buckets[j].b);
              bn += buckets[j].n;
            }
          const cost = an * area(a) + bn * area(b);
          if (an && bn && cost < bestCost) {
            bestCost = cost;
            bestAxis = axis;
            bestSplit = split;
          }
        }
      }
      let left: typeof records = [],
        right: typeof records = [];
      if (bestAxis >= 0) {
        const edge =
          centroids.min[bestAxis] +
          ((centroids.max[bestAxis] - centroids.min[bestAxis]) * (bestSplit + 1)) / bins;
        for (const r of items) (r.c[bestAxis] < edge ? left : right).push(r);
      }
      if (!left.length || !right.length) {
        const axis = centroids.min
          .map((v, k) => centroids.max[k] - v)
          .reduce((a, _, k, d) => (d[k] > d[a] ? k : a), 0);
        items.sort((a, b) => a.c[axis] - b.c[axis] || a.id - b.id);
        const middle = Math.floor(items.length / 2);
        left = items.slice(0, middle);
        right = items.slice(middle);
      }
      recurse(left, depth + 1);
      recurse(right, depth + 1);
    }
    node.escape = nodes.length;
    return index;
  }
  recurse(records);
  return {
    nodes,
    triangles: ordered,
    originalIndices,
    bounds: { min: [...nodes[0].min], max: [...nodes[0].max] },
  };
}

export function intersectsBounds(
  origin: number[],
  direction: number[],
  node: Types.Bounds,
  maxT: number,
  minT: number = 0,
) {
  let near = minT,
    far = maxT;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(direction[k]) < 1e-20) {
      if (origin[k] < node.min[k] || origin[k] > node.max[k]) return false;
    } else {
      let a = (node.min[k] - origin[k]) / direction[k],
        b = (node.max[k] - origin[k]) / direction[k];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (far < near) return false;
    }
  }
  return true;
}

export function intersectTriangle(
  origin: number[],
  direction: number[],
  triangle: Types.Triangle,
  maxT: number = Infinity,
  minT: number = 1e-7,
) {
  const e1 = sub(triangle.p[1], triangle.p[0]),
    e2 = sub(triangle.p[2], triangle.p[0]);
  const p = cross(direction, e2),
    det = dot(e1, p);
  if (Math.abs(det) < 1e-10) return null;
  const inv = 1 / det,
    t = sub(origin, triangle.p[0]),
    u = dot(t, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross(t, e1),
    v = dot(direction, q) * inv;
  if (v < 0 || u + v > 1) return null;
  const distance = dot(e2, q) * inv;
  return distance > minT && distance < maxT ? { distance, bary: [1 - u - v, u, v] } : null;
}

export function trace(
  bvh: Types.BVHData,
  origin: number[],
  direction: number[],
  maxT: number = Infinity,
  skip: number = -1,
  minT: number = 1e-7,
  anyHit: boolean = false,
) {
  let closest = null,
    index = 0;
  while (index < bvh.nodes.length) {
    const node = bvh.nodes[index];
    if (!intersectsBounds(origin, direction, node, maxT, minT)) {
      index = node.escape;
      continue;
    }
    if (node.count) {
      for (let i = node.first, end = i + node.count; i < end; i++) {
        if (i === skip) continue;
        const h = intersectTriangle(origin, direction, bvh.triangles[i], maxT, minT);
        if (h) {
          closest = { ...h, index: i };
          if (anyHit) return closest;
          maxT = h.distance;
        }
      }
      index = node.escape;
    } else index++;
  }
  return closest;
}

export function surfaceAt(bvh: Types.BVHData, hit: Types.RayHit, rayDirection: number[]) {
  const t = bvh.triangles[hit.index],
    w = hit.bary;
  const p = [0, 1, 2].map((k) => t.p[0][k] * w[0] + t.p[1][k] * w[1] + t.p[2][k] * w[2]);
  let g = geometricNormal(t);
  let n = t.n
    ? normalize([0, 1, 2].map((k) => t.n![0][k] * w[0] + t.n![1][k] * w[1] + t.n![2][k] * w[2]))
    : g;
  if (dot(n, g) < 0) n = n.map((v) => -v);
  const backface = dot(g, rayDirection) > 0;
  if (backface) {
    g = g.map((v) => -v);
    n = n.map((v) => -v);
  }
  const uv = t.uv
    ? [0, 1].map((k) => t.uv![0][k] * w[0] + t.uv![1][k] * w[1] + t.uv![2][k] * w[2])
    : [0, 0];
  return { p, n, g, uv, material: t.material ?? 0, triangle: hit.index, backface };
}
