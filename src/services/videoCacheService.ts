/**
 * ============================================
 * Video Cache Service
 * ============================================
 * 
 * Gerencia cache de vídeos usando Cache API.
 * Download único com versionamento e fallback.
 * 
 * Características:
 * - Download em background (não bloqueia UI)
 * - Versionamento por URL hash
 * - Controle de tamanho máximo
 * - Fallback para URL original se cache falhar
 */

import { cacheSet, cacheGet, cacheDelete, cacheGetByIndex, STORES, CachedVideo } from './cacheService';
import { getCurrentStoreId } from './firebase';

const VIDEO_CACHE_NAME = 'kiosk-video-cache-v1';
const MAX_CACHE_SIZE_MB = 500; // 500MB máximo para vídeos
const MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_MB * 1024 * 1024;

// Estado do download
interface DownloadState {
  url: string;
  progress: number;
  isDownloading: boolean;
  error: string | null;
}

const downloadStates: Map<string, DownloadState> = new Map();
const downloadListeners: Map<string, Set<(state: DownloadState) => void>> = new Map();

// 🔧 v4.0.7: Tracking de Object URLs para evitar memory leaks
const activeObjectURLs: Map<string, string> = new Map(); // videoId -> objectURL

/**
 * Gera ID único para vídeo baseado em URL
 */
const generateVideoId = (url: string): string => {
  // Hash simples da URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `video_${Math.abs(hash).toString(16)}`;
};

/**
 * Gera versão do vídeo baseado em URL e timestamp
 */
const generateVersion = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // Remove query params que mudam (como cache busters)
    urlObj.search = '';
    return btoa(urlObj.toString()).slice(0, 16);
  } catch {
    // Fallback para URLs inválidas - usa hash simples da string
    return btoa(url.slice(0, 50)).slice(0, 16);
  }
};

/**
 * Notifica listeners sobre mudança de estado
 */
const notifyDownloadListeners = (videoId: string, state: DownloadState) => {
  const listeners = downloadListeners.get(videoId);
  if (listeners) {
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error('[VideoCacheService] Error in download listener:', error);
      }
    });
  }
};

/**
 * Atualiza estado do download
 */
const updateDownloadState = (videoId: string, partial: Partial<DownloadState>) => {
  const current = downloadStates.get(videoId) || {
    url: '',
    progress: 0,
    isDownloading: false,
    error: null,
  };
  const updated = { ...current, ...partial };
  downloadStates.set(videoId, updated);
  notifyDownloadListeners(videoId, updated);
};

/**
 * Verifica se Cache API está disponível
 */
export const isCacheAPIAvailable = (): boolean => {
  return typeof caches !== 'undefined';
};

/**
 * Obtém o cache de vídeos
 */
const getVideoCache = async (): Promise<Cache | null> => {
  if (!isCacheAPIAvailable()) {
    return null;
  }
  
  try {
    return await caches.open(VIDEO_CACHE_NAME);
  } catch (error) {
    console.error('[VideoCacheService] Error opening cache:', error);
    return null;
  }
};

/**
 * Calcula tamanho total do cache de vídeos
 */
export const getVideoCacheSize = async (): Promise<number> => {
  try {
    const videos = await cacheGetByIndex<CachedVideo>(STORES.VIDEOS, 'cachedAt', IDBKeyRange.lowerBound(0));
    return videos.reduce((total, v) => total + (v.size || 0), 0);
  } catch (error) {
    console.error('[VideoCacheService] Error getting cache size:', error);
    return 0;
  }
};

/**
 * Limpa vídeos antigos se necessário para liberar espaço
 */
const cleanupOldVideos = async (requiredSpace: number): Promise<void> => {
  const storeId = getCurrentStoreId() || '';
  const videos = await cacheGetByIndex<CachedVideo>(STORES.VIDEOS, 'storeId', storeId);
  
  // Ordena por data de cache (mais antigos primeiro)
  videos.sort((a, b) => a.cachedAt - b.cachedAt);
  
  let freedSpace = 0;
  const currentSize = await getVideoCacheSize();
  
  if (currentSize + requiredSpace <= MAX_CACHE_SIZE_BYTES) {
    return; // Espaço suficiente
  }

  const cache = await getVideoCache();
  
  for (const video of videos) {
    if (freedSpace >= requiredSpace) break;
    
    // Remove do Cache API
    if (cache) {
      await cache.delete(video.url);
    }
    
    // Remove do IndexedDB
    await cacheDelete(STORES.VIDEOS, video.id);
    
    freedSpace += video.size || 0;
    console.log(`[VideoCacheService] Removed old video: ${video.id}, freed ${video.size} bytes`);
  }
};

/**
 * Verifica se a URL é do mesmo domínio (same-origin) ou de um CDN permitido
 * URLs externas geralmente bloqueiam CORS para fetch
 */
const isCacheableUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const currentOrigin = window.location.origin;
    
    // Same-origin sempre pode ser cacheado
    if (urlObj.origin === currentOrigin) {
      return true;
    }
    
    // CDNs conhecidos que suportam CORS
    const allowedDomains = [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      'cdn.jsdelivr.net',
      'unpkg.com',
      'cdnjs.cloudflare.com',
      // Adicione outros CDNs conforme necessário
    ];
    
    return allowedDomains.some(domain => urlObj.hostname.endsWith(domain));
  } catch {
    return false;
  }
};

/**
 * Baixa vídeo e armazena em cache
 * NOTA: Vídeos de domínios externos (cross-origin) geralmente não podem ser
 * baixados via fetch devido a restrições de CORS. Nesse caso, a URL original
 * é retornada e o elemento <video> carrega diretamente (browsers permitem isso).
 */
export const downloadVideo = async (
  url: string,
  onProgress?: (progress: number) => void
): Promise<string | null> => {
  const videoId = generateVideoId(url);
  const version = generateVersion(url);
  const storeId = getCurrentStoreId() || '';

  // Verifica se já está em download
  const currentState = downloadStates.get(videoId);
  if (currentState?.isDownloading) {
    console.log('[VideoCacheService] Download already in progress:', videoId);
    return null;
  }

  // Verifica se a URL pode ser cacheada (CORS)
  if (!isCacheableUrl(url)) {
    console.log('[VideoCacheService] URL externa (CORS), usando diretamente:', url);
    // Não tenta download, retorna URL original
    // O elemento <video> pode carregar cross-origin diretamente
    return url;
  }

  updateDownloadState(videoId, { url, isDownloading: true, progress: 0, error: null });

  try {
    // Verifica se já está em cache com mesma versão
    const cached = await cacheGet<CachedVideo>(STORES.VIDEOS, videoId);
    if (cached && cached.version === version) {
      console.log('[VideoCacheService] Video already cached:', videoId);
      updateDownloadState(videoId, { isDownloading: false, progress: 100 });
      return getCachedVideoUrl(url);
    }

    // Baixa o vídeo
    console.log('[VideoCacheService] Downloading video:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

    // Limpa espaço se necessário
    if (totalSize > 0) {
      await cleanupOldVideos(totalSize);
    }

    // Lê com progresso se possível
    let videoBlob: Blob;
    
    if (response.body && totalSize > 0) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        const progress = Math.round((receivedLength / totalSize) * 100);
        updateDownloadState(videoId, { progress });
        onProgress?.(progress);
      }

      videoBlob = new Blob(chunks as unknown as BlobPart[], { type: response.headers.get('content-type') || 'video/mp4' });
    } else {
      videoBlob = await response.blob();
    }

    // Armazena no Cache API
    const cache = await getVideoCache();
    if (cache) {
      const cacheResponse = new Response(videoBlob, {
        headers: {
          'Content-Type': videoBlob.type,
          'Content-Length': videoBlob.size.toString(),
        },
      });
      await cache.put(url, cacheResponse);
    }

    // Armazena metadados no IndexedDB
    const videoMeta: CachedVideo = {
      id: videoId,
      url,
      version,
      cachedAt: Date.now(),
      size: videoBlob.size,
      storeId,
    };
    await cacheSet(STORES.VIDEOS, videoMeta);

    updateDownloadState(videoId, { isDownloading: false, progress: 100 });
    console.log('[VideoCacheService] Video cached successfully:', videoId, 'size:', videoBlob.size);

    // 🔧 v4.0.7: Revogar URL anterior se existir (evita memory leak)
    const previousUrl = activeObjectURLs.get(videoId);
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
    
    const objectUrl = URL.createObjectURL(videoBlob);
    activeObjectURLs.set(videoId, objectUrl);
    return objectUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VideoCacheService] Download failed:', error);
    updateDownloadState(videoId, { isDownloading: false, error: errorMessage });
    return null;
  }
};

/**
 * Obtém URL do vídeo em cache (ou URL original como fallback)
 */
export const getCachedVideoUrl = async (url: string): Promise<string> => {
  const videoId = generateVideoId(url);

  try {
    // Verifica se está em cache
    const cached = await cacheGet<CachedVideo>(STORES.VIDEOS, videoId);
    if (!cached) {
      return url; // Fallback para URL original
    }

    // Tenta obter do Cache API
    const cache = await getVideoCache();
    if (cache) {
      const response = await cache.match(url);
      if (response) {
        const blob = await response.blob();
        
        // 🔧 v4.0.7: Revogar URL anterior se existir (evita memory leak)
        const previousUrl = activeObjectURLs.get(videoId);
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        
        const objectUrl = URL.createObjectURL(blob);
        activeObjectURLs.set(videoId, objectUrl);
        return objectUrl;
      }
    }

    return url; // Fallback para URL original
  } catch (error) {
    console.error('[VideoCacheService] Error getting cached video:', error);
    return url; // Fallback para URL original
  }
};

/**
 * Verifica se vídeo está em cache
 */
export const isVideoCached = async (url: string): Promise<boolean> => {
  const videoId = generateVideoId(url);
  
  try {
    const cached = await cacheGet<CachedVideo>(STORES.VIDEOS, videoId);
    if (!cached) return false;

    // Verifica se ainda existe no Cache API
    const cache = await getVideoCache();
    if (cache) {
      const response = await cache.match(url);
      return !!response;
    }

    return false;
  } catch (error) {
    return false;
  }
};

/**
 * Remove vídeo do cache
 */
export const removeVideoFromCache = async (url: string): Promise<void> => {
  const videoId = generateVideoId(url);

  try {
    // Remove do Cache API
    const cache = await getVideoCache();
    if (cache) {
      await cache.delete(url);
    }

    // Remove do IndexedDB
    await cacheDelete(STORES.VIDEOS, videoId);
    
    console.log('[VideoCacheService] Video removed from cache:', videoId);
  } catch (error) {
    console.error('[VideoCacheService] Error removing video:', error);
  }
};

/**
 * Limpa todo o cache de vídeos
 */
export const clearVideoCache = async (): Promise<void> => {
  try {
    // Limpa Cache API
    if (isCacheAPIAvailable()) {
      await caches.delete(VIDEO_CACHE_NAME);
    }

    // Limpa IndexedDB
    const videos = await cacheGetByIndex<CachedVideo>(STORES.VIDEOS, 'cachedAt', IDBKeyRange.lowerBound(0));
    for (const video of videos) {
      await cacheDelete(STORES.VIDEOS, video.id);
    }

    console.log('[VideoCacheService] Video cache cleared');
  } catch (error) {
    console.error('[VideoCacheService] Error clearing cache:', error);
  }
};

/**
 * Registra listener para progresso de download
 */
export const addDownloadListener = (
  url: string,
  listener: (state: DownloadState) => void
): () => void => {
  const videoId = generateVideoId(url);
  
  if (!downloadListeners.has(videoId)) {
    downloadListeners.set(videoId, new Set());
  }
  
  downloadListeners.get(videoId)!.add(listener);

  // Notifica com estado atual se existir
  const currentState = downloadStates.get(videoId);
  if (currentState) {
    listener(currentState);
  }

  return () => {
    const listeners = downloadListeners.get(videoId);
    if (listeners) {
      listeners.delete(listener);
      // Limpa o Set se não houver mais listeners
      if (listeners.size === 0) {
        downloadListeners.delete(videoId);
        // Também limpa o estado se download já completou
        const state = downloadStates.get(videoId);
        if (state && !state.isDownloading) {
          downloadStates.delete(videoId);
        }
      }
    }
  };
};

/**
 * Obtém estado atual do download
 */
export const getDownloadState = (url: string): DownloadState | null => {
  const videoId = generateVideoId(url);
  return downloadStates.get(videoId) || null;
};

/**
 * Obtém estatísticas do cache de vídeos
 */
export const getVideoCacheStats = async (): Promise<{
  count: number;
  totalSize: number;
  maxSize: number;
  usagePercent: number;
}> => {
  const videos = await cacheGetByIndex<CachedVideo>(STORES.VIDEOS, 'cachedAt', IDBKeyRange.lowerBound(0));
  const totalSize = videos.reduce((acc, v) => acc + (v.size || 0), 0);
  
  return {
    count: videos.length,
    totalSize,
    maxSize: MAX_CACHE_SIZE_BYTES,
    usagePercent: Math.round((totalSize / MAX_CACHE_SIZE_BYTES) * 100),
  };
};

/**
 * 🔧 v4.0.7: Revoga um Object URL específico para liberar memória
 * Chamar quando o vídeo não é mais necessário (ex: componente desmontando)
 */
export const revokeVideoObjectURL = (url: string): void => {
  const videoId = generateVideoId(url);
  const objectUrl = activeObjectURLs.get(videoId);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    activeObjectURLs.delete(videoId);
    console.log('[VideoCacheService] Object URL revoked:', videoId);
  }
};

/**
 * 🔧 v4.0.7: Revoga todos os Object URLs ativos para liberar memória
 * Útil ao sair da tela de atração ou resetar o app
 */
export const revokeAllVideoObjectURLs = (): void => {
  activeObjectURLs.forEach((objectUrl, videoId) => {
    URL.revokeObjectURL(objectUrl);
    console.log('[VideoCacheService] Object URL revoked:', videoId);
  });
  activeObjectURLs.clear();
  console.log('[VideoCacheService] All Object URLs revoked');
};

export default {
  download: downloadVideo,
  getCachedUrl: getCachedVideoUrl,
  isCached: isVideoCached,
  remove: removeVideoFromCache,
  clear: clearVideoCache,
  getStats: getVideoCacheStats,
  getSize: getVideoCacheSize,
  addDownloadListener,
  getDownloadState,
  isAvailable: isCacheAPIAvailable,
  revokeObjectURL: revokeVideoObjectURL,
  revokeAllObjectURLs: revokeAllVideoObjectURLs,
};
