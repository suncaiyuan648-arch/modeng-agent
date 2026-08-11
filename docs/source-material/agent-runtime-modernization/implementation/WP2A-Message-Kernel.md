# WP2A Message Kernel Implementation Plan

> 本工作包完成前，WP2 Conversation 可以开发 Composer/Viewport 纯逻辑，但不能冻结 Timeline；WP3 不得接入真实流式聊天。

## Goal

完成 `MessageContentBlock` 领域模型、消息事件、流式增量 Reducer、停止语义和当前 Chat 流的 Legacy Adapter，使实时聊天拥有可恢复的领域事实。

## Task 1：冻结 Message Contract

**Files：**

- Modify: `src/taojinshu-ai-sdk/core/domain/message.ts`
- Modify: `src/taojinshu-ai-sdk/core/protocol/event/event-payloads.ts`
- Create: `src/taojinshu-ai-sdk/core/domain/message.spec.ts`

**必须定义：**

- `MessageBlockId`。
- 唯一公共类型 `MessageContentBlock`。
- text/reasoning-summary/resource-reference/tool-call-reference/artifact-reference/citation-group/unknown-safe-fallback。
- `streaming | completed | stopped | failed`。

先编写缺 ID、重复 blockId、未知 Block 安全降级和 stopped 终态测试，再实现类型与构造校验。

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/domain/message.spec.ts
```

## Task 2：实现 Message Event Codec 与 Reducer

**Files：**

- Modify: `src/taojinshu-ai-sdk/core/protocol/event/event-codec.ts`
- Create: `src/taojinshu-ai-sdk/core/reducer/reduce-message-event.ts`
- Modify: `src/taojinshu-ai-sdk/core/reducer/reduce-event.ts`
- Create: `src/taojinshu-ai-sdk/core/reducer/reduce-message-event.spec.ts`

覆盖 created -> block added -> 多次 delta -> block completed -> message completed；覆盖 reasoning/text 分离、重复 Event、未知 blockId、completed 后 delta、stop、failed 和 replay 后结构一致。

```bash
pnpm exec vitest run src/taojinshu-ai-sdk/core/reducer/reduce-message-event.spec.ts
```

## Task 3：当前 Chat Characterization 与 Legacy Adapter

**Files：**

- Create: `src/ai-agents/chat/contracts/legacy-chat-dto.ts`
- Create: `src/ai-agents/chat/adapter/legacy-chat-adapter.ts`
- Create: `src/ai-agents/chat/adapter/legacy-chat-adapter.spec.ts`
- Characterize: `src/utils/chatStream.ts`
- Characterize: `src/pages/chat/layouts/chatWithId/composables/useChatStream.ts`

Fixture 必须锁定当前 OpenAI 风格 `content/reasoning_content`、chunk 任意切分、完成标记、错误和用户停止。Legacy Adapter 只生成 v1.1 Message Event，不修改页面 messages 数组。

```bash
pnpm exec vitest run src/ai-agents/chat/adapter/legacy-chat-adapter.spec.ts
```

## Task 4：Message Projector 与 Conversation 交接

**Files：**

- Create: `src/taojinshu-ai-sdk/core/projector/message-view.ts`
- Create: `src/taojinshu-ai-sdk/core/projector/message-view.spec.ts`
- Modify: `src/taojinshu-ai-sdk/core/index.ts`

Projector 输出稳定 block 顺序、status 和 reference，不拼装组件。WP2 只从 SDK 公共入口消费该 View。

## Done

```bash
pnpm check:ai-sdk-docs
pnpm check:ai-agents-docs
pnpm check:ai-boundaries
pnpm exec vue-tsc -p tsconfig.test.json --noEmit
pnpm exec vitest run src/taojinshu-ai-sdk/core/domain/message.spec.ts
pnpm exec vitest run src/taojinshu-ai-sdk/core/reducer/reduce-message-event.spec.ts
pnpm exec vitest run src/ai-agents/chat/adapter/legacy-chat-adapter.spec.ts
```

所有命令退出码为 0，且 QA-MESSAGE 使用公共 Fixture 独立验证后，WP3 才能开始真实 Chat 集成。
