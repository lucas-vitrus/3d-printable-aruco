import type { GeneratedModel, GeneratorConfig, MeshData } from '../types';
import { exportFilename } from './threeMf';

// Keep the exchange file strictly ISO-10303-21 ASCII for broad CAD-reader
// compatibility. Material labels remain explicit and readable in the STEP.
const stepString = (value: string) => `'${value.replaceAll("'", "''").replaceAll('—', '-').replaceAll('–', '-').replaceAll('×', 'x')}'`;
const number = (value: number) => {
  const rounded = Math.abs(value) < 5e-8 ? 0 : value;
  return rounded.toFixed(6);
};
const subtract = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (value: number[]) => {
  const length = Math.hypot(...value) || 1;
  return value.map((entry) => entry / length);
};

type Component = { triangles: Array<readonly [number, number, number]>; vertices: number[] };

function components(mesh: MeshData): Component[] {
  const triangles: Array<readonly [number, number, number]> = [];
  const byVertex = new Map<number, number[]>();
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const triangle = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]] as const;
    const triangleIndex = triangles.push(triangle) - 1;
    triangle.forEach((vertex) => byVertex.set(vertex, [...(byVertex.get(vertex) ?? []), triangleIndex]));
  }

  const seen = new Set<number>();
  const result: Component[] = [];
  triangles.forEach((_, seed) => {
    if (seen.has(seed)) return;
    const queue = [seed];
    const componentTriangles: Array<readonly [number, number, number]> = [];
    const componentVertices = new Set<number>();
    seen.add(seed);
    while (queue.length) {
      const triangleIndex = queue.pop()!;
      const triangle = triangles[triangleIndex];
      componentTriangles.push(triangle);
      triangle.forEach((vertex) => {
        componentVertices.add(vertex);
        (byVertex.get(vertex) ?? []).forEach((neighbor) => {
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            queue.push(neighbor);
          }
        });
      });
    }
    result.push({ triangles: componentTriangles, vertices: [...componentVertices] });
  });
  return result;
}

export function generateStep(model: GeneratedModel, config: GeneratorConfig): string {
  const entities: string[] = [];
  const add = (body: string) => {
    entities.push(body);
    return `#${entities.length}`;
  };

  const lengthUnit = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
  const angleUnit = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
  const solidAngleUnit = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
  const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.000001),${lengthUnit},'distance_accuracy_value','confusion accuracy')`);
  const context = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${lengthUnit},${angleUnit},${solidAngleUnit}))REPRESENTATION_CONTEXT('',''))`);
  const application = add(`APPLICATION_CONTEXT('automotive_design')`);
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${application})`);
  const productContext = add(`PRODUCT_CONTEXT('',${application},'mechanical')`);
  const product = add(`PRODUCT(${stepString(`${config.shape} ArUco structure`)},${stepString(`${config.shape} ArUco structure`)},'',(${productContext}))`);
  const formation = add(`PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',${product},.NOT_KNOWN.)`);
  const definitionContext = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${application},'design')`);
  const definition = add(`PRODUCT_DEFINITION('design','',${formation},${definitionContext})`);
  const definitionShape = add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`);

  const breps: string[] = [];
  ([model.base, model.ink] as MeshData[]).forEach((mesh) => {
    components(mesh).forEach((component, componentIndex) => {
      const points = new Map<number, string>();
      component.vertices.forEach((vertex) => {
        const offset = vertex * 3;
        points.set(vertex, add(`CARTESIAN_POINT('',(${number(mesh.positions[offset])},${number(mesh.positions[offset + 1])},${number(mesh.positions[offset + 2])}))`));
      });
      const vertexPoints = new Map<number, string>();
      component.vertices.forEach((vertex) => vertexPoints.set(vertex, add(`VERTEX_POINT('',${points.get(vertex)})`)));
      const edges = new Map<string, { from: number; to: number; edge: string }>();
      const orientedEdge = (from: number, to: number) => {
        const key = from < to ? `${from}:${to}` : `${to}:${from}`;
        const existing = edges.get(key);
        if (existing) return add(`ORIENTED_EDGE('',*,*,${existing.edge},.${existing.from === from && existing.to === to ? 'T' : 'F'}` + '.)');
        const fromOffset = from * 3;
        const toOffset = to * 3;
        const direction = normalize([
          mesh.positions[toOffset] - mesh.positions[fromOffset],
          mesh.positions[toOffset + 1] - mesh.positions[fromOffset + 1],
          mesh.positions[toOffset + 2] - mesh.positions[fromOffset + 2],
        ]);
        const length = Math.hypot(
          mesh.positions[toOffset] - mesh.positions[fromOffset],
          mesh.positions[toOffset + 1] - mesh.positions[fromOffset + 1],
          mesh.positions[toOffset + 2] - mesh.positions[fromOffset + 2],
        );
        const lineDirection = add(`DIRECTION('',(${direction.map(number).join(',')}))`);
        const vector = add(`VECTOR('',${lineDirection},${number(length)})`);
        const line = add(`LINE('',${points.get(from)},${vector})`);
        const edge = add(`EDGE_CURVE('',${vertexPoints.get(from)},${vertexPoints.get(to)},${line},.T.)`);
        edges.set(key, { from, to, edge });
        return add(`ORIENTED_EDGE('',*,*,${edge},.T.)`);
      };
      const faces = component.triangles.map((triangle) => {
        const loop = add(`EDGE_LOOP('',(${orientedEdge(triangle[0], triangle[1])},${orientedEdge(triangle[1], triangle[2])},${orientedEdge(triangle[2], triangle[0])}))`);
        const bound = add(`FACE_OUTER_BOUND('',${loop},.T.)`);
        const coordinates = triangle.map((vertex) => {
          const offset = vertex * 3;
          return [mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]];
        });
        const normal = normalize(cross(subtract(coordinates[1], coordinates[0]), subtract(coordinates[2], coordinates[0])));
        const direction = add(`DIRECTION('',(${normal.map(number).join(',')}))`);
        const reference = normalize(subtract(coordinates[1], coordinates[0]));
        const referenceDirection = add(`DIRECTION('',(${reference.map(number).join(',')}))`);
        const placement = add(`AXIS2_PLACEMENT_3D('',${points.get(triangle[0])},${direction},${referenceDirection})`);
        const plane = add(`PLANE('',${placement})`);
        return add(`ADVANCED_FACE('',(${bound}),${plane},.T.)`);
      });
      const shell = add(`CLOSED_SHELL(${stepString(`${mesh.name} ${componentIndex + 1}`)},(${faces.join(',')}))`);
      breps.push(add(`MANIFOLD_SOLID_BREP(${stepString(`${mesh.name} ${componentIndex + 1}`)},${shell})`));
    });
  });

  const representation = add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${stepString(`${config.shape} ArUco structure`)},(${breps.join(',')}),${context})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(${definitionShape},${representation})`);

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '');
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Faceted dual-body ArUco CAD geometry'),'2;1');
FILE_NAME(${stepString(stepFilename(config))},${stepString(timestamp)},('Vitrus Labs'),('Vitrus Labs'),'Vitrus ArUco 3D Studio','Vitrus ArUco 3D Studio','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
${entities.map((entity, index) => `#${index + 1}=${entity};`).join('\n')}
ENDSEC;
END-ISO-10303-21;
`;
}

export function stepFilename(config: GeneratorConfig) {
  return exportFilename(config).replace(/\.3mf$/i, '.step');
}
