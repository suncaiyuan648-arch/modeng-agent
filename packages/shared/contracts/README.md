# shared-contracts

Runtime-validated cross-network schemas and branded identifiers.

## Contract Kernel v1

WP-003 freezes the minimum contract surface for the first Fake TALK vertical
slice. `src/index.ts` is the runtime source of truth; the exported TypeScript
types are inferred from the Zod schemas.

- Entity-specific IDs use an opaque prefix (`project_`, `operation_`, etc.) so
  a value cannot be substituted across entity references at runtime.
- All versioned values use `schemaVersion: 1` and reject unknown fields.
- `TalkSubmitCommand` is limited to `talk.submit` with bounded text and no
  provider, model, credential, or transport fields.
- `ExecutionGraphRef` is a bounded, acyclic TALK graph with one root.
- `EventEnvelope` supports accepted, output delta, completed, and failed
  events. Unknown non-critical events are retained by parsing and ignored by
  the stream projector; unknown critical events fail closed.
- `PlatformError` exposes only stable codes, safe messages, retryability, and
  bounded safe details. Provider responses, secrets, prompts, hidden
  reasoning, stack traces, and database details are rejected.

State-machine and event-stream checks are behavior-level helpers because
terminal immutability and per-operation sequence monotonicity cannot be
expressed by a single object schema.

WP-003 adds no persistence, queue, worker, provider, billing, or application
behavior.
