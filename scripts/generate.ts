#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { markerSvg } from '../src/lib/aruco';
import { generateModel } from '../src/lib/geometry';
import { generateStep, stepFilename } from '../src/lib/step';
import { generateStructureJson, structureFilename } from '../src/lib/structureJson';
import { exportFilename, generate3mf } from '../src/lib/threeMf';
import type { GeneratorConfig } from '../src/types';

const defaults: GeneratorConfig = {
  shape: 'cube', dictionary: 'DICT_4X4_50', markerId: 7, markerSize: 36,
  primitiveSize: 50, baseThickness: 2.4, inkDepth: 0.4, quietZoneModules: 1,
  faceCount: 3, nozzleDiameter: 0.4, layerHeight: 0.2,
};

function usage() {
  console.log(`ArUco 3D Studio CLI

Usage: npm run generate -- --config model.json --out ./generated [--formats 3mf,step,json,svg]

The JSON configuration uses millimeters and the GeneratorConfig fields from src/types.ts.
Formats default to: 3mf,step,json,svg`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return usage();
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const configPath = value('--config');
  const outDirectory = resolve(value('--out') ?? './generated');
  const formats = new Set((value('--formats') ?? '3mf,step,json,svg').split(',').map((entry) => entry.trim().toLowerCase()));
  const supplied = configPath ? JSON.parse(await readFile(resolve(configPath), 'utf8')) : {};
  const config: GeneratorConfig = { ...defaults, ...supplied };
  const model = generateModel(config);
  if (!model.valid) {
    const failures = model.checks.filter((check) => check.status === 'fail').map((check) => `${check.label}: ${check.detail}`);
    throw new Error(`Invalid print geometry:\n${failures.join('\n')}`);
  }
  await mkdir(outDirectory, { recursive: true });
  const written: string[] = [];
  const write = async (name: string, contents: string | Uint8Array) => {
    const target = resolve(outDirectory, name);
    await writeFile(target, contents);
    written.push(target);
  };
  if (formats.has('3mf')) await write(exportFilename(config), generate3mf(model, config));
  if (formats.has('step') || formats.has('stp')) await write(stepFilename(config), generateStep(model, config));
  if (formats.has('json')) await write(structureFilename(config), generateStructureJson(model, config));
  if (formats.has('svg')) await write(`aruco-${config.dictionary.toLowerCase()}-id${config.markerId}.svg`, markerSvg(config.dictionary, config.markerId, config.quietZoneModules));
  console.log(JSON.stringify({ outputDirectory: outDirectory, shape: config.shape, markerIds: model.faceIds, files: written.map((path) => basename(path)) }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
