# ADR-0001：Phase 0 Rules Lite

- Status：accepted
- Date：2026-08-19
- Deciders：Repository Owner
- Related CR/WP：Governance simplification iteration

## Authorization

- `AGENTS.md`
- `AI工程治理与Work-Package规范.md`
- `docs/adr/ADR-template.md`
- `docs/governance/README.md`
- `docs/governance/architecture-error-codes.md`
- `docs/governance/architecture-guard-baseline.json`
- `docs/governance/execution-context.json`
- `docs/governance/execution-context.schema.json`
- `docs/governance/work-package-auth.schema.json`
- `docs/governance/work-package.template.md`
- `docs/work-packages/GOV-002.auth.json`
- `docs/work-packages/README.md`
- `package.json`
- `scripts/architecture-guard.mjs`
- `scripts/check-architecture-fixtures.mjs`
- `scripts/check-contract-changes.mjs`
- `scripts/check-secrets.mjs`
- `scripts/trusted-governance-check.mjs`
- `scripts/work-package-authorization.mjs`
- `scripts/wp-doctor.mjs`
- `tests/architecture/architecture-guard.test.ts`
- `tests/architecture-fixtures/architecture-rule-matrix.json`
- `tests/architecture-fixtures/invalid/architecture-manifest-change-without-adr.json`
- `tests/architecture-fixtures/invalid/historical-wp-cannot-authorize.json`
- `tests/architecture-fixtures/invalid/manifest-without-review.json`
- `tests/architecture-fixtures/invalid/migration-without-adr.json`
- `tests/architecture-fixtures/invalid/package-json-current-wp-cannot-authorize.json`
- `tests/architecture-fixtures/invalid/package-json-without-authorization.json`
- `tests/architecture-fixtures/valid/architecture-manifest-with-adr.json`
- `tests/architecture-fixtures/valid/manifest-with-review.json`
- `tests/architecture-fixtures/valid/package-json-with-approved-wp.json`
- `tests/governance/fixtures/active-wp-does-not-inherit-history.json`
- `tests/governance/fixtures/ccr-planning-only.json`
- `tests/governance/fixtures/ccr-with-business-implementation.json`
- `tests/governance/fixtures/planning-only-wp.json`
- `tests/governance/fixtures/roadmap-status-update.json`
- `tests/governance/fixtures/unauthorized-governance-widening.json`
- `tests/governance/fixtures/wp-with-business-implementation.json`
- `tests/governance/trusted-governance.test.ts`
- `tests/governance/work-package-authorization.test.ts`
- `tests/security/check-secrets.test.mjs`

## Context

The repository's Work Package authorization model grew into an Active WP,
capability, Base-SHA, path-grant, readiness, and approval-binding engine. Product
work repeatedly stopped to repair governance edge cases before delivering a
vertical slice. Phase 0 has one product team and does not yet have the concurrent
change pressure that would justify that system.

## Decision

Adopt Rules Lite:

1. Work Packages are delivery notes, not executable permission tokens.
2. CI enforces stable module boundaries, ownership invariants, explicit Frozen
   Contracts, architecture decisions, and secrets.
3. `index.ts`, public exports, package/TypeScript configuration, and ordinary
   Manifest metadata are YELLOW: implementation may change them when needed and
   the PR reviewer checks necessity and compatibility.
4. Shared/versioned Contracts require a CCR. Owner/dependency direction,
   Migration, and other architecture decisions require an ADR.
5. The trusted governance job protects only the governance Trust Root. Product
   scope remains a reviewer responsibility.
6. The GOV-002 authorization runtime is removed. It may be reconsidered only
   after real multi-agent concurrency produces repeated conflicts.

## Alternatives considered

- Complete GOV-002: rejected because it delays product validation and keeps
  expanding the authorization model.
- Remove all governance: rejected because module boundaries, state ownership,
  Contract compatibility, and secret checks remain high-value protections.

## Consequences

- Positive：normal product changes no longer need path grants or readiness files.
- Negative：reviewers must identify out-of-scope but otherwise valid changes.
- Operational：governance Trust Root changes require repository-owner handling;
  ordinary product PRs retain automated CI.
- Security/Billing/Data：existing ownership, infrastructure-leak, contract, and
  secret checks remain enforced.

## Migration and rollback

Remove the GOV-002 executable authorization artifacts and replace WP-aware checks
with Contract/ADR and Trust Root checks in one owner-reviewed PR. Rollback is a
git revert of this ADR and its implementation; no runtime data or external system
is affected.
