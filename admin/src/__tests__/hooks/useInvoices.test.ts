/**
 * ============================================================================
 * useInvoices — Testes unitários
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
import { useInvoices } from '@/hooks/useInvoices';

const mockInvoices = [
  {
    id: 'inv-1',
    data: {
      partyId: 'party-1', status: 'overdue',
      issueDate: makeTimestamp(), dueDate: makeTimestamp(),
      subtotal: 10000, discounts: 0, fees: 0, total: 10000,
      paidTotal: 3000, remaining: 7000,
      sourceType: 'manual', createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'inv-2',
    data: {
      partyId: 'party-2', status: 'paid',
      issueDate: makeTimestamp(), dueDate: makeTimestamp(),
      subtotal: 5000, discounts: 500, fees: 0, total: 4500,
      paidTotal: 4500, remaining: 0,
      sourceType: 'manual', createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'inv-3',
    data: {
      partyId: 'party-3', status: 'draft',
      issueDate: makeTimestamp(), dueDate: makeTimestamp(),
      subtotal: 2000, discounts: 0, fees: 100, total: 2100,
      paidTotal: 0, remaining: 2100,
      sourceType: 'manual', createdAt: makeTimestamp(), updatedAt: makeTimestamp(),
    },
  },
];

describe('useInvoices', () => {
  beforeEach(() => resetFirestoreMocks());

  it('deve retornar lista vazia', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useInvoices(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingInvoices).toBe(false));
    expect(result.current.invoices).toHaveLength(0);
    expect(result.current.totalReceivable).toBe(0);
    expect(result.current.totalReceived).toBe(0);
  });

  it('deve computar overdueInvoices, totalReceivable e totalReceived', async () => {
    mockGetDocsReturn(mockInvoices);
    const { result } = renderHookWithProviders(() =>
      useInvoices(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingInvoices).toBe(false));

    expect(result.current.invoices).toHaveLength(3);
    // overdue: inv-1
    expect(result.current.overdueInvoices).toHaveLength(1);
    expect(result.current.overdueInvoices[0].id).toBe('inv-1');
    // totalReceivable: not paid/canceled → inv-1 (7000) + inv-3 (2100) = 9100
    expect(result.current.totalReceivable).toBe(9100);
    // totalReceived: 3000 + 4500 + 0 = 7500
    expect(result.current.totalReceived).toBe(7500);
  });

  it('não deve disparar query com IDs vazios', async () => {
    mockGetDocsEmpty();
    renderHookWithProviders(() => useInvoices('', ''));
    await new Promise((r) => setTimeout(r, 50));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useInvoices(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingInvoices).toBe(false));
    mockGetDocsEmpty();
    await result.current.createInvoice({
      partyId: 'party-1', issueDate: new Date(), dueDate: new Date(),
    });
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir', async () => {
    mockGetDocsReturn(mockInvoices);
    const { result } = renderHookWithProviders(() =>
      useInvoices(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingInvoices).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteInvoice('inv-1');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor funções de invoice lines', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useInvoices(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingInvoices).toBe(false));
    expect(typeof result.current.fetchInvoiceLines).toBe('function');
    expect(typeof result.current.createInvoiceLine).toBe('function');
    expect(typeof result.current.deleteInvoiceLine).toBe('function');
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useInvoices(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );
    await waitFor(() => expect(result.current.loadingInvoices).toBe(false));
    expect(result.current.isCreatingInvoice).toBe(false);
    expect(result.current.isUpdatingInvoice).toBe(false);
    expect(result.current.isDeletingInvoice).toBe(false);
    expect(result.current.isCreatingLine).toBe(false);
    expect(result.current.isDeletingLine).toBe(false);
  });
});
