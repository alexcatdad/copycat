import { describe, it, expect, vi } from 'vitest';
import { renderPdfPages, imageFileToPageImage } from './pdf-renderer';

// Mock pdfjs-dist since it needs a browser environment
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 2,
      getPage: vi.fn().mockImplementation((_pageNum: number) =>
        Promise.resolve({
          getViewport: vi.fn().mockReturnValue({ width: 800, height: 1200 }),
          render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        })
      ),
    }),
  }),
  GlobalWorkerOptions: { workerSrc: '' },
}));

describe('imageFileToPageImage', () => {
  it('converts a File to a PageImage', async () => {
    const file = new File(['fake-png'], 'test.png', { type: 'image/png' });

    const mockDataUrl = 'data:image/png;base64,fake';
    vi.spyOn(globalThis, 'FileReader').mockImplementation(function (this: any) {
      this.onload = null;
      this.onerror = null;
      this.readAsDataURL = vi.fn().mockImplementation(() => {
        setTimeout(() => {
          this.onload?.({ target: { result: mockDataUrl } });
        }, 0);
      });
      return this;
    } as any);

    vi.spyOn(globalThis, 'Image').mockImplementation(function (this: any) {
      this.onload = null;
      this.onerror = null;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      Object.defineProperty(this, 'src', {
        set(_val: string) {
          setTimeout(() => {
            this.naturalWidth = 800;
            this.naturalHeight = 1200;
            this.onload?.();
          }, 0);
        },
      });
      return this;
    } as any);

    const result = await imageFileToPageImage(file, 1);
    expect(result.dataUrl).toBe(mockDataUrl);
    expect(result.pageNumber).toBe(1);
  });
});

describe('renderPdfPages', () => {
  it('extracts pages from a PDF ArrayBuffer', async () => {
    vi.spyOn(globalThis, 'document', 'get').mockReturnValue({
      createElement: vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({}),
        toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock'),
        width: 0,
        height: 0,
      }),
    } as any);

    const fakeBuffer = new ArrayBuffer(8);
    const pages = await renderPdfPages(fakeBuffer);
    expect(pages).toHaveLength(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[1].pageNumber).toBe(2);
  });
});
