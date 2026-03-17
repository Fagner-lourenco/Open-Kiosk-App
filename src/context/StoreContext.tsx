import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Store, TapConfig } from '@/types/store';
import { storeService } from '@/services/storeService';
import {
  getCurrentFranchiseId,
  getCurrentStoreId,
  setKioskSelectedStoreId,
  syncKioskSelectionFromStoreSettings,
} from '@/services/firebase';
import { useTapConfiguration } from '@/hooks/useTapConfiguration';

interface StoreContextType {
  currentStoreId: string | null;
  currentStore: Store | null;
  loading: boolean;
  error: string | null;
  setCurrentStoreId: (storeId: string) => void;
  refreshStore: () => Promise<void>;
  taps: TapConfig[];
  tapsVersion: number;
  tapsLoading: boolean;
  tapsSource: 'none' | 'cache' | 'firestore';
  reportTapApplied: (version: number, result: { status: 'success' | 'error', errorMsg?: string }) => Promise<void>;
}

export const STORE_CHANGED_EVENT = 'storeChanged';

const StoreContext = createContext<StoreContextType | null>(null);

interface StoreProviderProps {
  children: ReactNode;
  initialStoreId?: string;
}

export const StoreProvider: React.FC<StoreProviderProps> = ({ children, initialStoreId }) => {
  const [currentStoreId, setCurrentStoreIdState] = useState<string | null>(initialStoreId || null);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    taps,
    version: tapsVersion,
    loading: tapsLoading,
    source: tapsSource,
    reportApplied: reportTapApplied,
  } = useTapConfiguration({
    currentStoreId,
    currentFranchiseId: getCurrentFranchiseId(),
  });

  const isFetchingRef = useRef(false);
  const lastFetchedStoreIdRef = useRef<string | null>(null);

  useEffect(() => {
    const loadStoreId = () => {
      try {
        if (initialStoreId) {
          setCurrentStoreIdState(initialStoreId);
          console.log('[StoreContext] Using initialStoreId:', initialStoreId);
          setLoading(false);
          return;
        }

        const resolvedStoreId = getCurrentStoreId();
        if (resolvedStoreId) {
          setCurrentStoreIdState(resolvedStoreId);
          console.log('[StoreContext] Loaded storeId from resolver:', resolvedStoreId);
          return;
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

  useEffect(() => {
    syncKioskSelectionFromStoreSettings();
  }, []);

  const setCurrentStoreId = useCallback((storeId: string) => {
    console.log('[StoreContext] Setting storeId:', storeId);
    setCurrentStoreIdState(storeId);

    try {
      setKioskSelectedStoreId(storeId);
      const settings = localStorage.getItem('storeSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        parsed.storeId = storeId;
        localStorage.setItem('storeSettings', JSON.stringify(parsed));
      }
    } catch (err) {
      console.error('[StoreContext] Error updating localStorage:', err);
    }

    window.dispatchEvent(new CustomEvent(STORE_CHANGED_EVENT, {
      detail: { storeId },
    }));
  }, []);

  const refreshStore = useCallback(async () => {
    if (!currentStoreId) return;

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
        setError(
          storeService.getLastLoadSource() === 'cache'
            ? 'Store data unavailable - using cached store configuration'
            : null
        );
      } else {
        setError('Store data unavailable - working offline');
      }
    } catch (err) {
      console.warn('[StoreContext] Error refreshing store from Firebase:', err);

      try {
        const cachedStore = storeService.getCachedStore(currentStoreId);
        if (cachedStore) {
          setCurrentStore(cachedStore);
          console.log('[StoreContext] Using cached store data (offline mode):', cachedStore.name);
          setError('Store data unavailable - using cached store configuration');
          return;
        }
      } catch (cacheErr) {
        console.error('[StoreContext] Error loading from cache:', cacheErr);
      }

      setError('Store data unavailable - working offline');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [currentStoreId]);

  useEffect(() => {
    if (currentStoreId && lastFetchedStoreIdRef.current !== currentStoreId) {
      refreshStore();
    }
  }, [currentStoreId, refreshStore]);

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
        reportTapApplied,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStoreContext = (): StoreContextType => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStoreContext must be used inside StoreProvider');
  }
  return context;
};

export const useCurrentStoreId = (): string | null => {
  const { currentStoreId } = useStoreContext();
  return currentStoreId;
};

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
