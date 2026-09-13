import { exportLightmap, importLightmap, encodePFM, decodePFM } from './binary.js';
import { exportPNG } from './images.js';
import { exportBakeBundle } from './zip.js';
import { importProbes, exportProbes } from '../core/probes.js';

/** Portable lossless lightmaps, display previews, bundles and probe data. */
export class LightmapIO {
  encode = exportLightmap;
  decode = importLightmap;
  encodePFM = encodePFM;
  decodePFM = decodePFM;
  preview = exportPNG;
  bundle = exportBakeBundle;
  encodeProbes = exportProbes;
  decodeProbes = importProbes;
}
