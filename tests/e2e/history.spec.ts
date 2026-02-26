import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, '../fixtures/test-image.png');

test.describe('History persistence', () => {
  test('persists recent jobs across reload and supports clearing history', async ({ page }) => {
    await page.goto('/?engine=mock');

    const clearButton = page.locator('.history-panel .clear');
    if (await clearButton.isVisible() && !(await clearButton.isDisabled())) {
      await clearButton.click();
    }

    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    await page.getByText('Process another document').click();
    await expect(page.locator('.upload-zone')).toBeVisible();
    await expect(page.locator('.history-panel')).toContainText('test-image.png');

    await page.reload();
    await expect(page.locator('.history-panel')).toContainText('test-image.png');

    const clearAfterReload = page.locator('.history-panel .clear');
    await expect(clearAfterReload).toBeEnabled();
    await clearAfterReload.click();
    await expect(page.locator('.history-panel')).not.toContainText('test-image.png');
  });
});
