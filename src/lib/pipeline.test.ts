import { describe, it, expect, vi } from 'vitest';
import { processPipeline } from './pipeline';
import { MockEngine } from './engines/mock-engine';
import type { PageImage, OCRResult } from './types';

function makePage(pageNumber: number): PageImage {
  return {
    id: `p-${pageNumber}`,
    src: `blob:p-${pageNumber}`,
    blob: new Blob([`p${pageNumber}`], { type: 'image/png' }),
    width: 800,
    height: 1200,
    pageNumber,
    sourceKind: 'image',
  };
}

function makeResult(text: string): OCRResult {
  return {
    text,
    regions: [{ text, bbox: [0, 0, 100, 20] }],
    source: 'ocr',
    qualityScore: 0.9,
    qualityFlags: [],
  };
}

const mockPages: PageImage[] = [
  makePage(1),
  makePage(2),
  makePage(3),
];

describe('processPipeline', () => {
  it('processes all pages sequentially and returns results', async () => {
    const results: OCRResult[] = [
      makeResult('Page 1 text'),
      makeResult('Page 2 text'),
      makeResult('Page 3 text'),
    ];
    const engine = new MockEngine(results);
    await engine.initialize();

    const output = await processPipeline(engine, mockPages);
    expect(output).toHaveLength(3);
    expect(output[0].text).toBe('Page 1 text');
    expect(output[2].text).toBe('Page 3 text');
  });

  it('calls onPageComplete for each page', async () => {
    const engine = new MockEngine();
    await engine.initialize();

    const onPageComplete = vi.fn();
    await processPipeline(engine, mockPages, onPageComplete);
    expect(onPageComplete).toHaveBeenCalledTimes(3);
    expect(onPageComplete).toHaveBeenCalledWith(1, 3, expect.any(Object));
    expect(onPageComplete).toHaveBeenCalledWith(3, 3, expect.any(Object));
  });

  it('returns empty array for empty pages', async () => {
    const engine = new MockEngine();
    await engine.initialize();

    const output = await processPipeline(engine, []);
    expect(output).toEqual([]);
  });

  it('supports selective page processing and merge updates', async () => {
    const engine = new MockEngine([
      makeResult('Retry page 2'),
      makeResult('Retry page 3'),
    ]);
    await engine.initialize();

    const existing: Array<OCRResult | null> = [
      makeResult('Page 1'),
      makeResult('Page 2'),
      makeResult('Page 3'),
    ];

    const output = await processPipeline(engine, mockPages, {
      pageIndices: [1, 2],
      existingResults: existing,
    });

    expect(output[0]?.text).toBe('Page 1');
    expect(output[1]?.text).toBe('Retry page 2');
    expect(output[2]?.text).toBe('Retry page 3');
  });
});
