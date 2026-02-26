import { describe, it, expect } from 'vitest';
import { generateDocx } from './docx-generator';
import type { OCRResult, PageImage } from '../types';

const mockPages: PageImage[] = [
  { id: 'p1', src: 'blob:p1', blob: new Blob(['p1'], { type: 'image/png' }), width: 800, height: 1200, pageNumber: 1, sourceKind: 'image' },
  { id: 'p2', src: 'blob:p2', blob: new Blob(['p2'], { type: 'image/png' }), width: 800, height: 1200, pageNumber: 2, sourceKind: 'image' },
];

const mockResults: OCRResult[] = [
  {
    text: 'Hello World',
    regions: [
      { text: 'Hello', bbox: [50, 100, 200, 30] },
      { text: 'World', bbox: [50, 150, 200, 30] },
    ],
    source: 'ocr',
    qualityScore: 0.91,
    qualityFlags: [],
  },
  {
    text: 'Page two content',
    regions: [
      { text: 'Page two', bbox: [50, 100, 250, 30] },
      { text: 'content', bbox: [50, 150, 200, 30] },
    ],
    source: 'ocr',
    qualityScore: 0.88,
    qualityFlags: [],
  },
];

describe('generateDocx', () => {
  it('returns a Blob of type docx', async () => {
    const blob = await generateDocx(mockResults, mockPages);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('produces a non-empty blob', async () => {
    const blob = await generateDocx(mockResults, mockPages);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles empty results', async () => {
    const blob = await generateDocx([], []);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0); // Still valid DOCX, just empty
  });
});
