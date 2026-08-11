# SDK Platform Ports

## 1. 设计原则

Core 不访问 `window`、DOM、fetch、File、Blob、localStorage 或全局 `uni`。Web/uni 只是端口实现，不能改变 Command/Event、Reducer 和 Recovery 语义。

## 2. 端口分类

```text
ports/transport.ts                       / 命令发送、实时订阅、补拉和连接关闭
ports/persistence.ts                     / Event/Snapshot 正确性存储
ports/clock.ts                           / 可测试时间来源
ports/id-generator.ts                    / 可测试 ID 来源
ports/logger.ts                          / 结构化日志与 trace
ports/platform.ts                        / 文件、网络、生命周期和能力探测
```

## 3. Web Adapter

- 实时首选 fetch ReadableStream/SSE。
- Safari/iOS 12 等能力不足目标必须通过 Capability 探测选择 XHR/SSE polyfill 或 polling，不得假设 ReadableStream、AbortController、BroadcastChannel 和 storage estimate 存在。
- 断线使用 `afterSequence` replay。
- IndexedDB 为持久化首选，内存为显式降级。
- File/Blob/ObjectURL 只能存在于 WebPlatform 实现和 UI，不进入 Core State。

## 4. Uni Adapter

- 接收 `UniApiLike` 注入，不直接引用全局 `uni`。
- 支持 `uni.request` chunk；不支持时使用 afterSequence 轮询。
- H5、App、微信小程序必须通过相同 Transport/Persistence conformance。
- App 前后台、临时文件和存储配额由 UniPlatform 处理。

## 5. Transport 不变量

- `close()` 只关闭本地连接，不等价于取消 Operation。
- 网络重试复用 commandId/idempotencyKey。
- Abort 后不再推送 Event。
- 一个 chunk 多事件、一个事件跨 chunk 和 UTF-8 跨 chunk 均可解码。
- SSE id 只用于传输恢复，领域去重仍使用 operationId、sequence、eventId。

## 6. 浏览器最低能力矩阵

当前构建目标包含 Safari/iOS 12，因此 WP0A 必须冻结并测试：

| 能力 | 首选 | 降级 |
| --- | --- | --- |
| 流式读取 | fetch ReadableStream | EventSource/XHR 分块或 afterSequence polling |
| 取消 | AbortController | 关闭本地连接；不宣称服务端取消 |
| 随机 ID | crypto.randomUUID | 注入的 UUID 实现 |
| 多 Tab 通知 | BroadcastChannel | storage event + 带 TTL 恢复锁 |
| 存储配额 | navigator.storage.estimate | 写入失败驱动的逐级淘汰 |
| IndexedDB | 原生 IndexedDB | memory-only，并关闭恢复承诺 |

Capability 探测必须基于 API 存在性和一次最小行为测试，不能只解析 User-Agent。
