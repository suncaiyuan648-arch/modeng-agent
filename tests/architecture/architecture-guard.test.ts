import { describe, expect, it } from 'vitest';

// @ts-expect-error Architecture Guard is executable ESM without a generated declaration file.
import {
  analyzeModule,
  analyzePublicApi,
  computeChangeRange,
  evaluateContractChanges,
  isDeepImportSpecifier,
  parseImportReferences,
  parseImports,
} from '../../scripts/architecture-guard.mjs';
// @ts-expect-error Fixture runner is executable ESM without a generated declaration file.
import { evaluateFixtureResults } from '../../scripts/check-architecture-fixtures.mjs';
// @ts-expect-error Aggregator is executable ESM without a generated declaration file.
import { MANDATORY_CHECKS, validateMandatoryChecks } from '../../scripts/check-architecture.mjs';

const codes = (violations: Array<{ code: string }>) =>
  violations.map((violation) => violation.code);

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
      './required',
      './resolved',
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
      expect(codes(violations)).toEqual(['ARCH001']);
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
      manifest: { publicExports: ['.'] },
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
  });
});

describe('Base-SHA authorization', () => {
  it('uses PR base and parses A/M/D/R status entries without bootstrap fallback', () => {
    const calls: string[][] = [];
    const runGit = (args: string[]) => {
      calls.push(args);
      if (args[0] === 'rev-parse') return { status: 0, stdout: 'pr-base\n', stderr: '' };
      if (args[0] === 'diff')
        return { status: 0, stdout: 'R100 old/path.md new/path.md\nD\tremoved.md\n', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    };
    const range = computeChangeRange({ env: { GITHUB_BASE_SHA: 'pr-base' }, runGit });
    expect(range.files).toEqual(['old/path.md', 'new/path.md', 'removed.md']);
    expect(range.entries.map((entry) => entry.status)).toEqual(['R', 'D']);
    expect(calls.some((args) => args.includes('bootstrap-v0.1.0'))).toBe(false);
  });

  it('uses local main before stale origin/main and computes merge-base', () => {
    const runGit = (args: string[]) => {
      if (args[0] === 'rev-parse' && args[2] === 'main^{commit}')
        return { status: 0, stdout: 'main-sha\n', stderr: '' };
      if (args[0] === 'rev-parse') return { status: 1, stdout: '', stderr: '' };
      if (args[0] === 'merge-base') return { status: 0, stdout: 'merge-sha\n', stderr: '' };
      if (args[0] === 'diff') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    };
    expect(computeChangeRange({ env: {}, runGit })).toMatchObject({
      baseRef: 'merge-sha',
      source: 'merge-base(main)',
    });
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
