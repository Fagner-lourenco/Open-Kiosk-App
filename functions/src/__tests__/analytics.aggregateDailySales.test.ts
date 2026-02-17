/**
 * Tests for analytics/aggregateDailySales.ts
 * Tests: scheduled aggregation, callable with auth/superadmin check
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const set = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn();
  const docFn = vi.fn(() => ({ get, set, exists: true }));
  const where = vi.fn().mockReturnThis();
  const orderBy = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: docFn, get, where, orderBy, limit }));

  return { set, get, docFn, collectionFn, where };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
  },
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
      Timestamp: { fromDate: (d: Date) => d },
    },
  },
}));

vi.mock('firebase-functions/v2/https', () => {
  const { HttpsError } = require('firebase-functions/v2/https');
  return {
    HttpsError: class extends Error {
      code: string;
      constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'HttpsError'; }
    },
    onCall: (_opts: any, handler: any) => {
      const fn: any = {};
      fn.run = handler;
      fn.__trigger = {};
      return fn;
    },
  };
});

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = handler;
    fn.__trigger = {};
    return fn;
  },
}));

import { aggregateDailySales, aggregateDailySalesHTTP } from '../analytics/aggregateDailySales';

describe('aggregateDailySales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports aggregateDailySales (scheduled)', () => {
    expect(aggregateDailySales).toBeDefined();
    expect(typeof (aggregateDailySales as any).run).toBe('function');
  });

  it('exports aggregateDailySalesHTTP (callable)', () => {
    expect(aggregateDailySalesHTTP).toBeDefined();
    expect(typeof (aggregateDailySalesHTTP as any).run).toBe('function');
  });

  describe('aggregateDailySalesHTTP', () => {
    it('deve rejeitar usuario nao autenticado', async () => {
      await expect(
        (aggregateDailySalesHTTP as any).run({ data: { date: '2026-01-01' } }),
      ).rejects.toThrow(/authenticated|autenticad/i);
    });

    it('deve rejeitar non-superadmin', async () => {
      mocks.get.mockResolvedValueOnce({ exists: false }); // superadmins doc
      await expect(
        (aggregateDailySalesHTTP as any).run({
          data: { date: '2026-01-01' },
          auth: { uid: 'u1', token: { role: 'operator' } },
        }),
      ).rejects.toThrow(/superadmin|permiss/i);
    });

    it('deve exigir date', async () => {
      mocks.get.mockResolvedValueOnce({ exists: true }); // superadmins doc
      await expect(
        (aggregateDailySalesHTTP as any).run({
          data: {},
          auth: { uid: 'u1', token: { role: 'superadmin' } },
        }),
      ).rejects.toThrow(/date/i);
    });
  });
});
