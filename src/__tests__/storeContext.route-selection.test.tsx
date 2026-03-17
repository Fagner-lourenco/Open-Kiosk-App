import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    getFirestore: vi.fn(),
    initializeFirestore: vi.fn(),
    collection: vi.fn(),
    doc: vi.fn(),
    persistentLocalCache: vi.fn(),
    persistentMultipleTabManager: vi.fn(),
  };
});

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

vi.mock('@/lib/pathResolver', () => ({
  storeSubPath: vi.fn(),
  StoreSubcollection: {},
}));

vi.mock('@/hooks/useTapConfiguration', () => ({
  useTapConfiguration: vi.fn(() => ({
    taps: [],
    version: 0,
    loading: false,
    source: 'none',
    reportApplied: vi.fn(),
  })),
}));

vi.mock('@/services/storeService', () => ({
  storeService: {
    getStore: vi.fn(() => Promise.resolve(null)),
  },
}));

import { StoreProvider, useStoreContext } from '@/context/StoreContext';

const Consumer = () => {
  const { currentStoreId } = useStoreContext();
  return <span data-testid="storeId">{currentStoreId || 'null'}</span>;
};

describe('StoreContext route-aware selection', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/admin';
  });

  it('carrega storeSettings no kiosk mesmo com selectedStore antigo', async () => {
    window.location.hash = '#/shop';
    localStorage.setItem('open-kiosk-admin:selectedStore', 'admin-store');
    localStorage.setItem('storeSettings', JSON.stringify({
      storeId: 'kiosk-store',
      franchiseId: 'kiosk-franchise',
      name: 'Kiosk Store',
    }));

    render(
      <StoreProvider>
        <Consumer />
      </StoreProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('storeId').textContent).toBe('kiosk-store');
    });
  });
});
