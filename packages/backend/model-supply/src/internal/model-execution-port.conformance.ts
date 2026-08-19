import { describe, expect, it } from 'vitest';

import {
  MAX_TALK_INPUT_LENGTH,
  MAX_TALK_OUTPUT_DELTA_LENGTH,
} from '@modern-agent/shared-contracts';
import type { ModelExecutionPortV1 } from '../index.js';
import { ModelExecutionRequestV1Schema } from '../index.js';

export type ModelExecutionConformanceOptions = {
  readonly failureMode?: 'never' | 'fail-once' | 'always';
  readonly responseChunks?: readonly string[];
  readonly chunkDelayMs?: number;
};

export type ModelExecutionPortFactory = (
  options?: ModelExecutionConformanceOptions,
) => ModelExecutionPortV1;

const request = ModelExecutionRequestV1Schema.parse({
  schemaVersion: 1,
  plan: { schemaVersion: 1, planId: 'opaque-plan-v1' },
  input: { text: 'ordinary business text' },
  context: {
    operationId: 'operation_model_conformance',
    projectId: 'project_model_conformance',
    capability: 'talk',
  },
});

async function readStream(port: ModelExecutionPortV1, input = request): Promise<string> {
  const handle = await port.execute(input);
  let output = '';
  let previousOrdinal = 0;
  for await (const delta of handle.stream) {
    expect(delta.ordinal).toBeGreaterThan(previousOrdinal);
    expect(delta.text.length).toBeLessThanOrEqual(MAX_TALK_OUTPUT_DELTA_LENGTH);
    previousOrdinal = delta.ordinal;
    output += delta.text;
  }
  return output;
}

export function describeModelExecutionPortConformance(factory: ModelExecutionPortFactory): void {
  describe('ModelExecutionPort@1 conformance', () => {
    it('rejects invalid, oversized, and unknown request fields with a safe error', async () => {
      const port = factory({ chunkDelayMs: 0 });
      await expect(
        port.execute({
          ...request,
          input: { text: 'x'.repeat(MAX_TALK_INPUT_LENGTH + 1) },
        } as never),
      ).rejects.toMatchObject({
        platformError: { code: 'INVALID_INPUT', retryable: false },
      });
      await expect(
        port.execute({ ...request, provider: 'raw-provider-data' } as never),
      ).rejects.toMatchObject({
        platformError: { code: 'INVALID_INPUT', retryable: false },
      });
    });

    it('keeps plan/context opaque and emits normalized bounded output to completion', async () => {
      const port = factory({
        chunkDelayMs: 0,
        responseChunks: ['first', ' second'],
      });
      const handle = await port.execute(request);
      const deltas = [];
      for await (const delta of handle.stream) deltas.push(delta);
      expect(deltas).toEqual([
        { schemaVersion: 1, ordinal: 1, text: 'first' },
        { schemaVersion: 1, ordinal: 2, text: ' second' },
      ]);
    });

    it('is deterministic for duplicate invocation and has configured fail-once behavior', async () => {
      const port = factory({ chunkDelayMs: 0 });
      await expect(readStream(port)).resolves.toBe(await readStream(factory({ chunkDelayMs: 0 })));

      const failOnce = factory({
        failureMode: 'fail-once',
        responseChunks: ['recovered'],
        chunkDelayMs: 0,
      });
      await expect(failOnce.execute(request)).rejects.toMatchObject({
        platformError: { code: 'DEPENDENCY_UNAVAILABLE', retryable: true },
      });
      await expect(readStream(failOnce)).resolves.toBe('recovered');
    });

    it('maps lifecycle abort to a safe internal error without user cancellation semantics', async () => {
      const controller = new AbortController();
      const port = factory({ chunkDelayMs: 20 });
      const handle = await port.execute(request, { signal: controller.signal });
      controller.abort();
      await expect(handle.stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
        platformError: { code: 'CANCELLED', retryable: true },
      });
      await handle.abort('timeout');
    });
  });
}
