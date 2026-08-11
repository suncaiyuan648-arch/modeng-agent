import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { fail, listWorkspaceModules, readJson, relativePath } from './repository.mjs';

for (const module of await listWorkspaceModules()) {
  const manifest = await readJson(path.join(module.root, 'module.manifest.json'));
  const packageJson = await readJson(path.join(module.root, 'package.json'));

  if (module.group === 'apps') {
    if (manifest.publicExports.length !== 0) {
      fail('ARCH_APP_PUBLIC_EXPORT', `${module.name} must not publish package exports`);
    }
    continue;
  }

  const indexPath = path.join(module.root, 'src', 'index.ts');
  try {
    await access(indexPath);
  } catch {
    fail('ARCH_PUBLIC_ENTRY_MISSING', relativePath(indexPath));
  }

  if (packageJson.exports?.['.'] === undefined) {
    fail('ARCH_PACKAGE_EXPORT_MISSING', `${module.name} does not export its root`);
  }

  const exportKeys = Object.keys(packageJson.exports ?? {}).sort();
  const manifestKeys = [...manifest.publicExports].sort();
  if (JSON.stringify(exportKeys) !== JSON.stringify(manifestKeys)) {
    fail(
      'ARCH_PUBLIC_EXPORT_MISMATCH',
      `${module.name}: package=${exportKeys} manifest=${manifestKeys}`,
    );
  }

  const indexSource = await readFile(indexPath, 'utf8');
  if (/from\s+['"][^'"]*\/internal\//.test(indexSource)) {
    fail('ARCH_INTERNAL_REEXPORT', `${relativePath(indexPath)} re-exports internal code`);
  }
}

console.info('Public API checks passed.');
