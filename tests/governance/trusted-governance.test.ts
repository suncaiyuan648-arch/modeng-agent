import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error Trusted Governance is executable ESM without generated declarations.
import {
  validateBaselineIntegrity,
  validateFixtureMatrixIntegrity,
  validateNormalWorkflow,
  validateTrustedHead,
  validateTrustedWorkflow,
  extractAllowedPaths as extractTrustedAllowedPaths,
  pathMatchesPattern as trustedPathMatchesPattern,
} from '../../scripts/trusted-governance-check.mjs';

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readFixture(name: string) {
  return JSON.parse(readFileSync(resolve(fixtureDirectory, name), 'utf8')) as {
    changedEntries: Array<{ status: string; paths: string[] }>;
    baseFiles: string[];
    basePlanningBootstrap: string;
    expected: string;
  };
}

const baseline = {
  mandatoryChecks: ['scripts/check-architecture-fixtures.mjs'],
  mandatoryRuleIds: ['ARCH001'],
  mandatoryTestSuites: ['architecture-fixture-integrity'],
  protectedGovernancePaths: ['tests/governance/**'],
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

const trustedHeadFixtureDefaults = {
  baseBaseline: baseline,
  headBaseline: baseline,
  headFiles: [
    'scripts/check-architecture-fixtures.mjs',
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
  allowedPaths: ['scripts/**', 'tests/**'],
};

describe('trusted governance checks', () => {
  it('accepts only the two approved Work Package statuses', () => {
    const allowedPath = 'packages/shared/contracts/src/index.ts';
    const documentForStatus = (status: string) => ({
      content: `# WP-003\n\n- Status: ${status}\n\n## Allowed implementation paths\n- \`${allowedPath}\``,
    });

    expect(extractTrustedAllowedPaths([documentForStatus('APPROVED')])).toEqual([allowedPath]);
    expect(extractTrustedAllowedPaths([documentForStatus('APPROVED / PLANNING RECORD')])).toEqual([
      allowedPath,
    ]);
    expect(extractTrustedAllowedPaths([documentForStatus('COMPLETED')])).toEqual([]);
    expect(
      extractTrustedAllowedPaths([documentForStatus('APPROVED / GOVERNANCE BOOTSTRAP')]),
    ).toEqual([]);
  });

  it('passes the actual WP-003 planning status and an approved implementation path', () => {
    const planningRecordPath = 'docs/work-packages/WP-003-contract-kernel.md';
    const implementationPath = 'packages/shared/contracts/src/index.ts';
    const planningRecord = readFileSync(resolve(repositoryRoot, planningRecordPath), 'utf8');
    const allowedPaths = extractTrustedAllowedPaths([
      { file: planningRecordPath, content: planningRecord },
    ]);

    expect(planningRecord).toContain('- Status: APPROVED / PLANNING RECORD');
    expect(allowedPaths).toContain(implementationPath);
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: [implementationPath],
        changedEntries: [{ status: 'M', paths: [implementationPath] }],
        baseFiles: [implementationPath, 'docs/roadmap/IMPLEMENTATION.md'],
        allowedPaths,
      }),
    ).toEqual([]);
  });

  it('rejects weakened baseline and removed fixture inventory', () => {
    expect(
      validateBaselineIntegrity(baseline, {
        ...baseline,
        mandatoryRuleIds: [],
        mandatoryTestSuites: [],
        protectedGovernancePaths: [],
        publicEntryPolicy: { rootOnlyByDefault: false, transitiveUndeclaredReExport: 'allowed' },
        basePolicy: { missingBaseAction: 'skip' },
      }),
    ).toHaveLength(6);
    expect(validateFixtureMatrixIntegrity({ ARCH001: ['deep-import'] }, { ARCH001: [] })).toEqual([
      'TRUSTED_FIXTURE_REMOVED ARCH001/deep-import',
    ]);
  });

  it('requires base checkout and forbids executing PR dependencies', () => {
    expect(validateTrustedWorkflow(trustedWorkflow)).toEqual([]);
    expect(validateTrustedWorkflow(trustedWorkflow.replace('base.sha', 'head.sha'))).toContain(
      'TRUSTED_WORKFLOW_UNTRUSTED_CHECKOUT PR head checkout is forbidden',
    );
    expect(validateTrustedWorkflow('on:\n  pull_request_target:\n- run: pnpm install')).toContain(
      'TRUSTED_WORKFLOW_PR_EXECUTION dependency installation or package execution is forbidden',
    );
    expect(validateNormalWorkflow(normalWorkflow)).toEqual([]);
  });

  it('binds changed paths to base-approved scope', () => {
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: ['scripts/check-architecture-fixtures.mjs'],
      }),
    ).toEqual([]);
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: ['package.json'],
      }),
    ).toContain('TRUSTED_SCOPE_VIOLATION package.json');
  });

  it('matches globstars at zero or multiple directory levels without widening stars', () => {
    const pattern = 'packages/shared/contracts/src/**/*.test.ts';
    expect(trustedPathMatchesPattern('packages/shared/contracts/src/index.test.ts', pattern)).toBe(
      true,
    );
    expect(
      trustedPathMatchesPattern('packages/shared/contracts/src/foo/index.test.ts', pattern),
    ).toBe(true);
    expect(
      trustedPathMatchesPattern('packages/shared/contracts/src/foo/bar/index.test.ts', pattern),
    ).toBe(true);
    expect(
      trustedPathMatchesPattern(
        'packages/shared/contracts/src/foo/bar.test.ts',
        'packages/shared/contracts/src/*.test.ts',
      ),
    ).toBe(false);
  });

  it('passes a new WP planning record authorized by GOV-001 in BASE_SHA', () => {
    const fixture = readFixture('planning-only-wp.json');
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: fixture.changedEntries.flatMap((entry) => entry.paths),
        changedEntries: fixture.changedEntries,
        baseFiles: fixture.baseFiles,
        basePlanningBootstrap: fixture.basePlanningBootstrap,
      }),
    ).toEqual([]);
  });

  it('passes a new CCR planning record authorized by GOV-001 in BASE_SHA', () => {
    const fixture = readFixture('ccr-planning-only.json');
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: fixture.changedEntries.flatMap((entry) => entry.paths),
        changedEntries: fixture.changedEntries,
        baseFiles: fixture.baseFiles,
        basePlanningBootstrap: fixture.basePlanningBootstrap,
      }),
    ).toEqual([]);
  });

  it('rejects a CCR planning record combined with business implementation', () => {
    const fixture = readFixture('ccr-with-business-implementation.json');
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: fixture.changedEntries.flatMap((entry) => entry.paths),
        changedEntries: fixture.changedEntries,
        baseFiles: fixture.baseFiles,
        basePlanningBootstrap: fixture.basePlanningBootstrap,
      }),
    ).toContain(fixture.expected);
  });

  it('allows only the named planner policy files in a governance remediation', () => {
    const policyPaths = [
      'docs/governance/work-package.template.md',
      'docs/work-packages/README.md',
    ];
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: policyPaths,
        changedEntries: policyPaths.map((path) => ({ status: 'M', paths: [path] })),
        baseFiles: ['docs/roadmap/IMPLEMENTATION.md', ...policyPaths],
        basePlanningBootstrap: '> STATUS: APPROVED / GOVERNANCE BOOTSTRAP',
      }),
    ).toEqual([]);
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: ['docs/governance/GOV-002-security-hardening.md'],
        changedEntries: [{ status: 'A', paths: ['docs/governance/GOV-002-security-hardening.md'] }],
        baseFiles: ['docs/roadmap/IMPLEMENTATION.md'],
        basePlanningBootstrap: '> STATUS: APPROVED / GOVERNANCE BOOTSTRAP',
      }),
    ).toContain('TRUSTED_SCOPE_VIOLATION docs/governance/GOV-002-security-hardening.md');
  });

  it('passes a necessary roadmap planning status update authorized by GOV-001', () => {
    const fixture = readFixture('roadmap-status-update.json');
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: fixture.changedEntries.flatMap((entry) => entry.paths),
        changedEntries: fixture.changedEntries,
        baseFiles: fixture.baseFiles,
        basePlanningBootstrap: fixture.basePlanningBootstrap,
      }),
    ).toEqual([]);
  });

  it('rejects a planning record combined with business implementation', () => {
    const fixture = readFixture('wp-with-business-implementation.json');
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: fixture.changedEntries.flatMap((entry) => entry.paths),
        changedEntries: fixture.changedEntries,
        baseFiles: fixture.baseFiles,
        basePlanningBootstrap: fixture.basePlanningBootstrap,
      }),
    ).toContain(fixture.expected);
  });

  it('rejects ordinary unauthorized governance widening', () => {
    const fixture = readFixture('unauthorized-governance-widening.json');
    expect(
      validateTrustedHead({
        ...trustedHeadFixtureDefaults,
        changedPaths: fixture.changedEntries.flatMap((entry) => entry.paths),
        changedEntries: fixture.changedEntries,
        baseFiles: fixture.baseFiles,
        basePlanningBootstrap: fixture.basePlanningBootstrap,
      }),
    ).toContain(fixture.expected);
  });
});
