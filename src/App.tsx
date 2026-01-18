
import { useEffect, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthContextProvider } from "@/context/AuthContext";
import { ESP32Provider } from "@/context/ESP32Context";
import { PaymentGatewayProvider } from "@/context/PaymentGatewayContext";
import { AdminSecretAccess } from "@/components/AdminSecretAccess";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { LanguageProvider } from "@/i18n";
import type { Language } from "@/i18n";
import { StoreProvider } from "@/context/StoreContext";
import StoreInitialization from "@/components/StoreInitialization";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Shop from "./pages/Shop";
import NotFound from "./pages/NotFound";

// PWA Update Prompt - lazy loaded para não bloquear
const PWAUpdatePrompt = lazy(() => import("@/components/PWAUpdatePrompt"));

const queryClient = new QueryClient();


const AppContent = () => {
  const { isInitialized, loading, updateSettings, settings } = useStoreSettings();
  // Usar idioma salvo nas configurações da loja (Firebase) ou fallback para 'en'
  const initialLanguage: Language = (settings?.language as Language) || 'en';
  // Obter storeId das configurações salvas
  const storeId = settings?.storeId || localStorage.getItem('currentStoreId') || undefined;

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
      {loading ? (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-4 text-gray-600">Loading...</p>
        </div>
      ) : !isInitialized ? (
        <StoreInitialization onComplete={updateSettings} />
      ) : (
        <StoreProvider initialStoreId={storeId}>
          <PaymentGatewayProvider>
            <ESP32Provider>
              <AuthContextProvider>
                <HashRouter>
                  <AdminSecretAccess>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/admin" element={<Admin />} />
                      <Route path="/shop" element={<Shop />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AdminSecretAccess>
                </HashRouter>
              </AuthContextProvider>
            </ESP32Provider>
          </PaymentGatewayProvider>
        </StoreProvider>
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
