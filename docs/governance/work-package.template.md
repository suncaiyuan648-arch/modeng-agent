# WP-XXXX：<任务名称>

## Metadata

- Owner：
- Reviewer：
- Target module：
- Architecture baseline：1.0
- Contract change：forbidden | allowed（CR-XXXX）
- ADR change：forbidden | allowed（ADR-XXXX）
- Migration change：forbidden | allowed

## Governance prerequisites

Declare each prerequisite explicitly in every planning record. These are
planning metadata only; this template change does not introduce an automatic
prerequisite checker.

- Frozen Contract touched：yes | no
- CCR required：yes | no
- ADR required：yes | no
- Owner/dependency direction change required：yes | no
- Architecture change required：yes | no
- State-machine change required：yes | no

## Goal

一句话描述可验证结果。

## Non-goals

- 不做无关重构。

## Expected change areas

- `<path>`

## Read-only paths

- `<path>`

## Forbidden actions

- 跨模块 deep import。
- 直接访问 Prisma/BullMQ/Provider SDK 或他域表。
- 未经 CCR/ADR 修改 Frozen Contract、Owner、依赖方向或 Migration。

## Public dependencies

- `<PublicPort@version>`

## Input / output / errors

- Input：
- Output：
- Errors：

## Invariants

- <idempotency/state/concurrency invariant>

## Acceptance criteria

1. ...

## Required verification

- typecheck
- module boundary
- relevant unit/contract/conformance/integration tests

## Rollout / rollback

- Feature flag：none
- Migration：none
- Rollback：

## Delivery evidence

- 修改文件：
- 实际命令与结果：
- 未验证项：
- 剩余风险：
