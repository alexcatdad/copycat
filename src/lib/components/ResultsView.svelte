<script lang="ts">
  import { _ } from 'svelte-i18n';
  import DownloadButtons from './DownloadButtons.svelte';
  import PageNavigator from './PageNavigator.svelte';
  import PagePreview from './PagePreview.svelte';
  import TextResult from './TextResult.svelte';
  import type { OCRResult, PageImage } from '../types';

  interface Props {
    pages: PageImage[];
    results: OCRResult[];
    onrestart?: () => void;
  }

  let { pages, results, onrestart }: Props = $props();
  let viewingPage = $state(1);
</script>

<div class="results-view">
  <div class="results-header">
    <h2>{$_('results.title')}</h2>
    <p>{$_('results.pages', { values: { count: pages.length } })}</p>
  </div>

  <DownloadButtons {results} {pages} />

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
    gap: 1.5rem;
    padding: 1.5rem;
  }

  .results-header h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .results-header p {
    margin: 0.25rem 0 0;
    color: var(--text-muted, #6b7280);
    font-size: 0.875rem;
  }

  .split-view {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    min-height: 400px;
  }

  .panel {
    display: flex;
    flex-direction: column;
  }

  .restart-button {
    align-self: center;
    padding: 0.6rem 1.5rem;
    border: 1px solid var(--border-color, #d1d5db);
    border-radius: 8px;
    background: white;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.15s;
  }

  .restart-button:hover {
    background: var(--bg-subtle, #f3f4f6);
  }

  @media (max-width: 768px) {
    .split-view {
      grid-template-columns: 1fr;
    }
  }
</style>
