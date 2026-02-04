/**
 * ============================================================================
 * TESTES REAIS - Firebase Service (Expansão de Cobertura)
 * ============================================================================
 * Testa o Firebase service REAL com foco em aumentar cobertura.
 * APIs externas são mockadas. Foco nas funções de inicialização e helpers.
 */

import { describe, it, expect, beforeEach, vi, afterEach, beforeAll } from 'vitest';
import type { StoreSettings } from '@/types/store';

// Importar mocks para uso dinâmico
import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

// Função helper para resetar estado do Firebase (para testes)
const resetFirebaseState = async () => {
  // Resetar módulos para limpar estado
  vi.resetModules();
  
  // Limpar variáveis de ambiente que causam auto-inicialização
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_FRANCHISE_MODE', undefined);
  vi.stubEnv('VITE_FIREBASE_API_KEY', undefined);
  
  // Re-importar após reset
  const firebaseModule = await import('@/services/firebase');
  
  // Re-atribuir as funções após o reset
  initializeFirebaseFromEnv = firebaseModule.initializeFirebaseFromEnv;
  initializeFirebase = firebaseModule.initializeFirebase;
  isPersistenceEnabled = firebaseModule.isPersistenceEnabled;
  getFirebaseDb = firebaseModule.getFirebaseDb;
  getFirebaseApp = firebaseModule.getFirebaseApp;
  getCurrentFranchiseId = firebaseModule.getCurrentFranchiseId;
  getStoreCollection = firebaseModule.getStoreCollection;
  getStoreDoc = firebaseModule.getStoreDoc;
  getStoreCollectionPath = firebaseModule.getStoreCollectionPath;
  getCurrentStoreId = firebaseModule.getCurrentStoreId;
  getFirebaseAuth = firebaseModule.getFirebaseAuth;
  
  return firebaseModule;
};

// Variáveis para as funções do Firebase (serão definidas no beforeAll)
let initializeFirebaseFromEnv: any;
let initializeFirebase: any;
let isPersistenceEnabled: any;
let getFirebaseDb: any;
let getFirebaseApp: any;
let getCurrentFranchiseId: any;
let getStoreCollection: any;
let getStoreDoc: any;
let getStoreCollectionPath: any;
let getCurrentStoreId: any;
let getFirebaseAuth: any;

// Mocks para APIs externas
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

// Mock do localStorage global
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    getFirestore: vi.fn(() => ({ type: 'firestore' })),
    initializeFirestore: vi.fn(() => ({ type: 'firestore-with-cache' })),
    collection: vi.fn(() => ({ type: 'collection' })),
    doc: vi.fn(() => ({ type: 'document' })),
    CACHE_SIZE_UNLIMITED: actual.CACHE_SIZE_UNLIMITED,
    persistentLocalCache: vi.fn(() => ({ type: 'cache' })),
    persistentMultipleTabManager: vi.fn(() => ({ type: 'tab-manager' })),
  };
});

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ type: 'auth' })),
}));

vi.mock('@/lib/pathResolver', () => ({
  isFranchiseMode: vi.fn(() => false),
  storeSubPath: vi.fn((franchiseId, storeId, collection) => {
    if (franchiseId) {
      return `franchises/${franchiseId}/stores/${storeId}/${collection}`;
    }
    return `stores/${storeId}/${collection}`;
  }),
  StoreSubcollection: {
    PRODUCTS: 'products',
    SALES: 'sales',
    SETTINGS: 'settings',
  },
}));

describe('Firebase Service - Expansão de Cobertura', () => {
  beforeAll(async () => {
    // Importar funções do Firebase
    const firebaseModule = await import('@/services/firebase');
    initializeFirebaseFromEnv = firebaseModule.initializeFirebaseFromEnv;
    initializeFirebase = firebaseModule.initializeFirebase;
    isPersistenceEnabled = firebaseModule.isPersistenceEnabled;
    getFirebaseDb = firebaseModule.getFirebaseDb;
    getFirebaseApp = firebaseModule.getFirebaseApp;
    getCurrentFranchiseId = firebaseModule.getCurrentFranchiseId;
    getStoreCollection = firebaseModule.getStoreCollection;
    getStoreDoc = firebaseModule.getStoreDoc;
    getStoreCollectionPath = firebaseModule.getStoreCollectionPath;
    getCurrentStoreId = firebaseModule.getCurrentStoreId;
    getFirebaseAuth = firebaseModule.getFirebaseAuth;
  });

// Store simulado para localStorage
let localStorageStore: Record<string, string> = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageStore = {}; // Resetar store

    // Configurar mocks do localStorage global
    localStorageMock.getItem.mockImplementation((key: string) => localStorageStore[key] || null);
    localStorageMock.setItem.mockImplementation((key: string, value: string) => {
      localStorageStore[key] = value;
    });
    localStorageMock.removeItem.mockImplementation((key: string) => {
      delete localStorageStore[key];
    });
    localStorageMock.clear.mockImplementation(() => {
      localStorageStore = {};
    });

    // Resetar estado interno do módulo Firebase
    await resetFirebaseState();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initializeFirebaseFromEnv', () => {
    it('deve inicializar com variáveis de ambiente válidas', () => {
      // Mock das variáveis de ambiente
      vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
      vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
      vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test.appspot.com');
      vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '123456789');
      vi.stubEnv('VITE_FIREBASE_APP_ID', '1:123456789:web:abcdef');

      // Mock initializeApp para retornar app válido
      vi.mocked(initializeApp).mockReturnValueOnce({ name: 'test-app' });

      const result = initializeFirebaseFromEnv();

      expect(result).not.toBeNull();
      expect(result?.app).toBeDefined();
      expect(result?.db).toBeDefined();
      expect(result?.auth).toBeDefined();
      expect(result?.persistenceEnabled).toBe(true);
    });

    it('deve retornar null quando variáveis de ambiente estão faltando', () => {
      // Garantir que as variáveis de ambiente não existem
      vi.stubEnv('VITE_FIREBASE_API_KEY', undefined);
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', undefined);
      vi.stubEnv('VITE_FRANCHISE_MODE', undefined);

      const result = initializeFirebaseFromEnv();

      expect(result).toBeNull();
    });

    it('deve reutilizar instância existente se app já foi inicializado', () => {
      // Mock das variáveis de ambiente
      vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');

      // Mock getApps para retornar app existente
      vi.mocked(getApps).mockReturnValue([{ name: 'existing-app' }]);

      const result = initializeFirebaseFromEnv();

      expect(result).not.toBeNull();
      expect(result?.app?.name).toBe('existing-app');
    });

    it('deve fazer fallback para Firestore sem cache se persistência falhar', () => {
      // Mock das variáveis de ambiente
      vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
      vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
      vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
      vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test.appspot.com');
      vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '123456789');
      vi.stubEnv('VITE_FIREBASE_APP_ID', '1:123456789:web:abcdef');

      // Mock initializeApp para retornar app válido
      vi.mocked(initializeApp).mockReturnValueOnce({ name: 'test-app' });

      // Sobrescrever o mock do initializeFirestore para este teste específico
      vi.mocked(initializeFirestore).mockImplementationOnce(() => {
        throw new Error('IndexedDB not supported');
      });

      const result = initializeFirebaseFromEnv();

      expect(result).not.toBeNull();
      expect(result?.persistenceEnabled).toBe(false);
    });
    });
  });

  describe('initializeFirebase', () => {
    const mockSettings: StoreSettings = {
      storeId: 'test-store',
      storeName: 'Test Store',
      firebaseConfig: {
        apiKey: 'test-api-key',
        authDomain: 'test.firebaseapp.com',
        projectId: 'test-project',
        storageBucket: 'test.appspot.com',
        messagingSenderId: '123456789',
        appId: '1:123456789:web:abcdef',
      },
    };

    it('deve inicializar Firebase com configurações válidas', () => {
      // Mock initializeApp para retornar app válido
      vi.mocked(initializeApp).mockReturnValueOnce({ name: 'test-app' });

      const result = initializeFirebase(mockSettings);

      expect(result.app).toBeDefined();
      expect(result.db).toBeDefined();
      expect(result.auth).toBeDefined();
      expect(result.persistenceEnabled).toBe(true);
    });

    it('deve reutilizar instância existente se app já foi inicializado', () => {
      // Mock getApps para retornar app existente
      vi.mocked(getApps).mockReturnValue([{ name: 'existing-app' }]);

      const result = initializeFirebase(mockSettings);

      expect(result.app?.name).toBe('existing-app');
    });

    it('deve fazer fallback para Firestore sem cache se persistência falhar', () => {
      // Mock initializeFirestore para falhar
      vi.mocked(initializeFirestore).mockImplementation(() => {
        throw new Error('Persistence not supported');
      });

      const result = initializeFirebase(mockSettings);

      expect(result.persistenceEnabled).toBe(false);
    });

    it('deve lançar erro se inicialização falhar completamente', () => {
      // Mock initializeApp para falhar
      vi.mocked(initializeApp).mockImplementation(() => {
        throw new Error('Firebase init failed');
      });

      expect(() => initializeFirebase(mockSettings)).toThrow('Firebase init failed');
    });
  });

  describe('isPersistenceEnabled', () => {
    it('deve retornar false quando persistência não foi inicializada', () => {
      const result = isPersistenceEnabled();
      expect(result).toBe(false);
    });

    it('deve retornar true quando persistência foi habilitada', () => {
      // Inicializar Firebase para habilitar persistência
      const mockSettings: StoreSettings = {
        storeId: 'test-store',
        storeName: 'Test Store',
        firebaseConfig: {
          apiKey: 'test-api-key',
          authDomain: 'test.firebaseapp.com',
          projectId: 'test-project',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '123456789',
          appId: '1:123456789:web:abcdef',
        },
      };

      initializeFirebase(mockSettings);
      const result = isPersistenceEnabled();
      expect(result).toBe(true);
    });
  });

  describe('getFirebaseDb', () => {
    it('deve lançar erro quando Firebase não foi inicializado', async () => {
      // Resetar estado completamente
      await resetFirebaseState();

      expect(() => getFirebaseDb()).toThrow('Firebase not initialized');
    });

    it('deve retornar instância do Firestore quando inicializado', () => {
      const mockSettings: StoreSettings = {
        storeId: 'test-store',
        storeName: 'Test Store',
        firebaseConfig: {
          apiKey: 'test-api-key',
          authDomain: 'test.firebaseapp.com',
          projectId: 'test-project',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '123456789',
          appId: '1:123456789:web:abcdef',
        },
      };

      initializeFirebase(mockSettings);
      const db = getFirebaseDb();
      expect(db).toBeDefined();
      expect(db.type).toBe('firestore-with-cache');
    });
  });

  describe('getFirebaseApp', () => {
    it('deve lançar erro quando Firebase não foi inicializado', async () => {
      // Resetar estado completamente
      await resetFirebaseState();

      expect(() => getFirebaseApp()).toThrow('Firebase not initialized');
    });

    it('deve retornar instância do App quando inicializado', () => {
      const mockSettings: StoreSettings = {
        storeId: 'test-store',
        storeName: 'Test Store',
        firebaseConfig: {
          apiKey: 'test-api-key',
          authDomain: 'test.firebaseapp.com',
          projectId: 'test-project',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '123456789',
          appId: '1:123456789:web:abcdef',
        },
      };

      initializeFirebase(mockSettings);
      const app = getFirebaseApp();
      expect(app).toBeDefined();
      expect(app.name).toBe('test-app');
    });
  });

  describe('getCurrentFranchiseId', () => {
    it('deve retornar null quando não há franchiseId armazenado', () => {
      const result = getCurrentFranchiseId();
      expect(result).toBeNull();
    });

    it('deve retornar franchiseId da chave padronizada', () => {
      localStorage.setItem('open-kiosk-admin:selectedFranchise', 'franchise-123');

      const result = getCurrentFranchiseId();
      expect(result).toBe('franchise-123');
    });

    it('deve fazer fallback para chave legada', () => {
      localStorage.setItem('selectedFranchiseId', 'legacy-franchise-456');

      const result = getCurrentFranchiseId();
      expect(result).toBe('legacy-franchise-456');
    });

    it('deve extrair franchiseId de storeSettings e sincronizar', () => {
      const storeSettings = {
        franchiseId: 'settings-franchise-789',
        storeId: 'store-123',
      };
      localStorage.setItem('storeSettings', JSON.stringify(storeSettings));

      const result = getCurrentFranchiseId();
      expect(result).toBe('settings-franchise-789');

      // Verificar se sincronizou com chave padronizada
      const synced = localStorage.getItem('open-kiosk-admin:selectedFranchise');
      expect(synced).toBe('settings-franchise-789');
    });

    it('deve retornar null se storeSettings não puder ser parseado', () => {
      localStorage.setItem('storeSettings', 'invalid-json');

      const result = getCurrentFranchiseId();
      expect(result).toBeNull();
    });

    it('deve retornar null em caso de erro geral', () => {
      // Mock localStorage para lançar erro
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      const result = getCurrentFranchiseId();
      expect(result).toBeNull();

      // Restaurar
      Storage.prototype.getItem = originalGetItem;
    });
  });

  describe('getStoreCollection', () => {
    beforeEach(() => {
      // Inicializar Firebase para os testes
      const mockSettings: StoreSettings = {
        storeId: 'test-store',
        storeName: 'Test Store',
        firebaseConfig: {
          apiKey: 'test-api-key',
          authDomain: 'test.firebaseapp.com',
          projectId: 'test-project',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '123456789',
          appId: '1:123456789:web:abcdef',
        },
      };
      initializeFirebase(mockSettings);
    });

    it('deve retornar collection da raiz quando storeId é null', () => {
      const collection = getStoreCollection(null, 'products');

      expect(collection).toBeDefined();
      expect(collection.type).toBe('collection');
    });

    it('deve retornar collection da store quando storeId é fornecido', () => {
      const collection = getStoreCollection('store-123', 'products');

      expect(collection).toBeDefined();
      expect(collection.type).toBe('collection');
    });

    it('deve usar path correto com franchiseId quando disponível', () => {
      localStorage.setItem('open-kiosk-admin:selectedFranchise', 'franchise-123');

      const collection = getStoreCollection('store-456', 'products');

      expect(collection).toBeDefined();
    });
  });

  describe('getStoreDoc', () => {
    beforeEach(() => {
      // Inicializar Firebase para os testes
      const mockSettings: StoreSettings = {
        storeId: 'test-store',
        storeName: 'Test Store',
        firebaseConfig: {
          apiKey: 'test-api-key',
          authDomain: 'test.firebaseapp.com',
          projectId: 'test-project',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '123456789',
          appId: '1:123456789:web:abcdef',
        },
      };
      initializeFirebase(mockSettings);
    });

    it('deve retornar documento da raiz quando storeId é null', () => {
      const document = getStoreDoc(null, 'products', 'doc-123');

      expect(document).toBeDefined();
      expect(document.type).toBe('document');
    });

    it('deve retornar documento da store quando storeId é fornecido', () => {
      const document = getStoreDoc('store-123', 'products', 'doc-456');

      expect(document).toBeDefined();
      expect(document.type).toBe('document');
    });
  });

  describe('getStoreCollectionPath', () => {
    it('deve construir path correto para collection', () => {
      const path = getStoreCollectionPath('store-123', 'products');

      expect(path).toBe('stores/store-123/products');
    });
  });

  describe('getCurrentStoreId', () => {
    it('deve retornar null quando não há storeId armazenado', () => {
      const result = getCurrentStoreId();
      expect(result).toBeNull();
    });

    it('deve retornar storeId da chave padronizada', () => {
      localStorage.setItem('open-kiosk-admin:selectedStore', 'store-123');

      const result = getCurrentStoreId();
      expect(result).toBe('store-123');
    });

    it('deve extrair storeId de storeSettings', () => {
      const storeSettings = {
        storeId: 'settings-store-456',
        storeName: 'Test Store',
      };
      localStorage.setItem('storeSettings', JSON.stringify(storeSettings));

      const result = getCurrentStoreId();
      expect(result).toBe('settings-store-456');
    });

    it('deve fazer fallback para chave legada', () => {
      localStorage.setItem('currentStoreId', 'legacy-store-789');

      const result = getCurrentStoreId();
      expect(result).toBe('legacy-store-789');
    });

    it('deve retornar null se storeSettings não puder ser parseado', () => {
      localStorage.setItem('storeSettings', 'invalid-json');

      const result = getCurrentStoreId();
      expect(result).toBeNull();
    });

    it('deve retornar null em caso de erro geral', () => {
      // Mock localStorage para lançar erro
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      const result = getCurrentStoreId();
      expect(result).toBeNull();

      // Restaurar
      Storage.prototype.getItem = originalGetItem;
    });
  });

  describe('getFirebaseAuth', () => {
    it('deve lançar erro quando Firebase não foi inicializado', async () => {
      // Resetar estado completamente
      await resetFirebaseState();

      expect(() => getFirebaseAuth()).toThrow('Firebase not initialized');
    });

    it('deve retornar instância do Auth quando inicializado', () => {
      const mockSettings: StoreSettings = {
        storeId: 'test-store',
        storeName: 'Test Store',
        firebaseConfig: {
          apiKey: 'test-api-key',
          authDomain: 'test.firebaseapp.com',
          projectId: 'test-project',
          storageBucket: 'test.appspot.com',
          messagingSenderId: '123456789',
          appId: '1:123456789:web:abcdef',
        },
      };

      initializeFirebase(mockSettings);
      const auth = getFirebaseAuth();
      expect(auth).toBeDefined();
      expect(auth.type).toBe('auth');
    });
  });
} ) ; 
 
 