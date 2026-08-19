import { describe, expect, it } from 'vitest';

import { createFakeModelExecutionPort } from '@modern-agent/backend-model-supply';
import { OperationIdSchema, ProjectIdSchema } from '@modern-agent/shared-contracts';
import { createTalkCapability } from './index.js';

const talkOperationId = OperationIdSchema.parse('operation_talk');
const failedOperationId = OperationIdSchema.parse('operation_talk_fail');
const demoProjectId = ProjectIdSchema.parse('project_demo');

describe('TALK capability', () => {
  it('passes ordinary text through the fixed opaque Fake plan and returns normalized deltas', async () => {
    const capability = createTalkCapability(createFakeModelExecutionPort({ chunkDelayMs: 0 }));
    const handle = await capability.execute({
      operationId: talkOperationId,
      projectId: demoProjectId,
      text: 'ordinary text',
    });
    const deltas = [] as string[];
    for await (const delta of handle.stream) deltas.push(delta.text);
    expect(deltas).toHaveLength(12);
    expect(deltas.join('')).toContain('deterministic Fake TALK response');
  });

  it('maps configured model failures to safe retryable PlatformError', async () => {
    const capability = createTalkCapability(
      createFakeModelExecutionPort({ failureMode: 'always' }),
    );
    await expect(
      capability.execute({
        operationId: failedOperationId,
        projectId: demoProjectId,
        text: 'ordinary text',
      }),
    ).rejects.toMatchObject({
      platformError: { code: 'DEPENDENCY_UNAVAILABLE', retryable: true },
    });
  });
});
