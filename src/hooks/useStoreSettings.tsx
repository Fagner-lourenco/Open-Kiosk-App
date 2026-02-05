

import { useState, useEffect, useCallback, useMemo } from 'react';

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

        const sanitizedSettings = sanitizeFirestoreData(newSettings) as StoreSettings;

        const { paymentGatewayConfig: _paymentGatewayConfig, ...offlinePayload } = sanitizedSettings;

        await enqueueSync('update', 'settings', 'config', {

          ...offlinePayload,

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



      await setDoc(settingsDocRef, {

        ...syncPayload,

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

    // Verificar se já inicializado (flag OU Firebase já existe - protege contra HMR)

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



    // Cria promise para sincronização entre instâncias do hook

    initializationPromise = initializeSettings();

    initializationPromise.finally(() => {

      initializationPromise = null;

    });

  }, [loadFromLocalStorage, loadFromIndexedDB, saveToLocalStorage, initializeServicesOnce]);



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





    const unsubscribers: (() => void)[] = [];



    const setupFirebaseListeners = async () => {

      try {

        const db = getFirebaseDb();

        const storeId = settings.storeId || getCurrentStoreId();

        

        if (!storeId) {

          console.warn('[useStoreSettings] No storeId available for Firebase listeners');

          return;

        }



        // Determinar paths canonicos (franchise)

        const franchiseId = settings.franchiseId || getCurrentFranchiseId();



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

                // Language normalizado (en-US ? en)

                language: normalizeLanguage(storeData.language) ?? prev.language,

                // Timezone do Admin

                timezone: storeData.timezone,

                paymentGatewayConfig: normalizedPaymentGatewayConfig ?? undefined,

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

  }, [isInitialized, settings?.storeId, firebaseConfigKey]);



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

    

    // 5. Sync para Firebase em background (não bloqueia)

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







