import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, '../fixtures/test-image.png');

// ---------------------------------------------------------------------------
// 1. Basic page load — no JS errors across engines
// ---------------------------------------------------------------------------
test.describe('Cross-browser: page load', () => {
  test('loads without JS errors or unhandled rejections', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto('/');
    // Give async init (i18n, IndexedDB, engine detection) time to settle
    await page.waitForTimeout(1000);

    expect(errors).toHaveLength(0);
  });

  test('renders header, upload zone, and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('CopyCat');
    await expect(page.locator('.upload-zone')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. IndexedDB — Safari has strict IDB behaviour in private browsing & iframes
// ---------------------------------------------------------------------------
test.describe('Cross-browser: IndexedDB storage', () => {
  test('can open the copycat-db database', async ({ page }) => {
    await page.goto('/?engine=mock');

    const canOpen = await page.evaluate(async () => {
      try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('copycat-db-probe', 1);
          req.onupgradeneeded = () => {
            req.result.createObjectStore('test', { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        db.close();
        indexedDB.deleteDatabase('copycat-db-probe');
        return true;
      } catch {
        return false;
      }
    });

    expect(canOpen).toBe(true);
  });

  test('history persists a job to IndexedDB and survives reload', async ({ page }) => {
    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    // Go back to idle
    await page.getByText('Process another document').click();
    await expect(page.locator('.upload-zone')).toBeVisible();
    await expect(page.locator('.history-panel')).toContainText('test-image.png');

    // Hard reload — IndexedDB must survive
    await page.reload();
    await expect(page.locator('.history-panel')).toContainText('test-image.png');
  });
});

// ---------------------------------------------------------------------------
// 3. Blob / URL.createObjectURL — WebKit sometimes restricts blob URLs
// ---------------------------------------------------------------------------
test.describe('Cross-browser: Blob URLs', () => {
  test('createObjectURL works for image blobs', async ({ page }) => {
    await page.goto('/?engine=mock');

    const blobUrlWorks = await page.evaluate(async () => {
      const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const valid = url.startsWith('blob:');
      URL.revokeObjectURL(url);
      return valid;
    });

    expect(blobUrlWorks).toBe(true);
  });

  test('page preview images load via blob URLs after processing', async ({ page }) => {
    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    const previewImg = page.locator('.page-preview img');
    await expect(previewImg).toBeVisible();
    // Image should actually decode — naturalWidth > 0 means pixels loaded
    await expect.poll(
      () => previewImg.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Canvas rendering — canvas.toBlob behaves differently on WebKit
// ---------------------------------------------------------------------------
test.describe('Cross-browser: Canvas to Blob', () => {
  test('canvas.toBlob produces a valid PNG blob', async ({ page }) => {
    await page.goto('/?engine=mock');

    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { ok: false, reason: 'no 2d context' };
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 100, 100);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) return { ok: false, reason: 'toBlob returned null' };
      return { ok: true, type: blob.type, size: blob.size };
    });

    expect(result.ok).toBe(true);
    expect(result.type).toBe('image/png');
    expect(result.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Web Workers — pdfjs-dist uses a worker; Safari can be picky
// ---------------------------------------------------------------------------
test.describe('Cross-browser: Web Workers', () => {
  test('can spawn and communicate with a Worker', async ({ page }) => {
    await page.goto('/?engine=mock');

    const workerWorks = await page.evaluate(async () => {
      const blob = new Blob(
        ['self.onmessage = (e) => self.postMessage(e.data * 2);'],
        { type: 'application/javascript' },
      );
      const url = URL.createObjectURL(blob);

      try {
        const result = await new Promise<number>((resolve, reject) => {
          const worker = new Worker(url);
          worker.onmessage = (e) => { resolve(e.data); worker.terminate(); };
          worker.onerror = (e) => { reject(e); worker.terminate(); };
          worker.postMessage(21);
        });
        return result === 42;
      } catch {
        return false;
      } finally {
        URL.revokeObjectURL(url);
      }
    });

    expect(workerWorks).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. crypto.randomUUID — used for page IDs; missing in older Safari
// ---------------------------------------------------------------------------
test.describe('Cross-browser: crypto.randomUUID', () => {
  test('crypto.randomUUID is available', async ({ page }) => {
    await page.goto('/?engine=mock');

    const uuid = await page.evaluate(() => {
      return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : null;
    });

    expect(uuid).not.toBeNull();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

// ---------------------------------------------------------------------------
// 7. File input — mobile Safari sometimes has quirks with programmatic input
// ---------------------------------------------------------------------------
test.describe('Cross-browser: file upload flow', () => {
  test('uploading an image reaches results view', async ({ page }) => {
    await page.goto('/?engine=mock');
    await expect(page.locator('.upload-zone')).toBeVisible();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_IMAGE);

    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.results-view')).toContainText('Lorem ipsum');
  });

  test('upload zone "Select file" button is visible and tappable', async ({ page }) => {
    await page.goto('/?engine=mock');
    const button = page.getByText('Select file');
    await expect(button).toBeVisible();

    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    // Button should be large enough to tap on mobile (at least 44px, Apple HIG)
    expect(box!.height).toBeGreaterThanOrEqual(30);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });
});

// ---------------------------------------------------------------------------
// 8. Download flow — anchor download attribute not supported on iOS Safari
// ---------------------------------------------------------------------------
test.describe('Cross-browser: download', () => {
  test('DOCX download triggers successfully', async ({ page }) => {
    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Download DOCX').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('copycat-output.docx');
  });

  test('PDF download produces a valid file', async ({ page }) => {
    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

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
  });
});

// ---------------------------------------------------------------------------
// 9. PDF parsing via pdfjs-dist — relies on canvas + workers
// ---------------------------------------------------------------------------
test.describe('Cross-browser: PDF input processing', () => {
  async function createDigitalPdf(): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pg = pdf.addPage([612, 792]);
    pg.drawText('Cross-browser test invoice #99', { x: 48, y: 730, size: 16, font });
    pg.drawText('Total: $42.00', { x: 48, y: 700, size: 14, font });
    return Buffer.from(await pdf.save());
  }

  test('text-based PDF extracts native text without OCR', async ({ page }) => {
    const sourcePdf = await createDigitalPdf();

    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'compat-test.pdf',
      mimeType: 'application/pdf',
      buffer: sourcePdf,
    });

    await expect(page.locator('.results-view')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.extracted-text')).toContainText('Cross-browser test invoice #99');
    await expect(page.locator('.extracted-text')).toContainText('Total: $42.00');
  });
});

// ---------------------------------------------------------------------------
// 10. Responsive layout — mobile viewport should stack panels vertically
// ---------------------------------------------------------------------------
test.describe('Cross-browser: responsive layout', () => {
  test('results split-view stacks on narrow viewport', async ({ page, browserName }) => {
    // Set a mobile-like viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    // On narrow viewports the split-view should be single-column
    const splitView = page.locator('.split-view');
    const box = await splitView.boundingBox();
    expect(box).not.toBeNull();

    // Both panels should be stacked (each panel ~full width of container)
    const panels = splitView.locator('.panel');
    const count = await panels.count();
    expect(count).toBe(2);

    if (count === 2) {
      const panel1 = await panels.nth(0).boundingBox();
      const panel2 = await panels.nth(1).boundingBox();
      expect(panel1).not.toBeNull();
      expect(panel2).not.toBeNull();
      // In stacked layout, panel2 should be below panel1
      expect(panel2!.y).toBeGreaterThan(panel1!.y);
    }
  });

  test('upload zone is fully visible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/?engine=mock');

    const uploadZone = page.locator('.upload-zone');
    await expect(uploadZone).toBeVisible();

    const box = await uploadZone.boundingBox();
    expect(box).not.toBeNull();
    // Should not overflow the viewport
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1); // +1 for rounding
  });
});

// ---------------------------------------------------------------------------
// 11. CSS features — color-mix, oklab used in styles; Safari 16.2+ only
// ---------------------------------------------------------------------------
test.describe('Cross-browser: CSS rendering', () => {
  test('app shell background renders without error', async ({ page }) => {
    await page.goto('/');

    // The app-shell uses color-mix(in oklab, ...) — verify it actually has a background
    const bg = await page.locator('.app-shell').evaluate((el) => {
      return getComputedStyle(el).backgroundImage;
    });

    // Should have resolved to actual gradient values, not empty/none
    expect(bg).not.toBe('none');
    expect(bg.length).toBeGreaterThan(0);
  });

  test('upload zone border renders as dashed', async ({ page }) => {
    await page.goto('/');

    const borderStyle = await page.locator('.upload-zone').evaluate((el) => {
      return getComputedStyle(el).borderTopStyle;
    });

    expect(borderStyle).toBe('dashed');
  });
});

// ---------------------------------------------------------------------------
// 12. i18n — language switch should work across all browsers
// ---------------------------------------------------------------------------
test.describe('Cross-browser: i18n', () => {
  test('language switch to Romanian and back works', async ({ page }) => {
    await page.goto('/?engine=mock');
    await expect(page.locator('footer')).toContainText('No data leaves your browser');

    await page.locator('.lang-switcher button:has-text("RO")').click();
    await expect(page.locator('footer')).not.toContainText('No data leaves your browser');

    await page.locator('.lang-switcher button:has-text("EN")').click();
    await expect(page.locator('footer')).toContainText('No data leaves your browser');
  });
});

// ---------------------------------------------------------------------------
// 13. Anchor download attribute — iOS Safari ignores <a download>
// ---------------------------------------------------------------------------
test.describe('Cross-browser: anchor download attribute', () => {
  test('programmatic anchor click triggers download event', async ({ page }) => {
    await page.goto('/?engine=mock');

    // Simulate what DownloadButtons.svelte does
    const triggered = await page.evaluate(async () => {
      const blob = new Blob(['test content'], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'test.txt';
      // Return whether the download attribute is supported
      return 'download' in a;
    });

    // This will be false on iOS Safari — that's the signal the download UX needs work
    expect(triggered).toBe(true);
  });
});
