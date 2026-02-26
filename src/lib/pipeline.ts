import type { OCREngine, OCRResult, PageImage } from './types';

export interface ProcessPipelineOptions {
  pageIndices?: number[];
  existingResults?: Array<OCRResult | null>;
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

  for (const pageIndex of pageIndices) {
    options.onPageStart?.(completed + 1, total, pageIndex);
    const result = await engine.processPage(pages[pageIndex]);
    results[pageIndex] = result;
    completed += 1;
    options.onPageComplete?.(completed, total, pageIndex, result);
  }

  return results;
}
