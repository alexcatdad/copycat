import { describe, it, expect, vi } from 'vitest';
import { createEngine } from './index';
import { Florence2Engine } from './florence2-engine';
import { TesseractEngine } from './tesseract-engine';

vi.mock('./florence2-engine');
vi.mock('./tesseract-engine');

describe('createEngine', () => {
  it('returns Florence2Engine with webgpu for premium tier', async () => {
    const engine = await createEngine('premium');
    expect(Florence2Engine).toHaveBeenCalledWith('webgpu');
  });

  it('returns Florence2Engine with wasm for standard tier', async () => {
    const engine = await createEngine('standard');
    expect(Florence2Engine).toHaveBeenCalledWith('wasm');
  });

  it('returns TesseractEngine for basic tier', async () => {
    const engine = await createEngine('basic');
    expect(TesseractEngine).toHaveBeenCalled();
  });
});
