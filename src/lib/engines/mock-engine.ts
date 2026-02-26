import type { OCREngine, OCRResult, PageImage } from '../types';

const DEFAULT_RESULT: OCRResult = {
  text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  regions: [
    { text: 'Lorem ipsum dolor sit amet,', bbox: [50, 50, 400, 30] },
    { text: 'consectetur adipiscing elit.', bbox: [50, 90, 380, 30] },
  ],
};

export class MockEngine implements OCREngine {
  private responses: OCRResult[];
  private callIndex = 0;

  constructor(responses?: OCRResult[]) {
    this.responses = responses ?? [DEFAULT_RESULT];
  }

  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(1);
  }

  async processPage(_image: PageImage): Promise<OCRResult> {
    const result = this.responses[this.callIndex % this.responses.length];
    this.callIndex++;
    return result;
  }

  async dispose(): Promise<void> {}
}
