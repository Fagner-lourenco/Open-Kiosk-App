import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Store } from '@/types/store';
import { TapConfig } from '@/types/store';
import { storeService } from '@/services/storeService';
import { useTapConfiguration } from '@/hooks/useTapConfiguration';

// ============================================
// Store Context Types
// ============================================

interface StoreContextType {
  currentStoreId: string | null;
  currentStore: Store | null;
  loading: boolean;
  error: string | null;
  setCurrentStoreId: (storeId: string) => void;
  refreshStore: () => Promise<void>;

  // ✅ Taps Configuration
  taps: TapConfig[];
  tapsVersion: number;
  tapsLoading: boolean;
  tapsSource: 'none' | 'cache' | 'firestore';
  reportTapApplied: (version: number, result: { status: 'success' | 'error', errorMsg?: string }) => Promise<void>;
}

// Evento customizado para notificar mudança de loja
export const STORE_CHANGED_EVENT = 'storeChanged';

// ============================================
// Context Creation
// ============================================

const StoreContext = createContext<StoreContextType | null>(null);

// ============================================
// Store Provider Component
// ============================================

interface StoreProviderProps {
  children: ReactNode;
  initialStoreId?: string;
}

export const StoreProvider: React.FC<StoreProviderProps> = ({ children, initialStoreId }) => {
  const [currentStoreId, setCurrentStoreIdState] = useState<string | null>(initialStoreId || null);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ Taps Configuration from Firestore
  const {
    taps,
    version: tapsVersion,
    loading: tapsLoading,
    source: tapsSource,
    reportApplied: reportTapApplied,
  } = useTapConfiguration({
    currentStoreId,
    currentFranchiseId: localStorage.getItem('open-kiosk-admin:selectedFranchise'),
  });

  // 🔧 FIX: Flag para evitar fetch duplicado (previne loop infinito)
  const isFetchingRef = useRef(false);
  const lastFetchedStoreIdRef = useRef<string | null>(null);

  // Carregar storeId do localStorage na inicialização (se não tiver initialStoreId)
  useEffect(() => {
    const loadStoreId = () => {
      try {
        // Se já temos initialStoreId, usá-lo
        if (initialStoreId) {
          setCurrentStoreIdState(initialStoreId);
          console.log('[StoreContext] Using initialStoreId:', initialStoreId);
          setLoading(false);
          return;
        }

        // Preferir seleção atual (alinhado com Admin)
        const selectedStore = localStorage.getItem('open-kiosk-admin:selectedStore');
        if (selectedStore) {
          setCurrentStoreIdState(selectedStore);
          console.log('[StoreContext] Loaded storeId from selected store:', selectedStore);
          return;
        }

        // Fallback: tentar carregar do storeSettings
        const settings = localStorage.getItem('storeSettings');
        if (settings) {
          const parsed = JSON.parse(settings);
          if (parsed.storeId) {
            setCurrentStoreIdState(parsed.storeId);
            console.log('[StoreContext] Loaded storeId from storeSettings:', parsed.storeId);
          }
        }
      } catch (err) {
        console.error('[StoreContext] Error loading storeId:', err);
        setError(err instanceof Error ? err.message : 'Failed to load store');
      } finally {
        setLoading(false);
      }
    };

    loadStoreId();
  }, [initialStoreId]);

  // Função para atualizar storeId e disparar evento
  const setCurrentStoreId = useCallback((storeId: string) => {
    console.log('[StoreContext] Setting storeId:', storeId);
    setCurrentStoreIdState(storeId);

    // Atualizar localStorage
    try {
      localStorage.setItem('open-kiosk-admin:selectedStore', storeId);
      const settings = localStorage.getItem('storeSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        parsed.storeId = storeId;
        localStorage.setItem('storeSettings', JSON.stringify(parsed));
      }
    } catch (err) {
      console.error('[StoreContext] Error updating localStorage:', err);
    }

    // Disparar evento para notificar outros hooks
    window.dispatchEvent(new CustomEvent(STORE_CHANGED_EVENT, {
      detail: { storeId }
    }));
  }, []);

  // Função para recarregar dados da loja do Firestore (com fallback para cache)
  // 🔧 FIX: Removido currentStore das dependências para evitar loop infinito
  const refreshStore = useCallback(async () => {
    if (!currentStoreId) return;

    // 🔧 FIX: Evitar fetch duplicado para o mesmo storeId
    if (isFetchingRef.current && lastFetchedStoreIdRef.current === currentStoreId) {
      console.log('[StoreContext] Already fetching store, skipping duplicate request');
      return;
    }

    isFetchingRef.current = true;
    lastFetchedStoreIdRef.current = currentStoreId;
    setLoading(true);

    try {
      console.log('[StoreContext] Refreshing store:', currentStoreId);
      const storeData = await storeService.getStore(currentStoreId);
      if (storeData) {
        setCurrentStore(storeData);
        console.log('[StoreContext] Store loaded:', storeData.name);
      }
      setError(null);
    } catch (err) {
      console.warn('[StoreContext] Error refreshing store from Firebase:', err);

      // Fallback: tentar criar Store a partir do localStorage (modo offline)
      try {
        const settingsStr = localStorage.getItem('storeSettings');
        if (settingsStr) {
          const settings = JSON.parse(settingsStr);
          if (settings.storeId === currentStoreId) {
            // Criar objeto Store mínimo a partir do cache local
            const cachedStore: Store = {
              id: currentStoreId,
              storeId: currentStoreId,
              name: settings.name || 'Loja',
              slug: currentStoreId,
              isActive: true,
              taxId: settings.taxId || '',
              currency: settings.currency || 'BRL',
              taxPercentage: settings.taxPercentage || 0,
              language: settings.language,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            setCurrentStore(cachedStore);
            console.log('[StoreContext] Using cached store data (offline mode):', cachedStore.name);
            setError(null);
            return;
          }
        }
      } catch (cacheErr) {
        console.error('[StoreContext] Error loading from cache:', cacheErr);
      }

      // Definir erro apenas se não temos dados em cache
      setError('Store data unavailable - working offline');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [currentStoreId]); // 🔧 FIX: Apenas currentStoreId - NÃO incluir currentStore!

  // Carregar dados da loja quando storeId muda
  // 🔧 FIX: Removido refreshStore das dependências - chamamos diretamente
  useEffect(() => {
    if (currentStoreId) {
      // Só busca se o storeId realmente mudou
      if (lastFetchedStoreIdRef.current !== currentStoreId) {
        refreshStore();
      }
    }
  }, [currentStoreId]);

  return (
    <StoreContext.Provider
      value={{
        currentStoreId,
        currentStore,
        loading,
        error,
        setCurrentStoreId,
        refreshStore,
        taps,
        tapsVersion,
        tapsLoading,
        tapsSource,
        reportTapApplied
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

// ============================================
// Custom Hooks
// ============================================

/**
 * Hook principal para acessar o contexto da loja
 */
export const useStoreContext = (): StoreContextType => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStoreContext must be used inside StoreProvider');
  }
  return context;
};

/**
 * Hook para obter apenas o storeId atual (convenience)
 */
export const useCurrentStoreId = (): string | null => {
  const { currentStoreId } = useStoreContext();
  return currentStoreId;
};

/**
 * Hook para escutar mudanças de loja
 * Útil para invalidar caches e refetch de dados
 */
export const useStoreChangeListener = (callback: (storeId: string) => void): void => {
  useEffect(() => {
    const handleStoreChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ storeId: string }>;
      callback(customEvent.detail.storeId);
    };

    window.addEventListener(STORE_CHANGED_EVENT, handleStoreChange);
    return () => window.removeEventListener(STORE_CHANGED_EVENT, handleStoreChange);
  }, [callback]);
};

export default StoreContext;
