# SDK Persistence 与 Recovery

## 1. 边界

Persistence 参与正确性，保存 Event、Snapshot 和恢复 cursor；Cache 只保存可丢弃派生数据。Conversation 草稿不进入 Agent Snapshot，由 Conversation 的 DraftRepository 管理。

## 2. 恢复顺序

```text
验证 owner/workspace
  -> 加载兼容 Snapshot
  -> 重放本地 delta
  -> 服务端 replay(afterSequence)
  -> 建立实时 subscribe
  -> 生成只读投影
```

## 3. 端口

```ts
export interface EventRepository {
  /** 以 operationId + sequence 唯一键原子追加并返回写入判定。 */
  append(event: AgentEventEnvelope): Promise<AppendResult>;
  listAfter(operationId: OperationId, sequence: number): Promise<readonly AgentEventEnvelope[]>;
  prune(operationId: OperationId, throughSequence: number): Promise<void>;
}

export interface SnapshotRepository {
  loadLatest(workspaceId: WorkspaceId): Promise<RuntimeSnapshotDTO | null>;
  save(snapshot: RuntimeSnapshotDTO): Promise<void>;
  clear(workspaceId: WorkspaceId): Promise<void>;
}

export interface QuarantineRepository {
  /** 保存脱敏后的非法/冲突事件诊断；这些记录不得参与自动重放。 */
  save(record: QuarantinedEventRecord): Promise<void>;
}
```

实际源码必须为上述接口和每个方法补充完整中文 TSDoc、参数、返回和错误语义。

## 4. 安全

- Namespace 包含 environment、ownerId、workspaceId。
- ownerId 使用 tenantId + userId 或匿名 installationId，不得使用 token/hash。
- Token、File、Blob、永久下载 URL 和隐藏思维链不得进入 Snapshot。
- owner 切换先停止订阅，再清内存和旧 owner Namespace。
- Artifact Schema 可以声明 `full | metadata-only | none` 持久化策略。

## 5. 降级

IndexedDB/uni storage 失败时可以进入 memory-only，但必须在 ViewModel 暴露“刷新后无法恢复”。Snapshot 损坏时隔离本地数据并从服务端事件重建，不能强制类型转换。

## 6. 测试

Persistence Adapter 必须通过同一 conformance suite：原子追加、重复幂等、sequence 冲突、升序读取、快照 cursor 不回退、跨 owner 拒绝、清理和存储失败降级。

## 7. 提交原子性

EventProcessor 在 Runtime 单写队列中先纯函数预归约，再调用 `append()`：

- `appended`：提交预计算的 nextState。
- `duplicate`：丢弃预计算结果，保持当前 State。
- `conflict`：写 Quarantine，并停止对应 Operation 的正常消费。

非法 Schema、状态转移和归属冲突不能写入正常 EventRepository。Snapshot cursor 保存
`lastSequence + lastEventId + adapterKind`，恢复时必须三者一致。

## 8. IndexedDB Schema 与多标签页

v1.1 冻结以下规则：

- IndexedDB 使用显式 `schemaVersion` 和逐版本 migration；禁止删除数据库作为升级方式。
- 每个 owner+workspace 同时只允许一个写 Leader；其他 Tab 为只读 Follower，通过 BroadcastChannel 或存储事件接收快照失效通知。
- 不支持可靠 Leader Election 的环境使用带过期时间的恢复锁；拿不到锁时不得建立第二条写订阅。
- Leader 崩溃后新 Leader 必须先 replay，再恢复实时订阅。
- 淘汰顺序：预览 Cache -> 已终态可重建 Event -> 已终态 Snapshot；活跃 cursor 和 Quarantine 诊断最后处理。
- 配额不足进入 memory-only 时，必须禁止“刷新可恢复”文案并记录指标。
