# backend-agent-runtime

## Responsibility

Command routing, operation and execution-graph ownership.

## Required context

Before editing, read `module.manifest.json`, `README.md`, `src/index.ts` and relevant tests.

## Bootstrap boundary

- WP-000 permits structure and tooling only; do not add business behavior.
- Import other modules only through their package root.
- Do not create `internal/**` imports across package boundaries.
- Public Contract, ownership and dependency changes require the process defined by the root `AGENTS.md`.

## Verification

Run `pnpm verify:module backend-agent-runtime` after the command is available.
