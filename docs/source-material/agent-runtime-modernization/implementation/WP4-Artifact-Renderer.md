# WP4 Artifact Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立版本化 Artifact Schema Registry、Intent 安全执行和 Geo 研究报告 Web 卡片。

**Architecture:** Artifact 是 SDK Domain 事实，Registry 校验 `schemaName + schemaVersion + data`，UI 使用本地可信 Renderer。Geo 报告 Schema/Renderer 位于业务 Agent，不进入通用 SDK。

**Tech Stack:** TypeScript、Vue 3.5、Vitest、Vue Test Utils。

## Global Constraints

- 后端/Adapter 不得下发组件名、组件路径、函数或原始 HTML。
- 未注册或 major 不兼容 Schema 必须安全降级。
- Intent 必须校验来源实体、Capability 和 payload。
- Artifact Domain 数据不复制进 Message，只通过 ArtifactId 引用。

---

### Task 1: 实现 Artifact 生命周期与 Schema Registry

**Files:**
- Create: `src/taojinshu-ai-sdk/core/state-machine/artifact-state-machine.ts`
- Create: `src/taojinshu-ai-sdk/core/registry/schema-registry.ts`
- Create: `src/taojinshu-ai-sdk/core/protocol/schema/schema-metadata.ts`
- Create: `src/taojinshu-ai-sdk/core/protocol/schema/render-schema.ts`
- Test: `src/taojinshu-ai-sdk/core/state-machine/artifact-state-machine.spec.ts`
- Test: `src/taojinshu-ai-sdk/core/registry/schema-registry.spec.ts`

**Interfaces:**
- Produces: `SchemaRegistry.register()`、`parse()`、`supports()`、`assertArtifactTransition()`
- Consumes: `Artifact` 最小契约、`unknown` data

- [ ] **Step 1: 编写状态和版本失败测试**

覆盖 processing->ready、ready->processing、archived 终态、重复注册、非法 data、同 major 迁移、更高 major 拒绝。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/state-machine/artifact-state-machine.spec.ts src/taojinshu-ai-sdk/core/registry/schema-registry.spec.ts
```

- [ ] **Step 3: 实现 Registry 和状态机**

`parse()` 失败不得返回原始 input；迁移函数为纯函数并逐版本执行。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/state-machine/artifact-state-machine.spec.ts src/taojinshu-ai-sdk/core/registry/schema-registry.spec.ts
```

- [ ] **Step 5: 提交**

```bash
git add src/taojinshu-ai-sdk/core
git commit -m "feat: add artifact schema registry"
```

### Task 2: 分层实现 Render Contract、组件 Registry 与 IntentExecutor

> 文件所有权拆分：SDK 数据协议由 `DEV-WP4A/QA-WP4A`，UI 组件 Registry 由
> `DEV-WP4B/QA-WP4B`，Application IntentExecutor 由 `DEV-WP3A/QA-WP3A` 签收。
> 三组先分别提交，再由集成测试验证组合。

**Files:**
- Create: `src/taojinshu-ai-sdk/core/protocol/schema/render-model.ts`
- Create: `src/taojinshu-ai-sdk/core/protocol/schema/ui-intent.ts`
- Create: `src/taojinshu-ai-ui/contracts/artifact-renderer.ts`
- Create: `src/taojinshu-ai-ui/contracts/component-renderer-registry.ts`
- Create: `src/taojinshu-ai-ui/contracts/create-component-renderer-registry.ts`
- Create: `src/ai-application/intent/intent-context.ts`
- Create: `src/ai-application/intent/intent-executor.ts`
- Create: `src/taojinshu-ai-ui/web/artifact/AiArtifactCard.vue`
- Create: `src/taojinshu-ai-ui/web/artifact/UnsupportedArtifact.vue`
- Test: `src/taojinshu-ai-ui/contracts/component-renderer-registry.spec.ts`
- Test: `src/ai-application/intent/intent-executor.spec.ts`
- Test: `src/taojinshu-ai-ui/web/artifact/AiArtifactCard.spec.ts`

**Interfaces:**
- Produces: `RenderModel`、`ComponentRendererRegistry.resolve()`、`IntentExecutor.execute()`
- Consumes: 已校验 RenderSchema、可信本地 RendererDefinition

- [ ] **Step 1: 编写安全测试**

覆盖未知组件名、危险 URL、伪造 ArtifactId、未知 Intent、重复点击幂等、缺 Renderer fallback。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/contracts/component-renderer-registry.spec.ts src/ai-application/intent/intent-executor.spec.ts src/taojinshu-ai-ui/web/artifact/AiArtifactCard.spec.ts
```

- [ ] **Step 3: 实现通用 Card 外壳**

外壳只负责 title/status/error/actions slots；业务 data 由已注册 Renderer 消费；原始 JSON 不显示给用户。

- [ ] **Step 4: 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-ui/contracts/component-renderer-registry.spec.ts src/ai-application/intent/intent-executor.spec.ts src/taojinshu-ai-ui/web/artifact/AiArtifactCard.spec.ts
```

- [ ] **Step 5: 提交**

SDK 契约提交：

```bash
git add src/taojinshu-ai-sdk/core/protocol/schema
git commit -m "feat: add secure artifact render contracts"
```

UI Registry 和 Web 组件提交：

```bash
git add src/taojinshu-ai-ui/contracts src/taojinshu-ai-ui/web/artifact
git commit -m "feat: add web artifact card"
```

Application Intent 提交：

```bash
git add src/ai-application/intent
git commit -m "feat: execute trusted artifact intents"
```

### Task 3: 实现 Geo Research Report Artifact

**Files:**
- Create: `src/ai-agents/geo-ad/schema/geo-research-report-v1.ts`
- Create: `src/ai-agents/geo-ad/renderer/web/GeoResearchReportRenderer.vue`
- Modify: `src/ai-agents/geo-ad/definition/geo-agent-definition.ts`
- Modify: `src/pages/chat/geoAdDelivery/components/ResearchReport.vue`
- Test: `src/ai-agents/geo-ad/schema/geo-research-report-v1.spec.ts`
- Test: `src/ai-agents/geo-ad/renderer/web/GeoResearchReportRenderer.spec.ts`

**Interfaces:**
- Produces: `geo.research-report@1.0.0`、Web RendererDefinition
- Consumes: Geo ResearchResult Adapter、AiArtifactCard

- [ ] **Step 1: 编写有效/非法报告 Fixture 测试**

覆盖 questions、summary、competitors、sources；非法 URL、缺 summary、未知 credibility 均拒绝。

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run src/ai-agents/geo-ad/schema/geo-research-report-v1.spec.ts src/ai-agents/geo-ad/renderer/web/GeoResearchReportRenderer.spec.ts
```

- [ ] **Step 3: 实现 Schema、注册和视觉包装**

复用现有 ResearchReport 的视觉内容，但 props 改为经 Schema 校验的 ViewModel；下载/继续操作发 Intent。

- [ ] **Step 4: 执行 WP4 验证**

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/registry/schema-registry.spec.ts src/ai-agents/geo-ad
pnpm check:ai-sdk-docs
pnpm check:ai-ui-docs
pnpm check:ai-agents-docs
pnpm check:ai-boundaries
pnpm exec vue-tsc --noEmit
pnpm build
```

- [ ] **Step 5: 提交**

```bash
git add src/ai-agents/geo-ad src/pages/chat/geoAdDelivery/components/ResearchReport.vue
git commit -m "feat: render geo research report artifact"
```
