import type { EngineTier, OCREngine, OCRResult } from '../types';
import type { MockProfile } from './mock-engine';

export type { MockProfile } from './mock-engine';

export type OcrModel =
  | 'janus-pro-1b'
  | 'florence2'
  | 'trocr-hybrid'
  | 'got-ocr2'
  | 'paddleocr'
  | 'donut'
  | 'trocr-base'
  | 'florence2-large'
  | 'tesseract-combined';

export interface CreateEngineOptions {
  mockProfile?: MockProfile;
  mockResponses?: OCRResult[];
  /** Which model to use for premium/standard tiers. Default: 'trocr-hybrid'. */
  model?: OcrModel;
  /** Optional Hugging Face token for gated/private model access. */
  hfToken?: string;
}

export async function createEngine(
  tier: EngineTier | 'mock',
  options: CreateEngineOptions = {},
): Promise<OCREngine> {
  const model = options.model ?? 'trocr-hybrid';

  if (options.hfToken) {
    const { env } = await import('@huggingface/transformers');
    (env as any).HF_TOKEN = options.hfToken;
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
        return new Florence2Engine('webgpu');
      }
      if (model === 'florence2-large') {
        const { Florence2LargeEngine } = await import('./florence2-large-engine');
        return new Florence2LargeEngine('webgpu');
      }
      if (model === 'janus-pro-1b') {
        const { JanusOcrEngine } = await import('./janus-ocr-engine');
        return new JanusOcrEngine('webgpu');
      }
      if (model === 'got-ocr2') {
        const { GotOcr2Engine } = await import('./got-ocr2-engine');
        return new GotOcr2Engine('webgpu');
      }
      if (model === 'donut') {
        const { DonutEngine } = await import('./donut-engine');
        return new DonutEngine('webgpu');
      }
      if (model === 'paddleocr') {
        const { PaddleOcrEngine } = await import('./paddleocr-engine');
        return new PaddleOcrEngine('webgpu');
      }
      if (model === 'trocr-base') {
        const { TrOcrBaseEngine } = await import('./trocr-base-engine');
        return new TrOcrBaseEngine('webgpu');
      }
      const { TrOcrHybridEngine } = await import('./trocr-hybrid-engine');
      return new TrOcrHybridEngine('webgpu');
    }
    case 'standard': {
      if (model === 'florence2') {
        const { Florence2Engine } = await import('./florence2-engine');
        return new Florence2Engine('wasm');
      }
      if (model === 'florence2-large') {
        const { Florence2LargeEngine } = await import('./florence2-large-engine');
        return new Florence2LargeEngine('wasm');
      }
      if (model === 'janus-pro-1b') {
        const { JanusOcrEngine } = await import('./janus-ocr-engine');
        return new JanusOcrEngine('wasm');
      }
      if (model === 'got-ocr2') {
        const { GotOcr2Engine } = await import('./got-ocr2-engine');
        return new GotOcr2Engine('wasm');
      }
      if (model === 'donut') {
        const { DonutEngine } = await import('./donut-engine');
        return new DonutEngine('wasm');
      }
      if (model === 'paddleocr') {
        const { PaddleOcrEngine } = await import('./paddleocr-engine');
        return new PaddleOcrEngine('wasm');
      }
      if (model === 'trocr-base') {
        const { TrOcrBaseEngine } = await import('./trocr-base-engine');
        return new TrOcrBaseEngine('wasm');
      }
      const { TrOcrHybridEngine } = await import('./trocr-hybrid-engine');
      return new TrOcrHybridEngine('wasm');
    }
    case 'basic': {
      if (model === 'tesseract-combined') {
        const { TesseractCombinedEngine } = await import('./tesseract-combined-engine');
        return new TesseractCombinedEngine();
      }
      const { TesseractEngine } = await import('./tesseract-engine');
      return new TesseractEngine();
    }
  }
}
