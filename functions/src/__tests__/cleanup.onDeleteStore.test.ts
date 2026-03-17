/**
 * Tests for cleanup/onDeleteStore.ts
 * Covers: cascade delete of nested descendants when recursiveDelete is unavailable.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const batchDelete = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const batchFn = vi.fn(() => ({ delete: batchDelete, commit: batchCommit }));

  const createSnapshot = (docs: Array<{ ref: { listCollections?: () => Promise<any[]> } }>) => ({
    empty: docs.length === 0,
    docs,
    size: docs.length,
  });

  const emptyCollectionRef = {
    limit: vi.fn(() => ({
      get: vi.fn().mockResolvedValue(createSnapshot([])),
    })),
  };

  const nestedDocRef = {
    listCollections: vi.fn().mockResolvedValue([]),
  };
  const nestedCollectionRef = {
    limit: vi.fn(() => ({
      get: vi.fn().mockResolvedValue(createSnapshot([{ ref: nestedDocRef }])),
    })),
  };
  const rootDocRef = {
    listCollections: vi.fn().mockResolvedValue([nestedCollectionRef]),
  };

  const collectionsByPath: Record<string, { limit: () => { get: () => Promise<ReturnType<typeof createSnapshot>> } }> = {
    'franchises/f1/stores/s1/products': {
      limit: vi.fn(() => ({
        get: vi.fn().mockResolvedValue(createSnapshot([{ ref: rootDocRef }])),
      })),
    },
  };

  const collectionFn = vi.fn((path: string) => collectionsByPath[path] ?? emptyCollectionRef);

  return {
    batchDelete,
    batchCommit,
    batchFn,
    collectionFn,
    nestedDocRef,
    rootDocRef,
  };
});

vi.mock('../lib', () => ({
  db: {
    collection: mocks.collectionFn,
    batch: mocks.batchFn,
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: (_path: unknown, handler: (event: unknown) => Promise<void>) => {
    const fn: { run?: (event: unknown) => Promise<void> } = {};
    fn.run = (event: unknown) => handler(event);
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { onDeleteStore } from '../cleanup/onDeleteStore';

const run = (onDeleteStore as { run: (event: unknown) => Promise<void> }).run;

describe('cleanup/onDeleteStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('é exportado', () => {
    expect(onDeleteStore).toBeDefined();
    expect(typeof run).toBe('function');
  });

  it('apaga descendentes aninhados quando recursiveDelete nao existe', async () => {
    const event = {
      params: { franchiseId: 'f1', storeId: 's1' },
      data: { data: () => ({ name: 'Test Store' }) },
    };

    await run(event);

    expect(mocks.rootDocRef.listCollections).toHaveBeenCalled();
    expect(mocks.nestedDocRef.listCollections).toHaveBeenCalled();
    expect(mocks.batchDelete).toHaveBeenCalledWith(mocks.nestedDocRef);
    expect(mocks.batchDelete).toHaveBeenCalledWith(mocks.rootDocRef);
    expect(mocks.batchCommit).toHaveBeenCalledTimes(2);
  });
});
