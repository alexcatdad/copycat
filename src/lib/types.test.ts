import { describe, it, expect } from 'vitest';
import type { OCREngine, OCRResult, OCRRegion, PageImage, EngineTier, AppState } from './types';

describe('Core types', () => {
  it('OCRResult has text and regions', () => {
    const result: OCRResult = {
      text: 'Hello world',
      regions: [
        { text: 'Hello', bbox: [0, 0, 50, 20] },
        { text: 'world', bbox: [55, 0, 110, 20] },
      ],
    };
    expect(result.text).toBe('Hello world');
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].bbox).toEqual([0, 0, 50, 20]);
  });

  it('PageImage holds image data and dimensions', () => {
    const page: PageImage = {
      dataUrl: 'data:image/png;base64,abc',
      width: 800,
      height: 1200,
      pageNumber: 1,
    };
    expect(page.width).toBe(800);
    expect(page.pageNumber).toBe(1);
  });

  it('EngineTier has correct values', () => {
    const tiers: EngineTier[] = ['premium', 'standard', 'basic'];
    expect(tiers).toContain('premium');
    expect(tiers).toContain('standard');
    expect(tiers).toContain('basic');
  });

  it('AppState has correct values', () => {
    const states: AppState[] = ['idle', 'loading-model', 'processing', 'complete'];
    expect(states).toHaveLength(4);
  });
});
