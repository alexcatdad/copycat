import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function createDigitalPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawText('Digital Invoice #4821', { x: 48, y: 730, size: 18, font });
  page.drawText('Total due $199.00', { x: 48, y: 700, size: 14, font });

  return Buffer.from(await pdf.save());
}

test.describe('Hybrid PDF parse', () => {
  test('uses native PDF text extraction for text-based PDFs', async ({ page }) => {
    const sourcePdf = await createDigitalPdf();

    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'digital.pdf',
      mimeType: 'application/pdf',
      buffer: sourcePdf,
    });

    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.extracted-text')).toContainText('Digital Invoice #4821');
    await expect(page.locator('.extracted-text')).toContainText('Total due $199.00');
    await expect(page.locator('.extracted-text')).not.toContainText('Lorem ipsum');
  });
});
