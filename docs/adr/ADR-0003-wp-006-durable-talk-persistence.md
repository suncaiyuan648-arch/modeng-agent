# ADR-0003：WP-006 Durable TALK Persistence and Consistency Boundary

- Status：accepted
- Date：2026-08-21
- Deciders：Repository Owner
- Related CR/WP：CCR-0004 / WP-006 Durable TALK Facts

This record becomes implementation authority only after it is merged to
`main`. Its acceptance in a governance branch does not authorize implementation
from that branch.

## Authorization

- `prisma/schema.prisma`
- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20260821000000_wp006_durable_talk_facts/migration.sql`
- `packages/backend/agent-runtime/module.manifest.json`
- `packages/backend/event-realtime/module.manifest.json`
- `packages/infrastructure/persistence-postgres/module.manifest.json`
- `apps/api/module.manifest.json`

## Context

WP-005 proved real TALK streaming, but Agent Runtime Operations, Execution Graphs,
command idempotency receipts, and Event replay still live in process memory.
Restarting the API therefore loses business facts and can accept the same command
as a new Operation.

The frozen architecture already requires PostgreSQL to be the business fact
source, Event & Realtime to own Event sequence/replay, Agent Runtime to own
Operation/Execution Graph state, and PostgreSQL adapters to remain partitioned by
Owner. WP-006 is the first implementation that needs both Owner partitions to
commit related facts atomically. It also introduces the first real Migration and
therefore needs an exact RED-path, table-ownership, dependency, transaction, and
deployment decision before implementation.

WP-006 deliberately provides durable facts, not durable execution. TaskRun,
attempt, Lease, checkpoint, Worker recovery, Outbox, Redis, and BullMQ remain
deferred to their queued Work Packages.

## Decision

### 1. PostgreSQL authority and exact table ownership

WP-006 may add exactly these five business tables:

| Table                | Sole writer Owner        | Purpose                                                      |
| -------------------- | ------------------------ | ------------------------------------------------------------ |
| `ai_operation`       | `backend-agent-runtime`  | Operation projection and optimistic version                  |
| `ai_execution_graph` | `backend-agent-runtime`  | one immutable TALK graph per Operation                       |
| `ai_execution_node`  | `backend-agent-runtime`  | the graph's bounded TALK node set                            |
| `ai_command_receipt` | `backend-agent-runtime`  | principal-scoped idempotency claim and versioned digest      |
| `ai_event`           | `backend-event-realtime` | committed Event envelope, per-Operation sequence, and replay |

`infrastructure-persistence-postgres` owns no business state or table. It only
implements Owner public Ports, runs the approved Migration, and composes the
narrow transaction boundary. It must not export `PrismaClient`, generated Prisma
models, a transaction client, raw SQL, a generic repository, or a cross-Owner
query surface.

The implementation manifests must record these exact architecture facts:

- `backend-agent-runtime` declares `Operation`, `ExecutionGraph`, and
  `CommandReceipt` in `ownsState`; the four Agent Runtime tables in `ownsTables`;
  and `backend-agent-runtime` in `migrationScopes`.
- `backend-event-realtime` declares `EventEnvelope`, `EventSequence`, and
  `EventReplay` in `ownsState`; only `ai_event` in `ownsTables`; and
  `backend-event-realtime` in `migrationScopes`.
- `infrastructure-persistence-postgres` keeps `ownsState`, `ownsTables`,
  `readOnlyTables`, and `migrationScopes` empty. Its `allowedDependencies` may
  add only `shared-contracts`, `backend-agent-runtime`, and
  `backend-event-realtime` to the existing `shared-domain-kernel` edge.
- `api` may add only `infrastructure-persistence-postgres` to its existing
  `allowedDependencies`. Agent Runtime, Event & Realtime, TALK, Task Engine, and
  API must not import Prisma or raw SQL.

CCR-0004 separately authorizes the versioned Contract and conformance metadata
that share the Agent Runtime and Event & Realtime manifest paths.

### 2. Schema and Migration boundary

The single approved initial Migration is expand-only and may create only the five
tables, their Owner-local relationships, and the constraints/indexes required by
WP-006:

- unique `(principal_scope, idempotency_key)` and unique `operation_id` on
  `ai_command_receipt`;
- unique `operation_id` on `ai_execution_graph`;
- unique `(graph_id, ordinal)` on `ai_execution_node`;
- unique/indexed `(operation_id, sequence)`, unique `event_id`, and
  unique/indexed `delivery_position` on `ai_event`;
- an index supporting Operation project/status/update scans; and
- bounded status, Event type, digest-algorithm, schema-version, and domain values.

Owner-local foreign keys may protect Graph, Node, Receipt, and Operation
relationships. `ai_event.operation_id` remains an opaque cross-Owner reference;
WP-006 does not add a cross-Owner foreign key or cascade policy. Event payload
JSON starts as `unknown` when read and must pass the existing Event envelope
runtime parser before leaving the adapter.

`ai_event.delivery_position` is a database-generated `BIGINT IDENTITY` storage
identity only. It may contain rollback gaps, does not represent transaction commit
order, is not used by WP-006 SSE, and is not exposed by a public Contract. No
future Outbox, WebSocket, or global-delivery behavior may infer semantics from it
without a later ADR/CCR.

No `last_sequence` field is added to `ai_operation`, and no sixth sequence/cursor
table is permitted. No TaskRun, Outbox, Conversation, Message, ProviderExecution,
Billing, Artifact, or Model Catalog table is authorized.

### 3. Event sequence allocation

Event & Realtime owns sequence allocation. Each Event append in a short
transaction must:

1. derive a deterministic signed 64-bit advisory key from the full Operation ID
   with a documented, cross-process stable cryptographic digest mapping;
2. acquire `pg_advisory_xact_lock(bigint)` through parameterized adapter-local
   SQL;
3. while holding that lock, query `MAX(sequence)` for the full
   `operation_id` and allocate `MAX + 1`; and
4. insert the validated Event under the unique `(operation_id, sequence)`
   constraint.

The advisory key is only a serialization bucket. A rare hash collision may reduce
concurrency but cannot change the full `operation_id` query predicate, return an
Event from another Operation, or merge streams. The implementation must not use a
JavaScript process-random hash, a read-then-write allocator without the lock, or an
Agent Runtime-owned counter.

An existing `event_id` with identical canonical Event content is idempotent and
returns the committed Event. Reusing that ID with different content is an existing
safe `CONFLICT`; it never rewrites history. Transaction serialization failures or
allocator unique conflicts use a bounded retry of the entire short unit of work,
not a retry of only the Event insert, so Owner projections and Events cannot
diverge.

### 4. Narrow cross-Owner transaction composition

`TalkRuntimeUnitOfWorkPort@1`, defined by Agent Runtime and specified by
CCR-0004, is the only cross-Owner transaction seam authorized by WP-006. Its
callback receives only transaction-scoped `AgentRuntimeMutationPortV1` and
`EventMutationPortV1` interfaces. The PostgreSQL implementation creates both
interfaces over one Prisma interactive transaction without exposing that
transaction to either Owner's domain logic or to consumers.

The following pairs must be atomic:

- a new Operation, Graph, Node, Command Receipt, and `operation.accepted` Event;
- terminal Operation projection and matching `operation.completed`; and
- terminal Operation projection and matching `operation.failed`.

Delta persistence is the sole Event-only transaction shape: a bounded non-empty
group of `talk.output.delta` Events for one accepted, non-terminal Operation and
no projection mutation. An identical receipt claim or unsuccessful conditional
transition may commit as a no-op. No other single-sided or mixed mutation shape is
authorized.

The sole successful projection-only transaction is the existing
`accepted -> running` transition before Provider I/O. It conditionally updates one
Operation using its expected version, returns the incremented version, and appends
no Event because the frozen Contract defines no `operation.running` Event. Any
other successful nonterminal projection-only transition is forbidden.

The UoW implementation must keep a transaction-local mutation ledger and validate
it before commit against CCR-0004's closed result union. It rolls back a claim
without its accepted Event, a terminal transition without its matching terminal
Event (or the reverse), mismatched Operation/status/payload facts, mixed
Operations, unknown Event producer intent, empty delta groups, and every extra
mutation. It also rolls back a projection-only transition other than
`accepted -> running`, or that transition combined with an Event/extra mutation.
Thus atomic pairing and the one explicit projection-only exception are executable
behavior rather than caller convention.

Transaction-scoped participant wrappers are active only during the awaited
callback. The UoW tracks all started scoped calls, closes the scope when the
callback returns, rejects non-conforming callback results, validates the ledger,
and invalidates both wrappers before resolving. A captured participant cannot
perform storage work after the callback.

The transaction promise resolves only after commit. Event & Realtime may publish
an in-process wake-up hint only after that successful resolution; rollback must
publish nothing. Provider/HTTP/OSS I/O, Task execution, SSE waiting, sleeps, and
stream consumption are forbidden inside the callback.

This is a TALK-specific application seam, not a generic Unit of Work framework.
It does not authorize an Owner registry, arbitrary callbacks over Prisma, a
`repository<T>`, a cross-domain DAO, or either Owner directly writing the other's
table.

### 5. Runtime and recovery constraints

PostgreSQL `ai_command_receipt` becomes the only production idempotency authority.
The receipt stores server-provided principal scope, idempotency key, Operation
reference, `sha256-v1`, and a fixed-length SHA-256 digest of the existing canonical
TALK fingerprint. It does not store the canonical string, prompt, Provider data,
or a client-supplied identity. The in-memory shared-contract guard may remain only
in contract tests/Fakes and must not be called by the production Agent Runtime.

Provider-frame output is coalesced inside Agent Runtime before persistence. The
implementation selects one deterministic default in the approved 30–100 ms range
plus a bounded character threshold, tests it through an internal clock/scheduler
seam, emits only non-empty bounded deltas, and flushes buffered output before a
terminal Event. A database transaction per Provider frame and a transaction held
for the full stream are forbidden.

If the current in-memory Task Engine cannot create or start the TaskRun after
`operation.accepted` commits, Agent Runtime must immediately attempt the atomic
accepted-to-failed mutation and `operation.failed` append. If that convergence
transaction also fails, the process fails closed so the next exclusive startup
can reconcile it.

Startup reconciliation is allowed only under a non-overlapping single-process
deployment:

1. stop routing new traffic to the old API;
2. wait for or terminate it and positively confirm the old process has exited;
3. start the new API;
4. before readiness, scan `accepted | running` Operations by stable keyset pages,
   repeatedly until exhaustion, and conditionally commit one matching failed
   projection/Event per Operation; then
5. advertise readiness.

The scanner must process more than one page in acceptance tests. Repeated startup
is idempotent and never overwrites a terminal Operation or appends a second
terminal Event. Rolling, blue-green, overlapping replicas, cross-node live fan-out,
Lease/heartbeat ownership, and automatic Provider continuation are not supported.

The schema may be N/N-1 compatible only in the narrow expand-migration sense. That
compatibility does not authorize old and new binaries to serve concurrently.

### 6. Test and CI boundary

The implementation must run Fake and real PostgreSQL adapters through the same
CCR-0004 conformance suites. PostgreSQL tests use package-local Testcontainers,
apply the approved Migration to a clean database, fail rather than skip when their
required Docker runtime is unavailable, and are discovered by the existing
`pnpm verify` path.

This ADR does not authorize changes to `.github/workflows/**`, the root
`package.json`, `vitest.config.ts`, architecture/governance trust roots, or a new
CI bypass. Prisma CLI and Client versions must be lockstep-pinned in package-local
metadata and the existing lockfile.

## Alternatives considered

- Keep in-memory Maps and replay: rejected because restart loses authoritative
  facts and idempotency.
- Give all five tables to the PostgreSQL infrastructure package: rejected because
  adapters do not own business state.
- Let Agent Runtime write `ai_event` in the same transaction: rejected because
  Event & Realtime exclusively owns Event sequence and replay invariants.
- Put `last_sequence` on `ai_operation`: rejected because it leaks Event-owned
  sequence state into an Agent Runtime-owned table.
- Add a sixth sequence table: rejected because the advisory-lock allocator and
  unique constraint satisfy Phase-0 correctness without another fact lifecycle.
- Allocate with `MAX(sequence) + 1` without a transaction advisory lock: rejected
  because concurrent writers can select the same next value.
- Add an Outbox, Worker, BullMQ, Lease, or recovery scheduler now: rejected because
  WP-006 has no durable execution consumer and those lifecycles belong to later
  Work Packages.
- Support rolling deployment by treating all non-terminal rows as stale: rejected
  because a new process could fail Operations still executing in the old process.
- Introduce a generic persistence service or global Unit of Work: rejected because
  it would bypass Owner Ports and widen the public surface beyond the one required
  TALK transaction.

## Consequences

- Positive：TALK Operation, Graph, idempotency receipt, and Event history survive
  API restart; replay and projection/terminal Event consistency become testable
  against PostgreSQL.
- Negative：the first release requires PostgreSQL and a short deployment outage;
  it still cannot resume an interrupted Provider request.
- Operational：startup is fail-closed until database connection, clean Migration
  compatibility, and keyset reconciliation complete. Event live notification
  remains local to one API process; reconnect uses PostgreSQL replay.
- Security/Billing/Data：`DATABASE_URL` remains backend-only; raw SQL is
  parameterized and adapter-local; receipts persist only a versioned digest, not
  prompt text; Event/runtime data has no new retention or deletion policy; Billing
  is unchanged.

## Migration and rollback

1. Merge WP-006's Planning Record, this ADR, and CCR-0004 to `main` before creating
   the implementation branch.
2. Implement `prisma/schema.prisma` and exactly
   `prisma/migrations/migration_lock.toml` plus
   `prisma/migrations/20260821000000_wp006_durable_talk_facts/migration.sql`
   together. Review clean apply, generated SQL, locks/timeouts, required indexes,
   and N/N-1 schema parsing.
3. Implement Owner Ports/adapters and conformance suites before switching the API
   composition to PostgreSQL.
4. Deploy with the explicit stop-old/confirm-exit/start-new/readiness sequence.

Before any implementation or data exists, rollback is a documentation-only revert
of this ADR and CCR-0004. After the expand Migration has been applied, rollback is
forward repair with the new binary stopped; an automated drop of populated tables
or an automatic return to in-memory authority is forbidden. If implementation
needs another table, Migration path, Owner, dependency edge, overlapping deployment,
state, protocol, or consistency boundary, stop and submit a focused ADR/CCR.
