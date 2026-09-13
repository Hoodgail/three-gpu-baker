import type { CoreScene, BakeOptions } from '../../src/types.js';
import { box, quad, cornellScene } from './geometry.js';

export interface BakingExample {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly options: BakeOptions;
  create(): CoreScene;
}

export class CornellBox implements BakingExample {
  readonly id = 'cornell';
  readonly title = 'Color in the shadows';
  readonly category = 'Diffuse bounce lighting';
  readonly description =
    'An emissive ceiling panel lights a quiet room. Watch red and green walls tint the indirect light.';
  readonly options = { width: 128, height: 128, samples: 32, bounces: 3 };
  create() {
    return cornellScene();
  }
}

export class ChromaticStudio implements BakingExample {
  readonly id = 'studio';
  readonly title = 'A study in color';
  readonly category = 'Point, spot & area lights';
  readonly description =
    'Warm and cool lights meet on matte geometry. Separate direct illumination from the bounced contribution.';
  readonly options = { width: 128, height: 128, samples: 32, bounces: 2 };
  create(): CoreScene {
    return {
      materials: [{ color: [0.65, 0.65, 0.65] }, { color: [0.85, 0.7, 0.42] }],
      environment: [0.015, 0.018, 0.024],
      lights: [
        { type: 'point', position: [-1.5, 2, 1], color: [1, 0.14, 0.035], intensity: 18 },
        {
          type: 'spot',
          position: [1.5, 2.6, 0.6],
          direction: [-0.3, -1, -0.3],
          color: [0.08, 0.45, 1],
          intensity: 25,
          angle: 0.8,
          penumbra: 0.65,
        },
        {
          type: 'rect',
          position: [0, 2.95, -0.7],
          u: [0.5, 0, 0],
          v: [0, 0, 0.5],
          color: [1, 0.9, 0.7],
          intensity: 2,
        },
      ],
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
        ...box([-0.75, 0.6, 0], [0.9, 1.2, 0.9], 0.25, 0, 'cube'),
        ...box([0.65, 0.95, -0.65], [0.75, 1.9, 0.75], -0.3, 1, 'column'),
      ],
    };
  }
}

export class TextureGallery implements BakingExample {
  readonly id = 'textures';
  readonly title = 'Surfaces that give back';
  readonly category = 'Albedo & emissive textures';
  readonly description =
    'A tiled albedo and a patterned emitter carry their colors into the surrounding light transport.';
  readonly options = { width: 128, height: 128, samples: 32, bounces: 3 };
  create(): CoreScene {
    const scene = cornellScene();
    const data = new Float32Array([
      0.72, 0.48, 0.12, 1, 0.18, 0.25, 0.34, 1, 0.18, 0.25, 0.34, 1, 0.72, 0.48, 0.12, 1,
    ]);
    scene.materials[0] = {
      color: [0.8, 0.8, 0.8],
      map: {
        width: 2,
        height: 2,
        data,
        transform: [4, 0, 0, 0, 4, 0],
        wrapS: 'repeat',
        wrapT: 'repeat',
      },
    };
    scene.materials[3] = {
      color: [1, 1, 1],
      emissive: [1, 1, 1],
      emissiveIntensity: 16,
      emissiveMap: {
        width: 2,
        height: 2,
        data: new Float32Array([
          1, 0.2, 0.04, 1, 0.12, 0.6, 1, 1, 0.12, 0.6, 1, 1, 1, 0.2, 0.04, 1,
        ]),
      },
    };
    return scene;
  }
}

export class SunlitCourtyard implements BakingExample {
  readonly id = 'courtyard';
  readonly title = 'Under an open sky';
  readonly category = 'Sunlight & separate AO';
  readonly description =
    'Directional sunlight, a constant sky, and layered architecture reveal contact shadows and broad indirect fill.';
  readonly options = { width: 128, height: 128, samples: 32, bounces: 2, aoDistance: 0.65 };
  create(): CoreScene {
    return {
      materials: [{ color: [0.72, 0.65, 0.48] }, { color: [0.3, 0.48, 0.36] }],
      environment: [0.16, 0.23, 0.35],
      lights: [
        {
          type: 'directional',
          direction: [-0.6, -1, -0.4],
          color: [1, 0.85, 0.65],
          intensity: Math.PI * 2,
        },
      ],
      triangles: [
        ...quad(
          [
            [-2, 0, -2],
            [-2, 0, 2],
            [2, 0, 2],
            [2, 0, -2],
          ],
          0,
          'ground',
        ),
        ...box([0, 0.45, -1.7], [4, 0.9, 0.35], 0, 0, 'wall'),
        ...box([-1.4, 1, -0.6], [0.4, 2, 0.4], 0, 0, 'pillar-a'),
        ...box([1.4, 1, -0.6], [0.4, 2, 0.4], 0, 0, 'pillar-b'),
        ...box([0, 2.1, -0.6], [3.3, 0.3, 0.5], 0, 0, 'lintel'),
        ...box([0, 0.3, 0.8], [1.4, 0.6, 0.7], 0, 1, 'bench'),
      ],
    };
  }
}
export const examples: BakingExample[] = [
  new CornellBox(),
  new ChromaticStudio(),
  new TextureGallery(),
  new SunlitCourtyard(),
];
