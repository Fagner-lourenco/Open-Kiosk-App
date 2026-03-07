/**
 * Tests for analytics/aggOrders.ts
 * Tests: normalizeStatus, status classification, updateMetrics logic
 * Imports the real module — mocks only firebase-functions and ../lib
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const set = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn().mockResolvedValue({ exists: false, data: () => undefined });
  // Dedup subcollection mock (for processedEvents subcollection)
  const dedupGet = vi.fn().mockResolvedValue({ exists: false });
  const dedupSet = vi.fn().mockResolvedValue(undefined);
  const dedupCreate = vi.fn().mockResolvedValue(undefined);
  const dedupDoc = vi.fn(() => ({ get: dedupGet, set: dedupSet, create: dedupCreate }));
  const dedupCollection = vi.fn(() => ({ doc: dedupDoc }));
  const doc = vi.fn(() => ({ set, get, collection: dedupCollection }));
  return {
    set,
    get,
    doc,
    dedupGet,
    dedupSet,
    dedupCreate,
    dedupDoc,
    increment: vi.fn((n: number) => ({ _increment: n })),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    arrayUnion: vi.fn((...args: any[]) => ({ _arrayUnion: args })),
  };
});

vi.mock('../lib', () => ({
  db: { doc: mocks.doc },
  admin: {
    firestore: {
      FieldValue: {
        increment: mocks.increment,
        serverTimestamp: mocks.serverTimestamp,
        arrayUnion: mocks.arrayUnion,
      },
      Timestamp: { fromDate: (d: Date) => d },
    },
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: any, handler: any) => {
    const fn = async (...args: any[]) => handler(...args);
    fn.run = handler;
    fn.__trigger = {};
    return fn;
  },
  onDocumentUpdated: (_opts: any, handler: any) => {
    const fn = async (...args: any[]) => handler(...args);
    fn.run = handler;
    fn.__trigger = {};
    return fn;
  },
}));

import { onOrderCreated, onOrderUpdated } from '../analytics/aggOrders';

describe('aggOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onOrderCreated', () => {
    it('deve atualizar 4 metrics docs para pedido pago', async () => {
      const event = {
        data: {
          data: () => ({
            total: 25.5,
            status: 'completed',
            paymentStatus: 'paid',
            paymentMethod: 'pix',
            createdAt: { toDate: () => new Date('2026-01-15T14:30:00Z') },
          }),
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o1' },
      };

      await (onOrderCreated as any).run(event);

      // 4 doc refs: daily, hourly, store metrics, franchise metrics
      expect(mocks.doc).toHaveBeenCalledTimes(4);
      // 4 set calls: 4 metrics
      expect(mocks.set).toHaveBeenCalledTimes(4);
      // Dedup subcollection: 1 create (atomic idempotency)
      expect(mocks.dedupCreate).toHaveBeenCalledTimes(1);

      // Verify daily doc path
      expect(mocks.doc).toHaveBeenCalledWith('analytics/daily/2026-01-15');

      // Verify metrics include revenue increment
      const firstCall = mocks.set.mock.calls[0][0];
      expect(firstCall.revenue).toEqual({ _increment: 25.5 });
      expect(firstCall.paidOrders).toEqual({ _increment: 1 });
      expect(firstCall.orders).toEqual({ _increment: 1 });
    });

    it('deve classificar pedido cancelado corretamente', async () => {
      const event = {
        data: {
          data: () => ({
            total: 10,
            status: 'canceled',
            paymentStatus: 'failed',
            paymentMethod: 'credit',
          }),
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o2' },
      };

      await (onOrderCreated as any).run(event);

      const firstCall = mocks.set.mock.calls[0][0];
      expect(firstCall.cancelledOrders).toEqual({ _increment: 1 });
      expect(firstCall.revenue).toEqual({ _increment: 0 });
    });

    it('deve aceitar variante cancelled (com double-l)', async () => {
      const event = {
        data: {
          data: () => ({
            total: 5,
            status: 'cancelled',
            paymentStatus: 'failed',
          }),
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o3' },
      };

      await (onOrderCreated as any).run(event);

      const firstCall = mocks.set.mock.calls[0][0];
      expect(firstCall.cancelledOrders).toEqual({ _increment: 1 });
    });

    it('deve classificar pedido pending corretamente', async () => {
      const event = {
        data: {
          data: () => ({
            total: 15,
            status: 'pending',
            paymentStatus: 'pending',
          }),
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o4' },
      };

      await (onOrderCreated as any).run(event);

      const firstCall = mocks.set.mock.calls[0][0];
      expect(firstCall.pendingOrders).toEqual({ _increment: 1 });
      expect(firstCall.revenue).toEqual({ _increment: 0 });
    });

    it('deve tratar paid_pending_dispense como pedido pago', async () => {
      const event = {
        data: {
          data: () => ({
            total: 20,
            status: 'paid_pending_dispense',
            paymentStatus: 'paid',
          }),
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o5' },
      };

      await (onOrderCreated as any).run(event);

      const firstCall = mocks.set.mock.calls[0][0];
      expect(firstCall.paidOrders).toEqual({ _increment: 1 });
      expect(firstCall.revenue).toEqual({ _increment: 20 });
    });

    it('deve retornar sem ação quando snap é null', async () => {
      const event = { data: null, params: { franchiseId: 'f1', storeId: 's1', orderId: 'o6' } };
      await (onOrderCreated as any).run(event);
      expect(mocks.set).not.toHaveBeenCalled();
    });
  });

  describe('onOrderUpdated', () => {
    it('deve ajustar revenue quando pedido passa de pending para paid', async () => {
      const event = {
        data: {
          before: {
            data: () => ({ total: 30, status: 'pending', paymentStatus: 'pending' }),
          },
          after: {
            data: () => ({ total: 30, status: 'completed', paymentStatus: 'paid', createdAt: { toDate: () => new Date('2026-01-15T10:00:00Z') } }),
          },
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o7' },
      };

      await (onOrderUpdated as any).run(event);

      const firstCall = mocks.set.mock.calls[0][0];
      expect(firstCall.revenue).toEqual({ _increment: 30 });
      expect(firstCall.paidOrders).toEqual({ _increment: 1 });
      expect(firstCall.pendingOrders).toEqual({ _increment: -1 });
    });

    it('deve ignorar update sem mudanças relevantes', async () => {
      const event = {
        data: {
          before: {
            data: () => ({ total: 30, status: 'completed', paymentStatus: 'paid' }),
          },
          after: {
            data: () => ({ total: 30, status: 'completed', paymentStatus: 'paid', notes: 'updated' }),
          },
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o8' },
      };

      await (onOrderUpdated as any).run(event);
      expect(mocks.set).not.toHaveBeenCalled();
    });

    it('deve decrementar revenue ao reverter pago para cancelado', async () => {
      const event = {
        data: {
          before: {
            data: () => ({ total: 30, status: 'completed', paymentStatus: 'paid', createdAt: { toDate: () => new Date('2026-01-15T10:00:00Z') } }),
          },
          after: {
            data: () => ({ total: 30, status: 'canceled', paymentStatus: 'refunded', createdAt: { toDate: () => new Date('2026-01-15T10:00:00Z') } }),
          },
        },
        params: { franchiseId: 'f1', storeId: 's1', orderId: 'o9' },
      };

      await (onOrderUpdated as any).run(event);

      const firstCall = mocks.set.mock.calls[0][0];
      expect(firstCall.revenue).toEqual({ _increment: -30 });
      expect(firstCall.paidOrders).toEqual({ _increment: -1 });
      expect(firstCall.cancelledOrders).toEqual({ _increment: 1 });
    });

    it('deve retornar sem ação quando data é null', async () => {
      const event = { data: null, params: { franchiseId: 'f1', storeId: 's1', orderId: 'o10' } };
      await (onOrderUpdated as any).run(event);
      expect(mocks.set).not.toHaveBeenCalled();
    });
  });
});
