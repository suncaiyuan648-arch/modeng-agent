# WP-002 Amendment A1 — Architecture Guard Trust Root

## Planning / Approval

- Parent Work Package: `WP-002 Architecture Guard`
- Amendment: `A1`
- Owner: Repository Governance / Architecture
- Reviewer: Architecture Review
- Phase: Phase 0
- Status: APPROVED
- Applies from: the `main` commit that adds this amendment and its BASE governance baseline
- Implementation branch: `wp/002-architecture-guard`
- Approval rule: this amendment is immutable during the implementation round it authorizes

This amendment changes the governance model of WP-002. It does not implement or modify the
Architecture Guard. The implementation branch must rebase onto the commit containing this
amendment before Remediation Round 2 begins.

## Reason

The repository-local Architecture Guard, its fixture matrix, its unit tests, and its checker
aggregator cannot be the sole trust root for protecting their own integrity. A checker modified
inside the same implementation diff could otherwise weaken the inventory that is supposed to
protect it.

## Trust Model

The implementation diff is untrusted. The minimum governance requirements and authorization facts
come from:

1. `BASE_SHA`, which owns the approved Work Package, Contract/Architecture approvals, and the
   immutable governance baseline.
2. An external repository merge gate, which prevents a pull request from merging when the trusted
   governance check or normal CI fails.

Current-diff additions or modifications to WP, ADR, CCR, baseline, checker, fixture, test, or CI
files cannot grant permission or reduce the minimum requirements for that same diff.

## Trusted BASE Baseline

`docs/governance/architecture-guard-baseline.json` is the machine-readable minimum inventory.
Protected checks must read this file from `BASE_SHA`; they must never use the current-diff copy as
the source of minimum requirements.

The baseline owns:

- mandatory architecture checks;
- mandatory `ARCHxxx` rule IDs;
- mandatory architecture test suites;
- public-entry policy;
- supported source-language and module-loading policy;
- protected governance paths.

The implementation may add coverage, but it must not remove or weaken a BASE requirement.

## Base SHA Policy

`ARCH_BASE_SHA` is the only trusted input for protected-change authorization.

- Pull requests: `github.event.pull_request.base.sha`.
- Push events: `github.event.before` when the event supplies a valid previous commit.
- Local runs: the developer must provide `ARCH_BASE_SHA` explicitly.
- Missing, malformed, or unavailable base: fail closed with `ARCH_BASELINE_MISSING`.
- Protected checks must not guess a baseline from `main`, `origin/main`, tags, `HEAD~`, or the
  current `HEAD`.

Authorization artifacts are read from the BASE tree only. Current-diff WP, ADR, CCR, and baseline
files are ordinary changed paths and cannot authorize themselves.

## Language Threat Model

Workspace source under `apps/**/src/**` and `packages/**/src/**` is a statically analyzable
TypeScript ESM subset.

Supported module references are the forms the checker explicitly parses: ESM import/export
declarations and string-literal dynamic `import()`.

The following forms are unsupported and must be rejected with stable `ARCH012
UNSUPPORTED_MODULE_LOADING` diagnostics rather than silently ignored:

- `require()`;
- `require.resolve()`;
- `module.require()`;
- TypeScript `ImportEqualsDeclaration`;
- non-string-literal dynamic `import()`;
- generated or indirect module loading through `eval` or an alias.

The guard is not required to resolve arbitrary JavaScript metaprogramming. It must reject the
unsupported syntax at the boundary.

## Public Entry Policy

Cross-module imports use package-root public entries only. A module root public entry may expose
only files explicitly declared by its manifest `publicContractFiles` field.

- Root export key `"."` is the default and remains the only public package key unless separately
  approved.
- Wildcard public subpaths are forbidden by default.
- A root `index.ts` may directly re-export only declared public contract files.
- Re-exporting an undeclared bridge, internal file, wildcard target, or transitive implementation
  is forbidden.
- The manifest schema and module manifests must be migrated to declare `publicContractFiles`
  before this policy is enforced for every module.

## External Merge Gate

The repository must add a trusted governance check that runs from BASE/main code on
`pull_request_target` and treats the PR head only as untrusted file-tree data. It must not
checkout the PR head, install PR dependencies, or execute PR scripts.

Normal `pull_request` CI continues to run tests and verification against the PR code. Both the
trusted governance check and normal CI are required before merge.

The `main` repository ruleset must require pull requests, the trusted governance check, normal CI,
and no force-push/direct-merge bypass. `CODEOWNERS` is an ownership declaration in this phase;
mandatory Code Owner approval may be enabled when multi-person collaboration begins.

## Additional Implementation Scope for Remediation Round 2

After this amendment is present in `BASE_SHA`, the implementation branch may add or modify only:

- `docs/governance/architecture-guard-baseline.json` only through an approved planning amendment;
- `docs/governance/module-manifest.schema.json` for `publicContractFiles`;
- `apps/**/module.manifest.json` and `packages/**/module.manifest.json` for the approved field
  migration;
- `scripts/trusted-governance-check.mjs`;
- `tests/governance/**`;
- `.github/workflows/trusted-governance.yml`;
- `.github/CODEOWNERS`;
- the original WP-002 implementation and test paths already approved by WP-002.

No Agent business behavior, Provider integration, Prisma business table, BullMQ consumer, frozen
Phase plan, unrelated WP, ADR, CCR, or product source change is authorized by this amendment.

## Acceptance Additions

1. The trusted checker reads the mandatory inventory from `BASE_SHA`, not PR HEAD.
2. Removing or weakening a mandatory checker, rule, test suite, fixture matrix entry, CI gate, or
   protected governance path fails the trusted governance check.
3. A current diff cannot self-authorize by changing WP, ADR, CCR, baseline, checker, fixture, test,
   or workflow files.
4. Unsupported module-loading syntax fails explicitly; parser gaps do not silently pass.
5. Public-entry validation uses the approved manifest declaration and does not require an
   unbounded symbol-graph resolver.
6. `pull_request_target` never executes PR-head code.
7. `pnpm verify`, `pnpm verify:changed`, architecture fixtures, and formal unit tests remain green.

## Required Sequence

1. Commit this amendment and `architecture-guard-baseline.json` to `main`.
2. Rebase `wp/002-architecture-guard` onto that approval commit.
3. Implement Remediation Round 2 within the amended scope.
4. Run the trusted governance check and normal CI.
5. Stop for Reviewer approval; do not mark WP-002 completed or start another WP automatically.
