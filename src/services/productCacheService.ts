/**
 * ============================================
 * Product Cache Service
 * ============================================
 * 
 * Cache de produtos com sincronização inteligente.
 * Usa IndexedDB como storage principal com localStorage como hot cache.
 */

import { Product } from '@/types/product';
import { 
  cacheSet, 
  cacheGet, 
  cacheGetByIndex, 
  cacheDelete, 
  cacheBatchSet,
  STORES, 
  CachedProduct 
} from './cacheService';
import { getCurrentStoreId } from './firebase';

const PRODUCTS_LOCAL_KEY = 'cached_products';
const PRODUCTS_VERSION_KEY = 'products_cache_version';

/**
 * Salva produtos no localStorage (hot cache rápido)
 */
const saveToLocalStorage = (products: Product[], storeId: string): void => {
  try {
    localStorage.setItem(PRODUCTS_LOCAL_KEY, JSON.stringify({
      storeId,
      products,
      updatedAt: Date.now(),
    }));
  } catch (error) {
    // localStorage cheio ou indisponível
    console.warn('[ProductCache] localStorage save failed:', error);
  }
};

/**
 * Carrega produtos do localStorage
 */
const loadFromLocalStorage = (storeId: string): Product[] | null => {
  try {
    const cached = localStorage.getItem(PRODUCTS_LOCAL_KEY);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    if (parsed.storeId !== storeId) return null;
    
    return parsed.products as Product[];
  } catch {
    return null;
  }
};

/**
 * Salva produtos no IndexedDB
 */
export const saveProductsToCache = async (products: Product[]): Promise<void> => {
  const storeId = getCurrentStoreId() || '';
  const now = Date.now();

  // 1. Salva no localStorage (hot cache)
  saveToLocalStorage(products, storeId);

  // 2. Salva no IndexedDB
  try {
    const cachedProducts: CachedProduct[] = products.map((product) => ({
      id: product.id,
      data: product,
      updatedAt: now,
      storeId,
    }));

    await cacheBatchSet(STORES.PRODUCTS, cachedProducts);
    
    // Atualiza versão do cache
    localStorage.setItem(PRODUCTS_VERSION_KEY, now.toString());
    
    console.log(`[ProductCache] Cached ${products.length} products`);
  } catch (error) {
    console.error('[ProductCache] Error saving to IndexedDB:', error);
  }
};

/**
 * Carrega produtos do cache (localStorage primeiro, depois IndexedDB)
 */
export const loadProductsFromCache = async (): Promise<Product[] | null> => {
  const storeId = getCurrentStoreId() || '';

  // 1. Tenta localStorage primeiro (mais rápido)
  const localProducts = loadFromLocalStorage(storeId);
  if (localProducts && localProducts.length > 0) {
    console.log(`[ProductCache] Loaded ${localProducts.length} products from localStorage`);
    return localProducts;
  }

  // 2. Fallback para IndexedDB
  try {
    const cachedProducts = await cacheGetByIndex<CachedProduct>(
      STORES.PRODUCTS,
      'storeId',
      storeId
    );

    if (cachedProducts.length > 0) {
      const products = cachedProducts.map((cp) => cp.data as Product);
      console.log(`[ProductCache] Loaded ${products.length} products from IndexedDB`);
      
      // Atualiza localStorage
      saveToLocalStorage(products, storeId);
      
      return products;
    }
  } catch (error) {
    console.error('[ProductCache] Error loading from IndexedDB:', error);
  }

  return null;
};

/**
 * Atualiza um produto no cache
 */
export const updateProductInCache = async (product: Product): Promise<void> => {
  const storeId = getCurrentStoreId() || '';

  try {
    // Atualiza IndexedDB
    const cachedProduct: CachedProduct = {
      id: product.id,
      data: product,
      updatedAt: Date.now(),
      storeId,
    };
    await cacheSet(STORES.PRODUCTS, cachedProduct);

    // Atualiza localStorage
    const localProducts = loadFromLocalStorage(storeId);
    if (localProducts) {
      const index = localProducts.findIndex((p) => p.id === product.id);
      if (index >= 0) {
        localProducts[index] = product;
      } else {
        localProducts.push(product);
      }
      saveToLocalStorage(localProducts, storeId);
    }

    console.log(`[ProductCache] Updated product: ${product.id}`);
  } catch (error) {
    console.error('[ProductCache] Error updating product:', error);
  }
};

/**
 * Remove um produto do cache
 */
export const removeProductFromCache = async (productId: string): Promise<void> => {
  const storeId = getCurrentStoreId() || '';

  try {
    // Remove do IndexedDB
    await cacheDelete(STORES.PRODUCTS, productId);

    // Remove do localStorage
    const localProducts = loadFromLocalStorage(storeId);
    if (localProducts) {
      const filtered = localProducts.filter((p) => p.id !== productId);
      saveToLocalStorage(filtered, storeId);
    }

    console.log(`[ProductCache] Removed product: ${productId}`);
  } catch (error) {
    console.error('[ProductCache] Error removing product:', error);
  }
};

/**
 * Limpa todo o cache de produtos
 */
export const clearProductsCache = async (): Promise<void> => {
  try {
    const storeId = getCurrentStoreId() || '';
    
    // Limpa IndexedDB
    const products = await cacheGetByIndex<CachedProduct>(STORES.PRODUCTS, 'storeId', storeId);
    for (const product of products) {
      await cacheDelete(STORES.PRODUCTS, product.id);
    }

    // Limpa localStorage
    localStorage.removeItem(PRODUCTS_LOCAL_KEY);
    localStorage.removeItem(PRODUCTS_VERSION_KEY);

    console.log('[ProductCache] Cache cleared');
  } catch (error) {
    console.error('[ProductCache] Error clearing cache:', error);
  }
};

/**
 * Verifica se o cache precisa ser atualizado
 */
export const isCacheStale = (maxAgeMs: number = 5 * 60 * 1000): boolean => {
  try {
    const version = localStorage.getItem(PRODUCTS_VERSION_KEY);
    if (!version) return true;
    
    const cachedAt = parseInt(version, 10);
    return Date.now() - cachedAt > maxAgeMs;
  } catch {
    return true;
  }
};

/**
 * Obtém estatísticas do cache
 */
export const getProductsCacheStats = async (): Promise<{
  count: number;
  storeId: string;
  lastUpdated: number | null;
}> => {
  const storeId = getCurrentStoreId() || '';
  
  try {
    const products = await cacheGetByIndex<CachedProduct>(STORES.PRODUCTS, 'storeId', storeId);
    const version = localStorage.getItem(PRODUCTS_VERSION_KEY);
    
    return {
      count: products.length,
      storeId,
      lastUpdated: version ? parseInt(version, 10) : null,
    };
  } catch {
    return {
      count: 0,
      storeId,
      lastUpdated: null,
    };
  }
};

export default {
  save: saveProductsToCache,
  load: loadProductsFromCache,
  update: updateProductInCache,
  remove: removeProductFromCache,
  clear: clearProductsCache,
  isStale: isCacheStale,
  getStats: getProductsCacheStats,
};
