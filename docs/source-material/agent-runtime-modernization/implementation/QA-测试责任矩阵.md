# AI Agent 基建测试责任矩阵

## 1. 测试组织原则

测试人员以公共接口、协议 Fixture 和用户可观察行为为依据，不读取模块私有实现来反推预期。每个 QA 工作包可以独立运行，真实后端只参与最后的 Adapter/E2E 验收。

## 2. 责任矩阵

| QA | 独立负责 | 不负责 | 输入 Fixture | 退出标准 |
| --- | --- | --- | --- | --- |
| QA-WP0 | Codec、状态机、Reducer、Runtime | Geo/UI 视觉 | v1 Event/Command | 协议和纯函数全通过 |
| QA-WP1 | Geo Mock Adapter、Definition、Projector | Facade、页面和通用聊天滚动 | Geo normal/failure/cancel | Geo Core 可脱离页面运行 |
| QA-MESSAGE | Message Domain、Block Event、Legacy Chat Adapter | Conversation/UI | Message v1.1/旧流 Fixture | blockId、delta、stopped 语义稳定 |
| QA-WP2 | Timeline、Composer、Viewport、Scheduler | Vue DOM | Conversation Fixtures | Headless 状态机全通过 |
| QA-WP3A | Application、Geo Facade、owner 基础生命周期 | Web 组件和 SDK 私有 Registry | Application Fixtures | 门面、Flag 和 dispose 通过 |
| QA-WP3B | Web Chat/Message/Composer、键盘和滚动 | Application、Snapshot 和后端 | Web semantic Fixtures | PC/mobile 组件通过 |
| QA-WP3C | Geo 页面研究进度与真实聊天装配 | 模块内部单元实现 | Geo integration Fixtures | 新旧 Flag 均可运行 |
| QA-WP4A | Artifact 状态机、Schema、Intent、Render Contract | 具体卡片和 Geo 字段 | Artifact protocol Fixtures | 协议与安全规则通过 |
| QA-WP4B | ArtifactCard 与 UnsupportedArtifact | Geo 报告和网络恢复 | Artifact UI Fixtures | 降级、动作和可访问性通过 |
| QA-WP4C | Geo Report Schema、Renderer 与页面替换 | 通用卡片内部实现 | Geo report Fixtures | 部分成功和报告展示通过 |
| QA-WP5A | Persistence、Replay、Web Storage | Geo DTO 和视觉像素 | Event/Snapshot Fixtures | 恢复 conformance 通过 |
| QA-WP5B | Legacy/v1 Geo Adapter 共同语义与能力差异 | Runtime 私有恢复算法 | Legacy/v1 Fixtures | 共同场景一致，差异能力不被伪造 |
| QA-WP5C | 刷新、账号切换和恢复装配 | 卡片像素 | Integration Fixtures | owner 隔离和回滚通过 |
| QA-WP6A | uni Transport、Storage 和生命周期 Port | uni UI | Platform Fixtures | Port conformance 通过 |
| QA-WP6B | uni Chat/Message/Composer/Artifact UI | SDK Platform 实现 | 共用 semantic Fixtures | 三端组件语义一致 |
| QA-WP6C | Geo uni Renderer、消费工程和真机 | Web DOM | Geo/Device Fixtures | 三端构建和真机通过 |
| QA-WP6D | uni Application 草稿、资源和装配 Adapter | SDK/Conversation 私有实现 | Application Fixtures | owner/session 隔离通过 |

## 3. Fixture 版本管理

```text
tests/fixtures/ai-v1.1/                       / 协议 v1.1 公共 Fixture
├── commands/                                 / User Command JSON
├── events/                                   / 正常、重复、乱序、空洞、失败事件
├── snapshots/                                / 有效、损坏、跨 owner、旧 major 快照
├── geo/                                      / Geo normal、平台失败、取消、部分成功
├── conversation/                             / Timeline、Composer、Viewport 场景
└── artifact/                                 / 有效、未知、不兼容和恶意 Schema
```

Fixture 修改规则：已被 WP 消费后不得原地改变语义；新增版本文件并保留旧 Fixture。开发和 QA 都不能只为让测试通过而修改共享预期。

## 4. 核心用例编号

### KERNEL

- `KRN-001`：标准 Operation 从 created 到 completed。
- `KRN-002`：重复 eventId 幂等。
- `KRN-003`：同 sequence 不同 eventId 拒绝。
- `KRN-004`：sequence 空洞触发 replay，不越过归约。
- `KRN-005`：非法终态转移拒绝。
- `KRN-006`：未知 critical Event 中止。
- `KRN-007`：start Command、Receipt、created Event 的 operationId/adapterKind 一致。
- `KRN-008`：两个 Operation 并发提交不丢状态，conflict 不提交预计算 State。

### MESSAGE

- `MSG-001`：每个 MessageContentBlock 有稳定 blockId。
- `MSG-002`：delta 只追加到指定 messageId + blockId。
- `MSG-003`：停止后由 message.stopped 进入 stopped，不伪 completed。
- `MSG-004`：未知 Block 使用安全 fallback。

### GEO

- `GEO-001`：正常研究平台进度完成。
- `GEO-002`：单平台失败可解释。
- `GEO-003`：Mock/v1 取消由 cancelled Event 确认；Legacy 不显示服务端取消能力。
- `GEO-004`：Flag 关闭完整回退旧 Store。
- `GEO-005`：Operation 进行中 Flag 改变不换 Adapter。

### CONVERSATION

- `CVS-001`：Message/Tool/Artifact Timeline 稳定排序。
- `CVS-002`：IME composition 期间 Enter 不提交。
- `CVS-003`：提交失败保留草稿和 Resource 引用。
- `CVS-004`：用户上滑从 following 进入 detached。
- `CVS-005`：新内容增加 unseen，点击查看最新恢复 following。
- `CVS-006`：前插历史保持视觉 anchor。

### ARTIFACT

- `ART-001`：合法 Geo Report 渲染。
- `ART-002`：未知 Schema 安全降级。
- `ART-003`：更高 major 不自动迁移。
- `ART-004`：危险 URL/伪造 Intent 被拒绝。
- `ART-005`：Operation 部分成功保留 ready Artifact。

### RECOVERY

- `RCV-001`：Snapshot + local delta + remote delta 恢复。
- `RCV-002`：研究中刷新不重复进度。
- `RCV-003`：断线后从 lastSequence+1 补拉。
- `RCV-004`：损坏 Snapshot 从服务端重建。
- `RCV-005`：跨 owner 数据拒绝并清理。
- `RCV-006`：IndexedDB 失败显示 memory-only。
- `RCV-007`：非法/冲突事件只进入 Quarantine，不污染正常 Event Log。
- `RCV-008`：IndexedDB 逐版本迁移保留有效活跃游标。
- `RCV-009`：同 owner/workspace 多标签页仅一个远端订阅 Leader。
- `RCV-010`：Legacy 进行中刷新转 interrupted/non-resumable。

### PLATFORM

- `PLT-001`：Web stream chunk 任意切分。
- `PLT-002`：uni chunk 不可用时轮询。
- `PLT-003`：App 后台 flush、前台 replay。
- `PLT-004`：iOS 键盘不破坏 following/detached 状态。
- `PLT-005`：微信小程序存储配额降级顺序正确。

## 5. 测试环境分层

| 环境 | 使用数据 | 允许验证 |
| --- | --- | --- |
| Unit/jsdom | Fake Clock/Transport/Port | 纯逻辑、Vue 组件语义 |
| Browser integration | Mock/Legacy Adapter | DOM 滚动、键盘、IndexedDB |
| Test backend | v1/Legacy 真实接口 | SSE/轮询、鉴权、取消竞态 |
| Device | 脱敏测试账号 | App 生命周期、键盘、文件和性能 |

## 6. 缺陷归属

- raw Event 解码、sequence、状态转移：WP0。
- Geo Mock/phase/platform 投影：WP1；Legacy/v1 DTO 映射：WP5B。
- Timeline/草稿/Viewport 决策：WP2。
- Application 门面、owner 基础生命周期、Flag 选择：WP3A。
- Web DOM、样式、键盘、组件可访问性：WP3B。
- Geo Web 页面装配：WP3C。
- Schema、Intent、Artifact 状态机：WP4A；通用卡片：WP4B；Geo 报告：WP4C。
- 持久化与 Replay：WP5A；Legacy/v1 差异：WP5B；刷新和 owner 恢复接线：WP5C。
- uni request/storage：WP6A；uni 通用 UI：WP6B；Geo uni 与真机：WP6C；uni Application Adapter：WP6D。

跨模块缺陷由最早违反公共契约的模块负责，不能统一丢给集成负责人。

## 7. QA 签收模板

每个模块化子工作流签收记录必须包含：公共 API 版本、Fixture commit、执行命令、通过/失败用例编号、平台和设备、未覆盖风险、回归命令。不得只填写“测试通过”。子工作流定义见 [模块化施工拆包](./MODULE-WORKSTREAMS.md)。

## 8. 发布阻断条件

- 任一 critical Event 被静默忽略。
- 出现跨 owner 数据。
- Operation/Artifact 非法终态转移。
- 重放造成重复消息、重复扣费请求或重复 Artifact。
- 页面直接解析流或修改 RuntimeState。
- 未注册 Schema 执行 Intent。
- Web/uni 目标宣称支持但没有对应 conformance 或设备证据。
