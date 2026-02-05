
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  CollectionReference,
  DocumentReference,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { StoreSettings } from '@/types/store';
import { storeSubPath, StoreSubcollection } from '@/lib/pathResolver';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let persistenceEnabled = false;

/**
 * Verifica se o firebaseConfig possui campos mÃ­nimos vÃ¡lidos
 */
export const hasValidFirebaseConfig = (config?: StoreSettings['firebaseConfig']): boolean => {
  return !!config?.apiKey && !!config?.projectId;
};

/**
 * Verifica se o Firebase jÃ¡ foi inicializado
 */
export const isFirebaseInitialized = (): boolean => {
  return getApps().length > 0;
};

/**
 * Inicializa Firebase a partir das variáveis de ambiente (.env)
 * Usado em modo franchise quando não há settings salvos localmente
 */
export const initializeFirebaseFromEnv = () => {
  const envConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  // Verifica se as variáveis existem
  if (!envConfig.apiKey || !envConfig.projectId) {
    console.error('[Firebase] Variáveis de ambiente não configuradas!');
    return null;
  }

  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      app = existingApps[0];
      db = getFirestore(app);
      auth = getAuth(app);
      console.log('[Firebase] Reusing existing instance (from env)');
      return { app, db, auth, persistenceEnabled };
    }

    app = initializeApp(envConfig);
    auth = getAuth(app);

    // Inicializa Firestore com cache persistente
    try {
      db = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
          cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        }),
      });
      persistenceEnabled = true;
      console.log('[Firebase] Initialized from env with persistent cache');
    } catch (persistError) {
      console.warn('[Firebase] Persistent cache failed, using default:', persistError);
      db = getFirestore(app);
    }

    return { app, db, auth, persistenceEnabled };
  } catch (error) {
    console.error('[Firebase] Init from env error:', error);
    return null;
  }
};

// Auto-inicializa quando variáveis de ambiente estão disponíveis
if (import.meta.env.VITE_FIREBASE_API_KEY) {
  console.log('[Firebase] Auto-initializing from env config...');
  initializeFirebaseFromEnv();
}

/**
 * Inicializa Firebase com suporte a cache offline persistente
 */
export const initializeFirebase = (settings: StoreSettings) => {
  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      app = existingApps[0];
      db = getFirestore(app);
      auth = getAuth(app);
      console.log('Firebase already initialized, reusing existing instance');
      return { app, db, auth, persistenceEnabled };
    }

    app = initializeApp(settings.firebaseConfig);

    // Inicializa Auth
    auth = getAuth(app);

    // Inicializa Firestore com cache persistente offline
    try {
      db = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
          cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        }),
      });
      persistenceEnabled = true;
      console.log('Firebase initialized with persistent offline cache');
    } catch (persistError) {
      // Fallback para Firestore padrão se persistência falhar
      console.warn('Persistent cache failed, using default Firestore:', persistError);
      db = getFirestore(app);
      persistenceEnabled = false;
    }

    console.log('Firebase initialized successfully, persistence:', persistenceEnabled);
    return { app, db, auth, persistenceEnabled };
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
};

/**
 * Verifica se a persistência offline está habilitada
 */
export const isPersistenceEnabled = (): boolean => persistenceEnabled;

export const getFirebaseDb = (): Firestore => {
  if (!db) {
    throw new Error('Firebase not initialized. Please complete store setup first.');
  }
  return db;
};

export const getFirebaseApp = (): FirebaseApp => {
  if (!app) {
    throw new Error('Firebase not initialized. Please complete store setup first.');
  }
  return app;
};

// ============================================
// Multi-Store Collection Helpers
// ============================================

/**
 * Obter franchiseId do localStorage (para modo franquia)
 * Tenta múltiplas fontes para maior compatibilidade entre Kiosk e Admin
 */
export const getCurrentFranchiseId = (): string | null => {
  try {
    // 1. Chave padronizada com Admin (preferida)
    const franchiseId = localStorage.getItem('open-kiosk-admin:selectedFranchise');
    if (franchiseId) return franchiseId;

    // 2. Tentar extrair de storeSettings (Kiosk)
    const storeSettingsStr = localStorage.getItem('storeSettings');
    if (storeSettingsStr) {
      try {
        const storeSettings = JSON.parse(storeSettingsStr);
        if (storeSettings.franchiseId) {
          // Sincroniza com chave padronizada para futuras consultas
          localStorage.setItem('open-kiosk-admin:selectedFranchise', storeSettings.franchiseId);
          return storeSettings.franchiseId;
        }
      } catch (parseError) {
        console.warn('[getCurrentFranchiseId] Error parsing storeSettings:', parseError);
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting current franchise ID:', error);
    return null;
  }
};

/**
 * Obter referência para uma subcollection de uma loja
 * Ex: franchises/{franchiseId}/stores/{storeId}/products
 */
export const getStoreCollection = (
  storeId: string | null,
  collectionName: string,
  franchiseIdOverride?: string
): CollectionReference => {
  const database = getFirebaseDb();
  if (!storeId) {
    throw new Error(`[getStoreCollection] storeId obrigatório para coleção ${collectionName}`);
  }

  // Usar pathResolver para determinar o path correto
  const franchiseId = franchiseIdOverride || getCurrentFranchiseId();
  if (!franchiseId) {
    throw new Error('[getStoreCollection] franchiseId obrigatório para coleções de loja');
  }
  const path = storeSubPath(franchiseId, storeId, collectionName as StoreSubcollection);

  console.log(`[getStoreCollection] Using path: ${path}`);
  return collection(database, path);
};

/**
 * Obter referência para um documento dentro de uma subcollection de loja
 * Ex: franchises/{franchiseId}/stores/{storeId}/products/{productId}
 */
export const getStoreDoc = (
  storeId: string | null,
  collectionName: string,
  docId: string,
  franchiseIdOverride?: string
): DocumentReference => {
  const database = getFirebaseDb();
  if (!storeId) {
    throw new Error(`[getStoreDoc] storeId obrigatório para documento ${collectionName}/${docId}`);
  }

  // Usar pathResolver para determinar o path correto
  const franchiseId = franchiseIdOverride || getCurrentFranchiseId();
  if (!franchiseId) {
    throw new Error('[getStoreDoc] franchiseId obrigatório para documentos de loja');
  }
  const path = storeSubPath(franchiseId, storeId, collectionName as StoreSubcollection);

  console.log(`[getStoreDoc] Using path: ${path}/${docId}`);
  return doc(database, `${path}/${docId}`);
};

/**
 * Obter storeId do localStorage
 * Tenta múltiplas chaves para compatibilidade
 */
export const getCurrentStoreId = (): string | null => {
  try {
    // 1. Chave nova padronizada com Admin (modo franquia)
    const newStoreId = localStorage.getItem('open-kiosk-admin:selectedStore');
    if (newStoreId) return newStoreId;

    // 2. Formato via storeSettings
    const settings = localStorage.getItem('storeSettings');
    if (settings) {
      const parsed = JSON.parse(settings);
      if (parsed.storeId) return parsed.storeId;
    }

    return null;
  } catch (error) {
    console.error('Error getting current store ID:', error);
    return null;
  }
};

/**
 * Obtém instância do Auth (para uso direto)
 * @throws Se Firebase não estiver inicializado
 */
export const getFirebaseAuth = (): Auth => {
  if (!auth) {
    throw new Error('Firebase not initialized. Please complete store setup first.');
  }
  return auth;
};

// Re-exportar instâncias para uso direto nos services
// Nota: Essas exportações podem ser null se Firebase não foi inicializado
export { db, auth };
