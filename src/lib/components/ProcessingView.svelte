<script lang="ts">
  import { _ } from 'svelte-i18n';
  import ProgressBar from './ProgressBar.svelte';
  import PagePreview from './PagePreview.svelte';
  import TextResult from './TextResult.svelte';
  import type { PageImage, OCRResult } from '../types';

  interface Props {
    currentPage: number;
    totalPages: number;
    pageImage: PageImage | null;
    ocrResult: OCRResult | null;
  }

  let { currentPage, totalPages, pageImage, ocrResult }: Props = $props();
</script>

<div class="processing-view">
  <ProgressBar
    progress={totalPages > 0 ? currentPage / totalPages : 0}
    label={$_('processing.page', { values: { current: currentPage, total: totalPages } })}
  />

  <div class="split-view">
    <div class="panel">
      {#if pageImage}
        <PagePreview page={pageImage} regions={ocrResult?.regions} />
      {:else}
        <div class="preview-placeholder">Preparing page preview...</div>
      {/if}
    </div>
    <div class="panel">
      <TextResult result={ocrResult} />
    </div>
  </div>
</div>

<style>
  .processing-view {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    padding: 1.2rem;
    background: var(--surface-2);
    border: 1px solid var(--border-color);
    border-radius: 18px;
    animation: reveal 300ms ease both;
  }

  .split-view {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    min-height: 500px;
  }

  .panel {
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    overflow: hidden;
  }

  .preview-placeholder {
    min-height: 320px;
    border: 1px solid var(--border-color);
    border-radius: 14px;
    display: grid;
    place-items: center;
    color: var(--ink-muted);
    background: var(--surface-1);
    font-size: 0.9rem;
  }

  @media (max-width: 768px) {
    .split-view {
      grid-template-columns: 1fr;
    }
  }

  @keyframes reveal {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
