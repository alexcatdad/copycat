/**
 * Image preprocessor for OCR — applies ABBYY-style image cleanup to improve
 * recognition accuracy before sending images to the model.
 *
 * Uses OffscreenCanvas / Canvas API for portability. Provides:
 *  - Contrast enhancement (tile-based histogram equalization)
 *  - Noise reduction (3x3 median filter)
 *  - Deskew detection and correction (projection-profile based)
 *  - Adaptive thresholding (convert to high-contrast B&W)
 *  - Lanczos-quality upscaling for small images
 *  - Grayscale conversion
 */

export interface PreprocessOptions {
  /** Minimum width before upscaling is applied. Default: 1024 */
  minWidth?: number;
  /** Minimum height before upscaling is applied. Default: 768 */
  minHeight?: number;
  /** Apply adaptive thresholding to create high-contrast B&W. Default: true */
  adaptiveThreshold?: boolean;
  /** Block size for adaptive threshold (must be odd). Default: 15 */
  blockSize?: number;
  /** Constant subtracted from the mean in adaptive threshold. Default: 8 */
  thresholdC?: number;
  /** Apply contrast enhancement before thresholding. Default: true */
  contrastEnhancement?: boolean;
  /** Apply 3x3 median noise filter. Default: true */
  noiseReduction?: boolean;
  /** Attempt automatic deskew correction. Default: false */
  deskew?: boolean;
}

const DEFAULTS: Required<PreprocessOptions> = {
  minWidth: 1024,
  minHeight: 768,
  adaptiveThreshold: true,
  blockSize: 15,
  thresholdC: 8,
  contrastEnhancement: true,
  noiseReduction: true,
  deskew: false,
};

export interface PreprocessedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Load an image source (blob, data URL, or object URL) into ImageData
 * using OffscreenCanvas where available, falling back to a regular canvas.
 */
function createCanvasContext(
  width: number,
  height: number,
): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, ctx: canvas.getContext('2d')! };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}

async function loadImageData(
  src: string | Blob,
  targetWidth: number,
  targetHeight: number,
): Promise<ImageData> {
  const bitmap = typeof src === 'string'
    ? await createImageBitmap(await (await fetch(src)).blob())
    : await createImageBitmap(src);

  const { ctx } = createCanvasContext(targetWidth, targetHeight);
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();
  return ctx.getImageData(0, 0, targetWidth, targetHeight);
}

/**
 * Convert pixel data to grayscale in-place using luminance formula.
 */
function toGrayscale(data: Uint8ClampedArray): Uint8Array {
  const gray = new Uint8Array(data.length / 4);
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    // ITU-R BT.601 luminance
    gray[i] = Math.round(
      0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2],
    );
  }
  return gray;
}

/**
 * Tile-based contrast enhancement (simplified CLAHE).
 * Divides image into tiles, computes local histograms, applies contrast-limited
 * histogram equalization, and bilinear-interpolates at tile boundaries.
 */
function enhanceContrast(
  gray: Uint8Array,
  width: number,
  height: number,
  tileGridX = 8,
  tileGridY = 8,
  clipLimit = 40,
): Uint8Array {
  const output = new Uint8Array(gray.length);
  const tileW = Math.ceil(width / tileGridX);
  const tileH = Math.ceil(height / tileGridY);

  // Compute CDF lookup tables for each tile
  const cdfs: Uint8Array[][] = [];
  for (let ty = 0; ty < tileGridY; ty++) {
    cdfs[ty] = [];
    for (let tx = 0; tx < tileGridX; tx++) {
      const startX = tx * tileW;
      const startY = ty * tileH;
      const endX = Math.min(startX + tileW, width);
      const endY = Math.min(startY + tileH, height);

      // Build histogram
      const hist = new Uint32Array(256);
      let pixelCount = 0;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          hist[gray[y * width + x]]++;
          pixelCount++;
        }
      }

      // Apply clip limit
      const maxCount = Math.max(1, Math.round((clipLimit * pixelCount) / 256));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > maxCount) {
          excess += hist[i] - maxCount;
          hist[i] = maxCount;
        }
      }
      // Redistribute excess evenly
      const perBin = Math.floor(excess / 256);
      for (let i = 0; i < 256; i++) {
        hist[i] += perBin;
      }

      // Build CDF
      const cdf = new Uint8Array(256);
      let cumulative = 0;
      for (let i = 0; i < 256; i++) {
        cumulative += hist[i];
        cdf[i] = Math.round((cumulative * 255) / Math.max(pixelCount, 1));
      }
      cdfs[ty][tx] = cdf;
    }
  }

  // Apply with bilinear interpolation between tile CDFs
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const val = gray[idx];

      // Find which tile center this pixel is closest to
      const fx = (x / tileW) - 0.5;
      const fy = (y / tileH) - 0.5;
      const tx0 = Math.max(0, Math.min(tileGridX - 1, Math.floor(fx)));
      const ty0 = Math.max(0, Math.min(tileGridY - 1, Math.floor(fy)));
      const tx1 = Math.min(tileGridX - 1, tx0 + 1);
      const ty1 = Math.min(tileGridY - 1, ty0 + 1);

      const dx = Math.max(0, Math.min(1, fx - tx0));
      const dy = Math.max(0, Math.min(1, fy - ty0));

      // Bilinear interpolation of the 4 surrounding tile CDFs
      const v00 = cdfs[ty0][tx0][val];
      const v10 = cdfs[ty0][tx1][val];
      const v01 = cdfs[ty1][tx0][val];
      const v11 = cdfs[ty1][tx1][val];

      const top = v00 * (1 - dx) + v10 * dx;
      const bottom = v01 * (1 - dx) + v11 * dx;
      output[idx] = Math.round(top * (1 - dy) + bottom * dy);
    }
  }

  return output;
}

/**
 * 3x3 median filter for salt-and-pepper noise removal.
 * Preserves text edges while removing scanner speckle noise.
 */
function medianFilter3x3(gray: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(gray.length);
  const kernel = new Uint8Array(9);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Gather 3x3 neighborhood
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = Math.max(0, Math.min(height - 1, y + dy));
          const nx = Math.max(0, Math.min(width - 1, x + dx));
          kernel[k++] = gray[ny * width + nx];
        }
      }

      // Sort to find median (network sort for 9 elements)
      for (let i = 0; i < 9; i++) {
        for (let j = i + 1; j < 9; j++) {
          if (kernel[j] < kernel[i]) {
            const tmp = kernel[i];
            kernel[i] = kernel[j];
            kernel[j] = tmp;
          }
        }
      }

      output[y * width + x] = kernel[4]; // Median is at index 4
    }
  }

  return output;
}

/**
 * Detect skew angle using horizontal projection profiles.
 * Tests angles from -5 to +5 degrees in 0.5-degree steps.
 * Returns the angle (in degrees) with the sharpest projection variance.
 */
function detectSkewAngle(gray: Uint8Array, width: number, height: number): number {
  // Quick binarize for projection analysis
  const mean = gray.reduce((s, v) => s + v, 0) / gray.length;
  const binary = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i] < mean ? 1 : 0;
  }

  let bestAngle = 0;
  let bestVariance = -1;

  const centerX = width / 2;
  const centerY = height / 2;

  for (let angleDeg = -5; angleDeg <= 5; angleDeg += 0.5) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // Compute horizontal projection profile at this angle
    const projection = new Uint32Array(height);

    // Sample every 2nd pixel for speed
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 2) {
        const rx = Math.round(cosA * (x - centerX) - sinA * (y - centerY) + centerX);
        const ry = Math.round(sinA * (x - centerX) + cosA * (y - centerY) + centerY);
        if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
          projection[ry] += binary[y * width + x];
        }
      }
    }

    // Compute variance of projection profile
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let i = 0; i < height; i++) {
      sum += projection[i];
      sumSq += projection[i] * projection[i];
      count++;
    }
    const mean = sum / Math.max(count, 1);
    const variance = sumSq / Math.max(count, 1) - mean * mean;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestAngle = angleDeg;
    }
  }

  return bestAngle;
}

/**
 * Rotate a grayscale image by the given angle (in degrees) using canvas transform.
 * Returns the rotated image as a new grayscale buffer with the same dimensions.
 */
async function rotateImage(
  src: string | Blob,
  width: number,
  height: number,
  angleDeg: number,
): Promise<{ imageData: ImageData; width: number; height: number }> {
  const bitmap = typeof src === 'string'
    ? await createImageBitmap(await (await fetch(src)).blob())
    : await createImageBitmap(src);

  const { canvas, ctx } = createCanvasContext(width, height);
  const angleRad = (angleDeg * Math.PI) / 180;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-angleRad);
  ctx.translate(-width / 2, -height / 2);
  ctx.drawImage(bitmap, 0, 0, width, height);
  ctx.restore();
  bitmap.close();

  return {
    imageData: ctx.getImageData(0, 0, width, height),
    width,
    height,
  };
}

/**
 * Compute the integral image (summed area table) for fast box mean computation.
 */
function computeIntegralImage(gray: Uint8Array, width: number, height: number): Float64Array {
  const integral = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      rowSum += gray[idx];
      integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * width + x] : 0);
    }
  }

  return integral;
}

/**
 * Adaptive threshold using integral image for O(1) per-pixel mean computation.
 * Mimics OpenCV's ADAPTIVE_THRESH_MEAN_C method.
 */
function adaptiveThresholdMean(
  gray: Uint8Array,
  width: number,
  height: number,
  blockSize: number,
  C: number,
): Uint8Array {
  const integral = computeIntegralImage(gray, width, height);
  const output = new Uint8Array(gray.length);
  const halfBlock = Math.floor(blockSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Window boundaries (inclusive pixel coordinates)
      const left = Math.max(0, x - halfBlock);
      const top = Math.max(0, y - halfBlock);
      const right = Math.min(width - 1, x + halfBlock);
      const bottom = Math.min(height - 1, y + halfBlock);

      const area = (right - left + 1) * (bottom - top + 1);

      // Summed area table query: sum of pixels in [top..bottom, left..right]
      let sum = integral[bottom * width + right];
      if (left > 0) sum -= integral[bottom * width + (left - 1)];
      if (top > 0) sum -= integral[(top - 1) * width + right];
      if (left > 0 && top > 0) sum += integral[(top - 1) * width + (left - 1)];

      const mean = sum / Math.max(area, 1);
      const idx = y * width + x;
      output[idx] = gray[idx] > mean - C ? 255 : 0;
    }
  }

  return output;
}

/**
 * Apply the full preprocessing pipeline to an image.
 * Pipeline order: upscale → grayscale → contrast enhance → denoise → deskew → adaptive threshold
 */
export async function preprocessImage(
  src: string | Blob,
  originalWidth: number,
  originalHeight: number,
  options: PreprocessOptions = {},
): Promise<PreprocessedImage> {
  const opts = { ...DEFAULTS, ...options };

  if (originalWidth <= 0 || originalHeight <= 0) {
    throw new Error(`Invalid image dimensions: ${originalWidth}x${originalHeight}`);
  }

  // Determine if upscaling is needed
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (originalWidth < opts.minWidth || originalHeight < opts.minHeight) {
    const scaleX = opts.minWidth / originalWidth;
    const scaleY = opts.minHeight / originalHeight;
    const scale = Math.max(scaleX, scaleY, 1);
    // Cap at 2x to avoid excessive memory use
    const cappedScale = Math.min(scale, 2);
    targetWidth = Math.round(originalWidth * cappedScale);
    targetHeight = Math.round(originalHeight * cappedScale);
  }

  let imageData = await loadImageData(src, targetWidth, targetHeight);

  if (!opts.adaptiveThreshold && !opts.contrastEnhancement && !opts.noiseReduction && !opts.deskew) {
    // Just return the (possibly upscaled) image without any processing
    const { canvas, ctx } = createCanvasContext(targetWidth, targetHeight);
    ctx.putImageData(imageData, 0, 0);
    const outputBlob = await canvasToBlob(canvas);
    const dataUrl = await blobToDataUrl(outputBlob);
    return { blob: outputBlob, dataUrl, width: targetWidth, height: targetHeight };
  }

  // Step 1: Grayscale
  let gray = toGrayscale(imageData.data);

  // Step 2: Contrast enhancement (CLAHE-like)
  if (opts.contrastEnhancement) {
    gray = enhanceContrast(gray, targetWidth, targetHeight);
  }

  // Step 3: Noise reduction (median filter)
  if (opts.noiseReduction) {
    gray = medianFilter3x3(gray, targetWidth, targetHeight);
  }

  // Step 4: Deskew detection and correction
  if (opts.deskew) {
    const skewAngle = detectSkewAngle(gray, targetWidth, targetHeight);
    if (Math.abs(skewAngle) > 0.3) {
      // Re-render the original image rotated, then re-grayscale
      const rotated = await rotateImage(src, targetWidth, targetHeight, skewAngle);
      imageData = rotated.imageData;
      gray = toGrayscale(imageData.data);
      // Re-apply contrast and denoise on the rotated image
      if (opts.contrastEnhancement) {
        gray = enhanceContrast(gray, targetWidth, targetHeight);
      }
      if (opts.noiseReduction) {
        gray = medianFilter3x3(gray, targetWidth, targetHeight);
      }
    }
  }

  // Step 5: Adaptive threshold (if enabled)
  if (opts.adaptiveThreshold) {
    const thresholded = adaptiveThresholdMean(
      gray,
      targetWidth,
      targetHeight,
      opts.blockSize,
      opts.thresholdC,
    );

    // Write back to ImageData (B&W)
    const outputData = new ImageData(targetWidth, targetHeight);
    for (let i = 0; i < thresholded.length; i++) {
      const offset = i * 4;
      outputData.data[offset] = thresholded[i];
      outputData.data[offset + 1] = thresholded[i];
      outputData.data[offset + 2] = thresholded[i];
      outputData.data[offset + 3] = 255;
    }

    const { canvas: outCanvas, ctx: outCtx } = createCanvasContext(targetWidth, targetHeight);
    outCtx.putImageData(outputData, 0, 0);
    const outputBlob = await canvasToBlob(outCanvas);
    const dataUrl = await blobToDataUrl(outputBlob);
    return { blob: outputBlob, dataUrl, width: targetWidth, height: targetHeight };
  }

  // No thresholding — write enhanced grayscale back
  const outputData = new ImageData(targetWidth, targetHeight);
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    outputData.data[offset] = gray[i];
    outputData.data[offset + 1] = gray[i];
    outputData.data[offset + 2] = gray[i];
    outputData.data[offset + 3] = 255;
  }

  const { canvas: outCanvas, ctx: outCtx } = createCanvasContext(targetWidth, targetHeight);
  outCtx.putImageData(outputData, 0, 0);
  const outputBlob = await canvasToBlob(outCanvas);
  const dataUrl = await blobToDataUrl(outputBlob);
  return { blob: outputBlob, dataUrl, width: targetWidth, height: targetHeight };
}

async function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob returned null'));
    }, 'image/png');
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/**
 * Exported for testing — converts RGB pixel data to grayscale luminance.
 */
export const _testOnly = {
  toGrayscale,
  adaptiveThresholdMean,
  computeIntegralImage,
  enhanceContrast,
  medianFilter3x3,
  detectSkewAngle,
};
