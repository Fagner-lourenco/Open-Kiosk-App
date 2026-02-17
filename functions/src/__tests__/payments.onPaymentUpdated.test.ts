/**
 * Tests for payments/onPaymentUpdated.ts
 * Covers: Firestore trigger - notification on status change
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const docSet = vi.fn().mockResolvedValue(undefined);
  const notifDoc = { id: 'notif-1', set: docSet };
  const colGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
  const where = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const collectionFn = vi.fn(() => ({ doc: vi.fn(() => notifDoc), get: colGet, where, limit }));

  return { docSet, colGet, collectionFn, where };
});

vi.mock('../lib', () => ({
  db: { collection: mocks.collectionFn, doc: vi.fn() },
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
    },
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = (event: any) => handler(event);
    return fn;
  },
}));

vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

import { onPaymentUpdated } from '../payments/onPaymentUpdated';

const run = (onPaymentUpdated as any).run;

describe('payments/onPaymentUpdated', () => {
  beforeEach(() => vi.clearAllMocks());

  it('é exportado', () => {
    expect(onPaymentUpdated).toBeDefined();
    expect(typeof run).toBe('function');
  });

  it('não faz nada sem data', async () => {
    await run({ data: null });
    expect(mocks.docSet).not.toHaveBeenCalled();
  });

  it('não cria notificação se status não mudou para alerta', async () => {
    const event = {
      data: {
        before: { data: () => ({ status: 'pending' }) },
        after: { data: () => ({ status: 'paid' }) },
      },
      params: { franchiseId: 'f1', storeId: 's1', paymentId: 'p1' },
    };
    await run(event);
    expect(mocks.docSet).not.toHaveBeenCalled();
  });

  it('cria notificação para status failed', async () => {
    const event = {
      data: {
        before: { data: () => ({ status: 'pending', requiresRefund: false }) },
        after: { data: () => ({ status: 'failed', requiresRefund: false, amount: 50.00, orderId: 'ord-123456' }) },
      },
      params: { franchiseId: 'f1', storeId: 's1', paymentId: 'p1' },
    };
    await run(event);
    expect(mocks.docSet).toHaveBeenCalled();
    const notifData = mocks.docSet.mock.calls[0][0];
    expect(notifData.title).toContain('Falhou');
  });

  it('cria notificação critical para requiresRefund', async () => {
    const event = {
      data: {
        before: { data: () => ({ status: 'paid', requiresRefund: false }) },
        after: { data: () => ({ status: 'paid', requiresRefund: true, amount: 30, orderId: 'ord-789' }) },
      },
      params: { franchiseId: 'f1', storeId: 's1', paymentId: 'p1' },
    };
    await run(event);
    expect(mocks.docSet).toHaveBeenCalled();
    const notifData = mocks.docSet.mock.calls[0][0];
    expect(notifData.priority).toBe('critical');
  });

  it('deduplica notificações', async () => {
    mocks.colGet.mockResolvedValueOnce({ empty: false, docs: [{}] });
    const event = {
      data: {
        before: { data: () => ({ status: 'pending', requiresRefund: false }) },
        after: { data: () => ({ status: 'canceled', requiresRefund: false, amount: 10 }) },
      },
      params: { franchiseId: 'f1', storeId: 's1', paymentId: 'p1' },
    };
    await run(event);
    expect(mocks.docSet).not.toHaveBeenCalled();
  });
});
