import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  getCurrentFranchiseId,
  getCurrentStoreId,
  KIOSK_SELECTED_FRANCHISE_KEY,
  KIOSK_SELECTED_STORE_KEY,
} from '@/services/firebase';

describe('firebase route-aware selection', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/admin';
  });

  it('prefere a selecao persistida do kiosk fora do fluxo de migracao', () => {
    localStorage.setItem(KIOSK_SELECTED_STORE_KEY, 'kiosk-selected-store');
    localStorage.setItem(KIOSK_SELECTED_FRANCHISE_KEY, 'kiosk-selected-franchise');
    localStorage.setItem('storeSettings', JSON.stringify({
      storeId: 'kiosk-store',
      franchiseId: 'kiosk-franchise',
    }));

    expect(getCurrentStoreId()).toBe('kiosk-selected-store');
    expect(getCurrentFranchiseId()).toBe('kiosk-selected-franchise');
  });

  it('prefere storeSettings em rota de kiosk mesmo com selecao antiga do Admin', () => {
    window.location.hash = '#/shop';
    localStorage.setItem('open-kiosk-admin:selectedStore', 'admin-store');
    localStorage.setItem('open-kiosk-admin:selectedFranchise', 'admin-franchise');
    localStorage.setItem('currentStoreId', 'legacy-store');
    localStorage.setItem('selectedFranchiseId', 'legacy-franchise');
    localStorage.setItem('storeSettings', JSON.stringify({
      storeId: 'kiosk-store',
      franchiseId: 'kiosk-franchise',
    }));

    expect(getCurrentStoreId()).toBe('kiosk-store');
    expect(getCurrentFranchiseId()).toBe('kiosk-franchise');
  });

  it('faz fallback para chaves legadas quando necessario', () => {
    localStorage.setItem('currentStoreId', 'legacy-store');
    localStorage.setItem('selectedFranchiseId', 'legacy-franchise');

    expect(getCurrentStoreId()).toBe('legacy-store');
    expect(getCurrentFranchiseId()).toBe('legacy-franchise');
  });

  it('usa a selecao do Admin apenas como ultimo fallback de migracao', () => {
    localStorage.setItem('open-kiosk-admin:selectedStore', 'admin-store');
    localStorage.setItem('open-kiosk-admin:selectedFranchise', 'admin-franchise');

    expect(getCurrentStoreId()).toBe('admin-store');
    expect(getCurrentFranchiseId()).toBe('admin-franchise');
  });
});
