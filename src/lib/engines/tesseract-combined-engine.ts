import { createWorker } from 'tesseract.js';
import type { OCREngine, OCRResult, OCRRegion, PageImage } from '../types';
import { inferQuality } from '../quality-score';

const DEFAULT_PARAMS = {
  user_defined_dpi: '300',
  preserve_interword_spaces: '1',
};

export class TesseractCombinedEngine implements OCREngine {
  private worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  private langs: string;

  constructor(langs = 'eng+ron') {
    this.langs = langs;
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(0);
    this.worker = await createWorker(this.langs);
    await this.worker.setParameters({
      ...DEFAULT_PARAMS,
      tessedit_ocr_engine_mode: '2', // LSTM + Legacy combined
    });
    onProgress?.(1);
  }

  async processPage(image: PageImage): Promise<OCRResult> {
    if (!this.worker) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    const { data } = await this.worker.recognize(image.src, {
      rotateAuto: true,
    });

    const regions: OCRRegion[] = ((data as any).words ?? []).map((word: any) => ({
      text: word.text,
      bbox: [
        word.bbox.x0,
        word.bbox.y0,
        word.bbox.x1 - word.bbox.x0,
        word.bbox.y1 - word.bbox.y0,
      ] as [number, number, number, number],
    }));

    const quality = inferQuality(
      data.text,
      'ocr',
      typeof data.confidence === 'number' ? data.confidence / 100 : undefined,
    );

    return {
      text: data.text,
      regions,
      source: 'ocr',
      qualityScore: quality.qualityScore,
      qualityFlags: quality.qualityFlags,
    };
  }

  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
