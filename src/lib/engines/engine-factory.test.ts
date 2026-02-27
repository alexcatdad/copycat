import { describe, it, expect, vi } from 'vitest';
import { createEngine } from './index';
import { Florence2Engine } from './florence2-engine';
import { GotOcr2Engine } from './got-ocr2-engine';
import { MockEngine } from './mock-engine';
import { TesseractEngine } from './tesseract-engine';

vi.mock('./florence2-engine');
vi.mock('./got-ocr2-engine');
vi.mock('./mock-engine');
vi.mock('./tesseract-engine');

describe('createEngine', () => {
  it('returns GotOcr2Engine with webgpu for premium tier by default', async () => {
    await createEngine('premium');
    expect(GotOcr2Engine).toHaveBeenCalledWith('webgpu');
  });

  it('returns GotOcr2Engine with wasm for standard tier by default', async () => {
    await createEngine('standard');
    expect(GotOcr2Engine).toHaveBeenCalledWith('wasm');
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
