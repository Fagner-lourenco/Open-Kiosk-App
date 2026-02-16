/**
 * ============================================================================
 * useBills — Testes unitários
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
import { useBills } from '@/hooks/useBills';

const mockBills = [
  {
    id: 'bill-1',
    data: {
      partyId: 'party-1', status: 'overdue',
      issueDate: makeTimestamp(), dueDate: makeTimestamp(),
      total: 8000, paidTotal: 2000, remaining: 6000,
      categoryId: 'cat-1', attachments: [],
      createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'bill-2',
    data: {
      partyId: 'party-2', status: 'paid',
      issueDate: makeTimestamp(), dueDate: makeTimestamp(),
      total: 3000, paidTotal: 3000, remaining: 0,
      categoryId: 'cat-2', attachments: [],
      createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'bill-3',
    data: {
      partyId: 'party-3', status: 'draft',
      issueDate: makeTimestamp(), dueDate: makeTimestamp(),
      total: 1500, paidTotal: 0, remaining: 1500,
      categoryId: 'cat-1', attachments: [],
      createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
];

describe('useBills', () => {
  beforeEach(() => resetFirestoreMocks());

  it('deve retornar lista vazia', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useBills(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingBills).toBe(false));
    expect(result.current.bills).toHaveLength(0);
    expect(result.current.totalPayable).toBe(0);
    expect(result.current.totalPaid).toBe(0);
  });

  it('deve computar overdueBills, totalPayable e totalPaid', async () => {
    mockGetDocsReturn(mockBills);
    const { result } = renderHookWithProviders(() =>
      useBills(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingBills).toBe(false));

    expect(result.current.bills).toHaveLength(3);
    // overdue: bill-1
    expect(result.current.overdueBills).toHaveLength(1);
    expect(result.current.overdueBills[0].id).toBe('bill-1');
    // totalPayable: not paid/canceled → bill-1 (6000) + bill-3 (1500) = 7500
    expect(result.current.totalPayable).toBe(7500);
    // totalPaid: 2000 + 3000 + 0 = 5000
    expect(result.current.totalPaid).toBe(5000);
  });

  it('não deve disparar query com IDs vazios', async () => {
    mockGetDocsEmpty();
    renderHookWithProviders(() => useBills('', ''));
    await new Promise((r) => setTimeout(r, 50));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useBills(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingBills).toBe(false));
    mockGetDocsEmpty();
    await result.current.createBill({
      partyId: 'party-1', issueDate: new Date(), dueDate: new Date(),
      total: 500, categoryId: 'cat-1',
    });
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir', async () => {
    mockGetDocsReturn(mockBills);
    const { result } = renderHookWithProviders(() =>
      useBills(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingBills).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteBill('bill-1');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useBills(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingBills).toBe(false));
    expect(result.current.isCreatingBill).toBe(false);
    expect(result.current.isUpdatingBill).toBe(false);
    expect(result.current.isDeletingBill).toBe(false);
  });
});
