# WP-000：Secret Protection Baseline

## Metadata

- Owner：Platform Core / Repository Governance
- Reviewer：Architecture Review
- Target module：Repository / Platform Core / Deploy
- Architecture baseline：1.0 / V2.5
- Contract change：forbidden
- ADR change：forbidden
- Migration change：none
- Status：COMPLETED

## Goal

建立 API Key、密码、Token、私钥和连接串的仓库级保护基线，避免凭据进入 Git、前端构建产物、CI 日志和公开运行事件。

## Non-goals

- 不接入真实 Provider 或生产 Secret Manager。
- 不实现 Model Supply、Credential 数据模型或业务 API。
- 不替代 GitHub Secret scanning、云平台审计或 Provider 轮换流程。

## Allowed write paths

- `.gitignore`
- `.env.example`
- `.github/workflows/**`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `README.md`
- `deploy/**`
- `docs/security/**`
- `docs/work-packages/WP-000-security-baseline.md`
- `package.json`
- `scripts/**`
- `tests/security/**`
- `vitest.config.ts`

## Invariants

- 真实凭据不能进入 tracked、staged 或 unignored 文件。
- 前端 `VITE_*` 配置不承载 Secret；Provider 凭据只由后端运行时注入。
- Compose 不再为数据库或 Redis 提供可误用于共享环境的默认密码，并仅绑定本机回环地址。
- 安全扫描失败时，`pnpm verify` 与 CI 必须失败。

## Acceptance criteria

1. `.gitignore` 覆盖本地环境文件、私钥、凭据文件和 Secret 目录，并保留无敏感值的样例文件。
2. `deploy/docker-compose.yml` 对数据库/Redis 密码 fail fast，并绑定 `127.0.0.1`。
3. 提供 `pnpm security:scan`、`pnpm security:scan:staged` 和安全随机值生成命令。
4. CI 与 `pnpm verify` 执行密钥扫描；扫描器有真实凭据特征和占位符回归测试。
5. 文档明确本地、CI、生产、日志、轮换和泄露处置边界。

## Verification

- `pnpm verify`：通过。
- `pnpm security:scan`：通过。
- `pnpm security:scan:staged`：通过。
- `docker compose -f deploy/docker-compose.yml config --quiet`（使用仅用于校验的临时值）：通过。

## Delivery evidence

- Public Contract：未改变。
- Owner、Manifest、Migration、Feature Flag：未改变。
- 运行时副作用：无；仅加强配置校验、扫描和文档约束。
- 剩余风险：GitHub Secret scanning / Push protection 需要在仓库 Settings 中启用；生产 Secret Manager 尚未接入。
