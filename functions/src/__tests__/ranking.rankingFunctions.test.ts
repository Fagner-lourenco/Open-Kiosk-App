/**
 * Tests for ranking/rankingFunctions.ts
 * Covers: onOrderUpdatedRanking, recalculateRanking30min, onOrderUpdatedChallenge,
 *         onOrderUpdatedGoldenServe, expirePrizes, expireEventMode
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: () => ({}) });
  const docRef = { set: docSet, update: docUpdate, get: docGet, ref: { update: docUpdate } };
  const docFn = vi.fn(() => docRef);
  const colAdd = vi.fn().mockResolvedValue({ id: 'new-id' });
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 });
  const where = vi.fn().mockReturnThis();
  const orderBy = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const batchUpdate = vi.fn();
  const batchSet = vi.fn();
  const batchDelete = vi.fn();
  const batch = { commit: batchCommit, update: batchUpdate, set: batchSet, delete: batchDelete };
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet, add: colAdd, where, orderBy, limit }));
  const runTransaction = vi.fn(async (cb: any) => {
    const tx = {
      get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
      set: vi.fn(),
      update: vi.fn(),
    };
    return cb(tx);
  });

  return { docSet, docUpdate, docGet, docFn, collectionFn, colGet, where, runTransaction, batch, batchCommit, colAdd };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
    collectionGroup: vi.fn(() => ({ get: mocks.colGet, where: mocks.where })),
    batch: vi.fn(() => mocks.batch),
    runTransaction: mocks.runTransaction,
  },
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TS'),
        increment: vi.fn((n: number) => n),
      },
      Timestamp: {
        now: vi.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
        fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() }),
      },
    },
  },
  increment: vi.fn((n: number) => n),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = (event: any) => handler(event);
    return fn;
  },
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

import * as ranking from '../ranking/rankingFunctions';

describe('ranking/rankingFunctions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.colGet.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mocks.docGet.mockResolvedValue({ exists: false, data: () => ({}) });
  });

  it('exporta onOrderUpdatedRanking', () => {
    expect(ranking.onOrderUpdatedRanking).toBeDefined();
  });

  it('exporta recalculateRanking30min', () => {
    expect(ranking.recalculateRanking30min).toBeDefined();
  });

  it('exporta onOrderUpdatedChallenge', () => {
    expect(ranking.onOrderUpdatedChallenge).toBeDefined();
  });

  it('exporta onOrderUpdatedGoldenServe', () => {
    expect(ranking.onOrderUpdatedGoldenServe).toBeDefined();
  });

  it('exporta expirePrizes', () => {
    expect(ranking.expirePrizes).toBeDefined();
  });

  it('exporta expireEventMode', () => {
    expect(ranking.expireEventMode).toBeDefined();
  });

  describe('onOrderUpdatedRanking', () => {
    const run = (ranking.onOrderUpdatedRanking as any).run;

    it('não faz nada sem data', async () => {
      await run({ data: null });
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it('não faz nada se customerName não apareceu', async () => {
      const event = {
        data: {
          before: { data: () => ({ customerName: null, status: 'pending' }) },
          after: { data: () => ({ customerName: null, status: 'completed' }) },
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o1' },
      };
      await run(event);
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });

    it('agrega quando customerName aparece', async () => {
      const event = {
        data: {
          before: { data: () => ({ customerName: null, status: 'pending' }) },
          after: {
            data: () => ({
              customerName: 'João Silva',
              status: 'completed',
              items: [{ productId: 'p1', quantity: 1, mlPerUnit: 500 }],
              total: 25,
              date: '2026-01-01',
              timestamp: { toMillis: () => Date.now() },
            }),
          },
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o1' },
      };
      await run(event);
      expect(mocks.runTransaction).toHaveBeenCalled();
    });

    it('skippa paymentStatus inválido', async () => {
      const event = {
        data: {
          before: { data: () => ({ customerName: null, status: 'pending' }) },
          after: {
            data: () => ({
              customerName: 'João',
              status: 'completed',
              paymentStatus: 'canceled',
              items: [],
            }),
          },
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o1' },
      };
      await run(event);
      expect(mocks.runTransaction).not.toHaveBeenCalled();
    });
  });

  describe('recalculateRanking30min', () => {
    it('roda sem erros quando não há stores', async () => {
      const run = (ranking.recalculateRanking30min as any).run;
      await expect(run({})).resolves.not.toThrow();
    });
  });

  describe('expirePrizes', () => {
    it('roda sem erros quando não há prêmios', async () => {
      const run = (ranking.expirePrizes as any).run;
      await expect(run({})).resolves.not.toThrow();
    });
  });

  describe('expireEventMode', () => {
    it('roda sem erros', async () => {
      const run = (ranking.expireEventMode as any).run;
      await expect(run({})).resolves.not.toThrow();
    });
  });
});
