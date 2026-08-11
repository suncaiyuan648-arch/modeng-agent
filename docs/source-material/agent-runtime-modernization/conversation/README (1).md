# taojinshu-ai-conversation 文档入口

## 模块定位

`taojinshu-ai-conversation` 是无视觉、跨端的聊天交互状态层。它把 SDK RuntimeState 投影成 Timeline，并管理 Composer、草稿、消息交互、流式展示调度和 Viewport 状态机，但不处理网络协议和 Agent 领域归约。

## 阅读顺序

1. [01-架构与职责边界.md](./01-架构与职责边界.md)
2. [02-目录与公共API规范.md](./02-目录与公共API规范.md)
3. [03-Projector-Composer与Viewport.md](./03-Projector-Composer与Viewport.md)
4. [04-测试规范.md](./04-测试规范.md)

## 所有权

- 开发负责人：`DEV-WP2`。
- 测试负责人：`QA-WP2`。
- 公共入口：`src/taojinshu-ai-conversation/index.ts`。
- 施工计划：[WP2 Conversation Kit](../implementation/WP2-Conversation-Kit.md)。

## 独立提取入口

稳定后发布为 `@taojinshu/ai-conversation`，生产入口只依赖 `@taojinshu/ai-sdk`；
`@taojinshu/ai-conversation/testing` 单独导出 Fixture、Fake Port 和 conformance，不进入生产包。
