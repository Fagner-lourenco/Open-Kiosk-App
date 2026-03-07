/**
 * ============================================================================
 * useQuotes — Testes unitários
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { getDocs, setDoc, writeBatch } from 'firebase/firestore';
import {
  renderHookWithProviders,
  mockGetDocsReturn,
  mockGetDocsEmpty,
  resetFirestoreMocks,
  makeTimestamp,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from '../test-utils';
import { useQuotes } from '@/hooks/useQuotes';

// ─── Test Data ──────────────────────────────────────────────────────────────

const mockQuotes = [
  {
    id: 'q-1',
    data: {
      customerId: 'cust-1',
      status: 'draft',
      subtotal: 1000,
      discounts: 0,
      fees: 0,
      total: 1000,
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'q-2',
    data: {
      customerId: 'cust-2',
      status: 'sent',
      subtotal: 5000,
      discounts: 500,
      fees: 100,
      total: 4600,
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'q-3',
    data: {
      customerId: 'cust-3',
      status: 'accepted',
      subtotal: 8000,
      discounts: 0,
      fees: 0,
      total: 8000,
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useQuotes', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('deve retornar lista vazia quando não há propostas', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));
    expect(result.current.quotes).toHaveLength(0);
    expect(result.current.totalAcceptedValue).toBe(0);
  });

  it('deve carregar e categorizar quotes por status', async () => {
    mockGetDocsReturn(mockQuotes);
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));
    expect(result.current.quotes).toHaveLength(3);
    expect(result.current.draftQuotes).toHaveLength(1);
    expect(result.current.sentQuotes).toHaveLength(1);
    expect(result.current.acceptedQuotes).toHaveLength(1);
  });

  it('deve calcular totalAcceptedValue', async () => {
    mockGetDocsReturn(mockQuotes);
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));
    expect(result.current.totalAcceptedValue).toBe(8000);
  });

  it('não deve fazer query com IDs vazios', async () => {
    renderHookWithProviders(() => useQuotes('', ''));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar quote', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));
    mockGetDocsEmpty();
    await result.current.createQuote({
      customerId: 'cust-1',
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve usar writeBatch ao excluir quote', async () => {
    mockGetDocsReturn(mockQuotes);
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));
    await result.current.deleteQuote('q-1');

    const batch = (writeBatch as any).mock.results.at(-1)?.value;
    const deletedPaths = batch?.delete.mock.calls.map((call: unknown[]) => ((call[0] as { path?: string })?.path || '')) ?? [];

    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(deletedPaths.some((path: string) => path.includes('/quotes/q-1/lines/'))).toBe(true);
    expect(deletedPaths.some((path: string) => path.endsWith('/quotes/q-1'))).toBe(true);
    expect(batch?.commit).toHaveBeenCalledTimes(1);
  });

  it('deve expor funções de quote lines', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));
    expect(typeof result.current.fetchQuoteLines).toBe('function');
    expect(typeof result.current.createQuoteLine).toBe('function');
    expect(typeof result.current.deleteQuoteLine).toBe('function');
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));
    expect(result.current.isCreatingQuote).toBe(false);
    expect(result.current.isUpdatingQuote).toBe(false);
    expect(result.current.isDeletingQuote).toBe(false);
  });
});
