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
import { useCustomers } from '@/hooks/useCustomers';
import { useFinAccounts } from '@/hooks/useFinAccounts';

describe('Audit Admin - normalization contracts', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('useCustomers deve fallback para status valido quando receber enum desconhecido (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'cust-legacy',
        data: {
          type: 'person',
          name: 'Cliente legado',
          status: 'deleted',
          ownerUserId: 'u-1',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));

    expect(result.current.activeCustomers).toHaveLength(1);
  });

  it('useFinAccounts deve normalizar openingBalance string para numero (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'acc-legacy',
        data: {
          name: 'Conta legado',
          type: 'cash',
          currency: 'BRL',
          openingBalance: '100.50',
          status: 'active',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));

    expect(typeof result.current.totalBalance).toBe('number');
    expect(result.current.totalBalance).toBeCloseTo(100.5, 2);
  });

  it('useFinAccounts deve fallback para tipo conhecido quando enum vier invalido (RED)', async () => {
    mockGetDocsReturn([
      {
        id: 'acc-legacy',
        data: {
          name: 'Conta legado',
          type: 'crypto_wallet',
          currency: 'BRL',
          openingBalance: 10,
          status: 'active',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));

    expect(result.current.accounts[0]?.type).toBe('cash');
  });
});
