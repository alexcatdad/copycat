import type { JobRecord, PageImage } from '../types';
import { getCopycatDb, type StoredArtifact, type StoredJob, type StoredPage } from './db';

const MAX_AGE_DAYS = 30;
const MAX_DOCS = 200;

export interface JobListItem {
  id: string;
  sourceName: string;
  createdAt: string;
  updatedAt: string;
  engineTier: JobRecord['engineTier'];
  pageCount: number;
  averageQuality: number;
}

function computeExpiry(dateIso: string): string {
  const date = new Date(dateIso);
  date.setDate(date.getDate() + MAX_AGE_DAYS);
  return date.toISOString();
}

async function toStoredPages(job: JobRecord): Promise<StoredPage[]> {
  const storedPages: StoredPage[] = [];

  for (const page of job.pages) {
    const bytes = new Uint8Array(await page.blob.arrayBuffer());
    storedPages.push({
    id: `${job.id}:${page.pageNumber}`,
    jobId: job.id,
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    sourceKind: page.sourceKind,
      bytes,
      mimeType: page.blob.type || 'image/png',
    });
  }

  return storedPages;
}

async function toStoredArtifacts(job: JobRecord): Promise<StoredArtifact[]> {
  const artifacts: StoredArtifact[] = [];
  if (job.artifacts?.pdf) {
    const bytes = new Uint8Array(await job.artifacts.pdf.arrayBuffer());
    artifacts.push({
      id: `${job.id}:pdf`,
      jobId: job.id,
      kind: 'pdf',
      bytes,
      mimeType: job.artifacts.pdf.type || 'application/pdf',
    });
  }

  if (job.artifacts?.docx) {
    const bytes = new Uint8Array(await job.artifacts.docx.arrayBuffer());
    artifacts.push({
      id: `${job.id}:docx`,
      jobId: job.id,
      kind: 'docx',
      bytes,
      mimeType: job.artifacts.docx.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  return artifacts;
}

function toStoredJob(job: JobRecord): StoredJob {
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    sourceName: job.sourceName,
    engineTier: job.engineTier,
    pageCount: job.pageCount,
    averageQuality: job.averageQuality,
    expiresAt: job.expiresAt,
    results: job.results,
    pageDescriptors: job.pageDescriptors,
    originalPdfBytes: job.originalPdfBytes,
  };
}

async function deleteJobById(jobId: string): Promise<void> {
  const db = await getCopycatDb();
  const tx = db.transaction(['jobs', 'pages', 'artifacts'], 'readwrite');

  await tx.objectStore('jobs').delete(jobId);

  const pageIndex = tx.objectStore('pages').index('byJobId');
  let pageCursor = await pageIndex.openCursor(IDBKeyRange.only(jobId));
  while (pageCursor) {
    await pageCursor.delete();
    pageCursor = await pageCursor.continue();
  }

  const artifactIndex = tx.objectStore('artifacts').index('byJobId');
  let artifactCursor = await artifactIndex.openCursor(IDBKeyRange.only(jobId));
  while (artifactCursor) {
    await artifactCursor.delete();
    artifactCursor = await artifactCursor.continue();
  }

  await tx.done;
}

export async function enforceRetention(): Promise<void> {
  const db = await getCopycatDb();
  const jobs = await db.getAll('jobs');

  const now = Date.now();
  const expired = jobs.filter((job) => new Date(job.expiresAt).getTime() < now);
  for (const job of expired) {
    await deleteJobById(job.id);
  }

  const remaining = (await db.getAll('jobs'))
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  if (remaining.length <= MAX_DOCS) {
    return;
  }

  const overflow = remaining.length - MAX_DOCS;
  for (let i = 0; i < overflow; i++) {
    await deleteJobById(remaining[i].id);
  }
}

export async function saveJob(job: Omit<JobRecord, 'expiresAt'>): Promise<void> {
  const normalizedPages = job.pages.map((page) => ({
    id: `${page.id}`,
    src: `${page.src}`,
    blob: page.blob,
    width: page.width,
    height: page.height,
    pageNumber: page.pageNumber,
    sourceKind: page.sourceKind,
  }));

  const normalizedResults = job.results.map((result) => ({
    text: `${result.text}`,
    regions: result.regions.map((region) => ({
      text: `${region.text}`,
      bbox: [region.bbox[0], region.bbox[1], region.bbox[2], region.bbox[3]] as [number, number, number, number],
    })),
    source: result.source,
    qualityScore: result.qualityScore,
    qualityFlags: [...result.qualityFlags],
  }));

  const normalizedDescriptors = job.pageDescriptors?.map((descriptor) => ({
    pageNumber: descriptor.pageNumber,
    sourceKind: descriptor.sourceKind,
    hasNativeText: descriptor.hasNativeText,
    nativeResult: descriptor.nativeResult
      ? {
        text: `${descriptor.nativeResult.text}`,
        regions: descriptor.nativeResult.regions.map((region) => ({
          text: `${region.text}`,
          bbox: [region.bbox[0], region.bbox[1], region.bbox[2], region.bbox[3]] as [number, number, number, number],
        })),
        source: descriptor.nativeResult.source,
        qualityScore: descriptor.nativeResult.qualityScore,
        qualityFlags: [...descriptor.nativeResult.qualityFlags],
      }
      : null,
  }));

  const normalizedOriginalPdfBytes = job.originalPdfBytes
    ? new Uint8Array(job.originalPdfBytes)
    : undefined;

  const record: JobRecord = {
    ...job,
    pages: normalizedPages,
    results: normalizedResults,
    pageDescriptors: normalizedDescriptors,
    originalPdfBytes: normalizedOriginalPdfBytes,
    expiresAt: computeExpiry(job.updatedAt),
  };

  const storedPages = await toStoredPages(record);
  const storedArtifacts = await toStoredArtifacts(record);
  const db = await getCopycatDb();
  const tx = db.transaction(['jobs', 'pages', 'artifacts'], 'readwrite');

  await tx.objectStore('jobs').put(toStoredJob(record));

  for (const page of storedPages) {
    await tx.objectStore('pages').put(page);
  }

  for (const artifact of storedArtifacts) {
    await tx.objectStore('artifacts').put(artifact);
  }

  await tx.done;
  await enforceRetention();
}

export async function listJobs(limit = 20): Promise<JobListItem[]> {
  const db = await getCopycatDb();
  await enforceRetention();

  const jobs = await db.getAll('jobs');
  return jobs
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit)
    .map((job) => ({
      id: job.id,
      sourceName: job.sourceName,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      engineTier: job.engineTier,
      pageCount: job.pageCount,
      averageQuality: job.averageQuality,
    }));
}

function pageToRuntime(page: StoredPage): PageImage {
  const stableBytes = new Uint8Array(page.bytes.byteLength);
  stableBytes.set(page.bytes);
  const blob = new Blob([stableBytes.buffer], { type: page.mimeType || 'image/png' });
  const src = URL.createObjectURL(blob);
  return {
    id: `page-${page.jobId}-${page.pageNumber}`,
    src,
    blob,
    width: page.width,
    height: page.height,
    pageNumber: page.pageNumber,
    sourceKind: page.sourceKind,
  };
}

export async function loadJob(jobId: string): Promise<JobRecord | null> {
  const db = await getCopycatDb();
  const job = await db.get('jobs', jobId);

  if (!job) {
    return null;
  }

  const pagesIndex = db.transaction('pages').store.index('byJobId');
  const pages = await pagesIndex.getAll(jobId);
  const runtimePages = pages
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map(pageToRuntime);

  const artifactsIndex = db.transaction('artifacts').store.index('byJobId');
  const artifacts = await artifactsIndex.getAll(jobId);

  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    sourceName: job.sourceName,
    engineTier: job.engineTier,
    pageCount: job.pageCount,
    averageQuality: job.averageQuality,
    expiresAt: job.expiresAt,
    pages: runtimePages,
    results: job.results,
    originalPdfBytes: job.originalPdfBytes,
    pageDescriptors: job.pageDescriptors,
    artifacts: {
      pdf: (() => {
        const artifact = artifacts.find((item) => item.kind === 'pdf');
        if (!artifact) return undefined;
        const stableBytes = new Uint8Array(artifact.bytes.byteLength);
        stableBytes.set(artifact.bytes);
        return new Blob([stableBytes.buffer], { type: artifact.mimeType || 'application/pdf' });
      })(),
      docx: (() => {
        const artifact = artifacts.find((item) => item.kind === 'docx');
        if (!artifact) return undefined;
        const stableBytes = new Uint8Array(artifact.bytes.byteLength);
        stableBytes.set(artifact.bytes);
        return new Blob([stableBytes.buffer], { type: artifact.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      })(),
    },
  };
}

export async function clearJobs(): Promise<void> {
  const db = await getCopycatDb();
  const tx = db.transaction(['jobs', 'pages', 'artifacts'], 'readwrite');
  await tx.objectStore('jobs').clear();
  await tx.objectStore('pages').clear();
  await tx.objectStore('artifacts').clear();
  await tx.done;
}
