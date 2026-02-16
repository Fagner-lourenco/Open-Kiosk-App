import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import {
  renderHookWithProviders,
  resetFirestoreMocks,
  makeTimestamp,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from './test-utils';

vi.mock('@/lib/pathResolver', () => ({
  ordersPath: vi.fn((franchiseId: string, storeId: string) => `franchises/${franchiseId}/stores/${storeId}/orders`),
}));

import { useCustomerRanking, formatDateYMD } from '@/hooks/useCustomerRanking';

describe('Audit Admin - customer ranking key contracts', () => {
  beforeEach(() => {
    resetFirestoreMocks();
    (onSnapshot as any).mockReset();
  });

  it('deve agrupar por customerIdentification normalizado (sem pontuacao)', async () => {
    const today = formatDateYMD(new Date());

    (onSnapshot as any).mockImplementationOnce((_q: unknown, next: (s: any) => void) => {
      next({
        docs: [
          {
            id: 'o-1',
            data: () => ({
              customerName: 'Joao Silva',
              customerIdentification: '123.456.789-00',
              status: 'completed',
              total: 10,
              date: today,
              timestamp: makeTimestamp('2026-02-16T10:00:00Z'),
              items: [{ title: 'IPA - 300ml', mlPerUnit: 300, quantity: 1 }],
            }),
          },
          {
            id: 'o-2',
            data: () => ({
              customerName: 'Joao S.',
              customerIdentification: '12345678900',
              status: 'dispensing',
              total: 20,
              date: today,
              timestamp: makeTimestamp('2026-02-16T10:05:00Z'),
              items: [{ title: 'Pilsen - 300ml', mlPerUnit: 300, quantity: 2 }],
            }),
          },
        ],
      });
      return () => {};
    });

    const { result } = renderHookWithProviders(() =>
      useCustomerRanking(TEST_FRANCHISE_ID, {
        storeId: TEST_STORE_ID,
        dateFrom: today,
        dateTo: today,
        metric: 'totalMl',
        limit: 10,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.ranking).toHaveLength(1);
    expect(result.current.ranking[0]?.orderCount).toBe(2);
    expect(result.current.ranking[0]?.totalMl).toBe(900);
  });

  it('deve usar fallback para nome quando customerIdentification nao tem digitos', async () => {
    const today = formatDateYMD(new Date());

    (onSnapshot as any).mockImplementationOnce((_q: unknown, next: (s: any) => void) => {
      next({
        docs: [
          {
            id: 'o-1',
            data: () => ({
              customerName: 'Ana Souza',
              customerIdentification: 'N/A',
              status: 'completed',
              total: 10,
              date: today,
              timestamp: makeTimestamp('2026-02-16T10:00:00Z'),
              items: [{ title: 'IPA - 300ml', mlPerUnit: 300, quantity: 1 }],
            }),
          },
          {
            id: 'o-2',
            data: () => ({
              customerName: 'Bruno Costa',
              customerIdentification: 'N/A',
              status: 'completed',
              total: 20,
              date: today,
              timestamp: makeTimestamp('2026-02-16T10:05:00Z'),
              items: [{ title: 'Pilsen - 300ml', mlPerUnit: 300, quantity: 1 }],
            }),
          },
        ],
      });
      return () => {};
    });

    const { result } = renderHookWithProviders(() =>
      useCustomerRanking(TEST_FRANCHISE_ID, {
        storeId: TEST_STORE_ID,
        dateFrom: today,
        dateTo: today,
        metric: 'totalMl',
        limit: 10,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.ranking).toHaveLength(2);
  });

  it('deve agrupar nomes sem identificacao por forma normalizada (uppercase + underscore)', async () => {
    const today = formatDateYMD(new Date());

    (onSnapshot as any).mockImplementationOnce((_q: unknown, next: (s: any) => void) => {
      next({
        docs: [
          {
            id: 'o-1',
            data: () => ({
              customerName: 'joao   silva',
              status: 'completed',
              total: 10,
              date: today,
              timestamp: makeTimestamp('2026-02-16T10:00:00Z'),
              items: [{ title: 'IPA - 300ml', mlPerUnit: 300, quantity: 1 }],
            }),
          },
          {
            id: 'o-2',
            data: () => ({
              customerName: '  JOAO SILVA  ',
              status: 'paid_pending_dispense',
              total: 20,
              date: today,
              timestamp: makeTimestamp('2026-02-16T10:05:00Z'),
              items: [{ title: 'Pilsen - 300ml', mlPerUnit: 300, quantity: 1 }],
            }),
          },
        ],
      });
      return () => {};
    });

    const { result } = renderHookWithProviders(() =>
      useCustomerRanking(TEST_FRANCHISE_ID, {
        storeId: TEST_STORE_ID,
        dateFrom: today,
        dateTo: today,
        metric: 'orderCount',
        limit: 10,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.ranking).toHaveLength(1);
    expect(result.current.ranking[0]?.orderCount).toBe(2);
  });
});
