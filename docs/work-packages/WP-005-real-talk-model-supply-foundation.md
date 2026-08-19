# WP-005：Real TALK Provider + Modeng Model Supply Foundation

> **Planning status：`PLANNING DRAFT`**
>
> **Implementation gate：`APPROVED PLANNING RECORD REQUIRED`**
> 本文件是实施交接说明，不单独授权实现；实现前必须完成本记录评审。

## 1. Metadata

- Owner：`backend-model-supply`；API、TALK Capability、Frontend 与 Architecture 共同评审
- Reviewer：Architecture Review、Backend Review、Security Review、Product Review
- Target modules：`backend-model-supply`、`backend-capability-talk`、`api`、`frontend-agent-ui`、`web`
- Supporting read-only modules：`shared-contracts`、`backend-agent-runtime`、`backend-task-engine`、`backend-event-realtime`、`frontend-realtime`、`frontend-conversation`
- Base：最新 `main`，`6302e7f`（WP-004 Fake TALK 已合并）
- Architecture baseline：V2.5；冻结入口为 `docs/architecture/00-*` 与 `docs/architecture/01-*`
- Contract change：`forbidden`；复用 `ModelExecutionPort@1`、`TalkSubmitCommand@1` 与现有 Event/SSE Contract
- ADR change：`not required under this plan`; 若引入持久化、Worker/MQ handoff、一级 Owner/依赖方向或新的状态机，必须先提交 ADR
- Migration change：`forbidden`
- Feature flag：`none planned`
- Retention change：`none planned`

### Gate evidence

`origin/main` 已包含 WP-004 的实现和审查修复：现有 Model Supply 已提供
`ModelExecutionPort@1`、Fake Adapter 以及共享 Conformance Suite；TALK 当前仍在
`packages/backend/capabilities/talk/src/index.ts` 中硬编码 `fake-talk-v1`，API
组合仍装配 Fake。WP-005 只在这个已冻结的执行边界内增加真实 Provider 链路和
服务端模型供应解析。

本记录不会修改 `packages/shared/contracts`，不会新建数据库表，也不会创建
Provider Gateway、Admin API 或新的跨模块稳定 Port。

## 2. Review conclusion

产品设计意见通过评审，做以下边界收敛：

1. `TalkSubmitCommand@1` 保持不变。浏览器只提交现有 text/project/command metadata，任何 provider、base model、model version、credential 或 endpoint 字段都拒绝进入客户端请求。
2. `ModelExecutionPort@1` 保持不变。Model Supply 内部在执行入口解析逻辑模型槽位并捕获 resolved snapshot；不通过扩展 frozen Port 传递 Provider 字段。
3. `talk.default` 是 Model Supply 的服务端逻辑槽位，不是 Provider model。TALK 可以传递由 Model Supply 约定的 opaque execution reference，但不得拥有 release、binding 或 Provider DTO。
4. System Instruction 在本 WP 中是 Model Supply 的 provider-execution safety baseline，只负责真实 Provider 调用前的服务端指令拼装；它不是 Context & Memory 的通用 Context Pack，也不创建 Prompt Management Platform。
5. 两个真实 release 使用一个 DeepSeek protocol adapter；release 差异只存在于 Model Supply 内部 binding。Provider/model marketing name 不得进入 API、Event、SSE、UI 或用户可见 Error。
6. Phase 0 使用 in-memory registry 和进程启动配置；不做 PostgreSQL catalog、后台管理、无重启热切换、Worker handoff 或多 Provider fallback。

## 3. Governance prerequisites

| Prerequisite                               | Decision               | Handling                                                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen Contract touched                    | **NO**                 | `shared-contracts`、`TalkSubmitCommand@1`、Event/SSE schemas 和 `ModelExecutionPort@1` 均只读。                                                                                                                                  |
| CCR required                               | **NO**                 | 只要保持现有 Port/Command/Envelope 语义；若需要新增或修改 versioned Port/Schema，立即报告 `CCR_REQUIRED` 并停止绕行。                                                                                                            |
| ADR required                               | **NO under this plan** | 不改变模块、Owner、依赖方向、状态机、数据库/MQ/进程或一致性边界；若实现需要其中任一变化，报告 `ADR_REQUIRED`。                                                                                                                   |
| Manifest change required                   | **NO under this plan** | 现有 Model Supply Contract/conformance 声明已覆盖 `ModelExecutionPort@1`；内部 in-memory state 不新增 table、flag、retention 或跨模块依赖。若实现确需增加 Manifest owner/error/flag 元数据，必须在实现 PR 中说明为 YELLOW 变化。 |
| Owner/dependency direction change required | **NO**                 | Model Supply 继续拥有 Model Release、Assignment、Provider Binding、Plan、Credential boundary 和 Provider execution；TALK/API 只通过包根组合。                                                                                    |
| Architecture change required               | **NO**                 | 真实 HTTP 调用仍位于 Model Supply 内部 Adapter；API 不直接 import Provider SDK，不写 Provider DTO。                                                                                                                              |
| State-machine change required              | **NO**                 | 复用 WP-003/WP-004 的 `accepted → running → completed/failed`；assignment 变化不改变 Operation 状态机。                                                                                                                          |
| Migration required                         | **NO**                 | 本 WP 的 catalog/assignment/provider execution snapshot 为 in-memory implementation。                                                                                                                                            |

## 4. Goal

在不改变浏览器 Contract、TALK Capability 边界或 `ModelExecutionPort@1` 的前提下，
完成第一条真实 TALK Provider streaming 链路，并使服务端能够在两个内部 Model
Release 之间配置 `talk.default`、按 Operation 固定解析结果、执行 Modeng
system-policy baseline，且不向用户泄露 Provider/model/secret 信息。

## 5. Non-goals

- Frontend model selector、client `modelId`、client Provider 信息或模型版本参数。
- Admin Model UI/API、PostgreSQL Model Catalog、动态热切换或持久化 ProviderExecution。
- Provider Gateway、multi-provider routing、fallback、health scoring、price routing、credential pool、generic protocol registry。
- IMAGE、VIDEO、AUDIO、SUMMARY、RAG、Tool Calling、Prompt Firewall、Jailbreak Classifier、模型 benchmark/scoring。
- Billing、Credits、Redis、BullMQ、Worker handoff、Operation cancel protocol 或新状态机。
- `UnifiedModelRequest`、`UnifiedProviderRequest`、`UniversalLLMOptions` 等跨 Capability DTO。
- 修改历史 WP-003/WP-004 planning record 或把真实 Provider 逻辑塞进 API/TALK/Frontend。

## 6. Expected change areas

### 6.1 Model Supply（primary owner）

- `packages/backend/model-supply/src/index.ts`：仅增加包根组合所需的 generic factory/opaque composition surface；不新增 `@1` Port。
- `packages/backend/model-supply/src/internal/**`：
  - `ModelSlot`：首期只注册 `talk.default`；结构可扩展到其他 capability，但不创建其 catalog/data。
  - `ModelRelease`：opaque `releaseId`、`capability`、`lifecycle status` 和不可变 provider binding reference。
  - `ModelAssignment`：`talk.default → releaseId`；新 Operation 只允许指向 `AVAILABLE` release，`DEPRECATED`/`RETIRED` 不得成为新默认 assignment。
  - `ResolvedExecutionPlan`：在一次 `execute()` 开始时捕获 release、binding reference 和 system-policy version；之后 stream 只使用该 immutable snapshot。
  - 一个 DeepSeek TALK protocol adapter：两个 release 共用同一 adapter；上游 request/stream/error DTO 只存在于 internal zone。
  - `SystemInstructionBaseline`：带内部 policy version，固定 Modeng AI 身份、指令保密、Provider/model 保密、Secret 不可得和不披露隐藏推理等规则。
- 使用 native server-side HTTP/fetch 或等价内部 transport；不得添加 Provider SDK 到 Capability/API/Worker。
- 外部 Provider response 从 `unknown` 开始，经 runtime schema 验证后才进入 normalized delta/error；未知响应和异常映射为现有安全 `PlatformError`，不得透传 raw response。
- 保留 Fake Adapter 和现有 `model-execution-port-v1` Conformance Suite；Real Adapter 使用同一 Suite，并增加 assignment/snapshot/policy/provider-error fixtures。

### 6.2 TALK / API composition

- `packages/backend/capabilities/talk/src/index.ts`：移除 `fake-talk-v1`；只传递 Model Supply 约定的逻辑 execution reference/opaque plan，不读取或命名 Provider/model binding。
- `packages/backend/capabilities/talk/src/index.test.ts`：验证 Talk Capability 对 plan reference opaque、Fake/Real 两类 Port 均复用同一行为。
- `apps/api/src/talk.composition.ts`、`apps/api/src/app.module.ts`：默认装配真实 Model Supply composition；测试通过注入 Fake，不以 Fake 作为生产 fallback。`MODENG_TALK_DEFAULT_RELEASE` 只接受服务端 opaque release ID，缺失凭据时返回安全错误而不是回退 Fake。
- `apps/api/src/talk.controller.test.ts`：保留现有 submit/SSE/replay 断言，增加真实 Adapter transport fixture 的安全错误和 stream 兼容验证。

### 6.3 Frontend surface

- `packages/frontend/agent-ui/src/components.tsx` 及对应测试：移除 “local Fake model”/“Local composition” 等实现身份文案，统一显示摩灯/Modeng AI；不增加模型选择 UI。
- `apps/web/src/App.tsx` 及现有 realtime/conversation tests：只验证已有 submit、SSE、retry/error path 对真实 stream 继续工作；不修改 command payload。
- `packages/shared/contracts/**`：只读，禁止为 Provider 或 release 增加字段。

## 7. Read-only paths

- `packages/shared/contracts/src/**`
- `packages/backend/agent-runtime/**`
- `packages/backend/task-engine/**`
- `packages/backend/event-realtime/**`
- `packages/frontend/realtime/**`
- `packages/frontend/conversation/**`
- `docs/architecture/**`、已批准 `docs/adr/**`、`docs/security/**`

实现不得 deep import 其他模块的 `internal/**`，不得直接查询/写入他域表，
不得将 provider binding、raw response、system prompt、credential 或
`resolvedModelReleaseId` 加入公共 Operation/Event/Artifact DTO。

## 8. Internal model-supply design

### 8.1 Resolution flow

```text
TalkCapability
  -> opaque logical execution reference for talk.default
  -> Model Supply resolves ModelAssignment at execute entry
  -> immutable ResolvedExecutionPlan
  -> DeepSeekTalkAdapter(binding snapshot)
  -> normalized ModelExecutionDeltaV1
  -> existing Agent Runtime/Event/SSE path
```

首期 registry 至少有两个真实 TALK release binding：一个 active assignment，
另一个 `available but inactive`。release ID 使用仓库内部 opaque ID（例如
`mdlrel_01`/`mdlrel_02`），不得从 ID 推导 Provider 或 marketing version；真实
upstream model code 只存在 binding internal data。

`ModelRelease` 最小状态为 `AVAILABLE | DEPRECATED | RETIRED`：

- `AVAILABLE`：允许作为新 Operation 的 assignment。
- `DEPRECATED`：保留 binding/metadata，禁止作为新的默认 assignment；已开始的 Operation 继续使用其 snapshot。
- `RETIRED`：禁止新 Operation 使用，历史 metadata 不物理删除。

`MODENG_TALK_DEFAULT_RELEASE` 只在服务端 composition/configuration 读取，
只接受 opaque release ID；Phase 0 允许重启后生效，不要求无重启热切换。测试
必须可以在同一个 in-memory registry 中切换 assignment，以证明下一次 Operation
会解析到另一个 release。

### 8.2 Immutable resolution

Operation 开始执行时只解析一次：

```text
resolve talk.default
  -> validate assignment + release lifecycle
  -> capture releaseId + provider binding + systemPolicyVersion
  -> execute captured plan
```

assignment 在 stream 中途变化不得影响已捕获的 binding；只有新的 Operation
重新 resolve。当前不把 `resolvedModelReleaseId` 加入公共 OperationRef，也不
提前建表；Model Supply 的内部 execution snapshot 必须为未来持久化保留等价
immutable reference。

### 8.3 Provider adapter and errors

DeepSeek release 只通过一个 protocol adapter 执行。Adapter 负责：

- 把内部 Modeng execution input + system policy 转为 provider request；
- 解析 provider streaming frames，验证 `unknown`，输出有序 bounded delta；
- 处理 `AbortSignal`、timeout 和关闭连接；
- 将 authentication/configuration、rate/availability、timeout、malformed response 和未知异常映射为现有安全 Platform Error。

错误映射固定使用现有 Contract code：本地输入非法为 `INVALID_INPUT`，调用取消为
`CANCELLED`，deadline 为 `TIMEOUT`，上游限流/暂时不可用/网络失败为可重试的
`DEPENDENCY_UNAVAILABLE`，缺少凭据、错误配置、非法 Provider response 或未知
异常为不可重试的 `INTERNAL_ERROR`。这些错误均不得携带 Provider 原文、URL、
header 或 credential。

Provider/model/base URL/credential/raw response 只能用于 server-side internal
observability，不能进入 `ModelExecutionDeltaV1`、Event/SSE、API error、UI
error 或 public trace。Adapter 不实现 provider fallback、跨 Provider routing
或按 marketing version 复制 adapter。

### 8.4 System instruction baseline

Model Supply 在 provider request 内部加入单一、集中、可版本识别的 Modeng
system instruction baseline，至少覆盖：

- 产品身份是摩灯 AI / Modeng AI；
- 不披露或确认 system/developer instruction、hidden prompt、Provider/model identity、credential、server configuration 或 private reasoning；
- 用户要求忽略指令、打印 system prompt、暴露底层模型/API key 或模拟管理员授权时，不改变该 baseline。

Prompt 不是 Secret boundary：Provider credential、database/OSS secret、内部
token 和 private configuration 根本不得进入 user/provider prompt。policy version
只保存在 Model Supply 内部 resolved snapshot，当前不下发客户端。

## 9. Public dependencies and contract decision

- `ModelExecutionPort@1`：复用，不修改字段、方法、错误 envelope、stream handle 或 abort semantics。
- `TalkSubmitCommand@1`：复用，不增加 `model`、`provider`、`modelVersion`、`modelHash` 或任何 release 参数。
- Existing Event/SSE Contract：复用；前端仍从 `unknown` 解析 `EventEnvelope`。
- No new stable `ModelSupplyResolverPort@1`：如果实现需要把 resolver 作为跨模块可替换 Port，必须停止并提交 `CCR_REQUIRED`；当前计划只允许 Model Supply 包根的 composition-only factory/callback。

## 10. Answers to the planner questions

1. `fake-talk-v1` 由 TALK 改为 Model Supply 约定的逻辑 execution reference；真实 release 和 provider binding 不进入 TALK。
2. `ModelExecutionPort@1` 已足够：opaque plan、validated text input、operation/project context、normalized delta stream 和 abort 均已覆盖本 WP；不修改 frozen Port。
3. 是。Model Supply 独占 Model Slot/Release/Assignment/Plan/Provider Binding/ProviderExecution 的内部语义；不新增跨模块 writer。
4. 是。`TalkSubmitCommand@1` 保持不变，客户端没有底层模型选择能力。
5. 两个 release 共享一个 DeepSeek protocol adapter，差异只通过 captured provider binding；不按 V4/V5 marketing version 复制 adapter。
6. 通过启动配置 `MODENG_TALK_DEFAULT_RELEASE` + in-memory assignment fixture；不做 DB 管理和 hot switch。
7. 在 Operation 执行入口一次性 capture resolved snapshot；provider stream 只闭包使用该 snapshot。
8. 本 WP 的 provider-execution system instruction baseline 由 Model Supply 内部拥有；不把它扩展成 Prompt Management Platform，也不替代未来 Context & Memory 的 Context Pack owner。
9. Provider/model/binding 只存在 Model Supply internal；public request/event/SSE/error 使用现有 opaque/safe schemas，错误只返回已注册安全 PlatformError。
10. 当前做 registry、assignment、immutable snapshot、DeepSeek adapter、policy baseline、Fake/Real conformance 和 browser path；Admin/Persistence/Gateway/Billing/Worker 属于后续独立 WP。

## 11. Implementation checkpoints

### A — Model Supply foundation

- 两个 release binding、lifecycle validation、`talk.default` assignment。
- opaque config selection 和 resolved immutable plan。
- assignment switch 与 in-flight snapshot tests。

### B — DeepSeek adapter

- backend-only credential/config loading；native streaming transport。
- normalized deltas、AbortSignal、timeout、safe error mapping。
- two bindings through one adapter；Fake/Real common conformance。

### C — Modeng system policy

- one internal policy source and version。
- policy injection, provider/model/secret confidentiality tests。
- injection attempts cannot replace the baseline；secret never enters request context。

### D — Browser verification

- existing submit → accepted → SSE → delta → completed/failed UI path。
- default release A and configured release B both execute through the same UI。
- frontend payload and visible identity remain provider-agnostic。

Checkpoint failure must stop within the current checkpoint; it must not expand to
Provider Gateway, Admin, Persistence, Billing or Worker.

## 12. Acceptance criteria

1. A live-configured API composition can execute an ordinary browser TALK request through Model Supply and one real DeepSeek streaming adapter to the existing Event/SSE/UI path.
2. Two server-only TALK release bindings are registered; `talk.default` can select each through opaque configuration/in-memory assignment tests, with no client model selector.
3. A new Operation after assignment A→B uses B; an Operation whose stream has started on A continues using A even if assignment changes.
4. Fake Adapter remains available and passes the existing Conformance Suite; the Real Adapter passes the same suite plus provider stream/error/abort fixtures.
5. `TalkSubmitCommand@1`, `ModelExecutionPort@1`, Event/SSE payloads and existing frontend request shape are unchanged.
6. No public request, response, Event, SSE payload, UI text or user-visible Error contains Provider name, upstream model code/version, base URL, protocol, API key, credential, system instruction, raw provider response or hidden reasoning.
7. Provider response data is validated from `unknown`; malformed frames, missing credentials, upstream failure, timeout and cancellation become safe existing Platform Errors without raw cause leakage.
8. Both release bindings use one protocol adapter; adding a second release does not add a second marketing-version adapter.
9. The system instruction baseline is centralized, version-identifiable internally, and present for every real execution; prompt injection attempts do not remove its confidentiality rules, while no Secret is placed in the prompt.
10. Existing retry/error behavior remains code-based and the UI copy identifies only 摩灯/Modeng AI, not Fake/local/provider/model implementation details.

## 13. Required verification

Planning PR itself:

- `pnpm format:check`
- `pnpm security:scan`
- `pnpm architecture:check`

Implementation PR:

- `pnpm build`
- `pnpm -r --if-present typecheck`
- `pnpm test`
- `pnpm architecture:check`
- `pnpm security:scan:staged`
- relevant Model Supply, TALK, API, frontend and browser verification; if no browser command exists, record manual real-browser evidence rather than claiming an automated command.

Live Provider smoke testing requires a separately provisioned backend-only
credential and must not commit, print or paste it. Missing live credentials are a
known unverified item for local/CI unit tests; they must not cause a Fake fallback.

## 14. Rollout / rollback

- Migration：none。
- Feature flag：none；process configuration selects the default release。
- Secret：backend runtime only, e.g. `DEEPSEEK_API_KEY`; blank placeholders may be documented in `.env.example`, never real values。
- Rollout：先以 one active/one inactive release 和 controlled live smoke test 验证，再允许 assignment 指向第二个 release。
- Rollback：把 `MODENG_TALK_DEFAULT_RELEASE` 恢复到已验证 release，或停止真实 Provider composition；不删除 release metadata，不回退/修改 `ModelExecutionPort@1`。

## 15. Delivery evidence / implementation handoff

- Implementation must start from a `main` containing this approved planning record and the WP-004 merge.
- Any discovered RED change must be reported as `CONTRACT_CHANGE_REQUIRED`, `CCR_REQUIRED` 或 `ADR_REQUIRED` with affected owners, compatibility impact and tests; do not resolve it by expanding public DTOs.
- Expected delivery evidence：changed files, Model Supply/adapter conformance output, assignment/snapshot tests, security scan, architecture checks, API/SSE/browser evidence, live credential handling note, unverified items and rollback configuration。
