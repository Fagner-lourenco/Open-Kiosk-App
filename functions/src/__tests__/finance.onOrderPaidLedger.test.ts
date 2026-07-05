/**
 * Tests for finance/onOrderPaidLedger.ts
 * Covers: criação de ledger ao pagar, idempotência, skip sem conta/categoria,
 * cancelamento de ledger em refund, no-op quando status não muda
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // Ledger collection: query chain where().where().limit().get() + doc().set()
  const ledgerQueryGet = vi.fn();
  const ledgerSet = vi.fn().mockResolvedValue(undefined);
  const ledgerDoc = vi.fn(() => ({ id: 'ledger-new', set: ledgerSet }));
  const ledgerEntryUpdate = vi.fn().mockResolvedValue(undefined);

  // finAccounts: where().get()
  const accountsGet = vi.fn();
  // finCategories: where().where().limit().get()
  const categoriesGet = vi.fn();

  const collectionFn = vi.fn((path: string) => {
    if (path.endsWith('finLedger')) {
      const chain: any = {
        where: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        get: ledgerQueryGet,
        doc: ledgerDoc,
      };
      return chain;
    }
    if (path.endsWith('finAccounts')) {
      return { where: vi.fn(() => ({ get: accountsGet })) };
    }
    if (path.endsWith('finCategories')) {
      const chain: any = {
        where: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        get: categoriesGet,
      };
      return chain;
    }
    throw new Error(`unexpected collection: ${path}`);
  });

  return { ledgerQueryGet, ledgerSet, ledgerDoc, ledgerEntryUpdate, accountsGet, categoriesGet, collectionFn };
});

vi.mock('../lib', () => ({
  db: { collection: mocks.collectionFn },
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
      Timestamp: { now: vi.fn(() => 'NOW_TS') },
    },
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_opts: any, handler: any) => {
    const fn: any = {};
    fn.run = handler;
    return fn;
  },
}));

import { onOrderPaidLedger } from '../finance/onOrderPaidLedger';

const run = (onOrderPaidLedger as any).run;

const makeEvent = (before: Record<string, unknown>, after: Record<string, unknown>) => ({
  params: { franchiseId: 'f1', storeId: 's1', orderId: 'order-1' },
  data: {
    before: { data: () => before },
    after: { data: () => after },
  },
});

const activeAccount = { id: 'acc-pix', data: () => ({ type: 'pix', name: 'Conta PIX', status: 'active' }) };
const incomeCategory = { id: 'cat-sales', data: () => ({ direction: 'in', status: 'active' }) };

describe('finance/onOrderPaidLedger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ledgerQueryGet.mockResolvedValue({ empty: true, docs: [] });
    mocks.accountsGet.mockResolvedValue({ empty: false, docs: [activeAccount] });
    mocks.categoriesGet.mockResolvedValue({ empty: false, docs: [incomeCategory] });
  });

  it('cria ledger entry quando pedido é pago', async () => {
    await run(makeEvent(
      { paymentStatus: 'pending', total: 25.5, paymentMethod: 'pix' },
      { paymentStatus: 'paid', total: 25.5, paymentMethod: 'pix', orderNumber: 'A123' },
    ));

    expect(mocks.ledgerSet).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'in',
      status: 'paid',
      amount: 25.5,
      accountId: 'acc-pix',
      categoryId: 'cat-sales',
      method: 'pix',
      sourceType: 'kiosk_order',
      sourceId: 'order-1',
    }));
  });

  it('no-op quando paymentStatus não mudou', async () => {
    await run(makeEvent(
      { paymentStatus: 'paid', total: 10, paymentMethod: 'pix' },
      { paymentStatus: 'paid', total: 10, paymentMethod: 'pix' },
    ));
    expect(mocks.ledgerSet).not.toHaveBeenCalled();
  });

  it('idempotente: não duplica ledger existente', async () => {
    mocks.ledgerQueryGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'ledger-old', data: () => ({ status: 'paid' }), ref: { update: mocks.ledgerEntryUpdate } }],
    });

    await run(makeEvent(
      { paymentStatus: 'pending', total: 10, paymentMethod: 'card' },
      { paymentStatus: 'paid', total: 10, paymentMethod: 'card' },
    ));
    expect(mocks.ledgerSet).not.toHaveBeenCalled();
  });

  it('skip quando total é zero', async () => {
    await run(makeEvent(
      { paymentStatus: 'pending', total: 0, paymentMethod: 'pix' },
      { paymentStatus: 'paid', total: 0, paymentMethod: 'pix' },
    ));
    expect(mocks.ledgerSet).not.toHaveBeenCalled();
  });

  it('skip quando não há conta financeira ativa', async () => {
    mocks.accountsGet.mockResolvedValue({ empty: true, docs: [] });
    await run(makeEvent(
      { paymentStatus: 'pending', total: 10, paymentMethod: 'pix' },
      { paymentStatus: 'paid', total: 10, paymentMethod: 'pix' },
    ));
    expect(mocks.ledgerSet).not.toHaveBeenCalled();
  });

  it('skip quando não há categoria de receita ativa', async () => {
    mocks.categoriesGet.mockResolvedValue({ empty: true, docs: [] });
    await run(makeEvent(
      { paymentStatus: 'pending', total: 10, paymentMethod: 'pix' },
      { paymentStatus: 'paid', total: 10, paymentMethod: 'pix' },
    ));
    expect(mocks.ledgerSet).not.toHaveBeenCalled();
  });

  it('mapeia paymentMethod desconhecido para card', async () => {
    await run(makeEvent(
      { paymentStatus: 'pending', total: 10, paymentMethod: 'weird_method' },
      { paymentStatus: 'paid', total: 10, paymentMethod: 'weird_method' },
    ));
    expect(mocks.ledgerSet).toHaveBeenCalledWith(expect.objectContaining({ method: 'card' }));
  });

  it('cancela ledger quando pedido é reembolsado', async () => {
    mocks.ledgerQueryGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'ledger-old', data: () => ({ status: 'paid' }), ref: { update: mocks.ledgerEntryUpdate } }],
    });

    await run(makeEvent(
      { paymentStatus: 'paid', total: 10, paymentMethod: 'pix' },
      { paymentStatus: 'refunded', total: 10, paymentMethod: 'pix' },
    ));

    expect(mocks.ledgerEntryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'canceled' })
    );
  });

  it('não re-cancela ledger já cancelado', async () => {
    mocks.ledgerQueryGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'ledger-old', data: () => ({ status: 'canceled' }), ref: { update: mocks.ledgerEntryUpdate } }],
    });

    await run(makeEvent(
      { paymentStatus: 'paid', total: 10, paymentMethod: 'pix' },
      { paymentStatus: 'canceled', total: 10, paymentMethod: 'pix' },
    ));
    expect(mocks.ledgerEntryUpdate).not.toHaveBeenCalled();
  });

  it('refund sem ledger existente é no-op silencioso', async () => {
    mocks.ledgerQueryGet.mockResolvedValue({ empty: true, docs: [] });
    await run(makeEvent(
      { paymentStatus: 'paid', total: 10, paymentMethod: 'pix' },
      { paymentStatus: 'refunded', total: 10, paymentMethod: 'pix' },
    ));
    expect(mocks.ledgerEntryUpdate).not.toHaveBeenCalled();
    expect(mocks.ledgerSet).not.toHaveBeenCalled();
  });
});
