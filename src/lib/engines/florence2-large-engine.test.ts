import { describe, it, expect, vi } from 'vitest';
import type { PageImage } from '../types';

const {
  mockGenerate,
  mockBatchDecode,
  mockProcess,
  mockConstructPrompts,
  mockPostProcess,
} = vi.hoisted(() => ({
  mockGenerate: vi.fn().mockResolvedValue([[1, 2, 3]]),
  mockBatchDecode: vi.fn().mockReturnValue(['<OCR_WITH_REGION>test text</OCR_WITH_REGION>']),
  mockProcess: vi.fn().mockReturnValue({ pixel_values: { dispose: vi.fn() } }),
  mockConstructPrompts: vi.fn().mockReturnValue('<OCR_WITH_REGION>'),
  mockPostProcess: vi.fn().mockReturnValue({
    '<OCR_WITH_REGION>': {
      labels: ['Hello', 'World'],
      quad_boxes: [10, 20, 100, 20, 100, 50, 10, 50, 110, 20, 200, 20, 200, 50, 110, 50],
    },
  }),
}));

vi.mock('@huggingface/transformers', () => ({
  Florence2ForConditionalGeneration: {
    from_pretrained: vi.fn().mockResolvedValue({
      generate: mockGenerate,
      dispose: vi.fn().mockResolvedValue(undefined),
    }),
  },
  AutoProcessor: {
    from_pretrained: vi.fn().mockResolvedValue(
      Object.assign(mockProcess, {
        construct_prompts: mockConstructPrompts,
        post_process_generation: mockPostProcess,
        dispose: vi.fn().mockResolvedValue(undefined),
      }),
    ),
  },
  AutoTokenizer: {
    from_pretrained: vi.fn().mockResolvedValue(
      Object.assign(vi.fn().mockReturnValue({}), {
        batch_decode: mockBatchDecode,
      }),
    ),
  },
  RawImage: {
    fromURL: vi.fn().mockResolvedValue({ size: [800, 600] }),
  },
  env: {
    backends: { onnx: { wasm: { numThreads: 1 } } },
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

describe('Florence2LargeEngine', () => {
  it('initializes and reports progress', async () => {
    const { Florence2LargeEngine } = await import('./florence2-large-engine');
    const engine = new Florence2LargeEngine('wasm');
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(0);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('processPage returns OCRResult with regions', async () => {
    const { Florence2LargeEngine } = await import('./florence2-large-engine');
    const engine = new Florence2LargeEngine('wasm');
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBeTruthy();
    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.source).toBe('ocr');
  });

  it('throws if processPage called before initialize', async () => {
    const { Florence2LargeEngine } = await import('./florence2-large-engine');
    const engine = new Florence2LargeEngine('wasm');
    await expect(engine.processPage(mockPage)).rejects.toThrow('Engine not initialized');
  });

  it('disposes without error', async () => {
    const { Florence2LargeEngine } = await import('./florence2-large-engine');
    const engine = new Florence2LargeEngine('wasm');
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
