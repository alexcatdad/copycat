<script lang="ts">
  import type { JobListItem } from '../storage/jobs-repo';

  interface Props {
    jobs: JobListItem[];
    loading?: boolean;
    onopen?: (jobId: string) => void;
    onclear?: () => void;
  }

  let { jobs, loading = false, onopen, onclear }: Props = $props();

  function formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  function formatQuality(value: number): string {
    return `${Math.round(value * 100)}%`;
  }
</script>

<section class="history-panel" aria-live="polite">
  <div class="history-header">
    <h3>Recent history</h3>
    <button class="clear" onclick={onclear} disabled={jobs.length === 0}>Clear local history/cache</button>
  </div>

  {#if loading}
    <p class="history-empty">Loading history...</p>
  {:else if jobs.length === 0}
    <p class="history-empty">No recent documents yet.</p>
  {:else}
    <ul>
      {#each jobs as job}
        <li>
          <button class="job-item" onclick={() => onopen?.(job.id)}>
            <span class="title">{job.sourceName}</span>
            <span class="meta">{job.pageCount} pages · {formatQuality(job.averageQuality)} avg · {formatDate(job.updatedAt)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .history-panel {
    background: var(--surface-2);
    border: 1px solid var(--border-color);
    border-radius: 18px;
    padding: 1rem;
    display: grid;
    gap: 0.8rem;
  }

  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .history-header h3 {
    margin: 0;
    font-size: 1rem;
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--ink-strong);
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }

  .job-item {
    width: 100%;
    text-align: left;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--surface-1);
    color: var(--ink-strong);
    padding: 0.75rem;
    cursor: pointer;
    display: grid;
    gap: 0.25rem;
    transition: border-color 0.2s ease, transform 0.2s ease;
  }

  .job-item:hover {
    border-color: var(--accent-copper);
    transform: translateY(-1px);
  }

  .title {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .meta,
  .history-empty {
    font-size: 0.82rem;
    color: var(--ink-muted);
  }

  .clear {
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: transparent;
    color: var(--ink-muted);
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .clear:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
