export interface OCRQualityMetrics {
  charErrorRate: number;
  wordErrorRate: number;
  charAccuracy: number;
  wordAccuracy: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function levenshteinDistance<T>(source: readonly T[], target: readonly T[]): number {
  if (source.length === 0) return target.length;
  if (target.length === 0) return source.length;

  let previous = Array.from({ length: target.length + 1 }, (_, i) => i);
  let current = new Array<number>(target.length + 1);

  for (let i = 1; i <= source.length; i++) {
    current[0] = i;
    for (let j = 1; j <= target.length; j++) {
      const substitutionCost = source[i - 1] === target[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }

    [previous, current] = [current, previous];
  }

  return previous[target.length];
}

export function normalizeOCRText(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculateCharacterErrorRate(expected: string, actual: string): number {
  const normalizedExpected = Array.from(normalizeOCRText(expected));
  const normalizedActual = Array.from(normalizeOCRText(actual));

  if (normalizedExpected.length === 0) {
    return normalizedActual.length === 0 ? 0 : 1;
  }

  return levenshteinDistance(normalizedExpected, normalizedActual) / normalizedExpected.length;
}

export function calculateWordErrorRate(expected: string, actual: string): number {
  const normalizedExpected = normalizeOCRText(expected).split(' ').filter(Boolean);
  const normalizedActual = normalizeOCRText(actual).split(' ').filter(Boolean);

  if (normalizedExpected.length === 0) {
    return normalizedActual.length === 0 ? 0 : 1;
  }

  return levenshteinDistance(normalizedExpected, normalizedActual) / normalizedExpected.length;
}

export function evaluateOCRQuality(expected: string, actual: string): OCRQualityMetrics {
  const charErrorRate = calculateCharacterErrorRate(expected, actual);
  const wordErrorRate = calculateWordErrorRate(expected, actual);

  return {
    charErrorRate,
    wordErrorRate,
    charAccuracy: clamp01(1 - charErrorRate),
    wordAccuracy: clamp01(1 - wordErrorRate),
  };
}
