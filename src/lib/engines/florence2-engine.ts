import {
  Florence2ForConditionalGeneration,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
} from '@huggingface/transformers';
import type { OCREngine, OCRResult, OCRRegion, PageImage } from '../types';

const MODEL_ID = 'onnx-community/Florence-2-base-ft';

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

    const dtypeConfig = this.device === 'webgpu'
      ? { embed_tokens: 'fp16' as const, vision_encoder: 'fp16' as const, encoder_model: 'q4' as const, decoder_model_merged: 'q4' as const }
      : { embed_tokens: 'fp32' as const, vision_encoder: 'fp32' as const, encoder_model: 'q4' as const, decoder_model_merged: 'q4' as const };

    this.model = await Florence2ForConditionalGeneration.from_pretrained(MODEL_ID, {
      dtype: dtypeConfig,
      device: this.device,
    });
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

    const rawImage = await RawImage.fromURL(image.dataUrl);
    const visionInputs = await this.processor(rawImage);
    const task = '<OCR_WITH_REGION>';
    const prompts = this.processor.construct_prompts(task);
    const textInputs = this.tokenizer(prompts);

    const generatedIds = await this.model.generate({
      ...textInputs,
      ...visionInputs,
      max_new_tokens: 1024,
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
  }

  async dispose(): Promise<void> {
    this.model = null;
    this.processor = null;
    this.tokenizer = null;
  }

  private parseFlorence2Result(result: any): OCRResult {
    const ocrData = result['<OCR_WITH_REGION>'];
    if (!ocrData || !ocrData.labels) {
      return { text: '', regions: [] };
    }

    const regions: OCRRegion[] = [];
    const labels: string[] = ocrData.labels;
    const quadBoxes: number[] = ocrData.quad_boxes;

    for (let i = 0; i < labels.length; i++) {
      // quad_boxes has 8 values per region (4 x,y pairs for corners)
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
    return { text, regions };
  }
}
