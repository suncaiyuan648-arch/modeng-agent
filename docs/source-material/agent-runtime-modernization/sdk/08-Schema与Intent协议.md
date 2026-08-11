# SDK Schema、Render Contract 与 UI Intent 协议

## 1. 本文件边界

SDK 只定义可验证的数据协议、可信 Registry、平台无关 RenderModel 和 Intent 安全规则；它不实现 Vue 组件、DOM 渲染、Web/uni 布局或具体业务卡片。

视觉实现统一归 [taojinshu-ai-ui](../ui/README.md)，Geo 业务 Schema 与 Renderer 注册统一归
[Geo Agent](../agents/geo-ad/README.md)。

## 2. Schema Registry

Registry 至少覆盖：

```text
SchemaRegistry
  ├─ command  / 校验 User Command payload
  ├─ event    / 校验 Event payload
  └─ artifact / 校验业务 Artifact data
```

```ts
/** 版本化 Schema 的稳定元数据。 */
export interface SchemaMetadata {
  /** 全局稳定名称，例如 geo.research-report。 */
  readonly name: string;
  /** 遵循 SemVer 的完整版本。 */
  readonly version: string;
  /** 当前定义可以读取或通过纯函数迁移的版本范围。 */
  readonly compatibleWith: readonly string[];
  /** 是否已弃用；弃用版本仍需按兼容策略读取。 */
  readonly deprecated: boolean;
  /** Artifact data 允许进入本地持久化的最大范围。 */
  readonly persistence: 'full' | 'metadata-only' | 'none';
}
```

约束：

- 同名同版本只能注册一次，重复注册立即失败。
- major 不兼容不得自动迁移或透传原始数据。
- 迁移函数必须是纯函数，并具有输入、输出和拒绝路径 Fixture。
- 所有外部数据从 `unknown` 解码，禁止用类型断言跳过校验。
- 服务端 Descriptor 只能声明 Schema 名称与版本，不能注册前端实现。

## 3. RenderSchema 与 RenderModel

后端或 Legacy Adapter 只产生业务 Schema：

```json
{
  "schemaName": "geo.research-report",
  "schemaVersion": "1.0.0",
  "data": {},
  "intents": [
    { "type": "artifact.download", "payload": { "artifactId": "art_123" } }
  ]
}
```

SDK 内的安全解析链路固定为：

```text
unknown input
  -> SchemaRegistry.parse
  -> version compatibility / migration
  -> capability and authorization precheck
  -> platform-neutral RenderModel
  -> UI RendererRegistry
  -> Web 或 uni 组件
```

SDK 只负责到 `RenderModel`；`UI RendererRegistry -> 组件` 属于 UI 模块。禁止协议出现：

```json
{ "component": "GeoResearchCard.vue" }
{ "componentPath": "https://example.com/remote.js" }
{ "html": "<script>...</script>" }
{ "onClick": "eval(...)" }
```

## 4. UI Intent

UI Intent 表达“允许用户请求什么”，不携带函数、组件或可执行代码。v1 白名单包括：

- `operation.cancel`
- `operation.retry`
- `operation.user-input.submit`
- `artifact.download`
- `artifact.preview`
- `artifact.revise`
- `artifact.archive`
- `workspace.resource.open`
- `navigation.open-internal`

Intent 解析器必须按以下顺序工作：

1. 校验 Intent 类型与 payload Schema。
2. 确认 Intent 由当前 Operation 或 Artifact ViewModel 声明。
3. 求 Platform Capability、Agent Capability、Entitlement 与 Authorization Precheck 的交集。
4. 对资源 ID、内部路由名和可下载资源做白名单校验。
5. 输出 User Command 或抽象的 Platform Action。
6. 记录 correlationId，并对用户输入与资源定位信息脱敏。

`navigation.open-external` 不进入 v1。未来如开放，必须新增 ADR、域名 allowlist 和用户确认流程。

## 5. Capability 与 Feature Flag

启用顺序固定为：

```text
feature enabled
  -> platform capability supported
  -> local AgentDefinition supported
  -> entitlement available
  -> authorization precheck allowed
```

Feature Flag 只控制灰度，不能授予权限；前端 Precheck 只控制展示和提前提示，服务端仍是最终授权者。任何 Flag 都不能允许未注册 Schema、危险 URL 或原始 HTML 进入 UI。

## 6. 安全降级契约

SDK 解析失败时返回稳定错误类别，不返回未经验证的 `data`：

- `SCHEMA_UNKNOWN`：本地未注册。
- `SCHEMA_VERSION_INCOMPATIBLE`：major 不兼容。
- `SCHEMA_VALIDATION_FAILED`：字段或业务约束非法。
- `INTENT_UNKNOWN`：Intent 不在白名单。
- `INTENT_NOT_DECLARED`：当前实体未声明该动作。
- `INTENT_FORBIDDEN`：能力、权益或授权前置检查失败。

UI 根据这些错误展示 `UnsupportedArtifact`、升级提示或权限提示，但不得打印原始 JSON，也不得自行放宽验证。

## 7. Manifest 交集

Agent 可用性由以下交集决定：

```text
Server AgentDescriptorDTO
  ∩ Local AgentDefinition
  ∩ Platform Capabilities
  ∩ User Entitlements
  ∩ Authorization Precheck
  = Enabled Agent
```

失败原因必须可诊断：`disabled`、`protocol-incompatible`、`manifest-incompatible`、`missing-schema`、`platform-unsupported`、`entitlement-required`、`authorization-denied`。

## 8. SDK 测试门禁

- Schema：有效 Fixture、缺字段、未知字段策略、非法枚举、版本迁移、major 拒绝。
- Registry：重复注册、未注册查询、弃用版本、迁移失败。
- Intent：伪造类型、越权 Artifact、危险资源、重复执行的幂等语义。
- Manifest：服务端与本地交集的全部失败原因。
- 安全：跨 owner 资源引用、定位信息泄漏、日志脱敏、未校验数据不可达。

组件、可访问性和跨端视觉测试归 [UI 测试规范](../ui/05-组件测试与视觉验收.md)。
