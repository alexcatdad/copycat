# E2E Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Playwright e2e tests to diagnose and fix the blank page bug, then provide full coverage of the app's critical user flows.

**Architecture:** Playwright tests run against `vite preview` (production build). The app gets a `?engine=mock` query parameter to use MockEngine for deterministic, fast e2e tests without model downloads. Tests cover smoke, upload, OCR results, downloads, and i18n.

**Tech Stack:** Playwright 1.x, @playwright/test, Chromium, bun

---

### Task 1: Install Playwright and create config

**Files:**
- Modify: `package.json` (devDependency added by bun)
- Create: `playwright.config.ts`

**Step 1: Install Playwright**

```bash
bun add -D @playwright/test
bunx playwright install chromium
```

**Step 2: Add e2e script to package.json**

Add to the `"scripts"` section in `package.json`:

```json
"test:e2e": "bunx playwright test"
```

**Step 3: Create playwright.config.ts**

Create `playwright.config.ts` in the project root with this exact content:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: 'http://127.0.0.1:4173/copycat/',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'bun run build && bun run preview',
    url: 'http://127.0.0.1:4173/copycat/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

Important details:
- Uses `127.0.0.1` not `localhost` (IPv6 resolution issue with Node 18+)
- `baseURL` includes `/copycat/` because of the vite `base` config
- `webServer` builds first, then serves production build
- Single browser (chromium) for speed

**Step 4: Add Playwright artifacts to .gitignore**

Append to `.gitignore`:

```
test-results
playwright-report
```

**Step 5: Commit**

```bash
git add package.json bun.lock playwright.config.ts .gitignore
git commit -m "chore: add Playwright with chromium for e2e testing"
```

---

### Task 2: Write smoke test to diagnose blank page

**Files:**
- Create: `tests/e2e/smoke.spec.ts`

**Step 1: Create the tests/e2e directory**

```bash
mkdir -p tests/e2e
```

**Step 2: Write the smoke test**

Create `tests/e2e/smoke.spec.ts` with this exact content:

```typescript
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
```

**Step 3: Run the smoke test**

```bash
bun run test:e2e
```

Expected: The "page loads without JS errors" test will FAIL and print the exact error(s) causing the blank page. The other tests will also likely fail because the page is blank.

Read the error output carefully — it will tell us exactly what to fix in Task 3.

**Step 4: Commit (even with failing test — this captures the diagnosis)**

```bash
git add tests/e2e/smoke.spec.ts
git commit -m "test: add e2e smoke tests to diagnose blank page"
```

---

### Task 3: Fix the blank page bug

**Files:**
- Modify: `src/lib/engines/index.ts` (convert to dynamic imports)
- Possibly modify: `src/App.svelte` (if the error is elsewhere)

**Context:** The most likely cause is that `src/lib/engines/index.ts` eagerly imports `florence2-engine.ts` (which imports `@huggingface/transformers`) and `tesseract-engine.ts` (which imports `tesseract.js`). If either library throws during module evaluation in the browser, the entire app fails to mount.

**Step 1: Convert engine factory to lazy imports**

Replace `src/lib/engines/index.ts` with:

```typescript
import type { EngineTier, OCREngine } from '../types';

export { MockEngine } from './mock-engine';

export async function createEngine(tier: EngineTier): Promise<OCREngine> {
  switch (tier) {
    case 'premium': {
      const { Florence2Engine } = await import('./florence2-engine');
      return new Florence2Engine('webgpu');
    }
    case 'standard': {
      const { Florence2Engine } = await import('./florence2-engine');
      return new Florence2Engine('wasm');
    }
    case 'basic': {
      const { TesseractEngine } = await import('./tesseract-engine');
      return new TesseractEngine();
    }
  }
}
```

Note: `createEngine` is now `async` (returns `Promise<OCREngine>`). The named exports of `Florence2Engine` and `TesseractEngine` are removed since they were only used by tests (which import directly from the engine files).

**Step 2: Update App.svelte to handle async createEngine**

In `src/App.svelte`, the `handleFiles` function calls `createEngine(engineTier)`. Since `createEngine` is now async, update line 38:

Change:
```typescript
engine = createEngine(engineTier);
```

To:
```typescript
engine = await createEngine(engineTier);
```

**Step 3: Update the engine factory test**

In `src/lib/engines/engine-factory.test.ts`, `createEngine` now returns a Promise. Update all assertions to await the result:

Read the test file first, then change every `createEngine(tier)` to `await createEngine(tier)` and make the test callbacks `async`.

**Step 4: Verify unit tests pass**

```bash
bun run test
```

Expected: All 51 tests pass.

**Step 5: Run the smoke e2e test again**

```bash
bun run test:e2e tests/e2e/smoke.spec.ts
```

Expected: All 4 smoke tests PASS — page loads, header visible, upload zone visible, footer visible.

If the smoke test still fails with a different error, read the error and fix accordingly. Possible secondary issues:
- `pdfjs-dist` worker URL resolution → wrap the workerSrc setup in a try/catch
- `svelte-i18n` async locale loading → the `$_` store returns keys until loaded, which is fine for rendering

**Step 6: Commit**

```bash
git add src/lib/engines/index.ts src/App.svelte src/lib/engines/engine-factory.test.ts
git commit -m "fix: use dynamic imports for OCR engines to prevent blank page"
```

---

### Task 4: Add mock engine support for e2e tests

**Files:**
- Modify: `src/App.svelte:29-31` (check URL params for mock mode)
- Modify: `src/lib/engines/index.ts` (add mock case)

**Step 1: Add mock engine case to factory**

In `src/lib/engines/index.ts`, add a case for `'mock'` tier. Add `'mock'` to the switch:

```typescript
import type { EngineTier, OCREngine } from '../types';

export { MockEngine } from './mock-engine';

export async function createEngine(tier: EngineTier | 'mock'): Promise<OCREngine> {
  switch (tier) {
    case 'mock': {
      const { MockEngine } = await import('./mock-engine');
      return new MockEngine();
    }
    case 'premium': {
      const { Florence2Engine } = await import('./florence2-engine');
      return new Florence2Engine('webgpu');
    }
    case 'standard': {
      const { Florence2Engine } = await import('./florence2-engine');
      return new Florence2Engine('wasm');
    }
    case 'basic': {
      const { TesseractEngine } = await import('./tesseract-engine');
      return new TesseractEngine();
    }
  }
}
```

**Step 2: Check for mock mode in App.svelte**

In `src/App.svelte`, modify the `onMount` to check for `?engine=mock`:

```typescript
onMount(async () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('engine') === 'mock') {
    engineTier = 'mock' as EngineTier;
  } else {
    engineTier = await detectEngineTier();
  }
});
```

And update the `handleFiles` function to pass the tier (which may be `'mock'`):

```typescript
engine = await createEngine(engineTier as any);
```

**Step 3: Verify unit tests still pass**

```bash
bun run test
```

Expected: All tests pass (mock mode doesn't affect existing behavior).

**Step 4: Verify mock mode works in e2e**

```bash
bun run test:e2e tests/e2e/smoke.spec.ts
```

Expected: Smoke tests still pass.

**Step 5: Commit**

```bash
git add src/lib/engines/index.ts src/App.svelte
git commit -m "feat: add mock engine mode via ?engine=mock query parameter"
```

---

### Task 5: Create test fixture and write upload flow test

**Files:**
- Create: `tests/fixtures/test-image.png` (programmatically generated)
- Create: `tests/e2e/upload.spec.ts`

**Step 1: Create the fixtures directory and test image**

Create a simple test image programmatically. We need a small PNG with some visible text-like content. The actual OCR output doesn't matter since we're using MockEngine.

```bash
mkdir -p tests/fixtures
```

Generate a minimal 200x100 white PNG with bun:

```bash
bun -e "
const { createCanvas } = require('canvas');
// If canvas not available, create a minimal 1x1 PNG manually
const fs = require('fs');
// Minimal valid PNG: 1x1 white pixel
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync('tests/fixtures/test-image.png', png);
console.log('Created test-image.png');
"
```

If the canvas approach doesn't work, just create the minimal PNG from the base64 string above.

**Step 2: Write the upload flow test**

Create `tests/e2e/upload.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Upload flow', () => {
  test('uploading an image starts processing', async ({ page }) => {
    await page.goto('/?engine=mock');

    // Verify we're in idle state with upload zone visible
    await expect(page.locator('.upload-zone')).toBeVisible();

    // Upload the test image via the hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(
      path.join(__dirname, '../fixtures/test-image.png')
    );

    // The app should transition through loading-model to processing to complete
    // With MockEngine, this should be nearly instant
    // Wait for the results view to appear
    await expect(page.locator('.results-view')).toBeVisible({ timeout: 10000 });
  });

  test('upload zone accepts drag-and-drop styling', async ({ page }) => {
    await page.goto('/?engine=mock');

    const uploadZone = page.locator('.upload-zone');
    await expect(uploadZone).toBeVisible();

    // Verify the upload button exists
    await expect(page.getByText('Select file')).toBeVisible();
  });
});
```

**Step 3: Run the upload test**

```bash
bun run test:e2e tests/e2e/upload.spec.ts
```

Expected: Both tests pass. The first test uploads an image, MockEngine processes it instantly, and ResultsView appears.

If the first test fails, check:
- Is the file input accessible? The `<input>` is `hidden` inside a `<label>`. Playwright's `setInputFiles` works on hidden inputs.
- Does the mock mode actually use MockEngine? Check the browser console for errors.

**Step 4: Commit**

```bash
git add tests/fixtures/test-image.png tests/e2e/upload.spec.ts
git commit -m "test: add e2e upload flow test with mock engine"
```

---

### Task 6: Write OCR results and download tests

**Files:**
- Create: `tests/e2e/results.spec.ts`

**Step 1: Write the results + download test**

Create `tests/e2e/results.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Results view', () => {
  // Helper: upload a file and wait for results
  async function uploadAndWaitForResults(page: any) {
    await page.goto('/?engine=mock');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(
      path.join(__dirname, '../fixtures/test-image.png')
    );
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

    // Click the DOCX download button
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Download DOCX').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('copycat-output.docx');
  });

  test('download PDF button triggers download', async ({ page }) => {
    await uploadAndWaitForResults(page);

    // Click the PDF download button
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Download Searchable PDF').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('copycat-output.pdf');
  });

  test('restart button returns to upload view', async ({ page }) => {
    await uploadAndWaitForResults(page);

    await page.getByText('Process another document').click();

    // Should be back to upload zone
    await expect(page.locator('.upload-zone')).toBeVisible();
  });
});
```

Note on downloads: `DownloadButtons.svelte` uses `URL.createObjectURL` + synthetic `<a>` click with `download` attribute. Playwright's `waitForEvent('download')` should catch this since the `<a>` element has a `download` attribute set. If it doesn't fire, we'll need to use the blob URL workaround.

**Step 2: Run the results tests**

```bash
bun run test:e2e tests/e2e/results.spec.ts
```

Expected: All 5 tests pass.

If the download tests fail because `waitForEvent('download')` doesn't fire for blob URLs, use this alternative approach for the download assertions:

```typescript
test('download DOCX button works', async ({ page }) => {
  await uploadAndWaitForResults(page);

  // Monitor for blob URL creation
  const blobCreated = page.evaluate(() => {
    return new Promise<boolean>((resolve) => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob: Blob) => {
        resolve(true);
        return orig(blob);
      };
    });
  });

  await page.getByText('Download DOCX').click();
  expect(await blobCreated).toBe(true);
});
```

**Step 3: Commit**

```bash
git add tests/e2e/results.spec.ts
git commit -m "test: add e2e results view and download tests"
```

---

### Task 7: Write i18n test

**Files:**
- Create: `tests/e2e/i18n.spec.ts`

**Step 1: Write the i18n language switching test**

Create `tests/e2e/i18n.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Internationalization', () => {
  test('page loads with English text by default', async ({ page }) => {
    await page.goto('/?engine=mock');

    await expect(page.locator('.subtitle')).toContainText('Browser-Only OCR');
    await expect(page.locator('footer')).toContainText('No data leaves your browser');
  });

  test('switching to Romanian updates text', async ({ page }) => {
    await page.goto('/?engine=mock');

    // Wait for initial load
    await expect(page.locator('h1')).toContainText('CopyCat');

    // Click the RO button in the language switcher
    await page.locator('.lang-switcher button:has-text("RO")').click();

    // Wait for Romanian text to appear
    // Check footer since it's always visible and has distinctive Romanian text
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
```

**Step 2: Run the i18n tests**

```bash
bun run test:e2e tests/e2e/i18n.spec.ts
```

Expected: All 3 tests pass.

**Step 3: Commit**

```bash
git add tests/e2e/i18n.spec.ts
git commit -m "test: add e2e i18n language switching tests"
```

---

### Task 8: Run full e2e suite and add to CI

**Files:**
- Modify: `.github/workflows/ci.yml` (add Playwright step)

**Step 1: Run the full e2e suite locally**

```bash
bun run test:e2e
```

Expected: All tests pass across smoke.spec.ts, upload.spec.ts, results.spec.ts, and i18n.spec.ts.

**Step 2: Update CI workflow to include e2e tests**

In `.github/workflows/ci.yml`, add Playwright to the `ci` job. Add these steps after the "Build" step:

```yaml
      - name: Install Playwright browsers
        run: bunx playwright install chromium --with-deps

      - name: Run e2e tests
        run: bun run test:e2e
```

The full `ci` job steps should be:

```yaml
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run tests
        run: bun run test

      - name: Type check
        run: bun run check

      - name: Build
        run: bun run build

      - name: Install Playwright browsers
        run: bunx playwright install chromium --with-deps

      - name: Run e2e tests
        run: bun run test:e2e
```

Note: `--with-deps` installs OS-level dependencies (like libgbm, libasound) needed by Chromium on Ubuntu.

**Step 3: Verify unit tests still pass**

```bash
bun run test
```

Expected: All 51 unit tests pass (Playwright tests are in `tests/e2e/`, not `src/`, so vitest doesn't pick them up).

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add Playwright e2e tests to CI pipeline"
```

**Step 5: Push and verify CI**

```bash
git push origin main
```

Then watch the CI run:

```bash
gh run watch
```

Expected: CI passes with unit tests, type check, build, AND e2e tests. Then deploy job runs and deploys to GH Pages.
