import type { OperationId } from '@modern-agent/shared-contracts';

export type ConversationUserEntry = {
  readonly id: string;
  readonly text: string;
  readonly operationId?: OperationId;
};

export function createConversationUserEntry(id: string, text: string): ConversationUserEntry {
  const trimmed = text.trim();
  if (trimmed === '') throw new Error('conversation text must not be empty');
  return { id, text: trimmed };
}

export function attachOperationToUserEntry(
  entry: ConversationUserEntry,
  operationId: OperationId,
): ConversationUserEntry {
  return { ...entry, operationId };
}

export function shouldSubmitComposerKey(event: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}

/** Stable bootstrap identity; not a business contract. */
export const FRONTEND_CONVERSATION_MODULE = 'frontend-conversation' as const;
