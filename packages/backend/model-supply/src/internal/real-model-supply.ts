import {
  ModelExecutionError,
  ModelExecutionPlanRefV1Schema,
  parseModelExecutionRequest,
} from '../index.js';
import type {
  ModelExecutionHandleV1,
  ModelExecutionPortV1,
  ModelExecutionRequestV1,
} from '../index.js';
import { DEFAULT_TALK_RELEASE_ID } from './model-catalog.js';
import { DeepSeekTalkAdapter, SYSTEM_INSTRUCTION_POLICY_VERSION } from './deepseek-talk-adapter.js';
import { InMemoryModelExecutionPlanRegistry } from './model-execution-plan.js';
import { createFetchModelProviderTransport } from './transport.js';
import type { ModelProviderTransport } from './transport.js';

function internalError(): ModelExecutionError {
  return new ModelExecutionError({
    code: 'INTERNAL_ERROR',
    message: 'The model execution could not be completed.',
    retryable: false,
  });
}

function invalidRequestError(): ModelExecutionError {
  return new ModelExecutionError({
    code: 'INVALID_INPUT',
    message: 'The model execution request is invalid.',
    retryable: false,
  });
}

function candidatePlanId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('plan' in input)) return undefined;
  const result = ModelExecutionPlanRefV1Schema.safeParse(input.plan);
  return result.success ? result.data.planId : undefined;
}

export interface InternalModelSupplyOptions {
  readonly apiKey?: string;
  readonly defaultReleaseId?: string;
  readonly transport?: ModelProviderTransport;
  readonly maxPlanEntries?: number;
  readonly abandonedPlanTtlMs?: number;
  readonly now?: () => number;
  readonly executionTimeoutMs?: number;
}

export interface InternalModelSupplyComposition {
  readonly resolveTalkExecutionPlan: () => ReturnType<
    InMemoryModelExecutionPlanRegistry['resolve']
  >;
  readonly executionPort: ModelExecutionPortV1;
  readonly setTalkAssignment: (releaseId: string) => void;
  readonly planRegistrySize: () => number;
}

export function createInternalModelSupply(
  options: InternalModelSupplyOptions = {},
): InternalModelSupplyComposition {
  const registry = new InMemoryModelExecutionPlanRegistry(
    options.defaultReleaseId ?? DEFAULT_TALK_RELEASE_ID,
    options.maxPlanEntries,
    options.abandonedPlanTtlMs,
    options.now,
  );
  const adapter = new DeepSeekTalkAdapter({
    apiKey: options.apiKey,
    transport: options.transport ?? createFetchModelProviderTransport(),
    executionTimeoutMs: options.executionTimeoutMs ?? 60_000,
  });

  const executionPort: ModelExecutionPortV1 = {
    async execute(input, executeOptions = {}) {
      let request: ModelExecutionRequestV1;
      try {
        request = parseModelExecutionRequest(input);
      } catch {
        const planId = candidatePlanId(input);
        if (planId !== undefined) registry.release(planId);
        throw invalidRequestError();
      }

      let snapshot;
      try {
        snapshot = registry.claim(request.plan.planId);
      } catch {
        registry.release(request.plan.planId);
        throw internalError();
      }

      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        registry.release(request.plan.planId);
      };
      const onSignalAbort = () => release();
      executeOptions.signal?.addEventListener('abort', onSignalAbort, { once: true });

      let handle: ModelExecutionHandleV1;
      try {
        handle = await adapter.execute(snapshot, request, executeOptions.signal);
      } catch (error) {
        executeOptions.signal?.removeEventListener('abort', onSignalAbort);
        release();
        if (error instanceof ModelExecutionError) throw error;
        throw internalError();
      }

      const stream = (async function* () {
        try {
          yield* handle.stream;
        } finally {
          executeOptions.signal?.removeEventListener('abort', onSignalAbort);
          release();
        }
      })();
      return {
        stream,
        async abort(reason = 'lifecycle') {
          try {
            await handle.abort(reason);
          } finally {
            executeOptions.signal?.removeEventListener('abort', onSignalAbort);
            release();
          }
        },
      };
    },
  };

  return {
    resolveTalkExecutionPlan: () => {
      try {
        return registry.resolve(SYSTEM_INSTRUCTION_POLICY_VERSION);
      } catch {
        throw internalError();
      }
    },
    executionPort,
    setTalkAssignment: (releaseId) => registry.setTalkAssignment(releaseId),
    planRegistrySize: () => registry.size,
  };
}
