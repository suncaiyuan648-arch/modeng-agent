# SDK Domain 与 Contracts v1.1

## 1. 设计规则

- DTO 只描述跨网络、持久化或模块边界的数据形状。
- Domain Model 描述 SDK 内部合法状态，不直接等同于后端 DTO。
- 所有外部 `unknown` 数据必须经过 Codec/Schema 校验后才能进入 Domain。
- 时间统一使用 ISO 8601 UTC 字符串传输；内核不直接构造本地时区时间。
- ID 使用品牌化 string type，禁止把 WorkspaceId、SessionId、OperationId 互传。
- 金额使用“整数最小货币单位 + currency”，比例使用 0 到 1 的 number；Geo 业务金额不进入通用 SDK。
- Collection 在公共 API 中只读；Reducer 返回新状态，不允许页面原地修改。

## 2. 标识符

```ts
/** Workspace 的全局唯一标识符。 */
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };

/** Session 的全局唯一标识符。 */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** Operation 的全局唯一标识符。 */
export type OperationId = string & { readonly __brand: 'OperationId' };

/** Event 的全局唯一标识符。 */
export type EventId = string & { readonly __brand: 'EventId' };

/** Command 的全局唯一标识符。 */
export type CommandId = string & { readonly __brand: 'CommandId' };

/** Artifact 的全局唯一标识符。 */
export type ArtifactId = string & { readonly __brand: 'ArtifactId' };

/** Resource 的全局唯一标识符。 */
export type ResourceId = string & { readonly __brand: 'ResourceId' };

/** Adapter 实现的稳定标识符，不允许使用类名或文件路径。 */
export type AdapterKind = string & { readonly __brand: 'AdapterKind' };

/** Message ContentBlock 的全局唯一标识符。 */
export type MessageBlockId = string & { readonly __brand: 'MessageBlockId' };

/** Message 的全局唯一标识符。 */
export type MessageId = string & { readonly __brand: 'MessageId' };

/** ToolCall 的全局唯一标识符。 */
export type ToolCallId = string & { readonly __brand: 'ToolCallId' };
```

构造函数必须验证非空、最大长度和允许字符，不接受页面直接 `as WorkspaceId`。

## 3. Workspace 与 Resource

```ts
/** 可跨 Session 共享资源的工作空间。 */
export interface Workspace {
  /** 工作空间唯一标识符。 */
  readonly id: WorkspaceId;
  /** 所有者用户标识符，用于本地数据隔离；不得由 UI 修改。 */
  readonly ownerId: string;
  /** 用户可见名称。 */
  readonly name: string;
  /** 工作空间级资源索引。 */
  readonly resources: Readonly<Record<ResourceId, WorkspaceResource>>;
  /** 创建时间，ISO 8601 UTC。 */
  readonly createdAt: string;
  /** 最后更新时间，ISO 8601 UTC。 */
  readonly updatedAt: string;
}

/** Workspace 内可供多个 Operation 引用的文件或外部资源。 */
export interface WorkspaceResource {
  /** 资源唯一标识符。 */
  readonly id: ResourceId;
  /** 资源种类，不使用后缀名推断。 */
  readonly kind: 'file' | 'image' | 'audio' | 'video' | 'document' | 'url';
  /** 原始文件名或业务标题。 */
  readonly name: string;
  /** 标准 MIME 类型；未知时为 application/octet-stream。 */
  readonly mimeType: string;
  /** 字节大小；远程 URL 无法确定时省略。 */
  readonly sizeBytes?: number;
  /** 受控资源引用；不得保存永久明文下载地址。 */
  readonly locator: ResourceLocator;
  /** 资源当前可用状态。 */
  readonly status: 'uploading' | 'ready' | 'failed' | 'deleted';
  /** 服务端内容哈希，用于去重；不存在时省略。 */
  readonly checksum?: string;
}

/** 平台无关的资源定位信息。 */
export type ResourceLocator =
  | { readonly type: 'server-resource'; readonly resourceKey: string }
  | { readonly type: 'temporary-local'; readonly localKey: string }
  | { readonly type: 'external-url'; readonly url: string };
```

安全要求：Snapshot 默认只保存 `server-resource`；临时本地文件只保存平台返回的受控 key，退出登录时清理。

## 4. Session 与 Operation

```ts
/** Workspace 中的一段连续 Agent 交互。 */
export interface AgentSession {
  /** Session 唯一标识符。 */
  readonly id: SessionId;
  /** 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** 本 Session 使用的 Agent 类型，如 geo-ad。 */
  readonly agentType: string;
  /** 用户可见标题。 */
  readonly title: string;
  /** 创建时间，ISO 8601 UTC。 */
  readonly createdAt: string;
  /** 最后一次活动时间，ISO 8601 UTC。 */
  readonly updatedAt: string;
}

/** Operation 的稳定生命周期状态。 */
export type OperationStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'waiting_user'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

/** Adapter 在创建 Operation 时冻结的传输与控制能力。 */
export interface AdapterCapabilities {
  /** 是否能向服务端发送真实取消请求并获得事实确认。 */
  readonly serverCancel: boolean;
  /** 是否能从 sequence 游标补拉历史事件。 */
  readonly replay: boolean;
  /** 是否能订阅实时事件。 */
  readonly subscribe: boolean;
  /** 实时订阅不可用时是否支持轮询增量事件。 */
  readonly polling: boolean;
}

/** 一次 Agent 执行；取消和恢复能力由 adapterCapabilities 决定。 */
export interface AgentOperation {
  /** Operation 唯一标识符。 */
  readonly id: OperationId;
  /** 所属 Session。 */
  readonly sessionId: SessionId;
  /** 所属 Workspace，冗余用于隔离校验和分区查询。 */
  readonly workspaceId: WorkspaceId;
  /** Agent 类型。 */
  readonly agentType: string;
  /** 创建 Operation 时冻结的 Adapter 类型，恢复和重连不得重新求值。 */
  readonly adapterKind: AdapterKind;
  /** 当前 Adapter 在创建时声明的真实取消、订阅、重放和轮询能力。 */
  readonly adapterCapabilities: AdapterCapabilities;
  /** 稳定生命周期状态，由 State Machine 校验。 */
  readonly status: OperationStatus;
  /** Agent 定义的当前阶段；不得写入 status。 */
  readonly phase: string | null;
  /** 0 到 1 的可选进度；无法量化时为 null。 */
  readonly progress: number | null;
  /** 该 Operation 已应用的最大连续事件序列。 */
  readonly lastSequence: number;
  /** lastSequence 对应的 Event；尚未应用事件时为 null。 */
  readonly lastEventId: EventId | null;
  /** Operation 是否以部分结果可用的方式完成。 */
  readonly partialSuccess: boolean;
  /** 本次重试来源 Operation；非重试时为 null。 */
  readonly retryOfOperationId: OperationId | null;
  /** 当前需要用户响应的请求；无等待时为 null。 */
  readonly pendingInput: PendingUserInput | null;
  /** 终止错误；非 failed 时为 null。 */
  readonly error: OperationError | null;
  /** 创建、开始和结束时间。 */
  readonly timestamps: OperationTimestamps;
}
```

### 4.1 状态转移

| 当前状态 | 允许目标状态 |
| --- | --- |
| `created` | `queued`、`running`、`cancelled` |
| `queued` | `running`、`failed`、`cancelled` |
| `running` | `waiting_user`、`completed`、`failed`、`cancelled`、`interrupted` |
| `waiting_user` | `running`、`failed`、`cancelled`、`interrupted` |
| `completed` | 无 |
| `failed` | 无；重试创建新 Operation |
| `cancelled` | 无；重新执行创建新 Operation |
| `interrupted` | 无；仅表示当前 Adapter 无法恢复，重新执行需创建新 Operation |

重复到达同状态的事件只允许作为幂等重放，不刷新结束时间，不触发二次副作用。

### 4.2 Phase 约束

SDK 只要求 phase 是 AgentDefinition 声明过的稳定 code。Geo v1 可使用：

```text
planning -> researching -> synthesizing -> reporting
```

phase 改变不自动改变 status；只有标准生命周期事件改变 status。

## 5. Artifact 生命周期

```ts
/** Artifact 的独立生命周期。 */
export type ArtifactStatus =
  | 'draft'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'archived';

/** Agent 生成或维护的版本化业务产物。 */
export interface Artifact {
  /** Artifact 逻辑唯一标识符，同一产物的多版本共享该 ID。 */
  readonly id: ArtifactId;
  /** 产生或最后修改该 Artifact 的 Operation。 */
  readonly operationId: OperationId;
  /** 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** 业务 Schema 名称，如 geo.research-report。 */
  readonly schemaName: string;
  /** 业务 Schema 版本，如 1.0.0。 */
  readonly schemaVersion: string;
  /** 单调递增的业务产物版本，从 1 开始。 */
  readonly version: number;
  /** Artifact 独立生命周期状态。 */
  readonly status: ArtifactStatus;
  /** 经 SchemaRegistry 校验的业务数据。 */
  readonly data: ReadonlyJsonValue;
  /** 可执行的白名单 UI Intent。 */
  readonly intents: readonly UiIntent[];
  /** Artifact 失败信息；非 failed 时为 null。 */
  readonly error: ArtifactError | null;
  /** 创建和更新时间，ISO 8601 UTC。 */
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

Artifact 转移：

```text
draft -> processing | ready | archived
processing -> ready | failed | archived
ready -> processing | archived
failed -> processing | archived
archived -> 终态
```

Operation `completed` 时允许某个非关键 Artifact 为 `failed`，但事件必须声明 `partialSuccess=true`，页面展示“部分结果可用”，不能把失败 Artifact 隐藏。

## 6. Message 与 ContentBlock

```ts
/** 标准消息角色，避免旧页面的 ai/assistant 混用。 */
export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

/** 结构化消息；渲染不依赖 content:any。 */
export interface AgentMessage {
  /** 消息唯一标识符。 */
  readonly id: MessageId;
  /** 所属 Operation。 */
  readonly operationId: OperationId;
  /** 消息发送者角色。 */
  readonly role: MessageRole;
  /** 按顺序渲染的内容块。 */
  readonly blocks: readonly MessageContentBlock[];
  /** 流式消息状态。 */
  readonly status: 'streaming' | 'completed' | 'stopped' | 'failed';
  /** 创建时间，ISO 8601 UTC。 */
  readonly createdAt: string;
}

/** v1.1 支持的消息内容块；每种 Block 都必须拥有稳定 ID。 */
export type MessageContentBlock =
  | { readonly id: MessageBlockId; readonly type: 'text'; readonly text: string }
  | { readonly id: MessageBlockId; readonly type: 'reasoning-summary'; readonly text: string }
  | { readonly id: MessageBlockId; readonly type: 'resource-reference'; readonly resourceId: ResourceId }
  | { readonly id: MessageBlockId; readonly type: 'tool-call-reference'; readonly toolCallId: ToolCallId }
  | { readonly id: MessageBlockId; readonly type: 'artifact-reference'; readonly artifactId: ArtifactId }
  | { readonly id: MessageBlockId; readonly type: 'citation-group'; readonly citations: readonly CitationReference[] }
  | { readonly id: MessageBlockId; readonly type: 'unknown-safe-fallback'; readonly originalType: string };
```

`reasoning-summary` 仅表示可展示的摘要，不承诺或要求服务端暴露模型隐藏思维链。

`MessageContentBlock` 是跨模块唯一公共名称。UI 组件命名统一为 `AiMessageBlockRenderer`；
Conversation 和 Agent 不得再声明 `MessagePart`、`ContentPart` 等同义类型。

### 6.1 ToolCall

```ts
/** 可展示且可恢复的工具调用事实，不包含密钥、隐藏 Prompt 或任意执行函数。 */
export interface ToolCall {
  /** ToolCall 唯一标识符。 */
  readonly id: ToolCallId;
  /** 所属 Operation。 */
  readonly operationId: OperationId;
  /** 稳定工具 code；不是前端组件名。 */
  readonly toolCode: string;
  /** 用户可见的安全摘要。 */
  readonly summary: string;
  /** 工具调用生命周期。 */
  readonly status: 'running' | 'completed' | 'failed';
  /** 0 到 1 的可选进度；无法量化时为 null。 */
  readonly progress: number | null;
  /** 失败信息；非 failed 时为 null。 */
  readonly error: OperationError | null;
}
```

## 7. Agent Manifest 双层模型

### 7.1 服务端描述

```ts
/** 服务端返回的非可信 Agent 能力描述。 */
export interface AgentDescriptorDTO {
  /** 稳定 Agent 类型。 */
  readonly agentType: string;
  /** Manifest 版本。 */
  readonly manifestVersion: string;
  /** 服务端是否启用。 */
  readonly enabled: boolean;
  /** 服务端声称支持的 Agent 能力。 */
  readonly capabilities: readonly string[];
  /** 可接收的 Command Schema。 */
  readonly inputSchemas: readonly SchemaReference[];
  /** 可产生的 Event/Artifact Schema。 */
  readonly outputSchemas: readonly SchemaReference[];
  /** 服务端支持的协议 major。 */
  readonly protocolMajor: number;
}
```

### 7.2 前端可信定义

```ts
/** 随前端代码发布的可信 Agent 定义。 */
export interface AgentDefinition<TViewModel> {
  /** 必须与服务端描述匹配的 Agent 类型。 */
  readonly agentType: string;
  /** 前端支持的 Manifest 版本范围。 */
  readonly supportedManifestRange: string;
  /** 前端支持的业务 phase 集合。 */
  readonly phases: ReadonlySet<string>;
  /** 本地可信 Schema 和 Renderer 注册函数。 */
  readonly register: (context: AgentRegistrationContext) => void;
  /** 从通用状态构建业务只读 ViewModel。 */
  readonly projector: RuntimeProjector<TViewModel>;
}
```

启用条件是：服务端 enabled、协议 major 兼容、Manifest 范围兼容、必须 Capability 满足且所有 required Schema 已在本地注册。

## 8. Capability、Entitlement 与 Authorization

四类信息不得合并为一个布尔值：

| 类别 | 示例 | 来源 | 前端用途 |
| --- | --- | --- | --- |
| Platform Capability | `stream.chunk`、`file.pick` | 平台 Adapter | 选择实现或降级 |
| Agent Capability | `geo.research`、`artifact.export` | Manifest 交集 | 控制 Agent 功能呈现 |
| Entitlement | `plan.geo.pro`、配额 | 用户权益接口 | 展示升级/用量提示 |
| Authorization | Workspace/资源操作权限 | 服务端 | 前端预检，服务端最终裁决 |

前端显示按钮前可以求交，但任何 Command 都必须接受服务端再次鉴权。服务端返回 `authorization.denied` 事件时，Reducer 保存错误事实，UI 不自行猜测成功。

## 9. RuntimeState 聚合边界

```ts
/** 单个 owner + workspace Runtime 的不可变领域聚合。 */
export interface RuntimeState {
  /** 当前 Runtime 唯一允许管理的 Workspace。 */
  readonly workspace: Workspace;
  /** Workspace 下的 Session。 */
  readonly sessions: Readonly<Record<SessionId, AgentSession>>;
  /** Workspace 下的 Operation。 */
  readonly operations: Readonly<Record<OperationId, AgentOperation>>;
  /** Operation 的可展示执行步骤。 */
  readonly steps: Readonly<Record<string, AgentStep>>;
  /** Operation 产生的 Message。 */
  readonly messages: Readonly<Record<MessageId, AgentMessage>>;
  /** Operation 产生的 ToolCall。 */
  readonly toolCalls: Readonly<Record<ToolCallId, ToolCall>>;
  /** Operation 产生的 Artifact。 */
  readonly artifacts: Readonly<Record<ArtifactId, Artifact>>;
}

/** 对 SDK 消费方暴露的深只读 RuntimeState。 */
export type ReadonlyRuntimeState = DeepReadonly<RuntimeState>;
```

AgentStep 同样必须按 Operation 归属；不得因为首个 Geo 切片只用一个 Workspace而在同一 Runtime
混入第二个 Workspace。

## 10. RuntimeSnapshotDTO

```ts
/** 可恢复 Runtime 的版本化快照。 */
export interface RuntimeSnapshotDTO {
  /** 快照协议版本。 */
  readonly schemaVersion: '1.0';
  /** 当前登录用户，用于防止跨账号读取。 */
  readonly ownerId: string;
  /** 快照所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** 快照生成时的不可变 RuntimeState。 */
  readonly state: ReadonlyJsonValue;
  /** 每个 Operation 的恢复游标和已冻结路由。 */
  readonly operations: Readonly<Record<OperationId, OperationSnapshotCursor>>;
  /** 快照生成时间，ISO 8601 UTC。 */
  readonly createdAt: string;
  /** 可选过期时间，超过后必须向服务端重新同步。 */
  readonly expiresAt?: string;
}

/** 单个 Operation 的持久化恢复游标。 */
export interface OperationSnapshotCursor {
  /** 已覆盖的最大连续序列。 */
  readonly lastSequence: number;
  /** lastSequence 对应的 Event；无事件时为 null。 */
  readonly lastEventId: EventId | null;
  /** 创建 Operation 时冻结的 Adapter。 */
  readonly adapterKind: AdapterKind;
  /** 创建 Operation 时冻结的 Adapter 能力。 */
  readonly adapterCapabilities: AdapterCapabilities;
}
```

Snapshot 只作为恢复加速，不替代服务端事实。恢复后必须从每个 cursor 补拉增量事件。
