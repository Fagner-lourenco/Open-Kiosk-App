/**
 * ============================================
 * Video Cache Service
 * ============================================
 *
 * Manages attract-screen video caching across three sources:
 * - remote: direct playback from the original URL
 * - cache-api: browser Cache API fallback for web/PWA
 * - native-file: Capacitor native file cache for Android/iOS
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import {
  cacheDelete,
  cacheGet,
  cacheGetAll,
  cacheGetByIndex,
  cacheSet,
  STORES,
  type CachedVideo,
} from './cacheService';
import { getCurrentStoreId } from './firebase';

export const VIDEO_CACHE_NAME = 'kiosk-video-cache-v1';
const VIDEO_NATIVE_DIRECTORY = 'video-cache';
const MAX_CACHE_SIZE_MB = 500;
const MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_MB * 1024 * 1024;
const MANUAL_CACHE_PREFIXES = [VIDEO_CACHE_NAME, 'kiosk-manual-'];
const REMOTE_ONLY_RESULTS = new Set(['remote_only', 'cors_warning']);

export type VideoCacheSource = 'remote' | 'cache-api' | 'native-file';
export type VideoValidationResult = 'valid' | 'invalid' | 'remote_only' | 'cors_warning' | undefined;

export interface VideoCacheRequest {
  url: string;
  cacheKey?: string | null;
  contentType?: string | null;
  validationResult?: VideoValidationResult;
}

export type VideoCacheRequestInput = string | VideoCacheRequest;

export interface DownloadState {
  url: string;
  progress: number;
  isDownloading: boolean;
  error: string | null;
  source: VideoCacheSource;
  isCached: boolean;
}

export interface VideoCacheResult {
  videoUrl: string;
  source: VideoCacheSource;
  isCached: boolean;
  metadata?: CachedVideo;
}

interface NormalizedVideoRequest {
  url: string;
  normalizedUrl: string;
  videoId: string;
  version: string;
  storeId: string;
  cacheKey: string;
  cacheApiKey: string;
  nativeFilePath: string;
  validationResult?: VideoValidationResult;
  contentType?: string;
}

interface ActiveObjectURL {
  version: string;
  objectUrl: string;
}

const downloadStates = new Map<string, DownloadState>();
const downloadListeners = new Map<string, Set<(state: DownloadState) => void>>();
const activeObjectURLs = new Map<string, ActiveObjectURL>();

const isNativeFileCachingSupported = (): boolean => Capacitor.isNativePlatform();

export const isCacheAPIAvailable = (): boolean => {
  return typeof caches !== 'undefined' || isNativeFileCachingSupported();
};

export const shouldPreserveCacheStorageCache = (cacheName: string): boolean => {
  return MANUAL_CACHE_PREFIXES.some((prefix) => cacheName === prefix || cacheName.startsWith(prefix));
};

const toRequest = (input: VideoCacheRequestInput): VideoCacheRequest => {
  return typeof input === 'string' ? { url: input } : input;
};

const normalizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.toString();
  } catch {
    return url;
  }
};

const stripQueryAndHash = (url: string): string => {
  try {
    const urlObj = new URL(url);
    urlObj.search = '';
    urlObj.hash = '';
    return urlObj.toString();
  } catch {
    return url;
  }
};

const hashString = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
};

const sanitizeSegment = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
};

const getVideoId = (url: string): string => `video_${hashString(stripQueryAndHash(url))}`;

const getVersion = (url: string, cacheKey?: string | null): string => {
  const identity = `${stripQueryAndHash(url)}::${cacheKey || 'url-only'}`;
  return hashString(identity);
};

const buildCacheApiKey = (videoId: string, version: string): string => {
  const baseOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://localhost';
  return `${baseOrigin}/__kiosk_video_cache__/${videoId}?v=${version}`;
};

const getExtensionFromContentType = (contentType?: string | null): string | null => {
  if (!contentType) return null;
  const normalized = contentType.toLowerCase();
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg') || normalized.includes('ogv')) return 'ogv';
  if (normalized.includes('quicktime')) return 'mov';
  if (normalized.includes('mp4')) return 'mp4';
  return null;
};

const getExtensionFromUrl = (url: string): string | null => {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (!match) return null;
    const extension = match[1].toLowerCase();
    if (['mp4', 'webm', 'ogv', 'ogg', 'mov', 'm4v'].includes(extension)) {
      return extension;
    }
  } catch {
    // Ignore invalid URL parsing here.
  }
  return null;
};

const getVideoExtension = (request: Pick<NormalizedVideoRequest, 'url' | 'contentType'>): string => {
  return getExtensionFromContentType(request.contentType) || getExtensionFromUrl(request.url) || 'mp4';
};

const normalizeVideoRequest = (input: VideoCacheRequestInput): NormalizedVideoRequest | null => {
  const request = toRequest(input);
  const url = request.url?.trim();

  if (!url) {
    return null;
  }

  const normalizedUrl = normalizeUrl(url);
  const videoId = getVideoId(normalizedUrl);
  const version = getVersion(normalizedUrl, request.cacheKey);
  const storeId = sanitizeSegment(getCurrentStoreId() || 'global');
  const extension = getVideoExtension({ url: normalizedUrl, contentType: request.contentType });

  return {
    url: normalizedUrl,
    normalizedUrl,
    videoId,
    version,
    storeId,
    cacheKey: request.cacheKey?.trim() || 'url-only',
    cacheApiKey: buildCacheApiKey(videoId, version),
    nativeFilePath: `${VIDEO_NATIVE_DIRECTORY}/${storeId}/${videoId}-${version}.${extension}`,
    validationResult: request.validationResult,
    contentType: request.contentType || undefined,
  };
};

const isRemoteOnly = (validationResult?: VideoValidationResult): boolean => {
  return validationResult ? REMOTE_ONLY_RESULTS.has(validationResult) : false;
};

const notifyDownloadListeners = (videoId: string, state: DownloadState) => {
  const listeners = downloadListeners.get(videoId);
  if (!listeners) return;

  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      console.error('[VideoCacheService] Error in download listener:', error);
    }
  });
};

const updateDownloadState = (videoId: string, partial: Partial<DownloadState>) => {
  const current = downloadStates.get(videoId) || {
    url: '',
    progress: 0,
    isDownloading: false,
    error: null,
    source: 'remote' as VideoCacheSource,
    isCached: false,
  };
  const updated = { ...current, ...partial };
  downloadStates.set(videoId, updated);
  notifyDownloadListeners(videoId, updated);
};

const getVideoCache = async (): Promise<Cache | null> => {
  if (typeof caches === 'undefined') {
    return null;
  }

  try {
    return await caches.open(VIDEO_CACHE_NAME);
  } catch (error) {
    console.error('[VideoCacheService] Error opening cache:', error);
    return null;
  }
};

const getExistingObjectUrl = (videoId: string, version: string): string | null => {
  const existing = activeObjectURLs.get(videoId);
  if (!existing) {
    return null;
  }

  if (existing.version === version) {
    return existing.objectUrl;
  }

  URL.revokeObjectURL(existing.objectUrl);
  activeObjectURLs.delete(videoId);
  return null;
};

const storeObjectUrl = (videoId: string, version: string, objectUrl: string): string => {
  const existing = activeObjectURLs.get(videoId);
  if (existing && existing.objectUrl !== objectUrl) {
    URL.revokeObjectURL(existing.objectUrl);
  }
  activeObjectURLs.set(videoId, { version, objectUrl });
  return objectUrl;
};

const buildRemoteResult = (request: NormalizedVideoRequest, metadata?: CachedVideo): VideoCacheResult => ({
  videoUrl: request.url,
  source: 'remote',
  isCached: false,
  metadata,
});

const getMetadata = async (request: NormalizedVideoRequest): Promise<CachedVideo | undefined> => {
  return cacheGet<CachedVideo>(STORES.VIDEOS, request.videoId);
};

const getLegacyCacheApiKey = (metadata: CachedVideo, request: NormalizedVideoRequest): string => {
  return metadata.cacheApiKey
    || metadata.url
    || buildCacheApiKey(metadata.id || request.videoId, metadata.version || request.version);
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await Filesystem.stat({ directory: Directory.Data, path });
    return true;
  } catch {
    return false;
  }
};

const removeNativeFileIfPresent = async (path?: string): Promise<void> => {
  if (!path || !isNativeFileCachingSupported()) {
    return;
  }

  try {
    await Filesystem.deleteFile({ directory: Directory.Data, path });
  } catch (error) {
    console.debug('[VideoCacheService] Native file already absent or could not be deleted:', path, error);
  }
};

const removeCacheApiEntryIfPresent = async (cacheApiKey?: string): Promise<void> => {
  if (!cacheApiKey) {
    return;
  }

  const cache = await getVideoCache();
  if (!cache) {
    return;
  }

  await cache.delete(cacheApiKey);
};

const removeCachedVideoRecord = async (metadata: CachedVideo): Promise<void> => {
  await removeCacheApiEntryIfPresent(metadata.cacheApiKey || metadata.url || undefined);
  await removeNativeFileIfPresent(metadata.nativeFilePath);
  const objectUrl = activeObjectURLs.get(metadata.id);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl.objectUrl);
    activeObjectURLs.delete(metadata.id);
  }
  await cacheDelete(STORES.VIDEOS, metadata.id);
};

const buildMetadata = (
  request: NormalizedVideoRequest,
  partial: Pick<CachedVideo, 'size' | 'source'> & Partial<Pick<CachedVideo, 'cacheApiKey' | 'nativeFilePath' | 'nativeFileUri' | 'contentType'>>
): CachedVideo => ({
  id: request.videoId,
  url: request.url,
  version: request.version,
  cacheKey: request.cacheKey,
  cachedAt: Date.now(),
  size: partial.size,
  storeId: request.storeId,
  source: partial.source,
  cacheApiKey: partial.cacheApiKey,
  nativeFilePath: partial.nativeFilePath,
  nativeFileUri: partial.nativeFileUri,
  contentType: partial.contentType || request.contentType,
});

const resolveFromCacheApi = async (
  request: NormalizedVideoRequest,
  metadata: CachedVideo,
): Promise<VideoCacheResult | null> => {
  const objectUrl = getExistingObjectUrl(metadata.id, metadata.version);
  if (objectUrl) {
    return {
      videoUrl: objectUrl,
      source: 'cache-api',
      isCached: true,
      metadata,
    };
  }

  const cache = await getVideoCache();
  if (!cache) {
    return null;
  }

  const response = await cache.match(getLegacyCacheApiKey(metadata, request));
  if (!response) {
    return null;
  }

  const blob = await response.blob();
  return {
    videoUrl: storeObjectUrl(metadata.id, metadata.version, URL.createObjectURL(blob)),
    source: 'cache-api',
    isCached: true,
    metadata,
  };
};

const resolveFromNativeFile = async (
  metadata: CachedVideo,
): Promise<VideoCacheResult | null> => {
  if (!metadata.nativeFilePath || !isNativeFileCachingSupported()) {
    return null;
  }

  if (!(await fileExists(metadata.nativeFilePath))) {
    return null;
  }

  let uri = metadata.nativeFileUri;
  if (!uri) {
    const uriResult = await Filesystem.getUri({
      directory: Directory.Data,
      path: metadata.nativeFilePath,
    });
    uri = uriResult.uri;
  }

  return {
    videoUrl: Capacitor.convertFileSrc(uri),
    source: 'native-file',
    isCached: true,
    metadata: {
      ...metadata,
      nativeFileUri: uri,
    },
  };
};

const resolveCachedVideo = async (request: NormalizedVideoRequest): Promise<VideoCacheResult> => {
  const metadata = await getMetadata(request);
  if (!metadata) {
    return buildRemoteResult(request);
  }

  if (metadata.version !== request.version) {
    await removeCachedVideoRecord(metadata);
    return buildRemoteResult(request);
  }

  if (metadata.source === 'native-file' || metadata.nativeFilePath) {
    const nativeResult = await resolveFromNativeFile(metadata);
    if (nativeResult) {
      return nativeResult;
    }
  }

  const cacheApiResult = await resolveFromCacheApi(request, metadata);
  if (cacheApiResult) {
    return cacheApiResult;
  }

  await removeCachedVideoRecord(metadata);
  return buildRemoteResult(request);
};

const cleanupOldVideos = async (requiredSpace: number, keepVideoId?: string): Promise<void> => {
  const storeId = sanitizeSegment(getCurrentStoreId() || 'global');
  const videos = await cacheGetByIndex<CachedVideo>(STORES.VIDEOS, 'storeId', storeId);
  videos.sort((first, second) => first.cachedAt - second.cachedAt);

  const currentSize = await getVideoCacheSize();
  if (currentSize + requiredSpace <= MAX_CACHE_SIZE_BYTES) {
    return;
  }

  let freedSpace = 0;
  for (const video of videos) {
    if (video.id === keepVideoId) {
      continue;
    }

    await removeCachedVideoRecord(video);
    freedSpace += video.size || 0;

    if (currentSize - freedSpace + requiredSpace <= MAX_CACHE_SIZE_BYTES) {
      break;
    }
  }
};

const isCacheableUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const currentOrigin = window.location.origin;

    if (urlObj.origin === currentOrigin) {
      return true;
    }

    const allowedDomains = [
      'firebasestorage.googleapis.com',
      'firebasestorage.app',
      'storage.googleapis.com',
      'appspot.com',
      'cdn.jsdelivr.net',
      'unpkg.com',
      'cdnjs.cloudflare.com',
    ];

    return allowedDomains.some((domain) => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

const downloadToNativeFile = async (
  request: NormalizedVideoRequest,
  previousMetadata?: CachedVideo,
): Promise<VideoCacheResult | null> => {
  if (!isNativeFileCachingSupported() || isRemoteOnly(request.validationResult)) {
    return null;
  }

  try {
    const nativeDirectory = request.nativeFilePath.split('/').slice(0, -1).join('/');
    if (nativeDirectory) {
      await Filesystem.mkdir({
        directory: Directory.Data,
        path: nativeDirectory,
        recursive: true,
      });
    }

    const destinationUri = await Filesystem.getUri({
      directory: Directory.Data,
      path: request.nativeFilePath,
    });

    updateDownloadState(request.videoId, {
      progress: 5,
      source: 'native-file',
      isCached: false,
    });

    await cleanupOldVideos(previousMetadata?.size || 0, request.videoId);

    await FileTransfer.downloadFile({
      url: request.url,
      path: destinationUri.uri,
    });

    const stat = await Filesystem.stat({
      directory: Directory.Data,
      path: request.nativeFilePath,
    });

    const metadata = buildMetadata(request, {
      size: Number(stat.size || 0),
      source: 'native-file',
      nativeFilePath: request.nativeFilePath,
      nativeFileUri: destinationUri.uri,
      contentType: request.contentType,
    });

    await cacheSet(STORES.VIDEOS, metadata);
    updateDownloadState(request.videoId, {
      progress: 100,
      source: 'native-file',
      isCached: true,
    });

    return {
      videoUrl: Capacitor.convertFileSrc(destinationUri.uri),
      source: 'native-file',
      isCached: true,
      metadata,
    };
  } catch (error) {
    console.warn('[VideoCacheService] Native file caching failed, falling back to Cache API:', error);
    await removeNativeFileIfPresent(request.nativeFilePath);
    return null;
  }
};

const downloadToCacheApi = async (
  request: NormalizedVideoRequest,
  onProgress?: (progress: number) => void,
): Promise<VideoCacheResult | null> => {
  if (typeof caches === 'undefined') {
    return null;
  }

  if (isRemoteOnly(request.validationResult) || !isCacheableUrl(request.url)) {
    return buildRemoteResult(request);
  }

  const response = await fetch(request.url);
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > 0) {
    await cleanupOldVideos(contentLength, request.videoId);
  }

  let videoBlob: Blob;
  if (response.body && contentLength > 0) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedLength += value.length;
      const progress = Math.round((receivedLength / contentLength) * 100);
      updateDownloadState(request.videoId, {
        progress,
        source: 'cache-api',
        isCached: false,
      });
      onProgress?.(progress);
    }

    videoBlob = new Blob(chunks as BlobPart[], {
      type: request.contentType || response.headers.get('content-type') || 'video/mp4',
    });
  } else {
    videoBlob = await response.blob();
  }

  const cache = await getVideoCache();
  if (!cache) {
    return null;
  }

  await cache.put(request.cacheApiKey, new Response(videoBlob, {
    headers: {
      'Content-Type': videoBlob.type,
      'Content-Length': videoBlob.size.toString(),
    },
  }));

  const metadata = buildMetadata(request, {
    size: videoBlob.size,
    source: 'cache-api',
    cacheApiKey: request.cacheApiKey,
    contentType: videoBlob.type,
  });
  await cacheSet(STORES.VIDEOS, metadata);

  updateDownloadState(request.videoId, {
    progress: 100,
    source: 'cache-api',
    isCached: true,
  });

  return {
    videoUrl: storeObjectUrl(metadata.id, metadata.version, URL.createObjectURL(videoBlob)),
    source: 'cache-api',
    isCached: true,
    metadata,
  };
};

export const getVideoCacheSize = async (): Promise<number> => {
  try {
    const videos = await cacheGetAll<CachedVideo>(STORES.VIDEOS);
    return videos.reduce((total, video) => total + (video.size || 0), 0);
  } catch (error) {
    console.error('[VideoCacheService] Error getting cache size:', error);
    return 0;
  }
};

export const downloadVideo = async (
  input: VideoCacheRequestInput,
  onProgress?: (progress: number) => void,
): Promise<VideoCacheResult | null> => {
  const request = normalizeVideoRequest(input);
  if (!request) {
    return null;
  }

  const currentState = downloadStates.get(request.videoId);
  if (currentState?.isDownloading) {
    console.log('[VideoCacheService] Download already in progress:', request.videoId);
    return null;
  }

  updateDownloadState(request.videoId, {
    url: request.url,
    isDownloading: true,
    progress: 0,
    error: null,
    source: 'remote',
    isCached: false,
  });

  try {
    const previousMetadata = await getMetadata(request);
    if (previousMetadata && previousMetadata.version !== request.version) {
      await removeCachedVideoRecord(previousMetadata);
    }

    const resolved = await resolveCachedVideo(request);
    if (resolved.isCached) {
      updateDownloadState(request.videoId, {
        isDownloading: false,
        progress: 100,
        source: resolved.source,
        isCached: true,
      });
      return resolved;
    }

    if (isRemoteOnly(request.validationResult)) {
      updateDownloadState(request.videoId, {
        isDownloading: false,
        progress: 100,
        source: 'remote',
        isCached: false,
      });
      return buildRemoteResult(request, previousMetadata);
    }

    const nativeResult = await downloadToNativeFile(request, previousMetadata);
    if (nativeResult) {
      updateDownloadState(request.videoId, {
        isDownloading: false,
        progress: 100,
        source: nativeResult.source,
        isCached: nativeResult.isCached,
      });
      return nativeResult;
    }

    const cacheApiResult = await downloadToCacheApi(request, onProgress);
    if (cacheApiResult) {
      updateDownloadState(request.videoId, {
        isDownloading: false,
        progress: 100,
        source: cacheApiResult.source,
        isCached: cacheApiResult.isCached,
      });
      return cacheApiResult;
    }

    updateDownloadState(request.videoId, {
      isDownloading: false,
      progress: 100,
      source: 'remote',
      isCached: false,
    });
    return buildRemoteResult(request);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VideoCacheService] Download failed:', error);
    updateDownloadState(request.videoId, {
      isDownloading: false,
      error: errorMessage,
      source: 'remote',
      isCached: false,
    });
    return buildRemoteResult(request);
  }
};

export const getCachedVideo = async (input: VideoCacheRequestInput): Promise<VideoCacheResult | null> => {
  const request = normalizeVideoRequest(input);
  if (!request) {
    return null;
  }

  return resolveCachedVideo(request);
};

export const getCachedVideoUrl = async (input: VideoCacheRequestInput): Promise<string> => {
  const result = await getCachedVideo(input);
  return result?.videoUrl || toRequest(input).url;
};

export const isVideoCached = async (input: VideoCacheRequestInput): Promise<boolean> => {
  const result = await getCachedVideo(input);
  return result?.isCached ?? false;
};

export const removeVideoFromCache = async (input: VideoCacheRequestInput): Promise<void> => {
  const request = normalizeVideoRequest(input);
  if (!request) {
    return;
  }

  const metadata = await getMetadata(request);
  if (!metadata) {
    revokeVideoObjectURL(request.url);
    return;
  }

  await removeCachedVideoRecord(metadata);
  console.log('[VideoCacheService] Video removed from cache:', metadata.id);
};

export const removeVideoFromCacheById = async (videoId: string): Promise<void> => {
  const metadata = await cacheGet<CachedVideo>(STORES.VIDEOS, videoId);
  if (!metadata) {
    return;
  }
  await removeCachedVideoRecord(metadata);
};

export const clearVideoCache = async (): Promise<void> => {
  try {
    const videos = await cacheGetAll<CachedVideo>(STORES.VIDEOS);
    await Promise.all(videos.map((video) => removeCachedVideoRecord(video)));

    if (typeof caches !== 'undefined') {
      await caches.delete(VIDEO_CACHE_NAME);
    }

    revokeAllVideoObjectURLs();
    console.log('[VideoCacheService] Video cache cleared');
  } catch (error) {
    console.error('[VideoCacheService] Error clearing cache:', error);
  }
};

export const addDownloadListener = (
  input: VideoCacheRequestInput,
  listener: (state: DownloadState) => void,
): (() => void) => {
  const request = normalizeVideoRequest(input);
  if (!request) {
    return () => {};
  }

  if (!downloadListeners.has(request.videoId)) {
    downloadListeners.set(request.videoId, new Set());
  }

  downloadListeners.get(request.videoId)?.add(listener);

  const currentState = downloadStates.get(request.videoId);
  if (currentState) {
    listener(currentState);
  }

  return () => {
    const listeners = downloadListeners.get(request.videoId);
    if (!listeners) {
      return;
    }

    listeners.delete(listener);
    if (listeners.size === 0) {
      downloadListeners.delete(request.videoId);
      const state = downloadStates.get(request.videoId);
      if (state && !state.isDownloading) {
        downloadStates.delete(request.videoId);
      }
    }
  };
};

export const getDownloadState = (input: VideoCacheRequestInput): DownloadState | null => {
  const request = normalizeVideoRequest(input);
  if (!request) {
    return null;
  }
  return downloadStates.get(request.videoId) || null;
};

export const getVideoCacheStats = async (): Promise<{
  count: number;
  totalSize: number;
  maxSize: number;
  usagePercent: number;
}> => {
  const videos = await cacheGetAll<CachedVideo>(STORES.VIDEOS);
  const totalSize = videos.reduce((accumulator, video) => accumulator + (video.size || 0), 0);

  return {
    count: videos.length,
    totalSize,
    maxSize: MAX_CACHE_SIZE_BYTES,
    usagePercent: Math.round((totalSize / MAX_CACHE_SIZE_BYTES) * 100),
  };
};

export const revokeVideoObjectURL = (input: VideoCacheRequestInput): void => {
  const request = normalizeVideoRequest(input);
  if (!request) {
    return;
  }

  const existing = activeObjectURLs.get(request.videoId);
  if (!existing) {
    return;
  }

  URL.revokeObjectURL(existing.objectUrl);
  activeObjectURLs.delete(request.videoId);
  console.log('[VideoCacheService] Object URL revoked:', request.videoId);
};

export const revokeAllVideoObjectURLs = (): void => {
  activeObjectURLs.forEach((entry, videoId) => {
    URL.revokeObjectURL(entry.objectUrl);
    console.log('[VideoCacheService] Object URL revoked:', videoId);
  });
  activeObjectURLs.clear();
};

export default {
  download: downloadVideo,
  getCached: getCachedVideo,
  getCachedUrl: getCachedVideoUrl,
  isCached: isVideoCached,
  remove: removeVideoFromCache,
  removeById: removeVideoFromCacheById,
  clear: clearVideoCache,
  getStats: getVideoCacheStats,
  getSize: getVideoCacheSize,
  addDownloadListener,
  getDownloadState,
  isAvailable: isCacheAPIAvailable,
  shouldPreserveCacheStorageCache,
  revokeObjectURL: revokeVideoObjectURL,
  revokeAllObjectURLs: revokeAllVideoObjectURLs,
};
