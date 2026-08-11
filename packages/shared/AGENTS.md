# Shared boundary

`packages/shared` 只保存极少量真正跨 Runtime 的稳定语义。

## Allowed dependencies

- Shared 模块只能依赖其他明确允许的 Shared Public API。
- `contracts` 保存跨网络运行时 Schema 与由其推导的 TypeScript 类型。
- `domain-kernel` 只保存极小后端基础语义；不得让前端依赖后端 Aggregate。

## Forbidden

- 不放 Service、Repository、Provider、React 组件或产品业务策略。
- 不创建 `common.ts`、`utils.ts`、`helpers.ts` 垃圾桶。
- 不依赖 `frontend`、`backend` 或 `infrastructure`。
