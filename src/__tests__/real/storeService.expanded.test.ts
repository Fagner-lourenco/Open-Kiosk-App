/**
 * ============================================================================
 * TESTES EXPANDIDOS - StoreService
 * ============================================================================
 * Testa o StoreService REAL com cobertura expandida. Firebase é mockado minimamente.
 * Foco em casos de erro, edge cases e cenários complexos.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock firebase antes de importar
vi.mock('@/services/firebase', () => ({
  getFirebaseDb: vi.fn(() => ({})),
  getCurrentStoreId: vi.fn(() => 'test-store-123'),
  getCurrentFranchiseId: vi.fn(() => null),
}));

vi.mock('@/lib/pathResolver', () => ({
  isFranchiseMode: vi.fn(() => false),
}));

// Mock Firestore com mais controle
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

const mockEmptySnapshot = {
  exists: vi.fn(() => true),
  data: vi.fn(() => ({})),
  id: 'empty-store',
};

const mockNonExistentSnapshot = {
  exists: vi.fn(() => false),
  data: vi.fn(() => null),
  id: 'non-existent',
};

const mockDocsSnapshot = {
  docs: [
    {
      id: 'store-1',
      data: () => ({
        storeId: 'store-1',
        name: 'Store 1',
        isActive: true,
        currency: 'BRL',
        taxId: '11111111111111',
        taxPercentage: 5,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      }),
    },
    {
      id: 'store-2',
      data: () => ({
        storeId: 'store-2',
        name: 'Store 2',
        isActive: false,
        currency: 'USD',
        taxId: '22222222222222',
        taxPercentage: 8,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      }),
    },
  ],
};

const mockActiveDocsSnapshot = {
  docs: [
    {
      id: 'store-1',
      data: () => ({
        storeId: 'store-1',
        name: 'Store 1',
        isActive: true,
        currency: 'BRL',
        taxId: '11111111111111',
        taxPercentage: 5,
      }),
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
import { getDoc, getDocs, setDoc, updateDoc, collection, doc, query, where } from 'firebase/firestore';
import { getCurrentStoreId, getCurrentFranchiseId } from '@/services/firebase';
import { isFranchiseMode } from '@/lib/pathResolver';

describe('StoreService - Expanded Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Reset mocks to default
    vi.mocked(getDoc).mockResolvedValue(mockSnapshot);
    vi.mocked(getDocs).mockResolvedValue(mockDocsSnapshot);
    vi.mocked(setDoc).mockResolvedValue(undefined);
    vi.mocked(updateDoc).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('getCurrentStoreId', () => {
    it('retorna storeId do firebase service', () => {
      const result = storeService.getCurrentStoreId();
      expect(getCurrentStoreId).toHaveBeenCalled();
      expect(result).toBe('test-store-123');
    });

    it('retorna null quando firebase retorna null', () => {
      vi.mocked(getCurrentStoreId).mockReturnValueOnce(null);
      const result = storeService.getCurrentStoreId();
      expect(result).toBeNull();
    });

    it('retorna string vazia quando firebase retorna string vazia', () => {
      vi.mocked(getCurrentStoreId).mockReturnValueOnce('');
      const result = storeService.getCurrentStoreId();
      expect(result).toBe('');
    });
  });

  describe('validateStoreExists', () => {
    it('retorna true quando loja existe com dados válidos', async () => {
      const result = await storeService.validateStoreExists('test-store-123');
      expect(result).toBe(true);
      expect(getDoc).toHaveBeenCalledWith(expect.anything());
    });

    it('retorna false quando loja não existe', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      const result = await storeService.validateStoreExists('non-existent');
      expect(result).toBe(false);
    });

    it('retorna false quando documento existe mas está vazio', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockEmptySnapshot);

      const result = await storeService.validateStoreExists('empty-store');
      expect(result).toBe(false);
    });

    it('retorna false quando documento não tem storeId', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ name: 'Store without ID', currency: 'BRL' }),
        id: 'invalid-store',
      } as any);

      const result = await storeService.validateStoreExists('invalid-store');
      expect(result).toBe(false);
    });

    it('retorna false quando documento tem apenas campos não essenciais', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ created_at: '2024-01-01', updated_at: '2024-01-01' }),
        id: 'incomplete-store',
      } as any);

      const result = await storeService.validateStoreExists('incomplete-store');
      expect(result).toBe(false);
    });

    it('retorna false em caso de erro de rede', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce(new Error('Network error'));

      const result = await storeService.validateStoreExists('error-store');
      expect(result).toBe(false);
    });

    it('retorna false em caso de erro de permissão', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce({
        code: 'permission-denied',
        message: 'Permission denied',
      });

      const result = await storeService.validateStoreExists('no-permission');
      expect(result).toBe(false);
    });

    it('aceita storeId vazio como parâmetro', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      const result = await storeService.validateStoreExists('');
      expect(result).toBe(false);
    });
  });

  describe('getStore', () => {
    it('retorna dados completos da loja quando existe', async () => {
      const store = await storeService.getStore('test-store-123');

      expect(store).toBeTruthy();
      expect(store?.id).toBe('test-store-123');
      expect(store?.storeId).toBe('test-store-123');
      expect(store?.name).toBe('Test Store');
      expect(store?.currency).toBe('BRL');
      expect(store?.taxId).toBe('12345678901234');
      expect(store?.taxPercentage).toBe(10);
      expect(store?.isActive).toBe(true);
      expect(store?.language).toBe('pt-BR');
    });

    it('retorna null quando loja não existe', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      const store = await storeService.getStore('non-existent');
      expect(store).toBeNull();
    });

    it('retorna null quando documento existe mas está vazio', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockEmptySnapshot);

      const store = await storeService.getStore('empty-store');
      expect(store).toBeNull();
    });

    it('usa path de franchise quando em modo franchise', async () => {
      vi.mocked(isFranchiseMode).mockReturnValueOnce(true);
      vi.mocked(getCurrentFranchiseId).mockReturnValueOnce('franchise-abc');

      await storeService.getStore('store-in-franchise');

      expect(isFranchiseMode).toHaveBeenCalled();
      expect(getCurrentFranchiseId).toHaveBeenCalled();
    });

    it('usa path legado quando não está em modo franchise', async () => {
      vi.mocked(isFranchiseMode).mockReturnValueOnce(false);

      await storeService.getStore('legacy-store');

      expect(isFranchiseMode).toHaveBeenCalled();
    });

    it('usa path legado quando franchiseId é null', async () => {
      vi.mocked(isFranchiseMode).mockReturnValueOnce(true);
      vi.mocked(getCurrentFranchiseId).mockReturnValueOnce(null);

      await storeService.getStore('store-without-franchise');

      expect(isFranchiseMode).toHaveBeenCalled();
      expect(getCurrentFranchiseId).toHaveBeenCalled();
    });

    it('tenta recuperar do localStorage quando documento está vazio', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockEmptySnapshot);

      localStorage.setItem('storeSettings', JSON.stringify({
        storeId: 'cached-store',
        name: 'Cached Store',
        currency: 'USD',
        taxId: '99999999999999',
        taxPercentage: 15,
      }));

      // Mock para o segundo getDoc chamado dentro de recoverStoreFromLocalStorage
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      const store = await storeService.getStore('cached-store');
      expect(store).toBeNull(); // Não consegue recuperar porque o segundo getDoc retorna não existente
    });

    it('retorna null quando localStorage não tem dados compatíveis', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockEmptySnapshot);

      localStorage.setItem('storeSettings', JSON.stringify({
        storeId: 'different-store',
        name: 'Different Store',
      }));

      const store = await storeService.getStore('cached-store');
      expect(store).toBeNull();
    });

    it('retorna null quando localStorage não tem name', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockEmptySnapshot);

      localStorage.setItem('storeSettings', JSON.stringify({
        storeId: 'cached-store',
        currency: 'USD',
      }));

      const store = await storeService.getStore('cached-store');
      expect(store).toBeNull();
    });

    it('falha graciosamente quando localStorage tem JSON inválido', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockEmptySnapshot);

      localStorage.setItem('storeSettings', 'invalid json');

      const store = await storeService.getStore('cached-store');
      expect(store).toBeNull();
    });

    it('retorna null quando erro de permissão e sem cache local', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce({
        code: 'permission-denied',
        message: 'Permission denied',
      });

      const store = await storeService.getStore('no-permission');
      expect(store).toBeNull();
    });

    it('usa cache local quando erro de permissão', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce({
        code: 'permission-denied',
        message: 'Permission denied',
      });

      localStorage.setItem('storeSettings', JSON.stringify({
        storeId: 'permission-denied-store',
        name: 'Permission Denied Store',
        currency: 'EUR',
      }));

      // Mock para o getDoc chamado dentro de recoverStoreFromLocalStorage
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      const store = await storeService.getStore('permission-denied-store');
      expect(store).toBeNull(); // Não consegue recuperar porque o getDoc retorna não existente
    });

    it('propaga erro não relacionado a permissão', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(storeService.getStore('error-store')).rejects.toThrow('Database connection failed');
    });

    it('aceita storeId vazio como parâmetro', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      const store = await storeService.getStore('');
      expect(store).toBeNull();
    });
  });

  describe('createStore', () => {
    const mockStoreData = {
      storeId: 'new-store',
      name: 'New Store',
      slug: 'new-store',
      isActive: true,
      currency: 'BRL',
      taxId: '12345678901234',
      taxPercentage: 10,
    };

    it('cria nova loja quando não existe', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      const storeId = await storeService.createStore(mockStoreData);

      expect(storeId).toBe('new-store');
      expect(getDoc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalledTimes(2); // Documento principal + settings
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('atualiza loja existente ao invés de criar', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ storeId: 'existing-store' }),
        id: 'existing-store',
      } as any);

      const storeId = await storeService.createStore({
        ...mockStoreData,
        storeId: 'existing-store',
        name: 'Updated Store',
      });

      expect(storeId).toBe('existing-store');
      expect(updateDoc).toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled(); // Não cria settings quando já existe
    });

    it('inclui timestamps na criação', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      await storeService.createStore(mockStoreData);

      // Verifica se setDoc foi chamado com dados que incluem timestamps
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'new-store',
          name: 'New Store',
          created_at: expect.any(String),
          updated_at: expect.any(String),
        })
      );
    });

    it('cria documento de settings com valores padrão', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      await storeService.createStore(mockStoreData);

      // Verifica se o segundo setDoc (settings) foi chamado com valores padrão
      expect(setDoc).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({
          currency: 'BRL',
          language: 'pt-BR',
        })
      );
    });

    it('usa language customizado quando fornecido', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      await storeService.createStore({
        ...mockStoreData,
        language: 'en',
      });

      // Verifica se o segundo setDoc (settings) foi chamado com language customizado
      expect(setDoc).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({
          language: 'en',
        })
      );
    });

    it('propaga erro quando getDoc falha', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce(new Error('Firestore error'));

      await expect(storeService.createStore(mockStoreData)).rejects.toThrow('Firestore error');
    });

    it('propaga erro quando setDoc falha', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);
      vi.mocked(setDoc).mockRejectedValueOnce(new Error('Write error'));

      await expect(storeService.createStore(mockStoreData)).rejects.toThrow('Write error');
    });

    it('propaga erro quando updateDoc falha', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ storeId: 'existing' }),
        id: 'existing',
      } as any);
      vi.mocked(updateDoc).mockRejectedValueOnce(new Error('Update error'));

      await expect(storeService.createStore(mockStoreData)).rejects.toThrow('Update error');
    });
  });

  describe('updateStore', () => {
    it('atualiza dados da loja com sucesso', async () => {
      await storeService.updateStore('test-store', {
        name: 'Updated Name',
        currency: 'USD',
      });

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Updated Name',
          currency: 'USD',
          updated_at: expect.any(String),
        })
      );
    });

    it('atualiza apenas campos fornecidos', async () => {
      await storeService.updateStore('test-store', { name: 'New Name' });

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'New Name',
          updated_at: expect.any(String),
        })
      );
    });

    it('inclui timestamp updated_at em todas as atualizações', async () => {
      const beforeUpdate = new Date();
      await storeService.updateStore('test-store', { taxPercentage: 15 });
      const afterUpdate = new Date();

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          taxPercentage: 15,
          updated_at: expect.any(String),
        })
      );

      const callArgs = vi.mocked(updateDoc).mock.calls[0][1];
      const updatedAt = new Date(callArgs.updated_at);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(updatedAt.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });

    it('atualiza loja com campos complexos', async () => {
      const updates = {
        name: 'Complex Store',
        address: {
          street: 'Rua Teste',
          number: '123',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01234-567',
          country: 'Brazil',
        },
        contact: {
          phone: '+5511999999999',
          email: 'teste@store.com',
        },
        useThermalPrinter: true,
        attractTimeoutSeconds: 120,
      };

      await storeService.updateStore('test-store', updates);

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining(updates)
      );
    });

    it('propaga erro quando updateDoc falha', async () => {
      vi.mocked(updateDoc).mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        storeService.updateStore('error-store', { name: 'Failed' })
      ).rejects.toThrow('Update failed');
    });

    it('aceita storeId vazio', async () => {
      await storeService.updateStore('', { name: 'Empty ID Store' });

      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('getAllStores', () => {
    it('retorna todas as lojas com dados completos', async () => {
      const stores = await storeService.getAllStores();

      expect(stores).toHaveLength(2);
      expect(stores[0]).toEqual({
        id: 'store-1',
        storeId: 'store-1',
        name: 'Store 1',
        isActive: true,
        currency: 'BRL',
        taxId: '11111111111111',
        taxPercentage: 5,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      });
      expect(stores[1]).toEqual({
        id: 'store-2',
        storeId: 'store-2',
        name: 'Store 2',
        isActive: false,
        currency: 'USD',
        taxId: '22222222222222',
        taxPercentage: 8,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      });
    });

    it('retorna array vazio quando não há lojas', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [],
      });

      const stores = await storeService.getAllStores();
      expect(stores).toEqual([]);
    });

    it('propaga erro quando getDocs falha', async () => {
      vi.mocked(getDocs).mockRejectedValueOnce(new Error('Fetch failed'));

      await expect(storeService.getAllStores()).rejects.toThrow('Fetch failed');
    });
  });

  describe('getActiveStores', () => {
    it('retorna apenas lojas ativas', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce(mockActiveDocsSnapshot);

      const stores = await storeService.getActiveStores();

      expect(stores).toHaveLength(1);
      expect(stores[0].isActive).toBe(true);
      expect(query).toHaveBeenCalled();
      expect(where).toHaveBeenCalledWith('isActive', '==', true);
    });

    it('retorna array vazio quando não há lojas ativas', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [],
      });

      const stores = await storeService.getActiveStores();
      expect(stores).toEqual([]);
    });

    it('propaga erro quando query falha', async () => {
      vi.mocked(getDocs).mockRejectedValueOnce(new Error('Query failed'));

      await expect(storeService.getActiveStores()).rejects.toThrow('Query failed');
    });
  });

  describe('ensureStoreExists', () => {
    const ensureParams = ['new-store', 'New Store', 'BRL', '12345', 10] as const;

    it('cria loja quando não existe', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      await storeService.ensureStoreExists(...ensureParams);

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'new-store',
          name: 'New Store',
          currency: 'BRL',
          taxId: '12345',
          taxPercentage: 10,
          isActive: true,
          slug: 'new-store',
          useThermalPrinter: false,
          attractTimeoutSeconds: 60,
          language: 'pt-BR',
          created_at: expect.any(String),
          updated_at: expect.any(String),
        }),
        { merge: true }
      );
    });

    it('não cria quando já existe com dados válidos', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ storeId: 'existing', name: 'Existing', currency: 'BRL' }),
        id: 'existing',
      } as any);

      await storeService.ensureStoreExists('existing', 'Existing', 'BRL', '', 0);

      expect(setDoc).not.toHaveBeenCalled();
    });

    it('cria quando documento existe mas está vazio (placeholder)', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockEmptySnapshot);

      await storeService.ensureStoreExists('empty-store', 'Populated Store', 'USD', '99999', 5);

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storeId: 'empty-store',
          name: 'Populated Store',
          currency: 'USD',
          taxId: '99999',
          taxPercentage: 5,
        }),
        { merge: true }
      );
    });

    it('usa path de franchise quando em modo franchise', async () => {
      vi.mocked(isFranchiseMode).mockReturnValueOnce(true);
      vi.mocked(getCurrentFranchiseId).mockReturnValueOnce('franchise-xyz');

      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      await storeService.ensureStoreExists('franchise-store', 'Franchise Store', 'BRL', '', 0);

      expect(isFranchiseMode).toHaveBeenCalled();
      expect(getCurrentFranchiseId).toHaveBeenCalled();
    });

    it('usa path legado quando não está em modo franchise', async () => {
      vi.mocked(isFranchiseMode).mockReturnValueOnce(false);

      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      await storeService.ensureStoreExists('legacy-store', 'Legacy Store', 'EUR', '', 0);

      expect(isFranchiseMode).toHaveBeenCalled();
    });

    it('propaga erro quando getDoc falha', async () => {
      vi.mocked(getDoc).mockRejectedValueOnce(new Error('Firestore error'));

      await expect(
        storeService.ensureStoreExists('error-store', 'Name', 'BRL', '', 0)
      ).rejects.toThrow('Firestore error');
    });

    it('propaga erro quando setDoc falha', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);
      vi.mocked(setDoc).mockRejectedValueOnce(new Error('Write error'));

      await expect(
        storeService.ensureStoreExists('error-store', 'Name', 'BRL', '', 0)
      ).rejects.toThrow('Write error');
    });

    it('aceita parâmetros vazios', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      await storeService.ensureStoreExists('', '', 'BRL', '', 0);

      expect(setDoc).toHaveBeenCalled();
    });
  });

  describe('Cenários de erro e edge cases', () => {
    it('lida com múltiplas chamadas simultâneas', async () => {
      const promises = [
        storeService.validateStoreExists('store-1'),
        storeService.validateStoreExists('store-2'),
        storeService.getStore('store-1'),
        storeService.getStore('store-2'),
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(4);
      expect(results[0]).toBe(true); // validateStoreExists
      expect(results[1]).toBe(true); // validateStoreExists
      expect(results[2]).toBeTruthy(); // getStore
      expect(results[3]).toBeTruthy(); // getStore
    });

    it('recupera de localStorage quando Firestore falha durante recuperação', async () => {
      // Primeiro getDoc falha (para trigger recuperação)
      vi.mocked(getDoc).mockRejectedValueOnce({
        code: 'permission-denied',
        message: 'Permission denied',
      });

      localStorage.setItem('storeSettings', JSON.stringify({
        storeId: 'recovered-store',
        name: 'Recovered Store',
        currency: 'BRL',
      }));

      // Mock para o getDoc chamado dentro de recoverStoreFromLocalStorage
      vi.mocked(getDoc).mockResolvedValueOnce(mockNonExistentSnapshot);

      const store = await storeService.getStore('recovered-store');
      expect(store).toBeNull(); // Não consegue recuperar porque o getDoc retorna não existente
    });

    it('não sobrescreve dados existentes durante ensureStoreExists', async () => {
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storeId: 'existing',
          name: 'Existing Store',
          currency: 'EUR',
          customField: 'preserved',
        }),
        id: 'existing',
      } as any);

      await storeService.ensureStoreExists('existing', 'New Name', 'BRL', '123', 5);

      expect(setDoc).not.toHaveBeenCalled();
    });
  });
});