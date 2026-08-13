# WP-003: Contract Kernel

## Metadata

- Owner: Repository Owner / Architecture
- Reviewer: Architecture Review
- Target module: `shared-contracts` (`@modern-agent/shared-contracts`)
- Supporting read-only modules: `shared-domain-kernel`, Agent Runtime, Workspace/Conversation, Task Engine, Event & Realtime, and TALK capability manifests
- Phase: Phase 0 — first Fake TALK vertical slice
- Status: APPROVED / PLANNING RECORD
- Architecture baseline: V2.5 / frozen `docs/architecture/00-*` and `docs/architecture/01-*`
- Contract change: allowed within this record; no unrelated Contract Change Proposal is authorized
- ADR change: forbidden unless a conflict is discovered and separately approved
- Migration change: forbidden

This record authorizes a later implementation branch only after this planning
record has been reviewed and merged into `main`. It does not authorize the current
planning diff, and it does not implement the Contract Kernel.

## Goal

Define the smallest runtime-validated Contract Kernel required to carry one Fake
TALK request through the first vertical slice: accept one user command, create one
Operation, represent its bounded execution graph and TaskRun, emit ordered events,
return a minimal text result, and report a sanitized platform error when the run
fails.

The Contract Kernel is a shared language and validation boundary. It is not a
Workflow DSL, a provider abstraction, a persistence model, or a general Agent
platform schema.

## Why now

WP-000 through WP-002 established the repository, secret protection, module
boundaries, Base-SHA authorization, and planning governance. The frozen
architecture explicitly identifies WP-003 as the point where the first TALK
vertical slice may freeze its minimum `Brand ID`, `Command/Event`, `Project`,
`Operation`, `Execution Graph`, `TaskRun`, `Artifact Base`, and `Platform Error`
contracts. Defining these boundaries before Fake TALK implementation prevents the
frontend, backend, and test doubles from inventing incompatible DTOs.

## Allowed write paths

The later WP-003 implementation branch may write only:

- `packages/shared/contracts/src/index.ts`;
- `packages/shared/contracts/src/**/*.test.ts`;
- `packages/shared/contracts/README.md` for the module contract notes;
- `packages/shared/contracts/package.json` only when adding the single runtime
  schema dependency required by the approved implementation;
- `pnpm-lock.yaml` only for that corresponding dependency resolution.

The implementation may not modify `module.manifest.json`, package exports, other
shared packages, application manifests, or any backend/frontend business module.
If the chosen runtime schema dependency requires a manifest, public-export, or
architecture change, stop and report `CONTRACT_CHANGE_REQUIRED` rather than
expanding this scope.

## Read-only dependencies

The implementation may read, but not modify, the following:

- `AGENTS.md` and all applicable nested `AGENTS.md` files;
- `docs/roadmap/IMPLEMENTATION.md`;
- `docs/architecture/00-总体架构与依赖边界.md`;
- `docs/architecture/01-跨模块契约与架构决策.md`;
- `docs/governance/**` and the approved Work Package/Contract templates;
- `packages/shared/contracts/module.manifest.json`, `README.md`, `AGENTS.md`,
  `package.json`, and current `src/index.ts`;
- `packages/shared/domain-kernel/**` through its public root only;
- the manifests and public roots for Agent Runtime, Workspace/Conversation, Task
  Engine, Event & Realtime, TALK capability, and the three application roots.

Read-only dependencies are context, not permission to widen this Work Package.

## Forbidden scope

This Work Package must not:

- implement Fake TALK or any real TALK handler;
- implement IMAGE, VIDEO, AUDIO, SUMMARY, Campaign, Billing, or Provider contracts;
- create or modify Prisma tables, migrations, repositories, or persistence adapters;
- implement BullMQ, Redis, Worker, queue, lease, outbox, SSE, or WebSocket behavior;
- add provider SDKs, credentials, model routing, billing, quotas, or rate limits;
- add Conversation/Message persistence schemas beyond the command payload needed by
  the minimal TALK slice;
- define a generic Workflow DSL, arbitrary graph conditions, loops, scheduling, or
  batch semantics;
- modify frozen architecture, module ownership, dependency direction, manifests,
  public exports, or package boundaries;
- add transport-specific DTO copies or frontend-only/backend-only competing truths.

## Proposed Contract surface

The implementation must use runtime schemas as the source of truth and derive
TypeScript types from them. All externally received values start as `unknown` and
are validated before entering a domain module. The exact field names below are the
minimum v1 surface; fields not listed are not implicitly authorized.

### 1. Branded identifiers and version

- `BrandId`: opaque tenant/brand scope identifier.
- `ProjectId`, `OperationId`, `ExecutionGraphId`, `ExecutionNodeId`, `TaskRunId`,
  `ArtifactId`, `CommandId`, `EventId`: opaque identifiers with no cross-entity
  string substitution.
- `schemaVersion`: literal major version `1` on every network envelope and
  versioned value.

No Brand aggregate, Project settings, membership, or persistence schema is part of
this Work Package.

### 2. Project reference

`ProjectRef` is an immutable reference used to scope the operation:

- `projectId: ProjectId`;
- `brandId: BrandId`;
- `domain: "TALK"`.

It does not define project title, lifecycle, archive behavior, Conversation
storage, permissions, or Campaign fields.

### 3. TALK submit Command

`TalkSubmitCommand` is the only user command in v1:

- envelope: `schemaVersion`, `commandId`, `idempotencyKey`, `type`;
- `type: "talk.submit"`;
- `project: ProjectRef`;
- `input.text: string` with an explicit bounded length;
- no provider/model/credential fields.

The command is a request, not evidence of completion. `idempotencyKey` is scoped
to the caller and must not be reused for a different payload.

### 4. Event envelope and minimal event set

`EventEnvelope` is the only cross-module event transport shape:

- `schemaVersion`, `eventId`, `operationId`, `sequence`, `occurredAt`, `type`,
  `payload`;
- `sequence` is strictly increasing per Operation;
- unknown non-critical event types are retained and ignored by a projector;
- malformed or unknown critical events fail closed.

The minimal Fake TALK event set is:

- `operation.accepted`: references the created `Operation` and root graph;
- `talk.output.delta`: an ordered text fragment for the assistant response;
- `operation.completed`: references the final `ArtifactBase`;
- `operation.failed`: carries `PlatformError`.

TaskRun progress events are not required for the first Fake Model and are not
added merely to anticipate future asynchronous providers.

### 5. Operation reference and state

`OperationRef` contains only:

- `operationId`, `project: ProjectRef`, `status`, `executionGraphId`,
  `createdAt`, and optional `completedAt`;
- v1 statuses: `accepted | running | completed | failed | cancelled`;
- terminal states are immutable; `cancelled` is not inferred from a client timeout.

The Contract Kernel does not define phase labels, provider jobs, billing state, or
retries. A retry policy belongs to a later Work Package and must not add a second
status machine here.

### 6. Execution Graph reference

`ExecutionGraphRef` describes the bounded graph needed by one Fake TALK operation:

- `executionGraphId`, `operationId`, `rootNodeId`;
- a finite list of nodes, each with `nodeId`, `kind: "talk"`, and `dependsOn`;
- v1 must accept a single root node and must reject cycles, unknown dependencies,
  duplicate node IDs, and unbounded graph size.

This is a structural reference, not an executable workflow language. Conditions,
loops, parallel branches, batching, scheduling, and user-defined node types are
out of scope.

### 7. TaskRun reference

`TaskRunRef` is the minimum public reference to the Task Engine fact:

- `taskRunId`, `operationId`, `nodeId`, `attempt`, `status`;
- v1 statuses: `pending | running | completed | failed`.

Lease, heartbeat, checkpoint, queue job, worker identity, and retry persistence
remain Task Engine internals and are not exposed by this Contract Kernel.

### 8. Artifact base

`ArtifactBase` is metadata only:

- `artifactId`, `operationId`, `kind: "text"`, `status`, `schemaVersion`,
  `createdAt`;
- v1 statuses: `draft | ready | failed`;
- `operation.completed` references the artifact; the artifact does not embed
  provider data, credentials, raw prompts, or storage implementation details.

The text payload is limited to the Fake TALK output path and must not become a
general IMAGE/VIDEO/AUDIO artifact schema.

### 9. Platform Error

`PlatformError` is the sanitized cross-boundary error shape:

- stable `code` from a documented v1 set;
- user-safe `message`;
- `retryable: boolean`;
- optional safe `details` with an explicitly bounded shape.

It must never contain secrets, provider credentials, raw provider responses,
system prompts, hidden reasoning, stack traces, or database details. Clients must
branch on `code`, not on `message`.

## Acceptance Criteria

1. The record is merged to `main` before any WP-003 implementation branch is
   created.
2. The implementation contains only the approved v1 surface above; no unlisted
   business DTO is added “for future use”.
3. Every schema rejects malformed input, unknown required fields, invalid IDs,
   invalid version, invalid enum values, oversized text, and invalid graph cycles.
4. Command idempotency is deterministic for the same key and payload and rejects
   reuse with a different payload.
5. Event sequence is monotonic per Operation and terminal Operation state cannot
   transition back to a non-terminal state.
6. A single-node Fake TALK graph and one TaskRun reference validate successfully.
7. The event set can represent accepted → output delta(s) → completed and accepted
   → failed without transport-specific DTOs.
8. Platform errors are sanitized and stable; secret/provider/raw-internal fields
   are rejected or stripped before crossing the boundary.
9. No Prisma, migration, BullMQ, Redis, Worker, Provider, Billing, or application
   source files change.
10. No module manifest, package export, owner, dependency direction, or frozen
    architecture file changes.

## Required tests

The later implementation must add tests under the shared-contracts test zone:

- schema acceptance and rejection tests for every proposed surface;
- branded identifier and `schemaVersion` tests;
- command idempotency and bounded text tests;
- event ordering, duplicate sequence, unknown-event, and terminal-state tests;
- execution graph single-node, cycle, duplicate-node, unknown-dependency, and size
  limit tests;
- TaskRun status and attempt validation tests;
- ArtifactBase and PlatformError redaction tests;
- one fixture showing the Fake TALK command/event sequence without a real provider;
- a public-root import test proving no internal/deep import is required.

No test may start a database, queue, Redis, Worker, Provider SDK, or network call.

## Verification commands

The implementation PR must run, with the PR base passed explicitly:

```text
pnpm verify:module shared-contracts
pnpm test
pnpm architecture:fixtures
ARCH_BASE_SHA=<PR base SHA> pnpm architecture:check
pnpm verify:changed
pnpm verify
```

On Windows, if local line-ending normalization causes a format-only diagnostic,
report it separately; CI remains the authoritative Linux verification environment.

## Contract change policy

- This record authorizes only the listed v1 Contract surface after it is present in
  the implementation branch `BASE_SHA`.
- Any new field, event type, status, identifier, owner, public export, or semantic
  change outside this record requires `CONTRACT_CHANGE_REQUIRED` and a separately
  approved Contract Change Proposal/ADR.
- Additive optional fields within the same major still require schema, fixture,
  compatibility, and conformance review; they are not silently added.
- Removing fields, changing meaning, changing state transitions, or reusing an
  event type requires a new major/versioned approval.
- The planning record in the current diff cannot authorize implementation changes.

## Completion rule

WP-003 planning is complete when this record is reviewed, merged to `main`, and
the roadmap still reports WP-003 as the next product Work Package. This planning
task then stops. WP-003 implementation is a separate future Work Package phase;
no implementation branch, code, schema, migration, provider, queue, or business
behavior is created by this record.
