# Premium OCR Findings (2026-02-27)

## Scope
This document captures the investigation and remediation for premium OCR reliability/quality in browser, including model availability checks as of **February 27, 2026**.

## Objectives
- Make premium mode complete reliably in real browser runs.
- Prioritize output quality over architecture purity.
- Verify current model availability on Hugging Face and remove dead assumptions.

## External Model Availability (HF)
Checks were executed with `hf models info`, `curl https://huggingface.co/api/models/...`, and HEAD requests to `.../resolve/main/config.json`.

### Current status
1. `onnx-community/Janus-Pro-1B-ONNX`: available/public (`200`).
2. `onnx-community/Florence-2-base-ft`: available/public (`200`).
3. `onnx-community/GOT-OCR-2.0-ONNX`: not publicly accessible now (`401`; `hf models info` not found).
4. `onnx-community/trocr-base-stage1-ONNX`: available/public, `transformers.js` tagged (candidate for future ensemble work).

### References
- https://huggingface.co/onnx-community/Janus-Pro-1B-ONNX
- https://huggingface.co/onnx-community/Florence-2-base-ft
- https://huggingface.co/onnx-community/GOT-OCR-2.0-ONNX
- https://huggingface.co/onnx-community/trocr-base-stage1-ONNX

## Root Cause Findings
### Premium instability (before remediation)
Premium (WebGPU Janus path) failed with runtime errors such as:
- `ReduceMean ... Failed to run JSEP kernel ... Unsupported data type: 1`
- session allocation failures (large buffer allocations)
- session release errors (`invalid session id`)

Observed behavior:
- `standard` (WASM Janus) was consistently more stable.
- cache quota/internal cache errors appeared frequently during model asset caching, increasing churn and retries.

## Implemented Changes
### 1) Premium execution path redefined for reliability
Premium now uses **Janus WASM** as default engine backend (quality-first, stable-first), not WebGPU.

- File: `src/lib/engines/index.ts`
- Effect: `premium` and `standard` both initialize Janus on WASM; premium differentiates via multipass quality pipeline.

### 2) Premium multipass quality pipeline
Added a premium-only post-pass in app orchestration:
1. Primary Janus OCR pass.
2. Janus retry on low-confidence pages with stronger preprocessing.
3. Tesseract rescue pass on remaining weak pages.
4. Per-page result selection using a rank function (quality + text-shape heuristics).

- File: `src/App.svelte`
- New controls:
  - `PREMIUM_JANUS_RETRY_THRESHOLD`
  - `PREMIUM_TESSERACT_RETRY_THRESHOLD`
  - `selectPreferredResult(...)` rank-based merge

### 3) Engine lifecycle hardening
Engine disposal failures are now non-fatal, so fallback/retry flow can continue even when ORT session teardown throws.

- File: `src/App.svelte`

### 4) Model enum and defaults aligned with live availability
Removed dependence on unavailable `got-ocr2` default assumption.

- File: `src/lib/engines/index.ts`
- File: `src/App.svelte`

### 5) Tier labeling clarified
UI tier labels/descriptions updated to match actual behavior:
- Premium: quality-first multipass OCR.
- Standard: stable Janus WASM OCR.

- File: `src/lib/i18n/en.json`
- File: `src/lib/i18n/ro.json`

### 6) Tests updated
Engine factory tests updated to reflect premium->WASM routing.

- File: `src/lib/engines/engine-factory.test.ts`

## Validation Summary
### Unit/build
- `vitest` targeted engine tests: pass.
- `vite build`: pass.

### Browser flow (Playwright CLI)
- `/?engine=premium&strictEngine=1&model=janus-pro-1b`:
  - completes successfully after remediation.
  - sample run reached `Quality 95%` on `tests/fixtures/live-ocr-sample.jpg`.

## Quality Notes vs ABBYY Target
The current state is a strong reliability improvement and quality uplift on the tested sample, but ABBYY-level parity requires broader evaluation and document-class tuning.

## Recommended Next Steps (Priority Order)
1. Build a benchmark corpus (invoices, contracts, scans, phone captures) with ground truth and track CER/WER/page-level fields.
2. Add document-type adaptive preprocessing profiles (photo invoice vs flat scan vs grayscale fax).
3. Add post-processing normalization (currency/date/entity correction, line reconstruction, table heuristics).
4. Add workerized orchestration for premium multipass (separate workers per pass to improve throughput and keep UI responsive).
5. Evaluate adding `trocr-base-stage1-ONNX` as an additional ensemble candidate for specific page classes.
6. Add regression gates in CI: fail when quality drops vs baseline across benchmark set.

## Research References
- Tesseract quality guidance: https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html
- Transformers.js WebGPU guide: https://huggingface.co/docs/transformers.js/main/en/guides/webgpu
- Transformers.js dtypes/quantization guide: https://huggingface.co/docs/transformers.js/main/en/guides/dtypes
