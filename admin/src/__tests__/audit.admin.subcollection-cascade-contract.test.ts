import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { writeBatch } from 'firebase/firestore';
import {
  renderHookWithProviders,
  mockGetDocsEmpty,
  resetFirestoreMocks,
  TEST_FRANCHISE_ID,
  TEST_STORE_ID,
} from './test-utils';
import { useCommercialEvents } from '@/hooks/useCommercialEvents';
import { useQuotes } from '@/hooks/useQuotes';

describe('Audit Admin - subcollection cascade contracts', () => {
  beforeEach(() => {
    resetFirestoreMocks();
  });

  it('deleteEvent deve limpar budgetLines antes de remover o evento pai (RED)', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useCommercialEvents(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingEvents).toBe(false));

    await result.current.deleteEvent('ev-1');

    const batch = (writeBatch as any).mock.results.at(-1)?.value;
    const deletedPaths = batch?.delete.mock.calls.map((call: unknown[]) => ((call[0] as { path?: string })?.path || '')) ?? [];

    expect(
      deletedPaths.some((path: string) => path.includes('/commercialEvents/ev-1/budgetLines/')),
    ).toBe(true);
    expect(deletedPaths.some((path: string) => path.endsWith('/commercialEvents/ev-1'))).toBe(true);
    expect(batch?.commit).toHaveBeenCalledTimes(1);
  });

  it('deleteQuote deve limpar lines antes de remover a proposta pai (RED)', async () => {
    mockGetDocsEmpty();
    const { result } = renderHookWithProviders(() =>
      useQuotes(TEST_FRANCHISE_ID, TEST_STORE_ID),
    );

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));

    await result.current.deleteQuote('q-1');

    const batch = (writeBatch as any).mock.results.at(-1)?.value;
    const deletedPaths = batch?.delete.mock.calls.map((call: unknown[]) => ((call[0] as { path?: string })?.path || '')) ?? [];

    expect(
      deletedPaths.some((path: string) => path.includes('/quotes/q-1/lines/')),
    ).toBe(true);
    expect(deletedPaths.some((path: string) => path.endsWith('/quotes/q-1'))).toBe(true);
    expect(batch?.commit).toHaveBeenCalledTimes(1);
  });
});
