<script lang="ts">
  import type { OCRResult } from '../types';

  interface Props {
    result: OCRResult | null;
  }

  let { result }: Props = $props();
</script>

<div class="text-result">
  {#if result}
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
    background: white;
    border-radius: 8px;
    border: 1px solid var(--border-color, #e5e7eb);
  }

  .extracted-text {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'Noto Sans', system-ui, sans-serif;
    font-size: 0.9rem;
    line-height: 1.6;
    margin: 0;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted, #9ca3af);
  }
</style>
