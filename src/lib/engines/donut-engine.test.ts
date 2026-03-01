import { describe, it, expect, vi } from 'vitest';
import { DonutEngine } from './donut-engine';
import type { PageImage } from '../types';

const {
  mockGenerate,
  mockBatchDecode,
  mockProcess,
  mockModelDispose,
  mockProcessorDispose,
} = vi.hoisted(() => ({
  mockGenerate: vi.fn().mockResolvedValue([[1, 2, 3]]),
  mockBatchDecode: vi.fn().mockReturnValue([
    '<s_menu><s_nm>Americano</s_nm><s_price>$4.50</s_price></s_menu><s_total><s_total_price>$4.50</s_total_price></s_total>',
  ]),
  mockProcess: vi.fn().mockReturnValue({ pixel_values: { dispose: vi.fn() } }),
  mockModelDispose: vi.fn().mockResolvedValue(undefined),
  mockProcessorDispose: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@huggingface/transformers', () => ({
  VisionEncoderDecoderModel: {
    from_pretrained: vi.fn().mockResolvedValue({
      generate: mockGenerate,
      dispose: mockModelDispose,
    }),
  },
  AutoProcessor: {
    from_pretrained: vi.fn().mockResolvedValue(
      Object.assign(mockProcess, { dispose: mockProcessorDispose }),
    ),
  },
  AutoTokenizer: {
    from_pretrained: vi.fn().mockResolvedValue(
      Object.assign(vi.fn().mockReturnValue({ input_ids: [[1]] }), {
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

describe('DonutEngine', () => {
  it('initializes and reports progress', async () => {
    const engine = new DonutEngine('wasm');
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(0);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('processPage returns OCRResult', async () => {
    const engine = new DonutEngine('wasm');
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBeTruthy();
    expect(result.source).toBe('ocr');
  });

  it('throws if processPage called before initialize', async () => {
    const engine = new DonutEngine('wasm');
    await expect(engine.processPage(mockPage)).rejects.toThrow('Engine not initialized');
  });

  it('disposes without error', async () => {
    const engine = new DonutEngine('wasm');
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});

describe('DonutEngine.parseDonutOutput', () => {
  it('extracts text from structured XML-like output', () => {
    const engine = new DonutEngine('wasm');
    const result = engine.parseDonutOutput(
      '<s_menu><s_nm>Latte</s_nm><s_price>$5.00</s_price></s_menu>',
      800, 600,
    );
    expect(result.text).toContain('Latte');
    expect(result.text).toContain('$5.00');
  });

  it('handles plain text fallback', () => {
    const engine = new DonutEngine('wasm');
    const result = engine.parseDonutOutput('Just plain text', 800, 600);
    expect(result.text).toBe('Just plain text');
  });

  it('handles empty output', () => {
    const engine = new DonutEngine('wasm');
    const result = engine.parseDonutOutput('', 800, 600);
    expect(result.text).toBe('');
    expect(result.regions).toHaveLength(0);
  });
});
