import { ContractValidationError, TaskRunRefSchema } from '@modern-agent/shared-contracts';
import type {
  ExecutionNodeId,
  OperationId,
  TaskRunId,
  TaskRunRef,
  TaskRunStatus,
} from '@modern-agent/shared-contracts';

export interface InMemoryTaskEngine {
  createTaskRun(operationId: OperationId, nodeId: ExecutionNodeId): TaskRunRef;
  start(taskRunId: TaskRunId): TaskRunRef;
  complete(taskRunId: TaskRunId): TaskRunRef;
  fail(taskRunId: TaskRunId): TaskRunRef;
  get(taskRunId: TaskRunId): TaskRunRef | undefined;
  listForOperation(operationId: OperationId): readonly TaskRunRef[];
}

function transition(current: TaskRunStatus, next: TaskRunStatus): void {
  const allowed: Record<TaskRunStatus, readonly TaskRunStatus[]> = {
    pending: ['pending', 'running', 'failed'],
    running: ['running', 'completed', 'failed'],
    completed: ['completed'],
    failed: ['failed'],
  };
  if (!(allowed[current] ?? []).includes(next)) {
    throw new ContractValidationError(`invalid task run transition: ${current} -> ${next}`);
  }
}

export function createInMemoryTaskEngine(): InMemoryTaskEngine {
  const taskRuns = new Map<TaskRunId, TaskRunRef>();
  const byOperationNode = new Map<string, TaskRunId>();
  let idCounter = 0;

  const update = (taskRunId: TaskRunId, status: TaskRunStatus): TaskRunRef => {
    const current = taskRuns.get(taskRunId);
    if (current === undefined) throw new ContractValidationError('task run was not found');
    transition(current.status, status);
    const next = TaskRunRefSchema.parse({ ...current, status });
    taskRuns.set(taskRunId, next);
    return next;
  };

  return {
    createTaskRun(operationId, nodeId) {
      const key = `${operationId}:${nodeId}`;
      const existingId = byOperationNode.get(key);
      if (existingId !== undefined) return taskRuns.get(existingId)!;
      idCounter += 1;
      const taskRun = TaskRunRefSchema.parse({
        taskRunId: `task_${idCounter}`,
        operationId,
        nodeId,
        attempt: 1,
        status: 'pending',
      });
      taskRuns.set(taskRun.taskRunId, taskRun);
      byOperationNode.set(key, taskRun.taskRunId);
      return taskRun;
    },
    start(taskRunId) {
      return update(taskRunId, 'running');
    },
    complete(taskRunId) {
      return update(taskRunId, 'completed');
    },
    fail(taskRunId) {
      return update(taskRunId, 'failed');
    },
    get(taskRunId) {
      return taskRuns.get(taskRunId);
    },
    listForOperation(operationId) {
      return [...taskRuns.values()].filter((taskRun) => taskRun.operationId === operationId);
    },
  };
}

/** Stable bootstrap identity; not a business contract. */
export const BACKEND_TASK_ENGINE_MODULE = 'backend-task-engine' as const;
