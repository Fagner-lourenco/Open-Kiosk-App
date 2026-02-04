import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase antes de importar o serviço
vi.mock('@/services/firebase', () => ({
  getFirebaseDb: vi.fn(() => ({})),
  getCurrentFranchiseId: vi.fn(() => null),
}));

vi.mock('@/lib/pathResolver', () => ({
  isFranchiseMode: vi.fn(() => false),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => true, data: () => ({ name: 'Test Store' }) })),
  onSnapshot: vi.fn((ref, onUpdate, onError) => {
    onUpdate({ exists: () => true, data: () => ({ name: 'Test Store' }) });
    return () => {};
  }),
}));

import { getStoreSettings, subscribeStoreSettings } from '@/services/storeSettingsService';

describe('storeSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStoreSettings', () => {
    it('retorna dados da loja quando existe', async () => {
      const result = await getStoreSettings('store-1');
      expect(result).toEqual({ name: 'Test Store' });
    });
  });

  describe('subscribeStoreSettings', () => {
    it('chama onUpdate com dados quando loja existe', () => {
      const onUpdate = vi.fn();
      const unsubscribe = subscribeStoreSettings('store-1', onUpdate);
      
      expect(onUpdate).toHaveBeenCalledWith({ name: 'Test Store' });
      expect(typeof unsubscribe).toBe('function');
    });
  });
});
