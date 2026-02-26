import { describe, it, expect, vi } from 'vitest';
import { TesseractEngine } from './tesseract-engine';
import type { PageImage } from '../types';

// Mock tesseract.js
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn().mockResolvedValue({
    recognize: vi.fn().mockResolvedValue({
      data: {
        text: 'Hello World',
        words: [
          { text: 'Hello', bbox: { x0: 10, y0: 20, x1: 60, y1: 40 } },
          { text: 'World', bbox: { x0: 70, y0: 20, x1: 120, y1: 40 } },
        ],
      },
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockPage: PageImage = {
  dataUrl: 'data:image/png;base64,abc',
  width: 800,
  height: 1200,
  pageNumber: 1,
};

describe('TesseractEngine', () => {
  it('initializes without error', async () => {
    const engine = new TesseractEngine();
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('processPage returns OCRResult with text and regions from words', async () => {
    const engine = new TesseractEngine();
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBe('Hello World');
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].text).toBe('Hello');
    expect(result.regions[0].bbox).toEqual([10, 20, 50, 20]); // [x, y, w, h]
  });

  it('disposes the worker', async () => {
    const engine = new TesseractEngine();
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
