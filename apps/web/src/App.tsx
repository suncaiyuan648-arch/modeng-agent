import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { toTalkAssistantMessage } from '@modern-agent/frontend-capability-talk';
import {
  attachOperationToUserEntry,
  createConversationUserEntry,
} from '@modern-agent/frontend-conversation';
import {
  createAgentRuntimeStore,
  getGeneratingOperation,
} from '@modern-agent/frontend-agent-runtime';
import type { AgentRuntimeState } from '@modern-agent/frontend-agent-runtime';
import { Composer, MessageList } from '@modern-agent/frontend-agent-ui';
import type { AgentUiMessage } from '@modern-agent/frontend-agent-ui';
import { DEMO_PROJECT } from '@modern-agent/frontend-project';
import { createEventStreamSession, parseTransportEvent } from '@modern-agent/frontend-realtime';
import { WORKSPACE_LAYOUT } from '@modern-agent/frontend-workspace';
import { parseTalkSubmitCommand } from '@modern-agent/shared-contracts';

import { useBootstrapStore } from './bootstrap-store.js';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000';
const runtimeStore = createAgentRuntimeStore();

function nextId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function useRuntimeState(): AgentRuntimeState {
  return useSyncExternalStore(runtimeStore.subscribe, runtimeStore.getState, runtimeStore.getState);
}

function projectMessages(
  state: AgentRuntimeState,
  users: ReturnType<typeof createConversationUserEntry>[],
): AgentUiMessage[] {
  const messages: AgentUiMessage[] = [];
  for (const user of users) {
    messages.push({ id: user.id, role: 'user', text: user.text });
    if (user.operationId !== undefined) {
      const operation = state.operations[user.operationId];
      if (operation !== undefined) {
        messages.push(
          toTalkAssistantMessage({
            operationId: operation.operationId,
            text: operation.text,
            status:
              operation.status === 'accepted' || operation.status === 'running'
                ? 'streaming'
                : operation.status,
            ...(operation.error === undefined
              ? {}
              : { errorMessage: operation.error.message, retryable: operation.error.retryable }),
          }),
        );
      }
    }
  }
  return messages;
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
  const [draft, setDraft] = useState('');
  const [users, setUsers] = useState<ReturnType<typeof createConversationUserEntry>[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [requestError, setRequestError] = useState<string | undefined>();
  const sessions = useRef(new Map<string, ReturnType<typeof createEventStreamSession>>());
  const generating = getGeneratingOperation(runtimeState) !== undefined;
  const messages = useMemo(() => projectMessages(runtimeState, users), [runtimeState, users]);

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  const submitText = useCallback(async (rawText: string) => {
    const entry = createConversationUserEntry(nextId('user'), rawText);
    setUsers((current) => [...current, entry]);
    setRequestError(undefined);
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
        setRequestError('The request could not be sent. Please try again.');
        return;
      }
      const accepted = parseTransportEvent(payload);
      if (accepted.type !== 'operation.accepted') {
        setRequestError('The request could not be started. Please try again.');
        return;
      }
      setUsers((current) =>
        current.map((user) =>
          user.id === entry.id ? attachOperationToUserEntry(user, accepted.operationId) : user,
        ),
      );
      runtimeStore.dispatch(accepted);
      const session = createEventStreamSession({
        baseUrl: API_BASE_URL,
        operationId: accepted.operationId,
        afterSequence: accepted.sequence,
        onEvent: (event) => runtimeStore.dispatch(event),
        onError: () => setRequestError('The live connection is reconnecting…'),
      });
      sessions.current.set(accepted.operationId, session);
      void session.start();
    } catch {
      setRequestError('The request could not be sent. Please try again.');
    }
    setDraft('');
  }, []);

  const retry = useCallback(
    (message: AgentUiMessage) => {
      if (message.role === 'assistant' && message.status === 'failed') {
        const user = users.find(
          (candidate) => candidate.operationId === message.id.replace('assistant-', ''),
        );
        if (user !== undefined) void submitText(user.text);
      }
    },
    [submitText, users],
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
                {users.length} {users.length === 1 ? 'message' : 'messages'}
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
          <div className="agent-toolbar__status" aria-live="polite">
            <span className="agent-toolbar__dot" aria-hidden="true" />
            {generating ? 'Generating' : 'Ready'}
          </div>
        </header>
        <MessageList messages={messages} isGenerating={generating} onRetry={retry} />
        <div className="agent-composer-dock">
          {requestError ? (
            <p className="agent-request-error" role="alert">
              {requestError}
            </p>
          ) : null}
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void submitText(draft)}
            disabled={generating}
          />
        </div>
      </main>
    </div>
  );
}
