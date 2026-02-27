/**
 * Image preprocessor for OCR — applies ABBYY-style image cleanup to improve
 * recognition accuracy before sending images to the model.
 *
 * Uses OffscreenCanvas / Canvas API for portability. Provides:
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
}

const DEFAULTS: Required<PreprocessOptions> = {
  minWidth: 1024,
  minHeight: 768,
  adaptiveThreshold: true,
  blockSize: 15,
  thresholdC: 8,
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
async function loadImageData(
  src: string | Blob,
  targetWidth: number,
  targetHeight: number,
): Promise<ImageData> {
  const bitmap = typeof src === 'string'
    ? await createImageBitmap(await (await fetch(src)).blob())
    : await createImageBitmap(src);

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d')!;
  // Lanczos-quality interpolation (browser uses high-quality resampling by default)
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
 */
export async function preprocessImage(
  src: string | Blob,
  originalWidth: number,
  originalHeight: number,
  options: PreprocessOptions = {},
): Promise<PreprocessedImage> {
  const opts = { ...DEFAULTS, ...options };

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

  const imageData = await loadImageData(src, targetWidth, targetHeight);

  if (!opts.adaptiveThreshold) {
    // Just return the (possibly upscaled) image without thresholding
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    const outputBlob = await canvas.convertToBlob({ type: 'image/png' });
    const dataUrl = await blobToDataUrl(outputBlob);
    return { blob: outputBlob, dataUrl, width: targetWidth, height: targetHeight };
  }

  // Grayscale + adaptive threshold
  const gray = toGrayscale(imageData.data);
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

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(outputData, 0, 0);
  const outputBlob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = await blobToDataUrl(outputBlob);
  return { blob: outputBlob, dataUrl, width: targetWidth, height: targetHeight };
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
};
