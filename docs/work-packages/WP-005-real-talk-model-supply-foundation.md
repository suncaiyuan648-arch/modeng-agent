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
- Contract change：不修改任何 versioned Contract/Port；但需要先批准并合并窄范围 `CCR-0003`，授权 Model Supply 包根的 composition-only factory（不是新的 `@1` Port，也不扩展 `CCR-0002`）。
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
2. `ModelExecutionPort@1` 保持不变。`talk.default` 只作为 Model Assignment 的 resolve key，绝不直接成为 `ModelExecutionPlanRefV1.planId`；固定阶段为 `assignment resolve → immutable plan → execute`。
3. Composition root 通过 Model Supply 包根拿到 composition-only `resolveTalkExecutionPlan()` 与 `executionPort`，再把 resolver callback 注入 TALK。TALK 只在 Operation 开始时请求 opaque immutable plan ref，不拥有 release、binding 或 Provider DTO。
4. System Instruction 在本 WP 中是 Model Supply 的 Phase-0 provider-execution preamble，只负责真实 Provider 调用前的服务端指令拼装；不改变 Context & Memory 对长期 System Policy / Context Pack 的 Owner 关系，也不创建 Prompt Management Platform。
5. 两个真实 release 使用一个 DeepSeek protocol adapter；release 差异只存在于 Model Supply 内部 binding。Provider/model marketing name 不得进入 API、Event、SSE、UI 或用户可见 Error。
6. Phase 0 使用 in-memory registry 和进程启动配置；不做 PostgreSQL catalog、后台管理、无重启热切换、Worker handoff 或多 Provider fallback。

## 3. Governance prerequisites

| Prerequisite                               | Decision               | Handling                                                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen Contract touched                    | **NO**                 | `shared-contracts`、`TalkSubmitCommand@1`、Event/SSE schemas 和 `ModelExecutionPort@1` 均只读；包根 facade 的 composition-only 增量由 `CCR-0003` 单独授权。                                                                       |
| CCR required                               | **YES — CCR-0003**     | `CCR-0003` 只授权 `backend-model-supply/src/index.ts` 的非版本化、composition-only `resolveTalkExecutionPlan()` + `executionPort` 返回面；不新增/升级 `@1` Port、不扩展 `CCR-0002`。实现必须从已合并该 CCR 的 `main` 开始。 |
| ADR required                               | **NO under this plan** | 不改变模块、Owner、依赖方向、状态机、数据库/MQ/进程或一致性边界；若实现需要其中任一变化，报告 `ADR_REQUIRED`。                                                                                                                   |
| Manifest change required                   | **NO under this plan** | 不修改 Manifest 或 architecture guard；`CCR-0003` 只处理当前 package-root/frozen-file 治理事实与本次 composition seam 的窄授权，不把普通 `index.ts` 变化升级成治理重构。 |
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

- `packages/backend/model-supply/src/index.ts`：增加包根 composition-only factory，返回 `resolveTalkExecutionPlan()` 与现有 `ModelExecutionPort@1` implementation；不新增 `@1` Port。
- `packages/backend/model-supply/src/internal/**`：
  - `ModelSlot`：首期只注册 `talk.default` 这个 Assignment key；它不进入 `ModelExecutionPlanRefV1.planId`，也不创建第二套 Model Catalog。
  - `ModelRelease`：只作为 V2.5 canonical `ModelVersion` / `ModelVersionId` 的 Phase-0 in-memory projection，`releaseId` 是当前 opaque implementation value，`capability` 对应 `ModelCapabilitySpec.capabilityCode`；不另立第二套长期 Model Supply identity。
  - `ModelAssignment`：`talk.default → ModelVersionId`；新 Operation 只允许指向 V2.5 `published` 且本地 assignment-eligible 的 release，`DEPRECATED`/`RETIRED` 不得成为新的默认 assignment。
  - `ResolvedExecutionPlan`：只作为 V2.5 `InternalModelExecutionPlanSnapshot` 的最小 projection，包含 `ModelExecutionPlanId`、`ModelVersionId`、primary `Offer`、`ProviderChannel`、transport/policy/binding versions 和空 fallback 集；生成后登记到 single-use internal plan registry，返回的只有 opaque `ModelExecutionPlanRefV1`。
  - 一个 DeepSeek TALK protocol adapter：两个 `Offer` 共用同一 `ProviderChannel` 和 adapter；上游 request/stream/error DTO 只存在于 internal zone。
  - `SystemInstructionBaseline`：带内部 policy version，作为 Phase-0 provider-execution preamble；长期 System Policy / Context Pack 仍由 Context & Memory 负责。
- 使用 native server-side HTTP/fetch 或等价内部 transport；不得添加 Provider SDK 到 Capability/API/Worker。
- 外部 Provider response 从 `unknown` 开始，经 runtime schema 验证后才进入 normalized delta/error；未知响应和异常映射为现有安全 `PlatformError`，不得透传 raw response。
- `packages/backend/model-supply/src/internal/model-execution-port.conformance.ts` 重构为可复用 harness：Fake Port 与 Real DeepSeek Port 共用同一行为套件；Real Port 通过 internal transport fixture 驱动，不访问公网。
- 增加 internal transport seam（例如 `ModelProviderTransport` structural interface），生产实现封装 `fetch`，测试实现返回确定性的 HTTP/SSE/错误 response；该 seam 不从包根导出、不成为稳定 Port。

### 6.2 TALK / API composition

- `packages/backend/capabilities/talk/src/index.ts`：移除 `fake-talk-v1`；`createTalkCapability` 接受 composition-only `resolvePlan` callback 与 `ModelExecutionPort@1`，执行顺序固定为 `resolvePlan() → modelExecution.execute(planRef)`；TALK 不读取或命名 Provider/model binding。
- `packages/backend/capabilities/talk/src/index.test.ts`：验证 resolver 在每个新 Operation 开始时只调用一次、传入的 `planId` 不是 `talk.default`，Fake/Real 两类 Port 均复用同一行为。
- `apps/api/src/talk.composition.ts`、`apps/api/src/app.module.ts`：先创建 Model Supply composition，再将其 resolver 与 execution port 注入 TALK；测试通过注入 Fake composition，不以 Fake 作为生产 fallback。`MODENG_TALK_DEFAULT_RELEASE` 只接受服务端 opaque release ID，缺失凭据时返回安全错误而不是回退 Fake。
- `apps/api/src/talk.controller.test.ts`：保留现有 submit/SSE/replay 断言，增加真实 Adapter transport fixture 的安全错误和 stream 兼容验证。

### 6.3 Frontend surface

- `packages/frontend/agent-ui/src/components.tsx` 及对应测试：移除 “local Fake model”/“Local composition” 等实现身份文案，统一显示摩灯/Modeng AI；不增加模型选择 UI。
- `apps/web/src/App.tsx` 及现有 realtime/conversation tests：移除 `Local composition` 文案，只验证已有 submit、SSE、retry/error path 对真实 stream 继续工作；不修改 command payload。
- `packages/shared/contracts/**`：只读，禁止为 Provider 或 release 增加字段。

### 6.4 Change registry（implementation PR）

| Path                                                                                          | Change                                                                                                                                                    | Boundary                                               |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/backend/model-supply/src/index.ts`                                                  | 导出 composition-only Model Supply factory；返回 plan resolver + `ModelExecutionPort@1`，不导出 Provider DTO 或 secret。                                  | YELLOW public composition surface；不是 versioned Port |
| `docs/contract-changes/CCR-0003.md`                                                           | 窄范围授权包根 composition-only factory；不新增/升级 `@1` Port，不扩展 `CCR-0002`。                                                                  | Planning governance gate                             |
| `packages/backend/model-supply/src/internal/model-catalog.ts`（或等价 internal file）         | 登记两个 V2.5 `ModelVersion` projections、Assignment key 和 exact Offer + ProviderChannel records（含 alias/version/cap）。                          | GREEN internal                                         |
| `packages/backend/model-supply/src/internal/model-execution-plan.ts`（或等价 internal file）  | `assignment resolve → immutable InternalModelExecutionPlanSnapshot → opaque ModelExecutionPlanRefV1`。                                                    | GREEN internal                                         |
| `packages/backend/model-supply/src/internal/deepseek-talk-adapter.ts`（或等价 internal file） | 一个 adapter，按 snapshot 中的 Offer/Channel binding 调用两个 upstream model。                                                                            | GREEN internal                                         |
| `packages/backend/model-supply/src/internal/transport.ts`（或等价 internal file）             | Production `fetch` seam + deterministic test transport；解析 SSE keep-alive、JSON data frame 和 `[DONE]`。                                                | GREEN internal                                         |
| `packages/backend/model-supply/src/internal/model-execution-port.conformance.ts`              | Refactor harness，使 Fake/Real Port 共享 conformance；补充 plan single-use cleanup、SSE terminal、usage-only、error、abort fixtures。                  | GREEN test support                                     |
| `packages/backend/capabilities/talk/src/index.ts`                                             | 注入 composition-only resolver，移除 `fake-talk-v1`。                                                                                                     | GREEN/YELLOW existing facade                           |
| `apps/api/src/talk.composition.ts`、`apps/api/src/app.module.ts`                              | 装配 real Model Supply composition；Fake 仅用于 tests。                                                                                                   | GREEN composition                                      |
| `.env.example`                                                                                | 仅增加空值 `DEEPSEEK_API_KEY=` 与 `MODENG_TALK_DEFAULT_RELEASE=mdlrel_01jv5q2x7e8m9n4k6p3r1t0s`；不加入 `DEEPSEEK_BASE_URL`，不得有真实值。           | YELLOW documentation/config inventory                  |
| `packages/frontend/agent-ui/src/components.tsx`、`apps/web/src/App.tsx` 及 tests              | 删除 Fake/Local composition 用户可见文案，显示摩灯/Modeng AI。                                                                                            | GREEN UI copy                                          |

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
Operation starts
  -> TalkCapability calls composition-only resolvePlan()
  -> Model Supply resolves ModelAssignment(talk.default)
  -> Model Supply creates/registers immutable InternalModelExecutionPlanSnapshot
  -> resolver returns opaque ModelExecutionPlanRefV1(planId = mdlplan_...)
  -> TalkCapability calls ModelExecutionPort@1.execute(planRef)
  -> Model Supply looks up the captured snapshot
  -> DeepSeekTalkAdapter executes the snapshot's Offer + Channel binding
  -> normalized ModelExecutionDeltaV1
  -> existing Agent Runtime/Event/SSE path
  -> terminal success/error/abort
  -> finally delete the single-use snapshot from the in-memory registry
```

`talk.default` 是 assignment key，不是 `ModelExecutionPlanRefV1.planId`。`planId`
在每次 resolve 时生成/登记为新的 opaque `ModelExecutionPlanId`；TALK、API、
Agent Runtime 和客户端都不能从该 ID 推导 ModelVersion、Offer、Channel 或 Provider。

首期 registry 至少有两个真实 TALK release projection：一个 active assignment，
另一个 `available but inactive`。release ID 使用固定的仓库内部 opaque ID；真实
upstream model code 只存在 binding internal data。

`ModelRelease` 最小状态为 `AVAILABLE | DEPRECATED | RETIRED`：

- `AVAILABLE`：允许作为新 Operation 的 assignment。
- `DEPRECATED`：保留 binding/metadata，禁止作为新的默认 assignment；已开始的 Operation 继续使用其 snapshot。
- `RETIRED`：禁止新 Operation 使用，历史 metadata 不物理删除。

`MODENG_TALK_DEFAULT_RELEASE` 只在服务端 composition/configuration 读取，
只接受 opaque release ID；Phase 0 允许重启后生效，不要求无重启热切换。测试
必须可以在同一个 in-memory registry 中切换 assignment，以证明下一次 Operation
会解析到另一个 release。

Plan registry 的生命周期严格是 `resolve → single execute lifetime → finally/terminal
cleanup`：resolve 注册一个 immutable snapshot，`execute(planRef)` 原子地 claim
它并只允许一次执行；成功、resolve/setup error、stream error、abort、timeout 和
正常终止都必须删除 snapshot。重复 execute 或 missing/unknown ref 只返回现有安全
`INTERNAL_ERROR`，不重新解析 assignment，也不留下 registry entry。实现应有一个
小的 in-memory bound/abandoned-ref guard 作为进程安全阀，但正常路径依赖 `finally`
清理，不使用永久 registry、数据库 retention、LRU 业务缓存或跨请求 plan reuse。

### 8.2 Immutable resolution

Composition seam 的唯一阶段顺序为：

```text
resolveTalkExecutionPlan()
  -> read ModelAssignment(talk.default)
  -> validate ModelVersion lifecycle and assignment eligibility
  -> resolve primary Offer + ProviderChannel + TransportSpec
  -> capture InternalModelExecutionPlanSnapshot
  -> register snapshot under opaque ModelExecutionPlanId
  -> return ModelExecutionPlanRefV1
execute(planRef)
  -> load the already-captured snapshot
  -> claim it for this one execution
  -> invoke the selected adapter
  -> finally delete the registry entry on success/error/abort
```

Assignment 只在 `resolveTalkExecutionPlan()` 阶段读取一次；resolver 返回后即使
assignment 变化，也不得影响当前 `ModelExecutionPlanId` 的 binding。只有新的
Operation 再次调用 resolver 才能拿到新的 plan。当前不把
`resolvedModelReleaseId` 加入公共 OperationRef，也不提前建表；internal snapshot
必须保留未来持久化所需的 immutable reference。

### 8.3 V2.5 mapping and exact internal bindings

WP-005 不创建另一套长期 Model Supply 领域模型；以下名称是实现期 projection，
字段语义必须对齐 V2.5：

| WP-005 implementation term   | V2.5 canonical concept                                             | Phase-0 rule                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ModelSlot` / `talk.default` | Capability-level assignment key feeding Model negotiation/planning | 只做内部 selection key；不成为 `planId`、`ModelVersionId` 或客户端字段。                                                                   |
| `ModelRelease`               | V2.5 canonical `ModelVersion` / `ModelVersionId`                    | `releaseId` 是当前 projection 的 opaque `modelVersionId` implementation value；`capability` 对应 `ModelCapabilitySpec.capabilityCode = talk`，不创建第二套长期 release identity。 |
| `ProviderBinding`            | V2.5 `ModelOffer` + `ProviderChannel` + `OfferTransportSpec`        | model alias 只在 Offer；官方 channel/base URL/protocol/credential lookup identity 在 Channel/Transport；`bindingVersion`、`maxOutputTokens` 是该 binding snapshot 的内部配置，不新增平行 authority。 |
| `ResolvedExecutionPlan`      | V2.5 `InternalModelExecutionPlanSnapshot`                         | `planId` 是 `ModelExecutionPlanId`；快照保存 `modelVersionId`、primary Offer/Channel、transport/routing/policy/binding versions 和空 fallback 集。 |

Exact Phase-0 internal registry records（全部 server-side/internal only）：

| Assignment/release                                                     | V2.5 `ModelVersionId` projection                                                                                                 | Offer + Channel binding                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `talk.default → mdlrel_01jv5q2x7e8m9n4k6p3r1t0s`（initial active）     | `modelVersionId = mdlrel_01jv5q2x7e8m9n4k6p3r1t0s`; capability `talk`; lifecycle `published`; assignment eligibility `available` | `offerId = offer_deepseek_v4_flash_official_v1`; `provider = deepseek`; `providerModelAlias = deepseek-v4-flash`; `observedUpstreamVersion = DeepSeek-V4-Flash`; `bindingVersion = modeng.deepseek.talk.flash.v1`; `providerChannelId = channel_deepseek_official_openai_global_v1`; `baseUrl = https://api.deepseek.com`; `protocol = openai-chat-completions`; `transportSpecVersion = deepseek.openai.chat.v1`; `credentialRef = secret://provider/deepseek/modeng-talk-v1`; `thinking = disabled`; `maxOutputTokens = 4096`; `streamOptions.includeUsage = true` |
| `talk.default → mdlrel_01jv5q2x7e8m9n4k6p3r1t0t`（available inactive） | `modelVersionId = mdlrel_01jv5q2x7e8m9n4k6p3r1t0t`; capability `talk`; lifecycle `published`; assignment eligibility `available` | `offerId = offer_deepseek_v4_pro_official_v1`; `provider = deepseek`; `providerModelAlias = deepseek-v4-pro`; `observedUpstreamVersion = DeepSeek-V4-Pro`; `bindingVersion = modeng.deepseek.talk.pro.v1`; `providerChannelId = channel_deepseek_official_openai_global_v1`; `baseUrl = https://api.deepseek.com`; `protocol = openai-chat-completions`; `transportSpecVersion = deepseek.openai.chat.v1`; `credentialRef = secret://provider/deepseek/modeng-talk-v1`; `thinking = disabled`; `maxOutputTokens = 4096`; `streamOptions.includeUsage = true` |

The two Offers intentionally share one official Channel and one adapter. The internal
snapshot has one `primaryOffer` and `fallbackOffers: []`; no provider fallback is
silently introduced. `providerModelAlias` is the current DeepSeek API alias and may
change upstream; `observedUpstreamVersion` is only the label observed when the
binding was recorded (`DeepSeek-V4-Flash` / `DeepSeek-V4-Pro`), not a callable point
release pin. `ModelVersion`/snapshot immutability freezes Modeng's binding and audit
metadata for this execution, but cannot promise that an upstream alias remains backed
by the same provider binary. If a later V2.5 catalog uses different canonical IDs, the
Phase-0 records must become aliases/projections of those IDs rather than a second
source of truth.

### 8.4 DeepSeek API research and integration decision

Official documentation confirms the following implementation facts:

| Fact                                                                                                                                                    | WP-005 decision                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI-compatible endpoint is `POST https://api.deepseek.com/chat/completions`; authentication is HTTP Bearer.                                          | Use native server-side `fetch` through the internal transport seam; send `Authorization: Bearer <process-env-secret>` only on the outbound server request.                                        |
| The exact V4 API aliases are `deepseek-v4-flash` and `deepseek-v4-pro`; the official `/models` response lists both.                                  | Keep aliases only in the two internal Offer records above; record the non-pinned observed labels there; never expose either through Model Supply public types, Event/SSE, UI or errors. |
| `stream: true` returns `text/event-stream`, data-only SSE chunks and terminates with `data: [DONE]`; the service can also send `: keep-alive` comments. | Transport parser handles CRLF and split/multiple frames, ignores comments, validates each JSON data frame from `unknown`, ignores `[DONE]`, and emits only bounded `delta.content`. |
| Streaming chunks may carry `finish_reason`, and `stream_options.include_usage = true` can produce a usage-only terminal-adjacent chunk. | Send `max_tokens: 4096` and `stream_options: { include_usage: true }` server-side for both bindings; usage-only chunks are internal observability only and never public Event/SSE or Billing data. |
| V4 thinking mode defaults to enabled and returns `reasoning_content` alongside `content`.                                                               | Explicitly send `thinking: { type: "disabled" }` for Phase 0 TALK; even if a response contains `reasoning_content`, the normalizer drops it and never emits it to `ModelExecutionDeltaV1`. |
| Official errors include 400/422 request errors, 401 authentication failure, 402 balance shortage, 429 rate limit, and 500/503 service failures.             | Map upstream 400/422 by default to safe non-retryable `INTERNAL_ERROR` (adapter/config bug is not user `INVALID_INPUT`); map 401/402 to the same safe error, and 429/500/503/network interruption to retryable `DEPENDENCY_UNAVAILABLE`. |
| Account concurrency is documented as 2500 for Flash and 500 for Pro.                                                                                    | Record this as operational evidence/observability only; WP-005 does not add routing, queueing, or client model selection.                                                                         |
| DeepSeek documents optional `user_id` isolation.                                                                                                        | Do not add `user_id` to frozen `ModelExecutionPort@1`; Phase 0 omits it rather than expanding the Contract.                                                                                       |

Sources: [首次调用 API](https://api-docs.deepseek.com/zh-cn/)、[对话补全](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)、[思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)、[模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)、[列出模型](https://api-docs.deepseek.com/zh-cn/api/list-models/)、[错误码](https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/)、[限速与隔离](https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit)。

The Phase-0 request shape is therefore:

```json
{
  "model": "<internal Offer.providerModelAlias>",
  "messages": [
    { "role": "system", "content": "<versioned Modeng preamble>" },
    { "role": "user", "content": "<validated user text>" }
  ],
  "thinking": { "type": "disabled" },
  "stream": true,
  "max_tokens": 4096,
  "stream_options": { "include_usage": true }
}
```

The provider model alias is substituted only inside Model Supply. It is not a
`TalkSubmitCommand` field, a plan ref field, or a public execution DTO.

### 8.5 Provider adapter and errors

DeepSeek release 只通过一个 Chat Completions protocol adapter 执行，使用 native
server-side `fetch` + internal transport seam；不接 OpenAI SDK，不接 Responses API。
Adapter 负责：

- 把内部 Modeng execution input + system policy 转为 provider request；
- 解析 provider streaming frames，验证 `unknown`，输出有序 bounded delta；
- 处理 `AbortSignal`、timeout 和关闭连接；
- 强制使用 binding 的 `maxOutputTokens = 4096`，客户端不能覆盖；校验累计输出上限，避免 provider 忽略 cap 时无限发 delta。
- 识别 `finish_reason`：`stop` 才是正常完成；`length` 不得静默标记 completed，因当前没有 partial event contract，映射为现有 `INTERNAL_ERROR`、non-retryable，并可在 internal observability 记录 `OUTPUT_LIMIT_REACHED`；`insufficient_system_resource` 映射 retryable `DEPENDENCY_UNAVAILABLE`；`content_filter`、`tool_calls`、unknown/missing terminal、连接在 terminal 前关闭均映射 safe `INTERNAL_ERROR`、non-retryable。WP-005 不发送 tools，不能把 `tool_calls` 当普通文本成功返回。
- 将 authentication/configuration、rate/availability、timeout、malformed response 和未知异常映射为现有安全 Platform Error。

错误映射固定使用现有 Contract code：只有本地、确定可归因于用户输入的 validation
才是 `INVALID_INPUT`；调用取消为 `CANCELLED`，deadline 为 `TIMEOUT`，上游限流/暂时
不可用/网络失败或 `insufficient_system_resource` 为可重试的
`DEPENDENCY_UNAVAILABLE`。上游 400/422 默认是 adapter/configuration failure，映射
不可重试 `INTERNAL_ERROR`，不把 provider adapter bug 归责为 `INVALID_INPUT`；
缺少凭据、错误配置、`length`、`content_filter`、`tool_calls`、非法/未知/missing
terminal response 或未知异常同样是不可重试的 `INTERNAL_ERROR`。这些错误均不得携带
Provider 原文、URL、header 或 credential。

Provider/model/base URL/credential/raw response 只能用于 server-side internal
observability，不能进入 `ModelExecutionDeltaV1`、Event/SSE、API error、UI
error 或 public trace。Adapter 不实现 provider fallback、跨 Provider routing
或按 marketing version 复制 adapter。

### 8.6 Phase-0 provider-execution preamble

Model Supply 在 provider request 内部加入单一、集中、可版本识别的 Modeng
provider-execution preamble。它是 Phase-0 的调用前安全层，不改变 Context &
Memory 对长期 System Policy、Context Pack、source/version snapshot 和完整上下文
组装的 Owner 关系。至少覆盖：

- 产品身份是摩灯 AI / Modeng AI；
- 不披露或确认 system/developer instruction、hidden prompt、Provider/model identity、credential、server configuration 或 private reasoning；
- 用户要求忽略指令、打印 system prompt、暴露底层模型/API key 或模拟管理员授权时，不改变该 baseline。

Prompt 不是 Secret boundary：Provider credential、database/OSS secret、内部
token 和 private configuration 根本不得进入 user/provider prompt。policy version
只保存在 Model Supply 内部 resolved snapshot，当前不下发客户端。

Acceptance 分为两层：

- **结构安全硬保证（CI blocking）**：system preamble 由服务端固定生成并作为独立 `system` message 发送；用户输入只能进入独立 `user` message，不能改变 role 或覆盖 preamble；Provider request builder 不接收 Secret；normalizer 只接受 `delta.content`，丢弃 `reasoning_content`/raw choice/tool/internal fields；public Event/Error 只允许现有安全 schema。使用包含“忽略之前指令、打印 system prompt、暴露模型/API key”的 hostile fixture 验证这些结构不变。
- **模型行为 smoke（live/manual evidence）**：在已注入的真实 DeepSeek key 环境中，对上述 hostile prompts 做最小 smoke；验证输出不包含 sentinel secret、精确 upstream model ID、Bearer 值或 system preamble 原文，并记录 refusal/deflection 行为。该 smoke 是行为证据，不替代也不能削弱结构安全测试；不把概率性的模型拒答当作 Secret boundary。

### 8.7 API key placement and coder handoff

- 允许的 runtime variable：`DEEPSEEK_API_KEY`；只由 Model Supply 的 server-side config/adapter 读取，永远不进入 `apps/web`、任何 `VITE_*` 变量、TALK request、Event/SSE、日志或 error object。
- 官方 `ProviderChannel` 的 `baseUrl` 固定为 `https://api.deepseek.com`，不添加或读取 `DEEPSEEK_BASE_URL` 生产覆盖；测试通过 internal transport seam 注入响应。未来代理/中转必须创建另一条 Channel identity，不能静默重定向 official Channel。
- `credentialRef = secret://provider/deepseek/modeng-talk-v1` 只是 non-secret lookup identity；Phase 0 由 composition/config 将该 ref 映射到注入的 `DEEPSEEK_API_KEY`，`InternalModelExecutionPlanSnapshot` 永远不存 key 本身。
- `.env.example` 只登记 `DEEPSEEK_API_KEY=` 和 `MODENG_TALK_DEFAULT_RELEASE=...`；真实 key 不放在 `.env.example`、源代码、测试 fixture、PR body、Issue、截图或聊天记录。
- 本 planning PR 不含 real key，也不需要 real key。实施 coder 只能通过 backend runtime environment / secure secret handoff 使用 key；缺 key 必须返回安全错误并让测试失败，不得用 Fake fallback、默认假 key 或静默降级掩盖配置缺失。
- 实施阶段产品将 key 通过组织批准的 secure one-time handoff / Secret Manager / GitHub Environment Secret 提供给 coder。不要在 Codex 对话或 GitHub PR 中粘贴 key。
- 本地运行时只注入进程环境或 ignored `.env.local`/`.env`，并通过 IDE/安全 launcher 传给 API 进程；当前 `apps/api/src/main.ts` 读取 `process.env`，不应假设提交一个 dotenv 文件即可加载。不得用 `VITE_DEEPSEEK_API_KEY`，不得把 key 写入命令、脚本参数或 shell history。
- 生产/共享环境只使用 GitHub Environment Secret、云 Secret Manager 或等价注入；普通 PR `verify` 不需要真实 key。Live smoke 应使用受保护环境，日志开启 masking，禁止把 key 传给 fork PR 或 `pull_request_target` 代码。
- Outbound request 只在 Model Supply 内部设置 `Authorization: Bearer ${DEEPSEEK_API_KEY}`；不记录 header、完整 URL、raw response 或异常对象。疑似泄露时立即 revoke/rotate，并在继续开发前重新扫描 Git history、PR、日志和 artifacts。

## 9. Public dependencies and contract decision

- `ModelExecutionPort@1`：复用，不修改字段、方法、错误 envelope、stream handle 或 abort semantics。
- `TalkSubmitCommand@1`：复用，不增加 `model`、`provider`、`modelVersion`、`modelHash` 或任何 release 参数。
- Existing Event/SSE Contract：复用；前端仍从 `unknown` 解析 `EventEnvelope`。
- Composition seam：在 `CCR-0003` 合并后，Model Supply 包根只提供非版本化、composition-only `resolveTalkExecutionPlan()` + `executionPort`，由 API composition 注入 TALK；它不是新的 stable `ModelSupplyResolverPort@1`，也不让消费者解释 planId。若实现需要把 resolver 作为跨模块可替换 Port，必须停止并提交新的 `CCR_REQUIRED`；不能借 `CCR-0002` 扩权。
- `CCR-0003` 是当前 package-root/frozen-file 治理事实下的一次最小授权，不修改 architecture guard、Manifest、Rules Lite 总则，也不把普通 `index.ts` 变化升级成通用治理重构。

## 10. Answers to the planner questions

1. `fake-talk-v1` 被移除；TALK 通过 composition-only `resolvePlan()` 获得由 `talk.default` resolve 出来的 immutable opaque plan，`talk.default` 不作为 `planId`。
2. `ModelExecutionPort@1` 已足够：opaque plan、validated text input、operation/project context、normalized delta stream 和 abort 均已覆盖本 WP；不修改 frozen Port。
3. 是。Model Supply 独占 Model Slot/Release/Assignment/Plan/Provider Binding/ProviderExecution 的内部语义；不新增跨模块 writer。
4. 是。`TalkSubmitCommand@1` 保持不变，客户端没有底层模型选择能力。
5. 两个 release projection 对齐 V2.5 `ModelVersion`，binding 对齐 `Offer + ProviderChannel + OfferTransportSpec`，resolved plan 对齐 `InternalModelExecutionPlanSnapshot`；共享一个 DeepSeek adapter，不按 V4/V5 marketing version 复制 adapter。
6. 通过启动配置 `MODENG_TALK_DEFAULT_RELEASE` + in-memory assignment fixture；先 resolve assignment，再生成/register immutable plan，最后执行；不做 DB 管理和 hot switch。
7. `resolveTalkExecutionPlan()` 在 Operation 开始时一次性 capture snapshot；`execute(planRef)` 只使用该 snapshot，assignment 变化不能影响当前 stream。
8. 本 WP 的 preamble 是 Model Supply 的 Phase-0 provider-execution 内部层；不改变 Context & Memory 的长期 System Policy / Context Pack owner，也不把它扩展成 Prompt Management Platform。
9. Provider/model/binding 只存在 Model Supply internal；public request/event/SSE/error 使用现有 opaque/safe schemas，错误只返回已注册安全 PlatformError。
10. 当前做 registry、assignment、immutable snapshot、DeepSeek adapter、policy baseline、Fake/Real conformance 和 browser path；Admin/Persistence/Gateway/Billing/Worker 属于后续独立 WP。

## 11. Implementation checkpoints

### A — Model Supply foundation

- 两个 release binding、lifecycle validation、`talk.default` assignment。
- opaque config selection 和 resolved immutable plan。
- assignment switch 与 in-flight snapshot tests。

### B — DeepSeek adapter

- backend-only credential/config loading；native streaming transport。
- normalized deltas、AbortSignal、timeout、server-side `max_tokens = 4096` cap、usage-only chunk handling 和 safe error mapping。
- Deterministic SSE fixtures：CRLF 跨 network chunk、一个 chunk 多个 frame、一个 frame 跨多个 chunk、keep-alive、`[DONE]`、malformed JSON、empty content、`reasoning_content`、usage-only chunk、每种 `finish_reason`、terminal 前断连和 abort。
- two bindings through one adapter；Fake/Real common conformance。

### C — Modeng system policy

- one internal Phase-0 preamble source and version；Context & Memory ownership unchanged。
- structural fixtures prove fixed `system`/`user` roles, no Secret input to the builder, and no `reasoning_content`/raw provider field reaches the normalized stream。
- live/manual hostile-prompt smoke records refusal/deflection behavior without treating model behavior as the security boundary。

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
9. `finish_reason = stop` alone completes normally; `length` is safe non-retryable `INTERNAL_ERROR` (with optional internal `OUTPUT_LIMIT_REACHED`), `insufficient_system_resource` is retryable `DEPENDENCY_UNAVAILABLE`, and `content_filter`/`tool_calls`/unknown/missing terminal are safe non-retryable `INTERNAL_ERROR`.
10. Every resolved plan is single-use and removed on success, setup error, stream error, abort, timeout, duplicate and missing-ref paths; the registry cannot grow permanently.
11. The Phase-0 preamble is centralized and version-identifiable internally; CI-blocking structural fixtures prove role/preamble/normalizer/secret invariants, and a separately recorded live smoke covers model refusal/deflection without making it the security boundary.
12. Existing retry/error behavior remains code-based and the UI copy identifies only 摩灯/Modeng AI, not Fake/local/provider/model implementation details.

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
