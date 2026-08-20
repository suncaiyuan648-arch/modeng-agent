import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('TALK application identity', () => {
  it('keeps the browser surface provider-agnostic', () => {
    const markup = renderToStaticMarkup(createElement(App));
    expect(markup).toContain('Modeng AI');
    expect(markup).not.toMatch(/fake|local composition|provider|deepseek/i);
  });
});
