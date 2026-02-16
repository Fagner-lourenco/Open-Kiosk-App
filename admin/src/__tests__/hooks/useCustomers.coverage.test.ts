import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  renderHookWithProviders,
  mockGetDocsReturn,
  mockGetDocsEmpty,
  resetFirestoreMocks,
  makeTimestamp,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from '../test-utils';
import { useCustomers } from '@/hooks/useCustomers';

describe('useCustomers coverage', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('normaliza customer com defaults', async () => {
    mockGetDocsReturn([
      {
        id: 'cust-default',
        data: {
          name: 'Sem campos',
          createdAt: makeTimestamp(),
          updatedAt: makeTimestamp(),
        },
      },
    ]);

    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));
    expect(result.current.customers[0].type).toBe('person');
    expect(result.current.customers[0].status).toBe('active');
    expect(result.current.customers[0].tags).toEqual([]);
    expect(result.current.customers[0].emails).toEqual([]);
  });

  it('createCustomer usa ownerUserId do AuthContext mockado', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));
    mockGetDocsEmpty();
    await result.current.createCustomer({
      type: 'person',
      name: 'Cliente Owner',
    });

    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerUserId: 'test-user-id',
        status: 'active',
      }),
    );
  });

  it('updateCustomer remove campos undefined e mantém null explícito', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));

    await result.current.updateCustomer({
      customerId: 'cust-1',
      name: 'Novo Nome',
      address: undefined,
      source: null as never,
    });

    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Novo Nome',
        source: null,
        updatedAt: expect.anything(),
      }),
    );
  });

  it('propaga erro quando setDoc falha em createCustomer', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));
    (setDoc as any).mockRejectedValueOnce(new Error('create failed'));

    await expect(
      result.current.createCustomer({ type: 'person', name: 'Erro' }),
    ).rejects.toThrow('create failed');
  });

  it('propaga erro quando deleteDoc falha em deleteCustomer', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCustomers(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingCustomers).toBe(false));
    (deleteDoc as any).mockRejectedValueOnce(new Error('delete failed'));

    await expect(result.current.deleteCustomer('cust-1')).rejects.toThrow('delete failed');
  });
});
