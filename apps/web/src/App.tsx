import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  createConversationController,
  projectConversationMessages,
} from '@modern-agent/frontend-conversation';
import {
  createAgentRuntimeStore,
  getGeneratingOperation,
} from '@modern-agent/frontend-agent-runtime';
import type { AgentRuntimeState } from '@modern-agent/frontend-agent-runtime';
import { Composer, MessageList } from '@modern-agent/frontend-agent-ui';
import type { AgentUiMessage } from '@modern-agent/frontend-agent-ui';
import { toTalkAssistantMessage } from '@modern-agent/frontend-capability-talk';
import { DEMO_PROJECT } from '@modern-agent/frontend-project';
import { createEventStreamRegistry, parseTransportEvent } from '@modern-agent/frontend-realtime';
import { WORKSPACE_LAYOUT } from '@modern-agent/frontend-workspace';
import { OperationIdSchema, parseTalkSubmitCommand } from '@modern-agent/shared-contracts';

import { useBootstrapStore } from './bootstrap-store.js';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000';
const runtimeStore = createAgentRuntimeStore();
const conversationController = createConversationController();
const eventStreamRegistry = createEventStreamRegistry({
  onEvent: (event) => runtimeStore.dispatch(event),
  onError: () => conversationController.setRequestError('The live connection is reconnecting…'),
});

function nextId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function useRuntimeState(): AgentRuntimeState {
  return useSyncExternalStore(runtimeStore.subscribe, runtimeStore.getState, runtimeStore.getState);
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

export function App() {
  const status = useBootstrapStore((state) => state.status);
  const runtimeState = useRuntimeState();
  const conversationState = useSyncExternalStore(
    conversationController.subscribe,
    conversationController.getState,
    conversationController.getState,
  );
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const generating = getGeneratingOperation(runtimeState) !== undefined;
  const messages = useMemo(
    () =>
      projectConversationMessages(runtimeState, conversationState.users, toTalkAssistantMessage),
    [runtimeState, conversationState.users],
  );

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  const submitText = useCallback(async (rawText: string) => {
    const entry = conversationController.beginSubmission(rawText);
    const command = parseTalkSubmitCommand({
      schemaVersion: 1,
      commandId: `command_${nextId('request').replaceAll('-', '_')}`,
      idempotencyKey: nextId('talk').replaceAll('-', '_'),
      type: 'talk.submit',
      project: DEMO_PROJECT,
      input: { text: entry.text },
    });

    try {
      const response = await fetch(`${API_BASE_URL}/talk/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(command),
      });
      const payload = await readResponseBody(response);
      if (!response.ok) {
        conversationController.setRequestError('The request could not be sent. Please try again.');
        return;
      }
      const accepted = parseTransportEvent(payload);
      if (accepted.type !== 'operation.accepted') {
        conversationController.setRequestError(
          'The request could not be started. Please try again.',
        );
        return;
      }
      conversationController.attachOperation(entry.id, accepted.operationId);
      runtimeStore.dispatch(accepted);
      eventStreamRegistry.start({
        baseUrl: API_BASE_URL,
        operationId: accepted.operationId,
        afterSequence: accepted.sequence,
      });
    } catch {
      conversationController.setRequestError('The request could not be sent. Please try again.');
    }
  }, []);

  const retry = useCallback(
    (message: AgentUiMessage) => {
      if (message.role === 'assistant' && message.status === 'failed') {
        const user = conversationController.findUserByOperationId(
          OperationIdSchema.parse(message.id.replace('assistant-', '')),
        );
        if (user !== undefined) void submitText(user.text);
      }
    },
    [submitText],
  );

  return (
    <div className="agent-shell" data-theme={theme}>
      <aside className={WORKSPACE_LAYOUT.sidebar} aria-label="Workspace navigation">
        <div className="agent-brand">
          <div className="agent-brand__mark" aria-hidden="true">
            M
          </div>
          <div>
            <div className="agent-brand__title">Modeng</div>
            <p className="agent-brand__subtitle">Agent workspace</p>
          </div>
        </div>
        <div className="agent-sidebar__section">
          <span className="agent-sidebar__label">Project</span>
          <div className="agent-project-row">
            <span className="agent-project-row__icon" aria-hidden="true">
              T
            </span>
            <div>
              <div className="agent-project-row__name">TALK Demo</div>
              <div className="agent-project-row__detail">Local composition</div>
            </div>
          </div>
        </div>
        <div className="agent-sidebar__section">
          <span className="agent-sidebar__label">Conversation</span>
          <div className="agent-project-row" aria-current="page">
            <span className="agent-project-row__icon" aria-hidden="true">
              ↗
            </span>
            <div>
              <div className="agent-project-row__name">New conversation</div>
              <div className="agent-project-row__detail">
                {conversationState.users.length}{' '}
                {conversationState.users.length === 1 ? 'message' : 'messages'}
              </div>
            </div>
          </div>
        </div>
        <div className="agent-sidebar__footer">
          <span>Bootstrap {status}</span>
          <button
            className="agent-button agent-theme-toggle"
            type="button"
            onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} appearance`}
          >
            {theme === 'light' ? '◐' : '☼'}
          </button>
        </div>
      </aside>
      <main className={WORKSPACE_LAYOUT.main}>
        <header className={WORKSPACE_LAYOUT.toolbar}>
          <div>
            <div className="agent-toolbar__eyebrow">Project / TALK</div>
            <h1 className="agent-toolbar__title">New conversation</h1>
          </div>
          <div className="agent-toolbar__status">
            <span className="agent-toolbar__dot" aria-hidden="true" />
            {generating ? 'Generating' : 'Ready'}
          </div>
        </header>
        <MessageList
          messages={messages}
          isGenerating={generating}
          isAtBottom={conversationState.viewport.isAtBottom}
          onViewportChange={conversationController.updateViewport}
          onRetry={retry}
        />
        <div className="agent-composer-dock">
          {conversationState.requestError ? (
            <p className="agent-request-error" role="alert">
              {conversationState.requestError}
            </p>
          ) : null}
          <Composer
            value={conversationState.draft}
            onChange={conversationController.setDraft}
            onSubmit={() => void submitText(conversationState.draft)}
            disabled={generating}
          />
        </div>
      </main>
    </div>
  );
}
