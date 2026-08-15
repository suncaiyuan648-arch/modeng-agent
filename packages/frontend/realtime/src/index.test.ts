import { describe, expect, it, vi } from 'vitest';

import { OperationIdSchema } from '@modern-agent/shared-contracts';
import { SseFrameParser, buildEventStreamUrl, parseSseEventData } from './index.js';

const realtimeOperationId = OperationIdSchema.parse('operation_realtime');
const reconnectOperationId = OperationIdSchema.parse('operation_reconnect');

describe('frontend realtime SSE boundary', () => {
  it('frames split chunks and validates JSON data from unknown', () => {
    const parser = new SseFrameParser();
    expect(parser.feed('id: 1\ndata: {"ok":')).toEqual([]);
    expect(parser.feed('true}\n\n')).toEqual([{ id: '1', data: '{"ok":true}' }]);
    expect(() => parseSseEventData('{"not":"an envelope"}')).toThrow(
      'SSE data failed EventEnvelope validation',
    );
  });

  it('builds an afterSequence replay URL and fails closed on critical events', () => {
    expect(buildEventStreamUrl('http://localhost:3000', realtimeOperationId, 7)).toBe(
      'http://localhost:3000/talk/operations/operation_realtime/events?afterSequence=7',
    );
    expect(() =>
      parseSseEventData(
        JSON.stringify({
          schemaVersion: 1,
          eventId: 'event_critical',
          operationId: 'operation_realtime',
          sequence: 1,
          occurredAt: '2026-08-15T00:00:00.000Z',
          type: 'critical.future',
          payload: {},
        }),
      ),
    ).toThrow();
  });

  it('can reconnect from the latest sequence after a premature stream end', async () => {
    const acceptedEvent = {
      schemaVersion: 1,
      eventId: 'event_reconnect_accepted',
      operationId: reconnectOperationId,
      sequence: 1,
      occurredAt: '2026-08-15T00:00:00.000Z',
      type: 'operation.accepted',
      payload: {
        operation: {
          operationId: 'operation_reconnect',
          project: { projectId: 'project_reconnect', brandId: 'brand_reconnect', domain: 'TALK' },
          status: 'accepted',
          executionGraphId: 'graph_reconnect',
          createdAt: '2026-08-15T00:00:00.000Z',
        },
        executionGraph: {
          executionGraphId: 'graph_reconnect',
          operationId: 'operation_reconnect',
          rootNodeId: 'node_reconnect',
          nodes: [{ nodeId: 'node_reconnect', kind: 'talk', dependsOn: [] }],
        },
      },
    };
    const failedEvent = {
      schemaVersion: 1,
      eventId: 'event_reconnect_failed',
      operationId: reconnectOperationId,
      sequence: 2,
      occurredAt: '2026-08-15T00:00:00.000Z',
      type: 'operation.failed',
      payload: {
        operation: {
          operationId: 'operation_reconnect',
          project: { projectId: 'project_reconnect', brandId: 'brand_reconnect', domain: 'TALK' },
          status: 'failed',
          executionGraphId: 'graph_reconnect',
          createdAt: '2026-08-15T00:00:00.000Z',
          completedAt: '2026-08-15T00:00:00.000Z',
        },
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'The model is temporarily unavailable.',
          retryable: true,
        },
      },
    };
    const responses = [
      new Response(`id: 1\ndata: ${JSON.stringify(acceptedEvent)}\n\n`, { status: 200 }),
      new Response(`id: 2\ndata: ${JSON.stringify(failedEvent)}\n\n`, { status: 200 }),
    ];
    const fetchImpl = vi.fn(
      async () => responses.shift() ?? new Response('', { status: 500 }),
    ) as unknown as typeof fetch;
    const seen: number[] = [];
    const session = (await import('./index.js')).createEventStreamSession({
      baseUrl: 'http://localhost:3000',
      operationId: reconnectOperationId,
      fetchImpl,
      reconnectDelayMs: 0,
      onEvent: (event) => seen.push(event.sequence),
    });
    await session.start();
    expect(seen).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      (fetchImpl as unknown as { mock: { calls: Array<[string]> } }).mock.calls[1]?.[0],
    ).toContain('afterSequence=1');
  });
});
