import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResultsView from './ResultsView.svelte';

const mockProps = {
  pages: [
    { dataUrl: 'data:image/png;base64,p1', width: 800, height: 1200, pageNumber: 1 },
    { dataUrl: 'data:image/png;base64,p2', width: 800, height: 1200, pageNumber: 2 },
  ],
  results: [
    { text: 'Page 1 text', regions: [{ text: 'Page 1 text', bbox: [0, 0, 100, 20] as [number, number, number, number] }] },
    { text: 'Page 2 text', regions: [{ text: 'Page 2 text', bbox: [0, 0, 100, 20] as [number, number, number, number] }] },
  ],
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
