import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDoc, setDoc } from 'firebase/firestore';

const mockGetFirebaseDb = vi.fn(() => ({ name: 'mock-db' }));
const mockGetCurrentFranchiseId = vi.fn(() => 'franchise-1');
const mockGetCurrentStoreId = vi.fn(() => 'store-1');

vi.mock('@/services/firebase', () => ({
  getFirebaseDb: mockGetFirebaseDb,
  getCurrentFranchiseId: mockGetCurrentFranchiseId,
  getCurrentStoreId: mockGetCurrentStoreId,
}));

describe('storeService cache recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(getDoc).mockResolvedValue({
      id: 'store-1',
      exists: () => false,
      data: () => undefined,
    } as any);
    vi.mocked(setDoc).mockResolvedValue(undefined);
  });

  it('usa o cache local sem reescrever a store canônica', async () => {
    localStorage.setItem('storeSettings', JSON.stringify({
      storeId: 'store-1',
      franchiseId: 'franchise-1',
      name: 'Loja Cache',
      currency: 'BRL',
      taxPercentage: 7,
    }));

    const { storeService } = await import('@/services/storeService');
    const store = await storeService.getStore('store-1');

    expect(store?.name).toBe('Loja Cache');
    expect(store?.storeId).toBe('store-1');
    expect(storeService.getLastLoadSource()).toBe('cache');
    expect(vi.mocked(setDoc)).not.toHaveBeenCalled();
  });

  it('normaliza o fallback de cache com defaults seguros', async () => {
    localStorage.setItem('storeSettings', JSON.stringify({
      storeId: 'store-1',
      name: 'Fallback',
    }));

    const { storeService } = await import('@/services/storeService');
    const store = storeService.getCachedStore('store-1');

    expect(store?.currency).toBe('BRL');
    expect(store?.taxPercentage).toBe(0);
    expect(store?.slug).toBe('store-1');
  });
});
