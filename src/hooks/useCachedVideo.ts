/**
 * ============================================
 * useCachedVideo Hook
 * ============================================
 *
 * Resolves attract-screen videos from:
 * - native-file (preferred on native platforms)
 * - cache-api (browser fallback)
 * - remote (direct playback without offline cache)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  addDownloadListener,
  downloadVideo,
  getCachedVideo,
  isCacheAPIAvailable,
  isVideoCached,
  revokeVideoObjectURL,
  type VideoCacheRequest,
  type VideoCacheSource,
  type VideoValidationResult,
} from '@/services/videoCacheService';

export interface UseCachedVideoState {
  videoUrl: string | null;
  isCached: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: Error | string | null;
  cacheAvailable: boolean;
  source: VideoCacheSource | null;
}

export interface UseCachedVideoOptions {
  autoDownload?: boolean;
  useFallbackWhileDownloading?: boolean;
  cacheKey?: string | null;
  contentType?: string | null;
  validationResult?: VideoValidationResult;
}

const buildRequest = (
  url: string | undefined | null,
  options: UseCachedVideoOptions,
): VideoCacheRequest | null => {
  if (!url) {
    return null;
  }

  return {
    url,
    cacheKey: options.cacheKey,
    contentType: options.contentType,
    validationResult: options.validationResult,
  };
};

export const useCachedVideo = (
  url: string | undefined | null,
  options: UseCachedVideoOptions = {},
): UseCachedVideoState & { triggerDownload: () => void } => {
  const {
    autoDownload = true,
    useFallbackWhileDownloading = true,
    cacheKey,
    contentType,
    validationResult,
  } = options;

  const [state, setState] = useState<UseCachedVideoState>({
    videoUrl: null,
    isCached: false,
    isDownloading: false,
    downloadProgress: 0,
    error: null,
    cacheAvailable: isCacheAPIAvailable(),
    source: null,
  });

  const mountedRef = useRef(true);
  const downloadTriggeredRef = useRef(false);

  const currentRequest = useMemo(() => buildRequest(url, {
    cacheKey,
    contentType,
    validationResult,
  }), [cacheKey, contentType, url, validationResult]);

  const checkAndLoadVideo = useCallback(async () => {
    if (!currentRequest) {
      setState((prev) => ({
        ...prev,
        videoUrl: null,
        isCached: false,
        source: null,
      }));
      return;
    }

    try {
      const cached = await isVideoCached(currentRequest);
      const resolved = await getCachedVideo(currentRequest);

      if (!mountedRef.current) {
        return;
      }

      if (cached && resolved) {
        setState((prev) => ({
          ...prev,
          videoUrl: resolved.videoUrl,
          isCached: resolved.isCached,
          source: resolved.source,
          isDownloading: false,
          downloadProgress: 100,
          error: null,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        videoUrl: useFallbackWhileDownloading ? currentRequest.url : null,
        isCached: false,
        source: resolved?.source || 'remote',
        error: null,
      }));

      if (
        autoDownload &&
        !downloadTriggeredRef.current &&
        validationResult !== 'remote_only' &&
        validationResult !== 'cors_warning'
      ) {
        downloadTriggeredRef.current = true;
        void triggerDownload();
      }
    } catch (error) {
      console.error('[useCachedVideo] Error checking cache:', error);
      if (!mountedRef.current) {
        return;
      }

      setState((prev) => ({
        ...prev,
        videoUrl: currentRequest.url,
        isCached: false,
        source: 'remote',
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [autoDownload, currentRequest, useFallbackWhileDownloading, validationResult]);

  const triggerDownload = useCallback(async () => {
    if (!currentRequest || !isCacheAPIAvailable()) {
      return;
    }

    setState((prev) => ({
      ...prev,
      isDownloading: true,
      downloadProgress: 0,
      error: null,
      source: prev.source || 'remote',
    }));

    try {
      const result = await downloadVideo(currentRequest, (progress) => {
        if (!mountedRef.current) {
          return;
        }

        setState((prev) => ({
          ...prev,
          downloadProgress: progress,
        }));
      });

      if (!mountedRef.current || !result) {
        return;
      }

      setState((prev) => ({
        ...prev,
        videoUrl: result.videoUrl,
        isCached: result.isCached,
        source: result.source,
        isDownloading: false,
        downloadProgress: 100,
        error: result.isCached ? null : prev.error,
      }));
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setState((prev) => ({
        ...prev,
        videoUrl: currentRequest.url,
        isCached: false,
        source: 'remote',
        isDownloading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [currentRequest]);

  useEffect(() => {
    if (!currentRequest) {
      return;
    }

    const unsubscribe = addDownloadListener(currentRequest, (downloadState) => {
      if (!mountedRef.current) {
        return;
      }

      setState((prev) => ({
        ...prev,
        isDownloading: downloadState.isDownloading,
        downloadProgress: downloadState.progress,
        error: downloadState.error,
        source: downloadState.source,
        isCached: downloadState.isCached,
      }));
    });

    return unsubscribe;
  }, [currentRequest]);

  useEffect(() => {
    downloadTriggeredRef.current = false;
    void checkAndLoadVideo();
  }, [checkAndLoadVideo]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (currentRequest) {
        revokeVideoObjectURL(currentRequest);
      }
    };
  }, [currentRequest]);

  return {
    ...state,
    triggerDownload,
  };
};

export const useVideoUrl = (
  url: string | undefined | null,
  options: Omit<UseCachedVideoOptions, 'autoDownload'> = {},
): string | null => {
  const { videoUrl } = useCachedVideo(url, { ...options, autoDownload: true });
  return videoUrl;
};

export default useCachedVideo;
