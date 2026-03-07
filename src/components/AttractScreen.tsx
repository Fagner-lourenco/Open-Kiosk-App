import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Hand } from 'lucide-react';
import { useTranslation } from '@/i18n';
import type { AttractVideoConfig } from '../../shared/types/store';
import { useCachedVideo } from '@/hooks/useCachedVideo';
import { unlockAudio } from '@/hooks/useAudioVoice';

type AttractScreenProps = {
  visible: boolean;
  onStart: () => void;
  title?: string;
  subtitle?: string;
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
  const [shouldRender, setShouldRender] = useState(visible);
  const [isEntering, setIsEntering] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const startTriggeredRef = useRef(false);

  const videoSettings: AttractVideoConfig | null = attractVideoConfig ?? null;

  const {
    videoUrl: cachedVideoUrl,
    isCached,
    isDownloading,
    downloadProgress,
  } = useCachedVideo(
    videoSettings?.videoUrl && videoSettings.isEnabled ? videoSettings.videoUrl : null,
    { autoDownload: true, useFallbackWhileDownloading: true }
  );

  const displayTitle = title || videoSettings?.displayTitle || t('attract.title');
  const displaySubtitle = subtitle || videoSettings?.displaySubtitle || t('attract.subtitle');

  // Whether video is actively playing (controls conditional rendering of heavy decorations)
  const hasVideo = !!(cachedVideoUrl && videoSettings?.isEnabled);

  // Swap video src via ref instead of remounting with key={url}
  const prevVideoUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !cachedVideoUrl || !videoSettings?.isEnabled) return;

    const tryPlay = () => {
      if (visible) {
        vid.play().catch(() => {
          // Autoplay can be blocked without user gesture.
        });
      }
    };

    if (prevVideoUrlRef.current !== cachedVideoUrl) {
      prevVideoUrlRef.current = cachedVideoUrl;
      vid.src = cachedVideoUrl;
      // Wait for enough data before playing (avoids race on slow GPUs)
      vid.addEventListener('canplay', tryPlay, { once: true });
      vid.load();
    } else {
      tryPlay();
    }

    return () => {
      vid.removeEventListener('canplay', tryPlay);
    };
  }, [visible, cachedVideoUrl, videoSettings?.isEnabled]);

  useEffect(() => {
    if (visible) {
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
    // Desbloquear contexto de áudio do Android WebView (silencioso, exige gesto do usuário)
    unlockAudio();
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
        'fixed inset-0 z-[9999] flex items-center justify-center attract-fade ' +
        (visible && !isExiting && !isEntering ? 'opacity-100' : 'opacity-0')
      }
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-amber-50 z-0" />

      {/* Video element always mounted when enabled — src swapped via ref to avoid remount */}
      {hasVideo && (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
            style={{
              objectFit: videoSettings!.videoCoverMode === 'contain' ? 'contain' : 'cover',
              opacity: videoSettings!.videoOpacity ?? 0.4,
            }}
            onError={(e) => {
              console.error('Error loading attract video:', e);
            }}
          />

          {isDownloading && (
            <div className="absolute bottom-4 right-4 z-[2] bg-black/60 text-white text-xs px-2 py-1 rounded">
              Caching video: {downloadProgress}%
            </div>
          )}
          {isCached && !isDownloading && process.env.NODE_ENV === 'development' && (
            <div className="absolute bottom-4 right-4 z-[2] bg-green-600/60 text-white text-xs px-2 py-1 rounded">
              Cached
            </div>
          )}
        </>
      )}

      {/* Decorative blur orbs — hidden when video is active (saves ~60% GPU compositing budget) */}
      {!hasVideo && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-amber-200/30 rounded-full blur-xl animate-pulse" />
          <div
            className="absolute bottom-20 right-10 w-96 h-96 bg-yellow-200/20 rounded-full blur-xl animate-pulse"
            style={{ animationDelay: '1s' }}
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-amber-100/20 to-yellow-100/20 rounded-full blur-xl" />
        </div>
      )}

      <div className="relative text-center px-8 max-w-2xl z-20">
        <div className="flex items-center justify-center mb-2">
          <div className="relative">
            {/* Glow behind mug — lighter blur when video active to reduce GPU load */}
            <div
              className={'absolute inset-0 opacity-40 ' + (hasVideo ? 'blur-lg' : 'blur-xl')}
              style={{
                background:
                  'radial-gradient(circle, rgba(251,191,36,0.6) 0%, rgba(245,158,11,0.3) 50%, transparent 70%)',
              }}
            />

            <img
              src="/attract/beer-mug.png"
              alt={t('attract.title')}
              className="relative object-contain attract-mug"
              style={{
                height: '31vh',
                maxHeight: '33vh',
                width: 'auto',
                filter:
                  'drop-shadow(0 18px 34px rgba(0,0,0,0.30)) drop-shadow(0 0 18px rgba(255, 176, 64, 0.24))',
              }}
              loading="eager"
              decoding="async"
              draggable={false}
            />

            <div className="pointer-events-none absolute inset-0 overflow-visible">
              <div className="attract-bubble" style={{ '--x': '28%', '--d': '0s', '--t': '6.2s', '--s': '5px' } as React.CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '42%', '--d': '1.2s', '--t': '5.6s', '--s': '6px' } as React.CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '56%', '--d': '0.6s', '--t': '6.8s', '--s': '4px' } as React.CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '68%', '--d': '1.8s', '--t': '5.9s', '--s': '5px' } as React.CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '76%', '--d': '2.4s', '--t': '6.4s', '--s': '3px' } as React.CSSProperties} />
            </div>
          </div>
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold text-gray-800 mt-2 mb-3 tracking-tight leading-tight">
          {displayTitle}
        </h1>

        <p className="text-xl sm:text-2xl text-gray-500/80 mb-7 font-medium">{displaySubtitle}</p>

        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="pointer-events-none absolute -inset-3 rounded-2xl bg-amber-500/20 blur-xl attract-btn-glow" />

            <Button
              ref={startBtnRef}
              className="relative bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-xl shadow-amber-500/30 transition-all duration-300 hover:scale-[1.04] hover:shadow-2xl hover:shadow-amber-500/35 flex items-center justify-center gap-3"
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

        <p className="text-xs text-gray-400/50 mt-10 font-light">{t('attract.keyboardHint')}</p>
      </div>
    </div>
  );
};

export default AttractScreen;
