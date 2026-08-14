# WP-004：Fake TALK End-to-End Vertical Slice

> **Planning status：`PLANNING DRAFT`**  
> **Implementation gate：`CONTRACT_CHANGE_REQUIRED`**  
> 本文件不授权当前 diff 或任何 implementation branch。

## 1. Metadata

- Owner：Repository Owner / Architecture；Backend and Frontend module owners共同评审
- Reviewer：Architecture Review、Backend Review、Frontend Review
- Target modules：`backend-agent-runtime`、`backend-task-engine`、`backend-model-supply`、`backend-event-realtime`、`backend-capability-talk`、`frontend-agent-runtime`、`frontend-realtime`、`frontend-conversation`、`frontend-agent-ui`、`frontend-workspace`、`frontend-project`、`frontend-capability-talk`、`api`、`web`
- Supporting read-only module：`shared-contracts`（WP-003 v1）、`backend-workspace-conversation`、`platform-core`、`worker` manifests
- Phase：Phase 0 — first Fake TALK vertical slice
- Architecture baseline：V2.5；冻结入口为 `docs/architecture/00-*` 与 `docs/architecture/01-*`
- Status：`PLANNING DRAFT` → `APPROVED / IMPLEMENTATION_BLOCKED` → `READY_FOR_IMPLEMENTATION`
- Contract change：`required before implementation — separate CCR-0002 (not created by this task)`
- ADR change：`not required` under the no-new-module/no-owner/no-dependency-direction plan; becomes required if the owner chooses persistent execution, production Worker handoff, a new runtime process, or a true cancellation protocol
- Migration change：forbidden
- Feature flag：none planned
- Retention change：none planned

### Gate evidence

The latest fetched `origin/main` is `5d1d49a`, and it contains the WP-003
implementation merge. Its roadmap status is corrected by the accompanying
governance change to `COMPLETED / FROZEN` with evidence `5d1d49a` / PR #13;
that correction must merge to `main` before this WP-004 Planning Record is
approved. The original WP-003 planning record is not reopened or edited.

The second gate is architectural and executable:

- `packages/shared/contracts` now contains the WP-003 v1 runtime schemas and
  behavior helpers for `TalkSubmitCommand`, `EventEnvelope`, Operation,
  `ExecutionGraphRef`, `TaskRunRef`, `ArtifactBase`, and `PlatformError`.
- `packages/backend/model-supply/src/index.ts` is still bootstrap-only; its
  manifest has no public Port contract or conformance suite.
- Agent Runtime, Task Engine, Event & Realtime, and TALK backend roots are also
  bootstrap-only. A Fake Model cannot be added by making the controller produce
  deltas or by importing another module's `internal/**` implementation.
- The frozen architecture reference defines a stable `ModelExecutionPort`, but
  that Port is not yet an approved public Contract in the current repository.

Therefore implementation must stop until the minimum Model Execution Port
Contract is separately proposed, reviewed, and merged. The proposed change is
described in Section 21; this WP does not create `CCR-0002`, modify
`packages/shared/contracts`, or modify any `module.manifest.json`.

## 2. Goal

After the gates are satisfied, prove one real-browser TALK path:

```text
Browser
  -> TalkSubmitCommand@1
  -> API command boundary
  -> Agent Runtime Operation / ExecutionGraph
  -> Task Engine TaskRun
  -> TALK Capability
  -> approved ModelExecutionPort
  -> deterministic Fake TALK Model
  -> Event & Realtime EventEnvelope stream
  -> frontend realtime decoder
  -> frontend Agent Runtime reducer/store
  -> responsive React chat UI
```

The slice must show deterministic streamed assistant text, completed state,
sanitized retryable failure, and a user retry that submits a new command and a
new Operation. It must not connect to a real model provider.

## 3. Why now

WP-003 has established the first cross-runtime vocabulary. The repository now
has a single runtime-validated language for the command, Operation, bounded
graph, TaskRun reference, ordered events, terminal states, artifact metadata,
and sanitized errors. The next useful proof is an end-to-end behavioral slice;
otherwise each API, Worker, frontend package, and Fake would invent its own
DTOs and state transitions.

This is also the first frontend product slice. It must establish a small,
semantic design foundation while proving that the browser consumes event facts
through the frontend Agent Runtime rather than becoming a second state owner.

## 4. Current repository assessment

| Area                               | Current truth on `origin/main`                                                                                                                                                                    | WP-004 consequence                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared Contract                    | WP-003 v1 implementation is present in `packages/shared/contracts/src/index.ts`; it exports the command, event schemas, parsers, idempotency guard, sequence checks, and Operation stream checks. | Consume it as read-only. No transport DTO copy and no schema extension in this WP.                                                                          |
| Backend Agent Runtime              | `src/index.ts` exports only a bootstrap identity; manifest describes Operation/Execution Graph ownership but has no behavior.                                                                     | Implement the Runtime owner behind its package-root facade and private composition dependencies; no separate `AgentRuntimePort@1`.                          |
| Task Engine                        | Bootstrap-only; manifest owns TaskRun/attempt/lease/recovery conceptually but has no Port.                                                                                                        | Use an in-memory, bounded TaskRun adapter via a package-root factory/private callback; no `TaskEnginePort@1`, Redis, or BullMQ.                             |
| Model Supply                       | Bootstrap-only; no `ModelExecutionPort`, Fake, or conformance suite.                                                                                                                              | This is the blocking Contract gap. Fake must implement the approved Port from the package root.                                                             |
| Event & Realtime                   | Bootstrap-only; no event store/delivery Port.                                                                                                                                                     | Add a bounded in-memory event/replay adapter behind its package-root factory/private callbacks; no `EventStreamPort@1`.                                     |
| TALK backend capability            | Bootstrap-only; manifest already points at Task Engine and Model Supply, but no handler exists.                                                                                                   | Add TALK semantics and output mapping; it cannot own SSE, queue, or model internals.                                                                        |
| API                                | NestJS health-only composition root; no TALK command or SSE route.                                                                                                                                | Add exact TALK submit and operation-event routes using the frozen envelope.                                                                                 |
| Worker                             | Ready-status-only independent process.                                                                                                                                                            | Read-only for this slice unless a later approved design chooses real process handoff.                                                                       |
| Frontend Agent Runtime             | Bootstrap-only; no decoder, reducer, projector, or store.                                                                                                                                         | It becomes the only browser runtime-state writer.                                                                                                           |
| Frontend realtime                  | Bootstrap-only; manifest responsibility is browser SSE/WS transport.                                                                                                                              | Decode transport input to `unknown`, validate `EventEnvelope`, then dispatch facts.                                                                         |
| Frontend conversation/UI/workspace | All public roots are bootstrap-only.                                                                                                                                                              | Extend existing owners; do not create a generic `components/` bucket or a new package.                                                                      |
| Web                                | A single dark Phase 0 card in `App.tsx`; `styles.css` imports Tailwind and sets `color-scheme: dark`.                                                                                             | Replace the bootstrap screen with the first responsive chat composition and host theme activation; semantic token ownership remains in `frontend-agent-ui`. |
| Verification                       | Root scripts include `pnpm verify:module`, `pnpm verify:changed`, `pnpm architecture:check`, `pnpm verify`; no browser E2E script is configured.                                                  | Use existing checks plus real-browser validation; do not claim a nonexistent browser command.                                                               |

## 5. Governance prerequisites

| Prerequisite                           | Decision                                                                    | Reason and required handling                                                                                                                                                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen Contract touched                | **NO for the WP-003 shared schemas; YES for a new RED Model Port Contract** | `shared/contracts` remains read-only. `ModelExecutionPort@1` is the only new public/versioned Port currently proven necessary.                                                                                                                                                            |
| CCR required                           | **YES**                                                                     | A future CCR (proposed `CCR-0002`) must cover only `ModelExecutionPort@1`; this task does not create it.                                                                                                                                                                                  |
| ADR required                           | **NO, conditionally**                                                       | Existing architecture already has Model Supply, Agent Runtime, Task Engine, Event & Realtime, and Capability boundaries. An ADR is required if implementation changes that architecture, introduces a production process/queue/persistence boundary, or adds true Operation cancellation. |
| Manifest change required               | **YES**                                                                     | Model Supply must declare `ModelExecutionPort@1` and its conformance suite; application/package dependencies must be declared explicitly. Other module facades remain implementation-level composition surfaces.                                                                          |
| Architecture change required           | **NO under this plan**                                                      | No new module, process, table Owner, dependency direction, or consistency boundary is proposed. The API-local in-memory adapter is a non-production Fake, not a replacement for PostgreSQL/Worker architecture.                                                                           |
| State-machine change required          | **NO for success/failure/retry**                                            | Use WP-003 `accepted → running → completed/failed`; retry creates a new `TalkSubmitCommand` and Operation. True `cancelled` semantics are not authorized.                                                                                                                                 |
| Design-system boundary change required | **NO**                                                                      | Reuse `frontend-agent-ui` as the foundation owner and `apps/web` only as the theme/layout host. Do not create a new design-system package.                                                                                                                                                |
| Design token delivery/export change    | **YES**                                                                     | The current package exposes only `"."` and `apps/web` does not depend on `frontend-agent-ui`; implementation must authorize the CSS subpath export, package/manifest metadata, and Web workspace dependency/allowlist described in Section 21.2. No new package is created.               |
| Design-reference governance change     | **YES, separate PR**                                                        | `docs/design/apple-design-reference-policy.md` and the `packages/frontend/AGENTS.md` pointer are governance inputs, not WP-004 implementation files.                                                                                                                                      |

### Lifecycle ordering

#### Planning approval

1. Merge the accompanying Roadmap governance correction to `main` first.
2. Review and merge this WP-004 Planning Record. That merge changes the WP
   status to `APPROVED / IMPLEMENTATION_BLOCKED`; it does not create or
   authorize `CCR-0002` and does not authorize an implementation branch.

#### Implementation readiness

3. Merge a separate planning/governance PR containing
   `docs/design/apple-design-reference-policy.md` and the
   `packages/frontend/AGENTS.md` pointer.
4. After Planning Approval, authorize the Design token delivery/export
   metadata exactly as Section 21.2 specifies: the public `./styles.css`
   subpath, the package/manifest declaration, and the Web dependency/allowlist.
5. After Planning Approval, create and merge the focused CCR for
   `ModelExecutionPort@1`. If it changes Owner, dependency direction, process,
   or state semantics, stop and add the required ADR before coding.
6. When the Design Reference Policy, the explicitly authorized token
   delivery/export mechanism, the CCR, and any required ADR are all in `main`,
   WP-004 becomes `READY_FOR_IMPLEMENTATION` and an implementation branch may
   be created.

## 6. Apple Design Reference sources

The design plan follows this source priority:

1. Apple Human Interface Guidelines (HIG), especially [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars), [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection), and [Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards).
2. Owner-provided [macOS 27 Figma Design Resource](https://www.figma.com/design/PYrTYVpoVvM2tQ0LBqVye0/macOS-27--Community-).
3. Owner-provided [iOS Figma Design Resource](https://www.figma.com/design/fNxMOCSjuWCO4uWV9swOij/Untitled).
4. Apple’s [official Design Resources index](https://developer.apple.com/design/resources/) for current platform kits, system font guidance, and licensing terms.
5. Modeng semantic tokens and existing module boundaries.
6. Explicit `MODENG_DERIVED` decisions only where Apple does not define a web
   value or where a web constraint requires an adaptation.

Planning interpretation:

- macOS is the desktop reference for sidebar, toolbar, navigation material,
  density, focus, and keyboard behavior.
- iOS is the responsive reference for compact navigation, touch targets,
  safe-area spacing, mobile composer behavior, and H5 layout.
- Apple resources are reference material, not a license to copy Apple Figma
  variable IDs, component IDs, raw color values, SF font files, or proprietary
  assets into the repository.
- Liquid Glass/material treatment is limited to functional layers such as the
  sidebar, toolbar, and transient controls. The message/content layer remains a
  legible standard surface.

## 7. Design Foundation / Token scope

The semantic token contract belongs to the existing `frontend-agent-ui` module,
which is the Modeng Frontend Foundation/Agent UI owner. The implementation may
place its token stylesheet and primitive styles under that package's existing
`src` implementation zone. The approved delivery shape for this WP is the
workspace-source stylesheet `packages/frontend/agent-ui/src/styles.css`, exposed
from the package root as the public subpath
`@modern-agent/frontend-agent-ui/styles.css`. The package export must be
equivalent to:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./styles.css": "./src/styles.css"
  }
}
```

This is an explicit **Design token delivery/export change: YES**. The current
repository does not support this delivery yet: `frontend-agent-ui` currently
exports only `"."`, its build does not copy CSS into `dist`, and `apps/web`
currently has no dependency on or import from that package. The implementation
must therefore add the controlled package/manifest metadata and Web dependency
allowlist listed in Section 21.2 before importing the stylesheet. Under this
private workspace-source mechanism, no CSS copy step and no `files` change are
needed; a coder must stop for a scope amendment rather than silently changing
that mechanism or using a deep import.

`apps/web` is only the host: it activates `data-theme="light|dark"`, loads the
approved `@modern-agent/frontend-agent-ui/styles.css` public subpath, and
composes the page. It is not
the long-term semantic token owner. Business components must consume semantic
names or mapped utilities, never raw hex values, Apple token names, Figma IDs,
or arbitrary one-off values.

### 7.1 Semantic color tokens

Both `light` and `dark` themes must define every token below. Theme selection
should support a `data-theme="light|dark"` override and a system-preference
default so browser validation can deterministically exercise both appearances.

| Token family   | Required semantic tokens                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Background     | `background.canvas`, `background.surface`, `background.elevated`, `background.sidebar`, `background.overlay` |
| Text           | `text.primary`, `text.secondary`, `text.tertiary`, `text.disabled`, `text.onPrimary`                         |
| Border         | `border.subtle`, `border.strong`, `separator`                                                                |
| Controls       | `control.background`, `control.backgroundHover`, `control.backgroundPressed`, `control.disabled`             |
| Actions/status | `action.primary`, `action.primaryHover`, `destructive`, `error`, `success`, `warning`, `focus`               |

The values are Modeng semantic mappings. If a value is selected by design
judgment rather than directly documented by Apple, record it as
`MODENG_DERIVED:<reason>` in the design policy and token tests.

### 7.2 Typography tokens

Use a system-first web stack such as `-apple-system`, `BlinkMacSystemFont`,
`"Segoe UI"`, `sans-serif`; do not add an unlicensed Apple font file. Define
tokens for family, size, weight, line-height, and letter-spacing for:

- `largeTitle`, `title`, `headline`, `body`, `callout`, `subheadline`,
  `footnote`, `caption`, and `labelControl`.

The exact web pixel values are `MODENG_DERIVED` unless directly documented by
the selected Apple reference. Typography tests must assert token completeness
and that components use token-backed classes/properties.

### 7.3 Spacing, radius, border, elevation, material, and motion

- Spacing: one compact scale, preferably 4-based, with named values from
  `space.1` through `space.12`; components use the scale rather than arbitrary
  `7px`, `13px`, or `19px` values.
- Radius: `radius.control`, `radius.composer`, `radius.surface`,
  `radius.overlay`; each is `MODENG_DERIVED` until a web value is justified.
- Border/focus: `separator`, `border.subtle`, `border.strong`, and a visible
  `focus.ring` with non-color-only focus indication.
- Elevation: `shadow.surface`, `shadow.floating`, `shadow.overlay`; keep the
  message/content layer mostly flat and reserve stronger elevation for
  floating/transient UI.
- Material: `material.sidebar`, `material.toolbar`, and
  `material.transientControl`, each with a solid-surface fallback when
  `backdrop-filter` is unavailable. Do not apply material to every message.
- Motion: `motion.fast`, `motion.normal`, `motion.slow`, and named easing tokens;
  use them for hover/pressed, panel transition, and streaming/status changes.
  Respect `prefers-reduced-motion` by shortening or disabling nonessential
  transitions.
- Layout: `layout.contentMax`, `layout.sidebarWidth`, `layout.composerMax`,
  `layout.compactBreakpoint`, `layout.safeSpacing`, and explicit elevation/z
  layers for content, toolbar, sidebar, floating controls, and overlay. These
  are `MODENG_DERIVED` layout decisions and must be documented as such.

### 7.4 Long-term design reference policy

The single long-term policy entry point should be
`docs/design/apple-design-reference-policy.md`. It is not created by this
planning-only task. The policy must contain:

- the source priority and the two owner-supplied Figma links;
- a query checklist for new components, tokens, typography, material,
  navigation, interaction, and responsive behavior;
- a decision table with `Apple reference`, `Modeng semantic token/component`,
  and `MODENG_DERIVED` rationale columns;
- the rule forbidding Apple Figma IDs, raw hex values, arbitrary Tailwind
  values, unlicensed fonts, and copied proprietary assets in product APIs.

The canonical context pointer must be added to `packages/frontend/AGENTS.md`.
The policy must state that `frontend-agent-ui` owns the semantic token contract,
primitive styles, and Agent UI rendering, while `apps/web` owns only theme
activation, host composition, and app-specific layout.
Because the policy file and AGENTS pointer are governance inputs outside the
WP-004 implementation zones, existing Governance favors a separate
planning/governance PR rather than bundling them with the implementation PR.
That PR should merge after the Roadmap correction and before the WP-004
implementation branch is created. No `apps/web/AGENTS.md` change is required
for this gate.

## 8. Planned UI primitive scope

Only primitives consumed by the first chat are planned:

- `Button` — primary, secondary, destructive, disabled, loading/focus states.
- `IconButton` — explicit accessible label, tooltip/title only where useful,
  keyboard focus, pressed/disabled states.
- `TextArea` / `ComposerInput` — controlled value, submit/disabled state,
  multiline behavior, IME-safe Enter handling, error and focus treatment.
- `Surface` — semantic background/material/elevation variants without business
  knowledge.
- `Divider` / `Separator` — semantic separator token.
- `ScrollArea` — viewport semantics, keyboard access, and scroll anchoring
  hooks; it does not own conversation facts.
- `Spinner` / `ProgressIndicator` — generating state with accessible label.
- Focus treatment utility — shared focus ring and `:focus-visible` behavior.

`Tooltip` is optional and only allowed if an icon-only control has a real
discoverability need. Native labels/ARIA must remain sufficient. Date pickers,
menus, dialogs, selects, tables, artifact galleries, billing controls, and
model selectors are not part of this WP.

## 9. Planned Agent UI scope

Agent UI components receive derived props and callbacks; they do not parse SSE,
create commands, own Operation state, or write a second store.

- `Message` / `MessageItem` with user and assistant variants.
- `MessageList` with empty, streaming, completed, and accessible live-region
  behavior. Streaming deltas should not trigger a screen-reader announcement on
  every token.
- `Composer` with send and generating/disabled states.
- `SendButton` using the primitive controls.
- `StreamingIndicator` and minimal `OperationStatus` projection.
- `ErrorState` with code-based retry action and safe user-facing message.
- `EmptyState` for a new conversation.

No ToolCallCard, Artifact Gallery, image/video/audio card, approval workflow,
batch progress, billing quote, model selector, or resource picker is planned.

## 10. Chat page scope

### Desktop

The product composition should be split across the existing package owners:

- `frontend-project`: project/navigation projection types and a minimal static
  project row for the demo; no new Project persistence contract.
- `frontend-workspace`: `ChatShell`, sidebar/header layout, responsive panel
  composition, and desktop/macOS navigation material.
- `frontend-conversation`: draft, submit/generating interaction,
  timeline projection helpers, and viewport/scroll behavior.
- `frontend-agent-ui`: primitives and Agent UI components listed above.
- `frontend-capability-talk`: TALK-specific renderer/interaction adapter that
  binds the TALK runtime projection to Agent UI props.
- `apps/web`: composition root, API base URL, theme root, and page entry only.

The visible page contains:

1. sidebar/project-conversation navigation foundation;
2. conversation header/toolbar;
3. message scrolling region;
4. user message and assistant message;
5. empty state;
6. streaming/generating state;
7. composer and send action;
8. failed state with retry action;
9. minimal Operation status indication.

### Mobile/H5

Use the same semantic components and token names. Change layout through
responsive composition: compact/collapsible navigation, full-width content and
composer, safe bottom spacing for the on-screen keyboard, touch-sized controls,
and no second mobile business component tree. The browser breakpoint and exact
spacing are `MODENG_DERIVED` and must be recorded, not called Apple values.

### Cancellation boundary

WP-003 has a `cancelled` Operation status but no cancel Command or approved
cancel Port. WP-004 therefore provides no generation-stop affordance or local
substitute that could be mistaken for backend cancellation. The composer
remains disabled while generating; formal Stop Generation belongs to a future
Cancel Contract Work Package.

## 11. Fake TALK execution scope

### 11.1 Approved-after-CCR Port shape

The separate CCR must be narrowed to the only Port whose public/versioned
stability is proven by this slice:

- `ModelExecutionPort@1` owned by `backend-model-supply`, with an opaque plan
  reference, validated input boundary, execution context containing operation
  identity and abort signal, and a typed stream/handle of normalized text
  chunks. It must not expose Provider, Channel, Credential, raw response,
  routing, or prompt fields.

The following boundaries remain package-root composition APIs or private
dependency-injection callbacks in this one-slice implementation. They are not
new `@1` Ports and must not be frozen “for future convenience”:

| Candidate              | Public/versioned Port required by this slice? | Proof and limit                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskEnginePort`       | **NO**                                        | Task Engine ownership is still enforced: the API composition invokes the package-root in-memory Task Engine adapter through a private callback, and Runtime never writes `TaskRun`. There is one adapter and one consumer; a reusable versioned Port is not yet proven. |
| `CapabilityOutputPort` | **NO**                                        | The TALK handler returns a private normalized output stream to the single Runtime composition. No second Capability consumer or adapter is introduced; the handler still cannot build events or write SSE.                                                              |
| `EventStreamPort`      | **NO**                                        | The Event & Realtime package-root in-memory adapter owns sequence/replay/delivery, while API composition supplies the private append/subscribe callbacks. The public network fact remains WP-003 `EventEnvelope`; no reusable event adapter Port is frozen.             |
| `AgentRuntimePort`     | **NO**                                        | API is the sole composition consumer and calls the Runtime package-root facade. A separately versioned Runtime Port would add no independently replaceable adapter or consumer in this slice.                                                                           |

If implementation discovers that any candidate must be imported as a stable
cross-module Port rather than a private composition dependency, stop and submit
a focused follow-up CCR for that one Port. No candidate may be introduced into
CCR-0002 merely to anticipate future adapters.

### 11.2 Success path

1. API receives `unknown`, parses it with `parseTalkSubmitCommand`, and rejects
   invalid/oversized/unknown-field input with the frozen sanitized error shape.
2. Agent Runtime applies command idempotency, creates a single accepted
   Operation and one-root TALK `ExecutionGraphRef`.
3. Runtime requests one TaskRun from Task Engine; Task Engine transitions its
   own ephemeral `pending → running` fact.
4. TALK Capability invokes the injected Model Supply Port with a fixed Fake plan
   reference and returns normalized text chunks through its private composition
   stream.
5. Runtime/Event & Realtime emits `operation.accepted`, ordered
   `talk.output.delta` events, then `operation.completed` with a ready
   `ArtifactBase` reference. The event stream passes the shared Contract
   validators and sequence checks.
6. API exposes the accepted event as the submit response and replays/delivers
   the same EventEnvelope values over SSE. SSE is only a transport mapping.
7. Frontend realtime validates each received value from `unknown`, dispatches
   the accepted facts to Frontend Agent Runtime, and the UI renders the derived
   assistant text incrementally.

The deterministic default Fake response should use at least three bounded
chunks, for example `delta 1`, `delta 2`, and `delta 3`, followed by completion.
The exact user-facing language is an implementation fixture, not a new Contract.

### 11.3 Failure and retry path

- The Fake adapter receives an explicit test/composition configuration, for
  example `failureMode: "fail-once"` with a fixed safe error fixture. The
  configuration is injected when constructing the Fake Model or the API test
  composition; it is never read from user text, query parameters, or
  `TalkSubmitCommand` fields. User text remains pure TALK business input.
- The handler maps the failure to an existing WP-003 `PlatformError` code such
  as `DEPENDENCY_UNAVAILABLE`, with a safe message and `retryable: true`.
  Raw errors, provider-like payloads, prompts, stack traces, and credentials
  never cross the boundary.
- Runtime emits `operation.failed`; Event & Realtime preserves its sequence;
  Frontend Agent Runtime derives `failed` and exposes Retry from the code and
  `retryable` flag, never from `error.message`.
- Retry generates a new `commandId` and new `idempotencyKey` for the same user
  text, therefore creates a new Operation. The original failed Operation is
  immutable. The injected Fake failure budget is scoped to the test/runtime
  instance so the configured first failure and subsequent retry completion are
  deterministic.

### 11.4 Runtime and infrastructure limit

The browser proof may run an in-process, memory-only Event & Realtime and Task
Engine adapter inside `apps/api`. This is a test/demo adapter, not business
fact storage and not production orchestration. It must not add Redis, BullMQ,
Prisma, migrations, Provider SDKs, credentials, or a Worker-to-API transport.
Moving execution to `apps/worker` or adding durable outbox/replay is a separate
Work Package and, if it changes the runtime boundary, an ADR.

## 12. Module ownership

| Module                                    | Owns in WP-004                                                                                                                | Must not own                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `shared-contracts`                        | Existing WP-003 schemas and behavior helpers, read-only                                                                       | Any new field/event/status/Port in this WP                                    |
| `backend-agent-runtime`                   | Operation/Execution Graph logical lifecycle, idempotency coordination, terminal status, and private composition orchestration | TaskRun storage, SSE, Model Provider details, direct Prisma/BullMQ            |
| `backend-task-engine`                     | Ephemeral TaskRun/attempt facts and transitions behind its package-root adapter                                               | Operation/Graph status, Event semantics, Model behavior                       |
| `backend-model-supply`                    | Approved Model Execution Port and Fake Model implementation                                                                   | Provider SDK, credential, routing, real provider, TALK UI semantics           |
| `backend-capability-talk`                 | TALK input-to-model invocation and private normalized output mapping                                                          | Event envelope construction, SSE, queue, billing, Provider SDK                |
| `backend-event-realtime`                  | Event envelope validation boundary, sequence, in-memory replay/delivery adapter behind its package-root factory               | Operation/TALK meaning, TaskRun/Artifact writes                               |
| `apps/api`                                | HTTP/SSE composition root and test-only in-memory adapter wiring                                                              | Domain state ownership, direct Model Fake logic, raw error exposure           |
| `apps/worker`                             | Read-only context unless separately authorized                                                                                | Production queue expansion or new execution process in this WP                |
| `frontend-agent-runtime`                  | Browser event decode/reduce/store and recovery projection                                                                     | SSE transport, UI rendering, command persistence                              |
| `frontend-realtime`                       | Browser SSE/stream transport and reconnect/after-sequence adapter                                                             | Domain reducer or UI state                                                    |
| `frontend-conversation`                   | Draft, composer, timeline/viewport interaction state                                                                          | Event parsing, Operation fact ownership                                       |
| `frontend-agent-ui`                       | Semantic token contract, primitive styles, and Agent UI rendering with derived props                                          | API calls, SSE parsing, runtime truth, app-specific theme activation          |
| `frontend-workspace` / `frontend-project` | Page/layout/navigation composition and projection                                                                             | Backend data ownership, shared Contract mutation                              |
| `frontend-capability-talk`                | TALK-specific renderer and interaction adapter                                                                                | Generic design system, network transport, second state source                 |
| `apps/web`                                | React/Vite composition root, theme activation, and app-specific layout composition                                            | Semantic token ownership, domain reducers, raw event parsing, backend imports |

No module owns a database table or migration in this WP.

## 13. Allowed write paths

The following are the exact implementation zones to be authorized only after
the CCR and this record are approved and merged. They are not written in the
current planning task.

### Backend and API

- `packages/backend/agent-runtime/src/index.ts`
- `packages/backend/agent-runtime/src/internal/**`
- `packages/backend/agent-runtime/src/**/*.test.ts`
- `packages/backend/task-engine/src/index.ts`
- `packages/backend/task-engine/src/internal/**`
- `packages/backend/task-engine/src/**/*.test.ts`
- `packages/backend/model-supply/src/index.ts`
- `packages/backend/model-supply/src/internal/**`
- `packages/backend/model-supply/src/**/*.test.ts`
- `packages/backend/event-realtime/src/index.ts`
- `packages/backend/event-realtime/src/internal/**`
- `packages/backend/event-realtime/src/**/*.test.ts`
- `packages/backend/capabilities/talk/src/index.ts`
- `packages/backend/capabilities/talk/src/internal/**`
- `packages/backend/capabilities/talk/src/**/*.test.ts`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/talk.controller.ts`
- `apps/api/src/talk.controller.test.ts`
- `apps/api/src/talk.composition.ts`
- `apps/api/src/talk.composition.test.ts`

`apps/worker/src/**` is not in the default write set. It may be added only by a
reviewed scope amendment that does not introduce production queue/process
behavior.

### Frontend and web

- `packages/frontend/agent-runtime/src/index.ts`
- `packages/frontend/agent-runtime/src/internal/**`
- `packages/frontend/agent-runtime/src/**/*.test.ts`
- `packages/frontend/realtime/src/index.ts`
- `packages/frontend/realtime/src/internal/**`
- `packages/frontend/realtime/src/**/*.test.ts`
- `packages/frontend/conversation/src/index.ts`
- `packages/frontend/conversation/src/internal/**`
- `packages/frontend/conversation/src/**/*.test.ts`
- `packages/frontend/agent-ui/src/index.ts`
- `packages/frontend/agent-ui/src/internal/**`
- `packages/frontend/agent-ui/src/**/*.css`
- `packages/frontend/agent-ui/src/**/*.test.tsx`
- `packages/frontend/workspace/src/index.ts`
- `packages/frontend/workspace/src/internal/**`
- `packages/frontend/workspace/src/**/*.test.tsx`
- `packages/frontend/project/src/index.ts`
- `packages/frontend/project/src/internal/**`
- `packages/frontend/project/src/**/*.test.ts`
- `packages/frontend/capabilities/talk/src/index.ts`
- `packages/frontend/capabilities/talk/src/internal/**`
- `packages/frontend/capabilities/talk/src/**/*.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/bootstrap-store.ts`
- `apps/web/src/**/*.test.tsx`

### Controlled metadata paths

Only when explicitly authorized by the approved record and, where applicable,
the CCR:

- `apps/api/module.manifest.json`
- `apps/web/module.manifest.json`
- `packages/backend/agent-runtime/module.manifest.json`
- `packages/backend/task-engine/module.manifest.json`
- `packages/backend/model-supply/module.manifest.json`
- `packages/backend/event-realtime/module.manifest.json`
- `packages/backend/capabilities/talk/module.manifest.json`
- `packages/frontend/agent-runtime/module.manifest.json`
- `packages/frontend/realtime/module.manifest.json`
- `packages/frontend/conversation/module.manifest.json`
- `packages/frontend/agent-ui/module.manifest.json`
- `packages/frontend/workspace/module.manifest.json`
- `packages/frontend/project/module.manifest.json`
- `packages/frontend/capabilities/talk/module.manifest.json`
- `packages/frontend/agent-ui/package.json` only for the explicitly authorized
  `exports["./styles.css"]` CSS subpath; no `files` change is authorized by
  this mechanism;
- `apps/web/package.json` only to add the
  `@modern-agent/frontend-agent-ui` workspace dependency;
- the corresponding module `package.json` files only for declared workspace/
  runtime dependencies and React package ownership;
- `packages/frontend/agent-ui/module.manifest.json` only to declare the public
  `./styles.css` export;
- `apps/web/module.manifest.json` only to allow the `frontend-agent-ui`
  workspace dependency;
- `pnpm-lock.yaml` only for those dependency changes;

The following are **not** WP-004 implementation paths. They belong in the
separate planning/governance PR required by Section 7.4:

- `docs/design/apple-design-reference-policy.md`;
- `packages/frontend/AGENTS.md` for the policy pointer.

## 14. Read-only dependencies

- `AGENTS.md` and all applicable nested `AGENTS.md` files.
- `docs/roadmap/IMPLEMENTATION.md` and the WP-003 status evidence.
- `docs/architecture/00-总体架构与依赖边界.md`.
- `docs/architecture/01-跨模块契约与架构决策.md`.
- `AI工程治理与Work-Package规范.md` and `docs/governance/**`.
- `docs/work-packages/WP-003-contract-kernel.md` and `docs/contract-changes/CCR-0001.md`.
- `packages/shared/contracts/**` through its public root; no source or test
  changes are allowed.
- `packages/shared/domain-kernel/**` through its public root.
- the manifests, READMEs, public roots, and relevant tests for all modules in
  Sections 4 and 12.
- `apps/worker/**` for composition context only unless a scope amendment is
  approved.
- Apple HIG and the owner-provided Figma references in Section 6.
- `docs/future/**` and `docs/source-material/**` remain non-authoritative and
  are not implementation requirements for this WP.

## 15. Forbidden scope

- Any edit to `packages/shared/contracts/src/index.ts`, its tests, README,
  package manifest, or lockfile for a new WP-004 field/event/status.
- Any real OpenAI, Kimi, Claude, 豆包, or other Provider integration, SDK,
  credential, routing policy, Provider Job, or provider response.
- Prisma, PostgreSQL table, migration, repository, production Redis, BullMQ,
  outbox persistence, Scheduler/Reconciler, or Worker scaling changes.
- Capability/API/Worker direct imports of Prisma, BullMQ, Provider SDK, or
  another module's `internal/**` path.
- Controller-local Fake Model, controller-local EventEnvelope construction, or
  a frontend/backend duplicate Contract.
- A second Operation/Conversation state source in React, a page that parses SSE,
  or a message component that owns domain state.
- A new design-system package, complete enterprise component library, or
  components not used by the first chat.
- True backend cancellation without a separately approved cancel Contract.
- IMAGE, VIDEO, AUDIO, SUMMARY, Campaign, Billing, Memory, ACP compression,
  approval, artifact gallery, or model selector behavior.
- Copying Apple proprietary assets, Figma IDs, Apple raw token names, raw hex,
  arbitrary Tailwind values, or unlicensed Apple fonts into the product API.
- Modifying the WP-003 planning record to make it look frozen or modifying the
  roadmap as a side effect of this WP-004 planning task.

## 16. State/data flow

```text
1. Web builds TalkSubmitCommand@1 from local project reference.
2. API receives unknown and validates TalkSubmitCommandSchema.
3. Agent Runtime accepts idempotency, creates Operation + one-root Graph.
4. Event & Realtime appends operation.accepted with sequence 1.
5. Task Engine creates TaskRun; Runtime starts the TALK node.
6. TALK Capability calls ModelExecutionPort@1 with a fixed opaque Fake plan.
7. Fake Model yields bounded text chunks.
8. The private TALK composition stream reports chunks; Runtime/Event & Realtime
   emits ordered `talk.output.delta` events.
9. Runtime creates a ready ArtifactBase reference and emits operation.completed.
10. API maps the same envelopes to POST response and replayable SSE.
11. Frontend realtime validates unknown -> EventEnvelope and dispatches facts.
12. Frontend Agent Runtime reducer is the only browser runtime-state writer.
13. Agent UI reads derived state; Conversation owns only draft/viewport UI state.
14. Retry creates a new command/idempotency key and new Operation; the failed
    Operation never changes.
```

The in-memory adapter must retain events by `operationId` until the local browser
stream has replayed them. Sequence and event IDs remain Contract facts; SSE `id`
is only a transport hint. No in-memory state may be presented as durable
PostgreSQL truth.

## 17. Acceptance Criteria

The implementation may be considered for review only if all criteria below are
met and the governance gates are closed:

1. The WP-003 status inconsistency is reconciled on `main`; this record and the
   separate Port CCR are merged before implementation begins.
2. No WP-003 shared schema is changed. All cross-boundary values enter through
   the existing runtime parsers and all events pass `EventEnvelope` and stream
   validation.
3. The approved Model Supply Port is consumed from the package root, and the
   Fake Model passes the same behavioral conformance suite intended for a future
   real adapter.
4. A valid command produces exactly one accepted Operation, one bounded TALK
   graph, and one TaskRun for the successful Fake run. Repeated identical
   idempotency input does not create a second Operation/TaskRun.
5. The browser observes accepted → delta(s) → completed and renders the
   assistant output incrementally. The completed event references a ready
   text ArtifactBase.
6. The deterministic failure produces accepted → failed with an existing safe
   PlatformError code and `retryable: true`; no raw internal/provider data is
   observable in HTTP, SSE, DOM, or public trace.
7. Retry is code/flag-driven, creates a new command and Operation, and can
   complete the configured one-shot failure fixture. The old failed Operation is
   immutable.
8. Empty, user, assistant, streaming, completed, failed, retry, and disabled /
   generating composer states are covered by component or view-model tests.
9. Light and dark token maps are complete; the semantic token contract and
   primitive styles are owned by `frontend-agent-ui`; `apps/web` only activates
   the theme and composes the host. Focus, keyboard, reduced-motion, and basic
   ARIA behavior are covered by tests and real-browser checks.
10. Desktop and H5/mobile use the same semantic components and token foundation;
    no duplicated mobile business state or component tree exists.
11. No production Redis/BullMQ/Prisma/Provider/Worker expansion, migration,
    feature flag, retention policy, credential, or external side effect is
    introduced.
12. All imports use package-root public APIs, all manifest dependencies are
    declared, and architecture checks pass with the correct `ARCH_BASE_SHA`.

## 18. Required tests

### Contract consumer and Port tests

- Existing WP-003 contract tests remain green and are consumed read-only.
- Port schema/behavior fixtures cover valid input, invalid input, unknown
  fields, bounded text, safe errors, lifecycle-abort handling that is not user
  cancellation, duplicate invocation, and deterministic Fake configuration.
- Model Fake and future-adapter fixture APIs share one `ModelExecutionPort`
  conformance suite; no real network or Provider SDK call is permitted.

### Backend behavior tests

- Agent Runtime: accepted/running/completed/failed transitions, terminal
  immutability, command idempotency, one graph/root, and failure mapping.
- Task Engine: pending/running/completed/failed TaskRun state, attempt bound,
  duplicate submission, and no Operation writes.
- TALK Capability: output chunks, safe PlatformError mapping, no EventEnvelope
  construction, no provider fields, and no infrastructure imports.
- Event & Realtime: per-Operation sequence, replay from `afterSequence`, no
  duplicate delivery, terminal stream behavior, and unknown non-critical event
  retention/ignore behavior.
- API: POST validation/accepted response, SSE mapping/replay, invalid command
  response, failure response, and no raw error leakage.
- Vertical integration success:
  `TalkSubmitCommand → accepted → delta(s) → completed`.
- Vertical integration failure:
  `TalkSubmitCommand → accepted → failed → PlatformError`.

### Frontend tests

- Frontend Agent Runtime: parse from `unknown`, accepted/running-derived
  generating state, delta accumulation, completion, failure, retry projection,
  duplicate sequence handling, and unknown non-critical event handling.
- Realtime: SSE chunk framing, JSON parsing, `EventEnvelope` validation,
  reconnect/after-sequence handoff, and transport error separation.
- Conversation: empty draft, IME-safe submission, disabled/generating composer,
  scroll anchoring, and retry callback.
- Agent UI: empty, user, assistant, streaming, completed, failed, retry,
  spinner, disabled, focus, accessible labels, and no message-state ownership.
- Token foundation: complete light/dark variable maps, semantic class usage,
  no unauthorized raw design values in the new business UI, and reduced-motion
  fallback.

### Architecture/security tests

- Public-root imports only; no deep imports or backend/frontend inversion.
- Manifest dependency and public export declarations match implementation.
- No Prisma, BullMQ, Redis, OSS, Provider SDK, credential, raw provider data,
  system prompt, hidden reasoning, or stack trace in public output.
- Run the existing architecture fixtures and secret scan; do not add a custom
  linter when existing checks can express the invariant.

## 19. Browser / visual verification

The implementation must be exercised in a real browser, not only by unit tests.
The repository currently has no browser E2E script, so the following is a
manual/in-app Browser validation protocol and must not be reported as a command
that does not exist.

### Desktop run

- Start the already-supported local app processes with `pnpm dev:api` and
  `pnpm dev:web`.
- Verify at a desktop viewport such as 1440×900 in light and dark appearances.
- Submit normal text; observe user message, generating indicator, multiple
  streamed assistant deltas, completion, and scroll anchoring.
- Run the browser against the explicitly configured `fail-once` Fake composition;
  submit ordinary user text and verify sanitized error state and Retry.
- Activate Retry; verify a new Operation completes and the old failed message
  remains an immutable historical result.
- Exercise keyboard Tab/Shift+Tab, Enter/IME submission, focus ring, disabled
  send, and reduced-motion preference. No Stop Generation control is present.

### H5/mobile run

- Verify at a mobile viewport such as 390×844 and a narrow intermediate width.
- Confirm the same components/tokens handle compact navigation, safe composer
  spacing, touch-sized controls, keyboard overlap, message scrolling, streaming,
  failure, retry, light mode, and dark mode.
- Confirm no horizontal overflow, hidden focused control, or content obscured by
  the composer/sidebar layer.

### Visual evidence

The implementation delivery report must record viewport, appearance, browser,
success/failure/retry observations, and any `MODENG_DERIVED` adjustment. This
planning task creates no screenshots or browser artifacts.

## 20. Verification commands

Only run commands that exist in the repository. The future implementation PR
must run, with its PR base SHA supplied where required:

```text
pnpm verify:module backend-agent-runtime
pnpm verify:module backend-task-engine
pnpm verify:module backend-model-supply
pnpm verify:module backend-event-realtime
pnpm verify:module backend-capability-talk
pnpm verify:module frontend-agent-runtime
pnpm verify:module frontend-realtime
pnpm verify:module frontend-conversation
pnpm verify:module frontend-agent-ui
pnpm verify:module frontend-workspace
pnpm verify:module frontend-project
pnpm verify:module frontend-capability-talk
pnpm verify:module api
pnpm verify:module web
pnpm test
pnpm architecture:fixtures
ARCH_BASE_SHA=<PR base SHA> pnpm architecture:check
pnpm verify:changed
pnpm verify
pnpm security:scan:staged
```

The module command names are the names expected by the current module
manifests; if a command is not available when implementation starts, report it
as unavailable instead of creating a fake passing checker. Browser validation
in Section 19 is an additional required evidence step.

## 21. Contract / ADR / Manifest change policy

### 21.1 Required separate CCR

After this Planning Record is approved, create a separate `CCR-0002` (number to
be confirmed by the Owner) before implementation. It must cover only the one
public/versioned Port proven necessary by this slice:

- `ModelExecutionPort@1` owned by Model Supply, including opaque plan identity,
  normalized text stream/handle, safe input/context boundary, abort behavior,
  stable error mapping, and Fake/real conformance.

The CCR must also state why `TaskEnginePort`, `CapabilityOutputPort`,
`EventStreamPort`, and `AgentRuntimePort` are **not** frozen as public/versioned
Ports in WP-004: each has one in-process composition consumer/adapter and can be
represented by package-root factories plus private callbacks while preserving
the existing Owner boundaries. If implementation proves otherwise, stop and
submit a separate focused CCR for that candidate; do not expand CCR-0002 for
future convenience.

The CCR must include the Model Port owner/version, compatibility, affected
modules, and fixtures for bounded input, safe errors, duplicate invocation,
configured Fake failure, normalized deltas, lifecycle abort, and no raw internal
data.

This CCR must not add a provider/model field to `TalkSubmitCommand`, a new
network event, a new Operation status, a billing field, or a production queue.
If true cancellation is desired, it needs an additional explicit Cancel
Contract proposal; WP-004 has no generation-stop control.

### 21.2 Manifest and package metadata

After the Planning Record is merged and the implementation entry gates are
closed, update only the listed metadata paths to declare:

- public `ModelExecutionPort@1` and its conformance ownership in Model Supply;
- existing-direction dependencies for API/Web and the selected frontend/backend
  package roots;
- package runtime dependencies for shared contracts, React, and any already
  approved workspace package imports.

The following Design token delivery/export change is explicitly authorized by
this Planning Record and is an implementation prerequisite, not an invitation
to add another package or broaden the public surface:

1. Create `packages/frontend/agent-ui/src/styles.css` as the semantic Light/Dark
   token stylesheet and primitive-style delivery file. This path is included in
   the Allowed Write Paths as `packages/frontend/agent-ui/src/**/*.css`.
2. Add the public package-root subpath
   `@modern-agent/frontend-agent-ui/styles.css` through
   `packages/frontend/agent-ui/package.json`:
   `exports["./styles.css"] = "./src/styles.css"`.
3. Add `"./styles.css"` to
   `packages/frontend/agent-ui/module.manifest.json` `publicExports`.
4. Add `@modern-agent/frontend-agent-ui` as a workspace dependency of
   `apps/web`, and add `frontend-agent-ui` to
   `apps/web/module.manifest.json` `allowedDependencies`.
5. Have `apps/web` consume the stylesheet only through the public package
   subpath; `apps/web/src/styles.css` remains the host layer for Tailwind,
   theme activation/mapping, and app layout. It must not become a second
   semantic token owner.

The selected mechanism intentionally uses the private workspace package's
source CSS path, so the existing TypeScript build does not need a CSS copy
step and `packages/frontend/agent-ui/package.json` `files` does not need to
change. If the actual bundler cannot resolve this declared public subpath, stop
and request a reviewed delivery/export amendment; do not deep-import
`frontend-agent-ui/src/**` or silently add an unapproved build/export mechanism.

No manifest may declare a deep import, Provider SDK, Prisma, BullMQ, or an
unowned table. No package boundary is added.

### 21.3 ADR policy

No ADR is needed if the implementation remains an in-process Fake adapter under
the already-frozen modular-monolith boundaries. Stop and request an ADR if a
review proposes persistent Event/Task facts, real Worker handoff, new queue or
process semantics, a new Owner, a new consistency transaction, or backend
Operation cancellation.

## 22. Implementation strategy and checkpoints

The following are internal construction checkpoints within the same WP-004
implementation branch. They do not create new Work Packages, public parallel
architectures, or additional state owners.

### Checkpoint A — Design Foundation + static Chat

- Merge the separate Roadmap correction and Apple design governance PR first.
- Complete the explicitly authorized token delivery/export prerequisite:
  declare the `./styles.css` package subpath, the corresponding manifest
  public export, the Web workspace dependency/allowlist, and then add the
  semantic Light/Dark token foundation and primitive styles under the
  `frontend-agent-ui` implementation zone. Let `apps/web` provide only the
  `data-theme` activation, host Tailwind mapping, and page composition. Record
  all non-Apple web values as `MODENG_DERIVED` decisions.
- Build the static responsive ChatShell, sidebar/header, empty state, message
  shapes, composer, generating/disabled state, and error/retry presentation.
- Exit evidence: token completeness tests, static component/view-model tests,
  desktop/mobile layout inspection, and no generation-stop control.

### Checkpoint B — Backend Fake TALK

- After the focused `ModelExecutionPort@1` CCR is approved, implement the
  backend Runtime, TaskRun owner, TALK handler, Fake Model, and Event & Realtime
  in-memory composition.
- Inject success/failure behavior through Fake adapter/test composition config;
  do not add a failure marker to user text or the command.
- Exit evidence: accepted → delta(s) → completed and accepted → failed vertical
  integration tests, idempotency, sanitization, and package-root boundary checks.

### Checkpoint C — Frontend Runtime + SSE

- Implement the browser decoder, `EventEnvelope` validation, reducer/store,
  SSE adapter, reconnect/replay handoff, draft/composer interaction, and TALK
  projection wiring.
- Keep SSE parsing in `frontend-realtime` and runtime fact writes in
  `frontend-agent-runtime`; UI remains derived.
- Exit evidence: frontend runtime/realtime/conversation tests and a local API
  stream consumed without page-level event parsing.

### Checkpoint D — Full browser integration

- Compose the API and Web roots, run success and explicitly configured
  fail-once Fake compositions, and validate retry with ordinary user text.
- Exercise desktop and H5/mobile viewports, Light/Dark appearances, streaming,
  failure, retry, keyboard/focus, scroll, and responsive safe spacing.
- Exit evidence: real-browser validation record plus all required repository
  verification commands. No generation-stop or backend cancellation is added.

### Checkpoint rule

Each checkpoint may be reviewed independently, but all four remain one WP and
must land as one coherent vertical slice. A failed checkpoint blocks completion;
it does not authorize a workaround, a second state source, or a future Port
surface expansion.

## 23. Completion rule

### Planning completion

Planning is complete when:

1. The Roadmap correction is merged to `main`, recording WP-003 as
   `COMPLETED / FROZEN`.
2. This WP-004 Planning Record is reviewed and merged to `main`.

At that point the lifecycle status is `APPROVED / IMPLEMENTATION_BLOCKED`.
The WP plan does not wait for the CCR, Design Reference Policy, or ADR to be
merged before receiving Planning Approval, and it does not authorize coding.

### Implementation entry gates

Before creating the WP-004 implementation branch, all of the following must be
in `main`:

1. The separate Apple Design Reference governance PR, including
   `docs/design/apple-design-reference-policy.md` and the
   `packages/frontend/AGENTS.md` pointer.
2. The explicitly authorized Design token delivery/export metadata change:
   `frontend-agent-ui/styles.css` public subpath, package/manifest export,
   Web dependency/allowlist, and no deep import.
3. The focused `ModelExecutionPort@1` CCR, created only after Planning Approval,
   reviewed, and merged; this task does not create it.
4. Any ADR required by Architecture Review; under the stated invariant-preserving
   implementation, record `ADR required = NO`.

When these gates are complete, the lifecycle status becomes
`READY_FOR_IMPLEMENTATION` and the implementation branch may be created. The
implementation PR is complete when all acceptance criteria, tests,
architecture/security checks, and real-browser evidence pass. The delivery
report must state modified files, Public Contract status, Owner/Manifest
changes, migration/flag/retention and external-side-effect status, actual
commands/results, unverified items, risks, and rollback. Rollback is code
rollback only: there is no migration, credential, provider, queue, or durable
data side effect in the planned Fake slice.
