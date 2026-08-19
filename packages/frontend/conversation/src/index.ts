import type { OperationId } from '@modern-agent/shared-contracts';
import type { AgentRuntimeState } from '@modern-agent/frontend-agent-runtime';

export type ConversationUserEntry = {
  readonly id: string;
  readonly text: string;
  readonly operationId?: OperationId;
};

export type ConversationMessage = {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly status?: 'streaming' | 'completed' | 'failed';
  readonly errorMessage?: string;
  readonly retryable?: boolean;
};

export type ConversationAssistantMessageInput = {
  readonly operationId: string;
  readonly text: string;
  readonly status: 'streaming' | 'completed' | 'failed';
  readonly errorMessage?: string;
  readonly retryable?: boolean;
};

export type ConversationViewportMetrics = {
  readonly scrollHeight: number;
  readonly scrollTop: number;
  readonly clientHeight: number;
};

export type ConversationViewportState = {
  readonly isAtBottom: boolean;
};

export type ConversationState = {
  readonly draft: string;
  readonly users: readonly ConversationUserEntry[];
  readonly requestError?: string;
  readonly viewport: ConversationViewportState;
};

const INITIAL_CONVERSATION_STATE: ConversationState = {
  draft: '',
  users: [],
  viewport: { isAtBottom: true },
};

const VIEWPORT_BOTTOM_THRESHOLD = 48;

export function isConversationViewportAtBottom(metrics: ConversationViewportMetrics): boolean {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= VIEWPORT_BOTTOM_THRESHOLD
  );
}

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

export function projectConversationMessages(
  runtimeState: AgentRuntimeState,
  users: readonly ConversationUserEntry[],
  projectAssistantMessage: (input: ConversationAssistantMessageInput) => ConversationMessage,
): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  for (const user of users) {
    messages.push({ id: user.id, role: 'user', text: user.text });
    if (user.operationId === undefined) continue;
    const operation = runtimeState.operations[user.operationId];
    if (operation === undefined) continue;
    const status =
      operation.status === 'accepted' || operation.status === 'running'
        ? 'streaming'
        : operation.status;
    messages.push(
      projectAssistantMessage({
        operationId: operation.operationId,
        text: operation.text,
        status,
        ...(operation.error === undefined
          ? {}
          : { errorMessage: operation.error.message, retryable: operation.error.retryable }),
      }),
    );
  }
  return messages;
}

export function createConversationController() {
  let state: ConversationState = INITIAL_CONVERSATION_STATE;
  const listeners = new Set<() => void>();

  const publish = (next: ConversationState): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setDraft(draft: string): void {
      publish({ ...state, draft });
    },
    beginSubmission(rawText: string): ConversationUserEntry {
      const entry = createConversationUserEntry(`user-${state.users.length + 1}`, rawText);
      publish({ ...state, draft: '', users: [...state.users, entry] });
      return entry;
    },
    attachOperation(entryId: string, operationId: OperationId): void {
      publish({
        ...state,
        users: state.users.map((entry) =>
          entry.id === entryId ? attachOperationToUserEntry(entry, operationId) : entry,
        ),
      });
    },
    setRequestError(requestError: string): void {
      publish({ ...state, requestError });
    },
    clearRequestError(): void {
      publish({ draft: state.draft, users: state.users, viewport: state.viewport });
    },
    updateViewport(metrics: ConversationViewportMetrics): void {
      const isAtBottom = isConversationViewportAtBottom(metrics);
      if (state.viewport.isAtBottom === isAtBottom) return;
      publish({ ...state, viewport: { isAtBottom } });
    },
    findUserByOperationId(operationId: OperationId): ConversationUserEntry | undefined {
      return state.users.find((entry) => entry.operationId === operationId);
    },
  };
}

/** Stable bootstrap identity; not a business contract. */
export const FRONTEND_CONVERSATION_MODULE = 'frontend-conversation' as const;
