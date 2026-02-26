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
    <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
    border: 2px dashed var(--border-color, #d1d5db);
    border-radius: 12px;
    padding: 3rem 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--bg-subtle, #f9fafb);
  }

  .upload-zone:hover,
  .upload-zone.drag-over {
    border-color: var(--accent, #3b82f6);
    background: var(--bg-accent-subtle, #eff6ff);
  }

  .upload-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 1rem;
    color: var(--text-muted, #9ca3af);
  }

  .dropzone-text {
    font-size: 1.1rem;
    color: var(--text-primary, #374151);
    margin-bottom: 0.5rem;
  }

  .formats-text {
    font-size: 0.875rem;
    color: var(--text-muted, #9ca3af);
    margin-bottom: 1.5rem;
  }

  .upload-button {
    display: inline-block;
    padding: 0.6rem 1.5rem;
    background: var(--accent, #3b82f6);
    color: white;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.2s;
  }

  .upload-button:hover {
    background: var(--accent-hover, #2563eb);
  }
</style>
