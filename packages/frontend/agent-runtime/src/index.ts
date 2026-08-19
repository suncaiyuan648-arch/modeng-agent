import {
  ContractValidationError,
  OperationAcceptedEventSchema,
  OperationCompletedEventSchema,
  OperationFailedEventSchema,
  TalkOutputDeltaEventSchema,
  parseEventEnvelope,
} from '@modern-agent/shared-contracts';
import type { OperationId, PlatformError } from '@modern-agent/shared-contracts';

export type RuntimeOperationProjection = {
  readonly operationId: OperationId;
  readonly status: 'accepted' | 'running' | 'completed' | 'failed';
  readonly text: string;
  readonly lastSequence: number;
  readonly error?: PlatformError;
};

export type AgentRuntimeState = {
  readonly operations: Readonly<Record<string, RuntimeOperationProjection>>;
};

export const INITIAL_AGENT_RUNTIME_STATE: AgentRuntimeState = { operations: {} };

function withOperation(
  state: AgentRuntimeState,
  operation: RuntimeOperationProjection,
): AgentRuntimeState {
  return { operations: { ...state.operations, [operation.operationId]: operation } };
}

export function reduceAgentRuntimeEvent(
  state: AgentRuntimeState,
  input: unknown,
): AgentRuntimeState {
  const event = parseEventEnvelope(input);
  const previous = state.operations[event.operationId];
  if (previous !== undefined && event.sequence <= previous.lastSequence) return state;

  if (event.type === 'operation.accepted') {
    const accepted = OperationAcceptedEventSchema.parse(event);
    return withOperation(state, {
      operationId: accepted.operationId,
      status: 'accepted',
      text: '',
      lastSequence: accepted.sequence,
    });
  }

  if (event.type === 'talk.output.delta') {
    if (previous === undefined || previous.status === 'completed' || previous.status === 'failed')
      return state;
    const delta = TalkOutputDeltaEventSchema.parse(event);
    return withOperation(state, {
      ...previous,
      status: 'running',
      text: previous.text + delta.payload.text,
      lastSequence: delta.sequence,
    });
  }

  if (event.type === 'operation.completed') {
    if (previous === undefined || previous.status === 'completed' || previous.status === 'failed')
      return state;
    const completed = OperationCompletedEventSchema.parse(event);
    return withOperation(state, {
      ...previous,
      status: 'completed',
      lastSequence: completed.sequence,
    });
  }

  if (event.type === 'operation.failed') {
    if (previous === undefined || previous.status === 'completed' || previous.status === 'failed')
      return state;
    const failed = OperationFailedEventSchema.parse(event);
    return withOperation(state, {
      ...previous,
      status: 'failed',
      lastSequence: failed.sequence,
      error: failed.payload.error,
    });
  }

  if (previous === undefined) return state;
  return withOperation(state, { ...previous, lastSequence: event.sequence });
}

export function createAgentRuntimeStore(
  initialState: AgentRuntimeState = INITIAL_AGENT_RUNTIME_STATE,
) {
  let state = initialState;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(input: unknown): void {
      try {
        const next = reduceAgentRuntimeEvent(state, input);
        if (next !== state) {
          state = next;
          for (const listener of listeners) listener();
        }
      } catch (error) {
        if (!(error instanceof ContractValidationError)) throw error;
      }
    },
  };
}

export function getGeneratingOperation(
  state: AgentRuntimeState,
): RuntimeOperationProjection | undefined {
  return Object.values(state.operations).find(
    (operation) => operation.status === 'accepted' || operation.status === 'running',
  );
}

export function getOperationProjection(
  state: AgentRuntimeState,
  operationId: OperationId,
): RuntimeOperationProjection | undefined {
  return state.operations[operationId];
}

/** Stable bootstrap identity; not a business contract. */
export const FRONTEND_AGENT_RUNTIME_MODULE = 'frontend-agent-runtime' as const;
