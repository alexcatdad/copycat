import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, '../fixtures/test-image.png');

test.describe('Results view', () => {
  async function uploadAndWaitForResults(page: any) {
    await page.goto('/?engine=mock');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });
  }

  test('shows extracted text after processing', async ({ page }) => {
    await uploadAndWaitForResults(page);
    // MockEngine returns "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
    await expect(page.locator('.results-view')).toContainText('Lorem ipsum');
  });

  test('shows processing complete message', async ({ page }) => {
    await uploadAndWaitForResults(page);
    await expect(page.locator('.results-view')).toContainText('Processing complete');
  });

  test('download DOCX button triggers download', async ({ page }) => {
    await uploadAndWaitForResults(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Download DOCX').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('copycat-output.docx');
  });

  test('download PDF button triggers download', async ({ page }) => {
    await uploadAndWaitForResults(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Download Searchable PDF').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('copycat-output.pdf');

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const pdfBuffer = await readFile(downloadPath!);
    const pdfBytes = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdfBytes.byteLength).toBeGreaterThan(0);
  });

  test('restart button returns to upload view', async ({ page }) => {
    await uploadAndWaitForResults(page);
    await page.getByText('Process another document').click();
    await expect(page.locator('.upload-zone')).toBeVisible();
  });
});
