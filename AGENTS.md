# Repository Constitution

架构必须由可执行约束保证，不能依赖 AI 或人“记得遵守”。

## 0. Normative priority

发生冲突时按以下顺序处理，前者覆盖后者：

1. 本文件：Repository Constitution。
2. 目标目录最近的 `AGENTS.md` 与 `module.manifest.json`。
3. `docs/architecture/00-*`：冻结架构边界。
4. `docs/architecture/01-*`：冻结跨模块契约与变更规则。
5. `docs/adr/*`：已批准的具体决策。
6. `React-Node-全栈Agent架构规范.md`：完整参考规范。
7. `docs/future/*`：NON-NORMATIVE，仅为未来讨论。
8. `docs/source-material/**`：REFERENCE ONLY，仅为历史输入。

`docs/future/**` 和 `docs/source-material/**` 不得作为当前实现需求来源。未经 Work Package 明确授权，不得据此创建 Campaign、Search、Publish、Monitoring、通用 Workflow 或其他未来模块。

## 1. Mission

本仓库实现 [AI Agent Platform Architecture V2.5](./React-Node-全栈Agent架构规范.md)。

长期坚持：

- 小而稳定的公开接口，深而内聚的内部实现。
- 单一状态/数据 Owner。
- Contract First、行为可测试、失败可恢复。
- 只完成当前任务，不扩大范围或顺手重构全仓。

## 2. Context loading

修改任何文件前：

1. 阅读本文件。
2. 查找并阅读覆盖目标文件的最近 `AGENTS.md`。
3. 若目标属于模块，阅读其 `module.manifest.json`、`README.md`、`index.ts`、`contract.ts` 和相关测试。
4. 仅在任务触发 Contract、Migration、Billing、Security 或架构争议时读取对应治理章节。

不要默认加载整份架构或所有模块文档。不要把完整基线复制进 Prompt、Skill 或局部 AGENTS。

## 3. Sources of truth

- 产品/技术架构：[React-Node-全栈Agent架构规范.md](./React-Node-全栈Agent架构规范.md)
- 工程治理与模板：[AI工程治理与Work-Package规范.md](./AI工程治理与Work-Package规范.md)
- 未来假设：[未来功能初步探讨记录.md](./docs/future/未来功能初步探讨记录.md)，不是当前实施承诺。
- `module.manifest.json`：机器可读 Owner、表、依赖、公开入口和文件 Zone。
- `.codex/`：仅限 Codex 运行配置，不是架构事实源。

## 4. Architecture invariants

1. 当前是模块化单体，不按 Capability 拆微服务。
2. 跨模块只能从目标包根 public entry import。
3. 禁止 deep import 他域 `internal/**`。
4. 一份可变状态和一张业务表只有一个 Writer Owner。
5. 共享 PostgreSQL 不授权跨模块查写他域表。
6. PostgreSQL 是业务事实；Redis/BullMQ 只负责缓存、投递和执行。
7. Agent Runtime 拥有 Operation/Execution Graph 逻辑状态。
8. Task Engine 只拥有 TaskRun/attempt/Lease/checkpoint。
9. Capability 不拥有 MQ、Worker、SSE、OSS、Billing 或 Provider 基础设施。
10. Capability/API/Worker 禁止直接 import Prisma、BullMQ 或 Provider SDK。
11. Model Supply 拥有 Provider 路由、Plan、Credential 和 ProviderExecution。
12. Billing & Credits 独占 Quote、Reservation、Settlement、Account 和 Ledger 写入。
13. Resource & Asset 独占 Resource/Artifact 存储和转换生命周期。
14. Event & Realtime 管 envelope/sequence/outbox/delivery，不定义他域业务语义。
15. 外部数据从 `unknown` 开始，经运行时 Schema 验证后进入 Domain。
16. Public Trace 禁止 Secret、raw provider data、System Prompt 和隐藏推理。

## 5. Change zones

### GREEN

可在 Work Package 范围内修改：模块内部实现、私有类型、模块测试/Fixture、模块拥有的 Adapter、现有 Contract 后的 UI/Handler 实现。

### YELLOW

仅任务明确授权时修改：`index.ts`、public export、Migration、Manifest、shared fixture、Feature Flag/Retention 配置。

### RED

没有批准的 Contract Change/ADR 时禁止修改：public `contract.ts`、Command/Event/Artifact/Error Schema、状态机、Owner、依赖方向、owned-table、跨模块 Port、protocol major。

若实现需要 RED 变化，不得绕过。报告 `CONTRACT_CHANGE_REQUIRED`，说明当前限制、建议变化、影响模块、兼容性和所需测试。

## 6. State and data ownership

其他模块只能通过 Public Port、Command、Event 或不可变 reference/snapshot 请求 Owner 操作。

- 不因“直接 JOIN/UPDATE 更方便”破坏边界。
- `persistence-postgres` 只是按 Owner 分区的 Adapter 集合，不导出 PrismaClient。
- 跨域只读 Projection 必须在 Manifest 声明 Owner/readOnlyTables，仍不得写入。
- `ExecutionCoordinator` 只调用 Owner Port，不直接更新 Operation、Task、Artifact 或 Ledger 表。

## 7. Contract and errors

- 跨网络及序列化 Contract 以 Zod Schema 为真源并推导 TypeScript。
- 类型通过不代表行为正确；Fake/真实 Adapter 必须通过共同 Conformance Suite。
- 跨边界错误使用版本化 Platform Error；禁止匹配 `error.message` 决定 UI 或重试。
- 未授权的 Public Contract 变化必须先提交 Contract Change Proposal。

## 8. Testing

每个行为变化必须有测试；Bug 修复必须有回归测试。

按风险覆盖成功、非法输入、重复/幂等、取消、重试、超时、部分结果、并发和恢复。Coverage 是报警器，不替代 invariant、Conformance 和 Vertical Slice。

目标命令（仅在脚本已经存在时运行）：

- `pnpm verify:module <module>`
- `pnpm verify:changed`
- `pnpm architecture:check`
- `pnpm verify`

如果命令尚未 scaffold，明确报告“未提供”，不要伪造成功结果或临时创建空检查器。

## 9. Completion report

交付时必须说明：

1. 修改文件和实现行为。
2. Public Contract 是否改变。
3. 模块依赖/Owner/Manifest 是否改变。
4. 是否新增 Migration、Feature Flag、Retention 或外部副作用。
5. 添加/更新的测试与实际运行命令。
6. 未验证项、剩余风险和回滚方式。

出现未授权 RED/YELLOW 变化或新的架构决策时，任务不能宣布完成，必须进入 Proposal/ADR Review。

## Code Review Rules

- 标记不必要的 public surface 扩张、跨模块状态写入、基础设施泄漏、deep import、Contract 绕过和缺失行为测试。
- Reviewer 建议不能覆盖失败的静态门禁或测试。

## 10. Secret handling

- Never commit real API keys, passwords, tokens, private keys, credentials or connection strings.
- `VITE_*` values are public by definition; provider credentials stay in backend runtime environments.
- Before committing, run `pnpm security:scan:staged`; CI runs `pnpm security:scan`.
- Follow [docs/security/secrets-management.md](./docs/security/secrets-management.md) for storage, logging, rotation and incident response.

## 11. Architecture Guard

- `pnpm architecture:check` must validate both the real workspace and the negative fixture suite.
- Deliberately invalid fixtures must fail with the documented `ARCHxxx` code; a green positive check alone is not evidence that a boundary is enforced.
- Do not widen `module.manifest.json#allowedDependencies` to silence a failure. Manifest changes are Yellow-zone and require Work Package or ADR evidence.
