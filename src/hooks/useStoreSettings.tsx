



import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, type ReactNode } from 'react';



import { StoreSettings } from '@/types/store';



import { getApps } from 'firebase/app';



import { initializeFirebase, getFirebaseDb, getCurrentStoreId, getCurrentFranchiseId, getFirebaseAuth, hasValidFirebaseConfig, isFirebaseInitialized } from '@/services/firebase';



import { authService } from '@/services/authService';



import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';



import { cacheSet, cacheGet, ensureDBReady, STORES, CachedSettings } from '@/services/cacheService';



import { initNetworkListeners, startBackgroundSync, enqueueSync } from '@/services/syncService';



import { startAutoCleanup } from '@/services/cleanupService';



import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';



import { normalizePaymentGatewayConfigFromStore } from '@/config/paymentGateway';

import { normalizeStoreSettings } from '../../shared/utils/settingsNormalizer';







const SETTINGS_DOC_ID = 'store_settings';







// Singleton flags para evitar m�ltiplas inicializa��es



let servicesInitialized = false;



let initializationPromise: Promise<void> | null = null;











const useStoreSettingsCore = () => {



  const [settings, setSettings] = useState<StoreSettings | null>(null);



  const [isInitialized, setIsInitialized] = useState(false);



  const [loading, setLoading] = useState(true);



  const [isSyncing, setIsSyncing] = useState(false);

  // Permission-denied guard: evita retry infinito quando listeners falham
  const permissionDeniedRef = useRef({ store: false, kioskConfig: false, eventStats: false });







  /**



   * Carrega settings do localStorage (hot cache mais r�pido)



   */



  const loadFromLocalStorage = useCallback((): StoreSettings | null => {



    try {



      const savedSettings = localStorage.getItem('storeSettings');



      if (savedSettings) {



        const parsed = JSON.parse(savedSettings);
        // Garantir language default ao carregar de cache antigo
        if (!parsed.language) parsed.language = 'pt-BR';
        // 🔍 DIAG: verificar se localStorage contém attractVideoConfig
        console.warn('[useStoreSettings] localStorage attractVideoConfig:', JSON.stringify(parsed.attractVideoConfig ?? 'UNDEFINED'));
        return parsed;



      }



    } catch (error) {



      console.error('[useStoreSettings] Error loading from localStorage:', error);



    }



    return null;



  }, []);







  /**



   * Salva settings no localStorage



   * Inclui franchiseId automaticamente se dispon�vel



   */



  const saveToLocalStorage = useCallback((newSettings: StoreSettings) => {



    try {



      // Enriquecer com franchiseId se dispon�vel e n�o presente



      const enrichedSettings = { ...newSettings };



      if (!enrichedSettings.franchiseId) {



        const franchiseId = getCurrentFranchiseId();



        if (franchiseId) {



          enrichedSettings.franchiseId = franchiseId;



        }



      }



      localStorage.setItem('storeSettings', JSON.stringify(enrichedSettings));



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



   * Sincroniza settings com Firebase (background, n�o bloqueia UI)



   */



  const syncToFirebase = useCallback(async (newSettings: StoreSettings) => {



    if (!navigator.onLine) {



      console.log('[useStoreSettings] Offline, sync queued');



      try {



        const sanitizedSettings = sanitizeFirestoreData(newSettings) as StoreSettings;



        const { paymentGatewayConfig: _paymentGatewayConfig, ...offlinePayload } = sanitizedSettings;

        // Only queue device-level fields for offline sync (same filtering as online path)
        const deviceLevelOffline: Record<string, unknown> = {
          esp32AutoConnect: offlinePayload.esp32AutoConnect,
          esp32ConnectionOrder: offlinePayload.esp32ConnectionOrder,
          esp32HeartbeatIntervalMs: offlinePayload.esp32HeartbeatIntervalMs,
          esp32LastWifiIp: offlinePayload.esp32LastWifiIp,
          drinkPickupTimeoutSeconds: offlinePayload.drinkPickupTimeoutSeconds,
          drinkPickupSoundEnabled: offlinePayload.drinkPickupSoundEnabled,
        };

        for (const key of Object.keys(deviceLevelOffline)) {
          if (deviceLevelOffline[key] === undefined) {
            delete deviceLevelOffline[key];
          }
        }

        await enqueueSync('update', 'settings', 'config', {



          ...deviceLevelOffline,



          updatedAt: new Date(),



        });



      } catch (queueError) {



        console.error('[useStoreSettings] Error queueing sync:', queueError);



      }



      return;



    }







    setIsSyncing(true);



    try {



      if (!hasValidFirebaseConfig(newSettings.firebaseConfig) && !isFirebaseInitialized()) {



        console.warn('[useStoreSettings] Firebase config incompleto - sync abortado');



        return;



      }



      const db = getFirebaseDb();



      const storeId = newSettings.storeId || getCurrentStoreId();



      const franchiseId = newSettings.franchiseId || getCurrentFranchiseId();







      if (!storeId || !franchiseId) {



        console.warn('[useStoreSettings] storeId/franchiseId ausente para sync');



        return;



      }



      const settingsDocRef = doc(



        db,



        'franchises',



        franchiseId,



        'stores',



        storeId,



        'settings',



        'config'



      );







      const sanitizedSettings = sanitizeFirestoreData(newSettings) as StoreSettings;



      const { paymentGatewayConfig: _paymentGatewayConfig, ...syncPayload } = sanitizedSettings;

      // Only write device-level fields to settings/config.
      // Store-level fields (kioskEnabled, attractTimeoutSeconds, attractScreenEnabled,
      // language, attractVideoConfig) are now owned by Admin Web and written to the store doc.
      const deviceLevelPayload: Record<string, unknown> = {
        esp32AutoConnect: syncPayload.esp32AutoConnect,
        esp32ConnectionOrder: syncPayload.esp32ConnectionOrder,
        esp32HeartbeatIntervalMs: syncPayload.esp32HeartbeatIntervalMs,
        esp32LastWifiIp: syncPayload.esp32LastWifiIp,
        drinkPickupTimeoutSeconds: syncPayload.drinkPickupTimeoutSeconds,
        drinkPickupSoundEnabled: syncPayload.drinkPickupSoundEnabled,
      };

      // Remove undefined values so we don't overwrite with undefined
      for (const key of Object.keys(deviceLevelPayload)) {
        if (deviceLevelPayload[key] === undefined) {
          delete deviceLevelPayload[key];
        }
      }


      await setDoc(settingsDocRef, {



        ...deviceLevelPayload,



        updatedAt: serverTimestamp(),



      }, { merge: true });



      console.log('[useStoreSettings] Synced to Firebase');



    } catch (error) {



      console.error('[useStoreSettings] Error syncing to Firebase:', error);



    } finally {



      setIsSyncing(false);



    }



  }, []);







  /**



   * Inicializa servicos apenas uma vez (singleton)



   * Protegido contra HMR verificando getApps()



   */



  const initializeServicesOnce = useCallback(async (settingsData: StoreSettings) => {



    // Verificar se j� inicializado (flag OU Firebase j� existe - protege contra HMR)



    if (servicesInitialized || getApps().length > 0) {



      servicesInitialized = true; // Sincronizar flag caso Firebase j? exista



      return;



    }







    if (!hasValidFirebaseConfig(settingsData.firebaseConfig) && !isFirebaseInitialized()) {



      console.warn('[useStoreSettings] Firebase config incompleto - inicializa??o adiada');



      return;



    }







    servicesInitialized = true;



    try {



      initializeFirebase(settingsData);



      // Inicializa authService ap�s Firebase estar pronto



      authService.initialize();



      startBackgroundSync();



      startAutoCleanup();



    } catch (error) {



      console.error('[useStoreSettings] Services init error:', error);



      servicesInitialized = false; // Reset on error to allow retry



    }



  }, []);







  /**



   * Inicializa��o: carrega offline-first



   */



  useEffect(() => {



    // Evita inicializa��es paralelas



    if (initializationPromise) {



      initializationPromise.then(() => {



        // Apenas atualiza estado local ap�s init global



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







      // 2. Carrega do localStorage PRIMEIRO (hot cache, mais r�pido)



      const localSettings = loadFromLocalStorage();







      if (localSettings) {



        console.log('[useStoreSettings] Loaded from localStorage');



        setSettings(localSettings);



        setIsInitialized(true);







        // Inicializa servicos (singleton - so executa uma vez)



        await initializeServicesOnce(localSettings);



      } else {



        // 3. Fallback: tenta IndexedDB



        const idbSettings = await loadFromIndexedDB();



        if (idbSettings) {



          console.log('[useStoreSettings] Loaded from IndexedDB');



          setSettings(idbSettings);



          setIsInitialized(true);



          saveToLocalStorage(idbSettings);







          // Inicializa servicos (singleton - so executa uma vez)



          await initializeServicesOnce(idbSettings);



        } else {



          console.log('[useStoreSettings] No saved settings found');







          // 4. Criar settings minimos para ativar listeners Firebase (se possivel)



          const storeId = getCurrentStoreId();



          const franchiseId = getCurrentFranchiseId();







          console.log('[useStoreSettings] Criando settings minimos:', { storeId, franchiseId });







          if (storeId && franchiseId) {



            const minimalSettings: StoreSettings = {



              storeId,



              franchiseId,



              name: '',



              currency: 'BRL',



              language: 'pt-BR',



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



            saveToLocalStorage(minimalSettings);







            // Inicializa servicos (singleton - so executa uma vez)



            if (hasValidFirebaseConfig(minimalSettings.firebaseConfig) || isFirebaseInitialized()) {



              await initializeServicesOnce(minimalSettings);



            }



          } else {



            console.warn('[useStoreSettings] storeId/franchiseId ausente para settings minimos');



          }



        }



      }







      setLoading(false);



    };







    // Cria promise para sincroniza��o entre inst�ncias do hook



    initializationPromise = initializeSettings();



    initializationPromise.finally(() => {



      initializationPromise = null;



    });



  }, [loadFromLocalStorage, loadFromIndexedDB, saveToLocalStorage, initializeServicesOnce]);







  // (objetos mudam de refer�ncia a cada render mesmo com conte�do igual)



  const firebaseConfigKey = useMemo(



    () => settings?.firebaseConfig ? JSON.stringify(settings.firebaseConfig) : null,



    [settings?.firebaseConfig]



  );







  /**



   * Listener para mudan�as do Firebase (sync em background)



   * Escuta DOIS documentos:



   * 1. Documento principal da loja (dados gerenciados pelo Admin Web)



   * 2. Subcole��o settings/config (configs espec�ficas do Kiosk)



   * 



   * Protecao: so cria listeners se usuario estiver autenticado



   */



  useEffect(() => {



    if (!isInitialized || !settings?.storeId) return;







    if (!isFirebaseInitialized()) {



      console.warn('[useStoreSettings] Firebase n?o inicializado - listeners abortados');



      return;



    }







    const auth = getFirebaseAuth();



    if (!auth?.currentUser) {



      console.log('[useStoreSettings] Sem autenticacao - aguardando login para criar listeners');



      return;



    }

    // Permission-denied guard: se TODOS os listeners já falharam, não recriar
    if (permissionDeniedRef.current.store && permissionDeniedRef.current.kioskConfig) {
      console.warn('[useStoreSettings] Listeners bloqueados por permission-denied. Ignorando retry.');
      return;
    }



    const unsubscribers: (() => void)[] = [];







    const setupFirebaseListeners = async () => {



      try {



        const db = getFirebaseDb();



        const storeId = getCurrentStoreId() || settings.storeId;







        if (!storeId) {



          console.warn('[useStoreSettings] No storeId available for Firebase listeners');



          return;



        }







        // Determinar paths canonicos (franchise) — preferir slug centralizado



        const franchiseId = getCurrentFranchiseId() || settings.franchiseId;







        if (!franchiseId) {



          console.warn('[useStoreSettings] franchiseId ausente para listeners');



          return;



        }







        const storeDocRef = doc(db, 'franchises', franchiseId, 'stores', storeId);



        const kioskConfigRef = doc(db, 'franchises', franchiseId, 'stores', storeId, 'settings', 'config');



        console.log('[useStoreSettings] Using franchise path:', `franchises/${franchiseId}/stores/${storeId}`);







        // Listener 1: Documento principal da loja (nome, taxId, taxPercentage, email, etc.)



        const unsubStore = onSnapshot(storeDocRef, (snapshot) => {



          if (snapshot.exists()) {



            const storeData = snapshot.data();



            console.log('[useStoreSettings] Store data updated from Admin Web');







            // normalizeLanguage agora importado de shared/utils/settingsNormalizer







            // Atualiza apenas os campos gerenciados pelo Admin Web



            setSettings(prev => {



              if (!prev) return prev;







              const normalizedPaymentGatewayConfig = normalizePaymentGatewayConfigFromStore(



                storeData as Record<string, unknown>



              );







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



                // Language e kiosk settings agora resolvidos pelo normalizeStoreSettings abaixo



                // Timezone do Admin



                timezone: storeData.timezone,

                // ✅ Configuração de Torneiras
                taps: storeData.taps || prev.taps,
                tapsVersion: storeData.tapsVersion ?? prev.tapsVersion,
                tapsUpdatedAt: storeData.tapsUpdatedAt ?? prev.tapsUpdatedAt,
                tapsUpdatedBy: storeData.tapsUpdatedBy ?? prev.tapsUpdatedBy,

                // ✅ Reconciliação via settingsNormalizer (campos canônicos)
                ...(() => {
                  const normalized = normalizeStoreSettings(storeData);
                  // 🔍 DIAG: rastrear attractVideoConfig no fluxo Firestore
                  console.warn('[useStoreSettings] Firestore storeData.attractVideoConfig:', JSON.stringify(storeData.attractVideoConfig ?? 'UNDEFINED'));
                  console.warn('[useStoreSettings] normalized.attractVideoConfig:', JSON.stringify(normalized.attractVideoConfig ?? 'UNDEFINED'));
                  console.warn('[useStoreSettings] prev.attractVideoConfig:', JSON.stringify(prev.attractVideoConfig ?? 'UNDEFINED'));
                  return {
                    kioskEnabled: normalized.kioskEnabled ?? prev.kioskEnabled,
                    attractTimeoutSeconds: normalized.attractTimeoutSeconds ?? prev.attractTimeoutSeconds,
                    attractScreenEnabled: normalized.attractScreenEnabled ?? prev.attractScreenEnabled,
                    // Language: Firebase é fonte verdade. Se ausente no doc, default pt-BR.
                    language: normalized.language ?? prev.language ?? 'pt-BR',
                    attractVideoConfig: normalized.attractVideoConfig ?? prev.attractVideoConfig,
                  };
                })(),



                paymentGatewayConfig: normalizedPaymentGatewayConfig ?? undefined,

                // ✅ Preço Dinâmico (config global da loja)
                dynamicPricingConfig: storeData.dynamicPricingConfig ?? prev.dynamicPricingConfig,

              };







              // Salva em cache



              saveToLocalStorage(updatedSettings);



              saveToIndexedDB(updatedSettings);







              return updatedSettings;



            });



          }



        }, (error) => {
          console.error('[useStoreSettings] Store listener error:', error);
          // permission-denied: operador sem acesso — manter dados em cache, não limpar state
          if ((error as { code?: string })?.code === 'permission-denied') {
            permissionDeniedRef.current.store = true;
            console.warn('[useStoreSettings] Store listener: permission-denied. Keeping cached data. Retry bloqueado.');
          }
        });



        unsubscribers.push(unsubStore);







        // Listener 2: Configs espec�ficas do Kiosk (ESP32, v�deo, printer, etc.)



        const unsubKiosk = onSnapshot(kioskConfigRef, (snapshot) => {



          if (snapshot.exists()) {



            const kioskConfig = snapshot.data() as Partial<StoreSettings>;



            console.log('[useStoreSettings] Kiosk config updated');







            // Atualiza apenas os campos espec�ficos do Kiosk



            setSettings(prev => {



              if (!prev) return prev;







              const updatedSettings: StoreSettings = {



                ...prev,



                // Configs do Kiosk (apenas campos device-level)
                // NOTA: attractTimeoutSeconds, language, kioskEnabled são Admin-owned
                // e vêm pelo Listener 1 (store doc). NÃO ler daqui.



                esp32AutoConnect: kioskConfig.esp32AutoConnect ?? prev.esp32AutoConnect,



                esp32ConnectionOrder: kioskConfig.esp32ConnectionOrder ?? prev.esp32ConnectionOrder,



                esp32HeartbeatIntervalMs: kioskConfig.esp32HeartbeatIntervalMs ?? prev.esp32HeartbeatIntervalMs,



                esp32LastWifiIp: kioskConfig.esp32LastWifiIp ?? prev.esp32LastWifiIp,



                drinkPickupTimeoutSeconds: kioskConfig.drinkPickupTimeoutSeconds ?? prev.drinkPickupTimeoutSeconds,



                drinkPickupSoundEnabled: kioskConfig.drinkPickupSoundEnabled ?? prev.drinkPickupSoundEnabled,



              };







              // Salva em cache



              saveToLocalStorage(updatedSettings);



              saveToIndexedDB(updatedSettings);







              return updatedSettings;



            });



          }



        }, (error) => {
          console.error('[useStoreSettings] Kiosk config listener error:', error);
          // permission-denied: operador sem write — silent, dados vêm do Listener 1
          if ((error as { code?: string })?.code === 'permission-denied') {
            permissionDeniedRef.current.kioskConfig = true;
            console.warn('[useStoreSettings] Kiosk config: permission-denied (expected for operator role). Retry bloqueado.');
          }
        });



        unsubscribers.push(unsubKiosk);

        // Listener 3: EventStats (modo evento → ativação de DP)
        const eventStatsDocPath = `franchises/${franchiseId}/stores/${storeId}/eventStats/current`;
        const eventStatsDocRef = doc(db, eventStatsDocPath);
        const unsubEventStats = onSnapshot(eventStatsDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const esData = docSnap.data();
            const eventMode = esData?.eventMode;
            if (eventMode) {
              setSettings((prev) => {
                if (!prev) return prev; // 🔧 FIX: Não fazer spread de null
                return {
                  ...prev,
                  eventMode: {
                    enabled: !!eventMode.enabled,
                    label: eventMode.label || '',
                    endsAt: eventMode.endsAt?.toDate?.() || null,
                    activateDynamicPricing: !!eventMode.activateDynamicPricing,
                  },
                };
              });
            }
          }
        }, (error) => {
          // EventStats listener is non-critical — log and continue
          console.warn('[useStoreSettings] eventStats listener error (non-critical):', error);
        });
        unsubscribers.push(unsubEventStats);

      } catch (error) {



        console.error('[useStoreSettings] Error setting up Firebase listeners:', error);



      }



    };







    setupFirebaseListeners();







    return () => {



      unsubscribers.forEach(unsub => unsub());



    };



  }, [isInitialized, settings?.storeId, settings?.franchiseId, firebaseConfigKey]);

  // Reset permission-denied flags quando store/franchise mudar (novas credentials podem aplicar)
  useEffect(() => {
    permissionDeniedRef.current = { store: false, kioskConfig: false, eventStats: false };
  }, [settings?.storeId, settings?.franchiseId]);







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







    // Inicializa servicos (singleton - so executa uma vez)



    if (!servicesInitialized) {



      try {

        if (hasValidFirebaseConfig(newSettings.firebaseConfig) || isFirebaseInitialized()) {

          initializeFirebase(newSettings);



          // Inicializa authService ap?s Firebase estar pronto

          authService.initialize();



          startBackgroundSync();



          startAutoCleanup();



          servicesInitialized = true;

        } else {

          console.warn('[useStoreSettings] Firebase config incompleto - init ignorada');

        }

      } catch (error) {



        console.error('[useStoreSettings] Firebase init error:', error);



      }



    }







    // 5. Sync para Firebase em background (n�o bloqueia)



    syncToFirebase(newSettings);



  }, [saveToLocalStorage, saveToIndexedDB, syncToFirebase]);







  /**



   * Reset completo da loja



   */



  const resetStore = useCallback(() => {



    localStorage.removeItem('storeSettings');



    localStorage.removeItem('settingsUpdatedAt');



    setSettings(null);



    setIsInitialized(false);



    servicesInitialized = false;



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

// ============================================
// Context / Provider Singleton
// Evita 30 listeners duplicados (10 instâncias × 3 listeners)
// ============================================

interface StoreSettingsContextType {
  settings: StoreSettings | null;
  isInitialized: boolean;
  loading: boolean;
  isSyncing: boolean;
  updateSettings: (newSettings: StoreSettings) => void;
  resetStore: () => void;
}

const StoreSettingsContext = createContext<StoreSettingsContextType | null>(null);

export const StoreSettingsProvider = ({ children }: { children: ReactNode }) => {
  const value = useStoreSettingsCore();
  return (
    <StoreSettingsContext.Provider value={value}>
      {children}
    </StoreSettingsContext.Provider>
  );
};

export const useStoreSettings = (): StoreSettingsContextType => {
  const ctx = useContext(StoreSettingsContext);
  if (!ctx) {
    throw new Error(
      '[useStoreSettings] Must be used within <StoreSettingsProvider>. ' +
      'Wrap your app with <StoreSettingsProvider>.'
    );
  }
  return ctx;
};














