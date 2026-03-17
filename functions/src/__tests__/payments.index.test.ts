/**
 * Tests for payments/index.ts
 * Covers: createPayment, pagbankWebhook, cancelPagBankPayment, syncPendingPayments
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docGet = vi.fn().mockResolvedValue({ exists: true, data: () => ({ status: 'pending', provider: 'pagbank' }) });
  const docSet = vi.fn().mockResolvedValue(undefined);
  const docFn = vi.fn(() => ({ get: docGet, set: docSet }));
  const collectionFn = vi.fn(() => ({ doc: docFn }));
  // F-11: runTransaction mock that passes a txn object with get/set mirroring docRef
  const runTransaction = vi.fn(async (fn: any) => {
    const txn = {
      get: docGet,
      set: docSet,
    };
    return fn(txn);
  });

  return { docGet, docSet, docFn, collectionFn, runTransaction };
});

vi.mock('../lib', () => ({
  db: { doc: mocks.docFn, collection: mocks.collectionFn, runTransaction: mocks.runTransaction },
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
    },
  },
  requireAuth: vi.fn((ctx: any) => { if (!ctx.auth) throw new Error('Usuário não autenticado'); }),
  requireFranchiseAccess: vi.fn(),
  requireStoreAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./paymentService', () => ({
  createPaymentIntent: vi.fn().mockResolvedValue({ paymentId: 'p1', status: 'pending' }),
  parseReferenceId: vi.fn().mockReturnValue(null),
  syncPendingPaymentsForPagBank: vi.fn().mockResolvedValue(undefined),
  updatePaymentStatus: vi.fn().mockResolvedValue(undefined),
  verifyPagBankSignature: vi.fn().mockReturnValue(true),
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
  onRequest: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = typeof _opts === 'function' ? _opts : handler;
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

import { createPayment, pagbankWebhook, cancelPagBankPayment, syncPendingPayments } from '../payments/index';

describe('payments/index', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exporta createPayment', () => expect(createPayment).toBeDefined());
  it('exporta pagbankWebhook', () => expect(pagbankWebhook).toBeDefined());
  it('exporta cancelPagBankPayment', () => expect(cancelPagBankPayment).toBeDefined());
  it('exporta syncPendingPayments', () => expect(syncPendingPayments).toBeDefined());

  describe('cancelPagBankPayment', () => {
    const run = (cancelPagBankPayment as any).run;

    it('rejeita não autenticado', async () => {
      await expect(run({ data: {} })).rejects.toThrow(/autenticad/i);
    });

    it('rejeita sem parâmetros', async () => {
      await expect(run({
        data: {},
        auth: { uid: 'u1', token: { role: 'admin', franchiseId: 'f1' } },
      })).rejects.toThrow(/obrigatório|franchiseId/i);
    });

    it('retorna already_paid para pagamento terminal', async () => {
      mocks.docGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ status: 'paid', provider: 'pagbank' }),
      });

      const result = await run({
        data: { franchiseId: 'f1', storeId: 's1', paymentId: 'p1' },
        auth: { uid: 'u1', token: { role: 'admin', franchiseId: 'f1' } },
      });
      expect(result.reason).toContain('already_paid');
    });
  });

  describe('pagbankWebhook', () => {
    const run = (pagbankWebhook as any).run;

    it('rejeita método não-POST', async () => {
      const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
      await run({ method: 'GET' }, res);
      expect(res.status).toHaveBeenCalledWith(405);
    });
  });
});
