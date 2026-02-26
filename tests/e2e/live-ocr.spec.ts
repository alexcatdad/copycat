import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluateOCRQuality } from '../../src/lib/ocr-quality';

const LIVE_OCR_ENABLED = process.env.LIVE_OCR === '1';
const LIVE_OCR_TITLE = 'CopyCat Live OCR Benchmark';
const LIVE_OCR_SUBTITLE = 'Real Florence-2/Tesseract quality check';

const LIVE_OCR_BODY_LINES = [
  'ACME Supplies, Inc.',
  'Invoice #4821',
  'Bill To: Northwind Logistics',
  'Item A4 Paper (5 boxes) x 3 @ $89.50 = $268.50',
  'Item USB-C Dock x 2 @ $149.00 = $298.00',
  'Subtotal: $566.50',
  'Tax (8.75%): $49.57',
  'Total due: $616.07',
  'Payment due date: 2026-03-01',
  'Notes: Deliver before 5pm. Leave at loading dock B.',
] as const;

const LIVE_OCR_ALL_VISIBLE_LINES = [
  LIVE_OCR_TITLE,
  LIVE_OCR_SUBTITLE,
  ...LIVE_OCR_BODY_LINES,
] as const;

const LIVE_OCR_GROUND_TRUTH = LIVE_OCR_ALL_VISIBLE_LINES.join('\n');

async function createLiveBenchmarkPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const headerFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText(LIVE_OCR_TITLE, {
    x: 48,
    y: 744,
    size: 18,
    font: headerFont,
  });

  page.drawText(LIVE_OCR_SUBTITLE, {
    x: 48,
    y: 720,
    size: 12,
    font: bodyFont,
  });

  LIVE_OCR_BODY_LINES.forEach((line, index) => {
    page.drawText(line, {
      x: 48,
      y: 684 - index * 28,
      size: 15,
      font: bodyFont,
    });
  });

  return Buffer.from(await pdfDoc.save());
}

async function runEngine(page: Page, tier: 'standard' | 'basic', sourcePdf: Buffer) {
  await page.goto(`/?engine=${tier}&strictEngine=1`);
  await expect(page.locator('.upload-zone')).toBeVisible();
  await expect(page.locator('.tier-badge')).toContainText(tier === 'standard' ? 'Standard' : 'Basic OCR');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'live-ocr-source.pdf',
    mimeType: 'application/pdf',
    buffer: sourcePdf,
  });

  await expect(page.locator('.results-view')).toBeVisible({ timeout: 8 * 60 * 1000 });
  const extractedText = (await page.locator('.extracted-text').innerText()).trim();
  const metrics = evaluateOCRQuality(LIVE_OCR_GROUND_TRUTH, extractedText);

  return { extractedText, metrics };
}

test.describe('Live OCR engines (Florence-2 + Tesseract)', () => {
  test.skip(!LIVE_OCR_ENABLED, 'Set LIVE_OCR=1 to run live OCR engine tests.');

  test('processes a real PDF with standard (Florence-2) and basic (Tesseract)', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);

    const sourcePdf = await createLiveBenchmarkPdf();
    const standard = await runEngine(page, 'standard', sourcePdf);
    const basic = await runEngine(page, 'basic', sourcePdf);

    const liveResults = {
      generatedAt: new Date().toISOString(),
      groundTruth: LIVE_OCR_GROUND_TRUTH,
      engines: {
        standard: standard.metrics,
        basic: basic.metrics,
      },
      extractedText: {
        standard: standard.extractedText,
        basic: basic.extractedText,
      },
    };

    const outputDir = path.resolve(process.cwd(), 'docs/demo');
    await mkdir(outputDir, { recursive: true });
    await writeFile(
      path.join(outputDir, 'live-ocr-results.json'),
      `${JSON.stringify(liveResults, null, 2)}\n`,
      'utf8',
    );
    console.log('LIVE_OCR_RESULTS', JSON.stringify(liveResults));

    expect(standard.extractedText.length).toBeGreaterThan(30);
    expect(basic.extractedText.length).toBeGreaterThan(30);

    // Live runs can vary by hardware/runtime; keep thresholds practical but meaningful.
    expect(standard.metrics.charAccuracy).toBeGreaterThan(0.65);
    expect(standard.metrics.wordAccuracy).toBeGreaterThan(0.45);
    expect(basic.metrics.charAccuracy).toBeGreaterThan(0.55);
    expect(basic.metrics.wordAccuracy).toBeGreaterThan(0.35);

    // Engines can trade wins on specific documents; guard against large regressions only.
    expect(Math.abs(standard.metrics.charAccuracy - basic.metrics.charAccuracy)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(standard.metrics.wordAccuracy - basic.metrics.wordAccuracy)).toBeLessThanOrEqual(0.2);
  });
});
