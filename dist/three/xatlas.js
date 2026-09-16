/** Pack all mesh instances together, retaining corner provenance through seam splits. */
export function createXAtlasProvider(unwrapper) {
    let busy = false;
    return {
        async generate(triangles, options) {
            if (busy)
                throw new Error('This xatlas provider is already generating an atlas.');
            if (options.width !== options.height)
                throw new Error('xatlas-three integration requires a square atlas.');
            busy = true;
            const { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } = await import('three');
            const geometries = [];
            const oldPack = unwrapper.packOptions, oldChart = unwrapper.chartOptions;
            try {
                const groups = new Map();
                triangles.forEach((t, i) => {
                    const key = t.owner ?? t.source?.mesh ?? 'core';
                    if (!groups.has(key))
                        groups.set(key, []);
                    groups.get(key).push(i);
                });
                for (const indices of groups.values()) {
                    const g = new BufferGeometry();
                    g.setAttribute('position', new Float32BufferAttribute(indices.flatMap((i) => triangles[i].p.flat()), 3));
                    g.setAttribute('uv', new Float32BufferAttribute(indices.flatMap((i) => (options.uvMode === 'repack' ? triangles[i].lmUV : triangles[i].uv)?.flat() ?? [
                        0, 0, 0, 0, 0, 0,
                    ]), 2));
                    // xatlas-three remaps arbitrary attributes using xatlas oldIndexes.
                    g.setAttribute('bakerCorner', new Uint32BufferAttribute(indices.flatMap((i) => [i * 3, i * 3 + 1, i * 3 + 2]), 1));
                    g.setIndex(Array.from({ length: indices.length * 3 }, (_, i) => i));
                    geometries.push(g);
                }
                unwrapper.packOptions = {
                    ...oldPack,
                    resolution: options.width,
                    padding: options.padding,
                    texelsPerUnit: options.texelDensity ?? 0,
                };
                unwrapper.chartOptions = {
                    ...oldChart,
                    useInputMeshUvs: options.uvMode === 'repack',
                };
                const atlas = await unwrapper.packAtlas(geometries, 'uv2', 'uv');
                if (atlas.atlasCount !== 1 || atlas.width > options.width || atlas.height > options.height)
                    throw new Error('xatlas output does not fit one shared atlas. Increase resolution or lower density/padding.');
                const output = triangles.map(() => new Array(3));
                const seen = new Set();
                for (const g of atlas.geometries) {
                    const uv = g.getAttribute('uv2'), corners = g.getAttribute('bakerCorner');
                    if (!uv || !corners || !g.index)
                        throw new Error('xatlas omitted UVs or source mappings.');
                    for (let i = 0; i < g.index.count; i++) {
                        const vertex = g.index.getX(i), corner = corners.getX(vertex);
                        if (!Number.isSafeInteger(corner) ||
                            corner < 0 ||
                            corner >= triangles.length * 3 ||
                            seen.has(corner))
                            throw new Error('xatlas returned invalid or duplicate source corners.');
                        seen.add(corner);
                        output[Math.floor(corner / 3)][corner % 3] = [
                            (uv.getX(vertex) * atlas.width) / options.width,
                            (uv.getY(vertex) * atlas.height) / options.height,
                        ];
                    }
                }
                if (seen.size !== triangles.length * 3)
                    throw new Error('xatlas omitted source triangles.');
                return output;
            }
            finally {
                unwrapper.packOptions = oldPack;
                unwrapper.chartOptions = oldChart;
                geometries.forEach((g) => g.dispose());
                busy = false;
            }
        },
    };
}
//# sourceMappingURL=xatlas.js.map