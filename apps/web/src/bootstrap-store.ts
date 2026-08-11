import { create } from 'zustand';

interface BootstrapState {
  readonly status: 'ready';
}

export const useBootstrapStore = create<BootstrapState>(() => ({
  status: 'ready',
}));
