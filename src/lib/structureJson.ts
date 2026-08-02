import { getDictionaryInfo, getMarkerCode, getMarkerMatrix } from './aruco';
import { exportFilename } from './threeMf';
import type { FacePlacement, GeneratedModel, GeneratorConfig, Vec3 } from '../types';

type Matrix4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (value: Vec3, amount: number): Vec3 => [value[0] * amount, value[1] * amount, value[2] * amount];

function objectFromMarker(placement: FacePlacement): Matrix4 {
  const { u, v, normal, center } = placement;
  return [
    u[0], v[0], normal[0], center[0],
    u[1], v[1], normal[1], center[1],
    u[2], v[2], normal[2], center[2],
    0, 0, 0, 1,
  ];
}

function markerFromObject(placement: FacePlacement): Matrix4 {
  const { u, v, normal, center } = placement;
  return [
    u[0], u[1], u[2], -dot(u, center),
    v[0], v[1], v[2], -dot(v, center),
    normal[0], normal[1], normal[2], -dot(normal, center),
    0, 0, 0, 1,
  ];
}

function corners(placement: FacePlacement, span: number) {
  const half = span / 2;
  const { center, u, v } = placement;
  return {
    topLeft: add(add(center, scale(u, -half)), scale(v, half)),
    topRight: add(add(center, scale(u, half)), scale(v, half)),
    bottomRight: add(add(center, scale(u, half)), scale(v, -half)),
    bottomLeft: add(add(center, scale(u, -half)), scale(v, -half)),
  };
}

function hostDescription(model: GeneratedModel, config: GeneratorConfig) {
  if (config.shape === 'tag') {
    return {
      type: model.markerPlacements.length > 1 ? 'tag_grid' : 'rectangular_prism',
      dimensionsMm: { width: model.dimensions[0], depth: model.dimensions[1], height: model.dimensions[2] },
      parameters: { baseThicknessMm: config.baseThickness, tagCount: model.markerPlacements.length, layout: model.markerPlacements.length > 1 ? 'row_major_grid' : 'single' },
    };
  }
  if (config.shape === 'cube') {
    return {
      type: 'cube',
      dimensionsMm: { width: model.dimensions[0], depth: model.dimensions[1], height: model.dimensions[2] },
      parameters: { sideLengthMm: config.primitiveSize, taggedFaceCount: config.faceCount },
    };
  }
  if (config.shape === 'cylinder') {
    return {
      type: 'cylinder',
      dimensionsMm: { diameter: config.primitiveSize, height: model.dimensions[2] },
      parameters: { diameterMm: config.primitiveSize, heightMm: config.primitiveSize },
    };
  }
  return {
    type: config.shape,
    dimensionsMm: { width: model.dimensions[0], depth: model.dimensions[1], height: model.dimensions[2] },
    parameters: {
      circumscribedDiameterMm: config.primitiveSize,
      taggedFaceCount: model.markerPlacements.length,
      regular: true,
    },
  };
}

export function generateStructureDocument(model: GeneratedModel, config: GeneratorConfig) {
  const dictionary = getDictionaryInfo(config.dictionary);
  return {
    schema: 'vitrus.aruco-structure',
    schemaVersion: '1.0.0',
    generator: { name: 'Vitrus ArUco 3D Studio', version: '0.1.0' },
    units: 'millimeter',
    coordinateSystem: {
      handedness: 'right',
      axes: { x: 'right', y: 'back', z: 'up' },
      origin: 'center of host footprint on the build plate',
      markerFrame: {
        origin: 'center of the outer black border on the finished surface',
        x: 'marker image right',
        y: 'marker image up',
        z: 'outward surface normal',
      },
      matrixStorage: 'row-major',
    },
    structure: {
      name: `${config.shape}-${config.dictionary.toLowerCase()}-${model.faceIds.join('-')}`,
      host: hostDescription(model, config),
      construction: {
        surface: 'raised_relief',
        reliefHeightMm: config.inkDepth,
        bodies: [
          { id: 'base', name: 'Base — White', color: '#F4F2EA', materialRole: 'host' },
          { id: 'aruco_ink', name: 'ArUco Ink — Black', color: '#171717', materialRole: 'fiducial' },
        ],
      },
      meshSummary: {
        triangleCount: model.triangles,
        bodyCount: 2,
        source3mfFilename: exportFilename(config),
      },
    },
    dictionary: {
      name: config.dictionary,
      family: dictionary.family,
      dataGridSize: dictionary.dataBits,
      borderBits: 1,
      availableIds: dictionary.count,
      bitConvention: '1=black, 0=white',
    },
    markers: model.markerPlacements.map((placement, index) => ({
      instance: index,
      lookupKey: `${config.dictionary}:${placement.markerId}`,
      id: placement.markerId,
      face: placement.name.toLowerCase(),
      dictionary: config.dictionary,
      physical: {
        markerSizeMm: config.markerSize,
        markerSizeConvention: 'outer edge of black border; quiet zone excluded',
        quietZoneModules: config.quietZoneModules,
        totalTagSpanMm: model.totalTagSpan,
        modulePitchMm: model.modulePitch,
        inlayDepthMm: config.inkDepth,
      },
      encoding: {
        dataCodeBits: getMarkerCode(config.dictionary, placement.markerId),
        matrixRows: getMarkerMatrix(config.dictionary, placement.markerId).map((row) => row.map((black) => black ? '1' : '0').join('')),
      },
      poseInObject: {
        centerMm: placement.center,
        xAxis: placement.u,
        yAxis: placement.v,
        outwardNormal: placement.normal,
        objectFromMarkerMatrix: objectFromMarker(placement),
        markerFromObjectMatrix: markerFromObject(placement),
        markerCornersMm: corners(placement, config.markerSize),
        quietZoneCornersMm: corners(placement, model.totalTagSpan),
      },
    })),
    recognition: {
      poseRecovery: 'If a detector returns worldFromMarker, compute worldFromObject = worldFromMarker × markerFromObjectMatrix.',
      sizeForPoseEstimationMm: config.markerSize,
      identityFields: ['dictionary', 'id'],
      multipleMarkerFusion: 'Use all visible marker instances and their poseInObject transforms in a robust multi-view pose solver.',
    },
    printProfile: {
      nozzleDiameterMm: config.nozzleDiameter,
      layerHeightMm: config.layerHeight,
      materialCount: 2,
    },
  } as const;
}

export function generateStructureJson(model: GeneratedModel, config: GeneratorConfig) {
  return `${JSON.stringify(generateStructureDocument(model, config), null, 2)}\n`;
}

export function structureFilename(config: GeneratorConfig) {
  return exportFilename(config).replace(/\.3mf$/i, '.structure.json');
}
