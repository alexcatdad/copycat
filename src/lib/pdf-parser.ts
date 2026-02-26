import * as pdfjsLib from 'pdfjs-dist';
import type { OCRRegion, OCRResult, PageImage, PdfPageDescriptor } from './types';
import { inferQuality } from './quality-score';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const RENDER_SCALE = 3;
const MIN_NATIVE_TEXT_CHARS = 24;
const MIN_NATIVE_REGIONS = 2;

export interface ParsedPdfDocument {
  pages: PageImage[];
  descriptors: PdfPageDescriptor[];
  nativeResults: Array<OCRResult | null>;
  isFullyNativeText: boolean;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create PDF page preview blob.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function createPageImage(blob: Blob, width: number, height: number, pageNumber: number, sourceKind: 'pdf-text' | 'scanned'): PageImage {
  const pageId = globalThis.crypto?.randomUUID?.() ?? `pdf-page-${pageNumber}-${Date.now()}-${Math.random()}`;
  return {
    id: pageId,
    src: URL.createObjectURL(blob),
    blob,
    width,
    height,
    pageNumber,
    sourceKind,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildNativeResult(
  rawRegions: OCRRegion[],
  pageWidth: number,
  pageHeight: number,
): OCRResult | null {
  const regions = rawRegions
    .map((region) => {
      const [x, y, w, h] = region.bbox;
      if (![x, y, w, h].every((value) => Number.isFinite(value))) {
        return null;
      }
      if (!region.text.trim()) {
        return null;
      }

      const nx = clamp(x, 0, pageWidth);
      const ny = clamp(y, 0, pageHeight);
      const nw = clamp(w, 0, pageWidth - nx);
      const nh = clamp(h, 0, pageHeight - ny);
      if (nw <= 0 || nh <= 0) {
        return null;
      }

      return {
        text: region.text,
        bbox: [nx, ny, nw, nh] as [number, number, number, number],
      };
    })
    .filter((region): region is OCRRegion => Boolean(region));

  const text = regions.map((region) => region.text).join(' ').replace(/\s+/g, ' ').trim();

  if (text.length < MIN_NATIVE_TEXT_CHARS || regions.length < MIN_NATIVE_REGIONS) {
    return null;
  }

  const quality = inferQuality(text, 'pdf-text');
  return {
    text,
    regions,
    source: 'pdf-text',
    qualityScore: quality.qualityScore,
    qualityFlags: quality.qualityFlags,
  };
}

export async function parsePdfDocument(
  pdfBuffer: ArrayBuffer,
  onProgress?: (current: number, total: number) => void,
): Promise<ParsedPdfDocument> {
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  const pages: PageImage[] = [];
  const descriptors: PdfPageDescriptor[] = [];
  const nativeResults: Array<OCRResult | null> = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const renderViewport = page.getViewport({ scale: RENDER_SCALE });
    const baseViewport = page.getViewport({ scale: 1 });

    const canvas = document.createElement('canvas');
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create canvas rendering context.');
    }

    await page.render({ canvasContext: ctx, viewport: renderViewport, canvas } as any).promise;
    const blob = await canvasToBlob(canvas);

    const textContent = await page.getTextContent();
    const rawRegions: OCRRegion[] = [];

    for (const item of (textContent.items as any[])) {
      const text = typeof item.str === 'string' ? item.str.trim() : '';
      if (!text) {
        continue;
      }

      const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
      const x = Number(transform[4]) * RENDER_SCALE;
      const yBottom = Number(transform[5]);
      const width = Number(item.width || 0) * RENDER_SCALE;
      const heightBase = Math.abs(Number(item.height || Math.abs(transform[3]) || 12));
      const height = heightBase * RENDER_SCALE;
      const y = (baseViewport.height - yBottom - heightBase) * RENDER_SCALE;

      rawRegions.push({
        text,
        bbox: [x, y, width > 0 ? width : Math.max(text.length * (height * 0.4), 6), height],
      });
    }

    const nativeResult = buildNativeResult(rawRegions, renderViewport.width, renderViewport.height);
    const sourceKind = nativeResult ? 'pdf-text' : 'scanned';

    pages.push(createPageImage(blob, renderViewport.width, renderViewport.height, i, sourceKind));
    descriptors.push({
      pageNumber: i,
      sourceKind,
      hasNativeText: Boolean(nativeResult),
      nativeResult,
    });
    nativeResults.push(nativeResult);

    onProgress?.(i, pdf.numPages);
  }

  return {
    pages,
    descriptors,
    nativeResults,
    isFullyNativeText: descriptors.every((descriptor) => descriptor.sourceKind === 'pdf-text'),
  };
}
