import { describe, it, expect } from 'vitest';
import { generateSearchablePdf } from './pdf-generator';
import type { OCRResult, PageImage } from '../types';

const mockPages: PageImage[] = [
  { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', width: 100, height: 100, pageNumber: 1 },
];

const mockResults: OCRResult[] = [
  {
    text: 'Hello World',
    regions: [
      { text: 'Hello', bbox: [10, 10, 50, 15] },
      { text: 'World', bbox: [65, 10, 50, 15] },
    ],
  },
];

describe('generateSearchablePdf', () => {
  it('returns a Blob of type pdf', async () => {
    const blob = await generateSearchablePdf(mockResults, mockPages);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });

  it('produces a non-empty blob', async () => {
    const blob = await generateSearchablePdf(mockResults, mockPages);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles empty results', async () => {
    const blob = await generateSearchablePdf([], []);
    expect(blob).toBeInstanceOf(Blob);
  });
});
