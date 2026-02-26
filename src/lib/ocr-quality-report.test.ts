import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateOCRQualityReportPdf } from './ocr-quality-report';

describe('generateOCRQualityReportPdf', () => {
  it('creates a valid pdf file', async () => {
    const pdfBytes = await generateOCRQualityReportPdf({
      title: 'OCR Demo',
      groundTruth: 'CopyCat OCR benchmark sample.',
      generatedAt: '2026-02-26T00:00:00.000Z',
      comparisons: [
        {
          engine: 'premium',
          extractedText: 'CopyCat OCR benchmark sample.',
          metrics: {
            charErrorRate: 0,
            wordErrorRate: 0,
            charAccuracy: 1,
            wordAccuracy: 1,
          },
        },
      ],
    });

    expect(pdfBytes.length).toBeGreaterThan(0);
    const loaded = await PDFDocument.load(pdfBytes);
    expect(loaded.getPageCount()).toBeGreaterThan(0);
  });
});
