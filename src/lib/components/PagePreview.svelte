<script lang="ts">
  import type { PageImage, OCRRegion } from '../types';

  interface Props {
    page: PageImage;
    regions?: OCRRegion[];
  }

  let { page, regions = [] }: Props = $props();

  let imageState = $state<'loading' | 'loaded' | 'error'>('loading');
  let src = $state('');
  let retryUrl: string | null = null;

  $effect(() => {
    src = page.src;
    imageState = 'loading';
  });

  function handleLoad() {
    imageState = 'loaded';
  }

  function handleError() {
    imageState = 'error';
  }

  function retryLoad() {
    if (retryUrl) {
      URL.revokeObjectURL(retryUrl);
      retryUrl = null;
    }

    retryUrl = URL.createObjectURL(page.blob);
    src = retryUrl;
    imageState = 'loading';
  }

  $effect(() => {
    return () => {
      if (retryUrl) {
        URL.revokeObjectURL(retryUrl);
      }
    };
  });
</script>

<div class="page-preview">
  <div class="image-container">
    {#if imageState === 'loading'}
      <div class="placeholder">Loading preview...</div>
    {/if}

    {#if imageState === 'error'}
      <div class="error-panel">
        <p>Preview failed to render.</p>
        <button onclick={retryLoad}>Retry preview</button>
      </div>
    {/if}

    <img
      src={src}
      alt="Page {page.pageNumber}"
      class:visible={imageState !== 'error'}
      onload={handleLoad}
      onerror={handleError}
      loading="lazy"
      decoding="async"
    />

    {#if imageState === 'loaded'}
      {#each regions as region}
        {@const [x, y, w, h] = region.bbox}
        <div
          class="bbox-overlay"
          style="
            left: {(x / page.width) * 100}%;
            top: {(y / page.height) * 100}%;
            width: {(w / page.width) * 100}%;
            height: {(h / page.height) * 100}%;
          "
        ></div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .page-preview {
    flex: 1;
    overflow: auto;
    border: 1px solid var(--border-color);
    border-radius: 14px;
    background: var(--surface-1);
    min-height: 320px;
  }

  .image-container {
    position: relative;
    display: inline-block;
    max-width: 100%;
  }

  img {
    max-width: 100%;
    height: auto;
    display: block;
    border-radius: 12px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  img.visible {
    opacity: 1;
  }

  .placeholder,
  .error-panel {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    z-index: 2;
    background: color-mix(in oklab, var(--surface-1), white 20%);
    color: var(--ink-muted);
    font-size: 0.9rem;
  }

  .error-panel {
    gap: 0.75rem;
    text-align: center;
  }

  .error-panel button {
    border: 1px solid var(--border-color);
    background: var(--surface-2);
    color: var(--ink-strong);
    border-radius: 999px;
    padding: 0.35rem 0.8rem;
    cursor: pointer;
  }

  .bbox-overlay {
    position: absolute;
    border: 2px solid color-mix(in oklab, var(--accent-teal), white 30%);
    background: color-mix(in oklab, var(--accent-teal), transparent 85%);
    pointer-events: none;
  }
</style>
