import { describe, expect, it } from 'vitest';

// @ts-expect-error Architecture Guard is executable ESM without a generated declaration file.
import {
  analyzeModule,
  analyzePublicApi,
  computeChangeRange,
  evaluateContractChanges,
  extractAllowedWritePaths,
  hasApprovedPlanningBootstrap,
  isFrozenContractPath,
  isDeepImportSpecifier,
  isPlanningOnlyPath,
  parseImportReferences,
  parseImports,
  pathMatchesPattern,
} from '../../scripts/architecture-guard.mjs';
// @ts-expect-error Fixture runner is executable ESM without a generated declaration file.
import { evaluateFixtureResults } from '../../scripts/check-architecture-fixtures.mjs';
// @ts-expect-error Contract checker is executable ESM without a generated declaration file.
import { readBaseAuthorizationDocuments } from '../../scripts/check-contract-changes.mjs';
// @ts-expect-error Aggregator is executable ESM without a generated declaration file.
import {
  MANDATORY_CHECKS,
  validateBaselineRequirements,
  validateMandatoryChecks,
} from '../../scripts/check-architecture.mjs';
// @ts-expect-error Trusted Governance check is executable ESM without a generated declaration file.
import {
  validateFixtureMatrixIntegrity,
  validateBaselineIntegrity,
  validateNormalWorkflow,
  validateTrustedWorkflow,
  validateTrustedHead,
} from '../../scripts/trusted-governance-check.mjs';

const codes = (violations: Array<{ code: string }>) =>
  violations.map((violation) => violation.code);
const REQUIRED_TEST_PATHS = [
  'tests/architecture/architecture-guard.test.ts',
  'tests/architecture-fixtures/architecture-rule-matrix.json',
];

describe('Architecture Guard parser and path resolution', () => {
  it('extracts import, side-effect, type, export, dynamic import, require, resolve, and import-equals', () => {
    const source = `
      import type { Contract } from '@modern-agent/shared-contracts';
      import '@modern-agent/backend-model-supply/internal/router';
      export { debug } from './internal';
      export * from '../../model-supply/src/internal/router';
      const lazy = import('./lazy');
      const required = require('./required');
      const resolved = require.resolve('./resolved');
      import legacy = require('./legacy');
      const value: Contract | undefined = lazy && required && resolved && legacy;
    `;

    expect(parseImports(source)).toEqual([
      '@modern-agent/shared-contracts',
      '@modern-agent/backend-model-supply/internal/router',
      './internal',
      '../../model-supply/src/internal/router',
      './lazy',
      '<unsupported>',
      '<unsupported>',
      './legacy',
    ]);
    expect(parseImportReferences(source).map((reference) => reference.kind)).toEqual([
      'import',
      'import',
      'export',
      'export',
      'dynamic-import',
      'require',
      'require.resolve',
      'import-equals',
    ]);
  });

  it('allows same-module internal imports but rejects package and relative cross-module imports', () => {
    expect(isDeepImportSpecifier('@modern-agent/backend-model-supply/internal/router')).toBe(true);
    expect(isDeepImportSpecifier('@modern-agent/backend-model-supply/src/router')).toBe(true);
    expect(isDeepImportSpecifier('../../model-supply/src/internal/router')).toBe(true);

    const sameModule = analyzeModule({
      module: { group: 'packages', relative: 'backend/model-supply', name: 'fixture' },
      manifest: { allowedDependencies: [] },
      packageJson: {},
      files: [
        {
          path: 'packages/backend/model-supply/src/index.ts',
          content: "import { debug } from './internal/debug';",
        },
      ],
    });
    expect(codes(sameModule)).toEqual([]);

    const packageSubpath = analyzeModule({
      module: { group: 'packages', relative: 'backend/model-supply', name: 'fixture' },
      manifest: { allowedDependencies: ['backend-model-supply'] },
      packageJson: { dependencies: { '@modern-agent/backend-model-supply': 'workspace:*' } },
      files: [
        {
          path: 'packages/backend/model-supply/src/index.ts',
          content: "import { route } from '@modern-agent/backend-model-supply/src/router';",
        },
      ],
    });
    expect(codes(packageSubpath)).toEqual(['ARCH001']);

    for (const source of [
      "require.resolve('@modern-agent/backend-model-supply/internal/router');",
      "import route = require('@modern-agent/backend-model-supply/internal/router');",
    ]) {
      const violations = analyzeModule({
        module: { group: 'packages', relative: 'backend/model-supply', name: 'fixture' },
        manifest: { allowedDependencies: ['backend-model-supply'] },
        packageJson: { dependencies: { '@modern-agent/backend-model-supply': 'workspace:*' } },
        files: [{ path: 'packages/backend/model-supply/src/index.ts', content: source }],
      });
      expect(codes(violations)).toEqual(['ARCH012']);
    }
  });

  it('maps relative imports to target module ownership and preserves layer diagnostics', () => {
    const violations = analyzeModule({
      module: {
        group: 'packages',
        relative: 'frontend/fixture',
        name: 'fixture',
        root: 'C:/workspace/packages/frontend/fixture',
      },
      manifest: { allowedDependencies: [] },
      packageJson: {},
      workspaceModules: [
        {
          group: 'packages',
          relative: 'frontend/fixture',
          name: 'fixture',
          root: 'C:/workspace/packages/frontend/fixture',
        },
        {
          group: 'packages',
          relative: 'backend/model-supply',
          name: 'model-supply',
          root: 'C:/workspace/packages/backend/model-supply',
        },
      ],
      files: [
        {
          path: 'C:/workspace/packages/frontend/fixture/src/index.ts',
          content: "import { route } from '../../../backend/model-supply/src/router';",
        },
      ],
    });
    expect(codes(violations)).toEqual(['ARCH003']);
  });
});

describe('Architecture Guard regressions', () => {
  it('rejects React family imports and declarations from backend modules', () => {
    for (const source of [
      "import React from 'react';",
      "import { createRoot } from 'react-dom/client';",
    ]) {
      const violations = analyzeModule({
        module: { group: 'packages', relative: 'backend/model-supply', name: 'fixture' },
        manifest: { allowedDependencies: [] },
        packageJson: {},
        files: [{ path: 'packages/backend/model-supply/src/index.ts', content: source }],
      });
      expect(codes(violations)).toEqual(['ARCH003']);
    }

    const declared = analyzeModule({
      module: { group: 'packages', relative: 'backend/model-supply', name: 'fixture' },
      manifest: { allowedDependencies: [] },
      packageJson: { dependencies: { react: 'latest' } },
      files: [],
    });
    expect(codes(declared)).toEqual(['ARCH003']);
  });

  it('rejects internal named, star, target, wildcard, and transitive public exports', () => {
    const base = {
      module: { group: 'packages', relative: 'backend/model-supply', name: 'fixture' },
      manifest: { publicExports: ['.'], publicContractFiles: ['src/index.ts'] },
    };
    const cases = [
      {
        packageJson: { exports: { '.': './dist/index.js' } },
        indexSource: "export { debug } from './internal';",
      },
      {
        packageJson: { exports: { '.': './dist/index.js' } },
        indexSource: "export * from './internal';",
      },
      {
        packageJson: { exports: { '.': './dist/internal/index.js' } },
        indexSource: 'export const ok = true;',
      },
      {
        manifest: { publicExports: ['.', './*'] },
        packageJson: { exports: { '.': './dist/index.js', './*': './dist/*' } },
        indexSource: 'export const ok = true;',
      },
      {
        packageJson: { exports: { '.': './dist/index.js' } },
        indexSource: "export * from './bridge';",
        sourceFiles: [
          {
            path: 'packages/backend/model-supply/src/bridge.ts',
            content: "export * from './internal/debug';",
          },
        ],
      },
    ];
    for (const entry of cases) {
      const violations = analyzePublicApi({ ...base, ...entry });
      expect(codes(violations)).toContain('ARCH009');
    }

    expect(
      codes(
        analyzePublicApi({
          ...base,
          manifest: { publicExports: ['.'], publicContractFiles: ['src/contract.ts'] },
          packageJson: { exports: { '.': './dist/index.js' } },
          indexSource: "export * from './contract';",
          sourceFiles: [
            {
              path: 'packages/backend/model-supply/src/contract.ts',
              content: 'export const contract = true;',
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('rejects unsupported module loading syntax with ARCH012', () => {
    for (const source of [
      "const loaded = require('./internal/debug');",
      "import debug = require('./internal/debug');",
      "const target = './internal/debug'; import(target);",
      "const loaded = module.require('./internal/debug');",
      "const load = require; load('./internal/debug');",
      "const resolve = require.resolve; resolve('./internal/debug');",
      "const load = module.require; load('./internal/debug');",
      'const evaluate = eval; evaluate(\'require("./internal/debug")\');',
    ]) {
      const violations = analyzeModule({
        module: { group: 'packages', relative: 'backend/model-supply', name: 'fixture' },
        manifest: { allowedDependencies: [] },
        packageJson: {},
        files: [{ path: 'packages/backend/model-supply/src/index.ts', content: source }],
      });
      expect(codes(violations)).toEqual(['ARCH012']);
    }
  });
});

describe('Base-SHA authorization', () => {
  it('classifies only the shared-contracts root as frozen for WP-003 scope', () => {
    expect(isFrozenContractPath('packages/shared/contracts/src/index.ts')).toBe(true);
    expect(isFrozenContractPath('packages/shared/contracts/README.md')).toBe(false);
    expect(isFrozenContractPath('packages/shared/contracts/src/index.test.ts')).toBe(false);
    expect(isFrozenContractPath('packages/backend/task-engine/src/index.ts')).toBe(true);
    expect(isFrozenContractPath('packages/backend/task-engine/src/task-contract.ts')).toBe(true);
    expect(isFrozenContractPath('packages/backend/task-engine/src/index.test.ts')).toBe(false);
  });

  it('keeps WP-003 README and test paths scoped without weakening CCR authorization', () => {
    const workPackage = {
      file: 'docs/work-packages/WP-003-contract-kernel.md',
      content:
        '# WP-003\n\n- Status: APPROVED\n\n## Allowed write paths\n' +
        '- `packages/shared/contracts/src/**/*.test.ts`\n' +
        '- `packages/shared/contracts/README.md`\n' +
        '- `packages/shared/contracts/src/index.ts`',
    };
    const ccr = {
      file: 'docs/contract-changes/CCR-0001.md',
      content:
        '# CR-0001: WP-003 Contract Kernel\n\n' +
        '- Contract owner: shared-contracts\n' +
        '- Requested by: WP-003\n' +
        '- Current version: 0.0.0\n' +
        '- Proposed version: 1.0.0\n' +
        '- Compatibility: breaking-major\n' +
        '- Status: APPROVED\n\n' +
        '## Authorization\n- packages/shared/contracts/src/index.ts\n\n' +
        '## Problem\nProblem.\n\n' +
        '## Proposed change\nChange.\n\n' +
        '## Compatibility and affected modules\n- Consumers.\n\n' +
        '## Fixtures and conformance\n- Fixture.\n\n' +
        '## Migration / rollout / rollback\n- Rollout.',
    };

    expect(
      evaluateContractChanges({
        entries: [{ status: 'M', paths: ['packages/shared/contracts/README.md'] }],
        baseDocuments: [workPackage],
      }),
    ).toEqual([]);
    expect(
      evaluateContractChanges({
        entries: [{ status: 'M', paths: ['packages/shared/contracts/src/index.test.ts'] }],
        baseDocuments: [workPackage],
      }),
    ).toEqual([]);
    expect(
      codes(
        evaluateContractChanges({
          entries: [{ status: 'M', paths: ['packages/shared/contracts/src/index.ts'] }],
          baseDocuments: [workPackage],
        }),
      ),
    ).toContain('ARCH006');
    expect(
      evaluateContractChanges({
        entries: [{ status: 'M', paths: ['packages/shared/contracts/src/index.ts'] }],
        baseDocuments: [workPackage, ccr],
      }),
    ).toEqual([]);
  });

  it('authorizes explicit root lockfile and matches globstars without widening ordinary stars', () => {
    const workPackage = {
      file: 'docs/work-packages/WP-003-contract-kernel.md',
      content:
        '# WP-003\n\n- Status: APPROVED / PLANNING RECORD\n\n## Allowed write paths\n' +
        '- `packages/shared/contracts/src/**/*.test.ts`\n' +
        '- `pnpm-lock.yaml`',
    };
    const testPattern = 'packages/shared/contracts/src/**/*.test.ts';

    expect(extractAllowedWritePaths(workPackage.content)).toEqual([testPattern, 'pnpm-lock.yaml']);
    expect(pathMatchesPattern('packages/shared/contracts/src/index.test.ts', testPattern)).toBe(
      true,
    );
    expect(pathMatchesPattern('packages/shared/contracts/src/foo/index.test.ts', testPattern)).toBe(
      true,
    );
    expect(
      pathMatchesPattern('packages/shared/contracts/src/foo/bar/index.test.ts', testPattern),
    ).toBe(true);
    expect(
      pathMatchesPattern(
        'packages/shared/contracts/src/foo/bar.test.ts',
        'packages/shared/contracts/src/*.test.ts',
      ),
    ).toBe(false);

    expect(
      evaluateContractChanges({
        entries: [{ status: 'M', paths: ['pnpm-lock.yaml'] }],
        baseDocuments: [workPackage],
      }),
    ).toEqual([]);
    expect(
      codes(
        evaluateContractChanges({
          entries: [{ status: 'M', paths: ['unrelated-root.txt'] }],
          baseDocuments: [workPackage],
        }),
      ),
    ).toContain('ARCH011');
    expect(
      codes(
        evaluateContractChanges({
          entries: [{ status: 'M', paths: ['packages/shared/contracts/README.md'] }],
          baseDocuments: [workPackage],
        }),
      ),
    ).toContain('ARCH011');
    expect(
      codes(
        evaluateContractChanges({
          entries: [{ status: 'M', paths: [workPackage.file] }],
          baseDocuments: [workPackage],
        }),
      ),
    ).toContain('ARCH011');
  });

  it('uses PR base and parses A/M/D/R status entries without bootstrap fallback', () => {
    const calls: string[][] = [];
    const runGit = (args: string[]) => {
      calls.push(args);
      if (args[0] === 'rev-parse') return { status: 0, stdout: 'pr-base\n', stderr: '' };
      if (args[0] === 'diff')
        return { status: 0, stdout: 'R100 old/path.md new/path.md\nD\tremoved.md\n', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    };
    const range = computeChangeRange({ env: { ARCH_BASE_SHA: 'pr-base' }, runGit });
    expect(range.files).toEqual(['old/path.md', 'new/path.md', 'removed.md']);
    expect(range.entries.map((entry) => entry.status)).toEqual(['R', 'D']);
    expect(calls.some((args) => args.includes('bootstrap-v0.1.0'))).toBe(false);
  });

  it('does not infer a baseline from local main or origin/main', () => {
    const calls: string[][] = [];
    const runGit = (args: string[]) => {
      calls.push(args);
      return { status: 0, stdout: 'main-sha\n', stderr: '' };
    };
    expect(() => computeChangeRange({ env: {}, runGit })).toThrow('ARCH_BASELINE_MISSING');
    expect(calls).toEqual([]);
  });

  it('fails closed when neither PR base nor local main refs are available', () => {
    const runGit = () => ({ status: 1, stdout: '', stderr: 'missing ref' });
    expect(() => computeChangeRange({ env: {}, runGit })).toThrow('ARCH_BASELINE_MISSING');
  });

  it('rejects current WP/CCR edits and accepts only approved artifacts from BASE_SHA', () => {
    const manifest = 'packages/backend/task-engine/module.manifest.json';
    const contract = 'packages/shared/contracts/src/index.ts';
    const approvedWp = {
      file: 'docs/work-packages/WP-002-architecture-guard.md',
      content:
        '# WP-002\n\n- Status: APPROVED\n\n## Allowed implementation paths\n- ' +
        manifest +
        '\n- ' +
        contract,
    };
    const approvedCcr = {
      file: 'docs/contract-changes/CCR-0005.md',
      content:
        '# CR-0005: Add contract\n\n- Contract owner: shared-contracts\n- Requested by: WP-002\n- Current version: 0.0.0\n- Proposed version: 0.1.0\n- Compatibility: additive-minor\n- Status: APPROVED\n\n## Authorization\n- ' +
        contract +
        '\n\n## Problem\nProblem.\n\n## Proposed change\nChange.\n\n## Compatibility and affected modules\n- Consumers.\n\n## Fixtures and conformance\n- Fixture.\n\n## Migration / rollout / rollback\n- Rollout.',
    };
    const approvedAdr = {
      file: 'docs/adr/ADR-0001-manifest-scope.md',
      content:
        '# ADR-0001: Manifest scope\n\n- Status: APPROVED\n\n## Authorization\n- ' + manifest,
    };

    expect(
      evaluateContractChanges({
        entries: [{ status: 'M', paths: [manifest] }],
        baseDocuments: [approvedWp, approvedAdr],
      }),
    ).toEqual([]);
    expect(
      codes(
        evaluateContractChanges({
          entries: [{ status: 'M', paths: [manifest, approvedWp.file] }],
          baseDocuments: [approvedWp],
          workPackages: [
            {
              file: approvedWp.file,
              content: approvedWp.content + '\n## Authorization\n- ' + manifest,
            },
          ],
        }),
      ),
    ).toContain('ARCH011');
    expect(
      codes(
        evaluateContractChanges({
          entries: [{ status: 'M', paths: [contract] }],
          baseDocuments: [approvedWp, approvedCcr],
        }),
      ),
    ).toEqual([]);
    expect(
      codes(
        evaluateContractChanges({
          entries: [{ status: 'M', paths: [contract, approvedCcr.file] }],
          baseDocuments: [approvedWp, approvedCcr],
          proposals: [{ file: approvedCcr.file, content: approvedCcr.content }],
        }),
      ),
    ).toContain('ARCH011');
  });

  it('allows only planning paths after an approved GOV-001 bootstrap is in BASE_SHA', () => {
    const bootstrap = {
      file: 'docs/governance/GOV-001-execution-planning-bootstrap.md',
      content: '> STATUS: APPROVED / GOVERNANCE BOOTSTRAP',
    };
    expect(hasApprovedPlanningBootstrap([bootstrap])).toBe(true);
    expect(isPlanningOnlyPath('docs/roadmap/IMPLEMENTATION.md')).toBe(true);
    expect(isPlanningOnlyPath('docs/work-packages/WP-003-contract-kernel.md')).toBe(true);
    expect(isPlanningOnlyPath('docs/contract-changes/CCR-0006.md')).toBe(true);
    expect(isPlanningOnlyPath('docs/contract-changes/CCR-not-numbered.md')).toBe(false);
    expect(isPlanningOnlyPath('docs/work-packages/WP-002-architecture-guard.md')).toBe(false);
    expect(isPlanningOnlyPath('docs/governance/architecture-guard-baseline.json')).toBe(false);

    expect(
      evaluateContractChanges({
        entries: [
          {
            status: 'A',
            paths: [
              'docs/roadmap/IMPLEMENTATION.md',
              'docs/work-packages/WP-003-contract-kernel.md',
            ],
          },
        ],
        baseDocuments: [bootstrap],
      }),
    ).toEqual([]);

    expect(
      evaluateContractChanges({
        entries: [{ status: 'A', paths: ['docs/contract-changes/CCR-0006.md'] }],
        baseDocuments: [bootstrap],
      }),
    ).toEqual([]);

    const approvedWp = {
      file: 'docs/work-packages/WP-003-contract-kernel.md',
      content:
        '# WP-003\n\n- Status: APPROVED\n\n## Allowed write paths\n- ' +
        'packages/shared/contracts/src/index.ts',
    };
    const mixedContractChange = evaluateContractChanges({
      entries: [
        { status: 'A', paths: ['docs/contract-changes/CCR-0006.md'] },
        { status: 'M', paths: ['packages/shared/contracts/src/index.ts'] },
      ],
      baseDocuments: [bootstrap, approvedWp],
    });
    expect(codes(mixedContractChange)).toContain('ARCH006');
  });

  it('rejects planning paths without BASE authorization or mixed with implementation', () => {
    const bootstrap = {
      file: 'docs/governance/GOV-001-execution-planning-bootstrap.md',
      content: '> STATUS: APPROVED / GOVERNANCE BOOTSTRAP',
    };
    expect(
      codes(
        evaluateContractChanges({
          entries: [{ status: 'A', paths: ['docs/roadmap/IMPLEMENTATION.md'] }],
          baseDocuments: [],
        }),
      ),
    ).toContain('ARCH011');
    expect(
      codes(
        evaluateContractChanges({
          entries: [
            {
              status: 'A',
              paths: ['docs/roadmap/IMPLEMENTATION.md', 'scripts/architecture-guard.mjs'],
            },
          ],
          baseDocuments: [bootstrap],
        }),
      ),
    ).toContain('ARCH011');
  });

  it('loads GOV planning authorization from BASE documents', async () => {
    const runGit = (args: string[]) => {
      if (args[0] === 'ls-tree') {
        return {
          status: 0,
          stdout:
            'docs/governance/GOV-001-execution-planning-bootstrap.md\n' +
            'docs/work-packages/WP-003-contract-kernel.md\n',
          stderr: '',
        };
      }
      if (args[0] === 'show' && args[1]?.includes('GOV-001')) {
        return {
          status: 0,
          stdout: '> STATUS: APPROVED / GOVERNANCE BOOTSTRAP',
          stderr: '',
        };
      }
      return { status: 0, stdout: '# WP-003\n- Status: APPROVED', stderr: '' };
    };

    await expect(readBaseAuthorizationDocuments('base', runGit)).resolves.toEqual([
      {
        file: 'docs/governance/GOV-001-execution-planning-bootstrap.md',
        content: '> STATUS: APPROVED / GOVERNANCE BOOTSTRAP',
      },
      {
        file: 'docs/work-packages/WP-003-contract-kernel.md',
        content: '# WP-003\n- Status: APPROVED',
      },
    ]);
  });
});

describe('Architecture inventory', () => {
  it('keeps the mandatory checker list exact', () => {
    expect(MANDATORY_CHECKS).toEqual([
      'check-module-manifest.mjs',
      'check-boundaries.mjs',
      'check-public-api.mjs',
      'check-contract-changes.mjs',
      'check-architecture-fixtures.mjs',
    ]);
    expect(validateMandatoryChecks()).toBe(true);
    expect(
      validateBaselineRequirements({
        mandatoryChecks: MANDATORY_CHECKS.map((check) => `scripts/${check}`),
        mandatoryRuleIds: [
          'ARCH001',
          'ARCH002',
          'ARCH003',
          'ARCH004',
          'ARCH005',
          'ARCH006',
          'ARCH007',
          'ARCH008',
          'ARCH009',
          'ARCH010',
          'ARCH011',
          'ARCH012',
        ],
        mandatoryTestSuites: ['architecture-guard-unit'],
      }),
    ).toBe(true);
  });

  it('requires the BASE baseline inventory and rejects a weakened HEAD baseline', () => {
    const base = {
      mandatoryChecks: ['scripts/check-architecture-fixtures.mjs'],
      mandatoryRuleIds: ['ARCH001'],
      mandatoryTestSuites: ['architecture-fixture-integrity'],
      protectedGovernancePaths: ['tests/architecture-fixtures/**'],
      publicEntryPolicy: {
        rootOnlyByDefault: true,
        transitiveUndeclaredReExport: 'forbidden',
      },
      basePolicy: { missingBaseAction: 'fail-closed' },
    };
    const weakened = {
      ...base,
      mandatoryChecks: [],
      mandatoryRuleIds: [],
      mandatoryTestSuites: [],
      protectedGovernancePaths: [],
      publicEntryPolicy: { rootOnlyByDefault: false, transitiveUndeclaredReExport: 'allowed' },
      basePolicy: { missingBaseAction: 'skip' },
    };
    expect(validateBaselineIntegrity(base, weakened)).toHaveLength(7);
    expect(
      validateTrustedHead({
        baseBaseline: base,
        headBaseline: base,
        headFiles: ['scripts/check-architecture-fixtures.mjs', ...REQUIRED_TEST_PATHS],
        headAggregator:
          "export const MANDATORY_CHECKS = Object.freeze(['check-architecture-fixtures.mjs']);",
        headGuard: "export const ARCHITECTURE_CODES = Object.freeze({ RULE: 'ARCH001' });",
        baseMatrix: { ARCH001: ['fixture'] },
        headMatrix: { ARCH001: ['fixture'] },
        headWorkflow: `on:\n  pull_request_target:\n    - opened\nenv:\n  ARCH_BASE_SHA: base\n  ARCH_HEAD_SHA: head\n- uses: actions/checkout@v4\n  with:\n    ref: \${{ github.event.pull_request.base.sha }}\n- run: node scripts/trusted-governance-check.mjs`,
        headNormalWorkflow: 'on:\n  pull_request:\nenv:\n  ARCH_BASE_SHA: base\n- run: pnpm verify',
        changedPaths: ['scripts/check-architecture-fixtures.mjs'],
        allowedPaths: ['scripts/**'],
      }),
    ).toEqual([]);
    expect(validateFixtureMatrixIntegrity({ ARCH001: ['fixture'] }, { ARCH001: [] })).toEqual([
      'TRUSTED_FIXTURE_REMOVED ARCH001/fixture',
    ]);
    expect(validateTrustedWorkflow('on:\n  pull_request:\n- run: pnpm install')).toEqual([
      'TRUSTED_WORKFLOW_EVENT_MISSING pull_request_target',
      'TRUSTED_WORKFLOW_SHA_INPUT_MISSING ARCH_BASE_SHA/ARCH_HEAD_SHA',
      'TRUSTED_WORKFLOW_CHECKER_MISSING trusted-governance-check.mjs',
      'TRUSTED_WORKFLOW_BASE_CHECKOUT_MISSING trusted base ref',
      'TRUSTED_WORKFLOW_PR_EXECUTION dependency installation or package execution is forbidden',
    ]);
    expect(validateNormalWorkflow('on:\n  pull_request:\n- run: pnpm test')).toEqual([
      'TRUSTED_CI_GATE_MISSING pnpm verify',
      'TRUSTED_CI_BASE_INPUT_MISSING ARCH_BASE_SHA',
    ]);
  });

  it('fails when invalid fixture inventory is empty', () => {
    expect(evaluateFixtureResults([])).toContain(
      'ARCH_FIXTURE_INVENTORY missing invalid architecture fixtures',
    );
  });

  it('aggregates all fixture failures', () => {
    const failures = evaluateFixtureResults([
      { category: 'invalid', file: 'a.json', expectedCode: 'ARCH001', violations: [] },
      { category: 'invalid', file: 'b.json', expectedCode: 'ARCH003', violations: [] },
    ]);
    expect(failures).toHaveLength(2);
  });
});
