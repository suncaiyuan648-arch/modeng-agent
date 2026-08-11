import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  ARCHITECTURE_CODES,
  computeChangeRange,
  readBaseGovernanceBaseline,
} from './architecture-guard.mjs';

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

export function validateBaselineRequirements(baseline, checks = MANDATORY_CHECKS) {
  const actualChecks = new Set(checks);
  const requiredChecks = baseline.mandatoryChecks.map((check) => check.replace(/^scripts\//u, ''));
  const missingChecks = requiredChecks.filter((check) => !actualChecks.has(check));
  if (missingChecks.length > 0) {
    throw new Error(
      `ARCH_BASELINE_REQUIREMENT mandatory checks missing from aggregator: ${missingChecks.join(', ')}`,
    );
  }

  const actualRules = new Set(Object.values(ARCHITECTURE_CODES));
  const missingRules = baseline.mandatoryRuleIds.filter((rule) => !actualRules.has(rule));
  if (missingRules.length > 0) {
    throw new Error(
      `ARCH_BASELINE_REQUIREMENT mandatory rule IDs missing from checker: ${missingRules.join(', ')}`,
    );
  }

  if (baseline.mandatoryTestSuites.length === 0) {
    throw new Error('ARCH_BASELINE_REQUIREMENT mandatory test suite inventory is empty');
  }
  return true;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const range = computeChangeRange();
  const baseline = readBaseGovernanceBaseline(range.baseRef);
  validateMandatoryChecks();
  validateBaselineRequirements(baseline);

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
