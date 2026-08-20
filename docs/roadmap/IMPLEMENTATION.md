# Implementation Roadmap

> STATUS: NORMATIVE / MAINTAINED
> Baseline: V2.5 / 2026-08-12

This document is the central execution index for the repository. It records the
current gate, completed Work Packages, next approved planning target, and deferred
scope. It does not authorize implementation by itself.

## Current state

- Current governance work: **GOV-001 Execution Planning Bootstrap**
- Current product Work Package: **None**
- Next product Work Package: **WP-006 Durable TALK Facts**
- Agent business implementation in progress: **None**
- Frozen architecture source: [`01-跨模块契约与架构决策.md`](../architecture/01-跨模块契约与架构决策.md)

## Work Package status

| Work Package | Scope                                              | Status             | Evidence                    |
| ------------ | -------------------------------------------------- | ------------------ | --------------------------- |
| WP-000       | Repository bootstrap and verification toolchain    | COMPLETED / FROZEN | `0356ad7` / `WP-000`        |
| WP-001       | Secret and API key protection baseline             | COMPLETED / FROZEN | `84df440` / `WP-001`        |
| WP-002       | Architecture Guard and trusted governance baseline | COMPLETED / FROZEN | `a60dd92` / PR #1 and PR #2 |
| WP-003       | Contract Kernel for the first TALK vertical slice  | COMPLETED / FROZEN | `5d1d49a` / PR #13          |
| WP-004       | Fake TALK end-to-end vertical slice                | COMPLETED / FROZEN | `6302e7f` / PR #24          |
| WP-005       | Real TALK Provider + Model Supply foundation       | COMPLETED / FROZEN | `59ce02f` / PR #27          |

The frozen WP-003 scope and acceptance criteria remain defined by its approved
planning record and implementation evidence. The original WP-003 planning record
is not reopened by later Work Packages.

## Queued work

| Order | Work Package | Intent                                                  | Entry gate                                                  |
| ----- | ------------ | ------------------------------------------------------- | ----------------------------------------------------------- |
| 1     | WP-006       | PostgreSQL durable Operation/Graph/Receipt/Event replay | Approved plan + merged WP-006 ADR/CCR; WP-005 frozen        |
| 2     | WP-007       | Conversation/Message persistence and multi-turn base    | WP-006 completed/frozen; separate approved planning record  |
| 3     | WP-008       | Durable Task/Worker recovery with Redis/BullMQ          | WP-007 completed/frozen; separate approved planning record  |
| 4     | WP-009       | IMAGE vertical slice                                    | TALK durability/recovery stable; separate approved planning |

## Deferred scope

The following scope remains deferred until its own queued entry gate above is
satisfied; approval of WP-006 planning or its ADR/CCR does not release a later
Work Package:

- Conversation/Message/history and multi-turn Context remain deferred until
  WP-006 is completed/frozen and WP-007 has a separately approved planning record;
- TaskRun persistence, Redis/BullMQ, Lease, Scheduler, Outbox delivery, and
  production MQ/Worker scaling remain deferred until WP-007 is completed/frozen
  and WP-008 has a separately approved planning record;
- IMAGE remains deferred until TALK durability/recovery is stable and WP-009 has
  a separately approved planning record; VIDEO, AUDIO, and SUMMARY require their
  own later approved Work Packages;
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
