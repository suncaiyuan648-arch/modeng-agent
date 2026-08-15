import { toModelExecutionError } from '@modern-agent/backend-model-supply';
import type {
  ModelExecutionHandleV1,
  ModelExecutionPortV1,
} from '@modern-agent/backend-model-supply';
import type { OperationId, PlatformError, ProjectId } from '@modern-agent/shared-contracts';

export interface TalkCapabilityRequest {
  readonly operationId: OperationId;
  readonly projectId: ProjectId;
  readonly text: string;
  readonly signal?: AbortSignal;
}

export interface TalkCapability {
  execute(request: TalkCapabilityRequest): Promise<ModelExecutionHandleV1>;
}

export class TalkCapabilityError extends Error {
  readonly platformError: PlatformError;

  constructor(platformError: PlatformError) {
    super(platformError.message);
    this.name = 'TalkCapabilityError';
    this.platformError = platformError;
  }
}

export function isTalkCapabilityError(error: unknown): error is TalkCapabilityError {
  return error instanceof TalkCapabilityError;
}

export function toTalkCapabilityError(error: unknown): TalkCapabilityError {
  if (isTalkCapabilityError(error)) return error;
  const modelError = toModelExecutionError(error);
  return new TalkCapabilityError(modelError.platformError);
}

export function createTalkCapability(modelExecution: ModelExecutionPortV1): TalkCapability {
  return {
    async execute(request) {
      try {
        const executionRequest = {
          schemaVersion: 1 as const,
          plan: { schemaVersion: 1 as const, planId: 'fake-talk-v1' },
          input: { text: request.text },
          context: {
            operationId: request.operationId,
            projectId: request.projectId,
            capability: 'talk' as const,
          },
        };
        const options = request.signal === undefined ? undefined : { signal: request.signal };
        return await modelExecution.execute(executionRequest, options);
      } catch (error) {
        throw toTalkCapabilityError(error);
      }
    },
  };
}

/** Stable bootstrap identity; not a business contract. */
export const BACKEND_CAPABILITY_TALK_MODULE = 'backend-capability-talk' as const;
