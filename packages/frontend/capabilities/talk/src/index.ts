export function toTalkAssistantMessage(input: {
  readonly operationId: string;
  readonly text: string;
  readonly status: 'streaming' | 'completed' | 'failed';
  readonly errorMessage?: string;
  readonly retryable?: boolean;
}): {
  readonly id: string;
  readonly role: 'assistant';
  readonly text: string;
  readonly status: 'streaming' | 'completed' | 'failed';
  readonly errorMessage?: string;
  readonly retryable?: boolean;
} {
  return {
    id: `assistant-${input.operationId}`,
    role: 'assistant',
    text: input.text,
    status: input.status,
    ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage }),
    ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
  };
}

/** Stable bootstrap identity; not a business contract. */
export const FRONTEND_CAPABILITY_TALK_MODULE = 'frontend-capability-talk' as const;
