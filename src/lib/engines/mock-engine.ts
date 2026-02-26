import type { OCREngine, OCRRegion, OCRResult, PageImage } from '../types';
import { inferQuality } from '../quality-score';

function withQuality(result: Omit<OCRResult, 'source' | 'qualityScore' | 'qualityFlags'>): OCRResult {
  const quality = inferQuality(result.text, 'ocr', 0.9);
  return {
    ...result,
    source: 'ocr',
    qualityScore: quality.qualityScore,
    qualityFlags: quality.qualityFlags,
  };
}

const DEFAULT_RESULT: OCRResult = withQuality({
  text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  regions: [
    { text: 'Lorem ipsum dolor sit amet,', bbox: [50, 50, 400, 30] },
    { text: 'consectetur adipiscing elit.', bbox: [50, 90, 380, 30] },
  ],
});

const OCR_COMPARISON_LINES = [
  'ACME Supplies, Inc.',
  'Invoice #4821',
  'Bill To: Northwind Logistics',
  'Item A4 Paper (5 boxes) x 3 @ $89.50 = $268.50',
  'Item USB-C Dock x 2 @ $149.00 = $298.00',
  'Subtotal: $566.50',
  'Tax (8.75%): $49.57',
  'Total due: $616.07',
  'Payment due date: 2026-03-01',
  'Notes: Deliver before 5pm. Leave at loading dock B.',
] as const;

export const OCR_COMPARISON_GROUND_TRUTH = OCR_COMPARISON_LINES.join('\n');

export const OCR_COMPARISON_PROFILES = ['premium', 'standard', 'basic'] as const;
export type OCRComparisonProfile = typeof OCR_COMPARISON_PROFILES[number];
export type MockProfile = 'default' | OCRComparisonProfile | 'malformed';

export interface MockEngineOptions {
  profile?: MockProfile;
  responses?: OCRResult[];
}

function createLineRegions(lines: readonly string[]): OCRRegion[] {
  return lines.map((line, index) => ({
    text: line,
    bbox: [48, 48 + index * 36, 500, 24],
  }));
}

function buildResult(lines: readonly string[]): OCRResult {
  return withQuality({
    text: lines.join('\n'),
    regions: createLineRegions(lines),
  });
}

const COMPARISON_RESULTS: Record<OCRComparisonProfile, OCRResult> = {
  premium: buildResult(OCR_COMPARISON_LINES),
  standard: buildResult([
    'ACME Supplies, Inc.',
    'Invoice #4821',
    'Bill To: Northwind Logistics',
    'Item A4 Paper (5 boxes) x 3 @ $89.50 = $268.50',
    'Item USB-C Dock x 2 @ $149.00 = $298.00',
    'Subtotal: $566.50',
    'Tax (8.75%): $49.57',
    'Total due: $616.70',
    'Payment due date: 2026-03-01',
    'Notes: Deliver before 5pm. Leave at loading dock B.',
  ]),
  basic: buildResult([
    'ACME Suppiies Inc',
    'lnvoice #482l',
    'BiII To: Northwind Logistics',
    'ltem A4 Paper (5 boxes) x 3 @ $89.50 = $268.50',
    'ltem USB-C Dock x 2 @ $149.00 = $298.00',
    'SubtotaI: $566.50',
    'Tax (8.75%): $49.57',
    'TotaI due: $616.70',
    'Payment due date: 2026-03-0l',
    'Notes: Deiiver before 5prn. Leave at loading dock B',
  ]),
};

const MALFORMED_RESULT: OCRResult = withQuality({
  text: 'Result with malformed regions for PDF export resilience tests.',
  regions: [
    { text: 'Invalid NaN height', bbox: [10, 20, 200, Number.NaN] },
    { text: 'Invalid zero width', bbox: [20, 60, 0, 22] },
    { text: 'Invalid infinite y', bbox: [25, Number.POSITIVE_INFINITY, 160, 20] },
    { text: 'Valid anchor text', bbox: [30, 95, 180, 24] },
  ],
});

export function isMockProfile(value: string | null | undefined): value is MockProfile {
  if (!value) {
    return false;
  }
  return value === 'default'
    || value === 'malformed'
    || OCR_COMPARISON_PROFILES.includes(value as OCRComparisonProfile);
}

export function getMockProfileResult(profile: OCRComparisonProfile): OCRResult {
  return COMPARISON_RESULTS[profile];
}

export class MockEngine implements OCREngine {
  private responses: OCRResult[];
  private callIndex = 0;

  constructor(config?: OCRResult[] | MockEngineOptions) {
    if (Array.isArray(config)) {
      this.responses = config;
      return;
    }

    if (config?.responses && config.responses.length > 0) {
      this.responses = config.responses;
      return;
    }

    if (config?.profile && config.profile !== 'default') {
      if (config.profile === 'malformed') {
        this.responses = [MALFORMED_RESULT];
      } else {
        this.responses = [COMPARISON_RESULTS[config.profile]];
      }
      return;
    }

    this.responses = [DEFAULT_RESULT];
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
