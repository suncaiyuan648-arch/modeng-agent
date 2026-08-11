# WP6 Uni-app Cross-platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让同一 SDK/Conversation Core 在 uni-app H5、App 和微信小程序运行，并交付最小 Geo 对话与报告展示。

**Architecture:** Core 不导入全局 `uni`；Platform Adapter 接收 `UniApiLike` 注入。实时首选 chunk，能力不足时使用 afterSequence 轮询；uni UI 与 Web UI 共用 ViewModel 和语义 Fixture，不共用 DOM 实现。

**Tech Stack:** TypeScript、Vue 3/uni-app、Vitest Mock、HBuilderX/uni CLI 消费工程、iOS/Android/微信开发者工具。

## Global Constraints

- 当前 Vite Web 仓库只保存可提取源码和 Mock 测试；真机验收必须在 uni-app 消费工程完成。
- 不在 Core 使用条件编译、window、File、Blob 或 HTMLElement。
- H5、App、微信小程序必须支持轮询回退。
- 组件样式使用 rem/rpx 的消费端适配策略，不复制 Web DOM 滚动代码。

---

### Task 1: 实现 Uni Transport

**Files:**
- Create: `src/taojinshu-ai-sdk/platform/uni/uni-api-like.ts`
- Create: `src/taojinshu-ai-sdk/platform/uni/uni-transport.ts`
- Create: `src/taojinshu-ai-sdk/platform/uni/chunk-decoder.ts`
- Test: `src/taojinshu-ai-sdk/platform/uni/uni-transport.conformance.spec.ts`

**Interfaces:**
- Produces: `createUniTransport({ api, baseUrl, tokenProvider, capabilities })`
- Consumes: `UniApiLike.request()`、AgentTransport conformance suite

- [ ] **Step 1: 编写传输一致性测试**

覆盖 UTF-8 跨 chunk、一个 chunk 多事件、断线 afterSequence、abort、chunk 不支持轮询、401 不自动重试。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/platform/uni/uni-transport.conformance.spec.ts
```

- [ ] **Step 3: 实现注入式 Adapter**

`UniApiLike` 只声明实际使用的 request/task 方法，避免 Core 依赖具体 uni 类型包。轮询响应读取 events、nextSequence、hasMore、terminal。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/platform/uni/uni-transport.conformance.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-sdk/platform/uni
git commit -m "feat: add uni agent transport adapter"
```

### Task 2: 实现 Uni Persistence 与生命周期

> 文件所有权拆分：SDK Persistence/Platform 由 `DEV-WP6A/QA-WP6A` 签收；
> `create-uni-draft-repository.ts` 由 `DEV-WP6D/QA-WP6D` 单独签收和提交。

**Files:**
- Create: `src/taojinshu-ai-sdk/platform/uni/uni-persistence.ts`
- Create: `src/taojinshu-ai-sdk/platform/uni/uni-platform.ts`
- Create: `src/ai-application/platform/create-uni-draft-repository.ts`
- Test: `src/taojinshu-ai-sdk/platform/uni/uni-persistence.conformance.spec.ts`
- Test: `src/taojinshu-ai-sdk/platform/uni/uni-lifecycle.spec.ts`
- Test: `src/ai-application/platform/create-uni-draft-repository.spec.ts`

**Interfaces:**
- Consumes: `UniApiLike` storage/lifecycle、WP5 Persistence conformance suite
- Produces: Uni EventRepository、SnapshotRepository、PlatformPort

- [ ] **Step 1: 编写配额和生命周期测试**

覆盖分片写入、写满后先清 Cache、活跃 cursor 保留、后台 flush、前台 replay、owner namespace 清理。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/platform/uni/uni-persistence.conformance.spec.ts src/taojinshu-ai-sdk/platform/uni/uni-lifecycle.spec.ts src/ai-application/platform/create-uni-draft-repository.spec.ts
```

- [ ] **Step 3: 实现 Storage Adapter**

Snapshot/Event 使用不同 key 前缀；临时文件只保存 localKey；进入后台不执行超过平台允许时间的长任务。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/platform/uni src/ai-application/platform/create-uni-draft-repository.spec.ts
```

- [ ] **Step 5: 提交**

SDK Platform 提交：

```bash
git add src/taojinshu-ai-sdk/platform/uni
git commit -m "feat: add uni runtime persistence and lifecycle"
```

Application Adapter 提交：

```bash
git add src/ai-application/platform/create-uni-draft-repository.ts src/ai-application/platform/create-uni-draft-repository.spec.ts
git commit -m "feat: add uni conversation draft adapter"
```

### Task 3: 实现最小 Uni Chat UI

> 文件所有权拆分：通用 uni UI 由 `DEV-WP6B/QA-WP6B` 签收，Geo uni Renderer 由
> `DEV-WP6C/QA-WP6C` 签收。两者共用语义 Fixture，但必须分别提交和测试。

**Files:**
- Create: `src/taojinshu-ai-ui/uni/chat/AiChatViewport.vue`
- Create: `src/taojinshu-ai-ui/uni/message/AiMessageList.vue`
- Create: `src/taojinshu-ai-ui/uni/message/AiMessageBubble.vue`
- Create: `src/taojinshu-ai-ui/uni/composer/AiComposer.vue`
- Create: `src/ai-agents/geo-ad/renderer/uni/GeoResearchReportRenderer.vue`
- Test: `src/taojinshu-ai-ui/uni/semantic-rendering.spec.ts`

**Interfaces:**
- Consumes: 与 Web 相同 ConversationViewModel、ComposerController、RendererDefinition
- Produces: uni-app 兼容组件，不使用动态远程组件

- [ ] **Step 1: 用 Web 语义 Fixture 编写测试**

同一 Fixture 验证 Timeline 顺序、角色、streaming、Artifact status、Intent type 和 Composer disabled 语义一致。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/uni/semantic-rendering.spec.ts
```

- [ ] **Step 3: 实现 Uni 组件**

使用 scroll-view/平台滚动能力实现 ViewportPort；移动端 Composer 包含语音 slot、安全区和键盘 resize；不使用 Web BubbleList。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/uni/semantic-rendering.spec.ts
pnpm exec vue-tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-ui/uni src/ai-agents/geo-ad/renderer/uni
git commit -m "feat: add minimal uni ai conversation ui"
```

### Task 4: 消费工程与真机验收

**Files:**
- Create in uni consumer: `src/pages/ai-runtime-smoke/index.vue`
- Create in uni consumer: `src/ai/create-uni-ai-application.ts`
- Test record: `docs/agent-runtime-modernization/implementation/evidence/uni-device-matrix.md`

**Interfaces:**
- Consumes: SDK、Conversation、UI Uni 公开入口
- Produces: H5/App/微信小程序 Smoke 页面和真机证据

- [ ] **Step 1: 接入本地源码包**

消费工程只从公开入口导入，不能通过相对路径深层访问 internal 文件。

- [ ] **Step 2: 执行平台构建**

```bash
pnpm build:h5
pnpm build:app
pnpm build:mp-weixin
```

Expected: 三端构建退出码 0。uni 消费工程必须在接入提交中提供名称完全一致的 `build:h5`、`build:app`、`build:mp-weixin` 脚本，测试人员不使用临时手工命令替代。

- [ ] **Step 3: 执行真机剧本**

在 iOS Safari/WebView、Android Chrome/WebView、微信开发者工具和至少一台微信真机验证发送、停止、上滑、查看最新、后台恢复、轮询降级和报告 Intent。

- [ ] **Step 4: 执行 WP6 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/uni
pnpm exec vitest run src/taojinshu-ai-sdk/platform/uni
pnpm check:ai-sdk-docs
pnpm check:ai-ui-docs
pnpm check:ai-agents-docs
pnpm check:ai-boundaries
```

同时附上消费工程三端构建日志和设备矩阵；缺任一目标不得宣称三端适配完成。

- [ ] **Step 5: 提交**

在当前 SDK 仓库提交验收证据：

```bash
git add docs/agent-runtime-modernization/implementation/evidence/uni-device-matrix.md
git commit -m "test: record uni ai runtime device acceptance"
```

在 uni 消费工程提交 Smoke 页面和固定构建脚本：

```bash
git add package.json src/pages/ai-runtime-smoke/index.vue src/ai/create-uni-ai-application.ts
git commit -m "test: add uni ai runtime smoke integration"
```

不得把构建产物、token 或签名文件提交到任一仓库。
