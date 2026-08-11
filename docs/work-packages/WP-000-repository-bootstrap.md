# WP-000：Repository Bootstrap

## Metadata

- Owner：Repository Bootstrap
- Reviewer：Architecture Review
- Target module：Repository / Composition Roots
- Related requirement：Bootstrap / Phase 0
- Architecture baseline：1.0 / V2.5
- Contract change：forbidden
- ADR change：forbidden
- Migration change：forbidden
- Status：COMPLETED

## Goal

建立可安装、可构建、可测试、可执行架构检查的 pnpm Monorepo 工程骨架，使 `pnpm verify` 在不包含 Agent 业务的前提下全绿。

## Non-goals

- 不实现 TALK、SUMMARY、IMAGE、VIDEO 或 AUDIO。
- 不创建 Provider Adapter、数据库业务表、Prisma Migration、BullMQ Consumer 或 OSS 调用。
- 不实现 Campaign、Search、Publish、Monitoring 或通用 Workflow DSL。
- 不冻结 WP-002 才负责的业务 Contract。
- 不用空命令或永远返回成功的检查器伪造门禁。

## Allowed write paths

- `apps/**`
- `packages/**`
- `scripts/**`
- `tests/**`
- `deploy/**`
- `prisma/**`
- `.github/workflows/**`
- 根工程配置文件
- `docs/architecture/**`
- `docs/governance/**`
- `docs/work-packages/WP-000-repository-bootstrap.md`
- `docs/future/**` 与 `docs/source-material/**` 的状态/归档入口
- `AGENTS.md`、`CONTRIBUTING.md` 与 PR 模板

## Read-only paths

- `React-Node-全栈Agent架构规范.md`，仅允许修正文档路径和物理目录映射。
- `AI工程治理与Work-Package规范.md`，仅允许修正文档路径。
- `docs/source-material/agent-runtime-modernization/**`，除顶层状态声明外只读。

## Forbidden actions

- 跨模块 deep import。
- 在 Capability/API/Worker 直接访问 Prisma、BullMQ 或 Provider SDK。
- 新增业务状态机、业务表或真实外部副作用。
- 修改一级模块、Owner、Public Contract 或协议版本。
- 为了通过验证而关闭 TypeScript strict、忽略 Lint 错误或创建无效检查器。

## Public dependencies

- 无业务 Public Port；仅使用 Node、React、Vite、NestJS 和工程工具链。

## Input / Output

- Input：冻结架构 V2.5 与仓库治理规范。
- Output：Web/API/Worker 最小入口、按 shared/frontend/backend/infrastructure 分组的空模块包、Manifest、CI 和验证脚本。
- Errors：`ARCH_*`、`SCHEMA_*`、`TEST_*` 工程诊断。

## Invariants

- 每个应用和 Package 工作区都拥有 Manifest、局部 AGENTS 和唯一包名。
- `packages` 的 Runtime Boundary 由 shared/frontend/backend/infrastructure 目录和分层 AGENTS 共同表达。
- 所有包默认只从根入口导出，禁止跨模块 `internal/**` 导入。
- `pnpm verify` 必须真实串联 Format、Lint、Typecheck、Test、Architecture Check 与 Build。
- 历史资料和未来讨论不会进入当前实现输入。

## Acceptance criteria

1. `pnpm install --frozen-lockfile` 可重复安装。
2. React + TypeScript + Vite + Zustand + Tailwind Web 最小页面可构建。
3. NestJS API 和独立 Node Worker 最小入口可构建。
4. 所有规划模块拥有空包边界，但不包含业务实现。
5. Manifest Schema 校验、Public API 检查和基础依赖检查真实运行。
6. CI 执行 `pnpm verify`。
7. `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm architecture:check`、`pnpm verify` 全绿。

## Required verification

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm architecture:check`
- `pnpm build`
- `pnpm verify`

## Data / rollout / rollback

- Feature flag：none
- Migration：none
- External side effects：仅安装 npm 依赖；不启动或连接外部服务。
- Rollback：移除 WP-000 新增工程骨架，文档冻结结构可独立保留。

## Delivery evidence

- 修改文件：根工具链；`apps/web|api|worker`；39 个分层 Package 骨架；四层 AGENTS；Manifest/架构脚本；CI、Deploy、Prisma 占位和开工冻结文档。
- 实际命令与结果：`pnpm install --frozen-lockfile`、`pnpm verify`、`pnpm verify:changed`、`pnpm verify:module backend-task-engine` 均成功；42 个 Manifest 通过；3 个测试文件/3 个测试通过；42 个工作区 typecheck/build 通过。
- 未验证项：GitHub Actions 尚未在远端运行；仓库尚无基线 commit，因此 Contract Change 检查明确跳过 Git diff 阶段。
- 剩余风险：WP-001 尚未加入故意违规 Fixture，当前门禁只验证正向骨架。
