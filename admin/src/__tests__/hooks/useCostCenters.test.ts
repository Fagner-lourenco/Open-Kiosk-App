/**
 * ============================================================================
 * useCostCenters — Testes unitários
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
import { useCostCenters } from '@/hooks/useCostCenters';

const mockCostCenters = [
  {
    id: 'cc-1',
    data: { name: 'Operacional', status: 'active', createdAt: makeTimestamp(), updatedAt: makeTimestamp() },
  },
  {
    id: 'cc-2',
    data: { name: 'Marketing', status: 'active', createdAt: makeTimestamp(), updatedAt: makeTimestamp() },
  },
  {
    id: 'cc-3',
    data: { name: 'Antigo', status: 'inactive', createdAt: makeTimestamp(), updatedAt: makeTimestamp() },
  },
];

describe('useCostCenters', () => {
  beforeEach(() => resetFirestoreMocks());

  it('deve retornar lista vazia', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCostCenters(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingCostCenters).toBe(false));
    expect(result.current.costCenters).toHaveLength(0);
    expect(result.current.activeCostCenters).toHaveLength(0);
  });

  it('deve filtrar centros de custo ativos', async () => {
    mockGetDocsReturn(mockCostCenters);
    const { result } = renderHookWithProviders(() =>
      useCostCenters(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingCostCenters).toBe(false));
    expect(result.current.costCenters).toHaveLength(3);
    expect(result.current.activeCostCenters).toHaveLength(2);
  });

  it('deve chamar setDoc ao criar', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCostCenters(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingCostCenters).toBe(false));
    mockGetDocsEmpty();
    await result.current.createCostCenter({ name: 'Novo CC' });
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir', async () => {
    mockGetDocsReturn(mockCostCenters);
    const { result } = renderHookWithProviders(() =>
      useCostCenters(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingCostCenters).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteCostCenter('cc-1');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCostCenters(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingCostCenters).toBe(false));
    expect(result.current.isCreatingCostCenter).toBe(false);
    expect(result.current.isUpdatingCostCenter).toBe(false);
    expect(result.current.isDeletingCostCenter).toBe(false);
  });
});
