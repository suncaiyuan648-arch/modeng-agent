# taojinshu-ai-ui Web 实现规范

## 1. ChatViewport

- 每个 Timeline 节点使用稳定 `data-timeline-id`。
- following 时新内容才自动跟随；detached 时显示“查看最新”。
- 历史前插前记录 anchor top，渲染后恢复差值。
- 图片/Artifact 尺寸变化通过 ResizeObserver/ViewportPort 通知。
- `visualViewport` 处理移动端键盘，缺失时使用 resize 回退。
- 不使用固定延时代表 DOM 已稳定。

## 2. Message

MessageBubble 不继承第三方 BubbleProps，不接受旧 `MessageItem`。MessageBlockRenderer 只处理统一
`MessageContentBlock`：text、reasoning-summary、resource-reference、tool-call-reference、
artifact-reference、citation-group 和 unknown-safe-fallback。

Markdown 默认禁止原始 HTML；链接、图片、文件通过安全协议和 ResourceResolver。复制、反馈和重试转为 Intent/Command，不直接改消息。

## 3. Composer

- compositionstart/end 同步到 ComposerController。
- Enter/Cmd+Enter 策略可配置，IME 中不得发送。
- 粘贴/拖拽先由 ResourcePicker 上传，UI 只 attach ResourceId。
- loading 展示停止入口；停止发送 cancel Command。
- PC/mobile 差异通过布局和 slot，不复制业务逻辑。

## 4. 样式

遵守当前仓库规范：语义化 class、SCSS 中 `@apply`、单位 rem、移动端安全区、禁止静态内联 style。UI Token 不包含 Geo/PPT 品牌业务色。

## 5. 可访问性

Timeline 使用合适的 live region，流式增量避免每 token 重复播报；按钮具备可读标签；键盘可到达消息操作和“查看最新”；颜色状态不能作为唯一信息来源。
