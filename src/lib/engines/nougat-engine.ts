import {
  AutoProcessor,
  AutoTokenizer,
  VisionEncoderDecoderModel,
  RawImage,
  env,
} from '@huggingface/transformers';
import type { OCREngine, OCRResult, PageImage } from '../types';
import { inferQuality } from '../quality-score';

const MODEL_ID = 'Xenova/nougat-small';

type NougatDtypeConfig = {
  encoder_model: 'fp16' | 'fp32' | 'q8';
  decoder_model_merged: 'fp16' | 'fp32' | 'q8';
};

export class NougatEngine implements OCREngine {
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

    const dtypeCandidates: NougatDtypeConfig[] = this.device === 'webgpu'
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
      throw lastError ?? new Error('Failed to initialize Nougat model');
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

    // Nougat uses no task prompt — generate directly from the image
    const decoderInputIds = this.tokenizer('', {
      add_special_tokens: true,
      padding: true,
      truncation: true,
    }).input_ids;

    let generatedIds: any = null;
    try {
      generatedIds = await this.model.generate(pixelValues, {
        decoder_input_ids: decoderInputIds,
        min_length: 1,
        max_new_tokens: 4096,
        bad_words_ids: [[this.tokenizer.unk_token_id]],
      });

      const decoded = this.tokenizer.batch_decode(generatedIds, {
        skip_special_tokens: true,
      })[0];

      return this.parseNougatOutput(decoded, image.width, image.height);
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

  parseNougatOutput(
    rawOutput: string,
    imageWidth: number,
    imageHeight: number,
  ): OCRResult {
    // Strip Markdown formatting to get plain text
    const text = rawOutput
      .replace(/^#+\s*/gm, '')                  // strip header markers
      .replace(/\*\*([^*]+)\*\*/g, '$1')         // strip bold
      .replace(/\*([^*]+)\*/g, '$1')              // strip italic
      .replace(/\$([^$]+)\$/g, '$1')              // strip inline LaTeX delimiters
      .replace(/\\\[[\s\S]*?\\\]/g, '')           // remove display LaTeX blocks
      .replace(/\n{3,}/g, '\n\n')                 // collapse excessive newlines
      .trim();

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
