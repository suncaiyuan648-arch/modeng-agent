# Governance templates

本目录提供 Rules Lite 模板；规则真源是 [AI 工程治理与 Work Package 规范](../../AI工程治理与Work-Package规范.md)。模板与规则冲突时应修正一致性。

- [模块 AGENTS 模板](./module-AGENTS.template.md)
- [Module Manifest 示例](./module.manifest.example.json)
- [Module Manifest JSON Schema](./module-manifest.schema.json)
- [Work Package 模板](./work-package.template.md)
- [Contract Change Proposal 模板](./contract-change.template.md)
- [ADR 模板](../adr/ADR-template.md)

根 `scripts/` 提供 Manifest、Runtime Boundary、Public API、Frozen Contract 和架构变更检查，并由 `pnpm architecture:check` 聚合。负向 Fixture 证明每条长期 invariant 会因正确诊断而失败。

## Phase 0 Rules Lite

Work Package 只记录目标、非目标、验收、架构约束和预期改动区域。CI 不读取 WP Markdown、`.auth.json` 或 Active WP 来判定文件写权限。

- GREEN 实现文件直接修改。
- YELLOW public facade、包配置和 Manifest 普通元数据可在当前任务中修改，由 Reviewer 检查必要性。
- RED Frozen Contract、Owner/依赖方向、Migration 和治理 Trust Root 必须停下进入 CCR/ADR/Owner Review。

`trusted-governance` 只保护治理 Trust Root，不承担产品 Scope Review。产品范围由任务验收、diff 解释和 Reviewer 负责。
