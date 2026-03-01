import { describe, it, expect, vi } from 'vitest';
import { createEngine } from './index';
import { MockEngine } from './mock-engine';
import { TesseractEngine } from './tesseract-engine';
import { TrOcrHybridEngine } from './trocr-hybrid-engine';
import { TrOcrBaseEngine } from './trocr-base-engine';
import { DonutEngine } from './donut-engine';
import { PaddleOcrEngine } from './paddleocr-engine';
import { TesseractCombinedEngine } from './tesseract-combined-engine';
import { NougatEngine } from './nougat-engine';
import { MgpStrEngine } from './mgp-str-engine';

vi.mock('./mock-engine');
vi.mock('./tesseract-engine');
vi.mock('./trocr-hybrid-engine');
vi.mock('./trocr-base-engine');
vi.mock('./donut-engine');
vi.mock('./paddleocr-engine');
vi.mock('./tesseract-combined-engine');
vi.mock('./nougat-engine');
vi.mock('./mgp-str-engine');

describe('createEngine', () => {
  it('returns TrOcrHybridEngine with webgpu for premium tier by default', async () => {
    await createEngine('premium');
    expect(TrOcrHybridEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns TrOcrHybridEngine with wasm for standard tier by default', async () => {
    await createEngine('standard');
    expect(TrOcrHybridEngine).toHaveBeenCalledWith('wasm');
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

  it('returns TrOcrBaseEngine with webgpu for premium when model=trocr-base', async () => {
    await createEngine('premium', { model: 'trocr-base' });
    expect(TrOcrBaseEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns TrOcrBaseEngine with wasm for standard when model=trocr-base', async () => {
    await createEngine('standard', { model: 'trocr-base' });
    expect(TrOcrBaseEngine).toHaveBeenCalledWith('wasm');
  });

  it('returns TrOcrHybridEngine with handwritten model for premium when model=trocr-small-handwritten', async () => {
    await createEngine('premium', { model: 'trocr-small-handwritten' });
    expect(TrOcrHybridEngine).toHaveBeenCalledWith('webgpu', 'eng', 'Xenova/trocr-small-handwritten');
  });

  it('returns TrOcrHybridEngine with handwritten model for standard when model=trocr-small-handwritten', async () => {
    await createEngine('standard', { model: 'trocr-small-handwritten' });
    expect(TrOcrHybridEngine).toHaveBeenCalledWith('wasm', 'eng', 'Xenova/trocr-small-handwritten');
  });

  it('returns TrOcrBaseEngine with handwritten model for premium when model=trocr-base-handwritten', async () => {
    await createEngine('premium', { model: 'trocr-base-handwritten' });
    expect(TrOcrBaseEngine).toHaveBeenCalledWith('webgpu', 'eng', 'Xenova/trocr-base-handwritten');
  });

  it('returns TrOcrBaseEngine with handwritten model for standard when model=trocr-base-handwritten', async () => {
    await createEngine('standard', { model: 'trocr-base-handwritten' });
    expect(TrOcrBaseEngine).toHaveBeenCalledWith('wasm', 'eng', 'Xenova/trocr-base-handwritten');
  });

  it('returns DonutEngine with webgpu for premium when model=donut', async () => {
    await createEngine('premium', { model: 'donut' });
    expect(DonutEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns DonutEngine with wasm for standard when model=donut', async () => {
    await createEngine('standard', { model: 'donut' });
    expect(DonutEngine).toHaveBeenCalledWith('wasm');
  });

  it('returns NougatEngine with webgpu for premium when model=nougat', async () => {
    await createEngine('premium', { model: 'nougat' });
    expect(NougatEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns NougatEngine with wasm for standard when model=nougat', async () => {
    await createEngine('standard', { model: 'nougat' });
    expect(NougatEngine).toHaveBeenCalledWith('wasm');
  });

  it('returns MgpStrEngine with webgpu for premium when model=mgp-str', async () => {
    await createEngine('premium', { model: 'mgp-str' });
    expect(MgpStrEngine).toHaveBeenCalledWith('webgpu');
  });

  it('returns MgpStrEngine with wasm for standard when model=mgp-str', async () => {
    await createEngine('standard', { model: 'mgp-str' });
    expect(MgpStrEngine).toHaveBeenCalledWith('wasm');
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
