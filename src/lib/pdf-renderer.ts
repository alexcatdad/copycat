import * as pdfjsLib from 'pdfjs-dist';
import type { PageImage, PageSourceKind } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const RENDER_SCALE = 3;

function createPageImage(
  blob: Blob,
  width: number,
  height: number,
  pageNumber: number,
  sourceKind: PageSourceKind,
): PageImage {
  const pageId = globalThis.crypto?.randomUUID?.() ?? `page-${pageNumber}-${Date.now()}-${Math.random()}`;
  return {
    id: `page-${pageNumber}-${pageId}`,
    src: URL.createObjectURL(blob),
    blob,
    width,
    height,
    pageNumber,
    sourceKind,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create page preview blob from canvas.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export async function renderPdfPages(
  pdfBuffer: ArrayBuffer,
  onProgress?: (current: number, total: number) => void,
): Promise<PageImage[]> {
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  const pages: PageImage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create canvas rendering context.');
    }

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    const blob = await canvasToBlob(canvas);

    pages.push(createPageImage(blob, viewport.width, viewport.height, i, 'scanned'));
    onProgress?.(i, pdf.numPages);
  }

  return pages;
}

export async function imageFileToPageImage(file: File, pageNumber: number): Promise<PageImage> {
  const dims = await getImageDimensions(file);
  const sourceKind: PageSourceKind = 'image';
  return createPageImage(file, dims.width, dims.height, pageNumber, sourceKind);
}

function getImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read image dimensions.'));
    };

    img.src = url;
  });
}

export function revokePageUrls(pages: PageImage[]): void {
  for (const page of pages) {
    URL.revokeObjectURL(page.src);
  }
}
