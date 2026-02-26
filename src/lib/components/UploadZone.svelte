<script lang="ts">
  import { _ } from 'svelte-i18n';

  interface Props {
    onfiles?: (files: File[]) => void;
  }

  let { onfiles }: Props = $props();

  let dragOver = $state(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) onfiles?.(files);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) onfiles?.(files);
    input.value = '';
  }
</script>

<div
  class="upload-zone"
  class:drag-over={dragOver}
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  role="button"
  tabindex="0"
>
  <div class="upload-content">
    <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
    <p class="dropzone-text">{$_('upload.dropzone')}</p>
    <p class="formats-text">{$_('upload.formats')}</p>
    <label class="upload-button">
      {$_('upload.button')}
      <input
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        onchange={handleFileInput}
        hidden
      />
    </label>
  </div>
</div>

<style>
  .upload-zone {
    border: 2px dashed color-mix(in oklab, var(--accent-copper), white 40%);
    border-radius: 20px;
    padding: 3rem 2rem;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
    background: var(--surface-2);
    position: relative;
    overflow: hidden;
  }

  .upload-zone::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 70% 10%, color-mix(in oklab, var(--accent-teal), white 80%), transparent 40%);
    opacity: 0.75;
    pointer-events: none;
  }

  .upload-zone:hover,
  .upload-zone.drag-over {
    border-color: var(--accent-copper);
    background: color-mix(in oklab, var(--surface-2), white 12%);
    transform: translateY(-1px);
  }

  .upload-content {
    position: relative;
    z-index: 1;
  }

  .upload-icon {
    width: 52px;
    height: 52px;
    margin: 0 auto 1rem;
    color: var(--accent-teal);
  }

  .dropzone-text {
    font-size: 1.06rem;
    color: var(--ink-strong);
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  .formats-text {
    font-size: 0.86rem;
    color: var(--ink-muted);
    margin-bottom: 1.5rem;
  }

  .upload-button {
    display: inline-block;
    padding: 0.56rem 1.2rem;
    background: var(--accent-copper);
    color: #fff7ed;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.2s ease;
  }

  .upload-button:hover {
    background: var(--accent-copper-strong);
  }
</style>
