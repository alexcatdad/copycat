import type { EngineTier, OCREngine } from '../types';
import { Florence2Engine } from './florence2-engine';
import { TesseractEngine } from './tesseract-engine';

export { MockEngine } from './mock-engine';
export { Florence2Engine } from './florence2-engine';
export { TesseractEngine } from './tesseract-engine';

export function createEngine(tier: EngineTier): OCREngine {
  switch (tier) {
    case 'premium':
      return new Florence2Engine('webgpu');
    case 'standard':
      return new Florence2Engine('wasm');
    case 'basic':
      return new TesseractEngine();
  }
}
