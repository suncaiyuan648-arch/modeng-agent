# AI 基建测试工程修订方案

## 1. 当前工程事实

- `package.json` 的 `test` 是 `vitest run --run`；追加 `-- <path>` 会把 `--` 传给 Vitest，不能隔离目标文件。现场命令仍执行了 127 个测试文件、1006 个用例。
- `tsconfig.app.json` 只包含 `src` 和 `types`，没有独立检查测试源码。
- `vitest.config.mts` 只收集 `tests/**/*.spec.ts`，不收集 AGENTS.md 要求的同目录 `.spec.ts/.test.ts`。
- `playwright.config.ts` 只有 Chromium、无 webServer；jsdom 不能验证真实滚动、visualViewport 和 IndexedDB 行为。
- TypeScript Compiler API 不能单独解析 Vue SFC 的 `defineProps/defineEmits/defineSlots`。

## 2. 测试文件归属

遵循当前仓库 AGENTS.md，不为 AI Runtime 创建测试位置例外：

```text
src/taojinshu-ai-sdk/**/<source>.spec.ts              / SDK 单元测试，与源码同目录
src/taojinshu-ai-conversation/**/<source>.spec.ts     / Headless 单元测试
src/taojinshu-ai-ui/**/<component>.spec.ts            / Vue 组件单元测试
src/ai-application/**/<source>.spec.ts                 / Composition 单元测试
src/ai-agents/**/<source>.spec.ts                      / Agent/Adapter 单元与 conformance
src/pages/**/__tests__/*.spec.ts                       / 页面集成测试
tests/e2e/ai-runtime/*.e2e.ts                          / 跨模块真实浏览器测试
tests/fixtures/ai-v1.1/**                              / 跨模块 JSON Fixture；只存数据，不存测试逻辑
```

WP0–WP6 中旧的 `tests/ai-sdk`、`tests/ai-conversation`、`tests/ai-ui` 文件位置不再有效；实施者必须使用本节位置。现有仓库历史测试继续保留在 `tests/`，不做无关搬迁。

## 3. Vitest 与 TypeScript 配置

`vitest.config.mts` 收集范围调整为：

```ts
include: [
  'tests/**/*.spec.ts',
  'src/**/*.spec.ts',
  'src/**/*.test.ts',
]
```

新增 `tsconfig.test.json`：继承 `tsconfig.app.json`，加入 `src/**/*.spec.ts`、`src/**/*.test.ts`、
`tests/**/*.spec.ts`、`tests/**/*.e2e.ts` 和 Vitest/Node 类型。测试类型门禁使用：

```bash
pnpm exec vue-tsc -p tsconfig.test.json --noEmit
```

单项测试必须直接调用 Vitest，不经过当前 `pnpm test --`：

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/reducer/reduce-event.spec.ts
```

新增稳定脚本：

```text
test:ai:sdk            / vitest run src/taojinshu-ai-sdk
test:ai:conversation   / vitest run src/taojinshu-ai-conversation
test:ai:ui             / vitest run src/taojinshu-ai-ui
test:ai:application    / vitest run src/ai-application
test:ai:agents         / vitest run src/ai-agents
test:ai:browser        / playwright test tests/e2e/ai-runtime
typecheck:test         / vue-tsc -p tsconfig.test.json --noEmit
```

## 4. 注释门禁

`scripts/check-ai-docs.mjs` 使用两种解析器：

- `.ts/.tsx`：TypeScript Compiler API。
- `.vue`：`@vue/compiler-sfc` 解析 script/script setup，再检查 props、emits、slots、defineExpose 和顶层函数。

SFC 文件头、公开 Props 字段、Emit payload、Slot props、暴露方法和组合式函数都必须有完整中文 TSDoc。无法由 AST 可靠判断的模板 slot 使用显式 `defineSlots<T>()` 契约。

## 5. jsdom、Fake 和真实浏览器边界

| 能力 | Unit/jsdom | Browser Integration | 真机 |
| --- | --- | --- | --- |
| Reducer/Codec/Controller | 必须 | 不需要 | 不需要 |
| IndexedDB conformance | fake-indexeddb 快速测试 | 原生 IndexedDB 必须 | 配额降级抽查 |
| ResizeObserver 决策 | Fake Port | 真实元素尺寸必须 | 移动布局抽查 |
| visualViewport/键盘 | Fake 事件 | Chromium/WebKit viewport | iOS/Android 必须 |
| 锚点和滚动距离 | 只测状态机 | 真实 layout/scrollHeight | 长消息抽查 |
| SSE/polling | Fake Transport | 本地测试服务 | 弱网抽查 |

新增 dev dependency `fake-indexeddb` 只用于 Unit；它不能替代 Browser Integration。

## 6. Playwright

`playwright.config.ts` 增加：

- `webServer`：固定启动 Vite 测试服务并等待 URL ready。
- Chromium 和 WebKit 两个项目。
- `tests/e2e/ai-runtime` 专属目录/匹配规则。
- 使用测试身份和 Mock/v1 Fixture，不读取开发者真实 token。
- Artifact 保存 trace、截图和失败时 Storage dump，敏感字段脱敏。

Playwright WebKit 不能证明 iOS 12 真机兼容；Safari/iOS 12、当前 iOS Safari、Android WebView 和微信真机仍需设备矩阵证据。

## 7. CI 顺序

```bash
pnpm check:ai-sdk-docs
pnpm check:ai-conversation-docs
pnpm check:ai-ui-docs
pnpm check:ai-application-docs
pnpm check:ai-agents-docs
pnpm check:ai-boundaries
pnpm exec vue-tsc --noEmit
pnpm exec vue-tsc -p tsconfig.test.json --noEmit
pnpm test:ai:sdk
pnpm test:ai:conversation
pnpm test:ai:ui
pnpm test:ai:application
pnpm test:ai:agents
pnpm test:ai:browser
pnpm test
pnpm build
```

现有 stderr、Vue warning 和 Sass deprecation 建立基线清单。AI 基建 PR 不要求顺手修复无关基线，但不得增加新 warning/error；比较使用结构化基线而不是人工浏览日志。
