import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { evaluateOCRQuality } from '../../src/lib/ocr-quality';

type LiveTier = 'basic' | 'standard';

const LIVE_OCR_ENABLED = process.env.LIVE_OCR === '1';
const HF_TOKEN = process.env.HF_TOKEN;
const LIVE_OCR_TIERS = (process.env.LIVE_OCR_TIERS ?? 'standard')
  .split(',')
  .map((tier) => tier.trim())
  .filter((tier): tier is LiveTier => tier === 'basic' || tier === 'standard');
const STANDARD_MODEL_CONFIG_URL = 'https://huggingface.co/onnx-community/Janus-Pro-1B-ONNX/resolve/main/config.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIVE_JPEG = path.join(__dirname, '../fixtures/live-ocr-sample.jpg');

const IMAGE_GROUND_TRUTH = [
  'This is a lot of 12 point text to test the ocr code and see if it works on all types of file format.',
  'The quick brown dog jumped over the lazy fox. The quick brown dog jumped over the lazy fox.',
  'The quick brown dog jumped over the lazy fox. The quick brown dog jumped over the lazy fox.',
].join(' ');

const NATIVE_PDF_LINES = [
  'Invoice #4821',
  'Total due: $616.07',
  'Payment due date: 2026-03-01',
] as const;

async function createNativeTextPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  NATIVE_PDF_LINES.forEach((line, index) => {
    page.drawText(line, {
      x: 48,
      y: 730 - index * 28,
      size: 15,
      font,
    });
  });

  return Buffer.from(await pdfDoc.save());
}

async function createScannedPdfFromJpeg(jpegPath: string): Promise<Buffer> {
  const jpegBytes = await readFile(jpegPath);
  const pdfDoc = await PDFDocument.create();
  const embedded = await pdfDoc.embedJpg(jpegBytes);
  const page = pdfDoc.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  return Buffer.from(await pdfDoc.save());
}

function queryForTier(tier: LiveTier): string {
  const tokenParam = HF_TOKEN ? `&hfToken=${encodeURIComponent(HF_TOKEN)}` : '';
  if (tier === 'standard') {
    return `/?engine=standard&strictEngine=1&model=janus-pro-1b${tokenParam}`;
  }
  return `/?engine=basic&strictEngine=1${tokenParam}`;
}

function qualityThresholds(tier: LiveTier): { charAccuracy: number; wordAccuracy: number } {
  if (tier === 'basic') {
    return { charAccuracy: 0.9, wordAccuracy: 0.75 };
  }
  return { charAccuracy: 0.7, wordAccuracy: 0.4 };
}

async function uploadPath(page: Page, query: string, filePath: string): Promise<void> {
  await page.goto(query);
  await expect(page.locator('.upload-zone')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await expect(page.locator('.results-view')).toBeVisible({ timeout: 10 * 60 * 1000 });
}

async function uploadBuffer(page: Page, query: string, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  await page.goto(query);
  await expect(page.locator('.upload-zone')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.locator('.results-view')).toBeVisible({ timeout: 10 * 60 * 1000 });
}

async function downloadDocxAndValidate(page: Page): Promise<number> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByText('Download DOCX').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('copycat-output.docx');

  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const fileStats = await stat(filePath!);
  expect(fileStats.size).toBeGreaterThan(1024);

  const bytes = await readFile(filePath!);
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);
  return fileStats.size;
}

async function downloadPdfAndValidate(page: Page, expectedPages: number): Promise<{ size: number; bytes: Buffer }> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByText('Download Searchable PDF').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('copycat-output.pdf');

  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const fileStats = await stat(filePath!);
  expect(fileStats.size).toBeGreaterThan(1024);

  const bytes = await readFile(filePath!);
  const pdfDoc = await PDFDocument.load(bytes);
  expect(pdfDoc.getPageCount()).toBe(expectedPages);

  return { size: fileStats.size, bytes };
}

async function restartToIdle(page: Page): Promise<void> {
  await page.getByText('Process another document').click();
  await expect(page.locator('.upload-zone')).toBeVisible();
}

async function assertStandardModelAccess(): Promise<void> {
  if (!LIVE_OCR_TIERS.includes('standard')) {
    return;
  }

  const headers: Record<string, string> = {};
  if (HF_TOKEN) {
    headers.Authorization = `Bearer ${HF_TOKEN}`;
  }

  const response = await fetch(STANDARD_MODEL_CONFIG_URL, { method: 'HEAD', headers });
  if (response.ok) {
    return;
  }

  throw new Error(
    `Janus model access check failed (HTTP ${response.status}). `
    + 'Set HF_TOKEN with access to onnx-community/Janus-Pro-1B-ONNX for repeatable standard-tier runs.',
  );
}

test.describe('Live OCR production path validation', () => {
  test.skip(!LIVE_OCR_ENABLED, 'Set LIVE_OCR=1 to run live OCR artifact tests.');

  test('covers image OCR, native PDF, forced OCR PDF, downloads, history, and clear paths', async ({ page }) => {
    test.setTimeout(30 * 60 * 1000);
    expect(LIVE_OCR_TIERS.length).toBeGreaterThan(0);
    await assertStandardModelAccess();

    const nativePdfBuffer = await createNativeTextPdf();
    const scannedPdfBuffer = await createScannedPdfFromJpeg(LIVE_JPEG);

    for (const tier of LIVE_OCR_TIERS) {
      const threshold = qualityThresholds(tier);

      // Path 1: image upload -> OCR results -> DOCX/PDF downloads.
      await uploadPath(page, queryForTier(tier), LIVE_JPEG);
      await expect(page.locator('.text-meta .pill').first()).toContainText('OCR text');
      const imageText = (await page.locator('.extracted-text').innerText()).trim();
      const imageQuality = evaluateOCRQuality(IMAGE_GROUND_TRUTH, imageText);
      expect(imageQuality.charAccuracy).toBeGreaterThanOrEqual(threshold.charAccuracy);
      expect(imageQuality.wordAccuracy).toBeGreaterThanOrEqual(threshold.wordAccuracy);
      const imageDocxBytes = await downloadDocxAndValidate(page);
      const imagePdf = await downloadPdfAndValidate(page, 1);
      await restartToIdle(page);

      // Path 2: native text PDF -> pdf-text branch -> PDF download should preserve original bytes.
      await uploadBuffer(page, queryForTier(tier), {
        name: 'native-source.pdf',
        mimeType: 'application/pdf',
        buffer: nativePdfBuffer,
      });
      await expect(page.locator('.text-meta .pill').first()).toContainText('Native PDF text');
      const nativeText = await page.locator('.extracted-text').innerText();
      for (const line of NATIVE_PDF_LINES) {
        expect(nativeText).toContain(line);
      }
      const nativePdf = await downloadPdfAndValidate(page, 1);
      expect(Buffer.compare(nativePdf.bytes, nativePdfBuffer)).toBe(0);
      await restartToIdle(page);

      // Path 3: scanned PDF + forceOcr -> OCR pipeline branch for PDFs.
      await uploadBuffer(page, `${queryForTier(tier)}&forceOcr=1`, {
        name: 'scanned-source.pdf',
        mimeType: 'application/pdf',
        buffer: scannedPdfBuffer,
      });
      await expect(page.locator('.text-meta .pill').first()).toContainText('OCR text');
      const scannedText = (await page.locator('.extracted-text').innerText()).trim();
      const scannedQuality = evaluateOCRQuality(IMAGE_GROUND_TRUTH, scannedText);
      expect(scannedQuality.charAccuracy).toBeGreaterThanOrEqual(Math.max(0.55, threshold.charAccuracy - 0.15));
      expect(scannedQuality.wordAccuracy).toBeGreaterThanOrEqual(Math.max(0.25, threshold.wordAccuracy - 0.2));
      const scannedPdf = await downloadPdfAndValidate(page, 1);
      await restartToIdle(page);

      const historyItems = page.locator('.history-panel .job-item');
      expect(await historyItems.count()).toBeGreaterThanOrEqual(3);
      await historyItems.first().click();
      await expect(page.locator('.results-view')).toBeVisible();
      await restartToIdle(page);

      const clearButton = page.getByRole('button', { name: 'Clear local history/cache' });
      await clearButton.click();
      await expect(page.locator('.history-panel')).toContainText('No recent documents yet.');

      console.log('LIVE_OCR_PATH_RESULT', JSON.stringify({
        tier,
        model: 'janus-pro-1b',
        image: {
          charAccuracy: imageQuality.charAccuracy,
          wordAccuracy: imageQuality.wordAccuracy,
          docxBytes: imageDocxBytes,
          pdfBytes: imagePdf.size,
        },
        nativePdf: {
          pdfBytes: nativePdf.size,
        },
        scannedPdf: {
          charAccuracy: scannedQuality.charAccuracy,
          wordAccuracy: scannedQuality.wordAccuracy,
          pdfBytes: scannedPdf.size,
        },
      }));
    }
  });
});
