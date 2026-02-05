import { getFirebaseDb, getCurrentStoreId, getCurrentFranchiseId } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { Store } from '@/types/store';
import { storePath, storesPath } from '@/lib/pathResolver';
import { sanitizeFirestoreData } from '@/utils/firestoreSanitize';

// ============================================
// Store Service - Store management
// ============================================

class StoreService {
  /**
   * Get current storeId from local storage
   */
  getCurrentStoreId(): string | null {
    return getCurrentStoreId();
  }

  private requireFranchiseId(): string {
    const franchiseId = getCurrentFranchiseId();
    if (!franchiseId) {
      throw new Error('[StoreService] franchiseId required for store operations');
    }
    return franchiseId;
  }

  private normalizeStoreData(data: Record<string, unknown>): Store {
    const normalizeTimestamp = (value: unknown): Date | string | undefined => {
      if (!value) return undefined;
      if (value instanceof Date) return value;
      if (typeof value === 'string') return value;
      if ((value as { toDate?: () => Date }).toDate) {
        return (value as { toDate: () => Date }).toDate();
      }
      return undefined;
    };

    return {
      ...(data as Store),
      createdAt: normalizeTimestamp((data as { createdAt?: unknown }).createdAt),
      updatedAt: normalizeTimestamp((data as { updatedAt?: unknown }).updatedAt),
    };
  }

  /**
   * Validate that store exists and has data
   */
  async validateStoreExists(storeId: string): Promise<boolean> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storeDoc = doc(db, storePath(franchiseId, storeId));
      const snapshot = await getDoc(storeDoc);

      const data = snapshot.data();
      const hasValidData = data && Object.keys(data).length > 0 && data.storeId;

      return snapshot.exists() && !!hasValidData;
    } catch (error) {
      console.error('[StoreService] Error validating store:', error);
      return false;
    }
  }

  /**
   * Get full store data.
   * If the document is empty, try to recover from local storage.
   */
  async getStore(storeId: string): Promise<Store | null> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const path = storePath(franchiseId, storeId);
      console.log('[StoreService] Using path:', path);

      const storeDoc = doc(db, path);
      const snapshot = await getDoc(storeDoc);

      const data = snapshot.data();
      const hasValidData = data && Object.keys(data).length > 0 && (data.storeId || data.name);

      if (!snapshot.exists() || !hasValidData) {
        console.warn(`[StoreService] Store ${storeId} not found or empty - attempting recovery`);

        const recovered = await this.recoverStoreFromLocalStorage(storeId);
        if (recovered) {
          return recovered;
        }

        console.warn(`[StoreService] Could not recover store ${storeId}`);
        return null;
      }

      const normalized = this.normalizeStoreData(data as Record<string, unknown>);
      return { id: snapshot.id, ...normalized } as Store;
    } catch (error: any) {
      if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
        console.warn('[StoreService] Permission denied, trying cache fallback');
        return await this.recoverStoreFromLocalStorage(storeId);
      }
      console.error('[StoreService] Error fetching store:', error);
      throw error;
    }
  }

  /**
   * Recover store data from local storage and write it to Firestore.
   */
  private async recoverStoreFromLocalStorage(storeId: string): Promise<Store | null> {
    try {
      const localSettings = localStorage.getItem('storeSettings');
      if (!localSettings) {
        console.log('[StoreService] No localStorage settings available for recovery');
        return null;
      }

      const parsed = JSON.parse(localSettings);
      if (parsed.storeId !== storeId) {
        console.log(`[StoreService] localStorage storeId (${parsed.storeId}) does not match requested (${storeId})`);
        return null;
      }

      if (!parsed.name) {
        console.log('[StoreService] localStorage missing required field: name');
        return null;
      }

      console.log('[StoreService] Recovering store from localStorage...');

      await this.ensureStoreExists(
        storeId,
        parsed.name,
        parsed.currency || 'BRL',
        parsed.taxId || '',
        parsed.taxPercentage || 0
      );

      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storeDoc = doc(db, storePath(franchiseId, storeId));
      const newSnapshot = await getDoc(storeDoc);

      if (newSnapshot.exists() && newSnapshot.data()?.storeId) {
        console.log('[StoreService] Store recovered successfully from localStorage');
        return { id: newSnapshot.id, ...newSnapshot.data() } as Store;
      }

      return null;
    } catch (recoveryError) {
      console.error('[StoreService] Recovery failed:', recoveryError);
      return null;
    }
  }

  /**
   * Create a new store document.
   */
  async createStore(store: Omit<Store, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storeRef = doc(db, storePath(franchiseId, store.storeId));

      const exists = await getDoc(storeRef);
      if (exists.exists()) {
        console.log(`[StoreService] Store ${store.storeId} already exists, updating...`);
          const sanitizedStore = sanitizeFirestoreData(store) as Store;
          await updateDoc(storeRef, {
            ...sanitizedStore,
            updatedAt: serverTimestamp(),
          });
          return store.storeId;
        }

        const sanitizedStore = sanitizeFirestoreData(store) as Store;
        await setDoc(storeRef, {
          ...sanitizedStore,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

      const settingsRef = doc(db, storePath(franchiseId, store.storeId), 'settings', 'general');
      await setDoc(settingsRef, {
        currency: store.currency,
        language: store.language || 'pt-BR',
        createdAt: serverTimestamp(),
      });

      console.log('[StoreService] Store created:', store.storeId);
      return store.storeId;
    } catch (error) {
      console.error('[StoreService] Error creating store:', error);
      throw error;
    }
  }

  /**
   * Update store data.
   */
  async updateStore(storeId: string, updates: Partial<Store>): Promise<void> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storeRef = doc(db, storePath(franchiseId, storeId));

        const sanitizedUpdates = sanitizeFirestoreData(updates) as typeof updates;
        await updateDoc(storeRef, {
          ...sanitizedUpdates,
          updatedAt: serverTimestamp(),
        });

      console.log('[StoreService] Store updated:', storeId);
    } catch (error) {
      console.error('[StoreService] Error updating store:', error);
      throw error;
    }
  }

  /**
   * List all stores for the current franchise.
   */
  async getAllStores(): Promise<Store[]> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storesCollection = collection(db, storesPath(franchiseId));
      const snapshot = await getDocs(storesCollection);

      return snapshot.docs.map((storeDoc) => {
        const normalized = this.normalizeStoreData(storeDoc.data() as Record<string, unknown>);
        return {
          id: storeDoc.id,
          ...normalized,
        };
      }) as Store[];
    } catch (error) {
      console.error('[StoreService] Error fetching stores:', error);
      throw error;
    }
  }

  /**
   * List only active stores.
   */
  async getActiveStores(): Promise<Store[]> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const storesCollection = collection(db, storesPath(franchiseId));
      const q = query(storesCollection, where('isActive', '==', true));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((storeDoc) => {
        const normalized = this.normalizeStoreData(storeDoc.data() as Record<string, unknown>);
        return {
          id: storeDoc.id,
          ...normalized,
        };
      }) as Store[];
    } catch (error) {
      console.error('[StoreService] Error fetching active stores:', error);
      throw error;
    }
  }

  /**
   * Create or populate store document from local settings.
   */
  async ensureStoreExists(storeId: string, name: string, currency: string, taxId: string, taxPercentage: number): Promise<void> {
    try {
      const db = getFirebaseDb();
      const franchiseId = this.requireFranchiseId();
      const path = storePath(franchiseId, storeId);
      console.log('[StoreService] ensureStoreExists using path:', path);

      const storeRef = doc(db, path);
      const snapshot = await getDoc(storeRef);

      const data = snapshot.data();
      const hasValidData = data && Object.keys(data).length > 0 && data.storeId;

      if (!snapshot.exists() || !hasValidData) {
        console.log(`[StoreService] Creating/populating store document: ${storeId}`);

        await setDoc(
          storeRef,
          {
            storeId,
            name,
            slug: storeId,
            isActive: true,
            currency,
            taxId,
            taxPercentage,
            useThermalPrinter: false,
            attractTimeoutSeconds: 60,
            language: 'pt-BR',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        console.log('[StoreService] Store document created/populated:', storeId);
      } else {
        console.log('[StoreService] Store already exists with valid data:', storeId);
      }
    } catch (error) {
      console.error('[StoreService] Error ensuring store exists:', error);
      throw error;
    }
  }
}

export const storeService = new StoreService();
