# taojinshu-ai-sdk 文档入口

## 模块定位

`taojinshu-ai-sdk` 是 Agent 事实层和执行内核。它定义 Workspace、Session、Operation、Message、ToolCall、Artifact、Command/Event、Reducer、Recovery 和平台端口，不负责聊天滚动、输入框、Vue 组件或业务 Agent 页面。

## 阅读顺序

1. [01-架构与职责边界.md](./01-架构与职责边界.md)
2. [02-目录与文件规范.md](./02-目录与文件规范.md)
3. [03-Domain与Contracts.md](./03-Domain与Contracts.md)
4. [04-Command与Event协议.md](./04-Command与Event协议.md)
5. [05-Runtime与Reducer.md](./05-Runtime与Reducer.md)
6. [06-Persistence与Recovery.md](./06-Persistence与Recovery.md)
7. [07-Platform-Ports.md](./07-Platform-Ports.md)
8. [08-Schema与Intent协议.md](./08-Schema与Intent协议.md)
9. [09-测试与发布规范.md](./09-测试与发布规范.md)

## 模块所有权

- 开发负责人：`DEV-WP0`；Persistence/Recovery 由 `DEV-WP5` 在冻结端口下实现。
- 测试负责人：`QA-WP0`、`QA-WP5`。
- 公共入口：`src/taojinshu-ai-sdk/index.ts`。
- 禁止依赖：Vue、Pinia、Router、Element Plus、业务页面、具体 Agent、DOM 和全局 `uni`。

## 施工计划

- [WP0 SDK Kernel](../implementation/WP0-SDK-Kernel.md)
- [WP5 Persistence/Recovery](../implementation/WP5-Persistence-Recovery-Legacy.md)
