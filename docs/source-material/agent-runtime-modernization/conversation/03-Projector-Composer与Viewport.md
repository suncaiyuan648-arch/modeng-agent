# ConversationProjector、Composer 与 Viewport

## 1. ConversationProjector

输入为同一时点的 ReadonlyRuntimeState 和 SessionId，输出有序 Timeline。稳定排序键为 `occurredAt -> operationId -> sourceSequence -> entityId`，实时消费和 replay 后必须一致。

```text
message reference
tool-call reference
artifact reference
```

Projector 不修改 RuntimeState，不读取 Router、DOM 或旧 Chat Store。

## 2. Composer

ComposerState 只保存 text、resourceIds、isComposing、submitStatus 和 validationErrors。模型、Agent 和 Tool 选择以已校验 ExecutionOptions 传入，具体选择器位于 UI/Application。

提交规则：IME composition 中禁止提交；重复提交拒绝；Command accepted 不等于 Operation completed；失败保留草稿；停止发送 cancel Command，不能直接修改 Operation status。

## 3. Viewport

```ts
export type ViewportMode = 'following' | 'detached' | 'restoring' | 'loading_history';
```

- following：Timeline 增长时跟随底部。
- detached：用户上滑，累计 unseenItemCount。
- restoring：会话/页面恢复滚动锚点。
- loading_history：前插历史并保持 anchorOffset。

键盘 resize、内容图片加载和历史前插都通过 ViewportPort 测量，不能用固定 350ms 定时器代表完成。

## 4. Presentation Scheduler

Agent Runtime 仍逐事件归约。Conversation Scheduler 只合并 UI listener 通知，Web 可注入 requestAnimationFrame，测试使用同步 Fake，App 后台可暂停展示调度。它不丢弃事实事件，也不维护 sequence。
