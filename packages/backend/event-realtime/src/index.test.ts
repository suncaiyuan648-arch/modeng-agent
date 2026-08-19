import { describe, expect, it } from 'vitest';

import {
  ExecutionGraphRefSchema,
  OperationAcceptedEventSchema,
  OperationIdSchema,
  OperationRefSchema,
  ProjectRefSchema,
  SCHEMA_VERSION,
} from '@modern-agent/shared-contracts';
import { createInMemoryEventStream } from './index.js';

const project = ProjectRefSchema.parse({
  projectId: 'project_event',
  brandId: 'brand_event',
  domain: 'TALK',
});
const operation = OperationRefSchema.parse({
  operationId: 'operation_event',
  project,
  status: 'accepted',
  executionGraphId: 'graph_event',
  createdAt: '2026-08-15T00:00:00.000Z',
});
const graph = ExecutionGraphRefSchema.parse({
  executionGraphId: 'graph_event',
  operationId: 'operation_event',
  rootNodeId: 'node_root',
  nodes: [{ nodeId: 'node_root', kind: 'talk', dependsOn: [] }],
});
const operationId = OperationIdSchema.parse('operation_event');

describe('in-memory Event & Realtime owner', () => {
  it('validates sequence and replays afterSequence without duplicate delivery', async () => {
    const stream = createInMemoryEventStream();
    stream.append({
      schemaVersion: SCHEMA_VERSION,
      eventId: 'event_accepted',
      operationId: 'operation_event',
      sequence: 1,
      occurredAt: '2026-08-15T00:00:00.000Z',
      type: 'operation.accepted',
      payload: { operation, executionGraph: graph },
    });
    stream.append({
      schemaVersion: SCHEMA_VERSION,
      eventId: 'event_delta',
      operationId: 'operation_event',
      sequence: 2,
      occurredAt: '2026-08-15T00:00:00.000Z',
      type: 'talk.output.delta',
      payload: { text: 'delta' },
    });
    const replayed = [...stream.replay(operationId, 1)];
    expect(replayed.map((event) => event.sequence)).toEqual([2]);
    const iterator = stream.subscribe(operationId, 1)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { sequence: 2 }, done: false });
  });

  it('rejects non-monotonic events and retains no raw transport state', () => {
    const stream = createInMemoryEventStream();
    const accepted = OperationAcceptedEventSchema.parse({
      schemaVersion: 1,
      eventId: 'event_accepted_2',
      operationId: 'operation_event_2',
      sequence: 1,
      occurredAt: '2026-08-15T00:00:00.000Z',
      type: 'operation.accepted',
      payload: {
        operation: {
          ...operation,
          operationId: 'operation_event_2',
          executionGraphId: 'graph_event_2',
          project: { ...project, projectId: 'project_event_2' },
        },
        executionGraph: {
          ...graph,
          executionGraphId: 'graph_event_2',
          operationId: 'operation_event_2',
        },
      },
    });
    stream.append(accepted);
    expect(() =>
      stream.append({
        ...accepted,
        eventId: 'event_delta_bad',
        sequence: 1,
        type: 'talk.output.delta',
        payload: { text: 'bad' },
      }),
    ).toThrow();
  });
});
