import {
  AutoProcessor,
  AutoTokenizer,
  VisionEncoderDecoderModel,
  RawImage,
  env,
} from '@huggingface/transformers';
import type { OCREngine, OCRResult, PageImage } from '../types';
import { inferQuality } from '../quality-score';

const MODEL_ID = 'Xenova/donut-base-finetuned-cord-v2';

type DonutDtypeConfig = {
  encoder_model: 'fp16' | 'fp32' | 'q8';
  decoder_model_merged: 'fp16' | 'fp32' | 'q8';
};

export class DonutEngine implements OCREngine {
  private model: any = null;
  private processor: any = null;
  private tokenizer: any = null;
  private device: 'webgpu' | 'wasm';

  constructor(device: 'webgpu' | 'wasm' = 'webgpu') {
    this.device = device;
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(0);

    if (this.device === 'wasm') {
      const isolated = typeof globalThis !== 'undefined' && globalThis.crossOriginIsolated === true;
      const cores = globalThis.navigator?.hardwareConcurrency ?? 1;
      if (env.backends.onnx.wasm) {
        env.backends.onnx.wasm.numThreads = isolated ? Math.max(1, Math.min(4, cores)) : 1;
      }
    }

    const dtypeCandidates: DonutDtypeConfig[] = this.device === 'webgpu'
      ? [
        { encoder_model: 'fp16', decoder_model_merged: 'fp16' },
        { encoder_model: 'fp32', decoder_model_merged: 'fp32' },
      ]
      : [
        { encoder_model: 'q8', decoder_model_merged: 'q8' },
        { encoder_model: 'fp32', decoder_model_merged: 'fp32' },
      ];

    let lastError: unknown;
    for (const dtypeConfig of dtypeCandidates) {
      try {
        this.model = await VisionEncoderDecoderModel.from_pretrained(MODEL_ID, {
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
      throw lastError ?? new Error('Failed to initialize Donut model');
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
    const pixelValues = (await this.processor(rawImage)).pixel_values;

    // Donut task prompt for CORD dataset
    const taskPrompt = '<s_cord-v2>';
    const decoderInputIds = this.tokenizer(taskPrompt, {
      add_special_tokens: false,
      padding: true,
      truncation: true,
    }).input_ids;

    let generatedIds: any = null;
    try {
      generatedIds = await this.model.generate(pixelValues, {
        decoder_input_ids: decoderInputIds,
        max_new_tokens: 768,
      });

      const decoded = this.tokenizer.batch_decode(generatedIds, {
        skip_special_tokens: true,
      })[0];

      return this.parseDonutOutput(decoded, image.width, image.height);
    } finally {
      generatedIds?.dispose?.();
      pixelValues?.dispose?.();
    }
  }

  async dispose(): Promise<void> {
    await this.model?.dispose?.();
    await this.processor?.dispose?.();
    this.model = null;
    this.processor = null;
    this.tokenizer = null;
  }

  /**
   * Parse Donut output. The CORD model outputs structured JSON-like text
   * with field names and values. We extract all text values into a flat string.
   */
  parseDonutOutput(
    rawOutput: string,
    imageWidth: number,
    imageHeight: number,
  ): OCRResult {
    const textParts: string[] = [];

    // Try to extract text from Donut's XML-like structured output
    // Match only leaf-level fields: <s_field>value</s_field> where value has no nested tags
    const fieldPattern = /<s_([^>]+)>([^<]*)<\/s_\1>/g;
    let match: RegExpExecArray | null;
    let hasStructured = false;

    while ((match = fieldPattern.exec(rawOutput)) !== null) {
      hasStructured = true;
      const value = match[2].trim();
      if (value) {
        textParts.push(value);
      }
    }

    // Fallback: strip all XML-like tags and use remaining text
    if (!hasStructured) {
      const cleaned = rawOutput
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned) {
        textParts.push(cleaned);
      }
    }

    const text = textParts.join('\n');
    const quality = inferQuality(text, 'ocr');

    return {
      text,
      regions: text
        ? [{ text, bbox: [0, 0, imageWidth, imageHeight] }]
        : [],
      source: 'ocr',
      qualityScore: quality.qualityScore,
      qualityFlags: quality.qualityFlags,
    };
  }
}
