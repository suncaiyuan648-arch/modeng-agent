import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { listWorkspaceModules, readJson } from './repository.mjs';

const moduleName = process.argv[2];
if (moduleName === undefined) {
  throw new Error('TEST_MODULE_REQUIRED Usage: pnpm verify:module <module>');
}

let packageName;
for (const module of await listWorkspaceModules()) {
  const manifest = await readJson(`${module.root}/module.manifest.json`);
  if (manifest.name === moduleName || module.relative === moduleName) {
    const packageJson = await readJson(`${module.root}/package.json`);
    packageName = packageJson.name;
    break;
  }
}

if (packageName === undefined) {
  throw new Error(`TEST_MODULE_UNKNOWN ${moduleName}`);
}

for (const command of [
  ['--filter', packageName, 'typecheck'],
  ['--filter', packageName, 'build'],
  ['architecture:check'],
]) {
  const windows = process.platform === 'win32';
  const executable = windows ? (process.env['ComSpec'] ?? 'cmd.exe') : 'pnpm';
  const args = windows ? ['/d', '/s', '/c', 'pnpm', ...command] : command;
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.info(`Module verification passed: ${moduleName}`);
