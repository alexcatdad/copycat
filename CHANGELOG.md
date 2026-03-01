# Changelog

## 1.0.0 (2026-03-01)


### Features

* add accessible ProgressBar component ([f51fc91](https://github.com/alexcatdad/copycat/commit/f51fc91dbabcdf7d7acf1d017c550955487cf060))
* add engine factory for tier-based engine selection ([5b4a25e](https://github.com/alexcatdad/copycat/commit/5b4a25ede8efab7f0f271da6cfebf30f7a113559))
* add Florence2Engine with OCR_WITH_REGION support ([6573f8e](https://github.com/alexcatdad/copycat/commit/6573f8e9339d101509f572aa46b87d776a8b128e))
* add Header with tier badge and language switcher ([0cd654d](https://github.com/alexcatdad/copycat/commit/0cd654d3d4fbfb03eb0a1ca7575ad679dcba35c4))
* add i18n with English and Romanian locale files ([d392ed4](https://github.com/alexcatdad/copycat/commit/d392ed474f72135699a24872bf738c93ef419d05))
* add layout-preserving DOCX generator ([af7f8f6](https://github.com/alexcatdad/copycat/commit/af7f8f6ae2fc833a7a49510fbd5d1c70b1a83ae7))
* add live OCR benchmarking, quality reporting, and engine tuning ([b3f1331](https://github.com/alexcatdad/copycat/commit/b3f13318931794365acd05e041534e2a0a3cebc3))
* add mock engine mode via ?engine=mock query parameter ([91b9f17](https://github.com/alexcatdad/copycat/commit/91b9f17e94d82bbd8ebffe4abde0e7f5423f6542))
* add MockEngine for deterministic testing ([3a046f4](https://github.com/alexcatdad/copycat/commit/3a046f4c37aa37a30df07a030bc415fd2bfbaae3))
* add PDF page renderer and image file converter ([8604172](https://github.com/alexcatdad/copycat/commit/86041724749bf1d2a0487bdaf893111d857dfa4a))
* add ProcessingView with side-by-side preview and bbox overlay ([54a7e8a](https://github.com/alexcatdad/copycat/commit/54a7e8a81227ae36d63fdb981cbd32de26a57669))
* add ResultsView with download buttons and page navigation ([b70e5b4](https://github.com/alexcatdad/copycat/commit/b70e5b45e4b8e222a7902daca1e9eed6958d0b5e))
* add searchable PDF generator with invisible text overlay ([1d4326a](https://github.com/alexcatdad/copycat/commit/1d4326a3f3933986f1973350791ab465ab844d2f))
* add sequential OCR processing pipeline ([875f795](https://github.com/alexcatdad/copycat/commit/875f795f7fea3e577e67cc569ce0b4f42ef4d84c))
* add Svelte 5 reactive app store ([ca965d2](https://github.com/alexcatdad/copycat/commit/ca965d2735b4a3844c38101c233fa8f0ef3a78e9))
* add TesseractEngine as basic OCR fallback ([e182b0a](https://github.com/alexcatdad/copycat/commit/e182b0aa27c53f515e5cce6da8a46a724f3ee0b7))
* add UploadZone component with drag-and-drop ([8a648c5](https://github.com/alexcatdad/copycat/commit/8a648c57227360a1810d01650fb944914dd18f50))
* add WebGPU capability detection with three-tier fallback ([9e60c03](https://github.com/alexcatdad/copycat/commit/9e60c03087c9a73fe93ff9292dfa61f78e00af8b))
* define core types and OCREngine interface ([eaab553](https://github.com/alexcatdad/copycat/commit/eaab55344ffb5843f06d1eb47547b7a72f1641c0))
* scaffold Svelte + Vite + TypeScript project with dependencies ([e852805](https://github.com/alexcatdad/copycat/commit/e852805e6b1d574c61beea9690d3d6f344b6027a))
* stabilize premium OCR with quality-first multipass pipeline ([65b1302](https://github.com/alexcatdad/copycat/commit/65b1302f070cc1463f4e30b92d546e90b1b3a576))
* upgrade copycat with hybrid pdf pipeline, history, smart retry, and polished ui ([d52da4d](https://github.com/alexcatdad/copycat/commit/d52da4d67724a74f717ced47905d1a5e90218fdd))
* wire up App shell with full OCR pipeline flow ([a60d7ed](https://github.com/alexcatdad/copycat/commit/a60d7ed317770a51bb54b6ce918f0023b7e1b928))


### Bug Fixes

* add error handling with engine fallback and error UI ([de4abf8](https://github.com/alexcatdad/copycat/commit/de4abf8f44b63d8d7cdca4cef2dfe462905d9b11))
* harden searchable PDF export against invalid OCR bboxes ([c366f3c](https://github.com/alexcatdad/copycat/commit/c366f3c2e62c0ebaade668f06a2c4da7483588d9))
* resolve blank page with synchronous i18n and lazy engine imports ([15da605](https://github.com/alexcatdad/copycat/commit/15da6055b148c8753fe141d41f74e9d6accc52a1))
* resolve svelte-check type errors across 5 files ([d65edf9](https://github.com/alexcatdad/copycat/commit/d65edf9a580c98e4452eb482a5e00a9630ee0df9))
* use fileURLToPath for ESM __dirname in upload test ([425a4af](https://github.com/alexcatdad/copycat/commit/425a4afd3fde55c7c69e95c8e4a96a8397cf8ccc))
