<script lang="ts">
  interface Props {
    currentPage: number;
    totalPages: number;
    onpagechange?: (page: number) => void;
  }

  let { currentPage, totalPages, onpagechange }: Props = $props();

  function goTo(page: number) {
    if (page >= 1 && page <= totalPages) {
      onpagechange?.(page);
    }
  }
</script>

<nav class="page-navigator">
  <button onclick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}>&#9664;</button>
  {#each Array.from({ length: totalPages }, (_, i) => i + 1) as page}
    <button
      class:active={page === currentPage}
      onclick={() => goTo(page)}
    >{page}</button>
  {/each}
  <button onclick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages}>&#9654;</button>
</nav>

<style>
  .page-navigator {
    display: flex;
    gap: 4px;
    justify-content: center;
    flex-wrap: wrap;
  }

  button {
    min-width: 36px;
    height: 36px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--surface-1);
    color: var(--ink-strong);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s;
  }

  button:hover:not(:disabled) {
    background: color-mix(in oklab, var(--surface-2), white 14%);
  }

  button.active {
    background: var(--accent-teal);
    color: white;
    border-color: var(--accent-teal);
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
