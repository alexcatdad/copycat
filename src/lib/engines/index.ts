import type { EngineTier, OCREngine, OCRResult } from '../types';
import type { MockProfile } from './mock-engine';

export type { MockProfile } from './mock-engine';

export type OcrModel =
  | 'trocr-hybrid'
  | 'trocr-base'
  | 'trocr-small-handwritten'
  | 'trocr-base-handwritten'
  | 'donut'
  | 'nougat'
  | 'mgp-str'
  | 'paddleocr'
  | 'tesseract-combined';

export interface CreateEngineOptions {
  mockProfile?: MockProfile;
  mockResponses?: OCRResult[];
  /** Which model to use for premium/standard tiers. Default: 'trocr-hybrid'. */
  model?: OcrModel;
}

export async function createEngine(
  tier: EngineTier | 'mock',
  options: CreateEngineOptions = {},
): Promise<OCREngine> {
  const model = options.model ?? 'trocr-hybrid';

  switch (tier) {
    case 'mock': {
      const { MockEngine } = await import('./mock-engine');
      return new MockEngine({
        profile: options.mockProfile ?? 'default',
        responses: options.mockResponses,
      });
    }
    case 'premium': {
      if (model === 'donut') {
        const { DonutEngine } = await import('./donut-engine');
        return new DonutEngine('webgpu');
      }
      if (model === 'nougat') {
        const { NougatEngine } = await import('./nougat-engine');
        return new NougatEngine('webgpu');
      }
      if (model === 'mgp-str') {
        const { MgpStrEngine } = await import('./mgp-str-engine');
        return new MgpStrEngine('webgpu');
      }
      if (model === 'paddleocr') {
        const { PaddleOcrEngine } = await import('./paddleocr-engine');
        return new PaddleOcrEngine('webgpu');
      }
      if (model === 'trocr-base') {
        const { TrOcrBaseEngine } = await import('./trocr-base-engine');
        return new TrOcrBaseEngine('webgpu');
      }
      if (model === 'trocr-small-handwritten') {
        const { TrOcrHybridEngine } = await import('./trocr-hybrid-engine');
        return new TrOcrHybridEngine('webgpu', 'eng', 'Xenova/trocr-small-handwritten');
      }
      if (model === 'trocr-base-handwritten') {
        const { TrOcrBaseEngine } = await import('./trocr-base-engine');
        return new TrOcrBaseEngine('webgpu', 'eng', 'Xenova/trocr-base-handwritten');
      }
      const { TrOcrHybridEngine } = await import('./trocr-hybrid-engine');
      return new TrOcrHybridEngine('webgpu');
    }
    case 'standard': {
      if (model === 'donut') {
        const { DonutEngine } = await import('./donut-engine');
        return new DonutEngine('wasm');
      }
      if (model === 'nougat') {
        const { NougatEngine } = await import('./nougat-engine');
        return new NougatEngine('wasm');
      }
      if (model === 'mgp-str') {
        const { MgpStrEngine } = await import('./mgp-str-engine');
        return new MgpStrEngine('wasm');
      }
      if (model === 'paddleocr') {
        const { PaddleOcrEngine } = await import('./paddleocr-engine');
        return new PaddleOcrEngine('wasm');
      }
      if (model === 'trocr-base') {
        const { TrOcrBaseEngine } = await import('./trocr-base-engine');
        return new TrOcrBaseEngine('wasm');
      }
      if (model === 'trocr-small-handwritten') {
        const { TrOcrHybridEngine } = await import('./trocr-hybrid-engine');
        return new TrOcrHybridEngine('wasm', 'eng', 'Xenova/trocr-small-handwritten');
      }
      if (model === 'trocr-base-handwritten') {
        const { TrOcrBaseEngine } = await import('./trocr-base-engine');
        return new TrOcrBaseEngine('wasm', 'eng', 'Xenova/trocr-base-handwritten');
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
