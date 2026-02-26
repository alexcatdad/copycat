import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateSearchablePdf } from './pdf-generator';
import type { OCRResult, PageImage, PdfPageDescriptor } from '../types';

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function pngBlob(): Blob {
  return new Blob([Uint8Array.from(atob(tinyPngBase64), (char) => char.charCodeAt(0))], { type: 'image/png' });
}

function makePage(pageNumber: number): PageImage {
  return {
    id: `p-${pageNumber}`,
    src: `data:image/png;base64,${tinyPngBase64}`,
    blob: pngBlob(),
    width: 100,
    height: 100,
    pageNumber,
    sourceKind: 'scanned',
  };
}

function makeResult(text: string): OCRResult {
  return {
    text,
    regions: [
      { text: 'Hello', bbox: [10, 10, 50, 15] },
      { text: 'World', bbox: [65, 10, 25, 15] },
    ],
    source: 'ocr',
    qualityScore: 0.9,
    qualityFlags: [],
  };
}

const mockPages: PageImage[] = [makePage(1)];

const mockResults: OCRResult[] = [makeResult('Hello World')];

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
        source: 'ocr',
        qualityScore: 0.5,
        qualityFlags: ['symbol-noise'],
      },
    ];

    await expect(generateSearchablePdf(malformedResults, mockPages)).resolves.toBeInstanceOf(Blob);
  });

  it('preserves page count when some regions are malformed', async () => {
    const pages: PageImage[] = [makePage(1), makePage(2)];
    const mixedResults: OCRResult[] = [
      {
        text: 'Page 1',
        regions: [
          { text: 'Good', bbox: [10, 10, 60, 20] },
        ],
        source: 'ocr',
        qualityScore: 0.85,
        qualityFlags: [],
      },
      {
        text: 'Page 2',
        regions: [
          { text: 'Bad NaN', bbox: [10, 10, 60, Number.NaN] },
          { text: 'Bad zero', bbox: [10, 10, 0, 20] },
          { text: 'Good', bbox: [10, 40, 60, 20] },
        ],
        source: 'ocr',
        qualityScore: 0.8,
        qualityFlags: [],
      },
    ];

    const blob = await generateSearchablePdf(mixedResults, pages);
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    expect(pdf.getPageCount()).toBe(2);
  });

  it('returns original PDF bytes for fully native descriptors', async () => {
    const original = await PDFDocument.create();
    original.addPage([200, 200]);
    const bytes = new Uint8Array(await original.save());

    const descriptors: PdfPageDescriptor[] = [
      {
        pageNumber: 1,
        sourceKind: 'pdf-text',
        hasNativeText: true,
        nativeResult: makeResult('native text'),
      },
    ];

    const blob = await generateSearchablePdf(mockResults, mockPages, {
      originalPdfBytes: bytes,
      pageDescriptors: descriptors,
    });

    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });
});
