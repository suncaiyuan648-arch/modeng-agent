# GOV-002 Design Supplement: Architecture Engine V2

> STATUS: APPROVED / GOVERNANCE DESIGN SUPPLEMENT
> Applies only after this record is merged to `main` and present in the implementation branch's trusted `BASE_SHA`.

## Purpose

This supplement freezes the five design decisions required for GOV-002 Coder B to complete the Rules V2 Architecture Engine. It is a planning and authorization record only. This change does not implement a checker, change a schema, migrate a Manifest, or authorize product work.

Markdown remains explanatory governance evidence, not an executable Work Package scope source. The later implementation must encode these decisions in machine-readable schemas and records and load authorization and classification policy from trusted `BASE_SHA`.

## Frozen design decisions

### 1. Capabilities are module-scoped

YELLOW capabilities belong to a specific module scope, never to the Work Package as a global permission set. GREEN implementation remains available only for a target module. A controlled change passes only when every capability required by that change is granted to that same module. RED changes cannot be authorized by a capability.

The minimal schema migration may move capabilities into entries under `scope`. It must not reintroduce arbitrary path allowlists or historical Work Package permission unions.

### 2. Change evaluation is multi-fact

A changed path may produce zero or more YELLOW capability requirements and zero or more RED protected-change facts. All facts must pass independently. Matching one capability or approval must never authorize the rest of a compound file change. This applies in particular to compound `package.json` and `module.manifest.json` changes.

### 3. BASE Manifest carries YELLOW and RED semantics

The Manifest model must express implementation patterns, controlled patterns with their complete capability sets, and frozen patterns with their protected kinds.

Classification must use the Manifest stored in `BASE_SHA`. A HEAD Manifest is only data under review and cannot downgrade or authorize its own diff. Unknown fields, unmatched module files, overlapping zones, controlled patterns without capabilities, and frozen patterns without a recognized protected kind must fail closed.

Public entry, public surface, public Contract, and internal implementation are distinct concepts. A filename such as `src/index.ts` does not make a file a Contract. `publicContractFiles` must resolve to frozen contract-change policy.

### 4. RED approvals bind to exact changes

CCR and ADR authorization must use schema-validated machine approval records loaded from `BASE_SHA`. Each record must include at least:

- approval ID and type;
- approved status;
- module;
- protected kind;
- authorized path and, when applicable, target or Manifest field.

Every RED fact must match its own approval record. An unrelated approved CCR or ADR is never a wildcard. Markdown CCR/ADR documents retain reasoning, compatibility, and review context but are not the executable approval source.

Owner/Decider identity strengthening beyond existing repository facts is deferred; Coder B must not invent an identity or signature system.

### 5. Phase 0 has exactly one Active Implementation WP

GOV-002 accepts repository-wide serial implementation for Phase 0. Authorization comes from exactly one Active WP in trusted `BASE_SHA`; a stale or changed base requires checks to run again. `IMPLEMENTATION_BLOCKED`, `COMPLETED`, and `FROZEN` authorizations cannot grant implementation permission.

Multiple Active WPs, per-branch execution contexts, merge-queue architecture, and distributed authorization are deferred.

## Coder B implementation authorization intent

After this supplement is merged to `main`, Coder B is authorized to make the minimum governance changes needed to implement the five decisions and the original Architecture Engine responsibilities. The implementation branch must start from that merged `main`, use it as trusted `BASE_SHA`, and remain limited to:

- Work Package authorization schema and GOV-002 machine authorization migration;
- Module Manifest schema semantics for controlled capabilities and frozen kinds;
- machine-readable CCR/ADR approval schema and companion records required by the active GOV-002 implementation;
- Architecture invariants, Manifest validation, WP scope, computed readiness integration, and protected-change enforcement;
- architecture/governance tests and fixtures directly covering those behaviors.

The intended repository locations are limited to:

- `docs/governance/work-package-auth.schema.json`;
- `docs/governance/module-manifest.schema.json`;
- a narrowly named machine approval schema under `docs/governance/`;
- `docs/work-packages/GOV-002.auth.json`;
- machine approval companions under `docs/contract-changes/` and `docs/adr/`;
- existing Architecture Engine and authorization scripts under `scripts/`;
- directly related fixtures under `tests/architecture/`, `tests/architecture-fixtures/`, and `tests/governance/`.

This intent is narrower than a general permission to change governance. The subsequent machine schema and Active WP authorization must encode module-scoped capabilities and exact protected approvals before they can authorize ordinary product implementation.

## Required Coder B behavior

The implementation must:

- enforce computed readiness before scope evaluation;
- classify all changed paths, including rename/delete old and new paths, from BASE Manifest policy;
- require every capability and every precisely matched RED approval;
- distinguish dependency synchronization from dependency-direction changes;
- derive lockfile permission only from fully authorized package dependency changes;
- include `optionalDependencies` in the unified dependency model;
- enforce Manifest `forbiddenImports` for source imports and dependency declarations;
- remove WP Markdown Allowed Paths parsing from Architecture Engine execution;
- remain unaware of specific WP IDs.

## Explicit non-authorization

Coder B is not authorized to:

- modify WP-004 or any other product implementation;
- change Product Contract, Product Owner, table ownership, or dependency direction without an exact machine approval already present in BASE;
- implement Coder C Trusted Governance, workflow, baseline, or full Manifest migration work;
- introduce WP-specific exceptions, multi-Active-WP behavior, merge queues, cryptographic approvals, or new business architecture;
- treat this planning diff or a HEAD schema as authorization for itself.

## Sequencing and review

1. Merge this planning record and its prerequisite reference to `main`.
2. Create a fresh Coder B implementation branch from the resulting `main`.
3. Run `wp:doctor` and implementation checks against that trusted base.
4. Reviewer B reviews Coder B; Coder B does not review itself.
5. Coder C begins only after Reviewer B approval and merge.

## Planning acceptance

- The five design decisions are explicit and frozen.
- Coder B's implementation intent and non-scope are explicit.
- The later Coder B implementation is blocked unless this supplement is present in its trusted BASE.
- No schema, checker, fixture, workflow, Manifest, product file, or implementation behavior changes in this planning branch.
