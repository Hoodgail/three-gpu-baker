import { sharedAtlasExample as example } from '../../examples/uv-atlas.js';
import wasmURL from 'xatlasjs/dist/xatlas.wasm?url';
import workerURL from 'xatlasjs/dist/xatlas.js?url';
import type { Mesh } from 'three';

export async function sharedAtlasExample(mode: 'generate' | 'repack' = 'generate') {
  const { model, result, mappings } = await example(
    new URL(wasmURL, location.href).href,
    new URL(workerURL, location.href).href,
    mode,
  );
  return {
    meshes: model.children.length,
    covered: result.coverage.reduce((a, b) => a + b, 0),
    mappings: mappings.length,
    channels: model.children.map((m) => !!(m as Mesh).geometry.getAttribute('uv1')),
  };
}
