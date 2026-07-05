/**
 * Tests for payments/refund.ts
 * Covers: refundMercadoPagoPayment — auth, validação, trava de duplo estorno,
 * chamada ao MP, sucesso, falha do gateway (libera trava)
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const paymentGet = vi.fn();
  const paymentSet = vi.fn().mockResolvedValue(undefined);
  const paymentDocRef = { get: paymentGet, set: paymentSet, id: 'pay-1' };
  const storeGet = vi.fn().mockResolvedValue({ data: () => ({ paymentGatewayConfig: { provider: 'mercado_pago' } }) });
  const auditAdd = vi.fn().mockResolvedValue(undefined);
  const whereLimitGet = vi.fn();
  const collectionFn = vi.fn((path: string) => {
    if (path.includes('auditLogs')) return { add: auditAdd };
    return {
      doc: vi.fn(() => paymentDocRef),
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: whereLimitGet })) })),
    };
  });
  const docFn = vi.fn(() => ({ get: storeGet }));
  const runTransaction = vi.fn(async (fn: any) => fn({ get: paymentGet, set: paymentSet }));

  return { paymentGet, paymentSet, paymentDocRef, storeGet, auditAdd, whereLimitGet, collectionFn, docFn, runTransaction };
});

vi.mock('../lib', () => ({
  db: { collection: mocks.collectionFn, doc: mocks.docFn, runTransaction: mocks.runTransaction },
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TS'),
        delete: vi.fn(() => 'DELETE_SENTINEL'),
      },
    },
  },
  requireAuth: vi.fn((ctx: any) => { if (!ctx.auth) throw new Error('Usuário não autenticado'); }),
  requireFranchiseAccess: vi.fn().mockResolvedValue(undefined),
  requireStoreAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../payments/storeConfig', () => ({
  normalizePaymentGatewayConfig: vi.fn(() => ({ provider: 'mercado_pago' })),
  resolveMercadoPagoConfig: vi.fn(() => ({ accessToken: 'mp-token', environment: 'production' })),
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
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

import { refundMercadoPagoPayment } from '../payments/refund';

const run = (refundMercadoPagoPayment as any).run;

const authCtx = { uid: 'admin-1', token: { role: 'admin', franchiseId: 'f1', email: 'a@b.c' } };
const validData = { franchiseId: 'f1', storeId: 's1', paymentId: 'pay-1' };

const paidPayment = {
  status: 'paid',
  provider: 'mercado_pago',
  providerOrderId: 'mp-order-1',
};

describe('payments/refund', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paymentGet.mockResolvedValue({ exists: true, data: () => ({ ...paidPayment }) });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejeita não autenticado', async () => {
    await expect(run({ data: validData })).rejects.toThrow(/autenticad/i);
  });

  it('rejeita sem paymentId e sem orderId', async () => {
    await expect(run({ data: { franchiseId: 'f1', storeId: 's1' }, auth: authCtx }))
      .rejects.toThrow(/obrigatorio/i);
  });

  it('rejeita pagamento não pago', async () => {
    mocks.paymentGet.mockResolvedValue({ exists: true, data: () => ({ ...paidPayment, status: 'pending' }) });
    await expect(run({ data: validData, auth: authCtx })).rejects.toThrow(/pagos/i);
  });

  it('rejeita provider não Mercado Pago', async () => {
    mocks.paymentGet.mockResolvedValue({ exists: true, data: () => ({ ...paidPayment, provider: 'pagbank' }) });
    await expect(run({ data: validData, auth: authCtx })).rejects.toThrow(/Mercado Pago/i);
  });

  it('retorna already_refunded para pagamento já estornado', async () => {
    mocks.paymentGet.mockResolvedValue({ exists: true, data: () => ({ ...paidPayment, status: 'refunded' }) });
    const result = await run({ data: validData, auth: authCtx });
    expect(result).toEqual({ refunded: true, reason: 'already_refunded' });
  });

  it('rejeita estorno já em andamento (refundRequested)', async () => {
    mocks.paymentGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...paidPayment, refundRequested: true }),
    });
    await expect(run({ data: validData, auth: authCtx })).rejects.toThrow(/em andamento/i);
  });

  it('estorna com sucesso via MP e marca refunded', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' }) as any;

    const result = await run({ data: validData, auth: authCtx });

    expect(result).toEqual({ refunded: true, reason: 'provider_refunded' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/orders/mp-order-1/refund',
      expect.objectContaining({ method: 'POST' })
    );
    // Marca status refunded
    expect(mocks.paymentSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refunded' }),
      { merge: true }
    );
    // Auditoria gravada
    expect(mocks.auditAdd).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payment.refund' })
    );
  });

  it('falha do MP: lança erro e libera trava refundRequested', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'nope' }) as any;

    await expect(run({ data: validData, auth: authCtx })).rejects.toThrow(/recusou/i);

    // Libera trava (delete sentinel)
    expect(mocks.paymentSet).toHaveBeenCalledWith(
      expect.objectContaining({ refundRequested: 'DELETE_SENTINEL' }),
      { merge: true }
    );
    // NÃO marca refunded
    expect(mocks.paymentSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refunded' }),
      { merge: true }
    );
  });

  it('localiza payment por orderId quando paymentId ausente', async () => {
    mocks.whereLimitGet.mockResolvedValue({ empty: false, docs: [{ ref: mocks.paymentDocRef }] });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' }) as any;

    const result = await run({
      data: { franchiseId: 'f1', storeId: 's1', orderId: 'order-9' },
      auth: authCtx,
    });
    expect(result.refunded).toBe(true);
  });

  it('not-found quando orderId não tem payment', async () => {
    mocks.whereLimitGet.mockResolvedValue({ empty: true, docs: [] });
    await expect(run({
      data: { franchiseId: 'f1', storeId: 's1', orderId: 'ghost' },
      auth: authCtx,
    })).rejects.toThrow(/nao encontrado/i);
  });
});
