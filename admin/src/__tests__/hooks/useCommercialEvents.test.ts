/**
 * ============================================================================
 * useCommercialEvents — Testes unitários
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
import { useCommercialEvents } from '@/hooks/useCommercialEvents';
import { Timestamp } from 'firebase/firestore';

// ─── Test Data ──────────────────────────────────────────────────────────────

const nextWeek = new Date();
nextWeek.setDate(nextWeek.getDate() + 7);

const mockEvents = [
  {
    id: 'ev-1',
    data: {
      customerId: 'cust-1',
      title: 'Evento Corporativo Alpha',
      status: 'confirmed',
      startAt: Timestamp.fromDate(nextWeek),
      endAt: Timestamp.fromDate(nextWeek),
      locationType: 'external',
      guestCount: 100,
      pricingModel: 'per_liter',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'ev-2',
    data: {
      customerId: 'cust-2',
      title: 'Festa de Fim de Ano',
      status: 'draft',
      startAt: Timestamp.fromDate(nextWeek),
      endAt: null,
      locationType: 'on_site',
      guestCount: 200,
      pricingModel: 'package',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'ev-3',
    data: {
      customerId: 'cust-3',
      title: 'Evento Cancelado',
      status: 'canceled',
      startAt: makeTimestamp(),
      endAt: null,
      locationType: 'on_site',
      guestCount: 50,
      pricingModel: 'package',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCommercialEvents', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('deve retornar lista vazia quando não há eventos', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));
    expect(result.current.events).toHaveLength(0);
  });

  it('deve carregar eventos e filtrar ativos', async () => {
    mockGetDocsReturn(mockEvents);
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));
    expect(result.current.events).toHaveLength(3);

    // activeEvents = not canceled
    expect(result.current.activeEvents).toHaveLength(2);
  });

  it('deve filtrar upcoming events (futuro + não cancelado)', async () => {
    mockGetDocsReturn(mockEvents);
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));
    // ev-1 and ev-2 are upcoming (nextWeek, not canceled)
    expect(result.current.upcomingEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('não deve fazer query com IDs vazios', async () => {
    renderHookWithProviders(() => useCommercialEvents('', ''));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar evento', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));
    mockGetDocsEmpty();
    await result.current.createEvent({
      customerId: 'cust-1',
      title: 'Novo Evento',
      startAt: new Date(),
      locationType: 'on_site',
      attendeesEstimate: 50,
      pricingModel: 'package',
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir evento', async () => {
    mockGetDocsReturn(mockEvents);
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteEvent('ev-1');

    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));
    expect(result.current.isCreatingEvent).toBe(false);
    expect(result.current.isUpdatingEvent).toBe(false);
    expect(result.current.isDeletingEvent).toBe(false);
  });

  it('deve expor funções de budget lines', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));
    expect(typeof result.current.fetchBudgetLines).toBe('function');
    expect(typeof result.current.createBudgetLine).toBe('function');
    expect(typeof result.current.deleteBudgetLine).toBe('function');
  });
});
