/**
 * ============================================================================
 * Test Utilities — Wrapper para hooks com QueryClientProvider
 * ============================================================================
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, type RenderHookOptions } from '@testing-library/react';
import { vi } from 'vitest';
import { addDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, Timestamp } from 'firebase/firestore';

vi.mock('@/context/FranchiseContext', () => ({
  useFranchise: vi.fn(() => ({
    currentFranchise: { id: 'test-franchise', name: 'Franchise Test' },
    franchises: [{ id: 'test-franchise', name: 'Franchise Test' }],
    selectedStoreId: 'test-store',
    setSelectedStoreId: vi.fn(),
    refreshFranchises: vi.fn(),
  })),
  FranchiseProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Test IDs ───────────────────────────────────────────────────────────────

export const TEST_FRANCHISE_ID = 'test-franchise';
export const TEST_STORE_ID = 'test-store';
export const TEST_USER_ID = 'test-user-id';

// ─── Timestamp helpers ──────────────────────────────────────────────────────

export function makeTimestamp(dateStr = '2026-01-15T10:00:00Z') {
  return Timestamp.fromDate(new Date(dateStr));
}

// ─── Firestore mock helpers ─────────────────────────────────────────────────

export function mockGetDocsReturn(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  (getDocs as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    empty: docs.length === 0,
    size: docs.length,
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d.data,
      exists: () => true,
      ref: { path: d.id, type: 'doc' },
    })),
  });
}

export function mockGetDocsEmpty() {
  (getDocs as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ empty: true, size: 0, docs: [] });
}

export function resetFirestoreMocks() {
  (getDocs as ReturnType<typeof vi.fn>).mockReset().mockImplementation((queryRef: unknown) => {
    const path = (queryRef as { path?: string } | undefined)?.path || '';
    // Subcollection cascade: return a dummy doc so cascade-delete loops execute
    if (/\/(budgetLines|lines)$/.test(path)) {
      return Promise.resolve({
        empty: false,
        size: 1,
        docs: [{
          id: 'cascade-line-1',
          data: () => ({}),
          exists: () => true,
          ref: { path: `${path}/cascade-line-1`, type: 'doc' },
        }],
      });
    }
    return Promise.resolve({ empty: true, size: 0, docs: [] });
  });
  (addDoc as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({ id: 'mock-id' });
  (setDoc as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
  (updateDoc as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
  (deleteDoc as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
  (writeBatch as ReturnType<typeof vi.fn>).mockReset().mockImplementation(() => ({
    delete: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  }));
}

// ─── QueryClient wrapper ───────────────────────────────────────────────────

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function createWrapper() {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

export function renderHookWithProviders<TResult>(
  hook: () => TResult,
  options?: Omit<RenderHookOptions<unknown>, 'wrapper'>,
) {
  const { Wrapper, queryClient } = createWrapper();
  const result = renderHook(hook, { wrapper: Wrapper, ...options });
  return { ...result, queryClient };
}
