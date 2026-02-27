import type { EngineTier, OCREngine, OCRResult } from '../types';
import type { MockProfile } from './mock-engine';

export type { MockProfile } from './mock-engine';

export type OcrModel = 'janus-pro-1b' | 'florence2';

export interface CreateEngineOptions {
  mockProfile?: MockProfile;
  mockResponses?: OCRResult[];
  /** Which model to use for premium/standard tiers. Default: 'janus-pro-1b'. */
  model?: OcrModel;
  /** Optional Hugging Face token for gated/private model access. */
  hfToken?: string;
}

export async function createEngine(
  tier: EngineTier | 'mock',
  options: CreateEngineOptions = {},
): Promise<OCREngine> {
  const model = options.model ?? 'janus-pro-1b';

  if (options.hfToken) {
    const { env } = await import('@huggingface/transformers');
    env.HF_TOKEN = options.hfToken;
  }

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
        return new Florence2Engine('wasm');
      }
      const { JanusOcrEngine } = await import('./janus-ocr-engine');
      return new JanusOcrEngine('wasm');
    }
    case 'standard': {
      if (model === 'florence2') {
        const { Florence2Engine } = await import('./florence2-engine');
        return new Florence2Engine('wasm');
      }
      const { JanusOcrEngine } = await import('./janus-ocr-engine');
      return new JanusOcrEngine('wasm');
    }
    case 'basic': {
      const { TesseractEngine } = await import('./tesseract-engine');
      return new TesseractEngine();
    }
  }
}
