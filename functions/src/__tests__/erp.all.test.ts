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

const mocks = vi.hoisted(() => {
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docUpdate = vi.fn().mockResolvedValue(undefined);
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: () => ({}) });
  const docDelete = vi.fn().mockResolvedValue(undefined);
  const docRef = { set: docSet, update: docUpdate, get: docGet, delete: docDelete, id: 'doc-id' };
  const docFn = vi.fn(() => docRef);

  const colDocs: any[] = [];
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: colDocs, size: 0 });
  const where = vi.fn().mockReturnThis();
  const orderBy = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({
    doc: docFn,
    get: colGet,
    where,
    orderBy,
    limit,
    select,
  }));

  return { docSet, docUpdate, docGet, docDelete, docFn, collectionFn, colGet, where, colDocs };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
    batch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    collectionGroup: vi.fn(() => ({
      get: mocks.colGet,
      where: mocks.where,
    })),
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
  onDocumentCreated: (path: any, handler: any) => {
    const fn: any = {};
    fn.run = (event: any) => handler(event);
    return fn;
  },
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; }
  },
  onCall: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = typeof _opts === 'function' ? _opts : handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('ERP modules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.colGet.mockResolvedValue({ empty: true, docs: [], size: 0 });
    mocks.docGet.mockResolvedValue({ exists: false, data: () => ({}) });
  });

  describe('aggregateOperationalDaily', () => {
    it('exporta função scheduled', async () => {
      const mod = await import('../erp/aggregateOperationalDaily');
      const exported = Object.values(mod).filter((v: any) => v?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há dados', async () => {
      const mod = await import('../erp/aggregateOperationalDaily');
      const fn = Object.values(mod).find((v: any) => v?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });

  describe('checkKegLevels', () => {
    it('exporta função scheduled', async () => {
      const mod = await import('../erp/checkKegLevels');
      const exported = Object.values(mod).filter((v: any) => v?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há kegs', async () => {
      const mod = await import('../erp/checkKegLevels');
      const fn = Object.values(mod).find((v: any) => v?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });

  describe('checkMaintenanceOverdue', () => {
    it('exporta função', async () => {
      const mod = await import('../erp/checkMaintenanceOverdue');
      const exported = Object.values(mod).filter((v: any) => v?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há manutenção', async () => {
      const mod = await import('../erp/checkMaintenanceOverdue');
      const fn = Object.values(mod).find((v: any) => v?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });

  describe('cleanupOldNotifications', () => {
    it('exporta função scheduled', async () => {
      const mod = await import('../erp/cleanupOldNotifications');
      const exported = Object.values(mod).filter((v: any) => v?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há notificações', async () => {
      const mod = await import('../erp/cleanupOldNotifications');
      const fn = Object.values(mod).find((v: any) => v?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });

  describe('onServingSessionCreated', () => {
    it('exporta trigger', async () => {
      const mod = await import('../erp/onServingSessionCreated');
      const exported = Object.values(mod).filter((v: any) => v?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('processa evento de serving session', async () => {
      const mod = await import('../erp/onServingSessionCreated');
      const fn = Object.values(mod).find((v: any) => v?.run) as any;
      if (fn) {
        const event = {
          params: { franchiseId: 'f1', storeId: 's1', eventId: 'sess1' },
          data: {
            data: () => ({
              tapId: 'tap1',
              kegId: null,
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
        await expect(fn.run(event)).resolves.not.toThrow();
      }
    });
  });

  describe('onWastageEventCreated', () => {
    it('exporta trigger', async () => {
      const mod = await import('../erp/onWastageEventCreated');
      const exported = Object.values(mod).filter((v: any) => v?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('processa evento de wastage', async () => {
      const mod = await import('../erp/onWastageEventCreated');
      const fn = Object.values(mod).find((v: any) => v?.run) as any;
      if (fn) {
        const event = {
          params: { franchiseId: 'f1', storeId: 's1', eventId: 'w1' },
          data: {
            data: () => ({
              tapId: 'tap1',
              volumeMl: 200,
              reason: 'spill',
              createdAt: new Date(),
            }),
          },
        };
        await expect(fn.run(event)).resolves.not.toThrow();
      }
    });
  });

  describe('resetTapDailyCounters', () => {
    it('exporta função scheduled', async () => {
      const mod = await import('../erp/resetTapDailyCounters');
      const exported = Object.values(mod).filter((v: any) => v?.run);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('roda sem erros quando não há taps', async () => {
      const mod = await import('../erp/resetTapDailyCounters');
      const fn = Object.values(mod).find((v: any) => v?.run) as any;
      if (fn) {
        await expect(fn.run({})).resolves.not.toThrow();
      }
    });
  });
});
