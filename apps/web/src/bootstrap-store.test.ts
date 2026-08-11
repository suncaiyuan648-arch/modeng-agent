import { describe, expect, it } from 'vitest';

import { useBootstrapStore } from './bootstrap-store.js';

describe('bootstrap store', () => {
  it('starts ready without owning domain state', () => {
    expect(useBootstrapStore.getState()).toEqual({ status: 'ready' });
  });
});
