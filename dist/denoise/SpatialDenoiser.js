import { denoiseSpatial } from './atrous.js';
/** Chart-aware filtering of indirect light and AO, with unchanged direct light. */
export class SpatialDenoiser {
    type;
    options;
    constructor(options = {}) {
        this.type = options.type ?? 'atrous';
        this.options = {
            ...options,
            type: this.type,
            channels: [...(options.channels ?? ['indirect', 'ao'])],
        };
    }
    run(result, { signal } = {}) {
        return denoiseSpatial(result, { ...this.options, signal: signal ?? this.options.signal });
    }
}
//# sourceMappingURL=SpatialDenoiser.js.map