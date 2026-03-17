import { shouldPreserveCacheStorageCache } from './videoCacheService';

export interface NativeWebViewCacheCleanupResult {
  serviceWorkersRemoved: number;
  deletedCacheKeys: string[];
  preservedCacheKeys: string[];
}

export const purgeNativeWebViewRuntimeCaches = async (): Promise<NativeWebViewCacheCleanupResult> => {
  const result: NativeWebViewCacheCleanupResult = {
    serviceWorkersRemoved: 0,
    deletedCacheKeys: [],
    preservedCacheKeys: [],
  };

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    result.serviceWorkersRemoved = registrations.length;
  }

  if (typeof caches === 'undefined') {
    return result;
  }

  const cacheKeys = await caches.keys();
  const cacheKeysToDelete = cacheKeys.filter((cacheKey) => !shouldPreserveCacheStorageCache(cacheKey));

  result.preservedCacheKeys = cacheKeys.filter((cacheKey) => shouldPreserveCacheStorageCache(cacheKey));
  result.deletedCacheKeys = cacheKeysToDelete;

  await Promise.all(cacheKeysToDelete.map((cacheKey) => caches.delete(cacheKey)));
  return result;
};

export default {
  purgeNativeWebViewRuntimeCaches,
};
