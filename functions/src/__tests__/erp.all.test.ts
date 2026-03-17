/**
 * Tests for ERP module files:
 * - erp/aggregateOperationalDaily.ts
 * - erp/checkKegLevels.ts
 * - erp/checkMaintenanceOverdue.ts
 * - erp/cleanupOldNotifications.ts
 * - erp/onServingSessionCreated.ts
 * - erp/onWastageEventCreated.ts
 * - erp/resetTapDailyCounters.ts
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mocks = vi.hoisted(() => {
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docDelete = vi.fn().mockResolvedValue(undefined);
  const docGet = vi.fn(async function (this: { path?: string }) {
    if (this?.path?.includes('/kegs/')) {
      return { exists: true, data: () => ({ batchCode: 'BATCH-01' }) };
    }
    return { exists: false, data: () => ({}) };
  });

  const docFn = vi.fn((docPath?: string) => ({
    path: docPath ?? 'doc-path',
    id: 'doc-id',
    set: docSet,
    update: docUpdate,
    get: docGet,
    delete: docDelete,
  }));

  const colDocs: any[] = [];
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: colDocs, size: 0 });
  const collectionFn = vi.fn((collectionPath?: string) => {
    const queryRef: any = {
      __kind: 'query',
      path: collectionPath ?? 'collection-path',
      doc: docFn,
      get: colGet,
    };
    queryRef.where = vi.fn(() => queryRef);
    queryRef.orderBy = vi.fn(() => queryRef);
    queryRef.limit = vi.fn(() => queryRef);
    queryRef.select = vi.fn(() => queryRef);
    return queryRef;
  });

  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchDelete = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const batch = {
    set: batchSet,
    update: batchUpdate,
    delete: batchDelete,
    commit: batchCommit,
  };

  const txnGet = vi.fn(async (refOrQuery: any) => {
    if (refOrQuery?.__kind === 'query') {
      return { empty: true, docs: [] };
    }

    return {
      exists: true,
      data: () => ({
        remainingMl: 2000,
        processedEvents: [],
      }),
    };
  });
  const txnSet = vi.fn();
  const txnUpdate = vi.fn();
  const runTransaction = vi.fn(async (callback: any) => callback({
    get: txnGet,
    set: txnSet,
    update: txnUpdate,
  }));

  return {
    batch,
    batchCommit,
    batchDelete,
    batchSet,
    batchUpdate,
    colDocs,
    colGet,
    collectionFn,
    docDelete,
    docFn,
    docGet,
    docSet,
    docUpdate,
    runTransaction,
    txnGet,
    txnSet,
    txnUpdate,
  };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
    batch: vi.fn(() => mocks.batch),
    collectionGroup: vi.fn(() => ({
      get: mocks.colGet,
      where: vi.fn().mockReturnThis(),
    })),
    runTransaction: mocks.runTransaction,
  },
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TS'),
        increment: vi.fn((n: number) => n),
        arrayUnion: vi.fn((...args: any[]) => args),
      },
      Timestamp: {
        now: vi.fn(() => ({ toDate: () => new Date() })),
        fromDate: (d: Date) => d,
      },
    },
  },
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  increment: vi.fn((n: number) => n),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_path: any, handler: any) => {
    const fn: any = {};
    fn.run = (event: any) => handler(event);
    return fn;
  },
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
    }
  },
  onCall: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = typeof _opts === 'function' ? _opts : handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => loggerMocks);

describe('ERP modules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.colGet.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mocks.docGet.mockImplementation(async function (this: { path?: string }) {
      if (this?.path?.includes('/kegs/')) {
        return { exists: true, data: () => ({ batchCode: 'BATCH-01' }) };
      }
      return { exists: false, data: () => ({}) };
    });
    mocks.txnGet.mockImplementation(async (refOrQuery: any) => {
      if (refOrQuery?.__kind === 'query') {
        return { empty: true, docs: [] };
      }

      return {
        exists: true,
        data: () => ({
          remainingMl: 2000,
          processedEvents: [],
        }),
      };
    });
  });

  describe('aggregateOperationalDaily', () => {
    it('exporta função scheduled', async () => {
      const mod = await import('../erp/aggregateOperationalDaily');
      const exported = Object.values(mod).filter((value: any) => value?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há dados', async () => {
      const mod = await import('../erp/aggregateOperationalDaily');
      const fn = Object.values(mod).find((value: any) => value?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });

  describe('checkKegLevels', () => {
    it('exporta função scheduled', async () => {
      const mod = await import('../erp/checkKegLevels');
      const exported = Object.values(mod).filter((value: any) => value?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há kegs', async () => {
      const mod = await import('../erp/checkKegLevels');
      const fn = Object.values(mod).find((value: any) => value?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });

  describe('checkMaintenanceOverdue', () => {
    it('exporta função', async () => {
      const mod = await import('../erp/checkMaintenanceOverdue');
      const exported = Object.values(mod).filter((value: any) => value?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há manutenção', async () => {
      const mod = await import('../erp/checkMaintenanceOverdue');
      const fn = Object.values(mod).find((value: any) => value?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });

  describe('cleanupOldNotifications', () => {
    it('exporta função scheduled', async () => {
      const mod = await import('../erp/cleanupOldNotifications');
      const exported = Object.values(mod).filter((value: any) => value?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há notificações', async () => {
      const mod = await import('../erp/cleanupOldNotifications');
      const fn = Object.values(mod).find((value: any) => value?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });

  describe('onServingSessionCreated', () => {
    it('exporta trigger', async () => {
      const mod = await import('../erp/onServingSessionCreated');
      const exported = Object.values(mod).filter((value: any) => value?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('processa evento com transações reais de keg e tap', async () => {
      const mod = await import('../erp/onServingSessionCreated');
      const fn = Object.values(mod).find((value: any) => value?.run) as any;

      const event = {
        params: { franchiseId: 'f1', storeId: 's1', eventId: 'sess1' },
        data: {
          data: () => ({
            tapId: 'tap1',
            kegId: 'keg1',
            targetMl: 500,
            actualMl: 500,
            status: 'completed',
            orderId: 'o1',
            cupIndex: 0,
            franchiseId: 'f1',
            storeId: 's1',
          }),
        },
      };

      await expect(fn.run(event)).resolves.toBeUndefined();
      expect(mocks.runTransaction).toHaveBeenCalledTimes(2);
      expect(mocks.txnUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('/kegs/keg1') }),
        expect.objectContaining({ remainingMl: 1500 })
      );
      expect(mocks.txnSet).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('/taps/tap1') }),
        expect.objectContaining({ todayMlDispensed: 500, todaySessions: 1 }),
        { merge: true }
      );
      expect(loggerMocks.error).not.toHaveBeenCalled();
    });
  });

  describe('onWastageEventCreated', () => {
    it('exporta trigger', async () => {
      const mod = await import('../erp/onWastageEventCreated');
      const exported = Object.values(mod).filter((value: any) => value?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('processa mlLost real e atualiza counters com transação', async () => {
      const mod = await import('../erp/onWastageEventCreated');
      const fn = Object.values(mod).find((value: any) => value?.run) as any;

      const event = {
        params: { franchiseId: 'f1', storeId: 's1', eventId: 'w1' },
        data: {
          data: () => ({
            id: 'w1',
            type: 'manual',
            tapId: 'tap1',
            kegId: 'keg1',
            mlLost: 200,
            source: 'manual',
            franchiseId: 'f1',
            storeId: 's1',
          }),
        },
      };

      await expect(fn.run(event)).resolves.toBeUndefined();
      expect(mocks.runTransaction).toHaveBeenCalledTimes(3);
      expect(mocks.txnUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('/kegs/keg1') }),
        expect.objectContaining({ remainingMl: 1800 })
      );
      expect(mocks.txnSet).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('/taps/tap1') }),
        expect.objectContaining({ todayWastageMl: 200 }),
        { merge: true }
      );
      expect(loggerMocks.warn).not.toHaveBeenCalled();
      expect(loggerMocks.error).not.toHaveBeenCalled();
    });
  });

  describe('resetTapDailyCounters', () => {
    it('exporta função scheduled', async () => {
      const mod = await import('../erp/resetTapDailyCounters');
      const exported = Object.values(mod).filter((value: any) => value?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há taps', async () => {
      const mod = await import('../erp/resetTapDailyCounters');
      const fn = Object.values(mod).find((value: any) => value?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });
});
