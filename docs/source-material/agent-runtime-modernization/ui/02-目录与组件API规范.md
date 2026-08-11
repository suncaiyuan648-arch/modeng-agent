# taojinshu-ai-ui 目录与组件 API 规范

## 1. 目标目录

```text
src/taojinshu-ai-ui/                     / 通用 AI 视觉组件根目录
├── index.ts                             # 平台无关类型和入口提示
├── contracts/                           / UI props、events、slots 公共契约
│   ├── message-block-renderer.ts        # MessageContentBlock Renderer 契约
│   ├── artifact-renderer.ts             # Artifact RendererDefinition 契约
│   └── component-renderer-registry.ts   # 平台组件 Registry 接口与解析结果
├── web/                                 / Vue Web 组件实现
│   ├── index.ts                         # Web 公开导出
│   ├── chat/                            / Web 聊天滚动容器
│   │   ├── AiChatViewport.vue           # 真实 DOM 滚动和插槽容器
│   │   └── create-web-viewport-port.ts  # DOM ViewportPort 实现
│   ├── message/                         / Web 消息组件
│   │   ├── AiMessageList.vue            # Timeline 列表
│   │   ├── AiMessageBubble.vue          # 角色气泡和操作区
│   │   └── AiMessageBlockRenderer.vue   # MessageContentBlock 本地注册映射
│   ├── composer/                        / Web 输入组件
│   │   ├── AiComposer.vue               # 输入、IME、发送和停止
│   │   └── AiComposerAttachments.vue    # Resource 引用展示
│   └── artifact/                        / Web Artifact 组件
│       ├── AiArtifactCard.vue           # 通用卡片外壳
│       └── UnsupportedArtifact.vue      # 不兼容安全降级
├── uni/                                 / uni-app H5/App/小程序组件
│   ├── index.ts                         # uni 公开导出
│   ├── chat/                            / uni 聊天滚动容器
│   │   └── AiChatViewport.vue           # scroll-view Viewport 实现
│   ├── message/                         / uni 消息列表与气泡
│   │   ├── AiMessageList.vue            # uni Timeline 列表
│   │   └── AiMessageBubble.vue          # uni 消息气泡
│   ├── composer/                        / uni 输入与附件交互
│   │   └── AiComposer.vue               # uni 输入和语音 slot
│   └── artifact/                        / uni Artifact 通用视觉外壳
│       └── AiArtifactCard.vue           # uni Artifact 外壳
└── theme/                               / 视觉 Token 和平台映射
    ├── tokens.scss                      # 颜色、字号、间距和圆角 Token
    └── platform.scss                    # Web rem 与 uni 消费端映射
```

## 2. 关键组件契约

```ts
export interface AiChatViewportProps {
  /** Headless Viewport 状态机及滚动决策入口。 */
  readonly controller: ViewportController;
  /** 当前 Session 的只读有序时间线。 */
  readonly timeline: readonly ConversationTimelineItem[];
}

export interface AiComposerProps {
  /** Headless Composer 状态与输入命令入口。 */
  readonly controller: ComposerController;
  /** 为 true 时禁止编辑、上传和提交。 */
  readonly disabled?: boolean;
  /** 输入区无内容时展示的本地化提示。 */
  readonly placeholder?: string;
}

export interface AiArtifactCardProps {
  /** 已经过 Schema 校验的只读 Artifact 视图。 */
  readonly artifact: ArtifactViewModel;
}

/** 经 SDK Schema 校验并供通用卡片消费的只读 Artifact 视图。 */
export interface ArtifactViewModel {
  /** Artifact 稳定 ID。 */
  readonly id: ArtifactId;
  /** 业务 Schema 名称。 */
  readonly schemaName: string;
  /** 业务 Schema 版本。 */
  readonly schemaVersion: string;
  /** 标题、状态和错误等平台无关 RenderModel。 */
  readonly renderModel: RenderModel;
  /** 当前用户和平台可执行的白名单 Intent。 */
  readonly availableIntents: readonly UiIntent[];
}

/** 平台组件 Renderer 的可信本地定义。 */
export interface RendererDefinition<TModel extends RenderModel = RenderModel> {
  /** 对应的业务 Schema 名称。 */
  readonly schemaName: string;
  /** 支持的 Schema 版本范围。 */
  readonly supportedVersionRange: string;
  /** 仅在本地构建产物中存在的 Vue 组件引用。 */
  readonly component: Component;
  /** 将已校验 RenderModel 转换为组件只读 props。 */
  readonly mapProps: (model: TModel) => Readonly<Record<string, unknown>>;
}

export interface AiArtifactCardEmits {
  /** 将用户选择的受信任 Intent 交给 Application 执行。 */
  (event: 'intent', intent: UiIntent): void;
}
```

关键 slots 也必须形成公开类型：`message`、`message-actions`、`composer-prefix`、
`composer-tools`、`voice-input`、`artifact-content` 和 `artifact-actions`。未声明 slot 不进入稳定 API。

Vue 组件源码必须完整注释 props、emits、slots、公开方法和平台限制。组件不得把 Controller state 复制为第二份可写业务状态。

## 3. 命名和导出

- 通用 Vue 组件使用 `Ai` 前缀和 PascalCase。
- Web/uni 使用不同入口，禁止根入口同时打包两个平台实现。
- Agent Renderer 通过 RendererDefinition 注册，不从 UI 根入口导出。
- `ComponentRendererRegistry` 由 UI contracts 定义、Application 创建和注册；SDK 不知道组件。
- 内部 DOM helper 不进入公开 exports。
