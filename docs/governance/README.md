# Governance templates

本目录提供可复制模板；规则真源是 [AI 工程治理与 Work Package 规范](../../AI工程治理与Work-Package规范.md)。模板与规则冲突时，先修正规则/模板一致性，不允许实现者自行选择更方便的一份。

- [模块 AGENTS 模板](./module-AGENTS.template.md)
- [Module Manifest 示例](./module.manifest.example.json)
- [Module Manifest JSON Schema](./module-manifest.schema.json)
- [Work Package 模板](./work-package.template.md)
- [Contract Change Proposal 模板](./contract-change.template.md)
- [ADR 模板](../adr/ADR-template.md)

WP-000 已在根 `scripts/` 提供 Manifest、Runtime Boundary、Public API 和 Contract Change 正向检查，并由 `pnpm architecture:check` 聚合。WP-001 已建立密钥扫描、环境边界和轮换规范；WP-002 仍需加入故意违规 Fixture，证明每条架构规则会因正确诊断而失败。

## Rules V2 authorization core

Rules V2 的机器执行授权由 `work-package-auth.schema.json`、各 Work Package 的
`.auth.json` 和唯一的 `execution-context.json` 组成。Markdown Work Package 只保留
目标、范围说明、验收和设计理由，不再作为 executable authorization source。

`execution-context.json` 只选择一个 `activeWorkPackage`；执行器按该 ID 读取一个授权
文件，不读取历史 APPROVED Work Package 的权限并集。使用 `pnpm wp:doctor <WP-ID>`
可查看授权、Active WP、目标模块、YELLOW capability、审批依赖和计算出的 readiness。

迁移窗口内现有 Architecture Guard 仍保留 V1 执行路径；Coder B 接入 `wp-scope` 后，
才删除 Markdown Allowed Paths parser 与 APPROVED WP union。
