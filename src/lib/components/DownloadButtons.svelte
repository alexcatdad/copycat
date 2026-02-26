<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { generateDocx } from '../generators/docx-generator';
  import { generateSearchablePdf } from '../generators/pdf-generator';
  import type { OCRResult, PageImage, PdfPageDescriptor } from '../types';

  interface Props {
    results: OCRResult[];
    pages: PageImage[];
    pageDescriptors?: PdfPageDescriptor[];
    sourcePdfBytes?: Uint8Array;
    onpdfgenerated?: (blob: Blob) => void;
    ondocxgenerated?: (blob: Blob) => void;
  }

  let {
    results,
    pages,
    pageDescriptors = [],
    sourcePdfBytes,
    onpdfgenerated,
    ondocxgenerated,
  }: Props = $props();
  let generatingDocx = $state(false);
  let generatingPdf = $state(false);

  async function downloadDocx() {
    generatingDocx = true;
    try {
      const blob = await generateDocx(results, pages);
      ondocxgenerated?.(blob);
      downloadBlob(blob, 'copycat-output.docx');
    } finally {
      generatingDocx = false;
    }
  }

  async function downloadPdf() {
    generatingPdf = true;
    try {
      const blob = await generateSearchablePdf(results, pages, {
        originalPdfBytes: sourcePdfBytes,
        pageDescriptors,
      });
      onpdfgenerated?.(blob);
      downloadBlob(blob, 'copycat-output.pdf');
    } finally {
      generatingPdf = false;
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="download-buttons">
  <button onclick={downloadDocx} disabled={generatingDocx}>
    {generatingDocx ? '...' : $_('results.download.docx')}
  </button>
  <button onclick={downloadPdf} disabled={generatingPdf}>
    {generatingPdf ? '...' : $_('results.download.pdf')}
  </button>
</div>

<style>
  .download-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  button {
    padding: 0.65rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--surface-1);
    color: var(--ink-strong);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease;
  }

  button:hover:not(:disabled) {
    border-color: var(--accent-copper);
    transform: translateY(-1px);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
