import { createWorker } from 'tesseract.js';
import { pipeline, env } from '@huggingface/transformers';
import type { OCREngine, OCRResult, OCRRegion, PageImage } from '../types';
import { inferQuality } from '../quality-score';
import { blobToDataUrl } from '../utils/blob';

const TROCR_MODEL_ID = 'Xenova/trocr-small-printed';
const LINE_PADDING = 4; // pixels of padding around detected lines

interface DetectedLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: Array<{
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    confidence: number;
  }>;
  confidence: number;
}

export class TrOcrHybridEngine implements OCREngine {
  private tesseractWorker: Awaited<ReturnType<typeof createWorker>> | null = null;
  private trOcrPipeline: any = null;
  private readonly device: 'webgpu' | 'wasm';
  private langs: string;

  constructor(device: 'webgpu' | 'wasm' = 'webgpu', langs = 'eng') {
    this.device = device;
    this.langs = langs;
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(0);

    // Configure WASM threads for TrOCR if using WASM backend
    if (this.device === 'wasm') {
      const isolated = typeof globalThis !== 'undefined' && globalThis.crossOriginIsolated === true;
      const cores = globalThis.navigator?.hardwareConcurrency ?? 1;
      if (env.backends.onnx.wasm) {
        env.backends.onnx.wasm.numThreads = isolated ? Math.max(1, Math.min(4, cores)) : 1;
      }
    }

    // Initialize Tesseract worker for text detection
    this.tesseractWorker = await createWorker(this.langs);
    await this.tesseractWorker.setParameters({
      user_defined_dpi: '300',
      preserve_interword_spaces: '1',
    });
    onProgress?.(0.4);

    // Initialize TrOCR pipeline for text recognition
    this.trOcrPipeline = await pipeline('image-to-text', TROCR_MODEL_ID, {
      device: this.device,
      dtype: this.device === 'webgpu' ? 'fp32' : 'q8',
    });
    onProgress?.(1);
  }

  async processPage(image: PageImage): Promise<OCRResult> {
    if (!this.tesseractWorker || !this.trOcrPipeline) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    // Step 1: Use Tesseract for text line detection
    const detectedLines = await this.detectLines(image);

    if (detectedLines.length === 0) {
      const quality = inferQuality('', 'ocr');
      return {
        text: '',
        regions: [],
        source: 'ocr',
        qualityScore: quality.qualityScore,
        qualityFlags: quality.qualityFlags,
      };
    }

    // Step 2: For each detected line, crop and run TrOCR for recognition
    const regions: OCRRegion[] = [];
    const textParts: string[] = [];

    for (const line of detectedLines) {
      const lineX = line.bbox.x0;
      const lineY = line.bbox.y0;
      const lineW = line.bbox.x1 - line.bbox.x0;
      const lineH = line.bbox.y1 - line.bbox.y0;

      if (lineW <= 0 || lineH <= 0) continue;

      let recognizedText: string;
      try {
        const croppedDataUrl = await this.cropImageRegion(
          image,
          lineX,
          lineY,
          lineW,
          lineH,
        );
        const trOcrResult = await this.trOcrPipeline(croppedDataUrl, {
          max_new_tokens: 256,
        });
        recognizedText = trOcrResult?.[0]?.generated_text?.trim() ?? '';
      } catch {
        // Fall back to Tesseract's text for this line
        recognizedText = line.text;
      }

      // Use TrOCR text if it produced output, otherwise fall back to Tesseract
      const finalText = recognizedText || line.text;

      if (finalText.trim()) {
        // Create word-level regions using Tesseract bounding boxes
        // but line-level text from TrOCR
        if (line.words.length > 1) {
          // Distribute TrOCR text across Tesseract word bounding boxes
          const trOcrWords = finalText.split(/\s+/).filter(Boolean);
          if (trOcrWords.length === line.words.length) {
            // Word counts match - map TrOCR words to Tesseract bboxes
            for (let i = 0; i < line.words.length; i++) {
              const word = line.words[i];
              regions.push({
                text: trOcrWords[i],
                bbox: [
                  word.bbox.x0,
                  word.bbox.y0,
                  word.bbox.x1 - word.bbox.x0,
                  word.bbox.y1 - word.bbox.y0,
                ],
                confidence: word.confidence / 100,
              });
            }
          } else {
            // Word counts differ - use line-level bbox with full text
            regions.push({
              text: finalText,
              bbox: [lineX, lineY, lineW, lineH],
              confidence: line.confidence / 100,
            });
          }
        } else {
          regions.push({
            text: finalText,
            bbox: [lineX, lineY, lineW, lineH],
            confidence: line.confidence / 100,
          });
        }
        textParts.push(finalText);
      }
    }

    const fullText = textParts.join('\n');
    const quality = inferQuality(fullText, 'ocr', undefined, regions);

    return {
      text: fullText,
      regions,
      source: 'ocr',
      qualityScore: quality.qualityScore,
      qualityFlags: quality.qualityFlags,
    };
  }

  async dispose(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
    if (this.trOcrPipeline) {
      await this.trOcrPipeline.dispose?.();
      this.trOcrPipeline = null;
    }
  }

  private async detectLines(image: PageImage): Promise<DetectedLine[]> {
    const { data } = await this.tesseractWorker!.recognize(image.src, {
      rotateAuto: true,
    });

    const lines: DetectedLine[] = [];

    // Tesseract returns: blocks → paragraphs → lines → words
    const blocks = (data as any).blocks ?? [];
    for (const block of blocks) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          const words = (line.words ?? []).map((w: any) => ({
            text: w.text,
            bbox: w.bbox,
            confidence: w.confidence,
          }));

          let lineText: string;
          if (words.length === 0) {
            if (!line.text?.trim() && !line.bbox) continue;
            lineText = line.text ?? '';
          } else {
            lineText = words.map((w: any) => w.text).join(' ');
          }
          if (!lineText.trim()) continue;

          lines.push({
            text: lineText,
            bbox: line.bbox,
            words,
            confidence: line.confidence ?? 0,
          });
        }
      }
    }

    return lines;
  }

  private async cropImageRegion(
    image: PageImage,
    x: number,
    y: number,
    w: number,
    h: number,
  ): Promise<string> {
    // Apply padding
    const px = Math.max(0, x - LINE_PADDING);
    const py = Math.max(0, y - LINE_PADDING);
    const pw = Math.min(image.width - px, w + LINE_PADDING * 2);
    const ph = Math.min(image.height - py, h + LINE_PADDING * 2);

    // Load the source image
    const blob = image.blob ?? await (await fetch(image.src)).blob();
    const bitmap = await createImageBitmap(blob);

    // Create canvas and crop
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(pw, ph);
      ctx = canvas.getContext('2d')!;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = pw;
      canvas.height = ph;
      ctx = canvas.getContext('2d')!;
    }

    ctx.drawImage(bitmap, px, py, pw, ph, 0, 0, pw, ph);
    bitmap.close();

    // Convert to data URL
    if (canvas instanceof OffscreenCanvas) {
      const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
      return await blobToDataUrl(croppedBlob);
    }
    return canvas.toDataURL('image/png');
  }

}
