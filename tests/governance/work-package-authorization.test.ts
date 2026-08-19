import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error Authorization Core is executable ESM without generated declarations.
import {
  AUTHORIZATION_CODES,
  computeReadiness,
  evaluateWpScope,
  loadActiveAuthorization,
  parseAuthorizationDocument,
  validateAuthorizationDocument,
  validateExecutionContextDocument,
} from '../../scripts/work-package-authorization.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(file: string) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, file), 'utf8')) as Record<string, unknown>;
}

function authorization(overrides: Record<string, unknown> = {}) {
  return {
    $schema: '../governance/work-package-auth.schema.json',
    schemaVersion: '2',
    id: 'WP-100',
    kind: 'WORK_PACKAGE',
    status: 'APPROVED',
    targetModules: ['frontend-agent-ui'],
    scope: [{ module: 'frontend-agent-ui', zones: ['implementation', 'controlled'] }],
    capabilities: ['compile-config'],
    requiredCCR: [],
    requiredADR: [],
    requiredGovernancePrerequisites: [],
    forbiddenCapabilities: [],
    ...overrides,
  };
}

describe('Rules V2 authorization core', () => {
  it('validates the repository authorization and execution context documents', () => {
    const auth = readJson('docs/work-packages/GOV-002.auth.json');
    const context = readJson('docs/governance/execution-context.json');

    expect(validateAuthorizationDocument(auth).valid).toBe(true);
    expect(validateExecutionContextDocument(context).valid).toBe(true);
  });

  it('rejects malformed authorization instead of accepting an implicit scope', () => {
    const invalid = authorization({ capabilities: ['owner-change'] });

    expect(validateAuthorizationDocument(invalid).valid).toBe(false);
    expect(() => parseAuthorizationDocument(JSON.stringify(invalid))).toThrow(
      AUTHORIZATION_CODES.INVALID_SCHEMA,
    );
  });

  it('reads only the authorization selected by Active WP from BASE_SHA', () => {
    const context = {
      $schema: './execution-context.schema.json',
      schemaVersion: '2',
      activeWorkPackage: 'WP-101',
      authorizationPath: 'docs/work-packages/WP-101.auth.json',
      basePolicy: { environmentVariable: 'BASE_SHA', missingBaseAction: 'fail-closed' },
    };
    const activeAuthorization = authorization({ id: 'WP-101' });
    const files = new Map([
      ['docs/governance/execution-context.json', JSON.stringify(context)],
      ['docs/work-packages/WP-101.auth.json', JSON.stringify(activeAuthorization)],
    ]);
    const shown: string[] = [];
    const runGit = (args: string[]) => {
      if (args[0] === 'rev-parse') {
        return { status: 0, stdout: 'base\n', stderr: '' };
      }
      const requested = args[1]?.replace('base:', '');
      shown.push(requested ?? '');
      const content = files.get(requested ?? '');
      return { status: content === undefined ? 1 : 0, stdout: content ?? '', stderr: '' };
    };

    const loaded = loadActiveAuthorization({
      requestedWorkPackage: 'WP-101',
      baseRef: 'base',
      runGit,
    });

    expect(loaded.authorization?.id).toBe('WP-101');
    expect(shown).toEqual([
      'docs/governance/execution-context.json',
      'docs/work-packages/WP-101.auth.json',
    ]);
    expect(shown.some((file) => file.includes('WP-100'))).toBe(false);
  });

  it('does not inherit a historical WP-100 path when Active WP is WP-101', () => {
    const fixture = readJson(
      'tests/governance/fixtures/active-wp-does-not-inherit-history.json',
    ) as {
      executionContext: Record<string, unknown>;
      historicalAuthorization: Record<string, unknown>;
      activeAuthorization: Record<string, unknown>;
      change: Record<string, string>;
    };

    expect(
      evaluateWpScope({
        context: { ...fixture.executionContext, activeWorkPackage: 'WP-100' },
        authorization: fixture.historicalAuthorization,
        changes: [fixture.change],
      }),
    ).toEqual([]);

    const violations = evaluateWpScope({
      context: fixture.executionContext,
      authorization: fixture.activeAuthorization,
      changes: [fixture.change],
    });
    expect(violations.map((violation: { code: string }) => violation.code)).toEqual([
      AUTHORIZATION_CODES.MODULE_NOT_TARGETED,
    ]);
  });

  it('allows GREEN implementation and authorized YELLOW capability, but blocks RED', () => {
    const current = authorization();
    const context = { activeWorkPackage: current.id };

    expect(
      evaluateWpScope({
        context,
        authorization: current,
        changes: [
          { path: 'src/internal/chat.ts', module: 'frontend-agent-ui', zone: 'implementation' },
        ],
      }),
    ).toEqual([]);
    expect(
      evaluateWpScope({
        context,
        authorization: current,
        changes: [
          {
            path: 'tsconfig.json',
            module: 'frontend-agent-ui',
            zone: 'controlled',
            capability: 'compile-config',
          },
        ],
      }),
    ).toEqual([]);
    expect(
      evaluateWpScope({
        context,
        authorization: current,
        changes: [
          {
            path: 'module.manifest.json',
            module: 'frontend-agent-ui',
            zone: 'controlled',
            capability: 'owner-change',
          },
        ],
      }).map((violation: { code: string }) => violation.code),
    ).toEqual([AUTHORIZATION_CODES.RED_CAPABILITY]);
  });

  it('computes readiness from active authorization and required approvals', () => {
    const current = authorization({ requiredCCR: ['CCR-0002'], requiredADR: ['ADR-0001'] });
    const loaded = {
      activeWorkPackage: current.id,
      authorization: current,
      source: 'BASE_SHA',
      baseRef: 'base',
    };

    const notReady = computeReadiness({
      requestedWorkPackage: current.id,
      loaded,
      requiredApprovals: {
        ccr: [{ id: 'CCR-0002', exists: false, approved: false }],
        adr: [{ id: 'ADR-0001', exists: true, approved: false }],
        prerequisites: [],
      },
      requireTrustedBase: true,
    });
    expect(notReady.ready).toBe(false);
    expect(notReady.blockedReasons.map((reason: { code: string }) => reason.code)).toEqual([
      AUTHORIZATION_CODES.REQUIRED_CCR_MISSING,
      AUTHORIZATION_CODES.REQUIRED_ADR_MISSING,
    ]);

    const ready = computeReadiness({
      requestedWorkPackage: current.id,
      loaded,
      requiredApprovals: {
        ccr: [{ id: 'CCR-0002', exists: true, approved: true }],
        adr: [{ id: 'ADR-0001', exists: true, approved: true }],
        prerequisites: [],
      },
      requireTrustedBase: true,
    });
    expect(ready.ready).toBe(true);

    const workingTreeOnly = computeReadiness({
      requestedWorkPackage: current.id,
      loaded: { ...loaded, source: 'working-tree', baseRef: undefined },
      requiredApprovals: {
        ccr: [{ id: 'CCR-0002', exists: true, approved: true }],
        adr: [{ id: 'ADR-0001', exists: true, approved: true }],
        prerequisites: [],
      },
      requireTrustedBase: true,
    });
    expect(workingTreeOnly.ready).toBe(false);
    expect(workingTreeOnly.blockedReasons.map((reason: { code: string }) => reason.code)).toEqual([
      AUTHORIZATION_CODES.BASE_MISSING,
    ]);
  });
});
