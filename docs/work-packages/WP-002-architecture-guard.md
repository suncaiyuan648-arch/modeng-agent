# WP-002: Architecture Guard

## Planning / Approval

- Owner: Repository Governance / Architecture
- Reviewer: Architecture Review
- Phase: Phase 0
- Status: APPROVED
- Implementation branch: `wp/002-architecture-guard`
- Approval rule: this planning record is immutable during implementation

This Work Package is the approved authorization source for the Architecture Guard implementation. It is committed to `main` before the implementation branch is created. The implementation branch must read this file from its `BASE_SHA`; a current-diff copy or modification never grants additional permission.

## Goal

Provide stable, fail-closed Architecture Guard checks for module boundaries, dependency manifests, public API surfaces, protected Contract/Manifest changes, and the guard's own test inventory.

## Allowed implementation paths

- `scripts/architecture-guard.mjs`
- `scripts/check-architecture-fixtures.mjs`
- `scripts/check-boundaries.mjs`
- `scripts/check-public-api.mjs`
- `scripts/check-contract-changes.mjs`
- `scripts/check-architecture.mjs`
- `tests/architecture/**`
- `tests/architecture-fixtures/**`
- `docs/governance/architecture-error-codes.md`
- `.github/workflows/ci.yml`
- `package.json`

The following are explicitly outside this Work Package: all Agent business behavior, Provider integrations, Prisma business tables, BullMQ consumers, frozen Phase planning, this WP document, existing WP documents, ADRs, CCRs, and module business source files.

## Protected change classes

The implementation must fail closed for changes to any of the following unless an approval artifact already exists in `BASE_SHA`:

- `packages/**/module.manifest.json`
- controlled `apps/**/package.json` and `packages/**/package.json`
- frozen Contract paths under `packages/**/src/index.ts`, `packages/shared/contracts/**`, and contract/state-machine files
- architecture or dependency direction changes requiring an ADR / Architecture Review
- deletion or rename of any protected path, including both old and new rename paths

The changed paths must be a subset of the approved Work Package scope recorded in this file at `BASE_SHA`. Current-diff additions or modifications to WP, ADR, or CCR files cannot authorize the same implementation diff.

## Acceptance criteria

1. Layer boundary violations produce stable `ARCHxxx` diagnostics.
2. Cross-module imports use only approved public package roots; same-module internal imports remain legal.
3. Relative imports resolve to actual workspace module ownership.
4. Public APIs cannot directly or transitively expose internal implementation.
5. Manifest/package dependency widening is guarded, including declared-but-unused forbidden dependencies.
6. Protected Contract, Manifest, and Architecture changes require approval artifacts present in `BASE_SHA`.
7. Current-diff changes to WP/ADR/CCR cannot self-authorize.
8. A/M/D/R changes are all evaluated, including old and new rename paths.
9. Mandatory check and fixture inventories are self-validating; missing invalid coverage fails.
10. Existing architecture rules cannot silently regress.
11. PR CI passes the explicit trusted base SHA and fails closed when unavailable.
12. Formal checker unit tests and negative integration fixtures pass under `pnpm verify`.

## Threat model boundary

The supported source subset is statically analyzable TypeScript/ESM. The guard must either analyze an import form or reject it explicitly; unsupported CommonJS forms (`require`, `require.resolve`, and `ImportEqualsDeclaration`) must not silently pass.

## Implementation handoff

Implementation starts only from the commit containing this approved planning record. The implementation branch must not modify this file. Any scope change requires a new planning approval commit on `main` before implementation continues.
