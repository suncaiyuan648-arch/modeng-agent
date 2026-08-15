import { describe, expect, it } from 'vitest';

import { TalkCapabilityError } from '@modern-agent/backend-capability-talk';
import { createInMemoryEventStream } from '@modern-agent/backend-event-realtime';
import { createInMemoryTaskEngine } from '@modern-agent/backend-task-engine';
import { TalkSubmitCommandSchema } from '@modern-agent/shared-contracts';
import { createAgentRuntime } from './index.js';

function command(key: string, text = 'ordinary browser text') {
  return TalkSubmitCommandSchema.parse({
    schemaVersion: 1,
    commandId: `command_${key}`,
    idempotencyKey: key,
    type: 'talk.submit',
    project: { projectId: 'project_runtime', brandId: 'brand_runtime', domain: 'TALK' },
    input: { text },
  });
}

async function waitForTerminal(
  stream: ReturnType<typeof createInMemoryEventStream>,
  operationId: Parameters<typeof stream.list>[0],
) {
  const events = [] as Awaited<ReturnType<typeof stream.subscribe>> extends AsyncIterable<
    infer Event
  >
    ? Event[]
    : never;
  for await (const event of stream.subscribe(operationId)) {
    events.push(event);
    if (event.type === 'operation.completed' || event.type === 'operation.failed') break;
  }
  return events;
}

function createRuntime(failureMode: 'never' | 'fail-once' | 'always' = 'never') {
  const eventStream = createInMemoryEventStream();
  let failuresRemaining = failureMode === 'fail-once' ? 1 : 0;
  const talkCapability = {
    async execute() {
      if (failureMode === 'always' || failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw new TalkCapabilityError({
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'The model is temporarily unavailable.',
          retryable: true,
        });
      }
      return {
        stream: (async function* () {
          yield { schemaVersion: 1 as const, ordinal: 1, text: 'A small, deterministic answer' };
          yield { schemaVersion: 1 as const, ordinal: 2, text: ' arrives in bounded' };
          yield { schemaVersion: 1 as const, ordinal: 3, text: ' streamed pieces.' };
        })(),
        abort: async () => undefined,
      };
    },
  };
  return {
    runtime: createAgentRuntime({
      taskEngine: createInMemoryTaskEngine(),
      eventStream,
      talkCapability,
    }),
    eventStream,
  };
}

describe('Agent Runtime TALK vertical slice', () => {
  it('produces accepted -> delta(s) -> completed with one graph and one TaskRun', async () => {
    const { runtime, eventStream } = createRuntime();
    const accepted = runtime.submit(command('runtime-success'));
    expect(accepted.duplicate).toBe(false);
    const events = await waitForTerminal(eventStream, accepted.acceptedEvent.operationId);
    expect(events.map((event) => event.type)).toEqual([
      'operation.accepted',
      'talk.output.delta',
      'talk.output.delta',
      'talk.output.delta',
      'operation.completed',
    ]);
    expect(runtime.getOperation(accepted.acceptedEvent.operationId)?.status).toBe('completed');
  });

  it('maps configured fail-once to a safe failed operation and retry creates a new immutable operation', async () => {
    const { runtime, eventStream } = createRuntime('fail-once');
    const first = runtime.submit(command('runtime-failure'));
    const firstEvents = await waitForTerminal(eventStream, first.acceptedEvent.operationId);
    expect(firstEvents.at(-1)).toMatchObject({
      type: 'operation.failed',
      payload: { error: { code: 'DEPENDENCY_UNAVAILABLE', retryable: true } },
    });
    const firstOperation = runtime.getOperation(first.acceptedEvent.operationId);
    const retry = runtime.submit(command('runtime-retry'));
    const retryEvents = await waitForTerminal(eventStream, retry.acceptedEvent.operationId);
    expect(retryEvents.at(-1)?.type).toBe('operation.completed');
    expect(runtime.getOperation(first.acceptedEvent.operationId)).toEqual(firstOperation);
    expect(retry.acceptedEvent.operationId).not.toBe(first.acceptedEvent.operationId);
  });

  it('does not create a second operation for an idempotent duplicate', () => {
    const { runtime } = createRuntime();
    const first = runtime.submit(command('runtime-idempotent'));
    const duplicate = runtime.submit({
      ...command('runtime-idempotent'),
      commandId: 'command_runtime_idempotent_retry',
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.acceptedEvent.operationId).toBe(first.acceptedEvent.operationId);
  });
});
