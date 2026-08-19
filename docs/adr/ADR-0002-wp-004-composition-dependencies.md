# ADR-0002：WP-004 Composition Dependency Declarations

- Status：accepted
- Date：2026-08-19
- Deciders：Repository Owner
- Related CR/WP：CCR-0002 / WP-004 Fake TALK End-to-End Vertical Slice

## Authorization

- `apps/api/module.manifest.json`
- `apps/web/module.manifest.json`
- `packages/backend/agent-runtime/module.manifest.json`

## Context

The frozen modular-monolith architecture already defines applications as
composition roots and Agent Runtime as the Operation/Execution Graph
coordinator. WP-004 implements the first in-process Fake TALK slice through
those existing public package roots.

The three manifests still contain incomplete dependency allowlists. Updating
them to match the dependencies actually required by the approved slice is a
RED `allowedDependencies` change under Rules Lite even though it does not
introduce a new architectural direction.

## Decision

Authorize only these dependency declarations:

- `api` may compose Shared Contracts, Agent Runtime, Task Engine, Model Supply,
  TALK Capability, and Event & Realtime through their package roots;
- `web` may compose the approved frontend UI/runtime/realtime/conversation/TALK/
  project/workspace package roots and Shared Contracts;
- `backend-agent-runtime` may coordinate Task Engine, TALK Capability, and
  Event & Realtime through their package roots.

This decision adds no module, Owner, table, state machine, process, queue,
persistence boundary, Provider integration, or deep import.

## Alternatives considered

- Keep the manifests unchanged: rejected because executable code would depend
  on undeclared modules and the manifests would cease to be architecture facts.
- Move composition into a new module or public Port: rejected because the
  existing application and Agent Runtime boundaries already own this work.

## Consequences

- Positive：machine-readable dependency declarations match the frozen
  architecture and the WP-004 implementation.
- Negative：the three modules gain only the explicitly listed dependency edges.
- Operational：the slice remains in-process and uses deterministic Fake
  adapters; no production runtime topology changes.
- Security/Billing/Data：no credential, billing, database, retention, or data
  ownership change.

## Migration and rollback

Merge this ADR before rebasing the WP-004 implementation so it is present in
the implementation PR's BASE SHA. Rollback removes the three allowlist changes
and the corresponding WP-004 composition code together; there is no data or
external-system rollback.
