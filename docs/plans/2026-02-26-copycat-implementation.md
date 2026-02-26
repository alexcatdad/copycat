# CopyCat OCR Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a browser-only OCR tool that converts scanned documents (images/PDFs) into editable DOCX and searchable PDFs using Transformers.js + Florence-2.

**Architecture:** Svelte 5 + Vite frontend with a three-tier OCR engine (Florence-2 WebGPU → Florence-2 WASM → Tesseract.js fallback). Sequential page processing pipeline. Layout-preserving output via bounding box coordinates. i18n with EN/RO.

**Tech Stack:** Svelte 5, Vite, TypeScript, @huggingface/transformers (Florence-2), pdfjs-dist, docx, pdf-lib, tesseract.js, svelte-i18n, Vitest, Playwright

**Design doc:** `docs/plans/2026-02-26-copycat-ocr-design.md`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `svelte.config.js`, `src/main.ts`, `src/App.svelte`, `src/app.css`, `index.html`

**Step 1: Scaffold Svelte + Vite + TypeScript project**

Run:
```bash
npm create vite@latest . -- --template svelte-ts
```

If prompted about non-empty directory, confirm overwrite.

**Step 2: Install core dependencies**

Run:
```bash
npm install @huggingface/transformers pdfjs-dist docx pdf-lib tesseract.js svelte-i18n
```

**Step 3: Install dev dependencies**

Run:
```bash
npm install -D vitest @testing-library/svelte @testing-library/jest-dom jsdom @sveltejs/vite-plugin-svelte
```

**Step 4: Configure Vitest in `vite.config.ts`**

Replace the contents of `vite.config.ts` with:

```typescript
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

**Step 5: Create test setup file**

Create `src/test-setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest';
```

**Step 6: Add test script to `package.json`**

Add to `scripts` in `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 7: Verify the app builds and tests can run**

Run:
```bash
npm run build && npx vitest run --passWithNoTests
```

Expected: Build succeeds, vitest reports 0 tests.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Svelte + Vite + TypeScript project with dependencies"
```

---

### Task 2: Core Types & Engine Interface

**Files:**
- Create: `src/lib/types.ts`
- Test: `src/lib/types.test.ts`

**Step 1: Write the test**

Create `src/lib/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { OCREngine, OCRResult, OCRRegion, PageImage, EngineTier, AppState } from './types';

describe('Core types', () => {
  it('OCRResult has text and regions', () => {
    const result: OCRResult = {
      text: 'Hello world',
      regions: [
        { text: 'Hello', bbox: [0, 0, 50, 20] },
        { text: 'world', bbox: [55, 0, 110, 20] },
      ],
    };
    expect(result.text).toBe('Hello world');
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].bbox).toEqual([0, 0, 50, 20]);
  });

  it('PageImage holds image data and dimensions', () => {
    const page: PageImage = {
      dataUrl: 'data:image/png;base64,abc',
      width: 800,
      height: 1200,
      pageNumber: 1,
    };
    expect(page.width).toBe(800);
    expect(page.pageNumber).toBe(1);
  });

  it('EngineTier has correct values', () => {
    const tiers: EngineTier[] = ['premium', 'standard', 'basic'];
    expect(tiers).toContain('premium');
    expect(tiers).toContain('standard');
    expect(tiers).toContain('basic');
  });

  it('AppState has correct values', () => {
    const states: AppState[] = ['idle', 'loading-model', 'processing', 'complete'];
    expect(states).toHaveLength(4);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/types.test.ts`
Expected: FAIL — cannot find module `./types`

**Step 3: Write the types**

Create `src/lib/types.ts`:

```typescript
export interface OCRRegion {
  text: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface OCRResult {
  text: string;
  regions: OCRRegion[];
}

export interface PageImage {
  dataUrl: string;
  width: number;
  height: number;
  pageNumber: number;
}

export type EngineTier = 'premium' | 'standard' | 'basic';

export type AppState = 'idle' | 'loading-model' | 'processing' | 'complete';

export interface OCREngine {
  initialize(onProgress?: (progress: number) => void): Promise<void>;
  processPage(image: PageImage): Promise<OCRResult>;
  dispose(): Promise<void>;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/types.test.ts
git commit -m "feat: define core types and OCREngine interface"
```

---

### Task 3: MockEngine

**Files:**
- Create: `src/lib/engines/mock-engine.ts`
- Test: `src/lib/engines/mock-engine.test.ts`

**Step 1: Write the test**

Create `src/lib/engines/mock-engine.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MockEngine } from './mock-engine';
import type { PageImage, OCRResult } from '../types';

const mockPage: PageImage = {
  dataUrl: 'data:image/png;base64,abc',
  width: 800,
  height: 1200,
  pageNumber: 1,
};

describe('MockEngine', () => {
  it('initializes and calls onProgress', async () => {
    const onProgress = vi.fn();
    const engine = new MockEngine();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('returns default OCR result for a page', async () => {
    const engine = new MockEngine();
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBeTruthy();
    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.regions[0].bbox).toHaveLength(4);
  });

  it('returns custom responses when configured', async () => {
    const customResult: OCRResult = {
      text: 'Custom text',
      regions: [{ text: 'Custom text', bbox: [10, 20, 200, 30] }],
    };
    const engine = new MockEngine([customResult]);
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBe('Custom text');
  });

  it('cycles through responses for multiple pages', async () => {
    const results: OCRResult[] = [
      { text: 'Page 1', regions: [{ text: 'Page 1', bbox: [0, 0, 100, 20] }] },
      { text: 'Page 2', regions: [{ text: 'Page 2', bbox: [0, 0, 100, 20] }] },
    ];
    const engine = new MockEngine(results);
    await engine.initialize();
    const r1 = await engine.processPage({ ...mockPage, pageNumber: 1 });
    const r2 = await engine.processPage({ ...mockPage, pageNumber: 2 });
    expect(r1.text).toBe('Page 1');
    expect(r2.text).toBe('Page 2');
  });

  it('disposes without error', async () => {
    const engine = new MockEngine();
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/engines/mock-engine.test.ts`
Expected: FAIL — cannot find module `./mock-engine`

**Step 3: Implement MockEngine**

Create `src/lib/engines/mock-engine.ts`:

```typescript
import type { OCREngine, OCRResult, PageImage } from '../types';

const DEFAULT_RESULT: OCRResult = {
  text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  regions: [
    { text: 'Lorem ipsum dolor sit amet,', bbox: [50, 50, 400, 30] },
    { text: 'consectetur adipiscing elit.', bbox: [50, 90, 380, 30] },
  ],
};

export class MockEngine implements OCREngine {
  private responses: OCRResult[];
  private callIndex = 0;

  constructor(responses?: OCRResult[]) {
    this.responses = responses ?? [DEFAULT_RESULT];
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(1);
  }

  async processPage(_image: PageImage): Promise<OCRResult> {
    const result = this.responses[this.callIndex % this.responses.length];
    this.callIndex++;
    return result;
  }

  async dispose(): Promise<void> {}
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/engines/mock-engine.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/lib/engines/mock-engine.ts src/lib/engines/mock-engine.test.ts
git commit -m "feat: add MockEngine for deterministic testing"
```

---

### Task 4: Capability Detection

**Files:**
- Create: `src/lib/capability.ts`
- Test: `src/lib/capability.test.ts`

**Step 1: Write the test**

Create `src/lib/capability.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectEngineTier } from './capability';

describe('detectEngineTier', () => {
  beforeEach(() => {
    // Reset navigator.gpu mock between tests
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: undefined },
      writable: true,
      configurable: true,
    });
  });

  it('returns "basic" when navigator.gpu is undefined', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      value: undefined,
      configurable: true,
    });
    const tier = await detectEngineTier();
    expect(tier).toBe('basic');
  });

  it('returns "standard" when requestAdapter returns null', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      value: { requestAdapter: vi.fn().mockResolvedValue(null) },
      configurable: true,
    });
    const tier = await detectEngineTier();
    expect(tier).toBe('standard');
  });

  it('returns "premium" when WebGPU adapter is available', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      value: {
        requestAdapter: vi.fn().mockResolvedValue({
          requestDevice: vi.fn().mockResolvedValue({}),
        }),
      },
      configurable: true,
    });
    const tier = await detectEngineTier();
    expect(tier).toBe('premium');
  });

  it('returns "standard" when requestAdapter throws', async () => {
    Object.defineProperty(globalThis.navigator, 'gpu', {
      value: {
        requestAdapter: vi.fn().mockRejectedValue(new Error('GPU error')),
      },
      configurable: true,
    });
    const tier = await detectEngineTier();
    expect(tier).toBe('standard');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/capability.test.ts`
Expected: FAIL — cannot find module `./capability`

**Step 3: Implement capability detection**

Create `src/lib/capability.ts`:

```typescript
import type { EngineTier } from './types';

export async function detectEngineTier(): Promise<EngineTier> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return 'basic';
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return 'standard';
    }
    return 'premium';
  } catch {
    return 'standard';
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/capability.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/lib/capability.ts src/lib/capability.test.ts
git commit -m "feat: add WebGPU capability detection with three-tier fallback"
```

---

### Task 5: i18n Setup

**Files:**
- Create: `src/lib/i18n/index.ts`, `src/lib/i18n/en.json`, `src/lib/i18n/ro.json`
- Test: `src/lib/i18n/i18n.test.ts`

**Step 1: Write the test**

Create `src/lib/i18n/i18n.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { get } from 'svelte/store';
import { _, locale, init, register, waitLocale } from 'svelte-i18n';
import en from './en.json';
import ro from './ro.json';

describe('i18n', () => {
  beforeAll(async () => {
    register('en', () => Promise.resolve(en));
    register('ro', () => Promise.resolve(ro));
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
  });

  it('provides English translations', () => {
    const translate = get(_);
    expect(translate('app.title')).toBe('CopyCat');
    expect(translate('upload.dropzone')).toContain('Drop');
  });

  it('switches to Romanian', async () => {
    locale.set('ro');
    await waitLocale();
    const translate = get(_);
    expect(translate('app.title')).toBe('CopyCat');
    expect(translate('upload.dropzone')).toContain('Trage');
  });

  it('has all required keys in both languages', () => {
    const enKeys = Object.keys(flattenKeys(en));
    const roKeys = Object.keys(flattenKeys(ro));
    for (const key of enKeys) {
      expect(roKeys).toContain(key);
    }
  });
});

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: FAIL — cannot find module

**Step 3: Create English locale**

Create `src/lib/i18n/en.json`:

```json
{
  "app": {
    "title": "CopyCat",
    "subtitle": "Browser-Only OCR",
    "privacy": "100% client-side. No data leaves your browser."
  },
  "tier": {
    "premium": "GPU Accelerated",
    "standard": "Standard",
    "basic": "Basic OCR",
    "description": {
      "premium": "Using Florence-2 with WebGPU acceleration",
      "standard": "Using Florence-2 with CPU processing",
      "basic": "Using Tesseract.js for text extraction"
    }
  },
  "upload": {
    "dropzone": "Drop files here or click to upload scanned documents",
    "formats": "Supports: PDF, PNG, JPG",
    "button": "Select file"
  },
  "loading": {
    "title": "Loading OCR model",
    "progress": "Downloading model... {progress}%",
    "cached": "Model loaded from cache"
  },
  "processing": {
    "title": "Processing",
    "page": "Page {current} of {total}",
    "extracting": "Extracting text..."
  },
  "results": {
    "title": "Processing complete",
    "pages": "{count} pages extracted",
    "download": {
      "docx": "Download DOCX",
      "pdf": "Download Searchable PDF"
    },
    "restart": "Process another document"
  },
  "errors": {
    "unsupported_file": "Unsupported file type. Please upload a PDF, PNG, or JPG.",
    "processing_failed": "Failed to process page {page}. Skipping.",
    "model_load_failed": "Failed to load OCR model. Falling back to basic OCR."
  }
}
```

**Step 4: Create Romanian locale**

Create `src/lib/i18n/ro.json`:

```json
{
  "app": {
    "title": "CopyCat",
    "subtitle": "OCR doar in browser",
    "privacy": "100% local. Nicio data nu paraseste browserul tau."
  },
  "tier": {
    "premium": "Accelerare GPU",
    "standard": "Standard",
    "basic": "OCR de baza",
    "description": {
      "premium": "Folosind Florence-2 cu accelerare WebGPU",
      "standard": "Folosind Florence-2 cu procesare CPU",
      "basic": "Folosind Tesseract.js pentru extragerea textului"
    }
  },
  "upload": {
    "dropzone": "Trage fisierele aici sau apasa pentru a incarca documente scanate",
    "formats": "Formate suportate: PDF, PNG, JPG",
    "button": "Selecteaza fisier"
  },
  "loading": {
    "title": "Se incarca modelul OCR",
    "progress": "Se descarca modelul... {progress}%",
    "cached": "Modelul a fost incarcat din cache"
  },
  "processing": {
    "title": "Se proceseaza",
    "page": "Pagina {current} din {total}",
    "extracting": "Se extrage textul..."
  },
  "results": {
    "title": "Procesare completa",
    "pages": "{count} pagini extrase",
    "download": {
      "docx": "Descarca DOCX",
      "pdf": "Descarca PDF cu text selectabil"
    },
    "restart": "Proceseaza alt document"
  },
  "errors": {
    "unsupported_file": "Tip de fisier neacceptat. Incarca un PDF, PNG sau JPG.",
    "processing_failed": "Procesarea paginii {page} a esuat. Se trece la urmatoarea.",
    "model_load_failed": "Incarcarea modelului OCR a esuat. Se trece la OCR de baza."
  }
}
```

**Step 5: Create i18n initialization**

Create `src/lib/i18n/index.ts`:

```typescript
import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

register('en', () => import('./en.json'));
register('ro', () => import('./ro.json'));

export function setupI18n() {
  const savedLocale = typeof localStorage !== 'undefined'
    ? localStorage.getItem('copycat-locale')
    : null;

  const navigatorLocale = getLocaleFromNavigator()?.split('-')[0];
  const initialLocale = savedLocale ?? (navigatorLocale === 'ro' ? 'ro' : 'en');

  init({
    fallbackLocale: 'en',
    initialLocale,
  });
}
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/i18n/i18n.test.ts`
Expected: PASS (3 tests)

Note: If imports of `.json` fail, add `"resolveJsonModule": true` to `tsconfig.json` under `compilerOptions`.

**Step 7: Commit**

```bash
git add src/lib/i18n/
git commit -m "feat: add i18n with English and Romanian locale files"
```

---

### Task 6: PDF Page Rendering

**Files:**
- Create: `src/lib/pdf-renderer.ts`
- Test: `src/lib/pdf-renderer.test.ts`

**Step 1: Write the test**

Create `src/lib/pdf-renderer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderPdfPages, imageFileToPageImage } from './pdf-renderer';
import type { PageImage } from './types';

// Mock pdfjs-dist since it needs a browser environment
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 2,
      getPage: vi.fn().mockImplementation((pageNum: number) =>
        Promise.resolve({
          getViewport: vi.fn().mockReturnValue({ width: 800, height: 1200 }),
          render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        })
      ),
    }),
  }),
  GlobalWorkerOptions: { workerSrc: '' },
}));

describe('imageFileToPageImage', () => {
  it('converts a File to a PageImage', async () => {
    const file = new File(['fake-png'], 'test.png', { type: 'image/png' });

    // Mock FileReader
    const mockDataUrl = 'data:image/png;base64,fake';
    vi.spyOn(globalThis, 'FileReader').mockImplementation(() => {
      const reader = {
        readAsDataURL: vi.fn().mockImplementation(function (this: any) {
          setTimeout(() => {
            this.onload?.({ target: { result: mockDataUrl } });
          }, 0);
        }),
        onload: null as any,
        onerror: null as any,
      };
      return reader as any;
    });

    // Mock Image for dimensions
    vi.spyOn(globalThis, 'Image').mockImplementation(() => {
      const img = {
        set src(val: string) {
          setTimeout(() => {
            (img as any).naturalWidth = 800;
            (img as any).naturalHeight = 1200;
            (img as any).onload?.();
          }, 0);
        },
        onload: null as any,
        onerror: null as any,
        naturalWidth: 0,
        naturalHeight: 0,
      };
      return img as any;
    });

    const result = await imageFileToPageImage(file, 1);
    expect(result.dataUrl).toBe(mockDataUrl);
    expect(result.pageNumber).toBe(1);
  });
});

describe('renderPdfPages', () => {
  it('extracts pages from a PDF ArrayBuffer', async () => {
    // The mock above provides 2 pages
    // We need to mock canvas for toDataURL
    vi.spyOn(globalThis, 'document', 'get').mockReturnValue({
      createElement: vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({}),
        toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock'),
        width: 0,
        height: 0,
      }),
    } as any);

    const fakeBuffer = new ArrayBuffer(8);
    const pages = await renderPdfPages(fakeBuffer);
    expect(pages).toHaveLength(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[1].pageNumber).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdf-renderer.test.ts`
Expected: FAIL — cannot find module `./pdf-renderer`

**Step 3: Implement PDF renderer**

Create `src/lib/pdf-renderer.ts`:

```typescript
import * as pdfjsLib from 'pdfjs-dist';
import type { PageImage } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const RENDER_SCALE = 2; // Render at 2x for better OCR quality

export async function renderPdfPages(
  pdfBuffer: ArrayBuffer,
  onProgress?: (current: number, total: number) => void,
): Promise<PageImage[]> {
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  const pages: PageImage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    pages.push({
      dataUrl: canvas.toDataURL('image/png'),
      width: viewport.width,
      height: viewport.height,
      pageNumber: i,
    });

    onProgress?.(i, pdf.numPages);
  }

  return pages;
}

export async function imageFileToPageImage(file: File, pageNumber: number): Promise<PageImage> {
  const dataUrl = await fileToDataUrl(file);
  const { width, height } = await getImageDimensions(dataUrl);

  return { dataUrl, width, height, pageNumber };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pdf-renderer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/pdf-renderer.ts src/lib/pdf-renderer.test.ts
git commit -m "feat: add PDF page renderer and image file converter"
```

---

### Task 7: Florence-2 Engine

**Files:**
- Create: `src/lib/engines/florence2-engine.ts`
- Test: `src/lib/engines/florence2-engine.test.ts`

**Step 1: Write the test**

Create `src/lib/engines/florence2-engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Florence2Engine } from './florence2-engine';
import type { PageImage } from '../types';

// Mock @huggingface/transformers
const mockGenerate = vi.fn().mockResolvedValue([[1, 2, 3]]);
const mockBatchDecode = vi.fn().mockReturnValue(['<OCR_WITH_REGION>text1<loc_100><loc_200><loc_300><loc_400>text2<loc_500><loc_600><loc_700><loc_800></OCR_WITH_REGION>']);
const mockProcess = vi.fn().mockReturnValue({});
const mockConstructPrompts = vi.fn().mockReturnValue('<OCR_WITH_REGION>');
const mockPostProcess = vi.fn().mockReturnValue({
  '<OCR_WITH_REGION>': {
    labels: ['text1', 'text2'],
    quad_boxes: [100, 200, 300, 200, 300, 400, 100, 400, 500, 600, 700, 600, 700, 800, 500, 800],
  },
});

vi.mock('@huggingface/transformers', () => ({
  Florence2ForConditionalGeneration: {
    from_pretrained: vi.fn().mockResolvedValue({
      generate: mockGenerate,
    }),
  },
  AutoProcessor: {
    from_pretrained: vi.fn().mockResolvedValue(Object.assign(mockProcess, {
      construct_prompts: mockConstructPrompts,
      post_process_generation: mockPostProcess,
    })),
  },
  AutoTokenizer: {
    from_pretrained: vi.fn().mockResolvedValue({
      __call__: mockBatchDecode,
      batch_decode: mockBatchDecode,
      call: vi.fn().mockReturnValue({}),
    }),
  },
  RawImage: {
    fromURL: vi.fn().mockResolvedValue({ size: [800, 1200] }),
  },
}));

const mockPage: PageImage = {
  dataUrl: 'data:image/png;base64,abc',
  width: 800,
  height: 1200,
  pageNumber: 1,
};

describe('Florence2Engine', () => {
  it('initializes model, processor, and tokenizer', async () => {
    const engine = new Florence2Engine('webgpu');
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalled();
  });

  it('processPage returns OCRResult with text and regions', async () => {
    const engine = new Florence2Engine('webgpu');
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBeTruthy();
    expect(result.regions).toBeDefined();
    expect(Array.isArray(result.regions)).toBe(true);
  });

  it('disposes without error', async () => {
    const engine = new Florence2Engine('webgpu');
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/engines/florence2-engine.test.ts`
Expected: FAIL — cannot find module

**Step 3: Implement Florence2Engine**

Create `src/lib/engines/florence2-engine.ts`:

```typescript
import {
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
} from '@huggingface/transformers';
import type { OCREngine, OCRResult, OCRRegion, PageImage } from '../types';

const MODEL_ID = 'onnx-community/Florence-2-base-ft';

export class Florence2Engine implements OCREngine {
  private model: any = null;
  private processor: any = null;
  private tokenizer: any = null;
  private device: 'webgpu' | 'wasm';

  constructor(device: 'webgpu' | 'wasm' = 'webgpu') {
    this.device = device;
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(0);

    const dtypeConfig = this.device === 'webgpu'
      ? { embed_tokens: 'fp16', vision_encoder: 'fp16', encoder_model: 'q4', decoder_model_merged: 'q4' }
      : { embed_tokens: 'fp32', vision_encoder: 'fp32', encoder_model: 'q4', decoder_model_merged: 'q4' };

    this.model = await Florence2ForConditionalGeneration.from_pretrained(MODEL_ID, {
      dtype: dtypeConfig,
      device: this.device,
    });
    onProgress?.(0.5);

    this.processor = await AutoProcessor.from_pretrained(MODEL_ID);
    onProgress?.(0.75);

    this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
    onProgress?.(1);
  }

  async processPage(image: PageImage): Promise<OCRResult> {
    if (!this.model || !this.processor || !this.tokenizer) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    const rawImage = await RawImage.fromURL(image.dataUrl);
    const visionInputs = await this.processor(rawImage);
    const task = '<OCR_WITH_REGION>';
    const prompts = this.processor.construct_prompts(task);
    const textInputs = this.tokenizer(prompts);

    const generatedIds = await this.model.generate({
      ...textInputs,
      ...visionInputs,
      max_new_tokens: 1024,
    });

    const generatedText = this.tokenizer.batch_decode(generatedIds, {
      skip_special_tokens: false,
    })[0];

    const result = this.processor.post_process_generation(
      generatedText,
      task,
      rawImage.size,
    );

    return this.parseFlorence2Result(result);
  }

  async dispose(): Promise<void> {
    this.model = null;
    this.processor = null;
    this.tokenizer = null;
  }

  private parseFlorence2Result(result: any): OCRResult {
    const ocrData = result['<OCR_WITH_REGION>'];
    if (!ocrData || !ocrData.labels) {
      return { text: '', regions: [] };
    }

    const regions: OCRRegion[] = [];
    const labels: string[] = ocrData.labels;
    const quadBoxes: number[] = ocrData.quad_boxes;

    for (let i = 0; i < labels.length; i++) {
      // quad_boxes has 8 values per region (4 x,y pairs for corners)
      const offset = i * 8;
      if (offset + 7 >= quadBoxes.length) break;

      const x1 = quadBoxes[offset];
      const y1 = quadBoxes[offset + 1];
      const x3 = quadBoxes[offset + 4];
      const y3 = quadBoxes[offset + 5];

      regions.push({
        text: labels[i],
        bbox: [
          Math.min(x1, x3),
          Math.min(y1, y3),
          Math.abs(x3 - x1),
          Math.abs(y3 - y1),
        ],
      });
    }

    const text = labels.join(' ');
    return { text, regions };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/engines/florence2-engine.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/engines/florence2-engine.ts src/lib/engines/florence2-engine.test.ts
git commit -m "feat: add Florence2Engine with OCR_WITH_REGION support"
```

---

### Task 8: Tesseract Engine

**Files:**
- Create: `src/lib/engines/tesseract-engine.ts`
- Test: `src/lib/engines/tesseract-engine.test.ts`

**Step 1: Write the test**

Create `src/lib/engines/tesseract-engine.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { TesseractEngine } from './tesseract-engine';
import type { PageImage } from '../types';

// Mock tesseract.js
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn().mockResolvedValue({
    recognize: vi.fn().mockResolvedValue({
      data: {
        text: 'Hello World',
        words: [
          { text: 'Hello', bbox: { x0: 10, y0: 20, x1: 60, y1: 40 } },
          { text: 'World', bbox: { x0: 70, y0: 20, x1: 120, y1: 40 } },
        ],
      },
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockPage: PageImage = {
  dataUrl: 'data:image/png;base64,abc',
  width: 800,
  height: 1200,
  pageNumber: 1,
};

describe('TesseractEngine', () => {
  it('initializes without error', async () => {
    const engine = new TesseractEngine();
    const onProgress = vi.fn();
    await engine.initialize(onProgress);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('processPage returns OCRResult with text and regions from words', async () => {
    const engine = new TesseractEngine();
    await engine.initialize();
    const result = await engine.processPage(mockPage);
    expect(result.text).toBe('Hello World');
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].text).toBe('Hello');
    expect(result.regions[0].bbox).toEqual([10, 20, 50, 20]); // [x, y, w, h]
  });

  it('disposes the worker', async () => {
    const engine = new TesseractEngine();
    await engine.initialize();
    await expect(engine.dispose()).resolves.toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/engines/tesseract-engine.test.ts`
Expected: FAIL

**Step 3: Implement TesseractEngine**

Create `src/lib/engines/tesseract-engine.ts`:

```typescript
import { createWorker } from 'tesseract.js';
import type { OCREngine, OCRResult, OCRRegion, PageImage } from '../types';

export class TesseractEngine implements OCREngine {
  private worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  private langs: string;

  constructor(langs = 'eng+ron') {
    this.langs = langs;
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    this.worker = await createWorker(this.langs);
    onProgress?.(1);
  }

  async processPage(image: PageImage): Promise<OCRResult> {
    if (!this.worker) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    const { data } = await this.worker.recognize(image.dataUrl);

    const regions: OCRRegion[] = (data.words ?? []).map((word: any) => ({
      text: word.text,
      bbox: [
        word.bbox.x0,
        word.bbox.y0,
        word.bbox.x1 - word.bbox.x0,
        word.bbox.y1 - word.bbox.y0,
      ] as [number, number, number, number],
    }));

    return {
      text: data.text,
      regions,
    };
  }

  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/engines/tesseract-engine.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/engines/tesseract-engine.ts src/lib/engines/tesseract-engine.test.ts
git commit -m "feat: add TesseractEngine as basic OCR fallback"
```

---

### Task 9: Engine Factory

**Files:**
- Create: `src/lib/engines/index.ts`
- Test: `src/lib/engines/engine-factory.test.ts`

**Step 1: Write the test**

Create `src/lib/engines/engine-factory.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createEngine } from './index';
import { Florence2Engine } from './florence2-engine';
import { TesseractEngine } from './tesseract-engine';
import { MockEngine } from './mock-engine';

vi.mock('./florence2-engine');
vi.mock('./tesseract-engine');

describe('createEngine', () => {
  it('returns Florence2Engine with webgpu for premium tier', () => {
    const engine = createEngine('premium');
    expect(Florence2Engine).toHaveBeenCalledWith('webgpu');
  });

  it('returns Florence2Engine with wasm for standard tier', () => {
    const engine = createEngine('standard');
    expect(Florence2Engine).toHaveBeenCalledWith('wasm');
  });

  it('returns TesseractEngine for basic tier', () => {
    const engine = createEngine('basic');
    expect(TesseractEngine).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/engines/engine-factory.test.ts`
Expected: FAIL

**Step 3: Implement engine factory**

Create `src/lib/engines/index.ts`:

```typescript
import type { EngineTier, OCREngine } from '../types';
import { Florence2Engine } from './florence2-engine';
import { TesseractEngine } from './tesseract-engine';

export { MockEngine } from './mock-engine';
export { Florence2Engine } from './florence2-engine';
export { TesseractEngine } from './tesseract-engine';

export function createEngine(tier: EngineTier): OCREngine {
  switch (tier) {
    case 'premium':
      return new Florence2Engine('webgpu');
    case 'standard':
      return new Florence2Engine('wasm');
    case 'basic':
      return new TesseractEngine();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/engines/engine-factory.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/engines/index.ts src/lib/engines/engine-factory.test.ts
git commit -m "feat: add engine factory for tier-based engine selection"
```

---

### Task 10: Processing Pipeline

**Files:**
- Create: `src/lib/pipeline.ts`
- Test: `src/lib/pipeline.test.ts`

**Step 1: Write the test**

Create `src/lib/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { processPipeline } from './pipeline';
import { MockEngine } from './engines/mock-engine';
import type { PageImage, OCRResult } from './types';

const mockPages: PageImage[] = [
  { dataUrl: 'data:image/png;base64,p1', width: 800, height: 1200, pageNumber: 1 },
  { dataUrl: 'data:image/png;base64,p2', width: 800, height: 1200, pageNumber: 2 },
  { dataUrl: 'data:image/png;base64,p3', width: 800, height: 1200, pageNumber: 3 },
];

describe('processPipeline', () => {
  it('processes all pages sequentially and returns results', async () => {
    const results: OCRResult[] = [
      { text: 'Page 1 text', regions: [{ text: 'Page 1 text', bbox: [0, 0, 100, 20] }] },
      { text: 'Page 2 text', regions: [{ text: 'Page 2 text', bbox: [0, 0, 100, 20] }] },
      { text: 'Page 3 text', regions: [{ text: 'Page 3 text', bbox: [0, 0, 100, 20] }] },
    ];
    const engine = new MockEngine(results);
    await engine.initialize();

    const output = await processPipeline(engine, mockPages);
    expect(output).toHaveLength(3);
    expect(output[0].text).toBe('Page 1 text');
    expect(output[2].text).toBe('Page 3 text');
  });

  it('calls onPageComplete for each page', async () => {
    const engine = new MockEngine();
    await engine.initialize();

    const onPageComplete = vi.fn();
    await processPipeline(engine, mockPages, onPageComplete);
    expect(onPageComplete).toHaveBeenCalledTimes(3);
    expect(onPageComplete).toHaveBeenCalledWith(1, 3, expect.any(Object));
    expect(onPageComplete).toHaveBeenCalledWith(3, 3, expect.any(Object));
  });

  it('returns empty array for empty pages', async () => {
    const engine = new MockEngine();
    await engine.initialize();

    const output = await processPipeline(engine, []);
    expect(output).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pipeline.test.ts`
Expected: FAIL

**Step 3: Implement pipeline**

Create `src/lib/pipeline.ts`:

```typescript
import type { OCREngine, OCRResult, PageImage } from './types';

export async function processPipeline(
  engine: OCREngine,
  pages: PageImage[],
  onPageComplete?: (current: number, total: number, result: OCRResult) => void,
): Promise<OCRResult[]> {
  const results: OCRResult[] = [];

  for (let i = 0; i < pages.length; i++) {
    const result = await engine.processPage(pages[i]);
    results.push(result);
    onPageComplete?.(i + 1, pages.length, result);
  }

  return results;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pipeline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/lib/pipeline.test.ts
git commit -m "feat: add sequential OCR processing pipeline"
```

---

### Task 11: DOCX Generator

**Files:**
- Create: `src/lib/generators/docx-generator.ts`
- Test: `src/lib/generators/docx-generator.test.ts`

**Step 1: Write the test**

Create `src/lib/generators/docx-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateDocx } from './docx-generator';
import type { OCRResult, PageImage } from '../types';

const mockPages: PageImage[] = [
  { dataUrl: 'data:image/png;base64,p1', width: 800, height: 1200, pageNumber: 1 },
  { dataUrl: 'data:image/png;base64,p2', width: 800, height: 1200, pageNumber: 2 },
];

const mockResults: OCRResult[] = [
  {
    text: 'Hello World',
    regions: [
      { text: 'Hello', bbox: [50, 100, 200, 30] },
      { text: 'World', bbox: [50, 150, 200, 30] },
    ],
  },
  {
    text: 'Page two content',
    regions: [
      { text: 'Page two', bbox: [50, 100, 250, 30] },
      { text: 'content', bbox: [50, 150, 200, 30] },
    ],
  },
];

describe('generateDocx', () => {
  it('returns a Blob of type docx', async () => {
    const blob = await generateDocx(mockResults, mockPages);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('produces a non-empty blob', async () => {
    const blob = await generateDocx(mockResults, mockPages);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles empty results', async () => {
    const blob = await generateDocx([], []);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0); // Still valid DOCX, just empty
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/generators/docx-generator.test.ts`
Expected: FAIL

**Step 3: Implement DOCX generator**

Create `src/lib/generators/docx-generator.ts`:

```typescript
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
  SectionType,
} from 'docx';
import type { OCRResult, OCRRegion, PageImage } from '../types';

const FONT = 'Noto Sans';
const POINTS_PER_PIXEL = 0.75; // approximate conversion

export async function generateDocx(
  results: OCRResult[],
  pages: PageImage[],
): Promise<Blob> {
  const sections = results.map((result, index) =>
    buildSection(result, pages[index], index < results.length - 1),
  );

  const doc = new Document({
    sections: sections.length > 0 ? sections : [{ children: [] }],
  });

  const buffer = await Packer.toBlob(doc);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function buildSection(
  result: OCRResult,
  page: PageImage | undefined,
  _hasNext: boolean,
): { properties: any; children: any[] } {
  const sortedRegions = sortRegionsByPosition(result.regions);
  const paragraphs = groupIntoParagraphs(sortedRegions);

  const children = paragraphs.map(
    (group) =>
      new Paragraph({
        children: group.map(
          (region) =>
            new TextRun({
              text: region.text + ' ',
              font: FONT,
              size: estimateFontSize(region),
            }),
        ),
        spacing: { after: 120 },
      }),
  );

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
    },
    children,
  };
}

function sortRegionsByPosition(regions: OCRRegion[]): OCRRegion[] {
  return [...regions].sort((a, b) => {
    const yDiff = a.bbox[1] - b.bbox[1];
    if (Math.abs(yDiff) > 10) return yDiff; // Different line
    return a.bbox[0] - b.bbox[0]; // Same line, sort left to right
  });
}

function groupIntoParagraphs(regions: OCRRegion[]): OCRRegion[][] {
  if (regions.length === 0) return [];

  const paragraphs: OCRRegion[][] = [[regions[0]]];

  for (let i = 1; i < regions.length; i++) {
    const prev = regions[i - 1];
    const curr = regions[i];
    const yGap = curr.bbox[1] - (prev.bbox[1] + prev.bbox[3]);

    // If vertical gap is larger than line height, start new paragraph
    if (yGap > prev.bbox[3] * 1.5) {
      paragraphs.push([curr]);
    } else {
      paragraphs[paragraphs.length - 1].push(curr);
    }
  }

  return paragraphs;
}

function estimateFontSize(region: OCRRegion): number {
  // bbox[3] is height in pixels, convert to half-points (docx uses half-points)
  const heightPt = region.bbox[3] * POINTS_PER_PIXEL;
  return Math.max(16, Math.round(heightPt * 2)); // *2 for half-points, min 8pt
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/generators/docx-generator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/generators/docx-generator.ts src/lib/generators/docx-generator.test.ts
git commit -m "feat: add layout-preserving DOCX generator"
```

---

### Task 12: Searchable PDF Generator

**Files:**
- Create: `src/lib/generators/pdf-generator.ts`
- Test: `src/lib/generators/pdf-generator.test.ts`

**Step 1: Write the test**

Create `src/lib/generators/pdf-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateSearchablePdf } from './pdf-generator';
import type { OCRResult, PageImage } from '../types';

const mockPages: PageImage[] = [
  { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', width: 100, height: 100, pageNumber: 1 },
];

const mockResults: OCRResult[] = [
  {
    text: 'Hello World',
    regions: [
      { text: 'Hello', bbox: [10, 10, 50, 15] },
      { text: 'World', bbox: [65, 10, 50, 15] },
    ],
  },
];

describe('generateSearchablePdf', () => {
  it('returns a Blob of type pdf', async () => {
    const blob = await generateSearchablePdf(mockResults, mockPages);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
  });

  it('produces a non-empty blob', async () => {
    const blob = await generateSearchablePdf(mockResults, mockPages);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles empty results', async () => {
    const blob = await generateSearchablePdf([], []);
    expect(blob).toBeInstanceOf(Blob);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/generators/pdf-generator.test.ts`
Expected: FAIL

**Step 3: Implement searchable PDF generator**

Create `src/lib/generators/pdf-generator.ts`:

```typescript
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { OCRResult, PageImage } from '../types';

export async function generateSearchablePdf(
  results: OCRResult[],
  pages: PageImage[],
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages.length; i++) {
    const pageImage = pages[i];
    const result = results[i];
    if (!result) continue;

    // Embed the original scanned image
    let embeddedImage;
    try {
      const imageBytes = dataUrlToBytes(pageImage.dataUrl);
      if (pageImage.dataUrl.includes('image/png')) {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } else {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      }
    } catch {
      // If image embedding fails, create a blank page
      pdfDoc.addPage([pageImage.width, pageImage.height]);
      continue;
    }

    const page = pdfDoc.addPage([pageImage.width, pageImage.height]);

    // Draw the original image as the visible layer
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: pageImage.width,
      height: pageImage.height,
    });

    // Overlay invisible text at bounding box positions
    for (const region of result.regions) {
      const [x, y, w, h] = region.bbox;
      const fontSize = Math.max(4, h * 0.8);

      // PDF coordinates: origin is bottom-left, image coordinates: origin is top-left
      const pdfY = pageImage.height - y - h;

      page.drawText(region.text, {
        x,
        y: pdfY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0, // Invisible text
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return new Uint8Array(0);
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/generators/pdf-generator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/generators/pdf-generator.ts src/lib/generators/pdf-generator.test.ts
git commit -m "feat: add searchable PDF generator with invisible text overlay"
```

---

### Task 13: Svelte Stores

**Files:**
- Create: `src/lib/stores/app-state.svelte.ts`
- Test: `src/lib/stores/app-state.test.ts`

**Step 1: Write the test**

Create `src/lib/stores/app-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { appStore, resetApp } from './app-state.svelte';

describe('appStore', () => {
  it('has correct initial state', () => {
    resetApp();
    expect(appStore.state).toBe('idle');
    expect(appStore.engineTier).toBe('basic');
    expect(appStore.pages).toEqual([]);
    expect(appStore.ocrResults).toEqual([]);
    expect(appStore.currentPage).toBe(0);
    expect(appStore.progress).toEqual({ current: 0, total: 0 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stores/app-state.test.ts`
Expected: FAIL

**Step 3: Implement stores using Svelte 5 runes**

Create `src/lib/stores/app-state.svelte.ts`:

```typescript
import type { AppState, EngineTier, PageImage, OCRResult } from '../types';

export const appStore = $state({
  state: 'idle' as AppState,
  engineTier: 'basic' as EngineTier,
  pages: [] as PageImage[],
  ocrResults: [] as OCRResult[],
  currentPage: 0,
  progress: { current: 0, total: 0 },
  modelLoadProgress: 0,
  error: null as string | null,
});

export function resetApp() {
  appStore.state = 'idle';
  appStore.pages = [];
  appStore.ocrResults = [];
  appStore.currentPage = 0;
  appStore.progress = { current: 0, total: 0 };
  appStore.modelLoadProgress = 0;
  appStore.error = null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stores/app-state.test.ts`
Expected: PASS

Note: If Svelte 5 runes don't work in `.svelte.ts` files during tests, you may need to ensure the `svelte` Vite plugin processes `.svelte.ts` files. Check `vite.config.ts` has `svelte({ extensions: ['.svelte', '.svelte.ts'] })` or similar.

**Step 5: Commit**

```bash
git add src/lib/stores/app-state.svelte.ts src/lib/stores/app-state.test.ts
git commit -m "feat: add Svelte 5 reactive app store"
```

---

### Task 14: UploadZone Component

**Files:**
- Create: `src/lib/components/UploadZone.svelte`
- Test: `src/lib/components/UploadZone.test.ts`

**Step 1: Write the test**

Create `src/lib/components/UploadZone.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import UploadZone from './UploadZone.svelte';

describe('UploadZone', () => {
  it('renders the dropzone text', () => {
    render(UploadZone);
    expect(screen.getByText(/drop|upload|select/i)).toBeInTheDocument();
  });

  it('has a file input that accepts pdf, png, jpg', () => {
    render(UploadZone);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('image/png');
    expect(input.accept).toContain('image/jpeg');
    expect(input.accept).toContain('application/pdf');
  });

  it('emits onfiles event when files are selected', async () => {
    const onFiles = vi.fn();
    render(UploadZone, { props: { onfiles: onFiles } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['fake'], 'test.png', { type: 'image/png' });
    await fireEvent.change(input, { target: { files: [file] } });

    expect(onFiles).toHaveBeenCalledWith(expect.arrayContaining([expect.any(File)]));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/UploadZone.test.ts`
Expected: FAIL

**Step 3: Implement UploadZone**

Create `src/lib/components/UploadZone.svelte`:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';

  interface Props {
    onfiles?: (files: File[]) => void;
  }

  let { onfiles }: Props = $props();

  let dragOver = $state(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) onfiles?.(files);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) onfiles?.(files);
    input.value = '';
  }
</script>

<div
  class="upload-zone"
  class:drag-over={dragOver}
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  role="button"
  tabindex="0"
>
  <div class="upload-content">
    <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
    <p class="dropzone-text">{$_('upload.dropzone')}</p>
    <p class="formats-text">{$_('upload.formats')}</p>
    <label class="upload-button">
      {$_('upload.button')}
      <input
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        onchange={handleFileInput}
        hidden
      />
    </label>
  </div>
</div>

<style>
  .upload-zone {
    border: 2px dashed var(--border-color, #d1d5db);
    border-radius: 12px;
    padding: 3rem 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--bg-subtle, #f9fafb);
  }

  .upload-zone:hover,
  .upload-zone.drag-over {
    border-color: var(--accent, #3b82f6);
    background: var(--bg-accent-subtle, #eff6ff);
  }

  .upload-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 1rem;
    color: var(--text-muted, #9ca3af);
  }

  .dropzone-text {
    font-size: 1.1rem;
    color: var(--text-primary, #374151);
    margin-bottom: 0.5rem;
  }

  .formats-text {
    font-size: 0.875rem;
    color: var(--text-muted, #9ca3af);
    margin-bottom: 1.5rem;
  }

  .upload-button {
    display: inline-block;
    padding: 0.6rem 1.5rem;
    background: var(--accent, #3b82f6);
    color: white;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.2s;
  }

  .upload-button:hover {
    background: var(--accent-hover, #2563eb);
  }
</style>
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/UploadZone.test.ts`
Expected: PASS

Note: If `svelte-i18n` `$_` fails in tests, you may need to initialize i18n in the test setup or mock it. Add to test setup if needed:
```typescript
vi.mock('svelte-i18n', () => ({
  _: { subscribe: (fn: any) => { fn((key: string) => key); return () => {}; } },
}));
```

**Step 5: Commit**

```bash
git add src/lib/components/UploadZone.svelte src/lib/components/UploadZone.test.ts
git commit -m "feat: add UploadZone component with drag-and-drop"
```

---

### Task 15: ProgressBar Component

**Files:**
- Create: `src/lib/components/ProgressBar.svelte`
- Test: `src/lib/components/ProgressBar.test.ts`

**Step 1: Write the test**

Create `src/lib/components/ProgressBar.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProgressBar from './ProgressBar.svelte';

describe('ProgressBar', () => {
  it('displays progress percentage', () => {
    render(ProgressBar, { props: { progress: 0.5, label: 'Loading...' } });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('shows 0% at start', () => {
    render(ProgressBar, { props: { progress: 0, label: 'Starting' } });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows 100% when complete', () => {
    render(ProgressBar, { props: { progress: 1, label: 'Done' } });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ProgressBar.test.ts`

**Step 3: Implement ProgressBar**

Create `src/lib/components/ProgressBar.svelte`:

```svelte
<script lang="ts">
  interface Props {
    progress: number; // 0 to 1
    label: string;
  }

  let { progress, label }: Props = $props();

  let percent = $derived(Math.round(progress * 100));
</script>

<div class="progress-container">
  <div class="progress-label">{label}</div>
  <div
    class="progress-bar"
    role="progressbar"
    aria-valuenow={percent}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div class="progress-fill" style="width: {percent}%"></div>
  </div>
  <div class="progress-percent">{percent}%</div>
</div>

<style>
  .progress-container {
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
  }

  .progress-label {
    font-size: 0.875rem;
    color: var(--text-muted, #6b7280);
    margin-bottom: 0.5rem;
  }

  .progress-bar {
    height: 8px;
    background: var(--bg-subtle, #e5e7eb);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent, #3b82f6);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-percent {
    font-size: 0.75rem;
    color: var(--text-muted, #6b7280);
    text-align: right;
    margin-top: 0.25rem;
  }
</style>
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ProgressBar.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/components/ProgressBar.svelte src/lib/components/ProgressBar.test.ts
git commit -m "feat: add accessible ProgressBar component"
```

---

### Task 16: Header & LanguageSwitcher Components

**Files:**
- Create: `src/lib/components/Header.svelte`, `src/lib/components/LanguageSwitcher.svelte`
- Test: `src/lib/components/Header.test.ts`

**Step 1: Write the test**

Create `src/lib/components/Header.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Header from './Header.svelte';

describe('Header', () => {
  it('renders the app title', () => {
    render(Header, { props: { tier: 'premium' } });
    expect(screen.getByText(/CopyCat/)).toBeInTheDocument();
  });

  it('shows the engine tier badge', () => {
    render(Header, { props: { tier: 'premium' } });
    expect(screen.getByText(/GPU|premium/i)).toBeInTheDocument();
  });

  it('renders language switcher buttons', () => {
    render(Header, { props: { tier: 'basic' } });
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('RO')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/Header.test.ts`

**Step 3: Implement LanguageSwitcher**

Create `src/lib/components/LanguageSwitcher.svelte`:

```svelte
<script lang="ts">
  import { locale } from 'svelte-i18n';

  let currentLocale = $state('en');

  locale.subscribe((val) => {
    if (val) currentLocale = val;
  });

  function setLocale(lang: string) {
    locale.set(lang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('copycat-locale', lang);
    }
  }
</script>

<div class="lang-switcher">
  <button
    class:active={currentLocale === 'en'}
    onclick={() => setLocale('en')}
  >EN</button>
  <button
    class:active={currentLocale === 'ro'}
    onclick={() => setLocale('ro')}
  >RO</button>
</div>

<style>
  .lang-switcher {
    display: flex;
    gap: 2px;
    background: var(--bg-subtle, #e5e7eb);
    border-radius: 6px;
    padding: 2px;
  }

  button {
    padding: 0.25rem 0.6rem;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted, #6b7280);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  button.active {
    background: white;
    color: var(--text-primary, #111827);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
</style>
```

**Step 4: Implement Header**

Create `src/lib/components/Header.svelte`:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import LanguageSwitcher from './LanguageSwitcher.svelte';
  import type { EngineTier } from '../types';

  interface Props {
    tier: EngineTier;
  }

  let { tier }: Props = $props();
</script>

<header>
  <div class="brand">
    <h1>CopyCat</h1>
    <span class="subtitle">{$_('app.subtitle')}</span>
  </div>
  <div class="controls">
    <span class="tier-badge tier-{tier}">
      {$_(`tier.${tier}`)}
    </span>
    <LanguageSwitcher />
  </div>
</header>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
  }

  .brand {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
  }

  .subtitle {
    font-size: 0.875rem;
    color: var(--text-muted, #6b7280);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .tier-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
  }

  .tier-premium {
    background: #dcfce7;
    color: #166534;
  }

  .tier-standard {
    background: #dbeafe;
    color: #1e40af;
  }

  .tier-basic {
    background: #f3f4f6;
    color: #374151;
  }
</style>
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/components/Header.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/components/Header.svelte src/lib/components/LanguageSwitcher.svelte src/lib/components/Header.test.ts
git commit -m "feat: add Header with tier badge and language switcher"
```

---

### Task 17: ProcessingView & PagePreview Components

**Files:**
- Create: `src/lib/components/ProcessingView.svelte`, `src/lib/components/PagePreview.svelte`, `src/lib/components/TextResult.svelte`
- Test: `src/lib/components/ProcessingView.test.ts`

**Step 1: Write the test**

Create `src/lib/components/ProcessingView.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProcessingView from './ProcessingView.svelte';

describe('ProcessingView', () => {
  it('shows current page progress', () => {
    render(ProcessingView, {
      props: {
        currentPage: 3,
        totalPages: 10,
        pageImage: { dataUrl: 'data:image/png;base64,abc', width: 800, height: 1200, pageNumber: 3 },
        ocrResult: { text: 'Hello', regions: [{ text: 'Hello', bbox: [0, 0, 100, 20] }] },
      },
    });
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });

  it('displays extracted text', () => {
    render(ProcessingView, {
      props: {
        currentPage: 1,
        totalPages: 1,
        pageImage: { dataUrl: 'data:image/png;base64,abc', width: 800, height: 1200, pageNumber: 1 },
        ocrResult: { text: 'Extracted content here', regions: [] },
      },
    });
    expect(screen.getByText(/Extracted content here/)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ProcessingView.test.ts`

**Step 3: Implement TextResult**

Create `src/lib/components/TextResult.svelte`:

```svelte
<script lang="ts">
  import type { OCRResult } from '../types';

  interface Props {
    result: OCRResult | null;
  }

  let { result }: Props = $props();
</script>

<div class="text-result">
  {#if result}
    <pre class="extracted-text">{result.text}</pre>
  {:else}
    <div class="placeholder">
      <p>Extracting text...</p>
    </div>
  {/if}
</div>

<style>
  .text-result {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    background: white;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e5e7eb);
  }

  .extracted-text {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'Noto Sans', system-ui, sans-serif;
    font-size: 0.9rem;
    line-height: 1.6;
    margin: 0;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted, #9ca3af);
  }
</style>
```

**Step 4: Implement PagePreview**

Create `src/lib/components/PagePreview.svelte`:

```svelte
<script lang="ts">
  import type { PageImage, OCRRegion } from '../types';

  interface Props {
    page: PageImage;
    regions?: OCRRegion[];
  }

  let { page, regions = [] }: Props = $props();
</script>

<div class="page-preview">
  <div class="image-container">
    <img src={page.dataUrl} alt="Page {page.pageNumber}" />
    {#each regions as region}
      {@const [x, y, w, h] = region.bbox}
      <div
        class="bbox-overlay"
        style="
          left: {(x / page.width) * 100}%;
          top: {(y / page.height) * 100}%;
          width: {(w / page.width) * 100}%;
          height: {(h / page.height) * 100}%;
        "
      ></div>
    {/each}
  </div>
</div>

<style>
  .page-preview {
    flex: 1;
    overflow: auto;
  }

  .image-container {
    position: relative;
    display: inline-block;
    max-width: 100%;
  }

  img {
    max-width: 100%;
    height: auto;
    display: block;
    border-radius: 4px;
  }

  .bbox-overlay {
    position: absolute;
    border: 2px solid rgba(59, 130, 246, 0.5);
    background: rgba(59, 130, 246, 0.08);
    pointer-events: none;
  }
</style>
```

**Step 5: Implement ProcessingView**

Create `src/lib/components/ProcessingView.svelte`:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import ProgressBar from './ProgressBar.svelte';
  import PagePreview from './PagePreview.svelte';
  import TextResult from './TextResult.svelte';
  import type { PageImage, OCRResult } from '../types';

  interface Props {
    currentPage: number;
    totalPages: number;
    pageImage: PageImage | null;
    ocrResult: OCRResult | null;
  }

  let { currentPage, totalPages, pageImage, ocrResult }: Props = $props();
</script>

<div class="processing-view">
  <ProgressBar
    progress={totalPages > 0 ? currentPage / totalPages : 0}
    label={$_('processing.page', { values: { current: currentPage, total: totalPages } })}
  />

  <div class="split-view">
    <div class="panel">
      {#if pageImage}
        <PagePreview page={pageImage} regions={ocrResult?.regions} />
      {/if}
    </div>
    <div class="panel">
      <TextResult result={ocrResult} />
    </div>
  </div>
</div>

<style>
  .processing-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
  }

  .split-view {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    min-height: 500px;
  }

  .panel {
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    overflow: hidden;
  }

  @media (max-width: 768px) {
    .split-view {
      grid-template-columns: 1fr;
    }
  }
</style>
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ProcessingView.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/lib/components/ProcessingView.svelte src/lib/components/PagePreview.svelte src/lib/components/TextResult.svelte src/lib/components/ProcessingView.test.ts
git commit -m "feat: add ProcessingView with side-by-side preview and bbox overlay"
```

---

### Task 18: ResultsView & DownloadButtons Components

**Files:**
- Create: `src/lib/components/ResultsView.svelte`, `src/lib/components/DownloadButtons.svelte`, `src/lib/components/PageNavigator.svelte`
- Test: `src/lib/components/ResultsView.test.ts`

**Step 1: Write the test**

Create `src/lib/components/ResultsView.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ResultsView from './ResultsView.svelte';

const mockProps = {
  pages: [
    { dataUrl: 'data:image/png;base64,p1', width: 800, height: 1200, pageNumber: 1 },
    { dataUrl: 'data:image/png;base64,p2', width: 800, height: 1200, pageNumber: 2 },
  ],
  results: [
    { text: 'Page 1 text', regions: [{ text: 'Page 1 text', bbox: [0, 0, 100, 20] as [number, number, number, number] }] },
    { text: 'Page 2 text', regions: [{ text: 'Page 2 text', bbox: [0, 0, 100, 20] as [number, number, number, number] }] },
  ],
  onrestart: vi.fn(),
};

describe('ResultsView', () => {
  it('shows page count', () => {
    render(ResultsView, { props: mockProps });
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('has download buttons for DOCX and PDF', () => {
    render(ResultsView, { props: mockProps });
    expect(screen.getByText(/DOCX/i)).toBeInTheDocument();
    expect(screen.getByText(/PDF/i)).toBeInTheDocument();
  });

  it('has a restart button', () => {
    render(ResultsView, { props: mockProps });
    const restartBtn = screen.getByText(/another|restart/i);
    expect(restartBtn).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ResultsView.test.ts`

**Step 3: Implement DownloadButtons**

Create `src/lib/components/DownloadButtons.svelte`:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { generateDocx } from '../generators/docx-generator';
  import { generateSearchablePdf } from '../generators/pdf-generator';
  import type { OCRResult, PageImage } from '../types';

  interface Props {
    results: OCRResult[];
    pages: PageImage[];
  }

  let { results, pages }: Props = $props();
  let generatingDocx = $state(false);
  let generatingPdf = $state(false);

  async function downloadDocx() {
    generatingDocx = true;
    try {
      const blob = await generateDocx(results, pages);
      downloadBlob(blob, 'copycat-output.docx');
    } finally {
      generatingDocx = false;
    }
  }

  async function downloadPdf() {
    generatingPdf = true;
    try {
      const blob = await generateSearchablePdf(results, pages);
      downloadBlob(blob, 'copycat-output.pdf');
    } finally {
      generatingPdf = false;
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="download-buttons">
  <button onclick={downloadDocx} disabled={generatingDocx}>
    {generatingDocx ? '...' : $_('results.download.docx')}
  </button>
  <button onclick={downloadPdf} disabled={generatingPdf}>
    {generatingPdf ? '...' : $_('results.download.pdf')}
  </button>
</div>

<style>
  .download-buttons {
    display: flex;
    gap: 1rem;
  }

  button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    background: var(--accent, #3b82f6);
    color: white;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:hover:not(:disabled) {
    background: var(--accent-hover, #2563eb);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
```

**Step 4: Implement PageNavigator**

Create `src/lib/components/PageNavigator.svelte`:

```svelte
<script lang="ts">
  interface Props {
    currentPage: number;
    totalPages: number;
    onpagechange?: (page: number) => void;
  }

  let { currentPage, totalPages, onpagechange }: Props = $props();

  function goTo(page: number) {
    if (page >= 1 && page <= totalPages) {
      onpagechange?.(page);
    }
  }
</script>

<nav class="page-navigator">
  <button onclick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}>&#9664;</button>
  {#each Array.from({ length: totalPages }, (_, i) => i + 1) as page}
    <button
      class:active={page === currentPage}
      onclick={() => goTo(page)}
    >{page}</button>
  {/each}
  <button onclick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages}>&#9654;</button>
</nav>

<style>
  .page-navigator {
    display: flex;
    gap: 4px;
    justify-content: center;
    flex-wrap: wrap;
  }

  button {
    min-width: 36px;
    height: 36px;
    border: 1px solid var(--border-color, #d1d5db);
    border-radius: 6px;
    background: white;
    color: var(--text-primary, #374151);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s;
  }

  button:hover:not(:disabled) {
    background: var(--bg-subtle, #f3f4f6);
  }

  button.active {
    background: var(--accent, #3b82f6);
    color: white;
    border-color: var(--accent, #3b82f6);
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
```

**Step 5: Implement ResultsView**

Create `src/lib/components/ResultsView.svelte`:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import DownloadButtons from './DownloadButtons.svelte';
  import PageNavigator from './PageNavigator.svelte';
  import PagePreview from './PagePreview.svelte';
  import TextResult from './TextResult.svelte';
  import type { OCRResult, PageImage } from '../types';

  interface Props {
    pages: PageImage[];
    results: OCRResult[];
    onrestart?: () => void;
  }

  let { pages, results, onrestart }: Props = $props();
  let viewingPage = $state(1);
</script>

<div class="results-view">
  <div class="results-header">
    <h2>{$_('results.title')}</h2>
    <p>{$_('results.pages', { values: { count: pages.length } })}</p>
  </div>

  <DownloadButtons {results} {pages} />

  <div class="split-view">
    <div class="panel">
      {#if pages[viewingPage - 1]}
        <PagePreview
          page={pages[viewingPage - 1]}
          regions={results[viewingPage - 1]?.regions}
        />
      {/if}
    </div>
    <div class="panel">
      <TextResult result={results[viewingPage - 1] ?? null} />
    </div>
  </div>

  {#if pages.length > 1}
    <PageNavigator
      currentPage={viewingPage}
      totalPages={pages.length}
      onpagechange={(p) => viewingPage = p}
    />
  {/if}

  <button class="restart-button" onclick={onrestart}>
    {$_('results.restart')}
  </button>
</div>

<style>
  .results-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
  }

  .results-header h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .results-header p {
    margin: 0.25rem 0 0;
    color: var(--text-muted, #6b7280);
    font-size: 0.875rem;
  }

  .split-view {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    min-height: 400px;
  }

  .panel {
    display: flex;
    flex-direction: column;
  }

  .restart-button {
    align-self: center;
    padding: 0.6rem 1.5rem;
    border: 1px solid var(--border-color, #d1d5db);
    border-radius: 8px;
    background: white;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.15s;
  }

  .restart-button:hover {
    background: var(--bg-subtle, #f3f4f6);
  }

  @media (max-width: 768px) {
    .split-view {
      grid-template-columns: 1fr;
    }
  }
</style>
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ResultsView.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/lib/components/ResultsView.svelte src/lib/components/DownloadButtons.svelte src/lib/components/PageNavigator.svelte src/lib/components/ResultsView.test.ts
git commit -m "feat: add ResultsView with download buttons and page navigation"
```

---

### Task 19: App Shell Integration

**Files:**
- Modify: `src/App.svelte`
- Create: `src/lib/components/Footer.svelte`

**Step 1: Implement Footer**

Create `src/lib/components/Footer.svelte`:

```svelte
<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<footer>
  <p>{$_('app.privacy')}</p>
</footer>

<style>
  footer {
    padding: 1rem 2rem;
    text-align: center;
    border-top: 1px solid var(--border-color, #e5e7eb);
    color: var(--text-muted, #9ca3af);
    font-size: 0.8rem;
  }
</style>
```

**Step 2: Wire up App.svelte**

Replace `src/App.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { setupI18n } from './lib/i18n';
  import { detectEngineTier } from './lib/capability';
  import { createEngine } from './lib/engines';
  import { renderPdfPages, imageFileToPageImage } from './lib/pdf-renderer';
  import { processPipeline } from './lib/pipeline';
  import Header from './lib/components/Header.svelte';
  import UploadZone from './lib/components/UploadZone.svelte';
  import ProgressBar from './lib/components/ProgressBar.svelte';
  import ProcessingView from './lib/components/ProcessingView.svelte';
  import ResultsView from './lib/components/ResultsView.svelte';
  import Footer from './lib/components/Footer.svelte';
  import type { AppState, EngineTier, PageImage, OCRResult, OCREngine } from './lib/types';

  setupI18n();

  let appState = $state<AppState>('idle');
  let engineTier = $state<EngineTier>('basic');
  let pages = $state<PageImage[]>([]);
  let ocrResults = $state<OCRResult[]>([]);
  let currentPage = $state(0);
  let totalPages = $state(0);
  let currentResult = $state<OCRResult | null>(null);
  let modelLoadProgress = $state(0);
  let engine: OCREngine | null = null;

  onMount(async () => {
    engineTier = await detectEngineTier();
  });

  async function handleFiles(files: File[]) {
    const file = files[0];
    if (!file) return;

    appState = 'loading-model';
    engine = createEngine(engineTier);
    await engine.initialize((p) => { modelLoadProgress = p; });

    appState = 'processing';

    // Convert file to page images
    if (file.type === 'application/pdf') {
      const buffer = await file.arrayBuffer();
      pages = await renderPdfPages(buffer, (current, total) => {
        currentPage = current;
        totalPages = total;
      });
    } else {
      pages = [await imageFileToPageImage(file, 1)];
    }

    totalPages = pages.length;
    currentPage = 0;
    ocrResults = [];

    ocrResults = await processPipeline(engine, pages, (current, total, result) => {
      currentPage = current;
      currentResult = result;
    });

    appState = 'complete';
  }

  function handleRestart() {
    appState = 'idle';
    pages = [];
    ocrResults = [];
    currentPage = 0;
    totalPages = 0;
    currentResult = null;
    modelLoadProgress = 0;
  }
</script>

<div class="app">
  <Header tier={engineTier} />

  <main>
    {#if appState === 'idle'}
      <UploadZone onfiles={handleFiles} />
    {:else if appState === 'loading-model'}
      <div class="centered">
        <ProgressBar progress={modelLoadProgress} label={$_('loading.title')} />
      </div>
    {:else if appState === 'processing'}
      <ProcessingView
        currentPage={currentPage}
        totalPages={totalPages}
        pageImage={pages[currentPage - 1] ?? null}
        ocrResult={currentResult}
      />
    {:else if appState === 'complete'}
      <ResultsView
        {pages}
        results={ocrResults}
        onrestart={handleRestart}
      />
    {/if}
  </main>

  <Footer />
</div>

<style>
  :global(:root) {
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --bg-subtle: #f9fafb;
    --bg-accent-subtle: #eff6ff;
    --border-color: #e5e7eb;
    --text-primary: #111827;
    --text-muted: #6b7280;
  }

  :global(body) {
    margin: 0;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: var(--text-primary);
    background: white;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
  }
</style>
```

**Step 3: Update `src/main.ts` entry point**

Replace `src/main.ts` with:

```typescript
import './app.css';
import App from './App.svelte';
import { mount } from 'svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
```

**Step 4: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/App.svelte src/main.ts src/lib/components/Footer.svelte
git commit -m "feat: wire up App shell with full OCR pipeline flow"
```

---

### Task 20: Run All Tests & Fix Issues

**Step 1: Run the full test suite**

Run: `npx vitest run`

**Step 2: Fix any failing tests**

Address any import issues, mock problems, or type errors. Common issues:
- `svelte-i18n` needs mocking in component tests — add a global mock in `src/test-setup.ts`
- `.svelte.ts` files may need Svelte plugin configuration in Vitest
- `pdfjs-dist` worker path may need adjusting for tests

**Step 3: Run build to verify no TypeScript errors**

Run: `npm run build`

**Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve test and build issues across all modules"
```

---

### Task 21: Manual Smoke Test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test the full flow in Chrome**

1. Open the app in Chrome (needs WebGPU support)
2. Verify the tier badge shows (may show "Basic" in localhost without WebGPU)
3. Upload a PNG image of text
4. Watch model loading progress
5. Watch page processing
6. Verify side-by-side preview shows
7. Download DOCX — open in Word/Google Docs, verify text is present
8. Download PDF — open in a PDF viewer, verify text is selectable
9. Toggle language to Romanian, verify UI updates
10. Click "Process another document", verify reset

**Step 3: Document any issues found and fix them**

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: polish app after smoke testing"
```

---

## Summary of Tasks

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Project Scaffolding | project config | - |
| 2 | Core Types | `types.ts` | 4 |
| 3 | MockEngine | `mock-engine.ts` | 5 |
| 4 | Capability Detection | `capability.ts` | 4 |
| 5 | i18n Setup | `i18n/`, `en.json`, `ro.json` | 3 |
| 6 | PDF Page Rendering | `pdf-renderer.ts` | 2 |
| 7 | Florence-2 Engine | `florence2-engine.ts` | 3 |
| 8 | Tesseract Engine | `tesseract-engine.ts` | 3 |
| 9 | Engine Factory | `engines/index.ts` | 3 |
| 10 | Processing Pipeline | `pipeline.ts` | 3 |
| 11 | DOCX Generator | `docx-generator.ts` | 3 |
| 12 | Searchable PDF Generator | `pdf-generator.ts` | 3 |
| 13 | Svelte Stores | `app-state.svelte.ts` | 1 |
| 14 | UploadZone Component | `UploadZone.svelte` | 3 |
| 15 | ProgressBar Component | `ProgressBar.svelte` | 3 |
| 16 | Header & LanguageSwitcher | `Header.svelte`, `LanguageSwitcher.svelte` | 3 |
| 17 | ProcessingView | `ProcessingView.svelte`, `PagePreview.svelte`, `TextResult.svelte` | 2 |
| 18 | ResultsView | `ResultsView.svelte`, `DownloadButtons.svelte`, `PageNavigator.svelte` | 3 |
| 19 | App Shell Integration | `App.svelte`, `Footer.svelte`, `main.ts` | - |
| 20 | Run All Tests & Fix | - | all |
| 21 | Manual Smoke Test | - | manual |
