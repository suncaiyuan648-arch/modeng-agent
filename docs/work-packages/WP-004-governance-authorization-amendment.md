# WP-004 Planning Amendment: Governance Delivery Authorization

> This is a supplemental authorization under WP-004. It does not create a new
> Work Package, public architecture, Contract, Port, Owner, state machine, or
> implementation branch.

## Metadata

- Parent Work Package: WP-004 Fake TALK End-to-End Vertical Slice
- Status: APPROVED / PLANNING RECORD
- Purpose: authorize the separate Apple Design Reference governance delivery
  that the parent WP-004 Plan requires before implementation readiness.
- Lifecycle after parent Planning PR merge: APPROVED / IMPLEMENTATION_BLOCKED
- Contract change: NO
- ADR required: NO; this amendment only records governance file scope.
- Coding authorization: NO

## Scope

The parent WP-004 Plan requires these two governance artifacts to enter `main`
before a WP-004 implementation branch is created:

- `docs/design/apple-design-reference-policy.md`
- `packages/frontend/AGENTS.md` for the canonical policy pointer

This amendment makes that already-reviewed, governance-only delivery scope
machine-readable for the trusted governance gate. It does not authorize
frontend implementation, token CSS, package exports, dependency changes, CCR
creation, or any product behavior.

## Allowed write paths

- `docs/design/apple-design-reference-policy.md`
- `packages/frontend/AGENTS.md`

No other path is authorized by this amendment. The policy must continue to
follow the Apple source priority, semantic-token ownership, `MODENG_DERIVED`,
accessibility, licensing, and prohibition rules in the parent WP-004 Plan.

## Completion rule

After this amendment is merged to `main`, the separate Apple Design Reference
governance PR may merge those two paths. The focused CCR-0002 remains a later,
separate gate and may cover only `ModelExecutionPort@1`.
