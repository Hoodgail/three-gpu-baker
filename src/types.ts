import type { Material, Object3D, LoadingManager, DataTexture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

/** Three finite components in world space or linear RGB. Validated on preparation. */
export type Vec3 = number[];
export type Vec2 = number[];
export type Triple<T> = T[];
export type WrapMode = 'clamp' | 'repeat' | 'mirror';
export interface LinearTexture {
  width: number;
  height: number;
  data: Float32Array;
  transform?: number[];
  wrapS?: WrapMode;
  wrapT?: WrapMode;
  flipY?: boolean;
}
export interface DiffuseMaterial {
  name?: string;
  color?: Vec3;
  emissive?: Vec3;
  emissiveIntensity?: number;
  metalness?: number;
  doubleSided?: boolean;
  map?: LinearTexture;
  emissiveMap?: LinearTexture;
}
export interface Triangle {
  p: Triple<Vec3>;
  n?: Triple<Vec3>;
  uv?: Triple<Vec2>;
  lmUV?: Triple<Vec2>;
  material?: number;
  owner?: string;
  chart?: number;
}
export interface AtlasTriangle extends Triangle {
  lmUV: Triple<Vec2>;
  chart: number;
}
interface LightBase {
  color?: Vec3;
  intensity?: number;
}
export interface DirectionalLight extends LightBase {
  type: 'directional';
  direction: Vec3;
}
export interface PointLight extends LightBase {
  type: 'point';
  position: Vec3;
  distance?: number;
  decay?: number;
}
export interface SpotLight extends LightBase {
  type: 'spot';
  position: Vec3;
  direction: Vec3;
  angle?: number;
  penumbra?: number;
  distance?: number;
  decay?: number;
}
export interface RectangleLight extends LightBase {
  type: 'rect';
  position: Vec3;
  u: Vec3;
  v: Vec3;
}
export interface EmissiveLight {
  type: 'emissive';
  triangle: number;
  area: number;
}
export type BakeLight = DirectionalLight | PointLight | SpotLight | RectangleLight;
export type TransportLight = BakeLight | EmissiveLight;
export interface CoreScene {
  triangles: Triangle[];
  materials: DiffuseMaterial[];
  lights?: BakeLight[];
  environment?: Vec3;
  sourceMaterials?: Array<Material | null>;
}
export interface Bounds {
  min: Vec3;
  max: Vec3;
}
export interface BVHNode extends Bounds {
  first: number;
  count: number;
  escape: number;
}
export interface BVHData {
  nodes: BVHNode[];
  triangles: Triangle[];
  originalIndices: number[];
  bounds: Bounds;
}
export interface RayHit {
  distance: number;
  bary: Vec3;
  index: number;
}
export interface Surface {
  p: Vec3;
  n: Vec3;
  g: Vec3;
  triangle?: number;
  uv?: Vec2;
  material?: number;
  backface?: boolean;
}
export interface ProbeSurface {
  p: Vec3;
  n: null;
  g: null;
  triangle: number;
}
export interface AtlasRectangle {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: boolean;
}
export interface AtlasChart {
  id: number;
  triangles: number[];
  rect?: AtlasRectangle;
}
export interface AtlasData {
  triangles: AtlasTriangle[];
  chartCount: number;
  charts: AtlasChart[];
  mode: 'generate' | 'existing';
  padding: number;
  density?: number;
}
export interface GeometryBuffer {
  width: number;
  height: number;
  positions: Float32Array;
  normals: Float32Array;
  geometricNormals: Float32Array;
  albedo: Float32Array;
  coverage: Uint8Array;
  charts: Int32Array;
  triangleIds: Int32Array;
  covered: number;
  conservativeCharts: number;
}
export type BackendName = 'tsl' | 'webgpu' | 'cpu' | 'auto';
export type BakeState =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'baking'
  | 'paused'
  | 'complete'
  | 'resetting'
  | 'error'
  | 'disposed';
export interface BakeOptions {
  width?: number;
  height?: number;
  resolutionScale?: number;
  samples?: number;
  bounces?: number;
  padding?: number;
  uvMode?: 'auto' | 'generate' | 'existing';
  seed?: number;
  aoDistance?: number;
  rayBias?: number;
  maxRadiance?: number;
  tileSize?: number;
  minTileSize?: number;
  maxTileSize?: number;
  targetDispatchMs?: number;
  maxMemoryMB?: number;
  backend?: BackendName;
  renderer?: WebGPURenderer;
  device?: GPUDevice;
  backendFactory?: BackendFactory;
}
export interface ResolvedBakeOptions extends Required<
  Omit<BakeOptions, 'renderer' | 'device' | 'backendFactory'>
> {
  renderer?: WebGPURenderer;
  device?: GPUDevice;
  backendFactory?: BackendFactory;
  requestedWidth: number;
  requestedHeight: number;
}
export interface TransportScene {
  triangles: Triangle[];
  materials: DiffuseMaterial[];
  lights: TransportLight[];
  environment: Vec3;
  bvh: BVHData;
  options: ResolvedBakeOptions;
  sourceMaterials?: Array<Material | null>;
}
export interface PreparedScene extends TransportScene {
  triangles: AtlasTriangle[];
  atlas: AtlasData;
  gbuffer: GeometryBuffer;
}
/** Implement this interface to supply a renderer or compute backend. */
export interface BakeBackend {
  readonly name: string;
  init(scene: PreparedScene): Promise<void>;
  dispatch(start: number, count: number, sample: number): Promise<void>;
  read(): Promise<Float32Array>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}
export type BackendFactory = (options: ResolvedBakeOptions) => BakeBackend | Promise<BakeBackend>;
export interface BakeProgress {
  state: BakeState;
  samples: number;
  targetSamples: number;
  fraction: number;
  texelsInPass: number;
  tileSize: number;
  lastDispatchMs: number;
  dispatches: number;
}
export interface Dispatch {
  start: number;
  count: number;
  sample: number;
}
export interface DenoiseMetadata {
  type: string;
  [key: string]: unknown;
}
export interface BakeMetadata {
  backend: string;
  units: string;
  denoiser: DenoiseMetadata;
  [key: string]: unknown;
}
export interface BakeResult {
  width: number;
  height: number;
  samples: number;
  direct: Float32Array;
  indirect: Float32Array;
  ao: Float32Array;
  lightmap: Float32Array;
  positions: Float32Array;
  normals: Float32Array;
  geometricNormals: Float32Array;
  albedo: Float32Array;
  coverage: Uint8Array;
  charts: Int32Array;
  sampleCounts: Uint32Array;
  metadata: BakeMetadata;
}
export type DenoiseChannel = 'indirect' | 'ao';
export interface SpatialDenoiseOptions {
  type?: 'none' | 'atrous' | 'bilateral';
  channels?: DenoiseChannel[];
  iterations?: number;
  normalPower?: number;
  positionSigma?: number;
  colorSigma?: number;
  signal?: AbortSignal;
}
export interface Denoiser {
  readonly type: string;
  run(result: BakeResult, options?: { signal?: AbortSignal }): Promise<BakeResult>;
}
export interface OptixDenoiser extends Denoiser {
  type: 'optix';
}
export interface OptixServiceOptions {
  endpoint?: string;
  token: string;
  channels?: DenoiseChannel[];
}
export interface ResultOptions {
  denoise?: 'none' | 'atrous' | 'bilateral' | SpatialDenoiseOptions | Denoiser;
  padding?: boolean;
  signal?: AbortSignal;
}
export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BakeProgress) => void | Promise<void>;
}
export interface ProbeGridOptions {
  min: Vec3;
  max: Vec3;
  spacing?: number;
}
export interface ProbeGrid {
  min: Vec3;
  max: Vec3;
  dimensions: Vec3;
  positions: Vec3[];
}
export interface ProbeOptions {
  positions?: Vec3[];
  grid?: ProbeGridOptions;
  samples?: number;
  bounces?: number;
  seed?: number;
  signal?: AbortSignal;
  onProgress?: (p: { completed: number; total: number; fraction: number }) => void;
}
export interface Probe {
  position: Vec3;
  coefficients: number[];
}
export interface ProbeData {
  schema: 'three-lightmap-probes';
  version: 1;
  coefficientType: 'radiance';
  order: 2;
  basis: string;
  colorSpace: 'linear-srgb';
  samples: number;
  bounces: number;
  grid: Omit<ProbeGrid, 'positions'> | null;
  probes: Probe[];
}
export type BinaryInput = ArrayBuffer | ArrayBufferView;
export type PreviewChannel = 'lightmap' | 'direct' | 'indirect' | 'ao' | 'albedo' | 'normals';
export interface PreviewOptions {
  exposure?: number;
  toneMap?: 'reinhard' | 'none';
  transparent?: boolean;
}
export interface ZipEntry {
  name: string;
  data: string | BinaryInput;
}
export interface ModelImportOptions {
  format?: string;
  baseURL?: string;
  manager?: LoadingManager;
  configureLoader?: (
    loader:
      | import('three/addons/loaders/GLTFLoader.js').GLTFLoader
      | import('three/addons/loaders/OBJLoader.js').OBJLoader,
  ) => void;
}
export interface ModelFileOptions {
  entry?: string;
  configureLoader?: ModelImportOptions['configureLoader'];
}
export type LightmapTextures = Record<'lightmap' | 'direct' | 'indirect' | 'ao', DataTexture>;
export type SceneInput = CoreScene | Object3D;
export interface SceneAdapter<Input = SceneInput> {
  extract(input: Input, options?: { signal?: AbortSignal }): Promise<CoreScene>;
}
