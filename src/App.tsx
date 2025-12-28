
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HashRouter, Routes, Route } from "react-router-dom";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { LanguageProvider } from "@/i18n";
import type { Language } from "@/i18n";
import StoreInitialization from "@/components/StoreInitialization";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Shop from "./pages/Shop";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();


const AppContent = () => {
  const { isInitialized, loading, updateSettings, settings } = useStoreSettings();
  // Usar idioma salvo nas configurações da loja (Firebase) ou fallback para 'en'
  const initialLanguage: Language = (settings?.language as Language) || 'en';

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
        <HashRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
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
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
