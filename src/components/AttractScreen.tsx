import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Hand } from 'lucide-react';
import { useTranslation } from '@/i18n';
import type { AttractVideoConfig } from '../../shared/types/store';
import { useCachedVideo } from '@/hooks/useCachedVideo';
import { unlockAudio } from '@/hooks/useAudioVoice';
import {
  ATTRACT_VIDEO_POLICY,
  evaluateAttractVideoPolicy,
} from '../../shared/utils/attractVideoPolicy';

type AttractScreenProps = {
  visible: boolean;
  onStart: () => void;
  title?: string;
  subtitle?: string;
  attractVideoConfig?: AttractVideoConfig;
};

type VideoPlaybackState = 'idle' | 'loading' | 'playing' | 'failed';
type PlaybackQualitySnapshot = {
  totalVideoFrames?: number;
  droppedVideoFrames?: number;
  corruptedVideoFrames?: number;
  creationTime?: number;
  totalFrameDelay?: number;
};
type FrameMetadataSnapshot = {
  mediaTime?: number;
  presentedFrames?: number;
  expectedDisplayTime?: number;
  presentationTime?: number;
  width?: number;
  height?: number;
};
type FrameCapableVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: FrameMetadataSnapshot) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
  getVideoPlaybackQuality?: () => PlaybackQualitySnapshot;
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
  const prevVideoUrlRef = useRef<string | null>(null);
  const failedVideoIdentityRef = useRef<string | null>(null);
  const firstRenderedFrameIdentityRef = useRef<string | null>(null);
  const playbackWatchdogRef = useRef<number | null>(null);
  const frameProbeHandleRef = useRef<number | null>(null);
  const playbackRetryTimerRef = useRef<number | null>(null);
  const failedPlaybackAttemptsRef = useRef<Record<string, number>>({});
  const videoPlaybackStateRef = useRef<VideoPlaybackState>('idle');
  const [shouldRender, setShouldRender] = useState(visible);
  const [isEntering, setIsEntering] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [videoPlaybackState, setVideoPlaybackState] = useState<VideoPlaybackState>('idle');
  const startTriggeredRef = useRef(false);

  const videoSettings: AttractVideoConfig | null = attractVideoConfig ?? null;

  const {
    videoUrl: cachedVideoUrl,
    isCached,
    isDownloading,
    downloadProgress,
    error: cachedVideoError,
    source: videoSource,
  } = useCachedVideo(
    videoSettings?.videoUrl && videoSettings.isEnabled ? videoSettings.videoUrl : null,
    {
      autoDownload: true,
      useFallbackWhileDownloading: true,
      cacheKey: videoSettings?.cacheKey,
      contentType: videoSettings?.contentType,
      validationResult: videoSettings?.lastValidationResult,
    },
  );

  const displayTitle = title || videoSettings?.displayTitle || t('attract.title');
  const displaySubtitle = subtitle || videoSettings?.displaySubtitle || t('attract.subtitle');
  const playbackIdentity = cachedVideoUrl && videoSettings?.isEnabled
    ? `${cachedVideoUrl}::${videoSettings?.cacheKey || 'url-only'}`
    : null;
  const shouldAttemptVideo = !!(playbackIdentity && failedVideoIdentityRef.current !== playbackIdentity);
  const isVideoPlaying = shouldAttemptVideo && videoPlaybackState === 'playing';

  const clearPlaybackWatchdog = () => {
    if (playbackWatchdogRef.current) {
      window.clearTimeout(playbackWatchdogRef.current);
      playbackWatchdogRef.current = null;
    }
  };

  const clearPlaybackRetryTimer = () => {
    if (playbackRetryTimerRef.current) {
      window.clearTimeout(playbackRetryTimerRef.current);
      playbackRetryTimerRef.current = null;
    }
  };

  const clearFrameProbe = (video: HTMLVideoElement | null) => {
    if (!video || frameProbeHandleRef.current === null) {
      return;
    }

    const frameCapableVideo = video as FrameCapableVideoElement;
    if (typeof frameCapableVideo.cancelVideoFrameCallback === 'function') {
      frameCapableVideo.cancelVideoFrameCallback(frameProbeHandleRef.current);
    }
    frameProbeHandleRef.current = null;
  };

  const buildVideoLogPayload = (
    message: string,
    video: HTMLVideoElement | null,
    extra: Record<string, unknown> = {},
  ) => ({
    event: message,
    url: cachedVideoUrl,
    source: videoSource,
    cacheKey: videoSettings?.cacheKey,
    validationResult: videoSettings?.lastValidationResult,
    playbackState: videoPlaybackStateRef.current,
    readyState: video?.readyState ?? null,
    networkState: video?.networkState ?? null,
    paused: video?.paused ?? null,
    currentTime: video?.currentTime ?? null,
    duration: video && Number.isFinite(video.duration) ? video.duration : null,
    videoWidth: video?.videoWidth ?? null,
    videoHeight: video?.videoHeight ?? null,
    ...extra,
  });

  const logVideoEvent = (
    level: 'info' | 'warn' | 'error',
    message: string,
    video: HTMLVideoElement | null,
    extra: Record<string, unknown> = {},
  ) => {
    const logger = console[level];
    logger(`[AttractVideo] ${JSON.stringify(buildVideoLogPayload(message, video, extra))}`);
  };

  const unloadVideo = (video: HTMLVideoElement | null) => {
    if (!video) {
      return;
    }

    video.pause();
    video.removeAttribute('src');
    video.load();
  };

  const failVideoPlayback = (
    reason: string,
    video: HTMLVideoElement | null,
    extra: Record<string, unknown> = {},
  ) => {
    clearPlaybackWatchdog();

    if (playbackIdentity) {
      failedVideoIdentityRef.current = playbackIdentity;
      failedPlaybackAttemptsRef.current[playbackIdentity] =
        (failedPlaybackAttemptsRef.current[playbackIdentity] || 0) + 1;
    }

    prevVideoUrlRef.current = null;
    setVideoPlaybackState('failed');
    logVideoEvent('error', reason, video, extra);
    unloadVideo(video);
  };

  useEffect(() => {
    videoPlaybackStateRef.current = videoPlaybackState;
  }, [videoPlaybackState]);

  useEffect(() => {
    if (!playbackIdentity) {
      setVideoPlaybackState('idle');
      prevVideoUrlRef.current = null;
      firstRenderedFrameIdentityRef.current = null;
      clearPlaybackRetryTimer();
      return;
    }

    delete failedPlaybackAttemptsRef.current[playbackIdentity];
    if (failedVideoIdentityRef.current === playbackIdentity) {
      setVideoPlaybackState('failed');
      return;
    }

    setVideoPlaybackState('loading');
  }, [playbackIdentity]);

  useEffect(() => {
    if (!cachedVideoError) {
      return;
    }

    console.error(
      `[AttractVideo] ${JSON.stringify({
        event: 'cache-resolution-failed',
        url: videoSettings?.videoUrl,
        source: videoSource,
        error:
          cachedVideoError instanceof Error
            ? {
                name: cachedVideoError.name,
                message: cachedVideoError.message,
              }
            : String(cachedVideoError),
      })}`,
    );
  }, [cachedVideoError, videoSettings?.videoUrl, videoSource]);

  useEffect(() => {
    clearPlaybackRetryTimer();

    if (!visible || videoPlaybackState !== 'failed' || !playbackIdentity || !videoSettings?.isEnabled) {
      return;
    }

    const attemptCount = failedPlaybackAttemptsRef.current[playbackIdentity] || 0;
    if (attemptCount >= 3) {
      return;
    }

    playbackRetryTimerRef.current = window.setTimeout(() => {
      if (failedVideoIdentityRef.current !== playbackIdentity) {
        return;
      }

      console.warn(
        `[AttractVideo] ${JSON.stringify({
          event: 'retry-after-failure',
          playbackIdentity,
          attempt: attemptCount + 1,
          source: videoSource,
        })}`,
      );
      failedVideoIdentityRef.current = null;
      prevVideoUrlRef.current = null;
      setVideoPlaybackState('loading');
    }, 4000);

    return () => {
      clearPlaybackRetryTimer();
    };
  }, [playbackIdentity, videoPlaybackState, videoSettings?.isEnabled, videoSource, visible]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (!visible || !shouldAttemptVideo || !cachedVideoUrl || !videoSettings?.isEnabled) {
      clearPlaybackWatchdog();
      clearFrameProbe(video);
      video.pause();
      return;
    }

    let disposed = false;
    const currentIdentity = playbackIdentity;

    const startPlaybackWatchdog = () => {
      clearPlaybackWatchdog();
      playbackWatchdogRef.current = window.setTimeout(() => {
        if (disposed || videoPlaybackStateRef.current === 'playing') {
          return;
        }

        failVideoPlayback(
          `Timeout aguardando inicio do video (${ATTRACT_VIDEO_POLICY.playbackStartTimeoutMs} ms).`,
          video,
        );
      }, ATTRACT_VIDEO_POLICY.playbackStartTimeoutMs);
    };

    const tryPlay = () => {
      if (disposed || !visible || failedVideoIdentityRef.current === currentIdentity) {
        return;
      }

      startPlaybackWatchdog();

      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((error) => {
          if (disposed) {
            return;
          }

          failVideoPlayback('play() falhou para o video de atracao.', video, {
            playErrorName: error instanceof Error ? error.name : 'UnknownError',
            playErrorMessage: error instanceof Error ? error.message : String(error),
          });
        });
      }
    };

    const handleLoadStart = () => {
      setVideoPlaybackState('loading');
      logVideoEvent('info', 'loadstart', video);
      startPlaybackWatchdog();
    };

    const handleLoadedMetadata = () => {
      const policy = evaluateAttractVideoPolicy({
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
        contentLength: videoSettings?.contentLength,
        containerFormat: videoSettings?.containerFormat,
        videoCodec: videoSettings?.videoCodec,
        codecProfile: videoSettings?.codecProfile,
        codecLevel: videoSettings?.codecLevel,
      });

      if (policy.status === 'invalid') {
        failVideoPlayback(`Asset rejeitado pela politica do kiosk. ${policy.summary}`, video);
        return;
      }

      logVideoEvent(policy.status === 'warning' ? 'warn' : 'info', 'loadedmetadata', video, {
        policySummary: policy.summary,
      });
    };

    const handleCanPlay = () => {
      logVideoEvent('info', 'canplay', video);
      tryPlay();
    };

    const handlePlaying = () => {
      clearPlaybackWatchdog();
      setVideoPlaybackState('playing');
      logVideoEvent('info', 'playing', video);

      const frameCapableVideo = video as FrameCapableVideoElement;
      if (
        firstRenderedFrameIdentityRef.current !== currentIdentity &&
        typeof frameCapableVideo.requestVideoFrameCallback === 'function'
      ) {
        clearFrameProbe(video);
        frameProbeHandleRef.current = frameCapableVideo.requestVideoFrameCallback((_, metadata) => {
          frameProbeHandleRef.current = null;
          if (disposed || firstRenderedFrameIdentityRef.current === currentIdentity) {
            return;
          }

          firstRenderedFrameIdentityRef.current = currentIdentity ?? cachedVideoUrl;
          const quality =
            typeof frameCapableVideo.getVideoPlaybackQuality === 'function'
              ? frameCapableVideo.getVideoPlaybackQuality()
              : null;

          logVideoEvent('info', 'firstframe', video, {
            mediaTime: metadata.mediaTime ?? null,
            presentedFrames: metadata.presentedFrames ?? null,
            expectedDisplayTime: metadata.expectedDisplayTime ?? null,
            presentationTime: metadata.presentationTime ?? null,
            decodedVideoFrames: quality?.totalVideoFrames ?? null,
            droppedVideoFrames: quality?.droppedVideoFrames ?? null,
            corruptedVideoFrames: quality?.corruptedVideoFrames ?? null,
          });
        });
      }
    };

    const handleWaiting = () => {
      logVideoEvent('warn', 'waiting', video);
    };

    const handleStalled = () => {
      logVideoEvent('warn', 'stalled', video);
    };

    const handleError = () => {
      failVideoPlayback('Erro nativo do elemento <video>.', video, {
        mediaErrorCode: video.error?.code ?? null,
      });
    };

    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('error', handleError);

    if (prevVideoUrlRef.current !== cachedVideoUrl) {
      prevVideoUrlRef.current = cachedVideoUrl;
      firstRenderedFrameIdentityRef.current = null;
      setVideoPlaybackState('loading');
      clearFrameProbe(video);
      video.pause();
      video.src = cachedVideoUrl;
      video.load();
    } else {
      tryPlay();
    }

    return () => {
      disposed = true;
      clearPlaybackWatchdog();
      clearPlaybackRetryTimer();
      clearFrameProbe(video);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('error', handleError);
    };
  }, [
    cachedVideoUrl,
    playbackIdentity,
    shouldAttemptVideo,
    videoSettings?.contentLength,
    videoSettings?.cacheKey,
    videoSettings?.isEnabled,
    videoSettings?.lastValidationResult,
    videoSource,
    visible,
  ]);

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
    clearPlaybackWatchdog();
    clearPlaybackRetryTimer();
    videoRef.current?.pause();

    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
      setIsExiting(false);
      startTriggeredRef.current = false;
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [visible]);

  if (!shouldRender) {
    return null;
  }

  const handleStart = () => {
    if (startTriggeredRef.current) {
      return;
    }

    startTriggeredRef.current = true;
    unlockAudio();
    setIsExiting(true);
    window.setTimeout(() => {
      onStart();
    }, 180);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
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

      {shouldAttemptVideo && (
        <>
          <video
            ref={videoRef}
            data-testid="attract-video"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
            style={{
              objectFit: videoSettings?.videoCoverMode === 'contain' ? 'contain' : 'cover',
              opacity: isVideoPlaying ? (videoSettings?.videoOpacity ?? 0.4) : 0,
              transition: 'opacity 240ms ease',
            }}
          />

          {isDownloading && (
            <div className="absolute bottom-4 right-4 z-[2] bg-black/60 text-white text-xs px-2 py-1 rounded">
              Caching video: {downloadProgress}%
            </div>
          )}
          {isCached && !isDownloading && process.env.NODE_ENV === 'development' && (
            <div className="absolute bottom-4 right-4 z-[2] bg-green-600/60 text-white text-xs px-2 py-1 rounded">
              {videoSource === 'native-file' ? 'Cached (native)' : 'Cached'}
            </div>
          )}
        </>
      )}

      {!isVideoPlaying && (
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
            <div
              className={'absolute inset-0 opacity-40 ' + (isVideoPlaying ? 'blur-lg' : 'blur-xl')}
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
              <div className="attract-bubble" style={{ '--x': '28%', '--d': '0s', '--t': '6.2s', '--s': '5px' } as CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '42%', '--d': '1.2s', '--t': '5.6s', '--s': '6px' } as CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '56%', '--d': '0.6s', '--t': '6.8s', '--s': '4px' } as CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '68%', '--d': '1.8s', '--t': '5.9s', '--s': '5px' } as CSSProperties} />
              <div className="attract-bubble" style={{ '--x': '76%', '--d': '2.4s', '--t': '6.4s', '--s': '3px' } as CSSProperties} />
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
              onClick={(event) => {
                event.stopPropagation();
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
