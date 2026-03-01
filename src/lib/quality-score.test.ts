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

  // Regression test: exact OCR output from the Asource marketing slide
  // (reported as ~40% confidence, should be 90%+).
  // Reproduces navigation, hero text, bullet points, CTAs, and
  // the compliance dashboard mockup with mixed font sizes.
  it('scores ≥0.90 on the Asource marketing slide (regression)', () => {
    const text = [
      'asource',
      'Product  Solutions  Enterprise  Pricing',
      'Login  Get Started',
      '',
      'Invoice compliance automation',
      'for healthcare, construction,',
      'and logistics firms',
      '',
      '• Reduce compliance risk',
      '• One-click audit readiness',
      '• Built-in regulatory checks',
      '• Automate invoice review',
      '',
      'Start Free Trial    Watch Demo',
      '',
      'Compliance Dashboard',
      'Compliance Score  94%',
      'Regulatory Checks',
      'HIPAA  Passed',
      'OSHA  Passed',
      'DOT  Review',
      'Recent Activity',
      'Invoice #1042 — Auto-approved',
      'Invoice #1039 — Flagged for review',
    ].join('\n');

    // Regions simulate mixed font sizes: nav bar, large heading,
    // medium bullets, small dashboard text — realistic OCR bboxes.
    const regions: Array<{ text: string; bbox: [number, number, number, number] }> = [
      // Nav bar (small)
      { text: 'asource', bbox: [20, 10, 120, 18] },
      { text: 'Product  Solutions  Enterprise  Pricing', bbox: [200, 12, 500, 16] },
      { text: 'Login  Get Started', bbox: [750, 12, 200, 16] },
      // Hero heading (large)
      { text: 'Invoice compliance automation', bbox: [40, 80, 500, 48] },
      { text: 'for healthcare, construction,', bbox: [40, 135, 480, 48] },
      { text: 'and logistics firms', bbox: [40, 190, 320, 48] },
      // Bullet points (medium)
      { text: '• Reduce compliance risk', bbox: [40, 270, 300, 22] },
      { text: '• One-click audit readiness', bbox: [40, 300, 320, 22] },
      { text: '• Built-in regulatory checks', bbox: [40, 330, 330, 22] },
      { text: '• Automate invoice review', bbox: [40, 360, 310, 22] },
      // CTA buttons (medium)
      { text: 'Start Free Trial', bbox: [40, 420, 180, 24] },
      { text: 'Watch Demo', bbox: [240, 420, 130, 24] },
      // Dashboard panel (small-to-medium)
      { text: 'Compliance Dashboard', bbox: [580, 80, 340, 20] },
      { text: 'Compliance Score  94%', bbox: [600, 120, 200, 16] },
      { text: 'Regulatory Checks', bbox: [600, 170, 160, 16] },
      { text: 'HIPAA  Passed', bbox: [610, 200, 120, 14] },
      { text: 'OSHA  Passed', bbox: [610, 220, 110, 14] },
      { text: 'DOT  Review', bbox: [610, 240, 100, 14] },
      { text: 'Recent Activity', bbox: [600, 280, 140, 16] },
      { text: 'Invoice #1042 — Auto-approved', bbox: [610, 310, 280, 14] },
      { text: 'Invoice #1039 — Flagged for review', bbox: [610, 330, 310, 14] },
    ];

    const result = inferQuality(text, 'ocr', 0.95, regions);

    // Clear English text with high engine confidence must score ≥0.90
    expect(result.qualityScore).toBeGreaterThanOrEqual(0.90);
    expect(result.qualityFlags).not.toContain('symbol-noise');
    expect(result.qualityFlags).not.toContain('dictionary-miss');
    expect(result.qualityFlags).not.toContain('height-anomaly');
  });
});
