import type { OCRResult } from './types';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function suspiciousSymbolRatio(text: string): number {
  if (!text) return 1;
  const chars = Array.from(text);
  let suspicious = 0;

  for (const char of chars) {
    if (/\s/.test(char)) {
      continue;
    }
    if (!/[\p{L}\p{N}.,:;!?()\-/$%#@&+]/u.test(char)) {
      suspicious += 1;
    }
  }

  const nonSpace = chars.filter((char) => !/\s/.test(char)).length;
  if (nonSpace === 0) return 1;
  return suspicious / nonSpace;
}

export function inferQuality(
  text: string,
  source: 'ocr' | 'pdf-text',
  baseConfidence?: number,
): Pick<OCRResult, 'qualityScore' | 'qualityFlags'> {
  const flags: string[] = [];

  if (source === 'pdf-text') {
    return {
      qualityScore: 0.98,
      qualityFlags: [],
    };
  }

  const trimmed = text.trim();
  const symbolRatio = suspiciousSymbolRatio(trimmed);
  const lineCount = trimmed.split('\n').filter(Boolean).length;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  let score = typeof baseConfidence === 'number' ? clamp01(baseConfidence) : 0.82;

  if (trimmed.length < 20) {
    score -= 0.25;
    flags.push('very-short-text');
  }

  if (wordCount > 0) {
    const avgWordLength = trimmed.replace(/\s+/g, '').length / wordCount;
    if (avgWordLength > 11 || avgWordLength < 2.2) {
      score -= 0.1;
      flags.push('word-shape-anomaly');
    }
  }

  if (symbolRatio > 0.15) {
    score -= 0.2;
    flags.push('symbol-noise');
  }

  if (lineCount <= 1 && wordCount >= 20) {
    score -= 0.08;
    flags.push('layout-collapse');
  }

  return {
    qualityScore: clamp01(score),
    qualityFlags: Array.from(new Set(flags)),
  };
}
