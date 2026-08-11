import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { listWorkspaceModules, readJson, relativePath, walkFiles } from './repository.mjs';
import {
  analyzeModule,
  findCircularDependencies,
  sourceExtensions,
} from './architecture-guard.mjs';

const checkedModules = [];
const workspaceModules = await listWorkspaceModules();

for (const module of workspaceModules) {
  const manifest = await readJson(path.join(module.root, 'module.manifest.json'));
  const packageJson = await readJson(path.join(module.root, 'package.json'));
  const files = [];

  for (const filePath of await walkFiles(path.join(module.root, 'src'), sourceExtensions)) {
    files.push({
      path: relativePath(filePath),
      content: await readFile(filePath, 'utf8'),
    });
  }

  const violations = analyzeModule({ module, manifest, packageJson, files, workspaceModules });
  if (violations.length > 0) {
    throw violations[0];
  }

  checkedModules.push({ module, manifest, packageJson, files });
}

const cycle = findCircularDependencies(checkedModules);
if (cycle !== undefined) {
  throw cycle;
}

console.info('Dependency boundary checks passed.');
