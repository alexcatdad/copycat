import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProcessingView from './ProcessingView.svelte';

describe('ProcessingView', () => {
  it('shows current page progress', () => {
    render(ProcessingView, {
      props: {
        currentPage: 3,
        totalPages: 10,
        pageImage: { dataUrl: 'data:image/png;base64,abc', width: 800, height: 1200, pageNumber: 3 },
        ocrResult: { text: 'Hello', regions: [{ text: 'Hello', bbox: [0, 0, 100, 20] }] },
      },
    });
    expect(screen.getByText('Page 3 of 10')).toBeInTheDocument();
  });

  it('displays extracted text', () => {
    render(ProcessingView, {
      props: {
        currentPage: 1,
        totalPages: 1,
        pageImage: { dataUrl: 'data:image/png;base64,abc', width: 800, height: 1200, pageNumber: 1 },
        ocrResult: { text: 'Extracted content here', regions: [] },
      },
    });
    expect(screen.getByText(/Extracted content here/)).toBeInTheDocument();
  });
});
