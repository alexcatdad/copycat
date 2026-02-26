import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, '../fixtures/test-image.png');

test.describe('Results view', () => {
  async function pdfContainsTextLayer(pdfBytes: Uint8Array, expectedText: string): Promise<boolean> {
    const expectedHex = Buffer.from(expectedText, 'latin1').toString('hex').toUpperCase();
    const pdf = await PDFDocument.load(pdfBytes);

    for (const page of pdf.getPages()) {
      const contents = page.node.Contents() as any;
      if (!contents) continue;

      const streamRefs: any[] = typeof contents.size === 'function'
        ? Array.from({ length: contents.size() }, (_, index) => contents.get(index))
        : [contents];

      for (const ref of streamRefs) {
        const stream = pdf.context.lookup(ref) as any;
        if (!stream?.getContents) continue;

        const encodedBytes = stream.getContents() as Uint8Array;
        let decodedBytes = encodedBytes;
        try {
          decodedBytes = inflateSync(encodedBytes);
        } catch {
          // Not all streams are flate-compressed; keep original bytes.
        }

        const content = Buffer.from(decodedBytes).toString('latin1').toUpperCase();
        if (content.includes(expectedHex)) {
          return true;
        }
      }
    }

    return false;
  }

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
    await expect(pdfContainsTextLayer(pdfBytes, 'Lorem ipsum')).resolves.toBe(true);
  });

  test('restart button returns to upload view', async ({ page }) => {
    await uploadAndWaitForResults(page);
    await page.getByText('Process another document').click();
    await expect(page.locator('.upload-zone')).toBeVisible();
  });
});
