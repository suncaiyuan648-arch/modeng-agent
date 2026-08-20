import { useLayoutEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';

export type AgentUiMessage = {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly status?: 'streaming' | 'completed' | 'failed';
  readonly errorMessage?: string;
  readonly retryable?: boolean;
};

export interface MessageListProps {
  readonly messages: readonly AgentUiMessage[];
  readonly onRetry?: (message: AgentUiMessage) => void;
  readonly isGenerating?: boolean;
  readonly isAtBottom?: boolean;
  readonly onViewportChange?: (metrics: {
    readonly scrollHeight: number;
    readonly scrollTop: number;
    readonly clientHeight: number;
  }) => void;
}

export function EmptyState(): ReactNode {
  return (
    <div className="agent-empty-state" data-testid="empty-state">
      <span className="agent-empty-state__eyebrow">TALK</span>
      <h2>Start with a clear thought.</h2>
      <p>Ask anything about your project. Modeng AI will answer in a streamed reply.</p>
    </div>
  );
}

export function StreamingIndicator(): ReactNode {
  return (
    <span className="agent-streaming-indicator" aria-hidden="true">
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </span>
  );
}

function Message({
  message,
  onRetry,
}: {
  readonly message: AgentUiMessage;
  readonly onRetry?: (message: AgentUiMessage) => void;
}): ReactNode {
  const isAssistant = message.role === 'assistant';
  return (
    <article
      className={`agent-message agent-message--${message.role} ${message.status === 'failed' ? 'agent-message--failed' : ''}`}
    >
      <div className="agent-message__avatar" aria-hidden="true">
        {isAssistant ? 'M' : 'Y'}
      </div>
      <div className="agent-message__body">
        <div className="agent-message__meta">
          <span>{isAssistant ? 'Modeng' : 'You'}</span>
          {message.status === 'streaming' ? (
            <span className="agent-message__state" aria-hidden="true">
              Generating
            </span>
          ) : null}
        </div>
        <div className="agent-message__bubble">
          {message.status === 'failed' ? (
            <div className="agent-error-state">
              <span className="agent-error-state__icon" aria-hidden="true">
                !
              </span>
              <div>
                <strong>{message.errorMessage ?? 'This reply could not be completed.'}</strong>
                {message.retryable && onRetry ? (
                  <button
                    className="agent-button agent-button--secondary agent-error-state__retry"
                    type="button"
                    onClick={() => onRetry(message)}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <span>{message.text}</span>
              {message.status === 'streaming' ? <StreamingIndicator /> : null}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function MessageList({
  messages,
  onRetry,
  isGenerating = false,
  isAtBottom = true,
  onViewportChange,
}: MessageListProps): ReactNode {
  const listRef = useRef<HTMLElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const list = listRef.current;
    if (list === null) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
  };

  const latestMessageText = messages[messages.length - 1]?.text;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list !== null && isAtBottom) scrollToBottom('auto');
  }, [isAtBottom, isGenerating, latestMessageText, messages.length]);

  return (
    <div className="agent-message-list-shell">
      {isGenerating ? (
        <span className="sr-only" role="status" aria-live="polite">
          Assistant is generating
        </span>
      ) : null}
      <section
        ref={listRef}
        className="agent-message-list"
        aria-label="Conversation messages"
        aria-busy={isGenerating}
        data-generating={isGenerating}
        onScroll={(event) => {
          const list = event.currentTarget;
          onViewportChange?.({
            scrollHeight: list.scrollHeight,
            scrollTop: list.scrollTop,
            clientHeight: list.clientHeight,
          });
        }}
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              {...(onRetry === undefined ? {} : { onRetry })}
            />
          ))
        )}
        <p className="agent-conversation-slogan">摩灯 Agent，面向真实任务的工作平台</p>
        <div className="agent-message-list__anchor" aria-hidden="true" />
      </section>
      {!isAtBottom ? (
        <button
          className="agent-button agent-scroll-to-bottom"
          type="button"
          aria-label="Scroll to latest message"
          title="Scroll to latest message"
          onClick={() => scrollToBottom('smooth')}
        >
          <span aria-hidden="true">↓</span>
        </button>
      ) : null}
    </div>
  );
}

export interface ComposerProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Message Modeng…',
}: ComposerProps): ReactNode {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const restoreFocus = () => {
    const focusInput = () => inputRef.current?.focus({ preventScroll: true });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusInput);
    else focusInput();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled && value.trim() !== '') {
      onSubmit();
      restoreFocus();
    }
  };

  return (
    <form
      className="agent-composer"
      onSubmit={submit}
      aria-label="Talk composer"
      aria-busy={disabled}
    >
      <label className="sr-only" htmlFor="talk-composer-input">
        Message Modeng
      </label>
      <textarea
        id="talk-composer-input"
        ref={inputRef}
        className="agent-composer__input"
        value={value}
        placeholder={placeholder}
        rows={1}
        readOnly={disabled}
        aria-readonly={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!disabled && value.trim() !== '') {
              onSubmit();
              restoreFocus();
            }
          }
        }}
      />
      <button
        className="agent-button agent-button--primary agent-composer__send"
        type="submit"
        disabled={disabled || value.trim() === ''}
        aria-label={disabled ? 'Generating reply' : 'Send message'}
      >
        {disabled ? (
          <span className="agent-button__spinner" aria-hidden="true" />
        ) : (
          <span aria-hidden="true">↑</span>
        )}
      </button>
    </form>
  );
}
