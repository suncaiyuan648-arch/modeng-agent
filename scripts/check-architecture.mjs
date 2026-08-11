import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const MANDATORY_CHECKS = Object.freeze([
  'check-module-manifest.mjs',
  'check-boundaries.mjs',
  'check-public-api.mjs',
  'check-contract-changes.mjs',
  'check-architecture-fixtures.mjs',
]);

export function validateMandatoryChecks(checks = MANDATORY_CHECKS) {
  const expected = [...MANDATORY_CHECKS].sort();
  const actual = [...checks].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `ARCH_CHECK_INVENTORY mandatory checks mismatch; expected ${expected.join(', ')}, got ${actual.join(', ')}`,
    );
  }
  return true;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  validateMandatoryChecks();

  for (const check of MANDATORY_CHECKS) {
    const result = spawnSync(process.execPath, [`scripts/${check}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  console.info(`Architecture checks passed (${MANDATORY_CHECKS.length}).`);
}
