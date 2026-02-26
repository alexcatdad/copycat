import { describe, expect, it } from 'vitest';
import { inferQuality } from './quality-score';

describe('inferQuality', () => {
  it('returns high confidence for native PDF text', () => {
    const quality = inferQuality('Invoice 1234', 'pdf-text');
    expect(quality.qualityScore).toBeGreaterThan(0.95);
    expect(quality.qualityFlags).toEqual([]);
  });

  it('flags noisy OCR outputs', () => {
    const noisy = inferQuality('∎∎∎ ¤¤¤ §¶', 'ocr', 0.7);
    expect(noisy.qualityScore).toBeLessThan(0.7);
    expect(noisy.qualityFlags).toContain('symbol-noise');
  });

  it('penalizes abnormally short OCR text', () => {
    const short = inferQuality('ok', 'ocr', 0.8);
    expect(short.qualityScore).toBeLessThan(0.7);
    expect(short.qualityFlags).toContain('very-short-text');
  });
});
