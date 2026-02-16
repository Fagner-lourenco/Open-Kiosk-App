/**
 * ============================================================================
 * useParties — Testes unitários
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
import { useParties } from '@/hooks/useParties';

const mockParties = [
  {
    id: 'p-1',
    data: {
      type: 'supplier', name: 'Distribuidora Alpha', doc: '12.345.678/0001-00',
      contacts: [{ phone: '11999990000' }], status: 'active',
      createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'p-2',
    data: {
      type: 'employee', name: 'Carlos Técnico', contacts: [],
      status: 'active', createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'p-3',
    data: {
      type: 'customer', name: 'Cliente Final', contacts: [],
      status: 'inactive', createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
];

describe('useParties', () => {
  beforeEach(() => resetFirestoreMocks());

  it('deve retornar lista vazia', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useParties(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingParties).toBe(false));
    expect(result.current.parties).toHaveLength(0);
  });

  it('deve filtrar por tipo e status', async () => {
    mockGetDocsReturn(mockParties);
    const { result } = renderHookWithProviders(() =>
      useParties(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingParties).toBe(false));
    expect(result.current.parties).toHaveLength(3);
    expect(result.current.activeParties).toHaveLength(2);
    expect(result.current.suppliers).toHaveLength(1);
    expect(result.current.suppliers[0].name).toBe('Distribuidora Alpha');
    expect(result.current.employees).toHaveLength(1);
    expect(result.current.employees[0].name).toBe('Carlos Técnico');
  });

  it('deve chamar setDoc ao criar', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useParties(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingParties).toBe(false));
    mockGetDocsEmpty();
    await result.current.createParty({
      type: 'supplier', name: 'Novo Fornecedor',
    });
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir', async () => {
    mockGetDocsReturn(mockParties);
    const { result } = renderHookWithProviders(() =>
      useParties(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingParties).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteParty('p-1');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useParties(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingParties).toBe(false));
    expect(result.current.isCreatingParty).toBe(false);
    expect(result.current.isUpdatingParty).toBe(false);
    expect(result.current.isDeletingParty).toBe(false);
  });
});
