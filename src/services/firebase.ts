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
import { getStoredKioskBootstrapSnapshot } from '@/services/kioskBootstrapService';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let persistenceEnabled = false;

const KIOSK_ROUTE_PREFIXES = ['#/shop', '#/checkout', '#/payment', '#/attract'] as const;
export const KIOSK_SELECTED_FRANCHISE_KEY = 'open-kiosk:selectedFranchise';
export const KIOSK_SELECTED_STORE_KEY = 'open-kiosk:selectedStore';
const ADMIN_SELECTED_FRANCHISE_KEY = 'open-kiosk-admin:selectedFranchise';
const ADMIN_SELECTED_STORE_KEY = 'open-kiosk-admin:selectedStore';
const LEGACY_SELECTED_FRANCHISE_KEY = 'selectedFranchiseId';
const LEGACY_SELECTED_STORE_KEY = 'currentStoreId';

type StoredSelectionContext = {
  storeId: string | null;
  franchiseId: string | null;
};

const getStoredSelectionContext = (): StoredSelectionContext => {
  const bootstrap = getStoredKioskBootstrapSnapshot();
  const storeSettingsStr = localStorage.getItem('storeSettings');
  if (!storeSettingsStr) {
    return {
      storeId: bootstrap?.storeId || null,
      franchiseId: bootstrap?.franchiseId || null,
    };
  }

  try {
    const storeSettings = JSON.parse(storeSettingsStr) as {
      storeId?: string;
      franchiseId?: string;
    };

    return {
      storeId: storeSettings.storeId || bootstrap?.storeId || null,
      franchiseId: storeSettings.franchiseId || bootstrap?.franchiseId || null,
    };
  } catch (parseError) {
    console.warn('[firebase] Error parsing storeSettings:', parseError);
    return {
      storeId: bootstrap?.storeId || null,
      franchiseId: bootstrap?.franchiseId || null,
    };
  }
};

const isKioskRuntimeRoute = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const hash = window.location.hash || '';
  return hash === '' ||
    hash === '#/' ||
    KIOSK_ROUTE_PREFIXES.some(prefix => hash.startsWith(prefix));
};

const readStorageValue = (key: string): string | null => {
  const value = localStorage.getItem(key);
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue || null;
};

export const setKioskSelectedFranchiseId = (franchiseId: string | null): void => {
  if (franchiseId) {
    localStorage.setItem(KIOSK_SELECTED_FRANCHISE_KEY, franchiseId);
    return;
  }

  localStorage.removeItem(KIOSK_SELECTED_FRANCHISE_KEY);
};

export const setKioskSelectedStoreId = (storeId: string | null): void => {
  if (storeId) {
    localStorage.setItem(KIOSK_SELECTED_STORE_KEY, storeId);
    return;
  }

  localStorage.removeItem(KIOSK_SELECTED_STORE_KEY);
};

export const syncKioskSelectionFromStoreSettings = (): void => {
  const storedSettings = getStoredSelectionContext();

  if (storedSettings.franchiseId) {
    setKioskSelectedFranchiseId(storedSettings.franchiseId);
  }

  if (storedSettings.storeId) {
    setKioskSelectedStoreId(storedSettings.storeId);
  }
};

/**
 * Verifica se o firebaseConfig possui campos minimos validos
 */
export const hasValidFirebaseConfig = (config?: StoreSettings['firebaseConfig']): boolean => {
  return !!config?.apiKey && !!config?.projectId;
};

/**
 * Verifica se o Firebase ja foi inicializado
 */
export const isFirebaseInitialized = (): boolean => {
  return getApps().length > 0;
};

/**
 * Inicializa Firebase a partir das variaveis de ambiente (.env)
 * Usado em modo franchise quando nao ha settings salvos localmente
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

  if (!envConfig.apiKey || !envConfig.projectId) {
    console.error('[Firebase] Variaveis de ambiente nao configuradas!');
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
    auth = getAuth(app);

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
 * Verifica se a persistencia offline esta habilitada
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
 * Obter franchiseId do contexto atual.
 * Em rotas de kiosk, prioriza o storeSettings local para evitar herdar
 * selecoes antigas do Admin salvas no mesmo WebView.
 */
export const getCurrentFranchiseId = (): string | null => {
  try {
    const kioskSelectedFranchiseId = readStorageValue(KIOSK_SELECTED_FRANCHISE_KEY);
    const selectedFranchiseId = readStorageValue(ADMIN_SELECTED_FRANCHISE_KEY);
    const legacyFranchiseId = readStorageValue(LEGACY_SELECTED_FRANCHISE_KEY);
    const storedSettings = getStoredSelectionContext();

    if (isKioskRuntimeRoute()) {
      return storedSettings.franchiseId || kioskSelectedFranchiseId || legacyFranchiseId || selectedFranchiseId || null;
    }

    return kioskSelectedFranchiseId || storedSettings.franchiseId || legacyFranchiseId || selectedFranchiseId || null;
  } catch (error) {
    console.error('Error getting current franchise ID:', error);
    return null;
  }
};

/**
 * Obter referencia para uma subcollection de uma loja
 * Ex: franchises/{franchiseId}/stores/{storeId}/products
 */
export const getStoreCollection = (
  storeId: string | null,
  collectionName: string,
  franchiseIdOverride?: string
): CollectionReference => {
  const database = getFirebaseDb();
  if (!storeId) {
    throw new Error(`[getStoreCollection] storeId obrigatorio para colecao ${collectionName}`);
  }

  const franchiseId = franchiseIdOverride || getCurrentFranchiseId();
  if (!franchiseId) {
    throw new Error('[getStoreCollection] franchiseId obrigatorio para colecoes de loja');
  }

  const path = storeSubPath(franchiseId, storeId, collectionName as StoreSubcollection);
  console.log(`[getStoreCollection] Using path: ${path}`);
  return collection(database, path);
};

/**
 * Obter referencia para um documento dentro de uma subcollection de loja
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
    throw new Error(`[getStoreDoc] storeId obrigatorio para documento ${collectionName}/${docId}`);
  }

  const franchiseId = franchiseIdOverride || getCurrentFranchiseId();
  if (!franchiseId) {
    throw new Error('[getStoreDoc] franchiseId obrigatorio para documentos de loja');
  }

  const path = storeSubPath(franchiseId, storeId, collectionName as StoreSubcollection);
  console.log(`[getStoreDoc] Using path: ${path}/${docId}`);
  return doc(database, `${path}/${docId}`);
};

/**
 * Obter storeId do contexto atual.
 * Em rotas de kiosk, prioriza o storeSettings local para evitar herdar
 * selecoes antigas do Admin salvas no mesmo WebView.
 */
export const getCurrentStoreId = (): string | null => {
  try {
    const kioskSelectedStoreId = readStorageValue(KIOSK_SELECTED_STORE_KEY);
    const selectedStoreId = readStorageValue(ADMIN_SELECTED_STORE_KEY);
    const legacyStoreId = readStorageValue(LEGACY_SELECTED_STORE_KEY);
    const storedSettings = getStoredSelectionContext();

    if (isKioskRuntimeRoute()) {
      return storedSettings.storeId || kioskSelectedStoreId || legacyStoreId || selectedStoreId || null;
    }

    return kioskSelectedStoreId || storedSettings.storeId || legacyStoreId || selectedStoreId || null;
  } catch (error) {
    console.error('Error getting current store ID:', error);
    return null;
  }
};

/**
 * Obtem instancia do Auth (para uso direto)
 * @throws Se Firebase nao estiver inicializado
 */
export const getFirebaseAuth = (): Auth => {
  if (!auth) {
    throw new Error('Firebase not initialized. Please complete store setup first.');
  }
  return auth;
};

export { db, auth };
