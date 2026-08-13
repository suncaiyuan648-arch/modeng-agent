import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  ArtifactBaseSchema,
  BrandIdSchema,
  CommandIdSchema,
  ContractValidationError,
  EventEnvelopeSchema,
  EventIdSchema,
  ExecutionGraphRefSchema,
  ExecutionNodeIdSchema,
  MAX_EXECUTION_GRAPH_NODES,
  OperationAcceptedEventSchema,
  OperationCompletedEventSchema,
  OperationFailedEventSchema,
  OperationIdSchema,
  OperationRefSchema,
  PlatformErrorSchema,
  ProjectIdSchema,
  ProjectRefSchema,
  SCHEMA_VERSION,
  TaskRunIdSchema,
  TaskRunRefSchema,
  TalkSubmitCommandSchema,
  TalkOutputDeltaEventSchema,
  createTalkSubmitIdempotencyGuard,
  getTalkSubmitFingerprint,
  isTerminalOperationStatus,
  parseEventEnvelope,
  parseExecutionGraphRef,
  parseTalkSubmitCommand,
  validateEventSequence,
  validateOperationEventStream,
  validateOperationStateTransition,
} from './index.js';
import type { TalkSubmitIdempotencyGuard } from './index.js';

const timestamp = '2026-08-13T00:00:00.000Z';

const project = ProjectRefSchema.parse({
  projectId: 'project_demo',
  brandId: 'brand_demo',
  domain: 'TALK',
});

const graph = ExecutionGraphRefSchema.parse({
  executionGraphId: 'graph_demo',
  operationId: 'operation_demo',
  rootNodeId: 'node_root',
  nodes: [{ nodeId: 'node_root', kind: 'talk', dependsOn: [] }],
});

const acceptedOperation = OperationRefSchema.parse({
  operationId: 'operation_demo',
  project,
  status: 'accepted',
  executionGraphId: 'graph_demo',
  createdAt: timestamp,
});

const completedOperation = OperationRefSchema.parse({
  ...acceptedOperation,
  status: 'completed',
  completedAt: timestamp,
});

const readyArtifact = ArtifactBaseSchema.parse({
  artifactId: 'artifact_demo',
  operationId: 'operation_demo',
  kind: 'text',
  status: 'ready',
  schemaVersion: SCHEMA_VERSION,
  createdAt: timestamp,
});

const command = TalkSubmitCommandSchema.parse({
  schemaVersion: SCHEMA_VERSION,
  commandId: 'command_demo',
  idempotencyKey: 'talk-request-1',
  type: 'talk.submit',
  project,
  input: { text: 'Hello from the fake TALK fixture.' },
});

const acceptedEvent = OperationAcceptedEventSchema.parse({
  schemaVersion: SCHEMA_VERSION,
  eventId: 'event_accepted',
  operationId: 'operation_demo',
  sequence: 1,
  occurredAt: timestamp,
  type: 'operation.accepted',
  payload: { operation: acceptedOperation, executionGraph: graph },
});

const deltaEvent = TalkOutputDeltaEventSchema.parse({
  schemaVersion: SCHEMA_VERSION,
  eventId: 'event_delta',
  operationId: 'operation_demo',
  sequence: 2,
  occurredAt: timestamp,
  type: 'talk.output.delta',
  payload: { text: 'Hello back.' },
});

const completedEvent = OperationCompletedEventSchema.parse({
  schemaVersion: SCHEMA_VERSION,
  eventId: 'event_completed',
  operationId: 'operation_demo',
  sequence: 3,
  occurredAt: timestamp,
  type: 'operation.completed',
  payload: { operation: completedOperation, artifact: readyArtifact },
});

const failedEvent = OperationFailedEventSchema.parse({
  schemaVersion: SCHEMA_VERSION,
  eventId: 'event_failed',
  operationId: 'operation_demo',
  sequence: 2,
  occurredAt: timestamp,
  type: 'operation.failed',
  payload: {
    operation: OperationRefSchema.parse({
      ...acceptedOperation,
      status: 'failed',
      completedAt: timestamp,
    }),
    error: {
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'The model is unavailable.',
      retryable: true,
    },
  },
});

function expectContractFailure(action: () => unknown): void {
  expect(action).toThrow(ContractValidationError);
}

describe('shared-contracts public root', () => {
  it('loads the Contract Kernel through the package root export', () => {
    const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const packageRoot = fileURLToPath(new URL('..', import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      exports?: Record<string, unknown>;
    };

    expect(Object.keys(packageJson.exports ?? {})).toEqual(['.']);
    const build = spawnSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['--filter', '@modern-agent/shared-contracts', 'build'],
      { cwd: packageRoot, encoding: 'utf8' },
    );
    expect(build.status, build.stderr).toBe(0);

    const probe = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const contracts = await import('@modern-agent/shared-contracts'); if (contracts.SHARED_CONTRACTS_MODULE !== 'shared-contracts' || typeof contracts.parseTalkSubmitCommand !== 'function') process.exit(1);",
      ],
      { cwd: packageRoot, encoding: 'utf8' },
    );
    expect(probe.status, probe.stderr).toBe(0);
  });
});

describe('branded identifiers and version', () => {
  it('accepts correctly branded opaque identifiers and rejects cross-entity substitution', () => {
    expect(BrandIdSchema.safeParse('brand_acme').success).toBe(true);
    expect(ProjectIdSchema.safeParse('project_alpha').success).toBe(true);
    expect(OperationIdSchema.safeParse('operation_alpha').success).toBe(true);
    expect(ExecutionNodeIdSchema.safeParse('node_alpha').success).toBe(true);
    expect(TaskRunIdSchema.safeParse('task_alpha').success).toBe(true);
    expect(CommandIdSchema.safeParse('command_alpha').success).toBe(true);
    expect(EventIdSchema.safeParse('event_alpha').success).toBe(true);
    expect(ProjectIdSchema.safeParse('operation_alpha').success).toBe(false);
    expect(OperationIdSchema.safeParse('not-an-operation').success).toBe(false);
  });

  it('requires schema version 1 and rejects unknown fields', () => {
    expect(TalkSubmitCommandSchema.safeParse(command).success).toBe(true);
    expect(TalkSubmitCommandSchema.safeParse({ ...command, schemaVersion: 2 }).success).toBe(false);
    expect(ProjectRefSchema.safeParse({ ...project, extra: 'not-authorized' }).success).toBe(false);
  });
});

describe('ProjectRef and TalkSubmitCommand', () => {
  it('validates the bounded TALK command and excludes provider fields', () => {
    expect(parseTalkSubmitCommand(command)).toEqual(command);
    expect(
      TalkSubmitCommandSchema.safeParse({
        ...command,
        input: { text: 'x'.repeat(4_001) },
      }).success,
    ).toBe(false);
    expect(TalkSubmitCommandSchema.safeParse({ ...command, model: 'provider-model' }).success).toBe(
      false,
    );
    expect(
      TalkSubmitCommandSchema.safeParse({ ...command, project: { ...project, domain: 'IMAGE' } })
        .success,
    ).toBe(false);
  });

  it('provides deterministic fingerprints and rejects idempotency key reuse with another payload', () => {
    const retry = TalkSubmitCommandSchema.parse({ ...command, commandId: 'command_retry' });
    const guard: TalkSubmitIdempotencyGuard = createTalkSubmitIdempotencyGuard();

    expect(getTalkSubmitFingerprint(command)).toBe(getTalkSubmitFingerprint(retry));
    guard.accept(command);
    guard.accept(retry);
    expect(guard.has(command.idempotencyKey)).toBe(true);

    const differentPayload = TalkSubmitCommandSchema.parse({
      ...retry,
      input: { text: 'a different request' },
    });
    expectContractFailure(() => guard.accept(differentPayload));
  });
});

describe('OperationRef, ExecutionGraphRef, and TaskRunRef', () => {
  it('accepts the single-node Fake TALK graph and rejects malformed operation/task references', () => {
    expect(parseExecutionGraphRef(graph)).toEqual(graph);
    expect(OperationRefSchema.safeParse({ ...acceptedOperation, status: 'unknown' }).success).toBe(
      false,
    );
    expect(
      TaskRunRefSchema.safeParse({
        taskRunId: 'task_demo',
        operationId: 'operation_demo',
        nodeId: 'node_root',
        attempt: 1,
        status: 'pending',
      }).success,
    ).toBe(true);
    expect(
      TaskRunRefSchema.safeParse({
        taskRunId: 'task_demo',
        operationId: 'operation_demo',
        nodeId: 'node_root',
        attempt: 0,
        status: 'pending',
      }).success,
    ).toBe(false);
    expect(
      TaskRunRefSchema.safeParse({
        taskRunId: 'task_demo',
        operationId: 'operation_demo',
        nodeId: 'node_root',
        attempt: 1,
        status: 'pending',
        lease: 'not-authorized',
      }).success,
    ).toBe(false);
  });

  it('rejects cycles, duplicate nodes, unknown dependencies, multiple roots, and oversized graphs', () => {
    const cyclic = {
      ...graph,
      nodes: [
        { nodeId: 'node_root', kind: 'talk' as const, dependsOn: ['node_child'] },
        { nodeId: 'node_child', kind: 'talk' as const, dependsOn: ['node_root'] },
      ],
    };
    expect(ExecutionGraphRefSchema.safeParse(cyclic).success).toBe(false);

    const duplicate = {
      ...graph,
      nodes: [
        { nodeId: 'node_root', kind: 'talk' as const, dependsOn: [] },
        { nodeId: 'node_root', kind: 'talk' as const, dependsOn: [] },
      ],
    };
    expect(ExecutionGraphRefSchema.safeParse(duplicate).success).toBe(false);

    const unknownDependency = {
      ...graph,
      nodes: [{ nodeId: 'node_root', kind: 'talk' as const, dependsOn: ['node_missing'] }],
    };
    expect(ExecutionGraphRefSchema.safeParse(unknownDependency).success).toBe(false);

    const multipleRoots = {
      ...graph,
      nodes: [
        { nodeId: 'node_root', kind: 'talk' as const, dependsOn: [] },
        { nodeId: 'node_second', kind: 'talk' as const, dependsOn: [] },
      ],
    };
    expect(ExecutionGraphRefSchema.safeParse(multipleRoots).success).toBe(false);

    const oversized = Array.from({ length: MAX_EXECUTION_GRAPH_NODES + 1 }, (_, index) => ({
      nodeId: `node_${index}`,
      kind: 'talk' as const,
      dependsOn: index === 0 ? [] : [`node_${index - 1}`],
    }));
    expect(
      ExecutionGraphRefSchema.safeParse({
        ...graph,
        rootNodeId: 'node_0',
        nodes: oversized,
      }).success,
    ).toBe(false);
  });
});

describe('ArtifactBase and PlatformError', () => {
  it('keeps artifacts metadata-only and validates the v1 status set', () => {
    expect(ArtifactBaseSchema.safeParse(readyArtifact).success).toBe(true);
    expect(
      ArtifactBaseSchema.safeParse({ ...readyArtifact, payload: 'provider response' }).success,
    ).toBe(false);
    expect(ArtifactBaseSchema.safeParse({ ...readyArtifact, status: 'published' }).success).toBe(
      false,
    );
  });

  it('accepts bounded safe errors and rejects secrets, provider data, and internal details', () => {
    expect(
      PlatformErrorSchema.safeParse({
        code: 'INVALID_INPUT',
        message: 'The request is invalid.',
        retryable: false,
        details: { field: 'input.text' },
      }).success,
    ).toBe(true);
    expect(
      PlatformErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.',
        retryable: false,
        details: { provider: 'raw-provider-name' },
      }).success,
    ).toBe(false);
    expect(
      PlatformErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'safe',
        retryable: false,
        stack: 'secret stack',
      }).success,
    ).toBe(false);
    expect(
      PlatformErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'line one\nline two',
        retryable: false,
      }).success,
    ).toBe(false);
    expect(
      PlatformErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'provider response: api_key=not-safe',
        retryable: false,
      }).success,
    ).toBe(false);
    expect(
      PlatformErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'safe',
        retryable: false,
        details: { field: 'api_key=sk-live-secret' },
      }).success,
    ).toBe(false);
    expect(
      PlatformErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'safe',
        retryable: false,
        details: { output: 'raw provider response' },
      }).success,
    ).toBe(false);
  });
});

describe('EventEnvelope and operation stream behavior', () => {
  it('represents accepted -> delta(s) -> completed and accepted -> failed', () => {
    const unknownNonCritical = parseEventEnvelope({
      schemaVersion: SCHEMA_VERSION,
      eventId: 'event_notice',
      operationId: 'operation_demo',
      sequence: 3,
      occurredAt: timestamp,
      type: 'notice.progress',
      payload: { retained: true },
    });
    expect(unknownNonCritical.type).toBe('notice.progress');
    validateOperationEventStream([acceptedEvent, deltaEvent, completedEvent]);

    validateOperationEventStream([acceptedEvent, failedEvent]);
  });

  it('rejects duplicate/non-monotonic sequence and unknown critical events', () => {
    expectContractFailure(() =>
      validateEventSequence([acceptedEvent, { ...deltaEvent, sequence: 1 }]),
    );
    expectContractFailure(() =>
      parseEventEnvelope({
        schemaVersion: SCHEMA_VERSION,
        eventId: 'event_critical',
        operationId: 'operation_demo',
        sequence: 4,
        occurredAt: timestamp,
        type: 'critical.future-event',
        payload: {},
      }),
    );
    for (const type of ['critical', 'critical_event', 'critical:event']) {
      expectContractFailure(() =>
        parseEventEnvelope({
          schemaVersion: SCHEMA_VERSION,
          eventId: 'event_critical',
          operationId: 'operation_demo',
          sequence: 4,
          occurredAt: timestamp,
          type,
          payload: {},
        }),
      );
    }
    expect(EventEnvelopeSchema.safeParse({ ...deltaEvent, schemaVersion: 2 }).success).toBe(false);
    expect(
      OperationCompletedEventSchema.safeParse({
        ...completedEvent,
        operationId: 'operation_other',
      }).success,
    ).toBe(false);
  });

  it('does not allow output after a terminal event or a terminal state to reopen', () => {
    expectContractFailure(() =>
      validateOperationEventStream([completedEvent, { ...deltaEvent, sequence: 4 }]),
    );
    expect(isTerminalOperationStatus('completed')).toBe(true);
    expect(isTerminalOperationStatus('running')).toBe(false);
    expectContractFailure(() => validateOperationStateTransition('completed', 'running'));
    expect(() => validateOperationStateTransition('accepted', 'running')).not.toThrow();
  });

  it('validates failed event payloads without provider or transport fields', () => {
    expect(OperationFailedEventSchema.safeParse(failedEvent).success).toBe(true);
    expect(
      OperationFailedEventSchema.safeParse({
        ...failedEvent,
        payload: { ...failedEvent.payload, error: { ...failedEvent.payload.error, provider: 'x' } },
      }).success,
    ).toBe(false);
  });
});
