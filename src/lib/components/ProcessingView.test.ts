import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProcessingView from './ProcessingView.svelte';

function makePage(pageNumber: number) {
  return {
    id: `p-${pageNumber}`,
    src: `blob:p-${pageNumber}`,
    blob: new Blob([`p-${pageNumber}`], { type: 'image/png' }),
    width: 800,
    height: 1200,
    pageNumber,
    sourceKind: 'image' as const,
  };
}

function makeResult(text: string) {
  return {
    text,
    regions: [{ text, bbox: [0, 0, 100, 20] as [number, number, number, number] }],
    source: 'ocr' as const,
    qualityScore: 0.9,
    qualityFlags: [],
  };
}

describe('ProcessingView', () => {
  it('shows current page progress', () => {
    render(ProcessingView, {
      props: {
        currentPage: 3,
        totalPages: 10,
        pageImage: makePage(3),
        ocrResult: makeResult('Hello'),
      },
    });
    expect(screen.getByText('Page 3 of 10')).toBeInTheDocument();
  });

  it('displays extracted text', () => {
    render(ProcessingView, {
      props: {
        currentPage: 1,
        totalPages: 1,
        pageImage: makePage(1),
        ocrResult: makeResult('Extracted content here'),
      },
    });
    expect(screen.getByText(/Extracted content here/)).toBeInTheDocument();
  });
});
