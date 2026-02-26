# E2E Testing Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the corresponding implementation plan.

**Goal:** Add Playwright e2e tests to diagnose and fix the blank page bug, then provide full coverage of the app's critical paths.

**Architecture:** Playwright with Chromium, running against Vite preview server. Tests cover smoke loading, file upload, OCR processing, results/downloads, and i18n. CI runs e2e after unit tests in the existing ci.yml workflow.

## Decisions

- **Framework:** Playwright (best Vite integration, CI-friendly, captures console errors)
- **Browser:** Chromium only (fast CI, sufficient coverage for a client-side app)
- **Test server:** Vite preview mode (`webServer` config in playwright.config.ts)
- **Fixtures:** Small PNG with known text in `tests/fixtures/`
- **OCR mocking:** For heavy model tests, mock engine initialization to avoid downloading models in CI

## Test Suite

1. **Smoke test** — page loads, header visible, upload zone visible, footer visible, no console errors
2. **Upload flow** — upload test image via file input, verify processing state appears
3. **OCR results** — verify results view shows extracted text after processing
4. **Downloads** — verify DOCX and PDF download buttons trigger blob downloads
5. **i18n** — verify language switcher toggles between EN and RO text

## Blank Page Investigation

The smoke test will capture browser console errors via `page.on('console')` and `page.on('pageerror')`. Most likely cause: eager static imports of `@huggingface/transformers` or `tesseract.js` crashing at module load time. Fix: convert to dynamic `import()` in the engine factory so heavy libraries load on-demand.

## CI Integration

Add Playwright install + test step to `.github/workflows/ci.yml` after unit tests, before the deploy job. Only deploy if both unit and e2e tests pass.
