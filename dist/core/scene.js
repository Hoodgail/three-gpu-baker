import { triangleArea, length, cross } from './math.js';
import { validateTexture } from './material.js';
import { buildBVH } from './bvh.js';
import { generateAtlas, rasterizeAtlas } from './atlas.js';
import { triangleSource } from './uv.js';
export function validateOptions(options = {}) {
    const out = {
        maxMemoryMB: 512,
        requestedWidth: 0,
        requestedHeight: 0,
        width: 256,
        height: 256,
        resolutionScale: 1,
        samples: 128,
        bounces: 2,
        padding: 2,
        uvMode: 'auto',
        sourceUVChannel: 0,
        lightmapUVChannel: 1,
        seed: 1337,
        aoDistance: 1,
        rayBias: 0.0001,
        maxRadiance: 0,
        tileSize: 256,
        minTileSize: 16,
        maxTileSize: 4096,
        targetDispatchMs: 8,
        backend: 'tsl',
        ...options,
    };
    for (const k of [
        'width',
        'height',
        'samples',
        'bounces',
        'padding',
        'seed',
        'tileSize',
        'minTileSize',
        'maxTileSize',
    ])
        if (!Number.isSafeInteger(out[k]))
            throw new TypeError(`${k} must be an integer.`);
    if (out.width < 8 || out.height < 8 || out.width > 8192 || out.height > 8192)
        throw new RangeError('Atlas dimensions must be 8..8192.');
    if (out.seed < 0 || out.seed > 4294967295)
        throw new RangeError('seed must be uint32.');
    if (out.samples < 1 || out.samples > 16777216)
        throw new RangeError('samples must be 1..16777216.');
    if (out.bounces < 0 || out.bounces > 8)
        throw new RangeError('bounces must be 0..8; one segment is always traced for direct environment and emission.');
    if (out.padding < 0 || out.padding > 32)
        throw new RangeError('padding must be 0..32.');
    if (!Number.isFinite(out.resolutionScale) || out.resolutionScale <= 0 || out.resolutionScale > 1)
        throw new RangeError('resolutionScale must be in (0,1].');
    for (const k of ['aoDistance', 'rayBias', 'targetDispatchMs'])
        if (!Number.isFinite(out[k]) || out[k] <= 0)
            throw new RangeError(`${k} must be finite and positive.`);
    if (!Number.isFinite(out.maxRadiance) || out.maxRadiance < 0)
        throw new RangeError('maxRadiance must be nonnegative; zero disables clamping.');
    if (out.minTileSize < 1 ||
        out.maxTileSize < out.minTileSize ||
        out.tileSize < out.minTileSize ||
        out.tileSize > out.maxTileSize ||
        out.maxTileSize > 65536)
        throw new RangeError('Tile sizes must satisfy 1 <= min <= tile <= max <= 65536.');
    if (!['tsl', 'webgpu', 'cpu', 'auto'].includes(out.backend))
        throw new Error('Unknown backend.');
    if (!['auto', 'generate', 'existing', 'preserve', 'repack'].includes(out.uvMode))
        throw new Error('Unknown uvMode.');
    for (const key of ['sourceUVChannel', 'lightmapUVChannel'])
        if (![0, 1, 2, 3].includes(out[key]))
            throw new RangeError(`${key} must be 0..3.`);
    if (out.sourceUVChannel === out.lightmapUVChannel)
        throw new Error('Source and lightmap UV channels must differ.');
    if (out.texelDensity !== undefined &&
        (!Number.isFinite(out.texelDensity) || out.texelDensity <= 0))
        throw new RangeError('texelDensity must be finite and positive.');
    if (out.atlasProvider && typeof out.atlasProvider.generate !== 'function')
        throw new TypeError('atlasProvider must implement generate.');
    out.requestedWidth = out.width;
    out.requestedHeight = out.height;
    out.width = Math.max(8, Math.floor(out.width * out.resolutionScale));
    out.height = Math.max(8, Math.floor(out.height * out.resolutionScale));
    return out;
}
const finiteVector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
export function validateScene(scene) {
    if (!Array.isArray(scene?.triangles) || !scene.triangles.length)
        throw new TypeError('Scene needs a nonempty triangles array.');
    if (!Array.isArray(scene.materials) || !scene.materials.length)
        throw new TypeError('Scene needs materials.');
    for (const [i, t] of scene.triangles.entries()) {
        if (!Array.isArray(t.p) || t.p.length !== 3 || !t.p.every((p) => finiteVector(p, 3)))
            throw new TypeError(`Triangle ${i}: invalid positions.`);
        if (triangleArea(t) < 1e-12)
            throw new Error(`Triangle ${i}: degenerate world-space triangle.`);
        if (t.n &&
            (!Array.isArray(t.n) ||
                t.n.length !== 3 ||
                !t.n.every((n) => finiteVector(n, 3) && length(n) > 1e-8)))
            throw new TypeError(`Triangle ${i}: invalid normals.`);
        if (t.uv &&
            (!Array.isArray(t.uv) || t.uv.length !== 3 || !t.uv.every((uv) => finiteVector(uv, 2))))
            throw new TypeError(`Triangle ${i}: invalid UVs.`);
        if (!Number.isInteger(t.material ?? 0) ||
            (t.material ?? 0) < 0 ||
            (t.material ?? 0) >= scene.materials.length)
            throw new Error(`Triangle ${i}: material index out of bounds.`);
    }
    for (const [i, m] of scene.materials.entries()) {
        for (const k of ['color', 'emissive'])
            if (m[k] && (!finiteVector(m[k], 3) || m[k].some((v) => v < 0)))
                throw new TypeError(`Material ${i}: invalid ${k}.`);
        if (!Number.isFinite(m.metalness ?? 0) || (m.metalness ?? 0) < 0 || (m.metalness ?? 0) > 1)
            throw new RangeError(`Material ${i}: invalid metalness.`);
        if (!Number.isFinite(m.emissiveIntensity ?? 1) || (m.emissiveIntensity ?? 1) < 0)
            throw new RangeError(`Material ${i}: invalid emission intensity.`);
        validateTexture(m.map, `material ${i} albedo`);
        validateTexture(m.emissiveMap, `material ${i} emission`);
    }
    if (scene.environment &&
        (!finiteVector(scene.environment, 3) || scene.environment.some((v) => v < 0)))
        throw new TypeError('environment must be a nonnegative linear RGB triplet.');
    for (const [i, l] of (scene.lights ?? []).entries()) {
        if (!['point', 'spot', 'directional', 'rect'].includes(l.type))
            throw new Error(`Light ${i}: unsupported type ${l.type}.`);
        if (!finiteVector(l.color ?? [1, 1, 1], 3) ||
            (l.color ?? [1, 1, 1]).some((v) => v < 0) ||
            !Number.isFinite(l.intensity ?? 1) ||
            (l.intensity ?? 1) < 0)
            throw new Error(`Light ${i}: invalid radiometry.`);
        for (const k of l.type === 'directional'
            ? ['direction']
            : l.type === 'rect'
                ? ['position', 'u', 'v']
                : l.type === 'spot'
                    ? ['position', 'direction']
                    : ['position'])
            if (!finiteVector(l[k], 3))
                throw new TypeError(`Light ${i}: invalid ${k}.`);
        if ('direction' in l && length(l.direction) < 1e-8)
            throw new Error(`Light ${i}: zero direction.`);
        if (l.type === 'rect' && length(cross(l.u, l.v)) < 1e-8)
            throw new Error(`Light ${i}: zero area.`);
        if (l.type === 'spot' &&
            (!Number.isFinite(l.angle ?? Math.PI / 3) ||
                (l.angle ?? Math.PI / 3) <= 0 ||
                (l.angle ?? Math.PI / 3) > Math.PI / 2))
            throw new Error(`Light ${i}: invalid spotlight angle.`);
        if (!Number.isFinite(('penumbra' in l ? l.penumbra : 0) ?? 0) ||
            (('penumbra' in l ? l.penumbra : 0) ?? 0) < 0 ||
            (('penumbra' in l ? l.penumbra : 0) ?? 0) > 1)
            throw new Error(`Light ${i}: invalid penumbra.`);
        if (!Number.isFinite(('distance' in l ? l.distance : 0) ?? 0) ||
            (('distance' in l ? l.distance : 0) ?? 0) < 0 ||
            !Number.isFinite(('decay' in l ? l.decay : 2) ?? 2) ||
            (('decay' in l ? l.decay : 2) ?? 2) < 0)
            throw new Error(`Light ${i}: invalid falloff.`);
    }
}
export function prepareCoreScene(scene, options, suppliedAtlas) {
    validateScene(scene);
    if (!suppliedAtlas &&
        options.atlasProvider &&
        (options.uvMode === 'generate' ||
            options.uvMode === 'repack' ||
            (options.uvMode === 'auto' && !scene.triangles.every((t) => t.lmUV))))
        throw new Error('Async atlasProvider requires SceneCompiler.compile or LightmapBaker.prepare.');
    const triangles = scene.triangles.map((t, i) => ({
        ...t,
        source: triangleSource(t, i),
    }));
    const atlas = suppliedAtlas ?? generateAtlas(triangles, options.width, options.height, options);
    const bvh = buildBVH(atlas.triangles);
    const uvDiagnostics = [];
    const prepared = {
        geometryMappings: bvh.triangles.map((t, triangle) => ({
            source: triangleSource(t, bvh.originalIndices[triangle]),
            triangle,
        })),
        uvDiagnostics,
        gbuffer: rasterizeAtlas(bvh.triangles, scene.materials, options.width, options.height, {
            conservative: atlas.mode === 'generate' && !options.atlasProvider,
            padding: options.padding,
            diagnostics: uvDiagnostics,
        }),
        ...scene,
        triangles: bvh.triangles,
        bvh,
        environment: scene.environment ?? [0, 0, 0],
        materials: scene.materials,
        lights: [...(scene.lights ?? [])],
        options,
        atlas,
    };
    // Every emitting triangle is an explicitly sampled area light. MIS handles BSDF hits.
    bvh.triangles.forEach((t, index) => {
        const m = scene.materials[t.material ?? 0];
        if ((m.emissive ?? [0, 0, 0]).some((c) => c * (m.emissiveIntensity ?? 1) > 0))
            prepared.lights.push({
                type: 'emissive',
                triangle: index,
                area: triangleArea(t),
            });
    });
    const sortedIndices = new Map(bvh.originalIndices.map((original, sorted) => [original, sorted]));
    atlas.charts = atlas.charts.map((c) => ({
        ...c,
        triangles: c.triangles.map((i) => sortedIndices.get(i)),
    }));
    prepared.atlas.triangles = bvh.triangles;
    return prepared;
}
//# sourceMappingURL=scene.js.map