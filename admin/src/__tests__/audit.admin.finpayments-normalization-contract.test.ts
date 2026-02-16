import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { setDoc } from 'firebase/firestore';
import {
  renderHookWithProviders,
  mockGetDocsReturn,
  mockGetDocsEmpty,
  resetFirestoreMocks,
  makeTimestamp,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from './test-utils';
import { useFinPayments } from '@/hooks/useFinPayments';

describe('Audit Admin - useFinPayments normalization contracts', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('deve fallback de direction invalido para out (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'fp-invalid-direction',
        data: {
          direction: 'entrada',
          date: makeTimestamp(),
          amount: 100,
          method: 'pix',
          accountId: 'acc-1',
          targetType: 'ledger',
          targetId: 'l-1',
          createdBy: 'u-1',
          createdAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.outPayments).toHaveLength(1);
    expect(result.current.inPayments).toHaveLength(0);
  });

  it('deve fallback de method invalido para pix (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'fp-invalid-method',
        data: {
          direction: 'out',
          date: makeTimestamp(),
          amount: 100,
          method: 'boleto',
          accountId: 'acc-1',
          targetType: 'ledger',
          targetId: 'l-1',
          createdBy: 'u-1',
          createdAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.payments[0]?.method).toBe('pix');
  });

  it('deve fallback de targetType invalido para ledger (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'fp-invalid-target',
        data: {
          direction: 'out',
          date: makeTimestamp(),
          amount: 100,
          method: 'pix',
          accountId: 'acc-1',
          targetType: 'invoice_payment',
          targetId: 'inv-1',
          createdBy: 'u-1',
          createdAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.payments[0]?.targetType).toBe('ledger');
  });

  it('deve normalizar amount string para numero sem quebrar totalIn (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'fp-string-amount',
        data: {
          direction: 'in',
          date: makeTimestamp(),
          amount: '100.50',
          method: 'pix',
          accountId: 'acc-1',
          targetType: 'ledger',
          targetId: 'l-1',
          createdBy: 'u-1',
          createdAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(typeof result.current.totalIn).toBe('number');
    expect(result.current.totalIn).toBeCloseTo(100.5, 2);
  });

  it('nao deve persistir pagamento com amount <= 0 (RED)', async () => {
    mockGetDocsEmpty();

    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    await expect(
      result.current.createPayment({
        direction: 'out',
        date: new Date('2026-02-16T00:00:00Z'),
        amount: 0,
        method: 'pix',
        accountId: 'acc-1',
        targetType: 'ledger',
        targetId: 'l-1',
        createdBy: 'u-1',
      }),
    ).rejects.toThrow();

    expect(setDoc).not.toHaveBeenCalled();
  });
});
