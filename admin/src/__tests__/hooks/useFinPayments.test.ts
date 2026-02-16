/**
 * ============================================================================
 * useFinPayments — Testes unitários
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import {
  renderHookWithProviders,
  mockGetDocsReturn,
  mockGetDocsEmpty,
  resetFirestoreMocks,
  makeTimestamp,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from '../test-utils';
import { useFinPayments } from '@/hooks/useFinPayments';

const mockPayments = [
  {
    id: 'fp-1',
    data: {
      direction: 'in', date: makeTimestamp(), amount: 5000,
      method: 'pix', accountId: 'acc-1', targetType: 'invoice',
      targetId: 'inv-1', createdBy: 'usr-1', createdAt: makeTimestamp(),
    },
  },
  {
    id: 'fp-2',
    data: {
      direction: 'out', date: makeTimestamp(), amount: 3000,
      method: 'boleto', accountId: 'acc-1', targetType: 'bill',
      targetId: 'bill-1', createdBy: 'usr-1', createdAt: makeTimestamp(),
    },
  },
  {
    id: 'fp-3',
    data: {
      direction: 'in', date: makeTimestamp(), amount: 2000,
      method: 'card', accountId: 'acc-2', targetType: 'ledger',
      targetId: 'le-1', createdBy: 'usr-1', createdAt: makeTimestamp(),
    },
  },
];

describe('useFinPayments', () => {
  beforeEach(() => resetFirestoreMocks());

  it('deve retornar lista vazia', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));
    expect(result.current.payments).toHaveLength(0);
    expect(result.current.totalIn).toBe(0);
    expect(result.current.totalOut).toBe(0);
  });

  it('deve computar inPayments, outPayments, totalIn e totalOut', async () => {
    mockGetDocsReturn(mockPayments);
    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.payments).toHaveLength(3);
    // inPayments: fp-1 + fp-3
    expect(result.current.inPayments).toHaveLength(2);
    expect(result.current.totalIn).toBe(7000); // 5000 + 2000
    // outPayments: fp-2
    expect(result.current.outPayments).toHaveLength(1);
    expect(result.current.totalOut).toBe(3000);
  });

  it('não deve disparar query com IDs vazios', async () => {
    mockGetDocsEmpty();
    renderHookWithProviders(() => useFinPayments('', ''));
    await new Promise((r) => setTimeout(r, 50));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));
    mockGetDocsEmpty();
    await result.current.createPayment({
      direction: 'in', date: new Date(), amount: 100,
      method: 'pix', accountId: 'acc-1', targetType: 'ledger',
      targetId: 'le-1', createdBy: 'usr-1',
    });
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir', async () => {
    mockGetDocsReturn(mockPayments);
    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));
    mockGetDocsEmpty();
    await result.current.deletePayment('fp-1');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('não deve expor updatePayment (somente create + delete)', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));
    // useFinPayments não tem mutation de update
    expect((result.current as Record<string, unknown>).updatePayment).toBeUndefined();
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinPayments(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));
    expect(result.current.isCreatingPayment).toBe(false);
    expect(result.current.isDeletingPayment).toBe(false);
  });
});
