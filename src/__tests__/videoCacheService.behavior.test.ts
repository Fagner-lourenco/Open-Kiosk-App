import { beforeEach, describe, expect, it, vi } from 'vitest';

const videoStore = new Map<string, any>();
const nativeFiles = new Map<string, { uri: string; size: number }>();
const uriToPath = new Map<string, string>();
const cacheBuckets = new Map<string, Map<string, Response>>();
const deletedServiceWorkers: string[] = [];
const revokedObjectUrls: string[] = [];

let nativePlatform = true;
let nativeDownloadShouldFail = false;
let nativeDownloadSize = 1024;
let objectUrlCounter = 0;

vi.mock('@/services/firebase', () => ({
  getCurrentStoreId: vi.fn(() => 'store-1'),
}));

vi.mock('@/services/cacheService', () => ({
  STORES: {
    VIDEOS: 'videos',
  },
  cacheSet: vi.fn(async (_storeName: string, item: any) => {
    videoStore.set(item.id, item);
  }),
  cacheGet: vi.fn(async (_storeName: string, id: string) => videoStore.get(id)),
  cacheGetAll: vi.fn(async () => Array.from(videoStore.values())),
  cacheGetByIndex: vi.fn(async (_storeName: string, indexName: string, value: any) => {
    const items = Array.from(videoStore.values());
    if (indexName === 'storeId') {
      return items.filter((item) => item.storeId === value);
    }
    if (indexName === 'cachedAt') {
      return items.sort((first, second) => first.cachedAt - second.cachedAt);
    }
    return items;
  }),
  cacheDelete: vi.fn(async (_storeName: string, id: string) => {
    videoStore.delete(id);
  }),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => nativePlatform,
    convertFileSrc: (uri: string) => `capacitor://${uri}`,
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: {
    Data: 'DATA',
  },
  Filesystem: {
    mkdir: vi.fn(async () => undefined),
    getUri: vi.fn(async ({ path }: { path: string }) => {
      const uri = `file:///mock/${path}`;
      uriToPath.set(uri, path);
      return { uri };
    }),
    stat: vi.fn(async ({ path }: { path: string }) => {
      const file = nativeFiles.get(path);
      if (!file) {
        throw new Error('ENOENT');
      }
      return { size: file.size };
    }),
    deleteFile: vi.fn(async ({ path }: { path: string }) => {
      nativeFiles.delete(path);
    }),
  },
}));

vi.mock('@capacitor/file-transfer', () => ({
  FileTransfer: {
    downloadFile: vi.fn(async ({ path }: { path: string }) => {
      if (nativeDownloadShouldFail) {
        throw new Error('native download failed');
      }

      const relativePath = uriToPath.get(path);
      if (!relativePath) {
        throw new Error(`No uri mapping for ${path}`);
      }

      nativeFiles.set(relativePath, { uri: path, size: nativeDownloadSize });
      return { path };
    }),
  },
}));

function installCacheApiMock() {
  const open = async (cacheName: string) => {
    if (!cacheBuckets.has(cacheName)) {
      cacheBuckets.set(cacheName, new Map());
    }

    const bucket = cacheBuckets.get(cacheName)!;
    return {
      put: async (key: string, response: Response) => {
        bucket.set(key, response);
      },
      match: async (key: string) => bucket.get(key),
      delete: async (key: string) => bucket.delete(key),
    };
  };

  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      open,
      keys: async () => Array.from(cacheBuckets.keys()),
      delete: async (cacheName: string) => cacheBuckets.delete(cacheName),
    },
  });
}

describe('video cache behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    videoStore.clear();
    nativeFiles.clear();
    uriToPath.clear();
    cacheBuckets.clear();
    deletedServiceWorkers.length = 0;
    revokedObjectUrls.length = 0;

    nativePlatform = true;
    nativeDownloadShouldFail = false;
    nativeDownloadSize = 1024;
    objectUrlCounter = 0;

    installCacheApiMock();

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async () => new Response(new Blob(['video-bytes'], { type: 'video/mp4' }), {
        headers: {
          'content-type': 'video/mp4',
          'content-length': '11',
        },
      })),
    });

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => {
        objectUrlCounter += 1;
        return `blob:mock-${objectUrlCounter}`;
      }),
    });

    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn((url: string) => {
        revokedObjectUrls.push(url);
      }),
    });

    if ((global.navigator as any).serviceWorker) {
      (global.navigator as any).serviceWorker.getRegistrations = vi.fn(async () => ([
        {
          unregister: vi.fn(async () => {
            deletedServiceWorkers.push('sw-1');
            return true;
          }),
        },
      ]));
    }
  });

  it('preserves manual kiosk caches when native runtime caches are purged', async () => {
    const runtimeCache = await caches.open('runtime-cache');
    const videoCache = await caches.open('kiosk-video-cache-v1');
    const manualCache = await caches.open('kiosk-manual-products');
    await runtimeCache.put('/runtime', new Response('runtime'));
    await videoCache.put('/video', new Response('video'));
    await manualCache.put('/manual', new Response('manual'));

    const { purgeNativeWebViewRuntimeCaches } = await import('@/services/nativeWebViewCacheService');
    const result = await purgeNativeWebViewRuntimeCaches();

    expect(result.deletedCacheKeys).toEqual(['runtime-cache']);
    expect(result.preservedCacheKeys).toEqual(
      expect.arrayContaining(['kiosk-video-cache-v1', 'kiosk-manual-products']),
    );
    expect(deletedServiceWorkers).toEqual(['sw-1']);
  });

  it('invalidates the previous asset when the same URL gets a new cacheKey', async () => {
    const service = await import('@/services/videoCacheService');
    const cacheService = await import('@/services/cacheService');

    const first = await service.downloadVideo({
      url: 'https://cdn.example.com/attract.mp4',
      cacheKey: 'v1',
      contentType: 'video/mp4',
    });

    expect(first?.source).toBe('native-file');
    expect(first?.isCached).toBe(true);
    expect(nativeFiles.size).toBe(1);

    const [firstMetadata] = await cacheService.cacheGetAll('videos');
    const oldPath = firstMetadata.nativeFilePath;
    const oldCacheKey = firstMetadata.cacheKey;

    await service.downloadVideo({
      url: 'https://cdn.example.com/attract.mp4',
      cacheKey: 'v2',
      contentType: 'video/mp4',
    });

    const metadata = await cacheService.cacheGetAll('videos');
    expect(metadata).toHaveLength(1);
    expect(metadata[0].cacheKey).toBe('v2');
    expect(metadata[0].cacheKey).not.toBe(oldCacheKey);
    expect(nativeFiles.has(oldPath)).toBe(false);
    expect(nativeFiles.size).toBe(1);
  });

  it('removes indexedDB metadata, Cache API data and native files together', async () => {
    const service = await import('@/services/videoCacheService');
    const cacheService = await import('@/services/cacheService');

    const cache = await caches.open('kiosk-video-cache-v1');
    nativeFiles.set('video-cache/store-1/video_123-v1.mp4', {
      uri: 'file:///mock/video-cache/store-1/video_123-v1.mp4',
      size: 22,
    });

    await cache.put('https://localhost/__kiosk_video_cache__/video_123?v=v1', new Response('cached-video'));
    await cacheService.cacheSet('videos', {
      id: 'video_123',
      url: 'https://cdn.example.com/attract.mp4',
      version: 'v1',
      cacheKey: 'v1',
      cachedAt: Date.now(),
      size: 22,
      storeId: 'store-1',
      source: 'native-file',
      cacheApiKey: 'https://localhost/__kiosk_video_cache__/video_123?v=v1',
      nativeFilePath: 'video-cache/store-1/video_123-v1.mp4',
    });

    await service.removeVideoFromCacheById('video_123');

    expect(await cacheService.cacheGetAll('videos')).toEqual([]);
    expect(nativeFiles.size).toBe(0);
    expect(await cache.match('https://localhost/__kiosk_video_cache__/video_123?v=v1')).toBeUndefined();
  });

  it('keeps isCached=false when the request is remote playback only', async () => {
    const service = await import('@/services/videoCacheService');
    const cacheService = await import('@/services/cacheService');

    const result = await service.downloadVideo({
      url: 'https://videos.pexels.com/video.mp4',
      cacheKey: 'manual',
      validationResult: 'remote_only',
    });

    expect(result).toEqual({
      videoUrl: 'https://videos.pexels.com/video.mp4',
      source: 'remote',
      isCached: false,
      metadata: undefined,
    });
    expect(await service.isVideoCached({
      url: 'https://videos.pexels.com/video.mp4',
      cacheKey: 'manual',
      validationResult: 'remote_only',
    })).toBe(false);
    expect(await cacheService.cacheGetAll('videos')).toEqual([]);
  });

  it('does not reuse a revoked blob URL on cache-api fallback', async () => {
    nativeDownloadShouldFail = true;
    nativePlatform = false;

    const service = await import('@/services/videoCacheService');

    const request = {
      url: 'https://firebasestorage.googleapis.com/v0/b/demo/o/video.mp4?alt=media',
      cacheKey: 'blob-v1',
      contentType: 'video/mp4',
    };

    const first = await service.downloadVideo(request);
    expect(first?.source).toBe('cache-api');
    expect(first?.videoUrl).toBe('blob:mock-1');

    service.revokeVideoObjectURL(request);
    const second = await service.getCachedVideo(request);

    expect(revokedObjectUrls).toContain('blob:mock-1');
    expect(second?.videoUrl).toBe('blob:mock-2');
  });
});
