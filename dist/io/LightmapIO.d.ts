import { exportLightmap, importLightmap, encodePFM, decodePFM } from './binary.js';
import { exportPNG } from './images.js';
import { exportBakeBundle } from './zip.js';
import { importProbes, exportProbes } from '../core/probes.js';
/** Portable lossless lightmaps, display previews, bundles and probe data. */
export declare class LightmapIO {
    encode: typeof exportLightmap;
    decode: typeof importLightmap;
    encodePFM: typeof encodePFM;
    decodePFM: typeof decodePFM;
    preview: typeof exportPNG;
    bundle: typeof exportBakeBundle;
    encodeProbes: typeof exportProbes;
    decodeProbes: typeof importProbes;
}
//# sourceMappingURL=LightmapIO.d.ts.map