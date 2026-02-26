<script lang="ts">
  import type { OCRResult } from '../types';

  interface Props {
    result: OCRResult | null;
  }

  let { result }: Props = $props();

  function formatQuality(score: number): string {
    return `${Math.round(score * 100)}%`;
  }
</script>

<div class="text-result">
  {#if result}
    <div class="text-meta">
      <span class="pill">{result.source === 'pdf-text' ? 'Native PDF text' : 'OCR text'}</span>
      <span class="pill">Quality {formatQuality(result.qualityScore)}</span>
      {#if result.qualityFlags.length > 0}
        <span class="pill warn">{result.qualityFlags.join(', ')}</span>
      {/if}
    </div>
    <pre class="extracted-text">{result.text}</pre>
  {:else}
    <div class="placeholder">
      <p>Extracting text...</p>
    </div>
  {/if}
</div>

<style>
  .text-result {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    background: var(--surface-1);
    border-radius: 14px;
    border: 1px solid var(--border-color);
    display: grid;
    gap: 0.7rem;
  }

  .text-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .pill {
    font-size: 0.72rem;
    border: 1px solid var(--border-color);
    color: var(--ink-muted);
    border-radius: 999px;
    padding: 0.15rem 0.45rem;
    text-transform: lowercase;
  }

  .pill.warn {
    color: var(--accent-copper);
  }

  .extracted-text {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: var(--font-mono);
    font-size: 0.9rem;
    line-height: 1.6;
    margin: 0;
    color: var(--ink-strong);
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ink-muted);
  }
</style>
