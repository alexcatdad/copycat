import { describe, it, expect, vi } from 'vitest';
import { MockEngine, OCR_COMPARISON_GROUND_TRUTH, isMockProfile } from './mock-engine';
import type { PageImage, OCRResult } from '../types';

const mockPage: PageImage = {
  id: 'page-1',
  src: 'blob:page-1',
  blob: new Blob(['abc'], { type: 'image/png' }),
  width: 800,
  height: 1200,
  pageNumber: 1,
  sourceKind: 'image',
};

describe('MockEngine', () => {
  it('initializes and calls onProgress', async () => {
    const onProgress = vi.fn();
    const engine = new MockEngine();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('returns default OCR result for a page', async () => {
    const engine = new MockEngine();
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBeTruthy();
    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.regions[0].bbox).toHaveLength(4);
  });

  it('returns custom responses when configured', async () => {
    const customResult: OCRResult = {
      text: 'Custom text',
      regions: [{ text: 'Custom text', bbox: [10, 20, 200, 30] }],
      source: 'ocr',
      qualityScore: 0.9,
      qualityFlags: [],
    };
    const engine = new MockEngine([customResult]);
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBe('Custom text');
  });

  it('cycles through responses for multiple pages', async () => {
    const results: OCRResult[] = [
      { text: 'Page 1', regions: [{ text: 'Page 1', bbox: [0, 0, 100, 20] }], source: 'ocr', qualityScore: 0.9, qualityFlags: [] },
      { text: 'Page 2', regions: [{ text: 'Page 2', bbox: [0, 0, 100, 20] }], source: 'ocr', qualityScore: 0.9, qualityFlags: [] },
    ];
    const engine = new MockEngine(results);
    await engine.initialize();
    const r1 = await engine.processPage({ ...mockPage, pageNumber: 1 });
    const r2 = await engine.processPage({ ...mockPage, pageNumber: 2 });
    expect(r1.text).toBe('Page 1');
    expect(r2.text).toBe('Page 2');
  });

  it('disposes without error', async () => {
    const engine = new MockEngine();
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });

  it('returns profile-specific results for comparison scenarios', async () => {
    const engine = new MockEngine({ profile: 'premium' });
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBe(OCR_COMPARISON_GROUND_TRUTH);
  });

  it('validates supported mock profiles', () => {
    expect(isMockProfile('default')).toBe(true);
    expect(isMockProfile('premium')).toBe(true);
    expect(isMockProfile('malformed')).toBe(true);
    expect(isMockProfile('unknown')).toBe(false);
  });
});
