# 🪔 摩灯 Agent · Modeng Agent

> **摩登时代的智能魔灯。**  
> **从一句想法，到一个完成的结果。**

摩灯 Agent 是一个面向真实任务的 AI Agent 工作平台。

它希望把模型、工具、任务调度和复杂的软件能力藏在背后，让用户只需要表达：

> **“我想做什么。”**

摩灯的目标不只是回答问题，而是帮助用户把事情持续推进并交付结果。

## 为什么是摩灯 Agent

大多数 AI 产品围绕聊天框展开：用户提问，AI 回答。

摩灯希望进一步走向：

```text
想法
  ↓
自然语言 / Guided Skill
  ↓
Agent 理解需求
  ↓
模型与工具协作
  ↓
后台任务持续执行
  ↓
图片 / 视频 / 文档 / 数据等结果
  ↓
继续讨论、修改与迭代
```

**Chat 给答案，摩灯交付结果。**

复杂任务不再被拆成一堆互相割裂的 AI 工具，而是在统一的 AI Workspace 中由 Project、Conversation、Operation 和 Artifact 组织起来。

## 首期能力规划

当前仓库正在建设基础设施，以下是首期目标能力，不代表已经全部上线：

| Capability | 目标                           |
| ---------- | ------------------------------ |
| `TALK`     | AI 对话、流式文本和工具调用    |
| `SUMMARY`  | 文本、文件和内容总结           |
| `IMAGE`    | 图片生成、参考图生成和批量生成 |
| `VIDEO`    | 文生视频、图生视频等长任务     |
| `AUDIO`    | 语音识别与内容转写             |

这些能力共享统一的 Runtime、Task、Event、Model、Asset、Memory 和 Billing 边界，不为每种能力重新复制一套基础设施。

## Project First

摩灯使用 Project 管理用户持续进行的工作：

```text
AI 助手
  ├─ 茶叶品牌定位讨论
  └─ 宣传文案修改

图片
  ├─ 商品主图
  └─ 宣传图批量生成

视频
  └─ 15 秒宣传片
```

```text
Project
├─ Conversation
├─ Resources
├─ Operations
└─ Artifacts
```

Project 可以归档，但归档不会隐式取消仍在后台运行的任务。

## Task Center

所有 AI 工作都会形成用户可理解的 `Operation`。Task Center 提供跨 Project 的统一执行视图：

```text
Operation
└─ Execution Graph
   ├─ Step
   ├─ Tool Call
   ├─ Child Operation
   └─ Batch Work
```

用户看到的是任务、进度和结果；Worker、TaskRun、Lease、ProviderJob 等内部执行细节由平台封装。

任务支持规划中的：

- 离开页面后继续执行
- 刷新浏览器后恢复状态
- 多设备查看进度
- 失败原因与受控重试
- 批量任务的部分成功和失败子集重试

## Observable Agent

摩灯不会只显示“AI 正在思考”。Agent 的安全执行证据可以呈现为：

```text
✓ 读取项目资料
✓ 调用搜索工具
● 交叉分析模型结果
○ 生成最终报告
```

可观察的信息包括工具、模型、耗时、状态和费用摘要；不会暴露 API Key、Credential、System Prompt、隐藏推理或未脱敏敏感数据。

## Context & Memory

摩灯不会把全部历史 Conversation 直接塞进 Prompt，而是按预算构建 Context Pack：

```text
Working Context
Session Context
Long-term Memory
Semantic Retrieval
```

并明确区分：

```text
Profile ≠ Memory ≠ Conversation
```

用户可以查看、修改和遗忘长期 Memory。

## Model Supply

业务能力不直接绑定某一家模型厂商。模型供应链抽象为：

```text
Capability
  ↓
Logical Model
  ↓
Model Version
  ↓
Capability Spec
  ↓
Model Offer
  ↓
Provider Channel
  ↓
Protocol Adapter
```

Capability 只依赖稳定的 Model Supply Port；具体渠道、路由、凭证、限流和 Provider Job 都隐藏在模块内部或 Infrastructure Adapter 中。

## Resource、Artifact 与 Billing

```text
Resource  = 用户输入
Artifact  = AI 输出
```

大文件规划使用对象存储直传直下，避免 Node API 中转整个文件。未经用户允许，不会静默进行有语义损失的格式转换。

积分按照账户账本设计：

```text
Quote → Reserve → Execute → Usage → Settle / Release → Immutable Ledger
```

Usage、Provider 成本、Product Price 和用户 Credits 是不同事实，不会通过简单的 `balance -= amount` 代替账本。

## 当前架构

```text
React Web
  ↓ HTTP / SSE / WS
Node API / Worker
  ↓
Backend Deep Modules
  ↓
PostgreSQL + Redis/BullMQ + Object Storage + Model Providers
```

仓库通过目录直接表达 Runtime Boundary：

```text
apps/                    可运行、可部署的程序
packages/shared/         极少量跨前后端 Contract 与 Kernel
packages/frontend/       浏览器交互与投影
packages/backend/        后端业务权威与 Deep Modules
packages/infrastructure/ PostgreSQL、Redis、BullMQ、OSS 等技术 Adapter
```

依赖方向固定为：

```text
apps/web       → frontend → shared
apps/api       → backend  → shared
apps/worker    → backend  → shared
apps/api/worker → infrastructure → backend Public Ports
```

禁止 `frontend → backend/infrastructure`、`backend → frontend/infrastructure` 和跨模块 `internal` 导入。

## AI-Native Engineering

摩灯从一开始就为 AI Coding 设计工程边界。每个模块都拥有：

```text
AGENTS.md
module.manifest.json
README.md
src/index.ts
internal/
tests/
```

AI 进入模块时优先读取根规则、局部规则、Manifest、Public Contract 和相关测试，而不是默认加载整个仓库。

架构依赖可执行门禁保证：

```text
TypeScript strict
  ↓
Schema / Contract Tests
  ↓
Boundary Dependency Scan
  ↓
Architecture Check
  ↓
Unit / Integration Tests
  ↓
Build
```

这些规则同时约束 AI 和人类贡献者。

## Monorepo

```text
apps/
├─ web/                         React Browser Application
├─ api/                         HTTP / SSE / WS Node Entry
└─ worker/                      Worker / Scheduler Node Entry

packages/
├─ shared/
│  ├─ contracts/
│  └─ domain-kernel/
├─ frontend/
│  ├─ agent-runtime/
│  ├─ conversation/
│  ├─ agent-ui/
│  ├─ guided-skill/
│  ├─ project/
│  ├─ task-center/
│  └─ capabilities/{talk,image,video,audio,summary}/
├─ backend/
│  ├─ identity-session/
│  ├─ workspace-conversation/
│  ├─ context-memory/
│  ├─ agent-runtime/
│  ├─ task-engine/
│  ├─ event-realtime/
│  ├─ model-supply/
│  ├─ resource-asset/
│  ├─ billing-credits/
│  ├─ platform-core/
│  └─ capabilities/{talk,image,video,audio,summary}/
└─ infrastructure/
   ├─ persistence-postgres/
   ├─ queue-bullmq/
   ├─ storage-oss/
   ├─ redis/
   └─ observability/
```

## 快速开始

环境要求：Node.js 22.13+（推荐 24）和 pnpm 10+。

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm dev:web
pnpm dev:api
pnpm dev:worker

# 本地需要环境变量时复制样例，真实值只保留在未跟踪的 .env
cp .env.example .env              # macOS/Linux
pnpm security:scan:staged          # 提交前扫描暂存区
```

PowerShell 使用 `Copy-Item .env.example .env`。真实密钥保护规则见[密钥与 API Key 保护规范](./docs/security/secrets-management.md)。

当前可运行入口是 Phase 0 的最小 Composition Root；业务 Agent 尚未接入。

## 项目状态

```text
WP-000 Repository Bootstrap       ✅ completed
WP-001 Secret Protection Baseline ✅ completed
WP-002 Architecture Guard         → next
WP-003 Contract Kernel             planned
WP-004 Fake TALK Vertical Slice   planned
```

第一条真正的业务验收链路将是 Fake TALK：

```text
Command → Operation → Task → Worker → Fake Model
        → Event → SSE → Reducer → React → Billing
```

在 TALK 闭环证明平台边界前，不会同时建设全部五种 Capability。

## 文档入口

- [Repository Constitution](./AGENTS.md)
- [冻结架构与依赖边界](./docs/architecture/00-总体架构与依赖边界.md)
- [冻结跨模块契约规则](./docs/architecture/01-跨模块契约与架构决策.md)
- [完整 V2.5 架构参考](./React-Node-全栈Agent架构规范.md)
- [AI 工程治理与 Work Package](./AI工程治理与Work-Package规范.md)
- [密钥与 API Key 保护规范](./docs/security/secrets-management.md)
- [WP-000 Repository Bootstrap](./docs/work-packages/WP-000-repository-bootstrap.md)
- [WP-001 Secret Protection Baseline](./docs/work-packages/WP-001-secret-protection-baseline.md)
- [未来方向记录（非规范）](./docs/future/未来功能初步探讨记录.md)

## Future

未来可能探索 Research、PPT、Marketing、Publishing 和 Automation 等 Compound Agent，但它们不会提前进入基础架构。只有真实需求和获批 Work Package 出现后，才会组合既有的 Agent、Tool、Task、Model、Memory、Artifact 和 Billing 能力。

---

**摩灯 Agent**  
**摩登时代的智能魔灯。**  
**Chat 给答案，摩灯交付结果。**
