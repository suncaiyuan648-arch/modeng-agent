import { spawnSync } from 'node:child_process';
import process from 'node:process';

const checks = [
  'check-module-manifest.mjs',
  'check-boundaries.mjs',
  'check-public-api.mjs',
  'check-contract-changes.mjs',
];

for (const check of checks) {
  const result = spawnSync(process.execPath, [`scripts/${check}`], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.info(`Architecture checks passed (${checks.length}).`);
