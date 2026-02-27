import { describe, it, expect, vi } from 'vitest';
import { JanusOcrEngine } from './janus-ocr-engine';
import type { PageImage } from '../types';

const {
  mockGenerate,
  mockModelDispose,
  mockProcessorCall,
  mockBatchDecode,
  mockProcessorDispose,
  mockFromPretrained,
} = vi.hoisted(() => ({
  mockGenerate: vi.fn().mockResolvedValue({
    slice: vi.fn().mockReturnValue('new-tokens'),
  }),
  mockModelDispose: vi.fn().mockResolvedValue(undefined),
  mockProcessorCall: vi.fn().mockResolvedValue({
    input_ids: { dims: [1, 12] },
  }),
  mockBatchDecode: vi.fn().mockReturnValue(['  Extracted line one\\nExtracted line two  ']),
  mockProcessorDispose: vi.fn().mockResolvedValue(undefined),
  mockFromPretrained: vi.fn().mockResolvedValue({
    generate: vi.fn().mockResolvedValue({
      slice: vi.fn().mockReturnValue('new-tokens'),
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@huggingface/transformers', () => ({
  env: {
    backends: {
      onnx: {
        wasm: {
          numThreads: 0,
        },
      },
    },
  },
  MultiModalityCausalLM: {
    from_pretrained: mockFromPretrained,
  },
  AutoProcessor: {
    from_pretrained: vi.fn().mockResolvedValue(
      Object.assign(mockProcessorCall, {
        batch_decode: mockBatchDecode,
        dispose: mockProcessorDispose,
      }),
    ),
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

describe('JanusOcrEngine', () => {
  beforeEach(() => {
    mockFromPretrained.mockReset();
    mockFromPretrained.mockResolvedValue({
      generate: mockGenerate,
      dispose: mockModelDispose,
    });
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({
      slice: vi.fn().mockReturnValue('new-tokens'),
    });
    mockModelDispose.mockClear();
    mockProcessorCall.mockClear();
    mockBatchDecode.mockClear();
    mockBatchDecode.mockReturnValue(['  Extracted line one\\nExtracted line two  ']);
    mockProcessorDispose.mockClear();
  });

  it('initializes model and processor', async () => {
    const engine = new JanusOcrEngine('wasm');
    const onProgress = vi.fn();

    await engine.initialize(onProgress);

    expect(onProgress).toHaveBeenCalledWith(0);
    expect(onProgress).toHaveBeenCalledWith(0.6);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('extracts OCR text and maps a full-page region', async () => {
    const engine = new JanusOcrEngine('wasm');
    await engine.initialize();

    const result = await engine.processPage(mockPage);
    expect(result.text).toBe('Extracted line one\\nExtracted line two');
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].bbox).toEqual([0, 0, 800, 600]);
    expect(result.source).toBe('ocr');
  });

  it('throws when processPage is called before initialize', async () => {
    const engine = new JanusOcrEngine('wasm');
    await expect(engine.processPage(mockPage)).rejects.toThrow('Engine not initialized');
  });

  it('disposes model and processor instances', async () => {
    const engine = new JanusOcrEngine('wasm');
    await engine.initialize();

    await engine.dispose();

    expect(mockModelDispose).toHaveBeenCalledTimes(1);
    expect(mockProcessorDispose).toHaveBeenCalledTimes(1);
  });

  it('retries with fp32 on input dtype mismatch (wasm path)', async () => {
    const firstGenerate = vi.fn().mockRejectedValueOnce(
      new Error('failed to call OrtRun(). ERROR_CODE: 2, ERROR_MESSAGE: Unexpected input data type. Actual: (tensor(float16)) , expected: (tensor(float))'),
    );
    const secondGenerate = vi.fn().mockResolvedValue({
      slice: vi.fn().mockReturnValue('new-tokens'),
    });

    mockFromPretrained
      .mockResolvedValueOnce({
        generate: firstGenerate,
        dispose: vi.fn().mockResolvedValue(undefined),
      })
      .mockResolvedValueOnce({
        generate: secondGenerate,
        dispose: vi.fn().mockResolvedValue(undefined),
      });

    const engine = new JanusOcrEngine('wasm');
    await engine.initialize();

    const result = await engine.processPage(mockPage);
    expect(result.text).toBe('Extracted line one\\nExtracted line two');
    expect(mockFromPretrained).toHaveBeenCalledTimes(2);
    expect(mockFromPretrained.mock.calls[1]?.[1]).toMatchObject({ dtype: 'fp32', device: 'wasm' });
  });

  it('retries with fp32 on input dtype mismatch (webgpu path)', async () => {
    const firstGenerate = vi.fn().mockRejectedValueOnce(
      new Error('Unexpected input data type. Actual: (tensor(float16)) , expected: (tensor(float32))'),
    );
    const secondGenerate = vi.fn().mockResolvedValue({
      slice: vi.fn().mockReturnValue('new-tokens'),
    });

    mockFromPretrained
      .mockResolvedValueOnce({
        generate: firstGenerate,
        dispose: vi.fn().mockResolvedValue(undefined),
      })
      .mockResolvedValueOnce({
        generate: secondGenerate,
        dispose: vi.fn().mockResolvedValue(undefined),
      });

    const engine = new JanusOcrEngine('webgpu');
    await engine.initialize();

    const result = await engine.processPage(mockPage);
    expect(result.text).toBe('Extracted line one\\nExtracted line two');
    expect(mockFromPretrained).toHaveBeenCalledTimes(2);
    expect(mockFromPretrained.mock.calls[1]?.[1]).toMatchObject({ dtype: 'fp32', device: 'webgpu' });
  });

  it('retries with fp32 on webgpu kernel dtype failures', async () => {
    const firstGenerate = vi.fn().mockRejectedValueOnce(
      new Error('[WebGPU] Kernel "[ReduceMean] /vision_model/vision_tower/blocks/blocks.0/norm1/ReduceMean" failed. Error: Unsupported data type: 1'),
    );
    const secondGenerate = vi.fn().mockResolvedValue({
      slice: vi.fn().mockReturnValue('new-tokens'),
    });

    mockFromPretrained
      .mockResolvedValueOnce({
        generate: firstGenerate,
        dispose: vi.fn().mockResolvedValue(undefined),
      })
      .mockResolvedValueOnce({
        generate: secondGenerate,
        dispose: vi.fn().mockResolvedValue(undefined),
      });

    const engine = new JanusOcrEngine('webgpu');
    await engine.initialize();

    const result = await engine.processPage(mockPage);
    expect(result.text).toBe('Extracted line one\\nExtracted line two');
    expect(mockFromPretrained).toHaveBeenCalledTimes(2);
    expect(mockFromPretrained.mock.calls[1]?.[1]).toMatchObject({ dtype: 'fp32', device: 'webgpu' });
  });
});
