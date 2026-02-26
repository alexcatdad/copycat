import { describe, it, expect } from 'vitest';
import { appStore, resetApp } from './app-state.svelte';

describe('appStore', () => {
  it('has correct initial state', () => {
    resetApp();
    expect(appStore.state).toBe('idle');
    expect(appStore.engineTier).toBe('basic');
    expect(appStore.pages).toEqual([]);
    expect(appStore.ocrResults).toEqual([]);
    expect(appStore.currentPage).toBe(0);
    expect(appStore.progress).toEqual({ current: 0, total: 0 });
  });
});
