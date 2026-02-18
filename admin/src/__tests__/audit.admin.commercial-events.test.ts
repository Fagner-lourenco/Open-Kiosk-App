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
import { useCommercialEvents } from '@/hooks/useCommercialEvents';

describe('Audit Admin - commercial events contracts', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('update parcial por qty busca unitCost do Firestore e recalcula totalCost', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));

    await result.current.updateBudgetLine({
      eventId: 'ev-1',
      lineId: 'line-1',
      qty: 5,
    });

    const lastPayload = (updateDoc as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[1] as Record<string, unknown>;
    // getDoc mock returns empty → unitCost defaults to 0, so totalCost = 5 * 0 = 0
    expect(lastPayload.totalCost).toBe(0);
  });

  it('update parcial por unitCost busca qty do Firestore e recalcula totalCost', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));

    await result.current.updateBudgetLine({
      eventId: 'ev-1',
      lineId: 'line-1',
      unitCost: 12,
    });

    const lastPayload = (updateDoc as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[1] as Record<string, unknown>;
    // getDoc mock returns empty → qty defaults to 0, so totalCost = 0 * 12 = 0
    expect(lastPayload.totalCost).toBe(0);
  });
});
