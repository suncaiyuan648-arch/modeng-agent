# AI Agent 前端基建施工总控台

## 1. 使用方式

本目录供开发负责人、模块开发者、测试负责人和集成负责人共同使用。每位新加入人员只需依次阅读：

1. [../README.md](../README.md)：项目目标与范围。
2. [../01-跨模块契约与架构决策.md](../01-跨模块契约与架构决策.md)：最终边界和依赖方向。
3. 本文件：施工顺序、角色和接口冻结规则。
4. [模块化施工拆包](./MODULE-WORKSTREAMS.md)：选择自己负责的唯一源码范围。
5. [Contract v1.1 开工冻结](./CONTRACT-V1.1-GATE.md)：确认工作包已解除阻塞。
6. [测试工程修订](./TEST-FOUNDATION.md)：使用可隔离的测试命令和正确测试位置。
7. 自己负责的 WP 文件。
8. [QA-测试责任矩阵.md](./QA-测试责任矩阵.md)：独立测试范围和集成剧本。

## 2. 工作包

| 工作包 | 开发范围 | 测试范围 | 前置 | 可并行关系 |
| --- | --- | --- | --- | --- |
| WP0 | SDK Contract、Event、Reducer、Runtime 最小内核 | 纯函数、协议、状态机、conformance | Task 1–2 需 design 冻结；Task 3–5 需 contract 冻结 | 首先执行 |
| WP1 | Geo 研究 Operation、Mock Adapter、Pinia 投影 | Geo 映射、正常/失败/取消/乱序 | WP0 接口冻结 | WP2 可同时开发 |
| WP2A | Message Kernel 与 Legacy Chat Adapter | block identity、delta、终止、旧流映射 | WP0 Kernel | WP1 后半可并行 |
| WP2 | ConversationProjector、Composer、Viewport | Timeline、IME、草稿、滚动状态机 | WP2A 类型冻结 | WP1 可同时开发 |
| WP3 | Web Message/Composer/Viewport UI 与 Application 装配 | 组件、键盘、滚动、PC/mobile | WP2A、WP2 公共接口 | WP1 后半可并行 |
| WP4 | Artifact Schema、Registry 和 Web Renderer | Schema 安全、Intent、部分成功 | WP0、WP1 | WP3 可并行执行 |
| WP5 | Persistence、Recovery、Geo Legacy Adapter | 刷新、断线、跨账号、适配一致性 | WP0、WP1、WP4；Task 3 起需要 WP3 | Task 1–2 可与 WP3 并行 |
| WP6 | uni-app Port 与最小聊天/Artifact UI | H5、App、微信小程序一致性 | WP2、WP4、WP5 稳定 | Web 稳定后执行 |

上表是端到端阶段，不代表一个 Developer 同时拥有阶段内所有文件。实际派工必须按
[模块化施工拆包](./MODULE-WORKSTREAMS.md) 中的 WP3A/WP3B、WP4A/WP4B/WP4C、
WP5A/WP5B/WP5C 和 WP6A/WP6B/WP6C/WP6D 拆分。

详细计划：

- [WP0-SDK-Kernel.md](./WP0-SDK-Kernel.md)
- [WP1-Geo-Research.md](./WP1-Geo-Research.md)
- [WP2-Conversation-Kit.md](./WP2-Conversation-Kit.md)
- [WP2A-Message-Kernel.md](./WP2A-Message-Kernel.md)
- [WP3-Web-UI与应用装配.md](./WP3-Web-UI与应用装配.md)
- [WP4-Artifact-Renderer.md](./WP4-Artifact-Renderer.md)
- [WP5-Persistence-Recovery-Legacy.md](./WP5-Persistence-Recovery-Legacy.md)
- [WP6-Uni跨端接入.md](./WP6-Uni跨端接入.md)

## 3. 角色定义

每个 WP 至少设置两个不同责任人：

- `DEV-WPn`：只负责该模块实现和模块内单测。
- `QA-WPn`：根据公共契约和 Fixture 独立编写/执行验收，不以开发者实现细节为测试依据。
- `INT`：维护 `ai-application` 装配、合并顺序、Feature Flag 和集成流水线。
- `ARCH`：只审批公共 API、协议版本、依赖方向和 ADR；不替模块决定页面样式。

一人可以在小团队兼任多个 DEV，但不能在同一个 WP 同时完成开发签收和 QA 签收。

## 4. Definition of Ready

工作包开始前必须具备：

- 公共输入/输出 TypeScript 签名已写入计划。
- 上游 Fake/Fixture 已可导入，或 WP 自己包含创建步骤。
- 文件所有权没有和其他进行中 WP 重叠。
- 正常、失败、取消、重复、乱序和平台降级的适用范围已列出。
- 测试负责人可以不启动真实后端独立执行核心验收。

## 5. Definition of Done

- 计划内文件、接口、测试和文档全部完成。
- SDK/Conversation/Agent 源码没有 `any`，外部输入从 `unknown` 解码。
- 所有文件、类型字段、函数、类和方法有完整中文 TSDoc。
- 模块单测、conformance、TypeScript 和相关回归通过。
- 公共入口只从模块 `index.ts` 导出，依赖边界检查通过。
- QA 依据 Fixture 独立签收。
- 失败时有明确回滚点，不要求修改其他工作包私有文件。

## 6. 接口冻结流程

1. DEV 提交只包含类型、接口、Fixture 和失败测试的 Contract PR。
2. ARCH 检查命名、所有权、版本和依赖方向。
3. QA 使用 Fixture 编写黑盒测试。
4. 接口标记 `v1` 后，下游开始实现。
5. v1 内只允许新增可选字段；破坏性变化必须更新 ADR 和所有消费方 Fixture。

## 7. 文件所有权

```text
src/taojinshu-ai-sdk/core/runtime/**      / DEV-WP0
src/taojinshu-ai-sdk/core/protocol/**     / DEV-WP0；artifact/schema/intent 由 DEV-WP4A
src/taojinshu-ai-sdk/core/persistence/**  / DEV-WP5A
src/taojinshu-ai-sdk/core/recovery/**     / DEV-WP5A
src/taojinshu-ai-sdk/platform/web/**      / DEV-WP5A
src/taojinshu-ai-sdk/platform/uni/**      / DEV-WP6A
src/taojinshu-ai-sdk/core/protocol/schema/render-model.ts / DEV-WP4A；只允许平台无关数据契约
src/ai-agents/geo-ad/domain/**            / DEV-WP1
src/ai-agents/geo-ad/definition/**        / DEV-WP1
src/ai-agents/geo-ad/adapter/**           / Mock 由 DEV-WP1；Legacy/v1 由 DEV-WP5B
src/ai-agents/geo-ad/schema/**            / DEV-WP4C
src/ai-agents/geo-ad/renderer/**          / Web 由 DEV-WP4C；uni 由 DEV-WP6C
src/taojinshu-ai-conversation/**          / DEV-WP2
src/taojinshu-ai-ui/web/chat/**           / DEV-WP3B
src/taojinshu-ai-ui/web/message/**        / DEV-WP3B
src/taojinshu-ai-ui/web/composer/**       / DEV-WP3B
src/taojinshu-ai-ui/web/artifact/**       / DEV-WP4B
src/taojinshu-ai-ui/uni/**                / DEV-WP6B
src/ai-application/**                     / DEV-WP3A；恢复接线由 DEV-WP5C；uni 平台装配由 DEV-WP6D
src/pages/chat/geoAdDelivery/**            / DEV-WP3C；报告替换点由 DEV-WP4C
各源码目录同层的 `*.spec.ts`              / 对应模块 QA；具体位置以 TEST-FOUNDATION 为准
src/pages/**/__tests__/**                  / 页面集成 QA
tests/**                                   / 仅保留现有历史回归与跨模块黑盒回归
```

## 8. 集成顺序

```text
Contract v1.1 Gate
  -> design-v1.1-frozen
  -> 测试底座 + WP0 Contract PR
  -> contract-v1.1-frozen
  -> WP0 Kernel
  -> WP2A Message Kernel
  -> WP1 Geo Mock + WP4 Artifact + WP5A Persistence（可并行）
  -> WP2 Conversation
  -> WP3 Web UI/Application
  -> WP5 Persistence/Recovery/Legacy
  -> Geo Web 灰度
  -> WP6 uni-app
  -> PPT 第二 Agent 验证
```

## 9. 每日协作产物

- DEV：更新 WP checkbox、记录新公共接口和阻塞，不粘贴大段日志。
- QA：维护独立用例编号、Fixture 版本、失败证据和复测结果。
- INT：维护兼容矩阵和当前可集成 commit，不修改模块内预期。
- ARCH：只在公共边界变化时更新 ADR。

## 10. 全局验证命令

```bash
pnpm check:ai-sdk-docs
pnpm check:ai-conversation-docs
pnpm check:ai-ui-docs
pnpm check:ai-application-docs
pnpm check:ai-agents-docs
pnpm check:ai-boundaries
pnpm exec vue-tsc --noEmit
pnpm exec vitest run src/taojinshu-ai-sdk
pnpm exec vitest run src/ai-agents/geo-ad
pnpm exec vitest run src/taojinshu-ai-conversation
pnpm exec vitest run src/taojinshu-ai-ui/web
pnpm exec vitest run src/ai-application
pnpm exec vitest run src/taojinshu-ai-ui/uni
pnpm test
pnpm build
```

WP 实施前尚不存在的脚本由 WP0 创建；计划评审阶段不得假装这些命令已经可运行。
