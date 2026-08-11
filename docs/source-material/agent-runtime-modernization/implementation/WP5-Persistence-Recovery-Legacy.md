# WP5 Persistence Recovery and Legacy Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持 Web 刷新/断线恢复、owner 隔离和当前 Geo 后端兼容，并保证未来 v1 Adapter 可无页面改动替换。

**Architecture:** EventRepository/SnapshotRepository 参与正确性，Cache 单独处理；RecoveryCoordinator 执行 snapshot -> local delta -> remote replay -> live subscribe。Legacy Adapter 只转换当前 DTO/流到 v1 Event。

**Tech Stack:** TypeScript、IndexedDB Web Adapter、Vitest fake storage/timers；本阶段不修改后端。

## Global Constraints

- 事件必须先做纯归约预计算，再以原子 append 结果决定是否提交内存状态；非法事件进入 Quarantine，memory-only 降级需显式暴露。
- key 必须包含 environment、ownerId、workspaceId。
- Runtime 内所有事件提交经过单写队列；Repository 仍必须检测并发冲突，不能依赖“通常只有一个请求”。
- Legacy Adapter 不进入页面；operationId 由 start Command 在客户端生成并透传，sequence 由 Adapter 在单次内存任务内单调生成。
- token、File、Blob、永久 URL 和敏感 Artifact data 不进入 Snapshot。

---

### Task 1: 定义 Persistence 端口与内存实现

**Files:**
- Modify: `src/taojinshu-ai-sdk/core/persistence/event-repository.ts`
- Modify: `src/taojinshu-ai-sdk/core/persistence/snapshot-repository.ts`
- Modify: `src/taojinshu-ai-sdk/core/persistence/quarantine-repository.ts`
- Create: `src/taojinshu-ai-sdk/core/persistence/memory-persistence.ts`
- Modify: `src/taojinshu-ai-sdk/core/contracts/runtime-snapshot.ts`
- Test: `src/taojinshu-ai-sdk/core/persistence/persistence-conformance.spec.ts`

**Interfaces:**
- Produces: `append(): AppendResult`、`listAfter()`、`prune()`、`loadLatest()`、`save()`、`quarantine()`、`clear()`
- Consumes: EventEnvelope、RuntimeSnapshotDTO

- [ ] **Step 1: 编写 conformance suite**

覆盖 `appended/duplicate/conflict`、重复幂等、同序列不同 eventId 冲突、升序读取、
`ownerId + workspaceId + operationId + sequence` 唯一键、快照游标不可回退、Quarantine 和 owner 清理。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/persistence/persistence-conformance.spec.ts
```

- [ ] **Step 3: 实现内存参考实现**

该实现是 Web/uni Adapter 的行为标准，不用于承诺刷新恢复。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/persistence/persistence-conformance.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-sdk/core/persistence src/taojinshu-ai-sdk/core/contracts/runtime-snapshot.ts
git commit -m "feat: define agent persistence contracts"
```

### Task 2: 实现 Web Persistence 与 RecoveryCoordinator

**Files:**
- Create: `src/taojinshu-ai-sdk/platform/web/web-persistence.ts`
- Create: `src/taojinshu-ai-sdk/platform/web/indexeddb-migrations.ts`
- Create: `src/taojinshu-ai-sdk/platform/web/workspace-leader-election.ts`
- Create: `src/taojinshu-ai-sdk/core/recovery/recovery-coordinator.ts`
- Modify: `src/taojinshu-ai-sdk/core/runtime/agent-runtime.ts`
- Test: `src/taojinshu-ai-sdk/platform/web/web-persistence.spec.ts`
- Test: `src/taojinshu-ai-sdk/core/recovery/recovery-coordinator.spec.ts`

**Interfaces:**
- Consumes: Persistence 端口、Transport.replay/subscribe、owner/workspace、Reducer
- Produces: `rehydrate()`、`resumeOperation()`、`compact()`、`recoveryMode`

- [ ] **Step 1: 编写恢复测试**

覆盖 snapshot+delta、远程补拉、序列空洞、损坏快照、非法事件不污染 Event Log、并发 append、
IndexedDB 版本迁移、配额清理、失败后 memory-only、跨 owner 拒绝、同 workspace 多标签页只有 leader 订阅远端。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/platform/web/web-persistence.spec.ts src/taojinshu-ai-sdk/core/recovery/recovery-coordinator.spec.ts
```

- [ ] **Step 3: 实现恢复顺序**

严格执行 owner 校验、Snapshot 迁移、本地 delta、远程 replay、live subscribe；每 50 Event 或终态 compact。
接收事件执行 `decode -> validate -> pure reduce precompute -> atomic append -> commit`；duplicate 不重复归约，
conflict/invalid 写入 Quarantine 并中止该 Operation 的自动恢复。Cache 超限时先清 Cache，再清已终态旧事件，活跃游标不可删除。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/platform/web src/taojinshu-ai-sdk/core/recovery
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-sdk/platform/web src/taojinshu-ai-sdk/core/recovery src/taojinshu-ai-sdk/core/runtime
git commit -m "feat: recover agent runtime from persisted events"
```

### Task 3: 实现 Geo Legacy Adapter

> Geo DTO/Adapter 由 `DEV-WP5B/QA-WP5B` 提交；Application Registry 接线由
> `DEV-WP5C/QA-WP5C` 在 Adapter conformance 通过后单独提交。

**Files:**
- Create: `src/ai-agents/geo-ad/contracts/legacy-geo-dto.ts`
- Create: `src/ai-agents/geo-ad/adapter/geo-legacy-adapter.ts`
- Create: `src/ai-agents/geo-ad/adapter/geo-v1-adapter.ts`
- Modify: `src/ai-application/registry/register-agents.ts`
- Test: `src/ai-agents/geo-ad/adapter/geo-adapter-conformance.spec.ts`

**Interfaces:**
- Produces: 两个 `AgentTransport` 实现
- Consumes: 当前 Geo API DTO 或未来 v1 Envelope

- [ ] **Step 1: 编写双 Adapter 一致性测试**

同一 normal/failure Fixture 经 Legacy 和 v1 Adapter 后归约，最终 Operation、steps、Artifact 语义等价；
另行断言 Legacy 明确声明 `cancel=false/replay=false/subscribe=false`，v1 才执行 cancel/replay/subscribe conformance。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/ai-agents/geo-ad/adapter/geo-adapter-conformance.spec.ts
```

- [ ] **Step 3: 实现 Legacy Normalizer**

start Command 的 operationId 在任务内稳定；sequence 在 Legacy 单次内存任务内单调生成；客户端时间标记 source；
连接关闭不推断 completed。刷新时 Legacy `running` Operation 必须转为 `interrupted/non-resumable`，禁止伪恢复或伪取消。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/ai-agents/geo-ad/adapter/geo-adapter-conformance.spec.ts
```

- [ ] **Step 5: 提交**

Adapter 提交：

```bash
git add src/ai-agents/geo-ad/contracts src/ai-agents/geo-ad/adapter
git commit -m "feat: add compatible geo agent adapters"
```

Application 注册提交：

```bash
git add src/ai-application/registry/register-agents.ts
git commit -m "feat: register geo backend adapters"
```

### Task 4: 完成刷新、断线和回滚集成

**Files:**
- Modify: `src/ai-application/ai-application-manager.ts`
- Modify: `src/ai-application/auth/owner-lifecycle.ts`
- Test: `src/pages/chat/geoAdDelivery/__tests__/geo-refresh.integration.spec.ts`
- Test: `src/ai-application/auth/owner-lifecycle.integration.spec.ts`

**Interfaces:**
- Consumes: RecoveryCoordinator、FeatureProvider、Geo Adapter
- Produces: 刷新恢复、owner 清理、每 Operation adapterKind 冻结

- [ ] **Step 1: 编写集成测试**

Mock/v1 研究中刷新、完成后刷新、v1 断线补拉、Legacy 进行中刷新转 interrupted、Flag 改变、
账号切换、动态 token 更新和 memory-only 提示均有独立断言。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/pages/chat/geoAdDelivery/__tests__/geo-refresh.integration.spec.ts src/ai-application/auth/owner-lifecycle.integration.spec.ts
```

- [ ] **Step 3: 接入 Application 生命周期**

退出登录顺序固定为 stop subscription -> flush -> clear memory -> clear owner namespace；进行中 Operation 不切 Adapter。

- [ ] **Step 4: 执行 WP5 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/recovery src/taojinshu-ai-sdk/platform/web src/ai-agents/geo-ad src/ai-application src/taojinshu-ai-ui/web
pnpm check:ai-sdk-docs
pnpm check:ai-agents-docs
pnpm check:ai-application-docs
pnpm check:ai-boundaries
pnpm exec vue-tsc --noEmit
pnpm test
pnpm build
```

- [ ] **Step 5: 提交**

```bash
git add src/ai-application src/pages/chat/geoAdDelivery/__tests__/geo-refresh.integration.spec.ts
git commit -m "feat: integrate geo runtime recovery"
```
