# Contributing

所有贡献——人工或 AI 生成——都遵循 [AGENTS.md](./AGENTS.md)、[V2.5 Architecture Baseline](./React-Node-全栈Agent架构规范.md) 和 [AI 工程治理规范](./AI工程治理与Work-Package规范.md)。不存在独立的“AI 规则”和“人类规则”。

## 开始前

1. 创建或领取一个范围明确的 Work Package。
2. 阅读根 `AGENTS.md` 与目标目录最近的 `AGENTS.md`。
3. 阅读目标模块 Manifest、README、Public Contract 和相关测试。
4. 确认改动属于 GREEN；YELLOW 需要 Work Package 明确授权；RED 需要批准的 Contract Change Proposal/ADR。

## 实施原则

- 不扩大任务范围或进行无关重构。
- 不 deep import、不跨模块写表、不绕过 Public Port。
- 不直接从 Capability/API/Worker 使用 Prisma、BullMQ 或 Provider SDK。
- 新行为必须有测试；关键路径验证 invariant、幂等、并发、失败和恢复，而不是只追求 Coverage。
- Migration 遵循 Expand → Migrate → Contract，并保持滚动发布 N/N-1 兼容。

## 提交前

Monorepo 验证脚本存在后，根据影响范围运行：

```text
pnpm verify:changed
pnpm architecture:check
pnpm verify:module <module>
```

涉及配置、Provider、部署或日志时，额外运行：

```text
pnpm security:scan:staged
```

真实 API Key、密码、Token、私钥和连接串不得进入仓库。请先阅读[密钥与 API Key 保护规范](./docs/security/secrets-management.md)。

高风险或全仓变更运行 `pnpm verify`。WP-000 已提供这些脚本；如果环境故障导致命令未执行，必须在 PR 中记录原因，不能把未运行写成成功证据。

架构或 Public Contract 变化还必须包含：

- 批准的 CR/ADR 引用。
- 更新后的 Schema、Fixture 与 Conformance Suite。
- Migration/rollout/rollback 说明。

任何必需 CI 未通过时，PR 不视为完成。可选 AI Architecture Review 只提供额外判断，不能替代 CI 和行为测试。
