import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import UploadZone from './UploadZone.svelte';

describe('UploadZone', () => {
  it('renders the dropzone text', () => {
    render(UploadZone);
    expect(screen.getByText(/Drop files here/i)).toBeInTheDocument();
  });

  it('has a file input that accepts pdf, png, jpg', () => {
    render(UploadZone);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain('image/png');
    expect(input.accept).toContain('image/jpeg');
    expect(input.accept).toContain('application/pdf');
  });

  it('emits onfiles event when files are selected', async () => {
    const onFiles = vi.fn();
    render(UploadZone, { props: { onfiles: onFiles } });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['fake'], 'test.png', { type: 'image/png' });
    await fireEvent.change(input, { target: { files: [file] } });

    expect(onFiles).toHaveBeenCalledWith(expect.arrayContaining([expect.any(File)]));
  });
});
