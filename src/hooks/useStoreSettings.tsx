
import { useState, useEffect, useCallback, useMemo } from 'react';
import { StoreSettings } from '@/types/store';
import { getApps } from 'firebase/app';
import { initializeFirebase, getFirebaseDb, getCurrentStoreId, getCurrentFranchiseId, getFirebaseAuth } from '@/services/firebase';
import { authService } from '@/services/authService';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { cacheSet, cacheGet, ensureDBReady, STORES, CachedSettings } from '@/services/cacheService';
import { initNetworkListeners, startBackgroundSync, enqueueSync } from '@/services/syncService';
import { startAutoCleanup } from '@/services/cleanupService';
import { isFranchiseMode } from '@/lib/pathResolver';

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
   * Inclui franchiseId automaticamente se disponível
   */
  const saveToLocalStorage = useCallback((newSettings: StoreSettings) => {
    try {
      // Enriquecer com franchiseId se disponível e não presente
      const enrichedSettings = { ...newSettings };
      if (!enrichedSettings.franchiseId) {
        const franchiseId = getCurrentFranchiseId();
        if (franchiseId) {
          enrichedSettings.franchiseId = franchiseId;
        }
      }
      localStorage.setItem('storeSettings', JSON.stringify(enrichedSettings));
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
      try {
        await enqueueSync('update', 'settings', 'config', {
          ...newSettings,
          updatedAt: new Date(),
        });
      } catch (queueError) {
        console.error('[useStoreSettings] Error queueing sync:', queueError);
      }
      return;
    }

    setIsSyncing(true);
    try {
      const db = getFirebaseDb();
      const storeId = newSettings.storeId || getCurrentStoreId();
      
      if (storeId) {
        // Determinar path correto baseado no modo
        let settingsDocRef;
        if (isFranchiseMode()) {
          const franchiseId = getCurrentFranchiseId();
          if (franchiseId) {
            settingsDocRef = doc(db, 'franchises', franchiseId, 'stores', storeId, 'settings', 'config');
          } else {
            console.warn('[useStoreSettings] Franchise mode but no franchiseId, using legacy path');
            settingsDocRef = doc(db, 'stores', storeId, 'settings', 'config');
          }
        } else {
          settingsDocRef = doc(db, 'stores', storeId, 'settings', 'config');
        }
        
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
   * Protegido contra HMR verificando getApps()
   */
  const initializeServicesOnce = useCallback(async (settingsData: StoreSettings) => {
    // Verificar se já inicializado (flag OU Firebase já existe - protege contra HMR)
    if (servicesInitialized || getApps().length > 0) {
      servicesInitialized = true; // Sincronizar flag caso Firebase já exista
      return;
    }
    
    servicesInitialized = true;
    try {
      initializeFirebase(settingsData);
      // Inicializa authService após Firebase estar pronto
      authService.initialize();
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
          
          // 4. Em franchise mode, criar settings mínimos para ativar listeners Firebase
          if (isFranchiseMode()) {
            const storeId = getCurrentStoreId();
            const franchiseId = getCurrentFranchiseId();
            
            console.log('[useStoreSettings] Franchise mode detected, creating minimal settings:', { storeId, franchiseId });
            
            if (storeId) {
              // Criar settings mínimos para ativar os listeners do Firebase
              const minimalSettings: StoreSettings = {
                storeId,
                franchiseId: franchiseId || undefined,
                name: '',
                currency: 'BRL',
                taxId: '',
                taxPercentage: 0,
                firebaseConfig: {
                  apiKey: '',
                  authDomain: '',
                  projectId: '',
                  storageBucket: '',
                  messagingSenderId: '',
                  appId: '',
                },
              };
              setSettings(minimalSettings);
              setIsInitialized(true);
              console.log('[useStoreSettings] Minimal settings created, Firebase listeners will fetch real data');
            }
          }
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

  // Memoizar firebaseConfig key para evitar re-execuções do useEffect
  // (objetos mudam de referência a cada render mesmo com conteúdo igual)
  const firebaseConfigKey = useMemo(
    () => settings?.firebaseConfig ? JSON.stringify(settings.firebaseConfig) : null,
    [settings?.firebaseConfig]
  );

  /**
   * Listener para mudanças do Firebase (sync em background)
   * Escuta DOIS documentos:
   * 1. Documento principal da loja (dados gerenciados pelo Admin Web)
   * 2. Subcoleção settings/config (configs específicas do Kiosk)
   * 
   * ?? PROTEÇÃO: Só cria listeners se usuário estiver autenticado em modo franquia
   */
  useEffect(() => {
    if (!isInitialized || !settings?.storeId) return;

    // ?? Em modo franquia, verificar se usuário está autenticado antes de criar listeners
    if (isFranchiseMode()) {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) {
        console.log('[useStoreSettings] ?? Modo franquia sem autenticação - aguardando login para criar listeners');
        return;
      }
    }

    const unsubscribers: (() => void)[] = [];

    const setupFirebaseListeners = async () => {
      try {
        const db = getFirebaseDb();
        const storeId = settings.storeId || getCurrentStoreId();
        
        if (!storeId) {
          console.warn('[useStoreSettings] No storeId available for Firebase listeners');
          return;
        }

        // Determinar paths corretos baseado no modo
        let storeDocRef;
        let kioskConfigRef;
        
        // Tentar obter franchiseId de múltiplas fontes (settings tem prioridade)
        const franchiseId = settings.franchiseId || getCurrentFranchiseId();
        const isInFranchiseMode = isFranchiseMode();
        
        console.log('[useStoreSettings] Setting up Firebase listeners:', {
          storeId,
          franchiseId,
          isInFranchiseMode,
        });
        
        // Usar franchise path se franchiseId existir (independente do mode flag)
        if (franchiseId) {
          // Documento principal da loja (dados do Admin Web)
          storeDocRef = doc(db, 'franchises', franchiseId, 'stores', storeId);
          // Configs específicas do Kiosk
          kioskConfigRef = doc(db, 'franchises', franchiseId, 'stores', storeId, 'settings', 'config');
          console.log('[useStoreSettings] Using franchise path:', `franchises/${franchiseId}/stores/${storeId}`);
        } else {
          storeDocRef = doc(db, 'stores', storeId);
          kioskConfigRef = doc(db, 'stores', storeId, 'settings', 'config');
          console.log('[useStoreSettings] Using legacy path:', `stores/${storeId}`);
        }

        // Listener 1: Documento principal da loja (nome, taxId, taxPercentage, email, etc.)
        const unsubStore = onSnapshot(storeDocRef, (snapshot) => {
          if (snapshot.exists()) {
            const storeData = snapshot.data();
            console.log('[useStoreSettings] Store data updated from Admin Web');
            
            // Normaliza language do Admin Web (en-US ? en)
            const normalizeLanguage = (lang?: string): 'en' | 'pt-BR' | undefined => {
              if (!lang) return undefined;
              if (lang === 'en-US' || lang === 'en') return 'en';
              if (lang === 'pt-BR') return 'pt-BR';
              return undefined;
            };
            
            // Atualiza apenas os campos gerenciados pelo Admin Web
            setSettings(prev => {
              if (!prev) return prev;
              
              const updatedSettings: StoreSettings = {
                ...prev,
                // Campos do Admin Web
                name: storeData.name || prev.name,
                taxId: storeData.taxId || prev.taxId,
                taxPercentage: storeData.taxPercentage ?? prev.taxPercentage,
                currency: storeData.currency || prev.currency,
                // Novos campos do Admin Web
                email: storeData.email,
                phone: storeData.phone,
                address: storeData.address,
                description: storeData.description,
                // Language normalizado (en-US ? en)
                language: normalizeLanguage(storeData.language) ?? prev.language,
                // Timezone do Admin
                timezone: storeData.timezone,
              };
              
              // Salva em cache
              saveToLocalStorage(updatedSettings);
              saveToIndexedDB(updatedSettings);
              
              return updatedSettings;
            });
          }
        }, (error) => {
          console.error('[useStoreSettings] Store listener error:', error);
        });
        
        unsubscribers.push(unsubStore);

        // Listener 2: Configs específicas do Kiosk (ESP32, vídeo, printer, etc.)
        const unsubKiosk = onSnapshot(kioskConfigRef, (snapshot) => {
          if (snapshot.exists()) {
            const kioskConfig = snapshot.data() as Partial<StoreSettings>;
            console.log('[useStoreSettings] Kiosk config updated');
            
            // Atualiza apenas os campos específicos do Kiosk
            setSettings(prev => {
              if (!prev) return prev;
              
              const updatedSettings: StoreSettings = {
                ...prev,
                // Configs do Kiosk
                esp32AutoConnect: kioskConfig.esp32AutoConnect ?? prev.esp32AutoConnect,
                esp32ConnectionOrder: kioskConfig.esp32ConnectionOrder ?? prev.esp32ConnectionOrder,
                esp32HeartbeatIntervalMs: kioskConfig.esp32HeartbeatIntervalMs ?? prev.esp32HeartbeatIntervalMs,
                esp32LastWifiIp: kioskConfig.esp32LastWifiIp ?? prev.esp32LastWifiIp,
                drinkPickupTimeoutSeconds: kioskConfig.drinkPickupTimeoutSeconds ?? prev.drinkPickupTimeoutSeconds,
                drinkPickupSoundEnabled: kioskConfig.drinkPickupSoundEnabled ?? prev.drinkPickupSoundEnabled,
                useThermalPrinter: kioskConfig.useThermalPrinter ?? prev.useThermalPrinter,
                comPort: kioskConfig.comPort ?? prev.comPort,
                attractTimeoutSeconds: kioskConfig.attractTimeoutSeconds ?? prev.attractTimeoutSeconds,
                language: kioskConfig.language ?? prev.language,
              };
              
              // Salva em cache
              saveToLocalStorage(updatedSettings);
              saveToIndexedDB(updatedSettings);
              
              return updatedSettings;
            });
          }
        }, (error) => {
          console.error('[useStoreSettings] Kiosk config listener error:', error);
        });
        
        unsubscribers.push(unsubKiosk);
        
      } catch (error) {
        console.error('[useStoreSettings] Error setting up Firebase listeners:', error);
      }
    };

    setupFirebaseListeners();

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  // ?? FIX: Removido saveToLocalStorage e saveToIndexedDB das dependências
  // Esses callbacks são estáveis (useCallback sem deps mutáveis), mas causavam
  // re-execução desnecessária. O storeId é a única dependência que importa.
  }, [isInitialized, settings?.storeId, firebaseConfigKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Inicializa authService após Firebase estar pronto
        authService.initialize();
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


