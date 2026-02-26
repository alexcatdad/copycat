import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function createTwoPageDigitalPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const page1 = pdf.addPage([612, 792]);
  page1.drawText('Invoice #4821 for ACME Supplies', { x: 48, y: 730, size: 16, font });
  page1.drawText('Total due: $199.00 before 2026-03-01', { x: 48, y: 700, size: 14, font });

  const page2 = pdf.addPage([612, 792]);
  page2.drawText('Page 2 settlement summary', { x: 48, y: 730, size: 16, font });
  page2.drawText('Approved by Northwind Logistics', { x: 48, y: 700, size: 14, font });

  return Buffer.from(await pdf.save());
}

test.describe('PDF fidelity', () => {
  test('returns original PDF bytes for fully native text PDFs', async ({ page }) => {
    const sourcePdf = await createTwoPageDigitalPdf();

    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'digital-two-page.pdf',
      mimeType: 'application/pdf',
      buffer: sourcePdf,
    });

    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Download Searchable PDF').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const downloadedBytes = await readFile(downloadPath!);
    const downloadedPdf = await PDFDocument.load(downloadedBytes);
    expect(downloadedPdf.getPageCount()).toBe(2);
    expect(downloadedBytes.byteLength).toBe(sourcePdf.byteLength);
  });
});
