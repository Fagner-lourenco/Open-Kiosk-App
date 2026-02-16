/**
 * ============================================================================
 * useDeals — Testes unitários
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
import { useDeals } from '@/hooks/useDeals';

// ─── Test Data ──────────────────────────────────────────────────────────────

const mockDeals = [
  {
    id: 'deal-1',
    data: {
      title: 'Evento Corporativo',
      customerId: 'cust-1',
      stage: 'lead',
      valueEstimate: 5000,
      probability: 30,
      ownerUserId: 'test-user-id',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'deal-2',
    data: {
      title: 'Festa de Aniversário',
      customerId: 'cust-2',
      stage: 'won',
      valueEstimate: 8000,
      probability: 100,
      ownerUserId: 'test-user-id',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'deal-3',
    data: {
      title: 'Happy Hour',
      customerId: 'cust-3',
      stage: 'proposal',
      valueEstimate: 3000,
      probability: 60,
      ownerUserId: 'test-user-id',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useDeals', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('deve retornar lista vazia quando não há deals', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useDeals(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingDeals).toBe(false));
    expect(result.current.deals).toHaveLength(0);
    expect(result.current.totalPipelineValue).toBe(0);
  });

  it('deve carregar deals e calcular valores de pipeline', async () => {
    mockGetDocsReturn(mockDeals);
    const { result } = renderHookWithProviders(() =>
      useDeals(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingDeals).toBe(false));
    expect(result.current.deals).toHaveLength(3);

    // activeDeals = lead + proposal (not won/lost)
    expect(result.current.activeDeals).toHaveLength(2);

    // totalPipelineValue = 5000 + 3000 = 8000
    expect(result.current.totalPipelineValue).toBe(8000);

    // weightedPipelineValue = 5000*0.30 + 3000*0.60 = 1500 + 1800 = 3300
    expect(result.current.weightedPipelineValue).toBe(3300);
  });

  it('deve filtrar deals por stage', async () => {
    mockGetDocsReturn(mockDeals);
    const { result } = renderHookWithProviders(() =>
      useDeals(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingDeals).toBe(false));
    expect(result.current.dealsByStage('lead')).toHaveLength(1);
    expect(result.current.dealsByStage('won')).toHaveLength(1);
    expect(result.current.dealsByStage('proposal')).toHaveLength(1);
    expect(result.current.dealsByStage('lost')).toHaveLength(0);
  });

  it('não deve fazer query quando IDs vazios', async () => {
    renderHookWithProviders(() => useDeals('', ''));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar deal', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useDeals(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingDeals).toBe(false));
    mockGetDocsEmpty();
    await result.current.createDeal({
      title: 'Novo Deal',
      customerId: 'cust-1',
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir deal', async () => {
    mockGetDocsReturn(mockDeals);
    const { result } = renderHookWithProviders(() =>
      useDeals(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingDeals).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteDeal('deal-1');

    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useDeals(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingDeals).toBe(false));
    expect(result.current.isCreatingDeal).toBe(false);
    expect(result.current.isUpdatingDeal).toBe(false);
    expect(result.current.isDeletingDeal).toBe(false);
  });
});
