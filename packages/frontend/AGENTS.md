# Frontend boundary

`packages/frontend` 属于浏览器用户交互世界，只能依赖 `shared` 和被 Manifest 允许的其他前端 Public API。

## Invariants

- Runtime 领域状态只由受信 Event 经过 Reducer 写入。
- 页面和视觉组件不直接解析 SSE，不维护第二事实源。
- Capability 前端只包含 Schema 表单、Renderer 和交互插件。

## Forbidden

- 禁止依赖 `backend`、`infrastructure`、Prisma、BullMQ、OSS 或 Provider SDK。
- 禁止浏览器模块持有后端 Aggregate、Repository 或业务写权限。
- 跨前端模块禁止 deep import；只使用包根 Public API。
