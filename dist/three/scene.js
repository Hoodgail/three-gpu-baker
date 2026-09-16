import * as T from 'three/webgpu';
import { texture, vec3 } from 'three/tsl';
import { srgbToLinear, geometricNormal, triangleArea } from '../core/math.js';
export const uvAttribute = (channel) => (channel === 0 ? 'uv' : `uv${channel}`);
const wrapName = (x) => x === T.RepeatWrapping ? 'repeat' : x === T.MirroredRepeatWrapping ? 'mirror' : 'clamp';
/** Snapshot texture pixels as linear RGB. Sampling transformations remain explicit. */
export async function extractTexture(map, sourceUVChannel = 0) {
    if (!map)
        return undefined;
    if ('isCompressedTexture' in map ||
        'isCompressedArrayTexture' in map ||
        'isVideoTexture' in map ||
        'isDataArrayTexture' in map)
        throw new Error('Decode compressed/array/video textures to a static 2D texture before baking.');
    if ((map.channel ?? 0) !== sourceUVChannel)
        throw new Error(`Albedo/emissive textures must use sourceUVChannel (${sourceUVChannel}); the lightmap channel is reserved.`);
    if (map.matrixAutoUpdate)
        map.updateMatrix();
    const image = (map.image ?? map.source?.data);
    if (!image)
        throw new Error('Texture image is not loaded. Await the model/texture loader.');
    const width = image.width ?? image.videoWidth, height = image.height ?? image.videoHeight;
    if (!Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width <= 0 ||
        height <= 0 ||
        width * height > 16777216)
        throw new Error('Invalid or oversized texture dimensions.');
    let pixels, channels;
    if (image.data) {
        pixels = image.data;
        channels = pixels.length / (width * height);
        if (![3, 4].includes(channels))
            throw new Error('Textures must have three or four channels.');
    }
    else {
        const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(width, height)
            : globalThis.document?.createElement('canvas');
        if (!canvas)
            throw new Error('Image textures require browser Canvas; Node users can provide Float32 DataTextures.');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx)
            throw new Error('Canvas 2D is unavailable.');
        try {
            ctx.drawImage(image, 0, 0);
            pixels = ctx.getImageData(0, 0, width, height).data;
            channels = 4;
        }
        catch (error) {
            throw new Error('Texture pixels are not readable. Serve textures with valid CORS headers.', {
                cause: error,
            });
        }
    }
    const out = new Float32Array(width * height * 4), byte = pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray, half = map.type === T.HalfFloatType;
    if (!byte && !half && !(pixels instanceof Float32Array))
        throw new Error('Supported texture data: uint8, float16, float32.');
    for (let i = 0; i < width * height; i++)
        for (let c = 0; c < 4; c++) {
            let value = c >= channels ? 1 : pixels[i * channels + c];
            if (c < channels) {
                if (byte)
                    value /= 255;
                else if (half)
                    value = T.DataUtils.fromHalfFloat(value);
            }
            if (c < 3 && map.colorSpace === T.SRGBColorSpace)
                value = srgbToLinear(value);
            out[i * 4 + c] = value;
        }
    const e = map.matrix.elements;
    return {
        width,
        height,
        data: out,
        transform: [e[0], e[3], e[6], e[1], e[4], e[7]],
        wrapS: wrapName(map.wrapS),
        wrapT: wrapName(map.wrapT),
        flipY: map.flipY === true,
    };
}
/** Flatten visible static meshes/instances into world-space diffuse transport data.
 * Source objects are never modified. Morph/skinned meshes must be frozen first.
 */
export async function extractThreeScene(root, { signal, sourceUVChannel = 0, lightmapUVChannel = 1, } = {}) {
    root.updateWorldMatrix(true, true);
    if (root instanceof T.Scene && root.environment)
        throw new Error('HDR/cube environment importance sampling is not implemented. Use an explicit constant environment or emitting geometry.');
    const objects = [];
    root.traverseVisible((o) => objects.push(o));
    const triangles = [], materials = [], sourceMaterials = [], materialIds = new Map(), textureCache = new Map(), lights = [], environment = [0, 0, 0];
    const vector = (o) => new T.Vector3().setFromMatrixPosition(o.matrixWorld).toArray();
    const materialID = async (source) => {
        const m = source;
        if (materialIds.has(m))
            return materialIds.get(m);
        if (m.transparent ||
            m.opacity < 1 ||
            m.alphaTest > 0 ||
            m.alphaMap ||
            (m.transmission ?? 0) > 0)
            throw new Error(`Material ${m.name || m.type}: alpha/transmission is not supported by this opaque diffuse baker.`);
        if (m.vertexColors)
            throw new Error('Vertex colors must be baked into an albedo texture before transport.');
        if (m.isShaderMaterial || m.isNodeMaterial)
            throw new Error(`Material ${m.name || m.type}: custom shaders require an explicit core material descriptor.`);
        const tex = async (t) => {
            if (!t)
                return undefined;
            if (!textureCache.has(t))
                textureCache.set(t, extractTexture(t, sourceUVChannel));
            return textureCache.get(t);
        };
        const descriptor = {
            name: m.name || m.type,
            color: m.color?.toArray() ?? [1, 1, 1],
            emissive: m.emissive?.toArray() ?? [0, 0, 0],
            emissiveIntensity: m.emissiveIntensity ?? 1,
            metalness: m.metalness ?? 0,
            doubleSided: m.side === T.DoubleSide,
            map: await tex(m.map),
            emissiveMap: await tex(m.emissiveMap),
        };
        if (m.side === T.BackSide)
            throw new Error('BackSide materials must have their triangle winding reversed before baking.');
        if (m.normalMap || m.bumpMap || m.displacementMap)
            throw new Error('Bake normal/bump/displacement effects into geometry first; this integrator uses geometric/interpolated vertex normals.');
        const id = materials.length;
        materials.push(descriptor);
        sourceMaterials.push(m);
        materialIds.set(m, id);
        return id;
    };
    for (const object of objects) {
        signal?.throwIfAborted();
        if (object instanceof T.Light) {
            const common = {
                color: object.color.toArray(),
                intensity: object.intensity,
            };
            if (object instanceof T.AmbientLight) {
                for (let c = 0; c < 3; c++)
                    environment[c] += (common.color[c] * common.intensity) / Math.PI;
                continue;
            }
            if (object instanceof T.HemisphereLight || object instanceof T.LightProbe)
                throw new Error('HemisphereLight/LightProbe inputs need conversion to an environment; probe export is supported separately.');
            if (object instanceof T.DirectionalLight || object instanceof T.SpotLight) {
                object.target.updateWorldMatrix(true, false);
                const p = vector(object), q = vector(object.target), direction = new T.Vector3()
                    .fromArray(q)
                    .sub(new T.Vector3().fromArray(p))
                    .normalize()
                    .toArray();
                lights.push(object instanceof T.SpotLight
                    ? {
                        ...common,
                        type: 'spot',
                        position: p,
                        direction,
                        angle: object.angle,
                        penumbra: object.penumbra,
                        distance: object.distance,
                        decay: object.decay,
                    }
                    : { ...common, type: 'directional', direction });
            }
            else if (object instanceof T.PointLight)
                lights.push({
                    ...common,
                    type: 'point',
                    position: vector(object),
                    distance: object.distance,
                    decay: object.decay,
                });
            else if (object instanceof T.RectAreaLight) {
                const e = object.matrixWorld.elements;
                lights.push({
                    ...common,
                    type: 'rect',
                    position: vector(object),
                    u: [(e[0] * object.width) / 2, (e[1] * object.width) / 2, (e[2] * object.width) / 2],
                    v: [
                        (-e[4] * object.height) / 2,
                        (-e[5] * object.height) / 2,
                        (-e[6] * object.height) / 2,
                    ],
                });
            }
            else
                throw new Error(`Unsupported light: ${object.type}`);
        }
        if (!(object instanceof T.Mesh))
            continue;
        if (object instanceof T.SkinnedMesh || object.morphTargetInfluences?.some((v) => v !== 0))
            throw new Error('Freeze skinned/morph geometry to a static mesh before baking.');
        const geometry = object.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute(uvAttribute(sourceUVChannel)), uv1 = geometry.getAttribute(uvAttribute(lightmapUVChannel));
        if (!position)
            continue;
        const list = Array.isArray(object.material) ? object.material : [object.material], ids = [];
        for (const m of list)
            ids.push(await materialID(m));
        if (!uv && list.some((m) => ('map' in m && m.map) || ('emissiveMap' in m && m.emissiveMap)))
            throw new Error(`Mesh ${object.name}: textured geometry has no uv attribute.`);
        const index = geometry.index, total = index ? index.count : position.count, start = geometry.drawRange.start ?? 0, end = Math.min(total, start + (geometry.drawRange.count ?? Infinity));
        if (start % 3 || end % 3)
            throw new Error('Triangle draw ranges must be multiples of three.');
        for (let instance = 0; instance < (object instanceof T.InstancedMesh ? object.count : 1); instance++) {
            const matrix = object.matrixWorld.clone();
            if (object instanceof T.InstancedMesh) {
                const local = new T.Matrix4();
                object.getMatrixAt(instance, local);
                matrix.multiply(local);
            }
            if (Math.abs(matrix.determinant()) < 1e-12)
                throw new Error('A mesh has a singular world transform.');
            const normalMatrix = new T.Matrix3().getNormalMatrix(matrix), flip = matrix.determinant() < 0;
            for (let offset = start; offset < end; offset += 3) {
                const group = geometry.groups.find((g) => offset >= g.start && offset < g.start + g.count);
                if (Array.isArray(object.material) && !group)
                    continue;
                const mat = ids[Array.isArray(object.material) ? (group?.materialIndex ?? 0) : 0];
                if (mat === undefined)
                    throw new Error('Geometry group references a missing material.');
                let vertices = [0, 1, 2].map((i) => (index ? index.getX(offset + i) : offset + i));
                if (flip)
                    [vertices[1], vertices[2]] = [vertices[2], vertices[1]];
                const t = {
                    p: vertices.map((i) => new T.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix).toArray()),
                    material: mat,
                    owner: `${object.uuid}:${instance}`,
                    source: {
                        mesh: object.uuid,
                        name: object.name,
                        geometry: geometry.uuid,
                        instance,
                        triangle: offset / 3,
                        vertices: vertices.slice(),
                    },
                };
                if (triangleArea(t) < 1e-12)
                    continue; // Ignore degenerate export seam triangles.
                t.n = normal
                    ? vertices.map((i) => new T.Vector3()
                        .fromBufferAttribute(normal, i)
                        .applyMatrix3(normalMatrix)
                        .normalize()
                        .toArray())
                    : vertices.map(() => geometricNormal(t));
                if (uv)
                    t.uv = vertices.map((i) => [uv.getX(i), uv.getY(i)]);
                if (uv1)
                    t.lmUV = vertices.map((i) => [uv1.getX(i), uv1.getY(i)]);
                if (object instanceof T.InstancedMesh && object.instanceColor) {
                    const c = new T.Color();
                    object.getColorAt(instance, c);
                    const key = `${mat}:${c.r}:${c.g}:${c.b}`;
                    let tint = materialIds.get(key);
                    if (tint === undefined) {
                        tint = materials.length;
                        materials.push({
                            ...materials[mat],
                            color: (materials[mat].color ?? [1, 1, 1]).map((v, k) => v * c.toArray()[k]),
                        });
                        sourceMaterials.push(null);
                        materialIds.set(key, tint);
                    }
                    t.material = tint;
                }
                triangles.push(t);
            }
        }
    }
    return { triangles, materials, lights, environment, sourceMaterials };
}
function materialFromDescriptor(m) {
    const t = new T.MeshStandardMaterial({
        color: new T.Color().fromArray(m.color ?? [1, 1, 1]),
        emissive: new T.Color().fromArray(m.emissive ?? [0, 0, 0]),
        emissiveIntensity: m.emissiveIntensity ?? 1,
        metalness: m.metalness ?? 0,
        roughness: 1,
        side: m.doubleSided ? T.DoubleSide : T.FrontSide,
    });
    const make = (d) => {
        if (!d)
            return null;
        const tex = new T.DataTexture(d.data.slice(), d.width, d.height, T.RGBAFormat, T.FloatType);
        tex.colorSpace = T.LinearSRGBColorSpace;
        tex.flipY = !!d.flipY;
        tex.wrapS =
            d.wrapS === 'repeat'
                ? T.RepeatWrapping
                : d.wrapS === 'mirror'
                    ? T.MirroredRepeatWrapping
                    : T.ClampToEdgeWrapping;
        tex.wrapT =
            d.wrapT === 'repeat'
                ? T.RepeatWrapping
                : d.wrapT === 'mirror'
                    ? T.MirroredRepeatWrapping
                    : T.ClampToEdgeWrapping;
        const e = d.transform ?? [1, 0, 0, 0, 1, 0];
        tex.matrix.set(e[0], e[1], e[2], e[3], e[4], e[5], 0, 0, 1);
        tex.matrixAutoUpdate = false;
        tex.needsUpdate = true;
        return tex;
    };
    t.map = make(m.map);
    t.emissiveMap = make(m.emissiveMap);
    return t;
}
/** A detached static model with the generated global uv1 atlas. */
export function createThreeModel(prepared) {
    const group = new T.Group();
    group.name = 'Baked scene';
    const batches = new Map();
    for (const t of prepared.triangles) {
        const key = `${t.owner ?? 'mesh'}:${t.material ?? 0}`;
        if (!batches.has(key))
            batches.set(key, []);
        batches.get(key).push(t);
    }
    for (const [name, triangles] of batches) {
        const position = [], normal = [], uv = [], uv1 = [];
        for (const t of triangles)
            for (let k = 0; k < 3; k++) {
                position.push(...t.p[k]);
                normal.push(...(t.n?.[k] ?? geometricNormal(t)));
                uv.push(...(t.uv?.[k] ?? [0, 0]));
                uv1.push(...t.lmUV[k]);
            }
        const geometry = new T.BufferGeometry();
        for (const [key, array, size] of [
            ['position', position, 3],
            ['normal', normal, 3],
            [uvAttribute(prepared.options.sourceUVChannel), uv, 2],
            [uvAttribute(prepared.options.lightmapUVChannel), uv1, 2],
        ])
            geometry.setAttribute(key, new T.Float32BufferAttribute(array, size));
        const id = triangles[0].material ?? 0, material = prepared.sourceMaterials?.[id]?.clone() ?? materialFromDescriptor(prepared.materials[id]);
        for (const key of ['map', 'emissiveMap']) {
            const surface = material;
            if (surface[key]) {
                surface[key] = surface[key].clone();
                surface[key].channel = prepared.options.sourceUVChannel;
            }
        }
        if ('lightMap' in material)
            material.lightMap = null;
        if ('aoMap' in material)
            material.aoMap = null;
        const mesh = new T.Mesh(geometry, material);
        mesh.name = name;
        mesh.userData.lightmap = {
            file: 'lightmaps.tlmb',
            texCoord: prepared.options.lightmapUVChannel,
            units: 'irradiance-over-pi',
        };
        // Nonindexed output: each row maps three output vertices to original corners.
        mesh.userData.geometryMappings = triangles.map((t, i) => ({
            source: structuredClone(t.source),
            outputVertices: [i * 3, i * 3 + 1, i * 3 + 2],
        }));
        group.add(mesh);
    }
    group.userData.lightmap = {
        schema: 'three-lightmap-baker',
        version: 1,
        file: 'lightmaps.tlmb',
        texCoord: prepared.options.lightmapUVChannel,
    };
    return group;
}
export function createLightmapTextures(result) {
    const make = (array, mono = false) => {
        const data = new Float32Array(result.width * result.height * 4);
        for (let i = 0; i < result.width * result.height; i++) {
            for (let c = 0; c < 3; c++)
                data[i * 4 + c] = array[i * (mono ? 1 : 3) + (mono ? 0 : c)];
            data[i * 4 + 3] = 1;
        }
        const t = new T.DataTexture(data, result.width, result.height, T.RGBAFormat, T.FloatType);
        t.colorSpace = T.LinearSRGBColorSpace;
        t.channel = Number(result.metadata.lightmapUVChannel ?? 1);
        t.flipY = false;
        t.generateMipmaps = false;
        t.minFilter = T.LinearFilter;
        t.magFilter = T.LinearFilter;
        t.needsUpdate = true;
        return t;
    };
    return {
        lightmap: make(result.lightmap),
        direct: make(result.direct),
        indirect: make(result.indirect),
        ao: make(result.ao, true),
    };
}
/** Fully baked diffuse display: albedo * (E/π) + emission. Does not double-light or multiply AO. */
export function applyLightmaps(root, result, { textures = createLightmapTextures(result) } = {}) {
    root.traverse((o) => {
        if (!(o instanceof T.Mesh))
            return;
        if (!o.geometry.getAttribute(uvAttribute(Number(result.metadata.lightmapUVChannel ?? 1))))
            throw new Error('Apply to createModel() output or a model with the matching global lightmap UV atlas.');
        const convert = (m) => {
            const out = new T.MeshBasicNodeMaterial({ side: m.side });
            let albedo = vec3(...(m.color?.toArray() ?? [1, 1, 1]));
            if (m.map)
                albedo = albedo.mul(texture(m.map).rgb);
            albedo = albedo.mul(1 - (m.metalness ?? 0));
            let emission = vec3(...(m.emissive?.toArray() ?? [0, 0, 0])).mul(m.emissiveIntensity ?? 1);
            if (m.emissiveMap)
                emission = emission.mul(texture(m.emissiveMap).rgb);
            out.colorNode = albedo.mul(texture(textures.lightmap).rgb).add(emission);
            out.name = `${m.name} [baked]`;
            return out;
        };
        o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
    });
    return textures;
}
export function createThreeLightProbe(probe) {
    if (probe.coefficients?.length !== 27)
        throw new Error('Expected 27 SH coefficients.');
    const sh = new T.SphericalHarmonics3();
    sh.fromArray(probe.coefficients);
    const p = new T.LightProbe(sh, 1);
    p.position.fromArray(probe.position);
    return p;
}
//# sourceMappingURL=scene.js.map