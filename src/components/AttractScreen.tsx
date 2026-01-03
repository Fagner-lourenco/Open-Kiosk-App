import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Hand, Sparkles } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { getFirebaseDb, getCurrentStoreId } from '@/services/firebase';
import { AttractVideoSettings } from '@/types/store';
import BeerMug from '@/components/icons/BeerMug';

type AttractScreenProps = {
  visible: boolean;
  onStart: () => void;
  title?: string;
  subtitle?: string;
};

const AttractScreen = ({
  visible,
  onStart,
  title,
  subtitle,
}: AttractScreenProps) => {
  const { t } = useTranslation();
  const startBtnRef = useRef<HTMLButtonElement | null>(null);
  const [videoSettings, setVideoSettings] = useState<AttractVideoSettings | null>(null);

  // Título e subtítulo: prioridade props > Firebase > i18n
  const displayTitle = title || videoSettings?.displayTitle || t('attract.title');
  const displaySubtitle = subtitle || videoSettings?.displaySubtitle || t('attract.subtitle');

  // Carrega configurações de vídeo do Firestore
  useEffect(() => {
    const loadVideoSettings = async () => {
      try {
        const storeId = getCurrentStoreId();
        if (!storeId) return;

        const db = getFirebaseDb();
        const videoDocRef = doc(db, 'stores', storeId, 'settings', 'attract_video');
        const videoSnap = await getDoc(videoDocRef);

        if (videoSnap.exists()) {
          const data = videoSnap.data() as AttractVideoSettings;
          if (data.isEnabled) {
            setVideoSettings(data);
          }
        }
      } catch (error) {
        console.error('Error loading attract video settings:', error);
      }
    };

    if (visible) {
      loadVideoSettings();
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      // Focus CTA for keyboard users
      startBtnRef.current?.focus();
    }
  }, [visible]);

  if (!visible) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onStart();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('attract.kioskStartScreen')}
      className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center"
      onKeyDown={onKeyDown}
    >
      {/* Video background layer - lowest z-index */}
      {videoSettings?.videoUrl && videoSettings.isEnabled && (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            objectFit: videoSettings.videoCoverMode === 'contain' ? 'contain' : 'cover',
            opacity: videoSettings.videoOpacity ?? 0.4,
            zIndex: 0
          }}
          onError={(e) => {
            console.error('Error loading attract video:', e);
          }}
        >
          <source src={videoSettings.videoUrl} type="video/mp4" />
        </video>
      )}

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-100/20 to-purple-100/20 rounded-full blur-3xl" />
      </div>

      {/* Main content */}
      <div className="relative text-center px-8 max-w-lg z-20">
        {/* Icon with animation */}
        <div className="flex items-center justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-amber-400/20 rounded-full blur-xl animate-pulse scale-150" />
            <div className="relative inline-flex items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 p-8 shadow-2xl shadow-amber-500/30">
              <BeerMug className="w-14 h-14 text-white" />
            </div>
            <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-bounce" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
          {displayTitle}
        </h1>
        
        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-gray-500 mb-10">
          {displaySubtitle}
        </p>

        {/* CTA Button */}
        <div className="flex items-center justify-center">
          <Button
            ref={startBtnRef}
            size="lg"
            className="px-10 py-7 text-lg font-semibold bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-xl shadow-blue-500/25 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/30"
            onClick={(e) => {
              e.stopPropagation();
              onStart();
            }}
          >
            <Hand className="w-5 h-5 mr-3" />
            {t('attract.start')}
          </Button>
        </div>

        {/* Keyboard hint */}
        <p className="text-sm text-gray-400 mt-8">
          {t('attract.keyboardHint')}
        </p>
      </div>
    </div>
  );
};

export default AttractScreen;
