import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PageImage } from '../types';

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

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue([{ generated_text: 'Hello World' }]),
  ),
  env: {
    backends: { onnx: { wasm: { numThreads: 1 } } },
  },
}));

describe('TrOcrBaseEngine', () => {
  let engine: any;

  beforeEach(async () => {
    vi.resetModules();
    const { TrOcrBaseEngine } = await import('./trocr-base-engine');
    engine = new TrOcrBaseEngine('wasm');
  });

  it('can be instantiated', () => {
    expect(engine).toBeDefined();
  });

  it('initializes both Tesseract and TrOCR-base', async () => {
    await engine.initialize();
    const { pipeline } = await import('@huggingface/transformers');
    expect(pipeline).toHaveBeenCalledWith(
      'image-to-text',
      'Xenova/trocr-base-printed',
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
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
