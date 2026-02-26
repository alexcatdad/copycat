import type { EngineTier } from './types';

export async function detectEngineTier(): Promise<EngineTier> {
  if (typeof navigator === 'undefined' || !(navigator as any).gpu) {
    return 'basic';
  }

  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) {
      return 'standard';
    }
    return 'premium';
  } catch {
    return 'standard';
  }
}
