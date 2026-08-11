# Implementation Roadmap

This file is the short execution pointer for AI and human contributors. It is not a replacement for an approved Work Package or the frozen architecture documents.

## Current

### WP-001 Architecture Guard — COMPLETED

- Add executable negative fixtures for layer, dependency, public API, manifest and contract rules.
- Assign stable `ARCHxxx` diagnostics.
- Keep `main` green and do not add Agent business behavior.

## Next

### WP-002 Contract Kernel — CURRENT / PLANNED

Freeze only the contracts required by the Fake TALK vertical slice. Begin with runtime schemas, identifiers, envelopes, operation/task basics and platform errors.

## Later

| Work Package                          | Status  | Boundary                                                          |
| ------------------------------------- | ------- | ----------------------------------------------------------------- |
| WP-003 Fake TALK Vertical Slice       | PLANNED | Fake model, no real Provider                                      |
| WP-004 Persistence / Queue / SSE TALK | PLANNED | Replace fake infrastructure incrementally                         |
| WP-005 Billing Minimal Slice          | PLANNED | Quote, reserve, settle, release, ledger                           |
| WP-006 Real Model Supply TALK         | PLANNED | One logical model and one Provider channel                        |
| WP-007 TALK Stability / Recovery      | PLANNED | Reconnect, replay, retry and cancellation                         |
| Platform Contract Review 1            | GATE    | Validate that IMAGE can be added without rewriting platform cores |
| WP-008 SUMMARY                        | PLANNED | Capability plugin                                                 |
| WP-009 IMAGE                          | PLANNED | Capability plugin                                                 |

The repository does not enter a later Work Package because a future capability appears in a discussion document. A Work Package must authorize the implementation scope first.
