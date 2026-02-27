import type { EngineTier, OCREngine, OCRResult } from '../types';
import type { MockProfile } from './mock-engine';

export type { MockProfile } from './mock-engine';

export type OcrModel = 'got-ocr2' | 'florence2';

export interface CreateEngineOptions {
  mockProfile?: MockProfile;
  mockResponses?: OCRResult[];
  /** Which model to use for premium/standard tiers. Default: 'got-ocr2'. */
  model?: OcrModel;
}

export async function createEngine(
  tier: EngineTier | 'mock',
  options: CreateEngineOptions = {},
): Promise<OCREngine> {
  const model = options.model ?? 'got-ocr2';

  switch (tier) {
    case 'mock': {
      const { MockEngine } = await import('./mock-engine');
      return new MockEngine({
        profile: options.mockProfile ?? 'default',
        responses: options.mockResponses,
      });
    }
    case 'premium': {
      if (model === 'florence2') {
        const { Florence2Engine } = await import('./florence2-engine');
        return new Florence2Engine('webgpu');
      }
      const { GotOcr2Engine } = await import('./got-ocr2-engine');
      return new GotOcr2Engine('webgpu');
    }
    case 'standard': {
      if (model === 'florence2') {
        const { Florence2Engine } = await import('./florence2-engine');
        return new Florence2Engine('wasm');
      }
      const { GotOcr2Engine } = await import('./got-ocr2-engine');
      return new GotOcr2Engine('wasm');
    }
    case 'basic': {
      const { TesseractEngine } = await import('./tesseract-engine');
      return new TesseractEngine();
    }
  }
}
