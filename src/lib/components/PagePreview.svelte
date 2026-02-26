<script lang="ts">
  import type { PageImage, OCRRegion } from '../types';

  interface Props {
    page: PageImage;
    regions?: OCRRegion[];
  }

  let { page, regions = [] }: Props = $props();
</script>

<div class="page-preview">
  <div class="image-container">
    <img src={page.dataUrl} alt="Page {page.pageNumber}" />
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
  </div>
</div>

<style>
  .page-preview {
    flex: 1;
    overflow: auto;
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
    border-radius: 4px;
  }

  .bbox-overlay {
    position: absolute;
    border: 2px solid rgba(59, 130, 246, 0.5);
    background: rgba(59, 130, 246, 0.08);
    pointer-events: none;
  }
</style>
