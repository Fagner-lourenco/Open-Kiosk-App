import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { updateDoc } from 'firebase/firestore';
import {
  renderHookWithProviders,
  mockGetDocsEmpty,
  resetFirestoreMocks,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from './test-utils';
import { useQuotes } from '@/hooks/useQuotes';

describe('Audit Admin - quotes contracts', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('update parcial por qty nao deve recalcular total com zero sem unitPrice conhecido (RED)', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));

    await result.current.updateQuoteLine({
      quoteId: 'q-1',
      lineId: 'line-1',
      qty: 3,
    });

    const lastPayload = (updateDoc as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(lastPayload.total).toBeUndefined();
  });

  it('update parcial por unitPrice nao deve recalcular total com zero sem qty conhecido (RED)', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));

    await result.current.updateQuoteLine({
      quoteId: 'q-1',
      lineId: 'line-1',
      unitPrice: 49.9,
    });

    const lastPayload = (updateDoc as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(lastPayload.total).toBeUndefined();
  });
});
