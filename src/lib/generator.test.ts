import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { getMarkerCode, getMarkerMatrix, markerSvg } from './aruco';
import { generateModel } from './geometry';
import { generateStructureDocument, generateStructureJson, structureFilename } from './structureJson';
import { exportFilename, generate3mf, modelXml } from './threeMf';
import { generateStep, stepFilename } from './step';
import type { GeneratorConfig } from '../types';

const config: GeneratorConfig = {
  shape: 'tag',
  dictionary: 'DICT_4X4_50',
  markerId: 0,
  markerSize: 36,
  primitiveSize: 50,
  baseThickness: 2.4,
  inkDepth: 0.4,
  quietZoneModules: 1,
  faceCount: 1,
  nozzleDiameter: 0.4,
  layerHeight: 0.2,
};

function expectClosedTriangleShells(positions: number[], indices: number[]) {
  expect(positions.length % 3).toBe(0);
  expect(indices.length % 3).toBe(0);
  const edges = new Map<string, number>();
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [indices[index], indices[index + 1], indices[index + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const pair = [triangle[edge], triangle[(edge + 1) % 3]].sort((a, b) => a - b);
      const key = `${pair[0]}:${pair[1]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  expect([...edges.values()].every((count) => count === 2)).toBe(true);
}

describe('OpenCV ArUco dictionaries', () => {
  it('decodes the canonical first 4×4 marker', () => {
    expect(getMarkerCode('DICT_4X4_50', 0)).toBe('1011010100110010');
    expect(getMarkerMatrix('DICT_4X4_50', 0)).toEqual([
      [true, true, true, true, true, true],
      [true, false, true, false, false, true],
      [true, true, false, true, false, true],
      [true, true, true, false, false, true],
      [true, true, true, false, true, true],
      [true, true, true, true, true, true],
    ]);
  });

  it('includes a quiet zone in the SVG reference', () => {
    const svg = markerSvg('DICT_5X5_50', 12, 1);
    expect(svg).toContain('viewBox="0 0 9 9"');
    expect(svg).toContain('fill="#fff"');
  });
});

describe('print geometry', () => {
  it('generates two closed mesh bodies with exact flush plaque dimensions', () => {
    const model = generateModel(config);
    expect(model.modulePitch).toBe(6);
    expect(model.totalTagSpan).toBe(48);
    expect(model.dimensions).toEqual([48, 48, 2.4]);
    expect(model.base.indices.length % 3).toBe(0);
    expect(model.ink.indices.length % 3).toBe(0);
    expect(model.base.positions.length).toBeGreaterThan(0);
    expect(model.ink.positions.length).toBeGreaterThan(0);
    expect(model.valid).toBe(true);
  });

  it('wraps sequential IDs for multi-face cubes', () => {
    const model = generateModel({ ...config, shape: 'cube', markerId: 48, faceCount: 3 });
    expect(model.faceIds).toEqual([48, 49, 0]);
  });

  it('lays a supplied flat-tag ID list out as a printable grid', () => {
    const model = generateModel({ ...config, markerIds: [3, 8, 21, 34, 49] });
    expect(model.faceIds).toEqual([3, 8, 21, 34, 49]);
    expect(model.markerPlacements.map((placement) => placement.name)).toEqual(['Tag 1', 'Tag 2', 'Tag 3', 'Tag 4', 'Tag 5']);
    expect(model.dimensions[0]).toBeGreaterThan(model.totalTagSpan * 2);
    expect(model.dimensions[1]).toBeGreaterThan(model.totalTagSpan);
    expectClosedTriangleShells(model.base.positions, model.base.indices);
    expectClosedTriangleShells(model.ink.positions, model.ink.indices);
  });

  it('inlays a six-face cube on the build plate without negative Z geometry', () => {
    const model = generateModel({ ...config, shape: 'cube', markerId: 2, faceCount: 6 });
    const baseZ = model.base.positions.filter((_, index) => index % 3 === 2);
    const inkZ = model.ink.positions.filter((_, index) => index % 3 === 2);
    expect(Math.min(...baseZ)).toBeCloseTo(0, 8);
    expect(Math.min(...inkZ)).toBeCloseTo(0, 8);
    expect(model.faceIds).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('supports a five-face cube with an untagged bottom', () => {
    const model = generateModel({ ...config, shape: 'cube', markerId: 10, faceCount: 5 });
    expect(model.faceIds).toEqual([10, 11, 12, 13, 14]);
    expect(model.markerPlacements.map((placement) => placement.name)).toEqual(['Top', 'Front', 'Right', 'Back', 'Left']);
    expect(model.markerPlacements.some((placement) => placement.name === 'Bottom')).toBe(false);
    expect(model.valid).toBe(true);
    expectClosedTriangleShells(model.base.positions, model.base.indices);
    expectClosedTriangleShells(model.ink.positions, model.ink.indices);
  });

  it('raises visible black marker modules above the white support surface', () => {
    const tag = generateModel(config);
    const cube = generateModel({ ...config, shape: 'cube', faceCount: 6 });
    const cylinder = generateModel({ ...config, shape: 'cylinder', markerSize: 28, primitiveSize: 60 });
    const axisValues = (positions: number[], axis: 0 | 1 | 2) => positions.filter((_, index) => index % 3 === axis);

    expect(Math.max(...axisValues(tag.base.positions, 2))).toBeCloseTo(2.4, 8);
    expect(Math.max(...axisValues(tag.ink.positions, 2))).toBeCloseTo(2.8, 8);

    expect(Math.min(...axisValues(cube.base.positions, 2))).toBeCloseTo(0, 8);
    expect(Math.min(...axisValues(cube.ink.positions, 2))).toBeCloseTo(0, 8);
    expect(Math.max(...axisValues(cube.base.positions, 2))).toBeCloseTo(50, 8);
    expect(Math.max(...axisValues(cube.ink.positions, 2))).toBeCloseTo(50.4, 8);

    expect(Math.max(...axisValues(cylinder.base.positions, 2))).toBeCloseTo(60, 8);
    expect(Math.max(...axisValues(cylinder.ink.positions, 2))).toBeCloseTo(60.4, 8);
  });

  it('keeps every exported mesh shell closed across all host types', () => {
    const models = [
      generateModel(config),
      generateModel({ ...config, shape: 'cube', faceCount: 6 }),
      generateModel({ ...config, shape: 'cylinder', markerSize: 28, primitiveSize: 60 }),
    ];
    models.forEach((model) => {
      expectClosedTriangleShells(model.base.positions, model.base.indices);
      expectClosedTriangleShells(model.ink.positions, model.ink.indices);
    });
  });

  it.each([
    ['tetrahedron', 4, 100, 18],
    ['cube', 6, 50, 24],
    ['octahedron', 8, 80, 12],
    ['dodecahedron', 12, 80, 16],
    ['icosahedron', 20, 80, 10],
  ] as const)('generates a tagged regular %s with the expected %i faces', (shape, faceCount, primitiveSize, markerSize) => {
    const solidConfig: GeneratorConfig = { ...config, shape, faceCount: 6, primitiveSize, markerSize };
    const model = generateModel(solidConfig);
    expect(model.markerPlacements).toHaveLength(faceCount);
    expect(model.faceIds).toEqual(Array.from({ length: faceCount }, (_, index) => index % 50));
    expect(Math.min(...model.base.positions.filter((_, index) => index % 3 === 2))).toBeCloseTo(0, 6);
    expect(model.valid).toBe(true);
    expectClosedTriangleShells(model.base.positions, model.base.indices);
    expectClosedTriangleShells(model.ink.positions, model.ink.indices);
  });

  it('blocks export geometry without the required quiet zone', () => {
    const model = generateModel({ ...config, quietZoneModules: 0 });
    expect(model.valid).toBe(false);
    expect(model.checks.find((check) => check.label === 'Quiet zone')?.status).toBe('fail');
  });
});

describe('dual-color 3MF export', () => {
  it('writes a single assembly with two named material objects', () => {
    const model = generateModel(config);
    const xml = modelXml(model, config);
    expect(xml).toContain('<basematerials id="1">');
    expect(xml).toContain('name="Base — White"');
    expect(xml).toContain('name="ArUco Ink — Black"');
    expect(xml).toContain('<components><component objectid="2"/><component objectid="3"/></components>');
    expect(xml).toContain('<build><item objectid="4"/></build>');
  });

  it('packages all required 3MF OPC entries and metadata', () => {
    const model = generateModel(config);
    const archive = unzipSync(generate3mf(model, config));
    expect(Object.keys(archive).sort()).toEqual([
      '3D/3dmodel.model',
      'Metadata/aruco-studio.json',
      '[Content_Types].xml',
      '_rels/.rels',
    ]);
    expect(strFromU8(archive['3D/3dmodel.model'])).toContain('unit="millimeter"');
    expect(JSON.parse(strFromU8(archive['Metadata/aruco-studio.json']))).toMatchObject({
      dictionary: 'DICT_4X4_50',
      markerIds: [0],
      materialParts: ['Base — White', 'ArUco Ink — Black'],
    });
    expect(exportFilename(config)).toBe('aruco-4x4_50-id0-tag.3mf');
  });
});

describe('faceted STEP export', () => {
  it('writes closed faceted B-reps for both named material bodies', () => {
    const model = generateModel(config);
    const step = generateStep(model, config);
    expect(step).toContain("FILE_SCHEMA(('AUTOMOTIVE_DESIGN'))");
    expect(step).toContain('MANIFOLD_SOLID_BREP');
    expect(step).toContain('ADVANCED_FACE');
    expect(step).toContain('EDGE_LOOP');
    expect(step).toContain('ADVANCED_BREP_SHAPE_REPRESENTATION');
    expect(step).toContain('CLOSED_SHELL');
    expect(step).toContain('Base - White');
    expect(step).toContain('ArUco Ink - Black');
    expect(step).toContain('SHAPE_DEFINITION_REPRESENTATION');
    expect(step.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
    expect(stepFilename(config)).toBe('aruco-4x4_50-id0-tag.step');
  });
});

describe('spatial reconstruction JSON', () => {
  it('exports every cube marker with self-contained encoding and face pose', () => {
    const cubeConfig: GeneratorConfig = { ...config, shape: 'cube', faceCount: 6, markerId: 7 };
    const model = generateModel(cubeConfig);
    const document = generateStructureDocument(model, cubeConfig);

    expect(document.schema).toBe('vitrus.aruco-structure');
    expect(document.structure.host).toMatchObject({ type: 'cube', parameters: { sideLengthMm: 50, taggedFaceCount: 6 } });
    expect(document.markers).toHaveLength(6);
    expect(document.markers.map((marker) => marker.face)).toEqual(['top', 'front', 'right', 'back', 'left', 'bottom']);
    expect(document.markers[0]).toMatchObject({
      id: 7,
      lookupKey: 'DICT_4X4_50:7',
      poseInObject: { centerMm: [0, 0, 50], outwardNormal: [0, 0, 1] },
    });
    expect(document.markers[0].encoding.matrixRows).toHaveLength(6);
    expect(document.markers[0].encoding.matrixRows.every((row) => row.length === 6)).toBe(true);
    expect(document.markers[5].poseInObject).toMatchObject({ centerMm: [0, 0, 0], outwardNormal: [0, 0, -1] });
  });

  it('provides mutually inverse marker/object transforms', () => {
    const cubeConfig: GeneratorConfig = { ...config, shape: 'cube', faceCount: 6 };
    const marker = generateStructureDocument(generateModel(cubeConfig), cubeConfig).markers[2];
    const forward = marker.poseInObject.objectFromMarkerMatrix;
    const inverse = marker.poseInObject.markerFromObjectMatrix;
    const product = Array.from({ length: 16 }, (_, cell) => {
      const row = Math.floor(cell / 4);
      const column = cell % 4;
      return Array.from({ length: 4 }, (_, inner) => forward[row * 4 + inner] * inverse[inner * 4 + column]).reduce((sum, value) => sum + value, 0);
    });
    expect(product).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('serializes a stable reconstruction file', () => {
    const cubeConfig: GeneratorConfig = { ...config, shape: 'cube', faceCount: 6 };
    const model = generateModel(cubeConfig);
    const parsed = JSON.parse(generateStructureJson(model, cubeConfig));
    expect(parsed.recognition.poseRecovery).toContain('worldFromObject');
    expect(parsed.coordinateSystem.matrixStorage).toBe('row-major');
    expect(structureFilename(cubeConfig)).toBe('aruco-4x4_50-id0-cube-6face.structure.json');
  });
});
