import { describe, expect, it } from 'vitest';

import { OperationIdSchema, ExecutionNodeIdSchema } from '@modern-agent/shared-contracts';
import { createInMemoryTaskEngine } from './index.js';

describe('bounded in-memory Task Engine', () => {
  it('owns pending/running/completed TaskRun transitions and deduplicates the node', () => {
    const engine = createInMemoryTaskEngine();
    const operationId = OperationIdSchema.parse('operation_task');
    const nodeId = ExecutionNodeIdSchema.parse('node_root');
    const first = engine.createTaskRun(operationId, nodeId);
    expect(first.status).toBe('pending');
    expect(engine.createTaskRun(operationId, nodeId)).toEqual(first);
    expect(engine.start(first.taskRunId).status).toBe('running');
    expect(engine.complete(first.taskRunId).status).toBe('completed');
    expect(engine.complete(first.taskRunId).status).toBe('completed');
    expect(engine.listForOperation(operationId)).toHaveLength(1);
  });

  it('keeps failed TaskRun terminal and never exposes operation mutation', () => {
    const engine = createInMemoryTaskEngine();
    const task = engine.createTaskRun(
      OperationIdSchema.parse('operation_failed_task'),
      ExecutionNodeIdSchema.parse('node_root'),
    );
    engine.start(task.taskRunId);
    expect(engine.fail(task.taskRunId).status).toBe('failed');
    expect(() => engine.start(task.taskRunId)).toThrow('invalid task run transition');
  });
});
