/**
 * ============================================================================
 * useCustomers — Testes unitários
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
import { useCustomers } from '@/hooks/useCustomers';

// ─── Test Data ──────────────────────────────────────────────────────────────

const mockCustomers = [
  {
    id: 'cust-1',
    data: {
      type: 'person',
      name: 'João Silva',
      doc: '123.456.789-00',
      tags: ['vip'],
      phones: ['11999990000'],
      emails: ['joao@test.com'],
      status: 'active',
      ownerUserId: 'test-user-id',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'cust-2',
    data: {
      type: 'company',
      name: 'Empresa ABC',
      status: 'archived',
      tags: [],
      phones: [],
      emails: [],
      ownerUserId: 'test-user-id',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCustomers', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('deve retornar lista vazia quando não há clientes', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));
    expect(result.current.customers).toHaveLength(0);
    expect(result.current.activeCustomers).toHaveLength(0);
    expect(result.current.archivedCustomers).toHaveLength(0);
  });

  it('deve carregar e categorizar clientes corretamente', async () => {
    mockGetDocsReturn(mockCustomers);
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));
    expect(result.current.customers).toHaveLength(2);
    expect(result.current.activeCustomers).toHaveLength(1);
    expect(result.current.activeCustomers[0].name).toBe('João Silva');
    expect(result.current.archivedCustomers).toHaveLength(1);
    expect(result.current.archivedCustomers[0].name).toBe('Empresa ABC');
  });

  it('deve normalizar campos do customer', async () => {
    mockGetDocsReturn(mockCustomers);
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));
    const joao = result.current.customers[0];
    expect(joao.id).toBe('cust-1');
    expect(joao.type).toBe('person');
    expect(joao.doc).toBe('123.456.789-00');
    expect(joao.tags).toEqual(['vip']);
    expect(joao.phones).toEqual(['11999990000']);
  });

  it('não deve fazer query quando franchiseId/storeId vazio', async () => {
    const { result } = renderHookWithProviders(() => useCustomers('', ''));

    // Should stay loading=false and never call getDocs
    await waitFor(() => expect(result.current.customers).toEqual([]));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar cliente', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));

    // Need to re-mock getDocs for the refetch after create
    mockGetDocsEmpty();
    await result.current.createCustomer({
      type: 'person',
      name: 'Novo Cliente',
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir cliente', async () => {
    mockGetDocsReturn(mockCustomers);
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteCustomer('cust-1');

    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));
    expect(result.current.isCreatingCustomer).toBe(false);
    expect(result.current.isUpdatingCustomer).toBe(false);
    expect(result.current.isDeletingCustomer).toBe(false);
  });
});
