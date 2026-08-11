# Backend boundary

`packages/backend` 保存后端业务权威和 Deep Modules，可依赖 `shared` 与 Manifest 明确允许的后端 Public Port。

## Invariants

- 每份状态和每张业务表只有一个 Writer Owner。
- 对外部系统的需求通过 Port 表达，由 Composition Root 注入 Adapter。
- Capability Handler 只组合 Public Port，不拥有队列、存储、供应或计费基础设施。

## Forbidden

- 禁止依赖 `frontend`、React、DOM 或浏览器 API。
- 禁止直接依赖 `infrastructure`、Prisma、BullMQ、OSS 或具体 Provider SDK。
- 禁止跨模块写表和 deep import。
