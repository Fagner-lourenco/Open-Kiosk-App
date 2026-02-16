/**
 * ============================================================================
 * useFinCategories — Testes unitários
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { setDoc, deleteDoc } from 'firebase/firestore';
import {
  renderHookWithProviders,
  mockGetDocsReturn,
  mockGetDocsEmpty,
  resetFirestoreMocks,
  makeTimestamp,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from '../test-utils';
import { useFinCategories } from '@/hooks/useFinCategories';

// ─── Test Data ──────────────────────────────────────────────────────────────

const mockCategories = [
  {
    id: 'cat-1',
    data: {
      direction: 'in',
      name: 'Vendas de Eventos',
      status: 'active',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'cat-2',
    data: {
      direction: 'out',
      name: 'Fornecedores de Bebidas',
      status: 'active',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'cat-3',
    data: {
      direction: 'in',
      name: 'Locação de Quiosque',
      status: 'inactive',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useFinCategories', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('deve retornar lista vazia quando não há categorias', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinCategories(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCategories).toBe(false));
    expect(result.current.categories).toHaveLength(0);
  });

  it('deve classificar categorias por direção e status', async () => {
    mockGetDocsReturn(mockCategories);
    const { result } = renderHookWithProviders(() =>
      useFinCategories(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCategories).toBe(false));
    expect(result.current.categories).toHaveLength(3);
    expect(result.current.activeCategories).toHaveLength(2);
    expect(result.current.incomeCategories).toHaveLength(1); // only active + in
    expect(result.current.expenseCategories).toHaveLength(1); // only active + out
  });

  it('deve chamar setDoc ao criar categoria', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinCategories(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCategories).toBe(false));
    mockGetDocsEmpty();
    await result.current.createCategory({
      direction: 'out',
      name: 'Aluguel',
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir categoria', async () => {
    mockGetDocsReturn(mockCategories);
    const { result } = renderHookWithProviders(() =>
      useFinCategories(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCategories).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteCategory('cat-1');

    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinCategories(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCategories).toBe(false));
    expect(result.current.isCreatingCategory).toBe(false);
    expect(result.current.isUpdatingCategory).toBe(false);
    expect(result.current.isDeletingCategory).toBe(false);
  });
});
