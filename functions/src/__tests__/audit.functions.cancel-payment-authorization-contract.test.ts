import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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

describe('Audit Functions - cancelPagBankPayment authorization contracts', () => {
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

  it('cancelPagBankPayment deve negar usuario autenticado sem acesso a franquia/loja (RED)', async () => {
    await expect(
      (cancelPagBankPayment as any).run(
        { franchiseId: 'f-1', storeId: 's-1', paymentId: 'p-1' },
        { auth: { uid: 'u-no-access', token: { role: 'viewer', franchiseId: 'f-2', storeId: 's-9' } } },
      ),
    ).rejects.toThrow(/permission|acesso|franquia|loja/i);
  });

  it('cancelPagBankPayment deve conter guardas explicitas de autorizacao no handler (RED)', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/payments/index.ts'),
      'utf8',
    );

    const handlerBlock = source.match(/export const cancelPagBankPayment[\s\S]*?\.https\.onCall\([\s\S]*?\{([\s\S]*?)\}\);/)?.[1] ?? '';

    expect(handlerBlock).toMatch(/requireAuth\s*\(/);
    expect(handlerBlock).toMatch(/requireFranchiseAccess\s*\(|assertStoreAccess\s*\(/);
  });
});
