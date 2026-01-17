
import { useState, useEffect, useCallback } from 'react';
import { StoreSettings } from '@/types/store';
import { initializeFirebase, getFirebaseDb, getCurrentStoreId } from '@/services/firebase';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { cacheSet, cacheGet, ensureDBReady, STORES, CachedSettings } from '@/services/cacheService';
import { initNetworkListeners, startBackgroundSync } from '@/services/syncService';
import { startAutoCleanup } from '@/services/cleanupService';

const SETTINGS_CACHE_KEY = 'storeSettings';
const SETTINGS_DOC_ID = 'store_settings';

// Singleton flags para evitar múltiplas inicializações
let servicesInitialized = false;
let initializationPromise: Promise<void> | null = null;

export const useStoreSettings = () => {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  /**
   * Carrega settings do localStorage (hot cache mais rápido)
   */
  const loadFromLocalStorage = useCallback((): StoreSettings | null => {
    try {
      const savedSettings = localStorage.getItem('storeSettings');
      if (savedSettings) {
        return JSON.parse(savedSettings);
      }
    } catch (error) {
      console.error('[useStoreSettings] Error loading from localStorage:', error);
    }
    return null;
  }, []);

  /**
   * Salva settings no localStorage
   */
  const saveToLocalStorage = useCallback((newSettings: StoreSettings) => {
    try {
      localStorage.setItem('storeSettings', JSON.stringify(newSettings));
      localStorage.setItem('storeInitialized', 'true');
    } catch (error) {
      console.error('[useStoreSettings] Error saving to localStorage:', error);
    }
  }, []);

  /**
   * Salva settings no IndexedDB como backup
   */
  const saveToIndexedDB = useCallback(async (newSettings: StoreSettings) => {
    try {
      const cachedSettings: CachedSettings = {
        id: SETTINGS_DOC_ID,
        data: newSettings,
        updatedAt: Date.now(),
      };
      await cacheSet(STORES.SETTINGS, cachedSettings);
    } catch (error) {
      console.error('[useStoreSettings] Error saving to IndexedDB:', error);
    }
  }, []);

  /**
   * Carrega settings do IndexedDB
   */
  const loadFromIndexedDB = useCallback(async (): Promise<StoreSettings | null> => {
    try {
      const cached = await cacheGet<CachedSettings>(STORES.SETTINGS, SETTINGS_DOC_ID);
      if (cached?.data) {
        return cached.data as StoreSettings;
      }
    } catch (error) {
      console.error('[useStoreSettings] Error loading from IndexedDB:', error);
    }
    return null;
  }, []);

  /**
   * Sincroniza settings com Firebase (background, não bloqueia UI)
   */
  const syncToFirebase = useCallback(async (newSettings: StoreSettings) => {
    if (!navigator.onLine) {
      console.log('[useStoreSettings] Offline, sync queued');
      return;
    }

    setIsSyncing(true);
    try {
      const db = getFirebaseDb();
      const storeId = newSettings.storeId || getCurrentStoreId();
      
      if (storeId) {
        const settingsDocRef = doc(db, 'stores', storeId, 'settings', 'config');
        await setDoc(settingsDocRef, {
          ...newSettings,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log('[useStoreSettings] Synced to Firebase');
      }
    } catch (error) {
      console.error('[useStoreSettings] Error syncing to Firebase:', error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  /**
   * Inicializa serviços apenas uma vez (singleton)
   */
  const initializeServicesOnce = useCallback(async (settingsData: StoreSettings) => {
    if (servicesInitialized) return;
    
    servicesInitialized = true;
    try {
      initializeFirebase(settingsData);
      startBackgroundSync();
      startAutoCleanup();
    } catch (error) {
      console.error('[useStoreSettings] Services init error:', error);
      servicesInitialized = false; // Reset on error to allow retry
    }
  }, []);

  /**
   * Inicialização: carrega offline-first
   */
  useEffect(() => {
    // Evita inicializações paralelas
    if (initializationPromise) {
      initializationPromise.then(() => {
        // Apenas atualiza estado local após init global
        const localSettings = loadFromLocalStorage();
        if (localSettings) {
          setSettings(localSettings);
          setIsInitialized(true);
        }
        setLoading(false);
      });
      return;
    }
    
    const initializeSettings = async () => {
      console.log('[useStoreSettings] Initializing...');
      
      // 1. Inicializa IndexedDB e listeners de rede
      await ensureDBReady();
      initNetworkListeners();
      
      // 2. Carrega do localStorage PRIMEIRO (hot cache, mais rápido)
      const localSettings = loadFromLocalStorage();
      
      if (localSettings) {
        console.log('[useStoreSettings] Loaded from localStorage');
        setSettings(localSettings);
        setIsInitialized(true);
        
        // Inicializa serviços (singleton - só executa uma vez)
        await initializeServicesOnce(localSettings);
      } else {
        // 3. Fallback: tenta IndexedDB
        const idbSettings = await loadFromIndexedDB();
        if (idbSettings) {
          console.log('[useStoreSettings] Loaded from IndexedDB');
          setSettings(idbSettings);
          setIsInitialized(true);
          saveToLocalStorage(idbSettings);
          
          // Inicializa serviços (singleton - só executa uma vez)
          await initializeServicesOnce(idbSettings);
        } else {
          console.log('[useStoreSettings] No saved settings found');
        }
      }
      
      setLoading(false);
    };

    // Cria promise para sincronização entre instâncias do hook
    initializationPromise = initializeSettings();
    initializationPromise.finally(() => {
      initializationPromise = null;
    });
  }, [loadFromLocalStorage, loadFromIndexedDB, saveToLocalStorage, initializeServicesOnce]);

  /**
   * Listener para mudanças do Firebase (sync em background)
   */
  useEffect(() => {
    if (!isInitialized || !settings?.storeId) return;

    let unsubscribe: (() => void) | null = null;

    /**
     * Normaliza timestamp para milissegundos
     * Suporta: Firebase Timestamp, Date, string ISO, número
     */
    const normalizeTimestamp = (value: unknown): number => {
      if (!value) return 0;
      if (typeof value === 'number') return value;
      if (value instanceof Date) return value.getTime();
      // Firebase Timestamp tem método toDate()
      if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate().getTime();
      }
      // String ISO
      if (typeof value === 'string') {
        const parsed = new Date(value).getTime();
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    };

    const setupFirebaseListener = async () => {
      try {
        const db = getFirebaseDb();
        const storeId = settings.storeId || getCurrentStoreId();
        
        if (!storeId) return;

        const settingsDocRef = doc(db, 'stores', storeId, 'settings', 'config');
        
        unsubscribe = onSnapshot(settingsDocRef, (snapshot) => {
          if (snapshot.exists()) {
            const firebaseSettings = snapshot.data() as StoreSettings;
            
            // Merge com settings locais (local tem prioridade para firebaseConfig)
            const mergedSettings: StoreSettings = {
              ...firebaseSettings,
              firebaseConfig: settings.firebaseConfig, // Mantém config local
              storeId: settings.storeId,
            };
            
            // Atualiza apenas se houver diferenças significativas
            // Usa normalização para comparar timestamps corretamente
            const localUpdatedAt = normalizeTimestamp(localStorage.getItem('settingsUpdatedAt'));
            const firebaseUpdatedAt = normalizeTimestamp((firebaseSettings as StoreSettings & { updatedAt?: unknown }).updatedAt);
            
            if (!localUpdatedAt || (firebaseUpdatedAt && firebaseUpdatedAt > localUpdatedAt)) {
              console.log('[useStoreSettings] Updating from Firebase');
              setSettings(mergedSettings);
              saveToLocalStorage(mergedSettings);
              saveToIndexedDB(mergedSettings);
              localStorage.setItem('settingsUpdatedAt', new Date().toISOString());
            }
          }
        }, (error) => {
          console.error('[useStoreSettings] Firebase listener error:', error);
        });
      } catch (error) {
        console.error('[useStoreSettings] Error setting up Firebase listener:', error);
      }
    };

    setupFirebaseListener();

    return () => {
      unsubscribe?.();
    };
  }, [isInitialized, settings?.storeId, settings?.firebaseConfig, saveToLocalStorage, saveToIndexedDB]);

  /**
   * Atualiza settings (salva em todos os caches + sync)
   */
  const updateSettings = useCallback((newSettings: StoreSettings) => {
    console.log('[useStoreSettings] Updating settings');
    
    // 1. Atualiza state imediatamente (UI responsiva)
    setSettings(newSettings);
    setIsInitialized(true);
    
    // 2. Salva no localStorage (hot cache)
    saveToLocalStorage(newSettings);
    localStorage.setItem('settingsUpdatedAt', new Date().toISOString());
    
    // 3. Salva no IndexedDB (backup)
    saveToIndexedDB(newSettings);
    
    // 4. Inicializa serviços se ainda não foram (singleton)
    if (!servicesInitialized) {
      try {
        initializeFirebase(newSettings);
        startBackgroundSync();
        startAutoCleanup();
        servicesInitialized = true;
      } catch (error) {
        console.error('[useStoreSettings] Firebase init error:', error);
      }
    }
    
    // 5. Sync para Firebase em background (não bloqueia)
    syncToFirebase(newSettings);
  }, [saveToLocalStorage, saveToIndexedDB, syncToFirebase]);

  /**
   * Reset completo da loja
   */
  const resetStore = useCallback(() => {
    localStorage.removeItem('storeInitialized');
    localStorage.removeItem('storeSettings');
    localStorage.removeItem('settingsUpdatedAt');
    setSettings(null);
    setIsInitialized(false);
    console.log('[useStoreSettings] Store reset');
  }, []);

  return {
    settings,
    isInitialized,
    loading,
    isSyncing,
    updateSettings,
    resetStore,
  };
};
