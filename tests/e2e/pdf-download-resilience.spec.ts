import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, '../fixtures/test-image.png');

test.describe('PDF download resilience', () => {
  test('searchable PDF download succeeds with malformed OCR regions', async ({ page }) => {
    const runtimeErrors: string[] = [];

    page.on('pageerror', (error) => {
      runtimeErrors.push(error.message);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        runtimeErrors.push(msg.text());
      }
    });

    await page.goto('/?engine=mock&mockProfile=malformed');

    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Download Searchable PDF').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('copycat-output.pdf');

    const sizeTypeErrors = runtimeErrors.filter((message) =>
      message.includes('options.size')
      || message.includes('NaN'),
    );
    expect(sizeTypeErrors).toHaveLength(0);
  });
});
