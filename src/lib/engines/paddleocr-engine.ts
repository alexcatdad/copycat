import type { OCREngine, OCRResult, OCRRegion, PageImage } from '../types';
import { inferQuality } from '../quality-score';

export class PaddleOcrEngine implements OCREngine {
  private ocr: any = null;
  private device: 'webgpu' | 'wasm';

  constructor(device: 'webgpu' | 'wasm' = 'wasm') {
    this.device = device;
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(0);

    // Dynamic import to handle the optional dependency
    // Use variable module names to prevent Vite from statically analyzing these optional imports
    const primaryPkg = '@aspect-build/aspect-ocr-browser';
    const fallbackPkg = '@gutenye/ocr-browser';
    const { OCRClient } = await import(/* @vite-ignore */ primaryPkg).catch(async () => {
      return import(/* @vite-ignore */ fallbackPkg);
    }).catch(() => {
      throw new Error(
        'PaddleOCR requires @gutenye/ocr-browser. Install with: npm install @gutenye/ocr-browser',
      );
    });

    onProgress?.(0.3);

    this.ocr = new OCRClient();
    await this.ocr.init();

    onProgress?.(1);
  }

  async processPage(image: PageImage): Promise<OCRResult> {
    if (!this.ocr) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    // Convert image source to format PaddleOCR expects
    const imageSource = image.blob ?? image.src;
    const result = await this.ocr.detect(imageSource);

    return this.parseResult(result, image.width, image.height);
  }

  async dispose(): Promise<void> {
    if (this.ocr) {
      await this.ocr.dispose?.();
      this.ocr = null;
    }
  }

  private parseResult(
    result: any,
    imageWidth: number,
    imageHeight: number,
  ): OCRResult {
    const regions: OCRRegion[] = [];
    const textParts: string[] = [];

    if (Array.isArray(result)) {
      for (const item of result) {
        const text = (item.text ?? item.value ?? '').trim();
        if (!text) continue;

        const box = item.box ?? item.bbox ?? item.points;
        let bbox: [number, number, number, number];

        if (Array.isArray(box) && box.length >= 4) {
          if (Array.isArray(box[0])) {
            // Polygon format: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            const xs = box.map((p: number[]) => p[0]);
            const ys = box.map((p: number[]) => p[1]);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            bbox = [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY];
          } else {
            // [x, y, width, height] format
            bbox = [box[0], box[1], box[2], box[3]];
          }
        } else {
          bbox = [0, 0, imageWidth, imageHeight];
        }

        regions.push({
          text,
          bbox,
          confidence: item.confidence ?? item.score,
        });
        textParts.push(text);
      }
    } else if (typeof result === 'string') {
      textParts.push(result);
      if (result.trim()) {
        regions.push({
          text: result.trim(),
          bbox: [0, 0, imageWidth, imageHeight],
        });
      }
    }

    const text = textParts.join('\n');
    const quality = inferQuality(text, 'ocr');
    return {
      text,
      regions,
      source: 'ocr',
      qualityScore: quality.qualityScore,
      qualityFlags: quality.qualityFlags,
    };
  }
}
