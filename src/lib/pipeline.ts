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
