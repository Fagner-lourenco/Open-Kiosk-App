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

  it('update parcial por qty busca unitPrice do Firestore e recalcula total', async () => {
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
    // getDoc mock returns empty → unitPrice defaults to 0, so total = 3 * 0 = 0
    expect(lastPayload.total).toBe(0);
  });

  it('update parcial por unitPrice busca qty do Firestore e recalcula total', async () => {
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
    // getDoc mock returns empty → qty defaults to 0, so total = 0 * 49.9 = 0
    expect(lastPayload.total).toBe(0);
  });
});
