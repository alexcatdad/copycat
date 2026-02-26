import type { EngineTier, OCREngine } from '../types';

export { MockEngine } from './mock-engine';

export async function createEngine(tier: EngineTier): Promise<OCREngine> {
  switch (tier) {
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
