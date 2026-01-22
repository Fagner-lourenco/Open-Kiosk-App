
import React, { useEffect, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthContextProvider, useAuth } from "@/context/AuthContext";
import { ESP32Provider } from "@/context/ESP32Context";
import { PaymentGatewayProvider } from "@/context/PaymentGatewayContext";
import { FranchiseProvider } from "@/context/FranchiseContext";
import { PermissionProvider } from "@/context/PermissionContext";
import { AdminSecretAccess } from "@/components/AdminSecretAccess";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { LanguageProvider } from "@/i18n";
import type { Language } from "@/i18n";
import { StoreProvider } from "@/context/StoreContext";
import StoreInitialization from "@/components/StoreInitialization";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { isFranchiseMode } from "@/lib/pathResolver";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Shop from "./pages/Shop";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import StoreSelectPage from "./pages/StoreSelectPage";
import { FranchiseGuard } from "@/components/FranchiseGuard";
import { TapSettingsSync } from "@/components/TapSettingsSync";

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
const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoading, user } = useAuth();

  // Enquanto valida sessão, mostra loading
  if (isLoading && isFranchiseMode()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">Validando sessão...</p>
      </div>
    );
  }

  // Em modo franquia sem user: mostra apenas rotas públicas
  // Os providers dependentes NÃO são montados
  if (isFranchiseMode() && !user) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite" element={<AcceptInvitePage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </HashRouter>
    );
  }

  // Autenticado: monta providers dependentes
  return <>{children}</>;
};

const queryClient = new QueryClient();

/**
 * Wrapper para FranchiseProvider - só ativa em modo franquia
 * Em modo legado, apenas passa os children diretamente
 */
const FranchiseProviderWrapper = ({ children }: { children: React.ReactNode }) => {
  if (isFranchiseMode()) {
    return <FranchiseProvider>{children}</FranchiseProvider>;
  }
  return <>{children}</>;
};

/**
 * Wrapper para PermissionProvider - só ativa em modo franquia
 * Em modo legado, apenas passa os children diretamente
 */
const PermissionProviderWrapper = ({ children }: { children: React.ReactNode }) => {
  if (isFranchiseMode()) {
    return <PermissionProvider>{children}</PermissionProvider>;
  }
  return <>{children}</>;
};


const AppContent = () => {
  const { isInitialized, loading, updateSettings, settings } = useStoreSettings();
  // Usar idioma salvo nas configurações da loja (Firebase) ou fallback para 'en'
  const initialLanguage: Language = (settings?.language as Language) || 'en';
  // Obter storeId das configurações salvas
  const storeId = settings?.storeId || localStorage.getItem('currentStoreId') || undefined;
  
  // Em modo franchise, não requer StoreInitialization - vai direto para login/seleção
  const franchiseMode = isFranchiseMode();
  const needsInitialization = !franchiseMode && !isInitialized;

  // Bloquear back button em plataformas nativas (Android/iOS)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const backButtonListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      // Bloquear completamente o back button em modo kiosk
      console.log('[Kiosk] Back button bloqueado');
      // Não fazer nada - não navegar, não sair
    });

    return () => {
      backButtonListener.then(listener => listener.remove());
    };
  }, []);

  // Listener para visibilitychange - trata transições background/foreground no Android
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] App voltou ao foreground');
        // Re-verificar conexão de rede
        if (navigator.onLine) {
          // Trigger online event para resync se necessário
          window.dispatchEvent(new Event('online'));
        }
      } else {
        console.log('[App] App foi para background');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <LanguageProvider initialLanguage={initialLanguage}>
      {loading && !franchiseMode ? (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-4 text-gray-600">Loading...</p>
        </div>
      ) : needsInitialization ? (
        <StoreInitialization onComplete={updateSettings} />
      ) : (
        <AuthContextProvider>
          <AuthGate>
            <StoreProvider initialStoreId={storeId}>
              <PaymentGatewayProvider>
                <ESP32Provider>
                  <TapSettingsSync>
                    <FranchiseProviderWrapper>
                      <PermissionProviderWrapper>
                        <HashRouter>
                          <AdminSecretAccess>
                            <Routes>
                              {/* Rotas públicas */}
                              <Route path="/login" element={<LoginPage />} />
                              <Route path="/invite" element={<AcceptInvitePage />} />
                          
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
                          </AdminSecretAccess>
                        </HashRouter>
                      </PermissionProviderWrapper>
                    </FranchiseProviderWrapper>
                  </TapSettingsSync>
                </ESP32Provider>
              </PaymentGatewayProvider>
            </StoreProvider>
          </AuthGate>
        </AuthContextProvider>
      )}
    </LanguageProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppContent />
      {/* PWA Update Prompt */}
      <Suspense fallback={null}>
        <PWAUpdatePrompt />
      </Suspense>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
