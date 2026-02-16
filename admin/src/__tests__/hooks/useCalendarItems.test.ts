/**
 * ============================================================================
 * useCalendarItems — Testes unitários
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
import { useCalendarItems } from '@/hooks/useCalendarItems';
import { Timestamp } from 'firebase/firestore';

// ─── Test Data ──────────────────────────────────────────────────────────────

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

const mockItems = [
  {
    id: 'cal-1',
    data: {
      type: 'visit',
      title: 'Reunião com fornecedor',
      startAt: Timestamp.fromDate(tomorrow),
      endAt: null,
      allDay: false,
      status: 'confirmed',
      ownerUserId: 'test-user-id',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'cal-2',
    data: {
      type: 'follow_up',
      title: 'Follow-up cliente VIP',
      startAt: Timestamp.fromDate(yesterday),
      endAt: null,
      allDay: false,
      status: 'confirmed',
      ownerUserId: 'test-user-id',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
  {
    id: 'cal-3',
    data: {
      type: 'event',
      title: 'Evento cancelado',
      startAt: Timestamp.fromDate(tomorrow),
      endAt: null,
      allDay: false,
      status: 'canceled',
      ownerUserId: 'test-user-id',
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    },
  },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCalendarItems', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('deve retornar lista vazia quando não há itens', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCalendarItems(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCalendar).toBe(false));
    expect(result.current.calendarItems).toHaveLength(0);
  });

  it('deve carregar itens de calendário', async () => {
    mockGetDocsReturn(mockItems);
    const { result } = renderHookWithProviders(() =>
      useCalendarItems(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCalendar).toBe(false));
    expect(result.current.calendarItems).toHaveLength(3);
  });

  it('deve filtrar upcomingItems (futuro + não cancelado)', async () => {
    mockGetDocsReturn(mockItems);
    const { result } = renderHookWithProviders(() =>
      useCalendarItems(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCalendar).toBe(false));
    // Only cal-1 (tomorrow, confirmed) should be upcoming
    expect(result.current.upcomingItems).toHaveLength(1);
    expect(result.current.upcomingItems[0].title).toBe('Reunião com fornecedor');
  });

  it('não deve fazer query com IDs vazios', async () => {
    renderHookWithProviders(() => useCalendarItems('', ''));
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('deve chamar setDoc ao criar item', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCalendarItems(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCalendar).toBe(false));
    mockGetDocsEmpty();
    await result.current.createCalendarItem({
      type: 'visit',
      title: 'Nova reunião',
      startAt: new Date(),
    });

    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('deve chamar deleteDoc ao excluir item', async () => {
    mockGetDocsReturn(mockItems);
    const { result } = renderHookWithProviders(() =>
      useCalendarItems(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCalendar).toBe(false));
    mockGetDocsEmpty();
    await result.current.deleteCalendarItem('cal-1');

    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deve expor flags isPending', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCalendarItems(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCalendar).toBe(false));
    expect(result.current.isCreatingCalendarItem).toBe(false);
    expect(result.current.isUpdatingCalendarItem).toBe(false);
    expect(result.current.isDeletingCalendarItem).toBe(false);
  });
});
