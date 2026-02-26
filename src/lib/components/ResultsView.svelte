<script lang="ts">
  import { _ } from 'svelte-i18n';
  import DownloadButtons from './DownloadButtons.svelte';
  import PageNavigator from './PageNavigator.svelte';
  import PagePreview from './PagePreview.svelte';
  import TextResult from './TextResult.svelte';
  import type { OCRResult, PageImage, PdfPageDescriptor } from '../types';

  interface Props {
    pages: PageImage[];
    results: OCRResult[];
    pageDescriptors?: PdfPageDescriptor[];
    sourcePdfBytes?: Uint8Array;
    onpdfgenerated?: (blob: Blob) => void;
    ondocxgenerated?: (blob: Blob) => void;
    retryingLowQuality?: boolean;
    onretrylowquality?: () => void;
    onrestart?: () => void;
  }

  let {
    pages,
    results,
    pageDescriptors = [],
    sourcePdfBytes,
    onpdfgenerated,
    ondocxgenerated,
    retryingLowQuality = false,
    onretrylowquality,
    onrestart,
  }: Props = $props();

  let viewingPage = $state(1);

  const LOW_QUALITY_THRESHOLD = 0.8;

  const lowQualityIndices = $derived(
    results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.qualityScore < LOW_QUALITY_THRESHOLD && result.source !== 'pdf-text')
      .map(({ index }) => index),
  );

  const averageQuality = $derived(
    results.length === 0
      ? 0
      : results.reduce((sum, result) => sum + result.qualityScore, 0) / results.length,
  );

  $effect(() => {
    const max = Math.max(1, pages.length);
    if (viewingPage > max) {
      viewingPage = max;
    }
    if (viewingPage < 1) {
      viewingPage = 1;
    }
  });

  $effect(() => {
    const preloadTargets = [viewingPage - 2, viewingPage - 1, viewingPage, viewingPage + 1]
      .map((index) => pages[index])
      .filter((page): page is PageImage => Boolean(page));

    for (const page of preloadTargets) {
      const img = new Image();
      img.decoding = 'async';
      img.src = page.src;
    }
  });

  function formatQuality(score: number): string {
    return `${Math.round(score * 100)}%`;
  }
</script>

<div class="results-view">
  <div class="results-header">
    <h2>{$_('results.title')}</h2>
    <p>{$_('results.pages', { values: { count: pages.length } })}</p>
    <p class="quality-summary">Quality average: <strong>{formatQuality(averageQuality)}</strong></p>
    {#if lowQualityIndices.length > 0}
      <p class="quality-warning">{lowQualityIndices.length} page(s) look low confidence.</p>
    {/if}
  </div>

  <div class="results-actions">
    <DownloadButtons
      {results}
      {pages}
      {pageDescriptors}
      sourcePdfBytes={sourcePdfBytes}
      {onpdfgenerated}
      {ondocxgenerated}
    />
    <button class="secondary" onclick={onretrylowquality} disabled={lowQualityIndices.length === 0 || retryingLowQuality}>
      {retryingLowQuality ? 'Retrying...' : 'Retry low-quality pages'}
    </button>
  </div>

  <div class="split-view">
    <div class="panel">
      {#if pages[viewingPage - 1]}
        <PagePreview
          page={pages[viewingPage - 1]}
          regions={results[viewingPage - 1]?.regions}
        />
      {/if}
    </div>
    <div class="panel">
      <TextResult result={results[viewingPage - 1] ?? null} />
    </div>
  </div>

  {#if pages.length > 1}
    <PageNavigator
      currentPage={viewingPage}
      totalPages={pages.length}
      onpagechange={(p) => viewingPage = p}
    />
  {/if}

  <button class="restart-button" onclick={onrestart}>
    {$_('results.restart')}
  </button>
</div>

<style>
  .results-view {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.25rem;
    background: var(--surface-2);
    border: 1px solid var(--border-color);
    border-radius: 18px;
    animation: reveal 320ms ease both;
  }

  .results-header h2 {
    margin: 0;
    font-size: 1.35rem;
  }

  .results-header p {
    margin: 0.2rem 0 0;
    color: var(--ink-muted);
    font-size: 0.88rem;
  }

  .quality-summary strong {
    color: var(--ink-strong);
  }

  .quality-warning {
    color: var(--accent-copper);
    font-weight: 600;
  }

  .results-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .secondary {
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--surface-1);
    color: var(--ink-strong);
    font-size: 0.86rem;
    padding: 0.5rem 0.95rem;
    cursor: pointer;
    transition: border-color 0.2s ease;
  }

  .secondary:hover:not(:disabled) {
    border-color: var(--accent-copper);
  }

  .secondary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .split-view {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.2rem;
    min-height: 400px;
  }

  .panel {
    display: flex;
    flex-direction: column;
  }

  .restart-button {
    align-self: center;
    padding: 0.55rem 1.25rem;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--surface-1);
    color: var(--ink-strong);
    cursor: pointer;
    font-size: 0.85rem;
    transition: transform 0.2s ease;
  }

  .restart-button:hover {
    transform: translateY(-1px);
  }

  @media (max-width: 900px) {
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
