import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
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

  it('skips invalid OCR regions instead of throwing', async () => {
    const malformedResults: OCRResult[] = [
      {
        text: 'Hello',
        regions: [
          { text: 'Broken', bbox: [10, 10, 50, Number.NaN] },
          { text: 'Also broken', bbox: [10, 10, 0, 20] },
          { text: 'Valid', bbox: [10, 10, 50, 20] },
        ],
      },
    ];

    await expect(generateSearchablePdf(malformedResults, mockPages)).resolves.toBeInstanceOf(Blob);
  });

  it('preserves page count when some regions are malformed', async () => {
    const pages: PageImage[] = [
      ...mockPages,
      { ...mockPages[0], pageNumber: 2 },
    ];
    const mixedResults: OCRResult[] = [
      {
        text: 'Page 1',
        regions: [
          { text: 'Good', bbox: [10, 10, 60, 20] },
        ],
      },
      {
        text: 'Page 2',
        regions: [
          { text: 'Bad NaN', bbox: [10, 10, 60, Number.NaN] },
          { text: 'Bad zero', bbox: [10, 10, 0, 20] },
          { text: 'Good', bbox: [10, 40, 60, 20] },
        ],
      },
    ];

    const blob = await generateSearchablePdf(mixedResults, pages);
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    expect(pdf.getPageCount()).toBe(2);
  });
});
