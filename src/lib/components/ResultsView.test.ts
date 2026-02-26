import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResultsView from './ResultsView.svelte';

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

const mockProps = {
  pages: [makePage(1), makePage(2)],
  results: [makeResult('Page 1 text'), makeResult('Page 2 text')],
  onrestart: vi.fn(),
};

describe('ResultsView', () => {
  it('shows processing complete title', () => {
    render(ResultsView, { props: mockProps });
    expect(screen.getByText(/Processing complete/i)).toBeInTheDocument();
  });

  it('has download buttons for DOCX and PDF', () => {
    render(ResultsView, { props: mockProps });
    expect(screen.getByText(/DOCX/i)).toBeInTheDocument();
    expect(screen.getByText(/PDF/i)).toBeInTheDocument();
  });

  it('has a restart button', () => {
    render(ResultsView, { props: mockProps });
    expect(screen.getByText(/another|restart/i)).toBeInTheDocument();
  });
});
