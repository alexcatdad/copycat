# CopyCat: Browser-Only OCR Design

## Overview

CopyCat is a browser-only OCR tool that converts scanned documents (images and PDFs) into editable DOCX files and searchable/selectable-text PDFs. All processing happens client-side — no data leaves the browser.

## Technology Decisions

### OCR Engine: Transformers.js + Florence-2 (not WebLLM)

After due diligence, we chose **Transformers.js with Florence-2** over WebLLM + SmolVLM for these reasons:

| Factor | WebLLM + SmolVLM | Transformers.js + Florence-2 |
|--------|-------------------|------------------------------|
| WASM fallback | None (WebGPU-only) | Yes (~95% browser coverage) |
| Smallest VLM download | ~2.3 GB (Phi-3.5-vision) | ~340 MB (Florence-2-base) |
| VLM stability | Fragile (documented bugs #727, #586) | Stable, official demos |
| OCR accuracy | SmolVLM-500M hallucinated on real docs | Florence-2 is deterministic, no hallucination |
| Bounding boxes | Not available from generative VLMs | Native `<OCR_WITH_REGION>` task |
| Layout reconstruction | Not feasible (text-only output) | Feasible (bbox coordinates) |

Florence-2 is a **vision foundation model** (not a generative VLM). It detects text with bounding boxes rather than generating text, which eliminates hallucination risk and enables layout-preserving output.

### Frontend: Svelte + Vite

- Svelte's built-in reactivity handles complex async state (model loading, per-page progress, streaming) with minimal boilerplate
- Vite produces static builds deployable to GitHub Pages / Netlify / Vercel

### Fallback: Three-Tier Progressive Enhancement

| Tier | Engine | Requirement | Quality | Speed |
|------|--------|-------------|---------|-------|
| Premium | Florence-2 via WebGPU | WebGPU (~78% of users) | Best — layout-aware, structured | 1-3 sec/page |
| Standard | Florence-2 via WASM | WebAssembly (~95%+) | Same model, slower | 10-30 sec/page |
| Basic | Tesseract.js | Any modern browser | Text only, no layout understanding | 3-10 sec/page |

Detection: `navigator.gpu` -> `requestAdapter()` -> select tier.

### i18n: English + Romanian

Using `svelte-i18n` with JSON locale files. Locale detection: localStorage preference > `navigator.language` > default `en`.

## Architecture

### Data Flow

```
File Upload → Page Render → OCR Engine → Document Assembly → Download
(drag/drop)   (pdfjs-dist)  (Florence-2   (docx + pdf-lib)   (.docx/.pdf)
               → images[]    or Tesseract)
                              → OCRResult[]
```

### App States

1. **idle** — Landing page with upload zone. Shows detected capability tier.
2. **loading-model** — Downloads Florence-2 (~340 MB, cached via Cache API after first load). Progress bar.
3. **processing** — Pages OCR'd sequentially. Side-by-side: original image | extracted text with bounding box overlay. Progress: "Page X of Y."
4. **complete** — Full result with download buttons (DOCX, searchable PDF). Browsable page preview.

### Engine Abstraction

```typescript
interface OCREngine {
  initialize(onProgress?: (p: number) => void): Promise<void>;
  processPage(image: ImageData): Promise<OCRResult>;
  dispose(): Promise<void>;
}

interface OCRResult {
  text: string;
  regions: { text: string; bbox: [number, number, number, number] }[];
}
```

Three implementations: `Florence2Engine`, `TesseractEngine`, `MockEngine` (for tests).

### Key Libraries

| Library | Purpose | Size |
|---------|---------|------|
| `@huggingface/transformers` | Florence-2 inference (WebGPU + WASM) | ~2MB JS (+ ~340MB model) |
| `pdfjs-dist` | Render PDF pages to canvas/images | ~400KB |
| `docx` | Generate DOCX files client-side | ~200KB |
| `pdf-lib` | Generate searchable PDFs client-side | ~300KB |
| `tesseract.js` | Fallback OCR engine | ~8MB WASM + ~4MB lang data |
| `svelte-i18n` | Internationalization (EN/RO) | ~10KB |

### Web Worker Strategy

Florence-2 inference runs in the main thread's WebGPU context (Transformers.js manages this). PDF rendering and document assembly happen on the main thread. Heavy processing is non-blocking because Transformers.js yields to the event loop during inference.

For Tesseract.js fallback, it natively runs in a Web Worker.

## UI Design

### Component Tree

```
App.svelte
├── Header.svelte              — branding, tier badge, LanguageSwitcher
├── CapabilityBanner.svelte    — detected engine tier + browser info
├── UploadZone.svelte          — drag & drop, file picker
├── ModelLoader.svelte         — download progress bar for Florence-2
├── ProcessingView.svelte      — orchestrates the OCR pipeline
│   ├── PagePreview.svelte     — original scan image with bbox overlay
│   ├── TextResult.svelte      — extracted text per page
│   └── ProgressBar.svelte     — page X of Y progress
├── ResultsView.svelte         — download buttons, full preview
│   ├── DownloadButtons.svelte — DOCX + PDF generation & download
│   └── PageNavigator.svelte   — browse results by page
└── Footer.svelte              — privacy note
```

### Layout

- **Idle**: Centered upload zone with drag/drop. Privacy message in footer.
- **Processing**: Side-by-side split — original scan (left) with bounding box overlay, extracted text (right). Progress bar at top.
- **Complete**: Download buttons at top, same side-by-side browsable by page below.
- **Header**: App name, capability tier badge, language switcher (EN|RO).

### Svelte Stores

```typescript
// stores/app.ts
appState: 'idle' | 'loading-model' | 'processing' | 'complete'
engineTier: 'premium' | 'standard' | 'basic'

// stores/document.ts
pages: PageImage[]
ocrResults: OCRResult[]
currentPage: number
progress: { current: number; total: number }
```

## Output Generation

### DOCX (Layout-Preserving)

Uses Florence-2 bounding box data to reconstruct original layout:

1. **Column detection**: Group text regions by x-coordinate ranges. Multiple x-bands → DOCX section columns.
2. **Reading order**: Top-to-bottom within columns, left-to-right across columns.
3. **Spacing**: Map y-gaps between bounding boxes to paragraph spacing (small = same para, medium = new para, large = section break).
4. **Page breaks**: One DOCX section per original page with forced breaks.
5. **Text positioning**: Complex layouts use DOCX text frames (`<w:framePr>`) with absolute positioning from bbox coordinates.
6. **Font**: Noto Sans — open source, wide Unicode coverage (Latin, Cyrillic, Romanian diacritics, CJK).

### Searchable PDF

Overlays invisible text on original scanned images:

1. Embed original page image as the visible layer.
2. For each text region, place OCR'd text at exact bounding box coordinates as invisible (transparent) text.
3. Result: PDF looks like the original scan but text is selectable and searchable.

### Fidelity Expectations

| Aspect | Fidelity |
|--------|----------|
| Text content | High (limited by OCR accuracy) |
| Page breaks | Exact match |
| Column layout | Good (detected from bboxes) |
| Paragraph spacing | Approximate |
| Tables | Best-effort (bbox grid detection) |
| Original fonts/styling | Not preserved (Noto Sans throughout) |
| Images/graphics | Not extracted (text only) |

## Testing Strategy

### Layered Architecture

| Layer | Tool | What It Tests | GPU? | When |
|-------|------|---------------|------|------|
| Unit | Vitest + @testing-library/svelte | Components, stores, pure logic | No | Every commit |
| Integration | Vitest + MockEngine | Full pipeline with golden responses | No | Every commit |
| E2E | Playwright | User flows (upload → process → download) | No | Every PR |
| OCR Accuracy | Vitest + CER/WER metrics | Pre-recorded outputs vs ground truth | No | Every commit |
| Performance | Vitest bench | Inference speed, memory | Yes | Nightly |

### Engine Mocking

Tests use `MockEngine` implementing `OCREngine` interface. Returns deterministic pre-recorded responses.

### OCR Accuracy Metrics

- **CER** (Character Error Rate): target < 3% for clean printed text
- **WER** (Word Error Rate): target < 8% for clean printed text
- 20-50 fixture images with manually verified ground truth
- Pre-record real Florence-2 outputs as golden files
- Compare golden outputs vs ground truth (fast, no GPU)

### E2E with Playwright

- Chromium with WebGPU flags (`--enable-unsafe-webgpu`, `--enable-features=Vulkan`)
- Mock inference for routine tests
- Visual regression with `toHaveScreenshot()`

## Caching & Offline

- Models cached via **Cache API** (recommended over IndexedDB for large binaries)
- `navigator.storage.persist()` to prevent eviction
- App shell cached via Service Worker (PWA pattern)
- Fully offline after first model download
- Limitation: Safari mobile 50 MB storage limit may require Tesseract.js fallback on iOS

## Key Risks

| Risk | Mitigation |
|------|------------|
| Florence-2 OCR accuracy insufficient for complex docs | Tesseract.js fallback; accuracy benchmarks catch regressions early |
| Model download too large for some users (~340 MB) | Progressive loading with clear progress UI; Tesseract.js as lightweight alternative |
| WebGPU not available | Three-tier fallback; WASM works on 95%+ of browsers |
| DOCX layout reconstruction imperfect | Set clear expectations in UI; searchable PDF preserves exact original appearance |
| Safari mobile storage limits | Detect and default to Tesseract.js tier on iOS Safari |
