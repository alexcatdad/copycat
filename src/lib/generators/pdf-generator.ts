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

    const lines = groupRegionsIntoLines(result.regions);
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

function groupRegionsIntoLines(regions: OCRRegion[]): OCRRegion[][] {
  if (regions.length === 0) {
    return [];
  }

  const sorted = [...regions]
    .filter((region) => region.text.trim().length > 0)
    .sort((a, b) => {
      const yDiff = a.bbox[1] - b.bbox[1];
      if (Math.abs(yDiff) > 10) {
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
    const threshold = Math.max(reference.bbox[3], region.bbox[3]) * 0.55;
    if (Math.abs(region.bbox[1] - reference.bbox[1]) <= threshold) {
      current.push(region);
      current.sort((a, b) => a.bbox[0] - b.bbox[0]);
    } else {
      lines.push([region]);
    }
  }

  return lines;
}

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

  const pdfY = pageImage.height - y - h;
  if (!Number.isFinite(pdfY) || !Number.isFinite(fontSize)) {
    return;
  }

  try {
    page.drawText(text, {
      x,
      y: clamp(pdfY, 0, pageImage.height),
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      opacity: 0,
    });
  } catch {
    // Skip malformed region data rather than failing export.
  }
}
