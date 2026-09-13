import { geometricNormal } from '../src/core/math.js';
export function quad(p, material = 0, owner = 'quad') {
  return [
    [0, 1, 2],
    [0, 2, 3],
  ].map((ids) => {
    const t = {
      p: ids.map((i) => p[i]),
      uv: ids.map(
        (i) =>
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ][i],
      ),
      material,
      owner,
    };
    t.n = [0, 1, 2].map(() => geometricNormal(t));
    return t;
  });
}
export function planeScene(extra = {}) {
  return {
    materials: [{ color: [0.7, 0.7, 0.7] }],
    triangles: quad([
      [-2, 0, -2],
      [-2, 0, 2],
      [2, 0, 2],
      [2, 0, -2],
    ]),
    lights: [],
    environment: [1, 0.5, 0.2],
    ...extra,
  };
}
export function box(center, size, angle = 0, material = 0, owner = 'box') {
  const [x, y, z] = center,
    [w, h, d] = size.map((v) => v / 2),
    c = Math.cos(angle),
    s = Math.sin(angle),
    p = (a, b, e) => [x + a * c + e * s, y + b, z - a * s + e * c];
  return [
    [
      [-w, -h, d],
      [w, -h, d],
      [w, h, d],
      [-w, h, d],
    ],
    [
      [w, -h, -d],
      [-w, -h, -d],
      [-w, h, -d],
      [w, h, -d],
    ],
    [
      [w, -h, d],
      [w, -h, -d],
      [w, h, -d],
      [w, h, d],
    ],
    [
      [-w, -h, -d],
      [-w, -h, d],
      [-w, h, d],
      [-w, h, -d],
    ],
    [
      [-w, h, d],
      [w, h, d],
      [w, h, -d],
      [-w, h, -d],
    ],
    [
      [-w, -h, -d],
      [w, -h, -d],
      [w, -h, d],
      [-w, -h, d],
    ],
  ].flatMap((f, i) =>
    quad(
      f.map((v) => p(...v)),
      material,
      owner + ':' + i,
    ),
  );
}
export function cornellScene() {
  return {
    materials: [
      { color: [0.73, 0.73, 0.73] },
      { color: [0.63, 0.055, 0.03] },
      { color: [0.04, 0.43, 0.35] },
      { color: [0.8, 0.8, 0.8], emissive: [1, 0.86, 0.66], emissiveIntensity: 10 },
      { color: [0.55, 0.59, 0.63] },
    ],
    environment: [0.012, 0.018, 0.028],
    lights: [],
    triangles: [
      ...quad(
        [
          [-2, 0, -2],
          [-2, 0, 2],
          [2, 0, 2],
          [2, 0, -2],
        ],
        0,
        'floor',
      ),
      ...quad(
        [
          [-2, 0, -2],
          [2, 0, -2],
          [2, 3, -2],
          [-2, 3, -2],
        ],
        0,
        'back',
      ),
      ...quad(
        [
          [-2, 0, 2],
          [-2, 0, -2],
          [-2, 3, -2],
          [-2, 3, 2],
        ],
        1,
        'left',
      ),
      ...quad(
        [
          [2, 0, -2],
          [2, 0, 2],
          [2, 3, 2],
          [2, 3, -2],
        ],
        2,
        'right',
      ),
      ...quad(
        [
          [-2, 3, 2],
          [-2, 3, -2],
          [2, 3, -2],
          [2, 3, 2],
        ],
        0,
        'ceiling',
      ),
      ...quad(
        [
          [-0.65, 2.985, -0.35],
          [0.65, 2.985, -0.35],
          [0.65, 2.985, 0.75],
          [-0.65, 2.985, 0.75],
        ],
        3,
        'emitter',
      ),
      ...box([-0.7, 0.49, 0.65], [1, 0.98, 1], -0.22, 0, 'short'),
      ...box([0.65, 0.93, -0.65], [1, 1.86, 1], 0.3, 4, 'tall'),
    ],
  };
}
