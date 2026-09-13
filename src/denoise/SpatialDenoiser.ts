import type { BakeResult, Denoiser, SpatialDenoiseOptions } from '../types.js';
import { denoiseSpatial } from './atrous.js';

/** Chart-aware filtering of indirect light and AO, with unchanged direct light. */
export class SpatialDenoiser implements Denoiser {
  readonly type: 'atrous' | 'bilateral' | 'none';
  private readonly options: SpatialDenoiseOptions;
  constructor(options: SpatialDenoiseOptions = {}) {
    this.type = options.type ?? 'atrous';
    this.options = {
      ...options,
      type: this.type,
      channels: [...(options.channels ?? ['indirect', 'ao'])],
    };
  }
  run(result: BakeResult, { signal }: { signal?: AbortSignal } = {}): Promise<BakeResult> {
    return denoiseSpatial(result, { ...this.options, signal: signal ?? this.options.signal });
  }
}
