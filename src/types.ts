export type PlatonicKind = 'tetrahedron' | 'octahedron' | 'dodecahedron' | 'icosahedron';
export type ShapeKind = 'tag' | 'cube' | 'cylinder' | PlatonicKind;
export type FaceCount = 1 | 3 | 5 | 6;
export type MaterialKey = 'white' | 'black';

export type GeneratorConfig = {
  shape: ShapeKind;
  dictionary: DictionaryKey;
  markerId: number;
  /** Flat-tag grid IDs. Omit for a single tag using markerId. */
  markerIds?: number[];
  markerSize: number;
  primitiveSize: number;
  baseThickness: number;
  inkDepth: number;
  quietZoneModules: number;
  faceCount: FaceCount;
  nozzleDiameter: number;
  layerHeight: number;
};

export type DictionaryKey =
  | 'DICT_4X4_50'
  | 'DICT_4X4_100'
  | 'DICT_4X4_250'
  | 'DICT_5X5_50'
  | 'DICT_5X5_100'
  | 'DICT_5X5_250'
  | 'DICT_6X6_50'
  | 'DICT_6X6_100'
  | 'DICT_6X6_250'
  | 'DICT_7X7_50';

export type DictionaryInfo = {
  key: DictionaryKey;
  label: string;
  family: '4×4' | '5×5' | '6×6' | '7×7';
  dataBits: number;
  count: number;
  source: string;
};

export type MeshData = {
  name: string;
  material: MaterialKey;
  positions: number[];
  indices: number[];
};

export type Vec3 = readonly [number, number, number];

export type FacePlacement = {
  name: string;
  center: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
  markerId: number;
};

export type PrintCheck = {
  label: string;
  detail: string;
  status: 'pass' | 'warn' | 'fail';
};

export type GeneratedModel = {
  base: MeshData;
  ink: MeshData;
  dimensions: Vec3;
  modulePitch: number;
  totalTagSpan: number;
  faceIds: number[];
  markerPlacements: FacePlacement[];
  triangles: number;
  checks: PrintCheck[];
  valid: boolean;
};
