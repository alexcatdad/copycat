import { describe, it, expect } from 'vitest';
import {
  calculateCharacterErrorRate,
  calculateWordErrorRate,
  evaluateOCRQuality,
  normalizeOCRText,
} from './ocr-quality';

describe('OCR quality metrics', () => {
  it('normalizes case and whitespace', () => {
    const normalized = normalizeOCRText('  CopyCat   OCR\nSample  ');
    expect(normalized).toBe('copycat ocr sample');
  });

  it('returns zero error for exact match', () => {
    expect(calculateCharacterErrorRate('CopyCat OCR', 'CopyCat OCR')).toBe(0);
    expect(calculateWordErrorRate('CopyCat OCR', 'CopyCat OCR')).toBe(0);
  });

  it('returns bounded metrics when text differs', () => {
    const metrics = evaluateOCRQuality('Invoice 4821', 'Invoice 482l');
    expect(metrics.charErrorRate).toBeGreaterThan(0);
    expect(metrics.wordErrorRate).toBeGreaterThan(0);
    expect(metrics.charAccuracy).toBeGreaterThan(0);
    expect(metrics.charAccuracy).toBeLessThan(1);
    expect(metrics.wordAccuracy).toBeGreaterThan(0);
    expect(metrics.wordAccuracy).toBeLessThan(1);
  });

  it('treats empty expected text as all-or-nothing', () => {
    expect(calculateCharacterErrorRate('', '')).toBe(0);
    expect(calculateCharacterErrorRate('', 'abc')).toBe(1);
    expect(calculateWordErrorRate('', '')).toBe(0);
    expect(calculateWordErrorRate('', 'abc')).toBe(1);
  });
});
