import { describe, it, expect, vi } from 'vitest';
import type { PageImage } from '../types';

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn().mockResolvedValue({
    setParameters: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn().mockResolvedValue({
      data: {
        text: 'Hello World Combined',
        confidence: 90,
        words: [
          { text: 'Hello', bbox: { x0: 10, y0: 20, x1: 100, y1: 50 } },
          { text: 'World', bbox: { x0: 110, y0: 20, x1: 200, y1: 50 } },
          { text: 'Combined', bbox: { x0: 210, y0: 20, x1: 350, y1: 50 } },
        ],
      },
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  }),
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

describe('TesseractCombinedEngine', () => {
  it('initializes and reports progress', async () => {
    const { TesseractCombinedEngine } = await import('./tesseract-combined-engine');
    const engine = new TesseractCombinedEngine();
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(0);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('processPage returns OCRResult with text', async () => {
    const { TesseractCombinedEngine } = await import('./tesseract-combined-engine');
    const engine = new TesseractCombinedEngine();
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBeTruthy();
    expect(result.source).toBe('ocr');
    expect(result.regions).toBeDefined();
  });

  it('throws if processPage called before initialize', async () => {
    const { TesseractCombinedEngine } = await import('./tesseract-combined-engine');
    const engine = new TesseractCombinedEngine();
    await expect(engine.processPage(mockPage)).rejects.toThrow('Engine not initialized');
  });

  it('disposes without error', async () => {
    const { TesseractCombinedEngine } = await import('./tesseract-combined-engine');
    const engine = new TesseractCombinedEngine();
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });

  it('sets combined OEM mode parameter', async () => {
    const { createWorker } = await import('tesseract.js');
    const { TesseractCombinedEngine } = await import('./tesseract-combined-engine');
    const engine = new TesseractCombinedEngine();
    await engine.initialize();
    const worker = (createWorker as any).mock.results[0].value;
    const setParamsCalls = (await worker).setParameters.mock.calls;
    expect(setParamsCalls[0][0]).toMatchObject({
      tessedit_ocr_engine_mode: '2',
    });
  });
});
