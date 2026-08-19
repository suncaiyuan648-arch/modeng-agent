import { describe, expect, it } from 'vitest';

// @ts-expect-error Trusted Governance is executable ESM without generated declarations.
import {
  pathMatchesPattern,
  validateBaselineIntegrity,
  validateFixtureMatrixIntegrity,
  validateNormalWorkflow,
  validateRootPackageScripts,
  validateTrustedHead,
  validateTrustedWorkflow,
} from '../../scripts/trusted-governance-check.mjs';

const baseline = {
  mandatoryChecks: ['scripts/check-architecture-fixtures.mjs'],
  mandatoryRuleIds: ['ARCH001'],
  mandatoryTestSuites: ['architecture-fixture-integrity'],
  protectedGovernancePaths: ['tests/governance/**'],
  trustRootPaths: [
    'AGENTS.md',
    'AI工程治理与Work-Package规范.md',
    '.github/workflows/**',
    'scripts/architecture-guard.mjs',
    'scripts/repository.mjs',
    'docs/work-packages/README.md',
    'tests/architecture/**',
    'tests/governance/**',
  ],
  publicEntryPolicy: {
    rootOnlyByDefault: true,
    transitiveUndeclaredReExport: 'forbidden',
  },
  basePolicy: { missingBaseAction: 'fail-closed' },
};

const trustedWorkflow = `
on:
  pull_request_target:
env:
  ARCH_BASE_SHA: base
  ARCH_HEAD_SHA: head
steps:
  - uses: actions/checkout@v4
    with:
      ref: \${{ github.event.pull_request.base.sha }}
  - run: node scripts/trusted-governance-check.mjs
`;

const normalWorkflow = 'on:\n  pull_request:\nenv:\n  ARCH_BASE_SHA: base\n- run: pnpm verify';
const rootPackage = {
  scripts: {
    'format:check': 'prettier --check .',
    'security:scan': 'node scripts/check-secrets.mjs',
    lint: 'eslint .',
    typecheck: 'pnpm -r typecheck',
    test: 'vitest run',
    'architecture:check': 'node scripts/check-architecture.mjs',
    build: 'pnpm -r build',
    verify: 'pnpm lint && pnpm test',
  },
};

const defaults = {
  baseBaseline: baseline,
  headBaseline: baseline,
  headFiles: [
    'scripts/check-architecture-fixtures.mjs',
    'scripts/architecture-guard.mjs',
    'tests/governance/trusted-governance.test.ts',
    'tests/architecture/architecture-guard.test.ts',
    'tests/architecture-fixtures/architecture-rule-matrix.json',
  ],
  headAggregator:
    "export const MANDATORY_CHECKS = Object.freeze(['check-architecture-fixtures.mjs']);",
  headGuard: "export const ARCHITECTURE_CODES = Object.freeze({ RULE: 'ARCH001' });",
  baseMatrix: { ARCH001: ['deep-import'] },
  headMatrix: { ARCH001: ['deep-import'] },
  headWorkflow: trustedWorkflow,
  headNormalWorkflow: normalWorkflow,
  baseRootPackage: rootPackage,
  headRootPackage: rootPackage,
};

describe('Rules Lite trusted governance', () => {
  it('allows ordinary product and YELLOW metadata changes without a Work Package grant', () => {
    expect(
      validateTrustedHead({
        ...defaults,
        changedPaths: [
          'packages/frontend/agent-ui/src/index.ts',
          'packages/frontend/agent-ui/package.json',
          'packages/frontend/agent-ui/module.manifest.json',
          'packages/frontend/agent-ui/tsconfig.json',
        ],
      }),
    ).toEqual([]);
  });

  it('blocks only governance Trust Root changes for repository-owner handling', () => {
    const failures = validateTrustedHead({
      ...defaults,
      changedPaths: [
        'AGENTS.md',
        'scripts/architecture-guard.mjs',
        'scripts/repository.mjs',
        'tests/governance/trusted-governance.test.ts',
      ],
    });
    expect(failures).toEqual([
      'TRUSTED_GOVERNANCE_CHANGE AGENTS.md requires repository-owner review and merge-gate bypass',
      'TRUSTED_GOVERNANCE_CHANGE scripts/architecture-guard.mjs requires repository-owner review and merge-gate bypass',
      'TRUSTED_GOVERNANCE_CHANGE scripts/repository.mjs requires repository-owner review and merge-gate bypass',
      'TRUSTED_GOVERNANCE_CHANGE tests/governance/trusted-governance.test.ts requires repository-owner review and merge-gate bypass',
    ]);
  });

  it('rejects weakened invariant inventory', () => {
    expect(
      validateBaselineIntegrity(baseline, {
        ...baseline,
        mandatoryRuleIds: [],
        mandatoryTestSuites: [],
        protectedGovernancePaths: [],
        trustRootPaths: [],
        publicEntryPolicy: {
          rootOnlyByDefault: false,
          transitiveUndeclaredReExport: 'allowed',
        },
        basePolicy: { missingBaseAction: 'skip' },
      }),
    ).toHaveLength(14);
    expect(validateFixtureMatrixIntegrity({ ARCH001: ['deep-import'] }, { ARCH001: [] })).toEqual([
      'TRUSTED_FIXTURE_REMOVED ARCH001/deep-import',
    ]);
  });

  it('requires a BASE checkout and never executes PR dependencies', () => {
    expect(validateTrustedWorkflow(trustedWorkflow)).toEqual([]);
    expect(validateTrustedWorkflow(trustedWorkflow.replace('base.sha', 'head.sha'))).toContain(
      'TRUSTED_WORKFLOW_UNTRUSTED_CHECKOUT PR head checkout is forbidden',
    );
    expect(validateTrustedWorkflow('on:\n  pull_request_target:\n- run: pnpm install')).toContain(
      'TRUSTED_WORKFLOW_PR_EXECUTION dependency installation or package execution is forbidden',
    );
    expect(validateNormalWorkflow(normalWorkflow)).toEqual([]);
  });

  it('allows root dependency changes but protects the actual verification commands', () => {
    expect(
      validateRootPackageScripts(rootPackage, { ...rootPackage, dependencies: { zod: '4.0.0' } }),
    ).toEqual([]);
    expect(
      validateRootPackageScripts(rootPackage, {
        ...rootPackage,
        scripts: { ...rootPackage.scripts, 'security:scan': 'echo skipped' },
      }),
    ).toEqual(['TRUSTED_ROOT_SCRIPT_CHANGED security:scan requires repository-owner review']);
  });

  it('matches exact, star, and globstar Trust Root patterns', () => {
    expect(pathMatchesPattern('AGENTS.md', 'AGENTS.md')).toBe(true);
    expect(pathMatchesPattern('.github/workflows/ci.yml', '.github/workflows/**')).toBe(true);
    expect(pathMatchesPattern('tests/architecture/foo/bar.test.ts', 'tests/architecture/**')).toBe(
      true,
    );
    expect(pathMatchesPattern('packages/foo/package.json', 'tests/**')).toBe(false);
  });
});
