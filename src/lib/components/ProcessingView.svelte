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
    gap: 1.5rem;
    padding: 1.5rem;
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

  @media (max-width: 768px) {
    .split-view {
      grid-template-columns: 1fr;
    }
  }
</style>
