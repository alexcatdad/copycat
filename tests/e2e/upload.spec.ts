import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Upload flow', () => {
  test('uploading an image starts processing and reaches results', async ({ page }) => {
    await page.goto('/?engine=mock');

    // Verify we're in idle state with upload zone visible
    await expect(page.locator('.upload-zone')).toBeVisible();

    // Upload the test image via the hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(
      path.join(__dirname, '../fixtures/test-image.png')
    );

    // With MockEngine, processing should be nearly instant
    // Wait for the results view to appear
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });
  });

  test('upload zone shows expected UI elements', async ({ page }) => {
    await page.goto('/?engine=mock');

    const uploadZone = page.locator('.upload-zone');
    await expect(uploadZone).toBeVisible();

    // Verify the upload button exists
    await expect(page.getByText('Select file')).toBeVisible();
  });
});
