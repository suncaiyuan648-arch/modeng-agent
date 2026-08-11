# Contract v1.1 开工冻结与评审决议

## 1. 文档状态

本文件是 WP0–WP6 业务实现前的强制修订门禁。为避免“必须先实现才能冻结、又必须先冻结才能实现”的循环依赖，门禁拆为两级：

- `design-v1.1-frozen`：本文架构决议和测试工程修订评审通过后，只放行测试底座与 WP0 Contract PR。
- `contract-v1.1-frozen`：Contract PR、Codec Fixture 和公共类型测试签收后，放行 WP0 Kernel 及其他满足前置条件的 WP。

原 WP 文件保留任务细节；在第二级冻结前不得创建 Geo/UI/Recovery 业务实现。

本次决议基于当前前端源码核验：Geo `startResearch()` 是一次性 Promise，`createGeoAdApi()` 固定返回 Mock，Geo 页面使用 token hash 作为 owner，Vitest 当前只收集 `tests/**/*.spec.ts`，现有 package script 形式 `pnpm test -- <path>` 不能隔离目标测试。

## 2. 评审意见决议

| 编号 | 问题 | 决议 | 开工影响 |
| --- | --- | --- | --- |
| C-01 | Command 无法绑定 Operation | 采纳；start Command 必须携带客户端生成的 operationId，Receipt 正式定义 | 阻塞 WP0 |
| C-02 | 多 Agent/Legacy/v1 无 Transport 路由 | 采纳；增加 AgentAdapterRegistry 和 TransportRouter | 阻塞 WP0/WP1 |
| C-03 | adapterKind 未进入事实和快照 | 采纳；进入 Operation、Event created payload 和 Snapshot | 阻塞 Recovery |
| C-04 | 当前 Geo 不支持进行中恢复/取消 | 采纳；按 Mock/Legacy/v1 发布能力矩阵，不伪造后端能力 | 阻塞 Geo 验收定义 |
| C-05 | 先 append 后 reduce 产生毒事件 | 采纳；预归约、原子 append、内存提交，非法输入进 Quarantine | 阻塞 Persistence |
| C-06 | 多 Operation 并发丢更新 | 采纳；每个 owner+workspace Runtime 使用单写提交队列 | 阻塞 Runtime |
| C-07 | Message Kernel 缺失 | 采纳；新增 Message Kernel 工作包，完成后才允许真实聊天接入 | 阻塞 WP2/WP3 Chat |
| C-08 | Application 无启动路径且反向依赖旧 Store | 采纳；增加 Manager/Plugin、稳定身份、Legacy Port 注入 | 阻塞页面集成 |
| C-09 | 公共类型冲突 | 采纳；统一 progress、MessageContentBlock、Geo ViewModel 和 partialSuccess | 阻塞多人并行 |
| C-10 | Renderer Registry 所有权冲突 | 采纳；SDK/UI/Application 分别拥有数据、组件和装配 | 阻塞 WP4 |
| C-11 | Runtime/Workspace 生命周期未闭合 | 采纳；v1.1 选择一 Runtime 对应 owner+workspace | 阻塞 Runtime/Recovery |
| C-12 | 测试命令、类型检查和浏览器测试不闭合 | 采纳；增加独立脚本、测试 tsconfig、SFC 检查和 Browser Integration | 阻塞所有 WP DoD |

## 3. Runtime 与 Workspace 冻结

v1.1 采用：

```text
AiApplicationManager                         / 当前 owner 的应用级管理器
  └── AiWorkspaceApplication                 / 一个 owner + workspace 的装配上下文
      ├── AgentRuntime                       / 只管理该 workspace 的领域事实和恢复
      └── ConversationController[]           / 该 workspace 下按 sessionId 缓存
```

原因：Snapshot、Event Namespace、权限和资源归属本来都按 Workspace 分区；首期让单 Runtime 同时管理多个 Workspace 会扩大并发、清理和恢复复杂度。

规则：

- Runtime 构造参数必须包含不可变的 `environment`、`ownerId`、`workspaceId`。
- RuntimeState 必须包含一个 Workspace、其 Resources、Sessions、Operations、Messages、ToolCalls 和 Artifacts 集合。
- Runtime 不接受跨 Workspace Event；发现后进入 Quarantine。
- ApplicationManager 负责按 workspaceId 缓存/销毁上下文，页面不能获得其他 Workspace 的 Runtime。
- owner 切换销毁全部 Workspace context；token 刷新只更新 TokenProvider，不更换 owner Namespace。

## 4. Command、Receipt 与 Adapter 路由

所有 Operation 级 User Command 均由前端通过 IdGenerator 预先创建 `operationId`。服务端必须回显，不得静默替换；Legacy Adapter 使用该 ID 建立本地 Operation。

```ts
/** 服务端或 Legacy Adapter 对命令接收结果的正式回执。 */
export interface CommandReceipt {
  /** 被接收或拒绝的原始命令标识符。 */
  readonly commandId: CommandId;
  /** Operation 命令的目标标识符；非 Operation 命令时为 null。 */
  readonly operationId: OperationId | null;
  /** 回执只表示接收结果，不表示业务 Operation 已完成。 */
  readonly status: 'accepted' | 'rejected';
  /** 本次 Operation 冻结使用的 Adapter；拒绝或非 Operation 命令时可以为 null。 */
  readonly adapterKind: AdapterKind | null;
  /** 拒绝详情；accepted 时必须为 null。 */
  readonly rejection: CommandRejection | null;
  /** 回执产生时间，ISO 8601 UTC。 */
  readonly acknowledgedAt: string;
}

/** 命令在发送前已冻结的传输路由。 */
export interface OperationRoute {
  /** 目标 Agent 的稳定类型。 */
  readonly agentType: string;
  /** 目标 Adapter 稳定类型，例如 geo.mock、geo.legacy 或 geo.v1。 */
  readonly adapterKind: AdapterKind;
  /** 当前 Adapter 对取消、重放、订阅和轮询的真实能力。 */
  readonly capabilities: AdapterCapabilities;
}
```

`AgentAdapterRegistry` 只注册可信本地 AdapterDefinition；`TransportRouter` 根据 AgentDefinition、Feature Flag、后端 Descriptor 和平台能力为新 Operation 选择一次 route。已创建 Operation 的 route 从 Snapshot 恢复，Flag 改变不能改路由。

## 5. Event 提交与 Quarantine

正常事件提交顺序固定为：

```text
raw input
  -> EventCodec.decode
  -> 版本、owner、workspace、operation 和 sequence 预校验
  -> reduceEvent(currentState, event) 预计算 nextState
  -> EventRepository.append(event) 原子判定
      ├── appended  -> 提交内存 nextState -> 通知订阅者
      ├── duplicate -> 保持当前 State，不重复通知
      └── conflict  -> Quarantine -> 标记 Operation protocol-conflict
```

非法 Schema、非法状态转移、跨 owner/workspace 或 critical 不兼容事件写入 `QuarantineRepository`，不得进入正常 EventRepository，也不得参与自动重放。

```ts
/** EventRepository 对唯一键写入的判定。 */
export type AppendResult =
  | { readonly kind: 'appended' }
  | { readonly kind: 'duplicate'; readonly existingEventId: EventId }
  | { readonly kind: 'conflict'; readonly existingEventId: EventId };
```

每个 Runtime 使用一个异步单写提交队列，所有 Operation Event 按到达顺序进入队列；队列内部允许预解析，但 State 预计算、append 判定和内存提交不得并行。Event 唯一键为 `(ownerId, workspaceId, operationId, sequence)`。

Operation cursor 必须保存 `lastSequence + lastEventId`，Snapshot 同样保存，不能只保存 sequence。

## 6. Message Kernel 冻结

统一名称为 `MessageContentBlock`；禁止文档和源码继续定义 `MessagePart`、`ContentPart` 等同义公共类型。

每个 Block 必须有稳定 `id`，v1.1 类型至少包含：

```text
text
reasoning-summary
resource-reference
tool-call-reference
artifact-reference
citation-group
unknown-safe-fallback
```

消息状态固定为：

```text
streaming | completed | stopped | failed
```

标准事件至少包括：

```text
message.created
message.block.added
message.block.delta
message.block.completed
message.completed
message.stopped
message.failed
```

`message.block.delta` 通过 `messageId + blockId` 定位，Operation sequence 保证增量顺序。用户停止后只由 `message.stopped` 把未完成消息变为 stopped；UI 不自行把 streaming 改成 completed。

Event Envelope 必须携带 `source` 和 `timestampSource`。`operation.interrupted` 只允许
`source=local-recovery`，用于确认 Legacy/能力不足 Adapter 无法恢复，不伪装服务端终态。

## 7. 统一公共语义

- Domain 和全部 ViewModel 的 `progress` 统一为 `null | 0..1`；UI 格式化为百分比时乘以 100。
- `OperationStatus` 必须包含 `created | queued | running | waiting_user | completed | failed | cancelled | interrupted`；`interrupted` 只用于确认当前 Adapter 无法恢复的本地终止事实。
- `AgentOperation` 增加 `adapterKind`、`adapterCapabilities`、`lastEventId`、`partialSuccess`。
- `partialSuccess` 由 `operation.completed` 的事实负载写入 Operation；Artifact 仍保留各自独立状态。
- GeoResearchViewModel 统一包含 `operationId/status/phase/progress/platformSteps/reportArtifact/partialSuccess/error/availableIntents/recoveredAt/canStart/canCancel`。
- ArtifactViewModel、IntentContext 和 IntentExecutor 必须在 WP4 Contract PR 中先定义，再实现组件。

## 8. Renderer 所有权

```text
taojinshu-ai-sdk
  / SchemaRegistry、RenderSchema、RenderModel、UiIntent 数据协议

taojinshu-ai-ui/contracts
  / RendererDefinition、ComponentRendererRegistry 接口

taojinshu-ai-ui/web 或 uni
  / 真实 Renderer 组件和 UnsupportedArtifact

ai-application
  / 创建 Registry、注册 Agent Renderer、执行 Intent

ai-agents/<agent>/renderer
  / 只依赖 UI contracts 和已校验业务 ViewModel
```

SDK 不再存在 `create-renderer-registry.ts`，也不得导入 Vue Component 类型或 platform renderer。

## 9. Application Bootstrap 与身份

`main.ts` 在 `app.use(store)` 后创建 `AiApplicationManager`，在 `app.use(router)` 前完成 provide，使路由守卫和页面都能取得同一 Manager。Manager 可以延迟创建 Workspace Runtime，但 provide 本身必须在 Router 注册前完成。

```text
app.use(store)
  -> create OwnerIdentityProvider / TokenProvider / Legacy Ports
  -> createAiApplicationManager()
  -> app.provide(AI_APPLICATION_MANAGER_KEY, manager)
  -> app.use(router)
  -> app.mount()
```

稳定 owner key：

```text
authenticated:<environment>:<tenantId>:<userId>
anonymous:<environment>:<installationId>
```

禁止使用 token、token hash、手机号或昵称作为 ownerId。TokenProvider 允许刷新，不改变 Namespace。

旧 Geo Store/API 通过 `LegacyGeoResearchPort` 注入 Application；Application、Agent 和 SDK 均不得 import `src/pages/**`。Workspace/Session 映射由 Application 的 `WorkspaceResolver`、`SessionResolver` 负责。

## 10. 后端能力承诺

前端只能按 AdapterCapabilities 展示和执行能力，不能用本地 Event 模拟真实后端已完成取消或恢复。Geo 详细矩阵见
[Geo 后端能力矩阵](../agents/geo-ad/03-后端能力矩阵.md)。

## 11. 两级开工签收清单

### 11.1 `design-v1.1-frozen`

- [ ] C-01–C-12 决议由 ARCH、DEV-WP0、QA-WP0 共同确认。
- [ ] [测试工程修订](./TEST-FOUNDATION.md) 的测试位置、命令、浏览器/真机边界确认。
- [ ] 只创建测试底座分支和 WP0 Contract PR；不得接入 Geo 页面。

### 11.2 `contract-v1.1-frozen`

- [ ] 本文件所有类型进入 Contract PR 和 Fixture。
- [ ] Runtime owner+workspace 构造契约测试通过；完整生命周期测试属于 WP0 Kernel DoD。
- [ ] start Command 与 Receipt 的 operationId 一致性测试通过。
- [ ] Adapter route、Snapshot cursor、AppendResult、Message Block 和 Application bootstrap 公共签名冻结。
- [ ] Event/Message Codec Fixture 覆盖 appended/duplicate/conflict 所需字段、blockId、delta 和 stopped。
- [ ] Renderer 所有权被依赖扫描规则表达；实际扫描通过属于相应 WP DoD。
- [ ] Mock/Legacy/v1 能力矩阵进入 UI 和 QA 断言。
- [ ] 测试隔离、测试 TypeScript、SFC 注释和 Browser Integration 门禁可执行。

第二级全部勾选后由 ARCH 将状态改为 `contract-v1.1-frozen`。之后 WP0 Task 3–5 可开始；
WP1–WP6 仍须分别满足施工总控台中的前置依赖，不能因全局 Contract 冻结而越级开工。
