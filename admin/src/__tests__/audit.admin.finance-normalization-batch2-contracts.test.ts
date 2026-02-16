import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import {
  renderHookWithProviders,
  mockGetDocsReturn,
  resetFirestoreMocks,
  makeTimestamp,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from './test-utils';
import { useFinCategories } from '@/hooks/useFinCategories';
import { useLedger } from '@/hooks/useLedger';
import { useBills } from '@/hooks/useBills';

describe('Audit Admin - finance normalization contracts (batch 2)', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('useFinCategories deve fallback de direction invalido para out (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'cat-1',
        data: {
          direction: 'entrada',
          name: 'Categoria legado',
          status: 'active',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useFinCategories(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCategories).toBe(false));

    expect(result.current.expenseCategories).toHaveLength(1);
    expect(result.current.incomeCategories).toHaveLength(0);
  });

  it('useFinCategories deve fallback de status invalido para active (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'cat-2',
        data: {
          direction: 'out',
          name: 'Categoria legado',
          status: 'archived',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useFinCategories(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCategories).toBe(false));

    expect(result.current.activeCategories).toHaveLength(1);
    expect(result.current.categories[0]?.status).toBe('active');
  });

  it('useLedger deve fallback de method invalido para pix (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'le-1',
        data: {
          direction: 'in',
          status: 'paid',
          competenceDate: makeTimestamp(),
          amount: 100,
          accountId: 'acc-1',
          categoryId: 'cat-1',
          method: 'boleto',
          sourceType: 'manual',
          sourceId: 'src-1',
          description: 'Lancamento legado',
          attachments: [],
          createdBy: 'u-1',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useLedger(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEntries).toBe(false));

    expect(result.current.entries[0]?.method).toBe('pix');
  });

  it('useLedger deve normalizar amount string para numero sem quebrar totalIncome (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'le-2',
        data: {
          direction: 'in',
          status: 'paid',
          competenceDate: makeTimestamp(),
          amount: '100.50',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          method: 'pix',
          sourceType: 'manual',
          sourceId: 'src-2',
          description: 'Lancamento legado',
          attachments: [],
          createdBy: 'u-1',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useLedger(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEntries).toBe(false));

    expect(typeof result.current.totalIncome).toBe('number');
    expect(result.current.totalIncome).toBeCloseTo(100.5, 2);
  });

  it('useBills deve fallback de status invalido para draft (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'bill-1',
        data: {
          partyId: 'party-1',
          status: 'liquidated',
          issueDate: makeTimestamp(),
          dueDate: makeTimestamp(),
          total: 100,
          paidTotal: 0,
          remaining: 100,
          categoryId: 'cat-1',
          attachments: [],
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useBills(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingBills).toBe(false));

    expect(result.current.bills[0]?.status).toBe('draft');
  });

  it('useBills deve normalizar remaining string para numero em totalPayable (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'bill-2',
        data: {
          partyId: 'party-1',
          status: 'draft',
          issueDate: makeTimestamp(),
          dueDate: makeTimestamp(),
          total: 100,
          paidTotal: 0,
          remaining: '20.5',
          categoryId: 'cat-1',
          attachments: [],
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useBills(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingBills).toBe(false));

    expect(typeof result.current.totalPayable).toBe('number');
    expect(result.current.totalPayable).toBeCloseTo(20.5, 2);
  });
});
