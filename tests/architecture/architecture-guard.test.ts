import { describe, expect, it } from 'vitest';

// @ts-expect-error Architecture Guard is executable ESM without a generated declaration file.
import {
  analyzeModule,
  analyzePublicApi,
  computeChangeRange,
  evaluateContractChanges,
  isDeepImportSpecifier,
  parseExports,
  parseImports,
} from '../../scripts/architecture-guard.mjs';
// @ts-expect-error Fixture runner is executable ESM without a generated declaration file.
import { evaluateFixtureResults } from '../../scripts/check-architecture-fixtures.mjs';

describe('Architecture Guard parser', () => {
  it('extracts import, side-effect, type, export, dynamic import, and require specifiers', () => {
    const source = `
      import type { Contract } from '@modern-agent/shared-contracts';
      import '@modern-agent/backend-model-supply/internal/router';
      export { debug } from './internal';
      export * from '../../model-supply/src/internal/router';
      const lazy = import('./lazy');
      const required = require('./required');
      const value: Contract | undefined = lazy && required;
    `;

    expect(parseImports(source)).toEqual([
      '@modern-agent/shared-contracts',
      '@modern-agent/backend-model-supply/internal/router',
      './internal',
      '../../model-supply/src/internal/router',
      './lazy',
      './required',
    ]);
    expect(parseExports(source)).toEqual(['./internal', '../../model-supply/src/internal/router']);
  });

  it('recognizes package and relative deep imports', () => {
    expect(isDeepImportSpecifier('@modern-agent/backend-model-supply/internal/router')).toBe(true);
    expect(isDeepImportSpecifier('../../model-supply/src/internal/router')).toBe(true);
    expect(isDeepImportSpecifier('@modern-agent/backend-model-supply')).toBe(false);
  });
});

describe('Architecture Guard regressions', () => {
  it('rejects React imports from backend modules', () => {
    const violations = analyzeModule({
      module: { group: 'packages', relative: 'backend/model-supply', name: 'fixture' },
      manifest: { allowedDependencies: [] },
      packageJson: {},
      files: [
        {
          path: 'packages/backend/model-supply/src/index.ts',
          content: "import React from 'react';",
        },
      ],
    });

    expect(violations.map((violation: { code: string }) => violation.code)).toEqual(['ARCH003']);
  });

  it('rejects internal named and star re-exports from a public entry', () => {
    const base = {
      module: { group: 'packages', relative: 'backend/model-supply', name: 'fixture' },
      manifest: { publicExports: ['.'] },
      packageJson: { exports: { '.': './dist/index.js' } },
    };
    for (const indexSource of [
      "export { debug } from './internal';",
      "export * from './internal';",
    ]) {
      const violations = analyzePublicApi({ ...base, indexSource });
      expect(violations.map((violation: { code: string }) => violation.code)).toEqual(['ARCH009']);
    }
  });
});

describe('Architecture authorization', () => {
  it('uses the PR base SHA and never the bootstrap tag', () => {
    const calls: string[][] = [];
    const runGit = (args: string[]) => {
      calls.push(args);
      if (args[0] === 'rev-parse') return { status: 0, stdout: 'pr-base\n', stderr: '' };
      if (args[0] === 'diff') return { status: 0, stdout: 'package.json\n', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    };

    const range = computeChangeRange({
      env: { GITHUB_BASE_SHA: 'pr-base' },
      runGit,
    });

    expect(range).toMatchObject({
      baseRef: 'pr-base',
      source: 'pull-request-base',
      files: ['package.json'],
    });
    expect(calls.some((args) => args.includes('bootstrap-v0.1.0'))).toBe(false);
  });

  it('computes a local merge-base from origin/main or main', () => {
    const runGit = (args: string[]) => {
      if (args[0] === 'rev-parse' && args[2] === 'origin/main^{commit}') {
        return { status: 1, stdout: '', stderr: '' };
      }
      if (args[0] === 'rev-parse') return { status: 0, stdout: 'main-sha\n', stderr: '' };
      if (args[0] === 'merge-base') return { status: 0, stdout: 'merge-sha\n', stderr: '' };
      if (args[0] === 'diff')
        return { status: 0, stdout: 'docs/work-packages/WP-001.md\n', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    };

    expect(computeChangeRange({ env: {}, runGit })).toMatchObject({
      baseRef: 'merge-sha',
      source: 'merge-base(main)',
    });
  });

  it('binds authorization to current CCR/WP files and exact protected paths', () => {
    const contractPath = 'packages/shared/contracts/src/index.ts';
    const ccr = {
      file: 'docs/contract-changes/CCR-0005.md',
      content: `# CR-0005: Add contract

- Contract owner: shared-contracts
- Requested by: WP-001
- Current version: 0.0.0
- Proposed version: 0.1.0
- Compatibility: additive-minor

## Authorization
- ${contractPath}

## Problem
Problem.

## Proposed change
Change.

## Compatibility and affected modules
- Consumers.

## Fixtures and conformance
- Fixture.

## Migration / rollout / rollback
- Rollout.`,
    };

    expect(evaluateContractChanges({ files: [contractPath, ccr.file], proposals: [ccr] })).toEqual(
      [],
    );
    expect(
      evaluateContractChanges({
        files: [contractPath],
        proposals: [ccr],
      }).map((violation: { code: string }) => violation.code),
    ).toEqual(['ARCH006']);
    expect(
      evaluateContractChanges({
        files: ['packages/backend/task-engine/module.manifest.json'],
        workPackages: [
          {
            file: 'docs/work-packages/WP-000-old.md',
            content: '## Authorization\n- packages/backend/task-engine/module.manifest.json',
          },
        ],
      }).map((violation: { code: string }) => violation.code),
    ).toEqual(['ARCH011']);
  });
});

describe('Architecture CLI diagnostics', () => {
  it('aggregates all fixture failures instead of stopping at the first one', () => {
    const failures = evaluateFixtureResults([
      { category: 'invalid', file: 'a.json', expectedCode: 'ARCH001', violations: [] },
      { category: 'invalid', file: 'b.json', expectedCode: 'ARCH003', violations: [] },
    ]);

    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('a.json');
    expect(failures[1]).toContain('b.json');
  });
});
