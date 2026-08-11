# Architecture index

按任务渐进加载，不默认阅读全文。

| 文档 | 何时读取 |
| --- | --- |
| [00 冻结架构与依赖边界](./00-总体架构与依赖边界.md) | 所有实现；确认模块、Owner 和依赖方向 |
| [01 冻结跨模块契约与变更规则](./01-跨模块契约与架构决策.md) | Public Contract、Manifest、Migration 或架构变更 |
| [AI Agent Platform Architecture V2.5](../../React-Node-全栈Agent架构规范.md) | 架构/Owner/模块/协议争议，或 Work Package 明确要求 |
| [AI 工程治理与 Work Package 规范](../../AI工程治理与Work-Package规范.md) | Contract、Manifest、Migration、测试门禁、CR/ADR、AI 交付 |
| [未来功能初步探讨记录](../future/未来功能初步探讨记录.md) | NON-NORMATIVE；不能作为当前实现授权 |
| [历史原始资料](../source-material/README.md) | REFERENCE ONLY；只用于溯源 |

日常模块实现优先读取：根/局部 `AGENTS.md`、Manifest、README、Public Contract 和相关测试。
