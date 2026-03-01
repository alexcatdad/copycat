import { AutoProcessor, MultiModalityCausalLM, env } from '@huggingface/transformers';
import type { OCREngine, OCRResult, PageImage } from '../types';
import { inferQuality } from '../quality-score';

const MODEL_ID = 'onnx-community/Janus-Pro-1B-ONNX';
const OCR_PROMPT = '<image_placeholder>\nExtract all visible text from this document. Return plain text only.';

type JanusDtype = 'q4f16' | 'q4' | 'q8' | 'fp16' | 'fp32';

export class JanusOcrEngine implements OCREngine {
  private model: any = null;
  private processor: any = null;
  private readonly device: 'webgpu' | 'wasm';
  private activeDtype: JanusDtype | null = null;

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

    // Avoid q4/webgpu runtime incompatibilities and fp16-first variants on some setups.
    const dtypeCandidates: JanusDtype[] = this.device === 'webgpu'
      ? ['q8', 'fp32']
      : ['q8', 'q4', 'fp32'];

    let lastError: unknown;
    for (const dtype of dtypeCandidates) {
      try {
        this.model = await MultiModalityCausalLM.from_pretrained(MODEL_ID, {
          device: this.device,
          dtype,
        });
        this.activeDtype = dtype;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!this.model) {
      throw lastError ?? new Error('Failed to initialize Janus-Pro-1B model');
    }

    onProgress?.(0.6);

    this.processor = await AutoProcessor.from_pretrained(MODEL_ID);
    onProgress?.(1);
  }

  async processPage(image: PageImage): Promise<OCRResult> {
    if (!this.model || !this.processor) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    const conversation = [{
      role: '<|User|>',
      content: OCR_PROMPT,
      images: [image.src],
    }];

    const baseInputs = await this.processor(conversation);
    const inputs = this.normalizeInputs(baseInputs);

    let outputs: any;
    try {
      outputs = await this.model.generate({
        ...inputs,
        max_new_tokens: 768,
        do_sample: false,
      });
    } catch (error) {
      if (this.activeDtype !== 'fp32' && this.shouldRetryWithFp32(error)) {
        await this.reloadModel('fp32');
        outputs = await this.model.generate({
          ...inputs,
          max_new_tokens: 768,
          do_sample: false,
        });
      } else {
        throw error;
      }
    }

    const inputTokenCount = inputs.input_ids?.dims?.at?.(-1) ?? 0;
    const newTokens = outputs.slice(null, [inputTokenCount, null]);
    const decoded = this.processor.batch_decode(newTokens, { skip_special_tokens: true });
    const text = this.normalizeText(decoded?.[0] ?? '');

    const quality = inferQuality(text, 'ocr');
    return {
      text,
      regions: text
        ? [{
          text,
          bbox: [0, 0, image.width, image.height],
        }]
        : [],
      source: 'ocr',
      qualityScore: quality.qualityScore,
      qualityFlags: quality.qualityFlags,
    };
  }

  async dispose(): Promise<void> {
    await this.model?.dispose?.();
    await this.processor?.dispose?.();
    this.model = null;
    this.processor = null;
    this.activeDtype = null;
  }

  private normalizeText(value: string): string {
    return value
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private normalizeInputs(inputs: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = { ...inputs };
    for (const [key, value] of Object.entries(inputs)) {
      if (
        value
        && typeof value === 'object'
        && value.type === 'float16'
        && typeof value.to === 'function'
      ) {
        normalized[key] = value.to('float32');
      }
    }
    return normalized;
  }

  private isTypeMismatch(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Unexpected input data type')
      && message.includes('tensor(float16)')
      && (message.includes('tensor(float)') || message.includes('tensor(float32)'));
  }

  private isWebGpuDtypeKernelFailure(error: unknown): boolean {
    if (this.device !== 'webgpu') {
      return false;
    }

    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Unsupported data type')
      || (
        message.includes('Failed to run JSEP kernel')
        && message.includes('ReduceMean')
      );
  }

  private shouldRetryWithFp32(error: unknown): boolean {
    return this.isTypeMismatch(error) || this.isWebGpuDtypeKernelFailure(error);
  }

  private async reloadModel(dtype: JanusDtype): Promise<void> {
    await this.model?.dispose?.();
    this.model = await MultiModalityCausalLM.from_pretrained(MODEL_ID, {
      device: this.device,
      dtype,
    });
    this.activeDtype = dtype;
  }
}
