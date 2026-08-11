# WP-001：Architecture Guard

## Metadata

- Owner：Repository Governance / Architecture
- Reviewer：Architecture Review
- Target module：Repository checks and architecture fixtures
- Architecture baseline：`bootstrap-v0.1.0`
- Contract change：forbidden unless a fixture proves the CCR exception path
- ADR change：forbidden
- Migration change：forbidden
- Status：COMPLETED

## Goal

证明现有 Repository Constitution、Module Manifest 和架构检查不仅能让合法骨架通过，也能稳定拒绝违反 Deep Module 边界的代码，并为每类拒绝提供稳定的 `ARCHxxx` 诊断码。

## Non-goals

- 不实现 TALK、SUMMARY、IMAGE、VIDEO 或 AUDIO 业务。
- 不创建 Prisma 业务表，不实现 BullMQ Consumer，不接入真实 Provider。
- 不改变一级模块、Owner、状态机或运行时 Contract。

## Allowed write paths

- `scripts/architecture-guard.mjs`
- `scripts/check-architecture-fixtures.mjs`
- `scripts/check-boundaries.mjs`
- `scripts/check-public-api.mjs`
- `scripts/check-contract-changes.mjs`
- `scripts/check-architecture.mjs`
- `tests/architecture-fixtures/**`
- `docs/governance/architecture-error-codes.md`
- `docs/architecture/01-跨模块契约与架构决策.md`
- `docs/roadmap/IMPLEMENTATION.md`
- `.github/workflows/ci.yml`
- `package.json`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `README.md`
- `docs/work-packages/WP-001-architecture-guard.md`

## Invariants

- 每个 invalid fixture 必须断言一个明确的 `ARCHxxx` 错误码。
- 合法 fixture 和真实 42 个 Workspace 必须继续通过架构检查。
- Manifest 与实际 source/package dependency 不一致时必须失败，不能通过扩大 `allowedDependencies` 静默放行。
- Frozen Contract 变化必须有合法 `CCR-####.md`；Manifest 变化必须有 Work Package 或 ADR 评审证据。
- 负向 Fixture 不进入 `apps/` 或 `packages/`，不污染生产构建。

## Acceptance criteria

1. 覆盖前后端边界、Backend → Infrastructure、Capability 基础设施泄漏、deep import、非法依赖、循环依赖、Public Export、Manifest mismatch、Contract diff 和 CCR 例外。
2. `pnpm architecture:fixtures` 报告合法与非法 Fixture 数量，并在预期码不匹配时失败。
3. `pnpm architecture:check` 聚合 Manifest、Boundary、Public API、Contract Diff 和 Fixture 五类检查。
4. `pnpm verify`、CI 和基线 `bootstrap-v0.1.0` 检查继续通过。

## Verification

- `pnpm architecture:fixtures`
- `pnpm architecture:check`
- `pnpm verify`

## Delivery evidence

- 当前分支：`wp/001-architecture-guard`
- 基线：`bootstrap-v0.1.0`
- 真实仓库：42 个 Manifest、42 个 Workspace 继续通过。
- Fixture：5 个 valid、15 个 invalid，均断言具体错误码。
