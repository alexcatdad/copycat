import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  OCR_COMPARISON_GROUND_TRUTH,
  OCR_COMPARISON_PROFILES,
  type OCRComparisonProfile,
} from '../../src/lib/engines/mock-engine';
import {
  evaluateOCRQuality,
  type OCRQualityMetrics,
} from '../../src/lib/ocr-quality';

interface ComparisonResult {
  engine: OCRComparisonProfile;
  extractedText: string;
  metrics: OCRQualityMetrics;
}

async function createDemoSourcePdf(text: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText('CopyCat OCR benchmark source document', {
    x: 48,
    y: 730,
    size: 16,
    font,
  });

  const lines = text.split('\n');
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 48,
      y: 680 - index * 28,
      size: 14,
      font,
    });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

async function uploadPdfAndCollectText(page: Page, profile: OCRComparisonProfile, pdfBuffer: Buffer): Promise<string> {
  await page.goto(`/?engine=mock&mockProfile=${profile}`);
  await expect(page.locator('.upload-zone')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'ocr-comparison-source.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  });

  await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.results-header')).toContainText('1 pages extracted');

  return page.locator('.extracted-text').innerText();
}

test.describe('OCR comparative quality', () => {
  test('ranks OCR profiles by CER/WER on a demo PDF upload', async ({ page }) => {
    test.setTimeout(90_000);

    const sourcePdf = await createDemoSourcePdf(OCR_COMPARISON_GROUND_TRUTH);
    const comparisons: ComparisonResult[] = [];

    for (const profile of OCR_COMPARISON_PROFILES) {
      const extractedText = (await uploadPdfAndCollectText(page, profile, sourcePdf)).trim();
      comparisons.push({
        engine: profile,
        extractedText,
        metrics: evaluateOCRQuality(OCR_COMPARISON_GROUND_TRUTH, extractedText),
      });
    }

    const byProfile = Object.fromEntries(
      comparisons.map((entry) => [entry.engine, entry.metrics]),
    ) as Record<OCRComparisonProfile, OCRQualityMetrics>;

    expect(byProfile.premium.charErrorRate).toBeLessThan(byProfile.standard.charErrorRate);
    expect(byProfile.standard.charErrorRate).toBeLessThan(byProfile.basic.charErrorRate);
    expect(byProfile.premium.wordErrorRate).toBeLessThan(byProfile.standard.wordErrorRate);
    expect(byProfile.standard.wordErrorRate).toBeLessThan(byProfile.basic.wordErrorRate);
    expect(byProfile.premium.charAccuracy).toBeGreaterThan(0.99);
  });
});
