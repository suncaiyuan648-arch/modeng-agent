import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { listWorkspaceModules, readJson, relativePath, walkFiles } from './repository.mjs';
import { analyzePublicApi, sourceExtensions } from './architecture-guard.mjs';

for (const module of await listWorkspaceModules()) {
  const manifest = await readJson(path.join(module.root, 'module.manifest.json'));
  const packageJson = await readJson(path.join(module.root, 'package.json'));
  const indexPath = path.join(module.root, 'src', 'index.ts');
  let indexSource = '';
  let indexExists = true;

  try {
    indexSource = await readFile(indexPath, 'utf8');
  } catch {
    indexExists = false;
  }

  const sourceFiles = [];
  for (const filePath of await walkFiles(path.join(module.root, 'src'), sourceExtensions)) {
    sourceFiles.push({
      path: relativePath(filePath),
      content: await readFile(filePath, 'utf8'),
    });
  }

  const violations = analyzePublicApi({
    module,
    manifest,
    packageJson,
    indexSource,
    indexExists,
    sourceFiles,
  });
  if (violations.length > 0) {
    throw violations[0];
  }

  if (!indexExists && module.group !== 'apps') {
    throw new Error(`ARCH009 INVALID_PUBLIC_EXPORT ${relativePath(indexPath)}`);
  }
}

console.info('Public API checks passed.');
