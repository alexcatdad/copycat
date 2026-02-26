import { describe, it, expect, vi } from 'vitest';
import { processPipeline } from './pipeline';
import { MockEngine } from './engines/mock-engine';
import type { PageImage, OCRResult } from './types';

const mockPages: PageImage[] = [
  { dataUrl: 'data:image/png;base64,p1', width: 800, height: 1200, pageNumber: 1 },
  { dataUrl: 'data:image/png;base64,p2', width: 800, height: 1200, pageNumber: 2 },
  { dataUrl: 'data:image/png;base64,p3', width: 800, height: 1200, pageNumber: 3 },
];

describe('processPipeline', () => {
  it('processes all pages sequentially and returns results', async () => {
    const results: OCRResult[] = [
      { text: 'Page 1 text', regions: [{ text: 'Page 1 text', bbox: [0, 0, 100, 20] }] },
      { text: 'Page 2 text', regions: [{ text: 'Page 2 text', bbox: [0, 0, 100, 20] }] },
      { text: 'Page 3 text', regions: [{ text: 'Page 3 text', bbox: [0, 0, 100, 20] }] },
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
});
