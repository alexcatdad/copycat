import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Header from './Header.svelte';

describe('Header', () => {
  it('renders the app title', () => {
    render(Header, { props: { tier: 'premium' } });
    expect(screen.getByText(/CopyCat/)).toBeInTheDocument();
  });

  it('shows the engine tier badge', () => {
    render(Header, { props: { tier: 'premium' } });
    expect(screen.getByText(/GPU Accelerated/i)).toBeInTheDocument();
  });

  it('renders language switcher buttons', () => {
    render(Header, { props: { tier: 'basic' } });
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('RO')).toBeInTheDocument();
  });
});
