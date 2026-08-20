import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFakeModelExecutionPort, createModelSupplyComposition } from './index.js';
import { describeModelExecutionPortConformance } from './internal/model-execution-port.conformance.js';

describeModelExecutionPortConformance((options) => ({
  executionPort: createFakeModelExecutionPort(options),
  resolvePlan: () => ({ schemaVersion: 1, planId: 'opaque-plan-v1' }),
}));

describe('Model Supply package-root composition', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('exposes only the approved resolver and existing execution port', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const composition = createModelSupplyComposition();
    expect(Object.keys(composition).sort()).toEqual(['executionPort', 'resolveTalkExecutionPlan']);
    expect(composition.resolveTalkExecutionPlan().planId).toMatch(/^mdlplan_/);
  });

  it('maps an invalid server-only assignment to a safe existing error', () => {
    vi.stubEnv('MODENG_TALK_DEFAULT_RELEASE', 'mdlrel_unknown');
    expect(() => createModelSupplyComposition()).toThrowError(
      'The model execution could not be completed.',
    );
  });
});
