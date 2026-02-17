/**
 * Tests for analytics/getMetricsAdmin.ts
 * Covers: auth checks, assertCanRead, aggregation, single store, fallback
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---- hoisted mocks ----
const mocks = vi.hoisted(() => {
  const docData = vi.fn(() => ({}));
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: docData });
  const docRef = { get: docGet, data: docData, exists: false };
  const docFn = vi.fn(() => docRef);

  const colDocs: any[] = [];
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: colDocs });
  const where = vi.fn().mockReturnThis();
  const orderBy = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet, where, orderBy, limit }));

  return { docFn, docGet, docData, colGet, collectionFn, where, orderBy, colDocs, docRef };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
  },
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'HttpsError'; }
  },
  onCall: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

import { getMetricsAdmin } from '../analytics/getMetricsAdmin';

const run = (getMetricsAdmin as any).run;

describe('getMetricsAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset collection mock returns
    mocks.colGet.mockResolvedValue({ empty: true, docs: [] });
    mocks.docGet.mockResolvedValue({ exists: false, data: () => ({}) });
  });

  it('rejeita unauthenticated', async () => {
    await expect(run({ data: { franchiseId: 'f1' } })).rejects.toThrow(/autenticad/i);
  });

  it('rejeita sem franchiseId', async () => {
    await expect(run({
      data: {},
      auth: { uid: 'u1', token: { role: 'superadmin' } },
    })).rejects.toThrow(/franchiseId/i);
  });

  it('superadmin passa assertCanRead direto', async () => {
    // current metrics fallback (no range, no storeId)
    mocks.docGet.mockResolvedValueOnce({ exists: false, data: () => ({}) }); // franchise metrics
    const res = await run({
      data: { franchiseId: 'f1' },
      auth: { uid: 'u1', token: { role: 'superadmin' } },
    });
    expect(res).toHaveProperty('metrics');
  });

  it('non-owner non-member nega acesso', async () => {
    // superadmins/u1 -> not exists
    mocks.docGet
      .mockResolvedValueOnce({ exists: false, data: () => ({}) }) // superadmins check
      .mockResolvedValueOnce({ exists: true, data: () => ({ ownerId: 'other' }) }) // franchise
      .mockResolvedValueOnce({ exists: false, data: () => ({}) }); // member

    await expect(run({
      data: { franchiseId: 'f1' },
      auth: { uid: 'u1', token: {} },
    })).rejects.toThrow(/permiss/i);
  });

  it('retorna metrics/current se storeId informado sem range', async () => {
    // pass assertCanRead as superadmin
    const metricsData = { revenue: 100, orders: 5, paidOrders: 4 };
    mocks.docGet.mockResolvedValueOnce({ exists: true, data: () => metricsData });

    const res = await run({
      data: { franchiseId: 'f1', storeId: 's1' },
      auth: { uid: 'u1', token: { role: 'superadmin' } },
    });

    expect(res.metrics).toBeDefined();
    expect(res.metrics.revenue).toBe(100);
    expect(res.metrics.averageTicket).toBe(20);
  });

  it('retorna null quando metrics/current não existe', async () => {
    mocks.docGet.mockResolvedValueOnce({ exists: false, data: () => ({}) });

    const res = await run({
      data: { franchiseId: 'f1', storeId: 's1' },
      auth: { uid: 'u1', token: { role: 'superadmin' } },
    });

    expect(res.metrics).toBeNull();
  });
});
