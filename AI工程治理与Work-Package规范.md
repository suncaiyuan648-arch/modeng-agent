# AI 工程治理与 Work Package 规范

> 版本：1.0  
> 日期：2026-08-11  
> 状态：Architecture Baseline 1.0 的实施附件  
> 关联架构：[AI Agent Platform Architecture V2.5](./React-Node-全栈Agent架构规范.md)

## 0. 目的

本规范不增加业务模块，解决的是多人/多 AI 并行开发时的工程漂移：

- AI 为了方便跨模块 deep import、直接使用 Prisma/BullMQ/Provider SDK。
- 两个实现者同时修改 Operation、ExecutionNode、TaskRun 或 Ledger。
- Fake 与真实 Adapter 类型相同但行为不同。
- 实现任务私自修改 Public Contract、Migration 或依赖方向。
- `domain-kernel`、Platform Core、`shared/utils` 逐渐变成垃圾桶。

核心规则：

```text
Architecture Baseline
-> Module Manifest
-> Public Contract + Runtime Schema
-> Contract Fixtures + Conformance Suite
-> Work Package
-> Implementation
-> CI + Delivery Self-check
```

普通实现任务只负责灰盒内部；Module Boundary、Owner、Public Contract、Invariant 和 Architecture Taste 由人或明确授权的架构任务维护。

## 1. 推荐治理目录

```text
agent-platform/
├── docs/
│   ├── architecture/
│   │   └── baseline-1.0.md
│   ├── adr/
│   │   └── ADR-0001-*.md
│   ├── contract-changes/
│   │   └── CR-0001-*.md
│   ├── work-packages/
│   │   ├── active/
│   │   └── completed/
│   └── governance/
│       ├── module-manifest.schema.json
│       ├── work-package.schema.json
│       └── retention-policies.md
├── packages/
│   └── <module>/
│       ├── README.md
│       ├── module.manifest.json
│       ├── index.ts
│       ├── contract.ts
│       ├── internal/
│       ├── testing/
│       └── tests/
└── tools/
    └── architecture-check/
```

Phase 0 可以先用 JSON Schema + 自研小型检查脚本，无需一开始引入庞大治理平台。

## 2. Module Manifest 模板

Manifest 是给 AI、CI 和 Reviewer 共同读取的静态事实，不参与运行时服务发现。

```json
{
  "$schema": "../../docs/governance/module-manifest.schema.json",
  "schemaVersion": "1.0.0",
  "name": "billing-credits",
  "kind": "deep-module",
  "description": "Owns product quote, reservation, settlement and credit ledger.",
  "ownsState": [
    "BillingQuote",
    "CreditReservation",
    "BillingSettlement",
    "CreditAccount",
    "CreditLedger"
  ],
  "ownsTables": [
    "product_sku",
    "price_book_version",
    "price_book_entry",
    "billing_quote",
    "billing_quote_line",
    "credit_reservation",
    "billing_settlement",
    "credit_account",
    "credit_ledger"
  ],
  "readOnlyTables": [],
  "migrationScopes": [
    "backend-billing-credits"
  ],
  "publicExports": [
    "BillingQuotePort",
    "CreditReservationPort",
    "SettlementPort"
  ],
  "allowedDependencies": [
    "shared-domain-kernel",
    "backend-platform-core"
  ],
  "forbiddenImports": [
    "@prisma/client",
    "bullmq",
    "@modern-agent/backend-model-supply/internal/**",
    "@modern-agent/backend-capability-*/internal/**"
  ],
  "contracts": [
    {
      "name": "BillingQuotePort",
      "owner": "backend-billing-credits",
      "version": "1.0.0"
    }
  ],
  "errorCodes": [
    "BILLING_QUOTE_EXPIRED",
    "INSUFFICIENT_CREDITS",
    "BILLING_VERSION_CONFLICT"
  ],
  "featureFlags": [],
  "retentionPolicies": [
    "billing-financial-audit@1"
  ],
  "conformanceSuites": [
    "BillingPortContractSuite@1"
  ],
  "fileZones": {
    "frozen": [
      "module.manifest.json",
      "contract.ts"
    ],
    "controlled": [
      "index.ts"
    ],
    "implementation": [
      "internal/**",
      "adapters/**",
      "tests/**",
      "testing/**"
    ]
  }
}
```

### 2.1 Manifest 必须满足的 invariant

1. `name` 在仓库唯一并与包名一致。
2. 一张业务表只能出现在一个 Manifest 的 `ownsTables`。
3. `readOnlyTables` 与 `ownsTables` 不得重叠。
4. Migration 必须声明 `migrationScopes`，且只能修改 Owner 表或经 ADR 批准的关系约束。
5. 实际 import 必须是 `allowedDependencies` 子集。
6. 跨包 import 只能指向目标包根公开入口。
7. 实际 public export 必须在 `publicExports` 中。
8. Frozen/Controlled 路径必须能映射到当前 Work Package 权限。
9. Public Contract 必须声明 owner/version/fixtures。
10. Error code 全局唯一，并由一个 Manifest 拥有语义。
11. 使用的 Feature Flag 和 Retention Policy 必须声明 Owner/版本。
12. `domain-kernel` Manifest 使用 allowlist；未在 allowlist 的导出直接失败。

### 2.2 禁止把 Manifest 变成什么

- 不把它变成动态 DI、远程插件下载或运行时脚本。
- 不允许执行表达式、JavaScript hook 或任意 shell。
- 不在其中保存 Secret、Endpoint、价格或租户配置。
- 不因为“已经声明 readOnlyTables”就在 Domain 内直接写 SQL；SQL 仍只在 PostgreSQL Adapter。

## 3. AI Work Package 模板

每个 AI Coding 任务先复制以下模板。没有 Work Package，不进入实现。

```md
# WP-XXXX：任务名称

## Metadata

- Owner：
- Reviewer：
- Target module：
- Related issue/requirement：
- Architecture baseline：1.0
- Contract change：forbidden | allowed（CR-XXXX）
- ADR change：forbidden | allowed（ADR-XXXX）
- Migration change：forbidden | allowed

## Goal

一句话描述要交付的可验证结果。

## Non-goals

- 明确不实现什么。
- 不进行无关重构。

## Allowed write paths

- packages/backend/capabilities/image/**
- packages/frontend/capabilities/image/**
- 对应 tests/**

## Read-only paths

- packages/shared/contracts/**
- packages/backend/model-supply/**
- packages/backend/task-engine/**
- packages/backend/billing-credits/**
- packages/backend/resource-asset/**

## Forbidden actions

- 跨模块 deep import。
- 直接 import Prisma/BullMQ/Provider SDK。
- 直接查询或写入其他模块表。
- 修改余额、TaskRun、Operation、Artifact 终态。
- 修改 Contract/Manifest/Migration，除非 Metadata 明确授权。

## Public dependencies

- ModelExecutionPort@1
- CapabilityOutputPort@1
- ResourceAssetPort@1
- PlatformError@1

## Input / Output

- Input：ImageGenerateInput@1
- Output：media.image@1
- Errors：MODEL_INPUT_UNSUPPORTED / PROVIDER_* / OPERATION_CANCELLED

## Invariants

- 重复 idempotency key 不重复创建 ProviderExecution/Artifact。
- 取消后不得把 Operation 改为 completed。
- Handler 不直接结算积分。

## Acceptance criteria

1. ...
2. ...

## Required verification

- typecheck
- module boundary check
- image fixture suite
- provider/model fake conformance
- relevant integration tests

## Data / rollout / rollback

- Migration：none
- Feature flag：image.generate.enabled
- Rollback：关闭 flag 并恢复旧 adapter

## Delivery evidence

- 修改文件清单：
- 测试命令与结果：
- 未验证项：
- 风险与后续：
```

### 3.1 Work Package 拆分原则

- 一个 Work Package 只有一个主要模块 Owner。
- 允许多个包时必须是同一垂直切片中明确列出的适配层，不能写“允许修改整个仓库”。
- 两个并行任务不能同时修改同一 Frozen/Controlled 文件。
- 需求依赖 Contract 变化时先完成 Contract Work Package，再并行 Provider/Consumer Work Package。
- “顺便重构”“统一优化”“修复所有相关问题”不属于可验收目标。

## 4. Contract Change Proposal 模板

```md
# CR-XXXX：Contract 名称与变更摘要

## Metadata

- Contract owner：
- Requested by：
- Current version：
- Proposed version：
- Compatibility：patch | additive-minor | breaking-major

## Problem

现有公开接口为什么无法在不越界的情况下满足需求？

## Current contract

当前 Schema/Port 与行为 invariant。

## Proposed change

建议字段、方法、错误、状态机或行为变化。

## Compatibility analysis

- 旧消费者是否忽略 optional/unknown 字段？
- 新 enum 是否有 unknown fallback？
- 是否改变默认值、幂等、错误或状态语义？

## Affected providers / consumers

- Provider：
- Consumer：

## Fixtures and conformance

- 新增/修改 Fixture：
- 行为用例：

## Migration and rollout

- v1/v2 decoder 并存窗口：
- 发布顺序：
- Feature flag：

## Rollback / roll-forward

- 回滚条件：
- 无法回滚时的前滚方案：
```

Contract owner 批准后，先合并 Schema/Fixture，再实现双方代码。实现者不得先在 internal 中造一个“临时字段”绕过 Proposal。

## 5. ADR 模板与触发条件

```md
# ADR-XXXX：决策标题

- Status：proposed | accepted | superseded | rejected
- Date：
- Deciders：
- Related CR/WP：

## Context

为什么现有 Architecture Baseline 无法满足？

## Decision

要改变的 Owner、模块、依赖、一致性或运行边界。

## Alternatives considered

至少包含“不改变架构”的方案及其不足。

## Consequences

- Positive：
- Negative：
- Operational：
- Security/Billing/Data：

## Migration and rollback

实施阶段、兼容窗口和退出路径。
```

必须 ADR 的典型变化：

- 新增/删除一级模块或运行进程。
- 改变 State/Table Owner 或依赖方向。
- 引入新数据库、MQ、搜索引擎或外部基础设施。
- 修改事务、一致性、幂等、计费、权限和 Retention 边界。
- Public Contract Major 或绕过既有 Port。

## 6. Contract Version 与发布检查

### 6.1 SemVer 判定

- Patch：只改内部 bug/performance，不改变任何可观察 Contract。
- Minor：仅新增 optional/新类型，且所有旧消费者已经有 unknown fallback。
- Major：删除/重命名、类型/必填/默认值变化、状态机/错误/幂等语义变化。

新增 enum 值默认按潜在 Breaking 处理；只有消费者使用 `unknown-safe-fallback` 并有 Fixture 时才能按 Minor。

### 6.2 数据库 Expand/Migrate/Contract

```text
Expand
  新增 nullable column/table/index
  新旧代码都能运行

Migrate
  小批回填 + checkpoint + 指标
  校验新旧数据一致

Contract
  所有实例升级且旧路径零流量
  后续独立版本删除旧结构
```

Migration Work Package 必须说明表 Owner、预计锁、行数、批次、超时、N/N-1 兼容、验证 SQL 与 roll-forward。

## 7. Conformance Suite 规范

满足任一条件就必须提供共享 Conformance Suite：

- 存在 Fake 和真实实现。
- 存在两个以上 Adapter。
- Port 承担幂等、状态、账务、恢复或安全语义。

建议写法：

```ts
runBillingPortContractSuite('fake', () => createFakeBilling());
runBillingPortContractSuite('postgres', () => createPostgresBilling(testDb));

runAssetStorageContractSuite('fake', () => createMemoryStorage());
runAssetStorageContractSuite('oss', () => createOssStorage(testConfig));
```

共同用例不仅验证返回形状，还必须验证：

- 同一幂等键重复调用的结果与副作用。
- 乐观冲突、非法状态和跨 owner 拒绝。
- 取消、超时、retry directive 和 attempt 上限。
- Fake 与真实实现使用相同 Platform Error code。
- 账务/Artifact/Task 等模块的不变量。

## 8. Platform Error 使用规则

```text
PROVIDER_RATE_LIMITED
-> retry.kind=backoff
-> Task Engine 同时检查 frozen retry policy/attempt/idempotency

PROVIDER_TEMPORARY_UNAVAILABLE
-> retry.kind=fallback 或 backoff
-> 只能使用冻结 plan 中的 fallback

MODEL_INPUT_UNSUPPORTED
-> retry.kind=after-user-action
-> 返回字段级 safeDetails，不自动重试

INSUFFICIENT_CREDITS
-> retry.kind=after-user-action
-> 引导充值/调整请求，不创建付费 TaskRun

INTERNAL_UNEXPECTED
-> retry.kind=never（默认）
-> correlationId 供支持定位，cause 不出现在客户端
```

禁止：

- `if (error.message.includes('429'))`。
- 将 Provider 原始错误直接发送给前端。
- 未知错误默认无限重试。
- 使用 `safeDetails` 携带密钥、Prompt、Channel 或其他租户数据。

## 9. AI 交付自检

AI 在结束任务前必须逐项回答并给出证据：

1. 修改了哪些文件，是否都在 Allowed write paths？
2. 是否修改 Frozen/Controlled 文件？对应 CR/ADR/WP 授权是什么？
3. 是否改变 Public Contract、状态机、默认值、错误或幂等语义？
4. 是否增加跨模块依赖或 deep import？
5. 是否直接访问 Prisma、raw SQL、BullMQ、Provider SDK 或他域表？
6. 是否引入新的 Feature Flag、配置、Secret、Migration 或 Retention 行为？
7. 哪些 Unit/Contract/Conformance/Integration/Boundary Test 已通过？
8. 哪些验证因环境原因未执行？
9. 是否产生新的架构决策？若是，ADR 在哪里？
10. 回滚方式是什么，是否会遗留数据或外部副作用？

任何回答无法证明、出现未授权变化或 `new architecture decision=yes` 时，任务只能进入 Review，不能自动合并。

## 10. 开工准入清单

Phase 0 完成至少满足：

- [ ] Architecture Baseline 1.0 已冻结并链接到仓库。
- [ ] 十个 Deep Module、domain-kernel 和主要 app boundary 都有 Manifest。
- [ ] State/Table Ownership 全局无冲突。
- [ ] Public Contract 的 Owner、Zod Schema、版本与 Fixture 明确。
- [ ] Platform Error v1 与 retry policy 测试存在。
- [ ] 核心 Port 有 Conformance Test Kit。
- [ ] Work Package、CR、ADR 模板和 CI 授权检查可运行。
- [ ] Prisma/BullMQ/Provider SDK/import boundary 能被 CI 自动拦截。
- [ ] Migration 与 Retention 基线已记录。

此后先完成 Platform Skeleton 和 TALK 纵向切片。TALK 暴露的 Contract 问题通过 CR 修正并冻结 v1 后，才并行 IMAGE/VIDEO/AUDIO；不能为了“看起来快”让多个 AI 在未冻结 Contract 上同时造五套实现。

## 11. Progressive Context Loading

### 11.1 仓库文件分工

| 文件 | 作用 | 不应承载 |
| --- | --- | --- |
| 根 `AGENTS.md` | 短仓库宪法、上下文加载流程、关键红线、交付格式 | 完整 3000 行架构、模块所有字段 |
| 模块 `AGENTS.md` | 当前子树责任、Owner、关键 invariant、局部验证命令 | 复制根规则或其他模块实现 |
| `module.manifest.json` | CI 可执行的 Owner、表、依赖、export、Zone | 解释性长文、Secret、运行时脚本 |
| `README.md` | 模块用途、用法、故障语义和设计原因 | 机器权限真源 |
| `CONTRIBUTING.md` | 人类入口与提交流程 | 另一套不同规则 |
| PR template | AI/人共同的变更声明和证据 | 替代 CI |
| `.codex/` | Codex 模型、沙箱、权限、MCP/hook 等运行配置 | Contract、Owner、架构基线唯一真源 |

Codex 官方会在每次运行开始时从 project root 到当前 working directory 查找并合并 `AGENTS.md`/override，更深目录规则后出现并优先；默认合并预算是 32 KiB。因为从仓库根启动时模块级文件不一定处于自动发现链，根文件仍必须要求 Agent 在编辑目标模块前主动读取最近的局部 AGENTS、Manifest、Contract 和相关测试。[OpenAI：Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md.md)

根文件以约 100–150 行、模块文件约 40–80 行作为可读性目标；真正硬限制是内容去重、官方字节预算和 CI，而不是机械行数。不同工具是否自动发现 `AGENTS.md` 可能不同，因此内容保持供应商无关，约束最终由 Manifest/Test/CI 执行。

### 11.2 统一验证命令目标

Monorepo scaffold 后实现：

```text
pnpm verify:module <name>
  -> lint/typecheck/unit/contract for one module

pnpm verify:changed
  -> detect changed modules + minimum required suites

pnpm architecture:check
  -> manifest/import/export/owner/table/file-zone/cycle checks

pnpm verify
  -> full repository gate

pnpm review:architecture
  -> optional read-only AI diff review; advisory only
```

在脚本真正存在前，AGENTS 和 PR 只能把它们标记为“目标命令”，不得声称已经运行。脚本实现后，失败必须返回稳定诊断码，例如：

| Prefix | 示例 |
| --- | --- |
| `ARCH` | `ARCH001` deep import、`ARCH005` unowned table、`ARCH007` forbidden Prisma |
| `TEST` | `TEST001` missing behavior test、`TEST004` retry without idempotency fixture |
| `SCHEMA` | `SCHEMA001` external data bypasses runtime validation |
| `SEC` | `SEC001` secret/raw provider data enters Public Trace |

错误码必须附带目标文件、违反的 Manifest/Policy 和安全修复方向，避免 AI 只看到“失败”后用另一种方式绕过。

### 11.3 测试与 Coverage

测试采用五层：Domain Unit、Contract/Conformance、Adapter Integration、Failure/Concurrency/Recovery、Vertical Slice。Coverage 只是回归报警器，不是完成证明；即使 100% 行覆盖，缺少 Billing 并发 reserve、任务幂等或恢复 invariant 仍然失败。

Phase 0 不冻结全仓单一百分比。模块建立稳定测试基线后，可以对高风险 core 设置 changed branch coverage 下限，但 Required Invariant Fixtures、Conformance Suite 和 Architecture Check 永远优先于 Coverage 数字。

### 11.4 只读 Deep Module Review

`review:architecture` 只读取 diff、根/局部 AGENTS、Manifest、Public Contract 和相关 tests，输出 `PASS/FAIL + ARCH/TEST/SCHEMA/SEC` 诊断。它负责发现“Public surface 是否无必要变宽”“模块是否变浅”等静态规则难表达的问题。

AI Review 不能批准 Contract/ADR，不能修改代码，也不能覆盖失败 CI。正确门禁始终是：

```text
Static architecture checks
+ Runtime/behavior tests
+ Optional AI architecture review
```
