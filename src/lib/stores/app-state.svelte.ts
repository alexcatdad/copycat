import type { AppState, EngineTier, PageImage, OCRResult } from '../types';

export const appStore = $state({
  state: 'idle' as AppState,
  engineTier: 'basic' as EngineTier,
  pages: [] as PageImage[],
  ocrResults: [] as OCRResult[],
  currentPage: 0,
  progress: { current: 0, total: 0 },
  modelLoadProgress: 0,
  error: null as string | null,
});

export function resetApp() {
  appStore.state = 'idle';
  appStore.pages = [];
  appStore.ocrResults = [];
  appStore.currentPage = 0;
  appStore.progress = { current: 0, total: 0 };
  appStore.modelLoadProgress = 0;
  appStore.error = null;
}
