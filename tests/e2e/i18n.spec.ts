import { test, expect } from '@playwright/test';

test.describe('Internationalization', () => {
  test('page loads with English text by default', async ({ page }) => {
    await page.goto('/?engine=mock');
    await expect(page.locator('.subtitle')).toContainText('Browser-Only OCR');
    await expect(page.locator('footer')).toContainText('No data leaves your browser');
  });

  test('switching to Romanian updates text', async ({ page }) => {
    await page.goto('/?engine=mock');
    await expect(page.locator('h1')).toContainText('CopyCat');
    // Click the RO button
    await page.locator('.lang-switcher button:has-text("RO")').click();
    // Footer should no longer show English text
    await expect(page.locator('footer')).not.toContainText('No data leaves your browser');
  });

  test('switching back to English restores text', async ({ page }) => {
    await page.goto('/?engine=mock');
    // Switch to RO
    await page.locator('.lang-switcher button:has-text("RO")').click();
    await expect(page.locator('footer')).not.toContainText('No data leaves your browser');
    // Switch back to EN
    await page.locator('.lang-switcher button:has-text("EN")').click();
    await expect(page.locator('footer')).toContainText('No data leaves your browser');
  });
});
