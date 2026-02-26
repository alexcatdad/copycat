<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { setupI18n } from './lib/i18n';
  import { detectEngineTier } from './lib/capability';
  import { createEngine } from './lib/engines';
  import { imageFileToPageImage } from './lib/pdf-renderer';
  import { parsePdfDocument } from './lib/pdf-parser';
  import { processPipeline } from './lib/pipeline';
  import { inferQuality } from './lib/quality-score';
  import { clearJobs, listJobs, loadJob, saveJob, type JobListItem } from './lib/storage/jobs-repo';
  import Header from './lib/components/Header.svelte';
  import UploadZone from './lib/components/UploadZone.svelte';
  import HistoryPanel from './lib/components/HistoryPanel.svelte';
  import ProgressBar from './lib/components/ProgressBar.svelte';
  import ProcessingView from './lib/components/ProcessingView.svelte';
  import ResultsView from './lib/components/ResultsView.svelte';
  import Footer from './lib/components/Footer.svelte';
  import type { AppState, EngineTier, OCRResult, OCREngine, PageImage, PdfPageDescriptor } from './lib/types';
  import type { MockProfile } from './lib/engines';

  setupI18n();

  const LOW_QUALITY_THRESHOLD = 0.8;

  let appState = $state<AppState>('idle');
  let engineTier = $state<EngineTier>('basic');
  let pages = $state<PageImage[]>([]);
  let ocrResults = $state<OCRResult[]>([]);
  let pageDescriptors = $state<PdfPageDescriptor[]>([]);
  let currentPage = $state(0);
  let totalPages = $state(0);
  let currentResult = $state<OCRResult | null>(null);
  let modelLoadProgress = $state(0);
  let errorMessage = $state('');
  let engine: OCREngine | null = null;
  let useMockEngine = $state(false);
  let mockProfile = $state<MockProfile>('default');
  let strictEngineSelection = $state(false);
  let forceOcrForPdf = $state(false);
  let sourcePdfBytes = $state<Uint8Array | undefined>(undefined);
  let sourceName = $state('');
  let historyItems = $state<JobListItem[]>([]);
  let historyLoading = $state(true);
  let retryingLowQuality = $state(false);
  let activeJobId = $state<string | null>(null);
  let cachedPdfArtifact = $state<Blob | undefined>(undefined);
  let cachedDocxArtifact = $state<Blob | undefined>(undefined);

  function isEngineTier(value: string | null): value is EngineTier {
    return value === 'premium' || value === 'standard' || value === 'basic';
  }

  function revokePages(items: PageImage[]) {
    for (const page of items) {
      if (page.src.startsWith('blob:')) {
        URL.revokeObjectURL(page.src);
      }
    }
  }

  function replacePages(nextPages: PageImage[]) {
    const prev = pages;
    pages = nextPages;
    revokePages(prev);
  }

  function averageQuality(results: OCRResult[]): number {
    if (results.length === 0) {
      return 0;
    }
    return results.reduce((sum, result) => sum + result.qualityScore, 0) / results.length;
  }

  function fallbackResult(source: OCRResult['source'] = 'ocr'): OCRResult {
    const quality = inferQuality('', source);
    return {
      text: '',
      regions: [],
      source,
      qualityScore: quality.qualityScore,
      qualityFlags: ['empty-result', ...quality.qualityFlags],
    };
  }

  function normalizeResults(maybeResults: Array<OCRResult | null>): OCRResult[] {
    return maybeResults.map((result) => result ?? fallbackResult());
  }

  async function refreshHistory() {
    historyLoading = true;
    try {
      historyItems = await listJobs();
    } finally {
      historyLoading = false;
    }
  }

  async function initEngine(tier: EngineTier): Promise<OCREngine> {
    const eng = await createEngine(useMockEngine ? 'mock' : tier, { mockProfile });
    await eng.initialize((p) => { modelLoadProgress = p; });
    return eng;
  }

  async function ensureActiveEngine(tier: EngineTier): Promise<OCREngine> {
    if (engine) {
      await engine.dispose();
      engine = null;
    }

    try {
      engine = await initEngine(tier);
      return engine;
    } catch (err) {
      if (strictEngineSelection) {
        throw err;
      }

      if (tier !== 'basic') {
        engineTier = 'basic';
        engine = await initEngine('basic');
        return engine;
      }
      throw err;
    }
  }

  async function persistCurrentJob() {
    if (!sourceName || pages.length === 0 || ocrResults.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const jobId = activeJobId ?? crypto.randomUUID();
    activeJobId = jobId;

    await saveJob({
      id: jobId,
      createdAt: now,
      updatedAt: now,
      sourceName,
      engineTier,
      pageCount: pages.length,
      averageQuality: averageQuality(ocrResults),
      pages,
      results: ocrResults,
      originalPdfBytes: sourcePdfBytes,
      pageDescriptors,
      artifacts: {
        pdf: cachedPdfArtifact,
        docx: cachedDocxArtifact,
      },
    });

    await refreshHistory();
  }

  async function handleFiles(files: File[]) {
    const file = files[0];
    if (!file) return;

    sourceName = file.name;
    activeJobId = null;
    cachedPdfArtifact = undefined;
    cachedDocxArtifact = undefined;

    try {
      appState = 'loading-model';
      modelLoadProgress = 0;
      errorMessage = '';
      currentResult = null;
      currentPage = 0;
      totalPages = 0;
      sourcePdfBytes = undefined;
      pageDescriptors = [];
      ocrResults = [];

      const activeEngine = await ensureActiveEngine(engineTier);

      appState = 'processing';

      let parsedPages: PageImage[] = [];
      let descriptors: PdfPageDescriptor[] = [];
      let initialResults: Array<OCRResult | null> = [];

      if (file.type === 'application/pdf') {
        const buffer = await file.arrayBuffer();
        sourcePdfBytes = new Uint8Array(buffer.slice(0));

        const parsed = await parsePdfDocument(buffer.slice(0), (current, total) => {
          currentPage = current;
          totalPages = total;
        });

        parsedPages = parsed.pages;
        if (forceOcrForPdf) {
          descriptors = parsed.descriptors.map((descriptor) => ({
            ...descriptor,
            sourceKind: 'scanned',
            hasNativeText: false,
            nativeResult: null,
          }));
          initialResults = Array.from({ length: parsed.pages.length }, () => null);
        } else {
          descriptors = parsed.descriptors;
          initialResults = parsed.nativeResults;
        }
      } else {
        parsedPages = [await imageFileToPageImage(file, 1)];
        descriptors = [{
          pageNumber: 1,
          sourceKind: 'image',
          hasNativeText: false,
          nativeResult: null,
        }];
        initialResults = [null];
      }

      replacePages(parsedPages);
      pageDescriptors = descriptors;
      totalPages = parsedPages.length;

      const pageIndicesForOcr = descriptors
        .map((descriptor, index) => ({ descriptor, index }))
        .filter(({ descriptor }) => descriptor.sourceKind !== 'pdf-text')
        .map(({ index }) => index);

      const processed = pageIndicesForOcr.length > 0
        ? await processPipeline(activeEngine, parsedPages, {
          pageIndices: pageIndicesForOcr,
          existingResults: initialResults,
          onPageComplete: (_current, _total, pageIndex, result) => {
            currentPage = pageIndex + 1;
            currentResult = result;
          },
        })
        : initialResults;

      ocrResults = normalizeResults(processed);
      currentPage = Math.min(1, totalPages);
      appState = 'complete';

      await persistCurrentJob();
    } catch (err) {
      console.error('Processing failed:', err);
      errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      appState = 'error';
    }
  }

  function handleRestart() {
    appState = 'idle';
    replacePages([]);
    ocrResults = [];
    pageDescriptors = [];
    currentPage = 0;
    totalPages = 0;
    currentResult = null;
    modelLoadProgress = 0;
    errorMessage = '';
    sourcePdfBytes = undefined;
    sourceName = '';
    activeJobId = null;
    cachedPdfArtifact = undefined;
    cachedDocxArtifact = undefined;
  }

  async function handleRetryLowQuality() {
    if (retryingLowQuality || pages.length === 0 || ocrResults.length === 0) {
      return;
    }

    const indices = ocrResults
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.qualityScore < LOW_QUALITY_THRESHOLD && result.source !== 'pdf-text')
      .map(({ index }) => index);

    if (indices.length === 0) {
      return;
    }

    retryingLowQuality = true;
    try {
      const retryTier: EngineTier = engineTier === 'basic'
        ? 'standard'
        : engineTier === 'standard'
          ? 'premium'
          : 'premium';

      const retryEngine = await ensureActiveEngine(retryTier);
      engineTier = retryTier;

      const merged = await processPipeline(retryEngine, pages, {
        pageIndices: indices,
        existingResults: ocrResults,
        onPageComplete: (_current, _total, pageIndex, result) => {
          currentPage = pageIndex + 1;
          currentResult = result;
        },
      });

      ocrResults = normalizeResults(merged);
      await persistCurrentJob();
    } finally {
      retryingLowQuality = false;
    }
  }

  async function handleOpenHistory(jobId: string) {
    const job = await loadJob(jobId);
    if (!job) {
      await refreshHistory();
      return;
    }

    sourceName = job.sourceName;
    engineTier = job.engineTier;
    activeJobId = job.id;
    replacePages(job.pages);
    ocrResults = job.results;
    pageDescriptors = job.pageDescriptors ?? [];
    sourcePdfBytes = job.originalPdfBytes;
    cachedPdfArtifact = job.artifacts?.pdf;
    cachedDocxArtifact = job.artifacts?.docx;
    currentPage = 1;
    totalPages = job.pages.length;
    currentResult = job.results[0] ?? null;
    appState = 'complete';
  }

  async function handleClearHistory() {
    await clearJobs();
    await refreshHistory();
  }

  function handlePdfGenerated(blob: Blob) {
    cachedPdfArtifact = blob;
    void persistCurrentJob();
  }

  function handleDocxGenerated(blob: Blob) {
    cachedDocxArtifact = blob;
    void persistCurrentJob();
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const requestedEngine = params.get('engine');
    strictEngineSelection = params.get('strictEngine') === '1' || params.get('strictEngine') === 'true';
    forceOcrForPdf = params.get('forceOcr') === '1' || params.get('forceOcr') === 'true';

    if (requestedEngine === 'mock') {
      useMockEngine = true;
      engineTier = 'basic';
      const requestedProfile = params.get('mockProfile');
      if (
        requestedProfile === 'default'
        || requestedProfile === 'premium'
        || requestedProfile === 'standard'
        || requestedProfile === 'basic'
        || requestedProfile === 'malformed'
      ) {
        mockProfile = requestedProfile;
      }
    } else if (isEngineTier(requestedEngine)) {
      engineTier = requestedEngine;
    } else {
      engineTier = await detectEngineTier();
    }

    await refreshHistory();
  });

  onDestroy(() => {
    replacePages([]);
    if (engine) {
      void engine.dispose();
      engine = null;
    }
  });
</script>

<div class="app-shell">
  <div class="texture" aria-hidden="true"></div>
  <div class="app">
    <Header tier={engineTier} />

    <main>
      {#if appState === 'idle'}
        <section class="idle-layout">
          <UploadZone onfiles={handleFiles} />
          <HistoryPanel
            jobs={historyItems}
            loading={historyLoading}
            onopen={handleOpenHistory}
            onclear={handleClearHistory}
          />
        </section>
      {:else if appState === 'loading-model'}
        <div class="centered card">
          <ProgressBar progress={modelLoadProgress} label={$_('loading.title')} />
        </div>
      {:else if appState === 'processing'}
        <ProcessingView
          currentPage={currentPage}
          totalPages={totalPages}
          pageImage={pages[Math.max(0, currentPage - 1)] ?? null}
          ocrResult={currentResult}
        />
      {:else if appState === 'complete'}
        <ResultsView
          {pages}
          results={ocrResults}
          {pageDescriptors}
          sourcePdfBytes={sourcePdfBytes}
          retryingLowQuality={retryingLowQuality}
          onretrylowquality={handleRetryLowQuality}
          onrestart={handleRestart}
          onpdfgenerated={handlePdfGenerated}
          ondocxgenerated={handleDocxGenerated}
        />
      {:else if appState === 'error'}
        <div class="error-view card">
          <h2>{$_('errors.processing_failed', { values: { page: '' } })}</h2>
          <p class="error-message">{errorMessage}</p>
          <button class="restart-button" onclick={handleRestart}>
            {$_('results.restart')}
          </button>
        </div>
      {/if}
    </main>

    <Footer />
  </div>
</div>

<style>
  .app-shell {
    min-height: 100vh;
    background: radial-gradient(circle at 12% 12%, color-mix(in oklab, var(--accent-copper), white 74%), transparent 42%),
      radial-gradient(circle at 86% 0%, color-mix(in oklab, var(--accent-teal), white 82%), transparent 46%),
      var(--bg-main);
    position: relative;
    overflow-x: hidden;
  }

  .texture {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(color-mix(in oklab, var(--ink-muted), transparent 85%) 0.4px, transparent 0.4px);
    background-size: 2px 2px;
    opacity: 0.2;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 1;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2rem;
    max-width: 1180px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .idle-layout {
    display: grid;
    gap: 1.2rem;
    animation: reveal 340ms ease both;
  }

  .card {
    background: var(--surface-2);
    border: 1px solid var(--border-color);
    border-radius: 18px;
    padding: 1.4rem;
  }

  .centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 280px;
  }

  .error-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.9rem;
    text-align: center;
  }

  .error-view h2 {
    color: #9f2a1b;
    margin: 0;
  }

  .error-message {
    color: var(--ink-muted);
    font-family: var(--font-mono);
    font-size: 0.84rem;
    background: var(--surface-1);
    padding: 1rem;
    border-radius: 10px;
    max-width: 620px;
    word-break: break-word;
  }

  .restart-button {
    padding: 0.55rem 1.15rem;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--surface-1);
    color: var(--ink-strong);
    cursor: pointer;
  }

  @keyframes reveal {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
