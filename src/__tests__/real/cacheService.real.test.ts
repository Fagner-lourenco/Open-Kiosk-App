import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORES, type CachedProduct, type CachedVideo, type SyncQueueItem, type CachedSettings } from '@/services/cacheService';

// Nota: IndexedDB tem comportamento limitado em jsdom, então testamos principalmente
// as constantes e verificamos a disponibilidade da API.

describe('cacheService', () => {
  describe('STORES constants', () => {
    it('define store SETTINGS', () => {
      expect(STORES.SETTINGS).toBe('settings');
    });

    it('define store PRODUCTS', () => {
      expect(STORES.PRODUCTS).toBe('products');
    });

    it('define store VIDEOS', () => {
      expect(STORES.VIDEOS).toBe('videos');
    });

    it('define store SYNC_QUEUE', () => {
      expect(STORES.SYNC_QUEUE).toBe('syncQueue');
    });

    it('contém exatamente 4 stores', () => {
      expect(Object.keys(STORES)).toHaveLength(4);
    });

    it('todas as stores são strings', () => {
      Object.values(STORES).forEach(storeName => {
        expect(typeof storeName).toBe('string');
      });
    });

    it('stores são únicas', () => {
      const values = Object.values(STORES);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });
  });

  describe('IndexedDB availability', () => {
    it('indexedDB está definido no ambiente jsdom', () => {
      expect(typeof indexedDB).toBe('object');
    });

    it('indexedDB.open é uma função', () => {
      expect(typeof indexedDB.open).toBe('function');
    });

    it('indexedDB.deleteDatabase é uma função', () => {
      expect(typeof indexedDB.deleteDatabase).toBe('function');
    });
  });

  describe('Store name consistency', () => {
    it('SETTINGS é lowercase', () => {
      expect(STORES.SETTINGS).toBe(STORES.SETTINGS.toLowerCase());
    });

    it('PRODUCTS é lowercase', () => {
      expect(STORES.PRODUCTS).toBe(STORES.PRODUCTS.toLowerCase());
    });

    it('VIDEOS é lowercase', () => {
      expect(STORES.VIDEOS).toBe(STORES.VIDEOS.toLowerCase());
    });

    it('SYNC_QUEUE é camelCase', () => {
      expect(STORES.SYNC_QUEUE).toBe('syncQueue');
    });
  });

  describe('CachedProduct interface', () => {
    it('aceita objeto com estrutura correta', () => {
      const product: CachedProduct = {
        id: 'prod-1',
        data: { name: 'Test Product', price: 10 },
        updatedAt: Date.now(),
        storeId: 'store-123',
      };
      
      expect(product.id).toBe('prod-1');
      expect(product.storeId).toBe('store-123');
    });

    it('data pode ser qualquer tipo', () => {
      const product: CachedProduct = {
        id: 'prod-2',
        data: null,
        updatedAt: 123,
        storeId: 'store-456',
      };
      
      expect(product.data).toBeNull();
    });
  });

  describe('CachedVideo interface', () => {
    it('aceita objeto com estrutura correta', () => {
      const video: CachedVideo = {
        id: 'video-1',
        url: 'https://example.com/video.mp4',
        version: '1.0.0',
        cachedAt: Date.now(),
        size: 1024 * 1024,
        storeId: 'store-123',
      };
      
      expect(video.id).toBe('video-1');
      expect(video.size).toBe(1024 * 1024);
    });

    it('blob é opcional', () => {
      const video: CachedVideo = {
        id: 'video-2',
        url: 'https://example.com/video2.mp4',
        version: '1.0.1',
        cachedAt: Date.now(),
        size: 2048,
        storeId: 'store-789',
      };
      
      expect(video.blob).toBeUndefined();
    });
  });

  describe('SyncQueueItem interface', () => {
    it('aceita operação create', () => {
      const item: SyncQueueItem = {
        id: 'sync-1',
        operation: 'create',
        collection: 'products',
        docId: 'doc-1',
        createdAt: Date.now(),
        retryCount: 0,
        storeId: 'store-123',
      };
      
      expect(item.operation).toBe('create');
    });

    it('aceita operação update', () => {
      const item: SyncQueueItem = {
        id: 'sync-2',
        operation: 'update',
        collection: 'orders',
        docId: 'doc-2',
        data: { status: 'completed' },
        createdAt: Date.now(),
        retryCount: 1,
        storeId: 'store-456',
      };
      
      expect(item.operation).toBe('update');
      expect(item.data).toEqual({ status: 'completed' });
    });

    it('aceita operação delete', () => {
      const item: SyncQueueItem = {
        id: 'sync-3',
        operation: 'delete',
        collection: 'products',
        docId: 'doc-3',
        createdAt: Date.now(),
        retryCount: 2,
        storeId: 'store-789',
      };
      
      expect(item.operation).toBe('delete');
    });
  });

  describe('CachedSettings interface', () => {
    it('aceita objeto com estrutura correta', () => {
      const settings: CachedSettings = {
        id: 'currency',
        data: { code: 'BRL', symbol: 'R$' },
        updatedAt: Date.now(),
      };
      
      expect(settings.id).toBe('currency');
    });
  });

  describe('STORES keys', () => {
    it('SETTINGS key é correto', () => {
      expect('SETTINGS' in STORES).toBe(true);
    });

    it('PRODUCTS key é correto', () => {
      expect('PRODUCTS' in STORES).toBe(true);
    });

    it('VIDEOS key é correto', () => {
      expect('VIDEOS' in STORES).toBe(true);
    });

    it('SYNC_QUEUE key é correto', () => {
      expect('SYNC_QUEUE' in STORES).toBe(true);
    });
  });
});
