import { beforeEach, describe, expect, it, vi } from 'vitest';

const makeSnap = (docs: Array<{ id: string; ref: { id: string } }>) => ({
  docs,
  empty: docs.length === 0,
  size: docs.length,
});

const mocks = vi.hoisted(() => {
  const readBatches: Array<Array<{ id: string; ref: { id: string } }>> = [];
  const dismissedBatches: Array<Array<{ id: string; ref: { id: string } }>> = [];
  let readIdx = 0;
  let dismissedIdx = 0;

  const deleteFn = vi.fn();
  const commitFn = vi.fn().mockResolvedValue(undefined);

  const readGet = vi.fn(async () => makeSnap(readBatches[readIdx++] || []));
  const dismissedGet = vi.fn(async () => makeSnap(dismissedBatches[dismissedIdx++] || []));

  const readQuery = {
    limit: vi.fn().mockReturnThis(),
    get: readGet,
  };

  const dismissedQuery = {
    limit: vi.fn().mockReturnThis(),
    get: dismissedGet,
  };

  const notificationsCollection = {
    where: vi.fn((field: string) => {
      if (field !== 'createdAt') {
        return {
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: vi.fn(async () => makeSnap([])),
        };
      }

      return {
        where: vi.fn((field2: string) => {
          if (field2 === 'isRead') return readQuery;
          if (field2 === 'isDismissed') return dismissedQuery;
          return {
            limit: vi.fn().mockReturnThis(),
            get: vi.fn(async () => makeSnap([])),
          };
        }),
      };
    }),
  };

  const franchisesGet = vi.fn(async () => ({
    docs: [{ id: 'f1' }],
    empty: false,
    size: 1,
  }));

  const collection = vi.fn((path: string) => {
    if (path === 'franchises') {
      return {
        get: franchisesGet,
      };
    }

    if (path === 'franchises/f1/notifications') {
      return notificationsCollection;
    }

    return {
      get: vi.fn(async () => ({ docs: [], empty: true, size: 0 })),
      where: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn(async () => makeSnap([])),
      }),
    };
  });

  const reset = () => {
    readBatches.length = 0;
    dismissedBatches.length = 0;
    readIdx = 0;
    dismissedIdx = 0;
    deleteFn.mockClear();
    commitFn.mockClear();
    readGet.mockClear();
    dismissedGet.mockClear();
    franchisesGet.mockClear();
    collection.mockClear();
  };

  return {
    readBatches,
    dismissedBatches,
    deleteFn,
    commitFn,
    readGet,
    dismissedGet,
    franchisesGet,
    collection,
    reset,
  };
});

vi.mock('../lib', () => ({
  db: {
    collection: mocks.collection,
    batch: vi.fn(() => ({
      delete: mocks.deleteFn,
      commit: mocks.commitFn,
    })),
  },
  admin: {
    firestore: {
      Timestamp: {
        fromDate: (date: Date) => date,
      },
    },
  },
}));

import { cleanupOldNotifications } from '../erp/cleanupOldNotifications';

describe('audit - cleanupOldNotifications', () => {
  beforeEach(() => {
    mocks.reset();
  });

  it('deve remover notificacoes antigas dismissed mesmo quando nao estao read', async () => {
    mocks.readBatches.push([]);
    mocks.dismissedBatches.push([{ id: 'n-dismissed', ref: { id: 'n-dismissed' } }]);

    await (cleanupOldNotifications as any).run({});

    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFn).toHaveBeenCalledWith(expect.objectContaining({ id: 'n-dismissed' }));
    expect(mocks.commitFn).toHaveBeenCalledTimes(1);
  });

  it('deve deduplicar docs vindos de read+dismissed no mesmo ciclo', async () => {
    mocks.readBatches.push([
      { id: 'n1', ref: { id: 'n1' } },
      { id: 'n2', ref: { id: 'n2' } },
    ]);
    mocks.dismissedBatches.push([
      { id: 'n2', ref: { id: 'n2' } },
      { id: 'n3', ref: { id: 'n3' } },
    ]);

    await (cleanupOldNotifications as any).run({});

    expect(mocks.deleteFn).toHaveBeenCalledTimes(3);
    const deletedIds = mocks.deleteFn.mock.calls.map((c) => c[0].id).sort();
    expect(deletedIds).toEqual(['n1', 'n2', 'n3']);
  });

  it('deve processar multiplos lotes quando o primeiro enche o batch', async () => {
    const firstBatch = Array.from({ length: 400 }, (_, i) => ({
      id: `r${i}`,
      ref: { id: `r${i}` },
    }));
    const secondBatch = [{ id: 'r-next', ref: { id: 'r-next' } }];

    mocks.readBatches.push(firstBatch, secondBatch, []);
    mocks.dismissedBatches.push([], [], []);

    await (cleanupOldNotifications as any).run({});

    expect(mocks.commitFn).toHaveBeenCalledTimes(2);
    expect(mocks.deleteFn).toHaveBeenCalledTimes(401);
  });
});
