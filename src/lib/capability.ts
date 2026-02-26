import type { EngineTier } from './types';

export async function detectEngineTier(): Promise<EngineTier> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return 'basic';
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return 'standard';
    }
    return 'premium';
  } catch {
    return 'standard';
  }
}
