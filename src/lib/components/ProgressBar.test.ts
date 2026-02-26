import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProgressBar from './ProgressBar.svelte';

describe('ProgressBar', () => {
  it('displays progress percentage', () => {
    render(ProgressBar, { props: { progress: 0.5, label: 'Loading...' } });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('shows 0% at start', () => {
    render(ProgressBar, { props: { progress: 0, label: 'Starting' } });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows 100% when complete', () => {
    render(ProgressBar, { props: { progress: 1, label: 'Done' } });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});
