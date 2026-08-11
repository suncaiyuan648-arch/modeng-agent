# Implementation Roadmap

> STATUS: NORMATIVE / MAINTAINED
> Baseline: V2.5 / 2026-08-12

This document is the central execution index for the repository. It records the
current gate, completed Work Packages, next approved planning target, and deferred
scope. It does not authorize implementation by itself.

## Current state

- Current governance work: **GOV-001 Execution Planning Bootstrap**
- Current product Work Package: **None**
- Next product Work Package: **WP-003 Contract Kernel**
- Agent business implementation in progress: **None**
- Frozen architecture source: [`01-跨模块契约与架构决策.md`](../architecture/01-跨模块契约与架构决策.md)

## Work Package status

| Work Package | Scope                                              | Status             | Evidence                             |
| ------------ | -------------------------------------------------- | ------------------ | ------------------------------------ |
| WP-000       | Repository bootstrap and verification toolchain    | COMPLETED / FROZEN | `0356ad7` / `WP-000`                 |
| WP-001       | Secret and API key protection baseline             | COMPLETED / FROZEN | `84df440` / `WP-001`                 |
| WP-002       | Architecture Guard and trusted governance baseline | COMPLETED / FROZEN | `a60dd92` / PR #1 and PR #2          |
| WP-003       | Contract Kernel for the first TALK vertical slice  | NOT STARTED        | Requires an approved planning record |

The exact Contract scope, forbidden scope, and acceptance criteria for WP-003 must
be defined only in its approved planning record. They are intentionally not
duplicated here.

## Queued work

| Order | Work Package | Intent                                           | Entry gate                       |
| ----- | ------------ | ------------------------------------------------ | -------------------------------- |
| 1     | WP-003       | Plan and freeze the minimum TALK Contract Kernel | Planning record merged to `main` |
| 2     | WP-004       | Prove the TALK path with a Fake Model            | WP-003 completed/frozen          |
| 3     | Later        | Real providers and additional capabilities       | Separate approved Work Packages  |

## Deferred scope

Until the Contract Kernel and Fake Model vertical slice are stable, do not start:

- real model-provider integrations;
- IMAGE, VIDEO, AUDIO, or SUMMARY business implementations;
- production MQ/Worker scaling changes;
- billing, campaign delivery, or promotion-center workflows;
- hostile-repository or supply-chain governance hardening.

## Change control

1. At most one product Work Package may be `CURRENT`.
2. A Work Package cannot become `CURRENT` without an approved planning record on
   `main`.
3. A frozen Work Package is not reopened by editing its original planning record.
4. Contract, manifest, architecture, owner, dependency-direction, and state-machine
   changes remain subject to Architecture Guard and the Contract Change process.
5. This roadmap never authorizes implementation changes by itself.
6. A new or modified Work Package can authorize implementation only after its
   approved planning record exists in the implementation branch's `BASE_SHA`.
