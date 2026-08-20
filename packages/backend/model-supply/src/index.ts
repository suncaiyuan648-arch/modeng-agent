import { z } from 'zod';

import {
  MAX_TALK_INPUT_LENGTH,
  MAX_TALK_OUTPUT_DELTA_LENGTH,
  OperationIdSchema,
  ProjectIdSchema,
  SCHEMA_VERSION,
} from '@modern-agent/shared-contracts';
import type { OperationId, PlatformError, ProjectId } from '@modern-agent/shared-contracts';
import { createInternalModelSupply } from './internal/real-model-supply.js';

export const MODEL_EXECUTION_PORT_VERSION = 'ModelExecutionPort@1' as const;

const planIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const ModelExecutionPlanRefV1Schema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    planId: planIdSchema,
  })
  .strict();
export type ModelExecutionPlanRefV1 = z.infer<typeof ModelExecutionPlanRefV1Schema>;

export const ModelExecutionRequestV1Schema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    plan: ModelExecutionPlanRefV1Schema,
    input: z.object({ text: z.string().min(1).max(MAX_TALK_INPUT_LENGTH) }).strict(),
    context: z
      .object({
        operationId: OperationIdSchema,
        projectId: ProjectIdSchema,
        capability: z.literal('talk'),
      })
      .strict(),
  })
  .strict();
export type ModelExecutionRequestV1 = z.infer<typeof ModelExecutionRequestV1Schema>;

export const ModelExecutionDeltaV1Schema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    ordinal: z.number().int().min(1).max(10_000),
    text: z.string().min(1).max(MAX_TALK_OUTPUT_DELTA_LENGTH),
  })
  .strict();
export type ModelExecutionDeltaV1 = z.infer<typeof ModelExecutionDeltaV1Schema>;

export function parseModelExecutionRequest(input: unknown): ModelExecutionRequestV1 {
  return ModelExecutionRequestV1Schema.parse(input);
}

export function parseModelExecutionDelta(input: unknown): ModelExecutionDeltaV1 {
  return ModelExecutionDeltaV1Schema.parse(input);
}

export class ModelExecutionError extends Error {
  readonly platformError: PlatformError;

  constructor(platformError: PlatformError) {
    super(platformError.message);
    this.name = 'ModelExecutionError';
    this.platformError = platformError;
  }
}

export function isModelExecutionError(error: unknown): error is ModelExecutionError {
  return error instanceof ModelExecutionError;
}

export function toModelExecutionError(error: unknown): ModelExecutionError {
  if (isModelExecutionError(error)) return error;
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

export interface ModelExecutionHandleV1 {
  readonly stream: AsyncIterable<ModelExecutionDeltaV1>;
  readonly abort: (reason?: 'lifecycle' | 'timeout') => Promise<void>;
}

export interface ModelExecutionPortV1 {
  execute(
    request: ModelExecutionRequestV1,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ModelExecutionHandleV1>;
}

export interface ModelSupplyComposition {
  readonly resolveTalkExecutionPlan: () => ModelExecutionPlanRefV1;
  readonly executionPort: ModelExecutionPortV1;
}

export function createModelSupplyComposition(): ModelSupplyComposition {
  try {
    const composition = createInternalModelSupply({
      ...(process.env['DEEPSEEK_API_KEY'] === undefined
        ? {}
        : { apiKey: process.env['DEEPSEEK_API_KEY'] }),
      ...(process.env['MODENG_TALK_DEFAULT_RELEASE'] === undefined
        ? {}
        : { defaultReleaseId: process.env['MODENG_TALK_DEFAULT_RELEASE'] }),
    });
    return {
      resolveTalkExecutionPlan: composition.resolveTalkExecutionPlan,
      executionPort: composition.executionPort,
    };
  } catch (error) {
    throw toModelExecutionError(error);
  }
}

export type FakeModelFailureMode = 'never' | 'fail-once' | 'always';

export interface FakeModelExecutionOptions {
  readonly failureMode?: FakeModelFailureMode;
  readonly responseChunks?: readonly string[];
  readonly chunkDelayMs?: number;
}

const DEFAULT_FAKE_CHUNKS = [
  'This is a deterministic Fake TALK response',
  ' delivered through the same bounded execution path',
  ' that a real model adapter will use later.',
  '\n\nThe response is intentionally split into',
  ' many small deltas so the browser can show',
  ' the assistant bubble growing over time.',
  '\n\nEach delta crosses the ModelExecutionPort,',
  ' becomes an ordered EventEnvelope,',
  ' and is reduced by the frontend Agent Runtime.',
  '\n\nThe composer stays available for context,',
  ' the message list keeps its bottom anchor,',
  ' and the completed answer remains immutable.',
];

function lifecycleError(reason: 'lifecycle' | 'timeout'): ModelExecutionError {
  return new ModelExecutionError({
    code: reason === 'timeout' ? 'TIMEOUT' : 'CANCELLED',
    message:
      reason === 'timeout'
        ? 'The model took too long to respond.'
        : 'The model execution ended before completion.',
    retryable: true,
  });
}

export function createFakeModelExecutionPort(
  options: FakeModelExecutionOptions = {},
): ModelExecutionPortV1 {
  const failureMode = options.failureMode ?? 'never';
  const chunks = options.responseChunks ?? DEFAULT_FAKE_CHUNKS;
  const delayMs = Math.max(0, options.chunkDelayMs ?? 48);
  let failuresRemaining = failureMode === 'fail-once' ? 1 : 0;

  return {
    async execute(input, executeOptions = {}) {
      try {
        parseModelExecutionRequest(input);
      } catch {
        throw invalidRequestError();
      }
      if (executeOptions.signal?.aborted) throw lifecycleError('lifecycle');

      if (failureMode === 'always' || failuresRemaining > 0) {
        if (failuresRemaining > 0) failuresRemaining -= 1;
        throw new ModelExecutionError({
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'The model is temporarily unavailable.',
          retryable: true,
        });
      }

      let aborted: 'lifecycle' | 'timeout' | undefined;
      const onAbort = () => {
        aborted = 'lifecycle';
      };
      executeOptions.signal?.addEventListener('abort', onAbort, { once: true });

      const stream = (async function* (): AsyncIterable<ModelExecutionDeltaV1> {
        for (const [index, text] of chunks.entries()) {
          if (aborted !== undefined) throw lifecycleError(aborted);
          if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
          if (aborted !== undefined) throw lifecycleError(aborted);
          try {
            yield parseModelExecutionDelta({
              schemaVersion: SCHEMA_VERSION,
              ordinal: index + 1,
              text,
            });
          } catch (error) {
            throw toModelExecutionError(error);
          }
        }
      })();

      return {
        stream,
        async abort(reason = 'lifecycle') {
          aborted = reason;
          executeOptions.signal?.removeEventListener('abort', onAbort);
        },
      };
    },
  };
}

/** Prevent accidental unused import removal from hiding the branded public context. */
export type ModelExecutionContextV1 = {
  readonly operationId: OperationId;
  readonly projectId: ProjectId;
};

/** Stable bootstrap identity; not a business contract. */
export const BACKEND_MODEL_SUPPLY_MODULE = 'backend-model-supply' as const;
