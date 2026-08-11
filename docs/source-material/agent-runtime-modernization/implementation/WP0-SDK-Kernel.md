# WP0 SDK Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立单 owner+workspace、可独立测试的 Command -> Route -> Event -> Reducer -> RuntimeState -> ViewModel 最小闭环。

**Architecture:** Core 使用纯 TypeScript 和端口注入；外部数据由 Codec 从 `unknown` 解码；Reducer 是 RuntimeState 唯一写入口。首期只实现 Geo 需要的 Operation、phase、progress 和 AgentStep，不实现完整多 Agent 树。

**Tech Stack:** TypeScript 5.8、Vitest 0.34、Vue 项目现有 ESLint；Core 不依赖 Vue、Pinia、DOM、Element Plus 或 uni。

## Global Constraints

- 所有源码文件、类型字段、函数和方法必须有完整中文 TSDoc。
- 公共 API 只能从 `src/taojinshu-ai-sdk/index.ts` 或 `core/index.ts` 导出。
- 外部输入必须为 `unknown`，禁止 `any` 和未经校验的类型断言。
- 时间和 ID 只能通过 `Clock`、`IdGenerator` 端口产生。
- 每个任务按失败测试、最小实现、验证和小提交执行。

---

### Task 1: 建立测试、注释和依赖边界门禁

**Files:**
- Create: `scripts/check-ai-docs.mjs`
- Create: `scripts/check-ai-boundaries.mjs`
- Modify: `package.json`
- Modify: `vitest.config.mts`
- Modify: `playwright.config.ts`
- Create: `tsconfig.test.json`
- Test: `scripts/__tests__/ai-tooling-gates.spec.ts`
- Test: `tests/e2e/ai-runtime/test-foundation.e2e.ts`

**Interfaces:**
- Produces: `pnpm check:ai-sdk-docs`、`pnpm check:ai-boundaries`、`pnpm typecheck:test`、`pnpm test:ai:*`
- Consumes: `src/taojinshu-ai-sdk/**`

- [ ] **Step 1: 编写失败测试**

使用临时 TS/SFC Fixture 验证缺文件头、缺 Props/Emits/Slots/方法 TSDoc、导入 `@/pages`、导入
`element-plus` 时检查器返回非零退出码；合法 Fixture 返回零。另验证 Vitest 能收集 src 同目录 spec、
test tsconfig 能检查测试源码、Playwright 能自动启动测试服务并分别运行 Chromium/WebKit。

- [ ] **Step 2: 运行测试并确认失败**

```bash
pnpm exec vitest run scripts/__tests__/ai-tooling-gates.spec.ts
```

Expected: FAIL，提示检查脚本不存在。

- [ ] **Step 3: 实现最小检查器**

文档检查对 TS 使用 TypeScript Compiler API、对 Vue 使用 `@vue/compiler-sfc`；边界检查读取 import
specifier 并按目录白名单判断。按 [测试工程修订](./TEST-FOUNDATION.md) 更新 Vitest include、
`tsconfig.test.json`、Playwright webServer/projects 和下列稳定脚本：

```json
{
  "check:ai-sdk-docs": "node scripts/check-ai-docs.mjs src/taojinshu-ai-sdk",
  "check:ai-conversation-docs": "node scripts/check-ai-docs.mjs src/taojinshu-ai-conversation",
  "check:ai-ui-docs": "node scripts/check-ai-docs.mjs src/taojinshu-ai-ui",
  "check:ai-application-docs": "node scripts/check-ai-docs.mjs src/ai-application",
  "check:ai-agents-docs": "node scripts/check-ai-docs.mjs src/ai-agents",
  "check:ai-boundaries": "node scripts/check-ai-boundaries.mjs"
}
```

- [ ] **Step 4: 验证门禁**

```bash
pnpm exec vitest run scripts/__tests__/ai-tooling-gates.spec.ts
pnpm typecheck:test
pnpm test:ai:browser
pnpm check:ai-sdk-docs
pnpm check:ai-boundaries
```

Expected: Fixture 测试 PASS；空 SDK 目录阶段检查命令正常退出。

- [ ] **Step 5: 提交**

```bash
git add package.json vitest.config.mts playwright.config.ts tsconfig.test.json scripts/check-ai-docs.mjs scripts/check-ai-boundaries.mjs scripts/__tests__/ai-tooling-gates.spec.ts tests/e2e/ai-runtime/test-foundation.e2e.ts
git commit -m "test: add ai sdk architecture gates"
```

### Task 2: 定义最小 Domain 与协议契约

**Files:**
- Create: `src/taojinshu-ai-sdk/core/contracts/ids.ts`
- Create: `src/taojinshu-ai-sdk/core/contracts/runtime-snapshot.ts`
- Create: `src/taojinshu-ai-sdk/core/domain/workspace.ts`
- Create: `src/taojinshu-ai-sdk/core/domain/session.ts`
- Create: `src/taojinshu-ai-sdk/core/domain/operation.ts`
- Create: `src/taojinshu-ai-sdk/core/domain/agent-step.ts`
- Create: `src/taojinshu-ai-sdk/core/domain/message.ts`
- Create: `src/taojinshu-ai-sdk/core/domain/tool-call.ts`
- Create: `src/taojinshu-ai-sdk/core/domain/artifact.ts`
- Create: `src/taojinshu-ai-sdk/core/domain/runtime-state.ts`
- Create: `src/taojinshu-ai-sdk/core/protocol/command/user-command.ts`
- Create: `src/taojinshu-ai-sdk/core/protocol/event/event-envelope.ts`
- Create: `src/taojinshu-ai-sdk/core/protocol/event/event-payloads.ts`
- Create: `src/taojinshu-ai-sdk/core/persistence/event-repository.ts`
- Create: `src/taojinshu-ai-sdk/core/persistence/snapshot-repository.ts`
- Create: `src/taojinshu-ai-sdk/core/persistence/quarantine-repository.ts`
- Create: `src/taojinshu-ai-sdk/core/index.ts`
- Test: `src/taojinshu-ai-sdk/core/contracts/contracts.spec.ts`

**Interfaces:**
- Produces: `WorkspaceId`、`SessionId`、`OperationId`、`AdapterKind`、`UserCommand`、`CommandReceipt`、`AgentEventEnvelope`、`Workspace`、`AgentSession`、`AgentOperation`、`RuntimeState`、`ReadonlyRuntimeState`、`AppendResult`、Repository 端口
- Consumes: 无

- [ ] **Step 1: 编写品牌 ID 与状态契约测试**

测试 `createOperationId('')` 拒绝空值，Operation 初始状态为 `created`，progress 只接受 `null` 或 0–1。

- [ ] **Step 2: 运行测试并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/contracts/contracts.spec.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现最小公共类型**

```ts
export interface AgentOperation {
  readonly id: OperationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: SessionId;
  readonly agentType: string;
  readonly adapterKind: AdapterKind;
  readonly adapterCapabilities: AdapterCapabilities;
  readonly status: 'created' | 'queued' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  readonly phase: string | null;
  readonly progress: number | null;
  readonly lastSequence: number;
  readonly lastEventId: EventId | null;
  readonly partialSuccess: boolean;
}

export interface RuntimeState {
  readonly workspace: Workspace;
  readonly sessions: Readonly<Record<SessionId, AgentSession>>;
  readonly operations: Readonly<Record<OperationId, AgentOperation>>;
  readonly steps: Readonly<Record<string, AgentStep>>;
  readonly messages: Readonly<Record<string, AgentMessage>>;
  readonly toolCalls: Readonly<Record<string, ToolCall>>;
  readonly artifacts: Readonly<Record<ArtifactId, Artifact>>;
}
```

Message/ToolCall/Artifact 在本任务只冻结最小公共类型和空集合初始值；其事件归约分别由 WP2A/WP4 实现。
Command 首期只实现 `operation.start.request`、`operation.cancel.request`；Operation Event 首期只实现
created、queued、started、phase.changed、progress.changed、step started/completed/failed、completed/failed/cancelled/interrupted。

- [ ] **Step 4: 验证类型和测试**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/contracts/contracts.spec.ts
pnpm exec vue-tsc --noEmit
pnpm check:ai-sdk-docs
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-sdk/core src/taojinshu-ai-sdk/core/contracts/contracts.spec.ts
git commit -m "feat: define ai runtime v1 contracts"
```

### Task 3: 实现 Event Codec 与状态机

**Files:**
- Create: `src/taojinshu-ai-sdk/core/protocol/event/event-codec.ts`
- Create: `src/taojinshu-ai-sdk/core/state-machine/operation-state-machine.ts`
- Create: `src/taojinshu-ai-sdk/core/errors/error-codes.ts`
- Create: `src/taojinshu-ai-sdk/core/errors/agent-sdk-error.ts`
- Test: `src/taojinshu-ai-sdk/core/protocol/event/event-codec.spec.ts`
- Test: `src/taojinshu-ai-sdk/core/state-machine/operation-state-machine.spec.ts`

**Interfaces:**
- Consumes: `AgentEventEnvelope`、`OperationStatus`
- Produces: `decodeAgentEvent(input: unknown): AgentEventEnvelope`、`assertOperationTransition(from, to): void`

- [ ] **Step 1: 编写非法输入和状态转移测试**

覆盖缺 eventId、sequence=0、未知 critical Event、running->created、completed->running。

- [ ] **Step 2: 运行测试并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/protocol/event/event-codec.spec.ts src/taojinshu-ai-sdk/core/state-machine/operation-state-machine.spec.ts
```

Expected: FAIL，Codec 和状态机不存在。

- [ ] **Step 3: 实现穷尽校验**

Codec 显式验证对象、字符串、ISO 时间、正整数 sequence 和已知 payload；状态机使用只读转移表。禁止用 `input as AgentEventEnvelope` 绕过校验。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/protocol/event/event-codec.spec.ts src/taojinshu-ai-sdk/core/state-machine/operation-state-machine.spec.ts
pnpm exec vue-tsc --noEmit
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-sdk/core/protocol src/taojinshu-ai-sdk/core/state-machine src/taojinshu-ai-sdk/core/errors
git commit -m "feat: validate agent events and transitions"
```

### Task 4: 实现纯 Reducer

**Files:**
- Create: `src/taojinshu-ai-sdk/core/reducer/create-initial-state.ts`
- Create: `src/taojinshu-ai-sdk/core/reducer/reduce-event.ts`
- Test: `src/taojinshu-ai-sdk/core/reducer/reduce-event.spec.ts`

**Interfaces:**
- Consumes: `RuntimeState`、已解码 `AgentEventEnvelope`
- Produces: `createInitialState(): RuntimeState`、`reduceEvent(state, event): RuntimeState`

- [ ] **Step 1: 编写归约测试**

覆盖完整成功链、重复 `(sequence,eventId)`、同序列不同 eventId、序列空洞、非法状态转移、输入对象未被修改。

- [ ] **Step 2: 运行测试并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/reducer/reduce-event.spec.ts
```

Expected: FAIL，Reducer 不存在。

- [ ] **Step 3: 实现最小 Reducer**

只处理 WP0 Event 集合；`sequence=lastSequence+1` 才归约；重复事件返回原 state；冲突和空洞抛出稳定 `AgentSdkError`。

- [ ] **Step 4: 验证确定性**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/reducer/reduce-event.spec.ts
pnpm check:ai-sdk-docs
pnpm check:ai-boundaries
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-sdk/core/reducer src/taojinshu-ai-sdk/core/reducer/reduce-event.spec.ts
git commit -m "feat: add deterministic agent event reducer"
```

### Task 5: 建立单一 Runtime 门面和 Fake Transport

**Files:**
- Create: `src/taojinshu-ai-sdk/core/ports/transport.ts`
- Create: `src/taojinshu-ai-sdk/core/ports/clock.ts`
- Create: `src/taojinshu-ai-sdk/core/ports/id-generator.ts`
- Create: `src/taojinshu-ai-sdk/core/feature-flag/feature-provider.ts`
- Create: `src/taojinshu-ai-sdk/core/feature-flag/static-feature-provider.ts`
- Create: `src/taojinshu-ai-sdk/core/runtime/runtime-options.ts`
- Create: `src/taojinshu-ai-sdk/core/runtime/agent-runtime.ts`
- Create: `src/taojinshu-ai-sdk/core/runtime/create-agent-runtime.ts`
- Create: `src/taojinshu-ai-sdk/core/runtime/transport-router.ts`
- Create: `src/taojinshu-ai-sdk/core/runtime/commit-queue.ts`
- Create: `src/taojinshu-ai-sdk/core/registry/agent-adapter-registry.ts`
- Create: `src/taojinshu-ai-sdk/core/testing/fake-event-repository.ts`
- Create: `src/taojinshu-ai-sdk/core/projector/create-runtime-projector.ts`
- Create: `src/taojinshu-ai-sdk/core/testing/fixtures.ts`
- Create: `src/taojinshu-ai-sdk/core/testing/fake-transport.ts`
- Create: `src/taojinshu-ai-sdk/index.ts`
- Test: `src/taojinshu-ai-sdk/core/runtime/agent-runtime.integration.spec.ts`

**Interfaces:**
- Produces: `createAgentRuntime({ ownerId, workspaceId, ...ports }): AgentRuntime`
- Produces: `start()`、`dispatch()`、`subscribe()`、`getState()`、`dispose()`
- Consumes: `TransportRouter`、`AgentTransport.send()`、`AgentTransport.subscribe()`、`EventRepository.append()`

- [ ] **Step 1: 编写最小闭环测试**

FakeTransport 收到携带 operationId 的 start Command 后返回一致 Receipt，再依次输出标准事件；断言
Adapter route 固定、订阅者看到 created/queued/running/completed，最终 progress=1。另以两个 Operation
并发 Event 验证单写队列不丢状态更新。

- [ ] **Step 2: 运行测试并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/runtime/agent-runtime.integration.spec.ts
```

Expected: FAIL，Runtime 工厂不存在。

- [ ] **Step 3: 实现 Runtime**

Runtime 负责 Command 路由、Receipt 校验、Event decode、单写队列、预归约、内存 EventRepository
原子追加、状态提交、订阅通知和 dispose；首期不实现持久化 Snapshot。投影刷新可以同步执行，
后续由 PresentationScheduler 批量展示。

- [ ] **Step 4: 执行 WP0 全量验证**

```bash
pnpm check:ai-sdk-docs
pnpm check:ai-boundaries
pnpm exec vue-tsc --noEmit
pnpm exec vitest run src/taojinshu-ai-sdk
pnpm test
pnpm build
```

Expected: 全部退出码 0；现有测试无新增 warning/error。

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-sdk
git commit -m "feat: add minimal agent runtime kernel"
```
