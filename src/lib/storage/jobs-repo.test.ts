import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobRecord } from '../types';
import { clearJobs, enforceRetention, listJobs, loadJob, saveJob } from './jobs-repo';

function createJob(overrides: Partial<Omit<JobRecord, 'expiresAt'>> = {}): Omit<JobRecord, 'expiresAt'> {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    sourceName: overrides.sourceName ?? 'test.pdf',
    engineTier: overrides.engineTier ?? 'basic',
    pageCount: overrides.pageCount ?? 1,
    averageQuality: overrides.averageQuality ?? 0.9,
    pages: overrides.pages ?? [
      {
        id: 'page-1',
        src: 'blob:page-1',
        blob: new Blob(['p1'], { type: 'image/png' }),
        width: 800,
        height: 1200,
        pageNumber: 1,
        sourceKind: 'image',
      },
    ],
    results: overrides.results ?? [
      {
        text: 'Hello world',
        regions: [{ text: 'Hello world', bbox: [10, 10, 100, 20] }],
        source: 'ocr',
        qualityScore: 0.9,
        qualityFlags: [],
      },
    ],
    originalPdfBytes: overrides.originalPdfBytes,
    pageDescriptors: overrides.pageDescriptors,
    artifacts: overrides.artifacts,
  };
}

describe('jobs-repo', () => {
  beforeEach(async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:job-page');
    await clearJobs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves and lists jobs by recency', async () => {
    const base = Date.now();
    const older = createJob({
      id: 'older',
      updatedAt: new Date(base - 60_000).toISOString(),
    });
    const newer = createJob({
      id: 'newer',
      updatedAt: new Date(base).toISOString(),
    });

    await saveJob(older);
    await saveJob(newer);

    const jobs = await listJobs();
    expect(jobs[0].id).toBe('newer');
    expect(jobs[1].id).toBe('older');
  });

  it('loads a persisted job including page blobs', async () => {
    const job = createJob({ id: 'job-load' });
    await saveJob(job);

    const loaded = await loadJob('job-load');
    expect(loaded).not.toBeNull();
    expect(loaded?.results[0].text).toBe('Hello world');
    expect(loaded?.pages[0].blob).toBeInstanceOf(Blob);
    expect(loaded?.pages[0].src.startsWith('blob:')).toBe(true);
  });

  it('evicts expired jobs', async () => {
    const expiredUpdatedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await saveJob(createJob({ id: 'expired', updatedAt: expiredUpdatedAt, createdAt: expiredUpdatedAt }));
    await saveJob(createJob({ id: 'fresh' }));

    await enforceRetention();
    const jobs = await listJobs(10);

    expect(jobs.map((job) => job.id)).toEqual(['fresh']);
  });

  it('caps history at 200 docs', async () => {
    for (let i = 0; i < 205; i++) {
      const date = new Date(Date.now() - (205 - i) * 1000).toISOString();
      await saveJob(createJob({ id: `job-${i}`, updatedAt: date, createdAt: date }));
    }

    const jobs = await listJobs(300);
    expect(jobs).toHaveLength(200);
  });
});
