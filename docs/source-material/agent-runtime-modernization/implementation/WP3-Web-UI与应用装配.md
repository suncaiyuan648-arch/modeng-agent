# WP3 Web UI and Application Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供受控的 Web ChatViewport、MessageBubble、Composer 和唯一 AiApplication 装配入口，并先接入 Geo 的 AI 对话切片。

**Architecture:** Web UI 只消费 ConversationController 和只读 ViewModel；DOM 滚动封装在 WebViewportPort；Application Composition Root 创建 SDK、Conversation、Agent 和 Registry。页面不感知具体 Adapter。

**Tech Stack:** Vue 3.5 `<script setup>`、Pinia 3、UnoCSS/SCSS rem、Vitest、Vue Test Utils。

## Global Constraints

- 组件使用语义化 class，样式统一 rem，移动端考虑安全区和键盘。
- UI 不解析 SSE、不直接修改 RuntimeState。
- 通用 UI 不导入 `pages` 或具体 Geo/PPT 组件。
- PC/mobile 共享 ViewModel，允许使用不同组件实现。
- 新组件、props、emits、slots 和方法有完整中文注释。

---

### Task 1: 建立 Application Composition Root 与启动装配

**Files:**
- Create: `src/ai-application/ai-application-manager.ts`
- Create: `src/ai-application/create-ai-application-manager.ts`
- Create: `src/ai-application/ai-workspace-application.ts`
- Create: `src/ai-application/vue/ai-application-plugin.ts`
- Create: `src/ai-application/vue/use-ai-application.ts`
- Create: `src/ai-application/registry/register-agents.ts`
- Create: `src/ai-application/platform/create-web-platform.ts`
- Create: `src/ai-application/platform/create-web-draft-repository.ts`
- Create: `src/ai-application/auth/owner-lifecycle.ts`
- Create: `src/ai-application/auth/owner-identity-provider.ts`
- Create: `src/ai-application/auth/token-provider.ts`
- Create: `src/ai-application/legacy/legacy-geo-research-port.ts`
- Create: `src/pages/chat/geoAdDelivery/services/createLegacyGeoResearchPort.ts`
- Create: `src/ai-application/resource/create-resource-picker.ts`
- Create: `src/ai-application/resource/create-resource-resolver.ts`
- Create: `src/ai-application/index.ts`
- Modify: `src/main.ts`
- Test: `src/ai-application/ai-application-manager.spec.ts`

**Interfaces:**
- Produces: `createAiApplicationManager(config): AiApplicationManager`
- Produces: `getCurrentApplication()`、`AiApplication.getWorkspace(workspaceId)`、`disposeWorkspace()`、`disposeOwner()`、`disposeAll()`
- Consumes: Web ports、AgentDefinition、FeatureProvider、动态 TokenProvider 和注入的 Legacy Port

- [ ] **Step 1: 编写装配测试**

验证同一 owner/workspace 返回同一 WorkspaceApplication、不同 workspace 不共享 Runtime、未注册 Agent 被拒绝、
owner 切换先 dispose 再清理、草稿按 owner/session 隔离、TokenProvider 每次请求读取当前 token、
Resource 短时地址校验，以及页面无法获得 EventRepository。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/ai-application/ai-application-manager.spec.ts
```

- [ ] **Step 3: 实现稳定门面**

`main.ts` 必须在 `app.use(store)` 之后、`app.use(router)` 之前完成 Manager 创建和 Vue Plugin 注入；
AiApplication 只导出页面需要的方法，Adapter/Registry 保持私有。测试用 FakePlatform，不读取真实 window。
owner 使用 `authenticated:<environment>:<tenantId>:<userId>` 或持久化的匿名 installationId，禁止 token/hash。
Legacy 实现可以留在 Geo 页面边界并由 `main.ts` 注入，但 `src/ai-application/**` 不得 import `src/pages/**`。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/ai-application/ai-application-manager.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/ai-application src/pages/chat/geoAdDelivery/services/createLegacyGeoResearchPort.ts src/main.ts
git commit -m "feat: add ai application composition root"
```

### Task 2: 实现 Web Viewport Port 和 ChatViewport

**Files:**
- Create: `src/taojinshu-ai-ui/web/chat/create-web-viewport-port.ts`
- Create: `src/taojinshu-ai-ui/web/chat/AiChatViewport.vue`
- Test: `src/taojinshu-ai-ui/web/chat/AiChatViewport.spec.ts`

**Interfaces:**
- Consumes: `ViewportController`、Timeline item IDs
- Produces: DOM `ViewportPort`、slot `default`、slot `new-items-indicator`

- [ ] **Step 1: 编写滚动行为测试**

模拟 scrollHeight/clientHeight/scrollTop，验证 following、detached、前插历史 anchor、查看最新和 resize。使用 fake timers 只验证明确调度，不硬编码 350ms。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/web/chat/AiChatViewport.spec.ts
```

- [ ] **Step 3: 实现组件和 Port**

组件不拥有消息数据；每个 Timeline DOM 节点使用稳定 `data-timeline-id`。iOS 键盘使用 visualViewport Adapter，缺失时使用 resize 回退。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/web/chat/AiChatViewport.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-ui/web/chat
git commit -m "feat: add web chat viewport"
```

### Task 3: 实现 MessageList 与 MessageBubble

**Files:**
- Create: `src/taojinshu-ai-ui/web/message/AiMessageList.vue`
- Create: `src/taojinshu-ai-ui/web/message/AiMessageBubble.vue`
- Create: `src/taojinshu-ai-ui/web/message/AiMessageBlockRenderer.vue`
- Test: `src/taojinshu-ai-ui/web/message/AiMessageBlockRenderer.spec.ts`

**Interfaces:**
- Consumes: `ConversationViewModel`、`MessageContentBlockViewModel`、Intent callback
- Produces: `intent`、`feedback`、`retry` events

- [ ] **Step 1: 编写组件测试**

覆盖 user/assistant/system、text、reasoning-summary、resource/tool/artifact/citation-group reference、streaming、failed、复制和未知 Block fallback。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/web/message/AiMessageBlockRenderer.spec.ts
```

- [ ] **Step 3: 实现受控组件**

Bubble 不导入旧 `MessageItem`，不继承第三方 BubbleProps；Artifact/Tool 内容通过 Registry slot/renderer，未知类型安全降级。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/web/message/AiMessageBlockRenderer.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-ui/web/message
git commit -m "feat: add structured web message renderer"
```

### Task 4: 实现 Web Composer

**Files:**
- Create: `src/taojinshu-ai-ui/web/composer/AiComposer.vue`
- Create: `src/taojinshu-ai-ui/web/composer/AiComposerAttachments.vue`
- Test: `src/taojinshu-ai-ui/web/composer/AiComposer.spec.ts`

**Interfaces:**
- Consumes: `ComposerController`、Resource picker slot、Agent/Model selector slots
- Produces: 视觉输入、submit/stop 操作；不直接发送 API

- [ ] **Step 1: 编写输入测试**

覆盖 compositionstart/end、Enter/Cmd+Enter 策略、粘贴/拖拽 Resource 回调、loading stop、校验错误、移动端语音 slot。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/web/composer/AiComposer.spec.ts
```

- [ ] **Step 3: 实现受控 Composer**

上传由应用提供的 ResourcePicker 完成，AiComposer 只调用 attachResource；模型/Agent/Tool 通过 slot 和 execution options 接入。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/web/composer/AiComposer.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-ui/web/composer
git commit -m "feat: add controlled web ai composer"
```

### Task 5: 以 Geo AiResearchChat 做首个真实 UI 接入

**Files:**
- Modify: `src/pages/chat/geoAdDelivery/components/AiResearchChat.vue`
- Create: `src/ai-application/conversation/use-geo-research-conversation.ts`
- Test: `src/pages/chat/geoAdDelivery/__tests__/geo-research-chat.integration.spec.ts`
- Regression: `tests/geo-ad-page-flow.spec.ts`

**Interfaces:**
- Consumes: `useAiApplication().getWorkspace(workspaceId).getConversation(sessionId)`、AiChatViewport、AiMessageList、AiComposer
- Produces: Geo AI 对话的发送、流式展示、停止和滚动跟随

- [ ] **Step 1: 编写完整交互测试**

本任务必须在 WP2A Message Kernel 和 WP2 Conversation Kit 完成后执行。发送“主推家庭套餐”，Mock 逐块回复；
用户上滑后不自动到底；显示查看最新；停止后 Message 进入 `stopped`，Composer 可再次发送。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/pages/chat/geoAdDelivery/__tests__/geo-research-chat.integration.spec.ts
```

- [ ] **Step 3: 替换组件内部实现**

保留 AiResearchChat 对页面的现有外部契约，内部切换新 UI；Feature Flag 关闭时保留旧实现，禁止一次会话中途切换。

- [ ] **Step 4: 执行 WP3 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/web src/pages/chat/geoAdDelivery/__tests__/geo-research-chat.integration.spec.ts tests/geo-ad-page-flow.spec.ts
pnpm exec vue-tsc --noEmit
pnpm check:ai-application-docs
pnpm check:ai-ui-docs
pnpm check:ai-boundaries
pnpm build
```

- [ ] **Step 5: 提交**

```bash
git add src/ai-application/conversation/use-geo-research-conversation.ts src/pages/chat/geoAdDelivery/components/AiResearchChat.vue src/pages/chat/geoAdDelivery/__tests__/geo-research-chat.integration.spec.ts tests/geo-ad-page-flow.spec.ts
git commit -m "feat: adopt ai conversation ui in geo chat"
```
