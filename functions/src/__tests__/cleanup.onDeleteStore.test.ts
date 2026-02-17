/**
 * Tests for cleanup/onDeleteStore.ts
 * Covers: cascade delete of 32 subcollections
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const batchDelete = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const batchFn = vi.fn(() => ({ delete: batchDelete, commit: batchCommit }));
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 });
  const limit = vi.fn(() => ({ get: colGet }));
  const docFn = vi.fn(() => ({ ref: 'docRef' }));
  const collectionFn = vi.fn(() => ({ doc: docFn, limit, get: colGet }));

  return { batchDelete, batchCommit, batchFn, colGet, docFn, collectionFn, limit };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
    batch: mocks.batchFn,
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: (path: any, handler: any) => {
    const fn: any = {};
    fn.run = (event: any) => handler(event);
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { onDeleteStore } from '../cleanup/onDeleteStore';

const run = (onDeleteStore as any).run;

describe('cleanup/onDeleteStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('é exportado', () => {
    expect(onDeleteStore).toBeDefined();
    expect(typeof run).toBe('function');
  });

  it('percorre subcollections e não crasheia', async () => {
    const event = {
      params: { franchiseId: 'f1', storeId: 's1' },
      data: { data: () => ({ name: 'Test Store' }) },
    };

    await run(event);

    // Deve ter chamado collection para cada subcollection
    expect(mocks.collectionFn).toHaveBeenCalled();
    // At least 32 subcollections checked
    expect(mocks.collectionFn.mock.calls.length).toBeGreaterThanOrEqual(32);
  });
});
