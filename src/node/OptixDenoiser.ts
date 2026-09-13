import type * as Types from '../types.js';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { encodePFM, decodePFM } from '../io/binary.js';

export function chartCrops(result: Types.BakeResult, { margin = 32 }: { margin?: number } = {}) {
  if (!Number.isInteger(margin) || margin < 0 || margin > 256)
    throw new RangeError('margin must be an integer from 0 to 256.');
  const { width, charts, coverage } = result,
    bounds = new Map<number, Omit<ChartCrop, 'width' | 'height' | 'margin'>>();
  for (let i = 0; i < coverage.length; i++)
    if (coverage[i]) {
      const id = charts[i],
        x = i % width,
        y = Math.floor(i / width),
        b = bounds.get(id) ?? { id, minX: x, maxX: x, minY: y, maxY: y };
      b.minX = Math.min(b.minX, x);
      b.maxX = Math.max(b.maxX, x);
      b.minY = Math.min(b.minY, y);
      b.maxY = Math.max(b.maxY, y);
      bounds.set(id, b);
    }
  return [...bounds.values()].map((b) => ({
    ...b,
    width: Math.max(8, b.maxX - b.minX + 1) + 2 * margin,
    height: Math.max(8, b.maxY - b.minY + 1) + 2 * margin,
    margin,
  }));
}
/** Multi-source nearest-neighbor fill removes the black UV background and isolates every chart. */
export function fillChart(result: Types.BakeResult, crop: ChartCrop) {
  const n = crop.width * crop.height,
    source = new Int32Array(n).fill(-1),
    queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  for (let y = crop.minY; y <= crop.maxY; y++)
    for (let x = crop.minX; x <= crop.maxX; x++) {
      const global = y * result.width + x;
      if (result.coverage[global] && result.charts[global] === crop.id) {
        const local = (y - crop.minY + crop.margin) * crop.width + x - crop.minX + crop.margin;
        source[local] = global;
        queue[tail++] = local;
      }
    }
  while (head < tail) {
    const i = queue[head++],
      x = i % crop.width,
      y = Math.floor(i / crop.width);
    for (const j of [
      x > 0 ? i - 1 : -1,
      x + 1 < crop.width ? i + 1 : -1,
      y > 0 ? i - crop.width : -1,
      y + 1 < crop.height ? i + crop.width : -1,
    ])
      if (j >= 0 && source[j] < 0) {
        source[j] = source[i];
        queue[tail++] = j;
      }
  }
  const indirect = new Float32Array(n * 3),
    ao = new Float32Array(n * 3),
    normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = source[i];
    if (j < 0) throw new Error('Empty chart crop.');
    for (let c = 0; c < 3; c++) {
      indirect[i * 3 + c] = result.indirect[j * 3 + c];
      normal[i * 3 + c] = result.normals[j * 3 + c];
      ao[i * 3 + c] = result.ao[j];
    }
  }
  return { indirect, ao, normal };
}
function execute(executable: string, args: string[], { signal }: { signal?: AbortSignal } = {}) {
  return new Promise<void>((resolve, reject) => {
    let stderr = '';
    const child = spawn(executable, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false,
      signal,
    });
    child.stderr.on('data', (b) => {
      stderr = (stderr + b).slice(-16000);
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`OptiX worker exited ${code}: ${stderr}`)),
    );
  });
}
export async function denoiseOffline(
  result: Types.BakeResult,
  {
    executable = process.env.OPTIX_DENOISER_BIN,
    signal,
    onProgress,
    margin = 32,
    channels = ['indirect', 'ao'],
  }: OfflineDenoiseOptions = {},
) {
  if (!Array.isArray(channels) || channels.some((c) => !['indirect', 'ao'].includes(c)))
    throw new TypeError('Denoise channels may contain only indirect and ao.');
  if (!executable)
    throw new Error(
      'Set OPTIX_DENOISER_BIN to the compiled native/optix/lightmap-optix executable.',
    );
  executable = resolve(executable);
  await access(executable);
  const crops = chartCrops(result, { margin }),
    out = {
      ...result,
      direct: result.direct.slice(),
      indirect: result.indirect.slice(),
      ao: result.ao.slice(),
      lightmap: new Float32Array(result.lightmap.length),
    },
    dir = await mkdtemp(join(tmpdir(), 'tlmb-optix-'));
  try {
    for (let index = 0; index < crops.length; index++) {
      signal?.throwIfAborted();
      const crop = crops[index],
        images = fillChart(result, crop),
        paths = {} as Record<'indirect' | 'ao' | 'normal', string>;
      for (const key of ['indirect', 'ao', 'normal'] as const) {
        paths[key] = join(dir, `${key}.pfm`);
        await writeFile(paths[key], encodePFM(images[key], crop.width, crop.height));
      }
      for (const key of new Set(channels)) {
        const output = join(dir, `${key}-out.pfm`);
        await rm(output, { force: true });
        await execute(executable, [paths[key], paths.normal, output], { signal });
        const filtered = decodePFM(await readFile(output));
        if (
          filtered.width !== crop.width ||
          filtered.height !== crop.height ||
          filtered.channels !== 3
        )
          throw new Error('Native denoiser returned invalid dimensions.');
        for (let y = crop.minY; y <= crop.maxY; y++)
          for (let x = crop.minX; x <= crop.maxX; x++) {
            const i = y * result.width + x;
            if (!result.coverage[i] || result.charts[i] !== crop.id) continue;
            const j = (y - crop.minY + crop.margin) * crop.width + x - crop.minX + crop.margin;
            if (key === 'ao')
              out.ao[i] = Math.max(
                0,
                Math.min(
                  1,
                  (filtered.data[j * 3] + filtered.data[j * 3 + 1] + filtered.data[j * 3 + 2]) / 3,
                ),
              );
            else
              for (let c = 0; c < 3; c++)
                out.indirect[i * 3 + c] = Math.max(0, filtered.data[j * 3 + c]);
          }
      }
      await onProgress?.({ completed: index + 1, total: crops.length });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  for (let i = 0; i < out.lightmap.length; i++) out.lightmap[i] = out.direct[i] + out.indirect[i];
  out.metadata = {
    ...result.metadata,
    denoiser: {
      type: 'optix',
      mode: 'per-chart-hdr',
      channels: [...channels],
      guideAlbedo: false,
      guideNormal: true,
    },
    aoAppliedToLightmap: false,
  };
  return out;
}
export interface ChartCrop {
  id: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  margin: number;
}
export interface OfflineDenoiseOptions {
  executable?: string;
  signal?: AbortSignal;
  onProgress?: (progress: { completed: number; total: number }) => void | Promise<void>;
  margin?: number;
  channels?: Types.DenoiseChannel[];
}

/** Offline native OptiX worker, isolated from browser bundles. */
export class OptixDenoiser implements Types.Denoiser {
  readonly type = 'optix';
  constructor(private readonly options: OfflineDenoiseOptions = {}) {}
  run(result: Types.BakeResult, { signal }: { signal?: AbortSignal } = {}) {
    return denoiseOffline(result, { ...this.options, signal: signal ?? this.options.signal });
  }
}
