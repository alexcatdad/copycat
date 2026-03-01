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

  it('flags garbled text with low dictionary match', () => {
    const gibberish = Array.from({ length: 25 }, (_, i) => `xqzp${i}kw`).join(' ');
    const result = inferQuality(gibberish, 'ocr', 0.9);
    expect(result.qualityFlags).toContain('dictionary-miss');
    expect(result.qualityScore).toBeLessThan(0.8);
  });

  it('does not flag text with many common English words', () => {
    const text = 'the quick brown fox jumps over the lazy dog and the cat is on the mat with a hat that is red and blue and green for the day of the year in the month of march';
    const result = inferQuality(text, 'ocr', 0.9);
    expect(result.qualityFlags).not.toContain('dictionary-miss');
  });

  it('flags height anomaly when regions have wildly different heights', () => {
    const regions = [
      { text: 'normal', bbox: [0, 0, 100, 20] as [number, number, number, number] },
      { text: 'normal', bbox: [0, 30, 100, 20] as [number, number, number, number] },
      { text: 'tiny', bbox: [0, 60, 100, 1] as [number, number, number, number] },
      { text: 'normal', bbox: [0, 70, 100, 20] as [number, number, number, number] },
    ];
    const result = inferQuality('normal normal tiny normal', 'ocr', 0.9, regions);
    expect(result.qualityFlags).toContain('height-anomaly');
  });

  it('does not flag height anomaly for intentional heading/body size variation', () => {
    // A heading at 40px and body text at 20px should NOT trigger an anomaly
    const regions = [
      { text: 'Heading', bbox: [0, 0, 400, 40] as [number, number, number, number] },
      { text: 'body text', bbox: [0, 50, 400, 20] as [number, number, number, number] },
      { text: 'more body', bbox: [0, 80, 400, 20] as [number, number, number, number] },
      { text: 'even more', bbox: [0, 110, 400, 22] as [number, number, number, number] },
    ];
    const result = inferQuality('Heading body text more body even more', 'ocr', 0.9, regions);
    expect(result.qualityFlags).not.toContain('height-anomaly');
  });

  it('does not flag height anomaly for consistent heights', () => {
    const regions = [
      { text: 'line1', bbox: [0, 0, 100, 20] as [number, number, number, number] },
      { text: 'line2', bbox: [0, 30, 100, 22] as [number, number, number, number] },
      { text: 'line3', bbox: [0, 60, 100, 19] as [number, number, number, number] },
    ];
    const result = inferQuality('line1 line2 line3', 'ocr', 0.9, regions);
    expect(result.qualityFlags).not.toContain('height-anomaly');
  });

  it('does not flag symbol-noise for common typographic characters', () => {
    const text = '• Reduce compliance risk\n• One-click audit readiness\n• Built-in regulatory checks\n— "Automate invoice review"';
    const result = inferQuality(text, 'ocr', 0.9);
    expect(result.qualityFlags).not.toContain('symbol-noise');
  });

  it('gives high confidence for clear English marketing/business text', () => {
    const text = [
      'Invoice compliance automation for healthcare,',
      'construction, and logistics firms.',
      'Reduce compliance risk.',
      'One-click audit readiness.',
      'Built-in regulatory checks.',
      'Automate invoice review.',
    ].join('\n');
    const result = inferQuality(text, 'ocr', 0.9);
    expect(result.qualityScore).toBeGreaterThan(0.85);
    expect(result.qualityFlags).not.toContain('dictionary-miss');
    expect(result.qualityFlags).not.toContain('symbol-noise');
  });
});
