/**
 * ============================================================================
 * useLedger — Testes unitários
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
import { useLedger } from '@/hooks/useLedger';

const mockEntries = [
  {
    id: 'le-1',
    data: {
      direction: 'in', status: 'paid', amount: 5000,
      competenceDate: makeTimestamp(), accountId: 'acc-1',
      categoryId: 'cat-1', method: 'pix', sourceType: 'manual',
      sourceId: 'src-1', description: 'Venda à vista', createdBy: 'usr-1',
      createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'le-2',
    data: {
      direction: 'out', status: 'pending', amount: 2000,
      competenceDate: makeTimestamp(), accountId: 'acc-1',
      categoryId: 'cat-2', method: 'boleto', sourceType: 'manual',
      sourceId: 'src-2', description: 'Fornecedor X', createdBy: 'usr-1',
      createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'le-3',
    data: {
      direction: 'in', status: 'canceled', amount: 1000,
      competenceDate: makeTimestamp(), accountId: 'acc-2',
      categoryId: 'cat-1', method: 'card', sourceType: 'invoice',
      sourceId: 'inv-1', description: 'Fatura cancelada', createdBy: 'usr-1',
      createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
];

describe('useLedger', () => {
  beforeEach(() => resetFirestoreMocks());

  it('deve retornar lista vazia', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useLedger(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingEntries).toBe(false));
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.totalIncome).toBe(0);
    expect(result.current.totalExpenses).toBe(0);
    expect(result.current.balance).toBe(0);
  });

  it('deve computar income, expenses e balance', async () => {
    mockGetDocsReturn(mockEntries);
    const { result } = renderHookWithProviders(() =>
      useLedger(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingEntries).toBe(false));

    expect(result.current.entries).toHaveLength(3);
    // incomeEntries: le-1 (in) + le-3 (in)
    expect(result.current.incomeEntries).toHaveLength(2);
    expect(result.current.totalIncome).toBe(6000); // 5000 + 1000
    // expenseEntries: le-2 (out)
    expect(result.current.expenseEntries).toHaveLength(1);
    expect(result.current.totalExpenses).toBe(2000);
    // balance = 6000 - 2000
    expect(result.current.balance).toBe(4000);
    // pendingEntries: le-2
    expect(result.current.pendingEntries).toHaveLength(1);
    expect(result.current.pendingEntries[0].id).toBe('le-2');
  });

  it('não deve disparar query com IDs vazios', async () => {
    mockGetDocsEmpty();
    renderHookWithProviders(() => useLedger('', ''));
    await new Promise((r) => setTimeout(r, 50));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useLedger(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingEntries).toBe(false));
    mockGetDocsEmpty();
    await result.current.createEntry({
      direction: 'in', competenceDate: new Date(), amount: 100,
      accountId: 'acc-1', categoryId: 'cat-1', method: 'pix',
      sourceType: 'manual', sourceId: '', description: 'Teste', createdBy: 'usr-1',
    });
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir', async () => {
    mockGetDocsReturn(mockEntries);
    const { result } = renderHookWithProviders(() =>
      useLedger(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingEntries).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteEntry('le-1');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useLedger(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingEntries).toBe(false));
    expect(result.current.isCreatingEntry).toBe(false);
    expect(result.current.isUpdatingEntry).toBe(false);
    expect(result.current.isDeletingEntry).toBe(false);
  });
});
