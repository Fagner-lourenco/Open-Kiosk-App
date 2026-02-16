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

  it('update parcial por qty nao deve recalcular totalCost com zero sem unitCost conhecido (RED)', async () => {
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
    expect(lastPayload.totalCost).toBeUndefined();
  });

  it('update parcial por unitCost nao deve recalcular totalCost com zero sem qty conhecido (RED)', async () => {
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
    expect(lastPayload.totalCost).toBeUndefined();
  });
});
