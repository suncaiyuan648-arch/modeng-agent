# Future Work Package Planning Records

This directory contains Work Package planning and approval records. A planning
record is not an implementation permission until it has been reviewed, merged to
`main`, and included in the implementation branch's `BASE_SHA`.

## Required separation

Use two separate changes:

1. planning PR: add or approve the Work Package record;
2. implementation PR: implement only the scope authorized by the record already
   present in `main`.

The current implementation diff may not add or edit a Work Package record to
self-authorize its own changes. Frozen records are immutable during implementation;
scope changes require a new planning approval.

## Minimum planning record

Each future record should state:

- Owner, reviewer, phase, and status;
- goal and explicit non-goals;
- allowed write paths and forbidden paths;
- protected Contract/Manifest/Architecture change classes;
- governance prerequisites: Frozen Contract touched, CCR required, ADR required,
  Manifest change required, Architecture change required, and State-machine
  change required;
- acceptance criteria and verification commands;
- implementation handoff and freeze conditions.

## Governance prerequisites

Every Work Package planning record must state these prerequisites explicitly:

- Frozen Contract touched
- CCR required
- ADR required
- Manifest change required
- Architecture change required
- State-machine change required

This is declarative planning metadata. It documents which approval artifacts
must be reviewed before implementation; it does not add an automatic
prerequisite checker.

The central status and ordering live in
[`../roadmap/IMPLEMENTATION.md`](../roadmap/IMPLEMENTATION.md); detailed contracts
belong in the Work Package record, not in the roadmap.
