# 淘金树 AI Agent 前端基础设施文档

> **STATUS: REFERENCE ONLY / HISTORICAL INPUT**
>
> 本目录不是当前实现规范。发生冲突时，以仓库根 `AGENTS.md`、`docs/architecture/00-*`、`docs/architecture/01-*` 和已批准 ADR 为准。

> 当前状态：架构文档已完成 v1.1 修订，源码基建目录尚未创建。先完成
> `design-v1.1-frozen` 与测试底座/WP0 Contract PR，不得直接从 Geo 页面或 WP3 UI 开工。

## 1. 文档结构

本目录按模块归属组织，不再用一组混合编号文件同时描述 SDK、Conversation 和 UI。每个模块拥有自己的架构、目录、公共 API 和测试规范；根目录只维护跨模块边界、版本关系和实施导航。

```text
docs/agent-runtime-modernization/              / 整体架构、跨模块契约和施工导航
├── README.md                                 # 总入口与阅读路径
├── 00-总体架构与依赖边界.md                  # 全局目标、ADR 和依赖方向
├── 01-跨模块契约与架构决策.md                # 模块契约、Conversation 决策和施工原则
├── sdk/                                      / taojinshu-ai-sdk 专属规范
├── conversation/                             / taojinshu-ai-conversation 专属规范
├── ui/                                       / taojinshu-ai-ui 专属规范
├── application/                              / ai-application 装配规范
├── agents/geo-ad/                            / Geo Agent 接入规范
├── backend/                                  / RuoYi-AI 后端演进建议
├── migration/                                / PPT、数字人等迁移规范
└── implementation/                           / WP0-WP6 施工计划与 QA 总控
```

## 2. 总体架构

```text
pages
  -> ai-application
       -> taojinshu-ai-sdk
       -> taojinshu-ai-conversation
       -> taojinshu-ai-ui
       -> ai-agents

taojinshu-ai-conversation -> taojinshu-ai-sdk
taojinshu-ai-ui -> taojinshu-ai-conversation + taojinshu-ai-sdk
ai-agents/core -> taojinshu-ai-sdk
ai-agents/renderer -> taojinshu-ai-ui contracts + taojinshu-ai-sdk
```

## 3. 按角色阅读

### 架构师和集成负责人

1. [总体架构与依赖边界](./00-总体架构与依赖边界.md)
2. [跨模块契约与架构决策](./01-跨模块契约与架构决策.md)
3. [施工总控台](./implementation/README.md)
4. [模块化施工拆包](./implementation/MODULE-WORKSTREAMS.md)
5. [Contract v1.1 开工冻结](./implementation/CONTRACT-V1.1-GATE.md)
6. [测试工程修订](./implementation/TEST-FOUNDATION.md)

### SDK Developer / Tester

1. [SDK README](./sdk/README.md)
2. [WP0 SDK Kernel](./implementation/WP0-SDK-Kernel.md)
3. [WP5 Persistence/Recovery](./implementation/WP5-Persistence-Recovery-Legacy.md)

### Conversation Developer / Tester

1. [Conversation README](./conversation/README.md)
2. [WP2A Message Kernel](./implementation/WP2A-Message-Kernel.md)
3. [WP2 Conversation Kit](./implementation/WP2-Conversation-Kit.md)

### UI Developer / Tester

1. [UI README](./ui/README.md)
2. [WP3 Web UI](./implementation/WP3-Web-UI与应用装配.md)
3. [WP4 Artifact Renderer](./implementation/WP4-Artifact-Renderer.md)
4. [WP6 Uni](./implementation/WP6-Uni跨端接入.md)

### Geo Agent Developer / Tester

1. [Geo Agent README](./agents/geo-ad/README.md)
2. [WP1 Geo Research](./implementation/WP1-Geo-Research.md)

### QA 和发布负责人

1. [QA 测试责任矩阵](./implementation/QA-测试责任矩阵.md)
2. [基建门禁与路线图](./implementation/00-基建门禁与路线图.md)
3. [其他页面迁移方案](./migration/01-其他页面迁移方案.md)

## 4. 唯一事实来源

| 内容 | 唯一文档归属 |
| --- | --- |
| Agent Domain、Command/Event、Reducer、Recovery | `sdk/` |
| Timeline、Composer、Viewport、Draft | `conversation/` |
| ChatViewport、MessageBubble、Composer UI、ArtifactCard | `ui/` |
| Runtime/Agent/Platform/owner 装配 | `application/` |
| Campaign、Geo Adapter、Geo Report Renderer | `agents/geo-ad/` |
| 开发顺序、文件所有权和 QA 分工 | `implementation/` |

若文档出现冲突，以该模块目录内的规范为准；根目录文件不能重新定义模块内部方法。

## 5. 当前范围

- 前端先建设内嵌、可提取的 SDK/Conversation/UI 模块。
- 首个业务接入 Geo 广告研究和报告 Artifact。
- Web 先行，再验证 uni-app H5、App 和微信小程序。
- `taojinshu-AI/ruoyi-ai` 本阶段只提供[演进建议](./backend/01-RuoYi-AI演进建议.md)，不实施后端代码。
- 所有 SDK、Conversation、UI 和 Agent 文件、导出、字段和方法必须使用完整中文 TSDoc。

## 6. 当前可执行入口

1. ARCH、DEV-WP0、QA-WP0 签收 [Contract v1.1](./implementation/CONTRACT-V1.1-GATE.md) 的设计级清单。
2. DEV-WP0A 实施 [测试工程修订](./implementation/TEST-FOUNDATION.md) 和 WP0 Task 1。
3. DEV-WP0/QA-WP0 提交只含签名、Fixture、失败测试和文档的 WP0 Contract PR。
4. 标记 `contract-v1.1-frozen` 后，再按[施工总控台](./implementation/README.md)进入 Kernel 与业务工作包。
