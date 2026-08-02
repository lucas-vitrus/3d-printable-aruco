import { strToU8, zipSync } from 'fflate';
import type { GeneratedModel, GeneratorConfig, MeshData } from '../types';
import { getDictionaryInfo } from './aruco';

const xmlEscape = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const format = (value: number) => Number(value.toFixed(5)).toString();

function meshXml(mesh: MeshData) {
  const vertices: string[] = [];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    vertices.push(`<vertex x="${format(mesh.positions[index])}" y="${format(mesh.positions[index + 1])}" z="${format(mesh.positions[index + 2])}"/>`);
  }
  const triangles: string[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    triangles.push(`<triangle v1="${mesh.indices[index]}" v2="${mesh.indices[index + 1]}" v3="${mesh.indices[index + 2]}"/>`);
  }
  return `<mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh>`;
}

export function modelXml(model: GeneratedModel, config: GeneratorConfig): string {
  const info = getDictionaryInfo(config.dictionary);
  const title = `${config.dictionary} ID ${config.markerId} ${config.shape}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${xmlEscape(title)}</metadata>
  <metadata name="Designer">Vitrus ArUco 3D Studio</metadata>
  <metadata name="Description">Dual-color printable ${xmlEscape(info.label)} raised-relief ArUco ${xmlEscape(config.shape)}. Face IDs: ${model.faceIds.join(', ')}.</metadata>
  <resources>
    <basematerials id="1">
      <base name="Base — White" displaycolor="#F4F2EAFF"/>
      <base name="ArUco Ink — Black" displaycolor="#171717FF"/>
    </basematerials>
    <object id="2" name="Base — White" type="model" pid="1" pindex="0">${meshXml(model.base)}</object>
    <object id="3" name="ArUco Ink — Black" type="model" pid="1" pindex="1">${meshXml(model.ink)}</object>
    <object id="4" name="${xmlEscape(title)}" type="model">
      <components><component objectid="2"/><component objectid="3"/></components>
    </object>
  </resources>
  <build><item objectid="4"/></build>
</model>`;
}

export function generate3mf(model: GeneratedModel, config: GeneratorConfig): Uint8Array {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  const manifest = JSON.stringify({
    generator: 'Vitrus ArUco 3D Studio',
    version: 1,
    dictionary: config.dictionary,
    markerIds: model.faceIds,
    shape: config.shape,
    units: 'millimeter',
    materialParts: ['Base — White', 'ArUco Ink — Black'],
    print: { nozzle: config.nozzleDiameter, layerHeight: config.layerHeight },
  }, null, 2);
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(relationships),
    '3D/3dmodel.model': strToU8(modelXml(model, config)),
    'Metadata/aruco-studio.json': strToU8(manifest),
  }, { level: 6 });
}

export function exportFilename(config: GeneratorConfig): string {
  const faces = config.shape === 'cube' && config.faceCount > 1 ? `-${config.faceCount}face` : '';
  const ids = config.shape === 'tag' && config.markerIds?.length ? `ids${config.markerIds.join('-')}` : `id${config.markerId}`;
  return `aruco-${config.dictionary.replace('DICT_', '').toLowerCase()}-${ids}-${config.shape}${faces}.3mf`;
}

export function downloadBytes(bytes: Uint8Array, filename: string, mimeType: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function downloadText(contents: string, filename: string, mimeType: string) {
  downloadBytes(new TextEncoder().encode(contents), filename, mimeType);
}
