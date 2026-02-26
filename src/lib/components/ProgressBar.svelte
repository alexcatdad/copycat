<script lang="ts">
  interface Props {
    progress: number; // 0 to 1
    label: string;
  }

  let { progress, label }: Props = $props();

  let percent = $derived(Math.round(progress * 100));
</script>

<div class="progress-container">
  <div class="progress-label">{label}</div>
  <div
    class="progress-bar"
    role="progressbar"
    aria-valuenow={percent}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div class="progress-fill" style="width: {percent}%"></div>
  </div>
  <div class="progress-percent">{percent}%</div>
</div>

<style>
  .progress-container {
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
  }

  .progress-label {
    font-size: 0.875rem;
    color: var(--ink-muted);
    margin-bottom: 0.5rem;
  }

  .progress-bar {
    height: 8px;
    background: color-mix(in oklab, var(--surface-2), #ffffff 20%);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent-copper), var(--accent-teal));
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-percent {
    font-size: 0.75rem;
    color: var(--ink-muted);
    text-align: right;
    margin-top: 0.25rem;
  }
</style>
