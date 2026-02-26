import { describe, it, expect, vi } from 'vitest';
import { TesseractEngine } from './tesseract-engine';
import type { PageImage } from '../types';

const { mockSetParameters, mockRecognize } = vi.hoisted(() => ({
  mockSetParameters: vi.fn().mockResolvedValue({
    data: {},
  }),
  mockRecognize: vi.fn().mockResolvedValue({
    data: {
      text: 'Hello World',
      confidence: 92,
      words: [
        { text: 'Hello', bbox: { x0: 10, y0: 20, x1: 60, y1: 40 } },
        { text: 'World', bbox: { x0: 70, y0: 20, x1: 120, y1: 40 } },
      ],
    },
  }),
}));

// Mock tesseract.js
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn().mockResolvedValue({
    setParameters: mockSetParameters,
    recognize: mockRecognize,
    terminate: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockPage: PageImage = {
  id: 'page-1',
  src: 'blob:page-1',
  blob: new Blob(['abc'], { type: 'image/png' }),
  width: 800,
  height: 1200,
  pageNumber: 1,
  sourceKind: 'image',
};

describe('TesseractEngine', () => {
  it('initializes without error', async () => {
    const engine = new TesseractEngine();
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(1);
    expect(mockSetParameters).toHaveBeenCalledWith({
      user_defined_dpi: '300',
      preserve_interword_spaces: '1',
    });
  });

  it('processPage returns OCRResult with text and regions from words', async () => {
    const engine = new TesseractEngine();
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(mockRecognize).toHaveBeenCalledWith(mockPage.src, { rotateAuto: true });
    expect(result.text).toBe('Hello World');
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].text).toBe('Hello');
    expect(result.regions[0].bbox).toEqual([10, 20, 50, 20]); // [x, y, w, h]
    expect(result.source).toBe('ocr');
    expect(result.qualityScore).toBeGreaterThan(0);
  });

  it('disposes the worker', async () => {
    const engine = new TesseractEngine();
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
