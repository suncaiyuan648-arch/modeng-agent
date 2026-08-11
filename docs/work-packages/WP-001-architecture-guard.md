# WP-001: Architecture Guard

## Metadata

- Owner: Repository Governance / Architecture
- Reviewer: Architecture Review
- Target: Architecture Guard implementation, unit tests, regression fixtures, and this acceptance record
- Remediation round: Round 1 after reviewer `CHANGES_REQUIRED`
- Status: COMPLETED
- Contract change: forbidden unless a current-range CCR authorizes each changed path
- Manifest change: forbidden unless a current-range WP authorizes each changed manifest path

## Goal

Make the repository architecture checks enforceable for AI-assisted development. The guard must reject boundary violations, deep imports, public API leaks, React imports from backend/shared/infrastructure, unauthorized Contract changes, and unauthorized manifest widening with stable `ARCHxxx` diagnostics.

## Non-goals

- Do not implement TALK, SUMMARY, IMAGE, VIDEO, or AUDIO business behavior.
- Do not create Prisma business tables, BullMQ consumers, provider integrations, or runtime Agent workflows.
- Do not modify unrelated security, repository-bootstrap, governance, roadmap, or product documents.
- Do not use historical WP/ADR/CCR files as authorization for a new protected change.

## Allowed write paths

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
- `docs/work-packages/WP-001-architecture-guard.md`

Any other required path needs an approved `SCOPE_AMENDMENT_REQUIRED` before modification.

## Change-range and authorization model

- In CI pull requests, use `GITHUB_BASE_SHA` as the base.
- Locally, compute `git merge-base HEAD origin/main`; fall back to `git merge-base HEAD main` only when `origin/main` is unavailable.
- The fixed `bootstrap-v0.1.0` tag is not an ordinary WP authorization baseline.
- A Contract Change Proposal authorizes only when the CCR file is itself in the current change range, passes the CCR schema, contains an `Authorization` section, and lists every changed frozen Contract path exactly.
- A Work Package authorizes a manifest only when the WP file is itself in the current change range, contains an `Authorization` section, and lists the changed manifest path exactly.
- Historical, unrelated, or merely present WP/ADR/CCR files cannot authorize a current protected change.

## Invariants

- Every invalid fixture must produce exactly one expected `ARCHxxx` diagnostic.
- AST parsing covers import declarations, side-effect imports, import type, export-from, export-star, dynamic import, and require where statically analyzable.
- Package and relative deep imports are rejected, including package `.../internal/...` and relative `../../model-supply/src/internal/...` paths.
- Backend, shared, and infrastructure modules cannot import React.
- Public entries cannot re-export `./internal` or any internal package entry.
- Fixtures remain integration/behavior tests; formal unit tests cover parser, authorization, public API, React regression, and CLI aggregation.

## Acceptance criteria

1. `pnpm architecture:check` passes and invokes manifest, boundary, public API, contract-range, and fixture checks.
2. `pnpm architecture:fixtures` passes with exact error-code assertions.
3. `pnpm test` passes with Architecture Guard unit tests in addition to existing tests.
4. `pnpm verify` passes without modifying product or Agent business behavior.
5. `pnpm verify:changed` passes.
6. Reviewer regression cases exist for historical WP/CCR, unrelated CCR, current matching CCR, package/relative deep imports, React boundary, internal named/star exports, and CLI diagnostics aggregation.

## Verification evidence

- Change range: local `git merge-base HEAD origin/main` resolved to `84df44039937019e703243d6328f0ffeb0d8aac1`.
- `pnpm architecture:fixtures`: PASS, 5 valid and 23 invalid fixtures.
- `pnpm architecture:check`: PASS, 42 manifests, boundary checks, public API checks, current-range Contract checks, and fixtures.
- `pnpm test`: PASS, 5 files and 14 tests.
- `pnpm verify`: PASS, including format, secret scan, lint, typecheck, tests, architecture checks, and 42 workspace builds.
- `pnpm verify:changed`: PASS, using the same full verification pipeline.

Remediation Round 1 is complete. Do not start WP-002 from this work package.
