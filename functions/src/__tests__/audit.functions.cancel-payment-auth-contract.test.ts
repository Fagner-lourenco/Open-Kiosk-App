import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const paymentGet = vi.fn();
  const paymentSet = vi.fn().mockResolvedValue(undefined);
  const paymentRef = {
    get: paymentGet,
    set: paymentSet,
  };
  // F-11: runTransaction mock for transactional cancel
  const runTransaction = vi.fn(async (fn: any) => {
    const txn = {
      get: paymentGet,
      set: paymentSet,
    };
    return fn(txn);
  });

  return {
    paymentGet,
    paymentSet,
    doc: vi.fn(() => paymentRef),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    runTransaction,
  };
});

vi.mock('../lib', () => {
  const { HttpsError } = require('firebase-functions/v2/https');
  return {
    db: {
      doc: mocks.doc,
      runTransaction: mocks.runTransaction,
    },
    admin: {
      firestore: {
        FieldValue: {
          serverTimestamp: mocks.serverTimestamp,
        },
      },
    },
    requireAuth: (request: any) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
      }
    },
    requireFranchiseAccess: (request: any, franchiseId: string) => {
      if (!request.auth) throw new HttpsError('unauthenticated', 'Usuário não autenticado');
      const userFranchiseId = request.auth.token?.franchiseId;
      const userRole = request.auth.token?.role;
      if (userRole === 'superadmin') return;
      if (userFranchiseId !== franchiseId) {
        throw new HttpsError('permission-denied', 'Você não tem acesso a esta franquia');
      }
    },
    requireStoreAccess: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../payments/paymentService', () => ({
  createPaymentIntent: vi.fn(),
  parseReferenceId: vi.fn(),
  syncPendingPaymentsForPagBank: vi.fn(),
  updatePaymentStatus: vi.fn(),
  verifyPagBankSignature: vi.fn(),
}));

import { cancelPagBankPayment } from '../payments';

describe('Audit Functions - cancelPagBankPayment auth contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paymentGet.mockResolvedValue({
      exists: true,
      data: () => ({
        status: 'pending',
        provider: 'pagbank',
        orderId: 'ord-1',
      }),
    });
  });

  it('cancelPagBankPayment deve exigir usuario autenticado (RED)', async () => {
    await expect(
      (cancelPagBankPayment as any).run({
        data: { franchiseId: 'f-1', storeId: 's-1', paymentId: 'p-1' },
      }),
    ).rejects.toThrow(/unauthenticated|autenticado|permission/i);
  });

  it('cancelPagBankPayment marca cancel_requested para pagamentos pendentes', async () => {
    const result = await (cancelPagBankPayment as any).run({
      data: { franchiseId: 'f-1', storeId: 's-1', paymentId: 'p-1' },
      auth: { uid: 'user-1', token: { role: 'operator', franchiseId: 'f-1' } },
    });

    expect(result).toEqual({ canceled: false, reason: 'cancel_requested' });
    // F-11: txn.set receives (ref, data, options) — 3 args
    expect(mocks.paymentSet).toHaveBeenCalledWith(
      expect.anything(), // paymentRef
      expect.objectContaining({
        cancelRequested: true,
        cancelRequestedAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP',
      }),
      { merge: true },
    );
  });

  it('cancelPagBankPayment nao altera pagamentos em estado terminal', async () => {
    mocks.paymentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        status: 'paid',
        provider: 'pagbank',
        orderId: 'ord-2',
      }),
    });

    const result = await (cancelPagBankPayment as any).run({
      data: { franchiseId: 'f-1', storeId: 's-1', paymentId: 'p-2' },
      auth: { uid: 'user-1', token: { role: 'operator', franchiseId: 'f-1' } },
    });

    expect(result).toEqual({ canceled: false, reason: 'already_paid' });
    expect(mocks.paymentSet).not.toHaveBeenCalled();
  });
});
