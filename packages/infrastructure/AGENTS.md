# Infrastructure boundary

`packages/infrastructure` 实现后端模块声明的技术 Port，并由 `apps/api` 或 `apps/worker` 完成装配。

## Allowed dependencies

- 可以依赖 `shared` 与对应 `backend` Public Port。
- 只有本层可以封装 Prisma、BullMQ、Redis、OSS 和具体外部 SDK。

## Forbidden

- 不定义 Billing、Task、Model、Project、Capability 等产品业务策略。
- 不成为跨模块状态 Owner，不绕过后端 invariant。
- Adapter 之间不通过 deep import 共享实现。
