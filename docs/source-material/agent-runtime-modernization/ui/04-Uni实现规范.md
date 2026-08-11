# taojinshu-ai-ui Uni-app 实现规范

## 1. 复用边界

uni 与 Web 共用 ConversationViewModel、Controller、UiIntent、Artifact Schema 和语义 Fixture，不复用 DOM ViewportPort、Web BubbleList 和浏览器文件对象。

## 2. 平台实现

- ChatViewport 使用 scroll-view/平台滚动 API。
- Composer 使用 uni 输入事件，并处理 App/小程序键盘高度。
- 文件、图片和语音通过 Application 注入的平台 Picker。
- iOS 安全区、Android 返回键和 App 前后台需要独立处理。
- H5/App/微信小程序都必须具备 polling 回退后的 UI 状态。

## 3. Renderer

业务 Schema 使用独立 uni Renderer；例如 Web PPT iframe 和 uni web-view 可以不同，但必须产生相同 title/status/intents 语义。未知 Schema 使用 UnsupportedArtifact，不打印原始 JSON。

## 4. 构建入口

```text
@taojinshu/ai-ui/uni                   / uni 组件入口
@taojinshu/ai-sdk/platform-uni         / Transport/Persistence 入口
@taojinshu/ai-conversation             / Headless 交互入口
```

真机适配完成必须同时具有 H5、App、微信小程序构建证据和设备矩阵，Mock 单测不能代替真机验收。
