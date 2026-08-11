# taojinshu-ai-ui 文档入口

## 模块定位

`taojinshu-ai-ui` 提供真实 Web 和 uni-app AI 界面，包括聊天滚动容器、消息列表与气泡、Composer、ArtifactCard 和安全 Renderer 容器。它不保存 Agent 事实，也不解析网络事件。

## 阅读顺序

1. [01-架构与职责边界.md](./01-架构与职责边界.md)
2. [02-目录与组件API规范.md](./02-目录与组件API规范.md)
3. [03-Web实现规范.md](./03-Web实现规范.md)
4. [04-Uni实现规范.md](./04-Uni实现规范.md)
5. [05-组件测试与视觉验收.md](./05-组件测试与视觉验收.md)

## 所有权

- Web 开发/测试：`DEV-WP3`、`QA-WP3`。
- Artifact UI：`DEV-WP4`、`QA-WP4`。
- uni 开发/测试：`DEV-WP6`、`QA-WP6`。
- 施工计划：[WP3](../implementation/WP3-Web-UI与应用装配.md)、[WP4](../implementation/WP4-Artifact-Renderer.md)、[WP6](../implementation/WP6-Uni跨端接入.md)。

## 独立提取入口

稳定后使用同一包的条件子入口，避免 Web 和 uni 被同时打包：

```text
@taojinshu/ai-ui/contracts              / 平台无关 Props、Events、Slots 和 Renderer 契约
@taojinshu/ai-ui/web                    / Vue Web 组件与 DOM Port
@taojinshu/ai-ui/uni                    / uni-app H5、App、微信小程序组件
@taojinshu/ai-ui/theme                  / Token 与消费端样式入口
@taojinshu/ai-ui/testing                / 语义 Fixture 和组件测试工具
```

`web`/`uni` 入口以 Vue 3.5 为 peer dependency，禁止导入 `@/pages`、Router、业务 Store、
Element Plus 业务组件或具体 Agent。
