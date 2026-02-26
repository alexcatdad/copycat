<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { generateDocx } from '../generators/docx-generator';
  import { generateSearchablePdf } from '../generators/pdf-generator';
  import type { OCRResult, PageImage } from '../types';

  interface Props {
    results: OCRResult[];
    pages: PageImage[];
  }

  let { results, pages }: Props = $props();
  let generatingDocx = $state(false);
  let generatingPdf = $state(false);

  async function downloadDocx() {
    generatingDocx = true;
    try {
      const blob = await generateDocx(results, pages);
      downloadBlob(blob, 'copycat-output.docx');
    } finally {
      generatingDocx = false;
    }
  }

  async function downloadPdf() {
    generatingPdf = true;
    try {
      const blob = await generateSearchablePdf(results, pages);
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
    gap: 1rem;
  }

  button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    background: var(--accent, #3b82f6);
    color: white;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:hover:not(:disabled) {
    background: var(--accent-hover, #2563eb);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
