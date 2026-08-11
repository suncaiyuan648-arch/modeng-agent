# GOV-001: Execution Planning Bootstrap

> STATUS: APPROVED / GOVERNANCE BOOTSTRAP
> Main baseline: `a60dd92` (WP-002 Architecture Guard merged)

GOV-001 establishes the repository-level planning route that follows the frozen
Phase 0 Work Packages. It is governance work, not a product Work Package, and it
does not start WP-003 or authorize any implementation code.

## Owner decision

The Repository Owner approves this one-time bootstrap scope so that the project
can create a roadmap and future Work Package planning records without reopening
WP-002. The Architecture Guard remains fail-closed for ordinary implementation
changes.

## Allowed paths

This planning-only change may establish or update:

- `docs/roadmap/**`;
- `docs/work-packages/**` when the file is a future planning record, template, or
  planning-process instruction;
- `docs/governance/**` when the file directly defines planning or approval policy;
- narrowly related Architecture Guard baseline, checker, or test support only when
  it is required to recognize a planning-only change.

The following are forbidden in GOV-001:

- `apps/**`, `packages/**`, or business source files;
- Prisma tables or migrations;
- BullMQ, Worker, MQ, Provider, or storage implementation;
- TALK, IMAGE, VIDEO, AUDIO, SUMMARY, or any Agent business behavior;
- Contract Kernel implementation or Contract changes;
- reopening or editing the frozen WP-002 planning record.

## Authorization model

1. The roadmap is an execution index only; it never grants implementation
   permission.
2. A Work Package planning record in the current diff cannot authorize that same
   diff.
3. A planning PR must merge to `main` before its record can authorize a later
   implementation branch through `BASE_SHA`.
4. Planning and implementation are separate PRs:
   `planning PR -> merge main -> implementation branch -> implementation PR`.
5. Frozen Work Packages are never reopened to authorize later work.
6. This bootstrap may use a one-time Owner/Admin merge bypass if the existing
   Architecture Guard has no planning-only recognition yet. Rulesets and required
   checks must remain enabled and the bypass must not be reused for implementation.

## Standard Work Package flow

```text
planning record
  -> review and approval
  -> merge to main
  -> create implementation branch from the new main
  -> coding and verification
  -> implementation review PR
  -> merge
  -> freeze the completed Work Package
```

## Acceptance criteria

- `docs/roadmap/IMPLEMENTATION.md` is the single central execution index;
- future planning records have a documented location and approval rule;
- the roadmap records WP-000, WP-001, and WP-002 as completed/frozen;
- WP-003 remains `NOT STARTED`;
- no implementation, Contract, or Agent business path changes are included;
- the GOV-001 change is closed after its planning PR is merged.
