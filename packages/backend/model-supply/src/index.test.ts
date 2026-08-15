import { describe, expect, it } from 'vitest';

import {
  ModelExecutionRequestV1Schema,
  createFakeModelExecutionPort,
  parseModelExecutionRequest,
} from './index.js';

const request = ModelExecutionRequestV1Schema.parse({
  schemaVersion: 1,
  plan: { schemaVersion: 1, planId: 'fake-talk-v1' },
  input: { text: 'ordinary business text' },
  context: {
    operationId: 'operation_model',
    projectId: 'project_demo',
    capability: 'talk' as const,
  },
});

async function readChunks(port: ReturnType<typeof createFakeModelExecutionPort>): Promise<string> {
  const handle = await port.execute(request);
  let output = '';
  for await (const delta of handle.stream) output += delta.text;
  return output;
}

describe('ModelExecutionPort@1 Fake conformance', () => {
  it('validates the allowlisted request and rejects unknown/provider fields', () => {
    expect(parseModelExecutionRequest(request)).toEqual(request);
    expect(
      ModelExecutionRequestV1Schema.safeParse({ ...request, provider: 'hidden' }).success,
    ).toBe(false);
    expect(
      ModelExecutionRequestV1Schema.safeParse({
        ...request,
        context: { ...request.context, prompt: 'hidden' },
      }).success,
    ).toBe(false);
  });

  it('emits deterministic bounded deltas for ordinary text', async () => {
    const port = createFakeModelExecutionPort({ chunkDelayMs: 0 });
    expect(await readChunks(port)).toContain('This is a deterministic Fake TALK response');
  });

  it('injects fail-once through adapter configuration and then recovers', async () => {
    const port = createFakeModelExecutionPort({ failureMode: 'fail-once', chunkDelayMs: 0 });
    await expect(port.execute(request)).rejects.toMatchObject({
      platformError: { code: 'DEPENDENCY_UNAVAILABLE', retryable: true },
    });
    expect(await readChunks(port)).toContain('deterministic Fake TALK response');
  });

  it('maps lifecycle abort to a safe internal error without user cancellation semantics', async () => {
    const controller = new AbortController();
    const port = createFakeModelExecutionPort({ chunkDelayMs: 20 });
    const handle = await port.execute(request, { signal: controller.signal });
    controller.abort();
    await expect(handle.stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      platformError: { code: 'CANCELLED' },
    });
    await handle.abort('timeout');
  });
});
