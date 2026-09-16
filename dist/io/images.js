import { crc32, concatBytes, utf8 } from './binary.js';
import { linearToSrgb, clamp } from '../core/math.js';
function be32(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n);
    return b;
}
function chunk(name, data) {
    const body = concatBytes([utf8(name), data]);
    return concatBytes([be32(data.length), body, be32(crc32(body))]);
}
function adler32(b) {
    let a = 1, c = 0;
    for (let i = 0; i < b.length; i++) {
        a = (a + b[i]) % 65521;
        c = (c + a) % 65521;
    }
    return ((c << 16) | a) >>> 0;
}
/** Dependency-free PNG encoding using valid zlib stored blocks (larger, lossless files). */
export function encodePNG(rgba, width, height) {
    if (!(rgba instanceof Uint8Array) ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        rgba.length !== width * height * 4)
        throw new Error('Invalid PNG pixels.');
    const scan = new Uint8Array(height * (width * 4 + 1));
    for (let y = 0; y < height; y++)
        scan.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
    const blocks = [new Uint8Array([0x78, 0x01])];
    for (let at = 0; at < scan.length; at += 65535) {
        const len = Math.min(65535, scan.length - at), h = new Uint8Array(5), v = new DataView(h.buffer);
        h[0] = at + len === scan.length ? 1 : 0;
        v.setUint16(1, len, true);
        v.setUint16(3, ~len & 65535, true);
        blocks.push(h, scan.subarray(at, at + len));
    }
    blocks.push(be32(adler32(scan)));
    const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer);
    v.setUint32(0, width);
    v.setUint32(4, height);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return concatBytes([
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', concatBytes(blocks)),
        chunk('IEND', new Uint8Array()),
    ]);
}
export function previewPixels(result, channel = 'lightmap', { exposure = 1, toneMap = 'reinhard', transparent = true } = {}) {
    if (!['lightmap', 'direct', 'indirect', 'ao', 'albedo', 'normals'].includes(channel))
        throw new Error('Unknown preview channel.');
    if (!Number.isFinite(exposure) || exposure <= 0 || !['reinhard', 'none'].includes(toneMap))
        throw new Error('Invalid preview settings.');
    const out = new Uint8Array(result.width * result.height * 4), source = result[channel];
    for (let y = 0; y < result.height; y++)
        for (let x = 0; x < result.width; x++) {
            const i = y * result.width + x, target = ((result.height - 1 - y) * result.width + x) * 4;
            for (let c = 0; c < 3; c++) {
                let value = source[i * (channel === 'ao' ? 1 : 3) + (channel === 'ao' ? 0 : c)];
                if (channel === 'normals')
                    value = value * 0.5 + 0.5;
                else if (channel !== 'ao') {
                    if (channel !== 'albedo') {
                        value *= exposure;
                        if (toneMap === 'reinhard')
                            value = value / (1 + Math.max(0, value));
                    }
                    value = linearToSrgb(Math.max(0, value));
                }
                out[target + c] = Math.round(clamp(value, 0, 1) * 255);
            }
            out[target + 3] = transparent && !result.coverage[i] ? 0 : 255;
        }
    return out;
}
export function exportPNG(result, channel, options = {}) {
    return encodePNG(previewPixels(result, channel, options), result.width, result.height);
}
//# sourceMappingURL=images.js.map