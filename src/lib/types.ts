export interface OCRRegion {
  text: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface OCRResult {
  text: string;
  regions: OCRRegion[];
}

export interface PageImage {
  dataUrl: string;
  width: number;
  height: number;
  pageNumber: number;
}

export type EngineTier = 'premium' | 'standard' | 'basic';

export type AppState = 'idle' | 'loading-model' | 'processing' | 'complete';

export interface OCREngine {
  initialize(onProgress?: (progress: number) => void): Promise<void>;
  processPage(image: PageImage): Promise<OCRResult>;
  dispose(): Promise<void>;
}
