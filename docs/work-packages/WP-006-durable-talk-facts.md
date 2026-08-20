# WP-006：Durable TALK Facts — PostgreSQL Persistence + Event Replay

> **Planning status：`PLANNING DRAFT`**
>
> **Implementation gate：`APPROVED PLANNING + MERGED ADR/CCR REQUIRED`**
> 本文件是实施交接说明，不单独授权修改 Migration、owned-table、
> dependency direction 或 versioned Port。实施分支必须从已合并本记录以及
> WP-006 专用 ADR/CCR 的最新 `main` 创建。

## 1. Metadata

- Primary owner：`backend-agent-runtime`
- Co-owner：`backend-event-realtime`
- Reviewer：Architecture Review、Backend Review、Data/Migration Review、Security Review、Product Review
- Target modules：`backend-agent-runtime`、`backend-event-realtime`、`infrastructure-persistence-postgres`、`api`
- Supporting read-only modules：`shared-contracts`、`backend-task-engine`、`backend-model-supply`、`backend-capability-talk`、Frontend TALK/realtime modules
- Base：最新 `main`，`59ce02f`（PR #27 / WP-005 Real TALK 已合并）
- Architecture baseline：V2.5；冻结入口为 `docs/architecture/00-*` 与 `docs/architecture/01-*`
- Contract change：`required before implementation`；以独立 `CCR-0004` 冻结最小 Repository/Event Store/transaction composition Port
- ADR change：`required before implementation`；以独立 `ADR-0003` 授权 Migration、owned-table、Manifest dependency、并发 Event sequence allocator、跨 Owner 一致性边界与 non-overlapping deployment 约束
- Migration change：`required after ADR-0003 is accepted and merged`
- Manifest change：`required after ADR-0003/CCR-0004 are accepted and merged`
- Architecture source change：`forbidden`；本 WP 实施已冻结的 PostgreSQL 方向，不改 `docs/architecture/00-*` / `01-*`
- State-machine change：`forbidden`；复用现有 `accepted | running | completed | failed | cancelled`
- Feature flag：`none planned`
- Retention change：`none planned`

### 1.1 Gate evidence

`main@59ce02f` 已证明真实 TALK streaming，但业务事实仍由进程内存持有：

- Agent Runtime 使用 `Map` 保存 Operation 与 idempotency lookup；
- Event & Realtime 使用 `createInMemoryEventStream()` 保存 Event 和 subscriber waiter；
- API composition 装配 in-memory Event Stream 与 Task Engine；
- `prisma/schema.prisma` 尚不存在，`prisma/migrations/` 只有 `.gitkeep`；
- CI 尚未运行 PostgreSQL migration 或真实 PostgreSQL Adapter conformance。

根 Constitution 的更高优先级规则，Migration 属于 RED；而本 WP 还需要第一个跨
Agent Runtime / Event & Realtime Owner 的短事务 seam。因此不接受“实施 PR 内顺便加
Migration/Port”的做法，必须先合并独立 governance-only ADR/CCR。

## 2. Goal

> 第一次让 PostgreSQL 成为 TALK Operation、最小 Execution Graph、Command Receipt
> 和 Event Log 的唯一业务事实源，使 API 重启后仍能查询 Operation、保持幂等
> 语义，并通过 SSE `afterSequence` 无缝 replay 已提交 Event。

本 WP 是 Durable Runtime Facts，不是 Durable Execution。它保证“已提交的事实不丢”，
不承诺 API 在 Provider 调用中崩溃后自动续跑。

## 3. Scope decision

| Fact / capability                                | Writer owner                 | WP-006 decision                              |
| ------------------------------------------------ | ---------------------------- | -------------------------------------------- |
| Command receipt + payload fingerprint            | Agent Runtime                | PostgreSQL authority                         |
| Operation projection                             | Agent Runtime                | PostgreSQL authority                         |
| TALK Execution Graph / one node                  | Agent Runtime                | PostgreSQL authority                         |
| Event envelope / per-operation sequence / replay | Event & Realtime             | PostgreSQL authority                         |
| Post-commit live wake-up                         | Event & Realtime             | in-process signal; DB remains authority      |
| Provider-frame delta coalescing                  | Agent Runtime internal       | 30–100ms / bounded-character flush           |
| TaskRun / attempt / Lease / checkpoint           | Task Engine                  | keep in memory; defer                        |
| Conversation / Message / history                 | Workspace & Conversation     | defer                                        |
| ProviderExecution / Model catalog                | Model Supply                 | WP-005 behavior unchanged; defer persistence |
| Outbox / external dispatch                       | Event & Realtime             | defer; no consumer exists in this WP         |
| Redis / BullMQ / Worker recovery                 | Task Engine / Infrastructure | defer                                        |

### 3.1 Exactly five business tables

WP-006 只引入：

1. `ai_operation`
2. `ai_execution_graph`
3. `ai_execution_node`
4. `ai_command_receipt`
5. `ai_event`

不创建 `ai_task_run`、`ai_outbox`、Conversation/Message、ProviderExecution、Billing、
Artifact 或 Model Catalog 表。`operation.completed` 中的现有 ArtifactBase 仍是 Event payload；
Resource & Asset 持久化属于后续 WP。

### 3.2 Why no outbox in this WP

本 WP 没有 MQ、Worker 或跨进程 consumer。当前可验收的正确性由以下组合提供：

```text
short DB transaction commits Operation/Event facts
  -> transaction promise resolves
  -> in-process signal wakes local SSE subscribers

crash between COMMIT and signal
  -> committed ai_event remains authoritative
  -> client reconnect/replay recovers it
```

提前加入无 consumer 的 `ai_outbox` 只会增加第六张表、retention/retry/status 语义与
recovery 义务。Outbox 与 BullMQ delivery 一起留给 Durable Task/Worker WP；如果
ADR Review 证明当前已存在必须的持久 consumer，本记录需先重新评审，不在实施中扩容。

## 4. Explicit non-goals

- IMAGE、VIDEO、AUDIO、SUMMARY 或其他 Capability vertical slice。
- ConversationId、MessageId、Project CRUD、History API/sidebar、refresh restore、multi-turn Context Pack 或 Memory。
- `ai_task_run`、Lease、checkpoint、recovery scheduler、Redis、BullMQ、Worker handoff 或自动续跑 Provider request。
- PostgreSQL Model Catalog、ProviderExecution、Billing/Credits、Resource/Artifact lifecycle 或 Admin UI/API。
- rolling、blue-green 或任何新旧 API 重叠运行；本 WP 只允许旧进程确认退出后再启动新进程。
- 多 API instance 的跨节点 live fan-out、PostgreSQL LISTEN/NOTIFY 或 Redis Pub/Sub。
- 通用 Unit of Work framework、ORM/repository base class、generic DAO、global Persistence Service 或跨 Owner 查表便利层。
- 新 Operation status/event/error code、取消协议、protocol major 或任何 `packages/shared/contracts/src/**` runtime 修改。
- 资料备份、RDS migration 、production restore drill 或数据保留策略；这些需要独立运维 WP。

## 5. Governance prerequisites

| Prerequisite                      | Decision                    | Required handling                                                                                                                                               |
| --------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen shared Contract touched    | **NO**                      | `packages/shared/contracts/src/**` 只读；现有 Command/Operation/Graph/Event/Error schema 原样复用。                                                             |
| CCR required                      | **YES — proposed CCR-0004** | 冻结 Agent Runtime Repository、Event Store/Replay 和最小 TALK transaction composition Port 及 Fake/Postgres conformance 语义。                                  |
| ADR required                      | **YES — proposed ADR-0003** | 授权 5 张表的 Migration/Owner、Manifest dependencies、Prisma Adapter 边界、advisory-lock sequence allocator、non-overlapping reconciliation 与跨 Owner 原子性。 |
| Owner/dependency direction change | **YES, declaration only**   | 不改变冻结的全局方向；但需在 Manifest 中首次登记 `api -> infrastructure-persistence-postgres -> backend owner public ports`。                                   |
| Manifest change                   | **YES**                     | 登记 ownsState/ownsTables/migrationScopes/contracts/conformanceSuites 和必要 allowedDependencies；严禁把表 Owner 给 Infrastructure。                            |
| Architecture source change        | **NO**                      | PostgreSQL-as-truth 和 Owner 分区已冻结；本 WP 只用 ADR 批准具体落地。                                                                                          |
| State-machine change              | **NO**                      | 启动 reconciliation 只使用现有 `accepted/running -> failed`；若需新 status/event，停止并新建 CCR。                                                              |
| Migration required                | **YES**                     | Expand-only initial migration；实施 BASE_SHA 必须已包含 accepted ADR。                                                                                          |

### 5.1 Required governance sequence

1. 合并本 planning record。
2. 创建 governance-only `ADR-0003` + `CCR-0004` PR；不携带 Prisma schema、Migration、Manifest 或业务实现。
3. ADR/CCR 由 Repository Owner / Architecture Review 批准并合并。
4. 从同时包含 planning record 与 accepted ADR/CCR 的最新 `main` 创建 implementation branch。
5. 实施 PR 不得扩展 ADR/CCR Authorization 的精确路径和行为。

## 6. Contract and ownership design for CCR-0004

CCR-0004 应只冻结三组行为，具体 TypeScript 命名可在 CCR Review 中收敛：

### 6.1 Agent Runtime persistence Port

- 以 async API 创建/查询 Operation、Execution Graph/Node 和 Command Receipt。
- receipt 保存服务端 principal scope、idempotency key、现有 `getTalkSubmitFingerprint()`
  结果的版本化 SHA-256 digest 与 Operation reference；不持久 canonical string，因为它包含用户输入。
- 同 scope + key + same fingerprint 返回原 Operation；同 scope + key + different fingerprint 返回现有 `CONFLICT`。
- 通过 conditional update / optimistic version 保证 terminal Operation 不被覆盖，并复用现有 state-transition validator。
- 提供有界的 non-terminal scan 供 startup reconciliation，不提供任意 SQL/filter/DAO surface。

### 6.2 Event Store / Replay Port

- Event & Realtime 而非 Agent Runtime 拥有 sequence allocation、event idempotency、append、replay 和 live subscription。
- append input 只携带已验证的业务 Event intent；Port 在事务内分配每 Operation 严格递增 sequence，返回现有 `EventEnvelope`。
- ADR-0003 必须冻结 Phase-0 allocator：Adapter 在当前短事务中用稳定 Operation ID digest 获取 `pg_advisory_xact_lock(bigint)`，锁内查询该 Operation 已提交/本事务可见的 `MAX(sequence)`，再写入 `MAX + 1`。
- advisory key 必须是跨进程稳定的 64-bit 值，不使用 JS 进程随机 hash；罕见 hash collision 只允许降低并发，不得改变查询的 `operation_id` 边界。
- `(operation_id, sequence)` unique 作为最后防线；并发 append、同事务多次 append、rollback 后重试和 event-id 幂等必须进入 Conformance Suite。
- 按 `eventId` 重复 append 返回原 Event；同 ID 不同内容或序列冲突必须失败，不得静默改写。
- replay 只返回 `sequence > afterSequence` 并按 sequence 升序；DB JSON 从 `unknown` 经 `parseEventEnvelope()` 后才离开 Adapter。
- Fake 与 PostgreSQL 实现运行同一 Event Store/Replay conformance suite。

### 6.3 Narrow TALK transaction composition Port

为避免通用 UoW Framework，CCR 只授权一个 TALK Runtime mutation seam：

```text
Agent Runtime ExecutionCoordinator
  -> TalkRuntimeUnitOfWorkPort.run(short callback)
       -> AgentRuntimeMutationPort (owner-scoped)
       -> EventMutationPort       (owner-scoped)
  -> COMMIT
  -> Event & Realtime post-commit signal
```

- callback 只获得两个 Owner 的窄 mutation interface，不获得 PrismaClient、raw transaction handle 或他域 Repository。
- 同一 Adapter 用同一 Prisma interactive transaction 构造两个 owner-scoped implementation。
- accepted creation 与 `operation.accepted`、terminal projection 与 terminal Event 必须同事务。
- Provider/HTTP IO、SSE wait、Task execution 不得进入数据库事务。
- post-commit signal 只能在 transaction promise 成功 resolve 后发送；rollback 永不通知 subscriber。
- 不导出 PrismaClient，不增加 generic `repository<T>`、`query()` 或任意 Owner registry。

如果 CCR Review 无法在这个窄 seam 内解决原子性，应停止并单独评审
V2.5 提及的稳定 `UnitOfWorkPort@1`；不允许把两个 Owner 合并或让 Agent Runtime
直接写 `ai_event`。

CCR-0004 只冻结可观察行为、transaction semantics、幂等、Owner boundary 和
Conformance 入口；不把首版 Adapter 的每个 `createX/updateY/findZ` CRUD 方法冻结为永久
Public Contract。任何不改变上述行为和边界的 repository method 拆分仍属于 Owner 内部实现。

## 7. PostgreSQL model and migration plan

### 7.1 Table ownership

| Table | Writer Owner | Minimum facts / constraints |
| `ai_operation` | `backend-agent-runtime` | opaque ID, ProjectRef snapshot, status, graph ref, timestamps, optimistic version; indexes for project/status/update |
| `ai_execution_graph` | `backend-agent-runtime` | graph ID, operation ID unique, root node ID, immutable graph version |
| `ai_execution_node` | `backend-agent-runtime` | node ID, graph ID, ordinal, `talk` kind, bounded dependency IDs; unique graph/ordinal |
| `ai_command_receipt` | `backend-agent-runtime` | `(principal_scope, idempotency_key)` unique, versioned payload digest, command/operation refs, created timestamp |
| `ai_event` | `backend-event-realtime` | event ID unique, operation ID, sequence, type, schema version, validated JSON payload, occurred timestamp, internal delivery position |

Infrastructure 只拥有 Adapter code 和 migration execution，`ownsTables` 必须保持空。
`migrationScopes` 可在 Infrastructure 登记 owner-partitioned migration path，但不得被解读为业务 Writer 权限。

### 7.2 Required constraints and access paths

- `ai_command_receipt(principal_scope, idempotency_key)` unique。
- `ai_command_receipt(operation_id)` unique，一次提交只对应一个 Operation。
- `ai_execution_graph(operation_id)` unique。
- `ai_execution_node(graph_id, ordinal)` unique。
- `ai_event(operation_id, sequence)` unique and indexed for replay。
- `ai_event.delivery_position` 保留为 DB-generated `BIGINT IDENTITY` internal storage cursor：unique/indexed、允许 rollback gap、不保证跨事务 commit order，不进入 Public Contract，本 WP 的 SSE 不读它。未来 Outbox/WS 若要赋予 delivery 语义，必须由后续 ADR/WP 重新审批，不得推断 identity 值等于 commit order。
- `ai_operation(project_id, status, updated_at)` indexed for query/reconciliation。
- status/type/domain/schema values 通过有界值与 runtime schema 双重验证；不使用无界 text 代替 invariant。
- 必须实测 replay/reconciliation 查询并保存 `EXPLAIN` 证据，不凭 schema 目测声称索引有效。

### 7.3 Command principal scope

`TalkSubmitCommand@1` 不增加 principal 字段，也不信任浏览器提交的 scope。
API composition 将 server-side principal scope 注入 Agent Runtime；在 Identity & Session 未接入的
Phase-0 单租户路径中，使用固定的 opaque anonymous scope，以保留当前“同 key
全局重复/冲突”行为。未来换成经身份验证的 principal 必须单独规划兼容策略，
不在本 WP 里把 `brandId` 或 `projectId` 伪装成 caller identity。

Receipt 只保存 `sha256-v1` + fixed-length digest，不保存 canonical payload、用户 prompt 或
Provider data。Digest 的输入继续是现有指纹函数所定义的 schemaVersion/type/project/input，
仍排除允许 retry 变化的 `commandId`。算法版本必须随 receipt 保存；改变算法需要
兼容读取计划，不得让旧 receipt 突然变成新命令。

### 7.4 Migration discipline

- 初始 migration 是 expand-only；空库无回填、无表重写，仍要记录预计锁、超时和前进回滚方案。
- `prisma/schema.prisma` 和生成 migration SQL 必须同 PR review；不允许只提 schema 不提 SQL。
- Prisma CLI 与 Client 版本必须 lockstep pin 并写入 lockfile；生成 Client 只由 persistence package 使用。
- 实施需验证 clean apply、N/N-1 schema compatibility 与 rollback/roll-forward；N/N-1 只表示 expand migration 不破坏旧 binary 的 schema 解析，不授权两个应用版本同时服务。因为首次建表，回滚首选前进修复，不在有数据环境自动 drop table或回到 in-memory authority。

## 8. Runtime flows and invariants

### 8.1 Submit and durable idempotency

```text
parse TalkSubmitCommand from unknown
  -> derive sha256-v1 digest from the existing canonical fingerprint
  -> short serializable transaction
       lookup/claim (principal_scope, idempotency_key)
       same fingerprint: return original accepted Event
       different fingerprint: CONFLICT
       new key: insert Operation + Graph + Node + Receipt + accepted Event
  -> COMMIT
  -> notify local SSE
  -> create/start current in-memory TaskRun
       failure: immediately commit accepted -> failed + operation.failed
  -> commit accepted -> running
  -> execute TALK
```

- ID 使用可并发、可重启的 opaque generator，不再使用进程 `idCounter`。
- unique/serialization conflict 必须有有界 retry；不得在失败后创建第二个 Operation。
- 生产 Agent Runtime 必须移除对 `createTalkSubmitIdempotencyGuard()` 的调用和 import；生产幂等的唯一真源是 `ai_command_receipt`。Shared Contracts 中的 in-memory guard 仅保留给共享 Contract 单元测试/Fake，不得与 PostgreSQL 同时成为 Runtime authority。
- HTTP accepted response 只在 transaction commit 后返回。
- accepted commit 后若 `createTaskRun()` 或 `start()` 在当前进程中失败，Runtime 必须立即使用既有安全 `INTERNAL_ERROR` 执行短 UoW，原子写入 `accepted -> failed` + `operation.failed`，不等待下次重启。如果连该收敛事务也失败，进程 fail closed/退出，由下次独占启动 reconciliation 处理。
- Provider 失败仍通过原子 failed projection + failed Event 收敛。

### 8.2 Running, delta coalescing and terminal mutation

- `accepted -> running` 在 Provider IO 前用短事务提交；现有 Contract 无 `operation.running` Event，本 WP 不新增。
- Provider 网络 frame 不等于数据库 Event。Agent Runtime internal `DeltaCoalescer` 先按原顺序累积 `ModelExecutionDelta`，在满足“30–100ms 时间窗”或“合理字符数阈值”任一条件时 flush 为一个 `talk.output.delta`。
- 实施应选择并记录该 internal 范围内的固定默认值，测试通过 internal clock/scheduler 和 threshold seam 确定性触发；这不是 Public Contract 或 Feature Flag。
- 每个 flush 的 `payload.text` 必须非空且 `<= MAX_TALK_OUTPUT_DELTA_LENGTH`；超限 buffer 在不改变最终文本的前提下按界限拆分。stream completed 、failed 或其他终止路径必须先 flush 已累积的部分输出，再写 terminal Event。
- 每次 coalesced flush 使用一个短 `ai_event` 事务并在 commit 后通知；不为每个 token/Provider frame 建事务，也不把整个 Provider stream 放入一个长事务。
- `running/accepted -> completed` 与 `operation.completed` 同事务。
- `running/accepted -> failed` 与 `operation.failed` 同事务。
- terminal transition 与 terminal Event 任一失败时整个事务 rollback；不得出现 projection/Event 分歧。
- 任何 transaction callback 中不允许 model fetch、stream wait、sleep 或 SSE delivery。

### 8.3 Gap-free replay to live subscription

subscribe 不得实现成单纯“先 query，再 subscribe”。固定算法为：

```text
validate operation + afterSequence
  -> DB replay sequence > cursor
  -> if replay reaches terminal: complete
  -> register buffered local live signal
  -> DB catch-up sequence > latest cursor
  -> emit catch-up without duplicate reduce
  -> owner-local tail check: if the committed stream is already terminal at/before cursor, complete
  -> on each signal, query DB sequence > cursor
  -> after every empty query, repeat the terminal-tail check before waiting
  -> stop after committed terminal Event
```

- signal 只是 wake-up hint，不携带权威 Event payload；每次都从 DB 按 cursor 收敛。
- signal 必须是 buffered/generation-aware，保证在 catch-up query 与 wait 交界到达的通知不丢。
- 重复 signal / duplicate query result 不得导致重复 emit；cursor 只向前。
- `afterSequence` 等于或大于已提交 terminal sequence 时，subscribe 不 emit 历史重复项并立即 complete，不注册永久 waiter。
- 未 commit Event 不得出现在 replay 或 live SSE。
- 本 WP 的 live signal 只覆盖单 API 进程；断线或 crash 后依赖 DB replay，不声称多节点 live fan-out。

### 8.4 Exclusive startup reconciliation

WP-006 的部署前置条件是 **non-overlapping single-process deployment**：运维流程必须先停止旧 API 接流量，等待/终止旧进程并确认它已完全退出，才能启动新 API。本 WP 不支持 rolling、blue-green、两个 replica 或任何新旧 API 重叠窗口；否则新进程无法区分 stale 与仍正在执行的 Operation，不得启动 reconciliation。

在旧进程确认退出后，新的单 API 进程在开始接收请求前：

1. 按稳定 keyset 有界分页扫描已存的 `accepted | running` Operation，重复取下一页直到耗尽；不使用只处理首批的 `LIMIT`。
2. 对每个 Operation 执行 conditional transition；已终态或版本冲突则不覆写。
3. 在同一短事务写入 `failed` projection 和现有 `operation.failed` Event，使用安全的既有 `INTERNAL_ERROR`。
4. 重复启动 reconciliation 不产生第二个 terminal Event；只有全部分页耗尽后 readiness 才可通过。

该语义仅表示“在已证明无旧 API 运行的前提下，当前没有 durable TaskRun 可恢复，上个单进程留下的非终态已中断”。
未来 Durable Task/Worker WP 引入 Lease/Recovery 时必须取代这个单节点策略；本 WP 不预建 lease 字段。

## 9. Expected change areas after governance approval

### 9.1 Agent Runtime

- `packages/backend/agent-runtime/src/index.ts`：async Runtime composition/public facade，依赖窄 Port 而非 Map。
- `packages/backend/agent-runtime/src/internal/**`：Operation/Graph/Receipt behavior、transaction orchestration、Delta Coalescer、exclusive startup reconciliation。
- 生产 Runtime 移除 `createTalkSubmitIdempotencyGuard()` 的 import/call；Fake/Contract tests 可保留 in-memory helper，但必须通过与 PostgreSQL receipt 相同的 Conformance 行为。
- Agent Runtime Fake repository + shared conformance harness + restart/concurrency tests。
- `module.manifest.json`：`ownsState`、三张 Runtime 表 + receipt 表、contracts/conformance 声明；精确内容由 ADR/CCR 授权。

### 9.2 Event & Realtime

- `packages/backend/event-realtime/src/index.ts`：Event Store/Replay public Port 与 Fake factory；不把 Postgres 概念放入 Port。
- `packages/backend/event-realtime/src/internal/**`：after-commit local signal 与 gap-free subscribe algorithm。
- Fake/Postgres common conformance，特别覆盖 sequence、duplicate/conflict、terminal、replay/live race。
- `module.manifest.json`：`ai_event` Owner、Port 和 conformance 声明。

### 9.3 PostgreSQL Adapter

- `prisma/schema.prisma`、`prisma/migrations/**`：只包含五张表和必要约束/索引。
- `packages/infrastructure/persistence-postgres/src/index.ts`：只导出 composition factory/owner Port implementations，不导出 PrismaClient。
- `packages/infrastructure/persistence-postgres/src/internal/agent-runtime/**`：Runtime Owner Adapter。
- `packages/infrastructure/persistence-postgres/src/internal/event-realtime/**`：Event Owner Adapter，包含 transaction-scoped advisory-lock allocator；所有 raw SQL 参数化且不离开 Adapter。
- `packages/infrastructure/persistence-postgres/src/internal/transaction/**`：窄 TALK UoW 与 post-commit hook；不变成 global persistence service。
- `packages/infrastructure/persistence-postgres/package.json`、package tsconfig 与 `pnpm-lock.yaml`：在 package 内登记 Prisma generate/migrate 与 Testcontainers 依赖/命令，不修改受保护的根 `package.json`。
- PostgreSQL Adapter conformance/integration tests 使用 Testcontainers 启动真实 PostgreSQL、应用当前 migration、运行共享 suite 并销毁容器；不用 Map/SQLite 代替，Docker/Testcontainers 不可用时必须 fail 而非 skip。

### 9.4 API composition, configuration and existing CI

- `apps/api/src/talk.composition.ts`、`app.module.ts`、`main.ts`、controller/tests：生产从 backend-only `DATABASE_URL` 创建 PostgreSQL composition，连接/迁移就绪并完成 exclusive reconciliation 后才 ready，在 shutdown lifecycle 关闭 Prisma/PostgreSQL client；测试可注入 Fake，submit/lookup 改为 async，SSE envelope 不变。
- `apps/api/module.manifest.json` / `package.json`：授权后添加 `infrastructure-persistence-postgres` composition dependency。
- `.env.example`：登记/保留现有空 `DATABASE_URL=` backend-only placeholder 及安全说明；不提交、输出或复制真实 connection string/password。若当前 placeholder 已满足要求，实施只需提供验证证据，不为制造 diff 而改文案。
- 现有 `.github/workflows/ci.yml`、根 `package.json`、`vitest.config.ts` 全部只读：Testcontainers integration test 作为标准 Vitest 测试由现有 `pnpm verify -> pnpm test -> vitest run` 自然发现和执行，无需 Trusted Governance 变更。

## 10. Read-only and forbidden paths

### Read-only

- `packages/shared/contracts/src/**`
- `packages/backend/model-supply/**`
- `packages/backend/capabilities/talk/**`
- `packages/backend/task-engine/**`
- `packages/backend/billing-credits/**`
- `packages/backend/resource-asset/**`
- Frontend packages/apps（现有 SSE Contract 无需变更）
- `docs/architecture/**` 与已 accepted ADR/CCR
- `.github/workflows/**`、根 `package.json`、`vitest.config.ts` 及其他 Trusted Governance paths

### Forbidden actions

- Agent Runtime、Event & Realtime、TALK、API Controller 直接 import Prisma/raw SQL。
- Infrastructure 导出 PrismaClient 或把业务 Owner 写成 `infrastructure-persistence-postgres`。
- Agent Runtime 直接写 `ai_event`，Event & Realtime 直接写 `ai_operation`/Graph/Receipt。
- 为了事务便利合并 Owner、deep import `internal/**` 或新建 global DAO。
- 在 transaction 中执行 Provider IO、Task stream、SSE wait 或外部网络请求。
- 使用 Redis/BullMQ/Worker/Outbox 扩容本 WP。
- 创建 Conversation/Message、TaskRun、ProviderExecution、Artifact/Billing 表或 IMAGE 逻辑。
- 修改 Frozen Contract、status/event/error code、Owner/dependency/Migration 而没有已合并的精确 ADR/CCR Authorization。
- 为加 PostgreSQL CI service/script 修改 `.github/workflows/**`、根 `package.json` 或 `vitest.config.ts`；本 WP 必须使用 package-local Testcontainers 和现有 `pnpm verify`。
- 测试仅验证 Fake 却声称 PostgreSQL persistence/restart/replay 通过。

## 11. Implementation checkpoints

### A — Governance authorization

- 合并 approved planning record。
- 审查并合并 ADR-0003/CCR-0004，精确列出所有 RED 路径。
- Architecture Guard 在 fixture/test 层证明 implementation 从正确 BASE_SHA 取得授权。

### B — Schema and owner adapters

- 五张表的 clean migration、约束、索引、owner-partitioned Adapter。
- Fake/Postgres Agent Runtime repository conformance。
- Fake/Postgres Event Store/Replay conformance。
- Prisma/raw SQL boundary negative check：Adapter 外为零。
- advisory-lock allocator 并发 append/rollback/idempotent retry 测试。
- Testcontainers 从 clean PostgreSQL 应用 migration 并运行共享 conformance；无 Docker 时 fail，不 skip。

### C — Atomic TALK mutation

- new submit 原子写入 Operation/Graph/Node/Receipt/accepted Event。
- same/different fingerprint 的并发幂等行为。
- 生产 Runtime 不调用 in-memory idempotency guard。
- 大量小 Provider frames 经 30–100ms/字符阈值 coalesce 成更少的 bounded Event，且终态/失败前 flush 不改最终文本。
- accepted commit 后 TaskRun create/start fault 立即收敛为 failed + failed Event。
- completed/failed projection + terminal Event 原子性及 rollback fault injection。
- Provider IO 在 transaction 外的可执行测试。

### D — Replay, restart and reconciliation

- `afterSequence=N` 精确 replay `N+1...`。
- 确定性 race hook 在 initial replay 与 live subscription 之间 append Event，证明不丢不重。
- cursor 等于/大于 terminal sequence 时 subscribe 立即 complete，不泄漏 waiter。
- composition A 完全关闭并确认退出后才启动 composition B；B 从同库查询/replay/idempotent submit。
- 部署验收明确拒绝 rolling/blue-green/overlap；N/N-1 只验证 schema compatibility。
- composition B 启动时将 A 留下的 non-terminal Operation 收敛为 failed，包含超过一个 reconciliation batch 的 fixture。

### E — API/CI acceptance

- 现有 WP-005 real model stream 经 PostgreSQL Event Log 完整进入 SSE，不泄露 Provider/DB 信息。
- API restart 后 Operation lookup、duplicate submit 和 SSE replay 验证。
- 不修改 CI workflow/root scripts；现有 `pnpm verify` 必须自然运行 Testcontainers migration + PostgreSQL integration，并通过 full verify/security/architecture gates。

任一 checkpoint 失败时仅在本 checkpoint 内修正；不得扩展至 Conversation、
Task Worker、Outbox 或 IMAGE。

## 12. Acceptance criteria

1. 现有 WP-005 TALK 正常 streaming，Event/SSE 外部 schema 与 UI reducer 行为不变；大量小 Provider frames 经 30–100ms/字符阈值合并后 Event 数显著少于 frame 数，最终拼接文本完全一致。
2. 每个 coalesced delta 非空且不超过 `MAX_TALK_OUTPUT_DELTA_LENGTH`；completed/failed 前先 flush 部分输出，不为每个 token/Provider frame 创建 PostgreSQL transaction。
3. Operation、Execution Graph/Node、Command Receipt 与 Event 以 PostgreSQL 为唯一权威存储；生产 Agent Runtime/Event Store 不再使用 Map 作为事实源，不调用 `createTalkSubmitIdempotencyGuard()`。
4. API composition 关闭并重建后，原 Operation 可查，原 Event 可 replay，现有 Event payload 逐条通过 runtime parse。
5. 同 principal scope + idempotency key + same payload 在重启前后都返回原 accepted Event/Operation，不创建新行或重复执行。
6. 同 principal scope + key + different payload 在重启前后均以现有 `CONFLICT` 失败，不修改原 receipt/Operation。Receipt 不持久 canonical command string 或用户 prompt，只持久版本化 fixed-length digest。
7. 并发相同 submit 最多创建一个 Operation/Graph/Receipt/accepted Event；序列化/unique conflict 有有界 retry 与测试。
8. Event Adapter 在 transaction-scoped advisory lock 内并发分配每 Operation sequence；多 writer append 得到唯一严格递增值，rollback/retry 不产生冲突 Event。
9. `afterSequence=N` 只按升序返回 `N+1...terminal`；initial replay/live 交界到达的 Event 不丢不重；cursor 等于或大于 terminal sequence 时立即 complete 且无 waiter 泄漏。
10. 未 commit 或 rollback Event 永不通知 SSE；commit 后、notify 前 crash 的 Event 可通过重连 replay 获得。
11. terminal Operation projection 与对应 terminal Event 同事务；故障注入证明不存在单边 commit。accepted commit 后 TaskRun create/start fault 立即原子收敛为 `failed` + `operation.failed`。
12. 启动 reconciliation 只能在旧 API 已确认完全退出后运行；新进程在对外服务前通过 keyset 分页耗尽全部旧 `accepted/running`，并原子收敛为现有 `failed` + `operation.failed`，跨多批不遗漏，重复运行幂等。
13. 部署证据明确采用 stop-old/confirm-exit/start-new，不支持 rolling、blue-green 或 overlapping replicas；N/N-1 仅验证 schema compatibility。
14. API 只从 backend runtime 读取 `DATABASE_URL`，缺失/连接失败/reconciliation 未完成时 fail closed，shutdown 关闭 DB client；`.env.example` 只包含空 placeholder，无真实 connection string/password。
15. PrismaClient/raw SQL 只存在 `infrastructure-persistence-postgres` Adapter；其他 Backend/Capability/API/Worker 没有直接依赖或 deep import。
16. Manifest 精确登记两个业务 Owner 的 tables/state，Infrastructure 不声称表 Owner，所有 dependency/contract/conformance 变化都在已合并 ADR/CCR 授权内。
17. clean database migration、replay 与 reconciliation 查询 `EXPLAIN` 通过；不修改 `.github/workflows/**`、根 `package.json` 或 `vitest.config.ts`，现有 `pnpm verify` 实际运行 Testcontainers PostgreSQL 测试，Docker 不可用时 fail 而不是 skip。
18. `delivery_position` 只是允许 gap 的 DB-generated internal identity，不进入 Public Contract、不作为 SSE cursor 或 commit-order 保证。
19. Diff 不包含 Redis/BullMQ/Worker、TaskRun 持久化、Outbox、Conversation/Message、Context/Memory、Admin 或 IMAGE 实现。

## 13. Required verification

### Planning PR

- `pnpm exec prettier --check docs/work-packages/WP-006-durable-talk-facts.md docs/roadmap/IMPLEMENTATION.md`
- `pnpm security:scan`
- `pnpm architecture:check`
- `pnpm verify:changed`

### Governance ADR/CCR PR

- planning PR commands above；
- Contract/architecture fixture coverage for every proposed Authorization path；
- no runtime/Migration/Manifest implementation in the governance-only diff。

### Implementation PR

- `pnpm install --frozen-lockfile`
- Prisma client generation and migration commands added only to `packages/infrastructure/persistence-postgres/package.json`。
- package-local PostgreSQL Adapter conformance/integration command: Testcontainers 启动 clean PostgreSQL、应用 migration、运行 suite 并销毁容器；Docker/Testcontainers 不可用时必须 fail，不得 skip。
- 现有 `pnpm verify` 必须在不修改 `.github/workflows/**`、根 `package.json` 或 `vitest.config.ts` 的前提下发现并运行上述 PostgreSQL integration。
- `pnpm verify:module backend-agent-runtime`
- `pnpm verify:module backend-event-realtime`
- `pnpm verify:module infrastructure-persistence-postgres`
- `pnpm verify:module api`
- `pnpm verify:changed`
- `pnpm security:scan:staged`
- explicit advisory-lock concurrency、delta-coalescing、TaskRun-handoff failure、non-overlapping restart、replay race、rollback fault-injection integration tests and `EXPLAIN` evidence。

## 14. Rollout / rollback

- Runtime topology：non-overlapping single API process；本 WP 不支持多节点 live subscriber wake-up、rolling、blue-green 或新旧 replica 重叠。
- Feature flag：none。实施后 production composition 不得在 DB 失败时静默回退 in-memory authority。
- Migration：五张新表的 expand-only initial migration；无 legacy data backfill。
- Deployment order：停止旧 API 接收新请求 → drain/terminate 并确认旧进程已退出 → 备份/确认 target DB → apply migration → 启动唯一新 API → exclusive reconciliation → readiness → TALK smoke/replay test。
- N/N-1：只验证 schema compatibility，不验收同时服务；部署必须接受 Phase-0 停机窗口。
- Rollback before user data：仅在明确空表证据下可停止新 API，执行 reviewed down/cleanup 计划后回到 N-1；仍不允许 N/N-1 overlap。
- Rollback after user data：不自动 drop；停止新提交，保留五张表并优先 roll-forward 修复。回退到 in-memory 会丢失新事实，不是可接受的数据回滚。
- Failure mode：DB/migration/reconciliation 未就绪时 API fail closed，不伪装 ready，不使用 Fake/in-memory 生产 fallback。
- Configuration/lifecycle：`DATABASE_URL` 只从 backend runtime 读取，不进入前端/日志；API shutdown 必须释放 PostgreSQL client。

## 15. Delivery evidence / implementation handoff

实施 PR 必须报告：

1. 修改文件与实际持久/重放/重启行为。
2. Public Contract/Port 是否严格符合 merged CCR-0004；`shared-contracts` 应为未改变。
3. 每张表的 Owner、Manifest dependency/migrationScopes 与 merged ADR-0003 的对照。
4. Migration SQL、索引、advisory-lock key/sequence strategy、锁/超时、N/N-1 schema-only compatibility、clean apply、`EXPLAIN` 和 roll-forward 证据。
5. Fake/Postgres common conformance、并发幂等/sequence、delta coalescing、TaskRun handoff fault、atomic rollback、replay/live race、exclusive restart reconciliation 的实际命令与结果。
6. Prisma/raw SQL import boundary scan、security scan 与未验证项。
7. 无 Feature Flag/Retention；有 PostgreSQL migration + package-local Testcontainers，无 CI workflow/root package 变更，无 Redis/BullMQ/Worker/Outbox 或新外部 Provider 副作用。
8. `DATABASE_URL` placeholder/config lifecycle 证据，以及 API shutdown 释放 DB client 的测试/运行证据。
9. 剩余风险：必须停机的 non-overlapping deployment、单 API live wake-up、无 durable TaskRun 自动续跑、Phase-0 anonymous principal scope，以及对应后续 WP。

## 16. Freeze conditions and next Work Packages

WP-006 只有在全部 Acceptance 和 PostgreSQL CI evidence 通过后才可标记
`COMPLETED / FROZEN`。以下问题不在本 WP 追加：

- WP-007：Conversation / Message persistence + refresh/history restore + multi-turn foundation。
- WP-008：Durable Task/Worker recovery + TaskRun/Lease/Scheduler + Redis/BullMQ/Outbox delivery。
- WP-009：IMAGE vertical slice，仅在 TALK persistence/recovery 基础稳定后规划。
