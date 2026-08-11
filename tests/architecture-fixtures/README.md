# Architecture Guard fixtures

These fixtures are intentionally outside `apps/` and `packages/`. They are not buildable workspaces and must not be imported by product code.

- `valid/` proves that approved layer and Port usage remains accepted.
- `invalid/` contains deliberately broken examples. Each fixture declares exactly one expected `ARCHxxx` code.

Run them with:

```text
pnpm architecture:fixtures
```
