# <Module Display Name>

本文件只写当前模块局部规则，不复制根 `AGENTS.md` 或完整架构。

## Responsibility

Own:

- <cohesive responsibility>

Do not own:

- <neighbor responsibility>

## State and table ownership

Only writer of:

- Entity: `<Entity>`
- Table: `<table_name>`

其他模块必须使用 Public Port；当前模块也禁止直接写他域表。

## Required context

修改前读取：

- `module.manifest.json`
- `README.md`
- `index.ts`
- `contract.ts`
- 相关 tests/fixtures

## Public API

消费者只能从 `index.ts` 使用：

- `<PublicPort@version>`

没有批准的 CR，不修改 Public Contract。

## Dependencies

Allowed:

- `domain-kernel`

Forbidden:

- 其他模块 `internal/**`
- `@prisma/client`（PostgreSQL Adapter 模块除外）
- `bullmq`（Queue Adapter 模块除外）
- 非本模块拥有的 Provider SDK

## Critical invariants

- <idempotency/state/security invariant>
- <concurrency/recovery invariant>

## Mandatory verification

目标命令存在后运行：

```text
pnpm verify:module <module-name>
pnpm architecture:check
```

脚本不存在时明确报告未提供，不临时创建空检查器。

## Code Review Rules

- Flag unnecessary public surface expansion.
- Flag cross-module writes, deep imports and infrastructure leaks.
- Flag behavior changes without invariant/regression tests.
