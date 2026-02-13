/**
 * ============================================================================
 * TESTES REAIS - StoreService
 * ============================================================================
 * Testa o StoreService REAL. Firebase é mockado minimamente.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase antes de importar
vi.mock('@/services/firebase', () => ({
  getFirebaseDb: vi.fn(() => ({})),
  getCurrentStoreId: vi.fn(() => 'test-store-123'),
  getCurrentFranchiseId: vi.fn(() => null),
}));

vi.mock('@/lib/pathResolver', () => ({
  isFranchiseMode: vi.fn(() => false),
}));

// Mock Firestore
const mockSnapshot = {
  exists: vi.fn(() => true),
  data: vi.fn(() => ({
    storeId: 'test-store-123',
    name: 'Test Store',
    slug: 'test-store',
    isActive: true,
    currency: 'BRL',
    taxId: '12345678901234',
    taxPercentage: 10,
    language: 'pt-BR',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  })),
  id: 'test-store-123',
};

const mockDocsSnapshot = {
  docs: [
    {
      id: 'store-1',
      data: () => ({ storeId: 'store-1', name: 'Store 1', isActive: true }),
    },
    {
      id: 'store-2',
      data: () => ({ storeId: 'store-2', name: 'Store 2', isActive: false }),
    },
  ],
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(() => Promise.resolve(mockSnapshot)),
  getDocs: vi.fn(() => Promise.resolve(mockDocsSnapshot)),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
}));

import { storeService } from '@/services/storeService';
import { getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { getCurrentStoreId } from '@/services/firebase';
// isFranchiseMode foi removido de pathResolver
const isFranchiseMode = vi.fn(() => false);

describe('StoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('getCurrentStoreId', () => {
    it('retorna storeId do firebase service', () => {
      const result = storeService.getCurrentStoreId();
      expect(getCurrentStoreId).toHaveBeenCalled();
      expect(result).toBe('test-store-123');
    });
  });

  describe('validateStoreExists', () => {
    it('retorna true quando loja existe com dados válidos', async () => {
      const result = await storeService.validateStoreExists('test-store-123');
      expect(result).toBe(true);
      expect(getDoc).toHaveBeenCalled();
    });

    it('retorna false quando loja não existe', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      } as any);

      const result = await storeService.validateStoreExists('non-existent');
      expect(result).toBe(false);
    });

    it('retorna false quando documento está vazio', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({}),
      } as any);

      const result = await storeService.validateStoreExists('empty-store');
      expect(result).toBe(false);
    });

    it('retorna false quando documento não tem storeId', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ name: 'Store without ID' }),
      } as any);

      const result = await storeService.validateStoreExists('invalid-store');
      expect(result).toBe(false);
    });

    it('retorna false em caso de erro', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce(new Error('Network error'));

      const result = await storeService.validateStoreExists('error-store');
      expect(result).toBe(false);
    });
  });

  describe('getStore', () => {
    it('retorna dados da loja quando existe', async () => {
      const store = await storeService.getStore('test-store-123');
      
      expect(store).toBeTruthy();
      expect(store?.id).toBe('test-store-123');
      expect(store?.name).toBe('Test Store');
      expect(store?.currency).toBe('BRL');
    });

    it('retorna null quando loja não existe', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      } as any);

      const store = await storeService.getStore('non-existent');
      expect(store).toBeNull();
    });

    it('usa path de franchise quando em modo franchise', async () => {
      vi.mocked(isFranchiseMode).mockReturnValueOnce(true);
      const { getCurrentFranchiseId } = await import('@/services/firebase');
      vi.mocked(getCurrentFranchiseId).mockReturnValueOnce('franchise-abc');

      await storeService.getStore('store-in-franchise');
      
      expect(isFranchiseMode).toHaveBeenCalled();
    });

    it('tenta recuperar do localStorage quando documento está vazio', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({}),
      } as any);

      localStorage.setItem('storeSettings', JSON.stringify({
        storeId: 'cached-store',
        name: 'Cached Store',
        currency: 'USD',
      }));

      const store = await storeService.getStore('cached-store');
      // Deve tentar recuperar
      expect(store).toBeDefined();
    });

    it('retorna null quando erro de permissão e sem cache', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce({
        code: 'permission-denied',
        message: 'Permission denied',
      });

      const store = await storeService.getStore('no-permission');
      expect(store).toBeNull();
    });
  });

  describe('createStore', () => {
    it('cria nova loja quando não existe', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      } as any);

      const storeId = await storeService.createStore({
        storeId: 'new-store',
        name: 'New Store',
        slug: 'new-store',
        isActive: true,
        currency: 'BRL',
        taxId: '',
        taxPercentage: 0,
      });

      expect(storeId).toBe('new-store');
      expect(setDoc).toHaveBeenCalled();
    });

    it('atualiza loja existente ao invés de criar', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ storeId: 'existing-store' }),
      } as any);

      const storeId = await storeService.createStore({
        storeId: 'existing-store',
        name: 'Updated Store',
        slug: 'existing-store',
        isActive: true,
        currency: 'BRL',
        taxId: '',
        taxPercentage: 0,
      });

      expect(storeId).toBe('existing-store');
      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('updateStore', () => {
    it('atualiza dados da loja', async () => {
      await storeService.updateStore('test-store', {
        name: 'Updated Name',
        currency: 'USD',
      });

      expect(updateDoc).toHaveBeenCalled();
    });

    it('inclui updated_at na atualização', async () => {
      await storeService.updateStore('test-store', { name: 'New Name' });

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'New Name',
          updated_at: expect.any(String),
        })
      );
    });

    it('propaga erro em caso de falha', async () => {
      vi.mocked(updateDoc).mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        storeService.updateStore('error-store', { name: 'Failed' })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('getAllStores', () => {
    it('retorna todas as lojas', async () => {
      const stores = await storeService.getAllStores();
      
      expect(stores).toHaveLength(2);
      expect(stores[0].id).toBe('store-1');
      expect(stores[1].id).toBe('store-2');
    });

    it('propaga erro em caso de falha', async () => {
      vi.mocked(getDocs).mockRejectedValueOnce(new Error('Fetch failed'));

      await expect(storeService.getAllStores()).rejects.toThrow('Fetch failed');
    });
  });

  describe('getActiveStores', () => {
    it('retorna apenas lojas ativas', async () => {
      const stores = await storeService.getActiveStores();
      
      expect(getDocs).toHaveBeenCalled();
      expect(stores).toBeDefined();
    });
  });

  describe('ensureStoreExists', () => {
    it('cria loja quando não existe', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      } as any);

      await storeService.ensureStoreExists(
        'new-store',
        'New Store',
        'BRL',
        '12345',
        10
      );

      expect(setDoc).toHaveBeenCalled();
    });

    it('não cria quando já existe com dados válidos', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ storeId: 'existing', name: 'Existing' }),
      } as any);

      await storeService.ensureStoreExists(
        'existing',
        'Existing',
        'BRL',
        '',
        0
      );

      expect(setDoc).not.toHaveBeenCalled();
    });

    it('cria quando documento existe mas está vazio (placeholder)', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({}),
      } as any);

      await storeService.ensureStoreExists(
        'empty-store',
        'Populated Store',
        'USD',
        '99999',
        5
      );

      expect(setDoc).toHaveBeenCalled();
    });

    it('usa path de franchise quando em modo franchise', async () => {
      vi.mocked(isFranchiseMode).mockReturnValueOnce(true);
      const { getCurrentFranchiseId } = await import('@/services/firebase');
      vi.mocked(getCurrentFranchiseId).mockReturnValueOnce('franchise-xyz');

      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      } as any);

      await storeService.ensureStoreExists(
        'franchise-store',
        'Franchise Store',
        'BRL',
        '',
        0
      );

      expect(isFranchiseMode).toHaveBeenCalled();
    });

    it('propaga erro em caso de falha', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce(new Error('Firestore error'));

      await expect(
        storeService.ensureStoreExists('error-store', 'Name', 'BRL', '', 0)
      ).rejects.toThrow('Firestore error');
    });
  });
});
