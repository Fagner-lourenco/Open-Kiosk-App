import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Hand } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { getFirebaseDb, getCurrentStoreId, getCurrentFranchiseId } from '@/services/firebase';
import { AttractVideoSettings } from '@/types/store';
import type { AttractVideoConfig } from '../../shared/types/store';
import { useCachedVideo } from '@/hooks/useCachedVideo';

type AttractScreenProps = {
  visible: boolean;
  onStart: () => void;
  title?: string;
  subtitle?: string;
  /** Video config from store doc (canonical source). Falls back to sub-doc listener if absent. */
  attractVideoConfig?: AttractVideoConfig;
};

const AttractScreen = ({
  visible,
  onStart,
  title,
  subtitle,
  attractVideoConfig,
}: AttractScreenProps) => {
  const { t } = useTranslation();
  const startBtnRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [legacyVideoSettings, setLegacyVideoSettings] = useState<AttractVideoSettings | null>(null);
  const [shouldRender, setShouldRender] = useState(visible);
  const [isEntering, setIsEntering] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const startTriggeredRef = useRef(false);

  // Canonical source: attractVideoConfig from store doc (via props/context)
  // Fallback: legacy sub-doc listener (settings/attract_video) for migration period
  const videoSettings: AttractVideoSettings | null = attractVideoConfig
    ? {
        isEnabled: attractVideoConfig.isEnabled,
        videoUrl: attractVideoConfig.videoUrl,
        displayTitle: attractVideoConfig.displayTitle,
        displaySubtitle: attractVideoConfig.displaySubtitle,
        videoOpacity: attractVideoConfig.videoOpacity,
        videoCoverMode: attractVideoConfig.videoCoverMode,
      }
    : legacyVideoSettings;

  // Hook para cache de vídeo - baixa uma vez, usa do cache depois
  const {
    videoUrl: cachedVideoUrl,
    isCached,
    isDownloading,
    downloadProgress
  } = useCachedVideo(
    videoSettings?.videoUrl && videoSettings.isEnabled ? videoSettings.videoUrl : null,
    { autoDownload: true, useFallbackWhileDownloading: true }
  );

  // Título e subtítulo: prioridade props > Firebase > i18n
  const displayTitle = title || videoSettings?.displayTitle || t('attract.title');
  const displaySubtitle = subtitle || videoSettings?.displaySubtitle || t('attract.subtitle');

  // Legacy sub-doc listener: only active when attractVideoConfig prop is not provided
  // This ensures backward compat during migration (before PR4 moves data to store doc)
  useEffect(() => {
    // Skip if canonical config is available from store doc
    if (attractVideoConfig) return;

    const storeId = getCurrentStoreId();
    if (!storeId) return;

    const franchiseId = getCurrentFranchiseId();
    if (!franchiseId) return;

    const db = getFirebaseDb();
    const videoDocRef = doc(
      db,
      'franchises',
      franchiseId,
      'stores',
      storeId,
      'settings',
      'attract_video'
    );

    const unsubscribe = onSnapshot(
      videoDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as AttractVideoSettings;
          setLegacyVideoSettings(data);
        } else {
          setLegacyVideoSettings(null);
        }
      },
      (error) => {
        console.error('Error listening to attract video settings:', error);
      }
    );

    return () => unsubscribe();
  }, [attractVideoConfig]);

  // Autoplay defensivo para Android/Capacitor WebView
  useEffect(() => {
    if (visible && cachedVideoUrl && videoSettings?.isEnabled) {
      videoRef.current?.play().catch(() => {
        // Silently ignore - autoplay may be blocked without user gesture
      });
    }
  }, [visible, cachedVideoUrl, videoSettings?.isEnabled]);

  useEffect(() => {
    if (visible) {
      // Focus CTA for keyboard users
      startBtnRef.current?.focus();
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      setIsExiting(false);
      setIsEntering(true);
      startTriggeredRef.current = false;

      const rafId = window.requestAnimationFrame(() => {
        setIsEntering(false);
      });

      return () => window.cancelAnimationFrame(rafId);
    }

    setIsEntering(false);

    // Fade-out suave quando a tela é escondida externamente
    const tId = window.setTimeout(() => {
      setShouldRender(false);
      setIsExiting(false);
      startTriggeredRef.current = false;
    }, 200);

    return () => window.clearTimeout(tId);
  }, [visible]);

  if (!shouldRender) return null;

  const handleStart = () => {
    if (startTriggeredRef.current) return;
    startTriggeredRef.current = true;
    setIsExiting(true);
    window.setTimeout(() => {
      onStart();
    }, 180);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleStart();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('attract.kioskStartScreen')}
      className={
        "fixed inset-0 z-[9999] flex items-center justify-center attract-fade " +
        (visible && !isExiting && !isEntering
          ? "opacity-100"
          : "opacity-0")
      }
      onKeyDown={onKeyDown}
    >
      {/* Base gradient background - z-index 0 */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50 z-0" />

      {/* Video background layer - z-index 1, acima do gradiente */}
      {/* Usa vídeo em cache quando disponível, fallback para URL original */}
      {cachedVideoUrl && videoSettings?.isEnabled && (
        <>
          <video
            key={cachedVideoUrl}
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
            style={{
              objectFit: videoSettings.videoCoverMode === 'contain' ? 'contain' : 'cover',
              opacity: videoSettings.videoOpacity ?? 0.4,
            }}
            onError={(e) => {
              console.error('Error loading attract video:', e);
            }}
          >
            <source src={cachedVideoUrl} type="video/mp4" />
          </video>

          {/* Indicador de download/cache (apenas em dev ou debug) */}
          {isDownloading && (
            <div className="absolute bottom-4 right-4 z-[2] bg-black/60 text-white text-xs px-2 py-1 rounded">
              Caching video: {downloadProgress}%
            </div>
          )}
          {isCached && !isDownloading && process.env.NODE_ENV === 'development' && (
            <div className="absolute bottom-4 right-4 z-[2] bg-green-600/60 text-white text-xs px-2 py-1 rounded">
              ✓ Cached
            </div>
          )}
        </>
      )}

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-100/20 to-purple-100/20 rounded-full blur-3xl" />
      </div>

      {/* Main content */}
      <div className="relative text-center px-8 max-w-2xl z-20">
        {/* Icon with animation */}
        <div className="flex items-center justify-center mb-2">
          <div className="relative">
            {/* Glow quente discreto atrás da caneca */}
            <div className="absolute inset-0 blur-3xl opacity-40" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.6) 0%, rgba(245,158,11,0.3) 50%, transparent 70%)' }} />

            {/* Caneca sem círculo, apenas imagem com sombra */}
            <img
              src="/attract/beer-mug.png"
              alt={t('attract.title')}
              className="relative object-contain attract-mug"
              style={{
                height: '31vh',
                maxHeight: '33vh',
                width: 'auto',
                filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.30)) drop-shadow(0 0 18px rgba(255, 176, 64, 0.24))'
              }}
              loading="eager"
              decoding="async"
              draggable={false}
            />

            {/* Bolhas discretas (substitui o sparkle) */}
            <div className="pointer-events-none absolute inset-0 overflow-visible">
              <div className="attract-bubble" style={{ '--x': '28%', '--d': '0s', '--t': '6.2s', '--s': '5px' } as React.CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '42%', '--d': '1.2s', '--t': '5.6s', '--s': '6px' } as React.CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '56%', '--d': '0.6s', '--t': '6.8s', '--s': '4px' } as React.CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '68%', '--d': '1.8s', '--t': '5.9s', '--s': '5px' } as React.CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '76%', '--d': '2.4s', '--t': '6.4s', '--s': '3px' } as React.CSSProperties} />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mt-2 mb-3 tracking-tight leading-tight">
          {displayTitle}
        </h1>

        {/* Subtitle */}
        <p className="text-xl sm:text-2xl text-gray-600/75 mb-7 font-medium">
          {displaySubtitle}
        </p>

        {/* CTA Button */}
        <div className="flex items-center justify-center">
          <div className="relative">
            {/* Glow sutil animado */}
            <div className="pointer-events-none absolute -inset-3 rounded-2xl bg-blue-500/20 blur-2xl animate-pulse" />

            <Button
              ref={startBtnRef}
              className="relative bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-xl shadow-blue-500/30 transition-all duration-300 hover:scale-[1.04] hover:shadow-2xl hover:shadow-blue-500/35 flex items-center justify-center gap-3"
              style={{ width: '320px', height: '76px', fontSize: '22px', fontWeight: '600', borderRadius: '12px' }}
              onClick={(e) => {
                e.stopPropagation();
                handleStart();
              }}
            >
              <Hand className="w-7 h-7" />
              {t('attract.start')}
            </Button>
          </div>
        </div>

        {/* Keyboard hint */}
        <p className="text-xs text-gray-400/60 mt-10 font-light">
          {t('attract.keyboardHint')}
        </p>
      </div>
    </div>
  );
};

export default AttractScreen;
