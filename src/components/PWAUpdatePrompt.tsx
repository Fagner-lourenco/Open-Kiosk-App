/**
 * ============================================
 * PWA Update Prompt Component
 * ============================================
 * 
 * Gerencia atualizações do Service Worker e mostra
 * prompt de atualização para o usuário.
 */

import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wifi, WifiOff, Download } from 'lucide-react';
import { useIsOnline } from '@/hooks/useNetworkStatus';

export const PWAUpdatePrompt = () => {
  const [showOfflineReady, setShowOfflineReady] = useState(false);
  const isOnline = useIsOnline();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('[PWA] SW Registered:', r);
    },
    onRegisterError(error) {
      console.error('[PWA] SW registration error:', error);
    },
    onNeedRefresh() {
      console.log('[PWA] New content available, refresh required');
    },
    onOfflineReady() {
      console.log('[PWA] App is ready for offline use');
      setShowOfflineReady(true);
      // Esconde após 3 segundos
      setTimeout(() => setShowOfflineReady(false), 3000);
    },
  });

  // Atualização automática quando houver nova versão
  const handleUpdate = () => {
    updateServiceWorker(true);
    setNeedRefresh(false);
  };

  const handleDismiss = () => {
    setNeedRefresh(false);
  };

  return (
    <>
      {/* Indicador offline/online */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-[9998] flex items-center gap-2 bg-yellow-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
          <WifiOff className="w-4 h-4" />
          <span>Modo Offline</span>
        </div>
      )}

      {/* Notificação offline ready */}
      {showOfflineReady && (
        <div className="fixed bottom-4 right-4 z-[9998] flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-right-5">
          <Download className="w-5 h-5" />
          <span>App pronto para uso offline!</span>
        </div>
      )}

      {/* Prompt de atualização */}
      {needRefresh && (
        <div className="fixed bottom-4 right-4 z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl p-4 max-w-sm animate-in slide-in-from-right-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-full">
              <RefreshCw className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900">
                Nova versão disponível
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                Uma nova versão do app está disponível. Atualize para obter as últimas melhorias.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleUpdate}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Atualizar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDismiss}
                >
                  Depois
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Hook para verificar se o app está rodando como PWA instalado
 */
export const useIsPWA = (): boolean => {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Detecta se está rodando como PWA standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOS = (window.navigator as any).standalone === true;
    setIsPWA(isStandalone || isIOS);
  }, []);

  return isPWA;
};

export default PWAUpdatePrompt;
