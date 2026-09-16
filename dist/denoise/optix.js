import { exportLightmap, importLightmap } from '../io/binary.js';
import { abortIfNeeded } from '../core/math.js';
/** Explicit opt-in to a loopback-only native service. Direct light is always taken unchanged from the caller when merging. */
export function createOptixDenoiser({ endpoint = 'http://127.0.0.1:8790/denoise', token, channels = ['indirect', 'ao'], }) {
    if (!Array.isArray(channels) || channels.some((c) => !['indirect', 'ao'].includes(c)))
        throw new TypeError('Denoise channels may contain only indirect and ao.');
    const url = new URL(endpoint);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        !['http:', 'https:'].includes(url.protocol))
        throw new Error('OptiX endpoints must be loopback URLs.');
    if (typeof token !== 'string' || token.length < 16)
        throw new Error('Supply the local service bearer token (at least 16 characters).');
    return {
        type: 'optix',
        async run(result, { signal } = {}) {
            abortIfNeeded(signal);
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    Authorization: `Bearer ${token}`,
                    'X-Lightmap-Channels': channels.join(','),
                },
                body: exportLightmap(result).buffer,
                signal,
            });
            if (!response.ok)
                throw new Error(`OptiX service failed: ${response.status} ${await response.text()}`);
            const output = importLightmap(await response.arrayBuffer());
            if (output.width !== result.width || output.height !== result.height)
                throw new Error('OptiX output dimensions do not match.');
            // Do not trust an external worker to preserve direct light or guides.
            const merged = {
                ...result,
                direct: result.direct.slice(),
                indirect: channels.includes('indirect') ? output.indirect : result.indirect.slice(),
                ao: channels.includes('ao') ? output.ao : result.ao.slice(),
                lightmap: new Float32Array(result.lightmap.length),
                metadata: {
                    ...result.metadata,
                    denoiser: { type: 'optix', mode: 'per-chart-hdr', channels: [...channels] },
                    aoAppliedToLightmap: false,
                },
            };
            for (let i = 0; i < merged.lightmap.length; i++)
                merged.lightmap[i] = merged.direct[i] + merged.indirect[i];
            return merged;
        },
    };
}
//# sourceMappingURL=optix.js.map