/**
 * Tests for ranking/recalculate30minNow.ts
 * Covers: callable auth, validation, recalculation
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docGet = vi.fn().mockResolvedValue({ exists: false, data: () => ({}) });
  const docFn = vi.fn(() => ({ get: docGet, id: 'doc-id', ref: { path: 'test' } }));
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
  const where = vi.fn().mockReturnThis();
  const orderBy = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: docFn, get: colGet, where, orderBy }));
  const batchCommit = vi.fn().mockResolvedValue(undefined);

  return { docGet, docFn, collectionFn, colGet, where, batchCommit };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.docFn,
    collection: mocks.collectionFn,
    batch: vi.fn(() => ({ commit: mocks.batchCommit, set: vi.fn(), delete: vi.fn(), update: vi.fn() })),
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
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; }
  },
  onCall: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

import { recalculateRanking30minNow } from '../ranking/recalculate30minNow';

const run = (recalculateRanking30minNow as any).run;

describe('ranking/recalculate30minNow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejeita não autenticado', async () => {
    await expect(run({ data: {} })).rejects.toThrow(/autenticad/i);
  });

  it('rejeita sem franchiseId', async () => {
    await expect(run({
      data: {},
      auth: { uid: 'u1', token: { role: 'superadmin' } },
    })).rejects.toThrow(/parâmetros|inválid/i);
  });

  it('superadmin pode executar', async () => {
    const result = await run({
      data: { franchiseId: 'f1', storeId: 's1' },
      auth: { uid: 'u1', token: { role: 'superadmin' } },
    });
    expect(result.success).toBe(true);
  });

  it('rejeita membro inativo', async () => {
    mocks.docGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ ownerId: 'other' }) }) // franchise
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'manager', isActive: false }) }); // member

    await expect(run({
      data: { franchiseId: 'f1', storeId: 's1' },
      auth: { uid: 'u1', token: { role: 'manager' } },
    })).rejects.toThrow(/desativad/i);
  });
});
