import type { OCREngine, OCRResult, PageImage } from './types';
import type { PreprocessOptions } from './preprocessing/image-preprocessor';

export interface ProcessPipelineOptions {
  pageIndices?: number[];
  existingResults?: Array<OCRResult | null>;
  /** When set, images are preprocessed (adaptive threshold + upscale) before OCR. */
  preprocess?: PreprocessOptions | boolean;
  onPageStart?: (current: number, total: number, pageIndex: number) => void;
  onPageComplete?: (current: number, total: number, pageIndex: number, result: OCRResult) => void;
}

export async function processPipeline(
  engine: OCREngine,
  pages: PageImage[],
  onPageComplete?: (current: number, total: number, result: OCRResult) => void,
): Promise<OCRResult[]>;

export async function processPipeline(
  engine: OCREngine,
  pages: PageImage[],
  options?: ProcessPipelineOptions,
): Promise<Array<OCRResult | null>>;

export async function processPipeline(
  engine: OCREngine,
  pages: PageImage[],
  legacyOrOptions?: ((current: number, total: number, result: OCRResult) => void) | ProcessPipelineOptions,
): Promise<Array<OCRResult | null>> {
  const options: ProcessPipelineOptions = typeof legacyOrOptions === 'function'
    ? {
      onPageComplete: (current, total, _pageIndex, result) => legacyOrOptions(current, total, result),
    }
    : (legacyOrOptions ?? {});

  const pageIndices = options.pageIndices
    ? options.pageIndices.filter((index) => index >= 0 && index < pages.length)
    : pages.map((_, index) => index);

  const results: Array<OCRResult | null> = options.existingResults
    ? [...options.existingResults]
    : Array.from({ length: pages.length }, () => null);

  const total = pageIndices.length;
  let completed = 0;

  // Lazy-load preprocessor only when preprocessing is requested
  const preprocessEnabled = options.preprocess !== undefined && options.preprocess !== false;
  let preprocessFn: typeof import('./preprocessing/image-preprocessor').preprocessImage | null = null;
  let preprocessOpts: import('./preprocessing/image-preprocessor').PreprocessOptions | undefined;

  if (preprocessEnabled) {
    const mod = await import('./preprocessing/image-preprocessor');
    preprocessFn = mod.preprocessImage;
    preprocessOpts = typeof options.preprocess === 'object' ? options.preprocess : undefined;
  }

  for (const pageIndex of pageIndices) {
    options.onPageStart?.(completed + 1, total, pageIndex);

    let pageToProcess = pages[pageIndex];

    // Preprocess the image before OCR if enabled
    if (preprocessFn) {
      try {
        const preprocessed = await preprocessFn(
          pageToProcess.blob ?? pageToProcess.src,
          pageToProcess.width,
          pageToProcess.height,
          preprocessOpts,
        );
        pageToProcess = {
          ...pageToProcess,
          src: preprocessed.dataUrl,
          blob: preprocessed.blob,
          width: preprocessed.width,
          height: preprocessed.height,
        };
      } catch {
        // Fall back to original image if preprocessing fails
      }
    }

    const result = await engine.processPage(pageToProcess);
    results[pageIndex] = result;
    completed += 1;
    options.onPageComplete?.(completed, total, pageIndex, result);
  }

  return results;
}
