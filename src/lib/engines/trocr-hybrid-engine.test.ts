import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PageImage } from '../types';

// Mock tesseract.js
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn().mockResolvedValue({
    setParameters: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn().mockResolvedValue({
      data: {
        text: 'Hello World',
        confidence: 92,
        blocks: [{
          paragraphs: [{
            lines: [
              {
                text: 'Hello World',
                bbox: { x0: 10, y0: 20, x1: 200, y1: 50 },
                confidence: 92,
                words: [
                  { text: 'Hello', bbox: { x0: 10, y0: 20, x1: 100, y1: 50 }, confidence: 95 },
                  { text: 'World', bbox: { x0: 110, y0: 20, x1: 200, y1: 50 }, confidence: 89 },
                ],
              },
            ],
          }],
        }],
      },
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock @huggingface/transformers
vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue([{ generated_text: 'Hello World' }]),
  ),
  env: {
    backends: { onnx: { wasm: { numThreads: 1 } } },
  },
}));

describe('TrOcrHybridEngine', () => {
  let engine: any;

  beforeEach(async () => {
    vi.resetModules();
    const { TrOcrHybridEngine } = await import('./trocr-hybrid-engine');
    engine = new TrOcrHybridEngine('wasm');
  });

  it('can be instantiated with wasm device', () => {
    expect(engine).toBeDefined();
  });

  it('can be instantiated with webgpu device', async () => {
    const { TrOcrHybridEngine } = await import('./trocr-hybrid-engine');
    const gpuEngine = new TrOcrHybridEngine('webgpu');
    expect(gpuEngine).toBeDefined();
  });

  it('initializes both Tesseract and TrOCR', async () => {
    await engine.initialize();

    const { createWorker } = await import('tesseract.js');
    expect(createWorker).toHaveBeenCalled();

    const { pipeline } = await import('@huggingface/transformers');
    expect(pipeline).toHaveBeenCalledWith(
      'image-to-text',
      'Xenova/trocr-small-printed',
      expect.objectContaining({ device: 'wasm' }),
    );
  });

  it('throws when processPage called without initialize', async () => {
    const page: PageImage = {
      id: 'test',
      src: 'data:image/png;base64,iVBORw0KGgo=',
      blob: new Blob(),
      width: 200,
      height: 100,
      pageNumber: 1,
      sourceKind: 'image',
    };

    await expect(engine.processPage(page)).rejects.toThrow('Engine not initialized');
  });

  it('disposes resources on dispose()', async () => {
    await engine.initialize();
    await engine.dispose();
    // Should not throw
  });
});
