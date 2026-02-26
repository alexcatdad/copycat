import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

async function createTwoPageScannedPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  pdf.addPage([612, 792]);
  return Buffer.from(await pdf.save());
}

test.describe('Preview rendering', () => {
  test('results preview loads and stays non-blank while navigating pages', async ({ page }) => {
    const sourcePdf = await createTwoPageScannedPdf();

    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'two-pages.pdf',
      mimeType: 'application/pdf',
      buffer: sourcePdf,
    });

    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    const previewImage = page.locator('.page-preview img');
    await expect(previewImage).toBeVisible();
    await expect.poll(async () => previewImage.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    await page.locator('.page-navigator button', { hasText: '2' }).click();
    await expect.poll(async () => previewImage.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    await expect(page.locator('.page-preview')).not.toContainText('Preview failed to render');
  });
});
