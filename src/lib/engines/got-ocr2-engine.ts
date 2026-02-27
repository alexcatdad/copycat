import {
  AutoModel,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
} from '@huggingface/transformers';
import type { OCREngine, OCRResult, OCRRegion, PageImage } from '../types';
import { inferQuality } from '../quality-score';

const MODEL_ID = 'onnx-community/GOT-OCR-2.0-ONNX';

type GotOcrDtypeConfig = {
  encoder_model: 'fp16' | 'fp32' | 'q8' | 'q4';
  decoder_model_merged: 'fp16' | 'fp32' | 'q8' | 'q4';
};

export class GotOcr2Engine implements OCREngine {
  private model: any = null;
  private processor: any = null;
  private tokenizer: any = null;
  private device: 'webgpu' | 'wasm';

  constructor(device: 'webgpu' | 'wasm' = 'webgpu') {
    this.device = device;
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(0);

    const dtypeCandidates: GotOcrDtypeConfig[] = this.device === 'webgpu'
      ? [
        { encoder_model: 'fp16', decoder_model_merged: 'q8' },
        { encoder_model: 'fp16', decoder_model_merged: 'q4' },
      ]
      : [
        { encoder_model: 'q8', decoder_model_merged: 'q8' },
        { encoder_model: 'q4', decoder_model_merged: 'q4' },
      ];

    let lastError: unknown;
    for (const dtypeConfig of dtypeCandidates) {
      try {
        this.model = await AutoModel.from_pretrained(MODEL_ID, {
          dtype: dtypeConfig,
          device: this.device,
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!this.model) {
      throw lastError ?? new Error('Failed to initialize GOT-OCR-2.0 model');
    }

    onProgress?.(0.5);

    this.processor = await AutoProcessor.from_pretrained(MODEL_ID);
    onProgress?.(0.75);

    this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
    onProgress?.(1);
  }

  async processPage(image: PageImage): Promise<OCRResult> {
    if (!this.model || !this.processor || !this.tokenizer) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    const rawImage = await RawImage.fromURL(image.src);
    const inputs = await this.processor(rawImage);
    const promptText = '<ocr_with_region>';

    const tokenized = this.tokenizer(promptText, {
      return_tensors: 'pt',
      padding: true,
    });

    const generatedIds = await this.model.generate({
      ...tokenized,
      ...inputs,
      max_new_tokens: 4096,
    });

    const generatedText = this.tokenizer.batch_decode(generatedIds, {
      skip_special_tokens: false,
    })[0];

    return this.parseGotOcr2Result(generatedText, image.width, image.height);
  }

  async dispose(): Promise<void> {
    this.model = null;
    this.processor = null;
    this.tokenizer = null;
  }

  /**
   * Parse GOT-OCR-2.0 output which uses a structured format with
   * bounding box coordinates normalized to 0-1000 range.
   *
   * Expected format patterns:
   *   <ref>text</ref><box>[[x1,y1,x2,y2]]</box>
   *   or plain text output without box annotations
   */
  parseGotOcr2Result(
    rawOutput: string,
    imageWidth: number,
    imageHeight: number,
  ): OCRResult {
    const regions: OCRRegion[] = [];
    const textParts: string[] = [];

    // Match <ref>text</ref><box>[[x1,y1,x2,y2]]</box> patterns
    const regionPattern = /<ref>(.*?)<\/ref>\s*<box>\[\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]\]<\/box>/g;
    let match: RegExpExecArray | null;
    let hasStructuredOutput = false;

    while ((match = regionPattern.exec(rawOutput)) !== null) {
      hasStructuredOutput = true;
      const text = match[1].trim();
      if (!text) continue;

      // GOT-OCR-2.0 coordinates are normalized to 0-1000
      const nx1 = parseInt(match[2], 10);
      const ny1 = parseInt(match[3], 10);
      const nx2 = parseInt(match[4], 10);
      const ny2 = parseInt(match[5], 10);

      // Convert from normalized 0-1000 to pixel coordinates
      const x = (nx1 / 1000) * imageWidth;
      const y = (ny1 / 1000) * imageHeight;
      const w = ((nx2 - nx1) / 1000) * imageWidth;
      const h = ((ny2 - ny1) / 1000) * imageHeight;

      if (w > 0 && h > 0) {
        regions.push({ text, bbox: [x, y, w, h] });
        textParts.push(text);
      }
    }

    // Fallback: if no structured regions found, extract plain text
    if (!hasStructuredOutput) {
      const cleaned = rawOutput
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleaned) {
        textParts.push(cleaned);
        // Place as a single region covering the full page
        regions.push({
          text: cleaned,
          bbox: [0, 0, imageWidth, imageHeight],
        });
      }
    }

    const text = textParts.join(' ');
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
