import { describe, expect, it } from 'vitest';

import { getWorkerStatus } from './main.js';

describe('worker composition root', () => {
  it('is ready without starting a queue consumer', () => {
    expect(getWorkerStatus()).toEqual({ service: 'worker', status: 'ready' });
  });
});
