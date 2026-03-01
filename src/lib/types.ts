export interface OCRRegion {
  text: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
  confidence?: number;
}

export type OCRSource = 'ocr' | 'pdf-text';

export interface OCRResult {
  text: string;
  regions: OCRRegion[];
  source: OCRSource;
  qualityScore: number;
  qualityFlags: string[];
}

export type PageSourceKind = 'image' | 'scanned' | 'pdf-text';

export interface PageImage {
  id: string;
  src: string;
  blob: Blob;
  width: number;
  height: number;
  pageNumber: number;
  sourceKind: PageSourceKind;
}

export interface PdfPageDescriptor {
  pageNumber: number;
  sourceKind: PageSourceKind;
  hasNativeText: boolean;
  nativeResult: OCRResult | null;
}

export type EngineTier = 'premium' | 'standard' | 'basic';

export type AppState = 'idle' | 'loading-model' | 'processing' | 'complete' | 'error';

export interface ProcessProgress {
  current: number;
  total: number;
}

export interface ProcessingJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceName: string;
  engineTier: EngineTier;
  pageCount: number;
  averageQuality: number;
  pages: PageImage[];
  results: OCRResult[];
  originalPdfBytes?: Uint8Array;
  pageDescriptors?: PdfPageDescriptor[];
}

export interface JobRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceName: string;
  engineTier: EngineTier;
  pageCount: number;
  averageQuality: number;
  expiresAt: string;
  pages: PageImage[];
  results: OCRResult[];
  originalPdfBytes?: Uint8Array;
  pageDescriptors?: PdfPageDescriptor[];
  artifacts?: {
    pdf?: Blob;
    docx?: Blob;
  };
}

export interface OCREngine {
  initialize(onProgress?: (progress: number) => void): Promise<void>;
  processPage(image: PageImage): Promise<OCRResult>;
  dispose(): Promise<void>;
}
