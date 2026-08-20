import { describe, expect, it } from 'vitest';

import { createFakeModelExecutionPort } from '@modern-agent/backend-model-supply';
import { OperationIdSchema, ProjectIdSchema } from '@modern-agent/shared-contracts';
import { createTalkCapability } from './index.js';

const talkOperationId = OperationIdSchema.parse('operation_talk');
const failedOperationId = OperationIdSchema.parse('operation_talk_fail');
const demoProjectId = ProjectIdSchema.parse('project_demo');

describe('TALK capability', () => {
  it('resolves one opaque plan per operation and returns normalized deltas', async () => {
    let resolutions = 0;
    const capability = createTalkCapability({
      resolvePlan: () => {
        resolutions += 1;
        return { schemaVersion: 1, planId: `mdlplan_talk_${resolutions}` };
      },
      modelExecution: createFakeModelExecutionPort({ chunkDelayMs: 0 }),
    });
    const handle = await capability.execute({
      operationId: talkOperationId,
      projectId: demoProjectId,
      text: 'ordinary text',
    });
    const deltas = [] as string[];
    for await (const delta of handle.stream) deltas.push(delta.text);
    expect(deltas).toHaveLength(12);
    expect(deltas.join('')).toContain('deterministic Fake TALK response');
    expect(resolutions).toBe(1);
  });

  it('never substitutes the assignment key for the resolved plan id', async () => {
    const plans: string[] = [];
    const modelExecution = createFakeModelExecutionPort({
      responseChunks: ['done'],
      chunkDelayMs: 0,
    });
    const capability = createTalkCapability({
      resolvePlan: () => ({ schemaVersion: 1, planId: 'mdlplan_opaque' }),
      modelExecution: {
        async execute(request, options) {
          plans.push(request.plan.planId);
          return modelExecution.execute(request, options);
        },
      },
    });
    const handle = await capability.execute({
      operationId: talkOperationId,
      projectId: demoProjectId,
      text: 'ordinary text',
    });
    for await (const delta of handle.stream) expect(delta.text).toBe('done');
    expect(plans).toEqual(['mdlplan_opaque']);
    expect(plans).not.toContain('talk.default');
  });

  it('maps configured model failures to safe retryable PlatformError', async () => {
    const capability = createTalkCapability({
      resolvePlan: () => ({ schemaVersion: 1, planId: 'mdlplan_failure' }),
      modelExecution: createFakeModelExecutionPort({ failureMode: 'always' }),
    });
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
