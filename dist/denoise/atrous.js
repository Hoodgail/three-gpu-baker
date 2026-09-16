import { clamp, abortIfNeeded, yieldToHost } from '../core/math.js';
function validate(options) {
    const o = {
        channels: ['indirect', 'ao'],
        type: 'atrous',
        iterations: 2,
        normalPower: 32,
        positionSigma: 0.25,
        colorSigma: 1,
        ...options,
    };
    if (!['none', 'atrous', 'bilateral'].includes(o.type))
        throw new Error(`Unknown spatial denoiser ${o.type}.`);
    if (!Number.isInteger(o.iterations) || o.iterations < 1 || o.iterations > 8)
        throw new RangeError('Denoiser iterations must be 1..8.');
    for (const k of ['normalPower', 'positionSigma', 'colorSigma'])
        if (!Number.isFinite(o[k]) || o[k] <= 0)
            throw new RangeError(`${k} must be positive.`);
    if (!Array.isArray(o.channels) || o.channels.some((c) => !['indirect', 'ao'].includes(c)))
        throw new TypeError('Denoise channels may contain only indirect and ao.');
    return o;
}
/** Chart-masked, normal/position/color-guided à-trous. Direct light is copied byte-for-byte. */
export async function denoiseSpatial(result, options = {}) {
    const o = validate(options), n = result.width * result.height;
    const out = {
        ...result,
        direct: result.direct.slice(),
        indirect: result.indirect.slice(),
        ao: result.ao.slice(),
        lightmap: new Float32Array(n * 3),
    };
    if (o.type !== 'none') {
        const kernel = [1, 4, 6, 4, 1];
        for (let iteration = 0; iteration < (o.type === 'bilateral' ? 1 : o.iterations); iteration++) {
            abortIfNeeded(o.signal);
            const step = o.type === 'atrous' ? 2 ** iteration : 1, source = out.indirect, sourceAO = out.ao, target = source.slice(), targetAO = sourceAO.slice();
            for (let y = 0; y < result.height; y++) {
                if (y % 16 === 0) {
                    abortIfNeeded(o.signal);
                    await yieldToHost();
                }
                for (let x = 0; x < result.width; x++) {
                    const i = y * result.width + x;
                    if (!result.coverage[i])
                        continue;
                    let weightSum = 0, aoWeightSum = 0, aoSum = 0;
                    const sum = [0, 0, 0];
                    for (let ky = -2; ky <= 2; ky++)
                        for (let kx = -2; kx <= 2; kx++) {
                            const xx = x + kx * step, yy = y + ky * step;
                            if (xx < 0 || yy < 0 || xx >= result.width || yy >= result.height)
                                continue;
                            const j = yy * result.width + xx;
                            if (!result.coverage[j] || result.charts[j] !== result.charts[i])
                                continue;
                            let nd = 0, pd = 0, cd = 0;
                            for (let c = 0; c < 3; c++) {
                                nd += result.normals[i * 3 + c] * result.normals[j * 3 + c];
                                pd += (result.positions[i * 3 + c] - result.positions[j * 3 + c]) ** 2;
                                cd += (source[i * 3 + c] - source[j * 3 + c]) ** 2;
                            }
                            const geometryWeight = kernel[kx + 2] *
                                kernel[ky + 2] *
                                Math.max(0, nd) ** o.normalPower *
                                Math.exp(-pd / (2 * (o.positionSigma * step) ** 2));
                            const w = geometryWeight * Math.exp(-cd / (2 * o.colorSigma ** 2));
                            const aw = geometryWeight *
                                Math.exp(-((sourceAO[i] - sourceAO[j]) ** 2) / (2 * o.colorSigma ** 2));
                            weightSum += w;
                            aoWeightSum += aw;
                            aoSum += aw * sourceAO[j];
                            for (let c = 0; c < 3; c++)
                                sum[c] += w * source[j * 3 + c];
                        }
                    if (o.channels.includes('indirect') && weightSum > 1e-20)
                        for (let c = 0; c < 3; c++)
                            target[i * 3 + c] = sum[c] / weightSum;
                    if (o.channels.includes('ao') && aoWeightSum > 1e-20)
                        targetAO[i] = clamp(aoSum / aoWeightSum, 0, 1);
                }
            }
            out.indirect = target;
            out.ao = targetAO;
        }
    }
    for (let i = 0; i < n * 3; i++)
        out.lightmap[i] = out.direct[i] + out.indirect[i];
    out.metadata = {
        ...out.metadata,
        denoiser: {
            type: o.type,
            channels: [...o.channels],
            iterations: o.type === 'none' ? 0 : o.type === 'bilateral' ? 1 : o.iterations,
        },
        aoAppliedToLightmap: false,
    };
    return out;
}
//# sourceMappingURL=atrous.js.map