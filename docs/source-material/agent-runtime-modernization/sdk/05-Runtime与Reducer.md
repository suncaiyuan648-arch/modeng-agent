# SDK Runtime、Reducer 与 Projector

## 1. 单一 Runtime 门面

SDK 对外只提供一个 `AgentRuntime`。页面、Conversation 和业务 Agent 不得自行编排内部处理器：

```text
User Command
  -> CommandCodec
  -> CommandBus
  -> AgentTransport
  -> TransportRouter / AgentTransport
  -> EventProcessor 单写提交队列
  -> EventCodec / SchemaRegistry
  -> StateMachine + reduceEvent 预计算
  -> EventRepository.append 原子判定
  -> RuntimeState
  -> RuntimeProjector
  -> Readonly ViewModel
```

内部职责固定如下：

- `CommandBus`：区分 User Command 与 Runtime Command，管理幂等键、取消信号和接收回执。
- `EventProcessor`：负责解码、版本判断、排序、去重、补洞、持久化和归约编排。
- `Reducer`：纯函数更新领域状态，不执行 IO。
- `StateMachine`：验证 Operation 与 Artifact 生命周期转移。
- `RuntimeProjector`：从同一不可变快照生成通用只读 ViewModel。

一个 AgentRuntime 只对应一个不可变的 `ownerId + workspaceId`。多 Workspace 由 ApplicationManager
缓存多个 Workspace context，不由单个 Runtime 混合管理。

恢复流程由 [Persistence 与 Recovery](./06-Persistence与Recovery.md) 定义；平台实现由
[Platform Ports](./07-Platform-Ports.md) 定义。Conversation 的 Timeline、Composer 和 Viewport
状态不属于 Runtime，统一见 [Conversation 规范](../conversation/README.md)。

## 2. Runtime 生命周期

```ts
/** Runtime 可被应用装配层观察的生命周期状态。 */
export type RuntimeLifecycle =
  | 'idle'
  | 'starting'
  | 'running'
  | 'degraded'
  | 'disposing'
  | 'disposed';
```

约束：

- `start()` 幂等；并发调用共享同一个启动 Promise。
- `start()` 成功恢复后才能进入 `running`；使用内存降级时进入 `degraded`。
- `dispatch()` 只在 `running | degraded` 状态接受 User Command。
- `dispose()` 幂等；执行后不再发送命令、接收事件或通知订阅者。
- 账号切换必须先销毁旧 Runtime，再以新 owner 创建新实例。

## 3. Reducer 唯一写入口

Reducer 必须满足：

- 确定性：同一 state 与 event 得到结构等价结果。
- 无副作用：不读取时钟、不生成 ID、不访问网络、存储或 Logger。
- 不修改入参：开发测试中冻结 state 和 event 验证。
- 强归属校验：Workspace、Session、Operation、Message、Artifact 不得跨父实体写入。
- 状态机先校验、Reducer 后提交；非法转移不产生部分状态。
- 重复事件不重复写实体；同 sequence 不同 eventId 进入协议冲突。
- 未知非关键事件不修改业务实体，但推进已确认游标，避免无限重复消费。
- 未知关键事件停止对应 Operation 的继续投影并产生兼容性错误。

```ts
/**
 * 将一个已通过协议校验的事件归约到不可变 Runtime 状态。
 *
 * @param state 归约前的只读状态；函数不得修改其任何成员。
 * @param event 已解码、版本兼容且归属信息完整的标准事件。
 * @returns 包含新实体引用和新游标的 Runtime 状态。
 * @throws {AgentSdkError} 序列空洞、实体归属冲突或非法状态转移时抛出。
 */
export function reduceEvent(
  state: ReadonlyRuntimeState,
  event: AgentEventEnvelope,
): RuntimeState;
```

## 4. 状态机边界

Operation 生命周期只表达执行结果，不表达业务步骤：

```text
created -> queued -> running -> waiting_user -> running
                         |             |
                         +-------------+
running/waiting_user -> completed | failed | cancelled | interrupted
```

`phase` 由 AgentDefinition 声明，例如 Geo 的 `planning | researching | reporting`。SDK 状态机不理解这些业务值，只保证 phase 归属当前 Operation 且由合法事件更新。

Artifact 使用独立生命周期，允许 Operation 失败但保留已经 ready 的 Artifact，从而支持部分成功。

## 5. Projector 边界

Projector 是纯读取层，不得成为另一份状态真相：

```ts
/** 页面上层可消费的通用 Agent 执行视图。 */
export interface AgentExecutionView {
  /** 当前 Operation 的稳定生命周期。 */
  readonly status: OperationStatus;
  /** 当前 Agent 业务阶段；没有阶段时为 null。 */
  readonly phase: string | null;
  /** 0 至 1 的可量化进度；不可量化时为 null，UI 自行格式化百分比。 */
  readonly progress: number | null;
  /** 当前 Operation 已声明且通过能力过滤的 Intent。 */
  readonly availableIntents: readonly UiIntent[];
}
```

- RuntimeProjector 只生成跨 Agent 的基础视图。
- AgentProjector 由业务 Agent 提供，生成 Geo、PPT 等业务 ViewModel。
- ConversationProjector 属于 Conversation 模块，负责 Timeline 联结与展示状态。
- Pinia 仅保存或暴露这些只读投影，不得直接设置 status、phase、sequence 或 Artifact。

## 6. 事件处理与展示节流

领域正确性和 UI 性能必须分离：

- 每个事件单独解码、持久化和归约，不能为减少渲染而丢事件。
- EventProcessor 可在 16–50ms 窗口内合并订阅通知，但最终状态必须等价于逐事件通知。
- Runtime 不操作 DOM，也不判断聊天滚动位置。
- 流式文本的视觉合帧由 Conversation 的 `PresentationScheduler` 负责。

## 7. 测试门禁

- Runtime 生命周期：并发 start、重复 dispose、非法时机 dispatch、账号切换。
- Reducer：确定性、输入冻结、重复、乱序、空洞、非法转移、跨 owner 写入。
- Projector：相同 State 输出结构等价、引用复用、不得修改 State。
- EventProcessor：chunk 任意切分、UTF-8 跨 chunk、补洞后连续归约、Abort 后停止推送。
- CommitQueue：两个 Operation 并发到达不丢更新；append conflict 不提交预计算 State。
- 性能：5,000 个事件恢复无序列错误；1,000 条消息投影的真机阈值在基准测试后冻结。

SDK 完整测试与发布规则见 [测试与发布规范](./09-测试与发布规范.md)。
