import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectEngineTier } from './capability';

describe('detectEngineTier', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: undefined },
      writable: true,
      configurable: true,
    });
  });

  it('returns "basic" when navigator.gpu is undefined', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      value: undefined,
      configurable: true,
    });
    const tier = await detectEngineTier();
    expect(tier).toBe('basic');
  });

  it('returns "standard" when requestAdapter returns null', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      value: { requestAdapter: vi.fn().mockResolvedValue(null) },
      configurable: true,
    });
    const tier = await detectEngineTier();
    expect(tier).toBe('standard');
  });

  it('returns "premium" when WebGPU adapter is available', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      value: {
        requestAdapter: vi.fn().mockResolvedValue({
          requestDevice: vi.fn().mockResolvedValue({}),
        }),
      },
      configurable: true,
    });
    const tier = await detectEngineTier();
    expect(tier).toBe('premium');
  });

  it('returns "standard" when requestAdapter throws', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      value: {
        requestAdapter: vi.fn().mockRejectedValue(new Error('GPU error')),
      },
      configurable: true,
    });
    const tier = await detectEngineTier();
    expect(tier).toBe('standard');
  });
});
