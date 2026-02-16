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
import { useInvoices } from '@/hooks/useInvoices';
import { useQuotes } from '@/hooks/useQuotes';
import { useDeals } from '@/hooks/useDeals';
import { useParties } from '@/hooks/useParties';

describe('Audit Admin - finance/commercial normalization contracts (batch 3)', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('useInvoices deve fallback de status invalido para draft (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'inv-legacy-status',
        data: {
          partyId: 'party-1',
          status: 'liquidated',
          issueDate: makeTimestamp(),
          dueDate: makeTimestamp(),
          subtotal: 100,
          discounts: 0,
          fees: 0,
          total: 100,
          paidTotal: 0,
          remaining: 100,
          sourceType: 'manual',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useInvoices(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingInvoices).toBe(false));

    expect(result.current.invoices[0]?.status).toBe('draft');
  });

  it('useInvoices deve normalizar remaining string para numero em totalReceivable (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'inv-legacy-remaining',
        data: {
          partyId: 'party-1',
          status: 'issued',
          issueDate: makeTimestamp(),
          dueDate: makeTimestamp(),
          subtotal: 100,
          discounts: 0,
          fees: 0,
          total: 100,
          paidTotal: 0,
          remaining: '20.5',
          sourceType: 'manual',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useInvoices(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingInvoices).toBe(false));

    expect(typeof result.current.totalReceivable).toBe('number');
    expect(result.current.totalReceivable).toBeCloseTo(20.5, 2);
  });

  it('useQuotes deve fallback de status invalido para draft (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'quote-legacy-status',
        data: {
          customerId: 'c-1',
          status: 'approved',
          subtotal: 100,
          discounts: 0,
          fees: 0,
          total: 100,
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));

    expect(result.current.quotes[0]?.status).toBe('draft');
    expect(result.current.draftQuotes).toHaveLength(1);
  });

  it('useQuotes deve normalizar total string para numero em totalAcceptedValue (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'quote-legacy-total',
        data: {
          customerId: 'c-1',
          status: 'accepted',
          subtotal: 100,
          discounts: 0,
          fees: 0,
          total: '100.5',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));

    expect(typeof result.current.totalAcceptedValue).toBe('number');
    expect(result.current.totalAcceptedValue).toBeCloseTo(100.5, 2);
  });

  it('useDeals deve fallback de stage invalido para lead (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'deal-legacy-stage',
        data: {
          title: 'Deal legado',
          customerId: 'c-1',
          stage: 'contract_signed',
          valueEstimate: 500,
          probability: 50,
          ownerUserId: 'u-1',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useDeals(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingDeals).toBe(false));

    expect(result.current.deals[0]?.stage).toBe('lead');
    expect(result.current.dealsByStage('lead')).toHaveLength(1);
  });

  it('useDeals deve normalizar valueEstimate string para numero no pipeline (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'deal-legacy-value',
        data: {
          title: 'Deal legado',
          customerId: 'c-1',
          stage: 'proposal',
          valueEstimate: '800.25',
          probability: 50,
          ownerUserId: 'u-1',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useDeals(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingDeals).toBe(false));

    expect(typeof result.current.totalPipelineValue).toBe('number');
    expect(result.current.totalPipelineValue).toBeCloseTo(800.25, 2);
  });

  it('useDeals deve limitar probabilidade entre 0 e 100 no weightedPipelineValue (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'deal-legacy-probability',
        data: {
          title: 'Deal legado',
          customerId: 'c-1',
          stage: 'proposal',
          valueEstimate: 1000,
          probability: 250,
          ownerUserId: 'u-1',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useDeals(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingDeals).toBe(false));

    expect(result.current.weightedPipelineValue).toBeLessThanOrEqual(result.current.totalPipelineValue);
  });

  it('useParties deve fallback de status invalido para active (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'party-legacy-status',
        data: {
          type: 'supplier',
          name: 'Fornecedor legado',
          contacts: [],
          status: 'disabled',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useParties(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingParties).toBe(false));

    expect(result.current.activeParties).toHaveLength(1);
    expect(result.current.parties[0]?.status).toBe('active');
  });

  it('useParties deve fallback de type invalido para other (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'party-legacy-type',
        data: {
          type: 'vendor',
          name: 'Parte legado',
          contacts: [],
          status: 'active',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useParties(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingParties).toBe(false));

    expect(result.current.parties[0]?.type).toBe('other');
  });
});
