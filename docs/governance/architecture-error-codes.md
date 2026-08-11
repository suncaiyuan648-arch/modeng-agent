# Architecture Guard Error Codes

Architecture checks emit stable machine-readable codes so an AI or CI job can identify the violated invariant without parsing prose.

| Code      | Name                                  | Meaning                                                                                    |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ARCH001` | `CROSS_MODULE_DEEP_IMPORT`            | A module imports another module's internal path.                                           |
| `ARCH002` | `FORBIDDEN_MODULE_DEPENDENCY`         | `package.json` declares a workspace dependency not allowed by its manifest.                |
| `ARCH003` | `LAYER_BOUNDARY`                      | A frontend/backend/shared/infrastructure layer direction is forbidden.                     |
| `ARCH004` | `DOMAIN_INFRASTRUCTURE_LEAK`          | Backend domain code imports infrastructure directly.                                       |
| `ARCH005` | `CAPABILITY_INFRASTRUCTURE_LEAK`      | A Capability imports Prisma, queue, cache, storage or Provider infrastructure.             |
| `ARCH006` | `PUBLIC_CONTRACT_UNAUTHORIZED_CHANGE` | A frozen Contract changed without a valid current-range CCR authorizing each changed path. |
| `ARCH007` | `UNOWNED_DATABASE_ACCESS`             | A module writes a table outside its declared ownership.                                    |
| `ARCH008` | `CIRCULAR_MODULE_DEPENDENCY`          | Workspace modules form a dependency cycle.                                                 |
| `ARCH009` | `INVALID_PUBLIC_EXPORT`               | A package exports an undeclared or internal public entry.                                  |
| `ARCH010` | `MANIFEST_CONTRACT_MISMATCH`          | Source imports do not match `allowedDependencies`.                                         |
| `ARCH011` | `ARCHITECTURE_REVIEW_REQUIRED`        | A manifest changed without a current-range WP authorizing each changed manifest path.      |

The negative fixture suite under `tests/architecture-fixtures/invalid` must assert the expected code for every guarded rule. A diagnostic code is part of the engineering interface: changing one requires updating the fixture and governance documentation in the same Work Package.
