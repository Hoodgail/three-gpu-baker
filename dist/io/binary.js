const TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
    for (let k = 0; k < 8; k++)
        i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
    return i >>> 0;
});
export function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes)
        c = TABLE[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
export const bytesOf = (input) => input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
            : (() => {
                throw new TypeError('Expected binary data.');
            })();
export function concatBytes(parts) {
    const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}
export const utf8 = (text) => new TextEncoder().encode(text);
const channelSpec = {
    direct: ['f32', 3],
    indirect: ['f32', 3],
    ao: ['f32', 1],
    lightmap: ['f32', 3],
    positions: ['f32', 3],
    normals: ['f32', 3],
    geometricNormals: ['f32', 3],
    albedo: ['f32', 3],
    coverage: ['u8', 1],
    charts: ['i32', 1],
    sampleCounts: ['u32', 1],
};
const channelEntries = Object.entries(channelSpec);
const constructors = { f32: Float32Array, i32: Int32Array, u32: Uint32Array, u8: Uint8Array };
function dimensions(width, height) {
    if (!Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        width > 8192 ||
        height > 8192)
        throw new Error('Invalid lightmap dimensions.');
    return width * height;
}
/** Lossless portable TLMB v1: JSON metadata + little-endian channels + two CRC32 checksums. */
export function exportLightmap(result) {
    const n = dimensions(result.width, result.height), channels = {}, payload = [];
    let offset = 0;
    for (const [key, [type, size]] of channelEntries) {
        const array = result[key];
        if (!(array instanceof constructors[type]) || array.length !== n * size)
            throw new Error(`Invalid channel ${key}.`);
        if (type === 'f32' && !array.every(Number.isFinite))
            throw new Error(`Nonfinite channel ${key}.`);
        const padding = (4 - (offset % 4)) % 4;
        if (padding) {
            payload.push(new Uint8Array(padding));
            offset += padding;
        }
        const bytes = new Uint8Array(array.length * array.BYTES_PER_ELEMENT), view = new DataView(bytes.buffer);
        for (let i = 0; i < array.length; i++) {
            if (type === 'f32')
                view.setFloat32(i * 4, array[i], true);
            else if (type === 'i32')
                view.setInt32(i * 4, array[i], true);
            else if (type === 'u32')
                view.setUint32(i * 4, array[i], true);
            else
                bytes[i] = array[i];
        }
        channels[key] = { type, size, offset, length: array.length };
        payload.push(bytes);
        offset += bytes.length;
    }
    const description = utf8(JSON.stringify({
        schema: 'TLMB',
        version: 1,
        width: result.width,
        height: result.height,
        samples: result.samples,
        metadata: result.metadata,
        channels,
    })), data = concatBytes(payload);
    const start = 24 + description.length + ((4 - (description.length % 4)) % 4), total = start + data.length;
    if (total > 0xffffffff)
        throw new Error('TLMB exceeds 4 GiB.');
    const out = new Uint8Array(total), view = new DataView(out.buffer);
    out.set(utf8('TLMB'));
    view.setUint32(4, 1, true);
    view.setUint32(8, description.length, true);
    view.setUint32(12, data.length, true);
    view.setUint32(16, crc32(data), true);
    view.setUint32(20, crc32(description), true);
    out.set(description, 24);
    out.set(data, start);
    return out;
}
export function importLightmap(input, { maxBytes = 512 * 1024 * 1024 } = {}) {
    const bytes = bytesOf(input);
    if (bytes.length < 24 || bytes.length > maxBytes)
        throw new Error('Truncated or oversized TLMB file.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'TLMB' || view.getUint32(4, true) !== 1)
        throw new Error('Unsupported TLMB magic/version.');
    const jsonLength = view.getUint32(8, true), dataLength = view.getUint32(12, true), start = 24 + jsonLength + ((4 - (jsonLength % 4)) % 4);
    if (jsonLength > 1024 * 1024 || start + dataLength !== bytes.length)
        throw new Error('Invalid TLMB lengths.');
    const json = bytes.subarray(24, 24 + jsonLength), data = bytes.subarray(start);
    if (crc32(data) !== view.getUint32(16, true) || crc32(json) !== view.getUint32(20, true))
        throw new Error('TLMB checksum mismatch.');
    const d = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)), n = dimensions(d.width, d.height);
    if (d.schema !== 'TLMB' || d.version !== 1 || !Number.isInteger(d.samples) || d.samples < 0)
        throw new Error('Invalid TLMB description.');
    const out = {
        width: d.width,
        height: d.height,
        samples: d.samples,
        metadata: d.metadata,
    };
    const ranges = [];
    for (const [key, [type, size]] of channelEntries) {
        const c = d.channels?.[key];
        if (!c ||
            c.type !== type ||
            c.size !== size ||
            c.length !== n * size ||
            !Number.isInteger(c.offset) ||
            c.offset < 0 ||
            c.offset % 4)
            throw new Error(`Invalid TLMB channel ${key}.`);
        const count = c.length * (type === 'u8' ? 1 : 4), end = c.offset + count;
        if (end > data.length || ranges.some(([a, b]) => c.offset < b && end > a))
            throw new Error('TLMB channel range overlaps or overflows.');
        ranges.push([c.offset, end]);
        const array = new constructors[type](c.length), v = new DataView(data.buffer, data.byteOffset + c.offset, count);
        for (let i = 0; i < array.length; i++)
            array[i] =
                type === 'f32'
                    ? v.getFloat32(i * 4, true)
                    : type === 'i32'
                        ? v.getInt32(i * 4, true)
                        : type === 'u32'
                            ? v.getUint32(i * 4, true)
                            : v.getUint8(i);
        if (type === 'f32' && !array.every(Number.isFinite))
            throw new Error('Nonfinite TLMB channel.');
        out[key] = array;
    }
    for (let i = 0; i < n; i++)
        if (out.coverage[i] > 1 ||
            out.ao[i] < 0 ||
            out.ao[i] > 1 ||
            (out.coverage[i] && out.charts[i] < 0))
            throw new Error('Invalid TLMB masks/AO.');
    return out;
}
/** PFM stores bottom-to-top float data; this matches the bake's v=0 first convention. */
export function encodePFM(data, width, height, { channels = 3 } = {}) {
    const n = dimensions(width, height);
    if (![1, 3].includes(channels) || data.length !== n * channels || !data.every(Number.isFinite))
        throw new Error('Invalid PFM pixels.');
    const header = utf8(`${channels === 3 ? 'PF' : 'Pf'}\n${width} ${height}\n-1.0\n`), out = new Uint8Array(header.length + data.length * 4), view = new DataView(out.buffer);
    out.set(header);
    for (let i = 0; i < data.length; i++)
        view.setFloat32(header.length + i * 4, data[i], true);
    return out;
}
export function decodePFM(input) {
    const bytes = bytesOf(input);
    let at = 0;
    const line = () => {
        if (at >= bytes.length)
            throw new Error('Truncated PFM header.');
        let end = at;
        while (end < bytes.length && bytes[end] !== 10)
            end++;
        if (end === bytes.length)
            throw new Error('Truncated PFM header.');
        const text = new TextDecoder().decode(bytes.subarray(at, end)).trim();
        at = end + 1;
        return text;
    };
    const magic = line();
    if (!['PF', 'Pf'].includes(magic))
        throw new Error('Invalid PFM magic.');
    let dims = line();
    while (dims.startsWith('#'))
        dims = line();
    const parts = dims.split(/\s+/).map(Number);
    if (parts.length !== 2)
        throw new Error('Invalid PFM dimensions.');
    const [width, height] = parts, n = dimensions(width, height), channels = magic === 'PF' ? 3 : 1;
    let scaleText = line();
    while (scaleText.startsWith('#'))
        scaleText = line();
    const scale = Number(scaleText);
    if (!Number.isFinite(scale) || scale === 0)
        throw new Error('Invalid PFM scale.');
    if (bytes.length - at !== n * channels * 4)
        throw new Error('PFM payload length mismatch.');
    const view = new DataView(bytes.buffer, bytes.byteOffset + at, bytes.length - at), data = new Float32Array(n * channels);
    for (let i = 0; i < data.length; i++)
        data[i] = view.getFloat32(i * 4, scale < 0) * Math.abs(scale);
    if (!data.every(Number.isFinite))
        throw new Error('Nonfinite PFM data.');
    return { width, height, channels, data };
}
//# sourceMappingURL=binary.js.map