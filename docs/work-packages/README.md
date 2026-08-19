# Work Package Delivery Notes

This directory contains product delivery notes. A Work Package describes the
goal, non-goals, acceptance criteria, architecture constraints, and expected
change areas. It is not a machine-readable file permission token.

## Recommended flow

Use a separate planning change only when a RED decision must land first:

1. ordinary GREEN/YELLOW work: plan and implementation may ship in one PR;
2. Frozen Contract, Owner/dependency direction, Migration, or governance change:
   merge the CCR/ADR/owner decision before the dependent implementation.

Reviewers judge scope from the requested outcome and actual diff. CI deliberately
does not parse Allowed Paths, Active WP, capability grants, or readiness metadata.

## Minimum planning record

Each future record should state:

- Owner, reviewer, phase, and status;
- goal and explicit non-goals;
- expected change areas and explicit non-goals;
- protected Contract/Manifest/Architecture change classes;
- RED prerequisites: Frozen Contract, Owner/dependency direction, Migration,
  governance Trust Root, or state-machine change;
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

This is planning metadata for humans and AI reviewers. It does not add an
automatic prerequisite or path-authorization checker.

The central status and ordering live in
[`../roadmap/IMPLEMENTATION.md`](../roadmap/IMPLEMENTATION.md); detailed contracts
belong in the Work Package record, not in the roadmap.
