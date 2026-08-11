import { describe, expect, it } from 'vitest';

import { scanText } from '../../scripts/check-secrets.mjs';

describe('secret scanner', () => {
  it('ignores blank and documented placeholders', () => {
    expect(scanText('OPENAI_API_KEY=')).toEqual([]);
    expect(scanText('POSTGRES_PASSWORD=replace_for_non_local_use')).toEqual([]);
    expect(scanText('REDIS_PASSWORD: ${REDIS_PASSWORD:?REDIS_PASSWORD must be set}')).toEqual([]);
  });

  it('detects provider credentials without printing their value', () => {
    const findings = scanText(`OPENAI_API_KEY=sk-${'a'.repeat(24)}`);

    expect(findings).toEqual([
      { line: 1, rule: 'openai-key' },
      { line: 1, rule: 'secret-assignment' },
    ]);
  });

  it('detects private keys', () => {
    const privateKeyMarker = ['-----BEGIN', ' PRIVATE KEY-----'].join('');

    expect(scanText(privateKeyMarker)).toEqual([{ line: 1, rule: 'private-key' }]);
  });
});
