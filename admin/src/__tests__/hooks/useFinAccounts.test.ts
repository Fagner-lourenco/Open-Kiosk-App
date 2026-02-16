/**
 * ============================================================================
 * useFinAccounts — Testes unitários
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
import { useFinAccounts } from '@/hooks/useFinAccounts';

// ─── Test Data ──────────────────────────────────────────────────────────────

const mockAccounts = [
  {
    id: 'acc-1',
    data: {
      name: 'Caixa Principal',
      type: 'cash',
      currency: 'BRL',
      openingBalance: 5000,
      status: 'active',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'acc-2',
    data: {
      name: 'Banco do Brasil',
      type: 'bank',
      currency: 'BRL',
      openingBalance: 15000,
      status: 'active',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'acc-3',
    data: {
      name: 'Conta Antiga',
      type: 'bank',
      currency: 'BRL',
      openingBalance: 2000,
      status: 'inactive',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useFinAccounts', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('deve retornar lista vazia quando não há contas', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    expect(result.current.accounts).toHaveLength(0);
    expect(result.current.activeAccounts).toHaveLength(0);
    expect(result.current.totalBalance).toBe(0);
  });

  it('deve carregar contas e calcular totais', async () => {
    mockGetDocsReturn(mockAccounts);
    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    expect(result.current.accounts).toHaveLength(3);
    expect(result.current.activeAccounts).toHaveLength(2);
    // totalBalance = 5000 + 15000 (only active accounts)
    expect(result.current.totalBalance).toBe(20000);
  });

  it('não deve fazer query com IDs vazios', async () => {
    renderHookWithProviders(() => useFinAccounts('', ''));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar conta', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    mockGetDocsEmpty();
    await result.current.createAccount({
      name: 'Nova Conta',
      type: 'pix',
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir conta', async () => {
    mockGetDocsReturn(mockAccounts);
    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteAccount('acc-1');

    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    expect(result.current.isCreatingAccount).toBe(false);
    expect(result.current.isUpdatingAccount).toBe(false);
    expect(result.current.isDeletingAccount).toBe(false);
  });
});
