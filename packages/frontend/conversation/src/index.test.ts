import { describe, expect, it } from 'vitest';

import { OperationIdSchema } from '@modern-agent/shared-contracts';
import {
  attachOperationToUserEntry,
  createConversationUserEntry,
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
});
