import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const paymentGet = vi.fn();
  const paymentSet = vi.fn().mockResolvedValue(undefined);
  const paymentRef = {
    get: paymentGet,
    set: paymentSet,
  };

  return {
    paymentGet,
    paymentSet,
    doc: vi.fn(() => paymentRef),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  };
});

vi.mock('../lib', () => ({
  db: {
    doc: mocks.doc,
  },
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: mocks.serverTimestamp,
      },
    },
  },
}));

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
      (cancelPagBankPayment as any).run(
        { franchiseId: 'f-1', storeId: 's-1', paymentId: 'p-1' },
        {},
      ),
    ).rejects.toThrow(/unauthenticated|autenticado|permission/i);
  });

  it('cancelPagBankPayment marca cancel_requested para pagamentos pendentes', async () => {
    const result = await (cancelPagBankPayment as any).run(
      { franchiseId: 'f-1', storeId: 's-1', paymentId: 'p-1' },
      { auth: { uid: 'user-1', token: { role: 'operator' } } },
    );

    expect(result).toEqual({ canceled: false, reason: 'cancel_requested' });
    expect(mocks.paymentSet).toHaveBeenCalledWith(
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

    const result = await (cancelPagBankPayment as any).run(
      { franchiseId: 'f-1', storeId: 's-1', paymentId: 'p-2' },
      { auth: { uid: 'user-1', token: { role: 'operator' } } },
    );

    expect(result).toEqual({ canceled: false, reason: 'already_paid' });
    expect(mocks.paymentSet).not.toHaveBeenCalled();
  });
});
