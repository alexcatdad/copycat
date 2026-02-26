import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await page.goto('/');

    // Log any errors for diagnosis
    if (errors.length > 0) {
      console.log('Browser errors found:', errors);
    }

    expect(errors).toHaveLength(0);
  });

  test('header is visible with app title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('CopyCat');
  });

  test('upload zone is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.upload-zone')).toBeVisible();
  });

  test('footer is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).toBeVisible();
  });
});
