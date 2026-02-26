import type { EngineTier, OCREngine, OCRResult } from '../types';
import type { MockProfile } from './mock-engine';

export type { MockProfile } from './mock-engine';

export interface CreateEngineOptions {
  mockProfile?: MockProfile;
  mockResponses?: OCRResult[];
}

export async function createEngine(
  tier: EngineTier | 'mock',
  options: CreateEngineOptions = {},
): Promise<OCREngine> {
  switch (tier) {
    case 'mock': {
      const { MockEngine } = await import('./mock-engine');
      return new MockEngine({
        profile: options.mockProfile ?? 'default',
        responses: options.mockResponses,
      });
    }
    case 'premium': {
      const { Florence2Engine } = await import('./florence2-engine');
      return new Florence2Engine('webgpu');
    }
    case 'standard': {
      const { Florence2Engine } = await import('./florence2-engine');
      return new Florence2Engine('wasm');
    }
    case 'basic': {
      const { TesseractEngine } = await import('./tesseract-engine');
      return new TesseractEngine();
    }
  }
}
