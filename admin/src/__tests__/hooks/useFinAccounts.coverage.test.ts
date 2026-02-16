import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { setDoc, updateDoc } from 'firebase/firestore';
import {
  renderHookWithProviders,
  mockGetDocsReturn,
  mockGetDocsEmpty,
  resetFirestoreMocks,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from '../test-utils';
import { useFinAccounts } from '@/hooks/useFinAccounts';

describe('useFinAccounts coverage', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('normaliza account com defaults quando campos opcionais faltam', async () => {
    mockGetDocsReturn([
      {
        id: 'acc-defaults',
        data: {
          name: 'Conta sem tipo',
          createdAt: { seconds: 1, nanoseconds: 0 },
          updatedAt: { seconds: 1, nanoseconds: 0 },
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));
    expect(result.current.accounts[0].type).toBe('cash');
    expect(result.current.accounts[0].currency).toBe('BRL');
    expect(result.current.accounts[0].openingBalance).toBe(0);
    expect(result.current.accounts[0].status).toBe('active');
  });

  it('createAccount preenche defaults e openingAt quando informado', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));

    const openingAt = new Date('2026-01-01T00:00:00.000Z');
    mockGetDocsEmpty();
    await result.current.createAccount({
      name: 'Conta Pix',
      type: 'pix',
      openingAt,
    });

    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Conta Pix',
        type: 'pix',
        currency: 'BRL',
        openingBalance: 0,
        status: 'active',
        openingAt: expect.anything(),
      }),
    );
  });

  it('updateAccount atualiza apenas campos informados', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));

    await result.current.updateAccount({
      accountId: 'acc-1',
      name: 'Conta Atualizada',
    });

    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Conta Atualizada',
        updatedAt: expect.anything(),
      }),
    );
  });

  it('propaga erro em createAccount quando setDoc falha', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useFinAccounts(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingAccounts).toBe(false));

    (setDoc as any).mockRejectedValueOnce(new Error('setDoc failed'));

    await expect(
      result.current.createAccount({ name: 'Erro', type: 'cash' }),
    ).rejects.toThrow('setDoc failed');
  });
});
