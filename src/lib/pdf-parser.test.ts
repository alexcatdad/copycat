import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { parsePdfDocument } from './pdf-parser';

const makePage = (items: any[]) => ({
  getViewport: vi.fn().mockImplementation(({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 800 * scale,
  })),
  render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
  getTextContent: vi.fn().mockResolvedValue({ items }),
});

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 2,
      getPage: vi.fn().mockImplementation((pageNum: number) => {
        if (pageNum === 1) {
          return Promise.resolve(makePage([
            { str: 'Invoice', width: 50, height: 12, transform: [1, 0, 0, 12, 40, 760] },
            { str: '#4821', width: 35, height: 12, transform: [1, 0, 0, 12, 95, 760] },
            { str: 'Total', width: 40, height: 12, transform: [1, 0, 0, 12, 40, 720] },
            { str: '$199.00', width: 55, height: 12, transform: [1, 0, 0, 12, 86, 720] },
          ]));
        }

        return Promise.resolve(makePage([]));
      }),
    }),
  }),
  GlobalWorkerOptions: { workerSrc: '' },
}));

describe('parsePdfDocument', () => {
  beforeEach(() => {
    let counter = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:pdf-${++counter}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies native text and scanned pages in one PDF', async () => {
    vi.spyOn(globalThis, 'document', 'get').mockReturnValue({
      createElement: vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({}),
        toBlob: vi.fn().mockImplementation((cb: (blob: Blob) => void) => cb(new Blob(['p'], { type: 'image/png' }))),
        width: 0,
        height: 0,
      }),
    } as any);

    const parsed = await parsePdfDocument(new ArrayBuffer(10));

    expect(parsed.pages).toHaveLength(2);
    expect(parsed.descriptors[0].sourceKind).toBe('pdf-text');
    expect(parsed.descriptors[1].sourceKind).toBe('scanned');
    expect(parsed.nativeResults[0]?.source).toBe('pdf-text');
    expect(parsed.nativeResults[1]).toBeNull();
    expect(parsed.isFullyNativeText).toBe(false);
  });
});
