## Scope

- [ ] 每项变更都能由当前目标或验收解释。
- [ ] 已列出非目标，没有无关重构。

Task / Work Package：
目标模块：

## Deep Module

- [ ] 内部复杂度仍留在 Owner 模块。
- [ ] 没有新增跨模块 deep import 或基础设施泄漏。
- [ ] 没有新增 `shared/common/utils` 垃圾桶。
- [ ] State/Table Ownership 仍是 single writer。
- [ ] Public surface 没有无必要扩张。

## Contracts and architecture

- [ ] Frozen Contract、状态机、Owner、依赖方向和 Migration 未改变。

或：

- [ ] RED 变化已有批准记录：CCR/ADR ________。
- [ ] Schema/Fixture/Conformance/Migration 与兼容窗口已经更新。

## Data and infrastructure

- [ ] 没有直接写入其他模块表。
- [ ] 没有绕过 Repository/Port 增加 Prisma/raw SQL 访问。
- [ ] 没有从 Capability/API/Worker 直接使用 BullMQ/Provider SDK。
- [ ] 新 Migration 遵循 Expand → Migrate → Contract，或本次无 Migration。

## Testing

- [ ] 新行为有测试；Bug 修复有回归测试。
- [ ] 已覆盖相关失败、幂等、并发、取消、重试或恢复路径。
- [ ] Public Port 的 Fake/真实 Adapter 通过共同 Conformance Suite，或不适用。
- [ ] Coverage 没有被当作 invariant 测试的替代品。

## Verification evidence

- [ ] `pnpm verify:changed`
- [ ] `pnpm architecture:check`
- [ ] `pnpm verify:module <module>`
- [ ] 其他：________
- [ ] 命令尚未 scaffold/因环境未运行，已在下方说明。

实际运行命令与结果：

```text

```

## Delivery declaration

- Public Contract changed：YES / NO
- Module dependency/Owner changed：YES / NO
- Migration added：YES / NO
- Feature Flag/Retention changed：YES / NO
- Remaining risks：
- Rollback：
