import { describe, it, expect, vi } from 'vitest';
import { createEngine } from './index';
import { Florence2Engine } from './florence2-engine';
import { JanusOcrEngine } from './janus-ocr-engine';
import { MockEngine } from './mock-engine';
import { TesseractEngine } from './tesseract-engine';
import { TrOcrHybridEngine } from './trocr-hybrid-engine';
import { GotOcr2Engine } from './got-ocr2-engine';
import { Florence2LargeEngine } from './florence2-large-engine';
import { TrOcrBaseEngine } from './trocr-base-engine';
import { DonutEngine } from './donut-engine';
import { PaddleOcrEngine } from './paddleocr-engine';
import { TesseractCombinedEngine } from './tesseract-combined-engine';

vi.mock('./florence2-engine');
vi.mock('./janus-ocr-engine');
vi.mock('./mock-engine');
vi.mock('./tesseract-engine');
vi.mock('./trocr-hybrid-engine');
vi.mock('./got-ocr2-engine');
vi.mock('./florence2-large-engine');
vi.mock('./trocr-base-engine');
vi.mock('./donut-engine');
vi.mock('./paddleocr-engine');
vi.mock('./tesseract-combined-engine');

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

  // New engine tests
  it('returns GotOcr2Engine with webgpu for premium when model=got-ocr2', async () => {
    await createEngine('premium', { model: 'got-ocr2' });
    expect(GotOcr2Engine).toHaveBeenCalledWith('webgpu');
  });

  it('returns GotOcr2Engine with wasm for standard when model=got-ocr2', async () => {
    await createEngine('standard', { model: 'got-ocr2' });
    expect(GotOcr2Engine).toHaveBeenCalledWith('wasm');
  });

  it('returns Florence2LargeEngine with webgpu for premium when model=florence2-large', async () => {
    await createEngine('premium', { model: 'florence2-large' });
    expect(Florence2LargeEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns Florence2LargeEngine with wasm for standard when model=florence2-large', async () => {
    await createEngine('standard', { model: 'florence2-large' });
    expect(Florence2LargeEngine).toHaveBeenCalledWith('wasm');
  });

  it('returns TrOcrBaseEngine with webgpu for premium when model=trocr-base', async () => {
    await createEngine('premium', { model: 'trocr-base' });
    expect(TrOcrBaseEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns TrOcrBaseEngine with wasm for standard when model=trocr-base', async () => {
    await createEngine('standard', { model: 'trocr-base' });
    expect(TrOcrBaseEngine).toHaveBeenCalledWith('wasm');
  });

  it('returns DonutEngine with webgpu for premium when model=donut', async () => {
    await createEngine('premium', { model: 'donut' });
    expect(DonutEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns DonutEngine with wasm for standard when model=donut', async () => {
    await createEngine('standard', { model: 'donut' });
    expect(DonutEngine).toHaveBeenCalledWith('wasm');
  });

  it('returns PaddleOcrEngine with webgpu for premium when model=paddleocr', async () => {
    await createEngine('premium', { model: 'paddleocr' });
    expect(PaddleOcrEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns PaddleOcrEngine with wasm for standard when model=paddleocr', async () => {
    await createEngine('standard', { model: 'paddleocr' });
    expect(PaddleOcrEngine).toHaveBeenCalledWith('wasm');
  });

  it('returns TesseractCombinedEngine for basic when model=tesseract-combined', async () => {
    await createEngine('basic', { model: 'tesseract-combined' });
    expect(TesseractCombinedEngine).toHaveBeenCalled();
  });
});
