# WP2 Conversation Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立不依赖 Vue/DOM/网络的 ConversationProjector、Composer Controller 和 Viewport State Machine。

**Architecture:** Conversation Kit 订阅 AgentRuntime 只读状态并生成 Session 级 Timeline；所有交互状态可丢弃或通过专用 DraftPort 保存。它不解析 SSE、不归约 Operation Event、不读写 Agent Snapshot。

**Tech Stack:** 纯 TypeScript、Vitest；使用 WP0 Fixtures 和 Fake Clock。

## Global Constraints

- 不导入 Vue、Pinia、Router、DOM、Element Plus、fetch、hook-fetch 或 uni。
- v1 使用 `SessionId` 作为 ConversationViewModel key，不新建持久化 ConversationId。
- Message、ToolCall、Artifact 和 Resource 只保存 SDK 引用，不复制领域对象。
- Composer 只构造 User Command，不执行 Transport。
- 所有文件、字段、函数和方法使用完整中文 TSDoc。

---

### Task 1: 定义 Timeline 与 ConversationProjector

**Files:**
- Create: `src/taojinshu-ai-conversation/conversation/conversation-view-model.ts`
- Create: `src/taojinshu-ai-conversation/conversation/conversation-projector.ts`
- Create: `src/taojinshu-ai-conversation/message/message-view-state.ts`
- Create: `src/taojinshu-ai-conversation/testing/fixtures.ts`
- Create: `src/taojinshu-ai-conversation/index.ts`
- Test: `src/taojinshu-ai-conversation/conversation/conversation-projector.spec.ts`

**Interfaces:**
- Consumes: `ReadonlyRuntimeState`、`SessionId`
- Produces: `projectConversation(state, sessionId, localState): ConversationViewModel`

- [ ] **Step 1: 编写 Timeline 顺序测试**

Fixture 包含 user message、assistant streaming message、tool call、artifact；断言按 `occurredAt -> operationId -> sourceSequence -> entityId` 排序，并以引用形成 TimelineItem。该顺序在实时消费和重放后必须一致。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-conversation/conversation/conversation-projector.spec.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现只读 ViewModel**

```ts
export type ConversationTimelineItem =
  | { readonly type: 'message'; readonly messageId: string }
  | { readonly type: 'tool-call'; readonly toolCallId: string }
  | { readonly type: 'artifact'; readonly artifactId: ArtifactId };

export interface ConversationViewModel {
  readonly sessionId: SessionId;
  readonly timeline: readonly ConversationTimelineItem[];
  readonly activeOperationIds: readonly OperationId[];
  readonly isStreaming: boolean;
}
```

- [ ] **Step 4: 验证纯函数和边界**

```bash
pnpm exec vitest run src/taojinshu-ai-conversation/conversation/conversation-projector.spec.ts
pnpm check:ai-boundaries
pnpm check:ai-conversation-docs
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-conversation
git commit -m "feat: add conversation timeline projector"
```

### Task 2: 实现 Composer State 与 Policy

**Files:**
- Create: `src/taojinshu-ai-conversation/composer/composer-state.ts`
- Create: `src/taojinshu-ai-conversation/composer/composer-policy.ts`
- Create: `src/taojinshu-ai-conversation/draft/draft-repository.ts`
- Test: `src/taojinshu-ai-conversation/composer/composer-policy.spec.ts`

**Interfaces:**
- Produces: `createComposerState(sessionId)`、`validateComposer(state, policy)`、`DraftRepository`
- Consumes: `SessionId`、`ResourceId`、Capability 集合

- [ ] **Step 1: 编写输入规则测试**

覆盖空文本无附件、只有附件、超长文本、附件超数量、IME composition 期间提交、Agent 不支持文件。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-conversation/composer/composer-policy.spec.ts
```

- [ ] **Step 3: 实现 ComposerState**

```ts
export interface ComposerState {
  readonly sessionId: SessionId;
  readonly text: string;
  readonly resourceIds: readonly ResourceId[];
  readonly isComposing: boolean;
  readonly submitStatus: 'idle' | 'submitting' | 'stopping';
  readonly validationErrors: readonly ComposerValidationError[];
}
```

DraftRepository 只保存 text、resourceIds 和 updatedAt，不保存 token、File、Blob 或上传中的临时对象。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-conversation/composer/composer-policy.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-conversation/composer src/taojinshu-ai-conversation/draft
git commit -m "feat: define cross-platform composer state"
```

### Task 3: 实现 Composer Controller

**Files:**
- Create: `src/taojinshu-ai-conversation/composer/composer-controller.ts`
- Test: `src/taojinshu-ai-conversation/composer/composer-controller.spec.ts`

**Interfaces:**
- Consumes: `AgentRuntime.dispatch()`、`OperationControl`、`DraftRepository`、`ComposerPolicy`、`Clock`、`IdGenerator`
- Produces: `setText()`、`setComposing()`、`attachResource()`、`removeResource()`、`submit()`、`stop()`、`restoreDraft()`

- [ ] **Step 1: 编写 Controller 测试**

验证 composition 中 submit 不发送、重复 submit 被拒绝、提交成功清草稿、发送失败保留草稿；
stop 只调用注入的 `OperationControl.stop()`，不得直接改 Message/Operation 状态。分别覆盖服务端取消、
仅本地停止和完全不可停止三种 capability 结果。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-conversation/composer/composer-controller.spec.ts
```

- [ ] **Step 3: 实现 Controller**

`submit()` 构造 `operation.start.request`，payload 只包含 prompt、resourceIds 和已注册的 execution options；
返回 CommandReceipt 不表示 Operation 已完成。`OperationControl` 由 Application 注入：支持 serverCancel 时发送
cancel Command；只支持本地关闭时执行 Runtime stop command；两者都不支持时返回明确 rejected receipt。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-conversation/composer/composer-controller.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-conversation/composer
git commit -m "feat: add conversation composer controller"
```

### Task 4: 实现 Viewport State Machine

**Files:**
- Create: `src/taojinshu-ai-conversation/viewport/viewport-state.ts`
- Create: `src/taojinshu-ai-conversation/viewport/viewport-port.ts`
- Create: `src/taojinshu-ai-conversation/viewport/viewport-controller.ts`
- Test: `src/taojinshu-ai-conversation/viewport/viewport-controller.spec.ts`

**Interfaces:**
- Produces: `ChatViewportState`、`ViewportPort`、`createViewportController()`
- Consumes: `timelineChanged`、`userScrolled`、`historyPrepending`、`historyPrepended`、`viewportResized`

- [ ] **Step 1: 编写状态机测试**

覆盖 following 自动跟随、用户上滑进入 detached、新消息增加 unseen、点击查看最新恢复 following、前插历史保持 anchor、键盘 resize 不误判用户上滑。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-conversation/viewport/viewport-controller.spec.ts
```

- [ ] **Step 3: 实现状态机**

```ts
export type ViewportMode = 'following' | 'detached' | 'restoring' | 'loading_history';

export interface ChatViewportState {
  readonly mode: ViewportMode;
  readonly nearEnd: boolean;
  readonly unseenItemCount: number;
  readonly anchorItemId: string | null;
  readonly anchorOffset: number;
}
```

Controller 只调用 ViewportPort，不访问 HTMLElement。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-conversation/viewport/viewport-controller.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-conversation/viewport
git commit -m "feat: add chat viewport state machine"
```

### Task 5: 实现 Presentation Scheduler 与总 Controller

**Files:**
- Create: `src/taojinshu-ai-conversation/presentation-stream/presentation-scheduler.ts`
- Create: `src/taojinshu-ai-conversation/conversation/conversation-controller.ts`
- Test: `src/taojinshu-ai-conversation/conversation/conversation-controller.integration.spec.ts`

**Interfaces:**
- Consumes: `AgentRuntime.subscribe()`、Projector、ComposerController、ViewportController、Scheduler
- Produces: `ConversationController.getView()`、`subscribe()`、`composer`、`viewport`、`dispose()`

- [ ] **Step 1: 编写高频投影测试**

Fake Runtime 连续发布 100 次状态；断言领域状态全部消费，但 UI listener 按 Scheduler 批量通知；dispose 后不再通知。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-conversation/conversation/conversation-controller.integration.spec.ts
```

- [ ] **Step 3: 实现总 Controller**

Scheduler 通过注入的 `schedule(callback)` 实现，测试使用同步 Fake，Web 后续使用 requestAnimationFrame；不得解析 raw Event。

- [ ] **Step 4: 执行 WP2 验证**

```bash
pnpm check:ai-conversation-docs
pnpm check:ai-boundaries
pnpm exec vue-tsc --noEmit
pnpm exec vitest run src/taojinshu-ai-conversation
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-conversation
git commit -m "feat: complete headless conversation kit"
```
