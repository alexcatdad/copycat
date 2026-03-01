import {
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  env,
} from '@huggingface/transformers';
import type { OCREngine, OCRResult, OCRRegion, PageImage } from '../types';
import { inferQuality } from '../quality-score';

const MODEL_ID = 'onnx-community/Florence-2-base-ft';

type FlorenceDtypeConfig = {
  embed_tokens: 'fp16' | 'fp32';
  vision_encoder: 'fp16' | 'fp32';
  encoder_model: 'q8' | 'q4';
  decoder_model_merged: 'q8' | 'q4';
};

export class Florence2Engine implements OCREngine {
  private model: any = null;
  private processor: any = null;
  private tokenizer: any = null;
  private device: 'webgpu' | 'wasm';

  constructor(device: 'webgpu' | 'wasm' = 'webgpu') {
    this.device = device;
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(0);

    // Configure WASM thread count for multi-threaded inference
    if (this.device === 'wasm') {
      const isolated = typeof globalThis !== 'undefined' && globalThis.crossOriginIsolated === true;
      const cores = globalThis.navigator?.hardwareConcurrency ?? 1;
      if (env.backends.onnx.wasm) {
        env.backends.onnx.wasm.numThreads = isolated ? Math.max(1, Math.min(4, cores)) : 1;
      }
    }

    const dtypeCandidates: FlorenceDtypeConfig[] = this.device === 'webgpu'
      ? [
        { embed_tokens: 'fp16', vision_encoder: 'fp16', encoder_model: 'q8', decoder_model_merged: 'q8' },
        { embed_tokens: 'fp16', vision_encoder: 'fp16', encoder_model: 'q4', decoder_model_merged: 'q4' },
      ]
      : [
        { embed_tokens: 'fp32', vision_encoder: 'fp32', encoder_model: 'q8', decoder_model_merged: 'q8' },
        { embed_tokens: 'fp32', vision_encoder: 'fp32', encoder_model: 'q4', decoder_model_merged: 'q4' },
      ];

    let lastError: unknown;
    for (const dtypeConfig of dtypeCandidates) {
      try {
        this.model = await Florence2ForConditionalGeneration.from_pretrained(MODEL_ID, {
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
      throw lastError ?? new Error('Failed to initialize Florence-2 model');
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

    let generatedIds: any = null;
    let visionInputs: any = null;
    try {
      const rawImage = await RawImage.fromURL(image.src);
      visionInputs = await this.processor(rawImage);
      const task = '<OCR_WITH_REGION>';
      const prompts = this.processor.construct_prompts(task);
      const textInputs = this.tokenizer(prompts);

      generatedIds = await this.model.generate({
        ...textInputs,
        ...visionInputs,
        max_new_tokens: 4096,
      });

      const generatedText = this.tokenizer.batch_decode(generatedIds, {
        skip_special_tokens: false,
      })[0];

      const result = this.processor.post_process_generation(
        generatedText,
        task,
        rawImage.size,
      );

      return this.parseFlorence2Result(result);
    } finally {
      // Dispose intermediate GPU tensors to prevent memory leaks
      generatedIds?.dispose?.();
      visionInputs?.pixel_values?.dispose?.();
    }
  }

  async dispose(): Promise<void> {
    await this.model?.dispose?.();
    await this.processor?.dispose?.();
    this.model = null;
    this.processor = null;
    this.tokenizer = null;
  }

  private parseFlorence2Result(result: any): OCRResult {
    const ocrData = result['<OCR_WITH_REGION>'];
    if (!ocrData || !ocrData.labels) {
      const quality = inferQuality('', 'ocr');
      return {
        text: '',
        regions: [],
        source: 'ocr',
        qualityScore: quality.qualityScore,
        qualityFlags: quality.qualityFlags,
      };
    }

    const regions: OCRRegion[] = [];
    const labels: string[] = ocrData.labels;
    const quadBoxes: number[] = ocrData.quad_boxes;

    for (let i = 0; i < labels.length; i++) {
      const offset = i * 8;
      if (offset + 7 >= quadBoxes.length) break;

      const x1 = quadBoxes[offset];
      const y1 = quadBoxes[offset + 1];
      const x3 = quadBoxes[offset + 4];
      const y3 = quadBoxes[offset + 5];

      regions.push({
        text: labels[i],
        bbox: [
          Math.min(x1, x3),
          Math.min(y1, y3),
          Math.abs(x3 - x1),
          Math.abs(y3 - y1),
        ],
      });
    }

    const text = labels.join(' ');
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
