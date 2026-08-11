import { describe, expect, it } from 'vitest';

// @ts-expect-error Trusted Governance is executable ESM without generated declarations.
import {
  validateBaselineIntegrity,
  validateFixtureMatrixIntegrity,
  validateTrustedHead,
  validateTrustedWorkflow,
} from '../../scripts/trusted-governance-check.mjs';

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
  });

  it('binds changed paths to base-approved scope', () => {
    const common = {
      baseBaseline: baseline,
      headBaseline: baseline,
      headFiles: [
        'scripts/check-architecture-fixtures.mjs',
        'tests/governance/trusted-governance.test.ts',
        'tests/architecture/architecture-guard.test.ts',
        'tests/architecture-fixtures/architecture-rule-matrix.json',
      ],
      headAggregator: 'check-architecture-fixtures.mjs',
      headGuard: 'ARCH001',
      baseMatrix: { ARCH001: ['deep-import'] },
      headMatrix: { ARCH001: ['deep-import'] },
      headWorkflow: trustedWorkflow,
      allowedPaths: ['scripts/**', 'tests/**'],
    };
    expect(
      validateTrustedHead({
        ...common,
        changedPaths: ['scripts/check-architecture-fixtures.mjs'],
      }),
    ).toEqual([]);
    expect(validateTrustedHead({ ...common, changedPaths: ['package.json'] })).toContain(
      'TRUSTED_SCOPE_VIOLATION package.json',
    );
  });
});
