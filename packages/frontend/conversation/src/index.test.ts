import { describe, expect, it } from 'vitest';

import { OperationIdSchema } from '@modern-agent/shared-contracts';
import type { ConversationAssistantMessageInput } from './index.js';
import {
  attachOperationToUserEntry,
  createConversationController,
  createConversationUserEntry,
  isConversationViewportAtBottom,
  projectConversationMessages,
  shouldSubmitComposerKey,
} from './index.js';

describe('frontend conversation interaction helpers', () => {
  it('trims a user entry and attaches an immutable operation reference', () => {
    const entry = createConversationUserEntry('user-1', '  hello  ');
    expect(entry).toEqual({ id: 'user-1', text: 'hello' });
    expect(attachOperationToUserEntry(entry, OperationIdSchema.parse('operation_1'))).toEqual({
      id: 'user-1',
      text: 'hello',
      operationId: 'operation_1',
    });
  });

  it('keeps IME composition from submitting and permits Shift+Enter', () => {
    expect(shouldSubmitComposerKey({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(
      true,
    );
    expect(shouldSubmitComposerKey({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(
      false,
    );
    expect(shouldSubmitComposerKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(
      false,
    );
  });

  it('owns draft, request, timeline, and retry references in one controller', () => {
    const controller = createConversationController();
    controller.setDraft('hello');
    const user = controller.beginSubmission(' hello ');
    controller.attachOperation(user.id, OperationIdSchema.parse('operation_conversation'));
    controller.setRequestError('temporary');

    expect(controller.getState()).toEqual({
      draft: '',
      users: [{ id: 'user-1', text: 'hello', operationId: 'operation_conversation' }],
      requestError: 'temporary',
      viewport: { isAtBottom: true },
    });
    expect(
      controller.findUserByOperationId(OperationIdSchema.parse('operation_conversation')),
    ).toEqual(controller.getState().users[0]);
    controller.clearRequestError();
    expect(controller.getState().requestError).toBeUndefined();
  });

  it('projects runtime facts into immutable conversation messages', () => {
    const users = [
      attachOperationToUserEntry(
        createConversationUserEntry('user-1', 'hello'),
        OperationIdSchema.parse('operation_conversation_projection'),
      ),
    ];
    expect(
      projectConversationMessages(
        {
          operations: {
            operation_conversation_projection: {
              operationId: OperationIdSchema.parse('operation_conversation_projection'),
              status: 'failed',
              text: '',
              lastSequence: 2,
              error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Unavailable', retryable: true },
            },
          },
        },
        users,
        (input) => ({
          id: `assistant-${input.operationId}`,
          role: 'assistant',
          text: input.text,
          status: input.status,
          ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage }),
          ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
        }),
      ),
    ).toEqual([
      { id: 'user-1', role: 'user', text: 'hello' },
      {
        id: 'assistant-operation_conversation_projection',
        role: 'assistant',
        text: '',
        status: 'failed',
        errorMessage: 'Unavailable',
        retryable: true,
      },
    ]);
  });

  it('delegates assistant rendering to the capability projector', () => {
    const users = [
      attachOperationToUserEntry(
        createConversationUserEntry('user-1', 'hello'),
        OperationIdSchema.parse('operation_projector'),
      ),
    ];
    const projectAssistantMessage = (input: ConversationAssistantMessageInput) => ({
      id: `talk-${input.operationId}`,
      role: 'assistant' as const,
      text: `[${input.status}] ${input.text}`,
      status: input.status,
    });

    expect(
      projectConversationMessages(
        {
          operations: {
            operation_projector: {
              operationId: OperationIdSchema.parse('operation_projector'),
              status: 'running',
              text: 'delta',
              lastSequence: 2,
            },
          },
        },
        users,
        projectAssistantMessage,
      ),
    ).toEqual([
      { id: 'user-1', role: 'user', text: 'hello' },
      {
        id: 'talk-operation_projector',
        role: 'assistant',
        text: '[streaming] delta',
        status: 'streaming',
      },
    ]);
  });

  it('owns the viewport follow state and preserves it across conversation updates', () => {
    expect(
      isConversationViewportAtBottom({ scrollHeight: 1000, scrollTop: 952, clientHeight: 48 }),
    ).toBe(true);
    expect(
      isConversationViewportAtBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 48 }),
    ).toBe(false);

    const controller = createConversationController();
    controller.updateViewport({ scrollHeight: 1000, scrollTop: 100, clientHeight: 48 });
    expect(controller.getState().viewport).toEqual({ isAtBottom: false });
    controller.setRequestError('temporary');
    expect(controller.getState().viewport).toEqual({ isAtBottom: false });
    controller.clearRequestError();
    expect(controller.getState().viewport).toEqual({ isAtBottom: false });
  });
});
