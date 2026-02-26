import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { EngineTier, OCRResult, PageSourceKind, PdfPageDescriptor } from '../types';

export const COPYCAT_DB_NAME = 'copycat-db';
const COPYCAT_DB_VERSION = 1;

export interface StoredJob {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceName: string;
  engineTier: EngineTier;
  pageCount: number;
  averageQuality: number;
  expiresAt: string;
  results: OCRResult[];
  pageDescriptors?: PdfPageDescriptor[];
  originalPdfBytes?: Uint8Array;
}

export interface StoredPage {
  id: string;
  jobId: string;
  pageNumber: number;
  width: number;
  height: number;
  sourceKind: PageSourceKind;
  bytes: Uint8Array;
  mimeType: string;
}

export interface StoredArtifact {
  id: string;
  jobId: string;
  kind: 'pdf' | 'docx';
  bytes: Uint8Array;
  mimeType: string;
}

interface CopycatDB extends DBSchema {
  jobs: {
    key: string;
    value: StoredJob;
    indexes: {
      byUpdatedAt: string;
      byExpiresAt: string;
    };
  };
  pages: {
    key: string;
    value: StoredPage;
    indexes: {
      byJobId: string;
      byJobPage: [string, number];
    };
  };
  artifacts: {
    key: string;
    value: StoredArtifact;
    indexes: {
      byJobId: string;
      byJobKind: [string, string];
    };
  };
}

let dbPromise: Promise<IDBPDatabase<CopycatDB>> | null = null;

export function getCopycatDb(): Promise<IDBPDatabase<CopycatDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CopycatDB>(COPYCAT_DB_NAME, COPYCAT_DB_VERSION, {
      upgrade(db) {
        const jobs = db.createObjectStore('jobs', { keyPath: 'id' });
        jobs.createIndex('byUpdatedAt', 'updatedAt');
        jobs.createIndex('byExpiresAt', 'expiresAt');

        const pages = db.createObjectStore('pages', { keyPath: 'id' });
        pages.createIndex('byJobId', 'jobId');
        pages.createIndex('byJobPage', ['jobId', 'pageNumber']);

        const artifacts = db.createObjectStore('artifacts', { keyPath: 'id' });
        artifacts.createIndex('byJobId', 'jobId');
        artifacts.createIndex('byJobKind', ['jobId', 'kind']);
      },
    });
  }

  return dbPromise;
}
