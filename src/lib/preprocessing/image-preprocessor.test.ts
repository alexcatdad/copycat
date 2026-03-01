import { describe, it, expect } from 'vitest';
import { preprocessImage, _testOnly } from './image-preprocessor';

const { toGrayscale, adaptiveThresholdMean, computeIntegralImage, enhanceContrast, medianFilter3x3, detectSkewAngle } = _testOnly;

describe('toGrayscale', () => {
  it('converts RGBA pixel data to grayscale luminance', () => {
    // White pixel: R=255, G=255, B=255, A=255
    const white = new Uint8ClampedArray([255, 255, 255, 255]);
    const result = toGrayscale(white);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(255);
  });

  it('converts black pixel correctly', () => {
    const black = new Uint8ClampedArray([0, 0, 0, 255]);
    const result = toGrayscale(black);
    expect(result[0]).toBe(0);
  });

  it('applies ITU-R BT.601 luminance weights', () => {
    // Pure red: 0.299 * 255 ≈ 76
    const red = new Uint8ClampedArray([255, 0, 0, 255]);
    const result = toGrayscale(red);
    expect(result[0]).toBe(76);

    // Pure green: 0.587 * 255 ≈ 150
    const green = new Uint8ClampedArray([0, 255, 0, 255]);
    const gResult = toGrayscale(green);
    expect(gResult[0]).toBe(150);

    // Pure blue: 0.114 * 255 ≈ 29
    const blue = new Uint8ClampedArray([0, 0, 255, 255]);
    const bResult = toGrayscale(blue);
    expect(bResult[0]).toBe(29);
  });

  it('handles multiple pixels', () => {
    const data = new Uint8ClampedArray([
      255, 255, 255, 255, // white
      0, 0, 0, 255,       // black
      128, 128, 128, 255,  // gray
    ]);
    const result = toGrayscale(data);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(255);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(128);
  });
});

describe('computeIntegralImage', () => {
  it('computes summed area table for a simple 2x2 image', () => {
    const gray = new Uint8Array([1, 2, 3, 4]);
    const integral = computeIntegralImage(gray, 2, 2);
    // Expected:
    // [1, 3]    (row 0: cumsum)
    // [4, 10]   (row 1: 3+1=4, 3+4+2+1=10)
    expect(integral[0]).toBe(1);
    expect(integral[1]).toBe(3);
    expect(integral[2]).toBe(4);
    expect(integral[3]).toBe(10);
  });

  it('computes correct integral for uniform image', () => {
    const gray = new Uint8Array([10, 10, 10, 10, 10, 10, 10, 10, 10]);
    const integral = computeIntegralImage(gray, 3, 3);
    // Bottom-right should be sum of all = 90
    expect(integral[8]).toBe(90);
  });
});

describe('adaptiveThresholdMean', () => {
  it('produces binary output (0 or 255 only)', () => {
    const gray = new Uint8Array([10, 200, 50, 180, 30, 220, 100, 150, 90]);
    const result = adaptiveThresholdMean(gray, 3, 3, 3, 5);
    for (const val of result) {
      expect(val === 0 || val === 255).toBe(true);
    }
  });

  it('thresholds uniform image to all white', () => {
    // With uniform values, every pixel equals the local mean,
    // so pixel > mean - C is true (C > 0), resulting in white.
    const gray = new Uint8Array(25).fill(128);
    const result = adaptiveThresholdMean(gray, 5, 5, 3, 5);
    for (const val of result) {
      expect(val).toBe(255);
    }
  });

  it('respects block size parameter', () => {
    // Create a pattern with a dark region in center
    const size = 9;
    const gray = new Uint8Array(size * size).fill(200);
    // Make center pixel very dark
    gray[4 * size + 4] = 10;

    const smallBlock = adaptiveThresholdMean(gray, size, size, 3, 5);
    const largeBlock = adaptiveThresholdMean(gray, size, size, 7, 5);

    // The center pixel should be black in both since it's far below the mean
    expect(smallBlock[4 * size + 4]).toBe(0);
    expect(largeBlock[4 * size + 4]).toBe(0);
  });
});

describe('enhanceContrast', () => {
  it('produces output of same length as input', () => {
    const gray = new Uint8Array(100).fill(128);
    const result = enhanceContrast(gray, 10, 10);
    expect(result).toHaveLength(100);
  });

  it('enhances low-contrast image', () => {
    // Create a narrow-range image (values between 100-110)
    const gray = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      gray[i] = 100 + (i % 11);
    }
    const result = enhanceContrast(gray, 8, 8);
    // Output should have wider range than input
    const minOut = Math.min(...result);
    const maxOut = Math.max(...result);
    const minIn = Math.min(...gray);
    const maxIn = Math.max(...gray);
    expect(maxOut - minOut).toBeGreaterThanOrEqual(maxIn - minIn);
  });

  it('produces valid pixel values (0-255)', () => {
    const gray = new Uint8Array([0, 50, 100, 150, 200, 255, 30, 80, 120, 170, 210, 240, 10, 60, 90, 180]);
    const result = enhanceContrast(gray, 4, 4);
    for (const val of result) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(255);
    }
  });
});

describe('medianFilter3x3', () => {
  it('removes salt noise (single bright outlier)', () => {
    const gray = new Uint8Array(9).fill(50);
    gray[4] = 255; // Salt noise in center
    const result = medianFilter3x3(gray, 3, 3);
    // Median of 8 values of 50 + 1 value of 255 should be 50
    expect(result[4]).toBe(50);
  });

  it('removes pepper noise (single dark outlier)', () => {
    const gray = new Uint8Array(9).fill(200);
    gray[4] = 0; // Pepper noise in center
    const result = medianFilter3x3(gray, 3, 3);
    expect(result[4]).toBe(200);
  });

  it('preserves uniform regions', () => {
    const gray = new Uint8Array(9).fill(128);
    const result = medianFilter3x3(gray, 3, 3);
    for (const val of result) {
      expect(val).toBe(128);
    }
  });

  it('produces output of same size as input', () => {
    const gray = new Uint8Array(25);
    for (let i = 0; i < 25; i++) gray[i] = i * 10;
    const result = medianFilter3x3(gray, 5, 5);
    expect(result).toHaveLength(25);
  });
});

describe('detectSkewAngle', () => {
  it('returns 0 for a uniform image', () => {
    const gray = new Uint8Array(100).fill(128);
    const angle = detectSkewAngle(gray, 10, 10);
    expect(Math.abs(angle)).toBeLessThanOrEqual(5);
  });

  it('returns an angle within the detection range', () => {
    // Create image with horizontal text-like pattern
    const width = 50;
    const height = 50;
    const gray = new Uint8Array(width * height).fill(255);
    // Draw horizontal dark lines
    for (let y of [10, 20, 30]) {
      for (let x = 5; x < 45; x++) {
        gray[y * width + x] = 0;
      }
    }
    const angle = detectSkewAngle(gray, width, height);
    expect(angle).toBeGreaterThanOrEqual(-5);
    expect(angle).toBeLessThanOrEqual(5);
  });
});

describe('preprocessImage', () => {
  it('rejects zero-width dimensions', async () => {
    await expect(preprocessImage(new Blob(), 0, 600)).rejects.toThrow('Invalid image dimensions');
  });

  it('rejects zero-height dimensions', async () => {
    await expect(preprocessImage(new Blob(), 800, 0)).rejects.toThrow('Invalid image dimensions');
  });

  it('rejects negative dimensions', async () => {
    await expect(preprocessImage(new Blob(), -1, 600)).rejects.toThrow('Invalid image dimensions');
  });
});
