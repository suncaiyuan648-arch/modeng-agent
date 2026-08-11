# taojinshu-ai-conversation 目录与公共 API 规范

## 1. 目标目录

```text
src/taojinshu-ai-conversation/           / 无视觉聊天交互模块根目录
├── index.ts                             # 稳定公共导出
├── conversation/                        / Session、Timeline 和投影协调
│   ├── conversation-view-model.ts       # ConversationViewModel 与 TimelineItem
│   ├── conversation-projector.ts        # RuntimeState 到 Timeline 的纯投影
│   └── conversation-controller.ts       # 订阅、投影和子 Controller 编排
├── message/                             / 消息展示交互状态
│   ├── message-view-state.ts            # 展开、已读、选择和动画状态
│   └── message-interaction.ts           # 复制、反馈、重试 Intent 构造
├── composer/                            / 输入状态和提交控制
│   ├── composer-state.ts                # 文本、Resource、IME 和提交状态
│   ├── composer-policy.ts               # 长度、附件和 Capability 校验
│   └── composer-controller.ts           # 草稿、提交、停止和重置
├── viewport/                            / 滚动状态机和平台端口
│   ├── viewport-state.ts                # following 等稳定状态
│   ├── viewport-port.ts                 # 测量、滚动和锚点操作接口
│   └── viewport-controller.ts           # 状态转移和滚动决策
├── presentation-stream/                 / 高频状态的展示调度
│   └── presentation-scheduler.ts         # 批量通知，不解析网络流
├── draft/                               / Session 草稿端口
│   └── draft-repository.ts              # 草稿读、写和删除
├── ports/                               / Clipboard 等其他交互端口
│   └── clipboard-port.ts                # 平台无关复制接口
└── testing/                             / Fake、Fixture 和 conformance
    ├── fixtures.ts                      # Timeline/Composer/Viewport Fixture
    └── conformance.ts                   # Port 一致性测试套件
```

## 2. 公共 API

```ts
export interface ConversationController {
  /** 返回当前 Session 的只读时间线和交互视图。 */
  getView(): Readonly<ConversationViewModel>;
  /** 订阅 Conversation 投影变化，并返回幂等取消函数。 */
  subscribe(listener: ConversationViewListener): Unsubscribe;
  /** 当前 Conversation 独占的输入控制器。 */
  readonly composer: ComposerController;
  /** 当前 Conversation 独占的滚动决策控制器。 */
  readonly viewport: ViewportController;
  /** 取消 Runtime 订阅和展示调度；不销毁共享 Runtime。 */
  dispose(): void;
}

export interface ComposerController {
  /** 返回文本、资源引用、IME 和提交状态的只读快照。 */
  getState(): Readonly<ComposerState>;
  /** 更新草稿文本；不会提交 User Command。 */
  setText(text: string): void;
  /** 标记输入法组合状态，组合期间提交策略必须拒绝发送。 */
  setComposing(value: boolean): void;
  /** 附加已经由 Application 上传并登记的 Resource 引用。 */
  attachResource(resourceId: ResourceId): void;
  /** 从当前草稿移除 Resource 引用，不删除远端资源。 */
  removeResource(resourceId: ResourceId): void;
  /** 校验草稿并发送消息命令；回执只表示命令被接收。 */
  submit(): Promise<CommandReceipt>;
  /** 请求取消当前可停止 Operation；最终状态以 cancelled Event 为准。 */
  stop(): Promise<CommandReceipt>;
  /** 从 DraftRepository 恢复当前 Session 草稿。 */
  restoreDraft(): Promise<void>;
}

export interface ViewportController {
  /** 返回滚动模式、未读数量和恢复锚点的只读状态。 */
  getState(): Readonly<ChatViewportState>;
  /** 根据平台测量快照处理用户主动滚动，不直接访问 DOM。 */
  userScrolled(snapshot: ViewportMeasurement): void;
  /** 处理时间线追加、前插或尺寸变化并请求平台 Port 执行滚动。 */
  timelineChanged(change: TimelineChange): Promise<void>;
  /** 清除未读并请求滚动至最新内容。 */
  showLatest(): Promise<void>;
  /** 取消测量和调度资源；允许重复调用。 */
  dispose(): void;
}
```

实际源码必须为每个文件、接口、字段和方法添加完整中文 TSDoc，说明状态语义、平台副作用和错误行为。

## 3. 导出规则

- 页面和 UI 只从根 `index.ts` 导入。
- `testing` 使用独立入口，生产入口不导出 Fake。
- Projector 可以公开；内部 scheduler implementation 不公开。
- 禁止导出 Vue ref、HTMLElement 或平台对象。
