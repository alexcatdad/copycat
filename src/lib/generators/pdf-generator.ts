import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { OCRRegion, OCRResult, PageImage, PdfPageDescriptor } from '../types';

export interface GenerateSearchablePdfOptions {
  originalPdfBytes?: Uint8Array | ArrayBuffer;
  pageDescriptors?: PdfPageDescriptor[];
}

export async function generateSearchablePdf(
  results: OCRResult[],
  pages: PageImage[],
  options: GenerateSearchablePdfOptions = {},
): Promise<Blob> {
  const pageDescriptors = options.pageDescriptors ?? [];
  const canReuseOriginal = Boolean(options.originalPdfBytes)
    && pages.length > 0
    && pageDescriptors.length === pages.length
    && pageDescriptors.every((descriptor) => descriptor.sourceKind === 'pdf-text');

  if (canReuseOriginal) {
    const bytes = options.originalPdfBytes!;
    const original = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const stableBytes = new Uint8Array(original.byteLength);
    stableBytes.set(original);
    return new Blob([stableBytes.buffer], { type: 'application/pdf' });
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages.length; i++) {
    const pageImage = pages[i];
    const result = results[i];

    const page = pdfDoc.addPage([pageImage.width, pageImage.height]);

    try {
      const imageBytes = await imageToBytes(pageImage);
      const embeddedImage = await embedImage(pdfDoc, imageBytes);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: pageImage.width,
        height: pageImage.height,
      });
    } catch {
      // Keep blank page so PDF page count remains stable.
    }

    if (!result) {
      continue;
    }

    // Detect columns and sort regions in reading order
    const columnsOrdered = orderByColumns(result.regions, pageImage.width);
    const lines = groupRegionsIntoLines(columnsOrdered);
    for (const line of lines) {
      for (const region of line) {
        drawInvisibleRegionText(page, pageImage, font, region);
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
}

async function embedImage(pdfDoc: PDFDocument, imageBytes: Uint8Array) {
  try {
    return await pdfDoc.embedPng(imageBytes);
  } catch {
    return pdfDoc.embedJpg(imageBytes);
  }
}

async function imageToBytes(pageImage: PageImage): Promise<Uint8Array> {
  if (pageImage.blob) {
    return new Uint8Array(await pageImage.blob.arrayBuffer());
  }

  if (pageImage.src.startsWith('data:')) {
    return dataUrlToBytes(pageImage.src);
  }

  const response = await fetch(pageImage.src);
  return new Uint8Array(await response.arrayBuffer());
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return new Uint8Array(0);
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function normalizeBbox(
  bbox: [number, number, number, number],
  pageWidth: number,
  pageHeight: number,
): [number, number, number, number] | null {
  const [x, y, w, h] = bbox;
  if (![x, y, w, h].every((value) => Number.isFinite(value))) {
    return null;
  }

  if (w <= 0 || h <= 0) {
    return null;
  }

  const nx = clamp(x, 0, pageWidth);
  const ny = clamp(y, 0, pageHeight);
  const nw = clamp(w, 0, pageWidth - nx);
  const nh = clamp(h, 0, pageHeight - ny);

  if (nw <= 0 || nh <= 0) {
    return null;
  }

  return [nx, ny, nw, nh];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Detect multi-column layout and sort regions in reading order
 * (column-by-column, left-to-right, top-to-bottom within each column).
 */
function orderByColumns(regions: OCRRegion[], pageWidth: number): OCRRegion[] {
  const valid = regions.filter((r) => r.text.trim().length > 0);
  if (valid.length < 4) return valid;

  // Collect left-edge X positions
  const leftEdges = valid.map((r) => r.bbox[0]).sort((a, b) => a - b);

  // Look for large horizontal gaps (>25% of page width)
  const gapThreshold = pageWidth * 0.25;
  const columnBoundaries: number[] = [0];

  for (let i = 1; i < leftEdges.length; i++) {
    if (leftEdges[i] - leftEdges[i - 1] > gapThreshold) {
      columnBoundaries.push((leftEdges[i] + leftEdges[i - 1]) / 2);
    }
  }
  columnBoundaries.push(pageWidth);

  if (columnBoundaries.length <= 2) {
    // Single column - no reordering needed
    return valid;
  }

  // Assign each region to a column
  const columns: OCRRegion[][] = Array.from(
    { length: columnBoundaries.length - 1 },
    () => [],
  );

  for (const region of valid) {
    const centerX = region.bbox[0] + region.bbox[2] / 2;
    for (let c = 0; c < columns.length; c++) {
      if (centerX >= columnBoundaries[c] && centerX < columnBoundaries[c + 1]) {
        columns[c].push(region);
        break;
      }
    }
  }

  // Sort each column top-to-bottom, then concatenate columns left-to-right
  const ordered: OCRRegion[] = [];
  for (const col of columns) {
    col.sort((a, b) => a.bbox[1] - b.bbox[1]);
    ordered.push(...col);
  }

  return ordered;
}

/**
 * Compute median line height across all regions for adaptive grouping threshold.
 */
function computeMedianHeight(regions: OCRRegion[]): number {
  const heights = regions
    .filter((r) => r.bbox[3] > 0)
    .map((r) => r.bbox[3])
    .sort((a, b) => a - b);
  if (heights.length === 0) return 20;
  return heights[Math.floor(heights.length / 2)];
}

function groupRegionsIntoLines(regions: OCRRegion[]): OCRRegion[][] {
  if (regions.length === 0) {
    return [];
  }

  const medianHeight = computeMedianHeight(regions);
  // Use median-based threshold for adaptive line grouping
  const groupingThreshold = medianHeight * 0.4;

  const sorted = [...regions]
    .filter((region) => region.text.trim().length > 0)
    .sort((a, b) => {
      const yDiff = a.bbox[1] - b.bbox[1];
      if (Math.abs(yDiff) > groupingThreshold) {
        return yDiff;
      }
      return a.bbox[0] - b.bbox[0];
    });

  const lines: OCRRegion[][] = [];

  for (const region of sorted) {
    const current = lines[lines.length - 1];
    if (!current) {
      lines.push([region]);
      continue;
    }

    const reference = current[0];
    if (Math.abs(region.bbox[1] - reference.bbox[1]) <= groupingThreshold) {
      current.push(region);
      current.sort((a, b) => a.bbox[0] - b.bbox[0]);
    } else {
      lines.push([region]);
    }
  }

  return lines;
}

/**
 * Compute the optimal font size for a text region, capping to the bounding box height.
 */
function fitFontSize(font: PDFFont, text: string, boxWidth: number, boxHeight: number): number {
  const cappedHeight = clamp(boxHeight * 0.85, 4, 48);
  const width = Math.max(boxWidth, 1);

  if (!text.trim()) {
    return cappedHeight;
  }

  let fontSize = cappedHeight;
  const minFont = 4;

  while (fontSize > minFont && font.widthOfTextAtSize(text, fontSize) > width) {
    fontSize -= 0.5;
  }

  return clamp(fontSize, minFont, 48);
}

/**
 * Compute extra per-word spacing so the rendered text width exactly
 * matches the OCR bounding box width. Distributes excess space between
 * words rather than characters for more natural text selection.
 * Falls back to character spacing when there are no spaces.
 */
function computeSpacing(
  font: PDFFont,
  text: string,
  fontSize: number,
  boxWidth: number,
): { wordSpacing: number; characterSpacing: number } {
  const naturalWidth = font.widthOfTextAtSize(text, fontSize);

  if (naturalWidth >= boxWidth) {
    return { wordSpacing: 0, characterSpacing: 0 };
  }

  const extra = boxWidth - naturalWidth;
  const spaceCount = (text.match(/ /g) || []).length;

  if (spaceCount > 0) {
    // Distribute excess width between words
    return { wordSpacing: extra / spaceCount, characterSpacing: 0 };
  }

  // No spaces — fall back to character spacing
  const charCount = text.length;
  if (charCount <= 1) {
    return { wordSpacing: 0, characterSpacing: 0 };
  }
  return { wordSpacing: 0, characterSpacing: extra / (charCount - 1) };
}

/**
 * Draw invisible (opacity=0) text at the precise bounding box position.
 * Uses word spacing to stretch the text to match the visual width,
 * and transforms coordinates from top-left origin (browser/OCR) to
 * bottom-left origin (PDF).
 */
function drawInvisibleRegionText(
  page: any,
  pageImage: PageImage,
  font: PDFFont,
  region: OCRRegion,
): void {
  const text = region.text.trim();
  if (!text) {
    return;
  }

  const bbox = normalizeBbox(region.bbox, pageImage.width, pageImage.height);
  if (!bbox) {
    return;
  }

  const [x, y, w, h] = bbox;
  const fontSize = fitFontSize(font, text, w, h);

  // PDF coordinate transform: origin at bottom-left, y increases upward.
  // OCR bbox y is distance from top. Baseline sits near the bottom of the box.
  const baselineOffset = fontSize * 0.2; // approximate descender clearance
  const pdfY = pageImage.height - y - h + baselineOffset;

  if (!Number.isFinite(pdfY) || !Number.isFinite(fontSize)) {
    return;
  }

  const { wordSpacing, characterSpacing } = computeSpacing(font, text, fontSize, w);

  try {
    const drawOptions: Record<string, any> = {
      x,
      y: clamp(pdfY, 0, pageImage.height),
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      opacity: 0,
    };

    // Only set spacing when it meaningfully adjusts width
    if (wordSpacing > 0.01) {
      drawOptions.wordSpacing = wordSpacing;
    }
    if (characterSpacing > 0.01) {
      drawOptions.characterSpacing = characterSpacing;
    }

    page.drawText(text, drawOptions);
  } catch {
    // Skip malformed region data rather than failing export.
  }
}
