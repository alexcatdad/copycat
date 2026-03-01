import { describe, it, expect, vi } from 'vitest';
import type { PageImage } from '../types';

const { mockInit, mockDetect, mockDispose } = vi.hoisted(() => ({
  mockInit: vi.fn().mockResolvedValue(undefined),
  mockDetect: vi.fn().mockResolvedValue([
    {
      text: 'Hello World',
      box: [[10, 20], [200, 20], [200, 50], [10, 50]],
      confidence: 0.95,
    },
    {
      text: 'PaddleOCR Test',
      box: [[10, 60], [250, 60], [250, 90], [10, 90]],
      confidence: 0.92,
    },
  ]),
  mockDispose: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@aspect-build/aspect-ocr-browser', () => ({
  OCRClient: class {
    init = mockInit;
    detect = mockDetect;
    dispose = mockDispose;
  },
}));

const mockPage: PageImage = {
  id: 'page-1',
  src: 'blob:page-1',
  blob: new Blob(['abc'], { type: 'image/png' }),
  width: 800,
  height: 600,
  pageNumber: 1,
  sourceKind: 'image',
};

describe('PaddleOcrEngine', () => {
  it('initializes and reports progress', async () => {
    const { PaddleOcrEngine } = await import('./paddleocr-engine');
    const engine = new PaddleOcrEngine('wasm');
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(0);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('processPage returns OCRResult with regions', async () => {
    const { PaddleOcrEngine } = await import('./paddleocr-engine');
    const engine = new PaddleOcrEngine('wasm');
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toContain('Hello World');
    expect(result.text).toContain('PaddleOCR Test');
    expect(result.regions.length).toBe(2);
    expect(result.source).toBe('ocr');
  });

  it('throws if processPage called before initialize', async () => {
    const { PaddleOcrEngine } = await import('./paddleocr-engine');
    const engine = new PaddleOcrEngine('wasm');
    await expect(engine.processPage(mockPage)).rejects.toThrow('Engine not initialized');
  });

  it('disposes without error', async () => {
    const { PaddleOcrEngine } = await import('./paddleocr-engine');
    const engine = new PaddleOcrEngine('wasm');
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });

  it('handles polygon bounding box format', async () => {
    const { PaddleOcrEngine } = await import('./paddleocr-engine');
    const engine = new PaddleOcrEngine('wasm');
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    // First region: polygon [[10,20],[200,20],[200,50],[10,50]]
    // Should convert to [10, 20, 190, 30]
    const firstRegion = result.regions[0];
    expect(firstRegion.bbox[0]).toBe(10);
    expect(firstRegion.bbox[1]).toBe(20);
    expect(firstRegion.bbox[2]).toBe(190); // 200 - 10
    expect(firstRegion.bbox[3]).toBe(30); // 50 - 20
  });
});
