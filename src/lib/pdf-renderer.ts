import * as pdfjsLib from 'pdfjs-dist';
import type { PageImage } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const RENDER_SCALE = 2; // Render at 2x for better OCR quality

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
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    pages.push({
      dataUrl: canvas.toDataURL('image/png'),
      width: viewport.width,
      height: viewport.height,
      pageNumber: i,
    });

    onProgress?.(i, pdf.numPages);
  }

  return pages;
}

export async function imageFileToPageImage(file: File, pageNumber: number): Promise<PageImage> {
  const dataUrl = await fileToDataUrl(file);
  const { width, height } = await getImageDimensions(dataUrl);

  return { dataUrl, width, height, pageNumber };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}
