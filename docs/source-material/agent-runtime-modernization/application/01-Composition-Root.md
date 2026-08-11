# ai-application Composition Root

## 1. 职责

- 按 owner + workspace 创建并缓存 AiWorkspaceApplication/AgentRuntime。
- 为 Session 创建 ConversationController。
- 选择 Web/uni Transport、Persistence 和 PlatformPort。
- 注册 AgentDefinition、Schema、Renderer 和 IntentExecutor。
- 读取 owner/token/entitlement/Feature Flag。
- 在退出登录、切换 owner 和应用卸载时按顺序 dispose。

## 2. 页面公开门面

```ts
/** 管理当前身份对应的应用门面，并在身份变化时原子切换 owner context。 */
export interface AiApplicationManager {
  /** 返回当前 owner 的应用门面；身份尚未就绪时等待 Provider 完成。 */
  getCurrentApplication(): Promise<AiApplication>;
  /** 订阅 owner context 切换；页面通常通过 Vue bridge 使用。 */
  subscribe(listener: AiApplicationListener): Unsubscribe;
  /** 销毁全部 owner/workspace context 和身份订阅。 */
  dispose(): Promise<void>;
}

export interface AiApplication {
  /** 取得或延迟创建当前 owner 的 Workspace context。 */
  getWorkspace(workspaceId: WorkspaceId): Promise<AiWorkspaceApplication>;
  /** 在指定 Workspace/Session 取得唯一 ConversationController。 */
  getConversation(workspaceId: WorkspaceId, sessionId: SessionId): Promise<ConversationController>;
  /** 在指定 Workspace 取得已注册 Agent 的业务门面。 */
  getAgent<TFacade>(workspaceId: WorkspaceId, agentType: string): Promise<TFacade>;
  /** 在可信上下文中验证并执行 UI Intent。 */
  executeIntent(intent: UiIntent, context: IntentContext): Promise<void>;
  /** 销毁当前 owner 的所有 Workspace context；退出登录时调用。 */
  dispose(): Promise<void>;
}

export interface IntentContext {
  /** Intent 所属 owner，必须等于当前 Application owner。 */
  readonly ownerId: string;
  /** Intent 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Intent 来源 Operation；非 Operation Intent 时为 null。 */
  readonly operationId: OperationId | null;
  /** Intent 来源 Artifact；非 Artifact Intent 时为 null。 */
  readonly artifactId: ArtifactId | null;
}
```

页面的 `useAiApplication()` 返回当前 owner 的 `AiApplication`，因此页面只传 workspaceId/sessionId，
不得自行构造或传入 ownerId。只有 Manager 和恢复/清理内部 API 能看到 ownerId。

实际源码必须完整注释方法的缓存、生命周期、错误和授权语义。

## 3. 禁止事项

- 页面直接调用 `createAgentRuntime()`。
- 页面选择 Legacy/v1 Adapter。
- 页面注册远程组件或直接读取 EventRepository。
- Application 把 token、Router 或 Pinia 注入 SDK Core。
- Feature Flag 绕过服务端 Authorization。

## 4. Adapter 冻结

每个 Operation 创建时记录 adapterKind；运行中 Feature Flag 改变不切换 Adapter。回滚只影响新 Operation，旧 Operation 保留恢复和只读展示能力。

## 5. Bootstrap 与注入

Application 使用 Vue Plugin/InjectionKey 注入，不能由页面、Layout 或每个 Router View 重复创建：

```text
main.ts
  app.use(store)
  -> 从 user store 创建 OwnerIdentityProvider 和动态 TokenProvider
  -> 注入 LegacyGeoResearchPort 等旧实现端口
  -> createAiApplicationManager(config)
  -> app.provide(AI_APPLICATION_MANAGER_KEY, manager)
  -> app.use(router)
  -> app.mount()
```

Manager 在页面请求 Workspace 时延迟恢复对应 Runtime；`getConversation()` 必须等待 Workspace context
完成本地恢复后再返回 Controller。owner 变化由 Manager 订阅身份 Provider，按 stop -> flush -> dispose ->
clear memory -> recreate 顺序执行。token 刷新只更新 TokenProvider，不销毁 owner Namespace。

## 6. Legacy Port

```ts
/** 当前 Geo 页面 Store 能力的反向依赖端口，由最外层 bootstrap 注入。 */
export interface LegacyGeoResearchPort {
  /** 使用当前 Legacy 实现启动研究；不承诺服务端取消或进行中恢复。 */
  start(input: GeoResearchInput): Promise<LegacyGeoResearchResult>;
  /** 读取已由当前页面缓存落地的结果；不存在时返回 null。 */
  loadCompleted(): Promise<LegacyGeoResearchResult | null>;
}
```

Application 只依赖该端口，不 import 页面 Store。Legacy 实现文件保留在现有 Geo 页面边界，bootstrap
将实例注入；迁移完成后删除端口实现，不影响 Agent Facade。
