import { describe, it, expect, vi } from 'vitest';
import { Florence2Engine } from './florence2-engine';
import type { PageImage } from '../types';

// vi.hoisted() runs before vi.mock hoisting, making these available in the mock factory
const {
  mockGenerate,
  mockBatchDecode,
  mockProcess,
  mockConstructPrompts,
  mockPostProcess,
} = vi.hoisted(() => ({
  mockGenerate: vi.fn().mockResolvedValue([[1, 2, 3]]),
  mockBatchDecode: vi.fn().mockReturnValue(['<OCR_WITH_REGION>text1<loc_100><loc_200><loc_300><loc_400>text2<loc_500><loc_600><loc_700><loc_800></OCR_WITH_REGION>']),
  mockProcess: vi.fn().mockReturnValue({}),
  mockConstructPrompts: vi.fn().mockReturnValue('<OCR_WITH_REGION>'),
  mockPostProcess: vi.fn().mockReturnValue({
    '<OCR_WITH_REGION>': {
      labels: ['text1', 'text2'],
      quad_boxes: [100, 200, 300, 200, 300, 400, 100, 400, 500, 600, 700, 600, 700, 800, 500, 800],
    },
  }),
}));

vi.mock('@huggingface/transformers', () => ({
  Florence2ForConditionalGeneration: {
    from_pretrained: vi.fn().mockResolvedValue({
      generate: mockGenerate,
    }),
  },
  AutoProcessor: {
    from_pretrained: vi.fn().mockResolvedValue(Object.assign(mockProcess, {
      construct_prompts: mockConstructPrompts,
      post_process_generation: mockPostProcess,
    })),
  },
  AutoTokenizer: {
    from_pretrained: vi.fn().mockResolvedValue(
      Object.assign(vi.fn().mockReturnValue({}), {
        batch_decode: mockBatchDecode,
      }),
    ),
  },
  RawImage: {
    fromURL: vi.fn().mockResolvedValue({ size: [800, 1200] }),
  },
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

describe('Florence2Engine', () => {
  it('initializes model, processor, and tokenizer', async () => {
    const engine = new Florence2Engine('webgpu');
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalled();
  });

  it('processPage returns OCRResult with text and regions', async () => {
    const engine = new Florence2Engine('webgpu');
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBeTruthy();
    expect(result.regions).toBeDefined();
    expect(Array.isArray(result.regions)).toBe(true);
    expect(result.source).toBe('ocr');
    expect(result.qualityScore).toBeGreaterThan(0);
  });

  it('disposes without error', async () => {
    const engine = new Florence2Engine('webgpu');
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
