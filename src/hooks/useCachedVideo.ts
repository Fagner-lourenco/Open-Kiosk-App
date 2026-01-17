/**
 * ============================================
 * useCachedVideo Hook
 * ============================================
 * 
 * Hook para carregar vídeos com cache automático.
 * Download em background, progresso em tempo real.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  downloadVideo, 
  getCachedVideoUrl, 
  isVideoCached, 
  addDownloadListener,
  isCacheAPIAvailable,
} from '@/services/videoCacheService';

export interface UseCachedVideoState {
  /** URL para usar no elemento <video> */
  videoUrl: string | null;
  
  /** Se o vídeo está em cache local */
  isCached: boolean;
  
  /** Se está baixando o vídeo */
  isDownloading: boolean;
  
  /** Progresso do download (0-100) */
  downloadProgress: number;
  
  /** Erro no download */
  error: string | null;
  
  /** Se o cache API está disponível */
  cacheAvailable: boolean;
}

export interface UseCachedVideoOptions {
  /** Baixar automaticamente se não estiver em cache */
  autoDownload?: boolean;
  
  /** Usar URL original enquanto baixa (default: true) */
  useFallbackWhileDownloading?: boolean;
}

/**
 * Hook para gerenciar vídeo com cache
 */
export const useCachedVideo = (
  url: string | undefined | null,
  options: UseCachedVideoOptions = {}
): UseCachedVideoState & { triggerDownload: () => void } => {
  const {
    autoDownload = true,
    useFallbackWhileDownloading = true,
  } = options;

  const [state, setState] = useState<UseCachedVideoState>({
    videoUrl: null,
    isCached: false,
    isDownloading: false,
    downloadProgress: 0,
    error: null,
    cacheAvailable: isCacheAPIAvailable(),
  });

  const mountedRef = useRef(true);
  const downloadTriggeredRef = useRef(false);

  // Verifica cache e carrega URL
  const checkAndLoadVideo = useCallback(async () => {
    if (!url) {
      setState((prev) => ({ ...prev, videoUrl: null, isCached: false }));
      return;
    }

    try {
      const cached = await isVideoCached(url);
      
      if (cached) {
        const cachedUrl = await getCachedVideoUrl(url);
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            videoUrl: cachedUrl,
            isCached: true,
            isDownloading: false,
            downloadProgress: 100,
            error: null,
          }));
        }
        return;
      }

      // Não está em cache
      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          videoUrl: useFallbackWhileDownloading ? url : null,
          isCached: false,
        }));
      }

      // Auto-download se habilitado
      if (autoDownload && !downloadTriggeredRef.current) {
        downloadTriggeredRef.current = true;
        triggerDownload();
      }
    } catch (error) {
      console.error('[useCachedVideo] Error checking cache:', error);
      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          videoUrl: url, // Fallback para URL original
          isCached: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    }
  }, [url, autoDownload, useFallbackWhileDownloading]);

  // Trigger download manual
  const triggerDownload = useCallback(async () => {
    if (!url || !isCacheAPIAvailable()) {
      return;
    }

    setState((prev) => ({
      ...prev,
      isDownloading: true,
      downloadProgress: 0,
      error: null,
    }));

    try {
      const cachedUrl = await downloadVideo(url, (progress) => {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, downloadProgress: progress }));
        }
      });

      if (mountedRef.current) {
        if (cachedUrl) {
          setState((prev) => ({
            ...prev,
            videoUrl: cachedUrl,
            isCached: true,
            isDownloading: false,
            downloadProgress: 100,
            error: null,
          }));
        } else {
          // Download falhou, usa URL original
          setState((prev) => ({
            ...prev,
            videoUrl: url,
            isDownloading: false,
            error: 'Download failed',
          }));
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          videoUrl: url, // Fallback
          isDownloading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    }
  }, [url]);

  // Listener para progresso de download
  useEffect(() => {
    if (!url) return;

    const unsubscribe = addDownloadListener(url, (downloadState) => {
      if (mountedRef.current) {
        setState((prev) => ({
          ...prev,
          isDownloading: downloadState.isDownloading,
          downloadProgress: downloadState.progress,
          error: downloadState.error,
        }));
      }
    });

    return unsubscribe;
  }, [url]);

  // Carrega vídeo quando URL muda
  useEffect(() => {
    downloadTriggeredRef.current = false;
    checkAndLoadVideo();
  }, [url, checkAndLoadVideo]);

  // Cleanup de Blob URLs para evitar memory leak
  // CRÍTICO: Cada URL.createObjectURL() aloca memória que não é liberada automaticamente
  useEffect(() => {
    const currentUrl = state.videoUrl;
    
    return () => {
      // Revogar apenas Blob URLs (começam com 'blob:')
      if (currentUrl && currentUrl.startsWith('blob:')) {
        console.log('[useCachedVideo] Revoking blob URL:', currentUrl.substring(0, 50));
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [state.videoUrl]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    ...state,
    triggerDownload,
  };
};

/**
 * Hook simplificado que apenas retorna a URL (cached ou original)
 */
export const useVideoUrl = (url: string | undefined | null): string | null => {
  const { videoUrl } = useCachedVideo(url, { autoDownload: true });
  return videoUrl;
};

export default useCachedVideo;
