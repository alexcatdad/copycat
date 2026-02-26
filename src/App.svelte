<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { setupI18n } from './lib/i18n';
  import { detectEngineTier } from './lib/capability';
  import { createEngine } from './lib/engines';
  import { renderPdfPages, imageFileToPageImage } from './lib/pdf-renderer';
  import { processPipeline } from './lib/pipeline';
  import Header from './lib/components/Header.svelte';
  import UploadZone from './lib/components/UploadZone.svelte';
  import ProgressBar from './lib/components/ProgressBar.svelte';
  import ProcessingView from './lib/components/ProcessingView.svelte';
  import ResultsView from './lib/components/ResultsView.svelte';
  import Footer from './lib/components/Footer.svelte';
  import type { AppState, EngineTier, PageImage, OCRResult, OCREngine } from './lib/types';

  setupI18n();

  let appState = $state<AppState>('idle');
  let engineTier = $state<EngineTier>('basic');
  let pages = $state<PageImage[]>([]);
  let ocrResults = $state<OCRResult[]>([]);
  let currentPage = $state(0);
  let totalPages = $state(0);
  let currentResult = $state<OCRResult | null>(null);
  let modelLoadProgress = $state(0);
  let engine: OCREngine | null = null;

  onMount(async () => {
    engineTier = await detectEngineTier();
  });

  async function handleFiles(files: File[]) {
    const file = files[0];
    if (!file) return;

    appState = 'loading-model';
    engine = await createEngine(engineTier);
    await engine.initialize((p) => { modelLoadProgress = p; });

    appState = 'processing';

    // Convert file to page images
    if (file.type === 'application/pdf') {
      const buffer = await file.arrayBuffer();
      pages = await renderPdfPages(buffer, (current, total) => {
        currentPage = current;
        totalPages = total;
      });
    } else {
      pages = [await imageFileToPageImage(file, 1)];
    }

    totalPages = pages.length;
    currentPage = 0;
    ocrResults = [];

    ocrResults = await processPipeline(engine, pages, (current, total, result) => {
      currentPage = current;
      currentResult = result;
    });

    appState = 'complete';
  }

  function handleRestart() {
    appState = 'idle';
    pages = [];
    ocrResults = [];
    currentPage = 0;
    totalPages = 0;
    currentResult = null;
    modelLoadProgress = 0;
  }
</script>

<div class="app">
  <Header tier={engineTier} />

  <main>
    {#if appState === 'idle'}
      <UploadZone onfiles={handleFiles} />
    {:else if appState === 'loading-model'}
      <div class="centered">
        <ProgressBar progress={modelLoadProgress} label={$_('loading.title')} />
      </div>
    {:else if appState === 'processing'}
      <ProcessingView
        currentPage={currentPage}
        totalPages={totalPages}
        pageImage={pages[currentPage - 1] ?? null}
        ocrResult={currentResult}
      />
    {:else if appState === 'complete'}
      <ResultsView
        {pages}
        results={ocrResults}
        onrestart={handleRestart}
      />
    {/if}
  </main>

  <Footer />
</div>

<style>
  :global(:root) {
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --bg-subtle: #f9fafb;
    --bg-accent-subtle: #eff6ff;
    --border-color: #e5e7eb;
    --text-primary: #111827;
    --text-muted: #6b7280;
  }

  :global(body) {
    margin: 0;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: var(--text-primary);
    background: white;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
  }
</style>
