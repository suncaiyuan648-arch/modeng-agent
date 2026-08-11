# WP1 Geo Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Geo 的研究进度切片迁移到 AgentRuntime，同时保持其余 Geo 页面继续使用现有 Store。

**Architecture:** Geo Agent 位于 `src/ai-agents/geo-ad`，Mock Adapter 产生 v1 事件；Geo Facade 是新旧状态的唯一桥。页面只读 `GeoResearchViewModel`，Feature Flag 在 Operation 创建时冻结实现选择。

**Tech Stack:** Vue 3.5、Pinia 3、TypeScript、Vitest；复用现有 `MockGeoAdApi` Fixture，不修改后端。

## Global Constraints

- 只迁移 research progress，不迁移资料、内容、报价和投放。
- 不删除或重写现有 Phase A–H 视觉组件。
- 同一次研究不得同时调用旧 `store.runResearch()` 和新 Runtime。
- Geo 业务类型不得进入 `taojinshu-ai-sdk`。
- 新文件和方法必须有完整中文 TSDoc。

---

### Task 1: 锁定旧研究行为并定义 Geo 契约

**Files:**
- Create: `src/ai-agents/geo-ad/domain/research-report.ts`
- Create: `src/ai-agents/geo-ad/definition/geo-research-view-model.ts`
- Create: `src/ai-agents/geo-ad/testing/fixtures.ts`
- Create: `src/ai-agents/geo-ad/index.ts`
- Test: `src/pages/chat/geoAdDelivery/__tests__/legacy-research-characterization.spec.ts`
- Test: existing `tests/geo-ad-delivery-store.spec.ts`

**Interfaces:**
- Produces: `GeoResearchViewModel`、`GeoResearchReport`、normal/platform-failure Fixtures
- Consumes: 当前 `ResearchResult`、`ResearchPlatform`

- [ ] **Step 1: 添加 Characterization Tests**

验证旧 Mock 的平台数量、状态、报告和推荐平台；这些断言是 Adapter 迁移基线，不更改现有门禁测试。

- [ ] **Step 2: 运行旧测试**

```bash
pnpm exec vitest run tests/geo-ad-delivery-store.spec.ts src/pages/chat/geoAdDelivery/__tests__/legacy-research-characterization.spec.ts
```

Expected: 新测试先因类型/Fixture 不存在失败；原测试继续 PASS。

- [ ] **Step 3: 定义只读 ViewModel**

```ts
export interface GeoResearchViewModel {
  readonly operationId: OperationId | null;
  readonly status: OperationStatus | 'idle';
  readonly phase: string | null;
  /** 0–1；UI 自行格式化为百分比。 */
  readonly progress: number | null;
  readonly platformSteps: readonly GeoResearchPlatformView[];
  readonly reportArtifact: ArtifactViewModel | null;
  readonly partialSuccess: boolean;
  readonly error: OperationErrorView | null;
  readonly availableIntents: readonly UiIntent[];
  readonly recoveredAt: string | null;
  readonly canStart: boolean;
  readonly canCancel: boolean;
}
```

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/pages/chat/geoAdDelivery/__tests__/legacy-research-characterization.spec.ts tests/geo-ad-delivery-store.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/ai-agents/geo-ad src/pages/chat/geoAdDelivery/__tests__/legacy-research-characterization.spec.ts
git commit -m "test: characterize geo research flow"
```

### Task 2: 实现 Geo Mock Event Adapter 与 Projector

**Files:**
- Create: `src/ai-agents/geo-ad/adapter/geo-mock-adapter.ts`
- Create: `src/ai-agents/geo-ad/definition/geo-agent-definition.ts`
- Create: `src/ai-agents/geo-ad/definition/geo-ui-state-projector.ts`
- Test: `src/ai-agents/geo-ad/adapter/geo-mock-adapter.spec.ts`
- Test: `src/ai-agents/geo-ad/definition/geo-projector.spec.ts`

**Interfaces:**
- Consumes: `AgentTransport`、`RuntimeState`、Geo Fixture
- Produces: `createGeoMockTransport(scenario)`、`projectGeoResearch(state, operationId)`

- [ ] **Step 1: 编写事件序列测试**

normal 输出连续 sequence 和 completed；platform-failure 输出单平台 step failed，但其他平台和研究结果仍可用，因此 Operation 进入 completed，并在 ViewModel 标记 partialSuccess，不能把单平台失败升级成整个 Operation failed。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/ai-agents/geo-ad/adapter/geo-mock-adapter.spec.ts src/ai-agents/geo-ad/definition/geo-projector.spec.ts
```

- [ ] **Step 3: 实现 Adapter 和纯 Projector**

Adapter 只生成标准事件，不修改 Pinia；Projector 不读取 Router、DOM 或旧 Store。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/ai-agents/geo-ad
pnpm check:ai-agents-docs
pnpm check:ai-boundaries
```

- [ ] **Step 5: 提交**

```bash
git add src/ai-agents/geo-ad
git commit -m "feat: adapt geo research to agent events"
```

### Task 3: 建立 Geo Research Facade 与 Pinia 只读桥

**Files:**
- Create: `src/ai-application/conversation/create-geo-research-facade.ts`
- Create: `src/ai-application/conversation/use-geo-research.ts`
- Test: `src/ai-application/conversation/geo-research-facade.spec.ts`

**Interfaces:**
- Produces: `startResearch()`、`cancelResearch()`、`researchView` readonly ref
- Consumes: `AiWorkspaceApplication`、`GeoResearchProjector`、Feature Flag 快照、注入的 `LegacyGeoResearchPort`

- [ ] **Step 1: 编写双写防护测试**

新 Flag 开启时只 dispatch Runtime Command；关闭时只调用注入的 Legacy Port；Application 和 Facade
均不得 import 页面 Store。Operation 创建后改变 Flag 不切换实现；Legacy `cancelResearch()` 返回 capability rejected。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/ai-application/conversation/geo-research-facade.spec.ts
```

- [ ] **Step 3: 实现 Facade**

Vue/Pinia 桥只保存 projector 输出和 command pending，不保存可写 Operation 副本。该任务属于
`WP3A Application` 的文件所有权，必须在 Application 公共门面冻结后由 `DEV-WP3A` 执行；
`DEV-WP1` 仅提供 Geo Definition、Projector 和 Fixture。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/ai-application/conversation/geo-research-facade.spec.ts
pnpm exec vue-tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add src/ai-application/conversation
git commit -m "feat: add geo research runtime facade"
```

### Task 4: 接入 ResearchProgress 页面

**Files:**
- Modify: `src/pages/chat/geoAdDelivery/GeoAdDeliveryPage.vue`
- Modify: `src/pages/chat/geoAdDelivery/components/ResearchProgress.vue`
- Test: `src/pages/chat/geoAdDelivery/__tests__/geo-research-page.integration.spec.ts`
- Regression: `tests/geo-ad-page-flow.spec.ts`
- Regression: `tests/geo-ad-routing.spec.ts`

**Interfaces:**
- Consumes: `useGeoResearch()`
- Produces: 页面事件 `start/cancel` 和纯 props 渲染

- [ ] **Step 1: 编写页面集成测试**

验证点击开始后逐步显示平台进度、用户上一个/下一个页面无状态丢失、失败显示重试提示、旧 Flag 关闭时原流程仍工作。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/pages/chat/geoAdDelivery/__tests__/geo-research-page.integration.spec.ts
```

- [ ] **Step 3: 最小替换研究数据源**

只修改 research 分支；其他 `campaign` 字段继续来自旧 Store。页面保持单根节点，PC/mobile 共享语义。

- [ ] **Step 4: 执行 WP1 验证**

```bash
pnpm exec vitest run src/ai-agents/geo-ad
pnpm exec vitest run tests/geo-ad-page-flow.spec.ts tests/geo-ad-routing.spec.ts tests/geo-ad-delivery-store.spec.ts
pnpm check:ai-agents-docs
pnpm check:ai-application-docs
pnpm exec vue-tsc --noEmit
pnpm build
```

Expected: 全部退出码 0。

- [ ] **Step 5: 提交**

```bash
git add src/pages/chat/geoAdDelivery src/ai-application/conversation
git commit -m "feat: migrate geo research progress to agent runtime"
```
