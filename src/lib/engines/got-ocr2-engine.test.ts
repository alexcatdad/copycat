import { describe, it, expect, vi } from 'vitest';
import { GotOcr2Engine } from './got-ocr2-engine';
import type { PageImage } from '../types';

const {
  mockGenerate,
  mockBatchDecode,
  mockProcess,
} = vi.hoisted(() => ({
  mockGenerate: vi.fn().mockResolvedValue([[1, 2, 3]]),
  mockBatchDecode: vi.fn().mockReturnValue([
    '<ref>Hello World</ref><box>[[100,200,500,300]]</box><ref>Second line</ref><box>[[100,400,600,500]]</box>',
  ]),
  mockProcess: vi.fn().mockReturnValue({}),
}));

vi.mock('@huggingface/transformers', () => ({
  AutoModel: {
    from_pretrained: vi.fn().mockResolvedValue({
      generate: mockGenerate,
    }),
  },
  AutoProcessor: {
    from_pretrained: vi.fn().mockResolvedValue(mockProcess),
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

describe('GotOcr2Engine', () => {
  it('initializes model, processor, and tokenizer', async () => {
    const engine = new GotOcr2Engine('webgpu');
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(0);
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(onProgress).toHaveBeenCalledWith(0.75);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('processPage returns OCRResult with text and regions', async () => {
    const engine = new GotOcr2Engine('webgpu');
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBeTruthy();
    expect(result.regions).toBeDefined();
    expect(Array.isArray(result.regions)).toBe(true);
    expect(result.source).toBe('ocr');
    expect(result.qualityScore).toBeGreaterThan(0);
  });

  it('throws if processPage called before initialize', async () => {
    const engine = new GotOcr2Engine('webgpu');
    await expect(engine.processPage(mockPage)).rejects.toThrow('Engine not initialized');
  });

  it('disposes without error', async () => {
    const engine = new GotOcr2Engine('webgpu');
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});

describe('GotOcr2Engine.parseGotOcr2Result', () => {
  it('parses structured ref/box output with normalized coordinates', () => {
    const engine = new GotOcr2Engine('wasm');
    const result = engine.parseGotOcr2Result(
      '<ref>Hello</ref><box>[[100,200,500,400]]</box><ref>World</ref><box>[[100,500,600,700]]</box>',
      1000,
      1000,
    );

    expect(result.text).toBe('Hello World');
    expect(result.regions).toHaveLength(2);

    // First region: x=100/1000*1000=100, y=200/1000*1000=200, w=400/1000*1000=400, h=200/1000*1000=200
    expect(result.regions[0].text).toBe('Hello');
    expect(result.regions[0].bbox[0]).toBeCloseTo(100);
    expect(result.regions[0].bbox[1]).toBeCloseTo(200);
    expect(result.regions[0].bbox[2]).toBeCloseTo(400);
    expect(result.regions[0].bbox[3]).toBeCloseTo(200);
  });

  it('handles plain text fallback when no structured output', () => {
    const engine = new GotOcr2Engine('wasm');
    const result = engine.parseGotOcr2Result(
      'Just some plain text without any tags',
      800,
      600,
    );

    expect(result.text).toBe('Just some plain text without any tags');
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].bbox).toEqual([0, 0, 800, 600]);
  });

  it('handles empty output gracefully', () => {
    const engine = new GotOcr2Engine('wasm');
    const result = engine.parseGotOcr2Result('', 800, 600);

    expect(result.text).toBe('');
    expect(result.regions).toHaveLength(0);
  });

  it('skips regions with zero-width or zero-height bboxes', () => {
    const engine = new GotOcr2Engine('wasm');
    const result = engine.parseGotOcr2Result(
      '<ref>Good</ref><box>[[100,100,500,300]]</box><ref>Bad</ref><box>[[200,200,200,200]]</box>',
      1000,
      1000,
    );

    // Second region has x1==x2 (200,200) so width=0, should be skipped
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].text).toBe('Good');
  });

  it('strips HTML tags from plain text fallback', () => {
    const engine = new GotOcr2Engine('wasm');
    const result = engine.parseGotOcr2Result(
      '<s>Some tagged content</s>',
      800,
      600,
    );

    expect(result.text).toBe('Some tagged content');
  });

  it('correctly maps coordinates for non-square images', () => {
    const engine = new GotOcr2Engine('wasm');
    const result = engine.parseGotOcr2Result(
      '<ref>Test</ref><box>[[0,0,1000,1000]]</box>',
      1920,
      1080,
    );

    expect(result.regions[0].bbox[0]).toBeCloseTo(0);
    expect(result.regions[0].bbox[1]).toBeCloseTo(0);
    expect(result.regions[0].bbox[2]).toBeCloseTo(1920);
    expect(result.regions[0].bbox[3]).toBeCloseTo(1080);
  });
});
