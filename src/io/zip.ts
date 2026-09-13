import type * as Types from '../types.js';
import { bytesOf, concatBytes, crc32, utf8, exportLightmap, encodePFM } from './binary.js';
import { exportPNG } from './images.js';
/** Standard ZIP32, STORE compression, UTF-8 names. No runtime compression dependency. */
export function createZip(entries: Types.ZipEntry[]) {
  const parts = [],
    directory = [],
    seen = new Set();
  let offset = 0;
  for (const { name, data } of entries) {
    if (
      !name ||
      name.startsWith('/') ||
      name.split(/[\\/]/).some((v) => v === '..') ||
      seen.has(name)
    )
      throw new Error('Unsafe or duplicate ZIP entry name.');
    seen.add(name);
    const filename = utf8(name),
      bytes = typeof data === 'string' ? utf8(data) : bytesOf(data);
    if (filename.length > 65535 || bytes.length > 0xffffffff)
      throw new Error('ZIP32 limit exceeded.');
    const crc = crc32(bytes),
      local = new Uint8Array(30),
      l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, bytes.length, true);
    l.setUint32(22, bytes.length, true);
    l.setUint16(26, filename.length, true);
    const central = new Uint8Array(46),
      c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, filename.length, true);
    c.setUint32(42, offset, true);
    parts.push(local, filename, bytes);
    directory.push(central, filename);
    offset += local.length + filename.length + bytes.length;
  }
  if (entries.length > 65535 || offset > 0xffffffff) throw new Error('ZIP32 limit exceeded.');
  const dir = concatBytes(directory),
    end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, entries.length, true);
  v.setUint16(10, entries.length, true);
  v.setUint32(12, dir.length, true);
  v.setUint32(16, offset, true);
  return concatBytes([...parts, dir, end]);
}
export function exportBakeBundle(
  result: Types.BakeResult,
  {
    model,
    probes,
    includePFM = true,
  }: { model?: Types.BinaryInput; probes?: Types.ProbeData; includePFM?: boolean } = {},
) {
  const entries: Types.ZipEntry[] = [
    { name: 'lightmaps.tlmb', data: exportLightmap(result) },
    { name: 'metadata.json', data: JSON.stringify(result.metadata, null, 2) },
  ];
  for (const channel of ['lightmap', 'direct', 'indirect', 'ao'] as const) {
    entries.push({ name: `previews/${channel}.png`, data: exportPNG(result, channel) });
    if (includePFM)
      entries.push({
        name: `linear/${channel}.pfm`,
        data: encodePFM(result[channel], result.width, result.height, {
          channels: channel === 'ao' ? 1 : 3,
        }),
      });
  }
  if (model) entries.push({ name: 'model.glb', data: model });
  if (probes) entries.push({ name: 'probes.json', data: JSON.stringify(probes, null, 2) });
  entries.push({
    name: 'README.txt',
    data: 'TLMB/PFM contain linear HDR values. PNGs are display previews, NOT HDR lightmaps. Model uses TEXCOORD_1 for the global atlas; glTF has no standard lightmap slot. Apply lightmap as albedo * (direct + indirect) + emission. Do not multiply AO again. Probe coefficients are radiance SH9 in Three.js ordering.\n',
  });
  return createZip(entries);
}
export function downloadBytes(
  bytes: Types.BinaryInput,
  name: string,
  type: string = 'application/octet-stream',
) {
  if (typeof document === 'undefined')
    throw new Error('Downloads require a browser. In Node, use fs.writeFile().');
  const url = URL.createObjectURL(new Blob([bytesOf(bytes).slice().buffer], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
