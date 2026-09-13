import type * as Types from '../types.js';

/** Load GLTF/GLB/OBJ. External dependencies must resolve under baseURL or LoadingManager. */
export async function importModel(
  input: string | Blob | Types.BinaryInput,
  { format, baseURL = '', manager, configureLoader }: Types.ModelImportOptions = {},
) {
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    format ??= ('name' in input ? String(input.name) : undefined)?.split('.').pop();
    input = await input.arrayBuffer();
  }
  if (typeof input === 'string' && input.trimStart().startsWith('{')) format ??= 'gltf';
  if (typeof input === 'string' && format === undefined)
    format = input.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  format = (format ?? 'glb').toLowerCase();
  if (format === 'gltf' || format === 'glb') {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader(manager);
    configureLoader?.(loader);
    if (typeof input === 'string' && !input.trimStart().startsWith('{'))
      return (await loader.loadAsync(input)).scene;
    const data = ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer
      : input;
    return (await loader.parseAsync(data as string | ArrayBuffer, baseURL)).scene;
  }
  if (format === 'obj') {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
    const loader = new OBJLoader(manager);
    configureLoader?.(loader);
    if (input instanceof ArrayBuffer || ArrayBuffer.isView(input))
      input = new TextDecoder().decode(input);
    if (typeof input !== 'string') throw new TypeError('OBJ input must be text or URL.');
    return input.includes('\n') || /^\s*(?:#|v |vn |vt |f |o |g )/.test(input)
      ? loader.parse(input)
      : await loader.loadAsync(input);
  }
  throw new Error('Supported model formats: glb, gltf, obj.');
}
/** GLTF does not standardize lightmaps; the authoritative bake travels in a TLMB sidecar. */
export async function exportModel(
  root: import('three').Object3D,
  {
    binary = true,
    ...options
  }: import('three/addons/exporters/GLTFExporter.js').GLTFExporterOptions = {},
) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  let unsupported = false;
  root.traverse((o) => {
    const material =
      'material' in o
        ? (o.material as import('three').Material | import('three').Material[])
        : undefined;
    const list = Array.isArray(material) ? material : [material];
    if (list.some((m) => m && 'isNodeMaterial' in m)) unsupported = true;
  });
  if (unsupported)
    throw new Error(
      'Export the detached createModel() result BEFORE applyLightmaps(); node preview materials are not portable glTF materials.',
    );
  // GLTFExporter copies DataTexture values as bytes; float inputs would turn black.
  // Export a detached snapshot with correctly encoded sRGB images instead.
  const { prepareExportModel } = await import('./portable.js');
  const prepared = await prepareExportModel(root);
  try {
    return await new GLTFExporter().parseAsync(prepared.root, {
      binary,
      onlyVisible: true,
      ...options,
    });
  } finally {
    prepared.dispose();
  }
}

/** Import a browser file selection, including relative glTF buffers and images. */
export async function importModelFiles(
  files: Iterable<File>,
  { entry, configureLoader }: Types.ModelFileOptions = {},
) {
  const list = Array.from(files),
    byPath = new Map<string, File>(),
    urls: string[] = [];
  const normalize = (path: string) => path.replaceAll('\\', '/').replace(/^\.\//, '');
  for (const file of list) {
    const name = normalize(file.webkitRelativePath || file.name);
    if (!name || byPath.has(name)) throw new Error('Files need unique relative paths.');
    byPath.set(name, file);
  }
  const candidates = [...byPath.keys()].filter((p) => /\.(glb|gltf|obj)$/i.test(p));
  if (!entry && candidates.length !== 1)
    throw new Error('Select one model or specify its entry filename.');
  const name = entry ?? candidates[0],
    file = byPath.get(name);
  if (!file) throw new Error('Model entry is missing.');
  const { LoadingManager } = await import('three/webgpu');
  const manager = new LoadingManager();
  const base = 'https://lightmap-files.invalid/',
    baseURL = new URL(name.slice(0, name.lastIndexOf('/') + 1), base).href;
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const parsed = new URL(url, baseURL),
      path = normalize(decodeURIComponent(parsed.pathname.slice(1))),
      resource = byPath.get(path);
    if (parsed.origin !== new URL(base).origin || !resource)
      throw new Error(`Missing model resource: ${path}`);
    const objectURL = URL.createObjectURL(resource);
    urls.push(objectURL);
    return objectURL;
  });
  try {
    return await importModel(await file.arrayBuffer(), {
      format: name.split('.').pop(),
      baseURL,
      manager,
      configureLoader,
    });
  } finally {
    for (const url of urls) URL.revokeObjectURL(url);
  }
}
