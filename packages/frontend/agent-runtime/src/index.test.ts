import { describe, expect, it } from 'vitest';

import { createAgentRuntimeStore, reduceAgentRuntimeEvent } from './index.js';

const accepted = {
  schemaVersion: 1,
  eventId: 'event_runtime_accepted',
  operationId: 'operation_runtime',
  sequence: 1,
  occurredAt: '2026-08-15T00:00:00.000Z',
  type: 'operation.accepted',
  payload: {
    operation: {
      operationId: 'operation_runtime',
      project: { projectId: 'project_runtime', brandId: 'brand_runtime', domain: 'TALK' },
      status: 'accepted',
      executionGraphId: 'graph_runtime',
      createdAt: '2026-08-15T00:00:00.000Z',
    },
    executionGraph: {
      executionGraphId: 'graph_runtime',
      operationId: 'operation_runtime',
      rootNodeId: 'node_runtime',
      nodes: [{ nodeId: 'node_runtime', kind: 'talk', dependsOn: [] }],
    },
  },
} as const;

describe('frontend Agent Runtime reducer/store', () => {
  it('parses unknown events, derives generating/output/completed, and ignores duplicate sequences', () => {
    let state = reduceAgentRuntimeEvent({ operations: {} }, accepted);
    state = reduceAgentRuntimeEvent(state, {
      schemaVersion: 1,
      eventId: 'event_runtime_delta',
      operationId: 'operation_runtime',
      sequence: 2,
      occurredAt: '2026-08-15T00:00:00.000Z',
      type: 'talk.output.delta',
      payload: { text: 'hello' },
    });
    expect(state.operations['operation_runtime']).toMatchObject({
      status: 'running',
      text: 'hello',
    });
    const duplicate = reduceAgentRuntimeEvent(state, {
      schemaVersion: 1,
      eventId: 'event_runtime_delta_duplicate',
      operationId: 'operation_runtime',
      sequence: 2,
      occurredAt: '2026-08-15T00:00:00.000Z',
      type: 'talk.output.delta',
      payload: { text: 'bad' },
    });
    expect(duplicate).toEqual(state);
    const store = createAgentRuntimeStore(state);
    store.dispatch({
      schemaVersion: 1,
      eventId: 'event_runtime_done',
      operationId: 'operation_runtime',
      sequence: 3,
      occurredAt: '2026-08-15T00:00:00.000Z',
      type: 'operation.completed',
      payload: {
        operation: {
          ...accepted.payload.operation,
          status: 'completed',
          completedAt: '2026-08-15T00:00:00.000Z',
        },
        artifact: {
          artifactId: 'artifact_runtime',
          operationId: 'operation_runtime',
          kind: 'text',
          status: 'ready',
          schemaVersion: 1,
          createdAt: '2026-08-15T00:00:00.000Z',
        },
      },
    });
    expect(store.getState().operations['operation_runtime']?.status).toBe('completed');
  });

  it('fails closed on invalid unknown input while retaining unknown non-critical events', () => {
    const store = createAgentRuntimeStore();
    expect(() =>
      store.dispatch({
        schemaVersion: 1,
        eventId: 'event_bad',
        operationId: 'operation_bad',
        sequence: 1,
        occurredAt: '2026-08-15T00:00:00.000Z',
        type: 'critical.future',
        payload: {},
      }),
    ).not.toThrow();
    store.dispatch(accepted);
    store.dispatch({
      schemaVersion: 1,
      eventId: 'event_notice',
      operationId: 'operation_runtime',
      sequence: 4,
      occurredAt: '2026-08-15T00:00:00.000Z',
      type: 'notice.progress',
      payload: { ok: true },
    });
    expect(store.getState().operations['operation_runtime']?.lastSequence).toBe(4);
  });
});
