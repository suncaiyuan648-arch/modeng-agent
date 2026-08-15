import { describe, expect, it } from 'vitest';

import { createTalkComposition } from './talk.composition.js';
import { TalkController } from './talk.controller.js';

function body(key: string) {
  return {
    schemaVersion: 1,
    commandId: `command_api_${key}`,
    idempotencyKey: `api-${key}`,
    type: 'talk.submit',
    project: { projectId: 'project_api', brandId: 'brand_api', domain: 'TALK' },
    input: { text: 'ordinary user text' },
  };
}

async function collect(controller: TalkController, operationId: string, afterSequence = 0) {
  const observable = controller.events(operationId, String(afterSequence));
  const values = [] as unknown[];
  await new Promise<void>((resolve, reject) => {
    const subscription = observable.subscribe({
      next: (value) => values.push(value),
      error: reject,
      complete: () => {
        subscription.unsubscribe();
        resolve();
      },
    });
  });
  return values;
}

describe('TALK API composition', () => {
  it('accepts a command and exposes the same ordered envelope stream for replay', async () => {
    const controller = new TalkController(createTalkComposition());
    const accepted = controller.submit(body('success'));
    expect(accepted.type).toBe('operation.accepted');
    const events = await collect(controller, accepted.operationId, 0);
    const eventTypes = events.map((value) => (value as { data: { type: string } }).data.type);
    expect(eventTypes).toEqual([
      'operation.accepted',
      ...Array.from({ length: 12 }, () => 'talk.output.delta'),
      'operation.completed',
    ]);
    const replay = await collect(controller, accepted.operationId, 1);
    expect(replay).toHaveLength(events.length - 1);
  });

  it('returns only a sanitized safe error for malformed input and configured failure', async () => {
    const controller = new TalkController(createTalkComposition({ failureMode: 'fail-once' }));
    expect(() => controller.submit({ ...body('bad'), input: { text: '' } })).toThrow();
    const accepted = controller.submit(body('fail'));
    const events = await collect(controller, accepted.operationId);
    const failed = (events.at(-1) as { data: { payload: { error: Record<string, unknown> } } }).data
      .payload.error;
    expect(failed).toEqual({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'The model is temporarily unavailable.',
      retryable: true,
    });
    expect(JSON.stringify(events)).not.toMatch(/stack|provider|prompt|credential|raw/i);
  });
});
