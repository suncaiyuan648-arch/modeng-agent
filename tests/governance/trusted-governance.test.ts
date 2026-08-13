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
  pathMatchesPattern as trustedPathMatchesPattern,
} from '../../scripts/trusted-governance-check.mjs';

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

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
