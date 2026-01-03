
import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { getFirestore, Firestore, collection, doc, CollectionReference, DocumentReference } from 'firebase/firestore';
import { StoreSettings } from '@/types/store';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export const initializeFirebase = (settings: StoreSettings) => {
  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      app = existingApps[0];
      db = getFirestore(app);
      console.log('Firebase already initialized, reusing existing instance');
      return { app, db };
    }
    
    app = initializeApp(settings.firebaseConfig);
    db = getFirestore(app);
    console.log('Firebase initialized successfully');
    return { app, db };
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
};

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
 * Obter referência para uma subcollection de uma loja
 * Ex: stores/{storeId}/products
 * Fallback: se storeId for null, retorna collection raiz para compatibilidade
 */
export const getStoreCollection = (storeId: string | null, collectionName: string): CollectionReference => {
  const database = getFirebaseDb();
  if (!storeId) {
    console.warn(`[getStoreCollection] No storeId provided, using root collection: ${collectionName}`);
    return collection(database, collectionName);
  }
  return collection(database, 'stores', storeId, collectionName);
};

/**
 * Obter referência para um documento dentro de uma subcollection de loja
 * Ex: stores/{storeId}/products/{productId}
 * Fallback: se storeId for null, retorna doc da collection raiz para compatibilidade
 */
export const getStoreDoc = (storeId: string | null, collectionName: string, docId: string): DocumentReference => {
  const database = getFirebaseDb();
  if (!storeId) {
    console.warn(`[getStoreDoc] No storeId provided, using root collection: ${collectionName}/${docId}`);
    return doc(database, collectionName, docId);
  }
  return doc(database, 'stores', storeId, collectionName, docId);
};

/**
 * Construir path para subcollection de loja (para logs/debug)
 */
export const getStoreCollectionPath = (storeId: string, collectionName: string): string => {
  return `stores/${storeId}/${collectionName}`;
};

/**
 * Obter storeId do localStorage
 */
export const getCurrentStoreId = (): string | null => {
  try {
    const settings = localStorage.getItem('storeSettings');
    if (!settings) return null;
    const parsed = JSON.parse(settings);
    return parsed.storeId || null;
  } catch (error) {
    console.error('Error getting current store ID:', error);
    return null;
  }
};
