import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { setDoc, updateDoc } from 'firebase/firestore';
import {
  renderHookWithProviders,
  mockGetDocsReturn,
  mockGetDocsEmpty,
  resetFirestoreMocks,
  makeTimestamp,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from '../test-utils';
import { useCommercialEvents } from '@/hooks/useCommercialEvents';
import { Timestamp } from 'firebase/firestore';

describe('useCommercialEvents coverage', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('normaliza eventos com defaults e calcula active/upcoming', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 2);

    mockGetDocsReturn([
      {
        id: 'ev-defaults',
        data: {
          title: 'Evento sem campos',
          startAt: Timestamp.fromDate(future),
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
      {
        id: 'ev-canceled',
        data: {
          title: 'Cancelado',
          status: 'canceled',
          startAt: Timestamp.fromDate(future),
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));
    expect(result.current.events[0].locationType).toBe('external');
    expect(result.current.events[0].status).toBe('draft');
    expect(result.current.activeEvents.length).toBe(1);
    expect(result.current.upcomingEvents.length).toBe(1);
  });

  it('updateEvent converte Date para Timestamp e mantém null explícito', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));

    await result.current.updateEvent({
      eventId: 'ev-1',
      title: 'Atualizado',
      endAt: null,
      startAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: 'Atualizado',
        endAt: null,
        startAt: expect.anything(),
        updatedAt: expect.anything(),
      }),
    );
  });

  it('fetchBudgetLines normaliza defaults', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));

    mockGetDocsReturn([
      {
        id: 'line-1',
        data: {
          qty: 2,
          unitCost: 10,
          totalCost: 20,
        },
      },
    ]);

    const lines = await result.current.fetchBudgetLines('ev-1');
    expect(lines[0].type).toBe('beverage');
    expect(lines[0].paidBy).toBe('store');
  });

  it('createBudgetLine calcula totalCost e updateBudgetLine recalcula quando qty muda', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));

    await result.current.createBudgetLine({
      eventId: 'ev-1',
      type: 'staff',
      qty: 3,
      unitCost: 15,
    });

    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        totalCost: 45,
        paidBy: 'store',
      }),
    );

    await result.current.updateBudgetLine({
      eventId: 'ev-1',
      lineId: 'line-1',
      qty: 5,
      unitCost: 12,
    });

    expect(updateDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        qty: 5,
        unitCost: 12,
        totalCost: 60,
      }),
    );
  });
});
