# RuoYi-AI 后端演进建议（本阶段不实施）

## 1. 现状依据

目标仓库为 `/Users/mac/Documents/taojinshu-AI/ruoyi-ai`。`ruoyi-modules/ruoyi-chat` 已存在普通 Chat SSE，以及 Creation Assistant V2 的 Operation、Event、Snapshot、重放、取消、幂等和恢复实现。建议复用其工程经验和基础设施，不复制业务类，也不把所有 Agent 继续堆进 `ChatController`。

## 2. 建议模块

```text
ruoyi-modules/ruoyi-ai-runtime/                         / 通用 Agent Runtime 应用与领域能力
├── application/                                       / Command Handler、查询、恢复和编排
├── domain/                                            / Workspace、Session、Operation、Artifact、Event
├── infrastructure/                                    / Mapper、消息通知、任务执行器和外部工具 Adapter
└── web/                                               / v1 Command、Event Replay、SSE 和 Manifest API
ruoyi-modules-api/ruoyi-ai-runtime-api/                / 跨模块 DTO、Feign/Remote 接口和稳定错误码
ruoyi-modules/ruoyi-geo-ad/                            / Geo 领域、工作流和平台连接器
```

若不新增模块，至少在 `ruoyi-chat` 内建立 `agentruntime/v1` 独立包，禁止继续扩展单一 ChatController。

## 3. 推荐 API

```text
GET    /ai/v1/agents                                  / Agent Descriptor 列表
POST   /ai/v1/workspaces                              / 创建 Workspace
POST   /ai/v1/workspaces/{id}/resources               / 挂接已上传资源
POST   /ai/v1/sessions                                / 创建 Session
POST   /ai/v1/commands                                / 提交 User Command
GET    /ai/v1/operations/{id}                         / 查询 Operation 当前视图
GET    /ai/v1/operations/{id}/events?afterSequence=n  / 增量补拉
GET    /ai/v1/operations/{id}/stream?afterSequence=n  / SSE 实时事件
GET    /ai/v1/workspaces/{id}/snapshot                / 可选服务端快照
```

Command 接口返回“accepted/rejected 回执”，不把 accepted 当 completed。SSE `id` 使用 `<operationId>:<sequence>`，同时返回完整 Event Envelope。

## 4. 持久化模型

建议表：

- `ai_workspace`：owner、name、version、时间。
- `ai_workspace_resource`：资源归属、类型、locator、状态和 checksum。
- `ai_session`：workspace、agent_type、标题。
- `ai_operation`：session、status、phase、last_sequence、retry_of、版本和时间。
- `ai_event`：operation、sequence、event_id、type、schema_version、payload、因果字段；唯一键 `(operation_id, sequence)` 和 event_id。
- `ai_artifact`：workspace、operation、schema、version、status、data locator。
- `ai_command_receipt`：idempotency_key、command_id、结果和过期时间。
- `ai_snapshot`：workspace/operation、through_sequence、schema_version、state、时间。

Flyway 迁移放在 `ruoyi-admin/src/main/resources/db/migration/`，所有实体带 tenant/owner 过滤；payload 大对象和二进制资源使用对象存储 locator，不直接塞数据库。

## 5. 并发与事务

- Command 幂等键在用户/租户作用域唯一。
- Operation 行使用乐观锁；sequence 在同一事务中分配并写 Event。
- 业务状态变化与 Event 追加使用本地事务/outbox，不能先发 SSE 后落库。
- SSE 只广播已提交 Event；重连从数据库补拉。
- Artifact revise 使用 expectedVersion，冲突返回明确错误。

## 6. Workspace 与安全

- 每个 Command、Replay、Snapshot 和 Resource 请求都校验 owner/tenant/workspace 归属。
- Capability/Entitlement 前端结果仅作提示，服务端重新鉴权、扣权益和配额。
- 事件 payload 做字段级脱敏；下载使用短时签名 URL。
- 禁止 Event 返回模型密钥、完整内部 Prompt、隐藏思维链和第三方凭证。
- 清理策略覆盖用户注销、资源删除、Event 保留和审计要求。

## 7. 与 Creation Assistant V2 的关系

可复用思想/基础设施：operationId、sequence、schemaVersion、Event 持久化、Last-Event-ID、重放、取消、恢复调度和幂等。需要统一的差异：Workspace、通用 Command/Event 名称、Artifact 生命周期、Manifest、Schema Registry、因果字段和跨 Agent 模块边界。

建议先做 CA2 Event -> v1 Envelope Adapter 验证协议，不直接把 CA2 表结构改成全平台模型；等 Geo/PPT 验证后再决定抽取公共模块。

## 8. 后端分期

1. 只读 Descriptor 与 v1 Schema 文档。
2. Event Envelope/Replay 兼容层，保留旧接口。
3. Workspace、Operation、Artifact 通用持久化。
4. Geo 新命令接入，新旧接口并行灰度。
5. PPT/CA2 Adapter 接入。
6. 旧流式协议停止新增功能，按调用量下线。

## 9. 后端验收

幂等并发、序列连续、事务后广播、断线补拉、取消竞态、部分成功、跨租户越权、Schema major 拒绝、事件保留和恢复调度必须有集成测试。后端改造正式启动前另写 Java 级文件/方法实施计划，本文件不授权当前修改。
