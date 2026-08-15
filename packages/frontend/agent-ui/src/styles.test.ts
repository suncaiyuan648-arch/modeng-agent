import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');
const components = readFileSync(
  fileURLToPath(new URL('./components.tsx', import.meta.url)),
  'utf8',
);

const colorTokens = [
  'background-canvas',
  'background-surface',
  'background-elevated',
  'background-sidebar',
  'background-overlay',
  'text-primary',
  'text-secondary',
  'text-tertiary',
  'text-disabled',
  'text-on-primary',
  'border-subtle',
  'border-strong',
  'separator',
  'control-background',
  'control-background-hover',
  'control-background-pressed',
  'control-disabled',
  'action-primary',
  'action-primary-hover',
  'destructive',
  'error',
  'success',
  'warning',
  'focus',
];

describe('frontend-agent-ui semantic token foundation', () => {
  it('defines every required color token for light and dark themes', () => {
    for (const token of colorTokens) {
      expect(styles).toContain(`--ma-${token}:`);
      expect(styles.match(new RegExp(`--ma-${token}:`, 'g'))?.length).toBeGreaterThanOrEqual(2);
    }
    expect(styles).toContain(":root[data-theme='light']");
    expect(styles).toContain(":root[data-theme='dark']");
    expect(styles).not.toContain('.agent-composer__input:focus-visible');
    expect(styles).toContain('.agent-conversation-slogan');
    expect(styles).toContain('.agent-scroll-to-bottom');
    expect(styles).toContain('--ma-material-composer-fade-start:');
    expect(styles).toContain('--ma-material-composer-fade-end:');
    expect(components).toContain('摩灯 Agent，面向真实任务的工作平台');
    expect(components).toContain('isAtBottom');
    expect(components).toContain('Scroll to latest message');
    expect(components.indexOf('agent-conversation-slogan')).toBeLessThan(
      components.indexOf('agent-message-list__anchor'),
    );
  });

  it('contains token-backed interaction and reduced-motion primitives', () => {
    expect(styles).toContain('.agent-button:focus-visible');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('--ma-layout-safe-spacing:');
    expect(styles).not.toContain('Stop Generation');
    expect(styles).not.toContain('stop-viewing');
  });

  it('keeps the composer focusable while generating and anchors the message viewport', () => {
    expect(styles).toContain('height: 100dvh;');
    expect(styles).toContain('overflow: hidden;');
    expect(styles).toContain('min-height: 0;');
    expect(components).toContain('readOnly={disabled}');
    expect(components).toContain('restoreFocus');
    expect(components).toContain('list.scrollTo');
    expect(components).toContain('useLayoutEffect');
  });
});
