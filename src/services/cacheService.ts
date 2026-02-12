/**
 * ============================================
 * Cache Service - IndexedDB Wrapper
 * ============================================
 * 
 * Hot cache com IndexedDB para persistência offline-first.
 * Funciona em conjunto com localStorage como fallback.
 * 
 * Stores:
 * - settings: Configurações da loja
 * - products: Cache de produtos
 * - videos: Metadados de vídeos em cache
 * - syncQueue: Fila de operações pendentes
 * 
 * Compatibilidade:
 * - Safari Private Browsing: IndexedDB disponível mas quota = 0
 * - Firefox Private: IndexedDB pode falhar silenciosamente
 * - Fallback para localStorage quando necessário
 */

const DB_NAME = 'kiosk_cache';
const DB_VERSION = 3;

// Flag para indicar se IndexedDB está realmente funcional
let indexedDBAvailable: boolean | null = null;
let indexedDBTestedAt: number = 0;
const INDEXEDDB_TEST_INTERVAL_MS = 60 * 1000; // Re-testar a cada 1 minuto

// Store names
export const STORES = {
  SETTINGS: 'settings',
  PRODUCTS: 'products',
  VIDEOS: 'videos',
  SYNC_QUEUE: 'syncQueue',
  SYNC_DLQ: 'syncDLQ',  // KIO-11: Dead Letter Queue for failed sync items
  TAPS: 'taps',  // Configuração de torneiras
  FAILED_DISPENSES: 'failedDispenses',  // Recuperação de dispenses falhados
} as const;

type StoreName = typeof STORES[keyof typeof STORES];

// Tipos para as stores
export interface CachedProduct {
  id: string;
  data: unknown;
  updatedAt: number;
  storeId: string;
}

export interface CachedVideo {
  id: string;
  url: string;
  blob?: Blob;
  version: string;
  cachedAt: number;
  size: number;
  storeId: string;
}

export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  collection: string;
  docId: string;
  data?: unknown;
  createdAt: number;
  retryCount: number;
  storeId: string;
  franchiseId?: string;
}

export interface CachedSettings {
  id: string;
  data: unknown;
  updatedAt: number;
}

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Inicializa o IndexedDB
 */
const initDB = (): Promise<IDBDatabase> => {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[CacheService] Error opening IndexedDB:', request.error);
      dbInitPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[CacheService] IndexedDB initialized successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      console.log('[CacheService] Upgrading IndexedDB schema...');

      // Settings store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
      }

      // Products store com índice por storeId
      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        const productsStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
        productsStore.createIndex('storeId', 'storeId', { unique: false });
        productsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Videos store com índice por storeId
      if (!db.objectStoreNames.contains(STORES.VIDEOS)) {
        const videosStore = db.createObjectStore(STORES.VIDEOS, { keyPath: 'id' });
        videosStore.createIndex('storeId', 'storeId', { unique: false });
        videosStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }

      // Sync queue store
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
        syncStore.createIndex('collection', 'collection', { unique: false });
      }

      // Failed dispenses store (reconciliação de pagou-mas-não-dispensou)
      if (!db.objectStoreNames.contains(STORES.FAILED_DISPENSES)) {
        const failedStore = db.createObjectStore(STORES.FAILED_DISPENSES, { keyPath: 'id' });
        failedStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Taps configuration store
      if (!db.objectStoreNames.contains(STORES.TAPS)) {
        const tapsStore = db.createObjectStore(STORES.TAPS, { keyPath: 'id' });
        tapsStore.createIndex('storeId', 'storeId', { unique: false });
      }
    };
  });

  return dbInitPromise;
};

/**
 * Executa uma transação no IndexedDB
 */
const withTransaction = async <T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    
    const request = callback(store);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Executa uma transação que retorna múltiplos resultados
 */
const withTransactionAll = async <T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T[]>
): Promise<T[]> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    
    const request = callback(store);
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

// ============================================
// API Pública
// ============================================

/**
 * Salva um item no cache
 */
export const cacheSet = async <T extends { id: string }>(
  storeName: StoreName,
  item: T
): Promise<void> => {
  try {
    await withTransaction(storeName, 'readwrite', (store) => store.put(item));
  } catch (error) {
    console.error(`[CacheService] Error setting item in ${storeName}:`, error);
    throw error;
  }
};

/**
 * Obtém um item do cache
 */
export const cacheGet = async <T>(
  storeName: StoreName,
  id: string
): Promise<T | undefined> => {
  try {
    return await withTransaction<T | undefined>(storeName, 'readonly', (store) => store.get(id));
  } catch (error) {
    console.error(`[CacheService] Error getting item from ${storeName}:`, error);
    return undefined;
  }
};

/**
 * Obtém todos os itens de uma store
 */
export const cacheGetAll = async <T>(storeName: StoreName): Promise<T[]> => {
  try {
    return await withTransactionAll<T>(storeName, 'readonly', (store) => store.getAll());
  } catch (error) {
    console.error(`[CacheService] Error getting all items from ${storeName}:`, error);
    return [];
  }
};

/**
 * Obtém itens por índice
 */
export const cacheGetByIndex = async <T>(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey | IDBKeyRange
): Promise<T[]> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`[CacheService] Error getting items by index from ${storeName}:`, error);
    return [];
  }
};

/**
 * Remove um item do cache
 */
export const cacheDelete = async (storeName: StoreName, id: string): Promise<void> => {
  try {
    await withTransaction(storeName, 'readwrite', (store) => store.delete(id));
  } catch (error) {
    console.error(`[CacheService] Error deleting item from ${storeName}:`, error);
    throw error;
  }
};

/**
 * Limpa toda uma store
 */
export const cacheClear = async (storeName: StoreName): Promise<void> => {
  try {
    await withTransaction(storeName, 'readwrite', (store) => store.clear());
    console.log(`[CacheService] Cleared store: ${storeName}`);
  } catch (error) {
    console.error(`[CacheService] Error clearing store ${storeName}:`, error);
    throw error;
  }
};

/**
 * Salva múltiplos itens em batch
 */
export const cacheBatchSet = async <T extends { id: string }>(
  storeName: StoreName,
  items: T[]
): Promise<void> => {
  if (items.length === 0) return;

  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Usar transaction.oncomplete para garantir que TODAS as operações foram persistidas
      // Isso evita race condition onde request.onsuccess dispara mas transaction pode abortar
      transaction.oncomplete = () => {
        resolve();
      };
      
      transaction.onerror = () => {
        reject(transaction.error);
      };
      
      transaction.onabort = () => {
        reject(new Error('Transaction aborted'));
      };

      // Apenas enfileira as operações - não usa handlers individuais
      items.forEach((item) => {
        store.put(item);
      });
    });
  } catch (error) {
    console.error(`[CacheService] Error batch setting items in ${storeName}:`, error);
    throw error;
  }
};

/**
 * Obtém estatísticas de armazenamento
 */
export const getCacheStats = async (): Promise<{
  productsCount: number;
  videosCount: number;
  syncQueueCount: number;
  estimatedSize: number;
}> => {
  try {
    const [products, videos, syncQueue] = await Promise.all([
      cacheGetAll(STORES.PRODUCTS),
      cacheGetAll<CachedVideo>(STORES.VIDEOS),
      cacheGetAll(STORES.SYNC_QUEUE),
    ]);

    // Estimar tamanho dos vídeos em cache
    const estimatedSize = videos.reduce((acc, v) => acc + (v.size || 0), 0);

    return {
      productsCount: products.length,
      videosCount: videos.length,
      syncQueueCount: syncQueue.length,
      estimatedSize,
    };
  } catch (error) {
    console.error('[CacheService] Error getting cache stats:', error);
    return {
      productsCount: 0,
      videosCount: 0,
      syncQueueCount: 0,
      estimatedSize: 0,
    };
  }
};

/**
 * Verifica se IndexedDB está disponível E funcional
 * Safari Private Browsing: IndexedDB existe mas quota = 0
 */
export const isIndexedDBAvailable = (): boolean => {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
};

/**
 * Testa se IndexedDB está realmente funcional (não apenas disponível)
 * Importante para Safari Private Browsing onde IndexedDB existe mas não funciona
 */
export const testIndexedDBFunctional = async (): Promise<boolean> => {
  // Usar cache se testado recentemente
  const now = Date.now();
  if (indexedDBAvailable !== null && (now - indexedDBTestedAt) < INDEXEDDB_TEST_INTERVAL_MS) {
    return indexedDBAvailable;
  }

  if (!isIndexedDBAvailable()) {
    indexedDBAvailable = false;
    indexedDBTestedAt = now;
    return false;
  }

  try {
    // Tenta abrir um banco de teste e escrever dados
    const testDBName = 'kiosk_test_db';
    const testData = { id: 'test', timestamp: now };

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(testDBName, 1);
      
      request.onerror = () => {
        reject(request.error);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('test')) {
          db.createObjectStore('test', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        try {
          const transaction = db.transaction('test', 'readwrite');
          const store = transaction.objectStore('test');
          
          const putRequest = store.put(testData);
          
          putRequest.onsuccess = () => {
            db.close();
            // Limpar banco de teste
            indexedDB.deleteDatabase(testDBName);
            resolve();
          };
          
          putRequest.onerror = () => {
            db.close();
            reject(putRequest.error);
          };
        } catch (e) {
          db.close();
          reject(e);
        }
      };
    });

    indexedDBAvailable = true;
    indexedDBTestedAt = now;
    console.log('[CacheService] IndexedDB is functional');
    return true;
  } catch (error) {
    console.warn('[CacheService] IndexedDB test failed (possibly Safari Private Browsing):', error);
    indexedDBAvailable = false;
    indexedDBTestedAt = now;
    return false;
  }
};

/**
 * Fecha a conexão com o banco
 */
export const closeDB = (): void => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbInitPromise = null;
    console.log('[CacheService] IndexedDB connection closed');
  }
};

// Inicializa o DB ao carregar o módulo (lazy)
export const ensureDBReady = async (): Promise<boolean> => {
  try {
    // Primeiro verifica se IndexedDB está realmente funcional
    const isFunctional = await testIndexedDBFunctional();
    if (!isFunctional) {
      console.warn('[CacheService] IndexedDB not functional, will use localStorage fallback');
      return false;
    }
    await initDB();
    return true;
  } catch (error) {
    console.error('[CacheService] Failed to initialize IndexedDB:', error);
    return false;
  }
};

export default {
  set: cacheSet,
  get: cacheGet,
  getAll: cacheGetAll,
  getByIndex: cacheGetByIndex,
  delete: cacheDelete,
  clear: cacheClear,
  batchSet: cacheBatchSet,
  getStats: getCacheStats,
  isAvailable: isIndexedDBAvailable,
  ensureReady: ensureDBReady,
  close: closeDB,
  STORES,
};
