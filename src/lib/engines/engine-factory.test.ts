import { describe, it, expect, vi } from 'vitest';
import { createEngine } from './index';
import { Florence2Engine } from './florence2-engine';
import { JanusOcrEngine } from './janus-ocr-engine';
import { MockEngine } from './mock-engine';
import { TesseractEngine } from './tesseract-engine';
import { TrOcrHybridEngine } from './trocr-hybrid-engine';

vi.mock('./florence2-engine');
vi.mock('./janus-ocr-engine');
vi.mock('./mock-engine');
vi.mock('./tesseract-engine');
vi.mock('./trocr-hybrid-engine');

describe('createEngine', () => {
  it('returns TrOcrHybridEngine with webgpu for premium tier by default', async () => {
    await createEngine('premium');
    expect(TrOcrHybridEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns TrOcrHybridEngine with wasm for standard tier by default', async () => {
    await createEngine('standard');
    expect(TrOcrHybridEngine).toHaveBeenCalledWith('wasm');
  });

  it('returns JanusOcrEngine with webgpu for premium when model=janus-pro-1b', async () => {
    await createEngine('premium', { model: 'janus-pro-1b' });
    expect(JanusOcrEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns JanusOcrEngine with wasm for standard when model=janus-pro-1b', async () => {
    await createEngine('standard', { model: 'janus-pro-1b' });
    expect(JanusOcrEngine).toHaveBeenCalledWith('wasm');
  });

  it('returns Florence2Engine with webgpu for premium when model=florence2', async () => {
    await createEngine('premium', { model: 'florence2' });
    expect(Florence2Engine).toHaveBeenCalledWith('webgpu');
  });

  it('returns Florence2Engine with wasm for standard when model=florence2', async () => {
    await createEngine('standard', { model: 'florence2' });
    expect(Florence2Engine).toHaveBeenCalledWith('wasm');
  });

  it('returns TesseractEngine for basic tier', async () => {
    await createEngine('basic');
    expect(TesseractEngine).toHaveBeenCalled();
  });

  it('returns MockEngine for mock tier and forwards profile', async () => {
    await createEngine('mock', { mockProfile: 'premium' });
    expect(MockEngine).toHaveBeenCalledWith({
      profile: 'premium',
      responses: undefined,
    });
  });
});
