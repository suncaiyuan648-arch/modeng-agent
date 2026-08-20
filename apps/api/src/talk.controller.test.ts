import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createFakeModelExecutionPort,
  createModelSupplyComposition,
} from '@modern-agent/backend-model-supply';
import type {
  FakeModelFailureMode,
  ModelSupplyComposition,
} from '@modern-agent/backend-model-supply';

import { createTalkComposition } from './talk.composition.js';
import { TalkController } from './talk.controller.js';

function fakeModelSupply(failureMode: FakeModelFailureMode = 'never'): ModelSupplyComposition {
  let plan = 0;
  return {
    resolveTalkExecutionPlan: () => {
      plan += 1;
      return { schemaVersion: 1, planId: `test_plan_${plan}` };
    },
    executionPort: createFakeModelExecutionPort({ failureMode, chunkDelayMs: 0 }),
  };
}

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
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('accepts a command and exposes the same ordered envelope stream for replay', async () => {
    const controller = new TalkController(createTalkComposition(fakeModelSupply()));
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
    const controller = new TalkController(createTalkComposition(fakeModelSupply('fail-once')));
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

  it('keeps the existing API and SSE envelopes compatible with the real adapter', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'unit-test-credential');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        [
          'data: {"choices":[{"delta":{"content":"real "},"finish_reason":null}]}',
          '',
          'data: {"choices":[{"delta":{"content":"stream"},"finish_reason":"stop"}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
    );
    const controller = new TalkController(createTalkComposition(createModelSupplyComposition()));
    const accepted = controller.submit(body('real-stream'));
    const events = await collect(controller, accepted.operationId);
    expect(events.map((value) => (value as { data: { type: string } }).data.type)).toEqual([
      'operation.accepted',
      'talk.output.delta',
      'talk.output.delta',
      'operation.completed',
    ]);
    expect(JSON.stringify(events)).not.toMatch(
      /deepseek|unit-test-credential|chat\/completions|system instruction|reasoning_content/i,
    );
  });

  it('emits only a safe existing error when the real adapter has no credential', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const controller = new TalkController(createTalkComposition(createModelSupplyComposition()));
    const accepted = controller.submit(body('missing-credential'));
    const events = await collect(controller, accepted.operationId);
    expect((events.at(-1) as { data: { payload: { error: unknown } } }).data.payload.error).toEqual(
      {
        code: 'INTERNAL_ERROR',
        message: 'The model execution could not be completed.',
        retryable: false,
      },
    );
    expect(globalThis.fetch).not.toHaveProperty('mock');
  });
});
