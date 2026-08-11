import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { listWorkspaceModules, readJson, relativePath } from './repository.mjs';
import { analyzePublicApi } from './architecture-guard.mjs';

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

  const violations = analyzePublicApi({
    module,
    manifest,
    packageJson,
    indexSource,
    indexExists,
  });
  if (violations.length > 0) {
    throw violations[0];
  }

  if (!indexExists && module.group !== 'apps') {
    throw new Error(`ARCH009 INVALID_PUBLIC_EXPORT ${relativePath(indexPath)}`);
  }
}

console.info('Public API checks passed.');
