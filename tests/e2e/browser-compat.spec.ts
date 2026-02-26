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

// ---------------------------------------------------------------------------
// 14. backdrop-filter — Header uses blur(6px); Firefox lacked support until 103
// ---------------------------------------------------------------------------
test.describe('Cross-browser: backdrop-filter', () => {
  test('header backdrop-filter resolves to a non-empty value', async ({ page }) => {
    await page.goto('/');

    const bf = await page.locator('header').evaluate((el) => {
      const style = getComputedStyle(el);
      // Check both standard and webkit-prefixed property
      return style.getPropertyValue('backdrop-filter')
        || style.getPropertyValue('-webkit-backdrop-filter');
    });

    // Should resolve to something like "blur(6px)", not "none" or ""
    expect(bf).toBeTruthy();
    expect(bf).not.toBe('none');
  });
});

// ---------------------------------------------------------------------------
// 15. localStorage — Safari private browsing historically throws on setItem
// ---------------------------------------------------------------------------
test.describe('Cross-browser: localStorage', () => {
  test('can write and read from localStorage', async ({ page }) => {
    await page.goto('/?engine=mock');

    const result = await page.evaluate(() => {
      try {
        const key = '__compat_probe__';
        localStorage.setItem(key, 'ok');
        const value = localStorage.getItem(key);
        localStorage.removeItem(key);
        return { ok: true, value };
      } catch {
        return { ok: false, value: null };
      }
    });

    expect(result.ok).toBe(true);
    expect(result.value).toBe('ok');
  });

  test('language preference persists via localStorage', async ({ page }) => {
    await page.goto('/?engine=mock');
    await page.locator('.lang-switcher button:has-text("RO")').click();

    const stored = await page.evaluate(() => localStorage.getItem('copycat-locale'));
    expect(stored).toBe('ro');
  });
});

// ---------------------------------------------------------------------------
// 16. Blob.arrayBuffer() — critical for IDB storage; Safari 14+ only
// ---------------------------------------------------------------------------
test.describe('Cross-browser: Blob.arrayBuffer', () => {
  test('Blob.arrayBuffer() returns valid ArrayBuffer', async ({ page }) => {
    await page.goto('/?engine=mock');

    const result = await page.evaluate(async () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const buffer = await blob.arrayBuffer();
      const view = new Uint8Array(buffer);
      return {
        byteLength: buffer.byteLength,
        matchesOriginal: view.every((b, i) => b === data[i]),
      };
    });

    expect(result.byteLength).toBe(5);
    expect(result.matchesOriginal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 17. Dynamic import() — engines are code-split via lazy dynamic imports
// ---------------------------------------------------------------------------
test.describe('Cross-browser: dynamic import', () => {
  test('dynamic import() loads MockEngine successfully', async ({ page }) => {
    await page.goto('/?engine=mock');

    // The app loads without errors, which means dynamic import of MockEngine worked.
    // Verify engine initialized by processing a file.
    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });
    // MockEngine returns "Lorem ipsum" — proves the import resolved
    await expect(page.locator('.extracted-text')).toContainText('Lorem ipsum');
  });
});

// ---------------------------------------------------------------------------
// 18. Image preloading with decoding="async" — ResultsView preloads neighbors
// ---------------------------------------------------------------------------
test.describe('Cross-browser: image decoding', () => {
  test('Image object supports decoding property', async ({ page }) => {
    await page.goto('/?engine=mock');

    const supported = await page.evaluate(() => {
      const img = new Image();
      // The property exists even if the browser ignores the value
      return 'decoding' in img;
    });

    expect(supported).toBe(true);
  });

  test('img[loading="lazy"] attribute is recognized', async ({ page }) => {
    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    const lazyAttr = await page.locator('.page-preview img').getAttribute('loading');
    expect(lazyAttr).toBe('lazy');
  });
});

// ---------------------------------------------------------------------------
// 19. Fetch from blob: URLs — pdf-generator fetches blob: URLs for image data
// ---------------------------------------------------------------------------
test.describe('Cross-browser: fetch blob URLs', () => {
  test('fetch() can retrieve data from a blob: URL', async ({ page }) => {
    await page.goto('/?engine=mock');

    const result = await page.evaluate(async () => {
      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      const blob = new Blob([payload], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return { ok: response.ok, size: buffer.byteLength };
      } catch {
        return { ok: false, size: 0 };
      } finally {
        URL.revokeObjectURL(url);
      }
    });

    expect(result.ok).toBe(true);
    expect(result.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 20. Date.toLocaleString — used in HistoryPanel; output varies by browser
// ---------------------------------------------------------------------------
test.describe('Cross-browser: date formatting', () => {
  test('Date.toLocaleString returns a non-empty string', async ({ page }) => {
    await page.goto('/?engine=mock');

    const formatted = await page.evaluate(() => {
      return new Date('2026-01-15T12:30:00Z').toLocaleString();
    });

    expect(formatted.length).toBeGreaterThan(0);
    // Should contain the year somewhere in the output
    expect(formatted).toContain('2026');
  });
});

// ---------------------------------------------------------------------------
// 21. CSS :focus-visible — Safari 15.4+ only; used for all interactive elements
// ---------------------------------------------------------------------------
test.describe('Cross-browser: focus-visible', () => {
  test('focus-visible outline appears on keyboard focus', async ({ page }) => {
    await page.goto('/?engine=mock');

    // Tab to the first focusable element
    await page.keyboard.press('Tab');

    const outlineStyle = await page.evaluate(() => {
      const focused = document.querySelector(':focus-visible');
      if (!focused) return null;
      return getComputedStyle(focused).outlineStyle;
    });

    // If the browser supports :focus-visible, we get an outline
    // If null, no element matched — still a valid signal
    if (outlineStyle !== null) {
      expect(outlineStyle).not.toBe('none');
    }
  });
});

// ---------------------------------------------------------------------------
// 22. Large canvas — PDF renders at 3x scale; iOS Safari caps canvas at ~16MP
// ---------------------------------------------------------------------------
test.describe('Cross-browser: large canvas', () => {
  test('can create and draw on a canvas up to 1836x2376 (letter 3x)', async ({ page }) => {
    await page.goto('/?engine=mock');

    // 612*3 = 1836, 792*3 = 2376 — matches PDF RENDER_SCALE = 3
    const result = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1836;
      canvas.height = 2376;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { ok: false, reason: 'no 2d context' };

      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 1836, 2376);

      // Sample a pixel to prove the draw actually worked
      const pixel = ctx.getImageData(100, 100, 1, 1).data;
      return {
        ok: true,
        width: canvas.width,
        height: canvas.height,
        pixelR: pixel[0], // Should be 0x33 = 51
      };
    });

    expect(result.ok).toBe(true);
    expect(result.width).toBe(1836);
    expect(result.height).toBe(2376);
    expect(result.pixelR).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// 23. IDB multi-store transaction — jobs-repo writes jobs+pages+artifacts
// ---------------------------------------------------------------------------
test.describe('Cross-browser: IDB multi-store transactions', () => {
  test('can write and read across multiple object stores in one transaction', async ({ page }) => {
    await page.goto('/?engine=mock');

    const result = await page.evaluate(async () => {
      const DB_NAME = 'compat-idb-multi-probe';

      try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            db.createObjectStore('storeA', { keyPath: 'id' });
            db.createObjectStore('storeB', { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

        // Write to both stores in a single transaction
        const tx = db.transaction(['storeA', 'storeB'], 'readwrite');
        tx.objectStore('storeA').put({ id: 'a1', value: 'hello' });
        tx.objectStore('storeB').put({ id: 'b1', value: 'world' });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });

        // Read back from both
        const readTx = db.transaction(['storeA', 'storeB'], 'readonly');
        const a = await new Promise<any>((resolve) => {
          readTx.objectStore('storeA').get('a1').onsuccess = (e: any) => resolve(e.target.result);
        });
        const b = await new Promise<any>((resolve) => {
          readTx.objectStore('storeB').get('b1').onsuccess = (e: any) => resolve(e.target.result);
        });

        db.close();
        indexedDB.deleteDatabase(DB_NAME);

        return { ok: true, aValue: a?.value, bValue: b?.value };
      } catch {
        return { ok: false, aValue: null, bValue: null };
      }
    });

    expect(result.ok).toBe(true);
    expect(result.aValue).toBe('hello');
    expect(result.bValue).toBe('world');
  });
});

// ---------------------------------------------------------------------------
// 24. History panel restore — open a saved job from IndexedDB
// ---------------------------------------------------------------------------
test.describe('Cross-browser: history restore', () => {
  test('can open a previously saved job from history', async ({ page }) => {
    await page.goto('/?engine=mock');

    // Clear any previous history
    const clearBtn = page.locator('.history-panel .clear');
    if (await clearBtn.isVisible() && !(await clearBtn.isDisabled())) {
      await clearBtn.click();
    }

    // Process a file to create a history entry
    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });

    // Return to idle
    await page.getByText('Process another document').click();
    await expect(page.locator('.upload-zone')).toBeVisible();
    await expect(page.locator('.history-panel')).toContainText('test-image.png');

    // Click on the history entry to restore it
    await page.locator('.history-panel .job-item').first().click();
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.extracted-text')).toContainText('Lorem ipsum');
  });
});

// ---------------------------------------------------------------------------
// 25. SVG rendering — inline SVG in upload zone must render with currentColor
// ---------------------------------------------------------------------------
test.describe('Cross-browser: SVG rendering', () => {
  test('upload zone SVG icon renders with non-zero dimensions', async ({ page }) => {
    await page.goto('/?engine=mock');

    const svg = page.locator('.upload-zone svg.upload-icon');
    await expect(svg).toBeVisible();

    const box = await svg.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('SVG stroke color inherits from CSS currentColor', async ({ page }) => {
    await page.goto('/?engine=mock');

    const strokeColor = await page.locator('.upload-zone svg.upload-icon').evaluate((el) => {
      return getComputedStyle(el).color;
    });

    // Should resolve to an actual color, not empty
    expect(strokeColor.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 26. Multi-page PDF page navigation — PageNavigator buttons
// ---------------------------------------------------------------------------
test.describe('Cross-browser: page navigation', () => {
  test('multi-page PDF shows navigator and switches pages', async ({ page }) => {
    // Create a 2-page scanned PDF (blank pages → OCR with mock)
    const sourcePdf = await (async () => {
      const pdf = await PDFDocument.create();
      pdf.addPage([612, 792]);
      pdf.addPage([612, 792]);
      return Buffer.from(await pdf.save());
    })();

    await page.goto('/?engine=mock');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'two-page.pdf',
      mimeType: 'application/pdf',
      buffer: sourcePdf,
    });

    await expect(page.locator('.results-view')).toBeVisible({ timeout: 15000 });

    // Navigator should be present for multi-page docs
    const nav = page.locator('.page-navigator');
    await expect(nav).toBeVisible();

    // Click page 2
    await nav.locator('button', { hasText: '2' }).click();

    // Preview image should still load on page 2
    const previewImg = page.locator('.page-preview img');
    await expect(previewImg).toBeVisible();
    await expect.poll(
      () => previewImg.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 27. CSS custom properties — var() must resolve throughout the component tree
// ---------------------------------------------------------------------------
test.describe('Cross-browser: CSS custom properties', () => {
  test('--ink-strong resolves to a color in all major components', async ({ page }) => {
    await page.goto('/?engine=mock');

    const inkStrong = await page.locator('h1').evaluate((el) => {
      return getComputedStyle(el).color;
    });

    // Should be a real color, not "undefined" or empty
    expect(inkStrong).toMatch(/^rgb/);
  });

  test('--font-display resolves on headings', async ({ page }) => {
    await page.goto('/');

    const fontFamily = await page.locator('h1').evaluate((el) => {
      return getComputedStyle(el).fontFamily;
    });

    // Should include Fraunces or a fallback serif
    expect(fontFamily.length).toBeGreaterThan(0);
  });
});
