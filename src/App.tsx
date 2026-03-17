
import React, { useEffect, useState, useMemo, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HashRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { AuthContextProvider, useAuth } from "@/context/AuthContext";
import { ESP32Provider } from "@/context/ESP32Context";
import { PaymentGatewayProvider } from "@/context/PaymentGatewayContext";
import { FranchiseProvider } from "@/context/FranchiseContext";
import { PermissionProvider } from "@/context/PermissionContext";
import { AdminSecretAccess } from "@/components/AdminSecretAccess";
import { useStoreSettings, StoreSettingsProvider } from "@/hooks/useStoreSettings";
import { LanguageProvider } from "@/i18n";
import type { Language } from "@/i18n";
import { StoreProvider } from "@/context/StoreContext";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Shop from "./pages/Shop";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import StoreSelectPage from "./pages/StoreSelectPage";
import DeviceNotProvisionedPage from "./pages/DeviceNotProvisionedPage";
import { FranchiseGuard } from "@/components/FranchiseGuard";
import { TapSettingsSync } from "@/components/TapSettingsSync";
import { usePlugPagAutoConnect } from "@/hooks/usePlugPagAutoConnect";
import { purgeNativeWebViewRuntimeCaches } from "@/services/nativeWebViewCacheService";
import { getCurrentFranchiseId, getCurrentStoreId } from "@/services/firebase";
import { getStoredKioskBootstrapSnapshot } from "@/services/kioskBootstrapService";

// PWA Update Prompt - lazy loaded para não bloquear
const PWAUpdatePrompt = lazy(() => import("@/components/PWAUpdatePrompt"));

/**
 * AuthGate - Bloqueia inicialização de providers dependentes até auth ser validada
 * 
 * Em modo franquia:
 * - Enquanto isLoading: mostra loading spinner
 * - Se não autenticado: mostra apenas rotas públicas (login)
 * - Se autenticado: monta providers que dependem de sessão (Store, ESP32, etc)
 */
const AuthGate: React.FC<{
  children: React.ReactNode;
  isStoreLoading?: boolean;
  isKiosk?: boolean;
  hasKioskProvisioning?: boolean;
}> = ({ children, isStoreLoading, isKiosk = false, hasKioskProvisioning = false }) => {
  const { isLoading, user } = useAuth();

  // Enquanto valida sessão, mostra loading
  if (isLoading || isStoreLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">Validando sessão...</p>
      </div>
    );
  }

  // Em modo franquia sem user: mostra apenas rotas públicas
  // Os providers dependentes NÃO são montados
  if (!user) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite" element={<AcceptInvitePage />} />
          {isKiosk && !hasKioskProvisioning && (
            <Route path="/device-not-provisioned" element={<DeviceNotProvisionedPage />} />
          )}
          <Route
            path="*"
            element={isKiosk && !hasKioskProvisioning ? <DeviceNotProvisionedPage /> : <LoginPage />}
          />
        </Routes>
      </HashRouter>
    );
  }

  // Autenticado: monta providers dependentes
  return <>{children}</>;
};

/**
 * KioskGuard - Redireciona para /shop se modo Kiosk estiver habilitado nas configurações
 * e usuário estiver na raiz (/). Só atua se isKiosk for verdadeiro (superfície quiosque).
 */
const KioskGuard: React.FC<{
  children: React.ReactNode;
  kioskEnabled?: boolean;
  isKiosk: boolean;
  isProvisioned: boolean;
}> = ({ children, kioskEnabled, isKiosk, isProvisioned }) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isKiosk) {
      return;
    }

    if (!isProvisioned && location.pathname !== '/device-not-provisioned') {
      console.warn('[KioskGuard] Dispositivo sem bootstrap valido, redirecionando para provisioning');
      navigate('/device-not-provisioned', { replace: true });
      return;
    }

    if (isProvisioned && location.pathname === '/device-not-provisioned') {
      navigate(kioskEnabled ? '/shop' : '/', { replace: true });
      return;
    }

    // Só redirecionar se estiver na superfície quiosque E o modo kiosk (software) estiver ON
    // e o usuário estiver tentando acessar a landing page (Index)
    if (kioskEnabled && (location.pathname === '/' || location.pathname === '')) {
      console.log('[KioskGuard] Redirecionando para /shop (Modo Kiosk Ativo)');
      navigate('/shop', { replace: true });
    }
  }, [isKiosk, isProvisioned, kioskEnabled, location.pathname, navigate]);

  return <>{children}</>;
};

const queryClient = new QueryClient();

/**
 * PlugPagBootstrap — Componente invisível que inicializa auto-conexão do terminal PlugPag.
 * Deve estar dentro de PaymentGatewayProvider para acessar gatewayConfig.
 */
const PlugPagBootstrap: React.FC = () => {
  usePlugPagAutoConnect();
  return null;
};

const hasHealthyCapacitorBridge = (): boolean => {
  const capacitorBridge = (window as Window & {
    Capacitor?: {
      Plugins?: Record<string, unknown>;
      triggerEvent?: (eventName: string, target: string, eventData?: unknown) => boolean;
    };
  }).Capacitor;

  return !!capacitorBridge?.Plugins && typeof capacitorBridge.triggerEvent === 'function';
};

const AppContent = () => {
  const { loading, settings } = useStoreSettings();
  const kioskBootstrap = getStoredKioskBootstrapSnapshot();

  // Usar idioma salvo nas configurações da loja (Firebase) - undefined enquanto carrega
  const initialLanguage = settings?.language as Language | undefined;
  // Obter storeId da seleção atual (admin selector) ou das configurações salvas
  const storeId = getCurrentStoreId() || kioskBootstrap?.storeId || settings?.storeId || undefined;

  // Estado para tornar a detecção de rota reativa (visto que o HashRouter está abaixo)
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => {
      console.log('[App] Rota alterada:', window.location.hash);
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Detectar se é modo Kiosk ou Admin de forma mais robusta e reativa
  const isKiosk = useMemo(() => {
    const hash = currentHash;

    // KIO-06 fix: detectar kiosk por rotas explícitas (não por exclusão)
    const isKioskRoute = hash === '' ||
      hash === '#/' ||
      hash.startsWith('#/shop') ||
      hash.startsWith('#/checkout') ||
      hash.startsWith('#/payment') ||
      hash.startsWith('#/attract') ||
      hash.startsWith('#/device-not-provisioned');

    return isKioskRoute;
  }, [currentHash]);

  const effectiveKioskEnabled = settings?.kioskEnabled ?? kioskBootstrap?.kioskEnabled ?? false;
  const hasKioskProvisioning = Boolean(
    (settings?.storeId && settings?.franchiseId) ||
    (kioskBootstrap?.storeId && kioskBootstrap?.franchiseId) ||
    (getCurrentStoreId() && getCurrentFranchiseId())
  );

  // KIO-08 fix: Bloquear back button apenas em modo kiosk
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isKiosk) return;

    const backButtonListener = CapacitorApp.addListener('backButton', () => {
      // Bloquear back button apenas em modo kiosk
      console.debug('[Kiosk] Back button bloqueado');
    });

    return () => {
      backButtonListener.then(listener => listener.remove());
    };
  }, [isKiosk]);

  // Listener para visibilitychange - trata transições background/foreground no Android
  useEffect(() => {
    const recoverBrokenNativeBridge = () => {
      if (!Capacitor.isNativePlatform()) return;
      if (hasHealthyCapacitorBridge()) return;

      console.warn('[App] Capacitor bridge unhealthy after WebView resume - forcing reload');
      window.location.reload();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] App voltou ao foreground');
        // Re-verificar conexão de rede
        if (navigator.onLine) {
          // Trigger online event para resync se necessário
          window.dispatchEvent(new Event('online'));
        }
        recoverBrokenNativeBridge();
      } else {
        console.log('[App] App foi para background');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const bridgeHealthTimer = window.setTimeout(() => {
      recoverBrokenNativeBridge();
    }, 1500);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(bridgeHealthTimer);
    };
  }, []);

  // Em plataforma nativa, garantir que não haja Service Worker controlando o WebView
  // (evita servir bundle antigo em https://localhost no Capacitor).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const cleanupNativeWebViewCache = async () => {
      try {
        const result = await purgeNativeWebViewRuntimeCaches();

        if (result.serviceWorkersRemoved > 0) {
          console.log('[PWA] Service Workers removidos em plataforma nativa:', result.serviceWorkersRemoved);
        }

        if (result.deletedCacheKeys.length > 0) {
          console.log('[PWA] Cache Storage limpo em plataforma nativa:', result.deletedCacheKeys);
        }

        if (result.preservedCacheKeys.length > 0) {
          console.log('[PWA] Cache Storage preservado em plataforma nativa:', result.preservedCacheKeys);
        }
      } catch (error) {
        console.warn('[PWA] Falha ao limpar SW/cache no nativo:', error);
      }
    };

    void cleanupNativeWebViewCache();
  }, []);

  return (
    <LanguageProvider
      initialLanguage={initialLanguage}
      isKiosk={isKiosk}
      storeId={storeId}
    >
      <AuthContextProvider isKiosk={isKiosk}>
        <AuthGate
          isStoreLoading={loading}
          isKiosk={isKiosk}
          hasKioskProvisioning={hasKioskProvisioning}
        >
          <StoreProvider initialStoreId={storeId}>
            <PaymentGatewayProvider>
              <ESP32Provider>
                <TapSettingsSync>
                  <PlugPagBootstrap />
                  <FranchiseProvider>
                    <PermissionProvider>
                      <HashRouter>
                        <AdminSecretAccess>
                          <KioskGuard
                            kioskEnabled={effectiveKioskEnabled}
                            isKiosk={isKiosk}
                            isProvisioned={hasKioskProvisioning}
                          >
                            <Routes>
                              {/* Rotas públicas */}
                              <Route path="/login" element={<LoginPage />} />
                              <Route path="/invite" element={<AcceptInvitePage />} />
                              <Route path="/device-not-provisioned" element={<DeviceNotProvisionedPage />} />

                              {/* Rotas protegidas em modo franchise */}
                              <Route path="/" element={
                                <FranchiseGuard kioskMode={true}>
                                  <Index />
                                </FranchiseGuard>
                              } />
                              <Route path="/admin" element={
                                <FranchiseGuard>
                                  <Admin />
                                </FranchiseGuard>
                              } />
                              <Route path="/shop" element={
                                <FranchiseGuard>
                                  <Shop />
                                </FranchiseGuard>
                              } />
                              <Route path="/store-select" element={
                                <FranchiseGuard requireStore={false}>
                                  <StoreSelectPage />
                                </FranchiseGuard>
                              } />

                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </KioskGuard>
                        </AdminSecretAccess>
                      </HashRouter>
                    </PermissionProvider>
                  </FranchiseProvider>
                </TapSettingsSync>
              </ESP32Provider>
            </PaymentGatewayProvider>
          </StoreProvider>
        </AuthGate>
      </AuthContextProvider>
    </LanguageProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <StoreSettingsProvider>
        <AppContent />
      </StoreSettingsProvider>
      {/* PWA Update Prompt apenas na web */}
      {!Capacitor.isNativePlatform() && (
        <Suspense fallback={null}>
          <PWAUpdatePrompt />
        </Suspense>
      )}
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
