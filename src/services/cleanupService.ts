/**
 * ============================================
 * Cleanup Service
 * ============================================
 * 
 * Serviço para limpeza de dados antigos e otimização de cache.
 * Executa periodicamente em background.
 */

import { 
  cacheGetAll, 
  cacheDelete, 
  STORES, 
  SyncQueueItem,
  CachedProduct,
  CachedVideo,
} from './cacheService';
import { getCurrentStoreId } from './firebase';

// Configurações de cleanup
const CLEANUP_CONFIG = {
  // Idade máxima dos itens na fila de sync (7 dias)
  SYNC_QUEUE_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  
  // Idade máxima de produtos em cache (30 dias)
  PRODUCTS_MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000,
  
  // Idade máxima de vídeos em cache (14 dias)
  VIDEOS_MAX_AGE_MS: 14 * 24 * 60 * 60 * 1000,
  
  // Intervalo de cleanup automático (1 hora)
  AUTO_CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
  
  // Máximo de itens na fila de sync
  MAX_SYNC_QUEUE_SIZE: 100,
};

// Estado do cleanup
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
let isCleanupRunning = false;

export interface CleanupResult {
  syncQueueCleaned: number;
  productsCleaned: number;
  videosCleaned: number;
  localStorageKeys: string[];
  totalFreedBytes: number;
}

/**
 * Limpa itens antigos da fila de sync
 */
const cleanupSyncQueue = async (): Promise<number> => {
  let cleaned = 0;
  const now = Date.now();

  try {
    const queue = await cacheGetAll<SyncQueueItem>(STORES.SYNC_QUEUE);
    
    for (const item of queue) {
      const age = now - item.createdAt;
      
      // Remove se muito antigo ou se atingiu max retries
      if (age > CLEANUP_CONFIG.SYNC_QUEUE_MAX_AGE_MS || item.retryCount >= 10) {
        await cacheDelete(STORES.SYNC_QUEUE, item.id);
        cleaned++;
        console.log(`[Cleanup] Removed old sync item: ${item.id}`);
      }
    }

    // Limita tamanho da fila
    const updatedQueue = await cacheGetAll<SyncQueueItem>(STORES.SYNC_QUEUE);
    if (updatedQueue.length > CLEANUP_CONFIG.MAX_SYNC_QUEUE_SIZE) {
      // Remove os mais antigos
      const sorted = updatedQueue.sort((a, b) => a.createdAt - b.createdAt);
      const toRemove = sorted.slice(0, updatedQueue.length - CLEANUP_CONFIG.MAX_SYNC_QUEUE_SIZE);
      
      for (const item of toRemove) {
        await cacheDelete(STORES.SYNC_QUEUE, item.id);
        cleaned++;
      }
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning sync queue:', error);
  }

  return cleaned;
};

/**
 * Limpa produtos em cache de outras lojas
 */
const cleanupProducts = async (): Promise<number> => {
  let cleaned = 0;
  const currentStoreId = getCurrentStoreId() || '';
  const now = Date.now();

  try {
    const products = await cacheGetAll<CachedProduct>(STORES.PRODUCTS);
    
    for (const product of products) {
      // Remove se é de outra loja ou muito antigo
      if (product.storeId !== currentStoreId) {
        await cacheDelete(STORES.PRODUCTS, product.id);
        cleaned++;
        console.log(`[Cleanup] Removed product from other store: ${product.id}`);
      } else if (now - product.updatedAt > CLEANUP_CONFIG.PRODUCTS_MAX_AGE_MS) {
        await cacheDelete(STORES.PRODUCTS, product.id);
        cleaned++;
        console.log(`[Cleanup] Removed old product: ${product.id}`);
      }
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning products:', error);
  }

  return cleaned;
};

/**
 * Limpa vídeos em cache antigos ou de outras lojas
 */
const cleanupVideos = async (): Promise<number> => {
  let cleaned = 0;
  const currentStoreId = getCurrentStoreId() || '';
  const now = Date.now();

  try {
    const videos = await cacheGetAll<CachedVideo>(STORES.VIDEOS);
    
    for (const video of videos) {
      // Remove se é de outra loja ou muito antigo
      if (video.storeId !== currentStoreId) {
        await cacheDelete(STORES.VIDEOS, video.id);
        cleaned++;
        console.log(`[Cleanup] Removed video from other store: ${video.id}`);
      } else if (now - video.cachedAt > CLEANUP_CONFIG.VIDEOS_MAX_AGE_MS) {
        await cacheDelete(STORES.VIDEOS, video.id);
        cleaned++;
        console.log(`[Cleanup] Removed old video: ${video.id}`);
      }
    }

    // Também limpa do Cache API
    if (typeof caches !== 'undefined') {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.startsWith('kiosk-video-cache') && !name.endsWith('v1')) {
          await caches.delete(name);
          console.log(`[Cleanup] Removed old video cache: ${name}`);
        }
      }
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning videos:', error);
  }

  return cleaned;
};

/**
 * Limpa chaves obsoletas do localStorage
 */
const cleanupLocalStorage = (): string[] => {
  const cleaned: string[] = [];
  
  // Chaves que podem ser removidas se obsoletas
  const obsoletePatterns = [
    /^temp_/,
    /^debug_/,
    /^_old_/,
  ];

  // Chaves antigas que não são mais usadas
  const deprecatedKeys = [
    'old_settings',
    'temp_cart',
  ];

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Remove chaves obsoletas
      const isObsolete = obsoletePatterns.some((pattern) => pattern.test(key));
      const isDeprecated = deprecatedKeys.includes(key);

      if (isObsolete || isDeprecated) {
        localStorage.removeItem(key);
        cleaned.push(key);
        console.log(`[Cleanup] Removed localStorage key: ${key}`);
      }
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning localStorage:', error);
  }

  return cleaned;
};

/**
 * Executa cleanup completo
 */
export const runCleanup = async (): Promise<CleanupResult> => {
  if (isCleanupRunning) {
    console.log('[Cleanup] Already running, skipping');
    return {
      syncQueueCleaned: 0,
      productsCleaned: 0,
      videosCleaned: 0,
      localStorageKeys: [],
      totalFreedBytes: 0,
    };
  }

  isCleanupRunning = true;
  console.log('[Cleanup] Starting cleanup...');

  try {
    const [syncQueueCleaned, productsCleaned, videosCleaned] = await Promise.all([
      cleanupSyncQueue(),
      cleanupProducts(),
      cleanupVideos(),
    ]);

    const localStorageKeys = cleanupLocalStorage();

    const result: CleanupResult = {
      syncQueueCleaned,
      productsCleaned,
      videosCleaned,
      localStorageKeys,
      totalFreedBytes: 0, // Difícil calcular exatamente
    };

    console.log('[Cleanup] Completed:', result);
    return result;
  } finally {
    isCleanupRunning = false;
  }
};

// Armazenar timeout inicial para permitir cancelamento
let initialCleanupTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Inicia cleanup automático periódico (singleton - só executa uma vez)
 */
export const startAutoCleanup = (): void => {
  // Já está rodando - não duplicar
  if (cleanupIntervalId || initialCleanupTimeoutId) {
    return;
  }

  console.log('[Cleanup] Starting auto cleanup');
  
  // Executa após 1 minuto do início (armazena para cancelamento)
  initialCleanupTimeoutId = setTimeout(() => {
    initialCleanupTimeoutId = null;
    runCleanup();
  }, 60 * 1000);

  // Executa periodicamente
  cleanupIntervalId = setInterval(() => {
    runCleanup();
  }, CLEANUP_CONFIG.AUTO_CLEANUP_INTERVAL_MS);
};

/**
 * Para cleanup automático
 */
export const stopAutoCleanup = (): void => {
  // Limpar timeout inicial se ainda não executou
  if (initialCleanupTimeoutId) {
    clearTimeout(initialCleanupTimeoutId);
    initialCleanupTimeoutId = null;
  }
  
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log('[Cleanup] Stopped auto cleanup');
  }
};

/**
 * Obtém uso estimado de armazenamento
 */
export const getStorageUsage = async (): Promise<{
  indexedDB: { products: number; videos: number; syncQueue: number };
  localStorage: number;
  cacheAPI: number;
}> => {
  let localStorageSize = 0;
  let cacheAPISize = 0;

  // Calcula tamanho do localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        localStorageSize += (key.length + (value?.length || 0)) * 2; // UTF-16
      }
    }
  } catch {
    // Erro ao calcular
  }

  // Calcula tamanho do Cache API
  try {
    if (typeof caches !== 'undefined' && 'storage' in navigator) {
      const estimate = await (navigator as any).storage.estimate();
      cacheAPISize = estimate.usage || 0;
    }
  } catch {
    // Erro ao calcular
  }

  // Conta itens no IndexedDB
  const [products, videos, syncQueue] = await Promise.all([
    cacheGetAll<CachedProduct>(STORES.PRODUCTS),
    cacheGetAll<CachedVideo>(STORES.VIDEOS),
    cacheGetAll<SyncQueueItem>(STORES.SYNC_QUEUE),
  ]);

  return {
    indexedDB: {
      products: products.length,
      videos: videos.length,
      syncQueue: syncQueue.length,
    },
    localStorage: localStorageSize,
    cacheAPI: cacheAPISize,
  };
};

export default {
  run: runCleanup,
  startAuto: startAutoCleanup,
  stopAuto: stopAutoCleanup,
  getStorageUsage,
};
