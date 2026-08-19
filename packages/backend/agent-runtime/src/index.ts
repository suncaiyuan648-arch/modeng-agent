import {
  ArtifactBaseSchema,
  ExecutionGraphRefSchema,
  ExecutionNodeIdSchema,
  ExecutionGraphIdSchema,
  OperationAcceptedEventSchema,
  OperationCompletedEventSchema,
  OperationFailedEventSchema,
  OperationIdSchema,
  OperationRefSchema,
  SCHEMA_VERSION,
  createTalkSubmitIdempotencyGuard,
  parseTalkSubmitCommand,
} from '@modern-agent/shared-contracts';
import type {
  ArtifactBase,
  EventEnvelope,
  ExecutionGraphRef,
  OperationId,
  OperationRef,
  TaskRunId,
  TalkSubmitCommand,
} from '@modern-agent/shared-contracts';
import { createInMemoryEventStream } from '@modern-agent/backend-event-realtime';
import type { InMemoryEventStream } from '@modern-agent/backend-event-realtime';
import { createInMemoryTaskEngine } from '@modern-agent/backend-task-engine';
import type { InMemoryTaskEngine } from '@modern-agent/backend-task-engine';
import { toTalkCapabilityError } from '@modern-agent/backend-capability-talk';
import type { TalkCapability } from '@modern-agent/backend-capability-talk';

export interface AgentRuntimeComposition {
  readonly taskEngine: InMemoryTaskEngine;
  readonly eventStream: InMemoryEventStream;
  readonly talkCapability: TalkCapability;
  readonly now?: () => string;
}

export interface AgentRuntimeSubmitResult {
  readonly acceptedEvent: EventEnvelope;
  readonly duplicate: boolean;
}

interface OperationRecord {
  readonly command: TalkSubmitCommand;
  readonly graph: ExecutionGraphRef;
  readonly acceptedEvent: EventEnvelope;
  readonly taskRunId: TaskRunId;
  operation: OperationRef;
  output: string;
  nextSequence: number;
}

export interface AgentRuntime {
  submit(input: unknown): AgentRuntimeSubmitResult;
  getOperation(operationId: OperationId): OperationRef | undefined;
  getAcceptedEvent(operationId: OperationId): EventEnvelope | undefined;
  hasOperation(operationId: OperationId): boolean;
}

function timestamp(now: () => string): string {
  return now();
}

function safeFailure(error: unknown): ReturnType<typeof toTalkCapabilityError>['platformError'] {
  return toTalkCapabilityError(error).platformError;
}

export function createAgentRuntime(composition: AgentRuntimeComposition): AgentRuntime {
  const now = composition.now ?? (() => new Date().toISOString());
  const guard = createTalkSubmitIdempotencyGuard();
  const operations = new Map<OperationId, OperationRecord>();
  const operationByIdempotencyKey = new Map<string, OperationId>();
  let idCounter = 0;

  const appendDelta = (record: OperationRecord, text: string): void => {
    record.nextSequence += 1;
    composition.eventStream.append({
      schemaVersion: SCHEMA_VERSION,
      eventId: `event_${record.operation.operationId}_delta_${record.nextSequence}`,
      operationId: record.operation.operationId,
      sequence: record.nextSequence,
      occurredAt: timestamp(now),
      type: 'talk.output.delta',
      payload: { text },
    });
  };

  const run = async (record: OperationRecord): Promise<void> => {
    const taskRunId = record.taskRunId;
    composition.taskEngine.start(taskRunId);
    record.operation = OperationRefSchema.parse({
      ...record.operation,
      status: 'running',
    });
    try {
      const handle = await composition.talkCapability.execute({
        operationId: record.operation.operationId,
        projectId: record.command.project.projectId,
        text: record.command.input.text,
      });
      for await (const delta of handle.stream) {
        record.output += delta.text;
        appendDelta(record, delta.text);
      }
      composition.taskEngine.complete(taskRunId);
      const completedAt = timestamp(now);
      record.operation = OperationRefSchema.parse({
        ...record.operation,
        status: 'completed',
        completedAt,
      });
      const artifact: ArtifactBase = ArtifactBaseSchema.parse({
        artifactId: `artifact_${record.operation.operationId}`,
        operationId: record.operation.operationId,
        kind: 'text',
        status: 'ready',
        schemaVersion: SCHEMA_VERSION,
        createdAt: completedAt,
      });
      record.nextSequence += 1;
      composition.eventStream.append(
        OperationCompletedEventSchema.parse({
          schemaVersion: SCHEMA_VERSION,
          eventId: `event_${record.operation.operationId}_completed`,
          operationId: record.operation.operationId,
          sequence: record.nextSequence,
          occurredAt: completedAt,
          type: 'operation.completed',
          payload: { operation: record.operation, artifact },
        }),
      );
    } catch (error) {
      composition.taskEngine.fail(taskRunId);
      const platformError = safeFailure(error);
      const failedAt = timestamp(now);
      record.operation = OperationRefSchema.parse({
        ...record.operation,
        status: 'failed',
        completedAt: failedAt,
      });
      record.nextSequence += 1;
      composition.eventStream.append(
        OperationFailedEventSchema.parse({
          schemaVersion: SCHEMA_VERSION,
          eventId: `event_${record.operation.operationId}_failed`,
          operationId: record.operation.operationId,
          sequence: record.nextSequence,
          occurredAt: failedAt,
          type: 'operation.failed',
          payload: { operation: record.operation, error: platformError },
        }),
      );
    }
  };

  return {
    submit(input) {
      const command = parseTalkSubmitCommand(input);
      guard.accept(command);
      const previousOperationId = operationByIdempotencyKey.get(command.idempotencyKey);
      if (previousOperationId !== undefined) {
        const previous = operations.get(previousOperationId);
        if (previous !== undefined)
          return { acceptedEvent: previous.acceptedEvent, duplicate: true };
      }

      idCounter += 1;
      const operationId = OperationIdSchema.parse(`operation_${idCounter}`);
      const graphId = ExecutionGraphIdSchema.parse(`graph_${idCounter}`);
      const nodeId = ExecutionNodeIdSchema.parse(`node_${idCounter}`);
      const operation = OperationRefSchema.parse({
        operationId,
        project: command.project,
        status: 'accepted',
        executionGraphId: graphId,
        createdAt: timestamp(now),
      });
      const graph = ExecutionGraphRefSchema.parse({
        executionGraphId: graphId,
        operationId,
        rootNodeId: nodeId,
        nodes: [{ nodeId, kind: 'talk', dependsOn: [] }],
      });
      const taskRun = composition.taskEngine.createTaskRun(operationId, nodeId);
      const acceptedEvent = OperationAcceptedEventSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        eventId: `event_${operationId}_accepted`,
        operationId,
        sequence: 1,
        occurredAt: operation.createdAt,
        type: 'operation.accepted',
        payload: { operation, executionGraph: graph },
      });
      composition.eventStream.append(acceptedEvent);
      const record: OperationRecord = {
        command,
        graph,
        acceptedEvent,
        taskRunId: taskRun.taskRunId,
        operation,
        output: '',
        nextSequence: 1,
      };
      operations.set(operationId, record);
      operationByIdempotencyKey.set(command.idempotencyKey, operationId);
      void run(record);
      return { acceptedEvent, duplicate: false };
    },
    getOperation(operationId) {
      return operations.get(operationId)?.operation;
    },
    getAcceptedEvent(operationId) {
      return operations.get(operationId)?.acceptedEvent;
    },
    hasOperation(operationId) {
      return operations.has(operationId);
    },
  };
}

export function createDefaultAgentRuntime(talkCapability: TalkCapability): AgentRuntime {
  return createAgentRuntime({
    taskEngine: createInMemoryTaskEngine(),
    eventStream: createInMemoryEventStream(),
    talkCapability,
  });
}

/** Stable bootstrap identity; not a business contract. */
export const BACKEND_AGENT_RUNTIME_MODULE = 'backend-agent-runtime' as const;
