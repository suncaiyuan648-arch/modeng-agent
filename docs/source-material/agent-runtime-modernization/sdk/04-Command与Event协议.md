# SDK Command 与 Event Protocol v1.1

## 1. 协议原则

- Command 是意图，不直接改变领域终态；Event 是已发生事实，是 Reducer 的唯一输入。
- User Command 与 Runtime Command 使用不同联合类型和不同 Bus，禁止 Runtime Command 进入 Transport。
- Event 的 `sequence` 在单个 Operation 内从 1 单调递增；跨 Operation 不比较 sequence。
- 断线恢复依赖 cursor，不依赖客户端接收时间。
- 事件信封只放路由、顺序、因果和版本字段，业务数据放 payload。
- 所有输入以 `unknown` 进入 Codec，校验成功后才获得强类型。

## 2. User Command Envelope

```ts
/** 可跨网络发送的用户命令信封。 */
export interface UserCommandEnvelope<TType extends string, TPayload> {
  /** 命令协议版本；v1 固定为 1.0。 */
  readonly schemaVersion: '1.0';
  /** 命令唯一标识符，用于追踪一次提交。 */
  readonly commandId: CommandId;
  /** 幂等键；网络重试必须复用，用户主动再次执行必须新建。 */
  readonly idempotencyKey: string;
  /** 命令类型，使用命名空间命名。 */
  readonly type: TType;
  /** 目标 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** 目标 Session；创建 Session 命令可省略。 */
  readonly sessionId?: SessionId;
  /** 目标 Operation；所有 Operation 级命令均必填并由客户端 IdGenerator 预先创建。 */
  readonly operationId: OperationId | null;
  /** 乐观并发版本；更新共享对象时必填。 */
  readonly expectedVersion?: number;
  /** 客户端产生时间，ISO 8601 UTC，仅用于诊断。 */
  readonly issuedAt: string;
  /** 经对应 Command Schema 校验的负载。 */
  readonly payload: TPayload;
}
```

## 3. v1 User Command 类型

| type | 作用 | 必需字段 | 成功确认事件 |
| --- | --- | --- | --- |
| `workspace.create.request` | 创建工作空间 | `name` | `workspace.created` |
| `workspace.resource.attach.request` | 上传完成后挂接资源 | `resource` | `workspace.resource.attached` |
| `session.create.request` | 在 Workspace 创建 Agent Session | `agentType`、`title` | `session.created` |
| `operation.start.request` | 启动一次 Agent 执行 | envelope.operationId、`agentType`、`inputSchema`、`input` | `operation.created`/`operation.started` |
| `operation.cancel.request` | 请求取消执行 | `reason?` | `operation.cancelled` 或 `operation.cancel.rejected` |
| `operation.retry.request` | 基于失败/取消任务创建新执行 | `sourceOperationId` | 新 `operation.created` |
| `operation.user-input.provide` | 回答等待用户输入 | `requestId`、`value` | `operation.user-input.accepted` |
| `artifact.revise.request` | 请求生成 Artifact 新版本 | `artifactId`、`expectedVersion`、`instruction` | `artifact.processing`/`artifact.updated` |
| `artifact.archive.request` | 归档 Artifact | `artifactId`、`expectedVersion` | `artifact.archived` |

Geo v1 使用通用的 `operation.start.request`，payload Schema 为 `geo.research-input@1`；不在通用协议增加 `geo.start`。

## 4. Runtime Command 类型

Runtime Command 不序列化、不进入后端日志：

| type | 作用 | 结果 |
| --- | --- | --- |
| `runtime.rehydrate` | 从本地快照与事件库恢复 | 更新本地 RuntimeState |
| `runtime.resume-operation` | 从 cursor 订阅/补拉 Operation | 消费标准 Event |
| `runtime.reproject` | Registry 或语言变化后重建 ViewModel | 不修改 Domain State |
| `runtime.refresh-capabilities` | 重新计算平台/Agent/权益能力交集 | 更新派生 Capability View |
| `runtime.compact` | 创建 Snapshot 并裁剪已覆盖事件 | 不改变业务事实 |
| `runtime.clear-owner-data` | 退出登录时清理本地数据 | 清空指定 owner 的 Namespace |

Runtime Command 的执行失败只产生本地 `AgentSdkError` 和结构化日志，不能伪造服务端 Event。

## 5. CommandReceipt 与路由

```ts
/** Command Transport 对接收结果的正式回执。 */
export interface CommandReceipt {
  /** 原始命令 ID。 */
  readonly commandId: CommandId;
  /** Operation 命令的目标 ID；非 Operation 命令为 null。 */
  readonly operationId: OperationId | null;
  /** accepted 只表示接收成功，不代表业务完成。 */
  readonly status: 'accepted' | 'rejected';
  /** Operation 创建时冻结的 Adapter；拒绝或非 Operation 命令时可为 null。 */
  readonly adapterKind: AdapterKind | null;
  /** 拒绝详情；accepted 时必须为 null。 */
  readonly rejection: CommandRejection | null;
  /** 回执产生时间，ISO 8601 UTC。 */
  readonly acknowledgedAt: string;
}
```

新 Operation 的 `operationId` 和 `adapterKind` 必须在 Command、Receipt、`operation.created` Event、
AgentOperation 与 Snapshot 中一致。TransportRouter 只为新 Operation 选择 Adapter；恢复时读取已冻结路由。

## 6. Event Envelope

```ts
/** 服务端事实事件的标准信封。 */
export interface AgentEventEnvelope<TType extends string = string, TPayload = unknown> {
  /** Event 协议版本。 */
  readonly schemaVersion: '1.0';
  /** 事件唯一标识符。 */
  readonly eventId: EventId;
  /** 事件类型，使用命名空间和过去式命名。 */
  readonly type: TType;
  /** 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** 所属 Session。 */
  readonly sessionId: SessionId;
  /** 当前事件所属 Operation。 */
  readonly operationId: OperationId;
  /** 整条任务树的根 Operation；单 Agent 时等于 operationId。 */
  readonly rootOperationId: OperationId;
  /** 直接父 Operation；非子任务时省略。 */
  readonly parentOperationId?: OperationId;
  /** 直接导致当前事件发生的 Event；无明确因果时省略。 */
  readonly causationEventId?: EventId;
  /** 跨命令、Operation 和服务端调用的追踪关联标识。 */
  readonly correlationId: string;
  /** 当前 Operation 内从 1 开始的单调连续序列。 */
  readonly sequence: number;
  /** 事件事实来源；本地来源仅允许协议明确列出的恢复/兼容事件。 */
  readonly source: 'server' | 'mock' | 'legacy-adapter' | 'local-recovery';
  /** occurredAt 由服务端产生还是由客户端接收时补齐。 */
  readonly timestampSource: 'server' | 'client-received';
  /** 服务端事实发生时间，ISO 8601 UTC。 */
  readonly occurredAt: string;
  /** 未识别时是否必须中止消费，默认 false。 */
  readonly critical?: boolean;
  /** 经 Event Schema 校验的负载。 */
  readonly payload: TPayload;
}
```

不采用单一 `parentEventId` 表达任务树，因为它不能区分 Operation 父子关系和事件因果关系。

## 7. v1.1 标准事件分类

### 7.1 Workspace 与 Session

- `workspace.created`
- `workspace.updated`
- `workspace.resource.attached`
- `workspace.resource.failed`
- `session.created`
- `session.updated`

### 7.2 Operation 生命周期

- `operation.created`
- `operation.queued`
- `operation.started`
- `operation.phase.changed`
- `operation.progress.changed`
- `operation.user-input.required`
- `operation.user-input.accepted`
- `operation.completed`
- `operation.failed`
- `operation.cancelled`
- `operation.interrupted`
- `operation.cancel.rejected`

### 7.3 Message

- `message.created`
- `message.block.added`
- `message.block.delta`
- `message.block.completed`
- `message.completed`
- `message.stopped`
- `message.failed`

Delta 必须指明目标 block 和增量类型，不能像当前旧逻辑一样把同一文本同时追加到 reasoning 和 answer。
`operation.interrupted` 只允许 `source=local-recovery`，表示恢复协调器确认已冻结 Adapter 不具备 replay/subscribe；
它不代表服务端已失败、已完成或已取消。

### 7.4 Agent Step 与 Tool Call

- `agent-step.started`
- `agent-step.progress.changed`
- `agent-step.completed`
- `agent-step.failed`
- `tool-call.started`
- `tool-call.progress.changed`
- `tool-call.completed`
- `tool-call.failed`

Tool payload 只公开可展示摘要和安全元数据，不发送密钥、完整内部 Prompt 或隐藏思维链。

### 7.5 Artifact

- `artifact.created`
- `artifact.processing`
- `artifact.updated`
- `artifact.ready`
- `artifact.failed`
- `artifact.archived`

### 7.6 权限与兼容

- `authorization.denied`
- `capability.changed`
- `protocol.warning`

## 8. 关键 payload 示例

```ts
/** Operation 创建事实负载。 */
export interface OperationCreatedPayload {
  /** 必须与 start Command 和 Receipt 一致。 */
  readonly operationId: OperationId;
  /** TransportRouter 为该 Operation 冻结的 Adapter。 */
  readonly adapterKind: AdapterKind;
  /** Adapter 在创建时声明的真实能力。 */
  readonly adapterCapabilities: AdapterCapabilities;
}

/** Operation 阶段变化负载。 */
export interface OperationPhaseChangedPayload {
  /** 新业务阶段 code，必须在 AgentDefinition 中声明。 */
  readonly phase: string;
  /** 面向用户的可选简短说明。 */
  readonly label?: string;
}

/** Message 流式增量负载。 */
export interface MessageBlockDeltaPayload {
  /** 目标消息 ID。 */
  readonly messageId: MessageId;
  /** 目标内容块 ID，保证 answer 与 reasoning-summary 不混写。 */
  readonly blockId: MessageBlockId;
  /** 增量操作；v1 仅支持文本追加。 */
  readonly operation: 'append-text';
  /** 本次追加的文本。 */
  readonly text: string;
}

/** Artifact 就绪负载。 */
export interface ArtifactReadyPayload {
  /** 完整 Artifact；必须通过对应业务 Schema 校验。 */
  readonly artifact: Artifact;
  /** Operation 是否为部分成功。 */
  readonly partialSuccess: boolean;
}

/** Operation 完成事实负载。 */
export interface OperationCompletedPayload {
  /** 是否存在失败但不阻断主要结果的 Artifact 或步骤。 */
  readonly partialSuccess: boolean;
}
```

## 9. 顺序、去重与空洞处理

对每个 Operation：

1. `sequence === lastSequence + 1`：预归约 nextState，再执行原子 append；appended 后提交内存状态。
2. `sequence <= lastSequence` 且 `(sequence, eventId)` 已见：幂等忽略。
3. `sequence <= lastSequence` 但 eventId 不同：`SEQUENCE_CONFLICT`，停止该 Operation 消费。
4. `sequence > lastSequence + 1`：暂停归约，调用 `replay(afterSequence=lastSequence)` 补拉。
5. 补拉后仍有空洞：进入 degraded 状态，提示刷新/重试并上报 trace。

EventProcessor 详细提交顺序、duplicate/conflict 和 Quarantine 语义以
[Contract v1.1 开工冻结](../implementation/CONTRACT-V1.1-GATE.md) 为准。若本地存储不可用，可按策略进入 memory-only，并显式关闭“刷新恢复”承诺。

## 10. 重放、Snapshot 与保留策略

- 活跃 Operation 的 Event 默认保留 7 天，完成/失败/取消后至少保留 24 小时；服务端可配置更长。
- 客户端每 50 个事件、Operation 进入终态或应用进入后台时尝试生成 Snapshot。
- Snapshot 写入成功后，客户端可裁剪被覆盖且超过 24 小时的本地事件。
- 恢复顺序：验证 owner -> 加载最新兼容 Snapshot -> 重放本地 delta -> 向服务端补拉 cursor 后 delta -> 订阅实时流。
- Snapshot major 不兼容时丢弃本地快照，从服务端重建；不能尝试强转。

保留天数是 v1 默认策略，可配置，但客户端和服务端必须保证“最大允许离线时长”有明确产品提示。

## 11. 重试和幂等

- Transport 级重试复用 `commandId` 和 `idempotencyKey`。
- 用户主动点击“重新执行”创建新的 `commandId`、`idempotencyKey` 和 Operation。
- `operation.retry.request` 必须引用 sourceOperationId，服务端返回新 Operation。
- Artifact revise 使用 `expectedVersion`；版本冲突返回明确拒绝事件，不静默覆盖。
- 自动重试仅限网络超时、临时 5xx 和明确 `retryable=true` 的错误；鉴权、Schema、协议和状态转移错误不自动重试。

## 12. SSE/JSON Lines 映射

未来标准后端推荐：

```text
event: agent-event
id: <operationId>:<sequence>
data: <AgentEventEnvelope JSON>
```

- SSE `id` 仅作为传输恢复提示，领域去重仍以 envelope 的 operationId、sequence、eventId 为准。
- Web 可传 `Last-Event-ID`；统一 API 仍优先使用显式 `afterSequence`。
- uni-app 平台无法稳定保持 SSE 时，Adapter 可使用 chunked HTTP 或轮询 `GET events?afterSequence=n`，Decoder 与 Reducer 不变。

## 13. 兼容性矩阵

| 输入 | v1 客户端行为 |
| --- | --- |
| 相同 major、新增可选字段 | 忽略未知字段并继续 |
| 相同 major、未知非 critical 事件 | 持久化、记录 warning、跳过投影 |
| 相同 major、未知 critical 事件 | 停止该 Operation，提示升级 |
| 更高 major | 拒绝解码，返回 `PROTOCOL_INCOMPATIBLE` |
| 缺少必需字段/非法枚举 | 拒绝进入 Domain，返回 `SCHEMA_INVALID` |
| Artifact Schema 未注册 | 保存安全元数据，显示“不支持的结果类型”，不渲染 data |

## 14. Legacy Adapter 规则

Legacy Adapter 的固定流水线：

```text
当前 API DTO/流片段
  -> Legacy Decoder
  -> Legacy Normalizer
  -> v1 AgentEventEnvelope
  -> 标准 Event Codec
  -> EventProcessor
```

Adapter 可以补齐当前后端不存在的 envelope 字段，但必须遵守：

- operationId 必须复用 start Command 由客户端 IdGenerator 预先生成的值，在一次当前任务中稳定，不可按事件随机生成。
- sequence 由 Adapter 在单次内存任务中单调生成；当前 Legacy Promise 不能把进行中 cursor 提升为后端可恢复能力。
- occurredAt 使用接收时 Clock 生成，并标注 `source: legacy-adapter`、`timestampSource: client-received`。
- Legacy 结束响应必须映射为明确 completed/failed/cancelled，不以连接关闭猜测完成。
- Legacy 页面刷新后若原 Operation 仍为 running，恢复协调器写入本地 `operation.interrupted`，并标注 non-resumable；不得伪造服务端 cancelled/completed。
- 后端迁移为 v1 后，删除 Normalizer，保留同一 conformance suite 验证行为一致。
