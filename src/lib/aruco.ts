import arucoModule from 'js-aruco2/src/aruco.js';
import 'js-aruco2/src/dictionaries/aruco_4x4_1000.js';
import 'js-aruco2/src/dictionaries/aruco_5x5_1000.js';
import 'js-aruco2/src/dictionaries/aruco_6x6_1000.js';
import 'js-aruco2/src/dictionaries/aruco_7x7_1000.js';
import type { DictionaryInfo, DictionaryKey } from '../types';

export const DICTIONARIES: DictionaryInfo[] = [
  { key: 'DICT_4X4_50', label: '4×4 · 50', family: '4×4', dataBits: 4, count: 50, source: 'ARUCO_4X4_1000' },
  { key: 'DICT_4X4_100', label: '4×4 · 100', family: '4×4', dataBits: 4, count: 100, source: 'ARUCO_4X4_1000' },
  { key: 'DICT_4X4_250', label: '4×4 · 250', family: '4×4', dataBits: 4, count: 250, source: 'ARUCO_4X4_1000' },
  { key: 'DICT_5X5_50', label: '5×5 · 50', family: '5×5', dataBits: 5, count: 50, source: 'ARUCO_5X5_1000' },
  { key: 'DICT_5X5_100', label: '5×5 · 100', family: '5×5', dataBits: 5, count: 100, source: 'ARUCO_5X5_1000' },
  { key: 'DICT_5X5_250', label: '5×5 · 250', family: '5×5', dataBits: 5, count: 250, source: 'ARUCO_5X5_1000' },
  { key: 'DICT_6X6_50', label: '6×6 · 50', family: '6×6', dataBits: 6, count: 50, source: 'ARUCO_6X6_1000' },
  { key: 'DICT_6X6_100', label: '6×6 · 100', family: '6×6', dataBits: 6, count: 100, source: 'ARUCO_6X6_1000' },
  { key: 'DICT_6X6_250', label: '6×6 · 250', family: '6×6', dataBits: 6, count: 250, source: 'ARUCO_6X6_1000' },
  { key: 'DICT_7X7_50', label: '7×7 · 50', family: '7×7', dataBits: 7, count: 50, source: 'ARUCO_7X7_1000' },
];

export function getDictionaryInfo(key: DictionaryKey): DictionaryInfo {
  const info = DICTIONARIES.find((candidate) => candidate.key === key);
  if (!info) throw new Error(`Unsupported ArUco dictionary: ${key}`);
  return info;
}

function codeToBits(code: number | string | number[], bitCount: number): string {
  if (Array.isArray(code)) {
    return code
      .map((byte) => byte.toString(2).padStart(8, '0'))
      .join('')
      .slice(0, bitCount);
  }
  const value = typeof code === 'string' ? Number.parseInt(code, 16) : code;
  return value.toString(2).padStart(bitCount, '0');
}

export function getMarkerCode(key: DictionaryKey, markerId: number): string {
  const info = getDictionaryInfo(key);
  const safeId = Math.max(0, Math.min(info.count - 1, Math.floor(markerId)));
  const source = arucoModule.AR.DICTIONARIES[info.source];
  if (!source) throw new Error(`Dictionary data not loaded: ${info.source}`);
  return codeToBits(source.codeList[safeId], source.nBits);
}

/** Returns true for black modules. Includes the required one-module black border. */
export function getMarkerMatrix(key: DictionaryKey, markerId: number): boolean[][] {
  const info = getDictionaryInfo(key);
  const code = getMarkerCode(key, markerId);
  const size = info.dataBits + 2;
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => {
      if (row === 0 || column === 0 || row === size - 1 || column === size - 1) return true;
      const dataIndex = (row - 1) * info.dataBits + (column - 1);
      return code[dataIndex] === '0';
    }),
  );
}

export function markerSvg(key: DictionaryKey, markerId: number, quietZoneModules = 1): string {
  const matrix = getMarkerMatrix(key, markerId);
  const quiet = Math.max(0, quietZoneModules);
  const grid = matrix.length;
  const span = grid + quiet * 2;
  const rects: string[] = [];
  matrix.forEach((row, y) => {
    let runStart = -1;
    for (let x = 0; x <= row.length; x += 1) {
      if (row[x] && runStart < 0) runStart = x;
      if ((!row[x] || x === row.length) && runStart >= 0) {
        rects.push(`<rect x="${runStart + quiet}" y="${y + quiet}" width="${x - runStart}" height="1"/>`);
        runStart = -1;
      }
    }
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges">`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<g fill="#000">${rects.join('')}</g>`,
    '</svg>',
  ].join('');
}
