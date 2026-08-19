import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Composer, EmptyState, MessageList } from './components.js';

function render(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element);
}

describe('frontend-agent-ui rendered states', () => {
  it('renders the empty state and conversation slogan', () => {
    const markup = render(createElement(MessageList, { messages: [] }));
    expect(markup).toContain('Start with a clear thought.');
    expect(markup).toContain('摩灯 Agent，面向真实任务的工作平台');
    expect(render(createElement(EmptyState))).toContain('local Fake model');
  });

  it('renders user, streaming, completed, failed, and retry states', () => {
    const onRetry = vi.fn();
    const markup = render(
      createElement(MessageList, {
        messages: [
          { id: 'user-1', role: 'user', text: 'hello' },
          {
            id: 'assistant-streaming',
            role: 'assistant',
            text: 'working',
            status: 'streaming',
          },
          {
            id: 'assistant-streaming-2',
            role: 'assistant',
            text: 'still working',
            status: 'streaming',
          },
          {
            id: 'assistant-completed',
            role: 'assistant',
            text: 'done',
            status: 'completed',
          },
          {
            id: 'assistant-failed',
            role: 'assistant',
            text: '',
            status: 'failed',
            errorMessage: 'The model is temporarily unavailable.',
            retryable: true,
          },
        ],
        isGenerating: true,
        onRetry,
      }),
    );
    expect(markup).toContain('hello');
    expect(markup).toContain('working');
    expect(markup).toContain('still working');
    expect(markup).toContain('done');
    expect(markup).toContain('The model is temporarily unavailable.');
    expect(markup).toContain('Retry');
    expect(markup).toContain('Generating');
    expect((markup.match(/role="status"/g) ?? []).length).toBe(1);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toMatch(/agent-message__bubble[^>]*aria-live/);
    expect(markup).not.toContain('Stop Generation');
    expect(markup).not.toContain('stop-viewing');
  });

  it('keeps the composer available but read-only while generating', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const markup = render(
      createElement(Composer, {
        value: 'draft',
        onChange,
        onSubmit,
        disabled: true,
      }),
    );
    expect(markup).toContain('readOnly=""');
    expect(markup).toContain('aria-readonly="true"');
    expect(markup).toContain('aria-label="Generating reply"');
    expect(markup).toContain('disabled=""');
  });

  it('renders the scroll affordance from conversation-owned viewport state', () => {
    const markup = render(
      createElement(MessageList, {
        messages: [{ id: 'user-1', role: 'user', text: 'hello' }],
        isAtBottom: false,
      }),
    );
    expect(markup).toContain('aria-label="Scroll to latest message"');
  });
});
