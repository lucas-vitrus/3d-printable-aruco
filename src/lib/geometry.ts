import {
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  ShapeUtils,
  TetrahedronGeometry,
  Vector2,
} from 'three';
import { getDictionaryInfo, getMarkerMatrix } from './aruco';
import type { FacePlacement, GeneratedModel, GeneratorConfig, MeshData, PlatonicKind, Vec3 } from '../types';

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v: Vec3, amount: number): Vec3 => [v[0] * amount, v[1] * amount, v[2] * amount];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (value: Vec3): Vec3 => {
  const length = Math.hypot(...value);
  return length > 0 ? scale(value, 1 / length) : [0, 0, 0];
};

type PolygonFace = {
  center: Vec3;
  normal: Vec3;
  u: Vec3;
  v: Vec3;
  vertices: Vec3[];
  localVertices: Array<readonly [number, number]>;
};

const pointKey = (point: Vec3) => point.map((value) => value.toFixed(6)).join(',');

function platonicGeometry(kind: PlatonicKind, radius: number) {
  if (kind === 'tetrahedron') return new TetrahedronGeometry(radius, 0);
  if (kind === 'octahedron') return new OctahedronGeometry(radius, 0);
  if (kind === 'dodecahedron') return new DodecahedronGeometry(radius, 0);
  return new IcosahedronGeometry(radius, 0);
}

function extractPlatonicFaces(kind: PlatonicKind, diameter: number): { faces: PolygonFace[]; center: Vec3; dimensions: Vec3; inradius: number } {
  const source = platonicGeometry(kind, diameter / 2);
  const geometry = source.index ? source.toNonIndexed() : source;
  const attribute = geometry.getAttribute('position');
  const groups: Array<{ normal: Vec3; plane: number; vertices: Map<string, Vec3> }> = [];

  for (let index = 0; index < attribute.count; index += 3) {
    const points = [0, 1, 2].map((offset) => [
      attribute.getX(index + offset),
      attribute.getY(index + offset),
      attribute.getZ(index + offset),
    ] as Vec3);
    let normal = normalize(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
    const triangleCenter = scale(add(add(points[0], points[1]), points[2]), 1 / 3);
    if (dot(normal, triangleCenter) < 0) normal = scale(normal, -1);
    const plane = dot(normal, points[0]);
    let group = groups.find((candidate) => dot(candidate.normal, normal) > 1 - 1e-5 && Math.abs(candidate.plane - plane) < 1e-4);
    if (!group) {
      group = { normal, plane, vertices: new Map<string, Vec3>() };
      groups.push(group);
    }
    points.forEach((point) => group.vertices.set(pointKey(point), point));
  }
  geometry.dispose();
  if (geometry !== source) source.dispose();

  const rawFaces = groups.map(({ normal, vertices }) => {
    const points = [...vertices.values()];
    const center = scale(points.reduce<Vec3>((sum, point) => add(sum, point), [0, 0, 0]), 1 / points.length);
    const reference: Vec3 = Math.abs(normal[0]) < 0.85 ? [1, 0, 0] : [0, 1, 0];
    const u = normalize(subtract(reference, scale(normal, dot(reference, normal))));
    const v = normalize(cross(normal, u));
    const sorted = points.sort((a, b) => {
      const da = subtract(a, center);
      const db = subtract(b, center);
      return Math.atan2(dot(da, v), dot(da, u)) - Math.atan2(dot(db, v), dot(db, u));
    });
    return { center, normal, u, v, vertices: sorted };
  });

  const allVertices = rawFaces.flatMap((face) => face.vertices);
  const minimum: Vec3 = [
    Math.min(...allVertices.map((point) => point[0])),
    Math.min(...allVertices.map((point) => point[1])),
    Math.min(...allVertices.map((point) => point[2])),
  ];
  const maximum: Vec3 = [
    Math.max(...allVertices.map((point) => point[0])),
    Math.max(...allVertices.map((point) => point[1])),
    Math.max(...allVertices.map((point) => point[2])),
  ];
  const zShift = -minimum[2];
  const solidCenter: Vec3 = [0, 0, zShift];
  const faces = rawFaces
    .map((face) => {
      const center = add(face.center, [0, 0, zShift]);
      const vertices = face.vertices.map((point) => add(point, [0, 0, zShift]));
      const localVertices = vertices.map((point) => {
        const delta = subtract(point, center);
        return [dot(delta, face.u), dot(delta, face.v)] as const;
      });
      return { ...face, center, vertices, localVertices };
    })
    .sort((a, b) => b.center[2] - a.center[2] || a.center[1] - b.center[1] || a.center[0] - b.center[0]);

  return {
    faces,
    center: solidCenter,
    dimensions: [maximum[0] - minimum[0], maximum[1] - minimum[1], maximum[2] - minimum[2]],
    inradius: dot(rawFaces[0].normal, rawFaces[0].center),
  };
}

function createMesh(name: string, material: MeshData['material']): MeshData {
  return { name, material, positions: [], indices: [] };
}

function appendVertex(mesh: MeshData, point: Vec3): number {
  const index = mesh.positions.length / 3;
  mesh.positions.push(...point.map((value) => Math.abs(value) < 1e-6 ? 0 : value));
  return index;
}

function appendOrientedBox(
  mesh: MeshData,
  center: Vec3,
  u: Vec3,
  v: Vec3,
  normal: Vec3,
  width: number,
  height: number,
  depth: number,
) {
  const halfU = scale(u, width / 2);
  const halfV = scale(v, height / 2);
  const frontOffset = scale(normal, depth);
  const back: Vec3[] = [
    add(add(center, scale(halfU, -1)), scale(halfV, -1)),
    add(add(center, halfU), scale(halfV, -1)),
    add(add(center, halfU), halfV),
    add(add(center, scale(halfU, -1)), halfV),
  ];
  const points = [...back, ...back.map((point) => add(point, frontOffset))];
  const start = mesh.positions.length / 3;
  points.forEach((point) => appendVertex(mesh, point));
  const faces = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ];
  mesh.indices.push(...faces.map((index) => index + start));
}

function appendAxisBox(mesh: MeshData, width: number, depth: number, height: number, z = 0) {
  appendOrientedBox(mesh, [0, 0, z], [1, 0, 0], [0, 1, 0], [0, 0, 1], width, depth, height);
}

function appendBoundsBox(mesh: MeshData, xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number) {
  appendOrientedBox(
    mesh,
    [(xMin + xMax) / 2, (yMin + yMax) / 2, zMin],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    xMax - xMin,
    yMax - yMin,
    zMax - zMin,
  );
}

function appendCylinder(mesh: MeshData, radius: number, height: number, segments = 64) {
  const bottomCenter = appendVertex(mesh, [0, 0, 0]);
  const topCenter = appendVertex(mesh, [0, 0, height]);
  const bottom: number[] = [];
  const top: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    bottom.push(appendVertex(mesh, [x, y, 0]));
    top.push(appendVertex(mesh, [x, y, height]));
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    mesh.indices.push(bottomCenter, bottom[next], bottom[index]);
    mesh.indices.push(topCenter, top[index], top[next]);
    mesh.indices.push(bottom[index], bottom[next], top[next], bottom[index], top[next], top[index]);
  }
}

function appendExtrudedRegion(
  mesh: MeshData,
  contour: Array<readonly [number, number]>,
  holes: Array<Array<readonly [number, number]>>,
  zBack: number,
  zFront: number,
) {
  const contour2d = contour.map(([x, y]) => new Vector2(x, y));
  const holes2d = holes.map((hole) => hole.map(([x, y]) => new Vector2(x, y)));
  const flattened = [...contour, ...holes.flat()];
  const back = flattened.map(([x, y]) => appendVertex(mesh, [x, y, zBack]));
  const front = flattened.map(([x, y]) => appendVertex(mesh, [x, y, zFront]));

  ShapeUtils.triangulateShape(contour2d, holes2d).forEach(([a, b, c]) => {
    mesh.indices.push(back[c], back[b], back[a]);
    mesh.indices.push(front[a], front[b], front[c]);
  });

  let offset = 0;
  [contour, ...holes].forEach((loop) => {
    for (let index = 0; index < loop.length; index += 1) {
      const next = (index + 1) % loop.length;
      const a = offset + index;
      const b = offset + next;
      mesh.indices.push(back[a], back[b], front[b], back[a], front[b], front[a]);
    }
    offset += loop.length;
  });
}

function appendTriangularFrustum(mesh: MeshData, outer: readonly [Vec3, Vec3, Vec3], inner: readonly [Vec3, Vec3, Vec3]) {
  const start = mesh.positions.length / 3;
  [...inner, ...outer].forEach((point) => appendVertex(mesh, point));
  mesh.indices.push(
    start, start + 2, start + 1,
    start + 3, start + 4, start + 5,
    start, start + 1, start + 4, start, start + 4, start + 3,
    start + 1, start + 2, start + 5, start + 1, start + 5, start + 4,
    start + 2, start, start + 3, start + 2, start + 3, start + 5,
  );
}

function pointInConvexPolygon(point: readonly [number, number], polygon: Array<readonly [number, number]>) {
  return polygon.every((vertex, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return (next[0] - vertex[0]) * (point[1] - vertex[1]) - (next[1] - vertex[1]) * (point[0] - vertex[0]) >= -1e-6;
  });
}

function appendPlatonicRegion(
  mesh: MeshData,
  face: PolygonFace,
  contour: Array<readonly [number, number]>,
  holes: Array<Array<readonly [number, number]>>,
  solidCenter: Vec3,
  innerScale: number,
) {
  const coordinates = [...contour, ...holes.flat()];
  const outer = coordinates.map(([x, y]) => add(add(face.center, scale(face.u, x)), scale(face.v, y)));
  const inner = outer.map((point) => add(solidCenter, scale(subtract(point, solidCenter), innerScale)));
  ShapeUtils.triangulateShape(
    contour.map(([x, y]) => new Vector2(x, y)),
    holes.map((hole) => hole.map(([x, y]) => new Vector2(x, y))),
  ).forEach(([a, b, c]) => appendTriangularFrustum(mesh, [outer[a], outer[b], outer[c]], [inner[a], inner[b], inner[c]]));
}

function appendRaisedPlatonicRegion(
  mesh: MeshData,
  face: PolygonFace,
  contour: Array<readonly [number, number]>,
  height: number,
) {
  const lower = contour.map(([x, y]) => add(add(face.center, scale(face.u, x)), scale(face.v, y)));
  const upper = lower.map((point) => add(point, scale(face.normal, height)));
  for (let index = 1; index < contour.length - 1; index += 1) {
    appendTriangularFrustum(mesh, [upper[0], upper[index], upper[index + 1]], [lower[0], lower[index], lower[index + 1]]);
  }
}

function appendPlatonicCore(mesh: MeshData, faces: PolygonFace[], solidCenter: Vec3, innerScale: number) {
  const vertices = new Map<string, number>();
  const vertexIndex = (point: Vec3) => {
    const inner = add(solidCenter, scale(subtract(point, solidCenter), innerScale));
    const key = pointKey(inner);
    const existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const created = appendVertex(mesh, inner);
    vertices.set(key, created);
    return created;
  };
  faces.forEach((face) => {
    const first = vertexIndex(face.vertices[0]);
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      mesh.indices.push(first, vertexIndex(face.vertices[index]), vertexIndex(face.vertices[index + 1]));
    }
  });
}

function appendPlatonicFace(
  base: MeshData,
  ink: MeshData,
  face: PolygonFace,
  placement: FacePlacement,
  config: GeneratorConfig,
  solidCenter: Vec3,
  innerScale: number,
) {
  const matrix = getMarkerMatrix(config.dictionary, placement.markerId);
  const pitch = config.markerSize / matrix.length;
  const markerHalf = config.markerSize / 2;
  const totalHalf = markerHalf + config.quietZoneModules * pitch;
  const square: Array<readonly [number, number]> = [
    [-totalHalf, -totalHalf], [-totalHalf, totalHalf], [totalHalf, totalHalf], [totalHalf, -totalHalf],
  ];
  appendPlatonicRegion(base, face, face.localVertices, [square], solidCenter, innerScale);

  const whiteRect = (u0: number, u1: number, v0: number, v1: number) => appendPlatonicRegion(
    base, face, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [], solidCenter, innerScale,
  );
  whiteRect(-totalHalf, -markerHalf, -totalHalf, totalHalf);
  whiteRect(markerHalf, totalHalf, -totalHalf, totalHalf);
  whiteRect(-markerHalf, markerHalf, -totalHalf, -markerHalf);
  whiteRect(-markerHalf, markerHalf, markerHalf, totalHalf);

  matrix.forEach((row, rowIndex) => {
    let runStart = 0;
    while (runStart < row.length) {
      const black = row[runStart];
      let runEnd = runStart + 1;
      while (runEnd < row.length && row[runEnd] === black) runEnd += 1;
      const u0 = (runStart - matrix.length / 2) * pitch;
      const u1 = (runEnd - matrix.length / 2) * pitch;
      const v1 = (matrix.length / 2 - rowIndex) * pitch;
      const v0 = v1 - pitch;
      const cell: Array<readonly [number, number]> = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      if (black) {
        appendPlatonicRegion(base, face, cell, [], solidCenter, innerScale);
        appendRaisedPlatonicRegion(ink, face, cell, config.inkDepth);
      } else {
        appendPlatonicRegion(base, face, cell, [], solidCenter, innerScale);
      }
      runStart = runEnd;
    }
  });
}

function appendPlatonic(base: MeshData, ink: MeshData, kind: PlatonicKind, config: GeneratorConfig, maximumId: number) {
  const solid = extractPlatonicFaces(kind, config.primitiveSize);
  const innerScale = Math.max(0.01, (solid.inradius - config.inkDepth) / solid.inradius);
  appendPlatonicCore(base, solid.faces, solid.center, innerScale);
  const placements: FacePlacement[] = solid.faces.map((face, index) => ({
    name: `Face ${index + 1}`,
    center: face.center,
    u: face.u,
    v: face.v,
    normal: face.normal,
    markerId: (config.markerId + index) % maximumId,
  }));
  const totalHalf = (config.markerSize / 2) * (1 + (2 * config.quietZoneModules) / getMarkerMatrix(config.dictionary, config.markerId).length);
  const tagCorners: Array<readonly [number, number]> = [
    [-totalHalf, -totalHalf], [totalHalf, -totalHalf], [totalHalf, totalHalf], [-totalHalf, totalHalf],
  ];
  const tagFits = solid.faces.every((face) => tagCorners.every((corner) => pointInConvexPolygon(corner, face.localVertices)));
  if (tagFits && config.inkDepth < solid.inradius) {
    solid.faces.forEach((face, index) => appendPlatonicFace(base, ink, face, placements[index], config, solid.center, innerScale));
  }
  return { ...solid, placements, tagFits: tagFits && config.inkDepth < solid.inradius };
}

/** Tiles a complete face layer so white and black bodies terminate on one plane. */
function appendTiledFaceLayer(
  base: MeshData,
  ink: MeshData,
  placement: FacePlacement,
  config: GeneratorConfig,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number,
) {
  const matrix = getMarkerMatrix(config.dictionary, placement.markerId);
  const pitch = config.markerSize / matrix.length;
  const half = (matrix.length - 1) / 2;
  const tagHalf = config.markerSize / 2;
  const supportBackCenter = add(placement.center, scale(placement.normal, -config.inkDepth));
  const bridgeEmbed = 0.01;

  const appendSupportBox = (mesh: MeshData, localUMin: number, localUMax: number, localVMin: number, localVMax: number) => {
    if (localUMax - localUMin <= 1e-8 || localVMax - localVMin <= 1e-8) return;
    const center = add(
      add(supportBackCenter, scale(placement.u, (localUMin + localUMax) / 2)),
      scale(placement.v, (localVMin + localVMax) / 2),
    );
    appendOrientedBox(
      mesh,
      center,
      placement.u,
      placement.v,
      placement.normal,
      localUMax - localUMin,
      localVMax - localVMin,
      config.inkDepth,
    );
  };
  const appendRaisedBox = (localUMin: number, localUMax: number, localVMin: number, localVMax: number) => {
    if (localUMax - localUMin <= 1e-8 || localVMax - localVMin <= 1e-8) return;
    const center = add(
      add(add(placement.center, scale(placement.normal, -bridgeEmbed)), scale(placement.u, (localUMin + localUMax) / 2)),
      scale(placement.v, (localVMin + localVMax) / 2),
    );
    appendOrientedBox(ink, center, placement.u, placement.v, placement.normal, localUMax - localUMin, localVMax - localVMin, config.inkDepth + bridgeEmbed);
  };
  const isBuildPlateFace = placement.normal[2] < -0.999;

  // Build a continuous white support plane, then raise only the black code
  // modules. The separation makes bucket painting unambiguous in slicers.
  appendSupportBox(base, uMin, uMax, vMin, vMax);

  // Keep all black cells on a face as one slicer/painting island. The bridge
  // stays inside the white support, below the finished white surface.
  appendOrientedBox(
    ink,
    add(placement.center, scale(placement.normal, -(0.04 + bridgeEmbed))),
    placement.u,
    placement.v,
    placement.normal,
    config.markerSize,
    config.markerSize,
    0.04,
  );

  matrix.forEach((row, rowIndex) => {
    let runStart = 0;
    while (runStart < row.length) {
      const black = row[runStart];
      let runEnd = runStart + 1;
      while (runEnd < row.length && row[runEnd] === black) runEnd += 1;
      const uStart = (runStart - matrix.length / 2) * pitch;
      const uEnd = (runEnd - matrix.length / 2) * pitch;
      const vTop = (half - rowIndex + 0.5) * pitch;
      const vBottom = vTop - pitch;
      if (black) {
        // A bottom-face marker cannot protrude below the build plate. Keep it
        // at the plate surface while all visible faces use raised relief.
        if (isBuildPlateFace) appendSupportBox(ink, uStart, uEnd, vBottom, vTop);
        else appendRaisedBox(uStart, uEnd, vBottom, vTop);
      }
      runStart = runEnd;
    }
  });
}

function cubeFaces(size: number, count: GeneratorConfig['faceCount'], firstId: number, maxId: number): FacePlacement[] {
  const half = size / 2;
  const definitions: Omit<FacePlacement, 'markerId'>[] = [
    { name: 'Top', center: [0, 0, size], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] },
    { name: 'Front', center: [0, -half, half], u: [1, 0, 0], v: [0, 0, 1], normal: [0, -1, 0] },
    { name: 'Right', center: [half, 0, half], u: [0, 1, 0], v: [0, 0, 1], normal: [1, 0, 0] },
    { name: 'Back', center: [0, half, half], u: [-1, 0, 0], v: [0, 0, 1], normal: [0, 1, 0] },
    { name: 'Left', center: [-half, 0, half], u: [0, -1, 0], v: [0, 0, 1], normal: [-1, 0, 0] },
    { name: 'Bottom', center: [0, 0, 0], u: [1, 0, 0], v: [0, -1, 0], normal: [0, 0, -1] },
  ];
  return definitions.slice(0, count).map((face, index) => ({ ...face, markerId: (firstId + index) % maxId }));
}

function appendCube(base: MeshData, ink: MeshData, placements: FacePlacement[], config: GeneratorConfig) {
  const size = config.primitiveSize;
  const half = size / 2;
  const depth = config.inkDepth;

  if (config.faceCount === 1) {
    appendBoundsBox(base, -half, half, -half, half, 0, size - depth);
    appendTiledFaceLayer(base, ink, placements[0], config, -half, half, -half, half);
    return;
  }

  if (config.faceCount === 3) {
    appendBoundsBox(base, -half, half - depth, -half + depth, half, 0, size - depth);
    appendTiledFaceLayer(base, ink, placements[0], config, -half, half, -half, half);
    appendTiledFaceLayer(base, ink, placements[1], config, -half, half, -half, half - depth);
    appendTiledFaceLayer(base, ink, placements[2], config, -half + depth, half, -half, half - depth);
    return;
  }

  if (config.faceCount === 5) {
    // Leave the build-plate-facing bottom face plain white, while tagging
    // the top and four vertical faces.
    appendBoundsBox(base, -half, half, -half, half, 0, size - depth);
    appendTiledFaceLayer(base, ink, placements[0], config, -half, half, -half, half);
    appendTiledFaceLayer(base, ink, placements[1], config, -half, half, -half + depth, half - depth);
    appendTiledFaceLayer(base, ink, placements[2], config, -half + depth, half, -half + depth, half - depth);
    appendTiledFaceLayer(base, ink, placements[3], config, -half, half, -half + depth, half - depth);
    appendTiledFaceLayer(base, ink, placements[4], config, -half + depth, half - depth, -half + depth, half - depth);
    return;
  }

  appendBoundsBox(base, -half + depth, half - depth, -half + depth, half - depth, depth, size - depth);
  appendTiledFaceLayer(base, ink, placements[0], config, -half, half, -half, half);
  appendTiledFaceLayer(base, ink, placements[5], config, -half, half, -half, half);
  appendTiledFaceLayer(base, ink, placements[1], config, -half, half, -half + depth, half - depth);
  appendTiledFaceLayer(base, ink, placements[3], config, -half, half, -half + depth, half - depth);
  appendTiledFaceLayer(base, ink, placements[2], config, -half + depth, half - depth, -half + depth, half - depth);
  appendTiledFaceLayer(base, ink, placements[4], config, -half + depth, half - depth, -half + depth, half - depth);
}

function appendCylinderWithInlay(base: MeshData, ink: MeshData, placement: FacePlacement, config: GeneratorConfig) {
  const radius = config.primitiveSize / 2;
  const height = config.primitiveSize;
  const segments = 64;
  appendCylinder(base, radius, height - config.inkDepth, segments);

  const contour: Array<readonly [number, number]> = Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  });
  const tagHalf = config.markerSize / 2;
  const hole: Array<readonly [number, number]> = [
    [-tagHalf, -tagHalf],
    [-tagHalf, tagHalf],
    [tagHalf, tagHalf],
    [tagHalf, -tagHalf],
  ];
  appendExtrudedRegion(base, contour, [hole], height - config.inkDepth, height);
  appendTiledFaceLayer(base, ink, placement, config, -tagHalf, tagHalf, -tagHalf, tagHalf);
}

function checksFor(config: GeneratorConfig, modulePitch: number, totalTagSpan: number, surfaceFits?: boolean) {
  const hostSpan = config.shape === 'tag' ? totalTagSpan : config.primitiveSize;
  const geometricSpan = config.shape === 'cylinder' ? totalTagSpan * Math.SQRT2 : totalTagSpan;
  const fit = surfaceFits ?? geometricSpan <= hostSpan + 1e-6;
  const pitchStatus = modulePitch >= config.nozzleDiameter * 2 ? 'pass' : modulePitch >= config.nozzleDiameter ? 'warn' : 'fail';
  const layerCount = config.inkDepth / config.layerHeight;
  const layerAligned = Math.abs(layerCount - Math.round(layerCount)) < 0.02;
  const inlayFits = config.shape !== 'tag' || config.inkDepth < config.baseThickness;
  return [
    {
      label: 'Feature width',
      detail: `${modulePitch.toFixed(2)} mm modules · ${config.nozzleDiameter.toFixed(1)} mm nozzle`,
      status: pitchStatus,
    },
    {
      label: 'Inlay depth',
      detail: !inlayFits ? 'Inlay must be shallower than the tag base' : layerAligned ? `${Math.round(layerCount)} exact layers at ${config.layerHeight.toFixed(2)} mm` : `${layerCount.toFixed(1)} layers; choose an exact multiple`,
      status: !inlayFits ? 'fail' : layerAligned && layerCount >= 1 ? 'pass' : 'warn',
    },
    {
      label: 'Quiet zone',
      detail: `${config.quietZoneModules} module${config.quietZoneModules === 1 ? '' : 's'} around the code`,
      status: config.quietZoneModules >= 1 ? 'pass' : 'fail',
    },
    {
      label: 'Surface fit',
      detail: fit ? `${totalTagSpan.toFixed(1)} mm tag area fits every tagged face` : `${totalTagSpan.toFixed(1)} mm tag area exceeds a ${config.shape} face`,
      status: fit ? 'pass' : 'fail',
    },
  ] as const;
}

export function generateModel(config: GeneratorConfig): GeneratedModel {
  const info = getDictionaryInfo(config.dictionary);
  const grid = info.dataBits + 2;
  const modulePitch = config.markerSize / grid;
  const totalTagSpan = config.markerSize + 2 * config.quietZoneModules * modulePitch;
  const base = createMesh('Base — White', 'white');
  const ink = createMesh('ArUco Ink — Black', 'black');
  const maximumId = info.count;
  let placements: FacePlacement[];
  let dimensions: Vec3;
  let surfaceFits: boolean | undefined;

  if (config.shape === 'tag') {
    const ids = (config.markerIds?.length ? config.markerIds : [config.markerId]).map((id) => ((id % maximumId) + maximumId) % maximumId);
    const columns = Math.ceil(Math.sqrt(ids.length));
    const rows = Math.ceil(ids.length / columns);
    const gap = Math.max(3, totalTagSpan * 0.18);
    const pitch = totalTagSpan + gap;
    placements = ids.map((markerId, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        name: ids.length === 1 ? 'Top' : `Tag ${index + 1}`,
        center: [(column - (columns - 1) / 2) * pitch, ((rows - 1) / 2 - row) * pitch, config.baseThickness],
        u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1], markerId,
      };
    });
    placements.forEach((placement) => {
      appendOrientedBox(base, [placement.center[0], placement.center[1], 0], placement.u, placement.v, placement.normal, totalTagSpan, totalTagSpan, config.baseThickness - config.inkDepth);
      appendTiledFaceLayer(base, ink, placement, config, -totalTagSpan / 2, totalTagSpan / 2, -totalTagSpan / 2, totalTagSpan / 2);
    });
    dimensions = [columns * totalTagSpan + (columns - 1) * gap, rows * totalTagSpan + (rows - 1) * gap, config.baseThickness];
  } else if (config.shape === 'cube') {
    placements = cubeFaces(config.primitiveSize, config.faceCount, config.markerId, maximumId);
    appendCube(base, ink, placements, config);
    dimensions = [config.primitiveSize, config.primitiveSize, config.primitiveSize];
  } else if (config.shape === 'cylinder') {
    placements = [{
      name: 'Top', center: [0, 0, config.primitiveSize],
      u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1], markerId: config.markerId,
    }];
    appendCylinderWithInlay(base, ink, placements[0], config);
    dimensions = [config.primitiveSize, config.primitiveSize, config.primitiveSize];
  } else {
    const solid = appendPlatonic(base, ink, config.shape, config, maximumId);
    placements = solid.placements;
    dimensions = solid.dimensions;
    surfaceFits = solid.tagFits;
  }

  const checks = checksFor(config, modulePitch, totalTagSpan, surfaceFits);
  return {
    base,
    ink,
    dimensions,
    modulePitch,
    totalTagSpan,
    faceIds: placements.map((placement) => placement.markerId),
    markerPlacements: placements,
    triangles: (base.indices.length + ink.indices.length) / 3,
    checks: [...checks],
    valid: !checks.some((check) => check.status === 'fail'),
  };
}
