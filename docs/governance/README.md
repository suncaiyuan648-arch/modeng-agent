# Governance templates

本目录提供可复制模板；规则真源是 [AI 工程治理与 Work Package 规范](../../AI工程治理与Work-Package规范.md)。模板与规则冲突时，先修正规则/模板一致性，不允许实现者自行选择更方便的一份。

- [模块 AGENTS 模板](./module-AGENTS.template.md)
- [Module Manifest 示例](./module.manifest.example.json)
- [Module Manifest JSON Schema](./module-manifest.schema.json)
- [Work Package 模板](./work-package.template.md)
- [Contract Change Proposal 模板](./contract-change.template.md)
- [ADR 模板](../adr/ADR-template.md)

WP-000 已在根 `scripts/` 提供 Manifest、Runtime Boundary、Public API 和 Contract Change 正向检查，并补充了密钥扫描、环境边界和轮换规范。WP-001 已通过正反 Fixture 和稳定 `ARCHxxx` 诊断码证明架构规则有效；下一步是 WP-002 Contract Kernel。
