import { spawnSync } from 'node:child_process';
import process from 'node:process';

const BASELINE_PATH = 'docs/governance/architecture-guard-baseline.json';
const MATRIX_PATH = 'tests/architecture-fixtures/architecture-rule-matrix.json';
const AGGREGATOR_PATH = 'scripts/check-architecture.mjs';
const GUARD_PATH = 'scripts/architecture-guard.mjs';
const TRUSTED_WORKFLOW_PATH = '.github/workflows/trusted-governance.yml';
const NORMAL_WORKFLOW_PATH = '.github/workflows/ci.yml';
const ROOT_PACKAGE_PATH = 'package.json';
const CRITICAL_ROOT_SCRIPTS = Object.freeze([
  'format:check',
  'security:scan',
  'lint',
  'typecheck',
  'test',
  'architecture:check',
  'build',
  'verify',
]);
const REQUIRED_SUITE_PATHS = Object.freeze([
  'tests/architecture/architecture-guard.test.ts',
  MATRIX_PATH,
]);

function defaultGit(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function gitOutput(result, description) {
  if (result.status !== 0) {
    throw new Error(`TRUSTED_GIT_RANGE ${description}: ${(result.stderr ?? '').trim()}`);
  }
  return result.stdout;
}

function verifyRef(runGit, ref) {
  const result = runGit(['rev-parse', '--verify', `${ref}^{commit}`]);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function readTreeFile(ref, file, runGit) {
  const result = runGit(['show', `${ref}:${file}`]);
  return result.status === 0 ? result.stdout : undefined;
}

function listTreeFiles(ref, runGit) {
  return gitOutput(runGit(['ls-tree', '-r', '--name-only', ref]), `git ls-tree ${ref}`)
    .split(/\r?\n/u)
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter(Boolean);
}

function parseDiffEntries(output) {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const fields = line.split(/\s+/u);
      const status = fields[0]?.[0];
      if (status === 'R' || status === 'C') {
        return {
          status,
          paths: [fields[1], fields[2]].filter(Boolean).map((file) => file.replaceAll('\\', '/')),
        };
      }
      return {
        status,
        paths: [fields[1]].filter(Boolean).map((file) => file.replaceAll('\\', '/')),
      };
    });
}

function parseJson(content, label) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`TRUSTED_BASELINE_INVALID ${label}: ${String(error)}`, { cause: error });
  }
}

export function validateBaselineIntegrity(baseBaseline, headBaseline) {
  const failures = [];
  for (const field of [
    'mandatoryChecks',
    'mandatoryRuleIds',
    'mandatoryTestSuites',
    'protectedGovernancePaths',
    'trustRootPaths',
  ]) {
    const baseValues = new Set(baseBaseline[field] ?? []);
    const headValues = new Set(headBaseline[field] ?? []);
    for (const value of baseValues) {
      if (!headValues.has(value)) {
        failures.push(`TRUSTED_BASELINE_WEAKENED ${field} removed ${value}`);
      }
    }
  }

  if (
    baseBaseline.publicEntryPolicy?.rootOnlyByDefault &&
    !headBaseline.publicEntryPolicy?.rootOnlyByDefault
  ) {
    failures.push('TRUSTED_BASELINE_WEAKENED public root-only policy was disabled');
  }
  if (
    baseBaseline.publicEntryPolicy?.transitiveUndeclaredReExport === 'forbidden' &&
    headBaseline.publicEntryPolicy?.transitiveUndeclaredReExport !== 'forbidden'
  ) {
    failures.push('TRUSTED_BASELINE_WEAKENED transitive undeclared re-export policy was relaxed');
  }
  if (
    baseBaseline.basePolicy?.missingBaseAction === 'fail-closed' &&
    headBaseline.basePolicy?.missingBaseAction !== 'fail-closed'
  ) {
    failures.push('TRUSTED_BASELINE_WEAKENED CI missing-base policy was relaxed');
  }
  return failures;
}

export function validateFixtureMatrixIntegrity(baseMatrix, headMatrix) {
  const failures = [];
  for (const [rule, requiredFixtures] of Object.entries(baseMatrix ?? {})) {
    const headFixtures = new Set(headMatrix?.[rule] ?? []);
    if (!Array.isArray(headMatrix?.[rule])) {
      failures.push(`TRUSTED_FIXTURE_RULE_MISSING ${rule}`);
      continue;
    }
    for (const fixture of requiredFixtures) {
      if (!headFixtures.has(fixture)) {
        failures.push(`TRUSTED_FIXTURE_REMOVED ${rule}/${fixture}`);
      }
    }
  }
  return failures;
}

export function validateTrustedWorkflow(workflow) {
  const failures = [];
  if (!/pull_request_target:/u.test(workflow)) {
    failures.push('TRUSTED_WORKFLOW_EVENT_MISSING pull_request_target');
  }
  if (!/ARCH_BASE_SHA:/u.test(workflow) || !/ARCH_HEAD_SHA:/u.test(workflow)) {
    failures.push('TRUSTED_WORKFLOW_SHA_INPUT_MISSING ARCH_BASE_SHA/ARCH_HEAD_SHA');
  }
  if (!workflow.includes('node scripts/trusted-governance-check.mjs')) {
    failures.push('TRUSTED_WORKFLOW_CHECKER_MISSING trusted-governance-check.mjs');
  }
  if (!/ref:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha\s*\}\}/u.test(workflow)) {
    failures.push('TRUSTED_WORKFLOW_BASE_CHECKOUT_MISSING trusted base ref');
  }
  if (/ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/u.test(workflow)) {
    failures.push('TRUSTED_WORKFLOW_UNTRUSTED_CHECKOUT PR head checkout is forbidden');
  }
  if (/(?:pnpm|npm|yarn)\s+(?:install|exec|test|run)\b/u.test(workflow)) {
    failures.push(
      'TRUSTED_WORKFLOW_PR_EXECUTION dependency installation or package execution is forbidden',
    );
  }
  return failures;
}

export function validateNormalWorkflow(workflow) {
  const failures = [];
  if (!/pull_request:/u.test(workflow)) {
    failures.push('TRUSTED_CI_EVENT_MISSING pull_request');
  }
  if (!workflow.includes('pnpm verify')) {
    failures.push('TRUSTED_CI_GATE_MISSING pnpm verify');
  }
  if (!workflow.includes('ARCH_BASE_SHA:')) {
    failures.push('TRUSTED_CI_BASE_INPUT_MISSING ARCH_BASE_SHA');
  }
  return failures;
}

export function validateRootPackageScripts(basePackage, headPackage) {
  if (basePackage === undefined || headPackage === undefined) return [];
  return CRITICAL_ROOT_SCRIPTS.flatMap((script) =>
    basePackage.scripts?.[script] === headPackage.scripts?.[script]
      ? []
      : [`TRUSTED_ROOT_SCRIPT_CHANGED ${script} requires repository-owner review`],
  );
}

function declaredStringValues(source, declaration) {
  const body = new RegExp(
    `export\\s+const\\s+${declaration}\\s*=\\s*Object\\.freeze\\(([\\s\\S]*?)\\)`,
    'u',
  ).exec(source)?.[1];
  return new Set([...(body ?? '').matchAll(/['"]([^'"]+)['"]/gu)].map((match) => match[1]));
}

function segmentPatternToRegExp(segment) {
  return segment.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '[^/]*');
}

export function pathMatchesPattern(file, pattern) {
  if (pattern === file) return true;
  const segments = pattern.split('/');
  let glob = '^';
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    if (segment === '**') glob += isLast ? '(?:[^/]+(?:/[^/]+)*)?' : '(?:[^/]+/)*';
    else {
      glob += segmentPatternToRegExp(segment);
      if (!isLast) glob += '/';
    }
  });
  return new RegExp(`${glob}$`, 'u').test(file);
}

export function validateTrustedHead({
  baseBaseline,
  headBaseline,
  headFiles,
  headAggregator,
  headGuard,
  baseMatrix,
  headMatrix,
  headWorkflow,
  headNormalWorkflow,
  baseRootPackage,
  headRootPackage,
  changedPaths,
}) {
  const failures = validateBaselineIntegrity(baseBaseline, headBaseline);
  failures.push(...validateFixtureMatrixIntegrity(baseMatrix, headMatrix));
  failures.push(...validateTrustedWorkflow(headWorkflow ?? ''));
  failures.push(...validateNormalWorkflow(headNormalWorkflow ?? ''));
  failures.push(...validateRootPackageScripts(baseRootPackage, headRootPackage));

  const headFileSet = new Set(headFiles);
  const declaredChecks = declaredStringValues(headAggregator, 'MANDATORY_CHECKS');
  const declaredRules = declaredStringValues(headGuard, 'ARCHITECTURE_CODES');
  for (const path of REQUIRED_SUITE_PATHS) {
    if (!headFileSet.has(path)) failures.push(`TRUSTED_TEST_MISSING ${path}`);
  }
  for (const check of baseBaseline.mandatoryChecks) {
    const normalized = check.replace(/^scripts\//u, '');
    if (!headFileSet.has(check)) failures.push(`TRUSTED_CHECK_MISSING ${check}`);
    if (!declaredChecks.has(normalized)) failures.push(`TRUSTED_CHECK_REMOVED ${normalized}`);
  }
  for (const rule of baseBaseline.mandatoryRuleIds) {
    if (!declaredRules.has(rule)) failures.push(`TRUSTED_RULE_REMOVED ${rule}`);
  }
  for (const path of baseBaseline.protectedGovernancePaths) {
    if (!headFiles.some((file) => pathMatchesPattern(file, path))) {
      failures.push(`TRUSTED_GOVERNANCE_PATH_MISSING ${path}`);
    }
  }
  for (const rule of baseBaseline.mandatoryRuleIds) {
    if (!Array.isArray(headMatrix?.[rule])) failures.push(`TRUSTED_FIXTURE_RULE_MISSING ${rule}`);
  }

  const trustRootPaths = baseBaseline.trustRootPaths ?? headBaseline.trustRootPaths ?? [];
  for (const changedPath of changedPaths) {
    if (trustRootPaths.some((pattern) => pathMatchesPattern(changedPath, pattern))) {
      failures.push(
        `TRUSTED_GOVERNANCE_CHANGE ${changedPath} requires repository-owner review and merge-gate bypass`,
      );
    }
  }
  return [...new Set(failures)];
}

export function runTrustedGovernanceCheck({ env = process.env, runGit = defaultGit } = {}) {
  const baseInput = env.ARCH_BASE_SHA?.trim();
  const headInput = env.ARCH_HEAD_SHA?.trim();
  if (!baseInput || !headInput) {
    throw new Error('TRUSTED_BASELINE_MISSING ARCH_BASE_SHA and ARCH_HEAD_SHA are required');
  }
  const baseRef = verifyRef(runGit, baseInput);
  const headRef = verifyRef(runGit, headInput);
  if (baseRef === undefined || headRef === undefined) {
    throw new Error('TRUSTED_BASELINE_MISSING base or head SHA is unavailable');
  }

  const baseBaseline = parseJson(
    readTreeFile(baseRef, BASELINE_PATH, runGit) ?? '',
    'BASE baseline',
  );
  const headBaseline = parseJson(
    readTreeFile(headRef, BASELINE_PATH, runGit) ?? '',
    'HEAD baseline',
  );
  const baseMatrix = parseJson(
    readTreeFile(baseRef, MATRIX_PATH, runGit) ?? '{}',
    'BASE fixture matrix',
  );
  const headMatrix = parseJson(
    readTreeFile(headRef, MATRIX_PATH, runGit) ?? '{}',
    'HEAD fixture matrix',
  );
  const changed = gitOutput(
    runGit(['diff', '--name-status', '-M', '--diff-filter=ACMRD', baseRef, headRef]),
    `git diff ${baseRef} ${headRef}`,
  );
  const changedEntries = parseDiffEntries(changed);
  const changedPaths = [...new Set(changedEntries.flatMap((entry) => entry.paths))];
  const failures = validateTrustedHead({
    baseBaseline,
    headBaseline,
    headFiles: listTreeFiles(headRef, runGit),
    headAggregator: readTreeFile(headRef, AGGREGATOR_PATH, runGit) ?? '',
    headGuard: readTreeFile(headRef, GUARD_PATH, runGit) ?? '',
    baseMatrix,
    headMatrix,
    headWorkflow: readTreeFile(headRef, TRUSTED_WORKFLOW_PATH, runGit) ?? '',
    headNormalWorkflow: readTreeFile(headRef, NORMAL_WORKFLOW_PATH, runGit) ?? '',
    baseRootPackage: parseJson(
      readTreeFile(baseRef, ROOT_PACKAGE_PATH, runGit) ?? '{}',
      'BASE root package',
    ),
    headRootPackage: parseJson(
      readTreeFile(headRef, ROOT_PACKAGE_PATH, runGit) ?? '{}',
      'HEAD root package',
    ),
    changedPaths,
  });
  if (failures.length > 0) throw new Error(failures.join('\n'));
  return { baseRef, headRef, changedPaths };
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('trusted-governance-check.mjs')) {
  const result = runTrustedGovernanceCheck();
  console.info(
    `Trusted governance check passed for ${result.baseRef} -> ${result.headRef} (${result.changedPaths.length} paths).`,
  );
}
