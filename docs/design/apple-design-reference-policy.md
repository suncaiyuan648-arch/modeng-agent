# Apple Design Reference Policy

> STATUS: NORMATIVE / GOVERNANCE INPUT
> Scope: Modeng browser UI and frontend design decisions

This policy is the canonical design-reference entry point for frontend work.
It translates Apple-oriented references into Modeng semantic tokens and UI
primitives; it does not make Apple proprietary assets, identifiers, or raw
platform values part of a product Contract.

## Source priority

Use sources in this order and record the source used for each non-trivial
design decision:

1. Apple Human Interface Guidelines, especially [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars), [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection), and [Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards).
2. The owner-provided [macOS 27 Figma Design Resource](https://www.figma.com/design/PYrTYVpoVvM2tQ0LBqVye0/macOS-27--Community-).
3. The owner-provided [iOS Figma Design Resource](https://www.figma.com/design/fNxMOCSjuWCO4uWV9swOij/Untitled).
4. Apple’s [official Design Resources index](https://developer.apple.com/design/resources/) for current platform kits, system guidance, and licensing terms.
5. Existing Modeng semantic tokens, frontend module boundaries, and approved Work Package decisions.
6. `MODENG_DERIVED` decisions where Apple does not define a web value or a web
   constraint requires an adaptation.

## Required query checklist

Before adding or materially changing a frontend component, answer the items
that apply:

- Which Apple guidance or owner-provided reference informs the visual,
  interaction, or accessibility decision?
- Which Modeng semantic token, UI primitive, or Agent UI component owns the
  decision?
- Is the behavior platform-specific, or should responsive web composition
  adapt it across desktop and H5/mobile?
- Which keyboard, focus, touch-target, reduced-motion, contrast, and live-region
  behaviors must be validated?
- Is the value directly supported by the selected reference, or must it be
  recorded as `MODENG_DERIVED:<reason>`?
- Does the change introduce a public Contract, package export, dependency,
  Owner, state, or cancellation semantic change requiring governance review?

Apply the same checklist when introducing colors, typography, materials,
navigation, responsive layout, interaction states, motion, or new primitive
variants.

## Decision record shape

Design notes and review descriptions should use this table when a decision is
not self-evident:

| Apple reference                             | Modeng semantic token/component     | `MODENG_DERIVED` rationale                                       |
| ------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| Link to the selected HIG or owner reference | Token, primitive, or Agent UI owner | Required only for a web adaptation or value not defined by Apple |

`MODENG_DERIVED` records explain the adaptation; they must not be presented as
Apple recommendations.

## Ownership and implementation rules

- `packages/frontend/agent-ui` owns the semantic token contract, primitive
  styles, and Agent UI rendering.
- `apps/web` owns theme activation, host composition, and app-specific layout;
  it is not a second semantic-token owner.
- Frontend modules consume package-root Public APIs and approved semantic names;
  they do not deep-import another module’s `internal/**` paths.
- Semantic values must be token-backed. Components must not introduce raw hex
  values, arbitrary one-off spacing, or arbitrary Tailwind values where a
  semantic token or primitive exists.
- Material treatment is limited to functional layers such as sidebar, toolbar,
  and transient controls. Message/content surfaces remain legible standard
  surfaces with an accessible contrast fallback.
- Desktop and H5/mobile use the same semantic components and state model;
  responsive composition may change layout, safe spacing, and navigation
  density without creating a second business component tree.
- Respect keyboard access, visible focus, reduced motion, touch-sized controls,
  safe-area/keyboard overlap, and accessible live-region behavior.

## Prohibited inputs and outputs

Do not copy Apple Figma IDs, raw Apple token names, raw hex values, proprietary
or unlicensed fonts, or copied proprietary assets into product APIs, public
Contracts, persisted facts, or frontend module interfaces. Do not imply that a
`MODENG_DERIVED` value is an Apple-defined value.

This policy does not authorize a new design-system package, a new public
Contract, a new state machine, or backend cancellation. Those changes still
follow the repository Constitution and the applicable Work Package,
Contract-Change, and ADR process.
